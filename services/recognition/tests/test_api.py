import io
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from app.main import create_app
from app.settings import MAX_IMAGE_BYTES, Settings


class FakeEngine:
    model_version = "fixture@123456"

    def __init__(self):
        self.result = r"x^{2}+1"
        self.started = threading.Event()
        self.release = threading.Event()
        self.release.set()

    def load(self):
        pass

    def recognize(self, image):
        self.started.set()
        self.release.wait(timeout=5)
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


class RecognitionAPITest(unittest.TestCase):
    def setUp(self):
        self.engine = FakeEngine()
        self.settings = Settings(Path("/unused"), "fixture-private-key-for-testing")
        self.client = TestClient(create_app(self.settings, self.engine))
        self.client.__enter__()
        output = io.BytesIO()
        Image.new("RGB", (32, 32), "white").save(output, "PNG")
        self.image = output.getvalue()

    def tearDown(self):
        self.engine.release.set()
        self.client.__exit__(None, None, None)

    def recognize(self, **kwargs):
        return self.client.post(
            "/recognize",
            headers={"Authorization": f"Bearer {self.settings.api_key}", "X-Request-Id": "fixture-task"},
            files={"image": ("formula.png", kwargs.get("image", self.image), kwargs.get("mime", "image/png"))},
            data={"mode": kwargs.get("mode", "printed")},
        )

    def test_ready_and_success(self):
        self.assertEqual(self.client.get("/ready").status_code, 200)
        result = self.recognize()
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json(), {"requestId": "fixture-task", "latex": r"x^{2}+1", "modelVersion": self.engine.model_version})

    def test_unauthorized(self):
        result = self.client.post("/recognize", files={"image": ("f.png", self.image, "image/png")}, data={"mode": "printed"})
        self.assertEqual(result.status_code, 401)

    def test_invalid_image_and_mode(self):
        self.assertEqual(self.recognize(image=b"invalid").status_code, 422)
        self.assertEqual(self.recognize(mode="invalid").status_code, 422)
        self.assertEqual(self.recognize(mime="text/plain").status_code, 415)

    def test_large_body(self):
        self.assertEqual(self.recognize(image=b"x" * (MAX_IMAGE_BYTES + 100_000)).status_code, 413)

    def test_invalid_prediction_is_not_success(self):
        for value in ("", "x" * 5001, "```latex\nx\n```", None):
            self.engine.result = value
            self.assertEqual(self.recognize().status_code, 422)

    def test_raw_error_is_private(self):
        self.engine.result = RuntimeError("private-token-and-path")
        result = self.recognize()
        self.assertEqual(result.status_code, 503)
        self.assertNotIn("private-token", result.text)

    def test_busy_rejects_concurrent_inference(self):
        self.engine.release.clear()
        with ThreadPoolExecutor(max_workers=1) as pool:
            first = pool.submit(self.recognize)
            self.assertTrue(self.engine.started.wait(timeout=3))
            try:
                self.assertEqual(self.recognize().status_code, 503)
            finally:
                self.engine.release.set()
            self.assertEqual(first.result(timeout=5).status_code, 200)


if __name__ == "__main__":
    unittest.main()
