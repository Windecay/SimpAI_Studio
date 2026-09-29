"""HTML shell for the standalone media library page."""

from __future__ import annotations

import json
import os
from pathlib import Path


def _join_url(root_path: str, path: str) -> str:
    root = str(root_path or "").rstrip("/")
    return f"{root}/{str(path).lstrip('/')}"


def _gradio_asset_url(root_path: str, relative_path: str) -> str:
    root = Path(__file__).resolve().parents[1]
    asset_path = root / relative_path.replace("/", os.sep)
    try:
        version = asset_path.stat().st_mtime_ns
    except OSError:
        version = 0
    return f"{_join_url(root_path, 'gradio_api/file=' + relative_path)}?{version}&v=media_library"


def _icon_font_css(font_url: str) -> str:
    """Keep the standalone page independent from Font Awesome's relative asset paths."""
    icons = {
        "calendar-days": "\\f073",
        "images": "\\f302",
        "search": "\\f002",
        "star": "\\f005",
        "rotate": "\\f2f1",
        "layer-group": "\\f5fd",
        "arrows-rotate": "\\f021",
        "check": "\\f00c",
        "square-check": "\\f14a",
        "spinner": "\\f110",
        "download": "\\f019",
        "copy": "\\f0c5",
        "trash": "\\f2ed",
        "floppy-disk": "\\f0c7",
        "xmark": "\\f00d",
        "expand": "\\f065",
        "compress": "\\f066",
        "chevron-left": "\\f053",
        "chevron-right": "\\f054",
        "minus": "\\f068",
        "plus": "\\f067",
        "rotate-left": "\\f2ea",
        "film": "\\f008",
        "music": "\\f001",
        "image": "\\f03e",
        "filter": "\\f0b0",
        "folder": "\\f07b",
        "folder-open": "\\f07c",
        "folder-plus": "\\f65e",
        "arrows-left-right": "\\f07e",
        "link": "\\f0c1",
        "plus": "\\f067",
        "clone": "\\f24d",
        "play": "\\f04b",
        "pause": "\\f04c",
        "volume-high": "\\f028",
        "volume-xmark": "\\f6a9",
        "sliders": "\\f1de",
    }
    mapping = "\n".join(
        f'.fa-{name}::before {{ content: "{code}"; }}' for name, code in icons.items()
    )
    return f'''<style id="media-library-icon-font">
@font-face {{
  font-family: "Media Library Icons";
  font-style: normal;
  font-weight: 900;
  font-display: block;
  src: url("{font_url}") format("woff2");
}}
.fa {{
  display: inline-block;
  font-family: "Media Library Icons";
  font-style: normal;
  font-weight: 900;
  line-height: 1;
  text-rendering: auto;
}}
{mapping}
.fa-spin {{ animation: media-library-icon-spin 1s linear infinite; }}
@keyframes media-library-icon-spin {{ to {{ transform: rotate(360deg); }} }}
</style>'''


def render_media_library_html(*, root_path: str = "", theme: str = "light", lang: str = "en") -> str:
    normalized_theme = "dark" if str(theme or "").lower().startswith("dark") else "light"
    normalized_lang = "cn" if str(lang or "").lower().startswith(("cn", "zh")) else "en"
    api_base = _join_url(root_path, "simpleai/gallery")
    css_url = _gradio_asset_url(root_path, "css/media_library.css")
    i18n_url = _gradio_asset_url(root_path, "javascript/simpleai_i18n.js")
    script_url = _gradio_asset_url(root_path, "javascript/media_library.js")
    icon_font_url = _gradio_asset_url(root_path, "webfonts/fa-solid-900.woff2")
    cn_url = _gradio_asset_url(root_path, "language/cn.json")
    config = {
        "theme": normalized_theme,
        "lang": normalized_lang,
        "apiBase": api_base,
        "assetBase": str(root_path or "").rstrip("/"),
        "cnUrl": cn_url,
    }
    config_json = json.dumps(config, ensure_ascii=False).replace("</", "<\\/")
    return f'''<!doctype html>
<html lang="{normalized_lang}" data-theme="{normalized_theme}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title data-i18n="Media Library">Media Library</title>
  {_icon_font_css(icon_font_url)}
  <link rel="stylesheet" href="{css_url}">
  <script>window.simpleaiGalleryConfig = {config_json};</script>
  <script src="{i18n_url}"></script>
  <script src="{script_url}" defer></script>
</head>
<body data-theme="{normalized_theme}">
  <div class="media-library-app" id="media-library-app">
    <header class="media-library-toolbar">
      <div class="media-library-brand">
        <button class="icon-button mobile-only" id="dates-toggle" type="button" title="Dates" aria-label="Dates">
          <i class="fa fa-calendar-days"></i>
        </button>
        <div class="brand-mark"><i class="fa fa-images"></i></div>
        <div>
          <h1 data-i18n="Media Library">Media Library</h1>
          <div class="brand-subtitle" data-i18n="Independent media browser">Independent media browser</div>
        </div>
      </div>
      <div class="media-library-actions">
        <label class="search-box" for="media-search">
          <i class="fa fa-search"></i>
          <input id="media-search" type="search" autocomplete="off" data-i18n-placeholder="Search media" placeholder="Search media">
        </label>
        <select id="media-type" class="compact-select" aria-label="Media type">
          <option value="all" data-i18n="All types">All types</option>
          <option value="image" data-i18n="Images">Images</option>
          <option value="video" data-i18n="Videos">Videos</option>
          <option value="audio" data-i18n="Audio">Audio</option>
        </select>
        <select id="media-sort" class="compact-select" aria-label="Sort">
          <option value="newest" data-i18n="Newest">Newest</option>
          <option value="oldest" data-i18n="Oldest">Oldest</option>
        </select>
        <button class="icon-button" id="filter-toggle" type="button" title="Filters" aria-label="Filters" aria-expanded="false">
          <i class="fa fa-filter"></i>
        </button>
        <button class="icon-button" id="favorite-filter" type="button" title="Favorites" aria-label="Favorites">
          <i class="fa fa-star"></i>
        </button>
        <button class="icon-button" id="autoplay-toggle" type="button" title="Video autoplay" aria-label="Video autoplay" aria-pressed="true">
          <i class="fa fa-play"></i>
        </button>
        <button class="icon-button" id="trash-view" type="button" title="Trash" aria-label="Trash" aria-pressed="false">
          <i class="fa fa-trash"></i>
        </button>
        <button class="icon-button" id="selection-mode" type="button" title="Select" aria-label="Select" aria-pressed="false">
          <i class="fa fa-square-check"></i>
        </button>
        <button class="icon-button" id="refresh-library" type="button" title="Refresh" aria-label="Refresh">
          <i class="fa fa-rotate"></i>
        </button>
      </div>
      <div class="media-filter-panel" id="media-filter-panel" hidden>
        <div class="filter-panel-title" data-i18n="Filters">Filters</div>
        <label for="filter-tag" data-i18n="Tag">Tag</label>
        <input id="filter-tag" type="search" autocomplete="off">
        <label for="filter-model" data-i18n="Model">Model</label>
        <input id="filter-model" type="search" autocomplete="off">
        <label for="filter-rating" data-i18n="Minimum rating">Minimum rating</label>
        <select id="filter-rating">
          <option value="" data-i18n="Any rating">Any rating</option>
          <option value="1">★</option><option value="2">★★</option><option value="3">★★★</option>
          <option value="4">★★★★</option><option value="5">★★★★★</option>
        </select>
        <label for="filter-orientation" data-i18n="Orientation">Orientation</label>
        <select id="filter-orientation">
          <option value="" data-i18n="Any orientation">Any orientation</option>
          <option value="landscape" data-i18n="Horizontal">Horizontal</option>
          <option value="portrait" data-i18n="Vertical">Vertical</option>
          <option value="square" data-i18n="Square">Square</option>
        </select>
        <div class="filter-panel-actions">
          <button class="text-button" id="filter-clear" type="button" data-i18n="Clear filters">Clear filters</button>
          <button class="primary-button" id="filter-apply" type="button" data-i18n="Apply">Apply</button>
        </div>
        <div class="filter-save-row">
          <input id="view-name" type="text" maxlength="100" data-i18n-placeholder="View name" placeholder="View name">
          <button class="icon-button" id="view-save" type="button" title="Save view" aria-label="Save view"><i class="fa fa-floppy-disk"></i></button>
        </div>
      </div>
    </header>

    <div class="media-library-layout" id="media-library-layout">
      <aside class="date-sidebar" id="date-sidebar" aria-label="Dates">
        <div class="sidebar-heading"><span data-i18n="Collections">Collections</span>
          <button class="icon-button subtle" id="collection-create-toggle" type="button" title="New collection" aria-label="New collection"><i class="fa fa-plus"></i></button>
        </div>
        <form class="sidebar-create" id="collection-create-form" hidden>
          <input id="collection-name" type="text" maxlength="100" data-i18n-placeholder="Collection name" placeholder="Collection name">
          <button class="icon-button subtle" type="submit" title="Create" aria-label="Create"><i class="fa fa-check"></i></button>
        </form>
        <div class="organizer-list" id="collection-list"></div>
        <div class="sidebar-heading"><span data-i18n="Saved views">Saved views</span></div>
        <div class="organizer-list" id="view-list"></div>
        <div class="sidebar-heading">
          <span data-i18n="Dates">Dates</span>
          <button class="icon-button subtle" id="clear-date" type="button" title="All dates" aria-label="All dates">
            <i class="fa fa-layer-group"></i>
          </button>
        </div>
        <div class="date-list" id="date-list"></div>
      </aside>

      <main class="media-library-main">
        <div class="feed-toolbar">
          <div class="feed-toolbar-leading">
            <div class="feed-status" id="feed-status" aria-live="polite"></div>
            <span class="selection-count" id="selection-count" hidden></span>
          </div>
          <div class="feed-toolbar-actions">
            <button class="text-button" id="selection-compare" type="button" hidden><i class="fa fa-clone"></i><span data-i18n="Compare">Compare</span></button>
            <button class="text-button" id="selection-edit" type="button" hidden><i class="fa fa-sliders"></i><span data-i18n="Edit selected">Edit selected</span></button>
            <select id="selection-collection" class="compact-select" aria-label="Collection" hidden></select>
            <button class="icon-button" id="selection-add-collection" type="button" title="Add to collection" aria-label="Add to collection" hidden><i class="fa fa-folder-plus"></i></button>
            <button class="icon-button" id="selection-remove-collection" type="button" title="Remove from collection" aria-label="Remove from collection" hidden><i class="fa fa-minus"></i></button>
            <button class="icon-button subtle" id="selection-clear" type="button" title="Clear selection" aria-label="Clear selection" hidden>
              <i class="fa fa-xmark"></i>
            </button>
            <button class="text-button danger-text-button" id="selection-trash" type="button" hidden>
              <i class="fa fa-trash"></i><span data-i18n="Delete selected">Delete selected</span>
            </button>
            <button class="text-button" id="selection-restore" type="button" hidden>
              <i class="fa fa-rotate-left"></i><span data-i18n="Restore selected">Restore selected</span>
            </button>
            <button class="text-button danger-text-button" id="selection-purge" type="button" hidden>
              <i class="fa fa-trash"></i><span data-i18n="Delete selected permanently">Delete selected permanently</span>
            </button>
            <button class="text-button" id="rescan-library" type="button">
              <i class="fa fa-arrows-rotate"></i><span data-i18n="Rescan">Rescan</span>
            </button>
            <button class="text-button" id="purge-trash" type="button" hidden>
              <i class="fa fa-trash"></i><span data-i18n="Empty trash">Empty trash</span>
            </button>
          </div>
          <div class="batch-editor" id="batch-editor" hidden>
            <label for="batch-tags" data-i18n="Add tags">Add tags</label><input id="batch-tags" type="text" maxlength="640">
            <label for="batch-rating" data-i18n="Rating">Rating</label>
            <select id="batch-rating"><option value="" data-i18n="Keep unchanged">Keep unchanged</option><option value="0" data-i18n="Unrated">Unrated</option><option value="1">★</option><option value="2">★★</option><option value="3">★★★</option><option value="4">★★★★</option><option value="5">★★★★★</option></select>
            <label for="batch-favorite" data-i18n="Favorites">Favorites</label>
            <select id="batch-favorite"><option value="" data-i18n="Keep unchanged">Keep unchanged</option><option value="1" data-i18n="Favorite">Favorite</option><option value="0" data-i18n="Unfavorite">Unfavorite</option></select>
            <div class="filter-panel-actions"><button class="primary-button" id="batch-save" type="button" data-i18n="Save">Save</button></div>
          </div>
        </div>
        <section class="media-feed-scroll" id="media-feed-scroll" aria-label="Media">
          <div class="feed-spacer" id="feed-top-spacer"></div>
          <div class="media-feed" id="gallery-feed"></div>
          <div class="feed-spacer" id="feed-bottom-spacer"></div>
          <div class="feed-sentinel" id="feed-sentinel"></div>
          <div class="empty-state" id="empty-state" hidden>
            <div class="empty-icon"><i class="fa fa-images"></i></div>
            <h2 data-i18n="No media yet">No media yet</h2>
            <p data-i18n="Generated media will appear here.">Generated media will appear here.</p>
          </div>
        </section>
      </main>

      <div class="detail-backdrop" id="detail-backdrop" aria-hidden="true"></div>
      <aside class="detail-drawer" id="detail-drawer" aria-label="Details" aria-hidden="true">
        <div class="detail-header">
          <span class="detail-drag-handle" aria-hidden="true"></span>
          <h2 data-i18n="Details">Details</h2>
          <button class="icon-button" id="close-detail" type="button" title="Close" aria-label="Close">
            <i class="fa fa-xmark"></i>
          </button>
        </div>
        <div class="detail-content" id="detail-content"></div>
      </aside>
    </div>
  </div>
  <div class="media-viewer" id="media-viewer" aria-hidden="true">
    <div class="viewer-backdrop" id="viewer-backdrop"></div>
    <div class="viewer-shell" role="dialog" aria-modal="true" aria-label="Viewer">
      <div class="viewer-header">
        <div class="viewer-title" id="viewer-title"></div>
        <button class="icon-button" id="viewer-close" type="button" title="Close" aria-label="Close"><i class="fa fa-xmark"></i></button>
      </div>
      <div class="viewer-stage" id="viewer-stage">
        <button class="viewer-nav viewer-prev" id="viewer-prev" type="button" title="Previous" aria-label="Previous"><i class="fa fa-chevron-left"></i></button>
        <div class="viewer-media" id="viewer-media"></div>
        <button class="viewer-nav viewer-next" id="viewer-next" type="button" title="Next" aria-label="Next"><i class="fa fa-chevron-right"></i></button>
      </div>
      <div class="viewer-footer">
        <span class="viewer-position" id="viewer-position"></span>
        <div class="viewer-controls">
          <button class="icon-button" id="viewer-zoom-out" type="button" title="Zoom out" aria-label="Zoom out"><i class="fa fa-minus"></i></button>
          <button class="viewer-zoom-value" id="viewer-zoom-reset" type="button" title="Reset zoom" aria-label="Reset zoom">100%</button>
          <button class="icon-button" id="viewer-zoom-in" type="button" title="Zoom in" aria-label="Zoom in"><i class="fa fa-plus"></i></button>
          <a class="icon-button" id="viewer-download" href="#" download title="Download" aria-label="Download"><i class="fa fa-download"></i></a>
        </div>
      </div>
    </div>
  </div>
  <div class="media-compare" id="media-compare" aria-hidden="true" role="dialog" aria-modal="true" aria-label="Compare">
    <div class="compare-header"><h2 data-i18n="Compare">Compare</h2>
      <div class="compare-controls">
        <div class="compare-modes" role="group" aria-label="Compare mode">
          <button type="button" id="compare-side" aria-pressed="true" title="Side by side"><i class="fa fa-clone"></i><span data-i18n="Side by side">Side by side</span></button>
          <button type="button" id="compare-wipe" aria-pressed="false" title="Wipe"><i class="fa fa-arrows-left-right"></i><span data-i18n="Wipe">Wipe</span></button>
        </div>
        <button class="compare-sync-toggle" id="compare-sync" type="button" aria-pressed="true" hidden><i class="fa fa-link"></i><span data-i18n="Sync playback">Sync playback</span></button>
        <label for="compare-match" data-i18n="Match mode">Match mode</label>
        <select id="compare-match"><option value="fit" data-i18n="Fit">Fit</option><option value="width" data-i18n="Match width">Match width</option><option value="height" data-i18n="Match height">Match height</option><option value="pixel" data-i18n="Actual pixels">Actual pixels</option></select>
        <label for="compare-zoom" data-i18n="Zoom">Zoom</label><input id="compare-zoom" type="range" min="25" max="400" value="100" step="5"><output id="compare-zoom-value" for="compare-zoom">100%</output>
        <label class="compare-offset">X <input id="compare-x" type="number" value="0" step="1"></label>
        <label class="compare-offset">Y <input id="compare-y" type="number" value="0" step="1"></label>
        <button class="icon-button" id="compare-align" type="button" title="Reset alignment" aria-label="Reset alignment"><i class="fa fa-link"></i></button>
        <label class="compare-split-control" id="compare-split-control" hidden><span data-i18n="Divider">Divider</span><input id="compare-split" type="range" min="0" max="100" value="50"></label>
        <button class="icon-button" id="compare-close" type="button" title="Close" aria-label="Close"><i class="fa fa-xmark"></i></button>
      </div>
    </div>
    <div class="compare-grid" id="compare-grid"></div>
    <div class="compare-transport" id="compare-transport" hidden>
      <button class="icon-button" id="compare-play" type="button" title="Play" aria-label="Play" disabled><i class="fa fa-play"></i></button>
      <input id="compare-time" type="range" min="0" max="1" value="0" step="0.01" aria-label="Playback position" disabled>
      <output id="compare-clock" for="compare-time">0:00 / 0:00</output>
      <button class="icon-button" id="compare-mute" type="button" title="Mute" aria-label="Mute" aria-pressed="false"><i class="fa fa-volume-high"></i></button>
      <label for="compare-rate" data-i18n="Playback speed">Playback speed</label>
      <select id="compare-rate" aria-label="Playback speed"><option value="0.5">0.5&times;</option><option value="1" selected>1&times;</option><option value="1.5">1.5&times;</option><option value="2">2&times;</option></select>
    </div>
  </div>
  <div class="media-toast" id="media-toast" role="status" aria-live="polite"></div>
</body>
</html>'''
