"""Standalone media library page and API routes."""

from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import os
import platform
import socket
import subprocess
import threading
import time
from typing import Any
from urllib.parse import quote, unquote

import psutil
import shared
from fastapi import APIRouter, Body, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from starlette.concurrency import run_in_threadpool

from modules import media_library
from modules.identity_session import resolve_session
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
    if not session or shared.token is None:
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
        identity = resolve_session(shared.token, session, ua_hash)
        if identity["status"] == "valid":
            resolved = media_library.resolve_user_did(identity["did"])
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


def _local_interface_addresses() -> set[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    addresses = set()
    try:
        for entries in psutil.net_if_addrs().values():
            for entry in entries:
                if entry.family not in (socket.AF_INET, socket.AF_INET6):
                    continue
                try:
                    addresses.add(ipaddress.ip_address(entry.address.split("%", 1)[0]))
                except ValueError:
                    continue
    except OSError:
        return set()
    return addresses


def _is_local_browser_request(request: Request) -> bool:
    host = (request.url.hostname or "").rstrip(".").lower()
    client = request.client.host if request.client else ""
    try:
        client_ip = ipaddress.ip_address(client)
    except ValueError:
        return False
    if host == "localhost":
        return client_ip.is_loopback
    try:
        host_ip = ipaddress.ip_address(host)
    except ValueError:
        if host != socket.gethostname().lower():
            return False
        host_ip = None
    if host_ip is not None and host_ip.is_loopback:
        return client_ip.is_loopback
    if host_ip is not None and host_ip != client_ip:
        return False
    return client_ip in _local_interface_addresses()


def _open_media_location(folder: str, selected_file: str = "") -> None:
    system = platform.system()
    if system == "Windows":
        if selected_file:
            subprocess.Popen(["explorer.exe", "/select,", selected_file])
        else:
            os.startfile(folder)
    elif system == "Darwin":
        subprocess.Popen(["open", "-R", selected_file] if selected_file else ["open", folder])
    else:
        subprocess.Popen(["xdg-open", folder])


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


def _optional_int(value: Any) -> int | None:
    try:
        return int(value) if value not in (None, "") else None
    except (TypeError, ValueError):
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
    credential = _cookie_value(request, "aitoken")
    if credential and shared.token is not None and hasattr(shared.token, "resolve_sstoken"):
        ua_hash = hashlib.sha256(str(request.headers.get("user-agent") or "").encode("utf-8")).hexdigest()
        session = resolve_session(shared.token, credential, ua_hash)
        if session["status"] == "valid":
            response.set_cookie(
                "aitoken", session["sstoken"], max_age=session["expires_in"],
                path="/", samesite="lax", secure=request.url.scheme == "https",
            )
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
            tag=query.get("tag") or None,
            rating_min=_optional_int(query.get("rating_min")),
            model_query=query.get("model") or None,
            orientation=query.get("orientation") or None,
            collection_id=query.get("collection") or None,
            cursor=query.get("cursor") or None,
            limit=limit,
            sort=query.get("sort") or "newest",
            include_date_summary=_bool_query(query.get("summary")) is not False,
            include_trashed=include_trashed,
        )
    )
    result["items"] = [_item_urls(request, item, library) for item in result.get("items") or []]
    return result


@router.get("/simpleai/gallery/api/collections")
async def media_library_collections(request: Request):
    library = _library_for_request(request=request)
    return {"ok": True, "collections": await run_in_threadpool(library.list_collections)}


@router.post("/simpleai/gallery/api/collections")
async def media_library_create_collection(request: Request, payload: dict = Body(default={})):  # noqa: B008
    library = _library_for_request(request=request)
    try:
        collection = await run_in_threadpool(lambda: library.create_collection(payload.get("title", "")))
    except (AttributeError, ValueError) as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)
    return {"ok": True, "collection": collection}


@router.delete("/simpleai/gallery/api/collections/{collection_id}")
async def media_library_delete_collection(request: Request, collection_id: str):
    library = _library_for_request(request=request)
    deleted = await run_in_threadpool(lambda: library.delete_collection(collection_id))
    return JSONResponse({"ok": deleted}, status_code=200 if deleted else 404)


@router.post("/simpleai/gallery/api/collections/{collection_id}/items")
async def media_library_collection_items(
    request: Request, collection_id: str, payload: dict = Body(default={})
):  # noqa: B008
    ids = payload.get("ids") if isinstance(payload, dict) else None
    if not isinstance(ids, list):
        return JSONResponse({"ok": False, "error": "ids must be a list."}, status_code=400)
    library = _library_for_request(request=request)
    try:
        result = await run_in_threadpool(
            lambda: library.update_collection_items(collection_id, ids, remove=bool(payload.get("remove")))
        )
    except ValueError as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=404)
    return result


@router.get("/simpleai/gallery/api/views")
async def media_library_views(request: Request):
    library = _library_for_request(request=request)
    return {"ok": True, "views": await run_in_threadpool(library.list_saved_views)}


@router.post("/simpleai/gallery/api/views")
async def media_library_create_view(request: Request, payload: dict = Body(default={})):  # noqa: B008
    library = _library_for_request(request=request)
    try:
        view = await run_in_threadpool(
            lambda: library.create_saved_view(payload.get("title", ""), payload.get("filters", {}))
        )
    except (AttributeError, ValueError) as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)
    return {"ok": True, "view": view}


@router.delete("/simpleai/gallery/api/views/{view_id}")
async def media_library_delete_view(request: Request, view_id: str):
    library = _library_for_request(request=request)
    deleted = await run_in_threadpool(lambda: library.delete_saved_view(view_id))
    return JSONResponse({"ok": deleted}, status_code=200 if deleted else 404)


@router.post("/simpleai/gallery/api/items/batch")
async def media_library_batch_update(request: Request, payload: dict = Body(default={})):  # noqa: B008
    ids = payload.get("ids") if isinstance(payload, dict) else None
    if not isinstance(ids, list) or not isinstance(payload.get("add_tags", []), list):
        return JSONResponse({"ok": False, "error": "ids and add_tags must be lists."}, status_code=400)
    library = _library_for_request(request=request)
    try:
        result = await run_in_threadpool(
            lambda: library.batch_update_user_metadata(
                ids, add_tags=payload.get("add_tags"), rating=_optional_int(payload.get("rating")),
                favorite=payload.get("favorite") if isinstance(payload.get("favorite"), bool) else None,
            )
        )
    except ValueError as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)
    return result


@router.get("/simpleai/gallery/api/items/{media_id}/related")
async def media_library_related_items(request: Request, media_id: str):
    library = _library_for_request(request=request)
    items = await run_in_threadpool(lambda: library.related_items(media_id))
    return {"ok": True, "items": [_item_urls(request, item, library) for item in items]}


@router.get("/simpleai/gallery/api/items/{media_id}/canvas")
async def media_library_canvas_item(request: Request, media_id: str):
    library = _library_for_request(request=request)
    item = await run_in_threadpool(lambda: library.get_item(media_id))
    if not item or item.get("media_type") not in {"image", "video"}:
        return JSONResponse({"ok": False, "error": "Media item not found."}, status_code=404)
    path = await run_in_threadpool(lambda: library.media_path(media_id))
    if not path:
        return JSONResponse({"ok": False, "error": "Media file not found."}, status_code=404)
    _item_urls(request, item, library)
    item["path"] = path
    item["thumb"] = item.get("thumbnail_url") or ""
    item["preview_url"] = item["media_url"]
    item["folder"] = str(item.get("relative_path") or "").rsplit("/", 1)[0]
    return JSONResponse({"ok": True, "item": item}, headers={"Cache-Control": "private, no-store"})


@router.post("/simpleai/gallery/api/items/{media_id}/open-folder")
async def media_library_open_folder(request: Request, media_id: str):
    if not _is_local_browser_request(request):
        return JSONResponse({"ok": False, "error": "Available only on the local machine."}, status_code=403)
    library = _library_for_request(request=request)
    item = await run_in_threadpool(lambda: library.get_item(media_id, include_trashed=True, include_generation_metadata=False))
    if not item:
        return JSONResponse({"ok": False, "error": "Media item not found."}, status_code=404)
    root = library.gallery_root if item.get("is_trashed") else library.outputs_root
    relative = item.get("trash_path") if item.get("is_trashed") else item.get("relative_path")
    path = media_library._path_under(root, relative or "")
    if not path:
        return JSONResponse({"ok": False, "error": "Media path is invalid."}, status_code=400)
    exists = os.path.isfile(path)
    folder = os.path.dirname(path)
    while not os.path.isdir(folder) and folder != root:
        folder = os.path.dirname(folder)
    if not os.path.isdir(folder):
        return JSONResponse({"ok": False, "error": "Output folder not found."}, status_code=404)
    try:
        await run_in_threadpool(lambda: _open_media_location(folder, path if exists else ""))
    except OSError:
        return JSONResponse({"ok": False, "error": "Unable to open folder."}, status_code=500)
    return {"ok": True, "file_exists": exists}


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
    library = _library_for_request(request=request)
    item = await run_in_threadpool(lambda: library.update_user_metadata(media_id, **allowed))
    if not item:
        return JSONResponse({"ok": False, "error": "Media item not found."}, status_code=404)
    return {"ok": True, "item": _item_urls(request, item, library)}


@router.post("/simpleai/gallery/api/items/trash")
async def media_library_trash(request: Request, payload: dict = Body(default={})):  # noqa: B008
    ids = payload.get("ids") if isinstance(payload, dict) else []
    if not isinstance(ids, list):
        return JSONResponse({"ok": False, "error": "ids must be a list."}, status_code=400)
    result = await run_in_threadpool(lambda: _library_for_request(request=request).trash_items(ids))
    return JSONResponse(result, status_code=200 if result.get("ok") else 400)


@router.post("/simpleai/gallery/api/items/restore")
async def media_library_restore(request: Request, payload: dict = Body(default={})):  # noqa: B008
    ids = payload.get("ids") if isinstance(payload, dict) else []
    if not isinstance(ids, list):
        return JSONResponse({"ok": False, "error": "ids must be a list."}, status_code=400)
    result = await run_in_threadpool(lambda: _library_for_request(request=request).restore_items(ids))
    return JSONResponse(result, status_code=200 if result.get("ok") else 400)


@router.delete("/simpleai/gallery/api/trash")
async def media_library_purge(request: Request, payload: dict = Body(default={})):  # noqa: B008
    ids = payload.get("ids") if isinstance(payload, dict) else []
    if ids is not None and not isinstance(ids, list):
        return JSONResponse({"ok": False, "error": "ids must be a list."}, status_code=400)
    result = await run_in_threadpool(lambda: _library_for_request(request=request).purge_trash(ids or None))
    return JSONResponse(result, status_code=200 if result.get("ok") else 400)


@router.post("/simpleai/gallery/api/rescan")
async def media_library_rescan(request: Request, payload: dict = Body(default={})):  # noqa: B008
    library = _library_for_request(request=request)
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
