(function () {
    'use strict';

    function createCanvasBatchItemFactoryController(context) {
        const scope = context || {};
        const uid = typeof scope.uid === 'function' ? scope.uid : (prefix) => `${prefix}-item`;
        const nowIso = typeof scope.nowIso === 'function' ? scope.nowIso : () => new Date().toISOString();
        const t = typeof scope.t === 'function' ? scope.t : ((en, cn) => cn || en);
        const cloneRunValue = typeof scope.cloneRunValue === 'function'
            ? scope.cloneRunValue
            : ((value, fallback) => {
                try {
                    return JSON.parse(JSON.stringify(value ?? fallback));
                } catch (err) {
                    return fallback;
                }
            });

        function buildTextBatchItemFromFile(file, value) {
            return {
                id: uid('batch_item'),
                name: file.name || 'text item',
                media_kind: 'text',
                added_at: nowIso(),
                text: { value, updated_at: nowIso() },
                asset: null
            };
        }

        function buildMediaBatchItemFromFile(file, kind, dataUrl, metadata, thumb, previewFrames, waveform) {
            const mediaMetadata = metadata || {};
            const duration = mediaMetadata.duration || null;
            return {
                id: uid('batch_item'),
                name: file.name || `${kind} item`,
                media_kind: kind,
                added_at: nowIso(),
                asset: {
                    kind: 'browser_upload',
                    asset_id: uid('asset'),
                    mime: file.type || (kind === 'video' ? 'video/mp4' : (kind === 'audio' ? 'audio/mpeg' : 'image/png')),
                    size: file.size || 0,
                    width: mediaMetadata.width || null,
                    height: mediaMetadata.height || null,
                    duration,
                    fps: mediaMetadata.fps || null,
                    frame_count: mediaMetadata.frame_count || null,
                    data_url: dataUrl,
                    thumb,
                    preview_frames: previewFrames || [],
                    waveform: waveform || [],
                    edit: duration ? { trim_start: 0, trim_end: duration, enabled: false } : null
                }
            };
        }

        function buildTextBatchItemFromSource(source, value) {
            return {
                id: uid('batch_item'),
                name: source.title || `${t('Text', '文本')} item`,
                media_kind: 'text',
                source_node_id: source.id,
                source_node_type: source.type,
                added_at: nowIso(),
                text: { value, updated_at: nowIso() },
                asset: null
            };
        }

        function buildMediaBatchItemFromSource(source, kind, asset) {
            const clonedAsset = cloneRunValue(asset, {});
            return {
                id: uid('batch_item'),
                name: source.title || clonedAsset.name || clonedAsset.filename || `${kind} item`,
                media_kind: kind,
                source_node_id: source.id,
                source_node_type: source.type,
                added_at: nowIso(),
                asset: clonedAsset
            };
        }

        return {
            buildTextBatchItemFromFile,
            buildMediaBatchItemFromFile,
            buildTextBatchItemFromSource,
            buildMediaBatchItemFromSource
        };
    }

    window.SimpAICanvasWorkbenchBatchItemFactory = Object.assign({}, window.SimpAICanvasWorkbenchBatchItemFactory || {}, {
        createCanvasBatchItemFactoryController
    });
})();
