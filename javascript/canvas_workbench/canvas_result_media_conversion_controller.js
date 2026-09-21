(function () {
    'use strict';

    function createCanvasResultMediaConversionController(context) {
        const scope = context?.resultMediaConversionSource || context || {};
        const resultAssetSource = scope.resultAssetSource || {};
        const mediaSource = scope.mediaSource || {};
        const historySource = scope.historySource || {};
        const selectionSource = scope.selectionSource || {};
        const renderSource = scope.renderSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};

        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject?.[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const getSelectedResultAsset = (...args) => call(resultAssetSource, 'getSelectedResultAsset', null, ...args);
        const getResultAssetAt = (...args) => call(resultAssetSource, 'getResultAssetAt', null, ...args);
        const selectResultAsset = (...args) => call(resultAssetSource, 'selectResultAsset', null, ...args);
        const assetMediaKind = (asset) => call(mediaSource, 'assetMediaKind', 'image', asset);
        const createMediaNodeFromAsset = (...args) => call(mediaSource, 'createMediaNodeFromAsset', null, ...args);
        const pushHistory = (...args) => call(historySource, 'pushHistory', undefined, ...args);
        const setSelectedNode = (...args) => call(selectionSource, 'setSelectedNode', undefined, ...args);
        const clearResultSelection = (...args) => call(selectionSource, 'clearResultSelection', undefined, ...args);
        const mutate = (...args) => call(renderSource, 'mutate', undefined, ...args);
        const getLanguageState = () => call(languageSource, 'getLanguageState', { __lang: 'en' });
        const t = (english, chinese) => call(
            languageSource,
            't',
            chinese || english,
            english,
            chinese,
            getLanguageState()
        );
        const showToast = (...args) => call(uiSource, 'showToast', undefined, ...args);

        const mediaKindLabel = (kind) => {
            if (kind === 'video') return t('video', '视频');
            if (kind === 'audio') return t('audio', '音频');
            return t('image', '图像');
        };

        function convertResultToMediaNode(node) {
            const asset = getSelectedResultAsset(node);
            if (!asset) {
                showToast(t('No result media to convert.', '没有可转换的 Result 媒体。'));
                return null;
            }
            const kind = assetMediaKind(asset);
            pushHistory(t(`Convert result to ${kind}`, `将 Result 转为${mediaKindLabel(kind)}`));
            const mediaNode = createMediaNodeFromAsset(asset, {
                x: (node?.x || 0) + (node?.w || 240) + 70,
                y: node?.y || 0
            }, `${node?.title || 'Result'} ${kind}`);
            if (!mediaNode) return null;
            setSelectedNode(mediaNode);
            mutate();
            showToast(t(
                `Result converted to ${kind} node.`,
                `Result 已转换为${mediaKindLabel(kind)}节点。`
            ));
            return mediaNode;
        }

        function createMediaNodeFromResultAsset(node, index) {
            const asset = getResultAssetAt(node, index);
            if (!asset) {
                showToast(t('No result media to convert.', '没有可转换的 Result 媒体。'));
                return null;
            }
            const safeIndex = Number(index || 0);
            const kind = assetMediaKind(asset);
            pushHistory(t(
                'Convert stack item to {kind}',
                `将输出项转为{kind}`
            ).replace('{kind}', mediaKindLabel(kind)));
            selectResultAsset(node, index);
            const mediaNode = createMediaNodeFromAsset(asset, {
                x: (node?.x || 0) + (node?.w || 240) + 70,
                y: (node?.y || 0) + 34 + (safeIndex % 4) * 24
            }, `${node?.title || 'Result'} ${safeIndex + 1} ${kind}`);
            if (!mediaNode) return null;
            setSelectedNode(mediaNode);
            mutate();
            showToast(t(
                `Result ${safeIndex + 1} converted to ${kind} node.`,
                `Result 第 ${safeIndex + 1} 项已转换为${mediaKindLabel(kind)}节点。`
            ));
            return mediaNode;
        }

        function expandResultAssetsToMediaNodes(node) {
            const assets = Array.isArray(node?.assets) ? node.assets : [];
            if (!assets.length) return convertResultToMediaNode(node);
            pushHistory(t('Expand result outputs', '展开 Result 全部输出'));
            const reserved = [];
            assets.forEach((asset, index) => {
                const kind = assetMediaKind(asset);
                createMediaNodeFromAsset(asset, {
                    x: (node?.x || 0) + (node?.w || 240) + 70 + (index % 3) * 245,
                    y: (node?.y || 0) + Math.floor(index / 3) * 285
                }, `${node?.title || 'Result'} ${index + 1} ${kind}`, { reserved });
            });
            clearResultSelection();
            mutate();
            showToast(t(
                `Expanded ${assets.length} result media node(s).`,
                `已展开 ${assets.length} 个 Result 媒体节点。`
            ));
            return assets.length;
        }

        return {
            convertResultToMediaNode,
            createMediaNodeFromResultAsset,
            expandResultAssetsToMediaNodes
        };
    }

    window.SimpAICanvasWorkbenchResultMediaConversion = Object.assign(
        {},
        window.SimpAICanvasWorkbenchResultMediaConversion || {},
        { createCanvasResultMediaConversionController }
    );
})();
