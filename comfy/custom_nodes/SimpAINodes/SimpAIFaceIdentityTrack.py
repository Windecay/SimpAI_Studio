"""Task-local face trajectories with continuous masks and multi-view identity."""

import hashlib
import json
import math
from pathlib import Path

import numpy as np


def ordered_faces(faces):
    return sorted(faces, key=lambda face: (
        -float(np.prod(np.asarray(face["bbox"])[2:] - np.asarray(face["bbox"])[:2])),
        float(face["bbox"][0]), float(face["bbox"][1])))


def unit(vector):
    vector = np.asarray(vector, dtype=np.float32)
    norm = np.linalg.norm(vector)
    if vector.ndim != 1 or not np.isfinite(vector).all() or norm < 1e-8:
        raise ValueError("Invalid face identity features.")
    return vector / norm


def overlap(a, b):
    a, b = np.asarray(a), np.asarray(b)
    intersection = np.maximum(0, np.minimum(a[2:], b[2:]) - np.maximum(a[:2], b[:2])).prod()
    return float(intersection / max(1, min(np.prod(a[2:] - a[:2]), np.prod(b[2:] - b[:2]))))


class TrackedFaces(list):
    def __init__(self, boxes, scene_starts, filled_frames=(), manual=False):
        super().__init__(boxes)
        self.scene_starts = list(scene_starts)
        self.filled_frames = list(filled_frames)
        self.manual = manual


def valid_track_box(box, source):
    return (isinstance(box, list) and len(box) == 4
            and all(type(v) in (float, int) and math.isfinite(v) for v in box)
            and 0 <= box[0] < box[2] <= source["width"]
            and 0 <= box[1] < box[3] <= source["height"]
            and min(box[2] - box[0], box[3] - box[1]) >= 2)


def saved_track_frames(data):
    source, window = data["source"], data["window"]
    saved = data.get("saved_frames", [])
    if not isinstance(saved, list) or len(saved) > 20000:
        raise ValueError("Invalid saved face track frames.")
    records, previous = {}, -1
    for record in saved:
        if (not isinstance(record, list) or len(record) != 3
                or type(record[0]) is not int or not previous < record[0] < source["total"]
                or type(record[2]) is not bool
                or record[1] is not None and not valid_track_box(record[1], source)):
            raise ValueError("Invalid saved face track frames.")
        previous = record[0]
        records[record[0]] = (record[1], record[2])
    skipped = set(data["skipped_frames"])
    for frame in range(window["begin"], window["stop"]):
        index = frame - window["first"]
        records[frame] = (data["boxes"][index], index in skipped)
    return records


def manual_track(payload, region, target_id, complete=True):
    if not isinstance(payload, str) or len(payload) > 2_000_000:
        raise ValueError("Invalid face track JSON size.")
    data = json.loads(payload)
    if (not isinstance(data, dict) or type(data.get("version")) is not int
            or data["version"] != 1 or data.get("type") != "h3_face_track"):
        raise ValueError("Expected version 1 h3_face_track JSON.")
    source = data.get("source", {})
    window = data.get("window", {})
    if (not isinstance(source, dict) or not isinstance(window, dict)
            or any(type(window.get(key)) is not int for key in ("first", "last", "begin", "stop", "input_frames"))
            or source != {key: region[key] for key in ("digest", "width", "height", "fps", "total")}
            or window != {key: region[key] for key in ("first", "last", "begin", "stop", "input_frames")}
            or type(data.get("target_id")) is not int or data["target_id"] != target_id):
        raise ValueError("Face track JSON does not match this source video, interval or target. Preview the track again.")
    boxes, starts, skipped = data.get("boxes"), data.get("scene_starts"), data.get("skipped_frames")
    if not isinstance(boxes, list) or len(boxes) != region["input_frames"]:
        raise ValueError("Face track JSON must contain one box per source-window frame.")
    for name, values in (("scene_starts", starts), ("skipped_frames", skipped)):
        if (not isinstance(values, list) or any(type(i) is not int or not 0 <= i < len(boxes) for i in values)
                or values != sorted(set(values))):
            raise ValueError(f"Invalid face track {name}.")
    if not starts or starts[0] != 0:
        raise ValueError("Face track scene_starts must begin at zero.")
    skipped = set(skipped)
    for index, box in enumerate(boxes):
        if box is None:
            if complete and region["begin"] - region["first"] <= index < region["stop"] - region["first"] and index not in skipped:
                raise ValueError(f"Face track frame {region['first'] + index + 1} needs a box or an explicit skip.")
            continue
        if not valid_track_box(box, region):
            raise ValueError(f"Invalid face track box at frame {region['first'] + index + 1}.")
    saved_track_frames(data)
    selected = [None if index in skipped else box for index, box in enumerate(boxes)]
    if complete and not any(box is not None for box in selected[region["begin"] - region["first"]:region["stop"] - region["first"]]):
        raise ValueError("Face track has no selected face in the refinement interval.")
    return TrackedFaces(selected, starts, manual=True)


def frame_signature(image):
    import cv2

    return cv2.resize(image, (64, 36), interpolation=cv2.INTER_AREA).astype(np.float32) / 255


def scene_boundaries(signatures):
    return [0] + [index for index in range(1, len(signatures))
                  if float(np.mean(np.abs(signatures[index] - signatures[index - 1]))) > .18]


def _geometry(previous, current, velocity, elapsed):
    size = np.maximum(1, previous[2:] - previous[:2])
    center = (previous[:2] + previous[2:]) / 2
    distance = np.linalg.norm((current[:2] + current[2:]) / 2 - center
                              - velocity * elapsed) / max(size)
    ratio = max(np.max((current[2:] - current[:2]) / size),
                np.max(size / np.maximum(1, current[2:] - current[:2])))
    return float(distance), float(ratio)


def _trajectories(detections, fps, starts):
    from scipy.optimize import linear_sum_assignment

    tracks = []
    max_gap = max(1, round(fps * .25))
    for shot, (start, stop) in enumerate(zip(starts, starts[1:] + [len(detections)])):
        active = []
        for index in range(start, stop):
            faces = detections[index]
            active = [track for track in active if index - track["last"] <= max_gap + 1]
            scores = np.full((len(active), len(faces)), -1e6)
            for row, track in enumerate(active):
                previous = track["faces"][track["last"]]
                elapsed = index - track["last"]
                for column, face in enumerate(faces):
                    similarity = float(np.dot(previous["embedding"], face["embedding"]))
                    distance, ratio = _geometry(
                        np.asarray(previous["bbox"]), np.asarray(face["bbox"]), track["velocity"], elapsed)
                    if similarity >= .5 and distance <= 2 and ratio <= 2.5:
                        scores[row, column] = similarity - .2 * min(distance, 2)
            # Mutual uniqueness prevents two nearby tracks from claiming one face.
            for row in range(len(active)):
                choices = sorted(scores[row], reverse=True)
                if len(choices) > 1 and choices[0] > -1e5 and choices[0] - choices[1] < .1:
                    scores[row] = -1e6
                    active[row]["ambiguous"].append(index)
            for column in range(len(faces)):
                choices = sorted(scores[:, column], reverse=True)
                if len(choices) > 1 and choices[0] > -1e5 and choices[0] - choices[1] < .1:
                    for row in np.flatnonzero(scores[:, column] > -1e5):
                        active[row]["ambiguous"].append(index)
                    scores[:, column] = -1e6
            assigned = set()
            if scores.size:
                rows, columns = linear_sum_assignment(-scores)
                for row, column in zip(rows, columns):
                    if scores[row, column] < -1e5:
                        continue
                    track, face = active[row], faces[column]
                    previous = np.asarray(track["faces"][track["last"]]["bbox"])
                    box = np.asarray(face["bbox"])
                    track["velocity"] = ((box[:2] + box[2:] - previous[:2] - previous[2:]) / 2
                                         / (index - track["last"]))
                    track["faces"][index] = face
                    track["last"] = index
                    assigned.add(column)
            for column, face in enumerate(faces):
                if column not in assigned:
                    track = dict(shot=shot, first=index, last=index, faces={index: face},
                                 velocity=np.zeros(2), ambiguous=[])
                    active.append(track)
                    tracks.append(track)
    return tracks


def _gallery(track):
    faces = list(track["faces"].values())
    indices = np.unique(np.linspace(0, len(faces) - 1, min(128, len(faces))).round().astype(int))
    return np.asarray([faces[index]["embedding"] for index in indices])


def _gallery_similarity(left, right):
    scores = left @ right.T
    # Compare compatible views with distinct supporting frames on both sides.
    supported = []
    for _ in range(min(5, len(left), len(right))):
        row, column = np.unravel_index(np.argmax(scores), scores.shape)
        supported.append(float(scores[row, column]))
        scores[row, :] = -np.inf
        scores[:, column] = -np.inf
    return float(np.median(supported))


def _coexist(left, right):
    return left["shot"] == right["shot"] and max(left["first"], right["first"]) <= min(left["last"], right["last"])


def _select_trajectories(tracks, anchor, allow_incomplete=False):
    galleries = [_gallery(track) for track in tracks]
    selected = {anchor}
    pending = set(range(len(tracks))) - selected
    while pending:
        excluded = {index for index in pending if any(_coexist(tracks[index], tracks[other]) for other in selected)}
        candidates = []
        uncertain = []
        for index in pending - excluded:
            positive = max(_gallery_similarity(galleries[index], galleries[other]) for other in selected)
            negative = max((_gallery_similarity(galleries[index], galleries[other]) for other in excluded), default=-1)
            if positive >= .5 and positive - negative >= .1:
                candidates.append((positive, index))
            elif positive >= .4 and positive >= negative:
                uncertain.append(index)
        if not candidates:
            if uncertain and not allow_incomplete:
                raise ValueError("Face identity is uncertain across this interval. Choose a clearer start frame or a shorter interval.")
            break
        candidates.sort(reverse=True)
        for score, index in candidates:
            if any(_coexist(tracks[index], tracks[other]) for other in selected):
                continue
            competitors = [(value, other) for value, other in candidates
                           if other != index and _coexist(tracks[index], tracks[other])]
            if competitors and score - max(value for value, _ in competitors) < .1:
                if allow_incomplete:
                    pending.remove(index)
                    continue
                raise ValueError("Face identity is ambiguous. Continuous refinement cannot safely select one person.")
            selected.add(index)
            pending.remove(index)
    return selected


def _continuous_boxes(detections, tracks, selected, starts, fps, padding, allow_incomplete=False):
    boxes = [None] * len(detections)
    filled = []
    owners = {}
    uncertain = {frame for index in selected for frame in tracks[index]["ambiguous"]} if allow_incomplete else set()
    for index in selected:
        track = tracks[index]
        if track["ambiguous"] and not allow_incomplete:
            raise ValueError("Face identity is ambiguous. Continuous refinement cannot safely select one person.")
        for frame, face in track["faces"].items():
            boxes[frame] = tuple(face["bbox"])
            owners[frame] = face
    max_gap = max(1, round(fps * .25))
    for start, stop in zip(starts, starts[1:] + [len(boxes)]):
        good = [index for index in range(start, stop) if boxes[index] is not None]
        for left, right in zip(good, good[1:]):
            if right == left + 1:
                continue
            if right - left - 1 > max_gap:
                if allow_incomplete:
                    continue
                raise ValueError("Face tracking has an unresolved gap. Shorten the interval to avoid intermittent refinement.")
            a, b = np.asarray(boxes[left]), np.asarray(boxes[right])
            distance, ratio = _geometry(a, b, np.zeros(2), 1)
            if distance > 2 or ratio > 2.5:
                if allow_incomplete:
                    continue
                raise ValueError("Face motion cannot be recovered continuously across missing detections.")
            for index in range(left + 1, right):
                boxes[index] = tuple(a + (b - a) * ((index - left) / (right - left)))
                filled.append(index)
    for index, box in enumerate(boxes):
        if index in uncertain:
            boxes[index] = None
            continue
        if box is None:
            continue
        protected = np.asarray(box) + [-padding, -padding, padding, padding]
        if any(face is not owners.get(index) and overlap(protected, face["bbox"]) > .1
               for face in detections[index]):
            if allow_incomplete:
                boxes[index] = None
                continue
            raise ValueError("The selected face overlaps another face. Shorten the interval or reduce feathering.")
    return TrackedFaces(boxes, starts, filled)


def track_faces(detections, anchor_frame, target_id, fps, padding=12, scene_starts=None, allow_incomplete=False):
    if (not math.isfinite(fps) or fps <= 0 or not 0 <= anchor_frame < len(detections)
            or isinstance(anchor_frame, bool) or int(anchor_frame) != anchor_frame
            or not math.isfinite(padding) or padding < 0
            or isinstance(target_id, bool) or int(target_id) != target_id or target_id < 0):
        raise ValueError("Invalid target face selection.")
    anchor_frame = int(anchor_frame)
    faces = ordered_faces(detections[anchor_frame])
    if target_id >= len(faces):
        if allow_incomplete:
            return TrackedFaces([None] * len(detections), scene_starts or [0])
        raise ValueError(f"Target Face ID {target_id} is unavailable at the region start ({len(faces)} faces).")
    starts = list(scene_starts) if scene_starts is not None else [0]
    if (not starts or starts[0] != 0 or starts != sorted(set(starts))
            or any(isinstance(index, bool) or int(index) != index or not 0 <= index < len(detections)
                   for index in starts)):
        raise ValueError("Invalid face-tracking scene boundaries.")
    starts = list(map(int, starts))
    anchor_index = next(index for index, face in enumerate(detections[anchor_frame])
                        if face is faces[int(target_id)])
    normalized = []
    feature_size = None
    for frame in detections:
        normalized.append([])
        for face in frame:
            box = np.asarray(face["bbox"], dtype=float)
            vector = unit(face["embedding"])
            if (box.shape != (4,) or not np.isfinite(box).all() or np.any(box[2:] <= box[:2])
                    or feature_size is not None and len(vector) != feature_size):
                raise ValueError("Invalid face detection geometry or identity features.")
            feature_size = len(vector)
            normalized[-1].append(dict(bbox=tuple(box), embedding=vector))
    anchor_face = normalized[anchor_frame][anchor_index]
    tracks = _trajectories(normalized, fps, starts)
    anchor = next(index for index, track in enumerate(tracks)
                  if track["faces"].get(anchor_frame) is anchor_face)
    return _continuous_boxes(normalized, tracks, _select_trajectories(tracks, anchor, allow_incomplete),
                             starts, fps, padding, allow_incomplete)


MEDIAPIPE_MODEL = "mediapipe_face_fp32.safetensors"


def model_files(roots, detection_roots):
    result = {}
    for name, directories, folders in (
            ("det_10g.onnx", roots, ("models/buffalo_l", "buffalo_l", "")),
            ("w600k_r50.onnx", roots, ("models/buffalo_l", "buffalo_l", "")),
            (MEDIAPIPE_MODEL, detection_roots, ("",))):
        for root in directories:
            for folder in folders:
                path = Path(root) / folder / name
                if path.is_file():
                    result[name] = path
                    break
            if name in result:
                break
        if name not in result:
            raise FileNotFoundError(f"Face targeting requires the installed model: {name}")
    return result


def identity_keypoints(landmarks):
    points = np.asarray(landmarks, dtype=np.float32)
    if points.shape != (478, 2) or not np.isfinite(points).all():
        raise ValueError("Invalid MediaPipe face landmarks.")
    # ArcFace expects eye centers, nose tip, then the two outer mouth corners.
    return np.stack(((points[33] + points[133]) / 2, (points[362] + points[263]) / 2,
                     points[1], points[61], points[291]))


def face_windows(width, height):
    windows = [(0, 0, width, height)]
    # Square crops give small faces the same detector scale in portrait and landscape videos.
    for fraction in (.75, .5):
        side = max(1, round(min(width, height) * fraction))
        offsets = []
        for length in (width, height):
            starts = list(range(0, length - side + 1, max(1, side // 2)))
            if starts[-1] != length - side:
                starts.append(length - side)
            offsets.append(starts)
        windows.extend((x, y, side, side) for y in offsets[1] for x in offsets[0])
    return windows


class FaceAnalyzer:
    def __init__(self, roots, detection_roots):
        import os
        os.environ.setdefault("NO_ALBUMENTATIONS_UPDATE", "1")
        import onnxruntime as ort
        import torch
        from insightface.model_zoo import get_model
        from safetensors.torch import load_file
        from comfy_extras.mediapipe.face_landmarker import FaceLandmarker

        paths = model_files(roots, detection_roots)
        weights = load_file(str(paths[MEDIAPIPE_MODEL]), device="cpu")
        state = {}
        for name, tensor in weights.items():
            if name.startswith("detector_short."):
                state["detector." + name[len("detector_short."):]] = tensor
            elif name.startswith(("detector_full.", "mesh.", "blendshapes.")):
                state[name] = tensor
        self.detector = FaceLandmarker(device="cpu", dtype=torch.float32, detector_variant="both").eval()
        self.detector.load_state_dict(state, strict=True)
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        settings = dict(providers=["CPUExecutionProvider"], sess_options=options)
        self.native_detector = get_model(str(paths["det_10g.onnx"]), **settings)
        self.recognition = get_model(str(paths["w600k_r50.onnx"]), **settings)
        self.native_detector.prepare(ctx_id=-1, input_size=(640, 640), det_thresh=.5)
        self.recognition.prepare(ctx_id=-1)

    def get(self, image):
        import cv2
        from insightface.app.common import Face

        height, width = image.shape[:2]
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        detected = []
        boxes, landmarks = self.native_detector.detect(image, max_num=0, metric="default")
        for box, points in zip(boxes, landmarks if landmarks is not None else []):
            bounds = np.clip(box[:4], [0, 0, 0, 0], [width, height, width, height])
            if min(bounds[2:] - bounds[:2]) >= 12 and box[4] >= .5:
                detected.append(dict(bbox=bounds, kps=points, det_score=box[4]))

        windows = face_windows(width, height)
        images = [rgb[y:y + h, x:x + w] for x, y, w, h in windows]
        for variant in ("full", "short"):
            batches = self.detector.detect_batch(images, num_faces=0, score_thresh=.5, variant=variant)
            for (x, y, _, _), faces in zip(windows, batches):
                for face in faces:
                    # Presence is a logit. Reject non-faces before combining detector variants.
                    if (not math.isfinite(face["presence"]) or face["presence"] < 0
                            or not math.isfinite(face["score"]) or face["score"] < .5):
                        continue
                    bounds = np.clip(face["bbox_xyxy"] + np.array([x, y, x, y]),
                                     [0, 0, 0, 0], [width, height, width, height])
                    if (not np.isfinite(bounds).all() or min(bounds[2:] - bounds[:2]) < 12
                            or any(overlap(bounds, other["bbox"]) > .5 for other in detected)):
                        continue
                    detected.append(dict(bbox=bounds, kps=identity_keypoints(face["landmarks_xy"]) + [x, y],
                                         det_score=face["score"]))
        result = []
        for detection in detected:
            face = Face(**detection)
            embedding = self.recognition.get(image, face)
            result.append(dict(bbox=detection["bbox"].tolist(), embedding=unit(embedding)))
        return ordered_faces(result)


class SimpAIFaceIdentityTrack:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"images": ("IMAGE",), "region": ("H3_REGION",),
                             "target_id": ("INT", {"default": 0, "min": 0, "max": 99}),
                             "feather": ("INT", {"default": 8, "min": 0, "max": 64})},
                "optional": {"track_json": ("STRING", {"default": "", "multiline": True})}}

    RETURN_TYPES = ("BBOX,",)
    FUNCTION = "track"
    CATEGORY = "SimpAI/video"

    def track(self, images, region, target_id, feather=8, track_json=""):
        if track_json.strip():
            if len(images) != region["input_frames"] or tuple(images.shape[1:3]) != (region["height"], region["width"]):
                raise ValueError("Face track JSON requires the matching original source frames.")
            return (manual_track(track_json, region, target_id),)
        import cv2
        import logging
        import folder_paths
        import comfy.model_management
        from comfy.utils import ProgressBar

        if len(images) != region["input_frames"]:
            raise ValueError("Face tracking requires the original source window.")
        analyzer = FaceAnalyzer(folder_paths.get_folder_paths("insightface"),
                                folder_paths.get_folder_paths("detection"))
        detections = []
        signatures = []
        progress = ProgressBar(len(images))
        for index, image in enumerate(images):
            comfy.model_management.throw_exception_if_processing_interrupted()
            rgb = (image.detach().cpu().numpy().clip(0, 1) * 255).round().astype(np.uint8)
            bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
            detections.append(analyzer.get(bgr))
            signatures.append(frame_signature(bgr))
            progress.update_absolute(index + 1)
        padding = max(12, math.ceil((8 * .375 + 1) / 2)
                      + math.ceil((feather * .375 + 1) / 2) + math.ceil(feather * .5) + 2)
        boxes = track_faces(detections, region["begin"] - region["first"], target_id, region["fps"],
                            padding, scene_boundaries(signatures))
        logging.info("H3 target face %s: %d/%d frames selected, %d short-gap frames recovered.",
                     target_id, sum(box is not None for box in boxes), len(boxes), len(boxes.filled_frames))
        if not any(box is not None for box in boxes[region["begin"] - region["first"]:region["stop"] - region["first"]]):
            raise ValueError("The selected face cannot be matched confidently in this interval.")
        return (boxes,)


NODE_CLASS_MAPPINGS = {"SimpAIFaceIdentityTrack": SimpAIFaceIdentityTrack}
NODE_DISPLAY_NAME_MAPPINGS = {"SimpAIFaceIdentityTrack": "Track Selected Face Identity"}


def preview(request):
    import base64
    import cv2

    capture = cv2.VideoCapture(request["video"])
    try:
        fps = capture.get(cv2.CAP_PROP_FPS)
        if not math.isfinite(fps) or fps <= 0:
            raise ValueError("Cannot read video FPS.")
        frame_index = round(request["start"] * fps)
        capture.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
        ok, frame = capture.read()
        if not ok:
            raise ValueError("Cannot read the region start frame.")
    finally:
        capture.release()
    faces = FaceAnalyzer(request["roots"], request["detection_roots"]).get(frame)
    height, width = frame.shape[:2]
    if max(width, height) > 640:
        frame = cv2.resize(frame, (round(width * 640 / max(width, height)),
                                   round(height * 640 / max(width, height))))
    _, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return dict(frame=frame_index, width=width, height=height,
                image="data:image/jpeg;base64," + base64.b64encode(encoded).decode("ascii"),
                faces=[dict(id=i, bbox=face["bbox"]) for i, face in enumerate(faces)])


def _reuse_track(payload, region, target_id):
    if not payload:
        return {}
    if not isinstance(payload, str) or len(payload) > 2_000_000:
        raise ValueError("Invalid face track JSON size.")
    data = json.loads(payload)
    if (not isinstance(data, dict) or not isinstance(data.get("source"), dict)
            or not isinstance(data.get("window"), dict)
            or data["source"] != {key: region[key] for key in ("digest", "width", "height", "fps", "total")}
            or data.get("target_id") != target_id):
        raise ValueError("Face Track Source Changed")
    window = data["window"]
    keys = ("first", "last", "begin", "stop", "input_frames")
    if (any(type(window.get(key)) is not int for key in keys)
            or not 0 <= window["first"] <= window["begin"] < window["stop"] <= window["last"] <= region["total"]
            or not window["last"] - window["first"] <= window["input_frames"] <= 1800):
        raise ValueError("Invalid face track JSON size.")
    manual_track(payload, {**data["source"], **window}, target_id, complete=False)
    return saved_track_frames(data)


def _extend_track(detections, records, begin, stop, fps, padding, starts):
    """Use a reviewed neighbouring box to choose the identity of each new span."""
    result = {}
    missing = sorted(detections)
    spans = []
    for frame in missing:
        if not spans or frame != spans[-1][-1] + 1:
            spans.append([])
        spans[-1].append(frame)
    for frames in spans:
        left, right = frames[0] - 1, frames[-1] + 1
        anchors = [(left, 0), (right, len(frames) - 1)]
        selected = None
        for anchor, offset in anchors:
            box = records.get(anchor, (None, False))[0]
            if box is None or any(min(anchor, frames[offset]) < s <= max(anchor, frames[offset]) for s in starts):
                continue
            candidates = []
            for index, face in enumerate(ordered_faces(detections[frames[offset]])):
                distance, ratio = _geometry(np.asarray(box), np.asarray(face["bbox"]), np.zeros(2), 1)
                if distance <= 1 and ratio <= 2.5:
                    candidates.append((overlap(box, face["bbox"]) - .25 * distance, index))
            candidates.sort(reverse=True)
            if (candidates and candidates[0][0] >= .2
                    and (len(candidates) == 1 or candidates[0][0] - candidates[1][0] >= .15)):
                selected = offset, candidates[0][1]
                break
        if selected is None:
            continue
        boxes = track_faces([detections[n] for n in frames], *selected, fps, padding,
                            [0] + [s - frames[0] for s in starts if frames[0] < s <= frames[-1]],
                            allow_incomplete=True)
        result.update(zip(frames, boxes))
    return result


def preview_track(request, progress=None):
    import cv2
    from .SimpAIH3RegionRebuild import region_layout, validate_source_timeline

    capture = cv2.VideoCapture(request["video"])
    try:
        report = progress or (lambda **kwargs: None)
        report(stage="Face Track Reading Source", percent=0, completed=0, total=0)
        fps = validate_source_timeline(request["video"], capture.get(cv2.CAP_PROP_FPS))
        total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        region = region_layout(total, fps, request["start"], request["end"], request["factor"])
        if region["input_frames"] > 1800:
            raise ValueError("Face track preview is limited to 1800 source frames.")
        width, height = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)), int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        with open(request["video"], "rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        region.update(digest=digest, width=width, height=height)
        records = _reuse_track(request.get("track_json", ""), region, request["target_id"])
        begin, stop = region["begin"], region["stop"]
        mode = request.get("mode", "track")
        blank = mode == "track_blank"
        reusable = {n: record for n, record in records.items() if begin <= n < stop}
        confirmed = request.get("confirm_target") is True
        needs_confirmation = bool(records and not any(box for box, _ in reusable.values()) and not confirmed and not blank)
        missing = [n for n in range(begin, stop) if not blank and not needs_confirmation
                   and (n not in records or mode == "track" and records[n] == (None, False))]
        analyzer = None
        if missing:
            report(stage="Face Track Loading Models", percent=0, completed=0, total=len(missing))
            analyzer = FaceAnalyzer(request["roots"], request["detection_roots"])
        detections, signatures = {}, []
        missing_set = set(missing)
        capture.set(cv2.CAP_PROP_POS_FRAMES, region["first"])
        for frame_index in range(region["first"], region["last"]):
            ok, frame = capture.read()
            if not ok:
                raise ValueError("Cannot decode the face tracking interval.")
            if frame_index in missing_set:
                detections[frame_index] = analyzer.get(frame)
                report(stage="Face Track Detecting Frames", percent=min(95, 95 * len(detections) // len(missing)),
                       completed=len(detections), total=len(missing))
            signatures.append(frame_signature(frame))
        while len(signatures) < region["input_frames"]:
            signatures.append(signatures[-1])
        starts = scene_boundaries(signatures)
        report(stage="Face Track Matching Frames", percent=97, completed=len(detections), total=len(missing))
        selected = {}
        if detections:
            feather = request["feather"]
            padding = max(12, math.ceil((8 * .375 + 1) / 2)
                          + math.ceil((feather * .375 + 1) / 2) + math.ceil(feather * .5) + 2)
            absolute_starts = [n + region["first"] for n in starts]
            if not records or confirmed and not any(box for box, _ in reusable.values()):
                sequence = [detections.get(n, []) for n in range(begin, stop)]
                selected = dict(zip(range(begin, stop), track_faces(
                    sequence, 0, request["target_id"], fps, padding,
                    [0] + [n - begin for n in absolute_starts if begin < n < stop], allow_incomplete=True)))
            else:
                selected = _extend_track(detections, records, begin, stop, fps, padding, absolute_starts)
        boxes, skipped = [None] * region["input_frames"], []
        for frame in range(begin, stop):
            box, skip = (None, False) if blank else records.get(frame, (None, False))
            if frame in missing_set:
                box = selected.get(frame)
            index = frame - region["first"]
            boxes[index] = box
            if skip:
                skipped.append(index)
        # Detection boxes can extend beyond image borders; editor coordinates cannot.
        clipped = [None if box is None else [
            max(0., min(width, float(box[0]))), max(0., min(height, float(box[1]))),
            max(0., min(width, float(box[2]))), max(0., min(height, float(box[3])))] for box in boxes]
        clipped = [box if box is None or min(box[2] - box[0], box[3] - box[1]) >= 2 else None for box in clipped]
        report(stage="Face Track Validating Result", percent=99, completed=len(detections), total=len(missing))
        return dict(track=dict(
            version=1, type="h3_face_track", target_id=request["target_id"],
            source={key: region[key] for key in ("digest", "width", "height", "fps", "total")},
            window={key: region[key] for key in ("first", "last", "begin", "stop", "input_frames")},
            boxes=clipped, scene_starts=starts, skipped_frames=skipped,
            saved_frames=[[n, box, skip] for n, (box, skip) in sorted(records.items()) if not begin <= n < stop],
            needs_target_confirmation=needs_confirmation))
    finally:
        capture.release()
