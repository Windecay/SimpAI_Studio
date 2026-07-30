(function () {
    'use strict';

    const PRESET_RUN_ASPECT_OPTIONS = [
        { key: 'auto', value: '' },
        { key: '1:1', value: '1024*1024' },
        { key: '16:9', value: '1344*768' },
        { key: '9:16', value: '768*1344' },
        { key: '4:3', value: '1152*864' },
        { key: '3:4', value: '864*1152' },
        { key: '2:3', value: '832*1216' },
        { key: '3:2', value: '1216*832' },
        { key: '7:4', value: '1344*768' },
        { key: '4:7', value: '768*1344' }
    ];

    function clonePresetRunValue(value, fallback) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (err) {
            return fallback;
        }
    }

    function presetRunAspectOptions() {
        const configured = window.SimpAICanvasWorkbenchCanvasAgent?.CANVAS_AGENT_ASPECT_OPTIONS;
        const source = Array.isArray(configured) && configured.length ? configured : PRESET_RUN_ASPECT_OPTIONS;
        return clonePresetRunValue(source, PRESET_RUN_ASPECT_OPTIONS.slice());
    }

    function normalizePresetRunName(value) {
        return String(value || '').trim().replace(/\.json$/i, '');
    }

    function presetRunStringList(value) {
        if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
        if (typeof value !== 'string' || !value.trim()) return [];
        try {
            const parsed = JSON.parse(value.replace(/'/g, '"'));
            if (Array.isArray(parsed)) return parsed.map(item => String(item || '').trim()).filter(Boolean);
        } catch (err) {}
        return value.split(',').map(item => item.trim()).filter(Boolean);
    }

    function firstPresetRunText() {
        for (const value of arguments) {
            if (value === undefined || value === null || Array.isArray(value) || typeof value === 'object') continue;
            const text = String(value || '').trim();
            if (text) return text;
        }
        return '';
    }

    function presetRunThemeValue(source, key, theme) {
        if (!source || typeof source !== 'object') return undefined;
        const raw = source[key];
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
        if (theme && Object.prototype.hasOwnProperty.call(raw, theme)) return raw[theme];
        const firstKey = Object.keys(raw).find(item => raw[item] !== undefined && raw[item] !== null && raw[item] !== '');
        return firstKey ? raw[firstKey] : undefined;
    }

    function presetRunPromptDefaults(entry, schema, theme, themeInfo) {
        const defaultEngine = entry?.default_engine && typeof entry.default_engine === 'object' ? entry.default_engine : {};
        const sceneFrontend = Object.assign(
            {},
            schema?.scene_frontend && typeof schema.scene_frontend === 'object' ? schema.scene_frontend : {},
            defaultEngine.scene_frontend && typeof defaultEngine.scene_frontend === 'object' ? defaultEngine.scene_frontend : {}
        );
        const themeDefaults = themeInfo?.defaults && typeof themeInfo.defaults === 'object' ? themeInfo.defaults : {};
        const generation = entry?.generation_config && typeof entry.generation_config === 'object' ? entry.generation_config : {};
        const styles = presetRunStringList(
            entry?.default_styles
            || generation.default_styles
            || generation.style_selections
            || themeDefaults.default_styles
            || themeDefaults.style_selections
        );
        return {
            styles,
            prompt: firstPresetRunText(
                presetRunThemeValue(sceneFrontend, 'prompt', theme),
                themeDefaults.prompt,
                themeDefaults.default_prompt,
                entry?.default_prompt,
                generation.default_prompt
            ),
            negativePrompt: firstPresetRunText(
                presetRunThemeValue(sceneFrontend, 'negative_prompt', theme),
                themeDefaults.negative_prompt,
                themeDefaults.default_prompt_negative,
                entry?.default_prompt_negative,
                generation.default_prompt_negative
            )
        };
    }

    function buildPresetRunNode(entry, options) {
        if (!entry || typeof entry !== 'object') return null;
        const opts = options && typeof options === 'object' ? options : {};
        const cleanName = normalizePresetRunName(entry.name || entry.display_name || opts.presetName || '');
        if (!cleanName) return null;
        const schema = entry.schema && typeof entry.schema === 'object' ? clonePresetRunValue(entry.schema, {}) : {};
        const isScene = !!entry.scene || !!schema.scene_frontend;
        const defaultEngine = entry.default_engine && typeof entry.default_engine === 'object' ? entry.default_engine : {};
        const backendParams = defaultEngine.backend_params && typeof defaultEngine.backend_params === 'object' ? defaultEngine.backend_params : {};
        const themes = Array.isArray(schema.themes) ? schema.themes : [];
        const requestedTheme = String(opts.sceneTheme || '').trim();
        const sceneTheme = requestedTheme && (!themes.length || themes.includes(requestedTheme))
            ? requestedTheme
            : (schema.default_theme || themes[0] || '');
        const perTheme = schema.per_theme && typeof schema.per_theme === 'object' ? schema.per_theme : {};
        const themeInfo = perTheme[sceneTheme] && typeof perTheme[sceneTheme] === 'object' ? perTheme[sceneTheme] : {};
        const themeDefaults = themeInfo.defaults && typeof themeInfo.defaults === 'object'
            ? clonePresetRunValue(themeInfo.defaults, {})
            : {};
        const promptDefaults = presetRunPromptDefaults(entry, schema, sceneTheme, themeInfo);
        const hasPrompt = Object.prototype.hasOwnProperty.call(opts, 'prompt');
        const hasNegativePrompt = Object.prototype.hasOwnProperty.call(opts, 'negativePrompt');
        const prompt = hasPrompt ? String(opts.prompt || '').trim() : promptDefaults.prompt;
        const negativePrompt = hasNegativePrompt ? String(opts.negativePrompt || '').trim() : promptDefaults.negativePrompt;
        const imageNumber = Math.max(1, Math.min(16, Math.round(Number(opts.imageNumber || entry.default_image_number || 1) || 1)));
        const requestedClassicMode = String(opts.classicMode || '').trim().toLowerCase();
        const classicMode = !isScene && requestedClassicMode === 'enhance' ? 'enhance' : 't2i';
        const currentTab = classicMode === 'enhance' ? 'enhance' : 'ip';
        const declaredEnhanceTargets = Array.isArray(opts.enhanceTargets) ? opts.enhanceTargets.map((value) => String(value || '').trim().toLowerCase()) : [];
        const enhanceTargets = new Set(declaredEnhanceTargets.filter((value) => ['face', 'hand', 'eye'].includes(value)));
        if (classicMode === 'enhance' && !enhanceTargets.size) ['face', 'hand', 'eye'].forEach((value) => enhanceTargets.add(value));
        const params = isScene ? themeDefaults : {
            uov_method: 'Upscale (1.5x)',
            inpaint_mode: 'Inpaint or Outpaint (default)',
            inpaint_denoising_strength: 1,
            inpaint_respective_field: 0.618,
            inpaint_engine: null,
            inpaint_disable_initial_latent: false,
            invert_mask: false,
            inpaint_additional_prompt: '',
            outpaint_selections: [],
            enhance_uov_method: 'Disabled',
            enhance_uov_strength: 0.5,
            enhance_uov_processing_order: 'Before First Enhancement',
            enhance_uov_prompt_type: 'Original Prompts',
            mixing_image_prompt_and_vary_upscale: false,
            mixing_image_prompt_and_inpaint: false
        };
        const allowedParameterKeys = new Set(
            (Array.isArray(schema.params) ? schema.params : [])
                .map((item) => String(item?.key || ''))
                .filter(Boolean)
        );
        Object.entries(opts.parameterOverrides && typeof opts.parameterOverrides === 'object' ? opts.parameterOverrides : {}).forEach(([key, value]) => {
            if (allowedParameterKeys.has(key)) params[key] = clonePresetRunValue(value, value);
        });
        params.prompt = prompt;
        params.negative_prompt = negativePrompt;
        params.seed_random = opts.seedRandom !== false;
        params.image_seed = Number.isFinite(Number(opts.imageSeed)) ? Math.max(0, Math.round(Number(opts.imageSeed))) : 0;
        params.image_number = imageNumber;

        const resolutionOverrides = clonePresetRunValue(opts.resolutionOverrides || {}, {});
        const aspectKey = String(opts.aspectRatio || opts.aspect || 'auto').trim().toLowerCase();
        const hasExplicitAspect = Object.prototype.hasOwnProperty.call(opts, 'aspectRatio')
            || Object.prototype.hasOwnProperty.call(opts, 'aspect');
        const aspect = presetRunAspectOptions().find(item => String(item?.key || '').toLowerCase() === aspectKey);
        const sizeMatch = String(aspect?.value || '').match(/^(\d{3,5})\s*[x*]\s*(\d{3,5})$/i);
        if (sizeMatch) {
            resolutionOverrides.width = Number(sizeMatch[1]);
            resolutionOverrides.height = Number(sizeMatch[2]);
            resolutionOverrides.aspect_ratio = `${sizeMatch[1]}*${sizeMatch[2]}`;
            resolutionOverrides.random_aspect_ratio = false;
        } else if (
            isScene
            && hasExplicitAspect
            && aspectKey === 'auto'
            && !(Number(resolutionOverrides.width) > 0 && Number(resolutionOverrides.height) > 0)
        ) {
            resolutionOverrides.use_input_aspect = true;
        }
        const generationOverrides = Object.assign(
            {},
            clonePresetRunValue(opts.generationOverrides || {}, {}),
            { image_number: imageNumber }
        );
        const resolutionDefaults = clonePresetRunValue(entry.resolution_config || {}, {});
        if (!resolutionDefaults.aspect_ratio && resolutionDefaults.default_aspect_ratio) {
            resolutionDefaults.aspect_ratio = resolutionDefaults.default_aspect_ratio;
        }
        const defaultSize = String(resolutionDefaults.aspect_ratio || '').match(/^(\d{3,5})\s*[x*]\s*(\d{3,5})/i);
        if (defaultSize && !(Number(resolutionDefaults.width) > 0 && Number(resolutionDefaults.height) > 0)) {
            resolutionDefaults.width = Number(defaultSize[1]);
            resolutionDefaults.height = Number(defaultSize[2]);
        }
        if (!resolutionDefaults.profile && resolutionDefaults.resolution_control && typeof resolutionDefaults.resolution_control === 'object') {
            resolutionDefaults.profile = clonePresetRunValue(resolutionDefaults.resolution_control, {});
        }
        if (resolutionDefaults.quantize == null && resolutionDefaults.default_resolution_quantize_step != null) {
            resolutionDefaults.quantize = resolutionDefaults.default_resolution_quantize_step;
        }
        if (resolutionDefaults.multiplier == null && resolutionDefaults.default_resolution_multiplier != null) {
            resolutionDefaults.multiplier = resolutionDefaults.default_resolution_multiplier;
        }
        if (!resolutionDefaults.edit_mode && resolutionDefaults.default_resolution_edit_mode) {
            resolutionDefaults.edit_mode = resolutionDefaults.default_resolution_edit_mode;
        }
        const runtimeTaskMethod = String(opts.taskMethod || '').trim()
            || themeInfo.task_method
            || presetRunThemeValue(defaultEngine.scene_frontend, 'task_method', sceneTheme)
            || entry.task_method
            || backendParams.task_method
            || '';
        const nodeId = String(opts.id || `preset_run_${Date.now().toString(36)}`);
        const node = {
            id: nodeId,
            type: isScene ? 'preset' : 'classic',
            node_type: isScene ? 'preset' : 'classic',
            title: entry.display_name || cleanName,
            classic_mode: classicMode,
            current_tab: currentTab,
            classic_ip_count: 1,
            preset: {
                name: cleanName,
                display_name: entry.display_name || cleanName,
                snapshot: {
                    default_styles: promptDefaults.styles.slice(),
                    default_prompt: promptDefaults.prompt || '',
                    default_prompt_negative: promptDefaults.negativePrompt || ''
                }
            },
            runtime: {
                backend_engine: entry.backend_engine || backendParams.backend_engine || defaultEngine.backend_engine || 'Current',
                engine_type: entry.engine_type || defaultEngine.engine_type || 'image',
                scene_frontend: isScene ? 'scene' : '',
                scene_theme: sceneTheme,
                task_method: runtimeTaskMethod
            },
            schema,
            params,
            enhance_params: classicMode === 'enhance' ? {
                regions: ['face', 'hand', 'eye'].map((target) => ({
                    enabled: enhanceTargets.has(target),
                    dino_prompt: target,
                    prompt: enhanceTargets.has(target) ? prompt : ''
                }))
            } : {},
            upload_slots: {},
            upload_slot_sources: {},
            models_config: {
                mode: 'preset_default',
                defaults: clonePresetRunValue(entry.models_config || {}, {}),
                overrides: clonePresetRunValue(opts.modelOverrides || {}, {})
            },
            styles_config: {
                mode: 'preset_default',
                defaults: { style_selections: promptDefaults.styles.slice() },
                overrides: clonePresetRunValue(opts.styleOverrides || {}, {})
            },
            resolution_config: {
                mode: 'preset_default',
                defaults: resolutionDefaults,
                overrides: resolutionOverrides
            },
            generation_config: {
                mode: 'preset_default',
                defaults: clonePresetRunValue(entry.generation_config || {}, {}),
                overrides: generationOverrides
            },
            model_requirements: {
                model_list: Array.isArray(entry.model_list) ? clonePresetRunValue(entry.model_list, []) : [],
                has_model_probe: !!entry.has_model_probe,
                source: entry.source || ''
            }
        };
        const parameterProfile = String(opts.parameterProfile || '').trim().slice(0, 200);
        if (parameterProfile) {
            node.parameter_profile = { name: parameterProfile, preset: cleanName, source: 'private' };
        }
        return node;
    }

    async function postJson(endpoint, payload, options) {
        const opts = options || {};
        const emptyError = opts.emptyError || 'empty response';
        const requestError = opts.requestError || 'request failed';
        try {
            const bodyPayload = Object.assign({}, payload || {});
            delete bodyPayload.signal;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload),
                signal: opts.signal
            });
            let data = null;
            try {
                data = await response.json();
            } catch (err) {
                data = null;
            }
            if (!response.ok) {
                return Object.assign({}, data || {}, {
                    ok: false,
                    error: data?.error || `HTTP ${response.status}`,
                    details: data?.details || response.statusText || '',
                    errors: data?.errors || []
                });
            }
            return data || { ok: false, error: emptyError };
        } catch (err) {
            if (err?.name === 'AbortError') {
                return { ok: false, aborted: true, error: 'aborted' };
            }
            const message = err?.message || String(err || requestError);
            try {
                window.dispatchEvent(new CustomEvent('simpai:backend-request-failed', {
                    detail: { endpoint, error: message, at: new Date().toISOString() }
                }));
            } catch (eventErr) {}
            return { ok: false, error: message };
        }
    }

    function dryRun(payload) {
        return postJson('/canvas-workbench/dry-run', payload, {
            emptyError: 'empty dry-run response',
            requestError: 'dry-run request failed'
        });
    }

    function saveProject(payload) {
        return postJson('/canvas-workbench/project-save', payload, {
            emptyError: 'empty project-save response',
            requestError: 'project-save request failed'
        });
    }

    function loadProject(payload) {
        return postJson('/canvas-workbench/project-load', payload, {
            emptyError: 'empty project-load response',
            requestError: 'project-load request failed'
        });
    }

    function listProjects(payload) {
        return postJson('/canvas-workbench/project-list', payload, {
            emptyError: 'empty project-list response',
            requestError: 'project-list request failed'
        });
    }

    function deleteProject(payload) {
        return postJson('/canvas-workbench/project-delete', payload, {
            emptyError: 'empty project-delete response',
            requestError: 'project-delete request failed'
        });
    }

    function clearProject(payload) {
        return postJson('/canvas-workbench/project-clear', payload, {
            emptyError: 'empty project-clear response',
            requestError: 'project-clear request failed'
        });
    }

    function saveTemplate(payload) {
        return postJson('/canvas-workbench/template-save', payload, {
            emptyError: 'empty template-save response',
            requestError: 'template-save request failed'
        });
    }

    function listTemplates(payload) {
        return postJson('/canvas-workbench/template-list', payload || {}, {
            emptyError: 'empty template-list response',
            requestError: 'template-list request failed'
        });
    }

    function loadTemplate(payload) {
        return postJson('/canvas-workbench/template-load', payload, {
            emptyError: 'empty template-load response',
            requestError: 'template-load request failed'
        });
    }

    function deleteTemplate(payload) {
        return postJson('/canvas-workbench/template-delete', payload, {
            emptyError: 'empty template-delete response',
            requestError: 'template-delete request failed'
        });
    }

    function runNode(payload) {
        return postJson('/canvas-workbench/run-node', payload, {
            emptyError: 'empty run-node response',
            requestError: 'run-node request failed'
        });
    }

    function pollRun(runId, options) {
        const payload = { run_id: runId };
        if (options && options.after_preview_serial !== undefined) {
            payload.after_preview_serial = options.after_preview_serial;
        }
        if (options?.user_context && typeof options.user_context === 'object') {
            payload.user_context = options.user_context;
        }
        return postJson('/canvas-workbench/poll-run', payload, {
            emptyError: 'empty poll response',
            requestError: 'poll request failed'
        }).then((data) => {
            if (data && data.run_id === undefined) data.run_id = runId;
            return data;
        });
    }

    function controlRun(runId, action, options) {
        const payload = { run_id: runId, action };
        if (options?.user_context && typeof options.user_context === 'object') {
            payload.user_context = options.user_context;
        }
        return postJson('/canvas-workbench/control-run', payload, {
            emptyError: 'empty control response',
            requestError: 'control request failed'
        }).then((data) => {
            if (data && data.run_id === undefined) data.run_id = runId;
            return data;
        });
    }

    function xyzAxisOptions(payload) {
        return postJson('/canvas-workbench/xyz/axis-options', payload || {}, {
            emptyError: 'empty X/Y/Z axis options response',
            requestError: 'X/Y/Z axis options request failed'
        });
    }

    function xyzPreview(payload) {
        return postJson('/canvas-workbench/xyz/preview', payload, {
            emptyError: 'empty X/Y/Z preview response',
            requestError: 'X/Y/Z preview request failed'
        });
    }

    function xyzRun(payload) {
        return postJson('/canvas-workbench/xyz/run', payload, {
            emptyError: 'empty X/Y/Z run response',
            requestError: 'X/Y/Z run request failed'
        });
    }

    function xyzPoll(jobId) {
        return postJson('/canvas-workbench/xyz/poll', { job_id: jobId }, {
            emptyError: 'empty X/Y/Z poll response',
            requestError: 'X/Y/Z poll request failed'
        }).then((data) => {
            if (data && data.job_id === undefined) data.job_id = jobId;
            return data;
        });
    }

    function xyzControl(jobId, action) {
        return postJson('/canvas-workbench/xyz/control', { job_id: jobId, action }, {
            emptyError: 'empty X/Y/Z control response',
            requestError: 'X/Y/Z control request failed'
        }).then((data) => {
            if (data && data.job_id === undefined) data.job_id = jobId;
            return data;
        });
    }

    function xyzRenderGrid(payload) {
        return postJson('/canvas-workbench/xyz/render-grid', payload, {
            emptyError: 'empty X/Y/Z render-grid response',
            requestError: 'X/Y/Z render-grid request failed'
        });
    }

    function qwenTtsRun(payload) {
        return postJson('/canvas-workbench/qwen-tts-run', payload, {
            emptyError: 'empty Qwen TTS response',
            requestError: 'Qwen TTS request failed'
        });
    }

    function qwenTtsPoll(jobId) {
        return postJson('/canvas-workbench/qwen-tts-poll', { job_id: jobId }, {
            emptyError: 'empty Qwen TTS poll response',
            requestError: 'Qwen TTS poll failed'
        }).then((data) => {
            if (data && data.job_id === undefined) data.job_id = jobId;
            return data;
        });
    }

    function qwenTtsControl(jobId, action) {
        return postJson('/canvas-workbench/qwen-tts-control', { job_id: jobId, action }, {
            emptyError: 'empty Qwen TTS control response',
            requestError: 'Qwen TTS control failed'
        }).then((data) => {
            if (data && data.job_id === undefined) data.job_id = jobId;
            return data;
        });
    }

    function qwenTtsPresets(payload) {
        return postJson('/canvas-workbench/qwen-tts-presets', payload || {}, {
            emptyError: 'empty Qwen TTS presets response',
            requestError: 'Qwen TTS presets request failed'
        });
    }

    function modelCatalog(payload) {
        return postJson('/canvas-workbench/model-catalog', payload, {
            emptyError: 'empty model catalog response',
            requestError: 'model catalog request failed'
        });
    }

    function presetCatalog(payload) {
        return postJson('/canvas-workbench/preset-catalog', payload || {}, {
            emptyError: 'empty preset catalog response',
            requestError: 'preset catalog request failed'
        });
    }

    function modelBrowserQuery(payload) {
        return postJson('/model-browser/query', payload || {}, {
            emptyError: 'empty model-browser response',
            requestError: 'model-browser query failed'
        });
    }

    function modelBrowserFetchMetadata(payload) {
        return postJson('/model-browser/fetch-metadata', payload || {}, {
            emptyError: 'empty model-browser metadata response',
            requestError: 'model-browser metadata fetch failed'
        });
    }

    function modelBrowserFetchBatch(payload) {
        return postJson('/model-browser/fetch-batch', payload || {}, {
            emptyError: 'empty model-browser batch response',
            requestError: 'model-browser batch fetch failed'
        });
    }

    function presetModelStatus(payload) {
        return postJson('/canvas-workbench/preset-model-status', payload, {
            emptyError: 'empty preset model status response',
            requestError: 'preset model status request failed'
        });
    }

    function presetModelDownloads(payload) {
        return postJson('/canvas-workbench/preset-model-downloads', payload, {
            emptyError: 'empty preset model download response',
            requestError: 'preset model download request failed'
        });
    }

    function listAssets(payload) {
        return postJson('/canvas-workbench/list-assets', payload, {
            emptyError: 'empty asset list response',
            requestError: 'asset list request failed'
        });
    }

    function mediaGallery(payload) {
        return postJson('/canvas-workbench/media-gallery', payload || {}, {
            emptyError: 'empty media gallery response',
            requestError: 'media gallery request failed'
        });
    }

    function mediaGalleryDelete(payload) {
        return postJson('/canvas-workbench/media-gallery/delete', payload || {}, {
            emptyError: 'empty media gallery delete response',
            requestError: 'media gallery delete failed'
        });
    }

    function deleteAssets(payload) {
        return postJson('/canvas-workbench/delete-assets', payload, {
            emptyError: 'empty asset delete response',
            requestError: 'asset delete request failed'
        });
    }

    function materializeAsset(payload) {
        return postJson('/canvas-workbench/materialize-asset', payload, {
            emptyError: 'empty asset materialize response',
            requestError: 'asset materialize request failed'
        });
    }

    function generateMask(payload) {
        return postJson('/canvas-workbench/generate-mask', payload, {
            emptyError: 'empty mask generation response',
            requestError: 'mask generation request failed'
        });
    }

    function generateCameraMotionReference(payload) {
        return postJson('/canvas-workbench/generate-camera-motion-reference', payload, {
            emptyError: 'empty camera motion reference response',
            requestError: 'camera motion reference request failed'
        });
    }

    function generateSam3VideoMask(payload) {
        return postJson('/canvas-workbench/generate-sam3-video-mask', payload, {
            emptyError: 'empty SAM3 video mask response',
            requestError: 'SAM3 video mask request failed',
            signal: payload?.signal
        });
    }

    function cancelSam3VideoMask(payload) {
        return postJson('/canvas-workbench/cancel-sam3-video-mask', payload, {
            emptyError: 'empty SAM3 cancel response',
            requestError: 'SAM3 cancel request failed'
        });
    }

    function normalizeSam3MaskVideo(payload) {
        return postJson('/canvas-workbench/normalize-sam3-mask-video', payload, {
            emptyError: 'empty SAM3 mask upload response',
            requestError: 'SAM3 mask upload request failed'
        });
    }

    function poseStudioStatus(payload) {
        return postJson('/pose-studio/status', payload || {}, {
            emptyError: 'empty Pose Studio status response',
            requestError: 'Pose Studio status request failed'
        });
    }

    function poseStudioCharacterPreview(payload) {
        return postJson('/pose-studio/character/update-preview', payload || {}, {
            emptyError: 'empty Pose Studio character response',
            requestError: 'Pose Studio character request failed'
        });
    }

    function poseStudioLibraryList(payload) {
        return postJson('/pose-studio/library/list', payload || {}, {
            emptyError: 'empty Pose Studio library response',
            requestError: 'Pose Studio library request failed'
        });
    }

    function poseStudioLibraryGet(payload) {
        return postJson('/pose-studio/library/get', payload || {}, {
            emptyError: 'empty Pose Studio pose response',
            requestError: 'Pose Studio pose request failed'
        });
    }

    function poseStudioLibrarySave(payload) {
        return postJson('/pose-studio/library/save', payload || {}, {
            emptyError: 'empty Pose Studio save response',
            requestError: 'Pose Studio save request failed'
        });
    }

    function poseStudioLibraryDelete(payload) {
        return postJson('/pose-studio/library/delete', payload || {}, {
            emptyError: 'empty Pose Studio delete response',
            requestError: 'Pose Studio delete request failed'
        });
    }

    function poseStudioLibraryRename(payload) {
        return postJson('/pose-studio/library/rename', payload || {}, {
            emptyError: 'empty Pose Studio rename response',
            requestError: 'Pose Studio rename request failed'
        });
    }

    function poseStudioImportStatus(payload) {
        return postJson('/pose-studio/import/status', payload || {}, {
            emptyError: 'empty Pose Studio import status response',
            requestError: 'Pose Studio import status request failed'
        });
    }

    function poseStudioImportReference(payload) {
        return postJson('/pose-studio/import/reference-image', payload || {}, {
            emptyError: 'empty Pose Studio reference import response',
            requestError: 'Pose Studio reference import request failed'
        });
    }

    function poseStudioRenderOverlay(payload) {
        return postJson('/pose-studio/render-overlay', payload || {}, {
            emptyError: 'empty Pose Studio overlay response',
            requestError: 'Pose Studio overlay request failed'
        });
    }

    function poseStudioExport(payload) {
        return postJson('/pose-studio/canvas/export', payload || {}, {
            emptyError: 'empty Pose Studio export response',
            requestError: 'Pose Studio export request failed'
        });
    }

    function gaussianStudioStatus(payload) {
        return postJson('/gaussian-studio/status', payload || {}, {
            emptyError: 'empty Gaussian Studio status response',
            requestError: 'Gaussian Studio status request failed'
        });
    }

    function gaussianStudioPredict(payload) {
        return postJson('/gaussian-studio/predict', payload || {}, {
            emptyError: 'empty Gaussian Studio predict response',
            requestError: 'Gaussian Studio predict request failed'
        });
    }

    function gaussianStudioExport(payload) {
        return postJson('/gaussian-studio/canvas/export', payload || {}, {
            emptyError: 'empty Gaussian Studio export response',
            requestError: 'Gaussian Studio export request failed'
        });
    }

    function renderTimeline(payload) {
        return postJson('/canvas-workbench/render-timeline', payload, {
            emptyError: 'empty timeline render response',
            requestError: 'timeline render request failed'
        });
    }

    function renderTimelineFrame(payload) {
        return postJson('/canvas-workbench/render-timeline-frame', payload, {
            emptyError: 'empty timeline frame response',
            requestError: 'timeline frame request failed'
        });
    }

    function wd14Tag(payload) {
        return postJson('/canvas-workbench/wd14-tag', payload, {
            emptyError: 'empty WD14 response',
            requestError: 'WD14 request failed'
        });
    }

    function vlmRun(payload, options) {
        const opts = options || {};
        return postJson('/canvas-workbench/vlm-run', payload, {
            emptyError: 'empty VLM response',
            requestError: 'VLM request failed',
            signal: opts.signal
        });
    }

    function vlmCancel(payload) {
        return postJson('/canvas-workbench/vlm-cancel', payload, {
            emptyError: 'empty VLM cancel response',
            requestError: 'VLM cancel failed'
        });
    }

    function vlmModelStatus(payload) {
        return postJson('/canvas-workbench/vlm-model-status', payload, {
            emptyError: 'empty VLM model status response',
            requestError: 'VLM model status failed'
        });
    }

    function vlmModelDownloads(payload) {
        return postJson('/canvas-workbench/vlm-model-downloads', payload, {
            emptyError: 'empty VLM model download response',
            requestError: 'VLM model download failed'
        });
    }

    function customLlmModels(payload) {
        return postJson('/canvas-workbench/custom-llm-models', payload, {
            emptyError: 'empty custom LLM model response',
            requestError: 'custom LLM model request failed'
        });
    }

    function vlmSkills(payload) {
        return postJson('/canvas-workbench/vlm-skills', payload || {}, {
            emptyError: 'empty VLM skills response',
            requestError: 'VLM skills request failed'
        });
    }

    function vlmSystemPromptTemplates(payload) {
        return postJson('/vlm-system-prompt-templates', payload || {}, {
            emptyError: 'empty VLM system prompt template response',
            requestError: 'VLM system prompt template request failed'
        });
    }

    function danbooruTagLookup(payload) {
        return postJson('/canvas-agent/danbooru-tags/lookup', payload || {}, {
            emptyError: 'empty Danbooru tag lookup response',
            requestError: 'Danbooru tag lookup failed'
        });
    }

    function danbooruAutocomplete(payload, options) {
        const opts = options || {};
        return postJson('/canvas-workbench/danbooru-autocomplete', payload || {}, {
            emptyError: 'empty Danbooru autocomplete response',
            requestError: 'Danbooru autocomplete failed',
            signal: opts.signal
        });
    }

    function danbooruGalleryImportPreview(payload) {
        return postJson('/canvas-agent/danbooru-gallery/import-preview', payload || {}, {
            emptyError: 'empty Danbooru Gallery import preview response',
            requestError: 'Danbooru Gallery import preview failed'
        });
    }

    function characterGlossary(payload) {
        return postJson('/canvas-agent/character-glossary', payload || {}, {
            emptyError: 'empty character glossary response',
            requestError: 'character glossary request failed'
        });
    }

    function promptPreflight(payload) {
        return postJson('/canvas-agent/prompt-preflight', payload || {}, {
            emptyError: 'empty prompt preflight response',
            requestError: 'prompt preflight failed'
        });
    }

    function promptPreflightAcceptance(payload) {
        return postJson('/canvas-agent/prompt-preflight/acceptance', payload || {}, {
            emptyError: 'empty prompt preflight acceptance response',
            requestError: 'prompt preflight acceptance failed'
        });
    }

    function wildcardsCatalog(payload) {
        return postJson('/canvas-workbench/wildcards/catalog', payload || {}, {
            emptyError: 'empty wildcards catalog response',
            requestError: 'wildcards catalog failed'
        });
    }

    function wildcardsHelperTag(payload) {
        return postJson('/canvas-workbench/wildcards/helper-tag', payload || {}, {
            emptyError: 'empty wildcards helper response',
            requestError: 'wildcards helper failed'
        });
    }

    function wildcardsPreview(payload) {
        return postJson('/canvas-workbench/wildcards/preview', payload || {}, {
            emptyError: 'empty wildcards preview response',
            requestError: 'wildcards preview failed'
        });
    }

    function personalWildcards(payload) {
        return postJson('/canvas-workbench/wildcards/personal', payload || {}, {
            emptyError: 'empty personal wildcards response',
            requestError: 'personal wildcards request failed'
        });
    }

    function vlmUnload(payload) {
        return postJson('/canvas-workbench/vlm-unload', payload, {
            emptyError: 'empty VLM unload response',
            requestError: 'VLM unload failed'
        });
    }

    function translateRun(payload) {
        return postJson('/canvas-workbench/translate-run', payload, {
            emptyError: 'empty translate response',
            requestError: 'translate request failed'
        });
    }

    function translatePoll(jobId) {
        return postJson('/canvas-workbench/translate-poll', { job_id: jobId }, {
            emptyError: 'empty translate poll response',
            requestError: 'translate poll request failed'
        }).then((data) => {
            if (data && data.job_id === undefined) data.job_id = jobId;
            return data;
        });
    }

    window.SimpAICanvasWorkbenchApi = {
        postJson,
        buildPresetRunNode,
        presetRunAspectOptions,
        saveProject,
        loadProject,
        listProjects,
        deleteProject,
        clearProject,
        saveTemplate,
        listTemplates,
        loadTemplate,
        deleteTemplate,
        dryRun,
        runNode,
        pollRun,
        controlRun,
        xyzAxisOptions,
        xyzPreview,
        xyzRun,
        xyzPoll,
        xyzControl,
        xyzRenderGrid,
        qwenTtsRun,
        qwenTtsPoll,
        qwenTtsControl,
        qwenTtsPresets,
        modelCatalog,
        presetCatalog,
        modelBrowserQuery,
        modelBrowserFetchMetadata,
        modelBrowserFetchBatch,
        presetModelStatus,
        presetModelDownloads,
        listAssets,
        mediaGallery,
        mediaGalleryDelete,
        deleteAssets,
        materializeAsset,
        generateMask,
        generateCameraMotionReference,
        generateSam3VideoMask,
        cancelSam3VideoMask,
        normalizeSam3MaskVideo,
        poseStudioStatus,
        poseStudioCharacterPreview,
        poseStudioLibraryList,
        poseStudioLibraryGet,
        poseStudioLibrarySave,
        poseStudioLibraryDelete,
        poseStudioLibraryRename,
        poseStudioImportStatus,
        poseStudioImportReference,
        poseStudioRenderOverlay,
        poseStudioExport,
        gaussianStudioStatus,
        gaussianStudioPredict,
        gaussianStudioExport,
        renderTimeline,
        renderTimelineFrame,
        wd14Tag,
        vlmRun,
        vlmCancel,
        vlmModelStatus,
        vlmModelDownloads,
        customLlmModels,
        vlmSkills,
        vlmSystemPromptTemplates,
        danbooruTagLookup,
        danbooruAutocomplete,
        danbooruGalleryImportPreview,
        characterGlossary,
        promptPreflight,
        promptPreflightAcceptance,
        wildcardsCatalog,
        wildcardsHelperTag,
        wildcardsPreview,
        personalWildcards,
        vlmUnload,
        translateRun,
        translatePoll
    };
})();
