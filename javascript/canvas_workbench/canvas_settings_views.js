(function () {
    'use strict';

    function createCanvasSettingsViewsController(context) {
        const scope = context?.settingsViewsSource || context || {};
        const languageSource = scope.languageSource || {};
        const utilitySource = scope.utilitySource || {};
        const t = languageSource.t || ((en, cn) => cn || en);
        const escapeHtml = utilitySource.escapeHtml || (value => String(value ?? ''));

        const COLOR_PRESETS = [
            {
                id: 'jade',
                surface: '#161a22',
                surfaceTop: '#1e2530',
                glow: 'rgba(28, 155, 142, 0.24)',
                accent: '#1c9b8e',
                titleEn: 'Ice Jade',
                titleCn: '通透青翠',
                descEn: 'Muted sea-jade & slate',
                descCn: '沉静雾青 · 板岩灰'
            },
            {
                id: 'indigo',
                surface: '#161822',
                surfaceTop: '#1e2131',
                glow: 'rgba(86, 98, 201, 0.25)',
                accent: '#5662c9',
                titleEn: 'Graphite Indigo',
                titleCn: '石墨靛蓝',
                descEn: 'Deep graphite & slate indigo',
                descCn: '深邃冷灰 · 低饱和靛蓝'
            },
            {
                id: 'obsidian',
                surface: '#161619',
                surfaceTop: '#202126',
                glow: 'rgba(72, 130, 173, 0.22)',
                accent: '#4882ad',
                titleEn: 'Obsidian Neutral',
                titleCn: '极简黑曜石',
                descEn: 'Pure zinc & steel blue',
                descCn: '暗曜锌灰 · 柔和钢蓝'
            },
            {
                id: 'amber',
                surface: '#191715',
                surfaceTop: '#24201c',
                glow: 'rgba(184, 123, 42, 0.25)',
                accent: '#b87b2a',
                titleEn: 'Titanium Amber',
                titleCn: '暖调琥珀',
                descEn: 'Warm charcoal & bronze',
                descCn: '深暖炭灰 · 暗金古铜'
            }
        ];

        function normalizeColorPreset(value) {
            const normalized = String(value || '').trim().toLowerCase();
            return COLOR_PRESETS.some(item => item.id === normalized) ? normalized : 'jade';
        }

        function renderCanvasSettingsGeneralTab(projectSettings) {
            const settings = projectSettings || {};
            const activePreset = normalizeColorPreset(settings.colorPreset);
            const labels = {
                grid: t('Show grid', '显示网格'),
                snap: t('Enable snapping', '开启吸附'),
                minimap: t('Show minimap', '显示鸟瞰图'),
                edgeLabels: t('Show edge labels', '显示连线标签'),
                reducedMotion: t('Reduce motion', '减少动画')
            };
            const paletteCards = COLOR_PRESETS.map((item) => {
                const isActive = item.id === activePreset;
                return `<button type="button" class="sai-settings-palette-card ${isActive ? 'is-active' : ''}" data-canvas-settings-action="palette:${escapeHtml(item.id)}" aria-pressed="${isActive ? 'true' : 'false'}"><span class="sai-settings-palette-swatch" style="--swatch-surface:${escapeHtml(item.surface)};--swatch-surface-top:${escapeHtml(item.surfaceTop)};--swatch-glow:${escapeHtml(item.glow)};--swatch-accent:${escapeHtml(item.accent)};" aria-hidden="true"></span><span class="sai-settings-palette-copy"><strong>${escapeHtml(t(item.titleEn, item.titleCn))}</strong><small>${escapeHtml(t(item.descEn, item.descCn))}</small></span></button>`;
            }).join('');
            return `
    <section class="sai-settings-section">
      <h3>${escapeHtml(t('Color Theme', '配色方案'))}</h3>
      <div class="sai-settings-palette-grid" role="group" aria-label="${escapeHtml(t('Color Theme', '配色方案'))}">
        ${paletteCards}
      </div>
    </section>
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
