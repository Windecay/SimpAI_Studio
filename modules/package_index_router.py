"""Package-aware mirror selection for Studio's dependency installation entries."""

import json
import os
import queue
import re
import signal
import ssl
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path
from typing import NamedTuple

from packaging.requirements import InvalidRequirement, Requirement
from packaging.specifiers import InvalidSpecifier, SpecifierSet
from packaging.tags import sys_tags
from packaging.utils import (
    InvalidSdistFilename,
    InvalidWheelFilename,
    canonicalize_name,
    parse_sdist_filename,
    parse_wheel_filename,
)
from packaging.version import Version


HUAWEI_INDEX_URL = "https://repo.huaweicloud.com/repository/pypi/simple"
TENCENT_INDEX_URL = "https://mirrors.cloud.tencent.com/pypi/simple"
PYPI_INDEX_URL = "https://pypi.org/simple"
PROBE_BYTES = 256 * 1024
PROBE_SECONDS = 3
INDEX_BYTES = 8 * 1024 * 1024
CACHE_SECONDS = 300
_tag_ranks = {tag: rank for rank, tag in enumerate(sys_tags())}
_python_version = Version(".".join(map(str, sys.version_info[:3])))
_index_cache = {}
_speed_cache = {}
_source_speeds = {}
_slow_sources = {}
_raw_progress = re.compile(r"^Progress (\d+) of (\d+)$")


class Source(NamedTuple):
    label: str
    url: str


class Artifact(NamedTuple):
    filename: str
    url: str
    version: Version
    wheel: bool
    tag_rank: int


class Attempt(NamedTuple):
    returncode: int
    installing: bool
    error: str


def package_sources(primary_url, extra_url):
    sources = []
    for label, url in (
        ("首选源 / Primary index", primary_url),
        ("清华源 / Tsinghua", extra_url),
        ("华为源 / Huawei", HUAWEI_INDEX_URL),
        ("腾讯源 / Tencent", TENCENT_INDEX_URL),
        ("官方 PyPI / Official PyPI", PYPI_INDEX_URL),
    ):
        url = url.rstrip("/") if url else ""
        if url and url not in {source.url for source in sources}:
            sources.append(Source(label, url))
    return sources


class _SimpleLinks(HTMLParser):
    def __init__(self, base_url):
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.files = []

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        attrs = dict(attrs)
        if not attrs.get("href"):
            return
        url = urllib.parse.urljoin(self.base_url, attrs["href"])
        self.files.append({
            "filename": urllib.parse.unquote(urllib.parse.urlsplit(url).path.rsplit("/", 1)[-1]),
            "url": url,
            "requires-python": attrs.get("data-requires-python"),
            "yanked": "data-yanked" in attrs,
        })


def _read_probe(response, limit, deadline, allow_partial=False):
    chunks = []
    size = 0
    while size < limit:
        if time.monotonic() >= deadline:
            if allow_partial:
                break
            raise TimeoutError("probe time limit exceeded")
        chunk = response.read1(min(16 * 1024, limit - size))
        if not chunk:
            break
        chunks.append(chunk)
        size += len(chunk)
    return b"".join(chunks)


def _compatible_artifacts(files, requirement, base_url):
    artifacts = []
    exact_pin = any(
        spec.operator in ("==", "===") and "*" not in spec.version
        for spec in requirement.specifier
    )
    for item in files:
        if not isinstance(item, dict) or not item.get("url"):
            continue
        yanked = item.get("yanked", False)
        if (isinstance(yanked, str) or yanked) and not exact_pin:
            continue
        filename = item.get("filename", "")
        if not isinstance(filename, str) or not isinstance(item["url"], str):
            continue
        try:
            requires_python = item.get("requires-python")
            if requires_python and _python_version not in SpecifierSet(requires_python):
                continue
            if filename.endswith(".whl"):
                name, version, _, tags = parse_wheel_filename(filename)
                ranks = [_tag_ranks[tag] for tag in tags if tag in _tag_ranks]
                if not ranks:
                    continue
                wheel, rank = True, min(ranks)
            else:
                name, version = parse_sdist_filename(filename)
                wheel, rank = False, 0
        except (InvalidSpecifier, InvalidWheelFilename, InvalidSdistFilename):
            continue
        if canonicalize_name(name) != canonicalize_name(requirement.name):
            continue
        url = urllib.parse.urljoin(base_url, item.get("url", ""))
        if urllib.parse.urlsplit(url).scheme not in ("http", "https"):
            continue
        artifacts.append(Artifact(filename, url, version, wheel, rank))
    return artifacts


def _index_artifacts(source, requirement):
    package_url = source.url + "/" + canonicalize_name(requirement.name) + "/"
    key = (package_url, str(requirement.specifier))
    now = time.monotonic()
    cached = _index_cache.get(key)
    if cached and cached[0] > now:
        return cached[1]
    request = urllib.request.Request(package_url, headers={
        "Accept": "application/vnd.pypi.simple.v1+json, text/html;q=0.9",
        "Accept-Encoding": "identity",
        "User-Agent": "SimpAI-Dependency-Router",
    })
    try:
        with urllib.request.urlopen(
            request, timeout=PROBE_SECONDS, context=ssl.create_default_context()
        ) as response:
            body = _read_probe(response, INDEX_BYTES + 1, time.monotonic() + PROBE_SECONDS)
            if len(body) > INDEX_BYTES:
                raise ValueError("package index exceeds probe size limit")
            base_url = response.geturl()
            if "json" in response.headers.get("Content-Type", ""):
                files = json.loads(body)["files"]
            else:
                parser = _SimpleLinks(base_url)
                parser.feed(body.decode("utf-8"))
                files = parser.files
            artifacts = _compatible_artifacts(files, requirement, base_url)
    except urllib.error.HTTPError as exc:
        artifacts = [] if exc.code == 404 else None
        exc.close()
    except (OSError, ValueError, TypeError, KeyError, urllib.error.URLError):
        artifacts = None
    _index_cache[key] = (now + (CACHE_SECONDS if artifacts else 30), artifacts)
    return artifacts


def _artifact_speed(artifact):
    cached = _speed_cache.get(artifact.url)
    now = time.monotonic()
    if cached and cached[0] > now:
        return cached[1]
    request = urllib.request.Request(urllib.parse.urldefrag(artifact.url)[0], headers={
        "Range": f"bytes=0-{PROBE_BYTES - 1}",
        "Accept-Encoding": "identity",
        "User-Agent": "SimpAI-Dependency-Router",
    })
    speed = 0
    try:
        with urllib.request.urlopen(
            request, timeout=PROBE_SECONDS, context=ssl.create_default_context()
        ) as response:
            body = _read_probe(response, PROBE_BYTES, now + PROBE_SECONDS, allow_partial=True)
            speed = len(body) / max(time.monotonic() - now, 0.001)
    except urllib.error.HTTPError as exc:
        exc.close()
    except (OSError, urllib.error.URLError):
        pass
    _speed_cache[artifact.url] = (now + (CACHE_SECONDS if speed else 30), speed)
    return speed


def ranked_sources(requirement, sources, emit=print):
    """Return sources for the same compatible version, followed by unverified sources."""
    if requirement is None or requirement.url:
        return list(sources), None
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda source: _index_artifacts(source, requirement), sources))
    versions = {
        artifact.version for artifacts in results if artifacts is not None
        for artifact in artifacts
    }
    matching = list(requirement.specifier.filter(versions))
    selected_version = max(matching) if matching else None
    measured, unverified = [], []
    for source, artifacts in zip(sources, results):
        if artifacts is None:
            unverified.append(source)
            emit(f"{source.label}: 检查未完成，保留待尝试 / Probe unavailable; retained for retry")
            continue
        candidates = [artifact for artifact in artifacts if artifact.version == selected_version]
        if not candidates:
            emit(f"{source.label}: 缺少匹配版本或平台文件，跳过 / No matching version or platform; skipped")
            continue
        artifact = max(candidates, key=lambda item: (item.wheel, -item.tag_rank))
        speed = _artifact_speed(artifact)
        _source_speeds[source.url] = speed
        measured.append((speed, source))
        emit(f"{source.label}: {artifact.filename}, {speed / 1024:.0f} KiB/s")
    now = time.monotonic()
    measured.sort(key=lambda item: (_slow_sources.get(item[1].url, 0) <= now, item[0]), reverse=True)
    return [source for _, source in measured] + unverified, selected_version


def _routing_requirement(pip_args, cwd):
    for index, arg in enumerate(pip_args):
        if arg in ("-r", "--requirement") and index + 1 < len(pip_args):
            path = Path(pip_args[index + 1])
            path = path if path.is_absolute() else Path(cwd or os.getcwd()) / path
            with path.open(encoding="utf-8-sig") as stream:
                for line in stream:
                    line = re.split(r"\s+#", line.strip(), maxsplit=1)[0]
                    if not line or line.startswith(("#", "-")):
                        continue
                    try:
                        requirement = Requirement(line)
                    except InvalidRequirement:
                        continue
                    if not requirement.marker or requirement.marker.evaluate():
                        return requirement
            return None
    skip_value = False
    for arg in pip_args[1:]:
        if skip_value:
            skip_value = False
            continue
        if arg in ("--upgrade-strategy", "--target", "--constraint", "-c"):
            skip_value = True
            continue
        if not arg.startswith("-"):
            try:
                return Requirement(arg)
            except InvalidRequirement:
                continue
    return None


class DownloadWatch:
    def __init__(self, window=20, minimum_speed=64 * 1024):
        self.window = window
        self.minimum_speed = minimum_speed
        self.installing = False
        self.started = None
        self.current = 0
        self.window_started = None
        self.window_bytes = 0
        self.last_progress = None

    def feed(self, line, now):
        text = line.strip()
        if text.startswith(("Installing collected packages:", "Attempting uninstall:")):
            self.installing = True
            self.started = None
        if self.installing:
            return
        match = _raw_progress.match(text)
        if match:
            current, total = map(int, match.groups())
            if self.started is None or current < self.current:
                self._start(now)
            if current > self.current:
                self.last_progress = now
            self.current = current
            if total and current >= total:
                self.started = None
        elif text.startswith(("Downloading ", "Resuming download ")):
            self._start(now)
        elif text and self.started is not None:
            self.started = None

    def _start(self, now):
        self.started = self.window_started = self.last_progress = now
        self.current = self.window_bytes = 0

    def reason(self, now):
        if self.installing or self.started is None:
            return None
        if now - self.last_progress >= self.window:
            return "下载无进展 / Download stalled"
        elapsed = now - self.window_started
        if elapsed >= self.window:
            speed = (self.current - self.window_bytes) / elapsed
            self.window_started, self.window_bytes = now, self.current
            if speed < self.minimum_speed:
                return f"持续低速下载 / Sustained slow download ({speed / 1024:.0f} KiB/s)"
        return None


def _stop_process(process):
    if os.name == "nt":
        try:
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW, timeout=10, check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            process.kill()
    else:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    if process.poll() is None:
        process.kill()
    process.wait(timeout=10)


def _run_pip(command, *, env, cwd, emit, download_timeout, window, minimum_speed):
    output = queue.Queue()
    tail = deque(maxlen=20)
    watch = DownloadWatch(window, minimum_speed)
    start = time.monotonic()
    last_display = 0
    error = ""
    kwargs = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {"start_new_session": True}
    process = subprocess.Popen(
        command, env=env, cwd=cwd, stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace", bufsize=1, **kwargs,
    )

    def read_output():
        try:
            for line in process.stdout:
                output.put((time.monotonic(), line))
        finally:
            output.put((time.monotonic(), None))

    reader = threading.Thread(target=read_output, daemon=True)
    reader.start()
    try:
        while True:
            try:
                received, line = output.get(timeout=0.25)
            except queue.Empty:
                line = ""
                received = time.monotonic()
            if line is None:
                break
            now = time.monotonic()
            if line:
                watch.feed(line, received)
                tail.append(line.rstrip())
                match = _raw_progress.match(line.strip())
                if match:
                    current, total = map(int, match.groups())
                    if now - last_display >= 1 or (total and current >= total):
                        emit(f"  下载 / Download: {current / 1048576:.1f} / {total / 1048576:.1f} MiB")
                        last_display = now
                else:
                    emit(line.rstrip())
            if process.poll() is not None or not output.empty():
                continue
            error = watch.reason(now) or ""
            if not watch.installing and now - start >= download_timeout:
                error = "下载准备超时 / Download preparation timed out"
            if error:
                _stop_process(process)
                break
        return Attempt(process.wait(), watch.installing, error or "\n".join(tail))
    finally:
        if process.poll() is None:
            _stop_process(process)
        reader.join(timeout=10)
        process.stdout.close()


def install_with_routing(
    pip_args, *, primary_url, extra_url, python=sys.executable,
    python_args=("-s",), env=None, cwd=None, target=None,
    description="", emit=print, download_timeout=1800,
):
    sources = package_sources(primary_url, extra_url)
    requirement = _routing_requirement(pip_args, cwd)
    if requirement and requirement.marker and not requirement.marker.evaluate():
        return True
    sources, selected_version = ranked_sources(requirement, sources, emit)
    if not sources:
        emit(f"{description}: 所有源均缺少兼容包 / No index has a compatible package")
        return False
    args = list(pip_args)
    # Pin an unbounded single-package request so a faster stale mirror cannot downgrade it.
    if requirement and selected_version is not None and not any(arg in ("-r", "--requirement") for arg in args):
        for index, arg in enumerate(args[1:], start=1):
            try:
                same_requirement = Requirement(arg) == requirement
            except InvalidRequirement:
                continue
            if same_requirement:
                requirement.specifier = SpecifierSet(f"=={selected_version}")
                args[index] = str(requirement)
                break
    pip_env = (os.environ if env is None else env).copy()
    pip_env.update(PIP_PROGRESS_BAR="raw", PYTHONUNBUFFERED="1",
                   PYTHONIOENCODING="utf-8", PIP_CONFIG_FILE=os.devnull)
    pip_env.pop("PIP_INDEX_URL", None)
    pip_env.pop("PIP_EXTRA_INDEX_URL", None)
    pip_env.pop("PIP_QUIET", None)
    pip_env.pop("PIP_VERBOSE", None)
    window = float(pip_env.get("SIMPAI_PIP_SLOW_SECONDS", "20"))
    minimum_speed = float(pip_env.get("SIMPAI_PIP_MIN_KIBPS", "64")) * 1024
    while sources:
        source = sources.pop(0)
        emit(f"{description}: 使用 {source.label} / Using {source.label}")
        command = [python, *python_args, "-m", "pip", *args, "--prefer-binary",
                   "--index-url", source.url, "--disable-pip-version-check",
                   "--progress-bar", "raw", "--timeout", "8", "--retries", "1"]
        if target:
            command.extend(["--target", str(target)])
        measured_speed = _source_speeds.get(source.url, 0)
        source_minimum = min(minimum_speed, measured_speed / 4) if measured_speed else minimum_speed
        source_window = max(window, min(120, PROBE_BYTES * 1.5 / measured_speed)) if measured_speed else window
        try:
            result = _run_pip(
                command, env=pip_env, cwd=cwd, emit=emit, download_timeout=download_timeout,
                window=source_window, minimum_speed=source_minimum,
            )
        except OSError as exc:
            emit(f"{source.label}: 无法启动 pip / Unable to start pip: {exc}")
            return False
        if result.returncode == 0:
            return True
        emit(f"{source.label}: {result.error}")
        if result.installing:
            emit("安装阶段失败，不自动换源 / Installation failed; automatic source switching stopped")
            return False
        if result.error.startswith(("持续低速", "下载无进展", "下载准备超时")):
            _slow_sources[source.url] = time.monotonic() + 60
        missing = re.search(r"Could not find a version that satisfies the requirement ([^\n(]+)", result.error)
        if missing and sources:
            try:
                missing_requirement = Requirement(missing.group(1).strip())
            except InvalidRequirement:
                continue
            sources, _ = ranked_sources(missing_requirement, sources, emit)
    emit(f"{description}: 所有可用源均失败 / All available indexes failed")
    return False
