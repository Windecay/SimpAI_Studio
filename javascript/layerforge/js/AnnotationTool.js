import { saveImage } from "/file=javascript/layerforge/js/db.js?v=patch26";
import { generateUUID } from "/file=javascript/layerforge/js/utils/CommonUtils.js?v=patch26";
import { iconLoader, LAYERFORGE_TOOLS } from "/file=javascript/layerforge/js/utils/IconLoader.js?v=patch26";

const SHAPES = [
    ['rectangle', 'Rectangle'], ['ellipse', 'Ellipse'], ['triangle', 'Triangle'],
    ['diamond', 'Diamond'], ['pentagon', 'Pentagon'], ['hexagon', 'Hexagon'],
    ['polygon', 'Polygon'], ['line', 'Line']
];
const text = (key) => window.LayerForgeI18n.text(key);
const clampNumber = (value, min, max, fallback) => {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};

export function shapeGeometry(kind, start, end, constrained = false, lineWidth = 6) {
    let dx = end.x - start.x;
    let dy = end.y - start.y;
    if (constrained) {
        if (kind === 'line' || kind === 'arrow') {
            const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
            const length = Math.hypot(dx, dy);
            dx = Math.cos(angle) * length;
            dy = Math.sin(angle) * length;
        } else {
            const size = Math.max(Math.abs(dx), Math.abs(dy));
            dx = (dx < 0 ? -1 : 1) * size;
            dy = (dy < 0 ? -1 : 1) * size;
        }
    }
    const tip = { x: start.x + dx, y: start.y + dy };
    const bounds = {
        x: Math.min(start.x, tip.x), y: Math.min(start.y, tip.y),
        width: Math.abs(dx), height: Math.abs(dy)
    };
    if (kind === 'arrow') {
        const length = Math.hypot(dx, dy);
        const ux = length ? dx / length : 1;
        const uy = length ? dy / length : 0;
        const headLength = Math.min(length * 0.45, Math.max(18, lineWidth * 4));
        const headWidth = headLength * 0.55;
        const base = { x: tip.x - ux * headLength, y: tip.y - uy * headLength };
        return { points: [start, tip], head: [
            tip, { x: base.x - uy * headWidth, y: base.y + ux * headWidth },
            { x: base.x + uy * headWidth, y: base.y - ux * headWidth }
        ], base };
    }
    if (kind === 'line') return { points: [start, tip] };
    if (kind === 'ellipse' || kind === 'rectangle') return { bounds };
    const sides = { triangle: 3, diamond: 4, pentagon: 5, hexagon: 6 }[kind];
    if (!sides) return { points: [] };
    return { points: Array.from({ length: sides }, (_, index) => {
        const angle = -Math.PI / 2 + index * Math.PI * 2 / sides;
        return {
            x: bounds.x + bounds.width / 2 + Math.cos(angle) * bounds.width / 2,
            y: bounds.y + bounds.height / 2 + Math.sin(angle) * bounds.height / 2
        };
    }) };
}

function markerLayout(ctx, annotation) {
    const size = annotation.size;
    const fontSize = Math.round(size * 0.54);
    ctx.font = `600 ${fontSize}px Arial, "Microsoft YaHei", sans-serif`;
    const radius = Math.max(size / 2, ctx.measureText(String(annotation.number)).width / 2 + size * 0.15);
    const lines = annotation.text ? annotation.text.split('\n') : [];
    const padding = Math.max(4, size * 0.16);
    const lineHeight = fontSize * 1.35;
    const labelWidth = lines.length ? Math.max(...lines.map((line) => ctx.measureText(line).width)) + padding * 2 : 0;
    const labelHeight = lines.length ? lines.length * lineHeight + padding * 2 : 0;
    return { radius, lines, padding, lineHeight, labelWidth, labelHeight };
}

export function annotationBounds(ctx, annotation) {
    if (annotation.kind === 'marker') {
        const layout = markerLayout(ctx, annotation);
        const { x, y } = annotation.anchor;
        const padding = 2;
        return {
            x: Math.floor(x - layout.radius - padding),
            y: Math.floor(y - Math.max(layout.radius, layout.labelHeight / 2) - padding),
            width: Math.ceil(layout.radius * 2 + (layout.labelWidth ? annotation.size * 0.25 + layout.labelWidth : 0) + padding * 2),
            height: Math.ceil(Math.max(layout.radius * 2, layout.labelHeight) + padding * 2)
        };
    }
    const geometry = annotation.geometry;
    const points = [...(geometry.points || []), ...(geometry.head || [])];
    if (geometry.bounds) {
        const b = geometry.bounds;
        points.push({ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y + b.height });
    }
    const padding = annotation.lineWidth / 2 + 2;
    const left = Math.floor(Math.min(...points.map((p) => p.x)) - padding);
    const top = Math.floor(Math.min(...points.map((p) => p.y)) - padding);
    return {
        x: left, y: top,
        width: Math.ceil(Math.max(...points.map((p) => p.x)) + padding) - left,
        height: Math.ceil(Math.max(...points.map((p) => p.y)) + padding) - top
    };
}

export function drawAnnotation(ctx, annotation) {
    ctx.save();
    ctx.fillStyle = annotation.color;
    ctx.strokeStyle = annotation.color;
    ctx.lineWidth = annotation.lineWidth || 1;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (annotation.kind === 'marker') {
        const layout = markerLayout(ctx, annotation);
        const { x, y } = annotation.anchor;
        ctx.beginPath();
        ctx.arc(x, y, layout.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(annotation.number), x, y);
        if (layout.lines.length) {
            const left = x + layout.radius + annotation.size * 0.25;
            const top = y - layout.labelHeight / 2;
            ctx.fillStyle = 'rgba(20,20,20,0.88)';
            ctx.fillRect(left, top, layout.labelWidth, layout.labelHeight);
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            layout.lines.forEach((line, index) => {
                ctx.fillText(line, left + layout.padding, top + layout.padding + (index + 0.5) * layout.lineHeight);
            });
        }
    } else {
        const geometry = annotation.geometry;
        ctx.beginPath();
        if (annotation.kind === 'ellipse') {
            const b = geometry.bounds;
            ctx.ellipse(b.x + b.width / 2, b.y + b.height / 2, b.width / 2, b.height / 2, 0, 0, Math.PI * 2);
        } else if (annotation.kind === 'rectangle') {
            const b = geometry.bounds;
            ctx.rect(b.x, b.y, b.width, b.height);
        } else if (annotation.kind === 'arrow') {
            ctx.moveTo(geometry.points[0].x, geometry.points[0].y);
            ctx.lineTo(geometry.base.x, geometry.base.y);
        } else {
            geometry.points.forEach((point, index) => {
                if (index) ctx.lineTo(point.x, point.y);
                else ctx.moveTo(point.x, point.y);
            });
            if (annotation.kind !== 'line') ctx.closePath();
        }
        if (annotation.fill && annotation.kind !== 'line' && annotation.kind !== 'arrow') ctx.fill();
        ctx.stroke();
        if (geometry.head) {
            ctx.beginPath();
            geometry.head.forEach((point, index) => {
                if (index) ctx.lineTo(point.x, point.y);
                else ctx.moveTo(point.x, point.y);
            });
            ctx.closePath();
            ctx.fill();
        }
    }
    ctx.restore();
}

export class AnnotationTool {
    constructor(canvas, options) {
        this.canvas = canvas;
        this.options = options;
        this.mode = null;
        this.color = '#ff3535';
        this.lineWidth = 6;
        this.size = 32;
        this.nextNumber = 1;
        this.label = '';
        this.shape = 'rectangle';
        this.fill = false;
        this.gesture = null;
        this.points = [];
        this.hover = null;
        this.editingId = null;
        this.pending = Promise.resolve();
        this.error = null;
        this.createToolbar();
    }

    createToolbar() {
        const group = document.createElement('span');
        group.id = 'annotation-tools';
        this.buttons = new Map();
        for (const [mode, title, icon] of [
            ['shape', 'Draw shapes', LAYERFORGE_TOOLS.SHAPE],
            ['arrow', 'Draw arrow', LAYERFORGE_TOOLS.MOVE],
            ['marker', 'Numbered marker', null]
        ]) {
            const button = document.createElement('button');
            button.className = 'btn annotation-tool';
            button.dataset.annotationTool = mode;
            button.title = text(title);
            button.setAttribute('aria-label', text(title));
            button.setAttribute('aria-pressed', 'false');
            if (icon) {
                const image = iconLoader.getIcon(icon);
                // Cached fallback icons can be canvases, whose pixels are not cloned.
                if (image instanceof HTMLCanvasElement) {
                    const copy = document.createElement('canvas');
                    copy.width = image.width;
                    copy.height = image.height;
                    copy.getContext('2d').drawImage(image, 0, 0);
                    button.append(copy);
                } else if (image) {
                    button.append(image.cloneNode(true));
                }
            } else {
                const badge = document.createElement('span');
                badge.className = 'annotation-marker-icon';
                badge.textContent = '1';
                button.append(badge);
            }
            button.onclick = () => this.setMode(this.mode === mode ? null : mode);
            group.append(button);
            this.buttons.set(mode, button);
        }
        this.controls = document.createElement('span');
        this.controls.id = 'annotation-options';
        this.controls.hidden = true;
        this.shapeSelect = document.createElement('select');
        this.shapeSelect.id = 'annotation-shape';
        this.shapeSelect.setAttribute('aria-label', text('Shape'));
        for (const [value, title] of SHAPES) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = text(title);
            this.shapeSelect.append(option);
        }
        this.shapeSelect.onchange = () => {
            this.cancelDraft();
            this.shape = this.shapeSelect.value;
            this.refreshControls();
        };
        const fillLabel = document.createElement('label');
        fillLabel.id = 'annotation-fill-control';
        const fillInput = document.createElement('input');
        fillInput.type = 'checkbox';
        fillInput.id = 'annotation-fill';
        fillInput.onchange = () => { this.fill = fillInput.checked; this.render(); };
        fillLabel.append(fillInput, document.createTextNode(text('Fill shape')));
        this.colorInput = document.createElement('input');
        this.colorInput.type = 'color';
        this.colorInput.id = 'annotation-color';
        this.colorInput.value = this.color;
        this.colorInput.title = text('Annotation color');
        this.colorInput.setAttribute('aria-label', text('Annotation color'));
        this.colorInput.oninput = () => {
            this.color = this.colorInput.value;
            this.render();
        };
        this.widthInput = this.numberInput('annotation-width', 'Stroke width', 1, 80, this.lineWidth);
        this.widthLabel = this.fieldLabel(this.widthInput, 'Stroke width');
        this.widthInput.oninput = () => {
            this.lineWidth = clampNumber(this.widthInput.value, 1, 80, this.lineWidth);
            this.render();
        };
        this.markerControls = document.createElement('span');
        this.markerControls.id = 'annotation-marker-controls';
        this.numberField = this.numberInput('annotation-number', 'Marker number', 1, 9999, 1);
        this.numberField.oninput = () => {
            if (!this.editingId) this.nextNumber = clampNumber(this.numberField.value, 1, 9999, this.nextNumber);
        };
        this.sizeInput = this.numberInput('annotation-size', 'Marker size', 12, 128, this.size);
        this.sizeInput.oninput = () => {
            this.size = clampNumber(this.sizeInput.value, 12, 128, this.size);
            this.render();
        };
        this.textInput = document.createElement('input');
        this.textInput.type = 'text';
        this.textInput.id = 'annotation-text';
        this.textInput.maxLength = 300;
        this.textInput.placeholder = text('Marker text (optional)');
        this.textInput.setAttribute('aria-label', text('Marker text (optional)'));
        this.textInput.oninput = () => { this.label = this.textInput.value; };
        this.textInput.onkeydown = (event) => {
            if (event.key === 'Enter' && this.editingId) {
                event.preventDefault();
                this.updateMarker();
            }
        };
        this.applyButton = document.createElement('button');
        this.applyButton.id = 'annotation-apply';
        this.applyButton.className = 'btn';
        this.applyButton.textContent = text('Update marker');
        this.applyButton.onclick = () => this.updateMarker();
        this.markerControls.append(this.fieldLabel(this.numberField, 'Marker number'),
            this.fieldLabel(this.sizeInput, 'Marker size'), this.textInput, this.applyButton);
        this.finishButton = document.createElement('button');
        this.finishButton.id = 'annotation-finish';
        this.finishButton.className = 'btn';
        this.finishButton.textContent = text('Finish polygon');
        this.finishButton.onclick = () => this.finishPolygon();
        this.controls.append(this.shapeSelect, fillLabel, this.colorInput, this.widthLabel,
            this.markerControls, this.finishButton);
        const penButton = document.getElementById('pen-selection');
        penButton.after(group, this.controls);
        this.fillLabel = fillLabel;
        this.refreshControls();
    }

    numberInput(id, title, min, max, value) {
        const input = document.createElement('input');
        Object.assign(input, { type: 'number', id, min, max, value, step: 1 });
        input.title = text(title);
        input.setAttribute('aria-label', text(title));
        return input;
    }

    fieldLabel(input, title) {
        const label = document.createElement('label');
        label.className = 'annotation-field';
        label.append(document.createTextNode(text(title)), input);
        return label;
    }

    refreshControls() {
        this.controls.hidden = !this.mode;
        this.shapeSelect.hidden = this.mode !== 'shape';
        this.fillLabel.hidden = this.mode !== 'shape' || this.shape === 'line';
        this.widthLabel.hidden = this.mode === 'marker';
        this.markerControls.hidden = this.mode !== 'marker';
        this.applyButton.hidden = !this.editingId;
        this.finishButton.hidden = this.mode !== 'shape' || this.shape !== 'polygon' || !this.points.length;
        this.finishButton.disabled = this.points.length < 3;
        for (const [mode, button] of this.buttons) {
            button.classList.toggle('btn-primary', mode === this.mode);
            button.setAttribute('aria-pressed', String(mode === this.mode));
        }
        for (const id of ['paint-color', 'paint-size', 'paint-new-layer', 'paint-clear-layer']) {
            document.getElementById(id).hidden = !!this.mode;
        }
    }

    setMode(mode) {
        this.cancelDraft();
        this.mode = mode;
        this.editingId = null;
        this.numberField.value = this.nextNumber;
        if (mode) {
            this.options.onActivate();
            if (this.canvas.maskTool.isActive) this.canvas.maskTool.deactivate();
            this.canvas.shapeTool.deactivate();
            this.canvas.canvas.focus({ preventScroll: true });
        }
        this.refreshControls();
        this.options.onActiveChange();
    }

    cancelDraft() {
        const pointerId = this.gesture?.pointerId;
        this.gesture = null;
        this.points = [];
        this.hover = null;
        if (pointerId !== undefined && this.options.overlay.hasPointerCapture(pointerId)) {
            this.options.overlay.releasePointerCapture(pointerId);
        }
        this.options.clearOverlay();
        this.refreshControls();
    }

    currentAnnotation() {
        if (!this.gesture) return null;
        const { start, end, constrained } = this.gesture;
        if (this.mode === 'marker') {
            return { kind: 'marker', anchor: end, number: this.nextNumber,
                text: this.label, color: this.color, size: this.size };
        }
        const kind = this.mode === 'arrow' ? 'arrow' : this.shape;
        return { kind, color: this.color, lineWidth: this.lineWidth, fill: this.fill,
            geometry: shapeGeometry(kind, start, end, constrained, this.lineWidth) };
    }

    render() {
        if (!this.mode) return;
        this.options.clearOverlay();
        let annotation = this.currentAnnotation();
        if (this.mode === 'shape' && this.shape === 'polygon' && this.points.length) {
            annotation = { kind: 'polygon', color: this.color, lineWidth: this.lineWidth,
                fill: this.fill, geometry: { points: this.hover ? [...this.points, this.hover] : this.points } };
        }
        if (!annotation) return;
        const overlay = this.options.overlay;
        const ctx = overlay.getContext('2d');
        const rect = overlay.getBoundingClientRect();
        const c = this.canvas.canvas;
        const canvasRect = c.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const sx = overlay.width / rect.width;
        const sy = overlay.height / rect.height;
        const zx = this.canvas.viewport.zoom * canvasRect.width / c.width;
        const zy = this.canvas.viewport.zoom * canvasRect.height / c.height;
        ctx.save();
        ctx.setTransform(zx * sx, 0, 0, zy * sy,
            (canvasRect.left - rect.left - this.canvas.viewport.x * zx) * sx,
            (canvasRect.top - rect.top - this.canvas.viewport.y * zy) * sy);
        drawAnnotation(ctx, annotation);
        if (this.points.length) {
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 1 / zx;
            this.points.forEach((point) => {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 4 / zx, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            });
        }
        ctx.restore();
    }

    pointerDown(event) {
        const point = this.options.getWorldFromClient(event.clientX, event.clientY);
        if (!point || this.gesture) return;
        this.canvas.canvas.focus({ preventScroll: true });
        if (this.mode === 'shape' && this.shape === 'polygon') {
            const first = this.points[0];
            const rect = this.canvas.canvas.getBoundingClientRect();
            const zoom = this.canvas.viewport.zoom * rect.width / this.canvas.canvas.width;
            if (this.points.length >= 3 && (event.detail >= 2 || Math.hypot(point.x - first.x, point.y - first.y) * zoom <= 12)) {
                this.finishPolygon();
            } else if (event.altKey) {
                this.points.pop();
            } else if (!this.points.length || Math.hypot(
                point.x - this.points[this.points.length - 1].x,
                point.y - this.points[this.points.length - 1].y
            ) * zoom > 2) {
                this.points.push(point);
            }
            this.hover = null;
            this.refreshControls();
            this.render();
            return;
        }
        this.gesture = { pointerId: event.pointerId, start: point, end: point, constrained: event.shiftKey };
        this.options.overlay.setPointerCapture(event.pointerId);
        this.render();
    }

    pointerMove(event) {
        const point = this.options.getWorldFromClient(event.clientX, event.clientY);
        if (!point) return;
        this.hover = point;
        if (this.gesture?.pointerId === event.pointerId) {
            this.gesture.end = point;
            this.gesture.constrained = event.shiftKey;
        }
        this.render();
    }

    pointerUp(event) {
        if (!this.gesture || this.gesture.pointerId !== event.pointerId) return;
        const gesture = this.gesture;
        const point = this.options.getWorldFromClient(event.clientX, event.clientY);
        if (point) gesture.end = point;
        gesture.constrained = event.shiftKey;
        const annotation = this.currentAnnotation();
        this.gesture = null;
        if (this.options.overlay.hasPointerCapture(event.pointerId)) this.options.overlay.releasePointerCapture(event.pointerId);
        this.options.clearOverlay();
        if (event.type === 'pointercancel') return;
        if (this.mode === 'marker') {
            const hit = this.markerAtPoint(gesture.end);
            if (hit) return this.editMarker(hit);
            const spec = { kind: 'marker', anchor: gesture.end, number: this.nextNumber,
                text: this.label, color: this.color, size: this.size };
            this.nextNumber = Math.min(9999, this.nextNumber + 1);
            this.numberField.value = this.nextNumber;
            this.editingId = null;
            this.refreshControls();
            this.enqueue(() => this.addAnnotation(spec));
        } else if (Math.hypot(gesture.end.x - gesture.start.x, gesture.end.y - gesture.start.y) >= 2) {
            const bounds = annotation.geometry.bounds;
            if (bounds && (bounds.width < 1 || bounds.height < 1)) return;
            this.enqueue(() => this.addAnnotation(annotation));
        }
    }

    finishPolygon() {
        if (this.points.length < 3) return;
        const spec = { kind: 'polygon', color: this.color, lineWidth: this.lineWidth,
            fill: this.fill, geometry: { points: [...this.points] } };
        this.cancelDraft();
        this.enqueue(() => this.addAnnotation(spec));
    }

    keyDown(event) {
        if (!this.mode) return false;
        if (event.key === 'Escape') {
            if (this.gesture || this.points.length) this.cancelDraft();
            else this.setMode(null);
            return true;
        }
        if (this.mode === 'shape' && this.shape === 'polygon' && this.points.length) {
            if (event.key === 'Enter') { this.finishPolygon(); return true; }
            if (event.key === 'Delete' || event.key === 'Backspace') {
                this.points.pop();
                this.refreshControls();
                this.render();
                return true;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
                this.points.pop();
                this.refreshControls();
                this.render();
                return true;
            }
        }
        return false;
    }

    markerAtPoint(point) {
        return [...this.canvas.layers].sort((a, b) => b.zIndex - a.zIndex).find((layer) => {
            if (!layer.annotation || layer.annotation.kind !== 'marker' || layer.visible === false) return false;
            const angle = -(layer.rotation || 0) * Math.PI / 180;
            const dx = point.x - layer.x - layer.width / 2;
            const dy = point.y - layer.y - layer.height / 2;
            const x = dx * Math.cos(angle) - dy * Math.sin(angle) + layer.width / 2;
            const y = dx * Math.sin(angle) + dy * Math.cos(angle) + layer.height / 2;
            return x >= 0 && x <= layer.width && y >= 0 && y <= layer.height;
        });
    }

    editMarker(layer) {
        this.editingId = layer.id;
        const spec = layer.annotation;
        this.numberField.value = spec.number;
        this.textInput.value = spec.text;
        this.label = spec.text;
        this.color = spec.color;
        this.colorInput.value = spec.color;
        this.size = spec.size;
        this.sizeInput.value = spec.size;
        this.canvas.updateSelection([layer]);
        this.refreshControls();
        this.textInput.focus({ preventScroll: true });
    }

    updateMarker() {
        const id = this.editingId;
        if (!id) return;
        const update = { number: clampNumber(this.numberField.value, 1, 9999, 1),
            text: this.textInput.value, color: this.color, size: this.size };
        this.enqueue(async () => {
            const layer = this.canvas.layers.find((candidate) => candidate.id === id);
            if (!layer?.annotation) return;
            const old = layer.annotation;
            const spec = { ...old, ...update };
            const bitmap = this.bitmap(spec);
            // Preserve the marker's transformed anchor when its text or size changes.
            const sx = layer.width / layer.originalWidth;
            const sy = layer.height / layer.originalHeight;
            const oldAnchor = {
                x: (old.anchor.x - old.bitmapBounds.x) * sx,
                y: (old.anchor.y - old.bitmapBounds.y) * sy
            };
            const newAnchor = {
                x: (spec.anchor.x - bitmap.bounds.x) * sx,
                y: (spec.anchor.y - bitmap.bounds.y) * sy
            };
            const width = bitmap.bounds.width * sx;
            const height = bitmap.bounds.height * sy;
            const shiftX = (oldAnchor.x - layer.width / 2 - newAnchor.x + width / 2) * (layer.flipH ? -1 : 1);
            const shiftY = (oldAnchor.y - layer.height / 2 - newAnchor.y + height / 2) * (layer.flipV ? -1 : 1);
            const angle = (layer.rotation || 0) * Math.PI / 180;
            const image = await this.imageFromCanvas(bitmap.canvas);
            const imageId = generateUUID();
            await saveImage(imageId, image.src);
            layer.x += layer.width / 2 - width / 2 + Math.cos(angle) * shiftX - Math.sin(angle) * shiftY;
            layer.y += layer.height / 2 - height / 2 + Math.sin(angle) * shiftX + Math.cos(angle) * shiftY;
            Object.assign(layer, { image, imageId, width, height,
                originalWidth: image.width, originalHeight: image.height,
                annotation: { ...spec, bitmapBounds: bitmap.bounds }, name: this.layerName(spec) });
            this.canvas.imageCache.set(imageId, image.src);
            this.canvas.canvasLayers.invalidateProcessedImageCache(layer.id);
            this.canvas.saveState();
            this.canvas.render();
            this.canvas.canvasLayersPanel.onLayersChanged();
        });
    }

    layerName(spec) {
        if (spec.kind === 'marker') return `${text('Numbered marker')} ${spec.number}`;
        return text(spec.kind === 'arrow' ? 'Draw arrow' : SHAPES.find(([kind]) => kind === spec.kind)?.[1] || 'Polygon');
    }

    bitmap(spec) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const bounds = annotationBounds(ctx, spec);
        canvas.width = Math.max(1, bounds.width);
        canvas.height = Math.max(1, bounds.height);
        ctx.translate(-bounds.x, -bounds.y);
        drawAnnotation(ctx, spec);
        return { canvas, bounds };
    }

    async imageFromCanvas(canvas) {
        const image = new Image();
        image.src = canvas.toDataURL('image/png');
        await image.decode();
        return image;
    }

    async addAnnotation(spec) {
        const bitmap = this.bitmap(spec);
        const image = await this.imageFromCanvas(bitmap.canvas);
        return this.canvas.canvasLayers.addLayerWithImage(image, {
            name: this.layerName(spec), x: bitmap.bounds.x, y: bitmap.bounds.y,
            annotation: { ...spec, bitmapBounds: bitmap.bounds }
        });
    }

    enqueue(operation) {
        this.pending = this.pending.then(operation).catch((error) => {
            this.error = error;
            this.options.onError(error);
        });
    }

    async flush() {
        if (this.points.length >= 3) this.finishPolygon();
        await this.pending;
        if (this.error) throw this.error;
    }

    reset() {
        this.cancelDraft();
        this.editingId = null;
        this.nextNumber = 1;
        this.numberField.value = 1;
        this.error = null;
        this.refreshControls();
    }

    syncAfterHistory(previousMarkers) {
        const markers = this.canvas.layers.filter((layer) => layer.annotation?.kind === 'marker');
        const signature = markers.map((layer) => `${layer.id}:${layer.annotation.number}`).join(',');
        if (signature === previousMarkers) return;
        this.editingId = null;
        this.nextNumber = Math.min(9999, Math.max(0, ...markers.map((layer) => layer.annotation.number)) + 1);
        this.numberField.value = this.nextNumber;
        this.refreshControls();
    }
}
