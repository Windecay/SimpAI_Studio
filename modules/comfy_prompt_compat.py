import copy
import inspect
import logging
import os
import time
from contextvars import ContextVar
from functools import wraps

import httpx

from enhanced.logger import format_name


logger = logging.getLogger(format_name(__name__))

_OBJECT_INFO_CACHE = {
    "endpoint": "",
    "expires_at": 0.0,
    "data": None,
}

_BATCH_QUEUED_PROMPT = ContextVar("studio_batch_queued_prompt", default=None)


class ComfyMediaUploadError(RuntimeError):
    def __init__(self, filename, size=None, status=None, limit=None):
        self.filename = filename
        self.size = size
        self.status = status
        self.limit = limit
        super().__init__(self.user_message())

    def user_message(self, language=None):
        cn = language in ("cn", "zh", "zh-CN")
        if self.status == 413:
            size = f"{self.size / 1024**2:.1f} MiB"
            limit = f"{self.limit / 1024**2:g} MiB" if self.limit else None
            if cn:
                reported = f"，Comfyd 配置上限 {limit}" if limit else ""
                return (f"素材「{self.filename}」超过上传大小限制（HTTP 413，文件 {size}{reported}）。"
                        "请减小文件体积，或联系管理员提高上传上限后重试。")
            reported = f", Comfyd configured limit {limit}" if limit else ""
            return (f'Media "{self.filename}" exceeds the upload size limit (HTTP 413, file {size}{reported}). '
                    "Use a smaller file or ask an administrator to raise the upload limit, then retry.")
        detail = f"HTTP {self.status}" if self.status is not None else (
            "无法读取本地文件或未收到有效的上传响应" if cn else "file unreadable or no valid upload response"
        )
        if cn:
            return f"素材「{self.filename}」上传到 Comfyd 失败（{detail}）。任务未提交。"
        return f'Media "{self.filename}" could not be uploaded to Comfyd ({detail}). Task not submitted.'


def install_media_upload_error_support(pipeline):
    upload_file = getattr(pipeline, "upload_file", None)
    if not callable(upload_file) or getattr(upload_file, "_simpai_media_upload_error_support", False):
        return False

    @wraps(upload_file)
    def upload_file_checked(path):
        filename = os.path.basename(path)
        try:
            # Keep the current client's content-based names and cached-input reuse.
            if not all(callable(getattr(pipeline, name, None)) for name in (
                "_hash_file", "_input_file_is_available", "server_address",
            )):
                result = upload_file(path)
                if not result:
                    raise ComfyMediaUploadError(filename)
                return result
            size = os.path.getsize(path)
            file_hash = pipeline._hash_file(path)
            target = f"upload_file_{file_hash[:32]}{os.path.splitext(path)[1]}"
            if pipeline._input_file_is_available(target, size):
                return target
            endpoint = f"http://{pipeline.server_address()}"
            with open(path, "rb") as handle:
                response = httpx.post(
                    f"{endpoint}/upload/image",
                    files={"image": (target, handle)},
                    data={"overwrite": "true", "type": "input"},
                    timeout=30.0,
                )
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, dict) and isinstance(data.get("name"), str) and data["name"]:
                    return data["name"]
                raise ComfyMediaUploadError(filename)
            limit = None
            if response.status_code == 413:
                try:
                    features = httpx.get(f"{endpoint}/features", timeout=2.0)
                    features.raise_for_status()
                    data = features.json()
                    value = data.get("max_upload_size") if isinstance(data, dict) else None
                    if type(value) in (int, float) and 0 < value < float("inf"):
                        limit = value
                except (httpx.HTTPError, ValueError):
                    pass
            raise ComfyMediaUploadError(filename, size, response.status_code, limit)
        except (OSError, ValueError, httpx.RequestError) as exc:
            raise ComfyMediaUploadError(filename) from exc

    upload_file_checked._simpai_media_upload_error_support = True
    pipeline.upload_file = upload_file_checked
    return True


def _queue_batch_prompt(pipeline, user_did, prompt, user_cert, extra_data, prompt_id, process_alive_callback):
    payload = {"prompt": prompt, "client_id": user_did, "user_cert": user_cert, "prompt_id": prompt_id}
    if extra_data:
        payload["extra_data"] = extra_data
    for attempt in range(1, pipeline.COMFYUI_PROMPT_SUBMIT_ATTEMPTS + 1):
        try:
            with httpx.Client(timeout=pipeline.COMFYUI_PROMPT_HTTP_TIMEOUT) as client:
                response = client.post(f"http://{pipeline.server_address()}/prompt", json=payload)
            if response.status_code != 200:
                logger.error("Comfy batch prompt rejected: status=%s, detail=%s", response.status_code, response.text)
                return None
            result = response.json()
            if not isinstance(result, dict) or result.get("prompt_id") != prompt_id:
                logger.error("Comfy batch prompt returned an unexpected ID: %s", prompt_id)
                return None
            return result
        except httpx.RequestError as error:
            connection_failed = isinstance(error, (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout))
            if not connection_failed:
                job = pipeline.wait_for_prompt_acceptance(prompt_id)
                if job is not None:
                    return {"prompt_id": prompt_id, "recovered": True, "job_status": job.get("status")}
            if attempt < pipeline.COMFYUI_PROMPT_SUBMIT_ATTEMPTS:
                if connection_failed:
                    pipeline.wait_for_server_ready(process_alive_callback=process_alive_callback)
                else:
                    time.sleep(1.0)
    return None


def _batch_argument_signature(function, name):
    signature = inspect.signature(function)
    if name in signature.parameters:
        return signature
    parameters = list(signature.parameters.values())
    position = next((i for i, value in enumerate(parameters) if value.kind == inspect.Parameter.VAR_KEYWORD), len(parameters))
    parameters.insert(position, inspect.Parameter(name, inspect.Parameter.KEYWORD_ONLY, default=None))
    return signature.replace(parameters=parameters)


def install_batch_prompt_support(pipeline):
    """Keep prequeue support in Studio without changing the installed dependency."""
    queue_prompt = getattr(pipeline, "queue_prompt", None)
    get_images = getattr(pipeline, "get_images", None)
    if not callable(queue_prompt) or not callable(get_images):
        return False
    if getattr(queue_prompt, "_simpai_batch_prompt_support", False):
        return False
    queue_signature = inspect.signature(queue_prompt)
    image_signature = inspect.signature(get_images)
    native_prompt_id = "prompt_id" in queue_signature.parameters
    if native_prompt_id and "queued_prompt" in image_signature.parameters:
        return False

    @wraps(queue_prompt)
    def queue_prompt_with_batch_support(user_did, prompt, user_cert, extra_data=None, *args, prompt_id=None, **kwargs):
        queued = _BATCH_QUEUED_PROMPT.get()
        if queued is not None and queued[0] is pipeline and queued[1] == user_did:
            return queued[2]
        if prompt_id is None:
            return queue_prompt(user_did, prompt, user_cert, extra_data, *args, **kwargs)
        if native_prompt_id:
            return queue_prompt(user_did, prompt, user_cert, extra_data, *args, prompt_id=prompt_id, **kwargs)
        bound = queue_signature.bind(user_did, prompt, user_cert, extra_data, *args, **kwargs)
        return _queue_batch_prompt(
            pipeline, user_did, prompt, user_cert, extra_data, prompt_id,
            bound.arguments.get("process_alive_callback"),
        )

    @wraps(get_images)
    def get_images_with_batch_support(*args, queued_prompt=None, **kwargs):
        if queued_prompt is None:
            return get_images(*args, **kwargs)
        client_id = args[0] if args else kwargs["user_did"]
        token = _BATCH_QUEUED_PROMPT.set((pipeline, client_id, queued_prompt))
        try:
            return get_images(*args, **kwargs)
        finally:
            _BATCH_QUEUED_PROMPT.reset(token)

    queue_prompt_with_batch_support.__signature__ = _batch_argument_signature(queue_prompt, "prompt_id")
    get_images_with_batch_support.__signature__ = _batch_argument_signature(get_images, "queued_prompt")
    queue_prompt_with_batch_support._simpai_batch_prompt_support = True
    pipeline.queue_prompt = queue_prompt_with_batch_support
    pipeline.get_images = get_images_with_batch_support
    return True


_STUDIO_MODEL_DOWNLOAD_INPUTS = {
    "RIFEInterpolation": "allow_download",
    "SimpAIH3LoopSource": "allow_download",
    "easy applyPowerPaint": "allow_download",
    "easy applyInpaint": "allow_download",
    "RemBGSession+": "allow_download",
    "SimpleModelDownloader": "allow_download",
}


def restrict_studio_model_downloads(prompt):
    """Keep Studio inference separate from its approved model-download action.

    This client-side policy is not installed in the native Comfy prompt server.
    Copy only changed nodes so the caller's workflow and native defaults remain intact.
    """
    if not isinstance(prompt, dict):
        return prompt
    result = prompt
    for node_id, node in prompt.items():
        if not isinstance(node, dict):
            continue
        input_name = _STUDIO_MODEL_DOWNLOAD_INPUTS.get(node.get("class_type"))
        inputs = node.get("inputs")
        if not input_name or not isinstance(inputs, dict) or inputs.get(input_name) is False:
            continue
        if result is prompt:
            result = dict(prompt)
        result[node_id] = {**node, "inputs": {**inputs, input_name: False}}
    return result


def _comfy_endpoint(comfyclient_pipeline):
    try:
        return str(comfyclient_pipeline.server_address())
    except Exception:
        return ""


def _clear_object_info_cache():
    _OBJECT_INFO_CACHE.update({
        "endpoint": "",
        "expires_at": 0.0,
        "data": None,
    })


def invalidate_comfy_object_info_cache():
    _clear_object_info_cache()


def refresh_comfy_model_catalog(comfyclient_pipeline, ttl_seconds=3600.0, timeout_seconds=60.0):
    endpoint = _comfy_endpoint(comfyclient_pipeline)
    if not endpoint:
        return False

    now = time.monotonic()
    previous = dict(_OBJECT_INFO_CACHE)
    try:
        with httpx.Client(timeout=timeout_seconds) as client:
            response = client.get(f"http://{endpoint}/object_info?refresh=1")
            response.raise_for_status()
            data = response.json()
        if not isinstance(data, dict):
            raise ValueError("Comfy object_info response is not an object")
    except Exception as exc:
        if previous.get("endpoint") == endpoint and isinstance(previous.get("data"), dict):
            _OBJECT_INFO_CACHE.update(previous)
        logger.warning("Comfy model catalog refresh unavailable; Studio file refresh continues: %s", exc)
        return False

    _OBJECT_INFO_CACHE.update({
        "endpoint": endpoint,
        "expires_at": now + float(ttl_seconds),
        "data": data,
    })
    logger.info("Refreshed Comfy model catalog: %s", endpoint)
    return True


def _normal_model_key(value):
    return str(value or "").strip().replace("\\", "/")


def _enum_choices_from_input_spec(spec):
    if not isinstance(spec, (list, tuple)) or not spec:
        return []
    choices = spec[0]
    if not isinstance(choices, (list, tuple)):
        return []
    return [str(item) for item in choices if isinstance(item, str)]


def _enum_inputs_for_class(class_info):
    if not isinstance(class_info, dict):
        return {}
    input_info = class_info.get("input")
    if not isinstance(input_info, dict):
        return {}
    result = {}
    for group_name in ("required", "optional"):
        group = input_info.get(group_name)
        if not isinstance(group, dict):
            continue
        for input_name, spec in group.items():
            choices = _enum_choices_from_input_spec(spec)
            if choices:
                result[str(input_name)] = choices
    return result


def _match_enum_choice(value, choices):
    if not isinstance(value, str) or not choices:
        return value
    if value in choices:
        return value
    if "/" not in value and "\\" not in value:
        return value

    normalized_value = _normal_model_key(value)
    exact = {}
    lower = {}
    lower_counts = {}
    for choice in choices:
        normalized_choice = _normal_model_key(choice)
        exact.setdefault(normalized_choice, choice)
        lower_key = normalized_choice.lower()
        lower.setdefault(lower_key, choice)
        lower_counts[lower_key] = lower_counts.get(lower_key, 0) + 1

    if normalized_value in exact:
        return exact[normalized_value]
    lower_value = normalized_value.lower()
    if lower_counts.get(lower_value) == 1:
        return lower[lower_value]
    return value


def normalize_comfy_prompt_enum_paths(prompt, object_info):
    if not isinstance(prompt, dict) or not isinstance(object_info, dict):
        return prompt, []

    normalized_prompt = prompt
    changes = []
    enum_cache = {}

    for node_id, node in prompt.items():
        if not isinstance(node, dict):
            continue
        class_type = str(node.get("class_type") or "")
        inputs = node.get("inputs")
        if not class_type or not isinstance(inputs, dict):
            continue

        enum_inputs = enum_cache.get(class_type)
        if enum_inputs is None:
            enum_inputs = _enum_inputs_for_class(object_info.get(class_type))
            enum_cache[class_type] = enum_inputs
        if not enum_inputs:
            continue

        for input_name, value in list(inputs.items()):
            choices = enum_inputs.get(str(input_name))
            if not choices:
                continue
            matched = _match_enum_choice(value, choices)
            if matched == value:
                continue

            if normalized_prompt is prompt:
                normalized_prompt = copy.deepcopy(prompt)
            normalized_prompt[node_id]["inputs"][input_name] = matched
            changes.append({
                "node_id": str(node_id),
                "class_type": class_type,
                "input": str(input_name),
                "from": value,
                "to": matched,
            })

    return normalized_prompt, changes


def get_comfy_object_info(comfyclient_pipeline, ttl_seconds=30.0):
    endpoint = _comfy_endpoint(comfyclient_pipeline)
    if not endpoint:
        return None

    cached = _OBJECT_INFO_CACHE
    if cached.get("endpoint") == endpoint and isinstance(cached.get("data"), dict):
        return cached.get("data")
    return None


def normalize_comfy_prompt_for_pipeline(prompt, comfyclient_pipeline):
    object_info = get_comfy_object_info(comfyclient_pipeline)
    if not object_info:
        return prompt, []
    return normalize_comfy_prompt_enum_paths(prompt, object_info)


def install_queue_prompt_normalizer(comfyclient_pipeline):
    queue_prompt = getattr(comfyclient_pipeline, "queue_prompt", None)
    if not callable(queue_prompt) or getattr(queue_prompt, "_simpai_enum_path_normalizer", False):
        return False

    @wraps(queue_prompt)
    def queue_prompt_with_enum_path_normalization(user_did, prompt, user_cert, extra_data=None, *args, **kwargs):
        normalized_prompt, changes = normalize_comfy_prompt_for_pipeline(prompt, comfyclient_pipeline)
        normalized_prompt = restrict_studio_model_downloads(normalized_prompt)
        if changes:
            preview = ", ".join(
                f"{item['node_id']}.{item['input']}={item['to']}"
                for item in changes[:8]
            )
            logger.info("Adjusted Comfy model enum paths for current backend: %s", preview)
        return queue_prompt(user_did, normalized_prompt, user_cert, extra_data, *args, **kwargs)

    queue_prompt_with_enum_path_normalization._simpai_enum_path_normalizer = True
    queue_prompt_with_enum_path_normalization._simpai_original_queue_prompt = queue_prompt
    comfyclient_pipeline.queue_prompt = queue_prompt_with_enum_path_normalization
    return True


def is_comfy_prompt_queued(queue, prompt_id):
    if not isinstance(queue, dict):
        raise ValueError("Invalid Comfy queue response.")
    queued = False
    for name in ("queue_running", "queue_pending"):
        group = queue.get(name)
        if not isinstance(group, list):
            raise ValueError("Invalid Comfy queue response.")
        for row in group:
            if not isinstance(row, (list, tuple)) or len(row) < 2 or not isinstance(row[1], str):
                raise ValueError("Invalid Comfy queue response.")
            if row[1] == prompt_id:
                queued = True
    return queued


def defer_comfy_task_release(prompt_id, endpoint, process=None):
    from modules.gpu_task_lock import defer_gpu_task_release

    def stopped():
        if process is not None and process.poll() is not None:
            return True
        with httpx.Client(timeout=httpx.Timeout(5, connect=3), trust_env=False) as client:
            response = client.get(f"{endpoint.rstrip('/')}/queue")
            response.raise_for_status()
            return not is_comfy_prompt_queued(response.json(), prompt_id)

    defer_gpu_task_release(stopped)


def install_prompt_cancel_support(comfyclient_pipeline):
    interrupt = getattr(comfyclient_pipeline, "interrupt", None)
    if not callable(interrupt) or getattr(interrupt, "_simpai_prompt_cancel_support", False):
        return False

    def interrupt_with_prompt_id(prompt_id=None):
        target_prompt_id = str(prompt_id or "").strip()
        if not target_prompt_id:
            return interrupt()

        try:
            endpoint = str(comfyclient_pipeline.server_address())
            with httpx.Client(timeout=20.0) as client:
                client.post(
                    f"http://{endpoint}/queue", json={"delete": [target_prompt_id]},
                ).raise_for_status()
                client.post(
                    f"http://{endpoint}/interrupt", json={"prompt_id": target_prompt_id},
                ).raise_for_status()
            logger.info("Requested cancellation of Comfy prompt by id: %s", target_prompt_id)
            return
        except Exception as exc:
            logger.warning("Targeted Comfy prompt cancel failed for %s: %s", target_prompt_id, exc)
            return False

    interrupt_with_prompt_id._simpai_prompt_cancel_support = True
    interrupt_with_prompt_id._simpai_original_interrupt = interrupt
    comfyclient_pipeline.interrupt = interrupt_with_prompt_id
    return True


class ComfyExecutionError(RuntimeError):
    def __init__(self, prompt_id, details):
        self.prompt_id = prompt_id
        self.node_id = str(details.get("node_id") or "")
        self.node_type = str(details.get("node_type") or "Comfy")
        self.exception_type = str(details.get("exception_type") or "ExecutionError")
        self.exception_message = str(details.get("exception_message") or "Execution failed.").strip()
        node = f"{self.node_type} (node {self.node_id})" if self.node_id else self.node_type
        super().__init__(f"{node}: {self.exception_type}: {self.exception_message}")


def _execution_error_from_history(history, prompt_id):
    if not isinstance(history, dict):
        return None
    if prompt_id in history:
        history = history[prompt_id]
    status = history.get("status") if isinstance(history, dict) else None
    messages = status.get("messages") if isinstance(status, dict) else None
    if not isinstance(messages, (list, tuple)):
        return None
    for message in reversed(messages):
        if not isinstance(message, (list, tuple)) or len(message) != 2:
            continue
        event, details = message
        if not isinstance(details, dict) or str(details.get("prompt_id") or prompt_id) != prompt_id:
            continue
        if event == "execution_interrupted":
            return None
        if event == "execution_error":
            return ComfyExecutionError(prompt_id, details)
    return None


def _check_empty_result_error(comfyclient_pipeline, prompt_id, timeout_seconds=1.0):
    get_history_item = getattr(comfyclient_pipeline, "get_history_item", None)
    if not callable(get_history_item):
        return
    deadline = time.monotonic() + max(0.0, float(timeout_seconds))
    while True:
        try:
            history = get_history_item(prompt_id)
        except (httpx.HTTPError, OSError, ValueError) as error:
            logger.warning("Comfy execution status unavailable: prompt_id=%s error=%s", prompt_id, error)
            return
        if history is not None:
            error = _execution_error_from_history(history, prompt_id)
            if error is not None:
                raise error
            return
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return
        time.sleep(min(0.05, remaining))


def install_execution_error_support(comfyclient_pipeline):
    get_images = getattr(comfyclient_pipeline, "get_images", None)
    if not callable(get_images) or getattr(get_images, "_simpai_execution_error_support", False):
        return False
    signature = inspect.signature(get_images)
    if "prompt_accepted_callback" not in signature.parameters:
        return False

    @wraps(get_images)
    def get_images_with_execution_errors(*args, **kwargs):
        bound = signature.bind(*args, **kwargs)
        original_callback = bound.arguments.get("prompt_accepted_callback")
        accepted_prompt_id = None

        def on_accepted(prompt_id, result):
            nonlocal accepted_prompt_id
            accepted_prompt_id = str(prompt_id or "")
            if original_callback is not None:
                original_callback(prompt_id, result)

        bound.arguments["prompt_accepted_callback"] = on_accepted
        images = get_images(*bound.args, **bound.kwargs)
        if not images and accepted_prompt_id:
            # The final websocket event can arrive just before history is committed.
            _check_empty_result_error(comfyclient_pipeline, accepted_prompt_id)
        return images

    get_images_with_execution_errors._simpai_execution_error_support = True
    comfyclient_pipeline.get_images = get_images_with_execution_errors
    return True
