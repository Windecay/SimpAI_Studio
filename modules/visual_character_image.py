"""Single-image character sheets using the existing canvas/roleplay image runner."""

import base64
import copy
import threading
import uuid
from functools import lru_cache
from io import BytesIO
from pathlib import Path

from modules import visual_character_library as library


_LOCK = threading.RLock()
_TERMINAL = {"finished", "failed", "canceled", "cancelled", "stopped"}


@lru_cache(maxsize=1)
def sheet_pose_template():
    """A fixed OpenPose-style layout, without loading a detector or any model."""
    from PIL import Image, ImageDraw

    image = Image.new("RGB", (1536, 1024), "black")
    draw = ImageDraw.Draw(image)
    colors = [
        (255, 0, 0), (255, 85, 0), (255, 170, 0), (255, 255, 0),
        (170, 255, 0), (85, 255, 0), (0, 255, 0), (0, 255, 85),
        (0, 255, 170), (0, 255, 255), (0, 170, 255), (0, 85, 255),
        (0, 0, 255), (85, 0, 255), (170, 0, 255), (255, 0, 255),
        (255, 0, 170), (255, 0, 85),
    ]
    limbs = [(1, 2), (1, 5), (2, 3), (3, 4), (5, 6), (6, 7),
             (1, 8), (8, 9), (9, 10), (1, 11), (11, 12), (12, 13),
             (1, 0), (0, 14), (14, 16), (0, 15), (15, 17)]
    for center, view in ((610, "front"), (975, "side"), (1320, "back")):
        points = [
            (0, 200), (0, 270), (-65, 280), (-95, 430), (-105, 565),
            (65, 280), (95, 430), (105, 565),
            (-45, 570), (-45, 755), (-45, 940),
            (45, 570), (45, 755), (45, 940),
            (-22, 190), (22, 190), (-42, 202), (42, 202),
        ]
        if view == "side":
            points = [
                (32, 200), (0, 270), (-12, 280), (-18, 430), (-8, 565),
                (12, 280), (18, 430), (28, 565),
                (-14, 570), (-18, 755), (5, 940),
                (14, 570), (18, 755), (40, 940),
                None, (20, 190), None, (-8, 202),
            ]
        elif view == "back":
            points[0] = (0, 195)
            points[14:] = [None] * 4
        points = [(center + point[0], point[1]) if point else None for point in points]
        for index, (a, b) in enumerate(limbs):
            if points[a] and points[b]:
                draw.line([points[a], points[b]], fill=colors[index], width=10)
        for index, point in enumerate(points):
            if point:
                x, y = point
                draw.ellipse((x - 9, y - 9, x + 9, y + 9), fill=colors[index])
    # The first region guides a face close-up, not a fourth full-body figure.
    face = [(120, 260), (115, 310), (130, 365), (165, 410), (205, 425),
            (245, 410), (280, 365), (295, 310), (290, 260)]
    draw.line(face, fill="white", width=5)
    for x, y in face + [(160, 295), (250, 295), (205, 330), (180, 375), (230, 375)]:
        draw.ellipse((x - 5, y - 5, x + 5, y + 5), fill="white")
    output = BytesIO()
    image.save(output, format="PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")


def sheet_prompt(card, mode="text"):
    appearance = str(card.get("appearance") or "").strip()
    extra = str(card.get("image_prompt") or "").strip()
    if mode != "reference" and not appearance and not extra:
        raise ValueError("character_image_prompt_required")
    return "\n".join(filter(None, [
        "Create exactly ONE landscape character reference sheet in a SINGLE image, on a pure white background.",
        (
            "Use <image1> as the character identity and appearance reference. Preserve its facial features, "
            "apparent age, hairstyle, hair color, clothing, worn accessories, body proportions and visual style. "
            "Use <image2> ONLY as the four-view skeleton layout and pose guide: face close-up on the left, "
            "then front, right-facing side profile, and back. Render the SAME character from <image1> "
            "at these positions. The back view faces away and must not show a face. "
            "Do not copy <image1>'s framing, pose or background. Do not render skeletons, colored joints, "
            "guide lines or the black guide background. Infer unseen details consistently with the reference."
        ) if mode == "reference" else "",
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
        mode = payload.get("mode", "text")
        if mode not in ("text", "reference"):
            raise ValueError("character_image_mode_invalid")
        source = None
        if mode == "reference":
            source_id = payload.get("source_asset_id")
            if not any(ref.get("asset_id") == source_id and ref.get("mime", "").startswith("image/")
                       for ref in card["media"]):
                raise ValueError("character_image_source_required")
            source = library.resolve_media(source_id, user_did, root)
            if not source.get("mime", "").startswith("image/") or not Path(source.get("path") or "").is_file():
                raise ValueError("asset_file_missing")
        prompt = sheet_prompt(card, mode)
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
        if mode == "reference" and (
                node["preset"]["name"] != "Qwen2.1-Edit"
                or node.get("runtime", {}).get("task_method") != "qwen_image21_edit_cn"):
            raise ValueError("character_image_reference_preset_required")
        # Profiles may override count/prompt after submission, so this fixed-format task uses preset defaults.
        node.pop("parameter_profile", None)
        node.pop("upload_slot_sources", None)
        node.pop("upload_slots", None)
        node["params"] = {**node.get("params", {}), "prompt": prompt, "image_number": 1,
                          "scene_image_number": 1}
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
        if source:
            request["asset_sources"] = {
                "scene_input_image1": {"node_id": card["id"], "asset": copy.deepcopy(source)},
                "scene_input_image2": {
                    "node_id": card["id"] + "-sheet-pose",
                    "asset": {"data_url": sheet_pose_template(), "mime": "image/png",
                              "width": 1536, "height": 1024},
                },
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
            record["character_sheet"] = {"id": card["id"], "name": card["name"], "mode": mode,
                                         "source_asset_id": source.get("asset_id") if source else ""}
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
                    if character.get("source_asset_id"):
                        ref["source_asset_id"] = character["source_asset_id"]
                    ref = library.register_media(ref, user_did, root)
                except OSError:
                    raise ValueError("character_image_save_failed") from None
                with service.CANVAS_RUNS_LOCK:
                    record["character_sheet_asset"] = copy.deepcopy(ref)
            response["asset"] = copy.deepcopy(ref)
    return response
