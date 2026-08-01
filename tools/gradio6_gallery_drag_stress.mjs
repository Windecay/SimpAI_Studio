#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_URL = "http://127.0.0.1:8190/?__theme=dark";
const DEFAULT_SELECTOR = [
  "#finished_gallery img",
  "#final_gallery img",
  "#preview_generating img",
  "#comparison_box img",
].join(", ");
const CUSTOM_ORIGINAL_URL_TYPE = "application/x-simpleai-gallery-original-url";

function parseArgs(argv) {
  const config = {
    url: process.env.SIMPAI_GALLERY_DRAG_STRESS_URL || DEFAULT_URL,
    selector: process.env.SIMPAI_GALLERY_DRAG_STRESS_SELECTOR || DEFAULT_SELECTOR,
    iterations: Number(process.env.SIMPAI_GALLERY_DRAG_STRESS_ITERATIONS || 20),
    candidateLimit: Number(process.env.SIMPAI_GALLERY_DRAG_STRESS_CANDIDATE_LIMIT || 24),
    waitMs: Number(process.env.SIMPAI_GALLERY_DRAG_STRESS_WAIT_MS || 2500),
    openAccordionWaitMs: Number(process.env.SIMPAI_GALLERY_DRAG_STRESS_OPEN_ACCORDION_WAIT_MS || 1200),
    mediaSwitchWaitMs: Number(process.env.SIMPAI_GALLERY_DRAG_STRESS_MEDIA_SWITCH_WAIT_MS || 1800),
    caseTimeoutMs: Number(process.env.SIMPAI_GALLERY_DRAG_STRESS_CASE_TIMEOUT_MS || 3500),
    holdMs: Number(process.env.SIMPAI_GALLERY_DRAG_STRESS_HOLD_MS || 650),
    maxFrameGapMs: Number(process.env.SIMPAI_GALLERY_DRAG_STRESS_MAX_FRAME_GAP_MS || 900),
    live: process.env.SIMPAI_GALLERY_DRAG_STRESS_LIVE === "1",
    headful: process.env.SIMPAI_GALLERY_DRAG_STRESS_HEADFUL === "1",
    openAccordion: !/^(0|false|no)$/i.test(process.env.SIMPAI_GALLERY_DRAG_STRESS_OPEN_ACCORDION || "1"),
    postDragProbe: !/^(0|false|no)$/i.test(process.env.SIMPAI_GALLERY_DRAG_STRESS_POST_DRAG_PROBE || "1"),
    accordionProbe: !/^(0|false|no)$/i.test(process.env.SIMPAI_GALLERY_DRAG_STRESS_ACCORDION_PROBE || "1"),
    mediaMode: process.env.SIMPAI_GALLERY_DRAG_STRESS_MEDIA_MODE || "",
    mediaRefreshRetry: !/^(0|false|no)$/i.test(process.env.SIMPAI_GALLERY_DRAG_STRESS_MEDIA_REFRESH_RETRY || "1"),
    playwrightChannel: process.env.SIMPAI_PLAYWRIGHT_CHANNEL || "",
    out: process.env.SIMPAI_GALLERY_DRAG_STRESS_OUT || "",
    selfTest: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--url") config.url = next();
    else if (arg === "--selector") config.selector = next();
    else if (arg === "--iterations") config.iterations = Number(next());
    else if (arg === "--candidate-limit") config.candidateLimit = Number(next());
    else if (arg === "--wait-ms") config.waitMs = Number(next());
    else if (arg === "--open-accordion-wait-ms") config.openAccordionWaitMs = Number(next());
    else if (arg === "--media-switch-wait-ms") config.mediaSwitchWaitMs = Number(next());
    else if (arg === "--case-timeout-ms") config.caseTimeoutMs = Number(next());
    else if (arg === "--hold-ms") config.holdMs = Number(next());
    else if (arg === "--max-frame-gap-ms") config.maxFrameGapMs = Number(next());
    else if (arg === "--out") config.out = next();
    else if (arg === "--live") config.live = true;
    else if (arg === "--headful") config.headful = true;
    else if (arg === "--no-open-accordion") config.openAccordion = false;
    else if (arg === "--no-post-drag-probe") config.postDragProbe = false;
    else if (arg === "--no-accordion-probe") config.accordionProbe = false;
    else if (arg === "--no-media-refresh-retry") config.mediaRefreshRetry = false;
    else if (arg === "--media-mode") config.mediaMode = next();
    else if (arg === "--channel") config.playwrightChannel = next();
    else if (arg === "--self-test") config.selfTest = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(config.iterations) || config.iterations < 1) config.iterations = 1;
  if (!Number.isFinite(config.candidateLimit) || config.candidateLimit < 1) config.candidateLimit = 1;
  if (!Number.isFinite(config.waitMs) || config.waitMs < 0) config.waitMs = 0;
  if (!Number.isFinite(config.openAccordionWaitMs) || config.openAccordionWaitMs < 0) config.openAccordionWaitMs = 0;
  if (!Number.isFinite(config.mediaSwitchWaitMs) || config.mediaSwitchWaitMs < 0) config.mediaSwitchWaitMs = 0;
  if (!Number.isFinite(config.caseTimeoutMs) || config.caseTimeoutMs < 500) config.caseTimeoutMs = 500;
  if (!Number.isFinite(config.holdMs) || config.holdMs < 0) config.holdMs = 0;
  if (!Number.isFinite(config.maxFrameGapMs) || config.maxFrameGapMs < 100) config.maxFrameGapMs = 100;
  config.mediaMode = String(config.mediaMode || "").trim().toLowerCase();
  if (!["", "image", "video"].includes(config.mediaMode)) {
    throw new Error(`Invalid --media-mode: ${config.mediaMode}`);
  }
  return config;
}

function printHelp() {
  console.log(`Usage:
  node tools/gradio6_gallery_drag_stress.mjs --url http://127.0.0.1:8190/?__theme=dark

Options:
  --url <url>                Target SimpAI page. Default: ${DEFAULT_URL}
  --iterations <n>           Synthetic drag rounds per image. Default: 20
  --candidate-limit <n>      Maximum matched images to stress. Default: 24
  --live                     Also perform real mouse drag smoke in an isolated Chromium
  --headful                  Show the isolated Chromium window
  --wait-ms <n>              Wait after page load before collecting images. Default: 2500
  --open-accordion-wait-ms <n> Wait after opening the history accordion. Default: 1200
  --media-mode <image|video> Switch the output history browser before collecting candidates
  --media-switch-wait-ms <n> Wait after image/video switch. Default: 1800
  --case-timeout-ms <n>      Timeout for each live drag responsiveness check. Default: 3500
  --hold-ms <n>              Hold mouse down during live drag. Default: 650
  --max-frame-gap-ms <n>     Fail when page frame gap exceeds this during live drag. Default: 900
  --selector <css>           Image selector to stress
  --no-open-accordion        Do not auto-open the output history accordion before collecting candidates
  --no-post-drag-probe       Disable DOM residue and frame-gap checks after live drag
  --no-accordion-probe       Disable accordion click responsiveness check after live drag
  --no-media-refresh-retry   Do not click Refresh when media switch exposes no media
  --out <path>               Write JSON report
  --channel <name>           Playwright channel, e.g. chrome
  --self-test                Validate script contracts without launching browser
`);
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (err) {
    throw new Error([
      "Playwright is required for gallery drag stress.",
      "Install locally with: npm install --no-save playwright",
      "If Chromium is missing, run: npx playwright install chromium",
      err?.message || String(err),
    ].join("\n"));
  }
}

function makeReport(config) {
  return {
    ok: true,
    tool: "gradio6_gallery_drag_stress",
    startedAt: new Date().toISOString(),
    config,
    summary: {
      candidates: 0,
      syntheticRuns: 0,
      liveRuns: 0,
      postDragProbeRuns: 0,
      accordionProbeRuns: 0,
      failures: 0,
      warnings: 0,
    },
    openAccordion: null,
    mediaSwitch: null,
    candidates: [],
    synthetic: [],
    live: [],
    postDragProbes: [],
    accordionProbes: [],
    failures: [],
    warnings: [],
    consoleErrors: [],
  };
}

function pushFailure(report, code, message, detail = {}) {
  report.ok = false;
  report.summary.failures += 1;
  report.failures.push({ code, message, detail });
}

function pushWarning(report, code, message, detail = {}) {
  report.summary.warnings += 1;
  report.warnings.push({ code, message, detail });
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

async function collectCandidates(page, selector, candidateLimit) {
  return await page.evaluate(({ sel, limit }) => {
    const seen = new Set();
    function mediaSrc(elem) {
      return elem?.currentSrc || elem?.src || elem?.getAttribute?.("src") || "";
    }
    function mediaWidth(elem) {
      return Number(elem?.naturalWidth || elem?.videoWidth || 0);
    }
    function mediaHeight(elem) {
      return Number(elem?.naturalHeight || elem?.videoHeight || 0);
    }
    function visibleRect(elem) {
      const rect = elem.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }
    function isVisibleRect(rect, elem) {
      if (!rect || rect.width < 4 || rect.height < 4) return false;
      const style = getComputedStyle(elem);
      return style.visibility !== "hidden" && style.display !== "none";
    }
    function isMediaTag(elem) {
      return /^(img|video)$/i.test(String(elem?.tagName || ""));
    }
    function hasVisibleNestedMedia(elem) {
      if (isMediaTag(elem)) return false;
      return Array.from(elem.querySelectorAll?.("img, video") || []).some((child) => isVisibleRect(visibleRect(child), child));
    }
    return Array.from(document.querySelectorAll(sel)).filter((img) => {
      if (!img || seen.has(img)) return false;
      seen.add(img);
      return String(img.tagName || "").toLowerCase() === "img"
        && isVisibleRect(visibleRect(img), img)
        && !hasVisibleNestedMedia(img);
    }).slice(0, limit).map((img, index) => {
      const rect = visibleRect(img);
      return {
        index,
        tagName: String(img.tagName || "").toLowerCase(),
        src: mediaSrc(img),
        naturalWidth: mediaWidth(img),
        naturalHeight: mediaHeight(img),
        rect,
        visible: rect.width > 0 && rect.height > 0,
        imgDraggable: !!img.draggable,
        imgDraggableAttr: img.getAttribute("draggable"),
        imgMarked: img.dataset?.simpleaiGalleryNativeDragImage === "1",
        externalHandleCount: document.querySelectorAll(".simpleai-gallery-external-drag-handle").length,
        inPreview: !!img.closest?.("#preview_generating"),
        inGallery: !!img.closest?.("#finished_gallery, #final_gallery"),
      };
    });
  }, { sel: selector, limit: candidateLimit });
}

async function switchGalleryMedia(page, config, report) {
  if (!config.mediaMode) return;
  const mode = config.mediaMode;
  const row = await page.evaluate((requestedMode) => {
    const buttonId = requestedMode === "video" ? "gallery_videos_btn" : "gallery_images_btn";
    const button = document.getElementById(buttonId);
    const before = {
      mode: window.simpleaiTopbarSystemParams?.__gallery_engine_type || window.simpleaiTopbarSystemParams?.engine_type || "",
      imageButton: !!document.getElementById("gallery_images_btn"),
      videoButton: !!document.getElementById("gallery_videos_btn"),
    };
    if (!button) return { ok: false, requestedMode, before, reason: "missing-button" };
    button.scrollIntoView({ block: "center", inline: "center" });
    const rect = button.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return { ok: false, requestedMode, before, reason: "button-not-visible" };
    return {
      ok: true,
      requestedMode,
      before,
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2),
    };
  }, mode);
  if (!row.ok) {
    report.mediaSwitch = row;
    pushWarning(report, "media_switch_not_available", "Requested gallery media switch button was not available.", row);
    return;
  }
  await page.mouse.click(row.x, row.y);
  if (config.mediaSwitchWaitMs) await page.waitForTimeout(config.mediaSwitchWaitMs);
  const mediaSnapshot = () => page.evaluate(() => {
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width >= 4 && rect.height >= 4 && style.display !== "none" && style.visibility !== "hidden";
    };
    return {
      mode: window.simpleaiTopbarSystemParams?.__gallery_engine_type || window.simpleaiTopbarSystemParams?.engine_type || "",
      visibleImages: Array.from(document.querySelectorAll("#finished_gallery img, #final_gallery img")).filter(visible).length,
      visibleVideos: Array.from(document.querySelectorAll("#finished_gallery video, #final_gallery video, #video_player video")).filter(visible).length,
      visibleTiles: Array.from(document.querySelectorAll("#finished_gallery .gallery-item, #finished_gallery .thumbnail-item, #final_gallery .gallery-item, #final_gallery .thumbnail-item")).filter(visible).length,
    };
  });
  row.after = await mediaSnapshot();
  const modeHasMedia = mode === "video"
    ? (row.after.visibleVideos + row.after.visibleTiles) > 0
    : (row.after.visibleImages + row.after.visibleTiles) > 0;
  if (!modeHasMedia && config.mediaRefreshRetry) {
    row.refreshRetry = await page.evaluate(() => {
      const button = document.getElementById("gallery_browser_refresh_btn");
      if (!button) return { ok: false, reason: "missing-refresh" };
      button.scrollIntoView({ block: "center", inline: "center" });
      const rect = button.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) return { ok: false, reason: "refresh-not-visible" };
      return { ok: true, x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
    });
    if (row.refreshRetry.ok) {
      await page.mouse.click(row.refreshRetry.x, row.refreshRetry.y);
      if (config.mediaSwitchWaitMs) await page.waitForTimeout(config.mediaSwitchWaitMs);
      row.afterRefresh = await mediaSnapshot();
    }
  }
  report.mediaSwitch = row;
}

async function snapshotGalleryAccordion(page) {
  return await page.evaluate(() => {
    function isRendered(elem) {
      const rect = elem?.getBoundingClientRect?.();
      if (!rect || rect.width < 4 || rect.height < 4) return false;
      const style = getComputedStyle(elem);
      return style.visibility !== "hidden" && style.display !== "none";
    }
    function textOf(elem) {
      return (elem?.textContent || "").replace(/\s+/g, " ").trim();
    }
    function visibleMedia(selector) {
      return Array.from(document.querySelectorAll(selector)).filter(isRendered).length;
    }
    const root = document.querySelector("#finished_images_catalog");
    const label = root?.querySelector?.(":scope > button.label-wrap")
      || root?.querySelector?.("button.label-wrap, summary, [role='button']")
      || null;
    const labelRect = label?.getBoundingClientRect?.();
    const rootRect = root?.getBoundingClientRect?.();
    const labelOpen = !!label && (
      label.classList.contains("open")
      || label.getAttribute("aria-expanded") === "true"
      || label.hasAttribute("open")
      || root?.hasAttribute?.("open")
    );
    const bodyVisible = !!root && Array.from(root.children || []).some((child) => {
      try {
        if (child.matches?.("button.label-wrap, summary")) return false;
      } catch {}
      return isRendered(child);
    });
    return {
      rootExists: !!root,
      rootRendered: isRendered(root),
      labelOpen,
      bodyVisible,
      text: textOf(root).slice(0, 240),
      root: root && rootRect ? {
        x: Math.round(rootRect.x),
        y: Math.round(rootRect.y),
        width: Math.round(rootRect.width),
        height: Math.round(rootRect.height),
        className: String(root.className || ""),
        hidden: !!root.hidden || root.hasAttribute("hidden") || root.getAttribute("aria-hidden") === "true",
        style: root.getAttribute("style") || "",
        dataset: root.dataset ? Object.fromEntries(Object.entries(root.dataset).slice(0, 16)) : {},
      } : null,
      header: label && labelRect ? {
        text: textOf(label),
        ariaExpanded: label.getAttribute("aria-expanded"),
        className: String(label.className || ""),
        x: Math.round(labelRect.left + labelRect.width / 2),
        y: Math.round(labelRect.top + labelRect.height / 2),
        width: Math.round(labelRect.width),
        height: Math.round(labelRect.height),
      } : null,
      galleryMediaCount: visibleMedia("#finished_gallery img, #final_gallery img"),
      previewMediaCount: visibleMedia("#preview_generating img, #comparison_box img, #simpleai_gallery_welcome_guard_placeholder img"),
    };
  });
}

async function ensureGalleryAccordionOpen(page, config, report) {
  if (!config.openAccordion) return;
  const reveal = await page.evaluate((reasonText) => {
    const root = document.querySelector("#finished_images_catalog");
    if (!root) return { exists: false, calls: [] };
    const calls = [];
    const call = (name, fn) => {
      try {
        if (typeof fn !== "function") return;
        const result = fn();
        calls.push({ name, ok: true, result: typeof result === "undefined" ? null : !!result });
      } catch (error) {
        calls.push({ name, ok: false, message: String(error?.message || error).slice(0, 240) });
      }
    };
    call("allowCatalogOpenDuringPresetSwitch", () =>
      typeof allowCatalogOpenDuringPresetSwitch === "function"
        ? allowCatalogOpenDuringPresetSwitch(reasonText)
        : undefined
    );
    call("clearSimpleAIPresetSwitchGalleryHidden", () =>
      typeof clearSimpleAIPresetSwitchGalleryHidden === "function"
        ? clearSimpleAIPresetSwitchGalleryHidden(reasonText)
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
      className: String(root.className || ""),
      dataset: root.dataset ? Object.fromEntries(Object.entries(root.dataset).slice(0, 16)) : {},
    };
  }, "gallery_drag_stress.open");
  if (config.openAccordionWaitMs) await page.waitForTimeout(Math.min(config.openAccordionWaitMs, 600));
  const before = await snapshotGalleryAccordion(page);
  const row = { reveal, before, clicked: false, usedRestore: false, after: null, ok: true };
  if (!before.rootExists || !before.header) {
    row.ok = false;
    report.openAccordion = row;
    pushWarning(report, "open_accordion_no_header", "Could not find the output history accordion header before stress.", {});
    return;
  }
  const alreadyOpen = before.labelOpen && (before.bodyVisible || before.galleryMediaCount > 0);
  if (!alreadyOpen) {
    const target = await page.evaluate(() => {
      const root = document.querySelector("#finished_images_catalog");
      if (!root) return { ok: false, reason: "missing-root" };
      const label = root.querySelector(":scope > button.label-wrap") || root.querySelector("button.label-wrap, summary, [role='button']");
      if (!label && typeof window.ensureSimpleAIPresetCatalogOpen === "function") {
        const restored = window.ensureSimpleAIPresetCatalogOpen(root, "gallery_drag_stress.open");
        if (restored) return { ok: true, usedRestore: true };
      }
      const clickTarget = label || root;
      clickTarget.scrollIntoView({ block: "center", inline: "center" });
      const rect = clickTarget.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) return { ok: false, reason: "not-visible" };
      return {
        ok: true,
        usedRestore: false,
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
      };
    });
    if (!target.ok) {
      row.ok = false;
      row.target = target;
      report.openAccordion = row;
      pushWarning(report, "open_accordion_not_clickable", "Output history accordion was found but not clickable before stress.", row);
      return;
    }
    row.usedRestore = !!target.usedRestore;
    if (!target.usedRestore) {
      row.clicked = true;
      await page.mouse.click(target.x, target.y);
    }
    if (config.openAccordionWaitMs) await page.waitForTimeout(config.openAccordionWaitMs);
    row.after = await snapshotGalleryAccordion(page);
    const opened = row.after?.labelOpen || row.after?.galleryMediaCount > before.galleryMediaCount;
    if (!opened) {
      row.ok = false;
      pushWarning(report, "open_accordion_no_visible_change", "Output history accordion did not visibly open before stress.", row);
    }
  }
  report.openAccordion = row;
}

async function installLiveWatchdog(page, config) {
  await page.evaluate(({ maxFrameGapMs }) => {
    const old = window.__simpleaiGalleryDragStressWatchdog;
    if (old?.dispose) old.dispose();
    const state = {
      threshold: Number(maxFrameGapMs || 900),
      label: "",
      frames: 0,
      lastFrameAt: 0,
      maxFrameGapMs: 0,
      gaps: [],
      events: [],
      eventCounts: {},
    };
    let rafId = 0;
    const listeners = [];
    function shortTarget(target) {
      if (!target) return "";
      const tag = target.tagName || "";
      const id = target.id ? `#${target.id}` : "";
      const cls = typeof target.className === "string" && target.className ? `.${target.className.split(/\s+/).slice(0, 3).join(".")}` : "";
      return `${tag}${id}${cls}`;
    }
    function pushEvent(type, event) {
      state.eventCounts[type] = (state.eventCounts[type] || 0) + 1;
      state.events.push({
        t: Math.round(performance.now()),
        type,
        target: shortTarget(event?.target),
        buttons: event?.buttons || 0,
      });
      if (state.events.length > 80) state.events.shift();
    }
    function on(target, type, fn, options) {
      target.addEventListener(type, fn, options);
      listeners.push([target, type, fn, options]);
    }
    function tick(now) {
      if (state.lastFrameAt) {
        const gap = now - state.lastFrameAt;
        if (gap > state.maxFrameGapMs) state.maxFrameGapMs = gap;
        if (gap >= state.threshold) {
          state.gaps.push({ t: Math.round(now), gapMs: Math.round(gap) });
          if (state.gaps.length > 20) state.gaps.shift();
        }
      }
      state.lastFrameAt = now;
      state.frames += 1;
      rafId = requestAnimationFrame(tick);
    }
    function snapshot(label = "") {
      const previewNodes = document.querySelectorAll("#simpleai-native-image-drag-preview, #simpleai-gallery-pointer-drag-preview");
      const dragSources = document.querySelectorAll('[data-simpleai-managed-native-image-drag-source="1"]');
      const dragImages = document.querySelectorAll('[data-simpleai-managed-native-image-drag-image="1"]');
      const externalHandles = document.querySelectorAll(".simpleai-gallery-external-drag-handle");
      return {
        label,
        now: Math.round(performance.now()),
        frames: state.frames,
        maxFrameGapMs: Math.round(state.maxFrameGapMs),
        gaps: state.gaps.slice(-10),
        eventCounts: { ...state.eventCounts },
        recentEvents: state.events.slice(-20),
        previewNodePresent: previewNodes.length > 0,
        previewNodeCount: previewNodes.length,
        managedSourceCount: dragSources.length,
        managedImageCount: dragImages.length,
        externalHandleCount: externalHandles.length,
        documentHidden: !!document.hidden,
        hasFocus: document.hasFocus?.() ?? true,
        activeElement: shortTarget(document.activeElement),
      };
    }
    function reset(label = "") {
      state.label = label;
      state.frames = 0;
      state.lastFrameAt = performance.now();
      state.maxFrameGapMs = 0;
      state.gaps = [];
      state.events = [];
      state.eventCounts = {};
      return snapshot(label);
    }
    function dispose() {
      if (rafId) cancelAnimationFrame(rafId);
      listeners.forEach(([target, type, fn, options]) => target.removeEventListener(type, fn, options));
    }
    [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
      "mousedown",
      "mousemove",
      "mouseup",
      "dragstart",
      "dragend",
      "drop",
      "keydown",
      "keyup",
    ].forEach((type) => on(document, type, (event) => pushEvent(type, event), true));
    on(window, "blur", (event) => pushEvent("windowblur", event), true);
    on(window, "focus", (event) => pushEvent("windowfocus", event), true);
    rafId = requestAnimationFrame(tick);
    window.__simpleaiGalleryDragStressWatchdog = { reset, snapshot, dispose };
  }, { maxFrameGapMs: config.maxFrameGapMs });
}

async function resetLiveWatchdog(page, label) {
  return await page.evaluate((value) => {
    return window.__simpleaiGalleryDragStressWatchdog?.reset?.(value) || null;
  }, label);
}

async function snapshotLiveWatchdog(page, label) {
  return await page.evaluate((value) => {
    return window.__simpleaiGalleryDragStressWatchdog?.snapshot?.(value) || null;
  }, label);
}

async function probePostDragState(page, config, report, detail) {
  const snapshot = await snapshotLiveWatchdog(page, `post-drag:${detail.round}:${detail.index}`);
  const row = { ...detail, snapshot, ok: true };
  if (!snapshot) {
    row.ok = false;
    row.error = "watchdog snapshot unavailable";
    pushFailure(report, "post_drag_watchdog_unavailable", "Live drag watchdog was not available after drag.", detail);
  } else {
    if (snapshot.previewNodePresent || snapshot.previewNodeCount > 0) {
      row.ok = false;
      pushFailure(report, "post_drag_preview_leftover", "Native drag preview node remained after drag.", { ...detail, snapshot });
    }
    if (snapshot.externalHandleCount) {
      row.ok = false;
      pushFailure(report, "post_drag_legacy_state_leftover", "An obsolete external drag handle remained after drag.", { ...detail, snapshot });
    }
    if (snapshot.maxFrameGapMs > config.maxFrameGapMs) {
      row.ok = false;
      pushFailure(report, "live_drag_frame_gap", "Page frame gap exceeded the live drag threshold.", { ...detail, snapshot, thresholdMs: config.maxFrameGapMs });
    }
    const starts = snapshot.eventCounts?.dragstart || 0;
    const finishes = (snapshot.eventCounts?.dragend || 0) + (snapshot.eventCounts?.drop || 0);
    if (starts > finishes && starts > 0) {
      pushWarning(report, "live_drag_unmatched_dragstart", "Live drag did not report a matching dragend/drop before the probe finished.", { ...detail, snapshot });
    }
  }
  report.postDragProbes.push(row);
  report.summary.postDragProbeRuns = report.postDragProbes.length;
}

async function runAccordionProbe(page, config, report, reason) {
  const locate = async () => await page.evaluate(() => {
    function isVisible(elem) {
      const rect = elem?.getBoundingClientRect?.();
      if (!rect || rect.width < 4 || rect.height < 4) return false;
      const style = getComputedStyle(elem);
      return style.visibility !== "hidden" && style.display !== "none";
    }
    function visibleMediaCount() {
      return Array.from(document.querySelectorAll("#finished_gallery img, #final_gallery img, #preview_generating img, #comparison_box img"))
        .filter(isVisible).length;
    }
    const headers = Array.from(document.querySelectorAll("button.label-wrap, .label-wrap, button"))
      .filter(isVisible)
      .map((elem, index) => {
        const text = (elem.textContent || "").replace(/\s+/g, " ").trim();
        const rect = elem.getBoundingClientRect();
        return {
          index,
          text,
          ariaExpanded: elem.getAttribute("aria-expanded"),
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
        };
      })
      .filter((row) => /出图历史索引|视频索引|历史索引|Gallery|Video Index|Image Index/i.test(row.text));
    return {
      header: headers[0] || null,
      visibleMediaCount: visibleMediaCount(),
    };
  });
  const before = await locate();
  const row = { reason, before, afterFirst: null, afterSecond: null, ok: true };
  if (!before.header) {
    pushWarning(report, "accordion_probe_no_header", "Could not find a gallery accordion header to click.", { reason });
    row.ok = false;
    report.accordionProbes.push(row);
    report.summary.accordionProbeRuns = report.accordionProbes.length;
    return;
  }
  try {
    await withTimeout((async () => {
      await page.mouse.click(before.header.x, before.header.y);
      await page.waitForTimeout(220);
      row.afterFirst = await locate();
      await page.mouse.click(before.header.x, before.header.y);
      await page.waitForTimeout(220);
      row.afterSecond = await locate();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(true))));
    })(), config.caseTimeoutMs, "accordion probe");
    const firstChanged = row.afterFirst?.header?.ariaExpanded !== before.header.ariaExpanded
      || row.afterFirst?.visibleMediaCount !== before.visibleMediaCount;
    const secondChanged = row.afterSecond?.header?.ariaExpanded !== row.afterFirst?.header?.ariaExpanded
      || row.afterSecond?.visibleMediaCount !== row.afterFirst?.visibleMediaCount;
    if (!firstChanged && !secondChanged) {
      row.ok = false;
      pushFailure(report, "accordion_probe_no_state_change", "Gallery accordion did not visibly change after two clicks.", row);
    }
  } catch (err) {
    row.ok = false;
    row.error = err?.message || String(err);
    pushFailure(report, "accordion_probe_timeout", "Gallery accordion probe did not return in time.", row);
  }
  report.accordionProbes.push(row);
  report.summary.accordionProbeRuns = report.accordionProbes.length;
}

async function runSyntheticStress(page, config, report) {
  const result = await page.evaluate(({ selector, iterations, candidateLimit, customType }) => {
    function isVisible(elem) {
      const rect = elem?.getBoundingClientRect?.();
      if (!rect || rect.width < 4 || rect.height < 4) return false;
      const style = getComputedStyle(elem);
      return style.visibility !== "hidden" && style.display !== "none";
    }
    function isMediaTag(elem) {
      return /^(img|video)$/i.test(String(elem?.tagName || ""));
    }
    function hasVisibleNestedMedia(elem) {
      if (isMediaTag(elem)) return false;
      return Array.from(elem.querySelectorAll?.("img, video") || []).some(isVisible);
    }
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
    function dispatchMouse(type, target) {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === "mouseup" ? 0 : 1 });
      target.dispatchEvent(event);
      return event;
    }
    function dispatchDrag(type, target, dataTransfer) {
      const event = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer });
      target.dispatchEvent(event);
      return event;
    }
    const failures = [];
    const warnings = [];
    const runs = [];
    const seen = new Set();
    const images = Array.from(document.querySelectorAll(selector)).filter((img) => {
      if (!img || seen.has(img)) return false;
      seen.add(img);
      return isVisible(img) && !hasVisibleNestedMedia(img);
    }).slice(0, candidateLimit);
    for (let round = 0; round < iterations; round += 1) {
      for (let index = 0; index < images.length; index += 1) {
        const img = images[index];
        if (!img?.isConnected) continue;
        const previewBacked = isGalleryDisplayPreview(mediaSrc(img));
        const largeOriginal = !previewBacked && isExternalOriginalSource(mediaSrc(img)) && isLargeOriginalImage(img);
        const expectsDownloadUrl = previewBacked || largeOriginal;
        const dedicatedHost = img.closest?.("#finished_gallery, #final_gallery, #lightboxModal")
          ? img.closest?.(".thumbnail-item, .gallery-item, .media-button, .image-container, .image-frame, button")
          : null;
        const expectsDedicatedSource = expectsDownloadUrl && !!dedicatedHost;
        dispatchMouse("pointerover", img);
        dispatchMouse("pointerdown", img);
        dispatchMouse("mousedown", img);
        const managedSource = img.closest?.('[data-simpleai-managed-native-image-drag-source="1"]');
        const dragSource = managedSource || img;
        const dataTransfer = new DataTransfer();
        const startEvent = dispatchDrag("dragstart", dragSource, dataTransfer);
        const types = Array.from(dataTransfer.types || []);
        const typesLower = types.map((type) => String(type).toLowerCase());
        const customUrl = dataTransfer.getData(customType);
        const uri = dataTransfer.getData("text/uri-list");
        const plain = dataTransfer.getData("text/plain");
        const downloadUrl = dataTransfer.getData("DownloadURL");
        const afterStart = {
          imgDraggable: !!img.draggable,
          imgDraggableAttr: img.getAttribute("draggable"),
          imgMarked: img.dataset?.simpleaiGalleryNativeDragImage === "1",
          sourceTag: String(dragSource?.tagName || "").toLowerCase(),
          sourceDraggable: !!dragSource?.draggable,
          sourceDraggableAttr: dragSource?.getAttribute?.("draggable"),
          dedicatedSource: dragSource !== img,
          nativePreviewWidth: document.getElementById("simpleai-native-image-drag-preview")?.offsetWidth || 0,
          nativePreviewHeight: document.getElementById("simpleai-native-image-drag-preview")?.offsetHeight || 0,
          externalHandleCount: document.querySelectorAll(".simpleai-gallery-external-drag-handle").length,
          managedSourceCount: document.querySelectorAll('[data-simpleai-managed-native-image-drag-source="1"]').length,
          managedImageCount: document.querySelectorAll('[data-simpleai-managed-native-image-drag-image="1"]').length,
        };
        if (expectsDedicatedSource && (
          !afterStart.dedicatedSource
          || !afterStart.sourceDraggable
          || afterStart.sourceDraggableAttr !== "true"
          || afterStart.imgDraggable
          || afterStart.imgDraggableAttr !== "false"
        )) {
          failures.push({ code: "native_image_not_draggable", round, index, afterStart });
        }
        if (!expectsDedicatedSource && (!afterStart.imgDraggable || afterStart.imgDraggableAttr !== "true")) {
          failures.push({ code: "native_image_not_draggable", round, index, afterStart });
        }
        if (!afterStart.imgMarked) {
          failures.push({ code: "native_image_not_marked", round, index, afterStart });
        }
        if (startEvent.defaultPrevented) {
          failures.push({ code: "native_drag_default_prevented", round, index });
        }
        if (!customUrl || (!expectsDedicatedSource && (!uri || !plain))) {
          failures.push({ code: "native_drag_missing_url_payload", round, index, types, customUrl, uri, plain });
        }
        if (expectsDedicatedSource && (uri || plain || typesLower.includes("text/uri-list") || typesLower.includes("text/plain"))) {
          failures.push({ code: "native_drag_download_source_contains_text_url", round, index, types, uri, plain, afterStart });
        }
        if (expectsDedicatedSource && (
          afterStart.nativePreviewWidth !== 120
          || afterStart.nativePreviewHeight < 48
          || afterStart.nativePreviewHeight > 160
        )) {
          failures.push({ code: "native_drag_download_preview_invalid", round, index, types, afterStart });
        }
        if (expectsDownloadUrl && (!downloadUrl || !typesLower.includes("downloadurl"))) {
          failures.push({ code: "native_drag_preview_missing_original_download", round, index, types, downloadUrl, customUrl });
        }
        if (expectsDownloadUrl && downloadUrl && (
          !customUrl
          || (!downloadUrl.includes("/simpleai/gallery-download/") && !downloadUrl.endsWith(`:${customUrl}`))
          || downloadUrl.includes("simpai_gprev__")
        )) {
          failures.push({ code: "native_drag_preview_download_not_original", round, index, types, downloadUrl, customUrl });
        }
        if (expectsDedicatedSource && typesLower.includes("files")) {
          failures.push({ code: "native_drag_download_source_contains_files", round, index, types, afterStart });
        }
        if (!expectsDownloadUrl && (downloadUrl || typesLower.includes("downloadurl"))) {
          failures.push({ code: "native_drag_unexpected_downloadurl", round, index, types, downloadUrl });
        }
        if (afterStart.externalHandleCount) {
          failures.push({ code: "native_drag_external_handle_present", round, index, afterStart });
        }
        dispatchDrag("dragend", dragSource, dataTransfer);
        dispatchMouse("mouseup", img);
        const afterEnd = {
          pointerPreview: !!document.getElementById("simpleai-gallery-pointer-drag-preview"),
          nativePreview: !!document.getElementById("simpleai-native-image-drag-preview"),
          externalHandleCount: document.querySelectorAll(".simpleai-gallery-external-drag-handle").length,
          managedSourceCount: document.querySelectorAll('[data-simpleai-managed-native-image-drag-source="1"]').length,
          managedImageCount: document.querySelectorAll('[data-simpleai-managed-native-image-drag-image="1"]').length,
        };
        if (afterEnd.pointerPreview || afterEnd.nativePreview || afterEnd.externalHandleCount) {
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
          expectsDedicatedSource,
          afterStart,
          afterEnd,
        });
      }
    }
    return { runs, failures, warnings };
  }, { selector: config.selector, iterations: config.iterations, candidateLimit: config.candidateLimit, customType: CUSTOM_ORIGINAL_URL_TYPE });
  report.synthetic = result.runs;
  report.summary.syntheticRuns = result.runs.length;
  for (const failure of result.failures) {
    pushFailure(report, failure.code, "Synthetic drag data/state contract failed.", failure);
  }
  for (const warning of result.warnings) {
    pushWarning(report, warning.code, "Synthetic drag data/state warning.", warning);
  }
}

async function runLiveSmoke(page, config, report) {
  const candidates = report.candidates.filter((item) => item.visible && item.rect.width >= 8 && item.rect.height >= 8);
  for (let round = 0; round < config.iterations; round += 1) {
    for (const item of candidates) {
      const x = item.rect.x + Math.min(Math.max(4, Math.floor(item.rect.width / 2)), Math.max(4, item.rect.width - 4));
      const y = item.rect.y + Math.min(Math.max(4, Math.floor(item.rect.height / 2)), Math.max(4, item.rect.height - 4));
      const detail = { round, index: item.index, x, y };
      try {
        await withTimeout((async () => {
          await resetLiveWatchdog(page, `live-drag:${round}:${item.index}`);
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x + 18, y + 8, { steps: 3 });
          if (config.holdMs) await page.waitForTimeout(config.holdMs);
          await page.mouse.move(x + 36, y + 18, { steps: 5 });
          await page.mouse.move(x + 3, y + 2, { steps: 2 });
          await page.mouse.up();
          await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(true))));
        })(), config.caseTimeoutMs, `live drag round=${round} index=${item.index}`);
        report.live.push({ ...detail, ok: true });
        if (config.postDragProbe) await probePostDragState(page, config, report, detail);
        if (config.accordionProbe && round === 0 && item.index === candidates[0]?.index) {
          await runAccordionProbe(page, config, report, "after-first-live-drag");
        }
      } catch (err) {
        report.live.push({ ...detail, ok: false, error: err?.message || String(err) });
        pushFailure(report, "live_drag_responsiveness_timeout", "Live drag smoke did not return in time.", { ...detail, error: err?.message || String(err) });
        return;
      } finally {
        report.summary.liveRuns = report.live.length;
      }
    }
  }
}

async function writeReport(report, outPath) {
  if (!outPath) return;
  const resolved = path.resolve(outPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, JSON.stringify(report, null, 2), "utf-8");
}

function runSelfTest(config) {
  const report = makeReport(config);
  const source = [
    CUSTOM_ORIGINAL_URL_TYPE,
    DEFAULT_SELECTOR,
    "media_mode_no_gallery_candidates",
    String(parseArgs),
    String(printHelp),
    String(installLiveWatchdog),
    String(snapshotGalleryAccordion),
    String(ensureGalleryAccordionOpen),
    String(probePostDragState),
    String(runAccordionProbe),
    String(runSyntheticStress),
    String(runLiveSmoke),
  ].join("\n");
  for (const needle of [
    CUSTOM_ORIGINAL_URL_TYPE,
    "#finished_gallery img",
    "#preview_generating img",
    "#comparison_box img",
    "native_drag_missing_url_payload",
    "native_drag_preview_missing_original_download",
    "native_drag_preview_download_not_original",
    "native_drag_download_source_contains_files",
    "native_drag_download_source_contains_text_url",
    "native_drag_download_preview_invalid",
    "native_image_not_draggable",
    "native_image_not_marked",
    "native_drag_external_handle_present",
    "native_drag_state_residue",
    "live_drag_responsiveness_timeout",
    "live_drag_frame_gap",
    "post_drag_preview_leftover",
    "post_drag_legacy_state_leftover",
    "accordion_probe_no_state_change",
    "window.__simpleaiGalleryDragStressWatchdog",
    "--hold-ms",
    "--max-frame-gap-ms",
    "--candidate-limit",
    "--media-mode",
    "--no-media-refresh-retry",
    "media_mode_no_gallery_candidates",
    "--no-open-accordion",
    "open_accordion_no_visible_change",
  ]) {
    if (!source.includes(needle)) {
      pushFailure(report, "self_test_missing_contract", `Missing contract needle: ${needle}`, { needle });
    }
  }
  return report;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const report = makeReport(config);
  if (config.selfTest) {
    const selfReport = runSelfTest(config);
    await writeReport(selfReport, config.out);
    console.log(JSON.stringify(selfReport.summary));
    process.exit(selfReport.ok ? 0 : 1);
  }

  const { chromium } = await loadPlaywright();
  const launchOptions = { headless: !config.headful };
  if (config.playwrightChannel) launchOptions.channel = config.playwrightChannel;
  let browser = null;
  try {
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") report.consoleErrors.push({ type: msg.type(), text: msg.text() });
    });
    page.on("pageerror", (err) => {
      report.consoleErrors.push({ type: "pageerror", text: err?.message || String(err) });
    });
    await page.goto(config.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (config.live) await installLiveWatchdog(page, config);
    if (config.waitMs) await page.waitForTimeout(config.waitMs);
    await ensureGalleryAccordionOpen(page, config, report);
    await switchGalleryMedia(page, config, report);
    report.candidates = await collectCandidates(page, config.selector, config.candidateLimit);
    report.summary.candidates = report.candidates.length;
    if (config.mediaMode) {
      const galleryCandidates = report.candidates.filter((item) => item.inGallery);
      if (!galleryCandidates.length) {
        pushFailure(report, "media_mode_no_gallery_candidates", "Requested gallery media mode did not expose draggable gallery candidates.", {
          mediaMode: config.mediaMode,
          mediaSwitch: report.mediaSwitch,
          candidates: report.candidates.slice(0, 8),
        });
      }
    }
    if (!report.candidates.length) {
      pushFailure(report, "no_drag_candidates", "No gallery/preview images matched the stress selector.", { selector: config.selector });
    } else {
      await runSyntheticStress(page, config, report);
      if (config.live && report.ok) await runLiveSmoke(page, config, report);
    }
  } catch (err) {
    pushFailure(report, "gallery_drag_stress_runtime_error", "Gallery drag stress failed to run.", { error: err?.stack || err?.message || String(err) });
  } finally {
    report.finishedAt = new Date().toISOString();
    await writeReport(report, config.out);
    if (browser) await browser.close().catch(() => {});
  }

  console.log(JSON.stringify(report.summary, null, 2));
  if (!report.ok) {
    console.error(JSON.stringify(report.failures.slice(0, 10), null, 2));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
