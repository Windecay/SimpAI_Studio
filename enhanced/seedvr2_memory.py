"""Task-local VRAM planning for the installed SeedVR2 inference core."""

from __future__ import annotations

import gc
from dataclasses import dataclass
from typing import Any


GIB = 1024**3


def _tensors(model):
    seen = set()
    for tensor in (*model.parameters(), *model.buffers()):
        if id(tensor) not in seen:
            seen.add(id(tensor))
            yield tensor


def _bytes(model, *, cuda_only=False):
    return sum(
        tensor.numel() * tensor.element_size()
        for tensor in _tensors(model)
        if not cuda_only or tensor.device.type == "cuda"
    )


@dataclass(frozen=True)
class DiTMemory:
    blocks: tuple[int, ...]
    other: int
    largest_io: int

    @property
    def total(self):
        return sum(self.blocks) + self.other

    def peak_weights(self, swapped, swap_io=False):
        # One offloaded block/component must still fit while its forward executes.
        block_peak = sum(self.blocks[swapped:]) + max(self.blocks[:swapped], default=0)
        return block_peak + (self.largest_io if swap_io else self.other)


def inspect_dit(model) -> DiTMemory:
    model = getattr(model, "dit_model", model)
    blocks = tuple(_bytes(block) for block in getattr(model, "blocks", ()))
    other = max(0, _bytes(model) - sum(blocks))
    io_sizes = [_bytes(module) for name, module in model.named_children() if name != "blocks"]
    return DiTMemory(blocks, other, max(io_sizes, default=other))


@dataclass(frozen=True)
class MemoryPlan:
    blocks_to_swap: int
    swap_io_components: bool
    keep_resident: bool


def workspace_bytes(height, width, frames):
    """Conservative estimates, not a guarantee about activation peaks."""
    pixels = max(1, height) * max(1, width)
    latent_frames = 1 + (max(1, frames) - 1 + 3) // 4
    dit = 2 * GIB + latent_frames * pixels * 512
    vae = 2 * GIB + max(1, frames) * pixels * 256
    return dit, vae


def choose_plan(dit: DiTMemory, vae_bytes, budget, dit_workspace, vae_workspace, *, force_offload=False):
    count = len(dit.blocks)
    if force_offload:
        return MemoryPlan(count, bool(dit.other), False)
    if dit.total + vae_bytes + max(dit_workspace, vae_workspace) <= budget:
        return MemoryPlan(0, False, True)
    for swapped in range(count + 1):
        if dit.peak_weights(swapped) + dit_workspace <= budget:
            return MemoryPlan(swapped, False, False)
    return MemoryPlan(count, bool(dit.other), False)


def choose_temporal_window(dit, vae_bytes, budget, height, width, requested):
    minimum_weights = dit.peak_weights(len(dit.blocks), swap_io=True)
    for frames in range(requested, 4, -4):
        dit_workspace, vae_workspace = workspace_bytes(height, width, frames)
        if minimum_weights + dit_workspace <= budget and vae_bytes + vae_workspace <= budget:
            return frames
    return 5


def smaller_temporal_window(frames):
    return max(5, 1 + 4 * ((frames - 1) // 8))


def available_vram(torch, device, models):
    free, total = torch.cuda.mem_get_info(device)
    unused_cache = max(0, torch.cuda.memory_reserved(device) - torch.cuda.memory_allocated(device))
    resident = sum(_bytes(model, cuda_only=True) for model in models if model is not None)
    headroom = max(GIB, int(total * 0.10))
    return max(0, free + unused_cache + resident - headroom)


class SeedVR2MemoryPolicy:
    def __init__(self, runner, core: dict[str, Any], debug, device, frames):
        import torch

        self.torch = torch
        self.runner, self.core, self.debug = runner, core, debug
        self.device = torch.device(device)
        self.frames = frames
        self.plan = None
        self.force_offload = False
        self.history = []

    def select_window(self, info):
        runner = self.runner
        budget = available_vram(self.torch, self.device, (runner.dit, runner.vae))
        self.frames = choose_temporal_window(
            inspect_dit(runner.dit), _bytes(runner.vae), budget,
            info["padded_h"], info["padded_w"], self.frames,
        )
        return self.frames

    @property
    def fully_offloaded(self):
        dit = inspect_dit(self.runner.dit)
        return self.plan is not None and (
            self.plan.blocks_to_swap == len(dit.blocks)
            and (self.plan.swap_io_components or not dit.other)
        )

    def _offload(self, role):
        model = getattr(self.runner, role, None)
        if model is not None and any(tensor.device.type == "cuda" for tensor in _tensors(model)):
            self.core["memory"].manage_model_device(
                model=model, target_device=self.torch.device("cpu"),
                model_name="DiT" if role == "dit" else "VAE", debug=self.debug, runner=self.runner,
            )
            # A failed .to() can leave mixed devices while the first parameter is on CPU.
            if any(tensor.device.type == "cuda" for tensor in _tensors(model)):
                model.to(self.torch.device("cpu"))

    def _configure_blocks(self, plan):
        config = self.runner._dit_block_swap_config
        requested = (
            {
                "blocks_to_swap": plan.blocks_to_swap,
                "swap_io_components": plan.swap_io_components,
                "offload_device": self.torch.device("cpu"),
            }
            if plan.blocks_to_swap or plan.swap_io_components else None
        )
        if config == requested:
            return
        self._offload("dit")
        model = getattr(self.runner.dit, "dit_model", self.runner.dit)
        if hasattr(model, "_block_swap_config"):
            self.core["blockswap"].cleanup_blockswap(self.runner, keep_state_for_cache=False)
            delattr(model, "_block_swap_config")
        self.runner._dit_block_swap_config = requested
        self.runner._dit_config_needs_application = bool(requested)

    def begin_window(self, info, ctx):
        runner = self.runner
        dit = inspect_dit(runner.dit)
        vae_bytes = _bytes(runner.vae)
        budget = available_vram(self.torch, self.device, (runner.dit, runner.vae))
        dit_workspace, vae_workspace = workspace_bytes(info["padded_h"], info["padded_w"], self.frames)
        plan = choose_plan(
            dit, vae_bytes, budget, dit_workspace, vae_workspace, force_offload=self.force_offload,
        )
        self._configure_blocks(plan)
        target = self.device if plan.keep_resident else self.torch.device("cpu")
        runner._dit_offload_device = target
        runner._vae_offload_device = target
        ctx["dit_offload_device"] = target
        ctx["vae_offload_device"] = target
        if not plan.keep_resident:
            self._offload("dit")
            self._offload("vae")
        entry = {
            "budget_gib": round(budget / GIB, 3),
            "batch_size": self.frames,
            "dit_weights_gib": round(dit.total / GIB, 3),
            "vae_weights_gib": round(vae_bytes / GIB, 3),
            "dit_workspace_gib": round(dit_workspace / GIB, 3),
            "vae_workspace_gib": round(vae_workspace / GIB, 3),
            "blocks_to_swap": plan.blocks_to_swap,
            "total_blocks": len(dit.blocks),
            "swap_io_components": plan.swap_io_components,
            "keep_resident": plan.keep_resident,
            "oom_recovery": self.force_offload,
        }
        self.history.append(entry)
        del self.history[:-64]
        if plan != self.plan:
            self.debug.log(
                f"VRAM policy: budget={entry['budget_gib']:.2f} GiB, "
                f"DiT={entry['dit_weights_gib']:.2f} GiB, VAE={entry['vae_weights_gib']:.2f} GiB, "
                f"BlockSwap={plan.blocks_to_swap}/{len(dit.blocks)}, "
                f"I/O swap={plan.swap_io_components}, resident={plan.keep_resident}",
                category="memory", force=True,
            )
        self.plan = plan
        return plan

    def recover_from_oom(self):
        self.force_offload = True
        self.offload()
        gc.collect()
        self.torch.cuda.empty_cache()

    def offload(self):
        self.runner._dit_offload_device = self.torch.device("cpu")
        self.runner._vae_offload_device = self.torch.device("cpu")
        self._offload("dit")
        self._offload("vae")
