(function () {
    'use strict';

    function createCanvasPoseStudioSmokeController(context) {
        const scope = context?.poseStudioSmokeSource || context || {};
        const stateSource = scope.stateSource || {};
        const projectSource = scope.projectSource || {};
        const lifecycleSource = scope.lifecycleSource || {};
        const nodeSource = scope.nodeSource || {};
        const renderSource = scope.renderSource || {};
        const domSource = scope.domSource || {};
        const timingSource = scope.timingSource || {};
        const timeSource = scope.timeSource || {};
        const utilitySource = scope.utilitySource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const cloneSet = (value) => value && typeof value[Symbol.iterator] === 'function'
            ? new Set(value)
            : new Set(Array.isArray(value) ? value : []);
        const currentTime = () => {
            const value = Number(call(timeSource, 'now', 0));
            return Number.isFinite(value) ? value : 0;
        };
        const cssEscape = (value) => String(call(utilitySource, 'cssEscape', value, value));
        const requestFrame = (callback) => call(timingSource, 'requestAnimationFrame', null, callback);
        const waitForFrames = async (count) => {
            const total = Math.max(0, Number(count) || 0);
            for (let index = 0; index < total; index += 1) {
                await new Promise((resolve) => {
                    if (typeof timingSource.requestAnimationFrame !== 'function') {
                        resolve();
                        return;
                    }
                    const handle = requestFrame(resolve);
                    if (handle == null) resolve();
                });
            }
        };

        function smokePoseStudioAsset() {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#111827"/><path d="M256 74c42 0 76 34 76 76 0 26-13 49-33 63l53 169 72 58-25 31-88-70-43-136-43 136-88 70-25-31 72-58 53-169c-20-14-33-37-33-63 0-42 34-76 76-76Z" fill="#f8fafc"/><circle cx="256" cy="150" r="42" fill="#38bdf8"/><path d="M183 258h146" stroke="#22c55e" stroke-width="28" stroke-linecap="round"/></svg>`;
            const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
            return {
                kind: 'pose_studio_smoke',
                asset_id: `pose_studio_smoke_${currentTime().toString(36)}`,
                name: 'pose-studio-smoke.svg',
                mime: 'image/svg+xml',
                width: 512,
                height: 512,
                data_url: dataUrl,
                thumb: dataUrl,
                source: { kind: 'pose_studio_smoke' }
            };
        }

        async function runPoseStudioCanvasSmoke(options) {
            const opts = options || {};
            const previousProject = call(
                projectSource,
                'cloneRunValue',
                call(stateSource, 'getProject', null),
                call(stateSource, 'getProject', null),
                null
            );
            const previousSelectedNodeId = call(stateSource, 'getSelectedNodeId', null);
            const previousSelectedNodeIds = cloneSet(call(stateSource, 'getSelectedNodeIds', new Set()));
            const previousSelectedEdgeId = call(stateSource, 'getSelectedEdgeId', null);
            const previousSelectedGroupId = call(stateSource, 'getSelectedGroupId', null);

            try {
                call(lifecycleSource, 'stopTimelinePlayback', undefined);
                const smokeProject = call(projectSource, 'sanitizeProject', null, Object.assign({}, previousProject || {}, {
                    id: `pose-studio-smoke-${currentTime().toString(36)}`,
                    nodes: [],
                    edges: [],
                    groups: [],
                    runs: [],
                    settings: Object.assign({}, previousProject?.settings || {}, { __pose_studio_smoke: true })
                }));
                call(stateSource, 'setProject', undefined, smokeProject);
                call(lifecycleSource, 'resetRenderedProjectDomCache', undefined);
                call(stateSource, 'setSelection', undefined, {
                    nodeId: null,
                    nodeIds: new Set(),
                    edgeId: null,
                    groupId: null
                });

                const asset = opts.placeholder ? null : Object.assign(smokePoseStudioAsset(), opts.asset || {});
                const poseNode = call(nodeSource, 'addPoseStudioNode', null, { x: 0, y: 0 }, {
                    history: false,
                    render: false,
                    toast: false,
                    asset,
                    pose_studio: {
                        pose_data: { smoke: true },
                        editor_state: {},
                        reference_asset: null,
                        output_asset: asset || null,
                        updated_at: call(utilitySource, 'nowIso', '')
                    }
                });
                const presetEntry = Object.assign({
                    name: 'PoseStudioSmokePreset',
                    display_name: 'Pose Studio Smoke Preset',
                    backend_engine: 'Smoke',
                    engine_type: 'image',
                    scene: true,
                    schema: {
                        scene_frontend: true,
                        upload_slots: [
                            { key: 'scene_input_image1', label: 'Pose Image', visible: true, interactive: true }
                        ],
                        params: [
                            { key: 'prompt', label: 'Positive Prompt', type: 'textarea', default: '' },
                            { key: 'negative_prompt', label: 'Negative Prompt', type: 'textarea', default: '' },
                            { key: 'seed_random', label: 'Random Seed', type: 'checkbox', default: true }
                        ]
                    },
                    model_list: [],
                    has_model_probe: false,
                    source: 'pose_studio_smoke'
                }, opts.presetEntry || {});
                const presetNode = call(nodeSource, 'addPresetNode', null, presetEntry, { x: 480, y: 0 }, {
                    history: false,
                    render: false,
                    collapsed: false,
                    source: { kind: 'pose_studio_smoke' }
                });
                const visibleSlots = call(nodeSource, 'getVisibleUploadSlots', [], presetNode) || [];
                const slot = opts.slot || visibleSlots.find((item) => call(
                    nodeSource,
                    'canNodeConnectToUploadSlot',
                    false,
                    poseNode,
                    item.key
                ))?.key || 'scene_input_image1';
                const connected = call(nodeSource, 'connectUploadEdgeApi', {
                    ok: false,
                    edge_id: ''
                }, poseNode.id, presetNode.id, slot, { silent: true });
                call(renderSource, 'renderAll', undefined);
                await waitForFrames(2);

                const latestPose = call(nodeSource, 'getNode', null, poseNode.id);
                const latestPreset = call(nodeSource, 'getNode', null, presetNode.id);
                const nodesLayer = call(domSource, 'getNodesLayer', null);
                const poseEl = nodesLayer?.querySelector?.(`[data-node-id="${cssEscape(poseNode.id)}"]`) || null;
                const presetEl = nodesLayer?.querySelector?.(`[data-node-id="${cssEscape(presetNode.id)}"]`) || null;
                const slotEl = presetEl?.querySelector?.(`[data-slot-row="${cssEscape(slot)}"]`) || null;
                const imageEl = poseEl?.querySelector?.('.sai-pose-studio-media img') || null;
                const slotText = (slotEl?.textContent || '').replace(/\s+/g, ' ').trim();
                const project = call(stateSource, 'getProject', null) || {};
                const result = {
                    ok: !!connected.ok
                        && latestPreset?.upload_slots?.[slot] === latestPose?.id
                        && call(nodeSource, 'canNodeConnectToUploadSlot', false, latestPose, slot),
                    pose_node_id: latestPose?.id || '',
                    preset_node_id: latestPreset?.id || '',
                    slot,
                    edge_id: connected.edge_id || '',
                    upload_slot_value: latestPreset?.upload_slots?.[slot] || '',
                    edge_count: (project.edges || []).filter((edge) => edge.type === 'upload'
                        && edge.from === latestPose?.id
                        && edge.to === latestPreset?.id
                        && edge.slot === slot).length,
                    pose_image_visible: !!imageEl && !!(imageEl.currentSrc || imageEl.src),
                    slot_text: slotText,
                    source_ok: call(nodeSource, 'isPoseStudioImageSource', false, latestPose),
                    can_connect: call(nodeSource, 'canNodeConnectToUploadSlot', false, latestPose, slot)
                };
                if (!result.ok) {
                    result.error = `Pose Studio upload connection failed: ${JSON.stringify({
                        connected,
                        upload_slot_value: result.upload_slot_value,
                        source_ok: result.source_ok,
                        can_connect: result.can_connect
                    })}`;
                }
                return result;
            } finally {
                const restoredProject = call(
                    projectSource,
                    'sanitizeProject',
                    null,
                    previousProject || call(projectSource, 'loadStoredProject', null)
                );
                call(stateSource, 'setProject', undefined, restoredProject);
                call(lifecycleSource, 'resetRenderedProjectDomCache', undefined);
                call(stateSource, 'setSelection', undefined, {
                    nodeId: previousSelectedNodeId,
                    nodeIds: previousSelectedNodeIds,
                    edgeId: previousSelectedEdgeId,
                    groupId: previousSelectedGroupId
                });
                call(renderSource, 'renderAll', undefined);
                call(lifecycleSource, 'resetGalleryFrostReveals', undefined);
            }
        }

        return {
            smokePoseStudioAsset,
            waitForFrames,
            runPoseStudioCanvasSmoke
        };
    }

    window.SimpAICanvasWorkbenchPoseStudioSmoke = Object.assign(
        {},
        window.SimpAICanvasWorkbenchPoseStudioSmoke || {},
        { createCanvasPoseStudioSmokeController }
    );
})();
