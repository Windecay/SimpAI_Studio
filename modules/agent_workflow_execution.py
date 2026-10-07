"""Imported graphs execute only inside Studio's existing exclusive task worker."""

import copy
import hashlib
import logging
import os
import re
import time
from pathlib import Path

import httpx

from modules.agent_api_contract import WorkflowPreview
from modules.agent_service import AgentAPIError, StudioBackend, identity_binding
from modules.agent_workflows import WorkflowStore, preview


MAX_RESULT_BYTES = 512 * 1024 * 1024
logger = logging.getLogger(__name__)
OUTPUT_EXTENSIONS = frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".mp4", ".webm", ".mov", ".mkv"})


class ComfyWorkflowTransport:
    def __init__(self):
        from enhanced.simpleai import comfyclient_pipeline
        self.client = httpx.Client(base_url=f"http://{comfyclient_pipeline.server_address()}/",
                                   timeout=httpx.Timeout(15, connect=3))

    def close(self):
        self.client.close()

    def json(self, method, url, **kwargs):
        response = self.client.request(method, url, **kwargs)
        if response.is_error:
            raise AgentAPIError("workflow_backend_rejected", "Comfy rejected the workflow request.", 409,
                                {"http_status": response.status_code, "response": response.text[:2000]})
        return response.json()

    def object_info(self):
        return self.json("GET", "object_info")

    def upload(self, path, asset_id):
        digest = hashlib.sha256()
        with open(path, "rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
            if not digest.hexdigest().startswith(asset_id.split(":", 1)[1]):
                raise AgentAPIError("workflow_asset_changed", "The uploaded input asset changed. Upload and preview again.", 409)
            handle.seek(0)
            name = "agent_" + digest.hexdigest() + Path(path).suffix.lower()
            result = self.json("POST", "upload/image", files={"image": (name, handle)},
                               data={"overwrite": "false", "type": "input"})
        actual = result.get("name")
        if not isinstance(actual, str) or "/" in actual or "\\" in actual or result.get("subfolder", ""):
            raise AgentAPIError("workflow_upload_failed", "Comfy returned an unexpected input filename.", 502)
        return actual

    def validate(self, prompt):
        result = self.json("POST", "simpai/workflows/validate", json={"prompt": prompt})
        if not result.get("strict_submission_supported"):
            raise AgentAPIError("workflow_backend_upgrade_required", "Restart the updated Comfy backend before using imported workflows.", 409)
        if not result.get("valid"):
            raise AgentAPIError("workflow_backend_validation", "Comfy workflow validation failed; no generation was submitted.", 422,
                                {"error": result.get("error"), "node_errors": result.get("node_errors")})

    def submit(self, prompt, prompt_id):
        # Resolve ambiguous network failures by querying this ID. Reposting a
        # task after it left Comfy's queue could otherwise execute it twice.
        try:
            result = self.json("POST", "prompt", json={"prompt": prompt, "prompt_id": prompt_id,
                                                     "simpai_require_all_outputs": True})
        except (httpx.ReadTimeout, httpx.WriteTimeout, httpx.ReadError, httpx.WriteError, httpx.RemoteProtocolError):
            return
        if result.get("prompt_id") != prompt_id or result.get("node_errors"):
            raise AgentAPIError("workflow_submission_failed", "Comfy did not accept the complete workflow.", 409)

    def history(self, prompt_id):
        return self.json("GET", "history/" + prompt_id).get(prompt_id)

    def cancel(self, prompt_id):
        for url, body in (("queue", {"delete": [prompt_id]}), ("interrupt", {"prompt_id": prompt_id})):
            response = self.client.post(url, json=body)
            response.raise_for_status()

    def queued(self, prompt_id):
        result = self.json("GET", "queue")
        return any(isinstance(item, (list, tuple)) and len(item) > 1 and item[1] == prompt_id
                   for group in ("queue_running", "queue_pending") for item in result.get(group, []))

    def download(self, item, target):
        filename, subfolder = item.get("filename"), item.get("subfolder", "")
        if (not isinstance(filename, str) or "/" in filename or "\\" in filename or "\0" in filename or ":" in filename
                or Path(filename).suffix.lower() not in OUTPUT_EXTENSIONS
                or not isinstance(subfolder, str) or subfolder.startswith(("/", "\\"))
                or ":" in subfolder or ".." in subfolder.replace("\\", "/").split("/")
                or item.get("type") not in {"temp", "output"}):
            raise AgentAPIError("workflow_output_invalid", "Comfy returned an unsupported output descriptor.", 502)
        size = 0
        created = False
        try:
            with self.client.stream("GET", "view", params={"filename": filename, "subfolder": subfolder,
                                                         "type": item["type"]}) as response:
                response.raise_for_status()
                with target.open("xb") as handle:
                    created = True
                    for chunk in response.iter_bytes():
                        size += len(chunk)
                        if size > MAX_RESULT_BYTES:
                            raise AgentAPIError("workflow_output_too_large", "A workflow output exceeds 512 MiB.", 413)
                        handle.write(chunk)
            if not size:
                raise AgentAPIError("workflow_output_empty", "Comfy returned an empty output.", 502)
        except Exception:
            if created:
                target.unlink(missing_ok=True)
            raise


def _text(task, cn, en):
    return cn if getattr(task, "simpleai_lang", "") == "cn" else en


def _failure_message(task, code, fallback):
    messages = {
        "generation_not_allowed": "当前身份已无生成权限。",
        "workflow_preview_changed": "等待期间工作流条件或身份发生变化，请重新预览和确认。",
        "workflow_backend_validation": "Comfy 工作流检查未通过，未提交生成。",
        "workflow_backend_rejected": "Comfy 拒绝了工作流请求，请检查节点和输入。",
        "workflow_execution_failed": "工作流执行失败，请查看后端错误信息。",
        "workflow_output_missing": "工作流没有返回全部要求的图片或视频，不能视为完成。",
        "workflow_timeout": "工作流等待超时，未返回完整结果。",
        "workflow_state_unknown": "暂时无法确认后端任务是否停止，请勿重复提交。",
        "workflow_asset_changed": "输入素材已变化，请重新上传并预览。",
        "workflow_backend_upgrade_required": "请重启更新后的 Comfy 后端，再执行导入工作流。",
    }
    return messages.get(code, "工作流执行未完成，请查看后端日志。") if task.simpleai_lang == "cn" else fallback


def _execution_errors(messages):
    result = []
    for item in messages:
        if isinstance(item, (list, tuple)) and len(item) > 1 and isinstance(item[1], dict):
            result.append({key: item[1][key] for key in ("node_id", "node_type", "exception_type", "exception_message")
                           if key in item[1]})
    return result[-3:]


def _collect_outputs(history, task, transport, output_root):
    descriptors = []
    allowed = {item["node_id"] for item in task.simpleai_workflow_outputs}
    received = set()
    for node_id, fields in (history.get("outputs") or {}).items():
        if str(node_id) not in allowed or not isinstance(fields, dict):
            continue
        for values in fields.values():
            if isinstance(values, list):
                files = [item for item in values if isinstance(item, dict) and "filename" in item]
                descriptors.extend(files)
                if files:
                    received.add(str(node_id))
    if received != allowed:
        raise AgentAPIError("workflow_output_missing", "Not all requested output nodes returned files.", 502)
    if not descriptors or len(descriptors) > 64:
        raise AgentAPIError("workflow_output_missing", "Workflow completed without supported outputs, or returned more than 64 files.", 502)
    root = Path(output_root).resolve()
    folder = (root / "agent_workflows" / task.task_id).resolve()
    if not folder.is_relative_to(root):
        raise AgentAPIError("workflow_output_invalid", "Output directory is unavailable.", 503)
    folder.mkdir(parents=True, exist_ok=True)
    paths = []
    for index, item in enumerate(descriptors):
        extension = Path(str(item.get("filename", ""))).suffix.lower()
        if extension not in OUTPUT_EXTENSIONS:
            raise AgentAPIError("workflow_output_invalid", "Unsupported workflow output type.", 502)
        target = (folder / f"result_{index:03}{extension}").resolve()
        if not target.is_relative_to(folder):
            raise AgentAPIError("workflow_output_invalid", "Output directory is unavailable.", 503)
        transport.download(item, target)
        paths.append(str(target))
    return paths


def execute(task, *, backend=None, transport=None, context=None, output_root=None,
            sleep=time.sleep, clock=time.monotonic):
    """Called under the same GPU lock as normal Studio/Canvas generation."""
    backend = backend or StudioBackend()
    owned_transport = transport is None
    supplied_context = context is not None
    task.processing = True
    try:
        transport = transport or ComfyWorkflowTransport()
        from modules.access_mode import user_can_generate
        from modules.agent_auth import StudioIdentity
        if context is None:
            context = StudioIdentity().subject(task.user_did)
        if not user_can_generate(task.user_did):
            raise AgentAPIError("generation_not_allowed", "This identity can no longer generate.", 403)
        deadline = clock() + task.simpleai_workflow_request["timeout_seconds"]

        def check_before_submission():
            current = context if supplied_context else StudioIdentity().subject(task.user_did)
            if identity_binding(current) != task.simpleai_workflow_identity or not user_can_generate(task.user_did):
                raise AgentAPIError("workflow_preview_changed", "Identity or generation permissions changed. Confirm again.", 409)
            if clock() >= deadline:
                raise AgentAPIError("workflow_timeout", "Workflow preparation exceeded its execution deadline.", 504)

        request = WorkflowPreview.model_validate({
            key: task.simpleai_workflow_request[key] for key in ("workflow_id", "bindings")
        })
        plan = preview(WorkflowStore(), request, context, transport.object_info(),
                       lambda asset_id: backend.asset(asset_id, context))
        if (not plan["ready_to_submit"] or plan["identity_binding"] != task.simpleai_workflow_identity
                or plan["preview_fingerprint"] != task.simpleai_workflow_request["preview_fingerprint"]):
            raise AgentAPIError("workflow_preview_changed", "Workflow conditions or identity changed while waiting. Preview and confirm again.", 409)
        prompt = copy.deepcopy(plan["api_prompt"])
        for binding in request.bindings:
            if task.last_stop in {"stop", "skip"}:
                return
            check_before_submission()
            asset = backend.asset(binding.asset_id, context)
            prompt[binding.node_id]["inputs"][binding.input] = transport.upload(asset["path"], binding.asset_id)
        for node in prompt.values():
            inputs = node.get("inputs", {})
            prefix = inputs.get("filename_prefix")
            if isinstance(prefix, str) and prefix.startswith("agent_workflows/__RUN__/"):
                inputs["filename_prefix"] = prefix.replace("__RUN__", task.task_id, 1)
        check_before_submission()
        transport.validate(prompt)
        if task.last_stop in {"stop", "skip"}:
            return
        check_before_submission()
        task.simpleai_comfy_prompt_id = task.task_id
        transport.submit(prompt, task.task_id)
        task.simpleai_comfy_prompt_accepted = True
        task.yields.append(["status", _text(task, "工作流已提交，等待后端输出。", "Workflow submitted; waiting for backend outputs.")])
        cancel_deadline = None
        last_error = None
        while True:
            expired = clock() >= deadline
            cancel = task.last_stop in {"stop", "skip"} or expired
            try:
                history = transport.history(task.task_id)
                if history is not None:
                    status = history.get("status") or {}
                    if status.get("status_str") in {"error", "failed"}:
                        messages = status.get("messages") or []
                        if task.last_stop in {"stop", "skip"} and any(
                            isinstance(item, (list, tuple)) and item and item[0] == "execution_interrupted" for item in messages
                        ):
                            return
                        raise AgentAPIError("workflow_execution_failed", "Comfy workflow execution failed.", 502,
                                            {"nodes": _execution_errors(status.get("messages") or [])})
                    if status.get("completed") or status.get("status_str") == "success":
                        if clock() >= deadline:
                            raise AgentAPIError("workflow_timeout", "Workflow exceeded its execution deadline.", 504)
                        if output_root is None:
                            from modules.config import get_user_path_outputs
                            output_root = get_user_path_outputs(task.user_did)
                        task.results = _collect_outputs(history, task, transport, output_root)
                        task.last_stop = False
                        task.user_cancel_action = None
                        return
                if cancel:
                    cancel_deadline = cancel_deadline or clock() + 30
                    transport.cancel(task.task_id)
                    if not transport.queued(task.task_id):
                        if expired:
                            raise AgentAPIError("workflow_timeout", "Workflow timed out and was stopped.", 504)
                        return
                last_error = None
            except httpx.HTTPError as exc:
                last_error = exc
            if cancel_deadline and clock() >= cancel_deadline:
                raise AgentAPIError("workflow_state_unknown", "Backend termination could not be confirmed. Do not resubmit this task.", 504)
            if clock() >= deadline and not cancel_deadline:
                cancel_deadline = clock() + 30
            sleep(0.5 if last_error is None else 2)
    except Exception as exc:
        code = exc.code if isinstance(exc, AgentAPIError) else "workflow_execution_failed"
        if not isinstance(exc, AgentAPIError):
            logger.exception("Imported workflow execution failed: %s", task.task_id)
        task.simpleai_workflow_error = {
            "code": code,
            "message": _failure_message(task, code, exc.message if isinstance(exc, AgentAPIError)
                                        else "Workflow execution failed. Check the server log."),
            **({"details": exc.details} if isinstance(exc, AgentAPIError) and exc.details is not None else {}),
        }
    finally:
        task.processing = False
        task.yields.append(["finish", task.results])
        if owned_transport and transport is not None:
            transport.close()
