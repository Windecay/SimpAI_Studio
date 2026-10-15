import argparse
import ast
import logging
import sqlite3
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.assets.event_log import error_kind


@pytest.fixture
def entrypoint():
    source = Path(__file__).resolve().parents[1] / "main_comfyd.py"
    module = ast.parse(source.read_text(encoding="utf-8"))
    names = {"_comfyd_compiler_args", "setup_database", "database_failure_message", "stop_startup", "start_comfyui"}
    body = [node for node in module.body if isinstance(node, ast.FunctionDef) and node.name in names]
    disabled_message = next(node.value.value for node in module.body
                            if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name)
                            and target.id == "WITHOUT_ASSETS" for target in node.targets))
    namespace = {
        "argparse": argparse, "logging": logging, "sys": sys,
        "args": SimpleNamespace(database_url=None, temp_directory=None, disable_assets=False),
        "error_kind": error_kind, "get_db_path": lambda: "private.db",
        "get_database_url": lambda: "sqlite:///private.db", "WITHOUT_ASSETS": disabled_message,
    }
    exec(compile(ast.Module(body=body, type_ignores=[]), str(source), "exec"), namespace)
    return namespace


@pytest.mark.parametrize("options,expected", [
    ([], ["--disable-comfy-compiler"]),
    (["--cpu"], ["--cpu", "--disable-comfy-compiler"]),
    (["--enable-comfy-compiler", "--cpu"], ["--cpu"]),
    (["--disable-comfy-compiler", "--cpu"], ["--cpu", "--disable-comfy-compiler"]),
])
def test_private_compiler_default_and_passthrough(entrypoint, options, expected):
    assert entrypoint["_comfyd_compiler_args"](options) == expected


def test_private_compiler_rejects_conflicting_flags(entrypoint):
    with pytest.raises(SystemExit):
        entrypoint["_comfyd_compiler_args"](["--enable-comfy-compiler", "--disable-comfy-compiler"])


@pytest.mark.parametrize("error,expected", [
    (RuntimeError("Could not acquire lock on database"), "in_use"),
    (sqlite3.OperationalError("database is locked"), "locked"),
    (RuntimeError("Can't locate revision 0099"), "newer_revision"),
    (FileExistsError("folder is a file"), "path_blocked"),
    (PermissionError("not writable"), "not_writable"),
    (sqlite3.DatabaseError("file is not a database"), "corrupt"),
    (RuntimeError("migration failed"), "other"),
])
def test_private_database_error_classification(entrypoint, error, expected):
    kind, message = entrypoint["database_failure_message"](error, "sqlite:///private.db")
    assert kind == expected
    assert "private.db" in message
    assert "--disable-assets" in message
    assert any(ord(character) > 127 for character in message)


def test_private_database_rejects_url_without_exposing_credentials(entrypoint, caplog):
    entrypoint.update(dependencies_available=lambda: True,
                      init_db=Mock(side_effect=RuntimeError("postgresql://user:secret@host/db")),
                      get_database_url=lambda: "postgresql://user:secret@host/db")
    with caplog.at_level(logging.DEBUG), pytest.raises(SystemExit):
        entrypoint["setup_database"](SimpleNamespace(enabled=True))
    assert "ASSETS_STARTUP_FAILED: unsupported_url" in caplog.text
    assert "secret" not in caplog.text


def test_private_assets_missing_dependencies_stop_before_manager_creation(entrypoint, caplog):
    create = Mock()
    entrypoint.update(dependencies_available=lambda: False,
                      missing_dependencies=lambda: ["sqlalchemy"],
                      get_missing_requirements_message=lambda: "pip install -r requirements.txt",
                      default_asset_manager=create)
    with pytest.raises(SystemExit):
        entrypoint["start_comfyui"]()
    create.assert_not_called()
    assert "ASSETS_STARTUP_FAILED: missing_packages" in caplog.text


def test_private_assets_off_does_not_initialize_database(entrypoint):
    startup = Mock()
    init_db = Mock()
    entrypoint.update(dependencies_available=lambda: True, init_db=init_db, warn_if_database_in_use=Mock())
    entrypoint["setup_database"](SimpleNamespace(enabled=False, startup=startup))
    init_db.assert_not_called()
    startup.assert_called_once()
