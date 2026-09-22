import ast
import math
from pathlib import Path
from types import SimpleNamespace

import pytest
import torch


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "comfy/ldm/minimax/vae.py"


@pytest.fixture
def tiler():
    # Execute the production tiling methods without importing GPU/model initialization.
    tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
    model = next(node for node in tree.body
                 if isinstance(node, ast.ClassDef) and node.name == "MiniMaxH3VideoVAE")
    methods = [node for node in model.body if isinstance(node, ast.FunctionDef)
               and node.name in {"split_tiles", "blend", "_decode_tile_row", "tiled_decode"}]
    namespace = {
        "math": math,
        "torch": torch,
        "comfy": SimpleNamespace(
            model_management=SimpleNamespace(get_free_memory=lambda device: 8 * 1024 ** 3),
        ),
    }
    for method in methods:
        exec(compile(ast.Module(body=[method], type_ignores=[]), str(SOURCE), "exec"), namespace)
    cls = type("SpatialTiler", (), {method.name: namespace[method.name] for method in methods})
    instance = cls()
    instance.tile_size = 256
    instance.tile_overlap_min = 64
    instance.vae_ratio = 16
    return instance


def coordinates(height, width, dtype=torch.float32):
    rows = torch.arange(height // 16).view(1, 1, 1, -1, 1)
    columns = torch.arange(width // 16).view(1, 1, 1, 1, -1)
    return (rows * 1000 + columns).to(dtype=dtype)


@pytest.mark.parametrize("height,width", [(864, 480), (480, 864), (640, 640), (288, 288)])
@pytest.mark.parametrize("axis", ["row", "column"])
def test_tile_bias_does_not_create_fixed_position_jumps(tiler, height, width, axis):
    latent = coordinates(height, width)

    def decode(tile):
        origin = float(tile[0, 0, 0, 0, 0])
        bias = (origin // 1000) / (height // 16) if axis == "row" else (origin % 1000) / (width // 16)
        return tile.new_full((tile.shape[0], 1, 1, tile.shape[-2] * 16, tile.shape[-1] * 16), bias)

    tiler._decode_pixels = decode
    image = tiler.tiled_decode(latent)[0, 0, 0]
    difference = torch.diff(image, dim=0 if axis == "row" else 1)
    assert float(difference.abs().max()) < 0.01
    if (height, width, axis) == (864, 480, "row"):
        assert float((image[288, 240] - image[287, 240]).abs()) < 1e-6


def dense_composited_reference(tiler, latent):
    height, width = latent.shape[-2] * 16, latent.shape[-1] * 16
    ys, heights, y_overlaps = tiler.split_tiles(height)
    xs, widths, x_overlaps = tiler.split_tiles(width)
    tiles = [[tiler._decode_pixels(latent[..., y // 16:(y + h) // 16, x // 16:(x + w) // 16])
              for x, w in zip(xs, widths)] for y, h in zip(ys, heights)]
    canvas = None
    strip = None
    out_y = 0
    for i, row in enumerate(tiles):
        new_strip = None
        left_tail = None
        out_x = 0
        for j, tile in enumerate(row):
            if i > 0:
                tile = tiler.blend(strip[..., :, xs[j]:xs[j] + widths[j]], tile, y_overlaps[i - 1], dim=-2)
            if j > 0:
                tile = tiler.blend(left_tail, tile, x_overlaps[j - 1], dim=-1)
            left_tail = tile[..., :, -x_overlaps[j]:].clone() if j < len(xs) - 1 else None
            if j < len(xs) - 1:
                tile = tile[..., :, :-x_overlaps[j]]
            if canvas is None:
                canvas = torch.empty(*tile.shape[:-2], height, width, dtype=tile.dtype, device=tile.device)
            if i < len(ys) - 1:
                if new_strip is None:
                    new_strip = torch.empty(*tile.shape[:-2], y_overlaps[i], width, dtype=tile.dtype, device=tile.device)
                new_strip[..., :, out_x:out_x + tile.shape[-1]] = tile[..., -y_overlaps[i]:, :]
                tile = tile[..., :-y_overlaps[i], :]
            canvas[..., out_y:out_y + tile.shape[-2], out_x:out_x + tile.shape[-1]].copy_(tile)
            tile_height = tile.shape[-2]
            out_x += tile.shape[-1]
        strip = new_strip
        out_y += tile_height
    return canvas


@pytest.mark.parametrize("height,width", [(864, 480), (480, 864), (640, 640), (288, 288), (128, 256)])
@pytest.mark.parametrize("dtype", [torch.float32, torch.float16, torch.bfloat16])
def test_streaming_matches_separable_fusion_and_preserves_layout(tiler, height, width, dtype):
    latent = coordinates(height, width).expand(2, 3, 2, -1, -1).to(dtype).clone()
    original = latent.clone()
    calls = []

    def decode(tile):
        calls.append(tuple(tile.shape))
        rows = torch.linspace(0, 1, tile.shape[-2] * 16, dtype=dtype).view(1, 1, 1, -1, 1)
        columns = torch.linspace(0, 1, tile.shape[-1] * 16, dtype=dtype).view(1, 1, 1, 1, -1)
        bias = tile[..., :1, :1].float().div(100000).to(dtype)
        return rows * 0.2 + columns * 0.3 + bias

    tiler._decode_pixels = decode
    output = tiler.tiled_decode(latent)
    count = len(tiler.split_tiles(height)[0]) * len(tiler.split_tiles(width)[0])
    assert sum(shape[0] for shape in calls) == count * latent.shape[0]
    assert all(shape[-2] <= 16 and shape[-1] <= 16 for shape in calls)
    assert output.shape == (2, 3, 2, height, width)
    assert output.dtype == dtype
    assert output.device == latent.device
    torch.testing.assert_close(output, dense_composited_reference(tiler, latent), rtol=0, atol=0)
    torch.testing.assert_close(latent, original, rtol=0, atol=0)


@pytest.mark.parametrize("height,width", [(864, 480), (480, 864), (640, 640), (288, 288), (128, 256)])
def test_matching_tiles_keep_pixel_coordinates(tiler, height, width):
    latent = coordinates(height, width).div(100000)
    tiler._decode_pixels = lambda tile: tile.repeat_interleave(16, -2).repeat_interleave(16, -1)
    output = tiler.tiled_decode(latent)
    expected = tiler._decode_pixels(latent)
    torch.testing.assert_close(output, expected, rtol=1e-6, atol=1e-7)
