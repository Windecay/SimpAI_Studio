import copy
import logging
import time

import httpx

from enhanced.logger import format_name


logger = logging.getLogger(format_name(__name__))

_OBJECT_INFO_CACHE = {
    "endpoint": "",
    "expires_at": 0.0,
    "data": None,
}


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

    def queue_prompt_with_enum_path_normalization(user_did, prompt, user_cert, extra_data=None, *args, **kwargs):
        normalized_prompt, changes = normalize_comfy_prompt_for_pipeline(prompt, comfyclient_pipeline)
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


def install_prompt_cancel_support(comfyclient_pipeline):
    interrupt = getattr(comfyclient_pipeline, "interrupt", None)
    if not callable(interrupt) or getattr(interrupt, "_simpai_prompt_cancel_support", False):
        return False

    def interrupt_with_prompt_id(prompt_id=None):
        target_prompt_id = str(prompt_id or "").strip()
        if not target_prompt_id:
            return interrupt()

        endpoint = str(comfyclient_pipeline.server_address())
        try:
            with httpx.Client(timeout=20.0) as client:
                client.post(f"http://{endpoint}/queue", json={"delete": [target_prompt_id]})
                client.post(f"http://{endpoint}/interrupt", json={"prompt_id": target_prompt_id})
            logger.info("Cancelled Comfy prompt by id: %s", target_prompt_id)
            return
        except Exception as exc:
            logger.warning("Targeted Comfy prompt cancel failed for %s: %s", target_prompt_id, exc)
            return interrupt()

    interrupt_with_prompt_id._simpai_prompt_cancel_support = True
    interrupt_with_prompt_id._simpai_original_interrupt = interrupt
    comfyclient_pipeline.interrupt = interrupt_with_prompt_id
    return True
