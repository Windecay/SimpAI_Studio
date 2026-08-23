import modules.config as config
from modules.comfy_progress_profile import build_progress_profile
from modules.comfy_progress_filter import (
    install_advanced_sampler_known_total_progress_filter,
    install_aio_enhance_uov_progress_filter,
    install_progress_profile_reset_filter,
)
from shared import modelsinfo
from enhanced.simpleai import ComfyTaskParams, comfyclient_pipeline


AIO_UOV_PREVIEW_NODE_CLASS_TYPES = {
    "SimpAIAIOUOVFlux",
    "SimpAIAIOUOVSDXL",
    "SimpAIAIOUOVQwen",
    "SimpAIAIOUOVWan",
    "SimpAIAIOUOVZImage",
    "SimpAIAIOUOVFlux2",
    "SimpAIAIOUOVAnima",
    "SimpAIAIOUOVChenkin",
}


def _register_runtime_preview_nodes():
    node_name = "SimpAIWanAnimateLoop"
    comfyclient_pipeline.PREVIEW_NODE_CLASS_TYPES.add(node_name)
    comfyclient_pipeline.MULTI_PASS_PREVIEW_NODE_CLASS_TYPES.add(node_name)
    comfyclient_pipeline.PREVIEW_NODE_CLASS_TYPES.add("SimpAIWanAnimate2Loop")
    comfyclient_pipeline.MULTI_PASS_PREVIEW_NODE_CLASS_TYPES.add("SimpAIWanAnimate2Loop")
    comfyclient_pipeline.PREVIEW_NODE_CLASS_TYPES.add("SimpAILatentDetailSampler")
    comfyclient_pipeline.MULTI_PASS_PREVIEW_NODE_CLASS_TYPES.add("SimpAILatentDetailSampler")
    comfyclient_pipeline.PREVIEW_NODE_CLASS_TYPES.update({
        "SimpAIAIOEnhanceUOVConfig",
        "SimpAIAIORegionConfig",
        "SimpAIAIOInpaintFlux",
        "SimpAIAIOInpaintFlux2",
        "SimpAIAIOInpaintSDXL",
        "SimpAIAIOInpaintQwen",
        "SimpAIAIOInpaintWan",
        "SimpAIAIOInpaintZImage",
        "SimpAIAIOInpaintAnima",
    })
    # Dynamic UltimateSDUpscale events use the outer AIO node as display_node.
    comfyclient_pipeline.PREVIEW_NODE_CLASS_TYPES.update(AIO_UOV_PREVIEW_NODE_CLASS_TYPES)
    comfyclient_pipeline.PREVIEW_NODE_CLASS_TYPES.add("SimpAIH3UpscaleLoop")
    comfyclient_pipeline.MULTI_PASS_PREVIEW_NODE_CLASS_TYPES.add("SimpAIH3UpscaleLoop")
    comfyclient_pipeline.PREVIEW_NODE_CLASS_TYPES.add("SimpAIWanVaceLatentLoop")
    comfyclient_pipeline.MULTI_PASS_PREVIEW_NODE_CLASS_TYPES.add("SimpAIWanVaceLatentLoop")
    install_aio_enhance_uov_progress_filter(comfyclient_pipeline)
    install_advanced_sampler_known_total_progress_filter(comfyclient_pipeline)
    install_progress_profile_reset_filter(comfyclient_pipeline)


_register_runtime_preview_nodes()


class ComfyTask:

    def __init__(self, name, params, images=None, steps=None, progress_profile=None):
        self.name = name
        self.params = params
        self.images = images
        self.steps = steps
        self.progress_profile = progress_profile


def _is_custom_model_choice(model_name):
    if model_name is None:
        return False
    model_name = str(model_name).strip()
    return model_name != "" and model_name.lower() not in ("auto", "none", "default (model)")


def _model_type_from_name(model_name):
    model_name = str(model_name or "").strip()
    return 2 if model_name.lower().endswith(".gguf") else 1


def get_comfy_task(user_did, task_class, task_name, task_method, default_params, input_images, options=None):
    #print(f'task_class:{task_class}, task_name:{task_name}, task_method:{task_method}')
    total_steps = default_params.pop("display_steps", default_params['steps'])
    progress_profile = build_progress_profile(task_method, default_params, total_steps)
    if progress_profile is not None:
        total_steps = progress_profile.total_steps
    task_method_l = (task_method or "").lower()
    if "infinitetalk" in task_method_l:
        audio = default_params.get("audio")
        if isinstance(audio, str):
            audio = audio.strip()
            if not audio or audio.lower() == "none":
                audio = None
        elif isinstance(audio, dict):
            if not any(audio.get(k) for k in ("path", "name", "data", "url")):
                audio = None
        if not audio:
            raise ValueError("该任务必须传入音频(audio)")
    if "scene_" in task_method_l or task_class in ("Qwen", "Wan", "Z-image"):
        base_model = default_params.get("base_model")
        if base_model and base_model != "auto":
            is_safetensors_model = _model_type_from_name(base_model) == 1
            default_params["i2i_model_type"] = 1 if is_safetensors_model else 2
            if is_safetensors_model:
                default_params.pop("base_model_gguf", None)
            else:
                default_params["base_model_gguf"] = base_model
                default_params.pop("base_model", None)

        refiner_model = default_params.get("base_model2")
        if refiner_model and refiner_model != "auto" and refiner_model != "None":
            is_refiner_safetensors_model = _model_type_from_name(refiner_model) == 1
            default_params["i2i_model_type2"] = 1 if is_refiner_safetensors_model else 2
            if is_refiner_safetensors_model:
                default_params.pop("base_model_gguf2", None)
            else:
                default_params["base_model_gguf2"] = refiner_model
                default_params.pop("base_model2", None)

        clip_model = default_params.get("clip_model")
        if _is_custom_model_choice(clip_model):
            default_params["i2i_clip_type"] = _model_type_from_name(clip_model)
        else:
            default_params.pop("i2i_clip_type", None)
    comfy_params = ComfyTaskParams(default_params, user_did)
    if "scene_" in task_method_l or task_class in ("Qwen", "Wan", "Z-image"):
        comfy_params.update_mapping_rule("sampler", "GeneralInput:GeneralInput:sampler")
        comfy_params.update_mapping_rule("scheduler", "GeneralInput:GeneralInput:scheduler")
        comfy_params.update_mapping_rule("negative_prompt", "SceneInput:SceneInput:negative_prompt")
        comfy_params.update_mapping_rule("sampler", "SceneInput:SceneInput:sampler")
        comfy_params.update_mapping_rule("scheduler", "SceneInput:SceneInput:scheduler")
        comfy_params.update_mapping_rule("video_duration", "SceneInput:SceneInput:video_duration")
        comfy_params.update_mapping_rule("video", "SimpAIOptionalVideoPath:SimpAIOptionalVideoPath:video")
        comfy_params.update_mapping_rule("video", "SimpAIH3UpscaleLoop:H3 Upscale Loop:source_video")
        comfy_params.update_mapping_rule("reference_video", "SimpAIOptionalReferenceVideoPath:SimpAIOptionalReferenceVideoPath:reference_video")
        comfy_params.update_mapping_rule("audio", "SimpAIOptionalAudioPath:SimpAIOptionalAudioPath:audio")
        comfy_params.update_mapping_rule("clip_model", "CLIPLoader_Any:clip_model:clip_name")
        comfy_params.update_mapping_rule("clip_model", "CLIPLoaderGGUF_Any:clip_model:clip_name")
        comfy_params.update_mapping_rule("clip_model2", "CLIPLoader_Any:clip_model2:clip_name")
        comfy_params.update_mapping_rule("clip_model2", "CLIPLoaderGGUF_Any:clip_model2:clip_name")
        if task_class == "LTX":
            comfy_params.update_mapping_rule("vae_model", "VAELoader:vae_model:vae_name")
        if "bernini_video_upscale" in task_method_l:
            comfy_params.update_mapping_rule(
                "base_model",
                "DiffusionModelLoaderKJ:base_model:model_name",
            )
    if task_method == "flux_aio":
        comfy_params.update_mapping_rule("inpaint_model", "UNETLoader:inpaint_model:unet_name")
    if 'base_model_gguf' in default_params:
        comfy_params.delete_params(['base_model'])
    if 'base_model_gguf2' in default_params:
        comfy_params.delete_params(['base_model2'])
    if task_class in ['Flux', 'HyDiT', 'SD3x', 'Wan', 'Qwen','Z-image'] and task_name not in ['Flux', 'HyDiT', 'SD3x', 'Wan', 'Qwen', 'Z-image']:
        task_name = task_class
    if task_name == 'default':
        return ComfyTask(task_method, comfy_params, input_images, total_steps, progress_profile)
    
    elif task_name == 'SD3x':
        return ComfyTask(task_method, comfy_params, steps=total_steps, progress_profile=progress_profile)

    elif task_name in ['HyDiT']:
        if not modelsinfo.exists_model(catalog="checkpoints", model_path=default_params["base_model"]):
            config.downloading_hydit_model()
        return ComfyTask(task_method, comfy_params, steps=total_steps, progress_profile=progress_profile)
    
    elif task_name == 'Flux':
        return ComfyTask(task_method, comfy_params, input_images, total_steps, progress_profile)
    elif task_name == 'SD1.5' and '_aio' in task_method:
        return ComfyTask(task_method, comfy_params, input_images, total_steps, progress_profile)
    else:  # SeamlessTiled
        return ComfyTask(task_method, comfy_params, input_images, total_steps, progress_profile)

def check_task_model():
    #check_model_files_from_download_of_preset_file
    pass
