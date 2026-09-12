(function () {
    'use strict';

    function createCanvasSpecialNodePatchFactoryController(context) {
        const scope = context || {};
        const cloneRunValue = typeof scope.cloneRunValue === 'function'
            ? scope.cloneRunValue
            : ((value, fallback) => {
                try {
                    return JSON.parse(JSON.stringify(value ?? fallback));
                } catch (err) {
                    return fallback;
                }
            });
        const nowIso = typeof scope.nowIso === 'function'
            ? scope.nowIso
            : (() => new Date().toISOString());
        const buildAssetReference = typeof scope.buildAssetReference === 'function'
            ? scope.buildAssetReference
            : (asset) => asset === null || asset === undefined ? null : cloneRunValue(asset, asset);

        function cloneValue(value, fallback) {
            return cloneRunValue(value, fallback);
        }

        function cloneAsset(asset) {
            if (asset === null || asset === undefined) return null;
            return buildAssetReference(asset);
        }

        function mergeObject(previous, next) {
            return Object.assign(
                {},
                previous && typeof previous === 'object' ? cloneValue(previous, {}) : {},
                next && typeof next === 'object' ? cloneValue(next, {}) : {}
            );
        }

        function buildSam3SourcePatch(node, options) {
            const config = options || {};
            const patch = {
                source: mergeObject(node?.source, config.sourcePatch)
            };
            if (Object.prototype.hasOwnProperty.call(config, 'inputNodeId')) {
                patch.input_node_id = config.inputNodeId ?? null;
            }
            return patch;
        }

        function buildSam3StatePatch(node, options) {
            const config = options || {};
            const hasOwn = (target, key) => target && typeof target === 'object'
                && Object.prototype.hasOwnProperty.call(target, key);
            const objectOrEmpty = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
            const defaults = objectOrEmpty(config.defaults);
            const initialState = objectOrEmpty(config.initialState);
            const statePatch = objectOrEmpty(config.statePatch);
            const patchValue = (key, optionKey) => hasOwn(config, optionKey) ? config[optionKey] : statePatch[key];
            const params = mergeObject(
                mergeObject(
                    mergeObject(
                        {
                            prompt: '',
                            score_threshold_detection: 0.5,
                            new_det_thresh: 0.7,
                            fill_hole_area: 16,
                            recondition_every_nth_frame: 16,
                            postprocess_strength: 0,
                            invert_mask: false
                        },
                        defaults.params
                    ),
                    initialState.params
                ),
                mergeObject(node?.params, patchValue('params', 'paramsPatch'))
            );
            const source = mergeObject(
                mergeObject(
                    mergeObject(
                        { kind: 'sam3_video_mask', module: 'enhanced.sam3_video_mask' },
                        defaults.source
                    ),
                    initialState.source
                ),
                mergeObject(node?.source, patchValue('source', 'sourcePatch'))
            );
            let asset = hasOwn(defaults, 'asset') ? defaults.asset : null;
            if (hasOwn(initialState, 'asset')) asset = initialState.asset;
            if (hasOwn(node, 'asset')) asset = node.asset;
            if (hasOwn(statePatch, 'asset')) asset = statePatch.asset;
            if (hasOwn(config, 'asset')) asset = config.asset;
            const status = hasOwn(config, 'status')
                ? cloneValue(config.status, {})
                : mergeObject(
                    mergeObject(
                        mergeObject(defaults.status, initialState.status),
                        node?.status
                    ),
                    patchValue('status', 'statusPatch')
                );
            return {
                params,
                asset: cloneAsset(asset),
                source,
                status
            };
        }

        function buildDirectorTimelineStatePatch(node, options) {
            const config = options || {};
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const objectOrEmpty = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
            const defaults = objectOrEmpty(config.defaults);
            const initialState = objectOrEmpty(config.initialState);
            const statePatch = objectOrEmpty(config.statePatch);
            const patchValue = (key, optionKey) => hasOwn(optionKey) ? config[optionKey] : statePatch[key];
            const director = mergeObject(
                mergeObject(
                    mergeObject(defaults.director, initialState.director),
                    node?.director
                ),
                patchValue('director', 'directorPatch')
            );
            const mediaInputs = mergeObject(
                mergeObject(
                    mergeObject(defaults.media_inputs, initialState.media_inputs),
                    node?.media_inputs
                ),
                patchValue('media_inputs', 'mediaInputsPatch')
            );
            const source = mergeObject(
                mergeObject(
                    mergeObject(
                        { kind: 'director_timeline', schema: 'simpai.director_timeline.v1' },
                        defaults.source
                    ),
                    initialState.source
                ),
                mergeObject(node?.source, patchValue('source', 'sourcePatch'))
            );
            const status = hasOwn('status')
                ? cloneValue(config.status, {})
                : mergeObject(
                    mergeObject(
                        mergeObject(defaults.status, initialState.status),
                        node?.status
                    ),
                    patchValue('status', 'statusPatch')
                );
            return {
                director,
                media_inputs: mediaInputs,
                source,
                status
            };
        }

        function buildCameraMotionSourcePatch(node, settings) {
            return {
                source: mergeObject(node?.source, {
                    settings: settings && typeof settings === 'object' ? settings : {}
                })
            };
        }

        function buildCameraMotionParamsPatch(node, params) {
            return {
                params: mergeObject(node?.params, params)
            };
        }

        function buildCameraMotionStatePatch(node, options) {
            const config = options || {};
            const defaults = config.defaults && typeof config.defaults === 'object' && !Array.isArray(config.defaults)
                ? config.defaults
                : {
                    params: {},
                    asset: null,
                    source: {
                        kind: 'camera_motion_reference',
                        module: 'enhanced.camera_motion_reference'
                    },
                    status: {}
                };
            const initialState = config.initialState && typeof config.initialState === 'object' && !Array.isArray(config.initialState)
                ? config.initialState
                : {};
            const statePatch = config.statePatch && typeof config.statePatch === 'object' && !Array.isArray(config.statePatch)
                ? config.statePatch
                : {};
            const state = Object.assign(
                {},
                cloneValue(defaults, {}),
                cloneValue(initialState, {}),
                cloneValue(node || {}, {}),
                cloneValue(statePatch, {})
            );
            const params = mergeObject(
                mergeObject(mergeObject(defaults.params, initialState.params), node?.params),
                statePatch.params
            );
            let source = mergeObject(
                mergeObject(mergeObject(defaults.source, initialState.source), node?.source),
                statePatch.source
            );
            if (Object.prototype.hasOwnProperty.call(config, 'sourceSettings')) {
                source = buildCameraMotionSourcePatch({ source }, config.sourceSettings).source;
            }
            return {
                params,
                asset: cloneAsset(state.asset),
                source,
                status: cloneValue(state.status, {})
            };
        }

        function buildSpecialNodeConnectionPatch(node, options) {
            const config = options || {};
            const patch = {};
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            if (hasOwn('inputNodeId')) patch.input_node_id = config.inputNodeId ?? null;
            if (hasOwn('referenceNodeId')) patch.reference_node_id = config.referenceNodeId ?? null;

            const livePortraitPatch = {};
            if (hasOwn('livePortraitSourceNodeId')) livePortraitPatch.source_node_id = config.livePortraitSourceNodeId ?? '';
            if (hasOwn('livePortraitReferenceNodeId')) livePortraitPatch.reference_node_id = config.livePortraitReferenceNodeId ?? '';
            if (Object.keys(livePortraitPatch).length) {
                patch.liveportrait_expression = mergeObject(node?.liveportrait_expression, livePortraitPatch);
            }
            return patch;
        }

        function buildSpecialNodeStatusPatch(node, options) {
            const config = options || {};
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
            const cloneRecord = (value) => isRecord(value) ? cloneValue(value, {}) : {};
            const status = hasOwn('status')
                ? cloneRecord(config.status)
                : cloneRecord(node?.status);
            if (hasOwn('state')) status.state = cloneValue(config.state, '');
            if (hasOwn('message')) status.message = cloneValue(config.message, '');
            if (isRecord(config.statusPatch)) Object.assign(status, cloneValue(config.statusPatch, {}));
            (Array.isArray(config.deleteKeys) ? config.deleteKeys : []).forEach((key) => {
                const name = String(key || '').trim();
                if (name) delete status[name];
            });
            return { status: cloneValue(status, {}) };
        }

        function buildStyleSelectorStatePatch(node, options) {
            const config = options || {};
            const defaults = config.defaults && typeof config.defaults === 'object' && !Array.isArray(config.defaults)
                ? config.defaults
                : {
                    selected_name: '',
                    prompt: '',
                    negative: '',
                    target_preset_id: '',
                    search: ''
                };
            const initialState = config.initialState && typeof config.initialState === 'object' && !Array.isArray(config.initialState)
                ? config.initialState
                : {};
            const statePatch = config.statePatch && typeof config.statePatch === 'object' && !Array.isArray(config.statePatch)
                ? config.statePatch
                : {};
            const initialText = config.initialText && typeof config.initialText === 'object' && !Array.isArray(config.initialText)
                ? config.initialText
                : {};
            const textPatch = config.textPatch && typeof config.textPatch === 'object' && !Array.isArray(config.textPatch)
                ? config.textPatch
                : {};
            return {
                style_selector: Object.assign(
                    {},
                    cloneValue(defaults, {}),
                    cloneValue(initialState, {}),
                    cloneValue(node?.style_selector || {}, {}),
                    cloneValue(statePatch, {})
                ),
                text: Object.assign(
                    { value: '', updated_at: '' },
                    cloneValue(initialText, {}),
                    cloneValue(node?.text || {}, {}),
                    cloneValue(textPatch, {})
                )
            };
        }

        function buildPresetSpecialControllerStatePatch(node, options) {
            const config = options || {};
            const objectOrEmpty = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
            const defaults = objectOrEmpty(config.defaults);
            const initialState = objectOrEmpty(config.initialState);
            const statePatch = objectOrEmpty(config.statePatch);
            const state = Object.assign(
                {},
                cloneValue(defaults, {}),
                cloneValue(initialState, {}),
                cloneValue(node?.special_ui, {}),
                cloneValue(statePatch, {})
            );
            if (Object.prototype.hasOwnProperty.call(config, 'kind')) state.kind = config.kind;
            if (Object.prototype.hasOwnProperty.call(config, 'updatedAt')) state.updated_at = config.updatedAt ?? '';
            return { special_ui: state };
        }

        function buildLivePortraitVideoExpressionStatePatch(node, options) {
            const config = options || {};
            const defaults = config.defaults && typeof config.defaults === 'object' && !Array.isArray(config.defaults)
                ? config.defaults
                : {
                    params: {},
                    expression_state: '',
                    expression_state_draft: '',
                    source_node_id: '',
                    source_asset: null,
                    source_frame_size: { width: 0, height: 0 },
                    face_selection: {},
                    source_face_bbox: '',
                    reference_face_bbox: '',
                    updated_at: ''
                };
            const initialState = config.initialState && typeof config.initialState === 'object' && !Array.isArray(config.initialState)
                ? config.initialState
                : {};
            const statePatch = config.statePatch && typeof config.statePatch === 'object' && !Array.isArray(config.statePatch)
                ? config.statePatch
                : {};
            const state = Object.assign(
                {},
                cloneValue(defaults, {}),
                cloneValue(initialState, {}),
                cloneValue(node?.liveportrait_video_expression || {}, {}),
                cloneValue(statePatch, {})
            );
            if (Object.prototype.hasOwnProperty.call(config, 'sourceAsset')) {
                state.source_asset = cloneAsset(config.sourceAsset);
            } else if (Object.prototype.hasOwnProperty.call(state, 'source_asset')) {
                state.source_asset = cloneAsset(state.source_asset);
            }
            if (Object.prototype.hasOwnProperty.call(config, 'updatedAt')) state.updated_at = config.updatedAt ?? '';
            return { liveportrait_video_expression: state };
        }

        function buildLtx23GuidesStatePatch(node, options) {
            const config = options || {};
            const defaults = config.defaults && typeof config.defaults === 'object' && !Array.isArray(config.defaults)
                ? config.defaults
                : { version: 1, updated_at: '' };
            const initialState = config.initialState && typeof config.initialState === 'object' && !Array.isArray(config.initialState)
                ? config.initialState
                : {};
            const statePatch = config.statePatch && typeof config.statePatch === 'object' && !Array.isArray(config.statePatch)
                ? config.statePatch
                : {};
            const state = Object.assign(
                {},
                cloneValue(defaults, {}),
                cloneValue(initialState, {}),
                cloneValue(node?.ltx23_guides || {}, {}),
                cloneValue(statePatch, {})
            );
            if (Object.prototype.hasOwnProperty.call(config, 'updatedAt')) state.updated_at = config.updatedAt ?? '';
            return { ltx23_guides: state };
        }

        function buildH3StoryboardStatePatch(node, options) {
            const config = options || {};
            const defaults = config.defaults && typeof config.defaults === 'object' && !Array.isArray(config.defaults)
                ? config.defaults
                : {
                    version: 1,
                    mode: '',
                    optimize: false,
                    shots: [],
                    overall_soundscape: '',
                    non_diegetic_music: 'N/A',
                    subject_definitions: '',
                    summary: '',
                    retention_analysis: '',
                    prompt_snapshot: '',
                    updated_at: ''
                };
            const initialState = config.initialState && typeof config.initialState === 'object' && !Array.isArray(config.initialState)
                ? config.initialState
                : {};
            const statePatch = config.statePatch && typeof config.statePatch === 'object' && !Array.isArray(config.statePatch)
                ? config.statePatch
                : {};
            const state = Object.assign(
                {},
                cloneValue(defaults, {}),
                cloneValue(initialState, {}),
                cloneValue(node?.h3_storyboard || {}, {}),
                cloneValue(statePatch, {})
            );
            if (Object.prototype.hasOwnProperty.call(config, 'updatedAt')) state.updated_at = config.updatedAt ?? '';
            return { h3_storyboard: state };
        }

        function buildQwenTtsStatePatch(node, options) {
            const config = options || {};
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const objectOrEmpty = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
            const patch = {};

            if (hasOwn('defaultParams') || hasOwn('initialParams') || hasOwn('paramsPatch')) {
                patch.params = mergeObject(
                    mergeObject(
                        mergeObject(objectOrEmpty(config.defaultParams), objectOrEmpty(config.initialParams)),
                        node?.params
                    ),
                    config.paramsPatch
                );
            }
            if (hasOwn('initialAudioInputs') || hasOwn('audioInputsPatch')) {
                patch.audio_inputs = mergeObject(
                    mergeObject(objectOrEmpty(config.initialAudioInputs), node?.audio_inputs),
                    config.audioInputsPatch
                );
            }
            if (hasOwn('initialSource') || hasOwn('sourcePatch')) {
                patch.source = mergeObject(
                    mergeObject(objectOrEmpty(config.initialSource), node?.source),
                    config.sourcePatch
                );
            }
            if (hasOwn('runState')) {
                patch.qwen_tts_run = cloneValue(config.runState, {});
            } else if (hasOwn('initialRun') || hasOwn('runPatch')) {
                patch.qwen_tts_run = mergeObject(
                    mergeObject(objectOrEmpty(config.initialRun), node?.qwen_tts_run),
                    config.runPatch
                );
            }
            if (hasOwn('status')) {
                patch.status = cloneValue(config.status, {});
            } else if (hasOwn('statusPatch')) {
                patch.status = mergeObject(node?.status, config.statusPatch);
            }
            return patch;
        }

        function buildPoseStudioStatePatch(node, options) {
            const config = options || {};
            const defaults = config.defaults && typeof config.defaults === 'object' && !Array.isArray(config.defaults)
                ? config.defaults
                : {
                    pose_data: {},
                    editor_state: {},
                    reference_asset: null,
                    output_asset: null,
                    updated_at: ''
                };
            const initialState = config.initialState && typeof config.initialState === 'object' && !Array.isArray(config.initialState)
                ? config.initialState
                : {};
            const statePatch = config.statePatch && typeof config.statePatch === 'object' && !Array.isArray(config.statePatch)
                ? config.statePatch
                : {};
            return {
                pose_studio: Object.assign(
                    {},
                    cloneValue(defaults, {}),
                    cloneValue(initialState, {}),
                    cloneValue(node?.pose_studio || {}, {}),
                    cloneValue(statePatch, {})
                )
            };
        }

        function buildLivePortraitNodeStatePatch(node, options) {
            const config = options || {};
            const defaults = config.defaults && typeof config.defaults === 'object' && !Array.isArray(config.defaults)
                ? config.defaults
                : {
                    source_node_id: '',
                    reference_node_id: '',
                    source_asset: null,
                    reference_asset: null,
                    output_asset: null,
                    params: {},
                    expression_state: '',
                    updated_at: ''
                };
            const initialState = config.initialState && typeof config.initialState === 'object' && !Array.isArray(config.initialState)
                ? config.initialState
                : {};
            const statePatch = config.statePatch && typeof config.statePatch === 'object' && !Array.isArray(config.statePatch)
                ? config.statePatch
                : {};
            return {
                liveportrait_expression: Object.assign(
                    {},
                    cloneValue(defaults, {}),
                    cloneValue(initialState, {}),
                    cloneValue(node?.liveportrait_expression || {}, {}),
                    cloneValue(statePatch, {})
                )
            };
        }

        function buildGaussianStudioStatePatch(node, options) {
            const config = options || {};
            const defaults = config.defaults && typeof config.defaults === 'object' && !Array.isArray(config.defaults)
                ? config.defaults
                : {
                    reference_asset: null,
                    reference_signature: '',
                    reference_capture_signature: '',
                    reference_data_signature: '',
                    ply_asset: null,
                    ply_path: '',
                    render_asset: null,
                    output_asset: null,
                    camera_state: {},
                    extrinsics: null,
                    intrinsics: null,
                    params: { precision: 'auto', focal_length_mm: 30 },
                    updated_at: ''
                };
            const initialState = config.initialState && typeof config.initialState === 'object' && !Array.isArray(config.initialState)
                ? config.initialState
                : {};
            const statePatch = config.statePatch && typeof config.statePatch === 'object' && !Array.isArray(config.statePatch)
                ? config.statePatch
                : {};
            const state = Object.assign(
                {},
                cloneValue(defaults, {}),
                cloneValue(initialState, {}),
                cloneValue(node?.gaussian_studio || {}, {}),
                cloneValue(statePatch, {})
            );
            const params = state.params && typeof state.params === 'object' && !Array.isArray(state.params)
                ? state.params
                : {};
            const precision = String(params.precision || '').trim().toLowerCase();
            state.params = Object.assign({}, params, {
                precision: ['auto', 'bf16', 'fp16', 'fp32'].includes(precision) ? precision : 'auto'
            });
            return { gaussian_studio: state };
        }

        function buildPoseStudioConfirmPatch(node, options) {
            const config = options || {};
            const response = config.response || {};
            const previousState = node?.pose_studio || {};
            const outputAsset = cloneAsset(response.pose_image || response.asset_ref || null);
            const referenceAsset = cloneAsset(
                response.reference_asset
                || config.referenceAsset
                || previousState.reference_asset
                || null
            );
            const poseStudio = Object.assign({}, cloneValue(previousState, {}), {
                output_asset: outputAsset,
                pose_data: cloneValue(response.pose_data || previousState.pose_data || {}, {}),
                editor_state: cloneValue(response.editor_state || previousState.editor_state || {}, {}),
                reference_asset: referenceAsset,
                updated_at: response.exported_at || config.updatedAt || nowIso()
            });
            return {
                asset: outputAsset,
                pose_studio: poseStudio,
                source: mergeObject(node?.source, config.sourcePatch),
                status: cloneValue(config.status || {}, {})
            };
        }

        function buildLivePortraitStatePatch(node, cache, options) {
            const config = options || {};
            const value = cache || {};
            const previousState = node?.liveportrait_expression || {};
            return {
                liveportrait_expression: Object.assign({}, cloneValue(previousState, {}), {
                    params: cloneValue(value.params || previousState.params || {}, {}),
                    expression_state: value.expression_state || previousState.expression_state || '',
                    updated_at: value.updated_at || config.updatedAt || nowIso()
                })
            };
        }

        function buildLivePortraitConfirmPatch(node, options) {
            const config = options || {};
            const response = config.response || {};
            const previousState = node?.liveportrait_expression || {};
            const outputAsset = cloneAsset(response.asset_ref || response.expression_image || null);
            const sourceAsset = cloneAsset(
                response.source_asset
                || config.sourceAsset
                || previousState.source_asset
                || null
            );
            const referenceAsset = cloneAsset(
                response.reference_asset
                || config.referenceAsset
                || previousState.reference_asset
                || null
            );
            const sourceNodeId = config.sourceNodeId || previousState.source_node_id || '';
            const referenceNodeId = config.referenceNodeId || previousState.reference_node_id || '';
            const livePortraitState = Object.assign({}, cloneValue(previousState, {}), {
                output_asset: outputAsset,
                params: cloneValue(response.params || previousState.params || {}, {}),
                expression_state: response.expression_state || previousState.expression_state || '',
                source_asset: sourceAsset,
                reference_asset: referenceAsset,
                source_node_id: sourceNodeId,
                reference_node_id: referenceNodeId,
                updated_at: response.exported_at || config.updatedAt || nowIso()
            });
            return {
                asset: outputAsset,
                input_node_id: sourceNodeId,
                reference_node_id: referenceNodeId,
                liveportrait_expression: livePortraitState,
                source: mergeObject(node?.source, config.sourcePatch),
                status: cloneValue(config.status || {}, {})
            };
        }

        function buildGaussianCachePatch(node, options) {
            const config = options || {};
            const cache = config.cache || {};
            const previousState = node?.gaussian_studio || {};
            const nextState = cloneValue(previousState, {});
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(cache, key);
            if (hasOwn('ply_asset')) nextState.ply_asset = cloneAsset(cache.ply_asset || null);
            else nextState.ply_asset = cloneAsset(nextState.ply_asset || null);
            if (hasOwn('ply_path')) nextState.ply_path = cache.ply_path || '';
            else nextState.ply_path = nextState.ply_path || '';
            const nextReferenceAsset = hasOwn('reference_asset')
                ? cache.reference_asset || config.referenceAsset || previousState.reference_asset || null
                : config.referenceAsset || previousState.reference_asset || null;
            nextState.reference_asset = cloneAsset(nextReferenceAsset);
            if (hasOwn('reference_signature')) nextState.reference_signature = cache.reference_signature || '';
            if (hasOwn('reference_capture_signature')) nextState.reference_capture_signature = cache.reference_capture_signature || '';
            if (hasOwn('reference_data_signature')) nextState.reference_data_signature = cache.reference_data_signature || '';
            if (hasOwn('camera_state')) nextState.camera_state = cloneValue(cache.camera_state || {}, {});
            else nextState.camera_state = cloneValue(nextState.camera_state || {}, {});
            if (hasOwn('extrinsics')) nextState.extrinsics = cloneValue(cache.extrinsics || null, null);
            else nextState.extrinsics = cloneValue(nextState.extrinsics || null, null);
            if (hasOwn('intrinsics')) nextState.intrinsics = cloneValue(cache.intrinsics || null, null);
            else nextState.intrinsics = cloneValue(nextState.intrinsics || null, null);
            if (hasOwn('params')) nextState.params = cloneValue(cache.params || {}, {});
            else nextState.params = cloneValue(nextState.params || {}, {});
            nextState.updated_at = cache.updated_at || config.updatedAt || nowIso();

            const patch = { gaussian_studio: nextState };
            let effectiveAsset = node?.asset || null;
            if (hasOwn('render_asset')) {
                const renderAsset = cloneAsset(cache.render_asset || null);
                patch.asset = renderAsset;
                effectiveAsset = renderAsset;
                nextState.output_asset = renderAsset;
                nextState.render_asset = renderAsset;
            }
            if (config.reason === 'reference_changed') {
                patch.asset = null;
                nextState.output_asset = null;
                nextState.render_asset = null;
                patch.status = cloneValue(config.referenceChangedStatus || {}, {});
            } else if (!effectiveAsset && (nextState.ply_asset || nextState.ply_path)) {
                patch.status = cloneValue(config.plyReadyStatus || {}, {});
            }
            return patch;
        }

        function buildGaussianConfirmPatch(node, options) {
            const config = options || {};
            const response = config.response || {};
            const previousState = node?.gaussian_studio || {};
            const responseState = response.gaussian_state || {};
            const renderAsset = cloneAsset(response.render_asset || response.asset_ref || null);
            const plyAsset = cloneAsset(response.ply_asset || previousState.ply_asset || null);
            const referenceAsset = cloneAsset(
                response.reference_asset
                || config.referenceAsset
                || previousState.reference_asset
                || null
            );
            const gaussianState = Object.assign({}, cloneValue(previousState, {}), {
                output_asset: renderAsset,
                render_asset: renderAsset,
                ply_asset: plyAsset,
                ply_path: response.ply_path || previousState.ply_path || '',
                reference_asset: referenceAsset,
                reference_signature: response.reference_signature || responseState.reference_signature || previousState.reference_signature || '',
                reference_capture_signature: response.reference_capture_signature || responseState.reference_capture_signature || previousState.reference_capture_signature || '',
                reference_data_signature: response.reference_data_signature || responseState.reference_data_signature || previousState.reference_data_signature || '',
                camera_state: cloneValue(response.camera_state || previousState.camera_state || {}, {}),
                extrinsics: cloneValue(response.extrinsics || previousState.extrinsics || null, null),
                intrinsics: cloneValue(response.intrinsics || previousState.intrinsics || null, null),
                params: cloneValue(response.params || previousState.params || {}, {}),
                updated_at: response.exported_at || config.updatedAt || nowIso()
            });
            return {
                asset: renderAsset,
                gaussian_studio: gaussianState,
                source: mergeObject(node?.source, config.sourcePatch),
                status: cloneValue(config.status || {}, {})
            };
        }

        return {
            buildSam3SourcePatch,
            buildSam3StatePatch,
            buildDirectorTimelineStatePatch,
            buildCameraMotionSourcePatch,
            buildCameraMotionParamsPatch,
            buildCameraMotionStatePatch,
            buildSpecialNodeConnectionPatch,
            buildSpecialNodeStatusPatch,
            buildStyleSelectorStatePatch,
            buildPresetSpecialControllerStatePatch,
            buildLivePortraitVideoExpressionStatePatch,
            buildLtx23GuidesStatePatch,
            buildH3StoryboardStatePatch,
            buildQwenTtsStatePatch,
            buildPoseStudioStatePatch,
            buildPoseStudioConfirmPatch,
            buildLivePortraitNodeStatePatch,
            buildLivePortraitStatePatch,
            buildLivePortraitConfirmPatch,
            buildGaussianStudioStatePatch,
            buildGaussianCachePatch,
            buildGaussianConfirmPatch
        };
    }

    window.SimpAICanvasWorkbenchSpecialNodePatchFactory = Object.assign({}, window.SimpAICanvasWorkbenchSpecialNodePatchFactory || {}, {
        createCanvasSpecialNodePatchFactoryController
    });
})();
