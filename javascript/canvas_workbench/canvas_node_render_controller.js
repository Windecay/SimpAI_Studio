(function () {
    'use strict';

    function createCanvasNodeRenderController(context) {
        const scope = context;
        const {
            updateCanvasRenderMode, getNodeRenderWorldRect, getVisibleNodeRecords, getNode,
            getNodeLayoutSize, ensureVlmNodeModeSize, ensureResultNodeReadableSize,
            getSelectedResultAsset, resultPreviewAspectSource, ensureMediaBrowserNodeReadableSize,
            mediaBrowserRuntimeFor, refreshMediaBrowserNode, nodeEffectiveRenderMode,
            captureVlmChatScroll, captureMediaBrowserScroll, logVlmRenderKeyChange,
            isNodeCollapsed, isNodeLocked, isNodeIgnored, isImageNodeFrameless,
            isNodeVisuallyRunning, isNodeSchedulerBlocked, isNodeSchedulerWaiting, isResultStale,
            applyNodeCustomColorVars, defaultNodeSize, supportsCollapsedPromptHeight,
            collapsedPromptNodeHeight, shouldFixNodeHeight, renderNodeHtml,
            ensureWorkbenchFormFieldNames, ensureNodeCollapseButton, ensureNodeResizeHandle,
            bindNodeEvents, restoreVlmChatScroll, refreshVlmChatReadabilityDom,
            restoreMediaBrowserScroll, syncResultPreviewPlayerDom, restoreInlineTagCartAfterRender,
            syncOutpaintOverlayPosition, isPanning, scheduleMinimapRender, renderMinimap,
            positionCanvasAgentPanel, getPresetSpecialControllerKind, bindPresetSpecialViewerEvents,
            refreshPresetSpecialNodeDom, nodeOverviewRenderSignature, nodeRenderSignature,
            refreshNodeSpatialIndexRecord
        } = scope;
        const renderedNodeElsById = new Map();
        const nodeLayoutRects = new Map();
        let nodeRenderCoverageRect = null;

        function renderNodes(options) {
            const startedAt = scope.performanceNow();
            const nodesLayer = scope.getNodesLayer();
            const document = scope.getDocument();
            const mediaBrowserNodeRuntime = scope.getMediaBrowserNodeRuntime();
            const mediaBrowserScrollMemory = scope.getMediaBrowserScrollMemory();
            const renderOptions = options || {};
            updateCanvasRenderMode();
            syncRenderedNodeElementMap();
            const renderWindow = getNodeRenderWorldRect();
            nodeRenderCoverageRect = Object.assign({}, renderWindow);
            const visibleQuery = getVisibleNodeRecords(renderWindow, renderOptions);
            const visibleNodes = visibleQuery.nodes;
            const liveIds = new Set(visibleNodes.map(node => node.id));
            const projectIds = visibleQuery.projectIds;
            Array.from(nodeLayoutRects.keys()).forEach((id) => {
                if (!projectIds.has(id)) nodeLayoutRects.delete(id);
            });
            Array.from(mediaBrowserNodeRuntime.keys()).forEach((id) => {
                if (!projectIds.has(id)) mediaBrowserNodeRuntime.delete(id);
            });
            Array.from(mediaBrowserScrollMemory.keys()).forEach((id) => {
                if (!projectIds.has(id)) mediaBrowserScrollMemory.delete(id);
            });
            Array.from(renderedNodeElsById.entries()).forEach(([nodeId, nodeEl]) => {
                const removeForViewport = !renderOptions.panPreview && !liveIds.has(nodeId);
                const removeForProject = !projectIds.has(nodeId);
                if (!nodeEl || !nodeEl.isConnected || nodeEl.parentElement !== nodesLayer || removeForViewport || removeForProject) {
                    const removedNode = getNode(nodeId);
                    if (scope.getVlmRenderDebugEnabled() && removedNode?.type === 'vlm') {
                        console.warn('[SimpAI Canvas][VLM node removed from DOM by viewport virtualization]', {
                            node_id: nodeId,
                            title: removedNode.title || '',
                            renderWindow,
                            nodeRect: getNodeLayoutSize(removedNode)
                        });
                    }
                    if (nodeEl?.parentElement) nodeEl.remove();
                    renderedNodeElsById.delete(nodeId);
                }
            });
            let layoutChanged = false;
            for (const node of visibleNodes) {
                if (!renderOptions.panPreview) {
                    if (node.type === 'vlm') {
                        layoutChanged = ensureVlmNodeModeSize(node) || layoutChanged;
                    }
                    if (node.type === 'result') {
                        layoutChanged = ensureResultNodeReadableSize(node, getSelectedResultAsset(node) || node.asset || resultPreviewAspectSource(node) || node.preview) || layoutChanged;
                    }
                    if (node.type === 'media_browser') {
                        layoutChanged = ensureMediaBrowserNodeReadableSize(node) || layoutChanged;
                        const runtime = mediaBrowserRuntimeFor(node.id);
                        if (!runtime.loaded && !runtime.loading) {
                            runtime.loaded = true;
                            refreshMediaBrowserNode(node, { render: false }).catch((err) => console.warn('[SimpAI Canvas] media browser initial refresh failed', err));
                        }
                    }
                }
                const renderMode = nodeEffectiveRenderMode(node, renderOptions);
                let nodeEl = renderedNodeElsById.get(node.id);
                if (!nodeEl || !nodeEl.isConnected || nodeEl.parentElement !== nodesLayer) {
                    nodeEl = document.createElement('div');
                    nodeEl.dataset.nodeId = node.id;
                    nodesLayer.appendChild(nodeEl);
                    renderedNodeElsById.set(node.id, nodeEl);
                }
                const vlmChatScroll = node.type === 'vlm' && renderMode === 'full' ? captureVlmChatScroll(nodeEl) : null;
                const mediaBrowserScroll = node.type === 'media_browser' && renderMode === 'full' && !mediaBrowserRuntimeFor(node.id).loading
                    ? captureMediaBrowserScroll(nodeEl, node.id)
                    : null;
                const renderKey = nodeRenderKey(node, renderOptions);
                const preservePresetSpecialIframe = shouldPreservePresetSpecialIframe(node, nodeEl, renderMode);
                const hasOverviewBody = renderMode === 'full' && !!nodeEl.querySelector?.(':scope > .sai-node-overview-body');
                if (renderMode === 'full' && hasOverviewBody) nodeEl.__simpaiRenderKey = undefined;
                if (nodeEl.__simpaiRenderKey !== undefined && nodeEl.__simpaiRenderKey !== renderKey && !preservePresetSpecialIframe) {
                    logVlmRenderKeyChange(node, nodeEl.__simpaiRenderKey, renderKey, 'replace');
                    const replacement = document.createElement('div');
                    replacement.dataset.nodeId = node.id;
                    nodeEl.replaceWith(replacement);
                    nodeEl = replacement;
                    renderedNodeElsById.set(node.id, nodeEl);
                }
                nodeEl.className = `sai-canvas-node sai-canvas-node-${node.type}`;
                nodeEl.dataset.renderMode = renderMode;
                nodeEl.classList.toggle('is-selected', node.id === scope.getSelectedNodeId() || scope.getSelectedNodeIds().has(node.id));
                nodeEl.classList.toggle('is-focused', node.id === scope.getSelectedNodeId());
                nodeEl.classList.toggle('is-overview', renderMode === 'overview');
                nodeEl.classList.toggle('is-lod-placeholder', renderMode === 'overview' && !isNodeCollapsed(node));
                nodeEl.classList.toggle('is-locked', isNodeLocked(node));
                nodeEl.classList.toggle('is-ignored', isNodeIgnored(node));
                nodeEl.classList.toggle('is-collapsed', isNodeCollapsed(node));
                nodeEl.classList.toggle('is-image-frameless', isImageNodeFrameless(node));
                nodeEl.classList.toggle('is-running', isNodeVisuallyRunning(node));
                nodeEl.classList.toggle('is-scheduler-blocked', isNodeSchedulerBlocked(node));
                nodeEl.classList.toggle('is-scheduler-waiting', isNodeSchedulerWaiting(node));
                nodeEl.classList.toggle('is-result-stale', isResultStale(node));
                applyNodeCustomColorVars(node, nodeEl);
                nodeEl.style.left = `${node.x || 0}px`;
                nodeEl.style.top = `${node.y || 0}px`;
                nodeEl.style.width = `${node.w || defaultNodeSize(node.type).w}px`;
                const defaultSize = defaultNodeSize(node.type);
                const storedNodeHeight = node.h || defaultSize.h;
                const measuredNodeHeight = Number(getNodeLayoutSize(node)?.h || 0);
                const preserveOverviewLayout = renderMode === 'overview' && !isNodeCollapsed(node);
                const useCollapsedPromptHeight = supportsCollapsedPromptHeight(node);
                const nodeLayoutHeight = useCollapsedPromptHeight
                    ? collapsedPromptNodeHeight(node)
                    : (preserveOverviewLayout ? Math.max(storedNodeHeight, measuredNodeHeight) : storedNodeHeight);
                nodeEl.style.setProperty('--sai-node-expanded-min-height', `${storedNodeHeight}px`);
                nodeEl.style.minHeight = isNodeCollapsed(node) ? '' : `${nodeLayoutHeight}px`;
                nodeEl.style.height = useCollapsedPromptHeight || preserveOverviewLayout || shouldFixNodeHeight(node) ? `${nodeLayoutHeight}px` : '';
                const didRenderHtml = nodeEl.__simpaiRenderKey !== renderKey;
                if (didRenderHtml) {
                    logVlmRenderKeyChange(node, nodeEl.__simpaiRenderKey, renderKey, nodeEl.__simpaiRenderKey === undefined ? 'first-render' : 'innerHTML');
                    setNodeInnerHtml(nodeEl, node, renderNodeHtml(node, renderOptions), { preservePresetSpecialIframe });
                    nodeEl.__simpaiRenderKey = renderKey;
                    ensureWorkbenchFormFieldNames(nodeEl, node.id || node.type || 'node');
                    ensureNodeCollapseButton(nodeEl, node);
                    ensureNodeResizeHandle(nodeEl, node);
                    bindNodeEvents(nodeEl, node);
                } else {
                    ensureNodeCollapseButton(nodeEl, node);
                    ensureNodeResizeHandle(nodeEl, node);
                }
                if (!nodeEl.parentElement) nodesLayer.appendChild(nodeEl);
                const layoutSignature = nodeLayoutMeasureSignature(node, renderMode);
                const shouldMeasureLayout = !renderOptions.panPreview && (
                    didRenderHtml
                    || nodeEl.__simpaiLayoutSignature !== layoutSignature
                    || !nodeLayoutRects.has(node.id)
                );
                if (shouldMeasureLayout) {
                    layoutChanged = rememberRenderedNodeLayout(node, nodeEl) || layoutChanged;
                    nodeEl.__simpaiLayoutSignature = layoutSignature;
                }
                if (node.type === 'vlm' && renderMode === 'full') {
                    restoreVlmChatScroll(nodeEl, vlmChatScroll, node);
                    refreshVlmChatReadabilityDom(nodeEl, node);
                }
                if (node.type === 'media_browser' && renderMode === 'full' && mediaBrowserScroll) {
                    restoreMediaBrowserScroll(nodeEl, mediaBrowserScroll, node.id);
                }
                if (node.type === 'result' && renderMode === 'full') {
                    syncResultPreviewPlayerDom(node, nodeEl);
                }
            }
            const root = scope.getRoot();
            const project = scope.getProject();
            const perfStats = scope.getPerfStats();
            if (root) {
                root.dataset.renderedNodes = String(visibleNodes.length);
                root.dataset.totalNodes = String(project.nodes.length);
            }
            perfStats.renderNodesMs = scope.performanceNow() - startedAt;
            perfStats.renderedNodes = visibleNodes.length;
            perfStats.totalNodes = project.nodes.length;
            if (!renderOptions.panPreview) {
                restoreInlineTagCartAfterRender();
                syncOutpaintOverlayPosition();
            }
            if (layoutChanged) {
                if (!renderOptions.skipLayoutMinimap) {
                    if (isPanning()) scheduleMinimapRender();
                    else renderMinimap();
                }
                if (!renderOptions.skipAgentPosition) positionCanvasAgentPanel();
            }
        }

        function shouldPreservePresetSpecialIframe(node, nodeEl, renderMode) {
            return !!(
                node?.type === 'preset'
                && renderMode === 'full'
                && getPresetSpecialControllerKind(node)
                && nodeEl?.dataset?.renderMode === 'full'
                && nodeEl.querySelector?.('[data-preset-special-viewer]')
            );
        }

        function setNodeInnerHtml(nodeEl, node, html, options) {
            if (!options?.preservePresetSpecialIframe || node?.type !== 'preset') {
                nodeEl.innerHTML = html;
                return;
            }
            const oldSpecial = nodeEl.querySelector(':scope > .sai-preset-special-controller');
            if (!oldSpecial) {
                nodeEl.innerHTML = html;
                return;
            }
            const template = scope.getDocument().createElement('template');
            template.innerHTML = html;
            const nextChildren = Array.from(template.content.childNodes);
            const specialIndex = nextChildren.findIndex(child => child.nodeType === 1 && child.matches?.('.sai-preset-special-controller'));
            if (specialIndex < 0) {
                nodeEl.innerHTML = html;
                return;
            }
            while (nodeEl.firstChild && nodeEl.firstChild !== oldSpecial) {
                nodeEl.firstChild.remove();
            }
            nextChildren.slice(0, specialIndex).forEach((child) => {
                nodeEl.insertBefore(child, oldSpecial);
            });
            while (oldSpecial.nextSibling) {
                oldSpecial.nextSibling.remove();
            }
            nextChildren.slice(specialIndex + 1).forEach((child) => {
                nodeEl.appendChild(child);
            });
            bindPresetSpecialViewerEvents(nodeEl, node);
            refreshPresetSpecialNodeDom(node, { syncViewer: false, renderKey: false });
        }

        function syncRenderedNodeElementMap() {
            const nodesLayer = scope.getNodesLayer();
            if (!nodesLayer) return;
            if (renderedNodeElsById.size === nodesLayer.children.length) return;
            renderedNodeElsById.clear();
            Array.from(nodesLayer.children || []).forEach((nodeEl) => {
                const nodeId = nodeEl?.getAttribute?.('data-node-id') || '';
                if (nodeId) renderedNodeElsById.set(nodeId, nodeEl);
            });
        }

        function resetRenderedProjectDomCache() {
            const nodesLayer = scope.getNodesLayer();
            const groupsLayer = scope.getGroupsLayer();
            const edgesLayer = scope.getEdgesLayer();
            const chainRunOverlay = scope.getChainRunOverlay();
            if (nodesLayer) {
                Array.from(renderedNodeElsById.values()).forEach((nodeEl) => {
                    if (nodeEl?.parentElement) nodeEl.remove();
                });
                Array.from(nodesLayer.children || []).forEach((nodeEl) => nodeEl.remove());
            }
            if (groupsLayer) {
                Array.from(groupsLayer.children || []).forEach((groupEl) => groupEl.remove());
            }
            scope.clearTempEdge();
            if (edgesLayer) edgesLayer.innerHTML = '';
            scope.setEdgeRenderCacheKey('');
            scope.cancelEdgeIncidentIndexWarmup();
            scope.setEdgeIncidentIndex(null);
            scope.clearEdgeCanvas();
            if (chainRunOverlay) chainRunOverlay.hidden = true;
            renderedNodeElsById.clear();
            nodeLayoutRects.clear();
            nodeRenderCoverageRect = null;
            scope.getMediaBrowserNodeRuntime().clear();
            scope.getMediaBrowserScrollMemory().clear();
            scope.getVlmChatScrollMemory().clear();
            scope.setActiveInlineTagCartNodeId('');
            scope.invalidateMinimapStaticCache();
            scope.invalidateNodeSpatialIndex();
        }

        function nodeRenderKey(node, options) {
            const renderMode = nodeEffectiveRenderMode(node, options);
            const signature = renderMode === 'overview' ? nodeOverviewRenderSignature(node) : nodeRenderSignature(node);
            return `${renderMode}|${signature}|collapsed:${isNodeCollapsed(node) ? '1' : '0'}`;
        }

        function invalidateRenderedNode(nodeId) {
            const id = String(nodeId || '');
            if (!id) return;
            const nodeEl = renderedNodeElsById.get(id) || scope.getNodesLayer()?.querySelector?.(`[data-node-id="${scope.cssEscape(id)}"]`);
            if (nodeEl) nodeEl.__simpaiRenderKey = undefined;
        }

        function rememberRenderedNodeLayout(node, nodeEl) {
            if (!node || !nodeEl) return false;
            if (nodeEl.dataset.renderMode === 'overview') return false;
            const measuredW = Math.round(Number(nodeEl.offsetWidth || 0));
            const measuredH = Math.round(Number(nodeEl.offsetHeight || 0));
            if (!measuredW || !measuredH) return false;
            const previous = nodeLayoutRects.get(node.id || '');
            if (previous && Math.abs(previous.w - measuredW) < 1 && Math.abs(previous.h - measuredH) < 1) return false;
            nodeLayoutRects.set(node.id, { w: measuredW, h: measuredH });
            refreshNodeSpatialIndexRecord(node);
            return true;
        }

        function nodeLayoutMeasureSignature(node, renderMode) {
            const defaults = defaultNodeSize(node?.type);
            return [
                node?.type || '',
                renderMode || '',
                isNodeCollapsed(node) ? 1 : 0,
                Number(node?.w || defaults.w),
                Number(node?.h || defaults.h),
                supportsCollapsedPromptHeight(node) ? collapsedPromptNodeHeight(node) : Number(node?.collapsed_h || 0)
            ].join(':');
        }

        return {
            renderNodes,
            resetRenderedProjectDomCache,
            nodeRenderKey,
            invalidateRenderedNode,
            rememberRenderedNodeLayout,
            getRenderedNodeElement: (id) => renderedNodeElsById.get(id),
            getMeasuredNodeLayout: (id) => nodeLayoutRects.get(id),
            getNodeLayoutCacheSize: () => nodeLayoutRects.size,
            getNodeRenderCoverageRect: () => nodeRenderCoverageRect,
            setNodeRenderCoverageRect: (rect) => { nodeRenderCoverageRect = rect; }
        };
    }

    window.SimpAICanvasWorkbenchNodeRender = Object.assign({}, window.SimpAICanvasWorkbenchNodeRender || {}, {
        createCanvasNodeRenderController
    });
})();
