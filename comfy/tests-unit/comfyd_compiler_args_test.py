import argparse
import ast
from pathlib import Path
import subprocess
import sys

import pytest


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "main_comfyd.py"


@pytest.fixture
def normalize():
    tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
    function = next(node for node in tree.body
                    if isinstance(node, ast.FunctionDef) and node.name == "_comfyd_compiler_args")
    namespace = {"argparse": argparse}
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(SOURCE), "exec"), namespace)
    return namespace["_comfyd_compiler_args"]


@pytest.mark.parametrize("argv,expected", [
    ([], ["--disable-comfy-compiler"]),
    (["--disable-comfy-compiler"], ["--disable-comfy-compiler"]),
    (["--enable-comfy-compiler"], []),
    (["--port", "8187", "--reserve-vram", "1", "--use-sage-attention"],
     ["--port", "8187", "--reserve-vram", "1", "--use-sage-attention", "--disable-comfy-compiler"]),
    (["--enable-comfy-compiler", "--disable-cuda-graphs"], ["--disable-cuda-graphs"]),
])
def test_compiler_args_preserve_explicit_policy(normalize, argv, expected):
    original = argv.copy()
    assert normalize(argv) == expected
    assert argv == original


def test_conflicting_compiler_args_are_rejected(normalize):
    with pytest.raises(SystemExit):
        normalize(["--enable-comfy-compiler", "--disable-comfy-compiler"])


def test_compiler_args_are_normalized_before_comfy_parses():
    source = SOURCE.read_text(encoding="utf-8")
    assert source.index("sys.argv[1:] = _comfyd_compiler_args(sys.argv[1:])") < source.index("import comfy.options")


@pytest.mark.parametrize("argv,disabled", [([], True), (["--enable-comfy-compiler"], False)])
def test_core_parser_preserves_dynamic_vram(normalize, argv, disabled):
    code = """
import sys
sys.path.insert(0, sys.argv[1])
del sys.argv[1]
import comfy.options
comfy.options.enable_args_parsing()
from comfy.cli_args import args
assert args.disable_comfy_compiler == DISABLED
assert args.disable_cuda_graphs == DISABLED
assert not args.disable_dynamic_vram
"""
    subprocess.run(
        [sys.executable, "-c", code.replace("DISABLED", repr(disabled)), str(ROOT), *normalize(argv)],
        check=True, timeout=30,
    )
