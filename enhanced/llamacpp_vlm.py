import os
import gc
import torch
import numpy as np
import logging
import threading
import time
import inspect
from PIL import Image

from enhanced.logger import format_name
logger = logging.getLogger(format_name(__name__))

def setup_cuda_environment():
    """
    Setup CUDA environment variables to prioritize portable CUDA and avoid version mismatches.
    """
    import platform
    import glob

    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(current_dir)
    portable_root = os.path.dirname(project_root)

    cuda_paths = []
    is_portable = False

    if os.name == 'nt':
        python_embeded = os.path.join(portable_root, 'python_embeded')
        if os.path.exists(python_embeded):
            is_portable = True
            site_packages = os.path.join(python_embeded, 'Lib', 'site-packages')
            if os.path.exists(site_packages):
                nvidia_paths = glob.glob(os.path.join(site_packages, 'nvidia', '*', 'bin'))
                cuda_paths.extend(nvidia_paths)

                torch_lib = os.path.join(site_packages, 'torch', 'lib')
                if os.path.exists(torch_lib):
                    cuda_paths.append(torch_lib)

            bin_path = os.path.join(python_embeded, 'bin')
            if os.path.exists(bin_path):
                cuda_paths.append(bin_path)
    else:
        try:
            import sys
            for path in sys.path:
                if 'site-packages' in path:
                    nvidia_paths = glob.glob(os.path.join(path, 'nvidia', '*', 'lib'))
                    if nvidia_paths:
                        is_portable = True
                        cuda_paths.extend(nvidia_paths)
        except Exception as e:
            logger.debug(f"Failed to search site-packages for CUDA: {e}")

    if is_portable and cuda_paths:
        logger.debug(f"Detected portable environment. Prioritizing CUDA paths: {cuda_paths}")

        for env_var in ["CUDA_PATH", "CUDA_HOME", "CUDA_ROOT"]:
            if env_var in os.environ:
                logger.debug(f"Unsetting global {env_var}={os.environ[env_var]} to force portable CUDA usage")
                del os.environ[env_var]

        if os.name == 'nt':
            current_path = os.environ.get("PATH", "")
            new_path = ";".join(cuda_paths) + ";" + current_path
            os.environ["PATH"] = new_path
        else:
            current_ld = os.environ.get("LD_LIBRARY_PATH", "")
            new_ld = ":".join(cuda_paths) + (":" + current_ld if current_ld else "")
            os.environ["LD_LIBRARY_PATH"] = new_ld

    if not is_portable:
        if os.name == 'nt':
            if "CUDA_PATH" in os.environ:
                _cuda_path = os.environ["CUDA_PATH"]
                _cuda_bin = os.path.join(_cuda_path, "bin")
                if not os.path.exists(_cuda_bin):
                    del os.environ["CUDA_PATH"]
                    logger.info("Removed invalid CUDA_PATH from environment")
        else:
            std_cuda_paths = ["/usr/local/cuda/lib64"]
            try:
                found_paths = glob.glob("/usr/local/cuda-*/lib64")
                if found_paths:
                    std_cuda_paths.extend(sorted(found_paths, reverse=True))
            except:
                pass

            for path in std_cuda_paths:
                if os.path.exists(path):
                    current_ld = os.environ.get("LD_LIBRARY_PATH", "")
                    if path not in current_ld:
                        os.environ["LD_LIBRARY_PATH"] = path + (":" + current_ld if current_ld else "")
                        logger.info(f"Added system CUDA path {path} to LD_LIBRARY_PATH")

    if not os.name == 'nt':
        ld_path = os.environ.get("LD_LIBRARY_PATH", "")
        if "cuda-13" in ld_path and "cuda-12" not in ld_path:
            has_12 = False
            for p in ld_path.split(":"):
                if p and os.path.exists(os.path.join(p, "libcublas.so.12")):
                    has_12 = True
                    break
            if not has_12:
                logger.warning("Detected CUDA 13 but libcublas.so.12 is missing. Clearing CUDA paths to avoid crash.")
                new_ld = ":".join([p for p in ld_path.split(":") if "cuda" not in p.lower()])
                os.environ["LD_LIBRARY_PATH"] = new_ld

setup_cuda_environment()

Llama = None
Llava15ChatHandler = None
Llava16ChatHandler = None
MoondreamChatHandler = None
NanoLlavaChatHandler = None
Llama3VisionAlphaChatHandler = None
MiniCPMv26ChatHandler = None
MiniCPMv45ChatHandler = None
MiniCPMV46ChatHandler = None
Qwen25VLChatHandler = None
Qwen3VLChatHandler = None
Qwen35ChatHandler = None
Qwen3ASRChatHandler = None
MTMDChatHandler = None
Gemma3ChatHandler = None
Gemma4ChatHandler = None
GLM46VChatHandler = None
GLM41VChatHandler = None
LFM2VLChatHandler = None
LFM25VLChatHandler = None
GraniteDoclingChatHandler = None
PaddleOCRChatHandler = None
Step3VLChatHandler = None

LLAMA_CPP_AVAILABLE = False
try:
    from llama_cpp import Llama
    LLAMA_CPP_AVAILABLE = True
except Exception as e:
    logger.error(f"Failed to import llama_cpp: {e}")
    logger.error("Please ensure CUDA libraries are correctly installed and in your library path.")

if LLAMA_CPP_AVAILABLE:
    try:
        from llama_cpp.llama_chat_format import (
            Llava15ChatHandler, Llava16ChatHandler, MoondreamChatHandler,
            NanoLlavaChatHandler, Llama3VisionAlphaChatHandler, MiniCPMv26ChatHandler
        )
    except Exception as e:
        logger.error(f"Failed to import llama_cpp chat handlers: {e}")

    try:
        from llama_cpp.llama_chat_format import Qwen25VLChatHandler
    except Exception:
        Qwen25VLChatHandler = None

    try:
        from llama_cpp.llama_chat_format import Qwen3VLChatHandler
    except Exception:
        Qwen3VLChatHandler = None

    try:
        from llama_cpp.llama_chat_format import Qwen35ChatHandler
    except Exception:
        Qwen35ChatHandler = None

    try:
        from llama_cpp.llama_chat_format import MTMDChatHandler
    except Exception:
        MTMDChatHandler = None

    try:
        from llama_cpp.llama_chat_format import Gemma3ChatHandler
    except Exception:
        Gemma3ChatHandler = None

    try:
        from llama_cpp.llama_chat_format import Gemma4ChatHandler
    except Exception:
        Gemma4ChatHandler = None

    try:
        from llama_cpp.llama_chat_format import GLM46VChatHandler, GLM41VChatHandler, LFM2VLChatHandler
    except Exception:
        GLM46VChatHandler = None
        GLM41VChatHandler = None
        LFM2VLChatHandler = None

    try:
        from llama_cpp.llama_chat_format import LFM25VLChatHandler
    except Exception:
        LFM25VLChatHandler = None

    try:
        from llama_cpp.llama_chat_format import GraniteDoclingChatHandler
    except Exception:
        GraniteDoclingChatHandler = None

    try:
        from llama_cpp.llama_chat_format import MiniCPMv45ChatHandler, MiniCPMV46ChatHandler
    except Exception:
        MiniCPMv45ChatHandler = None
        MiniCPMV46ChatHandler = None

    try:
        from llama_cpp.llama_chat_format import PaddleOCRChatHandler, Qwen3ASRChatHandler, Step3VLChatHandler
    except Exception:
        PaddleOCRChatHandler = None
        Qwen3ASRChatHandler = None
        Step3VLChatHandler = None

import modules.config as config
from modules.custom_llm_api import strip_reasoning_text
from modules.llama_cpp_runtime import (
    estimate_llama_cpp_kv_cache_gb,
    is_llama_cpp_memory_error,
    llama_cpp_gpu_budget,
    llama_cpp_gpu_layer_attempts,
    llama_cpp_kv_cache_type_config,
    normalize_llama_cpp_n_ctx,
    normalize_llama_cpp_vram_policy,
    normalize_llama_cpp_kv_cache_type,
)
from modules.model_path_utils import find_model_in_dirs, first_model_dir
from modules.vlm_model_catalog import gguf_int_values, is_visual_component_filename
import ldm_patched.modules.model_management

class LlamaCppVLM:
    def __init__(self):
        self.llm = None
        self.chat_handler = None
        self.lock = threading.RLock()
        self.current_model_path = None
        self.current_mmproj_path = None
        self.current_chat_handler_name = None
        self.current_n_ctx = None
        self.current_image_min_tokens = None
        self.current_image_max_tokens = None
        self.current_vram_policy = "extreme"
        self.current_kv_cache_type = "f16"
        self.current_requested_kv_cache_type = "f16"
        self.current_kv_cache_type_supported = None
        self.current_target_n_gpu_layers = None
        self.current_n_gpu_layers = None
        self.current_total_layers = None
        self.current_gpu_layer_size_gb = None
        self.current_kv_cache_gb = None
        self.current_mmproj_size_gb = None
        self.current_offload_kqv = None
        self.current_vram_estimate = {}
        self.last_completion_stats = {}
        self.conversation_messages = {}
        self.conversation_system_prompts = {}

    def _record_completion_stats(self, output, elapsed_seconds):
        response = output if isinstance(output, dict) else {}
        usage = response.get("usage") if isinstance(response.get("usage"), dict) else {}
        timings = response.get("timings") if isinstance(response.get("timings"), dict) else {}

        def numeric(*values):
            for value in values:
                try:
                    number = float(value)
                except (TypeError, ValueError):
                    continue
                if number >= 0:
                    return number
            return 0.0

        input_tokens = numeric(
            usage.get("input_tokens"),
            usage.get("prompt_tokens"),
            timings.get("prompt_n"),
        )
        output_tokens = numeric(
            usage.get("output_tokens"),
            usage.get("completion_tokens"),
            timings.get("predicted_n"),
        )
        total_tokens = numeric(usage.get("total_tokens")) or (
            input_tokens + output_tokens if input_tokens or output_tokens else 0.0
        )
        elapsed = numeric(elapsed_seconds)
        predicted_ms = numeric(timings.get("predicted_ms"))
        generation_seconds = predicted_ms / 1000 if predicted_ms else elapsed
        tokens_per_second = numeric(
            timings.get("predicted_per_second"),
            output_tokens / generation_seconds if output_tokens and generation_seconds else 0,
        )
        self.last_completion_stats = {
            "input_tokens": int(round(input_tokens)) if input_tokens else 0,
            "output_tokens": int(round(output_tokens)) if output_tokens else 0,
            "total_tokens": int(round(total_tokens)) if total_tokens else 0,
            "elapsed_seconds": round(elapsed, 3) if elapsed else 0,
            "tokens_per_second": round(tokens_per_second, 2) if tokens_per_second else 0,
        }

    def get_last_completion_stats(self):
        with self.lock:
            return dict(self.last_completion_stats or {})

    @staticmethod
    def _supports_kv_cache_quantization():
        if not LLAMA_CPP_AVAILABLE or Llama is None:
            return False
        try:
            parameters = inspect.signature(Llama).parameters
            return "type_k" in parameters and "type_v" in parameters
        except (TypeError, ValueError):
            return False

    def get_chat_handler_class(self, name):
        handlers = {
            "Qwen3-VL": Qwen3VLChatHandler,
            "Qwen3-VL-Thinking": Qwen3VLChatHandler,
            "Qwen2.5-VL": Qwen25VLChatHandler,
            "MinerU2.5-Pro": Qwen25VLChatHandler,
            "Qwen3.5": Qwen35ChatHandler,
            "Qwen3.5-Thinking": Qwen35ChatHandler,
            "Qwen3.6": Qwen35ChatHandler,
            "Qwen3.6-Thinking": Qwen35ChatHandler,
            "Qwen3.8": Qwen35ChatHandler,
            "Qwen3.8-Thinking": Qwen35ChatHandler,
            "Qwen3-ASR": Qwen3ASRChatHandler,
            "LLaVA-1.5": Llava15ChatHandler,
            "LLaVA-1.6": Llava16ChatHandler,
            "Moondream2": MoondreamChatHandler,
            "nanoLLaVA": NanoLlavaChatHandler,
            "llama3-Vision-Alpha": Llama3VisionAlphaChatHandler,
            "MiniCPM-v2.6": MiniCPMv26ChatHandler,
            "MiniCPM-v4": MiniCPMv26ChatHandler,
            "MiniCPM-v4.5": MiniCPMv45ChatHandler,
            "MiniCPM-v4.5-Thinking": MiniCPMv45ChatHandler,
            "MiniCPM-v4.6": MiniCPMV46ChatHandler,
            "MiniCPM-v4.6-Thinking": MiniCPMV46ChatHandler,
            "Gemma3": Gemma3ChatHandler,
            "Gemma4": Gemma4ChatHandler,
            "GLM-4.6V": GLM46VChatHandler,
            "GLM-4.6V-Thinking": GLM46VChatHandler,
            "GLM-4.1V-Thinking": GLM41VChatHandler,
            "LFM2-VL": LFM2VLChatHandler,
            "LFM2.5-VL": LFM25VLChatHandler,
            "Granite-Docling": GraniteDoclingChatHandler,
            "DeepSeek-OCR": MTMDChatHandler,
            "PaddleOCR-VL-1.5": PaddleOCRChatHandler,
            "Step3-VL": Step3VLChatHandler,
        }
        return handlers.get(name)

    def _create_chat_handler(self, handler_class, mmproj_path, chat_handler_name, image_min_tokens=0, image_max_tokens=0):
        if handler_class is None:
            return None

        think_mode = "Thinking" in (chat_handler_name or "")
        kwargs = {"verbose": False}
        if mmproj_path:
            try:
                signature = inspect.signature(handler_class.__init__)
                parameters = signature.parameters
            except Exception:
                parameters = {}
            if "mmproj_path" in parameters or any(
                getattr(parameter, "kind", None) == inspect.Parameter.VAR_KEYWORD
                for parameter in parameters.values()
            ):
                kwargs["mmproj_path"] = mmproj_path
            else:
                kwargs["clip_model_path"] = mmproj_path

        if chat_handler_name in ("Qwen3-VL", "Qwen3-VL-Thinking"):
            kwargs["force_reasoning"] = think_mode
            kwargs["image_max_tokens"] = int(image_max_tokens or 0)
            kwargs["image_min_tokens"] = int(image_min_tokens or 0)
        elif chat_handler_name in (
            "Qwen3.5", "Qwen3.5-Thinking",
            "Qwen3.6", "Qwen3.6-Thinking",
            "Qwen3.8", "Qwen3.8-Thinking",
            "Gemma4",
        ):
            kwargs["enable_thinking"] = think_mode
        elif chat_handler_name in (
            "MiniCPM-v4.5", "MiniCPM-v4.5-Thinking",
            "MiniCPM-v4.6", "MiniCPM-v4.6-Thinking",
            "GLM-4.6V", "GLM-4.6V-Thinking",
        ):
            kwargs["enable_thinking"] = think_mode
        elif think_mode and (chat_handler_name or "").startswith("MiniCPM-v4"):
            kwargs["enable_thinking"] = True

        if handler_class is MTMDChatHandler:
            kwargs["image_max_tokens"] = int(image_max_tokens or 0)
            kwargs["image_min_tokens"] = int(image_min_tokens or 0)

        try:
            return handler_class(**kwargs)
        except TypeError:
            reduced = dict(kwargs)
            for key in ("enable_thinking", "force_reasoning", "image_max_tokens", "image_min_tokens", "mmproj_path", "clip_model_path"):
                if key not in kwargs:
                    continue
                reduced.pop(key, None)
                try:
                    return handler_class(**reduced)
                except TypeError:
                    continue
            raise

    def _get_layer_count(self, path):
        import struct
        def read_u32(f):
            return struct.unpack("<I", f.read(4))[0]
        def read_u64(f):
            return struct.unpack("<Q", f.read(8))[0]
        def read_string(f):
            ln = read_u64(f)
            return f.read(ln).decode("utf-8")
        def read_value(f):
            vtype = read_u32(f)
            if vtype == 0: return struct.unpack("<B", f.read(1))[0]
            if vtype == 1: return struct.unpack("<b", f.read(1))[0]
            if vtype == 2: return struct.unpack("<H", f.read(2))[0]
            if vtype == 3: return struct.unpack("<h", f.read(2))[0]
            if vtype == 4: return struct.unpack("<I", f.read(4))[0]
            if vtype == 5: return struct.unpack("<i", f.read(4))[0]
            if vtype == 6: return struct.unpack("<f", f.read(4))[0]
            if vtype == 7: return struct.unpack("<?", f.read(1))[0]
            if vtype == 8: return read_string(f)
            if vtype == 9:
                atype = read_u32(f)
                count = read_u64(f)
                return [read_value_of_type(f, atype) for _ in range(count)]
            if vtype == 10: return struct.unpack("<Q", f.read(8))[0]
            if vtype == 11: return struct.unpack("<q", f.read(8))[0]
            if vtype == 12: return struct.unpack("<d", f.read(8))[0]
            raise ValueError(f"Unknown value type {vtype}")
        def read_value_of_type(f, atype):
            if atype == 0: return struct.unpack("<B", f.read(1))[0]
            if atype == 1: return struct.unpack("<b", f.read(1))[0]
            if atype == 2: return struct.unpack("<H", f.read(2))[0]
            if atype == 3: return struct.unpack("<h", f.read(2))[0]
            if atype == 4: return struct.unpack("<I", f.read(4))[0]
            if atype == 5: return struct.unpack("<i", f.read(4))[0]
            if atype == 6: return struct.unpack("<f", f.read(4))[0]
            if atype == 7: return struct.unpack("<?", f.read(1))[0]
            if atype == 8: return read_string(f)
            if atype == 10: return struct.unpack("<Q", f.read(8))[0]
            if atype == 11: return struct.unpack("<q", f.read(8))[0]
            if atype == 12: return struct.unpack("<d", f.read(8))[0]
            raise ValueError(f"Unknown array item type {atype}")

        try:
            with open(path, "rb") as f:
                if f.read(4) != b"GGUF":
                    raise ValueError("Not a GGUF file")
                version = read_u32(f)
                tensor_count = read_u64(f)
                kv_count = read_u64(f)
                for _ in range(kv_count):
                    key = read_string(f)
                    value = read_value(f)
                    if key.lower().endswith(".block_count"):
                        return int(value)
        except Exception as e:
            logger.debug(f"Fast GGUF parse failed: {e}. Trying GGUFReader...")
            try:
                from gguf import GGUFReader
                reader = GGUFReader(path)
                for key in reader.fields.keys():
                    if key.endswith(".block_count") or key == "block_count":
                        return int(reader.get_field(key).parts[-1][0])
            except Exception as e2:
                logger.error(f"GGUFReader also failed: {e2}")
        return 32

    def _get_gguf_hparams(self, path):
        try:
            from gguf import GGUFReader
            reader = GGUFReader(path)

            embedding_length = None
            head_count = None
            head_count_kv = None

            for key in reader.fields.keys():
                k = key.lower()
                if k.endswith(".embedding_length") or k == "embedding_length":
                    values = gguf_int_values(reader.get_field(key))
                    embedding_length = values[0] if values else None
                elif k.endswith(".head_count") or k == "head_count":
                    values = gguf_int_values(reader.get_field(key))
                    head_count = values[0] if values else None
                elif k.endswith(".head_count_kv") or k == "head_count_kv":
                    values = gguf_int_values(reader.get_field(key))
                    head_count_kv = values if len(values) > 1 else (values[0] if values else None)

            return {
                "embedding_length": embedding_length,
                "head_count": head_count,
                "head_count_kv": head_count_kv,
            }
        except Exception:
            return {}

    def _resolve_mmproj_path(self, model_path, mmproj_name=None):
        model_dir = os.path.dirname(model_path)
        if not os.path.exists(model_dir):
            return None
        if mmproj_name:
            resolved = find_model_in_dirs(config.paths_LLM, mmproj_name)
            if resolved and os.path.isfile(resolved):
                return resolved
            candidate = os.path.join(model_dir, os.path.basename(str(mmproj_name)))
            if os.path.isfile(candidate):
                return candidate
            logger.warning("Configured mmproj file not found: %s", mmproj_name)
            return None
        candidates = sorted(
            (
                os.path.join(model_dir, name)
                for name in os.listdir(model_dir)
                if is_visual_component_filename(name) and name.lower().endswith(".gguf")
            ),
            key=lambda value: value.lower(),
        )
        if len(candidates) == 1:
            return candidates[0]
        if len(candidates) > 1:
            logger.warning("Multiple mmproj files found beside %s; select one in the model catalog.", model_path)
        return None

    def _prepare_chat_handler(self, handler_class, mmproj_path, model_path, chat_handler_name, image_min_tokens=0, image_max_tokens=0):
        if not handler_class:
            self.chat_handler = None
            return None

        model_dir = os.path.dirname(model_path)
        if mmproj_path:
            logger.info(f"Using mmproj: {mmproj_path}")
            self.chat_handler = self._create_chat_handler(
                handler_class,
                mmproj_path=mmproj_path,
                chat_handler_name=chat_handler_name,
                image_min_tokens=image_min_tokens,
                image_max_tokens=image_max_tokens,
            )
        else:
            logger.warning(f"No mmproj file found in {model_dir}. Some models may fail to load.")
            self.chat_handler = self._create_chat_handler(
                handler_class,
                mmproj_path=None,
                chat_handler_name=chat_handler_name,
                image_min_tokens=image_min_tokens,
                image_max_tokens=image_max_tokens,
            )
        return self.chat_handler

    def _gpu_layer_score(self, n_gpu_layers, total_layers):
        if n_gpu_layers == -1:
            return int(total_layers or 0) + 1
        try:
            return int(n_gpu_layers)
        except Exception:
            return 0

    def _estimate_current_gpu_layer_credit_gb(self, model_path):
        if self.llm is None or self.current_model_path != model_path:
            return 0.0
        credit_gb = 0.0
        try:
            if self.current_gpu_layer_size_gb and self.current_n_gpu_layers not in (None, -1):
                credit_gb += max(0.0, float(self.current_n_gpu_layers) * float(self.current_gpu_layer_size_gb))
            if self.current_offload_kqv and self.current_kv_cache_gb:
                credit_gb += max(0.0, float(self.current_kv_cache_gb))
            if self.current_mmproj_size_gb:
                credit_gb += max(0.0, float(self.current_mmproj_size_gb))
            return credit_gb
        except Exception:
            return 0.0

    def _prepare_gpu_memory_for_reload(self, reason):
        logger.info("Preparing GPU memory for llama.cpp reload: %s", reason)
        self.free_model()
        memory_management = ldm_patched.modules.model_management
        try:
            memory_management.soft_empty_cache(True)
        except Exception as e:
            logger.debug("Unable to soft-empty the GPU cache before llama.cpp reload: %s", e)
        try:
            memory_management.print_memory_info("before llama.cpp VRAM calculation")
        except Exception:
            pass

    def _calculate_auto_n_gpu_layers(
        self,
        model_path,
        mmproj_path,
        n_ctx,
        loaded_model_credit_gb=0.0,
        vram_policy="extreme",
        kv_cache_type="f16",
    ):
        memory_management = ldm_patched.modules.model_management
        kv_cache_type = normalize_llama_cpp_kv_cache_type(kv_cache_type)
        memory_management.soft_empty_cache(True)
        budget = llama_cpp_gpu_budget(
            memory_management.get_free_memory(),
            memory_management.get_total_memory(),
            reclaimable_gb=loaded_model_credit_gb,
            policy=vram_policy,
        )
        total_layers = self._get_layer_count(model_path)

        hparams = self._get_gguf_hparams(model_path)
        n_embd = hparams.get("embedding_length")
        n_head = hparams.get("head_count")
        n_kv_heads = hparams.get("head_count_kv") or n_head
        kv_cache_gb, kv_cache_from_metadata = estimate_llama_cpp_kv_cache_gb(
            n_ctx,
            total_layers,
            n_embd,
            n_head,
            n_kv_heads,
            kv_cache_type=kv_cache_type,
        )
        _, kv_type_config = llama_cpp_kv_cache_type_config(kv_cache_type)
        offload_kqv = kv_cache_gb <= budget["gpu_budget_gb"]
        kv_cache_reserved_gb = (
            kv_cache_gb
            if budget.get("reserve_kv_cache") and offload_kqv
            else 0.0
        )
        # The extreme policy gives the layer estimator the whole budget and
        # lets the memory retry sequence handle KV-cache pressure. The other
        # policies reserve the estimated KV cache before selecting layers.
        available_vram_gb = budget["gpu_budget_gb"]
        if kv_cache_reserved_gb:
            available_vram_gb = max(0.0, available_vram_gb - kv_cache_reserved_gb)

        weight_overhead = 1.15
        mmproj_size_gb = 0.0
        if mmproj_path:
            mmproj_size_gb = os.path.getsize(mmproj_path) * weight_overhead / (1024 ** 3)
        estimate = {
            **budget,
            "loaded_model_credit_gb": max(0.0, float(loaded_model_credit_gb or 0.0)),
            "kv_cache_gb": kv_cache_gb,
            "kv_cache_type": kv_cache_type,
            "kv_cache_type_bytes_per_element": kv_type_config["bytes_per_element"],
            "kv_cache_type_savings_ratio": max(
                0.0,
                1.0 - float(kv_type_config["bytes_per_element"]) / 2.0,
            ),
            "kv_cache_from_metadata": kv_cache_from_metadata,
            "kv_cache_reserved_gb": kv_cache_reserved_gb,
            "offload_kqv": offload_kqv,
            "mmproj_size_gb": mmproj_size_gb,
            "available_vram_gb": available_vram_gb,
            "layer_budget_gb": available_vram_gb,
            "total_layers": total_layers,
            "layer_size_gb": None,
        }
        logger.info(
            "llama.cpp VRAM budget: free=%.2fGB, total=%.2fGB, reserve=%.2fGB, "
            "budget=%.2fGB, policy=%s, kv_cache=%.2fGB (%s, type=%s), offload_kqv=%s, layer_budget=%.2fGB",
            budget["free_vram_gb"],
            budget["total_vram_gb"],
            budget["reserve_gb"],
            budget["gpu_budget_gb"],
            budget["policy"],
            kv_cache_gb,
            "metadata" if kv_cache_from_metadata else "fallback",
            kv_cache_type,
            offload_kqv,
            available_vram_gb,
        )
        logger.debug(
            "llama.cpp reclaimable GPU memory: %.2fGB",
            estimate["loaded_model_credit_gb"],
        )

        if available_vram_gb <= 0:
            logger.warning("No VRAM remains for model layers after the llama.cpp reserve. Using CPU layers.")
            return 0, estimate

        gguf_size_gb = os.path.getsize(model_path) * weight_overhead / (1024 ** 3)
        layer_size_gb = gguf_size_gb / total_layers
        estimate["layer_size_gb"] = layer_size_gb

        if mmproj_size_gb:
            n_gpu_layers = max(0, int((available_vram_gb - mmproj_size_gb) / layer_size_gb))
        else:
            n_gpu_layers = max(0, int(available_vram_gb / layer_size_gb))

        n_gpu_layers = min(n_gpu_layers, total_layers)
        estimate["target_n_gpu_layers"] = n_gpu_layers
        logger.info(f"Result: n_gpu_layers = {n_gpu_layers}")
        return n_gpu_layers, estimate

    def load_model(
        self,
        model_name,
        chat_handler_name,
        n_gpu_layers=-1,
        n_ctx=8192,
        image_min_tokens=0,
        image_max_tokens=0,
        mmproj_name=None,
        vram_policy="extreme",
        kv_cache_type="f16",
    ):
        if not LLAMA_CPP_AVAILABLE:
            logger.error("llama-cpp-python is not correctly installed or CUDA libraries are missing.")
            return

        with self.lock:
            n_ctx = normalize_llama_cpp_n_ctx(n_ctx, default=8192)
            vram_policy = normalize_llama_cpp_vram_policy(vram_policy)
            requested_kv_cache_type = normalize_llama_cpp_kv_cache_type(kv_cache_type)
            kv_cache_quantization_supported = self._supports_kv_cache_quantization()
            effective_kv_cache_type = requested_kv_cache_type
            if requested_kv_cache_type != "f16" and not kv_cache_quantization_supported:
                effective_kv_cache_type = "f16"
                logger.warning(
                    "llama.cpp binding does not expose type_k/type_v; falling back from KV cache %s to FP16",
                    requested_kv_cache_type,
                )
            model_path = find_model_in_dirs(config.paths_LLM, model_name) or os.path.join(first_model_dir(config.paths_LLM), model_name)
            handler_class = self.get_chat_handler_class(chat_handler_name)
            mmproj_path = self._resolve_mmproj_path(model_path, mmproj_name=mmproj_name) if handler_class else None
            same_model_identity = (
                self.llm is not None
                and self.current_model_path == model_path
                and self.current_mmproj_path == mmproj_path
                and self.current_chat_handler_name == chat_handler_name
                and self.current_n_ctx == int(n_ctx)
                and self.current_image_min_tokens == int(image_min_tokens or 0)
                and self.current_image_max_tokens == int(image_max_tokens or 0)
            )
            same_loaded_model = (
                same_model_identity
                and self.current_vram_policy == vram_policy
                and self.current_requested_kv_cache_type == requested_kv_cache_type
            )

            auto_n_gpu_layers = n_gpu_layers == -1
            auto_estimate = {}
            reload_reason = "model or runtime settings changed"
            if same_loaded_model:
                if not auto_n_gpu_layers:
                    if self.current_n_gpu_layers == n_gpu_layers:
                        return
                    reload_reason = "manual GPU layer count changed"
                else:
                    try:
                        current_credit_gb = self._estimate_current_gpu_layer_credit_gb(model_path)
                        estimated_layers, auto_estimate = self._calculate_auto_n_gpu_layers(
                            model_path,
                            mmproj_path,
                            n_ctx,
                            loaded_model_credit_gb=current_credit_gb,
                            vram_policy=vram_policy,
                            kv_cache_type=effective_kv_cache_type,
                        )
                    except Exception as e:
                        logger.warning(
                            "llama.cpp VRAM calculation failed while checking the loaded model: %s",
                            e,
                        )
                        estimated_layers = self.current_n_gpu_layers or 0
                    current_score = self._gpu_layer_score(self.current_n_gpu_layers, self.current_total_layers)
                    target_score = self._gpu_layer_score(
                        estimated_layers,
                        auto_estimate.get("total_layers") or self.current_total_layers,
                    )
                    if target_score > current_score:
                        n_gpu_layers = estimated_layers
                        reload_reason = "automatic GPU layer budget improved"
                        logger.info(
                            "Reloading llama.cpp VLM with higher GPU offload: current_n_gpu_layers=%s, target_n_gpu_layers=%s",
                            self.current_n_gpu_layers,
                            n_gpu_layers,
                        )
                    else:
                        return

            self._prepare_gpu_memory_for_reload(reload_reason)

            if auto_n_gpu_layers:
                try:
                    n_gpu_layers, auto_estimate = self._calculate_auto_n_gpu_layers(
                        model_path,
                        mmproj_path,
                        n_ctx,
                        loaded_model_credit_gb=0.0,
                        vram_policy=vram_policy,
                        kv_cache_type=effective_kv_cache_type,
                    )
                except Exception as e:
                    total_layers = self._get_layer_count(model_path)
                    logger.error(
                        "llama.cpp VRAM calculation failed after releasing the previous model: %s. "
                        "Probing GPU layers through the staged loader instead of selecting CPU-only mode.",
                        e,
                    )
                    n_gpu_layers = total_layers
                    auto_estimate = {
                        "total_layers": total_layers,
                        "offload_kqv": False,
                        "kv_cache_type": effective_kv_cache_type,
                        "target_n_gpu_layers": total_layers,
                        "vram_calculation_failed": True,
                    }

            target_n_gpu_layers = n_gpu_layers

            logger.info(f"Loading Main LLM from: {model_path}")

            self._prepare_chat_handler(
                handler_class,
                mmproj_path=mmproj_path,
                model_path=model_path,
                chat_handler_name=chat_handler_name,
                image_min_tokens=image_min_tokens,
                image_max_tokens=image_max_tokens,
            )

            total_layers = auto_estimate.get("total_layers") or self._get_layer_count(model_path)
            offload_kqv = bool(auto_estimate.get("offload_kqv", True))
            load_attempts = [
                (layer_count, offload_kqv)
                for layer_count in llama_cpp_gpu_layer_attempts(n_gpu_layers, total_layers)
            ]
            if offload_kqv and (0, False) not in load_attempts:
                load_attempts.append((0, False))

            loaded_layers = None
            loaded_offload_kqv = None
            loaded_kv_cache_type = None
            oom_type = getattr(ldm_patched.modules.model_management, "OOM_EXCEPTION", None)
            quantization_fallback = False
            kv_cache_load_types = [effective_kv_cache_type]
            if effective_kv_cache_type != "f16":
                kv_cache_load_types.append("f16")
            for kv_type_index, attempt_kv_cache_type in enumerate(kv_cache_load_types):
                _, kv_type_config = llama_cpp_kv_cache_type_config(attempt_kv_cache_type)
                for attempt_index, (attempt_layers, attempt_offload_kqv) in enumerate(load_attempts):
                    try:
                        llama_kwargs = {
                            "model_path": model_path,
                            "chat_handler": self.chat_handler,
                            "n_gpu_layers": attempt_layers,
                            "n_ctx": n_ctx,
                            "offload_kqv": attempt_offload_kqv,
                            "verbose": False,
                        }
                        if attempt_kv_cache_type != "f16":
                            llama_kwargs.update({
                                "type_k": kv_type_config["type_k"],
                                "type_v": kv_type_config["type_v"],
                            })
                        self.llm = Llama(**llama_kwargs)
                        loaded_layers = attempt_layers
                        loaded_offload_kqv = attempt_offload_kqv
                        loaded_kv_cache_type = attempt_kv_cache_type
                        break
                    except Exception as e:
                        self.llm = None
                        memory_error = is_llama_cpp_memory_error(e, oom_type)
                        has_next_attempt = attempt_index + 1 < len(load_attempts)
                        if memory_error and has_next_attempt:
                            next_layers, next_offload_kqv = load_attempts[attempt_index + 1]
                            logger.warning(
                                "llama.cpp memory allocation failed with n_gpu_layers=%s, offload_kqv=%s, kv_cache_type=%s; "
                                "retrying with n_gpu_layers=%s, offload_kqv=%s",
                                attempt_layers,
                                attempt_offload_kqv,
                                attempt_kv_cache_type,
                                next_layers,
                                next_offload_kqv,
                            )
                            gc.collect()
                            ldm_patched.modules.model_management.soft_empty_cache(True)
                            continue
                        if attempt_kv_cache_type != "f16" and kv_type_index + 1 < len(kv_cache_load_types):
                            logger.warning(
                                "llama.cpp rejected KV cache type %s (%s); retrying with FP16 KV cache",
                                attempt_kv_cache_type,
                                type(e).__name__,
                            )
                            quantization_fallback = True
                            gc.collect()
                            ldm_patched.modules.model_management.soft_empty_cache(True)
                            break
                        raise
                if self.llm is not None:
                    break

            if self.llm is None or loaded_kv_cache_type is None:
                raise RuntimeError("llama.cpp failed to load the selected VLM")

            logger.info(
                "llama.cpp load result: target_gpu_layers=%s, loaded_gpu_layers=%s/%s, cpu_layers=%s, "
                "offload_kqv=%s, kv_cache_type=%s",
                target_n_gpu_layers,
                loaded_layers,
                total_layers,
                max(0, total_layers - int(loaded_layers or 0)),
                loaded_offload_kqv,
                loaded_kv_cache_type,
            )
            if auto_n_gpu_layers and int(loaded_layers or 0) == 0 and int(target_n_gpu_layers or 0) > 0:
                logger.warning(
                    "llama.cpp auto offload ended at 0/%s GPU layers after staged allocation attempts; "
                    "CPU fallback is active because GPU allocation attempts failed (target=%s)",
                    total_layers,
                    target_n_gpu_layers,
                )

            if loaded_kv_cache_type != effective_kv_cache_type:
                quantization_fallback = True
                try:
                    hparams = self._get_gguf_hparams(model_path)
                    fallback_kv_cache_gb, fallback_from_metadata = estimate_llama_cpp_kv_cache_gb(
                        n_ctx,
                        total_layers,
                        hparams.get("embedding_length"),
                        hparams.get("head_count"),
                        hparams.get("head_count_kv") or hparams.get("head_count"),
                        kv_cache_type=loaded_kv_cache_type,
                    )
                    auto_estimate["kv_cache_gb"] = fallback_kv_cache_gb
                    auto_estimate["kv_cache_from_metadata"] = fallback_from_metadata
                    auto_estimate["kv_cache_type"] = loaded_kv_cache_type
                    _, fallback_type_config = llama_cpp_kv_cache_type_config(loaded_kv_cache_type)
                    auto_estimate["kv_cache_type_bytes_per_element"] = fallback_type_config["bytes_per_element"]
                    auto_estimate["kv_cache_type_savings_ratio"] = max(
                        0.0,
                        1.0 - float(fallback_type_config["bytes_per_element"]) / 2.0,
                    )
                except Exception:
                    pass

            self.current_model_path = model_path
            self.current_mmproj_path = mmproj_path
            self.current_chat_handler_name = chat_handler_name
            self.current_n_ctx = int(n_ctx)
            self.current_image_min_tokens = int(image_min_tokens or 0)
            self.current_image_max_tokens = int(image_max_tokens or 0)
            self.current_vram_policy = vram_policy
            self.current_kv_cache_type = loaded_kv_cache_type
            self.current_requested_kv_cache_type = requested_kv_cache_type
            self.current_kv_cache_type_supported = kv_cache_quantization_supported
            self.current_target_n_gpu_layers = target_n_gpu_layers
            self.current_n_gpu_layers = loaded_layers
            self.current_total_layers = total_layers
            self.current_gpu_layer_size_gb = auto_estimate.get("layer_size_gb")
            self.current_kv_cache_gb = auto_estimate.get("kv_cache_gb")
            self.current_mmproj_size_gb = auto_estimate.get("mmproj_size_gb")
            self.current_offload_kqv = loaded_offload_kqv
            self.current_vram_estimate = dict(auto_estimate)
            self.current_vram_estimate["target_n_gpu_layers"] = target_n_gpu_layers
            self.current_vram_estimate["loaded_n_gpu_layers"] = loaded_layers
            self.current_vram_estimate["loaded_offload_kqv"] = loaded_offload_kqv
            self.current_vram_estimate["requested_kv_cache_type"] = requested_kv_cache_type
            self.current_vram_estimate["loaded_kv_cache_type"] = loaded_kv_cache_type
            self.current_vram_estimate["kv_cache_quantization_supported"] = kv_cache_quantization_supported
            self.current_vram_estimate["kv_cache_quantization_fallback"] = quantization_fallback
            ldm_patched.modules.model_management.print_memory_info("after load llama.cpp model")

    def free_model(self, clear_conversations=False):
        with self.lock:
            if self.llm:
                self.llm.close()
                self.llm = None
            if self.chat_handler:
                try:
                    self.chat_handler._exit_stack.close()
                except:
                    pass
            self.chat_handler = None
            self.current_model_path = None
            self.current_mmproj_path = None
            self.current_chat_handler_name = None
            self.current_n_ctx = None
            self.current_image_min_tokens = None
            self.current_image_max_tokens = None
            self.current_kv_cache_type = "f16"
            self.current_requested_kv_cache_type = "f16"
            self.current_kv_cache_type_supported = None
            self.current_n_gpu_layers = None
            self.current_total_layers = None
            self.current_target_n_gpu_layers = None
            self.current_gpu_layer_size_gb = None
            self.current_kv_cache_gb = None
            self.current_mmproj_size_gb = None
            self.current_offload_kqv = None
            self.current_vram_estimate = {}
            self.last_completion_stats = {}
            if clear_conversations:
                self.clear_conversation()
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

    def get_runtime_status(self, vram_policy=None, kv_cache_type=None, n_ctx=None):
        acquired = self.lock.acquire(blocking=False)
        try:
            return self._runtime_status_snapshot(vram_policy, kv_cache_type, n_ctx)
        finally:
            if acquired:
                self.lock.release()

    def _runtime_status_snapshot(self, vram_policy=None, kv_cache_type=None, n_ctx=None):
        requested_policy = normalize_llama_cpp_vram_policy(vram_policy or self.current_vram_policy)
        requested_kv_cache_type = normalize_llama_cpp_kv_cache_type(
            kv_cache_type or self.current_requested_kv_cache_type
        )
        requested_n_ctx = normalize_llama_cpp_n_ctx(
            n_ctx,
            default=self.current_n_ctx or 8192,
        )
        memory_management = ldm_patched.modules.model_management
        gpu_total_gb = 0.0
        gpu_free_gb = 0.0
        try:
            gpu_total_gb = max(0.0, float(memory_management.get_total_memory()) / (1024 ** 3))
            gpu_free_gb = max(0.0, float(memory_management.get_free_memory()) / (1024 ** 3))
        except Exception:
            pass

        total_layers = max(0, int(self.current_total_layers or 0))
        gpu_layers = self.current_n_gpu_layers
        if gpu_layers == -1:
            gpu_layers = total_layers
        elif gpu_layers is None:
            gpu_layers = 0
        gpu_layers = max(0, min(total_layers, int(gpu_layers)))
        loaded = self.llm is not None
        loaded_policy = normalize_llama_cpp_vram_policy(self.current_vram_policy)
        estimate = dict(self.current_vram_estimate or {})
        return {
            "loaded": loaded,
            "state": "ready" if loaded else "not_loaded",
            "policy": loaded_policy if loaded else requested_policy,
            "requested_policy": requested_policy,
            "policy_pending": bool(loaded and loaded_policy != requested_policy),
            "kv_cache_type": self.current_kv_cache_type if loaded else requested_kv_cache_type,
            "requested_kv_cache_type": requested_kv_cache_type,
            "kv_cache_type_pending": bool(
                loaded and self.current_requested_kv_cache_type != requested_kv_cache_type
            ),
            "kv_cache_quantization_supported": self.current_kv_cache_type_supported,
            "kv_cache_quantized": bool(loaded and self.current_kv_cache_type != "f16"),
            "kv_cache_quantization_fallback": bool(
                loaded and estimate.get("kv_cache_quantization_fallback")
            ),
            "n_ctx": int(self.current_n_ctx or requested_n_ctx) if loaded else requested_n_ctx,
            "requested_n_ctx": requested_n_ctx,
            "n_ctx_pending": bool(loaded and int(self.current_n_ctx or 0) != requested_n_ctx),
            "model": os.path.basename(self.current_model_path or ""),
            "model_path": self.current_model_path or "",
            "gpu_layers": gpu_layers if loaded else 0,
            "total_layers": total_layers if loaded else 0,
            "cpu_layers": max(0, total_layers - gpu_layers) if loaded else 0,
            "target_gpu_layers": int(self.current_target_n_gpu_layers or 0) if loaded else 0,
            "offload_kqv": bool(self.current_offload_kqv) if loaded else False,
            "gpu_used_gb": max(0.0, gpu_total_gb - gpu_free_gb),
            "gpu_free_gb": gpu_free_gb,
            "gpu_total_gb": gpu_total_gb,
            "gpu_budget_gb": estimate.get("gpu_budget_gb"),
            "layer_budget_gb": estimate.get("layer_budget_gb"),
            "kv_cache_gb": estimate.get("kv_cache_gb"),
            "kv_cache_savings_ratio": estimate.get("kv_cache_type_savings_ratio"),
        }

    def clear_conversation(self, conversation_id=None):
        with self.lock:
            if conversation_id is None:
                self.conversation_messages.clear()
                self.conversation_system_prompts.clear()
                return
            key = str(conversation_id)
            self.conversation_messages.pop(key, None)
            self.conversation_system_prompts.pop(key, None)

    def reset_runtime_context(self):
        with self.lock:
            try:
                if hasattr(self.llm, "n_tokens"):
                    self.llm.n_tokens = 0
                ctx = getattr(self.llm, "_ctx", None)
                if ctx is not None and hasattr(ctx, "memory_clear"):
                    ctx.memory_clear(True)
                if getattr(self.llm, "is_hybrid", False) and getattr(self.llm, "_hybrid_cache_mgr", None) is not None:
                    self.llm._hybrid_cache_mgr.clear()
            except Exception:
                pass

    def _default_system_prompt(self):
        return "You are a helpful visual assistant. Answer directly and use the conversation context when it is relevant."

    def _image_to_base64(self, image):
        import io
        import base64
        if image is None:
            return None
        if isinstance(image, np.ndarray):
            img = Image.fromarray(image)
        elif isinstance(image, Image.Image):
            img = image
        else:
            return None
        if img.mode != 'RGB':
            img = img.convert('RGB')
        img = self._resize_image_for_llamacpp(img)
        buffered = io.BytesIO()
        img.save(buffered, format="JPEG", quality=85)
        return base64.b64encode(buffered.getvalue()).decode('utf-8')

    def _resize_image_for_llamacpp(self, img):
        try:
            max_side = 512 if self.current_chat_handler_name in ("Qwen3-VL", "Qwen3-VL-Thinking") else 1024
            max_pixels = max_side * max_side
            w, h = img.size
            scale = min(1.0, max_side / max(1, w, h), (max_pixels / max(1, w * h)) ** 0.5)
            if scale >= 0.999:
                return img
            next_size = (max(1, int(round(w * scale))), max(1, int(round(h * scale))))
            return img.resize(next_size, Image.Resampling.LANCZOS)
        except Exception:
            return img

    def _build_user_message(self, image, prompt):
        if image is None:
            return {"role": "user", "content": prompt}

        user_content = [{"type": "text", "text": prompt}]
        images = image if isinstance(image, (list, tuple)) else [image]
        for img in images:
            base64_image = self._image_to_base64(img)
            if base64_image:
                user_content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}
                })
        return {"role": "user", "content": user_content}

    def _sanitize_messages(self, messages):
        placeholder = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAsTAAALEwEAmpwYAAAADElEQVQImWP4//8/AAX+Av5Y8msOAAAAAElFTkSuQmCC"
        clean_messages = []
        for msg in messages:
            if not isinstance(msg, dict):
                continue
            clean_msg = {"role": msg.get("role", "user")}
            content = msg.get("content", "")
            if isinstance(content, list):
                clean_content = []
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "image_url":
                        clean_content.append({"type": "image_url", "image_url": {"url": placeholder}})
                    elif isinstance(item, dict):
                        clean_content.append(dict(item))
                    else:
                        clean_content.append(item)
                clean_msg["content"] = clean_content
            else:
                clean_msg["content"] = content
            clean_messages.append(clean_msg)
        return clean_messages

    def _message_text_length(self, value):
        if value is None:
            return 0
        if isinstance(value, str):
            return len(value)
        if isinstance(value, dict):
            return sum(self._message_text_length(item) for item in value.values())
        if isinstance(value, (list, tuple)):
            return sum(self._message_text_length(item) for item in value)
        return len(str(value))

    def _messages_text_length(self, messages):
        return sum(self._message_text_length(message.get("content")) for message in messages if isinstance(message, dict))

    def _trim_history(self, messages, max_history):
        if max_history is None or int(max_history) <= 0:
            return messages
        limit = max(2, int(max_history) * 2)
        system_messages = [m for m in messages[:1] if m.get("role") == "system"]
        rest = messages[1:] if system_messages else messages
        if len(rest) > limit:
            rest = rest[-limit:]
        return system_messages + rest

    def _clear_hybrid_cache_if_needed(self):
        if self.current_chat_handler_name not in (
            "Qwen3-VL", "Qwen3-VL-Thinking",
            "Qwen3.5", "Qwen3.5-Thinking",
            "Qwen3.6", "Qwen3.6-Thinking",
            "Qwen3.8", "Qwen3.8-Thinking",
        ):
            return
        try:
            if hasattr(self.llm, "n_tokens"):
                self.llm.n_tokens = 0
            ctx = getattr(self.llm, "_ctx", None)
            if ctx is not None and hasattr(ctx, "memory_clear"):
                ctx.memory_clear(True)
            if getattr(self.llm, "is_hybrid", False) and getattr(self.llm, "_hybrid_cache_mgr", None) is not None:
                self.llm._hybrid_cache_mgr.clear()
        except Exception:
            pass

    def _with_non_thinking_guard(self, system_msg):
        handler_name = str(self.current_chat_handler_name or "")
        if not handler_name or "Thinking" in handler_name:
            return system_msg
        if not any(name in handler_name for name in ("Qwen", "MiniCPM", "GLM", "Gemma")):
            return system_msg
        guard = (
            "Do not output thinking, reasoning traces, chain-of-thought, analysis notes, "
            "'Thinking Process' sections, <think> blocks, or thought channels. Return only the final requested result."
        )
        system_msg = str(system_msg or "").strip()
        if guard in system_msg:
            return system_msg
        return (system_msg + "\n" + guard).strip() if system_msg else guard

    def _qwen38_non_thinking_kwargs(self):
        handler_name = str(self.current_chat_handler_name or "")
        model_path = str(self.current_model_path or "").lower()
        if "thinking" in handler_name.lower():
            return {}
        if handler_name == "Qwen3.8" or "qwen3.8" in model_path or "qwen38" in model_path:
            return {
                "reasoning_budget": 0,
                "reasoning_start_in_prompt": True,
            }
        return {}

    def chat(self, image, prompt, conversation_id="default", system_prompt=None, save_state=True, max_history=24,
             max_tokens=1024, temperature=0.8, top_p=0.9, top_k=40, repetition_penalty=1.1, seed=-1):
        with self.lock:
            self.last_completion_stats = {}
            if self.llm is None:
                logger.error("Model not loaded")
                return "Error: Model not loaded"

            conversation_key = str(conversation_id or "default")
            system_msg = self._default_system_prompt() if system_prompt is None else str(system_prompt)
            system_msg = self._with_non_thinking_guard(system_msg)
            cached_system = self.conversation_system_prompts.get(conversation_key)
            if save_state and cached_system == system_msg:
                messages = self.conversation_messages.get(conversation_key, [])
                messages = self._sanitize_messages(messages)
            else:
                messages = []
                if system_msg.strip():
                    messages.append({"role": "system", "content": system_msg})
                if save_state:
                    self.conversation_system_prompts[conversation_key] = system_msg

            messages.append(self._build_user_message(image, prompt))
            logger.info(f"LlamaCpp Chat: id={conversation_key}, prompt={prompt[:50]}... (image={'Yes' if image is not None else 'No'})")

            try:
                started = time.monotonic()
                output = self.llm.create_chat_completion(
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    top_p=top_p,
                    top_k=top_k,
                    repeat_penalty=repetition_penalty,
                    seed=seed if seed != -1 else None,
                    **self._qwen38_non_thinking_kwargs(),
                )
                result = strip_reasoning_text(output['choices'][0]['message']['content'])
                elapsed = time.monotonic() - started
                self._record_completion_stats(output, elapsed)
                logger.info(
                    "LlamaCpp Chat stats: elapsed=%.3fs, prompt_chars=%s, result_chars=%s, usage=%s",
                    elapsed,
                    self._messages_text_length(messages),
                    len(result),
                    output.get("usage") if isinstance(output, dict) else None,
                )
                if save_state:
                    messages.append({"role": "assistant", "content": result})
                    messages = self._trim_history(messages, max_history)
                    self.conversation_messages[conversation_key] = self._sanitize_messages(messages)
                return result
            except Exception as e:
                self.last_completion_stats = {}
                logger.error(f"LlamaCpp Chat Error: {str(e)}")
                return f"Error during inference: {str(e)}"
            finally:
                self._clear_hybrid_cache_if_needed()

    def inference(self, image, prompt, chat_handler_override=None, max_tokens=1024, temperature=0.8, top_p=0.9, top_k=40, repetition_penalty=1.1, seed=-1, system_prompt=None):
        with self.lock:
            self.last_completion_stats = {}
            if self.llm is None:
                logger.error("Model not loaded")
                return "Error: Model not loaded"

            import io
            import base64

            if chat_handler_override and self.current_chat_handler_name != chat_handler_override:
                 logger.info(f"Inference with chat_handler_override: {chat_handler_override}")

            def image_to_base64(img_np):
                img = Image.fromarray(img_np)
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                img = self._resize_image_for_llamacpp(img)
                buffered = io.BytesIO()
                img.save(buffered, format="JPEG", quality=85)
                return base64.b64encode(buffered.getvalue()).decode('utf-8')

            messages = []
            default_system_msg = "You are a helpful assistant. Follow instructions precisely. For any task (captioning, translation, expansion), output ONLY the result. Do not include any preamble, introduction, explanation, or conversational filler."
            system_msg = default_system_msg if system_prompt is None else str(system_prompt or "").strip()
            system_msg = self._with_non_thinking_guard(system_msg)
            if system_msg:
                messages.append({"role": "system", "content": system_msg})

            if image is not None:
                user_content = []
                user_content.append({"type": "text", "text": prompt})
                
                images = image if isinstance(image, (list, tuple)) else [image]
                for img in images:
                    if img is None:
                        continue
                    if isinstance(img, np.ndarray):
                        base64_image = image_to_base64(img)
                    elif isinstance(img, Image.Image):
                        if img.mode != 'RGB':
                            img = img.convert('RGB')
                        img = self._resize_image_for_llamacpp(img)
                        buffered = io.BytesIO()
                        img.save(buffered, format="JPEG", quality=85)
                        base64_image = base64.b64encode(buffered.getvalue()).decode('utf-8')
                    else:
                        base64_image = None

                    if base64_image:
                        user_content.append({
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}
                        })
                messages.append({"role": "user", "content": user_content})
            else:
                messages.append({"role": "user", "content": prompt})

            logger.info(f"LlamaCpp Inference: prompt={prompt[:50]}... (image={'Yes' if image is not None else 'No'})")
            
            try:
                started = time.monotonic()
                output = self.llm.create_chat_completion(
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    top_p=top_p,
                    top_k=top_k,
                    repeat_penalty=repetition_penalty,
                    seed=seed if seed != -1 else None,
                    **self._qwen38_non_thinking_kwargs(),
                )
                result = strip_reasoning_text(output['choices'][0]['message']['content'])
                elapsed = time.monotonic() - started
                self._record_completion_stats(output, elapsed)
                logger.info(
                    "LlamaCpp Inference stats: elapsed=%.3fs, prompt_chars=%s, result_chars=%s, usage=%s",
                    elapsed,
                    self._messages_text_length(messages),
                    len(result),
                    output.get("usage") if isinstance(output, dict) else None,
                )
                return result
            except Exception as e:
                self.last_completion_stats = {}
                logger.error(f"LlamaCpp Inference Error: {str(e)}")
                return f"Error during inference: {str(e)}"
            finally:
                self._clear_hybrid_cache_if_needed()

llamacpp_vlm = LlamaCppVLM()
