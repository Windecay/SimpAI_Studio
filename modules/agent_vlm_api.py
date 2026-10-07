"""HTTP inference adapter with OpenAI-shaped completion responses and SSE."""

import asyncio
import json
import queue
import threading
import time

from fastapi import APIRouter, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import StreamingResponse
from fastapi.routing import APIRoute
from starlette.concurrency import run_in_threadpool

from modules.agent_api_response import AgentJSONResponse as JSONResponse
from modules.agent_service import AgentAPIError, _require_context, require_scope
from modules.agent_vlm import MAX_BODY_BYTES
from modules.agent_vlm_contract import ChatCompletion, VLMAnalyze, VLMChat, VLMModels, VLMStatus


def live_resolver(authorization, request, context):
    if context.authorization is not None:
        credential_id = context.authorization["id"]
        return lambda: authorization.chat_credential_context(credential_id)
    return lambda: authorization.request_context(request)


async def complete_http(request, payload, service, authorization, analyze=False):
    context = authorization.request_context(request)
    service.vlm.guard(context)
    cancel = threading.Event()
    method = service.vlm.analyze if analyze else service.vlm.complete
    task = asyncio.create_task(run_in_threadpool(
        method, payload, context, cancel_check=cancel.is_set,
        context_resolver=live_resolver(authorization, request, context)))
    def consume(task):
        if not task.cancelled():
            task.exception()
    task.add_done_callback(consume)
    try:
        while not task.done():
            if await request.is_disconnected():
                cancel.set()
            await asyncio.wait({task}, timeout=0.1)
        return await task
    finally:
        cancel.set()


def error_payload(error):
    kind = ("authentication_error" if error.status == 401 else "permission_error" if error.status == 403
            else "invalid_request_error" if error.status < 500 else "server_error")
    return {"error": {"message": error.message, "type": kind, "code": error.code, "param": None}}


class CompletionRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()
        async def handle(request):
            try:
                if request.method == "POST":
                    chunks, size = [], 0
                    async for chunk in request.stream():
                        size += len(chunk)
                        if size > MAX_BODY_BYTES:
                            raise AgentAPIError("request_too_large", "Inference request exceeds 16 MiB.", 413)
                        chunks.append(chunk)
                    request._body = b"".join(chunks)
                return await handler(request)
            except RequestValidationError:
                error = AgentAPIError("invalid_request", "Request does not match the local completion schema.", 400)
                return JSONResponse(error_payload(error), status_code=400, headers={"Cache-Control": "no-store"})
            except AgentAPIError as error:
                return JSONResponse(error_payload(error), status_code=error.status, headers={"Cache-Control": "no-store"})
            except Exception:
                error = AgentAPIError("vlm_operation_failed", "Local inference failed. Check the server log.", 500)
                return JSONResponse(error_payload(error), status_code=500, headers={"Cache-Control": "no-store"})
        return handle


def add_routes(router, service, authorization, call):
    class ModelParameters(VLMModels):
        model_config = {"strict": False, "extra": "forbid"}

    @router.get("/vlm/models", operation_id="simpai_vlm_models")
    async def models(request: Request, query: ModelParameters = Query()):
        return await call("simpai.vlm.models", query.model_dump(), request)

    @router.get("/vlm/status", operation_id="simpai_vlm_status")
    async def status(request: Request, model: str):
        return await call("simpai.vlm.status", {"model": model}, request)

    @router.post("/vlm/chat", operation_id="simpai_vlm_chat")
    async def chat(request: Request, payload: VLMChat):
        data = await complete_http(request, payload, service, authorization)
        return JSONResponse({"ok": True, "api_version": "1.0", "data": data}, headers={"Cache-Control": "no-store"})

    @router.post("/vlm/analyze", operation_id="simpai_vlm_analyze")
    async def analyze(request: Request, payload: VLMAnalyze):
        data = await complete_http(request, payload, service, authorization, analyze=True)
        return JSONResponse({"ok": True, "api_version": "1.0", "data": data}, headers={"Cache-Control": "no-store"})

    compatible = APIRouter(prefix="/llm", route_class=CompletionRoute, tags=["Local Chat Completions"])

    @compatible.get("/models", operation_id="simpai_llm_models")
    async def compatible_models(request: Request):
        context = authorization.request_context(request)
        _require_context(context)
        require_scope(context, "read")
        rows = await run_in_threadpool(service.vlm.models, VLMModels(limit=100), context)
        return JSONResponse({"object": "list", "data": [
            {"id": row["id"], "object": "model", "created": 0, "owned_by": "SimpAI",
             "capabilities": row["capabilities"]} for row in rows["items"]]},
            headers={"Cache-Control": "no-store"})

    @compatible.post("/chat/completions", operation_id="simpai_llm_completion")
    async def completion(request: Request, payload: ChatCompletion):
        if not payload.stream:
            return JSONResponse(await complete_http(request, payload, service, authorization), headers={"Cache-Control": "no-store"})
        context = authorization.request_context(request)
        prepared = await run_in_threadpool(service.vlm.prepare, payload, context)
        cancel, ended = threading.Event(), threading.Event()
        events = queue.Queue(maxsize=8)
        def put(item):
            while not cancel.is_set():
                try:
                    events.put(item, timeout=0.1)
                    return
                except queue.Full:
                    pass
        def produce():
            try:
                for event in service.vlm.events(
                    payload, context, prepared=prepared, cancel_check=cancel.is_set,
                    context_resolver=live_resolver(authorization, request, context)):
                    put(event)
            except AgentAPIError as error:
                put(error_payload(error))
            except Exception:
                put(error_payload(AgentAPIError("vlm_inference_failed", "Local inference failed.", 502)))
            finally:
                ended.set()
        async def body():
            worker = threading.Thread(target=produce, name="studio-local-completion", daemon=True)
            worker.start()
            heartbeat = time.monotonic()
            try:
                while not ended.is_set() or not events.empty():
                    if await request.is_disconnected():
                        cancel.set()
                        break
                    try:
                        item = events.get_nowait()
                    except queue.Empty:
                        if time.monotonic() - heartbeat >= 10:
                            heartbeat = time.monotonic()
                            yield ": keepalive\n\n"
                        await asyncio.sleep(0.05)
                        continue
                    yield "data: " + json.dumps(item, ensure_ascii=False, allow_nan=False) + "\n\n"
                if not cancel.is_set():
                    yield "data: [DONE]\n\n"
            finally:
                cancel.set()
        return StreamingResponse(body(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})
    router.include_router(compatible)
