"""Storage controls for the authenticated browser; agents can read status."""
import html
import json
from pathlib import Path
import secrets
from urllib.parse import urlsplit

from fastapi import Query, Request
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from modules import asset_lifecycle
from modules.agent_api_response import AgentJSONResponse as JSONResponse
from modules.agent_service import AgentAPIError, _require_context, identity_binding, require_identity_binding, require_scope


ROOT = Path(__file__).resolve().parents[1]
STRINGS = (
    "Asset storage", "Temporary assets", "Protected assets", "Available to clean", "Automatic cleanup",
    "Days since last use", "Storage limit (GiB, 0 = unlimited)", "Save settings", "Refresh", "Clean expired assets",
    "The default retention is 30 days since last use. New use restarts the retention period.",
    "Projects, templates, running tasks and assets marked Keep are protected. Original generated works are not deleted.",
    "Existing assets receive a full retention period when first indexed. Cleanup runs hourly while Studio is idle.",
    "The storage limit pauses new uploads and generation. It never deletes recent or protected assets early; running tasks may finish.",
    "Cleanup only removes expired, unused assets. Continue?", "Keep", "Allow expiration", "File", "Size", "Last used", "Protection", "Next page", "Previous page",
    "Settings saved.", "Cleanup complete: {count} files, {size} freed.", "Storage is full. Clean expired assets or increase the limit.",
    "Generation is active; cleanup is paused.", "The reference scan is incomplete. No assets will be deleted.",
    "Asset indexing is still in progress. Counts may be partial; refresh to continue.",
    "References changed during cleanup. Refresh and try again.", "Request failed. Refresh the page and check your Studio identity.",
    "Saved by you", "Referenced by a project", "Only remaining result copy", "Running task", "Temporary", "Expired", "No assets yet.",
)


class StoragePolicy(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    binding_id: str
    enabled: bool
    retention_days: int = Field(ge=1, le=365)
    max_gb: int = Field(ge=0, le=100000)


class StorageAction(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    binding_id: str


class StoragePin(StorageAction):
    entry_id: str = Field(pattern=r"^[0-9a-f]{32}$")
    pinned: bool


def render_page(lang, nonce, prefix, binding):
    dictionary = json.loads((ROOT / "language/cn.json").read_text(encoding="utf-8")) if lang == "cn" else {}
    strings = {key: dictionary.get(key, key) for key in STRINGS}
    t = lambda key: html.escape(strings[key])
    config = json.dumps({"stage": {"__lang": lang}, "strings": strings, "binding_id": binding,
                         "base": prefix + "/api/v1/assets/storage"}, ensure_ascii=False).replace("<", "\\u003c")
    return f'''<!doctype html><html lang="{'zh-CN' if lang == 'cn' else 'en'}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{t('Asset storage')} · SimpAI Studio</title>
<style nonce="{nonce}">
:root{{color-scheme:light dark;font:15px/1.6 system-ui,sans-serif}}
*{{box-sizing:border-box}}body{{margin:0;background:light-dark(#f5f6f8,#171a20);color:light-dark(#222,#eee)}}main{{max-width:1040px;margin:auto;padding:24px 18px 60px}}h1{{font-size:26px}}
section{{border:1px solid #8885;border-radius:12px;padding:18px;margin:18px 0;background:light-dark(white,#222731)}}.stats{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}}.stats strong{{display:block;font-size:22px}}.actions{{display:flex;gap:12px;flex-wrap:wrap}}
form{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 24px}}label{{display:flex;align-items:center;gap:10px;margin:0}}label:first-child,form button{{grid-column:1/-1;justify-self:start}}input,button{{font:inherit;padding:8px 12px;border:1px solid #8887;border-radius:7px}}input[type=number]{{width:100px;flex-shrink:0}}button{{cursor:pointer}}button.primary{{background:#d66d24;color:white;border-color:#d66d24}}button:disabled{{opacity:.5;cursor:default}}
#message:empty,#warning:empty{{display:none}}#warning{{color:light-dark(#a74200,#ffb879);margin-top:10px}}.table{{overflow:auto}}table{{width:100%;border-collapse:collapse}}td,th{{padding:10px;text-align:left;border-bottom:1px solid #8883}}td:first-child{{max-width:350px;overflow-wrap:anywhere}}p{{color:light-dark(#555,#bdc4ce)}}
@media(max-width:550px){{section{{padding:12px}}.stats{{gap:8px;font-size:13px}}.stats strong{{font-size:18px}}form{{grid-template-columns:1fr}}label{{flex-wrap:wrap}}thead{{display:none}}tbody{{display:block}}tr{{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;border-bottom:1px solid #8884;padding:12px 0}}td{{display:block;border:none;padding:3px 0;min-width:0}}td:first-child{{grid-column:1/-1;max-width:none}}td[data-label]::before{{content:attr(data-label);display:block;font-size:12px;opacity:.65}}td:last-child{{justify-self:end;align-self:end}}}}
</style></head><body><main><h1>{t('Asset storage')}</h1>
<section><div class="stats"><div>{t('Temporary assets')}<strong id="total">—</strong></div><div>{t('Protected assets')}<strong id="protected">—</strong></div><div>{t('Available to clean')}<strong id="reclaimable">—</strong></div></div><div id="warning" role="status"></div></section>
<section><form id="policy"><label><input id="enabled" type="checkbox"> {t('Automatic cleanup')}</label><label>{t('Days since last use')}<input id="days" type="number" min="1" max="365" required></label><label>{t('Storage limit (GiB, 0 = unlimited)')}<input id="limit" type="number" min="0" max="100000" required></label><button type="submit" class="primary">{t('Save settings')}</button></form>
<p>{t('The default retention is 30 days since last use. New use restarts the retention period.')}</p><p>{t('Projects, templates, running tasks and assets marked Keep are protected. Original generated works are not deleted.')}</p><p>{t('Existing assets receive a full retention period when first indexed. Cleanup runs hourly while Studio is idle.')}</p><p>{t('The storage limit pauses new uploads and generation. It never deletes recent or protected assets early; running tasks may finish.')}</p></section>
<section><div class="actions"><button id="refresh">{t('Refresh')}</button><button id="cleanup" class="primary" disabled>{t('Clean expired assets')}</button></div><p id="message" role="status"></p><div class="table"><table><thead><tr>{''.join('<th>'+t(key)+'</th>' for key in ('File','Size','Last used','Protection'))}<th></th></tr></thead><tbody id="files"></tbody></table></div><div class="actions"><button id="previous">{t('Previous page')}</button><button id="next">{t('Next page')}</button></div></section>
</main><script type="application/json" id="asset-storage-data">{config}</script><script src="{html.escape(prefix, quote=True)}/api/v1/assets/storage/script"></script></body></html>'''


def add_routes(router, authorization):
    def context(request, write=False, binding=""):
        value = authorization.request_context(request)
        _require_context(value)
        require_scope(value, "read")
        if write:
            if value.authorization is not None:
                raise AgentAPIError("browser_session_required", "Manage storage in your Studio browser session.", 403)
            origin = request.headers.get("origin")
            if request.headers.get("x-simpai-storage") != "1" or (origin and urlsplit(origin).netloc != request.url.netloc):
                raise AgentAPIError("invalid_storage_request", "Open storage management from Studio.", 403)
            require_identity_binding(value, binding)
            if not binding:
                raise AgentAPIError("identity_context_changed", "Refresh storage management.", 409)
        return value

    @router.get("/assets/storage", operation_id="simpai_asset_storage")
    async def status(request: Request, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200)):
        principal = context(request)
        result = await run_in_threadpool(asset_lifecycle.for_state(principal.state).status, offset, limit)
        prefix = str(request.scope.get("root_path") or "").rstrip("/")
        result["management_url"] = prefix + "/api/v1/assets/manage"
        return JSONResponse({"ok": True, "api_version": "1.0", "data": result}, headers={"Cache-Control": "no-store"})

    @router.get("/assets/manage", include_in_schema=False)
    async def page(request: Request, lang: str = ""):
        principal = context(request)
        lang = lang if lang in {"cn", "en"} else principal.state.get("__lang", "en")
        nonce = secrets.token_urlsafe(24)
        prefix = str(request.scope.get("root_path") or "").rstrip("/")
        return HTMLResponse(render_page(lang, nonce, prefix, identity_binding(principal)), headers={
            "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
            "Content-Security-Policy": f"default-src 'none'; script-src 'self'; style-src 'nonce-{nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
        })

    @router.get("/assets/storage/script", include_in_schema=False)
    async def script():
        return FileResponse(ROOT / "javascript/asset_storage.js", media_type="text/javascript")

    @router.post("/assets/storage/policy", include_in_schema=False)
    async def policy(request: Request, payload: StoragePolicy):
        principal = context(request, True, payload.binding_id)
        result = await run_in_threadpool(asset_lifecycle.for_state(principal.state).set_policy, payload.model_dump(exclude={"binding_id"}))
        return {"ok": True, "data": result}

    @router.post("/assets/storage/cleanup", include_in_schema=False)
    async def cleanup(request: Request, payload: StorageAction):
        principal = context(request, True, payload.binding_id)
        result = await run_in_threadpool(asset_lifecycle.for_state(principal.state).cleanup)
        return {"ok": True, "data": result}

    @router.post("/assets/storage/pin", include_in_schema=False)
    async def pin(request: Request, payload: StoragePin):
        principal = context(request, True, payload.binding_id)
        try:
            await run_in_threadpool(asset_lifecycle.for_state(principal.state).set_pin, payload.entry_id, payload.pinned)
        except ValueError as exc:
            raise AgentAPIError(str(exc), "Asset is unavailable to this identity.", 404) from exc
        return {"ok": True}
