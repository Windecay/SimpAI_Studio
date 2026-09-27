(function () {
    'use strict';

    function normalizeCanvasColor(value, fallback) {
        const text = String(value || '').trim();
        if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(text)) return text;
        return fallback;
    }

    function expandCanvasHexColor(value, fallback) {
        const color = normalizeCanvasColor(value, fallback || '#14b8a6');
        const text = String(color || fallback || '#14b8a6').trim();
        const short = text.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
        if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
        return /^#[0-9a-f]{6}$/i.test(text) ? text : (fallback || '#14b8a6');
    }

    function nodeCustomColor(node) {
        return normalizeCanvasColor(node?.style?.node_color || node?.style?.accent_color || '', '');
    }

    function nodeAccentContrastColor(color) {
        const hex = expandCanvasHexColor(color, '#14b8a6').replace('#', '');
        const r = Number.parseInt(hex.slice(0, 2), 16) / 255;
        const g = Number.parseInt(hex.slice(2, 4), 16) / 255;
        const b = Number.parseInt(hex.slice(4, 6), 16) / 255;
        const channel = value => value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
        const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
        return luminance > 0.48 ? '#111827' : '#f8fafc';
    }

    function applyNodeCustomColorVars(node, nodeEl) {
        if (!nodeEl) return;
        const color = nodeCustomColor(node);
        nodeEl.classList.toggle('has-custom-color', !!color);
        if (!color) {
            nodeEl.style.removeProperty('--sai-canvas-accent');
            nodeEl.style.removeProperty('--sai-canvas-accent-soft');
            nodeEl.style.removeProperty('--sai-node-accent-contrast');
            nodeEl.style.removeProperty('--sai-node-custom-color');
            return;
        }
        const hex = expandCanvasHexColor(color, '#14b8a6');
        nodeEl.style.setProperty('--sai-canvas-accent', hex);
        nodeEl.style.setProperty('--sai-canvas-accent-soft', `color-mix(in srgb, ${hex} 24%, var(--sai-canvas-panel))`);
        nodeEl.style.setProperty('--sai-node-accent-contrast', nodeAccentContrastColor(hex));
        nodeEl.style.setProperty('--sai-node-custom-color', hex);
    }

    function createCanvasNodeAppearanceController(context) {
        const scope = context?.nodeAppearanceSource || context || {};
        const stateSource = scope.stateSource || {};
        const nodeSource = scope.nodeSource || {};
        const colorSource = scope.colorSource || {};
        const languageSource = scope.languageSource || {};
        const patchSource = scope.patchSource || {};
        const historySource = scope.historySource || {};
        const domSource = scope.domSource || {};
        const renderSource = scope.renderSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const getSelectedNodeId = () => call(stateSource, 'getSelectedNodeId', '');
        const getNode = nodeId => call(nodeSource, 'getNode', null, nodeId);
        const isNodeLocked = node => !!call(nodeSource, 'isNodeLocked', false, node);
        const isNodeCollapsed = node => !!call(nodeSource, 'isNodeCollapsed', false, node);
        const getLanguageState = () => call(languageSource, 'getLanguageState', { __lang: 'en' });
        const translate = (en, cn) => call(languageSource, 't', cn || en, en, cn, getLanguageState());

        function ensureNodeResizeHandle(nodeEl, node) {
            if (!nodeEl || !node) return;
            const document = call(domSource, 'getDocument', null);
            if (!document) return;
            let handle = nodeEl.querySelector(':scope > [data-node-resize-handle]');
            if (!handle) {
                handle = document.createElement('button');
                handle.type = 'button';
                handle.className = 'sai-canvas-resize-handle sai-node-resize-handle';
                handle.setAttribute('data-node-resize-handle', '');
                nodeEl.appendChild(handle);
            }
            const label = translate('Resize node', '调整节点大小');
            handle.setAttribute('title', label);
            handle.setAttribute('aria-label', label);
            handle.hidden = isNodeLocked(node);
        }

        function ensureNodeCollapseButton(nodeEl, node) {
            if (!nodeEl || !node) return;
            const head = nodeEl.querySelector(':scope > .sai-node-head');
            if (!head) return;
            const document = call(domSource, 'getDocument', null);
            if (!document) return;
            let button = head.querySelector('[data-node-action="toggle-collapse"]');
            if (!button) {
                button = document.createElement('button');
                button.type = 'button';
                button.setAttribute('data-node-action', 'toggle-collapse');
                const deleteButton = head.querySelector('[data-node-action="delete"]');
                if (deleteButton) head.insertBefore(button, deleteButton);
                else head.appendChild(button);
            }
            const collapsed = isNodeCollapsed(node);
            const label = collapsed ? translate('Expand node', '展开节点') : translate('Collapse node', '折叠节点');
            button.className = 'sai-node-collapse-btn';
            button.setAttribute('title', label);
            button.setAttribute('aria-label', label);
            button.innerHTML = `<i class="fa-solid ${collapsed ? 'fa-up-right-and-down-left-from-center' : 'fa-down-left-and-up-right-to-center'}"></i>`;
        }

        function updateNodeCustomColor(nodeId, value, options) {
            const node = getNode(nodeId);
            if (!node || isNodeLocked(node)) return;
            const color = call(colorSource, 'normalizeCanvasColor', '', value, '');
            call(historySource, 'pushHistoryBatch', undefined, `node:${nodeId}:custom-color`, 'Edit node color');
            const stylePatch = color
                ? {
                    stylePatch: {
                        node_color: call(colorSource, 'expandCanvasHexColor', color, color, '#14b8a6')
                    },
                    deleteStyleKeys: ['accent_color']
                }
                : { deleteStyleKeys: ['node_color', 'accent_color'] };
            if (node.type === 'note') {
                Object.assign(node, call(patchSource, 'buildNoteStatePatch', {}, node, stylePatch));
            } else {
                call(patchSource, 'applyNodeStylePatch', undefined, node, stylePatch);
            }
            const nodeEl = call(domSource, 'getNodeElement', null, nodeId);
            if (nodeEl) call(colorSource, 'applyNodeCustomColorVars', undefined, node, nodeEl);
            call(renderSource, 'invalidateMinimapStaticCache', undefined);
            call(renderSource, 'renderMinimap', undefined);
            call(renderSource, 'scheduleSave', undefined);
            if (options?.renderInspector) call(renderSource, 'renderInspector', undefined);
        }

        function bindInspectorNodeColorEvents(inspector) {
            if (!inspector?.querySelectorAll) return false;
            inspector.querySelectorAll('[data-inspector-node-color-enabled]').forEach((field) => {
                field.addEventListener('change', () => {
                    const input = inspector.querySelector('[data-inspector-node-color]');
                    const enabled = !!field.checked;
                    if (input) input.disabled = !enabled;
                    updateNodeCustomColor(getSelectedNodeId(), enabled ? (input?.value || '#14b8a6') : '');
                });
            });
            inspector.querySelectorAll('[data-inspector-node-color]').forEach((field) => {
                const handler = () => {
                    if (field.disabled) return;
                    updateNodeCustomColor(getSelectedNodeId(), field.value);
                };
                field.addEventListener('input', handler);
                field.addEventListener('change', handler);
            });
            inspector.querySelectorAll('[data-inspector-node-color-reset]').forEach((button) => {
                button.addEventListener('click', (evt) => {
                    evt.preventDefault();
                    updateNodeCustomColor(getSelectedNodeId(), '', { renderInspector: true });
                });
            });
            return true;
        }

        return {
            normalizeCanvasColor,
            expandCanvasHexColor,
            nodeCustomColor,
            nodeAccentContrastColor,
            applyNodeCustomColorVars,
            ensureNodeResizeHandle,
            ensureNodeCollapseButton,
            updateNodeCustomColor,
            bindInspectorNodeColorEvents
        };
    }

    window.SimpAICanvasWorkbenchNodeAppearance = Object.assign(
        {},
        window.SimpAICanvasWorkbenchNodeAppearance || {},
        { createCanvasNodeAppearanceController }
    );
})();
