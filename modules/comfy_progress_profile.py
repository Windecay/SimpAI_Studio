import json
import math
import os
import re
import shutil
import subprocess
import wave
from dataclasses import dataclass


H3_FPS = 24
H3_CONTEXT_FRAMES = 22
H3_MIN_GENERATION_FRAMES = 39


def _h3_segment_count(total_frames, segment_frames):
    """Match SimpAIH3UpscaleLoop's short-tail segment planning."""
    total_frames = max(1, int(total_frames))
    segment_frames = max(1, int(segment_frames))
    count = 0
    output_start = 0
    while output_start < total_frames:
        remaining = total_frames - output_start
        overlap = min(H3_CONTEXT_FRAMES, output_start) if output_start > 0 else 0
        if count and remaining + overlap < H3_MIN_GENERATION_FRAMES:
            break
        output_start += min(segment_frames, remaining)
        count += 1
    return max(1, count)


@dataclass(frozen=True)
class ProgressProfile:
    name: str
    pass_steps: int
    pass_count: int
    total_steps: int
    source_duration: float | None = None
    known_total_sampler_classes: tuple[str, ...] = ()

    def accumulator(self):
        return ProgressAccumulator(self)


@dataclass(frozen=True)
class ProgressSnapshot:
    current_step: int
    total_steps: int
    pass_index: int
    pass_count: int


class ProgressAccumulator:
    def __init__(self, profile):
        self.profile = profile
        self._last_raw_step = None
        self._last_current_step = None
        self._offset = 0

    def update(self, step, reported_total_steps=None):
        raw_step = _positive_int(step) or 1
        pass_steps = self.profile.pass_steps
        if self._last_raw_step is not None and raw_step < self._last_raw_step:
            self._offset = max(0, self._last_current_step - raw_step + 1)
        self._last_raw_step = raw_step
        current_step = self._offset + raw_step
        self._last_current_step = current_step

        pass_index = max(1, int(math.ceil(current_step / pass_steps)))
        pass_count = max(self.profile.pass_count, pass_index)
        total_steps = max(self.profile.total_steps, pass_count * pass_steps, current_step)
        return ProgressSnapshot(
            current_step=current_step,
            total_steps=total_steps,
            pass_index=pass_index,
            pass_count=pass_count,
        )


def format_profile_progress(snapshot, output_index, output_count, lang, media_type="image"):
    is_video = str(media_type or "").lower() == "video"
    if str(lang or "").lower().startswith("en"):
        media_label = "video" if is_video else "image"
        return (
            f"Sampling steps {snapshot.current_step}/{snapshot.total_steps}, "
            f"segment {snapshot.pass_index}/{snapshot.pass_count}, "
            f"{media_label} {output_index}/{output_count} ..."
        )
    media_label = "视频" if is_video else "图片"
    return (
        f"采样步数 {snapshot.current_step}/{snapshot.total_steps}，"
        f"分段 {snapshot.pass_index}/{snapshot.pass_count}，"
        f"{media_label} {output_index}/{output_count} ..."
    )


def format_sampling_progress(step, total_steps, output_index, output_count, lang, media_type="image"):
    is_video = str(media_type or "").lower() == "video"
    if str(lang or "").lower().startswith("en"):
        media_label = "video" if is_video else "image"
        return f"Sampling steps {step}/{total_steps}, {media_label} {output_index}/{output_count} ..."
    media_label = "视频" if is_video else "图片"
    return f"采样步数 {step}/{total_steps}，{media_label} {output_index}/{output_count} ..."


def build_progress_profile(task_method, params, base_steps, duration_probe=None, frame_rate_probe=None):
    method = str(task_method or "").lower()
    if not isinstance(params, dict):
        return None

    steps = _positive_int(base_steps)
    if steps is None:
        return None

    probe = duration_probe or probe_media_duration
    fps_probe = frame_rate_probe or probe_media_frame_rate
    if "infinitetalk" in method:
        return _build_infinitetalk_profile(method, params, steps, probe)
    if "qwen_faceswap" in method:
        return _build_qwen_faceswap_profile(steps)
    if "wan_animate" in method:
        return _build_wan_animate_profile(method, params, steps, probe)
    if "wan_scail2" in method:
        return _build_scail2_profile(params, steps, probe)
    if "bernini_video_upscale" in method:
        return _build_bernini_vace_upscale_profile(params, steps, probe, fps_probe)
    if "bernini_video_edit" in method:
        return _build_bernini_video_edit_profile(params, steps, probe, fps_probe)
    if "minimax_h3_upscale" in method:
        return _build_minimax_h3_upscale_profile(params, steps, probe)
    return None


def _build_qwen_faceswap_profile(steps):
    if steps < 2:
        return None
    return ProgressProfile(
        name="qwen_faceswap_two_stage",
        pass_steps=max(1, steps // 2),
        pass_count=2,
        total_steps=steps,
        known_total_sampler_classes=("KSampler",),
    )


def _build_infinitetalk_profile(method, params, steps, probe):
    segment_frames = _positive_int(params.get("var_number7")) or 121
    audio_path = _media_path(params.get("audio"))
    if not audio_path:
        return None

    duration = _probe_positive_duration(probe, audio_path)
    if duration is None:
        return None

    duration_limit = _positive_float(params.get("video_duration"))
    if duration_limit is not None:
        duration = min(duration, duration_limit)

    frame_rate = 25
    segment_frames = _align_4n_plus_1(segment_frames)
    effective_duration = duration
    if "av2v" in method:
        motion_frames = _positive_int(params.get("var_number8")) or 9
        video_path = _media_path(params.get("video"))
        video_duration = _probe_positive_duration(probe, video_path) or 0.0
        effective_duration = max(duration, video_duration)
        total_frames = max(1, int(math.ceil(effective_duration * frame_rate)))
    else:
        motion_frames = 9
        head_silence_frames = 5
        total_frames = _align_4n_plus_1(int(duration * frame_rate) + head_silence_frames)
    stride = max(1, segment_frames - motion_frames)
    if total_frames <= segment_frames:
        pass_count = 1
    else:
        pass_count = int(math.ceil((total_frames - segment_frames) / stride)) + 1

    return ProgressProfile(
        name="infinitetalk_audio_segments",
        pass_steps=steps,
        pass_count=pass_count,
        total_steps=steps * pass_count,
        source_duration=effective_duration,
    )


def _build_wan_animate_profile(method, params, steps, probe):
    video_path = _media_path(params.get("video"))
    duration = _probe_positive_duration(probe, video_path)
    frame_rate = _positive_float(params.get("var_number3")) or 16.0
    if duration is None:
        return None

    output_frames = max(1, int(duration * frame_rate))
    duration_limit = _positive_float(params.get("video_duration"))
    if duration_limit is not None:
        output_frames = min(output_frames, _strict_4n_plus_1_cap(duration_limit * frame_rate))

    sampling_frames = _align_4n_plus_1(output_frames)

    chunk_frames = _best_wan_animate_window(sampling_frames)
    if chunk_frames <= 8:
        return None
    overlap = min(_align_4n_plus_1(5), 33, chunk_frames - 8)
    first_keep = chunk_frames - 4
    repeat_keep = chunk_frames - overlap - 4
    pass_count = _pass_count(sampling_frames, first_keep, repeat_keep)
    return ProgressProfile(
        name="wan_animate_chunks",
        pass_steps=steps,
        pass_count=pass_count,
        total_steps=steps * pass_count,
        source_duration=output_frames / frame_rate,
    )


def _build_scail2_profile(params, steps, probe):
    video_path = _media_path(params.get("video"))
    duration = _probe_positive_duration(probe, video_path)
    frame_rate = _positive_float(params.get("var_number3")) or 16.0
    if duration is None:
        return None

    total_frames = max(1, int(duration * frame_rate))
    duration_limit = _positive_float(params.get("video_duration"))
    if duration_limit is not None:
        total_frames = min(
            total_frames,
            _strict_4n_plus_1_cap(duration_limit * frame_rate),
        )
    total_frames = _floor_4n_plus_1(total_frames)

    target_frames = _positive_int(params.get("var_number7")) or 81
    chunk_frames = _best_segment_frames(
        total_frames,
        target_frames,
        min_frames=33,
        max_frames=81,
    )
    overlap = min(_floor_4n_plus_1(5), 33, chunk_frames - 4)
    pass_count = _pass_count(total_frames, chunk_frames, chunk_frames - overlap)
    return ProgressProfile(
        name="scail2_scheduled_chunks",
        pass_steps=steps,
        pass_count=pass_count,
        total_steps=steps * pass_count,
        source_duration=total_frames / frame_rate,
    )


def _build_bernini_video_edit_profile(params, steps, probe, fps_probe):
    video_path = _media_path(params.get("video"))
    duration = _probe_positive_duration(probe, video_path)
    frame_rate = _positive_float(params.get("var_number2"))
    if frame_rate is None:
        frame_rate = _positive_float(fps_probe(video_path)) or 16.0
    if duration is None:
        return None

    total_frames = max(1, int(duration * frame_rate))
    duration_limit = _positive_float(params.get("video_duration"))
    if duration_limit is not None:
        total_frames = min(total_frames, max(1, int(round(duration_limit * frame_rate))))
    total_frames = _floor_4n_plus_1(total_frames)

    target_frames = _positive_int(params.get("var_number7")) or 81
    segment_frames = _best_segment_frames(
        total_frames,
        target_frames,
        min_frames=45,
        max_frames=185,
    )
    prefix_setting = _nonnegative_int(params.get("var_number8"))
    if prefix_setting is None:
        prefix_setting = 9
    inherited_prefix = 0 if segment_frames <= 1 else min(prefix_setting, segment_frames - 1)
    pass_count = _pass_count(
        total_frames,
        segment_frames,
        segment_frames - inherited_prefix,
    )
    return ProgressProfile(
        name="bernini_video_edit_segments",
        pass_steps=steps,
        pass_count=pass_count,
        total_steps=steps * pass_count,
        source_duration=total_frames / frame_rate,
        known_total_sampler_classes=("SimpAILatentDetailSampler",),
    )


def _build_bernini_vace_upscale_profile(params, steps, probe, fps_probe):
    video_path = _media_path(params.get("video"))
    duration = _probe_positive_duration(probe, video_path)
    frame_rate = _positive_float(params.get("var_number2"))
    if frame_rate is None:
        frame_rate = _positive_float(fps_probe(video_path)) or 16.0
    if duration is None:
        return None

    total_frames = max(1, int(duration * frame_rate))
    duration_limit = _positive_float(params.get("video_duration"))
    if duration_limit is not None:
        total_frames = min(total_frames, max(1, int(round(duration_limit * frame_rate))))

    target_frames = _positive_int(params.get("var_number7")) or 81
    segment_frames = _best_segment_frames(
        total_frames,
        target_frames,
        min_frames=33,
        max_frames=185,
    )
    context_setting = _positive_int(params.get("var_number8")) or 5
    context_frames = min(_floor_4n_plus_1(context_setting), segment_frames - 4)
    padded_frames = _align_4n_plus_1(total_frames)
    total_latents = _frames_to_wan_latents(padded_frames)
    segment_latents = _frames_to_wan_latents(segment_frames)
    context_latents = _frames_to_wan_latents(context_frames)
    pass_count = _pass_count(
        total_latents,
        segment_latents,
        segment_latents - context_latents,
    )
    return ProgressProfile(
        name="bernini_vace_upscale_segments",
        pass_steps=steps,
        pass_count=pass_count,
        total_steps=steps * pass_count,
        source_duration=total_frames / frame_rate,
        known_total_sampler_classes=("SimpAIWanVaceLatentLoop",),
    )


def _build_minimax_h3_upscale_profile(params, steps, probe):
    video_path = _media_path(params.get("video"))
    duration = _probe_positive_duration(probe, video_path)
    segment_duration = _positive_float(params.get("video_duration")) or 3.0
    if duration is None:
        return None
    total_frames = max(1, int(round(duration * H3_FPS)))
    segment_frames = max(1, int(round(segment_duration * H3_FPS)))
    pass_count = _h3_segment_count(total_frames, segment_frames)
    return ProgressProfile(
        name="minimax_h3_upscale_segments",
        pass_steps=steps,
        pass_count=pass_count,
        total_steps=steps * pass_count,
        source_duration=duration,
        known_total_sampler_classes=("SimpAIH3UpscaleLoop",),
    )


def _probe_positive_duration(probe, path):
    if not path:
        return None
    try:
        duration = float(probe(path))
    except (TypeError, ValueError, OSError):
        return None
    return duration if math.isfinite(duration) and duration > 0 else None


def _best_wan_animate_window(total_frames):
    total_frames = max(1, int(total_frames))
    one_pass_window = max(17, _align_4n_plus_1(total_frames + 4))
    if one_pass_window <= 97:
        return one_pass_window

    best_window = 57
    best_candidate = None
    for window in range(57, 98, 4):
        first_keep = window - 4
        repeat_keep = window - 9
        segment_count = _pass_count(total_frames, first_keep, repeat_keep)
        output_capacity = first_keep + (segment_count - 1) * repeat_keep
        candidate = (
            segment_count,
            output_capacity - total_frames,
            -window,
        )
        if best_candidate is None or candidate < best_candidate:
            best_candidate = candidate
            best_window = window
    return best_window


def _best_segment_frames(total_frames, target_frames, min_frames, max_frames):
    total_frames = max(1, int(total_frames))
    min_frames = _align_4n_plus_1(min_frames)
    max_frames = max(min_frames, _floor_4n_plus_1(max_frames))
    if total_frames <= min_frames:
        return min_frames

    target_frames = max(min_frames, min(_floor_4n_plus_1(target_frames), max_frames))
    if total_frames <= target_frames:
        return min(max(min_frames, _align_4n_plus_1(total_frames)), target_frames)
    return target_frames


def _pass_count(total_frames, first_keep, repeat_keep):
    total_frames = max(1, int(total_frames))
    first_keep = max(1, int(first_keep))
    repeat_keep = max(1, int(repeat_keep))
    if total_frames <= first_keep:
        return 1
    return 1 + int(math.ceil((total_frames - first_keep) / repeat_keep))


def _frames_to_wan_latents(frame_count):
    return ((max(1, int(frame_count)) - 1) // 4) + 1


def _strict_4n_plus_1_cap(value):
    return 4 * int(math.ceil(max(0.0, float(value)) / 4.0)) + 1


def _floor_4n_plus_1(value):
    value = max(1, int(value))
    return 1 + ((value - 1) // 4) * 4


def probe_media_duration(path):
    path = _media_path(path)
    if not path or not os.path.isfile(path):
        return None

    if os.path.splitext(path)[1].lower() == ".wav":
        try:
            with wave.open(path, "rb") as wav_file:
                frame_rate = wav_file.getframerate()
                if frame_rate > 0:
                    return wav_file.getnframes() / float(frame_rate)
        except (OSError, EOFError, wave.Error):
            pass

    ffprobe = _ffprobe_executable()
    if ffprobe:
        try:
            completed = subprocess.run(
                [
                    ffprobe,
                    "-v", "error",
                    "-show_entries", "format=duration",
                    "-of", "json",
                    os.path.abspath(path),
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=8,
                check=False,
            )
            payload = json.loads(completed.stdout or "{}")
            duration = float((payload.get("format") or {}).get("duration"))
            if completed.returncode == 0 and math.isfinite(duration) and duration > 0:
                return duration
        except (OSError, ValueError, TypeError, json.JSONDecodeError, subprocess.TimeoutExpired):
            pass

    ffmpeg = _ffmpeg_executable()
    if not ffmpeg:
        return None
    try:
        completed = subprocess.run(
            [ffmpeg, "-hide_banner", "-i", os.path.abspath(path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=8,
            check=False,
        )
        match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", completed.stderr or "")
        if not match:
            return None
        hours, minutes, seconds = match.groups()
        duration = int(hours) * 3600 + int(minutes) * 60 + float(seconds)
        return duration if math.isfinite(duration) and duration > 0 else None
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None


def probe_media_frame_rate(path):
    path = _media_path(path)
    if not path or not os.path.isfile(path):
        return None

    ffprobe = _ffprobe_executable()
    if not ffprobe:
        return None

    try:
        completed = subprocess.run(
            [
                ffprobe,
                "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=avg_frame_rate,r_frame_rate",
                "-of", "json",
                os.path.abspath(path),
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=8,
            check=False,
        )
        if completed.returncode != 0:
            return None
        payload = json.loads(completed.stdout or "{}")
        streams = payload.get("streams") if isinstance(payload, dict) else None
        stream = streams[0] if streams else {}
        for key in ("avg_frame_rate", "r_frame_rate"):
            value = _parse_frame_rate(stream.get(key))
            if value is not None:
                return value
    except (OSError, ValueError, TypeError, json.JSONDecodeError, subprocess.TimeoutExpired):
        pass
    return None


def _align_4n_plus_1(value):
    value = max(1, int(value))
    remainder = (value - 1) % 4
    return value if remainder == 0 else value + (4 - remainder)


def _positive_int(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _nonnegative_int(value):
    try:
        parsed = int(float(value))
    except (TypeError, ValueError, OverflowError):
        return None
    return parsed if parsed >= 0 else None


def _positive_float(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) and parsed > 0 else None


def _parse_frame_rate(value):
    text = str(value or "").strip()
    if not text or text in ("0/0", "N/A"):
        return None
    try:
        if "/" in text:
            numerator, denominator = text.split("/", 1)
            denominator = float(denominator)
            if denominator == 0:
                return None
            parsed = float(numerator) / denominator
        else:
            parsed = float(text)
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    return parsed if math.isfinite(parsed) and parsed > 0 else None


def _media_path(value):
    if isinstance(value, os.PathLike):
        return os.fspath(value)
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, dict):
        for key in ("path", "name"):
            path = value.get(key)
            if isinstance(path, str) and path.strip():
                return path.strip()
    return None


def _ffmpeg_executable():
    try:
        import imageio_ffmpeg

        executable = imageio_ffmpeg.get_ffmpeg_exe()
        if executable and os.path.isfile(executable):
            return executable
    except Exception:
        pass
    return shutil.which("ffmpeg")


def _ffprobe_executable():
    executable = shutil.which("ffprobe")
    if executable:
        return executable
    ffmpeg = _ffmpeg_executable()
    if ffmpeg:
        candidate = os.path.join(
            os.path.dirname(ffmpeg),
            "ffprobe.exe" if os.name == "nt" else "ffprobe",
        )
        if os.path.isfile(candidate):
            return candidate
    return None
