(function () {
    'use strict';

    function createCanvasTagCartController(context) {
        const scope = context?.tagCartSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const adapterSource = scope.adapterSource || {};
        const domSource = scope.domSource || {};
        const stateSource = scope.stateSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const t = (en, cn) => call(scope.languageSource || {}, 't', en, en, cn);

        function readTagCartFieldValue(node, target, key, field) {
            if (!node) return String(field?.value || '');
            if (target === 'node-param') return String(node.params?.[key] ?? field?.value ?? '');
            if (target === 'vlm-param') return String(node.params?.[key || 'prompt'] ?? field?.value ?? '');
            return String(call(nodeSource, 'getNodeTextOutput', '', node) || field?.value || '');
        }

        async function ensureTagCartReady() {
            const ready = await call(runtimeSource, 'ensureWorkbenchLazyRuntime', false,
                'tagCart', () => typeof call(adapterSource, 'getAdapter', null)?.open === 'function',
                t('Loading Tag Cart...', '正在加载标签选择器...'),
                t('Tag Cart is not ready.', '标签选择器还未就绪。'));
            if (!ready) return null;
            const adapter = call(adapterSource, 'getAdapter', null);
            if (!adapter || typeof adapter.open !== 'function') {
                call(runtimeSource, 'showToast', undefined, t('Tag Cart is not ready.', '标签选择器还未就绪。'));
                return null;
            }
            return adapter;
        }

        async function openTagCartForField(node, button, options) {
            if (!node || !button || button.disabled || call(nodeSource, 'isNodeLocked', false, node)) return;
            const wrap = button.closest('.sai-translate-wrap');
            const field = options?.field || (wrap ? wrap.querySelector('textarea') : null);
            if (!field || field.readOnly || field.disabled) return;
            const adapter = await ensureTagCartReady();
            if (!adapter) return;
            const target = button.getAttribute('data-translate-target') || 'text-value';
            const key = button.getAttribute('data-translate-key') || '';
            const targetKind = key === 'negative_prompt' ? 'negative' : 'positive';
            const baseText = readTagCartFieldValue(call(nodeSource, 'getNode', node, node.id) || node, target, key, field);
            adapter.open({
                action: 'append',
                targetKind,
                anchor: options?.anchor || button.getBoundingClientRect(),
                baseText,
                container: call(domSource, 'getRoot', null),
                target: {
                    getBaseText: () => baseText,
                    getText: () => readTagCartFieldValue(call(nodeSource, 'getNode', node, node.id) || node, target, key, field),
                    setText: (nextValue, meta) => {
                        const latest = call(nodeSource, 'getNode', node, node.id) || node;
                        if (!latest) return false;
                        const ok = call(runtimeSource, 'setTranslatedFieldValue', false, latest, target, key, nextValue, field);
                        call(runtimeSource, 'renderAll', undefined, { inspector: false });
                        if (!meta?.auto) call(runtimeSource, 'showToast', undefined, t('Tags inserted.', '标签已发送到提示词。'));
                        return ok;
                    }
                }
            });
        }

        function handleTagCartClick(node, evt) {
            const button = evt?.target?.closest?.('[data-tag-cart-action]');
            if (!button) return false;
            evt.preventDefault();
            evt.stopPropagation();
            openTagCartForField(node, button);
            return true;
        }

        function bindInspectorTagCartEvents(inspector) {
            if (!inspector?.querySelectorAll) return false;
            inspector.querySelectorAll('[data-tag-cart-action]').forEach((button) => {
                button.addEventListener('click', (evt) => {
                    evt.preventDefault();
                    evt.stopPropagation();
                    const nodeId = call(nodeSource, 'getSelectedNodeId');
                    const node = call(nodeSource, 'getNode', null, nodeId);
                    if (node) openTagCartForField(node, button);
                });
            });
            return true;
        }

        async function openTagCartForNode(node, button, options) {
            if (!node || node.type !== 'tag_cart' || call(nodeSource, 'isNodeLocked', false, node)) return;
            const adapter = await ensureTagCartReady();
            if (!adapter) return;
            const params = node.params || {};
            const source = call(nodeSource, 'getTextNodeInputSource', null, node);
            const baseText = source ? String(call(nodeSource, 'getNodeTextOutput', '', source) || '') : '';
            const nodeEl = call(domSource, 'getNodeElement', null, node.id);
            const inlineHost = call(domSource, 'getInlineHost', null, nodeEl);
            call(domSource, 'removeInlineReopenButtons', undefined, inlineHost);
            const sizePatch = call(nodeSource, 'buildTagCartSizePatch', {}, node);
            if (Object.keys(sizePatch).length) {
                Object.assign(node, sizePatch);
                if (nodeEl) {
                    nodeEl.style.width = String(node.w) + 'px';
                    nodeEl.style.minHeight = String(node.h) + 'px';
                }
                call(runtimeSource, 'scheduleSave', undefined);
                call(runtimeSource, 'renderEdges', undefined);
            }
            const readCurrent = () => {
                const latest = call(nodeSource, 'getNode', node, node.id) || node;
                const current = String(latest.text?.value || '');
                if (current) return current;
                const latestSource = call(nodeSource, 'getTextNodeInputSource', null, latest);
                return latestSource ? String(call(nodeSource, 'getNodeTextOutput', '', latestSource) || '') : '';
            };
            const ok = adapter.open({
                action: params.action === 'replace' ? 'replace' : 'append',
                targetKind: 'positive',
                anchor: button?.getBoundingClientRect ? button.getBoundingClientRect() : null,
                inlineContainer: inlineHost,
                inlineHeight: 520,
                onClose: () => {
                    if (call(stateSource, 'getActiveInlineTagCartNodeId', '') === node.id) call(stateSource, 'setActiveInlineTagCartNodeId', undefined, '');
                    const latestEl = call(domSource, 'getNodeElement', null, node.id);
                    if (latestEl) {
                        latestEl.__simpaiRenderKey = undefined;
                        call(runtimeSource, 'renderNodes', undefined);
                        call(runtimeSource, 'renderEdges', undefined);
                        call(runtimeSource, 'renderMinimap', undefined);
                    }
                },
                baseText,
                target: {
                    getBaseText: () => {
                        const latest = call(nodeSource, 'getNode', node, node.id) || node;
                        const latestSource = call(nodeSource, 'getTextNodeInputSource', null, latest);
                        return latestSource ? String(call(nodeSource, 'getNodeTextOutput', '', latestSource) || '') : baseText;
                    },
                    getText: readCurrent,
                    setText: (nextValue, meta) => {
                        const latest = call(nodeSource, 'getNode', node, node.id) || node;
                        if (!latest || call(nodeSource, 'isNodeLocked', false, latest)) return false;
                        call(runtimeSource, 'pushHistoryBatch', undefined, 'tag-cart:' + latest.id + ':text', 'Edit Tag Cart output');
                        Object.assign(latest, call(nodeSource, 'buildTagCartStatePatch', {}, latest, {
                            textPatch: { value: String(nextValue || ''), updated_at: call(runtimeSource, 'nowIso', '') },
                            paramsPatch: { action: meta?.action || latest.params?.action || 'append', target_kind: 'positive' }
                        }));
                        call(runtimeSource, 'scheduleSave', undefined);
                        call(runtimeSource, 'syncTextOutputDom', undefined, latest.id, String(nextValue || ''));
                        call(runtimeSource, 'refreshTextMergeDependents', undefined, latest.id);
                        const latestEl = call(domSource, 'getNodeElement', null, latest.id);
                        if (latestEl) latestEl.__simpaiRenderKey = call(runtimeSource, 'nodeRenderKey', undefined, latest);
                        call(runtimeSource, 'renderEdges', undefined);
                        call(runtimeSource, 'renderInspector', undefined);
                        call(runtimeSource, 'renderStatus', undefined);
                        call(runtimeSource, 'renderMinimap', undefined);
                        call(runtimeSource, 'showToast', undefined, source
                            ? t('Tags inserted into Tag Cart node output.', '标签已写入标签选择器节点输出。')
                            : t('Tags inserted.', '标签已插入。'));
                        return true;
                    }
                }
            });
            if (ok && inlineHost) call(stateSource, 'setActiveInlineTagCartNodeId', undefined, node.id);
            if (!options?.restore && ok) call(runtimeSource, 'renderEdges', undefined);
        }

        return { readTagCartFieldValue, openTagCartForField, openTagCartForNode, handleTagCartClick, bindInspectorTagCartEvents };
    }

    window.SimpAICanvasWorkbenchTagCart = Object.assign(
        {}, window.SimpAICanvasWorkbenchTagCart || {}, { createCanvasTagCartController }
    );
})();
