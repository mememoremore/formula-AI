"""HTTP 协议、鉴权与并发控制；推理实现集中在 engine.py。"""

import os
import hmac
import logging
import re
import threading
import io
import base64
from contextlib import asynccontextmanager
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, PlainTextResponse

from .telemetry import TracingMiddleware, process_metrics
from .body_limit import BodyLimitMiddleware, BodyTooLarge
from .engine import FormulaEngine, InvalidImage, InvalidPrediction, decode_image, validate_latex
from .settings import MAX_IMAGE_BYTES, Settings

logger = logging.getLogger("recognition")


def create_app(settings: Settings | None = None, engine=None) -> FastAPI:
    inference_lock = threading.Lock()

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        configuration = settings or Settings.from_env()
        predictor = engine or FormulaEngine(configuration)
        await run_in_threadpool(predictor.load)
        application.state.configuration = configuration
        application.state.predictor = predictor
        logger.info("识别模型加载完成：%s", predictor.model_version)
        yield

    application = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    application.add_middleware(BodyLimitMiddleware, max_bytes=MAX_IMAGE_BYTES + 64 * 1024)
    application.add_middleware(TracingMiddleware)

    @application.exception_handler(BodyTooLarge)
    async def body_too_large(_request, _error):
        return JSONResponse(status_code=413, content={"detail": "请求图片超出大小限制。"})

    def authorize(authorization: Annotated[str | None, Header()] = None):
        expected = f"Bearer {application.state.configuration.api_key}"
        if not hmac.compare_digest((authorization or "").encode(), expected.encode()):
            raise HTTPException(status_code=401, detail="识别服务凭据无效。")

    @application.get("/metrics")
    def metrics():
        if os.getenv("FORMULA_METRICS_ENABLED") != "true":
            raise HTTPException(status_code=404, detail="Not found")
        return PlainTextResponse(process_metrics(), media_type="text/plain; version=0.0.4")

    @application.get("/ready")
    def ready():
        return {"ready": True, "modelVersion": application.state.predictor.model_version}

    @application.post("/recognize", dependencies=[Depends(authorize)])
    async def recognize(
        image: Annotated[UploadFile, File()],
        mode: Annotated[Literal["handwritten", "printed"], Form()],
        x_request_id: Annotated[str | None, Header()] = None,
    ):
        request_id = x_request_id or str(uuid4())
        if not re.fullmatch(r"[a-zA-Z0-9._:-]{1,100}", request_id):
            raise HTTPException(status_code=422, detail="请求编号格式无效。")
        if image.content_type not in {"image/jpeg", "image/png"}:
            raise HTTPException(status_code=415, detail="仅支持 JPEG 或 PNG 图片。")
        try:
            content = await image.read(MAX_IMAGE_BYTES + 1)
            if not content or len(content) > MAX_IMAGE_BYTES:
                raise HTTPException(status_code=413, detail="图片为空或超出10MB限制。")

            def predict():
                if not inference_lock.acquire(blocking=False):
                    raise HTTPException(status_code=503, detail="识别设备忙，请稍后重试。", headers={"Retry-After": "2"})
                try:
                    # 两种模式使用同一份权重；是否满足手写质量要求需另做评测。
                    with decode_image(content) as decoded:
                        return validate_latex(application.state.predictor.recognize(decoded))
                finally:
                    # 计算线程自己释放锁，HTTP取消不能提前放出第二路计算。
                    inference_lock.release()

            # 线程中的同步推理完成前仍持有锁，HTTP 断开不会放出第二路计算。
            latex = await run_in_threadpool(predict)
            return {"requestId": request_id, "latex": latex, "modelVersion": application.state.predictor.model_version}
        except InvalidImage as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        except InvalidPrediction as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        except HTTPException:
            raise
        except Exception as error:
            # 不记录请求体、图片或原始依赖错误中的路径与服务配置。
            logger.error("推理失败 request_id=%s type=%s", request_id, type(error).__name__)
            raise HTTPException(status_code=503, detail="识别服务暂时不可用。") from error
        finally:
            await image.close()

    @application.post("/regions", dependencies=[Depends(authorize)])
    async def regions(image: Annotated[UploadFile, File()]):
        if image.content_type not in {"image/jpeg", "image/png"}:
            raise HTTPException(status_code=415, detail="仅支持 JPEG 或 PNG 图片。")
        try:
            content = await image.read(MAX_IMAGE_BYTES + 1)
            if not content or len(content) > MAX_IMAGE_BYTES:
                raise HTTPException(status_code=413, detail="图片为空或超出10MB限制。")

            def detect():
                import numpy as np
                from PIL import Image
                from .split_formulas import formula_crops
                if not inference_lock.acquire(blocking=False):
                    raise HTTPException(status_code=503, detail="识别设备忙，请稍后重试。")
                try:
                    with decode_image(content) as decoded:
                        crops = formula_crops(np.asarray(decoded.convert("RGB"))[:, :, ::-1].copy())
                        if not crops:
                            raise ValueError("未检测到公式区域，请旋转或裁剪图片后重试。仅支持上下分开的公式。")
                        if len(crops) > 20:
                            raise ValueError("一次最多检测20条公式，请将图片分成几张后重试。")
                        result = []
                        total_bytes = 0
                        for index, (box, crop) in enumerate(crops):
                            part = Image.fromarray(crop[:, :, ::-1])
                            part.thumbnail((1800, 1800))
                            stream = io.BytesIO()
                            part.save(stream, format="PNG")
                            data = stream.getvalue()
                            total_bytes += len(data)
                            if total_bytes > 15 * 1024 * 1024:
                                raise ValueError("公式区域图片过大，请缩小图片后重试。")
                            result.append({"index": index, "bbox": box, "imageBase64": base64.b64encode(data).decode()})
                        return {"regions": result, "imageWidth": decoded.width, "imageHeight": decoded.height}
                finally:
                    inference_lock.release()
            return await run_in_threadpool(detect)
        except (InvalidImage, ValueError) as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        finally:
            await image.close()

    return application


app = create_app()

