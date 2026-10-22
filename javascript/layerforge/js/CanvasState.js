import { getCanvasState, setCanvasState, saveImage, getImage } from "./db.js?v=patch26";
import { createModuleLogger } from "./utils/LoggerUtils.js?v=patch26";
import { showAlertNotification } from "./utils/NotificationUtils.js?v=patch26";
import { generateUUID, cloneLayers, getStateSignature, debounce, createCanvas } from "./utils/CommonUtils.js?v=patch26";
const log = createModuleLogger('CanvasState');
const layerStateSignature = (layers) => getStateSignature(layers) + JSON.stringify(layers.map((layer) =>
    layer.layerMask ? [layer.layerMask.id, layer.layerMask.enabled !== false] : null));
export class CanvasState {
    constructor(canvas) {
        this.canvas = canvas;
        this.layersUndoStack = [];
        this.layersRedoStack = [];
        this.maskUndoStack = [];
        this.maskRedoStack = [];
        this.historyLimit = 100;
        this.saveTimeout = null;
        this.lastSavedStateSignature = null;
        this._loadInProgress = null;
        this._debouncedSave = null;
        this.lastLoadResult = null;
        try {
            this.stateSaverWorker = new Worker(new URL('./state-saver.worker.js?v=patch26', import.meta.url), { type: 'module' });
            this.stateSaverWorker.onmessage = () => { };
            this.stateSaverWorker.onerror = (e) => {
                log.error("Error in state saver worker:", e.message, e.filename, e.lineno);
                this.stateSaverWorker = null;
            };
        }
        catch (e) {
            log.error("Failed to initialize state saver worker:", e);
            this.stateSaverWorker = null;
        }
    }
    async loadStateFromDB() {
        if (this._loadInProgress) {
            log.warn("Load already in progress, waiting...");
            return this._loadInProgress;
        }
        const loadPromise = this._performLoad();
        this._loadInProgress = loadPromise;
        try {
            const result = await loadPromise;
            this._loadInProgress = null;
            return result;
        }
        catch (error) {
            this._loadInProgress = null;
            throw error;
        }
    }
    async _performLoad() {
        this.lastLoadResult = null;
        try {
            if (!this.canvas.node.id) {
                log.error("Node ID is not available for loading state from DB.");
                return false;
            }
            const savedState = await getCanvasState(String(this.canvas.node.id));
            if (!savedState) {
                return false;
            }
            this.canvas.width = savedState.width || 512;
            this.canvas.height = savedState.height || 512;
            this.canvas.viewport = savedState.viewport || {
                x: -(this.canvas.width / 4),
                y: -(this.canvas.height / 4),
                zoom: 0.8
            };
            if (savedState.outputAreaBounds) {
                this.canvas.outputAreaBounds = savedState.outputAreaBounds;
            }
            else {
                this.canvas.outputAreaBounds = {
                    x: -(this.canvas.width / 4),
                    y: -(this.canvas.height / 4),
                    width: this.canvas.width,
                    height: this.canvas.height
                };
            }
            this.canvas.canvasLayers.updateOutputAreaSize(this.canvas.width, this.canvas.height, false);
            const loadedLayers = await this._loadLayers(savedState.layers);
            const missing = loadedLayers.filter(layer => layer === null).length;
            this.lastLoadResult = { ok: missing === 0, partial: missing > 0,
                loadedLayers: loadedLayers.length - missing, missingLayers: missing };
            this.canvas.layers = loadedLayers.filter((l) => l !== null);
            await this.canvas.layerMasks.prepare(this.canvas.layers);
            this.canvas.updateSelectionAfterHistory();
            this.canvas.render();
            this.canvas.canvasLayersPanel?.onLayersChanged();
            if (missing) {
                const message = 'Canvas partially restored: {loaded} layers loaded, {missing} images missing.';
                showAlertNotification((window.LayerForgeI18n?.text(message) || message)
                    .replace('{loaded}', String(this.canvas.layers.length)).replace('{missing}', String(missing)), 6000);
                return false;
            }
            return true;
        }
        catch (error) {
            log.error("Error during state load:", error);
            return false;
        }
    }
    /**
     * Ładuje warstwy z zapisanego stanu
     * @param {any[]} layersData - Dane warstw do załadowania
     * @returns {Promise<(Layer | null)[]>} Załadowane warstwy
     */
    async _loadLayers(layersData) {
        const imagePromises = layersData.map((layerData, index) => this._loadSingleLayer(layerData, index));
        return Promise.all(imagePromises);
    }
    /**
     * Ładuje pojedynczą warstwę
     * @param {any} layerData - Dane warstwy
     * @param {number} index - Indeks warstwy
     * @returns {Promise<Layer | null>} Załadowana warstwa lub null
     */
    async _loadSingleLayer(layerData, index) {
        return new Promise((resolve) => {
            if (layerData.imageId) {
                this._loadLayerFromImageId(layerData, index, resolve);
            }
            else if (layerData.imageSrc) {
                this._convertLegacyLayer(layerData, index, resolve);
            }
            else {
                log.error(`Layer ${index}: No imageId or imageSrc found, skipping layer.`);
                resolve(null);
            }
        });
    }
    /**
     * Ładuje warstwę z imageId
     * @param {any} layerData - Dane warstwy
     * @param {number} index - Indeks warstwy
     * @param {(value: Layer | null) => void} resolve - Funkcja resolve
     */
    _loadLayerFromImageId(layerData, index, resolve) {
        if (this.canvas.imageCache.has(layerData.imageId)) {
            const imageData = this.canvas.imageCache.get(layerData.imageId);
            if (typeof imageData === 'string') {
                this._createLayerFromSrc(layerData, imageData, index, resolve);
            }
            else if (imageData) {
                const imageSrc = URL.createObjectURL(new Blob([imageData.data]));
                this._createLayerFromSrc(layerData, imageSrc, index, resolve);
            }
            else {
                resolve(null);
            }
        }
        else {
            getImage(layerData.imageId)
                .then(imageSrc => {
                if (imageSrc) {
                    this._createLayerFromSrc(layerData, imageSrc, index, resolve);
                }
                else {
                    log.error(`Layer ${index}: Image not found in IndexedDB.`);
                    resolve(null);
                }
            })
                .catch(err => {
                log.error(`Layer ${index}: Error loading image from IndexedDB:`, err);
                resolve(null);
            });
        }
    }
    /**
     * Konwertuje starą warstwę z imageSrc na nowy format
     * @param {any} layerData - Dane warstwy
     * @param {number} index - Indeks warstwy
     * @param {(value: Layer | null) => void} resolve - Funkcja resolve
     */
    _convertLegacyLayer(layerData, index, resolve) {
        const imageId = generateUUID();
        saveImage(imageId, layerData.imageSrc)
            .then(() => {
            this.canvas.imageReferenceManager?.registerCreatedImage(imageId);
            const newLayerData = { ...layerData, imageId };
            delete newLayerData.imageSrc;
            this._createLayerFromSrc(newLayerData, layerData.imageSrc, index, resolve);
        })
            .catch(err => {
            log.error(`Layer ${index}: Error saving image to IndexedDB:`, err);
            resolve(null);
        });
    }
    /**
     * Tworzy warstwę z src obrazu
     * @param {any} layerData - Dane warstwy
     * @param {string} imageSrc - Źródło obrazu
     * @param {number} index - Indeks warstwy
     * @param {(value: Layer | null) => void} resolve - Funkcja resolve
     */
    _createLayerFromSrc(layerData, imageSrc, index, resolve) {
        if (typeof imageSrc === 'string') {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const newLayer = { ...layerData, image: img };
                resolve(newLayer);
            };
            img.onerror = () => {
                log.error(`Layer ${index}: Failed to load image from src.`);
                resolve(null);
            };
            img.src = imageSrc;
        }
        else {
            const { canvas, ctx } = createCanvas(imageSrc.width, imageSrc.height);
            if (ctx) {
                ctx.drawImage(imageSrc, 0, 0);
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    const newLayer = { ...layerData, image: img };
                    resolve(newLayer);
                };
                img.onerror = () => {
                    log.error(`Layer ${index}: Failed to load image from ImageBitmap.`);
                    resolve(null);
                };
                img.src = canvas.toDataURL();
            }
            else {
                log.error(`Layer ${index}: Failed to get 2d context from canvas.`);
                resolve(null);
            }
        }
    }
    async saveStateToDB() {
        if (this.lastLoadResult?.partial) return;
        if (!this.canvas.node.id) {
            log.error("Node ID is not available for saving state to DB.");
            return;
        }
        if (this.canvas.node && this.canvas.node.widgets) {
            const nodeIdWidget = this.canvas.node.widgets.find((w) => w.name === "node_id");
            if (nodeIdWidget) {
                const correctId = String(this.canvas.node.id);
                if (nodeIdWidget.value !== correctId) {
                    const prevValue = nodeIdWidget.value;
                    nodeIdWidget.value = correctId;
                    log.warn(`[CanvasState] node_id widget value (${prevValue}) did not match node.id (${correctId}) - auto-corrected (saveStateToDB).`);
                    showAlertNotification(`The value of node_id (${prevValue}) did not match the node number (${correctId}) and was automatically corrected. 
If you see dark images or masks in the output, make sure node_id is set to ${correctId}.`);
                }
            }
        }
        const layers = await this._prepareLayers();
        if (this.lastLoadResult?.partial) return;
        const state = {
            layers: layers.filter(layer => layer !== null),
            viewport: this.canvas.viewport,
            width: this.canvas.width,
            height: this.canvas.height,
            outputAreaBounds: this.canvas.outputAreaBounds,
            imageReferences: Array.from(this.canvas.imageReferenceManager.collectAllUsedImageIds()),
        };
        if (this.stateSaverWorker) {
            this.stateSaverWorker.postMessage({
                nodeId: String(this.canvas.node.id),
                state: state
            });
            this.canvas.render();
        }
        else {
            log.warn("State saver worker not available. Saving on main thread.");
            await setCanvasState(String(this.canvas.node.id), state);
        }
    }
    /**
     * Przygotowuje warstwy do zapisu
     * @returns {Promise<(Omit<Layer, 'image'> & { imageId: string })[]>} Przygotowane warstwy
     */
    async _prepareLayers() {
        const preparedLayers = await Promise.all(this.canvas.layers.map(async (layer, index) => {
            const newLayer = { ...layer, imageId: layer.imageId || '' };
            delete newLayer.image;
            if (layer.image instanceof HTMLImageElement) {
                if (layer.imageId) {
                    newLayer.imageId = layer.imageId;
                }
                else {
                    newLayer.imageId = generateUUID();
                    const imageBitmap = await createImageBitmap(layer.image);
                    await saveImage(newLayer.imageId, imageBitmap);
                    this.canvas.imageReferenceManager?.registerCreatedImage(newLayer.imageId);
                    layer.imageId = newLayer.imageId;
                }
            }
            else if (!layer.imageId) {
                log.error(`Layer ${index}: No image or imageId found, skipping layer.`);
                return null;
            }
            return newLayer;
        }));
        return preparedLayers.filter((layer) => layer !== null);
    }
    saveState(replaceLast = false) {
        if (this.canvas.maskTool && this.canvas.maskTool.isActive) {
            this.saveMaskState(replaceLast);
        }
        else {
            this.saveLayersState(replaceLast);
        }
    }
    saveLayersState(replaceLast = false, persist = true) {
        if (replaceLast && this.layersUndoStack.length > 0) {
            this.layersUndoStack.pop();
        }
        const currentState = cloneLayers(this.canvas.layers);
        const currentStateSignature = layerStateSignature(currentState);
        if (this.layersUndoStack.length > 0) {
            const lastState = this.layersUndoStack[this.layersUndoStack.length - 1];
            if (layerStateSignature(lastState) === currentStateSignature) {
                return;
            }
        }
        this.layersUndoStack.push(currentState);
        if (this.layersUndoStack.length > this.historyLimit) {
            this.layersUndoStack.shift();
        }
        this.layersRedoStack = [];
        this.canvas.updateHistoryButtons();
        if (!persist) return;
        this.lastLoadResult = null;
        if (!this._debouncedSave) {
            this._debouncedSave = debounce(this.saveStateToDB.bind(this), 1000);
        }
        this._debouncedSave();
    }
    saveMaskState(replaceLast = false) {
        if (!this.canvas.maskTool)
            return;
        if (replaceLast && this.maskUndoStack.length > 0) {
            this.maskUndoStack.pop();
        }
        const maskCanvas = this.canvas.maskTool.getMask();
        const { canvas: clonedCanvas, ctx: clonedCtx } = createCanvas(maskCanvas.width, maskCanvas.height, '2d', { willReadFrequently: true });
        if (clonedCtx) {
            clonedCtx.drawImage(maskCanvas, 0, 0);
        }
        this.maskUndoStack.push(clonedCanvas);
        if (this.maskUndoStack.length > this.historyLimit) {
            this.maskUndoStack.shift();
        }
        this.maskRedoStack = [];
        this.canvas.updateHistoryButtons();
    }
    undo() {
        if (this.canvas.maskTool && this.canvas.maskTool.isActive) {
            this.undoMaskState();
        }
        else {
            this.undoLayersState();
        }
    }
    redo() {
        if (this.canvas.maskTool && this.canvas.maskTool.isActive) {
            this.redoMaskState();
        }
        else {
            this.redoLayersState();
        }
    }
    undoLayersState() {
        if (this.layersUndoStack.length <= 1)
            return;
        const currentState = this.layersUndoStack.pop();
        if (currentState) {
            this.layersRedoStack.push(currentState);
        }
        const prevState = this.layersUndoStack[this.layersUndoStack.length - 1];
        this.canvas.layers = cloneLayers(prevState);
        this.canvas.updateSelectionAfterHistory();
        this.canvas.layerMasks.historyChanged();
        this.canvas.render();
        this.canvas.updateHistoryButtons();
    }
    redoLayersState() {
        if (this.layersRedoStack.length === 0)
            return;
        const nextState = this.layersRedoStack.pop();
        if (nextState) {
            this.layersUndoStack.push(nextState);
            this.canvas.layers = cloneLayers(nextState);
            this.canvas.updateSelectionAfterHistory();
            this.canvas.layerMasks.historyChanged();
            this.canvas.render();
            this.canvas.updateHistoryButtons();
        }
    }
    undoMaskState() {
        if (!this.canvas.maskTool || this.maskUndoStack.length <= 1)
            return;
        const currentState = this.maskUndoStack.pop();
        if (currentState) {
            this.maskRedoStack.push(currentState);
        }
        if (this.maskUndoStack.length > 0) {
            const prevState = this.maskUndoStack[this.maskUndoStack.length - 1];
            this.canvas.maskTool.restoreMaskFromSavedState(prevState);
            this.canvas.canvasRenderer.clearMaskStrokeOverlay();
            this.canvas.render();
        }
        this.canvas.updateHistoryButtons();
    }
    redoMaskState() {
        if (!this.canvas.maskTool || this.maskRedoStack.length === 0)
            return;
        const nextState = this.maskRedoStack.pop();
        if (nextState) {
            this.maskUndoStack.push(nextState);
            this.canvas.maskTool.restoreMaskFromSavedState(nextState);
            this.canvas.canvasRenderer.clearMaskStrokeOverlay();
            this.canvas.render();
        }
        this.canvas.updateHistoryButtons();
    }
    /**
     * Czyści historię undo/redo
     */
    clearHistory() {
        if (this.canvas.maskTool && this.canvas.maskTool.isActive) {
            this.maskUndoStack = [];
            this.maskRedoStack = [];
        }
        else {
            this.layersUndoStack = [];
            this.layersRedoStack = [];
        }
        this.canvas.updateHistoryButtons();
    }
    /**
     * Zwraca informacje o historii
     * @returns {HistoryInfo} Informacje o historii
     */
    getHistoryInfo() {
        if (this.canvas.maskTool && this.canvas.maskTool.isActive) {
            return {
                undoCount: this.maskUndoStack.length,
                redoCount: this.maskRedoStack.length,
                canUndo: this.maskUndoStack.length > 1,
                canRedo: this.maskRedoStack.length > 0,
                historyLimit: this.historyLimit
            };
        }
        else {
            return {
                undoCount: this.layersUndoStack.length,
                redoCount: this.layersRedoStack.length,
                canUndo: this.layersUndoStack.length > 1,
                canRedo: this.layersRedoStack.length > 0,
                historyLimit: this.historyLimit
            };
        }
    }
}
