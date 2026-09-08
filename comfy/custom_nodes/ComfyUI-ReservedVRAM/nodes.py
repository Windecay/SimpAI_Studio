from typing import Any as any_type
from comfy import model_management
import random
import time
import gc
# 尝试导入 pynvml；在部分 AMD/Intel 环境里，导入阶段本身就可能因为缺少 NVML DLL 直接抛异常。
try:
    import pynvml
except Exception as e:
    pynvml_installed = False
    pynvml = None
    print("[ReservedVRAM]警告：pynvml不可用，auto选项将不可用。")
    print(f"[ReservedVRAM]pynvml导入失败: {e}")
else:
    try:
        pynvml.nvmlInit()
        pynvml_installed = True
    except Exception as e:
        pynvml_installed = False
        pynvml = None
        print("[ReservedVRAM]警告：pynvml可导入但NVML初始化失败，auto选项将不可用。")
        print(f"[ReservedVRAM]NVML初始化失败: {e}")

# 初始化随机状态
initial_random_state = random.getstate()
random.seed(time.time())
reserved_vram_random_state = random.getstate()
random.setstate(initial_random_state)

def get_gpu_memory_info():
    """获取GPU显存信息"""
    if pynvml_installed and pynvml is not None:
        try:
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            memory_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
            total = memory_info.total / (1024 * 1024 * 1024)
            used = memory_info.used / (1024 * 1024 * 1024)
            return total, used
        except Exception as e:
            print(f"[ReservedVRAM]获取GPU信息出错(NVML): {e}")

    try:
        import torch

        if (
            hasattr(torch, "cuda")
            and torch.cuda.is_available()
            and hasattr(torch.cuda, "mem_get_info")
        ):
            free, total = torch.cuda.mem_get_info()
            total_gb = total / (1024 * 1024 * 1024)
            used_gb = (total - free) / (1024 * 1024 * 1024)
            return total_gb, used_gb
    except Exception as e:
        print(f"[ReservedVRAM]获取GPU信息出错(torch): {e}")

    return None, None

def set_reserved_vram(reserved_gb):
    reserved_gb = max(0.0, float(reserved_gb))
    reserved_vram = int(reserved_gb * 1024 * 1024 * 1024)
    if hasattr(model_management, "set_extra_reserved_vram"):
        model_management.set_extra_reserved_vram(reserved_gb)
        reserved_vram = model_management.EXTRA_RESERVED_VRAM
    else:
        model_management.EXTRA_RESERVED_VRAM = reserved_vram
    sync_dynamic_vram_headroom(reserved_vram)

def sync_dynamic_vram_headroom(reserved_vram):
    try:
        import comfy.memory_management as memory_management

        if not getattr(memory_management, "aimdo_enabled", False):
            return

        import comfy_aimdo.control as aimdo_control

        if getattr(aimdo_control, "lib", None) is None:
            return

        # Re-running init() can reset unrelated settings such as NVML pressure.
        setter = getattr(aimdo_control.lib, "set_simple_vram_headroom", None)
        if setter is not None:
            setter(int(reserved_vram))
    except Exception as e:
        print(f"[ReservedVRAM]同步DynamicVRAM预留显存失败: {e}")

def new_random_seed():
    """生成一个新的随机种子"""
    global reserved_vram_random_state
    prev_random_state = random.getstate()
    random.setstate(reserved_vram_random_state)
    seed = random.randint(1, 1125899906842624)
    reserved_vram_random_state = random.getstate()
    random.setstate(prev_random_state)
    return seed

class AlwaysEqualProxy(str):
    def __eq__(self, _):
        return True

    def __ne__(self, _):
        return False
any_type = AlwaysEqualProxy("*")

_legacy_auto_warning_shown = False

class ReservedVRAMSetter:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "reserved": ("FLOAT", {
                    "default": 0.6,
                    "min": -2.0,
                    "step": 0.1,
                    "display": "reserved (GB)"
                }),
                "mode": (["manual", "auto"], {
                    "default": "manual",
                    "display": "Mode"
                }),
                "seed": ("INT", {
                    "default": 0,
                    "min": -1,
                    "max": 1125899906842624
                }),
                "auto_max_reserved": ("FLOAT", {
                    "default": 0.0,
                    "min": 0.0,
                    "step": 0.1,
                    "display": "Auto Max Reserved (GB, 0=no limit)"
                }),
                "clean_gpu_before": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "anything": (any_type, {})
            },
            "hidden": {"unique_id": "UNIQUE_ID", "extra_pnginfo": "EXTRA_PNGINFO"}
        }


    RETURN_TYPES = (any_type, "INT", "FLOAT")
    RETURN_NAMES = ("output", "SEED", "Reserved(GB)")
    OUTPUT_NODE = True
    FUNCTION = "set_vram"
    CATEGORY = "VRAM"

    @classmethod
    def IS_CHANGED(cls, seed=0, **kwargs):
        """当使用特殊种子值时强制更新"""
        if seed == -1:
            return new_random_seed()
        return seed
    def cleanGPUUsedForce(self):
        """强制清理GPU显存"""
        gc.collect()
        model_management.unload_all_models()
        model_management.soft_empty_cache()

    def set_vram(self, reserved, mode="manual", seed=0, auto_max_reserved=0.0, clean_gpu_before=True, anything=None, unique_id=None, extra_pnginfo=None):
        global _legacy_auto_warning_shown
        # Keep legacy workflow inputs without counting GPU usage a second time.
        if mode == "auto" and not _legacy_auto_warning_shown:
            print("[ReservedVRAM]Studio 内置版本已停用 auto 计算，按 manual 使用 reserved；负值按 0 处理，忽略 auto_max_reserved，实际预留仍受 Studio 默认下限约束。")
            _legacy_auto_warning_shown = True

        # 如果启用了前置清理显存，则执行清理操作
        if clean_gpu_before:
            print("[ReservedVRAM]执行前置GPU显存清理...")
            self.cleanGPUUsedForce()
            print("[ReservedVRAM]GPU显存清理完成")

        reserved = max(0, reserved)
        set_reserved_vram(reserved)
        print(f'[ReservedVRAM]set EXTRA_RESERVED_VRAM={reserved}GB (手动模式)，忽略最大限制值')
        final_reserved_vram = round(reserved, 2)

        from comfy_execution.graph import ExecutionBlocker
        output_value = anything if anything is not None else ExecutionBlocker(None)

        return (output_value, seed, final_reserved_vram)

NODE_CLASS_MAPPINGS = {
    "ReservedVRAMSetter": ReservedVRAMSetter
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "ReservedVRAMSetter": "Set Reserved VRAM(GB) ⚙️"
}
