"""Face Embedding and Recognition Service using InsightFace ArcFace model.

- Model: InsightFace ArcFace (512-dimensional embedding vector)
- Input: Image file path, raw bytes, or numpy ndarray
- Output: 512-d float numpy vector (embedding)
- Cosine similarity comparison with default threshold 0.6
"""
from __future__ import annotations

import io
import logging
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

logger = logging.getLogger(__name__)

DEFAULT_SIMILARITY_THRESHOLD = 0.6
EMBEDDING_DIM = 512


class FaceService:
    """Service for face detection, 512-d ArcFace embedding extraction, and cosine similarity matching."""

    def __init__(self, model_name: str = "buffalo_l", ctx_id: int = 0, det_size: tuple[int, int] = (640, 640)):
        self.model_name = model_name
        self.ctx_id = ctx_id
        self.det_size = det_size
        self._app: FaceAnalysis | None = None
        self._initialized: bool = False
        self._cache: dict[tuple[str, float], np.ndarray] = {}

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
            return arr

        return None

    def detect_faces(self, image: Union[str, Path, bytes, np.ndarray]) -> list:
        """Detect all faces in an image with bounding boxes, keypoints, and embeddings."""
        img = self.to_cv2_image(image)
        app = self._get_app()
        return app.get(img)

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
