"""Build a small adapter ZIP and a pinned, independent Windows runtime ZIP.

Input: an existing embedded Python and an already installed standalone SDK
target. No downloads, pip installs, Studio site-packages, or credentials.
"""

import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import zipfile


ROOT = Path(__file__).resolve().parents[1]
RUNTIME_NAME = "SimpAI_MCP_runtime_win_x64_py313_2.3.0.zip"
BUNDLE_NAME = "SimpAI_MCP_win.zip"
PUBLISH_BASE = "https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/"
SKIP_PARTS = {"__pycache__", "tests", "test", "docs", "examples", "bin", ".git"}
SKIP_NAMES = {"pyvenv.cfg", "get-pip.py", "pywin32.version.txt", "PyWin32.chm"}
PRIVATE_SUFFIXES = (".credentials", ".sqlite", ".sqlite3", ".db", ".env", ".log")


def archive_path(value):
    if (not value or "\\" in value or value.startswith("/") or re.search(r'[<>:"|?*\x00-\x1f]', value)
            or any(part in {"", ".", ".."} or part.endswith((".", " "))
                   or re.match(r"^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)", part, re.I)
                   for part in value.split("/"))):
        raise ValueError("Unsafe archive path: " + value)
    return value


def safe_file(path, root):
    resolved = path.resolve()
    if path.is_symlink() or not resolved.is_relative_to(root.resolve()):
        raise ValueError("Package input escapes its source: " + str(path))
    return resolved


def add_file(archive, name, payload):
    entry = zipfile.ZipInfo(archive_path(name), (2026, 10, 6, 0, 0, 0))
    entry.compress_type = zipfile.ZIP_DEFLATED
    entry.external_attr = 0o100644 << 16
    archive.writestr(entry, payload, compresslevel=6)


def build(python_root, sdk_root, output, version="1.0.2"):
    python_root, sdk_root, output = Path(python_root).resolve(), Path(sdk_root).resolve(), Path(output).resolve()
    if not (python_root / "python313.dll").is_file() or not (python_root / "python313.zip").is_file():
        raise ValueError("Supply a CPython 3.13 Windows x64 embedded distribution")
    if sdk_root == (python_root / "Lib/site-packages").resolve() or sdk_root.is_relative_to(python_root):
        raise ValueError("Do not package Studio's Python dependencies")
    distributions = {dist.metadata["Name"].lower().replace("_", "-"): dist.version
                     for dist in importlib.metadata.distributions(path=[str(sdk_root)])}
    if distributions.get("mcp") != "2.3.0" or distributions.get("mcp-types") != "2.3.0" or "requests" not in distributions:
        raise ValueError("Supply the standalone mcp 2.3.0 SDK target including requests")
    if output.exists() and any(output.iterdir()):
        raise ValueError("Output must be a new or empty directory; existing artifacts are preserved")
    output.mkdir(parents=True, exist_ok=True)
    count = 0
    size = 0
    runtime_path = output / RUNTIME_NAME
    with zipfile.ZipFile(runtime_path, "x") as archive:
        for path in sorted(python_root.iterdir()):
            if not path.is_file() or path.name in SKIP_NAMES or path.suffix not in {".exe", ".dll", ".pyd", ".zip", ".txt"}:
                continue
            # Only the stdlib ZIP belongs here, never model/Studio archives.
            if path.suffix == ".zip" and path.name != "python313.zip":
                continue
            payload = safe_file(path, python_root).read_bytes()
            add_file(archive, path.name, payload)
            count += 1
            size += len(payload)
        payload = b"python313.zip\n.\nLib/site-packages\nimport site\n"
        add_file(archive, "python313._pth", payload)
        count += 1
        size += len(payload)
        # This SDK target is the only recursive source; caches, test fixtures,
        # installer entrypoints and private files never enter the runtime.
        for directory, children, files in os.walk(sdk_root, followlinks=False):
            children[:] = sorted(child for child in children if child not in SKIP_PARTS)
            for filename in sorted(files):
                if filename in SKIP_NAMES or filename.endswith((".pyc", ".pyo")):
                    continue
                if filename.lower().endswith(PRIVATE_SUFFIXES):
                    raise ValueError("Private file found in the SDK target: " + filename)
                path = Path(directory) / filename
                relative = path.relative_to(sdk_root).as_posix()
                payload = safe_file(path, sdk_root).read_bytes()
                add_file(archive, "Lib/site-packages/" + relative, payload)
                count += 1
                size += len(payload)
    sha = hashlib.sha256(runtime_path.read_bytes()).hexdigest()
    manifest = {"schema": 1, "version": version,
                "runtime": {"platform": "win_amd64", "python": "3.13", "sdk": "2.3.0",
                            "url": PUBLISH_BASE + RUNTIME_NAME, "sha256": sha,
                            "size": runtime_path.stat().st_size, "unpacked_size": size, "file_count": count},
                "dependencies": dict(sorted(distributions.items()))}
    manifest_bytes = (json.dumps(manifest, indent=2) + "\n").encode()
    bundle_path = output / BUNDLE_NAME
    with zipfile.ZipFile(bundle_path, "x") as archive:
        for name in ("setup.ps1", "README.md"):
            payload = (ROOT / "tools/mcp_windows" / name).read_bytes()
            # Windows PowerShell 5.1 needs a BOM for bilingual source text.
            if name.endswith(".ps1") and not payload.startswith(b"\xef\xbb\xbf"):
                payload = b"\xef\xbb\xbf" + payload
            add_file(archive, name, payload)
        add_file(archive, "modules/__init__.py", b"")
        add_file(archive, "modules/agent_mcp_client.py", (ROOT / "modules/agent_mcp_client.py").read_bytes())
        add_file(archive, "tools/studio_mcp.py", (ROOT / "tools/studio_mcp.py").read_bytes())
        add_file(archive, "tools/requirements-mcp.txt", (ROOT / "tools/requirements-mcp.txt").read_bytes())
        add_file(archive, "runtime-manifest.json", manifest_bytes)
    (output / "runtime-manifest.json").write_bytes(manifest_bytes)
    report = {"bundle": str(bundle_path), "bundle_size": bundle_path.stat().st_size,
              "bundle_sha256": hashlib.sha256(bundle_path.read_bytes()).hexdigest(),
              "runtime": str(runtime_path), **manifest["runtime"],
              "publish_directory": "windecay/SimpAI_dev", "published": False}
    (output / "build-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--python-root", required=True)
    parser.add_argument("--sdk-root", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.python_root, args.sdk_root, args.output), indent=2))


if __name__ == "__main__":
    main()
