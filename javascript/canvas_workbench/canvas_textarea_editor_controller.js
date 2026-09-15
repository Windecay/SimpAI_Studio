(function () {
    'use strict';

    function createCanvasTextareaEditorController(context) {
        const scope = context?.textareaEditorSource || context || {};
        const domSource = scope.domSource || {};
        const overlaySource = scope.overlaySource || {};
        const languageSource = scope.languageSource || {};
        const utilitySource = scope.utilitySource || {};
        const timingSource = scope.timingSource || {};
        const eventSource = scope.eventSource || {};
        const selectionSource = scope.selectionSource || {};
        const toolSource = scope.toolSource || {};
        const formSource = scope.formSource || {};

        const getDocument = () => typeof domSource.getDocument === 'function'
            ? domSource.getDocument()
            : null;
        const getRoot = () => typeof domSource.getRoot === 'function'
            ? domSource.getRoot()
            : null;
        const getNodesLayer = () => typeof domSource.getNodesLayer === 'function'
            ? domSource.getNodesLayer()
            : null;
        const getInspector = () => typeof domSource.getInspector === 'function'
            ? domSource.getInspector()
            : null;
        const getOverlayHost = () => {
            if (typeof overlaySource.getOverlayHost === 'function') {
                const host = overlaySource.getOverlayHost();
                if (host) return host;
            }
            const root = getRoot();
            const doc = getDocument();
            return root || doc?.getElementById?.('simpai-infinite-canvas-workbench') || doc?.body || null;
        };
        const t = typeof languageSource.t === 'function' ? languageSource.t : (en) => en;
        const escapeHtml = typeof utilitySource.escapeHtml === 'function'
            ? utilitySource.escapeHtml
            : (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[char] || char));
        const cssEscape = typeof utilitySource.cssEscape === 'function'
            ? utilitySource.cssEscape
            : (value) => String(value ?? '').replace(/["\\]/g, '\\$&');
        const detectTheme = typeof utilitySource.detectTheme === 'function'
            ? utilitySource.detectTheme
            : () => 'light';
        const ensureFormNames = typeof formSource.ensureFormNames === 'function'
            ? formSource.ensureFormNames
            : () => {};
        const getSelectedNodeId = () => typeof selectionSource.getSelectedNodeId === 'function'
            ? selectionSource.getSelectedNodeId()
            : null;
        const getNode = (id) => typeof selectionSource.getNode === 'function'
            ? selectionSource.getNode(id)
            : null;
        const openWildcardsInsertMenu = (...args) => typeof toolSource.openWildcardsInsertMenu === 'function'
            ? toolSource.openWildcardsInsertMenu(...args)
            : undefined;
        const openTagCartForField = (...args) => typeof toolSource.openTagCartForField === 'function'
            ? toolSource.openTagCartForField(...args)
            : undefined;
        const schedule = (callback, delay) => typeof timingSource.setTimeout === 'function'
            ? timingSource.setTimeout(callback, delay)
            : undefined;
        const createEvent = (type) => {
            if (typeof eventSource.createEvent === 'function') return eventSource.createEvent(type, { bubbles: true });
            const doc = getDocument();
            const EventCtor = doc?.defaultView?.Event;
            return typeof EventCtor === 'function' ? new EventCtor(type, { bubbles: true }) : null;
        };
        const dispatchFieldEvent = (field, type) => {
            if (!field?.dispatchEvent) return false;
            const event = createEvent(type);
            if (!event) return false;
            field.dispatchEvent(event);
            return true;
        };

        let editorState = null;

        function textareaEditorFieldFromTitleClick(target) {
            const root = getRoot();
            if (!target?.closest || !root) return null;
            if (target.closest('button,input,select,textarea,a,[contenteditable="true"],.sai-translate-wrap')) return null;
            const label = target.closest('label');
            if (!label || !root.contains?.(label)) return null;
            const title = target.closest('span');
            if (!title || title.parentElement !== label) return null;
            const field = label.querySelector?.('textarea');
            if (!field || field.disabled) return null;
            return field;
        }

        function textareaEditorLabel(field) {
            const label = field?.closest?.('label');
            if (!label) return t('Text', '文本');
            const directSpan = Array.from(label.children || []).find((child) => String(child.tagName || '').toLowerCase() === 'span');
            const raw = directSpan
                ? (directSpan.innerText || directSpan.textContent || '')
                : Array.from(label.childNodes || [])
                    .filter((node) => node.nodeType === 3)
                    .map((node) => node.textContent || '')
                    .join(' ');
            const cleaned = String(raw || '').replace(/\s+/g, ' ').trim();
            return cleaned || t('Text', '文本');
        }

        function textareaEditorDescriptor(field) {
            if (!field) return null;
            const attrs = [
                'data-node-param',
                'data-inspector-param',
                'data-text-value',
                'data-inspector-text-value',
                'data-vlm-param',
                'data-note-text',
                'data-translation-input',
                'data-translation-param',
                'data-tagcart-param',
                'data-wd14-param',
                'data-classic-param'
            ];
            const attr = attrs.find((name) => field.hasAttribute?.(name)) || '';
            const nodeEl = field.closest?.('[data-node-id]');
            return {
                attr,
                key: attr ? (field.getAttribute?.(attr) || '') : '',
                nodeId: nodeEl?.getAttribute?.('data-node-id') || getSelectedNodeId() || '',
                inspector: !!field.closest?.('.sai-canvas-inspector')
            };
        }

        function textareaEditorSelector(desc) {
            if (!desc?.attr) return '';
            return desc.key
                ? `textarea[${desc.attr}="${cssEscape(desc.key)}"]`
                : `textarea[${desc.attr}]`;
        }

        function findTextareaEditorSource(desc, fallback) {
            if (fallback?.isConnected) return fallback;
            const selector = textareaEditorSelector(desc);
            if (!selector) return fallback?.isConnected ? fallback : null;
            const nodesLayer = getNodesLayer();
            if (desc?.nodeId && nodesLayer) {
                const nodeEl = nodesLayer.querySelector?.(`[data-node-id="${cssEscape(desc.nodeId)}"]`);
                const field = nodeEl?.querySelector?.(selector);
                if (field) return field;
            }
            const inspector = getInspector();
            if (desc?.inspector && inspector) {
                const field = inspector.querySelector?.(selector);
                if (field) return field;
            }
            return getRoot()?.querySelector?.(selector) || null;
        }

        function resolveTextareaEditorSource() {
            if (!editorState) return null;
            const source = findTextareaEditorSource(editorState.descriptor, editorState.source);
            if (source) editorState.source = source;
            return source;
        }

        function textareaEditorSourceButton(source, kind) {
            const wrap = source?.closest?.('.sai-translate-wrap');
            if (!wrap) return null;
            if (kind === 'wildcard') return wrap.querySelector?.('.sai-wildcard-btn');
            if (kind === 'tagcart') return wrap.querySelector?.('.sai-tagcart-btn');
            if (kind === 'translate') return wrap.querySelector?.('.sai-translate-btn');
            return null;
        }

        function textareaEditorToolsHtml(field) {
            const tools = [
                ['wildcard', textareaEditorSourceButton(field, 'wildcard')],
                ['tagcart', textareaEditorSourceButton(field, 'tagcart')],
                ['translate', textareaEditorSourceButton(field, 'translate')]
            ].filter(([, button]) => !!button);
            if (!tools.length) return '';
            return `<div class="sai-textarea-editor-tools">${tools.map(([kind, button]) => {
                const disabled = button.disabled ? 'disabled' : '';
                const copiedAttrs = ['data-translate-target', 'data-translate-key', 'data-translate-state', 'data-node-action']
                    .map((name) => button.hasAttribute?.(name) ? `${name}="${escapeHtml(button.getAttribute(name) || '')}"` : '')
                    .filter(Boolean)
                    .join(' ');
                return `<button type="button" class="${escapeHtml(button.className || 'sai-prompt-tool-btn')}" data-textarea-editor-tool="${kind}" ${copiedAttrs} ${disabled} title="${escapeHtml(button.getAttribute?.('title') || '')}">${button.innerHTML || ''}</button>`;
            }).join('')}</div>`;
        }

        function syncTextareaEditorToSource(commit) {
            if (!editorState) return false;
            const source = resolveTextareaEditorSource();
            const input = editorState.input;
            if (!source || !input || source.disabled || source.readOnly) return false;
            source.value = input.value;
            dispatchFieldEvent(source, 'input');
            if (commit) dispatchFieldEvent(source, 'change');
            return true;
        }

        function syncTextareaEditorFromSource() {
            if (!editorState) return;
            const source = resolveTextareaEditorSource();
            const input = editorState.input;
            if (source && input && source.value !== input.value) input.value = source.value;
        }

        function closeTextareaEditor(apply) {
            if (!editorState) return;
            const state = editorState;
            if (apply && !state.readonly) {
                syncTextareaEditorToSource(true);
            } else if (!apply && !state.readonly) {
                const source = resolveTextareaEditorSource();
                if (source && !source.disabled && !source.readOnly && source.value !== state.initialValue) {
                    source.value = state.initialValue;
                    dispatchFieldEvent(source, 'input');
                    dispatchFieldEvent(source, 'change');
                }
            }
            state.modal?.remove?.();
            editorState = null;
        }

        function scheduleSourceSync(delays) {
            delays.forEach((delay) => schedule(syncTextareaEditorFromSource, delay));
        }

        function handleTextareaEditorTool(kind, toolButton) {
            if (!editorState) return;
            const source = resolveTextareaEditorSource();
            if (!source) return;
            if (!source.readOnly && !source.disabled) syncTextareaEditorToSource(false);
            const button = textareaEditorSourceButton(source, kind);
            if (!button || button.disabled) return;
            const node = getNode(editorState.descriptor?.nodeId || getSelectedNodeId());
            if (kind === 'wildcard' && node && ['preset', 'classic'].includes(node.type)) {
                const action = button.getAttribute?.('data-node-action') || '';
                const slot = action.startsWith('open-wildcards-insert:')
                    ? action.split(':')[1] || 'prompt'
                    : (source.getAttribute?.('data-node-param') || 'prompt');
                openWildcardsInsertMenu(node, slot, toolButton || button);
                scheduleSourceSync([500, 1200, 2400, 5000, 10000]);
                return;
            }
            if (kind === 'tagcart' && node) {
                openTagCartForField(node, toolButton || button, { field: source });
                scheduleSourceSync([500, 1200, 2400, 5000, 10000]);
                return;
            }
            button.click?.();
            scheduleSourceSync([80, 500, 1200, 2400, 5000, 10000]);
        }

        function openTextareaEditor(field) {
            if (!field || field.disabled) return;
            closeTextareaEditor(true);
            const doc = getDocument();
            const modal = doc?.createElement?.('div');
            const host = getOverlayHost();
            if (!modal || !host?.appendChild) return;
            const readonly = !!(field.readOnly || field.disabled);
            modal.className = `sai-canvas-modal sai-textarea-editor-modal ${detectTheme() === 'dark' ? 'theme-dark' : ''}`;
            modal.innerHTML = `
<div class="sai-canvas-modal-panel sai-textarea-editor-panel">
  <div class="sai-canvas-modal-head sai-textarea-editor-head">
    <div class="sai-textarea-editor-title"><i class="fa-solid fa-pen-to-square"></i><span>${escapeHtml(textareaEditorLabel(field))}</span></div>
    <button type="button" data-textarea-editor-action="cancel" title="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="sai-textarea-editor-body">
    <div class="sai-textarea-editor-shell">
      <textarea class="sai-textarea-editor-input" data-textarea-editor-input ${readonly ? 'readonly' : ''}>${escapeHtml(field.value || '')}</textarea>
      ${textareaEditorToolsHtml(field)}
    </div>
  </div>
  <div class="sai-textarea-editor-foot">
    <span>${escapeHtml(readonly ? t('Read only', '只读') : t('Ctrl+Enter applies changes', 'Ctrl+Enter 应用修改'))}</span>
    <div>
      <button type="button" data-textarea-editor-action="cancel">${escapeHtml(t('Cancel', '取消'))}</button>
      <button type="button" class="is-primary" data-textarea-editor-action="apply" ${readonly ? 'disabled' : ''}>${escapeHtml(t('Apply', '应用'))}</button>
    </div>
  </div>
</div>`;
            host.appendChild(modal);
            const input = modal.querySelector?.('[data-textarea-editor-input]');
            editorState = {
                modal,
                input,
                source: field,
                descriptor: textareaEditorDescriptor(field),
                initialValue: field.value || '',
                readonly
            };
            ensureFormNames(modal, 'textarea_editor');
            modal.addEventListener?.('click', (evt) => {
                if (evt.target === modal) {
                    evt.preventDefault?.();
                    closeTextareaEditor(false);
                    return;
                }
                const toolButton = evt.target?.closest?.('[data-textarea-editor-tool]');
                if (toolButton) {
                    evt.preventDefault?.();
                    evt.stopPropagation?.();
                    handleTextareaEditorTool(toolButton.getAttribute?.('data-textarea-editor-tool') || '', toolButton);
                    return;
                }
                const action = evt.target?.closest?.('[data-textarea-editor-action]')?.getAttribute?.('data-textarea-editor-action') || '';
                if (!action) return;
                evt.preventDefault?.();
                closeTextareaEditor(action === 'apply');
            });
            modal.addEventListener?.('keydown', (evt) => {
                evt.stopPropagation?.();
                if (evt.key === 'Escape') {
                    evt.preventDefault?.();
                    closeTextareaEditor(false);
                } else if (evt.key === 'Enter' && (evt.ctrlKey || evt.metaKey)) {
                    evt.preventDefault?.();
                    closeTextareaEditor(true);
                }
            }, true);
            schedule(() => {
                input?.focus?.();
                input?.setSelectionRange?.(input.value.length, input.value.length);
            }, 0);
        }

        return {
            textareaEditorFieldFromTitleClick,
            openTextareaEditor,
            closeTextareaEditor,
            syncTextareaEditorToSource,
            syncTextareaEditorFromSource,
            getTextareaEditorState: () => editorState
        };
    }

    window.SimpAICanvasWorkbenchTextareaEditor = Object.assign(
        {},
        window.SimpAICanvasWorkbenchTextareaEditor || {},
        { createCanvasTextareaEditorController }
    );
})();
