"""MOSS negative-branch skip-layer guidance without global sampler hooks."""

import math


def parse_skip_layers(value, layer_count):
    values = value.replace(",", " ").split() if isinstance(value, str) else list(value)
    layers = []
    for item in values:
        layer = int(item)
        if str(layer) != str(item).strip() or not 0 <= layer < layer_count:
            raise ValueError(f"MOSS SLG layers must be integers from 0 to {layer_count - 1}.")
        if layer not in layers:
            layers.append(layer)
    return tuple(layers)


def guidance_options(predictor, layer_count, *, enabled, layers, start, end):
    if not enabled:
        return {"moss_uncond_skip_layers": ()}, {"Skip Layer Guidance": False}
    start, end = float(start), float(end)
    if not (math.isfinite(start) and math.isfinite(end)):
        raise ValueError("MOSS SLG start and end must be finite numbers.")
    start, end = max(0.0, min(start, 1.0)), max(0.0, min(end, 1.0))
    if start > end:
        raise ValueError("MOSS SLG start must not exceed its end.")
    selected = parse_skip_layers(layers, layer_count)
    return {
        "moss_uncond_skip_layers": selected,
        "moss_slg_sigma_start": float(predictor.percent_to_sigma(start)),
        "moss_slg_sigma_end": float(predictor.percent_to_sigma(end)),
    }, {
        "Skip Layer Guidance": bool(selected),
        "SLG Single Layers": ", ".join(map(str, selected)),
        "SLG Start Percent": start,
        "SLG End Percent": end,
    }
