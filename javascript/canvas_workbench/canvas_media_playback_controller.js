(function () {
    'use strict';

    function createCanvasMediaPlaybackController(context) {
        const scope = context?.mediaPlaybackSource || context || {};
        const domSource = scope.domSource || {};
        const nodeSource = scope.nodeSource || {};
        const resultAssetSource = scope.resultAssetSource || {};
        const patchSource = scope.patchSource || {};
        const assetSource = scope.assetSource || {};
        const utilitySource = scope.utilitySource || {};
        const storageSource = scope.storageSource || {};
        const renderSource = scope.renderSource || {};
        const mediaSource = scope.mediaSource || {};
        const interactionSource = scope.interactionSource || {};
        const call = (source, name, fallback, ...args) => typeof source?.[name] === 'function'
            ? source[name](...args)
            : fallback;
        const clamp = (value, min, max) => call(
            utilitySource,
            'clamp',
            Math.max(min, Math.min(max, value)),
            value,
            min,
            max
        );

        function updateAudioWaveformPlayhead(media) {
            if (!media || media.tagName !== 'AUDIO') return;
            const nodeEl = media.closest('[data-node-id]');
            if (!nodeEl) return;
            const duration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : 0;
            const current = Math.max(0, Number(media.currentTime || 0) || 0);
            const playhead = duration > 0 ? clamp((current / duration) * 100, 0, 100) : 0;
            const isPlaying = !media.paused && !media.ended && duration > 0;
            nodeEl.querySelectorAll('.sai-audio-waveform').forEach((track) => {
                track.style.setProperty('--playhead', `${playhead.toFixed(3)}%`);
                track.classList.toggle('has-playhead', duration > 0);
                track.classList.toggle('is-playing', isPlaying);
            });
        }

        function handleNodeMediaMetadataLoaded(evt) {
            const media = evt?.target;
            if (!media || !['VIDEO', 'AUDIO'].includes(media.tagName)) return;
            const nodeEl = media.closest('[data-node-id]');
            const node = nodeEl ? call(nodeSource, 'getNode', null, nodeEl.getAttribute('data-node-id')) : null;
            if (!node) return;
            const asset = node.type === 'result'
                ? call(resultAssetSource, 'getSelectedResultAsset', null, node)
                : node.asset;
            if (!asset || typeof asset !== 'object') return;

            const metadataPatch = {};
            if (media.tagName === 'VIDEO') {
                const width = media.videoWidth || 0;
                const height = media.videoHeight || 0;
                if (width && height && (!asset.width || !asset.height)) {
                    metadataPatch.width = width;
                    metadataPatch.height = height;
                }
            }
            const mediaDuration = Number.isFinite(media.duration) && media.duration > 0
                ? Math.round(media.duration * 100) / 100
                : 0;
            if (mediaDuration && !asset.duration) metadataPatch.duration = mediaDuration;
            const effectiveDuration = Number(asset.duration || metadataPatch.duration || 0);
            if (media.tagName === 'VIDEO' && asset.fps && effectiveDuration && !asset.frame_count) {
                metadataPatch.frame_count = Math.max(1, Math.round(effectiveDuration * Number(asset.fps)));
            }
            if (Number.isFinite(media.duration) && media.duration > 0 && media.hasAttribute('data-media-player')) {
                const range = call(assetSource, 'getMediaEditRange', {
                    start: 0,
                    end: Number(asset.duration || 0) || 0
                }, asset);
                if (range.start > 0 && Math.abs((media.currentTime || 0) - range.start) > 0.25) {
                    try {
                        media.currentTime = range.start;
                    } catch (err) {
                        // Some browsers reject early seeks before enough metadata is buffered.
                    }
                }
            }
            if (!Object.keys(metadataPatch).length) return;

            const nodePatch = node.type === 'result'
                ? call(patchSource, 'buildResultSelectedAssetMetadataPatch', {}, node, { metadata: metadataPatch })
                : call(patchSource, 'buildMediaNodeStatePatch', {}, node, { assetPatch: metadataPatch });
            Object.assign(node, nodePatch);
            const updatedAsset = node.type === 'result'
                ? call(resultAssetSource, 'getSelectedResultAsset', null, node)
                : node.asset;
            const box = media.closest('.sai-node-media');
            if (box && updatedAsset?.width && updatedAsset?.height) {
                const ratio = Number(updatedAsset.width) / Math.max(1, Number(updatedAsset.height));
                const aspect = clamp(ratio, 0.25, 4);
                box.style.setProperty('--sai-media-aspect', aspect.toFixed(5));
                box.setAttribute('data-aspect', 'true');
            }
            if (media.tagName === 'AUDIO') updateAudioWaveformPlayhead(media);
            call(storageSource, 'saveProjectToBrowserCache');
            call(renderSource, 'renderEdges');
            call(renderSource, 'renderMinimap');
        }

        function handleNodeMediaTimeUpdate(evt) {
            const media = evt?.target;
            if (!media || !media.hasAttribute('data-media-player')) return;
            const nodeEl = media.closest('[data-node-id]');
            const node = nodeEl ? call(nodeSource, 'getNode', null, nodeEl.getAttribute('data-node-id')) : null;
            if (!node || !['video', 'audio'].includes(node.type)) return;
            updateAudioWaveformPlayhead(media);
            const range = call(assetSource, 'getMediaEditRange', null, node.asset || {});
            if (!range?.duration || !range.clipped || media.paused) return;
            if ((media.currentTime || 0) >= range.end) {
                media.pause();
                call(mediaSource, 'seekNodeMediaPlayer', undefined, node.id, range.start, { immediate: true });
            }
        }

        function handleNodeMediaPlaybackStateChanged(evt) {
            const media = evt?.target;
            if (!media || !media.hasAttribute('data-media-player')) return;
            updateAudioWaveformPlayhead(media);
        }

        function bindNodeMediaControlEvents(scopeElement) {
            if (!scopeElement?.querySelectorAll) return;
            scopeElement.querySelectorAll('.sai-node-media video, .sai-node-media audio').forEach((media) => {
                if (media.__simpaiCanvasMediaControlsBound) return;
                media.__simpaiCanvasMediaControlsBound = true;
                ['pointerdown', 'pointerup', 'click', 'dblclick'].forEach((eventName) => {
                    media.addEventListener(eventName, (evt) => {
                        if (eventName === 'pointerdown') {
                            const nodeEl = media.closest('[data-node-id]');
                            const node = nodeEl
                                ? call(nodeSource, 'getNode', null, nodeEl.getAttribute('data-node-id'))
                                : null;
                            if (node && call(interactionSource, 'isPickingCanvasAgentReference', false)) {
                                evt.preventDefault();
                                evt.stopPropagation();
                                if (call(interactionSource, 'addCanvasAgentReferenceFromNode', false, node)) {
                                    call(interactionSource, 'finishCanvasAgentReferencePick');
                                    call(interactionSource, 'renderCanvasAgentPanel');
                                }
                                return;
                            }
                            if (node && evt.button === 0 && !call(nodeSource, 'isNodeLocked', !!node.locked, node)) {
                                call(interactionSource, 'selectNodeFromMediaControl', undefined, node.id);
                            }
                        }
                        evt.stopPropagation();
                    }, true);
                });
            });
        }

        function bindNodeMediaEvents(nodesLayer) {
            if (!nodesLayer?.addEventListener) return false;
            nodesLayer.addEventListener('loadedmetadata', handleNodeMediaMetadataLoaded, true);
            nodesLayer.addEventListener('timeupdate', handleNodeMediaTimeUpdate, true);
            ['play', 'pause', 'seeked', 'seeking', 'ended', 'durationchange'].forEach((eventName) => {
                nodesLayer.addEventListener(eventName, handleNodeMediaPlaybackStateChanged, true);
            });
            return true;
        }

        function toggleSelectedResultMediaPlayback(node) {
            const nodesLayer = call(domSource, 'getNodesLayer', null);
            if (!nodesLayer) return false;
            const selector = `[data-node-id="${call(utilitySource, 'cssEscape', '', node.id)}"]`;
            const media = nodesLayer.querySelector(`${selector} video, ${selector} audio`);
            if (!media) return false;
            if (media.paused) media.play().catch(() => {});
            else media.pause();
            return true;
        }

        return {
            bindNodeMediaControlEvents,
            bindNodeMediaEvents,
            toggleSelectedResultMediaPlayback,
            handleNodeMediaMetadataLoaded,
            handleNodeMediaTimeUpdate,
            handleNodeMediaPlaybackStateChanged,
            updateAudioWaveformPlayhead
        };
    }

    window.SimpAICanvasWorkbenchMediaPlayback = Object.assign(
        {},
        window.SimpAICanvasWorkbenchMediaPlayback || {},
        { createCanvasMediaPlaybackController }
    );
})();
