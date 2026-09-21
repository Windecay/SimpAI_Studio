(function () {
    'use strict';

    function sourceCall(source, name, fallback, ...args) {
        return typeof source?.[name] === 'function' ? source[name](...args) : fallback;
    }

    function createCanvasVlmChatScrollController(source) {
        const scope = source?.vlmChatScrollSource || source || {};
        const domSource = scope.domSource || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const renderSource = scope.renderSource || {};
        const timingSource = scope.timingSource || {};
        const utilitySource = scope.utilitySource || {};
        const diagnosticsSource = scope.diagnosticsSource || {};

        const scrollMemory = new Map();
        const stickToBottomNodeIds = new Set();
        const renderDebugLast = new Map();
        let renderDebugEnabled = false;

        const getNodesLayer = () => sourceCall(domSource, 'getNodesLayer', null);
        const getDocument = () => sourceCall(domSource, 'getDocument', null);
        const getProject = () => sourceCall(projectSource, 'getProject', {}) || {};
        const nodeStatusState = node => sourceCall(nodeSource, 'nodeStatusState', '', node);
        const nodeRenderKey = node => sourceCall(renderSource, 'nodeRenderKey', '', node);
        const performanceNow = () => Number(sourceCall(timingSource, 'performanceNow', 0)) || 0;
        const requestFrame = callback => sourceCall(timingSource, 'requestAnimationFrame', null, callback);
        const cssEscape = value => String(sourceCall(utilitySource, 'cssEscape', String(value ?? ''), value));
        const warn = (...args) => sourceCall(diagnosticsSource, 'warn', undefined, ...args);
        const info = (...args) => sourceCall(diagnosticsSource, 'info', undefined, ...args);

        function buildScrollState(log) {
            const distanceToBottom = log.scrollHeight - log.scrollTop - log.clientHeight;
            return {
                top: log.scrollTop || 0,
                left: log.scrollLeft || 0,
                height: log.scrollHeight || 0,
                clientHeight: log.clientHeight || 0,
                atBottom: distanceToBottom < 40,
                capturedAt: performanceNow()
            };
        }

        function nodeIdFromLog(log) {
            return log?.getAttribute?.('data-vlm-chat-log')
                || log?.closest?.('[data-node-id]')?.getAttribute?.('data-node-id')
                || '';
        }

        function rememberVlmChatScrollFromLog(log) {
            if (!log) return null;
            const nodeId = nodeIdFromLog(log);
            if (!nodeId) return null;
            const state = buildScrollState(log);
            scrollMemory.set(nodeId, state);
            if (renderDebugEnabled) {
                warn('[SimpAI Canvas][VLM scroll memory]', {
                    node_id: nodeId,
                    state,
                    snapshot: vlmChatScrollSnapshot(log)
                });
            }
            return state;
        }

        function vlmChatScrollSnapshot(log) {
            if (!log) return null;
            const shell = log.closest?.('.sai-vlm-chat-shell') || null;
            const nodeEl = log.closest?.('[data-node-id]') || null;
            const messages = Array.from(log.querySelectorAll?.('.sai-vlm-chat-msg') || []);
            const last = messages[messages.length - 1] || null;
            const rect = typeof log.getBoundingClientRect === 'function'
                ? log.getBoundingClientRect()
                : { top: 0, bottom: 0 };
            const lastRect = last && typeof last.getBoundingClientRect === 'function'
                ? last.getBoundingClientRect()
                : null;
            const ancestorMetrics = [];
            const body = getDocument()?.body || null;
            let parent = log.parentElement;
            while (parent && parent !== body && ancestorMetrics.length < 8) {
                const style = sourceCall(domSource, 'getComputedStyle', {}, parent) || {};
                const overflowY = style.overflowY || '';
                if (['auto', 'scroll', 'hidden'].includes(overflowY) || parent.scrollHeight > parent.clientHeight + 1) {
                    ancestorMetrics.push({
                        tag: String(parent.tagName || '').toLowerCase(),
                        cls: String(parent.className || '').slice(0, 120),
                        scrollTop: parent.scrollTop || 0,
                        scrollHeight: parent.scrollHeight || 0,
                        clientHeight: parent.clientHeight || 0,
                        overflowY
                    });
                }
                parent = parent.parentElement;
            }
            return {
                node_id: log.getAttribute?.('data-vlm-chat-log') || nodeEl?.getAttribute?.('data-node-id') || '',
                log: {
                    scrollTop: log.scrollTop || 0,
                    scrollHeight: log.scrollHeight || 0,
                    clientHeight: log.clientHeight || 0,
                    overflow: Math.max(0, (log.scrollHeight || 0) - (log.clientHeight || 0)),
                    rectTop: Math.round(rect.top || 0),
                    rectBottom: Math.round(rect.bottom || 0)
                },
                messages: messages.length,
                lastMessage: lastRect ? {
                    top: Math.round(lastRect.top || 0),
                    bottom: Math.round(lastRect.bottom || 0),
                    deltaToLogBottom: Math.round((rect.bottom || 0) - (lastRect.bottom || 0))
                } : null,
                shellClass: shell ? String(shell.className || '') : '',
                ancestors: ancestorMetrics
            };
        }

        function captureVlmChatScroll(nodeEl) {
            const log = nodeEl?.querySelector?.('.sai-vlm-chat-log');
            const nodeId = nodeEl?.dataset?.nodeId || log?.getAttribute?.('data-vlm-chat-log') || '';
            if (!log) return nodeId ? scrollMemory.get(nodeId) || null : null;
            const state = buildScrollState(log);
            if (nodeId) scrollMemory.set(nodeId, state);
            if (renderDebugEnabled && nodeId) {
                warn('[SimpAI Canvas][VLM scroll capture]', {
                    node_id: nodeId,
                    state,
                    snapshot: vlmChatScrollSnapshot(log)
                });
            }
            return state;
        }

        function updateVlmChatJumpButton(shell) {
            if (!shell) return;
            const log = shell.querySelector?.('.sai-vlm-chat-log');
            if (!log) return;
            rememberVlmChatScrollFromLog(log);
            const distanceToBottom = log.scrollHeight - log.scrollTop - log.clientHeight;
            shell.classList?.toggle?.('is-away-from-bottom', distanceToBottom > 120);
        }

        function restoreVlmChatScroll(nodeEl, state, node) {
            const nodeId = node?.id || '';
            const forceBottom = (!!nodeId && stickToBottomNodeIds.has(nodeId)) || nodeStatusState(node) === 'running';
            const remembered = nodeId ? scrollMemory.get(nodeId) : null;
            const restoreState = state || remembered;
            if (!restoreState && !forceBottom) return;
            const applyRestore = phase => {
                const log = nodeEl?.querySelector?.('.sai-vlm-chat-log');
                if (!log) return false;
                const before = {
                    top: log.scrollTop || 0,
                    height: log.scrollHeight || 0,
                    clientHeight: log.clientHeight || 0
                };
                if (forceBottom || restoreState?.atBottom) log.scrollTop = log.scrollHeight;
                else log.scrollTop = Math.min(restoreState.top || 0, Math.max(0, log.scrollHeight - log.clientHeight));
                const after = {
                    top: log.scrollTop || 0,
                    height: log.scrollHeight || 0,
                    clientHeight: log.clientHeight || 0
                };
                if (nodeId) scrollMemory.set(nodeId, buildScrollState(log));
                if (renderDebugEnabled && nodeId && (
                    Math.abs(before.top - after.top) > 1
                    || Math.abs((restoreState?.top || 0) - after.top) > 1
                )) {
                    warn('[SimpAI Canvas][VLM scroll restore]', {
                        node_id: nodeId,
                        phase,
                        forceBottom,
                        before,
                        requested: restoreState,
                        after,
                        snapshot: vlmChatScrollSnapshot(log)
                    });
                }
                updateVlmChatJumpButton(log.closest?.('.sai-vlm-chat-shell'));
                return true;
            };
            if (typeof timingSource.requestAnimationFrame !== 'function') return;
            requestFrame(() => {
                const restored = applyRestore('raf-1');
                requestFrame(() => {
                    applyRestore('raf-2');
                    if (nodeId && restored) stickToBottomNodeIds.delete(nodeId);
                });
            });
        }

        function scrollVlmChatLogToBottom(log) {
            if (!log) return false;
            log.scrollTop = log.scrollHeight;
            rememberVlmChatScrollFromLog(log);
            updateVlmChatJumpButton(log.closest?.('.sai-vlm-chat-shell'));
            return true;
        }

        function scrollVlmChatToBottom(nodeId) {
            const nodesLayer = getNodesLayer();
            if (!nodeId || !nodesLayer || typeof timingSource.requestAnimationFrame !== 'function') return;
            requestFrame(() => {
                const log = nodesLayer.querySelector?.(
                    `[data-node-id="${cssEscape(nodeId)}"] .sai-vlm-chat-log`
                );
                scrollVlmChatLogToBottom(log);
            });
        }

        function bindVlmChatScrollControls(nodeEl) {
            if (!nodeEl) return;
            nodeEl.querySelectorAll?.('.sai-vlm-chat-shell')?.forEach?.((shell) => {
                const log = shell.querySelector?.('.sai-vlm-chat-log');
                if (!log) return;
                if (!log.__simpaiVlmJumpBound) {
                    log.__simpaiVlmJumpBound = true;
                    log.addEventListener?.('scroll', () => updateVlmChatJumpButton(shell), { passive: true });
                }
                updateVlmChatJumpButton(shell);
            });
        }

        function parseNodeRenderKeyForDebug(renderKey) {
            const text = String(renderKey || '');
            const marker = '|collapsed:';
            const index = text.lastIndexOf(marker);
            const body = index >= 0 ? text.slice(0, index) : text;
            const collapsed = index >= 0 ? text.slice(index + marker.length) : '';
            try {
                return { body: JSON.parse(body), collapsed };
            } catch (err) {
                return { body, collapsed };
            }
        }

        function diffObjectForDebug(prev, next, prefix, out) {
            if (prev === next) return out;
            const prevObj = prev && typeof prev === 'object';
            const nextObj = next && typeof next === 'object';
            if (!prevObj || !nextObj || Array.isArray(prev) || Array.isArray(next)) {
                out.push({ path: prefix || '.', before: prev, after: next });
                return out;
            }
            const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
            keys.forEach((key) => diffObjectForDebug(prev[key], next[key], prefix ? `${prefix}.${key}` : key, out));
            return out;
        }

        function vlmRenderDebugSummary() {
            const nodes = Array.isArray(getProject().nodes) ? getProject().nodes : [];
            return nodes
                .filter(node => node?.type === 'vlm')
                .map(node => {
                    const key = nodeRenderKey(node);
                    const nodesLayer = getNodesLayer();
                    const log = nodesLayer?.querySelector?.(
                        `[data-node-id="${cssEscape(node.id)}"] .sai-vlm-chat-log`
                    );
                    return {
                        id: node.id,
                        title: node.title || '',
                        key,
                        parsed: parseNodeRenderKeyForDebug(key),
                        scroll: scrollMemory.get(node.id) || null,
                        domScroll: log ? vlmChatScrollSnapshot(log) : null
                    };
                });
        }

        function vlmChatScrollDebug(nodeId) {
            const nodes = Array.isArray(getProject().nodes) ? getProject().nodes : [];
            const id = nodeId || nodes.find(node => node?.type === 'vlm')?.id || '';
            const nodesLayer = getNodesLayer();
            const log = id && nodesLayer?.querySelector?.(
                `[data-node-id="${cssEscape(id)}"] .sai-vlm-chat-log`
            );
            const snapshot = vlmChatScrollSnapshot(log);
            warn('[SimpAI Canvas][VLM chat scroll snapshot]', snapshot);
            return snapshot;
        }

        function logVlmRenderKeyChange(node, previousKey, nextKey, reason) {
            if (!renderDebugEnabled || node?.type !== 'vlm') return;
            const previous = parseNodeRenderKeyForDebug(previousKey);
            const next = parseNodeRenderKeyForDebug(nextKey);
            const diff = diffObjectForDebug(previous, next, '', []).slice(0, 40);
            const payload = {
                reason,
                node_id: node.id,
                title: node.title || '',
                diff,
                previous,
                next
            };
            renderDebugLast.set(node.id, payload);
            warn('[SimpAI Canvas][VLM render key changed]', payload);
        }

        function setVlmRenderDebug(enabled) {
            renderDebugEnabled = !!enabled;
            info(`[SimpAI Canvas] VLM render debug ${renderDebugEnabled ? 'enabled' : 'disabled'}. Pan the canvas and watch for warnings.`);
            return {
                enabled: renderDebugEnabled,
                vlm_nodes: vlmRenderDebugSummary()
            };
        }

        return {
            captureVlmChatScroll,
            restoreVlmChatScroll,
            scrollVlmChatToBottom,
            scrollVlmChatLogToBottom,
            rememberVlmChatScrollFromLog,
            vlmChatScrollSnapshot,
            updateVlmChatJumpButton,
            bindVlmChatScrollControls,
            markVlmChatStickToBottom: nodeId => {
                if (nodeId) stickToBottomNodeIds.add(nodeId);
            },
            getVlmChatScrollMemory: () => scrollMemory,
            getVlmRenderDebugEnabled: () => renderDebugEnabled,
            logVlmRenderKeyChange,
            setVlmRenderDebug,
            vlmRenderDebugSummary,
            vlmChatScrollDebug,
            getVlmRenderDebugLastDiffs: () => Array.from(renderDebugLast.values())
        };
    }

    window.SimpAICanvasWorkbenchVlmChatScroll = Object.assign(
        {},
        window.SimpAICanvasWorkbenchVlmChatScroll || {},
        { createCanvasVlmChatScrollController }
    );
})();
