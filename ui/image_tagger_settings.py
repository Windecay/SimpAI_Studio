"""Image tagger controls in the current user's Application settings."""

import html

import gradio as gr

from modules import image_tagger_settings as settings
from modules.localization import localized_text
from modules.wd14_models import DEFAULT_MODEL_ID, MODEL_LABELS, DEFAULT_TAG_CATEGORIES, TAG_CATEGORY_LABELS


class ImageTaggerSignInRequired(gr.Error):
    """An expected authentication failure, distinct from model/status failures."""

    def __init__(self, state):
        self.language = state.get("__lang") if isinstance(state, dict) else None
        super().__init__("请登录后修改标签模型设置。" if self.language == "cn"
                         else "Sign in to change image tagger settings.")


def create_image_tagger_settings(state_component, resolve_state, refresh_events=(), tooltip_component=None):
    category_info = ("Saved for your account. Character tags use the character threshold; other categories use the general threshold. "
                     "Only categories provided by the selected model can appear.")
    with gr.Group():
        model = gr.Dropdown(
            label="Image tagger model", choices=[(label, key) for key, label in MODEL_LABELS.items()],
            value=DEFAULT_MODEL_ID, elem_id="image_tagger_model",
            info="Saved for your account. Used by image tag description, Infinite Canvas and Agent API.",
        )
        categories = gr.CheckboxGroup(
            label="Output tag categories", choices=[(label, key) for key, label in TAG_CATEGORY_LABELS.items()],
            value=list(DEFAULT_TAG_CATEGORIES), elem_id="image_tagger_categories", info=category_info,
        )
        status = gr.HTML(value="", elem_id="image_tagger_model_status")
        with gr.Row():
            download = gr.Button("Download missing tagger files", visible=False, elem_id="image_tagger_download")
            refresh_button = gr.Button("Refresh tagger status", elem_id="image_tagger_refresh")
        timer = gr.Timer(value=2, active=False)

    def updates(snapshot, state):
        result = (
            gr.update(value="<p>" + html.escape(settings.status_text(snapshot, state)) + "</p>"),
            gr.update(visible=not snapshot["ready"], interactive=snapshot["can_download"] and not snapshot["downloading"]),
            gr.update(active=snapshot["downloading"]),
        )
        if tooltip_component is not None:
            tooltip = localized_text(state, "Current image tagger: {model}").format(model=snapshot["label"])
            result += (gr.update(value=tooltip),)
        result += (gr.update(value=snapshot["categories"], label=localized_text(state, "Output tag categories"),
                            choices=[(localized_text(state, label), key) for key, label in TAG_CATEGORY_LABELS.items()],
                            info=localized_text(state, category_info), interactive=True),)
        return result

    def signed_out_updates(error):
        message = ("登录后可查看和修改标签模型设置。" if error.language == "cn"
                   else "Sign in to view and change image tagger settings.")
        result = (gr.update(value="<p>" + html.escape(message) + "</p>"),
                  gr.update(visible=False, interactive=False), gr.update(active=False))
        if tooltip_component is not None:
            result += (gr.update(value=message),)
        return (*result, gr.update(value=[], interactive=False))

    def refresh(state, request: gr.Request):
        try:
            state = resolve_state(state, request)
        except ImageTaggerSignInRequired as error:
            return signed_out_updates(error)
        return updates(settings.model_status(state), state)

    def load(state, request: gr.Request):
        try:
            state = resolve_state(state, request)
        except ImageTaggerSignInRequired as error:
            return (gr.update(value=None, interactive=False), *signed_out_updates(error))
        selected = settings.selected_model(state)
        return (gr.update(value=selected, interactive=True), *updates(settings.model_status(state, selected), state))

    def save(model_id, state, request: gr.Request):
        state = resolve_state(state, request)
        settings.save_model(model_id, state)
        return updates(settings.model_status(state, model_id), state)

    def save_category_selection(values, state, request: gr.Request):
        state = resolve_state(state, request)
        settings.save_categories(values, state)
        # Do not overwrite newer clicks while a previous save is returning.
        return updates(settings.model_status(state), state)[:-1]

    def start_download(model_id, state, request: gr.Request):
        state = resolve_state(state, request)
        if not settings.model_status(state, model_id)["can_download"]:
            raise gr.Error("当前身份没有模型下载权限。" if state.get("__lang") == "cn"
                           else "This identity cannot download models.")
        if settings.selected_model(state) != model_id:
            raise gr.Error("模型选择已变化，请刷新设置后下载。" if state.get("__lang") == "cn"
                           else "The model selection changed. Refresh the settings before downloading.")
        return updates(settings.download_selected(model_id, state), state)

    status_outputs = [status, download, timer]
    if tooltip_component is not None:
        status_outputs.append(tooltip_component)
    status_outputs.append(categories)
    model.input(save, inputs=[model, state_component], outputs=status_outputs, queue=False, show_progress=False)
    categories.input(save_category_selection, inputs=[categories, state_component], outputs=status_outputs[:-1],
                     queue=False, show_progress=False, trigger_mode="always_last")
    model.change(refresh, inputs=[state_component], outputs=status_outputs, queue=False, show_progress=False)
    refresh_button.click(load, inputs=[state_component], outputs=[model, *status_outputs], queue=False, show_progress=False)
    download.click(start_download, inputs=[model, state_component], outputs=status_outputs, queue=False, show_progress=False)
    timer.tick(refresh, inputs=[state_component], outputs=status_outputs, queue=False, show_progress=False)
    state_component.change(load, inputs=[state_component], outputs=[model, *status_outputs], queue=False, show_progress=False)
    for event in refresh_events:
        event(load, inputs=[state_component], outputs=[model, *status_outputs], queue=False, show_progress=False)
    return model, categories
