(function () {
    'use strict';

    function createCanvasResultContextMenuController(context) {
        const scope = context?.resultContextMenuSource || context || {};
        const projectSource = scope.projectSource || {};
        const resultAssetSource = scope.resultAssetSource || {};
        const assetSource = scope.assetSource || {};
        const actionSource = scope.actionSource || {};
        const graphSource = scope.graphSource || {};
        const historySource = scope.historySource || {};
        const renderSource = scope.renderSource || {};
        const uiSource = scope.uiSource || {};
        const languageSource = scope.languageSource || {};

        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject?.[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const getProject = () => call(projectSource, 'getProject', {}) || {};
        const getResultAssetAt = (...args) => call(resultAssetSource, 'getResultAssetAt', null, ...args);
        const assetMediaKind = (...args) => call(assetSource, 'assetMediaKind', 'image', ...args);
        const assetMediaIcon = (...args) => call(assetSource, 'assetMediaIcon', 'fa-image', ...args);
        const createMediaNodeFromResultAsset = (...args) => call(actionSource, 'createMediaNodeFromResultAsset', undefined, ...args);
        const expandResultAssetsToMediaNodes = (...args) => call(actionSource, 'expandResultAssetsToMediaNodes', undefined, ...args);
        const openAssetViewer = (...args) => call(actionSource, 'openAssetViewer', undefined, ...args);
        const copyAssetPath = (...args) => call(actionSource, 'copyAssetPath', undefined, ...args);
        const deleteEdge = (...args) => call(graphSource, 'deleteEdge', undefined, ...args);
        const pushHistory = (...args) => call(historySource, 'pushHistory', undefined, ...args);
        const mutate = (...args) => call(renderSource, 'mutate', undefined, ...args);
        const openContextMenu = (...args) => call(uiSource, 'openContextMenu', undefined, ...args);
        const notConnectedText = (...args) => call(uiSource, 'notConnectedText', '', ...args);
        const getLanguageState = () => call(languageSource, 'getLanguageState', { __lang: 'en' });
        const t = (english, chinese) => call(
            languageSource,
            't',
            chinese || english,
            english,
            chinese,
            getLanguageState()
        );

        function openResultAssetContextMenu(node, index, x, y) {
            const asset = getResultAssetAt(node, index);
            const label = t('Result {index}', 'Result 第 {index} 项').replace('{index}', String(Number(index || 0) + 1));
            const kind = assetMediaKind(asset || {});
            const convertLabel = kind === 'video'
                ? t('Convert to Video node', '转为视频节点')
                : (kind === 'audio' ? t('Convert to Audio node', '转为音频节点') : t('Convert to Image node', '转为图像节点'));
            const icon = assetMediaIcon(asset || {});
            const viewLabel = kind === 'video'
                ? t('View video', '查看视频')
                : (kind === 'audio' ? t('Open audio', '打开音频') : t('View original image', '查看原图'));
            openContextMenu(x, y, [
                {
                    label: t('Set as primary: {label}', '选为主图：{label}').replace('{label}', label),
                    icon: 'fa-check',
                    action: () => {
                        pushHistory(t('Select result asset', '选择 Result 资产'));
                        call(resultAssetSource, 'selectResultAsset', undefined, node, index);
                        mutate();
                    }
                },
                { label: convertLabel, icon, action: () => createMediaNodeFromResultAsset(node, index), disabled: !asset },
                { label: viewLabel, icon: 'fa-magnifying-glass-plus', action: () => openAssetViewer(asset, `${node?.title || 'Result'} ${Number(index || 0) + 1}`), disabled: !asset },
                { label: t('Copy path', '复制路径'), icon: 'fa-copy', action: () => copyAssetPath(asset), disabled: !asset },
                { label: t('Expand all outputs', '展开全部输出'), icon: 'fa-table-cells-large', action: () => expandResultAssetsToMediaNodes(node), disabled: !(Array.isArray(node?.assets) && node.assets.length > 1) }
            ]);
        }

        function openResultInputContextMenu(node, x, y) {
            const edges = Array.isArray(getProject().edges) ? getProject().edges : [];
            const edge = edges.find(item => item.type === 'generate' && item.to === node?.id);
            openContextMenu(x, y, [
                {
                    label: edge ? t('Disconnect preset output', '断开 preset 输出') : notConnectedText(),
                    icon: edge ? 'fa-link-slash' : 'fa-circle',
                    disabled: !edge,
                    action: () => edge && deleteEdge(edge.id)
                }
            ]);
        }

        return {
            openResultAssetContextMenu,
            openResultInputContextMenu
        };
    }

    window.SimpAICanvasWorkbenchResultContextMenu = Object.assign(
        {},
        window.SimpAICanvasWorkbenchResultContextMenu || {},
        { createCanvasResultContextMenuController }
    );
})();
