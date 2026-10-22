"""MOSS vision prompting, adapted from ThetaCursed/ComfyUI-MOSSImageTextEncoder.

MIT License

Copyright (c) 2026 ThetaCursed

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""

import math

import comfy.utils


VISION_BLOCK = "<|vision_start|><|image_pad|><|vision_end|>"


class TextEncodeMOSSImageVision:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"clip": ("CLIP",), "prompt": ("STRING", {"multiline": True})},
            "optional": {
                "negative_prompt": ("STRING", {"default": "", "multiline": True}),
                **{name: ("IMAGE",) for name in ("image", "image_2", "image_3", "image_4")},
                "image_weight": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0}),
                "vision_megapixels": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 8.0}),
                "system_prompt": ("STRING", {"default": "", "multiline": True}),
            },
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "encode"
    CATEGORY = "SimpAI/MOSS"

    @staticmethod
    def _build_prompt(system, text, labels):
        refs = "".join(f"Reference image {label}: {VISION_BLOCK}\n" for label in labels)
        prefix = f"<|im_start|>system\n{system.strip()}<|im_end|>\n" if system.strip() else ""
        return prefix + f"<|im_start|>user\n{refs}{text}<|im_end|>\n<|im_start|>assistant\n<think>\n"

    @staticmethod
    def _prepare_references(image, vision_megapixels=1.0, image_weight=1.0):
        if image is None or image.numel() == 0:
            return []
        if image.dim() == 3:
            image = image.unsqueeze(0)
        result = []
        max_pixels = int(vision_megapixels * 1024 * 1024)
        for sample in image:
            sample = sample.unsqueeze(0)
            height, width = sample.shape[1:3]
            scale = min(1.0, math.sqrt(max_pixels / (height * width)))
            resized = comfy.utils.common_upscale(
                sample.movedim(-1, 1), max(1, round(width * scale)),
                max(1, round(height * scale)), "area", "disabled",
            ).movedim(1, -1)
            rgb = resized[..., :3]
            if resized.shape[-1] > 3:
                alpha = resized[..., 3:4]
                rgb = rgb * alpha + (1.0 - alpha)
            # Upstream weight controls pixel contrast before vision encoding.
            if image_weight != 1.0:
                rgb = (0.5 + image_weight * (rgb - 0.5)).clamp(0.0, 1.0)
            result.append(rgb)
        return result

    def encode_images(self, clip, prompt, negative_prompt, images, labels, system_prompt=""):
        def encode(text):
            try:
                return clip.encode_from_tokens_scheduled(
                    clip.tokenize(self._build_prompt(system_prompt, text, labels), images=images),
                )
            except NotImplementedError as error:
                if images and "Float8" in str(error):
                    raise RuntimeError(
                        "MOSS image references need a vision-capable Qwen3.5 encoder in "
                        "BF16, FP16 or INT8; the FP8 vision path is unsupported."
                    ) from error
                raise

        return encode(prompt), encode(negative_prompt)

    def encode(self, clip, prompt, negative_prompt="", image=None, image_weight=1.0,
               vision_megapixels=1.0, system_prompt="", image_2=None, image_3=None, image_4=None):
        images, labels = [], []
        for slot, value in enumerate((image, image_2, image_3, image_4), 1):
            prepared = self._prepare_references(value, vision_megapixels, image_weight) if image_weight > 0 else []
            images.extend(prepared)
            labels.extend([str(slot) if len(prepared) == 1 else f"{slot}.{i + 1}"
                           for i in range(len(prepared))])
        return self.encode_images(clip, prompt, negative_prompt, images, labels, system_prompt)


class SimpAIMossVisionConditioning:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "clip": ("CLIP",), "prompt": ("STRING", {"multiline": True}),
            "negative_prompt": ("STRING", {"multiline": True}),
            "positive": ("CONDITIONING",), "negative": ("CONDITIONING",),
            **{f"reference_{index}": ("SIMPAI_AIO_REFERENCE_CONFIG",) for index in range(1, 5)},
        }}

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING")
    FUNCTION = "encode"
    CATEGORY = "SimpAI/MOSS"

    def encode(self, clip, prompt, negative_prompt, positive, negative, **references):
        active = [(slot, references[f"reference_{slot}"]) for slot in range(1, 5)
                  if references[f"reference_{slot}"]["mode"] == 1
                  and references[f"reference_{slot}"]["weight"] > 0
                  and references[f"reference_{slot}"]["stop_percent"] > 0]
        if not active:
            return positive, negative
        encoder = TextEncodeMOSSImageVision()
        prepared = {
            slot: encoder._prepare_references(ref["image"], image_weight=ref["weight"])
            for slot, ref in active
        }
        result = [[], []]
        start = 0.0
        for end in sorted({min(1.0, ref["stop_percent"]) for _, ref in active}):
            current = [(slot, ref) for slot, ref in active if ref["stop_percent"] >= end]
            images = [image for slot, _ in current for image in prepared[slot]]
            labels = [str(slot) if len(prepared[slot]) == 1 else f"{slot}.{i + 1}"
                      for slot, _ in current for i in range(len(prepared[slot]))]
            conditioned = encoder.encode_images(clip, prompt, negative_prompt, images, labels)
            for index, conditioning in enumerate(conditioned):
                for embedding, values in conditioning:
                    left = max(start, values.get("start_percent", 0.0))
                    right = min(end, values.get("end_percent", 1.0))
                    if left < right:
                        result[index].append([embedding, {
                            **values, "start_percent": left if start == 0 else left + 1e-5,
                            "end_percent": right,
                        }])
            start = end
        if start < 1.0:
            for index, conditioning in enumerate((positive, negative)):
                for embedding, values in conditioning:
                    left = max(start + 1e-5, values.get("start_percent", 0.0))
                    right = values.get("end_percent", 1.0)
                    if left < right:
                        result[index].append([embedding, {**values, "start_percent": left, "end_percent": right}])
        return tuple(result)


NODE_CLASS_MAPPINGS = {
    "TextEncodeMOSSImageVision": TextEncodeMOSSImageVision,
    "SimpAIMossVisionConditioning": SimpAIMossVisionConditioning,
}
NODE_DISPLAY_NAME_MAPPINGS = {"TextEncodeMOSSImageVision": "Text Encode (MOSS-Image Vision)"}
