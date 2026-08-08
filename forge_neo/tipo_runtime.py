from __future__ import annotations

import importlib
import importlib.metadata as importlib_metadata
import logging
import os
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
TIPO_EXTENSION_NAME = "z-tipo-extension"
TIPO_KGEN_DISTRIBUTION = "tipo-kgen"
TIPO_KGEN_MIN_VERSION = "0.3.0"
_INSTALL_LOCK = threading.Lock()
_LOGGER = logging.getLogger("forge_neo.tipo_runtime")


def tipo_extension_dir() -> Path:
    configured = str(
        os.environ.get("SIMPAI_TIPO_EXTENSION_DIR")
        or os.environ.get("FORGE_NEO_TIPO_EXTENSION_DIR")
        or ""
    ).strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return ROOT / "forge_neo" / "webui" / "extensions" / TIPO_EXTENSION_NAME


def _version_tuple(value: object) -> tuple[int, ...]:
    parts: list[int] = []
    for raw in str(value or "").split("."):
        digits = "".join(char for char in raw if char.isdigit())
        if not digits:
            break
        parts.append(int(digits))
    return tuple(parts or [0])


def _version_at_least(value: object, minimum: str = TIPO_KGEN_MIN_VERSION) -> bool:
    current = _version_tuple(value)
    target = _version_tuple(minimum)
    width = max(len(current), len(target))
    return current + (0,) * (width - len(current)) >= target + (0,) * (width - len(target))


def installed_tipo_kgen_version() -> str | None:
    try:
        return importlib_metadata.version(TIPO_KGEN_DISTRIBUTION)
    except importlib_metadata.PackageNotFoundError:
        return None
    except Exception:
        return None


def _skip_requested(argv: list[str] | None = None) -> bool:
    disabled = str(
        os.environ.get("SIMPAI_SKIP_TIPO_KGEN")
        or os.environ.get("FORGE_NEO_SKIP_TIPO_KGEN")
        or ""
    ).strip().lower()
    if disabled in {"1", "true", "yes", "on"}:
        return True
    values = sys.argv if argv is None else argv
    return any(str(item).split("=", 1)[0] == "--skip-install" for item in values)


def _tail(value: object, limit: int = 2000) -> str:
    return str(value or "").strip()[-limit:]


def _base_result(extension_dir: Path) -> dict[str, Any]:
    return {
        "package": TIPO_KGEN_DISTRIBUTION,
        "required_version": TIPO_KGEN_MIN_VERSION,
        "extension_dir": str(extension_dir),
        "installer": str(extension_dir / "install.py"),
        "version": installed_tipo_kgen_version(),
    }


def _log_result(result: dict[str, Any]) -> None:
    status = str(result.get("status") or "")
    version = str(result.get("version") or "")
    if status in {"ready", "installed"}:
        _LOGGER.info("TIPO runtime ready: %s==%s", TIPO_KGEN_DISTRIBUTION, version)
    elif status == "missing-extension":
        _LOGGER.debug("TIPO extension is not installed; skipping tipo-kgen bootstrap.")
    elif status == "skipped":
        _LOGGER.info("TIPO dependency bootstrap skipped by startup options.")
    else:
        _LOGGER.warning(
            "TIPO runtime is unavailable: status=%s, package=%s, detail=%s",
            status,
            TIPO_KGEN_DISTRIBUTION,
            result.get("error") or result.get("message") or "unknown error",
        )


def ensure_tipo_kgen_startup(
    *,
    python_executable: str | os.PathLike[str] | None = None,
    extension_dir: str | os.PathLike[str] | None = None,
    timeout: float = 180.0,
    argv: list[str] | None = None,
) -> dict[str, Any]:
    """Ensure TIPO's startup dependency exists when the extension is present."""
    target_dir = Path(extension_dir).expanduser().resolve() if extension_dir else tipo_extension_dir()
    result = _base_result(target_dir)

    if _skip_requested(argv):
        result["status"] = "skipped"
        _log_result(result)
        return result

    current_version = str(result.get("version") or "")
    if current_version and _version_at_least(current_version):
        result.update({"status": "ready", "version": current_version})
        _log_result(result)
        return result

    installer = target_dir / "install.py"
    if not target_dir.is_dir():
        result.update({"status": "missing-extension", "version": current_version or None})
        _log_result(result)
        return result
    if not installer.is_file():
        result.update({"status": "missing-installer", "error": str(installer)})
        _log_result(result)
        return result

    executable = str(python_executable or sys.executable)
    with _INSTALL_LOCK:
        importlib.invalidate_caches()
        current_version = installed_tipo_kgen_version()
        if current_version and _version_at_least(current_version):
            result.update({"status": "ready", "version": current_version})
            _log_result(result)
            return result

        env = os.environ.copy()
        env["PYTHONNOUSERSITE"] = "1"
        env["PIP_USER"] = "0"
        env["PIP_PROGRESS_BAR"] = "raw"
        command = [executable, "-s", str(installer)]
        try:
            completed = subprocess.run(
                command,
                cwd=str(ROOT),
                env=env,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout,
                check=False,
            )
        except Exception as exc:
            result.update({"status": "failed", "error": f"{type(exc).__name__}: {exc}"})
            _log_result(result)
            return result

        importlib.invalidate_caches()
        current_version = installed_tipo_kgen_version()
        result.update(
            {
                "status": "installed" if current_version and _version_at_least(current_version) else "failed",
                "version": current_version,
                "returncode": completed.returncode,
                "stdout": _tail(completed.stdout),
                "stderr": _tail(completed.stderr),
            }
        )
        if result["status"] == "failed":
            result["error"] = (
                result.get("stderr")
                or result.get("stdout")
                or f"install.py exited with code {completed.returncode}"
            )
        _log_result(result)
        return result
