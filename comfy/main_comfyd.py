import os
import sys
import platform
root = os.path.dirname(os.path.abspath(__file__))
sys.path.append(root)
script_dir = os.path.dirname(os.path.abspath(__file__))
target_dir = os.path.abspath(os.path.join(script_dir, '..'))
os.chdir(target_dir)
import warnings
warnings.filterwarnings("ignore", category=FutureWarning)


def _load_llama_cpp_runtime_helpers():
    import importlib.util

    module_path = os.path.join(target_dir, "modules", "llama_cpp_runtime.py")
    spec = importlib.util.spec_from_file_location("simpai_llama_cpp_runtime", module_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load llama.cpp runtime helpers: {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.llama_cpp_version_matches, module.select_llama_cpp_wheel


llama_cpp_version_matches, select_llama_cpp_wheel = _load_llama_cpp_runtime_helpers()

ORT_CUDA13_INDEX_URL = os.environ.get(
    "ORT_CUDA13_INDEX_URL",
    "https://aiinfra.pkgs.visualstudio.com/PublicPackages/_packaging/ort-cuda-13-nightly/pypi/simple/",
)
ORT_CUDA13_DEFAULT_PACKAGE = "onnxruntime-gpu==1.27.0.dev20260511001"
ORT_CUDA13_DEFAULT_WHEEL_URL = (
    "https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/libs/"
    "onnxruntime-gpu/onnxruntime_gpu-1.27.0.dev20260511001-cp313-cp313-win_amd64.whl"
)

def _default_ort_cuda13_wheel_url():
    is_windows_cp313_amd64 = (
        platform.system() == "Windows"
        and sys.version_info[:2] == (3, 13)
        and platform.machine().lower() in ("amd64", "x86_64")
    )
    return ORT_CUDA13_DEFAULT_WHEEL_URL if is_windows_cp313_amd64 else ""

ORT_CUDA13_PACKAGE = os.environ.get("ORT_CUDA13_PACKAGE", ORT_CUDA13_DEFAULT_PACKAGE)
ORT_CUDA13_WHEEL_URL = os.environ.get(
    "ORT_CUDA13_WHEEL_URL",
    _default_ort_cuda13_wheel_url() if "ORT_CUDA13_PACKAGE" not in os.environ else "",
)
ORT_CUDA13_INFO_PREFIX = "SIMPAI_ORT_INFO="


def _pip_env():
    env = os.environ.copy()
    env["PYTHONNOUSERSITE"] = "1"
    env["PIP_USER"] = "0"
    env["PIP_PROGRESS_BAR"] = "raw"
    env.pop("PYTHONPATH", None)
    env.pop("PYTHONHOME", None)
    return env


def _torch_package_dirs_noimport():
    try:
        import importlib.util
        torch_spec = importlib.util.find_spec("torch")
        if torch_spec is None:
            return []
        return [os.path.abspath(folder) for folder in torch_spec.submodule_search_locations or []]
    except Exception:
        return []


def _torch_version_noimport():
    try:
        for folder in _torch_package_dirs_noimport():
            version_path = os.path.join(folder, "version.py")
            if not os.path.isfile(version_path):
                continue
            import importlib.util
            spec = importlib.util.spec_from_file_location("simpai_torch_version", version_path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return str(getattr(module, "__version__", ""))
    except Exception:
        return ""
    return ""


def _torch_lib_dir_noimport():
    for folder in _torch_package_dirs_noimport():
        lib_dir = os.path.join(folder, "lib")
        if os.path.isdir(lib_dir):
            return lib_dir
    return ""


def _installed_package_version(package):
    try:
        import importlib.metadata
        return importlib.metadata.version(package)
    except Exception:
        return None


def _installed_onnxruntime_cuda_info():
    import json
    import re
    import subprocess

    code = r"""
import contextlib
import io
import json

info = {"version": None, "providers": [], "cuda_build": None, "debug": ""}
try:
    import onnxruntime as ort
    info["version"] = getattr(ort, "__version__", None)
    info["providers"] = list(ort.get_available_providers())
    debug_buffer = io.StringIO()
    with contextlib.redirect_stdout(debug_buffer), contextlib.redirect_stderr(debug_buffer):
        try:
            ort.print_debug_info()
        except Exception as e:
            print(f"print_debug_info failed: {e}")
    info["debug"] = debug_buffer.getvalue()
except Exception as e:
    info["debug"] = f"import onnxruntime failed: {e}"
print("SIMPAI_ORT_INFO=" + json.dumps(info, ensure_ascii=False))
"""
    try:
        result = subprocess.run(
            [sys.executable, "-s", "-X", "utf8", "-c", code],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=_pip_env(),
            timeout=60,
        )
    except Exception:
        return {}

    output = f"{result.stdout or ''}\n{result.stderr or ''}"
    info = {}
    for line in output.splitlines():
        if not line.startswith(ORT_CUDA13_INFO_PREFIX):
            continue
        try:
            info = json.loads(line[len(ORT_CUDA13_INFO_PREFIX):])
        except Exception:
            info = {}
        break

    debug_text = info.get("debug") or output
    match = re.search(r"CUDA version used in build:\s*([0-9.]+)", debug_text)
    if match:
        info["cuda_build"] = match.group(1)
    return info


def _onnxruntime_cuda13_ready():
    info = _installed_onnxruntime_cuda_info()
    cuda_build = str(info.get("cuda_build") or "")
    providers = info.get("providers") or []
    has_cpu_ort_package = _installed_package_version("onnxruntime") is not None
    return not has_cpu_ort_package and cuda_build.startswith("13.") and "CUDAExecutionProvider" in providers


def _onnxruntime_cuda13_install_commands():
    commands = []
    if ORT_CUDA13_WHEEL_URL:
        commands.append((
            "ModelScope wheel",
            [
                sys.executable,
                "-s",
                "-m",
                "pip",
                "install",
                "--pre",
                "--no-deps",
                "--force-reinstall",
                ORT_CUDA13_WHEEL_URL,
            ],
        ))
    commands.append((
        "ONNX Runtime nightly index",
        [
            sys.executable,
            "-s",
            "-m",
            "pip",
            "install",
            "--pre",
            "--no-deps",
            "--force-reinstall",
            "--index-url",
            ORT_CUDA13_INDEX_URL,
            ORT_CUDA13_PACKAGE,
        ],
    ))
    return commands


def install_onnxruntime_gpu_cuda13_for_comfyd():
    torch_version = _torch_version_noimport()
    if "+cu130" not in torch_version:
        return None

    if _onnxruntime_cuda13_ready():
        return None

    import subprocess

    print("[Comfyd] Installing ONNX Runtime GPU CUDA 13.")
    subprocess.run(
        [sys.executable, "-s", "-m", "pip", "uninstall", "-y", "onnxruntime", "onnxruntime-gpu"],
        check=False,
        env=_pip_env(),
    )
    for source_name, command in _onnxruntime_cuda13_install_commands():
        print(f"[Comfyd] Trying ONNX Runtime GPU CUDA 13 source: {source_name}")
        result = subprocess.run(command, check=False, env=_pip_env())
        if result.returncode != 0:
            print(f"[Comfyd] ONNX Runtime GPU CUDA 13 source failed: {source_name}")
            continue
        if _onnxruntime_cuda13_ready():
            print(f"[Comfyd] ONNX Runtime GPU CUDA 13 is ready from {source_name}.")
            return None
        print(f"[Comfyd] ONNX Runtime GPU CUDA 13 source is not ready after install: {source_name}")
    print("[Comfyd] ONNX Runtime GPU CUDA 13 wheel is not ready after install.")
    return None


def _llama_cpp_runtime_probe_for_comfyd():
    import json
    import subprocess

    code = r"""
import ctypes
import json
from pathlib import Path

required_handlers = [
    "Gemma3ChatHandler",
    "Gemma4ChatHandler",
    "MiniCPMv45ChatHandler",
    "MiniCPMV46ChatHandler",
    "MTMDChatHandler",
    "Qwen3VLChatHandler",
    "Qwen35ChatHandler",
]
result = {
    "ok": False,
    "handlers": [],
    "missing_handlers": [],
    "gpu_offload": False,
    "cuda_backend_present": False,
}
try:
    import llama_cpp
    import llama_cpp.llama_cpp as llama_cpp_lib
    import llama_cpp.llama_chat_format as chat_format

    result["version"] = getattr(llama_cpp, "__version__", "")
    result["handlers"] = [name for name in required_handlers if hasattr(chat_format, name)]
    result["missing_handlers"] = [name for name in required_handlers if not hasattr(chat_format, name)]
    lib_dir = Path(llama_cpp_lib.__file__).resolve().parent / "lib"
    result["cuda_backend_present"] = any(
        path.is_file()
        for pattern in ("ggml-cuda.dll", "libggml-cuda.so", "libggml-cuda.dylib")
        for path in lib_dir.glob(pattern)
    )
    backend_init = getattr(llama_cpp, "llama_backend_init", None)
    if callable(backend_init):
        backend_init()
    backend_loader = getattr(llama_cpp, "ggml_backend_load_all_from_path", None)
    if callable(backend_loader) and lib_dir.is_dir():
        backend_loader(ctypes.c_char_p(str(lib_dir).encode("utf-8")))
    registry_count = getattr(llama_cpp, "ggml_backend_reg_count", None)
    if callable(registry_count):
        result["backend_registry_count"] = int(registry_count())
    gpu_probe = getattr(llama_cpp, "llama_supports_gpu_offload", None)
    result["gpu_offload"] = bool(gpu_probe()) if callable(gpu_probe) else False
    result["ok"] = not result["missing_handlers"] and result["gpu_offload"]
    if result["missing_handlers"]:
        result["error"] = "missing handlers: " + ", ".join(result["missing_handlers"])
    elif not result["gpu_offload"]:
        result["error"] = "llama.cpp library was built without GPU offload"
except Exception as exc:
    result["error"] = f"{type(exc).__name__}: {exc}"
print("SIMPAI_LLAMA_CPP_PROBE=" + json.dumps(result, ensure_ascii=False))
"""
    probe_env = _pip_env()
    if platform.system() == "Windows":
        torch_lib = _torch_lib_dir_noimport()
        if torch_lib:
            current_path = probe_env.get("PATH", "")
            probe_env["PATH"] = torch_lib + (os.pathsep + current_path if current_path else "")
    try:
        result = subprocess.run(
            [sys.executable, "-s", "-X", "utf8", "-c", code],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=probe_env,
            timeout=60,
        )
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

    output = f"{result.stdout or ''}\n{result.stderr or ''}"
    for line in output.splitlines():
        if not line.startswith("SIMPAI_LLAMA_CPP_PROBE="):
            continue
        try:
            return json.loads(line.split("=", 1)[1])
        except Exception:
            break
    return {"ok": False, "error": output.strip()[-1200:]}


def _cleanup_legacy_llama_cpp_wheel_cache_for_comfyd():
    cache_dir = os.path.join(target_dir, "cache", "llama_cpp")
    if not os.path.isdir(cache_dir):
        return
    for name in os.listdir(cache_dir):
        lowered = name.lower()
        if not lowered.startswith("llama_cpp_python-") or not lowered.endswith((".whl", ".whl.part")):
            continue
        path = os.path.join(cache_dir, name)
        if not os.path.isfile(path):
            continue
        try:
            os.remove(path)
        except Exception as exc:
            print(f"[Comfyd] Could not remove legacy llama.cpp wheel cache / 无法清理旧 llama.cpp wheel 缓存: {path} / {exc}")
    try:
        os.rmdir(cache_dir)
    except OSError:
        pass


def install_llama_cpp_runtime_for_comfyd():
    if os.environ.get("SIMPAI_SKIP_LLAMA_CPP_RUNTIME", "").strip().lower() in {"1", "true", "yes"}:
        print("[Comfyd] llama.cpp runtime check skipped / 已跳过 llama.cpp 运行环境检查。")
        return False

    _cleanup_legacy_llama_cpp_wheel_cache_for_comfyd()
    torch_version = _torch_version_noimport()
    if "+cu" not in torch_version.lower():
        print("[Comfyd] NVIDIA CUDA runtime is unavailable; skipping llama.cpp CUDA wheel / 当前不是 NVIDIA CUDA 运行环境，已跳过 llama.cpp CUDA wheel。")
        return False

    artifact = select_llama_cpp_wheel()
    if not artifact:
        print(
            "[Comfyd] No packaged llama.cpp wheel for this platform / 当前平台没有可用的 llama.cpp wheel: "
            f"system={platform.system()}, machine={platform.machine()}, Python={sys.version_info.major}.{sys.version_info.minor}"
        )
        return False

    installed_version = _installed_package_version("llama-cpp-python")
    if llama_cpp_version_matches(installed_version, artifact):
        probe = _llama_cpp_runtime_probe_for_comfyd()
        if probe.get("ok"):
            print(
                "[Comfyd] llama.cpp VLM runtime is ready / llama.cpp VLM 运行环境已就绪: "
                f"{installed_version} ({artifact['cuda_tag']})"
            )
            return True
        if probe.get("cuda_backend_present") and not probe.get("missing_handlers"):
            print(
                "[Comfyd] llama.cpp CUDA backend failed to initialize; identical reinstall skipped / "
                "llama.cpp CUDA backend 初始化失败，已跳过相同 wheel 的重复安装: "
                f"{probe.get('error') or 'runtime probe failed'}"
            )
            return False
        print(
            "[Comfyd] llama.cpp runtime verification failed; reinstalling / "
            f"llama.cpp 运行环境检查失败，正在重新安装: {probe.get('error') or 'runtime probe failed'}"
        )
    else:
        print(
            "[Comfyd] Updating llama.cpp VLM runtime / 正在更新 llama.cpp VLM 运行环境: "
            f"{installed_version or 'missing'} -> {artifact['version']}"
        )

    import subprocess

    install_url = f"{artifact['url']}#sha256={artifact['sha256']}"
    command = [
        sys.executable,
        "-s",
        "-m",
        "pip",
        "install",
        "--no-deps",
        "--force-reinstall",
        "--no-cache-dir",
        install_url,
    ]
    result = subprocess.run(command, check=False, env=_pip_env())
    if result.returncode != 0:
        print(
            "[Comfyd] llama.cpp VLM runtime installation failed / llama.cpp VLM 运行环境安装失败: "
            f"exit_code={result.returncode}"
        )
        return False

    installed_version = _installed_package_version("llama-cpp-python")
    probe = _llama_cpp_runtime_probe_for_comfyd()
    ready = llama_cpp_version_matches(installed_version, artifact) and bool(probe.get("ok"))
    if not ready:
        verification_error = probe.get("error")
        if not llama_cpp_version_matches(installed_version, artifact):
            verification_error = f"package version mismatch ({installed_version or 'missing'})"
        print(
            "[Comfyd] llama.cpp VLM runtime verification failed / llama.cpp VLM 运行环境安装后检查失败: "
            f"version={installed_version}, expected={artifact['version']}, error={verification_error or 'runtime probe failed'}"
        )
        return False

    print(
        "[Comfyd] llama.cpp VLM runtime installed / llama.cpp VLM 运行环境安装完成: "
        f"{installed_version}"
    )
    return True


def install_requirements_sequential():
    requirements_path = os.path.join(os.path.dirname(os.path.realpath(__file__)), "requirements.txt")
    if not os.path.isfile(requirements_path):
        return None

    import subprocess
    import importlib.metadata

    try:
        import packaging.requirements
        import packaging.version
    except Exception as e:
        print(f"[Comfyd] requirements check skipped (packaging missing): {e}")
        return None

    python_exe = sys.executable
    timeout_seconds = int(os.environ.get("COMFY_REQUIREMENTS_INSTALL_TIMEOUT", "300"))
    index_url = os.environ.get("INDEX_URL", "https://mirrors.aliyun.com/pypi/simple")
    extra_index_url = os.environ.get("EXTRA_INDEX_URL", "https://pypi.tuna.tsinghua.edu.cn/simple")

    force_reinstall_names = set()
    try:
        importlib.metadata.version('aiohttp')
    except importlib.metadata.PackageNotFoundError:
        force_reinstall_names.add("aiohttp")
    except Exception:
        force_reinstall_names.add("aiohttp")

    def is_requirement_satisfied(req_line: str) -> bool:
        try:
            req = packaging.requirements.Requirement(req_line)
            if req.name in force_reinstall_names:
                return False
            installed_version = importlib.metadata.version(req.name)
            if not req.specifier:
                return True
            return req.specifier.contains(packaging.version.parse(installed_version), prereleases=True)
        except importlib.metadata.PackageNotFoundError:
            return False
        except Exception:
            return False

    requirements_to_install = []
    with open(requirements_path, "r", encoding="utf8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith("#"):
                continue
            if line.startswith(("--", "-r ")):
                continue
            if "#" in line:
                line = line.split("#", 1)[0].strip()
                if not line:
                    continue
            if not is_requirement_satisfied(line):
                try:
                    req = packaging.requirements.Requirement(line)
                    requirements_to_install.append((line, req.name in force_reinstall_names))
                except Exception:
                    requirements_to_install.append((line, False))

    if not requirements_to_install:
        return None

    for req_line, force_reinstall in requirements_to_install:
        try:
            print(f"[Comfyd] Installing requirement: {req_line}")
            cmd = [python_exe]
            if sys.flags.no_user_site or ("python_embeded" in python_exe) or ("python_embedded" in python_exe):
                cmd.append("-s")
            cmd += ["-m", "pip", "install", "-U", "--upgrade-strategy", "only-if-needed"]
            if force_reinstall:
                cmd.append("--force-reinstall")
            cmd += [req_line, "--prefer-binary"]

            if index_url:
                cmd += ["--index-url", index_url]
            if extra_index_url:
                cmd += ["--extra-index-url", extra_index_url]

            subprocess.run(cmd, check=False, timeout=timeout_seconds)
        except subprocess.TimeoutExpired:
            print(f"[Comfyd] Requirement install timed out: {req_line}")
        except Exception as e:
            print(f"[Comfyd] Requirement install failed: {req_line} / {e}")

    return None

if __name__ == "__main__":
    try:
        install_requirements_sequential()
    except Exception as e:
        print(f"[Comfyd] Requirements install step failed: {e}")
    try:
        install_onnxruntime_gpu_cuda13_for_comfyd()
    except Exception as e:
        print(f"[Comfyd] ONNX Runtime CUDA 13 install step failed: {e}")
    try:
        install_llama_cpp_runtime_for_comfyd()
    except Exception as e:
        print(f"[Comfyd] llama.cpp runtime install step failed / llama.cpp 运行环境安装步骤失败: {e}")

import comfy.options
comfy.options.enable_args_parsing()

from comfy.cli_args import args, enables_dynamic_vram, get_console_log_level, get_file_log_outputs

if args.list_feature_flags:
    import json
    from comfy_api.feature_flags import CLI_FEATURE_FLAG_REGISTRY
    print(json.dumps(CLI_FEATURE_FLAG_REGISTRY, indent=2))  # noqa: T201
    raise SystemExit(0)

import importlib.util
import shutil
import importlib.metadata
import folder_paths
import time
from app.logger import setup_logger
from app.assets.seeder import asset_seeder
from app.assets.services import register_output_files
import itertools
import utils.extra_config
import simpai_extra_paths
from utils.mime_types import init_mime_types
import faulthandler
import logging
import signal
import sys
from comfy_execution.progress import get_progress_state
from comfy_execution.utils import get_executing_context
from comfy_api import feature_flags
from app.database.db import init_db, dependencies_available

if __name__ == "__main__":
    os.environ['TORCH_ROCM_AOTRITON_ENABLE_EXPERIMENTAL'] = '1'
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    os.environ['DO_NOT_TRACK'] = '1'

console_log_level = get_console_log_level(args.verbose)
file_log_outputs = get_file_log_outputs(args.verbose)
setup_logger(log_level=console_log_level, file_outputs=file_log_outputs, use_stdout=args.log_stdout)

faulthandler.enable(file=sys.stderr, all_threads=args.debug_hang)
if __name__ == "__main__" and args.debug_hang:
    dumping_traceback = False

    def dump_traceback_on_sigint(signum, frame):
        global dumping_traceback
        if dumping_traceback:
            raise KeyboardInterrupt
        dumping_traceback = True
        faulthandler.dump_traceback(file=sys.stderr, all_threads=True)
        raise KeyboardInterrupt

    signal.signal(signal.SIGINT, dump_traceback_on_sigint)

import comfy_aimdo.control

if enables_dynamic_vram():
    simple_vram_headroom = None if args.reserve_vram is None else int(args.reserve_vram * 1024 ** 3)
    try:
        comfy_aimdo.control.init(simple_vram_headroom=simple_vram_headroom, nvml_pressure=not args.disable_nvml_pressure)
    except TypeError:
        # comfy-aimdo 0.4.10 protocol.
        try:
            comfy_aimdo.control.init(simple_vram_headroom=simple_vram_headroom)
        except TypeError:
            # comfy-aimdo 0.4.9 protocol.
            comfy_aimdo.control.init()

if os.name == "nt":
    os.environ['MIMALLOC_PURGE_DELAY'] = '0'

if __name__ == "__main__":
    os.environ['TORCH_ROCM_AOTRITON_ENABLE_EXPERIMENTAL'] = '1'
    if args.default_device is not None:
        default_dev = args.default_device
        devices = list(range(32))
        devices.remove(default_dev)
        devices.insert(0, default_dev)
        devices = ','.join(map(str, devices))
        os.environ['CUDA_VISIBLE_DEVICES'] = str(devices)
        os.environ['HIP_VISIBLE_DEVICES'] = str(devices)

    if args.cuda_device is not None:
        os.environ['CUDA_VISIBLE_DEVICES'] = str(args.cuda_device)
        os.environ['HIP_VISIBLE_DEVICES'] = str(args.cuda_device)
        os.environ["ASCEND_RT_VISIBLE_DEVICES"] = str(args.cuda_device)
        logging.info("Set cuda device to: {}".format(args.cuda_device))

    if args.oneapi_device_selector is not None:
        os.environ['ONEAPI_DEVICE_SELECTOR'] = args.oneapi_device_selector
        logging.info("Set oneapi device selector to: {}".format(args.oneapi_device_selector))

    if args.deterministic:
        if 'CUBLAS_WORKSPACE_CONFIG' not in os.environ:
            os.environ['CUBLAS_WORKSPACE_CONFIG'] = ":4096:8"

    import cuda_malloc
    if "rocm" in cuda_malloc.get_torch_version_noimport():
        os.environ['OCL_SET_SVM_SIZE'] = '262144'  # set at the request of AMD


def handle_comfyui_manager_unavailable():
    manager_req_path = os.path.join(os.path.dirname(os.path.abspath(folder_paths.__file__)), "manager_requirements.txt")
    uv_available = shutil.which("uv") is not None

    pip_cmd = f"{sys.executable} -m pip install -r {manager_req_path}"
    msg = f"\n\nTo use the `--enable-manager` feature, the `comfyui-manager` package must be installed first.\ncommand:\n\t{pip_cmd}"
    if uv_available:
        msg += f"\nor using uv:\n\tuv pip install -r {manager_req_path}"
    msg += "\n"
    logging.warning(msg)
    args.enable_manager = False


if args.enable_manager:
    if importlib.util.find_spec("comfyui_manager"):
        import comfyui_manager

        if not comfyui_manager.__file__ or not comfyui_manager.__file__.endswith('__init__.py'):
            handle_comfyui_manager_unavailable()
    else:
        handle_comfyui_manager_unavailable()


def write_simpai_extra_model_paths_from_config(yaml_path):
    return simpai_extra_paths.write_simpai_extra_model_paths_from_config(yaml_path)


def apply_custom_paths():
    # extra model paths
    extra_model_paths_config_path = os.path.join(os.path.dirname(os.path.realpath(__file__)), "extra_model_paths.yaml")
    write_simpai_extra_model_paths_from_config(extra_model_paths_config_path)
    if os.path.isfile(extra_model_paths_config_path):
        utils.extra_config.load_extra_path_config(extra_model_paths_config_path)

    if args.extra_model_paths_config:
        for config_path in itertools.chain(*args.extra_model_paths_config):
            utils.extra_config.load_extra_path_config(config_path)

    # --base-directory
    if args.base_directory:
        logging.info(f"Setting base directory to: {folder_paths.base_path}")

    # --models-directory
    if args.models_directory:
        logging.info(f"Setting models directory to: {folder_paths.models_dir}")

    # --output-directory, --input-directory, --user-directory
    if args.output_directory:
        output_dir = os.path.abspath(args.output_directory)
        # 检查目录是否存在，如果不存在则创建
        if not os.path.exists(output_dir):
            try:
                os.makedirs(output_dir)
                logging.info(f"Created output directory: {output_dir}")
            except Exception as e:
                logging.error(f"Failed to create output directory {output_dir}: {e}")
        logging.info(f"Setting output directory to: {output_dir}")
        folder_paths.set_output_directory(output_dir)
    # These are the default folders that checkpoints, clip and vae models will be saved to when using CheckpointSave, etc.. nodes
    folder_paths.add_model_folder_path("checkpoints", os.path.join(folder_paths.get_output_directory(), "checkpoints"))
    folder_paths.add_model_folder_path("clip", os.path.join(folder_paths.get_output_directory(), "clip"))
    folder_paths.add_model_folder_path("vae", os.path.join(folder_paths.get_output_directory(), "vae"))
    folder_paths.add_model_folder_path("diffusion_models", os.path.join(folder_paths.get_output_directory(), "diffusion_models"))
    folder_paths.add_model_folder_path("loras", os.path.join(folder_paths.get_output_directory(), "loras"))

    if args.input_directory:
        input_dir = os.path.abspath(args.input_directory)
        logging.info(f"Setting input directory to: {input_dir}")
        folder_paths.set_input_directory(input_dir)

    if args.user_directory:
        user_dir = os.path.abspath(args.user_directory)
        logging.info(f"Setting user directory to: {user_dir}")
        folder_paths.set_user_directory(user_dir)
def execute_prestartup_script():
    if args.disable_all_custom_nodes and len(args.whitelist_custom_nodes) == 0:
        return

    def execute_script(script_path):
        module_name = os.path.splitext(script_path)[0]
        try:
            spec = importlib.util.spec_from_file_location(module_name, script_path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return True
        except Exception as e:
            logging.error(f"Failed to execute startup-script: {script_path} / {e}")
        return False

    node_paths = folder_paths.get_folder_paths("custom_nodes")
    for custom_node_path in node_paths:
        possible_modules = os.listdir(custom_node_path)
        node_prestartup_times = []

        for possible_module in possible_modules:
            module_path = os.path.join(custom_node_path, possible_module)
            if os.path.isfile(module_path) or module_path.endswith(".disabled") or module_path == "__pycache__":
                continue

            if args.enable_manager:
                if comfyui_manager.should_be_disabled(module_path):
                    continue

            script_path = os.path.join(module_path, "prestartup_script.py")
            if os.path.exists(script_path):
                if args.disable_all_custom_nodes and possible_module not in args.whitelist_custom_nodes:
                    logging.info(f"Prestartup Skipping {possible_module} due to disable_all_custom_nodes and whitelist_custom_nodes")
                    continue
                time_before = time.perf_counter()
                success = execute_script(script_path)
                node_prestartup_times.append((time.perf_counter() - time_before, module_path, success))
    if len(node_prestartup_times) > 0:
        logging.info("\nPrestartup times for custom nodes:")
        for n in sorted(node_prestartup_times):
            if n[2]:
                import_message = ""
            else:
                import_message = " (PRESTARTUP FAILED)"
            logging.info("{:6.1f} seconds{}: {}".format(n[0], import_message, n[1]))
        logging.info("")

apply_custom_paths()
init_mime_types()

if args.enable_manager:
    comfyui_manager.prestartup()

execute_prestartup_script()

# Main code
import asyncio
import shutil
import threading
import gc

if 'torch' in sys.modules:
    logging.warning("WARNING: Potential Error in code: Torch already imported, torch should never be imported before this point.")


import comfy.utils

import execution
import server
from protocol import BinaryEventTypes
import nodes
import comfy.model_management
import comfyui_version
import app.logger
import hook_breaker_ac10a0

import comfy.memory_management
import comfy.model_patcher

if args.enable_dynamic_vram or (enables_dynamic_vram() and comfy.model_management.is_nvidia() and not comfy.model_management.is_wsl()):
    if (not args.enable_dynamic_vram) and (comfy.model_management.torch_version_numeric < (2, 8)):
        logging.warning("Unsupported Pytorch detected. DynamicVRAM support requires Pytorch version 2.8 or later. Falling back to legacy ModelPatcher. VRAM estimates may be unreliable especially on Windows")
    else:
        try:
            aimdo_initialized = comfy_aimdo.control.init_devices((d.index, int(args.vram_headroom * 1024 ** 3)) for d in comfy.model_management.get_all_torch_devices())
        except TypeError:
            # comfy-aimdo 0.4.9 protocol.
            aimdo_initialized = comfy_aimdo.control.init_devices(d.index for d in comfy.model_management.get_all_torch_devices())

        if aimdo_initialized:
            if console_log_level == 'DEBUG':
                comfy_aimdo.control.set_log_debug()
            elif console_log_level == 'DETAIL':
                try:
                    comfy_aimdo.control.set_log_detail()
                except AttributeError:
                    comfy_aimdo.control.set_log_info()
            elif console_log_level == 'CRITICAL':
                comfy_aimdo.control.set_log_critical()
            elif console_log_level == 'ERROR':
                comfy_aimdo.control.set_log_error()
            elif console_log_level == 'WARNING':
                comfy_aimdo.control.set_log_warning()
            else: #INFO
                comfy_aimdo.control.set_log_info()

            comfy.model_patcher.CoreModelPatcher = comfy.model_patcher.ModelPatcherDynamic
            comfy.memory_management.aimdo_enabled = True
            logging.info("DynamicVRAM support detected and enabled")
        else:
            logging.warning("No working comfy-aimdo install detected. DynamicVRAM support disabled. Falling back to legacy ModelPatcher. VRAM estimates may be unreliable especially on Windows")


def cuda_malloc_warning():
    device = comfy.model_management.get_torch_device()
    device_name = comfy.model_management.get_torch_device_name(device)
    cuda_malloc_warning = False
    if "cudaMallocAsync" in device_name:
        for b in cuda_malloc.blacklist:
            if b in device_name:
                cuda_malloc_warning = True
        if cuda_malloc_warning:
            logging.warning("\nWARNING: this card most likely does not support cuda-malloc, if you get \"CUDA error\" please run ComfyUI with: --disable-cuda-malloc\n")

def _collect_output_absolute_paths(history_result: dict) -> list[str]:
    """Extract absolute file paths for output items from a history result."""
    paths: list[str] = []
    seen: set[str] = set()
    for node_output in history_result.get("outputs", {}).values():
        for items in node_output.values():
            if not isinstance(items, list):
                continue
            for item in items:
                if not isinstance(item, dict):
                    continue
                item_type = item.get("type")
                if item_type not in ("output", "temp"):
                    continue
                base_dir = folder_paths.get_directory_by_type(item_type)
                if base_dir is None:
                    continue
                base_dir = os.path.abspath(base_dir)
                filename = item.get("filename")
                if not filename:
                    continue
                abs_path = os.path.abspath(
                    os.path.join(base_dir, item.get("subfolder", ""), filename)
                )
                if not abs_path.startswith(base_dir + os.sep) and abs_path != base_dir:
                    continue
                if abs_path not in seen:
                    seen.add(abs_path)
                    paths.append(abs_path)
    return paths

def prompt_worker(q, server_instance):
    current_time: float = 0.0
    cache_ram = 0
    cache_ram_inactive = 0
    if not args.cache_classic and not args.cache_none and args.cache_lru <= 0:
        cache_ram = min(10.0, max(2.0, comfy.model_management.total_ram * 0.10 / 1024.0))
        cache_ram_inactive = min(128.0, comfy.model_management.total_ram / 1024.0)
        if len(args.cache_ram) > 0:
            cache_ram = args.cache_ram[0]
        if len(args.cache_ram) > 1:
            cache_ram_inactive = args.cache_ram[1]

    cache_type = execution.CacheType.RAM_PRESSURE
    if args.cache_classic:
        cache_type = execution.CacheType.CLASSIC
    elif args.cache_lru > 0:
        cache_type = execution.CacheType.LRU
    elif args.cache_none:
        cache_type = execution.CacheType.NONE

    e = execution.PromptExecutor(server_instance, cache_type=cache_type, cache_args={ "lru" : args.cache_lru, "ram" : cache_ram, "ram_inactive" : cache_ram_inactive } )
    last_gc_collect = 0
    need_gc = False
    gc_collect_interval = 10.0

    while True:
        timeout = 1000.0
        if need_gc:
            timeout = max(gc_collect_interval - (current_time - last_gc_collect), 0.0)

        queue_item = q.get(timeout=timeout)
        if queue_item is not None:
            item, item_id = queue_item
            execution_start_time = time.perf_counter()
            prompt_id = item[1]
            server_instance.last_prompt_id = prompt_id

            sensitive = item[5]
            extra_data = item[3].copy()
            for k in sensitive:
                extra_data[k] = sensitive[k]

            asset_seeder.pause()
            try:
                import torch
                if torch.cuda.is_available() and torch.backends.cudnn.is_available() and torch.backends.cudnn.benchmark:
                    logging.info("Forcing torch.backends.cudnn.benchmark = False before prompt execution.")
                    torch.backends.cudnn.benchmark = False
            except Exception:
                pass
            e.execute(item[2], prompt_id, extra_data, item[4])
            try:
                import torch
                if torch.cuda.is_available() and torch.backends.cudnn.is_available() and torch.backends.cudnn.benchmark:
                    logging.warning("torch.backends.cudnn.benchmark was re-enabled during prompt execution. Forcing it back to False.")
                    torch.backends.cudnn.benchmark = False
            except Exception:
                pass
            need_gc = True

            remove_sensitive = lambda prompt: prompt[:5] + prompt[6:]
            q.task_done(item_id,
                        e.history_result,
                        status=execution.PromptQueue.ExecutionStatus(
                            status_str='success' if e.success else 'error',
                            completed=e.success,
                            messages=e.status_messages), process_item=remove_sensitive)
            if server_instance.client_id is not None:
                server_instance.send_sync("executing", {"node": None, "prompt_id": prompt_id}, server_instance.client_id)

            current_time = time.perf_counter()
            execution_time = current_time - execution_start_time

            # Log Time in a more readable way after 10 minutes
            if execution_time > 600:
                execution_time = time.strftime("%H:%M:%S", time.gmtime(execution_time))
                logging.info(f"Prompt executed in {execution_time}")
            else:
                logging.info("Prompt executed in {:.2f} seconds".format(execution_time))

            if not asset_seeder.is_disabled():
                paths = _collect_output_absolute_paths(e.history_result)
                register_output_files(paths, job_id=prompt_id)

        flags = q.get_flags()
        free_memory = flags.get("free_memory", False)

        if flags.get("unload_models", free_memory):
            comfy.model_management.unload_all_models()
            need_gc = True
            last_gc_collect = 0

        if free_memory:
            e.reset()
            need_gc = True
            last_gc_collect = 0

        if need_gc:
            current_time = time.perf_counter()
            if (current_time - last_gc_collect) > gc_collect_interval:
                gc.collect()
                comfy.model_management.soft_empty_cache()
                last_gc_collect = current_time
                need_gc = False
                hook_breaker_ac10a0.restore_functions()

                if not asset_seeder.is_disabled():
                    asset_seeder.enqueue_enrich(roots=("output",), compute_hashes=args.enable_asset_hashing)
                asset_seeder.resume()


async def run(server_instance, address='', port=8188, verbose=True, call_on_start=None):
    addresses = []
    for addr in address.split(","):
        addresses.append((addr, port))
    await asyncio.gather(
        server_instance.start_multi_address(addresses, call_on_start, verbose), server_instance.publish_loop()
    )

def hijack_progress(server_instance):
    def hook(value, total, preview_image, prompt_id=None, node_id=None):
        executing_context = get_executing_context()
        if prompt_id is None and executing_context is not None:
            prompt_id = executing_context.prompt_id
        if node_id is None and executing_context is not None:
            node_id = executing_context.node_id
        comfy.model_management.throw_exception_if_processing_interrupted()
        if prompt_id is None:
            prompt_id = server_instance.last_prompt_id
        if node_id is None:
            node_id = server_instance.last_node_id
        progress = {"value": value, "max": total, "prompt_id": prompt_id, "node": node_id}
        get_progress_state().update_progress(node_id, value, total, preview_image)

        server_instance.send_sync("progress", progress, server_instance.client_id)
        if preview_image is not None:
            if isinstance(preview_image, tuple) and len(preview_image) >= 2 and preview_image[0] in ["WEBM", "MP4"]:
                server_instance.send_sync(BinaryEventTypes.PREVIEW_VIDEO, preview_image, server_instance.client_id)
            else:
                # Only send old method if client doesn't support preview metadata
                if not feature_flags.supports_feature(
                    server_instance.sockets_metadata,
                    server_instance.client_id,
                    "supports_preview_metadata",
                ):
                    server_instance.send_sync(
                        BinaryEventTypes.UNENCODED_PREVIEW_IMAGE,
                        preview_image,
                        server_instance.client_id,
                    )

    comfy.utils.set_progress_bar_global_hook(hook)

def cleanup_temp():
    temp_dir = folder_paths.get_temp_directory()
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir, ignore_errors=True)

def setup_database():
    try:
        if dependencies_available():
            init_db()
            if args.enable_assets:
                if asset_seeder.start(roots=("models", "input", "output"), prune_first=True, compute_hashes=args.enable_asset_hashing):
                    logging.info("Background asset scan initiated for models, input, output")
    except Exception as e:
        if "database is locked" in str(e):
            logging.error(
                "Database is locked. Another ComfyUI process is already using this database.\n"
                "To resolve this, specify a separate database file for this instance:\n"
                "  --database-url sqlite:///path/to/another.db"
            )
            sys.exit(1)
        if args.enable_assets:
            logging.error(
                f"Failed to initialize database: {e}\n"
                "The --enable-assets flag requires a working database connection.\n"
                "To resolve this, try one of the following:\n"
                "  1. Install the latest requirements: pip install -r requirements.txt\n"
                "  2. Specify an alternative database URL: --database-url sqlite:///path/to/your.db\n"
                "  3. Use an in-memory database: --database-url sqlite:///:memory:"
            )
            sys.exit(1)
        logging.error(f"Failed to initialize database. Please ensure you have installed the latest requirements. If the error persists, please report this as in future the database will be required: {e}")

def start_comfyui(asyncio_loop=None):
    """
    Starts the ComfyUI server using the provided asyncio event loop or creates a new one.
    Returns the event loop, server instance, and a function to start the server asynchronously.
    """
    if args.temp_directory:
        temp_dir = os.path.join(os.path.abspath(args.temp_directory), "temp")
        logging.info(f"Setting temp directory to: {temp_dir}")
        folder_paths.set_temp_directory(temp_dir)
    cleanup_temp()

    if args.windows_standalone_build:
        try:
            import new_updater
            new_updater.update_windows_updater()
        except:
            pass

    if not asyncio_loop:
        asyncio_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(asyncio_loop)
    prompt_server = server.PromptServer(asyncio_loop)

    if args.enable_manager and not args.disable_manager_ui:
        comfyui_manager.start()

    hook_breaker_ac10a0.save_functions()
    asyncio_loop.run_until_complete(nodes.init_extra_nodes(
        init_custom_nodes=(not args.disable_all_custom_nodes) or len(args.whitelist_custom_nodes) > 0,
        init_api_nodes=not args.disable_api_nodes
    ))

    # Re-apply Comfy's cuDNN benchmark policy after custom-node imports. Benchmark
    # mode can request near-card-sized autotune workspaces, and some custom nodes set it at import time.
    comfy.model_management.set_cudnn_benchmark()

    hook_breaker_ac10a0.restore_functions()

    cuda_malloc_warning()
    setup_database()

    prompt_server.add_routes()
    hijack_progress(prompt_server)

    threading.Thread(target=prompt_worker, daemon=True, args=(prompt_server.prompt_queue, prompt_server,)).start()

    if args.quick_test_for_ci:
        exit(0)

    os.makedirs(folder_paths.get_temp_directory(), exist_ok=True)
    call_on_start = None
    if args.auto_launch:
        def startup_server(scheme, address, port):
            import webbrowser
            if os.name == 'nt' and address == '0.0.0.0':
                address = '127.0.0.1'
            if ':' in address:
                address = "[{}]".format(address)
            webbrowser.open(f"{scheme}://{address}:{port}")
        call_on_start = startup_server

    async def start_all():
        await prompt_server.setup()

        # Auto-find free port
        import socket
        test_ip = args.listen.split(",")[0]
        original_port = args.port
        while True:
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.bind((test_ip, args.port))
                break
            except OSError as e:
                # 13: Permission denied (excluded port), 98/10048: Address in use
                if e.errno in (13, 98, 10048, 10013): 
                    logging.warning(f"Port {args.port} is not available (Errno {e.errno}), trying {args.port+1}")
                    args.port += 1
                else:
                    raise e
        
        if args.port != original_port:
             logging.info(f"Port automatically switched from {original_port} to {args.port}")

        await run(prompt_server, address=args.listen, port=args.port, verbose=not args.dont_print_server, call_on_start=call_on_start)

    # Returning these so that other code can integrate with the ComfyUI loop and server
    return asyncio_loop, prompt_server, start_all

if __name__ == "__main__":
    # Running directly, just start ComfyUI.
    logging.info("Python version: {}".format(sys.version))
    logging.info("ComfyUI version: {}".format(comfyui_version.__version__))
    logging.info("┌────────────────────────────────────────────────┐")
    logging.info("         启动SimpAI_Comfyd后端工作流模式          ")
    logging.info("         内置节点与工作流均为专属适配版本         ")
    logging.info("         随意增删节点导致的报错需自行处理         ")
    logging.info("└────────────────────────────────────────────────┘")
    logging.info("请确保已安装git，否则会导致管理器和采样预览失效：https://git-scm.com/install/windows")
    logging.info("")
    for package in ("comfy-aimdo", "comfy-kitchen"):
        try:
            logging.info("{} version: {}".format(package, importlib.metadata.version(package)))
        except:
            pass
    if sys.version_info.major == 3 and sys.version_info.minor < 10:
        logging.warning("WARNING: You are using a python version older than 3.10, please upgrade to a newer one. 3.12 and above is recommended.")

    if args.disable_dynamic_vram:
        logging.warning(
            "Dynamic vram disabled with argument. If you have any issues with "
            "dynamic vram enabled please give us a detailed reports as this "
            "argument will be removed soon. If you use gguf we recommend keeping "
            "dynamic vram enabled and using native ComfyUI model formats instead. "
            "ComfyUI native formats like fp8 will be faster even if they are larger than your memory."
        )

    event_loop, _, start_all_func = start_comfyui()
    try:
        x = start_all_func()
        app.logger.print_startup_warnings()
        event_loop.run_until_complete(x)
    except KeyboardInterrupt:
        logging.info("\nStopped server")
    finally:
        asset_seeder.shutdown()
        cleanup_temp()
