import importlib
import traceback


NODE_MODULES = [
    ("SimpAIAIOConfigs", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIAIOReference", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIAIOStyleTransfer", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIAIOUOV", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIAIOInpaint", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIAIORegionMask", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIAIOImproveDetail", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIAIORouting", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIPainterAV2V", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIPingPongVideoAudioAlign", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIBerniniLongVideoConditioning", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIMiniMaxH3VideoUpscaleLatent", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIWanVaceLatentLoop", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIH3UpscaleLoop", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIMiniMaxH3MotionContext", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIH3ContinuationOutput", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIMiniMaxH3ReferenceToImage", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAISelectVideoKeyframes", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAISelectTimedPrompt", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIBerniniBestFrameWindow", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIWanAnimateBestFrameWindow", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIOptionalVideoPath", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIOptionalTrimAudioDuration", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAILivePortraitExpression", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIVLMVideoFrames", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIGemma3VLMPrompt", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIQwen3VLVideoPrompt", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIConsoleText", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAILatentDetailSampler", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIAutoProtectedColorMatch", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAILTXVAddGuideAuto", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAILTXVExtent", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIWanAnimateLoop", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
    ("SimpAIWanAnimate2Loop", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"),
]

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
failed_modules = []

for module_name, class_map_name, display_name_map_name in NODE_MODULES:
    try:
        module = importlib.import_module(f"{__name__}.{module_name}")
        NODE_CLASS_MAPPINGS.update(getattr(module, class_map_name, {}))
        NODE_DISPLAY_NAME_MAPPINGS.update(getattr(module, display_name_map_name, {}))
    except Exception as err:
        failed_modules.append({
            "name": module_name,
            "error": str(err),
            "traceback": traceback.format_exc(),
        })

if failed_modules:
    print(f"[SimpAINodes] Found {len(failed_modules)} failed modules:")
    for failed in failed_modules:
        print(f"\n[SimpAINodes] Failed to import module {failed['name']}: {failed['error']}")
        print(f"Detailed error information:\n{failed['traceback']}")

try:
    from .text_embedding_cache import register_text_embedding_cache_provider
    register_text_embedding_cache_provider()
except Exception as err:
    print(f"[SimpAINodes] Failed to enable text embedding cache: {err}")

print(f"[SimpAINodes] Loaded {len(NODE_CLASS_MAPPINGS)} nodes successfully.")

__version__ = "1.0.0"

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "__version__",
]
