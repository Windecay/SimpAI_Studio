from __future__ import annotations

from dataclasses import dataclass

import gradio as gr


@dataclass
class TopbarLayoutRefs:
    start_timestamp: gr.Textbox
    bar_store_button: gr.Button
    bar_buttons: list[gr.Button]
    preset_store: gr.Row
    preset_store_list: object
    preset_store_apply_payload: gr.Textbox
    preset_store_apply_button: gr.Button
    preset_store_delete_payload: gr.Textbox
    preset_store_delete_button: gr.Button

    @property
    def nav_bars(self) -> list:
        return [self.bar_store_button] + self.bar_buttons


def create_topbar_layout(
    *,
    root_blocks,
    button_num: int,
    gallery_index_stat,
    get_start_timestamp,
    get_wildcards_list,
    preset_samples,
) -> TopbarLayoutRefs:
    with gr.Column(elem_id="topbar_nav", min_width=0):
        with gr.Row(elem_id="topbar_row"):
            start_timestamp = gr.Textbox(visible=False)
            bar_store_button = gr.Button(
                value="PresetStore",
                size="sm",
                min_width=50,
                elem_id="bar_store",
                elem_classes="bar_store",
            )
            bar_buttons = []
            for i in range(button_num):
                bar_buttons.append(
                    gr.Button(
                        value="default" if i == 0 else "",
                        size="sm",
                        visible=True if i == 0 else "hidden",
                        min_width=40,
                        elem_id=f"bar{i}",
                        elem_classes="bar_button",
                    )
                )
            root_blocks.load(get_start_timestamp, outputs=start_timestamp, queue=False, api_name="get_start_timestamp")
            root_blocks.load(get_wildcards_list, outputs=start_timestamp, queue=False)
        gr.HTML(
            value="""<div id="topbar_drawer_handle" role="separator" tabindex="0" hidden
  aria-label="Resize preset drawer" aria-controls="topbar_row" aria-orientation="horizontal"
  aria-valuemin="1" aria-valuemax="60" aria-valuenow="2">
  <span class="topbar-drawer-grip" aria-hidden="true"></span>
  <span class="topbar-drawer-count" aria-hidden="true"></span>
</div>""",
            elem_id="topbar_drawer_control",
            padding=False,
        )

    with gr.Row(visible=False, elem_classes="preset_store") as preset_store:
        gr.HTML(
            value="""
<div id="preset_store_tools" class="preset-store-tools">
  <div class="preset-store-titlebar">
    <div>
      <div id="preset_store_title" class="preset-store-title">PresetStore</div>
      <div id="preset_store_subtitle" class="preset-store-subtitle">Drag presets into the draft, reorder them, then apply to the navbar.</div>
    </div>
    <button id="preset_store_close" class="preset-store-close" type="button" aria-label="Close">x</button>
  </div>
  <div class="preset-store-controls">
    <input id="preset_store_search" class="preset-store-search" type="search" placeholder="Search presets" autocomplete="off" />
    <div id="preset_store_engine_filters" class="preset-store-filter-row" aria-label="Engine filters"></div>
    <div id="preset_store_scene_filters" class="preset-store-filter-row" aria-label="Scene filters">
      <button type="button" class="preset-store-filter is-active" data-sai-scene-filter="all">All</button>
      <button type="button" class="preset-store-filter" data-sai-scene-filter="scene">Scene</button>
      <button type="button" class="preset-store-filter" data-sai-scene-filter="classic">Classic</button>
      <button type="button" class="preset-store-filter" data-sai-scene-filter="image">Image</button>
      <button type="button" class="preset-store-filter" data-sai-scene-filter="video">Video</button>
    </div>
  </div>
  <div class="preset-store-editor">
    <div class="preset-store-editor-head">
      <span id="preset_store_draft_label">Navbar draft</span>
      <span id="preset_store_draft_count" class="preset-store-draft-count">0</span>
    </div>
    <div id="preset_store_nav_draft" class="preset-store-nav-draft" aria-label="Navbar draft"></div>
    <div id="preset_store_status" class="preset-store-status" hidden></div>
  </div>
  <div id="preset_store_user_pool_head" class="preset-store-pool-head preset-store-user-pool-head" hidden>
    <span id="preset_store_user_pool_label">User presets</span>
    <span id="preset_store_user_pool_count" class="preset-store-draft-count">0</span>
  </div>
  <div id="preset_store_user_candidate_pool" class="preset-store-candidate-pool preset-store-user-candidate-pool" aria-label="User presets" hidden></div>
  <div class="preset-store-pool-head">
    <span id="preset_store_pool_label">Preset pool</span>
    <span id="preset_store_pool_count" class="preset-store-draft-count">0</span>
  </div>
  <div id="preset_store_candidate_pool" class="preset-store-candidate-pool" aria-label="Preset pool"></div>
  <div class="preset-store-editor-actions">
    <button id="preset_store_reset_draft" class="preset-store-filter" type="button">Reset</button>
    <button id="preset_store_apply_draft" class="preset-store-filter is-active" type="button">Apply to Navbar</button>
    <button id="preset_store_apply_draft_close" class="preset-store-filter is-active" type="button">Apply to Navbar and Close</button>
  </div>
</div>
""",
            elem_id="preset_store_tools_html",
        )
        preset_store_list = gr.Dataset(
            label="Legacy preset source",
            components=[gallery_index_stat],
            samples=preset_samples,
            visible=True,
            samples_per_page=10000,
            type="index",
            elem_id="preset_store_source_bridge",
            elem_classes=["preset-store-source-bridge"],
        )
    preset_store_apply_payload = gr.Textbox(
        value="",
        visible="hidden",
        elem_id="preset_store_apply_payload",
        elem_classes=["sai-gradio-hidden-bridge"],
    )
    preset_store_apply_button = gr.Button(
        "Apply preset store draft",
        visible="hidden",
        elem_id="preset_store_apply_button",
        elem_classes=["sai-gradio-hidden-bridge"],
    )
    preset_store_delete_payload = gr.Textbox(
        value="",
        visible="hidden",
        elem_id="preset_store_delete_payload",
        elem_classes=["sai-gradio-hidden-bridge"],
    )
    preset_store_delete_button = gr.Button(
        "Delete user preset",
        visible="hidden",
        elem_id="preset_store_delete_button",
        elem_classes=["sai-gradio-hidden-bridge"],
    )

    return TopbarLayoutRefs(
        start_timestamp=start_timestamp,
        bar_store_button=bar_store_button,
        bar_buttons=bar_buttons,
        preset_store=preset_store,
        preset_store_list=preset_store_list,
        preset_store_apply_payload=preset_store_apply_payload,
        preset_store_apply_button=preset_store_apply_button,
        preset_store_delete_payload=preset_store_delete_payload,
        preset_store_delete_button=preset_store_delete_button,
    )
