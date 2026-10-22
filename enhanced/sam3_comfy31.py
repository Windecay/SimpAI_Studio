import os
import shutil
import sys
import tempfile
import threading
from collections import OrderedDict
from contextlib import contextmanager
from typing import Any
from typing import Iterable

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image


SAM31_CHECKPOINT_URL = "https://www.modelscope.cn/models/Comfy-Org/sam3.1/resolve/master/checkpoints/sam3.1_multiplex_fp16.safetensors"
SAM31_CHECKPOINT_FILENAME = "sam3.1_multiplex_fp16.safetensors"

_MODEL_LOCK = threading.Lock()
_MODEL: Any = None
_CLIP: Any = None
_CKPT_PATH: str | None = None


def repo_root() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def ensure_comfy_importable() -> None:
    comfy_root = os.path.join(repo_root(), "comfy")
    if comfy_root not in sys.path:
        sys.path.insert(0, comfy_root)


def _checkpoint_dirs() -> list[str]:
    dirs: list[str] = []
    try:
        import modules.config as config

        for p in getattr(config, "paths_checkpoints", []) or []:
            if p and str(p) not in dirs:
                dirs.append(str(p))
        models_root = config.get_path_models_root()
        fallback = os.path.join(models_root, "checkpoints")
        if fallback not in dirs:
            dirs.append(fallback)
    except Exception:
        fallback = os.path.join(repo_root(), "models", "checkpoints")
        if fallback not in dirs:
            dirs.append(fallback)
    return [os.path.abspath(p) for p in dirs]


def resolve_sam31_checkpoint(model_path: str | None = None, *, allow_download: bool = False) -> str:
    if model_path:
        candidate = os.path.abspath(str(model_path))
        if os.path.isfile(candidate):
            return candidate

    for folder in _checkpoint_dirs():
        candidate = os.path.abspath(os.path.join(folder, SAM31_CHECKPOINT_FILENAME))
        if os.path.isfile(candidate):
            return candidate

    if not allow_download:
        raise FileNotFoundError("SAM3.1 is missing. Install it through model management or the current preset model downloads, then retry.")

    from modules.model_loader import load_file_from_url

    model_dir = _checkpoint_dirs()[0]
    os.makedirs(model_dir, exist_ok=True)
    load_file_from_url(
        url=SAM31_CHECKPOINT_URL,
        model_dir=model_dir,
        file_name=SAM31_CHECKPOINT_FILENAME,
    )
    candidate = os.path.abspath(os.path.join(model_dir, SAM31_CHECKPOINT_FILENAME))
    if os.path.isfile(candidate):
        return candidate
    raise FileNotFoundError(f"SAM3.1 checkpoint download did not create: {candidate}")


def ensure_sam31_loaded(model_path: str | None = None, *, allow_download: bool = False) -> tuple[Any, Any, str]:
    global _MODEL, _CLIP, _CKPT_PATH

    ckpt_path = resolve_sam31_checkpoint(model_path, allow_download=allow_download)
    with _MODEL_LOCK:
        if _MODEL is not None and _CLIP is not None and _CKPT_PATH == ckpt_path:
            return _MODEL, _CLIP, ckpt_path

        unload_sam31()
        ensure_comfy_importable()
        import comfy.sd

        model, clip, _vae, _clipvision = comfy.sd.load_checkpoint_guess_config(
            ckpt_path,
            output_vae=False,
            output_clip=True,
            output_clipvision=False,
            output_model=True,
        )
        if model is None or clip is None:
            raise RuntimeError("SAM3.1 checkpoint did not load a model and text encoder.")
        _MODEL = model
        _CLIP = clip
        _CKPT_PATH = ckpt_path
        return _MODEL, _CLIP, ckpt_path


def unload_sam31() -> None:
    global _MODEL, _CLIP, _CKPT_PATH

    model = _MODEL
    clip = _CLIP
    _MODEL = None
    _CLIP = None
    _CKPT_PATH = None
    try:
        if model is not None and getattr(model, "model", None) is not None:
            model.model.to("cpu")
    except Exception:
        pass
    try:
        if clip is not None and getattr(clip, "cond_stage_model", None) is not None:
            clip.cond_stage_model.to("cpu")
    except Exception:
        pass
    try:
        import gc

        gc.collect()
    except Exception:
        pass
    if torch.cuda.is_available():
        try:
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
        except Exception:
            pass


def image_to_tensor(image_rgb: Image.Image) -> torch.Tensor:
    if image_rgb.mode != "RGB":
        image_rgb = image_rgb.convert("RGB")
    arr = np.asarray(image_rgb, dtype=np.float32) / 255.0
    return torch.from_numpy(arr).unsqueeze(0)


def _encode_conditioning(clip: Any, prompt: str) -> list[list[Any]]:
    tokens = clip.tokenize(str(prompt or "").strip())
    encoded = clip.encode_from_tokens(tokens, return_dict=True)
    cond = encoded.pop("cond")
    return [[cond, encoded]]


def _extract_text_prompts(conditioning: list[list[Any]], device: torch.device, dtype: torch.dtype) -> list[tuple[torch.Tensor, torch.Tensor, int]]:
    cond_meta = conditioning[0][1]
    multi = cond_meta.get("sam3_multi_cond")
    prompts = []
    if multi is not None:
        for entry in multi:
            emb = entry["cond"].to(device=device, dtype=dtype)
            mask = entry["attention_mask"].to(device) if entry.get("attention_mask") is not None else None
            if mask is None:
                mask = torch.ones(emb.shape[0], emb.shape[1], dtype=torch.int64, device=device)
            prompts.append((emb, mask, int(entry.get("max_detections", 1) or 1)))
    else:
        emb = conditioning[0][0].to(device=device, dtype=dtype)
        mask = cond_meta.get("attention_mask")
        if mask is not None:
            mask = mask.to(device)
        else:
            mask = torch.ones(emb.shape[0], emb.shape[1], dtype=torch.int64, device=device)
        prompts.append((emb, mask, 1))
    return prompts


def _load_model_gpu(model: Any) -> tuple[torch.device, torch.dtype, Any]:
    ensure_comfy_importable()
    import comfy.model_management

    comfy.model_management.load_model_gpu(model)
    device = comfy.model_management.get_torch_device()
    dtype = model.model.get_dtype()
    return device, dtype, model.model.diffusion_model


def _resize_to_sam(image_tensor: torch.Tensor, device: torch.device, dtype: torch.dtype, size: int = 1008) -> torch.Tensor:
    ensure_comfy_importable()
    import comfy.utils

    chw = image_tensor[..., :3].movedim(-1, 1)
    return comfy.utils.common_upscale(chw, int(size), int(size), "bilinear", crop="disabled").to(device=device, dtype=dtype)


def _normalize_points(points: Iterable[dict[str, Any]] | None) -> list[list[float]]:
    out: list[list[float]] = []
    if not points:
        return out
    for p in points:
        if not isinstance(p, dict):
            continue
        x = max(0.0, min(1.0, float(p.get("x", 0.0))))
        y = max(0.0, min(1.0, float(p.get("y", 0.0))))
        out.append([x, y])
    return out


def image_mask_from_points(
    image_rgb: Image.Image,
    *,
    positive_points: Iterable[dict[str, Any]] | None,
    negative_points: Iterable[dict[str, Any]] | None,
    mask_threshold: float = 0.0,
    refine_iterations: int = 2,
    image_size: int = 1008,
    model_path: str | None = None,
) -> np.ndarray:
    image_size = normalize_sam_image_size(image_size)
    model, _clip, _ckpt = ensure_sam31_loaded(model_path, allow_download=False)
    device, dtype, sam3_model = _load_model_gpu(model)

    image_tensor = image_to_tensor(image_rgb)
    h, w = int(image_tensor.shape[1]), int(image_tensor.shape[2])
    image_in = _resize_to_sam(image_tensor, device, dtype, size=image_size)

    pos = _normalize_points(positive_points)
    neg = _normalize_points(negative_points)
    if not pos and not neg:
        return image_mask_from_text(
            image_rgb,
            prompt="visual",
            threshold=0.3,
            mask_threshold=mask_threshold,
            refine_iterations=refine_iterations,
            image_size=image_size,
            model_path=model_path,
        )

    coords = [[x * float(image_size), y * float(image_size)] for x, y in pos] + [[x * float(image_size), y * float(image_size)] for x, y in neg]
    labels = ([1] * len(pos)) + ([0] * len(neg))
    point_inputs = {
        "point_coords": torch.tensor([coords], dtype=dtype, device=device),
        "point_labels": torch.tensor([labels], dtype=torch.int32, device=device),
    }
    with torch.inference_mode():
        with sam31_resolution_context(sam3_model, image_size):
            mask_logit = sam3_model.forward_segment(image_in, point_inputs=point_inputs)
            for _ in range(max(0, int(refine_iterations) - 1)):
                mask_logit = sam3_model.forward_segment(image_in, mask_inputs=mask_logit)
        mask = F.interpolate(mask_logit, size=(h, w), mode="bilinear", align_corners=False)
    if mask.ndim == 4 and mask.shape[1] == 1:
        mask = mask[:, 0]
    if mask.ndim == 3:
        mask = mask[0]
    mask_u8 = ((mask.detach().float().cpu().numpy() > float(mask_threshold)).astype(np.uint8) * 255)
    return mask_u8.astype(np.uint8)


def image_mask_from_text(
    image_rgb: Image.Image,
    *,
    prompt: str,
    threshold: float = 0.5,
    mask_threshold: float = 0.0,
    refine_iterations: int = 2,
    image_size: int = 1008,
    model_path: str | None = None,
) -> np.ndarray:
    image_size = normalize_sam_image_size(image_size)
    model, clip, _ckpt = ensure_sam31_loaded(model_path, allow_download=False)
    device, dtype, sam3_model = _load_model_gpu(model)

    image_tensor = image_to_tensor(image_rgb)
    h, w = int(image_tensor.shape[1]), int(image_tensor.shape[2])
    image_in = _resize_to_sam(image_tensor, device, dtype, size=image_size)
    conditioning = _encode_conditioning(clip, prompt)
    cond_list = _extract_text_prompts(conditioning, device, dtype)

    frame_masks = []
    with torch.inference_mode():
        with sam31_resolution_context(sam3_model, image_size) as active_size:
            for text_embeddings, text_mask, max_det in cond_list:
                results = sam3_model(
                    image_in,
                    text_embeddings=text_embeddings,
                    text_mask=text_mask,
                    boxes=None,
                    threshold=float(threshold),
                    orig_size=(h, w),
                )
                scores = results["scores"][0]
                masks = results["masks"][0]
                probs = scores.sigmoid()
                keep = probs > float(threshold)
                kept_scores = probs[keep]
                kept_masks = masks[keep]
                if kept_masks.numel() == 0:
                    continue
                order = kept_scores.argsort(descending=True)[: int(max_det)]
                for coarse in kept_masks[order]:
                    mask_logit = coarse.unsqueeze(0).unsqueeze(0)
                    for _ in range(max(0, int(refine_iterations))):
                        coarse_input = F.interpolate(mask_logit, size=(active_size, active_size), mode="bilinear", align_corners=False)
                        mask_logit = sam3_model.forward_segment(image_in, mask_inputs=coarse_input)
                    frame_masks.append(F.interpolate(mask_logit, size=(h, w), mode="bilinear", align_corners=False)[0, 0])

    if not frame_masks:
        return np.zeros((h, w), dtype=np.uint8)
    combined = torch.stack(frame_masks, dim=0).amax(dim=0)
    mask_u8 = ((combined.detach().float().cpu().numpy() > float(mask_threshold)).astype(np.uint8) * 255)
    return mask_u8.astype(np.uint8)


def _env_int(name: str, default: int) -> int:
    try:
        return int(float(str(os.environ.get(name, default)).strip()))
    except Exception:
        return int(default)


def normalize_sam_image_size(image_size: int | None = None) -> int:
    requested = int(image_size or 1008)
    patch = 14
    requested = max(patch, (requested // patch) * patch)
    return max(patch, min(1008, requested))


@contextmanager
def sam31_resolution_context(sam3_model: Any, image_size: int):
    image_size = normalize_sam_image_size(image_size)
    tracker = getattr(sam3_model, "tracker", None)
    if tracker is None:
        yield image_size
        return

    previous: list[tuple[Any, str, Any]] = []

    def _set_attr(obj: Any, name: str, value: Any) -> None:
        if obj is None or not hasattr(obj, name):
            return
        previous.append((obj, name, getattr(obj, name)))
        setattr(obj, name, value)

    stride = int(getattr(tracker, "backbone_stride", 14) or 14)
    embedding = (max(1, image_size // stride), max(1, image_size // stride))
    _set_attr(tracker, "image_size", image_size)
    for encoder_name in ("sam_prompt_encoder", "interactive_sam_prompt_encoder"):
        encoder = getattr(tracker, encoder_name, None)
        _set_attr(encoder, "image_embedding_size", embedding)
        _set_attr(encoder, "input_image_size", (image_size, image_size))
    try:
        yield image_size
    finally:
        for obj, name, value in reversed(previous):
            try:
                setattr(obj, name, value)
            except Exception:
                pass


def _read_image_bgr(path: str) -> np.ndarray | None:
    frame_bgr = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if frame_bgr is not None:
        return frame_bgr
    try:
        encoded = np.fromfile(str(path), dtype=np.uint8)
        if encoded.size <= 0:
            return None
        return cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    except Exception:
        return None


def extract_video_to_frame_cache(video_path: str, *, max_frames: int = -1, cancel_check=None) -> tuple[str, list[str], float, int, int, int]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    tmp_dir = tempfile.mkdtemp(prefix="sam31_frames_")
    frame_paths: list[str] = []
    limit = int(max_frames)
    try:
        while True:
            if cancel_check is not None and (len(frame_paths) % 8) == 0:
                cancel_check()
            if limit >= 0 and len(frame_paths) >= limit:
                break
            ok, frame_bgr = cap.read()
            if not ok:
                break
            out_path = os.path.join(tmp_dir, f"{len(frame_paths):06d}.jpg")
            ok_enc, buf = cv2.imencode(".jpg", frame_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
            if not ok_enc:
                continue
            with open(out_path, "wb") as f:
                f.write(buf.tobytes())
            frame_paths.append(out_path)
    except Exception:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise
    finally:
        cap.release()
    if not frame_paths:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise RuntimeError("No frames extracted from video.")
    if width <= 0 or height <= 0:
        sample = _read_image_bgr(frame_paths[0])
        if sample is not None:
            height, width = sample.shape[:2]
    return tmp_dir, frame_paths, fps, total or len(frame_paths), width, height


def read_frame_rgb(path: str) -> np.ndarray:
    frame_bgr = _read_image_bgr(str(path))
    if frame_bgr is None:
        raise RuntimeError(f"Cannot read cached video frame: {path}")
    return cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)


class LazySAM31VideoFrames:
    def __init__(
        self,
        frame_paths: list[str],
        *,
        device: torch.device,
        dtype: torch.dtype,
        image_size: int = 1008,
        cache_size: int | None = None,
        cancel_check=None,
    ):
        self.frame_paths = list(frame_paths)
        self._device = device
        self._dtype = dtype
        self._image_size = normalize_sam_image_size(image_size)
        self._cache_size = max(0, int(cache_size if cache_size is not None else _env_int("SIMPLEAI_SAM31_FRAME_CACHE_SIZE", 2)))
        self._cache: OrderedDict[int, torch.Tensor] = OrderedDict()
        self._cancel_check = cancel_check
        self.shape = torch.Size((len(self.frame_paths), 3, self._image_size, self._image_size))

    @property
    def device(self) -> torch.device:
        return self._device

    @property
    def dtype(self) -> torch.dtype:
        return self._dtype

    def __len__(self) -> int:
        return len(self.frame_paths)

    def _load_one(self, index: int) -> torch.Tensor:
        if self._cancel_check is not None:
            self._cancel_check()
        index = int(index)
        if index in self._cache:
            tensor = self._cache.pop(index)
            self._cache[index] = tensor
            return tensor

        ensure_comfy_importable()
        import comfy.utils

        frame_rgb = read_frame_rgb(self.frame_paths[index])
        image = torch.from_numpy(frame_rgb.astype(np.float32) / 255.0).unsqueeze(0)
        tensor = comfy.utils.common_upscale(
            image[..., :3].movedim(-1, 1),
            self._image_size,
            self._image_size,
            "bilinear",
            crop="disabled",
        ).to(device=self._device, dtype=self._dtype)

        if self._cache_size > 0:
            self._cache[index] = tensor
            while len(self._cache) > self._cache_size:
                self._cache.popitem(last=False)
        return tensor

    def __getitem__(self, item):
        if isinstance(item, slice):
            start, stop, step = item.indices(len(self.frame_paths))
            indices = list(range(start, stop, step))
            if not indices:
                return torch.empty((0, 3, self._image_size, self._image_size), device=self._device, dtype=self._dtype)
            if len(indices) == 1:
                return self._load_one(indices[0])
            return torch.cat([self._load_one(i) for i in indices], dim=0)
        return self._load_one(int(item))


def _initial_mask_from_points_or_box(
    frame_rgb: np.ndarray,
    *,
    pos_points: list[list[float]],
    neg_points: list[list[float]],
    bbox_xywh: list[list[float]] | None,
    mask_threshold: float,
    refine_iterations: int,
    image_size: int = 1008,
    model_path: str | None = None,
) -> torch.Tensor | None:
    image_size = normalize_sam_image_size(image_size)
    image = Image.fromarray(frame_rgb, mode="RGB")
    if bbox_xywh:
        model, _clip, _ckpt = ensure_sam31_loaded(model_path, allow_download=False)
        device, dtype, sam3_model = _load_model_gpu(model)
        image_tensor = image_to_tensor(image)
        h, w = int(image_tensor.shape[1]), int(image_tensor.shape[2])
        image_in = _resize_to_sam(image_tensor, device, dtype, size=image_size)
        masks = []
        with torch.inference_mode():
            with sam31_resolution_context(sam3_model, image_size) as active_size:
                for x, y, bw, bh in bbox_xywh:
                    sam_box = torch.tensor(
                        [[
                            [float(x) * float(active_size), float(y) * float(active_size)],
                            [(float(x) + float(bw)) * float(active_size), (float(y) + float(bh)) * float(active_size)],
                        ]],
                        device=device,
                        dtype=dtype,
                    )
                    mask_logit = sam3_model.forward_segment(image_in, box_inputs=sam_box)
                    for _ in range(max(0, int(refine_iterations) - 1)):
                        mask_logit = sam3_model.forward_segment(image_in, mask_inputs=mask_logit)
                    mask = F.interpolate(mask_logit, size=(h, w), mode="bilinear", align_corners=False)[0, 0]
                    masks.append(mask)
        if not masks:
            return None
        return (torch.stack(masks, dim=0) > float(mask_threshold)).float()

    if not pos_points and not neg_points:
        return None
    pos = [{"x": x, "y": y} for x, y in pos_points]
    neg = [{"x": x, "y": y} for x, y in neg_points]
    mask_u8 = image_mask_from_points(
        image,
        positive_points=pos,
        negative_points=neg,
        mask_threshold=mask_threshold,
        refine_iterations=refine_iterations,
        image_size=image_size,
        model_path=model_path,
    )
    return torch.from_numpy((mask_u8 > 127).astype(np.float32)).unsqueeze(0)


def video_masks(
    video_path: str,
    *,
    prompt: str | None = None,
    frame_index: int = 0,
    pos_points: list[list[float]] | None = None,
    neg_points: list[list[float]] | None = None,
    bbox_xywh: list[list[float]] | None = None,
    max_frames: int = -1,
    threshold: float = 0.5,
    mask_threshold: float = 0.0,
    detect_interval: int = 1,
    max_objects: int = 0,
    refine_iterations: int = 2,
    propagation_direction: str = "both",
    image_size: int = 1008,
    model_path: str | None = None,
    cancel_check=None,
) -> tuple[dict[int, np.ndarray], float, int, int, int]:
    ensure_comfy_importable()
    from comfy.ldm.sam3.tracker import unpack_masks

    image_size = normalize_sam_image_size(image_size)

    tmp_dir, frame_paths, fps, frame_count, width, height = extract_video_to_frame_cache(video_path, max_frames=max_frames, cancel_check=cancel_check)
    try:
        if cancel_check is not None:
            cancel_check()
        frame_count = len(frame_paths)
        frame_index = max(0, min(len(frame_paths) - 1, int(frame_index or 0)))
        has_initial_prompt = bool(pos_points or neg_points or bbox_xywh)
        direction = str(propagation_direction or "both").strip().lower()

        model, clip, _ckpt = ensure_sam31_loaded(model_path, allow_download=False)
        device, dtype, sam3_model = _load_model_gpu(model)

        init_masks = None
        pos_points = pos_points or []
        neg_points = neg_points or []
        if has_initial_prompt:
            init_masks = _initial_mask_from_points_or_box(
                read_frame_rgb(frame_paths[frame_index]),
                pos_points=pos_points,
                neg_points=neg_points,
                bbox_xywh=bbox_xywh,
                mask_threshold=mask_threshold,
                refine_iterations=refine_iterations,
                image_size=image_size,
                model_path=model_path,
            )
            if init_masks is not None:
                init_masks = init_masks.unsqueeze(1).to(device=device, dtype=dtype)

        text_prompts = None
        if prompt and str(prompt).strip():
            conditioning = _encode_conditioning(clip, str(prompt).strip())
            text_prompts = [(emb, mask) for emb, mask, _ in _extract_text_prompts(conditioning, device, dtype)]

        if init_masks is None and text_prompts is None:
            raise ValueError("SAM3.1 video requires an initial mask or a text prompt.")

        masks_by_frame: dict[int, np.ndarray] = {}
        unpack_chunk = max(1, _env_int("SIMPLEAI_SAM31_MASK_UNPACK_CHUNK", 16))

        def _track_subset(subset_paths: list[str], index_map: list[int]) -> None:
            if not subset_paths or not index_map:
                return
            if cancel_check is not None:
                cancel_check()
            frames_in = LazySAM31VideoFrames(subset_paths, device=device, dtype=dtype, image_size=image_size, cancel_check=cancel_check)
            with torch.inference_mode():
                with sam31_resolution_context(sam3_model, image_size):
                    if cancel_check is not None:
                        cancel_check()
                    track_data = sam3_model.forward_video(
                        images=frames_in,
                        initial_masks=init_masks,
                        pbar=None,
                        text_prompts=text_prompts,
                        new_det_thresh=float(threshold),
                        max_objects=int(max_objects or 0),
                        detect_interval=max(1, int(detect_interval or 1)),
                    )
            packed = track_data.get("packed_masks")
            if packed is None:
                return
            total_packed = int(packed.shape[0])
            for start in range(0, total_packed, unpack_chunk):
                if cancel_check is not None:
                    cancel_check()
                end = min(total_packed, start + unpack_chunk)
                selected = packed[start:end].to(device)
                binary = unpack_masks(selected)
                union = binary.any(dim=1, keepdim=True).float()
                out = F.interpolate(union, size=(height, width), mode="nearest")[:, 0]
                out_np = out.detach().cpu().numpy()
                for local_idx in range(min(out_np.shape[0], len(index_map) - start)):
                    if cancel_check is not None and (local_idx % 8) == 0:
                        cancel_check()
                    masks_by_frame[int(index_map[start + local_idx])] = (out_np[local_idx] > 0.5).astype(np.uint8) * 255
                del selected, binary, union, out

        if has_initial_prompt:
            if direction in ("forward", "forwards", "right"):
                _track_subset(frame_paths[frame_index:], list(range(frame_index, len(frame_paths))))
            elif direction in ("backward", "backwards", "reverse", "left"):
                _track_subset(list(reversed(frame_paths[: frame_index + 1])), list(range(frame_index, -1, -1)))
            else:
                _track_subset(frame_paths[frame_index:], list(range(frame_index, len(frame_paths))))
                if frame_index > 0:
                    _track_subset(list(reversed(frame_paths[: frame_index + 1])), list(range(frame_index, -1, -1)))
        else:
            _track_subset(frame_paths, list(range(len(frame_paths))))
        return masks_by_frame, fps, frame_count, width, height
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
