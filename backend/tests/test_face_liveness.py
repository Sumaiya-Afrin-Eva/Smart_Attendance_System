import time

import numpy as np

from app.services.face_service import FaceService


def test_should_mark_liveness_ready_after_blink_movement_window():
    service = FaceService()
    state = {
        "blink": True,
        "movement": True,
        "started_at": time.monotonic() - 2,
    }

    assert service.should_mark_liveness_ready(state, time.monotonic()) is True


def test_should_not_mark_liveness_ready_before_blink_movement_window():
    service = FaceService()
    state = {
        "blink": True,
        "movement": True,
        "started_at": time.monotonic() - 1,
    }

    assert service.should_mark_liveness_ready(state, time.monotonic()) is False


def test_liveness_proof_is_consumed_only_once():
    service = FaceService()
    embedding = np.array([1.0, 0.0], dtype=np.float32)
    service._liveness["kiosk:1"] = {
        "last_seen_at": time.monotonic(),
        "live_embedding": embedding,
    }

    assert service.consume_liveness("kiosk:1") is embedding
    assert service.consume_liveness("kiosk:1") is None


def test_liveness_proof_expires():
    service = FaceService()
    embedding = np.array([1.0, 0.0], dtype=np.float32)
    service._liveness["kiosk:1"] = {
        "last_seen_at": time.monotonic() - service.LIVENESS_VALID_SECONDS - 1,
        "live_embedding": embedding,
    }

    assert service.consume_liveness("kiosk:1") is None


def test_byte_image_embeddings_are_cached():
    service = FaceService()
    calls = []

    class DetectedFace:
        bbox = np.array([0, 0, 10, 10])
        normed_embedding = np.array([1.0, 0.0], dtype=np.float32)

    service.detect_faces = lambda image: calls.append(image) or [DetectedFace()]
    image = b"same-registration-photo"

    first = service.extract_embedding(image)
    second = service.extract_embedding(image)

    assert first is second
    assert calls == [image]
