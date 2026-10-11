export function referenceRect(width, height, imageWidth, imageHeight) {
    const scale = Math.min(width / imageWidth, height / imageHeight);
    const w = imageWidth * scale, h = imageHeight * scale;
    return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

export function imagePoint(x, y, rect, clamp = false) {
    const px = (x - rect.x) / rect.width, py = (y - rect.y) / rect.height;
    if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
    if (!clamp && (px < 0 || px > 1 || py < 0 || py > 1)) return null;
    return [Math.max(0, Math.min(1, px)), Math.max(0, Math.min(1, py))];
}

export function regionFromPoints(a, b) {
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
}

export class PoseRegionSelector {
    constructor(root, image, options) {
        this.root = root;
        this.image = image;
        this.options = options;
        this.boxes = [];
        this.active = false;
        this.drag = null;
        this.listeners = {
            pointerdown: event => {
                if (!this.active || event.button !== 0) return;
                event.preventDefault(); event.stopPropagation();
                const maximum = options.getMaximum();
                if (!Number.isSafeInteger(maximum) || maximum < 1 || this.boxes.length >= maximum) {
                    options.onLimit(); return;
                }
                const start = this.point(event);
                if (!start) return;
                this.drag = { id: event.pointerId, start, end: start };
                root.setPointerCapture(event.pointerId);
                this.render();
            },
            pointermove: event => {
                if (event.pointerId !== this.drag?.id) return;
                event.preventDefault(); event.stopPropagation();
                this.drag.end = this.point(event, true);
                this.render();
            },
            pointerup: event => {
                if (event.pointerId !== this.drag?.id) return;
                event.preventDefault(); event.stopPropagation();
                const box = regionFromPoints(this.drag.start, this.point(event, true));
                const rect = this.rect();
                this.cancelDrag();
                if ((box[2] - box[0]) * rect.width >= 6 && (box[3] - box[1]) * rect.height >= 6) {
                    this.boxes.push(box);
                    options.onChange(this);
                }
                this.render();
            },
            pointercancel: () => { this.cancelDrag(); this.render(); }
        };
        for (const [type, handler] of Object.entries(this.listeners)) root.addEventListener(type, handler);
        this.observer = new ResizeObserver(() => this.render());
        this.observer.observe(root.parentElement);
        this.render();
    }

    rect() {
        return referenceRect(this.root.clientWidth, this.root.clientHeight,
            this.image.naturalWidth || 1, this.image.naturalHeight || 1);
    }

    point(event, clamp = false) {
        const bounds = this.root.getBoundingClientRect();
        return imagePoint(event.clientX - bounds.left, event.clientY - bounds.top, this.rect(), clamp);
    }

    getBoxes() { return this.boxes.map(box => [...box]); }

    cancelDrag() {
        if (this.drag && this.root.hasPointerCapture(this.drag.id)) this.root.releasePointerCapture(this.drag.id);
        this.drag = null;
    }

    setActive(active) {
        this.cancelDrag();
        this.active = !!active;
        this.root.classList.toggle('is-active', this.active);
        this.options.onChange(this);
        this.render();
    }

    clear() {
        this.boxes = [];
        this.setActive(false);
    }

    render() {
        this.root.hidden = !this.active && this.boxes.length === 0;
        if (this.root.hidden) return;
        const rect = this.rect();
        const boxes = this.getBoxes();
        if (this.drag) boxes.push(regionFromPoints(this.drag.start, this.drag.end));
        this.root.replaceChildren(...boxes.map((box, index) => {
            const element = document.createElement('div');
            element.className = 'sai-pose-studio-person-region';
            Object.assign(element.style, {
                left: `${rect.x + box[0] * rect.width}px`, top: `${rect.y + box[1] * rect.height}px`,
                width: `${(box[2] - box[0]) * rect.width}px`, height: `${(box[3] - box[1]) * rect.height}px`
            });
            const label = document.createElement('span');
            label.textContent = String(index + 1);
            element.append(label);
            return element;
        }));
    }

    dispose() {
        this.cancelDrag();
        this.observer.disconnect();
        for (const [type, handler] of Object.entries(this.listeners)) this.root.removeEventListener(type, handler);
    }
}
