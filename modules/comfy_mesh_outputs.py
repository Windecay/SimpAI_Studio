"""Save native Comfy 3D results into the owning Studio media library."""

import datetime
import logging
import os
import tempfile
import time
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

import httpx

from modules import media_library
from modules.mesh_media import MESH_EXTENSIONS, is_mesh_file


logger = logging.getLogger(__name__)
_MAX_FILE_SIZE = 256 * 1024 * 1024


def _output_files(history):
    seen = set()
    outputs = history.get("outputs")
    if not isinstance(outputs, dict):
        return
    for fields in outputs.values():
        files = fields.get("3d") if isinstance(fields, dict) else None
        if not isinstance(files, list):
            continue
        for item in files:
            if not isinstance(item, dict) or item.get("type") != "output":
                continue
            filename = item.get("filename")
            subfolder = item.get("subfolder", "")
            if not isinstance(filename, str) or not isinstance(subfolder, str):
                continue
            if (not filename or ".." in filename or any(c in filename for c in "/\\:")
                    or any(ord(c) < 32 for c in filename + subfolder)):
                continue
            subfolder = subfolder.replace("\\", "/")
            if ":" in subfolder or subfolder.startswith("/") or ".." in subfolder.split("/"):
                continue
            if Path(filename).suffix.lower() not in MESH_EXTENSIONS:
                continue
            if (subfolder, filename) not in seen:
                seen.add((subfolder, filename))
                yield subfolder, filename


def _completed_history(client, prompt_id, cancelled):
    deadline = time.monotonic() + 2.0
    url = f"/history/{quote(prompt_id, safe='')}"
    while not cancelled():
        response = client.get(url)
        response.raise_for_status()
        item = response.json().get(prompt_id)
        if item is not None:
            status = item.get("status") or {}
            return item if status.get("completed") is True and status.get("status_str") == "success" else {}
        if time.monotonic() >= deadline:
            return {}
        time.sleep(0.05)
    return {}


def _copy_model(client, directory, subfolder, filename, cancelled):
    extension = Path(filename).suffix.lower()
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / f"{uuid4().hex[:16]}_{Path(filename).stem[:80]}{extension}"
    temporary = None
    try:
        with client.stream("GET", "/view", params={"type": "output", "subfolder": subfolder, "filename": filename}) as response:
            response.raise_for_status()
            size = 0
            deadline = time.monotonic() + 60.0
            with tempfile.NamedTemporaryFile(dir=directory, prefix=".mesh-", suffix=".part", delete=False) as file:
                temporary = Path(file.name)
                for chunk in response.iter_bytes(chunk_size=1024 * 1024):
                    if cancelled():
                        return None
                    size += len(chunk)
                    if size > _MAX_FILE_SIZE or time.monotonic() >= deadline:
                        raise ValueError("Comfy 3D file exceeded the transfer limit")
                    file.write(chunk)
        if cancelled() or not size or not is_mesh_file(temporary, extension=extension):
            return None
        os.replace(temporary, destination)
        return destination
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def save_comfy_mesh_outputs(pipeline, prompt_id, user_did, generation, *, cancelled, transport=None):
    if not prompt_id or cancelled():
        return []
    saved = []
    with httpx.Client(
        base_url=f"http://{pipeline.server_address()}", timeout=httpx.Timeout(10.0, connect=2.0),
        transport=transport, trust_env=False,
    ) as client:
        history = _completed_history(client, str(prompt_id), cancelled)
        files = list(_output_files(history))
        if not files or cancelled():
            return saved
        library = media_library.get_user_media_library(user_did)
        directory = media_library._path_under(library.outputs_root, f"{datetime.date.today().isoformat()}/3d")
        if not directory:
            raise ValueError("Mesh output directory is outside the user's output root")
        directory = Path(directory)
        for subfolder, filename in files:
            if cancelled():
                break
            try:
                path = _copy_model(client, directory, subfolder, filename, cancelled)
                if path is None:
                    continue
                indexed = library.index_file(path, generation=generation)
                if not indexed.get("indexed"):
                    raise ValueError(f"Unable to index mesh: {indexed.get('reason', 'unknown')}")
            except (httpx.HTTPError, OSError, ValueError):
                logger.exception("Unable to import Comfy 3D output: prompt_id=%s, file=%s", prompt_id, filename)
                continue
            saved.append((indexed["media_id"], str(path)))
    return saved
