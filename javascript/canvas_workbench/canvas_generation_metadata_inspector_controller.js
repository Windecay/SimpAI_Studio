(function () {
    'use strict';

    function createCanvasGenerationMetadataInspectorController(context) {
        const scope = context?.generationMetadataInspectorSource || context || {};
        const metadataSource = scope.metadataSource || {};
        const browserSource = scope.browserSource || {};
        const utilitySource = scope.utilitySource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const metadataCall = (name, fallback, ...args) => call(metadataSource, name, fallback, ...args);
        const escapeHtml = value => call(utilitySource, 'escapeHtml', String(value ?? ''), value);
        const toast = text => call(uiSource, 'showToast', undefined, text);
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };

        function renderGenerationMetadataInspectorSection(node) {
            const metadata = metadataCall('nodeGenerationMetadata', {}, node);
            const prompt = metadataCall('generationMetadataPrompt', '', metadata);
            const negativePrompt = metadataCall('generationMetadataNegativePrompt', '', metadata);
            const params = metadataCall('generationMetadataParameters', {}, metadata);
            if (!prompt && !negativePrompt && !Object.keys(params).length) return '';
            const target = metadataCall('resolveGenerationPromptTarget', null, node, { x: node?.x || 0, y: node?.y || 0 });
            const sourceLabel = [metadata.source, metadata.scheme].filter(Boolean).join(' / ') || t('metadata', '元数据');
            const paramText = Object.entries(params).slice(0, 10).map(([key, value]) => {
                const text = value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
                return `${key}: ${text}`;
            }).join('\n');
            return `
<div class="sai-inspector-section sai-generation-metadata">
  <h3>${escapeHtml(t('Generation Metadata', '生成元数据'))}</h3>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Source', '来源'))}</span><b>${escapeHtml(sourceLabel)}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Target', '目标'))}</span><b>${escapeHtml(target ? metadataCall('generationPromptTargetLabel', '', target) : t('Select a generator', '请选择生成节点'))}</b></div>
  ${prompt ? `<label>${escapeHtml(t('Prompt', '提示词'))}<textarea readonly rows="4">${escapeHtml(prompt)}</textarea></label>` : ''}
  ${negativePrompt ? `<label>${escapeHtml(t('Negative Prompt', '负面提示词'))}<textarea readonly rows="3">${escapeHtml(negativePrompt)}</textarea></label>` : ''}
  ${paramText ? `<code>${escapeHtml(paramText)}</code>` : ''}
</div>
<div class="sai-inspector-actions">
  ${prompt ? `<button type="button" data-inspector-action="metadata-copy-prompt"><i class="fa-solid fa-copy"></i><span>${escapeHtml(t('Copy prompt', '复制提示词'))}</span></button>` : ''}
  ${prompt || negativePrompt ? `<button type="button" data-inspector-action="metadata-to-generator"><i class="fa-solid fa-pen-to-square"></i><span>${escapeHtml(t('Fill generator', '填入生成节点'))}</span></button>` : ''}
</div>`;
        }

        async function copyNodeGenerationMetadataPrompt(node) {
            const prompt = metadataCall('generationMetadataPrompt', '', metadataCall('nodeGenerationMetadata', {}, node));
            if (!prompt) {
                toast(t('This node has no prompt metadata.', '这个节点没有提示词元数据。'));
                return false;
            }
            try {
                await call(browserSource, 'writeClipboardText', undefined, prompt);
                toast(t('Prompt copied.', '提示词已复制。'));
                return true;
            } catch (err) {
                toast(t('Copy failed.', '复制失败。'));
                return false;
            }
        }

        function applyNodeGenerationMetadataToPromptTarget(node) {
            const metadata = metadataCall('nodeGenerationMetadata', {}, node);
            const prompt = metadataCall('generationMetadataPrompt', '', metadata);
            const negativePrompt = metadataCall('generationMetadataNegativePrompt', '', metadata);
            if (!prompt && !negativePrompt) {
                toast(t('This node has no prompt metadata.', '这个节点没有提示词元数据。'));
                return false;
            }
            const target = metadataCall('resolveGenerationPromptTarget', null, node, { x: node?.x || 0, y: node?.y || 0 });
            if (!target) {
                toast(t('Select a Preset/Classic generator node first.', '请先选中一个 Preset/Classic 生成节点。'));
                return false;
            }
            return metadataCall('applyGenerationMetadataToPromptTarget', false, target, metadata, {
                sourceLabel: node?.title || node?.id || 'node metadata'
            });
        }

        return {
            renderGenerationMetadataInspectorSection, copyNodeGenerationMetadataPrompt,
            applyNodeGenerationMetadataToPromptTarget
        };
    }

    window.SimpAICanvasWorkbenchGenerationMetadataInspector = Object.assign(
        {}, window.SimpAICanvasWorkbenchGenerationMetadataInspector || {}, { createCanvasGenerationMetadataInspectorController }
    );
})();
