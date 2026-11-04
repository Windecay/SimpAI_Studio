import copy
import json
import math
import re
from collections import Counter

from modules.lora_params import PLACEHOLDER_LORA_NAME, normalize_lora_model_name, resolve_lora_filename


BACKEND_FIELDS = ("lora_stack", "lora_stack_target")
TARGETS = ("auto", "main", "high", "low", "both")
TAG_PATTERN = re.compile(r"<lora:([^:<>]+):([^<>]+)>")
# Older peers display this warning as ordinary progress text.
REMOTE_LORA_WARNING_PROGRESS = -101
NOISE_TARGET_PATTERN = re.compile(
    r"(?<![a-z0-9])(high|low)(?:[\s._-]*noise)?(?![a-z0-9])"
    r"|(?<=[_-])([hl])(?![a-z0-9])",
    re.IGNORECASE,
)


def _message(lang, english, chinese):
    return chinese if str(lang or "cn").lower().startswith(("cn", "zh")) else english


def normalize_stack(value, lang=None):
    if value in (None, ""):
        return []
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError) as error:
            raise ValueError(_message(lang, "Invalid LoRA stack JSON.", "LoRA 堆 JSON 格式错误。")) from error
    if isinstance(value, dict):
        if value.get("version", 1) != 1:
            raise ValueError(_message(lang, "Unsupported LoRA stack version.", "不支持此 LoRA 堆版本。"))
        value = value.get("items")
    if not isinstance(value, list):
        raise ValueError(_message(lang, "LoRA stack must be a list.", "LoRA 堆必须是列表。"))
    result = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            raise ValueError(_message(lang, f"Invalid LoRA stack item {index + 1}.", f"LoRA 堆第 {index + 1} 项格式错误。"))
        target = str(item.get("target", "auto"))
        if target not in TARGETS:
            raise ValueError(_message(lang, f"Unknown LoRA target: {target}", f"未知 LoRA 作用范围：{target}"))
        strengths = {}
        for key, default in (("strength_model", item.get("weight", 1.0)), ("strength_clip", 0.0)):
            try:
                strength = float(item.get(key, default))
            except (TypeError, ValueError) as error:
                raise ValueError(_message(lang, "Invalid LoRA weight.", "LoRA 权重格式错误。")) from error
            if not math.isfinite(strength):
                raise ValueError(_message(lang, "LoRA weights must be finite.", "LoRA 权重必须是有限数值。"))
            strengths[key] = strength
        enabled = item.get("enabled", True)
        if not isinstance(enabled, bool):
            raise ValueError(_message(lang, "LoRA enabled must be a boolean.", "LoRA 启用状态必须为布尔值。"))
        result.append({
            "enabled": enabled,
            "model": normalize_lora_model_name(item.get("model", item.get("name", ""))),
            "target": target,
            **strengths,
        })
    return result


def extract_prompt_loras(prompt, filenames, target="auto", lang=None, missing_tags=None):
    items = []

    def replace(match):
        name = match.group(1).strip()
        model = resolve_lora_filename(name, filenames)
        if model is None:
            if missing_tags is None:
                raise ValueError(_message(lang, f"LoRA tag model not found: {name}", f"LoRA 标签模型不存在：{name}"))
        normalized = normalize_stack([{
            "model": model or name,
            "strength_model": match.group(2).strip(),
            "target": target or "auto",
        }], lang)
        if model is None:
            missing_tags.append({"name": name, "tag": match.group(0)})
        else:
            items.extend(normalized)
        return ""

    cleaned = TAG_PATTERN.sub(replace, str(prompt or ""))
    return items, cleaned


def _active(item):
    return (
        item["enabled"]
        and item["model"].casefold() not in ("", "none", PLACEHOLDER_LORA_NAME.casefold())
        and (item["strength_model"] != 0 or item["strength_clip"] != 0)
    )


def prepare_stack_params(prompt, params, filenames, supports_stack=True, lang=None, missing_tags=None):
    manual = normalize_stack(params.get("lora_stack"), lang)
    missing = [] if missing_tags is not None else None
    tags, cleaned = extract_prompt_loras(prompt, filenames, params.get("lora_stack_target", "auto"), lang, missing)
    if not supports_stack and any(_active(item) for item in manual + tags):
        raise ValueError(_message(lang, "LoRA stacks and prompt tags require a Comfy workflow with SimpAILoraStack.", "LoRA 堆和提示词标签需要带有 SimpAILoraStack 节点的 Comfy 工作流。"))
    params["lora_stack"] = manual
    params["lora_stack_prompt"] = tags
    if missing:
        params["lora_stack_prompt_missing"] = [item["tag"] for item in missing]
    else:
        params.pop("lora_stack_prompt_missing", None)
    if missing_tags is not None:
        missing_tags.extend(missing)
    return cleaned


def report_missing_prompt_loras(task, missing_tags):
    if not missing_tags:
        return
    from modules.localization import localized_text

    names = list(getattr(task, "simpleai_missing_lora_names", ()) or ())
    seen = {name.casefold() for name in names}
    new_names = []
    for item in missing_tags:
        name = item["name"]
        if name.casefold() not in seen:
            names.append(name)
            new_names.append(name)
            seen.add(name.casefold())
    if not new_names:
        return

    template = localized_text(
        {"__lang": getattr(task, "simpleai_lang", None)},
        "LoRA models not found and skipped: {names}. Generation will continue without them.",
    )
    task.simpleai_missing_lora_names = names
    task.simpleai_lora_warning = template.format(names=", ".join(names))
    warning = template.format(names=", ".join(new_names))
    if getattr(task, "remote_task", None) is None:
        task.yields.append(["warning", warning])
    return warning


def receive_remote_lora_warning(task, warning):
    warning = str(warning or "").strip()
    if not warning:
        return
    warnings = list(getattr(task, "simpleai_remote_lora_warnings", ()) or ())
    if warning in warnings:
        return
    warnings.append(warning)
    task.simpleai_remote_lora_warnings = warnings
    task.simpleai_lora_warning = "\n".join(warnings)
    task.yields.append(["warning", warning])


def active_stack_items(value, lang=None):
    return [item for item in normalize_stack(value, lang) if _active(item)]


def active_stack_models(value):
    return [item["model"] for item in active_stack_items(value)]


def build_fooocus_stack(params, legacy_loras=(), filenames=()):
    lang = params.get("__lang")
    manual = active_stack_items(params.get("lora_stack"), lang)
    tags = active_stack_items(params.get("lora_stack_prompt"), lang)
    occupied = {
        normalize_lora_model_name(resolve_lora_filename(name, filenames) or name).casefold()
        for name, weight in legacy_loras if float(weight) != 0
    }
    occupied.update(item["model"].casefold() for item in manual)
    result = list(manual)
    for item in tags:
        key = item["model"].casefold()
        if key not in occupied:
            result.append(item)
            occupied.add(key)
    return result


def restore_prompt_tags(prompt, items, missing_tags=()):
    existing = {match.group(1).replace("\\", "/").casefold() for match in TAG_PATTERN.finditer(str(prompt or ""))}
    existing_tags = Counter(match.group(0) for match in TAG_PATTERN.finditer(str(prompt or "")))
    additions = []
    for item in normalize_stack(items):
        model = item["model"]
        stem = model.rsplit(".", 1)[0]
        names = {model.casefold(), stem.casefold(), stem.rsplit("/", 1)[-1].casefold()}
        if existing.intersection(names):
            continue
        additions.append(f'<lora:{model}:{item["strength_model"]:g}>')
        existing.update(names)
    if isinstance(missing_tags, (list, tuple)):
        for tag in missing_tags:
            if not isinstance(tag, str) or not TAG_PATTERN.fullmatch(tag):
                continue
            if existing_tags[tag]:
                existing_tags[tag] -= 1
            else:
                additions.append(tag)
    return str(prompt or "") if not additions else str(prompt or "").rstrip() + "\n" + ", ".join(additions)


def _auto_noise_target(model):
    name = model.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    marked_targets = {
        "high" if (long_name or short_name).casefold() in ("high", "h") else "low"
        for long_name, short_name in NOISE_TARGET_PATTERN.findall(name)
    }
    return "low" if marked_targets == {"low"} else "high"


def _targets(target, branches, model, lang):
    if target == "auto":
        if len(branches) == 1:
            return list(branches)
        if not {"high", "low"}.issubset(branches):
            raise ValueError(_message(lang,
                "Select a LoRA target for this workflow.",
                "请为此工作流选择 LoRA 作用范围。"))
        target = _auto_noise_target(model)
    requested = ("high", "low") if target == "both" else (target,)
    if not set(requested).issubset(branches):
        raise ValueError(_message(lang, f"Workflow has no LoRA stack for target: {target}", f"工作流没有对应的 LoRA 堆节点：{target}"))
    return requested


def _legacy_names(prompt, stack_node):
    names = set()
    visited = set()
    link = stack_node.get("inputs", {}).get("model")
    while isinstance(link, list) and len(link) == 2 and str(link[0]) not in visited:
        node_id = str(link[0])
        visited.add(node_id)
        node = prompt.get(node_id, {})
        if node.get("class_type") not in (
            "LoraLoaderModelOnly", "LoraLoader",
            "LoraLoaderBypassModelOnly", "LoraLoaderBypass",
        ):
            break
        inputs = node.get("inputs", {})
        if inputs.get("strength_model", 0) != 0 or inputs.get("strength_clip", 0) != 0:
            names.add(normalize_lora_model_name(inputs.get("lora_name")).casefold())
        link = inputs.get("model")
    return names


def _upstream_clip_entries(nodes, prepared, node):
    visited = set()
    link = node.get("inputs", {}).get("clip")
    while isinstance(link, list) and len(link) == 2 and link[1] == 1:
        node_id = str(link[0])
        if node_id not in nodes or node_id in visited:
            break
        visited.add(node_id)
        yield from prepared[node_id]
        link = nodes[node_id].get("inputs", {}).get("clip")


def apply_stack_inputs(prompt, params):
    if not prompt or not any(key in params for key in (*BACKEND_FIELDS, "lora_stack_prompt")):
        return prompt
    lang = params.get("__lang")
    manual = normalize_stack(params.get("lora_stack"), lang)
    tags = normalize_stack(params.get("lora_stack_prompt"), lang)
    nodes = {
        node_id: node for node_id, node in prompt.items()
        if isinstance(node, dict) and node.get("class_type") == "SimpAILoraStack"
    }
    active = [item for item in manual + tags if _active(item)]
    if not nodes:
        if active:
            raise ValueError(_message(lang, "This workflow needs a SimpAILoraStack node to use LoRA stacks or tags.", "此工作流需要添加 SimpAILoraStack 节点，才能使用 LoRA 堆或标签；旧十槽不会接收标签。"))
        return prompt
    branches = {node.get("inputs", {}).get("branch", "main") for node in nodes.values()}
    if not branches.issubset({"main", "high", "low"}):
        raise ValueError(_message(lang, "Invalid LoRA stack branch in workflow.", "工作流的 LoRA 堆分支配置无效。"))
    grouped = {branch: [] for branch in branches}
    occupied = {branch: set() for branch in branches}
    for source, items in (("manual", manual), ("prompt", tags)):
        for index, item in enumerate(items):
            if not _active(item):
                continue
            for branch in _targets(item["target"], branches, item["model"], lang):
                key = item["model"].casefold()
                if source == "prompt" and key in occupied[branch]:
                    continue
                grouped[branch].append({**item, "target": branch, "source": source, "_entry_id": (source, index)})
                occupied[branch].add(key)
    prepared = {}
    for node_id, node in nodes.items():
        branch = node.get("inputs", {}).get("branch", "main")
        legacy = _legacy_names(prompt, node)
        prepared[node_id] = [item for item in grouped[branch] if item["source"] != "prompt" or item["model"].casefold() not in legacy]
    result = copy.deepcopy(prompt)
    for node_id, node in nodes.items():
        applied_clip = {
            item["_entry_id"] for item in _upstream_clip_entries(nodes, prepared, node)
            if item["strength_clip"] != 0
        }
        entries = []
        for item in prepared[node_id]:
            entry = {key: value for key, value in item.items() if key != "_entry_id"}
            if item["_entry_id"] in applied_clip:
                entry["strength_clip"] = 0.0
            entries.append(entry)
        if any(item["strength_clip"] != 0 for item in entries) and not node.get("inputs", {}).get("clip"):
            raise ValueError(_message(lang, "Connect CLIP to the LoRA stack node before using a CLIP weight.", "使用 CLIP 权重前，需要为 LoRA 堆节点连接 CLIP。"))
        result[node_id]["inputs"]["stack_json"] = json.dumps({"version": 1, "items": entries}, ensure_ascii=False, allow_nan=False)
    return result
