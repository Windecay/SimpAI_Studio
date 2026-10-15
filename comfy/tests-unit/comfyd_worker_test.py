import ast
import logging
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
import torch


@pytest.mark.parametrize("remaining", [0, 1])
def test_worker_routes_metadata_and_resumes_idle_scan(monkeypatch, remaining):
    source = Path(__file__).resolve().parents[1] / "main_comfyd.py"
    tree = ast.parse(source.read_text(encoding="utf-8"))
    worker = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "prompt_worker")
    server = SimpleNamespace(client_id="client", send_sync=Mock())
    manager = SimpleNamespace(paused=False)
    manager.pause_background_scan = lambda: setattr(manager, "paused", True)
    manager.resume_background_scan = lambda: setattr(manager, "paused", False)
    captured = {}
    calls = 0

    def execute(*args):
        captured["during_execution"] = dict(server.workflow_metadata)

    def get(timeout):
        nonlocal calls
        calls += 1
        if calls > 1:
            captured["paused_before_next_prompt"] = manager.paused
            captured["after_execution"] = dict(server.workflow_metadata)
            raise StopIteration
        return (0, "prompt", {}, {"workflow_metadata": {"workflow_id": "test"}}, [], {}), 1

    queue = SimpleNamespace(get=get, get_tasks_remaining=lambda: remaining, task_done=Mock(), get_flags=lambda: {})
    executor = SimpleNamespace(execute=execute, history_result={}, success=True, status_messages=[])
    execution = SimpleNamespace(
        PromptExecutor=lambda *args, **kwargs: executor,
        PromptQueue=SimpleNamespace(ExecutionStatus=lambda **kwargs: kwargs),
        CacheType=SimpleNamespace(RAM_PRESSURE="ram", CLASSIC="classic"),
    )
    namespace = {
        "execution": execution, "time": SimpleNamespace(perf_counter=lambda: 1.0), "logging": logging,
        "args": SimpleNamespace(cache_classic=True, cache_lru=0, cache_ram=[], cache_none=False),
    }
    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)
    exec(compile(ast.Module(body=[worker], type_ignores=[]), str(source), "exec"), namespace)
    with pytest.raises(StopIteration):
        namespace["prompt_worker"](queue, server, manager)
    assert captured["during_execution"] == {"workflow_id": "test"}
    assert captured["after_execution"] == {}
    assert captured["paused_before_next_prompt"] is bool(remaining)
    assert manager.paused is False
    queue.task_done.assert_called_once()
