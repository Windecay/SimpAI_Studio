(function () {
    'use strict';

    const UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const ASSETS = window.SimpAICanvasWorkbenchAssetNodes || {};
    const escapeHtml = UTILS.escapeHtml || ((value) => String(value ?? ''));
    const clamp = UTILS.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));
    const t = UTILS.t || ((en, cn) => cn || en);

    function call(ctx, name, fallback, ...args) {
        return typeof ctx?.[name] === 'function' ? ctx[name](...args) : fallback;
    }

    function delegate(context, name) {
        if (typeof context?.[name] !== 'function') return undefined;
        return (...args) => context[name](...args);
    }

    function createCompareNodeContext(source) {
        const context = source || {};
        return {
            assetDisplaySrc: delegate(context, 'assetDisplaySrc'),
            defaultNodeSize: delegate(context, 'defaultNodeSize'),
            escapeHtml: delegate(context, 'escapeHtml'),
            getCompareSourceAsset: delegate(context, 'getCompareSourceAsset'),
        getCompareSourceNode: delegate(context, 'getCompareSourceNode'),
        readAssetSize: delegate(context, 'readAssetSize'),
        renderIconHtml: delegate(context, 'renderIconHtml'),
        renderNodeStateBadges: delegate(context, 'renderNodeStateBadges'),
        uid: delegate(context, 'uid')
    };
}

    function createNode(world, options, context) {
        const opts = options || {};
        const position = world || { x: 0, y: 0 };
        const size = defaultNodeSize('compare', context) || { w: 560, h: 520 };
        return {
            id: call(context, 'uid', 'compare-node', 'compare'),
            type: 'compare',
            x: position.x,
            y: position.y,
            w: size.w,
            h: size.h,
            title: opts.title || 'Image Compare',
            inputs: { a: null, b: null },
            params: { position: 50, mode: 'fit' },
            source: { kind: 'manual_compare' }
        };
    }

    function getSourceNode(node, slot, context) {
        return call(context, 'getCompareSourceNode', null, node, slot);
    }

    function getSourceAsset(source, context) {
        return call(context, 'getCompareSourceAsset', null, source);
    }

    function assetSrc(asset, context) {
        if (typeof context?.assetDisplaySrc === 'function') return context.assetDisplaySrc(asset || {});
        if (typeof ASSETS.assetDisplaySrc === 'function') return ASSETS.assetDisplaySrc(asset || {});
        return asset?.data_url || asset?.preview_url || asset?.thumb || '';
    }

    function readAssetSize(asset, context) {
        if (typeof context?.readAssetSize === 'function') return context.readAssetSize(asset || {});
        if (typeof ASSETS.readAssetSize === 'function') return ASSETS.readAssetSize(asset || {});
        return asset?.width && asset?.height ? `${asset.width} x ${asset.height}` : '';
    }

    function defaultNodeSize(type, context) {
        if (typeof context?.defaultNodeSize === 'function') return context.defaultNodeSize(type);
        return type === 'compare' ? { w: 560, h: 520 } : { w: 220, h: 250 };
    }

    function renderIconHtml(icon, context) {
        if (typeof context?.renderIconHtml === 'function') return context.renderIconHtml(icon);
        if (icon === 'sai-compare-glyph') return '<span class="sai-compare-glyph" aria-hidden="true"><i></i><b></b></span>';
        return `<i class="fa-solid ${escapeHtml(icon || 'fa-image')}"></i>`;
    }

    function renderNodeStateBadges(node, context) {
        return call(context, 'renderNodeStateBadges', '', node);
    }

    function sourceSignature(node, slot, context) {
        const source = getSourceNode(node, slot, context);
        const asset = getSourceAsset(source, context);
        return [
            source?.id || '',
            source?.title || '',
            asset?.asset_id || '',
            asset?.path || '',
            asset?.output_path || '',
            asset?.preview_url || '',
            asset?.data_url ? String(asset.data_url).slice(0, 128) : '',
            asset?.width || '',
            asset?.height || ''
        ].join('|');
    }

    function imageGeometry(aAsset, bAsset, node, options) {
        const opts = options || {};
        const mode = String(node?.params?.mode || 'fit');
        const aw = Math.max(1, Number(aAsset?.width || 0) || 1);
        const ah = Math.max(1, Number(aAsset?.height || 0) || 1);
        const bw = Math.max(1, Number(bAsset?.width || 0) || aw);
        const bh = Math.max(1, Number(bAsset?.height || 0) || ah);
        const maxW = Math.max(240, Number(opts.maxW || (node?.w || 560) - 24));
        const maxH = Math.max(180, Number(opts.maxH || (node?.h || 520) - 190));
        const zoom = Math.max(0.1, Number(opts.zoom || 1) || 1);
        if (mode === 'pixel') {
            const pixelW = Math.max(aw, bw);
            const pixelH = Math.max(ah, bh);
            const baseScale = Math.min(maxW / pixelW, maxH / pixelH, 1);
            const scale = baseScale * zoom;
            const stageW = Math.max(maxW, pixelW * scale);
            const stageH = Math.max(maxH, pixelH * scale);
            return {
                mode,
                aspect: stageW / stageH,
                stageW: Math.max(1, Math.round(stageW)),
                stageH: Math.max(1, Math.round(stageH)),
                unit: 'px',
                aW: Math.max(1, Math.round(aw * scale)),
                aH: Math.max(1, Math.round(ah * scale)),
                bW: Math.max(1, Math.round(bw * scale)),
                bH: Math.max(1, Math.round(bh * scale)),
                aX: Math.round((stageW - aw * scale) / 2),
                aY: Math.round((stageH - ah * scale) / 2),
                bX: Math.round((stageW - bw * scale) / 2),
                bY: Math.round((stageH - bh * scale) / 2)
            };
        }
        const aBaseScale = Math.min(maxW / aw, maxH / ah);
        const bBaseScale = Math.min(maxW / bw, maxH / bh);
        const aScale = aBaseScale * zoom;
        const bScale = bBaseScale * zoom;
        const stageW = Math.max(maxW, aw * aScale, bw * bScale);
        const stageH = Math.max(maxH, ah * aScale, bh * bScale);
        return {
            mode,
            aspect: stageW / stageH,
            stageW: Math.max(1, Math.round(stageW)),
            stageH: Math.max(1, Math.round(stageH)),
            unit: 'px',
            aW: Math.max(1, Math.round(aw * aScale)),
            aH: Math.max(1, Math.round(ah * aScale)),
            bW: Math.max(1, Math.round(bw * bScale)),
            bH: Math.max(1, Math.round(bh * bScale)),
            aX: Math.round((stageW - aw * aScale) / 2),
            aY: Math.round((stageH - ah * aScale) / 2),
            bX: Math.round((stageW - bw * bScale) / 2),
            bY: Math.round((stageH - bh * bScale) / 2)
        };
    }

    function viewportSize(node, context) {
        const width = Math.max(300, Number(node?.w || defaultNodeSize('compare', context).w) - 16);
        return Math.round(width);
    }

    function renderStageHtml(node, context, options) {
        const opts = options || {};
        const sourceA = getSourceNode(node, 'a', context);
        const sourceB = getSourceNode(node, 'b', context);
        const assetA = getSourceAsset(sourceA, context);
        const assetB = getSourceAsset(sourceB, context);
        const srcA = assetSrc(assetA, context);
        const srcB = assetSrc(assetB, context);
        const pos = clamp(Number(node?.params?.position ?? 50), 0, 100);
        const mode = String(node?.params?.mode || 'fit');
        if (!srcA || !srcB) {
            return `<div class="sai-compare-empty">${renderIconHtml('sai-compare-glyph', context)}<span>${escapeHtml(srcA || srcB ? t('Connect the second image', '连接第二张图像') : t('Connect two image nodes', '连接两个图像节点'))}</span></div>`;
        }
        const viewSize = viewportSize(node, context);
        const viewOptions = Object.assign({
            maxW: Math.max(240, viewSize),
            maxH: Math.max(180, viewSize)
        }, opts);
        const g = imageGeometry(assetA, assetB, node, viewOptions);
        const stageStyle = `--compare-pos:${pos}%;--compare-aspect:${g.aspect};${g.stageW ? `--stage-w:${g.stageW}px;--stage-h:${g.stageH}px;` : ''}`;
        const unit = g.unit || 'px';
        const imgAStyle = `style="left:${g.aX}${unit};top:${g.aY}${unit};width:${g.aW}${unit};height:${g.aH}${unit}"`;
        const imgBStyle = `style="left:${g.bX}${unit};top:${g.bY}${unit};width:${g.bW}${unit};height:${g.bH}${unit}"`;
        return `
<div class="sai-compare-stage sai-compare-stage-${escapeHtml(mode)}" style="${stageStyle}">
  <div class="sai-compare-layer sai-compare-layer-a"><img src="${escapeHtml(srcA)}" alt="" draggable="false" ${imgAStyle}></div>
  <div class="sai-compare-layer sai-compare-layer-b"><img src="${escapeHtml(srcB)}" alt="" draggable="false" ${imgBStyle}></div>
  <i class="sai-compare-divider"></i>
  <span class="sai-compare-label sai-compare-label-a">${escapeHtml(sourceA?.title || 'A')}</span>
  <span class="sai-compare-label sai-compare-label-b">${escapeHtml(sourceB?.title || 'B')}</span>
</div>`;
    }

    function renderInputRow(node, slot, label, context) {
        const source = getSourceNode(node, slot, context);
        const asset = getSourceAsset(source, context);
        const size = asset?.width && asset?.height ? `${asset.width} x ${asset.height}` : t('Not connected', '未连接');
        return `
<div class="sai-compare-input-row">
  <button type="button" class="sai-node-handle sai-node-handle-in sai-compare-input-handle" data-compare-image-in="${escapeHtml(slot)}" title="${escapeHtml(label)}"></button>
  <span>${escapeHtml(label)}</span>
  <b>${escapeHtml(source?.title || t('Not connected', '未连接'))}</b>
  <small>${escapeHtml(size)}</small>
</div>`;
    }

    function renderControls(node) {
        const mode = String(node?.params?.mode || 'fit');
        const pos = clamp(Number(node?.params?.position ?? 50), 0, 100);
        return `
<div class="sai-compare-controls">
  <div class="sai-segmented">
    <button type="button" data-compare-mode="fit" class="${mode === 'fit' ? 'is-active' : ''}" title="${escapeHtml(t('Match single side, preserve aspect', '匹配单边并保持比例'))}"><i class="fa-solid fa-expand"></i><span>${escapeHtml(t('Fit', '适配'))}</span></button>
    <button type="button" data-compare-mode="pixel" class="${mode === 'pixel' ? 'is-active' : ''}" title="${escapeHtml(t('Centered point-to-point pixels', '居中逐像素对比'))}"><i class="fa-solid fa-crosshairs"></i><span>${escapeHtml(t('Pixel', '像素'))}</span></button>
  </div>
  <input type="range" min="0" max="100" step="0.1" value="${pos}" data-compare-position>
</div>`;
    }

    function renderNodeHtml(node, context) {
        const pos = clamp(Number(node?.params?.position ?? 50), 0, 100);
        const viewSize = viewportSize(node, context);
        return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtml(t('Compare', '对比'))}</span>
  <span class="sai-node-title">${escapeHtml(node.title || t('Image Compare', '图像对比'))}</span>
  ${renderNodeStateBadges(node, context)}
  <button type="button" data-node-action="compare-fullscreen" title="${escapeHtml(t('Fullscreen compare', '全屏对比'))}"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtml(t('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-compare-inputs">
  ${renderInputRow(node, 'a', t('Image A', '图像 A'), context)}
  ${renderInputRow(node, 'b', t('Image B', '图像 B'), context)}
</div>
${renderControls(node)}
<div class="sai-compare-view" data-compare-view style="--compare-pos:${pos}%;--compare-view-size:${viewSize}px">${renderStageHtml(node, context, { maxW: viewSize, maxH: viewSize })}</div>`;
    }

    function renderInspector(node, context) {
        const sourceA = getSourceNode(node, 'a', context);
        const sourceB = getSourceNode(node, 'b', context);
        const assetA = getSourceAsset(sourceA, context);
        const assetB = getSourceAsset(sourceB, context);
        const mode = String(node?.params?.mode || 'fit');
        const position = String(clamp(Number(node?.params?.position ?? 50), 0, 100));
        return `
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Image Compare', '图像对比'))}</h3>
  <label>${escapeHtml(t('Title', '标题'))}<input data-inspector-node-field="title" value="${escapeHtml(node.title || '')}"></label>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Image A', '图像 A'))}</span><b>${escapeHtml(sourceA ? `${sourceA.title || sourceA.id} / ${readAssetSize(assetA, context)}` : t('Not connected', '未连接'))}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Image B', '图像 B'))}</span><b>${escapeHtml(sourceB ? `${sourceB.title || sourceB.id} / ${readAssetSize(assetB, context)}` : t('Not connected', '未连接'))}</b></div>
  <label>${escapeHtml(t('Mode', '模式'))}<select data-compare-mode-select>
    <option value="fit" ${mode === 'fit' ? 'selected' : ''}>${escapeHtml(t('Match single side / centered', '匹配单边 / 居中'))}</option>
    <option value="pixel" ${mode === 'pixel' ? 'selected' : ''}>${escapeHtml(t('Point-to-point pixels / centered', '逐像素 / 居中'))}</option>
  </select></label>
  <label>${escapeHtml(t('Split', '分割线'))}<input data-compare-position type="range" min="0" max="100" step="0.1" value="${escapeHtml(position)}"></label>
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="compare-fullscreen"><i class="fa-solid fa-magnifying-glass-plus"></i><span>${escapeHtml(t('Fullscreen', '全屏'))}</span></button>
  <button type="button" data-inspector-action="compare-swap"><i class="fa-solid fa-right-left"></i><span>${escapeHtml(t('Swap', '交换'))}</span></button>
  <button type="button" data-inspector-action="duplicate"><i class="fa-solid fa-copy"></i><span>${escapeHtml(t('Duplicate', '复制'))}</span></button>
  <button type="button" data-inspector-action="delete" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete', '删除'))}</span></button>
</div>`;
    }

    window.SimpAICanvasWorkbenchCompareNode = {
        createCompareNodeContext,
        createNode,
        sourceSignature,
        imageGeometry,
        viewportSize,
        renderStageHtml,
        renderControls,
        renderNodeHtml,
        renderInspector
    };
})();
