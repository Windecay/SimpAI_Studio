#!/usr/bin/env node

import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";

const DEFAULT_BASE_URL = "http://127.0.0.1:8190/?__theme=dark";
const NATIVE_DRAG_ORIGINAL_URL_TYPE = "application/x-simpleai-gallery-original-url";
const NATIVE_DRAG_IMAGE_SELECTOR = [
  "#finished_gallery img",
  "#final_gallery img",
  "#preview_generating img",
].join(", ");

const SELECTORS = Object.freeze({
  finishedCatalog: "#finished_images_catalog",
  preview: "#preview_generating",
  welcomePlaceholder: "#simpleai_gallery_welcome_guard_placeholder",
  finishedGallery: "#finished_gallery",
  finalGallery: "#final_gallery",
  videoPlayer: "#video_player",
  progressVideo: "#progress_video",
  comparisonBox: "#comparison_box",
  galleryToolbar: "#gallery_browser_toolbar",
  galleryFolder: "#gallery_browser_folder",
  galleryFolderGroup: "#gallery_browser_folder_group",
  galleryStatus: "#gallery_browser_status",
  galleryPrevFolderButton: "#gallery_browser_prev_folder_btn",
  galleryNextFolderButton: "#gallery_browser_next_folder_btn",
  galleryRefreshButton: "#gallery_browser_refresh_btn",
  galleryMoreButton: "#gallery_browser_more_btn",
  galleryImagesButton: "#gallery_images_btn",
  galleryVideosButton: "#gallery_videos_btn",
  galleryMediaSwitchRow: "#gallery_media_switch_row",
  galleryPayloadBridge: "#gallery_browser_payload",
  galleryStateBridge: "#gallery_browser_state",
  galleryMediaSwitchRequest: "#gallery_media_switch_request",
  galleryBrowserLoadButton: "#gallery_browser_load_btn",
  galleryIndexBridge: "#gallery_index_bridge",
  galleryIndexStat: "#gallery_index_stat",
  compareButton: "#compare_btn",
  generateButton: "#generate_button",
  sceneCanvas: "#scene_canvas",
  imageToolbox: "#image_toolbox",
  promptInfoBox: "#prompt_info_box",
  scenePanel: "#scene_panel",
  sceneVideoDuration: "#scene_video_duration",
  gradioStatusMonitor: "#gradio-status-monitor",
  progressBar: "#progress-bar",
});

const GRADIO6_DOM_CONTRACT = Object.freeze({
  copiedFor: "SimpAI gallery health check",
  gradioRuntime: "6.x",
  accordion: {
    root: "#finished_images_catalog",
    label: ":scope > button.label-wrap, button.label-wrap, summary, [role='button']",
    openSignals: ["aria-expanded=true", ".open", "open"],
  },
  dropdown: {
    root: "#gallery_browser_folder",
    controls: "select, input, button, [role='combobox']",
    optionList: "[role='option'], [data-value], .dropdown-item, .option, li",
  },
  gallery: {
    media: "img, video, canvas, .gallery-item, .thumbnail-item, button.thumbnail-item",
    preview: ".gallery-container > .preview, .preview",
    grid: ".grid-wrap, .thumbnails, .gallery, [role='list']",
  },
  progress: {
    status: "#gradio-status-monitor",
    bar: "#progress-bar",
  },
});

const GRADIO6_COMPONENT_CONTRACT = Object.freeze({
  requiredElemIds: [
    "finished_images_catalog",
    "preview_generating",
    "finished_gallery",
    "final_gallery",
    "video_player",
    "gallery_browser_folder",
    "gallery_browser_status",
    "gallery_browser_prev_folder_btn",
    "gallery_browser_next_folder_btn",
    "gallery_browser_refresh_btn",
    "gallery_browser_more_btn",
    "gallery_images_btn",
    "gallery_videos_btn",
    "gallery_browser_payload",
    "gallery_browser_state",
    "gallery_media_switch_request",
    "gallery_browser_load_btn",
    "scene_panel",
    "scene_video_duration",
  ],
  expectedTypeByElemId: {
    finished_images_catalog: ["accordion"],
    preview_generating: ["image"],
    finished_gallery: ["gallery"],
    final_gallery: ["gallery"],
    video_player: ["video"],
    gallery_browser_folder: ["dropdown"],
    gallery_browser_status: ["markdown"],
    gallery_browser_prev_folder_btn: ["button"],
    gallery_browser_next_folder_btn: ["button"],
    gallery_browser_refresh_btn: ["button"],
    gallery_browser_more_btn: ["button"],
    gallery_images_btn: ["button"],
    gallery_videos_btn: ["button"],
    gallery_browser_payload: ["textbox"],
    gallery_browser_state: ["textbox"],
    gallery_media_switch_request: ["textbox"],
    gallery_browser_load_btn: ["button"],
    scene_video_duration: ["slider"],
  },
});

const GRADIO6_EVENT_CONTRACT = Object.freeze({
  expectedEvents: [
    { elem_id: "gallery_images_btn", event: "click", queue: false, showProgress: false },
    { elem_id: "gallery_videos_btn", event: "click", queue: false, showProgress: false },
    { elem_id: "gallery_browser_load_btn", event: "click", queue: false, showProgress: false },
    { elem_id: "gallery_browser_folder", event: "change", queue: false, showProgress: false },
    { elem_id: "gallery_browser_prev_folder_btn", event: "click", queue: false, showProgress: false },
    { elem_id: "gallery_browser_next_folder_btn", event: "click", queue: false, showProgress: false },
    { elem_id: "gallery_browser_refresh_btn", event: "click", queue: false, showProgress: false },
    { elem_id: "gallery_browser_more_btn", event: "click", queue: false, showProgress: false },
  ],
});

const FOLDER_MATRIX_FIELDS = Object.freeze([
  "folder",
  "mode",
  "catalogTotal",
  "statusCount",
  "runtimeLoaded",
  "renderedVisibleMediaCount",
  "galleryState",
  "openFolderStateFolder",
  "openFolderSelectedPathFolder",
  "openFolderFirstPathFolder",
  "settled",
  "status",
]);

const WEBUI_GALLERY_SOURCE_CONTRACT = Object.freeze({
  defaultPath: "webui.py",
  components: [
    { elem_id: "gallery_images_btn", declaration: "gallery_images_btn = gr.Button", requiredSnippets: ['elem_id="gallery_images_btn"'] },
    { elem_id: "gallery_videos_btn", declaration: "gallery_videos_btn = gr.Button", requiredSnippets: ['elem_id="gallery_videos_btn"'] },
    { elem_id: "gallery_browser_payload", declaration: "gallery_browser_payload = gr.Textbox", requiredSnippets: ["visible=True", "sai-gradio-hidden-bridge"] },
    { elem_id: "gallery_browser_state", declaration: "gallery_browser_state = gr.Textbox", requiredSnippets: ["visible=True", "sai-gradio-hidden-bridge"] },
    { elem_id: "gallery_media_switch_request", declaration: "gallery_media_switch_request = gr.Textbox", requiredSnippets: ["visible=True", "sai-gradio-hidden-bridge"] },
    { elem_id: "gallery_browser_load_btn", declaration: "gallery_browser_load_btn = gr.Button", requiredSnippets: ["visible=True", "sai-gradio-hidden-bridge"] },
    { elem_id: "gallery_browser_folder", declaration: "gallery_browser_folder =", requiredSnippets: ['elem_id="gallery_browser_folder"'] },
    { elem_id: "gallery_browser_prev_folder_btn", declaration: "gallery_browser_prev_folder_btn =", requiredSnippets: ['elem_id="gallery_browser_prev_folder_btn"'] },
    { elem_id: "gallery_browser_next_folder_btn", declaration: "gallery_browser_next_folder_btn =", requiredSnippets: ['elem_id="gallery_browser_next_folder_btn"'] },
    { elem_id: "gallery_browser_refresh_btn", declaration: "gallery_browser_refresh_btn =", requiredSnippets: ['elem_id="gallery_browser_refresh_btn"'] },
    { elem_id: "gallery_browser_more_btn", declaration: "gallery_browser_more_btn =", requiredSnippets: ['elem_id="gallery_browser_more_btn"'] },
  ],
  callbacks: [
    {
      code: "gallery-images-click",
      elem_id: "gallery_images_btn",
      event: "click",
      anchor: "gallery_images_btn.click(",
      lookaheadLines: 2,
      queue: false,
      showProgress: false,
      requiredSnippets: [
        "gallery_util.switch_gallery_engine_type(\"image\"",
        "inputs=[gallery_media_switch_request, image_tools_checkbox, state_topbar]",
        "gallery_browser_state",
        "state_topbar",
        "gallery_index_stat",
        "beginGalleryMediaSwitchRequest(\"image\"",
        "isGalleryMediaSwitchModeCurrent(\"image\"",
        "syncFinishedGalleryBrowserAfterMediaSwitch(browserState,x,\"image\"",
      ],
    },
    {
      code: "gallery-videos-click",
      elem_id: "gallery_videos_btn",
      event: "click",
      anchor: "gallery_videos_btn.click(",
      lookaheadLines: 2,
      queue: false,
      showProgress: false,
      requiredSnippets: [
        "gallery_util.switch_gallery_engine_type(\"video\"",
        "inputs=[gallery_media_switch_request, image_tools_checkbox, state_topbar]",
        "gallery_browser_state",
        "state_topbar",
        "gallery_index_stat",
        "beginGalleryMediaSwitchRequest(\"video\"",
        "isGalleryMediaSwitchModeCurrent(\"video\"",
        "syncFinishedGalleryBrowserAfterMediaSwitch(browserState,x,\"video\"",
      ],
    },
    {
      code: "gallery-browser-load-click",
      elem_id: "gallery_browser_load_btn",
      event: "click",
      anchor: "gallery_browser_load_btn.click(",
      lookaheadLines: 1,
      queue: false,
      showProgress: false,
      requiredSnippets: [
        "gallery_util.load_main_gallery_browser_page",
        "inputs=[gallery_browser_payload, image_tools_checkbox, state_topbar]",
        "gallery_browser_state",
        "state_topbar",
        "gallery_index_stat",
        "markFinishedGalleryBrowserLoading()",
      ],
    },
    {
      code: "gallery-browser-load-after",
      elem_id: "gallery_browser_load_btn",
      event: "then",
      anchor: "gallery_browser_load_evt.then(",
      lookaheadLines: 1,
      queue: false,
      showProgress: false,
      requiredSnippets: [
        "inputs=[gallery_browser_state, gallery_index_stat, state_topbar]",
        "mergeSimpleAITopbarSystemParamsForGallery",
        "syncFinishedGalleryBrowserAfterLoad(x)",
        "applied===false",
        "refresh_finished_images_catalog_label(stat",
      ],
    },
    {
      code: "gallery-folder-change",
      elem_id: "gallery_browser_folder",
      event: "change",
      anchor: "gallery_browser_folder.change(",
      lookaheadLines: 2,
      queue: false,
      showProgress: false,
      requiredSnippets: [
        "gallery_util.load_main_gallery_browser_folder",
        "inputs=[gallery_browser_folder, image_tools_checkbox, state_topbar]",
        "gallery_browser_outputs",
        "beginFinishedGalleryBrowserNativeRequest",
        "syncFinishedGalleryBrowserAfterNativeLoad",
        "applied===false",
      ],
    },
    {
      code: "gallery-folder-prev-click",
      elem_id: "gallery_browser_prev_folder_btn",
      event: "click",
      anchor: "gallery_browser_prev_folder_btn.click(",
      lookaheadLines: 2,
      queue: false,
      showProgress: false,
      requiredSnippets: ["gallery_util.previous_main_gallery_browser_folder", "gallery_browser_outputs", "beginFinishedGalleryBrowserNativeRequest", "syncFinishedGalleryBrowserAfterNativeLoad", "applied===false"],
    },
    {
      code: "gallery-folder-next-click",
      elem_id: "gallery_browser_next_folder_btn",
      event: "click",
      anchor: "gallery_browser_next_folder_btn.click(",
      lookaheadLines: 2,
      queue: false,
      showProgress: false,
      requiredSnippets: ["gallery_util.next_main_gallery_browser_folder", "gallery_browser_outputs", "beginFinishedGalleryBrowserNativeRequest", "syncFinishedGalleryBrowserAfterNativeLoad", "applied===false"],
    },
    {
      code: "gallery-refresh-click",
      elem_id: "gallery_browser_refresh_btn",
      event: "click",
      anchor: "gallery_browser_refresh_btn.click(",
      lookaheadLines: 2,
      queue: false,
      showProgress: false,
      requiredSnippets: ["gallery_util.refresh_main_gallery_browser", "gallery_browser_outputs", "beginFinishedGalleryBrowserNativeRequest", "syncFinishedGalleryBrowserAfterNativeLoad", "applied===false"],
    },
    {
      code: "gallery-more-click",
      elem_id: "gallery_browser_more_btn",
      event: "click",
      anchor: "gallery_browser_more_btn.click(",
      lookaheadLines: 2,
      queue: false,
      showProgress: false,
      requiredSnippets: ["gallery_util.load_more_main_gallery_browser", "gallery_browser_outputs", "beginFinishedGalleryBrowserNativeRequest", "syncFinishedGalleryBrowserAfterNativeLoad", "applied===false"],
    },
    {
      code: "open-folder-button-click",
      elem_id: "open_folder_btn",
      event: "click",
      anchor: "open_folder_btn.click(",
      lookaheadLines: 1,
      queue: null,
      showProgress: false,
      requiredSnippets: ["toolbox.open_output_folder", "inputs=state_topbar", "outputs=[open_folder_btn]", "show_progress=False"],
    },
  ],
});

const TOOLBOX_GALLERY_SOURCE_CONTRACT = Object.freeze({
  defaultPath: "enhanced/toolbox.py",
  backend: [
    {
      code: "open-output-folder-current-gallery-folder",
      functionName: "open_output_folder",
      anchor: "def open_output_folder(state_params):",
      lookaheadLines: 80,
      requiredSnippets: [
        "local_access = state_params.get(\"local_access\", False)",
        "return skip_update()",
        "output_dir = config.get_user_path_outputs(user_did)",
        "if state_params.get(\"gallery_state\") == \"main_browser\":",
        "state_params.get(\"__main_gallery_browser_folder\")",
        "selected_path = gallery.get_main_gallery_browser_selected_path(state_params)",
        "os.path.basename(os.path.dirname(selected_path))",
        "if current_folder:",
        "current_folder if current_folder.startswith(\"20\") else \"20{}\".format(current_folder)",
        "output_list = state_params.get(\"__output_list\", [])",
        "os.startfile(output_dir)",
      ],
      orderedSnippets: [
        "if state_params.get(\"gallery_state\") == \"main_browser\":",
        "selected_path = gallery.get_main_gallery_browser_selected_path(state_params)",
        "if current_folder:",
        "output_list = state_params.get(\"__output_list\", [])",
      ],
    },
  ],
});

const IMAGEVIEWER_NATIVE_DRAG_SOURCE_CONTRACT = Object.freeze({
  defaultPath: "javascript/imageviewer.js",
  rows: [
    {
      code: "native-drag-original-url-type",
      anchor: "SIMPLEAI_GALLERY_ORIGINAL_DRAG_URL_TYPE",
      lookaheadLines: 1,
      requiredSnippets: [NATIVE_DRAG_ORIGINAL_URL_TYPE],
    },
    {
      code: "native-drag-image-selector",
      anchor: "SIMPLEAI_GALLERY_NATIVE_DRAG_IMAGE_SELECTOR",
      lookaheadLines: 28,
      requiredSnippets: ["'#preview_generating img'", "'#finished_gallery img'", "'#final_gallery img'", "'#comparison_box img'"],
    },
    {
      code: "native-drag-large-image-threshold",
      anchor: "SIMPLEAI_GALLERY_LARGE_NATIVE_DRAG_PIXEL_LIMIT",
      lookaheadLines: 2,
      requiredSnippets: [
        "const SIMPLEAI_GALLERY_LARGE_NATIVE_DRAG_PIXEL_LIMIT = 2000000",
        "const SIMPLEAI_GALLERY_LARGE_NATIVE_DRAG_EDGE_LIMIT = 2048",
      ],
    },
    {
      code: "native-drag-image-source",
      anchor: "function simpleaiEnableNativeGalleryImageDrag(img)",
      lookaheadLines: 18,
      requiredSnippets: [
        "img.setAttribute('draggable', 'true')",
        "img.dataset.simpleaiGalleryNativeDragImage = '1'",
      ],
      forbiddenSnippets: ["setDragImage", "clearData", "DownloadURL"],
    },
    {
      code: "native-drag-original-payload",
      anchor: "function simpleaiHandleGalleryNativeDragStart(event)",
      lookaheadLines: 70,
      requiredSnippets: [
        "simpleaiSetGalleryDragTransferData(transfer, SIMPLEAI_GALLERY_ORIGINAL_DRAG_URL_TYPE, url)",
        "simpleaiSetGalleryDragTransferData(transfer, 'text/uri-list', url)",
        "simpleaiSetGalleryDragTransferData(transfer, 'text/plain', url)",
        "if (previewOriginalSrc || largeOriginalDownload)",
        "diagnostic.download_url = simpleaiSetGalleryPreviewOriginalDownload(transfer, url)",
        "window.SimpAIStudioPerformance?.mark('gallery.native_drag_start', diagnostic)",
      ],
      forbiddenSnippets: ["clearData", "setDragImage", "preventDefault", "stopPropagation"],
    },
    {
      code: "native-drag-preview-original-download",
      anchor: "function simpleaiSetGalleryPreviewOriginalDownload(transfer, originalSrc)",
      lookaheadLines: 8,
      requiredSnippets: [
        "simpleaiGalleryImageFileName(originalSrc)",
        "simpleaiGalleryImageMimeType(originalSrc)",
        "simpleaiSetGalleryDragTransferData(transfer, 'DownloadURL', `${mimeType}:${fileName}:${originalSrc}`)",
      ],
      forbiddenSnippets: ["clearData", "setDragImage", "preventDefault", "stopPropagation"],
    },
    {
      code: "native-drag-sync",
      anchor: "function simpleaiSyncGalleryNativeDragImages()",
      lookaheadLines: 18,
      requiredSnippets: [
        "querySelectorAll?.('.simpleai-gallery-external-drag-handle').forEach((handle) => handle.remove())",
        "document.getElementById('simpleai-gallery-external-drag-style')?.remove()",
        "forEach(simpleaiEnableNativeGalleryImageDrag)",
      ],
      forbiddenSnippets: ["createElement", "appendChild"],
    },
    {
      code: "native-drag-event-listeners",
      anchor: "document.addEventListener('dragstart', simpleaiHandleGalleryNativeDragStart, true);",
      lookaheadLines: 34,
      requiredSnippets: [
        "document.addEventListener('dragend', simpleaiHandleGalleryNativeDragEnd, true);",
        "document.addEventListener('drop', simpleaiHandleGalleryNativeDragEnd, true);",
        "onAfterUiUpdate(simpleaiScheduleGalleryNativeDragImageSync);",
      ],
      forbiddenSnippets: [
        "simpleaiHandleGalleryPointerDragDown",
        "simpleaiHandleGalleryPointerDragMove",
        "simpleaiHandleGalleryPointerDragUp",
        "simpleaiHandleGalleryPointerDragCancel",
        "simpleaiCancelNativeGalleryImageDrag",
        "simpleaiPrepareGalleryNativeDragImage",
      ],
    },
    {
      code: "native-drag-no-custom-machinery",
      anchor: "SIMPLEAI_GALLERY_NATIVE_DRAG_IMAGE_SELECTOR",
      lookaheadLines: 1800,
      requiredSnippets: [],
      forbiddenSnippets: [
        "setDragImage(",
        "transfer.clearData(",
        "new DataTransfer(",
        "simpleaiCreateGalleryPointerDragPreview",
        "simpleaiEnsureGalleryExternalDragHandle",
        "simpleaiHandleGalleryPointerDragMove",
        "setPointerCapture(",
      ],
    },
  ],
});

const EXIT_CODES = Object.freeze({
  ok: 0,
  liveFailure: 1,
  toolOrEnvironmentError: 2,
});

const env = process.env;
const config = Object.freeze({
  baseUrl: env.SIMPAI_BASE_URL || DEFAULT_BASE_URL,
  headless: !/^(0|false|no)$/i.test(env.SIMPAI_HEADLESS || "1"),
  screenshotDir: env.SIMPAI_SMOKE_SCREENSHOT_DIR || "",
  slowMo: parseIntValue(env.SIMPAI_SLOWMO, 0),
  timeoutMs: parseIntValue(env.SIMPAI_TIMEOUT_MS, 45000),
  waitForServerMs: parseIntValue(env.SIMPAI_GALLERY_HEALTH_WAIT_FOR_SERVER_MS, 0),
  eventLogLimit: parseIntValue(env.SIMPAI_GALLERY_HEALTH_EVENT_LOG_LIMIT, 600),
  sampleMs: parseIntValue(env.SIMPAI_GALLERY_HEALTH_SAMPLE_MS, 80),
  settleMs: parseIntValue(env.SIMPAI_GALLERY_HEALTH_SETTLE_MS, 900),
  guardMaxMs: parseIntValue(env.SIMPAI_GALLERY_HEALTH_GUARD_MAX_MS, 8500),
  initialGuardMs: parseIntValue(env.SIMPAI_GALLERY_HEALTH_INITIAL_GUARD_MS, 10000),
  reloadGuardMs: parseIntValue(env.SIMPAI_GALLERY_HEALTH_RELOAD_GUARD_MS || env.SIMPAI_GALLERY_HEALTH_INITIAL_GUARD_MS, 10000),
  guardHoldMaxMs: parseIntValue(env.SIMPAI_GALLERY_HEALTH_GUARD_HOLD_MAX_MS, 350),
  maxPreviewTransitions: parseIntValue(env.SIMPAI_GALLERY_HEALTH_MAX_PREVIEW_TRANSITIONS, 3),
  maxModeTransitions: parseIntValue(env.SIMPAI_GALLERY_HEALTH_MAX_MODE_TRANSITIONS, 2),
  maxMutationCount: parseIntValue(env.SIMPAI_GALLERY_HEALTH_MAX_MUTATIONS, 400),
  previewLayoutMaxHeight: parseIntValue(env.SIMPAI_GALLERY_HEALTH_PREVIEW_LAYOUT_MAX_HEIGHT, 8),
  thumbnailCenterMaxDeltaPx: parseIntValue(env.SIMPAI_GALLERY_HEALTH_THUMBNAIL_CENTER_MAX_DELTA_PX, 18),
  thumbnailNarrowViewportWidth: parseIntValue(env.SIMPAI_GALLERY_HEALTH_THUMBNAIL_NARROW_VIEWPORT_WIDTH, 420),
  thumbnailNarrowViewportHeight: parseIntValue(env.SIMPAI_GALLERY_HEALTH_THUMBNAIL_NARROW_VIEWPORT_HEIGHT, 900),
  folderLimit: parseIntValue(env.SIMPAI_GALLERY_HEALTH_FOLDER_LIMIT, 6),
  rounds: parseIntValue(env.SIMPAI_GALLERY_HEALTH_ROUNDS, 2),
  rapidRounds: parseIntValue(env.SIMPAI_GALLERY_HEALTH_RAPID_ROUNDS, 6),
  rapidDelayMs: parseIntValue(env.SIMPAI_GALLERY_HEALTH_RAPID_DELAY_MS, 90),
  failOnWarn: /^(1|true|yes|on)$/i.test(env.SIMPAI_GALLERY_HEALTH_FAIL_ON_WARN || ""),
  requireFullCoverage: /^(1|true|yes|on)$/i.test(env.SIMPAI_GALLERY_HEALTH_REQUIRE_FULL_COVERAGE || ""),
  dryRun: /^(1|true|yes|on)$/i.test(env.SIMPAI_GALLERY_HEALTH_DRY_RUN || ""),
  selfTest: /^(1|true|yes|on)$/i.test(env.SIMPAI_GALLERY_HEALTH_SELF_TEST || ""),
  fixtureOutputsRoot: env.SIMPAI_GALLERY_HEALTH_FIXTURE_OUTPUTS || "",
  fixtureEmptyFolder: env.SIMPAI_GALLERY_HEALTH_FIXTURE_EMPTY_FOLDER || "2099-01-01",
  fixtureImageFolder: env.SIMPAI_GALLERY_HEALTH_FIXTURE_IMAGE_FOLDER || "2099-01-02",
  fixtureMixedFolder: env.SIMPAI_GALLERY_HEALTH_FIXTURE_MIXED_FOLDER || "2099-01-03",
  fixturePagedFolder: env.SIMPAI_GALLERY_HEALTH_FIXTURE_PAGED_FOLDER || "2099-01-04",
  targetFolders: parseSelectorList(env.SIMPAI_GALLERY_HEALTH_TARGET_FOLDERS || "2026-06-11"),
  fixtureVideoSource: env.SIMPAI_GALLERY_HEALTH_FIXTURE_VIDEO_SOURCE || "comfy/input/mask.mp4",
  realInputImage: env.SIMPAI_GALLERY_HEALTH_REAL_INPUT_IMAGE || "",
  runRealGenerationCompare: /^(1|true|yes|on)$/i.test(env.SIMPAI_GALLERY_HEALTH_RUN_REAL_GENERATION_COMPARE || ""),
  generationTimeoutMs: parseIntValue(env.SIMPAI_GALLERY_HEALTH_GENERATION_TIMEOUT_MS, 180000),
  webuiSourcePath: env.SIMPAI_GALLERY_HEALTH_WEBUI_SOURCE || WEBUI_GALLERY_SOURCE_CONTRACT.defaultPath,
  toolboxSourcePath: env.SIMPAI_GALLERY_HEALTH_TOOLBOX_SOURCE || TOOLBOX_GALLERY_SOURCE_CONTRACT.defaultPath,
  imageviewerSourcePath: env.SIMPAI_GALLERY_HEALTH_IMAGEVIEWER_SOURCE || IMAGEVIEWER_NATIVE_DRAG_SOURCE_CONTRACT.defaultPath,
  nativeDragSelector: env.SIMPAI_GALLERY_HEALTH_NATIVE_DRAG_SELECTOR || NATIVE_DRAG_IMAGE_SELECTOR,
  nativeDragIterations: parseIntValue(env.SIMPAI_GALLERY_HEALTH_NATIVE_DRAG_ITERATIONS, 3),
  nativeDragCandidateLimit: parseIntValue(env.SIMPAI_GALLERY_HEALTH_NATIVE_DRAG_CANDIDATE_LIMIT, 8),
  nativeDragLive: !/^(0|false|no)$/i.test(env.SIMPAI_GALLERY_HEALTH_NATIVE_DRAG_LIVE || "1"),
  nativeDragCaseTimeoutMs: parseIntValue(env.SIMPAI_GALLERY_HEALTH_NATIVE_DRAG_CASE_TIMEOUT_MS, 3500),
  actionTimeoutMs: parseIntValue(env.SIMPAI_GALLERY_HEALTH_ACTION_TIMEOUT_MS, 15000),
  allowPayloadBridgeFallback: /^(1|true|yes)$/i.test(env.SIMPAI_GALLERY_HEALTH_ALLOW_PAYLOAD_BRIDGE_FALLBACK || "0"),
  reportPath: env.SIMPAI_GALLERY_HEALTH_REPORT || "",
  summaryPath: env.SIMPAI_GALLERY_HEALTH_SUMMARY || "",
  keepSamples: !/^(0|false|no)$/i.test(env.SIMPAI_GALLERY_HEALTH_KEEP_SAMPLES || "1"),
  playwrightChannel: env.SIMPAI_PLAYWRIGHT_CHANNEL || "",
  presetSelectors: parseSelectorList(
    env.SIMPAI_GALLERY_HEALTH_PRESET_SELECTORS ||
      [env.SIMPAI_PRESET_BASE_SELECTOR, env.SIMPAI_PRESET_ALT_SELECTOR].filter(Boolean).join(",")
  ),
});

class HealthSkip extends Error {
  constructor(message) {
    super(message);
    this.name = "HealthSkip";
  }
}

class HealthPreflightError extends Error {
  constructor(preflight) {
    super(preflight?.lastError || "Gallery health preflight failed.");
    this.name = "HealthPreflightError";
    this.preflight = preflight || null;
  }
}

function parseIntValue(value, fallback) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseSelectorList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const FIXTURE_PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

async function writeFileIfMissing(filePath, bytes) {
  try {
    await fs.writeFile(filePath, bytes, { flag: "wx" });
    return true;
  } catch (error) {
    if (error && error.code === "EEXIST") return false;
    throw error;
  }
}

async function copyFileIfMissing(sourcePath, targetPath) {
  try {
    await fs.copyFile(sourcePath, targetPath, fsConstants.COPYFILE_EXCL);
    return true;
  } catch (error) {
    if (error && error.code === "EEXIST") return false;
    throw error;
  }
}

async function countFixtureFiles(folderPath) {
  const entries = await fs.readdir(folderPath, { withFileTypes: true }).catch(() => []);
  const counts = { images: 0, videos: 0, total: 0 };
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) counts.images += 1;
    if ([".mp4", ".webm", ".mov", ".mkv"].includes(ext)) counts.videos += 1;
  }
  counts.total = counts.images + counts.videos;
  return counts;
}

async function prepareGalleryHealthFixtures() {
  if (!config.fixtureOutputsRoot) {
    return {
      enabled: false,
      reason: "SIMPAI_GALLERY_HEALTH_FIXTURE_OUTPUTS not set",
    };
  }
  const root = path.resolve(config.fixtureOutputsRoot);
  const emptyFolderName = config.fixtureEmptyFolder;
  const imageFolderName = config.fixtureImageFolder;
  const mixedFolderName = config.fixtureMixedFolder;
  const pagedFolderName = config.fixturePagedFolder;
  const emptyFolderPath = path.join(root, emptyFolderName);
  const imageFolderPath = path.join(root, imageFolderName);
  const mixedFolderPath = path.join(root, mixedFolderName);
  const pagedFolderPath = path.join(root, pagedFolderName);
  await fs.mkdir(emptyFolderPath, { recursive: true });
  await fs.mkdir(imageFolderPath, { recursive: true });
  await fs.mkdir(mixedFolderPath, { recursive: true });
  await fs.mkdir(pagedFolderPath, { recursive: true });
  const imageFiles = [
    path.join(imageFolderPath, "simpai_gallery_health_fixture_001.png"),
    path.join(imageFolderPath, "simpai_gallery_health_fixture_002.png"),
  ];
  const createdFiles = [];
  for (const filePath of imageFiles) {
    const created = await writeFileIfMissing(filePath, FIXTURE_PNG_BYTES);
    if (created) createdFiles.push(filePath);
  }
  const mixedImageFiles = [
    path.join(mixedFolderPath, "simpai_gallery_health_fixture_mixed_001.png"),
    path.join(mixedFolderPath, "simpai_gallery_health_fixture_mixed_002.png"),
    path.join(mixedFolderPath, "simpai_gallery_health_fixture_mixed_003.png"),
  ];
  for (const filePath of mixedImageFiles) {
    const created = await writeFileIfMissing(filePath, FIXTURE_PNG_BYTES);
    if (created) createdFiles.push(filePath);
  }
  const pagedImageFiles = Array.from({ length: 40 }, (_, index) =>
    path.join(pagedFolderPath, `simpai_gallery_health_fixture_page_${String(index + 1).padStart(3, "0")}.png`)
  );
  for (const filePath of pagedImageFiles) {
    const created = await writeFileIfMissing(filePath, FIXTURE_PNG_BYTES);
    if (created) createdFiles.push(filePath);
  }
  const videoSourcePath = resolveRepoPath(config.fixtureVideoSource);
  const videoWarnings = [];
  try {
    await fs.access(videoSourcePath);
    for (const name of ["simpai_gallery_health_fixture_video_001.mp4", "simpai_gallery_health_fixture_video_002.mp4"]) {
      const targetPath = path.join(mixedFolderPath, name);
      const created = await copyFileIfMissing(videoSourcePath, targetPath);
      if (created) createdFiles.push(targetPath);
    }
  } catch (error) {
    videoWarnings.push(`Fixture video source unavailable: ${videoSourcePath}`);
  }
  const emptyFolderCounts = await countFixtureFiles(emptyFolderPath);
  const imageFolderCounts = await countFixtureFiles(imageFolderPath);
  const mixedFolderCounts = await countFixtureFiles(mixedFolderPath);
  const pagedFolderCounts = await countFixtureFiles(pagedFolderPath);
  return {
    enabled: true,
    root,
    emptyFolder: emptyFolderName,
    imageFolder: imageFolderName,
    mixedFolder: mixedFolderName,
    pagedFolder: pagedFolderName,
    folderNames: [emptyFolderName, imageFolderName, mixedFolderName, pagedFolderName],
    emptyFolderPath,
    imageFolderPath,
    mixedFolderPath,
    pagedFolderPath,
    emptyFolderFileCount: emptyFolderCounts.total,
    imageFolderFileCount: imageFolderCounts.images,
    mixedFolderImageCount: mixedFolderCounts.images,
    mixedFolderVideoCount: mixedFolderCounts.videos,
    pagedFolderImageCount: pagedFolderCounts.images,
    expectedCounts: {
      [emptyFolderName]: { image: emptyFolderCounts.images, video: emptyFolderCounts.videos },
      [imageFolderName]: { image: imageFolderCounts.images, video: imageFolderCounts.videos },
      [mixedFolderName]: { image: mixedFolderCounts.images, video: mixedFolderCounts.videos },
      [pagedFolderName]: { image: pagedFolderCounts.images, video: pagedFolderCounts.videos },
    },
    videoSourcePath,
    createdFiles,
    warning: [emptyFolderCounts.total ? "Fixture empty folder is not empty." : "", ...videoWarnings].filter(Boolean).join(" "),
  };
}

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

function sourceLineForNeedle(lines, needle) {
  const index = lines.findIndex((line) => line.includes(needle));
  if (index < 0) return { lineNumber: 0, text: "" };
  return { lineNumber: index + 1, text: lines[index].trim() };
}

function sourceBlockForAnchor(lines, anchor, lookaheadLines = 1) {
  const index = lines.findIndex((line) => line.includes(anchor));
  if (index < 0) return { lineNumber: 0, text: "" };
  const end = Math.min(lines.length, index + Math.max(1, lookaheadLines));
  return {
    lineNumber: index + 1,
    text: lines.slice(index, end).map((line) => line.trim()).join(" "),
  };
}

function auditWebuiSourceText(source, sourcePath) {
  const lines = String(source || "").split(/\r?\n/);
  const componentRows = WEBUI_GALLERY_SOURCE_CONTRACT.components.map((component) => {
    const found = sourceLineForNeedle(lines, `elem_id="${component.elem_id}"`);
    const missingSnippets = [component.declaration, ...(component.requiredSnippets || [])].filter(
      (snippet) => snippet && !found.text.includes(snippet)
    );
    return {
      elem_id: component.elem_id,
      lineNumber: found.lineNumber,
      present: !!found.text,
      ok: !!found.text && missingSnippets.length === 0,
      missingSnippets,
      source: compactAsciiText(found.text, 520),
    };
  });
  const callbackRows = WEBUI_GALLERY_SOURCE_CONTRACT.callbacks.map((callback) => {
    const found = sourceBlockForAnchor(lines, callback.anchor, callback.lookaheadLines || 1);
    const queueOk = callback.queue === false ? /\bqueue\s*=\s*False\b/.test(found.text) : true;
    const showProgressOk = callback.showProgress === false ? /\bshow_progress\s*=\s*False\b/.test(found.text) : true;
    const missingSnippets = (callback.requiredSnippets || []).filter((snippet) => snippet && !found.text.includes(snippet));
    if (callback.queue === false && !queueOk) missingSnippets.push("queue=False");
    if (callback.showProgress === false && !showProgressOk) missingSnippets.push("show_progress=False");
    return {
      code: callback.code,
      elem_id: callback.elem_id,
      event: callback.event,
      lineNumber: found.lineNumber,
      present: !!found.text,
      queueOk,
      showProgressOk,
      ok: !!found.text && missingSnippets.length === 0,
      missingSnippets,
      source: compactAsciiText(found.text, 900),
    };
  });
  const missingComponents = componentRows.filter((row) => !row.ok).map((row) => row.elem_id);
  const missingCallbacks = callbackRows.filter((row) => !row.present).map((row) => row.code);
  const mismatchedCallbacks = callbackRows.filter((row) => row.present && !row.ok).map((row) => row.code);
  return {
    enabled: true,
    path: sourcePath,
    ok: missingComponents.length === 0 && missingCallbacks.length === 0 && mismatchedCallbacks.length === 0,
    sourceReadError: "",
    componentRows,
    callbackRows,
    missingComponents,
    missingCallbacks,
    mismatchedCallbacks,
    contract: WEBUI_GALLERY_SOURCE_CONTRACT,
  };
}

function auditToolboxSourceText(source, sourcePath) {
  const lines = String(source || "").split(/\r?\n/);
  const backendRows = TOOLBOX_GALLERY_SOURCE_CONTRACT.backend.map((contract) => {
    const found = sourceBlockForAnchor(lines, contract.anchor, contract.lookaheadLines || 1);
    const missingSnippets = (contract.requiredSnippets || []).filter((snippet) => snippet && !found.text.includes(snippet));
    const orderedSnippets = contract.orderedSnippets || [];
    let lastIndex = -1;
    const orderProblems = [];
    for (const snippet of orderedSnippets) {
      const index = found.text.indexOf(snippet);
      if (index < 0) continue;
      if (index < lastIndex) orderProblems.push(snippet);
      lastIndex = index;
    }
    for (const snippet of orderProblems) missingSnippets.push(`order:${snippet}`);
    return {
      code: contract.code,
      functionName: contract.functionName,
      lineNumber: found.lineNumber,
      present: !!found.text,
      ok: !!found.text && missingSnippets.length === 0,
      missingSnippets,
      source: compactAsciiText(found.text, 1200),
    };
  });
  const missingBackendContracts = backendRows.filter((row) => !row.ok).map((row) => row.code);
  return {
    path: sourcePath,
    ok: missingBackendContracts.length === 0,
    readError: "",
    backendRows,
    missingBackendContracts,
    contract: TOOLBOX_GALLERY_SOURCE_CONTRACT,
  };
}

function auditImageviewerSourceText(source, sourcePath) {
  const lines = String(source || "").split(/\r?\n/);
  const nativeDragRows = IMAGEVIEWER_NATIVE_DRAG_SOURCE_CONTRACT.rows.map((contract) => {
    const found = sourceBlockForAnchor(lines, contract.anchor, contract.lookaheadLines || 1);
    const missingSnippets = (contract.requiredSnippets || []).filter((snippet) => snippet && !found.text.includes(snippet));
    const forbiddenSnippetsPresent = (contract.forbiddenSnippets || []).filter((snippet) => snippet && found.text.includes(snippet));
    return {
      code: contract.code,
      lineNumber: found.lineNumber,
      present: !!found.text,
      ok: !!found.text && missingSnippets.length === 0 && forbiddenSnippetsPresent.length === 0,
      missingSnippets,
      forbiddenSnippetsPresent,
      source: compactAsciiText(found.text, 1200),
    };
  });
  const missingNativeDragContracts = nativeDragRows.filter((row) => !row.ok).map((row) => row.code);
  return {
    path: sourcePath,
    ok: missingNativeDragContracts.length === 0,
    readError: "",
    nativeDragRows,
    missingNativeDragContracts,
    contract: IMAGEVIEWER_NATIVE_DRAG_SOURCE_CONTRACT,
  };
}

async function readWebuiGallerySourceAudit() {
  const webuiSourcePath = resolveRepoPath(config.webuiSourcePath);
  const toolboxSourcePath = resolveRepoPath(config.toolboxSourcePath);
  const imageviewerSourcePath = resolveRepoPath(config.imageviewerSourcePath);
  let webuiAudit;
  try {
    const source = await fs.readFile(webuiSourcePath, "utf8");
    webuiAudit = auditWebuiSourceText(source, webuiSourcePath);
  } catch (error) {
    webuiAudit = {
      enabled: true,
      path: webuiSourcePath,
      ok: false,
      sourceReadError: error.message,
      componentRows: [],
      callbackRows: [],
      missingComponents: WEBUI_GALLERY_SOURCE_CONTRACT.components.map((component) => component.elem_id),
      missingCallbacks: WEBUI_GALLERY_SOURCE_CONTRACT.callbacks.map((callback) => callback.code),
      mismatchedCallbacks: [],
      contract: WEBUI_GALLERY_SOURCE_CONTRACT,
    };
  }
  let toolboxAudit;
  try {
    const source = await fs.readFile(toolboxSourcePath, "utf8");
    toolboxAudit = auditToolboxSourceText(source, toolboxSourcePath);
  } catch (error) {
    toolboxAudit = {
      path: toolboxSourcePath,
      ok: false,
      readError: error.message,
      backendRows: [],
      missingBackendContracts: TOOLBOX_GALLERY_SOURCE_CONTRACT.backend.map((contract) => contract.code),
      contract: TOOLBOX_GALLERY_SOURCE_CONTRACT,
    };
  }
  let imageviewerAudit;
  try {
    const source = await fs.readFile(imageviewerSourcePath, "utf8");
    imageviewerAudit = auditImageviewerSourceText(source, imageviewerSourcePath);
  } catch (error) {
    imageviewerAudit = {
      path: imageviewerSourcePath,
      ok: false,
      readError: error.message,
      nativeDragRows: [],
      missingNativeDragContracts: IMAGEVIEWER_NATIVE_DRAG_SOURCE_CONTRACT.rows.map((row) => row.code),
      contract: IMAGEVIEWER_NATIVE_DRAG_SOURCE_CONTRACT,
    };
  }
  return {
    ...webuiAudit,
    ok: !!webuiAudit.ok && !!toolboxAudit.ok && !!imageviewerAudit.ok,
    toolboxPath: toolboxAudit.path,
    toolboxReadError: toolboxAudit.readError,
    backendRows: toolboxAudit.backendRows,
    missingBackendContracts: toolboxAudit.missingBackendContracts,
    toolboxContract: TOOLBOX_GALLERY_SOURCE_CONTRACT,
    imageviewerPath: imageviewerAudit.path,
    imageviewerReadError: imageviewerAudit.readError,
    nativeDragRows: imageviewerAudit.nativeDragRows,
    missingNativeDragContracts: imageviewerAudit.missingNativeDragContracts,
    nativeDragContract: IMAGEVIEWER_NATIVE_DRAG_SOURCE_CONTRACT,
  };
}

function sourceAuditViolations(sourceAudit) {
  if (!sourceAudit || sourceAudit.enabled === false) return [];
  const violations = [];
  if (sourceAudit.sourceReadError) {
    violations.push(
      makeViolation("webui-source", "fail", "webui_gallery_source_read_error", "Could not read WebUI source for gallery callback audit", {
        path: sourceAudit.path,
        sourceReadError: sourceAudit.sourceReadError,
      })
    );
    return violations;
  }
  if (sourceAudit.toolboxReadError) {
    violations.push(
      makeViolation("toolbox-source", "fail", "toolbox_gallery_source_read_error", "Could not read toolbox source for open_output_folder audit", {
        path: sourceAudit.toolboxPath,
        sourceReadError: sourceAudit.toolboxReadError,
      })
    );
  }
  if (sourceAudit.imageviewerReadError) {
    violations.push(
      makeViolation("imageviewer-source", "fail", "imageviewer_native_drag_source_read_error", "Could not read imageviewer source for native drag audit", {
        path: sourceAudit.imageviewerPath,
        sourceReadError: sourceAudit.imageviewerReadError,
      })
    );
  }
  const badComponents = (sourceAudit.componentRows || []).filter((row) => !row.ok);
  if (badComponents.length) {
    violations.push(
      makeViolation("webui-source", "fail", "webui_gallery_component_contract_mismatch", "WebUI gallery component declarations no longer match the health contract", {
        path: sourceAudit.path,
        components: badComponents.map((row) => ({
          elem_id: row.elem_id,
          lineNumber: row.lineNumber,
          missingSnippets: row.missingSnippets,
          source: row.source,
        })),
      })
    );
  }
  const badCallbacks = (sourceAudit.callbackRows || []).filter((row) => !row.ok);
  if (badCallbacks.length) {
    violations.push(
      makeViolation("webui-source", "fail", "webui_gallery_callback_contract_mismatch", "WebUI gallery callback declarations no longer match the health contract", {
        path: sourceAudit.path,
        callbacks: badCallbacks.map((row) => ({
          code: row.code,
          elem_id: row.elem_id,
          event: row.event,
          lineNumber: row.lineNumber,
          missingSnippets: row.missingSnippets,
          source: row.source,
        })),
      })
    );
  }
  const badBackendRows = (sourceAudit.backendRows || []).filter((row) => !row.ok);
  if (badBackendRows.length) {
    violations.push(
      makeViolation("toolbox-source", "fail", "toolbox_open_output_folder_contract_mismatch", "open_output_folder no longer follows the current gallery folder contract", {
        path: sourceAudit.toolboxPath,
        backend: badBackendRows.map((row) => ({
          code: row.code,
          functionName: row.functionName,
          lineNumber: row.lineNumber,
          missingSnippets: row.missingSnippets,
          source: row.source,
        })),
      })
    );
  }
  const badNativeDragRows = (sourceAudit.nativeDragRows || []).filter((row) => !row.ok);
  if (badNativeDragRows.length) {
    violations.push(
      makeViolation("imageviewer-source", "fail", "imageviewer_native_drag_contract_mismatch", "Gallery images no longer match the native drag contract", {
        path: sourceAudit.imageviewerPath,
        nativeDragRows: badNativeDragRows.map((row) => ({
          code: row.code,
          lineNumber: row.lineNumber,
          missingSnippets: row.missingSnippets,
          forbiddenSnippetsPresent: row.forbiddenSnippetsPresent,
          source: row.source,
        })),
      })
    );
  }
  return violations;
}

function safeName(value) {
  return String(value || "empty")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "empty";
}

function compactText(value, max = 260) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function compactAsciiText(value, max = 260) {
  return compactText(value, max).replace(/[^\x20-\x7e]/g, "?");
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function probeHttpUrl(urlText, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(urlText);
    } catch (error) {
      resolve({ ok: false, status: 0, error: `invalid URL: ${error.message}` });
      return;
    }
    const client = url.protocol === "https:" ? https : http;
    const request = client.request(
      url,
      { method: "GET", timeout: timeoutMs },
      (response) => {
        response.resume();
        response.on("end", () => {
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 500,
            status: response.statusCode || 0,
            error: "",
          });
        });
      }
    );
    request.on("timeout", () => {
      request.destroy(new Error(`timeout after ${timeoutMs}ms`));
    });
    request.on("error", (error) => {
      resolve({ ok: false, status: 0, error: error.message });
    });
    request.end();
  });
}

async function waitForServerReady(urlText, waitMs) {
  const startedAt = Date.now();
  const deadline = startedAt + Math.max(0, Number(waitMs || 0));
  let attempt = 0;
  let last = null;
  do {
    attempt += 1;
    last = await probeHttpUrl(urlText);
    if (last.ok) {
      return {
        ok: true,
        skipped: false,
        url: urlText,
        waitBudgetMs: Math.max(0, Number(waitMs || 0)),
        attempts: attempt,
        waitedMs: Date.now() - startedAt,
        status: last.status,
        lastError: "",
      };
    }
    if (Date.now() >= deadline) break;
    await sleepMs(Math.min(1000, Math.max(100, deadline - Date.now())));
  } while (Date.now() <= deadline);
  return {
    ok: false,
    skipped: false,
    url: urlText,
    waitBudgetMs: Math.max(0, Number(waitMs || 0)),
    attempts: attempt,
    waitedMs: Date.now() - startedAt,
    status: last?.status || 0,
    lastError: last?.error || "server not reachable",
  };
}

function normalizeFolderValue(value) {
  const text = String(value || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!text) return "";
  return text.startsWith("20") ? text : `20${text}`;
}

function parseMediaCount(text) {
  const normalized = String(text || "").replace(/,/g, "");
  const matches = [...normalized.matchAll(/(\d+)\s*(?:张图片|张图|图片|items?|images?|videos?|个视频|视频)/gi)];
  if (!matches.length) return null;
  const parsed = Number.parseInt(matches[matches.length - 1][1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    const wrapped = new Error(
      [
        "Playwright is required for the gallery health check.",
        "Install locally with: npm install --no-save playwright",
        "If Chromium is missing, run: npx playwright install chromium",
        `Import error: ${error.message}`,
      ].join(" ")
    );
    wrapped.name = "HealthToolSetupError";
    wrapped.cause = error;
    throw wrapped;
  }
}

function browserLaunchOptions() {
  const options = { headless: config.headless, slowMo: config.slowMo };
  if (config.playwrightChannel) options.channel = config.playwrightChannel;
  return options;
}

async function writeReport(report) {
  if (!config.reportPath) return;
  await fs.mkdir(path.dirname(config.reportPath), { recursive: true });
  await fs.writeFile(config.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function summaryPathForReport() {
  if (config.summaryPath) return config.summaryPath;
  if (!config.reportPath) return "";
  const parsed = path.parse(config.reportPath);
  return path.join(parsed.dir, `${parsed.name}.md`);
}

function markdownList(items) {
  if (!items || !items.length) return "- none";
  return items.map((item) => `- ${String(item || "").replace(/\s+/g, " ").trim()}`).join("\n");
}

function markdownTable(headers, rows) {
  const safe = (value) => String(value ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
  const head = `| ${headers.map(safe).join(" |")} |`;
  const sep = `| ${headers.map(() => "---").join(" |")} |`;
  const body = rows.map((row) => `| ${headers.map((header) => safe(row[header])).join(" |")} |`);
  return [head, sep].concat(body.length ? body : [`| ${headers.map(() => "").join(" |")} |`]).join("\n");
}

function renderMarkdownSummary(report) {
  const readable = report.readableSummary || {};
  const summary = report.summary || {};
  const coverage = report.coverage || {};
  const global = report.global || {};
  const gradio = report.gradio || {};
  const sourceAudit = report.sourceAudit || {};
  const api = report.apiTimingSummary || {};
  const fixtures = report.fixtures || {};
  const preflight = report.preflight || {};
  const violations = report.violations || [];
  const coverageRows = (coverage.items || []).map((item) => ({
    code: item.code,
    status: item.status,
    required: item.required ? "yes" : "no",
    checks: (item.checks || []).map((check) => check.label).join(", "),
  }));
  const folderRows = (global.folderMatrix || []).slice(0, 40).map((row) => ({
    folder: row.folder,
    mode: row.mode,
    catalogTotal: row.catalogTotal,
    statusCount: row.statusCount,
    runtimeLoaded: row.runtimeLoaded,
    visible: row.renderedVisibleMediaCount,
    galleryState: row.galleryState,
    openFolderStateFolder: row.openFolderStateFolder,
    openFolderSelectedPathFolder: row.openFolderSelectedPathFolder,
    openFolderFirstPathFolder: row.openFolderFirstPathFolder,
    settled: row.settled ? "yes" : "no",
    status: row.status,
  }));
  const violationRows = violations.slice(0, 40).map((violation) => ({
    severity: violation.severity,
    code: violation.code,
    check: violation.check,
    message: violation.message,
  }));
  const eventRows = (report.checks || []).slice(0, 80).map((check) => ({
    check: check.label,
    events: check.eventLog?.count ?? 0,
    samples: check.sampleCount ?? 0,
    ended: check.endedReason || "",
    durationMs: check.durationMs ?? 0,
  }));
  const actionRows = (global.actionRecommendations || global.recommendations || []).slice(0, 40).map((item) => ({
    priority: item.priority || "",
    severity: item.severity || "",
    code: item.code || "",
    action: item.action || "",
    triggers: (item.triggerCodes || []).join(", "),
    checks: (item.checks || []).join(", "),
  }));
  const eventMissing = new Set((gradio.missingExpectedEvents || []).map((item) => `${item.elem_id}:${item.event}`));
  const eventSettingMismatch = new Map(
    (gradio.unexpectedEventSettings || []).map((item) => [`${item.elem_id}:${item.event}`, item])
  );
  const dependencyTargets = (dependency) => (dependency.targets || []).map((target) => `${target.elem_id || target.componentId}:${target.event || ""}`);
  const gradioEventRows = ((gradio.eventContract && gradio.eventContract.expectedEvents) || []).map((expected) => {
    const key = `${expected.elem_id}:${expected.event}`;
    const dependencyIndexes = (gradio.galleryDependencies || [])
      .filter((dependency) =>
        (dependency.targets || []).some((target) => target.elem_id === expected.elem_id && (!target.event || target.event === expected.event))
      )
      .map((dependency) => dependency.index);
    return {
      elem_id: expected.elem_id,
      event: expected.event,
      expectedQueue: String(expected.queue),
      expectedShowProgress: String(expected.showProgress),
      status: eventMissing.has(key) ? "missing" : eventSettingMismatch.has(key) ? "setting-mismatch" : "ok",
      dependencies: dependencyIndexes.join(", "),
    };
  });
  const gradioDependencyRows = (gradio.galleryDependencies || []).slice(0, 40).map((dependency) => ({
    index: dependency.index,
    targets: dependencyTargets(dependency).join(", "),
    inputs: (dependency.inputs || []).map((input) => input.elem_id || input.componentId).join(", "),
    outputs: (dependency.outputs || []).map((output) => output.elem_id || output.componentId).join(", "),
    queue: String(dependency.queue ?? ""),
    show_progress: String(dependency.show_progress ?? ""),
    api_name: dependency.api_name || "",
  }));
  const sourceComponentRows = (sourceAudit.componentRows || []).slice(0, 40).map((row) => ({
    kind: "component",
    code: row.elem_id,
    event: "",
    status: row.ok ? "ok" : row.present ? "mismatch" : "missing",
    line: row.lineNumber || "",
    missing: (row.missingSnippets || []).join(", "),
  }));
  const sourceCallbackRows = (sourceAudit.callbackRows || []).slice(0, 60).map((row) => ({
    kind: "callback",
    code: row.code,
    event: `${row.elem_id}:${row.event}`,
    status: row.ok ? "ok" : row.present ? "mismatch" : "missing",
    line: row.lineNumber || "",
    missing: (row.missingSnippets || []).join(", "),
  }));
  const sourceBackendRows = (sourceAudit.backendRows || []).slice(0, 20).map((row) => ({
    kind: "backend",
    code: row.code,
    event: row.functionName || "",
    status: row.ok ? "ok" : row.present ? "mismatch" : "missing",
    line: row.lineNumber || "",
    missing: (row.missingSnippets || []).join(", "),
  }));
  const sourceNativeDragRows = (sourceAudit.nativeDragRows || []).slice(0, 30).map((row) => ({
    kind: "native-drag",
    code: row.code,
    event: "",
    status: row.ok ? "ok" : row.present ? "mismatch" : "missing",
    line: row.lineNumber || "",
    missing: (row.missingSnippets || []).concat(row.forbiddenSnippetsPresent || []).join(", "),
  }));
  const nativeDragRows = (report.checks || [])
    .filter((check) => check.label === "gallery-native-drag-contract")
    .flatMap((check) => {
      const drag = check.drag || {};
      return [
        {
          check: check.label,
          candidates: (drag.candidates || []).length,
          syntheticRuns: (drag.runs || []).length,
          liveRuns: (drag.live || []).length,
          failures: (drag.failures || []).length + (drag.live || []).filter((row) => !row.ok).length,
          warnings: (drag.warnings || []).length,
          selector: drag.selector || "",
        },
      ];
    });
  return [
    "# Gradio6 Gallery Health Check",
    "",
    `- result: ${readable.result || (report.ok ? "pass" : "fail")}`,
    `- mode: ${report.mode || ""}`,
    `- exitCode: ${report.exitCode}`,
    `- generatedAt: ${report.generatedAt || ""}`,
    `- checks: ${summary.checkCount ?? 0}`,
    `- failures: ${summary.failCount ?? 0}`,
    `- warnings: ${summary.warnCount ?? 0}`,
    `- skipped: ${summary.skippedCount ?? 0}`,
    `- slowestApiMs: ${api.maxMs ?? 0}`,
    "",
    "## Preflight",
    "",
    `- status: ${preflight.skipped ? "skipped" : preflight.ok ? "ready" : "failed"}`,
    `- url: ${preflight.url || ""}`,
    `- waitBudgetMs: ${preflight.waitBudgetMs ?? ""}`,
    `- attempts: ${preflight.attempts ?? ""}`,
    `- waitedMs: ${preflight.waitedMs ?? ""}`,
    `- lastError: ${preflight.lastError || ""}`,
    "",
    "## Failed Checks",
    "",
    markdownList(readable.failedChecks || []),
    "",
    "## Warning Checks",
    "",
    markdownList(readable.warningChecks || []),
    "",
    "## Required Coverage Not Covered",
    "",
    markdownList(readable.requiredCoverageNotCovered || []),
    "",
    "## Recommendations",
    "",
    markdownList(readable.recommendations || []),
    "",
    "## Action Recommendations",
    "",
    markdownTable(["priority", "severity", "code", "action", "triggers", "checks"], actionRows),
    "",
    "## Gradio Event Contract",
    "",
    markdownTable(["elem_id", "event", "expectedQueue", "expectedShowProgress", "status", "dependencies"], gradioEventRows),
    "",
    "## Gradio Gallery Dependencies",
    "",
    markdownTable(["index", "targets", "inputs", "outputs", "queue", "show_progress", "api_name"], gradioDependencyRows),
    "",
    "## WebUI Source Audit",
    "",
    `- path: ${sourceAudit.path || ""}`,
    `- toolboxPath: ${sourceAudit.toolboxPath || ""}`,
    `- imageviewerPath: ${sourceAudit.imageviewerPath || ""}`,
    `- status: ${sourceAudit.ok ? "ok" : "failed"}`,
    `- readError: ${sourceAudit.sourceReadError || sourceAudit.toolboxReadError || sourceAudit.imageviewerReadError || ""}`,
    "",
    markdownTable(["kind", "code", "event", "status", "line", "missing"], sourceComponentRows.concat(sourceCallbackRows, sourceBackendRows, sourceNativeDragRows)),
    "",
    "## Native Drag",
    "",
    markdownTable(["check", "candidates", "syntheticRuns", "liveRuns", "failures", "warnings", "selector"], nativeDragRows),
    "",
    "## Fixtures",
    "",
    `- enabled: ${fixtures.enabled ? "yes" : "no"}`,
    `- root: ${fixtures.root || ""}`,
    `- emptyFolder: ${fixtures.emptyFolder || ""}`,
    `- imageFolder: ${fixtures.imageFolder || ""}`,
    `- mixedFolder: ${fixtures.mixedFolder || ""}`,
    `- pagedFolder: ${fixtures.pagedFolder || ""}`,
    `- expectedCounts: ${fixtures.expectedCounts ? JSON.stringify(fixtures.expectedCounts) : ""}`,
    `- warning: ${fixtures.warning || ""}`,
    "",
    "## Coverage",
    "",
    markdownTable(["code", "status", "required", "checks"], coverageRows),
    "",
    "## Folder Matrix",
    "",
    markdownTable(
      ["folder", "mode", "catalogTotal", "statusCount", "runtimeLoaded", "visible", "galleryState", "openFolderStateFolder", "openFolderSelectedPathFolder", "openFolderFirstPathFolder", "settled", "status"],
      folderRows
    ),
    "",
    "## Event Log Counts",
    "",
    markdownTable(["check", "events", "samples", "ended", "durationMs"], eventRows),
    "",
    "## Violations",
    "",
    markdownTable(["severity", "code", "check", "message"], violationRows),
    "",
  ].join("\n");
}

async function writeMarkdownSummary(report) {
  const target = summaryPathForReport();
  if (!target) return "";
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${renderMarkdownSummary(report)}\n`, "utf8");
  return target;
}

async function saveFailureScreenshot(page, name) {
  if (!config.screenshotDir || !page) return "";
  await fs.mkdir(config.screenshotDir, { recursive: true });
  const filePath = path.join(config.screenshotDir, `${Date.now()}-${safeName(name)}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function installRuntimeWatchers(page, events) {
  await page.addInitScript(
    ({ eventLogLimit, selectors }) => {
      const limit = Math.max(100, Number(eventLogLimit || 600));
      const trackedSelector = [
        selectors.finishedCatalog,
        selectors.galleryToolbar,
        selectors.galleryFolder,
        selectors.galleryPrevFolderButton,
        selectors.galleryNextFolderButton,
        selectors.galleryRefreshButton,
        selectors.galleryMoreButton,
        selectors.galleryImagesButton,
        selectors.galleryVideosButton,
        selectors.galleryMediaSwitchRequest,
        selectors.galleryBrowserLoadButton,
        selectors.preview,
        selectors.finishedGallery,
        selectors.finalGallery,
        selectors.videoPlayer,
        selectors.scenePanel,
      ].join(",");
      const compact = (value) => {
        if (value === null || value === undefined) return value;
        if (typeof value === "string") return value.replace(/\s+/g, " ").trim().slice(0, 500);
        if (typeof value === "number" || typeof value === "boolean") return value;
        if (Array.isArray(value)) return value.slice(0, 12).map(compact);
        if (typeof value === "object") {
          const out = {};
          for (const [key, item] of Object.entries(value).slice(0, 20)) out[key] = compact(item);
          return out;
        }
        return String(value).slice(0, 200);
      };
      const push = (type, payload) => {
        try {
          const seq = Number(window.__simpaiGalleryHealthEventSeq || 0) + 1;
          window.__simpaiGalleryHealthEventSeq = seq;
          const log = Array.isArray(window.__simpaiGalleryHealthEventLog) ? window.__simpaiGalleryHealthEventLog : [];
          log.push({
            seq,
            at: Date.now(),
            performanceNow: Math.round(performance.now()),
            type,
            payload: compact(payload || {}),
          });
          while (log.length > limit) log.shift();
          window.__simpaiGalleryHealthEventLog = log;
        } catch (error) {}
      };
      window.__simpaiGalleryHealthPush = push;
      window.__SIMP_AI_UI_TRACE__ = true;
      try { window.localStorage.setItem("simpai.uiTrace", "1"); } catch (error) {}

      ["log", "info", "warn", "error"].forEach((level) => {
        const original = console[level];
        if (!original || original.__simpaiGalleryHealthWrapped) return;
        const wrapped = function (...args) {
          try {
            const text = args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(compact(arg)))).join(" ");
            if (/UI-TRACE|gallery|queue|progress|preview_generating|error/i.test(text)) {
              push("console", { level, text });
            }
          } catch (error) {}
          return original.apply(this, args);
        };
        wrapped.__simpaiGalleryHealthWrapped = true;
        console[level] = wrapped;
      });

      const describeNode = (node) => {
        if (!node) return {};
        const input = node.matches?.("input, textarea, select") ? node : node.querySelector?.("input, textarea, select");
        return {
          tag: node.tagName || "",
          id: node.id || "",
          className: String(node.className || "").slice(0, 160),
          text: String(node.innerText || node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
          value: input ? String(input.value || "").slice(0, 160) : "",
        };
      };
      const bindDomEvents = () => {
        if (window.__simpaiGalleryHealthDomEventsBound || !document.addEventListener) return;
        window.__simpaiGalleryHealthDomEventsBound = true;
        ["click", "change", "input"].forEach((eventName) => {
          document.addEventListener(
            eventName,
            (event) => {
              const target = event.target && event.target.closest ? event.target.closest(trackedSelector) : null;
              if (!target) return;
              push("dom_event", { event: eventName, target: describeNode(target) });
            },
            true
          );
        });
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bindDomEvents, { once: true });
      } else {
        bindDomEvents();
      }

      if (typeof window.fetch === "function" && !window.fetch.__simpaiGalleryHealthWrapped) {
        const originalFetch = window.fetch.bind(window);
        const wrappedFetch = function (...args) {
          const url = String(args[0]?.url || args[0] || "");
          const tracked = /gradio_api\/(queue|run|call|predict|api)|queue\/data|queue\/join|gallery/i.test(url);
          const startedSeq = tracked ? Number(window.__simpaiGalleryHealthEventSeq || 0) + 1 : 0;
          if (tracked) push("fetch_start", { url });
          return originalFetch(...args)
            .then((response) => {
              if (tracked) push("fetch_end", { url, status: response.status, startedSeq });
              return response;
            })
            .catch((error) => {
              if (tracked) push("fetch_error", { url, message: error.message, startedSeq });
              throw error;
            });
        };
        wrappedFetch.__simpaiGalleryHealthWrapped = true;
        window.fetch = wrappedFetch;
      }

      if (window.XMLHttpRequest && !window.XMLHttpRequest.prototype.__simpaiGalleryHealthWrapped) {
        const proto = window.XMLHttpRequest.prototype;
        const originalOpen = proto.open;
        const originalSend = proto.send;
        proto.open = function (method, url, ...rest) {
          this.__simpaiGalleryHealthUrl = String(url || "");
          this.__simpaiGalleryHealthMethod = String(method || "");
          return originalOpen.call(this, method, url, ...rest);
        };
        proto.send = function (...args) {
          const url = this.__simpaiGalleryHealthUrl || "";
          const tracked = /gradio_api\/(queue|run|call|predict|api)|queue\/data|queue\/join|gallery/i.test(url);
          if (tracked) {
            push("xhr_start", { method: this.__simpaiGalleryHealthMethod || "", url });
            this.addEventListener("loadend", () => push("xhr_end", { url, status: this.status }));
            this.addEventListener("error", () => push("xhr_error", { url, status: this.status }));
          }
          return originalSend.apply(this, args);
        };
        proto.__simpaiGalleryHealthWrapped = true;
      }
    },
    { eventLogLimit: config.eventLogLimit, selectors: SELECTORS }
  );
  const apiRequestStartedAt = new Map();
  page.on("request", (request) => {
    const url = request.url();
    if (!/gradio_api\/(queue|run|call|predict|api)|queue\/data|queue\/join/i.test(url)) return;
    apiRequestStartedAt.set(request, Date.now());
  });
  page.on("console", (message) => {
    const text = message.text();
    if (/UI-TRACE|Traceback|Error|error|not in the list of choices|gallery|queue|progress/i.test(text)) {
      events.push({
        at: Date.now(),
        type: "console",
        level: message.type(),
        text: compactText(text, 2000),
      });
    }
  });
  page.on("pageerror", (error) => {
    events.push({
      at: Date.now(),
      type: "pageerror",
      text: compactText(String(error?.stack || error), 4000),
    });
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!/gradio|queue|api|gallery/i.test(url)) return;
    const startedAt = apiRequestStartedAt.get(request) || Date.now();
    apiRequestStartedAt.delete(request);
    events.push({
      at: Date.now(),
      type: "requestfailed",
      url,
      durationMs: Date.now() - startedAt,
      failure: request.failure()?.errorText || "",
    });
  });
  page.on("response", async (response) => {
    const url = response.url();
    if (!/gradio_api\/(queue|run|call|predict|api)|queue\/data|queue\/join/i.test(url)) return;
    const request = response.request();
    const startedAt = apiRequestStartedAt.get(request) || Date.now();
    apiRequestStartedAt.delete(request);
    const status = response.status();
    const durationMs = Date.now() - startedAt;
    events.push({
      at: Date.now(),
      type: "api_timing",
      status,
      durationMs,
      url,
    });
    let text = "";
    if (status >= 400) {
      text = await response.text().catch(() => "");
    }
    if (status >= 400 || /Traceback|not in the list of choices|Error/i.test(text)) {
      events.push({
        at: Date.now(),
        type: "response",
        status,
        url,
        text: compactText(text, 4000),
      });
    }
  });
}

async function waitForUiSettle(page, delayMs = config.settleMs) {
  await page.waitForLoadState("domcontentloaded", { timeout: config.timeoutMs }).catch(() => {});
  await page.waitForTimeout(delayMs);
}

async function gotoWebUi(page) {
  await page.goto(config.baseUrl, { waitUntil: "domcontentloaded", timeout: config.timeoutMs });
  await page.locator(SELECTORS.finishedCatalog).first().waitFor({ state: "attached", timeout: config.timeoutMs });
  await waitForUiSettle(page, 2000);
}

async function reloadWebUi(page) {
  await page.reload({ waitUntil: "domcontentloaded", timeout: config.timeoutMs });
  await page.locator(SELECTORS.finishedCatalog).first().waitFor({ state: "attached", timeout: config.timeoutMs });
  await waitForUiSettle(page, 1600);
}

async function resetMutationObserver(page, label) {
  await page.evaluate(
    ({ selectors, labelName }) => {
      if (window.__simpaiGalleryHealthObserver) {
        try { window.__simpaiGalleryHealthObserver.disconnect(); } catch (error) {}
      }
      const target =
        document.querySelector(selectors.finishedCatalog) ||
        document.querySelector(selectors.finishedGallery) ||
        document.body;
      window.__simpaiGalleryHealthState = {
        label: labelName,
        mutationCount: 0,
        lastMutation: performance.now(),
        selector: target && target.id ? `#${target.id}` : "",
      };
      const observer = new MutationObserver((mutations) => {
        const state = window.__simpaiGalleryHealthState || {};
        state.mutationCount = Number(state.mutationCount || 0) + mutations.length;
        state.lastMutation = performance.now();
        window.__simpaiGalleryHealthState = state;
      });
      observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
        attributeFilter: ["class", "style", "hidden", "aria-hidden", "aria-pressed", "disabled", "value"],
      });
      window.__simpaiGalleryHealthObserver = observer;
    },
    { selectors: SELECTORS, labelName: label }
  );
}

async function mutationState(page) {
  return await page.evaluate(() => {
    const state = window.__simpaiGalleryHealthState || {};
    return {
      label: state.label || "",
      mutationCount: Number(state.mutationCount || 0),
      quietMs: Math.round(performance.now() - Number(state.lastMutation || performance.now())),
      selector: state.selector || "",
    };
  });
}

async function readPageEventLog(page, sinceSeq = 0) {
  return await page.evaluate((seq) => {
    const log = Array.isArray(window.__simpaiGalleryHealthEventLog) ? window.__simpaiGalleryHealthEventLog : [];
    const currentSeq = Number(window.__simpaiGalleryHealthEventSeq || 0);
    const requestedSeq = Number(seq || 0);
    const sequenceReset = currentSeq < requestedSeq;
    const effectiveSeq = sequenceReset ? 0 : requestedSeq;
    const filtered = log.filter((event) => Number(event.seq || 0) > effectiveSeq);
    return {
      seq: currentSeq,
      totalBuffered: log.length,
      sinceSeq: requestedSeq,
      effectiveSinceSeq: effectiveSeq,
      sequenceReset,
      count: filtered.length,
      items: filtered.slice(-160),
    };
  }, sinceSeq);
}

function auditGradioConfigObject(runtimeConfig, contracts) {
  const { selectors, domContract, componentContract, eventContract } = contracts;
  const config = runtimeConfig || {};
  const components = Array.isArray(config.components) ? config.components : [];
  const dependencies = Array.isArray(config.dependencies) ? config.dependencies : [];
  const selectorElemIds = Object.values(selectors).map((selector) => String(selector).replace(/^#/, ""));
  const contractElemIds = [
    ...(componentContract.requiredElemIds || []),
    ...((eventContract.expectedEvents || []).map((event) => event.elem_id)),
  ];
  const ids = [...new Set([...selectorElemIds, ...contractElemIds].filter(Boolean))];
  const compactValue = (value, max = 280) => {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") return value.replace(/\s+/g, " ").trim().slice(0, max);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) return value.slice(0, 16).map((item) => compactValue(item, max));
    if (typeof value === "object") {
      const out = {};
      for (const [key, item] of Object.entries(value).slice(0, 20)) out[key] = compactValue(item, max);
      return out;
    }
    return String(value).slice(0, max);
  };
  const componentSummary = (component) => ({
    id: component.id,
    type: component.type || "",
    elem_id: component.props?.elem_id || "",
    visible: component.props?.visible,
    valueType: typeof component.props?.value,
    choicesCount: Array.isArray(component.props?.choices) ? component.props.choices.length : null,
  });
  const targetComponents = components
    .filter((component) => {
      const props = component && component.props ? component.props : {};
      return ids.includes(String(props.elem_id || ""));
    })
    .map(componentSummary);
  const componentByElemId = Object.fromEntries(targetComponents.map((component) => [component.elem_id, component]));
  const componentById = Object.fromEntries(components.map((component) => [String(component.id), componentSummary(component)]));
  const elemIdByComponentId = Object.fromEntries(
    components
      .map((component) => [String(component.id), String(component.props?.elem_id || "")])
      .filter(([, elemId]) => elemId)
  );
  const missingTargetElemIds = (componentContract.requiredElemIds || []).filter((elemId) => !componentByElemId[elemId]);
  const unexpectedTargetTypes = Object.entries(componentContract.expectedTypeByElemId || {})
    .map(([elemId, expectedTypes]) => {
      const component = componentByElemId[elemId];
      if (!component) return null;
      const actualType = String(component.type || "").toLowerCase();
      const expected = (expectedTypes || []).map((item) => String(item || "").toLowerCase());
      return expected.includes(actualType) ? null : { elem_id: elemId, expectedTypes, actualType };
    })
    .filter(Boolean);
  const idFromComponentValue = (value) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "number" || typeof value === "string") return String(value);
    if (Array.isArray(value)) return idFromComponentValue(value[0]);
    if (typeof value === "object") {
      return String(value.id ?? value.component_id ?? value.componentId ?? value._id ?? value.component ?? "");
    }
    return "";
  };
  const eventFromTargetValue = (value) => {
    if (Array.isArray(value)) return String(value[1] ?? value[2] ?? "");
    if (value && typeof value === "object") {
      return String(value.event ?? value.event_name ?? value.eventName ?? value.trigger ?? value.listener ?? "");
    }
    return "";
  };
  const normalizeTargets = (value) => {
    if (!Array.isArray(value)) {
      const componentId = idFromComponentValue(value);
      return componentId ? [{ componentId, event: eventFromTargetValue(value) }] : [];
    }
    if (value.length && !Array.isArray(value[0]) && typeof value[0] !== "object") {
      const componentId = idFromComponentValue(value[0]);
      return componentId ? [{ componentId, event: eventFromTargetValue(value) }] : [];
    }
    return value.flatMap((item) => normalizeTargets(item));
  };
  const normalizeComponentList = (value) => {
    const items = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
    return items
      .map((item) => {
        const componentId = idFromComponentValue(item);
        return componentId
          ? {
              componentId,
              elem_id: elemIdByComponentId[componentId] || "",
              type: componentById[componentId]?.type || "",
            }
          : null;
      })
      .filter(Boolean);
  };
  const normalizeSetting = (value) => {
    if (value === undefined) return { hasValue: false, value: null, raw: null };
    if (typeof value === "boolean") return { hasValue: true, value, raw: value };
    if (typeof value === "number") return { hasValue: true, value: value !== 0, raw: value };
    const text = String(value).trim().toLowerCase();
    if (["false", "0", "off", "none", "hidden", "null", ""].includes(text)) return { hasValue: true, value: false, raw: value };
    if (["true", "1", "on", "full", "minimal"].includes(text)) return { hasValue: true, value: true, raw: value };
    return { hasValue: true, value: text, raw: value };
  };
  const progressIsOff = (setting) => {
    if (!setting.hasValue) return true;
    return setting.value === false;
  };
  const dependencyRows = dependencies.map((dependency, index) => {
    const targets = normalizeTargets(dependency.targets ?? dependency.target ?? dependency.event_targets ?? []).map((target) => ({
      componentId: target.componentId,
      elem_id: elemIdByComponentId[target.componentId] || "",
      type: componentById[target.componentId]?.type || "",
      event: target.event || "",
    }));
    const inputs = normalizeComponentList(dependency.inputs);
    const outputs = normalizeComponentList(dependency.outputs);
    return {
      index,
      id: dependency.id ?? dependency.index ?? index,
      targets,
      inputs,
      outputs,
      queue: dependency.queue,
      queueSetting: normalizeSetting(dependency.queue),
      show_progress: dependency.show_progress ?? dependency.showProgress,
      showProgressSetting: normalizeSetting(dependency.show_progress ?? dependency.showProgress),
      api_name: dependency.api_name ?? dependency.apiName ?? "",
      js: typeof dependency.js === "string" ? compactValue(dependency.js, 420) : !!dependency.js,
      backend_fn: dependency.backend_fn ?? dependency.backendFn ?? dependency.fn_index ?? "",
      trigger_after: dependency.trigger_after ?? dependency.triggerAfter ?? null,
      trigger_only_on_success: dependency.trigger_only_on_success ?? dependency.triggerOnlyOnSuccess ?? null,
      cancels: dependency.cancels ?? null,
      collects_event_data: dependency.collects_event_data ?? dependency.collectsEventData ?? null,
    };
  });
  const galleryElemIds = new Set(ids);
  const dependencyTouchesGallery = (dependency) => {
    const elemIds = [
      ...dependency.targets.map((target) => target.elem_id),
      ...dependency.inputs.map((input) => input.elem_id),
      ...dependency.outputs.map((output) => output.elem_id),
    ];
    if (elemIds.some((elemId) => galleryElemIds.has(elemId))) return true;
    return /gallery|preview|video|toolbox/i.test(String(dependency.api_name || "") + " " + String(dependency.js || ""));
  };
  const galleryDependencies = dependencyRows.filter(dependencyTouchesGallery);
  const targetMatchesExpected = (target, expected) => {
    if (target.elem_id !== expected.elem_id) return false;
    return !target.event || target.event === expected.event;
  };
  const matchingDependenciesForExpected = (expected) =>
    galleryDependencies.filter((dependency) => dependency.targets.some((target) => targetMatchesExpected(target, expected)));
  const missingExpectedEvents = (eventContract.expectedEvents || []).filter(
    (expected) => matchingDependenciesForExpected(expected).length === 0
  );
  const unexpectedEventSettings = (eventContract.expectedEvents || []).flatMap((expected) => {
    const matches = matchingDependenciesForExpected(expected);
    return matches
      .map((dependency) => {
        const mismatches = [];
        if (expected.queue === false && dependency.queueSetting.hasValue && dependency.queueSetting.value !== false) {
          mismatches.push({ field: "queue", expected: false, actual: dependency.queue });
        }
        if (expected.showProgress === false && !progressIsOff(dependency.showProgressSetting)) {
          mismatches.push({ field: "show_progress", expected: false, actual: dependency.show_progress });
        }
        return mismatches.length
          ? {
              elem_id: expected.elem_id,
              event: expected.event,
              dependencyIndex: dependency.index,
              dependencyId: dependency.id,
              mismatches,
            }
          : null;
      })
      .filter(Boolean);
  });
  return {
    version: config.version || config.gradio_version || "",
    componentCount: components.length,
    dependencyCount: dependencies.length,
    targetComponents,
    galleryDependencies,
    missingTargetElemIds,
    unexpectedTargetTypes,
    eventContract,
    missingExpectedEvents,
    unexpectedEventSettings,
    domContract,
    componentContract,
  };
}

async function readGradioRuntimeSnapshot(page) {
  const runtimeConfig = await page.evaluate(() => window.gradio_config || {});
  return auditGradioConfigObject(runtimeConfig, {
    selectors: SELECTORS,
    domContract: GRADIO6_DOM_CONTRACT,
    componentContract: GRADIO6_COMPONENT_CONTRACT,
    eventContract: GRADIO6_EVENT_CONTRACT,
  });
}

async function readSimpleAiRuntimeSnapshot(page) {
  return await page.evaluate(() => {
    const functionNames = [
      "syncGalleryMediaSwitch",
      "beginGalleryMediaSwitchRequest",
      "beginFinishedGalleryBrowserNativeRequest",
      "syncFinishedGalleryBrowserAfterNativeLoad",
      "syncFinishedGalleryBrowserStatusFromRenderedGallery",
      "updateGalleryBrowserWelcomeVisibility",
      "refresh_finished_images_catalog_label",
      "traceResultPanelStateSoon",
    ];
    let localGalleryBrowserState = null;
    const params = window.simpleaiTopbarSystemParams || {};
    const galleryPaths = Array.isArray(params.__main_gallery_browser_paths) ? params.__main_gallery_browser_paths : [];
    const pathFolder = (item) => {
      const parts = String(item || "").replace(/\\/g, "/").split("/").filter(Boolean);
      return parts.length >= 2 ? parts[parts.length - 2] : "";
    };
    const promptInfo = Array.isArray(params.prompt_info) ? params.prompt_info : [];
    const selectedIndex = Number.isFinite(Number(promptInfo[1])) ? Number(promptInfo[1]) : 0;
    const selectedPath = galleryPaths[selectedIndex] || galleryPaths[0] || "";
    try {
      if (typeof finishedGalleryBrowserState !== "undefined") {
        localGalleryBrowserState = {
          loading: !!finishedGalleryBrowserState.loading,
          pendingPayload: !!finishedGalleryBrowserState.pendingPayload,
          queuedOptions: !!finishedGalleryBrowserState.queuedOptions,
          folder: finishedGalleryBrowserState.folder || "",
          userFolder: finishedGalleryBrowserState.userFolder || "",
          foldersCount: Array.isArray(finishedGalleryBrowserState.folders) ? finishedGalleryBrowserState.folders.length : 0,
          folders: Array.isArray(finishedGalleryBrowserState.folders) ? finishedGalleryBrowserState.folders.slice(0, 80) : [],
          pathsCount: Array.isArray(finishedGalleryBrowserState.paths) ? finishedGalleryBrowserState.paths.length : null,
          loaded: Number(finishedGalleryBrowserState.loaded || 0),
          mediaType: finishedGalleryBrowserState.mediaType || "",
          hasMore: !!finishedGalleryBrowserState.hasMore,
          nextOffset: Number(finishedGalleryBrowserState.nextOffset || 0),
          activeRequestId: Number(finishedGalleryBrowserState.activeRequestId || 0),
          bridgeRetryCount: Number(finishedGalleryBrowserState.bridgeRetryCount || 0),
          pendingPayload: finishedGalleryBrowserState.pendingPayload || null,
          queuedOptions: finishedGalleryBrowserState.queuedOptions || null,
          restoreScrollTop: finishedGalleryBrowserState.restoreScrollTop,
        };
      }
    } catch (error) {}
    let internalTimers = {};
    try {
      internalTimers = {
        eventSeq: Number(window.__simpaiGalleryHealthEventSeq || 0),
        mediaSwitchSeq: Number(window.__simpleaiGalleryMediaSwitchSeq || 0),
        mediaSwitchLock:
          typeof getActiveGalleryMediaSwitchLock === "function"
            ? getActiveGalleryMediaSwitchLock()
            : {
                mode: typeof galleryMediaSwitchLockedMode !== "undefined" ? galleryMediaSwitchLockedMode : null,
                remaining:
                  typeof galleryMediaSwitchLockedUntil !== "undefined"
                    ? Math.max(0, Number(galleryMediaSwitchLockedUntil || 0) - Date.now())
                    : null,
              },
        browserRequestSeq: typeof finishedGalleryBrowserRequestSeq !== "undefined" ? Number(finishedGalleryBrowserRequestSeq || 0) : null,
        welcomeGuardRemainingMs:
          typeof finishedGalleryWelcomeGuardUntil !== "undefined"
            ? Math.max(0, Number(finishedGalleryWelcomeGuardUntil || 0) - Date.now())
            : null,
        welcomeGuardHoldRemainingMs:
          typeof finishedGalleryWelcomeGuardHoldStaleUntil !== "undefined"
            ? Math.max(0, Number(finishedGalleryWelcomeGuardHoldStaleUntil || 0) - Date.now())
            : null,
        presetGalleryHiddenRemainingMs:
          typeof simpleAIPresetSwitchGalleryHiddenUntil !== "undefined"
            ? Math.max(0, Number(simpleAIPresetSwitchGalleryHiddenUntil || 0) - Date.now())
            : null,
      };
    } catch (error) {}
    return {
      functions: Object.fromEntries(functionNames.map((name) => [name, typeof window[name] === "function"])),
      topbarSystemParams: window.simpleaiTopbarSystemParams
        ? {
            galleryState: window.simpleaiTopbarSystemParams.gallery_state || "",
            galleryFolder: window.simpleaiTopbarSystemParams.__main_gallery_browser_folder || "",
            galleryPathCount: Array.isArray(window.simpleaiTopbarSystemParams.__main_gallery_browser_paths)
              ? window.simpleaiTopbarSystemParams.__main_gallery_browser_paths.length
              : null,
            galleryFolders: Array.isArray(window.simpleaiTopbarSystemParams.__main_gallery_browser_folders)
              ? window.simpleaiTopbarSystemParams.__main_gallery_browser_folders.slice(0, 80)
              : [],
            galleryFoldersCount: Array.isArray(window.simpleaiTopbarSystemParams.__main_gallery_browser_folders)
              ? window.simpleaiTopbarSystemParams.__main_gallery_browser_folders.length
              : null,
            galleryFirstPathFolder: pathFolder(galleryPaths[0] || ""),
            gallerySelectedPath: selectedPath,
            gallerySelectedPathFolder: pathFolder(selectedPath),
            galleryEngineType:
              window.simpleaiTopbarSystemParams.__gallery_engine_type || window.simpleaiTopbarSystemParams.engine_type || "",
            postGenerationHasOutput: !!window.simpleaiTopbarSystemParams.__post_generation_has_output,
            postGenerationGalleryOutput: !!window.simpleaiTopbarSystemParams.__post_generation_gallery_output,
            postGenerationCompareReady: !!window.simpleaiTopbarSystemParams.__post_generation_compare_ready,
            postGenerationCompareVisible: !!window.simpleaiTopbarSystemParams.__post_generation_compare_visible,
            postGenerationImageUrl: window.simpleaiTopbarSystemParams.__post_generation_image_url || "",
          }
        : null,
      mediaSwitchRequest: window.__simpleaiGalleryMediaSwitchRequest || null,
      mediaSwitchSuppressRefresh: window.__simpleaiGalleryMediaSwitchSuppressRefresh || null,
      galleryPreviewOpenPendingUntil: Number(window.__simpleaiGalleryPreviewOpenPendingUntil || 0),
      localGalleryBrowserState,
      internalTimers,
    };
  });
}

function isRecoverableSnapshotError(error) {
  const message = String(error?.message || error || "");
  return /Execution context was destroyed|most likely because of a navigation|Cannot find context with specified id|Target closed|Frame was detached/i.test(message);
}

async function snapshotGalleryHealth(page, label) {
  let dom = null;
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      dom = await page.evaluate(
    ({ selectors, contract, labelName }) => {
      const now = performance.now();
      const rootClassList = Array.from(document.documentElement.classList || []);
      const textOf = (node) => (node ? String(node.innerText || node.textContent || "").replace(/\s+/g, " ").trim() : "");
      const isVisible = (node) => {
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        let current = node;
        while (current && current.nodeType === 1) {
          const style = window.getComputedStyle ? window.getComputedStyle(current) : null;
          if (
            current.hidden ||
            current.hasAttribute("hidden") ||
            current.getAttribute("aria-hidden") === "true" ||
            (style && (style.display === "none" || style.visibility === "hidden"))
          ) {
            return false;
          }
          current = current.parentElement;
        }
        return true;
      };
      const mediaSrc = (node) => node?.currentSrc || node?.src || node?.getAttribute?.("src") || node?.poster || "";
      const galleryMediaUnits = (root, mediaSelector) => {
        if (!root || !mediaSelector) return [];
        const unitSelectors = [
          ".gallery-container > .preview",
          ".grid-wrap .gallery-item",
          ".grid-wrap button",
          "[data-testid='gallery'] button",
          "button.thumbnail-item",
          ".thumbnail-item",
        ];
        const units = [];
        const seenNodes = new Set();
        for (const selector of unitSelectors) {
          const nodes = Array.from(root.querySelectorAll(selector)).filter((node) => {
            if (!node || seenNodes.has(node)) return false;
            if (!node.querySelector?.("img, video, canvas")) return false;
            seenNodes.add(node);
            return true;
          });
          if (nodes.length) {
            nodes.forEach((node) => units.push(node));
            break;
          }
        }
        if (units.length) return units;
        const sourceSeen = new Set();
        return Array.from(root.querySelectorAll(mediaSelector)).filter((node) => {
          const key = mediaSrc(node) || `${node.tagName}:${Math.round(node.getBoundingClientRect().x)}:${Math.round(node.getBoundingClientRect().y)}`;
          if (sourceSeen.has(key)) return false;
          sourceSeen.add(key);
          return true;
        });
      };
      const elementState = (selector, mediaSelector = contract.gallery.media) => {
        const root = document.querySelector(selector);
        if (!root) {
          return {
            selector,
            exists: false,
            visible: false,
            width: 0,
            height: 0,
            text: "",
            mediaCount: 0,
            visibleMediaCount: 0,
            imgCount: 0,
            videoCount: 0,
            canvasCount: 0,
          };
        }
        const rect = root.getBoundingClientRect();
        const style = window.getComputedStyle ? window.getComputedStyle(root) : null;
        const rawMedia = mediaSelector ? Array.from(root.querySelectorAll(mediaSelector)) : [];
        const emptyMediaHidden = root.dataset?.simpleaiGalleryBrowserEmptyMediaHidden === "1";
        const media = emptyMediaHidden ? [] : galleryMediaUnits(root, mediaSelector);
        const valueElement = root.matches?.("input, textarea, select")
          ? root
          : root.querySelector?.("input, textarea, select");
        const value = valueElement ? String(valueElement.value || valueElement.getAttribute("value") || "") : "";
        return {
          selector,
          exists: true,
          visible: !emptyMediaHidden && isVisible(root),
          hidden: !!root.hidden || root.hasAttribute("hidden") || root.getAttribute("aria-hidden") === "true",
          display: style ? style.display : "",
          visibility: style ? style.visibility : "",
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          text: textOf(root).slice(0, 500),
          value: value.slice(0, 2000),
          className: String(root.className || ""),
          dataset: root.dataset ? Object.fromEntries(Object.entries(root.dataset).slice(0, 24)) : {},
          styleText: root.getAttribute("style") || "",
          mediaCount: media.length,
          visibleMediaCount: emptyMediaHidden ? 0 : media.filter(isVisible).length,
          rawMediaNodeCount: rawMedia.length,
          imgCount: root.querySelectorAll("img").length,
          videoCount: root.querySelectorAll("video").length,
          canvasCount: root.querySelectorAll("canvas").length,
        };
      };
      const readButton = (selector) => {
        const root = document.querySelector(selector);
        const button = root && root.matches && root.matches("button") ? root : root?.querySelector?.("button");
        const rect = button ? button.getBoundingClientRect() : null;
        const className = button ? String(button.className || "") : "";
        const rootClassName = root ? String(root.className || "") : "";
        const ariaPressed = button ? button.getAttribute("aria-pressed") || "" : "";
        const active = ariaPressed === "true" || /\b(active|selected|primary)\b/i.test(`${className} ${rootClassName}`);
        return {
          selector,
          exists: !!button,
          visible: !!button && isVisible(button),
          disabled: !!button && (button.disabled || button.getAttribute("aria-disabled") === "true"),
          active,
          ariaPressed,
          text: textOf(button),
          className,
          dataset: button?.dataset ? Object.fromEntries(Object.entries(button.dataset).slice(0, 24)) : {},
          width: rect ? Math.round(rect.width) : 0,
          height: rect ? Math.round(rect.height) : 0,
        };
      };
      const readDropdown = (selector) => {
        const root = document.querySelector(selector);
        if (!root) return { exists: false, visible: false, value: "", text: "", options: [] };
        const select = root.querySelector("select");
        const input = root.querySelector("input");
        const button = root.querySelector("button");
        let options = [];
        if (select) {
          options = Array.from(select.options || []).map((option) => ({
            value: option.value,
            text: textOf(option) || option.label || option.value,
            selected: option.selected,
          }));
        }
        const datasetValue =
          root.dataset?.simpleaiGalleryBrowserFolder ||
          root.dataset?.saiFolderLabel ||
          root.getAttribute("data-value") ||
          root.getAttribute("data-sai-folder-label") ||
          "";
        const value = datasetValue || (select ? select.value : input ? input.value : textOf(button) || "");
        return {
          exists: true,
          visible: isVisible(root),
          value: String(value || "").trim(),
          text: textOf(root).slice(0, 300),
          options,
        };
      };
      const rectInfo = (node) => {
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        const x = Math.round(rect.x);
        const y = Math.round(rect.y);
        return {
          x,
          y,
          width,
          height,
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          centerX: Math.round(rect.x + rect.width / 2),
          centerY: Math.round(rect.y + rect.height / 2),
        };
      };
      const rectOverlapArea = (a, b) => {
        if (!a || !b) return 0;
        const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
        const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
        return Math.round(width * height);
      };
      const rectOutsideViewport = (rect, viewport, tolerance = 2) => {
        if (!rect || !viewport) return false;
        return rect.x < -tolerance || rect.right > viewport.width + tolerance;
      };
      const measurePreviewThumbnailLayout = () => {
        const roots = [document.querySelector(selectors.finishedGallery), document.querySelector(selectors.finalGallery)].filter(isVisible);
        for (const root of roots) {
          const preview = root.querySelector(".gallery-container > .preview");
          const thumbnails = preview?.querySelector?.(".thumbnails");
          if (!preview || !thumbnails || !isVisible(preview) || !isVisible(thumbnails)) continue;
          const children = Array.from(thumbnails.children || []).filter(isVisible);
          const thumbnailRect = rectInfo(thumbnails);
          const childRects = children.map(rectInfo).filter(Boolean);
          let childBounds = null;
          if (childRects.length) {
            const left = Math.min(...childRects.map((rect) => rect.x));
            const right = Math.max(...childRects.map((rect) => rect.right));
            const top = Math.min(...childRects.map((rect) => rect.y));
            const bottom = Math.max(...childRects.map((rect) => rect.bottom));
            childBounds = {
              x: left,
              y: top,
              right,
              bottom,
              width: right - left,
              height: bottom - top,
              centerX: Math.round(left + (right - left) / 2),
              centerY: Math.round(top + (bottom - top) / 2),
            };
          }
          const style = window.getComputedStyle ? window.getComputedStyle(thumbnails) : null;
          const centerDeltaPx = childBounds && thumbnailRect ? Math.round(childBounds.centerX - thumbnailRect.centerX) : null;
          const contentFits = !!(childBounds && thumbnailRect && childBounds.width <= thumbnailRect.width - 4);
          const viewport = { width: Math.round(window.innerWidth || 0), height: Math.round(window.innerHeight || 0) };
          const toolbar = rectInfo(document.querySelector(selectors.galleryToolbar));
          const catalog = rectInfo(document.querySelector(selectors.finishedCatalog));
          const outsideViewport = [];
          for (const [name, rect] of [
            ["preview", rectInfo(preview)],
            ["thumbnails", thumbnailRect],
            ["toolbar", toolbar],
            ["catalog", catalog],
          ]) {
            if (rectOutsideViewport(rect, viewport)) outsideViewport.push({ name, rect });
          }
          const overlaps = [];
          const toolbarThumbnailOverlap = rectOverlapArea(toolbar, thumbnailRect);
          if (toolbarThumbnailOverlap > 12) overlaps.push({ a: "toolbar", b: "thumbnails", area: toolbarThumbnailOverlap });
          const toolbarPreviewOverlap = rectOverlapArea(toolbar, rectInfo(preview));
          if (toolbarPreviewOverlap > 12) overlaps.push({ a: "toolbar", b: "preview", area: toolbarPreviewOverlap });
          return {
            exists: true,
            visible: true,
            root: root.id ? `#${root.id}` : "",
            preview: rectInfo(preview),
            thumbnails: thumbnailRect,
            toolbar,
            catalog,
            viewport,
            outsideViewport,
            overlaps,
            childCount: childRects.length,
            childBounds,
            centerDeltaPx,
            contentFits,
            scrollLeft: Math.round(thumbnails.scrollLeft || 0),
            scrollWidth: Math.round(thumbnails.scrollWidth || 0),
            clientWidth: Math.round(thumbnails.clientWidth || 0),
            display: style ? style.display : "",
            justifyContent: style ? style.justifyContent : "",
            alignItems: style ? style.alignItems : "",
            overflowX: style ? style.overflowX : "",
          };
        }
        return {
          exists: false,
          visible: false,
          root: "",
          preview: null,
          thumbnails: null,
          toolbar: null,
          catalog: null,
          viewport: { width: Math.round(window.innerWidth || 0), height: Math.round(window.innerHeight || 0) },
          outsideViewport: [],
          overlaps: [],
          childCount: 0,
          childBounds: null,
          centerDeltaPx: null,
          contentFits: false,
          scrollLeft: 0,
          scrollWidth: 0,
          clientWidth: 0,
          display: "",
          justifyContent: "",
          alignItems: "",
          overflowX: "",
        };
      };
      const measureGalleryFrostState = () => {
        const rootEnabled = document.documentElement.classList.contains("simpai-gallery-frost-enabled");
        const control = document.querySelector("[data-simpleai-gallery-frost-control]");
        const checkbox = document.querySelector("[data-simpleai-gallery-frost-checkbox]");
        const galleries = [document.querySelector(selectors.finishedGallery), document.querySelector(selectors.finalGallery)]
          .filter(Boolean)
          .map((gallery) => {
            const rect = gallery.getBoundingClientRect();
            const items = Array.from(gallery.querySelectorAll(".grid-wrap .gallery-item")).filter(isVisible);
            const revealed = gallery.getAttribute("data-sai-frost-revealed") === "1";
            const className = String(gallery.className || "");
            return {
              id: gallery.id || "",
              exists: true,
              visible: isVisible(gallery),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              itemCount: items.length,
              multi: className.includes("simpleai-gallery-frost-multi"),
              revealed,
              className,
              firstItem: rectInfo(items[0] || null),
            };
          });
        return {
          enabled: rootEnabled,
          controlVisible: !!control && isVisible(control),
          checkboxChecked: !!checkbox && !!checkbox.checked,
          galleries,
        };
      };
      const parseBridgeValue = (selector) => {
        const state = elementState(selector, "");
        const raw = state.value || "";
        if (!raw) return { rawLength: 0, json: null, parseError: "" };
        try {
          return { rawLength: raw.length, json: JSON.parse(raw), parseError: "" };
        } catch (error) {
          return { rawLength: raw.length, json: null, parseError: error.message };
        }
      };
      const readCatalog = () => {
        const root = document.querySelector(selectors.finishedCatalog);
        if (!root) return { exists: false, visible: false, labelOpen: false, bodyVisible: false, text: "", totalCount: null };
        const label =
          root.querySelector(":scope > button.label-wrap") ||
          root.querySelector("button.label-wrap") ||
          root.querySelector("summary, [role='button']") ||
          root;
        const bodyCandidates = Array.from(root.children || []).filter((child) => {
          try {
            return !(child.matches && child.matches("button.label-wrap, summary"));
          } catch (error) {
            return true;
          }
        });
        const rootRect = root.getBoundingClientRect();
        const labelOpen = !!label && (
          label.classList.contains("open") ||
          label.getAttribute("aria-expanded") === "true" ||
          label.hasAttribute("open") ||
          root.hasAttribute("open")
        );
        const bodyVisible = bodyCandidates.some(isVisible);
        const text = textOf(root).slice(0, 700);
        const style = window.getComputedStyle ? window.getComputedStyle(root) : null;
        return {
          exists: true,
          visible: isVisible(root),
          hidden: !!root.hidden || root.hasAttribute("hidden") || root.getAttribute("aria-hidden") === "true",
          display: style ? style.display : "",
          visibility: style ? style.visibility : "",
          labelOpen,
          bodyVisible,
          width: Math.round(rootRect.width),
          height: Math.round(rootRect.height),
          className: String(root.className || ""),
          dataset: root.dataset ? Object.fromEntries(Object.entries(root.dataset).slice(0, 24)) : {},
          styleText: root.getAttribute("style") || "",
          labelText: textOf(label).slice(0, 300),
          text,
          totalCount: parseCatalogTotalCountBrowser(text),
        };
      };
      const parseCatalogTotalCountBrowser = (text) => {
        const normalized = String(text || "").replace(/,/g, "");
        const totalMatch = normalized.match(/(?:total|总计)\s*[:：]?\s*(\d+)\s*(?:张图片|张图|图片|items?|images?|videos?|视频)?/i);
        if (totalMatch) return Number.parseInt(totalMatch[1], 10);
        const matches = [...normalized.matchAll(/(\d+)\s*(?:张图片|张图|图片|items?|images?|videos?|个视频|视频)/gi)];
        if (!matches.length) return null;
        return Number.parseInt(matches[matches.length - 1][1], 10);
      };
      const images = readButton(selectors.galleryImagesButton);
      const videos = readButton(selectors.galleryVideosButton);
      const switchRow = document.querySelector(selectors.galleryMediaSwitchRow);
      let mode = switchRow?.dataset?.mode || "";
      if (!mode && images.active && !videos.active) mode = "image";
      if (!mode && videos.active && !images.active) mode = "video";
      const status = elementState(selectors.galleryStatus, "");
      if (!mode && /\bvideo|视频/i.test(status.text)) mode = "video";
      if (!mode && /\bitem|image|图片|张图/i.test(status.text)) mode = "image";
      const params = window.simpleaiTopbarSystemParams || {};
      const galleryPaths = Array.isArray(params.__main_gallery_browser_paths) ? params.__main_gallery_browser_paths : [];
      const pathFolder = (item) => {
        const parts = String(item || "").replace(/\\/g, "/").split("/").filter(Boolean);
        return parts.length >= 2 ? parts[parts.length - 2] : "";
      };
      const promptInfo = Array.isArray(params.prompt_info) ? params.prompt_info : [];
      const selectedIndex = Number.isFinite(Number(promptInfo[1])) ? Number(promptInfo[1]) : 0;
      const selectedPath = galleryPaths[selectedIndex] || galleryPaths[0] || "";
      let localGalleryBrowserState = null;
      try {
        if (typeof finishedGalleryBrowserState !== "undefined") {
          localGalleryBrowserState = {
            loading: !!finishedGalleryBrowserState.loading,
            pendingPayload: !!finishedGalleryBrowserState.pendingPayload,
            queuedOptions: !!finishedGalleryBrowserState.queuedOptions,
            folder: finishedGalleryBrowserState.folder || "",
            userFolder: finishedGalleryBrowserState.userFolder || "",
            foldersCount: Array.isArray(finishedGalleryBrowserState.folders) ? finishedGalleryBrowserState.folders.length : 0,
            folders: Array.isArray(finishedGalleryBrowserState.folders) ? finishedGalleryBrowserState.folders.slice(0, 80) : [],
            pathsCount: Array.isArray(finishedGalleryBrowserState.paths) ? finishedGalleryBrowserState.paths.length : null,
            loaded: Number(finishedGalleryBrowserState.loaded || 0),
            mediaType: finishedGalleryBrowserState.mediaType || "",
            hasMore: !!finishedGalleryBrowserState.hasMore,
            nextOffset: Number(finishedGalleryBrowserState.nextOffset || 0),
            activeRequestId: Number(finishedGalleryBrowserState.activeRequestId || 0),
            bridgeRetryCount: Number(finishedGalleryBrowserState.bridgeRetryCount || 0),
            pendingPayloadValue: finishedGalleryBrowserState.pendingPayload || null,
            queuedOptionsValue: finishedGalleryBrowserState.queuedOptions || null,
            restoreScrollTop: finishedGalleryBrowserState.restoreScrollTop,
          };
        }
      } catch (error) {}
      let internalTimers = {};
      try {
        internalTimers = {
          eventSeq: Number(window.__simpaiGalleryHealthEventSeq || 0),
          mediaSwitchSeq: Number(window.__simpleaiGalleryMediaSwitchSeq || 0),
          mediaSwitchLock:
            typeof getActiveGalleryMediaSwitchLock === "function"
              ? getActiveGalleryMediaSwitchLock()
              : {
                  mode: typeof galleryMediaSwitchLockedMode !== "undefined" ? galleryMediaSwitchLockedMode : null,
                  remaining:
                    typeof galleryMediaSwitchLockedUntil !== "undefined"
                      ? Math.max(0, Number(galleryMediaSwitchLockedUntil || 0) - Date.now())
                      : null,
                },
          browserRequestSeq: typeof finishedGalleryBrowserRequestSeq !== "undefined" ? Number(finishedGalleryBrowserRequestSeq || 0) : null,
          welcomeGuardRemainingMs:
            typeof finishedGalleryWelcomeGuardUntil !== "undefined"
              ? Math.max(0, Number(finishedGalleryWelcomeGuardUntil || 0) - Date.now())
              : null,
          welcomeGuardHoldRemainingMs:
            typeof finishedGalleryWelcomeGuardHoldStaleUntil !== "undefined"
              ? Math.max(0, Number(finishedGalleryWelcomeGuardHoldStaleUntil || 0) - Date.now())
              : null,
          presetGalleryHiddenRemainingMs:
            typeof simpleAIPresetSwitchGalleryHiddenUntil !== "undefined"
              ? Math.max(0, Number(simpleAIPresetSwitchGalleryHiddenUntil || 0) - Date.now())
              : null,
        };
      } catch (error) {}
      return {
        label: labelName,
        at: Date.now(),
        performanceNow: Math.round(now),
        window: {
          scrollX: Math.round(window.scrollX || 0),
          scrollY: Math.round(window.scrollY || 0),
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
        },
        classes: {
          galleryWelcomePending: rootClassList.includes("simpai-gallery-browser-welcome-pending"),
          galleryLoadingSilent: rootClassList.includes("simpai-gallery-browser-loading-silent"),
          galleryOverlayActive: rootClassList.includes("simpai-gallery-browser-overlay-active"),
          galleryHasMedia: rootClassList.includes("simpai-gallery-browser-has-media"),
          mainGalleryBrowserClosed: rootClassList.includes("simpai-main-gallery-browser-closed"),
          comparisonPreview: rootClassList.includes("simpai-comparison-preview"),
          postGenerationResultSurface: rootClassList.includes("simpai-post-generation-result-surface"),
          presetNavActive: rootClassList.includes("simpai-preset-nav-active"),
        },
        catalog: readCatalog(),
        toolbar: elementState(selectors.galleryToolbar, ""),
        folder: readDropdown(selectors.galleryFolder),
        status,
        buttons: {
          images,
          videos,
          previousFolder: readButton(selectors.galleryPrevFolderButton),
          nextFolder: readButton(selectors.galleryNextFolderButton),
          refresh: readButton(selectors.galleryRefreshButton),
          more: readButton(selectors.galleryMoreButton),
          compare: readButton(selectors.compareButton),
          generate: readButton(selectors.generateButton),
        },
        mode,
        preview: elementState(selectors.preview),
        welcomePlaceholder: elementState(selectors.welcomePlaceholder),
        finishedGallery: elementState(selectors.finishedGallery),
        finalGallery: elementState(selectors.finalGallery),
        videoPlayer: elementState(selectors.videoPlayer),
        progressVideo: elementState(selectors.progressVideo),
        comparisonBox: elementState(selectors.comparisonBox),
        sceneCanvas: elementState(selectors.sceneCanvas),
        imageToolbox: elementState(selectors.imageToolbox, ""),
        promptInfoBox: elementState(selectors.promptInfoBox, ""),
        scenePanel: elementState(selectors.scenePanel, ""),
        gradioStatusMonitor: elementState(selectors.gradioStatusMonitor, ""),
        progressBar: elementState(selectors.progressBar, ""),
        layout: {
          previewThumbnails: measurePreviewThumbnailLayout(),
        },
        frost: measureGalleryFrostState(),
        bridges: {
          payload: elementState(selectors.galleryPayloadBridge, ""),
          state: elementState(selectors.galleryStateBridge, ""),
          mediaSwitchRequest: elementState(selectors.galleryMediaSwitchRequest, ""),
          index: elementState(selectors.galleryIndexBridge, ""),
          indexStat: elementState(selectors.galleryIndexStat, ""),
          payloadJson: parseBridgeValue(selectors.galleryPayloadBridge),
          stateJson: parseBridgeValue(selectors.galleryStateBridge),
          mediaSwitchRequestJson: parseBridgeValue(selectors.galleryMediaSwitchRequest),
        },
        runtime: {
          eventSeq: Number(window.__simpaiGalleryHealthEventSeq || 0),
          galleryLatestRequestCapable: typeof refreshFinishedGalleryBrowserLatest === "function",
          galleryBusyGuardCapable: typeof guardFinishedGalleryBrowserBusyInteraction === "function",
          galleryBusyGuardBound: !!(
            (
              (typeof gradioApp === "function" ? gradioApp() : null) ||
              document
            )?.__simpleaiGalleryBrowserBusyGuardBound ||
            window.__simpleaiGalleryBrowserBusyGuardBound
          ),
          mediaSwitchRequest: window.__simpleaiGalleryMediaSwitchRequest || null,
          mediaSwitchSuppressRefresh: window.__simpleaiGalleryMediaSwitchSuppressRefresh || null,
          galleryPreviewOpenPendingUntil: Number(window.__simpleaiGalleryPreviewOpenPendingUntil || 0),
          topbarSystemParams: window.simpleaiTopbarSystemParams
            ? {
                galleryState: window.simpleaiTopbarSystemParams.gallery_state || "",
                galleryFolder: window.simpleaiTopbarSystemParams.__main_gallery_browser_folder || "",
            galleryPathCount: Array.isArray(window.simpleaiTopbarSystemParams.__main_gallery_browser_paths)
              ? window.simpleaiTopbarSystemParams.__main_gallery_browser_paths.length
              : null,
            galleryFolders: Array.isArray(window.simpleaiTopbarSystemParams.__main_gallery_browser_folders)
              ? window.simpleaiTopbarSystemParams.__main_gallery_browser_folders.slice(0, 80)
              : [],
            galleryFoldersCount: Array.isArray(window.simpleaiTopbarSystemParams.__main_gallery_browser_folders)
              ? window.simpleaiTopbarSystemParams.__main_gallery_browser_folders.length
              : null,
            galleryFirstPathFolder: pathFolder(galleryPaths[0] || ""),
                gallerySelectedPath: selectedPath,
                gallerySelectedPathFolder: pathFolder(selectedPath),
                galleryEngineType:
                  window.simpleaiTopbarSystemParams.__gallery_engine_type || window.simpleaiTopbarSystemParams.engine_type || "",
                galleryHasMore: !!window.simpleaiTopbarSystemParams.__main_gallery_browser_has_more,
                galleryNextOffset: Number(window.simpleaiTopbarSystemParams.__main_gallery_browser_next_offset || 0),
                postGenerationHasOutput: !!window.simpleaiTopbarSystemParams.__post_generation_has_output,
                postGenerationGalleryOutput: !!window.simpleaiTopbarSystemParams.__post_generation_gallery_output,
                postGenerationCompareReady: !!window.simpleaiTopbarSystemParams.__post_generation_compare_ready,
                postGenerationCompareVisible: !!window.simpleaiTopbarSystemParams.__post_generation_compare_visible,
                postGenerationImageUrl: window.simpleaiTopbarSystemParams.__post_generation_image_url || "",
              }
            : null,
          localGalleryBrowserState,
          internalTimers,
        },
      };
    },
    { selectors: SELECTORS, contract: GRADIO6_DOM_CONTRACT, labelName: label }
      );
      break;
    } catch (error) {
      lastError = error;
      if (!isRecoverableSnapshotError(error) || attempt >= 3) throw error;
      await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(240 * attempt);
    }
  }
  if (!dom) throw lastError || new Error("Gallery snapshot failed.");
  let mutation = null;
  try {
    mutation = await mutationState(page);
  } catch (error) {
    if (!isRecoverableSnapshotError(error)) throw error;
    await page.waitForTimeout(240);
    mutation = await mutationState(page).catch(() => null);
  }
  return { ...dom, mutation };
}

function hasRenderedMedia(snapshot) {
  const mediaVisible = (state) => !!(state && ((state.visible && state.mediaCount > 0) || state.visibleMediaCount > 0));
  return !!(
    mediaVisible(snapshot.finishedGallery) ||
    mediaVisible(snapshot.finalGallery) ||
    mediaVisible(snapshot.videoPlayer)
  );
}

function renderedVisibleMediaCount(snapshot) {
  return [
    snapshot?.finishedGallery,
    snapshot?.finalGallery,
    snapshot?.videoPlayer,
  ].reduce((total, state) => total + (state?.visible ? Number(state.visibleMediaCount || state.mediaCount || 0) : 0), 0);
}

function deriveCounts(snapshot) {
  const runtimeLoaded = snapshot?.runtime?.localGalleryBrowserState
    ? Number(snapshot.runtime.localGalleryBrowserState.loaded)
    : null;
  return {
    catalogTotal: snapshot?.catalog?.totalCount ?? null,
    statusCount: parseMediaCount(snapshot?.status?.text || ""),
    runtimeLoaded: Number.isFinite(runtimeLoaded) ? runtimeLoaded : null,
    renderedVisibleMediaCount: renderedVisibleMediaCount(snapshot),
    renderedMediaCount:
      Number(snapshot?.finishedGallery?.mediaCount || 0) +
      Number(snapshot?.finalGallery?.mediaCount || 0) +
      Number(snapshot?.videoPlayer?.mediaCount || 0),
  };
}

function representativeGalleryCount(counts) {
  if (!counts) return null;
  for (const key of ["statusCount", "runtimeLoaded", "renderedVisibleMediaCount"]) {
    const value = Number(counts[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function expectedFixtureLoadedCount(fixtures, folder, mediaType = "image", limit = 36) {
  if (!fixtures?.enabled || !fixtures.expectedCounts) return null;
  const folderCounts = fixtures.expectedCounts[String(folder || "")];
  if (!folderCounts) return null;
  const raw = Number(folderCounts[mediaType === "video" ? "video" : "image"]);
  if (!Number.isFinite(raw)) return null;
  return Math.min(raw, Math.max(1, Number(limit || 36)));
}

function activeTransient(snapshot) {
  return !!(
    snapshot.classes?.galleryWelcomePending ||
    snapshot.classes?.galleryLoadingSilent ||
    snapshot.classes?.galleryOverlayActive ||
    /\bloading\b|加载|处理中|waiting|queue|pending/i.test(snapshot.status?.text || "") ||
    snapshot.runtime?.localGalleryBrowserState?.loading ||
    snapshot.runtime?.localGalleryBrowserState?.pendingPayload
  );
}

function semanticallySettledGallerySnapshot(snapshot) {
  if (!snapshot || snapshot.snapshotError) return false;
  if (activeTransient(snapshot)) return false;
  if (snapshot.preview?.visible && hasRenderedMedia(snapshot)) return false;
  return true;
}

function onlyLowLevelMutationNoise(snapshot) {
  const mutation = snapshot?.mutation || null;
  if (!mutation || mutation.quietMs >= config.settleMs) return false;
  if (Number(mutation.mutationCount || 0) > config.maxMutationCount) return false;
  return semanticallySettledGallerySnapshot(snapshot);
}

function isQuietSnapshot(snapshot) {
  if (!snapshot) return false;
  if (snapshot.snapshotError) return false;
  if (activeTransient(snapshot)) return false;
  if (snapshot.mutation && snapshot.mutation.quietMs < config.settleMs && !onlyLowLevelMutationNoise(snapshot)) return false;
  if (snapshot.preview?.visible && hasRenderedMedia(snapshot)) return false;
  return true;
}

function makeSnapshotError(label, error) {
  return {
    label,
    at: Date.now(),
    snapshotError: {
      name: error?.name || "Error",
      message: error?.message || String(error || "snapshot failed"),
      stack: String(error?.stack || "").slice(0, 2000),
    },
    classes: {},
    catalog: { exists: false, visible: false, totalCount: null },
    toolbar: { exists: false, visible: false },
    folder: { exists: false, visible: false, value: "", text: "", options: [] },
    status: { exists: false, visible: false, text: "" },
    buttons: {},
    mode: "",
    preview: { exists: false, visible: false },
    welcomePlaceholder: { exists: false, visible: false },
    finishedGallery: { exists: false, visible: false, mediaCount: 0, visibleMediaCount: 0 },
    finalGallery: { exists: false, visible: false, mediaCount: 0, visibleMediaCount: 0 },
    videoPlayer: { exists: false, visible: false, mediaCount: 0, visibleMediaCount: 0 },
    progressVideo: { exists: false, visible: false, mediaCount: 0, visibleMediaCount: 0 },
    imageToolbox: { exists: false, visible: false },
    promptInfoBox: { exists: false, visible: false },
    scenePanel: { exists: false, visible: false },
    gradioStatusMonitor: { exists: false, visible: false },
    progressBar: { exists: false, visible: false },
    bridges: {},
    runtime: {},
    mutation: null,
  };
}

async function snapshotGalleryHealthForCheck(page, label) {
  try {
    return await withTimeout(snapshotGalleryHealth(page, label), config.actionTimeoutMs, `snapshot ${label}`);
  } catch (error) {
    return makeSnapshotError(label, error);
  }
}

function countTransitions(samples, getter) {
  const sentinel = Symbol("initial");
  let previous = sentinel;
  let count = 0;
  for (const sample of samples) {
    const value = getter(sample);
    if (previous !== sentinel && value !== previous) count += 1;
    previous = value;
  }
  return count;
}

function longestActiveMs(samples, getter) {
  let startedAt = 0;
  let longest = 0;
  let previousAt = 0;
  for (const sample of samples) {
    const active = !!getter(sample);
    if (active && !startedAt) startedAt = sample.at;
    if (!active && startedAt) {
      longest = Math.max(longest, (previousAt || sample.at) - startedAt);
      startedAt = 0;
    }
    previousAt = sample.at;
  }
  if (startedAt) longest = Math.max(longest, (previousAt || Date.now()) - startedAt);
  return Math.round(longest);
}

function uniqueSequence(samples, getter) {
  const values = [];
  for (const sample of samples) {
    const value = compactText(getter(sample), 180);
    if (!values.length || values[values.length - 1] !== value) values.push(value);
  }
  return values;
}

function enabledGalleryControls(snapshot) {
  const buttons = snapshot?.buttons || {};
  return Object.entries(buttons)
    .filter(([, button]) => button && button.exists && button.visible && !button.disabled)
    .map(([name]) => name);
}

function visibleCatalogLinkedSurfaces(snapshot) {
  const rows = [
    ["finishedGallery", snapshot?.finishedGallery],
    ["finalGallery", snapshot?.finalGallery],
    ["videoPlayer", snapshot?.videoPlayer],
    ["progressVideo", snapshot?.progressVideo],
    ["galleryToolbar", snapshot?.toolbar],
  ];
  return rows
    .filter(([, state]) => state?.exists && state.visible && Number(state.width || 0) > 0 && Number(state.height || 0) > 0)
    .map(([name, state]) => ({
      name,
      width: state.width,
      height: state.height,
      mediaCount: state.mediaCount,
      visibleMediaCount: state.visibleMediaCount,
      text: compactText(state.text || "", 120),
      className: compactText(state.className || "", 160),
      display: state.display || "",
      visibility: state.visibility || "",
    }));
}

function hasLatestRequestControlStrategy(samples) {
  return (samples || []).some((sample) => {
    const runtime = sample?.runtime || {};
    return !!(runtime.galleryLatestRequestCapable && runtime.galleryBusyGuardCapable && runtime.galleryBusyGuardBound);
  });
}

function makeViolation(check, severity, code, message, evidence = {}) {
  return {
    check,
    severity,
    code,
    message,
    evidence,
  };
}

const ACTION_RECOMMENDATION_RULES = Object.freeze([
  {
    code: "gallery_async_wait_hint_recommended",
    action: "show_wait_hint",
    priority: "high",
    triggerCodes: [
      "transient_state_stuck_after_guard",
      "welcome_or_loading_guard_lasted_too_long",
      "preview_and_gallery_overlap",
      "gallery_did_not_reach_quiet_window",
      "gallery_loading_without_visible_wait_hint",
    ],
    message: "Show a visible waiting state while Gradio gallery callbacks are pending.",
    implementation: ["show progress/wait text", "keep stable layout height", "clear wait state only after rendered media and state_topbar agree"],
  },
  {
    code: "gallery_action_queue_recommended",
    action: "serialize_gallery_actions",
    priority: "high",
    triggerCodes: [
      "gallery_capsule_mode_rollback",
      "gallery_browser_state_mode_mismatch",
      "folder_status_media_type_mismatch",
      "gallery_folder_rollback",
      "gallery_folder_did_not_change",
      "folder_status_runtime_count_mismatch",
      "folder_rendered_visible_count_mismatch",
      "folder_video_visible_media_missing",
      "folder_zero_count_rendered_media_leftover",
      "folder_status_text_unchanged_after_folder_change",
      "empty_folder_rendered_media_leftover",
      "catalog_total_changed_during_folder_actions",
      "folder_status_stale_candidate",
      "open_folder_current_folder_state_mismatch",
      "open_folder_current_folder_state_missing",
      "open_folder_gallery_state_not_main_browser",
      "open_folder_selected_path_folder_mismatch",
      "gallery_first_path_folder_mismatch",
      "gallery_active_request_payload_mismatch",
      "gallery_pending_payload_without_loading",
      "gallery_queued_options_left_after_idle",
      "gallery_controls_enabled_while_loading",
      "gradio_gallery_event_missing",
      "gradio_gallery_event_queue_mismatch",
      "webui_gallery_callback_contract_mismatch",
      "toolbox_open_output_folder_contract_mismatch",
    ],
    message: "Serialize folder/media actions and keep only one active gallery request at a time.",
    implementation: ["disable repeat clicks while loading", "store one queued action", "apply queued action after active request finishes"],
  },
  {
    code: "gallery_stale_callback_guard_recommended",
    action: "drop_stale_callbacks",
    priority: "high",
    triggerCodes: [
      "gallery_active_request_payload_mismatch",
      "gallery_pending_payload_without_loading",
      "gallery_queued_options_left_after_idle",
      "empty_folder_rendered_media_leftover",
      "open_folder_selected_path_folder_mismatch",
    ],
    message: "Ignore stale Gradio callback results when request_id, folder, media type, or selected path no longer matches the active state.",
    implementation: ["compare request_id before applying state", "compare folder/media_type before updating buttons", "do not overwrite newer state with stale callback data"],
  },
  {
    code: "gallery_preview_surface_separation_recommended",
    action: "separate_preview_and_gallery_surface",
    priority: "medium",
    triggerCodes: [
      "preview_generating_visible_with_rendered_media",
      "preview_generating_hidden_but_occupies_layout",
      "preview_generating_flicker",
      "preview_and_gallery_overlap",
      "gallery_preview_thumbnails_missing",
      "gallery_preview_thumbnails_not_centered",
      "gallery_preview_thumbnails_not_scrollable",
      "gallery_preview_thumbnails_scroll_did_not_move",
      "gallery_preview_thumbnails_scroll_overflow_disabled",
      "gallery_preview_narrow_viewport_not_applied",
      "gallery_preview_narrow_layout_outside_viewport",
      "gallery_preview_narrow_layout_overlap",
      "gallery_frost_reveal_missing",
      "gallery_frost_reveal_not_preserved",
      "finished_catalog_not_closed_after_action",
      "finished_catalog_label_body_state_mismatch",
      "gallery_browser_visible_after_catalog_close",
      "comparison_box_not_visible_after_compare",
      "gallery_browser_visible_during_comparison",
      "comparison_uses_gallery_browser_state",
      "welcome_or_loading_guard_lasted_too_long",
      "empty_folder_rendered_media_leftover",
      "folder_zero_count_rendered_media_leftover",
    ],
    message: "Keep preview_generating and rendered gallery media in separate, explicitly controlled surface states.",
    implementation: ["do not let preview_generating occupy layout after media is rendered", "avoid repeated display toggles", "release welcome/loading guard from one state transition"],
  },
  {
    code: "gallery_scene_panel_guard_recommended",
    action: "preserve_scene_panel_visibility",
    priority: "high",
    triggerCodes: ["scene_panel_hidden_by_gallery_action"],
    message: "Gallery actions must not hide scene_panel or scene-owned layout.",
    implementation: ["scope gallery visibility writes to gallery elements", "exclude scene_panel from catalog cleanup selectors"],
  },
  {
    code: "gallery_native_drag_contract_recommended",
    action: "preserve_internal_and_external_drag_responsiveness",
    priority: "high",
    triggerCodes: [
      "imageviewer_native_drag_contract_mismatch",
      "native_drag_datatransfer_unavailable",
      "native_drag_image_not_draggable",
      "native_drag_image_not_marked",
      "native_drag_missing_original_url_payload",
      "native_drag_preview_missing_original_download",
      "native_drag_preview_download_not_original",
      "native_drag_unexpected_downloadurl",
      "native_drag_default_prevented",
      "native_drag_external_handle_present",
      "native_drag_state_residue",
      "native_drag_live_responsiveness_timeout",
      "native_drag_contract_runtime_error",
    ],
    message: "Keep gallery images as the native drag source for both page and external targets.",
    implementation: [
      "keep gallery images draggable=true without adding visible drag controls",
      "preserve the browser native payload while adding original URL text types",
      "use DownloadURL for memory previews and direct images above the large-image threshold so Windows folders receive the original file",
      "avoid source replacement, setDragImage, clearData, pointer capture, and layout writes during dragstart",
    ],
  },
]);

function buildActionRecommendations(checks, globalViolations = []) {
  const allViolations = checks.flatMap((check) => check.violations || []).concat(globalViolations || []);
  const severityRank = { fail: 2, warn: 1 };
  return ACTION_RECOMMENDATION_RULES.map((rule) => {
    const matched = allViolations.filter((violation) => rule.triggerCodes.includes(violation.code));
    if (!matched.length) return null;
    const severity = matched.some((violation) => violation.severity === "fail") ? "fail" : "warn";
    return {
      code: rule.code,
      action: rule.action,
      priority: rule.priority,
      severity,
      message: rule.message,
      implementation: rule.implementation,
      triggerCodes: [...new Set(matched.map((violation) => violation.code))],
      checks: [...new Set(matched.map((violation) => violation.check))],
      evidenceCount: matched.length,
      firstEvidence: matched
        .slice()
        .sort((a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0))[0],
    };
  }).filter(Boolean);
}

function analyzeCheck(record, options = {}) {
  const samples = record.samples || [];
  const violations = [];
  const hiddenPreviewOccupiesLayout = (snapshot) => !!(
    snapshot?.preview?.exists
    && !snapshot.preview.visible
    && snapshot.preview.display !== "none"
    && snapshot.preview.width > 0
    && snapshot.preview.height > 0
  );
  const transitions = {
    previewVisible: countTransitions(samples, (sample) => !!sample.preview?.visible),
    finishedGalleryVisible: countTransitions(samples, (sample) => !!sample.finishedGallery?.visible),
    finalGalleryVisible: countTransitions(samples, (sample) => !!sample.finalGallery?.visible),
    videoVisible: countTransitions(samples, (sample) => !!sample.videoPlayer?.visible),
    comparisonVisible: countTransitions(samples, (sample) => !!sample.comparisonBox?.visible),
    catalogVisible: countTransitions(samples, (sample) => !!sample.catalog?.visible),
    mode: countTransitions(samples, (sample) => sample.mode || ""),
    imageButtonActive: countTransitions(samples, (sample) => !!sample.buttons?.images?.active),
    videoButtonActive: countTransitions(samples, (sample) => !!sample.buttons?.videos?.active),
    catalogTotal: countTransitions(samples, (sample) => sample.catalog?.totalCount),
    folderValue: countTransitions(samples, (sample) => sample.folder?.value || ""),
    statusText: countTransitions(samples, (sample) => sample.status?.text || ""),
    loading: countTransitions(samples, (sample) => !!sample.runtime?.localGalleryBrowserState?.loading),
    pendingPayload: countTransitions(samples, (sample) => !!sample.runtime?.localGalleryBrowserState?.pendingPayload),
    queuedOptions: countTransitions(samples, (sample) => !!sample.runtime?.localGalleryBrowserState?.queuedOptions),
    activeRequestId: countTransitions(samples, (sample) => sample.runtime?.localGalleryBrowserState?.activeRequestId ?? 0),
    bridgePayload: countTransitions(samples, (sample) => sample.bridges?.payload?.value || ""),
  };
  const longest = {
    welcomePendingMs: longestActiveMs(samples, (sample) => sample.classes?.galleryWelcomePending),
    loadingSilentMs: longestActiveMs(samples, (sample) => sample.classes?.galleryLoadingSilent),
    overlayActiveMs: longestActiveMs(samples, (sample) => sample.classes?.galleryOverlayActive),
    catalogMountedHiddenMs: longestActiveMs(samples, (sample) => sample.catalog?.exists && !sample.catalog?.visible),
    browserLoadingMs: longestActiveMs(samples, (sample) => sample.runtime?.localGalleryBrowserState?.loading),
    pendingPayloadMs: longestActiveMs(samples, (sample) => sample.runtime?.localGalleryBrowserState?.pendingPayload),
    queuedOptionsMs: longestActiveMs(samples, (sample) => sample.runtime?.localGalleryBrowserState?.queuedOptions),
    visibleWelcomePendingMs: longestActiveMs(samples, (sample) => sample.classes?.galleryWelcomePending && !sample.classes?.galleryLoadingSilent && sample.preview?.visible),
    controlsEnabledWhileLoadingMs: longestActiveMs(
      samples,
      (sample) =>
        (sample.runtime?.localGalleryBrowserState?.loading || sample.runtime?.localGalleryBrowserState?.pendingPayload) &&
        enabledGalleryControls(sample).length > 0
    ),
    progressVisibleMs: longestActiveMs(samples, (sample) => sample.progressBar?.visible || sample.gradioStatusMonitor?.visible),
    previewVisibleWithMediaMs: longestActiveMs(samples, (sample) => sample.preview?.visible && hasRenderedMedia(sample)),
    hiddenPreviewOccupyingLayoutMs: longestActiveMs(samples, hiddenPreviewOccupiesLayout),
  };
  const statusSequence = uniqueSequence(samples, (sample) => sample.status?.text || "");
  const modeSequence = uniqueSequence(samples, (sample) => sample.mode || "");
  const folderSequence = uniqueSequence(samples, (sample) => sample.folder?.value || sample.folder?.text || "");
  const totalSequence = uniqueSequence(samples, (sample) => String(sample.catalog?.totalCount ?? ""));
  const countSequence = uniqueSequence(samples, (sample) => JSON.stringify(deriveCounts(sample)));
  const requestIdSequence = uniqueSequence(samples, (sample) => String(sample.runtime?.localGalleryBrowserState?.activeRequestId ?? ""));
  const pendingPayloadSequence = uniqueSequence(samples, (sample) =>
    JSON.stringify(sample.runtime?.localGalleryBrowserState?.pendingPayloadValue || sample.bridges?.payloadJson?.json || null)
  );
  const controlsEnabledWhileLoading = [...new Set(
    samples
      .filter((sample) => sample.runtime?.localGalleryBrowserState?.loading || sample.runtime?.localGalleryBrowserState?.pendingPayload)
      .flatMap((sample) => enabledGalleryControls(sample))
  )];
  const latestRequestControlStrategy = hasLatestRequestControlStrategy(samples);
  const after = record.after;
  const beforeCounts = deriveCounts(record.before);
  const afterCounts = deriveCounts(after);
  const actionUnavailable = /unavailable|not available|not_available|disabled|option_missing|missing_/i.test(String(record.skipReason || ""));
  const evaluateActionResult = !(record.skipped && actionUnavailable);
  const skippedUnavailableAction = record.skipped && actionUnavailable;
  const previewOpenSemanticIdle = !!(options.allowPreviewOpen && after?.layout?.previewThumbnails?.exists && !activeTransient(after));
  const frostRevealSemanticIdle = !!(
    options.expectFrostRevealed &&
    !activeTransient(after) &&
    after?.frost?.enabled &&
    (after.frost.galleries || []).some((gallery) => gallery.visible && gallery.itemCount > 1 && gallery.revealed)
  );
  const semanticDomIdle = previewOpenSemanticIdle || frostRevealSemanticIdle;

  if (record.actionError) {
    violations.push(makeViolation(record.label, "fail", "action_error", record.actionError.message, record.actionError));
  }

  if (record.snapshotError || after?.snapshotError) {
    violations.push(
      makeViolation(
        record.label,
        "fail",
        "snapshot_error",
        "Gallery snapshot could not be collected before the timeout",
        record.snapshotError || after.snapshotError
      )
    );
  }

  if (after?.catalog?.exists && !after.catalog.visible) {
    const shouldBeInteractive = !!(
      options.expectCatalogOpen ||
      options.folderProbe ||
      /^open-catalog|^reopen-catalog|media-switch|refresh-|same-folder|load-more|rapid-|folder-/.test(record.label)
    );
    violations.push(
      makeViolation(
        record.label,
        shouldBeInteractive ? "fail" : "warn",
        "gallery_catalog_mounted_but_hidden",
        "Finished catalog is mounted but hidden after the action",
        {
          display: after.catalog.display,
          visibility: after.catalog.visibility,
          className: after.catalog.className,
          dataset: after.catalog.dataset || {},
          simpleaiPresetSwitchCatalogCollapsed: after.catalog.dataset?.simpleaiPresetSwitchCatalogCollapsed || "",
          styleText: after.catalog.styleText || "",
          labelText: after.catalog.labelText || "",
          text: after.catalog.text || "",
          transitions: transitions.catalogVisible,
          longestHiddenMs: longest.catalogMountedHiddenMs,
          skipReason: record.skipReason || "",
        }
      )
    );
  }

  if (options.expectCatalogOpen && after?.catalog?.exists && (!after.catalog.labelOpen || !after.catalog.bodyVisible)) {
    violations.push(
      makeViolation(record.label, "fail", "finished_catalog_not_open_after_action", "Finished catalog did not stay open after the action", {
        labelOpen: after.catalog.labelOpen,
        bodyVisible: after.catalog.bodyVisible,
      })
    );
  }

  if (after?.catalog?.exists && after.catalog.visible && after.catalog.labelOpen !== after.catalog.bodyVisible) {
    violations.push(
      makeViolation(record.label, "fail", "finished_catalog_label_body_state_mismatch", "Finished catalog arrow/open state does not match the body visibility", {
        labelOpen: after.catalog.labelOpen,
        bodyVisible: after.catalog.bodyVisible,
        className: after.catalog.className,
        dataset: after.catalog.dataset || {},
        labelText: after.catalog.labelText || "",
        height: after.catalog.height,
      })
    );
  }

  if (options.expectCatalogClosed && after?.catalog?.exists) {
    if (after.catalog.labelOpen || after.catalog.bodyVisible) {
      violations.push(
        makeViolation(record.label, "fail", "finished_catalog_not_closed_after_action", "Finished catalog stayed open after the close action", {
          labelOpen: after.catalog.labelOpen,
          bodyVisible: after.catalog.bodyVisible,
          className: after.catalog.className,
          dataset: after.catalog.dataset || {},
          labelText: after.catalog.labelText || "",
        })
      );
    }
    const visibleSurfaces = visibleCatalogLinkedSurfaces(after);
    if (visibleSurfaces.length) {
      violations.push(
        makeViolation(record.label, "fail", "gallery_browser_visible_after_catalog_close", "Gallery browser surfaces are still visible after the catalog was closed", {
          visibleSurfaces,
          classes: after.classes || {},
          status: after.status?.text || "",
          runtime: after.runtime?.localGalleryBrowserState || null,
        })
      );
    }
  }

  if (!record.settled && !semanticDomIdle) {
    violations.push(
      makeViolation(record.label, skippedUnavailableAction ? "warn" : activeTransient(after) ? "fail" : "warn", "gallery_did_not_reach_quiet_window", "Gallery did not reach a quiet observation window before the guard expired", {
        guardMs: record.guardMs,
        mutation: after?.mutation || null,
        classes: after?.classes || null,
        status: after?.status?.text || "",
      })
    );
  }

  if (after?.preview?.visible && hasRenderedMedia(after) && after.preview.height > config.previewLayoutMaxHeight) {
    violations.push(
      makeViolation(record.label, "fail", "preview_generating_visible_with_rendered_media", "preview_generating is still occupying layout while media is rendered", {
        previewHeight: after.preview.height,
        finishedMediaCount: after.finishedGallery.mediaCount,
        finalMediaCount: after.finalGallery.mediaCount,
        videoMediaCount: after.videoPlayer.mediaCount,
      })
    );
  }

  const hiddenPreviewLayoutEvidence = [after, ...samples]
    .filter(hiddenPreviewOccupiesLayout)
    .sort((a, b) => (b.preview?.height || 0) - (a.preview?.height || 0))[0];
  if (hiddenPreviewLayoutEvidence) {
    violations.push(
      makeViolation(record.label, "fail", "preview_generating_hidden_but_occupies_layout", "Hidden preview_generating is still reserving layout space", {
        preview: hiddenPreviewLayoutEvidence.preview,
        longestMs: longest.hiddenPreviewOccupyingLayoutMs,
        finishedMediaCount: hiddenPreviewLayoutEvidence.finishedGallery?.mediaCount || 0,
        finalMediaCount: hiddenPreviewLayoutEvidence.finalGallery?.mediaCount || 0,
      })
    );
  }

  if (after?.buttons?.images?.exists && after?.buttons?.videos?.exists) {
    if (after.buttons.images.active === after.buttons.videos.active) {
      violations.push(
        makeViolation(record.label, "fail", "gallery_capsule_ambiguous_state", "Image and video capsule buttons are not mutually exclusive", {
          images: after.buttons.images,
          videos: after.buttons.videos,
          mode: after.mode,
        })
      );
    }
  }

  if (
    evaluateActionResult &&
    afterCounts.statusCount !== null &&
    afterCounts.runtimeLoaded !== null &&
    afterCounts.statusCount !== afterCounts.runtimeLoaded
  ) {
    violations.push(
      makeViolation(record.label, "fail", "folder_status_runtime_count_mismatch", "Gallery status count does not match the runtime loaded count", {
        statusCount: afterCounts.statusCount,
        runtimeLoaded: afterCounts.runtimeLoaded,
        status: after?.status?.text || "",
        runtime: after?.runtime?.localGalleryBrowserState || null,
      })
    );
  }

  const checksRenderedCounts = !!(
    evaluateActionResult &&
    !options.allowPreviewOpen &&
    after &&
    /^open-catalog|^reopen-catalog|media-switch|refresh-|same-folder|load-more|rapid-|folder-/.test(record.label)
  );
  const expectedRenderedCount = afterCounts.statusCount ?? afterCounts.runtimeLoaded;
  if (checksRenderedCounts && expectedRenderedCount !== null) {
    if (after?.mode === "image" && afterCounts.renderedVisibleMediaCount !== expectedRenderedCount) {
      violations.push(
        makeViolation(record.label, "fail", "folder_rendered_visible_count_mismatch", "Image gallery visible media count does not match the status count", {
          mode: after.mode,
          status: after?.status?.text || "",
          statusCount: afterCounts.statusCount,
          runtimeLoaded: afterCounts.runtimeLoaded,
          renderedVisibleMediaCount: afterCounts.renderedVisibleMediaCount,
          renderedMediaCount: afterCounts.renderedMediaCount,
          finishedGallery: after?.finishedGallery || null,
          finalGallery: after?.finalGallery || null,
        })
      );
    }
    if (after?.mode === "video" && expectedRenderedCount === 0 && afterCounts.renderedVisibleMediaCount > 0) {
      violations.push(
        makeViolation(record.label, "fail", "folder_zero_count_rendered_media_leftover", "Video gallery reported zero items but rendered media is still visible", {
          mode: after.mode,
          status: after?.status?.text || "",
          statusCount: afterCounts.statusCount,
          runtimeLoaded: afterCounts.runtimeLoaded,
          renderedVisibleMediaCount: afterCounts.renderedVisibleMediaCount,
          renderedMediaCount: afterCounts.renderedMediaCount,
          videoPlayer: after?.videoPlayer || null,
          finishedGallery: after?.finishedGallery || null,
        })
      );
    }
    if (after?.mode === "video" && expectedRenderedCount > 0 && afterCounts.renderedVisibleMediaCount <= 0) {
      violations.push(
        makeViolation(record.label, "fail", "folder_video_visible_media_missing", "Video gallery reported items but no visible media was rendered", {
          mode: after.mode,
          status: after?.status?.text || "",
          statusCount: afterCounts.statusCount,
          runtimeLoaded: afterCounts.runtimeLoaded,
          renderedVisibleMediaCount: afterCounts.renderedVisibleMediaCount,
          renderedMediaCount: afterCounts.renderedMediaCount,
          videoPlayer: after?.videoPlayer || null,
        })
      );
    }
  }

  if (
    evaluateActionResult &&
    options.folderProbe &&
    afterCounts.renderedVisibleMediaCount > 0 &&
    (
      afterCounts.statusCount === 0 ||
      afterCounts.runtimeLoaded === 0 ||
      /\b0\s*(?:张图片|张图|图片|items?|images?|个视频|视频)\b/i.test(after?.status?.text || "")
    )
  ) {
    violations.push(
      makeViolation(record.label, "fail", "empty_folder_rendered_media_leftover", "Empty gallery folder still has rendered media nodes", {
        folder: after?.folder?.value || after?.folder?.text || "",
        status: after?.status?.text || "",
        statusCount: afterCounts.statusCount,
        runtimeLoaded: afterCounts.runtimeLoaded,
        renderedVisibleMediaCount: afterCounts.renderedVisibleMediaCount,
        renderedMediaCount: afterCounts.renderedMediaCount,
        finishedGallery: after?.finishedGallery || null,
        finalGallery: after?.finalGallery || null,
        videoPlayer: after?.videoPlayer || null,
      })
    );
  }

  if (after && activeTransient(after)) {
    violations.push(
      makeViolation(record.label, skippedUnavailableAction ? "warn" : "fail", "transient_state_stuck_after_guard", "Gallery transient state remained active after the guard window", {
        classes: after.classes,
        status: after.status?.text || "",
        runtime: after.runtime?.localGalleryBrowserState || null,
      })
    );
  }

  const afterBrowserState = after?.runtime?.localGalleryBrowserState || null;
  const afterPendingPayload = afterBrowserState?.pendingPayloadValue || null;
  const afterQueuedOptions = afterBrowserState?.queuedOptionsValue || null;
  if (afterBrowserState && !afterBrowserState.loading && (afterBrowserState.pendingPayload || afterPendingPayload)) {
    violations.push(
      makeViolation(record.label, "fail", "gallery_pending_payload_without_loading", "Gallery has pending payload after loading ended", {
        runtime: afterBrowserState,
        bridgePayload: after?.bridges?.payloadJson || null,
        pendingPayloadSequence,
      })
    );
  }

  if (
    afterBrowserState &&
    afterPendingPayload &&
    Number(afterPendingPayload.request_id || 0) &&
    Number(afterBrowserState.activeRequestId || 0) &&
    Number(afterPendingPayload.request_id || 0) !== Number(afterBrowserState.activeRequestId || 0)
  ) {
    violations.push(
      makeViolation(record.label, "fail", "gallery_active_request_payload_mismatch", "Active request id does not match the pending payload request id", {
        activeRequestId: afterBrowserState.activeRequestId,
        pendingRequestId: afterPendingPayload.request_id,
        requestIdSequence,
        pendingPayloadSequence,
      })
    );
  }

  if (afterBrowserState && afterQueuedOptions && afterBrowserState.loading === false) {
    violations.push(
      makeViolation(record.label, "warn", "gallery_queued_options_left_after_idle", "Gallery queued options remained after loading ended", {
        runtime: afterBrowserState,
        queuedOptions: afterQueuedOptions,
      })
    );
  }

  if (longest.browserLoadingMs > config.guardHoldMaxMs && longest.progressVisibleMs === 0) {
    violations.push(
      makeViolation(record.label, "warn", "gallery_loading_without_visible_wait_hint", "Gallery loading lasted beyond the hold window without a visible progress or wait hint", {
        longest,
        thresholdMs: config.guardHoldMaxMs,
      })
    );
  }

  if (longest.controlsEnabledWhileLoadingMs > config.guardHoldMaxMs && !latestRequestControlStrategy) {
    violations.push(
      makeViolation(record.label, "warn", "gallery_controls_enabled_while_loading", "Gallery controls stayed clickable while a gallery request was loading", {
        enabledControls: controlsEnabledWhileLoading,
        longest,
        thresholdMs: config.guardHoldMaxMs,
      })
    );
  }

  if (
    evaluateActionResult &&
    options.folderProbe &&
    record.before?.folder?.value &&
    after?.folder?.value &&
    record.before.folder.value !== after.folder.value &&
    compactText(record.before.status?.text || "") === compactText(after.status?.text || "")
  ) {
    const beforeRepresentativeCount = representativeGalleryCount(beforeCounts);
    const afterRepresentativeCount = representativeGalleryCount(afterCounts);
    const countChanged =
      beforeRepresentativeCount !== null &&
      afterRepresentativeCount !== null &&
      beforeRepresentativeCount !== afterRepresentativeCount;
    if (countChanged) {
      violations.push(
        makeViolation(record.label, "warn", "folder_status_text_unchanged_after_folder_change", "Folder changed but gallery status text did not change", {
          beforeFolder: record.before.folder.value,
          afterFolder: after.folder.value,
          status: after.status?.text || "",
          beforeCounts,
          afterCounts,
        })
      );
    }
  }

  const currentFolder = normalizeFolderValue(after?.folder?.value || after?.folder?.text || "");
  const stateFolder = normalizeFolderValue(after?.runtime?.topbarSystemParams?.galleryFolder || "");
  const stateGalleryState = after?.runtime?.topbarSystemParams?.galleryState || "";
  const selectedPathFolder = normalizeFolderValue(after?.runtime?.topbarSystemParams?.gallerySelectedPathFolder || "");
  const firstPathFolder = normalizeFolderValue(after?.runtime?.topbarSystemParams?.galleryFirstPathFolder || "");
  if (evaluateActionResult && options.expectComparisonSurface) {
    if (!after?.comparisonBox?.visible || after.comparisonBox.width < 160 || after.comparisonBox.height < 160) {
      violations.push(
        makeViolation(record.label, "fail", "comparison_box_not_visible_after_compare", "Comparison box is not visible after clicking compare", {
          comparisonBox: after?.comparisonBox || null,
          classes: after?.classes || {},
          compareButton: after?.buttons?.compare || null,
        })
      );
    }
    const visibleSurfaces = visibleCatalogLinkedSurfaces(after);
    if (visibleSurfaces.length) {
      violations.push(
        makeViolation(record.label, "fail", "gallery_browser_visible_during_comparison", "Gallery browser surfaces are visible while comparison is open", {
          visibleSurfaces,
          comparisonBox: after?.comparisonBox || null,
          classes: after?.classes || {},
        })
      );
    }
    const topbar = after?.runtime?.topbarSystemParams || null;
    if (stateGalleryState === "main_browser" || Number(topbar?.galleryPathCount || 0) > 0) {
      violations.push(
        makeViolation(record.label, "fail", "comparison_uses_gallery_browser_state", "Comparison opened while state_topbar still points at the main gallery browser", {
          galleryState: stateGalleryState,
          galleryPathCount: topbar?.galleryPathCount ?? null,
          galleryFolder: topbar?.galleryFolder || "",
          gallerySelectedPath: topbar?.gallerySelectedPath || "",
          postGenerationImageUrl: topbar?.postGenerationImageUrl || "",
        })
      );
    }
  }
  if (evaluateActionResult && options.folderProbe && currentFolder && stateFolder && currentFolder !== stateFolder) {
    violations.push(
      makeViolation(record.label, "fail", "open_folder_current_folder_state_mismatch", "Current gallery folder is not reflected in state_topbar for open_output_folder", {
        currentFolder,
        stateFolder,
        rawCurrentFolder: after?.folder?.value || after?.folder?.text || "",
        rawStateFolder: after?.runtime?.topbarSystemParams?.galleryFolder || "",
      })
    );
  }

  if (
    evaluateActionResult &&
    options.expectedLoadedCount !== undefined &&
    options.expectedLoadedCount !== null &&
    Number.isFinite(Number(options.expectedLoadedCount))
  ) {
    const expectedLoadedCount = Number(options.expectedLoadedCount);
    const statusMatches = afterCounts.statusCount === null || Number(afterCounts.statusCount) === expectedLoadedCount;
    const runtimeMatches = afterCounts.runtimeLoaded === null || Number(afterCounts.runtimeLoaded) === expectedLoadedCount;
    const renderedMatches = Number(afterCounts.renderedVisibleMediaCount || 0) === expectedLoadedCount;
    if (!statusMatches || !runtimeMatches || !renderedMatches) {
      violations.push(
        makeViolation(record.label, "fail", "fixture_folder_count_mismatch", "Gallery count does not match the fixture folder contents", {
          folder: currentFolder,
          mode: after?.mode || "",
          expectedLoadedCount,
          afterCounts,
          status: after?.status?.text || "",
        })
      );
    }
  }

  if (evaluateActionResult && options.folderProbe && currentFolder && !stateFolder) {
    violations.push(
      makeViolation(record.label, "fail", "open_folder_current_folder_state_missing", "Current gallery folder is missing from state_topbar for open_output_folder", {
        currentFolder,
        rawCurrentFolder: after?.folder?.value || after?.folder?.text || "",
        topbarSystemParams: after?.runtime?.topbarSystemParams || null,
      })
    );
  }

  if (evaluateActionResult && options.folderProbe && currentFolder && stateGalleryState && stateGalleryState !== "main_browser") {
    violations.push(
      makeViolation(record.label, "fail", "open_folder_gallery_state_not_main_browser", "state_topbar is not marked as main_browser after a gallery folder action", {
        currentFolder,
        galleryState: stateGalleryState,
        topbarSystemParams: after?.runtime?.topbarSystemParams || null,
      })
    );
  }

  if (evaluateActionResult && options.folderProbe && currentFolder && selectedPathFolder && currentFolder !== selectedPathFolder) {
    violations.push(
      makeViolation(record.label, "fail", "open_folder_selected_path_folder_mismatch", "Selected media path points to a different folder than the current gallery folder", {
        currentFolder,
        selectedPathFolder,
        selectedPath: after?.runtime?.topbarSystemParams?.gallerySelectedPath || "",
        topbarSystemParams: after?.runtime?.topbarSystemParams || null,
      })
    );
  }

  if (evaluateActionResult && options.folderProbe && currentFolder && firstPathFolder && currentFolder !== firstPathFolder) {
    violations.push(
      makeViolation(record.label, "warn", "gallery_first_path_folder_mismatch", "First media path belongs to a different folder than the current gallery folder", {
        currentFolder,
        firstPathFolder,
        topbarSystemParams: after?.runtime?.topbarSystemParams || null,
      })
    );
  }

  const visibleWelcomeTooLong = longest.visibleWelcomePendingMs > config.guardHoldMaxMs;
  const hiddenLoadingWithoutProgressTooLong = longest.loadingSilentMs > config.guardHoldMaxMs && longest.progressVisibleMs === 0;
  if (visibleWelcomeTooLong || hiddenLoadingWithoutProgressTooLong) {
    violations.push(
      makeViolation(record.label, "warn", "welcome_or_loading_guard_lasted_too_long", "Gallery welcome/loading guard lasted longer than the configured hold window", {
        longest,
        thresholdMs: config.guardHoldMaxMs,
        visibleWelcomeTooLong,
        hiddenLoadingWithoutProgressTooLong,
      })
    );
  }

  if (evaluateActionResult && options.disallowWelcomeFlicker && longest.visibleWelcomePendingMs > 0) {
    violations.push(
      makeViolation(record.label, "fail", "gallery_welcome_visible_during_folder_switch", "Welcome image became visible while switching gallery folders", {
        longest,
        folderSequence,
      })
    );
  }

  if (!options.allowPreviewFlicker && transitions.previewVisible > config.maxPreviewTransitions) {
    violations.push(
      makeViolation(record.label, "fail", "preview_generating_flicker", "preview_generating changed visibility too many times", {
        transitions: transitions.previewVisible,
        threshold: config.maxPreviewTransitions,
      })
    );
  }

  if (!options.allowModeFlicker && transitions.mode > config.maxModeTransitions) {
    violations.push(
      makeViolation(record.label, "fail", "gallery_mode_flicker", "Gallery media mode changed too many times during one action", {
        transitions: transitions.mode,
        threshold: config.maxModeTransitions,
        modeSequence,
      })
    );
  }

  if (evaluateActionResult && options.expectedMode && after?.mode && after.mode !== options.expectedMode) {
    violations.push(
      makeViolation(record.label, "fail", "gallery_capsule_mode_rollback", "Gallery capsule mode ended on an unexpected value", {
        expectedMode: options.expectedMode,
        actualMode: after.mode,
        modeSequence,
        images: after.buttons?.images,
        videos: after.buttons?.videos,
      })
    );
  }

  if (evaluateActionResult && after?.mode && afterBrowserState?.mediaType && after.mode !== afterBrowserState.mediaType) {
    violations.push(
      makeViolation(record.label, "fail", "gallery_browser_state_mode_mismatch", "Gallery browser state media type does not match the active capsule", {
        mode: after.mode,
        browserMediaType: afterBrowserState.mediaType,
        status: after?.status?.text || "",
        runtime: afterBrowserState,
      })
    );
  }

  const statusTextForMode = String(after?.status?.text || "");
  if (
    evaluateActionResult &&
    (
      (after?.mode === "video" && /图片|image/i.test(statusTextForMode)) ||
      (after?.mode === "image" && /视频|video/i.test(statusTextForMode))
    )
  ) {
    violations.push(
      makeViolation(record.label, "fail", "folder_status_media_type_mismatch", "Gallery status text media type does not match the active capsule", {
        mode: after.mode,
        status: statusTextForMode,
        catalogText: after?.catalog?.text || "",
      })
    );
  }

  if (evaluateActionResult && options.expectFolderValue && after?.folder?.value && after.folder.value !== options.expectFolderValue) {
    violations.push(
      makeViolation(record.label, "fail", "gallery_folder_rollback", "Gallery folder ended on an unexpected value", {
        expectedFolder: options.expectFolderValue,
        actualFolder: after.folder.value,
        folderSequence,
      })
    );
  }

  if (options.expectFolderChange && !actionUnavailable && record.before?.folder?.value && after?.folder?.value === record.before.folder.value) {
    violations.push(
      makeViolation(record.label, "fail", "gallery_folder_did_not_change", "Folder navigation did not change the current folder", {
        beforeFolder: record.before.folder.value,
        afterFolder: after.folder.value,
      })
    );
  }

  if (after?.scenePanel?.exists && record.before?.scenePanel?.visible && !after.scenePanel.visible) {
    violations.push(
      makeViolation(record.label, "fail", "scene_panel_hidden_by_gallery_action", "scene_panel became hidden after a gallery action", {
        before: record.before.scenePanel,
        after: after.scenePanel,
      })
    );
  }

  if (options.expectPreviewThumbnailsCentered) {
    const previewThumbnails = after?.layout?.previewThumbnails || null;
    if (!previewThumbnails?.exists || !previewThumbnails.visible) {
      violations.push(
        makeViolation(record.label, "fail", "gallery_preview_thumbnails_missing", "Preview thumbnails were not rendered after opening gallery preview", {
          layout: previewThumbnails,
          folder: after?.folder?.value || after?.folder?.text || "",
          status: after?.status?.text || "",
        })
      );
    } else if (previewThumbnails.contentFits && previewThumbnails.childCount > 1) {
      const delta = Math.abs(Number(previewThumbnails.centerDeltaPx || 0));
      if (delta > config.thumbnailCenterMaxDeltaPx) {
        violations.push(
          makeViolation(record.label, "fail", "gallery_preview_thumbnails_not_centered", "Preview thumbnails are not centered when they fit inside the strip", {
            thresholdPx: config.thumbnailCenterMaxDeltaPx,
            centerDeltaPx: previewThumbnails.centerDeltaPx,
            childCount: previewThumbnails.childCount,
            thumbnails: previewThumbnails.thumbnails,
            childBounds: previewThumbnails.childBounds,
            scroll: {
              scrollLeft: previewThumbnails.scrollLeft,
              scrollWidth: previewThumbnails.scrollWidth,
              clientWidth: previewThumbnails.clientWidth,
            },
            style: {
              display: previewThumbnails.display,
              justifyContent: previewThumbnails.justifyContent,
              alignItems: previewThumbnails.alignItems,
              overflowX: previewThumbnails.overflowX,
            },
          })
        );
      }
    }
  }

  if (options.expectNarrowPreviewLayout) {
    const previewThumbnails = after?.layout?.previewThumbnails || null;
    const viewportWidth = Number(previewThumbnails?.viewport?.width || after?.window?.innerWidth || 0);
    if (viewportWidth > config.thumbnailNarrowViewportWidth + 24) {
      violations.push(
        makeViolation(record.label, "fail", "gallery_preview_narrow_viewport_not_applied", "Narrow preview layout check did not run at the requested viewport width", {
          expectedWidth: config.thumbnailNarrowViewportWidth,
          actualWidth: viewportWidth,
          viewport: previewThumbnails?.viewport || after?.window || null,
        })
      );
    }
    if ((previewThumbnails?.outsideViewport || []).length) {
      violations.push(
        makeViolation(record.label, "fail", "gallery_preview_narrow_layout_outside_viewport", "Gallery preview or controls extend horizontally outside the narrow viewport", {
          outsideViewport: previewThumbnails.outsideViewport,
          viewport: previewThumbnails.viewport,
        })
      );
    }
    if ((previewThumbnails?.overlaps || []).length) {
      violations.push(
        makeViolation(record.label, "fail", "gallery_preview_narrow_layout_overlap", "Gallery toolbar overlaps the preview thumbnail strip in narrow viewport", {
          overlaps: previewThumbnails.overlaps,
          toolbar: previewThumbnails.toolbar,
          thumbnails: previewThumbnails.thumbnails,
          preview: previewThumbnails.preview,
        })
      );
    }
  }

  if (options.expectPreviewThumbnailsScrollable) {
    const previewThumbnails = after?.layout?.previewThumbnails || null;
    if (!previewThumbnails?.exists || !previewThumbnails.visible) {
      violations.push(
        makeViolation(record.label, "fail", "gallery_preview_thumbnails_missing", "Preview thumbnails were not rendered after opening gallery preview", {
          layout: previewThumbnails,
          folder: after?.folder?.value || after?.folder?.text || "",
          status: after?.status?.text || "",
        })
      );
    } else {
      const scrollable = Number(previewThumbnails.scrollWidth || 0) > Number(previewThumbnails.clientWidth || 0) + 8;
      if (!scrollable) {
        violations.push(
          makeViolation(record.label, "fail", "gallery_preview_thumbnails_not_scrollable", "Preview thumbnails did not expose horizontal scroll for a many-image gallery", {
            childCount: previewThumbnails.childCount,
            scrollWidth: previewThumbnails.scrollWidth,
            clientWidth: previewThumbnails.clientWidth,
            childBounds: previewThumbnails.childBounds,
            thumbnails: previewThumbnails.thumbnails,
          })
        );
      }
      if (scrollable && Number(previewThumbnails.scrollLeft || 0) <= 0) {
        violations.push(
          makeViolation(record.label, "fail", "gallery_preview_thumbnails_scroll_did_not_move", "Preview thumbnail strip did not keep a horizontal scroll position", {
            scrollLeft: previewThumbnails.scrollLeft,
            scrollWidth: previewThumbnails.scrollWidth,
            clientWidth: previewThumbnails.clientWidth,
            overflowX: previewThumbnails.overflowX,
          })
        );
      }
      if (scrollable && !/auto|scroll/i.test(String(previewThumbnails.overflowX || ""))) {
        violations.push(
          makeViolation(record.label, "fail", "gallery_preview_thumbnails_scroll_overflow_disabled", "Preview thumbnail strip is scrollable but CSS overflow-x is not scroll/auto", {
            overflowX: previewThumbnails.overflowX,
            scrollWidth: previewThumbnails.scrollWidth,
            clientWidth: previewThumbnails.clientWidth,
          })
        );
      }
    }
  }

  if (options.expectFrostRevealed) {
    const frost = after?.frost || null;
    const activeGallery = (frost?.galleries || []).find((gallery) => gallery.visible && gallery.itemCount > 1) || null;
    if (!frost?.enabled || !activeGallery) {
      violations.push(
        makeViolation(record.label, "fail", "gallery_frost_reveal_missing", "Gallery frost state was not active for the reveal check", {
          frost,
          folder: after?.folder?.value || after?.folder?.text || "",
          status: after?.status?.text || "",
        })
      );
    } else if (!activeGallery.revealed) {
      violations.push(
        makeViolation(record.label, "fail", "gallery_frost_reveal_not_preserved", "Gallery frost reveal was lost after the gallery finished updating", {
          frost,
          folder: after?.folder?.value || after?.folder?.text || "",
          status: after?.status?.text || "",
          runtime: after?.runtime?.localGalleryBrowserState || null,
        })
      );
    }
  }

  if (after?.mutation?.mutationCount > config.maxMutationCount && !semanticDomIdle) {
    violations.push(
      makeViolation(record.label, "warn", "excessive_dom_mutations", "Gallery action produced unusually many DOM mutations", {
        mutationCount: after.mutation.mutationCount,
        threshold: config.maxMutationCount,
      })
    );
  }

  if (longest.previewVisibleWithMediaMs > config.guardHoldMaxMs) {
    violations.push(
      makeViolation(record.label, "fail", "preview_and_gallery_overlap", "preview_generating and rendered media overlapped for too long", {
        longestMs: longest.previewVisibleWithMediaMs,
        thresholdMs: config.guardHoldMaxMs,
      })
    );
  }

  return {
    transitions,
    longest,
    statusSequence,
    modeSequence,
    folderSequence,
    totalSequence,
    countSequence,
    requestIdSequence,
    pendingPayloadSequence,
    beforeCounts,
    afterCounts,
    violations,
  };
}

async function runCheck(page, checks, label, action, options = {}) {
  console.log(`[gallery-health] start ${label}`);
  await resetMutationObserver(page, label);
  const startedAt = Date.now();
  const record = {
    label,
    startedAt,
    endedAt: null,
    durationMs: null,
    skipped: false,
    before: null,
    after: null,
    samples: [],
    analysis: null,
    violations: [],
    guardMs: options.guardMs ?? config.guardMaxMs,
    sampleIntervalMs: config.sampleMs,
    quietWindowTargetMs: config.settleMs,
    sampleCount: 0,
    samplesKept: config.keepSamples,
    quietWindowMs: 0,
    endedReason: "",
    settled: false,
    eventLogStartSeq: 0,
    eventLog: { seq: 0, totalBuffered: 0, sinceSeq: 0, count: 0, items: [] },
  };

  try {
    record.eventLogStartSeq = (await readPageEventLog(page).catch(() => ({ seq: 0 }))).seq || 0;
    record.before = await snapshotGalleryHealthForCheck(page, `${label}:before`);
    if (record.before?.snapshotError) record.snapshotError = record.before.snapshotError;
    if (action) {
      await withTimeout(Promise.resolve().then(() => action()), options.actionTimeoutMs ?? config.actionTimeoutMs, `action ${label}`);
    }
  } catch (error) {
    if (error instanceof HealthSkip) {
      record.skipped = true;
      record.skipReason = error.message;
    } else {
      record.actionError = { name: error.name || "Error", message: error.message, stack: String(error.stack || "").slice(0, 2000) };
    }
  }

  const guardMs = record.guardMs;
  const guardUntil = Date.now() + guardMs;
  let quietSince = 0;
  let last = null;

  do {
    last = await snapshotGalleryHealthForCheck(page, label);
    record.samples.push(last);
    if (last?.snapshotError) {
      record.snapshotError = last.snapshotError;
      record.endedReason = "snapshot_error";
      break;
    }
    if (isQuietSnapshot(last)) {
      if (!quietSince) quietSince = Date.now();
      if (Date.now() - quietSince >= config.settleMs) {
        record.settled = true;
        record.endedReason = "quiet_window_reached";
        break;
      }
    } else {
      quietSince = 0;
    }
    await page.waitForTimeout(config.sampleMs);
  } while (Date.now() < guardUntil);

  record.after = last || (await snapshotGalleryHealthForCheck(page, `${label}:after`));
  if (record.after?.snapshotError) record.snapshotError = record.after.snapshotError;
  record.endedAt = Date.now();
  record.durationMs = record.endedAt - startedAt;
  record.sampleCount = record.samples.length;
  record.quietWindowMs = quietSince ? Math.max(0, record.endedAt - quietSince) : 0;
  if (!record.endedReason) record.endedReason = record.settled ? "quiet_window_reached" : "guard_expired";
  record.eventLog = await readPageEventLog(page, record.eventLogStartSeq).catch(() => record.eventLog);
  record.analysis = analyzeCheck(record, options);
  record.violations = record.analysis.violations;
  if (!config.keepSamples) record.samples = [];
  checks.push(record);

  const failCount = record.violations.filter((item) => item.severity === "fail").length;
  const warnCount = record.violations.filter((item) => item.severity === "warn").length;
  const state = record.skipped ? "skip" : failCount ? "fail" : warnCount ? "warn" : "pass";
  console.log(
    `[gallery-health] ${state} ${label} durationMs=${record.durationMs} samples=${record.sampleCount} ended=${record.endedReason} ` +
      `status="${compactText(record.after?.status?.text || "", 100)}" mode=${record.after?.mode || ""} folder="${compactText(record.after?.folder?.value || "", 80)}"`
  );
  return record;
}

async function clickElement(page, selector, label) {
  const result = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return { ok: false, reason: "missing" };
    const target =
      root.matches?.("button, [role='button'], summary, select, input") ? root : root.querySelector?.("button, [role='button'], summary, input, select") || root;
    if (!target || typeof target.click !== "function") return { ok: false, reason: "not_clickable" };
    if (target.disabled || target.getAttribute("aria-disabled") === "true") return { ok: false, reason: "disabled" };
    target.click();
    return { ok: true };
  }, selector);
  if (!result.ok) throw new HealthSkip(`${label || selector} unavailable: ${result.reason}`);
}

async function tryClickElement(page, selector, label) {
  const result = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return { ok: false, reason: "missing" };
    const target =
      root.matches?.("button, [role='button'], summary, select, input") ? root : root.querySelector?.("button, [role='button'], summary, input, select") || root;
    if (!target || typeof target.click !== "function") return { ok: false, reason: "not_clickable" };
    if (target.disabled || target.getAttribute("aria-disabled") === "true") return { ok: false, reason: "disabled" };
    target.click();
    return { ok: true };
  }, selector);
  if (!result.ok) {
    console.log(`[gallery-health] protected ${label || selector}: ${result.reason}`);
  }
  return result;
}

async function clickAccordionRoot(page, selector) {
  const target = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return { ok: false, reason: "missing" };
    const label = root.querySelector(":scope > button.label-wrap") || root.querySelector("button.label-wrap, summary, [role='button']");
    if (!label && sel === "#finished_images_catalog" && typeof window.ensureSimpleAIPresetCatalogOpen === "function") {
      return {
        ok: !!window.ensureSimpleAIPresetCatalogOpen(root, "gallery_health_click_root_restore"),
        usedRestore: true,
      };
    }
    const clickTarget = label || root;
    if (!clickTarget) return { ok: false, reason: "not_clickable" };
    clickTarget.scrollIntoView({ block: "center", inline: "center" });
    const rect = clickTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { ok: false, reason: "not_visible" };
    return {
      ok: true,
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2),
    };
  }, selector);
  if (!target.ok) throw new HealthSkip(`${selector} cannot be opened: ${target.reason || "unknown"}`);
  if (!target.usedRestore) {
    await page.mouse.click(Number(target.x), Number(target.y));
  }
}

async function requestCatalogVisibleForHealth(page, reason) {
  return await page.evaluate((reasonText) => {
    const root = document.querySelector("#finished_images_catalog");
    if (!root) return { exists: false, calls: [], beforeClassName: "", afterClassName: "" };
    const calls = [];
    const call = (name, fn) => {
      try {
        if (typeof fn !== "function") return;
        const result = fn();
        calls.push({ name, ok: true, result: typeof result === "undefined" ? null : !!result });
      } catch (error) {
        calls.push({ name, ok: false, message: String(error && error.message ? error.message : error).slice(0, 300) });
      }
    };
    const beforeClassName = String(root.className || "");
    const beforeDataset = root.dataset ? Object.fromEntries(Object.entries(root.dataset).slice(0, 24)) : {};
    call("allowCatalogOpenDuringPresetSwitch", () =>
      typeof allowCatalogOpenDuringPresetSwitch === "function"
        ? allowCatalogOpenDuringPresetSwitch(reasonText || "gallery_health_catalog_open")
        : undefined
    );
    call("clearSimpleAIPresetSwitchGalleryHidden", () =>
      typeof clearSimpleAIPresetSwitchGalleryHidden === "function"
        ? clearSimpleAIPresetSwitchGalleryHidden(reasonText || "gallery_health_catalog_open")
        : undefined
    );
    call("syncPostGenerationResultControls", () =>
      typeof syncPostGenerationResultControls === "function"
        ? syncPostGenerationResultControls(window.simpleaiTopbarSystemParams || null)
        : undefined
    );
    return {
      exists: true,
      calls,
      beforeClassName,
      afterClassName: String(root.className || ""),
      beforeDataset,
      afterDataset: root.dataset ? Object.fromEntries(Object.entries(root.dataset).slice(0, 24)) : {},
    };
  }, reason);
}

function catalogUnavailableMessage(state, revealAttempt = null) {
  const catalog = state?.catalog || {};
  const parts = [
    `${SELECTORS.finishedCatalog} hidden`,
    `display=${catalog.display || ""}`,
    `visibility=${catalog.visibility || ""}`,
    `class=${compactText(catalog.className || "", 180)}`,
    `simpleaiPresetSwitchCatalogCollapsed=${catalog.dataset?.simpleaiPresetSwitchCatalogCollapsed || ""}`,
    `dataset=${compactText(JSON.stringify(catalog.dataset || {}), 260)}`,
    `text=${compactText(catalog.text || "", 180)}`,
  ];
  if (revealAttempt) {
    parts.push(`reveal=${compactText(JSON.stringify(revealAttempt), 360)}`);
  }
  return parts.join("; ");
}

async function ensureCatalogOpen(page) {
  let state = await snapshotGalleryHealth(page, "ensure-catalog-open");
  if (!state.catalog.exists) {
    throw new HealthSkip(`${SELECTORS.finishedCatalog} missing`);
  }
  let revealAttempt = null;
  if (!state.catalog.visible) {
    revealAttempt = await requestCatalogVisibleForHealth(page, "gallery_health.ensure_catalog_open");
    await page.waitForTimeout(360);
    state = await snapshotGalleryHealth(page, "ensure-catalog-open-after-reveal");
  }
  if (!state.catalog.visible) {
    throw new HealthSkip(catalogUnavailableMessage(state, revealAttempt));
  }
  if (!state.catalog.labelOpen || !state.catalog.bodyVisible) {
    await clickAccordionRoot(page, SELECTORS.finishedCatalog);
  }
}

async function ensureCatalogClosed(page) {
  const state = await snapshotGalleryHealth(page, "ensure-catalog-closed");
  if (!state.catalog.exists) throw new HealthSkip(`${SELECTORS.finishedCatalog} missing`);
  if (!state.catalog.visible) return;
  if (state.catalog.labelOpen || state.catalog.bodyVisible) await clickAccordionRoot(page, SELECTORS.finishedCatalog);
}

async function closeCatalogAfterOpening(page) {
  await ensureCatalogOpen(page);
  await page.waitForTimeout(120);
  await clickAccordionRoot(page, SELECTORS.finishedCatalog);
}

async function closeCatalogDuringRefresh(page) {
  await ensureCatalogOpen(page);
  const refresh = await tryClickElement(page, SELECTORS.galleryRefreshButton, "refresh before catalog close");
  await page.waitForTimeout(refresh.ok ? Math.max(60, config.rapidDelayMs) : 120);
  await clickAccordionRoot(page, SELECTORS.finishedCatalog);
}

async function discoverFolderOptions(page) {
  await ensureCatalogOpen(page);
  const currentBefore = await snapshotGalleryHealth(page, "folder-discovery-before");
  await clickElement(page, SELECTORS.galleryFolder, "folder dropdown").catch(() => {});
  await page.waitForTimeout(240);
  const options = await page.evaluate(
    ({ selector, contract }) => {
      const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const visible = (node) => {
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
        return !style || (style.display !== "none" && style.visibility !== "hidden");
      };
      const root = document.querySelector(selector);
      const select = root?.querySelector?.("select");
      let rows = [];
      if (select) {
        rows = Array.from(select.options || []).map((option) => ({
          value: normalize(option.value),
          text: normalize(option.textContent || option.label || option.value),
          selected: option.selected,
        }));
      } else {
        rows = Array.from(document.querySelectorAll(contract.dropdown.optionList))
          .filter(visible)
          .map((node) => ({
            value: normalize(node.getAttribute("data-value") || node.getAttribute("value") || node.textContent),
            text: normalize(node.textContent),
            selected: node.getAttribute("aria-selected") === "true" || node.classList.contains("selected"),
          }));
      }
      const seen = new Set();
      return rows.filter((row) => {
        const key = row.value || row.text;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    { selector: SELECTORS.galleryFolder, contract: GRADIO6_DOM_CONTRACT }
  );
  await page.keyboard.press("Escape").catch(() => {});
  const currentValue = currentBefore.folder?.value || "";
  const runtimeFolders = [
    ...(currentBefore.runtime?.localGalleryBrowserState?.folders || []),
    ...(currentBefore.runtime?.topbarSystemParams?.galleryFolders || []),
  ];
  const mergedOptions = [];
  const seenOptions = new Set();
  for (const row of [
    ...runtimeFolders.map((folder) => ({ value: String(folder || "").trim(), text: String(folder || "").trim(), selected: String(folder || "").trim() === currentValue })),
    ...options,
  ]) {
    const key = String(row.value || row.text || "").trim();
    if (!key || seenOptions.has(key)) continue;
    seenOptions.add(key);
    mergedOptions.push(row);
  }
  return {
    currentValue,
    allOptions: mergedOptions,
    options: mergedOptions.slice(0, Math.max(config.folderLimit, 0)),
  };
}

function targetFolderOptionsFromPlan(folderPlan, fixtures = {}) {
  const allOptions = Array.isArray(folderPlan?.allOptions) ? folderPlan.allOptions : [];
  const fixtureNames = new Set((fixtures?.folderNames || []).map((item) => normalizeFolderValue(item)));
  const configuredTargets = new Set((config.targetFolders || []).map((item) => normalizeFolderValue(item)));
  const defaultHealthFixtureNames = new Set([
    config.fixtureEmptyFolder,
    config.fixtureImageFolder,
    config.fixtureMixedFolder,
    config.fixturePagedFolder,
  ].map((item) => normalizeFolderValue(item)).filter(Boolean));
  const seen = new Set();
  const rows = [];
  const addTarget = (value, reason) => {
    const target = normalizeFolderValue(value);
    if (!target || seen.has(target)) return;
    const option = allOptions.find((row) => normalizeFolderValue(row.value || row.text) === target);
    if (!option) return;
    seen.add(target);
    rows.push({ value: target, text: String(option.text || target), reason });
  };

  for (const folder of config.targetFolders || []) addTarget(folder, "configured");

  const realFolders = allOptions
    .map((row) => normalizeFolderValue(row.value || row.text))
    .filter((folder) => /^\d{4}-\d{2}-\d{2}$/.test(folder))
    .filter((folder) => !fixtureNames.has(folder))
    .filter((folder) => configuredTargets.has(folder) || !defaultHealthFixtureNames.has(folder))
    .filter((folder) => folder !== normalizeFolderValue(folderPlan?.currentValue || ""));
  const uniqueRealFolders = [...new Set(realFolders)];
  if (uniqueRealFolders.length > 0) {
    const deepIndex = Math.min(uniqueRealFolders.length - 1, Math.max(0, config.folderLimit + 1));
    addTarget(uniqueRealFolders[deepIndex], "deep-real-folder");
  }
  return rows;
}

function shouldSkipDefaultHealthFixtureFolder(value, fixtures = {}) {
  if (fixtures?.enabled) return false;
  const folder = normalizeFolderValue(value);
  if (!folder) return false;
  const configuredTargets = new Set((config.targetFolders || []).map((item) => normalizeFolderValue(item)));
  if (configuredTargets.has(folder)) return false;
  return [
    config.fixtureEmptyFolder,
    config.fixtureImageFolder,
    config.fixtureMixedFolder,
    config.fixturePagedFolder,
  ].map((item) => normalizeFolderValue(item)).includes(folder);
}

async function selectFolderByValue(page, value) {
  const nativeResult = await page.evaluate(
    ({ selector, requestedValue }) => {
      const normalize = (input) => String(input || "").replace(/\s+/g, " ").trim();
      const root = document.querySelector(selector);
      if (!root) return { ok: false, reason: "missing" };
      const select = root.querySelector("select");
      if (select) {
        const option = Array.from(select.options || []).find((item) => normalize(item.value) === requestedValue || normalize(item.textContent) === requestedValue);
        if (!option) return { ok: false, reason: "option_missing" };
        select.value = option.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true };
      }
      return { ok: null, reason: "overlay_required" };
    },
    { selector: SELECTORS.galleryFolder, requestedValue: String(value || "").trim() }
  );
  if (nativeResult.ok) return;
  if (nativeResult.ok === false && !["missing", "option_missing"].includes(nativeResult.reason)) {
    throw new HealthSkip(`folder option unavailable: ${value} (${nativeResult.reason})`);
  }

  await clickElement(page, SELECTORS.galleryFolder, "folder dropdown").catch(() => {});
  await page.waitForTimeout(180);
  const overlayResult = await page.evaluate(
    ({ contract, requestedValue }) => {
      const normalize = (input) => String(input || "").replace(/\s+/g, " ").trim();
      const visible = (node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
        return rect.width > 0 && rect.height > 0 && (!style || (style.display !== "none" && style.visibility !== "hidden"));
      };
      const options = Array.from(document.querySelectorAll(contract.dropdown.optionList)).filter(visible);
      const target = options.find((node) => {
        const candidate = normalize(node.getAttribute("data-value") || node.getAttribute("value") || node.textContent);
        const text = normalize(node.textContent);
        return candidate === requestedValue || text === requestedValue;
      });
      if (!target || typeof target.click !== "function") return { ok: false, reason: "option_missing" };
      target.click();
      return { ok: true };
    },
    { contract: GRADIO6_DOM_CONTRACT, requestedValue: String(value || "").trim() }
  );
  if (overlayResult.ok) return;

  const requestedValue = String(value || "").trim();
  const fixtureBridgeTargets = [
    config.fixtureEmptyFolder,
    config.fixtureImageFolder,
    config.fixtureMixedFolder,
    config.fixturePagedFolder,
  ].map((item) => normalizeFolderValue(item));
  const fixtureBridgeTarget = !!config.fixtureOutputsRoot && fixtureBridgeTargets.includes(normalizeFolderValue(requestedValue));
  const configuredTargetBridge = (config.targetFolders || []).map((item) => normalizeFolderValue(item)).includes(normalizeFolderValue(requestedValue));
  const dateFolderBridgeTarget = config.allowPayloadBridgeFallback && /^\d{4}-\d{2}-\d{2}$/.test(normalizeFolderValue(requestedValue));
  const runtimeFolderBridgeTarget = await page.evaluate(
    ({ requestedValue }) => {
      const normalize = (input) => String(input || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
      const target = normalize(requestedValue);
      const folders = [];
      try {
        if (typeof finishedGalleryBrowserState !== "undefined" && Array.isArray(finishedGalleryBrowserState.folders)) {
          folders.push(...finishedGalleryBrowserState.folders);
        }
      } catch (error) {}
      try {
        if (Array.isArray(window.simpleaiTopbarSystemParams?.__main_gallery_browser_folders)) {
          folders.push(...window.simpleaiTopbarSystemParams.__main_gallery_browser_folders);
        }
      } catch (error) {}
      return !!target && folders.some((folder) => normalize(folder) === target);
    },
    { requestedValue }
  ).catch(() => false);
  const preferPayloadBridge = fixtureBridgeTarget || configuredTargetBridge || dateFolderBridgeTarget || runtimeFolderBridgeTarget;
  let stepped = null;
  if (!preferPayloadBridge) {
    try {
      stepped = await navigateFolderByButtons(page, value);
    } catch (error) {
      if (!(error instanceof HealthSkip)) throw error;
      stepped = { ok: false, reason: error.message || "folder_step_unavailable" };
    }
    if (stepped.ok) return;
  } else {
    stepped = { ok: false, reason: "payload_bridge_preferred" };
  }
  if (
    (!config.allowPayloadBridgeFallback && !configuredTargetBridge && !runtimeFolderBridgeTarget) ||
    (!!config.fixtureOutputsRoot && !fixtureBridgeTarget && !configuredTargetBridge && !dateFolderBridgeTarget && !runtimeFolderBridgeTarget)
  ) {
    throw new HealthSkip(`folder option unavailable: ${value} (${overlayResult.reason || stepped.reason || "payload_bridge_disabled"})`);
  }

  const bridgeResult = await page.evaluate(
    async ({ selectors, requestedValue }) => {
      const folder = String(requestedValue || "").trim();
      if (!folder) return { ok: false, reason: "empty_folder" };
      if (typeof window.refreshFinishedGalleryBrowser === "function") {
        try {
          const mediaType =
            typeof window.getFinishedGalleryBrowserMode === "function"
              ? window.getFinishedGalleryBrowserMode()
              : document.querySelector(selectors.galleryMediaSwitchRow)?.dataset?.mode || "image";
          const started = window.refreshFinishedGalleryBrowser({
            folder,
            mediaType: mediaType === "video" ? "video" : "image",
            reset: true,
            force: true,
            preferBridge: true,
            allowClosedCatalog: true,
          });
          if (started !== false) return { ok: true, method: "refreshFinishedGalleryBrowser" };
        } catch (error) {
          return { ok: false, reason: error?.message || "refresh_bridge_error" };
        }
      }
      if (typeof window.setGradioTextboxValue === "function" && typeof window.clickGradioButton === "function") {
        try {
          const mediaType =
            typeof window.getFinishedGalleryBrowserMode === "function"
              ? window.getFinishedGalleryBrowserMode()
              : document.querySelector(selectors.galleryMediaSwitchRow)?.dataset?.mode || "image";
          let requestId = Date.now();
          if (typeof window.markFinishedGalleryBrowserLoading === "function") {
            window.markFinishedGalleryBrowserLoading();
          }
          if (typeof window.beginFinishedGalleryBrowserNativeRequest === "function") {
            const state = window.simpleaiTopbarSystemParams || {};
            const nextState = window.beginFinishedGalleryBrowserNativeRequest("gallery_health.folder.bridge", folder, state);
            requestId = Number(nextState && nextState.__main_gallery_browser_request_id || requestId);
          }
          const payload = {
            media_type: mediaType === "video" ? "video" : "image",
            folder,
            offset: 0,
            limit: 36,
            reset: true,
            query: "",
            request_id: requestId,
          };
          const setOk = window.setGradioTextboxValue("gallery_browser_payload", JSON.stringify(payload));
          await new Promise((resolve) => setTimeout(resolve, 160));
          const clickOk = setOk && window.clickGradioButton("gallery_browser_load_btn");
          if (clickOk) return { ok: true, method: "gallery_browser_payload" };
        } catch (error) {
          return { ok: false, reason: error?.message || "bridge_error" };
        }
      }
      return { ok: false, reason: "option_missing" };
    },
    { selectors: SELECTORS, requestedValue: String(value || "").trim() }
  );
  if (!bridgeResult.ok) throw new HealthSkip(`folder option unavailable: ${value} (${overlayResult.reason || bridgeResult.reason})`);
  await page.waitForTimeout(260);
}

async function waitForFolderReady(page, value, label = "folder ready") {
  const requestedValue = normalizeFolderValue(value);
  const deadline = Date.now() + Math.max(2500, config.actionTimeoutMs);
  let last = null;
  while (Date.now() < deadline) {
    last = await snapshotGalleryHealth(page, label).catch(() => null);
    const currentValue = normalizeFolderValue(
      last?.folder?.value ||
        last?.runtime?.localGalleryBrowserState?.folder ||
        last?.runtime?.topbarSystemParams?.galleryFolder ||
        ""
    );
    const loading = !!(last?.runtime?.localGalleryBrowserState?.loading || last?.runtime?.localGalleryBrowserState?.pendingPayload);
    if (currentValue === requestedValue && !loading) {
      const counts = deriveCounts(last);
      const hasStatus = !!String(last?.status?.text || "").trim();
      if (hasStatus || counts.runtimeLoaded !== null || counts.renderedVisibleMediaCount > 0) return last;
    }
    await page.waitForTimeout(180);
  }
  throw new HealthSkip(`${label} timed out: ${value}`);
}

async function selectFolderByValueAndWait(page, value, label = "folder select") {
  await selectFolderByValue(page, value);
  return await waitForFolderReady(page, value, label);
}

async function waitForClickable(page, selector, label = selector) {
  const deadline = Date.now() + Math.max(1200, config.actionTimeoutMs);
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate((sel) => {
      const root = document.querySelector(sel);
      const target =
        root?.matches?.("button, [role='button'], summary, select, input")
          ? root
          : root?.querySelector?.("button, [role='button'], summary, input, select") || root;
      if (!target) return { ok: false, reason: "missing" };
      if (target.disabled || target.getAttribute("aria-disabled") === "true") return { ok: false, reason: "disabled" };
      return { ok: true };
    }, selector);
    if (last.ok) return;
    await page.waitForTimeout(160);
  }
  throw new HealthSkip(`${label} unavailable: ${last?.reason || "timeout"}`);
}

async function navigateFolderByButtons(page, value) {
  const requestedValue = String(value || "").trim();
  if (!requestedValue) return { ok: false, reason: "empty_folder" };
  const state = await snapshotGalleryHealth(page, "folder-button-navigation-source").catch(() => null);
  const current = String(state?.folder?.value || state?.runtime?.localGalleryBrowserState?.folder || state?.runtime?.topbarSystemParams?.galleryFolder || "").trim();
  const folders = [
    ...(state?.runtime?.localGalleryBrowserState?.folders || []),
    ...(state?.runtime?.topbarSystemParams?.galleryFolders || []),
  ].map((item) => String(item || "").trim()).filter(Boolean);
  const uniqueFolders = [...new Set(folders)];
  const currentIndex = uniqueFolders.indexOf(current);
  const targetIndex = uniqueFolders.indexOf(requestedValue);
  if (currentIndex < 0 || targetIndex < 0) return { ok: false, reason: "folder_not_in_runtime_list" };
  const delta = targetIndex - currentIndex;
  const selector = delta > 0 ? SELECTORS.galleryNextFolderButton : SELECTORS.galleryPrevFolderButton;
  const steps = Math.abs(delta);
  if (!steps) return { ok: true, method: "already_selected" };
  if (steps > Math.max(1, config.folderLimit + 4)) return { ok: false, reason: "too_many_steps" };
  const stepDirection = delta > 0 ? 1 : -1;
  for (let index = 0; index < steps; index += 1) {
    const expectedStepFolder = uniqueFolders[currentIndex + stepDirection * (index + 1)] || requestedValue;
    await clickElement(page, selector, delta > 0 ? "folder next fallback" : "folder previous fallback");
    await waitForFolderReady(page, expectedStepFolder, `folder step ${index + 1} ${expectedStepFolder}`);
  }
  return { ok: true, method: "folder_step_buttons", steps };
}

async function scrollGalleryGrid(page) {
  const result = await page.evaluate((selectors) => {
    const root =
      document.querySelector(selectors.finishedGallery) ||
      document.querySelector(selectors.finalGallery) ||
      document.querySelector(selectors.videoPlayer);
    if (!root) return { ok: false, reason: "missing_gallery" };
    const grid = root.querySelector(".grid-wrap, .thumbnails, .gallery, [role='list']") || root;
    if (!grid || typeof grid.scrollTo !== "function") return { ok: false, reason: "missing_scroll_target" };
    const maxY = Math.max(0, grid.scrollHeight - grid.clientHeight);
    grid.scrollTo({ top: maxY, behavior: "auto" });
    grid.dispatchEvent(new Event("scroll", { bubbles: true }));
    window.setTimeout(() => {
      try {
        grid.scrollTo({ top: 0, behavior: "auto" });
        grid.dispatchEvent(new Event("scroll", { bubbles: true }));
      } catch (error) {}
    }, 180);
    return { ok: true, maxY };
  }, SELECTORS);
  if (!result.ok) throw new HealthSkip(`gallery scroll unavailable: ${result.reason}`);
}

async function clickFirstRenderedGalleryMedia(page) {
  const result = await page.evaluate((selectors) => {
    const isVisible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
      return !style || (style.display !== "none" && style.visibility !== "hidden");
    };
    const roots = [
      document.querySelector(selectors.finishedGallery),
      document.querySelector(selectors.finalGallery),
      document.querySelector(selectors.videoPlayer),
    ].filter(isVisible);
    for (const root of roots) {
      const candidates = Array.from(root.querySelectorAll("button.thumbnail-item, .gallery-item button, .gallery-item, img, video, canvas"));
      const target = candidates.find(isVisible);
      if (!target) continue;
      target.scrollIntoView({ block: "center", inline: "center" });
      if (typeof target.click !== "function") continue;
      target.click();
      return {
        ok: true,
        tagName: target.tagName,
        className: String(target.className || ""),
        root: root.id ? `#${root.id}` : "",
      };
    }
    return { ok: false, reason: "no_visible_media" };
  }, SELECTORS);
  if (!result.ok) throw new HealthSkip(`gallery media click unavailable: ${result.reason}`);
  await page.waitForTimeout(220);
  await page.keyboard.press("Escape").catch(() => {});
}

async function openCurrentResultComparison(page) {
  await ensureCatalogClosed(page).catch(() => {});
  await page.waitForTimeout(260);
  const mediaTarget = await page.evaluate((selectors) => {
    const isVisible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
      return !style || (style.display !== "none" && style.visibility !== "hidden");
    };
    const params = window.simpleaiTopbarSystemParams || {};
    const compareButton = document.querySelector(selectors.compareButton);
    const compareReady = compareButton?.dataset?.simpleaiCompareReady === "1" || !!params.__post_generation_compare_ready;
    const hasPostGenerationSignal = !!(
      params.__post_generation_has_output ||
      params.__post_generation_gallery_output ||
      params.__post_generation_image_url ||
      compareReady
    );
    const roots = [document.querySelector(selectors.finishedGallery), document.querySelector(selectors.finalGallery)].filter(isVisible);
    const candidates = [];
    for (const root of roots) {
      candidates.push(
        ...Array.from(root.querySelectorAll(
          ".gallery-container > .preview img, .gallery-container > .preview video, .gallery-item img, .gallery-item button, .gallery-item, img, video, canvas"
        ))
      );
    }
    const target = candidates.find(isVisible);
    if (!target) {
      return {
        ok: false,
        reason: hasPostGenerationSignal ? "post_generation_result_not_visible" : "no_post_generation_result",
        hasPostGenerationSignal,
        galleryState: params.gallery_state || "",
        galleryPathCount: Array.isArray(params.__main_gallery_browser_paths) ? params.__main_gallery_browser_paths.length : 0,
      };
    }
    target.scrollIntoView({ block: "center", inline: "center" });
    const rect = target.getBoundingClientRect();
    return {
      ok: true,
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2),
      tagName: target.tagName,
      className: String(target.className || ""),
      hasPostGenerationSignal,
      galleryState: params.gallery_state || "",
      galleryPathCount: Array.isArray(params.__main_gallery_browser_paths) ? params.__main_gallery_browser_paths.length : 0,
    };
  }, SELECTORS);
  if (!mediaTarget.ok) {
    if (mediaTarget.reason === "no_post_generation_result") {
      throw new HealthSkip("post-generation result is not available for comparison smoke");
    }
    throw new Error(`post-generation result cannot be clicked: ${mediaTarget.reason}`);
  }
  await page.mouse.click(Number(mediaTarget.x), Number(mediaTarget.y));
  await page.waitForTimeout(360);
  await clickElement(page, SELECTORS.compareButton, "compare");
  await page.waitForTimeout(650);
}

async function openPreviewThumbnailLayout(page, folder) {
  if (folder) {
    await selectFolderByValueAndWait(page, folder, `preview thumbnail layout folder ${folder}`);
  }
  let lastResult = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    lastResult = await page.evaluate((selectors) => {
      const isVisible = (node) => {
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
        return !style || (style.display !== "none" && style.visibility !== "hidden");
      };
      const roots = [document.querySelector(selectors.finishedGallery), document.querySelector(selectors.finalGallery)].filter(isVisible);
      for (const root of roots) {
        const preview = root.querySelector(".gallery-container > .preview");
        const thumbnails = preview?.querySelector?.(".thumbnails");
        const visibleThumbs = thumbnails
          ? Array.from(thumbnails.children || []).filter(isVisible).length
          : 0;
        if (preview && isVisible(preview) && visibleThumbs > 0) {
          return { ok: true, alreadyOpen: true, root: root.id ? `#${root.id}` : "", visibleThumbs };
        }
        const candidates = Array.from(root.querySelectorAll(".gallery-item img, .gallery-item button, .gallery-item, img, video, canvas"));
        const target = candidates.find(isVisible);
        if (!target) continue;
        target.scrollIntoView({ block: "center", inline: "center" });
        const rect = target.getBoundingClientRect();
        return {
          ok: true,
          alreadyOpen: false,
          root: root.id ? `#${root.id}` : "",
          tagName: target.tagName,
          className: String(target.className || ""),
          x: Math.round(rect.x + rect.width / 2),
          y: Math.round(rect.y + rect.height / 2),
        };
      }
      return { ok: false, reason: "no_visible_media" };
    }, SELECTORS);
    if (!lastResult.ok) break;
    if (!lastResult.alreadyOpen && Number.isFinite(Number(lastResult.x)) && Number.isFinite(Number(lastResult.y))) {
      await page.mouse.click(Number(lastResult.x), Number(lastResult.y));
    }
    await page.waitForTimeout(320);
    const ready = await page.evaluate((selectors) => {
      const isVisible = (node) => {
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
        return !style || (style.display !== "none" && style.visibility !== "hidden");
      };
      const roots = [document.querySelector(selectors.finishedGallery), document.querySelector(selectors.finalGallery)].filter(isVisible);
      for (const root of roots) {
        const preview = root.querySelector(".gallery-container > .preview");
        const thumbnails = preview?.querySelector?.(".thumbnails");
        const visibleThumbs = thumbnails ? Array.from(thumbnails.children || []).filter(isVisible).length : 0;
        if (preview && isVisible(preview) && thumbnails && isVisible(thumbnails) && visibleThumbs > 0) {
          return { ok: true, root: root.id ? `#${root.id}` : "", visibleThumbs };
        }
      }
      return { ok: false, reason: "preview_not_open" };
    }, SELECTORS);
    if (ready.ok) return ready;
  }
  throw new HealthSkip(`preview thumbnail layout unavailable: ${lastResult?.reason || "preview_not_open"}`);
}

async function waitForGalleryBrowserIdle(page, label = "gallery browser idle") {
  const deadline = Date.now() + Math.max(2500, config.actionTimeoutMs);
  let last = null;
  while (Date.now() < deadline) {
    last = await snapshotGalleryHealth(page, label).catch(() => null);
    const loading = !!(last?.runtime?.localGalleryBrowserState?.loading || last?.runtime?.localGalleryBrowserState?.pendingPayload);
    const counts = deriveCounts(last);
    const hasStatus = !!String(last?.status?.text || "").trim();
    const hasRendered = Number(counts.renderedVisibleMediaCount || 0) > 0 || Number(counts.runtimeLoaded || 0) > 0;
    if (!loading && hasStatus && hasRendered) return last;
    await page.waitForTimeout(180);
  }
  throw new HealthSkip(`${label} timed out: ${last?.status?.text || ""}`);
}

async function uploadRealInputImage(page, filePath) {
  const absolutePath = path.resolve(filePath);
  await fs.access(absolutePath, fsConstants.R_OK);
  const input = page.locator(`${SELECTORS.sceneCanvas} input[type="file"]`).first();
  await input.waitFor({ state: "attached", timeout: config.actionTimeoutMs });
  await input.setInputFiles(absolutePath, { timeout: config.actionTimeoutMs });
  await page.waitForFunction(
    (selectors) => {
      const root = document.querySelector(selectors.sceneCanvas);
      const image = root?.querySelector?.("img");
      if (!image) return false;
      return Number(image.naturalWidth || 0) > 1 && Number(image.naturalHeight || 0) > 1;
    },
    SELECTORS,
    { timeout: config.actionTimeoutMs }
  );
  await page.waitForTimeout(360);
}

async function waitForGeneratedResult(page) {
  const deadline = Date.now() + Math.max(10000, config.generationTimeoutMs);
  let last = null;
  while (Date.now() < deadline) {
    last = await snapshotGalleryHealth(page, "real-generation-result-wait").catch(() => null);
    const topbar = last?.runtime?.topbarSystemParams || {};
    const generatedSignal = !!(
      topbar.postGenerationHasOutput ||
      topbar.postGenerationGalleryOutput ||
      topbar.postGenerationImageUrl ||
      topbar.postGenerationCompareReady
    );
    const visibleOutput = !!(
      (last?.finishedGallery?.visible && Number(last.finishedGallery.visibleMediaCount || 0) > 0) ||
      (last?.finalGallery?.visible && Number(last.finalGallery.visibleMediaCount || 0) > 0)
    );
    const compareReady = !!(
      topbar.postGenerationCompareReady ||
      last?.buttons?.compare?.dataset?.simpleaiCompareReady === "1" ||
      (last?.buttons?.compare?.exists && last.buttons.compare.visible && !last.buttons.compare.disabled)
    );
    if (generatedSignal && visibleOutput && compareReady && !activeTransient(last)) return last;
    await page.waitForTimeout(900);
  }
  throw new Error(
    `real generation did not produce a clickable comparison result within ${config.generationTimeoutMs}ms: ` +
      compactText(JSON.stringify({
        status: last?.status?.text || "",
        classes: last?.classes || {},
        finishedGallery: last?.finishedGallery || null,
        finalGallery: last?.finalGallery || null,
        compare: last?.buttons?.compare || null,
        topbar: last?.runtime?.topbarSystemParams || null,
      }), 900)
  );
}

async function runRealInputGenerationComparison(page) {
  if (!config.realInputImage) {
    throw new HealthSkip("SIMPAI_GALLERY_HEALTH_REAL_INPUT_IMAGE is not set");
  }
  await reloadWebUi(page);
  await closeCatalogDuringRefresh(page);
  await page.waitForTimeout(900);
  await uploadRealInputImage(page, config.realInputImage);
  await clickElement(page, SELECTORS.generateButton, "generate");
  await waitForGeneratedResult(page);
  await openCurrentResultComparison(page);
}

async function openScrollablePreviewThumbnailLayout(page, folder) {
  await openPreviewThumbnailLayout(page, folder);
  const result = await page.evaluate((selectors) => {
    const isVisible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
      return !style || (style.display !== "none" && style.visibility !== "hidden");
    };
    const roots = [document.querySelector(selectors.finishedGallery), document.querySelector(selectors.finalGallery)].filter(isVisible);
    for (const root of roots) {
      const thumbnails = root.querySelector(".gallery-container > .preview .thumbnails");
      if (!thumbnails || !isVisible(thumbnails)) continue;
      const maxScrollLeft = Math.max(0, thumbnails.scrollWidth - thumbnails.clientWidth);
      if (maxScrollLeft <= 0) return { ok: false, reason: "not_scrollable", scrollWidth: thumbnails.scrollWidth, clientWidth: thumbnails.clientWidth };
      thumbnails.scrollLeft = maxScrollLeft;
      thumbnails.dispatchEvent(new Event("scroll", { bubbles: true }));
      return { ok: true, maxScrollLeft, scrollLeft: thumbnails.scrollLeft, scrollWidth: thumbnails.scrollWidth, clientWidth: thumbnails.clientWidth };
    }
    return { ok: false, reason: "missing_preview_thumbnails" };
  }, SELECTORS);
  if (!result.ok) throw new HealthSkip(`scrollable preview thumbnail layout unavailable: ${result.reason}`);
  await page.waitForTimeout(220);
}

async function openPreviewAfterRapidFolderSwitch(page, folder) {
  if (typeof page.setViewportSize === "function") {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForTimeout(220);
  }
  await ensureCatalogOpen(page);
  if (folder) {
    await selectFolderByValueAndWait(page, folder, "rapid preview folder start");
    await waitForClickable(page, SELECTORS.galleryNextFolderButton, "rapid preview first step");
  }
  await runRapidFolderButtons(page);
  await waitForGalleryBrowserIdle(page, "rapid preview folder idle");
  return await openPreviewThumbnailLayout(page, "");
}

async function closeGalleryPreviewIfOpen(page) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const state = await page.evaluate((selectors) => {
      const isVisible = (node) => {
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
        return !style || (style.display !== "none" && style.visibility !== "hidden");
      };
      const roots = [document.querySelector(selectors.finishedGallery), document.querySelector(selectors.finalGallery)].filter(isVisible);
      const preview = roots.map((root) => root.querySelector(".gallery-container > .preview")).find(isVisible) || null;
      const gridItem = roots.map((root) => root.querySelector(".grid-wrap .gallery-item")).find(isVisible) || null;
      return {
        previewOpen: !!preview,
        gridVisible: !!gridItem,
      };
    }, SELECTORS);
    if (!state.previewOpen || state.gridVisible) return;
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(260);
  }
}

async function enableGalleryFrost(page) {
  await page.evaluate(() => {
    try {
      if (typeof window.setSimpleAIGalleryFrostEnabled === "function") {
        window.setSimpleAIGalleryFrostEnabled(true, { reset: true, persist: false, source: "gallery_health" });
      } else {
        document.documentElement.classList.add("simpai-gallery-frost-enabled");
      }
    } catch (error) {
      document.documentElement.classList.add("simpai-gallery-frost-enabled");
    }
  });
}

async function clickFirstFrostGridItem(page) {
  const deadline = Date.now() + Math.max(3000, config.actionTimeoutMs);
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate((selectors) => {
      const isVisible = (node) => {
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
        return !style || (style.display !== "none" && style.visibility !== "hidden");
      };
      const roots = [document.querySelector(selectors.finishedGallery), document.querySelector(selectors.finalGallery)].filter(isVisible);
      for (const root of roots) {
        try {
          if (typeof window.syncSimpleAIGalleryFrostMode === "function") window.syncSimpleAIGalleryFrostMode(root);
        } catch (error) {}
        const items = Array.from(root.querySelectorAll(".grid-wrap .gallery-item")).filter(isVisible);
        const target = items[0] || null;
        if (!target || items.length <= 1) continue;
        const rect = target.getBoundingClientRect();
        return {
          ok: true,
          root: root.id ? `#${root.id}` : "",
          itemCount: items.length,
          revealed: root.getAttribute("data-sai-frost-revealed") === "1",
          multi: String(root.className || "").includes("simpleai-gallery-frost-multi"),
          x: Math.round(rect.x + rect.width / 2),
          y: Math.round(rect.y + rect.height / 2),
        };
      }
      return { ok: false, reason: "no_multi_frost_gallery" };
    }, SELECTORS);
    if (last.ok) break;
    await page.waitForTimeout(120);
  }
  if (!last?.ok) throw new HealthSkip(`frost reveal unavailable: ${last?.reason || "timeout"}`);
  await page.mouse.click(Number(last.x), Number(last.y));
  await page.waitForTimeout(260);
  const revealed = await page.evaluate((selectors) => {
    const roots = [document.querySelector(selectors.finishedGallery), document.querySelector(selectors.finalGallery)].filter(Boolean);
    return roots
      .filter((root) => root.querySelectorAll(".grid-wrap .gallery-item").length > 1)
      .map((root) => ({
        id: root.id || "",
        revealed: root.getAttribute("data-sai-frost-revealed") === "1",
        itemCount: root.querySelectorAll(".grid-wrap .gallery-item").length,
      }));
  }, SELECTORS);
  if (!revealed.some((row) => row.revealed)) {
    throw new HealthSkip("frost reveal click did not expose the gallery");
  }
}

async function revealFrostDuringFolderSwitch(page, folder) {
  if (typeof page.setViewportSize === "function") {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForTimeout(180);
  }
  await ensureCatalogOpen(page);
  await closeGalleryPreviewIfOpen(page);
  const resetFolder = normalizeFolderValue(config.fixtureImageFolder || "");
  if (resetFolder && resetFolder !== normalizeFolderValue(folder)) {
    await selectFolderByValueAndWait(page, resetFolder, "frost reveal reset folder");
    await closeGalleryPreviewIfOpen(page);
  }
  await enableGalleryFrost(page);
  if (folder) {
    await selectFolderByValue(page, folder);
  }
  await clickFirstFrostGridItem(page);
  if (folder) await waitForFolderReady(page, folder, "frost reveal folder ready");
  await closeGalleryPreviewIfOpen(page);
  await page.waitForTimeout(620);
}

async function revealFrostAfterPreviewFolderSwitch(page, previewFolder, targetFolder) {
  if (typeof page.setViewportSize === "function") {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForTimeout(180);
  }
  await ensureCatalogOpen(page);
  await closeGalleryPreviewIfOpen(page);
  await enableGalleryFrost(page);
  if (previewFolder) {
    await selectFolderByValueAndWait(page, previewFolder, "preview frost source folder");
  }
  await openPreviewThumbnailLayout(page, previewFolder || "");
  if (targetFolder) {
    await selectFolderByValue(page, targetFolder);
    await waitForFolderReady(page, targetFolder, "preview frost target folder");
  }
  await closeGalleryPreviewIfOpen(page);
  await clickFirstFrostGridItem(page);
  if (targetFolder) await waitForFolderReady(page, targetFolder, "preview frost reveal folder ready");
  await page.waitForTimeout(620);
}

async function openNarrowPreviewThumbnailLayout(page, folder) {
  if (typeof page.setViewportSize !== "function") {
    throw new HealthSkip("narrow preview layout unavailable: setViewportSize missing");
  }
  await page.setViewportSize({
    width: config.thumbnailNarrowViewportWidth,
    height: config.thumbnailNarrowViewportHeight,
  });
  await page.waitForTimeout(260);
  await ensureCatalogOpen(page);
  return await openPreviewThumbnailLayout(page, folder);
}

async function runNativeDragSynthetic(page, label) {
  return await page.evaluate(
    ({ selector, iterations, candidateLimit, customType, label }) => {
      function mediaSrc(elem) {
        return elem?.currentSrc || elem?.src || elem?.getAttribute?.("src") || "";
      }
      function isGalleryDisplayPreview(src) {
        try {
          const url = new URL(String(src || ""), document.baseURI || location.href);
          const fileName = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
          return /^simpai_gprev__[A-Za-z0-9_-]+__[0-9a-f]{16}\.jpg$/.test(fileName);
        } catch {
          return false;
        }
      }
      function isLargeOriginalImage(img) {
        const width = Number(img?.naturalWidth || 0);
        const height = Number(img?.naturalHeight || 0);
        return width > 0 && height > 0 && (width * height > 2000000 || width >= 2048 || height >= 2048);
      }
      function isExternalOriginalSource(src) {
        try {
          return /^https?:$/i.test(new URL(String(src || ""), document.baseURI || location.href).protocol);
        } catch {
          return false;
        }
      }
      function isVisible(node) {
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
        return rect.width > 0 && rect.height > 0 && (!style || (style.display !== "none" && style.visibility !== "hidden"));
      }
      function dispatchDrag(type, target, dataTransfer) {
        const event = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer });
        target.dispatchEvent(event);
        return event;
      }
      const candidates = Array.from(document.querySelectorAll(selector)).filter(isVisible).slice(0, Math.max(0, Number(candidateLimit || 0)));
      const externalHandleCount = document.querySelectorAll(".simpleai-gallery-external-drag-handle").length;
      const candidateRows = candidates.map((img, index) => {
        const rect = img.getBoundingClientRect();
        return {
          index,
          src: mediaSrc(img),
          previewBacked: isGalleryDisplayPreview(mediaSrc(img)),
          naturalWidth: img.naturalWidth || 0,
          naturalHeight: img.naturalHeight || 0,
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          imgDraggable: !!img.draggable,
          imgDraggableAttr: img.getAttribute("draggable"),
          imgMarked: img.dataset?.simpleaiGalleryNativeDragImage === "1",
          externalHandleCount,
          inPreview: !!img.closest?.("#preview_generating"),
          inGallery: !!img.closest?.("#finished_gallery, #final_gallery"),
        };
      });
      const failures = [];
      const warnings = [];
      const runs = [];
      for (let round = 0; round < Math.max(1, Number(iterations || 1)); round += 1) {
        for (let index = 0; index < candidates.length; index += 1) {
          const img = candidates[index];
          if (!img?.isConnected) continue;
          const previewBacked = isGalleryDisplayPreview(mediaSrc(img));
          const largeOriginal = !previewBacked && isExternalOriginalSource(mediaSrc(img)) && isLargeOriginalImage(img);
          const expectsDownloadUrl = previewBacked || largeOriginal;
          let transfer = null;
          try {
            transfer = new DataTransfer();
          } catch (error) {
            failures.push({ code: "native_drag_datatransfer_unavailable", round, index, error: String(error?.message || error) });
            continue;
          }
          const startEvent = dispatchDrag("dragstart", img, transfer);
          const types = Array.from(transfer.types || []);
          const typesLower = types.map((type) => String(type).toLowerCase());
          const customUrl = transfer.getData(customType);
          const uri = transfer.getData("text/uri-list");
          const plain = transfer.getData("text/plain");
          const downloadUrl = transfer.getData("DownloadURL");
          const afterStart = {
            imgDraggable: !!img.draggable,
            imgDraggableAttr: img.getAttribute("draggable"),
            imgMarked: img.dataset?.simpleaiGalleryNativeDragImage === "1",
            externalHandleCount: document.querySelectorAll(".simpleai-gallery-external-drag-handle").length,
          };
          if (!afterStart.imgDraggable || afterStart.imgDraggableAttr !== "true") {
            failures.push({
              code: "native_drag_image_not_draggable",
              round,
              index,
              afterStart,
            });
          }
          if (!afterStart.imgMarked) {
            failures.push({ code: "native_drag_image_not_marked", round, index, afterStart });
          }
          if (startEvent.defaultPrevented) {
            failures.push({ code: "native_drag_default_prevented", round, index });
          }
          if (!customUrl || !uri || !plain) {
            failures.push({ code: "native_drag_missing_original_url_payload", round, index, types, customUrl, uri, plain });
          }
          if (expectsDownloadUrl && (!downloadUrl || !typesLower.includes("downloadurl"))) {
            failures.push({ code: "native_drag_preview_missing_original_download", round, index, types, downloadUrl, customUrl });
          }
          if (expectsDownloadUrl && downloadUrl && (!customUrl || !downloadUrl.endsWith(`:${customUrl}`) || downloadUrl.includes("simpai_gprev__"))) {
            failures.push({ code: "native_drag_preview_download_not_original", round, index, types, downloadUrl, customUrl });
          }
          if (!expectsDownloadUrl && (downloadUrl || typesLower.includes("downloadurl"))) {
            failures.push({ code: "native_drag_unexpected_downloadurl", round, index, types, downloadUrl });
          }
          if (afterStart.externalHandleCount) {
            failures.push({ code: "native_drag_external_handle_present", round, index, afterStart });
          }
          dispatchDrag("dragend", img, transfer);
          const afterEnd = {
            externalHandleCount: document.querySelectorAll(".simpleai-gallery-external-drag-handle").length,
            pointerPreview: !!document.getElementById("simpleai-gallery-pointer-drag-preview"),
            nativePreview: !!document.getElementById("simpleai-native-image-drag-preview"),
            managedSourceCount: document.querySelectorAll('[data-simpleai-managed-native-image-drag-source="1"]').length,
            managedImageCount: document.querySelectorAll('[data-simpleai-managed-native-image-drag-image="1"]').length,
          };
          if (Object.values(afterEnd).some((value) => Boolean(value))) {
            failures.push({ code: "native_drag_state_residue", round, index, afterEnd });
          }
          runs.push({
            round,
            index,
            defaultPrevented: !!startEvent.defaultPrevented,
            types,
            hasCustomUrl: !!customUrl,
            hasUri: !!uri,
            hasPlain: !!plain,
            hasDownloadUrl: !!downloadUrl,
            previewBacked,
            largeOriginal,
            afterStart,
            afterEnd,
          });
        }
      }
      return {
        label,
        selector,
        iterations,
        candidateLimit,
        candidates: candidateRows,
        runs,
        failures,
        warnings,
      };
    },
    {
      selector: config.nativeDragSelector,
      iterations: config.nativeDragIterations,
      candidateLimit: config.nativeDragCandidateLimit,
      customType: NATIVE_DRAG_ORIGINAL_URL_TYPE,
      label,
    }
  );
}

async function runNativeDragLiveSmoke(page, dragResult) {
  if (!config.nativeDragLive) return [];
  const candidates = (dragResult?.candidates || []).filter((item) => (
    item.rect?.width >= 8
    && item.rect?.height >= 8
  )).slice(0, config.nativeDragCandidateLimit);
  const rows = [];
  for (const item of candidates) {
    const x = item.rect.x + Math.min(Math.max(4, Math.floor(item.rect.width / 2)), Math.max(4, item.rect.width - 4));
    const y = item.rect.y + Math.min(Math.max(4, Math.floor(item.rect.height / 2)), Math.max(4, item.rect.height - 4));
    const row = { index: item.index, x, y, ok: false, error: "" };
    try {
      await withTimeout(
        (async () => {
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x + 32, y + 38, { steps: 6 });
          await page.mouse.move(x + 3, y + 2, { steps: 3 });
          await page.mouse.up();
          await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(true))));
        })(),
        config.nativeDragCaseTimeoutMs,
        `native drag index=${item.index}`
      );
      row.ok = true;
    } catch (error) {
      row.error = error?.message || String(error);
    }
    rows.push(row);
    if (!row.ok) break;
  }
  return rows;
}

async function runNativeDragContractCheck(page, checks, targetFolder = "") {
  const startedAt = Date.now();
  const record = {
    label: "gallery-native-drag-contract",
    startedAt,
    endedAt: null,
    durationMs: null,
    skipped: false,
    before: null,
    after: null,
    samples: [],
    analysis: null,
    violations: [],
    guardMs: 0,
    sampleIntervalMs: 0,
    quietWindowTargetMs: 0,
    sampleCount: 0,
    samplesKept: false,
    quietWindowMs: 0,
    endedReason: "",
    settled: false,
    eventLogStartSeq: 0,
    eventLog: { seq: 0, totalBuffered: 0, sinceSeq: 0, count: 0, items: [] },
    drag: null,
  };
  try {
    record.eventLogStartSeq = (await readPageEventLog(page).catch(() => ({ seq: 0 }))).seq || 0;
    if (targetFolder) {
      await ensureCatalogOpen(page);
      await selectFolderByValue(page, targetFolder);
      await page.waitForTimeout(Math.max(240, config.rapidDelayMs * 2));
    }
    record.before = await snapshotGalleryHealth(page, "gallery-native-drag-contract:before");
    const dragResult = await runNativeDragSynthetic(page, record.label);
    const liveRows = await runNativeDragLiveSmoke(page, dragResult);
    record.after = await snapshotGalleryHealth(page, record.label);
    record.drag = { ...dragResult, live: liveRows };
    if (!dragResult.candidates.length) {
      record.skipped = true;
      record.skipReason = `no visible gallery drag candidates for ${config.nativeDragSelector}`;
    }
    for (const failure of dragResult.failures || []) {
      record.violations.push(makeViolation(record.label, "fail", failure.code, "Gallery native drag contract failed", failure));
    }
    for (const warning of dragResult.warnings || []) {
      record.violations.push(makeViolation(record.label, "warn", warning.code, "Gallery native drag contract warning", warning));
    }
    for (const row of liveRows.filter((item) => !item.ok)) {
      record.violations.push(makeViolation(record.label, "fail", "native_drag_live_responsiveness_timeout", "Live native drag did not return before timeout", row));
    }
    record.settled = !record.violations.some((item) => item.severity === "fail");
    record.endedReason = record.skipped ? "skipped_no_candidates" : "native_drag_contract_checked";
  } catch (error) {
    if (error instanceof HealthSkip) {
      record.skipped = true;
      record.skipReason = error.message;
      record.endedReason = "skipped";
    } else {
      record.actionError = { name: error.name || "Error", message: error.message, stack: String(error.stack || "").slice(0, 2000) };
      record.violations.push(makeViolation(record.label, "fail", "native_drag_contract_runtime_error", "Native drag contract check failed to run", record.actionError));
      record.endedReason = "runtime_error";
    }
    record.after = record.after || (await snapshotGalleryHealth(page, `${record.label}:after`).catch(() => null));
  }
  record.endedAt = Date.now();
  record.durationMs = record.endedAt - startedAt;
  record.eventLog = await readPageEventLog(page, record.eventLogStartSeq).catch(() => record.eventLog);
  record.analysis = {
    violations: record.violations,
    candidates: record.drag?.candidates || [],
    syntheticRuns: record.drag?.runs?.length || 0,
    liveRuns: record.drag?.live?.length || 0,
  };
  checks.push(record);
  const failCount = record.violations.filter((item) => item.severity === "fail").length;
  const warnCount = record.violations.filter((item) => item.severity === "warn").length;
  const state = record.skipped ? "skip" : failCount ? "fail" : warnCount ? "warn" : "pass";
  console.log(
    `[gallery-health] ${state} ${record.label} durationMs=${record.durationMs} candidates=${record.drag?.candidates?.length || 0} ` +
      `synthetic=${record.drag?.runs?.length || 0} live=${record.drag?.live?.length || 0}`
  );
  return record;
}

async function runRapidModeSwitch(page) {
  for (let index = 0; index < config.rapidRounds; index += 1) {
    await clickElement(page, index % 2 === 0 ? SELECTORS.galleryVideosButton : SELECTORS.galleryImagesButton, `rapid media ${index}`);
    await page.waitForTimeout(config.rapidDelayMs);
  }
  await clickElement(page, SELECTORS.galleryImagesButton, "rapid media final image");
}

async function runRapidFolderButtons(page) {
  for (let index = 0; index < config.rapidRounds; index += 1) {
    const selector = index % 2 === 0 ? SELECTORS.galleryNextFolderButton : SELECTORS.galleryPrevFolderButton;
    await tryClickElement(page, selector, `rapid folder ${index}`);
    await page.waitForTimeout(config.rapidDelayMs);
  }
}

async function runRapidFolderButtonsFromFolder(page, folder) {
  if (folder) {
    await selectFolderByValueAndWait(page, folder, "rapid folder start");
    await waitForClickable(page, SELECTORS.galleryNextFolderButton, "rapid folder first step");
  }
  await runRapidFolderButtons(page);
}

async function runLoadMoreFromFolder(page, folder) {
  if (folder) {
    const started = await page.evaluate(
      ({ requestedFolder }) => {
        if (typeof window.refreshFinishedGalleryBrowser !== "function") return false;
        return window.refreshFinishedGalleryBrowser({
          mediaType: "image",
          folder: requestedFolder,
          reset: true,
          force: true,
          preferBridge: true,
          allowClosedCatalog: true,
        });
      },
      { requestedFolder: folder }
    );
    if (started === false) await selectFolderByValueAndWait(page, folder, "load more folder start");
    else await waitForFolderReady(page, folder, "load more folder start");
  }
  const buttonState = await page.evaluate((selector) => {
    const button = document.querySelector(selector);
    if (!button) return { exists: false, visible: false, disabled: true, reason: "missing" };
    const rect = button.getBoundingClientRect();
    const style = window.getComputedStyle ? window.getComputedStyle(button) : null;
    const visible = rect.width > 0 && rect.height > 0 && (!style || (style.display !== "none" && style.visibility !== "hidden"));
    const disabled = !!(button.disabled || button.getAttribute("aria-disabled") === "true" || button.classList.contains("disabled"));
    return {
      exists: true,
      visible,
      disabled,
      text: String(button.textContent || "").replace(/\s+/g, " ").trim(),
    };
  }, SELECTORS.galleryMoreButton);
  if (!buttonState.exists || !buttonState.visible || buttonState.disabled) {
    throw new HealthSkip(`load more unavailable: ${buttonState.reason || buttonState.text || "disabled"}`);
  }
  await waitForClickable(page, SELECTORS.galleryMoreButton, "load more");
  await clickElement(page, SELECTORS.galleryMoreButton, "load more");
}

async function reselectCurrentFolder(page) {
  const state = await snapshotGalleryHealth(page, "same-folder-reselect-source");
  const value = state.folder?.value || state.folder?.text || "";
  if (!value) throw new HealthSkip("current folder value is empty");
  await selectFolderByValue(page, value);
}

async function runRefreshThenMediaSwitch(page) {
  await clickElement(page, SELECTORS.galleryRefreshButton, "refresh before media switch");
  await page.waitForTimeout(config.rapidDelayMs);
  await tryClickElement(page, SELECTORS.galleryVideosButton, "interrupt video");
  await page.waitForTimeout(config.rapidDelayMs);
  await tryClickElement(page, SELECTORS.galleryImagesButton, "interrupt image final");
}

async function runRefreshThenFolderStep(page) {
  await clickElement(page, SELECTORS.galleryRefreshButton, "refresh before folder step");
  await page.waitForTimeout(config.rapidDelayMs);
  await tryClickElement(page, SELECTORS.galleryNextFolderButton, "interrupt next folder");
}

async function runFolderThenMediaSwitch(page, folder) {
  if (!folder) throw new HealthSkip("target folder value is empty");
  await selectFolderByValue(page, folder);
  await page.waitForTimeout(config.rapidDelayMs);
  await clickElement(page, SELECTORS.galleryVideosButton, "folder interrupt video");
  await page.waitForTimeout(config.rapidDelayMs);
  await clickElement(page, SELECTORS.galleryImagesButton, "folder interrupt image final");
}

function isIgnorableRuntimeEvent(event) {
  return !!(
    event &&
    event.type === "requestfailed" &&
    /\/gradio_api\/(?:queue\/data|heartbeat\/[^/?#]+|run\/get_start_timestamp)(?:[?#]|$)/.test(String(event.url || "")) &&
    !event.status &&
    (!event.failure || event.failure === "net::ERR_ABORTED") &&
    !event.text
  );
}

function globalAnalysis(checks, events, fixtures = {}, gradio = null, sourceAudit = null) {
  const violations = [];
  violations.push(...sourceAuditViolations(sourceAudit));
  if (gradio && Array.isArray(gradio.missingTargetElemIds) && gradio.missingTargetElemIds.length) {
    violations.push(
      makeViolation("gradio-runtime", "fail", "gradio_config_target_component_missing", "Required Gradio target components are missing from window.gradio_config", {
        missingTargetElemIds: gradio.missingTargetElemIds,
      })
    );
  }
  if (gradio && Array.isArray(gradio.unexpectedTargetTypes) && gradio.unexpectedTargetTypes.length) {
    violations.push(
      makeViolation("gradio-runtime", "fail", "gradio_config_target_type_mismatch", "Required Gradio target components have unexpected component types", {
        unexpectedTargetTypes: gradio.unexpectedTargetTypes,
      })
    );
  }
  if (gradio && Array.isArray(gradio.missingExpectedEvents) && gradio.missingExpectedEvents.length) {
    violations.push(
      makeViolation("gradio-runtime", "fail", "gradio_gallery_event_missing", "Required Gradio gallery event dependencies are missing", {
        missingExpectedEvents: gradio.missingExpectedEvents,
        galleryDependencies: (gradio.galleryDependencies || []).map((dependency) => ({
          index: dependency.index,
          id: dependency.id,
          targets: dependency.targets,
        })),
      })
    );
  }
  if (gradio && Array.isArray(gradio.unexpectedEventSettings) && gradio.unexpectedEventSettings.length) {
    violations.push(
      makeViolation("gradio-runtime", "fail", "gradio_gallery_event_queue_mismatch", "Required Gradio gallery events changed queue or progress settings", {
        unexpectedEventSettings: gradio.unexpectedEventSettings,
      })
    );
  }
  if (fixtures.enabled && fixtures.emptyFolderFileCount > 0) {
    violations.push(
      makeViolation("fixture", "warn", "fixture_empty_folder_not_empty", "Fixture empty folder contains files", {
        folder: fixtures.emptyFolder,
        fileCount: fixtures.emptyFolderFileCount,
      })
    );
  }
  if (fixtures.enabled && fixtures.imageFolderFileCount <= 0) {
    violations.push(
      makeViolation("fixture", "fail", "fixture_image_folder_has_no_images", "Fixture image folder has no files", {
        folder: fixtures.imageFolder,
      })
    );
  }
  if (fixtures.enabled && fixtures.mixedFolderVideoCount <= 0) {
    violations.push(
      makeViolation("fixture", "fail", "fixture_mixed_folder_has_no_videos", "Fixture mixed folder has no videos", {
        folder: fixtures.mixedFolder,
        videoSourcePath: fixtures.videoSourcePath || "",
        warning: fixtures.warning || "",
      })
    );
  }
  if (fixtures.enabled && fixtures.pagedFolderImageCount <= 36) {
    violations.push(
      makeViolation("fixture", "fail", "fixture_paged_folder_has_too_few_images", "Fixture paged folder does not exceed the first gallery page", {
        folder: fixtures.pagedFolder,
        imageCount: fixtures.pagedFolderImageCount,
      })
    );
  }
  const failedRuntimeEvents = events.filter(
    (event) => !isIgnorableRuntimeEvent(event) && (event.type === "pageerror" || event.type === "requestfailed" || event.status >= 400)
  );
  for (const event of failedRuntimeEvents) {
    violations.push(makeViolation("runtime", "fail", "runtime_event_error", "Browser reported a runtime or Gradio API error", event));
  }

  const folderChecks = checks.filter((check) => /folder|refresh-current-folder|refresh-then-media-switch|load-more-current-folder/.test(check.label) && check.after);
  const catalogTotalsByMode = new Map();
  for (const check of folderChecks) {
    const catalogTotal = check.after.catalog?.totalCount;
    if (catalogTotal === null || catalogTotal === undefined) continue;
    const mode = check.after.mode || (/视频|video/i.test(check.after.status?.text || "") ? "video" : "image");
    const key = mode === "video" ? "video" : "image";
    if (!catalogTotalsByMode.has(key)) catalogTotalsByMode.set(key, []);
    catalogTotalsByMode.get(key).push(check);
  }
  for (const [mode, modeChecks] of catalogTotalsByMode.entries()) {
    const catalogTotals = [...new Set(modeChecks.map((check) => check.after.catalog?.totalCount).filter((value) => value !== null && value !== undefined))];
    if (catalogTotals.length > 1) {
      violations.push(
        makeViolation("folder-matrix", "fail", "catalog_total_changed_during_folder_actions", "Catalog title total changed during folder actions for one media mode", {
          mode,
          catalogTotals,
          rows: modeChecks.map((check) => ({
            label: check.label,
            folder: check.after.folder?.value || "",
            mode: check.after.mode || "",
            catalogTotal: check.after.catalog?.totalCount,
            statusCount: parseMediaCount(check.after.status?.text || ""),
            runtimeLoaded: check.after.runtime?.localGalleryBrowserState?.loaded ?? null,
            renderedVisibleMediaCount: renderedVisibleMediaCount(check.after),
            status: check.after.status?.text || "",
          })),
        })
      );
    }
  }

  const folders = folderChecks
    .map((check) => {
      const counts = deriveCounts(check.after);
      return {
        label: check.label,
        folder: check.after.folder?.value || check.after.folder?.text || "",
        mode: check.after.mode || "",
        status: compactText(check.after.status?.text || ""),
        catalogTotal: counts.catalogTotal,
        statusCount: counts.statusCount,
        runtimeLoaded: counts.runtimeLoaded,
        renderedVisibleMediaCount: counts.renderedVisibleMediaCount,
        renderedMediaCount: counts.renderedMediaCount,
        galleryState: check.after.runtime?.topbarSystemParams?.galleryState || "",
        openFolderStateFolder: normalizeFolderValue(check.after.runtime?.topbarSystemParams?.galleryFolder || ""),
        openFolderSelectedPathFolder: normalizeFolderValue(check.after.runtime?.topbarSystemParams?.gallerySelectedPathFolder || ""),
        openFolderFirstPathFolder: normalizeFolderValue(check.after.runtime?.topbarSystemParams?.galleryFirstPathFolder || ""),
        currentFolderNormalized: normalizeFolderValue(check.after.folder?.value || check.after.folder?.text || ""),
        settled: !!check.settled,
      };
    })
    .filter((row) => row.folder);
  const distinctFolders = [...new Set(folders.map((row) => row.folder))];
  const distinctStatusTexts = [...new Set(folders.map((row) => row.status).filter(Boolean))];
  if (distinctFolders.length >= 3 && distinctStatusTexts.length === 1) {
    violations.push(
      makeViolation("folder-matrix", "warn", "folder_status_stale_candidate", "Multiple folder values ended with the same status text", {
        distinctFolders,
        status: distinctStatusTexts[0],
        rows: folders,
      })
    );
  }

  const actionRecommendations = buildActionRecommendations(checks, violations);
  return {
    folderMatrix: folders,
    countMatrixFields: FOLDER_MATRIX_FIELDS,
    recommendations: actionRecommendations,
    actionRecommendations,
    violations,
  };
}

const COVERAGE_RULES = Object.freeze([
  { code: "initial-load", title: "Initial page load", prefixes: ["initial-load"], required: true },
  { code: "catalog-open", title: "Open finished catalog", prefixes: ["open-catalog"], required: true },
  { code: "catalog-close-after-open", title: "Close catalog immediately after opening", prefixes: ["close-catalog-after-open", "reopen-catalog-after-early-close"], required: true },
  { code: "catalog-close-during-refresh", title: "Close catalog while refresh is pending", prefixes: ["close-catalog-during-refresh", "reopen-catalog-after-refresh-close"], required: true },
  { code: "post-generation-compare-after-catalog-close", title: "Open comparison after closing catalog", prefixes: ["post-generation-compare-after-catalog-close", "reopen-catalog-after-compare-probe"], required: false, requiresData: "post_generation_result" },
  { code: "real-generation-compare-after-catalog-close", title: "Real image generation then comparison after catalog close", prefixes: ["real-generation-compare-after-catalog-close"], required: false, requiresEnv: "SIMPAI_GALLERY_HEALTH_RUN_REAL_GENERATION_COMPARE" },
  { code: "media-capsule-switch", title: "Image/video capsule switching", prefixes: ["media-switch-image", "media-switch-video", "media-switch-image-after-video"], required: true },
  { code: "media-thumbnail-click", title: "Click first rendered gallery media", prefixes: ["click-first-rendered-gallery-media"], required: false },
  { code: "folder-dropdown", title: "Folder dropdown selection", prefixes: ["folder-dropdown-"], required: true },
  { code: "target-folder-selection", title: "Target or deep real folder selection", prefixes: ["target-folder-"], required: false, requiresData: "target_folder" },
  { code: "empty-nonempty-roundtrip", title: "Empty/non-empty folder roundtrip", prefixes: ["empty-folder-roundtrip-"], required: false, requiresData: "empty_and_nonempty_folders" },
  { code: "empty-folder-reload", title: "Reload after opening an empty folder", prefixes: ["empty-folder-reload-"], required: false, requiresData: "empty_and_nonempty_folders" },
  { code: "folder-step-buttons", title: "Previous/next folder buttons", prefixes: ["folder-next-", "folder-previous-"], required: true },
  { code: "refresh-current-folder", title: "Refresh current folder", prefixes: ["refresh-current-folder"], required: true },
  { code: "same-folder-reselect", title: "Reselect the current folder", prefixes: ["same-folder-reselect"], required: true },
  { code: "interrupted-refresh-actions", title: "Interrupt refresh with media/folder actions", prefixes: ["refresh-then-media-switch", "refresh-then-folder-step"], required: true },
  { code: "interrupted-folder-media-switch", title: "Switch media while a folder change is active", prefixes: ["folder-then-media-switch-"], required: false, requiresData: "alternate_folder" },
  { code: "load-more-current-folder", title: "Load more current folder", prefixes: ["load-more-current-folder"], required: false, requiresData: "folder_with_more_than_page_size_media" },
  { code: "gallery-scroll", title: "Gallery grid scroll", prefixes: ["scroll-gallery-grid"], required: false, requiresData: "visible_gallery_media" },
  { code: "preview-thumbnail-layout", title: "Preview thumbnail strip centering", prefixes: ["preview-thumbnail-layout-"], required: false, requiresData: "visible_gallery_media" },
  { code: "preview-thumbnail-scroll-layout", title: "Preview thumbnail strip horizontal scroll", prefixes: ["preview-thumbnail-scroll-layout-"], required: false, requiresData: "folder_with_more_than_page_size_media" },
  { code: "preview-thumbnail-narrow-layout", title: "Preview thumbnail strip narrow viewport", prefixes: ["preview-thumbnail-narrow-layout-"], required: false, requiresData: "visible_gallery_media" },
  { code: "preview-after-rapid-folder-switch", title: "Open preview after rapid folder switching", prefixes: ["preview-after-rapid-folder-switch-"], required: false, requiresData: "folder_with_more_than_page_size_media" },
  { code: "frost-reveal-during-folder-switch", title: "Reveal blur overlay during folder switching", prefixes: ["frost-reveal-during-folder-switch-"], required: false, requiresData: "folder_with_more_than_page_size_media" },
  { code: "frost-reveal-after-preview-folder-switch", title: "Reveal blur overlay after switching folders from preview", prefixes: ["frost-reveal-after-preview-folder-switch-"], required: false, requiresData: "folder_with_more_than_page_size_media" },
  { code: "gallery-native-drag", title: "Image native drag contract", prefixes: ["gallery-native-drag-contract"], required: false, requiresData: "visible_gallery_media" },
  { code: "rapid-media-switch", title: "Rapid image/video switching", prefixes: ["rapid-media-switch"], required: true },
  { code: "rapid-folder-switch", title: "Rapid folder switching", prefixes: ["rapid-folder-switch"], required: true },
  { code: "catalog-close-reopen", title: "Close and reopen catalog", prefixes: ["close-catalog", "reopen-catalog-after-close"], required: true },
  { code: "optional-preset-switch", title: "Optional preset switch while catalog exists", prefixes: ["optional-preset-switch-", "optional-preset-reopen-catalog-"], required: false, requiresEnv: "SIMPAI_GALLERY_HEALTH_PRESET_SELECTORS" },
]);

function checkMatchesRule(check, rule) {
  return rule.prefixes.some((prefix) => check.label === prefix || check.label.startsWith(prefix));
}

function buildScenarioCoverage(checks, fixtures = {}) {
  const items = COVERAGE_RULES.map((rule) => {
    const matched = checks.filter((check) => checkMatchesRule(check, rule));
    const coveredRows = matched.filter((check) => !check.skipped);
    const skippedRows = matched.filter((check) => check.skipped);
    let status = "missing";
    if (coveredRows.length) status = "covered";
    else if (skippedRows.length) status = "skipped";
    const fixtureRequired = ["empty-nonempty-roundtrip", "empty-folder-reload", "load-more-current-folder"].includes(rule.code);
    const required = !!rule.required || (!!fixtures.enabled && fixtureRequired);
    return {
      code: rule.code,
      title: rule.title,
      status,
      required,
      requiresData: rule.requiresData || "",
      requiresEnv: rule.requiresEnv || "",
      checks: matched.map((check) => ({
        label: check.label,
        skipped: !!check.skipped,
        skipReason: check.skipReason || "",
        settled: !!check.settled,
        violationCount: (check.violations || []).length,
      })),
    };
  });
  return {
    coveredCount: items.filter((item) => item.status === "covered").length,
    skippedCount: items.filter((item) => item.status === "skipped").length,
    missingCount: items.filter((item) => item.status === "missing").length,
    requiredNotCovered: items.filter((item) => item.required && item.status !== "covered").map((item) => item.code),
    missingRequired: items.filter((item) => item.required && item.status === "missing").map((item) => item.code),
    missingOptional: items.filter((item) => !item.required && item.status === "missing").map((item) => item.code),
    items,
  };
}

function summarizeChecks(checks, global, coverage) {
  const allViolations = checks.flatMap((check) => check.violations || []).concat(global.violations || []);
  const failCount = allViolations.filter((item) => item.severity === "fail").length;
  const warnCount = allViolations.filter((item) => item.severity === "warn").length;
  return {
    ok: failCount === 0 && (!config.failOnWarn || warnCount === 0) && (!config.requireFullCoverage || !coverage.requiredNotCovered.length),
    checkCount: checks.length,
    skippedCount: checks.filter((check) => check.skipped).length,
    coverageRequiredNotCoveredCount: coverage.requiredNotCovered.length,
    coverageMissingRequiredCount: coverage.missingRequired.length,
    coverageMissingOptionalCount: coverage.missingOptional.length,
    failCount,
    warnCount,
    durationMs: checks.reduce((total, check) => total + Number(check.durationMs || 0), 0),
  };
}

function summarizeApiTimings(events) {
  const timings = events.filter((event) => event.type === "api_timing");
  const durations = timings.map((event) => Number(event.durationMs || 0)).filter(Number.isFinite);
  const sorted = [...timings].sort((a, b) => Number(b.durationMs || 0) - Number(a.durationMs || 0));
  return {
    count: timings.length,
    maxMs: durations.length ? Math.max(...durations) : 0,
    avgMs: durations.length ? Math.round(durations.reduce((total, value) => total + value, 0) / durations.length) : 0,
    slowest: sorted.slice(0, 10).map((event) => ({
      durationMs: event.durationMs,
      status: event.status,
      url: event.url,
    })),
  };
}

function reportConfigSnapshot() {
  return {
    baseUrl: config.baseUrl,
    waitForServerMs: config.waitForServerMs,
    eventLogLimit: config.eventLogLimit,
    sampleMs: config.sampleMs,
    settleMs: config.settleMs,
    guardMaxMs: config.guardMaxMs,
    initialGuardMs: config.initialGuardMs,
    reloadGuardMs: config.reloadGuardMs,
    guardHoldMaxMs: config.guardHoldMaxMs,
    maxPreviewTransitions: config.maxPreviewTransitions,
    maxModeTransitions: config.maxModeTransitions,
    folderLimit: config.folderLimit,
    rounds: config.rounds,
    rapidRounds: config.rapidRounds,
    failOnWarn: config.failOnWarn,
    requireFullCoverage: config.requireFullCoverage,
    dryRun: config.dryRun,
    selfTest: config.selfTest,
    fixtureOutputsRoot: config.fixtureOutputsRoot,
    fixtureEmptyFolder: config.fixtureEmptyFolder,
    fixtureImageFolder: config.fixtureImageFolder,
    fixtureMixedFolder: config.fixtureMixedFolder,
    fixturePagedFolder: config.fixturePagedFolder,
    targetFolders: config.targetFolders,
    fixtureVideoSource: config.fixtureVideoSource,
    realInputImage: config.realInputImage,
    runRealGenerationCompare: config.runRealGenerationCompare,
    generationTimeoutMs: config.generationTimeoutMs,
    webuiSourcePath: config.webuiSourcePath,
    toolboxSourcePath: config.toolboxSourcePath,
    imageviewerSourcePath: config.imageviewerSourcePath,
    nativeDragSelector: config.nativeDragSelector,
    nativeDragIterations: config.nativeDragIterations,
    nativeDragCandidateLimit: config.nativeDragCandidateLimit,
    nativeDragLive: config.nativeDragLive,
    nativeDragCaseTimeoutMs: config.nativeDragCaseTimeoutMs,
    actionTimeoutMs: config.actionTimeoutMs,
    allowPayloadBridgeFallback: config.allowPayloadBridgeFallback,
    thumbnailCenterMaxDeltaPx: config.thumbnailCenterMaxDeltaPx,
    thumbnailNarrowViewportWidth: config.thumbnailNarrowViewportWidth,
    thumbnailNarrowViewportHeight: config.thumbnailNarrowViewportHeight,
    reportPath: config.reportPath,
    summaryPath: config.summaryPath,
    presetSelectors: config.presetSelectors,
  };
}

function reportSchemas() {
  return {
    check: ["label", "durationMs", "settled", "guardMs", "before", "after", "analysis", "violations"],
    counts: ["catalogTotal", "statusCount", "runtimeLoaded", "renderedVisibleMediaCount", "renderedMediaCount"],
    violation: ["check", "severity", "code", "message", "evidence"],
    coverage: ["code", "title", "status", "required", "requiresData", "requiresEnv", "checks"],
    folderMatrix: FOLDER_MATRIX_FIELDS,
    gradio: [
      "version",
      "componentCount",
      "dependencyCount",
      "targetComponents",
      "galleryDependencies",
      "missingTargetElemIds",
      "unexpectedTargetTypes",
      "eventContract",
      "missingExpectedEvents",
      "unexpectedEventSettings",
      "domContract",
      "componentContract",
    ],
    sourceAudit: [
      "enabled",
      "path",
      "ok",
      "sourceReadError",
      "componentRows",
      "callbackRows",
      "missingComponents",
      "missingCallbacks",
      "mismatchedCallbacks",
      "toolboxPath",
      "toolboxReadError",
      "backendRows",
      "missingBackendContracts",
      "imageviewerPath",
      "imageviewerReadError",
      "nativeDragRows",
      "missingNativeDragContracts",
      "contract",
    ],
    nativeDrag: ["candidates", "runs", "live", "failures", "warnings"],
    preflight: ["ok", "skipped", "url", "waitBudgetMs", "attempts", "waitedMs", "status", "lastError"],
    eventLog: ["seq", "totalBuffered", "sinceSeq", "count", "items"],
    actionRecommendation: ["code", "action", "priority", "severity", "message", "implementation", "triggerCodes", "checks", "evidenceCount", "firstEvidence"],
    selfTest: ["passed", "expectedRecommendationCodes", "actualRecommendationCodes", "triggerViolationCodes", "gradioDependencySelfTest"],
  };
}

async function buildDryRunReport() {
  const fixtures = await prepareGalleryHealthFixtures();
  const sourceAudit = await readWebuiGallerySourceAudit();
  const sourceViolations = sourceAuditViolations(sourceAudit);
  const coverage = buildScenarioCoverage([], fixtures);
  const summary = {
    ok: sourceViolations.length === 0,
    mode: "dry-run",
    checkCount: 0,
    skippedCount: 0,
    coverageRequiredNotCoveredCount: coverage.requiredNotCovered.length,
    coverageMissingRequiredCount: coverage.missingRequired.length,
    coverageMissingOptionalCount: coverage.missingOptional.length,
    failCount: sourceViolations.filter((violation) => violation.severity === "fail").length,
    warnCount: sourceViolations.filter((violation) => violation.severity === "warn").length,
    durationMs: 0,
  };
  return {
    ok: summary.ok,
    exitCode: summary.ok ? EXIT_CODES.ok : EXIT_CODES.liveFailure,
    mode: "dry-run",
    liveChecksExecuted: false,
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    config: reportConfigSnapshot(),
    preflight: {
      ok: true,
      skipped: true,
      reason: "dry-run",
      url: config.baseUrl,
      waitBudgetMs: config.waitForServerMs,
      attempts: 0,
      waitedMs: 0,
      status: 0,
      lastError: "",
    },
    fixtures,
    sourceAudit,
    gradio: {
      version: "",
      componentCount: 0,
      dependencyCount: 0,
      targetComponents: [],
      galleryDependencies: [],
      missingTargetElemIds: GRADIO6_COMPONENT_CONTRACT.requiredElemIds,
      unexpectedTargetTypes: [],
      eventContract: GRADIO6_EVENT_CONTRACT,
      missingExpectedEvents: GRADIO6_EVENT_CONTRACT.expectedEvents,
      unexpectedEventSettings: [],
      domContract: GRADIO6_DOM_CONTRACT,
      componentContract: GRADIO6_COMPONENT_CONTRACT,
    },
    runtime: null,
    schemas: reportSchemas(),
    readableSummary: {
      result: "dry-run",
      checkCount: 0,
      failCount: summary.failCount,
      warnCount: summary.warnCount,
      skippedCount: 0,
      failedChecks: sourceViolations.filter((violation) => violation.severity === "fail").map((violation) => violation.check),
      warningChecks: sourceViolations.filter((violation) => violation.severity === "warn").map((violation) => violation.check),
      requiredCoverageNotCovered: coverage.requiredNotCovered,
      optionalCoverageMissing: coverage.missingOptional,
      recommendations: sourceViolations.length ? ["fix_webui_gallery_source_contract"] : [],
      actionRecommendations: [],
      slowestApiMs: 0,
      slowestApiUrl: "",
    },
    summary,
    coverage,
    apiTimingSummary: { count: 0, maxMs: 0, avgMs: 0, slowest: [] },
    global: {
      folderMatrix: [],
      countMatrixFields: FOLDER_MATRIX_FIELDS,
      recommendations: [],
      actionRecommendations: [],
      violations: sourceViolations,
    },
    folderMatrix: [],
    countMatrixFields: FOLDER_MATRIX_FIELDS,
    checks: [],
    events: [],
    violations: sourceViolations,
  };
}

function syntheticRecommendationChecks() {
  return [
    {
      label: "synthetic-wait-hint",
      violations: [
        makeViolation("synthetic-wait-hint", "warn", "gallery_loading_without_visible_wait_hint", "Synthetic loading state without visible wait hint"),
      ],
    },
    {
      label: "synthetic-stale-callback",
      violations: [
        makeViolation("synthetic-stale-callback", "fail", "gallery_active_request_payload_mismatch", "Synthetic stale callback request mismatch"),
        makeViolation("synthetic-stale-callback", "fail", "open_folder_selected_path_folder_mismatch", "Synthetic selected path folder mismatch"),
      ],
    },
    {
      label: "synthetic-loading-controls",
      violations: [
        makeViolation("synthetic-loading-controls", "warn", "gallery_controls_enabled_while_loading", "Synthetic gallery controls remain clickable while loading"),
      ],
    },
    {
      label: "synthetic-preview-surface",
      violations: [
        makeViolation("synthetic-preview-surface", "fail", "preview_generating_visible_with_rendered_media", "Synthetic preview/gallery overlap"),
      ],
    },
    {
      label: "synthetic-scene-panel",
      violations: [
        makeViolation("synthetic-scene-panel", "fail", "scene_panel_hidden_by_gallery_action", "Synthetic scene panel visibility regression"),
      ],
    },
    {
      label: "synthetic-native-drag",
      violations: [
        makeViolation("synthetic-native-drag", "fail", "native_drag_missing_original_url_payload", "Synthetic native drag payload regression"),
      ],
    },
  ];
}

function syntheticGradioConfigWithGalleryDependencies(overrides = {}) {
  const componentSpecs = [
    ["finished_images_catalog", "accordion"],
    ["preview_generating", "image"],
    ["finished_gallery", "gallery"],
    ["final_gallery", "gallery"],
    ["video_player", "video"],
    ["gallery_browser_folder", "dropdown"],
    ["gallery_browser_status", "markdown"],
    ["gallery_browser_prev_folder_btn", "button"],
    ["gallery_browser_next_folder_btn", "button"],
    ["gallery_browser_refresh_btn", "button"],
    ["gallery_browser_more_btn", "button"],
    ["gallery_images_btn", "button"],
    ["gallery_videos_btn", "button"],
    ["gallery_browser_payload", "textbox"],
    ["gallery_browser_state", "textbox"],
    ["gallery_media_switch_request", "textbox"],
    ["gallery_browser_load_btn", "button"],
    ["scene_panel", "group"],
    ["scene_video_duration", "slider"],
  ];
  const components = componentSpecs.map(([elemId, type], index) => ({
    id: index + 1,
    type,
    props: { elem_id: elemId, visible: true },
  }));
  const idByElemId = Object.fromEntries(components.map((component) => [component.props.elem_id, component.id]));
  const dependencies = GRADIO6_EVENT_CONTRACT.expectedEvents.map((event, index) => ({
    id: index + 1,
    targets: [[idByElemId[event.elem_id], event.event]],
    inputs: [idByElemId.gallery_browser_payload, idByElemId.gallery_media_switch_request].filter(Boolean),
    outputs: [idByElemId.gallery_browser_state, idByElemId.gallery_browser_status].filter(Boolean),
    queue: false,
    show_progress: false,
    api_name: `synthetic_${event.elem_id}_${event.event}`,
  }));
  if (overrides.firstDependencyQueueMismatch && dependencies[0]) {
    dependencies[0] = { ...dependencies[0], queue: true, show_progress: "full" };
  }
  if (overrides.dropLoadDependency) {
    const loadId = idByElemId.gallery_browser_load_btn;
    const index = dependencies.findIndex((dependency) =>
      (dependency.targets || []).some((target) => Array.isArray(target) && Number(target[0]) === Number(loadId))
    );
    if (index >= 0) dependencies.splice(index, 1);
  }
  return {
    version: "synthetic-gradio6",
    components,
    dependencies,
  };
}

function runGradioDependencyAuditSelfTest() {
  const contracts = {
    selectors: SELECTORS,
    domContract: GRADIO6_DOM_CONTRACT,
    componentContract: GRADIO6_COMPONENT_CONTRACT,
    eventContract: GRADIO6_EVENT_CONTRACT,
  };
  const good = auditGradioConfigObject(syntheticGradioConfigWithGalleryDependencies(), contracts);
  const queueMismatch = auditGradioConfigObject(
    syntheticGradioConfigWithGalleryDependencies({ firstDependencyQueueMismatch: true }),
    contracts
  );
  const missingLoad = auditGradioConfigObject(
    syntheticGradioConfigWithGalleryDependencies({ dropLoadDependency: true }),
    contracts
  );
  const passed =
    good.missingTargetElemIds.length === 0 &&
    good.unexpectedTargetTypes.length === 0 &&
    good.missingExpectedEvents.length === 0 &&
    good.unexpectedEventSettings.length === 0 &&
    queueMismatch.unexpectedEventSettings.some((item) => item.elem_id === "gallery_images_btn") &&
    missingLoad.missingExpectedEvents.some((item) => item.elem_id === "gallery_browser_load_btn");
  return {
    passed,
    good: {
      targetComponentCount: good.targetComponents.length,
      galleryDependencyCount: good.galleryDependencies.length,
      missingExpectedEvents: good.missingExpectedEvents,
      unexpectedEventSettings: good.unexpectedEventSettings,
    },
    queueMismatch: {
      unexpectedEventSettings: queueMismatch.unexpectedEventSettings,
    },
    missingLoad: {
      missingExpectedEvents: missingLoad.missingExpectedEvents,
    },
  };
}

async function buildSelfTestReport() {
  const fixtures = await prepareGalleryHealthFixtures();
  const sourceAudit = await readWebuiGallerySourceAudit();
  const checks = syntheticRecommendationChecks();
  const actionRecommendations = buildActionRecommendations(checks, []);
  const gradioDependencySelfTest = runGradioDependencyAuditSelfTest();
  const expectedRecommendationCodes = ACTION_RECOMMENDATION_RULES.map((rule) => rule.code);
  const actualRecommendationCodes = actionRecommendations.map((item) => item.code);
  const missingRecommendationCodes = expectedRecommendationCodes.filter((code) => !actualRecommendationCodes.includes(code));
  const passed = missingRecommendationCodes.length === 0 && gradioDependencySelfTest.passed;
  const coverage = buildScenarioCoverage([], fixtures);
  const summary = {
    ok: passed,
    mode: "self-test",
    checkCount: checks.length,
    skippedCount: 0,
    coverageRequiredNotCoveredCount: coverage.requiredNotCovered.length,
    coverageMissingRequiredCount: coverage.missingRequired.length,
    coverageMissingOptionalCount: coverage.missingOptional.length,
    failCount: passed ? 0 : 1,
    warnCount: 0,
    durationMs: 0,
  };
  const selfTest = {
    passed,
    expectedRecommendationCodes,
    actualRecommendationCodes,
    missingRecommendationCodes,
    triggerViolationCodes: [...new Set(checks.flatMap((check) => check.violations || []).map((violation) => violation.code))],
    gradioDependencySelfTest,
  };
  return {
    ok: passed,
    exitCode: passed ? EXIT_CODES.ok : EXIT_CODES.toolOrEnvironmentError,
    mode: "self-test",
    liveChecksExecuted: false,
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    config: reportConfigSnapshot(),
    preflight: {
      ok: true,
      skipped: true,
      reason: "self-test",
      url: config.baseUrl,
      waitBudgetMs: config.waitForServerMs,
      attempts: 0,
      waitedMs: 0,
      status: 0,
      lastError: "",
    },
    fixtures,
    sourceAudit,
    gradio: null,
    runtime: null,
    schemas: reportSchemas(),
    readableSummary: {
      result: passed ? "self-test-pass" : "self-test-fail",
      checkCount: checks.length,
      failCount: passed ? 0 : 1,
      warnCount: 0,
      skippedCount: 0,
      failedChecks: passed ? [] : ["action-recommendation-self-test"],
      warningChecks: [],
      requiredCoverageNotCovered: coverage.requiredNotCovered,
      optionalCoverageMissing: coverage.missingOptional,
      recommendations: actionRecommendations.map((item) => item.code),
      actionRecommendations: actionRecommendations.map((item) => ({
        code: item.code,
        action: item.action,
        priority: item.priority,
        severity: item.severity,
        triggerCodes: item.triggerCodes || [],
        checks: item.checks || [],
      })),
      slowestApiMs: 0,
      slowestApiUrl: "",
    },
    summary,
    coverage,
    apiTimingSummary: { count: 0, maxMs: 0, avgMs: 0, slowest: [] },
    global: {
      folderMatrix: [],
      countMatrixFields: FOLDER_MATRIX_FIELDS,
      recommendations: actionRecommendations,
      actionRecommendations,
      violations: [],
    },
    folderMatrix: [],
    countMatrixFields: FOLDER_MATRIX_FIELDS,
    checks,
    events: [],
    violations: [],
    selfTest,
  };
}

function buildReadableSummary(summary, coverage, global, checks, apiTimingSummary) {
  const globalViolations = global.violations || [];
  const failedChecks = checks
    .filter((check) => (check.violations || []).some((violation) => violation.severity === "fail"))
    .map((check) => check.label)
    .concat(globalViolations.filter((violation) => violation.severity === "fail").map((violation) => violation.check));
  const warningChecks = checks
    .filter((check) => (check.violations || []).some((violation) => violation.severity === "warn"))
    .map((check) => check.label)
    .concat(globalViolations.filter((violation) => violation.severity === "warn").map((violation) => violation.check));
  return {
    result: summary.ok ? "pass" : "fail",
    checkCount: summary.checkCount,
    failCount: summary.failCount,
    warnCount: summary.warnCount,
    skippedCount: summary.skippedCount,
    failedChecks,
    warningChecks,
    requiredCoverageNotCovered: coverage.requiredNotCovered,
    optionalCoverageMissing: coverage.missingOptional,
    recommendations: (global.recommendations || []).map((item) => item.code),
    actionRecommendations: (global.actionRecommendations || global.recommendations || []).map((item) => ({
      code: item.code,
      action: item.action,
      priority: item.priority,
      severity: item.severity,
      triggerCodes: item.triggerCodes || [],
      checks: item.checks || [],
    })),
    slowestApiMs: apiTimingSummary.maxMs,
    slowestApiUrl: apiTimingSummary.slowest?.[0]?.url || "",
  };
}

async function runGalleryHealth(page, events, preflight, sourceAudit) {
  const fixtures = await prepareGalleryHealthFixtures();
  await gotoWebUi(page);
  const gradio = await readGradioRuntimeSnapshot(page);
  const runtime = await readSimpleAiRuntimeSnapshot(page);
  const checks = [];

  await runCheck(page, checks, "initial-load", async () => {}, { guardMs: config.initialGuardMs });
  await runCheck(page, checks, "open-catalog", () => ensureCatalogOpen(page), { expectCatalogOpen: true });
  await runCheck(page, checks, "close-catalog-after-open", () => closeCatalogAfterOpening(page), { expectCatalogClosed: true });
  await runCheck(page, checks, "reopen-catalog-after-early-close", () => ensureCatalogOpen(page), { expectCatalogOpen: true });
  await runCheck(page, checks, "close-catalog-during-refresh", () => closeCatalogDuringRefresh(page), { expectCatalogClosed: true });
  await runCheck(page, checks, "reopen-catalog-after-refresh-close", () => ensureCatalogOpen(page), { expectCatalogOpen: true });
  await runCheck(page, checks, "post-generation-compare-after-catalog-close", async () => {
    await closeCatalogAfterOpening(page);
    await openCurrentResultComparison(page);
  }, {
    expectComparisonSurface: true,
    guardMs: Math.max(config.guardMaxMs, 6500),
  });
  await runCheck(page, checks, "reopen-catalog-after-compare-probe", () => ensureCatalogOpen(page), { expectCatalogOpen: true });
  await runCheck(page, checks, "media-switch-image", () => clickElement(page, SELECTORS.galleryImagesButton, "images"), { expectedMode: "image" });
  await runCheck(page, checks, "click-first-rendered-gallery-media", () => clickFirstRenderedGalleryMedia(page), {});
  await runCheck(page, checks, "media-switch-video", () => clickElement(page, SELECTORS.galleryVideosButton, "videos"), { expectedMode: "video" });
  await runCheck(page, checks, "media-switch-image-after-video", () => clickElement(page, SELECTORS.galleryImagesButton, "images"), { expectedMode: "image" });

  let folderPlan = { currentValue: "", options: [] };
  try {
    folderPlan = await discoverFolderOptions(page);
  } catch (error) {
    if (!(error instanceof HealthSkip)) {
      throw error;
    }
    console.log(`[gallery-health] skip folder-discovery reason="${compactText(error.message, 240)}"`);
  }
  const folderOptionRows = [];
  const folderOptionSeen = new Set();
  const addFolderOption = (option) => {
    const value = String(option?.value || option?.text || "").trim();
    if (!value || value === folderPlan.currentValue || folderOptionSeen.has(value)) return;
    if (shouldSkipDefaultHealthFixtureFolder(value, fixtures)) return;
    folderOptionSeen.add(value);
    folderOptionRows.push({ value, text: String(option?.text || value), selected: false });
  };
  if (fixtures.enabled) {
    for (const folder of fixtures.folderNames || []) addFolderOption({ value: folder, text: folder });
  }
  for (const option of folderPlan.options || []) addFolderOption(option);
  const folderOptions = folderOptionRows.slice(0, config.folderLimit);
  for (let index = 0; index < folderOptions.length; index += 1) {
    const option = folderOptions[index];
    const value = option.value || option.text;
    await runCheck(page, checks, `folder-dropdown-${index + 1}-${safeName(value)}`, () => selectFolderByValue(page, value), {
      expectFolderValue: value,
      folderProbe: true,
      expectedLoadedCount: expectedFixtureLoadedCount(fixtures, value, "image", 36),
    });
  }

  const targetFolderOptions = targetFolderOptionsFromPlan(folderPlan, fixtures);
  for (const option of targetFolderOptions) {
    const value = option.value || option.text;
    await runCheck(page, checks, `target-folder-${safeName(value)}`, () => selectFolderByValueAndWait(page, value, `target folder ${value}`), {
      expectFolderValue: value,
      folderProbe: true,
      disallowWelcomeFlicker: true,
      expectedLoadedCount: expectedFixtureLoadedCount(fixtures, value, "image", 36),
    });
  }

  const probedFolders = checks
    .filter((check) => check.label.startsWith("folder-dropdown-") && check.after?.folder)
    .map((check) => ({
      label: check.label,
      folder: check.after.folder.value || check.after.folder.text || "",
      counts: deriveCounts(check.after),
    }))
    .filter((row) => row.folder);
  const emptyFolder = probedFolders.find((row) => row.counts.statusCount === 0 || row.counts.runtimeLoaded === 0);
  const nonEmptyFolder = probedFolders.find((row) => Number(row.counts.statusCount ?? row.counts.runtimeLoaded ?? 0) > 0);
  if (emptyFolder && nonEmptyFolder) {
    await runCheck(page, checks, `empty-folder-roundtrip-open-empty-${safeName(emptyFolder.folder)}`, () => selectFolderByValue(page, emptyFolder.folder), {
      expectFolderValue: emptyFolder.folder,
      folderProbe: true,
      expectedLoadedCount: expectedFixtureLoadedCount(fixtures, emptyFolder.folder, "image", 36),
    });
    await runCheck(page, checks, `empty-folder-roundtrip-open-nonempty-${safeName(nonEmptyFolder.folder)}`, () => selectFolderByValue(page, nonEmptyFolder.folder), {
      expectFolderValue: nonEmptyFolder.folder,
      folderProbe: true,
      expectedLoadedCount: expectedFixtureLoadedCount(fixtures, nonEmptyFolder.folder, "image", 36),
    });
    await runCheck(page, checks, `empty-folder-roundtrip-return-empty-${safeName(emptyFolder.folder)}`, () => selectFolderByValue(page, emptyFolder.folder), {
      expectFolderValue: emptyFolder.folder,
      folderProbe: true,
      expectedLoadedCount: expectedFixtureLoadedCount(fixtures, emptyFolder.folder, "image", 36),
    });
    await runCheck(page, checks, `empty-folder-reload-open-catalog-from-empty-${safeName(emptyFolder.folder)}`, async () => {
      await selectFolderByValue(page, emptyFolder.folder);
      await reloadWebUi(page);
      await ensureCatalogOpen(page);
    }, {
      guardMs: config.reloadGuardMs,
      expectCatalogOpen: true,
      folderProbe: true,
    });
    await runCheck(page, checks, `empty-folder-reload-switch-nonempty-${safeName(nonEmptyFolder.folder)}`, () => selectFolderByValue(page, nonEmptyFolder.folder), {
      expectFolderValue: nonEmptyFolder.folder,
      folderProbe: true,
      expectedLoadedCount: expectedFixtureLoadedCount(fixtures, nonEmptyFolder.folder, "image", 36),
    });
    await runCheck(page, checks, `empty-folder-reload-return-empty-${safeName(emptyFolder.folder)}`, () => selectFolderByValue(page, emptyFolder.folder), {
      expectFolderValue: emptyFolder.folder,
      folderProbe: true,
      expectedLoadedCount: expectedFixtureLoadedCount(fixtures, emptyFolder.folder, "image", 36),
    });
  }

  for (let round = 1; round <= config.rounds; round += 1) {
    await runCheck(page, checks, `folder-next-${round}`, () => clickElement(page, SELECTORS.galleryNextFolderButton, "next folder"), {
      expectFolderChange: true,
      folderProbe: true,
    });
    await runCheck(page, checks, `folder-previous-${round}`, () => clickElement(page, SELECTORS.galleryPrevFolderButton, "previous folder"), {
      expectFolderChange: true,
      folderProbe: true,
    });
  }

  await runCheck(page, checks, "refresh-current-folder", () => clickElement(page, SELECTORS.galleryRefreshButton, "refresh"), {
    folderProbe: true,
  });
  await runCheck(page, checks, "same-folder-reselect", () => reselectCurrentFolder(page), {
    folderProbe: true,
  });
  await runCheck(page, checks, "refresh-then-media-switch", () => runRefreshThenMediaSwitch(page), {
    expectedMode: "image",
    allowModeFlicker: true,
    folderProbe: true,
  });
  await runCheck(page, checks, "refresh-then-folder-step", () => runRefreshThenFolderStep(page), {
    allowModeFlicker: true,
    folderProbe: true,
  });
  const interruptFolderOption = folderOptions[0];
  const interruptFolderValue = interruptFolderOption ? interruptFolderOption.value || interruptFolderOption.text : "";
  if (interruptFolderValue) {
    await runCheck(page, checks, `folder-then-media-switch-${safeName(interruptFolderValue)}`, () => runFolderThenMediaSwitch(page, interruptFolderValue), {
      expectFolderValue: interruptFolderValue,
      expectedMode: "image",
      allowModeFlicker: true,
      folderProbe: true,
      expectedLoadedCount: expectedFixtureLoadedCount(fixtures, interruptFolderValue, "image", 36),
    });
  }
  const pagedFolderValue = fixtures?.enabled && fixtures?.pagedFolder ? fixtures.pagedFolder : "";
  await runCheck(page, checks, "load-more-current-folder", () => runLoadMoreFromFolder(page, pagedFolderValue), {
    folderProbe: true,
    expectedMode: "image",
    expectedLoadedCount: expectedFixtureLoadedCount(fixtures, pagedFolderValue, "image", 72),
  });
  await runCheck(page, checks, "scroll-gallery-grid", () => scrollGalleryGrid(page), {});
  await runNativeDragContractCheck(page, checks, nonEmptyFolder?.folder || "");
  await runCheck(page, checks, "rapid-media-switch", () => runRapidModeSwitch(page), {
    expectedMode: "image",
    allowModeFlicker: true,
  });
  await runCheck(page, checks, "rapid-folder-switch", () => runRapidFolderButtonsFromFolder(page, pagedFolderValue), {
    allowModeFlicker: true,
    folderProbe: true,
  });
  if (fixtures?.enabled && fixtures?.imageFolder) {
    await runCheck(page, checks, `preview-thumbnail-layout-${safeName(fixtures.imageFolder)}`, () => openPreviewThumbnailLayout(page, fixtures.imageFolder), {
      expectPreviewThumbnailsCentered: true,
      allowPreviewFlicker: true,
      allowPreviewOpen: true,
    });
  }
  if (fixtures?.enabled && fixtures?.pagedFolder) {
    await runCheck(page, checks, `preview-thumbnail-scroll-layout-${safeName(fixtures.pagedFolder)}`, () => openScrollablePreviewThumbnailLayout(page, fixtures.pagedFolder), {
      expectPreviewThumbnailsScrollable: true,
      allowPreviewFlicker: true,
      allowPreviewOpen: true,
    });
  }
  await runCheck(page, checks, "close-catalog", () => ensureCatalogClosed(page), { expectCatalogClosed: true });
  await runCheck(page, checks, "reopen-catalog-after-close", () => ensureCatalogOpen(page), {});

  for (let index = 0; index < config.presetSelectors.length; index += 1) {
    const selector = config.presetSelectors[index];
    await runCheck(page, checks, `optional-preset-switch-${index + 1}-${safeName(selector)}`, () => clickElement(page, selector, `preset ${selector}`), {
      allowPreviewFlicker: true,
    });
    await runCheck(page, checks, `optional-preset-reopen-catalog-${index + 1}`, () => ensureCatalogOpen(page), {});
  }

  if (fixtures?.enabled && fixtures?.imageFolder) {
    await runCheck(page, checks, `preview-thumbnail-narrow-layout-${safeName(fixtures.imageFolder)}`, () => openNarrowPreviewThumbnailLayout(page, fixtures.imageFolder), {
      expectPreviewThumbnailsCentered: true,
      expectNarrowPreviewLayout: true,
      allowPreviewFlicker: true,
      allowPreviewOpen: true,
    });
  }
  if (fixtures?.enabled && fixtures?.pagedFolder) {
    await runCheck(page, checks, `preview-after-rapid-folder-switch-${safeName(fixtures.pagedFolder)}`, () => openPreviewAfterRapidFolderSwitch(page, fixtures.pagedFolder), {
      expectPreviewThumbnailsCentered: true,
      allowModeFlicker: true,
      allowPreviewFlicker: true,
      allowPreviewOpen: true,
      folderProbe: true,
    });
    await runCheck(page, checks, `frost-reveal-during-folder-switch-${safeName(fixtures.pagedFolder)}`, () => revealFrostDuringFolderSwitch(page, fixtures.pagedFolder), {
      expectFrostRevealed: true,
      allowModeFlicker: true,
      allowPreviewFlicker: true,
      folderProbe: true,
      expectedLoadedCount: expectedFixtureLoadedCount(fixtures, fixtures.pagedFolder, "image", 36),
      actionTimeoutMs: 30000,
    });
    await runCheck(page, checks, `frost-reveal-after-preview-folder-switch-${safeName(fixtures.imageFolder)}-to-${safeName(fixtures.pagedFolder)}`, () => revealFrostAfterPreviewFolderSwitch(page, fixtures.imageFolder, fixtures.pagedFolder), {
      expectFrostRevealed: true,
      allowModeFlicker: true,
      allowPreviewFlicker: true,
      folderProbe: true,
      expectedLoadedCount: expectedFixtureLoadedCount(fixtures, fixtures.pagedFolder, "image", 36),
      actionTimeoutMs: 30000,
    });
  }

  if (config.runRealGenerationCompare) {
    await runCheck(page, checks, "real-generation-compare-after-catalog-close", () => runRealInputGenerationComparison(page), {
      expectComparisonSurface: true,
      guardMs: Math.max(config.guardMaxMs, 6500),
      actionTimeoutMs: Math.max(config.actionTimeoutMs, config.generationTimeoutMs + 45000),
    });
  }

  const global = globalAnalysis(checks, events, fixtures, gradio, sourceAudit);
  const coverage = buildScenarioCoverage(checks, fixtures);
  const summary = summarizeChecks(checks, global, coverage);
  const apiTimingSummary = summarizeApiTimings(events);
  const readableSummary = buildReadableSummary(summary, coverage, global, checks, apiTimingSummary);
  return {
    ok: summary.ok,
    exitCode: summary.ok ? EXIT_CODES.ok : EXIT_CODES.liveFailure,
    mode: "live",
    liveChecksExecuted: true,
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    config: reportConfigSnapshot(),
    preflight,
    fixtures,
    sourceAudit,
    gradio,
    runtime,
    schemas: reportSchemas(),
    readableSummary,
    summary,
    coverage,
    apiTimingSummary,
    global,
    folderMatrix: global.folderMatrix || [],
    countMatrixFields: global.countMatrixFields || FOLDER_MATRIX_FIELDS,
    checks,
    events,
    violations: checks.flatMap((check) => check.violations || []).concat(global.violations || []),
  };
}

function buildErrorReport(error, events, screenshot, preflight, sourceAudit = null) {
  const fixtures = {
    enabled: false,
    reason: "not prepared because live checks did not start",
  };
  const coverage = buildScenarioCoverage([], fixtures);
  const isPreflightError = error instanceof HealthPreflightError;
  const reportPreflight =
    preflight ||
    error.preflight || {
      ok: false,
      skipped: true,
      reason: "not reached",
      url: config.baseUrl,
      waitBudgetMs: config.waitForServerMs,
      attempts: 0,
      waitedMs: 0,
      status: 0,
      lastError: "",
    };
  const violation = {
    check: isPreflightError ? "preflight" : "tool-environment",
    severity: "fail",
    code: isPreflightError ? "webui_preflight_unreachable" : "gallery_health_tool_environment_error",
    message: isPreflightError
      ? `WebUI is not reachable before live gallery checks: ${reportPreflight.lastError || error.message}`
      : error.message,
    evidence: isPreflightError ? reportPreflight : { name: error.name || "Error" },
  };
  const summary = {
    ok: false,
    mode: "error",
    checkCount: 0,
    skippedCount: 0,
    coverageRequiredNotCoveredCount: coverage.requiredNotCovered.length,
    coverageMissingRequiredCount: coverage.missingRequired.length,
    coverageMissingOptionalCount: coverage.missingOptional.length,
    failCount: 1,
    warnCount: 0,
    durationMs: 0,
  };
  return {
    ok: false,
    exitCode: EXIT_CODES.toolOrEnvironmentError,
    mode: "error",
    liveChecksExecuted: false,
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    config: reportConfigSnapshot(),
    preflight: reportPreflight,
    fixtures,
    sourceAudit,
    gradio: null,
    runtime: null,
    schemas: reportSchemas(),
    readableSummary: {
      result: isPreflightError ? "webui-unreachable" : "tool-or-environment-error",
      checkCount: 0,
      failCount: 1,
      warnCount: 0,
      skippedCount: 0,
      failedChecks: [violation.check],
      warningChecks: [],
      requiredCoverageNotCovered: coverage.requiredNotCovered,
      optionalCoverageMissing: coverage.missingOptional,
      recommendations: isPreflightError ? ["start_webui_or_set_wait_for_server"] : ["fix_tool_environment"],
      actionRecommendations: [],
      slowestApiMs: 0,
      slowestApiUrl: "",
    },
    summary,
    coverage,
    apiTimingSummary: { count: 0, maxMs: 0, avgMs: 0, slowest: [] },
    global: {
      folderMatrix: [],
      countMatrixFields: FOLDER_MATRIX_FIELDS,
      recommendations: [],
      actionRecommendations: [],
      violations: [violation],
    },
    folderMatrix: [],
    countMatrixFields: FOLDER_MATRIX_FIELDS,
    checks: [],
    events,
    violations: [violation],
    error: { name: error.name || "Error", message: error.message, stack: String(error.stack || "").slice(0, 4000) },
    screenshot,
  };
}

async function main() {
  if (config.selfTest) {
    const report = await buildSelfTestReport();
    report.markdownSummaryPath = await writeMarkdownSummary(report);
    await writeReport(report);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.exitCode;
    return;
  }

  if (config.dryRun) {
    const report = await buildDryRunReport();
    report.markdownSummaryPath = await writeMarkdownSummary(report);
    await writeReport(report);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.exitCode;
    return;
  }

  let browser;
  let page;
  const events = [];
  let preflight = null;
  let sourceAudit = null;
  try {
    sourceAudit = await readWebuiGallerySourceAudit();
    preflight = await waitForServerReady(config.baseUrl, config.waitForServerMs);
    if (!preflight.ok) throw new HealthPreflightError(preflight);

    const { chromium } = await loadPlaywright();
    browser = await chromium.launch(browserLaunchOptions());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    page = await context.newPage();
    page.setDefaultTimeout(config.timeoutMs);
    await installRuntimeWatchers(page, events);

    const report = await runGalleryHealth(page, events, preflight, sourceAudit);
    report.markdownSummaryPath = await writeMarkdownSummary(report);
    await writeReport(report);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.exitCode;
  } catch (error) {
    const screenshot = await saveFailureScreenshot(page, "gallery-health-check").catch(() => "");
    const report = buildErrorReport(error, events, screenshot, preflight || error.preflight || null, sourceAudit);
    report.markdownSummaryPath = await writeMarkdownSummary(report).catch(() => "");
    await writeReport(report).catch(() => {});
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.exitCode;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

await main();
