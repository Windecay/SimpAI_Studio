"""Versioned HTTP adapter for the same service used by internal VLM tools."""

import logging
import secrets
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.utils import get_openapi
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.routing import APIRoute
from starlette.concurrency import run_in_threadpool

from modules.agent_api_contract import (
    API_PREFIX, API_VERSION, AssetUpload, ModelDownloadOptions, ModelQuery, PlanRequest, PresetOptions,
    PresetQuery, QueueQuery, RunRequest, ToolCall, ToolIndexQuery, tool_catalog, tool_definition, tool_index,
    ParameterProfileQuery, ParameterProfileRequest, ProfilePresetOptions,
    HelpQuery, HelpReadRequest,
    SkillQuery, SkillReadRequest, PresetRequest, PromptTagQuery, PromptValidationRequest,
    WorkflowImport, WorkflowLookup, WorkflowNodeTypes, WorkflowUpdate, WorkflowPreview, WorkflowRun,
    WD14Request,
)
from modules.agent_service import AgentAPIError, AgentContext, get_default_service
from modules.agent_api_response import AgentJSONResponse as JSONResponse


logger = logging.getLogger(__name__)


class PresetQueryParameters(PresetQuery):
    # URL query values arrive as text; JSON tool arguments remain strictly typed.
    model_config = {"strict": False, "extra": "forbid"}


class ToolIndexParameters(ToolIndexQuery):
    model_config = {"strict": False, "extra": "forbid"}


class ModelQueryParameters(ModelQuery):
    model_config = {"strict": False, "extra": "forbid"}


class QueueQueryParameters(QueueQuery):
    model_config = {"strict": False, "extra": "forbid"}


class ParameterProfileQueryParameters(ParameterProfileQuery):
    model_config = {"strict": False, "extra": "forbid"}


class HelpQueryParameters(HelpQuery):
    model_config = {"strict": False, "extra": "forbid"}


class HelpReadParameters(HelpReadRequest):
    model_config = {"strict": False, "extra": "forbid"}


class SkillQueryParameters(SkillQuery):
    model_config = {"strict": False, "extra": "forbid"}


class SkillReadParameters(SkillReadRequest):
    model_config = {"strict": False, "extra": "forbid"}


class AgentRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def handle(request):
            try:
                return await handler(request)
            except RequestValidationError as exc:
                details = [{"field": ".".join(map(str, item["loc"])), "message": item["msg"]} for item in exc.errors()]
                error = AgentAPIError("invalid_request", "The request does not match the API schema.", 422, details)
                return JSONResponse(error.payload(), status_code=error.status)
            except AgentAPIError as exc:
                payload = exc.payload()
                if exc.code in {"authentication_required", "invalid_agent_credential", "identity_context_changed"}:
                    prefix = str(request.scope.get("root_path") or "").rstrip("/")
                    payload["error"]["details"] = {**(exc.details if isinstance(exc.details, dict) else {}),
                                                  "auth_discovery_url": prefix + API_PREFIX + "/auth/discovery"}
                return JSONResponse(payload, status_code=exc.status, headers={"Cache-Control": "no-store"})
            except Exception:
                logger.exception("Studio Agent API operation failed: %s", request.url.path)
                error = AgentAPIError("operation_failed", "The Studio operation failed. Check the server log for details.", 500)
                return JSONResponse(error.payload(), status_code=500)

        return handle


def context_for_request(request, identity_resolver, state_resolver):
    payload = identity_resolver(request, {})
    return AgentContext(state=state_resolver(payload), user_context=dict(payload.get("user_context") or {}))


def _public_urls(value, root_path):
    if not root_path:
        return value
    if isinstance(value, dict):
        return {key: root_path + item if key.endswith(("_url", "_base")) and isinstance(item, str) and item.startswith(API_PREFIX)
                else _public_urls(item, root_path) for key, item in value.items()}
    if isinstance(value, list):
        return [_public_urls(item, root_path) for item in value]
    return value


def create_router(context_resolver, service=None, authorization=None):
    from modules.agent_auth import AgentAuthorization
    from modules.agent_auth_api import add_auth_routes
    service = service or get_default_service()
    authorization = authorization or AgentAuthorization(context_resolver)
    router = APIRouter(prefix=API_PREFIX, tags=["Studio Agent API"], route_class=AgentRoute)

    async def call(name, arguments, request, status=200):
        context = authorization.request_context(request)
        if name in {"simpai.vlm.chat", "simpai.vlm.analyze"}:
            from pydantic import ValidationError
            from modules.agent_api_contract import OPERATIONS
            from modules.agent_vlm_api import complete_http
            try:
                payload = OPERATIONS[name][0].model_validate(arguments)
            except ValidationError:
                raise AgentAPIError("invalid_request", "The request does not match the inference schema.", 422)
            data = await complete_http(request, payload, service, authorization, analyze=name.endswith(".analyze"))
            result = {"ok": True, "api_version": API_VERSION, "data": data}
        else:
            result = await run_in_threadpool(service.execute, name, arguments, context)
        result = _public_urls(result, str(request.scope.get("root_path") or "").rstrip("/"))
        return JSONResponse(result, status_code=status, headers={"Cache-Control": "no-store"})

    @router.get("", include_in_schema=False)
    @router.get("/capabilities", operation_id="simpai_capabilities")
    async def capabilities(request: Request):
        return await call("simpai.capabilities", {}, request)

    @router.get("/connect", include_in_schema=False)
    async def connection_guide(request: Request, lang: str = "en", theme: str = ""):
        from modules.agent_connection_view import render_connection_page
        nonce = secrets.token_urlsafe(24)
        prefix = str(request.scope.get("root_path") or "").rstrip("/")
        return HTMLResponse(render_connection_page(lang, theme if theme in {"light", "dark"} else "", nonce, prefix), headers={
            "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
            "Content-Security-Policy": f"default-src 'none'; script-src 'self'; style-src 'nonce-{nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
        })

    @router.get("/connect/script", include_in_schema=False)
    async def connection_script():
        return FileResponse(Path(__file__).resolve().parents[1] / "javascript/agent_connection.js", media_type="text/javascript")

    @router.get("/tools", operation_id="simpai_tools")
    async def tools(request: Request):
        await call("simpai.capabilities", {}, request)
        return {"ok": True, "api_version": API_VERSION, "data": {"tools": tool_catalog()}}

    @router.get("/tools/index", operation_id="simpai_tool_index")
    async def tools_index(request: Request, filters: Annotated[ToolIndexParameters, Query()]):
        await call("simpai.capabilities", {}, request)
        result = {"ok": True, "api_version": API_VERSION, "data": tool_index(filters)}
        return JSONResponse(_public_urls(result, str(request.scope.get("root_path") or "").rstrip("/")),
                            headers={"Cache-Control": "no-store"})

    @router.post("/tools/call", operation_id="simpai_tool_call")
    async def tool_call(request: Request, payload: ToolCall):
        return await call(payload.name, payload.arguments, request)

    @router.get("/tools/{tool_name}", operation_id="simpai_tool_detail")
    async def tool_detail(request: Request, tool_name: str):
        await call("simpai.capabilities", {}, request)
        try:
            data = tool_definition(tool_name)
        except KeyError:
            raise AgentAPIError("tool_not_found", "Unknown Studio operation.", 404) from None
        data["call_url"] = f"{API_PREFIX}/tools/call"
        result = {"ok": True, "api_version": API_VERSION, "data": data}
        return JSONResponse(_public_urls(result, str(request.scope.get("root_path") or "").rstrip("/")),
                            headers={"Cache-Control": "no-store"})

    @router.get("/session", operation_id="simpai_session_get")
    async def session(request: Request):
        return await call("simpai.session.get", {}, request)

    @router.get("/queue", operation_id="simpai_queue_get")
    async def queue(request: Request, filters: Annotated[QueueQueryParameters, Query()]):
        return await call("simpai.queue.get", filters.model_dump(), request)

    @router.get("/system/status", operation_id="simpai_system_status")
    async def system_status(request: Request):
        return await call("simpai.system.status", {}, request)

    @router.get("/presets", operation_id="simpai_presets_list")
    async def presets(request: Request, filters: Annotated[PresetQueryParameters, Query()]):
        return await call("simpai.presets.list", filters.model_dump(), request)

    @router.get("/presets/{preset_id}", operation_id="simpai_presets_get")
    async def preset(request: Request, preset_id: str, options: Annotated[PresetOptions, Query()]):
        return await call("simpai.presets.get", {"preset_id": preset_id, **options.model_dump()}, request)

    @router.get("/presets/{preset_id}/models/status", operation_id="simpai_models_status")
    async def model_status(request: Request, preset_id: str, options: Annotated[ProfilePresetOptions, Query()]):
        return await call("simpai.models.status", {"preset_id": preset_id, **options.model_dump()}, request)

    @router.post("/presets/{preset_id}/models/download", operation_id="simpai_models_download", status_code=202)
    async def download_models(request: Request, preset_id: str, options: ModelDownloadOptions):
        return await call("simpai.models.download", {"preset_id": preset_id, **options.model_dump()}, request, status=202)

    @router.get("/models", operation_id="simpai_models_list")
    async def models(request: Request, filters: Annotated[ModelQueryParameters, Query()]):
        return await call("simpai.models.list", filters.model_dump(), request)

    @router.get("/parameter-profiles", operation_id="simpai_parameter_profiles_list")
    async def parameter_profiles(request: Request, filters: Annotated[ParameterProfileQueryParameters, Query()]):
        return await call("simpai.parameter_profiles.list", filters.model_dump(), request)

    @router.get("/parameter-profiles/detail", operation_id="simpai_parameter_profiles_get")
    async def parameter_profile(request: Request, reference: Annotated[ParameterProfileRequest, Query()]):
        return await call("simpai.parameter_profiles.get", reference.model_dump(), request)

    @router.get("/help", operation_id="simpai_help_search")
    async def help_search(request: Request, filters: Annotated[HelpQueryParameters, Query()]):
        return await call("simpai.help.search", filters.model_dump(), request)

    @router.get("/skills", operation_id="simpai_skills_list")
    async def skills(request: Request, filters: Annotated[SkillQueryParameters, Query()]):
        return await call("simpai.skills.list", filters.model_dump(), request)

    @router.get("/skills/document", operation_id="simpai_skills_read")
    async def skill(request: Request, options: Annotated[SkillReadParameters, Query()]):
        return await call("simpai.skills.read", options.model_dump(), request)

    @router.get("/prompts/guidance", operation_id="simpai_prompts_guidance")
    async def prompt_guidance(request: Request, options: Annotated[PresetRequest, Query()]):
        return await call("simpai.prompts.guidance", options.model_dump(), request)

    @router.post("/prompts/tags", operation_id="simpai_prompts_tags")
    async def prompt_tags(request: Request, payload: PromptTagQuery):
        return await call("simpai.prompts.tags", payload.model_dump(), request)

    @router.post("/prompts/validate", operation_id="simpai_prompts_validate")
    async def prompt_validate(request: Request, payload: PromptValidationRequest):
        return await call("simpai.prompts.validate", payload.model_dump(), request)

    @router.get("/prompts/wd14/status", operation_id="simpai_prompts_wd14_status")
    async def wd14_status(request: Request):
        return await call("simpai.prompts.wd14_status", {}, request)

    @router.post("/prompts/wd14", operation_id="simpai_prompts_wd14")
    async def wd14(request: Request, payload: WD14Request):
        return await call("simpai.prompts.wd14", payload.model_dump(), request)

    @router.get("/help/document", operation_id="simpai_help_read")
    async def help_read(request: Request, options: Annotated[HelpReadParameters, Query()]):
        return await call("simpai.help.read", options.model_dump(), request)

    @router.post("/routes/preview", operation_id="simpai_routes_preview")
    async def preview(request: Request, payload: PlanRequest):
        return await call("simpai.routes.preview", payload.model_dump(exclude_unset=True), request)

    @router.post("/runs", operation_id="simpai_runs_submit", status_code=202)
    async def submit(request: Request, payload: RunRequest):
        return await call("simpai.runs.submit", payload.model_dump(exclude_unset=True), request, status=202)

    @router.get("/runs/{run_id}", operation_id="simpai_runs_get")
    async def run(request: Request, run_id: str):
        return await call("simpai.runs.get", {"run_id": run_id}, request)

    @router.post("/runs/{run_id}/cancel", operation_id="simpai_runs_cancel")
    async def cancel(request: Request, run_id: str):
        return await call("simpai.runs.cancel", {"run_id": run_id}, request)

    @router.post("/assets", operation_id="simpai_assets_upload", status_code=201)
    async def upload(request: Request, payload: AssetUpload):
        return await call("simpai.assets.upload", payload.model_dump(), request, status=201)

    @router.get("/assets/{asset_id}/content", operation_id="simpai_assets_content")
    async def content(request: Request, asset_id: str):
        asset = await run_in_threadpool(service.asset_content, asset_id, authorization.request_context(request))
        return FileResponse(asset["path"], media_type=asset.get("mime"), filename=asset.get("name") or None,
                            headers={"Cache-Control": "no-store"})

    @router.post("/workflows", operation_id="simpai_workflows_import", status_code=201)
    async def workflow_import(request: Request, payload: WorkflowImport):
        return await call("simpai.workflows.import", payload.model_dump(), request, status=201)

    @router.post("/workflows/node-types", operation_id="simpai_workflows_node_types")
    async def workflow_node_types(request: Request, payload: WorkflowNodeTypes):
        return await call("simpai.workflows.node_types", payload.model_dump(), request)

    @router.get("/workflows/{workflow_id}", operation_id="simpai_workflows_get")
    async def workflow_get(request: Request, workflow_id: str, offset: int = 0, limit: int = 20):
        return await call("simpai.workflows.get", {"workflow_id": workflow_id, "offset": offset, "limit": limit}, request)

    @router.get("/workflows/{workflow_id}/content", operation_id="simpai_workflows_content")
    async def workflow_content(request: Request, workflow_id: str):
        result = await run_in_threadpool(service.workflow_content, workflow_id, authorization.request_context(request))
        return JSONResponse(result, headers={"Cache-Control": "no-store",
                                            "Content-Disposition": 'attachment; filename="workflow.json"'})

    @router.post("/workflows/{workflow_id}/update", operation_id="simpai_workflows_update")
    async def workflow_update(request: Request, workflow_id: str, payload: WorkflowUpdate):
        if workflow_id != payload.workflow_id:
            raise AgentAPIError("workflow_id_mismatch", "Path and body must identify the same workflow.", 422)
        return await call("simpai.workflows.update", payload.model_dump(), request)

    @router.post("/workflows/{workflow_id}/preview", operation_id="simpai_workflows_preview")
    async def workflow_preview(request: Request, workflow_id: str, payload: WorkflowPreview):
        if workflow_id != payload.workflow_id:
            raise AgentAPIError("workflow_id_mismatch", "Path and body must identify the same workflow.", 422)
        return await call("simpai.workflows.preview", payload.model_dump(), request)

    @router.post("/workflows/{workflow_id}/runs", operation_id="simpai_workflows_submit", status_code=202)
    async def workflow_submit(request: Request, workflow_id: str, payload: WorkflowRun):
        if workflow_id != payload.workflow_id:
            raise AgentAPIError("workflow_id_mismatch", "Path and body must identify the same workflow.", 422)
        return await call("simpai.workflows.submit", payload.model_dump(), request, status=202)

    @router.get("/openapi.json", include_in_schema=False)
    async def openapi(request: Request):
        prefix = str(request.scope.get("root_path") or "").rstrip("/")
        return get_openapi(title="SimpAI Studio Agent API", version=API_VERSION,
                           description="Shared preset discovery, planning, asset and generation operations. Local mode uses the local workspace; multi-user mode uses the Studio session.",
                           routes=router.routes, servers=[{"url": prefix or "/"}])

    from modules.agent_vlm_api import add_routes as add_vlm_routes
    add_vlm_routes(router, service, authorization, call)
    add_auth_routes(router, authorization)
    return router
