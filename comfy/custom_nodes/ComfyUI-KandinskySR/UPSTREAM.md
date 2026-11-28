# Upstream

Inference sources and license notices are from
[ComfyUI-KandinskySR](https://github.com/PedroMarinhoDev/ComfyUI-KandinskySR/tree/a5ab693585df5d53686057f3edf5aae8bcbe66a1)
at `a5ab693585df5d53686057f3edf5aae8bcbe66a1`. No model weights, samples, or
conversion utilities are included here. See `LICENSE`, `LICENSE-MIT`, and
`NOTICE` for the original attributions and weight sources.

Studio adds a 2x-only loading path, frame-rate preservation, a duration limit,
video previews, and a file-backed MP4 output node that retains the source audio
tracks. It also fixes repeated frames when a short temporal window overlaps both
neighbors. Image and video reject non-finite output before encoding. The image
output uses lossless WebP transport, or PNG beyond WebP's dimension limit.
Both DiT loaders follow Comfy's device precision for their compute dtype, and
video sampling uses the dtype of the loaded DiT on each card.
