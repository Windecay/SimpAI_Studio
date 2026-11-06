import ast
import asyncio
import copy
from fractions import Fraction
import importlib.util
from io import BytesIO
import json
from pathlib import Path
import struct
from types import SimpleNamespace

import av
import numpy as np
from PIL import Image
import pytest
import torch
import torch.nn.functional as F

from modules.comfy_progress_filter import install_aio_enhance_uov_progress_filter
from modules.comfy_progress_profile import format_relayvsr_progress


ROOT = Path(__file__).resolve().parents[1]
NODE_FILE = ROOT / "comfy/custom_nodes/SimpAINodes/SimpAIRelayVSR.py"


@pytest.fixture
def relay(monkeypatch, tmp_path):
    spec = importlib.util.spec_from_file_location("relayvsr_nodes_under_test", NODE_FILE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    output = tmp_path / "output"
    temp = tmp_path / "temp"
    output.mkdir()
    temp.mkdir()
    monkeypatch.setattr(module.folder_paths, "get_output_directory", lambda: str(output))
    monkeypatch.setattr(module.folder_paths, "get_temp_directory", lambda: str(temp))
    return module


def make_video(path, count, fps=Fraction(30000, 1001)):
    with av.open(str(path), "w") as container:
        stream = container.add_stream("libx264", rate=fps)
        stream.width, stream.height = 12, 8
        stream.pix_fmt = "yuv420p"
        stream.options = {"crf": "0", "preset": "ultrafast"}
        for index in range(count):
            pixels = np.full((8, 12, 3), (index * 5) % 256, dtype=np.uint8)
            frame = av.VideoFrame.from_ndarray(pixels, format="rgb24")
            frame.pts, frame.time_base = index, 1 / fps
            for packet in stream.encode(frame):
                container.mux(packet)
        container.mux(stream.encode())
    return path


def read_video(path):
    with av.open(str(path)) as container:
        stream = container.streams.video[0]
        return [frame.to_ndarray(format="rgb24") for frame in container.decode(stream)], stream.average_rate


@pytest.mark.parametrize("count", [1, 2, 15, 16, 17, 30, 31, 32, 82])
def test_streamed_windows_keep_boundaries_and_final_frame(relay, tmp_path, count):
    path = make_video(tmp_path / "input.mp4", count)
    expected, fps = read_video(path)
    keyframes, total = relay._keyframes(path, 0, 0, fps)
    indices = list(range(0, count - 1, 15)) + [count - 1]
    assert total == count
    torch.testing.assert_close(keyframes, torch.from_numpy(np.stack([expected[i] for i in indices])).float() / 255)
    windows = list(relay._windows(path, 0, 0, fps))
    assert all(1 <= len(window) <= 16 for window in windows)
    restored = torch.cat([window if index == 0 else window[1:] for index, window in enumerate(windows)])
    torch.testing.assert_close(restored, torch.from_numpy(np.stack(expected)).float() / 255)


@pytest.mark.parametrize("factor,count", [(2, 1), (2, 16), (2, 17), (4, 31), (4, 32), (2, 82)])
def test_node_samples_once_and_saves_all_frames_with_source_rate(relay, tmp_path, monkeypatch, factor, count):
    path = make_video(tmp_path / "source.mp4", count)
    calls = []
    events = []
    model = SimpleNamespace(model=SimpleNamespace(
        diffusion_model=SimpleNamespace(positive_conditioning=torch.zeros(2, 4), latent_stride=16 // factor),
        latent_format=SimpleNamespace(latent_channels=48),
    ))

    def sample(*args):
        calls.append(args)
        assert args[2:6] == (1, 1.0, "euler", "simple")
        return args[-1],

    class Decoder:
        def __init__(self):
            self.windows = []

        def decode(self, samples, vae_options):
            images = vae_options["lq_images"]
            self.windows.append(len(images))
            assert samples.shape[2] == (1 if len(images) == 1 else 2)
            assert vae_options["detail"] == 0.75
            relay.utils.ProgressBar(len(images)).update_absolute(len(images))
            return F.interpolate(images.movedim(-1, 1), scale_factor=factor, mode="nearest").movedim(1, -1).unsqueeze(0)

    decoder = Decoder()
    monkeypatch.setattr(relay.nodes, "common_ksampler", sample)
    monkeypatch.setattr(relay.utils, "PROGRESS_BAR_HOOK", lambda value, total, preview=None, **kwargs: events.append((value, total, preview)))
    source = relay.InputImpl.VideoFromFile(str(path))
    result = relay.SimpAIRelayVSRVideo.execute(model, decoder, source, seed=123, detail=0.75)
    assert len(calls) == 1
    assert calls[0][1] == 123
    assert calls[0][6][0][1]["lq_images"].shape[0] == len(list(range(0, count - 1, 15)) + [count - 1])
    assert max(decoder.windows) <= 16
    output, = result.result
    frames, fps = read_video(output.get_stream_source())
    assert len(frames) == count
    assert frames[0].shape == (8 * factor, 12 * factor, 3)
    assert fps == Fraction(30000, 1001)
    assert [item[0] for item in events] == sorted(item[0] for item in events)
    assert {item[1] for item in events} == {count * 100}
    assert events[-1][0] == count * 100
    assert events[0][0] == 1
    assert any(item[2] is not None and item[2][0] == "WEBP" for item in events)
    monkeypatch.setattr(output, "get_components", lambda *args, **kwargs: pytest.fail("Saving must not materialize all video frames."))
    saved = relay.SimpAIRelayVSRSaveVideo.execute(output)
    assert saved.ui["video"][0]["filename"].endswith(".mp4")
    saved_frames, saved_fps = read_video(tmp_path / "output" / saved.ui["video"][0]["filename"])
    assert len(saved_frames) == count and saved_fps == fps


def test_duration_cap_is_shared_by_both_read_passes(relay, tmp_path):
    path = make_video(tmp_path / "source.mp4", 45, fps=Fraction(10))
    keys, count = relay._keyframes(path, 0.3, 1.7, Fraction(10))
    windows = list(relay._windows(path, 0.3, 1.7, Fraction(10)))
    assert count == 17
    assert len(keys) == 3
    assert sum(len(window) - int(index > 0) for index, window in enumerate(windows)) == 17


def test_audio_is_retained_and_limited_to_output_duration(relay, tmp_path):
    silent = make_video(tmp_path / "silent.mp4", 20, fps=Fraction(10))
    source = tmp_path / "source.mp4"
    relay.subprocess.run([
        relay.imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(silent), "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
        "-c:v", "copy", "-c:a", "aac", "-t", "2", str(source),
    ], check=True, timeout=20)
    output = tmp_path / "output.mp4"
    relay._mux_audio(str(silent), str(source), str(output), 0.25, 1.0)
    with av.open(str(output)) as container:
        assert len(container.streams.audio) == 1
        audio = container.streams.audio[0]
        assert 0.9 <= float(audio.duration * audio.time_base) <= 1.1


def test_progress_hook_is_restored_after_sampling_failure(relay, monkeypatch):
    events = []
    original = lambda *args, **kwargs: events.append(args)
    monkeypatch.setattr(relay.utils, "PROGRESS_BAR_HOOK", original)
    progress = relay.utils.ProgressBar(100)
    with pytest.raises(RuntimeError, match="cancel"):
        with relay._progress_range(progress, 10, 40):
            relay.utils.ProgressBar(3).update_absolute(1)
            raise RuntimeError("cancel")
    assert relay.utils.PROGRESS_BAR_HOOK is original
    assert events[0][:2] == (20, 100)


def test_mux_process_is_stopped_on_cancellation(relay, monkeypatch):
    process = SimpleNamespace(poll=lambda: None, kill=lambda: calls.append("kill"), wait=lambda **kwargs: calls.append("wait"))
    calls = []
    monkeypatch.setattr(relay.subprocess, "Popen", lambda *args, **kwargs: process)
    monkeypatch.setattr(relay.model_management, "throw_exception_if_processing_interrupted", lambda: (_ for _ in ()).throw(RuntimeError("cancel")))
    with pytest.raises(RuntimeError, match="cancel"):
        relay._mux_audio("silent.mp4", "source.mp4", "output.mp4", 0, 1)
    assert calls == ["kill", "wait"]


@pytest.mark.parametrize("factor", [2, 4])
def test_workflow_validates_with_native_loaders_and_connected_control_types(relay, tmp_path, monkeypatch, factor):
    import execution
    from comfy_extras.nodes_video import LoadVideo

    spec = importlib.util.spec_from_file_location("relay_params_under_test", ROOT / "comfy/custom_nodes/params_input.py")
    params = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(params)
    make_video(tmp_path / "example.mp4", 2)
    monkeypatch.setattr(relay.folder_paths, "get_input_directory", lambda: str(tmp_path))
    names = json.loads((ROOT / "presets/RelayVSR.json").read_text(encoding="utf-8"))["model_list"]
    monkeypatch.setattr(relay.folder_paths, "get_filename_list", lambda category: [entry.split(",")[1] for entry in names])
    for name, node in {**params.NODE_CLASS_MAPPINGS, "LoadVideo": LoadVideo, **relay.NODE_CLASS_MAPPINGS}.items():
        monkeypatch.setitem(relay.nodes.NODE_CLASS_MAPPINGS, name, node)
    workflow = json.loads((ROOT / f"workflows/scene_relayvsr_x{factor}_api.json").read_text(encoding="utf-8"))
    valid, error, outputs, node_errors = asyncio.run(execution.validate_prompt("relay-schema", workflow, None))
    assert valid, (error, node_errors)
    assert outputs == ["7"]


def test_preset_models_catalog_and_translations_are_consistent():
    preset = json.loads((ROOT / "presets/RelayVSR.json").read_text(encoding="utf-8"))
    scene = preset["default_engine"]["scene_frontend"]
    assert preset["supported_tasks"] == ["video_upscale"]
    assert scene["theme"] == ["RelayVSR Video Upscale 2x", "RelayVSR Video Upscale 4x"]
    assert scene["resolution_control"]["frontend_preprocess"] is False
    assert scene["director_capability"]["audio_output"] == "source_audio"
    tree = ast.parse((ROOT / "model_checker.py").read_text(encoding="utf-8"))
    packages = next(node.value for node in tree.body if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == "packages" for target in node.targets))
    package = next(value for key, value in zip(packages.keys, packages.values) if key.value == "relayvsr_package")
    package = ast.literal_eval(package)
    assert package["id"] == 53
    assert package["files"] == preset["model_list"]
    for theme in scene["theme"]:
        flow = ROOT / f"workflows/scene_{scene['task_method'][theme]}_api.json"
        assert flow.is_file()
        assert not any(node["class_type"] == "CLIPLoader" for node in json.loads(flow.read_text()).values())
    cn = json.loads((ROOT / "language/cn.json").read_text(encoding="utf-8"))
    assert all(cn[theme] != theme for theme in scene["theme"])


def test_progress_uses_frame_totals_instead_of_one_sampler_step():
    pipeline = SimpleNamespace(_should_count_progress_as_sampler_step=lambda *args: False)
    install_aio_enhance_uov_progress_filter(pipeline)
    assert pipeline._should_count_progress_as_sampler_step("SimpAIRelayVSRVideo", {}, 8200, 1)
    assert not pipeline._should_count_progress_as_sampler_step("KSampler", {}, 8200, 1)
    assert "keyframes" in format_relayvsr_progress(100, 1000, "en")
    assert "5/10" in format_relayvsr_progress(40 * 10 + 5 * 59, 1000, "en")
    assert "保存" in format_relayvsr_progress(990, 1000, "cn")


@pytest.mark.parametrize("factor,count", [(2, 17), (2, 31), (4, 17), (4, 31)])
def test_real_flash_windowed_decode_matches_whole_video(relay, factor, count):
    from comfy.ldm.wan.model_vsr import RelayFlash, relay_keyframes, relay_latent_size

    threads = torch.get_num_threads()
    torch.set_num_threads(2)
    try:
        torch.manual_seed(42)
        decoder = RelayFlash(factor, dim=64, depth=1, num_heads=1, kv_groups=1, hidden_dim=64, head_dim=32)
        decoder.load_state_dict({
            name: torch.ones_like(value) if "norm" in name and name.endswith("weight") else torch.randn_like(value) * 0.01
            for name, value in decoder.state_dict().items()
        })
        images = torch.rand(count, 8, 12, 3)
        indices = relay_keyframes(count)
        samples = torch.randn(1, 48, len(indices), *relay_latent_size(8, 12, 16 // factor))
        complete = decoder.decode(samples, lq_images=images, detail=0.75)
        windows = []
        for index, (first, last) in enumerate(zip(indices, indices[1:])):
            decoded = decoder.decode(samples[:, :, index:index + 2], lq_images=images[first:last + 1], detail=0.75)
            windows.append(decoded if index == 0 else decoded[:, :, 1:])
        torch.testing.assert_close(torch.cat(windows, dim=2), complete, atol=1e-6, rtol=1e-6)
    finally:
        torch.set_num_threads(threads)


@pytest.mark.parametrize("factor", [2, 4])
def test_studio_mapper_updates_video_and_visible_controls(factor):
    from simpleai_base.params_mapper import ComfyTaskParams
    from modules.comfy_progress_profile import build_progress_profile

    path = ROOT / "enhanced/comfy_task.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    names = {"ComfyTask", "get_comfy_task", "_model_type_from_name", "_is_custom_model_choice"}
    tree.body = [node for node in tree.body if isinstance(node, (ast.ClassDef, ast.FunctionDef)) and node.name in names]
    namespace = {"ComfyTaskParams": ComfyTaskParams, "build_progress_profile": build_progress_profile}
    exec(compile(tree, str(path), "exec"), namespace)
    task = namespace["get_comfy_task"](
        "offline-user", "Comfy", "RelayVSR", f"scene_relayvsr_x{factor}",
        {"steps": 1, "video": "source.mp4", "seed": 123, "var_number": 21, "var_number3": 0.75, "var_number8": 5,
         "base_model": "other.safetensors", "vae_model": "other_vae.safetensors"},
        [],
    )
    workflow = (ROOT / f"workflows/scene_relayvsr_x{factor}_api.json").read_text(encoding="utf-8")
    mapping = task.params.get_key_mapped(workflow)
    assert {"video", "seed", "var_number", "var_number3", "var_number8"} <= mapping.keys()
    assert task.steps is None
    assert mapping["video"] == ["LoadVideo:RelayVSR Source:file"]
    path = ROOT / "enhanced/simpleai.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    tree.body = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "_apply_workflow_mapping"]
    namespace = {"copy": copy}
    exec(compile(tree, str(path), "exec"), namespace)
    converted, _ = namespace["_apply_workflow_mapping"](json.loads(workflow), task.params.get_params(), mapping)
    assert converted["4"]["inputs"]["file"] == "source.mp4"
    assert converted["1"]["inputs"]["var_number"] == 21
    assert converted["1"]["inputs"]["var_number3"] == 0.75
    assert converted["1"]["inputs"]["var_number8"] == 5
    assert converted["5"]["inputs"]["seed"] == 123
    assert converted["2"]["inputs"]["unet_name"] != "other.safetensors"
    assert converted["3"]["inputs"]["vae_name"] != "other_vae.safetensors"


def test_client_registers_the_result_and_recovers_it_as_video():
    import os

    path = ROOT / "enhanced/comfy_task.py"
    module = ast.parse(path.read_text(encoding="utf-8"))
    registration = next(node for node in module.body if isinstance(node, ast.Expr)
                        and "SAVE_NODE_CLASS_TYPES.add('SimpAIRelayVSRSaveVideo')" in ast.unparse(node))
    pipeline = SimpleNamespace(SAVE_NODE_CLASS_TYPES=set())
    exec(compile(ast.Module(body=[registration], type_ignores=[]), str(path), "exec"), {"comfyclient_pipeline": pipeline})
    assert "SimpAIRelayVSRSaveVideo" in pipeline.SAVE_NODE_CLASS_TYPES
    assert "SimpAIRelayVSRVideo" not in pipeline.SAVE_NODE_CLASS_TYPES
    from importlib.util import find_spec

    client_path = Path(find_spec("simpleai_base.comfyclient_pipeline").origin)
    tree = ast.parse(client_path.read_text(encoding="utf-8"))
    tree.body = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "_recover_history_output_data"]
    namespace = {
        "os": os, "_resolve_prompt_node_id": lambda node_id, prompt: node_id,
        "get_image": lambda *args: b"movie",
        "_encode_history_video_payload": lambda raw, fmt: raw if fmt == "mp4" else None,
    }
    exec(compile(tree, str(client_path), "exec"), namespace)
    output = namespace["_recover_history_output_data"](
        "relay-result", {"6": {"_meta": {"title": "RelayVSR Result"}}},
        {"outputs": {"6": {"video": [{"filename": "result.mp4", "subfolder": "", "type": "output"}]}}}, {"6"},
    )
    assert output == {"RelayVSR Result_video_mp4": [b"movie"]}


@pytest.mark.parametrize("lang", ["cn", "en"])
def test_worker_displays_relay_stages_and_keeps_saving_below_100(lang):
    path = ROOT / "modules/async_worker.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    functions = [node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)
                 and node.name in ("callback_comfytask", "clamp_progress_total")]
    events = []
    namespace = {
        "async_task": SimpleNamespace(task_method="scene_relayvsr_x2", callback_steps=0, simpleai_lang=lang, content_type="video"),
        "preparation_steps": 2, "current_progress": 2, "all_steps": 1,
        "format_relayvsr_progress": format_relayvsr_progress,
        "progressbar": lambda _task, *args: events.append(args),
    }
    exec(compile(ast.Module(body=functions, type_ignores=[]), str(path), "exec"), namespace)
    preview = object()
    for step in (100, 400, 695, 990, 1000):
        namespace["callback_comfytask"](step, 1000, preview)
    assert all(value < 100 for value, _title, _image in events)
    assert [value for value, _title, _image in events] == sorted(value for value, _title, _image in events)
    assert all(image is preview for _value, _title, image in events)
    assert ("保存" if lang == "cn" else "saving") in events[-1][1]


def test_websocket_preview_progress_and_history_result_remain_separate(monkeypatch):
    from tests import test_comfyclient_pipeline_preview as helpers
    from importlib.util import find_spec

    monkeypatch.setattr(helpers, "BASE_SRC", Path(find_spec("simpleai_base.comfyclient_pipeline").origin).parents[1])
    pipeline = helpers._load_pipeline_module()
    pipeline.PREVIEW_NODE_CLASS_TYPES.add("SimpAIRelayVSRVideo")
    pipeline.SAVE_NODE_CLASS_TYPES.add("SimpAIRelayVSRSaveVideo")
    install_aio_enhance_uov_progress_filter(pipeline)
    prompt_id = "relay-stream"
    prompt = {
        "6": {"class_type": "SimpAIRelayVSRVideo", "inputs": {}, "_meta": {"title": "RelayVSR Processing"}},
        "7": {"class_type": "SimpAIRelayVSRSaveVideo", "inputs": {"video": ["6", 0]}, "_meta": {"title": "RelayVSR Result"}},
    }
    preview = BytesIO()
    Image.new("RGB", (2, 2), (12, 34, 56)).save(preview, format="WEBP", quality=80)
    messages = [
        helpers._executing(prompt_id, "6"),
        helpers._progress(prompt_id, 1, 1000, "6"),
        helpers._progress(prompt_id, 695, 1000, "6"),
        struct.pack(">II", 1, 3) + preview.getvalue(),
        helpers._progress(prompt_id, 1000, 1000, "6"),
        helpers._executing(prompt_id, "7"),
        helpers._executing(prompt_id, None),
    ]
    monkeypatch.setattr(pipeline, "queue_prompt", lambda *args, **kwargs: {"prompt_id": prompt_id})
    monkeypatch.setattr(pipeline.model_management, "throw_exception_if_processing_interrupted", lambda: None)
    monkeypatch.setattr(pipeline, "get_history_item", lambda *args: {
        "outputs": {"7": {"video": [{"filename": "result.mp4", "subfolder": "", "type": "output"}]}},
        "status": {"completed": True},
    })
    monkeypatch.setattr(pipeline, "get_image", lambda *args: b"movie")
    events = []
    outputs = pipeline.get_images(
        "offline-user", helpers.FakeWebSocket(messages), prompt,
        callback=lambda *args: events.append(args), total_steps=None,
    )
    assert events[-1][:2] == (1000, 1000)
    assert any(step == 695 and image is not None for step, _total, image in events)
    assert list(outputs) == ["RelayVSR Result_video_mp4"]
    assert outputs["RelayVSR Result_video_mp4"].endswith(b"movie")
