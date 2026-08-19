import json
import mimetypes
import os
import re
import shutil
import subprocess

try:
    from PIL import Image
except Exception:
    Image = None


IMAGE_MIME_PREFIX = "image/"
VIDEO_MIME_PREFIX = "video/"
A1111_PARAM_RE = re.compile(r'\s*([\w \-/]+):\s*("(?:\\.|[^\\"])+"|[^,]*)(?:,|$)')
PROMPT_KEYS = (
    "prompt",
    "positive_prompt",
    "positive",
    "raw_prompt",
    "Raw prompt",
    "Prompt",
    "text",
)
NEGATIVE_KEYS = (
    "negative_prompt",
    "negative",
    "raw_negative_prompt",
    "Raw negative prompt",
    "Negative prompt",
)
PARAM_KEYS = (
    "seed",
    "steps",
    "sampler",
    "scheduler",
    "cfg_scale",
    "guidance_scale",
    "model",
    "base_model",
    "width",
    "height",
    "resolution",
)


def _clip_text(value, limit=4000):
    text = _decode_text(value)
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "..."


def _decode_text(value):
    if value is None:
        return ""
    if isinstance(value, tuple) and all(isinstance(item, int) for item in value):
        value = bytes(value)
    if isinstance(value, bytes):
        for prefix, encoding in (
            (b"ASCII\x00\x00\x00", "utf-8"),
            (b"UNICODE\x00", "utf-16-be"),
            (b"JIS\x00\x00\x00\x00\x00", "shift_jis"),
        ):
            if value.startswith(prefix):
                return value[len(prefix):].decode(encoding, errors="replace").strip("\x00")
        for encoding in ("utf-8", "utf-16", "utf-16-be", "latin-1"):
            try:
                return value.decode(encoding).strip("\x00")
            except Exception:
                pass
        return value.decode("utf-8", errors="ignore").strip("\x00")
    return str(value)


def _json_loads(value):
    if isinstance(value, (dict, list)):
        return value
    text = _decode_text(value).strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        return None


def _compact_value(value, limit=1200):
    if isinstance(value, (str, bytes)):
        return _clip_text(value, limit)
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    if isinstance(value, list):
        return [_compact_value(item, limit=300) for item in value[:40]]
    if isinstance(value, dict):
        result = {}
        for index, (key, item) in enumerate(value.items()):
            if index >= 80:
                result["..."] = "truncated"
                break
            result[str(key)] = _compact_value(item, limit=300)
        return result
    return _clip_text(value, limit)


def _dict_get_first(data, keys):
    if not isinstance(data, dict):
        return ""
    lower_map = {str(key).lower(): key for key in data.keys()}
    for key in keys:
        if key in data and data.get(key) not in (None, ""):
            value = data.get(key)
            if isinstance(value, (dict, list)):
                continue
            return _decode_text(value).strip()
        real_key = lower_map.get(str(key).lower())
        if real_key is not None and data.get(real_key) not in (None, ""):
            value = data.get(real_key)
            if isinstance(value, (dict, list)):
                continue
            return _decode_text(value).strip()
    return ""


def _extract_params(data):
    if not isinstance(data, dict):
        return {}
    lower_map = {str(key).lower(): key for key in data.keys()}
    params = {}
    for key in PARAM_KEYS:
        real_key = key if key in data else lower_map.get(key.lower())
        if real_key is not None and data.get(real_key) not in (None, ""):
            params[key] = _compact_value(data.get(real_key), limit=500)
    for key, value in data.items():
        key_text = str(key)
        if key_text.lower().startswith("lora") and value not in (None, ""):
            params[key_text] = _compact_value(value, limit=500)
    return params


def _workflow_summary(value):
    workflow = _json_loads(value)
    if not isinstance(workflow, dict):
        return None
    nodes = workflow.get("nodes")
    if isinstance(nodes, list):
        return {"node_count": len(nodes)}
    prompt = workflow.get("prompt")
    if isinstance(prompt, dict):
        return {"node_count": len(prompt)}
    return {"keys": list(workflow.keys())[:12]}


def _parse_a1111_text(text):
    text = _decode_text(text).strip()
    if not text:
        return {}
    lines = text.splitlines()
    lastline = lines[-1] if lines else ""
    param_matches = A1111_PARAM_RE.findall(lastline)
    if len(param_matches) < 3:
        prompt_lines = lines
        lastline = ""
    else:
        prompt_lines = lines[:-1]

    prompt = []
    negative = []
    target = prompt
    for line in prompt_lines:
        stripped = line.strip()
        if stripped.lower().startswith("negative prompt:"):
            target = negative
            stripped = stripped[len("Negative prompt:"):].strip()
        target.append(stripped)

    params = {}
    for key, value in A1111_PARAM_RE.findall(lastline):
        value = value.strip()
        if value.startswith('"') and value.endswith('"'):
            value = value[1:-1].replace('\\"', '"')
        params[key.strip()] = value

    return {
        "source": "a1111",
        "prompt": "\n".join(prompt).strip(),
        "negative_prompt": "\n".join(negative).strip(),
        "parameters": _compact_value(params),
        "raw_text": _clip_text(text),
    }


def _metadata_from_structured(data, source="simpleai", scheme=""):
    if not isinstance(data, dict):
        return {}
    prompt = _dict_get_first(data, PROMPT_KEYS)
    negative = _dict_get_first(data, NEGATIVE_KEYS)
    params = _extract_params(data)
    workflow = data.get("workflow") or data.get("Workflow")
    if not workflow and isinstance(data.get("simpleai_regen_manifest"), str):
        manifest = _json_loads(data.get("simpleai_regen_manifest"))
        workflow = manifest.get("workflow") if isinstance(manifest, dict) else None
    return {
        "source": source,
        "scheme": scheme or _decode_text(data.get("metadata_scheme") or data.get("fooocus_scheme")).strip(),
        "prompt": prompt,
        "negative_prompt": negative,
        "parameters": params,
        "raw": _compact_value(data),
        "has_workflow": bool(workflow),
        "workflow": _workflow_summary(workflow),
    }


def _merge_metadata(*items):
    result = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        for key, value in item.items():
            if key in ("parameters", "raw") and isinstance(value, dict):
                current = result.get(key) if isinstance(result.get(key), dict) else {}
                result[key] = dict(current, **value)
            elif value not in (None, "", {}, []):
                result[key] = value
    if result:
        result["ok"] = True
    return result


def _extract_from_parameters(parameters, scheme=""):
    structured = _json_loads(parameters)
    if isinstance(structured, dict):
        return _metadata_from_structured(structured, source="simpleai", scheme=scheme)
    text = _decode_text(parameters).strip()
    if text:
        parsed = _parse_a1111_text(text)
        if parsed:
            parsed["scheme"] = scheme or parsed.get("scheme") or ""
            return parsed
    return {}


def extract_image_metadata(path, max_raw_chars=4000):
    if Image is None or not path or not os.path.exists(path):
        return {}
    try:
        with Image.open(path) as image:
            info = dict(image.info or {})
            result = {}
            scheme = _decode_text(info.get("fooocus_scheme")).strip()
            parameters = info.get("parameters")
            comment = info.get("Comment")
            prompt_chunk = info.get("prompt")
            workflow_chunk = info.get("workflow")
            if parameters is not None:
                result = _merge_metadata(result, _extract_from_parameters(parameters, scheme=scheme))
            if comment is not None and not result.get("prompt"):
                structured = _json_loads(comment)
                if isinstance(structured, dict):
                    result = _merge_metadata(result, _metadata_from_structured(structured, source="comment", scheme=scheme))
                else:
                    result = _merge_metadata(result, _extract_from_parameters(comment, scheme=scheme or "simple"))
            if prompt_chunk is not None:
                prompt_data = _json_loads(prompt_chunk)
                if isinstance(prompt_data, dict):
                    result = _merge_metadata(result, _metadata_from_structured(prompt_data, source="comfy", scheme=scheme))
                elif not result.get("prompt"):
                    result = _merge_metadata(result, {"source": "prompt_chunk", "prompt": _clip_text(prompt_chunk, max_raw_chars)})
            if workflow_chunk is not None:
                result = _merge_metadata(result, {
                    "source": result.get("source") or "comfy",
                    "has_workflow": True,
                    "workflow": _workflow_summary(workflow_chunk),
                })

            try:
                exif = image.getexif()
            except Exception:
                exif = None
            if exif:
                try:
                    exif_ifd = exif.get_ifd(0x8769) if hasattr(exif, "get_ifd") else {}
                except Exception:
                    exif_ifd = {}
                if not isinstance(exif_ifd, dict):
                    exif_ifd = {}
                exif_parameters = exif_ifd.get(0x9286, exif.get(0x9286))
                exif_scheme = _decode_text(exif_ifd.get(0x927C, exif.get(0x927C))).strip()
                if exif_parameters is not None:
                    result = _merge_metadata(result, _extract_from_parameters(exif_parameters, scheme=exif_scheme or scheme))

            raw_keys = sorted(str(key) for key in info.keys() if key not in ("icc_profile", "exif"))
            if raw_keys:
                result["raw_keys"] = raw_keys[:40]
            return result
    except Exception:
        return {}


def _ffprobe_exe():
    exe = shutil.which("ffprobe")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        candidate = os.path.join(os.path.dirname(ffmpeg_exe), "ffprobe.exe" if os.name == "nt" else "ffprobe")
        if os.path.exists(candidate):
            return candidate
    except Exception:
        pass
    return ""


def _ffmpeg_exe():
    try:
        import imageio_ffmpeg

        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if exe and os.path.exists(exe):
            return exe
    except Exception:
        pass
    return shutil.which("ffmpeg") or ""


def _unescape_ffmetadata(value):
    result = []
    escaped = False
    for char in str(value or ""):
        if escaped:
            result.append(char)
            escaped = False
        elif char == "\\":
            escaped = True
        else:
            result.append(char)
    if escaped:
        result.append("\\")
    return "".join(result)


def _ffmetadata_logical_lines(text):
    lines = []
    current = ""
    for raw_line in str(text or "").splitlines():
        current += raw_line
        trailing_slashes = len(current) - len(current.rstrip("\\"))
        if trailing_slashes % 2 == 1:
            current = current[:-1] + "\n"
            continue
        lines.append(current)
        current = ""
    if current:
        lines.append(current)
    return lines


def read_video_metadata_tags(path):
    """Return container-level video tags without decoding any video frames."""
    if not path or not os.path.exists(path):
        return {}

    ffprobe = _ffprobe_exe()
    if ffprobe:
        try:
            completed = subprocess.run(
                [ffprobe, "-v", "error", "-show_entries", "format_tags", "-of", "json", path],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=8,
            )
            data = json.loads(completed.stdout or "{}") if completed.returncode == 0 else {}
            tags = ((data.get("format") or {}).get("tags") or {}) if isinstance(data, dict) else {}
            if isinstance(tags, dict) and tags:
                return tags
        except Exception:
            pass

    ffmpeg = _ffmpeg_exe()
    if not ffmpeg:
        return {}
    try:
        completed = subprocess.run(
            [ffmpeg, "-v", "error", "-i", path, "-f", "ffmetadata", "-"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
        )
        if completed.returncode != 0 and not completed.stdout:
            return {}
        tags = {}
        for raw_line in _ffmetadata_logical_lines(completed.stdout):
            line = raw_line.strip()
            if not line or line.startswith(";") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            tags[_unescape_ffmetadata(key)] = _unescape_ffmetadata(value)
        return tags
    except Exception:
        return {}


def extract_video_metadata(path, max_raw_chars=4000):
    if not path or not os.path.exists(path):
        return {}
    try:
        tags = read_video_metadata_tags(path)
        if not isinstance(tags, dict):
            return {}
        lower_tags = {str(key).lower(): value for key, value in tags.items()}
        scheme = _decode_text(lower_tags.get("fooocus_scheme")).strip()
        simpleai = lower_tags.get("simpleai_metadata")
        comment = lower_tags.get("comment")
        workflow = lower_tags.get("workflow")
        result = {}
        if simpleai:
            result = _merge_metadata(result, _extract_from_parameters(simpleai, scheme=scheme))
        if comment and not result.get("prompt"):
            structured = _json_loads(comment)
            if isinstance(structured, dict):
                prompt_data = structured.get("prompt")
                if isinstance(prompt_data, dict):
                    result = _merge_metadata(result, _metadata_from_structured(prompt_data, source="simpleai_video", scheme=scheme))
                result = _merge_metadata(result, _metadata_from_structured(structured, source="video_comment", scheme=scheme))
            else:
                result = _merge_metadata(result, _extract_from_parameters(comment, scheme=scheme))
        if workflow:
            result = _merge_metadata(result, {
                "source": result.get("source") or "simpleai_video",
                "has_workflow": True,
                "workflow": _workflow_summary(workflow),
            })
        if tags:
            result["raw_keys"] = sorted(str(key) for key in tags.keys())[:40]
            if not result.get("raw_text"):
                result["raw_text"] = _clip_text(simpleai or comment or "", max_raw_chars)
        return result
    except Exception:
        return {}


def extract_media_metadata(path, mime=None, max_raw_chars=4000):
    path = os.path.abspath(str(path or ""))
    if not path or not os.path.exists(path):
        return {}
    media_mime = str(mime or mimetypes.guess_type(path)[0] or "").lower()
    if media_mime.startswith(IMAGE_MIME_PREFIX):
        return extract_image_metadata(path, max_raw_chars=max_raw_chars)
    if media_mime.startswith(VIDEO_MIME_PREFIX):
        return extract_video_metadata(path, max_raw_chars=max_raw_chars)
    return {}
