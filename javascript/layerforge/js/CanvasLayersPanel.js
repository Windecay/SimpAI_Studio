import { createModuleLogger } from "/file=javascript/layerforge/js/utils/LoggerUtils.js?v=patch26";
import { isEditingText } from "/gradio_api/file=javascript/layerforge/js/KeyboardUtils.js?v=patch1";
import { showErrorNotification } from "/file=javascript/layerforge/js/utils/NotificationUtils.js?v=patch26";
import { iconLoader, LAYERFORGE_TOOLS } from "/file=javascript/layerforge/js/utils/IconLoader.js?v=patch26";
import { createCanvas } from "/file=javascript/layerforge/js/utils/CommonUtils.js?v=patch26";
import { addStylesheet, getUrl } from "/file=javascript/layerforge/js/utils/ResourceManager.js?v=patch26";
const log = createModuleLogger('CanvasLayersPanel');
export class CanvasLayersPanel {
    constructor(canvas) {
        this.canvas = canvas;
        this.container = null;
        this.layersContainer = null;
        this.draggedElements = [];
        this.dragInsertionLine = null;
        this.isMultiSelecting = false;
        this.lastSelectedIndex = -1;
        this.handleLayerClick = this.handleLayerClick.bind(this);
        this.handleDragStart = this.handleDragStart.bind(this);
        this.handleDragOver = this.handleDragOver.bind(this);
        this.handleDragEnd = this.handleDragEnd.bind(this);
        this.handleDrop = this.handleDrop.bind(this);
        // Preload icons
        this.initializeIcons();
        // Load CSS for layers panel
        addStylesheet('/gradio_api/file=javascript/layerforge/js/css/layers_panel.css?v=patch66');
        log.info('CanvasLayersPanel initialized');
    }
    async initializeIcons() {
        try {
            await iconLoader.preloadToolIcons();
            log.debug('Icons preloaded successfully');
        }
        catch (error) {
            log.warn('Failed to preload icons, using fallbacks:', error);
        }
    }
    createIconElement(toolName, size = 16) {
        const iconContainer = document.createElement('div');
        iconContainer.className = 'icon-container';
        iconContainer.style.width = `${size}px`;
        iconContainer.style.height = `${size}px`;
        const icon = iconLoader.getIcon(toolName);
        if (icon) {
            if (icon instanceof HTMLImageElement) {
                const img = icon.cloneNode();
                img.style.width = `${size}px`;
                img.style.height = `${size}px`;
                iconContainer.appendChild(img);
            }
            else if (icon instanceof HTMLCanvasElement) {
                const { canvas, ctx } = createCanvas(size, size);
                if (ctx) {
                    ctx.drawImage(icon, 0, 0, size, size);
                }
                iconContainer.appendChild(canvas);
            }
        }
        else {
            // Fallback text
            iconContainer.classList.add('fallback-text');
            iconContainer.textContent = toolName.charAt(0).toUpperCase();
            iconContainer.style.fontSize = `${size * 0.6}px`;
        }
        return iconContainer;
    }
    createVisibilityIcon(isVisible) {
        if (isVisible) {
            return this.createIconElement(LAYERFORGE_TOOLS.VISIBILITY, 16);
        }
        else {
            // Create a "hidden" version of the visibility icon
            const iconContainer = document.createElement('div');
            iconContainer.className = 'icon-container visibility-hidden';
            iconContainer.style.width = '16px';
            iconContainer.style.height = '16px';
            const icon = iconLoader.getIcon(LAYERFORGE_TOOLS.VISIBILITY);
            if (icon) {
                if (icon instanceof HTMLImageElement) {
                    const img = icon.cloneNode();
                    img.style.width = '16px';
                    img.style.height = '16px';
                    iconContainer.appendChild(img);
                }
                else if (icon instanceof HTMLCanvasElement) {
                    const { canvas, ctx } = createCanvas(16, 16);
                    if (ctx) {
                        ctx.globalAlpha = 0.3;
                        ctx.drawImage(icon, 0, 0, 16, 16);
                    }
                    iconContainer.appendChild(canvas);
                }
            }
            else {
                // Fallback
                iconContainer.classList.add('fallback-text');
                iconContainer.textContent = '隐';
                iconContainer.style.fontSize = '10px';
            }
            return iconContainer;
        }
    }
    createPanelStructure() {
        this.container = document.createElement('div');
        this.container.className = 'layers-panel';
        this.container.tabIndex = 0; // Umożliwia fokus na panelu
        this.container.innerHTML = `
            <div class="layers-panel-header">
                <div class="master-visibility-toggle" title="切换所有图层可见性"></div>
                <span class="layers-panel-title">图层</span>
                <div class="layers-panel-controls">
                    <button class="layers-btn" id="add-layer-mask-btn" type="button"></button>
                    <button class="layers-btn" id="delete-layer-btn" title="删除图层"></button>
                </div>
            </div>
            <div class="layer-mask-controls" hidden>
                <label><input id="layer-mask-enabled" type="checkbox"><span></span></label>
                <button class="layers-btn" id="invert-layer-mask-btn" type="button"></button>
                <button class="layers-btn" id="delete-layer-mask-btn" type="button"></button>
            </div>
            <div class="layers-container" id="layers-container">
                <!-- Lista warstw będzie renderowana tutaj -->
            </div>
        `;
        this.layersContainer = this.container.querySelector('#layers-container');
        if (this.layersContainer) {
            this.layersContainer.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = this.draggedElements.length ? 'move' : 'copy';
                }
                this.layersContainer.classList.add('dragover-external');
            });
            this.layersContainer.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!this.layersContainer.contains(e.relatedTarget)) {
                    this.layersContainer.classList.remove('dragover-external');
                }
            });
            this.layersContainer.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.layersContainer.classList.remove('dragover-external');
                if (!this.draggedElements.length) {
                    this.handleExternalDrop(e);
                }
            });
        }
        // Setup event listeners dla przycisków
        this.setupControlButtons();
        this.setupMasterVisibilityToggle();
        // Dodaj listener dla klawiatury, aby usuwanie działało z panelu
        this.container.addEventListener('keydown', (e) => {
            if (e.defaultPrevented || isEditingText(e)) return;
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                e.stopPropagation();
                this.deleteSelectedLayers();
            }
        });
        log.debug('Panel structure created');
        return this.container;
    }

    async handleExternalDrop(e) {
        try {
            if (!e || !e.dataTransfer)
                return;
            const img = await this.loadDroppedImageFromDataTransfer(e.dataTransfer);
            if (!img)
                return;
            await this.canvas.canvasLayers.addLayerWithImage(img, {}, 'center');
            this.renderLayers();
        }
        catch (err) {
            log.warn('Failed to handle external drop into layers panel:', err);
        }
    }

    async loadDroppedImageFromDataTransfer(dataTransfer) {
        const files = dataTransfer && dataTransfer.files ? Array.from(dataTransfer.files) : [];
        const imageFile = files.find((f) => String(f?.type || '').startsWith('image/')) || null;
        if (imageFile) {
            return await this.loadImageFromFile(imageFile);
        }
        const uriListRaw = String(dataTransfer.getData('text/uri-list') || '');
        const uriListFirst = uriListRaw
            .split(/\r?\n/g)
            .map((s) => s.trim())
            .find((s) => s && !s.startsWith('#'));
        const textRaw = String(dataTransfer.getData('text/plain') || '').trim();
        const payload = String(uriListFirst || textRaw || '').trim();
        if (!payload)
            return null;
        if (payload.startsWith('data:image/')) {
            return await this.loadImageFromDataUrl(payload);
        }
        try {
            const resp = await fetch(payload);
            const blob = await resp.blob();
            const type = String(blob?.type || '');
            if (!type.startsWith('image/'))
                return null;
            const file = new File([blob], `dropped_${Date.now()}.png`, { type: type || 'image/png' });
            return await this.loadImageFromFile(file);
        }
        catch {
            return null;
        }
    }

    async loadImageFromFile(file) {
        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = typeof reader.result === 'string' ? reader.result : '';
                if (!dataUrl || !dataUrl.startsWith('data:image/')) {
                    resolve(null);
                    return;
                }
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = dataUrl;
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
        });
    }

    async loadImageFromDataUrl(dataUrl) {
        return await new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = dataUrl;
        });
    }
    setupControlButtons() {
        if (!this.container)
            return;
        const deleteBtn = this.container.querySelector('#delete-layer-btn');
        // Add delete icon to button
        if (deleteBtn) {
            const deleteIcon = this.createIconElement(LAYERFORGE_TOOLS.DELETE, 16);
            deleteBtn.appendChild(deleteIcon);
        }
        deleteBtn?.addEventListener('click', () => {
            log.info('Delete layer button clicked');
            this.deleteSelectedLayers();
        });
        const t = (key) => window.LayerForgeI18n?.text?.(key) || key;
        const selectedLayer = () => this.canvas.canvasSelection.selectedLayers.length === 1
            ? this.canvas.canvasSelection.selectedLayers[0] : null;
        const buttons = [
            ['add-layer-mask-btn', 'Add layer mask', LAYERFORGE_TOOLS.MASK, (layer) => this.canvas.layerMasks.add(layer)],
            ['invert-layer-mask-btn', 'Invert layer mask', LAYERFORGE_TOOLS.BLEND_MODE, (layer) => this.canvas.layerMasks.invert(layer)],
            ['delete-layer-mask-btn', 'Delete layer mask', LAYERFORGE_TOOLS.DELETE, (layer) => this.canvas.layerMasks.remove(layer)]
        ];
        for (const [id, title, icon, action] of buttons) {
            const button = this.container.querySelector('#' + id);
            button.title = t(title);
            button.setAttribute('aria-label', t(title));
            button.append(this.createIconElement(icon, 16));
            button.onclick = async () => {
                const layer = selectedLayer();
                if (!layer) return;
                try {
                    if (id !== 'add-layer-mask-btn') this.canvas.layerMasks.activate(layer);
                    await action(layer);
                }
                catch (error) { showErrorNotification(t('Layer mask operation failed') + ': ' + error.message); }
            };
        }
        const enabled = this.container.querySelector('#layer-mask-enabled');
        enabled.nextElementSibling.textContent = t('Layer mask enabled');
        enabled.onchange = () => {
            const layer = selectedLayer();
            if (!layer?.layerMask) return;
            this.canvas.layerMasks.activate(layer);
            this.canvas.layerMasks.toggle(layer);
        };
        // Initial button state update
        this.updateButtonStates();
    }
    setupMasterVisibilityToggle() {
        if (!this.container)
            return;
        const toggleContainer = this.container.querySelector('.master-visibility-toggle');
        if (!toggleContainer)
            return;
        const updateToggleState = () => {
            const total = this.canvas.layers.length;
            const visibleCount = this.canvas.layers.filter(l => l.visible).length;
            toggleContainer.innerHTML = '';
            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'checkbox-container';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'master-visibility-checkbox';
            const customCheckbox = document.createElement('span');
            customCheckbox.className = 'custom-checkbox';
            checkboxContainer.appendChild(checkbox);
            checkboxContainer.appendChild(customCheckbox);
            if (visibleCount === 0) {
                checkbox.checked = false;
                checkbox.indeterminate = false;
                customCheckbox.classList.remove('checked', 'indeterminate');
            }
            else if (visibleCount === total) {
                checkbox.checked = true;
                checkbox.indeterminate = false;
                customCheckbox.classList.add('checked');
                customCheckbox.classList.remove('indeterminate');
            }
            else {
                checkbox.checked = false;
                checkbox.indeterminate = true;
                customCheckbox.classList.add('indeterminate');
                customCheckbox.classList.remove('checked');
            }
            checkboxContainer.addEventListener('click', (e) => {
                e.stopPropagation();
                let newVisible;
                if (checkbox.indeterminate) {
                    newVisible = false; // hide all when mixed
                }
                else if (checkbox.checked) {
                    newVisible = false; // toggle to hide all
                }
                else {
                    newVisible = true; // toggle to show all
                }
                this.canvas.layers.forEach(layer => {
                    layer.visible = newVisible;
                });
                this.canvas.render();
                this.canvas.requestSaveState();
                updateToggleState();
                this.renderLayers();
            });
            toggleContainer.appendChild(checkboxContainer);
        };
        updateToggleState();
        this._updateMasterVisibilityToggle = updateToggleState;
    }
    renderLayers() {
        if (!this.layersContainer) {
            log.warn('Layers container not initialized');
            return;
        }
        // Wyczyść istniejącą zawartość
        this.layersContainer.innerHTML = '';
        // Usuń linię wstawiania jeśli istnieje
        this.removeDragInsertionLine();
        // Sortuj warstwy według zIndex (od najwyższej do najniższej)
        const sortedLayers = [...this.canvas.layers].sort((a, b) => b.zIndex - a.zIndex);
        sortedLayers.forEach((layer, index) => {
            const layerElement = this.createLayerElement(layer, index);
            if (this.layersContainer)
                this.layersContainer.appendChild(layerElement);
        });
        if (this._updateMasterVisibilityToggle)
            this._updateMasterVisibilityToggle();
        log.debug(`Rendered ${sortedLayers.length} layers`);
    }
    createLayerElement(layer, index) {
        const layerRow = document.createElement('div');
        layerRow.className = 'layer-row';
        layerRow.draggable = true;
        layerRow.dataset.layerIndex = String(index);
        const isSelected = this.canvas.canvasSelection.selectedLayers.includes(layer);
        layerRow.dataset.layerId = layer.id;
        layerRow.classList.toggle('has-layer-mask', !!layer.layerMask);
        if (isSelected) {
            layerRow.classList.add('selected');
        }
        // Ustawienie domyślnych właściwości jeśli nie istnieją
        if (!layer.name) {
            layer.name = this.ensureUniqueName(`Layer ${layer.zIndex + 1}`, layer);
        }
        else {
            // Sprawdź unikalność istniejącej nazwy (np. przy duplikowaniu)
            layer.name = this.ensureUniqueName(layer.name, layer);
        }
        layerRow.innerHTML = `
            <div class="layer-visibility-toggle" data-layer-index="${index}" title="切换图层可见性"></div>
            <div class="layer-thumbnail" data-layer-index="${index}"></div>
            <span class="layer-name" data-layer-index="${index}"></span>
        `;
        layerRow.querySelector('.layer-name').textContent = layer.name;
        // Add visibility icon
        const visibilityToggle = layerRow.querySelector('.layer-visibility-toggle');
        if (visibilityToggle) {
            const visibilityIcon = this.createVisibilityIcon(layer.visible);
            visibilityToggle.appendChild(visibilityIcon);
        }
        const thumbnailContainer = layerRow.querySelector('.layer-thumbnail');
        if (thumbnailContainer) {
            this.generateThumbnail(layer, thumbnailContainer);
            thumbnailContainer.onclick = () => this.canvas.layerMasks.selectImage();
        }
        if (layer.layerMask) {
            const maskButton = document.createElement('button');
            maskButton.type = 'button';
            maskButton.className = 'layer-mask-thumbnail';
            maskButton.title = window.LayerForgeI18n?.text?.('Edit layer mask') || 'Edit layer mask';
            maskButton.setAttribute('aria-label', maskButton.title);
            maskButton.classList.toggle('is-disabled', layer.layerMask.enabled === false);
            const thumbnail = document.createElement('canvas');
            thumbnail.width = thumbnail.height = 36;
            maskButton.append(thumbnail);
            thumbnailContainer.after(maskButton);
            const ctx = thumbnail.getContext('2d');
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, 36, 36);
            this.canvas.layerMasks.load(layer.layerMask).then((image) => {
                if (!maskButton.isConnected) return;
                ctx.drawImage(image, 0, 0, 36, 36);
            }).catch(() => {});
            maskButton.addEventListener('mousedown', (event) => event.stopPropagation());
            maskButton.addEventListener('dblclick', (event) => event.stopPropagation());
            maskButton.addEventListener('dragstart', (event) => event.preventDefault());
            maskButton.onclick = (event) => {
                event.stopPropagation();
                this.canvas.layerMasks.activate(layer);
                if (event.shiftKey) this.canvas.layerMasks.toggle(layer);
            };
        }
        this.setupLayerEventListeners(layerRow, layer, index);
        return layerRow;
    }
    generateThumbnail(layer, thumbnailContainer) {
        if (!layer.image) {
            thumbnailContainer.style.background = '#4a4a4a';
            return;
        }
        const { canvas, ctx } = createCanvas(48, 48, '2d', { willReadFrequently: true });
        if (!ctx)
            return;
        const scale = Math.min(48 / layer.image.width, 48 / layer.image.height);
        const scaledWidth = layer.image.width * scale;
        const scaledHeight = layer.image.height * scale;
        // Wycentruj obraz
        const x = (48 - scaledWidth) / 2;
        const y = (48 - scaledHeight) / 2;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(layer.image, x, y, scaledWidth, scaledHeight);
        thumbnailContainer.appendChild(canvas);
    }
    setupLayerEventListeners(layerRow, layer, index) {
        layerRow.addEventListener('mousedown', (e) => {
            const nameElement = layerRow.querySelector('.layer-name');
            if (nameElement && nameElement.classList.contains('editing')) {
                return;
            }
            this.handleLayerClick(e, layer, index);
        });
        // --- PRAWY PRZYCISK: ODJAZNACZ LAYER ---
        layerRow.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.canvas.canvasSelection.selectedLayers.includes(layer)) {
                const newSelection = this.canvas.canvasSelection.selectedLayers.filter((l) => l !== layer);
                this.canvas.updateSelection(newSelection);
                this.updateSelectionAppearance();
                this.updateButtonStates();
            }
        });
        layerRow.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const nameElement = layerRow.querySelector('.layer-name');
            if (nameElement) {
                this.startEditingLayerName(nameElement, layer);
            }
        });
        // Add visibility toggle event listener
        const visibilityToggle = layerRow.querySelector('.layer-visibility-toggle');
        if (visibilityToggle) {
            visibilityToggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleLayerVisibility(layer);
            });
        }
        layerRow.addEventListener('dragstart', (e) => this.handleDragStart(e, layer, index));
        layerRow.addEventListener('dragover', this.handleDragOver.bind(this));
        layerRow.addEventListener('dragend', this.handleDragEnd.bind(this));
        layerRow.addEventListener('drop', (e) => this.handleDrop(e, index));
    }
    handleLayerClick(e, layer, index) {
        const isCtrlPressed = e.ctrlKey || e.metaKey;
        const isShiftPressed = e.shiftKey;
        // Aktualizuj wewnętrzny stan zaznaczenia w obiekcie canvas
        // Ta funkcja NIE powinna już wywoływać onSelectionChanged w panelu.
        this.canvas.updateSelectionLogic(layer, isCtrlPressed, isShiftPressed, index);
        // Aktualizuj tylko wygląd (klasy CSS), bez niszczenia DOM
        this.updateSelectionAppearance();
        this.updateButtonStates();
        log.debug(`Layer clicked: ${layer.name}, selection count: ${this.canvas.canvasSelection.selectedLayers.length}`);
    }
    startEditingLayerName(nameElement, layer) {
        const currentName = layer.name;
        nameElement.classList.add('editing');
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.style.width = '100%';
        nameElement.innerHTML = '';
        nameElement.appendChild(input);
        input.focus();
        input.select();
        const finishEditing = () => {
            let newName = input.value.trim() || `Layer ${layer.zIndex + 1}`;
            newName = this.ensureUniqueName(newName, layer);
            layer.name = newName;
            nameElement.classList.remove('editing');
            nameElement.textContent = newName;
            this.canvas.saveState();
            log.info(`Layer renamed to: ${newName}`);
        };
        input.addEventListener('blur', finishEditing);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                finishEditing();
            }
            else if (e.key === 'Escape') {
                nameElement.classList.remove('editing');
                nameElement.textContent = currentName;
            }
        });
    }
    ensureUniqueName(proposedName, currentLayer) {
        const existingNames = this.canvas.layers
            .filter((layer) => layer !== currentLayer)
            .map((layer) => layer.name);
        if (!existingNames.includes(proposedName)) {
            return proposedName;
        }
        // Sprawdź czy nazwa już ma numerację w nawiasach
        const match = proposedName.match(/^(.+?)\s*\((\d+)\)$/);
        let baseName, startNumber;
        if (match) {
            baseName = match[1].trim();
            startNumber = parseInt(match[2]) + 1;
        }
        else {
            baseName = proposedName;
            startNumber = 1;
        }
        // Znajdź pierwszą dostępną numerację
        let counter = startNumber;
        let uniqueName;
        do {
            uniqueName = `${baseName} (${counter})`;
            counter++;
        } while (existingNames.includes(uniqueName));
        return uniqueName;
    }
    toggleLayerVisibility(layer) {
        layer.visible = !layer.visible;
        // If layer became invisible and is selected, deselect it
        if (!layer.visible && this.canvas.canvasSelection.selectedLayers.includes(layer)) {
            const newSelection = this.canvas.canvasSelection.selectedLayers.filter((l) => l !== layer);
            this.canvas.updateSelection(newSelection);
        }
        this.canvas.render();
        this.canvas.requestSaveState();
        // Update the eye icon in the panel
        this.renderLayers();
        log.info(`Layer "${layer.name}" visibility toggled to: ${layer.visible}`);
    }
    deleteSelectedLayers() {
        if (this.canvas.canvasSelection.selectedLayers.length === 0) {
            log.debug('No layers selected for deletion');
            return;
        }
        log.info(`Deleting ${this.canvas.canvasSelection.selectedLayers.length} selected layers`);
        this.canvas.removeSelectedLayers();
        this.renderLayers();
    }
    handleDragStart(e, layer, index) {
        if (!this.layersContainer || !e.dataTransfer)
            return;
        const editingElement = this.layersContainer.querySelector('.layer-name.editing');
        if (editingElement) {
            e.preventDefault();
            return;
        }
        // Jeśli przeciągana warstwa nie jest zaznaczona, zaznacz ją
        if (!this.canvas.canvasSelection.selectedLayers.includes(layer)) {
            this.canvas.updateSelection([layer]);
            this.renderLayers();
        }
        this.draggedElements = [...this.canvas.canvasSelection.selectedLayers];
        e.dataTransfer.effectAllowed = 'copyMove';
        const primary = layer || (this.draggedElements.length ? this.draggedElements[0] : null);
        let payload = '';
        try {
            const img = primary && primary.image ? primary.image : null;
            if (img && typeof img.toDataURL === 'function') {
                payload = img.toDataURL('image/png');
            }
            else if (img && typeof img.src === 'string') {
                payload = img.src;
            }
        }
        catch (e0) {
        }
        try {
            if (payload) {
                e.dataTransfer.setData('text/uri-list', payload);
                e.dataTransfer.setData('text/plain', payload);
            }
            else {
                e.dataTransfer.setData('text/plain', '');
            }
        }
        catch (e1) {
            e.dataTransfer.setData('text/plain', '');
        }
        this.layersContainer.querySelectorAll('.layer-row').forEach((row, idx) => {
            const sortedLayers = [...this.canvas.layers].sort((a, b) => b.zIndex - a.zIndex);
            if (this.draggedElements.includes(sortedLayers[idx])) {
                row.classList.add('dragging');
            }
        });
        log.debug(`Started dragging ${this.draggedElements.length} layers`);
    }
    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer)
            e.dataTransfer.dropEffect = this.draggedElements.length ? 'move' : 'copy';
        const layerRow = e.currentTarget;
        const rect = layerRow.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        const isUpperHalf = e.clientY < midpoint;
        this.showDragInsertionLine(layerRow, isUpperHalf);
    }
    showDragInsertionLine(targetRow, isUpperHalf) {
        this.removeDragInsertionLine();
        const line = document.createElement('div');
        line.className = 'drag-insertion-line';
        if (isUpperHalf) {
            line.style.top = '-1px';
        }
        else {
            line.style.bottom = '-1px';
        }
        targetRow.style.position = 'relative';
        targetRow.appendChild(line);
        this.dragInsertionLine = line;
    }
    removeDragInsertionLine() {
        if (this.dragInsertionLine) {
            this.dragInsertionLine.remove();
            this.dragInsertionLine = null;
        }
    }
    handleDrop(e, targetIndex) {
        e.preventDefault();
        e.stopPropagation();
        this.removeDragInsertionLine();
        if (this.draggedElements.length === 0) {
            this.handleExternalDrop(e);
            return;
        }
        if (!(e.currentTarget instanceof HTMLElement))
            return;
        const rect = e.currentTarget.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        const isUpperHalf = e.clientY < midpoint;
        // Oblicz docelowy indeks
        let insertIndex = targetIndex;
        if (!isUpperHalf) {
            insertIndex = targetIndex + 1;
        }
        // Użyj nowej, centralnej funkcji do przesuwania warstw
        this.canvas.canvasLayers.moveLayers(this.draggedElements, { toIndex: insertIndex });
        log.info(`Dropped ${this.draggedElements.length} layers at position ${insertIndex}`);
    }
    handleDragEnd(e) {
        this.removeDragInsertionLine();
        if (!this.layersContainer)
            return;
        this.layersContainer.querySelectorAll('.layer-row').forEach((row) => {
            row.classList.remove('dragging');
        });
        this.draggedElements = [];
    }
    onLayersChanged() {
        this.renderLayers();
    }
    updateSelectionAppearance() {
        if (!this.layersContainer)
            return;
        const sortedLayers = [...this.canvas.layers].sort((a, b) => b.zIndex - a.zIndex);
        const layerRows = this.layersContainer.querySelectorAll('.layer-row');
        layerRows.forEach((row, index) => {
            const layer = sortedLayers[index];
            if (this.canvas.canvasSelection.selectedLayers.includes(layer)) {
                row.classList.add('selected');
            }
            else {
                row.classList.remove('selected');
            }
        });
    }
    /**
     * Aktualizuje stan przycisków w zależności od zaznaczenia warstw
     */
    updateButtonStates() {
        if (!this.container)
            return;
        this.updateMaskControls();
        const deleteBtn = this.container.querySelector('#delete-layer-btn');
        const hasSelectedLayers = this.canvas.canvasSelection.selectedLayers.length > 0;
        if (deleteBtn) {
            deleteBtn.disabled = !hasSelectedLayers;
            deleteBtn.title = hasSelectedLayers
                ? `删除 ${this.canvas.canvasSelection.selectedLayers.length} 个选定图层`
                : '未选择图层';
        }
        log.debug(`Button states updated - delete button ${hasSelectedLayers ? 'enabled' : 'disabled'}`);
    }
    /**
     * Aktualizuje panel gdy zmieni się zaznaczenie (wywoływane z zewnątrz).
     * Zamiast pełnego renderowania, tylko aktualizujemy wygląd.
     */
    onSelectionChanged() {
        this.updateSelectionAppearance();
        this.updateButtonStates();
    }
    updateMaskControls() {
        if (!this.container) return;
        const selected = this.canvas.canvasSelection.selectedLayers;
        const layer = selected.length === 1 ? selected[0] : null;
        const add = this.container.querySelector('#add-layer-mask-btn');
        if (add) add.disabled = !layer;
        const controls = this.container.querySelector('.layer-mask-controls');
        controls.hidden = !layer?.layerMask;
        this.container.querySelector('#layer-mask-enabled').checked = layer?.layerMask?.enabled !== false;
        this.layersContainer.querySelectorAll('.layer-row').forEach((row) => {
            const active = row.dataset.layerId === this.canvas.layerMasks.activeLayerId;
            row.querySelector('.layer-mask-thumbnail')?.classList.toggle('is-active', active);
            row.querySelector('.layer-thumbnail')?.classList.toggle('is-image-target', row.classList.contains('selected') && !active);
        });
    }
    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.container = null;
        this.layersContainer = null;
        this.draggedElements = [];
        this.removeDragInsertionLine();
        log.info('CanvasLayersPanel destroyed');
    }
}
