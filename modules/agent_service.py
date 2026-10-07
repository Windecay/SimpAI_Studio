"""Studio operations shared by HTTP clients and internal Agent tools.

Public requests name presets and owned assets. Canvas node structures, filesystem
paths, identities and preset model defaults are constructed on the server.
"""

import base64
import copy
import hashlib
import io
import json
import math
import mimetypes
import ntpath
import re
from dataclasses import dataclass
from functools import cached_property, lru_cache
from pathlib import Path
from urllib.parse import quote, urlencode

from pydantic import ValidationError

from modules.agent_api_contract import API_PREFIX, API_VERSION, MAX_ASSET_BYTES, OPERATIONS


PROJECT_ID = "agent_api"
ASSET_ID_RE = re.compile(r"^(?:asset|file):[0-9a-f]{24,64}$")
MEDIA_MIMES = {
    "image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/tiff",
    "video/mp4", "video/webm", "video/quicktime", "video/x-matroska",
    "audio/wav", "audio/x-wav", "audio/mpeg", "audio/ogg", "audio/flac", "audio/mp4", "audio/webm",
}


class AgentAPIError(Exception):
    def __init__(self, code, message, status=400, details=None):
        super().__init__(message)
        self.code, self.message, self.status, self.details = code, message, status, details

    def payload(self):
        error = {"code": self.code, "message": self.message}
        if self.details is not None:
            error["details"] = self.details
        return {"ok": False, "api_version": API_VERSION, "error": error}


@dataclass(frozen=True)
class AgentContext:
    """Created by the server identity resolver, never from a JSON request."""
    state: dict
    user_context: dict
    authorization: dict | None = None

    @property
    def user_id(self):
        return str(self.user_context.get("user_did") or "")


def _require_context(context):
    if not isinstance(context, AgentContext) or not context.user_id or context.user_context.get("role") == "guest":
        raise AgentAPIError("authentication_required", "A Studio user session or local workspace identity is required.", 401)

def require_scope(context, scope):
    if context.authorization is not None and scope not in context.authorization["scopes"]:
        message = ("此 Agent 未获授权执行该操作。" if context.state.get("__lang") == "cn"
                   else "This operation is outside the Agent's granted permissions.")
        raise AgentAPIError("insufficient_scope", message, 403, {"required_scope": scope})


def _is_operator(context):
    return context.user_context.get("role") in {"local", "admin"}


def identity_binding(context):
    from modules.agent_auth import StudioIdentity
    return StudioIdentity().describe(context)["binding_id"]


def require_identity_binding(context, expected):
    if expected and (not isinstance(expected, str) or expected != identity_binding(context)):
        message = ("身份或存储位置已变化，请重新确认任务。" if context.state.get("__lang") == "cn"
                   else "The identity or storage scope changed. Confirm the task again.")
        raise AgentAPIError("identity_context_changed", message, 409)


def _require_operator(context):
    if not _is_operator(context):
        message = ("节点信息仅向本地工作区身份或管理员开放。" if context.state.get("__lang") == "cn"
                   else "A local workspace or administrator identity is required for node-wide information.")
        raise AgentAPIError("operator_required", message, 403)


def _backend_ok(result, code="backend_error"):
    if not isinstance(result, dict) or not result.get("ok"):
        error = str((result or {}).get("error") or "The Studio operation failed.") if isinstance(result, dict) else "The Studio operation failed."
        code, status = {
            "run not found": ("run_not_found", 404), "run_id_conflict": ("run_id_conflict", 409),
            "request_id_conflict": ("request_id_conflict", 409), "generation_not_allowed": ("generation_not_allowed", 403),
            "asset_storage_limit": ("asset_storage_limit", 409),
            "asset_storage_scan_incomplete": ("asset_storage_scan_incomplete", 503),
            "parameter_profile_changed": ("parameter_profile_changed", 409),
            "parameter_profile_missing": ("parameter_profile_missing", 404),
            "parameter_profile_incompatible": ("parameter_profile_incompatible", 409),
        }.get(error, (code, 400))
        raise AgentAPIError(code, error[:2000], status)
    return result


@lru_cache(maxsize=2)
def _translations(lang):
    if lang != "cn":
        return {}
    try:
        return json.loads((Path(__file__).resolve().parents[1] / "language" / "cn.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


class StudioBackend:
    """Lazy imports keep tool discovery independent of model initialization."""

    def catalog(self, context):
        from enhanced import topbar
        return topbar._build_preset_store_meta(context.state)

    @staticmethod
    def _profile_context(context):
        return {**context.state, "user_did": context.user_id, "__user_did": context.user_id}

    def parameter_profiles(self, preset_names, context):
        from enhanced import parameter_profiles
        return parameter_profiles.list_agent_profiles(self._profile_context(context), preset_names)

    def parameter_profile(self, preset_id, name, context):
        from enhanced import parameter_profiles
        return parameter_profiles.agent_profile_snapshot(name, preset_id, self._profile_context(context))

    def apply_parameter_profile(self, node, context):
        from enhanced import parameter_profiles
        return parameter_profiles.apply_profile_to_canvas_node(node, self._profile_context(context))

    def model_status(self, node, context):
        from modules import canvas_workbench_models
        return canvas_workbench_models.get_preset_model_status({"preset_node": node, "user_context": context.user_context})

    def download_models(self, node, context):
        from modules import canvas_workbench_models
        return canvas_workbench_models.queue_preset_model_downloads({"preset_node": node, "user_context": context.user_context})

    def models(self, request, node, context):
        if node:
            from modules import canvas_workbench_models, model_browser_service
            result = _backend_ok(canvas_workbench_models.get_model_catalog_for_preset({"preset_node": node}))
            catalog = result.get("catalog") or result
            category_keys = {value["catalog_key"]: kind for kind, value in model_browser_service.TYPE_CONFIG.items()}
            kinds = sorted({category_keys.get(key, key.removesuffix("_filenames")) for key in catalog if key.endswith("_filenames")})
            if request.kind and request.kind not in kinds:
                raise AgentAPIError("invalid_model_kind", "Unknown model category for this preset.", 422, {"choices": kinds})
            rows = []
            for key, values in catalog.items():
                if key.endswith("_filenames") and isinstance(values, list):
                    kind = category_keys.get(key, key.removesuffix("_filenames"))
                    if request.kind and kind != request.kind:
                        continue
                    rows.extend({"name": name, "kind": kind} for name in values if name not in {"None", "Default (model)"})
            rows = [row for row in rows if request.query.casefold() in row["name"].casefold()]
            return {"items": rows[request.offset:request.offset + request.limit], "total": len(rows),
                    "kinds": kinds}
        from modules import model_browser_service
        kinds = list(model_browser_service.TYPE_CONFIG)
        if request.kind and request.kind not in kinds:
            raise AgentAPIError("invalid_model_kind", "Unknown model category.", 422, {"choices": kinds})
        # The browser service owns the installed model inventory and its indexing.
        # Fetch at most two pages to support arbitrary offsets without a full scan.
        page = request.offset // request.limit + 1
        result = _backend_ok(model_browser_service.query_models({
            "type": request.kind, "search": request.query, "page": page, "page_size": request.limit,
        }))
        rows = list(result.get("items") or [])
        remainder = request.offset % request.limit
        if remainder and result.get("has_more"):
            following = _backend_ok(model_browser_service.query_models({
                "type": request.kind, "search": request.query, "page": page + 1, "page_size": request.limit,
            }))
            rows.extend(following.get("items") or [])
        fields = {"id", "name", "type", "catalog", "path_exists", "size", "arch_family", "base_model", "trained_words"}
        return {"items": [{key: row[key] for key in fields if key in row} for row in rows[remainder:remainder + request.limit]],
                "total": result.get("total", 0), "kinds": kinds}

    def upload(self, data_url, name, context):
        from modules import canvas_workbench_assets as assets
        return assets.save_data_url_asset(data_url, PROJECT_ID, context.state, node_id="upload", metadata={"name": name})

    def asset(self, asset_id, context):
        from modules import asset_lifecycle
        with asset_lifecycle.guard(context.state, PROJECT_ID):
            return self._resolve_asset(asset_id, context)

    def _resolve_asset(self, asset_id, context):
        from modules import canvas_workbench_assets as assets
        from modules import asset_lifecycle
        if not ASSET_ID_RE.fullmatch(asset_id):
            raise AgentAPIError("asset_not_found", "Asset is unavailable to this user.", 404)
        root, _ = assets._asset_root(PROJECT_ID, context.state)
        path = assets._resolve_asset_id_file_path(asset_id, root)
        if not path:
            raise AgentAPIError("asset_not_found", "Asset is unavailable to this user.", 404)
        mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
        result = {"asset_id": asset_id, "path": path, "mime": mime, "size": Path(path).stat().st_size}
        result.update(assets._probe_media_metadata(path, mime) or {})
        asset_lifecycle.track(PROJECT_ID, context.state, path)
        return result

    def submit(self, payload, context):
        from modules import canvas_workbench_runner
        return canvas_workbench_runner.run_node(payload, context.state)

    def run(self, run_id, context, cancel=False):
        from modules import canvas_workbench_runner
        payload = {"run_id": run_id, "user_context": context.user_context}
        if cancel:
            return canvas_workbench_runner.control_run({**payload, "action": "stop"}, context.state)
        return canvas_workbench_runner.poll_run(payload, context.state)

    def queue(self, context):
        from modules import agent_runtime
        return agent_runtime.queue_snapshot()

    def resources(self, context):
        from modules import agent_runtime
        return agent_runtime.resource_snapshot()

    def wd14_status(self, context):
        from modules.config import paths_clip_vision
        from modules.wd14_models import installed_models
        models = installed_models(paths_clip_vision)
        ready = next((row["model_id"] for row in models if row["ready"]), "")
        return {"ready": bool(ready), "model_id": ready, "models": models}

    def vlm_models(self, context):
        from modules.agent_vlm import local_models
        return local_models(context)

    def vlm_context(self, context):
        from modules.agent_vlm import local_context
        return local_context(context)

    def vlm_events(self, spec, request, messages, check):
        from modules.agent_vlm import local_events
        return local_events(spec, request, messages, check)

    def wd14(self, asset, request, context):
        from PIL import Image, ImageOps
        from extras.wd14tagger import default_interrogator
        with Image.open(asset["path"]) as image:
            if image.width * image.height > 64 * 1024 * 1024:
                message = ("WD14 图片超过 64 百万像素限制。" if context.state.get("__lang") == "cn"
                           else "WD14 input exceeds the 64-megapixel limit.")
                raise AgentAPIError("image_too_large", message, 413)
            return default_interrogator(ImageOps.exif_transpose(image).convert("RGB"),
                                        threshold=request.threshold, character_threshold=request.character_threshold,
                                        exclude_tags=request.exclude_tags, allow_download=False,
                                        cpu_only=True, return_details=True)

    def workflow_node_catalog(self, context):
        import httpx
        from enhanced.simpleai import comfyclient_pipeline
        try:
            with httpx.Client(timeout=httpx.Timeout(15, connect=3)) as client:
                response = client.get(f"http://{comfyclient_pipeline.server_address()}/object_info")
                response.raise_for_status()
                if len(response.content) > 32 * 1024 * 1024:
                    raise ValueError("Node catalog exceeds the limit")
                result = response.json()
                if not isinstance(result, dict):
                    raise ValueError("Node catalog is not an object")
                return result
        except (httpx.HTTPError, ValueError) as exc:
            raise AgentAPIError("workflow_backend_unavailable", "Start the configured Comfy backend before inspecting a workflow.", 503) from exc

    def submit_workflow(self, payload, context):
        from modules.canvas_workbench_runner import run_workflow
        return run_workflow(payload, context.state)

    def replay_workflow(self, run_id, fingerprint, context):
        import sys
        runner = sys.modules.get("modules.canvas_workbench_runner")
        if runner is None:
            return None
        with runner.CANVAS_RUNS_LOCK:
            record = runner.CANVAS_RUNS.get(run_id)
            if not record:
                return None
            if record.get("owner_user_did") != context.user_id:
                raise AgentAPIError("run_id_conflict", "Run ID belongs to another identity.", 409)
            if record.get("request_fingerprint") != fingerprint:
                raise AgentAPIError("request_id_conflict", "This request ID identifies a different submission.", 409)
            return {**runner._public_run_record(record), "idempotent_replay": True}


class AgentService:
    def __init__(self, backend=None):
        self.backend = backend or StudioBackend()
        from modules.agent_workflows import WorkflowStore
        self.workflows = WorkflowStore()

    @cached_property
    def vlm(self):
        from modules.agent_vlm import LocalInference
        return LocalInference(self.backend)

    def execute(self, name, arguments, context):
        _require_context(context)
        operation = OPERATIONS.get(name)
        if not operation:
            raise AgentAPIError("tool_not_found", "Unknown Studio operation.", 404)
        schema, _, _, handler = operation
        try:
            request = schema.model_validate(arguments or {})
        except ValidationError as exc:
            details = [{"field": ".".join(map(str, row["loc"])), "message": row["msg"], "type": row["type"]}
                       for row in exc.errors(include_input=False, include_context=False, include_url=False)]
            raise AgentAPIError("invalid_request", "The request does not match this operation's schema.", 422, details) from exc
        scope = {"submit": "runs.submit", "cancel": "runs.cancel", "upload": "assets.write", "download_models": "models.download",
                 "workflow_import": "assets.write", "workflow_update": "assets.write", "workflow_submit": "runs.submit",
                 "system_status": "node.read", "vlm_analyze": "vlm.infer", "vlm_chat": "vlm.infer"}.get(handler, "read")
        if handler == "queue" and request.scope == "node":
            scope = "node.read"
        require_scope(context, scope)
        data = getattr(self, handler)(request, context)
        return {"ok": True, "api_version": API_VERSION, "data": data}

    def capabilities(self, request, context):
        from modules import describe_vlm_chat as chat
        return {"service": "SimpAI Studio", "api_version": API_VERSION, "api_base": API_PREFIX,
                "openapi_url": f"{API_PREFIX}/openapi.json", "tools_url": f"{API_PREFIX}/tools",
                "tool_index_url": f"{API_PREFIX}/tools/index",
                "tool_discovery": "Start with tool_index_url; search by query or category and read only selected detail_url schemas. "
                                  "Use the returned call_url to invoke a tool. tools_url is the full catalog for MCP/SDK compatibility; "
                                  "do not read it or the whole OpenAPI document before every task.",
                "routing": "deterministic", "model_inference_for_routing": False,
                "authentication": "Studio session; local workspace in local mode",
                "session_url": f"{API_PREFIX}/session", "queue_url": f"{API_PREFIX}/queue",
                "system_status_url": f"{API_PREFIX}/system/status",
                "asset_storage_url": f"{API_PREFIX}/assets/storage",
                "asset_management_url": f"{API_PREFIX}/assets/manage",
                "parameter_profiles_url": f"{API_PREFIX}/parameter-profiles",
                "workflows_url": f"{API_PREFIX}/workflows",
                "workflow_import": {"formats": ["comfy_api", "comfy_ui"], "output_types": ["image", "video"],
                                    "sources": ["json_text", "png_metadata"], "png_metadata_keys": ["prompt", "workflow"],
                                    "execution_policy": "reviewed_nodes_only", "json_bytes": 2 * 1024 * 1024,
                                    "node_limit": 512, "ui_conversion": "standard_widgets_or_api_export",
                                    "automatic_model_download": False},
                "help_url": f"{API_PREFIX}/help",
                "skills_url": f"{API_PREFIX}/skills", "prompt_guidance_url": f"{API_PREFIX}/prompts/guidance",
                "image_tagging_url": f"{API_PREFIX}/prompts/wd14",
                "image_tagging_status_url": f"{API_PREFIX}/prompts/wd14/status",
                "vlm_models_url": f"{API_PREFIX}/vlm/models", "vlm_status_url": f"{API_PREFIX}/vlm/status",
                "vlm_analyze_url": f"{API_PREFIX}/vlm/analyze", "vlm_chat_url": f"{API_PREFIX}/vlm/chat",
                "local_llm": {"api_base": f"{API_PREFIX}/llm", "models_url": f"{API_PREFIX}/llm/models",
                              "completion_url": f"{API_PREFIX}/llm/chat/completions",
                              "format": "chat.completions", "inference_scope": "vlm.infer",
                              "local_only": True, "automatic_download": False},
                "request_encoding": {"charset": "utf-8", "content_type": "application/json; charset=utf-8",
                                     "windows_shell": "Send UTF-8 bytes from a UTF-8 JSON file. Do not pipe Chinese source through the Windows PowerShell default encoding."},
                "connection_guide_url": f"{API_PREFIX}/connect",
                "auth_discovery_url": f"{API_PREFIX}/auth/discovery",
                "limits": {"upload_bytes": MAX_ASSET_BYTES, "inputs": 18, "output_count": 4},
                "supported_tasks": sorted(chat.GENERATION_TASKS),
                "media_types": sorted(MEDIA_MIMES), "operations": list(OPERATIONS)}

    def session(self, request, context):
        from modules.access_mode import user_can_download_models, user_can_generate
        from modules.agent_auth import StudioIdentity
        operator = _is_operator(context)
        scopes = context.authorization["scopes"] if context.authorization is not None else None
        def allowed(scope):
            return scopes is None or scope in scopes
        identity = context.authorization["identity"] if context.authorization is not None else StudioIdentity().describe(context)
        return {
            "user_id": context.user_id, "role": context.user_context.get("role"),
            "access_mode": "local" if context.user_context.get("scope") == "local" else "multi-user",
            "language": context.state.get("__lang") or "en",
            "identity": identity,
            "authorization": ({key: context.authorization[key] for key in ("id", "client_name", "scopes", "expires_at")}
                              if context.authorization is not None else {"method": "studio_session_or_local"}),
            "permissions": {"can_generate": user_can_generate(context.user_id) and allowed("runs.submit"),
                            "can_download_models": user_can_download_models(context.user_id) and allowed("models.download"),
                            "can_infer_local_models": user_can_generate(context.user_id) and allowed("vlm.infer"),
                            "can_read_node_queue": operator and allowed("node.read"),
                            "can_read_system_status": operator and allowed("node.read"),
                            "can_cancel_other_users": False},
            "interaction": {"shared_generation_queue": True, "browser_session_attached": False,
                            "can_read_ui_state": False, "can_modify_ui_state": False,
                            "generation_confirmation": "caller_managed",
                            "model_download_confirmation": "caller_managed", "model_storage_scope": "node_shared",
                            "automatic_generation_preference": None,
                            "task_control": "owned_runs_only"},
        }

    def vlm_models(self, request, context):
        return self.vlm.models(request, context)

    def vlm_status(self, request, context):
        return self.vlm.status(request, context)

    def vlm_chat(self, request, context):
        return self.vlm.complete(request, context)

    def vlm_analyze(self, request, context):
        return self.vlm.analyze(request, context)

    def queue(self, request, context):
        if request.scope == "node":
            _require_operator(context)
        snapshot = self.backend.queue(context)
        rows = []
        for item in snapshot.get("items") or []:
            owner = item.get("owner_user_did")
            if request.scope == "user" and owner != context.user_id:
                continue
            row = {key: item[key] for key in ("task_id", "run_id", "state", "queue_position", "source",
                                             "preset_id", "task_class", "cancel_requested") if key in item}
            if request.scope == "node":
                row["owner_user_id"] = owner
            if row.get("source") == "agent_api" and row.get("run_id"):
                row["status_url"] = f"{API_PREFIX}/runs/{quote(row['run_id'], safe='')}"
            rows.append(row)
        return {**{key: snapshot[key] for key in ("node_id", "instance_id", "sampled_at", "available",
                                                  "reason", "worker", "counts", "gpu_task_busy") if key in snapshot},
                "scope": request.scope, "counts_scope": "node", "items": rows[request.offset:request.offset + request.limit],
                "total": len(rows), "offset": request.offset, "limit": request.limit}

    def system_status(self, request, context):
        _require_operator(context)
        snapshot = self.backend.queue(context)
        resources = self.backend.resources(context)
        return {
            **{key: snapshot[key] for key in ("node_id", "instance_id", "sampled_at", "worker", "gpu_task_busy") if key in snapshot},
            "queue": {key: snapshot[key] for key in ("available", "reason", "counts") if key in snapshot},
            "resources": resources,
            "scheduling": {"execution_capacity": 1, "queue_policy": "fifo",
                           "capacity_scope": "local_generation_worker", "cloud_execution_capacity": 2,
                           "gpu_selection_supported": False, "resource_reservation_supported": False,
                           "cluster_membership_managed": False, "snapshot_is_reservation": False},
        }

    def _catalog(self, context):
        return {name: {**copy.deepcopy(entry), "name": name} for name, entry in self.backend.catalog(context).items() if isinstance(entry, dict)}

    def _entry(self, preset_id, context, catalog=None):
        entries = catalog if catalog is not None else self._catalog(context)
        name = next((key for key in entries if key.casefold() == preset_id.casefold()), None)
        if name is None:
            raise AgentAPIError("preset_not_found", "The preset is not available in this user's catalog.", 404)
        return entries[name]

    @staticmethod
    def _capability(entry):
        schema = entry.get("schema") or {}
        return {**(entry.get("media_capability") or {}), "name": entry["name"],
                "model_status": "missing" if entry.get("missing") else "unknown",
                "task_method": entry.get("task_method") or "", "themes": schema.get("themes") or [],
                "default_theme": schema.get("default_theme") or "", "per_theme": schema.get("per_theme") or {}}

    @staticmethod
    def _summary(entry):
        capability = entry.get("media_capability") or {}
        return {"preset_id": entry["name"], "backend_engine": entry.get("backend_engine"),
                "automatic_routing": entry["name"].casefold() != "onekeykontext",
                "prompt_mode": "preset_fixed" if entry["name"].casefold() == "onekeykontext" else "instruction",
                "category": entry.get("preset_category"), "output_type": capability.get("output_type") or entry.get("engine_type"),
                "tasks": capability.get("supported_tasks") or [], "themes": (entry.get("schema") or {}).get("themes") or [],
                "model_status": "missing" if entry.get("missing") else "unchecked",
                "details_url": f"{API_PREFIX}/presets/{quote(entry['name'], safe='')}"}

    def presets(self, request, context):
        from modules import describe_vlm_chat as chat
        rows = [self._summary(entry) for entry in self._catalog(context).values()]
        query = request.query.casefold()
        inferred_task = chat._infer_specialized_generation_task(query) if query else ""
        rows = [row for row in rows if (not query or query in " ".join([row["preset_id"], str(row["category"] or ""), *row["tasks"]]).casefold() or (inferred_task and inferred_task in row["tasks"]))
                and (not request.task or request.task in row["tasks"])
                and (not request.output_type or request.output_type == row["output_type"])]
        return {"items": rows[request.offset:request.offset + request.limit], "total": len(rows),
                "offset": request.offset, "limit": request.limit}

    def _spec(self, entry, theme, lang, context):
        schema = entry.get("schema") or {}
        themes = schema.get("themes") or []
        theme = theme or schema.get("default_theme") or (themes[0] if themes else "")
        if theme and theme not in themes:
            raise AgentAPIError("invalid_theme", "The requested theme is not available for this preset.", 422, {"choices": themes})
        info = (schema.get("per_theme") or {}).get(theme) or {}
        defaults = info.get("defaults") or {}
        hidden = set(info.get("disvisible", schema.get("disvisible") or []))
        translations = _translations(lang or context.state.get("__lang") or "en")
        parameters = []
        properties = {}
        for raw in info.get("params", schema.get("params") or []):
            key = raw.get("key")
            if not key or key in hidden or raw.get("visible") is False:
                continue
            item = {**copy.deepcopy(raw), "id": key, "default": defaults.get(key, raw.get("default"))}
            if item.get("type") == "number" and isinstance(item["default"], str):
                try:
                    item["default"] = float(item["default"])
                except ValueError:
                    pass
            item["label"] = translations.get(item.get("label"), item.get("label", key))
            field = {"type": {"checkbox": "boolean", "number": "number"}.get(item.get("type"), "string"), "title": item["label"]}
            if item["default"] is not None:
                field["default"] = item["default"]
            if item.get("interactive") is False:
                field["readOnly"] = True
            for source, target in (("min", "minimum"), ("max", "maximum"), ("step", "x-step"), ("choices", "enum")):
                if item.get(source) is not None:
                    field[target] = item[source]
            step = item.get("step")
            if isinstance(step, (int, float)) and step > 0 and float(step).is_integer() and math.isclose((item.get("min") or 0) / step, round((item.get("min") or 0) / step), abs_tol=1e-6):
                field["multipleOf"] = step
            value = item["default"]
            if field["type"] == "number" and type(value) in {int, float} and (
                ("minimum" in field and value < field["minimum"])
                or ("maximum" in field and value > field["maximum"])
                or (isinstance(step, (int, float)) and step > 0 and not math.isclose((value - field.get("minimum", 0)) / step, round((value - field.get("minimum", 0)) / step), abs_tol=1e-6))
            ):
                # Some existing presets declare a working default outside their
                # slider range. Preserve it as an explicit alternative, not a clamp.
                constraints = {key: field.pop(key) for key in ("minimum", "maximum", "multipleOf") if key in field}
                field["anyOf"] = [{"type": "number", **constraints}, {"const": value}]
            parameters.append(item)
            properties[key] = field
        generation_defaults = entry.get("generation_config") or {}
        for key, label, kind in (("overwrite_step", "Steps", "number"), ("guidance_scale", "Guidance Scale", "number"),
                                 ("sharpness", "Sharpness", "number"), ("sampler_name", "Sampler", "string"), ("scheduler_name", "Scheduler", "string")):
            value = defaults.get(key, generation_defaults.get(key))
            if value is None or value == "":
                continue
            props = (info.get("generation_config_props") or {}).get(key) or {}
            field = {"type": kind, "title": translations.get(label, label), "default": value}
            if key == "overwrite_step":
                field["minimum"] = props.get("min", 1)
                if props.get("max") is not None:
                    field["maximum"] = props["max"]
                field["multipleOf"] = props.get("step") or 1
                if props.get("interactive") is False:
                    field["readOnly"] = True
            if key in {"sampler_name", "scheduler_name"}:
                from modules import flags
                engine = flags.get_taskclass_by_fullname(str(entry.get("backend_engine") or "")) or entry.get("backend_engine")
                choices = (flags.default_class_params.get(engine) or {}).get(f"available_{key}") or []
                field["enum"] = list(dict.fromkeys([*choices, value]))
            properties[key] = field
            parameters.append({"id": key, "label": field["title"], "type": kind, "default": value,
                               "group": "generation", "interactive": not field.get("readOnly", False)})
        method = info.get("task_method") or entry.get("task_method") or ""
        capability = entry.get("media_capability") or {}
        from modules import describe_vlm_chat as chat
        qwen21 = chat._task_method_key(method) in chat._QWEN21_EDIT_METHODS
        spec = {**self._summary(entry), "theme": theme, "task_method": method,
                "inputs": {key: copy.deepcopy(value) for key, value in capability.items() if key not in {"supported_tasks", "output_type"}},
                "mask": "required" if "mask" in capability.get("interaction_requirements", []) else "unavailable" if schema.get("disable_canvas_mask", True) else "optional",
                "prompt_reference_format": "<imageN>" if qwen21 else "<Picture N>" if "minimax_h3" in method else "natural_language",
                "parameters": parameters,
                "parameter_schema": {"type": "object", "properties": properties, "additionalProperties": False},
                "generation_defaults": copy.deepcopy(entry.get("generation_config") or {}),
                "resolution_defaults": copy.deepcopy(entry.get("resolution_config") or {})}
        if spec["prompt_mode"] == "preset_fixed":
            spec["prompt_policy"] = {"mode": "preset_fixed", "editable": False,
                                     "requires_explicit_theme": True, "value": str(defaults.get("prompt") or "")}
        from modules.agent_prompting import guidance
        spec["prompt_guidance"] = guidance(entry, spec, lang or context.state.get("__lang") or "en")
        return spec

    def prompt_guidance(self, request, context):
        return self._spec(self._entry(request.preset_id, context), request.theme, request.lang, context)["prompt_guidance"]

    def skills(self, request, context):
        from modules.agent_prompting import list_skills
        guide = self.prompt_guidance(request, context) if request.preset_id else None
        return list_skills(request, context, guide)

    def skill(self, request, context):
        from modules.agent_prompting import read_skill
        return read_skill(request, context)

    def prompt_tags(self, request, context):
        from modules.agent_prompting import lookup_tags
        return lookup_tags(request)

    def wd14_status(self, request, context):
        status = self.backend.wd14_status(context)
        return {**status, "status": "ready" if status["ready"] else "needs_model",
                "execution_provider": "CPUExecutionProvider", "automatic_download": False,
                "status_url": f"{API_PREFIX}/prompts/wd14/status", "generation_started": False}

    def wd14(self, request, context):
        asset = self.backend.asset(request.asset_id, context)
        if not str(asset.get("mime") or "").startswith("image/"):
            message = ("WD14 需要当前身份可读的图片素材。" if context.state.get("__lang") == "cn"
                       else "WD14 requires an owned image asset.")
            raise AgentAPIError("input_type_mismatch", message, 422)
        status = self.wd14_status(None, context)
        if not status["ready"]:
            message = ("WD14 模型或标签表尚未安装，未开始下载。" if context.state.get("__lang") == "cn"
                       else "WD14 model or labels are not installed. No download was started.")
            raise AgentAPIError("wd14_model_missing", message, 409, status)
        try:
            result = self.backend.wd14(asset, request, context)
        except TimeoutError as exc:
            message = ("WD14 正在处理其他图片，请稍后重试。" if context.state.get("__lang") == "cn"
                       else "WD14 is busy; retry this read-only request later.")
            raise AgentAPIError("wd14_busy", message, 409) from exc
        except AgentAPIError:
            raise
        except Exception as exc:
            message = ("WD14 标签反推失败，请检查模型与标签表。" if context.state.get("__lang") == "cn"
                       else "WD14 tagging failed. Check the model and label table.")
            raise AgentAPIError("wd14_inference_failed", message, 502) from exc
        rows = result["tags"][:request.limit]
        prompt = ", ".join(row["tag"].replace("_", " ").replace("(", "\\(").replace(")", "\\)") for row in rows)
        return {"asset_id": request.asset_id, "model_id": result["model_id"], "providers": result["providers"],
                "tags": rows, "prompt": prompt, "total": len(result["tags"]), "truncated": len(result["tags"]) > len(rows),
                "threshold": request.threshold, "character_threshold": request.character_threshold,
                "automatic_download": False, "generation_started": False,
                "limitations": ("仅为视觉候选标签，不能据此推断真实身份或确认年龄。" if context.state.get("__lang") == "cn"
                                else "Candidate visual tags only; do not infer real identity or confirm age from tags.")}

    def prompt_validate(self, request, context):
        from modules.agent_prompting import check_encoding, validate
        check_encoding(request.prompt, "prompt")
        check_encoding(request.instruction, "instruction")
        return validate(request.prompt, self.prompt_guidance(request, context), request.instruction)

    def preset(self, request, context):
        from modules.agent_help import language
        spec = self._spec(self._entry(request.preset_id, context), request.theme, request.lang, context)
        spec["help_url"] = self._help_url({"document_id": "preset:" + spec["preset_id"],
                                          "theme": spec["theme"], "lang": language(request.lang or context.state.get("__lang"))})
        return spec

    @staticmethod
    def _help_url(arguments):
        return f"{API_PREFIX}/help/document?" + urlencode(arguments)

    def help_search(self, request, context):
        from modules import agent_help
        lang = agent_help.language(request.lang or context.state.get("__lang"))
        entries = self._catalog(context)
        selected = ""
        if request.theme and not request.preset_id:
            raise AgentAPIError("preset_required", "Select a preset before supplying a theme.", 422)
        if request.preset_id:
            entry = self._entry(request.preset_id, context, entries)
            self._spec(entry, request.theme, lang, context)
            selected = entry["name"]
            entries = {selected: entry}
        try:
            rows = agent_help.search(agent_help.documents(entries, lang, request.theme), request.query, selected)
        except (OSError, ValueError):
            raise AgentAPIError("help_unavailable", "The installed help documents could not be read.", 503) from None
        for row in rows:
            row["read_url"] = self._help_url({"document_id": row["document_id"], "lang": lang,
                                              **({"theme": row["theme"]} if row.get("theme") else {})})
        return {"items": rows[request.offset:request.offset + request.limit], "total": len(rows),
                "offset": request.offset, "limit": request.limit, "has_more": request.offset + request.limit < len(rows),
                "language": lang, "reference_only": True}

    def help_read(self, request, context):
        from modules import agent_help
        lang = agent_help.language(request.lang or context.state.get("__lang"))
        entries = {}
        kind, _, name = request.document_id.partition(":")
        identity = request.document_id
        if kind in {"preset", "legacy"}:
            entry = self._entry(name, context)
            self._spec(entry, request.theme, lang, context)
            entries = {entry["name"]: entry}
            identity = kind + ":" + entry["name"]
        elif request.theme:
            raise AgentAPIError("invalid_theme", "A theme applies only to a preset help document.", 422)
        try:
            document = agent_help.read_document(identity, entries, lang, request.theme)
        except (OSError, ValueError):
            raise AgentAPIError("help_unavailable", "The installed help document could not be read.", 503) from None
        if document is None:
            raise AgentAPIError("help_not_found", "The help document is not available. Search the help index for its ID.", 404)
        content = document.pop("content")
        revision = hashlib.sha256(content.encode("utf-8")).hexdigest()
        if request.expected_revision and request.expected_revision != revision:
            raise AgentAPIError("help_document_changed", "The help document changed. Read it again from the beginning.", 409)
        if request.offset > len(content):
            raise AgentAPIError("invalid_offset", "The requested offset is beyond the document.", 422)
        end = min(len(content), request.offset + request.max_chars)
        # Prefer a paragraph/line boundary, while guaranteeing progress.
        if end < len(content):
            boundary = content.rfind("\n", request.offset + request.max_chars // 2, end)
            if boundary >= 0:
                end = boundary + 1
        next_read = ({"document_id": identity, "lang": lang, "theme": request.theme,
                      "offset": end, "max_chars": request.max_chars, "expected_revision": revision} if end < len(content) else None)
        return {**document, "content": content[request.offset:end], "format": "markdown" if kind != "legacy" else "text",
                "revision": revision, "offset": request.offset, "total_chars": len(content), "has_more": next_read is not None,
                "next_read": next_read, "next_url": self._help_url(next_read) if next_read else None,
                "reference_only": True,
                **({"runtime_spec_url": f"{API_PREFIX}/presets/{quote(next(iter(entries)), safe='')}?"
                    + urlencode({"theme": document.get("theme") or request.theme, "lang": lang})} if entries else {})}

    @staticmethod
    def _public_profile(profile):
        profile = copy.deepcopy(profile)
        preset_id = profile.pop("preset", "")
        profile["preset_id"] = preset_id
        profile["detail_url"] = f"{API_PREFIX}/parameter-profiles/detail?" + urlencode({"preset_id": preset_id, "name": profile["name"]})
        profile["selection"] = {"preset_id": preset_id, "parameter_profile": profile["name"],
                                "expected_parameter_profile_fingerprint": profile["fingerprint"]}
        return profile

    def parameter_profiles(self, request, context):
        catalog = self._catalog(context)
        names = [self._entry(request.preset_id, context, catalog)["name"]] if request.preset_id else list(catalog)
        rows = self.backend.parameter_profiles(names, context)
        rows = [self._public_profile(row) for row in rows
                if request.query.casefold() in row.get("name", "").casefold()]
        return {"items": rows[request.offset:request.offset + request.limit], "total": len(rows),
                "offset": request.offset, "limit": request.limit,
                "has_more": request.offset + request.limit < len(rows), "scope": "user",
                "generation_started": False}

    def _profile_snapshot(self, preset_id, name, context, expected=""):
        snapshot = self.backend.parameter_profile(preset_id, name, context)
        if not snapshot.get("ok"):
            code = snapshot.get("error") or "parameter_profile_missing"
            raise AgentAPIError(code, "The parameter profile is unavailable for this preset and user.",
                                404 if code == "parameter_profile_missing" else 409)
        if expected and expected != snapshot["profile"]["fingerprint"]:
            raise AgentAPIError("parameter_profile_changed", "The selected parameter profile changed. Read it again before generating.", 409)
        return snapshot

    @staticmethod
    def _public_profile_settings(metadata):
        from enhanced import parameter_profiles as profiles
        from modules import lora_stack
        def model_name(value):
            text = str(value or "").replace("\\", "/")
            return ntpath.basename(text) if ntpath.isabs(text) or text.startswith("../") else text
        models = {key: model_name(metadata[key]) for key in
                  ("base_model", "refiner_model", "clip_model", "pe_model", "vae", "upscale_model") if key in metadata}
        models["loras"] = [{**row, "model": model_name(row["model"])} for row in profiles._profile_loras(metadata)]
        try:
            stack = lora_stack.normalize_stack(metadata.get("lora_stack"))
        except ValueError:
            raise AgentAPIError("parameter_profile_invalid", "The saved LoRA stack is invalid.", 409) from None
        models["lora_stack"] = [{**row, "model": model_name(row["model"])} for row in stack]
        models["lora_stack_target"] = metadata.get("lora_stack_target") or "auto"
        return {"models": models,
                "parameters": {key: copy.deepcopy(metadata[key]) for key in profiles._CANVAS_PROFILE_PARAM_KEYS if key in metadata},
                "generation": {target: copy.deepcopy(metadata[source]) for source, target in profiles._CANVAS_PROFILE_GENERATION_KEYS.items() if source in metadata},
                "resolution": profiles._profile_resolution_overrides(metadata),
                "styles": copy.deepcopy(metadata.get("styles") or []),
                **({"seed": metadata["seed"]} if "seed" in metadata else {})}

    def parameter_profile(self, request, context):
        entry = self._entry(request.preset_id, context)
        snapshot = self._profile_snapshot(entry["name"], request.name, context)
        return {**self._public_profile(snapshot["profile"]), "settings": self._public_profile_settings(snapshot["metadata"])}

    def _apply_profile(self, node, request, context, profile=None):
        name = getattr(request, "parameter_profile", "")
        if not name:
            if getattr(request, "expected_parameter_profile_fingerprint", ""):
                raise AgentAPIError("parameter_profile_required", "Select a parameter profile before supplying its fingerprint.", 422)
            return node, None
        profile = profile or self._profile_snapshot(node["preset"]["name"], name, context,
                                                    request.expected_parameter_profile_fingerprint)["profile"]
        if profile.get("scene_theme") and profile["scene_theme"] != node["runtime"].get("scene_theme"):
            raise AgentAPIError("parameter_profile_incompatible", "The parameter profile belongs to another preset theme.", 409)
        explicit = copy.deepcopy(getattr(request, "parameters", {}) or {})
        output = getattr(request, "output", None)
        if output is not None:
            if "seed" in output.model_fields_set:
                explicit.update({"seed_random": output.seed == -1, "image_seed": max(0, output.seed)})
            if "count" in output.model_fields_set:
                explicit.update({"image_number": output.count, "scene_image_number": output.count})
        if getattr(request, "negative_prompt", None) is not None:
            explicit["negative_prompt"] = request.negative_prompt
        node["parameter_profile"] = {"name": profile["name"], "preset": profile["preset"],
                                     "fingerprint": profile["fingerprint"], "preserve_models": True,
                                     "parameter_overrides": explicit}
        result = self.backend.apply_parameter_profile(node, context)
        if not result.get("ok"):
            raise AgentAPIError(result.get("error") or "parameter_profile_invalid", "The selected parameter profile cannot be applied.", 409)
        return result["preset_node"], profile

    def _model_request_node(self, request, context):
        entry = self._entry(request.preset_id, context)
        profile = (self._profile_snapshot(entry["name"], request.parameter_profile, context,
                                          request.expected_parameter_profile_fingerprint)["profile"]
                   if request.parameter_profile else None)
        spec = self._spec(entry, request.theme or (profile or {}).get("scene_theme"), request.lang, context)
        node, _ = self._apply_profile(self._node(entry, spec), request, context, profile)
        return entry, spec, node

    def models(self, request, context):
        node = None
        if request.preset_id:
            entry = self._entry(request.preset_id, context)
            spec = self._spec(entry, request.theme, "", context)
            node = self._node(entry, spec)
        return self.backend.models(request, node, context)

    def model_status(self, request, context):
        entry, spec, node = self._model_request_node(request, context)
        result = _backend_ok(self.backend.model_status(node, context), "model_status_failed")
        return self._public_model_status(result, context, entry["name"], spec["theme"], node)

    def download_models(self, request, context):
        from modules.access_mode import user_can_download_models
        chinese = context.state.get("__lang") == "cn"
        require_identity_binding(context, request.expected_identity_binding)
        if not user_can_download_models(context.user_id):
            raise AgentAPIError("model_download_not_allowed", "当前身份没有模型下载权限。" if chinese
                                else "The current identity is not allowed to download models.", 403)
        entry, spec, node = self._model_request_node(request, context)
        status = _backend_ok(self.backend.model_status(node, context), "model_status_failed")
        public = self._public_model_status(status, context, entry["name"], spec["theme"], node)
        if status.get("backend_disabled"):
            raise AgentAPIError("backend_disabled", "当前服务已禁用本地后端，无法下载模型。" if chinese
                                else "Model downloads are unavailable while the local backend is disabled.", 409, public)
        if status.get("ready"):
            return {**public, "queued_count": 0}
        if request.expected_model_fingerprint and request.expected_model_fingerprint != public["model_fingerprint"]:
            raise AgentAPIError("model_requirements_changed", "所需模型已变化，请重新确认下载。" if chinese
                                else "The required models changed. Confirm the download again.", 409, public)
        if not public["can_download"]:
            raise AgentAPIError("model_download_not_allowed", "当前身份或所选预置不允许下载模型。" if chinese
                                else "Model downloads are not allowed for this identity or preset.", 403, public)
        result = self.backend.download_models(node, context)
        if not isinstance(result, dict) or not result.get("ok"):
            # Permission changes are checked again by the shared Canvas service.
            denied = not user_can_download_models(context.user_id) or (
                isinstance(result, dict) and result.get("can_download") is False)
            raise AgentAPIError("model_download_not_allowed" if denied else "model_download_failed",
                                ("模型下载未获允许。" if denied else "无法启动模型下载，请检查服务端日志。") if chinese else
                                ("Model downloads are not allowed." if denied else "Could not start model downloads. Check the server log."),
                                403 if denied else 409)
        queued_count = len(result.get("queued") or [])
        status = _backend_ok(self.backend.model_status(node, context), "model_status_failed")
        public = self._public_model_status(status, context, entry["name"], spec["theme"], node)
        if not queued_count and not status.get("ready"):
            raise AgentAPIError("model_download_not_started", "没有模型下载任务启动，请检查下载状态。" if chinese
                                else "No model downloads were started. Check model download status.", 409, public)
        return {**public, "state": "ready" if status.get("ready") else "queued", "queued_count": queued_count}

    def _public_model_status(self, result, context, preset_id, theme, node):
        from modules.access_mode import user_can_download_models
        output = {key: copy.deepcopy(result[key]) for key in ("preset", "state", "ready", "missing_count", "backend_disabled", "message") if key in result}
        authorized = context.authorization is None or "models.download" in context.authorization["scopes"]
        base = f"{API_PREFIX}/presets/{quote(preset_id, safe='')}/models"
        requirements = [{key: row.get(key) for key in ("cata", "path_file", "size", "url")}
                        for row in result.get("missing_models") or [] if isinstance(row, dict)]
        revision = {key: node.get(key) for key in ("runtime", "models_config", "model_requirements")}
        preset_fingerprint = hashlib.sha256(json.dumps(revision, sort_keys=True).encode()).hexdigest()
        fingerprint = hashlib.sha256(json.dumps([preset_id, theme, preset_fingerprint, requirements], sort_keys=True).encode()).hexdigest()
        output.update({"can_download": bool(result.get("can_download") and not result.get("backend_disabled")
                                             and authorized and user_can_download_models(context.user_id)),
                       "identity_binding": identity_binding(context), "model_fingerprint": fingerprint, "user_id": context.user_id,
                       "preset_fingerprint": preset_fingerprint,
                       "download_scope": "node_shared", "download_url": base + "/download", "theme": theme,
                       "status_url": base + "/status" + ("?" + urlencode({"theme": theme}) if theme else "")})
        profile = node.get("parameter_profile") or {}
        if profile.get("name"):
            selection = {"theme": theme, "parameter_profile": profile["name"],
                         "expected_parameter_profile_fingerprint": profile["fingerprint"]}
            output.update({"parameter_profile": {"name": profile["name"], "fingerprint": profile["fingerprint"]},
                           "download_parameters": selection,
                           "status_url": base + "/status?" + urlencode(selection)})
        for key in ("missing_models", "selected_models"):
            output[key] = [
                {"name": row.get("name") or row.get("model") or row.get("filename") or row.get("path_file") or "",
                 "category": row.get("catalog") or row.get("cata") or row.get("type") or "",
                 **({"download_status": self._public_download_status(row.get("download_status"), context)}
                    if key == "missing_models" else {}),
                 **{field: row[field] for field in ("size", "reason") if field in row}}
                for row in result.get(key) or [] if isinstance(row, dict)
            ]
        return output

    @staticmethod
    def _public_download_status(progress, context):
        progress = progress if isinstance(progress, dict) else {}
        if progress.get("error"):
            message = ("模型下载失败，请检查服务端日志。" if context.state.get("__lang") == "cn"
                       else "Model download failed. Check the server log for details.")
            return {"state": "failed", "error": {"code": "model_download_failed", "message": message}}
        if progress.get("cancelled"):
            return {"state": "canceled"}
        if not progress:
            return {"state": "not_started"}
        current, total, percent = progress.get("current"), progress.get("total"), progress.get("percent")
        current = current if type(current) is int and current >= 0 else None
        total = total if type(total) is int and total > 0 else None
        percent = min(100, max(0, percent)) if total and type(percent) in {int, float} and math.isfinite(percent) else None
        return {"state": "queued" if progress.get("queued") else "verifying" if percent == 100 else "downloading",
                "downloaded_bytes": current, "total_bytes": total, "percent": percent}

    @staticmethod
    def _validate_parameters(values, spec):
        fields = spec["parameter_schema"]["properties"]
        for key, value in values.items():
            field = fields.get(key)
            if not field or field.get("readOnly"):
                raise AgentAPIError("invalid_parameter", f"Parameter '{key}' is unavailable or read-only for this preset/theme.", 422)
            kind = field["type"]
            valid = (type(value) in {int, float} and math.isfinite(value)) if kind == "number" else type(value) is bool if kind == "boolean" else isinstance(value, str)
            if not valid:
                raise AgentAPIError("invalid_parameter", f"Parameter '{key}' must have type {kind}.", 422)
            alternatives = field.get("anyOf") or []
            if any("const" in alternative and value == alternative["const"] for alternative in alternatives):
                continue
            if alternatives:
                field = {**field, **alternatives[0]}
            if "enum" in field and value not in field["enum"]:
                raise AgentAPIError("invalid_parameter", f"Parameter '{key}' must use a listed choice.", 422)
            if kind == "number":
                if ("minimum" in field and value < field["minimum"]) or ("maximum" in field and value > field["maximum"]):
                    raise AgentAPIError("invalid_parameter", f"Parameter '{key}' is outside its allowed range.", 422)
                step = field.get("x-step") or field.get("multipleOf")
                if isinstance(step, (int, float)) and step > 0 and not math.isclose((value - field.get("minimum", 0)) / step, round((value - field.get("minimum", 0)) / step), abs_tol=1e-6):
                    raise AgentAPIError("invalid_parameter", f"Parameter '{key}' does not match its allowed step.", 422)

    @staticmethod
    def _node(entry, spec, request=None, plan=None):
        schema = copy.deepcopy(entry.get("schema") or {})
        theme_info = (schema.get("per_theme") or {}).get(spec["theme"]) or {}
        params = copy.deepcopy(theme_info.get("defaults") or {})
        for item in spec["parameters"]:
            if item.get("group") != "generation" and item.get("default") is not None:
                params[item["id"]] = copy.deepcopy(item["default"])
        prompt = request.instruction if request and request.instruction else params.get("prompt", entry.get("default_prompt", ""))
        params.update({"prompt": prompt, "negative_prompt": entry.get("default_prompt_negative", "")})
        resolution = copy.deepcopy(entry.get("resolution_config") or {})
        for target, source in (("profile", "resolution_control"), ("quantize", "default_resolution_quantize_step"),
                               ("multiplier", "default_resolution_multiplier"), ("edit_mode", "default_resolution_edit_mode"), ("aspect_ratio", "default_aspect_ratio")):
            if source in resolution:
                resolution.setdefault(target, resolution[source])
        node = {"id": "agent-preset", "type": "preset" if entry.get("scene") else "classic",
                "preset": {"name": entry["name"], "snapshot": {"default_styles": entry.get("default_styles") or [],
                           "default_prompt": entry.get("default_prompt", ""), "default_prompt_negative": entry.get("default_prompt_negative", "")}},
                "runtime": {"backend_engine": entry.get("backend_engine"), "engine_type": entry.get("engine_type"),
                            "scene_frontend": "scene" if entry.get("scene") else "", "scene_theme": spec["theme"], "task_method": spec["task_method"]},
                "schema": schema, "params": params, "upload_slot_sources": {},
                "models_config": {"mode": "preset_default", "defaults": copy.deepcopy(entry.get("models_config") or {}), "overrides": {}},
                "styles_config": {"mode": "preset_default", "defaults": {"style_selections": copy.deepcopy(entry.get("default_styles") or [])}, "overrides": {}},
                "resolution_config": {"mode": "preset_default", "defaults": resolution, "overrides": {}},
                "generation_config": {"mode": "preset_default", "defaults": copy.deepcopy(entry.get("generation_config") or {}), "overrides": {}},
                "model_requirements": {"model_list": copy.deepcopy(entry.get("model_list") or []), "has_model_probe": bool(entry.get("has_model_probe")), "source": entry.get("source", "")}}
        if not request:
            return node
        params.update((plan or {}).get("parameter_overrides") or {})
        generation_keys = {item["id"] for item in spec["parameters"] if item.get("group") == "generation"}
        params.update({key: value for key, value in request.parameters.items() if key not in generation_keys})
        if request.prompt is not None:
            if "prompt" in request.parameters and request.parameters["prompt"] != request.prompt:
                raise AgentAPIError("conflicting_prompt", "Supply the final prompt in prompt or parameters.prompt, without conflicting values.", 422)
            params["prompt"] = request.prompt
        node["generation_config"]["overrides"].update({key: value for key, value in request.parameters.items() if key in generation_keys})
        profile_output = request.output.model_fields_set if request.parameter_profile else {"seed", "count", "aspect_ratio", "width", "height"}
        if "seed" in profile_output:
            params.update({"seed_random": request.output.seed == -1, "image_seed": max(0, request.output.seed)})
        if "count" in profile_output:
            params["image_number"] = request.output.count
        if request.negative_prompt is not None:
            params["negative_prompt"] = request.negative_prompt
        if "count" in profile_output:
            node["generation_config"]["overrides"]["image_number"] = request.output.count
        overrides = node["resolution_config"]["overrides"]
        size = (request.output.width, request.output.height)
        if not all(size):
            size = {"1:1": (1024, 1024), "16:9": (1344, 768), "9:16": (768, 1344), "4:3": (1152, 864),
                    "3:4": (864, 1152), "2:3": (832, 1216), "3:2": (1216, 832)}.get(request.output.aspect_ratio)
        if size:
            overrides.update({"width": size[0], "height": size[1], "aspect_ratio": f"{size[0]}*{size[1]}", "random_aspect_ratio": False})
        elif entry.get("scene") and "aspect_ratio" in profile_output:
            overrides["use_input_aspect"] = True
        node["classic_mode"] = (plan or {}).get("classic_mode") or "t2i"
        node["current_tab"] = "enhance" if node["classic_mode"] == "enhance" else "ip"
        if node["classic_mode"] == "enhance":
            node["enhance_params"] = {"regions": [{"enabled": True, "dino_prompt": target, "prompt": prompt}
                                                  for target in (plan or {}).get("enhance_targets") or ["face", "hand", "eye"]]}
        return node

    def _prepare(self, request, context):
        from modules import describe_vlm_chat as chat
        from modules.agent_prompting import check_encoding
        for field in ("instruction", "prompt", "parameters", "negative_prompt"):
            check_encoding(getattr(request, field), field)
        if not (request.instruction.strip() or request.task.strip() or request.preset_id.strip()):
            raise AgentAPIError("task_required", "Supply an instruction, task or explicit preset.", 422)
        task_key = request.task.strip().lower().replace("-", "_").replace(" ", "_")
        task_key = chat.GENERATION_TASK_ALIASES.get(task_key, task_key)
        if request.task and task_key not in chat.GENERATION_TASKS:
            raise AgentAPIError("invalid_task", "Use a task ID returned by capabilities or the preset catalog.", 422)
        if request.parameters and not request.preset_id:
            raise AgentAPIError("preset_required", "Select a preset before supplying preset-specific parameters.", 422)
        if request.theme and not request.preset_id:
            raise AgentAPIError("preset_required", "Select a preset before supplying a theme.", 422)
        if (request.parameter_profile or request.parameter_profile_selection_required) and not request.preset_id:
            raise AgentAPIError("preset_required", "Select a preset before choosing a private parameter profile.", 422)
        catalog = self._catalog(context)
        if request.preset_id:
            selected = self._entry(request.preset_id, context, catalog)
            catalog = {selected["name"]: selected}
        profile = (self._profile_snapshot(selected["name"], request.parameter_profile, context,
                                          request.expected_parameter_profile_fingerprint)["profile"]
                   if request.parameter_profile else None)
        effective_theme = request.theme or (profile or {}).get("scene_theme") or ""
        if (request.preset_id and selected["name"].casefold() == "onekeykontext" and not effective_theme
                and not request.parameter_profile_selection_required):
            raise AgentAPIError("preset_theme_required",
                                "请选择 OneKeyKontext 的具体功能主题。" if context.state.get("__lang") == "cn"
                                else "Choose a specific OneKeyKontext function theme.", 422,
                                {"choices": selected["schema"].get("themes") or []})
        waiting_for_profile = request.parameter_profile_selection_required and profile is None
        manifest = [{"ref": item.ref or f"input_{index}", "type": item.type} for index, item in enumerate(request.inputs, 1)]
        if len({item["ref"] for item in manifest}) != len(manifest):
            raise AgentAPIError("duplicate_reference", "Input reference IDs must be unique.", 422)
        capabilities = [self._capability(entry) for entry in catalog.values()]
        task_request = {"task": task_key, "instruction": request.instruction, "media_refs": [item["ref"] for item in manifest],
                        "aspect_ratio": request.output.aspect_ratio, "image_number": request.output.count}
        if request.preset_id and not request.task:
            # A named specialized preset already expresses the operation. A brief
            # instruction need not repeat the classifier's words (pose, erase, etc.).
            declared_tasks = selected.get("media_capability", {}).get("supported_tasks") or []
            if effective_theme:
                theme_info = (selected.get("schema", {}).get("per_theme") or {}).get(effective_theme) or {}
                declared_tasks = theme_info.get("supported_tasks") or declared_tasks
            inferred = chat._normalize_generation_task("", task_request["media_refs"], request.instruction, manifest)
            if declared_tasks and inferred not in declared_tasks:
                task_request["task"] = declared_tasks[0]
        plan = chat.compile_creative_execution_plan(task_request, capabilities, manifest, preferred_preset=request.preset_id,
                                                    user_message=request.instruction, infer_task=not bool(request.task))
        if not plan.get("preset"):
            raise AgentAPIError("no_compatible_preset", "No available preset supports this task and these input types/counts.", 409, {"task": plan.get("task")})
        # Probe candidates until a ready route is found, without invoking a VLM.
        checked = set()
        while True:
            entry = catalog[plan["preset"]]
            spec = self._spec(entry, effective_theme or plan.get("theme"), request.lang, context)
            if effective_theme:
                theme_tasks = ((entry.get("schema") or {}).get("per_theme") or {}).get(effective_theme, {}).get("supported_tasks") or []
                if theme_tasks and plan["task"] not in theme_tasks:
                    raise AgentAPIError("incompatible_theme", "The requested theme does not support this task.", 409)
                plan.update({"theme": spec["theme"], "task_method": spec["task_method"]})
            node = self._node(entry, spec, request, plan)
            node, _ = self._apply_profile(node, request, context, profile)
            if spec.get("prompt_policy", {}).get("mode") == "preset_fixed":
                fixed = spec["prompt_policy"]["value"]
                if not fixed:
                    raise AgentAPIError("preset_prompt_unavailable",
                                        "所选主题的固定提示词不可用。" if context.state.get("__lang") == "cn"
                                        else "The selected theme's fixed prompt is unavailable.", 409)
                if any(value is not None and value != fixed for value in (request.prompt, request.parameters.get("prompt"))):
                    raise AgentAPIError("preset_prompt_fixed",
                                        "此功能使用预置固定提示词，不能由 Agent 改写。" if context.state.get("__lang") == "cn"
                                        else "This function uses a fixed preset prompt; Agents cannot replace it.", 422)
                node["params"]["prompt"] = fixed
            if profile:
                generation = {**node["generation_config"]["defaults"], **node["generation_config"]["overrides"]}
                count = generation.get("image_number", node["params"].get("image_number", 1))
                if type(count) not in {int, float} or not 1 <= count <= 4 or int(count) != count:
                    raise AgentAPIError("profile_output_limit", "The saved generation count exceeds the API limit. Set output.count to 1-4.", 422)
                resolution = {**node["resolution_config"]["defaults"], **node["resolution_config"]["overrides"]}
                if any(type(resolution.get(key)) in {int, float} and resolution[key] > 16384 for key in ("width", "height")):
                    raise AgentAPIError("profile_output_limit", "The saved resolution exceeds the API limit. Supply output.width and output.height up to 16384.", 422)
                plan["parameter_profile"] = profile["name"]
                plan["parameter_profile_fingerprint"] = profile["fingerprint"]
                plan["parameter_profile_source"] = "request_hint"
            if waiting_for_profile:
                status = {"ok": True, "ready": False, "missing_count": 0, "state": "awaiting_parameter_profile"}
                break
            status = _backend_ok(self.backend.model_status(node, context), "model_status_failed")
            checked.add(entry["name"])
            if status.get("ready") or request.preset_id or len(checked) >= len(catalog):
                break
            for capability in capabilities:
                if capability["name"] == entry["name"]:
                    capability["model_status"] = "missing"
            next_plan = chat.compile_creative_execution_plan(task_request, capabilities, manifest,
                                                             user_message=request.instruction, infer_task=not bool(request.task))
            if next_plan.get("preset") in checked or not next_plan.get("preset"):
                break
            plan = next_plan
        self._validate_parameters(request.parameters, spec)
        plan["model_status"] = "ready" if status.get("ready") else "missing"
        requirements = list(plan.get("interaction_requirements") or [])
        refs = {item["ref"]: source for item, source in zip(manifest, request.inputs)}
        if "mask" in requirements and any(refs[binding["ref"]].mask_asset_id for binding in plan.get("media_bindings", []) if binding["slot"] == "scene_canvas_image"):
            requirements.remove("mask")
        if any(item.mask_asset_id for item in request.inputs) and spec["mask"] == "unavailable":
            raise AgentAPIError("mask_not_supported", "This preset does not accept a mask.", 422)
        plan["interaction_requirements"] = requirements
        if plan["status"] != "needs_media":
            plan["status"] = "needs_mask" if "mask" in requirements else "needs_interaction" if requirements else "models_missing" if not status.get("ready") else "ready"
            if status.get("backend_disabled"):
                plan["status"] = "backend_disabled"
        if waiting_for_profile:
            from modules.agent_api_contract import ParameterProfileQuery
            plan["status"] = "needs_parameter_profile"
            plan["parameter_profile_options"] = self.parameter_profiles(ParameterProfileQuery(preset_id=entry["name"]), context)
        node["params"]["prompt"] = chat._normalize_creative_qwen21_image_references(node["params"]["prompt"], plan, manifest)
        from modules.agent_prompting import validate
        final_prompt = node["params"].get("prompt") or ""
        check_encoding(final_prompt, "prompt")
        guide = spec["prompt_guidance"]
        # Existing image/video transforms may intentionally have no text prompt.
        validation = validate(final_prompt, guide, request.instruction) if final_prompt or plan["task"] == "text_to_image" else {"state": "pass", "checks": [], "guidance_url": guide["guidance_url"]}
        plan["prompt_validation"] = validation
        if validation["state"] == "block" and plan["status"] == "ready":
            plan["status"] = "needs_prompt"
        return plan, spec, node, refs, status

    def plan(self, request, context):
        plan, spec, node, refs, status = self._prepare(request, context)
        unbound = [ref for ref in refs if ref not in {item["ref"] for item in plan.get("media_bindings") or []}]
        self._sources(plan, refs, context, allow_missing=True)
        if plan["status"] == "ready":
            from modules import asset_lifecycle
            try:
                asset_lifecycle.for_state(context.state).check_capacity()
            except asset_lifecycle.StorageLimitError as exc:
                plan["status"] = "storage_full" if str(exc) == "asset_storage_limit" else "storage_check_incomplete"
                plan["storage_error"] = {"code": str(exc), "management_url": f"{API_PREFIX}/assets/manage"}
        return {"plan": plan, "preset_id": plan["preset"], "instruction": node["params"]["prompt"],
                "source_instruction": request.instruction, "prompt": node["params"]["prompt"], "prompt_guidance": spec["prompt_guidance"],
                "parameter_values": {item["id"]: request.parameters.get(item["id"],
                    ({**node["generation_config"]["defaults"], **node["generation_config"]["overrides"]}
                     if item.get("group") == "generation" else node["params"]).get(item["id"], item["default"]))
                    for item in spec["parameters"]},
                "models": self._public_model_status(status, context, plan["preset"], spec["theme"], node),
                "requires_upload": [ref for ref, item in refs.items() if not item.asset_id],
                "unbound_inputs": unbound,
                "ready_to_submit": plan["status"] == "ready" and not unbound and all(item.asset_id for item in refs.values())}

    def submit(self, request, context):
        plan, spec, node, refs, status = self._prepare(request, context)
        if plan["status"] != "ready":
            raise AgentAPIError("task_not_ready", "The task needs inputs, models or interaction before submission.", 409, {"plan": plan})
        sources = self._sources(plan, refs, context)
        if len(sources) != len(request.inputs):
            raise AgentAPIError("unbound_inputs", "Some inputs cannot be used by the selected task. Remove them or choose another preset.", 422)
        run_id = "agent-" + hashlib.sha256(f"{context.user_id}\0{request.request_id}".encode()).hexdigest()[:40]
        fingerprint_value = request.model_dump()
        if request.parameter_profile:
            fingerprint_value["profile_output_overrides"] = sorted(request.output.model_fields_set)
        fingerprint = hashlib.sha256(json.dumps(fingerprint_value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        result = _backend_ok(self.backend.submit({
            "project_id": PROJECT_ID, "run_id": run_id, "request_fingerprint": fingerprint,
            "placeholder_node_id": run_id + "-output", "preset_node": node, "asset_sources": sources,
            "user_context": context.user_context, "result_asset_scope": "canvas",
            "client_context": {"surface": "agent_api", "tool_call_id": request.request_id},
        }, context), "submission_failed")
        return {**self._public_run(result, context), "preset_id": plan["preset"], "plan": plan}

    def _sources(self, plan, refs, context, allow_missing=False):
        sources = {}
        for binding in plan["media_bindings"]:
            source = refs[binding["ref"]]
            if not source.asset_id:
                if allow_missing:
                    continue
                raise AgentAPIError("input_upload_required", "Upload every bound input before submission.", 409)
            asset = self.backend.asset(source.asset_id, context)
            if not str(asset.get("mime") or "").startswith(source.type + "/"):
                raise AgentAPIError("input_type_mismatch", "An uploaded asset does not match its declared input type.", 422)
            mask = self.backend.asset(source.mask_asset_id, context) if source.mask_asset_id else None
            if mask and not str(mask.get("mime") or "").startswith("image/"):
                raise AgentAPIError("invalid_mask", "A mask must be an image asset.", 422)
            if mask and binding["slot"] != "scene_canvas_image":
                raise AgentAPIError("invalid_mask_binding", "Attach the mask to the canvas image input.", 422)
            sources[binding["slot"]] = {"node_id": binding["ref"], "type": source.type, "asset": asset, "mask": mask}
        return sources

    def _public_run(self, result, context):
        fields = ("run_id", "task_id", "state", "percent", "message", "queue_size", "resolved_seed", "created_at", "updated_at", "finished_at", "idempotent_replay", "error")
        output = {key: result[key] for key in fields if key in result}
        output["assets"] = [self._public_asset(asset) for asset in result.get("assets") or [] if ASSET_ID_RE.fullmatch(str(asset.get("asset_id") or ""))]
        output["status_url"] = f"{API_PREFIX}/runs/{quote(str(result.get('run_id') or ''), safe='')}"
        if result.get("state") == "finished" and result.get("assets") and not output["assets"]:
            output["output_error"] = {"code": "asset_registration_failed", "message": "The backend finished but did not register a downloadable output asset."}
        return output

    def run(self, request, context):
        return self._public_run(_backend_ok(self.backend.run(request.run_id, context), "run_unavailable"), context)

    def cancel(self, request, context):
        return self._public_run(_backend_ok(self.backend.run(request.run_id, context, cancel=True), "run_unavailable"), context)

    @staticmethod
    def _public_asset(asset):
        result = {key: asset[key] for key in ("asset_id", "name", "mime", "size", "width", "height", "duration", "fps", "sha256") if asset.get(key) is not None}
        result["content_url"] = f"{API_PREFIX}/assets/{quote(asset['asset_id'], safe='')}/content"
        return result

    def upload(self, request, context):
        from PIL import Image
        match = re.fullmatch(r"data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)", request.data_url)
        if not match or match.group(1) not in MEDIA_MIMES:
            raise AgentAPIError("invalid_media", "Supply a supported image, video or audio base64 data URL.", 422)
        try:
            binary = base64.b64decode(re.sub(r"\s", "", match.group(2)), validate=True)
            if not binary or len(binary) > MAX_ASSET_BYTES:
                raise ValueError("Invalid asset size")
            if match.group(1).startswith("image/"):
                with Image.open(io.BytesIO(binary)) as image:
                    image.verify()
        except (ValueError, OSError, Image.DecompressionBombError) as exc:
            raise AgentAPIError("invalid_media", "The media bytes are invalid or exceed the upload limit.", 422) from exc
        from modules.asset_lifecycle import StorageLimitError
        try:
            asset = self.backend.upload(request.data_url, request.name, context)
        except StorageLimitError as exc:
            if str(exc) == "asset_storage_scan_incomplete":
                message = ("资产统计尚未完成，请打开资产空间管理刷新后重试。" if context.state.get("__lang") == "cn"
                           else "Asset indexing is incomplete. Refresh storage management and retry.")
                raise AgentAPIError("asset_storage_scan_incomplete", message, 503,
                                    {"management_url": f"{API_PREFIX}/assets/manage"}) from exc
            message = ("资产空间已达到上限，请清理过期资产或调整容量设置。" if context.state.get("__lang") == "cn"
                       else "Asset storage is full. Clean expired assets or adjust the storage limit.")
            raise AgentAPIError("asset_storage_limit", message, 409,
                                {"management_url": f"{API_PREFIX}/assets/manage"}) from exc
        if not asset:
            raise AgentAPIError("upload_failed", "The asset could not be stored.", 500)
        return self._public_asset({**asset, "name": request.name})

    def asset_content(self, asset_id, context):
        _require_context(context)
        require_scope(context, "read")
        return self.backend.asset(asset_id, context)

    def asset_storage(self, request, context):
        from modules import asset_lifecycle
        return {**asset_lifecycle.for_state(context.state).status(request.offset, request.limit),
                "management_url": f"{API_PREFIX}/assets/manage"}

    def workflow_import(self, request, context):
        from modules.agent_workflows import parse_source, png_source
        origin = None
        if request.asset_id:
            source, origin = png_source(self.backend.asset(request.asset_id, context), request.asset_id, request.metadata_key)
        else:
            source, _ = parse_source(request.json_text)
        return self.workflows.save(source, request.name, context, request.parent_workflow_id, origin)

    def workflow_get(self, request, context):
        return self.workflows.get(request, context)

    def workflow_node_types(self, request, context):
        from modules.agent_workflows import node_types
        return node_types(request.class_types, self.backend.workflow_node_catalog(context))

    def workflow_update(self, request, context):
        from modules.agent_workflows import update
        # Ownership is checked before querying the backend.
        self.workflows.load(request.workflow_id, context)
        return update(self.workflows, request, context, self.backend.workflow_node_catalog(context))

    def workflow_preview(self, request, context):
        from modules.agent_workflows import preview
        self.workflows.load(request.workflow_id, context)
        result = preview(self.workflows, request, context, self.backend.workflow_node_catalog(context),
                         lambda asset_id: self.backend.asset(asset_id, context))
        if not request.include_api_prompt:
            result.pop("api_prompt", None)
        return result

    def workflow_submit(self, request, context):
        from modules.access_mode import user_can_generate
        from modules.agent_workflows import digest
        if not user_can_generate(context.user_id):
            raise AgentAPIError("generation_not_allowed", "This identity cannot submit generation tasks.", 403)
        self.workflows.load(request.workflow_id, context)
        fingerprint = digest(request.model_dump())
        run_id = "agent-workflow-" + hashlib.sha256((context.user_id + "\0" + request.request_id).encode()).hexdigest()[:40]
        replay = self.backend.replay_workflow(run_id, fingerprint, context)
        if replay:
            return self._public_run(replay, context)
        plan = self.workflow_preview(request, context)
        if not plan["ready_to_submit"]:
            raise AgentAPIError("workflow_not_ready", plan["message"], 409, plan)
        if request.preview_fingerprint != plan["preview_fingerprint"]:
            raise AgentAPIError("workflow_preview_changed", "Workflow, identity, inputs or node definitions changed. Preview and confirm again.", 409)
        result = _backend_ok(self.backend.submit_workflow({
            "run_id": run_id, "project_id": PROJECT_ID, "request_fingerprint": fingerprint,
            "user_context": context.user_context, "workflow_request": request.model_dump(),
            "identity_binding": plan["identity_binding"], "outputs": plan["outputs"],
            "client_context": {"surface": "agent_api", "tool_call_id": request.request_id},
        }, context), "workflow_submission_failed")
        return {**self._public_run(result, context), "workflow_id": request.workflow_id}

    def workflow_content(self, workflow_id, context):
        _require_context(context)
        require_scope(context, "read")
        record = self.workflows.load(workflow_id, context)
        return record["source"]


_DEFAULT_SERVICE = AgentService()


def get_default_service():
    return _DEFAULT_SERVICE


def execute_registered_tool(name, arguments, context):
    try:
        service = context.get("agent_service") or get_default_service()
        if name in {"simpai.vlm.chat", "simpai.vlm.analyze"}:
            principal = context.get("agent_api_context")
            _require_context(principal)
            schema = OPERATIONS[name][0]
            request = schema.model_validate(arguments)
            method = service.vlm.analyze if name.endswith(".analyze") else service.vlm.complete
            return method(request, principal, cancel_check=context.get("cancel_check"))
        return service.execute(name, arguments, context.get("agent_api_context"))["data"]
    except AgentAPIError as exc:
        return {"ok": False, "code": exc.code, "error": exc.message, "details": exc.details}
