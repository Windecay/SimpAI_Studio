(function () {
    'use strict';

    const UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const escapeHtml = UTILS.escapeHtml || ((value) => String(value ?? ''));
    const t = UTILS.t || ((en, cn) => cn || en);

    function call(context, name, fallback, ...args) {
        return typeof context?.[name] === 'function' ? context[name](...args) : fallback;
    }

    function delegate(context, name) {
        if (typeof context?.[name] !== 'function') return undefined;
        return (...args) => context[name](...args);
    }

    function getProject(context) {
        const project = typeof context?.getProject === 'function' ? context.getProject() : null;
        return project && typeof project === 'object' ? project : {};
    }

    function createNodeBrowserContext(source) {
        const context = source || {};
        return {
            getProject: delegate(context, 'getProject'),
            closeContextMenu: delegate(context, 'closeContextMenu'),
            defaultNodeSize: delegate(context, 'defaultNodeSize'),
            detectWorkbenchTheme: delegate(context, 'detectWorkbenchTheme'),
            ensureWorkbenchFormFieldNames: delegate(context, 'ensureWorkbenchFormFieldNames'),
            getNode: delegate(context, 'getNode'),
            focusNode: delegate(context, 'focusNode'),
            readAssetSize: delegate(context, 'readAssetSize'),
            renderIconHtml: delegate(context, 'renderIconHtml')
        };
    }

    function iconForNode(node, context) {
        const type = String(node?.type || '');
        const custom = {
            compare: 'sai-compare-glyph',
            vlm: 'sai-vlm-glyph',
            wd14: 'sai-wd14-glyph',
            tag_cart: 'sai-tag-cart-glyph'
        };
        if (custom[type]) return call(context, 'renderIconHtml', '', custom[type]);
        const classes = {
            preset: 'fa-diagram-project',
            classic: 'fa-wand-magic-sparkles',
            result: 'fa-circle-dot',
            config: 'fa-sliders',
            style_selector: 'fa-palette',
            translation: 'fa-language',
            text: 'fa-font',
            text_merge: 'fa-code-merge',
            timeline: 'fa-clapperboard',
            director_timeline: 'fa-timeline',
            video: 'fa-film',
            audio: 'fa-wave-square',
            note: 'fa-note-sticky',
            mask: 'fa-paintbrush',
            sam3_video_mask: 'fa-crosshairs',
            pose_studio: 'fa-person',
            gaussian_studio: 'fa-cube',
            liveportrait_expression: 'fa-face-smile',
            qwen_tts_voice_design: 'fa-microphone-lines',
            qwen_tts_voice_clone: 'fa-wave-square',
            qwen_tts_custom_voice: 'fa-user',
            qwen_tts_dialogue: 'fa-comments'
        };
        return `<i class="fa-solid ${classes[type] || 'fa-image'}"></i>`;
    }

    function nodeSearchText(node) {
        return [node.title, node.type, node.id, node.preset?.name, node.preset?.display_name, node.runtime?.task_method]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
    }

    function openNodeSearchPanel(context) {
        call(context, 'closeContextMenu', null);
        const project = getProject(context);
        const modal = document.createElement('div');
        modal.className = 'sai-canvas-modal';
        modal.classList.toggle('theme-dark', call(context, 'detectWorkbenchTheme', 'dark') === 'dark');
        modal.innerHTML = `
<div class="sai-canvas-modal-panel sai-node-search-panel">
  <div class="sai-canvas-modal-head">
    <span>${escapeHtml(t('Node Search', '节点搜索'))}</span>
    <button type="button" data-modal-close title="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <input data-node-search-input type="search" placeholder="${escapeHtml(t('Search by title, type, preset, id', '按标题、类型、preset、id 搜索'))}" autocomplete="off">
  <div class="sai-node-search-list"></div>
</div>`;
        call(context, 'ensureWorkbenchFormFieldNames', null, modal, 'node_search');
        document.body.appendChild(modal);
        const input = modal.querySelector('[data-node-search-input]');
        const list = modal.querySelector('.sai-node-search-list');
        const renderList = () => {
            const query = String(input.value || '').trim().toLowerCase();
            const nodes = (Array.isArray(project.nodes) ? project.nodes : []).filter((node) => !query || nodeSearchText(node).includes(query)).slice(0, 80);
            list.innerHTML = nodes.length ? nodes.map((node) => `
<button type="button" data-node-search-id="${escapeHtml(node.id)}">
  ${iconForNode(node, context)}
  <span><b>${escapeHtml(node.title || node.id)}</b><small>${escapeHtml([node.type, node.preset?.name || node.runtime?.task_method || call(context, 'readAssetSize', '', node.asset)].filter(Boolean).join(' / '))}</small></span>
</button>`).join('') : `<p>${escapeHtml(t('No matching nodes.', '没有匹配节点。'))}</p>`;
        };
        input.addEventListener('input', renderList);
        list.addEventListener('click', (evt) => {
            const item = evt.target.closest('[data-node-search-id]');
            if (!item) return;
            const node = call(context, 'getNode', null, item.getAttribute('data-node-search-id'));
            if (!node) return;
            call(context, 'focusNode', null, node);
            modal.remove();
        });
        modal.addEventListener('click', (evt) => {
            if (evt.target === modal || evt.target.closest('[data-modal-close]')) modal.remove();
        });
        renderList();
        setTimeout(() => input.focus(), 0);
    }

    function manualList(items) {
        return `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    }

    function openCanvasManual(context) {
        call(context, 'closeContextMenu', null);
        const rows = [
            ['Ctrl/Cmd + S', t('Save project file', '保存项目文件')],
            ['Ctrl/Cmd + Z / Shift+Z / Y', t('Undo / redo', '撤销 / 重做')],
            ['Ctrl/Cmd + C / V', t('Copy / paste nodes', '复制 / 粘贴节点')],
            ['Ctrl/Cmd + Shift + V', t('Paste with existing input links', '粘贴并保留现有输入连接')],
            ['Ctrl/Cmd + D', t('Duplicate selection', '复制选中项')],
            ['Alt + drag node', t('Copy while dragging', '拖动时复制')],
            ['P', t('Pin / lock selected nodes', '固定 / 锁定选中节点')],
            ['Shift + Arrow keys', t('Align selected nodes', '对齐选中节点')],
            ['Ctrl/Cmd + drag empty canvas', t('Marquee select', '框选')],
            ['Middle mouse or Alt + drag empty canvas', t('Pan canvas', '平移画布')],
            ['Mouse wheel', t('Zoom canvas', '缩放画布')],
            ['Shift + 1 / Shift + 2', t('Fit all / fit selection', '适配全部 / 适配选区')],
            ['Alt + group key', t('Jump to area group', '跳转到区域分组')],
            ['Ctrl/Cmd + K', t('Add preset search', '打开预设搜索')]
        ];
        const features = [
            t('Drag from an output port to a matching input port to create a connection.', '从输出接口拖到匹配输入接口即可建立连接。'),
            t('Select multiple nodes and run the selected chain to execute in dependency order.', '多选节点后运行选中链路，会按依赖顺序执行。'),
            t('Preset / Classic output goes into a Result node; Result can be reused as downstream image input.', 'Preset / Classic 的输出进入 Result 节点，Result 可继续作为下游图像输入。'),
            t('Result Retry reuses the current Result node, useful for refreshing middle outputs.', 'Result 的 Retry 会复用当前 Result 节点，适合刷新中间结果。'),
            t('Tip notes and area groups can document work zones directly on the canvas.', '提示贴和区域分组可以直接在画布上标记工作区域。'),
            t('Use Asset Manager to inspect referenced and unreferenced workbench media.', '使用资产管理查看画布引用与未引用媒体。')
        ];
        const chainNotes = [
            t('Stale Result means upstream parameters changed; rerun the producer before using it downstream.', 'Stale Result 表示上游参数已变化；作为下游输入前应先重跑生产节点。'),
            t('Waiting means an upstream Result is refreshing; the queue will continue automatically.', 'Waiting 表示上游 Result 正在刷新；队列会自动继续。'),
            t('Blocked means required input is missing or stale without its producer in the current plan.', 'Blocked 表示必需输入缺失，或结果已过期且当前计划未包含其生产节点。')
        ];
        const nodeNotes = [
            t('Image / Video / Audio: imported media sources.', 'Image / Video / Audio：导入的媒体源。'),
            t('Text / Text Merge / Translation / Tag Cart / WD14 / VLM: text-producing helpers for prompts and descriptions.', 'Text / 文本合并 / Translation / 标签选择器 / WD14 / VLM：用于提示词和描述的文本辅助节点。'),
            t('Tip Note: non-running annotation node with editable font color, size, and background.', 'Tip Note：不参与运行的标注节点，可编辑字体颜色、大小和底色。'),
            t('Config nodes: Models, Styles, Resolution, Detection and other structured preset inputs.', 'Config 节点：Models、Styles、Resolution、Detection 等结构化 preset 输入。'),
            t('Timeline and Compare: arrange media over time or compare two image sources.', 'Timeline 和 Compare：用于时间线编排或两路图像对比。'),
            t('Director Timeline: plan shots before generation and output an Easy-Media compatible prompt_override.', '导演时间轴：生成前规划分镜，并输出 Easy-Media 兼容的 prompt_override。')
        ];
        const ports = [
            ['image', t('Image / media input or output', '图像 / 媒体输入输出')],
            ['text', t('Text input or output', '文本输入输出')],
            ['config', t('Config input or output', '配置输入输出')],
            ['generate', t('Generation link: Preset / Classic / Timeline to Result', '生成链路：Preset / Classic / Timeline 到 Result')],
            ['timeline', t('Timeline media track input', 'Timeline 媒体轨道输入')]
        ];
        const modal = document.createElement('div');
        modal.className = 'sai-canvas-modal';
        modal.classList.toggle('theme-dark', call(context, 'detectWorkbenchTheme', 'dark') === 'dark');
        modal.innerHTML = `
<div class="sai-canvas-modal-panel sai-canvas-manual">
  <div class="sai-canvas-modal-head">
    <span>${escapeHtml(t('Infinite Canvas Manual', '无限画布说明书'))}</span>
    <button type="button" data-modal-close title="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="sai-canvas-manual-body">
    <section>
      <h3>${escapeHtml(t('Core Workflow', '核心流程'))}</h3>
      ${manualList(features)}
    </section>
    <section>
      <h3>${escapeHtml(t('Chain States', '链路状态'))}</h3>
      ${manualList(chainNotes)}
    </section>
    <section>
      <h3>${escapeHtml(t('Port Colors', '接口颜色'))}</h3>
      <div class="sai-port-legend">${ports.map(([kind, label]) => `<div><i class="sai-port-dot is-${kind}"></i><span>${escapeHtml(label)}</span></div>`).join('')}</div>
    </section>
    <section>
      <h3>${escapeHtml(t('Node Groups', '节点组'))}</h3>
      ${manualList(nodeNotes)}
    </section>
    <section>
      <h3>${escapeHtml(t('Shortcuts', '快捷键'))}</h3>
      <div class="sai-shortcut-list">${rows.map(([key, label]) => `<div><kbd>${escapeHtml(key)}</kbd><span>${escapeHtml(label)}</span></div>`).join('')}</div>
    </section>
  </div>
</div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', (evt) => {
            if (evt.target === modal || evt.target.closest('[data-modal-close]')) modal.remove();
        });
    }

    window.SimpAICanvasWorkbenchNodeBrowser = {
        createNodeBrowserContext,
        openCanvasManual,
        openNodeSearchPanel
    };
})();
