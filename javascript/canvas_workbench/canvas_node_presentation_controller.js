(function () {
    'use strict';

    const ACTIVE_STATES = new Set(['pending', 'queued', 'waiting', 'waiting_inputs', 'preparing', 'uploading', 'running', 'rendering', 'task_ready', 'args_ready', 'dry_run_ready', 'checking', 'stopping', 'cancelling', 'canceling', 'skipping']);

    function createCanvasNodePresentationController(context) {
        const source = context || {};
        const getProject = () => source.getProject?.() || {};
        const label = text => source.localize?.(text) || text;
        const escape = value => source.escapeHtml(String(value ?? ''));
        const isActive = state => ACTIVE_STATES.has(state) || !!source.isRunActive?.(state);
        let indexedProject = null;
        let indexedNodes = null;
        let indexedLength = -1;
        let indexedEdges = null;
        let indexedEdgeLength = -1;
        let indexedRuns = null;
        let indexedRunLength = -1;
        const latestResults = new Map();
        const paramLayouts = new Map();
        const observedMedia = new WeakSet();
        let mediaObserver = null;

        function beginRender() {
            const project = getProject();
            const nodes = Array.isArray(project.nodes) ? project.nodes : [];
            const edges = Array.isArray(project.edges) ? project.edges : [];
            const runs = Array.isArray(project.runs) ? project.runs : [];
            indexedProject = project;
            indexedNodes = project.nodes;
            indexedLength = nodes.length;
            indexedEdges = project.edges;
            indexedEdgeLength = edges.length;
            indexedRuns = project.runs;
            indexedRunLength = runs.length;
            latestResults.clear();
            paramLayouts.clear();
            const runTimes = new Map(runs.map(run => [run.id, Date.parse(run.updated_at || run.created_at || '') || 0]));
            const producers = new Map();
            for (const edge of edges) {
                if (edge.type !== 'generate' || !edge.to || !edge.from) continue;
                if (!producers.has(edge.to)) producers.set(edge.to, new Set());
                producers.get(edge.to).add(edge.from);
            }
            for (const result of nodes) {
                if (result.type !== 'result') continue;
                const owners = new Set(producers.get(result.id) || []);
                if (result.producer?.preset_node_id) owners.add(result.producer.preset_node_id);
                const state = result.status?.state || '';
                const active = isActive(state) || result.producer?.refreshing || result.source?.refreshing;
                const pending = result.producer?.pending_run_token || result.source?.pending_run_token;
                const time = runTimes.get(result.producer?.run_id) || Date.parse(result.source?.updated_at || result.updated_at || '') || 0;
                const score = (active ? 1e15 : 0) + (pending ? 1e12 : 0) + time;
                for (const owner of owners) {
                    const previous = latestResults.get(owner);
                    if (!previous || score > previous.score) latestResults.set(owner, { result, score });
                }
            }
        }

        function previewState(node) {
            const project = getProject();
            if (project !== indexedProject || project.nodes !== indexedNodes || (project.nodes?.length || 0) !== indexedLength
                || project.edges !== indexedEdges || (project.edges?.length || 0) !== indexedEdgeLength
                || project.runs !== indexedRuns || (project.runs?.length || 0) !== indexedRunLength) beginRender();
            const result = latestResults.get(node?.id)?.result || null;
            const status = result?.status || node?.status || {};
            const state = status.state || 'idle';
            const active = isActive(state) || !!(result?.producer?.refreshing || result?.source?.refreshing);
            const assets = Array.isArray(result?.assets) ? result.assets : [];
            const selected = Math.max(0, Math.min(Number(result?.selected_asset_index) || 0, Math.max(0, assets.length - 1)));
            const frames = result?.preview_frames;
            const preview = result?.preview || (Array.isArray(frames) ? frames[frames.length - 1] : null);
            const asset = (active && preview) || (result && source.getSelectedResultAsset?.(result)) || assets[selected] || result?.asset || preview || null;
            return {
                result, asset, state, active, selected, count: assets.length,
                percent: Math.max(0, Math.min(100, Math.round((Number(status.percent) || 0) * 100))),
                message: status.message || '',
                stale: !!(result?.producer?.stale || result?.source?.stale),
                refreshing: !!(result?.producer?.refreshing || result?.source?.refreshing)
            };
        }

        function statusText(state) {
            const names = {
                idle: 'Node ready', pending: 'Run pending', queued: 'Run queued', waiting: 'Run waiting', waiting_inputs: 'Run waiting for inputs',
                preparing: 'Run preparing', uploading: 'Run uploading', running: 'Run running', stopping: 'Run stopping',
                rendering: 'Run rendering', checking: 'Run checking', task_ready: 'Run preparing', args_ready: 'Run preparing', dry_run_ready: 'Run preparing',
                cancelling: 'Run stopping', canceling: 'Run stopping', skipping: 'Run skipping',
                finished: 'Run finished', failed: 'Run failed', canceled: 'Run canceled', cancelled: 'Run canceled', skipped: 'Run skipped', blocked: 'Run blocked'
            };
            const key = names[state] || state;
            const translated = label(key);
            return translated === key ? key.replace(/^(Run|Node) /, '').replace(/^\w/, ch => ch.toUpperCase()) : translated;
        }

        function thumbnailSrc(asset) {
            const candidate = asset?.thumb || asset?.preview_url || (String(asset?.mime || '').startsWith('image/') ? asset?.data_url : '') || '';
            if (!candidate && /^(video|audio)\//i.test(asset?.mime || '')) return '';
            const src = source.assetDisplaySrc?.(asset, candidate) || candidate;
            return /^data:(video|audio)\//i.test(src) ? '' : src;
        }

        function mediaHtml(state) {
            const asset = state.asset;
            if (!asset) return `<div class="sai-inline-preview-empty">${escape(label(state.active ? 'Waiting for preview' : 'Run this node to preview its output'))}</div>`;
            const kind = String(asset.mime || '').split('/')[0] || 'image';
            const thumb = thumbnailSrc(asset);
            const fullSrc = source.assetDisplaySrc?.(asset, '') || '';
            const dimensions = Number(asset.width) > 0 && Number(asset.height) > 0 ? ` width="${Math.round(Number(asset.width))}" height="${Math.round(Number(asset.height))}"` : '';
            if (kind === 'video') return `<video controls playsinline preload="none" ${thumb ? `poster="${escape(thumb)}"` : ''} src="${escape(fullSrc)}" data-media-player></video>`;
            if (kind === 'audio') return `<div class="sai-inline-audio">${source.renderAudioWaveformHtml?.(asset) || '<i class="fa-solid fa-wave-square" aria-hidden="true"></i>'}<audio controls preload="none" src="${escape(fullSrc)}" data-media-player></audio></div>`;
            return thumb ? `<button type="button" class="sai-inline-preview-image" data-node-action="view-inline-result" aria-label="${escape(label('Open preview'))}"><img src="${escape(thumb)}" alt="${escape(label('Output preview'))}"${dimensions} loading="lazy" decoding="async" draggable="false" /></button>` : '';
        }

        function renderInlinePreviewHtml(node) {
            const state = previewState(node);
            const expanded = node.ui?.preview_collapsed !== true;
            return `<section class="sai-preset-inline-preview" data-preset-inline-preview>
  <div class="sai-inline-preview-head"><button type="button" class="sai-param-group-toggle" data-node-action="toggle-inline-preview" aria-expanded="${expanded}"><i class="fa-solid fa-chevron-${expanded ? 'down' : 'right'}" aria-hidden="true"></i><span>${escape(label('Preview'))}</span></button><button type="button" data-node-action="focus-inline-result" title="${escape(label('Locate result node'))}" aria-label="${escape(label('Locate result node'))}" ${state.result ? '' : 'disabled'}><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></button></div>
  <div class="sai-inline-preview-status" data-inline-preview-status></div>
  <div class="sai-inline-preview-body" data-inline-preview-body data-initial-preview ${expanded ? '' : 'hidden'}>${expanded ? mediaHtml(state) : ''}</div>
  <div class="sai-inline-preview-message" data-inline-preview-message hidden></div>
  <div class="sai-inline-preview-pagination" data-inline-preview-pagination hidden><button type="button" data-node-action="inline-result-previous" aria-label="${escape(label('Previous result'))}"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button><span data-inline-preview-count></span><button type="button" data-node-action="inline-result-next" aria-label="${escape(label('Next result'))}"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button></div>
</section>`;
        }

        function setText(el, text) {
            if (!el || el.textContent === text) return false;
            el.textContent = text;
            return true;
        }

        function setHidden(el, hidden) {
            if (el && el.hidden !== hidden) el.hidden = hidden;
        }

        function visibleParams(node) {
            let layout = paramLayouts.get(node);
            if (!layout) {
                const params = source.getVisiblePresetParams?.(node) || [];
                layout = { params, byKey: new Map(params.map(param => [param.key, param])) };
                paramLayouts.set(node, layout);
            }
            return layout.params;
        }

        function pauseMedia(scope) {
            scope?.querySelectorAll?.('video,audio').forEach(player => {
                if (!player.paused) player.pause?.();
            });
        }

        function observeMedia(nodeEl) {
            const win = nodeEl.ownerDocument?.defaultView;
            if (!mediaObserver && win?.IntersectionObserver) {
                mediaObserver = new win.IntersectionObserver(entries => {
                    for (const entry of entries) if (!entry.isIntersecting && !entry.target.paused) entry.target.pause?.();
                }, { root: nodeEl.closest('.sai-canvas-viewport') });
            }
            nodeEl.querySelectorAll?.('video,audio').forEach(player => {
                if (observedMedia.has(player)) return;
                observedMedia.add(player);
                mediaObserver?.observe(player);
            });
        }

        function syncParamValues(node, nodeEl) {
            const active = nodeEl.ownerDocument?.activeElement;
            visibleParams(node);
            const params = paramLayouts.get(node).byKey;
            if (!nodeEl.__presentationFields) nodeEl.__presentationFields = Array.from(nodeEl.querySelectorAll?.('[data-node-param]') || []);
            nodeEl.__presentationFields.forEach(field => {
                const key = field.getAttribute('data-node-param');
                const param = params.get(key);
                if (!param && !Object.prototype.hasOwnProperty.call(node.params || {}, key)) return;
                const value = param ? source.presetParamValue?.(node, param) : node.params[key];
                if (field.hasAttribute('data-relight-light-value')) {
                    const direction = Number.isFinite(Number(value)) ? Math.max(1, Math.min(10, Math.round(Number(value)))) : 10;
                    const selected = Number(field.dataset.relightLightValue) === direction;
                    field.classList.toggle('is-selected', selected);
                    if (field.getAttribute('aria-pressed') !== String(selected)) field.setAttribute('aria-pressed', String(selected));
                    if (selected) setText(field.closest('[data-canvas-relight-light-control]')?.querySelector('.sai-canvas-relight-light-current'), field.title);
                    return;
                }
                if (field === active || field.dataset.composing === 'true') return;
                if (field.type === 'checkbox') {
                    const checked = value === true || value === 'true' || value === 1 || value === '1';
                    if (field.checked !== checked) field.checked = checked;
                } else if (value !== undefined && field.value !== String(value ?? '')) field.value = String(value ?? '');
            });
        }

        function syncNodeDom(node, nodeEl) {
            if (!nodeEl) return;
            observeMedia(nodeEl);
            if (node?.type === 'result') {
                const state = node.status?.state || 'queued';
                const percent = Math.max(0, Math.min(100, Math.round((Number(node.status?.percent) || 0) * 100)));
                setText(nodeEl.querySelector(':scope > .sai-result-status > span'), statusText(state));
                setText(nodeEl.querySelector(':scope > .sai-result-status > b'), `${percent}%`);
                const progress = nodeEl.querySelector(':scope > .sai-result-progress > i');
                if (progress && progress.style.width !== `${percent}%`) progress.style.width = `${percent}%`;
                const foot = nodeEl.querySelector(':scope > .sai-node-foot');
                if (foot) {
                    const changed = setText(foot, node.status?.message || '');
                    setHidden(foot, !node.status?.message);
                    if (changed) source.refreshLayout?.(node.id);
                }
                return;
            }
            if (!['preset', 'classic'].includes(node?.type)) return;
            const state = previewState(node);
            const run = nodeEl.querySelector('[data-preset-primary-run]');
            if (run) {
                const action = state.active ? 'stop-preset-run' : 'run';
                const title = label(state.active ? 'Stop' : 'Run');
                if (run.dataset.nodeAction !== action) run.dataset.nodeAction = action;
                if (run.title !== title) run.title = title;
                if (run.getAttribute('aria-label') !== title) run.setAttribute('aria-label', title);
                run.classList.toggle('is-stop', state.active);
                const icon = run.querySelector('i');
                const iconClass = `fa-solid fa-${state.active ? 'stop' : 'play'}`;
                if (icon && icon.className !== iconClass) icon.className = iconClass;
                // A stop action remains available even when the node is locked.
                const disabled = state.active ? !state.result : (!!node.locked || !!source.isRunDisabled?.(node));
                if (run.disabled !== disabled) run.disabled = disabled;
            }
            const modelHost = nodeEl.querySelector('[data-preset-model-status]');
            const modelKey = JSON.stringify(node.model_status || {});
            if (modelHost && modelHost.__modelKey !== modelKey) {
                const previouslyRendered = modelHost.__modelKey !== undefined;
                const modelHtml = source.renderModelStatusHtml?.(node);
                if (modelHtml !== undefined) modelHost.innerHTML = modelHtml;
                modelHost.__modelKey = modelKey;
                if (previouslyRendered) source.refreshLayout?.(node.id, { portsChanged: true });
            }
            const liveStatus = nodeEl.querySelector('[data-preset-live-status]');
            if (liveStatus) {
                const text = state.state === 'idle' || state.state === 'finished' ? '' : (state.message || statusText(state.state));
                setText(liveStatus, text);
                setHidden(liveStatus, !text);
                if (liveStatus.dataset.state !== state.state) liveStatus.dataset.state = state.state;
            }
            const preview = nodeEl.querySelector('[data-preset-inline-preview]');
            if (preview) {
                const expanded = node.ui?.preview_collapsed !== true;
                const body = preview.querySelector('[data-inline-preview-body]');
                const mediaSource = /^(video|audio)\//i.test(state.asset?.mime || '') ? source.assetDisplaySrc?.(state.asset, '') : '';
                const mediaKey = JSON.stringify([state.result?.id, state.selected, state.asset?.mime, thumbnailSrc(state.asset), mediaSource, expanded, !state.asset && state.active]);
                if (body && body.__previewMediaKey !== mediaKey) {
                    const previouslyRendered = body.__previewMediaKey !== undefined;
                    if (body.hasAttribute?.('data-initial-preview')) {
                        // Initial HTML already contains this preview; retain its media request and decoder.
                        body.removeAttribute('data-initial-preview');
                    } else {
                        releaseNodeDom(body);
                        body.innerHTML = expanded ? mediaHtml(state) : '';
                    }
                    body.__previewMediaKey = mediaKey;
                    setHidden(body, !expanded);
                    source.afterDomChange?.(node, nodeEl);
                    const owner = getProject();
                    body.querySelectorAll?.('img,video').forEach(media => {
                        media.addEventListener(media.tagName === 'IMG' ? 'load' : 'loadedmetadata', () => {
                            if (getProject() === owner && media.isConnected && (!source.getNode || source.getNode(node.id) === node)) source.refreshLayout?.(node.id);
                        }, { once: true });
                    });
                    if (previouslyRendered) source.refreshLayout?.(node.id);
                }
                const status = [statusText(state.state), state.active ? `${state.percent}%` : '', state.stale ? label('Result is out of date') : ''].filter(Boolean).join(' · ');
                setText(preview.querySelector('[data-inline-preview-status]'), status);
                const message = preview.querySelector('[data-inline-preview-message]');
                const error = ['failed', 'canceled', 'cancelled', 'blocked'].includes(state.state) ? (state.message || statusText(state.state)) : '';
                const errorChanged = setText(message, error);
                setHidden(message, !error);
                if (errorChanged) source.refreshLayout?.(node.id);
                const focus = preview.querySelector('[data-node-action="focus-inline-result"]');
                if (focus && focus.disabled !== !state.result) focus.disabled = !state.result;
                const pagination = preview.querySelector('[data-inline-preview-pagination]');
                setHidden(pagination, !expanded || state.count <= 1);
                setText(preview.querySelector('[data-inline-preview-count]'), `${state.selected + 1} / ${state.count}`);
                if (preview.dataset.state !== state.state) preview.dataset.state = state.state;
                observeMedia(nodeEl);
            }
            syncParamValues(node, nodeEl);
        }

        function handleAction(node, action, button, evt) {
            if (!['preset', 'classic'].includes(node?.type)) return false;
            if (typeof source.getNode === 'function' && source.getNode(node.id) !== node) return true;
            const nodeEl = button?.closest?.('[data-node-id]');
            if (action.startsWith('toggle-param-group:')) {
                const id = action.slice('toggle-param-group:'.length);
                const section = button?.closest?.('[data-param-group]');
                if (!section || section.dataset.paramGroup !== id || !nodeEl) return true;
                const expanded = button.getAttribute('aria-expanded') !== 'true';
                source.commitUi?.(node, { param_groups: { ...(node.ui?.param_groups || {}), [id]: expanded } });
                const restoreFocus = nodeEl.ownerDocument?.activeElement === button;
                section.outerHTML = source.renderParamGroup?.(node, id) || section.outerHTML;
                delete nodeEl.__presentationFields;
                if (restoreFocus) nodeEl.querySelector(`[data-node-action="toggle-param-group:${id}"]`)?.focus({ preventScroll: true });
                source.afterDomChange?.(node, nodeEl);
                source.refreshLayout?.(node.id, { portsChanged: true });
                return true;
            }
            if (action === 'toggle-inline-preview') {
                source.commitUi?.(node, { preview_collapsed: node.ui?.preview_collapsed !== true });
                const expanded = node.ui?.preview_collapsed !== true;
                button.setAttribute('aria-expanded', String(expanded));
                const icon = button.querySelector('i');
                if (icon) icon.className = `fa-solid fa-chevron-${expanded ? 'down' : 'right'}`;
                syncNodeDom(node, nodeEl);
                source.refreshLayout?.(node.id);
                return true;
            }
            if (!['focus-inline-result', 'view-inline-result', 'stop-preset-run', 'inline-result-previous', 'inline-result-next'].includes(action)) return false;
            const state = previewState(node);
            if (!state.result) return true;
            if (action === 'focus-inline-result') source.focusResult?.(state.result);
            else if (action === 'view-inline-result') source.resultAction?.(state.result, /^(video|audio)\//i.test(state.asset?.mime || '') ? 'view-media' : 'view-image', button, evt);
            else if (action === 'stop-preset-run') source.resultAction?.(state.result, 'stop-run', button, evt);
            else if (state.count > 1) {
                const index = (state.selected + (action === 'inline-result-next' ? 1 : -1) + state.count) % state.count;
                source.selectResultAsset?.(state.result, index);
                source.onResultSelectionChange?.(state.result);
                syncNodeDom(node, nodeEl);
            }
            return true;
        }

        function releaseNodeDom(nodeEl) {
            pauseMedia(nodeEl);
            if (nodeEl) delete nodeEl.__presentationFields;
            nodeEl?.querySelectorAll?.('video,audio').forEach(player => mediaObserver?.unobserve(player));
        }

        function reset() {
            mediaObserver?.disconnect();
            mediaObserver = null;
            latestResults.clear();
            paramLayouts.clear();
            indexedProject = null;
        }

        return { beginRender, previewState, visibleParams, renderInlinePreviewHtml, syncNodeDom, handleAction, releaseNodeDom, reset };
    }

    window.SimpAICanvasWorkbenchNodePresentation = { createCanvasNodePresentationController };
})();
