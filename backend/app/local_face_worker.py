#!/usr/bin/env python3
"""Local Face Recognition Worker for Smart Attendance Kiosk.

Runs on the local machine (Mac) on port 8009 to provide ultra-fast, local face
detection and recognition against local picture/{department}/ photos.
This eliminates the need to upload heavy camera frames over internet tunnels to
remote/Windows backends for face matching.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import numpy as np

# Ensure backend root is on sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent.parent
PROJECT_ROOT = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

try:
    import cv2
except ImportError:
    cv2 = None

from app.services.face_service import compute_similarity, get_face_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] local_face_worker: %(message)s")
logger = logging.getLogger("local_face_worker")

PORT = int(os.environ.get("LOCAL_FACE_PORT", 8009))
PICTURE_ROOT = PROJECT_ROOT / "picture"

# Cache of pre-computed embeddings: { dept: { roll: [embedding1, embedding2, ...] } }
_GALLERY_CACHE: dict[str, dict[str, list[np.ndarray]]] = {}
_LAST_CACHE_UPDATE: dict[str, float] = {}


def _load_department_gallery(department: str) -> dict[str, list[np.ndarray]]:
    """Scan picture/{department}/ and compute/cache embeddings for all student photos."""
    dept = department.strip().upper()
    dept_dir = PICTURE_ROOT / dept
    if not dept_dir.is_dir():
        # Fallback to case-insensitive match
        for d in PICTURE_ROOT.iterdir():
            if d.is_dir() and d.name.upper() == dept:
                dept_dir = d
                break

    if not dept_dir.is_dir():
        return {}

    face_svc = get_face_service()
    gallery: dict[str, list[np.ndarray]] = {}

    image_extensions = {".jpg", ".jpeg", ".png", ".webp"}
    for p in sorted(dept_dir.iterdir()):
        if not p.is_file() or p.suffix.lower() not in image_extensions:
            continue

        filename = p.stem  # e.g. "2207039" or "2207039_look_straight"
        # Extract roll from filename: everything before the first underscore, or whole stem if no underscore
        roll = filename.split("_")[0].strip()
        if not roll:
            continue

        try:
            emb = face_svc.extract_embedding(p)
            if emb is not None and getattr(emb, "ndim", 0) == 1 and len(emb) >= 2:
                norm_emb = np.asarray(emb, dtype=np.float32)
                gallery.setdefault(roll, []).append(norm_emb)
        except Exception as exc:
            logger.warning("Could not extract embedding for %s: %s", p.name, exc)

    _GALLERY_CACHE[dept] = gallery
    _LAST_CACHE_UPDATE[dept] = time.time()
    logger.info("Loaded gallery for %s: %d students, %d total sample embeddings.",
                dept, len(gallery), sum(len(v) for v in gallery.values()))
    return gallery


def get_cached_gallery(department: str) -> dict[str, list[np.ndarray]]:
    dept = department.strip().upper()
    now = time.time()
    # Refresh cache if missing or older than 60 seconds
    if dept not in _GALLERY_CACHE or (now - _LAST_CACHE_UPDATE.get(dept, 0)) > 60:
        return _load_department_gallery(dept)
    return _GALLERY_CACHE[dept]


def decode_image(payload: dict) -> np.ndarray | None:
    """Decode image from base64 string or binary bytes."""
    b64_str = payload.get("image_base64") or payload.get("image") or ""
    if not b64_str:
        return None

    if "," in b64_str:
        b64_str = b64_str.split(",", 1)[1]

    try:
        data = base64.b64decode(b64_str)
        arr = np.frombuffer(data, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return img
    except Exception as exc:
        logger.warning("Failed decoding image: %s", exc)
        return None


class LocalFaceHandler(BaseHTTPRequestHandler):
    """HTTP request handler for local face detection and recognition."""

    def _send_json(self, status: int, data: dict[str, Any]) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send_json(200, {
                "status": "ok",
                "cached_depts": list(_GALLERY_CACHE.keys()),
                "counts": {d: len(g) for d, g in _GALLERY_CACHE.items()}
            })
            return
        self._send_json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(length) if length > 0 else b"{}"
        try:
            payload = json.loads(raw_body.decode("utf-8")) if raw_body else {}
        except Exception:
            payload = {}

        path = self.path.split("?")[0]

        if path == "/sync":
            dept = (payload.get("department") or "CSE").strip().upper()
            gallery = _load_department_gallery(dept)
            self._send_json(200, {
                "success": True,
                "department": dept,
                "students_count": len(gallery),
                "samples_count": sum(len(v) for v in gallery.values()),
            })
            return

        if path == "/liveness":
            # Quick local liveness / human face check
            img = decode_image(payload)
            if img is None:
                self._send_json(400, {"human": False, "liveness": False, "message": "No valid image"})
                return

            face_svc = get_face_service()
            try:
                faces = face_svc.detect_faces(img)
                has_human = len(faces) > 0
                self._send_json(200, {
                    "human": has_human,
                    "liveness": has_human,
                    "face_count": len(faces),
                    "message": "Face detected" if has_human else "No face detected"
                })
            except Exception as exc:
                self._send_json(200, {"human": False, "liveness": False, "message": str(exc)})
            return

        if path == "/scan":
            dept = (payload.get("department") or payload.get("kiosk_id") or "CSE").strip().upper()
            threshold = float(payload.get("threshold", 0.42))
            img = decode_image(payload)
            if img is None:
                self._send_json(400, {
                    "matched": False,
                    "similarity": None,
                    "message": "Invalid or missing image"
                })
                return

            face_svc = get_face_service()
            gallery = get_cached_gallery(dept)
            if not gallery:
                # Try reloading once
                gallery = _load_department_gallery(dept)

            if not gallery:
                self._send_json(200, {
                    "matched": False,
                    "similarity": None,
                    "message": f"No student photos found in local picture/{dept} folder"
                })
                return

            t_start = time.time()
            query_faces = face_svc.extract_all_faces(img)
            query_embs = [
                f["embedding"] for f in query_faces
                if f.get("embedding") is not None and getattr(f["embedding"], "ndim", 0) == 1
            ]

            if not query_embs:
                self._send_json(200, {
                    "matched": False,
                    "similarity": None,
                    "message": "No human face detected in camera frame"
                })
                return

            matched_students: dict[str, dict] = {}
            for q_emb in query_embs:
                best_roll = None
                best_sim = -1.0
                for roll, stored_embs in gallery.items():
                    for s_emb in stored_embs:
                        sim = float(compute_similarity(q_emb, s_emb))
                        if sim > best_sim:
                            best_sim = sim
                            best_roll = roll

                if best_roll is not None and best_sim >= threshold:
                    if best_roll not in matched_students or best_sim > matched_students[best_roll]["similarity"]:
                        matched_students[best_roll] = {
                            "roll": best_roll,
                            "similarity": round(best_sim, 4),
                            "similarity_percent": round(max(0.0, best_sim) * 100, 2),
                        }

            t_elapsed = time.time() - t_start
            logger.info("Local scan finished in %.3fs. Detected %d faces, matched: %s",
                        t_elapsed, len(query_embs), list(matched_students.keys()))

            if matched_students:
                students_list = sorted(matched_students.values(), key=lambda s: s["similarity"], reverse=True)
                top = students_list[0]
                self._send_json(200, {
                    "matched": True,
                    "similarity": top["similarity"],
                    "similarity_percent": top["similarity_percent"],
                    "threshold": threshold,
                    "matched_rolls": [s["roll"] for s in students_list],
                    "students": students_list,
                    "elapsed_sec": round(t_elapsed, 4),
                    "local": True,
                })
            else:
                self._send_json(200, {
                    "matched": False,
                    "similarity": None,
                    "threshold": threshold,
                    "message": "Face Not Recognized. Please show your QR code",
                    "elapsed_sec": round(t_elapsed, 4),
                    "local": True,
                })
            return

        self._send_json(404, {"error": "Endpoint not found"})

    def log_message(self, format: str, *args: Any) -> None:
        # Suppress noisy standard HTTP access logs
        return


def run_server() -> None:
    logger.info("Starting Local Face Worker on 127.0.0.1:%d...", PORT)
    # Warmup face service and pre-load CSE gallery
    try:
        svc = get_face_service()
        svc.warmup()
        _load_department_gallery("CSE")
    except Exception as exc:
        logger.warning("Initial gallery warmup notice: %s", exc)

    server = ThreadingHTTPServer(("127.0.0.1", PORT), LocalFaceHandler)
    logger.info("Local Face Worker running at http://127.0.0.1:%d", PORT)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down Local Face Worker...")
    finally:
        server.server_close()


if __name__ == "__main__":
    run_server()
