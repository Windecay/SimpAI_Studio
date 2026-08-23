(function () {
    'use strict';

    const UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const clamp = UTILS.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));
    const formatBytes = UTILS.formatBytes || ((bytes) => String(bytes || ''));

    function assetDisplaySrc(asset) {
        if (!asset) return '';
        if (asset.kind === 'browser_upload') {
            const mime = String(asset.mime || '').toLowerCase();
            const isImageUpload = mime.startsWith('image/') || (!mime && /^data:image\//i.test(String(asset.data_url || '')));
            if (isImageUpload) return asset.thumb || asset.preview_url || asset.data_url || '';
            if (asset.data_url) return asset.data_url;
        }
        const hasProjectRelativePath = !!assetRelativePath(asset);
        const relativeUrl = projectRelativeFileUrl(asset);
        if (hasProjectRelativePath && !relativeUrl) return asset.preview_url || pathToFileUrl(asset.path || asset.output_path || asset.original_output_path) || asset.data_url || asset.thumb || '';
        return relativeUrl || asset.preview_url || pathToFileUrl(asset.path || asset.output_path || asset.original_output_path) || asset.data_url || asset.thumb || '';
    }

    /** Compact thumbnail source for stack/minimap — prefers smaller thumb over full data_url */
    function assetThumbSrc(asset) {
        if (!asset) return '';
        const hasProjectRelativePath = !!assetRelativePath(asset);
        const relativeUrl = projectRelativeFileUrl(asset);
        if (relativeUrl) return relativeUrl;
        if (hasProjectRelativePath) return asset.preview_url || pathToFileUrl(asset.path || asset.output_path || asset.original_output_path) || asset.data_url || asset.thumb || '';
        if (asset.thumb) return asset.thumb;
        if (asset.preview_url) return asset.preview_url;
        if (asset.kind === 'browser_upload' && asset.data_url) return asset.data_url;
        return pathToFileUrl(asset.path || asset.output_path || asset.original_output_path) || asset.data_url || '';
    }

    function pathToFileUrl(path) {
        const text = String(path || '').trim();
        if (!text) return '';
        if (/^(https?:|blob:|data:|\/file=|\/gradio_api\/file=)/i.test(text)) return text;
        return `/file=${encodeURI(text.replace(/\\/g, '/'))}`;
    }

    function projectRelativeFileUrl(asset) {
        if (!asset || typeof asset !== 'object') return '';
        const rel = assetRelativePath(asset);
        if (!rel || rel.includes('..')) return '';
        const root = String(asset.asset_root || window.SimpAICanvasWorkbenchAssetRoot || '').trim();
        if (!root) return '';
        return pathToFileUrl(`${root.replace(/[\\/]+$/g, '')}/${rel}`);
    }

    function assetRelativePath(asset) {
        const explicit = String(asset.asset_relative_path || asset.relative_path || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
        if (explicit) return explicit;
        const candidates = [asset.path, asset.output_path, asset.original_output_path, asset.preview_url, asset.thumb]
            .map(value => decodeAssetPathText(value))
            .filter(Boolean);
        for (const value of candidates) {
            const marker = '/canvas_workbench/assets/';
            const markerIndex = value.indexOf(marker);
            if (markerIndex < 0) continue;
            const tail = value.slice(markerIndex + marker.length).replace(/^\/+/, '');
            const slashIndex = tail.indexOf('/');
            if (slashIndex >= 0) return tail.slice(slashIndex + 1);
        }
        return '';
    }

    function decodeAssetPathText(value) {
        let text = String(value || '').trim();
        if (!text) return '';
        if (text.startsWith('/file=')) text = text.slice('/file='.length);
        if (text.startsWith('/gradio_api/file=')) text = text.slice('/gradio_api/file='.length);
        try {
            text = decodeURIComponent(text);
        } catch (err) {
            // Keep the original path if it is not URL encoded cleanly.
        }
        text = text.split(/[?#]/, 1)[0];
        return text.replace(/\\/g, '/').replace(/\/+/g, '/');
    }

    function readAssetInfo(asset, hasMask) {
        const bits = [];
        if (asset?.width && asset?.height) bits.push(`${asset.width} x ${asset.height}`);
        if (asset?.duration) bits.push(`${formatDuration(asset.duration)}`);
        if (asset?.fps) bits.push(`${formatFps(asset.fps)} fps`);
        if (asset?.frame_count) bits.push(`${Math.round(Number(asset.frame_count) || 0)} frames`);
        const range = mediaEditRange(asset);
        if (range.clipped) {
            const clipBits = [`clip ${formatDuration(range.end - range.start)}`];
            if (range.trim_frames) clipBits.push(`${range.trim_frames} frames`);
            bits.push(clipBits.join(' / '));
        }
        if (asset?.size) bits.push(formatBytes(asset.size));
        if (asset?.mime) bits.push(asset.mime);
        if (hasMask) bits.push('Mask');
        return bits;
    }

    function formatDuration(seconds) {
        const value = Number(seconds || 0);
        if (!Number.isFinite(value) || value <= 0) return '';
        const mins = Math.floor(value / 60);
        const secs = Math.round(value % 60).toString().padStart(2, '0');
        return mins ? `${mins}:${secs}` : `${Math.round(value * 10) / 10}s`;
    }

    function formatFps(value) {
        const fps = Number(value || 0);
        if (!Number.isFinite(fps) || fps <= 0) return '';
        return fps >= 10 ? String(Math.round(fps * 100) / 100) : String(Math.round(fps * 1000) / 1000);
    }

    function mediaEditRange(asset) {
        const duration = Math.max(0, Number(asset?.duration || 0) || 0);
        const edit = asset?.edit && typeof asset.edit === 'object' ? asset.edit : {};
        let start = Math.max(0, Number(edit.trim_start || 0) || 0);
        let end = Number(edit.trim_end || duration || 0) || duration || 0;
        if (duration > 0) {
            start = clamp(start, 0, duration);
            end = clamp(end, start, duration);
        } else {
            end = Math.max(start, end);
        }
        return {
            start,
            end,
            duration,
            clipped: duration > 0 && (start > 0.01 || end < duration - 0.01),
            trim_frames: asset?.fps ? Math.max(1, Math.round(Math.max(0, end - start) * Number(asset.fps))) : null
        };
    }

    function readImageInfo(node) {
        return readAssetInfo(node?.asset || {}, !!node?.mask?.data_url);
    }

    function mediaAspectStyle(asset) {
        const width = Number(asset?.width || 0);
        const height = Number(asset?.height || 0);
        if (!width || !height) return '';
        const aspect = clamp(width / height, 0.25, 4);
        return ` style="--sai-media-aspect:${aspect.toFixed(5)}" data-aspect="true"`;
    }

    function readAssetSize(asset) {
        if (!asset) return '';
        if (asset.width && asset.height) return `${asset.width} x ${asset.height}`;
        if (asset.size) return formatBytes(asset.size);
        return asset.mime || '';
    }

    function serializeAssetForRun(asset) {
        if (!asset || typeof asset !== 'object') return {};
        return {
            kind: asset.kind || '',
            asset_id: asset.asset_id || '',
            asset_root_key: asset.asset_root_key || '',
            asset_relative_path: asset.asset_relative_path || asset.relative_path || '',
            relative_path: asset.relative_path || asset.asset_relative_path || '',
            copied_to_assets: !!asset.copied_to_assets,
            mime: asset.mime || '',
            width: asset.width || null,
            height: asset.height || null,
            duration: asset.duration || null,
            fps: asset.fps || null,
            frame_count: asset.frame_count || null,
            size: asset.size || null,
            data_url: asset.data_url || '',
            preview_url: asset.preview_url || '',
            output_path: asset.output_path || '',
            path: asset.path || '',
            edit: asset.edit && typeof asset.edit === 'object' ? JSON.parse(JSON.stringify(asset.edit)) : null,
            preview_frames: Array.isArray(asset.preview_frames) ? asset.preview_frames.slice(0, 12) : [],
            waveform: Array.isArray(asset.waveform) ? asset.waveform.slice(0, 160) : []
        };
    }

    function serializeMaskForRun(mask, fallbackName) {
        if (!mask) return null;
        return {
            kind: mask.kind || 'canvas_mask',
            asset_id: mask.asset_id || '',
            name: mask.name || fallbackName || 'image.mask.png',
            mime: mask.mime || 'image/png',
            width: mask.width || null,
            height: mask.height || null,
            data_url: mask.data_url || '',
            thumb: mask.thumb || '',
            updated_at: mask.updated_at || ''
        };
    }

    function serializeAssetSourceForRun(node, options) {
        if (!node) return null;
        const opts = options || {};
        const asset = node.type === 'result' && typeof opts.getSelectedResultAsset === 'function'
            ? opts.getSelectedResultAsset(node)
            : (node.asset
                || (node.type === 'pose_studio' ? node.pose_studio?.output_asset : null)
                || (node.type === 'liveportrait_expression' ? node.liveportrait_expression?.output_asset : null)
                || {});
        const cloneValue = typeof opts.cloneValue === 'function' ? opts.cloneValue : ((value, fallback) => value ?? fallback);
        return {
            node_id: node.id,
            type: node.type,
            title: node.title || '',
            asset: serializeAssetForRun(asset || {}),
            mask: serializeMaskForRun(node.mask, `${node.title || node.id || 'image'}.mask.png`),
            source: cloneValue(node.source || {}, {})
        };
    }

    window.SimpAICanvasWorkbenchAssetNodes = {
        assetDisplaySrc,
        assetThumbSrc,
        readAssetInfo,
        readImageInfo,
        mediaAspectStyle,
        readAssetSize,
        formatDuration,
        mediaEditRange,
        serializeAssetForRun,
        serializeMaskForRun,
        serializeAssetSourceForRun
    };
})();
