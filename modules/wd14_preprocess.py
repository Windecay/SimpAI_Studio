import numpy as np
from PIL import Image


def _normalized_model_name(model_name):
    value = str(model_name or "").strip().lower()
    return value[:-5] if value.endswith(".onnx") else value


def needs_wd14_timm_normalization(model_name):
    return _normalized_model_name(model_name).startswith(
        "wd-eva02-tagger-2026-canary"
    )


def _is_dimension(value, expected):
    return str(value) == str(expected)


def _get_model_layout(input_shape):
    if len(input_shape) != 4:
        raise ValueError(f"WD14 model input must be rank 4, got {input_shape!r}")

    if _is_dimension(input_shape[1], 3) and not _is_dimension(input_shape[3], 3):
        return "NCHW", int(input_shape[3]), int(input_shape[2])
    if _is_dimension(input_shape[3], 3) and not _is_dimension(input_shape[1], 3):
        return "NHWC", int(input_shape[2]), int(input_shape[1])

    raise ValueError(f"Unsupported WD14 model input layout: {input_shape!r}")


def prepare_wd14_image(image, input_shape, normalize=False):
    layout, width, height = _get_model_layout(input_shape)

    if isinstance(image, np.ndarray):
        image = Image.fromarray(image)
    if image.mode != "RGB":
        image = image.convert("RGB")

    scale = min(width / image.width, height / image.height)
    new_size = (
        max(1, int(image.width * scale)),
        max(1, int(image.height * scale)),
    )
    image = image.resize(new_size, Image.LANCZOS)
    canvas = Image.new("RGB", (width, height), (255, 255, 255))
    canvas.paste(image, ((width - new_size[0]) // 2, (height - new_size[1]) // 2))

    image_array = np.asarray(canvas, dtype=np.float32)[:, :, ::-1]
    if normalize:
        image_array = (image_array / 255.0 - 0.5) / 0.5
    image_array = np.expand_dims(image_array, 0)
    if layout == "NCHW":
        image_array = np.transpose(image_array, (0, 3, 1, 2))
    return image_array
