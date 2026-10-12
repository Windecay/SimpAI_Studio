"""Browser-only management of inference API keys; never exposed as Agent tools."""
import secrets
from pathlib import Path

from fastapi import Request
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from modules.agent_api_contract import API_PREFIX, API_VERSION
from modules.agent_api_response import AgentJSONResponse as JSONResponse
from modules.agent_auth_api import _origin
from modules.agent_service import AgentAPIError
from modules.agent_vlm_contract import VLMModels
from modules.inference_keys import COOKIE_NAME, KEY_ID_PATTERN, KeyAction, KeyCreate, KeySettings, require_transport


def add_routes(router, service, authorization):
    def actor(request, payload=None):
        if request.headers.get("authorization"):
            raise AgentAPIError("browser_session_required", "Manage inference keys in your Studio browser session.", 403)
        require_transport(authorization, request)
        context, identity = authorization.actor(request)
        if payload is not None:
            if (not request.headers.get("origin") or _origin(request.headers["origin"]) != _origin(str(request.url))
                    or request.headers.get("sec-fetch-site") == "cross-site"):
                raise AgentAPIError("invalid_origin", "Key management requires a same-origin browser request.", 403)
            csrf = request.cookies.get(COOKIE_NAME, "")
            if not csrf or not secrets.compare_digest(csrf, payload.csrf_token):
                raise AgentAPIError("invalid_csrf_token", "Refresh inference key management and retry.", 403)
            if payload.binding_id != identity["binding_id"]:
                raise AgentAPIError("identity_context_changed", "The current identity or storage scope changed. Refresh this page.", 409)
        return context, identity

    def response(data, status=200):
        return JSONResponse({"ok": True, "api_version": API_VERSION, "data": data}, status_code=status,
                            headers={"Cache-Control": "no-store", "Pragma": "no-cache", "Referrer-Policy": "no-referrer"})

    @router.get("/auth/inference-keys", include_in_schema=False)
    async def listing(request: Request):
        context, identity = actor(request)
        authorization.rate_limit(("inference_key_list", context.user_id), 120)
        rows = await run_in_threadpool(authorization.inference_keys.listing, context.user_id)
        models = await run_in_threadpool(service.vlm.models, VLMModels(limit=100), context)
        prefix = str(request.scope.get("root_path") or "").rstrip("/")
        csrf = secrets.token_urlsafe(32)
        result = response({"items": rows, "models": models["items"], "binding_id": identity["binding_id"],
                           "csrf_token": csrf, "access_mode": identity["access_mode"],
                           "owner": context.user_id, "can_create": "vlm.infer" in identity["available_scopes"],
                           "api_base": prefix + API_PREFIX + "/llm", "default_expires_days": 90})
        result.set_cookie(COOKIE_NAME, csrf, httponly=True, samesite="strict", secure=request.url.scheme == "https",
                          path=prefix + API_PREFIX + "/auth/inference-keys", max_age=600)
        return result

    @router.post("/auth/inference-keys", include_in_schema=False)
    async def create(request: Request, payload: KeyCreate):
        context, identity = actor(request, payload)
        if "vlm.infer" not in identity["available_scopes"]:
            raise AgentAPIError("vlm_inference_not_allowed", "This identity cannot authorize local inference.", 403)
        authorization.rate_limit(("inference_key_create", context.user_id), 10)
        if not payload.allow_all_models:
            models = await run_in_threadpool(service.vlm.models, VLMModels(limit=100), context)
            if not set(payload.models).issubset(row["id"] for row in models["items"]):
                raise AgentAPIError("inference_key_model_unavailable", "Select installed local model IDs from this page.", 422)
        data = await run_in_threadpool(authorization.inference_keys.create, identity, payload)
        return response(data, 201)

    @router.post("/auth/inference-keys/{key_id}/revoke", include_in_schema=False)
    async def revoke(request: Request, key_id: str, payload: KeyAction):
        context, _ = actor(request, payload)
        if not KEY_ID_PATTERN.fullmatch(key_id):
            raise AgentAPIError("inference_key_not_found", "This inference key is unavailable.", 404)
        authorization.rate_limit(("inference_key_revoke", context.user_id), 60)
        await run_in_threadpool(authorization.inference_keys.revoke, key_id, context.user_id)
        return response({"revoked": True})

    @router.post("/auth/inference-keys/{key_id}/reveal", include_in_schema=False)
    async def reveal(request: Request, key_id: str, payload: KeyAction):
        context, _ = actor(request, payload)
        if not KEY_ID_PATTERN.fullmatch(key_id):
            raise AgentAPIError("inference_key_not_found", "This inference key is unavailable.", 404)
        authorization.rate_limit(("inference_key_reveal", context.user_id), 30)
        return response(await run_in_threadpool(authorization.inference_keys.reveal, key_id, context.user_id))

    @router.post("/auth/inference-keys/{key_id}/settings", include_in_schema=False)
    async def settings(request: Request, key_id: str, payload: KeySettings):
        context, identity = actor(request, payload)
        if "vlm.infer" not in identity["available_scopes"]:
            raise AgentAPIError("vlm_inference_not_allowed", "This identity cannot authorize local inference.", 403)
        if not KEY_ID_PATTERN.fullmatch(key_id):
            raise AgentAPIError("inference_key_not_found", "This inference key is unavailable.", 404)
        authorization.rate_limit(("inference_key_settings", context.user_id), 60)
        return response(await run_in_threadpool(authorization.inference_keys.settings, key_id, context.user_id, payload))

    @router.get("/connect/inference-key-script", include_in_schema=False)
    async def script():
        return FileResponse(Path(__file__).resolve().parents[1] / "javascript/inference_keys.js", media_type="text/javascript")
