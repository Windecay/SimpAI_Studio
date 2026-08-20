import math


CANVAS_MULTIPLE = 32
BASE_SHORT_EDGE = 768
MAX_PIXELS = 768 * 1344
FPS = 24

DEFAULT_MAX_IMAGE_LONG_EDGE = 2048
MIN_IMAGE_LONG_EDGE = 512
MIN_VIDEO_LONG_EDGE = 384


def align_frame_count(value):
    value = max(5, int(value))
    while value % 17 != 5:
        value += 1
    return value


def video_latent_t(frame_count):
    frame_count = int(frame_count)
    return 2 if frame_count <= 5 else ((frame_count - 5) // 17) * 5 + 2


def align_dimension(value):
    return max(
        CANVAS_MULTIPLE,
        int(round(float(value) / CANVAS_MULTIPLE)) * CANVAS_MULTIPLE,
    )


def floor_dimension(value):
    return max(
        CANVAS_MULTIPLE,
        int(math.floor(float(value) / CANVAS_MULTIPLE)) * CANVAS_MULTIPLE,
    )


def limit_long_edge(width, height, max_long_edge):
    width = int(width)
    height = int(height)
    max_long_edge = max(CANVAS_MULTIPLE, int(max_long_edge))
    scale = min(1.0, float(max_long_edge) / float(max(width, height)))
    return align_dimension(width * scale), align_dimension(height * scale)


def adapt_canvas(width, height):
    width = int(width)
    height = int(height)
    ratio = width / height
    if ratio >= 1.0:
        nominal_width, nominal_height = BASE_SHORT_EDGE * ratio, BASE_SHORT_EDGE
    else:
        nominal_width, nominal_height = BASE_SHORT_EDGE, BASE_SHORT_EDGE / ratio
    if nominal_width * nominal_height > MAX_PIXELS:
        scale = math.sqrt(MAX_PIXELS / (nominal_width * nominal_height))
        nominal_width *= scale
        nominal_height *= scale
    return align_dimension(nominal_width), align_dimension(nominal_height)


def reference_spatial_tokens(width, height):
    return max(1, int(width) // 32) * max(1, int(height) // 32)


def valid_reference_video_frames(frame_count, available_frames):
    frames = min(int(frame_count), int(available_frames))
    if frames < 5:
        return frames
    while frames % 17 != 5:
        frames -= 1
    return frames


def qwen_video_blocks(frame_count):
    if frame_count <= 0:
        return 0
    sampled_frames = int(math.ceil(float(frame_count) / float(FPS // 2)))
    return int(math.ceil(float(sampled_frames) / 2.0))


def image_reference_tokens(width, height):
    return reference_spatial_tokens(width, height) * 2


def video_reference_tokens(width, height, frame_count):
    if frame_count < 5:
        return 0
    spatial = reference_spatial_tokens(width, height)
    return spatial * (video_latent_t(frame_count) + qwen_video_blocks(frame_count))


def memory_profile(total_vram_gib=None):
    if total_vram_gib is not None and total_vram_gib <= 13.0:
        return {
            "name": "low",
            "video_ratio": 0.35,
            "still_budget": 6144,
            "video_floor": 4096,
            "video_ceiling": 32768,
            "total_vram_gib": total_vram_gib,
        }
    if total_vram_gib is not None and total_vram_gib <= 20.0:
        return {
            "name": "medium",
            "video_ratio": 0.50,
            "still_budget": 8192,
            "video_floor": 6144,
            "video_ceiling": 49152,
            "total_vram_gib": total_vram_gib,
        }
    if total_vram_gib is None or total_vram_gib <= 26.0:
        return {
            "name": "high",
            "video_ratio": 0.75,
            "still_budget": 12288,
            "video_floor": 8192,
            "video_ceiling": 65536,
            "total_vram_gib": total_vram_gib,
        }
    return {
        "name": "ultra",
        "video_ratio": 1.0,
        "still_budget": 16384,
        "video_floor": 12288,
        "video_ceiling": 98304,
        "total_vram_gib": total_vram_gib,
    }


def automatic_reference_budget(
    width,
    height,
    length,
    override=0,
    total_vram_gib=None,
):
    target_width = align_dimension(width)
    target_height = align_dimension(height)
    frame_count = align_frame_count(length)
    target_tokens = video_latent_t(frame_count) * reference_spatial_tokens(
        target_width,
        target_height,
    )
    profile = memory_profile(total_vram_gib)
    if int(override or 0) > 0:
        budget = int(override)
    elif frame_count <= 5:
        budget = int(profile["still_budget"])
    else:
        budget = int(target_tokens * profile["video_ratio"])
        budget = max(int(profile["video_floor"]), budget)
        budget = min(int(profile["video_ceiling"]), budget)
    return budget, target_tokens, frame_count, profile


def candidate_video_dimensions(width, height):
    canvas_width, canvas_height = adapt_canvas(width, height)
    if int(width) * int(height) < canvas_width * canvas_height:
        canvas_width = align_dimension(width)
        canvas_height = align_dimension(height)
    return canvas_width, canvas_height


def item_cost(item, width=None, height=None):
    width = int(item["width"] if width is None else width)
    height = int(item["height"] if height is None else height)
    if item["kind"] == "image":
        return image_reference_tokens(width, height)
    return video_reference_tokens(width, height, int(item["frames"]))


def allocate_item_budgets(items, total_budget):
    if not items:
        return []
    total_budget = max(1.0, float(total_budget))
    if sum(item["cost"] for item in items) <= total_budget:
        return [float(item["cost"]) for item in items]

    allocated = [0.0] * len(items)
    active = list(range(len(items)))
    remaining = total_budget
    while active:
        weight_sum = sum(float(items[index]["weight"]) for index in active)
        limited = []
        for index in active:
            share = remaining * float(items[index]["weight"]) / weight_sum
            if float(items[index]["cost"]) <= share:
                allocated[index] = float(items[index]["cost"])
                remaining -= allocated[index]
                limited.append(index)
        if limited:
            active = [index for index in active if index not in limited]
            continue
        for index in active:
            allocated[index] = remaining * float(items[index]["weight"]) / weight_sum
        break
    return allocated


def fit_item_to_budget(item, budget):
    width = int(item["width"])
    height = int(item["height"])
    budget = max(1.0, float(budget))
    min_long_edge = min(int(item["min_long_edge"]), max(width, height))

    for _ in range(24):
        cost = item_cost(item, width, height)
        current_long_edge = max(width, height)
        if cost <= budget or current_long_edge <= min_long_edge:
            break
        ratio = math.sqrt(budget / float(cost))
        next_long_edge = floor_dimension(current_long_edge * ratio)
        next_long_edge = max(min_long_edge, next_long_edge)
        if next_long_edge >= current_long_edge:
            next_long_edge = max(min_long_edge, current_long_edge - CANVAS_MULTIPLE)
        scale = float(next_long_edge) / float(current_long_edge)
        next_width = floor_dimension(width * scale)
        next_height = floor_dimension(height * scale)
        if next_width == width and next_height == height:
            break
        width, height = next_width, next_height

    fitted = dict(item)
    fitted["width"] = width
    fitted["height"] = height
    fitted["cost"] = item_cost(fitted)
    fitted["budget"] = int(budget)
    return fitted


def plan_references(
    width,
    height,
    length,
    image_items=None,
    video_items=None,
    max_image_long_edge=DEFAULT_MAX_IMAGE_LONG_EDGE,
    reference_token_budget=0,
    total_vram_gib=None,
):
    budget, target_tokens, frame_count, profile = automatic_reference_budget(
        width,
        height,
        length,
        override=reference_token_budget,
        total_vram_gib=total_vram_gib,
    )
    items = []
    for source in image_items or []:
        source_width = int(source["width"])
        source_height = int(source["height"])
        item_width, item_height = limit_long_edge(
            source_width,
            source_height,
            max_image_long_edge,
        )
        item = {
            "kind": "image",
            "name": str(source["name"]),
            "source_width": source_width,
            "source_height": source_height,
            "width": item_width,
            "height": item_height,
            "frames": 1,
            "weight": 1.0,
            "min_long_edge": MIN_IMAGE_LONG_EDGE,
        }
        item["cost"] = item_cost(item)
        items.append(item)

    for source in video_items or []:
        source_width = int(source["width"])
        source_height = int(source["height"])
        item_width, item_height = candidate_video_dimensions(
            source_width,
            source_height,
        )
        item = {
            "kind": "video",
            "name": str(source["name"]),
            "source_width": source_width,
            "source_height": source_height,
            "width": item_width,
            "height": item_height,
            "frames": valid_reference_video_frames(
                frame_count,
                int(source.get("available_frames") or frame_count),
            ),
            "weight": 2.0,
            "min_long_edge": MIN_VIDEO_LONG_EDGE,
        }
        item["cost"] = item_cost(item)
        items.append(item)

    item_budgets = allocate_item_budgets(items, budget)
    fitted_items = [
        fit_item_to_budget(item, item_budget)
        for item, item_budget in zip(items, item_budgets)
    ]
    return {
        "budget": int(budget),
        "target_tokens": int(target_tokens),
        "frame_count": int(frame_count),
        "profile": profile,
        "items": fitted_items,
        "estimated_reference_tokens": sum(item["cost"] for item in fitted_items),
    }
