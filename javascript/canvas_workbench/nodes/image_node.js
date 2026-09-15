(function () {
    'use strict';

    const DEFAULT_UTILS = typeof window !== 'undefined' ? window.SimpAICanvasWorkbenchUtils || {} : {};
    const DEFAULT_ASSETS = typeof window !== 'undefined' ? window.SimpAICanvasWorkbenchAssetNodes || {} : {};
    const escapeHtmlFallback = (value) => String(value ?? '');
    const translateFallback = (en, cn) => cn || en;

    function call(context, name, fallback, ...args) {
        return typeof context?.[name] === 'function' ? context[name](...args) : fallback;
    }

    function delegate(source, name) {
        if (typeof source?.[name] !== 'function') return undefined;
        return (...args) => source[name](...args);
    }

    function createImageNodeContext(source) {
        const scope = source || {};
        const utilitySource = scope.utilitySource || {};
        const assetSource = scope.assetSource || {};
        const nodeSource = scope.nodeSource || {};
        const renderSource = scope.renderSource || {};
        const pick = (group, name) => delegate(group, name) || delegate(scope, name);
        return {
            escapeHtml: pick(utilitySource, 'escapeHtml'),
            t: pick(utilitySource, 't'),
            assetDisplaySrc: pick(assetSource, 'assetDisplaySrc'),
            readImageInfo: pick(assetSource, 'readImageInfo'),
            mediaAspectStyle: pick(assetSource, 'mediaAspectStyle'),
            readAssetSize: pick(assetSource, 'readAssetSize'),
            getNodeImageSrc: pick(nodeSource, 'getNodeImageSrc'),
            renderNodeStateBadges: pick(renderSource, 'renderNodeStateBadges')
        };
    }

    const DEFAULT_IMAGE_NODE_CONTEXT = createImageNodeContext({
        utilitySource: {
            escapeHtml: DEFAULT_UTILS.escapeHtml || escapeHtmlFallback,
            t: DEFAULT_UTILS.t || translateFallback
        },
        assetSource: DEFAULT_ASSETS
    });

    function escapeHtmlValue(context, value) {
        return call(context, 'escapeHtml', escapeHtmlFallback(value), value);
    }

    function translateValue(context, en, cn) {
        return call(context, 't', translateFallback(en, cn), en, cn);
    }

    function assetDisplaySrc(asset, context) {
        if (typeof context?.assetDisplaySrc === 'function') return context.assetDisplaySrc(asset || {});
        return asset?.data_url || asset?.preview_url || asset?.thumb || '';
    }

    function nodeImageSrc(node, context) {
        if (typeof context?.getNodeImageSrc === 'function') {
            const src = context.getNodeImageSrc(node || {});
            if (src) return src;
        }
        return assetDisplaySrc(node?.asset, context);
    }

    function readImageInfo(node, context) {
        if (typeof context?.readImageInfo === 'function') return context.readImageInfo(node || {});
        return [];
    }

    function mediaAspectStyle(asset, context) {
        if (typeof context?.mediaAspectStyle === 'function') return context.mediaAspectStyle(asset || {});
        return '';
    }

    function readAssetSize(asset, context) {
        if (typeof context?.readAssetSize === 'function') return context.readAssetSize(asset || {});
        return asset?.width && asset?.height ? `${asset.width} x ${asset.height}` : '';
    }

    function renderNodeHtml(node, context) {
        const ctx = context || DEFAULT_IMAGE_NODE_CONTEXT;
        const image = nodeImageSrc(node, ctx);
        const mask = node.mask && (node.mask.thumb || node.mask.data_url);
        const info = readImageInfo(node, ctx);
        const stateBadges = call(ctx, 'renderNodeStateBadges', '', node);
        const aspect = mediaAspectStyle(node.asset, ctx);
        const displayMode = String(node.display_mode || node.image_display_mode || '').toLowerCase();
        const frameless = displayMode !== 'card';
        const emptyUpload = `<button type="button" class="sai-node-empty sai-image-empty-upload" data-node-action="replace-image">${escapeHtmlValue(ctx, translateValue(ctx, 'No image', '无图像'))}</button>`;
        return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtmlValue(ctx, translateValue(ctx, 'Image', '图像'))}</span>
  <span class="sai-node-title">${escapeHtmlValue(ctx, node.title || translateValue(ctx, 'Image', '图像'))}</span>
  ${stateBadges}
  <button type="button" data-node-action="view-image" title="${escapeHtmlValue(ctx, translateValue(ctx, 'View image', '查看图像'))}"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
  <button type="button" data-node-action="sketch-edit" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Edit in Sketch', '在 Sketch 中编辑'))}"><i class="fa-solid fa-pen-ruler"></i></button>
  <button type="button" data-node-action="layerforge-edit" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Edit in LayerForge', '在 LayerForge 中编辑'))}"><i class="fa-solid fa-layer-group"></i></button>
  <button type="button" data-node-action="edit-mask" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Edit Mask', '编辑遮罩'))}"><i class="fa-solid fa-paintbrush"></i></button>
  <button type="button" class="${frameless ? 'is-active' : ''}" data-node-action="toggle-image-frameless" title="${escapeHtmlValue(ctx, frameless ? translateValue(ctx, 'Show image frame', '显示图像边框') : translateValue(ctx, 'Hide image frame', '隐藏图像边框'))}"><i class="fa-solid fa-border-none"></i></button>
  <button type="button" data-node-action="replace-image" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Replace image', '替换图像'))}"><i class="fa-solid fa-arrows-rotate"></i></button>
  <button type="button" class="sai-node-close" data-node-action="delete" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-node-media sai-image-node-media sai-collapsed-keep${frameless ? ' is-frameless' : ''}${image ? '' : ' is-empty-upload'}" data-image-drop-zone${aspect}>${image ? `<img src="${escapeHtmlValue(ctx, image)}" alt="" draggable="false">${mask ? `<img class="sai-mask-overlay" src="${escapeHtmlValue(ctx, mask)}" alt="" draggable="false">` : ''}` : emptyUpload}</div>
<div class="sai-node-info">${info.map(bit => `<span>${escapeHtmlValue(ctx, bit)}</span>`).join('') || `<span>${escapeHtmlValue(ctx, translateValue(ctx, 'No metadata', '无元数据'))}</span>`}</div>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="image" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Output', '输出'))}"></button>`;
    }

    function renderInspector(node, context) {
        const ctx = context || DEFAULT_IMAGE_NODE_CONTEXT;
        const info = readImageInfo(node, ctx);
        const size = readAssetSize(node.asset, ctx);
        return `
<div class="sai-inspector-section">
  <h3>${escapeHtmlValue(ctx, translateValue(ctx, 'Image Node', '图像节点'))}</h3>
  <label>${escapeHtmlValue(ctx, translateValue(ctx, 'Title', '标题'))}<input data-inspector-node-field="title" value="${escapeHtmlValue(ctx, node.title || '')}"></label>
  <div class="sai-inspector-kv"><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Type', '类型'))}</span><b>${escapeHtmlValue(ctx, node.asset?.mime || 'image')}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Size', '尺寸'))}</span><b>${escapeHtmlValue(ctx, size)}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Info', '信息'))}</span><b>${escapeHtmlValue(ctx, info.join(' / ') || translateValue(ctx, 'None', '无'))}</b></div>
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="view-image"><i class="fa-solid fa-magnifying-glass-plus"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'View', '查看'))}</span></button>
  <button type="button" data-inspector-action="sketch-edit"><i class="fa-solid fa-pen-ruler"></i><span>Sketch</span></button>
  <button type="button" data-inspector-action="layerforge-edit"><i class="fa-solid fa-layer-group"></i><span>LayerForge</span></button>
  <button type="button" data-inspector-action="replace-image"><i class="fa-solid fa-arrows-rotate"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Replace', '替换'))}</span></button>
  <button type="button" data-inspector-action="edit-mask"><i class="fa-solid fa-paintbrush"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Mask', '遮罩'))}</span></button>
  <button type="button" data-inspector-action="duplicate"><i class="fa-solid fa-copy"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Duplicate', '复制'))}</span></button>
  <button type="button" data-inspector-action="delete" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Delete', '删除'))}</span></button>
</div>`;
    }

    window.SimpAICanvasWorkbenchImageNode = {
        createImageNodeContext,
        renderNodeHtml,
        renderInspector
    };
})();
