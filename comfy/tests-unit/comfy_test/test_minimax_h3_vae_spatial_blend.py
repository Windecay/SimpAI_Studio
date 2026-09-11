import ast
import math
from pathlib import Path

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
               and node.name in {"split_tiles", "blend", "tiled_decode"}]
    namespace = {"math": math, "torch": torch}
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
        return tile.new_full((1, 1, 1, tile.shape[-2] * 16, tile.shape[-1] * 16), bias)

    tiler._decode_pixels = decode
    image = tiler.tiled_decode(latent)[0, 0, 0]
    difference = torch.diff(image, dim=0 if axis == "row" else 1)
    assert float(difference.abs().max()) < 0.01
    if (height, width, axis) == (864, 480, "row"):
        assert float((image[288, 240] - image[287, 240]).abs()) < 1e-6


def dense_separable_reference(tiler, latent):
    height, width = latent.shape[-2] * 16, latent.shape[-1] * 16
    ys, heights, y_overlaps = tiler.split_tiles(height)
    xs, widths, x_overlaps = tiler.split_tiles(width)
    tiles = [[tiler._decode_pixels(latent[..., y // 16:(y + h) // 16, x // 16:(x + w) // 16])
              for x, w in zip(xs, widths)] for y, h in zip(ys, heights)]
    # Complete vertical fusion first, then horizontal fusion over those results.
    for i in range(1, len(ys)):
        for j in range(len(xs)):
            tiles[i][j] = tiler.blend(tiles[i - 1][j], tiles[i][j], y_overlaps[i - 1], dim=-2)
    for row in tiles:
        for j in range(1, len(xs)):
            row[j] = tiler.blend(row[j - 1], row[j], x_overlaps[j - 1], dim=-1)
    rows = []
    for i, row in enumerate(tiles):
        retained = []
        for j, tile in enumerate(row):
            if i < len(y_overlaps):
                tile = tile[..., :-y_overlaps[i], :]
            if j < len(x_overlaps):
                tile = tile[..., :, :-x_overlaps[j]]
            retained.append(tile)
        rows.append(torch.cat(retained, dim=-1))
    return torch.cat(rows, dim=-2)


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
    assert len(calls) == count
    assert all(shape[-2] <= 16 and shape[-1] <= 16 for shape in calls)
    assert output.shape == (2, 3, 2, height, width)
    assert output.dtype == dtype
    assert output.device == latent.device
    torch.testing.assert_close(output, dense_separable_reference(tiler, latent), rtol=0, atol=0)
    torch.testing.assert_close(latent, original, rtol=0, atol=0)


@pytest.mark.parametrize("height,width", [(864, 480), (480, 864), (640, 640), (288, 288), (128, 256)])
def test_matching_tiles_keep_pixel_coordinates(tiler, height, width):
    latent = coordinates(height, width).div(100000)
    tiler._decode_pixels = lambda tile: tile.repeat_interleave(16, -2).repeat_interleave(16, -1)
    output = tiler.tiled_decode(latent)
    expected = tiler._decode_pixels(latent)
    torch.testing.assert_close(output, expected, rtol=1e-6, atol=1e-7)
