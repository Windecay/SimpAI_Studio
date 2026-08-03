import hashlib
import math
import os

import av
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
            "optional": {
                "duration": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 999999999.0, "step": 0.01}),
            },
        }

    RETURN_TYPES = ("IMAGE", "INT", "AUDIO")
    RETURN_NAMES = ("IMAGE", "frame_count", "AUDIO")
    FUNCTION = "load_video"
    CATEGORY = "SimpAI/video"

    def load_video(self, video, force_rate=0, frame_load_cap=0, skip_first_frames=0, select_every_nth=1, duration=0.0):
        return _load_video_frames(video, force_rate, frame_load_cap, skip_first_frames, select_every_nth, "Optional reference video", duration)

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
            "optional": {
                "duration": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 999999999.0, "step": 0.01}),
            },
        }

    RETURN_TYPES = ("IMAGE", "INT", "AUDIO")
    RETURN_NAMES = ("IMAGE", "frame_count", "AUDIO")
    FUNCTION = "load_video"
    CATEGORY = "SimpAI/video"

    def load_video(self, reference_video, force_rate=0, frame_load_cap=0, skip_first_frames=0, select_every_nth=1, duration=0.0):
        return _load_video_frames(reference_video, force_rate, frame_load_cap, skip_first_frames, select_every_nth, "Optional reference video", duration)

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
            "optional": {
                "duration": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 999999999.0, "step": 0.01}),
            },
        }

    RETURN_TYPES = ("AUDIO",)
    RETURN_NAMES = ("AUDIO",)
    FUNCTION = "load_audio"
    CATEGORY = "SimpAI/audio"

    def load_audio(self, audio, duration=0.0):
        path = _resolve_video_path(audio)
        if not path:
            return (None,)
        if not os.path.isfile(path):
            raise FileNotFoundError(f"Optional reference audio file not found: {audio}")
        return (_load_audio_value(path, "Optional reference audio", duration=duration),)

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


def _load_audio_value(path, label, allow_missing_stream=False, start_time=0.0, duration=0.0):
    from comfy_extras.nodes_audio import f32_pcm, load as load_audio

    start_time = max(0.0, float(start_time or 0.0))
    duration = max(0.0, float(duration or 0.0))
    if start_time == 0.0 and duration == 0.0:
        try:
            waveform, sample_rate = load_audio(path)
        except ValueError as err:
            if allow_missing_stream and "no audio stream" in str(err).lower():
                return None
            raise ValueError(f"{label} could not be decoded: {path}") from err
        return {"waveform": waveform.unsqueeze(0), "sample_rate": sample_rate}

    with av.open(path) as container:
        if not container.streams.audio:
            if allow_missing_stream:
                return None
            raise ValueError(f"{label} has no audio stream: {path}")

        stream = container.streams.audio[0]
        sample_rate = int(stream.codec_context.sample_rate or 0)
        channel_count = int(stream.channels or 0)
        if sample_rate <= 0 or channel_count <= 0:
            raise ValueError(f"{label} has invalid audio metadata: {path}")

        if start_time > 0.0 and stream.time_base is not None:
            container.seek(int(start_time / float(stream.time_base)), stream=stream, backward=True)

        end_time = start_time + duration if duration > 0.0 else None
        decoded_time = 0.0
        frames = []
        for frame in container.decode(streams=stream.index):
            buffer = torch.from_numpy(frame.to_ndarray())
            if buffer.ndim == 1:
                buffer = buffer.unsqueeze(0)
            if buffer.shape[0] != channel_count:
                buffer = buffer.view(-1, channel_count).t()
            buffer = f32_pcm(buffer)

            if frame.pts is not None and frame.time_base is not None:
                frame_start = float(frame.pts * frame.time_base)
            else:
                frame_start = decoded_time
            frame_end = frame_start + buffer.shape[1] / sample_rate
            decoded_time = frame_end

            if frame_end <= start_time:
                continue
            if end_time is not None and frame_start >= end_time:
                break

            first_sample = max(0, int(round((start_time - frame_start) * sample_rate)))
            last_sample = buffer.shape[1]
            if end_time is not None:
                last_sample = min(last_sample, int(round((end_time - frame_start) * sample_rate)))
            if last_sample > first_sample:
                frames.append(buffer[:, first_sample:last_sample])
            if end_time is not None and frame_end >= end_time:
                break

    if not frames:
        if allow_missing_stream:
            return None
        raise ValueError(f"{label} selected range contains no audio: {path}")

    waveform = torch.cat(frames, dim=1)
    if duration > 0.0:
        waveform = waveform[:, :int(round(duration * sample_rate))]
    return {"waveform": waveform.unsqueeze(0), "sample_rate": sample_rate}


def _load_video_frames(video, force_rate=0, frame_load_cap=0, skip_first_frames=0, select_every_nth=1, label="Optional video", duration=0.0):
    path = _resolve_video_path(video)
    if not path:
        return (None, 0, None)
    if not os.path.isfile(path):
        raise FileNotFoundError(f"{label} file not found: {video}")

    frame_load_cap = max(0, int(frame_load_cap or 0))
    skip_first_frames = max(0, int(skip_first_frames or 0))
    select_every_nth = max(1, int(select_every_nth or 1))
    force_rate = max(0.0, float(force_rate or 0))
    duration = max(0.0, float(duration or 0.0))

    capture = cv2.VideoCapture(path)
    if not capture.isOpened():
        raise ValueError(f"{label} could not be opened: {path}")

    source_fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
    frames = []
    audio_start_time = 0.0
    audio_duration = duration
    try:
        if duration > 0.0 and source_fps > 0.0:
            source_start_index = skip_first_frames
            capture.set(cv2.CAP_PROP_POS_FRAMES, source_start_index)
            target_fps = force_rate if force_rate > 0.0 else source_fps / select_every_nth
            frame_limits = []
            if frame_load_cap > 0:
                frame_limits.append(frame_load_cap)
            if duration > 0.0:
                frame_limits.append(max(1, int(round(duration * target_fps))))
            target_frame_count = min(frame_limits) if frame_limits else None

            current_source_index = source_start_index - 1
            current_frame = None
            target_index = 0
            while target_frame_count is None or target_index < target_frame_count:
                selected_index = source_start_index + int(math.floor(target_index * (source_fps / select_every_nth) / target_fps + 1e-9)) * select_every_nth
                while current_source_index < selected_index:
                    ok, current_frame = capture.read()
                    if not ok:
                        current_frame = None
                        break
                    current_source_index += 1
                if current_frame is None:
                    break
                frame = cv2.cvtColor(current_frame, cv2.COLOR_BGR2RGB)
                frames.append(frame.astype(np.float32) / 255.0)
                target_index += 1

            audio_start_time = source_start_index / source_fps
            audio_duration = len(frames) / target_fps
        else:
            target_interval = (1.0 / force_rate) if force_rate > 0 and source_fps > 0 else None
            next_target_time = 0.0
            frame_index = -1
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
    audio = _load_audio_value(path, f"{label} audio", allow_missing_stream=True, start_time=audio_start_time, duration=audio_duration)
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
