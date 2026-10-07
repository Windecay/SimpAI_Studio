"""Identity-bound local inference shared by Agent tools and the completion API."""

import base64
import copy
import hashlib
import io
import json
import os
import re
import threading
import time
import uuid
from contextlib import contextmanager

from PIL import Image, ImageOps

from modules.agent_service import AgentAPIError, _require_context, identity_binding, require_scope
from modules.agent_vlm_contract import ASSET_PATTERN, ChatCompletion


_CAPACITY = threading.BoundedSemaphore(4)
_DECODE_CAPACITY = threading.BoundedSemaphore(2)
MAX_BODY_BYTES = 16 * 1024 * 1024
MAX_IMAGE_BYTES = 8 * 1024 * 1024
PUBLIC_FIELDS = ("id", "ready", "capabilities", "context_limit", "missing_files")


def fail(context, code, cn, en, status=422):
    raise AgentAPIError(code, cn if context.state.get("__lang") == "cn" else en, status)


def local_models(context):
    from enhanced.vlm import VLM
    from modules.config import paths_LLM
    from modules.model_path_utils import find_model_in_dirs
    from modules.vlm_model_catalog import is_visual_component_filename
    items = []
    for row in VLM.get_model_catalog().get("items", []):
        if row.get("backend") != "llamacpp":
            continue
        config = copy.deepcopy(row.get("runtime_config") or {})
        desired = os.path.basename(str(config.get("gguf_file") or config.get("model_file") or ""))
        expected = row.get("expected_files") or []
        resolved = [(name, find_model_in_dirs(paths_LLM, name)) for name in expected]
        paths = [path for _, path in resolved if path and os.path.isfile(path)]
        missing = [os.path.basename(name) for name, path in resolved if not path or not os.path.isfile(path)]
        weights = [p for p in paths if p.lower().endswith(".gguf") and not is_visual_component_filename(p)]
        selected = next((p for p in weights if os.path.basename(p).lower() == desired.lower()), None)
        if not selected and len(weights) == 1:
            selected = weights[0]
        ready = bool(row.get("installed") and selected and not missing)
        config["_model_path"] = selected or ""
        stats = [(p, os.stat(p).st_size, os.stat(p).st_mtime_ns) for p in paths]
        revision = hashlib.sha256(json.dumps([config, stats], sort_keys=True).encode()).hexdigest()
        capabilities = ["text"]
        if row.get("vision_available"):
            capabilities.append("image")
        items.append({"id": row["id"], "ready": ready, "capabilities": capabilities,
                      "context_limit": min(32768, int(config.get("max_n_ctx") or config.get("context_window")
                                                     or row.get("context_window") or config.get("n_ctx") or 8192)),
                      "missing_files": missing,
                      "_config": config, "_revision": revision})
    return items


def local_context(context):
    from modules.agent_auth import AgentAuthorization, StudioIdentity
    if context.authorization is not None:
        manager = AgentAuthorization(None)
        return manager.chat_credential_context(context.authorization["id"])
    return StudioIdentity().subject(context.user_id)


def native_tool_chunks(chunks, tools):
    names = {tool["function"]["name"] for tool in tools or []}
    metadata = {}
    try:
        for event in chunks:
            if any((choice.get("delta") or {}).get("tool_calls") for choice in event.get("choices", [])):
                event = copy.deepcopy(event)
                for choice in event.get("choices", []):
                    for call in (choice.get("delta") or {}).get("tool_calls") or []:
                        seen = metadata.setdefault((choice.get("index", 0), call.get("index", 0)), {})
                        # Native generic formatters repeat complete metadata with every
                        # arguments token; arguments themselves remain genuine deltas.
                        for key in ("id", "type"):
                            value = call.get(key)
                            if value is not None:
                                if seen.get(key) == value:
                                    call.pop(key)
                                else:
                                    seen[key] = value
                        function = call.get("function") or {}
                        name = function.get("name")
                        if name in names:
                            if seen.get("name") == name:
                                function.pop("name")
                            else:
                                seen["name"] = name
            yield event
    finally:
        if hasattr(chunks, "close"):
            chunks.close()


def native_tool_history(messages, handler_name):
    from modules.llama_cpp_multimodal import is_qwen_hybrid_vision_handler
    if not is_qwen_hybrid_vision_handler(handler_name):
        return messages
    if not any(message.get("tool_calls") for message in messages):
        return messages
    output = copy.deepcopy(messages)
    for message in output:
        for call in message.get("tool_calls") or []:
            function = call["function"]
            if isinstance(function.get("arguments"), str):
                arguments = json.loads(function["arguments"])
                if not isinstance(arguments, dict):
                    raise ValueError("Native Qwen tool history requires JSON object arguments.")
                function["arguments"] = arguments
    return output


def local_events(spec, request, messages, check):
    from enhanced.llamacpp_vlm import llamacpp_vlm
    config = spec["_config"]
    # Do not use VLM.set_version or the UI inference wrapper: they can change
    # another user's settings, select remote providers or unload other models.
    while not llamacpp_vlm.lock.acquire(timeout=0.1):
        check()
    try:
        check()
        llamacpp_vlm.load_model(
            config["_model_path"], str(config.get("chat_handler") or config.get("architecture") or "None"),
            n_ctx=request.n_ctx, mmproj_name=config.get("mmproj_file") or None,
            image_min_tokens=int(config.get("image_min_tokens") or 0),
            image_max_tokens=int(config.get("image_max_tokens") or 0),
            vram_policy=request.vram_policy, load_mtp=False,
        )
        check()
        if (llamacpp_vlm.llm is None or
                os.path.normcase(os.path.realpath(llamacpp_vlm.current_model_path or "")) !=
                os.path.normcase(os.path.realpath(config["_model_path"]))):
            raise AgentAPIError("vlm_model_load_failed", "The selected local model did not load.", 503)
        from modules.llama_cpp_multimodal import messages_have_media
        if messages_have_media(messages) and not llamacpp_vlm._vision_runtime_enabled():
            raise AgentAPIError("vlm_vision_unavailable", "The installed model's vision handler is unavailable.", 409)
        messages = merge_hybrid_images(messages, llamacpp_vlm.current_chat_handler_name)
        messages = native_tool_history(messages, llamacpp_vlm.current_chat_handler_name)
        kwargs = {"max_tokens": request.max_tokens or request.max_completion_tokens or 1024,
                  "temperature": request.temperature, "top_p": request.top_p}
        for key in ("stop", "seed", "tool_choice"):
            value = getattr(request, key)
            if value is not None:
                kwargs[key] = value
        if request.tools:
            kwargs["tools"] = [tool.model_dump() for tool in request.tools]
        if request.response_format:
            kwargs["response_format"] = request.response_format.model_dump()
        yield from native_tool_chunks(
            llamacpp_vlm.completion_messages(messages, cancel_check=check, **kwargs), kwargs.get("tools"))
    finally:
        llamacpp_vlm.lock.release()


def merge_hybrid_images(messages, handler_name):
    from modules.llama_cpp_multimodal import should_merge_qwen_hybrid_images, build_numbered_contact_sheet
    parts = [(i, j, part) for i, message in enumerate(messages)
             for j, part in enumerate(message.get("content") or []) if isinstance(message.get("content"), list)
             and part.get("type") == "image_url"]
    if not should_merge_qwen_hybrid_images(handler_name, len(parts)):
        return messages
    images = []
    for _, _, part in parts:
        data = base64.b64decode(part["image_url"]["url"].split(",", 1)[1])
        with Image.open(io.BytesIO(data)) as image:
            images.append(image.convert("RGB"))
    sheet = build_numbered_contact_sheet(images)
    buffer = io.BytesIO()
    sheet.save(buffer, "JPEG", quality=90)
    url = "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode()
    output = copy.deepcopy(messages)
    for number, (i, j, _) in enumerate(parts, 1):
        output[i]["content"][j] = {"type": "text", "text": f"Image {number} is shown in the numbered reference sheet."}
    output[parts[-1][0]]["content"].append({"type": "image_url", "image_url": {"url": url}})
    return output


class VisibleText:
    """Hold incomplete control tags so hidden reasoning cannot escape as deltas."""
    def __init__(self):
        self.raw = ""
        self.sent = ""

    def push(self, value="", final=False):
        from modules.custom_llm_api import strip_reasoning_text
        self.raw += value
        if len(self.raw) > 131072:
            raise AgentAPIError("vlm_output_limit", "Local model output exceeded its limit.", 502)
        source = self.raw
        thought = re.search(r"(?is)<\|channel\|?>\s*(?:analysis|thought|thinking|reasoning)\b", source)
        if thought:
            final_channel = re.search(r"(?is)<\|channel\|?>\s*(?:final|answer|response)\b", source[thought.end():])
            source = (source[:thought.start()] + source[thought.end() + final_channel.end():]
                      if final_channel else source[:thought.start()])
        for name in ("think", "thinking", "analysis", "reasoning"):
            source = re.sub(rf"(?is)<{name}\b[^>]*>.*?</{name}\s*>", "", source)
            opening = re.search(rf"(?is)<{name}\b[^>]*>.*$", source)
            if opening:
                source = source[:opening.start()]
        clean = strip_reasoning_text(source) if re.search(r"(?i)<(?:\|channel|\|message|think|analysis|reasoning|thinking)", source) else source
        safe = clean if final else clean[:max(0, len(clean) - 64)]
        if not safe.startswith(self.sent):
            raise AgentAPIError("vlm_invalid_output", "Local model changed already delivered output.", 502)
        delta = safe[len(self.sent):]
        self.sent = safe
        return delta


class LocalInference:
    def __init__(self, backend):
        self.backend = backend

    def models(self, request, context):
        rows = self.backend.vlm_models(context)
        rows = [r for r in rows if request.query.lower() in r["id"].lower()
                and (not request.installed_only or r["ready"])]
        return {"items": [{k: r[k] for k in PUBLIC_FIELDS} for r in rows[request.offset:request.offset + request.limit]],
                "total": len(rows), "local_only": True, "automatic_download": False,
                "completion_base": "/api/v1/llm", "inference_scope": "vlm.infer"}

    def _model(self, name, context):
        row = next((r for r in self.backend.vlm_models(context) if r["id"] == name), None)
        if row is None:
            fail(context, "vlm_model_not_found", "没有找到这个本地模型。", "Local model was not found.", 404)
        return row

    def status(self, request, context):
        row = self._model(request.model, context)
        return {**{key: row[key] for key in PUBLIC_FIELDS}, "local_only": True, "automatic_download": False,
                "inference_scope": "vlm.infer", "function_calling": "model_handler_dependent",
                "shared_gpu_slot": True, "conversation_storage": "caller_supplied"}

    def guard(self, context):
        from modules.access_mode import user_can_generate
        _require_context(context)
        require_scope(context, "vlm.infer")
        if not user_can_generate(context.user_id):
            fail(context, "vlm_inference_not_allowed", "此身份没有使用本地推理资源的权限。",
                 "This identity cannot use local inference resources.", 403)

    def _image(self, part, context):
        if part["type"] == "image_asset":
            asset = self.backend.asset(part["asset_id"], context)
            if not str(asset.get("mime") or "").startswith("image/"):
                fail(context, "input_type_mismatch", "VLM 需要图片素材。", "VLM requires image assets.")
            source = asset["path"]
            if int(asset.get("size") or 0) > 80 * 1024 * 1024:
                fail(context, "image_too_large", "图片文件超过限制。", "Image file exceeds its size limit.", 413)
        else:
            url = part["image_url"]["url"]
            if re.fullmatch(ASSET_PATTERN, url):
                return self._image({"type": "image_asset", "asset_id": url}, context)
            match = re.fullmatch(r"data:image/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)", url)
            if not match:
                fail(context, "image_source_not_allowed", "仅接受图片 data URL 或当前身份的素材 ID，不读取外部地址。",
                     "Use an image data URL or owned asset ID; remote URLs and server paths are not allowed.")
            try:
                data = base64.b64decode(match[1].replace("\r", "").replace("\n", ""), validate=True)
            except ValueError:
                fail(context, "invalid_image", "图片编码无效。", "Image encoding is invalid.")
            if len(data) > MAX_IMAGE_BYTES:
                fail(context, "image_too_large", "图片数据超过 8 MiB 限制。", "Image data exceeds 8 MiB.", 413)
            source = io.BytesIO(data)
        if not _DECODE_CAPACITY.acquire(timeout=10):
            fail(context, "vlm_image_busy", "图片解码正在忙，请稍后重试。",
                 "Image decoding is busy; retry later.", 429)
        try:
            with Image.open(source) as image:
                if image.width * image.height > 64000000:
                    fail(context, "image_too_large", "图片超过 64 百万像素。", "Image exceeds 64 megapixels.", 413)
                image = ImageOps.exif_transpose(image)
                image.thumbnail((2048, 2048))
                rgba = image.convert("RGBA")
                rgb = Image.new("RGB", rgba.size, "white")
                rgb.paste(rgba, mask=rgba.getchannel("A"))
                output = io.BytesIO()
                rgb.save(output, "JPEG", quality=90)
                return "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode()
        except AgentAPIError:
            raise
        except Exception:
            fail(context, "invalid_image", "无法读取这张图片。", "This image could not be decoded.")
        finally:
            _DECODE_CAPACITY.release()

    def prepare(self, request, context):
        from modules.agent_prompting import check_encoding
        self.guard(context)
        spec = self._model(request.model, context)
        if not spec["ready"]:
            fail(context, "vlm_model_missing", "本地模型或视觉文件未安装，未开始下载。",
                 "Local model or vision files are missing; no download started.", 409)
        if request.n_ctx > spec["context_limit"]:
            fail(context, "vlm_context_limit", "请求的上下文超过模型公布的限制。",
                 "Requested context exceeds the model's advertised limit.")
        messages, images = [], 0
        for message in request.messages:
            row = message.model_dump(exclude_none=True)
            row.setdefault("content", None)
            if row["role"] == "developer":
                row["role"] = "system"
            content = row.get("content")
            if isinstance(content, str):
                check_encoding(content, "messages.content")
            if isinstance(content, list):
                parts = []
                for part in content:
                    if part["type"] == "text":
                        check_encoding(part["text"], "messages.content.text")
                        parts.append({"type": "text", "text": part["text"]})
                    else:
                        images += 1
                        if images > 4:
                            fail(context, "vlm_input_limit", "一次最多分析 4 张图片。", "At most 4 images per request.")
                        if "image" not in spec["capabilities"]:
                            fail(context, "vlm_text_only", "所选模型没有可用视觉能力。",
                                 "Selected model does not have ready vision support.", 409)
                        parts.append({"type": "image_url", "image_url": {"url": self._image(part, context)}})
                row["content"] = parts
            messages.append(row)
        return spec, messages

    @contextmanager
    def _slot(self, check):
        from modules.gpu_task_lock import exclusive_gpu_task, GpuTaskCancelled
        if not _CAPACITY.acquire(blocking=False):
            raise AgentAPIError("vlm_capacity_busy", "Local inference capacity is busy; retry later.", 429)
        try:
            # Shared model replacement is serialized even in CPU mode; this
            # prevents a CPU request from evicting a GPU model during generation.
            with exclusive_gpu_task(cancel_check=lambda: check() or False):
                yield
        except GpuTaskCancelled:
            raise AgentAPIError("vlm_cancelled", "Local inference was cancelled.", 409)
        finally:
            _CAPACITY.release()

    def events(self, request, context, prepared=None, cancel_check=None, context_resolver=None):
        deadline = time.monotonic() + request.timeout_seconds
        spec, messages = prepared or self.prepare(request, context)
        binding = identity_binding(context)
        last_check = [0.0]
        def check(force=False):
            if cancel_check and cancel_check():
                fail(context, "vlm_cancelled", "本地推理已停止。", "Local inference was cancelled.", 409)
            now = time.monotonic()
            if now >= deadline:
                fail(context, "vlm_timeout", "本地推理等待或执行超时。", "Local inference timed out.", 504)
            if force or now - last_check[0] >= 0.2:
                current = context_resolver() if context_resolver else self.backend.vlm_context(context)
                self.guard(current)
                if identity_binding(current) != binding:
                    fail(context, "identity_context_changed", "身份或存储范围已变化，请重新授权。",
                         "Identity or storage changed; authorize again.", 409)
                last_check[0] = now
        check(True)
        completion_id = "chatcmpl-studio-" + uuid.uuid4().hex
        created = int(time.time())
        def chunk(delta=None, finish=None, usage=None):
            result = {"id": completion_id, "object": "chat.completion.chunk", "created": created,
                      "model": request.model, "choices": [] if usage is not None else
                      [{"index": 0, "delta": delta or {}, "finish_reason": finish}]}
            if usage is not None:
                result["usage"] = usage
            return result
        visible = VisibleText()
        finish_reason, usage, produced, tool_chars = None, None, False, 0
        tool_outputs = {}
        with self._slot(check):
            check(True)
            current_spec = self._model(request.model, context)
            if current_spec.get("_revision") != spec.get("_revision") or not current_spec["ready"]:
                fail(context, "vlm_model_changed", "模型文件或配置已变化，请重新检查。",
                     "Model files or configuration changed; inspect the model again.", 409)
            yield chunk({"role": "assistant", "content": ""})
            stream = self.backend.vlm_events(spec, request, messages, check)
            try:
                for event in stream:
                    check()
                    if not isinstance(event, dict):
                        raise ValueError("Invalid completion event")
                    if isinstance(event.get("usage"), dict):
                        usage = {key: int(event["usage"].get(key) or 0)
                                 for key in ("prompt_tokens", "completion_tokens", "total_tokens")}
                    for choice in event.get("choices", []):
                        if choice.get("index", 0) != 0:
                            raise ValueError("Unexpected choice index")
                        delta = choice.get("delta") or {}
                        clean_delta = {}
                        if isinstance(delta.get("content"), str):
                            text = visible.push(delta["content"])
                            if text:
                                clean_delta["content"] = text
                                produced = True
                        if delta.get("tool_calls"):
                            if not request.tools or request.tool_choice == "none":
                                raise ValueError("Undeclared function calls")
                            calls = copy.deepcopy(delta["tool_calls"])
                            tool_chars += len(json.dumps(calls))
                            if tool_chars > 64000 or any(not isinstance(c.get("index", 0), int)
                                                       or not 0 <= c.get("index", 0) < 32 for c in calls):
                                raise ValueError("Tool call output exceeds limits")
                            clean_delta["tool_calls"] = calls
                            for item in calls:
                                row = tool_outputs.setdefault(item.get("index", 0), {"id": "", "name": "", "arguments": ""})
                                row["id"] += item.get("id") or ""
                                row["name"] += (item.get("function") or {}).get("name") or ""
                                row["arguments"] += (item.get("function") or {}).get("arguments") or ""
                            produced = True
                        if clean_delta:
                            yield chunk(clean_delta)
                        if choice.get("finish_reason") is not None:
                            finish_reason = choice["finish_reason"]
                check(True)
                text = visible.push(final=True)
                if text:
                    produced = True
                    yield chunk({"content": text})
                if finish_reason not in {"stop", "length", "tool_calls", "content_filter"}:
                    fail(context, "vlm_incomplete_output", "本地模型没有返回完成状态。",
                         "Local model did not return a completion status.", 502)
                if not produced and finish_reason != "content_filter":
                    fail(context, "vlm_empty_output", "本地模型没有返回可见结果。",
                         "Local model did not return visible output.", 502)
                declared = {tool.function.name for tool in request.tools or []}
                selected = request.tool_choice.get("function", {}).get("name") if isinstance(request.tool_choice, dict) else None
                if tool_outputs and finish_reason != "tool_calls":
                    raise ValueError("Function calls require a matching finish reason")
                if finish_reason == "tool_calls" and not tool_outputs:
                    raise ValueError("No function call was returned")
                if request.tool_choice == "required" or selected:
                    if not tool_outputs:
                        raise ValueError("The model did not return the required function")
                for row in tool_outputs.values():
                    if (not row["id"] or len(row["id"]) > 96 or row["name"] not in declared
                            or (selected and row["name"] != selected)
                            or len(row["arguments"]) > 16000
                            or not isinstance(json.loads(row["arguments"]), dict)):
                        raise ValueError("Invalid function call output")
                yield chunk(finish=finish_reason)
                if usage is not None and request.stream_options and request.stream_options.include_usage:
                    yield chunk(usage=usage)
            except AgentAPIError:
                raise
            except Exception:
                fail(context, "vlm_inference_failed", "本地模型推理失败，请检查模型与调用格式。",
                     "Local inference failed; check model and request compatibility.", 502)
            finally:
                if hasattr(stream, "close"):
                    stream.close()

    def complete(self, request, context, **controls):
        from modules.agent_vlm_contract import StreamOptions
        options = request.model_copy(update={"stream_options": StreamOptions(include_usage=True)})
        output, text, calls, finish, usage = None, "", {}, None, None
        for event in self.events(options, context, **controls):
            output = event
            if "usage" in event:
                usage = event["usage"]
            for choice in event["choices"]:
                delta = choice["delta"]
                text += delta.get("content") or ""
                for call in delta.get("tool_calls", []):
                    index = call.get("index", 0)
                    row = calls.setdefault(index, {"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
                    row["id"] += call.get("id") or ""
                    row["function"]["name"] += (call.get("function") or {}).get("name") or ""
                    row["function"]["arguments"] += (call.get("function") or {}).get("arguments") or ""
                finish = choice["finish_reason"] or finish
        declared = {t.function.name for t in request.tools or []}
        if any(row["function"]["name"] not in declared or not row["id"] for row in calls.values()):
            fail(context, "vlm_invalid_tool_call", "模型返回的函数调用无效。",
                 "Model returned invalid function calls.", 502)
        message = {"role": "assistant", "content": text or None}
        if calls:
            message["tool_calls"] = [calls[i] for i in sorted(calls)]
        return {"id": output["id"], "object": "chat.completion", "created": output["created"], "model": request.model,
                "choices": [{"index": 0, "message": message, "finish_reason": finish}], "usage": usage}

    def analyze(self, request, context, **controls):
        parameters = request.model_dump(exclude={"asset_ids", "instruction"})
        completion = ChatCompletion(**parameters, messages=[{"role": "user", "content":
            [{"type": "text", "text": request.instruction}] +
            [{"type": "image_asset", "asset_id": asset} for asset in request.asset_ids]}])
        result = self.complete(completion, context, **controls)
        return {"model": request.model, "asset_ids": request.asset_ids, "text": result["choices"][0]["message"]["content"],
                "finish_reason": result["choices"][0]["finish_reason"], "usage": result["usage"],
                "local_only": True, "generation_started": False, "automatic_download": False, "media_modified": False}
