(function () {
    'use strict';

    const UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const escapeHtml = UTILS.escapeHtml || ((value) => String(value ?? ''));
    const clamp = UTILS.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));

    function createCanvasResultPreviewController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const frameSrc = (frame, fallback) => call('resultPreviewFrameSrc', '', frame, fallback);
        const frameAspect = (frame) => Number(call('resultPreviewFrameAspect', 0, frame)) || 0;
        const aspectSource = (node) => call('resultPreviewAspectSource', null, node);
        const getNode = (id) => call('getNode', null, id);
        const getNodeElement = (id) => call('getNodeElement', null, id);
        const nodeStatusState = (node) => call('nodeStatusState', '', node);
        const isRunActive = (state) => !!call('isCanvasRunActiveState', false, state);
        const cloneValue = (value, fallback) => {
            if (typeof scope.cloneRunValue === 'function') return scope.cloneRunValue(value, fallback);
            try {
                return JSON.parse(JSON.stringify(value));
            } catch (err) {
                return fallback;
            }
        };
        const maxFrames = Math.max(1, Number(scope.maxFrames || 96) || 96);
        const players = new Map();
        const setIntervalImpl = typeof scope.setInterval === 'function'
            ? scope.setInterval
            : (typeof window.setInterval === 'function' ? window.setInterval.bind(window) : null);
        const clearIntervalImpl = typeof scope.clearInterval === 'function'
            ? scope.clearInterval
            : (typeof window.clearInterval === 'function' ? window.clearInterval.bind(window) : null);

        function resultPreviewHasRenderableSource(node) {
            const source = aspectSource(node);
            const fallback = node?.preview?.data_url || node?.preview?.thumb || '';
            if (frameSrc(source, fallback)) return true;
            const player = players.get(node?.id || '');
            return !!(player && Array.isArray(player.frames) && player.frames.some(frame => frameSrc(frame)));
        }

        function shouldShowResultRunningPreview(node) {
            return !!(node && node.type === 'result' && isRunActive(nodeStatusState(node)) && resultPreviewHasRenderableSource(node));
        }

        function resultMediaDisplayAsset(node, selectedAsset) {
            if (shouldShowResultRunningPreview(node)) return null;
            return arguments.length >= 2 ? (selectedAsset || null) : call('getSelectedResultAsset', null, node);
        }

        function applyResultPreviewAspect(mediaEl, frame) {
            if (!mediaEl) return false;
            const aspect = frameAspect(frame);
            if (!aspect) return false;
            mediaEl.style.setProperty('--sai-media-aspect', aspect.toFixed(5));
            mediaEl.setAttribute('data-aspect', 'true');
            return true;
        }

        function bindResultPreviewAspectFromImage(img, mediaEl, frame) {
            if (!img || !mediaEl) return;
            applyResultPreviewAspect(mediaEl, frame);
            const update = () => {
                const width = Number(img.naturalWidth || 0);
                const height = Number(img.naturalHeight || 0);
                if (!width || !height) return;
                const aspect = clamp(width / Math.max(1, height), 0.25, 4);
                mediaEl.style.setProperty('--sai-media-aspect', aspect.toFixed(5));
                mediaEl.setAttribute('data-aspect', 'true');
            };
            if (!img.__simpaiCanvasPreviewAspectBound) {
                img.__simpaiCanvasPreviewAspectBound = true;
                img.addEventListener('load', update);
            }
            if (img.complete) update();
        }

        function bindResultNodePreviewAspect(nodeEl, node) {
            if (!nodeEl || !node || node.type !== 'result') return;
            const mediaEl = nodeEl.querySelector?.('.sai-result-media');
            if (!mediaEl) return;
            const source = resultMediaDisplayAsset(node) || aspectSource(node);
            applyResultPreviewAspect(mediaEl, source);
            bindResultPreviewAspectFromImage(mediaEl.querySelector('[data-result-preview-player], img'), mediaEl, source);
        }

        function resultPreviewLastSerial(resultNodeId) {
            const player = players.get(resultNodeId);
            return Number(player?.lastSerial || 0) || 0;
        }

        function stopResultPreviewPlayer(resultNodeId, options) {
            const player = players.get(resultNodeId);
            if (!player) return;
            if (player.timer) {
                clearIntervalImpl?.(player.timer);
                player.timer = 0;
            }
            if (!options?.keepFrames) players.delete(resultNodeId);
        }

        function ensureResultPreviewStreamDom(resultNode, nodeEl, frame) {
            const mediaEl = nodeEl?.querySelector?.('.sai-result-media');
            if (!resultNode || !mediaEl) return null;
            let img = mediaEl.querySelector('[data-result-preview-player]');
            if (img) return img;
            const src = frameSrc(frame, resultNode.preview?.data_url || resultNode.preview?.thumb || '');
            if (!src) return null;
            mediaEl.innerHTML = `<div class="sai-result-preview-stream" data-result-preview-stream="${escapeHtml(resultNode.id)}">
  <img src="${escapeHtml(src)}" alt="" data-result-preview-player="${escapeHtml(resultNode.id)}">
  <div class="sai-result-preview-strip" data-result-preview-strip></div>
</div>`;
            img = mediaEl.querySelector('[data-result-preview-player]');
            bindResultPreviewAspectFromImage(img, mediaEl, frame || resultNode.preview);
            return img;
        }

        function updateResultPreviewPlayerDom(resultNodeId) {
            const player = players.get(resultNodeId);
            if (!player || !player.frames.length) return false;
            const resultNode = getNode(resultNodeId);
            const nodeEl = getNodeElement(resultNodeId);
            if (!resultNode || !nodeEl) return false;
            const frame = player.frames[clamp(Number(player.index || 0), 0, player.frames.length - 1)] || player.frames[player.frames.length - 1];
            const img = ensureResultPreviewStreamDom(resultNode, nodeEl, frame);
            const src = frameSrc(frame);
            if (img && src && img.getAttribute('src') !== src) img.src = src;
            bindResultPreviewAspectFromImage(img, nodeEl.querySelector?.('.sai-result-media'), frame || resultNode.preview);
            const strip = nodeEl.querySelector?.('[data-result-preview-strip]');
            if (strip) strip.innerHTML = call('renderResultPreviewStripHtml', '', player.frames, frame?.serial);
            return !!img;
        }

        function startResultPreviewPlayback(resultNodeId) {
            const player = players.get(resultNodeId);
            if (!player) return;
            const hasDom = updateResultPreviewPlayerDom(resultNodeId);
            if (!hasDom || player.timer || player.frames.length <= 1 || !setIntervalImpl) return;
            const interval = Math.max(42, Math.round(1000 / clamp(Number(player.fps || 8), 1, 24)));
            player.timer = setIntervalImpl(() => {
                const liveNode = getNode(resultNodeId);
                if (!liveNode || !isRunActive(nodeStatusState(liveNode))) {
                    stopResultPreviewPlayer(resultNodeId);
                    return;
                }
                if (!player.frames.length) return;
                player.index = (Number(player.index || 0) + 1) % player.frames.length;
                updateResultPreviewPlayerDom(resultNodeId);
            }, interval);
        }

        function syncResultPreviewPlayerDom(resultNode, nodeEl) {
            if (!resultNode || resultNode.type !== 'result') return false;
            const player = players.get(resultNode.id);
            if (!player || !player.frames.length) return false;
            if (!isRunActive(nodeStatusState(resultNode))) {
                stopResultPreviewPlayer(resultNode.id);
                return false;
            }
            startResultPreviewPlayback(resultNode.id);
            updateResultPreviewPlayerDom(resultNode.id);
            return true;
        }

        function resultPreviewFreshFrames(response) {
            const stream = response?.preview_stream;
            if (!stream || typeof stream !== 'object') return [];
            return (Array.isArray(stream.frames_delta) ? stream.frames_delta : [])
                .filter((frame) => frame && typeof frame === 'object' && frameSrc(frame));
        }

        function applyResultPreviewStream(resultNode, response, state) {
            const stream = response?.preview_stream;
            if (!resultNode || !stream || typeof stream !== 'object') return false;
            const framesDelta = resultPreviewFreshFrames(response);
            if (!framesDelta.length) {
                const player = players.get(resultNode.id);
                if (player?.frames?.length && isRunActive(state)) {
                    startResultPreviewPlayback(resultNode.id);
                    return true;
                }
                return false;
            }
            let player = players.get(resultNode.id);
            if (!player) {
                player = { frames: [], index: 0, lastSerial: 0, stepKey: '', fps: 8, timer: 0 };
                players.set(resultNode.id, player);
            }
            const stepKey = String(
                framesDelta[framesDelta.length - 1]?.step_key
                || framesDelta[0]?.step_key
                || stream.step_key
                || ''
            );
            if (stepKey && player.stepKey && stepKey !== player.stepKey) {
                player.frames = [];
                player.index = 0;
            }
            if (stepKey) player.stepKey = stepKey;
            player.fps = clamp(Number(stream.fps || player.fps || 8), 1, 24);
            const seenSerials = new Set(player.frames.map(frame => Number(frame?.serial || 0)).filter(Boolean));
            let maxSerial = Number(player.lastSerial || 0) || 0;
            framesDelta.forEach((rawFrame) => {
                if (!rawFrame || typeof rawFrame !== 'object') return;
                const rawSrc = rawFrame.data_url || rawFrame.thumb || '';
                if (!rawSrc) return;
                const frame = cloneValue(rawFrame, {});
                let serial = Number(frame.serial || 0) || 0;
                if (!serial) serial = maxSerial + 1;
                frame.serial = serial;
                if (seenSerials.has(serial)) return;
                seenSerials.add(serial);
                maxSerial = Math.max(maxSerial, serial);
                player.frames.push(frame);
            });
            if (player.frames.length > maxFrames) {
                const overflow = player.frames.length - maxFrames;
                player.frames.splice(0, overflow);
                player.index = Math.max(0, Number(player.index || 0) - overflow);
            }
            player.lastSerial = Math.max(Number(player.lastSerial || 0) || 0, Number(stream.latest_serial || 0) || 0, maxSerial);
            if (player.index >= player.frames.length) player.index = 0;
            if (isRunActive(state)) startResultPreviewPlayback(resultNode.id);
            return player.frames.length > 0;
        }

        function appendResultNodePreviewFrames(resultNode, response, state) {
            if (!resultNode || !isRunActive(state)) return;
            const stream = response?.preview_stream || {};
            const hasPreviewStream = !!(response?.preview_stream && typeof response.preview_stream === 'object');
            const streamFrames = resultPreviewFreshFrames(response);
            const incoming = streamFrames.length
                ? streamFrames
                : (hasPreviewStream ? [] : (response?.preview ? [response.preview] : []));
            if (!incoming.length) return;
            const stepKey = String(stream.step_key || incoming[incoming.length - 1]?.step_key || '');
            let frames = Array.isArray(resultNode.preview_frames) ? resultNode.preview_frames.slice(-11) : [];
            if (stepKey && resultNode.preview_step_key && resultNode.preview_step_key !== stepKey) frames = [];
            if (stepKey) resultNode.preview_step_key = stepKey;
            const seen = new Set(frames.map((frame) => {
                const serial = Number(frame?.serial || 0) || 0;
                return serial ? `s:${serial}` : `u:${frame?.data_url || frame?.thumb || ''}`;
            }));
            incoming.forEach((rawFrame) => {
                if (!rawFrame || typeof rawFrame !== 'object') return;
                const src = rawFrame.data_url || rawFrame.thumb || '';
                if (!src) return;
                const serial = Number(rawFrame.serial || 0) || 0;
                const key = serial ? `s:${serial}` : `u:${src}`;
                if (seen.has(key)) return;
                seen.add(key);
                frames.push(cloneValue(rawFrame, {}));
            });
            resultNode.preview_frames = frames.slice(-12);
        }

        return {
            appendResultNodePreviewFrames,
            applyResultPreviewAspect,
            applyResultPreviewStream,
            bindResultNodePreviewAspect,
            bindResultPreviewAspectFromImage,
            ensureResultPreviewStreamDom,
            resultMediaDisplayAsset,
            resultPreviewFreshFrames,
            resultPreviewHasRenderableSource,
            resultPreviewLastSerial,
            shouldShowResultRunningPreview,
            startResultPreviewPlayback,
            stopResultPreviewPlayer,
            syncResultPreviewPlayerDom,
            updateResultPreviewPlayerDom
        };
    }

    window.SimpAICanvasWorkbenchResultPreview = {
        createCanvasResultPreviewController
    };
})();
