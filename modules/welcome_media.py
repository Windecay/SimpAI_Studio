from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps

import shared


MEDIA_CATALOG = "studio_ui"
MEDIA_FOLDER = "welcome"
MANIFEST_FILENAME = "manifest.json"
MANIFEST_VERSION = 1

TITLE_KIND = "title"
WAITING_KIND = "waiting"
MEDIA_KINDS = {TITLE_KIND, WAITING_KIND}

STATIC_INPUT_MAX_BYTES = 10 * 1024 * 1024
STATIC_INPUT_MAX_EDGE = 4096
STATIC_INPUT_MAX_PIXELS = 16_000_000
STATIC_DESKTOP_BOX = (1600, 1200)
STATIC_MOBILE_BOX = (900, 1200)
STATIC_DESKTOP_MAX_BYTES = 2 * 1024 * 1024
STATIC_MOBILE_MAX_BYTES = 1 * 1024 * 1024

ANIMATED_INPUT_MAX_BYTES = 8 * 1024 * 1024
ANIMATED_INPUT_MAX_EDGE = 1920
ANIMATED_INPUT_MAX_PIXELS = 2_800_000
ANIMATED_INPUT_MAX_DURATION = 12.0
ANIMATED_INPUT_MAX_FRAMES = 144
ANIMATED_INPUT_MAX_FPS = 24.0
ANIMATED_DESKTOP_BOX = (1280, 960)
ANIMATED_MOBILE_BOX = (720, 960)
ANIMATED_DESKTOP_FPS = 12.0
ANIMATED_MOBILE_FPS = 10.0
ANIMATED_MAX_DURATION = 8.0
ANIMATED_DESKTOP_MAX_BYTES = 4 * 1024 * 1024
ANIMATED_MOBILE_MAX_BYTES = 2 * 1024 * 1024

ALLOWED_PIL_FORMATS = {"JPEG", "PNG", "GIF", "WEBP"}
ALLOWED_UPLOAD_SUFFIXES = {".jpg", ".jpeg", ".png", ".apng", ".gif", ".webp"}

_WRITE_LOCK = threading.RLock()


_MESSAGES = {
    "permission_denied": (
        "Welcome images can only be changed locally or by a signed-in identity.",
        "只有本机用户或已登录身份可以更换欢迎图片。",
    ),
    "missing_file": ("Select an image file first.", "请先选择图片文件。"),
    "unsupported_format": (
        "Use JPG, PNG, GIF, animated WebP, or APNG.",
        "请使用 JPG、PNG、GIF、animated WebP 或 APNG。",
    ),
    "invalid_image": ("The selected file is not a valid image.", "所选文件不是有效图片。"),
    "static_file_too_large": (
        "Static images must not exceed 10 MiB.",
        "静态图片不能超过 10 MiB。",
    ),
    "static_dimensions_too_large": (
        "Static images must stay within 4096px and 16 megapixels.",
        "静态图片最长边不能超过 4096px，总像素不能超过 1600 万。",
    ),
    "animated_file_too_large": (
        "Animated images must not exceed 8 MiB.",
        "动态图不能超过 8 MiB。",
    ),
    "animated_dimensions_too_large": (
        "Animated images must stay within 1920px and 2.8 megapixels per frame.",
        "动态图最长边不能超过 1920px，单帧不能超过 280 万像素。",
    ),
    "animated_too_long": (
        "Animated images must not exceed 12 seconds.",
        "动态图不能超过 12 秒。",
    ),
    "animated_too_many_frames": (
        "Animated images must not exceed 144 frames.",
        "动态图不能超过 144 帧。",
    ),
    "animated_fps_too_high": (
        "Animated images must not exceed 24 FPS.",
        "动态图不能超过 24 FPS。",
    ),
    "ffmpeg_unavailable": (
        "FFmpeg is required to optimize animated welcome images.",
        "优化动态欢迎图片需要 FFmpeg。",
    ),
    "optimization_failed": (
        "The image could not be reduced to the mobile size limit.",
        "图片处理后仍然超过移动端限制。",
    ),
    "save_failed": ("The welcome image could not be saved.", "欢迎图片保存失败。"),
    "saved_title": ("Title image replaced.", "标题图片已替换。"),
    "saved_waiting": (
        "Generation waiting image replaced. It will be used for the next task.",
        "生成等待图片已替换，将在下一个任务中使用。",
    ),
    "restored_title": ("Default title image restored.", "已恢复默认标题图片。"),
    "restored_waiting": (
        "Default generation waiting image restored.",
        "已恢复默认生成等待图片。",
    ),
}


class WelcomeMediaError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class MediaInfo:
    path: str
    file_size: int
    width: int
    height: int
    image_format: str
    animated: bool
    frames: int
    duration: float
    fps: float


@dataclass(frozen=True)
class SavedWelcomeMedia:
    kind: str
    desktop_path: str
    mobile_path: str
    animated: bool


def _is_cn(state_params: Any) -> bool:
    if not isinstance(state_params, dict):
        return False
    value = str(state_params.get("__lang") or "").strip().lower()
    return value.startswith(("cn", "zh"))


def localized_message(state_params: Any, key: str) -> str:
    english, chinese = _MESSAGES.get(key, _MESSAGES["save_failed"])
    return chinese if _is_cn(state_params) else english


def error_message(state_params: Any, error: BaseException) -> str:
    code = error.code if isinstance(error, WelcomeMediaError) else "save_failed"
    return localized_message(state_params, code)


def _normalize_kind(kind: Any) -> str:
    value = str(kind or "").strip().lower()
    if value not in MEDIA_KINDS:
        raise WelcomeMediaError("save_failed")
    return value


def _state_user_did(state_params: Any) -> str:
    if isinstance(state_params, dict):
        user = state_params.get("user")
        if user is not None and hasattr(user, "get_did"):
            try:
                value = str(user.get_did() or "").strip()
                if value:
                    return value
            except Exception:
                pass
        value = str(state_params.get("user_did") or "").strip()
        if value:
            return value

    token = getattr(shared, "token", None)
    if token is not None:
        for method_name in ("get_default_workspace_did", "get_guest_did"):
            method = getattr(token, method_name, None)
            if callable(method):
                try:
                    value = str(method() or "").strip()
                    if value:
                        return value
                except Exception:
                    pass
    return "local"


def _can_write(state_params: Any) -> bool:
    did = _state_user_did(state_params)
    token = getattr(shared, "token", None)
    try:
        from modules.access_mode import is_local_mode

        if is_local_mode():
            return True
    except Exception:
        pass
    if isinstance(state_params, dict) and bool(state_params.get("local_access")):
        return True
    if token is not None and hasattr(token, "is_guest"):
        try:
            return not bool(token.is_guest(did))
        except Exception:
            pass
    return bool(did and did not in {"guest", "unknown"})


def _safe_did(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._") or "local"


def media_root(state_params: Any, create: bool = False) -> str:
    did = _state_user_did(state_params)
    token = getattr(shared, "token", None)
    root = None
    if token is not None and hasattr(token, "get_path_in_user_dir"):
        try:
            root = token.get_path_in_user_dir(did, MEDIA_CATALOG)
        except Exception:
            root = None
    if not root:
        configured_userhome = None
        try:
            from modules import config as config_module

            configured_userhome = getattr(config_module, "path_userhome", None)
        except Exception:
            configured_userhome = None
        userhome = getattr(shared, "path_userhome", None) or configured_userhome or "users"
        root = os.path.join(userhome, _safe_did(did), MEDIA_CATALOG)
    root = os.path.abspath(os.path.join(root, MEDIA_FOLDER))
    if create:
        os.makedirs(root, exist_ok=True)
    return root


def _manifest_path(state_params: Any) -> str:
    return os.path.join(media_root(state_params, create=False), MANIFEST_FILENAME)


def _empty_manifest() -> dict[str, Any]:
    return {"version": MANIFEST_VERSION}


def _load_manifest(state_params: Any) -> dict[str, Any]:
    path = _manifest_path(state_params)
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if not isinstance(payload, dict):
            return _empty_manifest()
        payload["version"] = MANIFEST_VERSION
        return payload
    except Exception:
        return _empty_manifest()


def _save_manifest(state_params: Any, payload: dict[str, Any]) -> None:
    root = media_root(state_params, create=True)
    fd, temp_path = tempfile.mkstemp(prefix="manifest-", suffix=".json.tmp", dir=root)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, os.path.join(root, MANIFEST_FILENAME))
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        try:
            os.remove(temp_path)
        except OSError:
            pass
        raise WelcomeMediaError("save_failed")


def _safe_manifest_asset(root: str, filename: Any) -> str | None:
    name = str(filename or "").strip()
    if not name or os.path.basename(name) != name:
        return None
    candidate = os.path.abspath(os.path.join(root, name))
    try:
        if os.path.commonpath([root, candidate]) != root:
            return None
    except ValueError:
        return None
    return candidate if os.path.isfile(candidate) else None


def resolve_custom_media(state_params: Any, kind: str, is_mobile: bool = False) -> str | None:
    kind = _normalize_kind(kind)
    root = media_root(state_params, create=False)
    entry = _load_manifest(state_params).get(kind)
    if not isinstance(entry, dict):
        return None
    keys = ("mobile", "desktop") if is_mobile else ("desktop",)
    for key in keys:
        path = _safe_manifest_asset(root, entry.get(key))
        if path:
            return path
    return None


def has_custom_media(state_params: Any, kind: str) -> bool:
    return bool(resolve_custom_media(state_params, kind, False) or resolve_custom_media(state_params, kind, True))


def _upload_path(value: Any) -> str:
    if isinstance(value, (list, tuple)):
        value = value[0] if value else None
    if isinstance(value, dict):
        value = value.get("path") or value.get("name")
    if value is not None and not isinstance(value, (str, os.PathLike)):
        value = getattr(value, "path", None) or getattr(value, "name", None)
    path = os.path.abspath(os.fspath(value)) if value else ""
    if not path or not os.path.isfile(path):
        raise WelcomeMediaError("missing_file")
    if Path(path).suffix.lower() not in ALLOWED_UPLOAD_SUFFIXES:
        raise WelcomeMediaError("unsupported_format")
    return path


def inspect_media(value: Any) -> MediaInfo:
    path = _upload_path(value)
    file_size = os.path.getsize(path)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(path) as image:
                image_format = str(image.format or "").upper()
                if image_format not in ALLOWED_PIL_FORMATS:
                    raise WelcomeMediaError("unsupported_format")
                width, height = image.size
                frames = max(1, int(getattr(image, "n_frames", 1) or 1))
                animated = frames > 1
                duration_ms = 0
                if animated:
                    if file_size > ANIMATED_INPUT_MAX_BYTES:
                        raise WelcomeMediaError("animated_file_too_large")
                    if max(width, height) > ANIMATED_INPUT_MAX_EDGE or width * height > ANIMATED_INPUT_MAX_PIXELS:
                        raise WelcomeMediaError("animated_dimensions_too_large")
                    if frames > ANIMATED_INPUT_MAX_FRAMES:
                        raise WelcomeMediaError("animated_too_many_frames")
                    for index in range(frames):
                        image.seek(index)
                        frame_duration = image.info.get("duration", 100)
                        try:
                            frame_duration = max(1, int(frame_duration or 100))
                        except (TypeError, ValueError):
                            frame_duration = 100
                        duration_ms += frame_duration
                else:
                    if file_size > STATIC_INPUT_MAX_BYTES:
                        raise WelcomeMediaError("static_file_too_large")
                    if max(width, height) > STATIC_INPUT_MAX_EDGE or width * height > STATIC_INPUT_MAX_PIXELS:
                        raise WelcomeMediaError("static_dimensions_too_large")
                duration = duration_ms / 1000.0 if animated else 0.0
                fps = frames / duration if animated and duration > 0 else 0.0
    except WelcomeMediaError:
        raise
    except Exception as error:
        raise WelcomeMediaError("invalid_image") from error

    if animated:
        if duration > ANIMATED_INPUT_MAX_DURATION:
            raise WelcomeMediaError("animated_too_long")
        if fps > ANIMATED_INPUT_MAX_FPS + 0.01:
            raise WelcomeMediaError("animated_fps_too_high")

    return MediaInfo(
        path=path,
        file_size=file_size,
        width=width,
        height=height,
        image_format=image_format,
        animated=animated,
        frames=frames,
        duration=duration,
        fps=fps,
    )


def _fit_dimensions(width: int, height: int, box: tuple[int, int], scale: float = 1.0) -> tuple[int, int]:
    max_width = max(2, int(box[0] * scale))
    max_height = max(2, int(box[1] * scale))
    ratio = min(1.0, max_width / max(width, 1), max_height / max(height, 1))
    target_width = max(2, int(round(width * ratio)))
    target_height = max(2, int(round(height * ratio)))
    target_width -= target_width % 2
    target_height -= target_height % 2
    return max(2, target_width), max(2, target_height)


def _temp_webp(root: str) -> str:
    fd, path = tempfile.mkstemp(prefix="welcome-", suffix=".webp", dir=root)
    os.close(fd)
    return path


def _commit_asset(temp_path: str, root: str, kind: str, variant: str) -> tuple[str, bool]:
    digest = hashlib.sha256()
    with open(temp_path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    filename = f"{kind}-{variant}-{digest.hexdigest()[:16]}.webp"
    final_path = os.path.join(root, filename)
    if os.path.exists(final_path):
        os.remove(temp_path)
        return final_path, False
    os.replace(temp_path, final_path)
    return final_path, True


def _copy_webp_variant(info: MediaInfo, root: str, kind: str, variant: str) -> tuple[str, bool]:
    temp_path = _temp_webp(root)
    try:
        shutil.copyfile(info.path, temp_path)
        return _commit_asset(temp_path, root, kind, variant)
    except Exception:
        try:
            os.remove(temp_path)
        except OSError:
            pass
        raise


def _can_copy_webp_directly(info: MediaInfo) -> bool:
    if info.image_format != "WEBP":
        return False
    byte_limit = ANIMATED_MOBILE_MAX_BYTES if info.animated else STATIC_MOBILE_MAX_BYTES
    return info.file_size <= byte_limit


def _static_base_image(path: str) -> Image.Image:
    try:
        with Image.open(path) as source:
            source.load()
            image = ImageOps.exif_transpose(source)
            has_alpha = image.mode in {"RGBA", "LA"} or (image.mode == "P" and "transparency" in image.info)
            return image.convert("RGBA" if has_alpha else "RGB")
    except Exception as error:
        raise WelcomeMediaError("invalid_image") from error


def _encode_static_variant(
    image: Image.Image,
    root: str,
    kind: str,
    variant: str,
    box: tuple[int, int],
    byte_limit: int,
) -> tuple[str, bool]:
    attempts = ((1.0, 82), (1.0, 74), (1.0, 66), (0.85, 68), (0.72, 62))
    for scale, quality in attempts:
        temp_path = _temp_webp(root)
        try:
            target = image.copy()
            target.thumbnail(
                (max(2, int(box[0] * scale)), max(2, int(box[1] * scale))),
                Image.Resampling.LANCZOS,
            )
            target.save(temp_path, format="WEBP", quality=quality, method=6)
            if os.path.getsize(temp_path) <= byte_limit:
                return _commit_asset(temp_path, root, kind, variant)
        except Exception:
            pass
        try:
            os.remove(temp_path)
        except OSError:
            pass
    raise WelcomeMediaError("optimization_failed")


def _ffmpeg_executable() -> str | None:
    executable = shutil.which("ffmpeg")
    if executable:
        return executable
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def _encode_animated_variant(
    info: MediaInfo,
    root: str,
    kind: str,
    variant: str,
    box: tuple[int, int],
    target_fps: float,
    byte_limit: int,
) -> tuple[str, bool]:
    ffmpeg = _ffmpeg_executable()
    if not ffmpeg:
        raise WelcomeMediaError("ffmpeg_unavailable")

    fps = min(target_fps, info.fps) if info.fps > 0 else target_fps
    fps = max(1.0, fps)
    duration = min(ANIMATED_MAX_DURATION, info.duration) if info.duration > 0 else ANIMATED_MAX_DURATION
    attempts = ((1.0, 75), (1.0, 65), (1.0, 55), (0.85, 60), (0.72, 55))
    creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0

    for scale, quality in attempts:
        width, height = _fit_dimensions(info.width, info.height, box, scale)
        temp_path = _temp_webp(root)
        command = [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            info.path,
            "-an",
            "-t",
            f"{duration:.3f}",
            "-vf",
            f"fps={fps:.3f},scale={width}:{height}:flags=lanczos",
            "-c:v",
            "libwebp_anim",
            "-pix_fmt",
            "yuva420p",
            "-preset",
            "picture",
            "-quality",
            str(quality),
            "-loop",
            "0",
            temp_path,
        ]
        try:
            completed = subprocess.run(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
                timeout=120,
                creationflags=creation_flags,
            )
            if completed.returncode == 0 and os.path.getsize(temp_path) <= byte_limit:
                with Image.open(temp_path) as output:
                    output_frames = int(getattr(output, "n_frames", 1) or 1)
                if output_frames > 1:
                    return _commit_asset(temp_path, root, kind, variant)
        except Exception:
            pass
        try:
            os.remove(temp_path)
        except OSError:
            pass
    raise WelcomeMediaError("optimization_failed")


def _referenced_filenames(payload: dict[str, Any]) -> set[str]:
    names: set[str] = set()
    for kind in MEDIA_KINDS:
        entry = payload.get(kind)
        if not isinstance(entry, dict):
            continue
        for key in ("desktop", "mobile"):
            name = str(entry.get(key) or "").strip()
            if name and os.path.basename(name) == name:
                names.add(name)
    return names


def _remove_unreferenced_assets(root: str, payload: dict[str, Any]) -> None:
    referenced = _referenced_filenames(payload)
    try:
        filenames = os.listdir(root)
    except OSError:
        return
    for filename in filenames:
        if filename in referenced or filename == MANIFEST_FILENAME:
            continue
        if not re.match(r"^(title|waiting)-(desktop|mobile)-[0-9a-f]{16}\.webp$", filename):
            continue
        try:
            os.remove(os.path.join(root, filename))
        except OSError:
            pass


def replace_media(value: Any, kind: str, state_params: Any) -> SavedWelcomeMedia:
    kind = _normalize_kind(kind)
    if not _can_write(state_params):
        raise WelcomeMediaError("permission_denied")
    info = inspect_media(value)

    with _WRITE_LOCK:
        root = media_root(state_params, create=True)
        created_paths: list[str] = []
        try:
            if _can_copy_webp_directly(info):
                desktop_path, desktop_created = _copy_webp_variant(info, root, kind, "desktop")
                if desktop_created:
                    created_paths.append(desktop_path)
                mobile_path, mobile_created = _copy_webp_variant(info, root, kind, "mobile")
                if mobile_created:
                    created_paths.append(mobile_path)
            elif info.animated:
                desktop_path, desktop_created = _encode_animated_variant(
                    info,
                    root,
                    kind,
                    "desktop",
                    ANIMATED_DESKTOP_BOX,
                    ANIMATED_DESKTOP_FPS,
                    ANIMATED_DESKTOP_MAX_BYTES,
                )
                if desktop_created:
                    created_paths.append(desktop_path)
                mobile_path, mobile_created = _encode_animated_variant(
                    info,
                    root,
                    kind,
                    "mobile",
                    ANIMATED_MOBILE_BOX,
                    ANIMATED_MOBILE_FPS,
                    ANIMATED_MOBILE_MAX_BYTES,
                )
                if mobile_created:
                    created_paths.append(mobile_path)
            else:
                image = _static_base_image(info.path)
                desktop_path, desktop_created = _encode_static_variant(
                    image,
                    root,
                    kind,
                    "desktop",
                    STATIC_DESKTOP_BOX,
                    STATIC_DESKTOP_MAX_BYTES,
                )
                if desktop_created:
                    created_paths.append(desktop_path)
                mobile_path, mobile_created = _encode_static_variant(
                    image,
                    root,
                    kind,
                    "mobile",
                    STATIC_MOBILE_BOX,
                    STATIC_MOBILE_MAX_BYTES,
                )
                if mobile_created:
                    created_paths.append(mobile_path)

            manifest = _load_manifest(state_params)
            manifest[kind] = {
                "desktop": os.path.basename(desktop_path),
                "mobile": os.path.basename(mobile_path),
                "animated": info.animated,
            }
            _save_manifest(state_params, manifest)
            _remove_unreferenced_assets(root, manifest)
            return SavedWelcomeMedia(kind, desktop_path, mobile_path, info.animated)
        except WelcomeMediaError:
            for path in created_paths:
                try:
                    os.remove(path)
                except OSError:
                    pass
            raise
        except Exception as error:
            for path in created_paths:
                try:
                    os.remove(path)
                except OSError:
                    pass
            raise WelcomeMediaError("save_failed") from error


def restore_default(kind: str, state_params: Any) -> None:
    kind = _normalize_kind(kind)
    if not _can_write(state_params):
        raise WelcomeMediaError("permission_denied")
    with _WRITE_LOCK:
        manifest = _load_manifest(state_params)
        manifest.pop(kind, None)
        _save_manifest(state_params, manifest)
        _remove_unreferenced_assets(media_root(state_params, create=False), manifest)


def saved_message_key(kind: str) -> str:
    return "saved_waiting" if _normalize_kind(kind) == WAITING_KIND else "saved_title"


def restored_message_key(kind: str) -> str:
    return "restored_waiting" if _normalize_kind(kind) == WAITING_KIND else "restored_title"
