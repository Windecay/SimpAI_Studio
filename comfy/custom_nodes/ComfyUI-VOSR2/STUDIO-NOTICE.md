# VOSR2 Studio Integration

Vendored from https://github.com/ylchen333/ComfyUI-VOSR2, version 0.4.2,
commit `6a21810b3f4f1a0ffc477c55330db0ac03c671f0`.
The upstream Apache-2.0 license is retained in `LICENSE`.
The model architectures, color alignment, and one-step algorithm are upstream code.

Studio changes, 2026-10-03:

- Model loading is offline. Studio's preset model list manages downloads.
- Convert the locally installed official DINOv2 `.pth` with safe loading once;
  retain the original file for model-installation checks.
- Enable DiT/VAE tiling by default and check cancellation inside tile loops.
- Process batches one item at a time before resizing, not only during denoising.
- Allow an optional image dependency on the loader to reject missing or malformed
  Studio input before loading weights.
- Use replicate padding when an image is too narrow for reflect padding.
- No additional pip dependency is required beyond Studio's torch, einops,
  safetensors, and Comfy backend.

Model weights are not bundled with this source. Model revision:
`CSWRY/VOSR@f24b3061b7f350b81e1907bdcfc27f71fb4ff3f3`.
Each upstream component's model terms must be reviewed before redistributing
weights. This integration does not grant additional model rights.
