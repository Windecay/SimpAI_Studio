"""Single-image character sheets using the existing canvas/roleplay image runner."""

import copy
import threading
import uuid

from modules import visual_character_library as library


_LOCK = threading.RLock()
_TERMINAL = {"finished", "failed", "canceled", "cancelled", "stopped"}


def sheet_prompt(card):
    appearance = str(card.get("appearance") or "").strip()
    extra = str(card.get("image_prompt") or "").strip()
    if not appearance and not extra:
        raise ValueError("character_image_prompt_required")
    return "\n".join(filter(None, [
        "Create exactly ONE landscape character reference sheet in a SINGLE image, on a pure white background.",
        "Layout from left to right: one large face close-up, then three separate full-body views "
        "of the SAME character: front view, side profile view, back view.",
        "The three full-body views have matching scale and baseline, with the entire head and both feet "
        "visible. Leave clear spacing between all four views; no overlapping figures or cropped limbs.",
        "Maintain exactly the same identity, facial structure, hairstyle, hair color, outfit, accessories "
        "and body proportions across all views. Neutral standing poses, even studio lighting.",
        "No scene, props unrelated to the outfit, text, labels, borders, watermark or extra views. "
        "All four views must be composed together in this one image, not separate output images.",
        f"Character: {str(card.get('name') or '')[:200]}",
        f"Appearance: {appearance[:12000]}" if appearance else "",
        f"Character expression: {str(card.get('personality') or '')[:4000]}" if card.get("personality") else "",
        f"Additional visual direction: {extra[:12000]}" if extra else "",
    ]))


def start_image(payload, user_did, root=None, service=None, model_status=None):
    if service is None:
        from modules import canvas_workbench_runner as service
    if model_status is None:
        from modules.canvas_workbench_models import get_preset_model_status
        model_status = get_preset_model_status
    with _LOCK:
        card = library.load_character(payload.get("character_id"), user_did, root)
        if not card:
            raise ValueError("character_not_found")
        if card["revision"] != payload.get("revision"):
            raise ValueError("character_revision_conflict")
        if sum(item.get("mime", "").startswith("image/") for item in card["media"]) >= 9:
            raise ValueError("too_many_images")
        prompt = sheet_prompt(card)
        with service.CANVAS_RUNS_LOCK:
            for record in service.CANVAS_RUNS.values():
                if (record.get("owner_user_did") == user_did
                        and record.get("character_sheet", {}).get("id") == card["id"]
                        and record.get("state") not in _TERMINAL):
                    return {"ok": True, "run_id": record["run_id"], "state": record["state"]}
        node = copy.deepcopy(payload.get("preset_node"))
        if not isinstance(node, dict) or not node.get("preset", {}).get("name"):
            raise ValueError("character_image_preset_required")
        if node.get("runtime", {}).get("engine_type") not in (None, "", "image"):
            raise ValueError("character_image_preset_required")
        # Profiles may override count/prompt after submission, so this fixed-format task uses preset defaults.
        node.pop("parameter_profile", None)
        node["params"] = {**node.get("params", {}), "prompt": prompt, "image_number": 1}
        node["generation_config"] = {
            **node.get("generation_config", {}),
            "overrides": {**node.get("generation_config", {}).get("overrides", {}), "image_number": 1},
        }
        node["resolution_config"] = {
            **node.get("resolution_config", {}),
            "overrides": {"width": 1536, "height": 1024, "aspect_ratio": "1536*1024",
                          "random_aspect_ratio": False, "use_input_aspect": False},
        }
        state = {"user_did": user_did, "__user_did": user_did, "__lang": payload.get("__lang", "cn")}
        request = {
            "project_id": "character_library", "run_id": f"character-sheet-{uuid.uuid4().hex}",
            "placeholder_node_id": card["id"], "preset_node": node,
            "upload_edges": [], "config_edges": [], "text_edges": [], "asset_sources": {},
            "user_context": {"user_did": user_did}, "result_asset_scope": "gallery",
        }
        readiness = model_status(request)
        if not readiness.get("ok") or not readiness.get("ready"):
            raise ValueError("character_image_models_missing")
        result = service.run_node(request, state)
        if not result.get("ok"):
            return result
        with service.CANVAS_RUNS_LOCK:
            record = service.CANVAS_RUNS.get(result["run_id"])
            if record is None or record.get("owner_user_did") != user_did:
                raise ValueError("character_image_run_not_found")
            record["character_sheet"] = {"id": card["id"], "name": card["name"]}
        return {"ok": True, "run_id": result["run_id"], "state": result["state"]}


def image_status(payload, user_did, root=None, service=None, asset_service=None, stop=False):
    if service is None:
        from modules import canvas_workbench_runner as service
    run_id = str(payload.get("run_id") or "")
    with service.CANVAS_RUNS_LOCK:
        record = service.CANVAS_RUNS.get(run_id)
        if (not record or record.get("owner_user_did") != user_did
                or record.get("project_id") != "character_library" or not record.get("character_sheet")):
            raise ValueError("character_image_run_not_found")
        character = copy.deepcopy(record["character_sheet"])
    state = {"user_did": user_did, "__user_did": user_did}
    request = {"run_id": run_id, "user_context": {"user_did": user_did}}
    result = (service.control_run({**request, "action": "stop"}, state) if stop
              else service.poll_run(request, state))
    if not result.get("ok"):
        return result
    response = {key: result.get(key) for key in ("ok", "run_id", "state", "percent", "message")}
    response["character_id"] = character["id"]
    if result.get("state") == "finished":
        with _LOCK:
            ref = record.get("character_sheet_asset")
            if not ref:
                assets = result.get("assets") or [result.get("asset")]
                images = [asset for asset in assets if isinstance(asset, dict)
                          and str(asset.get("mime") or "").startswith("image/")]
                if len(images) != 1:
                    raise ValueError("character_image_result_missing")
                if asset_service is None:
                    from modules import canvas_workbench_assets as asset_service
                asset = images[0]
                try:
                    ref = asset_service.register_existing_file_asset(
                        asset.get("path") or asset.get("output_path"), "character_library", state,
                        node_id=character["id"], role="character_sheet",
                        metadata={"mime": asset["mime"], "owner": user_did}, copy_to_assets=True,
                    )
                    if not ref or ref.get("copy_error") or not ref.get("asset_relative_path"):
                        raise ValueError("character_image_save_failed")
                    ref["name"] = character["name"] + " - character sheet"
                    ref["character_sheet"] = True
                    ref = library.register_media(ref, user_did, root)
                except OSError:
                    raise ValueError("character_image_save_failed") from None
                with service.CANVAS_RUNS_LOCK:
                    record["character_sheet_asset"] = copy.deepcopy(ref)
            response["asset"] = copy.deepcopy(ref)
    return response
