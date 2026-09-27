(function () {
    'use strict';

    function createCanvasAdvancedConfigRenderer(context) {
        const source = context?.advancedConfigRendererSource || context || {};
        const call = (name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const escapeHtml = value => call('escapeHtml', String(value ?? ''), value);
        const translate = (...args) => call('t', args[1] || args[0] || '', ...args);
        const optionHtml = (...args) => call('optionHtml', '', ...args);

        function renderAdvancedConfigNodeHtml(node) {
            const values = node.config?.values || {};
            const overwriteStepProps = call('getSceneGenerationConfigPropsForConfigNode', {}, node, 'overwrite_step') || {};
            const overwriteStepBounds = {
                min: Number.isFinite(Number(overwriteStepProps.min)) ? Number(overwriteStepProps.min) : -1,
                max: Number.isFinite(Number(overwriteStepProps.max)) ? Number(overwriteStepProps.max) : 200,
                step: Number.isFinite(Number(overwriteStepProps.step)) ? Number(overwriteStepProps.step) : 1,
            };
            const overwriteStepReadonly = overwriteStepProps.interactive === false;
            const overwriteStepFixedValue = overwriteStepReadonly
                ? (overwriteStepProps.value ?? call('getSceneGenerationConfigDefaultForConfigNode', undefined, node, 'overwrite_step'))
                : undefined;
            const overwriteStepValues = overwriteStepReadonly && overwriteStepFixedValue !== undefined
                ? { overwrite_step: overwriteStepFixedValue }
                : values;
            const overwriteStepDisabled = overwriteStepReadonly ? ' disabled aria-disabled="true"' : '';
            const guidance = call('configNumberValue', 4, values, ['guidance_scale', 'cfg_scale'], 4);
            const overwriteStep = call('boundedConfigNumberValue', -1, overwriteStepValues, ['overwrite_step', 'steps'], -1, overwriteStepBounds);
            const sampler = call('configTextValue', 'dpmpp_2m_sde_gpu', values, ['sampler_name', 'sampler'], 'dpmpp_2m_sde_gpu');
            const scheduler = call('configTextValue', 'karras', values, ['scheduler_name', 'scheduler'], 'karras');
            const samplerChoices = call('mergeChoices', [sampler], [
                sampler,
                ...call('getSelectOptionsFromDom', [], 'sampler_name', call('getSamplerChoices', []))
            ]);
            const schedulerChoices = call('mergeChoices', [scheduler], [
                scheduler,
                ...call('getSelectOptionsFromDom', [], 'scheduler_name', call('getSchedulerChoices', []))
            ]);
            const nodeBadges = call('renderNodeStateBadges', '', node);

            return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtml(translate('Advanced', '高级'))}</span>
  <span class="sai-node-title">${escapeHtml(node.title || translate('Advanced Config', '高级配置'))}</span>
  ${nodeBadges}
  <button type="button" data-node-action="delete" title="${escapeHtml(translate('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-config-node-body sai-advanced-config-body">
  <label class="sai-node-field sai-node-range"><span>${escapeHtml(translate('Guidance Scale', '引导强度'))}</span><div class="sai-range-pair"><input data-config-param="guidance_scale" type="range" min="0.01" max="100" step="0.01" value="${escapeHtml(guidance)}"><input data-config-param="guidance_scale" type="number" min="0.01" max="100" step="0.01" value="${escapeHtml(guidance)}"></div></label>
  <label class="sai-node-field sai-node-range sai-collapsed-keep"><span>${escapeHtml(translate('Forced Sampling Steps', '强制采样步数'))}</span><div class="sai-range-pair"><input data-config-param="overwrite_step" type="range" min="${escapeHtml(overwriteStepBounds.min)}" max="${escapeHtml(overwriteStepBounds.max)}" step="${escapeHtml(overwriteStepBounds.step)}" value="${escapeHtml(overwriteStep)}"${overwriteStepDisabled}><input data-config-param="overwrite_step" type="number" min="${escapeHtml(overwriteStepBounds.min)}" max="${escapeHtml(overwriteStepBounds.max)}" step="${escapeHtml(overwriteStepBounds.step)}" value="${escapeHtml(overwriteStep)}"${overwriteStepDisabled}></div></label>
  <div class="sai-inspector-grid2">
    <label class="sai-node-field"><span>${escapeHtml(translate('Sampler', '采样器'))}</span><select data-config-param="sampler_name">${optionHtml(samplerChoices, sampler)}</select></label>
    <label class="sai-node-field"><span>${escapeHtml(translate('Scheduler', '调度器'))}</span><select data-config-param="scheduler_name">${optionHtml(schedulerChoices, scheduler)}</select></label>
  </div>
</div>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="config" title="${escapeHtml(translate('Config output', '配置输出'))}"></button>`;
        }

        return { renderAdvancedConfigNodeHtml };
    }

    window.SimpAICanvasWorkbenchAdvancedConfigRenderer = { createCanvasAdvancedConfigRenderer };
})();
