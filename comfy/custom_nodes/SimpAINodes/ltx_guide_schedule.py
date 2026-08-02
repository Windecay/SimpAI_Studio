import json
import math
from collections.abc import Sequence


DEFAULT_MIDDLE_GUIDES = (
    {"frame_idx": 0, "strength": 0.7},
    {"frame_idx": 0, "strength": 0.7},
    {"frame_idx": 0, "strength": 0.7},
)

DEFAULT_EXTENT_GUIDES = tuple(
    {"frame_idx": 0, "strength": 0.7}
    for _index in range(5)
)


def scene_image_source_present(value) -> bool:
    text = str(value or "").strip().lower()
    if text in {"", "none", "null"}:
        return False

    filename = text.replace("\\", "/").rsplit("/", 1)[-1].split(" [", 1)[0]
    return filename != "welcome.png"


def _coerce_number(value, default: float, minimum: float, maximum: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(number):
        return default
    return min(maximum, max(minimum, number))


def _coerce_frame_idx(value, default: int = 0) -> int:
    return int(round(_coerce_number(value, default, 0, 9999)))


def normalize_ltx_context_frames(value, default: int = 17) -> int:
    requested = int(round(_coerce_number(value, default, 1, 257)))
    return min(257, max(1, ((requested + 3) // 8) * 8 + 1))


def parse_ltx_guide_config(value) -> dict:
    if isinstance(value, dict):
        data = value
    elif isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
        except (TypeError, ValueError, json.JSONDecodeError):
            parsed = {}
        data = parsed if isinstance(parsed, dict) else {}
    else:
        data = {}

    middle_value = data.get("middle")
    middle_items = middle_value if isinstance(middle_value, list) else []
    middle = []
    for index, defaults in enumerate(DEFAULT_MIDDLE_GUIDES, start=1):
        item = middle_items[index - 1] if index <= len(middle_items) else {}
        item = item if isinstance(item, dict) else {}
        frame_idx = item.get("frame_idx", data.get(f"middle_frame_idx_{index}", defaults["frame_idx"]))
        strength = item.get("strength", data.get(f"middle_strength_{index}", defaults["strength"]))
        middle.append(
            {
                "frame_idx": _coerce_frame_idx(frame_idx, defaults["frame_idx"]),
                "strength": _coerce_number(strength, defaults["strength"], 0.0, 10.0),
            }
        )

    return {
        "version": 1,
        "first_strength": _coerce_number(data.get("first_strength"), 1.0, 0.0, 10.0),
        "last_strength": _coerce_number(data.get("last_strength"), 1.0, 0.0, 10.0),
        "middle": middle,
    }


def parse_ltx_extent_config(value) -> dict:
    if isinstance(value, dict):
        data = value
    elif isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
        except (TypeError, ValueError, json.JSONDecodeError):
            parsed = {}
        data = parsed if isinstance(parsed, dict) else {}
    else:
        data = {}

    legacy_middle = data.get("middle") if isinstance(data.get("middle"), list) else []
    legacy_strengths = [
        data.get("first_strength", 0.7),
        *[
            item.get("strength", 0.7) if isinstance(item, dict) else 0.7
            for item in legacy_middle[:3]
        ],
        data.get("last_strength", 0.7),
    ]
    legacy_strengths.extend([0.7] * (5 - len(legacy_strengths)))
    legacy_indices = [
        0,
        *[
            item.get("frame_idx", 0) if isinstance(item, dict) else 0
            for item in legacy_middle[:3]
        ],
        0,
    ]
    legacy_indices.extend([0] * (5 - len(legacy_indices)))

    guide_items = data.get("guides") if isinstance(data.get("guides"), list) else []
    guides = []
    for index, defaults in enumerate(DEFAULT_EXTENT_GUIDES):
        item = guide_items[index] if index < len(guide_items) else {}
        item = item if isinstance(item, dict) else {}
        guides.append(
            {
                "frame_idx": _coerce_frame_idx(
                    item.get("frame_idx", legacy_indices[index]),
                    defaults["frame_idx"],
                ),
                "strength": _coerce_number(
                    item.get("strength", legacy_strengths[index]),
                    defaults["strength"],
                    0.0,
                    10.0,
                ),
            }
        )

    return {
        "version": 1,
        "mode": "video_extent",
        "context_frames": normalize_ltx_context_frames(data.get("context_frames"), 17),
        "source_strength": _coerce_number(data.get("source_strength"), 1.0, 0.0, 10.0),
        "guides": guides,
    }


def resolve_ltx_guide_schedule(
    image_count: int,
    total_frames: int,
    middle_frame_indices: Sequence[int] | None = None,
    middle_strengths: Sequence[float] | None = None,
    first_strength: float = 1.0,
    last_strength: float = 1.0,
    guide_config=None,
) -> list[tuple[int, float]]:
    image_count = int(image_count)
    total_frames = int(total_frames)
    if not 1 <= image_count <= 5:
        raise ValueError("引导图片数量必须为 1 到 5。 / Guide image count must be between 1 and 5.")
    if total_frames < 1:
        raise ValueError("视频帧数必须大于 0。 / Video frame count must be positive.")

    if guide_config is not None:
        parsed_config = parse_ltx_guide_config(guide_config)
        first_strength = parsed_config["first_strength"]
        last_strength = parsed_config["last_strength"]
        middle_frame_indices = [item["frame_idx"] for item in parsed_config["middle"]]
        middle_strengths = [item["strength"] for item in parsed_config["middle"]]

    def checked_strength(value) -> float:
        strength = float(value)
        if not math.isfinite(strength) or not 0.0 <= strength <= 10.0:
            raise ValueError("引导帧权重必须在 0 到 10 之间。 / Guide strength must be between 0 and 10.")
        return strength

    first_strength = checked_strength(first_strength)
    if image_count == 1:
        return [(0, first_strength)]
    if total_frames < 2:
        raise ValueError("视频帧数不足，无法安排多个引导帧。 / The video is too short for multiple guide frames.")

    last_strength = checked_strength(last_strength)
    if middle_frame_indices is None:
        middle_frame_indices = (0, 0, 0)
    if middle_strengths is None:
        middle_strengths = (0.7, 0.7, 0.7)

    requested_indices = list(middle_frame_indices[:3])
    requested_indices.extend([0] * (3 - len(requested_indices)))
    requested_strengths = list(middle_strengths[:3])
    requested_strengths.extend([0.7] * (3 - len(requested_strengths)))

    last_frame = total_frames - 1
    middle_count = image_count - 2
    resolved_indices = [None] * middle_count
    fixed_points = [(0, 0)]
    for middle_index in range(middle_count):
        requested = int(requested_indices[middle_index] or 0)
        if requested:
            fixed_points.append((middle_index + 1, requested))
            resolved_indices[middle_index] = requested
    fixed_points.append((image_count - 1, last_frame))

    for (left_position, left_frame), (right_position, right_frame) in zip(fixed_points, fixed_points[1:]):
        position_span = right_position - left_position
        if right_frame - left_frame < position_span:
            raise ValueError(
                "中间 frame idx 必须大于前一帧并小于尾帧。 / "
                "Each middle frame index must be after the previous guide and before the last frame."
            )
        for offset in range(1, position_span):
            position = left_position + offset
            resolved_indices[position - 1] = round(
                left_frame + (right_frame - left_frame) * offset / position_span
            )

    schedule = [(0, first_strength)]
    for middle_index, frame_idx in enumerate(resolved_indices):
        strength = checked_strength(requested_strengths[middle_index])
        schedule.append((frame_idx, strength))

    schedule.append((last_frame, last_strength))
    return schedule


def resolve_ltx_extent_guide_schedule(
    image_count: int,
    continuation_start_frame: int,
    total_frames: int,
    guide_frame_indices: Sequence[int] | None = None,
    guide_strengths: Sequence[float] | None = None,
    guide_config=None,
) -> list[tuple[int, float]]:
    image_count = int(image_count)
    continuation_start_frame = int(continuation_start_frame)
    total_frames = int(total_frames)
    if not 0 <= image_count <= 5:
        raise ValueError("续写引导图片数量必须为 0 到 5。 / Extent guide image count must be between 0 and 5.")
    if image_count == 0:
        return []
    if total_frames < 2:
        raise ValueError("视频帧数不足，无法安排续写引导帧。 / The video is too short for extent guides.")

    last_frame = total_frames - 1
    if not 0 <= continuation_start_frame < last_frame:
        raise ValueError(
            "续写起点必须位于目标视频范围内。 / The continuation start must be inside the target video."
        )
    continuation_span = last_frame - continuation_start_frame
    if continuation_span < image_count:
        raise ValueError(
            "续写区间帧数不足，无法安排全部引导图片。 / "
            "The continuation range is too short for all guide images."
        )

    if guide_config is not None:
        parsed_config = parse_ltx_extent_config(guide_config)
        guide_frame_indices = [item["frame_idx"] for item in parsed_config["guides"]]
        guide_strengths = [item["strength"] for item in parsed_config["guides"]]

    if guide_frame_indices is None:
        guide_frame_indices = (0, 0, 0, 0, 0)
    if guide_strengths is None:
        guide_strengths = (0.7, 0.7, 0.7, 0.7, 0.7)

    requested_indices = list(guide_frame_indices[:5])
    requested_indices.extend([0] * (5 - len(requested_indices)))
    requested_strengths = list(guide_strengths[:5])
    requested_strengths.extend([0.7] * (5 - len(requested_strengths)))

    resolved_indices = [None] * image_count
    fixed_points = [(0, 0)]
    for guide_index in range(image_count - 1):
        requested = int(requested_indices[guide_index] or 0)
        if requested:
            fixed_points.append((guide_index + 1, requested))
            resolved_indices[guide_index] = requested
    resolved_indices[-1] = continuation_span
    fixed_points.append((image_count, continuation_span))

    for (left_position, left_frame), (right_position, right_frame) in zip(fixed_points, fixed_points[1:]):
        position_span = right_position - left_position
        if right_frame - left_frame < position_span:
            raise ValueError(
                "续写 frame idx 必须依次增大并小于续写尾帧。 / "
                "Each extent frame index must be after the previous guide and before the continuation end."
            )
        for offset in range(1, position_span):
            position = left_position + offset
            resolved_indices[position - 1] = round(
                left_frame + (right_frame - left_frame) * offset / position_span
            )

    schedule = []
    for guide_index, relative_frame in enumerate(resolved_indices):
        strength = float(requested_strengths[guide_index])
        if not math.isfinite(strength) or not 0.0 <= strength <= 10.0:
            raise ValueError("引导帧权重必须在 0 到 10 之间。 / Guide strength must be between 0 and 10.")
        schedule.append((continuation_start_frame + relative_frame, strength))
    return schedule
