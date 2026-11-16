"""Prepare and queue one following image while the current prompt executes."""

import inspect
import logging
import os
import threading
import uuid
from dataclasses import dataclass, field

import httpx

from modules.comfy_prompt_compat import defer_comfy_task_release, is_comfy_prompt_queued


logger = logging.getLogger(__name__)


@dataclass
class QueuedComfyPrompt:
    task: object
    prompt: dict
    prompt_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    socket_holder: list = field(default_factory=lambda: [None])
    submission: dict | None = None


class ComfyBatchPipeline:
    def __init__(self, pipeline, backend, check_cancelled):
        self.pipeline = pipeline
        self.backend = backend
        self.check_cancelled = check_cancelled
        self.endpoint = f"http://{pipeline.server_address()}"
        self.process = getattr(backend, "comfyd_process", None)
        self.workflow_cache = {}
        self._images = None
        self._images_map = {}
        self._files = {}
        self._ready = False
        self._session = None
        self._jobs = {}
        self._current = None
        self._stopped = False
        self._cancelled = set()
        self._lock = threading.Lock()

    @staticmethod
    def supported(pipeline):
        get_images = getattr(pipeline, "get_images", None)
        queue_prompt = getattr(pipeline, "queue_prompt", None)
        return (callable(get_images) and callable(queue_prompt)
                and "queued_prompt" in inspect.signature(get_images).parameters
                and "prompt_id" in inspect.signature(queue_prompt).parameters)

    def activate(self, index):
        with self._lock:
            self._current = index
        self.check_cancelled()

    @property
    def current_prompt_id(self):
        with self._lock:
            return self._jobs[self._current].submission["prompt_id"]

    def submit(self, index, task, extra_data):
        self.check_cancelled()
        if not self._ready:
            self.pipeline.wait_for_server_ready(process_alive_callback=self.backend.is_running)
            session = self.backend.task_session()
            session.__enter__()
            self._session = session
            self.endpoint = f"http://{self.pipeline.server_address()}"
            self.process = getattr(self.backend, "comfyd_process", None)
            self._ready = True
        if task.images is not self._images:
            self._images_map = self.pipeline.images_upload(task.images)
            self._images = task.images
        task.params.update_params(self._images_map)
        files = {}
        params = task.params.get_params()
        for key in ("video", "audio", "reference_video", "mask_video"):
            path = params.get(key)
            if isinstance(path, str) and os.path.isfile(path):
                if path not in self._files:
                    filename = self.pipeline.upload_file(path)
                    if filename:
                        self._files[path] = filename
                if path in self._files:
                    files[key] = self._files[path]
        task.params.update_params(files)
        prompt = task.params.convert2comfy_cached(task.name, self.workflow_cache)
        job = QueuedComfyPrompt(task, prompt)
        try:
            try:
                job.socket_holder[0] = self.pipeline._connect_websocket_with_retry(job.client_id)
            except self.pipeline.websocket.WebSocketException as error:
                logger.warning("Batch websocket unavailable; result recovery will use job history: %s", error)
            self.check_cancelled()
            with self._lock:
                self._jobs[index] = job
            job.submission = self.pipeline.queue_prompt(
                job.client_id, prompt, None, extra_data,
                process_alive_callback=self.backend.is_running,
                prompt_id=job.prompt_id,
            )
            if not job.submission or not job.submission.get("prompt_id"):
                raise ValueError("Comfy rejected the queued image prompt.")
            if job.submission["prompt_id"] != job.prompt_id:
                raise ValueError("Comfy returned an unexpected batch prompt ID.")
            with self._lock:
                cancelled = self._stopped or index in self._cancelled
            if cancelled:
                self._cancel_prompts([job.submission["prompt_id"]])
            self.check_cancelled()
            return job
        except BaseException:
            with self._lock:
                tracked = self._jobs.get(index) is job
            if not tracked:
                self.pipeline._close_websocket(job.socket_holder[0])
            raise

    def receive(self, index, callback, on_accepted):
        with self._lock:
            job = self._jobs[index]
        try:
            images = self.pipeline.get_images(
                job.client_id, job.socket_holder[0], job.prompt,
                callback=callback, total_steps=job.task.steps,
                prompt_accepted_callback=on_accepted,
                _socket_holder=job.socket_holder,
                process_alive_callback=self.backend.is_running,
                queued_prompt=job.submission,
            )
            with self._lock:
                self._jobs.pop(index, None)
            return [images[key] for key in sorted(images, reverse=True)] if images else []
        finally:
            self.pipeline._close_websocket(job.socket_holder[0])

    def cancel(self, action):
        with self._lock:
            if action == "stop":
                self._stopped = True
                jobs = list(self._jobs.values())
            else:
                self._cancelled.add(self._current)
                jobs = [self._jobs[self._current]] if self._current in self._jobs else []
            prompt_ids = [job.prompt_id for job in jobs]
        self._cancel_prompts(prompt_ids)

    def discard(self, index):
        with self._lock:
            job = self._jobs.pop(index, None)
        if job is not None:
            self._finish_jobs([job])

    def close(self):
        with self._lock:
            self._stopped = True
            jobs = list(self._jobs.values())
            self._jobs.clear()
        try:
            self._finish_jobs(jobs)
        finally:
            self.workflow_cache.clear()
            self._files.clear()
            self._images = None
            self._images_map = {}
            if self._session is not None:
                session, self._session = self._session, None
                session.__exit__(None, None, None)

    def _cancel_prompts(self, prompt_ids):
        if not prompt_ids:
            return
        with httpx.Client(timeout=httpx.Timeout(5, connect=3), trust_env=False) as client:
            requests = [("/queue", {"delete": prompt_ids})]
            requests.extend(("/interrupt", {"prompt_id": prompt_id}) for prompt_id in prompt_ids)
            for path, body in requests:
                try:
                    client.post(f"{self.endpoint}{path}", json=body).raise_for_status()
                except (httpx.HTTPError, OSError) as error:
                    logger.warning("Batch cancellation could not be confirmed yet: %s", error)

    def _finish_jobs(self, jobs):
        prompt_ids = [job.prompt_id for job in jobs]
        try:
            self._cancel_prompts(prompt_ids)
            if not prompt_ids or (self.process is not None and self.process.poll() is not None):
                return
            try:
                with httpx.Client(timeout=httpx.Timeout(5, connect=3), trust_env=False) as client:
                    response = client.get(f"{self.endpoint}/queue")
                    response.raise_for_status()
                    queue = response.json()
                    outstanding = [pid for pid in prompt_ids if is_comfy_prompt_queued(queue, pid)]
            except (httpx.HTTPError, OSError, ValueError):
                outstanding = prompt_ids
            for prompt_id in outstanding:
                defer_comfy_task_release(prompt_id, self.endpoint, self.process)
        finally:
            for job in jobs:
                self.pipeline._close_websocket(job.socket_holder[0])
