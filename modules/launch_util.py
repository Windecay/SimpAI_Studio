import os
import importlib
import importlib.util
import shutil
import subprocess
import sys
import re
import logging
import importlib.metadata
import packaging.version
import pygit2
from pathlib import Path
from typing import NamedTuple
from build_launcher import python_embeded_path
import logging
from enhanced.logger import format_name
logger = logging.getLogger(format_name(__name__))

pygit2.option(pygit2.GIT_OPT_SET_OWNER_VALIDATION, 0)

logging.getLogger("torch.distributed.nn").setLevel(logging.ERROR)  # sshh...
logging.getLogger("xformers").addFilter(lambda record: 'A matching Triton is not available' not in record.getMessage())

re_requirement = re.compile(r"\s*([-_a-zA-Z0-9]+)\s*(?:==\s*([-+_.a-zA-Z0-9]+))?\s*")
re_req_local_file = re.compile(r"\S*/([-_a-zA-Z0-9]+)-([0-9]+).([0-9]+).([0-9]+)[-_a-zA-Z0-9]*([\.tar\.gz|\.whl]+)\s*")
#re_requirement = re.compile(r"\s*([-\w]+)\s*(?:==\s*([-+.\w]+))?\s*")

python = sys.executable
default_command_live = (os.environ.get('LAUNCH_LIVE_OUTPUT') == "1")
index_url = os.environ.get('INDEX_URL', "https://mirrors.aliyun.com/pypi/simple")
extra_index_url = "https://pypi.tuna.tsinghua.edu.cn/simple"

target_path_install = f' -t {os.path.join(python_embeded_path, "Lib/site-packages")}' if sys.platform.startswith("win") else ''
re_pip_raw_progress = re.compile(r"^Progress\s+(\d+)\s+of\s+(\d+)\s*$")

modules_path = os.path.dirname(os.path.realpath(__file__))
script_path = os.path.dirname(modules_path)
dir_repos = "repos"
_GPU_VENDOR_NVIDIA = "10DE"
_GPU_VENDOR_AMD = "1002"
_GPU_VENDOR_INTEL = "8086"


class RuntimeProfile(NamedTuple):
    profile_name: str
    backend_kind: str | None
    vendor_ids: tuple[str, ...]
    detection_source: str

def _format_download_size(byte_count):
    value = float(max(0, byte_count))
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024 or unit == "GB":
            if unit == "B":
                return f"{int(value)} {unit}"
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} GB"


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


def _torch_backend_kind(torch_module=None):
    module = torch_module
    if module is None:
        try:
            import torch as imported_torch
        except Exception:
            return None
        module = imported_torch

    try:
        version_info = getattr(module, "version", None)
        if getattr(version_info, "hip", None):
            return "hip"
        if getattr(version_info, "cuda", None):
            return "cuda"
    except Exception:
        pass

    xpu = getattr(module, "xpu", None)
    if xpu is not None:
        try:
            if xpu.is_available():
                return "xpu"
        except Exception:
            pass

    return None


def detect_runtime_profile(torch_module=None):
    backend_kind = _torch_backend_kind(torch_module)
    vendor_ids = tuple(sorted(_windows_display_vendor_ids()))

    if backend_kind == "cuda":
        return RuntimeProfile("nvidia_cuda", backend_kind, vendor_ids, "torch")
    if backend_kind == "hip":
        return RuntimeProfile("amd_compatible", backend_kind, vendor_ids, "torch")
    if backend_kind == "xpu":
        return RuntimeProfile("intel_compatible", backend_kind, vendor_ids, "torch")

    if vendor_ids and _GPU_VENDOR_NVIDIA not in vendor_ids:
        if _GPU_VENDOR_AMD in vendor_ids:
            return RuntimeProfile("amd_compatible", backend_kind, vendor_ids, "vendor_id")
        if _GPU_VENDOR_INTEL in vendor_ids:
            return RuntimeProfile("intel_compatible", backend_kind, vendor_ids, "vendor_id")
        return RuntimeProfile("other_compatible", backend_kind, vendor_ids, "vendor_id")

    # Preserve the existing NVIDIA-first path unless we can clearly prove otherwise.
    return RuntimeProfile("nvidia_cuda", backend_kind, vendor_ids, "default")


def _format_progress_bar(current, total, width=24):
    if total <= 0:
        return None
    ratio = max(0.0, min(1.0, current / total))
    filled = min(width, int(round(ratio * width)))
    bar = "#" * filled + "-" * (width - filled)
    percent = ratio * 100
    return f"  Downloading [{bar}] {percent:5.1f}% ({_format_download_size(current)} / {_format_download_size(total)})\n"


class PipRawProgressFormatter:
    def __init__(self, step_percent=5):
        self.step_percent = max(1, int(step_percent))
        self.last_bucket = None

    def format(self, line):
        text = line.rstrip("\r\n")
        match = re_pip_raw_progress.match(text)
        if match is None:
            self.last_bucket = None
            return line

        current = int(match.group(1))
        total = int(match.group(2))
        if total <= 0:
            return None

        percent = max(0, min(100, int((current * 100) / total)))
        bucket = percent // self.step_percent
        if current < total and bucket == self.last_bucket:
            return None

        self.last_bucket = bucket
        if current >= total:
            self.last_bucket = None
        return _format_progress_bar(current, total)


def _run_live(command, run_kwargs):
    formatter = PipRawProgressFormatter()
    output = []
    popen_kwargs = dict(run_kwargs)
    popen_kwargs["stdout"] = subprocess.PIPE
    popen_kwargs["stderr"] = subprocess.STDOUT
    popen_kwargs["bufsize"] = 1

    process = subprocess.Popen(**popen_kwargs)
    if process.stdout is not None:
        for line in process.stdout:
            output.append(line)
            display_line = formatter.format(line)
            if display_line is None:
                continue
            sys.stdout.write(display_line)
            sys.stdout.flush()
    returncode = process.wait()
    return subprocess.CompletedProcess(command, returncode, stdout="".join(output), stderr="")

def git_clone(url, dir, name=None, hash=None):
    try:
        try:
            repo = pygit2.Repository(dir)
        except:
            Path(dir).parent.mkdir(exist_ok=True)
            repo = pygit2.clone_repository(url, str(dir))

        remote_name = 'origin'
        remote = repo.remotes[remote_name]
        remote.fetch()

        branch_name = repo.head.shorthand
        local_branch_ref = f'refs/heads/{branch_name}'

        if branch_name != name:
            branch_name = name
            local_branch_ref = f'refs/heads/{branch_name}'
            if local_branch_ref not in list(repo.references):
                remote_reference = f'refs/remotes/{remote_name}/{branch_name}'
                remote_branch = repo.references[remote_reference]
                new_branch = repo.create_branch(branch_name, repo[remote_branch.target.hex])
                new_branch.upstream = remote_branch
            else:
                new_branch = repo.lookup_branch(branch_name)
            repo.checkout(new_branch)
            local_branch_ref = f'refs/heads/{branch_name}'

        local_branch = repo.lookup_reference(local_branch_ref)
        if hash is None:
            commit = repo.revparse_single(local_branch_ref)
        else:
            commit = repo.get(hash)

        remote_url = repo.remotes[remote_name].url
        repo_name = remote_url.split('/')[-1].split('.git')[0]

        repo.checkout_tree(commit, strategy=pygit2.GIT_CHECKOUT_FORCE)
        logger.info(f"{repo_name} {str(commit.id)[:7]} update check complete.")
    except Exception as e:
        logger.info(f"Git clone failed for {url}: {str(e)}")


def repo_dir(name):
    return str(Path(script_path) / dir_repos / name)


def is_installed(package):
    try:
        spec = importlib.util.find_spec(package)
    except ModuleNotFoundError:
        return False

    return spec is not None


def run(command, desc=None, errdesc=None, custom_env=None, live: bool = default_command_live) -> str:
    if desc is not None:
        logger.info(desc)

    run_kwargs = {
        "args": command,
        "shell": True,
        "env": os.environ if custom_env is None else custom_env,
        "encoding": 'utf8',
        "errors": 'ignore',
    }
    
    if live:
        result = _run_live(command, run_kwargs)
    else:
        run_kwargs["stdout"] = run_kwargs["stderr"] = subprocess.PIPE
        result = subprocess.run(**run_kwargs)

    if result.returncode != 0:
        error_bits = [
            f"{errdesc or 'Error running command'}.",
            f"Command: {command}",
            f"Error code: {result.returncode}",
        ]
        if result.stdout:
            error_bits.append(f"stdout: {result.stdout}")
        if result.stderr:
            error_bits.append(f"stderr: {result.stderr}")
        raise RuntimeError("\n".join(error_bits))

    return (result.stdout or "")

def _make_pip_env(base_env=None):
    env = (os.environ if base_env is None else base_env).copy()
    env["PYTHONNOUSERSITE"] = "1"
    env["PIP_USER"] = "0"
    env["PIP_PROGRESS_BAR"] = "raw"
    env.pop("PYTHONPATH", None)
    env.pop("PYTHONHOME", None)
    return env


def run_pip(command, desc=None, live=default_command_live):
    try:
        index_url_line = f' --index-url {index_url}' if index_url != '' else ''
        index_url_line = f'{index_url_line} --extra-index-url {extra_index_url}' if extra_index_url != '' else index_url_line
        return run(
            f'"{python}" -s -m pip {command} {target_path_install} --prefer-binary{index_url_line}',
            desc=f"Installing {desc}",
            errdesc=f"Couldn't install {desc}",
            custom_env=_make_pip_env(),
            live=live,
        )
    except Exception as e:
        logger.info(e)
        logger.info(f'CMD Failed {desc}: {command}')
        return None


met_diff = {}
def requirements_met(requirements_file):
    global met_diff

    import platform

    met_diff = {}
    result = True
    with open(requirements_file, "r", encoding="utf8") as file:
        for line in file:
            if line.strip() == "":
                continue
            if 'platform_system' in line and platform.system() not in line:
                continue

            m = re.match(re_requirement, line)
            if m:
                package = m.group(1).strip()
                version_required = (m.group(2) or "").strip()
            else:
                m1 = re.match(re_req_local_file, line)
                if m1 is None:
                    continue
                package = m1.group(1).strip()
                if line.strip().endswith('.whl'):
                    package = package.replace('_', '-')
                version_required = f'{m1.group(2)}.{m1.group(3)}.{m1.group(4)}'
            
            if line.startswith("--"):
                continue

            try:
                version_installed = importlib.metadata.version(package)
            except Exception:
                met_diff.update({package:'-'})
                result = False
                continue

            if not isinstance(version_installed, str) or not version_installed.strip():
                met_diff.update({package:'-'})
                logger.warning(
                    "Invalid installed version for %s: %r. Package metadata may be incomplete.",
                    package, version_installed,
                )
                result = False
                continue

            if version_required=='':
                continue

            try:
                versions_match = packaging.version.parse(version_required) == packaging.version.parse(version_installed)
            except packaging.version.InvalidVersion as e:
                met_diff.update({package:version_installed})
                logger.warning(
                    "Cannot compare versions for %s: installed=%r, required=%r (%s)",
                    package, version_installed, version_required, e,
                )
                result = False
                continue

            if not versions_match:
                met_diff.update({package:version_installed})
                logger.info(f"Version mismatch for {package}: Installed version {version_installed} does not meet requirement {version_required}")
                result = False

    return result

def is_installed_version(package, version_required):
    try:
        version_installed = importlib.metadata.version(package)
        return packaging.version.parse(version_required) == packaging.version.parse(version_installed)
    except Exception:
        return False


def delete_folder_content(folder, prefix=None):
    result = True

    for filename in os.listdir(folder):
        file_path = os.path.join(folder, filename)
        try:
            if os.path.isfile(file_path) or os.path.islink(file_path):
                os.unlink(file_path)
            elif os.path.isdir(file_path):
                shutil.rmtree(file_path)
        except Exception as e:
            logger.info(f'{prefix}Failed to delete {file_path}. Reason: {e}')
            result = False

    return result
