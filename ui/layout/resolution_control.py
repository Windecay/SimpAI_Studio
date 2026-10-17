from __future__ import annotations

from dataclasses import dataclass
import html
import json
import re
from typing import Any

import gradio as gr

import modules.flags as flags


@dataclass
class ResolutionControl:
    container: Any
    html: Any
    selection: Any
    random_checkbox: Any | None = None
    use_override_checkbox: Any | None = None
    original_input_checkbox: Any | None = None
    multiplier: Any | None = None
    edit_mode: Any | None = None


def normalize_quantize_step(value: Any, default: int | None = None) -> int:
    fallback = default if default in flags.resolution_quantize_steps else flags.default_resolution_quantize_step
    try:
        step = int(value)
    except Exception:
        return fallback
    return step if step in flags.resolution_quantize_steps else fallback


def normalize_multiplier(value: Any, default: float | None = None) -> float:
    fallback = default if isinstance(default, (int, float)) else flags.default_resolution_multiplier
    try:
        multiplier = float(value)
    except Exception:
        return float(fallback)
    return max(1.0, min(2.0, multiplier))


def normalize_edit_mode(value: Any, default: str | None = None) -> str:
    fallback = default if default in flags.resolution_edit_modes else flags.default_resolution_edit_mode
    mode = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "fit": flags.resolution_edit_mode_proportional,
        "proportion": flags.resolution_edit_mode_proportional,
        "proportional": flags.resolution_edit_mode_proportional,
        "same_ratio": flags.resolution_edit_mode_proportional,
        "crop": flags.resolution_edit_mode_crop,
        "cover": flags.resolution_edit_mode_crop,
        "fill": flags.resolution_edit_mode_scale,
        "scale": flags.resolution_edit_mode_scale,
        "stretch": flags.resolution_edit_mode_scale,
        "pad": flags.resolution_edit_mode_pad,
        "padding": flags.resolution_edit_mode_pad,
        "letterbox": flags.resolution_edit_mode_pad,
        "contain": flags.resolution_edit_mode_pad,
    }
    return aliases.get(mode, fallback)


def parse_resolution_pair(value: Any) -> tuple[int, int] | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    text = text.split(",", 1)[0].strip()
    if "|" in text:
        left, right = text.split("|", 1)
        left = left.strip()
        right = right.strip()
        if left.isdigit() and ":" in right:
            try:
                a, b = right.split(":", 1)
                width = int(left)
                ratio_w = float(a)
                ratio_h = float(b)
                if width > 0 and ratio_w > 0 and ratio_h > 0:
                    return width, int(round(width * ratio_h / ratio_w))
            except Exception:
                pass
    match = re.search(r"(\d+)\D+(\d+)", text.replace("×", "x").replace("*", "x"))
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def format_resolution_value(width: int, height: int, template: str | None = None) -> str:
    value = flags.add_ratio(f"{int(width)}*{int(height)}")
    return f"{value},{template}" if template else value


def render_resolution_control_html(
    *,
    elem_id: str,
    context: str,
    ratios_by_template: dict[str, list[str]] | None = None,
    default_template: str = "SDXL",
    target_selection_id: str = "aspect_ratios_selection",
    target_random_id: str = "random_aspect_ratio_checkbox",
    target_override_id: str = "use_resolution_override_checkbox",
    target_original_input_id: str = "resolution_original_input_checkbox",
    target_width_id: str = "overwrite_width",
    target_height_id: str = "overwrite_height",
    target_multiplier_id: str = "resolution_multiplier",
    target_quantize_id: str = "resolution_quantize_step",
    target_edit_mode_id: str = "resolution_edit_mode",
    scene_selection_id: str = "scene_aspect_ratio",
    source_ids: tuple[str, ...] = (),
    scene_source_ids: tuple[str, ...] = (),
) -> str:
    ratios = ratios_by_template or flags.available_aspect_ratios_list
    payload = {
        "ratios": ratios,
        "defaultTemplate": default_template,
        "quantizeSteps": flags.resolution_quantize_steps,
        "editModes": flags.resolution_edit_modes,
        "sourceIds": list(source_ids),
        "sceneSourceIds": list(scene_source_ids),
    }
    payload_json = json.dumps(payload, ensure_ascii=False)
    step_options = "".join(
        f'<option value="{step}"{" selected" if step == flags.default_resolution_quantize_step else ""}>{step}</option>'
        for step in flags.resolution_quantize_steps
    )
    return f"""
<div id="{html.escape(elem_id)}"
     class="simpai-resolution-control"
     data-context="{html.escape(context)}"
     data-target-selection-id="{html.escape(target_selection_id)}"
     data-target-random-id="{html.escape(target_random_id)}"
     data-target-override-id="{html.escape(target_override_id)}"
     data-target-original-input-id="{html.escape(target_original_input_id)}"
     data-target-width-id="{html.escape(target_width_id)}"
     data-target-height-id="{html.escape(target_height_id)}"
     data-target-multiplier-id="{html.escape(target_multiplier_id)}"
     data-target-quantize-id="{html.escape(target_quantize_id)}"
     data-target-edit-mode-id="{html.escape(target_edit_mode_id)}"
     data-scene-selection-id="{html.escape(scene_selection_id)}">
  <script type="application/json" data-role="resolution-data">{payload_json}</script>
  <div class="resolution-control-grid">
    <label>
      <span>Template</span>
      <select data-role="template-select"></select>
    </label>
    <label>
      <span>Aspect Ratios</span>
      <select data-role="ratio-select"></select>
    </label>
  </div>
  <div class="resolution-control-grid resolution-control-grid-compact">
    <label>
      <span>Width</span>
      <input data-role="winput" title="Width" type="number" min="-1" max="4096" step="1" value="-1" />
    </label>
    <label>
      <span>Height</span>
      <input data-role="hinput" title="Height" type="number" min="-1" max="4096" step="1" value="-1" />
    </label>
    <label>
      <span>Normalize</span>
      <select data-role="qstep" title="Quantize step">{step_options}</select>
    </label>
    <label>
      <span>Scale</span>
      <input data-role="multiplier" title="Resolution Multiply" type="range" min="1" max="2" step="0.1" value="1" />
    </label>
  </div>
  <div class="resolution-control-modes" role="group" aria-label="Image edit fit mode">
    <button type="button" data-role="edit-mode" data-mode="proportional" data-label-en="Keep" data-label-cn="等比" data-title-en="Keep aspect ratio" data-title-cn="保持比例">Keep</button>
    <button type="button" data-role="edit-mode" data-mode="crop" data-label-en="Crop" data-label-cn="裁剪" data-title-en="Crop to target" data-title-cn="裁剪到目标尺寸">Crop</button>
    <button type="button" data-role="edit-mode" data-mode="scale" data-label-en="Scale" data-label-cn="缩放" data-title-en="Scale to target" data-title-cn="缩放到目标尺寸">Scale</button>
    <button type="button" data-role="edit-mode" data-mode="pad" data-label-en="Pad" data-label-cn="填充" data-title-en="Pad outside area" data-title-cn="填充外部区域">Pad</button>
  </div>
  <div class="resolution-control-toolbar resolution-control-options">
    <label class="resolution-control-toggle">
      <input type="checkbox" data-role="random-toggle" />
      <span data-role="localized-label" data-label-en="Random Size" data-label-cn="随机尺寸">Random Size</span>
    </label>
    <label class="resolution-control-toggle">
      <input type="checkbox" data-role="original-input-toggle" />
      <span data-role="localized-label" data-label-en="Original Input" data-label-cn="原图输入">Original Input</span>
    </label>
  </div>
  <div class="resolution-control-ratio-lock">
    <label class="resolution-control-toggle resolution-control-ratio-toggle">
      <input type="checkbox" data-role="ratio-lock-toggle" />
      <span>Ratio Lock</span>
    </label>
    <label>
      <span>Locked Ratio</span>
      <select data-role="ratio-lock-select">
        <option value="current">Current</option>
        <option value="1:1">1:1</option>
        <option value="9:16">9:16</option>
        <option value="3:4">3:4</option>
        <option value="4:3">4:3</option>
        <option value="16:9">16:9</option>
        <option value="custom">Custom</option>
      </select>
    </label>
    <label>
      <span>Custom Ratio</span>
      <span class="resolution-control-ratio-custom" data-role="ratio-lock-custom">
        <input data-role="ratio-lock-custom-w" title="Custom ratio width" type="number" min="1" max="99" step="1" value="1" />
        <span class="resolution-control-ratio-separator">:</span>
        <input data-role="ratio-lock-custom-h" title="Custom ratio height" type="number" min="1" max="99" step="1" value="1" />
      </span>
    </label>
  </div>
  <div class="resolution-control-pad" data-role="pad">
    <canvas data-role="image-preview"></canvas>
    <div class="resolution-control-rect" data-role="rect">
      <span data-role="rect-label">1024×1024</span>
      <span class="resolution-control-handle" data-role="handle"></span>
    </div>
  </div>
  <div class="resolution-control-status" data-role="status"></div>
</div>
"""


def create_main_resolution_control() -> ResolutionControl:
    selection = gr.Textbox(value="", visible="hidden", elem_id="aspect_ratios_selection")
    random_checkbox = gr.Checkbox(label="Random Aspect Ratio", value=False, visible="hidden", elem_id="random_aspect_ratio_checkbox")
    use_override_checkbox = gr.Checkbox(label="Resolution Box", value=False, visible="hidden", elem_id="use_resolution_override_checkbox")
    original_input_checkbox = gr.Checkbox(label="Original Input", value=False, visible="hidden", elem_id="resolution_original_input_checkbox")
    edit_mode = gr.Textbox(value=flags.default_resolution_edit_mode, visible="hidden", elem_id="resolution_edit_mode")
    multiplier = gr.Slider(
        label="Resolution Multiply",
        minimum=1.0,
        maximum=2.0,
        step=0.1,
        value=flags.default_resolution_multiplier,
        visible="hidden",
        elem_id="resolution_multiplier",
    )
    with gr.Accordion(label="Resolution", open=False, elem_id="aspect_ratios_accordion") as container:
        html_component = gr.HTML(
            value=render_resolution_control_html(
                elem_id="resolution_control_widget",
                context="main",
                ratios_by_template={"Scene": flags.scene_aspect_ratios, **flags.available_aspect_ratios_list},
                target_selection_id="aspect_ratios_selection",
                target_random_id="random_aspect_ratio_checkbox",
                target_override_id="use_resolution_override_checkbox",
                target_original_input_id="resolution_original_input_checkbox",
                target_edit_mode_id="resolution_edit_mode",
                scene_source_ids=("scene_canvas", "scene_input_image1", "scene_video", "sam3_input_video"),
            ),
            elem_id="resolution_control_html",
        )
    return ResolutionControl(
        container=container,
        html=html_component,
        selection=selection,
        random_checkbox=random_checkbox,
        use_override_checkbox=use_override_checkbox,
        original_input_checkbox=original_input_checkbox,
        multiplier=multiplier,
        edit_mode=edit_mode,
    )


def create_scene_resolution_control() -> ResolutionControl:
    with gr.Accordion(label="Resolution", visible="hidden", open=False, elem_id="scene_resolution_override_accordion") as container:
        use_override_checkbox = gr.Checkbox(label="Resolution Box", value=False, visible="hidden", elem_id="scene_use_resolution_override_checkbox")
        html_component = gr.HTML(value="", visible="hidden", elem_id="scene_resolution_control_html")
    with gr.Row(elem_id="scene_aspect_ratio_row", visible="hidden"):
        selection = gr.Textbox(
            label="Aspect Ratios",
            value=flags.scene_aspect_ratios[0],
            elem_classes=["scene_aspect_ratio_selections"],
            elem_id="scene_aspect_ratio",
            visible="hidden",
        )
    return ResolutionControl(
        container=container,
        html=html_component,
        selection=selection,
        use_override_checkbox=use_override_checkbox,
    )
