"""识别服务只读取自己的配置，不接收数据库或对象存储凭据。"""

import os
from dataclasses import dataclass
from pathlib import Path

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
MAX_LATEX_CHARACTERS = 5000
MODEL_FILES = ("inference.json", "inference.pdiparams", "inference.yml")


@dataclass(frozen=True)
class Settings:
    model_dir: Path
    api_key: str
    cpu_threads: int = 4

    @classmethod
    def from_env(cls) -> "Settings":
        key = os.environ.get("RECOGNITION_API_KEY", "").strip()
        threads = int(os.environ.get("RECOGNITION_CPU_THREADS", "4"))
        if len(key) < 24 or any(char.isspace() for char in key):
            raise ValueError("RECOGNITION_API_KEY 必须配置为至少24位的非空白密钥。")
        if not 1 <= threads <= 16:
            raise ValueError("RECOGNITION_CPU_THREADS 必须在1～16之间。")
        return cls(Path(os.environ.get("RECOGNITION_MODEL_DIR", "/models/formula")), key, threads)

