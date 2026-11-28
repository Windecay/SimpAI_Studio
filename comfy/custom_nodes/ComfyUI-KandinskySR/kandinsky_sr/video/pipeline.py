"""The tiled SR run of kandy-sr on the pack's models.

Frames are resampled toward 24 fps, padded to the KVAE stride and to one tile, encoded once; the latent is cut into
overlapping tiles; each tile is upscaled by the latent upscaler, degraded with seeded noise and denoised by the DiT
in two pi-Flow evaluations; each denoised tile is decoded by the KVAE; the decoded tiles are blended with Hann
windows and cropped.

The tiles run in two passes: all of them through the latent upscaler and the DiT, then all through the KVAE decoder,
so each model comes to the card once per run instead of once per tile. Tiles are independent (seed + tile index), so
the order changes no pixel. The decoded tiles are kept as uint8 in RAM and blended a few frames at a time into the
output, which is handed over chunk by chunk (to the video writer).
"""
import functools
import logging
import math
import threading
import time

import torch
import torch.nn.functional as F

import comfy.model_management
import comfy.model_prefetch
import comfy.utils

from ..kernels import nabla as knabla
from .sampler import degraded_start, sample_piflow

log = logging.getLogger("KandinskySR")

BASES = ((512, 512), (512, 768), (768, 512))  # (H, W) of the trained visual size 512 (constants.py:39)
STRIDE = 16  # KVAE spatial factor
TARGET_FPS, FPS_TOLERANCE = 24, 1.5
WINDOW_OVERLAP = 9  # frames two temporal windows share and cross-fade
SCALES = {2.0: (2, 1.0), 4.0: (4, 1.0), 2.25: (2, 1.125)}  # total -> (tiling scale, pixel pre-upscale)
CHUNK = 8  # output frames blended at a time


def frame_plan(total, fps):
    """Indices of the source frames the model takes and their frame rate (video_io.py:60-125): toward 24 fps by a
    fixed stride when the source is faster, the native rate otherwise."""
    if abs(fps - TARGET_FPS) < FPS_TOLERANCE or fps < TARGET_FPS:
        return list(range(total)), fps
    step = fps / TARGET_FPS
    return [i for i in (round(i * step) for i in range(int(total / step))) if i < total], TARGET_FPS


def window_starts(count, window):
    """First frames of the temporal windows of `window` frames (1 + 8k) for a clip of `count` frames, and the length
    the clip is padded to (copies of its last frame). One window when it fits; otherwise windows hop by
    window - WINDOW_OVERLAP frames (a multiple of 8) and the last one starts on the next multiple of 8 that lets it
    end with the clip, so every window starts on the 4-frame latent grid and shares at least WINDOW_OVERLAP frames
    with the one before."""
    if count <= window:
        return [0], aligned_length(count)
    starts = list(range(0, count - window, window - WINDOW_OVERLAP))
    last = -(-(count - window) // 8) * 8
    return starts + [last], last + window


def aligned_length(frames):
    """1 + 8k frames, the reference's clip length (video_io.py:152); clips are padded up to it."""
    return 1 + 8 * math.ceil((frames - 1) / 8)


def base_resolution(h, w):
    ratio = w / h
    return min(BASES, key=lambda hw: abs(hw[1] / hw[0] - ratio))


def axis_positions(length, tile, overlap):
    """Fewest tiles with an even overlap of at least `overlap`, at multiples of the stride (tile_grid.py:25)."""
    if tile >= length:
        return (0,)
    unit = STRIDE if length % STRIDE == 0 and tile % STRIDE == 0 else 1
    span = (length - tile) // unit
    stride = max(1, math.floor(tile * (1.0 - overlap) / unit))
    count = math.ceil(span / stride) + 1
    return tuple(round(i * span / (count - 1)) * unit for i in range(count))


def tile_size(h, w, scale):
    bh, bw = base_resolution(h, w)
    return bh // scale, bw // scale


def padded_size(h, w, scale):
    """The source size the latent path needs: on the stride and at least one tile (source_padding.py:77)."""
    ceil = lambda v: -(-v // STRIDE) * STRIDE  # noqa: E731
    target = (ceil(h), ceil(w))
    for _ in range(3):
        th, tw = tile_size(*target, scale)
        candidate = (max(target[0], ceil(th)), max(target[1], ceil(tw)))
        if candidate == target:
            break
        target = candidate
    return target


def pad(video, h, w):
    """Bottom/right strip mirroring the source, or repeating its edge when the strip is not shorter than the source
    (source_padding.py:115). video: (T, 3, H, W) uint8."""
    bottom, right = h - video.shape[-2], w - video.shape[-1]
    if not bottom and not right:
        return video
    mode = "reflect" if bottom < video.shape[-2] and right < video.shape[-1] else "replicate"
    return F.pad(video.float(), (0, right, 0, bottom), mode=mode).to(torch.uint8)


def pre_upscale(video, factor):
    """x1.125 of the 2.25 route (upscale_utils.py:34): bilinear on the CPU, sizes rounded to the stride."""
    h, w = video.shape[-2:]
    size = (max(STRIDE, round(h * factor / STRIDE) * STRIDE), max(STRIDE, round(w * factor / STRIDE) * STRIDE))
    return F.interpolate(video.float(), size=size, mode="bilinear", align_corners=False).round_().clamp_(0, 255).to(torch.uint8)


def hann(h, w):
    """2D Hann window without zero ends (tiling_utils.py:179), built on the CPU as the reference does."""
    return torch.hann_window(h + 2)[1:-1, None] * torch.hann_window(w + 2)[None, 1:-1]


class Plan:
    """Sizes and grid of one run."""

    def __init__(self, frames, height, width, scale, overlap):
        if scale not in SCALES:
            raise ValueError(f"scale must be one of {sorted(SCALES)}, got {scale}")
        self.frames, self.scale = frames, scale
        self.tiling, self.pre = SCALES[scale]
        if self.pre != 1.0:
            height = max(STRIDE, round(height * self.pre / STRIDE) * STRIDE)
            width = max(STRIDE, round(width * self.pre / STRIDE) * STRIDE)
        self.height, self.width = height, width  # source after any pre-upscale
        self.padded = padded_size(height, width, self.tiling)
        self.tile = tile_size(*self.padded, self.tiling)
        self.tops = axis_positions(self.padded[0], self.tile[0], overlap)
        self.lefts = axis_positions(self.padded[1], self.tile[1], overlap)
        self.out_size = (height * self.tiling, width * self.tiling)

    @property
    def tiles(self):
        return [(top, left) for top in self.tops for left in self.lefts]


@functools.cache
def dit_kernels(kernels, device):
    """The DiT's kernels on this device: the requested mode where the Triton kernels run, else None (plain torch)."""
    if knabla.available(device):
        return kernels
    log.warning("Kandinsky VSR: the Triton kernels need CUDA (sm80+) and Triton; the DiT runs plain-torch NABLA on %s", device)
    return None


class Card:
    """What runs tiles on one device: its DiT and KVAE handles (the latent upscaler stays on the main card). The
    models are loaded from the main thread (load_models_gpu is not thread-safe); the workers only compute."""

    def __init__(self, dit, kvae):
        self.dit, self.kvae = dit, kvae
        self.device = dit.patcher.load_device


def run_tiles(cards, count, work, timings, name):
    """work(card, index) for every tile index, on all cards at once: a card takes the next index whenever it is free,
    so a faster card does more tiles, except one that another card would still finish sooner (a slow card taking the
    last tile can keep the fast one waiting for it)."""
    sync = lambda card: torch.cuda.synchronize(card.device) if card.device.type == "cuda" else None  # noqa: E731
    pending, lock = list(range(count)), threading.Lock()
    per_tile, started = {}, {}  # a card's mean seconds per tile; when its current tile began, while it works
    errors, stop = [], threading.Event()

    def take(card):
        with lock:
            if not pending:
                return None
            now, mine = time.perf_counter(), per_tile.get(card)
            for other, begun in started.items():
                # the other card, after its current tile, would do all the pending ones before this one finishes one
                if other is not card and mine is not None and other in per_tile and begun + per_tile[other] * (len(pending) + 1) <= now + mine:
                    return None
            started[card] = now
            return pending.pop(0)

    def worker(card):
        busy, tiles = 0.0, 0
        try:
            # grad mode is per thread: a new thread does not inherit the execution's inference mode
            with torch.no_grad(), comfy.model_management.cuda_device_context(card.device):
                while not stop.is_set():
                    index = take(card)
                    if index is None:
                        break
                    comfy.model_management.throw_exception_if_processing_interrupted()
                    t0 = time.perf_counter()
                    work(card, index)
                    sync(card)
                    busy += time.perf_counter() - t0
                    tiles += 1
                    per_tile[card] = busy / tiles
        except BaseException as e:  # raised again in the calling thread
            errors.append(e)
            stop.set()
        with lock:
            started.pop(card, None)
        timings[f"{name} {card.device}"] = (round(busy, 2), tiles)

    def spawned(card):
        try:
            worker(card)
        finally:  # allocation graphs are per thread; the execution's cleanup only reaches the calling thread's
            with comfy.model_management.cuda_device_context(card.device):
                comfy.model_prefetch.cleanup_malloc_graph()

    t0 = time.perf_counter()
    # the main card works in the calling thread, as in ComfyUI's multi-GPU sampling; the other cards in their own
    threads = [threading.Thread(target=spawned, args=(card,), daemon=True) for card in cards[1:]]
    for thread in threads:
        thread.start()
    worker(cards[0])
    for thread in threads:
        thread.join()
    timings[name] = time.perf_counter() - t0
    if errors:
        raise errors[0]


def upscale(cards, upscaler, video, plan, seed, emit, timings=None, transformer_options={}, kernels="fast",
            noise_device="cpu", first_frame=None, stitch_mode="pixels", progress=None):
    """cards: [Card] (the first is the main card: encode, latent upscaler, noise, stitch). video: (T, 3, H, W) uint8 on
    the CPU, 1 + 8k frames. emit receives the output a chunk at a time as uint8 (n, H', W', 3) on the main card.
    timings, a dict, collects seconds per stage (and per card: busy seconds, tiles); transformer_options go to the
    DiT. kernels: "exact" (the reference's arithmetic) or "fast" (float16 attention P V, fused norms, the fast KVAE
    decode). noise_device: where the tiles' noise is drawn, the CPU (the same on every card) or None for the
    reference's CUDA noise on the main card (parity runs). first_frame: the video is a temporal window of a longer
    clip starting at this latent frame (noise per latent frame of the clip). progress: a ComfyUI ProgressBar shared by
    several calls (one step per DiT call and per decoded tile). stitch_mode: "pixels" decodes every tile and blends the frames
    (the reference's structure); "latent" blends the denoised latents and decodes the canvas once (fast kernels on
    CUDA; otherwise it falls back to pixels and says so).

    Every model is loaded from this thread before the stage that uses it (load_models_gpu is not thread-safe; the
    KVAE and upscaler methods only compute): the KVAE for the encode, the upscaler and every card's DiT for the tiles, the KVAEs
    for the decodes."""
    timings = {} if timings is None else timings
    main = cards[0]
    device = main.device
    settings, sr = main.dit.sampler, main.dit.sr
    progress = progress or comfy.utils.ProgressBar(len(plan.tiles) * (settings["nfe"] + 1))

    t0 = time.perf_counter()
    if plan.pre != 1.0:
        video = pre_upscale(video, plan.pre)
    video = pad(video, *plan.padded)
    timings["prepare"] = time.perf_counter() - t0
    t0 = time.perf_counter()
    comfy.model_management.load_models_gpu([main.kvae.patcher], memory_required=main.kvae.encode_memory(video.shape))
    latent = main.kvae.encode_video(video)
    timings["encode"] = time.perf_counter() - t0
    th, tw = plan.tile[0] // STRIDE, plan.tile[1] // STRIDE
    raw = [latent[:, :, top // STRIDE:top // STRIDE + th, left // STRIDE:left // STRIDE + tw] for top, left in plan.tiles]
    # dynamic VRAM streams the next block's weights while one block runs (model_base.py sets the same flag)
    options = dict(transformer_options, prefetch_dynamic_vbars=main.dit.patcher.is_dynamic())
    tokens = (raw[0].shape[0], th * upscaler.scale, tw * upscaler.scale)
    comfy.model_management.load_models_gpu([upscaler.patcher] + [card.dit.patcher for card in cards],
                                           memory_required=upscaler.memory(raw[0].shape) + dit_memory(tokens))
    noise = device if noise_device is None else noise_device
    # every tile's start on the main card, from this thread, before the DiT pass: the upscaler is 0.2-0.3 s of a tile
    # and has one copy, and a worker must only touch its own card's models (dynamic VRAM stages a model's weights from
    # the thread that runs it; a second card's worker running the main card's upscaler failed in its file reads)
    t0 = time.perf_counter()
    starts = []
    for index in range(len(raw)):
        comfy.model_management.throw_exception_if_processing_interrupted()
        start = upscaler.upscale_tile(raw[index], main.kvae.scaling_factor)
        starts.append(degraded_start(start, seed + index, sr["lq_noise_scale"], sr["lq_noise_type"], noise, first_frame))
    timings["upscale"] = time.perf_counter() - t0
    del latent, raw
    denoised = [None] * len(starts)

    def denoise(card, index):
        denoised[index] = sample_piflow(card.dit.patcher.model, starts[index].to(card.device), settings, card.dit.dtype, options,
                                        callback=lambda: progress.update(1), kernels=dit_kernels(kernels, card.device)).cpu()

    run_tiles(cards, len(starts), denoise, timings, "dit")
    del starts

    if stitch_mode == "latent":
        if main.kvae.can_decode_canvas(kernels):
            t0 = time.perf_counter()
            canvas = blend_latents(denoised, plan, device)
            comfy.model_management.load_models_gpu([main.kvae.patcher], memory_required=main.kvae.canvas_memory(canvas.shape, kernels))
            out_h, out_w = plan.out_size
            for frames in main.kvae.decode_canvas(canvas, kernels):
                comfy.model_management.throw_exception_if_processing_interrupted()
                frames = frames[:, :out_h, :out_w]
                for first in range(0, frames.shape[0], CHUNK):
                    emit(frames[first:first + CHUNK].contiguous())
            progress.update(len(denoised))
            timings["decode canvas"] = time.perf_counter() - t0
            return timings
        log.warning("Kandinsky VSR: stitch=latent needs kernels=fast on a CUDA card; stitching the decoded tiles instead")

    shape = denoised[0].shape
    comfy.model_management.load_models_gpu([card.kvae.patcher for card in cards],
                                           memory_required=main.kvae.decode_memory(shape, kernels))
    h, w = plan.tile[0] * plan.tiling, plan.tile[1] * plan.tiling
    tile_bytes = 3 * plan.frames * h * w
    on_card = len(plan.tiles) * tile_bytes < comfy.model_management.get_free_memory(device) - main.kvae.decode_memory(shape, kernels)
    decoded = [None] * len(denoised)

    def decode(card, index):
        tile = card.kvae.decode_tile(denoised[index].to(card.device), kernels=kernels)
        decoded[index] = tile.to(device) if on_card else tile.cpu()
        progress.update(1)

    run_tiles(cards, len(denoised), decode, timings, "decode")
    del denoised

    t0 = time.perf_counter()
    stitch(decoded, plan, device, emit)
    if device.type == "cuda":
        torch.cuda.synchronize(device)
    timings["stitch"] = time.perf_counter() - t0
    timings["decoded tiles on card"] = on_card
    return timings


def blend_latents(denoised, plan, device):
    """The denoised tiles (T', h, w, C) blended into the latent canvas of the padded frame with the Hann windows of
    the pixel stitch at latent resolution, divided by the true summed window."""
    s = plan.tiling
    t, h, w, c = denoised[0].shape
    window = hann(h, w).to(device)[..., None]
    height, width = plan.padded[0] * s // STRIDE, plan.padded[1] * s // STRIDE
    acc = torch.zeros(t, height, width, c, device=device)
    weight = torch.zeros(height, width, 1, device=device)
    for (top, left), tile in zip(plan.tiles, denoised):
        y, x = top * s // STRIDE, left * s // STRIDE
        acc[:, y:y + h, x:x + w] += tile.to(device) * window
        weight[y:y + h, x:x + w] += window
    return acc / weight


def stitch(decoded, plan, device, emit):
    """Hann blend of the decoded tiles (tiling_utils.py:198) a few frames at a time, the same per-pixel arithmetic as
    the reference's whole-clip stitch (tile x window summed in tile order, divided by the summed windows, clamped,
    truncated to uint8; then the padding cropped), except that it divides by the true summed window where the
    reference clamps it at 1e-6 and darkens the frame's corners."""
    s = plan.tiling
    th, tw = decoded[0].shape[-2:]
    window = hann(th, tw).to(device)
    height, width = plan.padded[0] * s, plan.padded[1] * s
    weight = torch.zeros(height, width, device=device)
    for top, left in plan.tiles:
        weight[top * s:top * s + th, left * s:left * s + tw] += window
    out_h, out_w = plan.out_size
    for first in range(0, plan.frames, CHUNK):
        comfy.model_management.throw_exception_if_processing_interrupted()
        last = min(plan.frames, first + CHUNK)
        acc = torch.zeros(3, last - first, height, width, device=device)
        for (top, left), tile in zip(plan.tiles, decoded):
            acc[:, :, top * s:top * s + th, left * s:left * s + tw] += tile[:, first:last].to(device).float() * window
        frames = (acc / weight).clamp(0, 255).to(torch.uint8)[:, :, :out_h, :out_w]
        emit(frames.permute(1, 2, 3, 0).contiguous())


def dit_memory(shape):
    """VRAM one tile's two DiT calls and rollout need beside the weights, for a tile of `shape` (T, H, W, C).
    Measured on an RTX 4090: 2.69 GB at 16,896 tokens, 4.08 at 47,616, 8.50 at
    139,776; 1.8 GB + 51.6 kB per token, rounded up."""
    return 2 * 2**30 + math.prod(shape[:3]) * 53 * 1024
