# MOSS-Image for ComfyUI

Native MOSS-Image loaders that output standard MODEL, CLIP and VAE objects.
Use ComfyUI's sampling, guidance and memory management nodes.

See the [installation and usage guide](https://github.com/OpenMOSS/MOSS-Image/blob/main/comfyui/README.md).

The example workflow is in `example_workflows/moss-image.json`. Model weights
are downloaded separately from [MOSS-Image-Base](https://huggingface.co/OpenMOSS-Team/MOSS-Image-Base).
Set the HF Loader's `model_path` to the local directory containing
`transformer/`, `text_encoder/`, `tokenizer/` and `vae/`.
