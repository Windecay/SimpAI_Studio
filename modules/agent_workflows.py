"""Private, immutable Comfy imports and conservative graph preflight.

No uploaded node code is imported here. GUI conversion is limited to reviewed
standard widgets; custom serialization and subgraphs require an API export.
"""

import copy
import hashlib
import json
import math
import os
import re
import tempfile
import threading
from graphlib import CycleError, TopologicalSorter
from pathlib import Path
from urllib.parse import quote

from modules.agent_api_contract import API_PREFIX
from modules.agent_service import AgentAPIError, identity_binding


MAX_JSON_BYTES = 2 * 1024 * 1024
MAX_NODES = 512
MAX_OUTPUTS = 16
WORKFLOW_ID = re.compile(r"^workflow:([0-9a-f]{64})$")
NODE_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,120}$")
STORE_LOCK = threading.Lock()

# These nodes perform model inference/tensor processing, or have explicit I/O
# policies below. Installing a custom node never grants it execution permission.
COMPUTE_NODES = frozenset("""
CheckpointLoaderSimple CheckpointLoader VAELoader CLIPLoader DualCLIPLoader TripleCLIPLoader
UNETLoader LoraLoader LoraLoaderModelOnly ControlNetLoader DiffControlNetLoader
CLIPTextEncode CLIPSetLastLayer CLIPVisionLoader CLIPVisionEncode
ConditioningCombine ConditioningAverage ConditioningConcat ConditioningSetArea
ConditioningSetAreaPercentage ConditioningSetMask ConditioningZeroOut
ConditioningSetTimestepRange ControlNetApply ControlNetApplyAdvanced
EmptyLatentImage EmptySD3LatentImage EmptyFlux2LatentImage EmptyHunyuanLatentVideo
EmptyLTXVLatentVideo EmptyMochiLatentVideo WanImageToVideo WanFirstLastFrameToVideo
Wan22ImageToVideoLatent HunyuanVideo15ImageToVideo
KSampler KSamplerAdvanced KSamplerSelect SamplerCustom SamplerCustomAdvanced
RandomNoise DisableNoise BasicGuider CFGGuider DualCFGGuider
BasicScheduler KarrasScheduler ExponentialScheduler SDTurboScheduler
SplitSigmas FlipSigmas SetFirstSigma
VAEDecode VAEDecodeTiled VAEEncode VAEEncodeTiled VAEEncodeForInpaint
InpaintModelConditioning SetLatentNoiseMask LatentUpscale LatentUpscaleBy
LatentComposite LatentBlend LatentCrop LatentFromBatch RepeatLatentBatch
ImageScale ImageScaleBy ImageInvert ImageBatch ImagePadForOutpaint ImageCrop
ImageCompositeMasked ImageBlend ImageFromBatch ImageToMask MaskToImage
EmptyImage SolidMask InvertMask CropMask FeatherMask GrowMask MaskComposite
ImageUpscaleWithModel UpscaleModelLoader
ModelSamplingDiscrete ModelSamplingContinuousEDM ModelSamplingContinuousV
ModelSamplingSD3 ModelSamplingFlux ModelSamplingAuraFlow RescaleCFG
FluxGuidance FluxDisableGuidance CLIPTextEncodeFlux CLIPTextEncodeSD3
CLIPTextEncodeSDXL CLIPTextEncodeSDXLRefiner
TextEncodeQwenImageEdit TextEncodeQwenImageEditPlus
CreateVideo GetVideoComponents VideoSlice
""".split())
FILE_INPUTS = {
    "LoadImage": {"image": "image"},
    "LoadImageMask": {"image": "image"},
    "LoadVideo": {"file": "video"},
}
OUTPUT_NODES = {
    "SaveImage": "image", "PreviewImage": "image",
    "SaveWEBM": "video", "SaveVideo": "video",
}
SUPPORTED_NODES = COMPUTE_NODES | FILE_INPUTS.keys() | OUTPUT_NODES.keys()
# Positional widgets are only decoded for ordinary core widgets. Dynamic video
# widgets, extension hooks, virtual nodes and bypass modes are not guessed.
GUI_ARRAY_NODES = frozenset("""
CheckpointLoaderSimple VAELoader CLIPLoader DualCLIPLoader UNETLoader
LoraLoader LoraLoaderModelOnly CLIPTextEncode CLIPSetLastLayer
EmptyLatentImage EmptySD3LatentImage KSampler KSamplerAdvanced
VAEDecode VAEDecodeTiled VAEEncode VAEEncodeTiled
ImageScale ImageScaleBy ImageInvert ImageBatch EmptyImage
LoadImage LoadImageMask SaveImage PreviewImage SaveWEBM CreateVideo
""".split())
MODEL_INPUTS = frozenset("""
ckpt_name vae_name clip_name clip_name1 clip_name2 clip_name3 unet_name
lora_name control_net_name model_name upscale_model
""".split())
GUI_VIRTUAL_NODES = frozenset({"Reroute", "PrimitiveNode", "Note", "MarkdownNote", "SetNode", "GetNode"})


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value):
    return hashlib.sha256(encode(value).encode("utf-8")).hexdigest()


def _pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise ValueError("Duplicate JSON key")
        result[key] = value
    return result


def _invalid_constant(_value):
    raise ValueError("Non-finite JSON number")


def parse_source(text):
    try:
        if len(text.encode("utf-8")) > MAX_JSON_BYTES:
            raise ValueError("Workflow exceeds the JSON limit")
        value = json.loads(text.lstrip("\ufeff"), object_pairs_hook=_pairs, parse_constant=_invalid_constant)
        # Limit nesting separately from file size; graphs do not need deep JSON.
        stack = [(value, 0)]
        while stack:
            child, depth = stack.pop()
            if depth > 32:
                raise ValueError("Workflow JSON is too deeply nested")
            if isinstance(child, dict):
                stack.extend((item, depth + 1) for item in child.values())
            elif isinstance(child, list):
                stack.extend((item, depth + 1) for item in child)
            elif isinstance(child, float) and not math.isfinite(child):
                raise ValueError("Non-finite JSON number")
            elif isinstance(child, str):
                child.encode("utf-8")
        source_format, graph = source_graph(value)
        count = len(graph)
        if not 0 < count <= MAX_NODES:
            raise ValueError("Workflow node count must be between 1 and 512")
        identifiers = set()
        rows = graph.items() if source_format == "comfy_api" else ((str(node.get("id", "")), node) for node in graph if isinstance(node, dict))
        if source_format == "comfy_ui" and not all(isinstance(node, dict) for node in graph):
            raise ValueError("UI nodes must be objects")
        for node_id, node in rows:
            if not NODE_ID.fullmatch(node_id) or node_id in identifiers or not isinstance(node, dict):
                raise ValueError("Invalid or duplicate node ID")
            identifiers.add(node_id)
            class_type = node.get("class_type" if source_format == "comfy_api" else "type")
            if not isinstance(class_type, str) or not 0 < len(class_type) <= 200:
                raise ValueError("Node class must be a string")
            if source_format == "comfy_api" and (not isinstance(node.get("inputs"), dict) or len(node["inputs"]) > 128):
                raise ValueError("API node inputs must be an object with at most 128 fields")
        return value, source_format
    except (ValueError, TypeError, RecursionError, UnicodeError) as exc:
        raise AgentAPIError("invalid_workflow", str(exc)[:200], 422) from exc


def source_graph(source):
    if not isinstance(source, dict):
        raise ValueError("Workflow root must be an object")
    if isinstance(source.get("nodes"), list):
        if not isinstance(source.get("links"), list):
            raise ValueError("UI workflow requires a links array")
        return "comfy_ui", source["nodes"]
    if source and all(isinstance(node, dict) and "class_type" in node for node in source.values()):
        return "comfy_api", source
    for envelope in ("prompt", "output"):
        if envelope in source and isinstance(source[envelope], dict):
            return "comfy_api", source[envelope]
    raise ValueError("Expected a Comfy UI workflow or an API prompt graph")

def png_source(asset, asset_id, metadata_key="auto"):
    from PIL import Image
    if asset.get("mime") != "image/png":
        raise AgentAPIError("png_workflow_required", "Choose an uploaded PNG containing Comfy workflow metadata.", 422)
    try:
        with Image.open(asset["path"]) as image:
            if image.format != "PNG":
                raise ValueError("Asset is not a PNG")
            metadata = {key: image.info[key] for key in ("prompt", "workflow") if key in image.info}
    except (OSError, ValueError, KeyError, Image.DecompressionBombError) as exc:
        raise AgentAPIError("png_workflow_invalid", "PNG workflow metadata could not be read.", 422) from exc
    selected = ("prompt" if "prompt" in metadata else "workflow") if metadata_key == "auto" else metadata_key
    if selected not in metadata:
        raise AgentAPIError("png_workflow_missing", "PNG has no selected Comfy workflow metadata. Supply a JSON export.", 422)
    parsed = {}
    invalid = []
    for key, text in metadata.items():
        try:
            if not isinstance(text, str):
                raise AgentAPIError("invalid_workflow", "Workflow metadata must be JSON text.", 422)
            parsed[key], _ = parse_source(text)
        except AgentAPIError:
            if key == selected:
                raise AgentAPIError("png_workflow_invalid", "Selected PNG workflow metadata is invalid. Choose the other metadata key explicitly or supply JSON.", 422) from None
            invalid.append(key)
    source = parsed[selected]
    selected_format, selected_graph = source_graph(source)
    if selected_format == "comfy_api":
        source = {"prompt": selected_graph}
        if "workflow" in parsed and source_graph(parsed["workflow"])[0] == "comfy_ui":
            source["workflow"] = parsed["workflow"]
    elif "prompt" in parsed and source_graph(parsed["prompt"])[0] == "comfy_api":
        source = {**source, "prompt": source_graph(parsed["prompt"])[1]}
    # The original PNG remains an owned asset; only Comfy metadata is copied.
    source, _ = parse_source(encode(source))
    return source, {"type": "png_metadata", "asset_id": asset_id, "selected_key": selected,
                    "available_keys": sorted(metadata), "invalid_other_keys": invalid}


class WorkflowStore:
    def _path(self, workflow_id, context, create=False):
        from modules.canvas_workbench_assets import _asset_root
        match = WORKFLOW_ID.fullmatch(workflow_id)
        if not match:
            raise AgentAPIError("workflow_not_found", "Workflow is unavailable to this identity.", 404)
        base, _ = _asset_root("agent_api", {**context.state, "user_did": context.user_id})
        base = Path(base).resolve()
        root = (base / "workflow_imports").resolve()
        path = (root / (match[1] + ".json")).resolve()
        if not root.is_relative_to(base) or not path.is_relative_to(root):
            raise AgentAPIError("workflow_storage_unavailable", "Workflow storage is unavailable.", 503)
        if create:
            root.mkdir(parents=True, exist_ok=True)
        return path

    def save(self, source, name, context, parent="", origin=None):
        if parent:
            self.load(parent, context)
        # Include lineage in the immutable identity; a revision cannot overwrite
        # the original even when its content is imported again.
        record = {"source": source, "name": name, "parent_workflow_id": parent}
        if origin is not None:
            record["origin"] = origin
        fingerprint = digest(record)
        workflow_id = "workflow:" + fingerprint
        with STORE_LOCK:
            path = self._path(workflow_id, context, create=True)
            if not path.exists():
                temporary = None
                try:
                    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as handle:
                        temporary = Path(handle.name)
                        handle.write(encode(record))
                    os.replace(temporary, path)
                finally:
                    if temporary is not None:
                        temporary.unlink(missing_ok=True)
        return self.summary(workflow_id, record)

    def load(self, workflow_id, context):
        path = self._path(workflow_id, context)
        try:
            if path.stat().st_size > MAX_JSON_BYTES + 2048:
                raise ValueError("Workflow record exceeds the limit")
            record = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_pairs,
                                parse_constant=_invalid_constant)
            if digest(record) != workflow_id.removeprefix("workflow:"):
                raise ValueError("Workflow record changed")
            parse_source(encode(record["source"]))
            return record
        except FileNotFoundError as exc:
            raise AgentAPIError("workflow_not_found", "Workflow is unavailable to this identity.", 404) from exc
        except (OSError, KeyError, ValueError, TypeError) as exc:
            raise AgentAPIError("workflow_changed", "Stored workflow failed its integrity check. Import it again.", 409) from exc

    @staticmethod
    def summary(workflow_id, record):
        source_format, graph = source_graph(record["source"])
        url = f"{API_PREFIX}/workflows/{quote(workflow_id, safe='')}"
        return {"workflow_id": workflow_id, "fingerprint": workflow_id.removeprefix("workflow:"),
                "name": record["name"], "parent_workflow_id": record["parent_workflow_id"],
                "format": source_format, "node_count": len(graph),
                "origin": copy.deepcopy(record.get("origin") or {"type": "json"}),
                "get_url": url, "content_url": url + "/content", "preview_url": url + "/preview",
                "update_url": url + "/update", "submit_url": url + "/runs", "generation_started": False}

    def get(self, request, context):
        record = self.load(request.workflow_id, context)
        source_format, graph = source_graph(record["source"])
        rows = ([{**copy.deepcopy(node), "node_id": str(key)} for key, node in graph.items()]
                if source_format == "comfy_api" else copy.deepcopy(graph))
        rows = rows[request.offset:request.offset + request.limit]
        total = len(graph)
        return {**self.summary(request.workflow_id, record), "nodes": rows,
                "offset": request.offset, "total": total, "has_more": request.offset + len(rows) < total}


def _bound_file_schema(class_type, info):
    result = copy.deepcopy(info)
    for group in ("required", "optional"):
        fields = (result.get("input") or {}).get(group) or {}
        for name in FILE_INPUTS.get(class_type, {}):
            if name in fields:
                spec = list(fields[name])
                spec[0] = ["<bind-owned-asset>"]
                if len(spec) > 1 and isinstance(spec[1], dict):
                    spec[1].pop("default", None)
                fields[name] = spec
    return result


def node_types(class_types, object_info):
    result = []
    for class_type in dict.fromkeys(class_types):
        info = object_info.get(class_type)
        if isinstance(info, dict):
            info = _bound_file_schema(class_type, info)
            supported = class_type in SUPPORTED_NODES and not info.get("api_node")
            for group in ("required", "optional"):
                fields = (info.get("input") or {}).get(group) or {}
                for name, spec in list(fields.items()):
                    label = name.casefold().replace("-", "_")
                    if (label in {"api_key", "apikey", "password", "secret", "token", "access_token",
                                  "refresh_token", "cookie", "authorization", "credentials"}
                            or label.endswith(("_api_key", "_password", "_secret", "_token"))):
                        fields[name] = ["STRING", {"sensitive": True}]
                    elif not supported:
                        spec = list(spec)
                        if isinstance(spec[0], list):
                            spec[0] = []
                        if len(spec) > 1 and isinstance(spec[1], dict):
                            spec[1].pop("default", None)
                        fields[name] = spec
        result.append({"class_type": class_type, "installed": isinstance(info, dict),
                       "execution_supported": isinstance(info, dict) and class_type in SUPPORTED_NODES and not info.get("api_node"),
                       **({"input": {key: value for key, value in (info.get("input") or {}).items()
                                     if key in {"required", "optional"}},
                           "input_order": {key: value for key, value in (info.get("input_order") or {}).items()
                                           if key in {"required", "optional"}},
                           "output": info.get("output", []), "output_node": info.get("output_node", False)}
                          if isinstance(info, dict) else {})})
    return {"nodes": result, "generation_started": False}


def _issue(code, node_id="", input_name="", **details):
    return {"code": code, "node_id": str(node_id), "input": input_name, **details}


def _schema(info):
    inputs = info.get("input") or {}
    return {**(inputs.get("required") or {}), **(inputs.get("optional") or {})}


def _link(value):
    return (isinstance(value, list) and len(value) == 2 and isinstance(value[0], str)
            and isinstance(value[1], int) and not isinstance(value[1], bool))


def convert_source(source, object_info):
    source_format, graph = source_graph(source)
    if source_format == "comfy_api":
        return copy.deepcopy(graph), []
    issues = []
    prompt = {}
    links = {}
    for link in source["links"]:
        if not isinstance(link, list) or len(link) != 6 or str(link[0]) in links:
            issues.append(_issue("unsupported_link_serialization"))
            continue
        links[str(link[0])] = link
    definitions = source.get("definitions")
    if isinstance(definitions, dict) and definitions.get("subgraphs"):
        issues.append(_issue("subgraph_requires_api_export"))
    for node in graph:
        if not isinstance(node, dict):
            issues.append(_issue("invalid_ui_node"))
            continue
        node_id, class_type = str(node.get("id", "")), node.get("type", "")
        if not NODE_ID.fullmatch(node_id) or node_id in prompt:
            issues.append(_issue("invalid_node_id", node_id))
            continue
        if node.get("mode", 0) != 0 or node.get("subgraphId"):
            issues.append(_issue("node_mode_requires_api_export", node_id))
            continue
        if class_type in GUI_VIRTUAL_NODES:
            issues.append(_issue("virtual_node_requires_api_export", node_id))
            continue
        info = object_info.get(class_type)
        if not isinstance(info, dict):
            issues.append(_issue("missing_node", node_id, class_type=class_type))
            continue
        fields = _schema(info)
        values = node.get("widgets_values", [])
        inputs = {}
        if isinstance(values, dict):
            inputs.update(copy.deepcopy(values))
        elif isinstance(values, list) and class_type in GUI_ARRAY_NODES:
            order = info.get("input_order") or {}
            names = list(order.get("required") or []) + list(order.get("optional") or [])
            if not names or set(names) != set(fields):
                if fields:
                    issues.append(_issue("widget_order_requires_api_export", node_id))
                    continue
            widget_names = []
            for name in names:
                spec = fields[name]
                kind = spec[0]
                options = spec[1] if len(spec) > 1 and isinstance(spec[1], dict) else {}
                if (isinstance(kind, list) or kind in {"INT", "FLOAT", "BOOLEAN", "STRING"}) and not options.get("forceInput"):
                    widget_names.append(name)
                    if options.get("control_after_generate"):
                        widget_names.append(None)
            if len(widget_names) != len(values):
                issues.append(_issue("widget_values_require_api_export", node_id))
                continue
            for name, value in zip(widget_names, values):
                if name is not None:
                    inputs[name] = copy.deepcopy(value)
                elif not isinstance(value, str) or value not in {"fixed", "increment", "decrement", "randomize"}:
                    issues.append(_issue("unsupported_widget_control", node_id))
        elif values == [] and not any(
            isinstance(spec[0], list) or spec[0] in {"INT", "FLOAT", "BOOLEAN", "STRING"}
            for spec in fields.values()
        ):
            pass
        else:
            issues.append(_issue("custom_widgets_require_api_export", node_id))
            continue
        sockets = node.get("inputs") or []
        if not isinstance(sockets, list):
            issues.append(_issue("invalid_input_socket", node_id))
            continue
        for slot, item in enumerate(sockets):
            if not isinstance(item, dict):
                issues.append(_issue("invalid_input_socket", node_id))
                continue
            link_id = item.get("link")
            if link_id is None:
                continue
            link = links.get(str(link_id))
            if not link or str(link[3]) != node_id or link[4] != slot:
                issues.append(_issue("invalid_ui_link", node_id, item.get("name", "")))
                continue
            inputs[item.get("name", "")] = [str(link[1]), link[2]]
        prompt[node_id] = {"class_type": class_type, "inputs": inputs,
                           "_meta": {"title": str(node.get("title") or class_type)[:200]}}
    # Never expose a partial conversion as a usable prompt.
    return (None, issues) if issues else (prompt, [])


def _bad_model_path(value):
    return (not isinstance(value, str) or value.startswith(("/", "\\"))
            or re.match(r"^[A-Za-z]:", value) or ".." in value.replace("\\", "/").split("/")
            or "://" in value or "\0" in value)


def _valid_scalar(value, spec):
    kind = spec[0]
    options = spec[1] if len(spec) > 1 and isinstance(spec[1], dict) else {}
    if isinstance(kind, list):
        return value in kind
    if kind == "STRING":
        return isinstance(value, str) and len(value) <= 16000 and "\0" not in value
    if kind == "BOOLEAN":
        return isinstance(value, bool)
    if kind in {"INT", "FLOAT"}:
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            return False
        if kind == "INT" and not isinstance(value, int):
            return False
        return options.get("min", -math.inf) <= value <= options.get("max", math.inf)
    # Arbitrary literal dictionaries cannot impersonate tensor/model sockets.
    return False


def _valid_video_format(value):
    if isinstance(value, str):
        return value in {"auto", "mp4", "mkv", "webm"}
    if not isinstance(value, dict) or set(value) - {"format", "codec"}:
        return False
    codec = value.get("codec", {"codec": "auto"})
    if not isinstance(codec, dict) or set(codec) - {"codec", "encoding"}:
        return False
    encoding = codec.get("encoding", {})
    return (value.get("format") in {"auto", "mp4", "mkv", "webm"}
            and codec.get("codec") in {"auto", "h264", "av1"}
            and isinstance(encoding, dict) and not set(encoding) - {"crf"}
            and (not encoding or isinstance(encoding.get("crf"), int) and not isinstance(encoding["crf"], bool)
                 and 0 <= encoding["crf"] <= 63))


def inspect_graph(prompt, object_info, bindings, asset_lookup):
    issues, outputs, media, missing_models = [], [], [], []
    dependency_graph = {}
    bound = {}
    for binding in bindings:
        key = (binding.node_id, binding.input)
        if key in bound:
            issues.append(_issue("duplicate_binding", *key))
        bound[key] = binding.asset_id
    used_bindings = set()
    for node_id, node in prompt.items():
        if not isinstance(node_id, str) or not NODE_ID.fullmatch(node_id) or not isinstance(node, dict):
            issues.append(_issue("invalid_api_node", node_id))
            continue
        class_type, inputs = node.get("class_type"), node.get("inputs")
        info = object_info.get(class_type) if isinstance(class_type, str) else None
        if not isinstance(info, dict):
            issues.append(_issue("missing_node", node_id, class_type=class_type))
            continue
        if class_type not in SUPPORTED_NODES or info.get("api_node"):
            issues.append(_issue("node_not_approved", node_id, class_type=class_type))
        if not isinstance(inputs, dict):
            issues.append(_issue("invalid_api_inputs", node_id))
            continue
        fields = _schema(info)
        required = set((info.get("input") or {}).get("required") or {})
        dependencies = set()
        for name in required - inputs.keys():
            if (node_id, name) not in bound:
                issues.append(_issue("missing_input", node_id, name))
        for name in inputs.keys() - fields.keys():
            # SaveVideo's compatibility codec input may be represented inside
            # its dynamic combo; arbitrary extra inputs remain forbidden.
            issues.append(_issue("unknown_input", node_id, name))
        if info.get("output_node") and class_type not in OUTPUT_NODES:
            issues.append(_issue("unsupported_output_node", node_id, class_type=class_type))
        if class_type in OUTPUT_NODES:
            outputs.append({"node_id": node_id, "type": OUTPUT_NODES[class_type],
                            "filename_policy": "managed_run_directory"})
            if "filename_prefix" in inputs:
                inputs["filename_prefix"] = "agent_workflows/__RUN__/" + hashlib.sha256(node_id.encode()).hexdigest()[:12]
        for name, spec in fields.items():
            file_kind = FILE_INPUTS.get(class_type, {}).get(name)
            if file_kind:
                asset_id = bound.get((node_id, name))
                media.append({"node_id": node_id, "input": name, "type": file_kind, "asset_id": asset_id or ""})
                if not asset_id:
                    issues.append(_issue("needs_asset_binding", node_id, name, type=file_kind))
                    continue
                used_bindings.add((node_id, name))
                asset = asset_lookup(asset_id)
                if not str(asset.get("mime") or "").startswith(file_kind + "/"):
                    issues.append(_issue("asset_type_mismatch", node_id, name, type=file_kind))
                inputs[name] = asset_id
                continue
            if name not in inputs:
                continue
            value = inputs[name]
            if name == "batch_size" and isinstance(value, (int, float)) and value > 64:
                issues.append(_issue("batch_limit_exceeded", node_id, name, limit=64))
            if _link(value):
                dependencies.add(value[0])
                target = prompt.get(value[0]) or {}
                target_info = object_info.get(target.get("class_type")) or {}
                types = target_info.get("output") or []
                if not 0 <= value[1] < len(types):
                    issues.append(_issue("invalid_link", node_id, name))
                elif isinstance(spec[0], str) and spec[0] != "*" and types[value[1]] != "*":
                    if not set(spec[0].split(",")).intersection(str(types[value[1]]).split(",")):
                        issues.append(_issue("link_type_mismatch", node_id, name))
            elif name in MODEL_INPUTS:
                if _bad_model_path(value):
                    issues.append(_issue("invalid_model_name", node_id, name))
                elif isinstance(spec[0], list) and value not in spec[0]:
                    missing_models.append({"node_id": node_id, "input": name, "name": value})
                    issues.append(_issue("missing_model", node_id, name, name=value))
                elif not _valid_scalar(value, spec):
                    issues.append(_issue("invalid_input_value", node_id, name))
            elif class_type == "SaveVideo" and name == "format":
                if not _valid_video_format(value):
                    issues.append(_issue("invalid_input_value", node_id, name))
            elif class_type == "SaveVideo" and name == "codec":
                if not _valid_video_format({"format": "auto", "codec": value}):
                    issues.append(_issue("invalid_input_value", node_id, name))
            elif not _valid_scalar(value, spec):
                issues.append(_issue("invalid_input_value", node_id, name))
        dependency_graph[node_id] = dependencies
    for key in bound.keys() - used_bindings:
        issues.append(_issue("unsupported_asset_binding", *key))
    try:
        tuple(TopologicalSorter(dependency_graph).static_order())
    except CycleError:
        issues.append(_issue("workflow_cycle"))
    if not outputs:
        issues.append(_issue("missing_output_node"))
    if len(outputs) > MAX_OUTPUTS:
        issues.append(_issue("too_many_output_nodes"))
    return issues, outputs, media, missing_models


def preview(store, request, context, object_info, asset_lookup):
    record = store.load(request.workflow_id, context)
    prompt, issues = convert_source(record["source"], object_info)
    outputs, media, missing_models = [], [], []
    normalizations = []
    if prompt is not None:
        from modules.comfy_prompt_compat import normalize_comfy_prompt_enum_paths
        prompt, normalizations = normalize_comfy_prompt_enum_paths(prompt, object_info)
        checked, outputs, media, missing_models = inspect_graph(prompt, object_info, request.bindings, asset_lookup)
        issues.extend(checked)
    codes = {item["code"] for item in issues}
    if not issues:
        status = "ready"
    elif "missing_node" in codes:
        status = "needs_nodes"
    elif prompt is None:
        status = "needs_api_export"
    elif "node_not_approved" in codes or "unsupported_output_node" in codes:
        status = "unsupported_nodes"
    elif codes <= {"needs_asset_binding", "missing_model"}:
        status = "needs_models" if missing_models else "needs_media"
    else:
        status = "invalid_workflow"
    messages = {
        "ready": ("工作流可以提交生成。", "Workflow is ready to submit."),
        "needs_nodes": ("缺少工作流节点，未执行安装或生成。", "Workflow nodes are missing; nothing was installed or generated."),
        "needs_api_export": ("此工作流含无法安全转换的结构，请提供 Comfy 导出的 API workflow。", "Export this workflow in Comfy API format; its UI serialization is not supported."),
        "unsupported_nodes": ("工作流包含尚未开放执行的节点，不能提交。", "This workflow contains nodes not approved for imported execution."),
        "needs_models": ("工作流缺少模型，未启动下载或生成。", "Workflow models are missing; no download or generation was started."),
        "needs_media": ("请将工作流输入绑定到当前身份上传的素材。", "Bind workflow file inputs to assets uploaded by this identity."),
        "invalid_workflow": ("工作流检查未通过，请根据问题列表修改。", "Workflow validation failed; revise the reported inputs or links."),
    }
    binding = identity_binding(context)
    _, graph = source_graph(record["source"])
    classes = ({node.get("class_type") for node in graph.values() if isinstance(node, dict)}
               if isinstance(graph, dict) else {node.get("type") for node in graph if isinstance(node, dict)})
    # File picker choices belong to the shared backend, not the submitting
    # identity. Owned asset bindings replace these choices before execution.
    schemas = {key: _bound_file_schema(key, object_info[key]) for key in classes if key in object_info}
    fingerprint = digest({"workflow": request.workflow_id, "prompt": prompt, "identity": binding,
                          "schemas": schemas, "bindings": [item.model_dump() for item in request.bindings]})
    return {**store.summary(request.workflow_id, record), "status": status, "ready_to_submit": not issues,
            "message": messages[status][0 if context.state.get("__lang") == "cn" else 1],
            "identity_binding": binding, "preview_fingerprint": fingerprint,
            "issues": issues, "outputs": outputs, "media_bindings": media, "missing_models": missing_models,
            "normalizations": normalizations, "validation": "node_schema", "backend_validation_required": True,
            "api_prompt": prompt, "conversion": "api_graph" if store.summary(request.workflow_id, record)["format"] == "comfy_api" else "standard_widgets",
            "model_download_started": False}


def update(store, request, context, object_info):
    record = store.load(request.workflow_id, context)
    if request.expected_fingerprint != request.workflow_id.removeprefix("workflow:"):
        raise AgentAPIError("workflow_changed", "Read the current workflow version before editing.", 409)
    prompt, issues = convert_source(record["source"], object_info)
    if issues:
        raise AgentAPIError("workflow_conversion_required", "An API export is required before editing this workflow.", 409, issues)
    touched = set()
    for edit in request.edits:
        key = (edit.node_id, edit.input)
        node = prompt.get(edit.node_id)
        if key in touched or not isinstance(node, dict) or edit.input not in _schema(object_info.get(node["class_type"]) or {}):
            raise AgentAPIError("invalid_workflow_edit", "Edit a unique named input from the node schema.", 422)
        touched.add(key)
        node["inputs"][edit.input] = copy.deepcopy(edit.value)
    source, _ = parse_source(encode(prompt))
    return store.save(source, request.name or record["name"], context, parent=request.workflow_id)
