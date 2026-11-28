"""Start latent and pi-Flow DX sampling of one tile, as the reference computes them.

degraded_start: core/algo/utils.py:402 (_build_initial_latent, instruct_type "noise") with train_utils.py:51.
sample_piflow: core/algo/piflow_sampler.py:310 (piflow_generate) with piflow_math.py (DXPolicy, policy_rollout_fm),
op for op in the same dtypes, so the rollout is bit-exact given the same DiT outputs. The schedule scalars go
through float32 tensors where the reference does.
"""
import torch

import comfy.model_management


def degraded_start(lq_latent, seed, noise_scale, noise_type, noise_device="cpu", first_frame=None):
    """lq_latent: scaled, upscaled latent (T, H, W, C) float32. The noise has the latent's channels-last shape and is
    moved to the latent's card. One draw per tile from a generator seeded with the tile's seed on noise_device: the
    CPU by default, so one seed gives one result on any card; None draws on the latent's own device, the reference's
    CUDA noise, for parity runs (another card model draws other noise). first_frame: the latent is a temporal window
    starting at this latent frame of a longer clip; each frame then gets its own generator, seeded from the tile's
    seed and the frame's index in the clip, so two windows give the frames they share the same noise."""
    device = lq_latent.device if noise_device is None else torch.device(noise_device)
    if first_frame is None:
        generator = torch.Generator(device=device).manual_seed(seed)
        eps = torch.randn(lq_latent.shape, device=device, dtype=lq_latent.dtype, generator=generator)
    else:
        eps = torch.stack([torch.randn(lq_latent.shape[1:], device=device, dtype=lq_latent.dtype,
                                       generator=torch.Generator(device=device).manual_seed((seed * 1_000_003 + frame) % 2**63))
                           for frame in range(first_frame, first_frame + lq_latent.shape[0])])
    eps = eps.to(lq_latent.device)
    if noise_type == "ddpm":
        return (1 - noise_scale**2) ** 0.5 * lq_latent + noise_scale * eps
    return (1 - noise_scale) * lq_latent + noise_scale * eps


def shift_timesteps(t, shift):
    return shift * t / (1 + (shift - 1) * t)


def schedule(nfe, final_step_size_scale, shift, eps, device):
    """(timestep, sigma, raw_src, raw_dst, segment) per DiT call (piflow_sampler.py:362-385)."""
    final_step_size_scale = max(float(final_step_size_scale), eps)
    one_minus_final = 1.0 - final_step_size_scale
    base_seg = 1.0 / (float(nfe) - one_minus_final)
    steps = []
    for step_index in range(nfe):
        idx = nfe - step_index
        raw_src = min(max((idx - one_minus_final) * base_seg, eps), 1.0)
        seg = final_step_size_scale * base_seg if idx == 1 else base_seg
        raw_dst = max(raw_src - seg, 0.0)
        sigma = shift_timesteps(torch.tensor(raw_src, device=device), shift).item()
        steps.append((sigma * 1000.0, sigma, raw_src, raw_dst, seg))
    return steps


def _unwarp(sigma, shift):
    return sigma / (shift + (1 - shift) * sigma)


def rollout(x, velocity, sigma, raw_src, raw_dst, seg, substeps, shift, eps):
    """Integrate the DX policy over one segment. x: (T, H, W, C) float32; velocity: (T, G, H, W, C), the DiT's grid
    of G velocities; every frame shares the scalars, which the reference broadcasts per frame."""
    full = lambda value: torch.full((x.shape[0],), value, device=x.device)  # noqa: E731
    view = lambda v: v.reshape(-1, *((x.dim() - 1) * [1]))  # noqa: E731
    sigma_src = view(full(sigma))
    raw_t_src = _unwarp(sigma_src, shift)
    raw_t_dst = (raw_t_src - view(full(seg))).clamp(min=0)
    segment = (raw_t_src - raw_t_dst).clamp(min=eps)
    x0_grid = x.unsqueeze(1) - sigma_src.unsqueeze(1) * velocity
    n = x0_grid.shape[1]

    raw_t, raw_t_end = view(full(raw_src)), view(full(raw_dst))
    delta = raw_t - raw_t_end
    num = (delta * substeps).round().to(torch.long).clamp(min=1)
    size = delta / num
    sigma_t, x_t = sigma_src, x
    for _ in range(int(num.max().item())):
        t = ((_unwarp(sigma_t, shift) - raw_t_dst) / segment).clamp(min=0, max=1) * (n - 1)
        t0 = t.floor().to(torch.long).clamp(min=0, max=n - 2)
        t1 = t0 + 1
        pair = torch.gather(x0_grid, 1, torch.stack([t0, t1], dim=1).expand(-1, -1, *x0_grid.shape[2:]))
        x_0 = (t1 - t) * pair[:, 0] + (t - t0) * pair[:, 1]
        u = (x_t - x_0) / sigma_t.clamp(min=eps)
        raw_t = (raw_t - size).clamp(min=0)
        sigma_next = shift_timesteps(raw_t, shift)
        x_t = x_t + u * (sigma_next - sigma_t)
        sigma_t = sigma_next
    return x_t


def sample_piflow(dit, start, settings, dtype, transformer_options={}, callback=None, kernels=None):
    """start: (T, H, W, C) float32 degraded latent of one tile. Returns the denoised latent (T, H, W, C) float32.

    The DiT input is [latent | zero conditioning | zero mask] (instruct type "noise"), in the compute dtype: the
    reference casts it there at the input projection under autocast."""
    channels = start.shape[-1]
    x = start
    for timestep, sigma, raw_src, raw_dst, seg in schedule(settings["nfe"], settings["final_step_size_scale"],
                                                          settings["shift"], settings["eps"], start.device):
        comfy.model_management.throw_exception_if_processing_interrupted()
        model_input = torch.cat([x, torch.zeros(*x.shape[:-1], channels + 1, device=x.device, dtype=x.dtype)], dim=-1)
        t = torch.full((1,), timestep, device=x.device, dtype=torch.float32)
        velocity = dit(model_input.to(dtype)[None], t, kernels, transformer_options=transformer_options)[0]
        velocity = velocity.unflatten(-1, (-1, channels)).movedim(-2, 1)
        x = rollout(x, velocity, sigma, raw_src, raw_dst, seg, settings["num_policy_substeps"], settings["shift"], settings["eps"])
        if callback is not None:
            callback()
    return x
