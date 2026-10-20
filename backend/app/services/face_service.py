"""Face Embedding and Recognition Service using InsightFace ArcFace model.

- Model: InsightFace ArcFace (512-dimensional embedding vector)
- Input: Image file path, raw bytes, or numpy ndarray
- Output: 512-d float numpy vector (embedding)
- Cosine similarity comparison with default threshold 0.55
"""
from __future__ import annotations

import io
import hashlib
import logging
import time
from collections import OrderedDict
from threading import Lock
from pathlib import Path
from typing import Sequence, Union

import numpy as np

try:
    import cv2
except ImportError:
    cv2 = None

try:
    from insightface.app import FaceAnalysis
except ImportError:
    FaceAnalysis = None

try:
    import mediapipe as mp
except ImportError:
    mp = None

logger = logging.getLogger(__name__)

DEFAULT_SIMILARITY_THRESHOLD = 0.55
EMBEDDING_DIM = 512


class FaceService:
    """Service for face detection, 512-d ArcFace embedding extraction, and cosine similarity matching."""

    LIVENESS_READY_SECONDS = 1.5
    LIVENESS_VALID_SECONDS = 8.0
    EMBEDDING_CACHE_SIZE = 2048

    def __init__(self, model_name: str = "buffalo_l", ctx_id: int = 0, det_size: tuple[int, int] = (640, 640)):
        self.model_name = model_name
        self.ctx_id = ctx_id
        self.det_size = det_size
        self._app: FaceAnalysis | None = None
        self._initialized: bool = False
        self._cache: dict[tuple[str, float], np.ndarray] = {}
        self._embedding_cache: OrderedDict[bytes, np.ndarray] = OrderedDict()
        self._embedding_cache_lock = Lock()
        self._liveness: dict[str, dict] = {}
        self._mesh = None
        self._mesh_lock = Lock()
        self._face_detector = None
        self._face_detector_lock = Lock()

    def warmup(self) -> None:
        """Load the recognition model before a kiosk begins scanning."""
        self._get_app()

    @staticmethod
    def should_mark_liveness_ready(state: dict, now: float | None = None) -> bool:
        """Accept liveness after a blink, movement, and a short observation window."""
        if not isinstance(state, dict):
            return False
        started_at = state.get("started_at")
        if started_at is None:
            return False
        if now is None:
            now = time.monotonic()
        return bool(state.get("blink") and state.get("movement") and (now - started_at) >= FaceService.LIVENESS_READY_SECONDS)

    def _get_app(self) -> FaceAnalysis:
        """Lazy load the InsightFace model on first use."""
        if self._initialized and self._app is not None:
            return self._app

        if FaceAnalysis is None:
            raise RuntimeError(
                "InsightFace is not installed. Please install it with: pip install insightface onnxruntime"
            )

        logger.info("Initializing InsightFace model: %s (det_size=%s)...", self.model_name, self.det_size)
        try:
            # Try GPU if available (ctx_id >= 0), fallback to CPU if not
            providers = ["CUDAExecutionProvider", "CPUExecutionProvider"] if self.ctx_id >= 0 else ["CPUExecutionProvider"]
            app = FaceAnalysis(name=self.model_name, providers=providers)
            app.prepare(ctx_id=self.ctx_id, det_size=self.det_size)
        except Exception as exc:
            logger.warning("GPU execution provider failed (%s), falling back to CPUExecutionProvider", exc)
            app = FaceAnalysis(name=self.model_name, providers=["CPUExecutionProvider"])
            app.prepare(ctx_id=-1, det_size=self.det_size)

        self._app = app
        self._initialized = True
        return self._app

    @staticmethod
    def to_cv2_image(image: Union[str, Path, bytes, np.ndarray]) -> np.ndarray:
        """Convert various image input types (filepath, bytes, numpy array) to an OpenCV BGR numpy array."""
        if cv2 is None:
            raise RuntimeError("OpenCV is not installed. Please install it with: pip install opencv-python-headless")

        if isinstance(image, (str, Path)):
            path_str = str(image)
            img = cv2.imread(path_str)
            if img is None:
                raise ValueError(f"Could not read image from file path: {path_str}")
            return img

        if isinstance(image, (bytes, bytearray)):
            np_arr = np.frombuffer(image, np.uint8)
            img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError("Could not decode image from provided byte stream.")
            return img

        if isinstance(image, np.ndarray):
            if image.ndim == 2:
                # Grayscale to BGR
                return cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
            if image.ndim == 3 and image.shape[2] == 4:
                # RGBA to BGR
                return cv2.cvtColor(image, cv2.COLOR_RGBA2BGR)
            return image

        raise TypeError(f"Unsupported image type: {type(image)}. Expected str, Path, bytes, or np.ndarray.")

    def extract_embedding(self, image: Union[str, Path, bytes, np.ndarray]) -> np.ndarray | None:
        """Extract a single 512-dimensional normalized face embedding vector from an image.

        If multiple faces are detected, returns the embedding of the most prominent (largest) face.
        Returns None if no face is detected. Cached for file paths by mtime.
        """
        byte_cache_key = None
        if isinstance(image, (bytes, bytearray)):
            byte_cache_key = hashlib.sha256(image).digest()
            with self._embedding_cache_lock:
                cached = self._embedding_cache.get(byte_cache_key)
                if cached is not None:
                    self._embedding_cache.move_to_end(byte_cache_key)
                    return cached

        # Check cache if image is a file path
        if isinstance(image, (str, Path)):
            p = Path(image)
            if p.exists():
                try:
                    mtime = p.stat().st_mtime
                    cache_key = (str(p.resolve()), mtime)
                    if cache_key in self._cache:
                        return self._cache[cache_key]
                except Exception:
                    pass

        faces = self.detect_faces(image)
        if not faces:
            return None

        # Select largest face by bounding box area: (x2 - x1) * (y2 - y1)
        largest_face = max(
            faces,
            key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]) if hasattr(f, "bbox") else 0,
        )

        embedding = getattr(largest_face, "normed_embedding", None)
        if embedding is None and hasattr(largest_face, "embedding"):
            # Normalize embedding to unit length (L2 norm = 1.0)
            raw = largest_face.embedding
            norm = np.linalg.norm(raw)
            embedding = raw / norm if norm > 0 else raw

        if embedding is not None:
            arr = np.array(embedding, dtype=np.float32)
            if isinstance(image, (str, Path)):
                p = Path(image)
                if p.exists():
                    try:
                        self._cache[(str(p.resolve()), p.stat().st_mtime)] = arr
                    except Exception:
                        pass
            elif byte_cache_key is not None:
                with self._embedding_cache_lock:
                    self._embedding_cache[byte_cache_key] = arr
                    self._embedding_cache.move_to_end(byte_cache_key)
                    while len(self._embedding_cache) > self.EMBEDDING_CACHE_SIZE:
                        self._embedding_cache.popitem(last=False)
            return arr

        return None

    def detect_faces(self, image: Union[str, Path, bytes, np.ndarray]) -> list:
        """Detect all faces in an image with bounding boxes, keypoints, and embeddings."""
        img = self.to_cv2_image(image)
        app = self._get_app()
        return app.get(img)

    def validate_single_human_face(self, image: Union[str, Path, bytes, np.ndarray]) -> None:
        """Reject images without exactly one face using the lightweight detector."""
        if mp is None:
            raise RuntimeError("MediaPipe is not installed. Please install the backend requirements.")
        frame = self.to_cv2_image(image)
        with self._face_detector_lock:
            if self._face_detector is None:
                self._face_detector = mp.solutions.face_detection.FaceDetection(
                    model_selection=0,
                    min_detection_confidence=0.55,
                )
            result = self._face_detector.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        if not result.detections or len(result.detections) != 1:
            raise ValueError("Each registration photo must contain exactly one clearly visible human face.")

    def check_liveness(self, image: Union[str, Path, bytes, np.ndarray], session_key: str) -> dict:
        """Track blink and natural head movement across live camera frames.

        A short observation window keeps verification responsive while still requiring both
        a blink and head movement across separate camera frames.
        """
        if mp is None:
            raise RuntimeError("MediaPipe is not installed. Please install the backend requirements.")
        frame = self.to_cv2_image(image)
        with self._mesh_lock:
            if self._mesh is None:
                self._mesh = mp.solutions.face_mesh.FaceMesh(
                    static_image_mode=False,
                    max_num_faces=2,
                    refine_landmarks=False,
                    min_detection_confidence=0.55,
                    min_tracking_confidence=0.5,
                )
            result = self._mesh.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        if not result.multi_face_landmarks or len(result.multi_face_landmarks) != 1:
            self._liveness.pop(session_key, None)
            return {
                "human": False,
                "blink_detected": False,
                "movement_detected": False,
                "liveness": False,
                "message": "No single human face detected. A still photo cannot be used.",
            }

        landmarks = result.multi_face_landmarks[0].landmark
        left_eye = self._eye_aspect_ratio(landmarks, (33, 160, 158, 133, 153, 144))
        right_eye = self._eye_aspect_ratio(landmarks, (362, 385, 387, 263, 373, 380))
        ear = (left_eye + right_eye) / 2
        nose = landmarks[1]
        face_width = max(abs(landmarks[234].x - landmarks[454].x), 0.001)
        position = (nose.x / face_width, nose.y / face_width)
        now = time.monotonic()
        state = self._liveness.setdefault(session_key, {
            "closed": False,
            "blink": False,
            "movement": False,
            "position": position,
            "started_at": now,
        })
        if now - state.get("last_seen_at", now) > 2.5:
            state.update({
                "closed": False,
                "blink": False,
                "movement": False,
                "position": position,
                "started_at": now,
                "live_embedding": None,
            })
        if state.get("started_at") is None:
            state["started_at"] = now

        if ear < 0.18:
            state["closed"] = True
        elif state["closed"] and ear > 0.21:
            state["blink"] = True
            state["closed"] = False

        previous = state.get("position", position)
        movement_detected = abs(position[0] - previous[0]) > 0.018 or abs(position[1] - previous[1]) > 0.018
        if movement_detected:
            state["movement"] = True
        state["position"] = position
        state["last_seen_at"] = now

        liveness = self.should_mark_liveness_ready(state, now)
        if liveness and state.get("live_embedding") is None:
            state["live_embedding"] = self.extract_embedding(frame)
            liveness = state["live_embedding"] is not None
        return {
            "human": True,
            "blink_detected": state["blink"],
            "movement_detected": state["movement"],
            "liveness": liveness,
            "message": (
                "Live human verified. You can capture now."
                if liveness else
                "Keep your face visible, blink once, and slowly move your head."
            ),
        }

    def consume_liveness(self, session_key: str) -> np.ndarray | None:
        """Consume a recent live-face proof once so it cannot authorize later scans."""
        state = self._liveness.pop(session_key, None)
        if not state or time.monotonic() - state.get("last_seen_at", 0) > self.LIVENESS_VALID_SECONDS:
            return None
        embedding = state.get("live_embedding")
        return embedding if isinstance(embedding, np.ndarray) else None

    @staticmethod
    def _eye_aspect_ratio(landmarks: list, indexes: tuple[int, ...]) -> float:
        p1, p2, p3, p4, p5, p6 = (landmarks[index] for index in indexes)
        vertical = np.linalg.norm(np.array([p2.x - p6.x, p2.y - p6.y])) + np.linalg.norm(
            np.array([p3.x - p5.x, p3.y - p5.y])
        )
        horizontal = np.linalg.norm(np.array([p1.x - p4.x, p1.y - p4.y]))
        return float(vertical / max(horizontal, 1e-6))

    def extract_all_embeddings(self, image: Union[str, Path, bytes, np.ndarray]) -> list[dict]:
        """Extract embeddings and bounding boxes for all faces found in the image."""
        faces = self.detect_faces(image)
        results = []
        for face in faces:
            emb = getattr(face, "normed_embedding", None)
            if emb is None and hasattr(face, "embedding"):
                norm = np.linalg.norm(face.embedding)
                emb = face.embedding / norm if norm > 0 else face.embedding

            results.append({
                "bbox": face.bbox.tolist() if hasattr(face, "bbox") else None,
                "score": float(face.det_score) if hasattr(face, "det_score") else None,
                "embedding": np.array(emb, dtype=np.float32) if emb is not None else None,
            })
        return results


# ─────────────────────────────────────────────────────────────────────────────
# Cosine Similarity & Matching Functions
# ─────────────────────────────────────────────────────────────────────────────

def compute_similarity(
    embedding1: Sequence[float] | np.ndarray,
    embedding2: Sequence[float] | np.ndarray,
) -> float:
    """Compute cosine similarity between two face embedding vectors.

    Cosine similarity = (u . v) / (||u|| * ||v||)
    Range: [-1.0, 1.0], where 1.0 means identical faces.
    """
    u = np.asarray(embedding1, dtype=np.float32).ravel()
    v = np.asarray(embedding2, dtype=np.float32).ravel()

    if u.shape[0] != v.shape[0]:
        raise ValueError(f"Embedding dimensions do not match: {u.shape[0]} vs {v.shape[0]}")

    norm_u = np.linalg.norm(u)
    norm_v = np.linalg.norm(v)

    if norm_u == 0.0 or norm_v == 0.0:
        return 0.0

    similarity = float(np.dot(u, v) / (norm_u * norm_v))
    # Clip to valid cosine range [-1.0, 1.0] to guard against floating-point inaccuracies
    return max(-1.0, min(1.0, similarity))


def is_match(
    embedding1: Sequence[float] | np.ndarray,
    embedding2: Sequence[float] | np.ndarray,
    threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
) -> tuple[bool, float]:
    """Compare two embeddings and determine if they belong to the same person.

    Args:
        embedding1: First 512-d embedding vector.
        embedding2: Second 512-d embedding vector.
        threshold: Cosine similarity cutoff (default: 0.6).

    Returns:
        tuple[bool, float]: (is_match, similarity_score)
    """
    similarity = compute_similarity(embedding1, embedding2)
    matched = bool(similarity >= threshold)
    return matched, similarity


# Global singleton instance
_default_face_service: FaceService | None = None


def get_face_service() -> FaceService:
    """Get or create the global FaceService singleton."""
    global _default_face_service
    if _default_face_service is None:
        _default_face_service = FaceService()
    return _default_face_service


def extract_embedding(image: Union[str, Path, bytes, np.ndarray]) -> np.ndarray | None:
    """Convenience helper to extract 512-d embedding using default FaceService instance."""
    return get_face_service().extract_embedding(image)
