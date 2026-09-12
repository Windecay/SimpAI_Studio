(function () {
    'use strict';

    function createCanvasAssetFactoryController(context) {
        const scope = context || {};
        const uid = typeof scope.uid === 'function' ? scope.uid : (type) => `${type}-asset`;
        const nowIso = typeof scope.nowIso === 'function'
            ? scope.nowIso
            : (() => new Date().toISOString());
        const cloneRunValue = typeof scope.cloneRunValue === 'function'
            ? scope.cloneRunValue
            : ((value, fallback) => {
                try {
                    return JSON.parse(JSON.stringify(value ?? fallback));
                } catch (err) {
                    return fallback;
                }
            });

        function buildBrowserImageAsset(options) {
            const config = options || {};
            const asset = {
                kind: config.kind || 'browser_upload',
                asset_id: config.assetId || uid('asset'),
                mime: config.mime || 'image/png',
                size: config.size || 0,
                width: config.width ?? null,
                height: config.height ?? null,
                data_url: config.dataUrl || '',
                thumb: config.thumb || ''
            };
            if (config.previewUrl !== undefined) asset.preview_url = config.previewUrl;
            return asset;
        }

        function buildBrowserMediaAsset(options) {
            const config = options || {};
            return {
                kind: config.kind || 'browser_upload',
                asset_id: config.assetId || uid('asset'),
                mime: config.mime || 'application/octet-stream',
                size: config.size || 0,
                width: config.width ?? null,
                height: config.height ?? null,
                duration: config.duration ?? null,
                fps: config.fps ?? null,
                frame_count: config.frameCount ?? null,
                data_url: config.dataUrl || '',
                thumb: config.thumb || '',
                preview_frames: config.previewFrames || [],
                waveform: config.waveform || [],
                edit: config.edit ?? null
            };
        }

        function buildImageOutputAsset(options) {
            const config = options || {};
            return {
                kind: config.kind || 'canvas_output',
                asset_id: config.assetId || uid('asset'),
                name: config.name || '',
                mime: config.mime || 'image/png',
                width: config.width ?? null,
                height: config.height ?? null,
                data_url: config.dataUrl || '',
                thumb: config.thumb || ''
            };
        }

        function buildTimelineRenderAsset(options) {
            const config = options || {};
            if (!config.assetRef || typeof config.assetRef !== 'object') return null;
            const ref = cloneRunValue(config.assetRef, {});
            return Object.assign({}, ref, {
                kind: ref.kind || config.kind || 'timeline_render',
                render_payload: cloneRunValue(config.renderPayload || {}, {}),
                gallery: cloneRunValue(config.gallery ?? null, null),
                thumb: ref.thumb || config.dataUrl || ref.preview_url || ''
            });
        }

        function buildTimelinePreviewAsset(options) {
            const config = options || {};
            const dataUrl = config.dataUrl || '';
            if (!dataUrl) return null;
            const asset = {
                kind: config.kind || 'timeline_preview_frame',
                asset_id: config.assetId || uid('asset'),
                name: config.name || '',
                mime: config.mime || 'image/png',
                width: config.width ?? null,
                height: config.height ?? null,
                duration: config.duration ?? null,
                fps: config.fps ?? null,
                data_url: dataUrl,
                thumb: config.thumb || dataUrl
            };
            if (Object.prototype.hasOwnProperty.call(config, 'renderPayload')) {
                asset.render_payload = cloneRunValue(config.renderPayload, {});
            }
            return asset;
        }

        function buildTimelineCompareAsset(options) {
            const config = options || {};
            const hasAssetRef = !!config.assetRef && typeof config.assetRef === 'object';
            const asset = hasAssetRef ? cloneRunValue(config.assetRef, {}) : {
                asset_id: config.assetId || uid('asset')
            };
            if (config.kind !== undefined || !asset.kind) asset.kind = config.kind || 'timeline_compare';
            if (config.name !== undefined) asset.name = config.name;
            if (config.mime !== undefined) asset.mime = config.mime;
            if (config.width !== undefined) asset.width = config.width;
            if (config.height !== undefined) asset.height = config.height;
            if (config.dataUrl !== undefined) asset.data_url = config.dataUrl || '';
            if (config.thumb !== undefined) {
                asset.thumb = config.thumb || '';
            } else if (!asset.thumb) {
                asset.thumb = asset.preview_url || '';
            }
            return asset;
        }

        function buildGeneratedMaskAsset(options) {
            const config = options || {};
            const ref = cloneRunValue(config.assetRef || {}, {});
            return Object.assign({}, ref, {
                kind: config.kind || 'generated_mask',
                mime: config.mime || ref.mime || 'image/png',
                width: config.width ?? ref.width ?? null,
                height: config.height ?? ref.height ?? null,
                path: config.path ?? ref.path ?? '',
                preview_url: config.previewUrl ?? ref.preview_url ?? ''
            });
        }

        function buildVideoResponseAsset(options) {
            const config = options || {};
            const ref = cloneRunValue(config.assetRef || {}, {});
            const asset = Object.assign({}, ref, {
                kind: ref.kind || config.kind || 'generated_video',
                mime: ref.mime || config.mime || 'video/mp4'
            });
            if (config.includeStorageFields) {
                asset.path = ref.path || config.path || '';
                asset.preview_url = ref.preview_url || config.previewUrl || '';
            }
            if (config.metadata && typeof config.metadata === 'object') {
                Object.assign(asset, cloneRunValue(config.metadata, {}));
            }
            return asset;
        }

        function buildAssetReference(asset) {
            if (asset === null || asset === undefined) return null;
            return cloneRunValue(asset, asset);
        }

        function buildMaskAsset(options) {
            const config = options || {};
            return {
                kind: config.kind || 'canvas_mask',
                asset_id: config.assetId || uid('mask'),
                name: config.name || '',
                mime: config.mime || 'image/png',
                width: config.width ?? null,
                height: config.height ?? null,
                data_url: config.dataUrl || '',
                thumb: config.thumb || '',
                updated_at: nowIso()
            };
        }

        function buildMaterializedAsset(previousAsset, assetRef) {
            const previous = cloneRunValue(previousAsset || {}, {});
            const ref = cloneRunValue(assetRef || {}, {});
            return Object.assign({}, previous, ref, {
                kind: ref.kind || previous.kind || 'canvas_asset',
                mime: ref.mime || previous.mime || '',
                width: ref.width || previous.width || null,
                height: ref.height || previous.height || null,
                duration: ref.duration || previous.duration || null,
                fps: ref.fps || previous.fps || null,
                frame_count: ref.frame_count || previous.frame_count || null,
                size: ref.size || previous.size || null,
                preview_url: ref.preview_url || previous.preview_url || '',
                thumb: previous.thumb || ref.preview_url || '',
                generation_metadata: ref.generation_metadata || previous.generation_metadata || null
            });
        }

        function buildAssetMetadataPatch(previousAsset, metadata) {
            return Object.assign(
                {},
                cloneRunValue(previousAsset || {}, {}),
                cloneRunValue(metadata || {}, {})
            );
        }

        function buildMediaTrimAsset(previousAsset, options) {
            const config = options || {};
            const edit = config.mergeExisting === false
                ? {}
                : cloneRunValue(previousAsset?.edit || {}, {});
            Object.assign(edit, {
                trim_start: config.trimStart ?? 0,
                trim_end: config.trimEnd ?? 0,
                enabled: !!config.enabled
            });
            return buildAssetMetadataPatch(previousAsset, { edit });
        }

        function buildMediaEditAsset(previousAsset, edit) {
            const previous = cloneRunValue(previousAsset || {}, {});
            const previousEdit = previous.edit && typeof previous.edit === 'object'
                ? previous.edit
                : {};
            return Object.assign({}, previous, {
                edit: Object.assign({}, previousEdit, cloneRunValue(edit || {}, {}))
            });
        }

        return {
            buildBrowserImageAsset,
            buildBrowserMediaAsset,
            buildImageOutputAsset,
            buildTimelineRenderAsset,
            buildTimelinePreviewAsset,
            buildTimelineCompareAsset,
            buildGeneratedMaskAsset,
            buildVideoResponseAsset,
            buildAssetReference,
            buildMaskAsset,
            buildMaterializedAsset,
            buildAssetMetadataPatch,
            buildMediaTrimAsset,
            buildMediaEditAsset
        };
    }

    window.SimpAICanvasWorkbenchAssetFactory = Object.assign({}, window.SimpAICanvasWorkbenchAssetFactory || {}, {
        createCanvasAssetFactoryController
    });
})();
