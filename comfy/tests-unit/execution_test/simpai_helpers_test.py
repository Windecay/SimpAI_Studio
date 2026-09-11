import gc
import os
from types import ModuleType, SimpleNamespace
import weakref

import pytest
import torch

from comfy_execution.graph import DynamicPrompt
import simpai_prompt_cleanup as cleanup
import simpai_ws_recovery as recovery


@pytest.fixture
def recovery_state(monkeypatch):
    monkeypatch.setattr(recovery, "_PENDING_FILES", {})
    monkeypatch.setattr(recovery, "_register_temp_directory", lambda path: None)


def test_recovery_history_lifecycle(tmp_path, recovery_state):
    descriptor = recovery.save_bytes(tmp_path, b"video", "mp4")
    path = tmp_path / descriptor["subfolder"] / descriptor["filename"]
    history = {"outputs": {"save": {"video": [descriptor]}}}
    assert path.read_bytes() == b"video"
    assert descriptor["filename"] in recovery._PENDING_FILES
    recovery.finalize_history_output_files(tmp_path, history)
    assert descriptor["filename"] not in recovery._PENDING_FILES
    assert path.is_file()
    recovery.delete_history_output_files(tmp_path, history)
    assert not path.exists()


def test_failed_atomic_write_removes_temporary_file(tmp_path, monkeypatch, recovery_state):
    def fail(*args):
        raise OSError("replace failed")

    monkeypatch.setattr(recovery.os, "replace", fail)
    assert recovery.save_bytes(tmp_path, b"video", "mp4") is None
    assert list((tmp_path / recovery.RECOVERY_SUBFOLDER).iterdir()) == []


def test_recovery_pruning_preserves_current_result(tmp_path, recovery_state):
    old = recovery.save_bytes(tmp_path, b"old", "mp4")
    old_path = tmp_path / old["subfolder"] / old["filename"]
    recovery._PENDING_FILES.pop(old["filename"])
    os.utime(old_path, (1, 1))
    current = recovery.save_bytes(tmp_path, b"current", "mp4")
    recovery.prune_recovery_directory(tmp_path, max_files=1, min_retention_seconds=0)
    assert not old_path.exists()
    assert (tmp_path / current["subfolder"] / current["filename"]).is_file()


@pytest.mark.parametrize("dtype", [torch.float32, torch.uint8])
def test_preview_does_not_retain_video_storage(dtype):
    frames = torch.full((2, 600, 800, 3), 1, dtype=dtype)
    ref = weakref.ref(frames)
    preview = cleanup._image_preview(frames)
    assert preview.shape == (384, 512, 3)
    assert preview.dtype == torch.float32
    assert preview.untyped_storage().data_ptr() != frames.untyped_storage().data_ptr()
    del frames
    gc.collect()
    assert ref() is None


def test_metadata_snapshot_preserves_identity_without_tensors():
    tensor = torch.ones(2)
    graph = DynamicPrompt({"source": {"inputs": {"image": tensor}}})
    source = {"graph": graph, "same": tensor, "again": tensor}
    snapshot = cleanup._metadata_snapshot(source, {})
    assert snapshot["same"] is snapshot["again"]
    assert snapshot["graph"].original_prompt["source"]["inputs"]["image"] is snapshot["same"]
    assert snapshot["same"] is not tensor
    assert graph.original_prompt["source"]["inputs"]["image"] is tensor


def test_easyuse_cleanup_releases_cached_objects():
    module = ModuleType("test_easyuse")
    module.__file__ = "/custom_nodes/ComfyUI-Easy-Use/py/easy.py"
    module.cache = {"model": object()}
    module.cache_count = {"model": 1}
    module.easyCache = SimpleNamespace(loaded_objects={"vae": [object()]})
    module.sampler = SimpleNamespace(last_helds={"samples": {"value": object()}})
    cleanup._clear_easyuse_module(module, set())
    assert module.cache == {}
    assert module.cache_count == {}
    assert module.easyCache.loaded_objects == {"vae": []}
    assert module.sampler.last_helds == {"samples": {}}
