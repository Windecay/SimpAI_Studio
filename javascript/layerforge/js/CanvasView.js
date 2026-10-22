// @ts-ignore
import { app } from "./comfy_shim.js?v=patch26";
// @ts-ignore
import { $el } from "./comfy_shim.js?v=patch26";
import { api } from "./api_shim.js?v=patch26";
import { addStylesheet, getUrl, loadTemplate } from "./utils/ResourceManager.js?v=patch26";
import { Canvas } from "./Canvas.js?v=patch66";
import { clearAllCanvasStates } from "./db.js?v=patch26";
import { ImageCache } from "./ImageCache.js?v=patch26";
import { createCanvas } from "./utils/CommonUtils.js?v=patch26";
import { createModuleLogger } from "./utils/LoggerUtils.js?v=patch26";
import { showErrorNotification, showSuccessNotification, showInfoNotification, showWarningNotification } from "./utils/NotificationUtils.js?v=patch26";
import { iconLoader, LAYERFORGE_TOOLS } from "./utils/IconLoader.js?v=patch26";
import { setupSAMDetectorHook } from "./SAMDetectorIntegration.js?v=patch26";
import { OpenPoseEditor } from "./OpenPoseEditor.js?v=patch26";
const log = createModuleLogger('Canvas_view');
const studioRoot = new URL('../../../../', import.meta.url);
export async function createCanvasWidget(node, widget, app) {
    const canvas = new Canvas(node, widget, {
        onStateChange: () => updateOutput(node, canvas)
    });
    const openPoseEditor = new OpenPoseEditor();
    const imageCache = new ImageCache();
    const updateSwitchIcon = (knobIconEl, isChecked, iconToolTrue, iconToolFalse, fallbackTrue, fallbackFalse) => {
        if (!knobIconEl)
            return;
        const iconTool = isChecked ? iconToolTrue : iconToolFalse;
        const fallbackText = isChecked ? fallbackTrue : fallbackFalse;
        const icon = iconLoader.getIcon(iconTool);
        knobIconEl.innerHTML = ''; // Clear previous icon
        if (icon instanceof HTMLImageElement) {
            const clonedIcon = icon.cloneNode();
            clonedIcon.style.width = '20px';
            clonedIcon.style.height = '20px';
            knobIconEl.appendChild(clonedIcon);
        }
        else {
            knobIconEl.textContent = fallbackText;
        }
    };
    const helpTooltip = $el("div.painter-tooltip", {
        id: `painter-help-tooltip-${node.id}`,
    });
    const helpText = (key) => window.LayerForgeI18n?.text?.(key) || key;
    const tooltipTitle = $el('span.painter-tooltip-title', { id: `painter-help-title-${node.id}` });
    const tooltipClose = $el('button.painter-tooltip-close', {
        type: 'button',
        textContent: '\u00d7',
        title: helpText('Close'),
    });
    tooltipClose.setAttribute('aria-label', helpText('Close'));
    const tooltipContent = $el('div.painter-tooltip-content', { tabIndex: 0 });
    helpTooltip.setAttribute('role', 'dialog');
    helpTooltip.setAttribute('aria-modal', 'false');
    helpTooltip.setAttribute('aria-labelledby', tooltipTitle.id);
    helpTooltip.append($el('div.painter-tooltip-header', {}, [tooltipTitle, tooltipClose]), tooltipContent);
    let tooltipAnchor = null;
    let tooltipPinned = false;
    let tooltipHtml = '';
    let tooltipHideTimer = null;
    const [standardShortcuts, maskShortcuts, systemClipboardTooltip, clipspaceClipboardTooltip] = await Promise.all([
        loadTemplate('./templates/standard_shortcuts.html?v=patch64'),
        loadTemplate('./templates/mask_shortcuts.html?v=patch64'),
        loadTemplate('./templates/system_clipboard_tooltip.html'),
        loadTemplate('./templates/clipspace_clipboard_tooltip.html')
    ]);
    document.body.appendChild(helpTooltip);
    const tooltipVisible = () => helpTooltip.style.display === 'flex';
    const cancelTooltipHide = () => {
        clearTimeout(tooltipHideTimer);
        tooltipHideTimer = null;
    };
    const positionTooltip = () => {
        if (!tooltipVisible() || !tooltipAnchor?.isConnected) return;
        const viewport = window.visualViewport;
        const viewportWidth = viewport?.width || window.innerWidth;
        const viewportHeight = viewport?.height || window.innerHeight;
        const viewportLeft = viewport?.offsetLeft || 0;
        const viewportTop = viewport?.offsetTop || 0;
        const margin = 10;
        helpTooltip.style.maxWidth = `${Math.max(1, viewportWidth - margin * 2)}px`;
        const buttonRect = tooltipAnchor.getBoundingClientRect();
        const below = Math.max(0, viewportTop + viewportHeight - margin - buttonRect.bottom - 5);
        const above = Math.max(0, buttonRect.top - viewportTop - margin - 5);
        const placeBelow = below >= above;
        helpTooltip.style.maxHeight = `${Math.max(1, placeBelow ? below : above)}px`;
        const tooltipRect = helpTooltip.getBoundingClientRect();
        let left = buttonRect.left;
        let top = placeBelow ? buttonRect.bottom + 5 : buttonRect.top - tooltipRect.height - 5;
        if (left + tooltipRect.width > viewportLeft + viewportWidth - margin) {
            left = viewportLeft + viewportWidth - tooltipRect.width - margin;
        }
        left = Math.max(viewportLeft + margin, left);
        top = Math.max(viewportTop + margin, top);
        helpTooltip.style.left = `${left}px`;
        helpTooltip.style.top = `${top}px`;
    };
    const showTooltip = (buttonElement, content, pinned = false, title = 'Keyboard shortcuts') => {
        cancelTooltipHide();
        if (tooltipPinned && tooltipAnchor !== buttonElement && !pinned) return;
        const sameContent = tooltipAnchor === buttonElement && tooltipHtml === content;
        if (tooltipAnchor && tooltipAnchor !== buttonElement) tooltipAnchor.setAttribute('aria-expanded', 'false');
        if (!sameContent) {
            tooltipContent.innerHTML = content;
            tooltipContent.scrollTop = 0;
        }
        tooltipHtml = content;
        tooltipPinned = pinned || (sameContent && tooltipPinned);
        tooltipAnchor = buttonElement;
        tooltipTitle.textContent = helpText(title);
        tooltipAnchor.setAttribute('aria-expanded', 'true');
        helpTooltip.dataset.pinned = String(tooltipPinned);
        helpTooltip.style.visibility = 'hidden';
        helpTooltip.style.display = 'flex';
        positionTooltip();
        helpTooltip.style.visibility = 'visible';
        if (pinned) tooltipContent.focus({ preventScroll: true });
    };
    const hideTooltip = (restoreFocus = false) => {
        cancelTooltipHide();
        const anchor = tooltipAnchor;
        anchor?.setAttribute('aria-expanded', 'false');
        helpTooltip.style.display = 'none';
        tooltipAnchor = null;
        tooltipPinned = false;
        helpTooltip.dataset.pinned = 'false';
        if (restoreFocus && anchor?.isConnected) anchor.focus({ preventScroll: true });
    };
    const scheduleTooltipHide = () => {
        cancelTooltipHide();
        if (!tooltipPinned) tooltipHideTimer = setTimeout(() => hideTooltip(), 180);
    };
    tooltipClose.onclick = () => hideTooltip(true);
    helpTooltip.addEventListener('mouseenter', cancelTooltipHide);
    helpTooltip.addEventListener('mouseleave', scheduleTooltipHide);
    helpTooltip.addEventListener('wheel', (event) => event.stopPropagation(), { passive: true });
    document.addEventListener('pointerdown', (event) => {
        if (tooltipVisible() && !helpTooltip.contains(event.target) && !tooltipAnchor?.contains(event.target)) hideTooltip();
    }, { capture: true });
    window.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !tooltipVisible()) return;
        event.preventDefault();
        event.stopPropagation();
        hideTooltip(true);
    }, { capture: true });
    window.addEventListener('resize', positionTooltip, { passive: true });
    window.visualViewport?.addEventListener('resize', positionTooltip, { passive: true });
    document.addEventListener('scroll', (event) => {
        if (!helpTooltip.contains(event.target)) positionTooltip();
    }, { capture: true, passive: true });
    const controlPanel = $el("div.painterControlPanel", {}, [
        $el("div.controls.painter-controls", {
            style: {
                position: "absolute",
                top: "0",
                left: "0",
                right: "0",
                zIndex: "10",
            },
        }, [
            $el("div.painter-button-group", {}, [
                $el("button.painter-button.icon-button", {
                    id: `open-editor-btn-${node.id}`,
                    textContent: "⛶",
                    title: "在编辑器中打开",
                }),
                $el("button.painter-button.icon-button.mobile-only", {
                    id: `toggle-layers-btn-${node.id}`,
                    textContent: "☰",
                    title: "图层面板",
                }),
                $el("button.painter-button.icon-button", {
                    id: `toggle-aspect-btn-${node.id}`,
                    textContent: "⛓",
                    title: "等比缩放",
                }),
                $el("button.painter-button.icon-button", {
                    id: `help-shortcuts-btn-${node.id}`,
                    textContent: "?",
                    title: helpText('Keyboard shortcuts'),
                    ariaHasPopup: 'dialog',
                    ariaExpanded: 'false',
                    onmouseenter: (e) => {
                        const content = canvas.maskTool.isActive ? maskShortcuts : standardShortcuts;
                        showTooltip(e.currentTarget, content);
                    },
                    onmouseleave: scheduleTooltipHide,
                    onclick: (e) => {
                        if (tooltipVisible() && tooltipAnchor === e.currentTarget && tooltipPinned) hideTooltip(true);
                        else showTooltip(e.currentTarget, canvas.maskTool.isActive ? maskShortcuts : standardShortcuts, true);
                    }
                }),
                $el("button.painter-button.primary", {
                    textContent: "添加图像",
                    title: "从文件添加图像",
                    onclick: () => {
                        const fitOnAddWidget = node.widgets.find((w) => w.name === "fit_on_add");
                        const addMode = fitOnAddWidget && fitOnAddWidget.value ? 'fit' : 'center';
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.multiple = true;
                        input.onchange = async (e) => {
                            const target = e.target;
                            if (!target.files)
                                return;
                            for (const file of target.files) {
                                const reader = new FileReader();
                                reader.onload = (event) => {
                                    const img = new Image();
                                    img.onload = () => {
                                        canvas.addLayer(img, {}, addMode);
                                    };
                                    if (event.target?.result) {
                                        img.src = event.target.result;
                                    }
                                };
                                reader.readAsDataURL(file);
                            }
                        };
                        input.click();
                    }
                }),
                $el("button.painter-button.primary", {
                    textContent: "导入输入",
                    title: "从其他节点导入图像",
                    onclick: () => {
                        if (window.self !== window.top || window.location.search.includes("api_url")) {
                            window.parent.postMessage({ type: 'REQUEST_INPUT' }, '*');
                        } else {
                            canvas.canvasIO.importLatestImage();
                        }
                    }
                }),
                $el("div.painter-clipboard-group", {}, [
                    $el("button.painter-button.primary", {
                        textContent: "粘贴图像",
                        title: "从剪贴板粘贴图像",
                        onclick: () => {
                            const fitOnAddWidget = node.widgets.find((w) => w.name === "fit_on_add");
                            const addMode = fitOnAddWidget && fitOnAddWidget.value ? 'fit' : 'center';
                            canvas.canvasLayers.handlePaste(addMode);
                        }
                    }),
                    (() => {
                        // Modern clipboard switch
                        // Initial state: checked = clipspace, unchecked = system
                        const isClipspace = canvas.canvasLayers.clipboardPreference === 'clipspace';
                        const switchId = `clipboard-switch-${node.id}`;
                        const switchEl = $el("label.clipboard-switch", { id: switchId }, [
                            $el("input", {
                                type: "checkbox",
                                checked: isClipspace,
                                onchange: (e) => {
                                    const checked = e.target.checked;
                                    canvas.canvasLayers.clipboardPreference = checked ? 'clipspace' : 'system';
                                    // For accessibility, update ARIA label
                                    switchEl.setAttribute('aria-label', checked ? "剪贴板：Clipspace" : "剪贴板：系统");
                                    log.info(`Clipboard preference toggled to: ${canvas.canvasLayers.clipboardPreference}`);
                                }
                            }),
                            $el("span.switch-track"),
                            $el("span.switch-labels", {}, [
                                $el("span.text-clipspace", {}, ["Clipspace"]),
                                $el("span.text-system", {}, ["系统"])
                            ]),
                            $el("span.switch-knob", {}, [
                                $el("span.switch-icon")
                            ])
                        ]);
                        // Helper function to get current tooltip content based on switch state
                        const getCurrentTooltipContent = () => {
                            const checked = switchEl.querySelector('input[type="checkbox"]').checked;
                            return checked ? clipspaceClipboardTooltip : systemClipboardTooltip;
                        };
                        // Helper function to update tooltip content if it's currently visible
                        const updateTooltipIfVisible = () => {
                            // Only update if tooltip is currently visible
                            if (tooltipVisible() && tooltipAnchor === switchEl) {
                                const tooltipContent = getCurrentTooltipContent();
                                showTooltip(switchEl, tooltipContent, tooltipPinned, 'Clipboard help');
                            }
                        };
                        // Tooltip logic
                        switchEl.addEventListener("mouseenter", (e) => {
                            const tooltipContent = getCurrentTooltipContent();
                            showTooltip(switchEl, tooltipContent, false, 'Clipboard help');
                        });
                        switchEl.addEventListener("mouseleave", scheduleTooltipHide);
                        // Dynamic icon update on toggle
                        const input = switchEl.querySelector('input[type="checkbox"]');
                        const knobIcon = switchEl.querySelector('.switch-knob .switch-icon');
                        input.addEventListener('change', () => {
                            updateSwitchIcon(knobIcon, input.checked, LAYERFORGE_TOOLS.CLIPSPACE, LAYERFORGE_TOOLS.SYSTEM_CLIPBOARD, "🗂️", "📋");
                            // Update tooltip content immediately after state change
                            updateTooltipIfVisible();
                        });
                        // Initial state
                        iconLoader.preloadToolIcons().then(() => {
                            updateSwitchIcon(knobIcon, isClipspace, LAYERFORGE_TOOLS.CLIPSPACE, LAYERFORGE_TOOLS.SYSTEM_CLIPBOARD, "🗂️", "📋");
                        });
                        return switchEl;
                    })()
                ]),
            ]),
            $el("div.painter-separator"),
            $el("div.painter-button-group", {}, [
                $el("button.painter-button.requires-selection", {
                    textContent: "自动调整输出",
                    title: "自动调整输出区域以适应选定图层",
                    onclick: () => {
                        const selectedLayers = canvas.canvasSelection.selectedLayers;
                        if (selectedLayers.length === 0) {
                            showWarningNotification("请先选择一个或多个图层");
                            return;
                        }
                        const success = canvas.canvasLayers.autoAdjustOutputToSelection();
                        if (success) {
                            const bounds = canvas.outputAreaBounds;
                            showSuccessNotification(`输出区域已调整为 ${bounds.width}x${bounds.height}px`);
                        }
                        else {
                            showErrorNotification("无法计算有效的输出区域尺寸");
                        }
                    }
                }),
                $el("button.painter-button", {
                    textContent: "输出区域大小",
                    title: "变换输出区域 - 拖动手柄调整大小",
                    onclick: () => {
                        // Activate output area transform mode
                        canvas.canvasInteractions.activateOutputAreaTransform();
                        showInfoNotification("点击并拖动手柄以调整输出区域大小。点击其他位置退出。", 3000);
                    }
                }),
                $el("button.painter-button.requires-selection", {
                    textContent: "移除图层",
                    title: "移除选定图层",
                    onclick: () => canvas.removeSelectedLayers()
                }),
                $el("button.painter-button.requires-selection", {
                    textContent: "图层上移",
                    title: "上移选定图层",
                    onclick: () => canvas.canvasLayers.moveLayerUp()
                }),
                $el("button.painter-button.requires-selection", {
                    textContent: "图层下移",
                    title: "下移选定图层",
                    onclick: () => canvas.canvasLayers.moveLayerDown()
                }),
                $el("button.painter-button.requires-selection", {
                    textContent: "合并图层",
                    title: "将选定图层合并为单个图层",
                    onclick: () => canvas.canvasLayers.fuseLayers()
                }),
            ]),
            $el("div.painter-separator"),
            $el("div.painter-button-group", {}, [
                (() => {
                    const switchEl = $el("label.clipboard-switch.requires-selection", {
                        id: `crop-transform-switch-${node.id}`,
                        title: "在变换和裁剪模式之间切换选定图层"
                    }, [
                        $el("input", {
                            type: "checkbox",
                            checked: false,
                            onchange: (e) => {
                                const isCropMode = e.target.checked;
                                const selectedLayers = canvas.canvasSelection.selectedLayers;
                                if (selectedLayers.length === 0)
                                    return;
                                selectedLayers.forEach((layer) => {
                                    layer.cropMode = isCropMode;
                                    if (isCropMode && !layer.cropBounds) {
                                        layer.cropBounds = { x: 0, y: 0, width: layer.originalWidth, height: layer.originalHeight };
                                    }
                                });
                                canvas.saveState();
                                canvas.render();
                            }
                        }),
                        $el("span.switch-track"),
                        $el("span.switch-labels", { style: { fontSize: "11px" } }, [
                            $el("span.text-clipspace", {}, ["裁剪"]),
                            $el("span.text-system", {}, ["变换"])
                        ]),
                        $el("span.switch-knob", {}, [
                            $el("span.switch-icon", { id: `crop-transform-icon-${node.id}` })
                        ])
                    ]);
                    const input = switchEl.querySelector('input[type="checkbox"]');
                    const knobIcon = switchEl.querySelector('.switch-icon');
                    input.addEventListener('change', () => {
                        updateSwitchIcon(knobIcon, input.checked, LAYERFORGE_TOOLS.CROP, LAYERFORGE_TOOLS.TRANSFORM, "✂️", "✥");
                    });
                    // Initial state
                    iconLoader.preloadToolIcons().then(() => {
                        updateSwitchIcon(knobIcon, false, // Initial state is transform
                        LAYERFORGE_TOOLS.CROP, LAYERFORGE_TOOLS.TRANSFORM, "✂️", "✥");
                    });
                    return switchEl;
                })(),
                $el("button.painter-button.requires-selection", {
                    textContent: "旋转 +90°",
                    title: "将选定图层旋转 +90 度",
                    onclick: () => canvas.canvasLayers.rotateLayer(90)
                }),
                $el("button.painter-button.requires-selection", {
                    textContent: "放大 +5%",
                    title: "将选定图层放大 5%",
                    onclick: () => canvas.canvasLayers.resizeLayer(1.05)
                }),
                $el("button.painter-button.requires-selection", {
                    textContent: "缩小 -5%",
                    title: "将选定图层缩小 5%",
                    onclick: () => canvas.canvasLayers.resizeLayer(0.95)
                }),
                $el("button.painter-button.requires-selection", {
                    textContent: "水平镜像",
                    title: "水平镜像选定图层",
                    onclick: () => canvas.canvasLayers.mirrorHorizontal()
                }),
                $el("button.painter-button.requires-selection", {
                    textContent: "垂直镜像",
                    title: "垂直镜像选定图层",
                    onclick: () => canvas.canvasLayers.mirrorVertical()
                }),
            ]),
            $el("div.painter-separator"),
            $el("div.painter-button-group", {}, [
                $el("button.painter-button.info.requires-selection.matting-button", {
                    textContent: "抠图",
                    title: "对选定图层执行背景移除",
                    onclick: async (e) => {
                        const button = e.target.closest('.matting-button');
                        if (button.classList.contains('loading'))
                            return;
                        try {
                            // First check if model is available
                            const modelCheckResponse = await fetch(new URL('matting/check-model', studioRoot));
                            if (!modelCheckResponse.ok) {
                                throw new Error(`${modelCheckResponse.status} ${modelCheckResponse.statusText}`);
                            }
                            const modelStatus = await modelCheckResponse.json();
                            if (!modelStatus.available) {
                                switch (modelStatus.reason) {
                                    case 'missing_dependency':
                                        showErrorNotification(modelStatus.message, 8000);
                                        return;
                                    case 'not_downloaded':
                                        showWarningNotification("需要先下载抠图模型。这将在您继续时自动发生（需要互联网连接）。", 5000);
                                        // Ask user if they want to proceed with download
                                        if (!confirm("需要下载抠图模型（约 1GB）。这是一次性下载。您要继续吗？")) {
                                            return;
                                        }
                                        showInfoNotification("正在下载抠图模型... 这可能需要几分钟。", 10000);
                                        break;
                                    case 'corrupted':
                                        showErrorNotification(modelStatus.message, 8000);
                                        return;
                                    case 'error':
                                        showErrorNotification(`检查模型时出错: ${modelStatus.message}`, 5000);
                                        return;
                                }
                            }
                            // Proceed with matting
                            const spinner = $el("div.matting-spinner");
                            button.appendChild(spinner);
                            button.classList.add('loading');
                            if (modelStatus.available) {
                                showInfoNotification("开始背景移除过程...", 2000);
                            }
                            if (canvas.canvasSelection.selectedLayers.length !== 1) {
                                throw new Error("请选择且仅选择一个图像图层进行抠图。");
                            }
                            const selectedLayer = canvas.canvasSelection.selectedLayers[0];
                            const selectedLayerIndex = canvas.layers.indexOf(selectedLayer);
                            const imageData = await canvas.canvasLayers.getLayerImageData(selectedLayer);
                            const response = await fetch(new URL('matting', studioRoot), {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ image: imageData })
                            });
                            const result = await response.json();
                            if (!response.ok) {
                                let errorMsg = `Server error: ${response.status} - ${response.statusText}`;
                                if (result && result.error) {
                                    // Handle specific error types
                                    if (result.error === "Network Connection Error") {
                                        showErrorNotification("下载抠图模型失败。请检查您的互联网连接并重试。", 8000);
                                        return;
                                    }
                                    else if (result.error === "Matting Model Error") {
                                        showErrorNotification(result.details || "模型加载错误。请检查控制台以获取详细信息。", 8000);
                                        return;
                                    }
                                    else if (result.error === "Dependency Not Found") {
                                        showErrorNotification(result.details || "缺少所需的依赖项。", 8000);
                                        return;
                                    }
                                    errorMsg = `${result.error}: ${result.details || 'Check console'}`;
                                }
                                throw new Error(errorMsg);
                            }
                            const mattedImage = new Image();
                            mattedImage.src = result.matted_image;
                            await mattedImage.decode();
                            const layerIndex = canvas.layers.findIndex((l) => l && l.id === selectedLayer.id);
                            if (layerIndex === -1) {
                                throw new Error("无法定位所选图层");
                            }
                            const targetLayer = canvas.layers[layerIndex];
                            targetLayer.image = mattedImage;
                            targetLayer.flipH = false;
                            targetLayer.flipV = false;
                            delete targetLayer.imageId;
                            canvas.canvasSelection.updateSelection([targetLayer]);
                            // Invalidate processed image cache when layer image changes (matting)
                            canvas.canvasLayers.invalidateProcessedImageCache(targetLayer.id);
                            canvas.render();
                            canvas.saveState();
                            canvas.canvasLayersPanel?.renderLayers?.();
                            showSuccessNotification("背景移除成功！");
                        }
                        catch (error) {
                            const errorMessage = error.message || "An unknown error occurred.";
                            if (!errorMessage.includes("Network Connection Error") &&
                                !errorMessage.includes("Matting Model Error") &&
                                !errorMessage.includes("Dependency Not Found")) {
                                showErrorNotification(`抠图失败: ${errorMessage}`);
                            }
                        }
                        finally {
                            button.classList.remove('loading');
                            const spinner = button.querySelector('.matting-spinner');
                            if (spinner && button.contains(spinner)) {
                                button.removeChild(spinner);
                            }
                        }
                    }
                }),
                $el("button.painter-button.info.requires-selection.sam3-matting-button", {
                    textContent: "智能抠图",
                    title: "使用 SAM3 通过点选进行交互式抠图（右键为负样本）",
                    onclick: async (e) => {
                        const button = e.target.closest('.sam3-matting-button');
                        if (button.classList.contains('loading'))
                            return;
                        const spinner = $el("div.matting-spinner");
                        button.appendChild(spinner);
                        button.classList.add('loading');
                        try {
                            const modelCheckResponse = await fetch(new URL('sam3/check-model', studioRoot));
                            if (!modelCheckResponse.ok) {
                                throw new Error(`${modelCheckResponse.status} ${modelCheckResponse.statusText}`);
                            }
                            const modelStatus = await modelCheckResponse.json();
                            if (!modelStatus.available) {
                                if (modelStatus.reason === 'not_downloaded') {
                                    const message = "SAM3.1 is missing. Install it through model management or the current preset model downloads, then retry.";
                                    showWarningNotification(window.LayerForgeI18n?.text(message) || message, 8000);
                                    return;
                                }
                                else {
                                    showErrorNotification(modelStatus.message || "SAM3 模型不可用", 8000);
                                    return;
                                }
                            }
                            if (canvas.canvasSelection.selectedLayers.length !== 1) {
                                showWarningNotification("请选择且仅选择一个图像图层进行智能抠图");
                                return;
                            }
                            const selectedLayer = canvas.canvasSelection.selectedLayers[0];
                            const imageData = await canvas.canvasLayers.getLayerImageData(selectedLayer);
                            const modalId = `sam3_image_mask_modal_backdrop_${node.id}`;
                            if (document.getElementById(modalId)) {
                                return;
                            }
                            const state = {
                                open: false,
                                pointsPos: [],
                                pointsNeg: [],
                                running: false,
                                pending: false,
                                pendingFinal: false,
                                confirmRequested: false,
                                hadRunOnce: false,
                                pointsVersion: 0,
                                lastRunVersion: -1,
                                lastChangeTs: 0,
                                debounceTimer: null,
                                baseImg: null,
                                maskImg: null,
                                cutoutDataUrl: null,
                                overlayCanvas: null,
                                overlayImgVersion: null,
                                history: [],
                                historyIndex: -1,
                                viewScale: 1,
                                spaceDown: false,
                                sam3MaskThreshold: 0.5,
                                sam3CloseRadius: 1,
                                invertMask: false,
                                posHit: null,
                                negHit: null,
                            };
                            const backdrop = $el("div", {
                                id: modalId,
                                style: {
                                    position: "fixed",
                                    inset: "0",
                                    background: "rgba(0,0,0,0.7)",
                                    zIndex: "99999",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                }
                            });
                            const modal = $el("div", {
                                style: {
                                    width: "min(1100px, 92vw)",
                                    height: "min(780px, 92vh)",
                                    background: "#111827",
                                    border: "1px solid rgba(255,255,255,0.12)",
                                    borderRadius: "14px",
                                    boxShadow: "0 18px 60px rgba(0,0,0,0.5)",
                                    display: "flex",
                                    flexDirection: "column",
                                    overflow: "hidden",
                                }
                            });
                            const header = $el("div", {
                                style: {
                                    display: "flex",
                                    flexDirection: "column",
                                    padding: "10px 14px",
                                    borderBottom: "1px solid rgba(255,255,255,0.10)",
                                    gap: "8px",
                                }
                            });
                            const headerTop = $el("div", {
                                style: {
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: "10px",
                                    flexWrap: "wrap",
                                }
                            });
                            const headerTitle = $el("div", { style: { display: "flex", flexDirection: "column", gap: "2px", minWidth: "0", flex: "1 1 240px" } }, [
                                $el("div", { style: { color: "white", fontSize: "14px", fontWeight: "600", whiteSpace: "nowrap" } }, ["智能抠图"]),
                                $el("div", { style: { color: "rgba(255,255,255,0.65)", fontSize: "12px" } }, ["左键添加绿色点；右键添加红色点；点击“确认”生成图层"]),
                            ]);
                            const headerActions = $el("div", { style: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end", flex: "1 1 320px" } });
                            const headerBottom = $el("div", {
                                style: {
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    flexWrap: "wrap",
                                }
                            });
                            headerTop.appendChild(headerTitle);
                            headerTop.appendChild(headerActions);
                            header.appendChild(headerTop);
                            header.appendChild(headerBottom);
                            const realtimeCheckbox = $el("input", { type: "checkbox", checked: true });
                            const fillHolesCheckbox = $el("input", { type: "checkbox", checked: false });
                            const closeEdgesCheckbox = $el("input", { type: "checkbox", checked: true });
                            const mergeToMaskCheckbox = $el("input", { type: "checkbox", checked: false });
                            const mkSlider = (labelText, min, max, step, initialValue, valueFormatter) => {
                                const input = $el("input", {
                                    type: "range",
                                    min: String(min),
                                    max: String(max),
                                    step: String(step),
                                    value: String(initialValue),
                                    style: { width: "110px" }
                                });
                                const valueEl = $el("span", { style: { color: "rgba(255,255,255,0.75)", fontSize: "11px", minWidth: "34px", textAlign: "right" } }, [
                                    valueFormatter(initialValue)
                                ]);
                                const wrap = $el("div", { style: { display: "flex", alignItems: "center", gap: "6px" } }, [
                                    $el("span", { style: { color: "rgba(255,255,255,0.8)", fontSize: "12px", userSelect: "none" } }, [labelText]),
                                    input,
                                    valueEl
                                ]);
                                return { wrap, input, valueEl };
                            };
                            const maskThresholdSlider = mkSlider(window.LayerForgeI18n?.text?.("Mask probability threshold") || "Mask probability threshold", 0.05, 0.95, 0.01, state.sam3MaskThreshold, (v) => Number(v).toFixed(2));
                            const closeRadiusSlider = mkSlider("close", 0, 6, 1, state.sam3CloseRadius, (v) => String(parseInt(String(v), 10)));
                            const btnUndo = $el("button", {
                                className: "painter-button",
                                textContent: "撤销",
                                style: { height: "30px", minWidth: "64px" },
                            });
                            const btnRedo = $el("button", {
                                className: "painter-button",
                                textContent: "重做",
                                style: { height: "30px", minWidth: "64px" },
                            });
                            const btnClear = $el("button", {
                                className: "painter-button",
                                textContent: "清空",
                                style: { height: "30px", minWidth: "64px" },
                            });
                            const btnInvert = $el("button", {
                                className: "painter-button",
                                textContent: "反向蒙版",
                                style: { height: "30px", minWidth: "86px", opacity: "0.85" },
                            });
                            const btnCancel = $el("button", {
                                className: "painter-button",
                                textContent: "取消",
                                style: { height: "30px", minWidth: "64px" },
                            });
                            const btnConfirm = $el("button", {
                                className: "painter-button",
                                textContent: "确认",
                                style: { height: "30px", minWidth: "64px" },
                            });
                            headerActions.appendChild(btnUndo);
                            headerActions.appendChild(btnRedo);
                            headerActions.appendChild(btnClear);
                            headerActions.appendChild(btnInvert);
                            headerActions.appendChild(btnCancel);
                            headerActions.appendChild(btnConfirm);
                            headerBottom.appendChild($el("label", { style: { display: "flex", alignItems: "center", gap: "6px", color: "rgba(255,255,255,0.8)", fontSize: "12px", userSelect: "none", whiteSpace: "nowrap" } }, [
                                realtimeCheckbox,
                                $el("span", {}, ["实时生成"])
                            ]));
                            headerBottom.appendChild(maskThresholdSlider.wrap);
                            headerBottom.appendChild($el("label", { style: { display: "flex", alignItems: "center", gap: "6px", color: "rgba(255,255,255,0.8)", fontSize: "12px", userSelect: "none", whiteSpace: "nowrap" } }, [
                                closeEdgesCheckbox,
                                $el("span", {}, ["边缘闭合"])
                            ]));
                            headerBottom.appendChild(closeRadiusSlider.wrap);
                            headerBottom.appendChild($el("label", { style: { display: "flex", alignItems: "center", gap: "6px", color: "rgba(255,255,255,0.8)", fontSize: "12px", userSelect: "none", whiteSpace: "nowrap" } }, [
                                fillHolesCheckbox,
                                $el("span", {}, ["填充孔洞"])
                            ]));
                            headerBottom.appendChild($el("label", { style: { display: "flex", alignItems: "center", gap: "6px", color: "rgba(255,255,255,0.8)", fontSize: "12px", userSelect: "none", whiteSpace: "nowrap" } }, [
                                mergeToMaskCheckbox,
                                $el("span", {}, ["合并到蒙版"])
                            ]));
                            const body = $el("div", {
                                style: {
                                    position: "relative",
                                    flex: "1",
                                    padding: "0",
                                    background: "#0b1020",
                                    overflow: "hidden",
                                }
                            });
                            const canvasWrap = $el("div", {
                                style: {
                                    position: "absolute",
                                    inset: "10px",
                                    display: "block",
                                    overflow: "auto",
                                }
                            });
                            const canvasStage = $el("div", {
                                style: {
                                    minWidth: "100%",
                                    minHeight: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                }
                            });
                            const busyOverlayText = $el("div", {
                                style: {
                                    marginTop: "10px",
                                    color: "rgba(255,255,255,0.9)",
                                    fontSize: "13px",
                                    textAlign: "center",
                                    maxWidth: "420px",
                                    lineHeight: "1.4",
                                }
                            }, ["正在加载..."]);
                            const busyOverlay = $el("div", {
                                style: {
                                    position: "absolute",
                                    inset: "0",
                                    display: "none",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: "rgba(11, 16, 32, 0.35)",
                                    zIndex: "2",
                                }
                            }, [
                                $el("div", { style: { display: "flex", flexDirection: "column", alignItems: "center" } }, [
                                    $el("div.matting-spinner"),
                                    busyOverlayText,
                                ])
                            ]);
                            const editorCanvas = $el("canvas", {
                                style: {
                                    background: "transparent",
                                    borderRadius: "10px",
                                    boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
                                    display: "block",
                                    cursor: "crosshair",
                                }
                            });
                            canvasStage.appendChild(editorCanvas);
                            canvasWrap.appendChild(canvasStage);
                            body.appendChild(canvasWrap);
                            body.appendChild(busyOverlay);
                            modal.appendChild(header);
                            modal.appendChild(body);
                            backdrop.appendChild(modal);
                            document.body.appendChild(backdrop);
                            const ctx = editorCanvas.getContext("2d");
                            if (!ctx) {
                                backdrop.remove();
                                throw new Error("Canvas context not available");
                            }
                            let onKeydown = null;
                            let onKeyup = null;
                            let onWindowMousemove = null;
                            let onWindowMouseup = null;
                            const ownsModal = () => document.getElementById(modalId) === backdrop;
                            const isCurrentModal = () => state.open && ownsModal();
                            const closeModal = () => {
                                if (!ownsModal()) return;
                                state.open = false;
                                state.confirmRequested = false;
                                state.pending = false;
                                state.pendingFinal = false;
                                if (state.debounceTimer) {
                                    clearTimeout(state.debounceTimer);
                                    state.debounceTimer = null;
                                }
                                window.removeEventListener("resize", layoutCanvas);
                                if (onKeydown) {
                                    window.removeEventListener("keydown", onKeydown, true);
                                }
                                if (onKeyup) {
                                    window.removeEventListener("keyup", onKeyup);
                                }
                                if (onWindowMousemove) {
                                    window.removeEventListener("mousemove", onWindowMousemove);
                                }
                                if (onWindowMouseup) {
                                    window.removeEventListener("mouseup", onWindowMouseup);
                                }
                                try {
                                    fetch(new URL('sam3/offload', studioRoot), { method: "POST" }).catch(() => { });
                                }
                                catch {
                                }
                                backdrop.remove();
                            };
                            const layoutCanvas = () => {
                                if (!state.open || !state.baseImg)
                                    return;
                                const dpr = window.devicePixelRatio || 1;
                                state.viewDpr = dpr;
                                const imgW = state.baseImg.width;
                                const imgH = state.baseImg.height;
                                const cssW = Math.max(1, Math.round(imgW * Math.max(0.0001, state.viewScale)));
                                const cssH = Math.max(1, Math.round(imgH * Math.max(0.0001, state.viewScale)));
                                editorCanvas.style.width = cssW + "px";
                                editorCanvas.style.height = cssH + "px";
                                state.viewCssW = cssW;
                                state.viewCssH = cssH;
                                editorCanvas.width = Math.max(1, Math.round(cssW * dpr));
                                editorCanvas.height = Math.max(1, Math.round(cssH * dpr));
                                canvasStage.style.width = Math.max(cssW, canvasWrap.clientWidth || 0) + "px";
                                canvasStage.style.height = Math.max(cssH, canvasWrap.clientHeight || 0) + "px";
                                draw();
                            };
                            const buildOverlayCanvas = async () => {
                                if (!state.baseImg || !state.maskImg)
                                    return;
                                const w = state.baseImg.width;
                                const h = state.baseImg.height;
                                const oc = document.createElement("canvas");
                                oc.width = w;
                                oc.height = h;
                                const octx = oc.getContext("2d");
                                if (!octx)
                                    return;
                                octx.clearRect(0, 0, w, h);
                                octx.drawImage(state.maskImg, 0, 0, w, h);
                                const imgData = octx.getImageData(0, 0, w, h);
                                const d = imgData.data;
                                for (let i = 0; i < d.length; i += 4) {
                                    const a0 = d[i];
                                    const a = state.invertMask ? (255 - a0) : a0;
                                    d[i] = 112;
                                    d[i + 1] = 255;
                                    d[i + 2] = 129;
                                    d[i + 3] = a;
                                }
                                octx.putImageData(imgData, 0, 0);
                                state.overlayCanvas = oc;
                            };
                            const buildCutoutFromMask = () => {
                                if (!state.baseImg || !state.maskImg)
                                    return;
                                const w = state.baseImg.width;
                                const h = state.baseImg.height;
                                const c = document.createElement("canvas");
                                c.width = w;
                                c.height = h;
                                const cctx = c.getContext("2d");
                                if (!cctx)
                                    return;
                                cctx.clearRect(0, 0, w, h);
                                cctx.drawImage(state.baseImg, 0, 0, w, h);
                                const imgData = cctx.getImageData(0, 0, w, h);
                                const d = imgData.data;
                                const mc = document.createElement("canvas");
                                mc.width = w;
                                mc.height = h;
                                const mctx = mc.getContext("2d");
                                if (!mctx)
                                    return;
                                mctx.clearRect(0, 0, w, h);
                                mctx.drawImage(state.maskImg, 0, 0, w, h);
                                const mData = mctx.getImageData(0, 0, w, h).data;
                                for (let i = 0; i < d.length; i += 4) {
                                    const m0 = mData[i];
                                    const m = state.invertMask ? (255 - m0) : m0;
                                    const a0 = d[i + 3];
                                    d[i + 3] = Math.round((a0 * m) / 255);
                                }
                                cctx.putImageData(imgData, 0, 0);
                                state.cutoutDataUrl = c.toDataURL("image/png");
                            };
                            const buildMaskCanvasForLayer = () => {
                                if (!state.maskImg)
                                    return null;
                                const w = Math.max(1, Math.round(selectedLayer.width || state.maskImg.width));
                                const h = Math.max(1, Math.round(selectedLayer.height || state.maskImg.height));
                                const c = document.createElement("canvas");
                                c.width = w;
                                c.height = h;
                                const cctx = c.getContext("2d");
                                if (!cctx)
                                    return null;
                                cctx.clearRect(0, 0, w, h);
                                cctx.drawImage(state.maskImg, 0, 0, w, h);
                                const imgData = cctx.getImageData(0, 0, w, h);
                                const d = imgData.data;
                                for (let i = 0; i < d.length; i += 4) {
                                    const m0 = d[i];
                                    const m = state.invertMask ? (255 - m0) : m0;
                                    d[i] = 255;
                                    d[i + 1] = 255;
                                    d[i + 2] = 255;
                                    d[i + 3] = m;
                                }
                                cctx.putImageData(imgData, 0, 0);
                                return c;
                            };
                            const updateInvertUi = () => {
                                btnInvert.style.opacity = state.invertMask ? "1" : "0.85";
                            };
                            const applyMaskPreview = async () => {
                                if (!isCurrentModal() || !state.maskImg)
                                    return;
                                await buildOverlayCanvas();
                                if (!isCurrentModal()) return;
                                buildCutoutFromMask();
                                draw();
                            };
                            const draw = () => {
                                if (!state.open || !state.baseImg)
                                    return;
                                const dpr = state.viewDpr || window.devicePixelRatio || 1;
                                const cssW = state.viewCssW || Math.max(1, editorCanvas.getBoundingClientRect().width || 1);
                                const cssH = state.viewCssH || Math.max(1, editorCanvas.getBoundingClientRect().height || 1);
                                ctx.setTransform(1, 0, 0, 1, 0, 0);
                                ctx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
                                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                                ctx.drawImage(state.baseImg, 0, 0, cssW, cssH);
                                if (state.overlayCanvas) {
                                    ctx.save();
                                    ctx.globalAlpha = 0.35;
                                    ctx.drawImage(state.overlayCanvas, 0, 0, cssW, cssH);
                                    ctx.restore();
                                }
                                const drawPoint = (p, color) => {
                                    const baseR = Math.max(4, Math.min(canvasWrap.clientWidth || 1, canvasWrap.clientHeight || 1) * 0.012);
                                    const r = baseR;
                                    ctx.beginPath();
                                    ctx.arc(p.x * cssW, p.y * cssH, r, 0, Math.PI * 2);
                                    ctx.fillStyle = color;
                                    ctx.fill();
                                    ctx.lineWidth = 1.5;
                                    ctx.strokeStyle = "rgba(0,0,0,0.6)";
                                    ctx.stroke();
                                };
                                const posHit = Array.isArray(state.posHit) ? state.posHit : [];
                                const negHit = Array.isArray(state.negHit) ? state.negHit : [];
                                const effPos = (i) => {
                                    const h = (i < posHit.length) ? !!posHit[i] : true;
                                    return state.invertMask ? !h : h;
                                };
                                const effNeg = (i) => {
                                    const h = (i < negHit.length) ? !!negHit[i] : true;
                                    return state.invertMask ? !h : h;
                                };
                                state.pointsPos.forEach((p, i) => drawPoint(p, effPos(i) ? "#70FF81" : "#2f7a3c"));
                                state.pointsNeg.forEach((p, i) => drawPoint(p, effNeg(i) ? "#FF6B6B" : "#7a2f2f"));
                                ctx.setTransform(1, 0, 0, 1, 0, 0);
                            };
                            const getCanvasNormPos = (ev) => {
                                const rect = editorCanvas.getBoundingClientRect();
                                const cx = (ev.clientX - rect.left);
                                const cy = (ev.clientY - rect.top);
                                const x = cx / Math.max(1, rect.width);
                                const y = cy / Math.max(1, rect.height);
                                return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
                            };
                            const getPointRadiusPx = () => {
                                return Math.max(4, Math.min(canvasWrap.clientWidth || 1, canvasWrap.clientHeight || 1) * 0.012);
                            };
                            const findHitPoint = (ev) => {
                                const rect = editorCanvas.getBoundingClientRect();
                                const mx = (ev.clientX - rect.left);
                                const my = (ev.clientY - rect.top);
                                const r = getPointRadiusPx();
                                const rr = (r * 1.6) * (r * 1.6);
                                let best = null;
                                let bestD2 = Infinity;
                                for (let i = 0; i < state.pointsPos.length; i++) {
                                    const p = state.pointsPos[i];
                                    const dx = mx - (p.x * rect.width);
                                    const dy = my - (p.y * rect.height);
                                    const d2 = (dx * dx) + (dy * dy);
                                    if (d2 <= rr && d2 < bestD2) {
                                        bestD2 = d2;
                                        best = { group: "pos", index: i };
                                    }
                                }
                                for (let i = 0; i < state.pointsNeg.length; i++) {
                                    const p = state.pointsNeg[i];
                                    const dx = mx - (p.x * rect.width);
                                    const dy = my - (p.y * rect.height);
                                    const d2 = (dx * dx) + (dy * dy);
                                    if (d2 <= rr && d2 < bestD2) {
                                        bestD2 = d2;
                                        best = { group: "neg", index: i };
                                    }
                                }
                                return best;
                            };
                            const updateUndoRedo = () => {
                                const canUndo = state.historyIndex > 0;
                                const canRedo = state.historyIndex >= 0 && state.historyIndex < state.history.length - 1;
                                btnUndo.style.opacity = canUndo ? "1" : "0.35";
                                btnUndo.style.pointerEvents = canUndo ? "auto" : "none";
                                btnRedo.style.opacity = canRedo ? "1" : "0.35";
                                btnRedo.style.pointerEvents = canRedo ? "auto" : "none";
                            };
                            const pushHistory = () => {
                                const snapshot = {
                                    pointsPos: state.pointsPos.map(p => ({ x: p.x, y: p.y })),
                                    pointsNeg: state.pointsNeg.map(p => ({ x: p.x, y: p.y })),
                                };
                                if (state.historyIndex < state.history.length - 1) {
                                    state.history = state.history.slice(0, state.historyIndex + 1);
                                }
                                state.history.push(snapshot);
                                state.historyIndex = state.history.length - 1;
                                updateUndoRedo();
                            };
                            const restoreHistory = (idx) => {
                                if (idx < 0 || idx >= state.history.length)
                                    return;
                                const s = state.history[idx];
                                state.pointsPos = (s.pointsPos || []).map(p => ({ x: p.x, y: p.y }));
                                state.pointsNeg = (s.pointsNeg || []).map(p => ({ x: p.x, y: p.y }));
                                state.historyIndex = idx;
                                updateUndoRedo();
                            };
                            const setUiBusy = (busy, text) => {
                                btnConfirm.disabled = busy;
                                btnClear.disabled = busy;
                                btnInvert.disabled = busy;
                                realtimeCheckbox.disabled = busy;
                                fillHolesCheckbox.disabled = busy;
                                closeEdgesCheckbox.disabled = busy;
                                maskThresholdSlider.input.disabled = busy;
                                closeRadiusSlider.input.disabled = busy || !closeEdgesCheckbox.checked;
                                if (busy) {
                                    busyOverlayText.textContent = text || "正在生成蒙版...";
                                    busyOverlay.style.display = "flex";
                                }
                                else {
                                    busyOverlay.style.display = "none";
                                }
                            };
                            const scheduleRealtime = () => {
                                if (!realtimeCheckbox.checked)
                                    return;
                                state.lastChangeTs = Date.now();
                                if (state.debounceTimer) {
                                    clearTimeout(state.debounceTimer);
                                }
                                state.debounceTimer = setTimeout(() => {
                                    state.debounceTimer = null;
                                    triggerRun(false);
                                }, 200);
                            };
                            const finalizeToLayer = async () => {
                                if (!isCurrentModal()) return;
                                if (state.running || state.pending || state.lastRunVersion !== state.pointsVersion) return;
                                if (!state.cutoutDataUrl) {
                                    throw new Error("cutout image missing");
                                }
                                const cutoutDataUrl = state.cutoutDataUrl;
                                const pointsVersion = state.pointsVersion;
                                const canCommit = () => isCurrentModal() && !state.running
                                    && state.lastRunVersion === pointsVersion && state.pointsVersion === pointsVersion
                                    && state.cutoutDataUrl === cutoutDataUrl;
                                const newImg = new Image();
                                newImg.src = cutoutDataUrl;
                                await newImg.decode();
                                if (!canCommit()) return;
                                const layer = await canvas.canvasLayers.addLayerWithImage(newImg, {
                                    name: "SAM3",
                                    x: selectedLayer.x,
                                    y: selectedLayer.y,
                                    width: selectedLayer.width,
                                    height: selectedLayer.height,
                                    rotation: selectedLayer.rotation || 0,
                                    flipH: !!selectedLayer.flipH,
                                    flipV: !!selectedLayer.flipV,
                                }, 'default', null, canCommit);
                                if (!layer || !canCommit()) return;
                                canvas.render();
                                canvas.saveState();
                                canvas.canvasLayersPanel?.renderLayers?.();
                                showSuccessNotification("智能抠图完成，已生成新图层！");
                                if (mergeToMaskCheckbox.checked) {
                                    const maskCanvas = buildMaskCanvasForLayer();
                                    if (maskCanvas) {
                                        try {
                                            canvas.maskTool.mergeMaskCanvas(maskCanvas, selectedLayer.x, selectedLayer.y);
                                        }
                                        catch (err) {
                                            showErrorNotification(`合并到蒙版失败: ${err.message || err}`);
                                        }
                                    }
                                }
                                closeModal();
                            };
                            const triggerRun = async (isFinal) => {
                                if (!isCurrentModal())
                                    return;
                                if (isFinal) {
                                    state.confirmRequested = true;
                                }
                                if (state.running) {
                                    state.pending = true;
                                    state.pendingFinal = state.pendingFinal || isFinal;
                                    return;
                                }
                                if (state.pointsPos.length === 0 && state.pointsNeg.length === 0) {
                                    state.maskImg = null;
                                    state.overlayCanvas = null;
                                    state.cutoutDataUrl = null;
                                    draw();
                                    return;
                                }
                                if (state.debounceTimer) {
                                    clearTimeout(state.debounceTimer);
                                    state.debounceTimer = null;
                                }
                                state.running = true;
                                setUiBusy(true, state.hadRunOnce ? "正在生成蒙版..." : "首次运行将加载模型并生成蒙版...");
                                const reqVersion = state.pointsVersion;
                                state.lastRunVersion = -1;
                                const requestCurrent = () => isCurrentModal() && state.pointsVersion === reqVersion;
                                try {
                                    const response = await fetch(new URL('sam3/image-mask', studioRoot), {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                            image: imageData,
                                            positive_points: state.pointsPos,
                                            negative_points: state.pointsNeg,
                                            fill_holes: !!fillHolesCheckbox.checked,
                                            mask_threshold: state.sam3MaskThreshold,
                                            close_radius: closeEdgesCheckbox.checked ? state.sam3CloseRadius : 0,
                                        })
                                    });
                                    if (!requestCurrent()) return;
                                    const result = await response.json();
                                    if (!requestCurrent()) return;
                                    if (!response.ok) {
                                        let errorMsg = `Server error: ${response.status} - ${response.statusText}`;
                                        if (result && result.error) {
                                            errorMsg = `${result.error}: ${result.details || 'Check console'}`;
                                        }
                                        throw new Error(errorMsg);
                                    }
                                    state.cutoutDataUrl = result.cutout_image || null;
                                    state.posHit = result.pos_hit || null;
                                    state.negHit = result.neg_hit || null;
                                    if (result.mask) {
                                        const mi = new Image();
                                        mi.src = result.mask;
                                        await mi.decode();
                                        if (!requestCurrent()) return;
                                        state.maskImg = mi;
                                        await applyMaskPreview();
                                        if (!requestCurrent()) return;
                                    }
                                    state.lastRunVersion = reqVersion;
                                    state.hadRunOnce = true;
                                    draw();
                                }
                                catch (error) {
                                    if (isCurrentModal()) {
                                        state.confirmRequested = false;
                                        showErrorNotification(`智能抠图失败: ${error.message || error}`);
                                    }
                                }
                                finally {
                                    state.running = false;
                                    if (isCurrentModal()) {
                                        setUiBusy(false);
                                        const shouldFinalize = state.confirmRequested && state.lastRunVersion === state.pointsVersion && !!state.cutoutDataUrl && !state.pending;
                                        if (shouldFinalize) {
                                            try {
                                                await finalizeToLayer();
                                            }
                                            catch (err) {
                                                if (isCurrentModal()) {
                                                    state.confirmRequested = false;
                                                    showErrorNotification(`生成图层失败: ${err.message || err}`);
                                                }
                                            }
                                            return;
                                        }
                                        if (state.pending) {
                                            state.pending = false;
                                            const elapsed = Date.now() - state.lastChangeTs;
                                            const waitMs = Math.max(0, 200 - elapsed);
                                            const pendingFinal = state.pendingFinal;
                                            state.pendingFinal = false;
                                            setTimeout(() => triggerRun(pendingFinal), waitMs);
                                        }
                                    }
                                }
                            };
                            editorCanvas.addEventListener("contextmenu", (ev) => ev.preventDefault());
                            let panActive = false;
                            let dragActive = false;
                            let dragGroup = "pos";
                            let dragIndex = -1;
                            let dragStartPoint = null;
                            let panStartX = 0;
                            let panStartY = 0;
                            let panBaseScrollLeft = 0;
                            let panBaseScrollTop = 0;
                            editorCanvas.addEventListener("mousedown", (ev) => {
                                if (!state.open)
                                    return;
                                if (!state.baseImg)
                                    return;
                                if (ev.button === 0 && (state.spaceDown || ev.altKey)) {
                                    panStartX = ev.clientX;
                                    panStartY = ev.clientY;
                                    panBaseScrollLeft = canvasWrap.scrollLeft;
                                    panBaseScrollTop = canvasWrap.scrollTop;
                                    panActive = true;
                                    editorCanvas.style.cursor = "grabbing";
                                    ev.preventDefault();
                                    return;
                                }
                                if (ev.button === 1) {
                                    panStartX = ev.clientX;
                                    panStartY = ev.clientY;
                                    panBaseScrollLeft = canvasWrap.scrollLeft;
                                    panBaseScrollTop = canvasWrap.scrollTop;
                                    panActive = true;
                                    editorCanvas.style.cursor = "grabbing";
                                    ev.preventDefault();
                                    return;
                                }
                                if (ev.button === 0 || ev.button === 2) {
                                    const hit = findHitPoint(ev);
                                    if (hit) {
                                        dragActive = true;
                                        dragGroup = hit.group;
                                        dragIndex = hit.index;
                                        const src = dragGroup === "pos" ? state.pointsPos : state.pointsNeg;
                                        dragStartPoint = { x: src[dragIndex].x, y: src[dragIndex].y };
                                        editorCanvas.style.cursor = "grabbing";
                                        ev.preventDefault();
                                        return;
                                    }
                                }
                                const p = getCanvasNormPos(ev);
                                if (ev.button === 2) {
                                    state.pointsNeg.push(p);
                                }
                                else {
                                    state.pointsPos.push(p);
                                }
                                state.pointsVersion += 1;
                                pushHistory();
                                draw();
                                scheduleRealtime();
                            });
                            onWindowMousemove = (ev) => {
                                if (!state.open)
                                    return;
                                if (dragActive) {
                                    const rect = editorCanvas.getBoundingClientRect();
                                    const cx = (ev.clientX - rect.left);
                                    const cy = (ev.clientY - rect.top);
                                    const x = Math.max(0, Math.min(1, cx / Math.max(1, rect.width)));
                                    const y = Math.max(0, Math.min(1, cy / Math.max(1, rect.height)));
                                    const dst = dragGroup === "pos" ? state.pointsPos : state.pointsNeg;
                                    if (dragIndex >= 0 && dragIndex < dst.length) {
                                        dst[dragIndex].x = x;
                                        dst[dragIndex].y = y;
                                        draw();
                                    }
                                    return;
                                }
                                if (panActive) {
                                    const dx = ev.clientX - panStartX;
                                    const dy = ev.clientY - panStartY;
                                    canvasWrap.scrollLeft = panBaseScrollLeft - dx;
                                    canvasWrap.scrollTop = panBaseScrollTop - dy;
                                }
                            };
                            onWindowMouseup = () => {
                                if (!state.open)
                                    return;
                                if (dragActive) {
                                    dragActive = false;
                                    dragIndex = -1;
                                    dragStartPoint = null;
                                    editorCanvas.style.cursor = "crosshair";
                                    state.pointsVersion += 1;
                                    pushHistory();
                                    draw();
                                    scheduleRealtime();
                                    return;
                                }
                                if (panActive) {
                                    panActive = false;
                                    editorCanvas.style.cursor = "crosshair";
                                }
                            };
                            window.addEventListener("mousemove", onWindowMousemove);
                            window.addEventListener("mouseup", onWindowMouseup);
                            editorCanvas.addEventListener("wheel", (ev) => {
                                if (!state.open)
                                    return;
                                if (!state.baseImg)
                                    return;
                                const factor = Math.exp((-ev.deltaY || 0) * 0.001);
                                const oldScale = state.viewScale;
                                const newScale = Math.max(0.2, Math.min(8, oldScale * factor));
                                const wrapRect = canvasWrap.getBoundingClientRect();
                                const pointerX = ev.clientX - wrapRect.left;
                                const pointerY = ev.clientY - wrapRect.top;
                                const oldW = Math.max(1, editorCanvas.offsetWidth || state.viewCssW || 1);
                                const oldH = Math.max(1, editorCanvas.offsetHeight || state.viewCssH || 1);
                                const canvasOffsetX = editorCanvas.offsetLeft || 0;
                                const canvasOffsetY = editorCanvas.offsetTop || 0;
                                const contentX = canvasWrap.scrollLeft + pointerX;
                                const contentY = canvasWrap.scrollTop + pointerY;
                                const canvasX = contentX - canvasOffsetX;
                                const canvasY = contentY - canvasOffsetY;
                                const normX = Math.max(0, Math.min(1, canvasX / oldW));
                                const normY = Math.max(0, Math.min(1, canvasY / oldH));
                                state.viewScale = newScale;
                                layoutCanvas();
                                const newW = Math.max(1, editorCanvas.offsetWidth || state.viewCssW || 1);
                                const newH = Math.max(1, editorCanvas.offsetHeight || state.viewCssH || 1);
                                const newCanvasOffsetX = editorCanvas.offsetLeft || 0;
                                const newCanvasOffsetY = editorCanvas.offsetTop || 0;
                                canvasWrap.scrollLeft = (newCanvasOffsetX + (normX * newW)) - pointerX;
                                canvasWrap.scrollTop = (newCanvasOffsetY + (normY * newH)) - pointerY;
                                ev.preventDefault();
                            }, { passive: false });
                            btnClear.addEventListener("click", () => {
                                state.pointsPos = [];
                                state.pointsNeg = [];
                                state.pointsVersion += 1;
                                state.maskImg = null;
                                state.overlayCanvas = null;
                                state.cutoutDataUrl = null;
                                state.posHit = null;
                                state.negHit = null;
                                state.confirmRequested = false;
                                state.pending = false;
                                state.pendingFinal = false;
                                pushHistory();
                                draw();
                            });
                            btnInvert.addEventListener("click", async () => {
                                state.invertMask = !state.invertMask;
                                updateInvertUi();
                                if (state.maskImg) {
                                    await applyMaskPreview();
                                }
                            });
                            btnCancel.addEventListener("click", () => closeModal());
                            btnConfirm.addEventListener("click", async () => {
                                if (!isCurrentModal()) return;
                                try {
                                    const canReuse = !state.running && !state.pending && state.lastRunVersion === state.pointsVersion && !!state.cutoutDataUrl;
                                    if (canReuse) {
                                        state.confirmRequested = true;
                                        await finalizeToLayer();
                                        return;
                                    }
                                    await triggerRun(true);
                                }
                                catch (err) {
                                    if (isCurrentModal()) {
                                        state.confirmRequested = false;
                                        showErrorNotification(`生成图层失败: ${err.message || err}`);
                                    }
                                }
                            });
                            window.addEventListener("resize", layoutCanvas);
                            onKeydown = (ev) => {
                                if (!isCurrentModal() || ev.isComposing || ev.defaultPrevented) return;
                                if (ev.target?.isContentEditable || ev.target?.closest?.('textarea, input[type="text"], input[type="number"], input:not([type]), [role="textbox"]')) return;
                                const k = (ev.key || "").toLowerCase();
                                if (ev.key === " " || k === "spacebar") {
                                    state.spaceDown = true;
                                }
                                if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && (k === "z" || k === "y")) {
                                    ev.preventDefault();
                                    ev.stopImmediatePropagation();
                                    const redo = k === "y" || ev.shiftKey;
                                    if (!redo && state.historyIndex > 0) {
                                        restoreHistory(state.historyIndex - 1);
                                        state.pointsVersion += 1;
                                        draw();
                                        scheduleRealtime();
                                    }
                                    else if (redo && state.historyIndex >= 0 && state.historyIndex < state.history.length - 1) {
                                        restoreHistory(state.historyIndex + 1);
                                        state.pointsVersion += 1;
                                        draw();
                                        scheduleRealtime();
                                    }
                                }
                            };
                            window.addEventListener("keydown", onKeydown, true);
                            onKeyup = (ev) => {
                                const k = (ev.key || "").toLowerCase();
                                if (ev.key === " " || k === "spacebar") {
                                    state.spaceDown = false;
                                }
                            };
                            window.addEventListener("keyup", onKeyup);
                            btnUndo.addEventListener("click", () => {
                                if (state.historyIndex > 0) {
                                    restoreHistory(state.historyIndex - 1);
                                    state.pointsVersion += 1;
                                    draw();
                                    scheduleRealtime();
                                }
                            });
                            btnRedo.addEventListener("click", () => {
                                if (state.historyIndex >= 0 && state.historyIndex < state.history.length - 1) {
                                    restoreHistory(state.historyIndex + 1);
                                    state.pointsVersion += 1;
                                    draw();
                                    scheduleRealtime();
                                }
                            });
                            fillHolesCheckbox.addEventListener("change", () => {
                                if (state.pointsPos.length === 0 && state.pointsNeg.length === 0)
                                    return;
                                state.pointsVersion += 1;
                                scheduleRealtime();
                            });
                            closeEdgesCheckbox.addEventListener("change", () => {
                                closeRadiusSlider.input.disabled = !closeEdgesCheckbox.checked;
                                if (state.pointsPos.length === 0 && state.pointsNeg.length === 0)
                                    return;
                                state.pointsVersion += 1;
                                scheduleRealtime();
                            });
                            maskThresholdSlider.input.addEventListener("input", () => {
                                const v = parseFloat(String(maskThresholdSlider.input.value));
                                state.sam3MaskThreshold = isFinite(v) ? v : 0.5;
                                maskThresholdSlider.valueEl.textContent = Number(state.sam3MaskThreshold).toFixed(2);
                                if (state.pointsPos.length === 0 && state.pointsNeg.length === 0)
                                    return;
                                state.pointsVersion += 1;
                                scheduleRealtime();
                            });
                            closeRadiusSlider.input.addEventListener("input", () => {
                                const v = parseInt(String(closeRadiusSlider.input.value), 10);
                                state.sam3CloseRadius = isFinite(v) ? v : 1;
                                closeRadiusSlider.valueEl.textContent = String(state.sam3CloseRadius);
                                if (!closeEdgesCheckbox.checked)
                                    return;
                                if (state.pointsPos.length === 0 && state.pointsNeg.length === 0)
                                    return;
                                state.pointsVersion += 1;
                                scheduleRealtime();
                            });
                            state.baseImg = new Image();
                            state.baseImg.src = imageData;
                            await state.baseImg.decode();
                            if (!ownsModal()) return;
                            state.open = true;
                            closeRadiusSlider.input.disabled = !closeEdgesCheckbox.checked;
                            updateInvertUi();
                            state.viewScale = Math.min(1, (canvasWrap.clientWidth || 1) / Math.max(1, state.baseImg.width), (canvasWrap.clientHeight || 1) / Math.max(1, state.baseImg.height));
                            state.history = [];
                            state.historyIndex = -1;
                            pushHistory();
                            layoutCanvas();
                            draw();
                            canvasWrap.scrollLeft = Math.max(0, (canvasWrap.scrollWidth - canvasWrap.clientWidth) / 2);
                            canvasWrap.scrollTop = Math.max(0, (canvasWrap.scrollHeight - canvasWrap.clientHeight) / 2);
                        }
                        catch (error) {
                            showErrorNotification(`智能抠图失败: ${error.message || "未知错误"}`);
                        }
                        finally {
                            button.classList.remove('loading');
                            if (spinner && button.contains(spinner)) {
                                button.removeChild(spinner);
                            }
                        }
                    }
                }),
                $el("button.painter-button.info.requires-selection.openpose-button", {
                    textContent: "骨骼编辑",
                    title: "对选定图层执行 OpenPose 检测并编辑骨骼",
                    onclick: async (e) => {
                        const button = e.target.closest('.openpose-button');
                        if (button.classList.contains('loading'))
                            return;
                        try {
                            const modelCheckResponse = await fetch(new URL('openpose/check-model', studioRoot));
                            if (!modelCheckResponse.ok) {
                                throw new Error(`${modelCheckResponse.status} ${modelCheckResponse.statusText}`);
                            }
                            const modelStatus = await modelCheckResponse.json();
                            let allowDownload = false;
                            if (!modelStatus.available) {
                                if (modelStatus.reason === 'not_downloaded') {
                                    const expected = modelStatus.expected || {};
                                    const msg = [
                                        modelStatus.message || "缺少 OpenPose 模型文件",
                                        expected.model_det ? `det: ${expected.model_det}` : '',
                                        expected.model_pose ? `pose: ${expected.model_pose}` : ''
                                    ].filter(Boolean).join('\n');
                                    showWarningNotification(msg, 8000);
                                    if (!confirm("未检测到所需的 ONNX 模型文件。是否允许自动下载？")) {
                                        return;
                                    }
                                    allowDownload = true;
                                }
                                else {
                                    showErrorNotification(modelStatus.message || "OpenPose 模型不可用", 8000);
                                    return;
                                }
                            }
                            if (canvas.canvasSelection.selectedLayers.length !== 1) {
                                showWarningNotification("请选择且仅选择一个图像图层进行骨骼编辑");
                                return;
                            }
                            const selectedLayer = canvas.canvasSelection.selectedLayers[0];
                            const displayedLayersBefore = [...canvas.layers].sort((a, b) => b.zIndex - a.zIndex);
                            const selectedDisplayIndex = displayedLayersBefore.indexOf(selectedLayer);
                            if (selectedDisplayIndex === -1) {
                                showErrorNotification("无法定位所选图层");
                                return;
                            }
                            const isPoseBgLayer = !!(selectedLayer.pose_bg_for_source_id || (selectedLayer.name === 'Pose BG' && !selectedLayer.pose_json && !selectedLayer.poseJson));
                            if (isPoseBgLayer) {
                                showWarningNotification("请选择主图层或 Pose 图层进行骨骼编辑");
                                return;
                            }
                            const isPoseLayer = !!(selectedLayer.pose_json || selectedLayer.poseJson);
                            const existingPoseJson = isPoseLayer ? (selectedLayer.pose_json || selectedLayer.poseJson) : null;
                            const spinner = $el("div.matting-spinner");
                            button.appendChild(spinner);
                            button.classList.add('loading');
                            const imageData = await canvas.canvasLayers.getLayerImageData(selectedLayer);
                            let poseJson = existingPoseJson;
                            if (!poseJson) {
                                showInfoNotification("正在进行 OpenPose 检测...", 2000);
                                const response = await fetch(new URL('openpose/detect', studioRoot), {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ image: imageData, allow_download: allowDownload })
                                });
                                const result = await response.json();
                                if (!response.ok) {
                                    const errorMsg = (result && (result.details || result.error || result.message)) || `${response.status} ${response.statusText}`;
                                    throw new Error(errorMsg);
                                }
                                poseJson = result.pose_json || result.poseJson;
                            }
                            if (!poseJson) {
                                throw new Error("未获取到有效的 pose_json");
                            }
                            const editorResult = await openPoseEditor.open({
                                backgroundImageSrc: imageData,
                                poseJson
                            });
                            if (!editorResult) {
                                showInfoNotification("已取消骨骼编辑", 2000);
                                return;
                            }
                            const { poseJson: editedPoseJson, skeletonDataUrl } = editorResult;
                            const skeletonImage = new Image();
                            skeletonImage.crossOrigin = 'anonymous';
                            skeletonImage.src = skeletonDataUrl;
                            await skeletonImage.decode();
                            const createBlackImage = async (width, height) => {
                                const { canvas: tmp, ctx: tmpCtx } = createCanvas(width, height, '2d', { willReadFrequently: false });
                                if (!tmpCtx) {
                                    throw new Error("无法创建背景画布");
                                }
                                tmpCtx.fillStyle = '#000';
                                tmpCtx.fillRect(0, 0, width, height);
                                const bg = new Image();
                                bg.crossOrigin = 'anonymous';
                                bg.src = tmp.toDataURL('image/png');
                                await bg.decode();
                                return bg;
                            };
                            const displayedNow = [...canvas.layers].sort((a, b) => b.zIndex - a.zIndex);
                            const selectedIndexNow = displayedNow.indexOf(selectedLayer);
                            const poseGroupDisplayIndex = selectedIndexNow === -1 ? 0 : selectedIndexNow;
                            const getSourceLayer = () => {
                                if (!isPoseLayer) {
                                    return selectedLayer;
                                }
                                const sourceId = selectedLayer.pose_source_layer_id;
                                return sourceId ? canvas.layers.find((l) => l && l.id === sourceId) : null;
                            };
                            const ensureSourcePoseBgLayer = async (sourceLayer, insertIndex) => {
                                if (!sourceLayer) {
                                    return null;
                                }
                                const bgId = sourceLayer.pose_bg_layer_id;
                                let bgLayer = bgId ? canvas.layers.find((l) => l && l.id === bgId) : null;
                                if (!bgLayer) {
                                    bgLayer = canvas.layers.find((l) => l && l.pose_bg_for_source_id === sourceLayer.id);
                                }
                                if (!bgLayer) {
                                    bgLayer = canvas.layers.find((l) => l && l.name === 'Pose BG' && !l.pose_json && !l.poseJson && l.pose_source_layer_id === sourceLayer.id);
                                }
                                if (!bgLayer) {
                                    const bgImage = await createBlackImage(skeletonImage.width, skeletonImage.height);
                                    bgLayer = await canvas.canvasLayers.addLayerWithImage(bgImage, {
                                        name: 'Pose BG',
                                        x: sourceLayer.x,
                                        y: sourceLayer.y,
                                        width: sourceLayer.width,
                                        height: sourceLayer.height,
                                        rotation: sourceLayer.rotation,
                                        flipH: false,
                                        flipV: false,
                                        blendMode: 'normal',
                                        opacity: 1,
                                        pose_bg_for_source_id: sourceLayer.id,
                                        pose_source_layer_id: sourceLayer.id
                                    }, 'default');
                                }
                                bgLayer.x = sourceLayer.x;
                                bgLayer.y = sourceLayer.y;
                                bgLayer.width = sourceLayer.width;
                                bgLayer.height = sourceLayer.height;
                                bgLayer.rotation = sourceLayer.rotation;
                                bgLayer.flipH = false;
                                bgLayer.flipV = false;
                                bgLayer.blendMode = 'normal';
                                bgLayer.opacity = 1;
                                bgLayer.visible = true;
                                sourceLayer.pose_bg_layer_id = bgLayer.id;
                                const sourceLayerIndex = canvas.layers.findIndex((l) => l && l.id === sourceLayer.id);
                                if (sourceLayerIndex !== -1) {
                                    const stored = canvas.layers[sourceLayerIndex];
                                    stored.pose_bg_layer_id = bgLayer.id;
                                }
                                canvas.canvasLayers.moveLayers([bgLayer], { toIndex: insertIndex });
                                return bgLayer;
                            };

                            const sourceLayer = getSourceLayer();
                            const sourceDisplayIndex = sourceLayer ? displayedNow.indexOf(sourceLayer) : poseGroupDisplayIndex;
                            const safeSourceIndex = sourceDisplayIndex === -1 ? poseGroupDisplayIndex : sourceDisplayIndex;
                            const bgLayer = await ensureSourcePoseBgLayer(sourceLayer, safeSourceIndex);

                            if (isPoseLayer) {
                                const poseLayerIndex = canvas.layers.findIndex((l) => l && l.id === selectedLayer.id);
                                if (poseLayerIndex === -1) {
                                    throw new Error("无法定位骨骼图层");
                                }
                                const targetLayer = canvas.layers[poseLayerIndex];
                                targetLayer.image = skeletonImage;
                                targetLayer.flipH = false;
                                targetLayer.flipV = false;
                                targetLayer.blendMode = 'normal';
                                targetLayer.pose_json = editedPoseJson;
                                if (bgLayer) {
                                    targetLayer.pose_bg_layer_id = bgLayer.id;
                                }
                                delete targetLayer.imageId;
                                canvas.canvasSelection.updateSelection([targetLayer]);
                                canvas.canvasLayers.invalidateProcessedImageCache(targetLayer.id);
                                canvas.render();
                                canvas.saveState();
                                canvas.canvasLayersPanel?.renderLayers?.();
                                showSuccessNotification("骨骼图层已更新");
                            }
                            else {
                                const newLayer = await canvas.canvasLayers.addLayerWithImage(skeletonImage, {
                                    name: 'Pose',
                                    x: selectedLayer.x,
                                    y: selectedLayer.y,
                                    width: selectedLayer.width,
                                    height: selectedLayer.height,
                                    rotation: selectedLayer.rotation,
                                    flipH: false,
                                    flipV: false,
                                    blendMode: 'normal',
                                    pose_json: editedPoseJson,
                                    pose_source_layer_id: selectedLayer.id,
                                    pose_bg_layer_id: bgLayer ? bgLayer.id : null
                                }, 'default');
                                if (bgLayer) {
                                    const displayedAfter = [...canvas.layers].sort((a, b) => b.zIndex - a.zIndex);
                                    const existingPoseLayers = displayedAfter.filter((l) => l && l.pose_source_layer_id === selectedLayer.id && (l.pose_json || l.poseJson) && l.id !== newLayer.id);
                                    const existingIndices = existingPoseLayers.map((l) => displayedAfter.indexOf(l)).filter((n) => n >= 0);
                                    const bgIndex = displayedAfter.indexOf(bgLayer);
                                    const insertIndex = existingIndices.length > 0 ? Math.min(...existingIndices) : (bgIndex === -1 ? safeSourceIndex : bgIndex);
                                    canvas.canvasLayers.moveLayers([newLayer], { toIndex: insertIndex });
                                }
                                canvas.canvasSelection.updateSelection([newLayer]);
                                canvas.render();
                                canvas.saveState();
                                canvas.canvasLayersPanel?.renderLayers?.();
                                showSuccessNotification("骨骼图层已创建");
                            }
                        }
                        catch (error) {
                            const errorMessage = error?.message || "发生未知错误";
                            showErrorNotification(`骨骼编辑失败: ${errorMessage}`);
                        }
                        finally {
                            button.classList.remove('loading');
                            const spinner = button.querySelector('.matting-spinner');
                            if (spinner && button.contains(spinner)) {
                                button.removeChild(spinner);
                            }
                        }
                    }
                }),
            ]),
            $el("div.painter-separator"),
            $el("div.painter-button-group", {}, [
                $el("button.painter-button", {
                    id: `undo-button-${node.id}`,
                    textContent: "撤销",
                    title: "撤销上一步操作",
                    disabled: true,
                    onclick: () => canvas.undo()
                }),
                $el("button.painter-button", {
                    id: `redo-button-${node.id}`,
                    textContent: "重做",
                    title: "重做上一步撤销的操作",
                    disabled: true,
                    onclick: () => canvas.redo()
                }),
            ]),
            $el("div.painter-separator"),
            $el("div.painter-button-group", { id: "mask-controls" }, [
                $el("label.clipboard-switch.mask-switch", {
                    id: `toggle-mask-switch-${node.id}`,
                    style: { minWidth: "56px", maxWidth: "56px", width: "56px", paddingLeft: "0", paddingRight: "0" },
                    title: "切换画布上的遮罩叠加层可见性 (禁用时遮罩仍会影响输出)"
                }, [
                    $el("input", {
                        type: "checkbox",
                        checked: canvas.maskTool.isOverlayVisible,
                        onchange: (e) => {
                            const checked = e.target.checked;
                            canvas.maskTool.isOverlayVisible = checked;
                            canvas.render();
                        }
                    }),
                    $el("span.switch-track"),
                    $el("span.switch-labels", { style: { fontSize: "11px" } }, [
                        $el("span.text-clipspace", { style: { paddingRight: "22px" } }, ["On"]),
                        $el("span.text-system", { style: { paddingLeft: "20px" } }, ["Off"])
                    ]),
                    $el("span.switch-knob", {}, [
                        (() => {
                            // Ikona maski (SVG lub obrazek)
                            const iconContainer = document.createElement('span');
                            iconContainer.className = 'switch-icon';
                            iconContainer.style.display = 'flex';
                            iconContainer.style.alignItems = 'center';
                            iconContainer.style.justifyContent = 'center';
                            iconContainer.style.width = '16px';
                            iconContainer.style.height = '16px';
                            // Pobierz ikonę maski z iconLoader
                            const icon = iconLoader.getIcon(LAYERFORGE_TOOLS.MASK);
                            if (icon instanceof HTMLImageElement) {
                                const img = icon.cloneNode();
                                img.style.width = "16px";
                                img.style.height = "16px";
                                // Ustaw filtr w zależności od stanu checkboxa
                                setTimeout(() => {
                                    const input = document.getElementById(`toggle-mask-switch-${node.id}`)?.querySelector('input[type="checkbox"]');
                                    const updateIconFilter = () => {
                                        if (input && img) {
                                            img.style.filter = input.checked
                                                ? "brightness(0) invert(1)"
                                                : "grayscale(1) brightness(0.7) opacity(0.6)";
                                        }
                                    };
                                    if (input) {
                                        input.addEventListener('change', updateIconFilter);
                                        updateIconFilter();
                                    }
                                }, 0);
                                iconContainer.appendChild(img);
                            }
                            else {
                                iconContainer.textContent = "M";
                                iconContainer.style.fontSize = "12px";
                                iconContainer.style.color = "#fff";
                            }
                            return iconContainer;
                        })()
                    ])
                ]),
                $el("button.painter-button", {
                    textContent: "编辑遮罩",
                    title: "在遮罩编辑器中打开当前画布视图",
                    onclick: () => {
                        canvas.startMaskEditor(null, true);
                    }
                }),
                $el("button.painter-button", {
                    id: "mask-mode-btn",
                    textContent: "绘制遮罩",
                    title: "切换遮罩绘制模式",
                    onclick: () => {
                        const maskBtn = controlPanel.querySelector('#mask-mode-btn');
                        const maskControls = controlPanel.querySelector('#mask-controls');
                        if (canvas.maskTool.isActive) {
                            canvas.maskTool.deactivate();
                            maskBtn.classList.remove('primary');
                            maskControls.querySelectorAll('.mask-control').forEach((c) => c.style.display = 'none');
                        }
                        else {
                            canvas.maskTool.activate();
                            maskBtn.classList.add('primary');
                            maskControls.querySelectorAll('.mask-control').forEach((c) => c.style.display = 'flex');
                            const previewOpacitySlider = controlPanel.querySelector('#preview-opacity-slider');
                            if (previewOpacitySlider instanceof HTMLInputElement) {
                                const value = parseFloat(previewOpacitySlider.value);
                                canvas.maskTool.setPreviewOpacity(Number.isFinite(value) ? value : 1);
                                const valueEl = controlPanel.querySelector('#preview-opacity-value');
                                if (valueEl)
                                    valueEl.textContent = `${Math.round((Number.isFinite(value) ? value : 1) * 100)}%`;
                            }
                            const brushSizeSlider = controlPanel.querySelector('#brush-size-slider');
                            if (brushSizeSlider instanceof HTMLInputElement) {
                                const value = parseInt(brushSizeSlider.value);
                                canvas.maskTool.setBrushSize(Number.isFinite(value) ? value : 20);
                                const valueEl = controlPanel.querySelector('#brush-size-value');
                                if (valueEl)
                                    valueEl.textContent = `${Number.isFinite(value) ? value : 20}px`;
                            }
                            const brushStrengthSlider = controlPanel.querySelector('#brush-strength-slider');
                            if (brushStrengthSlider instanceof HTMLInputElement) {
                                const value = parseFloat(brushStrengthSlider.value);
                                canvas.maskTool.setBrushStrength(Number.isFinite(value) ? value : 1);
                                const valueEl = controlPanel.querySelector('#brush-strength-value');
                                if (valueEl)
                                    valueEl.textContent = `${Math.round((Number.isFinite(value) ? value : 1) * 100)}%`;
                            }
                            const brushHardnessSlider = controlPanel.querySelector('#brush-hardness-slider');
                            if (brushHardnessSlider instanceof HTMLInputElement) {
                                const value = parseFloat(brushHardnessSlider.value);
                                canvas.maskTool.setBrushHardness(Number.isFinite(value) ? value : 0.5);
                                const valueEl = controlPanel.querySelector('#brush-hardness-value');
                                if (valueEl)
                                    valueEl.textContent = `${Math.round((Number.isFinite(value) ? value : 0.5) * 100)}%`;
                            }
                        }
                        setTimeout(() => canvas.render(), 0);
                    }
                }),
                $el("div.painter-slider-container.mask-control", { style: { display: 'none' } }, [
                    $el("label", { for: "preview-opacity-slider", textContent: "遮罩不透明度:" }),
                    $el("input", {
                        id: "preview-opacity-slider",
                        type: "range",
                        min: "0",
                        max: "1",
                        step: "0.05",
                        value: "1",
                        oninput: (e) => {
                            const value = e.target.value;
                            canvas.maskTool.setPreviewOpacity(parseFloat(value));
                            const valueEl = document.getElementById('preview-opacity-value');
                            if (valueEl)
                                valueEl.textContent = `${Math.round(parseFloat(value) * 100)}%`;
                        }
                    }),
                    $el("div.slider-value", { id: "preview-opacity-value" }, ["100%"])
                ]),
                $el("div.painter-slider-container.mask-control", { style: { display: 'none' } }, [
                    $el("label", { for: "brush-size-slider", textContent: "大小:" }),
                    $el("input", {
                        id: "brush-size-slider",
                        type: "range",
                        min: "1",
                        max: "200",
                        value: "20",
                        oninput: (e) => {
                            const value = e.target.value;
                            canvas.maskTool.setBrushSize(parseInt(value));
                            const valueEl = document.getElementById('brush-size-value');
                            if (valueEl)
                                valueEl.textContent = `${value}px`;
                        }
                    }),
                    $el("div.slider-value", { id: "brush-size-value" }, ["20px"])
                ]),
                $el("div.painter-slider-container.mask-control", { style: { display: 'none' } }, [
                    $el("label", { for: "brush-strength-slider", textContent: "强度:" }),
                    $el("input", {
                        id: "brush-strength-slider",
                        type: "range",
                        min: "0",
                        max: "1",
                        step: "0.05",
                        value: "1",
                        oninput: (e) => {
                            const value = e.target.value;
                            canvas.maskTool.setBrushStrength(parseFloat(value));
                            const valueEl = document.getElementById('brush-strength-value');
                            if (valueEl)
                                valueEl.textContent = `${Math.round(parseFloat(value) * 100)}%`;
                        }
                    }),
                    $el("div.slider-value", { id: "brush-strength-value" }, ["100%"])
                ]),
                $el("div.painter-slider-container.mask-control", { style: { display: 'none' } }, [
                    $el("label", { for: "brush-hardness-slider", textContent: "硬度:" }),
                    $el("input", {
                        id: "brush-hardness-slider",
                        type: "range",
                        min: "0",
                        max: "1",
                        step: "0.05",
                        value: "0.5",
                        oninput: (e) => {
                            const value = e.target.value;
                            canvas.maskTool.setBrushHardness(parseFloat(value));
                            const valueEl = document.getElementById('brush-hardness-value');
                            if (valueEl)
                                valueEl.textContent = `${Math.round(parseFloat(value) * 100)}%`;
                        }
                    }),
                    $el("div.slider-value", { id: "brush-hardness-value" }, ["50%"])
                ]),
                $el("button.painter-button.mask-control", {
                    textContent: "清除遮罩",
                    title: "清除整个遮罩",
                    style: { display: 'none' },
                    onclick: () => {
                        if (confirm("您确定要清除遮罩吗？")) {
                            canvas.maskTool.clear();
                            canvas.render();
                        }
                    }
                })
            ]),
            $el("div.painter-separator"),
            $el("div.painter-button-group", {}, [
                $el("button.painter-button.success", {
                    textContent: "运行GC",
                    title: "运行垃圾回收以清理未使用的图像",
                    onclick: async () => {
                        try {
                            const stats = canvas.imageReferenceManager.getStats();
                            log.info("GC Stats before cleanup:", stats);
                            await canvas.imageReferenceManager.manualGarbageCollection();
                            const newStats = canvas.imageReferenceManager.getStats();
                            log.info("GC Stats after cleanup:", newStats);
                            showSuccessNotification(`垃圾回收完成！\n跟踪的图像: ${newStats.trackedImages}\n总引用: ${newStats.totalReferences}\n操作: ${canvas.imageReferenceManager.operationCount}/${canvas.imageReferenceManager.operationThreshold}`);
                        }
                        catch (e) {
                            log.error("Failed to run garbage collection:", e);
                            showErrorNotification("运行垃圾回收时出错。请检查控制台以获取详细信息。");
                        }
                    }
                }),
                $el("button.painter-button.danger", {
                    textContent: "清除缓存",
                    title: "从浏览器存储中清除所有保存的画布状态",
                    onclick: async () => {
                        if (confirm("您确定要清除所有保存的画布状态吗？此操作无法撤销。")) {
                            try {
                                await clearAllCanvasStates();
                                showSuccessNotification("画布缓存已成功清除！");
                            }
                            catch (e) {
                                log.error("Failed to clear canvas cache:", e);
                                showErrorNotification("清除画布缓存时出错。请检查控制台以获取详细信息。");
                            }
                        }
                    }
                })
            ])
        ]),
        $el("div.painter-separator")
    ]);
    // Function to create mask icon
    const createMaskIcon = () => {
        const iconContainer = document.createElement('div');
        iconContainer.className = 'mask-icon-container';
        iconContainer.style.cssText = `
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        const icon = iconLoader.getIcon(LAYERFORGE_TOOLS.MASK);
        if (icon) {
            if (icon instanceof HTMLImageElement) {
                const img = icon.cloneNode();
                img.style.cssText = `
                    width: 16px;
                    height: 16px;
                    filter: brightness(0) invert(1);
                `;
                iconContainer.appendChild(img);
            }
            else if (icon instanceof HTMLCanvasElement) {
                const { canvas, ctx } = createCanvas(16, 16);
                if (ctx) {
                    ctx.drawImage(icon, 0, 0, 16, 16);
                }
                iconContainer.appendChild(canvas);
            }
        }
        else {
            // Fallback text
            iconContainer.textContent = 'M';
            iconContainer.style.fontSize = '12px';
            iconContainer.style.color = '#ffffff';
        }
        return iconContainer;
    };
    const updateButtonStates = () => {
        const selectionCount = canvas.canvasSelection.selectedLayers.length;
        const hasSelection = selectionCount > 0;
        // --- Handle Standard Buttons ---
        controlPanel.querySelectorAll('.requires-selection').forEach((el) => {
            if (el.tagName === 'BUTTON') {
                if (el.textContent === 'Fuse') {
                    el.disabled = selectionCount < 2;
                }
                else {
                    el.disabled = !hasSelection;
                }
            }
        });
        const mattingBtn = controlPanel.querySelector('.matting-button');
        if (mattingBtn && !mattingBtn.classList.contains('loading')) {
            mattingBtn.disabled = selectionCount !== 1;
        }
        const openposeBtn = controlPanel.querySelector('.openpose-button');
        if (openposeBtn && !openposeBtn.classList.contains('loading')) {
            openposeBtn.disabled = selectionCount !== 1;
        }
        // --- Handle Crop/Transform Switch ---
        const switchEl = controlPanel.querySelector(`#crop-transform-switch-${node.id}`);
        if (switchEl) {
            const input = switchEl.querySelector('input');
            const knobIcon = switchEl.querySelector('.switch-icon');
            const isDisabled = !hasSelection;
            switchEl.classList.toggle('disabled', isDisabled);
            input.disabled = isDisabled;
            if (!isDisabled) {
                const isCropMode = canvas.canvasSelection.selectedLayers[0].cropMode || false;
                if (input.checked !== isCropMode) {
                    input.checked = isCropMode;
                }
                // Update icon view
                updateSwitchIcon(knobIcon, isCropMode, LAYERFORGE_TOOLS.CROP, LAYERFORGE_TOOLS.TRANSFORM, "✂️", "✥");
            }
        }
    };
    canvas.canvasSelection.onSelectionChange = updateButtonStates;
    const undoButton = controlPanel.querySelector(`#undo-button-${node.id}`);
    const redoButton = controlPanel.querySelector(`#redo-button-${node.id}`);
    canvas.onHistoryChange = ({ canUndo, canRedo }) => {
        if (undoButton)
            undoButton.disabled = !canUndo;
        if (redoButton)
            redoButton.disabled = !canRedo;
    };
    updateButtonStates();
    canvas.updateHistoryButtons();
    // Add mask icon to toggle mask button after icons are loaded
    setTimeout(async () => {
        try {
            await iconLoader.preloadToolIcons();
            const toggleMaskBtn = controlPanel.querySelector(`#toggle-mask-btn-${node.id}`);
            if (toggleMaskBtn && !toggleMaskBtn.querySelector('.mask-icon-container')) {
                // Clear fallback text
                toggleMaskBtn.textContent = '';
                const maskIcon = createMaskIcon();
                toggleMaskBtn.appendChild(maskIcon);
                // Set initial state based on mask visibility
                if (canvas.maskTool.isOverlayVisible) {
                    toggleMaskBtn.classList.add('primary');
                    maskIcon.style.opacity = '1';
                }
                else {
                    toggleMaskBtn.classList.remove('primary');
                    maskIcon.style.opacity = '0.5';
                }
            }
        }
        catch (error) {
            log.warn('Failed to load mask icon:', error);
        }
    }, 200);
    // Debounce timer for updateOutput to prevent excessive updates
    let updateOutputTimer = null;
    const updateOutput = async (node, canvas) => {
        // Check if preview is disabled - if so, skip updateOutput entirely
        const triggerWidget = node.widgets.find((w) => w.name === "trigger");
        if (triggerWidget) {
            triggerWidget.value = (triggerWidget.value + 1) % 99999999;
        }
        const showPreviewWidget = node.widgets.find((w) => w.name === "show_preview");
        if (showPreviewWidget && !showPreviewWidget.value) {
            log.debug("Preview disabled, skipping updateOutput");
            const PLACEHOLDER_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
            const placeholder = new Image();
            placeholder.src = PLACEHOLDER_IMAGE;
            node.imgs = [placeholder];
            return;
        }
        // Clear previous timer
        if (updateOutputTimer) {
            clearTimeout(updateOutputTimer);
        }
        // Debounce the update to prevent excessive processing during rapid changes
        updateOutputTimer = setTimeout(async () => {
            try {
                const blob = await canvas.canvasLayers.getFlattenedCanvasWithMaskAsBlob();
                if (blob) {
                    // For large images, use blob URL for better performance
                    if (blob.size > 2 * 1024 * 1024) { // 2MB threshold
                        const blobUrl = URL.createObjectURL(blob);
                        const img = new Image();
                        img.onload = () => {
                            node.imgs = [img];
                            log.debug(`Using blob URL for large image (${(blob.size / 1024 / 1024).toFixed(1)}MB): ${blobUrl.substring(0, 50)}...`);
                            // Clean up old blob URLs to prevent memory leaks
                            if (node.imgs.length > 1) {
                                const oldImg = node.imgs[0];
                                if (oldImg.src.startsWith('blob:')) {
                                    URL.revokeObjectURL(oldImg.src);
                                }
                            }
                        };
                        img.src = blobUrl;
                    }
                    else {
                        // For smaller images, use data URI as before
                        const reader = new FileReader();
                        reader.onload = () => {
                            const dataUrl = reader.result;
                            const img = new Image();
                            img.onload = () => {
                                node.imgs = [img];
                                log.debug(`Using data URI for small image (${(blob.size / 1024).toFixed(1)}KB): ${dataUrl.substring(0, 50)}...`);
                            };
                            img.src = dataUrl;
                        };
                        reader.readAsDataURL(blob);
                    }
                }
                else {
                    node.imgs = [];
                }
            }
            catch (error) {
                console.error("Error updating node preview:", error);
            }
        }, 250); // 150ms debounce delay
    };
    // Store previous temp filenames for cleanup (make it globally accessible)
    if (!window.layerForgeTempFileTracker) {
        window.layerForgeTempFileTracker = new Map();
    }
    const tempFileTracker = window.layerForgeTempFileTracker;
    const layersPanel = canvas.canvasLayersPanel.createPanelStructure();
    const canvasContainer = $el("div.painterCanvasContainer.painter-container", {
        style: {
            position: "absolute",
            top: "60px",
            left: "10px",
            right: "270px",
            bottom: "10px",
            overflow: "hidden"
        }
    }, [canvas.canvas]);
    canvas.canvasContainer = canvasContainer;
    const layersPanelContainer = $el("div.painterLayersPanelContainer", {
        style: {
            position: "absolute",
            top: "60px",
            right: "10px",
            width: "250px",
            bottom: "10px",
            overflow: "hidden"
        }
    }, [layersPanel]);
    let pendingTopRaf = null;
    let lastTop = null;
    const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries && entries[0] ? entries[0] : null;
        const height = entry?.contentRect?.height ?? entry?.target?.offsetHeight ?? 0;
        if (!Number.isFinite(height) || height < 0) {
            return;
        }
        if (pendingTopRaf !== null) {
            cancelAnimationFrame(pendingTopRaf);
        }
        pendingTopRaf = requestAnimationFrame(() => {
            pendingTopRaf = null;
            const newTop = (height + 10) + "px";
            if (newTop === lastTop) {
                return;
            }
            lastTop = newTop;
            canvasContainer.style.top = newTop;
            layersPanelContainer.style.top = newTop;
        });
    });
    const controlsElement = controlPanel.querySelector('.controls');
    if (controlsElement) {
        resizeObserver.observe(controlsElement);
    }
    canvas.canvas.addEventListener('focus', () => {
        canvasContainer.classList.add('has-focus');
    });
    canvas.canvas.addEventListener('blur', () => {
        canvasContainer.classList.remove('has-focus');
    });
    node.onResize = function () {
        canvas.render();
    };
    const mainContainer = $el("div.painterMainContainer", {
        style: {
            position: "relative",
            width: "100%",
            height: "100%"
        }
    }, [controlPanel, canvasContainer, layersPanelContainer]);
    if (node.addDOMWidget) {
        node.addDOMWidget("mainContainer", "widget", mainContainer);
    }
    const toggleLayersBtn = controlPanel.querySelector(`#toggle-layers-btn-${node.id}`);
    if (toggleLayersBtn) {
        toggleLayersBtn.addEventListener('click', () => {
            mainContainer.classList.toggle('layers-open');
        });
    }
    if (typeof canvas.keepAspectRatio !== 'boolean') {
        canvas.keepAspectRatio = true;
    }
    const toggleAspectBtn = controlPanel.querySelector(`#toggle-aspect-btn-${node.id}`);
    const syncAspectBtn = () => {
        if (!toggleAspectBtn)
            return;
        toggleAspectBtn.classList.toggle('success', !!canvas.keepAspectRatio);
        toggleAspectBtn.title = canvas.keepAspectRatio ? "等比缩放：开" : "等比缩放：关";
        toggleAspectBtn.setAttribute('aria-label', toggleAspectBtn.title);
    };
    syncAspectBtn();
    if (toggleAspectBtn) {
        toggleAspectBtn.addEventListener('click', () => {
            canvas.keepAspectRatio = !canvas.keepAspectRatio;
            syncAspectBtn();
        });
    }
    const mobileQuery = window.matchMedia?.('(max-width: 900px)');
    const applyResponsiveClass = () => {
        const isMobile = mobileQuery ? mobileQuery.matches : (window.innerWidth <= 900);
        mainContainer.classList.toggle('is-mobile', !!isMobile);
        if (!isMobile) {
            mainContainer.classList.remove('layers-open');
        }
    };
    applyResponsiveClass();
    if (mobileQuery && typeof mobileQuery.addEventListener === 'function') {
        mobileQuery.addEventListener('change', applyResponsiveClass);
    }
    else if (mobileQuery && typeof mobileQuery.addListener === 'function') {
        mobileQuery.addListener(applyResponsiveClass);
    }
    window.addEventListener('resize', applyResponsiveClass, { passive: true });
    const openEditorBtn = controlPanel.querySelector(`#open-editor-btn-${node.id}`);
    let backdrop = null;
    let originalParent = null;
    let isEditorOpen = false;
    let viewportAdjustment = { x: 0, y: 0 };
    /**
     * Adjusts the viewport when entering fullscreen mode.
     */
    const adjustViewportOnOpen = (originalRect) => {
        const fullscreenRect = canvasContainer.getBoundingClientRect();
        const widthDiff = fullscreenRect.width - originalRect.width;
        const heightDiff = fullscreenRect.height - originalRect.height;
        const adjustX = (widthDiff / 2) / canvas.viewport.zoom;
        const adjustY = (heightDiff / 2) / canvas.viewport.zoom;
        // Store the adjustment
        viewportAdjustment = { x: adjustX, y: adjustY };
        // Apply the adjustment
        canvas.viewport.x -= viewportAdjustment.x;
        canvas.viewport.y -= viewportAdjustment.y;
    };
    /**
     * Restores the viewport when exiting fullscreen mode.
     */
    const adjustViewportOnClose = () => {
        // Apply the stored adjustment in reverse
        canvas.viewport.x += viewportAdjustment.x;
        canvas.viewport.y += viewportAdjustment.y;
        // Reset adjustment
        viewportAdjustment = { x: 0, y: 0 };
    };
    const closeEditor = () => {
        if (originalParent && backdrop) {
            originalParent.appendChild(mainContainer);
            document.body.removeChild(backdrop);
        }
        isEditorOpen = false;
        openEditorBtn.textContent = "⛶";
        openEditorBtn.title = "Open in Editor";
        // Remove ESC key listener when editor closes
        document.removeEventListener('keydown', handleEscKey);
        setTimeout(() => {
            adjustViewportOnClose();
            canvas.render();
            if (node.onResize) {
                node.onResize();
            }
        }, 0);
    };
    // ESC key handler for closing fullscreen editor
    const handleEscKey = (e) => {
        if (e.key === 'Escape' && isEditorOpen) {
            e.preventDefault();
            e.stopPropagation();
            closeEditor();
        }
    };
    openEditorBtn.onclick = () => {
        if (isEditorOpen) {
            closeEditor();
            return;
        }
        const originalRect = canvasContainer.getBoundingClientRect();
        originalParent = mainContainer.parentElement;
        if (!originalParent) {
            log.error("Could not find original parent of the canvas container!");
            return;
        }
        backdrop = $el("div.painter-modal-backdrop");
        const modalContent = $el("div.painter-modal-content");
        modalContent.appendChild(mainContainer);
        backdrop.appendChild(modalContent);
        document.body.appendChild(backdrop);
        isEditorOpen = true;
        openEditorBtn.textContent = "X";
        openEditorBtn.title = "关闭编辑器 (ESC)";
        // Add ESC key listener when editor opens
        document.addEventListener('keydown', handleEscKey);
        setTimeout(() => {
            adjustViewportOnOpen(originalRect);
            canvas.render();
            if (node.onResize) {
                node.onResize();
            }
        }, 0);
    };
    if (!window.canvasExecutionStates) {
        window.canvasExecutionStates = new Map();
    }
    // Store the entire widget object, not just the canvas
    node.canvasWidget = {
        canvas: canvas,
        panel: controlPanel
    };
    
    // Disable automatic initial state loading in iframe mode to prevent race conditions
    if (!window.location.search.includes("api_url")) {
        setTimeout(() => {
            canvas.loadInitialState();
            if (canvas.canvasLayersPanel) {
                canvas.canvasLayersPanel.renderLayers();
            }
        }, 100);
    } else {
        log.info("Running in iframe mode, skipping automatic initial state load to allow external initialization.");
    }

    const showPreviewWidget = node.widgets.find((w) => w.name === "show_preview");
    if (showPreviewWidget) {
        const originalCallback = showPreviewWidget.callback;
        showPreviewWidget.callback = function (value) {
            if (originalCallback) {
                originalCallback.call(this, value);
            }
            if (canvas && canvas.setPreviewVisibility) {
                canvas.setPreviewVisibility(value);
            }
            if (node.graph && node.graph.canvas && node.setDirtyCanvas) {
                node.setDirtyCanvas(true, true);
            }
        };
        // Inicjalizuj stan preview na podstawie aktualnej wartości widget'u
        if (canvas && canvas.setPreviewVisibility) {
            canvas.setPreviewVisibility(showPreviewWidget.value);
        }
    }
    return {
        canvas: canvas,
        panel: controlPanel
    };
}
const canvasNodeInstances = new Map();
app.registerExtension({
    name: "Comfy.LayerForgeNode",
    init() {
        addStylesheet('./css/canvas_view.css?v=patch67');
        const originalQueuePrompt = app.queuePrompt;
        app.queuePrompt = async function (number, prompt) {
            log.info("Preparing to queue prompt...");
            if (canvasNodeInstances.size > 0) {
                log.info(`Found ${canvasNodeInstances.size} CanvasNode(s). Sending data via WebSocket...`);
                const sendPromises = [];
                for (const [nodeId, canvasWidget] of canvasNodeInstances.entries()) {
                    if (app.graph.getNodeById(nodeId) && canvasWidget.canvas && canvasWidget.canvas.canvasIO) {
                        log.debug(`Sending data for canvas node ${nodeId}`);
                        sendPromises.push(canvasWidget.canvas.canvasIO.sendDataViaWebSocket(nodeId));
                    }
                    else {
                        log.warn(`Node ${nodeId} not found in graph, removing from instances map.`);
                        canvasNodeInstances.delete(nodeId);
                    }
                }
                try {
                    await Promise.all(sendPromises);
                    log.info("All canvas data has been sent and acknowledged by the server.");
                }
                catch (error) {
                    log.error("Failed to send canvas data for one or more nodes. Aborting prompt.", error);
                    showErrorNotification(`CanvasNode Error: ${error.message}`);
                    return;
                }
            }
            log.info("All pre-prompt tasks complete. Proceeding with original queuePrompt.");
            return originalQueuePrompt.apply(this, arguments);
        };
    },
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeType.comfyClass === "LayerForgeNode") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                log.debug("CanvasNode onNodeCreated: Base widget setup.");
                const r = onNodeCreated?.apply(this, arguments);
                this.size = [1150, 1000];
                return r;
            };
            nodeType.prototype.onAdded = async function () {
                log.info(`CanvasNode onAdded, ID: ${this.id}`);
                log.debug(`Available widgets in onAdded:`, this.widgets.map((w) => w.name));
                if (this.canvasWidget) {
                    log.warn(`CanvasNode ${this.id} already initialized. Skipping onAdded setup.`);
                    return;
                }
                this.widgets.forEach((w) => {
                    log.debug(`Widget name: ${w.name}, type: ${w.type}, value: ${w.value}`);
                });
                const nodeIdWidget = this.widgets.find((w) => w.name === "node_id");
                if (nodeIdWidget) {
                    nodeIdWidget.value = String(this.id);
                    log.debug(`Set hidden node_id widget to: ${nodeIdWidget.value}`);
                }
                else {
                    log.error("Could not find the hidden node_id widget!");
                }
                const canvasWidget = await createCanvasWidget(this, null, app);
                canvasNodeInstances.set(this.id, canvasWidget);
                log.info(`Registered CanvasNode instance for ID: ${this.id}`);
                // Store the canvas widget on the node
                this.canvasWidget = canvasWidget;
                // Check if there are already connected inputs
                setTimeout(() => {
                    if (this.inputs && this.inputs.length > 0) {
                        // Check if input_image (index 0) is connected
                        if (this.inputs[0] && this.inputs[0].link) {
                            log.info("Input image already connected on node creation, checking for data...");
                            if (canvasWidget.canvas && canvasWidget.canvas.canvasIO) {
                                canvasWidget.canvas.inputDataLoaded = false;
                                // Only allow images on init; mask should load only on mask connect or execution
                                canvasWidget.canvas.canvasIO.checkForInputData({ allowImage: true, allowMask: false, reason: "init_image_connected" });
                            }
                        }
                    }
                    if (this.setDirtyCanvas) {
                        this.setDirtyCanvas(true, true);
                    }
                }, 500);
            };
            // Add onConnectionsChange handler to detect when inputs are connected
            nodeType.prototype.onConnectionsChange = function (type, index, connected, link_info) {
                log.info(`onConnectionsChange called: type=${type}, index=${index}, connected=${connected}`, link_info);
                // Check if this is an input connection (type 1 = INPUT)
                if (type === 1) {
                    // Get the canvas widget - it might be in different places
                    const canvasWidget = this.canvasWidget;
                    const canvas = canvasWidget?.canvas || canvasWidget;
                    if (!canvas || !canvas.canvasIO) {
                        log.warn("Canvas not ready in onConnectionsChange, scheduling retry...");
                        // Retry multiple times with increasing delays
                        const retryDelays = [500, 1000, 2000];
                        let retryCount = 0;
                        const tryAgain = () => {
                            const retryCanvas = this.canvasWidget?.canvas || this.canvasWidget;
                            if (retryCanvas && retryCanvas.canvasIO) {
                                log.info("Canvas now ready, checking for input data...");
                                if (connected) {
                                    retryCanvas.inputDataLoaded = false;
                                    // Respect which input triggered the connection:
                                    const opts = (index === 1)
                                        ? { allowImage: false, allowMask: true, reason: "mask_connect" }
                                        : { allowImage: true, allowMask: false, reason: "image_connect" };
                                    retryCanvas.canvasIO.checkForInputData(opts);
                                }
                            }
                            else if (retryCount < retryDelays.length) {
                                log.warn(`Canvas still not ready, retry ${retryCount + 1}/${retryDelays.length}...`);
                                setTimeout(tryAgain, retryDelays[retryCount++]);
                            }
                            else {
                                log.error("Canvas failed to initialize after multiple retries");
                            }
                        };
                        setTimeout(tryAgain, retryDelays[retryCount++]);
                        return;
                    }
                    // Handle input_image connection (index 0)
                    if (index === 0) {
                        if (connected && link_info) {
                            log.info("Input image connected, marking for data check...");
                            // Reset the input data loaded flag to allow loading the new connection
                            canvas.inputDataLoaded = false;
                            // Also reset the last loaded image source and link ID to allow the new image
                            canvas.lastLoadedImageSrc = undefined;
                            canvas.lastLoadedLinkId = undefined;
                            // Mark that we have a pending input connection
                            canvas.hasPendingInputConnection = true;
                            // If mask input is not connected and a mask was auto-applied from input_mask before, clear it now
                            if (!(this.inputs && this.inputs[1] && this.inputs[1].link)) {
                                if (canvas.maskAppliedFromInput && canvas.maskTool) {
                                    canvas.maskTool.clear();
                                    canvas.render();
                                    canvas.maskAppliedFromInput = false;
                                    canvas.lastLoadedMaskLinkId = undefined;
                                    log.info("Cleared auto-applied mask because input_image connected without input_mask");
                                }
                            }
                            // Check for data immediately when connected
                            setTimeout(() => {
                                log.info("Checking for input data after connection...");
                                // Only load images here; masks should not auto-load on image connect
                                canvas.canvasIO.checkForInputData({ allowImage: true, allowMask: false, reason: "manual_import" });
                            }, 500);
                        }
                        else {
                            log.info("Input image disconnected");
                            canvas.hasPendingInputConnection = false;
                            // Reset when disconnected so a new connection can load
                            canvas.inputDataLoaded = false;
                            canvas.lastLoadedImageSrc = undefined;
                            canvas.lastLoadedLinkId = undefined;
                        }
                    }
                    // Handle input_mask connection (index 1)
                    if (index === 1) {
                        if (connected && link_info) {
                            log.info("Input mask connected");
                            // DON'T clear existing mask when connecting a new input
                            // Reset the loaded mask link ID to allow loading from the new connection
                            canvas.lastLoadedMaskLinkId = undefined;
                            // Mark that we have a pending mask connection
                            canvas.hasPendingMaskConnection = true;
                            // Check for data immediately when connected
                            setTimeout(() => {
                                log.info("Checking for input data after mask connection...");
                                // Only load mask here if it's immediately available from the connected node
                                // Don't load stale masks from backend storage
                                canvas.canvasIO.checkForInputData({ allowImage: false, allowMask: true, reason: "mask_connect" });
                            }, 500);
                        }
                        else {
                            log.info("Input mask disconnected");
                            canvas.hasPendingMaskConnection = false;
                            // If the current mask came from input_mask, clear it to avoid affecting images when mask is not connected
                            if (canvas.maskAppliedFromInput && canvas.maskTool) {
                                canvas.maskAppliedFromInput = false;
                                canvas.lastLoadedMaskLinkId = undefined;
                                log.info("Cleared auto-applied mask due to mask input disconnection");
                            }
                        }
                    }
                }
            };
            // Add onExecuted handler to check for input data after workflow execution
            const originalOnExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                log.info("Node executed, checking for input data...");
                const canvas = this.canvasWidget?.canvas || this.canvasWidget;
                if (canvas && canvas.canvasIO) {
                    // Don't reset inputDataLoaded - just check for new data
                    // On execution we allow both image and mask to load
                    canvas.canvasIO.checkForInputData({ allowImage: true, allowMask: true, reason: "execution" });
                }
                // Call original if it exists
                if (originalOnExecuted) {
                    originalOnExecuted.apply(this, arguments);
                }
            };
            const onRemoved = nodeType.prototype.onRemoved;
            nodeType.prototype.onRemoved = function () {
                log.info(`Cleaning up canvas node ${this.id}`);
                // Clean up temp file tracker for this node (just remove from tracker)
                const nodeKey = `node-${this.id}`;
                const tempFileTracker = window.layerForgeTempFileTracker;
                if (tempFileTracker && tempFileTracker.has(nodeKey)) {
                    tempFileTracker.delete(nodeKey);
                    log.debug(`Removed temp file tracker for node ${this.id}`);
                }
                canvasNodeInstances.delete(this.id);
                log.info(`Deregistered CanvasNode instance for ID: ${this.id}`);
                if (window.canvasExecutionStates) {
                    window.canvasExecutionStates.delete(this.id);
                }
                const tooltip = document.getElementById(`painter-help-tooltip-${this.id}`);
                if (tooltip) {
                    tooltip.remove();
                }
                const backdrop = document.querySelector('.painter-modal-backdrop');
                if (backdrop && this.canvasWidget && backdrop.contains(this.canvasWidget.canvas.canvas)) {
                    document.body.removeChild(backdrop);
                }
                if (this.canvasWidget && this.canvasWidget.destroy) {
                    this.canvasWidget.destroy();
                }
                return onRemoved?.apply(this, arguments);
            };
            const originalGetExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
            nodeType.prototype.getExtraMenuOptions = function (_, options) {
                // FIRST: Call original to let other extensions add their options
                originalGetExtraMenuOptions?.apply(this, arguments);
                const self = this;
                // Debug: Log all menu options AFTER other extensions have added theirs
                log.info("Available menu options AFTER original call:", options.map((opt, idx) => ({
                    index: idx,
                    content: opt?.content,
                    hasCallback: !!opt?.callback
                })));
                // Debug: Check node data to see what Impact Pack sees
                const nodeData = self.constructor.nodeData || {};
                log.info("Node data for Impact Pack check:", {
                    output: nodeData.output,
                    outputType: typeof nodeData.output,
                    isArray: Array.isArray(nodeData.output),
                    nodeType: self.type,
                    comfyClass: self.comfyClass
                });
                // Additional debug: Check if any option contains common Impact Pack keywords
                const impactOptions = options.filter((opt, idx) => {
                    if (!opt || !opt.content)
                        return false;
                    const content = opt.content.toLowerCase();
                    return content.includes('impact') ||
                        content.includes('sam') ||
                        content.includes('detector') ||
                        content.includes('segment') ||
                        content.includes('mask') ||
                        content.includes('open in');
                });
                if (impactOptions.length > 0) {
                    log.info("Found potential Impact Pack options:", impactOptions.map(opt => opt.content));
                }
                else {
                    log.info("No Impact Pack-related options found in menu");
                }
                // Debug: Check if Impact Pack extension is loaded
                const impactExtensions = app.extensions.filter((ext) => ext.name && ext.name.toLowerCase().includes('impact'));
                log.info("Impact Pack extensions found:", impactExtensions.map((ext) => ext.name));
                // Debug: Check menu options again after a delay to see if Impact Pack adds options later
                setTimeout(() => {
                    log.info("Menu options after 100ms delay:", options.map((opt, idx) => ({
                        index: idx,
                        content: opt?.content,
                        hasCallback: !!opt?.callback
                    })));
                    // Try to find SAM Detector again
                    const delayedSamDetectorIndex = options.findIndex((option) => option && option.content && (option.content.includes("SAM Detector") ||
                        option.content.includes("SAM") ||
                        option.content.includes("Detector") ||
                        option.content.toLowerCase().includes("sam") ||
                        option.content.toLowerCase().includes("detector")));
                    if (delayedSamDetectorIndex !== -1) {
                        log.info(`Found SAM Detector after delay at index ${delayedSamDetectorIndex}: "${options[delayedSamDetectorIndex].content}"`);
                    }
                    else {
                        log.info("SAM Detector still not found after delay");
                    }
                }, 100);
                // Debug: Let's also check what the Impact Pack extension actually does
                const samExtension = app.extensions.find((ext) => ext.name === 'Comfy.Impact.SAMEditor');
                if (samExtension) {
                    log.info("SAM Extension details:", {
                        name: samExtension.name,
                        hasBeforeRegisterNodeDef: !!samExtension.beforeRegisterNodeDef,
                        hasInit: !!samExtension.init
                    });
                }
                // Remove our old MaskEditor if it exists
                const maskEditorIndex = options.findIndex((option) => option && option.content === "Open in MaskEditor");
                if (maskEditorIndex !== -1) {
                    options.splice(maskEditorIndex, 1);
                }
                // Hook into "Open in SAM Detector" using the new integration module
                setupSAMDetectorHook(self, options);
                const newOptions = [
                    {
                        content: "在遮罩编辑器中打开",
                        callback: async () => {
                            try {
                                log.info("Opening LayerForge canvas in MaskEditor");
                                if (self.canvasWidget && self.canvasWidget.canvas) {
                                    await self.canvasWidget.canvas.startMaskEditor(null, true);
                                }
                                else {
                                    log.error("Canvas widget not available");
                                    showErrorNotification("Canvas not ready. Please try again.");
                                }
                            }
                            catch (e) {
                                log.error("Error opening MaskEditor:", e);
                                showErrorNotification(`Failed to open MaskEditor: ${e.message}`);
                            }
                        },
                    },
                    {
                        content: "打开图像",
                        callback: async () => {
                            try {
                                if (!self.canvasWidget || !self.canvasWidget.canvas)
                                    return;
                                const blob = await self.canvasWidget.canvas.canvasLayers.getFlattenedCanvasAsBlob();
                                if (!blob)
                                    return;
                                const url = URL.createObjectURL(blob);
                                window.open(url, '_blank');
                                setTimeout(() => URL.revokeObjectURL(url), 1000);
                            }
                            catch (e) {
                                log.error("Error opening image:", e);
                            }
                        },
                    },
                    {
                        content: "打开带有 Alpha 遮罩的图像",
                        callback: async () => {
                            try {
                                if (!self.canvasWidget || !self.canvasWidget.canvas)
                                    return;
                                const blob = await self.canvasWidget.canvas.canvasLayers.getFlattenedCanvasWithMaskAsBlob();
                                if (!blob)
                                    return;
                                const url = URL.createObjectURL(blob);
                                window.open(url, '_blank');
                                setTimeout(() => URL.revokeObjectURL(url), 1000);
                            }
                            catch (e) {
                                log.error("Error opening image with mask:", e);
                            }
                        },
                    },
                    {
                        content: "复制图像",
                        callback: async () => {
                            try {
                                if (!self.canvasWidget || !self.canvasWidget.canvas)
                                    return;
                                const blob = await self.canvasWidget.canvas.canvasLayers.getFlattenedCanvasAsBlob();
                                if (!blob)
                                    return;
                                const item = new ClipboardItem({ 'image/png': blob });
                                await navigator.clipboard.write([item]);
                                log.info("Image copied to clipboard.");
                            }
                            catch (e) {
                                log.error("Error copying image:", e);
                                showErrorNotification("Failed to copy image to clipboard.");
                            }
                        },
                    },
                    {
                        content: "复制带有 Alpha 遮罩的图像",
                        callback: async () => {
                            try {
                                if (!self.canvasWidget || !self.canvasWidget.canvas)
                                    return;
                                const blob = await self.canvasWidget.canvas.canvasLayers.getFlattenedCanvasWithMaskAsBlob();
                                if (!blob)
                                    return;
                                const item = new ClipboardItem({ 'image/png': blob });
                                await navigator.clipboard.write([item]);
                                log.info("Image with mask alpha copied to clipboard.");
                            }
                            catch (e) {
                                log.error("Error copying image with mask:", e);
                                showErrorNotification("Failed to copy image with mask to clipboard.");
                            }
                        },
                    },
                    {
                        content: "保存图像",
                        callback: async () => {
                            try {
                                if (!self.canvasWidget || !self.canvasWidget.canvas)
                                    return;
                                const blob = await self.canvasWidget.canvas.canvasLayers.getFlattenedCanvasAsBlob();
                                if (!blob)
                                    return;
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = 'canvas_output.png';
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                setTimeout(() => URL.revokeObjectURL(url), 1000);
                            }
                            catch (e) {
                                log.error("Error saving image:", e);
                            }
                        },
                    },
                    {
                        content: "保存带有 Alpha 遮罩的图像",
                        callback: async () => {
                            try {
                                if (!self.canvasWidget || !self.canvasWidget.canvas)
                                    return;
                                const blob = await self.canvasWidget.canvas.canvasLayers.getFlattenedCanvasWithMaskAsBlob();
                                if (!blob)
                                    return;
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = 'canvas_output_with_mask.png';
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                setTimeout(() => URL.revokeObjectURL(url), 1000);
                            }
                            catch (e) {
                                log.error("Error saving image with mask:", e);
                            }
                        },
                    },
                ];
                if (options.length > 0) {
                    options.unshift({ content: "___", disabled: true });
                }
                options.unshift(...newOptions);
            };
        }
    }
});
