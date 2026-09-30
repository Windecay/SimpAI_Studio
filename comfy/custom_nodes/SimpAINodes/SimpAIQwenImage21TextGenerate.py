import importlib
import importlib.util
import json
import logging
import os
import re
from pathlib import Path

import comfy.model_management as model_management
import comfy.sd
import folder_paths
import nodes
from comfy_api.latest import io


_catalog_path = Path(__file__).resolve().parents[3] / "modules" / "pe_models.py"
_catalog_spec = importlib.util.spec_from_file_location("simpai_pe_models", _catalog_path)
_catalog_module = importlib.util.module_from_spec(_catalog_spec)
_catalog_spec.loader.exec_module(_catalog_module)
PE_CATALOGS = _catalog_module.PE_CATALOGS
pe_model_rows = _catalog_module.pe_model_rows
paired_mmproj = _catalog_module.paired_mmproj
pe_model_task = _catalog_module.pe_model_task


T2I_SYSTEM = """You rewrite image requests for Qwen Image 2.1.
Describe the finished image in one detailed English paragraph, as an observer.
Preserve every requested subject, count, color, position, style and exact text.
Develop unspecified visual details coherently: composition, materials, background
and lighting. Do not add readable text unless requested. Text inside the image
stays in its original language and is enclosed in double quotes.
Return only the image description, without reasoning, JSON, headings, markdown,
resolution or aspect ratio. Output size is controlled separately."""

I2I_SYSTEM = """You rewrite image editing instructions for Qwen Image 2.1.
Use the actual input images to clarify the user's requested change. Change only
the requested attributes, make that change visible, and preserve everything else.
For a newly composed scene or compositing, state the new arrangement and each
reference's role. Preserve identity and exact product details from the references.
Use <image1>, <image2>, etc. in input order for multiple images; use natural
references for a single image. Do not invent missing images or unseen anatomy.
Write descriptive prose in Chinese for Chinese requests, otherwise in English.
Keep text to be rendered in its requested language, quoted exactly; do not
translate existing image text unless requested.
Return only one actionable editing instruction, without reasoning, JSON,
headings, markdown, resolution or aspect ratio. Output size is controlled separately."""


def _model_rows():
    inventory = []
    for catalog in PE_CATALOGS:
        if folder_paths.map_legacy(catalog) not in folder_paths.folder_names_and_paths:
            continue
        for name in folder_paths.get_filename_list(catalog):
            path = folder_paths.get_full_path(catalog, name)
            inventory.append((catalog, name, path))
    return pe_model_rows(inventory)


def _resolve_model(name):
    for row in _model_rows():
        if row["name"] == name:
            for root in folder_paths.get_folder_paths(row["catalog"]):
                candidate = os.path.join(root, name)
                if (folder_paths.is_within_directory(root, candidate)
                        and os.path.normcase(os.path.realpath(candidate)) == os.path.normcase(os.path.realpath(row["path"]))):
                    return {**row, "root": root}
    raise FileNotFoundError("PE model is missing or its required adjacent mmproj is unavailable.")


def _clean_output(text):
    text = re.sub(r"<think>.*?(?:</think>|$)", "", str(text or ""), flags=re.S).strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text).strip()
    if text.startswith("{"):
        value = json.loads(text)
        text = value["rewritten_prompt"]
    return str(text).strip()


def _prompt_output(prompt, model, status):
    record = {"model": model or "None", "prompt": prompt, "status": status}
    if status != "disabled":
        logging.info(
            "[SimpAI Qwen Image 2.1 PE] model=%s status=%s prompt=%s",
            record["model"], status, json.dumps(prompt, ensure_ascii=False),
        )
    return io.NodeOutput(prompt, ui={"simpai_pe": [record]})


def _native_generate(model_path, prompt, system, images, seed, max_length):
    clip = comfy.sd.load_clip(
        ckpt_paths=[model_path], clip_type=comfy.sd.CLIPType.QWEN_IMAGE,
        embedding_directory=folder_paths.get_folder_paths("embeddings"),
    )
    vision = "<|vision_start|><|image_pad|><|vision_end|>" * len(images)
    formatted = (
        f"<|im_start|>system\n{system}<|im_end|>\n"
        f"<|im_start|>user\n{vision}{prompt}<|im_end|>\n"
        "<|im_start|>assistant\n<think>\n</think>\n"
    )
    # Separate image tensors preserve the sizes and ordering of mixed references.
    tokens = clip.tokenize(formatted, images=images, min_length=1, thinking=False)
    generated = clip.generate(
        tokens, do_sample=True, max_length=max_length, temperature=1.0,
        top_k=20, top_p=0.95, min_p=0.0, repetition_penalty=1.05,
        presence_penalty=0.0, seed=seed, mtp=False,
    )
    return clip.decode(generated)


def _gguf_generate(row, prompt, system, images, seed, max_length):
    loader = nodes.NODE_CLASS_MAPPINGS.get("llama_cpp_model_loader")
    instruct = nodes.NODE_CLASS_MAPPINGS.get("llama_cpp_instruct_adv")
    if loader is None or instruct is None:
        raise RuntimeError("GGUF PE requires ComfyUI-llama-cpp_vlm.")
    mmproj = "None"
    if pe_model_task(row["name"]) == "t2i":
        images = []
    else:
        mmproj_path = paired_mmproj(row["path"])
        if not mmproj_path:
            raise FileNotFoundError("GGUF PE has no matching adjacent mmproj file.")
        root = os.path.dirname(row["path"])
        if not folder_paths.is_within_directory(root, mmproj_path):
            raise ValueError("PE mmproj must be in the model directory.")
        mmproj = os.path.relpath(mmproj_path, row["root"])
    module = importlib.import_module(loader.__module__)
    config = {
        "model": row["name"], "mmproj": mmproj if images else "None",
        "model_catalog": row["catalog"], "model_root": row["root"],
        "chat_handler": "Qwen3.5", "n_ctx": 32768, "vram_limit": -1,
        "image_min_tokens": 1024, "image_max_tokens": 0, "load_mtp": False,
    }
    model_management.unload_all_models()
    storage = module.LLAMA_CPP_STORAGE
    try:
        storage.load_model(config)
        return instruct().process(
            llama_model=config, preset_prompt="", custom_prompt=prompt,
            system_prompt=system, inference_mode="images", max_frames=24,
            max_size=1024, seed=seed, force_offload=False, save_states=False,
            unique_id="qwen21-pe", images=images,
            parameters={"max_tokens": max_length, "temperature": 1.0,
                        "top_k": 20, "top_p": 0.95, "repeat_penalty": 1.05},
        )[0]
    finally:
        storage.clean(all=True)


class SimpAIQwenImage21TextGenerate(io.ComfyNode):
    @classmethod
    def validate_inputs(cls, pe_model, images=None):
        # Saved selections may no longer be in the current combo options.
        return True

    @classmethod
    def fingerprint_inputs(cls, pe_model, **kwargs):
        if pe_model in (None, "", "None"):
            return None
        try:
            row = _resolve_model(pe_model)
            fingerprints = []
            for path in (row["path"], row["mmproj"]):
                if path:
                    stat = os.stat(path)
                    fingerprints.append((path, stat.st_mtime_ns, stat.st_size))
            return tuple(fingerprints)
        except FileNotFoundError:
            return ("unavailable", pe_model)

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAIQwenImage21TextGenerate",
            display_name="SimpAI Qwen Image 2.1 PE",
            category="text",
            has_intermediate_output=True,
            inputs=[
                io.String.Input("prompt", multiline=True, dynamic_prompts=True),
                io.Combo.Input("pe_model", options=["None", *[row["name"] for row in _model_rows()]], default="None"),
                io.Int.Input("seed", default=0, min=0, max=0xffffffffffffffff),
                io.Int.Input("max_length", default=4096, min=1, max=32768, optional=True),
                io.Autogrow.Input("images", optional=True, template=io.Autogrow.TemplatePrefix(
                    io.Image.Input("image", optional=True), prefix="image_", min=0, max=100,
                )),
            ],
            outputs=[io.String.Output(display_name="prompt")],
        )

    @classmethod
    def execute(cls, prompt, pe_model, seed, max_length=4096, images=None):
        if pe_model in (None, "", "None"):
            return _prompt_output(prompt, pe_model, "disabled")
        try:
            row = _resolve_model(pe_model)
            images = images or {}
            image_list = [
                images[name][index:index + 1]
                for name in sorted(images, key=lambda name: int(name.rsplit("_", 1)[-1]))
                if images[name] is not None
                for index in range(images[name].shape[0])
            ]
            filename = os.path.basename(pe_model).lower()
            task = pe_model_task(pe_model)
            edit = task == "i2i" or (task is None and bool(image_list))
            image_list = image_list if edit else []
            system = I2I_SYSTEM if edit else T2I_SYSTEM
            if filename.endswith(".gguf"):
                text = _gguf_generate(row, prompt, system, image_list, seed, max_length)
            elif filename.endswith(".safetensors"):
                text = _native_generate(row["path"], prompt, system, image_list, seed, max_length)
            else:
                raise ValueError("PE model must be safetensors or GGUF.")
        except FileNotFoundError as error:
            logging.warning("[SimpAI Qwen Image 2.1 PE] Skipping %r: %s Using the original prompt.", pe_model, error)
            return _prompt_output(prompt, pe_model, "unavailable")
        rewritten = _clean_output(text)
        return _prompt_output(rewritten or prompt, pe_model, "rewritten" if rewritten else "empty_output")


NODE_CLASS_MAPPINGS = {"SimpAIQwenImage21TextGenerate": SimpAIQwenImage21TextGenerate}
NODE_DISPLAY_NAME_MAPPINGS = {"SimpAIQwenImage21TextGenerate": "SimpAI Qwen Image 2.1 PE"}
