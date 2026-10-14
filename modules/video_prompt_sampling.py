import math
import time

import numpy as np
from PIL import Image


MIN_FRAMES = 8
MAX_ANCHORS = 64
MAX_FRAMES = 96
MAX_PROBES = 256
PROBE_SECONDS = 0.25
DECODE_SECONDS = 15.0
MAX_SIDE = 512


class VideoSamplingError(RuntimeError):
    pass


def _resize(frame, size=None):
    image = Image.fromarray(frame)
    if size:
        image = image.resize(size, Image.Resampling.BILINEAR)
    else:
        image.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
    return np.asarray(image).copy()


def frame_change_score(previous, current):
    difference = np.abs(current.astype(np.float32) - previous.astype(np.float32)).mean(axis=2)
    return float(0.65 * np.mean(difference > 24) + 0.35 * np.mean(difference) / 255)


def sampling_plan(frame_count, fps):
    count = int(frame_count)
    rate = float(fps)
    if count <= 0 or not math.isfinite(rate) or rate <= 0:
        raise ValueError("Video frame count or frame rate is unavailable.")
    duration = count / rate
    anchors = min(count, MAX_ANCHORS, max(MIN_FRAMES, int(math.ceil(duration)) + 1))
    limit = min(count, MAX_FRAMES, anchors + int(math.ceil(anchors / 2)))
    anchor_indices = sorted({int(round(value)) for value in np.linspace(0, count - 1, anchors)})
    probe_count = min(count, MAX_PROBES, max(anchors, int(math.ceil(duration / PROBE_SECONDS)) + 1))
    probe_indices = sorted({int(round(value)) for value in np.linspace(0, count - 1, probe_count)})
    return {
        "anchor_indices": anchor_indices, "probe_indices": probe_indices,
        "frame_limit": limit, "duration_seconds": duration,
        "sampling_limited": duration > MAX_ANCHORS - 1,
    }


def select_change_frames(anchors, probes, scores, limit):
    selected = set(anchors)
    regions = {}
    ordered_anchors = np.asarray(anchors)
    # Keep temporal coverage even when one busy part has most of the changes.
    for position in sorted(range(len(scores)), key=lambda index: (-scores[index], index)):
        if len(selected) >= limit:
            break
        if scores[position] < 0.015:
            continue
        current = probes[position + 1]
        region = int(np.searchsorted(ordered_anchors, current, side="right"))
        if regions.get(region, 0) >= 2:
            continue
        for index in (probes[position], current):
            if len(selected) >= limit:
                break
            if index not in selected:
                selected.add(index)
                regions[region] = regions.get(region, 0) + 1
    return sorted(selected)


def sample_video(path):
    import cv2

    metadata = {
        "ok": False, "sampled_frames": 0, "timestamps": [], "duration_seconds": 0.0,
        "sampling_strategy": "duration_and_changes", "sampling_limited": False,
        "used_first_frame_only": False, "cache_hit": False,
    }
    try:
        capture = cv2.VideoCapture(str(path))
    except cv2.error as error:
        metadata["error"] = str(error)
        return [], metadata
    if not capture.isOpened():
        capture.release()
        return [], metadata
    frames = {}
    features = {}
    timestamps = {}
    deadline = time.monotonic() + DECODE_SECONDS
    last_index = -2
    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
        plan = sampling_plan(int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0), fps)
        metadata.update({
            "duration_seconds": round(plan["duration_seconds"], 3),
            "sampling_limited": plan["sampling_limited"],
            "planned_anchor_frames": len(plan["anchor_indices"]),
        })

        def read(index, keep):
            nonlocal last_index
            if time.monotonic() > deadline:
                metadata["sampling_limited"] = True
                return False
            if index != last_index + 1:
                capture.set(cv2.CAP_PROP_POS_FRAMES, index)
            ok, frame = capture.read()
            last_index = index
            if not ok or frame is None:
                return False
            rgb = np.asarray(frame)[:, :, :3][:, :, ::-1].copy()
            features[index] = _resize(rgb, (64, 36))
            position = float(capture.get(cv2.CAP_PROP_POS_MSEC) or 0)
            timestamps[index] = position / 1000 if position > 0 else index / fps
            if keep:
                frames[index] = _resize(rgb)
            return True

        for index in plan["anchor_indices"]:
            read(index, True)
        for index in plan["probe_indices"]:
            if index not in features:
                if time.monotonic() > deadline:
                    metadata["sampling_limited"] = True
                    break
                read(index, False)
        probes = sorted(features)
        scores = [
            frame_change_score(features[previous], features[current])
            for previous, current in zip(probes, probes[1:])
        ]
        selected = select_change_frames(sorted(frames), probes, scores, plan["frame_limit"])
        for index in selected:
            if index not in frames:
                read(index, True)
        ordered = [index for index in selected if index in frames]
        times = [round(timestamps[index], 3) for index in ordered]
        metadata.update({
            "ok": bool(ordered), "sampled_frames": len(ordered), "timestamps": times,
            "frame_indices": ordered, "probe_frames": len(probes),
            "change_frames": len(set(ordered) - set(plan["anchor_indices"])),
            "max_sample_gap_seconds": float(round(max(np.diff(times), default=0), 3)),
            "sampling_limited": bool(
                metadata["sampling_limited"] or len(set(ordered) & set(plan["anchor_indices"]))
                < len(plan["anchor_indices"])
            ),
        })
        return [frames[index] for index in ordered], metadata
    except Exception as error:
        metadata["error"] = str(error)
        return [], metadata
    finally:
        capture.release()


def sample_mask(path, timestamps):
    import cv2

    capture = cv2.VideoCapture(str(path))
    result = []
    deadline = time.monotonic() + DECODE_SECONDS
    try:
        if not capture.isOpened():
            raise ValueError("The temporal mask video could not be opened.")
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
        count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if not math.isfinite(fps) or fps <= 0 or count <= 0:
            raise ValueError("The temporal mask timing is unavailable.")
        for timestamp in timestamps:
            if time.monotonic() > deadline:
                raise ValueError("Temporal mask sampling timed out.")
            index = int(math.floor(float(timestamp) * fps + 1e-6))
            if index < 0 or index >= count:
                raise ValueError("The temporal mask does not cover the sampled source time.")
            capture.set(cv2.CAP_PROP_POS_FRAMES, index)
            ok, frame = capture.read()
            if not ok or frame is None:
                raise ValueError("A temporal mask frame could not be decoded.")
            result.append(_resize(np.asarray(frame)[:, :, :3][:, :, ::-1].copy()))
        return result
    finally:
        capture.release()
