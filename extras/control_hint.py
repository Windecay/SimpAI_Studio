import numpy as np


AUTO_SKIP_CONTROL_HINT_THRESH = {
    "y_dark_thr": 0.15,
    "y_bright_thr": 0.85,
    "y_light_thr": 0.45,
    "y_mid_low": 0.20,
    "y_mid_high": 0.80,
    "sat_grayscale_max": 0.06,
    "sat_hi_thr": 0.25,
    "sat_hi_ratio_grayscale_max": 0.01,
    "rgb_diff_mean_grayscale_max": 0.025,
    "dark_bg_ratio_dark_min": 0.60,
    "dark_bg_mean_y_max": 0.38,
    "light_bg_ratio_bright_min": 0.55,
    "light_bg_mean_y_min": 0.60,
    "light_bg_ratio_dark_max": 0.30,
    "edge_density_lineart_min": 0.075,
    "edge_ratio_px_thr": 0.08,
    "edge_ratio_lineart_min": 0.010,
    "ratio_mid_lineart_max": 0.40,
    "ratio_light_lineart_min": 0.0010,
    "ratio_light_lineart_max": 0.30,
    "ratio_mid_lineart_light_bg_max": 0.60,
    "edge_density_depth_max": 0.065,
    "ratio_mid_depth_min": 0.10,
    "ratio_bright_depth_max": 0.40,
    "std_y_depth_min": 0.06,
    "std_y_depth_max": 0.45,
    "sat_hi_ratio_pose_min": 0.015,
    "sat_fg_mean_pose_min": 0.20,
    "ratio_mid_pose_max": 0.40,
    "ratio_bright_pose_max": 0.25,
}


def to_float01_rgb(img):
    if img is None:
        return None
    arr = np.asarray(img)
    if arr.ndim == 2:
        arr = np.stack([arr, arr, arr], axis=-1)
    if arr.ndim != 3 or arr.shape[-1] < 3:
        return None
    arr = arr[..., :3]
    if arr.dtype == np.uint8:
        return arr.astype(np.float32) / 255.0
    arr = arr.astype(np.float32)
    if np.nanmax(arr) > 1.5:
        arr = arr / 255.0
    return np.clip(arr, 0.0, 1.0)


def extract_features(image_np):
    img = to_float01_rgb(image_np)
    if img is None:
        return None
    h, w = img.shape[:2]
    if h <= 1 or w <= 1:
        return None

    step = max(1, int(max(h, w) / 256))
    sample = img[::step, ::step, :]

    r = sample[..., 0]
    g = sample[..., 1]
    b = sample[..., 2]
    y = 0.299 * r + 0.587 * g + 0.114 * b

    maxc = np.maximum(np.maximum(r, g), b)
    minc = np.minimum(np.minimum(r, g), b)
    sat = maxc - minc
    rgb_diff_mean = float(np.mean((np.abs(r - g) + np.abs(g - b) + np.abs(b - r)) / 3.0))

    t = AUTO_SKIP_CONTROL_HINT_THRESH

    mean_y = float(np.mean(y))
    std_y = float(np.std(y))
    ratio_dark = float(np.mean(y < t["y_dark_thr"]))
    ratio_bright = float(np.mean(y > t["y_bright_thr"]))
    ratio_light = float(np.mean(y > t["y_light_thr"]))
    sat_mean = float(np.mean(sat))
    sat_hi_ratio = float(np.mean(sat > t["sat_hi_thr"]))

    fg_mask = y > t["y_dark_thr"]
    sat_fg_mean = float(np.mean(sat[fg_mask])) if np.any(fg_mask) else 0.0

    dx = np.abs(np.diff(y, axis=1))
    dy = np.abs(np.diff(y, axis=0))
    edge_density = float((float(np.mean(dx)) + float(np.mean(dy))) * 0.5)
    edge_ratio = float((float(np.mean(dx > t["edge_ratio_px_thr"])) + float(np.mean(dy > t["edge_ratio_px_thr"]))) * 0.5)

    ratio_mid = float(np.mean((y > t["y_mid_low"]) & (y < t["y_mid_high"])))

    grayscale_like = (
        sat_mean < t["sat_grayscale_max"]
        and sat_hi_ratio < t["sat_hi_ratio_grayscale_max"]
        and rgb_diff_mean < t["rgb_diff_mean_grayscale_max"]
    )
    dark_background_like = ratio_dark > t["dark_bg_ratio_dark_min"] and mean_y < t["dark_bg_mean_y_max"]
    light_background_like = ratio_bright > t["light_bg_ratio_bright_min"] and mean_y > t["light_bg_mean_y_min"] and ratio_dark < t["light_bg_ratio_dark_max"]

    lineart_like = (
        dark_background_like
        and grayscale_like
        and (edge_density > t["edge_density_lineart_min"] or edge_ratio > t["edge_ratio_lineart_min"])
        and ratio_mid < t["ratio_mid_lineart_max"]
        and t["ratio_light_lineart_min"] < ratio_light < t["ratio_light_lineart_max"]
    )
    lineart_light_bg_like = (
        light_background_like
        and grayscale_like
        and (edge_density > t["edge_density_lineart_min"] or edge_ratio > t["edge_ratio_lineart_min"])
        and ratio_mid < t["ratio_mid_lineart_light_bg_max"]
    )
    depth_like = (
        grayscale_like
        and ratio_mid > t["ratio_mid_depth_min"]
        and ratio_bright < t["ratio_bright_depth_max"]
        and t["std_y_depth_min"] < std_y < t["std_y_depth_max"]
        and edge_density < t["edge_density_depth_max"]
    )
    pose_like = (
        dark_background_like
        and ratio_mid < t["ratio_mid_pose_max"]
        and ratio_bright < t["ratio_bright_pose_max"]
        and sat_hi_ratio > t["sat_hi_ratio_pose_min"]
        and sat_fg_mean > t["sat_fg_mean_pose_min"]
    )

    return {
        "mean_y": mean_y,
        "std_y": std_y,
        "ratio_dark": ratio_dark,
        "ratio_bright": ratio_bright,
        "ratio_mid": ratio_mid,
        "ratio_light": ratio_light,
        "sat_mean": sat_mean,
        "sat_hi_ratio": sat_hi_ratio,
        "sat_fg_mean": sat_fg_mean,
        "rgb_diff_mean": rgb_diff_mean,
        "edge_density": edge_density,
        "edge_ratio": edge_ratio,
        "grayscale_like": bool(grayscale_like),
        "dark_background_like": bool(dark_background_like),
        "light_background_like": bool(light_background_like),
        "lineart_like": bool(lineart_like),
        "lineart_light_bg_like": bool(lineart_light_bg_like),
        "depth_like": bool(depth_like),
        "pose_like": bool(pose_like),
    }


def match_flags(image_np):
    f = extract_features(image_np)
    if f is None:
        return None
    return (f["lineart_like"] or f["lineart_light_bg_like"]), f["depth_like"], f["pose_like"]


def _is_flat_color_map(image_np):
    image = to_float01_rgb(image_np)
    if image is None or min(image.shape[:2]) <= 1:
        return False
    step = max(1, int(max(image.shape[:2]) / 256))
    sample = np.rint(image[::step, ::step] * 255).astype(np.uint8).reshape(-1, 3)
    _, counts = np.unique(sample, axis=0, return_counts=True)
    return (2 <= len(counts) <= 64 and int(counts.max()) < len(sample) * 0.995
            and float(np.mean(np.ptp(sample.astype(np.float32), axis=1))) / 255 > 0.06)


def detect_control_hint_type(image_np, allowed_types=None):
    import modules.flags as flags

    flags_match = match_flags(image_np)
    if flags_match is None:
        return None
    lineart_like, depth_like, pose_like = flags_match

    detected = (flags.cn_pose if pose_like else flags.cn_canny if lineart_like
                else flags.cn_cpds if depth_like else None)
    if allowed_types is None or detected in allowed_types:
        return detected
    if flags.cn_color in allowed_types and not pose_like and _is_flat_color_map(image_np):
        return flags.cn_color
    return None


def control_hint_highlight_style(elem_id: str, outline_color: str = "#F97316"):
    return (
        f"<style>"
        f"#{elem_id}{{outline:4px solid {outline_color} !important; outline-offset:2px !important; border-radius:2px !important; box-shadow:0 0 0 3px rgba(255,212,0,.35), 0 0 18px rgba(255,212,0,.35) !important;}}"
        f"#{elem_id} img{{border-radius:10px !important;}}"
        f"</style>"
    )


def control_hint_default_stop_weight(control_hint_type):
    import modules.flags as flags

    stop, weight = flags.default_parameters.get(control_hint_type, flags.default_parameters[flags.cn_canny])
    return float(stop), float(weight)


def detect_control_hint_type_and_default_params(image_np, allowed_types=None):
    detected = detect_control_hint_type(image_np, allowed_types=allowed_types)
    if detected is None:
        return None, None, None
    stop, weight = control_hint_default_stop_weight(detected)
    return detected, stop, weight


def control_hint_auto_skip_for_selected_type(image_np, selected_type):
    import modules.flags as flags

    cn_flag = flags.cn_name_map.get(selected_type, None)
    if cn_flag is None:
        return False, False
    features = extract_features(image_np)
    return auto_skip_decision(features, cn_flag)


def auto_skip_decision(features, cn_flag):
    if features is None:
        return False, False
    if cn_flag == "canny":
        auto_skip = bool(features["lineart_like"] or features["lineart_light_bg_like"])
        return auto_skip, bool(features["lineart_light_bg_like"])
    if cn_flag == "depth":
        return bool(features["depth_like"]), False
    if cn_flag == "pose":
        return bool(features["pose_like"]), False
    if cn_flag == "color":
        return True, False
    return False, False

