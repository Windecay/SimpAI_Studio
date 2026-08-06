onUiLoaded(async() => {
    // Helper functions
    let buttonsVisible = true;
    // Detect whether the element has a horizontal scroll bar
    function hasHorizontalScrollbar(element) {
        return element.scrollWidth > element.clientWidth;
    }

    // Function for defining the "Ctrl", "Shift" and "Alt" keys
    function isModifierKey(event, key) {
        switch (key) {
        case "Ctrl":
            return event.ctrlKey;
        case "Shift":
            return event.shiftKey;
        case "Alt":
            return event.altKey;
        default:
            return false;
        }
    }

    // Create hotkey configuration with the provided options
    function createHotkeyConfig(defaultHotkeysConfig) {
        const result = {}; // Resulting hotkey configuration
        for (const key in defaultHotkeysConfig) {
            result[key] = defaultHotkeysConfig[key];
        }
        return result;
    }

    // Default config
    const defaultHotkeysConfig = {
        canvas_hotkey_zoom: "Shift",
        canvas_hotkey_adjust: "Ctrl",
        canvas_zoom_undo_extra_key: "Ctrl",
        canvas_zoom_hotkey_undo: "KeyZ",
        canvas_hotkey_reset: "KeyR",
        canvas_hotkey_fullscreen: "KeyS",
        canvas_hotkey_move: "KeyF",
        canvas_hotkey_hide: "KeyQ",
        canvas_show_tooltip: true,
        canvas_auto_expand: true,
        canvas_blur_prompt: true,
    };

    // Loading the configuration from opts
    const hotkeysConfig = createHotkeyConfig(
        defaultHotkeysConfig
    );

    let isMoving = false;
    let activeElement;

    const elemData = {};

    function applyZoomAndPan(elemId) {
        const targetElement = gradioApp().querySelector(elemId);
        if (!targetElement) return;
        if (targetElement.dataset.zoomPanInitialized === "true") return;
        targetElement.dataset.zoomPanInitialized = "true";

        function getSimpAISketchApi() {
            try {
                if (window.SimpAISketch && typeof window.SimpAISketch.get === "function") {
                    const viaTarget = window.SimpAISketch.get(targetElement);
                    if (viaTarget) return viaTarget;
                    const activeFullscreen = document.querySelector(".simpai-sketch.simpai-sketch--fullscreen, .simpai-sketch.simpai-sketch--pan-floating");
                    const viaFullscreen = activeFullscreen ? window.SimpAISketch.get(activeFullscreen) : null;
                    if (viaFullscreen) return viaFullscreen;
                    const sketchRoot = targetElement.querySelector?.("[data-simpai-sketch='1'], .simpai-custom-sketch-source");
                    const viaRoot = sketchRoot ? window.SimpAISketch.get(sketchRoot) : null;
                    if (viaRoot) return viaRoot;
                }
                return targetElement.__simpaiSketch
                    || targetElement.querySelector?.("[data-simpai-sketch='1']")?.__simpaiSketch
                    || targetElement.querySelector?.(".simpai-sketch")?.closest?.("[data-simpai-sketch='1']")?.__simpaiSketch
                    || null;
            } catch {
                return null;
            }
        }

        function getPrimaryCanvas() {
            return gradioApp().querySelector(`${elemId} canvas[key="interface"]`)
                || targetElement.querySelector('canvas[data-role="background"]')
                || targetElement.querySelector('.simpai-sketch__stage canvas')
                || targetElement.querySelector('canvas');
        }

        function getImageStage() {
            return targetElement.querySelector('.simpai-sketch__stage')
                || targetElement.querySelector('.image-container')
                || targetElement;
        }

        // 清理旧事件监听
        if (targetElement._moveHandler) {
            gradioApp().removeEventListener("mousemove", targetElement._moveHandler);
            document.removeEventListener("mousemove", targetElement._moveHandler);
        }
        targetElement.style.transformOrigin = "0 0";
        // 创建新的独立处理器
        targetElement._moveHandler = (e) => {
            const activeSketch = document.querySelector(".simpai-sketch--pan-floating, .simpai-sketch--fullscreen");
            if (e.target.closest(elemId) || (activeSketch && activeSketch.contains(e.target))) {
                handleMoveByKey.call({ elemId, targetElement }, e);
            }
        };
        gradioApp().addEventListener("mousemove", targetElement._moveHandler);
        document.addEventListener("mousemove", targetElement._moveHandler);

        elemData[elemId] = {
            zoomLevel: 1,
            panX: 0,
            panY: 0
        };

        let fullScreenMode = false;
        let isPointerInside = false;

        function hasSimpAISketchShell() {
            return !!targetElement.querySelector?.(".simpai-sketch");
        }

        function isEditableElement(el) {
            if (!el) return false;
            if (el.isContentEditable) return true;
            const nodeName = el.nodeName;
            if (nodeName === "INPUT" || nodeName === "TEXTAREA" || nodeName === "SELECT") return true;
            return !!el.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]');
        }

        function shouldHandleCanvasHotkeys(event) {
            if (document.querySelector?.('.sai-h3sb-modal')) return false;
            const sketch = getSimpAISketchApi();
            if (sketch?.isFullscreen?.() || sketch?.isPanFloating?.()) {
                activeElement = elemId;
                return true;
            }
            if (activeElement !== elemId) return false;

            const focused = document.activeElement;
            const isEditing = isEditableElement(event.target) || isEditableElement(focused);
            if (isEditing && !isPointerInside) return false;

            if (isEditing) {
                if (!hotkeysConfig.canvas_blur_prompt) return false;
                focused?.blur?.();
            }

            if (isPointerInside) return true;
            if (focused && targetElement.contains(focused)) return true;
            return false;
        }

        // Create tooltip
        function createTooltip() {
            const toolTipElemnt =
                targetElement.querySelector(".simpai-sketch") ||
                targetElement.querySelector(".image-container") ||
                (targetElement.classList?.contains("image-container") ? targetElement : null) ||
                targetElement;
            if (!toolTipElemnt) return;
            const existingTooltip = targetElement.querySelector(".canvas-tooltip");
            if (existingTooltip) {
                if (existingTooltip.parentElement !== toolTipElemnt) {
                    toolTipElemnt.appendChild(existingTooltip);
                }
                return;
            }
            const tooltip = document.createElement("div");
            tooltip.className = "canvas-tooltip";

            // Creating an item of information
            const info = document.createElement("i");
            info.className = "canvas-tooltip-info";
            info.textContent = "";

            // Create a container for the contents of the tooltip
            const tooltipContent = document.createElement("div");
            tooltipContent.className = "canvas-tooltip-content";

            // Define an array with hotkey information and their actions
            const hotkeysInfo = [
                {
                    configKey: "canvas_hotkey_zoom",
                    action: "缩放画布",
                    keySuffix: " + wheel"
                },
                {
                    configKey: "canvas_hotkey_adjust",
                    action: "调整笔刷大小",
                    keySuffix: " + wheel"
                },
                {configKey: "canvas_zoom_hotkey_undo", action: "回退上一步", keyPrefix: `${hotkeysConfig.canvas_zoom_undo_extra_key} + ` },
                {configKey: "canvas_hotkey_reset", action: "重置画布"},
                {
                    configKey: "canvas_hotkey_fullscreen",
                    action: "全屏模式"
                },
                {configKey: "canvas_hotkey_move", action: "移动画布"},
                {configKey: "canvas_hotkey_hide", action: "隐藏按钮"}
            ];

            // Create hotkeys array based on the config values
            const hotkeys = hotkeysInfo.map((info) => {
                const configValue = hotkeysConfig[info.configKey];
        
                let key = configValue.slice(-1);
        
                if (info.keySuffix) {
                  key = `${configValue}${info.keySuffix}`;
                }
        
                if (info.keyPrefix && info.keyPrefix !== "None + ") {
                  key = `${info.keyPrefix}${configValue[3]}`;
                }
        
                return {
                  key,
                  action: info.action,
                };
              });
        
              hotkeys
                .forEach(hotkey => {
                  const p = document.createElement("p");
                  p.innerHTML = `<b>${hotkey.key}</b> - ${hotkey.action}`;
                  tooltipContent.appendChild(p);
                });
        
              tooltip.append(info, tooltipContent);

              // Add a hint element to the target element
              toolTipElemnt.appendChild(tooltip);
        }

        //Show tool tip if setting enable
        if (hotkeysConfig.canvas_show_tooltip) {
            createTooltip();
        }

        // Reset the zoom level and pan position of the target element to their initial values
        function resetZoom() {
            const sketch = getSimpAISketchApi();
            if (sketch && typeof sketch.exitFullscreen === "function") {
                sketch.exitFullscreen();
                sketch.exitPanFloating?.();
                sketch.resetViewport?.();
            }
            elemData[elemId] = {
                zoomLevel: 1,
                panX: 0,
                panY: 0
            };

            targetElement.style.overflow = "hidden";
            targetElement.classList.remove("is-zoomed-active"); // 移除状态类

            targetElement.isZoomed = false;

            targetElement.style.transform = `scale(${elemData[elemId].zoomLevel}) translate(${elemData[elemId].panX}px, ${elemData[elemId].panY}px)`;

            const canvas = gradioApp().querySelector(
                `${elemId} canvas[key="interface"]`
            ) || getPrimaryCanvas();

            toggleOverlap("off");
            fullScreenMode = false;

            const closeBtn = targetElement.querySelector("button[aria-label='Remove Image']")
                || targetElement.querySelector('button[data-action="clear-image"]');
            if (closeBtn) {
                closeBtn.addEventListener("click", resetZoom);
            }

            const canvasLabels = gradioApp().querySelectorAll(
                `${elemId} div[data-testid="block-label"]`
            );
            canvasLabels.forEach(label => label.style.display = '');
        }

        // Toggle the zIndex of the target element between two values, allowing it to overlap or be overlapped by other elements
        function toggleOverlap(forced = "") {
            const baseZIndex = 1000; // 基础层级
            const activeIncrement = 1; // 激活时增加的层级

            // 自动提升当前激活画布层级
            const allCanvases = ['#inpaint_canvas', '#inpaint_mask_canvas', '#scene_canvas'];
            allCanvases.forEach(selector => {
                if (selector !== elemId) {
                    const otherCanvas = gradioApp().querySelector(selector);
                    if (otherCanvas) otherCanvas.style.zIndex = baseZIndex - 1;
                }
            });

            targetElement.style.zIndex =
                targetElement.style.zIndex !== String(baseZIndex + activeIncrement)
                ? String(baseZIndex + activeIncrement)
                : String(baseZIndex - 1);

            if (forced === "off") {
                targetElement.style.zIndex = String(baseZIndex - 1);
            } else if (forced === "on") {
                targetElement.style.zIndex = String(baseZIndex + activeIncrement);
            }
        }

        // Adjust the brush size based on the deltaY value from a mouse wheel event
        function adjustBrushSize(
            elemId,
            deltaY,
            withoutValue = false,
            percentage = 5
        ) {
            const input =
                targetElement.querySelector('.simpai-sketch input[data-role="size"]') ||
                gradioApp().querySelector(
                    `${elemId} input[aria-label='Brush radius']`
                ) ||
                gradioApp().querySelector(
                    `${elemId} button[aria-label="Use brush"]`
                );

            if (input) {
                input.click();
                if (!withoutValue) {
                    const maxValue =
                        parseFloat(input.getAttribute("max")) || 100;
                    const changeAmount = maxValue * (percentage / 100);
                    const newValue =
                        parseFloat(input.value) +
                        (deltaY > 0 ? -changeAmount : changeAmount);
                    input.value = Math.min(Math.max(newValue, 0), maxValue);
                    input.dispatchEvent(new Event("change"));
                }
            }
        }

        // Reset zoom when uploading a new image
        const fileInput = gradioApp().querySelector(
	    `${elemId} input[type="file"][accept="image/*"].svelte-116rqfv`
        );
        const customFileInput = targetElement.querySelector('input[type="file"][accept="image/*"]');
        if (fileInput || customFileInput) {
            (fileInput || customFileInput).addEventListener("click", resetZoom);
        }

        // Update the zoom level and pan position of the target element based on the values of the zoomLevel, panX and panY variables
        function updateZoom(newZoomLevel, mouseX, mouseY) {
            newZoomLevel = Math.max(0.1, Math.min(newZoomLevel, 15));

            elemData[elemId].panX +=
                mouseX - (mouseX * newZoomLevel) / elemData[elemId].zoomLevel;
            elemData[elemId].panY +=
                mouseY - (mouseY * newZoomLevel) / elemData[elemId].zoomLevel;

            targetElement.style.transformOrigin = "0 0";
            targetElement.style.transform = `translate(${elemData[elemId].panX}px, ${elemData[elemId].panY}px) scale(${newZoomLevel})`;
            targetElement.style.overflow = "visible";
            targetElement.classList.add("is-zoomed-active"); // 添加状态类

            toggleOverlap("on");
 
            return newZoomLevel;
        }

        // Change the zoom level based on user interaction
        function changeZoomLevel(operation, e) {
            if (isModifierKey(e, hotkeysConfig.canvas_hotkey_zoom)) {
                e.preventDefault();

                let zoomPosX, zoomPosY;
                let delta = 0.2;

                if (elemData[elemId].zoomLevel > 7) {
                    delta = 0.9;
                } else if (elemData[elemId].zoomLevel > 2) {
                    delta = 0.6;
                }

                zoomPosX = e.clientX;
                zoomPosY = e.clientY;

                fullScreenMode = false;
                elemData[elemId].zoomLevel = updateZoom(
                    elemData[elemId].zoomLevel +
                    (operation === "+" ? delta : -delta),
                    zoomPosX - targetElement.getBoundingClientRect().left,
                    zoomPosY - targetElement.getBoundingClientRect().top
                );

                targetElement.isZoomed = true;
            }
        }

        /**
         * This function fits the target element to the screen by calculating
         * the required scale and offsets. It also updates the global variables
         * zoomLevel, panX, and panY to reflect the new state.
         */

        function fitToElement() {
            const canvas = gradioApp().querySelector(
                `${elemId} canvas[key="interface"]`
            ) || getPrimaryCanvas();
            if (!canvas) return;

            //Reset Zoom
            targetElement.style.transform = `translate(${0}px, ${0}px) scale(${1})`;

            const parentElement = targetElement.closest('[id^="component-"]');

            // Get element and screen dimensions
            const canvasRect = canvas.getBoundingClientRect();
            const parentWidth = parentElement.clientWidth - 24;
            const parentHeight = parentElement.clientHeight;

            // Calculate scale - we want the canvas to fit the parent
            const scaleX = parentWidth / canvasRect.width;
            const scaleY = parentHeight / canvasRect.height;
            const scale = Math.min(scaleX, scaleY);

            const offsetX = 0;
            const offsetY = 0;

            // Apply scale and offsets to the element
            // Note: fitting to element usually doesn't need complex centering 
            // because it's already inside the element.
            targetElement.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

            // Update global variables
            elemData[elemId].zoomLevel = scale;
            elemData[elemId].panX = offsetX;
            elemData[elemId].panY = offsetY;

            fullScreenMode = false;
            toggleOverlap("off");
        }

        // Undo last action
        function undoLastAction(e) {
            let isCtrlPressed = isModifierKey(e, hotkeysConfig.canvas_zoom_undo_extra_key)
            const isAuxButton = e.button >= 3;
            
            if (isAuxButton) {
              isCtrlPressed = true
            } else {
              if (!isModifierKey(e, hotkeysConfig.canvas_zoom_undo_extra_key)) return;
            }

            // Move undoBtn query outside the if statement to avoid unnecessary queries
            const undoBtn = document.querySelector(`${activeElement} button[aria-label="Undo"]`);
        
            const sketch = getSimpAISketchApi();
            if (isCtrlPressed && sketch && typeof sketch.undo === "function") {
                e.preventDefault();
                if ((e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey)) && typeof sketch.redo === "function") {
                    sketch.redo();
                } else {
                    sketch.undo();
                }
                return;
            }

            if ((isCtrlPressed) && undoBtn ) {
                e.preventDefault();
                undoBtn.click();
            }
        }

        /**
         * This function fits the target element to the screen by calculating
         * the required scale and offsets. It also updates the global variables
         * zoomLevel, panX, and panY to reflect the new state.
         */

        function toggleButtons() {
            const sketch = getSimpAISketchApi();
            if (sketch && typeof sketch.toggleUi === "function") {
                sketch.toggleUi();
                return;
            }
            const undoButton = document.querySelector(`${activeElement} button[aria-label="Undo"]`);
            const clearButton = document.querySelector(`${activeElement} button[aria-label="Clear"]`);
            const removeButton = document.querySelector(`${activeElement} button[aria-label="Remove Image"]`);
            const useBrushButton = document.querySelector(`${activeElement} button[aria-label="Use brush"]`);
            const BrushRadius = document.querySelector(`${activeElement} input[aria-label="Brush radius"]`)
                || document.querySelector(`${activeElement} .simpai-sketch input[data-role="size"]`);
            const tooltip = document.querySelector(`${activeElement} .canvas-tooltip`);
            const layerforgeButtons = document.querySelectorAll(`${activeElement} .layerforge-edit-btn`);
            const customControls = document.querySelectorAll(`${activeElement} .simpai-sketch__bar`);

            if (buttonsVisible) {
                if (undoButton) undoButton.style.display = 'none';
                if (clearButton) clearButton.style.display = 'none';
                if (removeButton) removeButton.style.display = 'none';
                if (useBrushButton) useBrushButton.style.display = 'none';
                if (BrushRadius) BrushRadius.style.display = 'none';
                if (tooltip) tooltip.style.display = 'none';
                layerforgeButtons.forEach((btn) => {
                    btn.style.display = 'none';
                });
                customControls.forEach((control) => {
                    control.style.display = 'none';
                });
            } else {
                if (undoButton) undoButton.style.display = '';
                if (clearButton) clearButton.style.display = '';
                if (removeButton) removeButton.style.display = '';
                if (useBrushButton) useBrushButton.style.display = '';
                if (BrushRadius) BrushRadius.style.display = '';
                if (tooltip) tooltip.style.display = '';
                layerforgeButtons.forEach((btn) => {
                    btn.style.display = '';
                });
                customControls.forEach((control) => {
                    control.style.display = '';
                });
            }

            buttonsVisible = !buttonsVisible;
        }
        // Fullscreen mode
        function fitToScreen() {
            const sketch = getSimpAISketchApi();
            if (sketch && typeof sketch.toggleFullscreen === "function") {
                targetElement.style.transform = "";
                targetElement.style.overflow = "";
                sketch.toggleFullscreen();
                fullScreenMode = !!sketch.isFullscreen?.();
                return;
            }
            if (hasSimpAISketchShell()) return;

            const canvas = gradioApp().querySelector(
                `${elemId} canvas[key="interface"]`
            ) || getPrimaryCanvas();

            if (!canvas) return;

            targetElement.style.overflow = "visible";
            targetElement.classList.add("is-zoomed-active"); // 添加状态类

            if (fullScreenMode) {
                resetZoom();
                fullScreenMode = false;
                return;
            }

            // Reset transform for accurate measurement
            targetElement.style.transform = `translate(0px, 0px) scale(1)`;

            // Get scrollbar width to right-align the image
            const scrollbarWidth =
                window.innerWidth - document.documentElement.clientWidth;

            const screenWidth = window.innerWidth - scrollbarWidth;
            const screenHeight = window.innerHeight;

            // Use canvas for dimensions and coordinates
            const canvasRect = canvas.getBoundingClientRect();
            const elementRect = targetElement.getBoundingClientRect();

            // Calculate scale based on canvas
            const scaleX = screenWidth / canvasRect.width;
            const scaleY = screenHeight / canvasRect.height;
            const scale = Math.min(scaleX, scaleY);

            // Get the current transformOrigin
            const computedStyle = window.getComputedStyle(targetElement);
            const transformOrigin = computedStyle.transformOrigin;
            const [originX, originY] = transformOrigin.split(" ");
            const originXValue = parseFloat(originX);
            const originYValue = parseFloat(originY);

            const offsetX =
                (screenWidth - canvasRect.width * scale) / 2 -
                (elementRect.x + (canvasRect.x - elementRect.x) * scale - originXValue * (1 - scale));
            const offsetY =
                (screenHeight - canvasRect.height * scale) / 2 -
                (elementRect.y + (canvasRect.y - elementRect.y) * scale - originYValue * (1 - scale));

            // Apply scale and offsets to the element
            targetElement.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

            // Update global variables
            elemData[elemId].zoomLevel = scale;
            elemData[elemId].panX = offsetX;
            elemData[elemId].panY = offsetY;

            fullScreenMode = true;
            toggleOverlap("on");
            const canvasLabels = gradioApp().querySelectorAll(
                `${elemId} div[data-testid="block-label"]`
            );
            canvasLabels.forEach(label => label.style.display = 'none');
        }

        // Handle keydown events
        function handleKeyDown(event) {
            // Disable key locks to make pasting from the buffer work correctly
            if ((event.ctrlKey && event.code === 'KeyV') || (event.ctrlKey && event.code === 'KeyC') || event.code === "F5") {
                return;
            }

            if (!shouldHandleCanvasHotkeys(event)) return;
            const sketch = getSimpAISketchApi();
            if (sketch && event.code === hotkeysConfig.canvas_hotkey_fullscreen) {
                return;
            }

            const hotkeyActions = {
                [hotkeysConfig.canvas_hotkey_reset]: resetZoom,
                [hotkeysConfig.canvas_hotkey_overlap]: toggleOverlap,
                [hotkeysConfig.canvas_hotkey_fullscreen]: fitToScreen,
                [hotkeysConfig.canvas_zoom_hotkey_undo]: undoLastAction,
                KeyY: undoLastAction,
                [hotkeysConfig.canvas_hotkey_hide]: toggleButtons,
            };

            const action = hotkeyActions[event.code];
            if (action) {
                event.preventDefault();
                action(event);
            }

            if (
                isModifierKey(event, hotkeysConfig.canvas_hotkey_zoom) ||
                isModifierKey(event, hotkeysConfig.canvas_hotkey_adjust)
            ) {
                event.preventDefault();
            }
        }

        // Get Mouse position
        function getMousePosition(e) {
            mouseX = e.offsetX;
            mouseY = e.offsetY;
        }

        // Simulation of the function to put a long image into the screen.
        // We detect if an image has a scroll bar or not, make a fullscreen to reveal the image, then reduce it to fit into the element.
        // We hide the image and show it to the user when it is ready.

        targetElement.isExpanded = false;
        function autoExpand() {
            if (hasSimpAISketchShell()) return;
            const canvas = getPrimaryCanvas();
            if (canvas) {
                if (hasHorizontalScrollbar(targetElement) && targetElement.isExpanded === false) {
                    targetElement.style.visibility = "hidden";
                    setTimeout(() => {
                        fitToScreen();
                        resetZoom();
                        targetElement.style.visibility = "visible";
                        targetElement.isExpanded = true;
                    }, 10);
                }
            }
        }

        targetElement.addEventListener("mousemove", getMousePosition);
        targetElement.addEventListener("auxclick", undoLastAction);

        //observers
        // Creating an observer with a callback function to handle DOM changes
        const observer = new MutationObserver((mutationsList, observer) => {
            for (let mutation of mutationsList) {
              // If the style attribute of the canvas has changed, by observation it happens only when the picture changes
              if (mutation.type === 'attributes' && mutation.attributeName === 'style' &&
                mutation.target.tagName.toLowerCase() === 'canvas') {
                targetElement.isExpanded = false;
                setTimeout(resetZoom, 10);
              }
            }
          });
      
          // Apply auto expand if enabled. Custom sketch owns its own floating/fullscreen path.
          if (hotkeysConfig.canvas_auto_expand && !hasSimpAISketchShell()) {
            targetElement.addEventListener("mousemove", autoExpand);
            // Set up an observer to track attribute changes
            observer.observe(targetElement, { attributes: true, childList: true, subtree: true });
          }

        // Handle events only inside the targetElement
        let isKeyDownHandlerAttached = false;

        function attachKeyDownHandler() {
            if (!isKeyDownHandlerAttached) {
                document.addEventListener("keydown", handleKeyDown);
                isKeyDownHandlerAttached = true;

                activeElement = elemId;
            }
        }

        function detachKeyDownHandler() {
            if (isKeyDownHandlerAttached) {
                document.removeEventListener("keydown", handleKeyDown);
                isKeyDownHandlerAttached = false;
            }
        }

        function handleMouseEnter() {
            isPointerInside = true;
            activeElement = elemId;
            attachKeyDownHandler();
        }

        function handleMouseLeave() {
            isPointerInside = false;
            if (activeElement === elemId) activeElement = null;
            detachKeyDownHandler();
        }

        function handleDocumentMouseDown(e) {
            if (!targetElement.contains(e.target)) {
                isPointerInside = false;
                if (activeElement === elemId) activeElement = null;
                detachKeyDownHandler();
            }
        }

        targetElement.addEventListener("mouseenter", handleMouseEnter);
        targetElement.addEventListener("mouseleave", handleMouseLeave);
        targetElement.addEventListener("mousedown", handleMouseEnter);
        document.addEventListener("mousedown", handleDocumentMouseDown, true);

        targetElement.addEventListener("wheel", e => {
            const sketch = getSimpAISketchApi();
            // Handle brush size adjustment with ctrl key pressed
            if (isModifierKey(e, hotkeysConfig.canvas_hotkey_adjust)) {
                e.preventDefault();

                // Increase or decrease brush size based on scroll direction
                if (sketch && typeof sketch.adjustBrushSize === "function") {
                    sketch.adjustBrushSize(e.deltaY);
                } else {
                    adjustBrushSize(elemId, e.deltaY);
                }
                return;
            }

            if (sketch && isModifierKey(e, hotkeysConfig.canvas_hotkey_zoom) && typeof sketch.zoomViewport === "function") {
                e.preventDefault();
                sketch.zoomViewport(e.deltaY, e.clientX, e.clientY);
                return;
            }

            if (hasSimpAISketchShell()) return;

            // change zoom level
            const operation = e.deltaY > 0 ? "-" : "+";
            changeZoomLevel(operation, e);
        });

        // Handle the move event for pan functionality. Updates the panX and panY variables and applies the new transform to the target element.
        function handleMoveKeyDown(e) {

            // Disable key locks to make pasting from the buffer work correctly
            if ((e.ctrlKey && e.code === 'KeyV') || (e.ctrlKey && e.code === 'KeyC') || e.code === "F5") {
                return;
            }

            if (!shouldHandleCanvasHotkeys(e)) return;


            if (e.code === hotkeysConfig.canvas_hotkey_move) {
                const sketch = getSimpAISketchApi();
                if (sketch) {
                    isMoving = false;
                    return;
                }
                if (!e.ctrlKey && !e.metaKey && isKeyDownHandlerAttached) {
                    e.preventDefault();
                    document.activeElement.blur();
                    isMoving = true;
                }
            }
        }

        function handleMoveKeyUp(e) {
            if (e.code === hotkeysConfig.canvas_hotkey_move) {
                isMoving = false;
                const sketch = getSimpAISketchApi();
                if (sketch) {
                    return;
                }
            }
        }

        document.addEventListener("keydown", handleMoveKeyDown);
        document.addEventListener("keyup", handleMoveKeyUp);

        // Detect zoom level and update the pan speed.
        function updatePanPosition(movementX, movementY) {
            let panSpeed = 1;

            if (elemData[elemId].zoomLevel > 8) {
                panSpeed = 3.5;
            }

            elemData[elemId].panX += movementX * panSpeed;
            elemData[elemId].panY += movementY * panSpeed;

            // Delayed redraw of an element
            requestAnimationFrame(() => {
                targetElement.style.transform = `translate(${elemData[elemId].panX}px, ${elemData[elemId].panY}px) scale(${elemData[elemId].zoomLevel})`;
                toggleOverlap("on");
            });
        }

        function handleMoveByKey(e) {
            // 移除事件阻断方法，改用精准条件判断
            if (!isMoving || elemId !== activeElement) {
                targetElement.style.pointerEvents = "auto";
                return;
            }

            // 添加安全范围检查
            if (Math.abs(e.movementX) > 100 || Math.abs(e.movementY) > 100) return;

            const sketch = getSimpAISketchApi();
            if (sketch && typeof sketch.panFullscreen === "function") {
                if (sketch.isFullscreen?.() || sketch.isPanFloating?.()) {
                    sketch.panFullscreen(e.movementX, e.movementY);
                }
                return;
            }
            if (hasSimpAISketchShell()) return;
            updatePanPosition(e.movementX, e.movementY);
            targetElement.style.overflow = "visible";
        }


        // Prevents sticking to the mouse
        window.onblur = function() {
            isMoving = false;
        };

        // Checks for extension
        function checkForOutBox() {
            if (hasSimpAISketchShell()) return;
            const parentElement = targetElement.closest('[id^="component-"]');
            if (!parentElement) return;
            if (parentElement.offsetWidth < targetElement.offsetWidth && !targetElement.isExpanded) {
                resetZoom();
                targetElement.isExpanded = true;
            }

            if (parentElement.offsetWidth < targetElement.offsetWidth && elemData[elemId].zoomLevel == 1) {
                resetZoom();
            }

            if (parentElement.offsetWidth < targetElement.offsetWidth && targetElement.offsetWidth * elemData[elemId].zoomLevel > parentElement.offsetWidth && elemData[elemId].zoomLevel < 1 && !targetElement.isZoomed) {
                resetZoom();
            }
        }

        if (!hasSimpAISketchShell()) {
            targetElement.addEventListener("mousemove", checkForOutBox);
        }

        window.addEventListener('resize', (e) => {
            if (hasSimpAISketchShell()) return;
            resetZoom();

            targetElement.isExpanded = false;
            targetElement.isZoomed = false;
        });

        // gradioApp().addEventListener("mousemove", handleMoveByKey);
    }

    function initializeZoomTargets() {
        ["#inpaint_canvas", "#inpaint_mask_canvas", "#scene_canvas"].forEach(applyZoomAndPan);
    }

    initializeZoomTargets();
    if (typeof onAfterUiUpdate === "function") onAfterUiUpdate(initializeZoomTargets);
});
