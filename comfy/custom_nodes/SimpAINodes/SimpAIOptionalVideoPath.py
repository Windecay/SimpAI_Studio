import hashlib
import os

import cv2
import numpy as np
import torch

import folder_paths


VIDEO_EXTENSIONS = ("webm", "mp4", "mkv", "gif", "mov")
AUDIO_EXTENSIONS = ("wav", "mp3", "flac", "ogg", "m4a", "aac", "wma")


def _clean_video_value(video):
    text = str(video or "").strip().strip('"')
    if not text or text.lower() in ("none", "null"):
        return ""
    return text


def _resolve_video_path(video):
    text = _clean_video_value(video)
    if not text:
        return ""
    if os.path.isfile(text):
        return text
    try:
        candidate = folder_paths.get_annotated_filepath(text)
        if os.path.isfile(candidate):
            return candidate
    except Exception:
        pass
    return text


def _file_hash(path):
    if not path or not os.path.isfile(path):
        return "none"
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class SimpAIOptionalVideoPath:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "video": ("STRING", {"default": "", "multiline": False, "vhs_path_extensions": list(VIDEO_EXTENSIONS)}),
                "force_rate": ("FLOAT", {"default": 0, "min": 0, "max": 60, "step": 1}),
                "frame_load_cap": ("INT", {"default": 0, "min": 0, "max": 999999, "step": 1}),
                "skip_first_frames": ("INT", {"default": 0, "min": 0, "max": 999999, "step": 1}),
                "select_every_nth": ("INT", {"default": 1, "min": 1, "max": 999999, "step": 1}),
            },
        }

    RETURN_TYPES = ("IMAGE", "INT", "AUDIO")
    RETURN_NAMES = ("IMAGE", "frame_count", "AUDIO")
    FUNCTION = "load_video"
    CATEGORY = "SimpAI/video"

    def load_video(self, video, force_rate=0, frame_load_cap=0, skip_first_frames=0, select_every_nth=1):
        return _load_video_frames(video, force_rate, frame_load_cap, skip_first_frames, select_every_nth, "Optional reference video")

    @classmethod
    def IS_CHANGED(cls, video, **kwargs):
        return _file_hash(_resolve_video_path(video))

    @classmethod
    def VALIDATE_INPUTS(cls, video, **kwargs):
        text = _clean_video_value(video)
        if not text:
            return True
        path = _resolve_video_path(video)
        if not os.path.isfile(path):
            return f"Invalid optional reference video file: {video}"
        return True


class SimpAIOptionalReferenceVideoPath:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "reference_video": ("STRING", {"default": "", "multiline": False, "vhs_path_extensions": list(VIDEO_EXTENSIONS)}),
                "force_rate": ("FLOAT", {"default": 0, "min": 0, "max": 60, "step": 1}),
                "frame_load_cap": ("INT", {"default": 0, "min": 0, "max": 999999, "step": 1}),
                "skip_first_frames": ("INT", {"default": 0, "min": 0, "max": 999999, "step": 1}),
                "select_every_nth": ("INT", {"default": 1, "min": 1, "max": 999999, "step": 1}),
            },
        }

    RETURN_TYPES = ("IMAGE", "INT", "AUDIO")
    RETURN_NAMES = ("IMAGE", "frame_count", "AUDIO")
    FUNCTION = "load_video"
    CATEGORY = "SimpAI/video"

    def load_video(self, reference_video, force_rate=0, frame_load_cap=0, skip_first_frames=0, select_every_nth=1):
        return _load_video_frames(reference_video, force_rate, frame_load_cap, skip_first_frames, select_every_nth, "Optional reference video")

    @classmethod
    def IS_CHANGED(cls, reference_video, **kwargs):
        return _file_hash(_resolve_video_path(reference_video))

    @classmethod
    def VALIDATE_INPUTS(cls, reference_video, **kwargs):
        text = _clean_video_value(reference_video)
        if not text:
            return True
        path = _resolve_video_path(text)
        if not os.path.isfile(path):
            return f"Invalid optional reference video file: {reference_video}"
        return True


class SimpAIOptionalAudioPath:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "audio": ("STRING", {"default": "", "multiline": False, "vhs_path_extensions": list(AUDIO_EXTENSIONS)}),
            },
        }

    RETURN_TYPES = ("AUDIO",)
    RETURN_NAMES = ("AUDIO",)
    FUNCTION = "load_audio"
    CATEGORY = "SimpAI/audio"

    def load_audio(self, audio):
        path = _resolve_video_path(audio)
        if not path:
            return (None,)
        if not os.path.isfile(path):
            raise FileNotFoundError(f"Optional reference audio file not found: {audio}")
        return (_load_audio_value(path, "Optional reference audio"),)

    @classmethod
    def IS_CHANGED(cls, audio, **kwargs):
        return _file_hash(_resolve_video_path(audio))

    @classmethod
    def VALIDATE_INPUTS(cls, audio, **kwargs):
        text = _clean_video_value(audio)
        if not text:
            return True
        path = _resolve_video_path(text)
        if not os.path.isfile(path):
            return f"Invalid optional reference audio file: {audio}"
        return True


def _load_audio_value(path, label, allow_missing_stream=False):
    from comfy_extras.nodes_audio import load as load_audio

    try:
        waveform, sample_rate = load_audio(path)
    except ValueError as err:
        if allow_missing_stream and "no audio stream" in str(err).lower():
            return None
        raise ValueError(f"{label} could not be decoded: {path}") from err
    return {"waveform": waveform.unsqueeze(0), "sample_rate": sample_rate}


def _load_video_frames(video, force_rate=0, frame_load_cap=0, skip_first_frames=0, select_every_nth=1, label="Optional video"):
    path = _resolve_video_path(video)
    if not path:
        return (None, 0, None)
    if not os.path.isfile(path):
        raise FileNotFoundError(f"{label} file not found: {video}")

    frame_load_cap = max(0, int(frame_load_cap or 0))
    skip_first_frames = max(0, int(skip_first_frames or 0))
    select_every_nth = max(1, int(select_every_nth or 1))
    force_rate = max(0.0, float(force_rate or 0))

    capture = cv2.VideoCapture(path)
    if not capture.isOpened():
        raise ValueError(f"{label} could not be opened: {path}")

    source_fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
    target_interval = (1.0 / force_rate) if force_rate > 0 and source_fps > 0 else None
    next_target_time = 0.0
    frames = []
    frame_index = -1
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            frame_index += 1
            if frame_index < skip_first_frames:
                continue
            if (frame_index - skip_first_frames) % select_every_nth != 0:
                continue
            if target_interval is not None:
                current_time = frame_index / source_fps
                if current_time + 1e-6 < next_target_time:
                    continue
                next_target_time += target_interval
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frames.append(frame.astype(np.float32) / 255.0)
            if frame_load_cap > 0 and len(frames) >= frame_load_cap:
                break
    finally:
        capture.release()

    if not frames:
        raise RuntimeError(f"{label} produced no frames: {path}")
    audio = _load_audio_value(path, f"{label} audio", allow_missing_stream=True)
    return (torch.from_numpy(np.stack(frames, axis=0)), len(frames), audio)


NODE_CLASS_MAPPINGS = {
    "SimpAIOptionalVideoPath": SimpAIOptionalVideoPath,
    "SimpAIOptionalReferenceVideoPath": SimpAIOptionalReferenceVideoPath,
    "SimpAIOptionalAudioPath": SimpAIOptionalAudioPath,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIOptionalVideoPath": "SimpAI Optional Video Path",
    "SimpAIOptionalReferenceVideoPath": "SimpAI Optional Reference Video Path",
    "SimpAIOptionalAudioPath": "SimpAI Optional Audio Path",
}
