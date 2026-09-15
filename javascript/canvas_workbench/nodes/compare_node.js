(function () {
    'use strict';

    const DEFAULT_UTILS = typeof window !== 'undefined' ? window.SimpAICanvasWorkbenchUtils || {} : {};
    const DEFAULT_ASSETS = typeof window !== 'undefined' ? window.SimpAICanvasWorkbenchAssetNodes || {} : {};
    const escapeHtmlFallback = (value) => String(value ?? '');
    const clampFallback = (value, min, max) => Math.max(min, Math.min(max, value));
    const translateFallback = (en, cn) => cn || en;

    function call(ctx, name, fallback, ...args) {
        return typeof ctx?.[name] === 'function' ? ctx[name](...args) : fallback;
    }

    function cloneValue(value, fallback) {
        try {
            return JSON.parse(JSON.stringify(value ?? fallback));
        } catch (err) {
            return fallback;
        }
    }

    function isRecord(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function mergeObject(previous, next) {
        return Object.assign(
            {},
            isRecord(previous) ? cloneValue(previous, {}) : {},
            isRecord(next) ? cloneValue(next, {}) : {}
        );
    }

    function delegate(context, name) {
        if (typeof context?.[name] !== 'function') return undefined;
        return (...args) => context[name](...args);
    }

    function createCompareNodeContext(source) {
        const scope = source || {};
        const utilitySource = scope.utilitySource || {};
        const assetSource = scope.assetSource || {};
        const nodeSource = scope.nodeSource || {};
        const renderSource = scope.renderSource || {};
        const pick = (group, name) => delegate(group, name) || delegate(scope, name);
        return {
            assetDisplaySrc: pick(assetSource, 'assetDisplaySrc'),
            defaultNodeSize: pick(nodeSource, 'defaultNodeSize'),
            escapeHtml: pick(utilitySource, 'escapeHtml'),
            t: pick(utilitySource, 't'),
            clamp: pick(utilitySource, 'clamp'),
            getCompareSourceAsset: pick(nodeSource, 'getCompareSourceAsset'),
            getCompareSourceNode: pick(nodeSource, 'getCompareSourceNode'),
            readAssetSize: pick(assetSource, 'readAssetSize'),
            renderIconHtml: pick(renderSource, 'renderIconHtml'),
            renderNodeStateBadges: pick(renderSource, 'renderNodeStateBadges'),
            uid: pick(nodeSource, 'uid')
        };
    }

    const DEFAULT_COMPARE_NODE_CONTEXT = createCompareNodeContext({
        utilitySource: {
            escapeHtml: DEFAULT_UTILS.escapeHtml || escapeHtmlFallback,
            t: DEFAULT_UTILS.t || translateFallback,
            clamp: DEFAULT_UTILS.clamp || clampFallback
        },
        assetSource: DEFAULT_ASSETS
    });

    function contextOf(context) {
        return context || DEFAULT_COMPARE_NODE_CONTEXT;
    }

    function escapeHtmlValue(context, value) {
        return call(contextOf(context), 'escapeHtml', escapeHtmlFallback(value), value);
    }

    function translateValue(context, en, cn) {
        return call(contextOf(context), 't', translateFallback(en, cn), en, cn);
    }

    function clampValue(context, value, min, max) {
        return call(contextOf(context), 'clamp', clampFallback(value, min, max), value, min, max);
    }

    function buildCompareStatePatch(node, options) {
        const config = options || {};
        const hasOwn = key => Object.prototype.hasOwnProperty.call(config, key);
        const defaults = {
            inputs: { a: null, b: null },
            params: { position: 50, mode: 'fit' },
            source: { kind: 'manual_compare' }
        };
        const initialState = isRecord(config.initialState) ? config.initialState : {};
        const statePatch = isRecord(config.statePatch) ? config.statePatch : {};
        const state = Object.assign(
            {},
            cloneValue(defaults, {}),
            cloneValue(initialState, {}),
            cloneValue(node || {}, {}),
            cloneValue(statePatch, {})
        );
        const inputs = hasOwn('inputs')
            ? (isRecord(config.inputs) ? cloneValue(config.inputs, {}) : {})
            : mergeObject(
                mergeObject(
                    mergeObject(defaults.inputs, initialState.inputs),
                    node?.inputs
                ),
                statePatch.inputs
            );
        if (isRecord(config.inputsPatch)) Object.assign(inputs, cloneValue(config.inputsPatch, {}));
        (Array.isArray(config.deleteInputKeys) ? config.deleteInputKeys : []).forEach((key) => {
            const name = String(key || '').trim();
            if (name) delete inputs[name];
        });
        const params = hasOwn('params')
            ? (isRecord(config.params) ? cloneValue(config.params, {}) : {})
            : mergeObject(
                mergeObject(
                    mergeObject(defaults.params, initialState.params),
                    node?.params
                ),
                statePatch.params
            );
        if (isRecord(config.paramsPatch)) Object.assign(params, cloneValue(config.paramsPatch, {}));
        (Array.isArray(config.deleteParamKeys) ? config.deleteParamKeys : []).forEach((key) => {
            const name = String(key || '').trim();
            if (name) delete params[name];
        });
        const source = mergeObject(
            mergeObject(
                mergeObject(defaults.source, initialState.source),
                node?.source
            ),
            statePatch.source
        );
        if (isRecord(config.sourcePatch)) Object.assign(source, cloneValue(config.sourcePatch, {}));
        return {
            inputs: cloneValue(inputs, {}),
            params: cloneValue(params, {}),
            source: cloneValue(source, {})
        };
    }

    function createNode(world, options, context) {
        const opts = options || {};
        const position = world || { x: 0, y: 0 };
        const ctx = contextOf(context);
        const size = defaultNodeSize('compare', ctx) || { w: 560, h: 520 };
        return {
            id: call(ctx, 'uid', 'compare-node', 'compare'),
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
        return call(contextOf(context), 'getCompareSourceNode', null, node, slot);
    }

    function getSourceAsset(source, context) {
        return call(contextOf(context), 'getCompareSourceAsset', null, source);
    }

    function assetSrc(asset, context) {
        if (typeof contextOf(context).assetDisplaySrc === 'function') return contextOf(context).assetDisplaySrc(asset || {});
        return asset?.data_url || asset?.preview_url || asset?.thumb || '';
    }

    function readAssetSize(asset, context) {
        if (typeof contextOf(context).readAssetSize === 'function') return contextOf(context).readAssetSize(asset || {});
        return asset?.width && asset?.height ? `${asset.width} x ${asset.height}` : '';
    }

    function defaultNodeSize(type, context) {
        if (typeof contextOf(context).defaultNodeSize === 'function') return contextOf(context).defaultNodeSize(type);
        return type === 'compare' ? { w: 560, h: 520 } : { w: 220, h: 250 };
    }

    function renderIconHtml(icon, context) {
        if (typeof contextOf(context).renderIconHtml === 'function') return contextOf(context).renderIconHtml(icon);
        if (icon === 'sai-compare-glyph') return '<span class="sai-compare-glyph" aria-hidden="true"><i></i><b></b></span>';
        return `<i class="fa-solid ${escapeHtmlValue(context, icon || 'fa-image')}"></i>`;
    }

    function renderNodeStateBadges(node, context) {
        return call(contextOf(context), 'renderNodeStateBadges', '', node);
    }

    function sourceSignature(node, slot, context) {
        const ctx = contextOf(context);
        const source = getSourceNode(node, slot, ctx);
        const asset = getSourceAsset(source, ctx);
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
        const width = Math.max(300, Number(node?.w || defaultNodeSize('compare', contextOf(context)).w) - 16);
        return Math.round(width);
    }

    function renderStageHtml(node, context, options) {
        const ctx = contextOf(context);
        const opts = options || {};
        const sourceA = getSourceNode(node, 'a', ctx);
        const sourceB = getSourceNode(node, 'b', ctx);
        const assetA = getSourceAsset(sourceA, ctx);
        const assetB = getSourceAsset(sourceB, ctx);
        const srcA = assetSrc(assetA, ctx);
        const srcB = assetSrc(assetB, ctx);
        const pos = clampValue(ctx, Number(node?.params?.position ?? 50), 0, 100);
        const mode = String(node?.params?.mode || 'fit');
        if (!srcA || !srcB) {
            return `<div class="sai-compare-empty">${renderIconHtml('sai-compare-glyph', ctx)}<span>${escapeHtmlValue(ctx, srcA || srcB ? translateValue(ctx, 'Connect the second image', '连接第二张图像') : translateValue(ctx, 'Connect two image nodes', '连接两个图像节点'))}</span></div>`;
        }
        const viewSize = viewportSize(node, ctx);
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
<div class="sai-compare-stage sai-compare-stage-${escapeHtmlValue(ctx, mode)}" style="${stageStyle}">
  <div class="sai-compare-layer sai-compare-layer-a"><img src="${escapeHtmlValue(ctx, srcA)}" alt="" draggable="false" ${imgAStyle}></div>
  <div class="sai-compare-layer sai-compare-layer-b"><img src="${escapeHtmlValue(ctx, srcB)}" alt="" draggable="false" ${imgBStyle}></div>
  <i class="sai-compare-divider"></i>
  <span class="sai-compare-label sai-compare-label-a">${escapeHtmlValue(ctx, sourceA?.title || 'A')}</span>
  <span class="sai-compare-label sai-compare-label-b">${escapeHtmlValue(ctx, sourceB?.title || 'B')}</span>
</div>`;
    }

    function renderInputRow(node, slot, label, context) {
        const ctx = contextOf(context);
        const source = getSourceNode(node, slot, ctx);
        const asset = getSourceAsset(source, ctx);
        const size = asset?.width && asset?.height ? `${asset.width} x ${asset.height}` : translateValue(ctx, 'Not connected', '未连接');
        return `
<div class="sai-compare-input-row">
  <button type="button" class="sai-node-handle sai-node-handle-in sai-compare-input-handle" data-compare-image-in="${escapeHtmlValue(ctx, slot)}" title="${escapeHtmlValue(ctx, label)}"></button>
  <span>${escapeHtmlValue(ctx, label)}</span>
  <b>${escapeHtmlValue(ctx, source?.title || translateValue(ctx, 'Not connected', '未连接'))}</b>
  <small>${escapeHtmlValue(ctx, size)}</small>
</div>`;
    }

    function renderControls(node, context) {
        const ctx = contextOf(context);
        const mode = String(node?.params?.mode || 'fit');
        const pos = clampValue(ctx, Number(node?.params?.position ?? 50), 0, 100);
        return `
<div class="sai-compare-controls">
  <div class="sai-segmented">
    <button type="button" data-compare-mode="fit" class="${mode === 'fit' ? 'is-active' : ''}" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Match single side, preserve aspect', '匹配单边并保持比例'))}"><i class="fa-solid fa-expand"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Fit', '适配'))}</span></button>
    <button type="button" data-compare-mode="pixel" class="${mode === 'pixel' ? 'is-active' : ''}" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Centered point-to-point pixels', '居中逐像素对比'))}"><i class="fa-solid fa-crosshairs"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Pixel', '像素'))}</span></button>
  </div>
  <input type="range" min="0" max="100" step="0.1" value="${pos}" data-compare-position>
</div>`;
    }

    function renderNodeHtml(node, context) {
        const ctx = contextOf(context);
        const pos = clampValue(ctx, Number(node?.params?.position ?? 50), 0, 100);
        const viewSize = viewportSize(node, ctx);
        return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtmlValue(ctx, translateValue(ctx, 'Compare', '对比'))}</span>
  <span class="sai-node-title">${escapeHtmlValue(ctx, node.title || translateValue(ctx, 'Image Compare', '图像对比'))}</span>
  ${renderNodeStateBadges(node, ctx)}
  <button type="button" data-node-action="compare-fullscreen" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Fullscreen compare', '全屏对比'))}"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-compare-inputs">
  ${renderInputRow(node, 'a', translateValue(ctx, 'Image A', '图像 A'), ctx)}
  ${renderInputRow(node, 'b', translateValue(ctx, 'Image B', '图像 B'), ctx)}
</div>
${renderControls(node, ctx)}
<div class="sai-compare-view" data-compare-view style="--compare-pos:${pos}%;--compare-view-size:${viewSize}px">${renderStageHtml(node, ctx, { maxW: viewSize, maxH: viewSize })}</div>`;
    }

    function renderInspector(node, context) {
        const ctx = contextOf(context);
        const sourceA = getSourceNode(node, 'a', ctx);
        const sourceB = getSourceNode(node, 'b', ctx);
        const assetA = getSourceAsset(sourceA, ctx);
        const assetB = getSourceAsset(sourceB, ctx);
        const mode = String(node?.params?.mode || 'fit');
        const position = String(clampValue(ctx, Number(node?.params?.position ?? 50), 0, 100));
        return `
<div class="sai-inspector-section">
  <h3>${escapeHtmlValue(ctx, translateValue(ctx, 'Image Compare', '图像对比'))}</h3>
  <label>${escapeHtmlValue(ctx, translateValue(ctx, 'Title', '标题'))}<input data-inspector-node-field="title" value="${escapeHtmlValue(ctx, node.title || '')}"></label>
  <div class="sai-inspector-kv"><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Image A', '图像 A'))}</span><b>${escapeHtmlValue(ctx, sourceA ? `${sourceA.title || sourceA.id} / ${readAssetSize(assetA, ctx)}` : translateValue(ctx, 'Not connected', '未连接'))}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Image B', '图像 B'))}</span><b>${escapeHtmlValue(ctx, sourceB ? `${sourceB.title || sourceB.id} / ${readAssetSize(assetB, ctx)}` : translateValue(ctx, 'Not connected', '未连接'))}</b></div>
  <label>${escapeHtmlValue(ctx, translateValue(ctx, 'Mode', '模式'))}<select data-compare-mode-select>
    <option value="fit" ${mode === 'fit' ? 'selected' : ''}>${escapeHtmlValue(ctx, translateValue(ctx, 'Match single side / centered', '匹配单边 / 居中'))}</option>
    <option value="pixel" ${mode === 'pixel' ? 'selected' : ''}>${escapeHtmlValue(ctx, translateValue(ctx, 'Point-to-point pixels / centered', '逐像素 / 居中'))}</option>
  </select></label>
  <label>${escapeHtmlValue(ctx, translateValue(ctx, 'Split', '分割线'))}<input data-compare-position type="range" min="0" max="100" step="0.1" value="${escapeHtmlValue(ctx, position)}"></label>
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="compare-fullscreen"><i class="fa-solid fa-magnifying-glass-plus"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Fullscreen', '全屏'))}</span></button>
  <button type="button" data-inspector-action="compare-swap"><i class="fa-solid fa-right-left"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Swap', '交换'))}</span></button>
  <button type="button" data-inspector-action="duplicate"><i class="fa-solid fa-copy"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Duplicate', '复制'))}</span></button>
  <button type="button" data-inspector-action="delete" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Delete', '删除'))}</span></button>
</div>`;
    }

    window.SimpAICanvasWorkbenchCompareNode = {
        createCompareNodeContext,
        createNode,
        buildCompareStatePatch,
        sourceSignature,
        imageGeometry,
        viewportSize,
        renderStageHtml,
        renderControls,
        renderNodeHtml,
        renderInspector
    };
})();
