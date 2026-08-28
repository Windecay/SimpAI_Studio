import os
import anyio
import httpx
from tqdm import tqdm
import threading
import queue
import json
import ast
import time
import hashlib
import shutil
import stat
import tempfile
import zipfile
import shared
from urllib.parse import urlparse
from typing import Optional
from concurrent.futures import ThreadPoolExecutor
from torch.hub import download_url_to_file

import logging
from enhanced.logger import format_name
logger = logging.getLogger(format_name(__name__))

thread_pool = ThreadPoolExecutor(max_workers=6)
download_tasks = set()
download_cancel_requests = set()
download_progress = {}
download_task_metadata = {}
task_lock = threading.Lock()

LEGACY_CATEGORY_SEARCH_PATHS = {
    "sams": ("inpaint",),
    "grounding-dino": ("inpaint",),
    "ipadapter": ("controlnet",),
}
DEFAULT_MODEL_CATEGORIES = {"checkpoints", "diffusion_models", "unet"}
PREVIOUS_DEFAULT_MODEL_FIELDS = (
    ("default_model", "previous_default_models"),
    ("default_refiner", "previous_default_refiners"),
)
RESOURCE_BUNDLE_TYPE = "archive"
RESOURCE_TASK_PREFIX = "resource/"
RESOURCE_CACHE_DIR_NAME = ".resource_downloads"


class DownloadCancelled(Exception):
    pass


def _is_download_cancelled(task_id):
    with task_lock:
        return task_id in download_cancel_requests


def _mark_download_cancelled(task_id, file_name=""):
    if not task_id:
        return
    current = download_progress.get(task_id)
    if not isinstance(current, dict):
        current = {}
    current.update({
        "cancelled": True,
        "file_name": file_name or current.get("file_name") or os.path.basename(str(task_id)),
    })
    download_progress[task_id] = current


def _mark_download_error(task_id, message, file_name=""):
    if not task_id:
        return
    current = download_progress.get(task_id)
    if not isinstance(current, dict):
        current = {}
    current.update({
        "error": str(message or "download failed"),
        "file_name": file_name or current.get("file_name") or os.path.basename(str(task_id)),
    })
    download_progress[task_id] = current


def _remember_download_task(task_id, *, file_name="", model_dir="", url="", size=0, kind="model", resource_id=""):
    if not task_id:
        return
    previous = download_task_metadata.get(task_id) or {}
    download_task_metadata[task_id] = {
        "task_id": task_id,
        "file_name": file_name or os.path.basename(str(task_id)),
        "model_dir": model_dir or "",
        "url": url or "",
        "size": _normalize_expected_size(size),
        "kind": str(kind or previous.get("kind") or "model"),
        "resource_id": str(resource_id or previous.get("resource_id") or ""),
        "created_at": float(previous.get("created_at") or time.time()),
    }


def _delete_model_file(file_path):
    file_path = os.path.abspath(str(file_path or "").strip())
    if not file_path:
        return False, "empty path"
    if not os.path.exists(file_path):
        return False, "file not found"
    try:
        os.remove(file_path)
        try:
            shared.modelsinfo.refresh_file('delete', file_path, "")
        except Exception:
            pass
        _clear_missing_model_list_cache()
        return True, ""
    except Exception as e:
        return False, str(e or "delete failed")


def _queue_download_restart(task_id, *, file_name="", model_dir="", url="", size=0, cleanup_file_path=""):
    if not task_id:
        return
    previous = download_task_metadata.get(task_id) or {}
    download_task_metadata[task_id] = {
        "task_id": task_id,
        "file_name": file_name or previous.get("file_name") or os.path.basename(str(task_id)),
        "model_dir": model_dir or previous.get("model_dir") or "",
        "url": url or previous.get("url") or "",
        "size": _normalize_expected_size(size or previous.get("size") or 0),
        "created_at": float(previous.get("created_at") or time.time()),
        "restart_request": {
            "file_name": file_name or previous.get("file_name") or os.path.basename(str(task_id)),
            "model_dir": model_dir or previous.get("model_dir") or "",
            "url": url or previous.get("url") or "",
            "size": _normalize_expected_size(size or previous.get("size") or 0),
            "cleanup_file_path": cleanup_file_path or previous.get("cleanup_file_path") or "",
        },
    }


def _split_download_urls(url):
    if isinstance(url, (list, tuple)):
        raw_items = url
    else:
        raw_items = str(url or "").split(",")
    return [str(item or "").strip().strip("`") for item in raw_items if str(item or "").strip().strip("`")]


def _apply_hf_mirror(url):
    url = str(url or "")
    if 'HF_MIRROR' in os.environ:
        return str.replace(url, "huggingface.co", os.environ["HF_MIRROR"].rstrip('/'), 1)
    return url


def cancel_download_task(task_id):
    task_id = str(task_id or "").replace("\\", "/").strip("/")
    if not task_id:
        return False
    with task_lock:
        active = task_id in download_tasks or task_id in download_progress
        download_cancel_requests.add(task_id)
    _mark_download_cancelled(task_id)
    logger.info("下载任务已请求停止: %s", task_id)
    return active


def has_active_download_tasks():
    with task_lock:
        return bool(download_tasks)

def _normalize_expected_size(size):
    try:
        return int(size or 0)
    except Exception:
        return 0

def _file_size_matches(file_path, size):
    expected_size = _normalize_expected_size(size)
    if not os.path.exists(file_path):
        return False
    if expected_size <= 0:
        return True
    try:
        return os.path.getsize(file_path) == expected_size
    except Exception:
        return False

def _file_size_mismatch(file_path, size):
    expected_size = _normalize_expected_size(size)
    return os.path.exists(file_path) and expected_size > 0 and not _file_size_matches(file_path, expected_size)


def get_download_queue_snapshot():
    rows = []
    with task_lock:
        task_ids = set(download_task_metadata.keys()) | set(download_tasks) | set(download_progress.keys())
        for task_id in task_ids:
            meta = dict(download_task_metadata.get(task_id) or {})
            progress = dict(download_progress.get(task_id) or {})
            active = task_id in download_tasks
            cancelled = bool(progress.get("cancelled") or task_id in download_cancel_requests)
            error = str(progress.get("error") or "")
            try:
                current = int(progress.get("current", 0) or 0)
            except Exception:
                current = 0
            try:
                total = int(progress.get("total", 0) or meta.get("size", 0) or 0)
            except Exception:
                total = 0
            try:
                percent = float(progress.get("percent", 0.0) or 0.0)
            except Exception:
                percent = 0.0
            if total > 0 and current > 0:
                percent = max(0.0, min(100.0, (current / total) * 100.0))
            else:
                percent = max(0.0, min(100.0, percent))
            if error:
                status = "error"
            elif cancelled:
                status = "stopped"
            elif active and str(progress.get("phase") or "").strip().lower() == "installing":
                status = "installing"
            elif active and current <= 0:
                status = "queued"
            elif active:
                status = "downloading"
            else:
                status = "done"
            rows.append(
                {
                    "task_id": task_id,
                    "file_name": progress.get("file_name") or meta.get("file_name") or os.path.basename(str(task_id)),
                    "model_dir": meta.get("model_dir", ""),
                    "url": meta.get("url", ""),
                    "kind": meta.get("kind", "model"),
                    "resource_id": meta.get("resource_id", ""),
                    "phase": progress.get("phase", ""),
                    "current": current,
                    "total": total,
                    "percent": percent,
                    "status": status,
                    "error": error,
                    "active": active,
                    "created_at": float(meta.get("created_at") or 0.0),
                }
            )
    return sorted(rows, key=lambda item: (item.get("created_at", 0.0), item.get("task_id", "")))

async def download_file_with_progress(
        url: str,
        file_path: str,
        size: int = 0,
        task_id: Optional[str] = None,
        refresh_models_info: bool = True,
):
    global download_progress
    file_name = os.path.basename(file_path)
    progress_key = task_id or file_name
    size = _normalize_expected_size(size)
    timeout = int(max(60.0, size / (1024 * 1024)))
    logger.info(f'the download file timeout: {timeout}s')
    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
        try:
            url = _apply_hf_mirror(url)
            model_dir = os.path.dirname(file_path)
            if not os.path.exists(model_dir):
                os.makedirs(model_dir, exist_ok=True)

            partial_file_path = file_path + ".partial"

            resume_size = 0
            if os.path.exists(partial_file_path):
                resume_size = os.path.getsize(partial_file_path)
                logger.info(f"发现部分下载的文件，将从 {resume_size} 字节处继续下载")

            if _is_download_cancelled(progress_key):
                _mark_download_cancelled(progress_key, file_name)
                raise DownloadCancelled(f"下载任务已停止: {progress_key}")

            headers = {}
            if resume_size > 0:
                headers["Range"] = f"bytes={resume_size}-"

            async with client.stream("GET", url, headers=headers) as response:
                response.raise_for_status()

                content_range = response.headers.get("Content-Range")
                if resume_size > 0 and response.status_code == 200 and not content_range:
                    logger.info("服务器未接受断点续传请求，将重新下载完整文件")
                    resume_size = 0
                if content_range:
                    try:
                        total_size = int(content_range.split("/")[-1])
                    except Exception:
                        total_size = 0
                else:
                    try:
                        total_size = int(response.headers.get("Content-Length", 0) or 0)
                    except Exception:
                        total_size = 0
                if total_size <= 0 and size:
                    try:
                        total_size = int(size or 0)
                    except Exception:
                        total_size = 0
                download_progress[progress_key] = {
                    "percent": 0.0 if total_size > 0 else 0.0,
                    "current": resume_size,
                    "total": total_size,
                    "file_name": file_name,
                }

                with tqdm(
                    total=total_size if total_size > 0 else None,
                    initial=resume_size,
                    unit="iB",
                    unit_scale=True,
                    desc=''
                ) as progress_bar:
                    mode = "ab" if resume_size > 0 else "wb"
                    with open(partial_file_path, mode) as f:
                        async for chunk in response.aiter_bytes():
                            if _is_download_cancelled(progress_key):
                                _mark_download_cancelled(progress_key, file_name)
                                raise DownloadCancelled(f"下载任务已停止: {progress_key}")
                            f.write(chunk)
                            chunk_len = len(chunk)
                            progress_bar.update(chunk_len)

                            current_size = progress_bar.n
                            percent = (current_size / total_size) * 100 if total_size > 0 else 0.0
                            download_progress[progress_key] = {
                                "percent": percent,
                                "current": current_size,
                                "total": total_size,
                                "file_name": file_name,
                            }

            downloaded_size = os.path.getsize(partial_file_path)
            expected_total = total_size or size
            if expected_total <= 0 or downloaded_size == expected_total:
                os.replace(partial_file_path, file_path)
                if refresh_models_info:
                    shared.modelsinfo.refresh_file('add', file_path, url)
                _clear_missing_model_list_cache()
                logger.info(f"文件下载完成: {file_path}")
                if progress_key in download_progress:
                    del download_progress[progress_key]
            else:
                logger.error(f"下载的文件大小不符，预期 {total_size} 字节，实际 {downloaded_size} 字节")
                raise Exception(f"下载的文件大小不符，预期 {total_size} 字节，实际 {downloaded_size} 字节")
        except DownloadCancelled:
            logger.info("下载任务已停止: %s", progress_key)
            _mark_download_cancelled(progress_key, file_name)
            raise
        except httpx.HTTPStatusError as e:
            logger.error(f"下载失败: {e}")
            logger.error(f"请求 URL: {e.request.url}")
            logger.error(f"重定向 URL: {e.response.headers.get('Location')}")
            if progress_key in download_progress:
                download_progress[progress_key]["error"] = str(e)
            raise
        except Exception as e:
            logger.error(f"下载过程中发生错误: {e}")
            if progress_key in download_progress:
                download_progress[progress_key]["error"] = str(e)
            raise


def load_file_from_url(
        url: str,
        *,
        model_dir: str,
        progress: bool = True,
        file_name: Optional[str] = None,
        async_task: bool = False,
        size: int = 0,
        task_id: Optional[str] = None,
        cleanup_file_path: Optional[str] = None,
) -> str:
    global download_queue

    """
    Download a file from `url` into `model_dir`, using the file present if possible.

    Returns the path to the downloaded file.
    """
    download_urls = _split_download_urls(url)
    if not download_urls:
        download_urls = [str(url or "")]
    primary_url = _apply_hf_mirror(download_urls[0])
    if not os.path.exists(model_dir):
        os.makedirs(model_dir, exist_ok=True)
    if not file_name:
        parts = urlparse(primary_url)
        file_name = os.path.basename(parts.path)
    cached_file = os.path.abspath(os.path.join(model_dir, file_name))
    effective_task_id = task_id or file_name
    expected_size = _normalize_expected_size(size)
    cached_file_exists = os.path.exists(cached_file)
    cached_file_size_mismatch = _file_size_mismatch(cached_file, expected_size)
    if cached_file_exists and not cached_file_size_mismatch:
        _clear_missing_model_list_cache()
        return cached_file

    if cached_file_size_mismatch:
        try:
            current_size = os.path.getsize(cached_file)
        except Exception:
            current_size = "unknown"
        logger.info(f'模型文件大小不符，将重新下载: {cached_file} current={current_size}, expected={expected_size}')

    if (not cached_file_exists) or cached_file_size_mismatch:
        #logger.info(f'Downloading: "{url}" to {cached_file}')
        logger.info(f'正在下载文件: "{url}"。如果速度慢，建议自行用工具下载后保存到: {cached_file}。')
        def _download_with_progress_from_urls():
            last_error = None
            for candidate_url in download_urls:
                candidate_url = _apply_hf_mirror(candidate_url)
                try:
                    anyio.run(download_file_with_progress, candidate_url, cached_file, expected_size, effective_task_id)
                    return
                except DownloadCancelled:
                    raise
                except Exception as e:
                    last_error = e
                    logger.warning("模型下载地址失败，准备尝试下一个地址: %s", candidate_url)
            if last_error is not None:
                raise last_error
            raise RuntimeError("No download URL available")

        def _download_direct_from_urls():
            last_error = None
            for candidate_url in download_urls:
                candidate_url = _apply_hf_mirror(candidate_url)
                try:
                    download_url_to_file(candidate_url, cached_file, progress=progress)
                    shared.modelsinfo.refresh_file('add', cached_file, candidate_url)
                    _clear_missing_model_list_cache()
                    return
                except Exception as e:
                    last_error = e
                    logger.warning("模型下载地址失败，准备尝试下一个地址: %s", candidate_url)
            if last_error is not None:
                raise last_error
            raise RuntimeError("No download URL available")

        def _download_task():
            restart_request = None
            cleanup_error = ""
            try:
                _download_with_progress_from_urls()
                if cleanup_file_path:
                    deleted, cleanup_error = _delete_model_file(cleanup_file_path)
                    if deleted:
                        logger.info("旧版兼容模型已删除: %s", cleanup_file_path)
                    elif cleanup_error not in ("", "file not found"):
                        logger.warning("删除旧版兼容模型失败: %s (%s)", cleanup_file_path, cleanup_error)
            except DownloadCancelled as e:
                print(f'下载任务:{effective_task_id} 已停止: {e}')
            except Exception as e:
                print(f'下载任务:{effective_task_id} 失败, 错误为: {e}')
            finally:
                with task_lock:
                    download_tasks.discard(effective_task_id)
                    download_cancel_requests.discard(effective_task_id)
                    meta = dict(download_task_metadata.get(effective_task_id) or {})
                    if cleanup_error:
                        meta["cleanup_error"] = cleanup_error
                        download_task_metadata[effective_task_id] = meta
                    restart_request = dict(meta.get("restart_request") or {}) if isinstance(meta.get("restart_request"), dict) else None
                    if restart_request:
                        download_task_metadata.pop(effective_task_id, None)
                    elif effective_task_id not in download_progress:
                        download_task_metadata.pop(effective_task_id, None)
                    logger.info(f"下载任务:{effective_task_id} 已完成, 从任务队列中清除.")
                if restart_request:
                    try:
                        if effective_task_id in download_progress and isinstance(download_progress.get(effective_task_id), dict):
                            current_progress = download_progress.get(effective_task_id) or {}
                            if current_progress.get("cancelled") or current_progress.get("error"):
                                del download_progress[effective_task_id]
                    except Exception:
                        pass
                    logger.info("下载任务:%s 已停止，准备按最新请求重新加入队列。", effective_task_id)
                    load_file_from_url(
                        url=restart_request.get("url"),
                        model_dir=restart_request.get("model_dir"),
                        file_name=restart_request.get("file_name"),
                        async_task=True,
                        size=restart_request.get("size", 0),
                        task_id=effective_task_id,
                        cleanup_file_path=restart_request.get("cleanup_file_path"),
                    )
        if async_task:
            with task_lock:
                if effective_task_id in download_tasks:
                    current_progress = download_progress.get(effective_task_id)
                    if (
                        effective_task_id in download_cancel_requests
                        or (isinstance(current_progress, dict) and current_progress.get("cancelled"))
                    ):
                        _queue_download_restart(
                            effective_task_id,
                            file_name=file_name,
                            model_dir=model_dir,
                            url=url,
                            size=expected_size,
                            cleanup_file_path=cleanup_file_path,
                        )
                        print(f"下载任务:{effective_task_id} 正在停止，已记录重试请求。")
                        return
                    print(f"下载任务:{effective_task_id} 已经在任务队列中.")
                    return
                try:
                    if effective_task_id in download_progress and isinstance(download_progress.get(effective_task_id), dict) and ("error" in download_progress.get(effective_task_id, {}) or download_progress.get(effective_task_id, {}).get("cancelled")):
                        del download_progress[effective_task_id]
                except Exception:
                    pass
                download_cancel_requests.discard(effective_task_id)
                _remember_download_task(
                    effective_task_id,
                    file_name=file_name,
                    model_dir=model_dir,
                    url=url,
                    size=expected_size,
                )
                if cleanup_file_path:
                    download_task_metadata.setdefault(effective_task_id, {})["cleanup_file_path"] = cleanup_file_path
                download_progress[effective_task_id] = {
                    "percent": 0.0,
                    "current": 0,
                    "total": expected_size,
                    "file_name": file_name,
                    "queued": True,
                }
                download_tasks.add(effective_task_id)
                print(f"启动新的下载任务:{effective_task_id}.")
            thread_pool.submit(_download_task)
        else:
            if cached_file_size_mismatch:
                _download_with_progress_from_urls()
            else:
                _download_direct_from_urls()
            if cleanup_file_path:
                deleted, cleanup_error = _delete_model_file(cleanup_file_path)
                if deleted:
                    logger.info("旧版兼容模型已删除: %s", cleanup_file_path)
                elif cleanup_error not in ("", "file not found"):
                    logger.warning("删除旧版兼容模型失败: %s (%s)", cleanup_file_path, cleanup_error)
    return cached_file


presets_model_list = {}
presets_resource_bundles = {}
presets_previous_default_models = {}
presets_mtime = {}
missing_model_list_cache = {}
missing_model_list_cache_ttl = 12.0

def _clear_missing_model_list_cache():
    missing_model_list_cache.clear()

def _get_cached_preset_model_list(preset_name, user_did=None):
    arch_str = get_gpu_arch_str_in_preset_name()
    cache_names = []

    if preset_name.endswith('.'):
        if user_did:
            cache_names.append(f'{preset_name}{user_did[:7]}')
    else:
        if arch_str:
            cache_names.append(f'{preset_name}{arch_str}')
        cache_names.append(preset_name)

    for cache_name in cache_names:
        model_list = presets_model_list.get(cache_name)
        if model_list:
            return cache_name, model_list, presets_mtime.get(cache_name, 0)

    return None, None, 0

def _clean_model_name(value):
    return str(value or "").strip().replace('\\', os.sep).replace('/', os.sep).lstrip(os.sep)

def _clean_previous_model_list(values):
    if isinstance(values, str):
        values = [values]
    previous = []
    for value in values or []:
        name = _clean_model_name(value)
        if name and name not in previous:
            previous.append(name)
    return previous


def _preset_previous_default_model_info(config_preset):
    if not isinstance(config_preset, dict):
        return {}
    info = {}
    for current_key, previous_key in PREVIOUS_DEFAULT_MODEL_FIELDS:
        info[current_key] = _clean_model_name(config_preset.get(current_key))
        info[previous_key] = _clean_previous_model_list(config_preset.get(previous_key, []))
    return info


def _iter_previous_default_model_entries(previous_default_info):
    if isinstance(previous_default_info, dict):
        for current_key, previous_key in PREVIOUS_DEFAULT_MODEL_FIELDS:
            current_model = _clean_model_name(previous_default_info.get(current_key))
            previous_models = _clean_previous_model_list(previous_default_info.get(previous_key, []))
            if current_model and previous_models:
                yield current_model, previous_models
        return
    if isinstance(previous_default_info, (list, tuple)) and len(previous_default_info) >= 2:
        current_model = _clean_model_name(previous_default_info[0])
        previous_models = _clean_previous_model_list(previous_default_info[1])
        if current_model and previous_models:
            yield current_model, previous_models

def _same_model_name(left, right):
    left_name = _clean_model_name(left)
    right_name = _clean_model_name(right)
    if not left_name or not right_name:
        return False
    return left_name.casefold() == right_name.casefold() or os.path.basename(left_name).casefold() == os.path.basename(right_name).casefold()

def _is_default_model_entry(cata, path_file, default_model):
    if str(cata or "").strip().casefold() not in DEFAULT_MODEL_CATEGORIES:
        return False
    return _same_model_name(path_file, default_model)

def _existing_previous_default_model(cata, previous_default_info, path_file=None):
    match = _find_previous_default_model_match(cata, previous_default_info, path_file)
    return str(match.get("previous_model") or "")


def _find_previous_default_model_match(cata, previous_default_info, path_file=None):
    if str(cata or "").strip().casefold() not in DEFAULT_MODEL_CATEGORIES:
        return {}
    for current_key, previous_key in PREVIOUS_DEFAULT_MODEL_FIELDS:
        if not isinstance(previous_default_info, dict):
            continue
        current_model = _clean_model_name(previous_default_info.get(current_key))
        previous_models = _clean_previous_model_list(previous_default_info.get(previous_key, []))
        if not current_model or not previous_models:
            continue
        if path_file is not None and not _same_model_name(path_file, current_model):
            continue
        for previous_model in previous_models:
            file_path = _resolve_model_filepath(cata, previous_model)
            if file_path and os.path.exists(file_path):
                return {
                    "current_key": current_key,
                    "previous_key": previous_key,
                    "current_model": current_model,
                    "previous_model": previous_model,
                    "file_path": file_path,
                }
    return {}

def resolve_preset_default_model_choice(default_model, previous_default_models=None, catalogs=("checkpoints", "diffusion_models", "unet")):
    current = _clean_model_name(default_model)
    if not current:
        return current
    search_catalogs = [str(cata or "").strip() for cata in catalogs or () if str(cata or "").strip()]
    for cata in search_catalogs:
        file_path = _resolve_model_filepath(cata, current)
        if file_path and os.path.exists(file_path):
            return current
    for previous_model in previous_default_models or []:
        previous_name = _clean_model_name(previous_model)
        if not previous_name:
            continue
        for cata in search_catalogs:
            file_path = _resolve_model_filepath(cata, previous_name)
            if file_path and os.path.exists(file_path):
                return previous_name
    return current

def _get_preset_file_for_missing_models(preset_name, user_did=None):
    if preset_name.endswith('.'):
        if user_did is None:
            return ''
        try:
            from enhanced.simpleai import get_path_in_user_dir
            return os.path.abspath(os.path.join(get_path_in_user_dir('presets', user_did), f'{preset_name}json'))
        except Exception:
            return ''

    arch_str = get_gpu_arch_str_in_preset_name()
    preset_path = os.path.abspath(f'./presets/{preset_name}.json')
    if not os.path.exists(preset_path) and arch_str:
        preset_path_with_arch = os.path.abspath(f'./presets/{preset_name}{arch_str}.json')
        if os.path.exists(preset_path_with_arch):
            return preset_path_with_arch
    return preset_path


def _clean_resource_relative_path(value, *, allow_empty=False):
    raw = str(value or "").strip().replace("\\", "/")
    if not raw:
        if allow_empty:
            return ""
        raise ValueError("resource path is empty")
    if raw.startswith("/") or raw.startswith("\\") or (len(raw) >= 2 and raw[1] == ":"):
        raise ValueError(f"absolute resource path is not allowed: {value}")
    parts = []
    for part in raw.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            raise ValueError(f"resource path traversal is not allowed: {value}")
        parts.append(part)
    if not parts and not allow_empty:
        raise ValueError("resource path is empty")
    return "/".join(parts)


def _clean_resource_id(value):
    raw = str(value or "").strip()
    cleaned = "".join(char if (char.isalnum() or char in "._-") else "_" for char in raw)
    return cleaned.strip("._-")


def _parse_resource_bundle_entries(raw_resource_bundles):
    bundles = []
    for raw_entry in raw_resource_bundles or []:
        if not isinstance(raw_entry, dict):
            continue
        bundle_type = str(raw_entry.get("type") or RESOURCE_BUNDLE_TYPE).strip().lower()
        if bundle_type != RESOURCE_BUNDLE_TYPE:
            continue
        resource_id = _clean_resource_id(raw_entry.get("id") or raw_entry.get("name"))
        if not resource_id:
            continue
        file_name = str(raw_entry.get("file_name") or "").strip().replace("\\", "/")
        file_name = os.path.basename(file_name)
        if not file_name or file_name in {".", ".."}:
            continue
        required_raw = raw_entry.get("required_paths", [])
        if isinstance(required_raw, str):
            required_raw = [required_raw]
        required_paths = []
        for required_path in required_raw or []:
            required_text = str(required_path or "").strip()
            if not required_text:
                continue
            requires_directory = required_text.replace("\\", "/").endswith("/")
            try:
                normalized = _clean_resource_relative_path(required_text)
            except ValueError:
                continue
            required_paths.append(f"{normalized}/" if requires_directory else normalized)
        if not required_paths:
            continue
        try:
            size = int(raw_entry.get("size") or 0)
        except (TypeError, ValueError):
            size = 0
        archive_root = raw_entry.get("archive_root", "")
        try:
            archive_root = _clean_resource_relative_path(archive_root, allow_empty=True)
        except ValueError:
            continue
        install_subdir = raw_entry.get("install_subdir") or ""
        try:
            install_subdir = _clean_resource_relative_path(install_subdir)
        except ValueError:
            continue
        url = raw_entry.get("url") or ""
        if isinstance(url, (list, tuple)):
            url = [str(item or "").strip() for item in url if str(item or "").strip()]
        else:
            url = str(url).strip()
        bundles.append(
            {
                "id": resource_id,
                "type": RESOURCE_BUNDLE_TYPE,
                "version": str(raw_entry.get("version") or "").strip(),
                "display_name": dict(raw_entry.get("display_name") or {}) if isinstance(raw_entry.get("display_name"), dict) else {},
                "file_name": file_name,
                "url": url,
                "size": size,
                "sha256": str(raw_entry.get("sha256") or "").strip().lower(),
                "install_base": str(raw_entry.get("install_base") or "models_root").strip().lower(),
                "install_subdir": install_subdir,
                "archive_root": archive_root,
                "required_paths": required_paths,
            }
        )
    return bundles


def _resource_task_id(resource_id):
    cleaned = _clean_resource_id(resource_id)
    return f"{RESOURCE_TASK_PREFIX}{cleaned}" if cleaned else ""


def _get_cached_preset_resource_bundles(preset_name, user_did=None):
    arch_str = get_gpu_arch_str_in_preset_name()
    cache_names = []
    if preset_name.endswith("."):
        if user_did:
            cache_names.append(f"{preset_name}{user_did[:7]}")
    else:
        if arch_str:
            cache_names.append(f"{preset_name}{arch_str}")
        cache_names.append(preset_name)

    for cache_name in cache_names:
        if cache_name in presets_resource_bundles:
            return cache_name, presets_resource_bundles.get(cache_name) or [], presets_mtime.get(cache_name, 0)
    return None, None, 0


def _resource_install_root(bundle):
    from modules.config import path_models_root

    bundle = bundle if isinstance(bundle, dict) else {}
    install_base = str(bundle.get("install_base") or "models_root").strip().lower()
    if install_base == "models_root":
        base_dir = os.path.abspath(str(path_models_root))
    elif install_base == "app_root":
        base_dir = os.path.abspath(os.getcwd())
    else:
        raise ValueError(f"Unsupported resource install base: {install_base}")

    relative = _clean_resource_relative_path(bundle.get("install_subdir"))
    target = os.path.abspath(os.path.join(base_dir, *relative.split("/")))
    if os.path.commonpath([base_dir, target]) != base_dir:
        raise ValueError("Resource install path escapes its base directory")
    return target


def _resource_archive_path(bundle):
    target = _resource_install_root(bundle)
    resource_id = _clean_resource_id(bundle.get("id")) or "resource"
    return os.path.join(target, os.pardir, RESOURCE_CACHE_DIR_NAME, resource_id, str(bundle.get("file_name") or "resource.zip"))


def _resource_archive_candidates(bundle):
    file_name = os.path.basename(str(bundle.get("file_name") or "").strip().replace("\\", "/"))
    if not file_name or file_name in {".", ".."}:
        return []

    candidates = []
    try:
        candidates.append(_resource_archive_path(bundle))
    except (OSError, ValueError, TypeError):
        pass

    try:
        target_root = _resource_install_root(bundle)
    except (OSError, ValueError, TypeError):
        target_root = ""

    search_dirs = [target_root] if target_root else []
    ancestor = target_root
    for _ in range(4):
        ancestor = os.path.dirname(ancestor) if ancestor else ""
        if ancestor:
            search_dirs.append(ancestor)
    search_dirs.extend(
        [
            os.path.abspath(os.getcwd()),
            os.path.dirname(os.path.abspath(__file__)),
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        ]
    )
    for directory in search_dirs:
        if directory:
            candidates.append(os.path.join(directory, file_name))

    result = []
    seen = set()
    for candidate in candidates:
        normalized = os.path.normpath(os.path.abspath(candidate))
        key = os.path.normcase(normalized)
        if key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    return result


def _resource_bundle_required_path(root_dir, required_path):
    requires_directory = str(required_path or "").endswith("/")
    normalized = _clean_resource_relative_path(required_path)
    candidate = os.path.abspath(os.path.join(root_dir, *normalized.split("/")))
    if os.path.commonpath([os.path.abspath(root_dir), candidate]) != os.path.abspath(root_dir):
        raise ValueError("Required resource path escapes the package root")
    return candidate, requires_directory


def is_resource_bundle_installed(bundle):
    try:
        target = _resource_install_root(bundle)
        if not os.path.isdir(target):
            return False
        for required_path in bundle.get("required_paths", []) or []:
            candidate, requires_directory = _resource_bundle_required_path(target, required_path)
            if requires_directory:
                if not os.path.isdir(candidate):
                    return False
            elif not os.path.isfile(candidate):
                return False
        return True
    except (OSError, ValueError, TypeError):
        return False


def get_resource_bundles(preset_name, user_did=None):
    cached_name, bundles, _source_mtime = _get_cached_preset_resource_bundles(preset_name, user_did)
    if cached_name is not None:
        return list(bundles or [])
    preset_path = _get_preset_file_for_missing_models(preset_name, user_did)
    if not preset_path or not os.path.exists(preset_path):
        return []
    try:
        with open(preset_path, "r", encoding="utf-8") as json_file:
            config_preset = json.load(json_file)
    except Exception:
        return []
    return _parse_resource_bundle_entries(config_preset.get("resource_bundles", [])) if isinstance(config_preset, dict) else []


def get_missing_resource_bundles(preset_name, user_did=None, raw_resource_bundles=None):
    if raw_resource_bundles is None:
        bundles = get_resource_bundles(preset_name, user_did=user_did)
    else:
        bundles = _parse_resource_bundle_entries(raw_resource_bundles)
    missing = []
    for bundle in bundles:
        if _install_local_resource_bundle(bundle):
            continue
        item = dict(bundle)
        item["task_id"] = _resource_task_id(bundle.get("id"))
        item["human_size"] = format_size(bundle.get("size", 0))
        missing.append(item)
    return missing


def get_missing_resource_bundles_from_entries(preset_name, raw_resource_bundles, user_did=None):
    return get_missing_resource_bundles(
        preset_name,
        user_did=user_did,
        raw_resource_bundles=raw_resource_bundles,
    )


def _sha256_file(file_path, task_id=None):
    digest = hashlib.sha256()
    with open(file_path, "rb") as file_handle:
        while True:
            if task_id and _is_download_cancelled(task_id):
                raise DownloadCancelled(f"下载任务已停止: {task_id}")
            chunk = file_handle.read(8 * 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _verify_resource_archive(archive_path, bundle, task_id=None):
    expected_size = _normalize_expected_size(bundle.get("size", 0))
    if expected_size > 0 and os.path.getsize(archive_path) != expected_size:
        raise ValueError(
            f"Resource archive size mismatch: expected {expected_size}, got {os.path.getsize(archive_path)}"
        )
    expected_hash = str(bundle.get("sha256") or "").strip().lower()
    if expected_hash:
        actual_hash = _sha256_file(archive_path, task_id=task_id)
        if actual_hash != expected_hash:
            raise ValueError(f"Resource archive SHA-256 mismatch: expected {expected_hash}, got {actual_hash}")
    with zipfile.ZipFile(archive_path, "r"):
        pass
    return True


def _resource_archive_is_ready(archive_path, bundle):
    if not os.path.isfile(archive_path):
        return False
    try:
        return _verify_resource_archive(archive_path, bundle)
    except (OSError, ValueError, zipfile.BadZipFile):
        return False


def _find_existing_resource_archive(bundle, verify=True):
    for archive_path in _resource_archive_candidates(bundle):
        if not os.path.isfile(archive_path):
            continue
        if verify:
            if _resource_archive_is_ready(archive_path, bundle):
                return archive_path
            continue
        expected_size = _normalize_expected_size(bundle.get("size", 0))
        try:
            if expected_size <= 0 or os.path.getsize(archive_path) == expected_size:
                return archive_path
        except OSError:
            continue
    return None


def _cleanup_installed_resource_archives(bundle):
    expected_size = _normalize_expected_size(bundle.get("size", 0))
    if expected_size <= 0:
        return
    for archive_path in _resource_archive_candidates(bundle):
        if not os.path.isfile(archive_path):
            continue
        try:
            if os.path.getsize(archive_path) != expected_size:
                continue
            os.remove(archive_path)
        except OSError:
            continue


def _safe_archive_member_path(member_name):
    raw = str(member_name or "").replace("\\", "/")
    if not raw:
        return ""
    if raw.startswith("/") or raw.startswith("\\") or (len(raw) >= 2 and raw[1] == ":"):
        raise ValueError(f"Archive contains an absolute path: {member_name}")
    parts = []
    for part in raw.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            raise ValueError(f"Archive contains a path traversal entry: {member_name}")
        parts.append(part)
    return "/".join(parts)


def _zip_entry_is_symlink(entry):
    mode = (int(entry.external_attr) >> 16) & 0o170000
    return mode == stat.S_IFLNK


def _set_resource_progress(task_id, *, current, total, phase, file_name):
    download_progress[task_id] = {
        "percent": (float(current) / float(total) * 100.0) if total > 0 else 0.0,
        "current": int(max(0, current)),
        "total": int(max(0, total)),
        "file_name": file_name,
        "phase": phase,
    }


def _extract_resource_archive(archive_path, staging_root, bundle, task_id):
    archive_root = str(bundle.get("archive_root") or "").strip().replace("\\", "/").strip("/")
    prefix = f"{archive_root}/" if archive_root else ""
    extracted_total = 0
    extracted_current = 0
    found_entries = False
    with zipfile.ZipFile(archive_path, "r") as archive:
        entries = archive.infolist()
        for entry in entries:
            if not entry.is_dir() and not entry.filename.endswith("/"):
                extracted_total += max(0, int(entry.file_size or 0))
        _set_resource_progress(
            task_id,
            current=0,
            total=extracted_total,
            phase="installing",
            file_name=str(bundle.get("file_name") or "resource.zip"),
        )
        for entry in entries:
            if _is_download_cancelled(task_id):
                raise DownloadCancelled(f"下载任务已停止: {task_id}")
            member_path = _safe_archive_member_path(entry.filename)
            if not member_path:
                continue
            if archive_root:
                if member_path == archive_root:
                    continue
                if not member_path.startswith(prefix):
                    raise ValueError(f"Archive entry is outside archive_root: {entry.filename}")
                member_path = member_path[len(prefix):]
            if not member_path:
                continue
            if _zip_entry_is_symlink(entry):
                raise ValueError(f"Archive symlinks are not supported: {entry.filename}")
            destination = os.path.abspath(os.path.join(staging_root, *member_path.split("/")))
            if os.path.commonpath([os.path.abspath(staging_root), destination]) != os.path.abspath(staging_root):
                raise ValueError(f"Archive entry escapes staging directory: {entry.filename}")
            found_entries = True
            if entry.is_dir() or entry.filename.endswith("/"):
                os.makedirs(destination, exist_ok=True)
                continue
            os.makedirs(os.path.dirname(destination), exist_ok=True)
            with archive.open(entry, "r") as source, open(destination, "wb") as target:
                while True:
                    if _is_download_cancelled(task_id):
                        raise DownloadCancelled(f"下载任务已停止: {task_id}")
                    chunk = source.read(8 * 1024 * 1024)
                    if not chunk:
                        break
                    target.write(chunk)
                    extracted_current += len(chunk)
                    _set_resource_progress(
                        task_id,
                        current=extracted_current,
                        total=extracted_total,
                        phase="installing",
                        file_name=str(bundle.get("file_name") or "resource.zip"),
                    )
    if not found_entries:
        raise ValueError("Resource archive contains no installable entries")


def _validate_resource_bundle_directory(root_dir, bundle):
    for required_path in bundle.get("required_paths", []) or []:
        candidate, requires_directory = _resource_bundle_required_path(root_dir, required_path)
        if requires_directory:
            valid = os.path.isdir(candidate)
        else:
            valid = os.path.isfile(candidate)
        if not valid:
            raise ValueError(f"Required resource path is missing: {required_path}")
    return True


def _remove_path(path):
    if not path or not os.path.lexists(path):
        return
    if os.path.isdir(path) and not os.path.islink(path):
        shutil.rmtree(path)
    else:
        os.remove(path)


def _install_resource_bundle(archive_path, bundle, task_id):
    target_root = _resource_install_root(bundle)
    parent_dir = os.path.dirname(target_root)
    os.makedirs(parent_dir, exist_ok=True)
    staging_root = tempfile.mkdtemp(
        prefix=f".{os.path.basename(target_root)}.staging-",
        dir=parent_dir,
    )
    backup_root = f"{target_root}.backup-{time.time_ns()}"
    moved_existing = False
    try:
        _extract_resource_archive(archive_path, staging_root, bundle, task_id)
        _validate_resource_bundle_directory(staging_root, bundle)
        marker_path = os.path.join(staging_root, ".simpleai-resource.json")
        with open(marker_path, "w", encoding="utf-8") as marker_file:
            json.dump(
                {
                    "id": bundle.get("id", ""),
                    "version": bundle.get("version", ""),
                    "sha256": bundle.get("sha256", ""),
                    "installed_at": time.time(),
                },
                marker_file,
                ensure_ascii=False,
                indent=2,
            )
        if os.path.lexists(target_root):
            os.rename(target_root, backup_root)
            moved_existing = True
        os.rename(staging_root, target_root)
        staging_root = ""
        if moved_existing:
            _remove_path(backup_root)
        return target_root
    except Exception:
        if os.path.lexists(target_root) and moved_existing:
            _remove_path(target_root)
        if moved_existing and os.path.lexists(backup_root) and not os.path.lexists(target_root):
            os.rename(backup_root, target_root)
        raise
    finally:
        if staging_root:
            _remove_path(staging_root)
        if os.path.lexists(backup_root):
            _remove_path(backup_root)


def _install_local_resource_bundle(bundle):
    if is_resource_bundle_installed(bundle):
        _cleanup_installed_resource_archives(bundle)
        return True

    archive_path = _find_existing_resource_archive(bundle, verify=True)
    if not archive_path:
        return False

    task_id = _resource_task_id(bundle.get("id"))
    try:
        _install_resource_bundle(archive_path, bundle, task_id)
        if os.path.isfile(archive_path):
            os.remove(archive_path)
        if task_id not in download_tasks:
            download_progress.pop(task_id, None)
        logger.info("已安装用户放置的资源包: %s", _resource_install_root(bundle))
        return True
    except Exception as error:
        logger.warning("用户放置的资源包安装失败: %s (%s)", archive_path, error)
        return False


def _download_resource_bundle_task(task_id, bundle):
    local_archive_path = None
    archive_path = None
    file_name = str(bundle.get("file_name") or "resource.zip")
    success = False
    try:
        local_archive_path = _find_existing_resource_archive(bundle, verify=True)
        archive_path = local_archive_path or _resource_archive_path(bundle)
        file_name = str(bundle.get("file_name") or os.path.basename(archive_path))
        if not local_archive_path:
            os.makedirs(os.path.dirname(archive_path), exist_ok=True)
        if not local_archive_path and not _resource_archive_is_ready(archive_path, bundle):
            if os.path.isfile(archive_path):
                try:
                    os.remove(archive_path)
                except OSError:
                    pass
            urls = _split_download_urls(bundle.get("url"))
            if not urls:
                raise ValueError("Resource bundle has no download URL")
            last_error = None
            for candidate_url in urls:
                try:
                    anyio.run(
                        download_file_with_progress,
                        _apply_hf_mirror(candidate_url),
                        archive_path,
                        _normalize_expected_size(bundle.get("size", 0)),
                        task_id,
                        False,
                    )
                    last_error = None
                    break
                except DownloadCancelled:
                    raise
                except Exception as error:
                    last_error = error
                    logger.warning("资源包下载地址失败，准备尝试下一个地址: %s", candidate_url)
            if last_error is not None:
                raise last_error
        if not local_archive_path:
            try:
                _verify_resource_archive(archive_path, bundle, task_id=task_id)
            except (ValueError, zipfile.BadZipFile):
                try:
                    os.remove(archive_path)
                except OSError:
                    pass
                raise
        else:
            logger.info("检测到用户放置的资源包，直接安装: %s", archive_path)
        if _is_download_cancelled(task_id):
            raise DownloadCancelled(f"下载任务已停止: {task_id}")
        _install_resource_bundle(archive_path, bundle, task_id)
        success = True
        if os.path.isfile(archive_path):
            try:
                os.remove(archive_path)
            except OSError as error:
                logger.warning("资源包已安装，但清理下载缓存失败: %s (%s)", archive_path, error)
        _clear_missing_model_list_cache()
        logger.info("资源包安装完成: %s", _resource_install_root(bundle))
    except DownloadCancelled:
        logger.info("资源包下载任务已停止: %s", task_id)
        _mark_download_cancelled(task_id, file_name)
    except Exception as error:
        logger.exception("资源包下载或安装失败: %s", task_id)
        _mark_download_error(task_id, error, file_name)
    finally:
        with task_lock:
            download_tasks.discard(task_id)
            download_cancel_requests.discard(task_id)
            if success:
                download_progress.pop(task_id, None)
                download_task_metadata.pop(task_id, None)
            elif task_id not in download_progress:
                _mark_download_error(task_id, "resource download failed", file_name)


def download_resource_bundle(bundle, user_did=None, async_task=True):
    if user_did is None:
        logger.warning("download_resource_bundle skipped: user_did is None")
        return False
    if shared.args.disable_backend:
        logger.warning("download_resource_bundle skipped: backend is disabled")
        return False
    parsed = _parse_resource_bundle_entries([bundle])
    if not parsed:
        return False
    bundle = parsed[0]
    if _install_local_resource_bundle(bundle):
        return _resource_task_id(bundle.get("id"))
    task_id = _resource_task_id(bundle.get("id"))
    if not task_id:
        return False
    with task_lock:
        if task_id in download_tasks:
            return task_id
        if task_id in download_progress:
            download_progress.pop(task_id, None)
        download_cancel_requests.discard(task_id)
        _remember_download_task(
            task_id,
            file_name=bundle.get("file_name", "resource.zip"),
            model_dir=os.path.dirname(_resource_archive_path(bundle)),
            url=bundle.get("url", ""),
            size=bundle.get("size", 0),
            kind="resource",
            resource_id=bundle.get("id", ""),
        )
        download_progress[task_id] = {
            "percent": 0.0,
            "current": 0,
            "total": _normalize_expected_size(bundle.get("size", 0)),
            "file_name": bundle.get("file_name", "resource.zip"),
            "queued": True,
        }
        download_tasks.add(task_id)
    if async_task:
        thread_pool.submit(_download_resource_bundle_task, task_id, bundle)
    else:
        _download_resource_bundle_task(task_id, bundle)
    return task_id


def download_resource_bundles(preset, user_did=None, async_task=True, raw_resource_bundles=None):
    if raw_resource_bundles is None:
        bundles = get_resource_bundles(preset, user_did=user_did)
    else:
        bundles = _parse_resource_bundle_entries(raw_resource_bundles)
    for bundle in bundles:
        if not _install_local_resource_bundle(bundle):
            download_resource_bundle(bundle, user_did=user_did, async_task=async_task)
    return True


def get_resource_download_status(resource_id):
    return get_download_status(_resource_task_id(resource_id))

def _parse_model_list_entries(raw_model_list):
    model_list = []
    for model_entry in raw_model_list or []:
        if isinstance(model_entry, str):
            parts = model_entry.split(',')
            if len(parts) < 5:
                continue
            cata, path_file, size, hash10 = parts[:4]
            url = ",".join(parts[4:])
        elif isinstance(model_entry, (list, tuple)) and len(model_entry) >= 5:
            cata, path_file, size, hash10 = model_entry[:4]
            url = ",".join(str(part) for part in model_entry[4:] if str(part).strip())
        else:
            continue

        cata = str(cata).strip()
        path_file = str(path_file).strip()
        url = str(url).strip().strip('`')
        try:
            size = int(str(size).strip())
        except Exception:
            size = 0
        hash10 = str(hash10).strip()
        model_list.append((cata, path_file, size, hash10, url))
    return model_list

def _build_missing_model_details(model_list, previous_default_info=None):
    missing_models_with_details = []
    previous_default_info = previous_default_info or {}

    for cata, path_file, size, hash10, url in model_list:
        url = str(url or '').strip().strip('`')

        if path_file[:1] == '[' and path_file[-1:] == ']':
            result = shared.modelsinfo.get_model_names(cata, [f'{path_file[1:-1]}/'], casesensitive=True)
            if result is not None and len(result) >= size:
                continue
        else:
            file_path = _resolve_model_filepath(cata, path_file)
            if file_path and os.path.exists(file_path):
                if not size or os.path.getsize(file_path) == size:
                    continue
            if _existing_previous_default_model(cata, previous_default_info, path_file):
                continue

        human_size = format_size(size)
        if not url:
            url = f'{default_download_url_prefix}/{cata}/{path_file}'
        missing_models_with_details.append((cata, path_file, human_size, url, size))

    return missing_models_with_details


def _build_fallback_model_details(model_list, previous_default_info=None):
    fallback_models_with_details = []
    previous_default_info = previous_default_info or {}

    for cata, path_file, size, hash10, url in model_list:
        url = str(url or '').strip().strip('`')

        if path_file[:1] == '[' and path_file[-1:] == ']':
            continue

        file_path = _resolve_model_filepath(cata, path_file)
        if file_path and os.path.exists(file_path) and _file_size_matches(file_path, size):
            continue

        legacy_match = _find_previous_default_model_match(cata, previous_default_info, path_file)
        if not legacy_match:
            continue

        human_size = format_size(size)
        if not url:
            url = f'{default_download_url_prefix}/{cata}/{path_file}'
        fallback_models_with_details.append(
            {
                "cata": str(cata or ""),
                "path_file": str(path_file or ""),
                "human_size": human_size,
                "url": url,
                "size": size,
                "legacy_model": str(legacy_match.get("previous_model") or ""),
                "legacy_path": str(legacy_match.get("file_path") or ""),
                "legacy_human_name": os.path.basename(str(legacy_match.get("previous_model") or "")) or str(legacy_match.get("previous_model") or ""),
                "current_model": str(legacy_match.get("current_model") or path_file or ""),
                "current_key": str(legacy_match.get("current_key") or ""),
            }
        )

    return fallback_models_with_details

def _resolve_model_filepath(cata: str, path_file: str) -> str:
    try:
        file_path = shared.modelsinfo.get_model_filepath(cata, path_file)
    except Exception:
        file_path = ''
    if file_path and os.path.exists(file_path):
        return file_path

    if path_file and os.path.isabs(path_file) and os.path.exists(path_file):
        return os.path.abspath(path_file)

    normalized_rel = str(path_file or "").replace("\\", "/").lstrip("/")
    rel_parts = [p for p in normalized_rel.split("/") if p]

    try:
        from modules.config import model_cata_map, path_models_root
    except Exception:
        model_cata_map = {}
        path_models_root = "models"

    roots = model_cata_map.get(cata, [])
    if isinstance(roots, str):
        roots = [roots]
    elif not isinstance(roots, list):
        try:
            roots = list(roots)
        except Exception:
            roots = []

    legacy_roots = []
    for legacy_cata in LEGACY_CATEGORY_SEARCH_PATHS.get(cata, ()):
        legacy_values = model_cata_map.get(legacy_cata, [])
        if isinstance(legacy_values, str):
            legacy_values = [legacy_values]
        elif not isinstance(legacy_values, list):
            try:
                legacy_values = list(legacy_values)
            except Exception:
                legacy_values = []
        legacy_roots.extend(legacy_values)
        legacy_roots.append(os.path.join(path_models_root, legacy_cata))

    roots = list(roots) + [os.path.join(path_models_root, cata)] + legacy_roots
    for base_dir in roots:
        if not base_dir:
            continue
        candidate = os.path.abspath(os.path.join(base_dir, *rel_parts))
        if os.path.exists(candidate):
            return candidate

    try:
        manual_path = os.path.abspath(os.path.join('..', '..', 'SimpleModels', cata, *rel_parts))
        if os.path.exists(manual_path):
            return manual_path
    except Exception:
        pass

    return ''

def refresh_model_list(presets, user_did=None):
    from enhanced.simpleai import get_path_in_user_dir
    global presets_model_list, presets_resource_bundles, presets_mtime

    path_preset = os.path.abspath(f'./presets/')
    if user_did:
        user_path_preset = get_path_in_user_dir('presets', user_did)
    if len(presets)>0:
        for preset in presets:
            if preset.endswith('.'):
                if user_did is None:
                    continue
                preset_file = os.path.join(user_path_preset, f'{preset}json')
                preset = f'{preset}{user_did[:7]}'
            else:
                preset_file = os.path.join(path_preset, f'{preset}.json')
            try:
                mtime = os.path.getmtime(preset_file)
                if preset not in presets_mtime:
                    presets_mtime[preset] = 0
                if mtime>presets_mtime[preset]:
                    presets_mtime[preset] = mtime
                    with open(preset_file, "r", encoding="utf-8") as json_file:
                        config_preset = json.load(json_file)
                    if isinstance(config_preset, dict):
                        if "model_list" in config_preset:
                            model_list = _parse_model_list_entries(config_preset.get("model_list", []))
                            presets_model_list[preset] = model_list
                        else:
                            presets_model_list.pop(preset, None)
                        resource_bundles = _parse_resource_bundle_entries(config_preset.get("resource_bundles", []))
                        if resource_bundles:
                            presets_resource_bundles[preset] = resource_bundles
                        else:
                            presets_resource_bundles.pop(preset, None)
                        presets_previous_default_models[preset] = _preset_previous_default_model_info(config_preset)
                        _clear_missing_model_list_cache()
            except Exception as e:
                logger.info(f'load preset file failed: {preset_file}')
                continue
    return
            

def check_models_exists(preset, user_did=None):
    global presets_model_list

    if preset.endswith('.'):
        if user_did is None:
            return False
        preset = f'{preset}{user_did[:7]}'
    model_list = [] if preset not in presets_model_list else presets_model_list[preset]
    previous_default_info = presets_previous_default_models.get(preset, {})
    if len(model_list) > 0:
        for cata, path_file, size, hash10, url in model_list:
            if path_file[:1]=='[' and path_file[-1:]==']':
                path_file = [f'{path_file[1:-1]}/']
                result = shared.modelsinfo.get_model_names(cata, path_file, casesensitive=True)
                if result is None or len(result)<size:
                    logger.debug(f'Missing model dir in preset({preset}): {cata}, filter={path_file}, len={size}\nresult={result}')
                    return False
            else:
                file_path = _resolve_model_filepath(cata, path_file)

                if file_path is None or file_path == '' or not _file_size_matches(file_path, size):
                    if _existing_previous_default_model(cata, previous_default_info, path_file):
                        continue
                    logger.debug(f'Missing model file in preset({preset}): {cata}, {path_file}')
                    return False
    resource_bundles = get_resource_bundles(preset, user_did=user_did)
    if any(not is_resource_bundle_installed(bundle) for bundle in resource_bundles):
        return False
    return bool(model_list or resource_bundles)
def get_gpu_arch_str_in_preset_name():
    if shared.gpu_arch:
        if shared.gpu_arch.lower() == 'sm120':
            return '_fp4'
        else:
            return '_int4'
    return ''
def is_models_file_absent(preset_name, user_did=None):
    global presets_model_list, presets_resource_bundles
    if shared.args.disable_backend:
        return False
    if preset_name in presets_model_list or preset_name in presets_resource_bundles:
        if check_models_exists(preset_name, user_did):
            return False
        else:
            return True

    # 先尝试原始路径
    preset_path = os.path.abspath(f'./presets/{preset_name}.json')

    # 如果原始路径不存在，尝试根据GPU架构添加_fp4或_int4后缀
    if not os.path.exists(preset_path):
        arch_str = get_gpu_arch_str_in_preset_name()
        if arch_str:
            preset_path_with_arch = os.path.abspath(f'./presets/{preset_name}{arch_str}.json')
            if os.path.exists(preset_path_with_arch):
                preset_path = preset_path_with_arch

    if os.path.exists(preset_path):
        with open(preset_path, "r", encoding="utf-8") as json_file:
            config_preset = json.load(json_file)
        previous_default_info = _preset_previous_default_model_info(config_preset)

        if config_preset.get("model_list"):
            for model_entry in config_preset["model_list"]:
                # 处理不同格式的model_entry
                if isinstance(model_entry, list) and len(model_entry) >= 2:
                    cata = model_entry[0]
                    path_file = model_entry[1]

                    # 检查文件是否存在
                    file_path = _resolve_model_filepath(cata, path_file)
                    if file_path is None or file_path == '' or not os.path.exists(file_path):
                        if _existing_previous_default_model(cata, previous_default_info, path_file):
                            continue
                        # 记录缺失的文件信息
                        logger.debug(f'Missing model file in preset({preset_name}): {cata}, {path_file}')
                        return True
                elif isinstance(model_entry, str):
                    # 处理字符串格式的条目
                    parts = model_entry.split(',')
                    if len(parts) >= 2:
                        cata = parts[0].strip()
                        path_file = parts[1].strip()

                        # 检查文件是否存在
                        file_path = _resolve_model_filepath(cata, path_file)
                        if file_path is None or file_path == '' or not os.path.exists(file_path):
                            if _existing_previous_default_model(cata, previous_default_info, path_file):
                                continue
                            # 记录缺失的文件信息
                            logger.debug(f'Missing model file in preset({preset_name}): {cata}, {path_file}')
                            return True

        resource_bundles = _parse_resource_bundle_entries(config_preset.get("resource_bundles", []))
        if any(not is_resource_bundle_installed(bundle) for bundle in resource_bundles):
            logger.debug("Missing resource bundle in preset(%s)", preset_name)
            return True

    return False

def format_size(size_bytes):
    if size_bytes == 0:
        return "0 B"
    size_name = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    while size_bytes >= 1024 and i < len(size_name) - 1:
        size_bytes /= 1024
        i += 1
    return f"{size_bytes:.2f} {size_name[i]}"

def get_missing_model_list(preset_name, user_did=None):
    global missing_model_list_cache

    cached_name, model_list, source_mtime = _get_cached_preset_model_list(preset_name, user_did)
    preset_path = ''
    source_key = cached_name or preset_name

    if model_list is None:
        preset_path = _get_preset_file_for_missing_models(preset_name, user_did)
        if not preset_path or not os.path.exists(preset_path):
            return []
        source_mtime = os.path.getmtime(preset_path)
        source_key = preset_path

    cache_key = (source_key, user_did or '', source_mtime, len(model_list or ()))
    now = time.monotonic()
    cached = missing_model_list_cache.get(cache_key)
    if cached and now - cached[0] <= missing_model_list_cache_ttl:
        return list(cached[1])

    previous_default_info = {}
    if cached_name:
        previous_default_info = presets_previous_default_models.get(cached_name, {})

    if model_list is None:
        with open(preset_path, "r", encoding="utf-8") as json_file:
            config_preset = json.load(json_file)
        model_list = _parse_model_list_entries(config_preset.get('model_list', []))
        previous_default_info = _preset_previous_default_model_info(config_preset)

    missing_models_with_details = _build_missing_model_details(model_list, previous_default_info)
    missing_model_list_cache[cache_key] = (now, tuple(missing_models_with_details))

    if len(missing_model_list_cache) > 64:
        oldest_keys = sorted(missing_model_list_cache, key=lambda key: missing_model_list_cache[key][0])[:16]
        for old_key in oldest_keys:
            missing_model_list_cache.pop(old_key, None)

    return missing_models_with_details


def get_fallback_model_list(preset_name, user_did=None):
    global missing_model_list_cache

    cached_name, model_list, source_mtime = _get_cached_preset_model_list(preset_name, user_did)
    preset_path = ''
    source_key = cached_name or preset_name

    if model_list is None:
        preset_path = _get_preset_file_for_missing_models(preset_name, user_did)
        if not preset_path or not os.path.exists(preset_path):
            return []
        source_mtime = os.path.getmtime(preset_path)
        source_key = preset_path

    cache_key = (f'fallback:{source_key}', user_did or '', source_mtime, len(model_list or ()))
    now = time.monotonic()
    cached = missing_model_list_cache.get(cache_key)
    if cached and now - cached[0] <= missing_model_list_cache_ttl:
        return list(cached[1])

    previous_default_info = {}
    if cached_name:
        previous_default_info = presets_previous_default_models.get(cached_name, {})

    if model_list is None:
        with open(preset_path, "r", encoding="utf-8") as json_file:
            config_preset = json.load(json_file)
        model_list = _parse_model_list_entries(config_preset.get('model_list', []))
        previous_default_info = _preset_previous_default_model_info(config_preset)

    fallback_models_with_details = _build_fallback_model_details(model_list, previous_default_info)
    missing_model_list_cache[cache_key] = (now, tuple(fallback_models_with_details))
    return fallback_models_with_details

def get_missing_model_list_from_entries(preset_name, raw_model_list, user_did=None, source_mtime=0, previous_default_info=None):
    global missing_model_list_cache

    if not raw_model_list:
        return []

    if isinstance(previous_default_info, dict):
        previous_default_info = _preset_previous_default_model_info(previous_default_info)
    elif previous_default_info is None:
        previous_default_info = {}

    cache_key = (f'inline:{preset_name}', user_did or '', source_mtime or 0, len(raw_model_list or ()), repr(previous_default_info))
    now = time.monotonic()
    cached = missing_model_list_cache.get(cache_key)
    if cached and now - cached[0] <= missing_model_list_cache_ttl:
        return list(cached[1])

    model_list = _parse_model_list_entries(raw_model_list)
    missing_models_with_details = _build_missing_model_details(model_list, previous_default_info)
    missing_model_list_cache[cache_key] = (now, tuple(missing_models_with_details))
    return missing_models_with_details


def get_fallback_model_list_from_entries(preset_name, raw_model_list, user_did=None, source_mtime=0, previous_default_info=None):
    global missing_model_list_cache

    if not raw_model_list:
        return []

    if isinstance(previous_default_info, dict):
        previous_default_info = _preset_previous_default_model_info(previous_default_info)
    elif previous_default_info is None:
        previous_default_info = {}

    cache_key = (f'inline-fallback:{preset_name}', user_did or '', source_mtime or 0, len(raw_model_list or ()), repr(previous_default_info))
    now = time.monotonic()
    cached = missing_model_list_cache.get(cache_key)
    if cached and now - cached[0] <= missing_model_list_cache_ttl:
        return list(cached[1])

    model_list = _parse_model_list_entries(raw_model_list)
    fallback_models_with_details = _build_fallback_model_details(model_list, previous_default_info)
    missing_model_list_cache[cache_key] = (now, tuple(fallback_models_with_details))
    return fallback_models_with_details

def get_download_status(file_name):
    global download_progress
    return download_progress.get(file_name)

default_download_url_prefix = 'https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels'

def download_model_entry(cata, path_file, size=0, url=None, user_did=None, async_task=True, cleanup_file_path=None):
    from modules.config import path_models_root, model_cata_map
    global default_download_url_prefix

    if user_did is None:
        logger.warning("download_model_entry skipped: user_did is None")
        return False
    if shared.args.disable_backend:
        logger.warning("download_model_entry skipped: backend is disabled")
        return False

    cata = str(cata or "").strip()
    path_file = str(path_file or "").strip()
    if not cata or not path_file:
        return False

    try:
        size = int(size or 0)
    except Exception:
        size = 0

    if path_file[:1] == '[' and path_file[-1:] == ']':
        task_id = f"{cata}/{path_file}".replace("\\", "/").strip("/")
        _mark_download_error(
            task_id,
            "Folder-package zip downloads are no longer supported. Please install this model folder manually.",
            path_file.strip("[]"),
        )
        return False
    else:
        file_name = path_file.replace('\\', '/').replace(os.sep, '/')

    task_id = f"{cata}/{file_name}".replace("\\", "/").strip("/")

    if cata in model_cata_map:
        model_dirs = model_cata_map[cata]
    else:
        model_dirs = [os.path.join(path_models_root, cata)]

    if isinstance(model_dirs, str):
        model_dirs = [model_dirs]
    elif not isinstance(model_dirs, list):
        model_dirs = list(model_dirs)

    preferred_dir = None
    for base_dir in model_dirs:
        try:
            if os.path.basename(os.path.normpath(base_dir)).lower() == str(cata).lower():
                preferred_dir = base_dir
                break
        except Exception:
            continue
    if preferred_dir is None:
        preferred_dir = model_dirs[0] if model_dirs else os.path.join(path_models_root, cata)

    mismatch_path = None
    for base_dir in model_dirs:
        candidate_path = os.path.abspath(os.path.join(base_dir, file_name))
        if not os.path.exists(candidate_path):
            continue
        if _file_size_matches(candidate_path, size):
            _clear_missing_model_list_cache()
            return task_id
        if mismatch_path is None:
            mismatch_path = candidate_path

    full_path_file = mismatch_path or os.path.abspath(os.path.join(preferred_dir, file_name))

    if url is None or url == '':
        url = f'{default_download_url_prefix}/{cata}/{path_file}'

    if mismatch_path:
        logger.info(f'The model file size mismatches, ready to redownload single: {file_name} -> {full_path_file} from {url}')
    else:
        logger.info(f'The model file is not exists, ready to download single: {file_name} -> {full_path_file} from {url}')
    load_file_from_url(
        url=url,
        model_dir=os.path.dirname(full_path_file),
        file_name=os.path.basename(full_path_file),
        async_task=async_task,
        size=size,
        task_id=task_id,
        cleanup_file_path=cleanup_file_path,
    )
    return task_id

def download_model_files(preset, user_did=None, async_task=False):
    from modules.config import path_models_root, model_cata_map
    global presets_model_list, default_download_url_prefix, download_queue

    if user_did is None:
        logger.warning("download_model_files skipped: user_did is None")
        return False
    if shared.args.disable_backend:
        return False
    if preset.endswith('.'):
        if user_did is None:
            return False
        preset = f'{preset}{user_did[:7]}'
    # 尝试根据GPU架构获取合适的预置包名称
    arch_str = get_gpu_arch_str_in_preset_name()
    model_list = []

    # 首先尝试使用架构特定的预置包名称
    if arch_str and f'{preset}{arch_str}' in presets_model_list:
        model_list = presets_model_list[f'{preset}{arch_str}']
    # 如果没有找到，尝试使用原始预置包名称
    elif preset in presets_model_list:
        model_list = presets_model_list[preset]

    if len(model_list)>0:
        for cata, path_file, size, hash10, url in model_list:
            if path_file[:1]=='[' and path_file[-1:]==']':
                result = shared.modelsinfo.get_model_names(cata, [f'{path_file[1:-1]}/'], casesensitive=True)
                if result and len(result)>=size:
                    continue
                task_id = f"{cata}/{path_file}".replace("\\", "/").strip("/")
                _mark_download_error(
                    task_id,
                    "Folder-package zip downloads are no longer supported. Please install this model folder manually.",
                    path_file.strip("[]"),
                )
                continue
            else:
                file_name = path_file.replace('\\', '/').replace(os.sep, '/')
                task_id = f"{cata}/{file_name}".replace("\\", "/")

            if cata in model_cata_map:
                model_dirs = model_cata_map[cata]
            else:
                model_dirs = [os.path.join(path_models_root, cata)]

            if isinstance(model_dirs, str):
                model_dirs = [model_dirs]
            elif not isinstance(model_dirs, list):
                model_dirs = list(model_dirs)

            found_existing = False
            mismatch_path = None
            for base_dir in model_dirs:
                candidate_path = os.path.abspath(os.path.join(base_dir, file_name))
                if os.path.exists(candidate_path):
                    if not _file_size_matches(candidate_path, size):
                        if mismatch_path is None:
                            mismatch_path = candidate_path
                        continue
                    found_existing = True
                    break
            if found_existing:
                _clear_missing_model_list_cache()
                continue

            preferred_dir = None
            for base_dir in model_dirs:
                try:
                    if os.path.basename(os.path.normpath(base_dir)).lower() == str(cata).lower():
                        preferred_dir = base_dir
                        break
                except Exception:
                    continue
            if preferred_dir is None:
                preferred_dir = model_dirs[0] if model_dirs else os.path.join(path_models_root, cata)

            full_path_file = mismatch_path or os.path.abspath(os.path.join(preferred_dir, file_name))
            model_dir = os.path.dirname(full_path_file)
            file_name = os.path.basename(full_path_file)
            if url is None or url == '':
                url = f'{default_download_url_prefix}/{cata}/{path_file}'
            if mismatch_path:
                logger.info(f'The model file size mismatches, ready to redownload: {file_name} -> {full_path_file} from {url}')
            else:
                logger.info(f'The model file is not exists, ready to download: {file_name} -> {full_path_file} from {url}')
            if not async_task:
                load_file_from_url(
                    url=url,
                    model_dir=model_dir,
                    file_name=file_name,
                    task_id=task_id
                )
            else:
                load_file_from_url(
                    url=url,
                    model_dir=model_dir,
                    file_name=file_name,
                    async_task=True,
                    size=size,
                    task_id=task_id
                )
    return
