import copy
import hashlib
import json
import math
import os
import re
import threading
import time
import uuid
from functools import lru_cache
from pathlib import Path


SCHEMA = "simpai.h3_director.v1"
META_INDEX = 14
MODES = ("text", "first_frame", "first_last", "reference", "continue")
VIDEO_PRESETS = {
    f"MiniMax-H3({name})"
    for name in ("T2V", "I2V", "R2V", "R2C", "Avatar", "Motion", "Transition",
                 "Edit", "Swap", "Swap-SAM3", "Region", "Upscale")
}
ROUTES = {
    "text": ("T2V", "minimax_h3_t2va"),
    "first_frame": ("I2V", "minimax_h3_frame_anchor"),
    "first_last": ("I2V", "minimax_h3_frame_anchor"),
    "reference": ("R2V", "minimax_h3_ref2va"),
    "continue": ("R2C", "minimax_h3_ref2va"),
    "transition": ("Transition", "minimax_h3_ref2va"),
}
CAPABILITY = {
    "h3_unified": True,
    "director_supported": True,
    "image_policy": "optional", "audio_policy": "optional", "video_policy": "optional",
    "min_images": 0, "max_images": 9, "max_audios": 3, "max_videos": 3,
    "image_modes": ["none", "first_frame", "first_last", "reference_set"],
    "video_modes": ["explicit", "previous_segment"],
    "chain_output": "timeline", "requires_sequential": True, "mixed_segments": True,
    "duration_strategy": "shot", "segment_duration_param": "scene_video_duration",
    "audio_output": "generated", "min_segment_duration": 0.2, "max_segment_duration": 30,
    "timeline_format": "None", "source": "h3_unified",
}
_LOCKS = {}
_RENDER_CANCEL = {}
_LOCKS_GUARD = threading.Lock()
ROOT = Path(__file__).resolve().parents[1]


def text(state, en, cn):
    lang = str((state or {}).get("__lang") or "").lower()
    return cn if lang.startswith(("cn", "zh")) else en


def is_family(state):
    state = state if isinstance(state, dict) else {}
    preset = str(state.get("__preset") or state.get("preset") or "").removesuffix(".json")
    default_engine = state.get("default_engine")
    engine = state.get("engine_type") or (default_engine.get("engine_type") if isinstance(default_engine, dict) else "")
    return preset in VIDEO_PRESETS and engine != "image"


def is_runtime(runtime):
    return isinstance(runtime, dict) and runtime.get("schema") == SCHEMA


def default_mode(state, image_count=0):
    preset = str((state or {}).get("__preset") or "")
    if "(R2V)" in preset:
        return "reference"
    if "(R2C)" in preset:
        return "continue"
    if "(I2V)" in preset:
        return "first_last" if image_count >= 2 else "first_frame"
    return "text"


def identifier(value):
    value = str(value or "")
    return value if re.fullmatch(r"[A-Za-z0-9_-]{1,96}", value) else uuid.uuid4().hex


def number(value, default):
    try:
        result = float(value)
        return result if math.isfinite(result) else default
    except (TypeError, ValueError):
        return default


@lru_cache(maxsize=5)
def route_preset(name):
    return json.loads((ROOT / "presets" / f"MiniMax-H3({name}).json").read_text(encoding="utf-8"))


def route(segment):
    mode = segment.get("mode")
    if mode not in ROUTES:
        raise ValueError("Unknown H3 director mode")
    name, compiler = ROUTES[mode]
    profile = segment.get("sampling_profile", "Basic")
    if mode == "transition" and profile != "Basic":
        raise ValueError("H3 transitions support Basic sampling only")
    if profile not in ("Basic", "2 pass"):
        raise ValueError("Unknown H3 sampling profile")
    scene = route_preset(name)["default_engine"]["scene_frontend"]
    return name, profile, scene["task_method"][profile], compiler


def route_backend(segment, width, height):
    name, profile, method, _compiler = route(segment)
    scene = route_preset(name)["default_engine"]["scene_frontend"]
    backend = {
        "backend_engine": "Comfy", "engine_type": "video",
        "task_method": f"scene_{method}", "scene_frontend": scene["version"],
        "scene_theme": profile, "scene_aspect_ratio": f"{int(width)}×{int(height)}",
        "scene_video_duration": round(segment["end"] - segment["start"], 3),
        "scene_image_number": 1, "scene_additional_prompt": "",
        "scene_steps": scene["overwrite_step"][profile],
    }
    for index in range(1, 11):
        suffix = "" if index == 1 else str(index)
        value = scene.get(f"var_number{suffix}")
        backend[f"scene_var_number{suffix}"] = value.get(profile) if isinstance(value, dict) else value
    for index in range(1, 5):
        value = scene.get(f"switch_option{index}")
        backend[f"scene_switch_option{index}"] = value.get(profile) if isinstance(value, dict) else value
    if segment["mode"] in ("continue", "transition"):
        backend["scene_switch_option1"] = False
    if segment["mode"] == "transition":
        backend["scene_var_number5"] = segment["overlap"]
    return backend


def initial_backend(width=864, height=480):
    return route_backend({"mode": "text", "start": 0, "end": 5}, width, height)


def _refs(value, kind):
    if isinstance(value, str):
        try:
            value = json.loads(value) if value.startswith("[") else re.split(r"[,;|\n]+", value)
        except json.JSONDecodeError:
            value = []
    if not isinstance(value, list):
        value = [value] if value else []
    refs = []
    previous = "previous_segment_last_frame" if kind == "image" else "previous_segment"
    for item in value:
        ref = str(item.get("source_ref") or "") if isinstance(item, dict) else str(item or "")
        if (re.fullmatch(rf"{kind}_\d+", ref) or ref == previous) and ref not in refs:
            refs.append(ref)
    return refs


def build_runtime(rows, width, height, fps, duration, media_sources, state, editor=None):
    editor = editor if isinstance(editor, dict) else {}
    project_id = identifier(editor.get("project_id") or (state or {}).get("__h3_director_project_id"))
    if isinstance(state, dict):
        state["__h3_director_project_id"] = project_id
    segments = []
    transitions = []
    previous_end = 0
    for index, raw in enumerate(rows):
        if isinstance(raw, dict):
            meta = raw
            images = _refs(raw.get("images"), "image")
            audios = _refs(raw.get("audio"), "audio")
            videos = _refs(raw.get("video"), "video")
            start, end, prompt = raw.get("start"), raw.get("end"), raw.get("prompt", "")
        elif isinstance(raw, (list, tuple)):
            cells = list(raw) + [""] * 15
            meta = cells[META_INDEX] if isinstance(cells[META_INDEX], dict) else {}
            images = _refs(cells[3:12], "image")
            audios, videos = _refs(cells[12], "audio"), _refs(cells[13], "video")
            start, end, prompt = cells[0], cells[1], cells[2]
        else:
            continue
        start = number(start, previous_end)
        end = number(end, start + 5)
        previous_end = end
        mode = str(meta.get("mode") or default_mode(state, len(images)))
        segment_id = identifier(meta.get("id") or f"shot_{index + 1}")
        uses_source = "previous_segment_last_frame" in images or "previous_segment" in videos
        source_id = str(meta.get("source_segment_id") or "") if uses_source else ""
        if not source_id and uses_source:
            source_id = segments[-1]["id"] if segments else ""
        roles = {
            "first_frame": ["first_frame"], "first_last": ["first_frame", "last_frame"]
        }.get(mode, [])
        segment = {
            "id": segment_id, "start": start, "end": end, "unit": "seconds",
            "mode": mode, "sampling_profile": meta.get("sampling_profile") or "Basic",
            "source_segment_id": source_id, "included": meta.get("included") is not False,
            "prompt": str(prompt or "").strip(),
            "type": {"text": "t2v", "first_frame": "flf", "first_last": "fmlf"}.get(mode, "ref"),
            "images": [{"source_ref": ref, "role": roles[i] if i < len(roles) else "reference"} for i, ref in enumerate(images)],
            "audio": [{"source_ref": ref, "role": "reference"} for ref in audios],
            "video": [{"source_ref": ref, "role": "continuation_source" if mode == "continue" else "reference"} for ref in videos],
        }
        if mode in MODES and segment["sampling_profile"] in ("Basic", "2 pass"):
            _, _, segment["task_method"], segment["prompt_compiler"] = route(segment)
        segments.append(segment)
        raw_transition = meta.get("transition")
        if isinstance(raw_transition, dict):
            transition_duration = number(raw_transition.get("duration"), 1)
            transitions.append({
                "id": identifier(raw_transition.get("id") or "transition_" + segment_id),
                "mode": "transition", "sampling_profile": "Basic",
                "task_method": "minimax_h3_transition_r2v_cn", "prompt_compiler": "minimax_h3_ref2va",
                "from_segment_id": segment_id,
                "to_segment_id": str(raw_transition.get("to_segment_id") or ""),
                "enabled": raw_transition.get("enabled") is True,
                "start": 0, "end": transition_duration,
                "duration": transition_duration, "overlap": number(raw_transition.get("overlap"), 0.75),
                "prompt": str(raw_transition.get("prompt") or "").strip(),
                "images": [{"source_ref": ref, "role": "reference"}
                           for ref in _refs(raw_transition.get("images"), "image")],
                "audio": [{"source_ref": ref, "role": "reference"}
                          for ref in _refs(raw_transition.get("audio"), "audio")],
                "video": [],
            })
    if any(item["enabled"] for item in transitions):
        fps = 24
    return {
        "schema": SCHEMA, "project_id": project_id, "segments": segments, "transitions": transitions,
        "width": max(64, min(4096, int(number(width, 1280)))),
        "height": max(64, min(4096, int(number(height, 720)))),
        "fps": max(1, min(120, number(fps, 24))), "duration": number(duration, previous_end),
        "director_capability": copy.deepcopy(CAPABILITY), "compose_timeline": False,
        "active_segment_index": int(number(editor.get("active_index"), 0)),
        "target_preset": (state or {}).get("__preset"), "target_theme": (state or {}).get("scene_theme"),
        "media_sources": copy.deepcopy(media_sources or {}),
        "prompt_override": " | ".join(s["prompt"] for s in segments if s["prompt"]),
    }


def enabled_transitions(runtime):
    return [item for item in runtime.get("transitions", []) if item.get("enabled")]


def _transition_canvas_source(runtime, transition):
    incoming = {item["to_segment_id"]: item["from_segment_id"] for item in enabled_transitions(runtime)}
    source_id = transition["from_segment_id"]
    visited = set()
    while source_id in incoming and source_id not in visited:
        visited.add(source_id)
        source_id = incoming[source_id]
    return source_id


def transition_canvas(runtime, project, transition):
    version = project.selected(_transition_canvas_source(runtime, transition))
    asset = version.get("asset", {}) if version else {}
    return {key: max(16, int(number(asset.get(key), 0) or runtime[key])) for key in ("width", "height")}


def generation_items(runtime):
    return runtime["segments"] + enabled_transitions(runtime)


def transition_layout(runtime, transition):
    by_id = {s["id"]: s for s in runtime["segments"]}
    counts = [max(1, round((by_id[transition[key]]["end"] - by_id[transition[key]]["start"]) * 24))
              for key in ("from_segment_id", "to_segment_id")]
    context = max(2, round(transition["overlap"] * 24))
    return {"left": min(counts[0], context), "right": min(counts[1], context),
            "gap": max(1, round(transition["duration"] * 24)), "fps": 24}


def transition_errors(runtime, state, target_ids=None):
    errors = []
    chosen = [s for s in runtime["segments"] if s.get("included", True)]
    pairs = {(a["id"], b["id"]) for a, b in zip(chosen, chosen[1:])}
    by_id = {s["id"]: s for s in chosen}
    contexts = {}
    occupied = set()
    for item in enabled_transitions(runtime):
        pair = item["from_segment_id"], item["to_segment_id"]
        error = ""
        if pair not in pairs:
            error = text(state, "Transition sources must be adjacent included shots.",
                         "转场来源须为相邻且参与拼接的两段，请恢复原顺序或关闭该转场。")
        elif pair in occupied:
            error = text(state, "Duplicate transitions between the same shots.", "同一对分镜只能启用一个转场。")
        elif abs(by_id[pair[0]]["end"] - by_id[pair[1]]["start"]) > 0.001:
            error = text(state, "Remove the blank interval before enabling a transition.",
                         "两侧分镜之间有空白时段，请调整时间后启用转场。")
        elif not 0.2 <= item["duration"] <= 30 or not 0.1 <= item["overlap"] <= 3:
            error = text(state, "Transition duration must be 0.2-30s and context 0.1-3s.",
                         "新增过渡时长须为 0.2–30 秒，两侧上下文须为 0.1–3 秒。")
        elif not item["prompt"]:
            error = text(state, "The transition prompt is empty.", "转场提示词为空。")
        elif (len(item["images"]) > 9 or len(item["audio"]) > 3
              or any(ref["source_ref"].startswith("previous_segment") for ref in item["images"] + item["audio"])):
            error = text(state, "Transitions accept up to 9 pictures and 3 standalone audio references.",
                         "转场最多引用 9 张图片和 3 个独立音频，不能使用上一段尾帧作为图片引用。")
        if error:
            if target_ids is None or item["id"] in target_ids:
                errors.append(error)
            continue
        occupied.add(pair)
        layout = transition_layout(runtime, item)
        for source, side in ((pair[0], "left"), (pair[1], "right")):
            contexts.setdefault(source, []).append((item["id"], layout[side]))
    for source, spans in contexts.items():
        count = max(1, round((by_id[source]["end"] - by_id[source]["start"]) * 24))
        if sum(span for _id, span in spans) > count and (
            target_ids is None or any(_id in target_ids for _id, _span in spans)
        ):
            errors.append(text(state, "A short shot's incoming and outgoing transition contexts overlap.",
                               "短分镜的前后转场上下文重叠，请减小上下文时长或关闭其中一个转场。"))
    return errors


def validation(runtime, state, target_ids=None):
    errors = []
    segments = runtime.get("segments", [])
    ids = [s["id"] for s in segments]
    all_ids = ids + [item["id"] for item in runtime.get("transitions", [])]
    if len(set(all_ids)) != len(all_ids):
        errors.append(text(state, "Duplicate shot IDs.", "分镜编号重复。"))
    if not segments:
        errors.append(text(state, "Director has no shots.", "导演台没有分镜。"))
    for index, segment in enumerate(segments):
        if target_ids is not None and segment["id"] not in target_ids:
            continue
        mode = segment.get("mode")
        images, audios, videos = (segment.get(k, []) for k in ("images", "audio", "video"))
        error = ""
        if mode not in MODES or segment.get("sampling_profile") not in ("Basic", "2 pass"):
            error = text(state, "Invalid generation mode.", "生成模式无效。")
        elif not segment.get("prompt"):
            error = text(state, "The shot prompt is empty.", "分镜提示词为空。")
        elif not 0.2 <= segment["end"] - segment["start"] <= 30 or segment["start"] < 0:
            error = text(state, "Shot duration must be 0.2-30 seconds.", "分镜时长须为 0.2–30 秒。")
        elif mode == "text" and (images or audios or videos):
            error = text(state, "Text mode does not use media bindings.", "文生模式不使用素材绑定，请取消本段的素材选择。")
        elif mode in ("first_frame", "first_last") and (len(images) != (1 if mode == "first_frame" else 2) or audios or videos):
            error = text(state, "Select the required frame images only.", "请仅选择所需的首帧或首尾帧图片。")
        elif len(images) > 9 or len(audios) > 3 or len(videos) > 3:
            error = text(state, "Reference limit is 9 pictures, 3 videos and 3 audio clips.", "每段最多选择 9 图、3 视频和 3 个独立音频。")
        elif mode == "reference" and not (images or audios or videos):
            error = text(state, "Reference mode requires media.", "多模态参考模式需要选择素材。")
        elif mode == "continue" and (len(videos) != 1 or audios):
            error = text(state, "Continuation requires one source video and no standalone audio.", "视频续接需要一个源视频，不使用独立音频。")
        elif mode not in ("reference", "continue") and any(v["source_ref"] == "previous_segment" for v in videos):
            error = text(state, "A source video requires Reference or Continue mode.", "引用来源视频需要选择多模态参考或视频续接模式。")
        elif any(v["source_ref"] == "previous_segment_last_frame" for v in images) and (
            mode not in ("first_frame", "first_last") or images[0]["source_ref"] != "previous_segment_last_frame"
        ):
            error = text(state, "Previous last frame must be the first-frame input.", "上一段尾帧只能作为本段首帧。")
        elif segment.get("source_segment_id") and segment["source_segment_id"] not in ids[:index]:
            error = text(state, "The source shot must exist before this shot.", "来源分镜必须存在，并位于本段之前。")
        elif any(v["source_ref"].startswith("previous_segment") for v in images + videos) and not segment.get("source_segment_id"):
            error = text(state, "No preceding shot result is available.", "本段没有可引用的前置分镜。")
        if error:
            errors.append(f"{text(state, 'Shot', '分镜')} {index + 1}: {error}")
    errors.extend(transition_errors(runtime, state, target_ids))
    return {"ok": not errors, "errors": errors, "warnings": []}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")).hexdigest()


def request_signature(segment, runtime):
    media = runtime.get("media_sources", {})
    refs = [item["source_ref"] for key in ("images", "audio", "video") for item in segment.get(key, [])]
    request = {
        "mode": segment["mode"], "prompt": segment["prompt"],
        "profile": segment["sampling_profile"], "duration": round(segment["end"] - segment["start"], 3),
        "images": segment["images"], "audio": segment["audio"], "video": segment["video"],
        "source_segment_id": segment.get("source_segment_id"),
        "media": {ref: media.get(ref) for ref in refs if not ref.startswith("previous_segment")},
        "generation_settings": runtime.get("generation_settings", {}),
    }
    if segment["mode"] == "transition":
        by_id = {s["id"]: s for s in runtime["segments"]}
        request["transition"] = {
            "from": segment["from_segment_id"], "to": segment["to_segment_id"],
            "overlap": segment["overlap"],
            "source_geometry": "native_connected_canvas.v1",
            "source_durations": [
                round(by_id[sid]["end"] - by_id[sid]["start"], 6) if sid in by_id else None
                for sid in (segment["from_segment_id"], segment["to_segment_id"])
            ],
            "output": {key: runtime[key] for key in ("width", "height", "fps")},
        }
    if any(ref.startswith("previous_segment") for ref in refs):
        request["source_output"] = {key: runtime[key] for key in ("width", "height", "fps")}
    return digest(request)


class Project:
    def __init__(self, project_id, state):
        from modules import canvas_workbench_assets as assets

        self.id = identifier(project_id)
        self.state = state
        root, owner = assets._asset_root("h3-director-" + self.id, state)
        self.root = root
        self.path = os.path.join(root, "director-project.json")
        with _LOCKS_GUARD:
            self.lock = _LOCKS.setdefault((str(owner), self.id), threading.Lock())
            self.render_cancel = _RENDER_CANCEL.setdefault((str(owner), self.id), threading.Event())
        self.data = {"schema": SCHEMA, "project_id": self.id, "shots": {}, "preview": {}, "exports": []}
        if os.path.isfile(self.path):
            with open(self.path, encoding="utf-8") as handle:
                saved = json.load(handle)
            if saved.get("schema") != SCHEMA or saved.get("project_id") != self.id:
                raise ValueError("Invalid H3 project record")
            self.data = saved

    def save(self):
        os.makedirs(self.root, exist_ok=True)
        temp = self.path + "." + uuid.uuid4().hex + ".tmp"
        try:
            with open(temp, "w", encoding="utf-8") as handle:
                json.dump(self.data, handle, ensure_ascii=False, allow_nan=False)
            os.replace(temp, self.path)
        finally:
            if os.path.isfile(temp):
                os.remove(temp)

    def shot(self, segment_id):
        return self.data["shots"].setdefault(segment_id, {"versions": [], "selected": "", "status": "pending"})

    def selected(self, segment_id):
        shot = self.shot(segment_id)
        return next((v for v in shot["versions"] if v["id"] == shot["selected"]), None)

    def available(self, segment_id):
        selected = self.selected(segment_id)
        return bool(selected and os.path.isfile(selected["asset"]["path"]))

    def dependencies(self, segment, working_versions=None):
        if segment.get("mode") == "transition":
            dependencies = {}
            for sid in (segment["from_segment_id"], segment["to_segment_id"]):
                version = self.selected(sid)
                if not version or not self.available(sid):
                    raise ValueError(text(self.state, "Generate and select both transition source videos first.",
                                          "请先生成并采用转场两侧的视频。"))
                dependencies[sid] = version["id"]
            return dependencies
        refs = [item["source_ref"] for key in ("images", "video") for item in segment.get(key, [])]
        if not any(ref.startswith("previous_segment") for ref in refs):
            return {}
        source = segment.get("source_segment_id")
        version = ((working_versions or {}).get(source) or self.selected(source)) if source else None
        if not version or not os.path.isfile(version["asset"]["path"]):
            raise ValueError(text(self.state, "The source shot has no selected result.", "来源分镜没有已选结果，请先生成并选择来源版本。"))
        return {source: version["id"]}

    def stale_key(self, segment, runtime, visited=None, version=None):
        selected = version if version is not None else self.selected(segment["id"])
        if not selected or not os.path.isfile(selected["asset"]["path"]):
            return ""
        visited = set(visited or ())
        if segment["id"] in visited:
            return "cycle"
        visited.add(segment["id"])
        changes = []
        signature = request_signature(segment, runtime)
        if selected["request_signature"] != signature:
            changes.append(("parameters", signature))
        if segment["mode"] == "transition":
            saved_canvas = selected.get("parameters", {}).get("director_transition", {}).get("source_canvas")
            canvas = transition_canvas(runtime, self, segment)
            if saved_canvas and saved_canvas != canvas:
                changes.append(("source_canvas", canvas))
        by_id = {s["id"]: s for s in generation_items(runtime)}
        for source, version in selected.get("dependencies", {}).items():
            current = self.selected(source)
            if source not in by_id or not current or current["id"] != version:
                changes.append((source, current["id"] if current else "missing"))
            else:
                source_key = self.stale_key(by_id[source], runtime, visited)
                if segment["mode"] == "transition" and self.shot(source).get("acknowledged") == source_key:
                    source_key = ""
                if source_key:
                    changes.append((source, source_key))
        return digest(changes) if changes else ""

    def stale(self, segment, runtime):
        key = self.stale_key(segment, runtime)
        return bool(key and self.shot(segment["id"]).get("acknowledged") != key)

    def append(self, segment, runtime, path, parameters, dependencies):
        from modules import canvas_workbench_assets as assets

        asset = assets.register_existing_file_asset(
            path, "h3-director-" + self.id, self.state, node_id=segment["id"],
            role="director_transition" if segment["mode"] == "transition" else "director_shot",
            metadata={"mime": "video/mp4"}, copy_to_assets=True,
        )
        if not asset or not asset.get("copied_to_assets"):
            raise ValueError(text(self.state, "Could not save the shot result.", "无法保存分镜结果。"))
        if segment["mode"] == "transition":
            layout = parameters["director_transition"]["layout"]
            expected = (layout["left"] + layout["gap"] + layout["right"]) / 24
            actual = number(asset.get("duration"), expected)
            if abs(actual - expected) > 0.05 or abs(number(asset.get("fps"), 24) - 24) > 0.01:
                raise ValueError(text(self.state, "The transition output has an unexpected duration or frame rate.",
                                      "转场输出的时长或帧率与请求不符，未采用该结果。"))
            canvas = parameters["director_transition"].get("source_canvas")
            if canvas and any(number(asset.get(key), canvas[key]) != canvas[key] for key in ("width", "height")):
                raise ValueError(text(self.state, "The transition output does not match its source canvas.",
                                      "转场输出尺寸与来源画幅不一致，未采用该结果。"))
        version = {
            "id": uuid.uuid4().hex, "asset": asset, "parameters": parameters,
            "created_at": time.time(),
            "segment": copy.deepcopy(segment),
            "request_signature": request_signature(segment, runtime),
            "dependencies": dependencies,
        }
        shot = self.shot(segment["id"])
        shot["versions"].append(version)
        if not shot["selected"]:
            shot["selected"] = version["id"]
        if shot["selected"] == version["id"]:
            shot.pop("acknowledged", None)
        shot.update(status="ready", error="")
        self.save()
        return version

    def select(self, segment_id, version_id):
        shot = self.shot(segment_id)
        if not any(v["id"] == version_id and os.path.isfile(v["asset"]["path"]) for v in shot["versions"]):
            raise ValueError(text(self.state, "Selected result is missing.", "所选结果不存在。"))
        shot["selected"] = version_id
        shot.pop("acknowledged", None)
        self.save()

    def view(self, runtime):
        from modules import canvas_workbench_assets as assets

        def item_view(segment):
            shot = self.shot(segment["id"])
            return {
                "id": segment["id"], "selected": shot["selected"],
                "status": "stopped" if shot.get("status") == "running" and not self.lock.locked() else shot.get("status"),
                "error": shot.get("error", ""), "stale": self.stale(segment, runtime),
                "versions": [
                    {"id": v["id"], "url": assets._file_preview_url(v["asset"]["path"]),
                     "available": os.path.isfile(v["asset"]["path"]), "duration": v["asset"].get("duration"),
                     "current": not self.stale_key(segment, runtime, version=v)}
                    for v in shot["versions"]
                ],
            }
        rows = [item_view(segment) for segment in runtime["segments"]]
        transitions = []
        for item in runtime.get("transitions", []):
            view = item_view(item)
            errors = transition_errors(runtime, self.state, {item["id"]}) if item["enabled"] else []
            view.update(enabled=item["enabled"], source_ids=[item["from_segment_id"], item["to_segment_id"]],
                        blocked=bool(errors), validation_error=errors[0] if errors else "")
            preview = self.data.get("transition_previews", {}).get(item["id"], {})
            view["preview"] = {
                "url": assets._file_preview_url(preview.get("path", "")),
                "current": preview.get("signature") == transition_preview_signature(runtime, self, item)
                           and os.path.isfile(preview.get("path", "")),
            }
            transitions.append(view)
        preview = self.data.get("preview", {})
        return {"project_id": self.id, "shots": rows, "transitions": transitions, "preview": {
            "url": assets._file_preview_url(preview.get("path", "")),
            "signature": preview.get("signature", ""),
        }}


def transition_preview_signature(runtime, project, item):
    return digest({
        "request": request_signature(item, runtime),
        "canvas": transition_canvas(runtime, project, item),
        "versions": [(sid, project.selected(sid)["id"] if project.available(sid) else "")
                     for sid in (item["from_segment_id"], item["to_segment_id"], item["id"])],
    })


def generation_ids(runtime, project, request):
    action = request.get("action", "missing")
    segments = generation_items(runtime)
    ids = [s["id"] for s in segments]
    target = str(request.get("segment_id") or "")
    if action == "missing":
        return [s["id"] for s in segments if not project.available(s["id"]) or (
            s["mode"] == "transition" and project.stale(s, runtime))]
    if action == "all":
        return ids
    if action not in ("single", "affected") or target not in ids:
        raise ValueError(text(project.state, "Invalid shot generation request.", "分镜生成请求无效。"))
    wanted = {target}
    if action == "affected":
        for segment in segments:
            if segment["mode"] == "transition":
                if (any(segment[key] in wanted for key in ("from_segment_id", "to_segment_id"))
                        or _transition_canvas_source(runtime, segment) in wanted):
                    wanted.add(segment["id"])
                continue
            refs = [v["source_ref"] for key in ("images", "video") for v in segment.get(key, [])]
            if segment.get("source_segment_id") in wanted and any(v.startswith("previous_segment") for v in refs):
                wanted.add(segment["id"])
    return [sid for sid in ids if sid in wanted]
