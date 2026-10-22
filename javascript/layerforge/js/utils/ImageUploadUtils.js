// @ts-ignore
import { api } from "../api_shim.js?v=patch26";
import { createModuleLogger } from "./LoggerUtils.js?v=patch26";
import { withErrorHandling, createValidationError, createNetworkError } from "../ErrorHandler.js?v=patch26";
const log = createModuleLogger('ImageUploadUtils');
/**
 * Uploads an image blob to ComfyUI server and returns image element
 * @param blob - Image blob to upload
 * @param options - Upload options
 * @returns Promise with upload result
 */
export const uploadImageBlob = withErrorHandling(async function (blob, options = {}) {
    if (!blob) {
        throw createValidationError("需要 Blob 对象", { blob });
    }
    if (blob.size === 0) {
        throw createValidationError("Blob 对象不能为空", { blobSize: blob.size });
    }
    const { filenamePrefix = 'layerforge', overwrite = true, type = 'temp', nodeId } = options;
    // Generate unique filename
    const timestamp = Date.now();
    const nodeIdSuffix = nodeId ? `-${nodeId}` : '';
    const filename = `${filenamePrefix}${nodeIdSuffix}-${timestamp}.png`;
    log.debug('Uploading image blob:', {
        filename,
        blobSize: blob.size,
        type,
        overwrite
    });
    // Create FormData
    const formData = new FormData();
    formData.append("image", blob, filename);
    formData.append("overwrite", overwrite.toString());
    formData.append("type", type);
    // Upload to server
    const response = await api.fetchApi("/upload/image", {
        method: "POST",
        body: formData,
    });
    if (!response.ok) {
        throw createNetworkError(`上传图像失败: ${response.statusText}`, {
            status: response.status,
            statusText: response.statusText,
            filename,
            blobSize: blob.size
        });
    }
    const data = await response.json();
    log.debug('Image uploaded successfully:', data);
    // Create image element with proper URL
    const imageUrl = api.apiURL(`/view?filename=${encodeURIComponent(data.name)}&type=${data.type}&subfolder=${data.subfolder}`);
    const imageElement = new Image();
    imageElement.crossOrigin = "anonymous";
    // Wait for image to load
    await new Promise((resolve, reject) => {
        imageElement.onload = () => {
            log.debug("Uploaded image loaded successfully", {
                width: imageElement.width,
                height: imageElement.height,
                src: imageElement.src.substring(0, 100) + '...'
            });
            resolve();
        };
        imageElement.onerror = (error) => {
            log.error("Failed to load uploaded image", error);
            reject(createNetworkError("加载上传的图像失败", { error, imageUrl, filename }));
        };
        imageElement.src = imageUrl;
    });
    return {
        data,
        filename,
        imageUrl,
        imageElement
    };
}, 'uploadImageBlob');
/**
 * Uploads canvas content as image blob
 * @param canvas - Canvas element or Canvas object with canvasLayers
 * @param options - Upload options
 * @returns Promise with upload result
 */
export const uploadCanvasAsImage = withErrorHandling(async function (canvas, options = {}) {
    if (!canvas) {
        throw createValidationError("Canvas is required", { canvas });
    }
    let blob = null;
    // Handle different canvas types
    if (canvas.canvasLayers && typeof canvas.canvasLayers.getFlattenedCanvasAsBlob === 'function') {
        // LayerForge Canvas object
        blob = await canvas.canvasLayers.getFlattenedCanvasAsBlob();
    }
    else if (canvas instanceof HTMLCanvasElement) {
        // Standard HTML Canvas
        blob = await new Promise(resolve => canvas.toBlob(resolve));
    }
    else {
        throw createValidationError("不支持的 Canvas 类型", {
            canvas,
            hasCanvasLayers: !!canvas.canvasLayers,
            isHTMLCanvas: canvas instanceof HTMLCanvasElement
        });
    }
    if (!blob) {
        throw createValidationError("生成 Canvas Blob 失败", { canvas, options });
    }
    return uploadImageBlob(blob, options);
}, 'uploadCanvasAsImage');
/**
 * Uploads canvas with mask as image blob
 * @param canvas - Canvas object with canvasLayers
 * @param options - Upload options
 * @returns Promise with upload result
 */
export const uploadCanvasWithMaskAsImage = withErrorHandling(async function (canvas, options = {}) {
    if (!canvas) {
        throw createValidationError("需要 Canvas 对象", { canvas });
    }
    if (!canvas.canvasLayers || typeof canvas.canvasLayers.getFlattenedCanvasWithMaskAsBlob !== 'function') {
        throw createValidationError("Canvas 不支持遮罩操作", {
            canvas,
            hasCanvasLayers: !!canvas.canvasLayers,
            hasMaskMethod: !!(canvas.canvasLayers && typeof canvas.canvasLayers.getFlattenedCanvasWithMaskAsBlob === 'function')
        });
    }
    const blob = await canvas.canvasLayers.getFlattenedCanvasWithMaskAsBlob();
    if (!blob) {
        throw createValidationError("生成带遮罩的 Canvas Blob 失败", { canvas, options });
    }
    return uploadImageBlob(blob, options);
}, 'uploadCanvasWithMaskAsImage');
