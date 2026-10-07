"""Transport-side authorization endpoints; access tokens are not VLM tools."""

import secrets
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urlsplit

from fastapi import Request
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from pydantic import Field
from starlette.concurrency import run_in_threadpool

from modules.agent_api_contract import API_PREFIX, API_VERSION, RequestModel
from modules.agent_auth import ConsentRequest, DeviceRequest, RefreshRequest, TokenRequest, authorization_transport, secure_transport
from modules.agent_auth_view import render_page
from modules.agent_login import BrowserIdentityLogin, IdentityImageRequest, IdentityLoginRequest, LOGIN_COOKIE
from modules.agent_service import AgentAPIError
from modules.agent_api_response import AgentJSONResponse as JSONResponse


class RevokeRequest(RequestModel):
    csrf_token: str = Field(min_length=40, max_length=100)


def _origin(value):
    try:
        url = urlsplit(value)
        return url.scheme, url.hostname, url.port or (443 if url.scheme == "https" else 80)
    except ValueError as exc:
        raise AgentAPIError("invalid_origin", "Invalid browser origin.", 403) from exc


def browser_post(request):
    secure_transport(request)
    if not request.headers.get("origin") or _origin(request.headers["origin"]) != _origin(str(request.url)):
        raise AgentAPIError("invalid_origin", "Authorization changes require a same-origin browser request.", 403)
    if request.headers.get("sec-fetch-site") == "cross-site":
        raise AgentAPIError("invalid_origin", "Cross-site authorization requests are not allowed.", 403)


def add_auth_routes(router, authorization):
    login = BrowserIdentityLogin(authorization)

    def prefix(request):
        return str(request.scope.get("root_path") or "").rstrip("/")

    def response(data, status=200):
        return JSONResponse({"ok": True, "api_version": API_VERSION, "data": data}, status_code=status,
                            headers={"Cache-Control": "no-store", "Pragma": "no-cache"})

    def browser_only(request):
        if request.headers.get("authorization"):
            raise AgentAPIError("browser_session_required", "Sign-in is available only in the browser.", 403)

    def pairing_url(request, path, user_code, lang):
        return prefix(request) + API_PREFIX + path + "?" + urlencode({"user_code": user_code, "lang": lang})

    def page(data, request, lang, grants=None, csrf_cookie=None):
        nonce = secrets.token_urlsafe(24)
        result = HTMLResponse(render_page(data, lang, nonce, prefix(request), grants=grants),
                              headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
                                       "X-Frame-Options": "DENY",
                                       "Content-Security-Policy": f"default-src 'none'; script-src 'nonce-{nonce}'; style-src 'nonce-{nonce}'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"})
        if csrf_cookie:
            result.set_cookie("simpai_agent_csrf", csrf_cookie, secure=request.url.scheme == "https",
                              httponly=True, samesite="strict", path=prefix(request) + API_PREFIX + "/auth", max_age=600)
        return result

    @router.get("/auth/login", include_in_schema=False)
    async def login_page(request: Request, user_code: str = "", lang: str = ""):
        secure_transport(request)
        browser_only(request)
        authorization.rate_limit(("login_view", request.client.host), 30)
        context = authorization.browser_context(request)
        language = lang if lang in {"cn", "en"} else context.state.get("__lang") or "en"
        try:
            csrf = await run_in_threadpool(login.issue, request, user_code)
        except AgentAPIError as exc:
            if exc.code not in {"pairing_not_found", "expired_token", "pairing_closed", "invalid_user_code"}:
                raise
            return page({"entry": True, "error_code": exc.code,
                         "entry_url": prefix(request) + API_PREFIX + "/auth/authorize"}, request, language)
        result = page({"login": True, "user_code": user_code, "csrf_token": csrf,
                       "login_url": prefix(request) + API_PREFIX + "/auth/login?" + urlencode({"lang": language}),
                       "image_url": prefix(request) + API_PREFIX + "/auth/login/identity",
                       "back_url": pairing_url(request, "/auth/authorize", user_code, language)},
                      request, language)
        result.set_cookie(LOGIN_COOKIE, csrf, secure=request.url.scheme == "https",
                          httponly=True, samesite="strict", path=prefix(request) + API_PREFIX + "/auth", max_age=600)
        return result

    @router.post("/auth/login/identity", include_in_schema=False)
    async def login_image(request: Request, payload: IdentityImageRequest):
        browser_post(request)
        browser_only(request)
        authorization.rate_limit(("login_image", request.client.host), 20)
        return response(await run_in_threadpool(login.read_image, request, payload))

    @router.post("/auth/login", include_in_schema=False)
    async def sign_in(request: Request, payload: IdentityLoginRequest, lang: str = ""):
        browser_post(request)
        browser_only(request)
        authorization.rate_limit(("login", request.client.host), 10)
        context = authorization.browser_context(request)
        language = lang if lang in {"cn", "en"} else context.state.get("__lang") or "en"
        session, lifetime = await run_in_threadpool(login.sign_in, request, payload)
        result = response({"next_url": pairing_url(request, "/auth/authorize", payload.user_code, language)})
        # Keep the same cookie contract as Studio's identity card; no token is returned in JSON.
        result.set_cookie("aitoken", session, max_age=lifetime, path="/",
                          samesite="lax", secure=request.url.scheme == "https")
        result.delete_cookie(LOGIN_COOKIE, path=prefix(request) + API_PREFIX + "/auth",
                             httponly=True, samesite="strict", secure=request.url.scheme == "https")
        return result

    @router.get("/auth/discovery", operation_id="simpai_auth_discovery")
    async def discovery(request: Request):
        from ui.frontend_loopback import local_endpoint_for_request
        data = authorization.discovery()
        data["transport"] = authorization_transport(request)
        data["pairing_available"] = data["transport"]["satisfied"]
        data["connection_guide_url"] = prefix(request) + API_PREFIX + "/connect"
        data["next_step"] = ("inspect_session" if not data["authentication_required"] else
                             "browser_pairing" if data["pairing_available"] else "configure_https_or_loopback")
        local_endpoint = local_endpoint_for_request(request)
        if local_endpoint:
            data["local_endpoint"] = {**local_endpoint, "service_id": data["service_id"]}
            if data["authentication_required"] and not data["pairing_available"]:
                data["next_step"] = "use_local_endpoint"
        for key in ("device_url", "token_url", "refresh_url", "session_url", "authorization_url"):
            data[key] = prefix(request) + data[key]
        return response(data)

    @router.get("/auth/brand", include_in_schema=False)
    async def brand():
        return FileResponse(Path(__file__).resolve().parents[1] / "presets/image/simpai_logo.jpg", media_type="image/jpeg")

    @router.post("/auth/device", operation_id="simpai_auth_device")
    async def device(request: Request, payload: DeviceRequest):
        secure_transport(request)
        authorization.rate_limit(("device", request.client.host), 10)
        data = await run_in_threadpool(authorization.create, payload)
        data["verification_url"] = prefix(request) + data["verification_url"]
        return response(data, 201)

    @router.post("/auth/token", operation_id="simpai_auth_token")
    async def token(request: Request, payload: TokenRequest):
        secure_transport(request)
        authorization.rate_limit(("token", request.client.host), 120)
        data = await run_in_threadpool(authorization.store.exchange, payload.device_code, authorization.check_identity)
        return response(data, 202 if data["state"] == "authorization_pending" else 200)

    @router.post("/auth/refresh", operation_id="simpai_auth_refresh")
    async def refresh(request: Request, payload: RefreshRequest):
        secure_transport(request)
        authorization.rate_limit(("refresh", request.client.host), 120)
        data = await run_in_threadpool(authorization.store.refresh, payload.refresh_token, authorization.check_identity)
        return response(data)

    @router.get("/auth/authorize", include_in_schema=False)
    async def authorize(request: Request, user_code: str = "", lang: str = ""):
        secure_transport(request)
        authorization.rate_limit(("view", request.client.host), 30)
        context = authorization.browser_context(request)
        language = lang if lang in {"cn", "en"} else context.state.get("__lang") or "en"
        if not user_code:
            return page({"entry": True, "entry_url": prefix(request) + API_PREFIX + "/auth/authorize"},
                        request, language)
        identity = None
        display_identity = None
        try:
            _, identity = authorization.actor(request)
            display_identity = identity
        except AgentAPIError as exc:
            if exc.code not in {"authentication_required", "account_not_allowed"}:
                raise
            if exc.code == "account_not_allowed":
                display_identity = authorization.identity.describe(context)
        try:
            original, nonce = await run_in_threadpool(authorization.store.view, user_code, identity)
        except AgentAPIError as exc:
            if exc.code not in {"pairing_not_found", "expired_token", "pairing_closed", "invalid_user_code"}:
                raise
            return page({"entry": True, "error_code": exc.code,
                         "entry_url": prefix(request) + API_PREFIX + "/auth/authorize"}, request, language)
        login_page_url = pairing_url(request, "/auth/login", user_code, language)
        if identity is None and display_identity is None and authorization.identity.mode() == "multi-user":
            return RedirectResponse(login_page_url, status_code=303,
                                    headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})
        return page({"request": original, "identity": display_identity, "can_authorize": identity is not None, "user_code": user_code,
                     "csrf_token": nonce, "login_page_url": login_page_url,
                     "decision_url": prefix(request) + API_PREFIX + "/auth/decision"}, request, language)

    @router.post("/auth/decision", operation_id="simpai_auth_decision")
    async def decision(request: Request, payload: ConsentRequest):
        browser_post(request)
        _, identity = authorization.actor(request)
        await run_in_threadpool(authorization.store.decide, payload, identity)
        return response({"state": "approved" if payload.decision == "approve" else "denied"})

    @router.get("/auth/credentials", operation_id="simpai_auth_credentials")
    async def credentials(request: Request):
        secure_transport(request)
        context, _ = authorization.actor(request)
        return response({"items": await run_in_threadpool(authorization.store.listing, context.user_id)})

    @router.get("/auth/authorizations", include_in_schema=False)
    async def authorizations(request: Request, lang: str = ""):
        secure_transport(request)
        context, identity = authorization.actor(request)
        rows = await run_in_threadpool(authorization.store.listing, context.user_id)
        grants = [{**row, "expires_at": datetime.fromtimestamp(row["authorization_expires"], timezone.utc).isoformat()} for row in rows]
        csrf = secrets.token_urlsafe(32)
        return page({"identity": identity, "csrf_token": csrf,
                     "credentials_url": prefix(request) + API_PREFIX + "/auth/credentials"},
                    request, lang or context.state.get("__lang"), grants=grants, csrf_cookie=csrf)

    @router.post("/auth/credentials/{credential_id}/revoke", operation_id="simpai_auth_credential_revoke")
    async def revoke(request: Request, credential_id: str, payload: RevokeRequest):
        browser_post(request)
        context, _ = authorization.actor(request)
        if not secrets.compare_digest(request.cookies.get("simpai_agent_csrf", ""), payload.csrf_token):
            raise AgentAPIError("invalid_csrf_token", "Reload the authorization-management page.", 403)
        await run_in_threadpool(authorization.store.revoke, credential_id, context.user_id)
        return response({"revoked": True})

    @router.post("/auth/revoke", operation_id="simpai_auth_revoke_self")
    async def revoke_self(request: Request):
        context = authorization.request_context(request)
        if context.authorization is None:
            raise AgentAPIError("agent_credential_required", "An Agent Bearer credential is required.", 401)
        await run_in_threadpool(authorization.store.revoke, context.authorization["id"], context.user_id)
        return response({"revoked": True})
