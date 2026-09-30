import json
import math

import folder_paths
from nodes import LoraLoader


class SimpAILoraStack:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "stack_json": ("STRING", {"default": '{"version":1,"items":[]}', "multiline": True}),
                "branch": (["main", "high", "low"], {"default": "main"}),
            },
            "optional": {"clip": ("CLIP",)},
        }

    RETURN_TYPES = ("MODEL", "CLIP")
    RETURN_NAMES = ("model", "clip")
    FUNCTION = "load_stack"
    CATEGORY = "SimpAI/LoRA"

    def load_stack(self, model, stack_json, branch="main", clip=None):
        payload = json.loads(stack_json)
        if not isinstance(payload, dict) or payload.get("version") != 1 or not isinstance(payload.get("items"), list):
            raise ValueError("Invalid LoRA stack / LoRA 堆格式错误")
        if branch not in ("main", "high", "low"):
            raise ValueError("Invalid LoRA branch / LoRA 分支无效")
        selected = []
        for item in payload["items"]:
            if not isinstance(item, dict):
                raise ValueError("Invalid LoRA item / LoRA 条目格式错误")
            if not isinstance(item.get("enabled", True), bool):
                raise ValueError("Invalid enabled state / 启用状态无效")
            if not item.get("enabled", True) or item.get("target", branch) != branch:
                continue
            strength_model = float(item.get("strength_model", 1.0))
            strength_clip = float(item.get("strength_clip", 0.0))
            if not math.isfinite(strength_model) or not math.isfinite(strength_clip):
                raise ValueError("Invalid LoRA weight / LoRA 权重无效")
            if strength_model == 0 and strength_clip == 0:
                continue
            if strength_clip != 0 and clip is None:
                raise ValueError("CLIP is not connected / 未连接 CLIP")
            name = str(item.get("model", "")).replace("\\", "/")
            if not name or name.startswith("/") or ":" in name or ".." in name.split("/"):
                raise ValueError("Invalid relative LoRA path / LoRA 相对路径无效")
            folder_paths.get_full_path_or_raise("loras", name)
            selected.append((name, strength_model, strength_clip))
        if not selected:
            return model, clip
        loader = LoraLoader()
        for name, strength_model, strength_clip in selected:
            model, clip = loader.load_lora(model, clip, name, strength_model, strength_clip)
        return model, clip


NODE_CLASS_MAPPINGS = {"SimpAILoraStack": SimpAILoraStack}
NODE_DISPLAY_NAME_MAPPINGS = {"SimpAILoraStack": "SimpAI LoRA Stack / LoRA 堆"}
