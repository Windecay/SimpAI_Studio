(function () {
    'use strict';

    function createCanvasAssetNodeRenderer(context) {
        const {
            t, clamp, escapeHtml,
            assetMediaKind: readAssetMediaKind,
            assetMediaIcon: readAssetMediaIcon,
            safeAssetDisplaySrc: resolveAssetDisplaySrc,
            safeAssetFullDisplaySrc: resolveAssetFullDisplaySrc,
            safeAssetFallbackSrc: resolveAssetFallbackSrc,
            readAssetInfo,
            mediaAspectStyle,
            renderNodeStateBadges,
            collapsedKeepClass,
            isCanvasRunActiveState,
            isResultStale,
            isResultRefreshing,
            resultMediaDisplayAsset,
            inferChatImageRelativePath,
            getResultMetadataRows,
            batchAnyMediaKindFromAsset,
            batchAnyMediaKind,
            batchAnyPortKind,
            batchAnyMediaLabel,
            batchAnyMediaIcon,
            batchAnyCurrentItem,
            batchAnySelectedItemIds,
            batchAnyTargets,
            batchAnyTargetLabel,
            batchAnyTextFromItem,
            mediaBrowserNodeState,
            mediaBrowserRuntimeFor,
            isGalleryFrostEnabled,
            syncGalleryFrostClass,
            localizedDefaultTitle,
            selectedMediaBrowserItemFrom,
            mediaBrowserItemMeta,
            danbooruPostMediaType
        } = context;

        const clampValue = typeof clamp === 'function'
            ? clamp
            : ((value, min, max) => Math.max(min, Math.min(max, value)));
        const translate = typeof t === 'function' ? t : ((en, cn) => cn || en);
        const escape = typeof escapeHtml === 'function' ? escapeHtml : ((value) => String(value ?? ''));
        const assetKind = typeof readAssetMediaKind === 'function'
            ? readAssetMediaKind
            : ((asset) => {
                const mime = String(asset?.mime || '').toLowerCase();
                if (mime.startsWith('video/')) return 'video';
                if (mime.startsWith('audio/')) return 'audio';
                return 'image';
            });
        const assetIcon = typeof readAssetMediaIcon === 'function'
            ? readAssetMediaIcon
            : ((asset) => {
                const kind = assetKind(asset);
                if (kind === 'video') return 'fa-film';
                if (kind === 'audio') return 'fa-wave-square';
                return 'fa-image';
            });
        const displaySrc = typeof resolveAssetDisplaySrc === 'function'
            ? resolveAssetDisplaySrc
            : ((asset, fallback) => asset?.displaySrc || asset?.data_url || asset?.preview_url || asset?.thumb || fallback || '');
        const fullDisplaySrc = typeof resolveAssetFullDisplaySrc === 'function'
            ? resolveAssetFullDisplaySrc
            : displaySrc;
        const fallbackSrc = typeof resolveAssetFallbackSrc === 'function'
            ? resolveAssetFallbackSrc
            : ((asset, fallback) => displaySrc(asset, fallback));
        const nodeBadges = typeof renderNodeStateBadges === 'function' ? renderNodeStateBadges : (() => '');
        const keepClass = typeof collapsedKeepClass === 'function' ? collapsedKeepClass : (() => '');
        const activeRunState = typeof isCanvasRunActiveState === 'function'
            ? isCanvasRunActiveState
            : (state => ['queued', 'running', 'waiting', 'task_ready', 'args_ready', 'dry_run_ready', 'cancelling', 'skipping'].includes(String(state || '').toLowerCase()));
        const resultStale = typeof isResultStale === 'function' ? isResultStale : (() => false);
        const resultRefreshing = typeof isResultRefreshing === 'function' ? isResultRefreshing : (() => false);
        const resultDisplayAsset = typeof resultMediaDisplayAsset === 'function'
            ? resultMediaDisplayAsset
            : ((node, selectedAsset) => selectedAsset || node?.asset || null);
        const infoForAsset = typeof readAssetInfo === 'function' ? readAssetInfo : (() => []);
        const aspectForAsset = typeof mediaAspectStyle === 'function' ? mediaAspectStyle : (() => '');
        const batchKindFromAsset = typeof batchAnyMediaKindFromAsset === 'function'
            ? batchAnyMediaKindFromAsset
            : (asset => assetKind(asset));
        const batchKind = typeof batchAnyMediaKind === 'function' ? batchAnyMediaKind : (node => node?.media_kind || '');
        const batchPortKind = typeof batchAnyPortKind === 'function' ? batchAnyPortKind : (node => batchKind(node) || 'any');
        const batchLabel = typeof batchAnyMediaLabel === 'function'
            ? batchAnyMediaLabel
            : (kind => kind === 'video' ? translate('Video', '视频') : (kind === 'audio' ? translate('Audio', '音频') : (kind === 'image' ? translate('Image', '图片') : translate('Any', '未定'))));
        const batchIcon = typeof batchAnyMediaIcon === 'function'
            ? batchAnyMediaIcon
            : (kind => kind === 'video' ? 'fa-film' : (kind === 'audio' ? 'fa-wave-square' : (kind === 'text' ? 'fa-align-left' : (kind === 'image' ? 'fa-image' : 'fa-layer-group'))));
        const batchCurrent = typeof batchAnyCurrentItem === 'function' ? batchAnyCurrentItem : (node => (Array.isArray(node?.items) ? node.items[0] : null));
        const batchSelectedIds = typeof batchAnySelectedItemIds === 'function' ? batchAnySelectedItemIds : (() => []);
        const batchTargets = typeof batchAnyTargets === 'function' ? batchAnyTargets : (() => []);
        const batchTargetLabel = typeof batchAnyTargetLabel === 'function' ? batchAnyTargetLabel : (() => translate('None', '无'));
        const batchText = typeof batchAnyTextFromItem === 'function'
            ? batchAnyTextFromItem
            : (item => typeof item?.text === 'string' ? item.text : String(item?.text?.value || ''));
        const browserNodeState = typeof mediaBrowserNodeState === 'function' ? mediaBrowserNodeState : (node => node?.media_browser || {});
        const browserRuntime = typeof mediaBrowserRuntimeFor === 'function' ? mediaBrowserRuntimeFor : (() => ({}));
        const galleryFrostEnabled = typeof isGalleryFrostEnabled === 'function' ? isGalleryFrostEnabled : (() => true);
        const browserItemMeta = typeof mediaBrowserItemMeta === 'function' ? mediaBrowserItemMeta : (() => '');
        const postMediaType = typeof danbooruPostMediaType === 'function' ? danbooruPostMediaType : (() => 'image');
        const selectedBrowserItem = typeof selectedMediaBrowserItemFrom === 'function'
            ? selectedMediaBrowserItemFrom
            : ((state, data) => (Array.isArray(data?.items) ? data.items.find(item => String(item?.id || '') === String(state?.selectedId || '')) : null));

        function renderAssetAudioWaveformHtml(asset) {
            const values = Array.isArray(asset?.waveform) ? asset.waveform.filter(value => Number.isFinite(Number(value))) : [];
            if (!values.length) {
                return '<i class="fa-solid fa-wave-square"></i>';
            }
            const bars = values.slice(0, 160).map((value, index) => {
                const height = Math.max(8, Math.min(100, Number(value || 0) * 100));
                return `<i style="height:${height.toFixed(2)}%" data-wave-index="${index}"></i>`;
            }).join('');
            return `<div class="sai-audio-waveform sai-result-waveform" style="--trim-start:0%;--trim-end:100%;--playhead:0%" aria-hidden="true">${bars}<b></b></div>`;
        }

        function renderAssetMediaHtml(asset, fallbackPreview, emptyText) {
            const src = fullDisplaySrc(asset, fallbackPreview) || '';
            if (!src) return `<div class="sai-node-empty">${escape(emptyText || translate('Waiting for output', '等待输出'))}</div>`;
            const kind = assetKind(asset);
            if (kind === 'video') return `<div class="sai-node-video-shell"><video src="${escape(src)}" controls controlsList="nofullscreen nodownload noremoteplayback" disablePictureInPicture muted preload="metadata"></video><button type="button" class="sai-node-media-fullscreen" data-media-fullscreen title="${escape(translate('View media', '查看媒体'))}"><i class="fa-solid fa-magnifying-glass-plus"></i></button></div>`;
            if (kind === 'audio') return `<div class="sai-result-audio-preview">${renderAssetAudioWaveformHtml(asset)}<audio src="${escape(src)}" controls preload="metadata" data-media-player></audio></div>`;
            return `<img src="${escape(src)}" alt="">`;
        }

        function renderBatchAnyItemThumbHtml(item, kind) {
            const asset = item?.asset || {};
            const mediaKind = item?.media_kind || kind || batchKindFromAsset(asset);
            if (mediaKind === 'text') {
                const text = batchText(item);
                return `<div class="sai-batch-any-thumb is-text"><i class="fa-solid fa-align-left"></i><p>${escape(text || item?.name || '')}</p></div>`;
            }
            if (mediaKind === 'audio') return `<div class="sai-batch-any-thumb is-audio">${renderAssetAudioWaveformHtml(asset)}</div>`;
            const src = displaySrc(asset, asset.thumb || asset.preview_url || asset.data_url || '');
            if (src) return `<div class="sai-batch-any-thumb"><img src="${escape(src)}" alt=""></div>`;
            return `<div class="sai-batch-any-thumb is-empty"><i class="fa-solid ${escape(batchIcon(mediaKind))}"></i></div>`;
        }

        function renderBatchAnyNodeHtml(node) {
            const items = Array.isArray(node.items) ? node.items : [];
            const current = batchCurrent(node);
            const kind = batchKind(node);
            const portKind = batchPortKind(node);
            const targets = batchTargets(node);
            const state = node.batch?.state || 'idle';
            const selectedIds = new Set(batchSelectedIds(node));
            const visibleItems = items.slice(0, 36);
            return `
<div class="sai-node-head">
  <span class="sai-node-kind"><i class="fa-solid ${escape(batchIcon(kind))}"></i>${escape(translate('Batch Any', '批量素材'))}</span>
  <span class="sai-node-title">${escape(node.title || translate('Batch Any', '批量素材'))}</span>
  ${nodeBadges(node)}
  <button type="button" data-node-action="batch-any-import" title="${escape(translate('Import files', '导入文件'))}"><i class="fa-solid fa-folder-open"></i></button>
  <button type="button" data-node-action="batch-any-run-all" title="${escape(translate('Run all items', '运行全部素材'))}" ${items.length && targets.length ? '' : 'disabled'}><i class="fa-solid fa-forward"></i></button>
  <button type="button" data-node-action="delete" title="${escape(translate('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-batch-any-meta">
  <span>${escape(batchLabel(kind))}</span>
  <span>${escape(translate('Items', '素材'))}<b>${items.length}</b></span>
  <span>${escape(translate('Target', '目标'))}<b>${targets.length ? escape(batchTargetLabel(targets[0])) : escape(translate('None', '无'))}</b></span>
  <span>${escape(translate('State', '状态'))}<b>${escape(state)}</b></span>
</div>
<div class="sai-batch-any-grid" data-batch-any-grid>
  ${visibleItems.length ? visibleItems.map((item, index) => {
      const active = index === Number(node.current_index || 0);
      const selected = selectedIds.has(item.id);
      return `<div class="sai-batch-any-item ${active ? 'is-active' : ''} ${selected ? 'is-selected' : ''}">
    <button type="button" class="sai-batch-any-item-main" data-node-action="batch-any-select:${index}" title="${escape(item.name || '')}">
      ${renderBatchAnyItemThumbHtml(item, kind)}
      <span>${escape(item.name || `${translate('Item', '素材')} ${index + 1}`)}</span>
    </button>
    <button type="button" class="sai-batch-any-item-remove" data-node-action="batch-any-remove:${index}" title="${escape(translate('Delete item', '删除素材'))}"><i class="fa-solid fa-xmark"></i></button>
  </div>`;
  }).join('') : `<div class="sai-batch-any-empty">${escape(translate('Import files or connect canvas outputs.', '导入文件，或从画布节点拉线加入。'))}</div>`}
  ${items.length > visibleItems.length ? `<div class="sai-batch-any-more">${escape(translate('{count} more', '还有 {count} 项').replace('{count}', items.length - visibleItems.length))}</div>` : ''}
</div>
<div class="sai-batch-any-actions">
  <button type="button" class="sai-node-secondary" data-node-action="batch-any-import"><i class="fa-solid fa-folder-open"></i><span>${escape(translate('Import', '导入'))}</span></button>
  <button type="button" class="sai-node-secondary" data-node-action="batch-any-delete-selected" ${selectedIds.size ? '' : 'disabled'}><i class="fa-solid fa-trash"></i><span>${escape(translate('Delete selected', '删除选中'))}</span></button>
  <button type="button" class="sai-node-secondary" data-node-action="batch-any-run-current" ${current && targets.length ? '' : 'disabled'}><i class="fa-solid fa-play"></i><span>${escape(translate('Run current', '运行当前'))}</span></button>
  <button type="button" class="sai-node-primary" data-node-action="batch-any-run-all" ${items.length && targets.length ? '' : 'disabled'}><i class="fa-solid fa-forward"></i><span>${escape(translate('Run all', '运行全部'))}</span></button>
</div>
<button type="button" class="sai-node-handle sai-node-handle-in sai-batch-any-input-port" data-batch-any-in="${escape(portKind)}" title="${escape(translate('Collect text, image, video, audio, or result outputs as batch items', '把文本、图片、视频、音频或 Result 输出加入批量素材'))}"></button>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="${escape(portKind)}" title="${escape(translate('Batch output', '批量输出'))}"></button>`;
        }

        function resultPreviewFrameSrc(frame, fallback) {
            const raw = frame?.data_url || frame?.thumb || fallback || '';
            return raw ? displaySrc(frame, raw) : '';
        }

        function resultPreviewFrameAspect(frame) {
            if (!frame || typeof frame !== 'object') return 0;
            const width = Number(frame.width || frame.preview_width || frame.display_width || frame.source_width || 0);
            const height = Number(frame.height || frame.preview_height || frame.display_height || frame.source_height || 0);
            if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 0;
            return clampValue(width / Math.max(1, height), 0.25, 4);
        }

        function latestResultPreviewFrame(node) {
            const frames = Array.isArray(node?.preview_frames) ? node.preview_frames : [];
            for (let index = frames.length - 1; index >= 0; index -= 1) {
                const frame = frames[index];
                if (frame && (frame.data_url || frame.thumb || (typeof inferChatImageRelativePath === 'function' && inferChatImageRelativePath(frame)))) return frame;
            }
            return null;
        }

        function resultPreviewAspectSource(node) {
            const latest = latestResultPreviewFrame(node);
            if (resultPreviewFrameAspect(latest)) return latest;
            if (resultPreviewFrameAspect(node?.preview)) return node.preview;
            return latest || node?.preview || null;
        }

        function renderResultPreviewStripHtml(frames, currentSerial) {
            const recent = (Array.isArray(frames) ? frames : []).slice(-6);
            return recent.map((frame) => {
                const frameSrc = resultPreviewFrameSrc(frame);
                if (!frameSrc) return '';
                const active = Number(frame?.serial || 0) === Number(currentSerial || 0);
                return `<img src="${escape(frameSrc)}" alt="" class="${active ? 'is-latest' : ''}">`;
            }).join('');
        }

        function renderResultMetadataPopover(node, asset) {
            const rows = typeof getResultMetadataRows === 'function' ? getResultMetadataRows(node, asset) : [];
            if (!rows.length) return '';
            const text = rows.map(row => `${row.label}:\n${row.value}`).join('\n\n');
            return `<span class="sai-result-metadata" data-result-metadata>
    <button type="button" class="sai-result-metadata-btn" data-result-metadata-toggle title="${escape(translate('Result metadata', '结果元数据'))}" aria-label="${escape(translate('Result metadata', '结果元数据'))}"><i class="fa-solid fa-circle-info"></i></button>
    <span class="sai-result-metadata-popover">
      <span class="sai-result-metadata-head"><b>${escape(translate('Result Metadata', '结果元数据'))}</b><small>${escape(translate('Click icon to pin. Text can be selected and copied.', '点击图标固定。文本可直接选中复制。'))}</small></span>
      <textarea readonly spellcheck="false">${escape(text)}</textarea>
    </span>
  </span>`;
        }

        function renderResultMediaHtml(node, selectedAsset, preview) {
            const displayAssetValue = resultDisplayAsset(node, selectedAsset);
            if (displayAssetValue) return renderAssetMediaHtml(displayAssetValue, preview, 'Waiting for output');
            const frames = Array.isArray(node.preview_frames)
                ? node.preview_frames.filter(item => item && (item.thumb || item.data_url || (typeof inferChatImageRelativePath === 'function' && inferChatImageRelativePath(item))))
                : [];
            if (frames.length) {
                const recent = frames.slice(-6);
                const latest = recent[recent.length - 1];
                const src = displaySrc(latest, latest.data_url || latest.thumb || preview || '');
                return `<div class="sai-result-preview-stream" data-result-preview-stream="${escape(node.id)}">
  <img src="${escape(src)}" alt="" data-result-preview-player="${escape(node.id)}">
  <div class="sai-result-preview-strip" data-result-preview-strip>${recent.map((frame, index) => {
      const frameSrc = displaySrc(frame, frame.data_url || frame.thumb || '');
      return frameSrc ? `<img src="${escape(frameSrc)}" alt="" class="${index === recent.length - 1 ? 'is-latest' : ''}">` : '';
  }).join('')}</div>
</div>`;
            }
            return renderAssetMediaHtml(null, preview, node.source?.kind === 'manual_output' ? 'Replaceable media' : 'Waiting for output');
        }

        function renderResultNodeHtml(node) {
            const status = node.status || {};
            const state = String(status.state || 'queued').toLowerCase();
            const percent = clampValue(Number(status.percent || 0), 0, 1);
            const assets = Array.isArray(node.assets) ? node.assets : [];
            const selectedIndex = clampValue(Number(node.selected_asset_index || 0), 0, Math.max(assets.length - 1, 0));
            const selectedAsset = assets[selectedIndex] || node.asset;
            const mediaAsset = resultDisplayAsset(node, selectedAsset);
            const preview = node.preview && fallbackSrc(node.preview, node.preview.data_url || node.preview.thumb);
            const mediaSource = mediaAsset || resultPreviewAspectSource(node) || selectedAsset || null;
            const info = infoForAsset(selectedAsset || {});
            const selectedKind = assetKind(selectedAsset || {});
            const convertLabel = selectedKind === 'video' ? translate('Video', '视频') : (selectedKind === 'audio' ? translate('Audio', '音频') : translate('Image', '图片'));
            const convertIcon = assetIcon(selectedAsset || {});
            const canLayerForge = !!selectedAsset && selectedKind === 'image';
            const stack = assets.length > 1 ? `<div class="sai-result-stack">${assets.map((asset, index) => {
                const thumb = displaySrc(asset, asset.thumb || asset.preview_url || asset.data_url || '');
                const kind = assetKind(asset);
                const icon = assetIcon(asset);
                const mediaThumb = kind === 'image' && thumb ? `<img src="${escape(thumb)}" alt="">` : `<i class="fa-solid ${icon}"></i><small>${index + 1}</small>`;
                return `<button type="button" class="${index === selectedIndex ? 'is-active' : ''}" data-result-asset-index="${index}" title="${escape(asset.name || `Result ${index + 1}`)}">${mediaThumb}</button>`;
            }).join('')}</div>` : '';
            const isQwenResult = !!node.producer?.qwen_tts_node_id;
            const canControl = node.producer?.run_id && activeRunState(state);
            const canSkip = canControl && !isQwenResult;
            const canRetry = !!(node.producer?.preset_node_id || node.producer?.qwen_tts_node_id);
            const canTimelineRender = !!node.producer?.timeline_node_id;
            const canAsset = !!selectedAsset;
            const stale = resultStale(node);
            const refreshing = resultRefreshing(node);
            const metadataHtml = renderResultMetadataPopover(node, selectedAsset);
            const actions = `
<div class="sai-result-actions">
  ${canControl ? `<button type="button" data-node-action="stop-run" title="${escape(translate('Stop', '停止'))}"><i class="fa-solid fa-stop"></i><span>${escape(translate('Stop', '停止'))}</span></button>${canSkip ? `<button type="button" data-node-action="skip-run" title="${escape(translate('Skip', '跳过'))}"><i class="fa-solid fa-forward-step"></i><span>${escape(translate('Skip', '跳过'))}</span></button>` : ''}` : ''}
  ${canRetry ? `<button type="button" data-node-action="retry-run" title="${escape(translate('Retry', '重试'))}"><i class="fa-solid fa-rotate-right"></i><span>${escape(translate('Retry', '重试'))}</span></button>` : ''}
  ${canTimelineRender ? `<button type="button" data-node-action="timeline-render-source" title="${escape(translate('Render linked Timeline', '渲染连接的 Timeline'))}"><i class="fa-solid fa-clapperboard"></i><span>${escape(translate('Render', '渲染'))}</span></button>` : ''}
  ${canAsset ? `<button type="button" data-node-action="result-to-media" title="${escape(translate('Create {kind} node from current stored asset', '从当前已保存资产创建 {kind} 节点').replace('{kind}', convertLabel.toLowerCase()))}"><i class="fa-solid ${convertIcon}"></i><span>${escape(convertLabel)}</span></button>` : ''}
  ${canLayerForge ? `<button type="button" data-node-action="layerforge-edit" title="${escape(translate('Edit in LayerForge', '在 LayerForge 中编辑'))}"><i class="fa-solid fa-layer-group"></i><span>${escape(translate('Edit', '编辑'))}</span></button>` : ''}
  ${assets.length > 1 ? `<button type="button" data-node-action="expand-results" title="${escape(translate('Expand all outputs', '展开全部输出'))}"><i class="fa-solid fa-table-cells-large"></i><span>${escape(translate('Expand', '展开'))}</span></button>` : ''}
</div>`;
            return `
<div class="sai-node-head">
  <span class="sai-node-kind">Result</span>
  <span class="sai-node-title">${escape(node.title || 'Result')}</span>
  ${nodeBadges(node)}
  <button type="button" data-node-action="delete" title="${escape(translate('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-result-status" data-state="${escape(status.state || 'queued')}">
  <span>${escape(status.state || 'queued')}</span>
  <b>${Math.round(percent * 100)}%</b>
  ${metadataHtml}
</div>
${stale ? `<div class="sai-result-stale-note"><i class="fa-solid fa-triangle-exclamation"></i><span>${escape(translate('Upstream changed; rerun producer before using this result.', '上游已变化；使用该结果前请重新运行生产节点。'))}</span></div>` : ''}
${refreshing ? `<div class="sai-result-stale-note"><i class="fa-solid fa-hourglass-half"></i><span>${escape(translate('Refreshing result; downstream will wait for the new output.', '结果正在刷新；下游会等待新输出。'))}</span></div>` : ''}
<div class="sai-result-progress"><i style="width:${Math.round(percent * 100)}%"></i></div>
${stack}
<div class="sai-node-media sai-result-media"${aspectForAsset(mediaSource)}>${renderResultMediaHtml(node, mediaAsset, preview)}</div>
${info.length ? `<div class="sai-node-info">${info.map(bit => `<span>${escape(bit)}</span>`).join('')}</div>` : ''}
<div class="sai-node-foot">${escape(status.message || translate('Placeholder node created; waiting for backend runner.', '已创建占位节点，等待后端 runner 接入'))}</div>
${actions}
<button type="button" class="sai-node-handle sai-node-handle-in sai-result-input${keepClass(node, 'generate', 'generate')}" data-handle-in-result="generate" title="${escape(translate('Accept generation output', '承接生成输出'))}"></button>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="result" title="${escape(translate('Output', '输出'))}"></button>`;
        }

        function mediaBrowserCompactStatus(value) {
            return String(value || '').replace(/\s+/g, ' ').trim();
        }

        function mediaBrowserItemMetadata(item) {
            const meta = item?.generation_metadata || item?.metadata || null;
            return meta && typeof meta === 'object' ? meta : {};
        }

        function mediaBrowserItemPrompt(item) {
            const metadata = mediaBrowserItemMetadata(item);
            return String(item?.prompt || metadata.prompt || '').trim();
        }

        function mediaBrowserItemNegativePrompt(item) {
            const metadata = mediaBrowserItemMetadata(item);
            return String(metadata.negative_prompt || metadata.negative || '').trim();
        }

        function renderMediaBrowserLoadingCards() {
            return Array.from({ length: 12 }).map(() => '<div class="sai-media-browser-card is-loading"></div>').join('');
        }

        function renderOutputBrowserControls(state, data) {
            const folders = Array.isArray(data?.folders) ? data.folders : [];
            const options = [`<option value="">${escape(translate('Recent folders', '最近目录'))}</option>`]
                .concat(folders.map(folder => `<option value="${escape(folder)}" ${folder === state.folder ? 'selected' : ''}>${escape(folder)}</option>`))
                .join('');
            return `
<div class="sai-media-browser-controls sai-media-browser-output-controls">
  <div class="sai-media-browser-segment">
    <button type="button" data-media-browser-type="image" class="${state.mediaType === 'image' ? 'is-active' : ''}"><i class="fa-solid fa-image"></i><span>${escape(translate('Images', '图片'))}</span></button>
    <button type="button" data-media-browser-type="video" class="${state.mediaType === 'video' ? 'is-active' : ''}"><i class="fa-solid fa-film"></i><span>${escape(translate('Videos', '视频'))}</span></button>
  </div>
  <select data-media-browser-field="folder">${options}</select>
  <input type="search" data-media-browser-search="outputs" value="${escape(state.query || '')}" placeholder="${escape(translate('Search filename', '搜索文件名'))}">
  <button type="button" data-media-browser-action="search" title="${escape(translate('Search', '搜索'))}"><i class="fa-solid fa-magnifying-glass"></i></button>
</div>`;
        }

        function renderDanbooruBrowserControls(state) {
            const ratings = [
                ['all', translate('All ratings', '全部分级')],
                ['general', 'General'],
                ['sensitive', 'Sensitive'],
                ['questionable', 'Questionable'],
                ['explicit', 'Explicit']
            ];
            return `
<div class="sai-media-browser-controls">
  <input type="search" data-media-browser-search="danbooru" value="${escape(state.danbooruQuery || '')}" placeholder="${escape(translate('Danbooru tags, e.g. raiden_shogun', 'Danbooru 标签，例如 raiden_shogun'))}">
  <select data-media-browser-field="rating">${ratings.map(([value, label]) => `<option value="${escape(value)}" ${state.rating === value ? 'selected' : ''}>${escape(label)}</option>`).join('')}</select>
  <button type="button" data-media-browser-action="search" title="${escape(translate('Search', '搜索'))}"><i class="fa-solid fa-magnifying-glass"></i></button>
  <button type="button" data-media-browser-action="reconnect" title="${escape(translate('Reconnect / refresh Danbooru', '重连 / 刷新 Danbooru'))}"><i class="fa-solid fa-rotate"></i></button>
  <button type="button" data-media-browser-action="page-prev" ${Number(state.page || 1) <= 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>
  <span class="sai-media-browser-page">${escape(translate('Page', '页'))} ${Number(state.page || 1)}</span>
  <button type="button" data-media-browser-action="page-next"><i class="fa-solid fa-chevron-right"></i></button>
</div>`;
        }

        function renderMediaBrowserItems(items, selectedId, isDanbooru, data) {
            if (data?.ok === false) {
                const message = data.load_more_error || data.error || translate('Load failed.', '加载失败。');
                return `<div class="sai-media-browser-empty sai-media-browser-error">
  <b>${escape(isDanbooru ? translate('Danbooru connection failed.', 'Danbooru 连接失败。') : translate('Media load failed.', '媒体加载失败。'))}</b>
  <small>${escape(message)}</small>
  <button type="button" data-media-browser-action="${isDanbooru ? 'reconnect' : 'refresh'}"><i class="fa-solid fa-rotate"></i><span>${escape(isDanbooru ? translate('Reconnect', '重连') : translate('Refresh', '刷新'))}</span></button>
</div>`;
            }
            if (!items.length) {
                return `<div class="sai-media-browser-empty">${escape(translate('No media found.', '没有找到媒体。'))}</div>`;
            }
            return items.map((item, index) => {
                const id = String(item.id || '');
                const selected = id === String(selectedId || '');
                const mediaType = item.media_type || (isDanbooru ? postMediaType(item.raw || item) : 'image');
                const preview = item.preview_url || item.thumb || '';
                const title = item.name || item.title || id;
                const meta = browserItemMeta(item);
                const imageLoading = index < 36 ? 'eager' : 'lazy';
                const imagePriority = index < 12 ? 'high' : 'auto';
                const body = mediaType === 'video'
                    ? (preview ? `<video src="${escape(preview)}" muted preload="metadata"></video>` : '<i class="fa-solid fa-film"></i>')
                    : (preview ? `<img src="${escape(preview)}" alt="" loading="${imageLoading}" decoding="async" fetchpriority="${imagePriority}" draggable="false">` : '<i class="fa-solid fa-image"></i>');
                return `<button type="button" class="sai-media-browser-card ${selected ? 'is-selected' : ''}" data-media-browser-item="${escape(id)}" draggable="true" title="${escape(translate('Drag to canvas', '拖拽到画布'))}">
  <span class="sai-media-browser-thumb">${body}</span>
  <b title="${escape(title)}">${escape(title)}</b>
  <small>${escape(meta)}</small>
</button>`;
            }).join('');
        }

        function renderMediaBrowserDetail(item, isDanbooru) {
            if (!item) {
                return `<div class="sai-media-browser-detail-empty">${escape(translate('Select an item to preview details.', '选择一项查看详情。'))}</div>`;
            }
            const preview = item.preview_url || item.thumb || '';
            const mediaType = item.media_type || (isDanbooru ? postMediaType(item.raw || item) : 'image');
            const title = item.name || item.title || item.id || '';
            const metadata = mediaBrowserItemMetadata(item);
            const prompt = mediaBrowserItemPrompt(item);
            const negativePrompt = mediaBrowserItemNegativePrompt(item);
            const source = isDanbooru ? (item.post_url || '') : (item.relative_path || item.path || '');
            const metadataSource = metadata.source || metadata.scheme || '';
            const metadataParams = metadata.parameters && typeof metadata.parameters === 'object'
                ? Object.entries(metadata.parameters).slice(0, 8).map(([key, value]) => {
                    const text = value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
                    return `${key}: ${text}`;
                }).join('\n')
                : '';
            const width = Math.max(1, Number(item.width || item.image_width || 0) || 0);
            const height = Math.max(1, Number(item.height || item.image_height || 0) || 0);
            const aspectStyle = width && height ? ` style="--sai-media-aspect: ${width} / ${height};"` : '';
            return `
<div class="sai-media-browser-detail-preview"${aspectStyle}>
  ${mediaType === 'video'
            ? (preview ? `<video src="${escape(preview)}" controls muted preload="metadata"></video>` : '<i class="fa-solid fa-film"></i>')
            : (preview ? `<img src="${escape(preview)}" alt="">` : '<i class="fa-solid fa-image"></i>')}
</div>
<h4>${escape(title)}</h4>
<p>${escape(browserItemMeta(item))}</p>
${source ? `<code>${escape(source)}</code>` : ''}
${metadataSource ? `<p>${escape(metadataSource)}</p>` : ''}
${prompt ? `<textarea readonly>${escape(prompt)}</textarea>` : ''}
${negativePrompt ? `<textarea readonly>${escape(negativePrompt)}</textarea>` : ''}
${metadataParams ? `<code>${escape(metadataParams)}</code>` : ''}`;
        }

        function renderMediaBrowserPanelHtml(state, data, loading, options) {
            const currentState = state || {};
            const currentData = data || { ok: true, items: [], folders: [] };
            const items = Array.isArray(currentData.items) ? currentData.items : [];
            const selected = options && Object.prototype.hasOwnProperty.call(options, 'selectedItem')
                ? options.selectedItem
                : selectedBrowserItem(currentState, currentData);
            const isDanbooru = currentState.tab === 'danbooru';
            const loadingMore = !!options?.loadingMore;
            const frostEnabled = options?.frostEnabled === undefined ? galleryFrostEnabled() : !!options.frostEnabled;
            let status = loading
                ? translate('Loading...', '加载中...')
                : (currentData.ok ? `${items.length} ${translate('items', '项')}${currentData.truncated ? ` · ${translate('truncated', '已截断')}` : ''}` : (currentData.error || translate('Load failed', '加载失败')));
            if (!loading) {
                status = currentData.ok !== false
                    ? `${items.length} ${translate('items', '项')}${currentData.has_more ? ` / ${translate('more available', '还有更多')}` : ''}${loadingMore ? ` / ${translate('loading more...', '正在加载更多...')}` : ''}`
                    : (currentData.load_more_error || currentData.error || translate('Load failed', '加载失败'));
            }
            const statusText = mediaBrowserCompactStatus(status);
            return `
<div class="sai-canvas-modal-panel sai-media-browser-panel">
  <div class="sai-canvas-modal-head">
    <h3>${escape(translate('Media Browser', '媒体浏览器'))}</h3>
    <button type="button" data-modal-close title="${escape(translate('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="sai-media-browser-tabs">
    <button type="button" data-media-browser-tab="outputs" class="${currentState.tab === 'outputs' ? 'is-active' : ''}"><i class="fa-solid fa-photo-film"></i><span>${escape(translate('Outputs', '输出'))}</span></button>
    <button type="button" data-media-browser-tab="danbooru" class="${isDanbooru ? 'is-active' : ''}"><i class="fa-solid fa-globe"></i><span>Danbooru</span></button>
    <label class="sai-media-browser-frost" title="${escape(translate('Blur media previews by default', '默认模糊媒体预览'))}"><input type="checkbox" data-media-browser-frost ${frostEnabled ? 'checked' : ''}><span>${escape(translate('Blur', '模糊'))}</span></label>
  </div>
  ${isDanbooru ? renderDanbooruBrowserControls(currentState) : renderOutputBrowserControls(currentState, currentData)}
  <div class="sai-media-browser-main">
    <div class="sai-media-browser-grid">${loading ? renderMediaBrowserLoadingCards() : renderMediaBrowserItems(items, currentState.selectedId, isDanbooru, currentData)}</div>
    <aside class="sai-media-browser-detail">${renderMediaBrowserDetail(selected, isDanbooru)}</aside>
  </div>
  <div class="sai-canvas-modal-foot sai-media-browser-foot">
    <span title="${escape(statusText)}">${escape(statusText)}</span>
    <div>
      ${currentData.has_more ? `<button type="button" data-media-browser-action="load-more" ${loadingMore ? 'disabled' : ''}><i class="fa-solid ${loadingMore ? 'fa-spinner fa-spin' : 'fa-angles-down'}"></i><span>${escape(loadingMore ? translate('Loading...', '正在加载...') : translate('Load more', '加载更多'))}</span></button>` : ''}
      ${selected && !isDanbooru ? `<button type="button" class="is-danger" data-media-browser-action="delete-local"><i class="fa-solid fa-trash"></i><span>${escape(translate('Delete file', '删除文件'))}</span></button>` : ''}
      ${mediaBrowserItemPrompt(selected) ? `<button type="button" data-media-browser-action="copy-prompt"><i class="fa-solid fa-copy"></i><span>${escape(translate('Copy prompt', '复制提示词'))}</span></button>` : ''}
      ${mediaBrowserItemPrompt(selected) ? `<button type="button" data-media-browser-action="apply-prompt"><i class="fa-solid fa-pen-to-square"></i><span>${escape(translate('Fill generator', '填入生成节点'))}</span></button>` : ''}
      <button type="button" data-media-browser-action="${isDanbooru ? 'reconnect' : 'refresh'}"><i class="fa-solid fa-rotate"></i><span>${escape(isDanbooru ? translate('Reconnect', '重连') : translate('Refresh', '刷新'))}</span></button>
      <button type="button" data-media-browser-action="import" ${selected ? '' : 'disabled'}><i class="fa-solid fa-plus"></i><span>${escape(translate('Add to canvas', '加入画布'))}</span></button>
    </div>
  </div>
</div>`;
        }

        function renderMediaBrowserNodeHtml(node) {
            if (typeof syncGalleryFrostClass === 'function') syncGalleryFrostClass();
            const state = browserNodeState(node);
            const runtime = browserRuntime(node.id) || {};
            const data = runtime.data || { ok: true, items: [], folders: [] };
            const items = Array.isArray(data.items) ? data.items : [];
            const selected = selectedBrowserItem(state, data);
            const isDanbooru = state.tab === 'danbooru';
            const loading = !!runtime.loading;
            const loadingMore = !!runtime.loadingMore;
            const status = loading
                ? translate('Loading...', '加载中...')
                : (data.ok !== false ? `${items.length} ${translate('items', '项')}${data.has_more ? ` / ${translate('more available', '还有更多')}` : ''}${loadingMore ? ` / ${translate('loading more...', '正在加载更多...')}` : ''}` : (runtime.error || data.error || translate('Load failed', '加载失败')));
            const statusText = mediaBrowserCompactStatus(status);
            const mainFrostAttr = runtime.frostRevealed ? ' data-sai-frost-revealed="1"' : '';
            return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escape(translate('Browser', '浏览器'))}</span>
  <span class="sai-node-title">${escape(typeof localizedDefaultTitle === 'function' ? localizedDefaultTitle(node.title, 'Media Browser', '媒体浏览器') : (node.title || translate('Media Browser', '媒体浏览器')))}</span>
  ${nodeBadges(node)}
  <button type="button" data-media-browser-action="refresh" title="${escape(translate('Refresh', '刷新'))}"><i class="fa-solid fa-rotate"></i></button>
  <button type="button" data-media-browser-action="open-modal" title="${escape(translate('Open floating browser', '打开浮动浏览器'))}"><i class="fa-solid fa-up-right-from-square"></i></button>
  <button type="button" data-node-action="delete" title="${escape(translate('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-media-browser-node">
  <div class="sai-media-browser-tabs">
    <button type="button" data-media-browser-tab="outputs" class="${state.tab === 'outputs' ? 'is-active' : ''}"><i class="fa-solid fa-photo-film"></i><span>${escape(translate('Outputs', '输出'))}</span></button>
    <button type="button" data-media-browser-tab="danbooru" class="${isDanbooru ? 'is-active' : ''}"><i class="fa-solid fa-globe"></i><span>Danbooru</span></button>
    <label class="sai-media-browser-frost" title="${escape(translate('Blur media previews by default', '默认模糊媒体预览'))}"><input type="checkbox" data-media-browser-frost ${galleryFrostEnabled() ? 'checked' : ''}><span>${escape(translate('Blur', '模糊'))}</span></label>
  </div>
  ${isDanbooru ? renderDanbooruBrowserControls(state) : renderOutputBrowserControls(state, data)}
  <div class="sai-media-browser-main"${mainFrostAttr}>
    <div class="sai-media-browser-grid">${loading ? renderMediaBrowserLoadingCards() : renderMediaBrowserItems(items, state.selectedId, isDanbooru, data)}</div>
    <aside class="sai-media-browser-detail">${renderMediaBrowserDetail(selected, isDanbooru)}</aside>
  </div>
  <div class="sai-media-browser-foot">
    <span title="${escape(statusText)}">${escape(statusText)}</span>
    <div>
      ${mediaBrowserItemPrompt(selected) ? `<button type="button" data-media-browser-action="copy-prompt"><i class="fa-solid fa-copy"></i><span>${escape(translate('Prompt', '提示词'))}</span></button>` : ''}
      ${mediaBrowserItemPrompt(selected) ? `<button type="button" data-media-browser-action="apply-prompt"><i class="fa-solid fa-pen-to-square"></i><span>${escape(translate('Fill', '填入'))}</span></button>` : ''}
      ${selected && !isDanbooru ? `<button type="button" class="is-danger" data-media-browser-action="delete-local"><i class="fa-solid fa-trash"></i><span>${escape(translate('Delete file', '删除文件'))}</span></button>` : ''}
      ${data.has_more ? `<button type="button" data-media-browser-action="load-more" ${loadingMore ? 'disabled' : ''}><i class="fa-solid ${loadingMore ? 'fa-spinner fa-spin' : 'fa-angles-down'}"></i><span>${escape(loadingMore ? translate('Loading...', '正在加载...') : translate('Load more', '加载更多'))}</span></button>` : ''}
      <button type="button" data-media-browser-action="${isDanbooru ? 'reconnect' : 'refresh'}"><i class="fa-solid fa-rotate"></i><span>${escape(isDanbooru ? translate('Retry', '重试') : translate('Refresh', '刷新'))}</span></button>
      <button type="button" data-media-browser-action="import" ${selected ? '' : 'disabled'}><i class="fa-solid fa-plus"></i><span>${escape(translate('Add', '添加'))}</span></button>
    </div>
  </div>
</div>`;
        }

        return {
            renderAssetAudioWaveformHtml,
            renderAssetMediaHtml,
            renderBatchAnyItemThumbHtml,
            renderBatchAnyNodeHtml,
            resultPreviewFrameSrc,
            resultPreviewFrameAspect,
            latestResultPreviewFrame,
            resultPreviewAspectSource,
            renderResultPreviewStripHtml,
            renderResultMetadataPopover,
            renderResultMediaHtml,
            renderResultNodeHtml,
            mediaBrowserItemMetadata,
            mediaBrowserItemPrompt,
            mediaBrowserItemNegativePrompt,
            renderMediaBrowserPanelHtml,
            renderMediaBrowserNodeHtml,
            renderMediaBrowserLoadingCards,
            renderMediaBrowserItems,
            renderMediaBrowserDetail,
            renderOutputBrowserControls,
            renderDanbooruBrowserControls
        };
    }

    window.SimpAICanvasWorkbenchAssetNodeRenderer = Object.assign({}, window.SimpAICanvasWorkbenchAssetNodeRenderer || {}, {
        createCanvasAssetNodeRenderer
    });
})();
