# https://huggingface.co/spaces/SmilingWolf/wd-v1-4-tags

import comfy.utils
import asyncio
import aiohttp
import numpy as np
import csv
import os
import sys
import hashlib
import json
from functools import lru_cache
import onnxruntime as ort
from onnxruntime import InferenceSession
from PIL import Image
from server import PromptServer
from aiohttp import web
import folder_paths
from .wd14_preprocess import (
    needs_wd14_timm_normalization,
    prepare_wd14_image,
    prepare_pixai_image,
)
from .pysssss import get_ext_dir, get_comfy_dir, download_to_file, update_node_status, wait_for_async, get_extension_config, log
sys.path.insert(0, os.path.join(os.path.dirname(os.path.realpath(__file__)), "comfy"))

PIXAI_MODEL_ID = "pixai-tagger-v1.0-fp16"
config = get_extension_config()
# User overrides may predate PixAI; retain their settings and add the pinned export.
with open(get_ext_dir("pysssss.json"), encoding="utf-8") as handle:
    builtin_config = json.load(handle)
config.setdefault("models", {}).setdefault(PIXAI_MODEL_ID, builtin_config["models"][PIXAI_MODEL_ID])
config.setdefault("downloads", {})[PIXAI_MODEL_ID] = builtin_config["downloads"][PIXAI_MODEL_ID]

defaults = {
    "model": "wd-eva02-tagger-2026-canary-onnx-v2",
    "threshold": 0.35,
    "character_threshold": 0.85,
    "replace_underscore": False,
    "trailing_comma": False,
    "exclude_tags": "",
    "ortProviders": ["CUDAExecutionProvider", "CPUExecutionProvider"],
    "HF_ENDPOINT": "https://hf-mirror.com"
}
defaults.update(config.get("settings", {}))

if "clip_vision" in folder_paths.folder_names_and_paths:
    model_dirs = folder_paths.get_folder_paths("clip_vision")
    models_dir = model_dirs[0]
    os.makedirs(models_dir, exist_ok=True)
else:
    models_dir = get_ext_dir("models", mkdir=True)
    model_dirs = [models_dir]
known_models = list(config["models"].keys())

log("Available ORT providers: " + ", ".join(ort.get_available_providers()), "DEBUG", True)
log("Using ORT providers: " + ", ".join(defaults["ortProviders"]), "DEBUG", True)

def resolve_model_file(filename):
    if "clip_vision" in folder_paths.folder_names_and_paths:
        return folder_paths.get_full_path("clip_vision", filename)
    path = os.path.join(models_dir, filename)
    return path if os.path.isfile(path) else None


def resolve_model_files(model):
    for model_dir in model_dirs:
        model_path = os.path.join(model_dir, f"{model}.onnx")
        csv_path = os.path.join(model_dir, f"{model}.csv")
        if os.path.isfile(model_path) and os.path.isfile(csv_path):
            return model_path, csv_path
    return resolve_model_file(f"{model}.onnx"), resolve_model_file(f"{model}.csv")


def get_installed_models():
    models = set()
    for model_dir in model_dirs:
        if not os.path.isdir(model_dir):
            continue
        for filename in os.listdir(model_dir):
            if filename.lower().endswith(".onnx") and resolve_model_file(os.path.splitext(filename)[0] + ".csv"):
                models.add(filename)
    return sorted(models)


@lru_cache(maxsize=8)
def _file_hash(path, size, mtime_ns, ctime_ns):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_pixai_file(path, ext):
    spec = config["downloads"][PIXAI_MODEL_ID][ext]
    stat = os.stat(path)
    if (stat.st_size != spec["size"] or
            _file_hash(os.path.abspath(path), stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns) != spec["sha256"]):
        raise RuntimeError("PixAI file failed SHA256 verification: " + os.path.basename(path))


async def tag(image, model_name, threshold=None, character_threshold=None, exclude_tags="", replace_underscore=True, trailing_comma=False, client_id=None, node=None):
    if model_name.endswith(".onnx"):
        model_name = model_name[0:-5]
    model_path, csv_path = resolve_model_files(model_name)
    if model_path is None or csv_path is None:
        model_path, csv_path = await download_model(model_name, client_id, node)

    pixai = model_name == PIXAI_MODEL_ID
    threshold = (0.17 if pixai else 0.35) if threshold is None else threshold
    character_threshold = (0.27 if pixai else 0.85) if character_threshold is None else character_threshold
    if pixai:
        verify_pixai_file(model_path, "onnx")
        verify_pixai_file(csv_path, "csv")
    options = ort.SessionOptions()
    if pixai and any(provider in {"DmlExecutionProvider", "DirectMLExecutionProvider"} for provider in defaults["ortProviders"]):
        options.enable_mem_pattern = False
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    model = InferenceSession(model_path, providers=defaults["ortProviders"], sess_options=options)

    input = model.get_inputs()[0]
    if pixai:
        image = prepare_pixai_image(image, input.shape)
    else:
        image = prepare_wd14_image(
            image,
            input.shape,
            normalize=needs_wd14_timm_normalization(model_name),
        )

    tags = []
    categories = []
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        next(reader)
        for row in reader:
            categories.append(row[2])
            if replace_underscore:
                tags.append(row[1].replace("_", " "))
            else:
                tags.append(row[1])

    label_name = model.get_outputs()[0].name
    probs = model.run([label_name], {input.name: image})[0]
    if probs.ndim != 2 or probs.shape[1] != len(tags):
        raise RuntimeError(
            f"WD14 model output {getattr(probs, 'shape', None)} does not match {len(tags)} tags"
        )

    result = list(zip(tags, probs[0]))

    if not np.all(np.isfinite(probs)):
        raise RuntimeError("Image tagger returned non-finite probabilities")
    general = [item for item, category in zip(result, categories) if category == "0" and item[1] > threshold]
    character = [item for item, category in zip(result, categories) if category == "4" and item[1] > character_threshold]

    all = character + general
    remove = [s.strip() for s in exclude_tags.lower().split(",")]
    all = [tag for tag in all if tag[0] not in remove]

    res = ("" if trailing_comma else ", ").join((item[0].replace("(", "\\(").replace(")", "\\)") + (", " if trailing_comma else "") for item in all))

    print(res)
    return res


async def download_model(model, client_id, node):
    if model == PIXAI_MODEL_ID:
        files = list(resolve_model_files(model))
        timeout = aiohttp.ClientTimeout(total=1800, connect=15, sock_read=60)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async def update_callback(perc):
                update_node_status(client_id, node, f"Downloading {model}", perc)
            for index, ext in enumerate(("onnx", "csv")):
                if files[index] is not None:
                    continue
                target = os.path.join(models_dir, model + "." + ext)
                temporary = target + ".download"
                urls = config["downloads"][model][ext]["urls"]
                for url_index, url in enumerate(urls):
                    try:
                        await download_to_file(url, temporary, update_callback, session=session)
                        verify_pixai_file(temporary, ext)
                        os.replace(temporary, target)
                        files[index] = target
                        break
                    except (aiohttp.ClientError, OSError, RuntimeError, asyncio.TimeoutError):
                        if os.path.isfile(temporary):
                            os.remove(temporary)
                        if url_index == len(urls) - 1:
                            raise
        update_node_status(client_id, node, None)
        return tuple(files)
    hf_endpoint = os.getenv("HF_ENDPOINT", defaults["HF_ENDPOINT"])
    if not hf_endpoint.startswith("https://"):
        hf_endpoint = f"https://{hf_endpoint}"
    if hf_endpoint.endswith("/"):
        hf_endpoint = hf_endpoint.rstrip("/")

    url = config["models"][model]
    url = url.replace("{HF_ENDPOINT}", hf_endpoint)
    url = f"{url}/resolve/main/"
    model_path, csv_path = resolve_model_files(model)
    async with aiohttp.ClientSession(loop=asyncio.get_event_loop()) as session:
        async def update_callback(perc):
            nonlocal client_id
            message = ""
            if perc < 100:
                message = f"Downloading {model}"
            update_node_status(client_id, node, message, perc)

        try:
            if model_path is None:
                model_path = os.path.join(models_dir, f"{model}.onnx")
                await download_to_file(
                    f"{url}model.onnx", model_path, update_callback, session=session)
            if csv_path is None:
                csv_path = os.path.join(models_dir, f"{model}.csv")
                await download_to_file(
                    f"{url}selected_tags.csv", csv_path, update_callback, session=session)
        except aiohttp.client_exceptions.ClientConnectorError as err:
            log("Unable to download model. Download files manually or try using a HF mirror/proxy website by setting the environment variable HF_ENDPOINT=https://.....", "ERROR", True)
            raise

        update_node_status(client_id, node, None)

    return model_path, csv_path


@PromptServer.instance.routes.get("/pysssss/wd14tagger/tag")
async def get_tags(request):
    if "filename" not in request.rel_url.query:
        return web.Response(status=404)

    type = request.query.get("type", "output")
    if type not in ["output", "input", "temp"]:
        return web.Response(status=400)

    if type == "input":
        target_dir = folder_paths.get_input_directory()
    elif type == "temp":
        target_dir = folder_paths.get_temp_directory()
    else:
        target_dir = folder_paths.get_output_directory()
    image_path = os.path.abspath(os.path.join(
        target_dir, request.query.get("subfolder", ""), request.query["filename"]))
    c = os.path.commonpath((image_path, target_dir))
    if os.path.commonpath((image_path, target_dir)) != target_dir:
        return web.Response(status=403)

    if not os.path.isfile(image_path):
        return web.Response(status=404)

    image = Image.open(image_path)

    models = get_installed_models()
    default = defaults["model"] + ".onnx"
    model = default if default in models else models[0]

    return web.json_response(await tag(image, model, client_id=request.rel_url.query.get("clientId", ""), node=request.rel_url.query.get("node", "")))


class WD14Tagger:
    @classmethod
    def INPUT_TYPES(s):
        extra = [name for name, _ in (os.path.splitext(m) for m in get_installed_models()) if name not in known_models]
        models = known_models + extra
        return {"required": {
            "image": ("IMAGE", ),
            "model": (models, { "default": defaults["model"] }),
            "threshold": ("FLOAT", {"default": defaults["threshold"], "min": 0.0, "max": 1, "step": 0.05}),
            "character_threshold": ("FLOAT", {"default": defaults["character_threshold"], "min": 0.0, "max": 1, "step": 0.05}),
            "replace_underscore": ("BOOLEAN", {"default": defaults["replace_underscore"]}),
            "trailing_comma": ("BOOLEAN", {"default": defaults["trailing_comma"]}),
            "exclude_tags": ("STRING", {"default": defaults["exclude_tags"]}),
        }}

    RETURN_TYPES = ("STRING",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "tag"
    OUTPUT_NODE = True

    CATEGORY = "image"

    def tag(self, image, model, threshold, character_threshold, exclude_tags="", replace_underscore=False, trailing_comma=False):
        tensor = image*255
        tensor = np.array(tensor, dtype=np.uint8)

        pbar = comfy.utils.ProgressBar(tensor.shape[0])
        tags = []
        for i in range(tensor.shape[0]):
            image = Image.fromarray(tensor[i])
            tags.append(wait_for_async(lambda: tag(image, model, threshold, character_threshold, exclude_tags, replace_underscore, trailing_comma)))
            pbar.update(1)
        return {"ui": {"tags": tags}, "result": (tags,)}


NODE_CLASS_MAPPINGS = {
    "WD14Tagger|pysssss": WD14Tagger,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "WD14Tagger|pysssss": "WD14 Tagger 🐍",
}
