(function () {
    'use strict';

    function createCanvasBatchAnyQueriesController(context) {
        const scope = context?.batchAnyQueriesSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const fileSource = scope.fileSource || {};
        const mediaSource = scope.mediaSource || {};
        const textSource = scope.textSource || {};
        const slotSource = scope.slotSource || {};
        const languageSource = scope.languageSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const isNodeIgnored = node => call(nodeSource, 'isNodeIgnored', false, node);
        const isTextOutputNode = node => call(textSource, 'isTextOutputNode', false, node);
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };

        function batchAnyMediaKindFromAsset(asset) {
            const mime = String(asset?.mime || '').toLowerCase();
            if (mime.startsWith('video/')) return 'video';
            if (mime.startsWith('audio/')) return 'audio';
            if (mime.startsWith('image/')) return 'image';
            return '';
        }

        function batchAnyMediaKindFromFile(file) {
            if (call(fileSource, 'isImageFile', false, file)) return 'image';
            if (call(fileSource, 'isVideoFile', false, file)) return 'video';
            if (call(fileSource, 'isAudioFile', false, file)) return 'audio';
            if (call(fileSource, 'isBatchTextFile', false, file)) return 'text';
            return '';
        }

        function batchAnyMediaKind(node) {
            if (!node || node.type !== 'batch_any') return '';
            const first = Array.isArray(node.items) ? node.items[0] : null;
            return node.media_kind || first?.media_kind || batchAnyMediaKindFromAsset(first?.asset || node.asset || {});
        }

        function batchAnyPortKind(node) {
            return batchAnyMediaKind(node) || 'any';
        }

        function batchAnyMediaLabel(kind) {
            if (kind === 'text') return t('Text', '文本');
            if (kind === 'video') return t('Video', '视频');
            if (kind === 'audio') return t('Audio', '音频');
            if (kind === 'image') return t('Image', '图片');
            return t('Any', '未定');
        }

        function batchAnyMediaIcon(kind) {
            if (kind === 'text') return 'fa-align-left';
            if (kind === 'video') return 'fa-film';
            if (kind === 'audio') return 'fa-wave-square';
            if (kind === 'image') return 'fa-image';
            return 'fa-layer-group';
        }

        function batchAnyCanConnectToSlot(node, slotKey) {
            const kind = batchAnyMediaKind(node);
            if (!kind) return true;
            return call(slotSource, 'getUploadSlotMediaKind', '', slotKey) === kind;
        }

        function batchAnyCanConnectToTextSlot(node, slotKey) {
            const kind = batchAnyMediaKind(node);
            return !!node && node.type === 'batch_any' && (!kind || kind === 'text') && ['prompt', 'negative_prompt'].includes(slotKey);
        }

        function batchAnyAcceptsMediaKind(node, kind) {
            const currentKind = batchAnyMediaKind(node);
            return !!kind && (!currentKind || currentKind === kind);
        }

        function batchAnySourceAsset(node) {
            if (!node || isNodeIgnored(node)) return null;
            if (node.type === 'result') return call(mediaSource, 'getSelectedResultAsset', null, node);
            return node.asset || null;
        }

        function batchAnySourceText(node) {
            if (!node || node.type === 'batch_any' || !isTextOutputNode(node)) return '';
            return String(call(textSource, 'getNodeTextOutput', '', node) || '').trim();
        }

        function batchAnySourceMediaKind(node) {
            if (!node || isNodeIgnored(node)) return '';
            if (node.type !== 'batch_any' && isTextOutputNode(node)) return 'text';
            const asset = batchAnySourceAsset(node);
            const assetKind = batchAnyMediaKindFromAsset(asset || {});
            if (assetKind) return assetKind;
            if (node.type === 'result' && asset) return call(mediaSource, 'assetMediaKind', '', asset);
            if (node.type === 'video') return 'video';
            if (node.type === 'audio') return 'audio';
            if (['image', 'mask', 'pose_studio', 'gaussian_studio', 'liveportrait_expression'].includes(node.type)) return 'image';
            return '';
        }

        function isBatchAnySourceNode(node) {
            if (!node || isNodeIgnored(node)) return false;
            if (node.type !== 'batch_any' && isTextOutputNode(node)) return true;
            if (!['image', 'result', 'video', 'audio', 'mask', 'pose_studio', 'gaussian_studio', 'liveportrait_expression'].includes(node.type)) return false;
            return !!batchAnySourceAsset(node) && !!batchAnySourceMediaKind(node);
        }

        function batchAnyAcceptsSource(node, source) {
            return !!node && node.type === 'batch_any' && isBatchAnySourceNode(source) && batchAnyAcceptsMediaKind(node, batchAnySourceMediaKind(source));
        }

        function batchAnyTargets(node) {
            if (!node || node.type !== 'batch_any') return [];
            const kind = batchAnyMediaKind(node);
            const project = call(projectSource, 'getProject', {}) || {};
            return project.edges
                .filter(edge => (edge.type === 'upload' || edge.type === 'text') && edge.from === node.id)
                .map(edge => ({ edge, node: call(nodeSource, 'getNode', null, edge.to), slot: edge.slot || '' }))
                .filter(item => {
                    if (!item.node || !['preset', 'classic'].includes(item.node.type)) return false;
                    if (item.edge.type === 'text') return (!kind || kind === 'text') && ['prompt', 'negative_prompt'].includes(item.slot);
                    return item.edge.type === 'upload' && (!kind || batchAnyCanConnectToSlot(node, item.slot));
                });
        }

        function batchAnyTargetLabel(target) {
            if (!target?.node) return t('None', '无');
            if (target.edge?.type === 'text') return target.slot === 'negative_prompt' ? t('Negative Prompt', '负向提示词') : t('Prompt', '提示词');
            return call(slotSource, 'getSlotLabel', '', target.node, target.slot);
        }

        function batchAnyTextFromItem(item) {
            if (!item) return '';
            if (typeof item.text === 'string') return item.text;
            if (item.text && typeof item.text === 'object') return String(item.text.value || '');
            return '';
        }

        return {
            batchAnyMediaKindFromAsset, batchAnyMediaKindFromFile, batchAnyMediaKind, batchAnyPortKind,
            batchAnyMediaLabel, batchAnyMediaIcon, batchAnyCanConnectToSlot, batchAnyCanConnectToTextSlot,
            batchAnyAcceptsMediaKind, batchAnySourceAsset, batchAnySourceText, batchAnySourceMediaKind,
            isBatchAnySourceNode, batchAnyAcceptsSource, batchAnyTargets, batchAnyTargetLabel, batchAnyTextFromItem
        };
    }

    window.SimpAICanvasWorkbenchBatchAnyQueries = Object.assign(
        {}, window.SimpAICanvasWorkbenchBatchAnyQueries || {}, { createCanvasBatchAnyQueriesController }
    );
})();
