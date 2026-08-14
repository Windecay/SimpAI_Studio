from __future__ import annotations

import time

import gradio as gr
from starlette.middleware import Middleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from ui.runtime_patches import apply_gradio6_runtime_patches


def _reload_javascript() -> None:
    from modules.ui_gradio_extensions import reload_javascript

    reload_javascript()


def apply_webui_assets() -> None:
    """Inject the WebUI JS/CSS bundle."""
    _reload_javascript()


def queue_blocks(blocks: gr.Blocks, concurrency_count: int = 5) -> gr.Blocks:
    """Queue a Blocks app through the Gradio 6 API."""
    return blocks.queue(default_concurrency_limit=concurrency_count)


def _create_default_theme():
    return gr.themes.Default(
        font=("ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"),
        font_mono=("ui-monospace", "Consolas", "Liberation Mono", "monospace"),
    )


def create_root_blocks(*, title: str, concurrency_count: int = 5) -> gr.Blocks:
    """Create the root Blocks instance for SimpAI WebUI."""
    apply_gradio6_runtime_patches()
    blocks = gr.Blocks(title=title)
    setattr(blocks, "_simpai_launch_theme", _create_default_theme())
    return queue_blocks(blocks, concurrency_count=concurrency_count)


def wait_for_frontend_port_release(
    is_port_available,
    *,
    port: int,
    host: str,
    timeout: float = 8.0,
    poll_interval: float = 0.25,
) -> bool:
    """Wait briefly for a previous frontend listener to release its port."""
    timeout = max(0.0, float(timeout))
    poll_interval = max(0.01, float(poll_interval))
    deadline = time.monotonic() + timeout
    while True:
        if is_port_available(port, host):
            return True
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return False
        time.sleep(min(poll_interval, remaining))


def _hide_gradio_event_docs(blocks: gr.Blocks) -> None:
    """Keep UI events callable without embedding their schemas in the landing page."""
    for block_fn in blocks.fns.values():
        if block_fn.api_visibility == "public":
            block_fn.api_visibility = "undocumented"


class LandingPageGZipMiddleware:
    """Apply gzip to the root HTML without recompressing generated media."""

    def __init__(self, app: ASGIApp, minimum_size: int = 1024, compresslevel: int = 5) -> None:
        self.app = app
        self.gzip_app = GZipMiddleware(app, minimum_size=minimum_size, compresslevel=compresslevel)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = (scope.get("path") or "/").rstrip("/")
        root_path = (scope.get("root_path") or "").rstrip("/")
        is_landing_page = path in ("", root_path)
        if scope["type"] == "http" and scope.get("method") in ("GET", "HEAD") and is_landing_page:
            await self.gzip_app(scope, receive, send)
            return
        await self.app(scope, receive, send)


def _enable_landing_page_compression(kwargs: dict) -> None:
    """Compress extensionless HTML routes such as Gradio's landing page."""
    app_kwargs = dict(kwargs.get("app_kwargs") or {})
    middleware = list(app_kwargs.get("middleware") or ())
    gzip_middleware = (LandingPageGZipMiddleware, GZipMiddleware)
    if not any(getattr(item, "cls", None) in gzip_middleware for item in middleware):
        middleware.insert(0, Middleware(LandingPageGZipMiddleware, minimum_size=1024, compresslevel=5))
    app_kwargs["middleware"] = middleware
    kwargs["app_kwargs"] = app_kwargs


def launch_root_app(blocks: gr.Blocks, **kwargs):
    """Single entry point for launching the root app."""
    _hide_gradio_event_docs(blocks)
    _enable_landing_page_compression(kwargs)
    launch_theme = getattr(blocks, "__dict__", {}).get("_simpai_launch_theme")
    if launch_theme is not None and "theme" not in kwargs:
        kwargs["theme"] = launch_theme
    return blocks.launch(**kwargs)
