"""在 multipart 解析前限制实际请求体，覆盖未提供 Content-Length 的请求。"""

from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class BodyTooLarge(HTTPException):
    def __init__(self):
        super().__init__(413, "请求图片超出大小限制。")


class BodyLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        consumed = 0

        async def limited_receive() -> Message:
            nonlocal consumed
            message = await receive()
            consumed += len(message.get("body", b""))
            if consumed > self.max_bytes:
                raise BodyTooLarge()
            return message

        # 异常由 FastAPI 的异常处理器转换，避免向客户端发送两次响应。
        await self.app(scope, limited_receive, send)

