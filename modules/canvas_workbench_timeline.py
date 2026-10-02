import hashlib
import json
import mimetypes
import os
import re
import shutil
import subprocess
import time

import shared
from modules import canvas_workbench_assets


def _num(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return float(default)


def _clamp(value, low, high):
    return max(low, min(high, value))


def _asset_path(asset, project_id, state_params, node_id, role):
    if not isinstance(asset, dict):
        return "", ""
    path = asset.get("path") or asset.get("output_path") or asset.get("original_output_path")
    mime = asset.get("mime") or mimetypes.guess_type(str(path or ""))[0] or ""
    if path and os.path.exists(path):
        return os.path.abspath(path), mime
    if asset.get("data_url"):
        saved = canvas_workbench_assets.save_data_url_asset(
            asset.get("data_url"),
            project_id,
            state_params,
            node_id=node_id,
            role=role,
            metadata=asset,
        )
        if saved and saved.get("path"):
            return os.path.abspath(saved.get("path")), saved.get("mime") or mime
    return "", mime


def _filter_escape_path(path):
    return str(path or "").replace("\\", "/")


def _asset_dimensions(asset, path, mime):
    width = _num(asset.get("width"), 0) if isinstance(asset, dict) else 0
    height = _num(asset.get("height"), 0) if isinstance(asset, dict) else 0
    if width > 0 and height > 0:
        return width, height
    probed = canvas_workbench_assets._probe_media_metadata(path, mime)
    width = width or _num(probed.get("width"), 0)
    height = height or _num(probed.get("height"), 0)
    if width > 0 and height > 0:
        return width, height
    image_api = getattr(canvas_workbench_assets, "Image", None)
    if image_api is not None and str(mime or "").startswith("image/") and path and os.path.exists(path):
        try:
            with image_api.open(path) as image:
                return float(image.size[0]), float(image.size[1])
        except Exception:
            pass
    return 0, 0


def _contain_box(asset, path, mime, canvas_width, canvas_height, fit_canvas=None):
    if isinstance(fit_canvas, dict):
        fit_canvas_width = _num(fit_canvas.get("width"), 0)
        fit_canvas_height = _num(fit_canvas.get("height"), 0)
        if fit_canvas_width > 0 and fit_canvas_height > 0:
            # Connected H3 shots share a native canvas before fitting the final output.
            _, _, inner_width, inner_height = _contain_box(
                asset, path, mime, fit_canvas_width, fit_canvas_height,
            )
            _, _, outer_width, outer_height = _contain_box(
                fit_canvas, "", "", canvas_width, canvas_height,
            )
            width = max(2, round(inner_width * outer_width / fit_canvas_width))
            height = max(2, round(inner_height * outer_height / fit_canvas_height))
            return round((canvas_width - width) / 2), round((canvas_height - height) / 2), width, height
    asset_width, asset_height = _asset_dimensions(asset, path, mime)
    if asset_width <= 0 or asset_height <= 0:
        return 0, 0, int(canvas_width), int(canvas_height)
    canvas_aspect = max(0.01, float(canvas_width) / max(1.0, float(canvas_height)))
    asset_aspect = max(0.01, min(100.0, float(asset_width) / max(1.0, float(asset_height))))
    if asset_aspect >= canvas_aspect:
        fit_width = float(canvas_width)
        fit_height = fit_width / asset_aspect
    else:
        fit_height = float(canvas_height)
        fit_width = fit_height * asset_aspect
    fit_width = min(int(canvas_width), max(2, int(round(fit_width))))
    fit_height = min(int(canvas_height), max(2, int(round(fit_height))))
    fit_x = int(round((float(canvas_width) - fit_width) / 2.0))
    fit_y = int(round((float(canvas_height) - fit_height) / 2.0))
    return fit_x, fit_y, fit_width, fit_height


def _keyframe_value_at(layer, prop, default, frame_time):
    frames = layer.get("keyframes") if isinstance(layer.get("keyframes"), list) else []
    keyed = []
    for frame in frames:
        values = frame.get("values") if isinstance(frame, dict) and isinstance(frame.get("values"), dict) else {}
        if prop not in values:
            continue
        keyed.append((max(0.0, _num(frame.get("time"), 0)), _num(values.get(prop), default), str(frame.get("easing") or "linear")))
    if not keyed:
        return default
    keyed.sort(key=lambda item: item[0])
    time_value = max(0.0, _num(frame_time, 0))
    if time_value <= keyed[0][0]:
        return keyed[0][1]
    if time_value >= keyed[-1][0]:
        return keyed[-1][1]
    for index in range(len(keyed) - 1):
        start_t, start_v, easing = keyed[index]
        end_t, end_v, _ = keyed[index + 1]
        if time_value < start_t or time_value > end_t:
            continue
        span = max(0.000001, end_t - start_t)
        amount = _apply_keyframe_easing(_clamp((time_value - start_t) / span, 0.0, 1.0), easing)
        return start_v + (end_v - start_v) * amount
    return default


def _apply_keyframe_easing(amount, easing):
    t = _clamp(float(amount or 0.0), 0.0, 1.0)
    if easing == "hold":
        return 0.0
    if easing == "ease_in":
        return t * t * t
    if easing == "ease_out":
        return 1.0 - pow(1.0 - t, 3)
    if easing == "easy_ease":
        return 4.0 * t * t * t if t < 0.5 else 1.0 - pow(-2.0 * t + 2.0, 3) / 2.0
    return t


def _has_keyframed_prop(layer, prop):
    frames = layer.get("keyframes") if isinstance(layer.get("keyframes"), list) else []
    for frame in frames:
        values = frame.get("values") if isinstance(frame, dict) and isinstance(frame.get("values"), dict) else {}
        if prop in values:
            return True
    return False


def _ff_expr_escape(expr):
    return str(expr or "0").replace("\\", "\\\\").replace(",", "\\,")


def _ff_keyframe_expr(layer, prop, default, time_expr):
    frames = layer.get("keyframes") if isinstance(layer.get("keyframes"), list) else []
    keyed = []
    for frame in frames:
        values = frame.get("values") if isinstance(frame, dict) and isinstance(frame.get("values"), dict) else {}
        if prop not in values:
            continue
        keyed.append((max(0.0, _num(frame.get("time"), 0)), _num(values.get(prop), default), str(frame.get("easing") or "linear")))
    if not keyed:
        return f"{float(default):.8f}"
    keyed.sort(key=lambda item: item[0])

    def ease_expr(progress, easing):
        if easing == "hold":
            return "0"
        if easing == "ease_in":
            return f"(({progress})*({progress})*({progress}))"
        if easing == "ease_out":
            return f"(1-pow(1-({progress}),3))"
        if easing == "easy_ease":
            return f"if(lt(({progress}),0.5),4*({progress})*({progress})*({progress}),1-pow(-2*({progress})+2,3)/2)"
        return progress

    expr = f"{keyed[-1][1]:.8f}"
    for index in range(len(keyed) - 2, -1, -1):
        start_t, start_v, easing = keyed[index]
        end_t, end_v, _ = keyed[index + 1]
        span = max(0.000001, end_t - start_t)
        progress = f"min(max((({time_expr})-{start_t:.8f})/{span:.8f},0),1)"
        value_expr = f"({start_v:.8f}+({end_v - start_v:.8f})*({ease_expr(progress, easing)}))"
        expr = f"if(lte(({time_expr}),{start_t:.8f}),{start_v:.8f},if(lte(({time_expr}),{end_t:.8f}),{value_expr},{expr}))"
    first_t, first_v, _ = keyed[0]
    return f"if(lte(({time_expr}),{first_t:.8f}),{first_v:.8f},{expr})"


def _resolved_transform(layer, frame_time):
    transform = dict(layer.get("transform") if isinstance(layer.get("transform"), dict) else {})
    if isinstance(layer.get("keyframes"), list) and layer.get("keyframes"):
        transform["x_percent"] = _keyframe_value_at(layer, "x", _num(transform.get("x_percent"), 0), frame_time)
        transform["y_percent"] = _keyframe_value_at(layer, "y", _num(transform.get("y_percent"), 0), frame_time)
        transform["scale"] = _keyframe_value_at(layer, "scale", _num(transform.get("scale"), 1), frame_time)
        transform["rotate_degrees"] = _keyframe_value_at(layer, "rotate", _num(transform.get("rotate_degrees"), 0), frame_time)
        transform["opacity"] = _keyframe_value_at(layer, "opacity", _num(transform.get("opacity"), 1), frame_time)
        transform.pop("geometry_pixels", None)
    return transform


def _state_user_did(state_params):
    try:
        user = state_params.get("user") if isinstance(state_params, dict) else None
        if user is not None and hasattr(user, "get_did"):
            did = user.get_did()
            if did:
                return did
    except Exception:
        pass
    if isinstance(state_params, dict):
        did = state_params.get("__user_did") or state_params.get("user_did") or state_params.get("did") or None
        if did:
            return did
    try:
        if shared.token is not None:
            return shared.token.get_guest_did()
    except Exception:
        pass
    return None


def _publish_timeline_to_gallery(output_path, digest, node_id, state_params):
    if not output_path or not os.path.exists(output_path):
        return None
    try:
        from modules import config
    except Exception:
        return None
    user_did = _state_user_did(state_params)
    output_root = config.get_user_path_outputs(user_did)
    date_folder = time.strftime("%Y-%m-%d")
    gallery_folder = os.path.join(output_root, date_folder)
    os.makedirs(gallery_folder, exist_ok=True)
    name = f"{canvas_workbench_assets._safe_id(node_id, 'timeline')}.timeline.{digest[:16]}.mp4"
    gallery_path = os.path.abspath(os.path.join(gallery_folder, name))
    try:
        if not os.path.exists(gallery_path) or os.path.getsize(gallery_path) != os.path.getsize(output_path):
            shutil.copy2(output_path, gallery_path)
    except Exception:
        return None
    gallery = {
        "engine_type": "video",
        "path": gallery_path,
        "relative_path": os.path.join(date_folder, name),
    }
    try:
        import enhanced.gallery as gallery_util

        max_per_page = 18
        max_catalog = getattr(config, "default_image_catalog_max_number", 100)
        gallery_util.invalidate_output_list_cache(user_did, "video")
        output_list, finished_nums, finished_pages = gallery_util.refresh_output_list(
            max_per_page,
            max_catalog,
            user_did,
            "video",
        )
        gallery.update({
            "stat": f"{finished_nums},{finished_pages}",
            "output_count": len(output_list or []),
            "latest": output_list[0] if output_list else None,
        })
    except Exception as err:
        gallery["error"] = f"{type(err).__name__}: {err}"
    return gallery


def _run_timeline_ffmpeg(cmd, duration, progress_callback=None, cancel_callback=None):
    timeout = max(60, int(duration * 6 + 60))
    if progress_callback is None and cancel_callback is None:
        return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout), False
    import tempfile

    def report(output):
        if not progress_callback:
            return
        if isinstance(output, bytes):
            output = output.decode("utf-8", errors="replace")
        times = re.findall(r"out_time_us=(\d+)", output or "")
        if times:
            progress_callback(min(0.99, int(times[-1]) / 1000000 / max(0.05, duration)))

    with tempfile.TemporaryFile() as errors:
        process = subprocess.Popen(
            cmd[:1] + ["-progress", "pipe:1", "-nostats"] + cmd[1:],
            stdout=subprocess.PIPE, stderr=errors, text=True,
        )
        started = time.monotonic()
        cancelled = False
        output = ""
        try:
            while True:
                if cancel_callback and cancel_callback():
                    cancelled = True
                    process.terminate()
                    break
                if time.monotonic() - started > timeout:
                    raise subprocess.TimeoutExpired(cmd, timeout)
                try:
                    output, _ = process.communicate(timeout=0.2)
                    report(output)
                    break
                except subprocess.TimeoutExpired as pending:
                    report(pending.output)
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    output, _ = process.communicate(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    output, _ = process.communicate(timeout=3)
        errors.seek(0)
        details = errors.read().decode("utf-8", errors="replace")
        return subprocess.CompletedProcess(cmd, process.returncode, output, details), cancelled


def render_timeline(payload, state_params=None, progress_callback=None, cancel_callback=None):
    state_params = state_params if isinstance(state_params, dict) else {}
    project_id = str(payload.get("project_id") or "default")
    node_id = str(payload.get("node_id") or "timeline")
    publish_gallery = payload.get("publish_gallery") is not False
    render_payload = payload.get("payload") if isinstance(payload.get("payload"), dict) else {}
    canvas = render_payload.get("canvas") if isinstance(render_payload.get("canvas"), dict) else {}
    layers = render_payload.get("layers") if isinstance(render_payload.get("layers"), list) else []
    audio_layers = render_payload.get("audio") if isinstance(render_payload.get("audio"), list) else []

    width = max(16, int(round(_num(canvas.get("width"), 1280))))
    height = max(16, int(round(_num(canvas.get("height"), 720))))
    fps = _clamp(_num(canvas.get("fps"), 30), 1, 120)
    frame_exact = render_payload.get("frame_exact") is True
    minimum_clip = 1 / fps if frame_exact else 0.05
    time_precision = 6 if frame_exact else 3
    duration = max(0.05, _num(canvas.get("duration"), 1))
    background = str(canvas.get("background") or "#000000").strip() or "#000000"
    if not background.startswith("#"):
        background = "#000000"
    background_filter = "0x" + background.lstrip("#")[:6]

    ffmpeg = canvas_workbench_assets._get_ffmpeg_exe()
    if not ffmpeg:
        return {"ok": False, "error": "ffmpeg is not available"}

    signature = json.dumps({"renderer": "timeline_ffmpeg.v8_keyframe_expr", "payload": render_payload}, ensure_ascii=False, sort_keys=True, default=str)
    digest = hashlib.sha256(signature.encode("utf-8", errors="ignore")).hexdigest()
    root, _ = canvas_workbench_assets._asset_root(project_id, state_params)
    folder = os.path.join(root, digest[:2])
    os.makedirs(folder, exist_ok=True)
    output_path = os.path.abspath(os.path.join(folder, f"{canvas_workbench_assets._safe_id(node_id, 'timeline')}.timeline.{digest[:16]}.mp4"))
    if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
        asset_ref = canvas_workbench_assets.register_existing_file_asset(
            output_path,
            project_id,
            state_params,
            node_id=node_id,
            role="timeline_render",
            metadata={"mime": "video/mp4", "width": width, "height": height, "duration": round(duration, 3), "fps": fps},
            copy_to_assets=False,
        )
        gallery = _publish_timeline_to_gallery(output_path, digest, node_id, state_params) if publish_gallery else None
        return {"ok": True, "asset_ref": asset_ref, "cached": True, "path": output_path, "gallery": gallery}

    cmd = [ffmpeg, "-y"]
    filters = [f"color=c={background_filter}:s={width}x{height}:d={duration:.3f}:r={fps:.3f},format=rgba[base]"]
    visual_inputs = []
    audio_inputs = []
    input_count = 0

    for layer in sorted(layers, key=lambda item: _num(item.get("z_index"), 0)):
        timing = layer.get("timing") if isinstance(layer.get("timing"), dict) else {}
        clip_duration = max(minimum_clip, min(duration, _num(timing.get("duration"), duration)))
        clip_in = max(0.0, _num(timing.get("in"), 0))
        asset = layer.get("asset") if isinstance(layer.get("asset"), dict) else {}
        path, mime = _asset_path(asset, project_id, state_params, node_id, "timeline_visual")
        if not path:
            continue
        input_index = input_count
        if str(mime).startswith("image/"):
            cmd += ["-loop", "1", "-t", f"{clip_duration:.3f}", "-i", path]
        else:
            cmd += ["-ss", f"{clip_in:.{time_precision}f}", "-t", f"{clip_duration:.{time_precision}f}", "-i", path]
        input_count += 1
        mask_input_index = None
        mask = layer.get("mask") if isinstance(layer.get("mask"), dict) else {}
        mask_asset = mask.get("asset") if isinstance(mask.get("asset"), dict) else mask
        mask_path, _mask_mime = _asset_path(mask_asset, project_id, state_params, node_id, "timeline_mask")
        if mask_path:
            mask_input_index = input_count
            cmd += ["-loop", "1", "-t", f"{duration:.3f}", "-i", mask_path]
            input_count += 1
        visual_inputs.append((input_index, layer, mime, mask_input_index))

    for item in audio_layers:
        timing = item.get("timing") if isinstance(item.get("timing"), dict) else {}
        clip_duration = max(minimum_clip, min(duration, _num(timing.get("duration"), duration)))
        clip_in = max(0.0, _num(timing.get("in"), 0))
        asset = item.get("asset") if isinstance(item.get("asset"), dict) else {}
        path, mime = _asset_path(asset, project_id, state_params, node_id, "timeline_audio")
        if not path:
            continue
        input_index = input_count
        cmd += ["-ss", f"{clip_in:.{time_precision}f}", "-t", f"{clip_duration:.{time_precision}f}", "-i", path]
        input_count += 1
        audio_inputs.append((input_index, item, mime))

    current = "base"
    for index, (input_index, layer, _mime, mask_input_index) in enumerate(visual_inputs):
        timing = layer.get("timing") if isinstance(layer.get("timing"), dict) else {}
        crop = layer.get("crop_percent") if isinstance(layer.get("crop_percent"), dict) else {}
        start = _clamp(_num(timing.get("start"), 0), 0, duration)
        transform = _resolved_transform(layer, start)
        has_scale_keyframes = _has_keyframed_prop(layer, "scale")
        has_rotate_keyframes = _has_keyframed_prop(layer, "rotate")
        has_opacity_keyframes = _has_keyframed_prop(layer, "opacity")
        has_x_keyframes = _has_keyframed_prop(layer, "x")
        has_y_keyframes = _has_keyframed_prop(layer, "y")
        clip_duration = max(minimum_clip, min(duration - start, _num(timing.get("duration"), duration)))
        end = min(duration, start + clip_duration)
        opacity = _clamp(_num(transform.get("opacity"), 1), 0, 1)
        layer_alpha = 1.0 if mask_input_index is not None else opacity
        scale = max(0.05, _num(transform.get("scale"), 1))
        rotate = _num(transform.get("rotate_degrees"), 0)
        x_percent = _num(transform.get("x_percent"), 0)
        y_percent = _num(transform.get("y_percent"), 0)
        geometry_pixels = transform.get("geometry_pixels") if isinstance(transform.get("geometry_pixels"), dict) else {}
        debug_geometry = bool(layer.get("debug_geometry"))
        left = _clamp(_num(crop.get("left"), 0), 0, 95) / 100
        right = _clamp(_num(crop.get("right"), 0), 0, 95) / 100
        top = _clamp(_num(crop.get("top"), 0), 0, 95) / 100
        bottom = _clamp(_num(crop.get("bottom"), 0), 0, 95) / 100
        _fit_x, _fit_y, fit_w, fit_h = _contain_box(asset, path, _mime, width, height, transform.get("fit_canvas"))
        scaled_w = max(2, int(round(fit_w * scale)))
        scaled_h = max(2, int(round(fit_h * scale)))
        if geometry_pixels:
            scaled_w = max(2, int(round(_num(geometry_pixels.get("width"), scaled_w))))
            scaled_h = max(2, int(round(_num(geometry_pixels.get("height"), scaled_h))))
        crop_x = max(0, int(round(scaled_w * left)))
        crop_y = max(0, int(round(scaled_h * top)))
        crop_w = max(2, int(round(scaled_w * max(0.01, 1 - left - right))))
        crop_h = max(2, int(round(scaled_h * max(0.01, 1 - top - bottom))))
        crop_w = min(crop_w, max(2, scaled_w - crop_x))
        crop_h = min(crop_h, max(2, scaled_h - crop_y))
        has_crop = any(value > 0 for value in (left, right, top, bottom))
        if has_scale_keyframes:
            scale_expr_local = _ff_keyframe_expr(layer, "scale", scale, f"t+{start:.8f}")
            scale_w_expr = _ff_expr_escape(f"max(2,round({fit_w:.8f}*({scale_expr_local})))")
            scale_h_expr = _ff_expr_escape(f"max(2,round({fit_h:.8f}*({scale_expr_local})))")
            scale_filter = f"scale=w='{scale_w_expr}':h='{scale_h_expr}':eval=frame"
        else:
            scale_filter = f"scale={scaled_w}:{scaled_h}"
        if debug_geometry:
            filters.append(
                f"color=c=white@1:s={scaled_w}x{scaled_h}:d={duration:.3f}:r={fps:.3f},format=rgba,setsar=1[fit{index}]"
            )
        else:
            filters.append(
                f"[{input_index}:v]fps={fps:.3f},{scale_filter},format=rgba,setsar=1[fit{index}]"
            )
        if mask_input_index is not None:
            filters.append(
                f"[{mask_input_index}:v]scale={width}:{height},format=rgba,alphaextract,setsar=1[mask{index}]"
            )
        layer_source = f"fit{index}"
        if has_crop:
            filters.append(f"color=c=black@0:s={scaled_w}x{scaled_h}:d={duration:.3f}:r={fps:.3f},format=rgba[cropbase{index}]")
            filters.append(f"[fit{index}]crop={crop_w}:{crop_h}:{crop_x}:{crop_y}[cropclip{index}]")
            filters.append(f"[cropbase{index}][cropclip{index}]overlay=x={crop_x}:y={crop_y}:shortest=1[cropfit{index}]")
            layer_source = f"cropfit{index}"
        normalized_rotate = abs(rotate % 360)
        if has_rotate_keyframes:
            rotate_expr = _ff_expr_escape(_ff_keyframe_expr(layer, "rotate", rotate, f"t+{start:.8f}"))
            rotate_filter = f"rotate='{rotate_expr}*PI/180':c=none:ow=rotw(iw):oh=roth(ih),"
        else:
            rotate_filter = "" if normalized_rotate < 0.000001 or abs(normalized_rotate - 360) < 0.000001 else f"rotate={rotate:.6f}*PI/180:c=none:ow=rotw(iw):oh=roth(ih),"
        source_alpha = 1.0 if mask_input_index is not None else layer_alpha
        if has_opacity_keyframes and mask_input_index is None:
            opacity_expr = _ff_expr_escape(_ff_keyframe_expr(layer, "opacity", opacity, f"T+{start:.8f}"))
            alpha_filter = f"geq=r='r(X\\,Y)':g='g(X\\,Y)':b='b(X\\,Y)':a='alpha(X\\,Y)*({opacity_expr})',"
        else:
            alpha_filter = f"colorchannelmixer=aa={source_alpha:.6f},"
        filters.append(
            f"[{layer_source}]"
            f"{rotate_filter}"
            f"{alpha_filter}setpts=PTS-STARTPTS+{start:.6f}/TB[v{index}]"
        )
        normalized_rotate = abs(rotate % 360)
        if geometry_pixels and not (has_x_keyframes or has_y_keyframes or has_scale_keyframes or has_rotate_keyframes) and (normalized_rotate < 0.000001 or abs(normalized_rotate - 360) < 0.000001):
            x_expr = f"{int(round(_num(geometry_pixels.get('left'), 0)))}"
            y_expr = f"{int(round(_num(geometry_pixels.get('top'), 0)))}"
        else:
            x_percent_expr = _ff_keyframe_expr(layer, "x", x_percent, "t") if has_x_keyframes else f"{x_percent:.8f}"
            y_percent_expr = _ff_keyframe_expr(layer, "y", y_percent, "t") if has_y_keyframes else f"{y_percent:.8f}"
            x_expr = _ff_expr_escape(f"(W-w)/2+{width / 100:.8f}*({x_percent_expr})")
            y_expr = _ff_expr_escape(f"(H-h)/2+{height / 100:.8f}*({y_percent_expr})")
        if mask_input_index is not None:
            filters.append(f"color=c=black@0:s={width}x{height}:d={duration:.3f}:r={fps:.3f},format=rgba[blank{index}]")
            filters.append(
                f"[blank{index}][v{index}]overlay=x='{x_expr}':y='{y_expr}':enable='between(t,{start:.6f},{end:.6f})':shortest=0[placed{index}]"
            )
            filters.append(f"[placed{index}][mask{index}]alphamerge[placedm{index}]")
            if has_opacity_keyframes:
                opacity_expr = _ff_expr_escape(_ff_keyframe_expr(layer, "opacity", opacity, "T"))
                filters.append(f"[placedm{index}]geq=r='r(X\\,Y)':g='g(X\\,Y)':b='b(X\\,Y)':a='alpha(X\\,Y)*({opacity_expr})'[placedmo{index}]")
            else:
                filters.append(f"[placedm{index}]colorchannelmixer=aa={opacity:.6f}[placedmo{index}]")
            filters.append(
                f"[{current}][placedmo{index}]overlay=x=0:y=0:enable='between(t,{start:.6f},{end:.6f})':shortest=0[tmp{index}]"
            )
        else:
            filters.append(
                f"[{current}][v{index}]overlay=x='{x_expr}':y='{y_expr}':enable='between(t,{start:.6f},{end:.6f})':shortest=0[tmp{index}]"
            )
        current = f"tmp{index}"

    audio_labels = []
    for index, (input_index, item, _mime) in enumerate(audio_inputs):
        timing = item.get("timing") if isinstance(item.get("timing"), dict) else {}
        start = _clamp(_num(timing.get("start"), 0), 0, duration)
        clip_duration = max(minimum_clip, min(duration - start, _num(timing.get("duration"), duration)))
        volume = _clamp(_num(item.get("volume"), 1), 0, 2)
        delay = str(max(0, int(round(start * 48000)))) + "S" if frame_exact else str(max(0, int(round(start * 1000))))
        resample = "aresample=48000," if frame_exact else ""
        filters.append(
            f"[{input_index}:a]{resample}atrim=0:{clip_duration:.6f},asetpts=PTS-STARTPTS,volume={volume:.6f},adelay={delay}:all=1[a{index}]"
        )
        audio_labels.append(f"[a{index}]")

    filter_complex = ";".join(filters)
    cmd += [
        "-filter_complex", filter_complex,
        "-map", f"[{current}]",
    ]
    if audio_labels:
        normalization = ":normalize=0" if frame_exact else ""
        filter_complex += ";" + "".join(audio_labels) + f"amix=inputs={len(audio_labels)}:duration=longest:dropout_transition=0{normalization},atrim=0:{duration:.6f}[aud]"
        cmd[cmd.index("-filter_complex") + 1] = filter_complex
        cmd += ["-map", "[aud]", "-c:a", "aac", "-b:a", "192k"]
    else:
        cmd += ["-an"]
    tmp_path = output_path + ".tmp.mp4"
    cmd += [
        "-t", f"{duration:.3f}",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "veryfast",
        "-crf", "20",
        "-movflags", "+faststart",
        tmp_path,
    ]
    started = time.time()
    try:
        completed, cancelled = _run_timeline_ffmpeg(cmd, duration, progress_callback, cancel_callback)
    except Exception:
        if os.path.isfile(tmp_path):
            os.remove(tmp_path)
        raise
    if cancelled:
        if os.path.isfile(tmp_path):
            os.remove(tmp_path)
        return {"ok": False, "cancelled": True, "error": "Timeline render cancelled"}
    if completed.returncode != 0 or not os.path.exists(tmp_path) or os.path.getsize(tmp_path) <= 0:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass
        return {
            "ok": False,
            "error": "ffmpeg timeline render failed",
            "details": (completed.stderr or completed.stdout or "")[-2000:],
            "cmd": " ".join(_filter_escape_path(part) for part in cmd[:16]) + " ...",
        }
    os.replace(tmp_path, output_path)
    if progress_callback:
        progress_callback(1)
    asset_ref = canvas_workbench_assets.register_existing_file_asset(
        output_path,
        project_id,
        state_params,
        node_id=node_id,
        role="timeline_render",
        metadata={"mime": "video/mp4", "width": width, "height": height, "duration": round(duration, 3), "fps": fps},
        copy_to_assets=False,
    )
    gallery = _publish_timeline_to_gallery(output_path, digest, node_id, state_params) if publish_gallery else None
    return {
        "ok": True,
        "asset_ref": asset_ref,
        "path": output_path,
        "gallery": gallery,
        "elapsed": round(time.time() - started, 3),
        "visual_layers": len(visual_inputs),
        "audio_layers": len(audio_inputs),
    }


def render_timeline_frame(payload, state_params=None):
    state_params = state_params if isinstance(state_params, dict) else {}
    render_payload = payload.get("payload") if isinstance(payload.get("payload"), dict) else {}
    canvas = render_payload.get("canvas") if isinstance(render_payload.get("canvas"), dict) else {}
    layers = render_payload.get("layers") if isinstance(render_payload.get("layers"), list) else []
    project_id = str(payload.get("project_id") or "default")
    node_id = str(payload.get("node_id") or "timeline")
    width = max(16, int(round(_num(canvas.get("width"), 1280))))
    height = max(16, int(round(_num(canvas.get("height"), 720))))
    fps = _clamp(_num(canvas.get("fps"), 30), 1, 120)
    duration = max(0.05, _num(canvas.get("duration"), 1))
    frame_time = _clamp(_num(payload.get("time"), 0), 0, max(0.0, duration - 0.001))
    background = str(canvas.get("background") or "#000000").strip() or "#000000"
    if not background.startswith("#"):
        background = "#000000"
    background_filter = "0x" + background.lstrip("#")[:6]

    ffmpeg = canvas_workbench_assets._get_ffmpeg_exe()
    if not ffmpeg:
        return {"ok": False, "error": "ffmpeg is not available"}

    signature = json.dumps(
        {"renderer": "direct_png_filtergraph.v8_geometry_pixels", "payload": render_payload, "time": round(frame_time, 4)},
        ensure_ascii=False,
        sort_keys=True,
        default=str,
    )
    digest = hashlib.sha256(signature.encode("utf-8", errors="ignore")).hexdigest()
    root, _ = canvas_workbench_assets._asset_root(project_id, state_params)
    folder = os.path.join(root, digest[:2])
    os.makedirs(folder, exist_ok=True)
    output_path = os.path.abspath(os.path.join(
        folder,
        f"{canvas_workbench_assets._safe_id(node_id, 'timeline')}.frame.{int(round(frame_time * 1000)):06d}.{digest[:12]}.png",
    ))
    if not os.path.exists(output_path) or os.path.getsize(output_path) <= 0:
        tmp_path = output_path + ".tmp.png"
        cmd = [ffmpeg, "-y"]
        filters = [f"color=c={background_filter}:s={width}x{height}:d=0.100:r={fps:.3f},format=rgba[base]"]
        visual_inputs = []
        input_count = 0
        for layer in sorted(layers, key=lambda item: _num(item.get("z_index"), 0)):
            timing = layer.get("timing") if isinstance(layer.get("timing"), dict) else {}
            start = _clamp(_num(timing.get("start"), 0), 0, duration)
            clip_duration = max(0.05, _num(timing.get("duration"), duration))
            if frame_time < start or frame_time > start + clip_duration:
                continue
            clip_in = max(0.0, _num(timing.get("in"), 0) + frame_time - start)
            asset = layer.get("asset") if isinstance(layer.get("asset"), dict) else {}
            path, mime = _asset_path(asset, project_id, state_params, node_id, "timeline_frame_visual")
            if not path:
                continue
            input_index = input_count
            if str(mime).startswith("image/"):
                cmd += ["-loop", "1", "-t", "0.100", "-i", path]
            else:
                cmd += ["-ss", f"{clip_in:.6f}", "-t", "0.100", "-i", path]
            input_count += 1
            mask_input_index = None
            mask = layer.get("mask") if isinstance(layer.get("mask"), dict) else {}
            mask_asset = mask.get("asset") if isinstance(mask.get("asset"), dict) else mask
            mask_path, _mask_mime = _asset_path(mask_asset, project_id, state_params, node_id, "timeline_frame_mask")
            if mask_path:
                mask_input_index = input_count
                cmd += ["-loop", "1", "-t", "0.100", "-i", mask_path]
                input_count += 1
            visual_inputs.append((input_index, layer, mime, path, mask_input_index))

        current = "base"
        for index, (input_index, layer, mime, path, mask_input_index) in enumerate(visual_inputs):
            transform = _resolved_transform(layer, frame_time)
            crop = layer.get("crop_percent") if isinstance(layer.get("crop_percent"), dict) else {}
            asset = layer.get("asset") if isinstance(layer.get("asset"), dict) else {}
            opacity = _clamp(_num(transform.get("opacity"), 1), 0, 1)
            layer_alpha = 1.0 if mask_input_index is not None else opacity
            scale = max(0.05, _num(transform.get("scale"), 1))
            rotate = _num(transform.get("rotate_degrees"), 0)
            x_percent = _num(transform.get("x_percent"), 0)
            y_percent = _num(transform.get("y_percent"), 0)
            geometry_pixels = transform.get("geometry_pixels") if isinstance(transform.get("geometry_pixels"), dict) else {}
            debug_geometry = bool(layer.get("debug_geometry"))
            left = _clamp(_num(crop.get("left"), 0), 0, 95) / 100
            right = _clamp(_num(crop.get("right"), 0), 0, 95) / 100
            top = _clamp(_num(crop.get("top"), 0), 0, 95) / 100
            bottom = _clamp(_num(crop.get("bottom"), 0), 0, 95) / 100
            _fit_x, _fit_y, fit_w, fit_h = _contain_box(asset, path, mime, width, height, transform.get("fit_canvas"))
            scaled_w = max(2, int(round(fit_w * scale)))
            scaled_h = max(2, int(round(fit_h * scale)))
            if geometry_pixels:
                scaled_w = max(2, int(round(_num(geometry_pixels.get("width"), scaled_w))))
                scaled_h = max(2, int(round(_num(geometry_pixels.get("height"), scaled_h))))
            crop_x = max(0, int(round(scaled_w * left)))
            crop_y = max(0, int(round(scaled_h * top)))
            crop_w = max(2, int(round(scaled_w * max(0.01, 1 - left - right))))
            crop_h = max(2, int(round(scaled_h * max(0.01, 1 - top - bottom))))
            crop_w = min(crop_w, max(2, scaled_w - crop_x))
            crop_h = min(crop_h, max(2, scaled_h - crop_y))
            has_crop = any(value > 0 for value in (left, right, top, bottom))
            if debug_geometry:
                filters.append(
                    f"color=c=white@1:s={scaled_w}x{scaled_h}:d=0.100:r={fps:.3f},format=rgba,setsar=1[fit{index}]"
                )
            else:
                filters.append(
                    f"[{input_index}:v]fps={fps:.3f},scale={scaled_w}:{scaled_h},format=rgba,setsar=1[fit{index}]"
                )
            if mask_input_index is not None:
                filters.append(
                    f"[{mask_input_index}:v]scale={width}:{height},format=rgba,alphaextract,setsar=1[mask{index}]"
                )
            layer_source = f"fit{index}"
            if has_crop:
                filters.append(f"color=c=black@0:s={scaled_w}x{scaled_h}:d=0.100:r={fps:.3f},format=rgba[cropbase{index}]")
                filters.append(f"[fit{index}]crop={crop_w}:{crop_h}:{crop_x}:{crop_y}[cropclip{index}]")
                filters.append(f"[cropbase{index}][cropclip{index}]overlay=x={crop_x}:y={crop_y}:shortest=1[cropfit{index}]")
                layer_source = f"cropfit{index}"
            normalized_rotate = abs(rotate % 360)
            rotate_filter = "" if normalized_rotate < 0.000001 or abs(normalized_rotate - 360) < 0.000001 else f"rotate={rotate:.6f}*PI/180:c=none:ow=rotw(iw):oh=roth(ih),"
            filters.append(
                f"[{layer_source}]"
                f"{rotate_filter}"
                f"colorchannelmixer=aa={layer_alpha:.6f},setpts=PTS-STARTPTS[v{index}]"
            )
            normalized_rotate = abs(rotate % 360)
            if geometry_pixels and (normalized_rotate < 0.000001 or abs(normalized_rotate - 360) < 0.000001):
                x_expr = f"{int(round(_num(geometry_pixels.get('left'), 0)))}"
                y_expr = f"{int(round(_num(geometry_pixels.get('top'), 0)))}"
            else:
                x_expr = f"(W-w)/2+{width * x_percent / 100:.6f}"
                y_expr = f"(H-h)/2+{height * y_percent / 100:.6f}"
            if mask_input_index is not None:
                filters.append(f"color=c=black@0:s={width}x{height}:d=0.100:r={fps:.3f},format=rgba[blank{index}]")
                filters.append(f"[blank{index}][v{index}]overlay=x='{x_expr}':y='{y_expr}':shortest=0[placed{index}]")
                filters.append(f"[placed{index}][mask{index}]alphamerge[placedm{index}]")
                filters.append(f"[placedm{index}]colorchannelmixer=aa={opacity:.6f}[placedmo{index}]")
                filters.append(f"[{current}][placedmo{index}]overlay=x=0:y=0:shortest=0[tmp{index}]")
            else:
                filters.append(f"[{current}][v{index}]overlay=x='{x_expr}':y='{y_expr}':shortest=0[tmp{index}]")
            current = f"tmp{index}"

        cmd += [
            "-filter_complex", ";".join(filters),
            "-map", f"[{current}]",
            "-frames:v", "1",
            "-update", "1",
            tmp_path,
        ]
        completed = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=60)
        if completed.returncode != 0 or not os.path.exists(tmp_path) or os.path.getsize(tmp_path) <= 0:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass
            return {
                "ok": False,
                "error": "ffmpeg timeline frame render failed",
                "details": (completed.stderr or completed.stdout or "")[-2000:],
                "cmd": " ".join(_filter_escape_path(part) for part in cmd[:16]) + " ...",
            }
        os.replace(tmp_path, output_path)

    asset_ref = canvas_workbench_assets.register_existing_file_asset(
        output_path,
        project_id,
        state_params,
        node_id=node_id,
        role="timeline_frame",
        metadata={"mime": "image/png", "width": width, "height": height, "time": round(frame_time, 4)},
        copy_to_assets=False,
    )
    return {
        "ok": True,
        "asset_ref": asset_ref,
        "path": output_path,
        "time": round(frame_time, 4),
        "source": "direct_png_filtergraph",
    }
