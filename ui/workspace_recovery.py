from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import tempfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

import gradio as gr


logger = logging.getLogger(__name__)

WORKSPACE_SCHEMA_VERSION = 1
WORKSPACE_STORAGE_KEY = "simpai.studio.workspace.v1"
WORKSPACE_STORAGE_SECRET = "simpai-studio-workspace-recovery-v1"

_SENSITIVE_MARKERS = (
    "api_key",
    "apikey",
    "password",
    "passwd",
    "secret",
    "token",
    "credential",
    "authorization",
    "cookie",
)

_HIDDEN_INTERNAL_MARKERS = (
    "_bridge",
    "_payload",
    "_request",
    "_response",
    "_placeholder",
    "_data",
    "hidden_",
    "_hidden",
)

_WINDOWS_DRIVE_PATH = re.compile(r"^[A-Za-z]:[\\/]")
_WINDOWS_FILE_URL_PATH = re.compile(r"^/[A-Za-z]:[\\/]")


@dataclass(frozen=True)
class WorkspaceComponentSpec:
    component: Any
    key: str
    signature: str
    kind: str


@dataclass(frozen=True)
class WorkspaceRecoveryHandles:
    browser_state: Any
    owner_field: Any
    components: tuple[WorkspaceComponentSpec, ...]


def _component_kind(component: Any) -> str | None:
    component_types = (
        (gr.Textbox, "textbox"),
        (gr.Number, "number"),
        (gr.Slider, "slider"),
        (gr.Checkbox, "checkbox"),
        (gr.Radio, "radio"),
        (gr.Dropdown, "dropdown"),
        (gr.CheckboxGroup, "checkboxgroup"),
        (gr.Image, "image"),
        (gr.Video, "video"),
        (gr.Audio, "audio"),
        (gr.File, "file"),
    )
    for component_type, kind in component_types:
        if isinstance(component, component_type):
            return kind
    return None


def _component_text(value: Any) -> str:
    if value is None:
        return ""
    key = getattr(value, "key", None)
    return str(key if key is not None else value).strip()


def _is_custom_sketch_component(component: Any) -> bool:
    raw_classes = getattr(component, "elem_classes", None)
    if isinstance(raw_classes, str):
        classes = {raw_classes}
    else:
        classes = {str(value) for value in (raw_classes or [])}
    return "simpai-custom-sketch-source" in classes


def _event_input_ids(blocks: Any) -> set[int]:
    result: set[int] = set()
    for block_fn in getattr(blocks, "fns", {}).values():
        for component in getattr(block_fn, "inputs", ()) or ():
            component_id = getattr(component, "_id", None)
            if isinstance(component_id, int):
                result.add(component_id)
    return result


def _is_sensitive_component(component: Any, kind: str) -> bool:
    if kind == "textbox" and str(getattr(component, "type", "") or "").lower() == "password":
        return True
    text = " ".join(
        (
            _component_text(getattr(component, "elem_id", None)),
            _component_text(getattr(component, "label", None)),
            _component_text(getattr(component, "info", None)),
        )
    ).lower().replace("-", "_").replace(" ", "_")
    return any(marker in text for marker in _SENSITIVE_MARKERS)


def _is_hidden_internal_component(component: Any) -> bool:
    if getattr(component, "visible", None) is not False:
        return False
    elem_id = _component_text(getattr(component, "elem_id", None)).lower().replace("-", "_")
    return any(marker in elem_id for marker in _HIDDEN_INTERNAL_MARKERS)


def _is_workspace_component(component: Any, input_ids: set[int]) -> bool:
    # The sketch canvas is a Textbox with instance-level preprocess/postprocess
    # bridges. Gradio recreates plain Textbox instances for value updates, which
    # would drop that bridge and turn canvas payloads back into JSON strings.
    if _is_custom_sketch_component(component):
        return False
    kind = _component_kind(component)
    component_id = getattr(component, "_id", None)
    if kind is None or component_id not in input_ids:
        return False
    if getattr(component, "interactive", None) is False:
        return False
    if getattr(component, "visible", None) == "hidden":
        return False
    if kind in {"image", "video", "audio", "file"} and getattr(component, "visible", None) is False:
        return False
    if _is_hidden_internal_component(component):
        return False
    if not _component_text(getattr(component, "elem_id", None)) and not _component_text(getattr(component, "label", None)):
        return False
    return not _is_sensitive_component(component, kind)


def _append_workspace_classes(component: Any, spec: WorkspaceComponentSpec) -> None:
    raw_classes = getattr(component, "elem_classes", None)
    if isinstance(raw_classes, str):
        classes = [raw_classes]
    else:
        classes = list(raw_classes or [])
    for class_name in (
        "simpai-workspace-field",
        f"simpai-workspace-kind-{spec.kind}",
        f"simpai-workspace-key-{spec.key}",
        f"simpai-workspace-signature-{spec.signature}",
    ):
        if class_name not in classes:
            classes.append(class_name)
    component.elem_classes = classes


def collect_workspace_components(blocks: Any) -> tuple[WorkspaceComponentSpec, ...]:
    input_ids = _event_input_ids(blocks)
    raw_blocks = getattr(blocks, "blocks", {})
    components = list(raw_blocks.values() if isinstance(raw_blocks, dict) else raw_blocks or [])
    components.sort(key=lambda component: int(getattr(component, "_id", 0) or 0))

    occurrences: dict[str, int] = defaultdict(int)
    result: list[WorkspaceComponentSpec] = []
    for component in components:
        if not _is_workspace_component(component, input_ids):
            continue
        kind = _component_kind(component)
        if kind is None:
            continue
        identity = json.dumps(
            [
                kind,
                _component_text(getattr(component, "elem_id", None)),
                _component_text(getattr(component, "label", None)),
            ],
            ensure_ascii=True,
            separators=(",", ":"),
        )
        occurrence = occurrences[identity]
        occurrences[identity] += 1
        signature = hashlib.sha256(f"{identity}:{occurrence}".encode("utf-8")).hexdigest()
        spec = WorkspaceComponentSpec(
            component=component,
            key=signature[:20],
            signature=signature,
            kind=kind,
        )
        _append_workspace_classes(component, spec)
        result.append(spec)
    return tuple(result)


def _workspace_save_js(spec: WorkspaceComponentSpec) -> str:
    key_json = json.dumps(spec.key)
    signature_json = json.dumps(spec.signature)
    kind_json = json.dumps(spec.kind)
    return f"""
(state, value) => {{
    const api = window.SimpAIWorkspaceRecovery;
    return api && typeof api.saveValue === "function"
        ? api.saveValue({key_json}, {signature_json}, value, state, {kind_json})
        : state;
}}
""".strip()


def _choice_values(component: Any) -> list[Any]:
    result: list[Any] = []
    for choice in getattr(component, "choices", None) or []:
        if isinstance(choice, (tuple, list)) and len(choice) >= 2:
            result.append(choice[1])
        else:
            result.append(choice)
    return result


def _matching_choice(value: Any, choices: list[Any]) -> tuple[bool, Any]:
    for choice in choices:
        if value == choice or str(value) == str(choice):
            return True, choice
    return False, value


def _bounded_number(component: Any, value: Any) -> int | float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    minimum = getattr(component, "minimum", None)
    maximum = getattr(component, "maximum", None)
    if isinstance(minimum, (int, float)):
        number = max(float(minimum), number)
    if isinstance(maximum, (int, float)):
        number = min(float(maximum), number)
    precision = getattr(component, "precision", None)
    if precision == 0 or isinstance(value, int):
        return int(round(number))
    return number


def _allowed_media_roots() -> tuple[Path, ...]:
    candidates = (
        Path(tempfile.gettempdir()),
        Path.cwd(),
        Path.cwd().parent,
    )
    result: list[Path] = []
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
        except OSError:
            continue
        if resolved not in result:
            result.append(resolved)
    return tuple(result)


def _path_from_url(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if _WINDOWS_DRIVE_PATH.match(text):
        return unquote(text).strip()
    parsed = urlparse(text)
    if parsed.scheme == "file" and parsed.netloc:
        path = f"//{parsed.netloc}{parsed.path}"
    else:
        path = parsed.path if parsed.scheme or parsed.netloc else text
    if "file=" in path:
        path = path.split("file=", 1)[1]
    path = unquote(path).strip()
    if os.name == "nt" and _WINDOWS_FILE_URL_PATH.match(path):
        path = path[1:]
    return path


def _safe_existing_media_path(value: Any) -> str | None:
    if isinstance(value, dict):
        value = value.get("path") or value.get("name") or value.get("url")
    if not isinstance(value, (str, os.PathLike)):
        return None
    raw_path = _path_from_url(os.fspath(value))
    if not raw_path:
        return None
    candidate = Path(raw_path)
    try:
        resolved = candidate.resolve()
    except OSError:
        return None
    if not resolved.is_file():
        return None
    for root in _allowed_media_roots():
        try:
            resolved.relative_to(root)
            return str(resolved)
        except ValueError:
            continue
    return None


def _restore_media_value(spec: WorkspaceComponentSpec, value: Any) -> Any:
    if spec.kind == "video" and isinstance(value, dict) and "video" in value:
        video_path = _safe_existing_media_path(value.get("video"))
        if not video_path:
            return None
        subtitle_path = _safe_existing_media_path(value.get("subtitles"))
        return (video_path, subtitle_path) if subtitle_path else video_path

    if isinstance(value, list):
        paths = [path for item in value if (path := _safe_existing_media_path(item))]
        if not paths:
            return None
        if spec.kind == "file" and getattr(spec.component, "file_count", "single") != "single":
            return paths
        return paths[0]

    return _safe_existing_media_path(value)


def _restore_component_value(spec: WorkspaceComponentSpec, entry: Any) -> Any:
    if not isinstance(entry, dict) or entry.get("signature") != spec.signature or "value" not in entry:
        return gr.skip()
    value = entry.get("value")

    if spec.kind == "textbox":
        return gr.update(value=value)
    if spec.kind in {"number", "slider"}:
        number = _bounded_number(spec.component, value)
        return gr.skip() if number is None and value not in (None, "") else gr.update(value=number)
    if spec.kind == "checkbox":
        if isinstance(value, str):
            value = value.strip().lower() in {"1", "true", "yes", "on"}
        return gr.update(value=bool(value))
    if spec.kind in {"dropdown", "radio"}:
        if value is None or value == "":
            return gr.update(value=None)
        choices = _choice_values(spec.component)
        matched, normalized = _matching_choice(value, choices)
        if matched or getattr(spec.component, "allow_custom_value", False):
            return gr.update(value=normalized)
        return gr.skip()
    if spec.kind == "checkboxgroup":
        if not isinstance(value, list):
            return gr.skip()
        choices = _choice_values(spec.component)
        restored = []
        for item in value:
            matched, normalized = _matching_choice(item, choices)
            if matched:
                restored.append(normalized)
        return gr.update(value=restored)
    if spec.kind in {"image", "video", "audio", "file"}:
        media_value = _restore_media_value(spec, value)
        return gr.update(value=media_value) if media_value is not None else gr.skip()
    return gr.skip()


def restore_workspace_snapshot(
    snapshot: Any,
    owner: str,
    specs: tuple[WorkspaceComponentSpec, ...],
) -> tuple[Any, ...]:
    if not isinstance(snapshot, dict) or snapshot.get("schema") != WORKSPACE_SCHEMA_VERSION:
        return tuple(gr.skip() for _ in specs)
    workspaces = snapshot.get("workspaces")
    workspace = workspaces.get(owner) if isinstance(workspaces, dict) else None
    values = workspace.get("values") if isinstance(workspace, dict) else None
    if not isinstance(values, dict):
        return tuple(gr.skip() for _ in specs)
    return tuple(_restore_component_value(spec, values.get(spec.key)) for spec in specs)


def install_workspace_recovery(blocks: Any, after_event: Any | None = None) -> WorkspaceRecoveryHandles:
    specs = collect_workspace_components(blocks)
    browser_state = gr.BrowserState(
        default_value={"schema": WORKSPACE_SCHEMA_VERSION, "workspaces": {}},
        storage_key=WORKSPACE_STORAGE_KEY,
        secret=WORKSPACE_STORAGE_SECRET,
    )
    owner_field = gr.Textbox(value="local", visible="hidden", elem_id="workspace_recovery_owner")

    for spec in specs:
        save_event = spec.component.change if spec.kind == "file" else spec.component.input
        save_event(
            fn=None,
            inputs=[browser_state, spec.component],
            outputs=browser_state,
            js=_workspace_save_js(spec),
            queue=False,
            show_progress="hidden",
            api_visibility="private",
            key=f"workspace-save-{spec.key}",
        )

    def restore(snapshot: Any, owner: str) -> tuple[Any, ...]:
        resolved_owner = str(owner or "local")
        updates = restore_workspace_snapshot(snapshot, resolved_owner, specs)
        workspaces = snapshot.get("workspaces") if isinstance(snapshot, dict) else None
        workspace = workspaces.get(resolved_owner) if isinstance(workspaces, dict) else None
        values = workspace.get("values") if isinstance(workspace, dict) else None
        if isinstance(values, dict) and values:
            logger.info(
                "[UI-TRACE] workspace_recovery.restore_values | owner=%s, stored=%d, components=%d",
                resolved_owner,
                len(values),
                len(specs),
            )
        return updates

    restore_kwargs = dict(
        fn=restore,
        inputs=[browser_state, owner_field],
        outputs=[spec.component for spec in specs],
        js="""
(state, owner) => window.SimpAIWorkspaceRecovery?.prepareRestoreRequest?.(state, owner)
    || [state, owner || "local"]
""".strip(),
        queue=False,
        show_progress="hidden",
        api_visibility="private",
        key="workspace-restore-values",
    )
    restore_event = after_event.then(**restore_kwargs) if after_event is not None else blocks.load(**restore_kwargs)
    restore_event.then(
        fn=None,
        js="() => { window.SimpAIWorkspaceRecovery?.finishRestore(); }",
        queue=False,
        show_progress="hidden",
        api_visibility="private",
        key="workspace-restore-finished",
    )

    logger.info("Workspace recovery registered for %d components", len(specs))
    return WorkspaceRecoveryHandles(
        browser_state=browser_state,
        owner_field=owner_field,
        components=specs,
    )
