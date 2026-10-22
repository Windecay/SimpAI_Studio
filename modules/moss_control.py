"""MOSS control dependencies, separate from user-selected LoRAs."""

from modules import flags


TASK_METHOD = "moss_image_sft_aio_cn"
CONTROL_LORA = "moss_image_color_depth_control.safetensors"
CONTROL_MODEL_ENTRY = (
    "loras,moss_image_color_depth_control.safetensors,313063368,"
    "e5c0c3efd05e4269207a39de6005798f14c90c6687c89c54eaffe4b76c43a763,"
    "https://modelscope.cn/models/Comfy-Org/MOSS-Image/resolve/master/loras/moss_image_color_depth_control.safetensors,"
    "https://huggingface.co/Comfy-Org/MOSS-Image/resolve/main/loras/moss_image_color_depth_control.safetensors"
)


def required_model_entries(preset_node):
    runtime = preset_node.get("runtime") or {}
    if runtime.get("task_method") != TASK_METHOD or preset_node.get("classic_mode") != "ip":
        return []
    params = {**(preset_node.get("ip_params") or {}), **(preset_node.get("params") or {})}
    count = max(1, min(4, int(preset_node.get("classic_ip_count") or params.get("ip_count") or params.get("count") or 1)))
    for index in range(count):
        kind = params.get(f"ip_type_{index}", flags.cn_ip)
        if (kind in (flags.cn_cpds, flags.cn_color)
                and float(params.get(f"ip_weight_{index}", 1.0)) != 0
                and float(params.get(f"ip_stop_{index}", 0.5)) > 0):
            return [CONTROL_MODEL_ENTRY]
    return []


def validate_task_controls(task, goals):
    if task.task_method != TASK_METHOD or "cn" not in goals:
        return
    from modules import model_loader
    from modules.localization import localized_text

    def fail(message):
        raise ValueError(localized_text({"__lang": task.simpleai_lang}, message))

    count = 0
    for kind in (flags.cn_cpds, flags.cn_color):
        active = [item for item in task.cn_tasks.get(kind, []) if item[0] is not None and item[1] > 0 and item[2] != 0]
        if len(active) > 1:
            fail("MOSS image control accepts one depth map and one color map. Choose a different type for the second image.")
        count += len(active)
    if count and not model_loader._resolve_model_filepath("loras", CONTROL_LORA):
        fail("The MOSS image control model is missing. Download the missing files in the MOSS-Image package in Model Manager.")
