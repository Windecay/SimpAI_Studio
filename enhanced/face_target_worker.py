"""Isolated face-preview process with automatic CUDA selection."""

import importlib
import json
import logging
from pathlib import Path
import sys
import traceback
import types

import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "comfy"))
package = types.ModuleType("simpai_face_preview")
package.__path__ = [str(ROOT / "comfy/custom_nodes/SimpAINodes")]
sys.modules[package.__name__] = package
identity = importlib.import_module(package.__name__ + ".SimpAIFaceIdentityTrack")

PREVIEW_ERRORS = {
    "The video has no usable presentation timestamps.",
    "Region reconstruction currently requires constant-FPS video. Convert this source to constant FPS first.",
    "Invalid video interval or frame rate.",
    "Select a non-empty interval inside the source video.",
    "The selected interval exceeds 3600 H3 frames. Shorten it or reduce slowdown.",
    "Face track preview is limited to 1800 source frames.",
    "Cannot decode the face tracking interval.",
    "Face Track Source Changed",
    "Invalid saved face track frames.",
    "Invalid face track JSON size.",
}


def main():
    logging.basicConfig()
    logging.getLogger("simpai.face_track").setLevel(logging.INFO)
    torch.set_num_threads(2)
    try:
        with torch.inference_mode():
            request = json.loads(sys.stdin.read())
            value = (identity.preview_track(request, progress=lambda **value: print(
                json.dumps(dict(ok=True, done=False, progress=value)), flush=True))
                     if request.get("mode", "").startswith("track")
                     else identity.preview(request))
        print(json.dumps(dict(ok=True, done=True, **value)), flush=True)
    except FileNotFoundError as error:
        print(str(error), file=sys.stderr)
        print(json.dumps(dict(ok=False, done=True, error="Face identity models are missing")), flush=True)
    except Exception as error:
        traceback.print_exc(file=sys.stderr)
        message = str(error)
        print(json.dumps(dict(ok=False, done=True, error=message if message in PREVIEW_ERRORS else "Face preview failed")), flush=True)


if __name__ == "__main__":
    main()
