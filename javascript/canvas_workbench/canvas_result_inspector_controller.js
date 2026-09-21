(function () {
    'use strict';

    function createCanvasResultInspectorController(context) {
        const scope = context?.resultInspectorSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const selectionSource = scope.selectionSource || {};
        const resultAssetSource = scope.resultAssetSource || {};
        const stateSource = scope.stateSource || {};
        const assetSource = scope.assetSource || {};
        const renderSource = scope.renderSource || {};
        const resultRunActionSource = scope.resultRunActionSource || {};
        const mediaConversionSource = scope.mediaConversionSource || {};
        const actionSource = scope.actionSource || {};
        const utilitySource = scope.utilitySource || {};
        const languageSource = scope.languageSource || {};

        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject?.[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const getProject = () => call(projectSource, 'getProject', {}) || {};
        const getNode = (...args) => call(nodeSource, 'getNode', null, ...args);
        const getSelectedNodeId = (...args) => call(selectionSource, 'getSelectedNodeId', null, ...args);
        const getSelectedResultAsset = (...args) => call(resultAssetSource, 'getSelectedResultAsset', null, ...args);
        const isCanvasRunActiveState = (...args) => !!call(stateSource, 'isCanvasRunActiveState', false, ...args);
        const nodeStatusState = (...args) => call(stateSource, 'nodeStatusState', '', ...args);
        const isResultStale = (...args) => !!call(stateSource, 'isResultStale', false, ...args);
        const assetMediaKind = (...args) => call(assetSource, 'assetMediaKind', 'image', ...args);
        const assetMediaIcon = (...args) => call(assetSource, 'assetMediaIcon', 'fa-image', ...args);
        const readAssetSize = (...args) => call(assetSource, 'readAssetSize', '', ...args);
        const controlResultRun = (...args) => call(resultRunActionSource, 'controlResultRun', undefined, ...args);
        const retryResultRun = (...args) => call(resultRunActionSource, 'retryResultRun', undefined, ...args);
        const convertResultToMediaNode = (...args) => call(mediaConversionSource, 'convertResultToMediaNode', undefined, ...args);
        const expandResultAssetsToMediaNodes = (...args) => call(mediaConversionSource, 'expandResultAssetsToMediaNodes', undefined, ...args);
        const openAssetViewer = (...args) => call(actionSource, 'openAssetViewer', undefined, ...args);
        const renderTimelineToResult = (...args) => call(actionSource, 'renderTimelineToResult', undefined, ...args);
        const replaceNodeImage = (...args) => call(actionSource, 'replaceNodeImage', undefined, ...args);
        const openLayerForgeForNode = (...args) => call(actionSource, 'openLayerForgeForNode', undefined, ...args);
        const deleteResultNode = (...args) => call(actionSource, 'deleteResultNode', undefined, ...args);
        const renderGenerationMetadataInspectorSection = (...args) => call(
            renderSource,
            'renderGenerationMetadataInspectorSection',
            '',
            ...args
        );
        const renderInspector = (...args) => call(renderSource, 'renderInspector', undefined, ...args);
        const escapeHtml = (value) => call(utilitySource, 'escapeHtml', String(value ?? ''), value);
        const getLanguageState = () => call(languageSource, 'getLanguageState', { __lang: 'en' });
        const t = (english, chinese) => call(
            languageSource,
            't',
            chinese || english,
            english,
            chinese,
            getLanguageState()
        );

        function getNodeRunErrorText(node) {
            const details = node?.error_details || {};
            const runs = Array.isArray(getProject().runs) ? getProject().runs : [];
            const run = runs.find(item => item.id === node?.producer?.run_id);
            const parts = [];
            [details.error, details.details, run?.error, run?.details].forEach((item) => {
                if (item && !parts.includes(String(item))) parts.push(String(item));
            });
            const errors = Array.isArray(details.errors) && details.errors.length
                ? details.errors
                : (Array.isArray(run?.errors) ? run.errors : []);
            errors.forEach((item) => {
                const text = typeof item === 'string'
                    ? item
                    : [item.slot, item.node_id, item.error].filter(Boolean).join(': ');
                if (text && !parts.includes(text)) parts.push(text);
            });
            return parts.join('\n');
        }

        function renderResultInspector(node) {
            const status = node.status || {};
            const asset = getSelectedResultAsset(node);
            const assets = Array.isArray(node.assets) ? node.assets : [];
            const state = String(status.state || '').toLowerCase();
            const active = isCanvasRunActiveState(state);
            const events = Array.isArray(node.run_events) ? node.run_events.slice(-8).reverse() : [];
            const assetPath = asset?.asset_relative_path || asset?.relative_path || asset?.path || '';
            const outputPath = asset?.output_path || '';
            const assetState = asset?.copied_to_assets
                ? t('Registered in canvas asset directory', '已登记到画布资产目录')
                : (asset ? t('Output file reference', '输出文件引用') : t('None', '无'));
            const errorDetails = getNodeRunErrorText(node);
            const mediaKind = assetMediaKind(asset || {});
            const mediaIcon = assetMediaIcon(asset || {});
            const convertLabel = mediaKind === 'video'
                ? t('To Video', '转为视频')
                : (mediaKind === 'audio' ? t('To Audio', '转为音频') : t('To Image', '转为图像'));
            const viewLabel = mediaKind === 'video'
                ? t('View Video', '查看视频')
                : (mediaKind === 'audio' ? t('Open Audio', '打开音频') : t('View Image', '查看图像'));
            const canLayerForge = !!asset && mediaKind === 'image';
            const isQwenResult = !!node.producer?.qwen_tts_node_id;
            const canRetry = !!(node.producer?.preset_node_id || node.producer?.qwen_tts_node_id);
            const canSkip = active && !isQwenResult;
            const canTimelineRender = !!node.producer?.timeline_node_id;
            const stale = isResultStale(node);
            return `
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Result Placeholder', '结果占位节点'))}</h3>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('State', '状态'))}</span><b>${escapeHtml(status.state || '')}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Freshness', '新鲜度'))}</span><b>${escapeHtml(stale ? t('Stale', '已过期') : t('Current', '当前'))}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Progress', '进度'))}</span><b>${Math.round(Number(status.percent || 0) * 100)}%</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Run ID', '运行 ID'))}</span><b>${escapeHtml(node.producer?.run_id || '')}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Task ID', '任务 ID'))}</span><b>${escapeHtml(node.producer?.task_id || '')}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Outputs', '输出'))}</span><b>${assets.length || (asset ? 1 : 0)}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Asset', '资源'))}</span><b>${escapeHtml(assetState)}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Size', '尺寸'))}</span><b>${escapeHtml(readAssetSize(asset))}</b></div>
  <div class="sai-inspector-path"><span>${escapeHtml(t('Path', '路径'))}</span><code>${escapeHtml(assetPath)}</code></div>
  ${outputPath && outputPath !== assetPath ? `<div class="sai-inspector-path"><span>${escapeHtml(t('Original', '原始路径'))}</span><code>${escapeHtml(outputPath)}</code></div>` : ''}
  ${stale ? `<div class="sai-inspector-note">${escapeHtml(t('This Result was produced from an older upstream fingerprint. Rerun the linked Preset or Timeline to refresh downstream inputs.', '该 Result 来自旧的上游指纹。请重新运行连接的 Preset 或 Timeline，再作为下游输入使用。'))}</div>` : ''}
  <div class="sai-inspector-note">${escapeHtml(t('Canvas assets stay on disk when you clear nodes. Use Asset Manager to manually delete unreferenced files; expiration-based cleanup can be configured later.', '清空节点不会删除磁盘资产。可在资产管理中手动删除未引用文件；后续可配置到期自动清理。'))}</div>
  <p>${escapeHtml(status.message || '')}</p>
</div>
${errorDetails ? `<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Failure Details', '失败详情'))}</h3>
  <div class="sai-run-history-error"><pre>${escapeHtml(errorDetails)}</pre></div>
</div>` : ''}
${events.length ? `<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Run Events', '运行事件'))}</h3>
  <div class="sai-run-event-list">${events.map(event => `
    <div class="sai-run-event" data-level="${escapeHtml(event.level || 'info')}">
      <span>${escapeHtml(event.ts || '')}</span>
      <b>${escapeHtml(event.level || 'info')}</b>
      <p>${escapeHtml(event.message || '')}</p>
    </div>`).join('')}</div>
</div>` : ''}
${renderGenerationMetadataInspectorSection(node)}
<div class="sai-inspector-actions">
  ${active ? `<button type="button" data-inspector-action="stop-run"><i class="fa-solid fa-stop"></i><span>${escapeHtml(t('Stop', '停止'))}</span></button>${canSkip ? `<button type="button" data-inspector-action="skip-run"><i class="fa-solid fa-forward-step"></i><span>${escapeHtml(t('Skip', '跳过'))}</span></button>` : ''}` : ''}
  ${canRetry ? `<button type="button" data-inspector-action="retry-run"><i class="fa-solid fa-rotate-right"></i><span>${escapeHtml(t('Retry', '重试'))}</span></button>` : ''}
  ${canTimelineRender ? `<button type="button" data-inspector-action="timeline-render-source"><i class="fa-solid fa-clapperboard"></i><span>${escapeHtml(t('Render Timeline', '渲染时间线'))}</span></button>` : ''}
  ${asset ? `<button type="button" data-inspector-action="result-to-media"><i class="fa-solid ${mediaIcon}"></i><span>${escapeHtml(convertLabel)}</span></button>` : ''}
  ${canLayerForge ? `<button type="button" data-inspector-action="layerforge-edit"><i class="fa-solid fa-layer-group"></i><span>${escapeHtml(t('LayerForge', 'LayerForge'))}</span></button>` : ''}
  ${assets.length > 1 ? `<button type="button" data-inspector-action="expand-results"><i class="fa-solid fa-table-cells-large"></i><span>${escapeHtml(t('Expand', '展开'))}</span></button>` : ''}
  <button type="button" data-inspector-action="view-asset"><i class="fa-solid fa-magnifying-glass-plus"></i><span>${escapeHtml(viewLabel)}</span></button>
  <button type="button" data-inspector-action="replace-image"><i class="fa-solid fa-arrows-rotate"></i><span>${escapeHtml(t('Replace', '替换'))}</span></button>
  <button type="button" data-inspector-action="delete" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete', '删除'))}</span></button>
</div>`;
        }

        function handleResultInspectorAction(node, action, actionElement, evt) {
            if (!node || node.type !== 'result') return false;
            if (action === 'stop-run') {
                controlResultRun(node, 'stop');
                return true;
            }
            if (action === 'skip-run') {
                controlResultRun(node, 'skip');
                return true;
            }
            if (action === 'retry-run') {
                retryResultRun(node);
                return true;
            }
            if (action === 'timeline-render-source') {
                renderTimelineToResult(getNode(node.producer?.timeline_node_id));
                return true;
            }
            if (action === 'view-asset') {
                openAssetViewer(getSelectedResultAsset(node), node.title || 'Result');
                return true;
            }
            if (action === 'result-to-media' || action === 'result-to-image') {
                convertResultToMediaNode(node);
                return true;
            }
            if (action === 'expand-results') {
                expandResultAssetsToMediaNodes(node);
                return true;
            }
            if (action === 'replace-image') {
                replaceNodeImage(node);
                return true;
            }
            if (action === 'layerforge-edit') {
                openLayerForgeForNode(node);
                return true;
            }
            if (action === 'delete') {
                deleteResultNode(node);
                return true;
            }
            return false;
        }

        function refreshActiveResultInspector() {
            const selectedNodeId = getSelectedNodeId();
            if (!selectedNodeId) return false;
            const node = getNode(selectedNodeId);
            if (!node || node.type !== 'result' || !isCanvasRunActiveState(nodeStatusState(node))) return false;
            renderInspector();
            return true;
        }

        return {
            getNodeRunErrorText,
            renderResultInspector,
            handleResultInspectorAction,
            refreshActiveResultInspector
        };
    }

    window.SimpAICanvasWorkbenchResultInspector = Object.assign(
        {},
        window.SimpAICanvasWorkbenchResultInspector || {},
        { createCanvasResultInspectorController }
    );
})();
