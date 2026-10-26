"""封装 Paddle 及其前后处理，HTTP 层无需了解 Paddle 结果对象。"""

import hashlib
import io
import warnings

from PIL import Image

from .settings import MAX_IMAGE_PIXELS, MAX_LATEX_CHARACTERS, MODEL_FILES, Settings
from .formula_processor import FormulaProcessor
from .paddle_runtime import PaddleRuntime

Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


class InvalidImage(ValueError):
    """图片无法安全解码，或超出模型服务接受的范围。"""


class InvalidPrediction(ValueError):
    """模型未输出可保存的纯 LaTeX。"""


def validate_latex(value: object) -> str:
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= MAX_LATEX_CHARACTERS:
        raise InvalidPrediction("识别结果为空或超出5000字符限制。")
    latex = value.strip()
    if "```" in latex or "\\documentclass" in latex or "\x00" in latex:
        raise InvalidPrediction("识别结果不是可保存的公式源码。")
    return latex


def decode_image(content: bytes) -> Image.Image:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content)) as source:
                if source.format not in {"JPEG", "PNG"}:
                    raise InvalidImage("仅支持 JPEG 或 PNG 图片。")
                if source.width * source.height > MAX_IMAGE_PIXELS:
                    raise InvalidImage("图片像素数超出限制。")
                source.load()
                # 方向已由 Node 校正；这里保留模型自己的缩放与归一化。
                return source.convert("RGB")
    except InvalidImage:
        raise
    except Exception as error:
        raise InvalidImage("图片无法解码或像素数超出限制。") from error


class FormulaEngine:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.model = None
        self.processor = None
        self.model_version = ""

    def load(self) -> None:
        digest = hashlib.sha256()
        for name in MODEL_FILES:
            path = self.settings.model_dir / name
            if not path.is_file():
                raise RuntimeError(f"模型导出文件缺失：{name}")
            digest.update(name.encode())
            with path.open("rb") as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    digest.update(chunk)

        import yaml

        configuration = yaml.safe_load((self.settings.model_dir / "inference.yml").read_text(encoding="utf-8"))
        self.processor = FormulaProcessor(configuration)
        # 显式目录确保使用朋友交付的权重，加载失败不能改用在线官方模型。
        self.model = PaddleRuntime(self.settings.model_dir, self.settings.cpu_threads)
        self.model_version = f"PP-FormulaNet_plus-L@{digest.hexdigest()[:16]}"

    def recognize(self, image: Image.Image) -> str:
        if self.model is None or self.processor is None:
            raise RuntimeError("模型尚未加载。")
        tensor = self.processor.prepare(image)
        results = self.processor.decode(self.model.predict(tensor))
        if len(results) != 1:
            raise InvalidPrediction("模型输出数量异常。")
        return validate_latex(results[0])

