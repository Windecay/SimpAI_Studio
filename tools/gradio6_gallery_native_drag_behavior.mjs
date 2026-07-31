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
const originalImagePath = "C:/outputs/small-original.png";
const originalImageUrl = `http://simpai.test/gradio_api/file=${originalImagePath}`;

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
          <div class="gallery-item"><img id="gallery_image" src="${originalImageUrl}"></div>
          <div id="preview_gallery_item" class="gallery-item"><img id="preview_gallery_image" src="${previewImageUrl}"></div>
          <div class="gallery-item" style="display:none"><img id="data_gallery_image" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAFElEQVR4nO3BMQEAAADCoPVPbQ0PoAAAAAAAAAB4GgABAAHn7QAAAABJRU5ErkJggg=="></div>
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
      if (!["gallery_image", "preview_gallery_image", "data_gallery_image"].includes(event.target?.id)) return;
      window.__nativeDragBehavior.nativeStarts += 1;
    }, true);
    document.addEventListener("dragend", (event) => {
      if (["gallery_image", "preview_gallery_image", "data_gallery_image"].includes(event.target?.id)) window.__nativeDragBehavior.nativeEnds += 1;
    }, true);
  });
  await page.addScriptTag({ content: source });
  await page.waitForFunction(() => ["gallery_image", "preview_gallery_image", "data_gallery_image"].every((id) => {
    const img = document.getElementById(id);
    return img?.complete && img.naturalWidth > 0 && img.getAttribute("draggable") === "true";
  }));
  await page.evaluate(() => {
    document.getElementById("gallery_image").addEventListener("dragstart", (event) => {
      window.__nativeDragBehavior.nativeTypes = Array.from(event.dataTransfer?.types || []);
    });
  });

  const synthetic = await page.evaluate(() => {
    function dragSnapshot(id) {
      const img = document.getElementById(id);
      const transfer = new DataTransfer();
      const event = new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer });
      img.dispatchEvent(event);
      const result = {
        prevented: event.defaultPrevented,
        draggable: img.draggable,
        attr: img.getAttribute("draggable"),
        marked: img.dataset.simpleaiGalleryNativeDragImage === "1",
        types: Array.from(transfer.types || []),
        custom: transfer.getData("application/x-simpleai-gallery-original-url"),
        uri: transfer.getData("text/uri-list"),
        plain: transfer.getData("text/plain"),
        downloadUrl: transfer.getData("DownloadURL"),
        externalHandleCount: document.querySelectorAll(".simpleai-gallery-external-drag-handle").length,
        diagnostic: window.__nativeDragBehavior.diagnostics.at(-1) || null,
      };
      img.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: transfer }));
      return result;
    }
    const originalImage = document.getElementById("gallery_image");
    Object.defineProperty(originalImage, "naturalWidth", { configurable: true, value: 1168 });
    Object.defineProperty(originalImage, "naturalHeight", { configurable: true, value: 1704 });
    const original = dragSnapshot("gallery_image");
    Object.defineProperty(originalImage, "naturalWidth", { configurable: true, value: 3552 });
    Object.defineProperty(originalImage, "naturalHeight", { configurable: true, value: 4736 });
    const dataImage = document.getElementById("data_gallery_image");
    Object.defineProperty(dataImage, "naturalWidth", { configurable: true, value: 3552 });
    Object.defineProperty(dataImage, "naturalHeight", { configurable: true, value: 4736 });
    return {
      original,
      largeOriginal: dragSnapshot("gallery_image"),
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
    externalHandleCount: document.querySelectorAll(".simpleai-gallery-external-drag-handle").length,
  }));
  const requiredTypes = [
    "application/x-simpleai-gallery-original-url",
    "text/uri-list",
    "text/plain",
  ];
  const originalSynthetic = synthetic.original;
  const largeOriginalSynthetic = synthetic.largeOriginal;
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
    && requiredTypes.every((type) => largeOriginalSynthetic.types.includes(type))
    && largeOriginalSynthetic.custom === originalImageUrl
    && largeOriginalSynthetic.uri === originalImageUrl
    && largeOriginalSynthetic.plain === originalImageUrl
    && largeOriginalSynthetic.downloadUrl === `image/png:small-original.png:${originalImageUrl}`
    && largeOriginalSynthetic.diagnostic?.display_source_kind === "gradio-file"
    && largeOriginalSynthetic.diagnostic?.preview_original_found === false
    && largeOriginalSynthetic.diagnostic?.loaded_width === 3552
    && largeOriginalSynthetic.diagnostic?.loaded_height === 4736
    && largeOriginalSynthetic.diagnostic?.large_original_download === true
    && largeOriginalSynthetic.diagnostic?.download_reason === "large-original"
    && largeOriginalSynthetic.diagnostic?.download_url?.attempted === true
    && largeOriginalSynthetic.diagnostic?.download_url?.set_ok === true
    && largeOriginalSynthetic.diagnostic?.download_url?.readback_matches === true
    && largeOriginalSynthetic.diagnostic?.transfer_types.some((type) => type.toLowerCase() === "downloadurl")
    && largeOriginalSynthetic.externalHandleCount === 0
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
    && requiredTypes.every((type) => previewSynthetic.types.includes(type))
    && previewSynthetic.custom === expectedPreviewOriginalUrl
    && previewSynthetic.uri === expectedPreviewOriginalUrl
    && previewSynthetic.plain === expectedPreviewOriginalUrl
    && previewSynthetic.downloadUrl === `image/png:portrait-original.png:${expectedPreviewOriginalUrl}`
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
    && previewSynthetic.diagnostic?.transfer_types.some((type) => type.toLowerCase() === "downloadurl")
    && previewSynthetic.externalHandleCount === 0
    && finalState.nativeStarts >= 6
    && finalState.nativeEnds >= 6
    && requiredTypes.every((type) => finalState.nativeTypes.includes(type))
    && finalState.drops.length >= 2
    && finalState.drops.every((types) => requiredTypes.every((type) => types.includes(type)))
    && finalState.clicks === 2
    && !finalState.pointerPreview
    && finalState.externalHandleCount === 0
    && pageErrors.length === 0;

  console.log(JSON.stringify({ ok, synthetic, finalState, pageErrors }));
  if (!ok) process.exitCode = 1;
} finally {
  await browser.close();
}
