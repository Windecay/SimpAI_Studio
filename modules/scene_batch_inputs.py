"""Input definitions shared by the scene batch UI and executor."""

MEDIA_EXTENSIONS = {
    "image": (".png", ".jpg", ".jpeg", ".webp", ".bmp"),
    "video": (".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v"),
    "audio": (".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".opus"),
}
MEDIA_UPLOAD_LABELS = {
    "image": ("Upload images", "上传图片"),
    "video": ("Upload videos", "上传视频"),
    "audio": ("Upload audio files", "上传音频"),
}

INPUTS = (
    {"slot": "scene_canvas_image", "kind": "image", "en": "Upload and canvas(1)", "cn": "主体图片(1)"},
    *({"slot": f"scene_input_image{i}", "kind": "image",
       "en": f"Upload prompt image({i + 1})", "cn": f"参考图片({i + 1})", "optional": i >= 3}
      for i in range(1, 9)),
    {"slot": "scene_video", "kind": "video", "en": "Main video", "cn": "主视频",
     "original": "scene_original_video_path", "trim": "scene_video_trim_payload"},
    {"slot": "scene_reference_video", "kind": "video", "en": "Reference video 1", "cn": "参考视频1",
     "optional": True, "original": "scene_reference_video_original_path", "trim": "scene_reference_video_trim_payload"},
    {"slot": "scene_reference_video2", "kind": "video", "en": "Reference video 2", "cn": "参考视频2",
     "optional": True, "original": "scene_reference_video2_original_path", "trim": "scene_reference_video2_trim_payload"},
    *({"slot": "scene_audio" if i == 1 else f"scene_audio{i}", "kind": "audio",
       "en": f"Audio {i}", "cn": f"音频{i}", "optional": i > 1} for i in range(1, 4)),
)
INPUT_BY_SLOT = {item["slot"]: item for item in INPUTS}


def replace_media_input(values, slot, path):
    """Replace one input and only the state belonging to that input."""
    definition = INPUT_BY_SLOT[slot]
    result = dict(values)
    result[slot] = path
    if definition["kind"] == "video":
        result[definition["original"]] = path
        result[definition["trim"]] = ""
        if slot == "scene_video":
            result["active_video_source"] = "scene"
    return result
