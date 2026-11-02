"""Bounded, best-effort OTLP/JSON and safe rotating logs; no model dependency changes."""
import json
import os
import re
import time
import urllib.request
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from concurrent.futures import ThreadPoolExecutor
from threading import BoundedSemaphore
from uuid import uuid4

_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="telemetry")
_slots = BoundedSemaphore(4)
_handler = None

def emit_trace(body):
    endpoint = os.getenv("FORMULA_OTLP_ENDPOINT", "")
    if not endpoint or not _slots.acquire(blocking=False):
        return
    def send():
        try:
            request = urllib.request.Request(endpoint, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(request, timeout=1.5) as response:
                response.read(1024)
        except Exception:
            pass
        finally:
            _slots.release()
    try:
        _pool.submit(send)
    except Exception:
        _slots.release()

class TracingMiddleware:
    def __init__(self, app):
        self.app = app
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("path") != "/recognize":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        parent = headers.get(b"traceparent", b"").decode("ascii", errors="ignore")
        valid = re.fullmatch(r"00-([0-9a-f]{32})-([0-9a-f]{16})-0([01])", parent)
        trace_id = valid[1] if valid and int(valid[1], 16) and int(valid[2], 16) else uuid4().hex
        parent_id = valid[2] if valid and trace_id == valid[1] else None
        span_id = uuid4().hex[:16]
        request_id = headers.get(b"x-request-id", b"").decode("ascii", errors="ignore")
        if not re.fullmatch(r"[a-zA-Z0-9._:-]{1,100}", request_id):
            request_id = ""
        start, status = time.time_ns(), 500
        async def observe(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)
        try:
            await self.app(scope, receive, observe)
        finally:
            end = time.time_ns()
            entry = {"timestamp": datetime.now(timezone.utc).isoformat(), "service": "formula-recognition", "environment": "local", "level": "error" if status >= 500 else "info", "event": "recognition.request", "traceId": trace_id, "spanId": span_id, "requestId": request_id, "status": status, "durationMs": (end-start)//1000000}
            line = json.dumps(entry, separators=(",", ":"))
            try:
                print(line, flush=True)
            except Exception:
                pass
            global _handler
            try:
                directory = os.getenv("FORMULA_LOG_DIR")
                if directory:
                    if _handler is None:
                        import logging
                        os.makedirs(directory, exist_ok=True)
                        _handler = RotatingFileHandler(os.path.join(directory, "formula-recognition.jsonl"), maxBytes=5*1024*1024, backupCount=2)
                    import logging
                    _handler.emit(logging.LogRecord("recognition", logging.INFO, "", 0, line, (), None))
            except Exception:
                pass
            span = {"traceId": trace_id, "spanId": span_id, "name": "POST /recognize", "kind": 2, "startTimeUnixNano": str(start), "endTimeUnixNano": str(end), "attributes": [{"key": "http.response.status_code", "value": {"intValue": str(status)}}], "status": {"code": 2 if status >= 500 else 0}}
            if parent_id:
                span["parentSpanId"] = parent_id
            if not parent_id or valid[3] == "1":
                emit_trace({"resourceSpans": [{"resource": {"attributes": [{"key": "service.name", "value": {"stringValue": "formula-recognition"}}]}, "scopeSpans": [{"scope": {"name": "formula-recognition"}, "spans": [span]}]}]})

_process_started = time.time()
def process_metrics():
    """Linux process measurements only; no model or request contents."""
    lines = [
        '# TYPE formula_process_cpu_seconds_total counter',
        'formula_process_cpu_seconds_total{service="formula-recognition"} ' + str(time.process_time()),
        '# TYPE formula_process_start_time_seconds gauge',
        'formula_process_start_time_seconds{service="formula-recognition"} ' + str(_process_started),
    ]
    try:
        with open('/proc/self/statm', encoding='ascii') as stream:
            resident = int(stream.read().split()[1]) * os.sysconf('SC_PAGE_SIZE')
        lines.extend(['# TYPE formula_process_resident_memory_bytes gauge', 'formula_process_resident_memory_bytes{service="formula-recognition"} ' + str(resident)])
    except (OSError, ValueError, IndexError):
        pass
    return '\n'.join(lines) + '\n'
