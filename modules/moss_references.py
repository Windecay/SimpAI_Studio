"""Exchange the four mounted MOSS inputs with the regional layout editor."""

import base64
import hashlib
import io
import json

import numpy as np
from PIL import Image, ImageOps


def reference_type_defaults(kind, state, manual=False):
    skip = {"__type__": "update"}
    if isinstance(state, dict) and state.get("task_method") == "moss_image_sft_aio_cn" and kind == "ImagePrompt":
        return (1.0, 1.0) if manual else (skip.copy(), skip.copy())
    if manual:
        return skip.copy(), skip.copy()
    from modules import flags
    return flags.default_parameters.get(kind, flags.default_parameters[flags.cn_canny])


def _image_key(image):
    if image is None:
        return ""
    value = np.ascontiguousarray(image)
    digest = hashlib.sha256(str((value.shape, value.dtype)).encode("ascii"))
    digest.update(memoryview(value))
    return digest.hexdigest()


def _signature(images, types, stops, weights):
    return hashlib.sha256(json.dumps([
        [_image_key(image), kind, float(stop), float(weight)]
        for image, kind, stop, weight in zip(images, types, stops, weights)
    ], separators=(",", ":")).encode("utf-8")).hexdigest()


def _preview(image):
    pil = Image.fromarray(image)
    pil.thumbnail((1536, 1536))
    stream = io.BytesIO()
    pil.save(stream, format="PNG")
    return "data:image/png;base64," + base64.b64encode(stream.getvalue()).decode("ascii")


def _decode(source):
    if not isinstance(source, str) or len(source) > 12 * 1024 * 1024:
        raise ValueError("Reference image is too large")
    header, separator, encoded = source.partition(",")
    if not separator or header not in (
        "data:image/png;base64", "data:image/jpeg;base64", "data:image/webp;base64",
    ):
        raise ValueError("Choose a PNG, JPEG or WebP reference image")
    with Image.open(io.BytesIO(base64.b64decode(encoded, validate=True))) as image:
        if image.width * image.height > 64000000:
            raise ValueError("Reference image dimensions are too large")
        return np.array(ImageOps.exif_transpose(image).convert("RGBA"))


def exchange(request_text, state, generating, *values):
    """Return response plus image/type/stop/weight updates and the input toggle."""
    skip = {"__type__": "update"}
    unchanged = [skip.copy() for _ in range(18)]
    request_id = ""
    try:
        if not isinstance(request_text, str) or len(request_text) > 49 * 1024 * 1024:
            raise ValueError("Reference image is too large")
        request = json.loads(request_text)
        request_id = str(request.get("id", ""))[:100]
        user = state.get("user") if isinstance(state, dict) else None
        user_did = user.get_did() if user is not None and hasattr(user, "get_did") else (
            state.get("user_did") or state.get("__user_did") or "" if isinstance(state, dict) else ""
        )
        if (not isinstance(state, dict) or state.get("task_method") != "moss_image_sft_aio_cn"
                or str(request.get("preset", "")) != str(state.get("__preset") or state.get("preset") or "")
                or str(request.get("user", "")) != str(user_did)
                or generating):
            raise ValueError("The prompt or preset changed. Reopen the layout editor.")
        if len(values) != 16:
            raise ValueError("MOSS reference inputs are unavailable.")
        images, types, stops, weights = [list(values[start:start + 4]) for start in (0, 4, 8, 12)]
        signature = _signature(images, types, stops, weights)
        operation = request.get("operation")
        if operation == "apply":
            if request.get("signature") != signature:
                raise ValueError("The reference inputs changed. Reopen the layout editor.")
            changes = request.get("changes", [])
            if not isinstance(changes, list) or len(changes) > 4:
                raise ValueError("MOSS supports four shared image inputs.")
            seen = set()
            # Validate every change before returning any updates to Gradio.
            for change in changes:
                slot = change.get("slot")
                if type(slot) is not int or slot not in range(1, 5) or slot in seen:
                    raise ValueError("Invalid MOSS reference slot.")
                seen.add(slot)
                index = slot - 1
                if images[index] is not None and types[index] != "ImagePrompt":
                    raise ValueError("This input is occupied by a control image.")
                images[index] = _decode(change["source"]) if change.get("source") else None
                types[index] = "ImagePrompt"
                stops[index] = 1.0
                weights[index] = 1.0
            for slot in seen:
                index = slot - 1
                for group, items in enumerate((images, types, stops, weights)):
                    unchanged[group * 4 + index] = items[index]
            if any(image is not None and kind == "ImagePrompt" and stop > 0 and weight > 0
                   for image, kind, stop, weight in zip(images, types, stops, weights)):
                unchanged[-2:] = [True, "ip"]
            signature = _signature(images, types, stops, weights)
        elif operation != "read":
            raise ValueError("Invalid MOSS reference operation.")
        materials = [{
            "slot": index + 1, "key": _image_key(image),
            "source": _preview(image) if image is not None and kind == "ImagePrompt" else "",
            "kind": kind, "occupied": image is not None,
            "enabled": image is not None and kind == "ImagePrompt" and stop > 0 and weight > 0,
        } for index, (image, kind, stop, weight) in enumerate(zip(images, types, stops, weights))]
        response = {"id": request_id, "ok": True, "signature": signature, "materials": materials}
    except Exception as error:
        # Failed validation must not return any partially prepared image updates.
        unchanged = [skip.copy() for _ in range(18)]
        from modules.localization import localized_text
        response = {"id": request_id, "ok": False, "error": localized_text(state or {}, str(error))}
    return [json.dumps(response, ensure_ascii=False)] + unchanged
