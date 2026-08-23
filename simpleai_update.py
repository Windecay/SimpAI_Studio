#!/usr/bin/env python3
"""Standalone updater for portable SimpAI_Studio packages."""

from __future__ import annotations

import argparse
import datetime as dt
import filecmp
import importlib.metadata as importlib_metadata
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path


STUDIO_ROOT = Path(__file__).resolve().parent
PACKAGE_ROOT = STUDIO_ROOT.parent
DEFAULT_REPO_URL = "https://github.com/Windecay/SimpAI_Studio"
DEFAULT_BRANCH = "main"
BACKUP_DIR_NAME = "update_backups"
MANAGED_STATE_NAME = "managed_files.json"
DEFAULT_LOG_COUNT = 20
DEPENDENCY_UPDATE_FAILED = 6
ROOT_REQUIREMENTS_FILE = STUDIO_ROOT / "requirements.txt"
DEFAULT_INDEX_URL = os.environ.get("INDEX_URL", "https://mirrors.aliyun.com/pypi/simple")
EXTRA_INDEX_URL = "https://pypi.tuna.tsinghua.edu.cn/simple"

# Keep this list aligned with launch.py's startup package checks.
RUNTIME_UPDATE_PACKAGES = (
    ("comfyui-frontend-package", "1.49.6", None),
    ("comfyui-workflow-templates", "0.11.44", None),
    ("comfyui-embedded-docs", "0.5.10", None),
    ("comfy-kitchen", "0.2.31", None),
    ("comfy-aimdo", "0.4.13", None),
    ("av", "17.0.0", None),
    ("PyOpenGL", None, ">=3.1.8"),
    ("comfy-angle", None, None),
    ("lmdb", "2.2.1", None),
    ("shtab", "1.8.0", None),
    ("tyro", "0.8.5", None),
)
BITSANDBYTES_VERSION = "0.45.5"

PROTECTED_TOP_LEVEL_DIRS = {
    ".cache",
    ".git",
    ".pytest_cache",
    BACKUP_DIR_NAME,
    "cache",
    "debug_logs",
    "logs",
    "models",
    "outputs",
    "tmp",
    "users",
}

PROTECTED_TOP_LEVEL_FILES = {
    "auth.json",
    "hash_cache.txt",
    "params.txt",
}

IGNORED_ANYWHERE = {
    "__pycache__",
}


def print_header(title: str) -> None:
    print()
    print("=" * 64)
    print(title)
    print("=" * 64)


def utc_stamp() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d_%H%M%S")


def is_ignored_relative_path(rel_path: Path) -> bool:
    parts = rel_path.parts
    if not parts:
        return True

    if any(part in IGNORED_ANYWHERE for part in parts):
        return True

    top = parts[0]
    if len(parts) == 1 and top in PROTECTED_TOP_LEVEL_FILES:
        return True
    if top in PROTECTED_TOP_LEVEL_DIRS:
        return True
    if rel_path.suffix.lower() in {".pyc", ".pyo"}:
        return True
    return False


def same_file(source: Path, destination: Path) -> bool:
    if not destination.exists() or not destination.is_file():
        return False
    if source.stat().st_size != destination.stat().st_size:
        return False
    return filecmp.cmp(source, destination, shallow=False)


def safe_destination(root: Path, rel_path: Path) -> Path:
    destination = (root / rel_path).resolve()
    root_resolved = root.resolve()
    try:
        destination.relative_to(root_resolved)
    except ValueError as exc:
        raise ValueError(f"Unsafe update path: {rel_path}") from exc
    return destination


def backup_existing_file(source_root: Path, rel_path: Path, backup_root: Path) -> None:
    source = safe_destination(source_root, rel_path)
    if not source.is_file():
        return

    destination = safe_destination(backup_root, rel_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def copy_tree_update(
    source_root: Path,
    destination_root: Path,
    *,
    dry_run: bool = False,
    no_backup: bool = False,
) -> dict[str, int | str]:
    backup_root = destination_root / BACKUP_DIR_NAME / utc_stamp()
    copied = 0
    updated = 0
    unchanged = 0
    skipped = 0
    backed_up = 0
    managed_files: list[str] = []

    for source in sorted(source_root.rglob("*")):
        if not source.is_file():
            continue

        rel_path = source.relative_to(source_root)
        if is_ignored_relative_path(rel_path):
            skipped += 1
            continue

        managed_files.append(rel_path.as_posix())
        destination = safe_destination(destination_root, rel_path)
        if same_file(source, destination):
            unchanged += 1
            continue

        if destination.exists():
            updated += 1
            if not no_backup and not dry_run:
                backup_existing_file(destination_root, rel_path, backup_root)
                backed_up += 1
        else:
            copied += 1

        if dry_run:
            continue

        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)

    if not dry_run:
        state_root = destination_root / BACKUP_DIR_NAME
        state_root.mkdir(parents=True, exist_ok=True)
        state = {
            "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "source_root": str(source_root),
            "managed_files": managed_files,
        }
        (state_root / MANAGED_STATE_NAME).write_text(
            json.dumps(state, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    return {
        "copied": copied,
        "updated": updated,
        "unchanged": unchanged,
        "skipped": skipped,
        "backed_up": backed_up,
        "backup_root": str(backup_root) if backed_up else "",
    }


def github_zip_url(repo_url: str, branch: str) -> str:
    override = os.environ.get("SIMPAI_UPDATE_ZIP_URL", "").strip()
    if override:
        return override

    repo = repo_url.rstrip("/")
    if repo.endswith(".git"):
        repo = repo[:-4]
    quoted_branch = urllib.parse.quote(branch, safe="/")
    return f"{repo}/archive/refs/heads/{quoted_branch}.zip"


def download_zip(url: str, destination: Path) -> None:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "SimpAI-Studio-Updater",
        },
    )
    print(f"下载地址: {url}")

    with urllib.request.urlopen(request, timeout=60) as response:
        total_raw = response.headers.get("Content-Length")
        total = int(total_raw) if total_raw and total_raw.isdigit() else 0
        downloaded = 0
        last_report = 0
        report_step = 25 * 1024 * 1024

        with destination.open("wb") as f:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                if downloaded - last_report >= report_step:
                    if total:
                        print(f"下载中: {downloaded / 1024 / 1024:.1f} / {total / 1024 / 1024:.1f} MB")
                    else:
                        print(f"下载中: {downloaded / 1024 / 1024:.1f} MB")
                    last_report = downloaded

    print(f"下载完成: {destination}")


def _package_install_spec(pkg_name: str, pkg_version: str | None = None, version_specifier: str | None = None) -> str:
    if pkg_version:
        return f"{pkg_name}=={pkg_version}"
    if version_specifier:
        return f"{pkg_name}{version_specifier}"
    return pkg_name


def _installed_package_version(package: str) -> str | None:
    try:
        return importlib_metadata.version(package)
    except importlib_metadata.PackageNotFoundError:
        return None
    except Exception:
        return None


def _package_requirement_met(
    package: str,
    pkg_version: str | None = None,
    version_specifier: str | None = None,
) -> bool:
    installed = _installed_package_version(package)
    if installed is None:
        return False
    if not pkg_version and not version_specifier:
        return True

    try:
        from packaging import specifiers as packaging_specifiers
        from packaging import version as packaging_version

        installed_version = packaging_version.parse(installed)
        if pkg_version:
            return installed_version == packaging_version.parse(pkg_version)
        return installed_version in packaging_specifiers.SpecifierSet(version_specifier or "")
    except Exception:
        return False


def _make_pip_env() -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONNOUSERSITE"] = "1"
    env["PIP_USER"] = "0"
    env["PIP_PROGRESS_BAR"] = "raw"
    env.pop("PYTHONPATH", None)
    env.pop("PYTHONHOME", None)
    return env


def _portable_site_packages() -> Path | None:
    if not sys.platform.startswith("win"):
        return None
    site_packages = PACKAGE_ROOT / "python_embeded" / "Lib" / "site-packages"
    return site_packages if site_packages.is_dir() else None


def _pip_command(pip_args: list[str], index_url: str) -> list[str]:
    command = [sys.executable, "-s", "-m", "pip", *pip_args]
    site_packages = _portable_site_packages()
    if site_packages is not None:
        command.extend(["--target", str(site_packages)])
    command.append("--prefer-binary")
    if index_url:
        command.extend(["--index-url", index_url])
    return command


def pip_install_with_retry(pip_args: list[str], *, description: str) -> bool:
    indexes = []
    for label, index_url in (
        ("阿里云 / Alibaba Cloud", DEFAULT_INDEX_URL),
        ("清华大学 / Tsinghua University", EXTRA_INDEX_URL),
    ):
        if index_url and index_url not in {item[1] for item in indexes}:
            indexes.append((label, index_url))

    last_error: Exception | None = None
    for label, index_url in indexes:
        command = _pip_command(pip_args, index_url)
        print(f"> {subprocess.list2cmdline(command)}")
        try:
            subprocess.run(
                command,
                cwd=str(STUDIO_ROOT),
                check=True,
                env=_make_pip_env(),
            )
            return True
        except (OSError, subprocess.CalledProcessError) as exc:
            last_error = exc
            print(
                f"{description}失败，正在尝试{label}。 / {description} failed; retrying with {label}."
            )

    if last_error is not None:
        print(f"{description}失败: {last_error} / {description} failed: {last_error}")
    return False


def install_package_with_retry(
    pkg_name: str,
    pkg_version: str | None = None,
    description: str | None = None,
    version_specifier: str | None = None,
) -> bool:
    install_spec = _package_install_spec(pkg_name, pkg_version, version_specifier)
    install_description = description or f"更新包 {install_spec} / Update package {install_spec}"
    return pip_install_with_retry(
        ["install", "-U", install_spec],
        description=install_description,
    )


def is_nvidia_cuda_runtime() -> bool:
    try:
        import torch
    except Exception:
        return False
    version_info = getattr(torch, "version", None)
    return bool(getattr(version_info, "cuda", None))


def update_runtime_packages() -> int:
    print_header("更新启动依赖 / Update runtime dependencies")
    failed_packages: list[str] = []

    for pkg_name, pkg_version, version_specifier in RUNTIME_UPDATE_PACKAGES:
        install_spec = _package_install_spec(pkg_name, pkg_version, version_specifier)
        if _package_requirement_met(pkg_name, pkg_version, version_specifier):
            print(f"依赖已满足: {install_spec} / Requirement already satisfied: {install_spec}")
            continue

        success = install_package_with_retry(
            pkg_name,
            pkg_version,
            version_specifier=version_specifier,
        )
        if not success:
            failed_packages.append(install_spec)

    if is_nvidia_cuda_runtime() and sys.platform.startswith(("win", "linux")):
        if _package_requirement_met("bitsandbytes", BITSANDBYTES_VERSION):
            print(
                f"依赖已满足: bitsandbytes=={BITSANDBYTES_VERSION} / "
                f"Requirement already satisfied: bitsandbytes=={BITSANDBYTES_VERSION}"
            )
        elif not install_package_with_retry("bitsandbytes", BITSANDBYTES_VERSION):
            failed_packages.append(f"bitsandbytes=={BITSANDBYTES_VERSION}")
    else:
        print(
            "当前不是 NVIDIA CUDA 环境，跳过 bitsandbytes。 / "
            "The current runtime is not NVIDIA CUDA; skipping bitsandbytes."
        )

    if failed_packages:
        print(
            f"以下启动依赖更新失败: {', '.join(failed_packages)} / "
            f"The following runtime dependencies failed to update: {', '.join(failed_packages)}"
        )
        return DEPENDENCY_UPDATE_FAILED

    print("启动依赖更新完成。 / Runtime dependency update completed.")
    return 0


def refresh_root_requirements() -> int:
    print_header("刷新项目根 requirements.txt / Refresh root requirements.txt")
    if not ROOT_REQUIREMENTS_FILE.is_file():
        print(
            f"找不到项目根 requirements.txt: {ROOT_REQUIREMENTS_FILE} / "
            f"Project-root requirements.txt was not found: {ROOT_REQUIREMENTS_FILE}"
        )
        return 2

    success = pip_install_with_retry(
        ["install", "-U", "-r", str(ROOT_REQUIREMENTS_FILE)],
        description="刷新项目根 requirements.txt / Refresh root requirements.txt",
    )
    if success:
        print("项目根 requirements.txt 刷新完成。 / Root requirements.txt refresh completed.")
        return 0

    print("项目根 requirements.txt 刷新失败。 / Root requirements.txt refresh failed.")
    return DEPENDENCY_UPDATE_FAILED


def looks_like_studio_root(path: Path) -> bool:
    return (path / "entry_without_update.py").is_file() or (path / "launch.py").is_file()


def find_studio_source_root(extract_root: Path) -> Path:
    if looks_like_studio_root(extract_root):
        return extract_root

    child = extract_root / "SimpAI_Studio"
    if looks_like_studio_root(child):
        return child

    children = [path for path in extract_root.iterdir() if path.is_dir()]
    if len(children) == 1:
        only_child = children[0]
        if looks_like_studio_root(only_child):
            return only_child
        nested = only_child / "SimpAI_Studio"
        if looks_like_studio_root(nested):
            return nested

    for child in children:
        if looks_like_studio_root(child):
            return child

    raise RuntimeError("更新包里没有找到 SimpAI_Studio 源码目录。")


def update_from_latest_zip(args: argparse.Namespace) -> int:
    print_header("直接更新到最新源码包")
    print(f"目标目录: {STUDIO_ROOT}")
    print("保护目录: users, outputs, models, logs, cache, tmp")

    zip_url = args.zip_url or github_zip_url(args.repo, args.branch)

    with tempfile.TemporaryDirectory(prefix="simpai_update_") as temp_name:
        temp_root = Path(temp_name)
        archive_path = temp_root / "source.zip"
        extract_root = temp_root / "extract"
        extract_root.mkdir(parents=True, exist_ok=True)

        download_zip(zip_url, archive_path)
        with zipfile.ZipFile(archive_path, "r") as zf:
            zf.extractall(extract_root)

        source_root = find_studio_source_root(extract_root)
        print(f"源码目录: {source_root}")
        summary = copy_tree_update(
            source_root,
            STUDIO_ROOT,
            dry_run=args.dry_run,
            no_backup=args.no_backup,
        )

    print()
    if args.dry_run:
        print("预览完成，未修改文件。")
    else:
        print("更新完成。")
    print(f"新增文件: {summary['copied']}")
    print(f"更新文件: {summary['updated']}")
    print(f"未变化: {summary['unchanged']}")
    print(f"已跳过: {summary['skipped']}")
    print(f"已备份: {summary['backed_up']}")
    if summary["backup_root"]:
        print(f"备份目录: {summary['backup_root']}")
    print("直接更新模式不会删除本地已有文件；需要处理删除记录时请使用 Git 模式。")
    if args.dry_run or getattr(args, "skip_package_update", False):
        if args.dry_run:
            print("预览模式不会更新 Python 依赖。 / Dry-run mode does not update Python dependencies.")
        else:
            print("已跳过启动依赖更新。 / Runtime dependency update was skipped.")
        return 0
    return update_runtime_packages()


def git_available() -> bool:
    return shutil.which("git") is not None


def run_git(args: list[str], *, capture: bool = False, check: bool = True) -> subprocess.CompletedProcess[str]:
    display = " ".join(args)
    if not capture:
        print(f"> {display}")
    return subprocess.run(
        args,
        cwd=str(STUDIO_ROOT),
        check=check,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None,
        text=True,
    )


def git_output(args: list[str], *, check: bool = True) -> str:
    result = run_git(args, capture=True, check=check)
    return result.stdout.strip() if result.stdout else ""


def has_git_repo() -> bool:
    return (STUDIO_ROOT / ".git").exists()


def ensure_git_ready() -> bool:
    return can_use_git(verbose=True)


def can_use_git(*, verbose: bool) -> bool:
    if not git_available():
        if verbose:
            print("没有找到 git。")
        return False
    if not has_git_repo():
        if verbose:
            print("当前包没有 .git 目录，不能使用 Git 模式。")
        return False
    return True


def working_tree_dirty() -> str:
    return git_output(["git", "status", "--porcelain"], check=False)


def branch_name() -> str:
    return git_output(["git", "branch", "--show-current"], check=False)


def remote_branch_exists(name: str) -> bool:
    result = run_git(
        ["git", "rev-parse", "--verify", f"refs/remotes/origin/{name}"],
        capture=True,
        check=False,
    )
    return result.returncode == 0


def resolve_commit(ref: str) -> str | None:
    candidates = [ref, f"refs/tags/{ref}", f"origin/{ref}"]
    for candidate in candidates:
        result = run_git(
            ["git", "rev-parse", "--verify", f"{candidate}^{{commit}}"],
            capture=True,
            check=False,
        )
        if result.returncode == 0 and result.stdout:
            return result.stdout.strip()
    return None


def warn_force_sync_dirty_tree(dirty: str) -> None:
    if not dirty:
        return

    print("发现本地改动，Git 更新会按远端版本强制同步。 / Local changes found; Git update will force-sync to the remote version.")
    print("当前改动如下：")
    print(dirty)
    print("已跟踪文件的本地改动会被远端版本替换；未跟踪文件通常保留。")
    print("Tracked local changes will be replaced by the remote version; untracked files are usually kept.")


def force_sync_branch(target_branch: str) -> bool:
    if not remote_branch_exists(target_branch):
        print(f"找不到分支: {target_branch}")
        return False

    print(f"目标分支: {target_branch}")
    run_git(["git", "checkout", "--force", "-B", target_branch, f"origin/{target_branch}"])
    upstream_result = run_git(
        ["git", "branch", "--set-upstream-to", f"origin/{target_branch}", target_branch],
        capture=True,
        check=False,
    )
    if upstream_result.stdout:
        print(upstream_result.stdout.strip())
    run_git(["git", "reset", "--hard", f"origin/{target_branch}"])
    return True


def update_with_git(args: argparse.Namespace, ref: str | None = None) -> int:
    print_header("Git 更新")
    if not ensure_git_ready():
        return 2

    dirty = working_tree_dirty()
    warn_force_sync_dirty_tree(dirty)

    run_git(["git", "fetch", "origin", "--tags"])

    target_ref = (ref or args.ref or "").strip()
    if not target_ref:
        current_branch = branch_name()
        target_branch = current_branch or args.branch or DEFAULT_BRANCH
        if not force_sync_branch(target_branch):
            return 4
    elif remote_branch_exists(target_ref):
        if not force_sync_branch(target_ref):
            return 4
    else:
        commit = resolve_commit(target_ref)
        if not commit:
            print(f"找不到 Git 版本: {target_ref}")
            return 4
        print(f"目标版本: {target_ref} ({commit[:12]})")
        run_git(["git", "checkout", "--force", "--detach", commit])
        run_git(["git", "reset", "--hard", commit])

    print("Git 更新完成。")
    show_status()
    return 0


def offer_latest_zip_fallback(args: argparse.Namespace) -> int:
    print()
    print("Git 更新没有完成。")
    print("备用方式可以下载 main 源码包并覆盖本地源码文件。")
    print("它不会删除旧文件，也不会更新 python_embeded、users、outputs 或模型目录。")
    answer = input("是否使用这个备用方式？输入 y 继续，其它键取消: ").strip().lower()
    if answer not in {"y", "yes"}:
        print("已取消备用更新。")
        return 2
    return update_from_latest_zip(args)


def run_git_mode(args: argparse.Namespace, ref: str | None = None, *, prompt_backup: bool = False) -> int:
    try:
        result = update_with_git(args, ref=ref)
    except subprocess.CalledProcessError as exc:
        print("Git 命令执行失败。")
        if exc.stdout:
            print(exc.stdout)
        result = 2
    except Exception as exc:
        print(f"Git 更新异常: {exc}")
        result = 2

    if result == 2 and prompt_backup:
        return offer_latest_zip_fallback(args)
    if result == 0 and not getattr(args, "skip_package_update", False):
        return update_runtime_packages()
    return result


def show_status() -> int:
    print_header("当前版本")
    print(f"包根目录: {PACKAGE_ROOT}")
    print(f"源码目录: {STUDIO_ROOT}")

    if can_use_git(verbose=False):
        branch = branch_name() or "(detached)"
        commit = git_output(["git", "rev-parse", "--short", "HEAD"], check=False)
        print(f"Git 分支: {branch}")
        print(f"Git 提交: {commit}")
        dirty = working_tree_dirty()
        if dirty:
            print("未提交改动:")
            print(dirty)
        else:
            print("未提交改动: 无")
    else:
        state_path = STUDIO_ROOT / BACKUP_DIR_NAME / MANAGED_STATE_NAME
        if state_path.is_file():
            try:
                state = json.loads(state_path.read_text(encoding="utf-8"))
                print(f"上次直接更新时间: {state.get('updated_at', '')}")
                print(f"管理文件数: {len(state.get('managed_files', []))}")
            except Exception as exc:
                print(f"读取更新记录失败: {exc}")
        else:
            print("没有 Git 信息，也没有直接更新记录。")
    return 0


def normalize_log_count(value: int | str | None) -> int:
    try:
        count = int(value) if value is not None else DEFAULT_LOG_COUNT
    except (TypeError, ValueError):
        return DEFAULT_LOG_COUNT
    return max(1, min(count, 200))


def show_commit_log(args: argparse.Namespace) -> int:
    print_header("最近提交 / Recent commits")
    if not ensure_git_ready():
        return 2

    target_ref = (getattr(args, "ref", "") or "HEAD").strip() or "HEAD"
    count = normalize_log_count(getattr(args, "log_count", DEFAULT_LOG_COUNT))
    print(f"版本范围: {target_ref}")
    print(f"显示数量: {count}")

    result = run_git(
        [
            "git",
            "log",
            f"--max-count={count}",
            "--date=short",
            "--pretty=format:%h %ad %d %s",
            target_ref,
        ],
        capture=True,
        check=False,
    )
    if result.stdout:
        print(result.stdout.strip())
    if result.returncode != 0:
        print("读取 commit 列表失败。 / Failed to read commit list.")
        return 2
    if not result.stdout:
        print("没有找到 commit。 / No commits found.")
    return 0


def run_menu(args: argparse.Namespace) -> int:
    while True:
        print_header("SimpAI Studio 更新工具 / SimpAI Studio Update Tool")
        print("1. 使用 Git 更新当前分支 / Update current branch with Git")
        print("2. 使用 Git 更新到指定版本 / tag / commit / Update to a version / tag / commit with Git")
        print("3. 查看当前版本 / Show current version")
        print(f"4. 查看最近 {DEFAULT_LOG_COUNT} 个提交 / Show the latest {DEFAULT_LOG_COUNT} commits")
        print("5. 更新启动依赖 / Update runtime packages")
        print("6. 刷新项目根 requirements.txt / Refresh root requirements.txt")
        print("0. 退出 / Exit")
        choice = input("请选择 0-6 / Choose 0-6: ").strip()

        if choice == "1":
            return run_git_mode(args, prompt_backup=True)
        if choice == "2":
            target_ref = input("请输入版本 / tag / commit / branch / Enter version / tag / commit / branch: ").strip()
            if not target_ref:
                print("没有输入版本。 / No version was entered.")
                continue
            return run_git_mode(args, ref=target_ref, prompt_backup=True)
        if choice == "3":
            show_status()
            input("按回车返回菜单。 / Press Enter to return to the menu.")
            continue
        if choice == "4":
            show_commit_log(args)
            input("按回车返回菜单。 / Press Enter to return to the menu.")
            continue
        if choice == "5":
            update_runtime_packages()
            input("按回车返回菜单。 / Press Enter to return to the menu.")
            continue
        if choice == "6":
            refresh_root_requirements()
            input("按回车返回菜单。 / Press Enter to return to the menu.")
            continue
        if choice == "0":
            return 0

        print("请选择 0 到 6。 / Choose a number from 0 to 6.")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Update a portable SimpAI_Studio package.")
    parser.add_argument(
        "--mode",
        choices=["menu", "latest", "git", "status", "log", "packages", "requirements"],
        default="menu",
        help="Update mode. Default opens the interactive menu.",
    )
    parser.add_argument("--repo", default=os.environ.get("SIMPAI_UPDATE_REPO", DEFAULT_REPO_URL))
    parser.add_argument("--branch", default=os.environ.get("SIMPAI_UPDATE_BRANCH", DEFAULT_BRANCH))
    parser.add_argument("--zip-url", default=os.environ.get("SIMPAI_UPDATE_ZIP_URL", ""))
    parser.add_argument("--ref", default="", help="Git branch, tag, or commit used by --mode git.")
    parser.add_argument("--log-count", type=int, default=DEFAULT_LOG_COUNT, help="Number of commits shown by --mode log.")
    parser.add_argument("--dry-run", action="store_true", help="Preview latest-zip file changes.")
    parser.add_argument("--no-backup", action="store_true", help="Do not back up overwritten files in latest mode.")
    parser.add_argument(
        "--allow-dirty",
        action="store_true",
        help="Compatibility option. Git mode force-syncs tracked files by default.",
    )
    parser.add_argument(
        "--skip-package-update",
        action="store_true",
        help="Skip runtime package updates after a successful code update.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)

    if args.mode == "latest":
        return update_from_latest_zip(args)
    if args.mode == "git":
        return run_git_mode(args, prompt_backup=sys.stdin.isatty())
    if args.mode == "status":
        return show_status()
    if args.mode == "log":
        return show_commit_log(args)
    if args.mode == "packages":
        return update_runtime_packages()
    if args.mode == "requirements":
        return refresh_root_requirements()
    return run_menu(args)


if __name__ == "__main__":
    raise SystemExit(main())
