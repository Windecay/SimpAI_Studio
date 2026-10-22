import { generateUUID } from './utils/CommonUtils.js?v=patch26';

function surface(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
}

export class LayerMasks {
    constructor(canvas) {
        this.canvas = canvas;
        this.sources = new Map();
        this.composites = new Map();
        this.activeLayerId = null;
        this.editing = false;
        this.restore = false;
        this.erasing = false;
        this.opacity = 1;
        this.hardness = 1;
        this.stroke = null;
        this.strokeRequest = 0;
        this.pending = new Set();
        this.onTargetChange = null;
    }

    get activeLayer() {
        return this.canvas.layers.find((layer) => layer.id === this.activeLayerId && layer.layerMask) || null;
    }

    get isEditing() {
        return this.editing && !!this.activeLayer;
    }

    notify(activate = false) {
        this.onTargetChange?.(activate);
        this.canvas.canvasLayersPanel?.onSelectionChanged();
    }

    activate(layer) {
        if (!layer?.layerMask) return;
        this.cancelStroke();
        this.activeLayerId = layer.id;
        this.editing = true;
        this.canvas.updateSelection([layer]);
        this.notify(true);
    }

    setEditing(enabled) {
        if (!enabled) this.cancelStroke();
        this.editing = !!enabled && !!this.activeLayer;
        this.notify(false);
    }

    selectImage() {
        this.cancelStroke();
        this.activeLayerId = null;
        this.editing = false;
        this.notify(false);
    }

    syncSelection(selection) {
        if (this.activeLayerId && (selection.length !== 1 || selection[0].id !== this.activeLayerId || !selection[0].layerMask)) {
            this.selectImage();
        }
        this.prune();
    }

    add(layer) {
        if (!layer || !this.canvas.layers.includes(layer)) return;
        if (!layer.layerMask) {
            const bitmap = surface(layer.originalWidth || layer.image.width, layer.originalHeight || layer.image.height);
            const ctx = bitmap.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, bitmap.width, bitmap.height);
            this.store(layer, bitmap);
        }
        this.activate(layer);
    }

    store(layer, bitmap, enabled = layer.layerMask?.enabled !== false) {
        const snapshot = surface(bitmap.width, bitmap.height);
        snapshot.getContext('2d').drawImage(bitmap, 0, 0);
        const source = snapshot.toDataURL('image/png');
        if (layer.layerMask?.source === source && layer.layerMask.enabled === enabled) return;
        const mask = { id: generateUUID(), source, enabled };
        // Alpha stores visibility: opaque white shows the source, transparent pixels hide it.
        this.canvas.saveState(false, 'layers');
        layer.layerMask = mask;
        this.sources.set(mask.id, { image: snapshot, promise: Promise.resolve(snapshot) });
        this.changed(layer);
    }

    changed(layer) {
        this.invalidate(layer.id);
        this.prune();
        this.canvas.saveState(false, 'layers');
        this.canvas.render();
        this.canvas.canvasLayersPanel?.onLayersChanged();
        this.notify(false);
    }

    toggle(layer) {
        if (!layer?.layerMask) return;
        this.cancelStroke();
        this.canvas.saveState(false, 'layers');
        layer.layerMask = { ...layer.layerMask, enabled: layer.layerMask.enabled === false };
        this.changed(layer);
    }

    remove(layer) {
        if (!layer?.layerMask) return;
        this.cancelStroke();
        this.canvas.saveState(false, 'layers');
        delete layer.layerMask;
        if (this.activeLayerId === layer.id) this.selectImage();
        this.changed(layer);
    }

    invert(layer) {
        const operation = this.invertMask(layer);
        this.pending.add(operation);
        operation.then(() => this.pending.delete(operation), () => this.pending.delete(operation));
        return operation;
    }

    async invertMask(layer) {
        if (!layer?.layerMask) return;
        this.cancelStroke();
        const original = layer.layerMask;
        const image = await this.load(original);
        if (!this.canvas.layers.includes(layer) || layer.layerMask !== original) return;
        const bitmap = surface(image.width, image.height);
        const ctx = bitmap.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, bitmap.width, bitmap.height);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.drawImage(image, 0, 0);
        this.store(layer, bitmap);
    }

    load(mask) {
        const known = this.sources.get(mask.id);
        if (known) return known.promise;
        const entry = { image: null, promise: null };
        entry.promise = (async () => {
            const image = new Image();
            image.src = mask.source;
            await image.decode();
            entry.image = image;
            return image;
        })();
        this.sources.set(mask.id, entry);
        return entry.promise;
    }

    async prepare(layers = this.canvas.layers) {
        await Promise.all(this.pending);
        await Promise.all(layers.filter((layer) => layer.layerMask && layer.layerMask.enabled !== false)
            .map((layer) => this.load(layer.layerMask)));
    }

    renderKey(layer) {
        if (!layer.layerMask) return 'none';
        if (layer.layerMask.enabled === false) return 'disabled';
        return layer.layerMask.id + (this.stroke?.layer === layer ? ':' + this.stroke.revision : '');
    }

    renderLayer(layer) {
        if (layer.__layerMaskRendered || !layer.layerMask || layer.layerMask.enabled === false) return layer;
        const mask = layer.layerMask;
        let source = this.stroke?.layer === layer ? this.stroke.bitmap : this.sources.get(mask.id)?.image;
        let composite = this.composites.get(layer.id);
        const width = layer.originalWidth || layer.image.width;
        const height = layer.originalHeight || layer.image.height;
        if (!composite || composite.bitmap.width !== width || composite.bitmap.height !== height) {
            composite = { bitmap: surface(width, height), key: null, image: null };
            this.composites.set(layer.id, composite);
        }
        const key = this.renderKey(layer);
        if (!source) {
            // Keep masked content hidden until decoding completes, including immediately after undo.
            composite.bitmap.getContext('2d').clearRect(0, 0, width, height);
            if (!this.sources.has(mask.id)) {
                this.load(mask).then(() => { this.invalidate(layer.id); this.canvas.render(); })
                    .catch((error) => console.error('Layer mask decode failed:', error));
            } else {
                this.sources.get(mask.id).promise.then(() => { this.invalidate(layer.id); this.canvas.render(); }).catch(() => {});
            }
            composite.key = null;
        } else if (composite.key !== key || composite.image !== layer.image || composite.imageId !== layer.imageId) {
            const ctx = composite.bitmap.getContext('2d');
            ctx.globalCompositeOperation = 'source-over';
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(layer.image, 0, 0, width, height);
            ctx.globalCompositeOperation = 'destination-in';
            ctx.drawImage(source, 0, 0, width, height);
            ctx.globalCompositeOperation = 'source-over';
            composite.key = key;
            composite.image = layer.image;
            composite.imageId = layer.imageId;
        }
        return { ...layer, image: composite.bitmap, __layerMaskRendered: true };
    }

    invalidate(layerId) {
        const composite = this.composites.get(layerId);
        if (composite) composite.key = null;
        this.canvas.canvasLayers?.invalidateProcessedImageCache(layerId);
    }

    prune() {
        const ids = new Set(this.canvas.layers.map((layer) => layer.layerMask?.id).filter(Boolean));
        for (const id of this.sources.keys()) if (!ids.has(id)) this.sources.delete(id);
        const layers = new Set(this.canvas.layers.map((layer) => layer.id));
        for (const id of this.composites.keys()) if (!layers.has(id)) {
            this.composites.delete(id);
            this.canvas.canvasLayers?.invalidateProcessedImageCache(id);
        }
    }

    historyChanged() {
        this.cancelStroke();
        this.prune();
        this.syncSelection(this.canvas.canvasSelection.selectedLayers);
        for (const layer of this.canvas.layers) this.invalidate(layer.id);
        this.notify(false);
    }

    async beginStroke(layer) {
        this.cancelStroke();
        const request = this.strokeRequest;
        const mask = layer.layerMask;
        const image = await this.load(mask);
        if (request !== this.strokeRequest || this.activeLayer !== layer || layer.layerMask !== mask) return null;
        const bitmap = surface(layer.originalWidth || layer.image.width, layer.originalHeight || layer.image.height);
        bitmap.getContext('2d').drawImage(image, 0, 0, bitmap.width, bitmap.height);
        this.stroke = { layer, mask, bitmap, revision: 0, changed: false };
        return this.stroke;
    }

    drawStroke(from, to, size) {
        const stroke = this.stroke;
        if (!stroke || !from || !to || this.opacity <= 0) return;
        const ctx = stroke.bitmap.getContext('2d');
        const radius = Math.max(0.5, size / 2);
        const scaleX = to.scaleX || 1;
        const scaleY = to.scaleY || 1;
        const distance = Math.hypot((to.x - from.x) / scaleX, (to.y - from.y) / scaleY);
        const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.3)));
        ctx.save();
        ctx.globalCompositeOperation = this.restore || this.erasing ? 'source-over' : 'destination-out';
        for (let index = 1; index <= steps; index++) {
            const x = from.x + (to.x - from.x) * index / steps;
            const y = from.y + (to.y - from.y) * index / steps;
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(radius * scaleX, radius * scaleY);
            if (this.hardness >= 0.99) ctx.fillStyle = `rgba(255,255,255,${this.opacity})`;
            else {
                const gradient = ctx.createRadialGradient(0, 0, this.hardness, 0, 0, 1);
                gradient.addColorStop(0, `rgba(255,255,255,${this.opacity})`);
                gradient.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = gradient;
            }
            ctx.beginPath();
            ctx.arc(0, 0, 1, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
        stroke.revision++;
        stroke.changed = true;
        this.invalidate(stroke.layer.id);
        this.canvas.render();
    }

    commitStroke() {
        const stroke = this.stroke;
        this.stroke = null;
        this.strokeRequest++;
        if (!stroke?.changed || !this.canvas.layers.includes(stroke.layer) || stroke.layer.layerMask !== stroke.mask) return;
        this.store(stroke.layer, stroke.bitmap);
    }

    cancelStroke() {
        const stroke = this.stroke;
        this.stroke = null;
        this.strokeRequest++;
        if (stroke) {
            this.invalidate(stroke.layer.id);
            this.canvas.render();
        }
    }

    pointForLayer(layer, world) {
        const width = layer.width;
        const height = layer.height;
        if (!world || width <= 0 || height <= 0) return null;
        const dx = world.x - layer.x - width / 2;
        const dy = world.y - layer.y - height / 2;
        const angle = -(layer.rotation || 0) * Math.PI / 180;
        const x = (dx * Math.cos(angle) - dy * Math.sin(angle)) * (layer.flipH ? -1 : 1) + width / 2;
        const y = (dx * Math.sin(angle) + dy * Math.cos(angle)) * (layer.flipV ? -1 : 1) + height / 2;
        const imageWidth = layer.originalWidth || layer.image.width;
        const imageHeight = layer.originalHeight || layer.image.height;
        return { x: x * imageWidth / width, y: y * imageHeight / height,
            scaleX: imageWidth / width, scaleY: imageHeight / height };
    }
}
