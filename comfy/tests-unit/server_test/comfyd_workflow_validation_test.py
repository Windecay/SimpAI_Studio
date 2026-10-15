import ast
import asyncio
import copy
import json
import logging
from pathlib import Path
import time
from types import SimpleNamespace
from typing import Optional
import uuid

import pytest


@pytest.fixture
def handlers():
    source = Path(__file__).resolve().parents[2] / "server.py"
    tree = ast.parse(source.read_text(encoding="utf-8"))
    names = {"post_prompt", "validate_imported_workflow", "valid_workflow_metadata", "workflow_metadata_from_prompt"}
    functions = [copy.deepcopy(node) for node in ast.walk(tree)
                 if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names]
    for function in functions:
        function.decorator_list = []
    queued = []
    validation = {"errors": {"bad": {"errors": ["invalid output"]}}}

    async def validate_prompt(*args):
        return True, None, ["good"], validation["errors"]

    server = SimpleNamespace(
        number=0, node_replace_manager=SimpleNamespace(apply_replacements=lambda prompt: None),
        trigger_on_prompt=lambda value: value,
        prompt_queue=SimpleNamespace(get_prompt_item=lambda prompt_id: None, put_if_absent=queued.append),
    )
    namespace = {
        "self": server, "json": json, "Optional": Optional, "uuid": uuid, "time": time, "logging": logging,
        "web": SimpleNamespace(json_response=lambda data, status=200: SimpleNamespace(data=data, status=status)),
        "execution": SimpleNamespace(validate_prompt=validate_prompt, SENSITIVE_EXTRA_DATA_KEYS=[]),
    }
    exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), "exec"), namespace)
    return namespace, queued, validation


def request(data):
    async def json_body():
        return copy.deepcopy(data)
    return SimpleNamespace(json=json_body, headers={})


@pytest.mark.parametrize("prompt", [None, [], {}, {str(i): {} for i in range(513)}])
def test_preflight_rejects_invalid_graph_without_queueing(handlers, prompt):
    namespace, queued, _ = handlers
    result = asyncio.run(namespace["validate_imported_workflow"](request({"prompt": prompt})))
    assert result.status == 400
    assert result.data["strict_submission_supported"]
    assert not queued


def test_strict_submission_preserves_legacy_partial_output_behavior(handlers):
    namespace, queued, validation = handlers
    data = {"prompt": {"good": {}, "bad": {}}}
    preflight = asyncio.run(namespace["validate_imported_workflow"](request(data)))
    assert not preflight.data["valid"]
    strict = asyncio.run(namespace["post_prompt"](request({**data, "simpai_require_all_outputs": True})))
    assert strict.status == 400
    assert strict.data["error"]["type"] == "invalid_output_branch"
    assert not queued
    legacy = asyncio.run(namespace["post_prompt"](request(data)))
    assert legacy.status == 200
    assert len(queued) == 1
    validation["errors"] = {}
    accepted = asyncio.run(namespace["post_prompt"](request({
        **data, "simpai_require_all_outputs": True, "workflow_metadata": {"workflow_id": "imported"},
    })))
    assert accepted.status == 200
    assert queued[-1][3]["workflow_metadata"] == {"workflow_id": "imported"}
