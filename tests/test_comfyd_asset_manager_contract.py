import ast
import asyncio
import logging
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest


ROOT = Path(__file__).resolve().parents[1] / "comfy"


def load_function(entry, name, namespace):
    path = ROOT / entry
    tree = ast.parse(path.read_text(encoding="utf-8"))
    names = {name}
    if name == "setup_database":
        names.update({"database_failure_message", "stop_startup"})
        namespace.update({
            "get_database_url": Mock(return_value="sqlite:///test.db"),
            "get_db_path": Mock(return_value="test.db"),
            "error_kind": Mock(return_value="other"),
            "args": SimpleNamespace(database_url=None),
        })
    body = [node for node in tree.body if (
        isinstance(node, ast.FunctionDef) and node.name in names
    ) or (
        name == "setup_database" and isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id == "WITHOUT_ASSETS" for target in node.targets)
    )]
    exec(compile(ast.Module(body=body, type_ignores=[]), str(path), "exec"), namespace)
    return namespace[name]


@pytest.mark.parametrize("entry", ["main.py", "main_comfyd.py"])
@pytest.mark.parametrize("available", [False, True])
@pytest.mark.parametrize("enabled", [False, True])
def test_database_startup_uses_the_supplied_manager(entry, available, enabled):
    init_db = Mock()
    manager = Mock(enabled=enabled)
    warn = Mock()
    setup = load_function(entry, "setup_database", {
        "dependencies_available": lambda: available,
        "init_db": init_db, "logging": logging, "sys": sys,
        "warn_if_database_in_use": warn,
    })
    setup(manager)
    assert init_db.call_count == int(available and enabled)
    assert manager.startup.call_count == int(available)
    assert warn.call_count == int(available and not enabled)


@pytest.mark.parametrize("entry", ["main.py", "main_comfyd.py"])
@pytest.mark.parametrize("enabled", [False, True])
@pytest.mark.parametrize("message", ["database is locked", "Could not acquire lock on database 'test.db'"])
def test_database_lock_is_only_required_when_assets_enabled(entry, enabled, message):
    manager = Mock(enabled=enabled)
    init_db = Mock(side_effect=RuntimeError(message))
    warn = Mock()
    setup = load_function(entry, "setup_database", {
        "dependencies_available": lambda: True,
        "init_db": init_db, "warn_if_database_in_use": warn,
        "logging": logging, "sys": sys,
    })
    if enabled:
        with pytest.raises(SystemExit) as error:
            setup(manager)
        assert error.value.code == 1
    else:
        assert setup(manager) is None
    assert init_db.call_count == int(enabled)
    assert manager.startup.call_count == int(not enabled)
    assert warn.call_count == int(not enabled)


@pytest.mark.parametrize("entry", ["main.py", "main_comfyd.py"])
def test_enabled_assets_require_successful_database_initialization(entry):
    manager = Mock(enabled=True)
    setup = load_function(entry, "setup_database", {
        "dependencies_available": lambda: True,
        "init_db": Mock(side_effect=RuntimeError("forced initialization failure")),
        "warn_if_database_in_use": Mock(), "logging": logging, "sys": sys,
    })
    with pytest.raises(SystemExit) as error:
        setup(manager)
    assert error.value.code == 1
    manager.startup.assert_not_called()


@pytest.mark.parametrize("entry", ["main.py", "main_comfyd.py"])
@pytest.mark.parametrize("database_path", [None, "test.db"])
def test_disabled_assets_warn_without_taking_database_lock(entry, database_path):
    warning = Mock()
    warn = load_function(entry, "warn_if_database_in_use", {
        "lock_holder_db_path": lambda: database_path,
        "app": SimpleNamespace(logger=SimpleNamespace(log_startup_warning=warning)),
    })
    warn()
    assert warning.call_count == int(database_path is not None)
    if database_path:
        assert database_path in warning.call_args.args[0]
        if entry == "main.py":
            assert "doesn't use that database and will start anyway" in warning.call_args.args[0]
        else:
            assert "--database-url" in warning.call_args.args[0]


@pytest.mark.parametrize("entry", ["main.py", "main_comfyd.py"])
@pytest.mark.parametrize("enabled", [False, True])
@pytest.mark.parametrize("partner_disabled", [False, True])
def test_startup_shares_manager_without_starting_service(entry, enabled, partner_disabled):
    manager = Mock(enabled=enabled)
    server_factory = Mock()
    cleanup = Mock()
    setup_db = Mock()
    thread_factory = Mock()
    worker = Mock()
    node_init = AsyncMock()
    make_dirs = Mock()
    namespace = {
        "args": SimpleNamespace(
            temp_directory=None, windows_standalone_build=False,
            enable_manager=False, disable_all_custom_nodes=True,
            whitelist_custom_nodes=[], disable_api_nodes=True,
            disable_partner_nodes=partner_disabled,
            disable_assets=not enabled, disabled_nodes_config=None,
            quick_test_for_ci=False, auto_launch=False,
        ),
        "AssetManager": object,
        "dependencies_available": lambda: True,
        "governance": SimpleNamespace(load_disabled_nodes=Mock(), apply_disabled_nodes=Mock()),
        "default_asset_manager": lambda: manager,
        "cleanup_temp_filesystem": cleanup,
        "server": SimpleNamespace(PromptServer=server_factory),
        "nodes": SimpleNamespace(init_extra_nodes=node_init),
        "comfy": SimpleNamespace(model_management=SimpleNamespace(set_cudnn_benchmark=Mock())),
        "hook_breaker_ac10a0": Mock(),
        "cuda_malloc_warning": Mock(),
        "setup_database": setup_db,
        "hijack_progress": Mock(),
        "threading": SimpleNamespace(Thread=thread_factory),
        "prompt_worker": worker,
        "folder_paths": SimpleNamespace(get_temp_directory=lambda: "unused-test-temp"),
        "os": SimpleNamespace(makedirs=make_dirs),
        "feature_flags": SimpleNamespace(SERVER_FEATURE_FLAGS={}),
    }
    start = load_function(entry, "start_comfyui", namespace)
    loop = asyncio.new_event_loop()
    try:
        returned_loop, server, start_all = start(loop)
        assert returned_loop is loop
        server_factory.assert_called_once_with(loop, manager)
        setup_db.assert_called_once_with(manager)
        assert cleanup.call_count == int(not enabled)
        node_init.assert_awaited_once_with(init_custom_nodes=False, init_api_nodes=not partner_disabled)
        assert namespace["feature_flags"].SERVER_FEATURE_FLAGS["assets"] is enabled
        thread_factory.assert_called_once_with(
            target=worker, daemon=True, args=(server.prompt_queue, server, manager))
        thread_factory.return_value.start.assert_called_once_with()
        assert callable(start_all)
    finally:
        loop.close()


@pytest.mark.parametrize("entry", ["main.py", "main_comfyd.py"])
def test_entry_no_longer_uses_removed_asset_api(entry):
    source = (ROOT / entry).read_text(encoding="utf-8")
    assert "register_output_files" not in source
    assert "_collect_output_absolute_paths" not in source
    assert "asset_seeder" not in source
    assert "asset_manager.pause_background_scan()" in source
    assert "asset_manager.queue_output_scan()" in source
    assert "asset_manager.resume_background_scan()" in source
    assert "prompt_server.asset_manager.shutdown()" in source


@pytest.mark.parametrize("entry", ["main.py", "main_comfyd.py"])
@pytest.mark.parametrize("phase", ["execute", "completion", "next_queue_item", "resume"])
def test_worker_failure_resumes_scanning_and_preserves_original_error(entry, phase):
    failure = RuntimeError("forced worker failure")
    manager = Mock()
    if phase == "resume":
        manager.resume_background_scan.side_effect = RuntimeError("forced resume failure")
    executor = Mock(success=True, history_result={}, status_messages=[])
    if phase in ("execute", "resume"):
        executor.execute.side_effect = failure
    queue = Mock()
    queue.get.side_effect = [((0, "prompt-id", {}, {}, [], {}), 1), failure]
    queue.get_flags.return_value = {}
    if phase == "completion":
        queue.task_done.side_effect = failure
    worker = load_function(entry, "prompt_worker", {
        "args": SimpleNamespace(cache_classic=False, cache_none=True, cache_lru=0),
        "execution": SimpleNamespace(
            CacheType=SimpleNamespace(RAM_PRESSURE=0, CLASSIC=1, LRU=2, NONE=3),
            PromptExecutor=Mock(return_value=executor),
            PromptQueue=SimpleNamespace(ExecutionStatus=Mock()),
        ),
        "time": SimpleNamespace(perf_counter=lambda: 1.0),
        "comfy": SimpleNamespace(model_management=Mock()),
        "logging": logging, "gc": Mock(), "hook_breaker_ac10a0": Mock(),
    })
    with pytest.raises(RuntimeError) as error:
        worker(queue, SimpleNamespace(client_id=None), manager)
    assert error.value is failure
    manager.pause_background_scan.assert_called_once_with()
    manager.resume_background_scan.assert_called_once_with()


def test_cached_only_execution_still_reports_success():
    tree = ast.parse((ROOT / "execution.py").read_text(encoding="utf-8"))
    function = next(node for node in ast.walk(tree)
                    if isinstance(node, ast.AsyncFunctionDef) and node.name == "_execute_async")
    loop = next(node for node in ast.walk(function) if isinstance(node, ast.While))
    success = [
        node for node in loop.orelse if isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Attribute) and target.attr == "success" for target in node.targets)
    ]
    assert len(success) == 1 and isinstance(success[0].value, ast.Constant)
    assert success[0].value.value is True
    assert any(isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
               and node.func.id == "emit_cached_output" for node in ast.walk(loop))
