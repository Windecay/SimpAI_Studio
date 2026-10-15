"""The same private story-pack endpoints for Studio and isolated UI tests."""

from fastapi import APIRouter, Body, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from modules import vlm_story_packs as packs


def create_router(resolve_user, *, root=None):
    router = APIRouter()

    @router.post("/describe-image/vlm-roleplay/story-packs/{operation}")
    async def story_pack_endpoint(operation: str, request: Request, payload: dict = Body(default={})):
        user_did = resolve_user(payload, request)

        def perform():
            if operation == "list":
                return {"ok": True, "packs": packs.list_packs(user_did, root)}
            if operation == "prepare":
                value = packs.normalize_pack(payload.get("pack"), include_images=payload.get("include_images", True))
                return {"ok": True, "pack": value}
            if operation == "save":
                value = packs.save_pack(payload.get("pack"), user_did, root,
                                        include_images=payload.get("include_images", True))
                return {"ok": True, "pack": value}
            if operation == "load":
                value = packs.load_pack(payload.get("id"), user_did, root)
                return {"ok": bool(value), "pack": value, **({} if value else {"error": "story_pack_not_found"})}
            if operation == "delete":
                removed = packs.delete_pack(payload.get("id"), user_did, root)
                return {"ok": removed, **({} if removed else {"error": "story_pack_not_found"})}
            raise ValueError("story_pack_invalid_operation")

        try:
            result = await run_in_threadpool(perform)
            return JSONResponse(result, status_code=200 if result["ok"] else 404)
        except (OSError, ValueError, TypeError) as error:
            code = str(error)
            if not code.startswith("story_pack_"):
                code = "story_pack_storage_error" if isinstance(error, OSError) else "story_pack_invalid"
            return JSONResponse({"ok": False, "error": code}, status_code=400)

    return router
