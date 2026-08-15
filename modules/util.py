from pathlib import Path

import base64
import io
import numpy as np
import datetime
import random
import math
import os
import cv2
import re
from typing import List, Tuple, AnyStr, NamedTuple

import json
import hashlib

from PIL import Image

import modules.config
import modules.sdxl_styles
from modules.flags import Performance
import logging
from enhanced.logger import format_name
logger = logging.getLogger(format_name(__name__))

LANCZOS = (Image.Resampling.LANCZOS if hasattr(Image, 'Resampling') else Image.LANCZOS)

# Regexp compiled once. Matches entries with the following pattern:
# <lora:some_lora:1>
# <lora:aNotherLora:-1.6>
LORAS_PROMPT_PATTERN = re.compile(r"(<lora:([^:]+):([+-]?(?:\d+(?:\.\d*)?|\.\d+))>)", re.X)

HASH_SHA256_LENGTH = 10
_TRUE_ENV_VALUES = {"1", "true", "yes", "on", "debug"}


def simpai_ui_trace_enabled():
    value = os.environ.get("SIMPAI_UI_TRACE", "")
    return str(value).strip().lower() in _TRUE_ENV_VALUES


def log_ui_trace(target_logger, *args, **kwargs):
    if not simpai_ui_trace_enabled():
        return
    try:
        target_logger.info(*args, **kwargs)
    except Exception:
        pass


def erode_or_dilate(x, k):
    k = int(k)
    if k > 0:
        return cv2.dilate(x, kernel=np.ones(shape=(3, 3), dtype=np.uint8), iterations=k)
    if k < 0:
        return cv2.erode(x, kernel=np.ones(shape=(3, 3), dtype=np.uint8), iterations=-k)
    return x


def resample_image(im, width, height):
    im = Image.fromarray(im)
    im = im.resize((int(width), int(height)), resample=LANCZOS)
    return np.array(im)


def resize_image_by_max_area(im, max_area=1024 * 1024, multiple=8):
    if im is None:
        return im
    try:
        h, w = im.shape[:2]
    except Exception:
        return im
    if h <= 0 or w <= 0:
        return im
    area = int(h) * int(w)
    if area <= int(max_area):
        return im
    scale = math.sqrt(float(max_area) / float(area))
    new_w = max(1, int(round(float(w) * scale)))
    new_h = max(1, int(round(float(h) * scale)))
    try:
        multiple = int(multiple)
    except Exception:
        multiple = 8
    if multiple and multiple > 1:
        new_w = max(multiple, int(round(new_w / multiple)) * multiple)
        new_h = max(multiple, int(round(new_h / multiple)) * multiple)
    if new_w == w and new_h == h:
        return im
    return resample_image(im, width=new_w, height=new_h)


def _decode_data_url_image(data_url, image_mode=None):
    if not isinstance(data_url, str) or "," not in data_url:
        return None
    if not data_url.strip().lower().startswith("data:image/"):
        return None
    try:
        raw = base64.b64decode(data_url.split(",", 1)[1])
        image = Image.open(io.BytesIO(raw))
        if image_mode:
            image = image.convert(image_mode)
        return image
    except Exception:
        return None


def normalize_gradio_image_value(value, image_mode=None):
    if value is None:
        return None
    if isinstance(value, np.ndarray):
        if image_mode:
            try:
                array = value
                if array.dtype != np.uint8:
                    array = np.clip(array, 0, 255).astype(np.uint8)
                image = Image.fromarray(array)
                if image.mode != image_mode:
                    image = image.convert(image_mode)
                return np.array(image)
            except Exception:
                return value
        return value
    if isinstance(value, Image.Image):
        return np.array(value.convert(image_mode) if image_mode else value)
    if isinstance(value, dict):
        for key in ("image", "background", "composite", "data", "path", "name"):
            img = value.get(key)
            normalized = normalize_gradio_image_value(img, image_mode=image_mode)
            if normalized is not None:
                return normalized
        layers = value.get("layers")
        if isinstance(layers, (list, tuple)):
            for layer in layers:
                normalized = normalize_gradio_image_value(layer, image_mode=image_mode)
                if normalized is not None:
                    return normalized
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.startswith("{"):
            try:
                return normalize_gradio_image_value(json.loads(text), image_mode=image_mode)
            except Exception:
                return None
        data_img = _decode_data_url_image(text, image_mode=image_mode)
        if data_img is not None:
            return np.array(data_img)
        if os.path.exists(text):
            try:
                with Image.open(text) as img:
                    if image_mode:
                        img = img.convert(image_mode)
                    return np.array(img)
            except Exception:
                return None
    return None


def normalize_gradio_mask_value(value, image_shape=None, preserve_color=False):
    mask = normalize_gradio_image_value(value)
    if mask is None:
        if image_shape is None:
            return None
        try:
            h, w = image_shape[:2]
            return np.zeros((h, w, 3), dtype=np.uint8)
        except Exception:
            return None
    if mask.ndim == 2:
        return np.repeat(mask[:, :, None], 3, axis=2)
    if mask.ndim == 3 and mask.shape[2] == 4:
        if preserve_color:
            return mask
        alpha = mask[:, :, 3]
        if np.any(alpha < 255):
            mask = np.where(alpha > 0, 255, 0).astype(np.uint8)
            return np.repeat(mask[:, :, None], 3, axis=2)
        return mask[:, :, :3]
    return mask


def normalize_inpaint_mask_upload(value):
    def to_rgb_mask_array(mask):
        if not isinstance(mask, np.ndarray):
            return None
        if mask.dtype != np.uint8:
            mask = np.clip(mask, 0, 255).astype(np.uint8)
        if mask.ndim == 2:
            return np.repeat(mask[:, :, None], 3, axis=2)
        if mask.ndim != 3:
            return None
        channels = mask.shape[2]
        if channels == 1:
            return np.repeat(mask, 3, axis=2)
        if channels == 3:
            return mask
        if channels == 4:
            alpha = mask[:, :, 3]
            if np.any(alpha < 255):
                binary = np.where(alpha > 0, 255, 0).astype(np.uint8)
                return np.repeat(binary[:, :, None], 3, axis=2)
            return mask[:, :, :3]
        return None

    if isinstance(value, dict):
        image = to_rgb_mask_array(value.get("image"))
        mask = to_rgb_mask_array(value.get("mask"))
        if image is None:
            return mask
        if mask is None:
            return image
        if image.shape[:2] != mask.shape[:2]:
            mask = resample_image(mask, width=image.shape[1], height=image.shape[0])
        return np.maximum(image, mask)

    return to_rgb_mask_array(value)


def normalize_gradio_sketch_value(value, image_mode="RGBA", preserve_mask_color=False):
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.startswith("{"):
            try:
                value = json.loads(text)
            except Exception:
                image = normalize_gradio_image_value(text, image_mode=image_mode)
                return {"image": image, "mask": normalize_gradio_mask_value(None, getattr(image, "shape", None), preserve_mask_color)} if image is not None else None
        else:
            image = normalize_gradio_image_value(text, image_mode=image_mode)
            return {"image": image, "mask": normalize_gradio_mask_value(None, getattr(image, "shape", None), preserve_mask_color)} if image is not None else None
    if isinstance(value, dict):
        try:
            from ui.components import sketch_cache

            value = dict(value)
            for role in ("image", "mask"):
                ref_value = sketch_cache.resolve_payload_source(value, role)
                if ref_value:
                    value[role] = ref_value
        except Exception:
            pass
        image = None
        for key in ("image", "background", "composite", "data", "path", "name"):
            image = normalize_gradio_image_value(value.get(key), image_mode=image_mode)
            if image is not None:
                break
        if image is None:
            return None
        mask = normalize_gradio_mask_value(value.get("mask"), image.shape, preserve_mask_color)
        return {"image": image, "mask": mask}
    image = normalize_gradio_image_value(value, image_mode=image_mode)
    if image is None:
        return None
    return {"image": image, "mask": normalize_gradio_mask_value(None, image.shape, preserve_mask_color)}


def normalize_gradio_inpaint_value(value):
    """Convert the JSON string emitted by the custom inpaint canvas to its backend shape."""
    if not isinstance(value, str):
        return value
    normalized = normalize_gradio_sketch_value(value, image_mode="RGBA")
    return normalized if isinstance(normalized, dict) else value


def resize_image(im, width=None, height=None, resize_mode=1, min_side=None, max_side=None):
    """
    Resizes an image with the specified resize_mode, width, and height.

    Args:
        resize_mode: The mode to use when resizing the image.
            0: Resize the image to the specified width and height.
            1: Resize the image to fill the specified width and height, maintaining the aspect ratio, and then center the image within the dimensions, cropping the excess.
            2: Resize the image to fit within the specified width and height, maintaining the aspect ratio, and then center the image within the dimensions, filling empty with data from image.
            3: Resize the image to ensure the smallest side matches the specified min_side, maintaining the aspect ratio.
        im: The image to resize.
        width: The width to resize the image to.
        height: The height to resize the image to.
        min_side: The minimum side size to resize the image to (used in mode 3).
    """

    im = Image.fromarray(im)

    def resize(im, w, h):
        return im.resize((w, h), resample=LANCZOS)

    def adjust_and_crop(arr, target_dim, is_height):
        adjusted_dim = (target_dim // 8) * 8
        adjusted_dim = max(adjusted_dim, 8)  # 确保最小尺寸为8
        
        if adjusted_dim == target_dim:
            return arr
        
        delta = target_dim - adjusted_dim
        start = delta // 2
        end = start + adjusted_dim
        
        if is_height:
            return arr[start:end, :, :]  # 裁切高度
        else:
            return arr[:, start:end, :]   # 裁切宽度

    if resize_mode == 0:
        res = resize(im, width, height)

    elif resize_mode == 1:
        ratio = width / height
        src_ratio = im.width / im.height

        src_w = width if ratio > src_ratio else im.width * height // im.height
        src_h = height if ratio <= src_ratio else im.height * width // im.width

        resized = resize(im, src_w, src_h)
        res = Image.new("RGB", (width, height))
        res.paste(resized, box=(width // 2 - src_w // 2, height // 2 - src_h // 2))

    elif resize_mode == 2:
        ratio = width / height
        src_ratio = im.width / im.height

        src_w = width if ratio < src_ratio else im.width * height // im.height
        src_h = height if ratio >= src_ratio else im.height * width // im.width

        resized = resize(im, src_w, src_h)
        res = Image.new("RGB", (width, height))
        res.paste(resized, box=(width // 2 - src_w // 2, height // 2 - src_h // 2))

        if ratio < src_ratio:
            fill_height = height // 2 - src_h // 2
            if fill_height > 0:
                res.paste(resized.resize((width, fill_height), box=(0, 0, width, 0)), box=(0, 0))
                res.paste(resized.resize((width, fill_height), box=(0, resized.height, width, resized.height)), box=(0, fill_height + src_h))
        elif ratio > src_ratio:
            fill_width = width // 2 - src_w // 2
            if fill_width > 0:
                res.paste(resized.resize((fill_width, height), box=(0, 0, 0, height)), box=(0, 0))
                res.paste(resized.resize((fill_width, height), box=(resized.width, 0, resized.width, height)), box=(fill_width + src_w, 0))
    elif resize_mode == 3 and min_side:
        scale = min_side / min(im.width, im.height)

        new_width = int(im.width * scale)
        new_height = int(im.height * scale)
        resized = resize(im, new_width, new_height)

        resized_array = np.array(resized)
        if new_width < new_height:  
            processed_array = adjust_and_crop(resized_array, new_height, is_height=True)
        else:
            processed_array = adjust_and_crop(resized_array, new_width, is_height=False)
        res = Image.fromarray(processed_array)
    elif resize_mode == 4 and max_side:
        scale = max_side / max(im.width, im.height)

        new_width = int(im.width * scale)
        new_height = int(im.height * scale)
        resized = resize(im, new_width, new_height)

        resized_array = np.array(resized)
        if new_width > new_height:
            processed_array = adjust_and_crop(resized_array, new_height, is_height=True)
        else:
            processed_array = adjust_and_crop(resized_array, new_width, is_height=False)
        res = Image.fromarray(processed_array)
    else:
        pass
    
    return np.array(res)


def get_shape_ceil(h, w):
    return math.ceil(((h * w) ** 0.5) / 64.0) * 64.0


def get_image_shape_ceil(im):
    H, W = im.shape[:2]
    return get_shape_ceil(H, W)


def set_image_shape_ceil(im, shape_ceil):
    shape_ceil = float(shape_ceil)

    H_origin, W_origin, _ = im.shape
    H, W = H_origin, W_origin
    
    for _ in range(256):
        current_shape_ceil = get_shape_ceil(H, W)
        if abs(current_shape_ceil - shape_ceil) < 0.1:
            break
        k = shape_ceil / current_shape_ceil
        H = int(round(float(H) * k / 64.0) * 64)
        W = int(round(float(W) * k / 64.0) * 64)

    if H == H_origin and W == W_origin:
        return im

    return resample_image(im, width=W, height=H)


def HWC3(x):
    assert x.dtype == np.uint8
    if x.ndim == 2:
        x = x[:, :, None]
    assert x.ndim == 3
    H, W, C = x.shape
    assert C == 1 or C == 3 or C == 4
    if C == 3:
        return x
    if C == 1:
        return np.concatenate([x, x, x], axis=2)
    if C == 4:
        color = x[:, :, 0:3].astype(np.float32)
        alpha = x[:, :, 3:4].astype(np.float32) / 255.0
        y = color * alpha + 255.0 * (1.0 - alpha)
        y = y.clip(0, 255).astype(np.uint8)
        return y


def compress_video(input_path, output_path=None, target_height=480, crf=19):
    """
    Compress video using ffmpeg for preview purposes.
    """
    import subprocess
    import shutil

    ffmpeg_exe = 'ffmpeg'
    try:
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        if shutil.which('ffmpeg') is None:
            logger.warning("FFmpeg not found in PATH or imageio_ffmpeg. Skipping video compression.")
            return input_path

    if output_path is None:
        base, ext = os.path.splitext(input_path)
        output_path = f"{base}_preview.mp4"

    cmd = [
        ffmpeg_exe, '-y',
        '-i', input_path,
        '-vf', f'scale=-2:{target_height}',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', str(crf),
        '-c:a', 'aac', # Re-encode audio to aac to be safe, or copy if compatible
        '-b:a', '128k',
        output_path
    ]
    
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return output_path
    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg video compression failed: {e}")
        return input_path # Return original if failed
    except FileNotFoundError:
        logger.error(f"FFmpeg executable not found at '{ffmpeg_exe}'. Skipping compression.")
        return input_path


def extract_video_first_frame(input_path, output_path=None):
    """
    Extract the first decodable frame from the original video into a PNG file.
    """
    source = str(input_path or "").strip()
    if not source or not os.path.exists(source):
        return ""
    if output_path is None:
        _, output_path, _ = generate_temp_filename(folder=modules.config.temp_path, extension="png")
    output_path = os.path.abspath(str(output_path))
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    cap = None
    try:
        cap = cv2.VideoCapture(source)
        if not cap or not cap.isOpened():
            return ""
        ok, frame = cap.read()
        if not ok or frame is None:
            return ""
        if len(frame.shape) == 2:
            image = Image.fromarray(frame).convert("RGB")
        else:
            image = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        image.save(output_path)
        return output_path
    except Exception as e:
        logger.warning(f"Video first frame extraction failed: {e}")
        return ""
    finally:
        try:
            if cap is not None:
                cap.release()
        except Exception:
            pass


def extract_video_last_frame(input_path, output_path=None):
    """Extract the last decodable video frame into a PNG file."""
    source = str(input_path or "").strip()
    if not source or not os.path.exists(source):
        return ""
    if output_path is None:
        _, output_path, _ = generate_temp_filename(folder=modules.config.temp_path, extension="png")
    output_path = os.path.abspath(str(output_path))
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    cap = None
    try:
        cap = cv2.VideoCapture(source)
        if not cap or not cap.isOpened():
            return ""

        frame = None
        try:
            frame_count = max(0, int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0))
        except Exception:
            frame_count = 0
        if frame_count > 0:
            last_index = max(0, frame_count - 1)
            for frame_index in range(last_index, max(-1, last_index - 16), -1):
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
                ok, candidate = cap.read()
                if ok and candidate is not None:
                    frame = candidate
                    break

        if frame is None:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            while True:
                ok, candidate = cap.read()
                if not ok or candidate is None:
                    break
                frame = candidate

        if frame is None:
            return ""
        if len(frame.shape) == 2:
            image = Image.fromarray(frame).convert("RGB")
        else:
            image = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        image.save(output_path)
        return output_path
    except Exception as e:
        logger.warning(f"Video last frame extraction failed: {e}")
        return ""
    finally:
        try:
            if cap is not None:
                cap.release()
        except Exception:
            pass



def remove_empty_str(items, default=None):
    items = [x for x in items if x != ""]
    if len(items) == 0 and default is not None:
        return [default]
    return items


def join_prompts(*args, **kwargs):
    prompts = [str(x) for x in args if str(x) != ""]
    if len(prompts) == 0:
        return ""
    if len(prompts) == 1:
        return prompts[0]
    return ', '.join(prompts)


def generate_temp_filename(folder='./outputs/', extension='png'):
    current_time = datetime.datetime.now()
    date_string = current_time.strftime("%Y-%m-%d")
    time_string = current_time.strftime("%Y-%m-%d_%H-%M-%S")
    random_number = random.randint(1000, 9999)
    filename = f"{time_string}_{random_number}.{extension}"
    result = os.path.join(folder, date_string, filename)
    return date_string, os.path.abspath(result), filename

folder_variation = {}
def get_files_from_folder(folder_path, extensions=None, name_filter=None, variation=False):
    global folder_variation

    if not os.path.isdir(folder_path):
        raise ValueError("Folder path is not a valid directory.")

    filenames = []
    for root, dirs, files in os.walk(folder_path, topdown=False):
        relative_path = os.path.relpath(root, folder_path)
        if relative_path == ".":
            relative_path = ""
        for filename in sorted(files, key=lambda s: s.casefold()):
            _, file_extension = os.path.splitext(filename)
            if (extensions is None or file_extension.lower() in extensions) and (name_filter is None or name_filter in _):
                path = os.path.join(relative_path, filename)
                if variation:
                    mtime = int(os.path.getmtime(os.path.join(root, filename)))
                    if folder_path not in folder_variation or path not in folder_variation[folder_path] or mtime > folder_variation[folder_path][path]:
                        if folder_path not in folder_variation:    
                            folder_variation.update({folder_path: {path: mtime}})
                        else:
                            folder_variation[folder_path].update({path: mtime})
                        filenames.append(path)
                else:
                    filenames.append(path)


    return filenames


def sha256(filename, use_addnet_hash=False, length=HASH_SHA256_LENGTH):
    if use_addnet_hash:
        with open(filename, "rb") as file:
            sha256_value = addnet_hash_safetensors(file)
    else:
        sha256_value = calculate_sha256(filename)

    return sha256_value[:length] if length is not None else sha256_value


def addnet_hash_safetensors(b):
    """kohya-ss hash for safetensors from https://github.com/kohya-ss/sd-scripts/blob/main/library/train_util.py"""
    hash_sha256 = hashlib.sha256()
    blksize = 1024 * 1024

    b.seek(0)
    header = b.read(8)
    n = int.from_bytes(header, "little")

    offset = n + 8
    b.seek(offset)
    for chunk in iter(lambda: b.read(blksize), b""):
        hash_sha256.update(chunk)

    return hash_sha256.hexdigest()


def calculate_sha256(filename) -> str:
    hash_sha256 = hashlib.sha256()
    blksize = 1024 * 1024

    with open(filename, "rb") as f:
        for chunk in iter(lambda: f.read(blksize), b""):
            hash_sha256.update(chunk)

    return hash_sha256.hexdigest()


def quote(text):
    if ',' not in str(text) and '\n' not in str(text) and ':' not in str(text):
        return text

    return json.dumps(text, ensure_ascii=False)


def unquote(text):
    if len(text) == 0 or text[0] != '"' or text[-1] != '"':
        return text

    try:
        return json.loads(text)
    except Exception:
        return text


def unwrap_style_text_from_prompt(style_text, prompt):
    """
    Checks the prompt to see if the style text is wrapped around it. If so,
    returns True plus the prompt text without the style text. Otherwise, returns
    False with the original prompt.

    Note that the "cleaned" version of the style text is only used for matching
    purposes here. It isn't returned; the original style text is not modified.
    """
    stripped_prompt = prompt
    stripped_style_text = style_text
    if "{prompt}" in stripped_style_text:
        # Work out whether the prompt is wrapped in the style text. If so, we
        # return True and the "inner" prompt text that isn't part of the style.
        try:
            left, right = stripped_style_text.split("{prompt}", 2)
        except ValueError as e:
            # If the style text has multple "{prompt}"s, we can't split it into
            # two parts. This is an error, but we can't do anything about it.
            logger.info(f"Unable to compare style text to prompt:\n{style_text}")
            logger.info(f"Error: {e}")
            return False, prompt, ''

        left_pos = stripped_prompt.find(left)
        right_pos = stripped_prompt.find(right)
        if 0 <= left_pos < right_pos:
            real_prompt = stripped_prompt[left_pos + len(left):right_pos]
            prompt = stripped_prompt.replace(left + real_prompt + right, '', 1)
            if prompt.startswith(", "):
                prompt = prompt[2:]
            if prompt.endswith(", "):
                prompt = prompt[:-2]
            return True, prompt, real_prompt
    else:
        # Work out whether the given prompt starts with the style text. If so, we
        # return True and the prompt text up to where the style text starts.
        if stripped_prompt.endswith(stripped_style_text):
            prompt = stripped_prompt[: len(stripped_prompt) - len(stripped_style_text)]
            if prompt.endswith(", "):
                prompt = prompt[:-2]
            return True, prompt, prompt

    return False, prompt, ''


def extract_original_prompts(style, prompt, negative_prompt):
    """
    Takes a style and compares it to the prompt and negative prompt. If the style
    matches, returns True plus the prompt and negative prompt with the style text
    removed. Otherwise, returns False with the original prompt and negative prompt.
    """
    if not style.prompt and not style.negative_prompt:
        return False, prompt, negative_prompt

    match_positive, extracted_positive, real_prompt = unwrap_style_text_from_prompt(
        style.prompt, prompt
    )
    if not match_positive:
        return False, prompt, negative_prompt, ''

    match_negative, extracted_negative, _ = unwrap_style_text_from_prompt(
        style.negative_prompt, negative_prompt
    )
    if not match_negative:
        return False, prompt, negative_prompt, ''

    return True, extracted_positive, extracted_negative, real_prompt


def extract_styles_from_prompt(prompt, negative_prompt):
    extracted = []
    applicable_styles = []

    for style_name, (style_prompt, style_negative_prompt) in modules.sdxl_styles.styles.items():
        applicable_styles.append(PromptStyle(name=style_name, prompt=style_prompt, negative_prompt=style_negative_prompt))

    real_prompt = ''

    while True:
        found_style = None

        for style in applicable_styles:
            is_match, new_prompt, new_neg_prompt, new_real_prompt = extract_original_prompts(
                style, prompt, negative_prompt
            )
            if is_match:
                found_style = style
                prompt = new_prompt
                negative_prompt = new_neg_prompt
                if real_prompt == '' and new_real_prompt != '' and new_real_prompt != prompt:
                    real_prompt = new_real_prompt
                break

        if not found_style:
            break

        applicable_styles.remove(found_style)
        extracted.append(found_style.name)

    # add prompt expansion if not all styles could be resolved
    if prompt != '':
        if real_prompt != '':
            extracted.append(modules.sdxl_styles.fooocus_expansion)
        else:
            # find real_prompt when only prompt expansion is selected
            first_word = prompt.split(', ')[0]
            first_word_positions = [i for i in range(len(prompt)) if prompt.startswith(first_word, i)]
            if len(first_word_positions) > 1:
                real_prompt = prompt[:first_word_positions[-1]]
                extracted.append(modules.sdxl_styles.fooocus_expansion)
                if real_prompt.endswith(', '):
                    real_prompt = real_prompt[:-2]

    return list(reversed(extracted)), real_prompt, negative_prompt


class PromptStyle(NamedTuple):
    name: str
    prompt: str
    negative_prompt: str


def is_json(data: str) -> bool:
    try:
        loaded_json = json.loads(data)
        assert isinstance(loaded_json, dict)
    except (ValueError, AssertionError):
        return False
    return True


def get_filname_by_stem(lora_name, filenames: List[str]) -> str | None:
    from modules.lora_params import resolve_lora_filename
    return resolve_lora_filename(lora_name, filenames)


def get_file_from_folder_list(name, folders):
    if not isinstance(folders, list):
        folders = [folders]

    for folder in folders:
        filename = os.path.abspath(os.path.realpath(os.path.join(folder, name)))
        if os.path.isfile(filename):
            return filename

    return os.path.abspath(os.path.realpath(os.path.join(folders[0], name)))

def get_enabled_loras(loras: list, remove_none=True) -> list:
    result = []

    for i, lora in enumerate(loras):
        is_enabled = lora[0]
        model_path = lora[1]
        strength = lora[2]

        if is_enabled:
            result.append((model_path, strength))
        else:
            result.append(('None', 1.0))

    return result


def parse_lora_references_from_prompt(prompt: str, loras: List[Tuple[AnyStr, float]], loras_limit: int = 8,
                                      skip_file_check=False, prompt_cleanup=True, deduplicate_loras=True,
                                      lora_filenames=None, preserve_lora_slots=False) -> tuple[List[Tuple[AnyStr, float]], str]:
    # prevent unintended side effects when returning without detection
    loras = loras.copy()

    if lora_filenames is None:
        lora_filenames = []

    found_loras = []
    prompt_without_loras = ''
    cleaned_prompt = ''

    for token in prompt.split(','):
        matches = LORAS_PROMPT_PATTERN.findall(token)

        if len(matches) == 0:
            prompt_without_loras += token + ', '
            continue
        for match in matches:
            lora_name = match[1] + '.safetensors'
            if not skip_file_check:
                lora_name = get_filname_by_stem(match[1], lora_filenames)
            if lora_name is not None:
                found_loras.append((lora_name, float(match[2])))
            token = token.replace(match[0], '')
        prompt_without_loras += token + ', '

    if prompt_without_loras != '':
        cleaned_prompt = prompt_without_loras[:-2]

    if prompt_cleanup:
        cleaned_prompt = cleanup_prompt(prompt_without_loras)

    new_loras = []
    lora_names = [lora[0] for lora in loras]
    for found_lora in found_loras:
        if deduplicate_loras and (found_lora[0] in lora_names or found_lora in new_loras):
            continue
        new_loras.append(found_lora)

    if len(new_loras) == 0:
        return loras, cleaned_prompt

    if preserve_lora_slots:
        from modules.lora_params import merge_loras_preserving_slots
        return merge_loras_preserving_slots(loras, new_loras, loras_limit, deduplicate=deduplicate_loras), cleaned_prompt

    updated_loras = []
    for lora in loras + new_loras:
        if lora[0] != "None":
            updated_loras.append(lora)

    return updated_loras[:loras_limit], cleaned_prompt


def remove_performance_lora(filenames: list, performance: Performance | None):
    loras_without_performance = filenames.copy()

    if performance is None:
        return loras_without_performance

    performance_lora = performance.lora_filename()

    for filename in filenames:
        path = Path(filename)
        if performance_lora == path.name:
            loras_without_performance.remove(filename)

    return loras_without_performance


def cleanup_prompt(prompt):
    prompt = re.sub(' +', ' ', prompt)
    prompt = re.sub(',+', ',', prompt)
    cleaned_prompt = ''
    for token in prompt.split(','):
        token = token.strip()
        if token == '':
            continue
        cleaned_prompt += token + ', '
    return cleaned_prompt[:-2]


def apply_wildcards(wildcard_text, rng, i, read_wildcards_in_order) -> str:
    for _ in range(modules.config.wildcards_max_bfs_depth):
        placeholders = re.findall(r'__([\w-]+)__', wildcard_text)
        if len(placeholders) == 0:
            return wildcard_text

        logger.info(f'[Wildcards] processing: {wildcard_text}')
        for placeholder in placeholders:
            try:
                matches = [x for x in modules.config.wildcard_filenames if os.path.splitext(os.path.basename(x))[0] == placeholder]
                words = open(os.path.join(modules.config.paths_wildcards[0], matches[0]), encoding='utf-8').read().splitlines()
                words = [x for x in words if x != '']
                assert len(words) > 0
                if read_wildcards_in_order:
                    wildcard_text = wildcard_text.replace(f'__{placeholder}__', words[i % len(words)], 1)
                else:
                    wildcard_text = wildcard_text.replace(f'__{placeholder}__', rng.choice(words), 1)
            except:
                logger.info(f'[Wildcards] Warning: {placeholder}.txt missing or empty. '
                      f'Using "{placeholder}" as a normal word.')
                wildcard_text = wildcard_text.replace(f'__{placeholder}__', placeholder)
            logger.info(f'[Wildcards] {wildcard_text}')

    logger.info(f'[Wildcards] BFS stack overflow. Current text: {wildcard_text}')
    return wildcard_text


def format_media_size_info(width, height, aspect_ratios=None, include_recommended=True) -> str:
    width = int(width)
    height = int(height)
    if width <= 0 or height <= 0:
        raise ValueError("width and height must be positive")
    gcd = math.gcd(width, height)
    lcm_ratio = f'{width // gcd}:{height // gcd}'
    size_info = f'{width} x {height} | {lcm_ratio}'

    if include_recommended and aspect_ratios:
        ratio = round(width / height, 2)
        closest_ratio = min(aspect_ratios, key=lambda x: abs(ratio - float(x.split('*')[0]) / float(x.split('*')[1])))
        recommended_width, recommended_height = map(int, closest_ratio.split('*'))
        recommended_gcd = math.gcd(recommended_width, recommended_height)
        recommended_lcm_ratio = f'{recommended_width // recommended_gcd}:{recommended_height // recommended_gcd}'
        size_info += f'     /     {recommended_width} x {recommended_height} | {recommended_lcm_ratio}'

    return size_info


def get_image_size_info(image: np.ndarray, aspect_ratios: list) -> str:
    try:
        image = Image.fromarray(np.uint8(image))
        width, height = image.size
        return format_media_size_info(width, height, aspect_ratios)
    except Exception as e:
        return f'Error reading image: {e}'

is_chinese = lambda x: sum([1 if (u'\u4e00' <= i <= u'\u9fa5') or (u'\u3000' <= i <= u'\u303F') or (u'\uFF00' <= i <= u'\uFFEF') else 0 for i in x]) > 0

