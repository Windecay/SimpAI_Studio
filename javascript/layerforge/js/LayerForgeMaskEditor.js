import { createCanvas } from "./utils/CommonUtils.js?v=patch26";
import { isEditingText, nextBrushSize } from "./KeyboardUtils.js?v=patch1";

export class LayerForgeMaskEditor {
    constructor() {
        this.overlay = null;
        this.container = null;
        this.bgCanvas = null;
        this.maskCanvas = null;
        this.maskDisplayCanvas = null;
        this.cursorCanvas = null;
        this.ctx = null;
        this.maskCtx = null;
        this.maskDisplayCtx = null;
        this.cursorCtx = null;
        this.maskPatternCanvas = null;
        
        this.scale = 1;
        this.panX = 0;
        this.panY = 0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        
        this.isDrawing = false;
        this.brushSize = 20;
        this.brushHardness = 1.0;
        this.brushOpacity = 1.0;
        this.isEraser = false;
        this.resolvePromise = null;
        this.lastAnchorPos = null;
        
        this.history = [];
        this.historyIndex = -1;
        this.spacePanActive = false;
        this.handToolActive = false;
        this.boundHandlePointerDown = (event) => this.handlePointerDown(event);
        this.boundHandlePointerMove = (event) => this.handlePointerMove(event);
        this.boundHandlePointerUp = (event) => this.handlePointerUp(event);
        this.boundHandleKeyDown = (event) => this.handleKeyDown(event);
        this.boundHandleKeyUp = (event) => {
            if (event.code === 'Space') {
                this.spacePanActive = false;
                this.updateToolCursor();
            }
        };
        this.boundHandleBlur = () => {
            this.spacePanActive = false;
            this.handlePointerUp();
            this.updateToolCursor();
        };
        this.boundHandleWheel = (event) => this.handleWheel(event);
        
        this.injectCSS();
    }

    getMaskPatternCanvas() {
        if (this.maskPatternCanvas)
            return this.maskPatternCanvas;
        const tile = 6;
        const canvas = document.createElement('canvas');
        canvas.width = tile * 2;
        canvas.height = tile * 2;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.fillRect(0, 0, tile, tile);
        ctx.fillRect(tile, tile, tile, tile);
        this.maskPatternCanvas = canvas;
        return canvas;
    }

    refreshMaskDisplay() {
        if (!this.maskCanvas || !this.maskDisplayCanvas || !this.maskDisplayCtx)
            return;
        const width = this.maskDisplayCanvas.width;
        const height = this.maskDisplayCanvas.height;
        if (!width || !height)
            return;
        const patternCanvas = this.getMaskPatternCanvas();
        const pattern = patternCanvas ? this.maskDisplayCtx.createPattern(patternCanvas, 'repeat') : null;
        this.maskDisplayCtx.save();
        this.maskDisplayCtx.setTransform(1, 0, 0, 1, 0, 0);
        this.maskDisplayCtx.globalAlpha = 1;
        this.maskDisplayCtx.globalCompositeOperation = 'source-over';
        this.maskDisplayCtx.clearRect(0, 0, width, height);
        this.maskDisplayCtx.fillStyle = pattern || 'rgba(255,255,255,0.70)';
        this.maskDisplayCtx.fillRect(0, 0, width, height);
        this.maskDisplayCtx.globalCompositeOperation = 'destination-in';
        this.maskDisplayCtx.drawImage(this.maskCanvas, 0, 0);
        this.maskDisplayCtx.globalCompositeOperation = 'source-over';
        this.maskDisplayCtx.restore();
    }

    injectCSS() {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = new URL('./css/layerforge_mask_editor.css?v=patch63', import.meta.url).href;
        document.head.appendChild(link);
    }

    createUI() {
        if (this.overlay) return;

        this.overlay = document.createElement('div');
        this.overlay.className = 'layerforge-mask-editor-overlay';
        this.overlay.dataset.layerforgeMaskEditorVersion = 'white-checker-mask-3';
        
        // Toolbar
        const toolbar = document.createElement('div');
        toolbar.className = 'layerforge-mask-editor-toolbar';
        
        const tools = document.createElement('div');
        tools.className = 'layerforge-mask-editor-tools';
        
        // Brush Button
        this.brushBtn = document.createElement('button');
        this.brushBtn.className = 'layerforge-mask-editor-button active';
        this.brushBtn.textContent = 'Brush';
        this.brushBtn.onclick = () => this.setTool('brush');
        
        // Eraser Button
        this.eraserBtn = document.createElement('button');
        this.eraserBtn.className = 'layerforge-mask-editor-button';
        this.eraserBtn.textContent = 'Eraser';
        this.eraserBtn.onclick = () => this.setTool('eraser');
        
        // Size Slider
        const sliderContainer = document.createElement('div');
        sliderContainer.className = 'layerforge-mask-editor-slider-container';
        sliderContainer.textContent = 'Size: ';
        
        this.sizeSlider = document.createElement('input');
        this.sizeSlider.type = 'range';
        this.sizeSlider.min = '1';
        this.sizeSlider.max = '200';
        this.sizeSlider.value = this.brushSize;
        this.sizeSlider.className = 'layerforge-mask-editor-slider';
        this.sizeSlider.oninput = (e) => this.brushSize = parseInt(e.target.value);
        
        sliderContainer.appendChild(this.sizeSlider);

        // Opacity Slider
        const opacityContainer = document.createElement('div');
        opacityContainer.className = 'layerforge-mask-editor-slider-container';
        opacityContainer.textContent = 'Opacity: ';
        
        this.opacitySlider = document.createElement('input');
        this.opacitySlider.type = 'range';
        this.opacitySlider.min = '0.1';
        this.opacitySlider.max = '1.0';
        this.opacitySlider.step = '0.1';
        this.opacitySlider.value = this.brushOpacity;
        this.opacitySlider.className = 'layerforge-mask-editor-slider';
        this.opacitySlider.oninput = (e) => this.brushOpacity = parseFloat(e.target.value);
        
        opacityContainer.appendChild(this.opacitySlider);

        // Hardness Slider
        const hardnessContainer = document.createElement('div');
        hardnessContainer.className = 'layerforge-mask-editor-slider-container';
        hardnessContainer.textContent = 'Hardness: ';
        
        this.hardnessSlider = document.createElement('input');
        this.hardnessSlider.type = 'range';
        this.hardnessSlider.min = '0';
        this.hardnessSlider.max = '1.0';
        this.hardnessSlider.step = '0.1';
        this.hardnessSlider.value = this.brushHardness;
        this.hardnessSlider.className = 'layerforge-mask-editor-slider';
        this.hardnessSlider.oninput = (e) => this.brushHardness = parseFloat(e.target.value);
        
        hardnessContainer.appendChild(this.hardnessSlider);
        
        // Clear Button
        const clearBtn = document.createElement('button');
        clearBtn.className = 'layerforge-mask-editor-button';
        clearBtn.textContent = 'Clear';
        clearBtn.onclick = () => this.clearMask();

        tools.append(this.brushBtn, this.eraserBtn, sliderContainer, opacityContainer, hardnessContainer, clearBtn);
        
        const actions = document.createElement('div');
        actions.className = 'layerforge-mask-editor-tools';
        
        // Cancel Button
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'layerforge-mask-editor-button danger';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => this.close(null);
        
        // Save Button
        const saveBtn = document.createElement('button');
        saveBtn.className = 'layerforge-mask-editor-button primary';
        saveBtn.textContent = 'Save';
        saveBtn.onclick = () => this.save();
        
        actions.append(cancelBtn, saveBtn);
        
        toolbar.append(tools, actions);
        this.overlay.appendChild(toolbar);
        
        // Canvas Container
        this.container = document.createElement('div');
        this.container.className = 'layerforge-mask-editor-container';
        // Position absolute for centering via transform
        this.container.style.position = 'absolute';
        this.container.style.top = '50%';
        this.container.style.left = '50%';
        
        // We will create canvases when opening
        
        this.overlay.appendChild(this.container);
        document.body.appendChild(this.overlay);
        
    }

    async open(imageUrl, maskImage = null, maskContext = null) {
        this.createUI();
        this.overlay.style.display = 'flex';
        this.spacePanActive = false;
        this.handToolActive = false;
        this.isDragging = false;
        this.isDrawing = false;
        
        this.scale = 1;
        this.panX = 0;
        this.panY = 0;
        this.history = [];
        this.historyIndex = -1;
        
        const img = await this.loadImage(imageUrl);
        
        let mImg = null;
        if (maskImage) {
            if (!(maskImage instanceof HTMLImageElement) && !(maskImage instanceof HTMLCanvasElement)) {
                 mImg = await this.loadImage(maskImage);
            } else {
                 mImg = maskImage;
            }
        }
        
        let finalWidth = img.width;
        let finalHeight = img.height;
        
        let maskX = 0;
        let maskY = 0;
        let imgX = 0;
        let imgY = 0;
        
        if (mImg) {
            if (mImg.width !== finalWidth || mImg.height !== finalHeight) {
                const outputBounds = maskContext?.outputAreaBounds;
                const maskDrawingAreaBounds = maskContext?.maskDrawingAreaBounds;

                const hasBounds = outputBounds && maskDrawingAreaBounds &&
                    Number.isFinite(outputBounds.x) &&
                    Number.isFinite(outputBounds.y) &&
                    Number.isFinite(outputBounds.width) &&
                    Number.isFinite(outputBounds.height) &&
                    Number.isFinite(maskDrawingAreaBounds.x) &&
                    Number.isFinite(maskDrawingAreaBounds.y) &&
                    Number.isFinite(maskDrawingAreaBounds.width) &&
                    Number.isFinite(maskDrawingAreaBounds.height);

                const sizeMatches = hasBounds &&
                    outputBounds.width === finalWidth &&
                    outputBounds.height === finalHeight &&
                    maskDrawingAreaBounds.width === mImg.width &&
                    maskDrawingAreaBounds.height === mImg.height;

                if (sizeMatches) {
                    maskX = Math.round(maskDrawingAreaBounds.x - outputBounds.x);
                    maskY = Math.round(maskDrawingAreaBounds.y - outputBounds.y);
                } else {
                    maskX = 0;
                    maskY = 0;
                }
            } else {
            }
        }
        
        this.width = finalWidth;
        this.height = finalHeight;
        
        const maxW = window.innerWidth * 0.95;
        const maxH = window.innerHeight * 0.9;
        const scaleW = maxW / this.width;
        const scaleH = maxH / this.height;
        
        const minScale = Math.min(scaleW, scaleH);
        
        if (minScale >= 0.8) {
            this.scale = 1;
        } else {
            this.scale = minScale;
        }
        
        this.updateTransform();
        
        this.container.innerHTML = '';
        
        const bg = createCanvas(this.width, this.height);
        this.bgCanvas = bg.canvas;
        this.bgCanvas.className = 'layerforge-mask-editor-canvas-layer';
        this.bgCanvas.style.zIndex = '10';
        this.bgCtx = bg.ctx;
        this.bgCtx.drawImage(img, imgX, imgY);
        this.container.appendChild(this.bgCanvas);
        
        const mask = createCanvas(this.width, this.height);
        this.maskCanvas = mask.canvas;
        this.maskCanvas.className = 'layerforge-mask-editor-canvas-layer layerforge-mask-editor-mask-data';
        this.maskCanvas.dataset.layerforgeMaskData = 'true';
        this.maskCanvas.style.display = 'none';
        this.maskCanvas.style.pointerEvents = 'none';
        this.maskCtx = mask.ctx;

        const maskDisplay = createCanvas(this.width, this.height);
        this.maskDisplayCanvas = maskDisplay.canvas;
        this.maskDisplayCanvas.className = 'layerforge-mask-editor-canvas-layer layerforge-mask-editor-mask-display';
        this.maskDisplayCanvas.dataset.layerforgeMaskDisplay = 'true';
        this.maskDisplayCanvas.style.pointerEvents = 'none';
        this.maskDisplayCanvas.style.zIndex = '20';
        this.maskDisplayCtx = maskDisplay.ctx;
        this.container.appendChild(this.maskDisplayCanvas);
        
        if (mImg) {
            this.maskCtx.drawImage(mImg, maskX, maskY);
            this.refreshMaskDisplay();
            
        }
        this.saveState();

        const cursor = createCanvas(this.width, this.height);
        this.cursorCanvas = cursor.canvas;
        this.cursorCanvas.className = 'layerforge-mask-editor-canvas-layer';
        this.cursorCanvas.style.zIndex = '30';
        this.cursorCtx = cursor.ctx;
        this.container.appendChild(this.cursorCanvas);
        this.updateTransform();
        this.refreshMaskDisplay();
        
        this.cursorCanvas.addEventListener('pointerdown', this.boundHandlePointerDown);
        window.addEventListener('pointermove', this.boundHandlePointerMove);
        window.addEventListener('pointerup', this.boundHandlePointerUp);
        window.addEventListener('keydown', this.boundHandleKeyDown, { capture: true });
        window.addEventListener('keyup', this.boundHandleKeyUp, { capture: true });
        window.addEventListener('blur', this.boundHandleBlur);
        this.overlay.addEventListener('wheel', this.boundHandleWheel, { passive: false });
        this.setTool('brush');
        
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
        });
    }
    
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            if (typeof src === 'string') img.src = src;
            else resolve(src); // already an element or blob?
        });
    }
    
    close(result) {
        if (this.overlay) {
            this.overlay.style.display = 'none';
        }
        
        // Remove Listeners
        if (this.boundHandlePointerDown) {
            if (this.cursorCanvas) {
                this.cursorCanvas.removeEventListener('pointerdown', this.boundHandlePointerDown);
            }
            window.removeEventListener('pointermove', this.boundHandlePointerMove);
            window.removeEventListener('pointerup', this.boundHandlePointerUp);
            window.removeEventListener('keydown', this.boundHandleKeyDown, { capture: true });
            window.removeEventListener('keyup', this.boundHandleKeyUp, { capture: true });
            window.removeEventListener('blur', this.boundHandleBlur);
            if (this.overlay) {
                this.overlay.removeEventListener('wheel', this.boundHandleWheel);
            }
        }

        if (this.resolvePromise) {
            this.resolvePromise(result);
            this.resolvePromise = null;
        }
    }
    
    save() {
        // Return the mask canvas
        // We can return a Blob or the canvas itself. 
        // MaskEditorIntegration expects an Image or Canvas probably.
        // Let's return the canvas, the integration can convert it.
        this.close(this.maskCanvas);
    }
    
    setTool(tool) {
        this.handToolActive = false;
        this.isEraser = (tool === 'eraser');
        this.brushBtn.classList.toggle('active', !this.isEraser);
        this.eraserBtn.classList.toggle('active', this.isEraser);
        this.updateToolCursor();
    }

    updateToolCursor() {
        if (this.cursorCanvas) this.cursorCanvas.style.cursor = this.isDragging ? 'grabbing'
            : this.spacePanActive || this.handToolActive ? 'grab' : 'crosshair';
    }
    
    clearMask() {
        this.maskCtx.clearRect(0, 0, this.width, this.height);
        this.refreshMaskDisplay();
        this.saveState();
    }
    
    updateTransform() {
        if (!this.container) return;
        this.container.style.width = `${this.width}px`;
        this.container.style.height = `${this.height}px`;
        
        // Center + Pan + Scale
        // We use transform to handle everything
        this.container.style.transform = `translate(calc(-50% + ${this.panX}px), calc(-50% + ${this.panY}px)) scale(${this.scale})`;
        this.container.style.transformOrigin = 'center center';
        
        // Ensure canvases fill the container and stack correctly
        [this.bgCanvas, this.maskDisplayCanvas, this.cursorCanvas].forEach(c => {
            if (c) {
                c.style.width = '100%';
                c.style.height = '100%';
                c.style.position = 'absolute';
                c.style.top = '0';
                c.style.left = '0';
            }
        });
    }
    
    // Interaction Handlers
    
    handleWheel(e) {
        if (!this.overlay || this.overlay.style.display === 'none') return;
        
        e.preventDefault();
        e.stopPropagation();

        // Adjust Brush Size: Ctrl + Wheel
        if (e.ctrlKey || e.metaKey) {
            const delta = -Math.sign(e.deltaY) * 5;
            const newSize = Math.max(1, Math.min(200, this.brushSize + delta));
            this.brushSize = newSize;
            if (this.sizeSlider) {
                this.sizeSlider.value = newSize;
            }
            // Trigger cursor update
            const pos = this.getPointerPos(e);
            this.updateCursor(pos.x, pos.y);
        } 
        // Zoom: Wheel (No Modifier)
        else {
            const delta = -Math.sign(e.deltaY) * 0.1;
            const newScale = Math.max(0.1, Math.min(10, this.scale + delta));
            this.scale = newScale;
            this.updateTransform();
        }
    }
    
    getPointerPos(e) {
        const rect = this.container.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / this.scale,
            y: (e.clientY - rect.top) / this.scale
        };
    }
    
    handlePointerDown(e) {
        if (e.button === 1 || (e.button === 0 && (e.altKey || this.spacePanActive || this.handToolActive))) {
            this.isDragging = true;
            this.updateToolCursor();
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            e.preventDefault();
            return;
        }
        
        if (e.button === 0) {
            const pos = this.getPointerPos(e);
            if (e.shiftKey && this.lastAnchorPos) {
                this.isDrawing = false;
                this.lastDrawPos = this.lastAnchorPos;
                this.draw(pos.x, pos.y);
                this.lastDrawPos = pos;
                this.lastAnchorPos = pos;
                this.saveState();
                return;
            }
            this.isDrawing = true;
            this.lastDrawPos = pos;
            this.lastAnchorPos = pos;
            this.drawDot(pos.x, pos.y);
        }
    }

    drawDot(x, y, refresh = true) {
        // Safety check
        if (typeof this.brushOpacity === 'undefined') this.brushOpacity = 1.0;
        if (typeof this.brushHardness === 'undefined') this.brushHardness = 1.0;

        // Note: isEraser handling
        // If eraser, we usually use destination-out. 
        // ShadowBlur with destination-out is tricky in some browsers.
        // Standard approach for soft eraser:
        // 1. Set globalCompositeOperation = 'destination-out'
        // 2. Set fillStyle = 'rgba(0,0,0,1)' (color doesn't matter for dest-out, alpha does)
        // 3. Set shadowColor = 'rgba(0,0,0,1)'
        // 4. Set shadowBlur.
        
        // For Brush (source-over):
        // We use radial gradient for smoother hardness falloff
        
        this.maskCtx.save(); // Save context state
        
        const radius = this.brushSize / 2;
        
        if (this.isEraser) {
            this.maskCtx.globalCompositeOperation = 'destination-out';
            
            if (this.brushHardness >= 0.99) {
                this.maskCtx.fillStyle = 'white';
                this.maskCtx.beginPath();
                this.maskCtx.arc(x, y, radius, 0, Math.PI * 2);
                this.maskCtx.fill();
            } else {
                const gradient = this.maskCtx.createRadialGradient(x, y, 0, x, y, radius);
                const solidRadiusRatio = this.brushHardness;
                
                gradient.addColorStop(0, 'rgba(0,0,0,1)');
                gradient.addColorStop(Math.max(0, solidRadiusRatio), 'rgba(0,0,0,1)');
                gradient.addColorStop(1, 'rgba(0,0,0,0)');
                
                this.maskCtx.fillStyle = gradient;
                this.maskCtx.beginPath();
                this.maskCtx.arc(x, y, radius, 0, Math.PI * 2);
                this.maskCtx.fill();
            }
        } else {
            this.maskCtx.globalCompositeOperation = 'source-over';
            
            if (this.brushHardness >= 0.99) {
                // Hard brush
                this.maskCtx.fillStyle = `rgba(255,255,255,${this.brushOpacity})`;
                this.maskCtx.beginPath();
                this.maskCtx.arc(x, y, radius, 0, Math.PI * 2);
                this.maskCtx.fill();
            } else {
                // Soft brush using gradient
                const gradient = this.maskCtx.createRadialGradient(x, y, 0, x, y, radius);
                const solidRadiusRatio = this.brushHardness;
                const opacity = this.brushOpacity;
                
                gradient.addColorStop(0, `rgba(255,255,255,${opacity})`);
                gradient.addColorStop(Math.max(0, solidRadiusRatio), `rgba(255,255,255,${opacity})`);
                gradient.addColorStop(1, `rgba(255,255,255,0)`);
                
                this.maskCtx.fillStyle = gradient;
                this.maskCtx.beginPath();
                this.maskCtx.arc(x, y, radius, 0, Math.PI * 2);
                this.maskCtx.fill();
            }
        }
        
        this.maskCtx.restore();
        if (refresh) {
            this.refreshMaskDisplay();
        }
    }
    
    handlePointerMove(e) {
        if (this.isDragging) {
            const dx = e.clientX - this.lastMouseX;
            const dy = e.clientY - this.lastMouseY;
            this.panX += dx;
            this.panY += dy;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            this.updateTransform();
            e.preventDefault();
            e.stopPropagation();
            return; 
        }
        
        const pos = this.getPointerPos(e);
        this.updateCursor(pos.x, pos.y);

        if (this.isDrawing) {
            this.draw(pos.x, pos.y);
            this.lastDrawPos = pos;
        }
    }
    
    handlePointerUp(e) {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.saveState();
            if (this.lastDrawPos) {
                this.lastAnchorPos = this.lastDrawPos;
            }
        }
        this.isDragging = false;
        this.updateToolCursor();
    }
    
    handleKeyDown(e) {
        if (!this.overlay || this.overlay.style.display === 'none' || e.defaultPrevented || isEditingText(e)) return;
        const key = e.key.toLowerCase();
        const command = e.ctrlKey || e.metaKey;
        if (command && !e.altKey && key === 'z') {
            if (e.shiftKey) this.redo();
            else this.undo();
        } else if (command && !e.altKey && (key === '0' || key === '1')) {
            this.scale = key === '1' ? 1 : Math.min(10, window.innerWidth * 0.95 / this.width, window.innerHeight * 0.9 / this.height);
            this.panX = 0;
            this.panY = 0;
            this.updateTransform();
        } else if (command || e.altKey) {
            return;
        } else if (e.code === 'Space') {
            this.spacePanActive = true;
            this.updateToolCursor();
        } else if (key === 'b' && !e.shiftKey) this.setTool('brush');
        else if (key === 'e' && !e.shiftKey) this.setTool('eraser');
        else if (key === 'h' && !e.shiftKey) {
            this.handToolActive = true;
            this.brushBtn.classList.remove('active');
            this.eraserBtn.classList.remove('active');
            this.updateToolCursor();
        } else if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
            const direction = e.code === 'BracketLeft' ? -1 : 1;
            if (e.shiftKey) {
                this.brushHardness = Math.max(0, Math.min(1, this.brushHardness + direction * 0.1));
                this.hardnessSlider.value = this.brushHardness;
            } else {
                this.brushSize = nextBrushSize(this.brushSize, direction);
                this.sizeSlider.value = this.brushSize;
            }
            if (this.lastCursorPosition) this.updateCursor(this.lastCursorPosition.x, this.lastCursorPosition.y);
        } else if (e.key === 'Escape') this.close(null);
        else return;
        e.preventDefault();
        e.stopPropagation();
    }
    
    updateCursor(x, y) {
        if (!this.cursorCtx) return;
        this.lastCursorPosition = { x, y };
        this.cursorCtx.clearRect(0, 0, this.width, this.height);
        
        this.cursorCtx.beginPath();
        this.cursorCtx.arc(x, y, this.brushSize / 2, 0, Math.PI * 2);
        this.cursorCtx.strokeStyle = 'white';
        this.cursorCtx.lineWidth = 2 / this.scale;
        this.cursorCtx.stroke();
        this.cursorCtx.beginPath();
        this.cursorCtx.arc(x, y, this.brushSize / 2, 0, Math.PI * 2);
        this.cursorCtx.strokeStyle = 'black';
        this.cursorCtx.lineWidth = 1 / this.scale;
        this.cursorCtx.stroke();
    }
    
    draw(x, y) {
        if (!this.lastDrawPos) return;
        
        const dx = x - this.lastDrawPos.x;
        const dy = y - this.lastDrawPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const step = Math.max(1, this.brushSize * 0.15); 
        const steps = Math.ceil(distance / step);
        
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const cx = this.lastDrawPos.x + dx * t;
            const cy = this.lastDrawPos.y + dy * t;
            this.drawDot(cx, cy, false);
        }
        this.refreshMaskDisplay();
    }
    
    saveState() {
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        this.history.push(this.maskCanvas.toDataURL());
        this.historyIndex++;
    }
    
    undo() {
        if (this.historyIndex > 0) this.restoreHistory(this.historyIndex - 1);
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) this.restoreHistory(this.historyIndex + 1);
    }

    restoreHistory(index) {
        this.historyIndex = index;
        const target = this.maskCanvas;
        const img = new Image();
        img.onload = () => {
            if (this.historyIndex !== index || this.maskCanvas !== target) return;
            this.maskCtx.clearRect(0, 0, this.width, this.height);
            this.maskCtx.drawImage(img, 0, 0);
            this.refreshMaskDisplay();
        };
        img.src = this.history[index];
    }
}

export const layerForgeMaskEditor = new LayerForgeMaskEditor();
