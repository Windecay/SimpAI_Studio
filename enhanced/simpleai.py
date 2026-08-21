import os
import sys
import shutil
import re
import json
import copy
import getpass
import importlib.util
import gradio as gr
import shared
import cv2
import args_manager
import modules.util as util
import modules.comfy_prompt_compat as comfy_prompt_compat
import enhanced.all_parameters as ads
import simpleai_base.p2p_task as p2p_task
from build_launcher import is_win32_standalone_build
from simpleai_base import simpleai_base, utils, comfyd, torch_version, xformers_version, comfyclient_pipeline
from simpleai_base.params_mapper import ComfyTaskParams
from simpleai_base.comfyclient_pipeline import get_media_info
from simpleai_base.models_info import ModelsInfo, sync_model_info
from simpleai_base.simpleai_base import export_identity_qrcode_svg, import_identity_qrcode
import socket
import logging
import psutil
from enhanced.logger import format_name
from ui.update_helpers import gr_update
from modules.access_mode import is_local_mode
logger = logging.getLogger(format_name(__name__))

comfy_prompt_compat.install_queue_prompt_normalizer(comfyclient_pipeline)
comfy_prompt_compat.install_prompt_cancel_support(comfyclient_pipeline)

def is_advanced_logs_enabled():
    return ads.get_admin_default('advanced_logs')


utils.echo_off = not is_advanced_logs_enabled()
args_comfyd = [[]]
modelsinfo_filename = 'models_info.json'


_NativeComfyTaskParams = ComfyTaskParams


def _workflow_file_names(flow_name):
    flow_name = str(flow_name or '').strip()
    if not flow_name:
        return []
    if flow_name.lower().endswith('.json'):
        return [flow_name]
    return [f'{flow_name}_api.json', f'{flow_name}.json']


def _path_error_text(error):
    if isinstance(error, PermissionError):
        return f'{type(error).__name__}: {error}'
    if isinstance(error, FileNotFoundError):
        return f'{type(error).__name__}: {error}'
    return f'{type(error).__name__}: {error}'


def _probe_workflow_path(path):
    path = os.path.abspath(str(path))
    result = {
        'path': path,
        'exists': False,
        'size': None,
        'python_read': False,
        'extended_path_read': None,
        'parse': 'missing',
        'api_nodes': 0,
        'error': None,
    }
    try:
        file_stat = os.stat(path)
        result['exists'] = True
        result['size'] = file_stat.st_size
    except FileNotFoundError:
        return result
    except Exception as exc:
        result['parse'] = 'stat_error'
        result['error'] = _path_error_text(exc)
        return result

    try:
        with open(path, 'r', encoding='utf-8') as workflow_handle:
            workflow = json.load(workflow_handle)
        result['python_read'] = True
        result['parse'] = 'ok'
        if isinstance(workflow, dict):
            result['api_nodes'] = sum(
                1
                for node in workflow.values()
                if isinstance(node, dict) and node.get('class_type')
            )
        result['_workflow'] = workflow
    except Exception as exc:
        result['parse'] = 'read_error'
        result['error'] = _path_error_text(exc)

    if os.name == 'nt' and len(path) >= 2 and path[1] == ':':
        extended_path = f'\\\\?\\{path}'
        try:
            with open(extended_path, 'rb') as workflow_handle:
                workflow_handle.read(1)
            result['extended_path_read'] = True
        except Exception as exc:
            result['extended_path_read'] = _path_error_text(exc)
    return result


def _append_workflow_candidate(candidates, source, path):
    if not path:
        return
    normalized = os.path.abspath(str(path))
    if any(item['path'] == normalized for item in candidates):
        return
    candidates.append({'source': source, 'path': normalized})


def _workflow_candidates(flow_name, user_did):
    file_names = _workflow_file_names(flow_name)
    candidates = []
    token = getattr(shared, 'token', None)

    if token is not None and user_did:
        for file_name in file_names[:1]:
            try:
                _append_workflow_candidate(
                    candidates,
                    'user',
                    token.get_path_in_user_dir(user_did, os.path.join('workflows', file_name)),
                )
            except Exception as exc:
                logger.warning(
                    '[Generate][ComfyDebug] user workflow path lookup failed: did=%s error=%s',
                    user_did,
                    _path_error_text(exc),
                )

    if token is not None:
        for file_name in file_names:
            try:
                _append_workflow_candidate(
                    candidates,
                    'native_root',
                    token.get_path_in_root_dir('workflows', file_name),
                )
            except Exception as exc:
                logger.warning(
                    '[Generate][ComfyDebug] native workflow path lookup failed: file=%s error=%s',
                    file_name,
                    _path_error_text(exc),
                )

    for source, base in (
        ('shared_root', getattr(shared, 'root', '')),
        ('launcher_dir', os.path.dirname(os.path.abspath(sys.argv[0])) if sys.argv else ''),
        ('cwd', os.getcwd()),
    ):
        if not base:
            continue
        for file_name in file_names:
            _append_workflow_candidate(
                candidates,
                source,
                os.path.join(base, 'workflows', file_name),
            )
    return candidates


def _load_fallback_workflow(flow_name, user_did):
    probes = []
    selected = None
    for candidate in _workflow_candidates(flow_name, user_did):
        probe = _probe_workflow_path(candidate['path'])
        probe['source'] = candidate['source']
        probes.append(probe)
        if selected is None and probe.get('parse') == 'ok' and probe.get('api_nodes', 0) > 0:
            selected = probe

    diagnostics = {
        'user': getpass.getuser(),
        'pid': os.getpid(),
        'user_did': user_did,
        'workflow': str(flow_name or ''),
        'candidates': [
            {key: value for key, value in item.items() if key != '_workflow'}
            for item in probes
        ],
    }
    logger.warning('[Generate][ComfyDebug] workflow_read_probe=%s', diagnostics)
    if selected is None:
        return None, diagnostics
    return selected['_workflow'], diagnostics


def _apply_workflow_mapping(workflow, params, mapping):
    if not isinstance(workflow, dict):
        return None, {'reason': 'workflow_root_is_not_object'}
    if not isinstance(mapping, dict):
        return None, {'reason': 'mapping_is_not_object'}

    prompt = copy.deepcopy(workflow)
    applied = 0
    missing = []
    for param_key, targets in mapping.items():
        if param_key not in params:
            continue
        if isinstance(targets, str):
            targets = [targets]
        if not isinstance(targets, (list, tuple)):
            missing.append(f'{param_key}:invalid_targets')
            continue

        param_applied = False
        for target in targets:
            parts = str(target).split(':', 2)
            if len(parts) != 3:
                missing.append(f'{param_key}:{target}')
                continue
            class_type, title, input_name = parts
            for node_id, node in prompt.items():
                if not isinstance(node, dict):
                    continue
                if node.get('class_type') != class_type:
                    continue
                node_title = node.get('_meta', {}).get('title')
                if node_title != title and str(node_id) != title:
                    continue
                inputs = node.setdefault('inputs', {})
                inputs[input_name] = params[param_key]
                applied += 1
                param_applied = True
        if not param_applied:
            missing.append(param_key)

    api_nodes = sum(
        1
        for node in prompt.values()
        if isinstance(node, dict) and node.get('class_type')
    )
    if api_nodes == 0:
        return None, {'reason': 'workflow_has_no_api_nodes', 'mapping_keys': len(mapping)}
    return prompt, {
        'mapping_keys': len(mapping),
        'api_nodes': api_nodes,
        'applied': applied,
        'missing': missing[:20],
    }


class ComfyTaskParams(_NativeComfyTaskParams):
    """Use the native mapper first and keep generation working when file IO fails there."""

    def __init__(self, params, user_did=''):
        super().__init__(params, user_did)
        self._user_did = user_did

    def convert2comfy(self, flow_name):
        native_error = None
        try:
            converted = super().convert2comfy(flow_name)
            if isinstance(converted, dict) and converted:
                return converted
        except Exception as exc:
            converted = {}
            native_error = _path_error_text(exc)

        workflow, diagnostics = _load_fallback_workflow(flow_name, self._user_did)
        if workflow is None:
            logger.error(
                '[Generate][ComfyDebug] workflow conversion failed: native_error=%s diagnostics=%s',
                native_error,
                diagnostics,
            )
            return converted if isinstance(converted, dict) else {}

        try:
            workflow_json = json.dumps(workflow, ensure_ascii=False)
            mapping = self.get_key_mapped(workflow_json)
            params = self.get_params()
            fallback_prompt, mapping_info = _apply_workflow_mapping(workflow, params, mapping)
        except Exception as exc:
            logger.error(
                '[Generate][ComfyDebug] Python workflow fallback failed: error=%s diagnostics=%s',
                _path_error_text(exc),
                diagnostics,
            )
            return converted if isinstance(converted, dict) else {}

        if fallback_prompt is None:
            logger.error(
                '[Generate][ComfyDebug] Python workflow fallback produced no prompt: mapping_info=%s diagnostics=%s',
                mapping_info,
                diagnostics,
            )
            return converted if isinstance(converted, dict) else {}

        logger.warning(
            '[Generate][ComfyDebug] native workflow conversion returned empty; using Python workflow fallback: '
            'nodes=%s mapping_info=%s diagnostics=%s',
            len(fallback_prompt),
            mapping_info,
            diagnostics,
        )
        return fallback_prompt

def init_modelsinfo(models_root, path_map):
    global modelsinfo_filename
    models_info_path = os.path.abspath(os.path.join(models_root, modelsinfo_filename))
    if not shared.modelsinfo:
        shared.modelsinfo = ModelsInfo(models_info_path, path_map)
    return shared.modelsinfo

def get_best_local_ip():
    best_ip = '127.0.0.1'
    best_score = -10_000
    try:
        stats = psutil.net_if_stats()
        for interface, snics in psutil.net_if_addrs().items():
            interface_l = str(interface).lower()
            iface_stats = stats.get(interface)
            if iface_stats is not None and not iface_stats.isup:
                continue

            virtual_penalty = 0
            if any(k in interface_l for k in ("vethernet", "hyper-v", "wsl", "docker", "virtualbox", "vmware", "tailscale", "zerotier", "hamachi", "tap", "tun", "clash tunnel")):
                virtual_penalty = 80

            for snic in snics:
                if snic.family == socket.AF_INET:
                    ip = snic.address
                    if ip == '127.0.0.1':
                        continue

                    if ip.startswith('198.18.') or ip.startswith('198.19.'):
                        continue

                    if ip.startswith('169.254.'):
                        continue

                    if ip.startswith('172.18.'):
                        continue

                    score = 0
                    if ip.startswith('192.168.'):
                        score = 300
                    elif ip.startswith('10.'):
                        score = 250
                    elif ip.startswith('172.'):
                        try:
                            second = int(ip.split('.', 2)[1])
                            if 16 <= second <= 31:
                                score = 200
                            else:
                                score = 50
                        except Exception:
                            score = 50
                    else:
                        score = 10

                    score -= virtual_penalty
                    if iface_stats is not None and isinstance(getattr(iface_stats, "speed", None), (int, float)):
                        try:
                            score += min(int(iface_stats.speed), 10_000) // 500
                        except Exception:
                            pass

                    if score > best_score:
                        best_score = score
                        best_ip = ip
    except Exception as e:
        logger.error(f"Error detecting network interfaces: {e}")
        pass

    return best_ip

def is_fake_or_suspicious_ip(ip):
    if not ip: return False
    if ip.startswith("198.18.") or ip.startswith("198.19."):
        return True
    if ip.startswith("172.18."):
        return True
    return False

def is_port_available(port, host='127.0.0.1'):
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind((host, port))
            return True
    except Exception:
        return False
def find_available_port(start_port=8187, max_attempts=100, suppress_logging=False, host=None, reserved_ports=None):
    if host is None:
        host = '0.0.0.0'
    try:
        host_ip = socket.gethostbyname(socket.gethostname())
        if (host_ip.startswith('198.18.') or host_ip.startswith('198.19.')) and not suppress_logging:
            logger.warning(f"Detected Clash Fake IP: {host_ip}. Backend will still check 0.0.0.0 for binding.")
    except Exception:
        pass

    excluded_ports = {8188}
    if reserved_ports is not None:
        candidates = [reserved_ports] if isinstance(reserved_ports, (str, int)) else reserved_ports
        for reserved_port in candidates:
            try:
                excluded_ports.add(int(reserved_port))
            except (TypeError, ValueError):
                pass

    for i in range(max_attempts):
        port = start_port + i
        if port in excluded_ports:
            continue

        if is_port_available(port, host):
            if i > 0 and not suppress_logging:
                logger.info(f"端口 {start_port} 被占用，自动切换到端口: {port}")
            elif not suppress_logging:
                logger.info(f"后端使用端口: {port}")
            return port

    import random
    for _ in range(20):
        port = random.randint(10000, 65535)
        if port not in range(8180, 8200) and port not in excluded_ports and is_port_available(port, host):
            if not suppress_logging:
                logger.warning(f"常规端口范围被占用，使用随机端口: {port}")
            return port

    fallback_port = start_port
    while fallback_port in excluded_ports:
        fallback_port += 1
    if not suppress_logging:
        logger.error(f"无法找到可用端口，尝试使用端口: {fallback_port}")
    return fallback_port

def _get_local_comfyd_input_dir():
    candidates = [
        os.path.abspath(os.path.join(shared.root, "..", "..", "users")),
    ]
    userhome = str(getattr(shared, "path_userhome", "") or "").strip()
    if userhome:
        candidates.append(os.path.abspath(userhome))
    candidates.append(os.path.abspath(os.path.join(shared.root, "users")))

    for candidate in candidates:
        if os.path.isfile(os.path.join(candidate, "config.txt")) or os.path.isdir(os.path.join(candidate, "Local")):
            userhome = candidate
            break
    else:
        userhome = candidates[0]

    return os.path.abspath(os.path.join(userhome, "Local", "comfyd_inputs"))


def _select_comfyd_output_workspace_did(user_did=None):
    if user_did:
        return user_did
    admin_did = shared.token.get_admin_did()
    if admin_did:
        return admin_did
    if hasattr(shared.token, "get_default_workspace_did"):
        return shared.token.get_default_workspace_did()
    return shared.token.get_guest_did()


def get_comfyd_io_paths(user_did=None):
    output_did = _select_comfyd_output_workspace_did(user_did)
    comfyd_input = _get_local_comfyd_input_dir()
    comfyd_output = os.path.abspath(os.path.join(shared.token.get_path_in_user_dir(output_did, "outputs"), 'ComfyUI'))
    return output_did, comfyd_input, comfyd_output


def _set_comfyd_arg(flag, value):
    for arg in comfyd.comfyd_args:
        if len(arg) >= 2 and arg[0] == flag:
            arg[1] = value
            return
    comfyd.comfyd_args.append([flag, value])


def _launch_arg_was_set(flag, argv=None):
    argv = sys.argv if argv is None else argv
    prefix = f"{flag}="
    return any(str(arg) == flag or str(arg).startswith(prefix) for arg in argv)


def _launch_arg_value(name, default=None):
    args_obj = getattr(shared, "args", None) or args_manager.args
    return getattr(args_obj, name, default)


def _append_comfyd_arg(items, flag, value=None):
    if value is None:
        items.append([flag])
    else:
        items.append([flag, str(value)])


def _build_comfyd_cache_args(cache_ram_enable, cache_ram_value):
    try:
        cache_ram_value_num = float(cache_ram_value)
    except (TypeError, ValueError):
        cache_ram_value_num = 0

    if cache_ram_enable and cache_ram_value_num > 0:
        return [["--cache-ram", f"{cache_ram_value}"]]
    return [["--cache-classic"]]


def _enum_value(value):
    return getattr(value, "value", value)


_GPU_VENDOR_NVIDIA = "10DE"
_GPU_VENDOR_AMD = "1002"
_GPU_VENDOR_INTEL = "8086"
_DEFAULT_CUDA_MALLOC_DECISION_LOGGED = False


def _load_torch_version_probe():
    try:
        torch_spec = importlib.util.find_spec("torch")
        search_locations = getattr(torch_spec, "submodule_search_locations", None) or []
        for folder in search_locations:
            ver_file = os.path.join(folder, "version.py")
            if not os.path.isfile(ver_file):
                continue
            spec = importlib.util.spec_from_file_location("simpleai_torch_version_probe", ver_file)
            if spec is None or spec.loader is None:
                continue
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module
    except Exception:
        pass
    return None


def _torch_runtime_backend_kind():
    directml_device = _launch_arg_value("directml")
    if directml_device not in (None, -1):
        return "directml"

    module = _load_torch_version_probe()
    if module is None:
        return None

    if getattr(module, "hip", None):
        return "hip"
    if getattr(module, "cuda", None):
        return "cuda"
    return "cpu"


def _windows_display_vendor_ids():
    if os.name != "nt":
        return set()

    try:
        import ctypes

        class DISPLAY_DEVICEA(ctypes.Structure):
            _fields_ = [
                ("cb", ctypes.c_ulong),
                ("DeviceName", ctypes.c_char * 32),
                ("DeviceString", ctypes.c_char * 128),
                ("StateFlags", ctypes.c_ulong),
                ("DeviceID", ctypes.c_char * 128),
                ("DeviceKey", ctypes.c_char * 128),
            ]

        user32 = ctypes.windll.user32
        vendor_ids = set()
        device_info = DISPLAY_DEVICEA()
        device_info.cb = ctypes.sizeof(device_info)
        device_index = 0
        while user32.EnumDisplayDevicesA(None, device_index, ctypes.byref(device_info), 0):
            device_index += 1
            device_id = device_info.DeviceID.decode("utf-8", errors="ignore").upper()
            match = re.search(r"VEN_([0-9A-F]{4})", device_id)
            if match:
                vendor_ids.add(match.group(1))
        return vendor_ids
    except Exception:
        return set()


def _log_default_comfyd_cuda_malloc_decision(message):
    global _DEFAULT_CUDA_MALLOC_DECISION_LOGGED
    if _DEFAULT_CUDA_MALLOC_DECISION_LOGGED:
        return
    _DEFAULT_CUDA_MALLOC_DECISION_LOGGED = True
    logger.info(message)


def _default_comfyd_cuda_malloc_arg(argv=None):
    if _launch_arg_was_set("--async-cuda-allocation", argv) or _launch_arg_was_set("--disable-async-cuda-allocation", argv):
        return None
    if getattr(shared.args, "async_cuda_allocation", False) or getattr(shared.args, "disable_async_cuda_allocation", False):
        return None

    backend_kind = _torch_runtime_backend_kind()
    if backend_kind == "cuda":
        _log_default_comfyd_cuda_malloc_decision(
            "Detected torch backend: cuda; leaving cuda-malloc to Comfy defaults."
        )
        return None
    if backend_kind in {"hip", "directml", "cpu"}:
        _log_default_comfyd_cuda_malloc_decision(
            f"Detected torch backend: {backend_kind}; defaulting to --disable-cuda-malloc."
        )
        return "--disable-cuda-malloc"

    vendor_ids = _windows_display_vendor_ids()
    if vendor_ids and vendor_ids.issubset({_GPU_VENDOR_NVIDIA}):
        _log_default_comfyd_cuda_malloc_decision(
            f"Detected Windows GPU vendor IDs: {sorted(vendor_ids)}; treating system as NVIDIA and leaving cuda-malloc to Comfy defaults."
        )
        return None
    if vendor_ids & {_GPU_VENDOR_AMD, _GPU_VENDOR_INTEL}:
        _log_default_comfyd_cuda_malloc_decision(
            f"Detected Windows GPU vendor IDs: {sorted(vendor_ids)}; defaulting to --disable-cuda-malloc."
        )
        return "--disable-cuda-malloc"
    _log_default_comfyd_cuda_malloc_decision(
        "Unable to confirm a non-NVIDIA backend; preserving NVIDIA-first defaults and leaving cuda-malloc to Comfy defaults."
    )
    return None


def _default_non_nvidia_comfyd_guards(argv=None):
    backend_kind = _torch_runtime_backend_kind()
    if backend_kind in {"hip", "directml", "cpu"}:
        return ["--disable-xformers"]

    vendor_ids = _windows_display_vendor_ids()
    if vendor_ids & {_GPU_VENDOR_AMD, _GPU_VENDOR_INTEL}:
        return ["--disable-xformers"]
    return []


def _build_comfyd_launch_args(argv=None):
    mapped = []

    value_mappings = (
        ("--gpu-device-id", "gpu_device_id", "--cuda-device"),
        ("--preview-option", "preview_option", "--preview-method"),
        ("--reserve-vram", "reserve_vram", "--reserve-vram"),
        ("--vram-headroom", "vram_headroom", "--vram-headroom"),
    )
    for launch_flag, attr_name, comfy_flag in value_mappings:
        if _launch_arg_was_set(launch_flag, argv):
            value = _enum_value(_launch_arg_value(attr_name))
            if value is not None:
                _append_comfyd_arg(mapped, comfy_flag, value)

    if _launch_arg_was_set("--directml", argv):
        directml_device = _launch_arg_value("directml")
        _append_comfyd_arg(mapped, "--directml", None if directml_device in (None, -1) else directml_device)

    flag_mappings = (
        ("--async-cuda-allocation", "--cuda-malloc"),
        ("--disable-async-cuda-allocation", "--disable-cuda-malloc"),
        ("--disable-attention-upcast", "--dont-upcast-attention"),
        ("--all-in-fp32", "--force-fp32"),
        ("--all-in-fp16", "--force-fp16"),
        ("--unet-in-bf16", "--bf16-unet"),
        ("--unet-in-fp16", "--fp16-unet"),
        ("--unet-in-fp8-e4m3fn", "--fp8_e4m3fn-unet"),
        ("--unet-in-fp8-e5m2", "--fp8_e5m2-unet"),
        ("--vae-in-fp16", "--fp16-vae"),
        ("--vae-in-fp32", "--fp32-vae"),
        ("--vae-in-bf16", "--bf16-vae"),
        ("--vae-in-cpu", "--cpu-vae"),
        ("--clip-in-fp8-e4m3fn", "--fp8_e4m3fn-text-enc"),
        ("--clip-in-fp8-e5m2", "--fp8_e5m2-text-enc"),
        ("--clip-in-fp16", "--fp16-text-enc"),
        ("--clip-in-fp32", "--fp32-text-enc"),
        ("--attention-split", "--use-split-cross-attention"),
        ("--attention-quad", "--use-quad-cross-attention"),
        ("--attention-pytorch", "--use-pytorch-cross-attention"),
        ("--use-sage-attention", "--use-sage-attention"),
        ("--use-flash-attention", "--use-flash-attention"),
        ("--disable-xformers", "--disable-xformers"),
        ("--always-gpu", "--gpu-only"),
        ("--always-high-vram", "--highvram"),
        ("--always-low-vram", "--lowvram"),
        ("--always-no-vram", "--novram"),
        ("--always-cpu", "--cpu"),
        ("--pytorch-deterministic", "--deterministic"),
        ("--disable-metadata", "--disable-metadata"),
    )
    for launch_flag, comfy_flag in flag_mappings:
        if _launch_arg_was_set(launch_flag, argv):
            _append_comfyd_arg(mapped, comfy_flag)

    if _launch_arg_was_set("--use-flash-attention", argv) and not _launch_arg_was_set("--disable-xformers", argv):
        _append_comfyd_arg(mapped, "--disable-xformers")

    explicit_attention_flags = (
        "--disable-xformers",
        "--use-flash-attention",
        "--use-sage-attention",
        "--attention-pytorch",
        "--attention-split",
        "--attention-quad",
    )
    if not any(_launch_arg_was_set(flag, argv) for flag in explicit_attention_flags):
        for guard_flag in _default_non_nvidia_comfyd_guards(argv):
            _append_comfyd_arg(mapped, guard_flag)

    explicit_vram_flags = (
        "--always-gpu",
        "--always-high-vram",
        "--always-normal-vram",
        "--always-low-vram",
        "--always-no-vram",
        "--always-cpu",
    )
    has_explicit_vram_mode = any(_launch_arg_was_set(flag, argv) for flag in explicit_vram_flags)
    disable_offload = _launch_arg_was_set("--disable-offload-from-vram", argv)
    if disable_offload and not has_explicit_vram_mode:
        _append_comfyd_arg(mapped, "--highvram")
    elif _launch_arg_was_set("--always-offload-from-vram", argv):
        _append_comfyd_arg(mapped, "--disable-smart-memory")

    return mapped


def update_comfyd_io_paths(user_did=None, update_runtime=True, update_startup=True):
    target_did, comfyd_input, comfyd_output = get_comfyd_io_paths(user_did)
    os.makedirs(comfyd_output, exist_ok=True)
    os.makedirs(comfyd_input, exist_ok=True)
    if hasattr(comfyclient_pipeline, "set_input_directory"):
        comfyclient_pipeline.set_input_directory(comfyd_input)
    sync_intput_reserved(target_did)

    if update_runtime and comfyd.is_running():
        comfyd.modify_variable({"outputs": comfyd_output, "inputs": comfyd_input})

    if update_startup:
        _set_comfyd_arg("--output-directory", comfyd_output)
        _set_comfyd_arg("--input-directory", comfyd_input)

    return target_did, comfyd_input, comfyd_output


def refresh_comfyd_model_catalog():
    comfy_prompt_compat.invalidate_comfy_object_info_cache()
    if not comfyd.is_running():
        return False
    return comfy_prompt_compat.refresh_comfy_model_catalog(comfyclient_pipeline)


def reset_simpleai_args():
    global args_comfyd
    shared.sysinfo.update(dict(
        torch_version=torch_version,
        xformers_version=xformers_version ))

    frontend_port = getattr(args_manager.args, "port", None)
    reserved_backend_ports = {frontend_port} if frontend_port is not None else set()

    if args_manager.args.backend_port is not None:
        available_port = find_available_port(args_manager.args.backend_port, suppress_logging=True, reserved_ports=reserved_backend_ports)
        if available_port == args_manager.args.backend_port:
            logger.info(f"使用指定的后端端口: {available_port}")
        else:
            logger.info(f"端口 {args_manager.args.backend_port} 被占用，自动切换到端口: {available_port}")
    else:
        available_port = find_available_port(8187, reserved_ports=reserved_backend_ports)

    shared.sysinfo["loopback_port"] = available_port
    comfyclient_pipeline.COMFYUI_ENDPOINT_PORT = shared.sysinfo["loopback_port"]
    reserved_vram = ads.get_admin_default('reserved_vram')
    reserve_vram = (
        [['--reserve-vram', f'{reserved_vram}']]
        if not _launch_arg_was_set("--reserve-vram") and reserved_vram and reserved_vram > 0
        else []
    )
    vram_headroom = (
        [['--vram-headroom', f'{reserved_vram}']]
        if not _launch_arg_was_set("--vram-headroom") and reserved_vram and reserved_vram > 0
        else []
    )
    cache_ram_enable = ads.get_admin_default('cache_ram_enable')
    cache_ram_value = ads.get_admin_default('cache_ram')
    cache_ram = _build_comfyd_cache_args(cache_ram_enable, cache_ram_value)
    cache_clear_on_finish = [["--cache-clear-on-finish"]] if ads.get_admin_default('cache_clear_on_finish_checkbox') else []
    has_launch_memory_mode = any(_launch_arg_was_set(flag) for flag in (
        "--disable-offload-from-vram",
        "--always-gpu",
        "--always-high-vram",
        "--always-normal-vram",
        "--always-low-vram",
        "--always-no-vram",
        "--always-cpu",
    ))
    dynamic_vram_enabled = bool(ads.get_admin_default('dynamic_vram_checkbox'))
    dynamic_vram = [] if dynamic_vram_enabled else [['--disable-dynamic-vram']]
    disable_smart_memory = bool(ads.get_admin_default('disable_smart_memory_checkbox'))
    smart_memory = (
        [['--disable-smart-memory']]
        if disable_smart_memory and not has_launch_memory_mode and shared.sysinfo['gpu_memory'] >= 8180
        else []
    )
    windows_standalone = [["--windows-standalone-build"]] if is_win32_standalone_build else []
    fast_mode = [['--fast', 'fp16_accumulation']] if ads.get_admin_default('fast_comfyd_checkbox') else []
    args_comfyd = dynamic_vram + _build_comfyd_launch_args() + [["--listen"], ["--port", f'{shared.sysinfo["loopback_port"]}']] + smart_memory + windows_standalone + reserve_vram + vram_headroom + fast_mode + cache_ram + cache_clear_on_finish
    default_cuda_malloc_arg = _default_comfyd_cuda_malloc_arg()
    args_comfyd += [[default_cuda_malloc_arg]] if default_cuda_malloc_arg else []
    _, comfyd_intput, comfyd_output = update_comfyd_io_paths(update_runtime=False, update_startup=False)
    args_comfyd += [["--output-directory", comfyd_output], ["--temp-directory", shared.temp_path], ["--input-directory", comfyd_intput]]
    cors_origin = os.environ.get("SIMPAI_COMFYD_CORS", "").strip()
    if cors_origin:
        args_comfyd += [["--enable-cors-header", cors_origin]]
    comfyd.comfyd_args = args_comfyd
    logger.info(
        "Comfyd memory options: dynamic_vram=%s, disable_smart_memory=%s",
        dynamic_vram_enabled,
        bool(smart_memory),
    )
    return

def sync_intput_reserved(user_did=None):
    try:
        comfyd_intput = _get_local_comfyd_input_dir()
        comfyd_intput_reserved = os.path.join(shared.root, 'presets/input_reserved')
        image_extensions = {'.jpg', '.png', '.jpeg', '.webp', '.mp4', '.mp3'}

        if os.path.exists(comfyd_intput) and not os.path.isdir(comfyd_intput):
            logger.warning(f'检测到comfyd_inputs是文件而非目录，正在修复: {comfyd_intput}')
            try:
                os.remove(comfyd_intput)
                logger.info(f'已删除错误的文件: {comfyd_intput}')
            except Exception as e:
                logger.error(f'删除错误文件失败: {e}')
                import tempfile
                temp_dir = tempfile.mkdtemp()
                os.rename(comfyd_intput, os.path.join(temp_dir, 'corrupted_file'))
                logger.info(f'已将错误文件移至临时目录: {temp_dir}')

        if not os.path.exists(comfyd_intput):
            os.makedirs(comfyd_intput, exist_ok=True)
            logger.info(f'创建目录: {comfyd_intput}')

        if not os.path.exists(comfyd_intput_reserved):
            os.makedirs(comfyd_intput_reserved, exist_ok=True)
            logger.info(f'创建目录: {comfyd_intput_reserved}')

        default_image_path = os.path.join(shared.root, 'presets/welcome/welcome.png')
        if os.path.exists(default_image_path):
            welcome_target = os.path.join(comfyd_intput, 'welcome.png')
            if not os.path.exists(welcome_target):
                try:
                    shutil.copy(default_image_path, welcome_target)
                except Exception as e:
                    logger.error(f'复制welcome.png到comfyd_inputs失败: {e}')

            welcome_reserved_target = os.path.join(comfyd_intput_reserved, 'welcome.png')
            if not os.path.exists(welcome_reserved_target):
                try:
                    shutil.copy(default_image_path, welcome_reserved_target)
                except Exception as e:
                    logger.error(f'复制welcome.png到input_reserved失败: {e}')
        else:
            logger.warning(f'默认welcome.png文件不存在: {default_image_path}')

        try:
            for file in os.listdir(comfyd_intput_reserved):
                source_path = os.path.join(comfyd_intput_reserved, file)
                if os.path.isfile(source_path):
                    ext = os.path.splitext(file)[1].lower()
                    if ext in image_extensions:
                        target_path = os.path.join(comfyd_intput, file)
                        if not os.path.exists(target_path):
                            try:
                                shutil.copy2(source_path, target_path)
                            except Exception as e:
                                logger.error(f'复制文件 {file} 失败: {e}')
        except Exception as e:
            logger.error(f'遍历input_reserved目录失败: {e}')

    except Exception as e:
        logger.error(f'sync_intput_reserved执行出错: {e}')


def get_path_in_user_dir(filename, user_did=None, catalog=None):
    if user_did is None:
        user_did = shared.token.get_default_workspace_did() if hasattr(shared.token, "get_default_workspace_did") else shared.token.get_guest_did()
    if filename:
        path = catalog if catalog else filename
        path_file = shared.token.get_path_in_user_dir(user_did, path)
        if not os.path.exists(os.path.dirname(path_file)):
            for cata in ["presets", "workflows", "styles", "wildcards"]:
                os.makedirs(os.path.join(os.path.dirname(path_file), cata), exist_ok=True)
        if catalog: 
            path_file = os.path.join(path_file, filename)
        path_file = os.path.abspath(path_file)
        if not os.path.exists(path_file):
            if os.path.isdir(path_file):
                os.makedirs(path_file)
            else:
                directory = os.path.dirname(path_file)
                if not os.path.exists(directory):
                    os.makedirs(directory)
        return path_file
    return None

def _restart_comfyd_after_setting_change():
    if comfyd.is_running():
        comfyd.stop(force=True)
    reset_simpleai_args()
    if getattr(comfyd, "comfyd_active", False):
        comfyd.start()


def start_fast_comfyd(fast, state):
    if args_manager.args.disable_backend or args_manager.args.disable_comfyd:
        return
    if fast == ads.get_admin_default('fast_comfyd_checkbox'):
        return
    ads.set_admin_default_value('fast_comfyd_checkbox', fast, state)
    _restart_comfyd_after_setting_change()
    return

def set_cache_clear_on_finish(enabled, state):
    if args_manager.args.disable_backend or args_manager.args.disable_comfyd:
        return
    if enabled == ads.get_admin_default('cache_clear_on_finish_checkbox'):
        return
    ads.set_admin_default_value('cache_clear_on_finish_checkbox', enabled, state)
    _restart_comfyd_after_setting_change()
    return


def set_dynamic_vram(enabled, state):
    if args_manager.args.disable_backend or args_manager.args.disable_comfyd:
        return
    enabled = bool(enabled)
    if enabled == bool(ads.get_admin_default('dynamic_vram_checkbox')):
        return
    ads.set_admin_default_value('dynamic_vram_checkbox', enabled, state)
    _restart_comfyd_after_setting_change()


def set_disable_smart_memory(enabled, state):
    if args_manager.args.disable_backend or args_manager.args.disable_comfyd:
        return
    enabled = bool(enabled)
    if enabled == bool(ads.get_admin_default('disable_smart_memory_checkbox')):
        return
    ads.set_admin_default_value('disable_smart_memory_checkbox', enabled, state)
    _restart_comfyd_after_setting_change()

def change_advanced_logs(_advanced_logs=None, state=None):
    utils.echo_off = not is_advanced_logs_enabled()

def get_echo_off():
    return utils.echo_off


def toggle_p2p(x, state):
    if x:
        if shared.upstream_did and ':P2P' not in shared.upstream_did:
            shared.token.p2p_start()
        else:
            shared.upstream_did = shared.token.get_p2p_upstream_did()
        if shared.upstream_did:
            shared.upstream_did = f'{shared.upstream_did}:P2P'
    else:
        if shared.upstream_did and ':P2P' in shared.upstream_did:
            result = shared.token.p2p_stop()
            shared.upstream_did = shared.upstream_did.split(':')[0]
    ads.set_admin_default_value('p2p_active_checkbox', x, state)

    return gr_update(info=shared.token.get_p2p_address()), gr_update(interactive=x, value='Disable'), gr_update(interactive=x)

def ping_test(target, state):
    if ads.get_admin_default('p2p_active_checkbox'):
        target_did = target.split(':')[0]
        if ':' in target:
            args = target.split(':')[1]
        else:
            args = 'hello!'
        task = p2p_task.AsyncTask(method="remote_ping", args=args, target_did=target_did)
        return p2p_task.request_p2p_task(task)
    return "p2p not active"


identity_note = '当前为本机模式，已开放完整功能。若您需要把本机切换为多用户模式，请在这里主动验证管理员身份；验证完成后，系统会启用 admin / user / guest 身份链路。'
identity_note_1 = '当前浏览器已绑定身份。现在处于多用户模式，身份会决定预置、输出目录、模型下载和系统配置的可用范围。若要更换身份，请先解除绑定。'
identity_note_0 = '当前节点处于本机模式。您可以直接使用完整功能；若需要切换到多用户协作，请先验证管理员身份。导出身份二维码可用于后续再次绑定。'

upstream_tooltip = "请查看后台日志，排除错误后" if shared.upstream_did else "无法连接上游节点，请检查网络环境"
upstream_status_text = "<b>On-P2P</b>" if shared.upstream_did and ':P2P' in shared.upstream_did else "<b>On</b>" if shared.upstream_did else "<b>Off</b>"
is_export_qr = lambda x: not shared.token.is_guest(x) or is_local_mode()

note1_0 = '请按提示输入创建身份时预设的身份口令，确认身份后完成绑定。'
note1_1 = '未匹配到数字身份，请按提示创建本地身份口令。'
note1_2 = f'已匹配到数字身份，{note1_0}'
note1_3 = f'已匹配到云端加密身份副本, {note1_0}'
note1_4 = '身份昵称格式不对，昵称最少4个字符或2个汉字。请重新输入身份昵称，再次绑定。'
note1_5 = '该手机号绑定身份数量超过上限，无法绑定该身份，请更换身份信息，再次申请绑定。'
note1_6 = '短时间内重复提交相同身份信息，请稍后再重新输入身份信息，再次申请绑定。'
note1_7 = '已提交过但未验证通过的身份，已清除遗留数据，需重新输入身份信息，再次绑定。'
note1_8 = f'找回加密副本或验证身份出错。{upstream_tooltip}，重启软件，再次绑定。'
note1_9 = '当前系统为孤岛节点，只能绑定本地管理员身份。请导入本地管理员身份二维码绑定。'

note2_0 = lambda x: f'口令最少8位字符，必须包含大写、小写字母和数字，不能有特殊字符。\n**<span style="color: {x};">特别提醒</span>**<span style="color: {x};">: 身份口令是唯一解锁数字身份的密钥，无法找回，遗失将导致已存储的配置信息和数据丢失，需妥善保存!!!</span>'
note2_1 = f'身份已验证，请按提示预设个人身份口令。{note2_0("lightseagreen")}'
note2_2 = f'口令遗失无法找回，请再次输入一致的口令。{note2_0("darkorange")}'
note2_3 = '身份验证码格式不对，请正确输入短信里的身份验证码，重新进行"身份验证"。'
note2_4 = '身份验证码不正确，请正确输入短信里的身份验证码，重新进行"身份验证"。'
note2_5 = f'设置的身份口令格式不对，请重新预设个人身份口令。{note2_0("lightseagreen")}'
note2_6 = f'身份口令设置异常，请重新输入身份信息进行绑定。'
note2_7 = f'身份口令与上次不一致，请重新预设个人身份口令。{note2_0("lightseagreen")}'
note2_8 = f'已匹配到本地数字身份，请按提示预设个人身份口令。{note2_0("lightseagreen")}'

note3 = f'绑定成功! {identity_note_1}'
note3_1 = '身份绑定不成功，请重新输入个人身份口令，再次确认身份。'
note3_2 = '输入的身份口令格式不对，最少8位字符，必须包含大写字母、小写字母和数字，不能有特殊字符。请重新输入个人身份口令。'

note4 = '身份已成功解绑，当前节点的服务已回退到游客模式。可以更换其他身份再次绑定。'
note4_1 = '身份解绑不成功，请重新输入个人身份口令，再次确认身份。'


theme_color = {
    "dark": "aqua",
    "light": "blue",
    }

id_info_css = lambda x: f'style="color: {theme_color[x]};"'
#lambda x: f'style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-block; max-width: 150px; color: {theme_color[x]};"'

identity_mode_texts = {
    "identity_note_local": {
        "cn": '当前为本机模式，完整功能已开放。如需把本机切换为多用户模式，请在这里主动验证管理员身份；验证成功后，系统将启用管理员 / 用户 / 游客身份链路。',
        "en": "You are currently in local mode with full features enabled. If you want to switch this machine to multi-user mode, please actively verify an admin identity here. After verification, the admin / user / guest identity flow will be enabled.",
    },
    "identity_note_bound": {
        "cn": '当前浏览器已绑定身份。现在处于多用户模式，身份会决定预置、输出目录、模型下载和系统配置的可用范围。如需切换身份，请先解除绑定。',
        "en": "This browser is already bound to an identity. You are now in multi-user mode, and the identity determines access to presets, output folders, model downloads, and system settings. Unbind first if you want to switch identities.",
    },
    "identity_note_pending_bound": {
        "cn": '身份已绑定，正在等待管理员批准。批准前不能生图、下载模型或管理个人资源。',
        "en": "Identity bound. Waiting for Admin approval. Image generation, model downloads, and personal resource management are unavailable until approval.",
    },
    "identity_note_blocked_bound": {
        "cn": '身份已绑定，但该身份已被管理员拒绝或停用。请联系管理员处理。',
        "en": "Identity bound, but this identity has been rejected or disabled by Admin. Contact the Admin to continue.",
    },
    "identity_note_mode_switch": {
        "cn": '当前节点处于本机模式。您可以直接使用完整功能；如需切换到多用户协作，请先验证管理员身份。导出身份二维码可用于后续再次绑定。',
        "en": "This node is currently in local mode. You can use all features directly. If you want to switch to multi-user collaboration, verify an admin identity first. You can export the identity QR code for future rebinding.",
    },
    "identity_note_guest_multi": {
        "cn": '当前已进入多用户模式，但本浏览器仍是游客身份。游客会受到预置、模型下载和个人空间权限限制。',
        "en": "This node is already in multi-user mode, but the current browser is still a guest. Guest access is limited for presets, model downloads, and personal workspace features.",
    },
    "activation_intro": {
        "cn": (
            '### 是否真的需要多用户模式？\n'
            '只有这台电脑会被多人或多个设备访问，并且确实需要管理员 / 用户 / 游客权限隔离时才建议开启。'
            '单人使用请保持本机模式，完整功能可以直接使用，也不需要管理身份。\n\n'
            '管理员身份和口令确认完成后，本机会立即进入多用户模式；未绑定管理员身份的浏览器将按游客权限运行。'
        ),
        "en": (
            '### Do you really need Multi-user Mode?\n'
            'Enable it only when this machine will be accessed by multiple people or devices and separate admin / user / guest permissions are required. '
            'For one-person use, keep Local Mode: all features remain available without identity administration.\n\n'
            'As soon as the admin identity and passphrase are confirmed, this machine enters Multi-user Mode. Browsers without the admin identity will run with guest permissions.'
        ),
    },
    "activation_mode_label": {
        "cn": "这台机器如何使用",
        "en": "How this machine will be used",
    },
    "activation_keep_local": {
        "cn": "保持本机模式（单人使用推荐）",
        "en": "Keep Local Mode (recommended for one person)",
    },
    "activation_enable_multi": {
        "cn": "启用多用户模式",
        "en": "Enable Multi-user Mode",
    },
    "activation_scope_confirm": {
        "cn": "我确认这台机器确实需要多人或多设备访问，并需要身份与权限隔离。",
        "en": "I confirm that this machine needs multi-person or multi-device access with separate identities and permissions.",
    },
    "activation_permission_confirm": {
        "cn": "我理解管理员身份创建完成后会立即改变权限模式，未绑定管理员身份的浏览器会成为游客。",
        "en": "I understand that creating the admin identity immediately changes the permission mode, and browsers without the admin identity become guests.",
    },
    "activation_phrase_confirm": {
        "cn": "我理解管理员口令无法修改、无法找回，并会离线记录口令及导出管理员身份二维码。",
        "en": "I understand that the admin passphrase cannot be changed or recovered, and I will keep an offline record and export the admin identity QR code.",
    },
    "activation_apply": {
        "cn": "确认选择",
        "en": "Apply selection",
    },
    "activation_incomplete": {
        "cn": "启用多用户模式前，请选择“启用多用户模式”并确认下面三项。单人使用可以直接保持本机模式。",
        "en": "Before enabling Multi-user Mode, select it and confirm all three items below. For one-person use, you can keep Local Mode.",
    },
    "activation_ready": {
        "cn": "已确认启用多用户模式。请继续创建或绑定管理员身份；管理员口令确认完成后，权限模式会立即改变。",
        "en": "Multi-user Mode has been explicitly selected. Continue by creating or binding the admin identity; the permission mode changes immediately after the admin passphrase is confirmed.",
    },
    "activation_keep_local_done": {
        "cn": "已保持本机模式。当前仍可直接使用完整功能，不需要创建管理员身份。",
        "en": "Local Mode has been kept. All features remain available without creating an admin identity.",
    },
    "activation_required": {
        "cn": "管理员身份尚未经过多用户模式启用确认。请返回上一步，确认使用场景、权限变化和口令风险。",
        "en": "The admin identity has not passed the Multi-user Mode activation confirmation. Go back and confirm the usage scenario, permission change, and passphrase risk.",
    },
    "identity_phrase_failed": {
        "cn": "身份绑定未成功，请重新输入身份口令。若这是您自己的主机且管理员口令已经遗忘，可查看下方恢复说明。",
        "en": "Identity binding failed. Enter the identity passphrase again. If this is your own host and the admin passphrase has been forgotten, see the recovery guide below.",
    },
    "identity_phrase_format_invalid": {
        "cn": "身份口令格式不正确。口令至少 8 位，必须包含大写字母、小写字母和数字，且不能包含特殊字符。",
        "en": "The identity passphrase format is invalid. Use at least 8 characters with uppercase letters, lowercase letters, and numbers, without special characters.",
    },
    "status_admin_multi": {
        "cn": '当前为管理员身份（多用户模式）',
        "en": "Current identity: Admin (Multi-user Mode)",
    },
    "status_user_multi": {
        "cn": '当前为已验证用户（多用户模式）',
        "en": "Current identity: Verified User (Multi-user Mode)",
    },
    "status_pending_user": {
        "cn": '当前为待审核用户',
        "en": "Current identity: Pending User",
    },
    "status_blocked_user": {
        "cn": '当前为已停用用户',
        "en": "Current identity: Disabled User",
    },
    "status_local_full": {
        "cn": '当前为本机模式（完整权限）',
        "en": "Current mode: Local (Full Access)",
    },
    "status_admin": {
        "cn": '当前为管理员身份',
        "en": "Current identity: Admin",
    },
    "status_user": {
        "cn": '当前为已验证用户',
        "en": "Current identity: Verified User",
    },
    "status_guest": {
        "cn": '当前为游客身份',
        "en": "Current identity: Guest",
    },
    "label_nickname": {
        "cn": '身份昵称',
        "en": "Identity Name",
    },
    "label_user_did": {
        "cn": '身份标识',
        "en": "Identity DID",
    },
    "label_sys_did": {
        "cn": '节点标识',
        "en": "Node DID",
    },
}
def normalize_ui_lang(lang):
    lang = str(lang or args_manager.args.language or "en").lower()
    return "en" if lang.startswith("en") else "cn"


def get_identity_mode_text(key, lang=None):
    lang = normalize_ui_lang(lang)
    entry = identity_mode_texts.get(key, {})
    return entry.get(lang) or entry.get("cn") or key


IDENTITY_TOKEN_RESET_PATH = r"%USERPROFILE%\.simpleai.vip\token"


def get_multi_user_activation_copy(state=None):
    lang = state.get("__lang") if isinstance(state, dict) else state
    return {
        "notice": get_identity_mode_text("activation_intro", lang),
        "mode_label": get_identity_mode_text("activation_mode_label", lang),
        "mode_choices": [
            (get_identity_mode_text("activation_keep_local", lang), "local"),
            (get_identity_mode_text("activation_enable_multi", lang), "multi-user"),
        ],
        "scope_confirm": get_identity_mode_text("activation_scope_confirm", lang),
        "permission_confirm": get_identity_mode_text("activation_permission_confirm", lang),
        "phrase_confirm": get_identity_mode_text("activation_phrase_confirm", lang),
        "apply": get_identity_mode_text("activation_apply", lang),
        "incomplete": get_identity_mode_text("activation_incomplete", lang),
        "ready": get_identity_mode_text("activation_ready", lang),
        "keep_local": get_identity_mode_text("activation_keep_local_done", lang),
        "required": get_identity_mode_text("activation_required", lang),
    }


def requires_multi_user_activation(activation_confirmed=False):
    return is_local_mode() and not bool(activation_confirmed)


def get_admin_recovery_guide(lang=None):
    lang = normalize_ui_lang(lang)
    if lang == "en":
        return f'''<details class="identity-recovery-guide">
<summary>Admin passphrase forgotten or the host is stuck as Guest</summary>
<div>
<p><b>This is not a passphrase reset.</b> It creates a new local identity environment. It does not unlock the previous admin identity or its encrypted settings.</p>
<ol>
<li>Use the computer that runs SimpAI Studio. Exit Studio completely and make sure its process has stopped.</li>
<li>Back up and rename <code>{IDENTITY_TOKEN_RESET_PATH}</code> to a name such as <code>token.backup-YYYYMMDD-HHMM</code>. Delete it only after the backup has been verified.</li>
<li>Restart Studio. If the browser still shows the old guest session, clear the current site's <code>aitoken</code> cookie/localStorage entry and refresh.</li>
<li>If an older installation still opens the previous node identity, rename or move the entire program directory and start it from the new path. Keep the original directory and token backup until the new local environment is confirmed.</li>
</ol>
<p>After recovery, set up Multi-user Mode again only when it is actually needed, and keep the new admin passphrase and exported identity QR code offline.</p>
</div>
</details>'''
    return f'''<details class="identity-recovery-guide">
<summary>管理员忘记口令，或主机被困在游客身份时</summary>
<div>
<p><b>这不是口令重置。</b>以下操作会创建新的本机身份环境，不能解锁原管理员身份及其加密配置。</p>
<ol>
<li>必须在运行 SimpAI Studio 的电脑上操作。完全退出 Studio，并确认相关进程已经停止。</li>
<li>备份并重命名 <code>{IDENTITY_TOKEN_RESET_PATH}</code>，例如改为 <code>token.backup-YYYYMMDD-HHMM</code>。确认备份有效后再考虑删除。</li>
<li>重新启动 Studio。若浏览器仍显示旧游客会话，清除当前站点的 <code>aitoken</code> Cookie / localStorage 项后刷新。</li>
<li>旧版安装若仍关联原节点身份，可把整个程序目录改名或移动到新路径后启动。确认新的本机环境可用前，请保留原程序目录和 token 备份。</li>
</ol>
<p>恢复后，只有确实需要多人使用时才重新启用多用户模式，并离线保存新的管理员口令和导出的身份二维码。</p>
</div>
</details>'''


def get_identity_access_status(user_did):
    try:
        if not user_did or shared.token.is_guest(user_did) or shared.token.is_admin(user_did):
            return ""
        if not hasattr(shared.token, "get_user_access_list"):
            return ""
        raw = shared.token.get_user_access_list()
        records = json.loads(raw) if raw else []
        if not isinstance(records, list):
            return ""
        for record in records:
            if not isinstance(record, dict):
                continue
            if str(record.get("did") or "") == str(user_did):
                return str(record.get("status") or "")
    except Exception as e:
        logger.debug(f"get_identity_access_status failed: {e}")
    return ""


def identity_context_is_pending(context):
    try:
        return bool(context is not None and hasattr(context, "is_pending") and context.is_pending())
    except Exception:
        return False


def ensure_identity_state_defaults(state):
    if not isinstance(state, dict):
        state = {}
    if "user" not in state:
        state["user"] = shared.token.get_guest_user_context()
    if "sys_did" not in state:
        state["sys_did"] = shared.token.get_sys_did()
    if "__theme" not in state:
        state["__theme"] = "dark"
    if "__lang" not in state:
        state["__lang"] = args_manager.args.language
    if "ua_hash" not in state:
        state["ua_hash"] = "api_smoke"
    if "__session" not in state:
        state["__session"] = shared.token.get_guest_sstoken(state["ua_hash"])
    return state


def _apply_identity_context(state, context, close_preset_store=False):
    state["user"] = context
    state["sys_did"] = context.get_sys_did()
    state["sstoken"] = shared.token.get_user_sstoken(context.get_did(), state["ua_hash"])
    state["__session"] = state["sstoken"]
    state["__identity_session_seq"] = int(state.get("__identity_session_seq", 0) or 0) + 1
    state["__preset_store_seq"] = int(state.get("__preset_store_seq", 0) or 0) + 1
    if close_preset_store:
        state["preset_store"] = False


def get_bound_identity_note(context, lang=None):
    user_did = context.get_did() if context is not None and hasattr(context, "get_did") else ""
    status = get_identity_access_status(user_did)
    if status == "blocked":
        return get_identity_mode_text("identity_note_blocked_bound", lang)
    if status == "pending" or identity_context_is_pending(context):
        return get_identity_mode_text("identity_note_pending_bound", lang)
    return note3


def get_identity_dialog_note(user_did, lang=None):
    if is_local_mode():
        return get_identity_mode_text("identity_note_local", lang)
    if user_did and not shared.token.is_guest(user_did):
        status = get_identity_access_status(user_did)
        if status == "blocked":
            return get_identity_mode_text("identity_note_blocked_bound", lang)
        if status == "pending":
            return get_identity_mode_text("identity_note_pending_bound", lang)
        return get_identity_mode_text("identity_note_bound", lang)
    return f'{get_identity_mode_text("identity_note_guest_multi", lang)}\n\n{get_admin_recovery_guide(lang)}'


def get_identity_status_title(user_did, lang=None):
    if is_local_mode():
        if user_did and not shared.token.is_guest(user_did):
            if shared.token.is_admin(user_did):
                return get_identity_mode_text("status_admin_multi", lang)
            return get_identity_mode_text("status_user_multi", lang)
        return get_identity_mode_text("status_local_full", lang)
    if user_did and not shared.token.is_guest(user_did):
        if shared.token.is_admin(user_did):
            return get_identity_mode_text("status_admin", lang)
        status = get_identity_access_status(user_did)
        if status == "blocked":
            return get_identity_mode_text("status_blocked_user", lang)
        if status == "pending":
            return get_identity_mode_text("status_pending_user", lang)
        return get_identity_mode_text("status_user", lang)
    return get_identity_mode_text("status_guest", lang)


def build_current_id_info(nickname, user_did, sys_did, theme, lang=None):
    return (
        f'<b>{get_identity_status_title(user_did, lang)}</b><br>'
        f'{get_identity_mode_text("label_nickname", lang)}: <span {id_info_css(theme)}>{nickname}</span><br>'
        f'{get_identity_mode_text("label_user_did", lang)}: <span {id_info_css(theme)}>{user_did}</span><br>'
        f'{get_identity_mode_text("label_sys_did", lang)}: <span {id_info_css(theme)}>{sys_did}</span>'
    )


def _identity_activation_required_result(state):
    state["user_phrase"] = ""
    result = [get_identity_mode_text("activation_required", state.get("__lang"))]
    result += [gr_update(visible=True)] + [gr_update(visible=False)] * 8
    id_info = build_current_id_info(
        state["user"].get_nickname(),
        state["user"].get_did(),
        state["sys_did"],
        state["__theme"],
        state.get("__lang"),
    )
    upstream_status = gr_update(
        visible=not is_export_qr(state["user"].get_did()),
        value=upstream_status_text,
    )
    export_qr = gr_update(visible=is_export_qr(state["user"].get_did()))
    return result + [id_info, upstream_status, export_qr]

# [identity_note_info, input_identity, input_id_display, identity_vcode_input, identity_verify_button, identity_phrase_input, identity_phrases_set_button, identity_phrases_confirm_button, identity_confirm_button, identity_unbind_button]
# [identity_nick_input, identity_tele_input, identity_qr]

def trigger_input_identity(img):
    util.log_ui_trace(logger, "[UI-TRACE] identity.qr_upload.enter | img_is_none=%s, shape=%s", img is None, getattr(img, "shape", None))
    if img is None:
        util.log_ui_trace(logger, "[UI-TRACE] identity.qr_upload.empty | reset_to_manual_input")
        return [get_identity_dialog_note(None, args_manager.args.language)] + [gr_update(visible=True)] + [gr_update(visible=False)] + [gr_update(visible=False)]*7 + ["", "", ""]
    image = util.HWC3(img)
    qr_code_detector = cv2.QRCodeDetector()
    user_did, nickname, telephone = '', '', ''
    try:
        data, bbox, data_bytes = qr_code_detector.detectAndDecode(image)
        util.log_ui_trace(
            logger,
            "[UI-TRACE] identity.qr_upload.cv2 | has_bbox=%s, has_data=%s, data_len=%s",
            bbox is not None,
            bool(data),
            len(data) if data else 0,
        )
        if bbox is not None and data:
            try:
                user_did, nickname, telephone = import_identity_qrcode(data)
            except Exception as e:
                logger.debug(f'import_identity_qrcode error: {e}')

        if not nickname and not telephone:
            try:
                from pyzbar import pyzbar
                decoded_objs = pyzbar.decode(image)
                util.log_ui_trace(logger, "[UI-TRACE] identity.qr_upload.pyzbar | count=%s", len(decoded_objs))
                for obj in decoded_objs:
                    qr_data = obj.data.decode('utf-8')
                    if qr_data:
                        try:
                            user_did, nickname, telephone = import_identity_qrcode(qr_data)
                            if nickname or telephone:
                                break
                        except Exception as e:
                            logger.debug(f'pyzbar import error: {e}')
            except ImportError:
                pass
            except Exception as e:
                logger.debug(f'pyzbar error: {e}')

    except Exception as e:
        logger.debug(f'Unexpected error in trigger_input_identity: {e}')

    util.log_ui_trace(
        logger,
        "[UI-TRACE] identity.qr_upload.result | has_nickname=%s, has_telephone=%s, has_user_did=%s",
        bool(nickname),
        bool(telephone),
        bool(user_did),
    )
    return bind_identity_sub(nickname, telephone, user_did)

def bind_identity(nick, areacode, tele):
    areacode = areacode.split('-')[0]
    tele = f'{areacode}{tele}' if str(tele or "").strip() else ""
    return bind_identity_sub(nick, tele)

def bind_identity_sub(nick, tele, user_did=None):
    util.log_ui_trace(
        logger,
        "[UI-TRACE] identity.bind_sub.enter | nick_len=%s, tele_len=%s, has_user_did=%s",
        len(nick or ""),
        len(tele or ""),
        bool(user_did),
    )
    if check_input(nick, tele):
        where = shared.token.check_local_user_token(nick, tele)
        util.log_ui_trace(logger, "[UI-TRACE] identity.bind_sub.check_local_user_token | where=%s", where)
        if where in ['local', 'recall']: # 本地或远程有身份, 输入身份口令
            result = [note1_2] + [gr_update(visible=False)] + [gr_update(visible=True)] + [gr_update(visible=False)]*2 + [gr_update(visible=True, value='')] + [gr_update(visible=False)]*2 +[gr_update(visible=True)] + [gr_update(visible=False)]
        elif where == 'create': # 新身份, 输入验证码
            result = [note1_1] + [gr_update(visible=False)] + [gr_update(visible=True)] + [gr_update(visible=True, value='')] + [gr_update(visible=True)] + [gr_update(visible=False)]*5
        elif where == 'immature': # 本地遗留密钥,重设身份口令
            result = [note2_8] + [gr_update(visible=False)] + [gr_update(visible=True)] + [gr_update(visible=False)]*2 + [gr_update(visible=True, value='')] + [gr_update(visible=True)] + [gr_update(visible=False)]*3
        elif where == 'unknown_exceeded': # 手机号绑定身份过多
            result = [note1_5] + [gr_update(visible=True)] + [gr_update(visible=False)] + [gr_update(visible=False)]*7
        elif where == 'unknown_repeat': # 重复提交
            result = [note1_6] + [gr_update(visible=True)] + [gr_update(visible=False)] + [gr_update(visible=False)]*7
        elif where == 're_input': # 之前提交过失败,需重新提交
            result = [note1_7] + [gr_update(visible=True)] + [gr_update(visible=False)] + [gr_update(visible=False)]*7
        elif where == 'isolated': # 孤岛节点, 提示导出管理员身份二维码
            result = [note1_9] + [gr_update(visible=True)] + [gr_update(visible=False)] + [gr_update(visible=False)]*7
        else:  # 过程出错, 重新输入绑定信息,再来
            result = [note1_8] + [gr_update(visible=True)] + [gr_update(visible=False)] + [gr_update(visible=False)]*7
    else: # 身份信息不合规, 重新输入
        result = [note1_4] + [gr_update(visible=True)] + [gr_update(visible=False)] + [gr_update(visible=False)]*7
    util.log_ui_trace(
        logger,
        "[UI-TRACE] identity.bind_sub.exit | ctrl_len=%s, input_id_info_will_be_set=%s",
        len(result),
        bool(nick or tele or user_did),
    )
    return result + [f'{nick}, {tele}, {user_did if user_did else ""}']

def change_identity():
    return [get_identity_dialog_note(None, args_manager.args.language)] + [gr_update(visible=True)] + [gr_update(visible=False)] + [gr_update(visible=False)]*7 + ['', '86-CN-中国', '', None]


def verify_identity(input_id_info, state, vcode):
    state = ensure_identity_state_defaults(state)
    if check_vcode(vcode):
        inputs = input_id_info.split(',')
        nick, tele = inputs[0].strip(), inputs[1].strip()
        next_cmd = shared.token.check_user_verify_code(nick, tele, vcode)
        logger.debug(f'check_user_verify_code:{next_cmd}')
        if next_cmd == 'create':  # 验证成功, 创建新身份, 开始设置口令
            result = [note2_1] + [gr_update(visible=False)] + [gr_update(visible=True)] + [gr_update(visible=False)]*2 + [gr_update(visible=True, value='')] + [gr_update(visible=True)] + [gr_update(visible=False)]*3
        elif next_cmd == 'recall': # 验证并找回身份, 要求直接输入口令
            result = [note1_3] + [gr_update(visible=False)] + [gr_update(visible=True)] + [gr_update(visible=False)]*2 + [gr_update(visible=True, value='')] + [gr_update(visible=False)]*2 +[gr_update(visible=True)] + [gr_update(visible=False)]
        else:  # 验证失败, 重新输入
            if 'error:' in next_cmd:
                count = next_cmd.split(':')[1]
                note = note2_4 + f'还剩<span style="color: {theme_color[state["__theme"]]};">{count}</span>次机会。'
            else:
                note = note2_4
            result = [note] + [gr_update(visible=False)] + [gr_update(visible=True)] + [gr_update(visible=True, value='')] + [gr_update(visible=True)] + [gr_update(visible=False)]*5
    else: # 验证码格式错误, 重新输入
        result = [note2_3] + [gr_update(visible=False)] + [gr_update(visible=True)] + [gr_update(visible=True, value='')] + [gr_update(visible=True)] + [gr_update(visible=False)]*5
    return result

def set_phrases(input_id_info, state, phrase, steps, activation_confirmed=False):
    state = ensure_identity_state_defaults(state)
    if steps == 'set':
        if check_phrase(phrase):  # 第一次设置, 要求二次确认
            state["user_phrase"] = phrase
            result = [note2_2] + [gr_update(visible=False)] + [gr_update(visible=True)] + [gr_update(visible=False)]*2 + [gr_update(visible=True, value='')] + [gr_update(visible=False)] + [gr_update(visible=True)] + [gr_update(visible=False)]*2
        else: # 口令格式不对, 重新设置
            result = [note2_5] + [gr_update(visible=False)] + [gr_update(visible=True)] + [gr_update(visible=False)]*2 + [gr_update(visible=True, value='')] + [gr_update(visible=True)] + [gr_update(visible=False)]*3
    else:
        if requires_multi_user_activation(activation_confirmed):
            return _identity_activation_required_result(state)
        if state["user_phrase"] == phrase:
            inputs = input_id_info.split(',')
            nick, tele = inputs[0].strip(), inputs[1].strip()
            was_local_activation = is_local_mode()
            context = shared.token.set_phrase_and_get_context(nick, tele, phrase)
            if not shared.token.is_guest(context.get_did()):
                _apply_identity_context(state, context)
                note = get_bound_identity_note(context, state.get("__lang"))
                if normalize_ui_lang(state.get("__lang")) == "en":
                    phrase_note = (
                        "The identity passphrase has been set. It cannot be changed or recovered. "
                        "Keep the offline record private and export the identity QR code now for future rebinding."
                    )
                    if was_local_activation:
                        phrase_note = f"Multi-user Mode is now enabled. {phrase_note}"
                else:
                    phrase_note = (
                        "身份口令设置成功。口令无法修改或找回，请妥善保存离线记录，并立即导出身份二维码，便于以后重新绑定。"
                    )
                    if was_local_activation:
                        phrase_note = f"多用户模式现已启用。{phrase_note}"
                if note == note3:
                    note = phrase_note
                else:
                    note = f'{note}<br>{phrase_note}'
                result = [note] + [gr_update(visible=False)]*4 + [gr_update(visible=True, value="")] + [gr_update(visible=False)]*3 + [gr_update(visible=True)]
            else: # 设置身份口令失败, 重新设置
                result = [note2_6] + [gr_update(visible=True)] + [gr_update(visible=False)] + [gr_update(visible=False)]*7
        else: # 口令两次不一致, 重新设置
            result = [note2_7] + [gr_update(visible=False)] + [gr_update(visible=True)] + [gr_update(visible=False)]*2 + [gr_update(visible=True, value='')]+ [gr_update(visible=True)] + [gr_update(visible=False)]*3
        state["user_phrase"] = ''
    id_info = build_current_id_info(state["user"].get_nickname(), state["user"].get_did(), state["sys_did"], state["__theme"], state.get("__lang"))
    upstream_status = gr_update(visible=not is_export_qr(state["user"].get_did()), value=upstream_status_text)
    export_qr = gr_update(visible=is_export_qr(state["user"].get_did()))
    return result + [id_info, upstream_status, export_qr]

def confirm_identity(input_id_info, state, phrase, activation_confirmed=False):
    state = ensure_identity_state_defaults(state)
    if requires_multi_user_activation(activation_confirmed):
        return _identity_activation_required_result(state)
    if check_phrase(phrase):
        inputs = input_id_info.split(',')
        nick, tele, user_did = inputs[0].strip(), inputs[1].strip(), inputs[2].strip()
        context = shared.token.get_user_context_with_phrase(nick, tele, user_did, phrase)
        if shared.token.is_guest(context.get_did()): # 口令不对, 绑定失败, 重新输入口令, 再次绑定
            failure_note = get_identity_mode_text("identity_phrase_failed", state.get("__lang"))
            failure_note = f'{failure_note}\n\n{get_admin_recovery_guide(state.get("__lang"))}'
            result = [failure_note] + [gr_update(visible=False)] + [gr_update(visible=True)] + [gr_update(visible=False)]*2 + [gr_update(visible=True, value='')] + [gr_update(visible=False)]*2 +[gr_update(visible=True)] + [gr_update(visible=False)]
        else: # 绑定成功, 转解绑输入
            _apply_identity_context(state, context)
            result = [get_bound_identity_note(context, state.get("__lang"))] + [gr_update(visible=False)]*4 + [gr_update(visible=True, value="")] + [gr_update(visible=False)]*3 + [gr_update(visible=True)]
    else: # 口令格式不对, 重新输入口令, 再次绑定
        format_note = get_identity_mode_text("identity_phrase_format_invalid", state.get("__lang"))
        result = [format_note] + [gr_update(visible=False)] + [gr_update(visible=True)] + [gr_update(visible=False)]*2 + [gr_update(visible=True, value='')] + [gr_update(visible=False)]*2 +[gr_update(visible=True)] + [gr_update(visible=False)]
    id_info = build_current_id_info(state["user"].get_nickname(), state["user"].get_did(), state["sys_did"], state["__theme"], state.get("__lang"))
    upstream_status = gr_update(visible=not is_export_qr(state["user"].get_did()), value=upstream_status_text)
    export_qr = gr_update(visible=is_export_qr(state["user"].get_did()))
    return result + [id_info, upstream_status, export_qr]

def unbind_identity(input_id_info, state, phrase):
    state = ensure_identity_state_defaults(state)
    if check_phrase(phrase):
        context = shared.token.unbind_and_return_guest(state["user"].get_did(), phrase)
        if shared.token.is_guest(context.get_did()):
            _apply_identity_context(state, context, close_preset_store=True)
            result = [note4, gr_update(visible=True)] + [gr_update(visible=False)]*8 + ['', '86-CN-中国', '', None]
        else: # 口令不对, 解绑失败, 重新输入口令, 再次解绑
            result = [note4_1] + [gr_update(visible=False)]*4 + [gr_update(visible=True, value="")] + [gr_update(visible=False)]*3 + [gr_update(visible=True)] + ['', '86-CN-中国', '', None]
    else: # 口令格式不对, 重新输入口令, 再次解绑
        result = [note3_2] + [gr_update(visible=False)]*4 + [gr_update(visible=True, value="")] + [gr_update(visible=False)]*3 +[gr_update(visible=True)] + ['', '86-CN-中国', '', None]
    id_info = build_current_id_info(state["user"].get_nickname(), state["user"].get_did(), state["sys_did"], state["__theme"], state.get("__lang"))
    upstream_status = gr_update(visible=not is_export_qr(state["user"].get_did()), value=upstream_status_text)
    export_qr = gr_update(visible=is_export_qr(state["user"].get_did()))
    return result + [id_info, upstream_status, export_qr]


# [identity_dialog, current_id_info, identity_export_btn]
# [identity_note_info, input_identity, input_id_display, identity_vcode_input, identity_verify_button, identity_phrase_input, identity_phrases_set_button, identity_phrases_confirm_button, identity_confirm_button, identity_unbind_button]
# [identity_nick_input, identity_tele_input, identity_qr]
def toggle_identity_dialog(state):
    if 'identity_dialog' in state:
        flag = state['identity_dialog']
    else:
        state['identity_dialog'] = False
        flag = False
    state['identity_dialog'] = not flag
    is_guest = shared.token.is_guest(state["user"].get_did())
    util.log_ui_trace(
        logger,
        "[UI-TRACE] identity.toggle | old_flag=%s, new_flag=%s, is_guest=%s",
        flag,
        state['identity_dialog'],
        is_guest,
    )
    result = [get_identity_dialog_note(state["user"].get_did(), state.get("__lang"))] + [gr_update(visible=is_guest)] + [gr_update(visible=False)]*3 + [gr_update(visible=not is_guest)] + [gr_update(visible=False)]*3 + [gr_update(visible=not is_guest)] + ['', '86-CN-中国', '', None]
    upstream_status = gr_update(visible=not is_export_qr(state["user"].get_did()), value=upstream_status_text)
    export_qr = gr_update(visible=is_export_qr(state["user"].get_did()))
    result = [gr_update(visible=not flag), build_current_id_info(state["user"].get_nickname(), state["user"].get_did(), state["sys_did"], state["__theme"], state.get("__lang")), upstream_status, export_qr] + result
    return result

def check_input(nick, tele):
    length = 0
    for n in nick:
        length += 1
        if util.is_chinese(n):
            length += 1
    if length < 4 or length > 24:
        return False

    tele = str(tele or "").strip()
    if not tele:
        return True

    if len(tele)<8 or len(tele)>15 or not tele.isdigit() or tele[0] == '0':
        return False

    if tele.startswith('86') and tele!='8610000000001':
        if len(tele)!=13 or not tele.isdigit() or tele[2] != '1' or tele[3] in ['0', '1', '2']:
            return False

    return True

def check_phrase(phrase):
    if len(phrase) < 8 or len(phrase) > 16:
        return False
    if not re.match(r'^[a-zA-Z0-9]+$', phrase):
        return False
    if not re.search(r'[a-z]', phrase) or not re.search(r'[A-Z]', phrase) or not re.search(r'[0-9]', phrase):
        return False
    
    return True

def check_vcode(vcode):
    if len(vcode)<4 or len(vcode)>6:
        return False
    return True

get_local_url = f'{args_manager.args.webroot}'
logo_img_path = os.path.abspath(f'./presets/image/simpai_logo.jpg')
logo_img_url = f'{get_local_url}/file={logo_img_path}'
logo_img_html = f'<div align=center><a target= "_blank" href="http://simpai.cn"><img width=149 src={logo_img_url}></a></div><br>'

self_contact = '''
<b>SimpAI Studio</b> - 开源AI创意生图本地平台<br>
由Fooocus迭代而来，融合WebUI易用交互、ComfyUI工作流能力与自研前端创作工作台。<br>
<br>
<b>核心特性:</b><br>
• 双模式驱动: WebUI模式快捷出图，ComfyUI模式专业编排，一键切换<br>
• 创作工作台: 内置无限画布、图片中转站、图层编辑器与Mask编辑器，支持素材管理和多节点创作流<br>
• 开放架构: Python/Gradio承载主界面与任务桥接，JavaScript/CSS扩展交互层，ComfyUI API驱动生成工作流<br>
• 多模型支持: 覆盖SDXL/Flux/Qwen/Wan等主流开源模型，支持图像/视频生成、编辑、修复与增强<br>
• 智能辅助: VLM智能体辅助提示词扩写与翻译，结合3D打光、SAM视频分割、WD14等工具提升创作效率<br>
• 本地与分布式: 本地部署保障数据安全，支持多用户身份隔离、项目保存与个性化管理<br>
<br>
<b>资源链接:</b><br>
Wiki: <a target= "_blank" href="http://simpai.cn">http://simpai.cn</a><br>
Github: <a target= "_blank" href="https://github.com/Windecay/SimpAI_Studio">https://github.com/Windecay/SimpAI_Studio</a><br>
历史分支: <a target= "_blank" href="https://github.com/metercai/SimpleSDXL">SimpleSDXL</a> | <a target= "_blank" href="https://github.com/Windecay/SimpleSDXL">SimpleSDXL(dev)</a><br>
QQ群: 1005085136<br>
'''

self_contact = logo_img_html + self_contact
