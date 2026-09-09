(function () {
    'use strict';

    function createCanvasTimelineCommandController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const isNodeLocked = (node) => !!call('isNodeLocked', false, node);
        const clamp = typeof scope.clamp === 'function'
            ? scope.clamp
            : (value, min, max) => Math.max(min, Math.min(max, value));

        const selectedVisualClip = (node) => call('timelineSelectedVisualClip', null, node);
        const keyframeTime = (node) => Number(call('timelineKeyframeTime', 0, node));
        const keyframeIndexAt = (clip, time) => Number(call('timelineKeyframeIndexAt', -1, clip, time));
        const keyframeValuesAtPlayhead = (node, clip) => call('timelineKeyframeValuesAtPlayhead', {}, node, clip) || {};
        const normalizedKeyframes = (clip) => {
            const frames = call('timelineNormalizedKeyframes', [], clip);
            return Array.isArray(frames) ? frames : [];
        };
        const normalizeTimelineNode = (node) => call('normalizeTimelineNode', undefined, node);
        const mutateTimeline = () => call('mutate', undefined, { inspector: true });
        const toast = (message) => call('showToast', undefined, message);

        function selectTimelineClip(node, clipId, options) {
            if (!node || node.type !== 'timeline' || !clipId) return null;
            const clip = (node.clips || []).find(item => item.id === clipId);
            if (!clip) return null;
            node.params = Object.assign({}, node.params || {}, {
                selected_clip_id: clip.id,
                playhead: clamp(Number(node.params?.playhead ?? clip.start), 0, Number(node.params?.duration || 1))
            });
            call('setSelectedNodeId', undefined, node.id);
            call('setSelectedNodeIds', undefined, [node.id]);
            call('setSelectedEdgeId', undefined, null);
            if (options?.render !== false) call('mutate', undefined, { inspector: true });
            else call('scheduleSave');
            return clip;
        }

        function moveTimelineTrack(node, trackId, direction) {
            if (!node || node.type !== 'timeline' || isNodeLocked(node)) return;
            const tracks = Array.isArray(node.tracks) ? node.tracks : [];
            const index = tracks.findIndex(track => track.id === trackId);
            const delta = direction === 'up' ? -1 : 1;
            const next = index + delta;
            if (index < 0 || next < 0 || next >= tracks.length) return;
            call('pushHistory', undefined, 'Reorder timeline track');
            const copy = tracks.slice();
            const [track] = copy.splice(index, 1);
            copy.splice(next, 0, track);
            node.tracks = copy;
            call('mutate', undefined, { inspector: true });
        }

        function closeTimelineCustomSelects(nodeEl, selected) {
            nodeEl?.querySelectorAll?.('.sai-timeline-custom-select.is-open').forEach((element) => {
                if (element !== selected) element.classList.remove('is-open');
            });
        }

        function handleTimelineClick(nodeEl, node, evt) {
            if (!node || node.type !== 'timeline' || !evt?.target) return false;
            const target = evt.target;
            const selectButton = target.closest?.('[data-timeline-select-button]');
            if (selectButton) {
                evt.preventDefault();
                evt.stopPropagation();
                const select = selectButton.closest?.('[data-timeline-select]');
                const wasOpen = select?.classList.contains('is-open');
                closeTimelineCustomSelects(nodeEl, select);
                if (select) select.classList.toggle('is-open', !wasOpen);
            return true;
        }

            const selectOption = target.closest?.('[data-timeline-select-option]');
            if (selectOption) {
                evt.preventDefault();
                evt.stopPropagation();
                const select = selectOption.closest?.('[data-timeline-select]');
                const key = select?.getAttribute('data-timeline-select') || '';
                const value = selectOption.getAttribute('data-timeline-select-option');
                if (key) call('updateTimelineParam', undefined, node.id, key, value, 'text', { render: true });
                return true;
            }
            if (!target.closest?.('.sai-timeline-custom-select')) closeTimelineCustomSelects(nodeEl, null);

            const timelineReset = target.closest?.('[data-timeline-reset]');
            if (timelineReset) {
                evt.preventDefault();
                evt.stopPropagation();
                call('resetTimelineParam', undefined, node, timelineReset.getAttribute('data-timeline-reset'));
                return true;
            }
            const timelineClipReset = target.closest?.('[data-timeline-clip-reset]');
            if (timelineClipReset) {
                evt.preventDefault();
                evt.stopPropagation();
                const [clipId, key] = String(timelineClipReset.getAttribute('data-timeline-clip-reset') || '').split(':');
                call('resetTimelineClipParam', undefined, node, clipId, key);
                return true;
            }
            const timelineToggleParam = target.closest?.('[data-timeline-toggle-param]');
            if (timelineToggleParam) {
                evt.preventDefault();
                evt.stopPropagation();
                const key = timelineToggleParam.getAttribute('data-timeline-toggle-param');
                const next = !(node.params?.[key] !== false);
                call('updateTimelineParam', undefined, node.id, key, next, 'checkbox', { render: true });
                return true;
            }
            const timelineMaskMode = target.closest?.('[data-timeline-toggle-mask-mode]');
            if (timelineMaskMode) {
                evt.preventDefault();
                evt.stopPropagation();
                call('updateTimelineParam', undefined, node.id, 'mask_mode', timelineMaskMode.getAttribute('data-timeline-toggle-mask-mode'), 'text', { render: true });
                return true;
            }
            const timelineTrackAction = target.closest?.('[data-timeline-track-action]');
            if (timelineTrackAction) {
                evt.preventDefault();
                evt.stopPropagation();
                const trackId = timelineTrackAction.closest?.('[data-timeline-track]')?.getAttribute('data-timeline-track') || '';
                moveTimelineTrack(node, trackId, timelineTrackAction.getAttribute('data-timeline-track-action'));
                return true;
            }
            const timelineKeyframeJump = target.closest?.('[data-timeline-keyframe-jump]');
            if (timelineKeyframeJump) {
                evt.preventDefault();
                evt.stopPropagation();
                jumpTimelineKeyframeFromElement(node, timelineKeyframeJump);
                return true;
            }
            const timelineTool = target.closest?.('[data-timeline-tool]');
            if (timelineTool) {
                evt.preventDefault();
                evt.stopPropagation();
                call('updateTimelineParam', undefined, node.id, 'preview_tool', timelineTool.getAttribute('data-timeline-tool'), 'text', { render: true });
                return true;
            }
            const timelineClip = target.closest?.('[data-timeline-clip-id]');
            if (timelineClip) {
                evt.preventDefault();
                evt.stopPropagation();
                selectTimelineClip(node, timelineClip.getAttribute('data-timeline-clip-id'));
                return true;
            }
            return false;
        }

        function resetTimelineActiveTool(node) {
            if (!node || node.type !== 'timeline' || isNodeLocked(node)) return false;
            const clip = selectedVisualClip(node);
            if (!clip) {
                toast('Select a visual clip first.');
                return false;
            }
            const tool = ['transform', 'crop', 'mask'].includes(node.params?.preview_tool) ? node.params.preview_tool : 'transform';
            call('pushHistory', undefined, `Reset timeline ${tool}`);
            if (tool === 'crop') {
                clip.crop_left = 0;
                clip.crop_right = 0;
                clip.crop_top = 0;
                clip.crop_bottom = 0;
            } else if (tool === 'mask') {
                delete clip.mask;
                delete clip.mask_asset;
                delete clip.mask_data_url;
            } else {
                clip.x = 0;
                clip.y = 0;
                clip.scale = 1;
                clip.rotate = 0;
                clip.opacity = 1;
                call('syncTimelineClipTransformKeyframeAtPlayhead', undefined, node, clip, ['x', 'y', 'scale', 'rotate', 'opacity']);
            }
            normalizeTimelineNode(node);
            mutateTimeline();
            return true;
        }

        function upsertTimelineClipKeyframe(node) {
            const clip = selectedVisualClip(node);
            if (!node || !clip || isNodeLocked(node)) {
                toast('Select a visual clip first.');
                return false;
            }
            const playhead = keyframeTime(node);
            const frames = Array.isArray(clip.keyframes) ? clip.keyframes.slice() : [];
            const index = keyframeIndexAt(clip, playhead);
            const frame = {
                id: index >= 0 ? frames[index].id : call('uid', '', 'kf'),
                time: Math.round(playhead * 1000) / 1000,
                values: keyframeValuesAtPlayhead(node, clip),
                easing: 'linear'
            };
            call('pushHistoryBatch', undefined, `timeline-keyframe:${node.id}:${clip.id}`, index >= 0 ? 'Update timeline keyframe' : 'Add timeline keyframe');
            if (index >= 0) frames[index] = frame;
            else frames.push(frame);
            clip.keyframes = frames.sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
            normalizeTimelineNode(node);
            mutateTimeline();
            toast(index >= 0
                ? call('t', 'Keyframe updated.', '关键帧已更新')
                : call('t', 'Keyframe added.', '关键帧已添加'));
            return true;
        }

        function deleteTimelineClipKeyframeAtPlayhead(node) {
            const clip = selectedVisualClip(node);
            if (!node || !clip || isNodeLocked(node)) {
                toast('Select a visual clip first.');
                return false;
            }
            const playhead = keyframeTime(node);
            const frames = Array.isArray(clip.keyframes) ? clip.keyframes.slice() : [];
            const next = frames.filter(frame => Math.abs(Number(frame.time || 0) - playhead) >= 0.025);
            if (next.length === frames.length) {
                toast(call('t', 'No keyframe at the playhead.', '播放头位置没有关键帧'));
                return false;
            }
            call('pushHistoryBatch', undefined, `timeline-keyframe:${node.id}:${clip.id}`, 'Delete timeline keyframe');
            clip.keyframes = next;
            normalizeTimelineNode(node);
            mutateTimeline();
            toast(call('t', 'Keyframe deleted.', '关键帧已删除'));
            return true;
        }

        function jumpTimelineToKeyframe(node, clipId, time) {
            if (!node || node.type !== 'timeline' || isNodeLocked(node)) return false;
            const clip = (node.clips || []).find(item => item.id === clipId && item.kind !== 'audio');
            if (!clip) {
                toast('Select a visual clip first.');
                return false;
            }
            const playhead = clamp(Number(time || 0), 0, Math.max(1, Number(node.params?.duration || 1)));
            call('pushHistoryBatch', undefined, `timeline-keyframe-jump:${node.id}:${clip.id}`, 'Jump to timeline keyframe');
            node.params = Object.assign({}, node.params || {}, {
                selected_clip_id: clip.id,
                playhead
            });
            normalizeTimelineNode(node);
            mutateTimeline();
            return true;
        }

        function jumpTimelineKeyframeFromElement(node, element) {
            const raw = String(element?.getAttribute?.('data-timeline-keyframe-jump') || '');
            const [clipId, timeValue] = raw.split(':');
            if (!clipId) return false;
            return jumpTimelineToKeyframe(node, clipId, Number(timeValue || 0));
        }

        function setTimelineKeyframeEasing(node, clipId, time, easing) {
            if (!node || node.type !== 'timeline' || isNodeLocked(node)) return false;
            const clip = (node.clips || []).find(item => item.id === clipId && item.kind !== 'audio');
            if (!clip) return false;
            const frames = Array.isArray(clip.keyframes) ? clip.keyframes.slice() : [];
            const index = frames.findIndex(frame => Math.abs(Number(frame.time || 0) - Number(time || 0)) < 0.025);
            if (index < 0) return false;
            const allowed = ['linear', 'hold', 'ease_in', 'ease_out', 'easy_ease'];
            const next = allowed.includes(easing) ? easing : 'linear';
            call('pushHistoryBatch', undefined, `timeline-keyframe-easing:${node.id}:${clip.id}`, 'Change timeline keyframe easing');
            frames[index] = Object.assign({}, frames[index], { easing: next });
            clip.keyframes = frames;
            normalizeTimelineNode(node);
            mutateTimeline();
            toast(`Keyframe easing: ${next.replace(/_/g, ' ')}`);
            return true;
        }

        function jumpTimelineClipKeyframe(node, direction) {
            const clip = selectedVisualClip(node);
            if (!node || !clip || isNodeLocked(node)) {
                toast('Select a visual clip first.');
                return false;
            }
            const frames = normalizedKeyframes(clip);
            if (!frames.length) {
                toast(call('t', 'Current clip has no keyframes.', '当前剪辑没有关键帧'));
                return false;
            }
            const playhead = keyframeTime(node);
            const sorted = frames.slice().sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
            const target = direction < 0
                ? (sorted.slice().reverse().find(frame => Number(frame.time || 0) < playhead - 0.025) || sorted[sorted.length - 1])
                : (sorted.find(frame => Number(frame.time || 0) > playhead + 0.025) || sorted[0]);
            return jumpTimelineToKeyframe(node, clip.id, Number(target.time || 0));
        }

        function openTimelineKeyframeContextMenu(node, marker, x, y) {
            const raw = String(marker?.getAttribute?.('data-timeline-keyframe-jump') || '');
            const [clipId, timeValue] = raw.split(':');
            const time = Number(timeValue || marker?.getAttribute?.('data-timeline-keyframe-time') || 0);
            const choices = [
                ['linear', 'Linear', 'fa-grip-lines'],
                ['hold', 'Hold', 'fa-pause'],
                ['ease_in', 'Ease In', 'fa-arrow-right'],
                ['ease_out', 'Ease Out', 'fa-arrow-left'],
                ['easy_ease', 'Easy Ease', 'fa-wave-square']
            ];
            call('openContextMenu', undefined, x, y, choices.map(([value, label, icon]) => ({
                label,
                icon,
                action: () => setTimelineKeyframeEasing(node, clipId, time, value)
            })));
            return true;
        }

        function handleTimelineAction(action, node, element) {
            if (!node || node.type !== 'timeline') return false;
            if (action === 'timeline-keyframe-toggle') {
                upsertTimelineClipKeyframe(node);
                return true;
            }
            if (action === 'timeline-keyframe-delete') {
                deleteTimelineClipKeyframeAtPlayhead(node);
                return true;
            }
            if (action === 'timeline-keyframe-prev') {
                jumpTimelineClipKeyframe(node, -1);
                return true;
            }
            if (action === 'timeline-keyframe-next') {
                jumpTimelineClipKeyframe(node, 1);
                return true;
            }
            if (action === 'timeline-keyframe-jump') {
                const clipId = element?.getAttribute?.('data-timeline-keyframe-clip') || node.params?.selected_clip_id || '';
                jumpTimelineToKeyframe(node, clipId, Number(element?.getAttribute?.('data-timeline-keyframe-time') || 0));
                return true;
            }
            if (action === 'timeline-reset-active-tool') {
                resetTimelineActiveTool(node);
                return true;
            }
            if (action === 'timeline-duration-playhead') {
                setTimelineDurationToPlayhead(node);
                return true;
            }
            if (action === 'timeline-duration-content') {
                setTimelineDurationToContent(node);
                return true;
            }
            if (action === 'timeline-swap-size') {
                swapTimelineSize(node);
                return true;
            }
            return false;
        }

        function setTimelineDurationToPlayhead(node) {
            if (!node || node.type !== 'timeline' || isNodeLocked(node)) return false;
            const playhead = Math.max(1, Number(node.params?.playhead || 0));
            call('pushHistory', undefined, 'Trim timeline duration to playhead');
            node.params = Object.assign({}, node.params || {}, {
                duration: playhead,
                playhead: clamp(Number(node.params?.playhead || 0), 0, playhead)
            });
            normalizeTimelineNode(node);
            mutateTimeline();
            return true;
        }

        function setTimelineDurationToContent(node) {
            if (!node || node.type !== 'timeline' || isNodeLocked(node)) return false;
            const duration = Math.max(1, Number(call('timelineDuration', 1, node)) || 1);
            call('pushHistory', undefined, 'Fit timeline duration to content');
            node.params = Object.assign({}, node.params || {}, {
                duration,
                playhead: clamp(Number(node.params?.playhead || 0), 0, duration)
            });
            normalizeTimelineNode(node);
            mutateTimeline();
            return true;
        }

        function swapTimelineSize(node) {
            if (!node || node.type !== 'timeline' || isNodeLocked(node)) return false;
            const maskGeometrySnapshot = call('captureTimelineMaskGeometry', null, node);
            const width = Math.max(16, Number(node.params?.width || 1280));
            const height = Math.max(16, Number(node.params?.height || 720));
            call('pushHistory', undefined, 'Swap timeline size');
            node.params = Object.assign({}, node.params || {}, {
                width: height,
                height: width,
                aspect: `${height}:${width}`,
                size_preset: `${height}x${width}`
            });
            call('remapTimelineMasksAfterCanvasResize', undefined, node, maskGeometrySnapshot);
            normalizeTimelineNode(node);
            mutateTimeline();
            return true;
        }

        function deleteTimelineClipById(node, clipId) {
            if (!node || node.type !== 'timeline' || isNodeLocked(node) || !clipId) return false;
            const clip = (node.clips || []).find(item => item.id === clipId);
            if (!clip) return false;
            const project = call('getProject', null) || {};
            const edges = Array.isArray(project.edges) ? project.edges : [];
            call('pushHistory', undefined, 'Delete timeline clip');
            node.clips = node.clips.filter(item => item.id !== clipId);
            project.edges = edges.filter(edge => !(edge.type === 'timeline' && edge.to === node.id && edge.slot === clipId));
            if (node.params?.selected_clip_id === clipId) {
                node.params.selected_clip_id = node.clips[0]?.id || '';
            }
            mutateTimeline();
            return true;
        }

        function focusTimelineClipSource(node, clipId) {
            const project = call('getProject', null) || {};
            const edges = Array.isArray(project.edges) ? project.edges : [];
            const edge = edges.find(item => item.type === 'timeline' && item.to === node?.id && item.slot === clipId);
            const clip = (node?.clips || []).find(item => item.id === clipId);
            const source = call('getNode', null, edge?.from || clip?.source_node_id);
            if (!source) {
                toast(call('t', 'Source node is missing.', '源节点不存在。'));
                return false;
            }
            call('setSelectedNodeId', undefined, source.id);
            call('setSelectedNodeIds', undefined, [source.id]);
            call('setSelectedEdgeId', undefined, null);
            const fallbackSize = { w: 320, h: 200 };
            const size = call('defaultNodeSize', fallbackSize, source.type) || fallbackSize;
            call('centerViewportOnWorld', undefined,
                (source.x || 0) + (source.w || size.w) / 2,
                (source.y || 0) + (source.h || size.h) / 2);
            return true;
        }

        function openTimelineClipContextMenu(node, clipId, x, y) {
            const clip = (node?.clips || []).find(item => item.id === clipId);
            if (!clip) return false;
            const project = call('getProject', null) || {};
            const edges = Array.isArray(project.edges) ? project.edges : [];
            const edge = edges.find(item => item.type === 'timeline' && item.to === node.id && item.slot === clipId);
            call('openContextMenu', undefined, x, y, [
                {
                    label: call('t', 'Go to source node', '跳转到源节点'),
                    icon: 'fa-location-crosshairs',
                    action: () => focusTimelineClipSource(node, clipId)
                },
                {
                    label: edge
                        ? call('t', 'Disconnect this media clip', '断开该素材剪辑')
                        : call('t', 'Delete this clip', '删除该剪辑'),
                    icon: edge ? 'fa-link-slash' : 'fa-trash',
                    danger: !edge,
                    action: () => edge
                        ? call('deleteEdge', undefined, edge.id)
                        : deleteTimelineClipById(node, clipId)
                }
            ]);
            return true;
        }

        return {
            selectTimelineClip,
            moveTimelineTrack,
            handleTimelineClick,
            resetTimelineActiveTool,
            upsertTimelineClipKeyframe,
            deleteTimelineClipKeyframeAtPlayhead,
            jumpTimelineToKeyframe,
            jumpTimelineKeyframeFromElement,
            setTimelineKeyframeEasing,
            jumpTimelineClipKeyframe,
            openTimelineKeyframeContextMenu,
            handleTimelineAction,
            setTimelineDurationToPlayhead,
            setTimelineDurationToContent,
            swapTimelineSize,
            deleteTimelineClipById,
            focusTimelineClipSource,
            openTimelineClipContextMenu
        };
    }

    window.SimpAICanvasWorkbenchTimelineCommand = Object.assign({}, window.SimpAICanvasWorkbenchTimelineCommand || {}, {
        createCanvasTimelineCommandController
    });
})();
