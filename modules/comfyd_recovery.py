"""Supervise Studio-owned Comfyd children without replaying submitted jobs."""

import atexit
from contextlib import contextmanager
from dataclasses import dataclass
from functools import wraps
import errno
import logging
import os
import socket
import subprocess
import sys
import threading
import time

import httpx


logger = logging.getLogger(__name__)
HEALTH_PATH = "/simpai/health"


@dataclass(frozen=True)
class Health:
    state: str
    detail: str = ""
    busy: bool = False


def _connection_refused(error):
    seen = set()
    while error is not None and id(error) not in seen:
        seen.add(id(error))
        if (getattr(error, "errno", None) in (errno.ECONNREFUSED, 10061)
                or getattr(error, "winerror", None) == 10061):
            return True
        error = error.__cause__ or error.__context__
    return False


def _local_connection_error(error):
    seen = set()
    while error is not None and id(error) not in seen:
        seen.add(id(error))
        if (getattr(error, "errno", None) in (errno.EADDRINUSE, 10048)
                or getattr(error, "winerror", None) == 10048):
            return True
        error = error.__cause__ or error.__context__
    return False


def probe_health(host, port, pid):
    try:
        with httpx.Client(timeout=3.0, trust_env=False) as client:
            response = client.get(f"http://{host}:{port}{HEALTH_PATH}")
            response.raise_for_status()
            data = response.json()
        if not isinstance(data, dict) or data.get("service") != "simpai-comfyd" or data.get("pid") != pid:
            return Health("foreign", "HTTP listener does not belong to the managed Comfyd PID")
        return Health("ready", busy=bool(data.get("queue_remaining")))
    except httpx.HTTPStatusError as exc:
        state = "foreign" if exc.response.status_code == 404 else "unresponsive"
        return Health(state, str(exc))
    except (httpx.HTTPError, ValueError, OSError) as exc:
        if _local_connection_error(exc):
            return Health("probe_error", str(exc))
        if _connection_refused(exc):
            return Health("refused", str(exc))
        # A read timeout during GPU work is not evidence that the listener died.
        try:
            with socket.create_connection((host, int(port)), timeout=3.0):
                pass
        except OSError as connect_error:
            if _local_connection_error(connect_error):
                return Health("probe_error", str(connect_error))
            if _connection_refused(connect_error):
                return Health("refused", str(connect_error))
        return Health("unresponsive", str(exc))


def _merged_arguments(*groups):
    result = {}
    for group in groups:
        for arg in group or ():
            if isinstance(arg, (list, tuple)) and arg:
                result[arg[0]] = list(arg)
    return list(result.values())


class ComfydSupervisor:
    def __init__(
        self, backend, pipeline, select_port, publish_port, *,
        clock=time.monotonic, probe=probe_health, popen=subprocess.Popen,
        interval=5.0, startup_timeout=180.0, unresponsive_timeout=180.0,
        failure_threshold=3, stop_timeout=5.0, start_thread=True,
    ):
        self.backend = backend
        self.pipeline = pipeline
        self.select_port = select_port
        self.publish_port = publish_port
        self.clock = clock
        self.probe = probe
        self.popen = popen
        self.interval = interval
        self.startup_timeout = startup_timeout
        self.unresponsive_timeout = unresponsive_timeout
        self.failure_threshold = failure_threshold
        self.stop_timeout = stop_timeout
        self.lock = threading.RLock()
        self._quit = threading.Event()
        self._thread = None
        self._start_thread = start_thread
        self._desired = False
        self._started_at = 0.0
        self._ready_since = None
        self._healthy_since = None
        self._http_ready = False
        self._next_probe = 0.0
        self._probe_process = None
        self._failure_since = None
        self._failure_state = None
        self._failure_warned = False
        self._failures = 0
        self._busy = False
        self._attempts = 0
        self._next_start = 0.0
        self._last_patch = []
        self._runtime_vars = {}
        self._vars_pending = False
        self._clients = 0
        self._local = threading.local()
        self._original_start = backend.start
        self._original_finished = backend.finished
        self._original_free = backend.free

    def synchronized(self, fn):
        @wraps(fn)
        def locked(*args, **kwargs):
            with self.lock:
                return fn(*args, **kwargs)
        return locked

    def _process(self):
        return getattr(self.backend, "comfyd_process", None)

    def _alive(self):
        process = self._process()
        return process is not None and process.poll() is None

    def _watch(self):
        while not self._quit.wait(self.interval):
            try:
                self.check_once()
            except Exception:
                logger.exception("[Comfyd] Automatic recovery check failed; monitoring continues")

    def _ensure_monitor(self):
        if self._start_thread and self._thread is None:
            self._thread = threading.Thread(target=self._watch, name="comfyd-health", daemon=True)
            self._thread.start()
            atexit.register(self.close)

    def close(self):
        with self.lock:
            self._desired = False
            self._quit.set()

    def _launch(self, background=False):
        defaults = [["--preview-method", "auto"], ["--port", "8187"], ["--disable-auto-launch"]]
        args = _merged_arguments(defaults, self.backend.comfyd_args, self._last_patch)
        preferred = next(int(arg[1]) for arg in args if arg[0] == "--port")
        port = self.select_port(preferred)
        args = _merged_arguments(args, [["--port", str(port)]])
        self.publish_port(port)
        self.pipeline.COMFYUI_ENDPOINT_PORT = port
        self.pipeline.ws = None
        self._ready_since = None
        self._healthy_since = None
        self._http_ready = False
        self._next_probe = 0.0
        self._probe_process = None
        self._failure_since = None
        self._failure_state = None
        self._failure_warned = False
        self._failures = 0
        self._busy = False
        self._vars_pending = bool(self._runtime_vars)
        if background:
            # Restart only the child. Foreground model unloading would disturb
            # other users/backends while the watchdog runs.
            command = [sys.executable, "-s", os.path.join(os.getcwd(), "comfy/main.py")]
            command += [value for arg in args for value in arg]
            self.backend.comfyd_process = self.popen(command, env=self.backend._build_process_env())
        else:
            self._original_start(args_patch=_merged_arguments(self._last_patch, [["--port", str(port)]]))
        self._started_at = self.clock()
        process = self._process()
        logger.info("[Comfyd] Started managed PID=%s port=%s recovery_attempt=%s",
                    process.pid, port, self._attempts)

    def _schedule_retry(self, reason):
        self._attempts += 1
        delay = min(300.0, 5.0 * 2 ** min(self._attempts - 1, 6))
        self._next_start = self.clock() + delay
        logger.warning("[Comfyd] Recovery attempt=%s next_start_in=%.0fs reason=%s",
                       self._attempts, delay, reason)

    def start(self, args_patch=None, force=False):
        with self.lock:
            if force:
                self._desired = False
                self._terminate()
            self._desired = True
            self._ensure_monitor()
            if self._alive():
                return
            self._last_patch = _merged_arguments(args_patch)
            if self._clients:
                return
            if self.clock() < self._next_start and not force:
                return
            try:
                self._terminate()
                self._launch()
            except Exception as exc:
                self._schedule_retry(str(exc))
                raise

    def active(self, flag=False):
        with self.lock:
            self.backend.comfyd_active = bool(flag)
            if flag:
                self.start()
            else:
                self.stop(force=True)

    def _terminate(self):
        process = self._process()
        if process is None:
            return
        if process.poll() is None:
            try:
                process.terminate()
                process.wait(timeout=self.stop_timeout)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=self.stop_timeout)
            except OSError:
                if process.poll() is None:
                    raise
        logger.info("[Comfyd] Stopped managed PID=%s port=%s exit_code=%s",
                    process.pid, self.pipeline.COMFYUI_ENDPOINT_PORT, process.poll())
        self.backend.comfyd_process = None
        self.pipeline.ws = None
        self._ready_since = None
        self._http_ready = False

    def stop(self, force=False):
        with self.lock:
            if getattr(self.backend, "comfyd_active", False) and not force:
                # Resident mode releases models, not the service itself.
                self.free(all=True)
                return
            self._desired = False
            self._next_start = 0.0
            self._attempts = 0
            self._terminate()

    def free(self, all=False):
        with self.lock:
            process = self._process()
            if process is None or process.poll() is not None:
                return
            health = self.probe(self.pipeline.COMFYUI_ENDPOINT_IP,
                                self.pipeline.COMFYUI_ENDPOINT_PORT, process.pid)
            if health.state == "ready":
                return self._original_free(all=all)
            logger.warning("[Comfyd] Skipped model release: managed HTTP listener is unavailable")

    def finished(self):
        with self.lock:
            return self._original_finished()

    def clear_runtime_variables(self):
        with self.lock:
            self._runtime_vars.clear()
            self._vars_pending = False

    def modify_variable(self, variables):
        if not isinstance(variables, dict) or not variables:
            return
        with self.lock:
            self._runtime_vars.update(variables)
            self._vars_pending = True
            if self._http_ready and self._alive():
                self._apply_variables()

    def _apply_variables(self):
        if not self._vars_pending:
            return True
        endpoint = self.pipeline.server_address()
        try:
            with httpx.Client(timeout=3.0, trust_env=False) as client:
                response = client.post(f"http://{endpoint}/setvars", json=dict(self._runtime_vars))
                response.raise_for_status()
            self._vars_pending = False
            return True
        except httpx.HTTPError as exc:
            logger.warning("[Comfyd] Runtime settings pending for %s: %s", endpoint, exc)
            return False

    def check_once(self):
        with self.lock:
            if not self._desired or self._quit.is_set():
                return False
            process = self._process()
            if process is None or process.poll() is not None:
                if process is not None:
                    code = process.poll()
                    self._terminate()
                    self._schedule_retry(f"child exited with code {code}")
                if self._clients or self.clock() < self._next_start:
                    return False
                try:
                    self._launch(background=True)
                except Exception as exc:
                    self._schedule_retry(str(exc))
                return False
            port = self.pipeline.COMFYUI_ENDPOINT_PORT
            host = self.pipeline.COMFYUI_ENDPOINT_IP
            if self._probe_process is process or self.clock() < self._next_probe:
                return self._http_ready and not self._vars_pending
            # Readiness waiters and the daemon share one sample per interval.
            self._probe_process = process
        try:
            health = self.probe(host, port, process.pid)
        except Exception as exc:
            health = Health("probe_error" if _local_connection_error(exc) else "unresponsive", str(exc))
        with self.lock:
            if self._probe_process is process:
                self._probe_process = None
            if process is not self._process() or not self._desired:
                return False
            now = self.clock()
            self._next_probe = now + self.interval
            if health.state == "ready":
                self._http_ready = True
                if self._ready_since is None:
                    logger.info("[Comfyd] HTTP ready PID=%s port=%s", process.pid, port)
                    self._ready_since = now
                if self._healthy_since is None:
                    self._healthy_since = now
                if now - self._healthy_since >= 60.0:
                    self._attempts = 0
                self._busy = health.busy
                self._failures = 0
                self._failure_since = None
                self._failure_state = None
                self._failure_warned = False
                return self._apply_variables()
            self._http_ready = False
            self._healthy_since = None
            if self._failure_state != health.state:
                self._failures = 0
                self._failure_since = None
                self._failure_state = health.state
                self._failure_warned = False
            self._failures += 1
            if self._failure_since is None:
                self._failure_since = now
                logger.debug("[Comfyd] Health probe failed PID=%s port=%s state=%s: %s",
                             process.pid, port, health.state, health.detail)
            if self._failures < self.failure_threshold:
                return False
            if now - self._failure_since >= 30.0 and not self._failure_warned:
                logger.warning("[Comfyd] Health checks persistently failing PID=%s port=%s state=%s: %s",
                               process.pid, port, health.state, health.detail)
                self._failure_warned = True
            # A local socket allocation failure says nothing about child health.
            if health.state == "probe_error":
                return False
            if health.state == "foreign":
                recover = True
            elif self._ready_since is None:
                recover = now - self._started_at >= self.startup_timeout
            elif health.state == "refused":
                recover = now - self._failure_since >= 15.0
            else:
                recover = (not self._clients and not self._busy
                           and now - self._failure_since >= self.unresponsive_timeout)
            if recover and now >= self._next_start:
                reason = f"{health.state}: {health.detail}"
                self._schedule_retry(reason)
                self._terminate()
            return False

    def _unavailable(self, message):
        error = getattr(self.pipeline, "ComfyServerUnavailableError", RuntimeError)
        return error(message)

    def wait_for_server_ready(self, timeout_seconds=300.0, poll_interval=1.0, process_alive_callback=None):
        deadline = self.clock() + max(0.0, float(timeout_seconds))
        while True:
            self.pipeline.model_management.throw_exception_if_processing_interrupted()
            self.assert_task_process()
            if process_alive_callback is not None and process_alive_callback != self.backend.is_running:
                try:
                    alive = bool(process_alive_callback())
                except Exception as exc:
                    raise self._unavailable(f"Unable to inspect the Comfy backend process: {exc}") from exc
                if not alive:
                    raise self._unavailable("The Comfy backend process exited before submission.")
            with self.lock:
                if not self._desired:
                    raise self._unavailable("Comfyd was explicitly stopped; automatic recovery is suspended.")
            if self.check_once():
                return True
            remaining = deadline - self.clock()
            if remaining <= 0:
                raise self._unavailable("Timed out waiting for the managed Comfyd HTTP service during recovery.")
            time.sleep(min(max(0.05, float(poll_interval)), remaining))

    @contextmanager
    def task_session(self):
        with self.lock:
            process = self._process()
            if process is None or process.poll() is not None:
                raise self._unavailable("Comfyd exited before task submission.")
            previous = getattr(self._local, "process", None)
            self._local.process = process
            self._clients += 1
        try:
            yield
        finally:
            with self.lock:
                self._local.process = previous
                self._clients -= 1

    def assert_task_process(self):
        process = getattr(self._local, "process", None)
        if process is not None and (process is not self._process() or process.poll() is not None):
            raise self._unavailable("Comfyd exited or restarted during this task; the submitted task will not be replayed.")

    def _guard_call(self, fn, check_after=True):
        @wraps(fn)
        def guarded(*args, **kwargs):
            self.assert_task_process()
            result = fn(*args, **kwargs)
            if check_after:
                self.assert_task_process()
            return result
        return guarded

    def install(self):
        self.backend.start = self.start
        self.backend.stop = self.stop
        self.backend.active = self.active
        self.backend.finished = self.finished
        self.backend.free = self.free
        self.backend.modify_variable = self.modify_variable
        self.backend.task_session = self.task_session
        self.pipeline.wait_for_server_ready = self.wait_for_server_ready
        original_get_images = self.pipeline.get_images

        @wraps(original_get_images)
        def get_images(*args, **kwargs):
            with self.task_session():
                return original_get_images(*args, **kwargs)

        self.pipeline.get_images = get_images
        # Guard reads outside the pipeline's broad network-error handlers so
        # polling an old job cannot silently continue against a replacement PID.
        # A successful submit must still reach the acceptance callback if the
        # child exits immediately after returning its prompt_id.
        for name in ("get_history_item", "get_job", "queue_prompt"):
            setattr(self.pipeline, name, self._guard_call(
                getattr(self.pipeline, name), check_after=name != "queue_prompt",
            ))
        self.backend._simpai_supervisor = self
        return self


def install_comfyd_recovery(backend, pipeline, select_port, publish_port):
    existing = getattr(backend, "_simpai_supervisor", None)
    if existing is not None:
        return existing
    return ComfydSupervisor(backend, pipeline, select_port, publish_port).install()
