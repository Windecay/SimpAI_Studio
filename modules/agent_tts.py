"""Qwen speech tools shared by HTTP, MCP and the built-in chat."""

import hashlib
import json
import re
from urllib.parse import urlencode

from modules.agent_api_contract import API_PREFIX
from modules.agent_tts_contract import TTSParameters
from modules.agent_service import AgentAPIError, _backend_ok, identity_binding


def check_execution(record):
    """Recheck identity, generation rights and an optional grant after waiting."""
    from modules.access_mode import user_can_generate
    from modules.agent_auth import AgentAuthorization, StudioIdentity
    from modules.agent_service import require_identity_binding, require_scope
    submission = record["agent_tts_submission"]
    authorization = submission.get("authorization")
    if authorization:
        manager = AgentAuthorization(lambda request: None)
        context = manager._credential_context(manager.store.lookup_credential(authorization["id"]))
        require_scope(context, "runs.submit")
    else:
        context = StudioIdentity().subject(record["user_did"])
    require_identity_binding(context, submission["identity_binding"])
    if not user_can_generate(context.user_id):
        raise AgentAPIError("generation_not_allowed", "This identity can no longer generate speech.", 403)


class SpeechTools:
    def __init__(self, service):
        self.service = service
        self.backend = service.backend

    def capabilities(self, request, context):
        from modules.qwen_tts_policy import MODEL_IDS, TOKENIZER
        models = self.backend.tts_models([TOKENIZER, *MODEL_IDS.values()], context)
        return {
            "engine": "qwen_tts", "preset_required": False, "output_type": "audio",
            "modes": {
                "custom_voice": {"requires": ["text", "speaker"], "model_sizes": ["0.6B", "1.7B"]},
                "voice_design": {"requires": ["text", "instruct_or_voice_id"], "model_sizes": ["1.7B"],
                                 "timbre_lock_requires_base_model": True},
                "voice_clone": {"requires": ["text", "ref_audio_asset_id"],
                                "ref_text_required_unless_x_vector_only": True, "model_sizes": ["0.6B", "1.7B"]},
                "dialogue": {"requires": ["script", "roles"], "model_sizes": ["0.6B", "1.7B"],
                             "max_roles": 4, "script_format": "One role name: spoken text per line; every role must be bound."},
            },
            "models": models, "parameters": TTSParameters.model_json_schema(),
            "request_schema_url": f"{API_PREFIX}/tools/simpai.tts.preview",
            "voices_url": f"{API_PREFIX}/tts/voices", "preview_url": f"{API_PREFIX}/tts/preview",
            "submit_url": f"{API_PREFIX}/tts/runs",
            "automatic_model_download": False, "generation_scope": "runs.submit",
            "result": {"status_tool": "simpai.runs.get", "cancel_tool": "simpai.runs.cancel",
                       "audio_delivery": "Read the returned audio asset content_url or MCP resource; image assets.read is not an audio player."},
            "guidance": "Keep the exact words to speak in text (script for dialogue); keep voice and delivery instructions "
                        "in instruct. Query available speakers and saved descriptions. Reference audio must be an owned "
                        "uploaded asset ID. Preview before submission. Missing models must be installed separately with "
                        "the user's download approval. Never pass a server file path or invent a voice.",
        }

    def voices(self, request, context):
        rows = self.backend.tts_voices(context)
        rows = [row for row in rows if request.query.casefold() in
                f"{row['voice_id']} {row['name']} {row.get('instruct', '')}".casefold()]
        end = request.offset + request.limit
        return {"items": rows[request.offset:end], "total": len(rows), "offset": request.offset, "limit": request.limit,
                "next_url": (f"{API_PREFIX}/tts/voices?" + urlencode({
                    "query": request.query, "offset": end, "limit": request.limit}) if end < len(rows) else None),
                "generation_started": False}

    def _prepare(self, request, context):
        from modules.access_mode import user_can_generate
        from modules.qwen_tts_policy import dependencies
        from modules.agent_prompting import check_encoding
        check_encoding(request.model_dump(), "tts")

        params = request.parameters.model_dump()
        params.update(seed_random=request.parameters.seed < 0, unload_model_after_generate=True,
                      merge_outputs=True, max_new_tokens_per_line=request.parameters.max_new_tokens)
        params["clone_batch_size"] = request.parameters.batch_size
        inputs, missing = {}, []

        def need(condition, field):
            if not condition:
                missing.append(field)

        def bind(slot, asset_id):
            if not asset_id:
                missing.append(slot)
                return
            asset = self.backend.asset(asset_id, context)
            if not str(asset.get("mime") or "").startswith("audio/"):
                raise AgentAPIError("input_type_mismatch", "TTS reference inputs must be audio assets.", 422)
            inputs[slot] = {"node_id": slot, "type": "audio", "asset": asset}

        instruct, speaker = request.instruct.strip(), request.speaker.strip()
        if request.voice_id:
            voice = next((row for row in self.backend.tts_voices(context) if row["voice_id"] == request.voice_id), None)
            if not voice:
                raise AgentAPIError("tts_voice_not_found", "The selected voice is unavailable to this identity.", 404)
            if request.mode == "custom_voice" and voice["kind"] == "speaker":
                if speaker and speaker != voice["speaker"]:
                    raise AgentAPIError("invalid_tts_voice", "speaker conflicts with voice_id.", 422)
                speaker = voice["speaker"]
            elif request.mode == "voice_design" and voice["kind"] == "description":
                instruct = "\n".join(value for value in (voice["instruct"], instruct) if value)
            else:
                raise AgentAPIError("invalid_tts_voice", "This voice_id does not support the selected mode.", 422)
        if request.mode != "dialogue":
            need(request.text.strip(), "text")
            if request.script or request.roles:
                raise AgentAPIError("invalid_tts_inputs", "script and roles are only used in dialogue mode.", 422)
        elif request.text.strip():
            raise AgentAPIError("invalid_tts_inputs", "Use script instead of text for dialogue.", 422)
        if request.mode != "voice_clone" and (request.ref_audio_asset_id or request.ref_text):
            raise AgentAPIError("invalid_tts_inputs", "Reference audio and transcript require voice_clone mode.", 422)
        if request.mode not in {"voice_design", "custom_voice"} and (instruct or speaker or request.voice_id):
            raise AgentAPIError("invalid_tts_inputs", "Voice descriptions and built-in speakers do not apply to this mode.", 422)
        if request.mode == "voice_design":
            need(instruct, "instruct_or_voice_id")
            if speaker:
                raise AgentAPIError("invalid_tts_inputs", "Use instruct or voice_id for voice_design.", 422)
            if request.parameters.model_choice != "1.7B":
                raise AgentAPIError("invalid_tts_model", "VoiceDesign requires the 1.7B model.", 422)
            params.update(text=request.text, instruct=instruct)
        elif request.mode == "custom_voice":
            need(speaker, "speaker")
            if speaker and speaker not in {row.get("speaker") for row in self.backend.tts_voices(context)
                                           if row["kind"] == "speaker"}:
                raise AgentAPIError("tts_voice_not_found", "Select a built-in speaker returned by tts.voices.list.", 422)
            params.update(text=request.text, speaker=speaker, instruct=instruct)
        elif request.mode == "voice_clone":
            bind("ref_audio", request.ref_audio_asset_id)
            need(request.parameters.x_vector_only or request.ref_text.strip(), "ref_text")
            params.update(target_text=request.text, ref_text=request.ref_text)
        else:
            need(request.script.strip(), "script")
            need(request.roles, "roles")
            names = [role.name.strip() for role in request.roles]
            if len(names) != len(set(names)) or any(not name for name in names):
                raise AgentAPIError("invalid_tts_roles", "Dialogue role names must be nonempty and unique.", 422)
            for index, role in enumerate(request.roles, 1):
                if not role.ref_text.strip():
                    raise AgentAPIError("invalid_tts_roles", "Every dialogue role requires its reference transcript.", 422)
                bind(f"role_{index}_audio", role.audio_asset_id)
                params.update({f"role_{index}_name": role.name.strip(), f"role_{index}_ref_text": role.ref_text})
            for line in request.script.splitlines():
                if not line.strip():
                    continue
                parts = re.split("[:：]", line, maxsplit=1)
                if len(parts) != 2 or parts[0].strip() not in names or not parts[1].strip():
                    raise AgentAPIError("invalid_tts_script", "Every dialogue line must contain a bound role name and spoken text.", 422)
            params["script"] = request.script
        statuses = self.backend.tts_models(dependencies(request.mode, request.parameters), context)
        models_ready = all(row["ready"] for row in statuses)
        allowed = user_can_generate(context.user_id) and (
            context.authorization is None or "runs.submit" in context.authorization.get("scopes", []))
        status = "needs_inputs" if missing else "models_missing" if not models_ready else "ready" if allowed else "generation_not_allowed"
        return {
            "engine": "qwen_tts", "mode": request.mode, "status": status, "ready_to_submit": status == "ready",
            "missing_inputs": missing, "models": statuses, "generation_allowed": allowed,
            "text": request.text, "script": request.script, "instruct": instruct, "speaker": speaker,
            "identity_binding": identity_binding(context), "automatic_model_download": False,
            "submit_url": f"{API_PREFIX}/tts/runs",
        }, params, inputs

    def preview(self, request, context):
        return self._prepare(request, context)[0]

    def submit(self, request, context):
        from modules.access_mode import user_can_generate
        if not user_can_generate(context.user_id):
            raise AgentAPIError("generation_not_allowed", "This identity cannot generate audio.", 403)
        fingerprint = hashlib.sha256(json.dumps(request.model_dump(), sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()
        run_id = "agent-tts-" + hashlib.sha256((context.user_id + "\0" + request.request_id).encode("utf-8")).hexdigest()[:40]
        replay = self.backend.replay_tts(run_id, fingerprint, context)
        if replay:
            return self.service._public_run(replay, context)
        plan, params, inputs = self._prepare(request, context)
        if not plan["ready_to_submit"]:
            raise AgentAPIError("tts_not_ready", "Speech generation needs inputs, local model files or permission.", 409, plan)
        result = self.backend.submit_tts({
            "run_id": run_id, "project_id": "agent_api", "mode": request.mode, "params": params,
            "input_assets": inputs, "qwen_tts_node_id": run_id, "local_files_only": True,
            "agent_tts_submission": {"request_fingerprint": fingerprint, "identity_binding": plan["identity_binding"],
                                     "authorization": context.authorization},
        }, context)
        _backend_ok(result, "tts_submission_failed")
        return self.service._public_run(result, context)
