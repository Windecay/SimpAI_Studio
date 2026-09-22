"""Small, reusable tool registry for VLM requests.

Tools are explicit Python handlers with a public schema and policy metadata.
Requests cannot import modules or pass a callable. The first built-ins are
read-only skill and image-context helpers.
"""

import re
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as ToolTimeoutError

from modules import vlm_skill_runtime, vlm_skill_authoring


_IMAGE_REF_RE = re.compile(r"^chat-image:[A-Za-z0-9_.:-]+$")


class ToolRegistry:
    def __init__(self):
        self._tools = {}

    def register(self, name, description, input_schema, handler, **policy):
        clean_name = str(name or "").strip()
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,96}", clean_name):
            raise ValueError("Invalid tool name")
        if not callable(handler):
            raise TypeError("Tool handler must be callable")
        if clean_name in self._tools:
            raise ValueError(f"Tool already registered: {clean_name}")
        self._tools[clean_name] = {
            "name": clean_name,
            "description": str(description or "").strip()[:2000],
            "input_schema": input_schema if isinstance(input_schema, dict) else {"type": "object"},
            "handler": handler,
            "read_only": bool(policy.get("read_only", True)),
            "destructive": bool(policy.get("destructive", False)),
            "concurrent_safe": bool(policy.get("concurrent_safe", True)),
            "timeout_ms": max(100, min(30_000, int(policy.get("timeout_ms", 5_000)))),
            "side_effect": str(policy.get("side_effect") or "none")[:80],
        }
        return self

    def get(self, name):
        return self._tools.get(str(name or "").strip())

    def public_tools(self):
        return [
            {key: value for key, value in item.items() if key != "handler"}
            for item in sorted(self._tools.values(), key=lambda value: value["name"])
        ]

    def execute(self, name, arguments=None, context=None, tool_call_id=""):
        started = time.monotonic()
        tool = self.get(name)
        call_id = str(tool_call_id or "").strip()[:160]
        if not tool:
            return _error_result(name, call_id, "tool_not_found", "Tool is not registered.", started)
        args = arguments if isinstance(arguments, dict) else {}
        validation_error = _validate_schema(args, tool["input_schema"])
        if validation_error:
            return _error_result(name, call_id, "invalid_arguments", validation_error, started)
        context = context if isinstance(context, dict) else {}
        cancel_check = context.get("cancel_check")
        if callable(cancel_check) and cancel_check():
            return _error_result(name, call_id, "cancelled", "Tool call was cancelled.", started)
        executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="simpai-vlm-tool")
        future = executor.submit(tool["handler"], args, context)
        try:
            result = future.result(timeout=tool["timeout_ms"] / 1000.0)
            if isinstance(result, dict) and result.get("ok") is False:
                output = result
            else:
                output = {"ok": True, "data": result}
        except ToolTimeoutError:
            future.cancel()
            output = {"ok": False, "error": "Tool call timed out.", "code": "tool_timeout"}
        except Exception as exc:
            output = {"ok": False, "error": str(exc)[:2000], "code": "tool_execution_failed"}
        finally:
            executor.shutdown(wait=False, cancel_futures=True)
        if callable(cancel_check) and cancel_check():
            return _error_result(name, call_id, "cancelled", "Tool call was cancelled.", started)
        return {
            "ok": bool(output.get("ok")),
            "tool_call_id": call_id,
            "name": tool["name"],
            "result": output,
            "meta": {
                "duration_ms": round(max(0.0, (time.monotonic() - started) * 1000), 2),
                "read_only": tool["read_only"],
                "destructive": tool["destructive"],
                "side_effect": tool["side_effect"],
            },
        }


def _error_result(name, call_id, code, message, started):
    return {
        "ok": False,
        "tool_call_id": call_id,
        "name": str(name or "")[:96],
        "result": {"ok": False, "code": code, "error": str(message or "")[:2000]},
        "meta": {"duration_ms": round(max(0.0, (time.monotonic() - started) * 1000), 2)},
    }


def _validate_schema(value, schema, path="arguments"):
    schema = schema if isinstance(schema, dict) else {}
    expected = schema.get("type")
    if expected == "object":
        if not isinstance(value, dict):
            return f"{path} must be an object."
        required = schema.get("required") if isinstance(schema.get("required"), list) else []
        for key in required:
            if key not in value:
                return f"{path}.{key} is required."
        properties = schema.get("properties") if isinstance(schema.get("properties"), dict) else {}
        if schema.get("additionalProperties") is False:
            unknown = [key for key in value if key not in properties]
            if unknown:
                return f"{path}.{unknown[0]} is not accepted."
        for key, child_schema in properties.items():
            if key in value:
                error = _validate_schema(value[key], child_schema, f"{path}.{key}")
                if error:
                    return error
        return ""
    if expected == "array":
        if not isinstance(value, list):
            return f"{path} must be an array."
        if schema.get("maxItems") is not None and len(value) > int(schema["maxItems"]):
            return f"{path} has too many items."
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(value):
                error = _validate_schema(item, item_schema, f"{path}[{index}]")
                if error:
                    return error
        return ""
    if expected == "string" and not isinstance(value, str):
        return f"{path} must be a string."
    if expected == "integer" and (not isinstance(value, int) or isinstance(value, bool)):
        return f"{path} must be an integer."
    if expected == "boolean" and not isinstance(value, bool):
        return f"{path} must be a boolean."
    return ""


def _tool_list_skills(arguments, context):
    skills = vlm_skill_runtime.list_skill_summaries(
        project_root=context.get("project_root") or vlm_skill_runtime.studio_root(),
        include_user=context.get("include_user", True) is not False,
        access=context.get("skill_access"),
    )
    query = str(arguments.get("query") or "").strip().casefold()
    if query:
        skills = [
            item for item in skills
            if query in str(item.get("name") or "").casefold()
            or query in str(item.get("description") or "").casefold()
            or query in str(item.get("when_to_use") or "").casefold()
        ]
    return {"skills": skills[:64], "count": len(skills)}


def _tool_load_skill(arguments, context):
    return vlm_skill_runtime.load_skill(
        arguments.get("name"),
        project_root=context.get("project_root") or vlm_skill_runtime.studio_root(),
        include_user=context.get("include_user", True) is not False,
        access=context.get("skill_access"),
    )


def _tool_select_image_context(arguments, context):
    allowed = [
        ref for ref in arguments.get("allowed_refs", [])
        if isinstance(ref, str) and _IMAGE_REF_RE.fullmatch(ref)
    ]
    allowed_set = set(allowed)
    try:
        maximum = max(0, min(4, int(arguments.get("max_images", 4))))
    except (TypeError, ValueError):
        maximum = 4
    if maximum == 0:
        return {"image_refs": [], "rejected_count": len(arguments.get("selected_refs", []))}
    refs = []
    rejected = 0
    for ref in arguments.get("selected_refs", []):
        if not isinstance(ref, str) or not _IMAGE_REF_RE.fullmatch(ref) or ref not in allowed_set or ref in refs:
            rejected += 1
            continue
        refs.append(ref)
        if len(refs) >= maximum:
            break
    return {"image_refs": refs, "rejected_count": rejected}


def create_default_registry():
    registry = ToolRegistry()
    registry.register(
        vlm_skill_authoring.DRAFT_TOOL_NAME,
        "Validate and prepare an instruction-only SKILL.md draft for user review. Never saves or enables it.",
        vlm_skill_authoring.DRAFT_SCHEMA,
        vlm_skill_authoring.prepare_skill_draft,
        read_only=True,
        side_effect="none",
    )
    registry.register(
        "vlm.list_skills",
        "List available SKILL.md metadata without loading skill bodies.",
        {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "additionalProperties": False,
        },
        _tool_list_skills,
        read_only=True,
        side_effect="none",
    )
    registry.register(
        "vlm.load_skill",
        "Load one selected SKILL.md body from an approved skill root.",
        {
            "type": "object",
            "required": ["name"],
            "properties": {"name": {"type": "string"}},
            "additionalProperties": False,
        },
        _tool_load_skill,
        read_only=True,
        side_effect="read_session",
    )
    registry.register(
        "vlm.select_image_context",
        "Validate image references selected by the historical-image VLM selector.",
        {
            "type": "object",
            "required": ["selected_refs", "allowed_refs"],
            "properties": {
                # The model may return malformed entries. The handler records
                # and rejects them; schema validation must not abort the whole
                # selection before that filtering happens.
                "selected_refs": {"type": "array", "maxItems": 16},
                "allowed_refs": {"type": "array", "maxItems": 64, "items": {"type": "string"}},
                "max_images": {"type": "integer"},
            },
            "additionalProperties": False,
        },
        _tool_select_image_context,
        read_only=True,
        side_effect="none",
    )
    return registry


_DEFAULT_REGISTRY = create_default_registry()


def get_default_registry():
    return _DEFAULT_REGISTRY


def list_tools():
    return _DEFAULT_REGISTRY.public_tools()


def execute_tool_call(name, arguments=None, context=None, tool_call_id=""):
    return _DEFAULT_REGISTRY.execute(name, arguments, context=context, tool_call_id=tool_call_id)


def tools_endpoint_payload(payload=None, access=None):
    payload = payload if isinstance(payload, dict) else {}
    action = str(payload.get("action") or "list").strip().lower()
    if action in {"list", "catalog"}:
        return {"ok": True, "tools": list_tools()}
    name = payload.get("name") or payload.get("tool")
    arguments = payload.get("arguments") if isinstance(payload.get("arguments"), dict) else {}
    context = {
        "project_root": vlm_skill_runtime.studio_root(),
        "include_user": payload.get("include_user", True) is not False,
        "skill_access": vlm_skill_runtime._access(access),
    }
    result = execute_tool_call(name, arguments, context=context, tool_call_id=payload.get("tool_call_id"))
    return result


def build_tool_prompt_contract(lang="cn"):
    if str(lang or "").strip().lower() == "en":
        return (
            "Tool protocol is available for explicit client integrations. A tool request must use the exact JSON shape "
            '{"name":"vlm.load_skill","arguments":{"name":"skill-name"}}. '
            "Only listed read-only tools are valid; never request arbitrary paths or code execution."
        )
    return (
        "工具协议供明确的客户端调用使用。工具请求必须使用固定 JSON 结构 "
        '{"name":"vlm.load_skill","arguments":{"name":"skill-name"}}。'
        "只能调用已列出的只读工具，不要请求任意路径或代码执行。"
    )
