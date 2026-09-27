(function () {
    'use strict';

    function renderWorkbenchIconHtml(icon, escapeHtml) {
        const escape = typeof escapeHtml === 'function' ? escapeHtml : (value => String(value ?? ''));
        if (icon === 'sai-compare-glyph') return '<span class="sai-compare-glyph" aria-hidden="true"></span>';
        if (icon === 'sai-tag-cart-glyph') return '<span class="sai-node-glyph sai-tag-cart-glyph" aria-hidden="true"><i class="fa-solid fa-clone"></i></span>';
        if (icon === 'sai-wd14-glyph') return '<span class="sai-node-glyph sai-wd14-glyph" aria-hidden="true"><i class="fa-solid fa-tags"></i></span>';
        if (icon === 'sai-vlm-glyph') return '<span class="sai-node-glyph sai-vlm-glyph" aria-hidden="true"><i class="fa-solid fa-comments"></i></span>';
        return `<i class="fa-solid ${escape(icon || 'fa-circle')}"></i>`;
    }

    function detectWorkbenchTheme(state) {
        const source = state || {};
        const params = source.themeParams && typeof source.themeParams === 'object' ? source.themeParams : {};
        const theme = String(params.__theme || source.documentElementTheme || source.bodyTheme || '').toLowerCase();
        if (theme.includes('dark')) return 'dark';
        if (theme.includes('light')) return 'light';
        if (source.documentElementDark || source.bodyDark) return 'dark';
        return 'light';
    }

    function applyWorkbenchThemeClass(root, theme) {
        if (!root) return;
        root.dataset.canvasTheme = theme;
        root.classList.toggle('theme-dark', theme === 'dark');
        root.classList.toggle('theme-light', theme !== 'dark');
    }

    function ensureWorkbenchFormFieldNames(scope, prefix, context) {
        if (!scope || !scope.querySelectorAll) return;
        const safePrefix = String(prefix || 'canvas').replace(/[^a-z0-9_-]+/gi, '_');
        scope.querySelectorAll('input,select,textarea').forEach((field, index) => {
            if (field.id || field.name) return;
            const key = field.getAttribute('data-node-param')
                || field.getAttribute('data-config-param')
                || field.getAttribute('data-inspector-param')
                || field.getAttribute('data-inspector-node-field')
                || field.getAttribute('data-config-lora-model')
                || field.getAttribute('data-config-lora-weight')
                || field.getAttribute('data-config-lora-enabled')
                || field.getAttribute('data-mask-size')
                || field.getAttribute('data-palette-search')
                || field.type
                || field.tagName.toLowerCase();
            field.name = `simpai_${safePrefix}_${String(key).replace(/[^a-z0-9_-]+/gi, '_')}_${index}`;
        });
        const document = typeof context?.getDocument === 'function' ? context.getDocument() : null;
        const cssEscape = typeof context?.cssEscape === 'function' ? context.cssEscape : value => String(value);
        scope.querySelectorAll('label[for]').forEach((label) => {
            const target = label.getAttribute('for');
            if (target && !scope.querySelector(`#${cssEscape(target)}`) && !document?.getElementById?.(target)) {
                label.removeAttribute('for');
            }
        });
    }

    function createCanvasWorkbenchShellRenderer(context) {
        const source = context || {};
        const domSource = source.domSource || {};
        const formSource = source.formSource || {};
        const lifecycleSource = source.lifecycleSource || {};
        const t = typeof source.t === 'function' ? source.t : ((en, cn) => cn || en);
        const escapeHtml = typeof source.escapeHtml === 'function' ? source.escapeHtml : (value => String(value ?? ''));
        const renderIconHtml = typeof source.renderIconHtml === 'function'
            ? source.renderIconHtml
            : (icon => renderWorkbenchIconHtml(icon, escapeHtml));
        const toolbarButton = (action, icon, title) => `<button type="button" data-canvas-action="${action}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${renderIconHtml(icon)}</button>`;
        const sideButton = (action, icon, title) => `<button type="button" data-canvas-action="${action}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${renderIconHtml(icon)}</button>`;

        function renderWorkbenchShellMarkup() {
            return `
<div class="sai-canvas-topbar">
  <div class="sai-canvas-topbar-main">
    <div class="sai-canvas-brand">
      <div class="sai-canvas-title">${escapeHtml(t('SimpAI Infinite Canvas', 'SimpAI 无限画布'))}</div>
      <div class="sai-canvas-subtitle" data-canvas-status>${escapeHtml(t('0 nodes', '0 个节点'))}</div>
    </div>
    <button type="button" class="sai-canvas-demo-entry" data-canvas-action="load-demo-workbench" title="${escapeHtml(t('Template library', '模板库'))}" aria-label="${escapeHtml(t('Template library', '模板库'))}">
      <i class="fa-solid fa-route" aria-hidden="true"></i>
      <span>${escapeHtml(t('Template library', '模板库'))}</span>
    </button>
    <div class="sai-canvas-system-info" data-canvas-system-info aria-label="${escapeHtml(t('System status', '系统状态'))}"></div>
    <button type="button" class="sai-run-queue-widget" data-canvas-action="run-queue" data-run-queue-widget title="${escapeHtml(t('Run queue', '运行队列'))}" aria-label="${escapeHtml(t('Run queue', '运行队列'))}"></button>
  </div>
  <div class="sai-canvas-toolbar" aria-label="${escapeHtml(t('Canvas tools', '画布工具'))}">
    ${toolbarButton('save', 'fa-floppy-disk', t('Save', '保存'))}
    ${toolbarButton('project-list', 'fa-folder-tree', t('Workbench list', '工作台列表'))}
    ${toolbarButton('import-project-json', 'fa-file-import', t('Import workbench JSON', '导入工作台 JSON'))}
    <span class="sai-toolbar-separator" aria-hidden="true"></span>
    ${toolbarButton('undo', 'fa-rotate-left', t('Undo', '撤销'))}
    ${toolbarButton('redo', 'fa-rotate-right', t('Redo', '重做'))}
    <span class="sai-toolbar-separator" aria-hidden="true"></span>
    <button type="button" data-canvas-action="run-selected-chain" title="${escapeHtml(t('Run selected chain', '运行选中链路'))}" aria-label="${escapeHtml(t('Run selected chain', '运行选中链路'))}"><i class="fa-solid fa-forward"></i></button>
    ${toolbarButton('delete', 'fa-trash', t('Delete selected items', '删除选中项'))}
    ${toolbarButton('clear', 'fa-broom', t('Clear canvas', '清空画布'))}
    <span class="sai-toolbar-separator" aria-hidden="true"></span>
    ${toolbarButton('settings', 'fa-sliders', t('Settings', '设置'))}
    ${toolbarButton('close', 'fa-xmark', t('Close', '关闭'))}
  </div>
</div>
<div class="sai-canvas-backend-alert" data-canvas-backend-alert hidden></div>
<div class="sai-canvas-body">
  <div class="sai-canvas-leftbar" aria-label="${escapeHtml(t('Canvas utilities', '画布工具栏'))}">
    ${sideButton('node-search', 'fa-magnifying-glass-location', t('Search / jump to node', '搜索 / 跳转节点'))}
    <span class="sai-leftbar-separator" aria-hidden="true"></span>
    ${sideButton('add-preset', 'fa-diagram-project', t('Add preset', '添加预设'))}
    ${sideButton('add-style-selector', 'fa-palette', t('Add Style Selector node', '添加风格选择器节点'))}
    ${sideButton('add-text', 'fa-font', t('Add text node', '添加文本节点'))}
    ${sideButton('add-text-merge', 'fa-code-merge', t('Add multi-text merge node', '添加多文本合并节点'))}
    ${sideButton('add-wildcards-helper', 'fa-dice', t('Add Wildcards Helper node', '添加通配符小助手节点'))}
    ${sideButton('add-translation', 'fa-language', t('Add translation node', '添加翻译节点'))}
    ${sideButton('add-tag-cart', 'sai-tag-cart-glyph', t('Add Tag Cart node', '添加标签选择器节点'))}
    ${sideButton('add-wd14', 'sai-wd14-glyph', t('Add WD14 node', '添加 WD14 节点'))}
    ${sideButton('add-vlm', 'sai-vlm-glyph', t('Add VLM node', '添加 VLM 节点'))}
    ${sideButton('add-qwen-tts', 'fa-microphone-lines', t('Add Qwen TTS node', '添加 Qwen TTS 节点'))}
    ${sideButton('add-sam3-video-mask', 'fa-wand-magic-sparkles', t('Add SAM3 video mask node', '添加 SAM3 视频遮罩节点'))}
    ${sideButton('add-camera-motion', 'fa-camera-rotate', t('Add Uni3C Camera Motion node', '添加 Uni3C 运镜节点'))}
    ${sideButton('add-pose-studio', 'fa-person', t('Add Pose Studio node', '添加 Pose Studio 节点'))}
    ${sideButton('add-gaussian-studio', 'fa-cube', t('Add Gaussian Studio node', '添加 Gaussian Studio 节点'))}
    ${sideButton('add-liveportrait-expression', 'fa-face-smile', t('Add LivePortrait Exp node', '添加 LivePortrait Exp 节点'))}
    ${sideButton('add-compare', 'sai-compare-glyph', t('Add image compare node', '添加图像对比节点'))}
    ${sideButton('add-timeline', 'fa-clapperboard', t('Add media timeline', '添加媒体时间线'))}
    ${sideButton('add-output', 'fa-circle-dot', t('Add output node', '添加输出节点'))}
    <span class="sai-leftbar-separator" aria-hidden="true"></span>
    ${sideButton('add-note', 'fa-note-sticky', t('Add tip note', '添加提示贴'))}
    ${sideButton('add-group', 'fa-object-group', t('Add area group', '添加区域分组'))}
    ${sideButton('group-list', 'fa-list-ul', t('Jump to group', '跳转分组'))}
    ${sideButton('load-demo-workbench', 'fa-route', t('Template library', '模板库'))}
    <span class="sai-leftbar-separator" aria-hidden="true"></span>
    ${sideButton('import-selected', 'fa-images', t('Import transfer station images', '导入中转站图片'))}
    ${sideButton('media-browser', 'fa-photo-film', t('Media browser', '媒体浏览器'))}
    <button type="button" data-canvas-action="import-files" title="${escapeHtml(t('Import image / video / audio', '导入图像 / 视频 / 音频'))}" aria-label="${escapeHtml(t('Import image / video / audio', '导入图像 / 视频 / 音频'))}"><i class="fa-solid fa-folder-open"></i></button>
    <span class="sai-leftbar-separator" data-leftbar-section="utility" aria-hidden="true"></span>
    ${sideButton('asset-manager', 'fa-box-archive', t('Asset manager', '资产管理'))}
    ${sideButton('run-history', 'fa-clock-rotate-left', t('Run history', '运行历史'))}
    ${sideButton('canvas-manual', 'fa-circle-question', t('Canvas manual', '画布说明书'))}
  </div>
  <div class="sai-canvas-viewport" tabindex="0">
    <div class="sai-canvas-stage">
      <div class="sai-canvas-groups"></div>
      <canvas class="sai-canvas-edges-canvas" aria-hidden="true"></canvas>
      <svg class="sai-canvas-edges" aria-hidden="true">
        <path class="sai-canvas-temp-edge" d="" hidden></path>
      </svg>
      <div class="sai-canvas-nodes"></div>
      <div class="sai-chain-run-overlay" hidden>
        <button type="button" data-canvas-action="run-selected-chain" title="${escapeHtml(t('Run selected chain', '运行选中链路'))}" aria-label="${escapeHtml(t('Run selected chain', '运行选中链路'))}"><i class="fa-solid fa-play"></i></button>
      </div>
      <div class="sai-outpaint-overlay" hidden>
        <div class="sai-outpaint-outer"></div>
        <div class="sai-outpaint-inner"></div>
        <div class="sai-outpaint-edge" data-edge="top"></div>
        <div class="sai-outpaint-edge" data-edge="bottom"></div>
        <div class="sai-outpaint-edge" data-edge="left"></div>
        <div class="sai-outpaint-edge" data-edge="right"></div>
        <div class="sai-outpaint-label" data-dim="top"></div>
        <div class="sai-outpaint-label" data-dim="bottom"></div>
        <div class="sai-outpaint-label" data-dim="left"></div>
        <div class="sai-outpaint-label" data-dim="right"></div>
      </div>
    </div>
    <section class="sai-canvas-agent-panel" data-canvas-agent-panel aria-label="${escapeHtml(t('Canvas Agent', '画布 Agent'))}"></section>
  </div>
  <aside class="sai-canvas-inspector" aria-label="${escapeHtml(t('Inspector', '检查器'))}"></aside>
  <button type="button" class="sai-inspector-drawer-toggle" data-canvas-action="toggle-inspector" title="${escapeHtml(t('Hide inspector', '隐藏检查器'))}" aria-label="${escapeHtml(t('Hide inspector', '隐藏检查器'))}"><i class="fa-solid fa-chevron-right"></i></button>
</div>
<div class="sai-canvas-nav">
  ${toolbarButton('zoom-out', 'fa-minus', t('Zoom out', '缩小'))}
  <button class="sai-canvas-zoom-label" type="button" data-canvas-action="zoom-reset" title="${escapeHtml(t('Reset zoom', '重置缩放'))}">100%</button>
  ${toolbarButton('zoom-in', 'fa-plus', t('Zoom in', '放大'))}
  ${toolbarButton('fit-all', 'fa-expand', t('Fit all', '适配全部'))}
  ${toolbarButton('center', 'fa-crosshairs', t('Center', '回中'))}
</div>
<div class="sai-canvas-minimap" hidden>
  <div class="sai-minimap-head"><span>${escapeHtml(t("Bird's-eye", '鸟瞰图'))}</span><button type="button" data-canvas-action="toggle-minimap" title="${escapeHtml(t('Close minimap', '关闭鸟瞰图'))}"><i class="fa-solid fa-xmark"></i></button></div>
  <svg class="sai-minimap-svg" viewBox="0 0 180 124" aria-hidden="true"></svg>
</div>
<div class="sai-canvas-palette" hidden>
  <div class="sai-canvas-palette-box">
    <div class="sai-canvas-palette-head">
      <span>${escapeHtml(t('Add preset', '添加预设'))}</span>
      <button type="button" data-palette-close aria-label="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <input class="sai-canvas-palette-search" type="search" placeholder="${escapeHtml(t('Search preset', '搜索预设'))}" autocomplete="off" />
    <div class="sai-canvas-palette-list"></div>
  </div>
</div>
<div class="sai-canvas-context-menu" hidden></div>
<section class="sai-canvas-settings-panel" hidden aria-label="${escapeHtml(t('Canvas Settings', '画布设置'))}"></section>
<section class="sai-run-queue-panel" hidden aria-label="${escapeHtml(t('Run Queue', '运行队列'))}"></section>
<section class="sai-run-history-panel" hidden aria-label="${escapeHtml(t('Run History', '运行历史'))}"></section>
<div class="sai-canvas-perf-hud" data-canvas-perf-hud aria-label="${escapeHtml(t('Canvas performance', '画布性能'))}"></div>
<div class="sai-canvas-toast" hidden></div>
`;
        }

        function ensureRuntimeStyles() {
            const document = typeof domSource.getDocument === 'function' ? domSource.getDocument() : null;
            if (!document || !document.head || typeof document.getElementById !== 'function') return false;
            if (document.getElementById('simpai-canvas-runtime-style')) return false;
            const style = document.createElement('style');
            style.id = 'simpai-canvas-runtime-style';
            style.textContent = "\n.sai-canvas-viewport.is-panning .sai-canvas-stage,\n.sai-canvas-viewport.is-zooming .sai-canvas-stage { will-change: transform; }\n.sai-canvas-viewport.is-panning .sai-canvas-stage,\n.sai-canvas-viewport.is-panning .sai-canvas-node { text-rendering: optimizeSpeed; }\n.sai-canvas-viewport.is-panning .sai-canvas-node {\n  pointer-events: none;\n  transition: none !important;\n  filter: none !important;\n  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18) !important;\n}\n.sai-canvas-viewport.is-panning .sai-canvas-node::before,\n.sai-canvas-viewport.is-panning .sai-canvas-node::after { display: none !important; }\n";
            document.head.appendChild(style);
            return true;
        }

        function mountWorkbenchShell() {
            const document = typeof domSource.getDocument === 'function' ? domSource.getDocument() : null;
            if (!document || typeof document.createElement !== 'function') return null;
            const root = document.createElement('div');
            root.id = 'simpai-infinite-canvas-workbench';
            root.className = 'sai-canvas-workbench';
            root.hidden = true;
            root.innerHTML = renderWorkbenchShellMarkup();
            if (typeof formSource.ensureWorkbenchFormFieldNames === 'function') {
                formSource.ensureWorkbenchFormFieldNames(root, 'root');
            }
            document.body.appendChild(root);
            const query = (selector) => root.querySelector(selector);
            return {
                root,
                viewport: query('.sai-canvas-viewport'),
                stage: query('.sai-canvas-stage'),
                groupsLayer: query('.sai-canvas-groups'),
                edgesCanvas: query('.sai-canvas-edges-canvas'),
                edgesLayer: query('.sai-canvas-edges'),
                tempEdge: query('.sai-canvas-temp-edge'),
                nodesLayer: query('.sai-canvas-nodes'),
                chainRunOverlay: query('.sai-chain-run-overlay'),
                outpaintOverlayEl: query('.sai-outpaint-overlay'),
                canvasAgentPanel: query('[data-canvas-agent-panel]'),
                inspector: query('.sai-canvas-inspector'),
                palette: query('.sai-canvas-palette'),
                contextMenu: query('.sai-canvas-context-menu'),
                canvasSettingsPanel: query('.sai-canvas-settings-panel'),
                runQueuePanel: query('.sai-run-queue-panel'),
                runQueueWidget: query('[data-run-queue-widget]'),
                runHistoryPanel: query('.sai-run-history-panel'),
                minimapEl: query('.sai-canvas-minimap'),
                toastEl: query('.sai-canvas-toast'),
                systemInfoEl: query('[data-canvas-system-info]'),
                backendAlertEl: query('[data-canvas-backend-alert]'),
                perfHudEl: query('[data-canvas-perf-hud]'),
                zoomLabel: query('.sai-canvas-zoom-label')
            };
        }

        function syncStandaloneCanvasControls() {
            const root = typeof lifecycleSource.getRoot === 'function' ? lifecycleSource.getRoot() : null;
            if (!root) return;
            const isStandalone = typeof lifecycleSource.isStandaloneCanvasWorkbench === 'function'
                ? !!lifecycleSource.isStandaloneCanvasWorkbench()
                : false;
            root.classList.toggle('is-standalone-page', isStandalone);
            const closeButton = root.querySelector('[data-canvas-action="close"]');
            if (!closeButton) return;
            if (isStandalone) {
                closeButton.disabled = false;
                closeButton.dataset.standaloneClose = 'true';
                closeButton.setAttribute('aria-disabled', 'true');
                closeButton.title = t('Standalone page stays open until the browser tab is closed.', '独立页面需要关闭浏览器标签。');
                closeButton.setAttribute('aria-label', closeButton.title);
            } else {
                closeButton.disabled = false;
                delete closeButton.dataset.standaloneClose;
                closeButton.removeAttribute('aria-disabled');
            }
        }

        return {
            renderWorkbenchShellMarkup,
            ensureRuntimeStyles,
            mountWorkbenchShell,
            syncStandaloneCanvasControls,
            detectWorkbenchTheme,
            applyWorkbenchThemeClass
        };
    }

    window.SimpAICanvasWorkbenchShellRenderer = Object.assign({}, window.SimpAICanvasWorkbenchShellRenderer || {}, {
        createCanvasWorkbenchShellRenderer,
        renderWorkbenchIconHtml,
        detectWorkbenchTheme,
        applyWorkbenchThemeClass,
        ensureWorkbenchFormFieldNames
    });
})();
