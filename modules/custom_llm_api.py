import json
import re
import socket
import time
import urllib.error
import urllib.request


OPENAI_CHAT_COMPLETIONS = "openai_compatible"
OPENAI_RESPONSES = "openai_responses"
SUPPORTED_API_FORMATS = (OPENAI_CHAT_COMPLETIONS, OPENAI_RESPONSES)
RETRYABLE_HTTP_STATUS_CODES = frozenset({408, 425, 429, 500, 502, 503, 504})
DEFAULT_MAX_ATTEMPTS = 3
_RETRY_BACKOFF_BASE_SECONDS = 0.35
_RETRY_BACKOFF_MAX_SECONDS = 8.0


class CustomLLMRequestError(RuntimeError):
    """A request failure with enough metadata to decide whether it is transient."""

    def __init__(self, message, *, status=None, retryable=False, retry_after=None):
        super().__init__(message)
        self.status = status
        self.retryable = bool(retryable)
        self.retry_after = retry_after


def normalize_api_format(value):
    api_format = str(value or OPENAI_CHAT_COMPLETIONS).strip() or OPENAI_CHAT_COMPLETIONS
    return api_format


def api_format_supported(value):
    return normalize_api_format(value) in SUPPORTED_API_FORMATS


def custom_llm_url(base_url, suffix):
    base = str(base_url or "").strip().rstrip("/")
    suffix = str(suffix or "").strip()
    if not suffix.startswith("/"):
        suffix = "/" + suffix
    return base + suffix


def responses_url(base_url):
    base = str(base_url or "").strip().rstrip("/")
    if re.search(r"/responses$", base, flags=re.IGNORECASE):
        return base
    if re.search(r"/v\d+(?:beta)?$", base, flags=re.IGNORECASE):
        return base + "/responses"
    return base + "/v1/responses"


def completion_url(base_url, api_format):
    if normalize_api_format(api_format) == OPENAI_RESPONSES:
        return responses_url(base_url)
    return custom_llm_url(base_url, "/chat/completions")


def models_url(base_url):
    base = str(base_url or "").strip().rstrip("/")
    base = re.sub(r"/(?:responses|chat/completions)$", "", base, flags=re.IGNORECASE)
    return custom_llm_url(base, "/models")


def _response_preview(body, limit=300):
    compact = re.sub(r"\s+", " ", str(body or "")).strip()
    return compact[:limit] or "<empty body>"


def _retry_after_seconds(headers):
    if not headers:
        return None
    raw = headers.get("Retry-After")
    if raw is None:
        return None
    try:
        return max(0.0, min(float(raw), _RETRY_BACKOFF_MAX_SECONDS))
    except (TypeError, ValueError):
        return None


def _request_json_once(url, payload=None, api_key="", method="POST", timeout=120):
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    api_key = str(api_key or "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
            if not body:
                return {}
            try:
                return json.loads(body)
            except json.JSONDecodeError as exc:
                status = getattr(response, "status", None) or response.getcode()
                content_type = response.headers.get("Content-Type", "unknown")
                raise CustomLLMRequestError(
                    f"API returned non-JSON response (HTTP {status}, Content-Type: {content_type}): "
                    f"{_response_preview(body)}",
                    status=status,
                    retryable=status in RETRYABLE_HTTP_STATUS_CODES,
                ) from exc
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = None
        message = ""
        if isinstance(parsed, dict):
            error = parsed.get("error")
            if isinstance(error, dict):
                message = str(error.get("message") or "")
            elif isinstance(error, str):
                message = error
            if not message:
                message = str(parsed.get("message") or parsed.get("detail") or "")
        if not message:
            message = _response_preview(body)
        raise CustomLLMRequestError(
            f"HTTP {exc.code}: {message}",
            status=exc.code,
            retryable=exc.code in RETRYABLE_HTTP_STATUS_CODES,
            retry_after=_retry_after_seconds(getattr(exc, "headers", None)),
        ) from exc
    except (urllib.error.URLError, TimeoutError, socket.timeout, ConnectionError) as exc:
        raise CustomLLMRequestError(
            f"API request failed: {exc}",
            retryable=True,
        ) from exc


def request_json(url, payload=None, api_key="", method="POST", timeout=120, max_attempts=DEFAULT_MAX_ATTEMPTS):
    try:
        attempts = int(max_attempts)
    except (TypeError, ValueError):
        attempts = DEFAULT_MAX_ATTEMPTS
    attempts = max(1, min(attempts, 5))
    for attempt in range(attempts):
        try:
            return _request_json_once(url, payload, api_key=api_key, method=method, timeout=timeout)
        except CustomLLMRequestError as exc:
            if not exc.retryable or attempt >= attempts - 1:
                raise
            delay = exc.retry_after
            if delay is None:
                delay = min(_RETRY_BACKOFF_MAX_SECONDS, _RETRY_BACKOFF_BASE_SECONDS * (2 ** attempt))
            if delay > 0:
                time.sleep(delay)


def _content_text(content):
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return str(content or "")
    parts = []
    for item in content:
        if not isinstance(item, dict):
            continue
        text = item.get("text")
        if isinstance(text, str):
            parts.append(text)
        elif isinstance(item.get("content"), str):
            parts.append(item["content"])
    return "\n".join(part for part in parts if part)


def strip_reasoning_text(text):
    output = str(text or "").strip()
    if not output:
        return ""

    final_channel = re.search(r"(?is)<\|channel\|?>\s*(?:final|answer|response)\b", output)
    message_marker = re.search(r"(?is)<\|message\|>", output)
    if final_channel:
        output = output[final_channel.end():]
    elif message_marker and re.search(r"(?is)<\|channel\|?>\s*(?:thought|analysis|thinking|reasoning)\b", output[:message_marker.start()]):
        output = output[message_marker.end():]
    else:
        output = re.sub(
            r"(?is)<\|channel\|?>\s*(?:thought|analysis|thinking|reasoning)\b.*?(?=<\|channel\|?>\s*(?:final|answer|response)\b|<\|message\|>|$)",
            "",
            output,
        )

    output = re.sub(r"(?is)<think\b[^>]*>.*?</think>", "", output)
    output = re.sub(
        r"(?is)^\s*<think\b[^>]*>.*$",
        "",
        output,
    )
    output = re.sub(
        r"(?is)<\|channel\|?>\s*(?:final|answer|response|thought|analysis|thinking|reasoning)\b",
        "",
        output,
    )
    output = re.sub(
        r"(?is)<(?:/)?(?:think|thinking|analysis|reasoning)\b[^>]*>",
        "",
        output,
    )
    output = re.sub(
        r"(?is)<(?:\|)?(?:channel|message|turn)(?:\|)?>|<(?:channel|turn)\|>",
        "",
        output,
    )
    return output.strip()


def _responses_content(content):
    if not isinstance(content, list):
        return content
    converted = []
    for item in content:
        if not isinstance(item, dict):
            continue
        item_type = str(item.get("type") or "")
        if item_type in ("text", "input_text", "output_text"):
            converted.append({"type": "input_text", "text": str(item.get("text") or "")})
            continue
        if item_type in ("image_url", "input_image"):
            image_value = item.get("image_url")
            if isinstance(image_value, dict):
                image_value = image_value.get("url")
            if image_value:
                converted.append({"type": "input_image", "image_url": str(image_value)})
    return converted


def chat_payload_to_responses(payload):
    payload = payload if isinstance(payload, dict) else {}
    instructions = []
    input_items = []
    for message in payload.get("messages") or []:
        if not isinstance(message, dict):
            continue
        role = str(message.get("role") or "user").strip() or "user"
        content = message.get("content", "")
        if role in ("system", "developer"):
            text = _content_text(content).strip()
            if text:
                instructions.append(text)
            continue
        item = {"role": role, "content": _responses_content(content)}
        if item["content"] not in ("", [], None):
            input_items.append(item)

    result = {
        "model": payload.get("model"),
        "input": input_items,
        "stream": bool(payload.get("stream", False)),
    }
    if instructions:
        result["instructions"] = "\n\n".join(instructions)
    max_tokens = payload.get("max_output_tokens", payload.get("max_tokens"))
    if max_tokens is not None:
        result["max_output_tokens"] = int(max_tokens)
    for key in ("temperature", "top_p"):
        if payload.get(key) is not None:
            result[key] = payload[key]
    return result


def prepare_completion_request(base_url, api_format, chat_payload):
    api_format = normalize_api_format(api_format)
    if api_format == OPENAI_RESPONSES:
        return responses_url(base_url), chat_payload_to_responses(chat_payload)
    if api_format == OPENAI_CHAT_COMPLETIONS:
        return custom_llm_url(base_url, "/chat/completions"), chat_payload
    raise RuntimeError(f"Unsupported Custom API format: {api_format}")


def extract_response_text(response):
    if not isinstance(response, dict):
        return ""

    output_text = response.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return strip_reasoning_text(output_text)

    parts = []
    for output in response.get("output") or []:
        if not isinstance(output, dict):
            continue
        if str(output.get("type") or "").lower() == "reasoning":
            continue
        content = output.get("content")
        if isinstance(content, str):
            parts.append(content)
            continue
        for item in content or []:
            if not isinstance(item, dict):
                continue
            item_type = str(item.get("type") or "")
            if item_type.lower() == "reasoning":
                continue
            if item_type in ("output_text", "text") and isinstance(item.get("text"), str):
                parts.append(item["text"])
            elif isinstance(item.get("content"), str):
                parts.append(item["content"])
    if any(part.strip() for part in parts):
        return strip_reasoning_text("\n".join(part for part in parts if part))

    choices = response.get("choices")
    if not choices:
        return ""
    message = choices[0].get("message") if isinstance(choices[0], dict) else {}
    content = message.get("content") if isinstance(message, dict) else ""
    text = _content_text(content)
    if text.strip():
        return strip_reasoning_text(text)
    choice_text = choices[0].get("text") if isinstance(choices[0], dict) else ""
    if isinstance(choice_text, str) and choice_text.strip():
        return strip_reasoning_text(choice_text)
    return str(content or choice_text or "")


def extract_response_metadata(response):
    if not isinstance(response, dict):
        return {"output_limited": False}

    choices = response.get("choices")
    choice = choices[0] if isinstance(choices, list) and choices and isinstance(choices[0], dict) else {}
    status = str(response.get("status") or choice.get("status") or "").strip()
    finish_reason = str(choice.get("finish_reason") or response.get("finish_reason") or "").strip()
    stop_reason = str(choice.get("stop_reason") or response.get("stop_reason") or "").strip()
    incomplete_details = response.get("incomplete_details")
    incomplete_reason = ""
    if isinstance(incomplete_details, dict):
        incomplete_reason = str(incomplete_details.get("reason") or "").strip()
    elif incomplete_details not in (None, ""):
        incomplete_reason = str(incomplete_details).strip()

    reason = incomplete_reason or finish_reason or stop_reason
    normalized_reason = reason.lower().replace("-", "_").replace(" ", "_")
    output_limited = normalized_reason in {
        "length",
        "max_tokens",
        "max_output_tokens",
        "max_completion_tokens",
        "token_limit",
    }

    metadata = {
        "output_limited": output_limited,
    }
    if status:
        metadata["status"] = status
    if finish_reason:
        metadata["finish_reason"] = finish_reason
    if stop_reason:
        metadata["stop_reason"] = stop_reason
    if reason:
        metadata["reason"] = reason
    if incomplete_details not in (None, ""):
        metadata["incomplete_details"] = incomplete_details
    if isinstance(response.get("usage"), dict):
        metadata["usage"] = response["usage"]
    return metadata
