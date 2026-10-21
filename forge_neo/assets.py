from __future__ import annotations

from pathlib import Path

from gradio.route_utils import API_PREFIX

from ui.assets import reload_template_assets


ROOT = Path(__file__).resolve().parents[1]


def _asset_url(relative_path: str) -> str:
    path = ROOT / relative_path
    rel = relative_path.replace("\\", "/")
    try:
        mtime = path.stat().st_mtime
    except OSError:
        mtime = 0
    return f"{API_PREFIX}/file={rel}?{mtime}&v=forge_neo"


def _asset_tag(kind: str, relative_path: str) -> str:
    web_path = _asset_url(relative_path)
    if kind == "js":
        return f'<script defer src="{web_path}"></script>'
    return f'<link rel="stylesheet" href="{web_path}">'


def _layout_icon_font_html() -> str:
    # Font Awesome's relative ../webfonts URLs do not retain Gradio's file= prefix.
    source = _asset_url("webfonts/fa-solid-900.woff2")
    return ('<style>@font-face{font-family:"Font Awesome 6 Free";font-style:normal;'
            f'font-weight:900;font-display:block;src:url("{source}") format("woff2")' + '}</style>')


def javascript_html() -> str:
    from forge_neo.extension_adapter import extension_javascript_paths

    return "\n".join(
        [
            _asset_tag("js", "javascript/forge_canvas.js"),
            _asset_tag("js", "forge_neo/webui/javascript/inputAccordion.js"),
            _asset_tag("js", "javascript/forge_neo.js"),
            _asset_tag("js", "javascript/regional_json_prompt.js"),
            _asset_tag("js", "javascript/forge_neo_layout.js"),
            *[_asset_tag("js", path) for path in extension_javascript_paths()],
        ]
    )


def css_html() -> str:
    from forge_neo.extension_adapter import extension_css_paths

    return "\n".join(
        [
            _asset_tag("css", "css/forge_canvas.css"),
            _asset_tag("css", "css/forge_neo.css"),
            _asset_tag("css", "css/fa_all.min_6.5.2.css"),
            _layout_icon_font_html(),
            _asset_tag("css", "css/regional_json_prompt.css"),
            *[_asset_tag("css", path) for path in extension_css_paths()],
        ]
    )


def apply_assets() -> None:
    from forge_neo.extension_adapter import prepare_extension_runtime_files

    prepare_extension_runtime_files()
    reload_template_assets(javascript_html=javascript_html, css_html=css_html)
