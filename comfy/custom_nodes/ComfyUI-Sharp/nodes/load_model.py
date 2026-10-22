"""LoadSharpModel node for ComfyUI-Sharp.

Returns a lightweight config dict (JSON-serializable) so it works across
comfy-env subprocess isolation boundaries. Actual model loading happens
on-demand in _load_sharp_model(), called by inference nodes.
"""

import os
import logging
import inspect

import torch
from huggingface_hub import hf_hub_download

from comfy_api.latest import io

log = logging.getLogger("sharp")


def _comfy_tqdm():
    """tqdm that shows download progress in ComfyUI's UI."""
    try:
        import comfy.utils
        import tqdm as _tqdm_mod
    except ImportError:
        return None
    holder = {"pbar": None, "total": 0, "done": 0}
    class _T(_tqdm_mod.tqdm):
        def __init__(self, *a, **kw):
            super().__init__(*a, **kw)
            if self.total and self.total > 0 and holder["pbar"] is None:
                holder["total"] = self.total
                holder["done"] = 0
                holder["pbar"] = comfy.utils.ProgressBar(self.total)
        def update(self, n=1):
            ret = super().update(n)
            if n and holder["pbar"] and holder["total"] > 0:
                holder["done"] = min(holder["done"] + n, holder["total"])
                holder["pbar"].update_absolute(holder["done"], holder["total"])
            return ret
    return _T


# Try to get ComfyUI models directory
try:
    import folder_paths
    MODELS_DIR = os.path.join(folder_paths.models_dir, "sharp")
    os.makedirs(MODELS_DIR, exist_ok=True)
    folder_paths.add_model_folder_path("sharp", MODELS_DIR)
except ImportError:
    MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", "sharp")

SHARP_REPO_ID = "apple/Sharp"
SHARP_FILENAME = "sharp_2572gikvuh.pt"

# -- Module-level model cache (persists across subprocess calls) ----------

_model_patcher = None   # Single ModelPatcher instance
_model_config = None     # Config dict that built the current patcher

_DTYPE_MAP = {
    "bf16": torch.bfloat16,
    "fp16": torch.float16,
    "fp32": torch.float32,
}


def _dedupe_keep_order(items):
    seen = set()
    out = []
    for item in items:
        if not item:
            continue
        norm = os.path.abspath(item)
        key = os.path.normcase(norm)
        if key in seen:
            continue
        seen.add(key)
        out.append(norm)
    return out


def _candidate_model_dirs():
    dirs = [MODELS_DIR]
    try:
        import folder_paths
        try:
            dirs.extend(folder_paths.get_folder_paths("sharp"))
        except Exception:
            pass
        models_root = getattr(folder_paths, "models_dir", None)
        if models_root:
            dirs.append(os.path.join(models_root, "sharp"))
    except Exception:
        pass

    root = os.path.dirname(os.path.abspath(__file__))
    for _ in range(8):
        root = os.path.dirname(root)
        dirs.append(os.path.join(root, "SimpleModels", "sharp"))
    return _dedupe_keep_order(dirs)


def _existing_sharp_checkpoint():
    for model_dir in _candidate_model_dirs():
        candidate = os.path.join(model_dir, SHARP_FILENAME)
        if os.path.isfile(candidate):
            return candidate
    return None


def _download_sharp_checkpoint():
    os.makedirs(MODELS_DIR, exist_ok=True)
    kwargs = {
        "repo_id": SHARP_REPO_ID,
        "filename": SHARP_FILENAME,
        "local_dir": MODELS_DIR,
    }
    try:
        params = inspect.signature(hf_hub_download).parameters
        tqdm_class = _comfy_tqdm()
        if tqdm_class is not None and "tqdm_class" in params:
            kwargs["tqdm_class"] = tqdm_class
    except Exception:
        pass
    return hf_hub_download(**kwargs)


def _load_sharp_model(config):
    """Load model on first call, reuse on subsequent calls.

    Returns (predictor, device). The model is wrapped in ModelPatcher for
    ComfyUI-native VRAM management and loaded to GPU via load_models_gpu().
    """
    global _model_patcher, _model_config
    import comfy.model_management
    import comfy.model_patcher
    import comfy.ops
    import comfy.utils
    from .sharp import PredictorParams, create_predictor

    if _model_patcher is None or _model_config != config:
        # Config changed or first load — build from scratch
        model_path = config["model_path"]
        dtype = _DTYPE_MAP[config["dtype"]]

        load_device = comfy.model_management.get_torch_device()
        offload_device = comfy.model_management.unet_offload_device()

        # Select optimal operations class (enables fp8, nvfp4, CublasOps, etc.)
        manual_cast_dtype = comfy.model_management.unet_manual_cast(dtype, load_device)
        operations = comfy.ops.pick_operations(dtype, manual_cast_dtype)

        # Load state dict
        log.info(f"Loading checkpoint from {model_path}")
        state_dict = comfy.utils.load_torch_file(model_path)

        # Build model on meta device (zero memory allocation) then load weights
        # directly with assign=True, avoiding 2x RAM peak from CPU construction.
        log.info("Initializing model on meta device...")
        with torch.device("meta"):
            predictor = create_predictor(
                PredictorParams(),
                dtype=dtype,
                device=None,
                operations=operations,
            )

        # Load weights with assign=True — replaces meta Parameters with real tensors
        # without ever allocating the full model on CPU first.
        # strict=False because registered buffers (e.g. normalization stats) may not
        # be in the checkpoint and will be fixed up below.
        predictor.load_state_dict(state_dict, strict=False, assign=True)

        # Fix any leftover meta-device buffers (e.g. register_buffer constants not
        # present in the checkpoint) by materializing them as real zero tensors.
        for name, buf in list(predictor.named_buffers()):
            if buf.device.type == "meta":
                parts = name.split(".")
                parent = predictor
                for p in parts[:-1]:
                    parent = getattr(parent, p)
                parent._buffers[parts[-1]] = torch.zeros_like(buf, device="cpu")
        predictor.eval()
        if comfy.model_management.force_channels_last():
            predictor.to(memory_format=torch.channels_last)
        comfy.model_management.archive_model_dtypes(predictor)
        log.info(f"Model ready ({dtype})")

        # Wrap with ModelPatcher — ComfyUI manages VRAM from here
        patcher = comfy.model_patcher.ModelPatcher(
            predictor,
            load_device=load_device,
            offload_device=offload_device,
        )
        _model_patcher = patcher
        _model_config = config

    return _model_patcher


# -- Node -----------------------------------------------------------------

class LoadSharpModel(io.ComfyNode):
    """Download the SHARP checkpoint and return a config for inference nodes.

    Returns a lightweight config dict (model path + dtype) that is
    JSON-serializable for comfy-env IPC. The actual model is loaded
    on-demand by inference nodes via _load_sharp_model().
    """

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="LoadSharpModel",
            display_name="(Down)Load SHARP Model",
            category="SHARP",
            description="Download/configure the SHARP model for monocular 3D Gaussian Splatting prediction.",
            inputs=[
                io.Combo.Input("precision", options=["auto", "bf16", "fp16", "fp32"],
                               default="auto", optional=True,
                               tooltip="Model precision. auto: best for your GPU (bf16 on Ampere+, fp16 on Volta/Turing, fp32 on older)."),
            ],
            outputs=[
                io.Custom("SHARP_MODEL_CONFIG").Output(display_name="model_config"),
            ],
        )

    @classmethod
    def execute(cls, precision: str = "auto", *, allow_download: bool = True, model_path=None):
        """Download checkpoint and return config dict."""
        checkpoint = os.path.abspath(model_path) if model_path else _existing_sharp_checkpoint()
        if not checkpoint or not os.path.isfile(checkpoint):
            if not allow_download:
                raise FileNotFoundError("SHARP checkpoint is missing. Install it through model management before building.")
            checkpoint = _download_sharp_checkpoint()
        import comfy.model_management

        load_device = comfy.model_management.get_torch_device()

        # Resolve dtype
        if precision == "auto":
            if comfy.model_management.should_use_bf16(load_device):
                dtype = torch.bfloat16
            elif comfy.model_management.should_use_fp16(load_device):
                dtype = torch.float16
            else:
                dtype = torch.float32
        else:
            dtype = _DTYPE_MAP[precision]

        dtype_str = {torch.bfloat16: "bf16", torch.float16: "fp16", torch.float32: "fp32"}[dtype]

        model_path = checkpoint

        log.info(f"SHARP config: precision={precision} -> dtype={dtype_str}, path={model_path}")

        config = {
            "model_path": model_path,
            "precision": precision,
            "dtype": dtype_str,
        }
        return io.NodeOutput(config)


NODE_CLASS_MAPPINGS = {
    "LoadSharpModel": LoadSharpModel,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LoadSharpModel": "(Down)Load SHARP Model",
}
