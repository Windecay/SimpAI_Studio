(function () {
    'use strict';

    function createCanvasSettingsViewsController(context) {
        const scope = context || {};
        const t = scope.t || ((en, cn) => cn || en);
        const escapeHtml = scope.escapeHtml || (value => String(value ?? ''));

        function renderCanvasSettingsGeneralTab(projectSettings) {
            const settings = projectSettings || {};
            const labels = {
                grid: t('Show grid', '显示网格'),
                snap: t('Enable snapping', '开启吸附'),
                minimap: t('Show minimap', '显示鸟瞰图'),
                edgeLabels: t('Show edge labels', '显示连线标签'),
                reducedMotion: t('Reduce motion', '减少动画')
            };
            return `
    <section class="sai-settings-section">
      <h3>${escapeHtml(t('Canvas View', '画布视图'))}</h3>
      ${['grid', 'snap', 'minimap', 'edgeLabels', 'reducedMotion'].map(key => `<label class="sai-settings-check"><input type="checkbox" data-canvas-settings-action="toggle:${escapeHtml(key)}" ${settings[key] ? 'checked' : ''}><span>${escapeHtml(labels[key])}</span></label>`).join('')}
    </section>
    <section class="sai-settings-section">
      <h3>${escapeHtml(t('Project', '项目'))}</h3>
      <div class="sai-settings-actions">
        <button type="button" data-canvas-settings-action="load-demo"><i class="fa-solid fa-route"></i><span>${escapeHtml(t('Template library', '模板库'))}</span></button>
        <button type="button" data-canvas-settings-action="save-current-template"><i class="fa-solid fa-floppy-disk"></i><span>${escapeHtml(t('Save as template', '保存为模板'))}</span></button>
        <button type="button" data-canvas-settings-action="clear-browser-cache"><i class="fa-solid fa-eraser"></i><span>${escapeHtml(t('Clear browser cache', '清空浏览器缓存'))}</span></button>
        <button type="button" class="danger" data-canvas-settings-action="clear-project-file"><i class="fa-solid fa-file-circle-xmark"></i><span>${escapeHtml(t('Clear current project file', '清空当前项目文件'))}</span></button>
      </div>
    </section>`;
        }

        function renderCanvasSettingsPanel(options) {
            const opts = options || {};
            const tab = opts.tab || 'agent';
            const agentHtml = String(opts.agentHtml || '');
            return `
<div class="sai-canvas-settings-head">
  <strong>${escapeHtml(t('Canvas Settings', '画布设置'))}</strong>
  <button type="button" data-canvas-settings-action="close" title="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-canvas-settings-body">
  <nav class="sai-canvas-settings-tabs" aria-label="${escapeHtml(t('Settings tabs', '设置页签'))}">
    <button type="button" data-canvas-settings-tab="agent" class="${tab === 'agent' ? 'is-active' : ''}"><i class="fa-solid fa-wand-magic-sparkles"></i><span>${escapeHtml(t('Agent', 'Agent'))}</span></button>
    <button type="button" data-canvas-settings-tab="general" class="${tab === 'general' ? 'is-active' : ''}"><i class="fa-solid fa-sliders"></i><span>${escapeHtml(t('Canvas', '画布'))}</span></button>
  </nav>
  <div class="sai-canvas-settings-content">
    ${tab === 'agent' ? agentHtml : renderCanvasSettingsGeneralTab(opts.projectSettings)}
  </div>
</div>`;
        }

        return {
            renderCanvasSettingsGeneralTab,
            renderCanvasSettingsPanel
        };
    }

    window.SimpAICanvasWorkbenchSettingsViews = Object.assign({}, window.SimpAICanvasWorkbenchSettingsViews || {}, {
        createCanvasSettingsViewsController
    });
})();
