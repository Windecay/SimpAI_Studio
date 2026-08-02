import base64
import array
import hashlib
import math
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import time
import wave
from urllib.parse import quote

try:
    from PIL import Image
except Exception:
    Image = None

import shared
from modules.canvas_media_metadata import extract_media_metadata


ASSETS_CATALOG = "canvas_workbench/assets"
DATA_URL_RE = re.compile(r"^data:(?P<mime>[^;,]+)?(?:;[^,]*)?;base64,(?P<data>.*)$", re.DOTALL)
MAX_INLINE_ASSET_BYTES = 80 * 1024 * 1024


def _safe_id(value, fallback="default"):
    text = str(value or "").strip()
    if not text:
        text = fallback
    text = re.sub(r"[^a-zA-Z0-9_.-]+", "_", text)
    text = text.strip("._-")
    return (text or fallback)[:96]


def _get_user_did(state_params):
    try:
        user = state_params.get("user") if isinstance(state_params, dict) else None
        if user is not None and hasattr(user, "get_did"):
            did = user.get_did()
            if did:
                return did
    except Exception:
        pass
    try:
        if isinstance(state_params, dict):
            did = str(state_params.get("user_did") or state_params.get("__user_did") or "").strip()
            if did:
                return did
    except Exception:
        pass
    try:
        if shared.token is not None:
            return shared.token.get_guest_did()
    except Exception:
        pass
    return "guest"


def _asset_root(project_id, state_params):
    user_did = _get_user_did(state_params)
    try:
        if shared.token is not None and hasattr(shared.token, "get_path_in_user_dir"):
            base_dir = shared.token.get_path_in_user_dir(user_did, ASSETS_CATALOG)
        else:
            base_dir = os.path.join(shared.path_userhome or "users", str(user_did or "guest"), ASSETS_CATALOG)
    except Exception:
        base_dir = os.path.join(shared.path_userhome or "users", str(user_did or "guest"), ASSETS_CATALOG)
    return os.path.abspath(os.path.join(base_dir, _safe_id(project_id))), user_did


def _extension_for_mime(mime):
    ext = mimetypes.guess_extension(str(mime or "").split(";")[0].strip())
    if ext == ".jpe":
        ext = ".jpg"
    return ext or ".bin"


def _file_preview_url(path):
    if not path:
        return ""
    return f"/file={quote(os.path.abspath(str(path)).replace(os.sep, '/'), safe=':/')}"


def _asset_relative_path(path, root):
    try:
        real_root = os.path.realpath(os.path.abspath(str(root or "")))
        real_path = os.path.realpath(os.path.abspath(str(path or "")))
        if os.path.commonpath([real_root, real_path]) != real_root:
            return ""
        return os.path.relpath(real_path, real_root).replace(os.sep, "/")
    except Exception:
        return ""


def _project_asset_path_from_relative(relative_path, root):
    text = str(relative_path or "").strip().replace("\\", "/")
    if not text or os.path.isabs(text):
        return ""
    try:
        real_root = os.path.realpath(os.path.abspath(str(root or "")))
        candidate = os.path.realpath(os.path.abspath(os.path.join(real_root, text.replace("/", os.sep))))
        if os.path.commonpath([real_root, candidate]) != real_root:
            return ""
        return candidate
    except Exception:
        return ""


def _resolve_asset_file_path(asset, project_id, state_params):
    root, _ = _asset_root(project_id, state_params)
    for key in ("asset_relative_path", "relative_path"):
        candidate = _project_asset_path_from_relative(asset.get(key), root)
        if candidate and os.path.exists(candidate):
            return candidate
    for key in ("path", "output_path", "original_output_path"):
        value = str(asset.get(key) or "").strip()
        if not value:
            continue
        if os.path.isabs(value):
            candidate = os.path.abspath(value)
            if os.path.exists(candidate):
                return candidate
            basename = os.path.basename(candidate)
            if basename:
                for dirpath, _, filenames in os.walk(root):
                    if basename in filenames:
                        return os.path.abspath(os.path.join(dirpath, basename))
            continue
        candidate = _project_asset_path_from_relative(value, root)
        if candidate and os.path.exists(candidate):
            return candidate
    return ""


def _decode_data_url(data_url):
    text = str(data_url or "")
    match = DATA_URL_RE.match(text)
    if not match:
        return None, b""
    mime = match.group("mime") or "application/octet-stream"
    encoded = match.group("data") or ""
    binary = base64.b64decode(encoded, validate=False)
    return mime, binary


def save_data_url_asset(data_url, project_id, state_params, node_id="", role="image", metadata=None):
    mime, binary = _decode_data_url(data_url)
    if not binary:
        return None
    if len(binary) > MAX_INLINE_ASSET_BYTES:
        raise ValueError(f"Canvas asset is too large: {len(binary)} bytes")

    sha = hashlib.sha256(binary).hexdigest()
    root, user_did = _asset_root(project_id, state_params)
    ext = _extension_for_mime(mime)
    role_name = _safe_id(role, "asset")
    node_name = _safe_id(node_id, "node")
    folder = os.path.join(root, sha[:2])
    os.makedirs(folder, exist_ok=True)
    filename = f"{node_name}.{role_name}.{sha[:16]}{ext}"
    path = _find_existing_hashed_asset(root, sha, ext) or os.path.abspath(os.path.join(folder, filename))
    if not os.path.exists(path):
        tmp_path = f"{path}.tmp"
        with open(tmp_path, "wb") as f:
            f.write(binary)
        os.replace(tmp_path, path)

    info = metadata if isinstance(metadata, dict) else {}
    probed = _probe_media_metadata(path, mime)
    if probed:
        info = dict(info, **{k: v for k, v in probed.items() if v not in (None, "")})
    generation_metadata = info.get("generation_metadata") if isinstance(info.get("generation_metadata"), dict) else {}
    if not generation_metadata:
        generation_metadata = extract_media_metadata(path, mime=mime)
    waveform = _normalize_waveform_values(info.get("waveform"), 160)
    if str(mime or "").startswith("audio/") and not waveform:
        waveform = _extract_audio_waveform(path, mime, 96)
    relative_path = _asset_relative_path(path, root)
    return {
        "kind": "canvas_asset",
        "asset_id": f"asset:{sha[:24]}",
        "project_id": _safe_id(project_id),
        "owner": str(user_did or "guest"),
        "node_id": str(node_id or ""),
        "role": role,
        "mime": mime,
        "size": len(binary),
        "sha256": sha,
        "path": path,
        "asset_relative_path": relative_path,
        "relative_path": relative_path,
        "asset_root": root,
        "asset_root_key": "project_asset_root",
        "preview_url": _file_preview_url(path),
        "width": info.get("width"),
        "height": info.get("height"),
        "duration": info.get("duration"),
        "fps": info.get("fps"),
        "frame_count": info.get("frame_count"),
        "waveform": waveform,
        "edit": info.get("edit") if isinstance(info.get("edit"), dict) else None,
        "generation_metadata": generation_metadata,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def _sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _find_existing_hashed_asset(root, sha, ext=""):
    digest = str(sha or "").strip().lower()
    if not digest:
        return ""
    folder = os.path.join(root, digest[:2])
    if not os.path.isdir(folder):
        return ""
    suffix = f".{digest[:16]}{ext or ''}".lower()
    try:
        for filename in os.listdir(folder):
            if filename.lower().endswith(suffix):
                candidate = os.path.abspath(os.path.join(folder, filename))
                if os.path.isfile(candidate):
                    return candidate
    except Exception:
        return ""
    return ""


def _get_ffprobe_exe():
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


def _get_ffmpeg_exe():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return ""


def _normalize_waveform_values(values, bucket_count=96):
    if not isinstance(values, (list, tuple)):
        return []
    limit = max(1, min(int(bucket_count or 96), 160))
    cleaned = []
    for value in list(values)[:limit]:
        try:
            number = float(value)
        except Exception:
            continue
        if not math.isfinite(number):
            continue
        cleaned.append(round(max(0.0, min(1.0, number)), 4))
    return cleaned


def _peak_from_pcm_bytes(chunk, sample_width):
    if not chunk:
        return 0.0
    try:
        sample_width = int(sample_width or 0)
    except Exception:
        sample_width = 0
    if sample_width == 1:
        peak = max((abs(int(value) - 128) for value in chunk), default=0)
        return min(1.0, float(peak) / 128.0)
    if sample_width == 2:
        usable = len(chunk) - (len(chunk) % 2)
        samples = array.array("h")
        samples.frombytes(chunk[:usable])
        if sys.byteorder != "little":
            samples.byteswap()
        peak = max((abs(int(value)) for value in samples), default=0)
        return min(1.0, float(peak) / 32768.0)
    if sample_width == 3:
        usable = len(chunk) - (len(chunk) % 3)
        peak = 0
        for offset in range(0, usable, 3):
            value = int.from_bytes(chunk[offset:offset + 3], "little", signed=True)
            peak = max(peak, abs(value))
        return min(1.0, float(peak) / 8388608.0)
    if sample_width == 4:
        usable = len(chunk) - (len(chunk) % 4)
        samples = array.array("i")
        samples.frombytes(chunk[:usable])
        if sys.byteorder != "little":
            samples.byteswap()
        peak = max((abs(int(value)) for value in samples), default=0)
        return min(1.0, float(peak) / 2147483648.0)
    return 0.0


def _extract_wav_waveform(path, bucket_count=96):
    try:
        with wave.open(path, "rb") as wf:
            frame_count = int(wf.getnframes() or 0)
            sample_width = int(wf.getsampwidth() or 0)
            if frame_count <= 0 or sample_width <= 0:
                return []
            buckets = max(1, min(int(bucket_count or 96), 160))
            frames_per_bucket = max(1, int(math.ceil(float(frame_count) / float(buckets))))
            peaks = []
            for _ in range(buckets):
                remaining = max(0, frame_count - int(wf.tell()))
                if remaining <= 0:
                    break
                chunk = wf.readframes(min(frames_per_bucket, remaining))
                peaks.append(_peak_from_pcm_bytes(chunk, sample_width))
            return _normalize_waveform_values(peaks, buckets)
    except Exception:
        return []


def _extract_ffmpeg_waveform(path, bucket_count=96):
    ffmpeg = _get_ffmpeg_exe()
    if not ffmpeg:
        return []
    try:
        cmd = [
            ffmpeg,
            "-nostdin",
            "-v", "error",
            "-i", path,
            "-ac", "1",
            "-ar", "8000",
            "-f", "s16le",
            "-",
        ]
        completed = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
        if completed.returncode != 0 or not completed.stdout:
            return []
        usable = len(completed.stdout) - (len(completed.stdout) % 2)
        samples = array.array("h")
        samples.frombytes(completed.stdout[:usable])
        if sys.byteorder != "little":
            samples.byteswap()
        total = len(samples)
        if total <= 0:
            return []
        buckets = max(1, min(int(bucket_count or 96), 160))
        samples_per_bucket = max(1, int(math.ceil(float(total) / float(buckets))))
        peaks = []
        for start in range(0, total, samples_per_bucket):
            stop = min(total, start + samples_per_bucket)
            peak = max((abs(int(value)) for value in samples[start:stop]), default=0)
            peaks.append(min(1.0, float(peak) / 32768.0))
            if len(peaks) >= buckets:
                break
        return _normalize_waveform_values(peaks, buckets)
    except Exception:
        return []


def _extract_audio_waveform(path, mime, bucket_count=96):
    if not path or not os.path.exists(path) or not str(mime or "").startswith("audio/"):
        return []
    ext = os.path.splitext(str(path))[1].lower()
    mime_text = str(mime or "").lower()
    if ext == ".wav" or "wav" in mime_text:
        waveform = _extract_wav_waveform(path, bucket_count)
        if waveform:
            return waveform
    return _extract_ffmpeg_waveform(path, bucket_count)


def _probe_media_metadata(path, mime):
    if not path or not os.path.exists(path):
        return {}
    if not (str(mime or "").startswith("video/") or str(mime or "").startswith("audio/")):
        return {}
    ffprobe = _get_ffprobe_exe()
    if not ffprobe:
        return {}
    try:
        cmd = [
            ffprobe,
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,avg_frame_rate,r_frame_rate,nb_frames:format=duration",
            "-of", "json",
            path,
        ]
        completed = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=8)
        if completed.returncode != 0:
            return {}
        import json
        data = json.loads(completed.stdout or "{}")
        streams = data.get("streams") if isinstance(data, dict) else []
        stream = streams[0] if streams else {}
        fmt = data.get("format") if isinstance(data.get("format"), dict) else {}
        result = {}
        if stream.get("width") and stream.get("height"):
            result["width"] = int(stream.get("width"))
            result["height"] = int(stream.get("height"))
        fps = _parse_ffprobe_rate(stream.get("avg_frame_rate") or stream.get("r_frame_rate"))
        if fps:
            result["fps"] = fps
        if stream.get("nb_frames"):
            try:
                result["frame_count"] = int(stream.get("nb_frames"))
            except Exception:
                pass
        if fmt.get("duration"):
            result["duration"] = round(float(fmt.get("duration")), 2)
        if result.get("fps") and result.get("duration") and not result.get("frame_count"):
            result["frame_count"] = max(1, int(round(float(result["fps"]) * float(result["duration"]))))
        return result
    except Exception:
        return {}


def _parse_ffprobe_rate(value):
    text = str(value or "").strip()
    if not text or text in ("0/0", "N/A"):
        return None
    try:
        if "/" in text:
            numerator, denominator = text.split("/", 1)
            den = float(denominator or 0)
            if den == 0:
                return None
            fps = float(numerator or 0) / den
        else:
            fps = float(text)
        if fps <= 0:
            return None
        return round(fps, 3)
    except Exception:
        return None


def _media_edit_range(asset, duration=None):
    if not isinstance(asset, dict):
        return None
    mime = str(asset.get("mime") or "")
    if not (mime.startswith("video/") or mime.startswith("audio/")):
        return None
    edit = asset.get("edit") if isinstance(asset.get("edit"), dict) else {}
    if not edit:
        return None
    media_duration = duration if duration is not None else asset.get("duration")
    try:
        media_duration = float(media_duration or 0)
    except Exception:
        media_duration = 0.0
    try:
        start = max(0.0, float(edit.get("trim_start") or 0))
    except Exception:
        start = 0.0
    try:
        end = float(edit.get("trim_end") or media_duration or 0)
    except Exception:
        end = media_duration or 0.0
    if media_duration > 0:
        start = min(start, media_duration)
        end = min(max(end, start), media_duration)
    if end <= start:
        return None
    if start <= 0.01 and (not media_duration or end >= media_duration - 0.01):
        return None
    return {
        "trim_start": round(start, 3),
        "trim_end": round(end, 3),
        "duration": round(end - start, 3),
    }


def _trim_media_file(source_path, mime, edit_range, project_id, state_params, node_id="", role="media", force_reencode=False):
    if not source_path or not os.path.exists(source_path) or not edit_range:
        return None
    ffmpeg = _get_ffmpeg_exe()
    if not ffmpeg:
        raise RuntimeError("ffmpeg is not available for media trim")

    root, _ = _asset_root(project_id, state_params)
    signature = f"{os.path.abspath(source_path)}|{os.path.getmtime(source_path)}|{edit_range.get('trim_start')}|{edit_range.get('trim_end')}|reencode={bool(force_reencode)}"
    sha = hashlib.sha256(signature.encode("utf-8", errors="ignore")).hexdigest()
    ext = os.path.splitext(source_path)[1] or _extension_for_mime(mime)
    folder = os.path.join(root, sha[:2])
    os.makedirs(folder, exist_ok=True)
    role_name = _safe_id(f"{role}_trim", "media_trim")
    node_name = _safe_id(node_id, "node")
    output_path = os.path.abspath(os.path.join(folder, f"{node_name}.{role_name}.{sha[:16]}{ext}"))
    if os.path.exists(output_path):
        return output_path

    duration = max(0.001, float(edit_range.get("duration") or 0.001))
    start = max(0.0, float(edit_range.get("trim_start") or 0))
    tmp_path = f"{output_path}.tmp{ext}"

    completed = None
    if not force_reencode:
        cmd = [
            ffmpeg,
            "-y",
            "-ss", f"{start:.3f}",
            "-i", source_path,
            "-t", f"{duration:.3f}",
            "-map", "0",
            "-c", "copy",
            "-avoid_negative_ts", "make_zero",
            tmp_path,
        ]
        completed = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)

    needs_reencode = bool(force_reencode) or completed is None or completed.returncode != 0 or not os.path.exists(tmp_path) or os.path.getsize(tmp_path) <= 0
    if needs_reencode:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass
        fallback = [
            ffmpeg,
            "-y",
            "-i", source_path,
            "-ss", f"{start:.3f}",
            "-t", f"{duration:.3f}",
        ]
        if str(mime or "").startswith("audio/"):
            ext_lower = str(ext or "").lower()
            if ext_lower == ".mp3":
                audio_codec = "libmp3lame"
            elif ext_lower == ".wav":
                audio_codec = "pcm_s16le"
            elif ext_lower == ".flac":
                audio_codec = "flac"
            elif ext_lower == ".opus":
                audio_codec = "libopus"
            else:
                audio_codec = "aac"
            fallback += ["-vn", "-c:a", audio_codec]
        else:
            fallback += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac"]
        fallback += [tmp_path]
        completed = subprocess.run(fallback, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=240)
        if completed.returncode != 0 or not os.path.exists(tmp_path) or os.path.getsize(tmp_path) <= 0:
            raise RuntimeError((completed.stderr or completed.stdout or "ffmpeg trim failed")[-1000:])
    os.replace(tmp_path, output_path)
    return output_path


def register_existing_file_asset(path, project_id, state_params, node_id="", role="output", metadata=None, copy_to_assets=True):
    path = os.path.abspath(str(path or ""))
    if not path or not os.path.exists(path):
        return None

    info = metadata if isinstance(metadata, dict) else {}
    mime = info.get("mime") or mimetypes.guess_type(path)[0] or "application/octet-stream"
    size = None
    width = info.get("width")
    height = info.get("height")
    try:
        size = os.path.getsize(path)
    except Exception:
        size = info.get("size")

    if (not width or not height) and Image is not None and str(mime).startswith("image/"):
        try:
            with Image.open(path) as image:
                width, height = image.size
        except Exception:
            pass
    probed = _probe_media_metadata(path, mime)
    if probed:
        width = width or probed.get("width")
        height = height or probed.get("height")
        info["duration"] = info.get("duration") or probed.get("duration")
        info["fps"] = info.get("fps") or probed.get("fps")
        info["frame_count"] = info.get("frame_count") or probed.get("frame_count")
    generation_metadata = info.get("generation_metadata") if isinstance(info.get("generation_metadata"), dict) else {}
    if not generation_metadata:
        generation_metadata = extract_media_metadata(path, mime=mime)
    waveform = _normalize_waveform_values(info.get("waveform"), 160)
    if str(mime or "").startswith("audio/") and not waveform:
        waveform = _extract_audio_waveform(path, mime, 96)

    root, user_did = _asset_root(project_id, state_params)
    owner = info.get("owner") or info.get("user_did") or user_did
    source_path = path
    copied = False
    copy_error = None
    try:
        sha = _sha256_file(source_path)
    except Exception:
        try:
            stat = os.stat(source_path)
            signature = f"{source_path}|{stat.st_size}|{stat.st_mtime_ns}"
        except Exception:
            signature = source_path
        sha = hashlib.sha256(signature.encode("utf-8", errors="ignore")).hexdigest()

    if copy_to_assets:
        try:
            ext = os.path.splitext(source_path)[1] or _extension_for_mime(mime)
            role_name = _safe_id(role, "file")
            node_name = _safe_id(node_id, "node")
            folder = os.path.join(root, sha[:2])
            os.makedirs(folder, exist_ok=True)
            copied_path = _find_existing_hashed_asset(root, sha, ext) or os.path.abspath(os.path.join(folder, f"{node_name}.{role_name}.{sha[:16]}{ext}"))
            if os.path.abspath(source_path) != copied_path:
                if not os.path.exists(copied_path):
                    tmp_path = f"{copied_path}.tmp"
                    shutil.copy2(source_path, tmp_path)
                    os.replace(tmp_path, copied_path)
                path = copied_path
                copied = True
        except Exception as err:
            copy_error = f"{type(err).__name__}: {err}"

    relative_path = _asset_relative_path(path, root)
    return {
        "kind": "canvas_output_file",
        "asset_id": f"file:{sha[:24]}",
        "project_id": _safe_id(project_id),
        "owner": str(owner or "guest"),
        "node_id": str(node_id or ""),
        "role": role,
        "mime": mime,
        "size": size,
        "sha256": sha,
        "path": path,
        "asset_relative_path": relative_path,
        "relative_path": relative_path,
        "asset_root_key": "project_asset_root" if relative_path else "",
        "output_path": source_path,
        "original_output_path": source_path,
        "preview_url": _file_preview_url(path),
        "name": os.path.basename(path),
        "width": width,
        "height": height,
        "duration": info.get("duration"),
        "fps": info.get("fps"),
        "frame_count": info.get("frame_count"),
        "waveform": waveform,
        "edit": info.get("edit") if isinstance(info.get("edit"), dict) else None,
        "generation_metadata": generation_metadata,
        "asset_root": root,
        "copied_to_assets": copied,
        "copy_error": copy_error,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def _asset_localized_text(state_params, en, cn):
    lang = str(state_params.get("__lang") or "") if isinstance(state_params, dict) else ""
    return en if lang.lower().startswith("en") else cn


def _materialize_video_last_frame(project_id, state_params, source, main_ref, node_id):
    transform = source.get("transform") if isinstance(source.get("transform"), dict) else {}
    if str(transform.get("kind") or "").strip().lower() != "video_last_frame":
        return main_ref, ""

    source_path = str(main_ref.get("path") or "") if isinstance(main_ref, dict) else ""
    if not source_path or not os.path.exists(source_path):
        return None, _asset_localized_text(
            state_params,
            "The previous shot video is unavailable for last-frame extraction.",
            "上一段视频不可用，无法提取尾帧。",
        )

    try:
        stat = os.stat(source_path)
        signature = f"{os.path.realpath(source_path)}|{stat.st_size}|{stat.st_mtime_ns}|last_frame_v1"
        digest = hashlib.sha256(signature.encode("utf-8", errors="ignore")).hexdigest()[:24]
        root, _ = _asset_root(project_id, state_params)
        output_dir = os.path.join(root, "derived")
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.abspath(os.path.join(output_dir, f"{digest}.last_frame.png"))
        if not os.path.exists(output_path) or os.path.getsize(output_path) <= 0:
            import modules.util as util

            if not util.extract_video_last_frame(source_path, output_path):
                return None, _asset_localized_text(
                    state_params,
                    "The previous shot's last frame could not be decoded.",
                    "无法解码上一段尾帧。",
                )
        frame_ref = register_existing_file_asset(
            output_path,
            project_id,
            state_params,
            node_id=node_id,
            role="previous_segment_last_frame",
            metadata={"mime": "image/png"},
            copy_to_assets=False,
        )
        if not frame_ref:
            return None, _asset_localized_text(
                state_params,
                "The previous shot's last frame could not be registered as an image.",
                "上一段尾帧无法登记为图片素材。",
            )
        frame_ref["source_video_path"] = source_path
        frame_ref["source_asset_id"] = main_ref.get("asset_id")
        frame_ref["transform"] = {"kind": "video_last_frame"}
        return frame_ref, ""
    except Exception as err:
        return None, _asset_localized_text(
            state_params,
            f"Previous-shot last-frame extraction failed: {type(err).__name__}: {err}",
            f"提取上一段尾帧失败：{type(err).__name__}: {err}",
        )


def materialize_node_asset(project_id, state_params, source):
    if not isinstance(source, dict):
        return {"ok": False, "error": "source is not an object"}

    node_id = str(source.get("node_id") or "")
    asset = source.get("asset") if isinstance(source.get("asset"), dict) else {}
    mask = source.get("mask") if isinstance(source.get("mask"), dict) else {}

    main_ref = None
    if asset.get("data_url"):
        role = "asset"
        mime = str(asset.get("mime") or "")
        if mime.startswith("image/"):
            role = "image"
        elif mime.startswith("video/"):
            role = "video"
        elif mime.startswith("audio/"):
            role = "audio"
        main_ref = save_data_url_asset(
            asset.get("data_url"),
            project_id,
            state_params,
            node_id=node_id,
            role=role,
            metadata=asset,
        )
    elif asset.get("path") or asset.get("output_path") or asset.get("asset_relative_path") or asset.get("relative_path"):
        path = _resolve_asset_file_path(asset, project_id, state_params)
        root, _ = _asset_root(project_id, state_params)
        resolved_relative_path = _asset_relative_path(path, root) if path else ""
        main_ref = {
            "kind": "existing_file",
            "asset_id": asset.get("asset_id") or asset.get("asset_relative_path") or asset.get("path") or asset.get("output_path"),
            "node_id": node_id,
            "path": path,
            "asset_relative_path": resolved_relative_path or asset.get("asset_relative_path") or asset.get("relative_path") or "",
            "relative_path": resolved_relative_path or asset.get("relative_path") or asset.get("asset_relative_path") or "",
            "asset_root": root if resolved_relative_path else asset.get("asset_root") or "",
            "asset_root_key": "project_asset_root" if resolved_relative_path else asset.get("asset_root_key") or "",
            "preview_url": _file_preview_url(path) if path else asset.get("preview_url") or "",
            "output_path": asset.get("output_path") or "",
            "original_output_path": asset.get("original_output_path") or "",
            "mime": asset.get("mime"),
            "width": asset.get("width"),
            "height": asset.get("height"),
            "duration": asset.get("duration"),
            "fps": asset.get("fps"),
            "frame_count": asset.get("frame_count"),
            "waveform": _normalize_waveform_values(asset.get("waveform"), 160),
            "size": asset.get("size"),
            "generation_metadata": asset.get("generation_metadata") if isinstance(asset.get("generation_metadata"), dict) else {},
        }
    elif asset:
        main_ref = {
            "kind": "browser_unmaterialized",
            "asset_id": asset.get("asset_id"),
            "node_id": node_id,
            "mime": asset.get("mime"),
            "width": asset.get("width"),
            "height": asset.get("height"),
            "duration": asset.get("duration"),
            "fps": asset.get("fps"),
            "frame_count": asset.get("frame_count"),
            "waveform": _normalize_waveform_values(asset.get("waveform"), 160),
            "size": asset.get("size"),
        }

    if main_ref and isinstance(main_ref, dict):
        mime = main_ref.get("mime") or asset.get("mime") or mimetypes.guess_type(str(main_ref.get("path") or ""))[0] or ""
        path = main_ref.get("path")
        duration = main_ref.get("duration") or asset.get("duration")
        if path and os.path.exists(path) and not duration:
            duration = _probe_media_metadata(path, mime).get("duration")
        if path and os.path.exists(path) and not main_ref.get("generation_metadata"):
            main_ref["generation_metadata"] = extract_media_metadata(path, mime=mime)
        edit_range = _media_edit_range(asset, duration=duration)
        if path and edit_range:
            trimmed_path = _trim_media_file(
                path,
                mime,
                edit_range,
                project_id,
                state_params,
                node_id=node_id,
                role="video" if str(mime).startswith("video/") else "audio",
            )
            trimmed_ref = register_existing_file_asset(
                trimmed_path,
                project_id,
                state_params,
                node_id=node_id,
                role="trimmed_video" if str(mime).startswith("video/") else "trimmed_audio",
                metadata={
                    "mime": mime,
                    "width": asset.get("width"),
                    "height": asset.get("height"),
                    "duration": edit_range.get("duration"),
                    "fps": asset.get("fps"),
                    "frame_count": max(1, int(round(float(asset.get("fps")) * float(edit_range.get("duration"))))) if asset.get("fps") and edit_range.get("duration") else None,
                    "edit": edit_range,
                },
                copy_to_assets=False,
            )
            if trimmed_ref:
                trimmed_ref["source_path"] = path
                trimmed_ref["edit"] = edit_range
                main_ref = trimmed_ref

    if main_ref:
        main_ref, transform_error = _materialize_video_last_frame(
            project_id,
            state_params,
            source,
            main_ref,
            node_id,
        )
        if transform_error:
            return {
                "ok": False,
                "node_id": node_id,
                "asset_ref": None,
                "mask_ref": None,
                "error": transform_error,
            }

    mask_ref = None
    if mask.get("data_url"):
        mask_ref = save_data_url_asset(
            mask.get("data_url"),
            project_id,
            state_params,
            node_id=node_id,
            role="mask",
            metadata=mask,
        )

    return {
        "ok": bool(main_ref),
        "node_id": node_id,
        "asset_ref": main_ref,
        "mask_ref": mask_ref,
        "error": None if main_ref else "source asset has no materializable data",
    }


def list_project_assets(project_id, state_params, options=None):
    options = options if isinstance(options, dict) else {}
    max_files = max(50, min(int(options.get("max_files") or 1500), 10000))
    max_seconds = max(0.5, min(float(options.get("max_seconds") or 2.5), 15.0))
    include_dimensions = bool(options.get("include_dimensions"))
    root, user_did = _asset_root(project_id, state_params)
    items = []
    truncated = False
    start_at = time.time()
    scanned_dirs = 0
    if os.path.isdir(root):
        for dirpath, _, filenames in os.walk(root):
            scanned_dirs += 1
            for filename in filenames:
                if len(items) >= max_files or (time.time() - start_at) > max_seconds:
                    truncated = True
                    break
                path = os.path.abspath(os.path.join(dirpath, filename))
                try:
                    stat = os.stat(path)
                except Exception:
                    continue
                mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
                width = None
                height = None
                if include_dimensions and Image is not None and str(mime).startswith("image/"):
                    try:
                        with Image.open(path) as image:
                            width, height = image.size
                    except Exception:
                        pass
                items.append({
                    "name": filename,
                    "path": path,
                    "relative_path": os.path.relpath(path, root),
                    "mime": mime,
                    "size": stat.st_size,
                    "updated_at": stat.st_mtime,
                    "width": width,
                    "height": height,
                    "preview_url": _file_preview_url(path),
                })
            if truncated:
                break
    return {
        "ok": True,
        "project_id": _safe_id(project_id),
        "owner": str(user_did or "guest"),
        "asset_root": root,
        "assets": items,
        "truncated": truncated,
        "scan_limit": max_files,
        "scan_elapsed": round(time.time() - start_at, 4),
        "scanned_dirs": scanned_dirs,
        "include_dimensions": include_dimensions,
    }


def delete_project_assets(project_id, state_params, paths):
    root, user_did = _asset_root(project_id, state_params)
    root_real = os.path.realpath(root)
    deleted = []
    skipped = []
    for raw_path in paths or []:
        raw_text = str(raw_path or "").strip()
        if os.path.isabs(raw_text):
            path = os.path.realpath(os.path.abspath(raw_text))
        else:
            path = os.path.realpath(os.path.abspath(os.path.join(root_real, raw_text.replace("/", os.sep))))
        if not path.startswith(root_real + os.sep):
            skipped.append({"path": raw_path, "reason": "outside_asset_root"})
            continue
        if not os.path.exists(path) or not os.path.isfile(path):
            skipped.append({"path": raw_path, "reason": "missing"})
            continue
        try:
            os.remove(path)
            deleted.append(path)
            parent = os.path.dirname(path)
            while parent.startswith(root_real) and parent != root_real:
                try:
                    os.rmdir(parent)
                except OSError:
                    break
                parent = os.path.dirname(parent)
        except Exception as err:
            skipped.append({"path": raw_path, "reason": f"{type(err).__name__}: {err}"})
    return {
        "ok": True,
        "project_id": _safe_id(project_id),
        "owner": str(user_did or "guest"),
        "asset_root": root,
        "deleted": deleted,
        "skipped": skipped,
    }
