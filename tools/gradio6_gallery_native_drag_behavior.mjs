#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imageviewerPath = path.join(root, "javascript", "imageviewer.js");
const previewOriginalPath = "C:/outputs/portrait-original.png";
const previewOriginalToken = Buffer.from(previewOriginalPath, "utf8").toString("base64url");
const previewImageUrl = `http://simpai.test/simpleai/gallery-preview/simpai_gprev__${previewOriginalToken}__0123456789abcdef.jpg`;
const expectedPreviewOriginalUrl = `http://simpai.test/gradio_api/file=${previewOriginalPath}`;
const expectedPreviewDownloadUrl = `http://simpai.test/simpleai/gallery-download/simpai_gdownload__${previewOriginalToken}__0123456789abcdef`;
const originalImagePath = "C:/outputs/small-original.png";
const originalImageUrl = `http://simpai.test/gradio_api/file=${originalImagePath}`;
const originalDownloadToken = Buffer.from(originalImagePath, "utf8").toString("base64url");
const expectedOriginalDownloadUrl = `http://simpai.test/simpleai/gallery-download/simpai_gdownload_path__${originalDownloadToken}`;

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    throw new Error(`Playwright is required: ${error?.message || error}`);
  }
}

const source = await fs.readFile(imageviewerPath, "utf8");
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
  await page.route("http://simpai.test/**", (route) => route.fulfill({
    status: 200,
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAFElEQVR4nO3BMQEAAADCoPVPbQ0PoAAAAAAAAAB4GgABAAHn7QAAAABJRU5ErkJggg==", "base64"),
  }));
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <style>
          body { margin: 0; min-height: 600px; }
          #finished_gallery { position: absolute; left: 40px; top: 40px; }
          .gallery-item { width: 240px; height: 240px; }
          .gallery-item img { display: block; width: 240px; height: 240px; }
          #preview_gallery_item { position: absolute; left: 280px; top: 0; }
          #input_image { position: absolute; left: 500px; top: 80px; width: 260px; height: 260px; background: #ddd; }
          #input_image input { width: 100%; height: 100%; }
        </style>
      </head>
      <body>
        <div id="finished_gallery">
          <div id="gallery_item" class="gallery-item"><img id="gallery_image" src="${originalImageUrl}"></div>
          <div id="preview_gallery_item" class="gallery-item"><img id="preview_gallery_image" src="${previewImageUrl}"></div>
          <div id="data_gallery_item" class="gallery-item" style="display:none"><img id="data_gallery_image" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAFElEQVR4nO3BMQEAAADCoPVPbQ0PoAAAAAAAAAB4GgABAAHn7QAAAABJRU5ErkJggg=="></div>
        </div>
        <div id="input_image"><input type="file" accept="image/*"></div>
      </body>
    </html>
  `);
  await page.evaluate(() => {
    window.gradioApp = () => document;
    window.onUiLoaded = (callback) => callback();
    window.onAfterUiUpdate = (callback) => { window.__afterUiUpdate = callback; };
    window.__nativeDragBehavior = {
      clicks: 0,
      drops: [],
      nativeStarts: 0,
      nativeEnds: 0,
      nativeTypes: [],
      diagnostics: [],
    };
    window.SimpAIStudioPerformance = {
      mark(event, data) {
        if (event === "gallery.native_drag_start") window.__nativeDragBehavior.diagnostics.push(data);
      },
    };
    ["gallery_image", "preview_gallery_image"].forEach((id) => {
      document.getElementById(id).addEventListener("click", () => {
        window.__nativeDragBehavior.clicks += 1;
      });
    });
    document.getElementById("input_image").addEventListener("dragover", (event) => event.preventDefault());
    document.getElementById("input_image").addEventListener("drop", (event) => {
      event.preventDefault();
      window.__nativeDragBehavior.drops.push(Array.from(event.dataTransfer?.types || []));
    });
    document.addEventListener("dragstart", (event) => {
      const img = event.target?.matches?.("img") ? event.target : event.target?.querySelector?.("img");
      if (!["gallery_image", "preview_gallery_image", "data_gallery_image"].includes(img?.id)) return;
      window.__nativeDragBehavior.nativeStarts += 1;
      window.__nativeDragBehavior.nativeTypes = Array.from(event.dataTransfer?.types || []);
    }, true);
    document.addEventListener("dragend", (event) => {
      const img = event.target?.matches?.("img") ? event.target : event.target?.querySelector?.("img");
      if (["gallery_image", "preview_gallery_image", "data_gallery_image"].includes(img?.id)) window.__nativeDragBehavior.nativeEnds += 1;
    }, true);
  });
  await page.addScriptTag({ content: source });
  await page.evaluate(() => {
    document.addEventListener("dragstart", (event) => {
      const img = event.target?.matches?.("img") ? event.target : event.target?.querySelector?.("img");
      if (!["gallery_image", "preview_gallery_image", "data_gallery_image"].includes(img?.id)) return;
      window.__nativeDragBehavior.nativeTypes = Array.from(event.dataTransfer?.types || []);
    });
  });
  await page.waitForFunction(() => {
    const small = document.getElementById("gallery_image");
    const preview = document.getElementById("preview_gallery_image");
    const previewSource = document.getElementById("preview_gallery_item");
    return small?.complete && small.naturalWidth > 0 && small.getAttribute("draggable") === "true"
      && preview?.complete && preview.naturalWidth > 0 && preview.getAttribute("draggable") === "false"
      && previewSource?.getAttribute("draggable") === "true";
  });

  const synthetic = await page.evaluate(() => {
    function dragSnapshot(id, end = true) {
      const img = document.getElementById(id);
      const source = img.closest('[data-simpleai-managed-native-image-drag-source="1"]') || img;
      const transfer = new DataTransfer();
      const event = new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer });
      source.dispatchEvent(event);
      const result = {
        prevented: event.defaultPrevented,
        draggable: source.draggable,
        attr: source.getAttribute("draggable"),
        imageDraggable: img.draggable,
        imageAttr: img.getAttribute("draggable"),
        sourceTag: source.tagName.toLowerCase(),
        dedicatedSource: source !== img,
        marked: img.dataset.simpleaiGalleryNativeDragImage === "1",
        types: Array.from(transfer.types || []),
        custom: transfer.getData("application/x-simpleai-gallery-original-url"),
        uri: transfer.getData("text/uri-list"),
        plain: transfer.getData("text/plain"),
        downloadUrl: transfer.getData("DownloadURL"),
        externalHandleCount: document.querySelectorAll(".simpleai-gallery-external-drag-handle").length,
        diagnostic: window.__nativeDragBehavior.diagnostics.at(-1) || null,
      };
      if (end) source.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: transfer }));
      return result;
    }
    const originalImage = document.getElementById("gallery_image");
    Object.defineProperty(originalImage, "naturalWidth", { configurable: true, value: 1168 });
    Object.defineProperty(originalImage, "naturalHeight", { configurable: true, value: 1704 });
    simpleaiSyncGalleryNativeDragImages();
    const original = dragSnapshot("gallery_image");
    Object.defineProperty(originalImage, "naturalWidth", { configurable: true, value: 3552 });
    Object.defineProperty(originalImage, "naturalHeight", { configurable: true, value: 4736 });
    simpleaiSyncGalleryNativeDragImages();
    const largeOriginal = dragSnapshot("gallery_image", false);
    const staleBeforePrepare = {
      dedicatedSource: Boolean(originalImage.closest('[data-simpleai-managed-native-image-drag-source="1"]')),
      imageDraggable: originalImage.draggable,
      imageAttr: originalImage.getAttribute("draggable"),
      originalUrl: window.__simpleaiGalleryOriginalDragUrl || "",
    };
    Object.defineProperty(originalImage, "naturalWidth", { configurable: true, value: 1168 });
    Object.defineProperty(originalImage, "naturalHeight", { configurable: true, value: 1704 });
    originalImage.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    const preparedAfterFailedLarge = {
      dedicatedSource: Boolean(originalImage.closest('[data-simpleai-managed-native-image-drag-source="1"]')),
      imageDraggable: originalImage.draggable,
      imageAttr: originalImage.getAttribute("draggable"),
      originalUrl: window.__simpleaiGalleryOriginalDragUrl || "",
      nativePreview: Boolean(document.getElementById("simpleai-native-image-drag-preview")),
    };
    const smallAfterFailedLarge = dragSnapshot("gallery_image");
    const dataImage = document.getElementById("data_gallery_image");
    Object.defineProperty(dataImage, "naturalWidth", { configurable: true, value: 3552 });
    Object.defineProperty(dataImage, "naturalHeight", { configurable: true, value: 4736 });
    simpleaiSyncGalleryNativeDragImages();
    return {
      original,
      largeOriginal,
      staleBeforePrepare,
      preparedAfterFailedLarge,
      smallAfterFailedLarge,
      largeData: dragSnapshot("data_gallery_image"),
      preview: dragSnapshot("preview_gallery_image"),
    };
  });

  const imageBox = await page.locator("#gallery_image").boundingBox();
  const previewImageBox = await page.locator("#preview_gallery_image").boundingBox();
  const dropBox = await page.locator("#input_image").boundingBox();
  if (!imageBox || !previewImageBox || !dropBox) throw new Error("Native drag fixtures are not visible");
  await page.mouse.move(imageBox.x + imageBox.width / 2, imageBox.y + imageBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dropBox.x + dropBox.width / 2, dropBox.y + dropBox.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.mouse.move(previewImageBox.x + previewImageBox.width / 2, previewImageBox.y + previewImageBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dropBox.x + dropBox.width / 2, dropBox.y + dropBox.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(50);
  await page.locator("#gallery_image").click();
  await page.locator("#preview_gallery_image").click();

  const finalState = await page.evaluate(() => ({
    ...window.__nativeDragBehavior,
    pointerPreview: Boolean(document.getElementById("simpleai-gallery-pointer-drag-preview")),
    nativePreview: Boolean(document.getElementById("simpleai-native-image-drag-preview")),
    externalHandleCount: document.querySelectorAll(".simpleai-gallery-external-drag-handle").length,
  }));
  const requiredTypes = [
    "application/x-simpleai-gallery-original-url",
    "text/uri-list",
    "text/plain",
  ];
  const originalSynthetic = synthetic.original;
  const largeOriginalSynthetic = synthetic.largeOriginal;
  const smallAfterFailedLargeSynthetic = synthetic.smallAfterFailedLarge;
  const largeDataSynthetic = synthetic.largeData;
  const previewSynthetic = synthetic.preview;
  const ok = originalSynthetic.prevented === false
    && originalSynthetic.draggable
    && originalSynthetic.attr === "true"
    && originalSynthetic.marked
    && requiredTypes.every((type) => originalSynthetic.types.includes(type))
    && Boolean(originalSynthetic.custom)
    && Boolean(originalSynthetic.uri)
    && Boolean(originalSynthetic.plain)
    && !originalSynthetic.downloadUrl
    && originalSynthetic.diagnostic?.display_source_kind === "gradio-file"
    && originalSynthetic.diagnostic?.preview_original_found === false
    && originalSynthetic.diagnostic?.large_original_download === false
    && originalSynthetic.diagnostic?.download_reason === ""
    && originalSynthetic.diagnostic?.original_url?.set_ok === true
    && originalSynthetic.diagnostic?.original_url?.readback_matches === true
    && originalSynthetic.diagnostic?.download_url?.attempted === false
    && originalSynthetic.externalHandleCount === 0
    && largeOriginalSynthetic.prevented === false
    && largeOriginalSynthetic.draggable
    && largeOriginalSynthetic.attr === "true"
    && largeOriginalSynthetic.marked
    && largeOriginalSynthetic.custom === originalImageUrl
    && !largeOriginalSynthetic.uri
    && !largeOriginalSynthetic.plain
    && largeOriginalSynthetic.downloadUrl === `image/png:small-original.png:${expectedOriginalDownloadUrl}`
    && largeOriginalSynthetic.dedicatedSource === true
    && largeOriginalSynthetic.imageDraggable === false
    && largeOriginalSynthetic.diagnostic?.dedicated_drag_source === true
    && largeOriginalSynthetic.diagnostic?.download_source_kind === "gallery-download"
    && largeOriginalSynthetic.diagnostic?.files_type_after === false
    && largeOriginalSynthetic.diagnostic?.display_source_kind === "gradio-file"
    && largeOriginalSynthetic.diagnostic?.preview_original_found === false
    && largeOriginalSynthetic.diagnostic?.loaded_width === 3552
    && largeOriginalSynthetic.diagnostic?.loaded_height === 4736
    && largeOriginalSynthetic.diagnostic?.large_original_download === true
    && largeOriginalSynthetic.diagnostic?.download_reason === "large-original"
    && largeOriginalSynthetic.diagnostic?.download_url?.attempted === true
    && largeOriginalSynthetic.diagnostic?.download_url?.set_ok === true
    && largeOriginalSynthetic.diagnostic?.download_url?.readback_matches === true
    && largeOriginalSynthetic.diagnostic?.drag_preview?.set_ok === true
    && largeOriginalSynthetic.diagnostic?.drag_preview?.width === 120
    && largeOriginalSynthetic.diagnostic?.drag_preview?.height >= 48
    && largeOriginalSynthetic.diagnostic?.drag_preview?.height <= 160
    && largeOriginalSynthetic.diagnostic?.transfer_types.some((type) => type.toLowerCase() === "downloadurl")
    && largeOriginalSynthetic.externalHandleCount === 0
    && synthetic.staleBeforePrepare.dedicatedSource === true
    && synthetic.staleBeforePrepare.imageDraggable === false
    && synthetic.staleBeforePrepare.imageAttr === "false"
    && synthetic.staleBeforePrepare.originalUrl === originalImageUrl
    && synthetic.preparedAfterFailedLarge.dedicatedSource === false
    && synthetic.preparedAfterFailedLarge.imageDraggable === true
    && synthetic.preparedAfterFailedLarge.imageAttr === "true"
    && !synthetic.preparedAfterFailedLarge.originalUrl
    && !synthetic.preparedAfterFailedLarge.nativePreview
    && smallAfterFailedLargeSynthetic.dedicatedSource === false
    && smallAfterFailedLargeSynthetic.imageDraggable === true
    && requiredTypes.every((type) => smallAfterFailedLargeSynthetic.types.includes(type))
    && smallAfterFailedLargeSynthetic.custom === originalImageUrl
    && smallAfterFailedLargeSynthetic.uri === originalImageUrl
    && smallAfterFailedLargeSynthetic.plain === originalImageUrl
    && !smallAfterFailedLargeSynthetic.downloadUrl
    && smallAfterFailedLargeSynthetic.diagnostic?.dedicated_drag_source === false
    && largeDataSynthetic.prevented === false
    && largeDataSynthetic.draggable
    && largeDataSynthetic.attr === "true"
    && largeDataSynthetic.marked
    && requiredTypes.every((type) => largeDataSynthetic.types.includes(type))
    && !largeDataSynthetic.downloadUrl
    && largeDataSynthetic.diagnostic?.display_source_kind === "data-image"
    && largeDataSynthetic.diagnostic?.original_source_kind === "data-image"
    && largeDataSynthetic.diagnostic?.loaded_width === 3552
    && largeDataSynthetic.diagnostic?.loaded_height === 4736
    && largeDataSynthetic.diagnostic?.large_original_download === false
    && largeDataSynthetic.diagnostic?.download_reason === ""
    && largeDataSynthetic.diagnostic?.download_url?.attempted === false
    && largeDataSynthetic.externalHandleCount === 0
    && previewSynthetic.prevented === false
    && previewSynthetic.draggable
    && previewSynthetic.attr === "true"
    && previewSynthetic.marked
    && previewSynthetic.custom === expectedPreviewOriginalUrl
    && !previewSynthetic.uri
    && !previewSynthetic.plain
    && previewSynthetic.downloadUrl === `image/png:portrait-original.png:${expectedPreviewDownloadUrl}`
    && previewSynthetic.dedicatedSource === true
    && previewSynthetic.imageDraggable === false
    && previewSynthetic.diagnostic?.dedicated_drag_source === true
    && previewSynthetic.diagnostic?.download_source_kind === "gallery-download"
    && previewSynthetic.diagnostic?.files_type_after === false
    && previewSynthetic.diagnostic?.display_source_kind === "gallery-preview"
    && previewSynthetic.diagnostic?.original_source_kind === "gradio-file"
    && previewSynthetic.diagnostic?.preview_original_found === true
    && previewSynthetic.diagnostic?.large_original_download === false
    && previewSynthetic.diagnostic?.download_reason === "gallery-preview"
    && previewSynthetic.diagnostic?.loaded_width > 0
    && previewSynthetic.diagnostic?.loaded_height > 0
    && previewSynthetic.diagnostic?.download_url?.attempted === true
    && previewSynthetic.diagnostic?.download_url?.set_ok === true
    && previewSynthetic.diagnostic?.download_url?.readback_matches === true
    && previewSynthetic.diagnostic?.drag_preview?.set_ok === true
    && previewSynthetic.diagnostic?.drag_preview?.width === 120
    && previewSynthetic.diagnostic?.transfer_types.some((type) => type.toLowerCase() === "downloadurl")
    && previewSynthetic.externalHandleCount === 0
    && finalState.nativeStarts >= 6
    && finalState.nativeEnds >= 6
    && finalState.diagnostics.filter((item) => item.trusted && item.dedicated_drag_source).length >= 1
    && finalState.diagnostics.filter((item) => item.trusted && item.dedicated_drag_source)
      .every((item) => item.effect_allowed_after === "copy"
        && item.files_type_after === false
        && item.uri_list?.attempted === false
        && item.plain_text?.attempted === false
        && item.drag_preview?.set_ok === true)
    && finalState.diagnostics.some((item) => item.trusted
      && !item.dedicated_drag_source
      && item.files_type_after === true
      && item.uri_list?.set_ok === true
      && item.plain_text?.set_ok === true)
    && finalState.drops.length >= 2
    && finalState.drops.some((types) => requiredTypes.every((type) => types.includes(type)))
    && finalState.drops.some((types) => types.includes("application/x-simpleai-gallery-original-url")
      && !types.includes("text/uri-list")
      && !types.includes("text/plain"))
    && finalState.clicks === 2
    && !finalState.pointerPreview
    && !finalState.nativePreview
    && finalState.externalHandleCount === 0
    && pageErrors.length === 0;

  console.log(JSON.stringify({ ok, synthetic, finalState, pageErrors }));
  if (!ok) process.exitCode = 1;
} finally {
  await browser.close();
}
