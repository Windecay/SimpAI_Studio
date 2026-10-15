import { api } from "/file=javascript/layerforge/js/api_shim.js?v=patch26";
import { app } from "/file=javascript/layerforge/js/comfy_shim.js?v=patch26";
import { createModuleLogger } from "/file=javascript/layerforge/js/utils/LoggerUtils.js?v=patch26";
import { showErrorNotification } from "/file=javascript/layerforge/js/utils/NotificationUtils.js?v=patch26";
import { processImageToMask } from "/file=javascript/layerforge/js/utils/MaskProcessingUtils.js?v=patch26";
import { convertToImage } from "/file=javascript/layerforge/js/utils/ImageUtils.js?v=patch26";
import { updateNodePreview } from "/file=javascript/layerforge/js/utils/PreviewUtils.js?v=patch26";
import { layerForgeMaskEditor } from "/gradio_api/file=javascript/layerforge/js/LayerForgeMaskEditor.js?v=patch64";

const log = createModuleLogger('MaskEditorIntegration');

export class MaskEditorIntegration {
    constructor(canvas) {
        this.canvas = canvas;
        this.node = canvas.node;
        this.maskTool = canvas.maskTool;
    }

    /**
     * Starts the mask editor (Custom LayerForge Editor)
     * @param {Image|HTMLCanvasElement|null} predefinedMask - Optional mask to apply
     * @param {boolean} sendCleanImage - Whether to send clean image (without mask)
     */
    async startMaskEditor(predefinedMask = null, sendCleanImage = true) {
        log.info('Starting mask editor (custom LayerForge)', {
            hasPredefinedMask: !!predefinedMask,
            sendCleanImage,
            layersCount: this.canvas.layers.length
        });

        // 1. Prepare Background Image
        let blob;
        if (sendCleanImage) {
            log.debug('Getting flattened canvas as blob (clean image)');
            blob = await this.canvas.canvasLayers.getFlattenedCanvasAsBlob();
        } else {
            log.debug('Getting flattened canvas for mask editor (with mask)');
            blob = await this.canvas.canvasLayers.getFlattenedCanvasWithMaskAsBlob();
        }

        if (!blob) {
            log.warn("Canvas is empty, cannot open mask editor.");
            return;
        }

        // 2. Prepare Predefined Mask
        if (!predefinedMask && this.maskTool && this.maskTool.maskCanvas) {
            try {
                log.debug('Creating mask from current mask tool');
                predefinedMask = await this.createMaskFromCurrentMask();
            } catch (error) {
                log.warn("Could not create mask from current mask:", error);
            }
        }

        // 3. Open Custom Editor
        try {
            const imageUrl = URL.createObjectURL(blob);
            let maskUrl = null;
            
            if (predefinedMask) {
                if (predefinedMask instanceof HTMLImageElement) {
                    maskUrl = predefinedMask.src;
                } else if (predefinedMask instanceof HTMLCanvasElement) {
                    maskUrl = predefinedMask.toDataURL();
                }
            }

            const outputAreaBounds = this.canvas.outputAreaBounds;
            const maskCanvas = this.maskTool?.maskCanvas;
            const maskDrawingAreaBounds = maskCanvas ? {
                x: this.maskTool.x,
                y: this.maskTool.y,
                width: maskCanvas.width,
                height: maskCanvas.height
            } : null;

            const resultCanvas = await layerForgeMaskEditor.open(imageUrl, maskUrl, {
                outputAreaBounds,
                maskDrawingAreaBounds
            });
            URL.revokeObjectURL(imageUrl);

            if (resultCanvas) {
                await this.handleEditorResult(resultCanvas);
            } else {
                log.info("Mask editor cancelled");
            }

        } catch (error) {
            log.error("Error in mask editor:", error);
            showErrorNotification(`Error: ${error.message}`);
        }
    }

    async handleEditorResult(resultCanvas) {
        log.info("Processing mask editor result");
        const bounds = this.canvas.outputAreaBounds;

        // Process the result canvas into a mask
        // My editor returns a canvas with:
        // - Transparent background (Alpha 0)
        // - Drawn strokes (Alpha > 0)
        // We want to keep this alpha (positive mask), so invertAlpha = false.
        
        const processedMask = await processImageToMask(resultCanvas, {
            targetWidth: bounds.width,
            targetHeight: bounds.height,
            invertAlpha: false
        });

        // Convert processed mask to image
        const maskAsImage = await convertToImage(processedMask);
        
        log.debug("Applying mask", {
            boundsPos: { x: bounds.x, y: bounds.y },
            maskSize: { width: bounds.width, height: bounds.height }
        });

        this.maskTool.setMask(maskAsImage);
        
        // Update node preview
        await updateNodePreview(this.canvas, this.node, true);
        log.info("Mask editor result processed successfully");
    }

    /**
     * Creates an Image object from current mask canvas
     * @returns {Promise<Image>}
     */
    async createMaskFromCurrentMask() {
        if (!this.maskTool || !this.maskTool.maskCanvas) {
            throw new Error("No mask canvas available");
        }
        return new Promise((resolve, reject) => {
            const maskImage = new Image();
            maskImage.onload = () => resolve(maskImage);
            maskImage.onerror = reject;
            maskImage.src = this.maskTool.maskCanvas.toDataURL();
        });
    }
}
