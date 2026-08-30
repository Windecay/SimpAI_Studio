import math

from PIL import Image, ImageDraw, ImageOps


QWEN_HYBRID_VISION_HANDLERS = frozenset({
    "Qwen3.5",
    "Qwen3.5-Thinking",
    "Qwen3.6",
    "Qwen3.6-Thinking",
    "Qwen3.8",
    "Qwen3.8-Thinking",
})
QWEN_HYBRID_CTX_CHECKPOINTS = 16
MEDIA_CONTENT_TYPES = frozenset({
    "image",
    "image_url",
    "input_image",
    "audio",
    "audio_url",
    "input_audio",
    "video",
    "video_url",
    "input_video",
})


def is_qwen_hybrid_vision_handler(handler_name):
    return str(handler_name or "").strip() in QWEN_HYBRID_VISION_HANDLERS


def should_merge_qwen_hybrid_images(handler_name, image_count):
    try:
        count = int(image_count)
    except (TypeError, ValueError):
        count = 0
    return is_qwen_hybrid_vision_handler(handler_name) and count >= 2


def messages_have_media(messages):
    for message in messages if isinstance(messages, list) else []:
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, list):
            continue
        for item in content:
            if not isinstance(item, dict):
                continue
            content_type = str(item.get("type") or "").strip().lower()
            if content_type in MEDIA_CONTENT_TYPES:
                return True
            if any(key in item for key in MEDIA_CONTENT_TYPES):
                return True
    return False


def select_request_text_handler(
    messages,
    *,
    enable_thinking=False,
    text_handler=None,
    thinking_handler=None,
):
    if messages_have_media(messages):
        return None
    if bool(enable_thinking):
        return thinking_handler if callable(thinking_handler) else None
    return text_handler if callable(text_handler) else None


def metadata_text_chat_handler(llm):
    handlers = getattr(llm, "_chat_handlers", None)
    if not isinstance(handlers, dict):
        return None

    candidates = []
    chat_format = getattr(llm, "chat_format", None)
    if chat_format:
        candidates.append(str(chat_format))
    candidates.append("chat_template.default")

    for name in candidates:
        handler = handlers.get(name)
        if callable(handler):
            return handler
    return None


def create_text_only_chat_completion(llm, *, messages, text_handler=None, **kwargs):
    if messages_have_media(messages):
        return llm.create_chat_completion(messages=messages, **kwargs)

    if callable(text_handler):
        return text_handler(llama=llm, messages=messages, **kwargs)

    if getattr(llm, "chat_handler", None) is None:
        return llm.create_chat_completion(messages=messages, **kwargs)

    handler = metadata_text_chat_handler(llm)
    if handler is None:
        return llm.create_chat_completion(messages=messages, **kwargs)

    return handler(llama=llm, messages=messages, **kwargs)


def build_numbered_contact_sheet(images, max_side=1024, gap=8):
    sources = [image for image in images if isinstance(image, Image.Image)]
    if len(sources) < 2:
        return None

    count = len(sources)
    columns = max(2, int(math.ceil(math.sqrt(count))))
    rows = int(math.ceil(count / columns))
    max_side = max(256, int(max_side or 1024))
    gap = max(2, int(gap or 8))
    cell_size = max(64, (max_side - gap * (columns + 1)) // columns)
    width = gap + columns * (cell_size + gap)
    height = gap + rows * (cell_size + gap)
    canvas = Image.new("RGB", (width, height), (22, 24, 28))
    draw = ImageDraw.Draw(canvas)

    label_size = max(22, min(42, cell_size // 8))
    for index, source in enumerate(sources, start=1):
        image = ImageOps.exif_transpose(source).convert("RGB")
        tile = ImageOps.contain(
            image,
            (cell_size, cell_size),
            method=Image.Resampling.LANCZOS,
        )
        row = (index - 1) // columns
        column = (index - 1) % columns
        cell_x = gap + column * (cell_size + gap)
        cell_y = gap + row * (cell_size + gap)
        paste_x = cell_x + (cell_size - tile.width) // 2
        paste_y = cell_y + (cell_size - tile.height) // 2
        canvas.paste(tile, (paste_x, paste_y))

        label = str(index)
        label_box = (cell_x, cell_y, cell_x + label_size, cell_y + label_size)
        draw.rectangle(label_box, fill=(0, 0, 0))
        text_box = draw.textbbox((0, 0), label)
        text_width = text_box[2] - text_box[0]
        text_height = text_box[3] - text_box[1]
        draw.text(
            (
                cell_x + (label_size - text_width) // 2,
                cell_y + (label_size - text_height) // 2 - text_box[1],
            ),
            label,
            fill=(255, 255, 255),
        )

    return canvas
