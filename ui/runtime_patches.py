from __future__ import annotations

import os
from collections.abc import Callable
from pathlib import Path

import gradio
import gradio.blocks
import gradio.routes
from starlette.responses import Response


_APP_TREE_PATCHED_SENTINEL = "simpleai_node_index_cache"
_IMAGE_DROP_CUSTOM_URL_SENTINEL = "simpleai_image_drop_custom_url"
_GRADIO_CONNECTION_RELOAD_PATCHED_SENTINEL = "simpleai_gradio_connection_recovered"
_APP_TREE_CHILDREN_ASSIGNMENT = "\t\tn.children = subtree.children;\n"
_APP_TREE_ORIGINAL_LOOKUP = """function find_node_by_id(tree, id) {
\tif (tree.id === id) {
\t\treturn tree;
\t}

\tif (tree.children) {
\t\tfor (const child of tree.children) {
\t\t\tconst result = find_node_by_id(child, id);

\t\t\tif (result) {
\t\t\t\treturn result;
\t\t\t}
\t\t}
\t}

\treturn null;
}"""
_IMAGE_DROP_PATCHED_SENTINEL = "simpleai_image_drop_snapshot"
_IMAGE_UPLOAD_KEEP_SENTINEL = "simpleai_keep_value_during_image_upload"
_IMAGE_DROP_ORIGINAL_HANDLER = """  async function on_drop(evt) {
    evt.preventDefault();
    evt.stopPropagation();
    $$invalidate(2, dragging = false);
    if (value) {
      handle_clear();
      await tick();
    }
    $$invalidate(1, active_source = "upload");
    await tick();
    upload_input.load_files_from_drop(evt);
  }"""
_IMAGE_DROP_ORIGINAL_HANDLER_SVELTE5 = """async function on_drop(evt) {
\t\tevt.preventDefault();
\t\tevt.stopPropagation();
\t\tdragging(false);

\t\tif (value()) {
\t\t\thandle_clear();
\t\t\tawait tick();
\t\t}

\t\tactive_source("upload");
\t\tawait tick();
\t\tget(upload_input).load_files_from_drop(evt);
\t}"""
_IMAGE_DROP_ORIGINAL_HANDLER_MINIFIED_UPLOAD = "async function A(e){n(10,i=!1),e.dataTransfer?.files&&await D(e.dataTransfer.files)}"
_IMAGE_UPLOAD_CLEAR_ORIGINAL_HANDLER = """    if ($$self.$$.dirty[0] & /*uploading, active_streaming*/
    2097153) {
      if (uploading && !active_streaming) $$invalidate(3, value = null);
    }"""
_IMAGE_UPLOAD_CLEAR_ORIGINAL_HANDLER_SVELTE5 = """\tlegacy_pre_effect(() => (deep_read_state(uploading()), get(active_streaming)), () => {
\t\tif (uploading() && !get(active_streaming)) value(null);
\t});"""
_GRADIO_CONNECTION_RELOAD_ORIGINAL = """\t\t\t\t\tif (status === "connected" || status === "changed") {
\t\t\t\t\t\tclearInterval(reconnect_interval);
\t\t\t\t\t\treconnect_interval = null;
\t\t\t\t\t\twindow.location.reload();
\t\t\t\t\t}"""
_GRADIO_CONNECTION_RELOAD_PATCHED = """\t\t\t\t\tif (status === "connected" || status === "changed") {
\t\t\t\t\t\tclearInterval(reconnect_interval);
\t\t\t\t\t\treconnect_interval = null;
\t\t\t\t\t\tconst simpleai_gradio_connection_recovered = {
\t\t\t\t\t\t\tstatus,
\t\t\t\t\t\t\tvisibility: document.visibilityState,
\t\t\t\t\t\t\trecovered_at: Date.now(),
\t\t\t\t\t\t\tauto_reload: false
\t\t\t\t\t\t};
\t\t\t\t\t\ttry {
\t\t\t\t\t\t\tglobalThis.SimpAIStudioPerformance?.mark?.(
\t\t\t\t\t\t\t\t"gradio.connection_recovered",
\t\t\t\t\t\t\t\tsimpleai_gradio_connection_recovered,
\t\t\t\t\t\t\t\t{ urgent: true }
\t\t\t\t\t\t\t);
\t\t\t\t\t\t} catch (_) {}
\t\t\t\t\t\ttry {
\t\t\t\t\t\t\twindow.dispatchEvent(new CustomEvent("simpai:gradio-reconnect-required", {
\t\t\t\t\t\t\t\tdetail: simpleai_gradio_connection_recovered
\t\t\t\t\t\t\t}));
\t\t\t\t\t\t} catch (_) {}
\t\t\t\t\t}"""
_APP_TREE_PATCH_CACHE: dict[tuple[str, int, int], str] = {}
_IMAGE_DROP_PATCH_CACHE: dict[tuple[str, int, int], str] = {}
_GRADIO_CONNECTION_RELOAD_PATCH_CACHE: dict[tuple[str, int, int], str] = {}
_GRADIO_JS_PATCH_CACHE: dict[tuple[object, ...], str] = {}
_GRADIO_JS_PATCH_READER_CACHE: dict[str, Callable[[Path], str | None]] | None = None
_BLOCK_GET_CONFIG_COMPAT_SENTINEL = "_simpai_gradio6_block_get_config_compat"


def _env_flag_enabled(name: str) -> bool:
    return (os.environ.get(name) or "").strip().lower() in {"1", "true", "yes", "on"}


def _app_tree_patch_disabled() -> bool:
    return _env_flag_enabled("SIMPAI_DISABLE_GRADIO_APP_TREE_PATCH") or _env_flag_enabled(
        "SIMPAI_DISABLE_GRADIO_ASSET_PATCHES"
    )


def _image_drop_patch_disabled() -> bool:
    return _env_flag_enabled("SIMPAI_DISABLE_GRADIO_ASSET_PATCHES")


def _connection_reload_patch_disabled() -> bool:
    return _env_flag_enabled("SIMPAI_DISABLE_GRADIO_CONNECTION_RELOAD_PATCH") or _env_flag_enabled(
        "SIMPAI_DISABLE_GRADIO_ASSET_PATCHES"
    )


def _asset_needs_app_tree_patch(text: str) -> bool:
    return (
        _APP_TREE_ORIGINAL_LOOKUP in text
        and _APP_TREE_CHILDREN_ASSIGNMENT in text
        and _APP_TREE_PATCHED_SENTINEL not in text
    )


def _asset_needs_image_drop_patch(text: str) -> bool:
    return (
        (
            (
                _IMAGE_DROP_ORIGINAL_HANDLER in text
                or _IMAGE_DROP_ORIGINAL_HANDLER_SVELTE5 in text
                or _IMAGE_DROP_ORIGINAL_HANDLER_MINIFIED_UPLOAD in text
            )
            and _IMAGE_DROP_CUSTOM_URL_SENTINEL not in text
        )
        or (
            (
                _IMAGE_UPLOAD_CLEAR_ORIGINAL_HANDLER in text
                or _IMAGE_UPLOAD_CLEAR_ORIGINAL_HANDLER_SVELTE5 in text
            )
            and _IMAGE_UPLOAD_KEEP_SENTINEL not in text
        )
    )


def _asset_needs_connection_reload_patch(text: str) -> bool:
    return (
        _GRADIO_CONNECTION_RELOAD_ORIGINAL in text
        and _GRADIO_CONNECTION_RELOAD_PATCHED_SENTINEL not in text
    )


def _patch_app_tree_asset(text: str) -> str:
    """
    Gradio 6.9 repeatedly scans the whole app tree for every output update.
    SimpAI has a large component tree, so cache id -> node lookups per root.
    """
    patched_lookup = """const simpleai_node_index_cache = new WeakMap();
const simpleai_node_index_trace_state = { count: 0 };
const simpleai_node_index_ttl_ms = 30;

function trace_node_index(event, detail) {
\ttry {
\t\tif (!globalThis.__simpleai_trace_app_tree_cache) return;
\t\tsimpleai_node_index_trace_state.count += 1;
\t\tconst count = simpleai_node_index_trace_state.count;
\t\tif (count <= 40 || count % 100 === 0) {
\t\t\tconsole.log("[UI-TRACE] app_tree_cache." + event, Object.assign({ count }, detail || {}));
\t\t}
\t} catch (_) {}
}

function invalidate_node_index(tree) {
\tif (tree) {
\t\tsimpleai_node_index_cache.delete(tree);
\t\ttrace_node_index("invalidate", { root_id: tree.id });
\t}
}

function build_node_index(tree) {
\tconst map = new Map();
\tconst stack = tree ? [tree] : [];
\twhile (stack.length > 0) {
\t\tconst node = stack.pop();
\t\tif (!node) continue;
\t\tif (!map.has(node.id)) map.set(node.id, node);
\t\tif (node.children) {
\t\t\tfor (let i = node.children.length - 1; i >= 0; i--) {
\t\t\t\tstack.push(node.children[i]);
\t\t\t}
\t\t}
\t}
\treturn map;
}

function find_node_by_id(tree, id) {
\tif (!tree) return null;
\tlet record = simpleai_node_index_cache.get(tree);
\tlet index = record?.index;
\tconst now = Date.now();
\tif (!index || record.expires_at <= now) {
\t\tindex = build_node_index(tree);
\t\trecord = { index, expires_at: now + simpleai_node_index_ttl_ms };
\t\tsimpleai_node_index_cache.set(tree, record);
\t\ttrace_node_index("build", { root_id: tree.id, size: index.size, requested_id: id });
\t}
\tlet node = index.get(id);
\tif (!node) {
\t\tindex = build_node_index(tree);
\t\tsimpleai_node_index_cache.set(tree, { index, expires_at: now + simpleai_node_index_ttl_ms });
\t\ttrace_node_index("rebuild_miss", { root_id: tree.id, size: index.size, requested_id: id });
\t\tnode = index.get(id);
\t}
\treturn node ?? null;
}"""
    if not _asset_needs_app_tree_patch(text):
        return text
    text = text.replace(_APP_TREE_ORIGINAL_LOOKUP, patched_lookup, 1)
    text = text.replace(
        _APP_TREE_CHILDREN_ASSIGNMENT,
        "\t\tn.children = subtree.children;\n\t\tinvalidate_node_index(this.root);\n",
        1,
    )
    return text


def _patch_image_drop_asset(text: str) -> str:
    if not _asset_needs_image_drop_patch(text):
        return text
    patched_handler = """  async function on_drop(evt) {
    evt.preventDefault();
    evt.stopPropagation();
    const simpleai_image_drop_transfer = evt.dataTransfer;
    const simpleai_image_drop_snapshot = Array.from(simpleai_image_drop_transfer && simpleai_image_drop_transfer.files ? simpleai_image_drop_transfer.files : []);
    if (!simpleai_image_drop_snapshot.length && simpleai_image_drop_transfer && simpleai_image_drop_transfer.items) {
      for (const simpleai_image_drop_item of Array.from(simpleai_image_drop_transfer.items)) {
        if (simpleai_image_drop_item && simpleai_image_drop_item.kind === "file") {
          const simpleai_image_drop_item_file = simpleai_image_drop_item.getAsFile();
          if (simpleai_image_drop_item_file) {
            simpleai_image_drop_snapshot.push(simpleai_image_drop_item_file);
          }
        }
      }
    }
    const simpleai_image_drop_url = simpleai_image_drop_custom_url(simpleai_image_drop_transfer) || simpleai_image_drop_first_url(simpleai_image_drop_transfer);
    const simpleai_image_drop_perf = globalThis.SimpAIStudioPerformance;
    const simpleai_image_drop_started_at = simpleai_image_drop_perf ? performance.now() : 0;
    simpleai_image_drop_perf?.mark("gradio_image_drop.begin", {
      file_count: simpleai_image_drop_snapshot.length,
      files: simpleai_image_drop_snapshot,
      has_url_source: Boolean(simpleai_image_drop_url)
    }, { urgent: true });
    $$invalidate(2, dragging = false);
    if (!simpleai_image_drop_snapshot.length && !simpleai_image_drop_url) {
      simpleai_image_drop_perf?.mark("gradio_image_drop.finish", { outcome: "no-supported-source", elapsed_ms: performance.now() - simpleai_image_drop_started_at });
      return;
    }
    $$invalidate(1, active_source = "upload");
    await tick();
    if (simpleai_image_drop_url) {
      simpleai_image_drop_perf?.mark("gradio_image_drop.url_load_begin", {});
      const simpleai_image_drop_file = await simpleai_image_drop_file_from_url(simpleai_image_drop_url);
      if (simpleai_image_drop_file) {
        simpleai_image_drop_perf?.mark("gradio_image_drop.upload_begin", { source: "url", file: simpleai_image_drop_file });
        await upload_input.load_files([simpleai_image_drop_file]);
        simpleai_image_drop_perf?.mark("gradio_image_drop.finish", { outcome: "url-submitted", elapsed_ms: performance.now() - simpleai_image_drop_started_at }, { urgent: true });
        return;
      }
      simpleai_image_drop_perf?.mark("gradio_image_drop.url_load_failed", {});
    }
    if (simpleai_image_drop_snapshot.length) {
      simpleai_image_drop_perf?.mark("gradio_image_drop.upload_begin", { source: "files", files: simpleai_image_drop_snapshot });
      await upload_input.load_files_from_drop({ dataTransfer: { files: simpleai_image_drop_snapshot } });
      simpleai_image_drop_perf?.mark("gradio_image_drop.finish", { outcome: "files-submitted", elapsed_ms: performance.now() - simpleai_image_drop_started_at }, { urgent: true });
      return;
    }
    simpleai_image_drop_perf?.mark("gradio_image_drop.finish", { outcome: "source-load-failed", elapsed_ms: performance.now() - simpleai_image_drop_started_at }, { urgent: true });
    function simpleai_image_drop_first_uri(text) {
      return String(text || "").split(/\\r?\\n/).map((line) => line.trim()).find((line) => line && !line.startsWith("#")) || "";
    }
    function simpleai_image_drop_first_html_src(html) {
      if (!html) return "";
      try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const src = doc.querySelector("img[src]")?.getAttribute("src") || "";
        if (src) return src;
      } catch (_) {}
      const match = String(html).match(/<img\\b[^>]*\\bsrc=["']?([^"'\\s>]+)/i);
      return match ? match[1] : "";
    }
    function simpleai_image_drop_normalize_source(source) {
      const value = String(source || "").trim();
      if (!value) return "";
      let normalized = value;
      try {
        normalized = new URL(value, document.baseURI).href;
      } catch (_) {
      }
      return simpleai_image_drop_gallery_original_source(normalized);
    }
    function simpleai_image_drop_base64_url_decode_utf8(value) {
      const text = String(value || "");
      if (!text) return "";
      const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - text.length % 4) % 4);
      try {
        const binary = atob(padded);
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        if (window.TextDecoder) return new TextDecoder("utf-8").decode(bytes);
        return decodeURIComponent(Array.from(bytes, (byte) => "%" + byte.toString(16).padStart(2, "0")).join(""));
      } catch (_) {
        return "";
      }
    }
    function simpleai_image_drop_gallery_original_source(source) {
      try {
        const url = new URL(source, document.baseURI);
        const filename = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
        const match = filename.match(/^simpai_gprev__([A-Za-z0-9_-]+)__[0-9a-f]{16}\\.jpg$/);
        if (!match) return source;
        const original_path = simpleai_image_drop_base64_url_decode_utf8(match[1]);
        if (!original_path) return source;
        const route = "/simpleai/gallery-preview/";
        const route_index = url.pathname.indexOf(route);
        const base_path = route_index >= 0 ? url.pathname.slice(0, route_index) : "";
        const encoded_path = encodeURI(String(original_path).replace(/\\\\/g, "/")).replace(/\\?/g, "%3F").replace(/#/g, "%23");
        return url.origin + base_path + "/gradio_api/file=" + encoded_path;
      } catch (_) {
        return source;
      }
    }
    function simpleai_image_drop_first_url(transfer) {
      if (!transfer || typeof transfer.getData !== "function") return "";
      const uri = simpleai_image_drop_first_uri(transfer.getData("text/uri-list"));
      if (uri) return simpleai_image_drop_normalize_source(uri);
      const html_src = simpleai_image_drop_first_html_src(transfer.getData("text/html"));
      if (html_src) return simpleai_image_drop_normalize_source(html_src);
      const plain = String(transfer.getData("text/plain") || "").trim();
      return plain ? simpleai_image_drop_normalize_source(plain) : "";
    }
    function simpleai_image_drop_custom_url(transfer) {
      if (!transfer || typeof transfer.getData !== "function") return "";
      return simpleai_image_drop_normalize_source(transfer.getData("application/x-simpleai-gallery-original-url"));
    }
    async function simpleai_image_drop_file_from_url(source) {
      if (!source) return null;
      try {
        const response = await fetch(source, { credentials: "same-origin" });
        if (!response.ok) return null;
        const blob = await response.blob();
        const mime = blob.type || "image/png";
        if (mime && !mime.toLowerCase().startsWith("image/")) return null;
        const raw_ext = (mime.split("/")[1] || "png").split(";")[0].replace("svg+xml", "svg");
        const ext = raw_ext === "jpeg" ? "jpg" : raw_ext;
        return new File([blob], "dropped-image." + ext, { type: mime });
      } catch (_) {
        return null;
      }
    }
  }"""
    patched_svelte5_handler = """async function on_drop(evt) {
\t\tevt.preventDefault();
\t\tevt.stopPropagation();
\t\tconst simpleai_image_drop_transfer = evt.dataTransfer;
\t\tconst simpleai_image_drop_snapshot = Array.from(simpleai_image_drop_transfer && simpleai_image_drop_transfer.files ? simpleai_image_drop_transfer.files : []);
\t\tif (!simpleai_image_drop_snapshot.length && simpleai_image_drop_transfer && simpleai_image_drop_transfer.items) {
\t\t\tfor (const simpleai_image_drop_item of Array.from(simpleai_image_drop_transfer.items)) {
\t\t\t\tif (simpleai_image_drop_item && simpleai_image_drop_item.kind === "file") {
\t\t\t\t\tconst simpleai_image_drop_item_file = simpleai_image_drop_item.getAsFile();
\t\t\t\t\tif (simpleai_image_drop_item_file) {
\t\t\t\t\t\tsimpleai_image_drop_snapshot.push(simpleai_image_drop_item_file);
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\t}
\t\tconst simpleai_image_drop_url = simpleai_image_drop_custom_url(simpleai_image_drop_transfer) || simpleai_image_drop_first_url(simpleai_image_drop_transfer);
\t\tconst simpleai_image_drop_perf = globalThis.SimpAIStudioPerformance;
\t\tconst simpleai_image_drop_started_at = simpleai_image_drop_perf ? performance.now() : 0;
\t\tsimpleai_image_drop_perf?.mark("gradio_image_drop.begin", {
\t\t\tfile_count: simpleai_image_drop_snapshot.length,
\t\t\tfiles: simpleai_image_drop_snapshot,
\t\t\thas_url_source: Boolean(simpleai_image_drop_url)
\t\t}, { urgent: true });
\t\tdragging(false);
\t\tif (!simpleai_image_drop_snapshot.length && !simpleai_image_drop_url) {
\t\t\tsimpleai_image_drop_perf?.mark("gradio_image_drop.finish", { outcome: "no-supported-source", elapsed_ms: performance.now() - simpleai_image_drop_started_at });
\t\t\treturn;
\t\t}
\t\tactive_source("upload");
\t\tawait tick();
\t\tif (simpleai_image_drop_url) {
\t\t\tsimpleai_image_drop_perf?.mark("gradio_image_drop.url_load_begin", {});
\t\t\tconst simpleai_image_drop_file = await simpleai_image_drop_file_from_url(simpleai_image_drop_url);
\t\t\tif (simpleai_image_drop_file) {
\t\t\t\tsimpleai_image_drop_perf?.mark("gradio_image_drop.upload_begin", { source: "url", file: simpleai_image_drop_file });
\t\t\t\tawait get(upload_input).load_files([simpleai_image_drop_file]);
\t\t\t\tsimpleai_image_drop_perf?.mark("gradio_image_drop.finish", { outcome: "url-submitted", elapsed_ms: performance.now() - simpleai_image_drop_started_at }, { urgent: true });
\t\t\t\treturn;
\t\t\t}
\t\t\tsimpleai_image_drop_perf?.mark("gradio_image_drop.url_load_failed", {});
\t\t}
\t\tif (simpleai_image_drop_snapshot.length) {
\t\t\tsimpleai_image_drop_perf?.mark("gradio_image_drop.upload_begin", { source: "files", files: simpleai_image_drop_snapshot });
\t\t\tawait get(upload_input).load_files_from_drop({ dataTransfer: { files: simpleai_image_drop_snapshot } });
\t\t\tsimpleai_image_drop_perf?.mark("gradio_image_drop.finish", { outcome: "files-submitted", elapsed_ms: performance.now() - simpleai_image_drop_started_at }, { urgent: true });
\t\t\treturn;
\t\t}
\t\tsimpleai_image_drop_perf?.mark("gradio_image_drop.finish", { outcome: "source-load-failed", elapsed_ms: performance.now() - simpleai_image_drop_started_at }, { urgent: true });
\t\tfunction simpleai_image_drop_first_uri(text) {
\t\t\treturn String(text || "").split(/\\r?\\n/).map((line) => line.trim()).find((line) => line && !line.startsWith("#")) || "";
\t\t}
\t\tfunction simpleai_image_drop_first_html_src(html) {
\t\t\tif (!html) return "";
\t\t\ttry {
\t\t\t\tconst doc = new DOMParser().parseFromString(html, "text/html");
\t\t\t\tconst src = doc.querySelector("img[src]")?.getAttribute("src") || "";
\t\t\t\tif (src) return src;
\t\t\t} catch (_) {}
\t\t\tconst match = String(html).match(/<img\\b[^>]*\\bsrc=["']?([^"'\\s>]+)/i);
\t\t\treturn match ? match[1] : "";
\t\t}
\t\tfunction simpleai_image_drop_normalize_source(source) {
\t\t\tconst value = String(source || "").trim();
\t\t\tif (!value) return "";
\t\t\tlet normalized = value;
\t\t\ttry {
\t\t\t\tnormalized = new URL(value, document.baseURI).href;
\t\t\t} catch (_) {
\t\t\t}
\t\t\treturn simpleai_image_drop_gallery_original_source(normalized);
\t\t}
\t\tfunction simpleai_image_drop_base64_url_decode_utf8(value) {
\t\t\tconst text = String(value || "");
\t\t\tif (!text) return "";
\t\t\tconst padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - text.length % 4) % 4);
\t\t\ttry {
\t\t\t\tconst binary = atob(padded);
\t\t\t\tconst bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
\t\t\t\tif (window.TextDecoder) return new TextDecoder("utf-8").decode(bytes);
\t\t\t\treturn decodeURIComponent(Array.from(bytes, (byte) => "%" + byte.toString(16).padStart(2, "0")).join(""));
\t\t\t} catch (_) {
\t\t\t\treturn "";
\t\t\t}
\t\t}
\t\tfunction simpleai_image_drop_gallery_original_source(source) {
\t\t\ttry {
\t\t\t\tconst url = new URL(source, document.baseURI);
\t\t\t\tconst filename = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
\t\t\t\tconst match = filename.match(/^simpai_gprev__([A-Za-z0-9_-]+)__[0-9a-f]{16}\\.jpg$/);
\t\t\t\tif (!match) return source;
\t\t\t\tconst original_path = simpleai_image_drop_base64_url_decode_utf8(match[1]);
\t\t\t\tif (!original_path) return source;
\t\t\t\tconst route = "/simpleai/gallery-preview/";
\t\t\t\tconst route_index = url.pathname.indexOf(route);
\t\t\t\tconst base_path = route_index >= 0 ? url.pathname.slice(0, route_index) : "";
\t\t\t\tconst encoded_path = encodeURI(String(original_path).replace(/\\\\/g, "/")).replace(/\\?/g, "%3F").replace(/#/g, "%23");
\t\t\t\treturn url.origin + base_path + "/gradio_api/file=" + encoded_path;
\t\t\t} catch (_) {
\t\t\t\treturn source;
\t\t\t}
\t\t}
\t\tfunction simpleai_image_drop_first_url(transfer) {
\t\t\tif (!transfer || typeof transfer.getData !== "function") return "";
\t\t\tconst uri = simpleai_image_drop_first_uri(transfer.getData("text/uri-list"));
\t\t\tif (uri) return simpleai_image_drop_normalize_source(uri);
\t\t\tconst html_src = simpleai_image_drop_first_html_src(transfer.getData("text/html"));
\t\t\tif (html_src) return simpleai_image_drop_normalize_source(html_src);
\t\t\tconst plain = String(transfer.getData("text/plain") || "").trim();
\t\t\treturn plain ? simpleai_image_drop_normalize_source(plain) : "";
\t\t}
\t\tfunction simpleai_image_drop_custom_url(transfer) {
\t\t\tif (!transfer || typeof transfer.getData !== "function") return "";
\t\t\treturn simpleai_image_drop_normalize_source(transfer.getData("application/x-simpleai-gallery-original-url"));
\t\t}
\t\tasync function simpleai_image_drop_file_from_url(source) {
\t\t\tif (!source) return null;
\t\t\ttry {
\t\t\t\tconst response = await fetch(source, { credentials: "same-origin" });
\t\t\t\tif (!response.ok) return null;
\t\t\t\tconst blob = await response.blob();
\t\t\t\tconst mime = blob.type || "image/png";
\t\t\t\tif (mime && !mime.toLowerCase().startsWith("image/")) return null;
\t\t\t\tconst raw_ext = (mime.split("/")[1] || "png").split(";")[0].replace("svg+xml", "svg");
\t\t\t\tconst ext = raw_ext === "jpeg" ? "jpg" : raw_ext;
\t\t\t\treturn new File([blob], "dropped-image." + ext, { type: mime });
\t\t\t} catch (_) {
\t\t\t\treturn null;
\t\t\t}
\t\t}
\t}"""
    patched_minified_upload_handler = """async function A(e){n(10,i=!1);const h=e.dataTransfer,T=simpleai_image_drop_custom_url(h)||simpleai_image_drop_first_url(h);if(T){const z=await simpleai_image_drop_file_from_url(T);if(z){await D([z]);return}}h?.files&&await D(h.files);function simpleai_image_drop_first_uri(q){return String(q||"").split(/\\r?\\n/).map(U=>U.trim()).find(U=>U&&!U.startsWith("#"))||""}function simpleai_image_drop_first_html_src(q){if(!q)return"";try{const U=new DOMParser().parseFromString(q,"text/html").querySelector("img[src]")?.getAttribute("src")||"";if(U)return U}catch(_){}const ae=String(q).match(/<img\\b[^>]*\\bsrc=["']?([^"'\\s>]+)/i);return ae?ae[1]:""}function simpleai_image_drop_normalize_source(q){const U=String(q||"").trim();if(!U)return"";let ae=U;try{ae=new URL(U,document.baseURI).href}catch(_){}return simpleai_image_drop_gallery_original_source(ae)}function simpleai_image_drop_base64_url_decode_utf8(q){const U=String(q||"");if(!U)return"";const ae=U.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-U.length%4)%4);try{const oe=atob(ae),_e=Uint8Array.from(oe,ve=>ve.charCodeAt(0));return window.TextDecoder?new TextDecoder("utf-8").decode(_e):decodeURIComponent(Array.from(_e,ve=>"%"+ve.toString(16).padStart(2,"0")).join(""))}catch(_){return""}}function simpleai_image_drop_gallery_original_source(q){try{const U=new URL(q,document.baseURI),ae=decodeURIComponent(U.pathname.split("/").filter(Boolean).pop()||""),oe=ae.match(/^simpai_gprev__([A-Za-z0-9_-]+)__[0-9a-f]{16}\\.jpg$/);if(!oe)return q;const _e=simpleai_image_drop_base64_url_decode_utf8(oe[1]);if(!_e)return q;const ve="/simpleai/gallery-preview/",We=U.pathname.indexOf(ve),Ye=We>=0?U.pathname.slice(0,We):"",Ke=encodeURI(String(_e).replace(/\\\\/g,"/")).replace(/\\?/g,"%3F").replace(/#/g,"%23");return U.origin+Ye+"/gradio_api/file="+Ke}catch(_){return q}}function simpleai_image_drop_first_url(q){if(!q||typeof q.getData!="function")return"";const U=simpleai_image_drop_first_uri(q.getData("text/uri-list"));if(U)return simpleai_image_drop_normalize_source(U);const ae=simpleai_image_drop_first_html_src(q.getData("text/html"));if(ae)return simpleai_image_drop_normalize_source(ae);const oe=String(q.getData("text/plain")||"").trim();return oe?simpleai_image_drop_normalize_source(oe):""}function simpleai_image_drop_custom_url(q){return!q||typeof q.getData!="function"?"":simpleai_image_drop_normalize_source(q.getData("application/x-simpleai-gallery-original-url"))}async function simpleai_image_drop_file_from_url(q){if(!q)return null;try{const U=await fetch(q,{credentials:"same-origin"});if(!U.ok)return null;const ae=await U.blob(),oe=ae.type||"image/png";if(oe&&!oe.toLowerCase().startsWith("image/"))return null;const _e=(oe.split("/")[1]||"png").split(";")[0].replace("svg+xml","svg"),ve=_e==="jpeg"?"jpg":_e;return new File([ae],"dropped-image."+ve,{type:oe})}catch(_){return null}}}"""
    patched_minified_upload_handler = patched_minified_upload_handler.replace(
        "async function A(e){n(10,i=!1);const h=e.dataTransfer,T=simpleai_image_drop_custom_url(h)||simpleai_image_drop_first_url(h);",
        "async function A(e){n(10,i=!1);const h=e.dataTransfer,T=simpleai_image_drop_custom_url(h)||simpleai_image_drop_first_url(h),P=globalThis.SimpAIStudioPerformance,R=P?performance.now():0,F=P?Array.from(h?.files||[]):null;P?.mark(\"gradio_image_drop.begin\",{file_count:F.length,files:F,has_url_source:Boolean(T)},{urgent:true});",
        1,
    ).replace(
        "if(T){const z=await simpleai_image_drop_file_from_url(T);if(z){await D([z]);return}}h?.files&&await D(h.files);",
        "if(T){P?.mark(\"gradio_image_drop.url_load_begin\",{});const z=await simpleai_image_drop_file_from_url(T);if(z){P?.mark(\"gradio_image_drop.upload_begin\",{source:\"url\",file:z});try{await D([z]);return}finally{P?.mark(\"gradio_image_drop.finish\",{outcome:\"url-submitted\",elapsed_ms:performance.now()-R},{urgent:true})}}P?.mark(\"gradio_image_drop.url_load_failed\",{})}if(h?.files){P?.mark(\"gradio_image_drop.upload_begin\",{source:\"files\",files:F});try{h?.files&&await D(h.files);return}finally{P?.mark(\"gradio_image_drop.finish\",{outcome:\"files-submitted\",elapsed_ms:performance.now()-R},{urgent:true})}}P?.mark(\"gradio_image_drop.finish\",{outcome:\"source-load-failed\",elapsed_ms:performance.now()-R},{urgent:true});",
        1,
    )
    text = text.replace(_IMAGE_DROP_ORIGINAL_HANDLER, patched_handler, 1)
    text = text.replace(_IMAGE_DROP_ORIGINAL_HANDLER_SVELTE5, patched_svelte5_handler, 1)
    text = text.replace(_IMAGE_DROP_ORIGINAL_HANDLER_MINIFIED_UPLOAD, patched_minified_upload_handler, 1)
    text = text.replace(
        _IMAGE_UPLOAD_CLEAR_ORIGINAL_HANDLER,
        """    if ($$self.$$.dirty[0] & /*uploading, active_streaming*/
    2097153) {
      const simpleai_keep_value_during_image_upload = true;
      if (!simpleai_keep_value_during_image_upload && uploading && !active_streaming) $$invalidate(3, value = null);
    }""",
        1,
    )
    text = text.replace(
        _IMAGE_UPLOAD_CLEAR_ORIGINAL_HANDLER_SVELTE5,
        """\tlegacy_pre_effect(() => (deep_read_state(uploading()), get(active_streaming)), () => {
\t\tconst simpleai_keep_value_during_image_upload = true;
\t\tif (!simpleai_keep_value_during_image_upload && uploading() && !get(active_streaming)) value(null);
\t});""",
        1,
    )
    return text


def _patch_connection_reload_asset(text: str) -> str:
    """Require an explicit reconnect action after Gradio loses its queue stream."""
    if not _asset_needs_connection_reload_patch(text):
        return text
    return text.replace(
        _GRADIO_CONNECTION_RELOAD_ORIGINAL,
        _GRADIO_CONNECTION_RELOAD_PATCHED,
        1,
    )


def _read_patched_app_tree_asset(path: Path) -> str | None:
    try:
        stat = path.stat()
        cache_key = (str(path), int(stat.st_mtime_ns), int(stat.st_size))
        cached = _APP_TREE_PATCH_CACHE.get(cache_key)
        if cached is not None:
            return cached
        text = path.read_text(encoding="utf-8")
        patched = _patch_app_tree_asset(text)
        if patched == text:
            return None
        _APP_TREE_PATCH_CACHE.clear()
        _APP_TREE_PATCH_CACHE[cache_key] = patched
        return patched
    except Exception:
        return None


def _read_patched_image_drop_asset(path: Path) -> str | None:
    try:
        stat = path.stat()
        cache_key = (str(path), int(stat.st_mtime_ns), int(stat.st_size))
        cached = _IMAGE_DROP_PATCH_CACHE.get(cache_key)
        if cached is not None:
            return cached
        text = path.read_text(encoding="utf-8")
        patched = _patch_image_drop_asset(text)
        if patched == text:
            return None
        _IMAGE_DROP_PATCH_CACHE.clear()
        _IMAGE_DROP_PATCH_CACHE[cache_key] = patched
        return patched
    except Exception:
        return None


def _read_patched_connection_reload_asset(path: Path) -> str | None:
    try:
        stat = path.stat()
        cache_key = (str(path), int(stat.st_mtime_ns), int(stat.st_size))
        cached = _GRADIO_CONNECTION_RELOAD_PATCH_CACHE.get(cache_key)
        if cached is not None:
            return cached
        text = path.read_text(encoding="utf-8")
        patched = _patch_connection_reload_asset(text)
        if patched == text:
            return None
        _GRADIO_CONNECTION_RELOAD_PATCH_CACHE.clear()
        _GRADIO_CONNECTION_RELOAD_PATCH_CACHE[cache_key] = patched
        return patched
    except Exception:
        return None


def _read_patched_gradio_js_asset(path: Path) -> str | None:
    try:
        stat = path.stat()
        app_tree_disabled = _app_tree_patch_disabled()
        image_drop_disabled = _image_drop_patch_disabled()
        connection_reload_disabled = _connection_reload_patch_disabled()
        cache_key = (
            str(path),
            int(stat.st_mtime_ns),
            int(stat.st_size),
            app_tree_disabled,
            image_drop_disabled,
            connection_reload_disabled,
        )
        cached = _GRADIO_JS_PATCH_CACHE.get(cache_key)
        if cached is not None:
            return cached
        text = path.read_text(encoding="utf-8")
        patched = text
        if not app_tree_disabled:
            patched = _patch_app_tree_asset(patched)
        if not image_drop_disabled:
            patched = _patch_image_drop_asset(patched)
        if not connection_reload_disabled:
            patched = _patch_connection_reload_asset(patched)
        if patched == text:
            return None
        _GRADIO_JS_PATCH_CACHE.clear()
        _GRADIO_JS_PATCH_CACHE[cache_key] = patched
        return patched
    except Exception:
        return None


def _discover_gradio_js_patch_readers() -> dict[str, Callable[[Path], str | None]]:
    app_tree_disabled = _app_tree_patch_disabled()
    image_drop_disabled = _image_drop_patch_disabled()
    connection_reload_disabled = _connection_reload_patch_disabled()
    if app_tree_disabled and image_drop_disabled and connection_reload_disabled:
        return {}

    try:
        asset_root = Path(gradio.__file__).resolve().parent / "templates" / "frontend" / "assets"
    except Exception:
        return {}
    if not asset_root.is_dir():
        return {}

    readers: dict[str, Callable[[Path], str | None]] = {}
    for path in asset_root.glob("*.js"):
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        needs_app_tree = not app_tree_disabled and _asset_needs_app_tree_patch(text)
        needs_image_drop = not image_drop_disabled and _asset_needs_image_drop_patch(text)
        needs_connection_reload = (
            not connection_reload_disabled and _asset_needs_connection_reload_patch(text)
        )
        patch_count = sum((needs_app_tree, needs_image_drop, needs_connection_reload))
        if patch_count > 1:
            readers[path.name] = _read_patched_gradio_js_asset
        elif needs_app_tree:
            readers[path.name] = _read_patched_app_tree_asset
        elif needs_image_drop:
            readers[path.name] = _read_patched_image_drop_asset
        elif needs_connection_reload:
            readers[path.name] = _read_patched_connection_reload_asset
    return readers


def _get_gradio_js_patch_readers() -> dict[str, Callable[[Path], str | None]]:
    global _GRADIO_JS_PATCH_READER_CACHE
    if _GRADIO_JS_PATCH_READER_CACHE is None:
        _GRADIO_JS_PATCH_READER_CACHE = _discover_gradio_js_patch_readers()
    return _GRADIO_JS_PATCH_READER_CACHE


def patch_gradio_asset_file_response() -> None:
    if not hasattr(gradio.routes, "original_FileResponse"):
        gradio.routes.original_FileResponse = gradio.routes.FileResponse

    def patched_file_response(path, *args, **kwargs):
        try:
            path_obj = Path(path)
            reader = _get_gradio_js_patch_readers().get(path_obj.name)
            if reader is not None:
                patched = reader(path_obj)
                if patched is not None:
                    return Response(
                        patched,
                        media_type="application/javascript",
                        headers={"Cache-Control": "no-store"},
                    )
        except Exception:
            pass
        return gradio.routes.original_FileResponse(path, *args, **kwargs)

    gradio.routes.FileResponse = patched_file_response


def patch_gradio_block_get_config_signature() -> None:
    current = gradio.blocks.Block.get_config
    if getattr(current, _BLOCK_GET_CONFIG_COMPAT_SENTINEL, False):
        return

    def compatible_get_config(self, cls=None):
        try:
            return current(self, cls)
        except TypeError as exc:
            message = str(exc)
            if "positional argument" not in message and "takes" not in message:
                raise
            return current(self)

    setattr(compatible_get_config, _BLOCK_GET_CONFIG_COMPAT_SENTINEL, True)
    setattr(compatible_get_config, "_simpai_wrapped_get_config", current)
    gradio.blocks.Block.get_config = compatible_get_config


def apply_gradio6_runtime_patches() -> None:
    patch_gradio_asset_file_response()


def describe_gradio_runtime_patches() -> dict:
    readers = _discover_gradio_js_patch_readers()
    entries = []
    for asset_name, reader in sorted(readers.items()):
        if reader is _read_patched_app_tree_asset:
            patch_name = "app_tree"
        elif reader is _read_patched_image_drop_asset:
            patch_name = "image_drop_replace"
        elif reader is _read_patched_connection_reload_asset:
            patch_name = "connection_reload"
        elif reader is _read_patched_gradio_js_asset:
            patch_name = "combined"
        else:
            patch_name = getattr(reader, "__name__", "unknown")
        entries.append({"asset": asset_name, "patch": patch_name, "reader": getattr(reader, "__name__", "")})

    return {
        "gradio_version": getattr(gradio, "__version__", "0"),
        "disabled": {
            "all": _env_flag_enabled("SIMPAI_DISABLE_GRADIO_ASSET_PATCHES"),
            "app_tree": _app_tree_patch_disabled(),
            "image_drop_replace": _image_drop_patch_disabled(),
            "connection_reload": _connection_reload_patch_disabled(),
        },
        "patch_count": len(entries),
        "patches": entries,
    }
