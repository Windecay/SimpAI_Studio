(function () {
    'use strict';

    function createCanvasUploadNodeFactoryController(context) {
        const scope = context || {};
        const uid = typeof scope.uid === 'function' ? scope.uid : (prefix) => `${prefix}-node`;
        const nowIso = typeof scope.nowIso === 'function' ? scope.nowIso : () => new Date().toISOString();
        const defaultNodeSize = typeof scope.defaultNodeSize === 'function'
            ? scope.defaultNodeSize
            : (type) => type === 'video' ? { w: 360, h: 300 } : { w: 320, h: 260 };

        function buildOutputGalleryMediaNode(item, world, generationMetadata) {
            if (!item) return null;
            const mediaType = item.media_type === 'video' ? 'video' : 'image';
            const position = world || { x: 0, y: 0 };
            const size = mediaType === 'video' ? defaultNodeSize('video') : { w: 264, h: 300 };
            return {
                id: uid(mediaType === 'video' ? 'vid' : 'img'),
                type: mediaType,
                x: Math.round(position.x || 0),
                y: Math.round(position.y || 0),
                w: size.w,
                h: size.h,
                title: item.name || (mediaType === 'video' ? 'gallery video' : 'gallery image'),
                asset: {
                    kind: 'output_gallery',
                    asset_id: `output:${item.relative_path || item.path || uid('asset')}`,
                    mime: item.mime || (mediaType === 'video' ? 'video/mp4' : 'image/png'),
                    size: item.size || 0,
                    width: item.width || null,
                    height: item.height || null,
                    path: item.path || '',
                    output_path: item.path || '',
                    original_output_path: item.path || '',
                    preview_url: item.preview_url || '',
                    thumb: mediaType === 'image' ? (item.preview_url || '') : '',
                    generation_metadata: generationMetadata,
                    edit: mediaType === 'video' ? { trim_start: 0, trim_end: item.duration || 0, enabled: false } : null
                },
                source: {
                    kind: 'output_gallery',
                    folder: item.folder || '',
                    relative_path: item.relative_path || '',
                    generation_metadata: generationMetadata,
                    imported_at: nowIso()
                }
            };
        }

        function buildImageNodeFromTransferItem(item, world, dimensions, thumb) {
            if (!item) return null;
            const position = world || { x: 0, y: 0 };
            const imageDimensions = dimensions || {};
            return {
                id: uid('img'),
                type: 'image',
                x: position.x,
                y: position.y,
                w: 264,
                h: 300,
                title: item.name || 'transfer image',
                display_mode: 'frameless',
                asset: {
                    kind: 'browser_upload',
                    asset_id: `transfer:${item.id}`,
                    mime: item.type || 'image/png',
                    size: item.size || 0,
                    width: imageDimensions.width || item.width || null,
                    height: imageDimensions.height || item.height || null,
                    data_url: item.dataUrl || '',
                    thumb
                },
                source: { kind: 'transfer_station', transfer_id: item.id }
            };
        }

        function buildImageNodeFromFile(file, world, dataUrl, dimensions, thumb) {
            if (!file) return null;
            const position = world || { x: 0, y: 0 };
            const imageDimensions = dimensions || {};
            return {
                id: uid('img'),
                type: 'image',
                x: position.x,
                y: position.y,
                w: 264,
                h: 300,
                title: file.name || 'image',
                display_mode: 'frameless',
                asset: {
                    kind: 'browser_upload',
                    asset_id: uid('asset'),
                    mime: file.type || 'image/png',
                    size: file.size || 0,
                    width: imageDimensions.width || null,
                    height: imageDimensions.height || null,
                    data_url: dataUrl,
                    thumb
                },
                source: { kind: 'dropped_file' }
            };
        }

        function buildMediaNodeFromFile(file, type, world, dataUrl, metadata, previewFrames, waveform) {
            if (!file || !['video', 'audio'].includes(type)) return null;
            const position = world || { x: 0, y: 0 };
            const mediaMetadata = metadata || {};
            const size = defaultNodeSize(type) || { w: 320, h: 260 };
            const duration = mediaMetadata.duration || null;
            return {
                id: uid(type === 'video' ? 'vid' : 'aud'),
                type,
                x: position.x,
                y: position.y,
                w: size.w,
                h: size.h,
                title: file.name || type,
                asset: {
                    kind: 'browser_upload',
                    asset_id: uid('asset'),
                    mime: file.type || (type === 'video' ? 'video/mp4' : 'audio/mpeg'),
                    size: file.size || 0,
                    width: mediaMetadata.width || null,
                    height: mediaMetadata.height || null,
                    duration,
                    fps: mediaMetadata.fps || null,
                    frame_count: mediaMetadata.frame_count || null,
                    data_url: dataUrl,
                    thumb: previewFrames?.[0]?.thumb || '',
                    preview_frames: previewFrames || [],
                    waveform: waveform || [],
                    edit: duration ? { trim_start: 0, trim_end: duration, enabled: false } : null
                },
                source: { kind: 'dropped_file' }
            };
        }

        return {
            buildOutputGalleryMediaNode,
            buildImageNodeFromTransferItem,
            buildImageNodeFromFile,
            buildMediaNodeFromFile
        };
    }

    window.SimpAICanvasWorkbenchUploadNodeFactory = Object.assign({}, window.SimpAICanvasWorkbenchUploadNodeFactory || {}, {
        createCanvasUploadNodeFactoryController
    });
})();
