import { createModuleLogger } from "./utils/LoggerUtils.js?v=patch26";
import { createCanvas } from "./utils/CommonUtils.js?v=patch26";

const log = createModuleLogger('OpenPoseEditor');

const CONNECT_KEYPOINTS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [1, 5], [5, 6], [6, 7], [1, 8],
    [8, 9], [9, 10], [1, 11], [11, 12],
    [12, 13], [14, 0], [14, 16], [15, 0],
    [15, 17]
];

const CONNECT_COLOR = [
    [0, 0, 255], [255, 0, 0], [255, 170, 0], [255, 255, 0],
    [255, 85, 0], [170, 255, 0], [85, 255, 0], [0, 255, 0],
    [0, 255, 85], [0, 255, 170], [0, 255, 255], [0, 170, 255],
    [0, 85, 255], [85, 0, 255], [170, 0, 255], [255, 0, 255],
    [255, 0, 170], [255, 0, 85]
];

function rgb(color) {
    return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

function rgbScaled(color, scale = 1) {
    const s = Number(scale);
    const k = Number.isFinite(s) ? s : 1;
    const r = clamp(Math.round((Number(color?.[0]) || 0) * k), 0, 255);
    const g = clamp(Math.round((Number(color?.[1]) || 0) * k), 0, 255);
    const b = clamp(Math.round((Number(color?.[2]) || 0) * k), 0, 255);
    return `rgb(${r}, ${g}, ${b})`;
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function parseKeypointsFlat(kpFlat) {
    const kp = Array.isArray(kpFlat) ? kpFlat : [];
    const keypoints = [];
    for (let i = 0; i < 18; i++) {
        const base = i * 3;
        const x = Number(kp[base] ?? 0);
        const y = Number(kp[base + 1] ?? 0);
        const c = Number(kp[base + 2] ?? 0);
        keypoints.push({ x, y, c });
    }
    return keypoints;
}

function parseKeypointsFlatAny(kpFlat) {
    const kp = Array.isArray(kpFlat) ? kpFlat : [];
    const count = Math.max(0, Math.floor(kp.length / 3));
    const keypoints = [];
    for (let i = 0; i < count; i++) {
        const base = i * 3;
        const x = Number(kp[base] ?? 0);
        const y = Number(kp[base + 1] ?? 0);
        const c = Number(kp[base + 2] ?? 0);
        keypoints.push({ x, y, c });
    }
    return keypoints;
}

const HAND_EDGES = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12],
    [0, 13], [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20]
];

function drawFace(ctx, keypoints, options = {}) {
    const { radius = 2, opacity = 0.8 } = options;
    if (!Array.isArray(keypoints) || keypoints.length === 0)
        return;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = '#fff';
    for (const p of keypoints) {
        if (!p || (p.c ?? 0) <= 0)
            continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawHand(ctx, keypoints, options = {}) {
    const { pointRadius = 2, lineWidth = 2, opacity = 0.9 } = options;
    if (!Array.isArray(keypoints) || keypoints.length < 21)
        return;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < HAND_EDGES.length; i++) {
        const [aIdx, bIdx] = HAND_EDGES[i];
        const a = keypoints[aIdx];
        const b = keypoints[bIdx];
        if (!a || !b)
            continue;
        if ((a.c ?? 0) <= 0 || (b.c ?? 0) <= 0)
            continue;
        const hue = Math.round((i / HAND_EDGES.length) * 360);
        ctx.strokeStyle = `hsl(${hue}, 100%, 55%)`;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    }
    ctx.fillStyle = '#ff0000';
    for (const p of keypoints) {
        if (!p || (p.c ?? 0) <= 0)
            continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pointRadius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawWristHandLinks(ctx, bodyKeypoints, hands, options = {}) {
    const { lineWidth = 2, opacity = 0.8, color = 'rgba(255,255,255,0.9)' } = options;
    if (!Array.isArray(bodyKeypoints) || bodyKeypoints.length < 8)
        return;
    if (!Array.isArray(hands) || hands.length === 0)
        return;
    const wrists = [];
    const rightWrist = bodyKeypoints[4];
    const leftWrist = bodyKeypoints[7];
    if (rightWrist && (rightWrist.c ?? 0) > 0)
        wrists.push({ kind: 'right', p: rightWrist });
    if (leftWrist && (leftWrist.c ?? 0) > 0)
        wrists.push({ kind: 'left', p: leftWrist });
    if (wrists.length === 0)
        return;
    const roots = hands.map((h) => {
        const root = Array.isArray(h) ? h[0] : null;
        if (!root || (root.c ?? 0) <= 0)
            return null;
        return { root, hand: h };
    }).filter(Boolean);
    if (roots.length === 0)
        return;
    const candidates = roots.map((r) => {
        let best = null;
        let bestD = Infinity;
        for (const w of wrists) {
            const dx = r.root.x - w.p.x;
            const dy = r.root.y - w.p.y;
            const d = dx * dx + dy * dy;
            if (d < bestD) {
                bestD = d;
                best = w;
            }
        }
        return { r, best, bestD };
    });
    const links = [];
    if (wrists.length >= 2 && roots.length >= 2) {
        const a = roots[0];
        const b = roots[1];
        const w0 = wrists[0];
        const w1 = wrists[1];
        const d00 = (a.root.x - w0.p.x) ** 2 + (a.root.y - w0.p.y) ** 2;
        const d01 = (a.root.x - w1.p.x) ** 2 + (a.root.y - w1.p.y) ** 2;
        const d10 = (b.root.x - w0.p.x) ** 2 + (b.root.y - w0.p.y) ** 2;
        const d11 = (b.root.x - w1.p.x) ** 2 + (b.root.y - w1.p.y) ** 2;
        if (d00 + d11 <= d01 + d10) {
            links.push({ w: w0.p, h: a.root }, { w: w1.p, h: b.root });
        }
        else {
            links.push({ w: w1.p, h: a.root }, { w: w0.p, h: b.root });
        }
    }
    else {
        for (const c of candidates) {
            if (!c.best)
                continue;
            links.push({ w: c.best.p, h: c.r.root });
        }
    }
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    for (const l of links) {
        ctx.beginPath();
        ctx.moveTo(l.w.x, l.w.y);
        ctx.lineTo(l.h.x, l.h.y);
        ctx.stroke();
    }
    ctx.restore();
}

function parsePoseJson(poseJson) {
    const data = typeof poseJson === 'string' ? JSON.parse(poseJson) : poseJson;
    const width = Math.max(1, Math.floor(data?.width ?? 1));
    const height = Math.max(1, Math.floor(data?.height ?? 1));
    const people = Array.isArray(data?.people) ? data.people : [];
    const peopleKeypoints = people.map((p) => parseKeypointsFlat(p?.pose_keypoints_2d));
    if (peopleKeypoints.length === 0) {
        peopleKeypoints.push(parseKeypointsFlat([]));
    }
    return { width, height, peopleCount: peopleKeypoints.length, peopleKeypoints, raw: data };
}

function serializePoseJson(width, height, peopleKeypoints, raw) {
    const out = raw && typeof raw === 'object' ? JSON.parse(JSON.stringify(raw)) : {};
    out.width = width;
    out.height = height;
    if (!Array.isArray(out.people)) {
        out.people = [];
    }
    const count = Array.isArray(peopleKeypoints) && peopleKeypoints.length > 0 ? peopleKeypoints.length : 1;
    while (out.people.length < count) {
        out.people.push({ pose_keypoints_2d: [] });
    }
    for (let personIndex = 0; personIndex < count; personIndex++) {
        const person = out.people[personIndex];
        if (!person || typeof person !== 'object') {
            out.people[personIndex] = { pose_keypoints_2d: [] };
        }
        const kp = peopleKeypoints?.[personIndex] || [];
        const flat = [];
        for (let i = 0; i < 18; i++) {
            const p = kp[i] || { x: 0, y: 0, c: 0 };
            flat.push(Number(p.x) || 0, Number(p.y) || 0, Number(p.c) || 0);
        }
        out.people[personIndex].pose_keypoints_2d = flat;
    }
    return JSON.stringify(out, null, 2);
}

function drawSkeleton(ctx, keypoints, options = {}) {
    const {
        drawKeypoints = true,
        drawConnections = true,
        keypointRadius = 4,
        stickWidth = 3,
        opacity = 0.85,
        connectionStyle = 'stroke'
    } = options;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (drawConnections) {
        CONNECT_KEYPOINTS.forEach((pair, idx) => {
            const a = keypoints[pair[0]];
            const b = keypoints[pair[1]];
            if (!a || !b)
                return;
            if ((a.c ?? 0) <= 0 || (b.c ?? 0) <= 0)
                return;
            const c = CONNECT_COLOR[idx] || [255, 255, 255];
            if (connectionStyle === 'ellipse') {
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                if (!Number.isFinite(length) || length <= 0.001) {
                    return;
                }
                const angle = Math.atan2(dy, dx);
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;
                ctx.save();
                ctx.fillStyle = rgbScaled(c, 0.6);
                ctx.translate(mx, my);
                ctx.rotate(angle);
                ctx.beginPath();
                ctx.ellipse(0, 0, length / 2, stickWidth, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            else {
                ctx.strokeStyle = rgb(c);
                ctx.lineWidth = stickWidth;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }
        });
    }

    if (drawKeypoints) {
        for (let i = 0; i < keypoints.length; i++) {
            const p = keypoints[i];
            if (!p)
                continue;
            if ((p.c ?? 0) <= 0)
                continue;
            const c = CONNECT_COLOR[i] || [255, 255, 255];
            ctx.fillStyle = rgb(c);
            ctx.beginPath();
            ctx.arc(p.x, p.y, keypointRadius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.restore();
}

export class OpenPoseEditor {
    constructor() {
        this.overlay = null;
        this.container = null;
        this.canvas = null;
        this.ctx = null;
        this.bgImage = null;
        this.peopleKeypoints = [];
        this.keypoints = [];
        this.poseRaw = null;
        this.width = 1;
        this.height = 1;
        this.scale = 1;
        this.baseScale = 1;
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.isPanning = false;
        this.panPointerId = null;
        this.panStartClient = null;
        this.panStartOffset = null;
        this.activePersonIndex = 0;
        this.personSelectEl = null;
        this.activeIndex = null;
        this.selectedIndex = null;
        this.activePointerId = null;
        this.isDragging = false;
        this.hasDragged = false;
        this.historyPushedInDrag = false;
        this.resolvePromise = null;
        this.showBackground = true;
        this.backgroundOpacity = 0.25;
        this.keypointRadius = 6;
        this.stickWidth = 4;
        this.renderAllPeople = false;
        this.boldSkeleton = true;
        this.selectedPart = null;
        this.partDrag = null;
        this.undoHistory = [];
        this.redoHistory = [];
        this.keydownHandler = null;
        this.resizeHandler = null;
    }

    createUI() {
        if (this.overlay)
            return;

        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.left = '0';
        overlay.style.top = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
        overlay.style.background = 'rgba(0,0,0,0.72)';
        overlay.style.zIndex = '100000';
        overlay.style.display = 'none';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.flexDirection = 'column';
        overlay.style.gap = '10px';

        const toolbar = document.createElement('div');
        toolbar.style.display = 'flex';
        toolbar.style.gap = '8px';
        toolbar.style.alignItems = 'center';
        toolbar.style.justifyContent = 'space-between';
        toolbar.style.width = 'min(1400px, 98vw)';
        toolbar.style.padding = '10px 12px';
        toolbar.style.background = 'rgba(30,30,30,0.92)';
        toolbar.style.border = '1px solid rgba(255,255,255,0.12)';
        toolbar.style.borderRadius = '10px';

        const leftGroup = document.createElement('div');
        leftGroup.style.display = 'flex';
        leftGroup.style.gap = '10px';
        leftGroup.style.alignItems = 'center';

        const title = document.createElement('div');
        title.textContent = '骨骼编辑';
        title.style.fontSize = '14px';
        title.style.fontWeight = '600';
        title.style.color = '#fff';

        const personLabel = document.createElement('label');
        personLabel.style.display = 'flex';
        personLabel.style.alignItems = 'center';
        personLabel.style.gap = '6px';
        personLabel.style.userSelect = 'none';
        personLabel.style.color = '#ddd';
        personLabel.style.fontSize = '12px';
        const personText = document.createElement('span');
        personText.textContent = '人物';
        const personSelect = document.createElement('select');
        personSelect.style.background = 'rgba(60,60,60,0.9)';
        personSelect.style.border = '1px solid rgba(255,255,255,0.14)';
        personSelect.style.borderRadius = '8px';
        personSelect.style.color = '#fff';
        personSelect.style.padding = '4px 8px';
        personSelect.style.cursor = 'pointer';
        personSelect.onchange = () => {
            const idx = Number(personSelect.value || 0);
            this.setActivePerson(idx);
        };
        personLabel.append(personText, personSelect);

        const fillBtn = document.createElement('button');
        fillBtn.textContent = '补全';
        fillBtn.style.padding = '6px 10px';
        fillBtn.style.borderRadius = '8px';
        fillBtn.style.border = '1px solid rgba(255,255,255,0.14)';
        fillBtn.style.background = 'rgba(60,60,60,0.9)';
        fillBtn.style.color = '#fff';
        fillBtn.style.cursor = 'pointer';
        fillBtn.onclick = () => {
            this.fillMissingKeypoints();
            this.redraw();
            this.pushHistory();
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '删点';
        deleteBtn.style.padding = '6px 10px';
        deleteBtn.style.borderRadius = '8px';
        deleteBtn.style.border = '1px solid rgba(255,255,255,0.14)';
        deleteBtn.style.background = 'rgba(60,60,60,0.9)';
        deleteBtn.style.color = '#fff';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.onclick = () => {
            this.deleteSelectedPoint();
        };

        const undoBtn = document.createElement('button');
        undoBtn.textContent = '撤销';
        undoBtn.style.padding = '6px 10px';
        undoBtn.style.borderRadius = '8px';
        undoBtn.style.border = '1px solid rgba(255,255,255,0.14)';
        undoBtn.style.background = 'rgba(60,60,60,0.9)';
        undoBtn.style.color = '#fff';
        undoBtn.style.cursor = 'pointer';
        undoBtn.onclick = () => this.undo();

        const redoBtn = document.createElement('button');
        redoBtn.textContent = '重做';
        redoBtn.style.padding = '6px 10px';
        redoBtn.style.borderRadius = '8px';
        redoBtn.style.border = '1px solid rgba(255,255,255,0.14)';
        redoBtn.style.background = 'rgba(60,60,60,0.9)';
        redoBtn.style.color = '#fff';
        redoBtn.style.cursor = 'pointer';
        redoBtn.onclick = () => this.redo();

        const bgToggleLabel = document.createElement('label');
        bgToggleLabel.style.display = 'flex';
        bgToggleLabel.style.alignItems = 'center';
        bgToggleLabel.style.gap = '6px';
        bgToggleLabel.style.userSelect = 'none';
        bgToggleLabel.style.color = '#ddd';
        bgToggleLabel.style.fontSize = '12px';
        const bgToggle = document.createElement('input');
        bgToggle.type = 'checkbox';
        bgToggle.checked = true;
        bgToggle.onchange = () => {
            this.showBackground = bgToggle.checked;
            this.redraw();
        };
        bgToggleLabel.append(bgToggle, document.createTextNode('显示底图'));

        const boldToggleLabel = document.createElement('label');
        boldToggleLabel.style.display = 'flex';
        boldToggleLabel.style.alignItems = 'center';
        boldToggleLabel.style.gap = '6px';
        boldToggleLabel.style.userSelect = 'none';
        boldToggleLabel.style.color = '#ddd';
        boldToggleLabel.style.fontSize = '12px';
        const boldToggle = document.createElement('input');
        boldToggle.type = 'checkbox';
        boldToggle.checked = true;
        boldToggle.onchange = () => {
            this.boldSkeleton = boldToggle.checked;
            this.redraw();
        };
        boldToggleLabel.append(boldToggle, document.createTextNode('加粗骨骼'));

        const hint = document.createElement('div');
        hint.textContent = '滚轮缩放，中键拖动平移，拖动关节点调整姿势';
        hint.style.color = '#bbb';
        hint.style.fontSize = '12px';

        leftGroup.append(title, personLabel, fillBtn, deleteBtn, undoBtn, redoBtn, bgToggleLabel, boldToggleLabel, hint);

        const rightGroup = document.createElement('div');
        rightGroup.style.display = 'flex';
        rightGroup.style.gap = '8px';
        rightGroup.style.alignItems = 'center';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.padding = '6px 12px';
        cancelBtn.style.borderRadius = '8px';
        cancelBtn.style.border = '1px solid rgba(255,255,255,0.14)';
        cancelBtn.style.background = 'rgba(60,60,60,0.9)';
        cancelBtn.style.color = '#fff';
        cancelBtn.style.cursor = 'pointer';
        cancelBtn.onclick = () => this.close(null, true);

        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = '确认';
        confirmBtn.style.padding = '6px 12px';
        confirmBtn.style.borderRadius = '8px';
        confirmBtn.style.border = '1px solid rgba(0,122,204,0.5)';
        confirmBtn.style.background = 'rgba(0,122,204,0.9)';
        confirmBtn.style.color = '#fff';
        confirmBtn.style.cursor = 'pointer';
        confirmBtn.onclick = () => this.confirm();

        rightGroup.append(cancelBtn, confirmBtn);

        const applyToolbarLayout = () => {
            const isNarrow = (window?.innerWidth || 0) <= 520;
            toolbar.style.flexWrap = isNarrow ? 'wrap' : 'nowrap';
            toolbar.style.justifyContent = isNarrow ? 'flex-start' : 'space-between';
            leftGroup.style.flexWrap = isNarrow ? 'wrap' : 'nowrap';
            leftGroup.style.maxWidth = '100%';
            leftGroup.style.columnGap = isNarrow ? '8px' : '10px';
            leftGroup.style.rowGap = isNarrow ? '6px' : '0px';
            rightGroup.style.width = isNarrow ? '100%' : 'auto';
            rightGroup.style.justifyContent = isNarrow ? 'flex-end' : 'flex-end';
            rightGroup.style.marginLeft = isNarrow ? '0' : 'auto';
            hint.style.display = isNarrow ? 'none' : 'block';
            const smallBtnPadding = '4px 8px';
            const smallBtnPaddingWide = '4px 10px';
            const smallFont = '12px';
            const normalBtnPadding = '6px 10px';
            const normalBtnPaddingWide = '6px 12px';
            const normalFont = '';
            const setBtn = (btn, isWide) => {
                if (!btn)
                    return;
                btn.style.padding = isNarrow ? (isWide ? smallBtnPaddingWide : smallBtnPadding) : (isWide ? normalBtnPaddingWide : normalBtnPadding);
                btn.style.fontSize = isNarrow ? smallFont : normalFont;
            };
            setBtn(fillBtn, false);
            setBtn(deleteBtn, false);
            setBtn(undoBtn, false);
            setBtn(redoBtn, false);
            setBtn(cancelBtn, true);
            setBtn(confirmBtn, true);
        };
        applyToolbarLayout();

        toolbar.append(leftGroup, rightGroup);

        const container = document.createElement('div');
        container.style.width = 'min(1400px, 98vw)';
        container.style.height = 'min(88vh, 960px)';
        container.style.background = 'rgba(20,20,20,0.92)';
        container.style.border = '1px solid rgba(255,255,255,0.12)';
        container.style.borderRadius = '10px';
        container.style.position = 'relative';
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.style.overflow = 'hidden';

        const { canvas, ctx } = createCanvas(1, 1, '2d', { willReadFrequently: true });
        canvas.style.touchAction = 'none';
        canvas.style.userSelect = 'none';
        canvas.style.maxWidth = 'none';
        canvas.style.maxHeight = 'none';
        canvas.style.cursor = 'grab';
        canvas.style.transformOrigin = '0 0';

        canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
        canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
        canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));
        canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

        container.appendChild(canvas);

        overlay.append(toolbar, container);
        document.body.appendChild(overlay);

        this.overlay = overlay;
        this.container = container;
        this.canvas = canvas;
        this.ctx = ctx;
        this.personSelectEl = personSelect;
        this.applyToolbarLayout = applyToolbarLayout;
    }

    async open({ backgroundImageSrc, poseJson }) {
        this.createUI();

        const { width, height, peopleKeypoints, raw } = parsePoseJson(poseJson);
        this.width = width;
        this.height = height;
        this.peopleKeypoints = (peopleKeypoints || []).map((kp) => kp.map((p) => ({ ...p })));
        if (this.peopleKeypoints.length === 0) {
            this.peopleKeypoints = [parseKeypointsFlat([])];
        }
        this.setActivePerson(0);
        this.poseRaw = raw;
        this.refreshPeopleSelect();
        this.undoHistory = [this.snapshotState()];
        this.redoHistory = [];
        this.selectedIndex = null;
        this.selectedPart = null;
        this.partDrag = null;
        this.isPanning = false;
        this.panPointerId = null;
        this.panStartClient = null;
        this.panStartOffset = null;
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;

        const bg = new Image();
        bg.crossOrigin = 'anonymous';
        bg.src = backgroundImageSrc;
        await bg.decode();
        this.bgImage = bg;

        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.overlay.style.display = 'flex';
        this.layoutCanvas();
        this.redraw();
        requestAnimationFrame(() => {
            this.layoutCanvas();
            this.redraw();
        });
        this.keydownHandler = (e) => this.onKeyDown(e);
        document.addEventListener('keydown', this.keydownHandler, { capture: true });
        this.resizeHandler = () => {
            if (!this.overlay || this.overlay.style.display === 'none') {
                return;
            }
            if (typeof this.applyToolbarLayout === 'function') {
                this.applyToolbarLayout();
            }
            this.layoutCanvas();
            this.redraw();
        };
        window.addEventListener('resize', this.resizeHandler, { passive: true });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', this.resizeHandler, { passive: true });
        }

        return new Promise((resolve) => {
            this.resolvePromise = resolve;
        });
    }

    refreshPeopleSelect() {
        const select = this.personSelectEl;
        if (!select)
            return;
        select.innerHTML = '';
        const count = this.peopleKeypoints.length || 1;
        for (let i = 0; i < count; i++) {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = `人物 ${i + 1}`;
            select.appendChild(opt);
        }
        select.disabled = count <= 1;
        select.value = String(clamp(this.activePersonIndex, 0, count - 1));
    }

    setActivePerson(index) {
        const count = this.peopleKeypoints.length || 1;
        const idx = clamp(Number(index) || 0, 0, count - 1);
        this.activePersonIndex = idx;
        this.keypoints = this.peopleKeypoints[idx];
        this.selectedPart = null;
        this.partDrag = null;
        if (this.personSelectEl) {
            this.personSelectEl.value = String(idx);
        }
        this.redraw();
    }

    close(result, cancelled = false) {
        if (this.overlay) {
            this.overlay.style.display = 'none';
        }
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler, { capture: true });
            this.keydownHandler = null;
        }
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', this.resizeHandler);
            }
            this.resizeHandler = null;
        }
        const resolve = this.resolvePromise;
        this.resolvePromise = null;
        this.activeIndex = null;
        this.selectedIndex = null;
        this.selectedPart = null;
        this.activePointerId = null;
        this.isDragging = false;
        this.partDrag = null;
        this.isPanning = false;
        this.panPointerId = null;
        this.panStartClient = null;
        this.panStartOffset = null;
        if (this.canvas) {
            this.canvas.style.cursor = 'grab';
        }
        if (cancelled) {
            resolve?.(null);
        }
        else {
            resolve?.(result);
        }
    }

    confirm() {
        try {
            const poseJson = serializePoseJson(this.width, this.height, this.peopleKeypoints, this.poseRaw);
            const skeletonDataUrl = this.renderSkeletonToDataUrl();
            this.close({ poseJson, skeletonDataUrl }, false);
        }
        catch (e) {
            log.error('Confirm failed', e);
            this.close(null, true);
        }
    }

    snapshotExtras() {
        const people = Array.isArray(this.poseRaw?.people) ? this.poseRaw.people : [];
        return people.map((p) => {
            const person = p && typeof p === 'object' ? p : {};
            const face = Array.isArray(person.face_keypoints_2d) ? person.face_keypoints_2d.slice() : null;
            const left = Array.isArray(person.hand_left_keypoints_2d) ? person.hand_left_keypoints_2d.slice() : null;
            const right = Array.isArray(person.hand_right_keypoints_2d) ? person.hand_right_keypoints_2d.slice() : null;
            return { face_keypoints_2d: face, hand_left_keypoints_2d: left, hand_right_keypoints_2d: right };
        });
    }

    snapshotState() {
        return JSON.stringify({
            peopleKeypoints: this.peopleKeypoints || [],
            extras: this.snapshotExtras()
        });
    }

    applyState(stateJson) {
        let state;
        try {
            state = JSON.parse(stateJson);
        }
        catch {
            state = [];
        }
        const next = Array.isArray(state) ? state : (Array.isArray(state?.peopleKeypoints) ? state.peopleKeypoints : []);
        this.peopleKeypoints = next.map((kp) => Array.isArray(kp) ? kp.map((p) => ({ x: Number(p?.x) || 0, y: Number(p?.y) || 0, c: Number(p?.c) || 0 })) : parseKeypointsFlat([]));
        if (this.peopleKeypoints.length === 0) {
            this.peopleKeypoints = [parseKeypointsFlat([])];
        }
        const extras = Array.isArray(state?.extras) ? state.extras : null;
        if (extras && Array.isArray(this.poseRaw?.people)) {
            for (let i = 0; i < this.poseRaw.people.length && i < extras.length; i++) {
                const p = this.poseRaw.people[i];
                const ex = extras[i];
                if (!p || typeof p !== 'object' || !ex || typeof ex !== 'object')
                    continue;
                if (Array.isArray(ex.face_keypoints_2d) || ex.face_keypoints_2d === null) {
                    p.face_keypoints_2d = Array.isArray(ex.face_keypoints_2d) ? ex.face_keypoints_2d.slice() : [];
                }
                if (Array.isArray(ex.hand_left_keypoints_2d) || ex.hand_left_keypoints_2d === null) {
                    p.hand_left_keypoints_2d = Array.isArray(ex.hand_left_keypoints_2d) ? ex.hand_left_keypoints_2d.slice() : [];
                }
                if (Array.isArray(ex.hand_right_keypoints_2d) || ex.hand_right_keypoints_2d === null) {
                    p.hand_right_keypoints_2d = Array.isArray(ex.hand_right_keypoints_2d) ? ex.hand_right_keypoints_2d.slice() : [];
                }
            }
        }
        const idx = clamp(this.activePersonIndex, 0, this.peopleKeypoints.length - 1);
        this.setActivePerson(idx);
        this.refreshPeopleSelect();
        this.selectedIndex = null;
        this.selectedPart = null;
        this.redraw();
    }

    pushHistory() {
        const snapshot = this.snapshotState();
        if (this.undoHistory.length > 0 && this.undoHistory[this.undoHistory.length - 1] === snapshot) {
            return;
        }
        this.undoHistory.push(snapshot);
        this.redoHistory = [];
    }

    undo() {
        if (this.undoHistory.length <= 1) {
            return;
        }
        const current = this.undoHistory.pop();
        if (current) {
            this.redoHistory.push(current);
        }
        const prev = this.undoHistory[this.undoHistory.length - 1];
        this.applyState(prev);
    }

    redo() {
        if (this.redoHistory.length === 0) {
            return;
        }
        const next = this.redoHistory.pop();
        if (!next) {
            return;
        }
        this.undoHistory.push(next);
        this.applyState(next);
    }

    deleteSelectedPoint() {
        if (this.selectedPart) {
            this.deleteSelectedPart();
            return;
        }
        const idx = this.selectedIndex;
        if (idx === null || idx === undefined) {
            return;
        }
        const p = this.keypoints[idx];
        if (!p) {
            return;
        }
        p.c = 0;
        this.redraw();
        this.pushHistory();
    }

    getActivePersonRaw() {
        const p = this.poseRaw?.people?.[this.activePersonIndex];
        return p && typeof p === 'object' ? p : null;
    }

    getPartFlatArray(kind) {
        const person = this.getActivePersonRaw();
        if (!person)
            return null;
        if (kind === 'face')
            return Array.isArray(person.face_keypoints_2d) ? person.face_keypoints_2d : null;
        if (kind === 'hand_left')
            return Array.isArray(person.hand_left_keypoints_2d) ? person.hand_left_keypoints_2d : null;
        if (kind === 'hand_right')
            return Array.isArray(person.hand_right_keypoints_2d) ? person.hand_right_keypoints_2d : null;
        return null;
    }

    translatePartFlat(kind, dx, dy) {
        const flat = this.getPartFlatArray(kind);
        if (!flat || flat.length < 3)
            return;
        const ddx = Number(dx) || 0;
        const ddy = Number(dy) || 0;
        if (ddx === 0 && ddy === 0)
            return;
        for (let i = 0; i + 2 < flat.length; i += 3) {
            const c = Number(flat[i + 2]) || 0;
            if (c <= 0)
                continue;
            flat[i] = clamp((Number(flat[i]) || 0) + ddx, 0, this.width);
            flat[i + 1] = clamp((Number(flat[i + 1]) || 0) + ddy, 0, this.height);
        }
    }

    getWristIndexForHand(kind) {
        if (kind === 'hand_left')
            return 7;
        if (kind === 'hand_right')
            return 4;
        return null;
    }

    getPartBounds(kind) {
        const flat = this.getPartFlatArray(kind);
        if (!flat || flat.length < 3)
            return null;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        for (let i = 0; i + 2 < flat.length; i += 3) {
            const c = Number(flat[i + 2]) || 0;
            if (c <= 0)
                continue;
            const x = Number(flat[i]) || 0;
            const y = Number(flat[i + 1]) || 0;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            sumX += x;
            sumY += y;
            count += 1;
        }
        if (count < 3 || !Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
            return null;
        }
        const cx = sumX / count;
        const cy = sumY / count;
        return { minX, minY, maxX, maxY, cx, cy, count, area: Math.max(0, maxX - minX) * Math.max(0, maxY - minY) };
    }

    hitTestPart(pt) {
        const pad = Math.max(12, Math.round(16 / (this.scale || 1)));
        const kinds = ['face', 'hand_left', 'hand_right'];
        let best = null;
        let bestScore = Infinity;
        for (const kind of kinds) {
            const b = this.getPartBounds(kind);
            if (!b)
                continue;
            const minX = b.minX - pad;
            const minY = b.minY - pad;
            const maxX = b.maxX + pad;
            const maxY = b.maxY + pad;
            if (pt.x < minX || pt.x > maxX || pt.y < minY || pt.y > maxY)
                continue;
            const dx = pt.x - b.cx;
            const dy = pt.y - b.cy;
            const d = Math.sqrt(dx * dx + dy * dy);
            const score = d + (b.area * 0.00001);
            if (score < bestScore) {
                bestScore = score;
                best = { kind, bounds: b };
            }
        }
        return best;
    }

    startPartDrag(kind, startPt) {
        const flat = this.getPartFlatArray(kind);
        if (!flat)
            return false;
        const b = this.getPartBounds(kind);
        if (!b)
            return false;
        const v0x = startPt.x - b.cx;
        const v0y = startPt.y - b.cy;
        const startDist = Math.max(0.001, Math.sqrt(v0x * v0x + v0y * v0y));
        const wristIndex = this.getWristIndexForHand(kind);
        let startWrist = null;
        if (wristIndex !== null) {
            const wp = this.keypoints?.[wristIndex];
            if (wp && (wp.c ?? 0) > 0) {
                startWrist = { x: Number(wp.x) || 0, y: Number(wp.y) || 0, c: Number(wp.c) || 0 };
            }
        }
        this.partDrag = {
            kind,
            startPt,
            center: { x: b.cx, y: b.cy },
            mode: 'move',
            startAngle: Math.atan2(v0y, v0x),
            startDist,
            startHalfW: Math.max(0.001, (b.maxX - b.minX) / 2),
            startHalfH: Math.max(0.001, (b.maxY - b.minY) / 2),
            startVec: { x: v0x, y: v0y },
            wristIndex,
            startWrist,
            startFlat: flat.slice(),
        };
        return true;
    }

    updatePartDrag(pt) {
        const drag = this.partDrag;
        if (!drag)
            return;
        const flat = this.getPartFlatArray(drag.kind);
        if (!flat)
            return;
        const cx = drag.center.x;
        const cy = drag.center.y;
        const dx = pt.x - drag.startPt.x;
        const dy = pt.y - drag.startPt.y;
        let rot = 0;
        const mode = drag.mode || 'move';
        let scaleX = 1;
        let scaleY = 1;
        if (mode === 'rotate') {
            const currentAngle = Math.atan2(pt.y - cy, pt.x - cx);
            rot = currentAngle - drag.startAngle;
        }
        else if (mode === 'scale') {
            const v1x = pt.x - cx;
            const v1y = pt.y - cy;
            const dist = Math.sqrt(v1x * v1x + v1y * v1y);
            let s = dist / drag.startDist;
            if (!Number.isFinite(s) || s === 0)
                s = 1;
            const v0 = drag.startVec || { x: 1, y: 0 };
            const dot = (Number(v0.x) || 0) * v1x + (Number(v0.y) || 0) * v1y;
            const sign = dot < 0 ? -1 : 1;
            const mag = clamp(Math.abs(s), 0.2, 5);
            scaleX = sign * mag;
            scaleY = sign * mag;
        }
        else if (mode === 'scaleX') {
            const v0 = drag.startVec || { x: 1, y: 0 };
            const denom = Math.abs(Number(v0.x) || 0) > 0.001 ? Number(v0.x) : (Number(v0.x) || 1);
            let s = (pt.x - cx) / denom;
            if (!Number.isFinite(s) || s === 0)
                s = 1;
            const mag = clamp(Math.abs(s), 0.2, 5);
            scaleX = (s < 0 ? -1 : 1) * mag;
            scaleY = 1;
        }
        else if (mode === 'scaleY') {
            const v0 = drag.startVec || { x: 0, y: 1 };
            const denom = Math.abs(Number(v0.y) || 0) > 0.001 ? Number(v0.y) : (Number(v0.y) || 1);
            let s = (pt.y - cy) / denom;
            if (!Number.isFinite(s) || s === 0)
                s = 1;
            const mag = clamp(Math.abs(s), 0.2, 5);
            scaleY = (s < 0 ? -1 : 1) * mag;
            scaleX = 1;
        }
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        const transformPoint = (x0, y0) => {
            let x = x0;
            let y = y0;
            if (mode === 'move') {
                x = x0 + dx;
                y = y0 + dy;
            }
            else if (mode === 'rotate') {
                const vx = x0 - cx;
                const vy = y0 - cy;
                x = cx + (vx * cos - vy * sin);
                y = cy + (vx * sin + vy * cos);
            }
            else if (mode === 'scale' || mode === 'scaleX' || mode === 'scaleY') {
                const vx = x0 - cx;
                const vy = y0 - cy;
                x = cx + vx * scaleX;
                y = cy + vy * scaleY;
            }
            return { x: clamp(x, 0, this.width), y: clamp(y, 0, this.height) };
        };
        for (let i = 0; i + 2 < flat.length && i + 2 < drag.startFlat.length; i += 3) {
            const c0 = Number(drag.startFlat[i + 2]) || 0;
            if (c0 <= 0)
                continue;
            const x0 = Number(drag.startFlat[i]) || 0;
            const y0 = Number(drag.startFlat[i + 1]) || 0;
            const p = transformPoint(x0, y0);
            flat[i] = p.x;
            flat[i + 1] = p.y;
            flat[i + 2] = c0;
        }
        if (drag.startWrist && drag.wristIndex !== null) {
            const body = this.keypoints?.[drag.wristIndex];
            if (body && (body.c ?? 0) > 0) {
                const p = transformPoint(drag.startWrist.x, drag.startWrist.y);
                body.x = p.x;
                body.y = p.y;
            }
        }
        this.redraw();
    }

    getSelectedPartHandle(pt) {
        if (!this.selectedPart)
            return null;
        const b = this.getPartBounds(this.selectedPart.kind);
        if (!b)
            return null;
        const size = Math.max(12, Math.round(14 / (this.scale || 1)));
        const half = size / 2;
        const cx = b.cx;
        const cy = b.cy;
        const minX = b.minX;
        const minY = b.minY;
        const maxX = b.maxX;
        const maxY = b.maxY;
        const rotY = minY - Math.max(22, Math.round(26 / (this.scale || 1)));
        const handles = [
            { x: minX, y: minY, mode: 'scale' },
            { x: cx, y: minY, mode: 'scaleY' },
            { x: maxX, y: minY, mode: 'scale' },
            { x: maxX, y: cy, mode: 'scaleX' },
            { x: maxX, y: maxY, mode: 'scale' },
            { x: cx, y: maxY, mode: 'scaleY' },
            { x: minX, y: maxY, mode: 'scale' },
            { x: minX, y: cy, mode: 'scaleX' },
            { x: cx, y: rotY, mode: 'rotate' },
        ];
        for (const h of handles) {
            if (pt.x >= h.x - half && pt.x <= h.x + half && pt.y >= h.y - half && pt.y <= h.y + half) {
                return { mode: h.mode, center: { x: cx, y: cy }, bounds: b, handle: h };
            }
        }
        const pad = Math.max(10, Math.round(12 / (this.scale || 1)));
        if (pt.x >= minX - pad && pt.x <= maxX + pad && pt.y >= minY - pad && pt.y <= maxY + pad) {
            return { mode: 'move', center: { x: cx, y: cy }, bounds: b, handle: null };
        }
        return null;
    }

    deleteSelectedPart() {
        const part = this.selectedPart;
        if (!part)
            return;
        const flat = this.getPartFlatArray(part.kind);
        if (!flat)
            return;
        for (let i = 0; i + 2 < flat.length; i += 3) {
            flat[i] = 0;
            flat[i + 1] = 0;
            flat[i + 2] = 0;
        }
        this.selectedPart = null;
        this.partDrag = null;
        this.redraw();
        this.pushHistory();
    }

    onKeyDown(e) {
        if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.stopPropagation();
            this.undo();
            return;
        }
        if ((e.key === 'y' && (e.ctrlKey || e.metaKey)) || (e.key === 'Z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
            e.preventDefault();
            e.stopPropagation();
            this.redo();
            return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            e.stopPropagation();
            this.deleteSelectedPoint();
            return;
        }
    }

    renderSkeletonToDataUrl() {
        const { canvas: outCanvas, ctx } = createCanvas(this.width, this.height, '2d', { willReadFrequently: false });
        if (!ctx) {
            throw new Error('Failed to create output canvas context');
        }
        ctx.clearRect(0, 0, this.width, this.height);
        const bold = !!this.boldSkeleton;
        const radiusFactor = bold ? 1.4 : 1;
        const stickFactor = bold ? 1.9 : 1;
        const radius = Math.max(2, Math.round(this.keypointRadius * radiusFactor));
        const stick = Math.max(2, Math.round(this.stickWidth * stickFactor));
        if (this.renderAllPeople) {
            for (const kp of this.peopleKeypoints) {
                drawSkeleton(ctx, kp, {
                    drawKeypoints: true,
                    drawConnections: true,
                    keypointRadius: radius,
                    stickWidth: stick,
                    connectionStyle: bold ? 'ellipse' : 'stroke',
                    opacity: 1
                });
            }
        }
        else {
            drawSkeleton(ctx, this.keypoints, {
                drawKeypoints: true,
                drawConnections: true,
                keypointRadius: radius,
                stickWidth: stick,
                connectionStyle: bold ? 'ellipse' : 'stroke',
                opacity: 1
            });
        }

        const faceRadius = 2;
        const handPoint = 2;
        const handLine = 2;
        if (this.renderAllPeople) {
            const people = Array.isArray(this.poseRaw?.people) ? this.poseRaw.people : [];
            for (let i = 0; i < people.length; i++) {
                const person = people[i];
                if (!person)
                    continue;
                const kp = this.peopleKeypoints[i] || parseKeypointsFlat([]);
                const face = parseKeypointsFlatAny(person.face_keypoints_2d);
                const leftHand = parseKeypointsFlatAny(person.hand_left_keypoints_2d);
                const rightHand = parseKeypointsFlatAny(person.hand_right_keypoints_2d);
                drawFace(ctx, face, { radius: faceRadius, opacity: 0.8 });
                drawHand(ctx, leftHand, { pointRadius: handPoint, lineWidth: handLine, opacity: 0.9 });
                drawHand(ctx, rightHand, { pointRadius: handPoint, lineWidth: handLine, opacity: 0.9 });
                const linkW = 2;
                drawWristHandLinks(ctx, kp, [leftHand, rightHand], { lineWidth: linkW, opacity: 0.65 });
            }
        }
        else {
            const person = this.poseRaw?.people?.[this.activePersonIndex];
            if (person) {
                const face = parseKeypointsFlatAny(person.face_keypoints_2d);
                const leftHand = parseKeypointsFlatAny(person.hand_left_keypoints_2d);
                const rightHand = parseKeypointsFlatAny(person.hand_right_keypoints_2d);
                drawFace(ctx, face, { radius: faceRadius, opacity: 0.8 });
                drawHand(ctx, leftHand, { pointRadius: handPoint, lineWidth: handLine, opacity: 0.9 });
                drawHand(ctx, rightHand, { pointRadius: handPoint, lineWidth: handLine, opacity: 0.9 });
                const linkW = 2;
                drawWristHandLinks(ctx, this.keypoints, [leftHand, rightHand], { lineWidth: linkW, opacity: 0.65 });
            }
        }
        return outCanvas.toDataURL('image/png');
    }

    fillMissingKeypoints() {
        const kp = this.keypoints;
        if (!Array.isArray(kp) || kp.length < 18)
            return;
        const w = this.width;
        const h = this.height;

        const has = (i) => (kp[i]?.c ?? 0) > 0;
        const set = (i, x, y) => {
            const p = kp[i] || { x: 0, y: 0, c: 0 };
            p.x = clamp(Number(x) || 0, 0, w);
            p.y = clamp(Number(y) || 0, 0, h);
            p.c = 1;
            kp[i] = p;
        };
        const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

        if (!has(1) && has(2) && has(5)) {
            set(1, (kp[2].x + kp[5].x) / 2, (kp[2].y + kp[5].y) / 2);
        }

        const neck = has(1) ? kp[1] : null;
        const hipCenter = (has(8) && has(11)) ? mid(kp[8], kp[11]) : null;
        const mirrorX = (anchor, sourceX) => anchor.x + (anchor.x - sourceX);

        const mirrorPairs = [
            { right: 2, left: 5, anchor: () => neck },
            { right: 3, left: 6, anchor: () => neck },
            { right: 4, left: 7, anchor: () => neck },
            { right: 8, left: 11, anchor: () => neck || hipCenter },
            { right: 9, left: 12, anchor: () => hipCenter || neck },
            { right: 10, left: 13, anchor: () => hipCenter || neck },
            { right: 14, left: 15, anchor: () => has(0) ? kp[0] : neck },
            { right: 16, left: 17, anchor: () => has(0) ? kp[0] : neck },
        ];
        for (const { right, left, anchor } of mirrorPairs) {
            const a = anchor();
            if (!a)
                continue;
            const hasL = has(left);
            const hasR = has(right);
            if (hasL && !hasR) {
                set(right, mirrorX(a, kp[left].x), kp[left].y);
            }
            else if (!hasL && hasR) {
                set(left, mirrorX(a, kp[right].x), kp[right].y);
            }
        }

        const limbExtensions = [
            [4, 3, 2], [7, 6, 5],
            [10, 9, 8], [13, 12, 11]
        ];
        for (const [target, p1, p2] of limbExtensions) {
            if (!has(target) && has(p1) && has(p2)) {
                const P1 = kp[p1];
                const P2 = kp[p2];
                set(target, P1.x + (P1.x - P2.x), P1.y + (P1.y - P2.y));
            }
        }

        const kneeSolve = [
            { hip: 8, knee: 9, ankle: 10 },
            { hip: 11, knee: 12, ankle: 13 },
        ];
        for (const { hip, knee, ankle } of kneeSolve) {
            if (!has(knee) && has(hip) && has(ankle)) {
                set(knee, (kp[hip].x + kp[ankle].x) / 2, (kp[hip].y + kp[ankle].y) / 2);
            }
            if (!has(hip) && has(knee) && has(ankle)) {
                set(hip, kp[knee].x + (kp[knee].x - kp[ankle].x) * 0.8, kp[knee].y + (kp[knee].y - kp[ankle].y) * 0.8);
            }
        }

        if (!has(10) && has(9) && has(12) && has(13)) {
            const vX = kp[13].x - kp[12].x;
            const vY = kp[13].y - kp[12].y;
            set(10, kp[9].x + vX, kp[9].y + vY);
        }
        if (!has(13) && has(12) && has(9) && has(10)) {
            const vX = kp[10].x - kp[9].x;
            const vY = kp[10].y - kp[9].y;
            set(13, kp[12].x + vX, kp[12].y + vY);
        }

        let sumX = 0;
        let sumY = 0;
        let count = 0;
        for (let i = 0; i < 18; i++) {
            if (has(i)) {
                sumX += kp[i].x;
                sumY += kp[i].y;
                count += 1;
            }
        }
        const fallbackX = count > 0 ? sumX / count : w / 2;
        const fallbackY = count > 0 ? sumY / count : h / 2;
        for (let i = 0; i < 18; i++) {
            if (!has(i)) {
                set(i, fallbackX, fallbackY);
            }
        }
    }

    getCanvasPointFromEvent(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
        return { x, y };
    }

    hitTest(pt) {
        const radius = Math.max(10, Math.round(12 / (this.scale || 1)));
        let bestIndex = null;
        let bestDist = Infinity;
        for (let i = 0; i < this.keypoints.length; i++) {
            const p = this.keypoints[i];
            if (!p)
                continue;
            if ((p.c ?? 0) <= 0)
                continue;
            const dx = pt.x - p.x;
            const dy = pt.y - p.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d <= radius && d < bestDist) {
                bestDist = d;
                bestIndex = i;
            }
        }
        return bestIndex;
    }

    onPointerDown(e) {
        if (!this.canvas)
            return;
        e.preventDefault();
        e.stopPropagation();
        if (e.button === 1) {
            this.activeIndex = null;
            this.selectedIndex = null;
            this.activePointerId = null;
            this.isDragging = false;
            this.partDrag = null;
            this.startPan(e);
            return;
        }
        const pt = this.getCanvasPointFromEvent(e);
        const idx = this.hitTest(pt);
        if (idx === null) {
            const handle = this.getSelectedPartHandle(pt);
            if (handle && this.selectedPart) {
                this.partDrag = null;
                const started = this.startPartDrag(this.selectedPart.kind, pt);
                if (started && this.partDrag) {
                    this.partDrag.mode = handle.mode;
                    this.partDrag.center = handle.center;
                    this.partDrag.startHalfW = Math.max(0.001, (handle.bounds.maxX - handle.bounds.minX) / 2);
                    this.partDrag.startHalfH = Math.max(0.001, (handle.bounds.maxY - handle.bounds.minY) / 2);
                    this.partDrag.startAngle = Math.atan2(pt.y - handle.center.y, pt.x - handle.center.x);
                    this.partDrag.startDist = Math.max(0.001, Math.sqrt((pt.x - handle.center.x) ** 2 + (pt.y - handle.center.y) ** 2));
                    this.activeIndex = null;
                    this.selectedIndex = null;
                    this.activePointerId = e.pointerId;
                    this.isDragging = true;
                    this.hasDragged = false;
                    this.historyPushedInDrag = false;
                    try {
                        this.canvas.setPointerCapture(e.pointerId);
                    }
                    catch {
                    }
                    this.canvas.style.cursor = 'grabbing';
                    this.redraw();
                    return;
                }
            }
            const partHit = this.hitTestPart(pt);
            if (!partHit || !this.startPartDrag(partHit.kind, pt)) {
                this.activeIndex = null;
                this.selectedIndex = null;
                this.selectedPart = null;
                this.partDrag = null;
                this.isDragging = false;
                this.canvas.style.cursor = 'grab';
                this.redraw();
                return;
            }
            this.activeIndex = null;
            this.selectedIndex = null;
            this.selectedPart = { kind: partHit.kind };
            if (this.partDrag) {
                this.partDrag.mode = 'move';
                const c = this.partDrag.center;
                this.partDrag.startAngle = Math.atan2(pt.y - c.y, pt.x - c.x);
                this.partDrag.startDist = Math.max(0.001, Math.sqrt((pt.x - c.x) ** 2 + (pt.y - c.y) ** 2));
            }
            this.activePointerId = e.pointerId;
            this.isDragging = true;
            this.hasDragged = false;
            this.historyPushedInDrag = false;
            try {
                this.canvas.setPointerCapture(e.pointerId);
            }
            catch {
            }
            this.canvas.style.cursor = 'grabbing';
            this.redraw();
            return;
        }
        this.partDrag = null;
        this.selectedPart = null;
        this.activeIndex = idx;
        this.selectedIndex = idx;
        this.activePointerId = e.pointerId;
        this.isDragging = true;
        this.hasDragged = false;
        this.historyPushedInDrag = false;
        try {
            this.canvas.setPointerCapture(e.pointerId);
        }
        catch {
        }
        this.canvas.style.cursor = 'grabbing';
        this.redraw();
    }

    onPointerMove(e) {
        if (this.isPanning) {
            if (this.panPointerId !== null && e.pointerId !== this.panPointerId)
                return;
            e.preventDefault();
            e.stopPropagation();
            this.updatePan(e);
            return;
        }
        if (!this.isDragging)
            return;
        if (this.activePointerId !== null && e.pointerId !== this.activePointerId)
            return;
        e.preventDefault();
        e.stopPropagation();
        const pt = this.getCanvasPointFromEvent(e);
        if (!this.historyPushedInDrag) {
            this.pushHistory();
            this.historyPushedInDrag = true;
        }
        this.hasDragged = true;
        if (this.partDrag) {
            this.updatePartDrag(pt);
        }
        else {
            this.updateActivePoint(pt);
        }
    }

    onPointerUp(e) {
        if (this.isPanning) {
            if (this.panPointerId !== null && e.pointerId !== this.panPointerId)
                return;
            this.endPan();
            return;
        }
        if (this.activePointerId !== null && e.pointerId !== this.activePointerId)
            return;
        this.isDragging = false;
        this.activeIndex = null;
        this.activePointerId = null;
        this.partDrag = null;
        if (this.canvas) {
            this.canvas.style.cursor = 'grab';
        }
        if (this.hasDragged) {
            this.pushHistory();
        }
    }

    updateActivePoint(pt) {
        const idx = this.activeIndex;
        if (idx === null || idx === undefined)
            return;
        const p = this.keypoints[idx];
        if (!p)
            return;
        p.x = clamp(pt.x, 0, this.width);
        p.y = clamp(pt.y, 0, this.height);
        p.c = p.c > 0 ? p.c : 1;
        this.redraw();
    }

    clampPan(containerW, containerH) {
        const displayedW = this.width * this.scale;
        const displayedH = this.height * this.scale;
        const baseLeft = (containerW - displayedW) / 2;
        const baseTop = (containerH - displayedH) / 2;
        if (displayedW <= containerW + 0.5) {
            this.panX = 0;
        }
        else {
            const minPanX = (containerW - displayedW) - baseLeft;
            const maxPanX = -baseLeft;
            this.panX = clamp(this.panX, minPanX, maxPanX);
        }
        if (displayedH <= containerH + 0.5) {
            this.panY = 0;
        }
        else {
            const minPanY = (containerH - displayedH) - baseTop;
            const maxPanY = -baseTop;
            this.panY = clamp(this.panY, minPanY, maxPanY);
        }
    }

    applyCanvasTransform() {
        if (!this.canvas)
            return;
        const x = Number.isFinite(this.panX) ? this.panX : 0;
        const y = Number.isFinite(this.panY) ? this.panY : 0;
        this.canvas.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }

    onWheel(e) {
        if (!this.canvas || !this.container)
            return;
        e.preventDefault();
        e.stopPropagation();
        const rect = this.container.getBoundingClientRect();
        const world = this.getCanvasPointFromEvent(e);
        const delta = Number(e.deltaY) || 0;
        const factor = Math.pow(1.0015, -delta);
        const nextZoom = clamp((Number(this.zoom) || 1) * factor, 0.25, 8);
        if (Math.abs(nextZoom - this.zoom) < 1e-6)
            return;
        this.zoom = nextZoom;
        const containerW = Math.max(1, rect.width);
        const containerH = Math.max(1, rect.height);
        this.baseScale = Math.min(containerW / this.width, containerH / this.height);
        this.scale = this.baseScale * this.zoom;
        this.canvas.style.width = `${Math.round(this.width * this.scale)}px`;
        this.canvas.style.height = `${Math.round(this.height * this.scale)}px`;
        const displayedW = this.width * this.scale;
        const displayedH = this.height * this.scale;
        const baseLeft = (containerW - displayedW) / 2;
        const baseTop = (containerH - displayedH) / 2;
        const desiredLeft = e.clientX - world.x * this.scale;
        const desiredTop = e.clientY - world.y * this.scale;
        this.panX = desiredLeft - rect.left - baseLeft;
        this.panY = desiredTop - rect.top - baseTop;
        this.clampPan(containerW, containerH);
        this.applyCanvasTransform();
        this.redraw();
    }

    startPan(e) {
        if (!this.container || !this.canvas)
            return;
        this.isPanning = true;
        this.panPointerId = e.pointerId;
        this.panStartClient = { x: e.clientX, y: e.clientY };
        this.panStartOffset = { x: this.panX, y: this.panY };
        try {
            this.canvas.setPointerCapture(e.pointerId);
        }
        catch {
        }
        this.canvas.style.cursor = 'grabbing';
    }

    updatePan(e) {
        if (!this.container || !this.canvas || !this.panStartClient || !this.panStartOffset)
            return;
        const rect = this.container.getBoundingClientRect();
        const containerW = Math.max(1, rect.width);
        const containerH = Math.max(1, rect.height);
        this.panX = this.panStartOffset.x + (e.clientX - this.panStartClient.x);
        this.panY = this.panStartOffset.y + (e.clientY - this.panStartClient.y);
        this.clampPan(containerW, containerH);
        this.applyCanvasTransform();
    }

    endPan() {
        this.isPanning = false;
        this.panPointerId = null;
        this.panStartClient = null;
        this.panStartOffset = null;
        if (this.canvas) {
            this.canvas.style.cursor = 'grab';
        }
    }

    layoutCanvas() {
        if (!this.canvas || !this.container)
            return;
        const rect = this.container.getBoundingClientRect();
        let maxW = rect.width;
        let maxH = rect.height;
        if (!Number.isFinite(maxW) || !Number.isFinite(maxH) || maxW < 2 || maxH < 2) {
            maxW = Math.min(window.innerWidth * 0.98, 1400);
            maxH = Math.min(window.innerHeight * 0.88, 960);
        }
        maxW = Math.max(1, maxW);
        maxH = Math.max(1, maxH);
        const scaleW = maxW / this.width;
        const scaleH = maxH / this.height;
        this.baseScale = Math.min(scaleW, scaleH);
        this.zoom = clamp(Number(this.zoom) || 1, 0.25, 8);
        this.scale = this.baseScale * this.zoom;
        this.canvas.style.width = `${Math.round(this.width * this.scale)}px`;
        this.canvas.style.height = `${Math.round(this.height * this.scale)}px`;
        this.clampPan(maxW, maxH);
        this.applyCanvasTransform();
    }

    redraw() {
        if (!this.ctx)
            return;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        if (this.showBackground && this.bgImage) {
            ctx.save();
            ctx.globalAlpha = this.backgroundOpacity;
            ctx.drawImage(this.bgImage, 0, 0, this.width, this.height);
            ctx.restore();
        }

        const bold = !!this.boldSkeleton;
        const radiusFactor = bold ? 1.4 : 1;
        const stickFactor = bold ? 1.9 : 1;
        const radius = Math.max(2, Math.round((this.keypointRadius * radiusFactor) / (this.scale || 1)));
        const stick = Math.max(2, Math.round((this.stickWidth * stickFactor) / (this.scale || 1)));
        drawSkeleton(ctx, this.keypoints, {
            drawKeypoints: true,
            drawConnections: true,
            keypointRadius: radius,
            stickWidth: stick,
            connectionStyle: bold ? 'ellipse' : 'stroke',
            opacity: 0.95
        });

        const person = this.poseRaw?.people?.[this.activePersonIndex];
        if (person) {
            const face = parseKeypointsFlatAny(person.face_keypoints_2d);
            const leftHand = parseKeypointsFlatAny(person.hand_left_keypoints_2d);
            const rightHand = parseKeypointsFlatAny(person.hand_right_keypoints_2d);
            const faceRadius = Math.max(1, Math.round(2 / (this.scale || 1)));
            const handPoint = Math.max(1, Math.round(2 / (this.scale || 1)));
            const handLine = Math.max(1, Math.round(2 / (this.scale || 1)));
            drawFace(ctx, face, { radius: faceRadius, opacity: 0.75 });
            drawHand(ctx, leftHand, { pointRadius: handPoint, lineWidth: handLine, opacity: 0.85 });
            drawHand(ctx, rightHand, { pointRadius: handPoint, lineWidth: handLine, opacity: 0.85 });
            const linkW = Math.max(1, Math.round(2 / (this.scale || 1)));
            drawWristHandLinks(ctx, this.keypoints, [leftHand, rightHand], { lineWidth: linkW, opacity: 0.65 });
        }

        if (this.selectedPart) {
            const b = this.getPartBounds(this.selectedPart.kind);
            if (b) {
                const pad = Math.max(6, Math.round(8 / (this.scale || 1)));
                const size = Math.max(10, Math.round(12 / (this.scale || 1)));
                const half = size / 2;
                const rotY = b.minY - Math.max(22, Math.round(26 / (this.scale || 1)));
                ctx.save();
                ctx.globalAlpha = 0.9;
                ctx.strokeStyle = 'rgba(0,200,255,0.95)';
                ctx.lineWidth = Math.max(2, Math.round(2 / (this.scale || 1)));
                ctx.strokeRect(b.minX - pad, b.minY - pad, (b.maxX - b.minX) + pad * 2, (b.maxY - b.minY) + pad * 2);
                ctx.beginPath();
                ctx.moveTo(b.cx, b.minY - pad);
                ctx.lineTo(b.cx, rotY + half);
                ctx.stroke();
                ctx.fillStyle = '#fff';
                const pts = [
                    [b.minX, b.minY], [b.cx, b.minY], [b.maxX, b.minY],
                    [b.maxX, b.cy], [b.maxX, b.maxY],
                    [b.cx, b.maxY], [b.minX, b.maxY], [b.minX, b.cy],
                    [b.cx, rotY]
                ];
                for (const [x, y] of pts) {
                    ctx.beginPath();
                    ctx.rect(x - half, y - half, size, size);
                    ctx.fill();
                    ctx.stroke();
                }
                ctx.restore();
            }
        }

        const sel = this.selectedIndex;
        if (sel !== null && sel !== undefined) {
            const p = this.keypoints[sel];
            if (p && (p.c ?? 0) > 0) {
                ctx.save();
                ctx.globalAlpha = 0.95;
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = Math.max(2, Math.round(2 / (this.scale || 1)));
                ctx.beginPath();
                ctx.arc(p.x, p.y, radius + Math.max(3, Math.round(3 / (this.scale || 1))), 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        }
    }
}

