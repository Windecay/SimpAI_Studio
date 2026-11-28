import logging

import torch

from comfy import model_management


log = logging.getLogger("KandinskySR")


def dit_dtype(device):
    supported = [torch.float32]
    # Exclude emulated BF16: it cannot be passed to native CUDA attention kernels.
    if model_management.should_use_bf16(device):
        supported.insert(0, torch.bfloat16)
    if model_management.should_use_fp16(device):
        supported.insert(0 if model_management.args.force_fp16 else len(supported) - 1, torch.float16)
    # Keep BF16 as the reference default even with the generic FP16 accumulation optimization enabled.
    preferred = supported[:1] if supported[0] == torch.float32 else (supported[0], torch.float32)
    dtype = model_management.unet_dtype(device, supported_dtypes=preferred)
    if dtype not in supported:
        log.warning("Kandinsky SR: DiT compute dtype %s is not supported on %s; using %s.", dtype, device, supported[0])
        return supported[0]
    return dtype
