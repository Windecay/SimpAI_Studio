import json
import math
import os
import re
import shutil
import subprocess
import wave
from dataclasses import dataclass


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


def build_progress_profile(task_method, params, base_steps, duration_probe=None):
    method = str(task_method or "").lower()
    if not isinstance(params, dict):
        return None

    steps = _positive_int(base_steps)
    if steps is None:
        return None

    probe = duration_probe or probe_media_duration
    if "infinitetalk" in method:
        return _build_infinitetalk_profile(method, params, steps, probe)
    if "qwen_faceswap" in method:
        return _build_qwen_faceswap_profile(steps)
    if "wan_animate" in method:
        return _build_wan_animate_profile(method, params, steps, probe)
    if "wan_scail2" in method:
        return _build_scail2_profile(params, steps, probe)
    if "bernini_video_edit" in method:
        return _build_bernini_video_edit_profile(params, steps, probe)
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

    total_frames = max(1, int(duration * frame_rate))
    duration_limit = _positive_float(params.get("video_duration"))
    if duration_limit is not None:
        total_frames = min(total_frames, _strict_4n_plus_1_cap(duration_limit * 16.0))
    if "animate_face" in method or "animate_outpaint" in method:
        total_frames = _floor_4n_plus_1(total_frames)

    chunk_frames = _best_wan_animate_window(total_frames)
    if chunk_frames <= 8:
        return None
    overlap = min(_align_4n_plus_1(5), 33, chunk_frames - 8)
    first_keep = chunk_frames - 4
    repeat_keep = chunk_frames - overlap - 4
    pass_count = _pass_count(total_frames, first_keep, repeat_keep)
    return ProgressProfile(
        name="wan_animate_chunks",
        pass_steps=steps,
        pass_count=pass_count,
        total_steps=steps * pass_count,
        source_duration=total_frames / frame_rate,
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


def _build_bernini_video_edit_profile(params, steps, probe):
    video_path = _media_path(params.get("video"))
    duration = _probe_positive_duration(probe, video_path)
    frame_rate = _positive_float(params.get("var_number2")) or 16.0
    if duration is None:
        return None

    total_frames = max(1, int(duration * frame_rate))
    duration_limit = _positive_float(params.get("video_duration"))
    if duration_limit is not None:
        total_frames = min(total_frames, max(1, int(round(duration_limit * 16.0))))
    total_frames = _floor_4n_plus_1(total_frames)

    target_frames = _positive_int(params.get("var_number7")) or 81
    segment_frames = _best_segment_frames(
        total_frames,
        target_frames,
        min_frames=45,
        max_frames=185,
    )
    inherited_prefix = 0 if segment_frames <= 1 else min(9, segment_frames - 1)
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
    max_frames = max(min_frames, _align_4n_plus_1(max_frames))
    if total_frames <= min_frames:
        return _align_4n_plus_1(total_frames)

    target_frames = max(
        min_frames,
        min(_align_4n_plus_1(target_frames), max_frames),
    )
    best_frames = target_frames
    best_candidate = None
    for frames in range(min_frames, max_frames + 1, 4):
        new_frames_per_loop = max(1, frames - 1)
        segment_count = max(
            1,
            int(math.ceil((total_frames - 1) / new_frames_per_loop)),
        )
        extra_frames = 1 + segment_count * new_frames_per_loop - total_frames
        candidate = (
            extra_frames,
            abs(frames - target_frames),
            frames > target_frames,
            segment_count,
        )
        if best_candidate is None or candidate < best_candidate:
            best_candidate = candidate
            best_frames = frames
    return best_frames


def _pass_count(total_frames, first_keep, repeat_keep):
    total_frames = max(1, int(total_frames))
    first_keep = max(1, int(first_keep))
    repeat_keep = max(1, int(repeat_keep))
    if total_frames <= first_keep:
        return 1
    return 1 + int(math.ceil((total_frames - first_keep) / repeat_keep))


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


def _positive_float(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
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
