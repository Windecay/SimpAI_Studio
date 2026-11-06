"""Compare RelayVSR window kernels and probe the regular cross-attention backends."""

import argparse
import json
from importlib.metadata import version
from pathlib import Path
import subprocess
import sys

import comfy_kitchen as kitchen
import torch


ROOT = Path(__file__).resolve().parents[2]


def window_case(name, dtype, query_frames, key_frames, heads, kv_heads, windows, clamp, temporal):
    shape = (1, query_frames, 25, 27, heads, 128 if heads == 24 else 64)
    q = torch.randn(shape, device="cuda", dtype=dtype)
    kv_shape = (1, key_frames, *shape[2:4], kv_heads, shape[-1])
    k = torch.randn(kv_shape, device="cuda", dtype=dtype)
    v = torch.randn_like(k)
    kwargs = dict(windows=windows, clamp=clamp, temporal_window=temporal)
    results = {}
    timings = {}
    selected = {}
    for backend in ("eager", "cuda"):
        with kitchen.use_backend(backend):
            plane_windows = [windows] if isinstance(windows[0], int) else windows
            selected[backend] = kitchen.registry.get_capable_backend("window_attention", kwargs={
                "q": q, "k": k, "v": v, "kh": [window[0] for window in plane_windows],
                "kw": [window[1] for window in plane_windows], "clamp": clamp,
                "temporal_window": temporal if temporal is not None else key_frames, "scale": None,
            })
            assert selected[backend] == backend
            result = kitchen.window_attention(q, k, v, **kwargs)
            torch.cuda.synchronize()
            for _ in range(2):
                kitchen.window_attention(q, k, v, **kwargs)
            start, end = torch.cuda.Event(enable_timing=True), torch.cuda.Event(enable_timing=True)
            start.record()
            for _ in range(3):
                kitchen.window_attention(q, k, v, **kwargs)
            end.record()
            end.synchronize()
            timings[backend] = start.elapsed_time(end) / 3
            results[backend] = result
    torch.testing.assert_close(results["cuda"], results["eager"], atol=0.02, rtol=0.02)
    return {
        "case": name, "dtype": str(dtype), "shape": list(shape),
        "max_abs_error": (results["cuda"].float() - results["eager"].float()).abs().max().item(),
        "milliseconds": timings, "speedup": timings["eager"] / timings["cuda"], "backends": selected,
    }


def cross_attention(backend):
    code = """
import json, sys
sys.path.insert(0, sys.argv.pop(1))
import comfy.options
comfy.options.enable_args_parsing()
import torch
from comfy.ldm.modules.attention import optimized_attention
q = torch.randn(1, 64, 24 * 128, device='cuda', dtype=torch.bfloat16)
k = torch.randn(1, 32, 24 * 128, device='cuda', dtype=torch.bfloat16)
v = torch.randn_like(k)
out = optimized_attention(q, k, v, 24)
torch.cuda.synchronize()
assert out.shape == q.shape and torch.isfinite(out).all()
print('RESULT:' + json.dumps({'passed': True, 'shape': list(out.shape)}))
"""
    flag = {
        "pytorch": "--use-pytorch-cross-attention",
        "sage": "--use-sage-attention",
        "flash": "--use-flash-attention",
        "kitchen": "--use-ck-attention",
    }[backend]
    completed = subprocess.run(
        [sys.executable, "-c", code, str(ROOT / "comfy"), "--disable-comfy-compiler", flag],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60,
    )
    if completed.returncode:
        return {"passed": False, "error": (completed.stderr or completed.stdout)[-2500:]}
    line = next(line for line in completed.stdout.splitlines() if line.startswith("RESULT:"))
    return json.loads(line.removeprefix("RESULT:"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    options = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required for the RelayVSR attention comparison.")
    torch.manual_seed(42)
    report = {"kitchen": version("comfy-kitchen"), "windows": []}
    cases = [
        ("wan_fresh", 2, 2, 24, 24, (22, 40), True, 4),
        ("wan_cached", 1, 4, 24, 24, (22, 40), True, 4),
        ("flash_condition", 1, 1, 8, 2, (48, 48), False, None),
        ("flash_first_frame", 1, 3, 8, 2, [(48, 48), (48, 48), (24, 24)], False, None),
        ("flash_history", 1, 4, 8, 2, [(48, 48), (48, 48), (24, 24), (24, 24)], False, None),
    ]
    for dtype in (torch.float16, torch.bfloat16):
        for case in cases:
            result = window_case(case[0], dtype, *case[1:])
            report["windows"].append(result)
            print(json.dumps(result), flush=True)
    report["cross_attention"] = {backend: cross_attention(backend) for backend in ("pytorch", "sage", "flash", "kitchen")}
    options.output.parent.mkdir(parents=True, exist_ok=True)
    options.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report["cross_attention"], indent=2))


if __name__ == "__main__":
    main()
