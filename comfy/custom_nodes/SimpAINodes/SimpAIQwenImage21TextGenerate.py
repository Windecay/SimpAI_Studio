import importlib
import importlib.util
import json
import logging
import os
from pathlib import Path

import comfy.model_management as model_management
import comfy.sd
import folder_paths
import nodes
from comfy_api.latest import io
from comfy_execution.graph_utils import GraphBuilder


_catalog_path = Path(__file__).resolve().parents[3] / "modules" / "pe_models.py"
_catalog_spec = importlib.util.spec_from_file_location("simpai_pe_models", _catalog_path)
_catalog_module = importlib.util.module_from_spec(_catalog_spec)
_catalog_spec.loader.exec_module(_catalog_module)
PE_CATALOGS = _catalog_module.PE_CATALOGS
pe_model_rows = _catalog_module.pe_model_rows
paired_mmproj = _catalog_module.paired_mmproj
pe_model_task = _catalog_module.pe_model_task
is_flux3_pup_model = _catalog_module.is_flux3_pup_model
prompt_was_expanded = _catalog_module.prompt_was_expanded

_output_path = _catalog_path.with_name("custom_llm_api.py")
_output_spec = importlib.util.spec_from_file_location("simpai_pe_output", _output_path)
_output_module = importlib.util.module_from_spec(_output_spec)
_output_spec.loader.exec_module(_output_module)
PEOutputFormatError = _output_module.PEOutputFormatError


_SYSTEM_PROMPTS = _catalog_path.parents[1] / "docs" / "vlm_system_prompts"
T2I_SYSTEM = (_SYSTEM_PROMPTS / "qwen21_pe_t2i.md").read_text(encoding="utf-8")
I2I_SYSTEM = (_SYSTEM_PROMPTS / "qwen21_pe_i2i.md").read_text(encoding="utf-8")
FLUX3_SYSTEM_PATH = _SYSTEM_PROMPTS / "flux3_pup.md"


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
    return _output_module.clean_pe_output(text)


def _prompt_output(prompt, model, status):
    record = {"model": model or "None", "prompt": prompt, "status": status}
    if status != "disabled":
        logging.info(
            "[SimpAI Prompt Expansion] model=%s status=%s prompt=%s",
            record["model"], status, json.dumps(prompt, ensure_ascii=False),
        )
    return io.NodeOutput(prompt, ui={"simpai_pe": [record]})


def _native_generate(model_path, prompt, system, images, seed, max_length, clip=None):
    if clip is None:
        clip = comfy.sd.load_clip(
            ckpt_paths=[model_path], clip_type=comfy.sd.CLIPType.QWEN_IMAGE,
            embedding_directory=folder_paths.get_folder_paths("embeddings"),
        )
    pup = is_flux3_pup_model(model_path)
    # Separate image tensors preserve the sizes and ordering of mixed references.
    if pup:
        vision = "<|vision_start|><|image_pad|><|vision_end|>" * len(images)
        formatted = (
            f"<|im_start|>system\n{system}<|im_end|>\n"
            f"<|im_start|>user\n{vision}{prompt}<|im_end|>\n"
            "<|im_start|>assistant\n<think>\n</think>\n"
        )
        tokens = clip.tokenize(formatted, images=images, min_length=1, thinking=False)
    else:
        tokens = clip.tokenize(prompt, system_prompt=system, images=images, min_length=1, thinking=True)
    task = pe_model_task(model_path)
    text_only = not images if pup or task is None else task == "t2i"
    generated = clip.generate(
        tokens, do_sample=not pup, max_length=max_length, temperature=1.0,
        top_k=20, top_p=0.95, min_p=0.0, repetition_penalty=1.05 if pup else 1.0,
        presence_penalty=1.5 if text_only else 0.0,
        seed=seed, mtp=not pup,
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
    pup = is_flux3_pup_model(row["name"])
    config = {
        "model": row["name"], "mmproj": mmproj if images else "None",
        "model_catalog": row["catalog"], "model_root": row["root"],
        "chat_handler": "Qwen3.5" if pup else "Qwen3.5-Thinking", "n_ctx": 32768, "vram_limit": -1,
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
                        "top_k": 20, "top_p": 0.95, "repeat_penalty": 1.05 if pup else 1.0,
                        "presence_penalty": 1.5 if not pup and pe_model_task(row["name"]) == "t2i" else 0.0},
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
                io.Combo.Input("target", options=["qwen_image21", "flux3"], default="qwen_image21", optional=True),
                io.Clip.Input("clip", optional=True),
                io.String.Input("applied_prompt", default="", optional=True, multiline=True),
            ],
            outputs=[io.String.Output(display_name="prompt")],
        )

    @classmethod
    def execute(cls, prompt, pe_model, seed, max_length=4096, images=None,
                target="qwen_image21", clip=None, applied_prompt=""):
        if pe_model in (None, "", "None"):
            return _prompt_output(prompt, pe_model, "disabled")
        if prompt_was_expanded(prompt, applied_prompt):
            return _prompt_output(prompt, pe_model, "skipped_assistant")
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
            system = FLUX3_SYSTEM_PATH.read_text(encoding="utf-8") if target == "flux3" else (
                I2I_SYSTEM if edit else T2I_SYSTEM
            )
            if filename.endswith(".gguf"):
                text = _gguf_generate(row, prompt, system, image_list, seed, max_length)
            elif filename.endswith(".safetensors"):
                if clip is None:
                    text = _native_generate(row["path"], prompt, system, image_list, seed, max_length)
                else:
                    text = _native_generate(row["path"], prompt, system, image_list, seed, max_length, clip=clip)
            else:
                raise ValueError("PE model must be safetensors or GGUF.")
        except FileNotFoundError as error:
            if target == "flux3":
                raise
            logging.warning("[SimpAI Prompt Expansion] Skipping %r: %s Using the original prompt.", pe_model, error)
            return _prompt_output(prompt, pe_model, "unavailable")
        try:
            rewritten = _clean_output(text)
        except PEOutputFormatError as error:
            if target == "flux3":
                raise
            logging.warning(
                "[SimpAI Prompt Expansion] Invalid output: model=%s error=%s raw_output=%s Using the original prompt.",
                pe_model, error, json.dumps(str(text), ensure_ascii=False),
            )
            return _prompt_output(prompt, pe_model, "invalid_output")
        if target == "flux3" and not rewritten:
            raise PEOutputFormatError("Flux3 prompt upsampler returned no prompt.")
        return _prompt_output(rewritten or prompt, pe_model, "rewritten" if rewritten else "empty_output")


class SimpAIPromptExpand(io.ComfyNode):
    @classmethod
    def validate_inputs(cls, pe_model, images=None):
        return True

    @classmethod
    def fingerprint_inputs(cls, pe_model, **kwargs):
        return SimpAIQwenImage21TextGenerate.fingerprint_inputs(pe_model, **kwargs)

    @classmethod
    def define_schema(cls):
        schema = SimpAIQwenImage21TextGenerate.define_schema()
        schema.node_id = "SimpAIPromptExpand"
        schema.display_name = "SimpAI Prompt Expansion"
        schema.enable_expand = True
        return schema

    @classmethod
    def execute(cls, prompt, pe_model, seed, max_length=4096, images=None,
                target="qwen_image21", clip=None, applied_prompt=""):
        if pe_model in (None, "", "None") or prompt_was_expanded(prompt, applied_prompt) or clip is not None:
            return SimpAIQwenImage21TextGenerate.execute(prompt, pe_model, seed, max_length, images, target, clip, applied_prompt)
        try:
            row = _resolve_model(pe_model)
        except FileNotFoundError:
            return SimpAIQwenImage21TextGenerate.execute(prompt, pe_model, seed, max_length, images, target, clip, applied_prompt)
        registered_path = folder_paths.get_full_path("text_encoders", row["name"])
        if (not row["name"].lower().endswith(".safetensors") or not registered_path
                or os.path.normcase(os.path.realpath(registered_path)) != os.path.normcase(os.path.realpath(row["path"]))):
            return SimpAIQwenImage21TextGenerate.execute(prompt, pe_model, seed, max_length, images, target, clip, applied_prompt)

        # Use the same loader signature as manually loaded Text Encoder models.
        graph = GraphBuilder()
        loader = graph.node("CLIPLoader", clip_name=row["name"], type="stable_diffusion")
        inputs = {
            "prompt": prompt, "pe_model": pe_model, "seed": seed, "max_length": max_length,
            "target": target, "clip": loader.out(0),
            **{f"images.{name}": image for name, image in (images or {}).items()},
        }
        result = graph.node("SimpAIQwenImage21TextGenerate", **inputs)
        return io.NodeOutput(result.out(0), expand=graph.finalize())


NODE_CLASS_MAPPINGS = {
    "SimpAIQwenImage21TextGenerate": SimpAIQwenImage21TextGenerate,
    "SimpAIPromptExpand": SimpAIPromptExpand,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIQwenImage21TextGenerate": "SimpAI Qwen Image 2.1 PE",
    "SimpAIPromptExpand": "SimpAI Prompt Expansion",
}
