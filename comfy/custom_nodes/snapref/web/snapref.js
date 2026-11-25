// SnapRef (simple node) front end: a "reference card" panel in the node.
// - Up to eight picture slots in two columns, each with upload, removal and its own Strength.
// - The raw filename combos and the strength number widgets are hidden (they still hold and save the values).
// - Mode and Fidelity are drawn as a segmented switch and a slider in the same panel; adapter stays a normal widget.
// - Each mode has its own accent colour, card labels, Fidelity hint and prompt line. The Style button is dimmed for
//   an adapter that GET /snapref/adapters reports without a style branch (a saved Style value is kept, with a warning).
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE = "SnapRefSimple";
const PANEL_MIN = 380;   // smallest panel height (px); the panel grows with the node
const MAX_REFERENCES = 8;
const HIDDEN = ["reference", "reference_2", "strength", "strength_2", "mode", "fidelity", "upload", "image_upload"];
for (let i = 3; i <= MAX_REFERENCES; i++) HIDDEN.push(`reference_${i}`, `strength_${i}`);

async function uploadFile(file) {
  const body = new FormData();
  body.append("image", file);
  body.append("type", "input");
  const resp = await api.fetchApi("/upload/image", { method: "POST", body });
  if (resp.status !== 200) throw new Error(`SnapRef: upload failed (${resp.status})`);
  const data = await resp.json();
  return data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
}

// What a drop carries: a local image file, or an image dragged from ComfyUI itself (queue, assets panel,
// another node's preview), which arrives as a same-origin URL rather than a file. Synchronous: the DataTransfer
// is emptied once the event has been handled.
function transferSource(dt) {
  const file = Array.from(dt?.files || []).find((f) => f?.type?.startsWith("image/"));
  if (file) return { file };
  const uri = (dt?.getData?.("text/uri-list") || "").split(/\r?\n/).find((l) => l && !l.startsWith("#"));
  if (!uri) return null;
  let url;
  try { url = new URL(uri, location.href); } catch { return null; }
  return url.origin === location.origin ? { url } : null;
}

async function resolveImage(source) {
  if (!source) return null;
  if (source.file) return source.file;
  try {
    const resp = await fetch(source.url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    if (!blob.type.startsWith("image/")) return null;
    const name = source.url.searchParams.get("filename") || source.url.pathname.split("/").pop() || "image.png";
    return new File([blob], name, { type: blob.type });
  } catch { return null; }
}

// Slot (0-based) for a picture pasted or dropped on the node outside the cards: the first empty shown slot,
// else one more slot while there is room, else the first slot (the node's single upload target before).
function pickSlot(filled, shown, max) {
  const empty = filled.slice(0, shown).findIndex((f) => !f);
  if (empty >= 0) return { slot: empty, shown };
  if (shown < max) return { slot: shown, shown: shown + 1 };
  return { slot: 0, shown };
}

// What the panel says in each mode (accent colour, card labels, empty cards, prompt line, Fidelity hint).
// Takes the mode name or its key; anything else gets the Character & Style copy.
function modeCopy(mode) {
  const keep = "1 keeps every detail of the picture · lower follows your prompt more freely";
  const all = [
    { name: "Character & Style", key: "cs", accent: "#ff6b35", tag: "REFERENCE", empty1: "Character picture",
      emptyN: "optional · same character", prompt: "Write only the scene", fidelity: keep },
    { name: "Character", key: "char", accent: "#5b9cf5", tag: "REFERENCE", empty1: "Character picture",
      emptyN: "optional · same character", prompt: "Write the scene · add artist tags for the style", fidelity: keep },
    { name: "Style", key: "style", accent: "#a98bf5", tag: "STYLE", empty1: "Artwork in the style you want",
      emptyN: "optional · same artist", prompt: "Write the character and the scene",
      fidelity: "1 follows the picture's look closely · lower follows your prompt more freely" },
  ];
  const { name, ...copy } = all.find((c) => c.name === mode || c.key === mode) || all[0];
  return copy;
}

// Can this adapter run Style? true / false from GET /snapref/adapters ({adapters: {file: {modes, style}}});
// null when unknown (no answer, the file is not listed, or it could not be read): the button then stays usable
// and the node itself reports a problem when it runs.
function styleSupport(info, adapter) {
  if (!info || typeof info !== "object") return null;
  const table = info.adapters && typeof info.adapters === "object" ? info.adapters : info;
  const entry = Object.prototype.hasOwnProperty.call(table, adapter) ? table[adapter] : null;
  if (!entry || typeof entry !== "object" || entry.error || typeof entry.style !== "boolean") return null;
  return entry.style;
}

// The warning under the prompt line: only for Style on an adapter known to have no Style mode.
function modeNotice(mode, support) {
  return (mode === "Style" || mode === "style") && support === false
    ? "This adapter has no Style mode. Choose snapref_v2s_pre or another style adapter." : "";
}

// A click on a mode button: the dim Style button does nothing (a saved Style value is never changed here).
function pickMode(current, clicked, support) {
  return clicked === "Style" && support === false ? current : clicked;
}

function modeButton(mode, current, support) {
  const dis = mode === "Style" && support === false;
  return { on: mode === current, dis, title: dis ? "Style needs an adapter with a style branch (e.g. snapref_v2s_pre)" : "" };
}

async function fetchAdapterInfo() {
  try {
    const resp = await api.fetchApi("/snapref/adapters");
    return resp.ok ? await resp.json() : null;
  } catch { return null; }
}

function viewUrl(name) {
  if (!name || name === "none") return null;
  const parts = name.split("/");
  const filename = parts.pop();
  return api.apiURL(`/view?filename=${encodeURIComponent(filename)}&type=input&subfolder=${encodeURIComponent(parts.join("/"))}`);
}

function hideWidget(w) {
  if (!w) return;
  w.hidden = true;
  w.options = { ...(w.options || {}), hidden: true };
  w.computeSize = () => [0, -4];
  w.computeLayoutSize = () => ({ minHeight: 0, maxHeight: 0, minWidth: 0 });
  w.draw = () => {};
  w.drawWidget = () => {};
}

function css() {
  if (document.getElementById("snapref-css")) return;
  const s = document.createElement("style");
  s.id = "snapref-css";
  s.textContent = `
  .sr-panel { --sr-bg: #16171b; --sr-card: #1e2026; --sr-line: #2c2f37; --sr-text: #e8e9ec; --sr-dim: #8b909b;
    --sr-accent: #ff6b35; box-sizing: border-box; width: 100%; height: 100%; min-height: ${PANEL_MIN}px; overflow: hidden; padding: 10px; display: flex;
    flex-direction: column; gap: 10px; background: var(--sr-bg); border-radius: 12px; color: var(--sr-text);
    font: 500 12px/1.3 Inter, "Segoe UI", system-ui, sans-serif; user-select: none; }
  .sr-modebar { display: flex; gap: 8px; height: 38px; flex: 0 0 38px; }
  .sr-add { flex: 0 0 38px; width: 38px; height: 38px; padding: 0; border: 1px solid #4a4f5c; border-radius: 9px;
    background: var(--sr-card); color: var(--sr-text); font: 24px/1 system-ui; cursor: pointer; }
  .sr-add[hidden], .sr-card[hidden] { display: none; }
  .sr-add:disabled { opacity: .35; cursor: default; }
  .sr-seg { display: grid; flex: 1; min-width: 0; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); background: var(--sr-card);
    border: 1px solid var(--sr-line); border-radius: 9px; padding: 3px; gap: 3px; }
  .sr-seg button { border: 0; border-radius: 7px; padding: 7px 6px; background: transparent; color: var(--sr-dim);
    font: inherit; font-weight: 600; cursor: pointer; transition: background .15s, color .15s;
    min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sr-seg button:hover { color: var(--sr-text); }
  .sr-seg button.on { background: #2a2d35; color: var(--sr-text); box-shadow: inset 0 0 0 1px #3a3e48, inset 0 -2px 0 var(--sr-accent); }
  .sr-seg button.dis { opacity: .4; cursor: not-allowed; }
  .sr-seg button.dis:hover { color: var(--sr-dim); }
  .sr-seg button.on.dis { opacity: .6; }
  .sr-cards { display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: minmax(180px, 1fr); gap: 10px; flex: 1 1 auto; min-height: 0; }
  .sr-card { min-height: 0; }
  .sr-card { display: flex; flex-direction: column; gap: 8px; min-width: 0; min-height: 0; }
  .sr-pic { position: relative; flex: 1 1 auto; min-height: 150px; border-radius: 10px; overflow: hidden;
    background: var(--sr-card); border: 1px dashed var(--sr-line); cursor: pointer; display: grid; place-items: center;
    transition: border-color .15s, transform .15s; }
  .sr-pic:hover { border-color: #4a4f5c; }
  .sr-pic.drag { border-color: var(--sr-accent); border-style: solid; }
  .sr-pic.has { border-style: solid; }
  .sr-pic img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 22%; }
  .sr-empty { text-align: center; color: var(--sr-dim); padding: 10px; pointer-events: none; }
  .sr-empty .sr-plus { display: block; width: 28px; height: 28px; margin: 0 auto 6px; border-radius: 50%;
    border: 1.5px solid #4a4f5c; line-height: 25px; font-size: 18px; color: #c9ccd3; }
  .sr-empty b { display: block; color: #c9ccd3; font-weight: 600; margin-bottom: 2px; }
  .sr-label { position: absolute; left: 7px; bottom: 7px; padding: 3px 8px; border-radius: 6px; font-size: 10px;
    font-weight: 700; letter-spacing: .06em; background: rgba(12,13,16,.68); backdrop-filter: blur(6px); color: #fff; }
  .sr-label::before { content: ""; display: inline-block; width: 6px; height: 6px; margin-right: 5px; border-radius: 50%;
    background: var(--sr-accent); vertical-align: 1px; }
  .sr-x { position: absolute; right: 7px; top: 7px; width: 24px; height: 24px; border-radius: 7px; border: 0;
    background: rgba(12,13,16,.68); backdrop-filter: blur(6px); color: #e9eaee; font-size: 14px; line-height: 24px;
    cursor: pointer; opacity: 1; transition: background .15s; }
  .sr-pic.has:hover .sr-x { opacity: 1; }
  .sr-x:hover { background: var(--sr-accent); }
  .sr-slider { display: grid; grid-template-columns: auto 1fr 34px; align-items: center; gap: 8px; }
  .sr-slider label { color: var(--sr-dim); font-weight: 600; }
  .sr-slider output { text-align: right; font-variant-numeric: tabular-nums; color: var(--sr-text); font-weight: 600; }
  .sr-slider input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 4px;
    background: linear-gradient(90deg, var(--sr-accent) var(--p, 50%), #33363f var(--p, 50%)); outline: none; }
  .sr-slider input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
    background: #fff; border: 0; box-shadow: 0 1px 3px rgba(0,0,0,.5); cursor: pointer; }
  .sr-slider input[type=range]::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: #fff; border: 0; }
  .sr-card.off .sr-slider { opacity: .35; pointer-events: none; }
  .sr-foot { border-top: 1px solid var(--sr-line); padding-top: 10px; margin-top: auto; }
  .sr-hint { color: var(--sr-dim); font-size: 11px; font-weight: 500; margin-top: 4px; }
  .sr-prompt { color: #c9ccd3; font-size: 11px; font-weight: 500; margin-top: 8px; }
  .sr-prompt b { color: var(--sr-accent); font-weight: 700; margin-right: 6px; }
  .sr-warn { color: #ffb454; font-size: 11px; font-weight: 600; margin-top: 4px; }
  .sr-warn[hidden] { display: none; }
  `;
  document.head.appendChild(s);
}

function slider(label, min, max, step, get, set) {
  const el = document.createElement("div");
  el.className = "sr-slider";
  el.innerHTML = `<label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
  const r = el.querySelector("input");
  const o = el.querySelector("output");
  const paint = () => {
    o.textContent = Number(r.value).toFixed(2);
    r.style.setProperty("--p", `${((r.value - min) / (max - min)) * 100}%`);
  };
  r.addEventListener("input", () => { set(Number(r.value)); paint(); });
  r.addEventListener("pointerdown", (e) => e.stopPropagation());
  return { el, sync: () => { r.value = get(); paint(); } };
}

function picture(node, slot, w, remove, copy) {
  let uploadVersion = 0;
  const card = document.createElement("div");
  card.className = "sr-card";
  const pic = document.createElement("div");
  pic.className = "sr-pic";
  const label = document.createElement("div");
  label.className = "sr-label";
  const x = document.createElement("button");
  x.className = "sr-x";
  x.title = slot === 1 ? "replace" : "remove";
  x.textContent = slot === 1 ? "↻" : "×";
  x.setAttribute("aria-label", slot === 1 ? "Replace reference" : `Remove reference ${slot}`);
  pic.setAttribute("role", "button");
  pic.tabIndex = 0;
  pic.setAttribute("aria-label", `Choose reference ${slot}`);
  const file = document.createElement("input");
  file.type = "file";
  file.accept = "image/png,image/jpeg,image/webp";
  file.style.display = "none";
  const strength = slider("Strength", 0, 2, 0.05, () => w.strength?.value ?? 1, (v) => { w.strength.value = v; node.setDirtyCanvas(true, true); });
  strength.el.title = "Linear: 1 = as trained, 0 = off, 2 = twice. (SnapRef (Advanced) strength is log scale: 0 = as trained.)";

  const render = () => {
    const url = viewUrl(w.name?.value);
    const c = copy();
    label.textContent = slot === 1 ? c.tag : `${c.tag} ${slot}`;
    pic.querySelectorAll("img,.sr-empty").forEach((e) => e.remove());
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      img.draggable = false;
      pic.prepend(img);
    } else {
      const e = document.createElement("div");
      e.className = "sr-empty";
      const plus = document.createElement("span");
      plus.className = "sr-plus";
      plus.textContent = "+";
      const head = document.createElement("b");
      head.textContent = slot === 1 ? c.empty1 : `${c.tag === "STYLE" ? "Artwork" : "Reference"} ${slot}`;
      e.append(plus, head, slot === 1 ? "click or drop" : c.emptyN);
      pic.prepend(e);
    }
    pic.classList.toggle("has", !!url);
    card.classList.toggle("off", !url);
    strength.sync();
  };

  const setFile = async (f) => {
    if (!f || !f.type.startsWith("image/")) return;
    const version = ++uploadVersion;
    const name = await uploadFile(f);
    if (version !== uploadVersion) return;
    const values = w.name.options?.values;
    if (Array.isArray(values) && !values.includes(name)) values.push(name);
    w.name.value = name;
    w.name.callback?.(name);
    render();
    node.setDirtyCanvas(true, true);
  };

  pic.addEventListener("click", () => file.click());
  pic.addEventListener("keydown", (e) => { if (e.target === pic && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); file.click(); } });
  pic.addEventListener("pointerdown", (e) => e.stopPropagation());
  file.addEventListener("change", () => { setFile(file.files?.[0]); file.value = ""; });
  pic.addEventListener("dragover", (e) => { e.preventDefault(); e.stopPropagation(); pic.classList.add("drag"); });
  pic.addEventListener("dragleave", () => pic.classList.remove("drag"));
  pic.addEventListener("drop", async (e) => {
    e.preventDefault(); e.stopPropagation(); pic.classList.remove("drag");
    setFile(await resolveImage(transferSource(e.dataTransfer)));
  });
  x.addEventListener("click", (e) => {
    e.stopPropagation();
    if (slot === 1) { file.click(); return; }
    remove(slot);
  });
  pic.append(label, x, file);
  card.append(pic, strength.el);
  return { el: card, render, setFile, invalidateUpload: () => { uploadVersion++; } };
}

app.registerExtension({
  name: "SnapRef.SimpleNode",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE) return;
    css();
    const onCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onCreated?.apply(this, arguments);
      const node = this;
      const W = (n) => node.widgets?.find((w) => w.name === n);
      for (const w of node.widgets || []) {
        if (HIDDEN.includes(w.name) || (w.type === "button" && /upload/i.test(w.name || w.label || ""))) hideWidget(w);
      }
      const panel = document.createElement("div");
      panel.className = "sr-panel";

      const seg = document.createElement("div");
      seg.className = "sr-seg";
      const modeW = W("mode");
      const adapterW = W("adapter");
      let adapterInfo = null;   // GET /snapref/adapters; null = unknown
      const support = () => styleSupport(adapterInfo, adapterW?.value);
      const modes = modeW?.options?.values || ["Character & Style", "Character"];
      const segButtons = modes.map((m) => {
        const b = document.createElement("button");
        b.textContent = m;
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          const next = pickMode(modeW.value, m, support());
          if (next !== modeW.value) { modeW.value = next; modeW.callback?.(next); }
          syncPanel();
          node.setDirtyCanvas(true, true);
        });
        b.addEventListener("pointerdown", (e) => e.stopPropagation());
        seg.appendChild(b);
        return b;
      });

      const cards = document.createElement("div");
      cards.className = "sr-cards";
      node.properties ??= {};
      const refWidgets = Array.from({ length: MAX_REFERENCES }, (_, i) => ({
        name: W(i ? `reference_${i + 1}` : "reference"), strength: W(i ? `strength_${i + 1}` : "strength"),
      }));
      const remove = (slot) => {
        const count = node.properties.snapref_slots;
        pictures.slice(slot - 1).forEach(p => p.invalidateUpload());
        if (count > 2) {
          for (let i = slot - 1; i < count - 1; i++) {
            refWidgets[i].name.value = refWidgets[i + 1].name.value;
            refWidgets[i].strength.value = refWidgets[i + 1].strength.value;
          }
          node.properties.snapref_slots = count - 1;
        }
        refWidgets[count - 1].name.value = "none";
        refWidgets[count - 1].strength.value = 1;
        syncAll();
        node.setDirtyCanvas(true, true);
      };
      const pictures = refWidgets.map((w, i) => picture(node, i + 1, w, remove, () => modeCopy(modeW?.value)));
      node.snaprefCancelUploads = () => pictures.forEach(p => p.invalidateUpload());
      cards.append(...pictures.map(p => p.el));
      const add = document.createElement("button");
      add.className = "sr-add";
      add.textContent = "+";
      add.setAttribute("aria-label", "Add reference");
      add.addEventListener("pointerdown", e => e.stopPropagation());
      add.addEventListener("click", (e) => {
        e.stopPropagation();
        if (node.properties.snapref_slots >= MAX_REFERENCES) return;
        node.properties.snapref_slots++;
        syncAll();
        node.setDirtyCanvas(true, true);
      });
      const modebar = document.createElement("div");
      modebar.className = "sr-modebar";
      modebar.append(seg, add);

      const foot = document.createElement("div");
      foot.className = "sr-foot";
      const fidW = W("fidelity");
      const fid = slider("Fidelity", 0, 1, 0.05, () => fidW?.value ?? 1, (v) => { fidW.value = v; node.setDirtyCanvas(true, true); });
      const hint = document.createElement("div");
      hint.className = "sr-hint";
      const promptLine = document.createElement("div");
      promptLine.className = "sr-prompt";
      const promptTag = document.createElement("b");
      promptTag.textContent = "Prompt";
      const promptText = document.createElement("span");
      promptLine.append(promptTag, promptText);
      const warn = document.createElement("div");
      warn.className = "sr-warn";
      warn.setAttribute("role", "status");
      warn.hidden = true;
      foot.append(fid.el, hint, promptLine, warn);

      panel.append(modebar, cards, foot);
      let rows = 1;
      const minHeight = () => PANEL_MIN + (rows - 1) * 240;
      const dom = node.addDOMWidget("snapref_panel", "SNAPREF_PANEL", panel, {
        serialize: false, hideOnZoom: false, getMinHeight: minHeight,
      });
      // no maxHeight: the frontend gives the panel all the height the node has left, so resizing the node resizes it
      dom.computeLayoutSize = () => ({ minHeight: minHeight(), minWidth: 360 });

      const syncAll = (resize = true) => {
        segButtons.forEach((b) => b.classList.toggle("on", b.textContent === modeW?.value));
        const lastFilled = refWidgets.reduce((last, w, i) => viewUrl(w.name?.value) ? i + 1 : last, 0);
        const saved = Number(node.properties.snapref_slots);
        const count = Math.min(MAX_REFERENCES, Math.max(2, Number.isInteger(saved) ? saved : 2, lastFilled));
        node.properties.snapref_slots = count;
        pictures.forEach((p, i) => { p.el.hidden = i >= count; if (i < count) p.render(); });
        add.hidden = refWidgets.filter(w => viewUrl(w.name?.value)).length < 2;
        add.disabled = count >= MAX_REFERENCES;
        const nextRows = Math.ceil(count / 2);
        if (nextRows !== rows) {
          const delta = resize ? (nextRows - rows) * 240 : 0;
          rows = nextRows;
          panel.style.minHeight = `${minHeight()}px`;
          node.setSize([node.size[0], Math.max(node.computeSize()[1], node.size[1] + delta)]);
        }
        fid.sync();
      };
      // mode colour and copy, the Style button and the warning (the cards read the copy when they render)
      const syncMode = () => {
        const mode = modeW?.value;
        const copy = modeCopy(mode);
        const s = support();
        panel.style.setProperty("--sr-accent", copy.accent);
        panel.dataset.mode = copy.key;
        segButtons.forEach((b) => {
          const state = modeButton(b.textContent, mode, s);
          b.classList.toggle("dis", state.dis);
          b.setAttribute("aria-disabled", String(state.dis));
          b.setAttribute("aria-pressed", String(state.on));
          b.title = state.title;
        });
        hint.textContent = copy.fidelity;
        promptText.textContent = copy.prompt;
        warn.textContent = modeNotice(mode, s);
        warn.hidden = !warn.textContent;
      };
      const syncPanel = (resize = true) => { syncAll(resize); syncMode(); };
      node.snaprefSync = syncPanel;
      let infoVersion = 0;
      const refreshAdapterInfo = async () => {
        const version = ++infoVersion;
        const info = await fetchAdapterInfo();
        if (version !== infoVersion) return;   // a newer request answers for the current adapter
        adapterInfo = info;
        syncMode();
      };
      if (adapterW) {
        const cb = adapterW.callback;
        adapterW.callback = function () { const v = cb?.apply(this, arguments); syncMode(); refreshAdapterInfo(); return v; };
      }
      // The frontend sends pasted pictures and pictures dropped on the node (outside the cards) to the upload
      // widget of `reference`, so they always replaced the first picture. Send them to a free slot instead.
      const toFreeSlot = async (file) => {
        if (!file) return false;
        const shown = Number(node.properties.snapref_slots) || 2;
        const pick = pickSlot(refWidgets.map((w) => !!viewUrl(w.name?.value)), shown, MAX_REFERENCES);
        if (pick.shown !== shown) { node.properties.snapref_slots = pick.shown; syncAll(); }
        await pictures[pick.slot].setFile(file);
        return true;
      };
      const pasteFiles = node.pasteFiles;
      node.pasteFiles = function (files) {
        const file = Array.from(files || []).find((f) => f?.type?.startsWith("image/"));
        if (!file) return pasteFiles?.apply(this, arguments) ?? false;
        toFreeSlot(file);
        return true;
      };
      const onDragDrop = node.onDragDrop;
      node.onDragDrop = function (e) {
        const source = transferSource(e?.dataTransfer);
        if (!source) return onDragDrop?.apply(this, arguments) ?? false;
        return resolveImage(source).then(toFreeSlot);
      };
      for (const name of HIDDEN) {
        const w = W(name);
        if (!w) continue;
        const cb = w.callback;
        w.callback = function () { const v = cb?.apply(this, arguments); setTimeout(syncPanel, 0); return v; };
      }
      setTimeout(syncPanel, 0);
      refreshAdapterInfo();
      const want = node.computeSize();
      node.setSize([Math.max(want[0], 440), Math.max(want[1], 560)]);
      return r;
    };
    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      this.snaprefCancelUploads?.();
      const r = onConfigure?.apply(this, arguments);
      // Older workflows end with upload-widget values where the new reference inputs now sit.
      if (arguments[0]?.widgets_values?.length <= 9) {
        for (let i = 3; i <= MAX_REFERENCES; i++) {
          const name = this.widgets?.find(w => w.name === `reference_${i}`);
          const strength = this.widgets?.find(w => w.name === `strength_${i}`);
          if (name) name.value = "none";
          if (strength) strength.value = 1;
        }
      }
      this.snaprefSync?.(false);
      return r;
    };
    // the panel shows the pictures; skip the default image preview the upload widget would draw
    const onDraw = nodeType.prototype.onDrawBackground;
    nodeType.prototype.onDrawBackground = function () { this.imgs = undefined; return onDraw?.apply(this, arguments); };
  },
});
