import hashlib
import json
import logging
import math
import re
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request


OPENAI_CHAT_COMPLETIONS = "openai_compatible"
OPENAI_RESPONSES = "openai_responses"
SUPPORTED_API_FORMATS = (OPENAI_CHAT_COMPLETIONS, OPENAI_RESPONSES)
RETRYABLE_HTTP_STATUS_CODES = frozenset({408, 425, 429, 500, 502, 503, 504})
DEFAULT_MAX_ATTEMPTS = 3
_RETRY_BACKOFF_BASE_SECONDS = 0.35
_RETRY_BACKOFF_MAX_SECONDS = 8.0
_NATIVE_SAMPLING_CACHE = {}
_NATIVE_SAMPLING_LOCK = threading.Lock()
_DEFAULT_REPEAT_WINDOW = 1024
_EXTENDED_SAMPLING_KEYS = (
    "top_k", "repetition_penalty", "penalty_last_n", "presence_penalty", "frequency_penalty",
)
_SAMPLING_WIRE_KEYS = (*_EXTENDED_SAMPLING_KEYS, "repeat_penalty", "repeat_last_n")
_STANDARD_PENALTIES = ("presence_penalty", "frequency_penalty")
_NATIVE_PROVIDER_ALIASES = {
    "llama_cpp": "llamacpp", "llama.cpp": "llamacpp",
    "lm_studio": "lmstudio", "lmstudio_local": "lmstudio",
}
_SAMPLING_HOST_PROVIDERS = {
    "api.openai.com": "openai", "generativelanguage.googleapis.com": "google",
    "api.deepseek.com": "deepseek", "api.x.ai": "xai",
    "api.z.ai": "zai", "open.bigmodel.cn": "zai",
    "api.minimax.io": "minimax_global", "api.moonshot.ai": "kimi_global",
    "ark.ap-southeast.bytepluses.com": "byteplus",
    "openrouter.ai": "openrouter", "api.openrouter.ai": "openrouter",
    "api.novita.ai": "novita", "api.siliconflow.cn": "siliconflow",
    "api.siliconflow.com": "siliconflow", "api.hunyuan.cloud.tencent.com": "tencent",
    "api.ppinfra.com": "ppio", "ollama.com": "ollama_cloud", "api.ollama.com": "ollama_cloud",
}


class CustomLLMRequestError(RuntimeError):
    """A request failure with enough metadata to decide whether it is transient."""

    def __init__(self, message, *, status=None, retryable=False, retry_after=None):
        super().__init__(message)
        self.status = status
        self.retryable = bool(retryable)
        self.retry_after = retry_after


class CustomLLMRequestCancelled(RuntimeError):
    code = "cancelled"


def request_json_cancelable(url, payload=None, api_key="", method="POST", timeout=120, cancel_check=None):
    """Close this request's connection when its caller cancels."""
    import asyncio
    import httpx

    async def request():
        if callable(cancel_check) and cancel_check():
            raise CustomLLMRequestCancelled("API request stopped by user.")
        headers = {"Accept": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            task = asyncio.create_task(client.request(method, url, json=payload, headers=headers))
            try:
                while not task.done():
                    if callable(cancel_check) and cancel_check():
                        task.cancel()
                        try:
                            await task
                        except asyncio.CancelledError:
                            pass
                        raise CustomLLMRequestCancelled("API request stopped by user.")
                    await asyncio.wait([task], timeout=0.1)
                response = await task
                if response.is_error:
                    raise CustomLLMRequestError(
                        f"HTTP {response.status_code}: {_response_preview(response.text)}",
                        status=response.status_code,
                    )
                if not response.content:
                    return {}
                try:
                    return response.json()
                except ValueError as error:
                    raise CustomLLMRequestError(
                        f"API returned non-JSON response: {_response_preview(response.text)}",
                        status=response.status_code,
                    ) from error
            except httpx.RequestError as error:
                raise CustomLLMRequestError(f"API request failed: {error}") from error
            finally:
                if not task.done():
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

    return asyncio.run(request())


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


def _native_sampling_defaults(base_url, *, api_key="", provider="", model=""):
    provider = str(provider or "custom").strip().lower()
    provider = _NATIVE_PROVIDER_ALIASES.get(provider, provider)
    if provider in {"strata", "llamacpp", "llama_cpp", "llama.cpp", "lmstudio", "lm_studio", "vllm", "sglang"}:
        return {"_backend": {
            "llama_cpp": "llamacpp", "llama.cpp": "llamacpp", "lm_studio": "lmstudio",
        }.get(provider, provider)}
    parsed = urllib.parse.urlsplit(str(base_url or "").strip())
    if (
        provider not in {"", "custom", "openai", "llamacpp", "llama_cpp", "lmstudio", "lm_studio"}
        or parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.hostname.lower() in {
            "api.openai.com", "api.deepseek.com", "api.z.ai", "open.bigmodel.cn",
            "openrouter.ai", "ollama.com", "api.ollama.com",
        }
        or parsed.hostname.lower().endswith(".aliyuncs.com")
    ):
        return None
    path = re.sub(r"/(?:responses|chat/completions)/?$", "", parsed.path.rstrip("/"))
    path = re.sub(r"/v\d+(?:beta)?$", "", path, flags=re.IGNORECASE)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    if model:
        query = [(key, value) for key, value in query if key != "model"] + [("model", str(model))]
    props_url = urllib.parse.urlunsplit((
        parsed.scheme, parsed.netloc, path + "/props", urllib.parse.urlencode(query), "",
    ))
    credential_digest = hashlib.sha256(str(api_key or "").encode("utf-8")).digest()
    cache_key = (props_url, credential_digest)
    now = time.monotonic()
    with _NATIVE_SAMPLING_LOCK:
        cached = _NATIVE_SAMPLING_CACHE.get(cache_key)
        if cached is not None and cached[0] > now:
            return None if cached[1] is None else dict(cached[1])
    defaults = None
    try:
        props = request_json(
            props_url, api_key=api_key, method="GET", timeout=2, max_attempts=1,
        )
        if isinstance(props, dict):
            generation = props.get("default_generation_settings")
            params = generation.get("params") if isinstance(generation, dict) else None
            build = str(props.get("build_info") or "")
            backend = (
                "strata" if re.match(r"^Strata\s+\S+", build) else
                "llamacpp" if "llama.cpp" in build.lower() or
                isinstance(params, dict) and "repeat_penalty" in params and "top_k" in params else None
            )
            if backend:
                # Do not cache templates, model paths, or credentials.
                defaults = {
                    "_backend": backend,
                    **{key: params[key] for key in ("repeat_last_n", "penalty_last_n")
                       if isinstance(params, dict) and key in params},
                }
    except Exception as exc:
        logging.getLogger(__name__).info(
            "Custom API sampling discovery unavailable: status=%s error=%s; using provider sampling policy",
            getattr(exc, "status", None), type(exc).__name__,
        )
    with _NATIVE_SAMPLING_LOCK:
        if len(_NATIVE_SAMPLING_CACHE) >= 64:
            _NATIVE_SAMPLING_CACHE.pop(next(iter(_NATIVE_SAMPLING_CACHE)))
        _NATIVE_SAMPLING_CACHE[cache_key] = (
            time.monotonic() + (120 if defaults is not None else 15), defaults,
        )
    return None if defaults is None else dict(defaults)


def _sampling_policy(base_url, api_format, provider, api_key, model):
    provider = str(provider or "custom").strip().lower()
    provider = _NATIVE_PROVIDER_ALIASES.get(provider, provider)
    host = (urllib.parse.urlsplit(str(base_url or "")).hostname or "").lower()
    if provider in {"", "custom", "openai"}:
        provider = _SAMPLING_HOST_PROVIDERS.get(host, provider)
        if host.startswith("dashscope") and host.endswith(".aliyuncs.com"):
            provider = "alibaba"
    defaults = None
    if provider in {"", "custom", "openai", "strata", "llamacpp", "llama_cpp", "llama.cpp",
                    "lmstudio", "lm_studio", "vllm", "sglang"}:
        defaults = _native_sampling_defaults(
            base_url, api_key=api_key, provider=provider, model=model,
        )
    if defaults is not None:
        provider = defaults.get("_backend", "strata")
    provider = _NATIVE_PROVIDER_ALIASES.get(provider, provider)
    responses = normalize_api_format(api_format) == OPENAI_RESPONSES
    aliases = {}
    window = False
    reason = "not supported by the selected provider/API format"
    if provider in {"", "custom", "strata", "llamacpp"}:
        # Generic Custom is an explicit extension-capable endpoint. Discovery is
        # useful for aliases/defaults, but its failure must not discard settings.
        allowed = _EXTENDED_SAMPLING_KEYS
        window = True
        if provider == "llamacpp":
            aliases = {"repetition_penalty": "repeat_penalty", "penalty_last_n": "repeat_last_n"}
    elif provider == "lmstudio":
        allowed = ("top_k", "repetition_penalty", *_STANDARD_PENALTIES)
        aliases = {"repetition_penalty": "repeat_penalty"}
    elif provider in {"vllm", "sglang", "novita"}:
        allowed = ("top_k", "repetition_penalty", *_STANDARD_PENALTIES)
    elif provider == "openrouter":
        allowed = ("top_k", *_STANDARD_PENALTIES) if responses else (
            "top_k", "repetition_penalty", *_STANDARD_PENALTIES,
        )
    elif provider == "alibaba":
        allowed = () if responses else ("top_k", "repetition_penalty", "presence_penalty")
    elif provider == "siliconflow":
        allowed = () if responses else ("top_k", "frequency_penalty")
        reason = "SiliconFlow's documented Chat API exposes frequency_penalty instead of this native field"
    elif provider == "deepseek":
        allowed = () if responses else _STANDARD_PENALTIES
        reason = "DeepSeek does not expose this native sampling field"
    elif provider in {"ollama", "ollama_local", "ollama_cloud"}:
        allowed = _STANDARD_PENALTIES
        reason = "Ollama's OpenAI adapter exposes presence/frequency penalties, not native repeat/top_k options"
    else:
        allowed = () if responses else _STANDARD_PENALTIES
    return provider or "custom", allowed, aliases, window, defaults or {}, reason


def apply_sampling_settings(payload, params, *, base_url="", api_format=None, provider="", api_key=""):
    prepared = dict(payload or {})
    source = dict(params or {})
    incoming = dict(prepared)
    for container in (source, incoming):
        for alias, canonical in (("repeat_penalty", "repetition_penalty"), ("repeat_last_n", "penalty_last_n")):
            if container.get(canonical) is None and container.get(alias) is not None:
                container[canonical] = container[alias]
    requested = {key: source[key] for key in _EXTENDED_SAMPLING_KEYS if source.get(key) is not None}
    requested.update({key: incoming[key] for key in _EXTENDED_SAMPLING_KEYS if incoming.get(key) is not None})
    if not requested:
        return prepared
    for key in _SAMPLING_WIRE_KEYS:
        prepared.pop(key, None)
    backend, allowed, aliases, default_window, defaults, reason = _sampling_policy(
        base_url, api_format, provider, api_key, prepared.get("model") or "",
    )
    for key in allowed:
        if key not in requested:
            continue
        value = requested[key]
        try:
            number = float(value)
            if isinstance(value, bool) or not math.isfinite(number):
                raise ValueError
            if key == "repetition_penalty" and number <= 0:
                raise ValueError
            if key in {"top_k", "penalty_last_n"}:
                if not number.is_integer() or number < 0:
                    raise ValueError
                value = int(number)
            else:
                value = number
        except (TypeError, ValueError, OverflowError) as exc:
            raise ValueError(f"Invalid sampling parameter: {key}") from exc
        prepared[aliases.get(key, key)] = value
    penalties_active = (
        prepared.get(aliases.get("repetition_penalty", "repetition_penalty"), 1.0) != 1.0
        or bool(prepared.get("presence_penalty"))
        or bool(prepared.get("frequency_penalty"))
    )
    window_key = aliases.get("penalty_last_n", "penalty_last_n")
    if default_window and penalties_active and window_key not in prepared:
        window = defaults.get("penalty_last_n", defaults.get("repeat_last_n"))
        prepared[window_key] = (
            window if isinstance(window, int) and not isinstance(window, bool) and window > 0
            else _DEFAULT_REPEAT_WINDOW
        )
    unsupported = {key: reason for key in requested if key not in allowed}
    logging.getLogger(__name__).info(
        "Custom API sampling policy: backend=%s requested=%s sent=%s unsupported=%s",
        backend, sorted(requested),
        {key: prepared[key] for key in _SAMPLING_WIRE_KEYS if key in prepared}, unsupported,
    )
    return prepared


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
    response_started = False
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            response_started = True
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
        reason = exc.reason if isinstance(exc, urllib.error.URLError) else exc
        raise CustomLLMRequestError(
            f"API request failed: {exc}",
            retryable=(
                request.get_method().upper() in {"GET", "HEAD"}
                or not response_started and isinstance(reason, (ConnectionRefusedError, socket.gaierror))
            ),
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


def _iter_stream_events(response):
    """Yield JSON events from SSE, JSONL, or a provider's one-line stream."""
    data_lines = []

    def flush_data():
        if not data_lines:
            return None
        raw = "\n".join(data_lines).strip()
        data_lines.clear()
        if not raw or raw == "[DONE]":
            return {"_done": True} if raw == "[DONE]" else None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None

    for raw_line in response:
        line = raw_line.decode("utf-8", errors="replace") if isinstance(raw_line, bytes) else str(raw_line)
        line = line.rstrip("\r\n")
        if not line.strip():
            event = flush_data()
            if event is not None:
                yield event
            continue
        if line.startswith(":"):
            continue
        if line.startswith("data:"):
            data_lines.append(line[5:].lstrip())
            continue
        if data_lines:
            data_lines.append(line)
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(event, dict):
            yield event

    event = flush_data()
    if event is not None:
        yield event


def _request_stream_cancelable(url, payload, api_key, timeout, cancel_check):
    import asyncio
    import httpx

    async def lines():
        headers = {"Accept": "text/event-stream, application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {str(api_key).strip()}"
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            async with client.stream("POST", url, json=payload or {}, headers=headers) as response:
                if response.is_error:
                    await response.aread()
                    raise CustomLLMRequestError(
                        f"HTTP {response.status_code}: {_response_preview(response.text)}",
                        status=response.status_code,
                        retryable=response.status_code in RETRYABLE_HTTP_STATUS_CODES,
                        retry_after=_retry_after_seconds(response.headers),
                    )
                async for line in response.aiter_lines():
                    yield line

    iterator = lines()

    async def next_line():
        if cancel_check():
            raise CustomLLMRequestCancelled("API request stopped by user.")
        task = asyncio.create_task(iterator.__anext__())
        try:
            while not task.done():
                if cancel_check():
                    raise CustomLLMRequestCancelled("API request stopped by user.")
                await asyncio.wait([task], timeout=0.1)
            return await task
        finally:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    loop = asyncio.new_event_loop()

    def read_lines():
        while True:
            try:
                yield loop.run_until_complete(next_line())
            except StopAsyncIteration:
                return

    try:
        yield from _iter_stream_events(read_lines())
    except httpx.RequestError as error:
        raise CustomLLMRequestError(f"API stream request failed: {error}") from error
    finally:
        try:
            loop.run_until_complete(iterator.aclose())
            loop.run_until_complete(loop.shutdown_asyncgens())
        finally:
            loop.close()


def request_stream(url, payload=None, api_key="", timeout=180, cancel_check=None):
    """Open one streaming completion request and yield decoded provider events.

    A stream is not retried after it starts because replaying a partially visible
    assistant reply would duplicate text in the chat window.
    """
    if callable(cancel_check):
        yield from _request_stream_cancelable(url, payload, api_key, timeout, cancel_check)
        return
    data = json.dumps(payload or {}).encode("utf-8")
    headers = {
        "Accept": "text/event-stream, application/json",
        "Content-Type": "application/json",
    }
    api_key = str(api_key or "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            yield from _iter_stream_events(response)
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
            f"API stream request failed: {exc}",
            retryable=True,
        ) from exc


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


def extract_stream_text_delta(event):
    """Extract visible assistant text from common OpenAI-compatible stream events."""
    if not isinstance(event, dict):
        return ""
    event_type = str(event.get("type") or "").strip().lower()
    if event_type in {
        "response.output_text.delta",
        "response.text.delta",
        "output_text.delta",
    }:
        value = event.get("delta")
        return str(value or "") if isinstance(value, (str, int, float)) else ""
    choices = event.get("choices")
    choice = choices[0] if isinstance(choices, list) and choices and isinstance(choices[0], dict) else {}
    delta = choice.get("delta") if isinstance(choice.get("delta"), dict) else {}
    value = delta.get("content")
    if isinstance(value, list):
        value = _content_text(value)
    if isinstance(value, str) and value:
        return value
    value = delta.get("text")
    if isinstance(value, str) and value:
        return value
    value = choice.get("text")
    return value if isinstance(value, str) else ""


def strip_reasoning_text(text):
    output = str(text or "").strip()
    if not output:
        return ""

    orphan_think_end = re.search(r"(?is)</think\s*>", output)
    if orphan_think_end and not re.search(r"(?is)<think\b[^>]*>", output[:orphan_think_end.start()]):
        output = output[orphan_think_end.end():]

    thought_channel = re.search(
        r"(?is)<\|channel\|?>\s*(?:thought|analysis|thinking|reasoning)\b",
        output,
    )
    final_channel = re.search(r"(?is)<\|channel\|?>\s*(?:final|answer|response)\b", output)
    message_marker = re.search(r"(?is)<\|message\|>", output)
    channel_end = None
    if thought_channel:
        channel_end_match = re.search(r"(?is)<(?:\|)?channel\|>", output[thought_channel.end():])
        if channel_end_match:
            channel_end = thought_channel.end() + channel_end_match.end()
    if final_channel:
        output = output[final_channel.end():]
    elif message_marker and thought_channel and thought_channel.start() < message_marker.start():
        output = output[message_marker.end():]
    elif channel_end is not None:
        output = output[channel_end:]
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


class PEOutputFormatError(ValueError):
    """The response cannot reliably be used as an expanded prompt."""


_PE_PROMPT_KEYS = ("rewritten_prompt", "final_prompt", "positive_prompt", "prompt")
_PE_FUNCTION_WORDS = frozenset(
    "a an the and or of to in on by with for at from as is it".split()
)


def _pe_output_surface(text, *, preserve_content=False):
    output = str(text or "")
    if not preserve_content:
        output = output.strip()
    assistant_prefix = (
        r"^\s*<\|im_start\|>assistant(?:\r?\n)?"
        if preserve_content else r"^\s*<\|im_start\|>assistant\s*"
    )
    output = re.sub(assistant_prefix, "", output)
    for _ in range(2):
        if preserve_content and output.lstrip().startswith(("{", "```")):
            break
        if not preserve_content and output.startswith("```"):
            output = re.sub(r"^```(?:json|text|prompt)?\s*", "", output, flags=re.I)
            output = re.sub(r"\s*```$", "", output).strip()
        if not output.startswith("{"):
            boundary = None
            if re.match(r"(?is)^\s*<think\b[^>]*>", output):
                boundary = re.search(r"(?is)</think\s*>", output)
                if boundary is None:
                    return ""
            elif re.match(r"(?is)^\s*<\|(?:channel|message)\|?>", output):
                boundary = re.search(
                    r"(?is)<\|channel\|?>\s*(?:final|answer|response)\b|<\|message\|>",
                    output,
                )
                if boundary is None:
                    return ""
            else:
                boundary = re.search(r"(?im)^\s*</think\s*>", output)
            if boundary is not None:
                # Strip the protocol prefix without interpreting markers inside the answer.
                end = boundary.end()
                output = (
                    output[end:] if preserve_content else
                    (strip_reasoning_text(output[:end]) + output[end:]).strip()
                )
    if preserve_content:
        return re.sub(r"(?:<\|im_end\|>|<\|endoftext\|>)\s*$", "", output)
    output = re.sub(r"\s*(?:<\|im_end\|>|<\|endoftext\|>)\s*$", "", output)
    return output.strip()


def strip_pe_reasoning(text):
    """Keep the PE answer verbatim after removing reasoning/protocol wrappers."""
    return _pe_output_surface(text, preserve_content=True)


def _unwrap_pe_output(text, *, strict_json):
    output = _pe_output_surface(text)
    if not output.startswith("{"):
        return output
    try:
        value = json.loads(output)
    except json.JSONDecodeError as error:
        if error.msg == "Extra data":
            raise PEOutputFormatError("PE returned extra content outside the prompt wrapper.") from error
        keys = "|".join(_PE_PROMPT_KEYS)
        wrapper = re.fullmatch(
            rf'\{{\s*"(?P<key>{keys})"\s*:\s*"(?P<text>.*)"\s*,?\s*\}}',
            output, flags=re.S,
        )
        if wrapper is None:
            if re.search(rf'"(?:{keys})"\s*:', output):
                raise PEOutputFormatError("PE returned an incomplete or invalid prompt wrapper.") from error
            if re.match(r'^\{\s*"', output):
                raise PEOutputFormatError("PE returned invalid JSON instead of an image prompt.") from error
            return output
        payload = wrapper["text"]
        # Repair only a single string field; never include other JSON fields in the prompt.
        if re.search(r'"\s*,\s*"[^"]+"\s*:', payload):
            raise PEOutputFormatError("PE returned an ambiguous multi-field prompt wrapper.") from error
        escaped = re.sub(
            r'(\\*)"',
            lambda match: match[1] + ("\\" if len(match[1]) % 2 == 0 else "") + '"',
            payload,
        )
        try:
            prompt = json.loads('"' + escaped + '"', strict=False)
        except json.JSONDecodeError as repair_error:
            raise PEOutputFormatError("PE prompt string could not be decoded.") from repair_error
        logging.warning("Recovered PE prompt wrapper quoting: raw_output=%s", json.dumps(str(text), ensure_ascii=False))
        return _pe_output_surface(prompt)
    if isinstance(value, dict):
        for key in _PE_PROMPT_KEYS:
            if key in value:
                if not isinstance(value[key], str):
                    raise PEOutputFormatError(f"PE field {key} must contain text.")
                return _pe_output_surface(value[key])
    if strict_json:
        raise PEOutputFormatError("PE JSON has no usable image prompt field.")
    return output


def clean_pe_output(text, *, strict_json=True):
    output = _unwrap_pe_output(text, strict_json=strict_json)
    if len(output) >= 256:
        words = re.findall(r"[^\W\d_]+", output.casefold())
        if not words and not any(char.isalnum() for char in output):
            raise PEOutputFormatError("PE returned only punctuation instead of an image prompt.")
        # This failure contains no descriptive words. Do not reject normal prose
        # merely because requested lettering or reference labels repeat often.
        if len(words) >= 64 and set(words) <= _PE_FUNCTION_WORDS:
            raise PEOutputFormatError("PE returned repetitive function words instead of an image prompt.")
    return output


def extract_stream_reasoning_delta(event):
    if not isinstance(event, dict):
        return ""
    if event.get("type") in {
        "response.reasoning_summary_text.delta", "response.reasoning_text.delta",
    }:
        value = event.get("delta")
        return value if isinstance(value, str) else ""
    choices = event.get("choices") or []
    choice = choices[0] if choices and isinstance(choices[0], dict) else {}
    delta = choice.get("delta") if isinstance(choice.get("delta"), dict) else {}
    value = delta.get("reasoning_content") or delta.get("reasoning")
    return value if isinstance(value, str) else ""


def extract_response_reasoning_text(response):
    if not isinstance(response, dict):
        return ""
    parts = []
    for item in response.get("output") or []:
        if not isinstance(item, dict) or item.get("type") != "reasoning":
            continue
        content = item.get("summary") or item.get("content") or []
        if isinstance(content, str):
            parts.append(content)
        elif isinstance(content, list):
            parts.extend(
                part["text"] for part in content
                if isinstance(part, dict) and isinstance(part.get("text"), str)
                and part.get("type") in {"summary_text", "reasoning_text", "text"}
            )
    choices = response.get("choices") or []
    choice = choices[0] if choices and isinstance(choices[0], dict) else {}
    message = choice.get("message") if isinstance(choice.get("message"), dict) else {}
    text = message.get("reasoning_content") or message.get("reasoning")
    if isinstance(text, str):
        parts.append(text)
    if not parts and isinstance(message.get("content"), str):
        parts.extend(re.findall(r"(?is)<think\b[^>]*>(.*?)</think>", message["content"]))
    return "\n\n".join(part for part in parts if part.strip()).strip()


def extract_reasoning_display_metadata(response, streamed_reasoning=""):
    text = extract_response_reasoning_text(response) or str(streamed_reasoning or "").strip()
    if text:
        return {"reasoning_text": text, "reasoning_text_status": "available"}
    response = response if isinstance(response, dict) else {}
    encrypted = any(
        isinstance(item, dict) and item.get("type") == "reasoning" and item.get("encrypted_content")
        for item in response.get("output") or []
    )
    return {"reasoning_text_status": "encrypted_only" if encrypted else "not_returned"}


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


def apply_thinking_settings(payload, enabled, *, base_url="", api_format=None, provider=""):
    prepared = dict(payload or {})
    if enabled is None:
        return prepared
    enabled = bool(enabled)
    host = (urllib.parse.urlsplit(base_url).hostname or "").lower()
    provider = str(provider or "").strip().lower()
    is_ollama = provider in {"ollama", "ollama_local", "ollama_cloud"} or (
        provider in {"", "custom"} and (host == "ollama.com" or host.endswith(".ollama.com"))
    )
    model = str(prepared.get("model") or "").lower()
    is_responses = normalize_api_format(api_format) == OPENAI_RESPONSES
    if is_ollama:
        # Ollama's OpenAI adapter maps "none" to think=false, including model aliases.
        prepared["reasoning_effort"] = "medium" if enabled else "none"
    elif host == "openrouter.ai" or host.endswith(".openrouter.ai"):
        prepared["reasoning"] = {"enabled": enabled}
    elif (
        host == "dashscope.aliyuncs.com"
        or host.startswith("dashscope-") and host.endswith(".aliyuncs.com")
        or host.endswith(".maas.aliyuncs.com")
    ):
        prepared["enable_thinking"] = enabled
    elif host in {"api.deepseek.com", "api.z.ai", "open.bigmodel.cn"}:
        prepared["thinking"] = {"type": "enabled" if enabled else "disabled"}
    elif is_responses or host == "api.openai.com":
        # Older reasoning models cannot turn reasoning off; use their lowest effort.
        reasoning_model = re.match(r"^(?:o[134](?:-|$)|gpt-[5-9](?:[.-]|$))", model)
        if host != "api.openai.com" or reasoning_model:
            legacy = re.match(r"^(?:o[134](?:-|$)|gpt-5(?:-|$))", model)
            effort = "medium" if enabled else ("low" if legacy else "none")
            prepared["reasoning_effort"] = effort
    else:
        prepared["chat_template_kwargs"] = {
            **(prepared.get("chat_template_kwargs") or {}),
            "enable_thinking": enabled,
        }
    if is_responses and enabled and not is_ollama and ("reasoning_effort" in prepared or "reasoning" in prepared):
        prepared["reasoning"] = {**(prepared.get("reasoning") or {}), "summary": "auto"}
    return prepared


def empty_output_limit_error(text, completion):
    completion = completion if isinstance(completion, dict) else {}
    if str(text or "").strip() or not completion.get("output_limited"):
        return {}
    has_reasoning = (
        completion.get("reasoning_text_status") in {"available", "encrypted_only"}
        or bool(completion.get("reasoning_text"))
        or isinstance(completion.get("reasoning_tokens"), (int, float))
        and completion["reasoning_tokens"] > 0
    )
    if has_reasoning:
        detail = (
            "The server stopped due to a length limit and returned only reasoning, with no answer. Thinking was requested off; check whether the server supports and applies this setting, as well as its context capacity and output limit."
            if completion.get("thinking_requested") is False else
            "The server stopped due to a length limit and returned only reasoning, with no answer. Check the server's context capacity and output limit."
        )
        return {"error": "reasoning_output_limit", "details": detail}
    return {
        "error": "empty_response_output_limit",
        "details": "The server stopped due to a length limit without a usable answer. Check the server's context capacity and output limit.",
    }


def apply_prompt_cache_settings(payload, params, *, base_url="", provider="", api_key="", cacheable=True):
    """Give identified Strata servers cache hints without changing prompt content."""
    prepared = dict(payload or {})
    source = params if isinstance(params, dict) else {}
    defaults = _native_sampling_defaults(
        base_url, api_key=api_key, provider=provider, model=prepared.get("model") or "",
    )
    if not isinstance(defaults, dict) or defaults.get("_backend") != "strata":
        return prepared
    actor_kinds = {"character", "character_reply", "reply", ""}
    auxiliary = (
        not cacheable or source.get("save_context") is False
        or source.get("describe_roleplay_enabled")
        and str(source.get("roleplay_request_kind") or "").lower() not in actor_kinds
    )
    if auxiliary:
        prepared["strata_checkpoint"] = False
        prepared.pop("strata_prefix", None)
        return prepared
    messages = prepared.get("messages") or []
    if len(messages) < 2 or not isinstance(messages[0], dict):
        return prepared
    first = messages[0]
    content = first.get("content")
    if first.get("role") not in {"system", "developer"} or not isinstance(content, str) or not content:
        return prepared
    prefix = source.get("describe_prompt_cache_prefix")
    chars = prefix.get("chars") if isinstance(prefix, dict) else None
    if (isinstance(chars, int) and not isinstance(chars, bool) and 0 < chars <= len(content)
            and hashlib.sha256(content[:chars].encode("utf-8")).hexdigest() == prefix.get("sha256")):
        prepared["strata_prefix"] = {"message": 0, "chars": chars}
    else:
        prepared["strata_prefix"] = {"messages": 1}
    return prepared


def chat_payload_to_responses(payload):
    payload = payload if isinstance(payload, dict) else {}
    instructions = []
    input_items = []
    for message in payload.get("messages") or []:
        if not isinstance(message, dict):
            continue
        role = str(message.get("role") or "user").strip() or "user"
        content = message.get("content", "")
        if payload.get("_simpai_preserve_message_order") and message.get("name") in {"example_user", "example_assistant"}:
            content = f"[{message['name']}: example dialogue, not story events]\n{_content_text(content)}"
        if role in ("system", "developer") and not payload.get("_simpai_preserve_message_order"):
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
    # apply_sampling_settings filters backend extensions before this conversion.
    for key in ("temperature", "top_p", *_SAMPLING_WIRE_KEYS):
        if payload.get(key) is not None:
            result[key] = payload[key]
    for key in ("reasoning", "enable_thinking", "thinking"):
        if key in payload:
            result[key] = payload[key]
    if payload.get("reasoning_effort") is not None:
        result["reasoning"] = {
            **(result.get("reasoning") or {}),
            "effort": payload["reasoning_effort"],
        }
    for key in ("strata_prefix", "strata_checkpoint"):
        if key in payload:
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


def extract_response_message_texts(response):
    """Preserve Responses assistant message boundaries without reasoning output."""
    response = response if isinstance(response, dict) else {}
    messages = []
    for item in response.get("output") or []:
        if (not isinstance(item, dict) or item.get("type") != "message"
                or item.get("role", "assistant") != "assistant"
                or item.get("channel") in {"analysis", "reasoning", "thought"}):
            continue
        text = extract_response_text({"output": [item]})
        if text:
            messages.append(text)
    return messages


def extract_stream_completion_response(event):
    if not isinstance(event, dict):
        return None
    if event.get("type") not in {
        "response.completed", "response.incomplete", "response.failed",
    }:
        return None
    response = event.get("response")
    return response if isinstance(response, dict) else None


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
        usage = response["usage"]
        for key in ("output_tokens_details", "completion_tokens_details"):
            details = usage.get(key)
            if isinstance(details, dict) and isinstance(details.get("reasoning_tokens"), int):
                metadata["reasoning_tokens"] = details["reasoning_tokens"]
                break
    reasoning = response.get("reasoning")
    if isinstance(reasoning, dict):
        metadata["reasoning"] = {
            key: reasoning[key] for key in ("effort", "summary") if key in reasoning
        }
    return metadata
