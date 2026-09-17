from __future__ import annotations

from typing import Callable

import gradio as gr


def install_template_response_hook(*, js: str, css: str) -> None:
    """Inject WebUI assets through a single TemplateResponse hook."""
    templates = gr.routes.templates
    original = getattr(templates, "_simpleai_original_template_response", None)
    if original is None:
        original = templates.TemplateResponse
        templates._simpleai_original_template_response = original

    def template_response(*args, **kwargs):
        res = original(*args, **kwargs)
        res.body = res.body.replace(b"</head>", f"{js}</head>".encode("utf8"))
        res.body = res.body.replace(b"</body>", f"{css}</body>".encode("utf8"))
        res.init_headers()
        try:
            res.headers["Cache-Control"] = "no-store"
        except (AttributeError, TypeError):
            pass
        return res

    templates.TemplateResponse = template_response


def reload_template_assets(
    *,
    javascript_html: Callable[[], str],
    css_html: Callable[[], str],
) -> None:
    install_template_response_hook(js=javascript_html(), css=css_html())
