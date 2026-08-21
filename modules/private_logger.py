import os
import time
import args_manager
import modules.config
import json
import html
import shutil
import subprocess
import enhanced.all_parameters as ads
import shared
import numpy as np

from PIL import Image
from PIL.PngImagePlugin import PngInfo
from io import BytesIO
from modules.flags import OutputFormat
from modules.meta_parser import MetadataParser, get_exif
from modules.util import generate_temp_filename
from enhanced.simpleai import get_media_info
import logging
from enhanced.logger import format_name
logger = logging.getLogger(format_name(__name__))

log_cache = {}
max_html_log_bytes = 24 * 1024 * 1024


def _queue_media_library_index(file_path, user_did=None):
    """Schedule indexing after a persisted output has been fully written."""

    try:
        from modules.media_library import queue_media_file_index

        queue_media_file_index(file_path, user_did=user_did)
    except (Exception, SystemExit) as exc:
        logger.debug("Media library indexing was not queued for %s: %s", file_path, exc)


def _get_ffmpeg_exe():
    try:
        import imageio_ffmpeg
        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if exe and os.path.exists(exe):
            return exe
    except Exception:
        pass
    return shutil.which("ffmpeg")


def _escape_ffmetadata(key, value):
    value = str(value)
    value = value.replace("\\", "\\\\")
    value = value.replace(";", "\\;")
    value = value.replace("#", "\\#")
    value = value.replace("=", "\\=")
    value = value.replace("\n", "\\\n")
    return f"{key}={value}"


def _embed_video_metadata(file_path, parsed_parameters, metadata_scheme):
    if not parsed_parameters or not os.path.exists(file_path):
        return False

    ffmpeg_exe = _get_ffmpeg_exe()
    if not ffmpeg_exe:
        logger.warning("FFmpeg not found. Skipping video metadata embedding.")
        return False

    root, ext = os.path.splitext(file_path)
    if not ext:
        return False
    metadata_path = f"{root}.metadata.txt"
    output_path = f"{root}.metadata.tmp{ext}"

    try:
        metadata_fields = {
            "comment": parsed_parameters,
            "simpleai_metadata": parsed_parameters,
        }
        try:
            parsed_json = json.loads(parsed_parameters)
            manifest_raw = parsed_json.get("simpleai_regen_manifest") if isinstance(parsed_json, dict) else None
            manifest = json.loads(manifest_raw) if isinstance(manifest_raw, str) else manifest_raw
            workflow = manifest.get("workflow") if isinstance(manifest, dict) else None
            if workflow:
                metadata_fields["workflow"] = json.dumps(workflow, ensure_ascii=False)
                metadata_fields["comment"] = json.dumps(
                    {"workflow": workflow, "prompt": parsed_json},
                    ensure_ascii=False,
                )
        except Exception:
            pass

        with open(metadata_path, "w", encoding="utf-8") as f:
            f.write(";FFMETADATA1\n")
            for key, value in metadata_fields.items():
                f.write(_escape_ffmetadata(key, value) + "\n")
            if metadata_scheme:
                f.write(_escape_ffmetadata("metadata_scheme", metadata_scheme) + "\n")

        args = [
            ffmpeg_exe,
            "-v",
            "error",
            "-y",
            "-i",
            file_path,
            "-i",
            metadata_path,
            "-map",
            "0",
            "-c",
            "copy",
            "-map_metadata",
            "1",
            "-metadata",
            "creation_time=now",
        ]
        if ext.lower() in (".mp4", ".mov", ".m4v"):
            args += ["-movflags", "use_metadata_tags"]
        args.append(output_path)

        subprocess.run(args, capture_output=True, check=True)
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            os.replace(output_path, file_path)
            return True
    except Exception as e:
        logger.warning(f"Failed to embed video metadata into {file_path}: {e}")
    finally:
        for path in (metadata_path, output_path):
            try:
                if os.path.exists(path):
                    os.remove(path)
            except Exception:
                pass
    return False


def _is_exif_too_long_error(exc):
    message = str(exc or "").lower()
    return "exif" in message and "too long" in message


def _reset_seekable_target(target):
    try:
        if hasattr(target, "seek"):
            target.seek(0)
        if hasattr(target, "truncate"):
            target.truncate(0)
    except Exception:
        pass


def _save_image_with_exif_fallback(image, target, *, exif=None, context="", **save_kwargs):
    kwargs = dict(save_kwargs)
    if exif is not None:
        kwargs["exif"] = exif
    try:
        image.save(target, **kwargs)
        return True
    except ValueError as exc:
        if exif is None or not _is_exif_too_long_error(exc):
            raise
        logger.warning(
            "Image EXIF metadata is too long; saving without embedded EXIF. context=%s error=%s",
            context or "image_save",
            exc,
        )
        kwargs.pop("exif", None)
        _reset_seekable_target(target)
        image.save(target, **kwargs)
        return False


def get_current_html_path(output_format=None, user_did=None):

    if not user_did:
        user_did = shared.token.get_guest_did()
    user_path_outputs = modules.config.get_user_path_outputs(user_did)
    output_format = output_format if output_format else modules.config.default_output_format
    date_string, local_temp_filename, only_name = generate_temp_filename(folder=user_path_outputs,
                                                                         extension=output_format)
    html_name = os.path.join(os.path.dirname(local_temp_filename), 'log.html')
    return html_name

css_styles = (
    "<style>"
    "body { background-color: #121212; color: #E0E0E0; } "
    "a { color: #BB86FC; } "
    ".log-entries { display: flex; flex-direction: column-reverse; align-items: flex-start; } "
    ".metadata { border-collapse: collapse; width: 100%; } "
    ".metadata .label { width: 15%; } "
    ".metadata .value { width: 85%; font-weight: bold; } "
    ".metadata th, .metadata td { border: 1px solid #4d4d4d; padding: 4px; } "
    ".metadata pre { white-space: pre-wrap; word-break: break-word; font-weight: normal; } "
    ".image-container img, .image-container video, .image-container audio { height: auto; max-width: 512px; display: block; padding-right:10px; } "
    ".image-container div { text-align: center; padding: 4px; } "
    "hr { border-color: gray; } "
    "</style>"
)

log_split_marker = "<!--fooocus-log-split-->"
begin_part_html = lambda date_string: f"<!DOCTYPE html><html><head><title>SimpAI Studio Log {date_string}</title>{css_styles}</head><body><p>SimpAI Studio Log {date_string} (private)</p>\n<p>Metadata is embedded if enabled in the config or developer debug mode. You can find the information for each media item in line Metadata Scheme.</p>{log_split_marker}\n<main class=\"log-entries\">\n\n"
end_part = f'\n</main>\n{log_split_marker}</body></html>'


def _extract_log_entries(html_text):
    existing_split = html_text.split(log_split_marker)
    middle_part = existing_split[1] if len(existing_split) == 3 else existing_split[0]
    start_tag = '<main class="log-entries">'
    end_tag = '</main>'
    if start_tag in middle_part:
        middle_part = middle_part.split(start_tag, 1)[1]
    if end_tag in middle_part:
        middle_part = middle_part.rsplit(end_tag, 1)[0]
    return middle_part

def append_item_to_html_log(html_name, date_string, item_html):
    begin_part = begin_part_html(date_string)
    footer_bytes = end_part.encode("utf-8")
    item_bytes = item_html.encode("utf-8")

    try:
        if os.path.exists(html_name) and os.path.getsize(html_name) >= max_html_log_bytes:
            out_dir = os.path.dirname(html_name)
            stamp = time.strftime("%H%M%S")
            archive_name = os.path.join(out_dir, f"log_{date_string}_{stamp}.html")
            suffix = 1
            while os.path.exists(archive_name):
                archive_name = os.path.join(out_dir, f"log_{date_string}_{stamp}_{suffix}.html")
                suffix += 1
            os.replace(html_name, archive_name)
            log_cache.pop(html_name, None)
    except OSError:
        pass

    if not os.path.exists(html_name):
        with open(html_name, "wb") as f:
            f.write((begin_part).encode("utf-8"))
            f.write(item_bytes)
            f.write(footer_bytes)
        log_cache.pop(html_name, None)
        return

    try:
        with open(html_name, "rb+") as f:
            f.seek(0, os.SEEK_END)
            file_size = f.tell()
            if file_size >= len(footer_bytes):
                f.seek(-len(footer_bytes), os.SEEK_END)
                if f.read(len(footer_bytes)) == footer_bytes:
                    f.seek(-len(footer_bytes), os.SEEK_END)
                    f.write(item_bytes)
                    f.write(footer_bytes)
                    f.truncate()
                    log_cache.pop(html_name, None)
                    return
    except OSError:
        pass

    if os.path.exists(html_name):
        middle_part = _extract_log_entries(open(html_name, "r", encoding="utf-8").read())
    else:
        middle_part = ""
    with open(html_name, "w", encoding="utf-8") as f:
        f.write(begin_part + middle_part + item_html + end_part)
    log_cache.pop(html_name, None)

def item_head_html(only_name):
    root, ext = os.path.splitext(only_name)
    ext = ext.lower()
    is_video = ext in ['.mp4', '.webm']
    is_audio = ext in ['.wav', '.mp3', '.flac', '.ogg', '.opus', '.m4a', '.aac']

    div_name = only_name.replace('.', '_')
    item_head = f"<div id=\"{div_name}\" class=\"image-container\"><hr><table><tr>\n"
    if is_video:
        item_head += f"<td><a href=\"{only_name}\" target=\"_blank\"><video src='{only_name}' controls width='512' onerror=\"this.closest('.image-container').style.display='none';\" loading='lazy'></video></a><div>{only_name}</div></td>"
    elif is_audio:
        item_head += f"<td><audio src='{only_name}' controls preload='none' style='width: 512px; height: 54px; display: block;' onerror=\"this.closest('.image-container').style.display='none';\"></audio><div><a href=\"{only_name}\" target=\"_blank\">{only_name}</a></div></td>"
    else:
        item_head += f"<td><a href=\"{only_name}\" target=\"_blank\"><img src='{only_name}' onerror=\"this.closest('.image-container').style.display='none';\" loading='lazy'/></a><div>{only_name}</div></td>"
    return item_head


def _is_regen_manifest_metadata(label, key):
    return label == "SimpleAI Regen Manifest" or key == "simpleai_regen_manifest"


def _metadata_value_html(label, key, value):
    value_txt = str(value)
    if _is_regen_manifest_metadata(label, key):
        value_txt = html.escape(value_txt)
        return f"<details><summary>SimpleAI Regen Manifest</summary><pre>{value_txt}</pre></details>"
    return value_txt.replace("\n", " </br> ")


def log_audio_file(audio_path: str, metadata, user_did=None):
    if not audio_path:
        return audio_path
    if args_manager.args.disable_image_log:
        _queue_media_library_index(audio_path, user_did=user_did)
        return audio_path

    if not user_did:
        user_did = shared.token.get_guest_did()

    local_audio_path = os.path.abspath(audio_path)
    out_dir = os.path.dirname(local_audio_path)
    only_name = os.path.basename(local_audio_path)
    date_string = os.path.basename(out_dir) if out_dir else ""
    if not date_string:
        date_string = "unknown"

    html_name = os.path.join(out_dir, "log.html")

    item_head = item_head_html(only_name)

    item = "<td><table class='metadata'>"
    for label, key, value in metadata or []:
        value_txt = str(value)
        if len(value_txt) > 2000:
            value_txt = value_txt[:2000] + "..."
        value_txt = _metadata_value_html(label, key, value_txt)
        item += f"<tr><td class='label'>{label}</td><td class='value'>{value_txt}</td></tr>\n"
    item += "</table>"
    item += "</td>"
    item += "</tr></table></div>\n\n"

    append_item_to_html_log(html_name, date_string, item_head + item)
    _queue_media_library_index(local_audio_path, user_did=user_did)
    try:
        log_ext(local_audio_path)
    except Exception:
        pass

    return audio_path

def log(img, metadata, metadata_parser: MetadataParser | None = None, output_format=None, task=None, persist_image=True, user_did=None, remote_task=None):
    global css_styles, end_part

    if not user_did:
        user_did = shared.token.get_guest_did()
    user_path_outputs = modules.config.get_user_path_outputs(user_did)

    is_image = isinstance(img, np.ndarray)
    media_type = 'image' if is_image else None
    format_name = None
    if not is_image:
        media_type, format_name = get_media_info(img[:8])
    disable_image_log = bool(getattr(args_manager.args, 'disable_image_log', False))
    is_video_result = media_type == 'video'
    path_outputs = user_path_outputs if is_video_result or (not disable_image_log and persist_image) else modules.config.temp_path
    logger.info(
        '[Output] private_log_path: media_type=%s, persist_image=%s, disable_image_log=%s, '
        'user_path_outputs=%s, temp_path=%s, selected_root=%s',
        media_type,
        persist_image,
        disable_image_log,
        os.path.abspath(user_path_outputs),
        os.path.abspath(modules.config.temp_path),
        os.path.abspath(path_outputs),
    )
    output_format = output_format if output_format else modules.config.default_output_format
    date_string, local_temp_filename, only_name = generate_temp_filename(folder=path_outputs, extension=output_format)
    os.makedirs(os.path.dirname(local_temp_filename), exist_ok=True)

    parsed_parameters = metadata_parser.to_string(metadata.copy()) if metadata_parser is not None else ''
    metadata_scheme = metadata_parser.get_scheme().value if metadata_parser is not None else ''

    if is_image:
        image = Image.fromarray(img)
        img_byte_result = BytesIO()

        if output_format == OutputFormat.PNG.value or (image.mode == 'RGBA' and output_format == OutputFormat.JPEG.value):
            if metadata_scheme == 'simple':
                pnginfo = PngInfo()
                pnginfo.add_text("Comment", parsed_parameters)
            elif metadata_parser:
                pnginfo = PngInfo()
                pnginfo.add_text('parameters', parsed_parameters)
                pnginfo.add_text('metadata_scheme', metadata_parser.get_scheme().value)
            else:
                pnginfo = None
            if output_format == OutputFormat.JPEG.value:
                local_temp_filename = local_temp_filename[:-4] + "png"
            if remote_task is None:
                image.save(local_temp_filename, pnginfo=pnginfo)
            else:
                image.save(img_byte_result, format='PNG', pnginfo=pnginfo)
        elif output_format == OutputFormat.JPEG.value and image.mode != 'RGBA':
            exif = get_exif(parsed_parameters, metadata_scheme) if metadata_parser else Image.Exif()
            if remote_task is None:
                _save_image_with_exif_fallback(image, local_temp_filename, quality=95, optimize=True, progressive=True, exif=exif, context=local_temp_filename)
            else:
                _save_image_with_exif_fallback(image, img_byte_result, format='JPEG', quality=95, optimize=True, progressive=True, exif=exif, context="remote_jpeg")
        elif output_format == OutputFormat.WEBP.value:
            exif = get_exif(parsed_parameters, metadata_scheme) if metadata_parser else Image.Exif()
            if remote_task is None:
                _save_image_with_exif_fallback(image, local_temp_filename, quality=95, lossless=False, exif=exif, context=local_temp_filename)
            else:
                _save_image_with_exif_fallback(image, img_byte_result, format='WEBP', quality=95, lossless=False, exif=exif, context="remote_webp")
        else:
            if remote_task is None:
                image.save(local_temp_filename)
            else:
                image.save(img_byte_result, format=output_format)

        if remote_task is not None:
            img_byte_result.seek(0)

        img_result = img_byte_result.getvalue()

    else:
        local_temp_filename_root, _ = os.path.splitext(local_temp_filename)
        local_temp_filename = f'{local_temp_filename_root}.{format_name}'
        only_name_root, _ = os.path.splitext(only_name)
        only_name = f'{only_name_root}.{format_name}'
        if remote_task is None:
            with open(local_temp_filename, "wb") as f:
                f.write(img[8:])
            if media_type == 'video' and metadata_parser is not None:
                _embed_video_metadata(local_temp_filename, parsed_parameters, metadata_scheme)
        img_result = img

    if disable_image_log:
        if remote_task is None:
            _queue_media_library_index(local_temp_filename, user_did=user_did)
        return local_temp_filename, img_result, ''

    html_name = os.path.join(os.path.dirname(local_temp_filename), 'log.html')

    item_head = item_head_html(only_name)
    
    item = "<td><table class='metadata'>"
    for label, key, value in metadata:
        value_txt = _metadata_value_html(label, key, value)
        item += f"<tr><td class='label'>{label}</td><td class='value'>{value_txt}</td></tr>\n"

    if task is not None and 'positive' in task and 'negative' in task:
        full_prompt_details = f"""<details><summary>Positive</summary>{', '.join(task['positive'])}</details>
        <details><summary>Negative</summary>{', '.join(task['negative'])}</details>"""
        item += f"<tr><td class='label'>Full raw prompt</td><td class='value'>{full_prompt_details}</td></tr>\n"

    item += "</table>"
    item += "</td>"
    item += "</tr></table></div>\n\n"

    if remote_task is None:
        append_item_to_html_log(html_name, date_string, item_head + item)
        _queue_media_library_index(local_temp_filename, user_did=user_did)

        logger.info(f'Image generated with private log at: {html_name}')
    
        log_ext(local_temp_filename)

    return local_temp_filename, img_result, item


def p2p_log(result_img, result_log, output_format, persist_image=True, user_did=None):
    global css_styles, end_part

    if not user_did:
        user_did = shared.token.get_guest_did()
    user_path_outputs = modules.config.get_user_path_outputs(user_did)

    media_type, format_name = get_media_info(result_img[:8])
    disable_image_log = bool(getattr(args_manager.args, 'disable_image_log', False))
    is_video_result = media_type == 'video'
    path_outputs = user_path_outputs if is_video_result or (not disable_image_log and persist_image) else modules.config.temp_path
    logger.info(
        '[Output] p2p_log_path: media_type=%s, persist_image=%s, disable_image_log=%s, '
        'user_path_outputs=%s, temp_path=%s, selected_root=%s',
        media_type,
        persist_image,
        disable_image_log,
        os.path.abspath(user_path_outputs),
        os.path.abspath(modules.config.temp_path),
        os.path.abspath(path_outputs),
    )
    output_format = output_format if output_format else modules.config.default_output_format
    date_string, local_temp_filename, only_name = generate_temp_filename(folder=path_outputs, extension=output_format)
    os.makedirs(os.path.dirname(local_temp_filename), exist_ok=True)

    if media_type=='video':
        local_temp_filename_root, _ = os.path.splitext(local_temp_filename)
        local_temp_filename = f'{local_temp_filename_root}.{format_name}'
        only_name_root, _ = os.path.splitext(only_name)
        only_name = f'{only_name_root}.{format_name}'
        result_img = result_img[8:]
    with open(local_temp_filename, "wb") as f:
        f.write(result_img)

    if disable_image_log:
        _queue_media_library_index(local_temp_filename, user_did=user_did)
        return local_temp_filename

    html_name = os.path.join(os.path.dirname(local_temp_filename), 'log.html')
    
    item_head = item_head_html(only_name)

    append_item_to_html_log(html_name, date_string, item_head + result_log)
    _queue_media_library_index(local_temp_filename, user_did=user_did)

    logger.info(f'Image generated with private log at: {html_name}')

    log_ext(local_temp_filename)

    return local_temp_filename

def log_ext(file_name):
    dirname, filename = os.path.split(file_name)
    log_name = os.path.join(dirname, "log_ads.json")
    
    log_ext = {}
    if os.path.exists(log_name):
        with open(log_name, "r", encoding="utf-8") as log_file:
            log_ext.update(json.load(log_file))
    
    ads_ext = {} #ads.get_diff_for_log_ext()
    if len(ads_ext.keys())==0:
        return

    log_ext.update({filename: ads_ext})

    with open(log_name, 'w', encoding='utf-8') as log_file:
        json.dump(log_ext, log_file)

    logger.info(f'Image generated with advanced params log at: {log_name}')
    return 

