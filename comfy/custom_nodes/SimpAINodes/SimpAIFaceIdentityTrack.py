"""Task-local face trajectories with continuous masks and multi-view identity."""

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
    def __init__(self, boxes, scene_starts, filled_frames=()):
        super().__init__(boxes)
        self.scene_starts = list(scene_starts)
        self.filled_frames = list(filled_frames)


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


def _select_trajectories(tracks, anchor):
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
            if uncertain:
                raise ValueError("Face identity is uncertain across this interval. Choose a clearer start frame or a shorter interval.")
            break
        candidates.sort(reverse=True)
        for score, index in candidates:
            if any(_coexist(tracks[index], tracks[other]) for other in selected):
                continue
            competitors = [(value, other) for value, other in candidates
                           if other != index and _coexist(tracks[index], tracks[other])]
            if competitors and score - max(value for value, _ in competitors) < .1:
                raise ValueError("Face identity is ambiguous. Continuous refinement cannot safely select one person.")
            selected.add(index)
            pending.remove(index)
    return selected


def _continuous_boxes(detections, tracks, selected, starts, fps, padding):
    boxes = [None] * len(detections)
    filled = []
    owners = {}
    for index in selected:
        track = tracks[index]
        if track["ambiguous"]:
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
                raise ValueError("Face tracking has an unresolved gap. Shorten the interval to avoid intermittent refinement.")
            a, b = np.asarray(boxes[left]), np.asarray(boxes[right])
            distance, ratio = _geometry(a, b, np.zeros(2), 1)
            if distance > 2 or ratio > 2.5:
                raise ValueError("Face motion cannot be recovered continuously across missing detections.")
            for index in range(left + 1, right):
                boxes[index] = tuple(a + (b - a) * ((index - left) / (right - left)))
                filled.append(index)
    for index, box in enumerate(boxes):
        if box is None:
            continue
        protected = np.asarray(box) + [-padding, -padding, padding, padding]
        if any(face is not owners.get(index) and overlap(protected, face["bbox"]) > .1
               for face in detections[index]):
            raise ValueError("The selected face overlaps another face. Shorten the interval or reduce feathering.")
    return TrackedFaces(boxes, starts, filled)


def track_faces(detections, anchor_frame, target_id, fps, padding=12, scene_starts=None):
    if (not math.isfinite(fps) or fps <= 0 or not 0 <= anchor_frame < len(detections)
            or isinstance(anchor_frame, bool) or int(anchor_frame) != anchor_frame
            or not math.isfinite(padding) or padding < 0
            or isinstance(target_id, bool) or int(target_id) != target_id or target_id < 0):
        raise ValueError("Invalid target face selection.")
    anchor_frame = int(anchor_frame)
    faces = ordered_faces(detections[anchor_frame])
    if target_id >= len(faces):
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
    return _continuous_boxes(normalized, tracks, _select_trajectories(tracks, anchor), starts, fps, padding)


def model_files(roots):
    result = {}
    for name in ("det_10g.onnx", "w600k_r50.onnx"):
        for root in roots:
            for folder in ("models/buffalo_l", "buffalo_l", ""):
                path = Path(root) / folder / name
                if path.is_file():
                    result[name] = path
                    break
            if name in result:
                break
        if name not in result:
            raise FileNotFoundError(f"Face targeting requires the installed InsightFace buffalo_l model: {name}")
    return result


class FaceAnalyzer:
    def __init__(self, roots):
        import os
        os.environ.setdefault("NO_ALBUMENTATIONS_UPDATE", "1")
        import onnxruntime as ort
        from insightface.model_zoo import get_model

        paths = model_files(roots)
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        settings = dict(providers=["CPUExecutionProvider"], sess_options=options)
        self.detector = get_model(str(paths["det_10g.onnx"]), **settings)
        self.recognition = get_model(str(paths["w600k_r50.onnx"]), **settings)
        self.detector.prepare(ctx_id=-1, input_size=(640, 640), det_thresh=.5)
        self.recognition.prepare(ctx_id=-1)

    def get(self, image):
        from insightface.app.common import Face

        height, width = image.shape[:2]
        boxes, landmarks = self.detector.detect(image, max_num=0, metric="default")
        result = []
        for box, points in zip(boxes, landmarks if landmarks is not None else []):
            bounds = np.clip(box[:4], [0, 0, 0, 0], [width, height, width, height])
            if min(bounds[2:] - bounds[:2]) < 12 or box[4] < .5:
                continue
            face = Face(bbox=bounds, kps=points, det_score=box[4])
            embedding = self.recognition.get(image, face)
            result.append(dict(bbox=bounds.tolist(), embedding=unit(embedding)))
        return ordered_faces(result)


class SimpAIFaceIdentityTrack:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"images": ("IMAGE",), "region": ("H3_REGION",),
                             "target_id": ("INT", {"default": 0, "min": 0, "max": 99}),
                             "feather": ("INT", {"default": 8, "min": 0, "max": 64})}}

    RETURN_TYPES = ("BBOX,",)
    FUNCTION = "track"
    CATEGORY = "SimpAI/video"

    def track(self, images, region, target_id, feather=8):
        import cv2
        import logging
        import folder_paths
        import comfy.model_management
        from comfy.utils import ProgressBar

        if len(images) != region["input_frames"]:
            raise ValueError("Face tracking requires the original source window.")
        analyzer = FaceAnalyzer(folder_paths.get_folder_paths("insightface"))
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
    faces = FaceAnalyzer(request["roots"]).get(frame)
    height, width = frame.shape[:2]
    if max(width, height) > 640:
        frame = cv2.resize(frame, (round(width * 640 / max(width, height)),
                                   round(height * 640 / max(width, height))))
    _, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return dict(frame=frame_index, width=width, height=height,
                image="data:image/jpeg;base64," + base64.b64encode(encoded).decode("ascii"),
                faces=[dict(id=i, bbox=face["bbox"]) for i, face in enumerate(faces)])


if __name__ == "__main__":
    import sys

    try:
        value = preview(json.loads(sys.stdin.read()))
        print(json.dumps(dict(ok=True, **value)))
    except FileNotFoundError:
        print(json.dumps(dict(ok=False, error="Face identity models are missing")))
    except Exception as error:
        print(str(error), file=sys.stderr)
        print(json.dumps(dict(ok=False, error="Face preview failed")))
