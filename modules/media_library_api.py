"""Standalone media library page and API routes."""

from __future__ import annotations

import asyncio
import hashlib
import os
import threading
import time
from typing import Any
from urllib.parse import quote, unquote

import shared
from fastapi import APIRouter, Body, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from starlette.concurrency import run_in_threadpool

from modules import media_library
from modules.media_library_page import render_media_library_html


router = APIRouter()
_scan_tasks: dict[str, asyncio.Task[Any]] = {}
_scan_tasks_lock = threading.RLock()
_IDENTITY_CACHE: dict[tuple[str, str], tuple[float, str, bool]] = {}
_IDENTITY_CACHE_LOCK = threading.RLock()
_IDENTITY_CACHE_TTL = 30.0


def _root_path(request: Request) -> str:
    return str((request.scope or {}).get("root_path") or "").rstrip("/")


def _api_base(request: Request) -> str:
    return f"{_root_path(request)}/simpleai/gallery"


def _cookie_value(request: Request | None, key: str) -> str:
    if request is None:
        return ""
    try:
        cookie_header = str(request.headers.get("cookie") or "")
    except Exception:
        return ""
    for part in cookie_header.split(";"):
        name, separator, value = part.strip().partition("=")
        if separator and name.strip() == key:
            return unquote(value.strip())
    return ""


def _request_identity_state(request: Request | None = None) -> tuple[str, str, bool]:
    """Return ``(did, ua_hash, invalid_session)`` for a request cookie."""
    session = _cookie_value(request, "aitoken")
    if not session or shared.token is None or not hasattr(shared.token, "check_sstoken_and_get_did"):
        return "", "", False
    user_agent = str(request.headers.get("user-agent") or "") if request is not None else ""
    ua_hash = hashlib.sha256(user_agent.encode("utf-8")).hexdigest()
    cache_key = (session, ua_hash)
    now = time.monotonic()
    with _IDENTITY_CACHE_LOCK:
        cached = _IDENTITY_CACHE.get(cache_key)
        if cached and now - cached[0] < _IDENTITY_CACHE_TTL:
            return cached[1], ua_hash, cached[2]
    try:
        did = str(shared.token.check_sstoken_and_get_did(session, ua_hash) or "").strip()
        if did and did != "Unknown":
            resolved = media_library.resolve_user_did(did)
            invalid = False
        else:
            resolved = ""
            invalid = True
    except Exception:
        resolved = ""
        invalid = True
    with _IDENTITY_CACHE_LOCK:
        _IDENTITY_CACHE[cache_key] = (now, resolved, invalid)
    return resolved, ua_hash, invalid


def _request_identity_did(request: Request | None = None) -> str:
    """Resolve the authenticated identity from the same aitoken contract as the main UI."""
    did, _ua_hash, _invalid = _request_identity_state(request)
    return did


def _guest_session_for_invalid_request(request: Request | None = None) -> str:
    """Create a valid guest session when the browser sent a stale aitoken."""
    _did, ua_hash, invalid = _request_identity_state(request)
    if not invalid or not ua_hash or shared.token is None or not hasattr(shared.token, "get_guest_sstoken"):
        return ""
    try:
        session = str(shared.token.get_guest_sstoken(ua_hash) or "").strip()
        return session
    except Exception:
        return ""


def _user_did_from_payload(payload: Any = None, request: Request | None = None) -> str:
    request_did = _request_identity_did(request)
    if request_did:
        return request_did
    user_context = payload.get("user_context") if isinstance(payload, dict) and isinstance(payload.get("user_context"), dict) else {}
    scope = str(user_context.get("scope") or "").strip().lower()
    candidate = str(user_context.get("user_did") or (payload or {}).get("user_did") or "").strip() if isinstance(payload, dict) else ""
    if candidate and scope and scope != "local":
        return media_library.resolve_user_did(candidate)
    try:
        if shared.token is not None and hasattr(shared.token, "get_guest_did"):
            return media_library.resolve_user_did(shared.token.get_guest_did())
    except Exception:
        pass
    return "guest"


def _library_for_request(payload: Any = None, request: Request | None = None) -> media_library.MediaLibrary:
    return media_library.get_user_media_library(_user_did_from_payload(payload, request=request))


def _legacy_gallery_preview_url(
    request: Request,
    item: dict[str, Any],
    library: media_library.MediaLibrary,
) -> str:
    """Reuse the Gradio gallery poster cache for active videos when available."""

    if item.get("media_type") != "video" or item.get("is_trashed"):
        return ""
    source = media_library._path_under(library.outputs_root, item.get("relative_path") or "")
    if not source or not os.path.isfile(source):
        return ""
    try:
        from enhanced import gallery as gallery_util

        name_builder = getattr(gallery_util, "_gallery_display_preview_name", None)
        preview_name = str(name_builder(source) or "").strip() if callable(name_builder) else ""
    except (Exception, SystemExit):
        preview_name = ""
    if not preview_name:
        return ""
    return f"{_root_path(request)}/simpleai/gallery-preview/{quote(preview_name, safe='')}"


def _item_urls(
    request: Request,
    item: dict[str, Any],
    library: media_library.MediaLibrary | None = None,
) -> dict[str, Any]:
    base = _api_base(request)
    media_id = quote(str(item.get("media_id") or ""), safe="")
    trash_query = "?trash=1" if item.get("is_trashed") else ""
    item["media_url"] = f"{base}/media/{media_id}{trash_query}"
    item["download_url"] = f"{base}/download/{media_id}{trash_query}"
    if item.get("media_type") in {"image", "video"}:
        version = str(item.get("mtime_ns") or item.get("indexed_at") or "0")
        version_param = f"v={quote(version, safe='')}"
        if item.get("is_trashed"):
            version_param = f"trash=1&{version_param}"
        item["thumbnail_url"] = f"{base}/thumbnail/{media_id}?{version_param}"
        if item.get("media_type") == "video":
            legacy_url = _legacy_gallery_preview_url(request, item, library) if library is not None else ""
            if legacy_url:
                item["thumbnail_url"] = legacy_url
                item["poster_ready"] = True
            else:
                # The standalone page does not create a second video poster cache.
                # The frontend renders its normal video placeholder when Gradio
                # has no usable preview route (for example, for trashed media).
                item["thumbnail_url"] = ""
                item["poster_ready"] = False
    return item


async def _run_scan(library: media_library.MediaLibrary, *, max_seconds: float | None = 120.0) -> dict[str, Any]:
    return await run_in_threadpool(lambda: library.scan(max_seconds=max_seconds))


def _schedule_scan(library: media_library.MediaLibrary, *, force: bool = False) -> bool:
    key = library.db_path
    with _scan_tasks_lock:
        current = _scan_tasks.get(key)
        if current and not current.done():
            return False
        if not force and os.path.exists(library.db_path):
            return False

        async def runner() -> None:
            try:
                await _run_scan(library)
            finally:
                with _scan_tasks_lock:
                    _scan_tasks.pop(key, None)

        try:
            task = asyncio.create_task(runner())
        except RuntimeError:
            return False
        _scan_tasks[key] = task
        return True


async def _schedule_scan_if_needed(library: media_library.MediaLibrary, *, force: bool = False) -> bool:
    if not force and os.path.exists(library.db_path):
        try:
            changed = await run_in_threadpool(library.has_filesystem_changes)
        except Exception:
            changed = False
        if not changed:
            return False
    return _schedule_scan(library, force=force)


def _bool_query(value: Any) -> bool | None:
    text = str(value or "").strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return None


@router.get("/simpleai/gallery/app")
async def media_library_app(request: Request):
    query = request.query_params
    theme = str(query.get("__theme") or "light")
    lang = str(query.get("__lang") or query.get("lang") or "en")
    library = _library_for_request(request=request)
    await _schedule_scan_if_needed(library)
    response = HTMLResponse(
        render_media_library_html(root_path=_root_path(request), theme=theme, lang=lang),
        headers={"Cache-Control": "no-store"},
    )
    guest_session = _guest_session_for_invalid_request(request)
    if guest_session:
        response.set_cookie("aitoken", guest_session, max_age=90 * 24 * 60 * 60, path="/", samesite="lax")
    return response


@router.get("/simpleai/gallery/api/dates")
async def media_library_dates(request: Request):
    library = _library_for_request(request=request)
    await _schedule_scan_if_needed(library)
    include_trashed = _bool_query(request.query_params.get("trash")) is True
    dates = await run_in_threadpool(lambda: library.date_summary(include_trashed=include_trashed))
    return {"ok": True, "dates": dates}


@router.get("/simpleai/gallery/api/items")
async def media_library_items(request: Request):
    query = request.query_params
    favorite = _bool_query(query.get("favorite"))
    include_trashed = _bool_query(query.get("trash")) is True
    try:
        limit = int(query.get("limit") or 48)
    except (TypeError, ValueError):
        limit = 48
    library = _library_for_request(request=request)
    await _schedule_scan_if_needed(library)
    result = await run_in_threadpool(
        lambda: library.list_items(
            date_key=query.get("date") or None,
            media_type=query.get("type") or None,
            query=query.get("q") or None,
            favorite=favorite,
            cursor=query.get("cursor") or None,
            limit=limit,
            sort=query.get("sort") or "newest",
            include_date_summary=_bool_query(query.get("summary")) is not False,
            include_trashed=include_trashed,
        )
    )
    result["items"] = [_item_urls(request, item, library) for item in result.get("items") or []]
    return result


@router.get("/simpleai/gallery/api/items/{media_id}")
async def media_library_item(request: Request, media_id: str):
    library = _library_for_request(request=request)
    include_trashed = _bool_query(request.query_params.get("trash")) is True
    item = await run_in_threadpool(lambda: library.get_item(media_id, include_trashed=include_trashed))
    if not item:
        return JSONResponse({"ok": False, "error": "Media item not found."}, status_code=404)
    return {"ok": True, "item": _item_urls(request, item, library)}


@router.patch("/simpleai/gallery/api/items/{media_id}")
async def media_library_update_item(request: Request, media_id: str, payload: dict = Body(default={})):  # noqa: B008
    if not isinstance(payload, dict):
        return JSONResponse({"ok": False, "error": "Payload must be an object."}, status_code=400)
    allowed = {key: payload[key] for key in ("title", "tags", "rating", "favorite", "notes") if key in payload}
    if "tags" in allowed and isinstance(allowed["tags"], str):
        allowed["tags"] = [value.strip() for value in allowed["tags"].split(",")]
    library = _library_for_request(payload, request=request)
    item = await run_in_threadpool(lambda: library.update_user_metadata(media_id, **allowed))
    if not item:
        return JSONResponse({"ok": False, "error": "Media item not found."}, status_code=404)
    return {"ok": True, "item": _item_urls(request, item, library)}


@router.post("/simpleai/gallery/api/items/trash")
async def media_library_trash(request: Request, payload: dict = Body(default={})):  # noqa: B008
    ids = payload.get("ids") if isinstance(payload, dict) else []
    if not isinstance(ids, list):
        return JSONResponse({"ok": False, "error": "ids must be a list."}, status_code=400)
    result = await run_in_threadpool(lambda: _library_for_request(payload, request=request).trash_items(ids))
    return JSONResponse(result, status_code=200 if result.get("ok") else 400)


@router.post("/simpleai/gallery/api/items/restore")
async def media_library_restore(request: Request, payload: dict = Body(default={})):  # noqa: B008
    ids = payload.get("ids") if isinstance(payload, dict) else []
    if not isinstance(ids, list):
        return JSONResponse({"ok": False, "error": "ids must be a list."}, status_code=400)
    result = await run_in_threadpool(lambda: _library_for_request(payload, request=request).restore_items(ids))
    return JSONResponse(result, status_code=200 if result.get("ok") else 400)


@router.delete("/simpleai/gallery/api/trash")
async def media_library_purge(request: Request, payload: dict = Body(default={})):  # noqa: B008
    ids = payload.get("ids") if isinstance(payload, dict) else []
    if ids is not None and not isinstance(ids, list):
        return JSONResponse({"ok": False, "error": "ids must be a list."}, status_code=400)
    result = await run_in_threadpool(lambda: _library_for_request(payload, request=request).purge_trash(ids or None))
    return JSONResponse(result, status_code=200 if result.get("ok") else 400)


@router.post("/simpleai/gallery/api/rescan")
async def media_library_rescan(request: Request, payload: dict = Body(default={})):  # noqa: B008
    library = _library_for_request(payload, request=request)
    started = _schedule_scan(library, force=True)
    return {"ok": True, "started": started, "running": not started}


@router.get("/simpleai/gallery/api/rescan/status")
async def media_library_rescan_status(request: Request):
    library = _library_for_request(request=request)
    with _scan_tasks_lock:
        task = _scan_tasks.get(library.db_path)
        running = bool(task and not task.done())
    return {"ok": True, "running": running}


@router.get("/simpleai/gallery/media/{media_id}")
async def media_library_media(request: Request, media_id: str):
    library = _library_for_request(request=request)
    include_trashed = _bool_query(request.query_params.get("trash")) is True
    item = await run_in_threadpool(lambda: library.get_item(media_id, include_trashed=include_trashed, include_generation_metadata=False))
    path = await run_in_threadpool(lambda: library.media_path(media_id, include_trashed=include_trashed)) if item else ""
    if not item or not path:
        return JSONResponse({"ok": False, "error": "Media file not found."}, status_code=404)
    return FileResponse(
        path,
        media_type=item.get("mime") or None,
        headers={"Cache-Control": "private, max-age=3600", "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff"},
        content_disposition_type="inline",
    )


@router.get("/simpleai/gallery/download/{media_id}")
async def media_library_download(request: Request, media_id: str):
    library = _library_for_request(request=request)
    include_trashed = _bool_query(request.query_params.get("trash")) is True
    item = await run_in_threadpool(lambda: library.get_item(media_id, include_trashed=include_trashed, include_generation_metadata=False))
    path = await run_in_threadpool(lambda: library.media_path(media_id, include_trashed=include_trashed)) if item else ""
    if not item or not path:
        return JSONResponse({"ok": False, "error": "Media file not found."}, status_code=404)
    return FileResponse(
        path,
        media_type=item.get("mime") or None,
        filename=os.path.basename(path),
        headers={"Cache-Control": "private, no-store", "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff"},
        content_disposition_type="attachment",
    )


@router.get("/simpleai/gallery/thumbnail/{media_id}")
async def media_library_thumbnail(request: Request, media_id: str):
    library = _library_for_request(request=request)
    include_trashed = _bool_query(request.query_params.get("trash")) is True
    path = await run_in_threadpool(lambda: library.thumbnail_path(media_id, include_trashed=include_trashed))
    if not path:
        return JSONResponse({"ok": False, "error": "Thumbnail not found."}, status_code=404)
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"},
    )
