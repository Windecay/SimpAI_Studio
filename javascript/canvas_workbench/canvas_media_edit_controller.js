(function () {
    'use strict';

    function createCanvasMediaEditController(context) {
        const scope = context?.mediaEditSource || context || {};
        const domSource = scope.domSource || {};
        const stateSource = scope.stateSource || {};
        const nodeSource = scope.nodeSource || {};
        const assetSource = scope.assetSource || {};
        const patchSource = scope.patchSource || {};
        const historySource = scope.historySource || {};
        const mediaSource = scope.mediaSource || {};
        const renderSource = scope.renderSource || {};
        const viewerSource = scope.viewerSource || {};
        const utilitySource = scope.utilitySource || {};
        const fileSource = scope.fileSource || {};
        const layoutSource = scope.layoutSource || {};
        const storageSource = scope.storageSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const timeSource = scope.timeSource || {};

        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject?.[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const getDocument = () => call(domSource, 'getDocument', null);
        const getNodesLayer = () => call(domSource, 'getNodesLayer', null);
        const getInspector = () => call(domSource, 'getInspector', null);
        const getSelectedNodeId = () => call(stateSource, 'getSelectedNodeId', '');
        const getNode = (id) => call(nodeSource, 'getNode', null, id);
        const isNodeLocked = (node) => !!call(nodeSource, 'isNodeLocked', false, node);
        const getMediaEditRange = (asset) => call(
            assetSource,
            'getMediaEditRange',
            { start: 0, end: Number(asset?.duration || 0) || 0, duration: Number(asset?.duration || 0) || 0, clipped: false },
            asset
        );
        const formatDuration = (seconds) => call(assetSource, 'formatDuration', String(seconds ?? 0), seconds);
        const buildMediaTrimAsset = (asset, edit) => call(patchSource, 'buildMediaTrimAsset', asset, asset, edit);
        const buildMediaNodeStatePatch = (node, patch) => call(
            patchSource,
            'buildMediaNodeStatePatch',
            patch,
            node,
            patch
        );
        const clamp = (value, min, max) => call(
            utilitySource,
            'clamp',
            Math.max(min, Math.min(max, value)),
            value,
            min,
            max
        );
        const escapeHtml = (value) => call(
            utilitySource,
            'escapeHtml',
            String(value ?? '').replace(/[&<>"']/g, (char) => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[char])),
            value
        );
        const cssEscape = typeof utilitySource.cssEscape === 'function'
            ? utilitySource.cssEscape
            : (value) => String(value ?? '').replace(/["\\]/g, '\\$&');
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };
        const warn = typeof uiSource.warn === 'function' ? uiSource.warn : console.warn;

        function finishImageReplacement(node, buildMessage, logKind) {
            call(stateSource, 'selectReplacedNode', undefined, node.id);
            call(renderSource, 'invalidateRenderedNode', undefined, node.id);
            call(renderSource, 'mutate', undefined);
            call(viewerSource, 'syncPresetSpecialViewersForAssetNode', undefined, node.id);
            call(uiSource, 'showToast', undefined, buildMessage());
            call(storageSource, 'materializeNodeAssetForStorage', Promise.resolve(), node.id)
                .catch(err => warn(`[SimpAI Canvas] ${logKind} materialize skipped:`, err));
            return true;
        }

        async function applyTransferItemToImageNode(node, item, options) {
            if (!node || node.type !== 'image' || !item) return false;
            const dataUrl = item.dataUrl || '';
            const previewUrl = item.previewUrl || '';
            const dimensions = await call(fileSource, 'getImageDimensions', {}, dataUrl || previewUrl);
            const thumb = dataUrl ? await call(fileSource, 'createThumbnailDataUrl', '', dataUrl, 1024) : previewUrl;
            call(historySource, 'pushHistory', undefined, options?.history || 'Replace image');
            const asset = call(patchSource, 'buildBrowserImageAsset', null, {
                assetId: item.id ? `transfer:${item.id}` : undefined,
                mime: item.type || 'image/png',
                size: item.size || 0,
                width: dimensions.width || item.width || null,
                height: dimensions.height || item.height || null,
                dataUrl,
                previewUrl,
                thumb
            });
            Object.assign(node, buildMediaNodeStatePatch(node, {
                asset,
                title: item.name || node.title || 'image',
                mask: null
            }));
            if (String(node.display_mode || node.image_display_mode || '').toLowerCase() !== 'card') {
                Object.assign(node, buildMediaNodeStatePatch(node, { displayMode: 'frameless' }));
            }
            call(layoutSource, 'fitImageNodeToAssetBounds', undefined, node, node.asset);
            Object.assign(node, call(patchSource, 'buildMediaNodeSourcePatch', {}, node, {
                kind: 'transfer_station_drop',
                transfer_id: item.id || ''
            }));
            return finishImageReplacement(node, () => t('Image placed into Image node.', '图片已放入图像节点'), 'dropped image');
        }

        async function applyImageFileToNode(node, file, options) {
            if (!node || !['image', 'result'].includes(node.type) || !call(fileSource, 'isImageFile', false, file)) return false;
            const dataUrl = await call(fileSource, 'readFileAsDataUrl', '', file);
            const dimensions = await call(fileSource, 'getImageDimensions', {}, dataUrl);
            const thumb = await call(fileSource, 'createThumbnailDataUrl', '', dataUrl, 1024);
            call(historySource, 'pushHistory', undefined, options?.history || 'Replace image');
            const asset = call(patchSource, 'buildBrowserImageAsset', null, {
                mime: file.type || 'image/png',
                size: file.size || 0,
                width: dimensions.width || null,
                height: dimensions.height || null,
                dataUrl,
                thumb
            });
            const nextTitle = file.name || node.title || 'image';
            if (node.type === 'result') {
                Object.assign(node, call(patchSource, 'buildResultAssetPatch', {}, node, { asset, mask: null }));
                Object.assign(node, call(patchSource, 'buildResultLayoutPatch', {}, node, { title: nextTitle }));
                Object.assign(node, call(patchSource, 'buildResultManualReplacementPatch', {}, node, { kind: 'manual_output' }));
                Object.assign(node, call(patchSource, 'buildResultStatusPatch', {}, node, {
                    status: call(patchSource, 'mergeCanvasRunStatus', {}, node.status, 'manual',
                        t('Output image manually replaced.', '手动替换的输出图片'), { percent: 1 })
                }));
            } else {
                Object.assign(node, buildMediaNodeStatePatch(node, {
                    asset,
                    mask: null,
                    title: nextTitle
                }));
                if (String(node.display_mode || node.image_display_mode || '').toLowerCase() !== 'card') {
                    Object.assign(node, call(patchSource, 'buildMediaNodeSourcePatch', {}, node, { kind: options?.sourceKind || 'manual_upload' }));
                    Object.assign(node, buildMediaNodeStatePatch(node, { displayMode: 'frameless' }));
                    call(layoutSource, 'fitImageNodeToAssetBounds', undefined, node, node.asset);
                } else {
                    Object.assign(node, call(patchSource, 'buildMediaNodeSourcePatch', {}, node, { kind: options?.sourceKind || 'manual_upload' }));
                }
            }
            return finishImageReplacement(node, () => t('Image replaced.', '图片已替换'), 'image');
        }

        async function applyMediaFileToNode(node, file, options) {
            if (!node || !['video', 'audio'].includes(node.type) || !file) return false;
            if (isNodeLocked(node)) {
                call(uiSource, 'showToast', undefined, t('Locked node cannot be edited', '锁定节点不能编辑'));
                return false;
            }
            const type = call(fileSource, 'isVideoFile', false, file) ? 'video'
                : (call(fileSource, 'isAudioFile', false, file) ? 'audio' : '');
            if (!type || type !== node.type) {
                call(uiSource, 'showToast', undefined, type
                    ? t('Selected media type does not match this node.', '所选媒体类型与当前节点不匹配。')
                    : t('Unsupported media file.', '不支持的媒体文件。'));
                return false;
            }
            const dataUrl = await call(fileSource, 'readFileAsDataUrl', '', file);
            const metadata = await call(fileSource, 'getMediaMetadata', {}, dataUrl, type);
            const previewFrames = type === 'video'
                ? await call(fileSource, 'createVideoStoryboardDataUrls', [], dataUrl, metadata.duration, 8) : [];
            const waveform = type === 'audio' ? await call(fileSource, 'createAudioWaveformPeaks', [], file, 96) : [];
            const duration = metadata.duration || null;
            call(historySource, 'pushHistory', undefined,
                options?.history || (type === 'video' ? 'Re-upload video asset' : 'Re-upload audio asset'));
            Object.assign(node, buildMediaNodeStatePatch(node, {
                title: file.name || node.title || type,
                asset: call(patchSource, 'buildBrowserMediaAsset', null, {
                    mime: file.type || (type === 'video' ? 'video/mp4' : 'audio/mpeg'),
                    size: file.size || 0,
                    width: metadata.width || null,
                    height: metadata.height || null,
                    duration,
                    fps: metadata.fps || null,
                    frameCount: metadata.frame_count || null,
                    dataUrl,
                    thumb: previewFrames[0]?.thumb || '',
                    previewFrames,
                    waveform,
                    edit: duration ? { trim_start: 0, trim_end: duration, enabled: false } : null
                })
            }));
            Object.assign(node, call(patchSource, 'buildMediaNodeSourcePatch', {}, node, {
                kind: options?.sourceKind || 'manual_reupload',
                uploaded_name: file.name || '',
                uploaded_at: call(timeSource, 'nowIso', '')
            }));
            call(renderSource, 'mutate', undefined, { inspector: true });
            const response = await call(storageSource, 'materializeNodeAssetForStorage', null, node.id);
            const successMessage = type === 'video'
                ? t('Video asset replaced.', '视频资产已替换。')
                : t('Audio asset replaced.', '音频资产已替换。');
            const browserOnlyMessage = type === 'video'
                ? t('Video asset replaced in browser; storage failed.', '视频已在浏览器中替换；入库失败。')
                : t('Audio asset replaced in browser; storage failed.', '音频已在浏览器中替换；入库失败。');
            call(uiSource, 'showToast', undefined, response?.ok ? successMessage : browserOnlyMessage);
            return true;
        }

        function roundMediaTime(value) {
            return Math.round((Number(value) || 0) * 100) / 100;
        }

        function updateMediaTrim(nodeId, endpoint, rawValue, options) {
            const node = getNode(nodeId);
            if (!node || !['video', 'audio'].includes(node.type) || isNodeLocked(node)) return;
            const asset = node.asset || {};
            const duration = Math.max(0, Number(asset.duration || 0) || 0);
            if (!duration) return;
            const current = getMediaEditRange(asset);
            const minGap = duration > 1 ? 0.05 : 0;
            let start = current.start;
            let end = current.end || duration;
            const value = clamp(Number(rawValue) || 0, 0, duration);
            if (endpoint === 'start') start = clamp(value, 0, Math.max(0, end - minGap));
            if (endpoint === 'end') end = clamp(value, Math.min(duration, start + minGap), duration);
            call(historySource, 'pushHistoryBatch', undefined, `media-trim:${nodeId}`, 'Edit media trim');
            const nextAsset = buildMediaTrimAsset(asset, {
                trimStart: roundMediaTime(start),
                trimEnd: roundMediaTime(end),
                enabled: start > 0.01 || end < duration - 0.01
            });
            Object.assign(node, buildMediaNodeStatePatch(node, { asset: nextAsset }));
            const previewTime = endpoint === 'end' ? end : start;
            call(mediaSource, 'showVideoScrubPreview', undefined, node, previewTime);
            call(mediaSource, 'seekNodeMediaPlayer', undefined, nodeId, previewTime, { immediate: !!options?.commit });
            refreshMediaTrimUi(nodeId);
            call(renderSource, 'scheduleSave');
            if (options?.commit) call(renderSource, 'mutate', undefined, { inspector: true });
        }

        function resetMediaTrim(node) {
            if (!node || !['video', 'audio'].includes(node.type) || !node.asset || isNodeLocked(node)) return;
            const duration = Math.max(0, Number(node.asset.duration || 0) || 0);
            call(historySource, 'pushHistory', undefined, 'Reset media trim');
            const nextAsset = buildMediaTrimAsset(node.asset, {
                trimStart: 0,
                trimEnd: duration,
                enabled: false,
                mergeExisting: false
            });
            Object.assign(node, buildMediaNodeStatePatch(node, { asset: nextAsset }));
            call(renderSource, 'mutate');
            call(mediaSource, 'hideVideoScrubPreview', undefined, node.id);
            call(mediaSource, 'seekNodeMediaPlayer', undefined, node.id, 0, { immediate: true });
        }

        function refreshMediaTrimUi(nodeId) {
            const node = getNode(nodeId);
            if (!node?.asset) return;
            const range = getMediaEditRange(node.asset);
            const startPct = range.duration > 0 ? `${clamp((range.start / range.duration) * 100, 0, 100)}%` : '0%';
            const endPct = range.duration > 0 ? `${clamp((range.end / range.duration) * 100, 0, 100)}%` : '100%';
            const doc = getDocument();
            const scopes = doc?.querySelectorAll
                ? Array.from(doc.querySelectorAll(`[data-node-id="${cssEscape(nodeId)}"]`))
                : [];
            const inspector = getInspector();
            if (getSelectedNodeId() === nodeId && inspector) scopes.push(inspector);
            scopes.forEach((scopeElement) => {
                scopeElement.querySelectorAll?.('.sai-media-storyboard,.sai-audio-waveform')?.forEach((track) => {
                    track.style.setProperty('--trim-start', startPct);
                    track.style.setProperty('--trim-end', endPct);
                });
                scopeElement.querySelectorAll?.('[data-media-trim-start]')?.forEach((field) => { field.value = String(range.start); });
                scopeElement.querySelectorAll?.('[data-media-trim-end]')?.forEach((field) => { field.value = String(range.end); });
                scopeElement.querySelectorAll?.('[data-media-seek]')?.forEach((field) => {
                    const value = Number(field.value || 0);
                    if (value < range.start || value > range.end) field.value = String(range.start);
                });
                scopeElement.querySelectorAll?.('.sai-media-trim-time')?.forEach((row) => {
                    const bits = row.querySelectorAll('span,b');
                    if (bits[0]) bits[0].textContent = formatDuration(range.start);
                    if (bits[1]) bits[1].textContent = formatDuration(Math.max(0, range.end - range.start));
                    if (bits[2]) bits[2].textContent = formatDuration(range.end || range.duration);
                });
                scopeElement.querySelectorAll?.('[data-media-derived-info]')?.forEach((box) => {
                    box.innerHTML = mediaDerivedInfoHtml(node.asset || {});
                });
            });
        }

        function mediaDerivedInfoHtml(asset) {
            const range = getMediaEditRange(asset || {});
            const fps = Number(asset?.fps || 0) || 0;
            const totalFrames = Number(asset?.frame_count || 0) || (fps && range.duration ? Math.round(fps * range.duration) : 0);
            const clipDuration = Math.max(0, range.end - range.start);
            const clipFrames = fps && clipDuration ? Math.max(1, Math.round(fps * clipDuration)) : 0;
            const bits = [];
            if (fps) bits.push(`<span>FPS</span><b>${escapeHtml(String(Math.round(fps * 1000) / 1000))}</b>`);
            if (totalFrames) bits.push(`<span>Total Frames</span><b>${escapeHtml(String(Math.round(totalFrames)))}</b>`);
            if (range.duration) bits.push(`<span>Clip Duration</span><b>${escapeHtml(formatDuration(clipDuration))}</b>`);
            if (clipFrames) bits.push(`<span>Clip Frames</span><b>${escapeHtml(String(clipFrames))}</b>`);
            return bits.length ? bits.join('') : '<span>Media</span><b>Metadata pending</b>';
        }

        async function reloadMediaNode(node) {
            if (!node || !['video', 'audio'].includes(node.type)) return;
            const type = node.type;
            const file = await call(
                mediaSource,
                type === 'video' ? 'pickLocalVideoFile' : 'pickLocalAudioFile',
                null
            );
            if (!file) return;
            await applyMediaFileToNode(node, file, {
                history: type === 'video' ? 'Re-upload video asset' : 'Re-upload audio asset',
                sourceKind: type === 'video' ? 'manual_video_reupload' : 'manual_audio_reupload'
            });
            if (type === 'video') call(mediaSource, 'hideVideoScrubPreview', undefined, node.id);
        }

        function playMediaSelection(node) {
            if (!node || !['video', 'audio'].includes(node.type)) return;
            const nodesLayer = getNodesLayer();
            const el = nodesLayer?.querySelector?.(`[data-node-id="${cssEscape(node.id)}"] [data-media-player]`);
            if (!el) {
                call(viewerSource, 'openMediaViewer', undefined, node);
                return;
            }
            const range = getMediaEditRange(node.asset || {});
            if (el.paused) {
                if (range.duration && ((el.currentTime || 0) < range.start || (el.currentTime || 0) >= range.end)) {
                    call(mediaSource, 'seekNodeMediaPlayer', undefined, node.id, range.start, { immediate: true });
                }
                el.play().catch(() => call(viewerSource, 'openMediaViewer', undefined, node));
            } else {
                el.pause();
            }
        }

        return {
            applyTransferItemToImageNode,
            applyImageFileToNode,
            applyMediaFileToNode,
            getMediaEditRange,
            formatDuration,
            roundMediaTime,
            updateMediaTrim,
            resetMediaTrim,
            refreshMediaTrimUi,
            mediaDerivedInfoHtml,
            reloadMediaNode,
            playMediaSelection
        };
    }

    window.SimpAICanvasWorkbenchMediaEdit = Object.assign(
        {},
        window.SimpAICanvasWorkbenchMediaEdit || {},
        { createCanvasMediaEditController }
    );
})();
