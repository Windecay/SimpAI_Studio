import threading
import time

import numpy as np
from PIL import Image

import shared
from enhanced.logger import format_name
from modules.custom_llm_api import strip_reasoning_text

import logging


logger = logging.getLogger(format_name(__name__))


class ComfyTextgenVLM:
    def __init__(self):
        self.lock = threading.RLock()
        self.conversation_messages = {}
        self.conversation_system_prompts = {}

    def _runtime(self):
        from enhanced.simpleai import comfyd, comfyclient_pipeline

        return comfyd, comfyclient_pipeline

    def _ensure_server(self, timeout=120):
        if bool(getattr(getattr(shared, "args", None), "disable_backend", False)):
            raise RuntimeError("Comfy backend is disabled.")
        if bool(getattr(getattr(shared, "args", None), "disable_comfyd", False)):
            raise RuntimeError("Comfyd is disabled.")
        comfyd, comfyclient_pipeline = self._runtime()
        if not comfyd.is_running():
            comfyd.start()
        endpoint = str(comfyclient_pipeline.server_address())
        deadline = time.monotonic() + max(1.0, float(timeout))
        last_error = ""
        while time.monotonic() < deadline:
            if not comfyd.is_running():
                raise RuntimeError("Comfyd stopped before TextGenerate became available.")
            try:
                import httpx

                with httpx.Client(timeout=5.0) as client:
                    response = client.get(f"http://{endpoint}/object_info")
                    response.raise_for_status()
                    object_info = response.json()
                required = {"CLIPLoader", "LoadImage", "ImageBatch", "TextGenerate", "PreviewAny"}
                missing = sorted(required - set(object_info or {}))
                if missing:
                    raise RuntimeError(f"Comfyd is missing required nodes: {', '.join(missing)}")
                return object_info
            except RuntimeError:
                raise
            except Exception as exc:
                last_error = str(exc)
                time.sleep(0.35)
        raise RuntimeError(f"Timed out waiting for Comfyd TextGenerate: {last_error}")

    def _user_credentials(self):
        token = getattr(shared, "token", None)
        if token is None:
            return "vlm-textgen", ""
        try:
            user_did = token.get_default_workspace_did()
        except Exception:
            user_did = token.get_guest_did()
        user_did = str(user_did or "vlm-textgen")
        try:
            user_cert = token.get_register_cert(user_did)
        except Exception:
            user_cert = ""
        return user_did, user_cert

    def _normalize_image(self, image):
        if isinstance(image, Image.Image):
            array = np.asarray(image.convert("RGB"))
        else:
            array = np.asarray(image)
        if array.ndim == 4 and array.shape[0] == 1:
            array = array[0]
        if array.ndim == 2:
            array = np.repeat(array[:, :, None], 3, axis=2)
        if array.ndim != 3:
            raise ValueError(f"Unsupported VLM image shape: {array.shape}")
        if array.shape[2] > 3:
            array = array[:, :, :3]
        if np.issubdtype(array.dtype, np.floating):
            scale = 255.0 if float(np.nanmax(array)) <= 1.5 else 1.0
            array = np.clip(array * scale, 0, 255)
        return np.ascontiguousarray(array.astype(np.uint8, copy=False))

    def _upload_images(self, image):
        if image is None:
            return []
        images = list(image) if isinstance(image, (list, tuple)) else [image]
        images = [item for item in images if item is not None]
        if not images:
            return []
        _, comfyclient_pipeline = self._runtime()
        container = comfyclient_pipeline.ComfyInputImage([f"vlm_{index}" for index in range(len(images))])
        for index, value in enumerate(images):
            container.set_image(f"vlm_{index}", self._normalize_image(value))
        uploaded = comfyclient_pipeline.images_upload(container)
        return [uploaded[f"vlm_{index}"] for index in range(len(images))]

    def build_workflow(
        self,
        clip_name,
        clip_type,
        prompt,
        image_names=None,
        max_tokens=1024,
        temperature=0.8,
        top_p=0.9,
        top_k=40,
        repetition_penalty=1.05,
        seed=-1,
        thinking=False,
    ):
        image_names = list(image_names or [])
        workflow = {
            "1": {
                "class_type": "CLIPLoader",
                "inputs": {
                    "clip_name": str(clip_name),
                    "type": str(clip_type or "stable_diffusion"),
                },
            }
        }
        image_output = None
        next_id = 2
        for image_name in image_names:
            node_id = str(next_id)
            next_id += 1
            workflow[node_id] = {
                "class_type": "LoadImage",
                "inputs": {"image": str(image_name)},
            }
            current_output = [node_id, 0]
            if image_output is None:
                image_output = current_output
                continue
            batch_id = str(next_id)
            next_id += 1
            workflow[batch_id] = {
                "class_type": "ImageBatch",
                "inputs": {"image1": image_output, "image2": current_output},
            }
            image_output = [batch_id, 0]

        textgen_id = str(next_id)
        next_id += 1
        try:
            seed_value = int(seed)
        except (TypeError, ValueError):
            seed_value = -1
        textgen_inputs = {
            "clip": ["1", 0],
            "prompt": str(prompt or ""),
            "max_length": max(1, min(int(max_tokens or 1024), 32768)),
            "sampling_mode": "on",
            "sampling_mode.temperature": max(0.01, min(float(temperature), 2.0)),
            "sampling_mode.top_k": max(0, min(int(top_k), 1000)),
            "sampling_mode.top_p": max(0.0, min(float(top_p), 1.0)),
            "sampling_mode.min_p": 0.0,
            "sampling_mode.repetition_penalty": max(0.0, min(float(repetition_penalty), 5.0)),
            "sampling_mode.seed": seed_value if seed_value >= 0 else 0,
            "sampling_mode.presence_penalty": 0.0,
            "thinking": bool(thinking),
            "use_default_template": True,
        }
        if image_output is not None:
            textgen_inputs["image"] = image_output
        workflow[textgen_id] = {"class_type": "TextGenerate", "inputs": textgen_inputs}

        preview_id = str(next_id)
        workflow[preview_id] = {
            "class_type": "PreviewAny",
            "inputs": {"source": [textgen_id, 0]},
        }
        return workflow, preview_id

    def _history_error(self, item):
        status = item.get("status") if isinstance(item, dict) else None
        messages = status.get("messages") if isinstance(status, dict) else None
        if isinstance(messages, list):
            for message in reversed(messages):
                if not isinstance(message, (list, tuple)) or len(message) < 2:
                    continue
                payload = message[1]
                if isinstance(payload, dict):
                    detail = payload.get("exception_message") or payload.get("error")
                    if detail:
                        return str(detail)
        return "Comfy TextGenerate execution failed."

    def _extract_preview_text(self, item, preview_id):
        outputs = item.get("outputs") if isinstance(item, dict) else None
        output = outputs.get(str(preview_id)) if isinstance(outputs, dict) else None
        if not isinstance(output, dict):
            return None
        value = output.get("text")
        if isinstance(value, (list, tuple)):
            return str(value[0]) if value else ""
        if value is not None:
            return str(value)
        value = output.get("result")
        if isinstance(value, (list, tuple)):
            return str(value[0]) if value else ""
        return str(value) if value is not None else None

    def _execute_workflow(self, workflow, preview_id, timeout=600):
        _, comfyclient_pipeline = self._runtime()
        user_did, user_cert = self._user_credentials()
        queued = comfyclient_pipeline.queue_prompt(user_did, workflow, user_cert)
        if not isinstance(queued, dict) or not queued.get("prompt_id"):
            raise RuntimeError(f"Comfyd rejected the TextGenerate workflow: {queued}")
        prompt_id = str(queued["prompt_id"])
        deadline = time.monotonic() + max(1.0, float(timeout))
        while time.monotonic() < deadline:
            item = comfyclient_pipeline.get_history_item(prompt_id)
            if isinstance(item, dict):
                text = self._extract_preview_text(item, preview_id)
                if text is not None:
                    return strip_reasoning_text(text)
                status = item.get("status")
                if isinstance(status, dict):
                    status_name = str(status.get("status_str") or "").lower()
                    if status_name in {"error", "failed", "failure"}:
                        raise RuntimeError(self._history_error(item))
                    if status.get("completed") is True:
                        if status_name not in {"success", "completed"}:
                            raise RuntimeError(self._history_error(item))
                        raise RuntimeError("Comfy TextGenerate completed without text output.")
            time.sleep(0.25)
        try:
            comfyclient_pipeline.interrupt()
        except Exception:
            pass
        raise TimeoutError(f"Comfy TextGenerate timed out after {int(timeout)} seconds.")

    def inference(
        self,
        clip_name,
        clip_type,
        image,
        prompt,
        max_tokens=1024,
        temperature=0.8,
        top_p=0.9,
        top_k=40,
        repetition_penalty=1.05,
        seed=-1,
        system_prompt=None,
        thinking=False,
    ):
        with self.lock:
            self._ensure_server()
            effective_prompt = str(prompt or "").strip()
            if str(system_prompt or "").strip():
                effective_prompt = f"System instruction:\n{str(system_prompt).strip()}\n\nUser request:\n{effective_prompt}"
            image_names = self._upload_images(image)
            workflow, preview_id = self.build_workflow(
                clip_name=clip_name,
                clip_type=clip_type,
                prompt=effective_prompt,
                image_names=image_names,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                top_k=top_k,
                repetition_penalty=repetition_penalty,
                seed=seed,
                thinking=thinking,
            )
            return self._execute_workflow(workflow, preview_id)

    def chat(
        self,
        clip_name,
        clip_type,
        image,
        prompt,
        conversation_id="default",
        system_prompt="",
        save_state=True,
        max_history=24,
        **sampling,
    ):
        key = str(conversation_id or "default")
        system_prompt = str(system_prompt or "").strip()
        with self.lock:
            previous_system = self.conversation_system_prompts.get(key, "")
            if previous_system != system_prompt:
                self.conversation_messages.pop(key, None)
            self.conversation_system_prompts[key] = system_prompt
            history = list(self.conversation_messages.get(key, []))
            history = history[-max(0, int(max_history or 24)) * 2:]
            lines = []
            for message in history:
                role = "Assistant" if message.get("role") == "assistant" else "User"
                content = str(message.get("content") or "").strip()
                if content:
                    lines.append(f"{role}: {content}")
            sections = []
            if system_prompt:
                sections.append(f"System instruction:\n{system_prompt}")
            if lines:
                sections.append("Conversation so far:\n" + "\n".join(lines))
            sections.append(f"Current user request:\n{str(prompt or '').strip()}")
            sections.append("Answer the current user request directly.")
            result = self.inference(
                clip_name=clip_name,
                clip_type=clip_type,
                image=image,
                prompt="\n\n".join(sections),
                system_prompt=None,
                **sampling,
            )
            if save_state:
                history.extend([
                    {"role": "user", "content": str(prompt or "")},
                    {"role": "assistant", "content": str(result or "")},
                ])
                self.conversation_messages[key] = history[-max(2, int(max_history or 24) * 2):]
            return result

    def clear_conversation(self, conversation_id=None):
        with self.lock:
            if conversation_id is None:
                self.conversation_messages.clear()
                self.conversation_system_prompts.clear()
                return
            key = str(conversation_id)
            self.conversation_messages.pop(key, None)
            self.conversation_system_prompts.pop(key, None)

    def free_model(self):
        _, comfyclient_pipeline = self._runtime()
        try:
            comfyclient_pipeline.free(all=True)
        except Exception as exc:
            logger.warning("Comfy TextGenerate model unload failed: %s", exc)


comfy_textgen_vlm = ComfyTextgenVLM()
