(function () {
    'use strict';

    const DEFAULT_UTILS = typeof window !== 'undefined' ? window.SimpAICanvasWorkbenchUtils || {} : {};
    const DEFAULT_ASSETS = typeof window !== 'undefined' ? window.SimpAICanvasWorkbenchAssetNodes || {} : {};
    const escapeHtmlFallback = (value) => String(value ?? '');
    const translateFallback = (en, cn) => cn || en;
    const formatDurationFallback = (seconds) => `${Math.round(Number(seconds || 0) * 10) / 10}s`;

    function call(context, name, fallback, ...args) {
        return typeof context?.[name] === 'function' ? context[name](...args) : fallback;
    }

    function delegate(source, name) {
        if (typeof source?.[name] !== 'function') return undefined;
        return (...args) => source[name](...args);
    }

    function createAudioNodeContext(source) {
        const scope = source || {};
        const utilitySource = scope.utilitySource || {};
        const assetSource = scope.assetSource || {};
        const renderSource = scope.renderSource || {};
        const pick = (group, name) => delegate(group, name) || delegate(scope, name);
        return {
            escapeHtml: pick(utilitySource, 'escapeHtml'),
            t: pick(utilitySource, 't'),
            formatDuration: pick(assetSource, 'formatDuration'),
            mediaEditRange: pick(assetSource, 'mediaEditRange'),
            assetDisplaySrc: pick(assetSource, 'assetDisplaySrc'),
            readAssetInfo: pick(assetSource, 'readAssetInfo'),
            readAssetSize: pick(assetSource, 'readAssetSize'),
            renderNodeStateBadges: pick(renderSource, 'renderNodeStateBadges')
        };
    }

    const DEFAULT_AUDIO_NODE_CONTEXT = createAudioNodeContext({
        utilitySource: {
            escapeHtml: DEFAULT_UTILS.escapeHtml || escapeHtmlFallback,
            t: DEFAULT_UTILS.t || translateFallback
        },
        assetSource: Object.assign({ formatDuration: formatDurationFallback }, DEFAULT_ASSETS)
    });

    function escapeHtmlValue(context, value) {
        return call(context, 'escapeHtml', escapeHtmlFallback(value), value);
    }

    function translateValue(context, en, cn) {
        return call(context, 't', translateFallback(en, cn), en, cn);
    }

    function formatDuration(context, seconds) {
        return call(context, 'formatDuration', formatDurationFallback(seconds), seconds);
    }

    function mediaRange(asset, context) {
        if (typeof context?.mediaEditRange === 'function') return context.mediaEditRange(asset);
        const duration = Math.max(0, Number(asset?.duration || 0) || 0);
        const edit = asset?.edit && typeof asset.edit === 'object' ? asset.edit : {};
        const start = Math.max(0, Number(edit.trim_start || 0) || 0);
        const end = Math.max(start, Number(edit.trim_end || duration || 0) || duration || start);
        return { start, end, duration, clipped: duration > 0 && (start > 0.01 || end < duration - 0.01) };
    }

    function renderWaveform(asset, range) {
        const values = Array.isArray(asset?.waveform) && asset.waveform.length ? asset.waveform : new Array(80).fill(0.08);
        const startPct = range.duration > 0 ? Math.max(0, Math.min(100, (range.start / range.duration) * 100)) : 0;
        const endPct = range.duration > 0 ? Math.max(startPct, Math.min(100, (range.end / range.duration) * 100)) : 100;
        const bars = values.slice(0, 160).map((value, index) => {
            const height = Math.max(8, Math.min(100, Number(value || 0) * 100));
            return `<i style="height:${height.toFixed(2)}%" data-wave-index="${index}"></i>`;
        }).join('');
        return `<div class="sai-audio-waveform" style="--trim-start:${startPct}%;--trim-end:${endPct}%">${bars}<b></b></div>`;
    }

    function renderTrimControls(node, range, disabled, context) {
        const duration = Math.max(0.1, Number(range.duration || 0) || 0.1);
        const step = duration > 60 ? 0.1 : 0.05;
        return `
<div class="sai-media-trim" data-media-trim-ui>
  <div class="sai-media-trim-time"><span>${escapeHtmlValue(context, formatDuration(context, range.start))}</span><b>${escapeHtmlValue(context, formatDuration(context, Math.max(0, range.end - range.start)))}</b><span>${escapeHtmlValue(context, formatDuration(context, range.end || range.duration))}</span></div>
  <input class="sai-media-scrub" type="range" data-media-seek value="${range.start}" min="0" max="${duration}" step="${step}" ${disabled ? 'disabled' : ''}>
  <div class="sai-media-range-pair">
    <input type="range" data-media-trim-start value="${range.start}" min="0" max="${duration}" step="${step}" ${disabled ? 'disabled' : ''}>
    <input type="range" data-media-trim-end value="${range.end || duration}" min="0" max="${duration}" step="${step}" ${disabled ? 'disabled' : ''}>
  </div>
</div>`;
    }

    function renderNodeHtml(node, context) {
        const ctx = context || DEFAULT_AUDIO_NODE_CONTEXT;
        const src = typeof ctx.assetDisplaySrc === 'function' ? ctx.assetDisplaySrc(node.asset || {}) : (node.asset?.data_url || node.asset?.preview_url || '');
        const info = typeof ctx.readAssetInfo === 'function' ? ctx.readAssetInfo(node.asset || {}, false) : [];
        const stateBadges = call(ctx, 'renderNodeStateBadges', '', node);
        const range = mediaRange(node.asset || {}, ctx);
        const disabled = !!node.locked || !src || !range.duration;
        const emptyUpload = `<button type="button" class="sai-node-empty sai-media-empty-upload" data-node-action="media-reload">${escapeHtmlValue(ctx, translateValue(ctx, 'No audio', '无音频'))}</button>`;
        const waveform = src
            ? renderWaveform(node.asset || {}, range)
            : `<button type="button" class="sai-audio-waveform sai-media-empty-upload sai-media-empty-upload-strip" data-node-action="media-reload"><i></i></button>`;
        return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtmlValue(ctx, translateValue(ctx, 'Audio', '音频'))}</span>
  <span class="sai-node-title">${escapeHtmlValue(ctx, node.title || translateValue(ctx, 'Audio', '音频'))}</span>
  ${stateBadges}
  <button type="button" data-node-action="media-reload" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Re-upload audio asset', '重新上传音频资产'))}"><i class="fa-solid fa-rotate"></i></button>
  <button type="button" data-node-action="view-media" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Open audio', '打开音频'))}"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
  <button type="button" data-node-action="media-play-toggle" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Play selection', '播放选区'))}"><i class="fa-solid fa-play"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-node-media sai-node-audio-media${src ? '' : ' is-empty-upload'}">${src ? `<audio src="${escapeHtmlValue(ctx, src)}" controls preload="metadata" data-media-player></audio>` : emptyUpload}</div>
${waveform}
${renderTrimControls(node, range, disabled, ctx)}
<div class="sai-node-info">${info.map(bit => `<span>${escapeHtmlValue(ctx, bit)}</span>`).join('') || `<span>${escapeHtmlValue(ctx, translateValue(ctx, 'No metadata', '无元数据'))}</span>`}</div>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="audio" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Output', '输出'))}"></button>`;
    }

    function renderInspector(node, context) {
        const ctx = context || DEFAULT_AUDIO_NODE_CONTEXT;
        const info = typeof ctx.readAssetInfo === 'function' ? ctx.readAssetInfo(node.asset || {}, false) : [];
        const size = typeof ctx.readAssetSize === 'function' ? ctx.readAssetSize(node.asset) : '';
        const range = mediaRange(node.asset || {}, ctx);
        return `
<div class="sai-inspector-section">
  <h3>${escapeHtmlValue(ctx, translateValue(ctx, 'Audio Node', '音频节点'))}</h3>
  <label>${escapeHtmlValue(ctx, translateValue(ctx, 'Title', '标题'))}<input data-inspector-node-field="title" value="${escapeHtmlValue(ctx, node.title || '')}"></label>
  <div class="sai-inspector-kv"><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Type', '类型'))}</span><b>${escapeHtmlValue(ctx, node.asset?.mime || 'audio')}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Size', '尺寸'))}</span><b>${escapeHtmlValue(ctx, size)}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Info', '信息'))}</span><b>${escapeHtmlValue(ctx, info.join(' / ') || translateValue(ctx, 'None', '无'))}</b></div>
  ${renderWaveform(node.asset || {}, range)}
  ${renderTrimControls(node, range, !!node.locked || !node.asset?.duration, ctx)}
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="media-reload"><i class="fa-solid fa-rotate"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Re-upload', '重新上传'))}</span></button>
  <button type="button" data-inspector-action="view-media"><i class="fa-solid fa-magnifying-glass-plus"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Open', '打开'))}</span></button>
  <button type="button" data-inspector-action="media-reset-trim"><i class="fa-solid fa-rotate-left"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Reset Trim', '重置裁剪'))}</span></button>
  <button type="button" data-inspector-action="duplicate"><i class="fa-solid fa-copy"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Duplicate', '复制'))}</span></button>
  <button type="button" data-inspector-action="delete" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Delete', '删除'))}</span></button>
</div>`;
    }

    window.SimpAICanvasWorkbenchAudioNode = {
        createAudioNodeContext,
        renderNodeHtml,
        renderInspector
    };
})();
