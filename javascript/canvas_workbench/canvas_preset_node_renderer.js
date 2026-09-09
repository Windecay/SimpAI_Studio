(function () {
    'use strict';

    function createCanvasPresetNodeRenderer(context) {
        const {
            t, tOption, clamp, escapeHtml,
            getClassicModes,
            getClassicOutpaintDirs,
            getClassicInpaintMethods,
            getClassicEnhanceUovProcessingOrder,
            getClassicEnhanceUovPromptTypes,
            getClassicIpMaxImages,
            getProject, getNode,
            getClassicUovMethods, getClassicIpTypes, getClassicInpaintEngines,
            normalizeClassicInpaintMode, getInpaintModeDefaults,
            getClassicEnhanceRegionValues, getClassicEnhanceRegionDefault,
            detectionSlotForRegion, getDetectionConfigLabel, enhanceRegionKey, portHintText,
            danbooruAutocompleteAttrs, getPromptTextSourceNode,
            getVisibleClassicUploadSlots, getVisibleUploadSlots, getUploadSlotMediaKind,
            collapsedKeepClass, slotPortTitle, slotPortButtonTitle, slotPortHintText,
            notConnectedText, renderPresetModelStatusHtml, renderPresetParamControl,
            renderNodeStateBadges, renderRunnableNodeStatusFoot, renderPresetConfigPortRow,
            getPresetConfigKinds: getPresetConfigKindsFromContext, getSlotLabels: getSlotLabelsFromContext,
            getPresetSchema, getPresetTheme, getPresetThemeInfo, canvasAgentPresetPromptDefaults,
            normalizeCanvasColor, presetSpecialViewerUrl,
            localizeCanvasLabel, isStyleTransferPresetNode, isLivePortraitVideoExpressionPresetNode,
            isLtx23MultiGuidePresetNode, isMiniMaxH3PresetNode, renderStyleTransferPresetController,
            renderLivePortraitVideoExpressionPresetController, renderLtx23GuidePresetController,
            renderMiniMaxH3StoryboardPresetController
        } = context;
        const readArrayConfig = (getter) => {
            const value = typeof getter === 'function' ? getter() : [];
            return Array.isArray(value) ? value : [];
        };
        const readNumberConfig = (getter, fallback) => {
            const value = typeof getter === 'function' ? getter() : fallback;
            return Number(value) || fallback;
        };
        const CLASSIC_MODES = readArrayConfig(getClassicModes);
        const CLASSIC_OUTPAINT_DIRS = readArrayConfig(getClassicOutpaintDirs);
        const CLASSIC_INPAINT_METHODS = readArrayConfig(getClassicInpaintMethods);
        const CLASSIC_ENHANCE_UOV_PROCESSING_ORDER = readArrayConfig(getClassicEnhanceUovProcessingOrder);
        const CLASSIC_ENHANCE_UOV_PROMPT_TYPES = readArrayConfig(getClassicEnhanceUovPromptTypes);
        const getPresetConfigKinds = () => {
            const value = typeof getPresetConfigKindsFromContext === 'function' ? getPresetConfigKindsFromContext() : [];
            return Array.isArray(value) ? value : [];
        };
        const getSlotLabels = () => {
            const value = typeof getSlotLabelsFromContext === 'function' ? getSlotLabelsFromContext() : {};
            return value && typeof value === 'object' ? value : {};
        };

        function getSlotOrderHint(slotKey, node) {
            if (getUploadSlotMediaKind(slotKey) === 'video') return 'video';
            if (getUploadSlotMediaKind(slotKey) === 'audio') return 'audio';
            const visible = node?.type === 'classic' ? getVisibleClassicUploadSlots(node) : getVisibleUploadSlots(node);
            const imageSlots = visible.filter(slot => getUploadSlotMediaKind(slot.key) !== 'video' && getUploadSlotMediaKind(slot.key) !== 'audio');
            const idx = imageSlots.findIndex(slot => slot.key === slotKey);
            return idx >= 0 ? `#${idx + 1}` : '';
        }

        function getPresetSpecialControllerKind(node) {
            if (!node || node.type !== 'preset') return '';
            const parts = [
                node.preset?.name,
                node.preset?.display_name,
                node.title,
                node.runtime?.scene_theme,
                node.runtime?.task_method
            ].map(value => String(value || '').toLowerCase());
            const compact = parts.join('|').replace(/[^a-z0-9]+/g, '');
            if (compact.includes('qwenmultiangle') || compact.includes('qwenmultianglecn')) return 'qwen-multiangle';
            if (compact.includes('flux2anglelight') || compact.includes('flux2anglelightcn') || compact.includes('fluxanglelight')) return 'flux-anglelight';
            return '';
        }

        function normalizePresetSpecialState(kind, state) {
            const source = state && typeof state === 'object' ? state : {};
            const horizontal = Math.round((((Number(source.horizontal ?? source.azimuth ?? 0) % 360) + 360) % 360));
            const vertical = Math.round(clamp(Number(source.vertical ?? source.elevation ?? 0) || 0, -90, 90));
            const zoom = Math.round(clamp(Number(source.zoom ?? source.distance ?? 5) || 5, 0, 10) * 10) / 10;
            return {
                kind,
                horizontal,
                vertical,
                zoom,
                lightColor: normalizeCanvasColor(source.lightColor || source.light_color || '#FFFFFF', '#FFFFFF').toUpperCase(),
                cameraView: !!source.cameraView,
                updated_at: source.updated_at || ''
            };
        }

        function parseQwenMultiangleStateFromPrompt(value) {
            const text = String(value || '');
            const match = text.match(/\{[^{}]*"horizontal"[^{}]*\}\s*$/);
            if (!match) return null;
            try {
                const parsed = JSON.parse(match[0]);
                return normalizePresetSpecialState('qwen-multiangle', parsed);
            } catch (err) {
                return null;
            }
        }

        function parseFluxAnglelightStateFromPrompt(value) {
            const text = String(value || '');
            const colorMatch = text.match(/#[0-9a-f]{6}\b/i);
            return normalizePresetSpecialState('flux-anglelight', {
                horizontal: text.includes('from the right') ? 90 : (text.includes('from the left') ? 270 : (text.includes('from behind') ? 180 : 0)),
                vertical: text.includes('overhead') ? 75 : (text.includes('high-angle') ? 45 : (text.includes('below') || text.includes('uplighting') ? -45 : 0)),
                zoom: text.includes('intense') ? 8 : (text.includes('soft') ? 2 : 5),
                lightColor: colorMatch ? colorMatch[0] : '#FFFFFF'
            });
        }

        function presetSpecialControllerState(node, kind) {
            const controllerKind = kind || getPresetSpecialControllerKind(node);
            const stored = node?.special_ui && node.special_ui.kind === controllerKind ? node.special_ui : null;
            if (stored) return normalizePresetSpecialState(controllerKind, stored);
            const prompt2 = node?.params?.scene_additional_prompt_2;
            if (controllerKind === 'qwen-multiangle') return parseQwenMultiangleStateFromPrompt(prompt2) || normalizePresetSpecialState(controllerKind, {});
            if (controllerKind === 'flux-anglelight') return parseFluxAnglelightStateFromPrompt(prompt2) || normalizePresetSpecialState(controllerKind, {});
            return normalizePresetSpecialState(controllerKind, {});
        }

        function qwenMultianglePromptFromState(state) {
            const hAngle = (((Number(state.horizontal || 0) % 360) + 360) % 360);
            let hDirection = 'front view';
            if (hAngle < 22.5 || hAngle >= 337.5) hDirection = 'front view';
            else if (hAngle < 67.5) hDirection = 'front-right quarter view';
            else if (hAngle < 112.5) hDirection = 'right side view';
            else if (hAngle < 157.5) hDirection = 'back-right quarter view';
            else if (hAngle < 202.5) hDirection = 'back view';
            else if (hAngle < 247.5) hDirection = 'back-left quarter view';
            else if (hAngle < 292.5) hDirection = 'left side view';
            else hDirection = 'front-left quarter view';

            const v = Number(state.vertical || 0);
            let vDirection = 'eye-level shot';
            if (v < -60) vDirection = "worm's-eye view camera positioned directly underneath looking straight up,";
            else if (v < -30) vDirection = 'extreme low-angle shot';
            else if (v < -15) vDirection = 'low-angle shot';
            else if (v < 15) vDirection = 'eye-level shot';
            else if (v < 45) vDirection = 'elevated shot';
            else if (v < 75) vDirection = 'high-angle shot';
            else vDirection = "bird's-eye view";

            const zoom = Number(state.zoom || 5);
            const distance = zoom < 2 ? 'wide shot' : (zoom < 6 ? 'medium shot' : 'close-up');
            return `<sks> ${hDirection} ${vDirection} ${distance}`;
        }

        function fluxAnglelightPromptFromState(state) {
            const az = (((Number(state.horizontal || 0) % 360) + 360) % 360);
            let posDesc = 'light source in front';
            if (az >= 337.5 || az < 22.5) posDesc = 'light source in front';
            else if (az < 67.5) posDesc = 'light source from the front-right';
            else if (az < 112.5) posDesc = 'light source from the right';
            else if (az < 157.5) posDesc = 'light source from the back-right';
            else if (az < 202.5) posDesc = 'light source from behind';
            else if (az < 247.5) posDesc = 'light source from the back-left';
            else if (az < 292.5) posDesc = 'light source from the left';
            else posDesc = 'light source from the front-left';

            const e = Number(state.vertical || 0);
            let elevDesc = 'horizontal level light source';
            if (e >= -90 && e < -30) elevDesc = 'uplighting, light source positioned below the character, light shining upwards';
            else if (e >= -30 && e < -10) elevDesc = 'low-angle light source from below, upward illumination';
            else if (e >= -10 && e < 20) elevDesc = 'horizontal level light source';
            else if (e >= 20 && e < 60) elevDesc = 'high-angle light source';
            else elevDesc = 'overhead top-down light source';

            const intensity = Number(state.zoom || 5);
            const intDesc = intensity < 3 ? 'soft' : (intensity < 7 ? 'bright' : 'intense');
            const color = normalizeCanvasColor(state.lightColor || '#FFFFFF', '#FFFFFF').toUpperCase();
            return `SCENE LOCK, FIXED VIEWPOINT, maintaining character consistency and pose. RELIGHTING ONLY: ${posDesc}, ${elevDesc}, ${intDesc} colored light (${color}), cinematic relighting`;
        }

        function presetSpecialPromptFromState(kind, state) {
            const normalized = normalizePresetSpecialState(kind, state);
            if (kind === 'qwen-multiangle') {
                return `${qwenMultianglePromptFromState(normalized)},${JSON.stringify({
                    horizontal: normalized.horizontal,
                    vertical: normalized.vertical,
                    zoom: normalized.zoom
                })}`;
            }
            if (kind === 'flux-anglelight') return fluxAnglelightPromptFromState(normalized);
            return '';
        }

        function renderPresetSpecialController(node) {
            const kind = getPresetSpecialControllerKind(node);
            if (!kind) return '';
            const state = presetSpecialControllerState(node, kind);
            const isFlux = kind === 'flux-anglelight';
            const prompt = presetSpecialPromptFromState(kind, state);
            const label = isFlux ? t('Angle Light', '角度打光') : t('Multi Angle', '多视角');
            return `
<div class="sai-preset-special-controller" data-preset-special-controller="${escapeHtml(kind)}">
  <div class="sai-preset-special-head">
    <span><i class="fa-solid ${isFlux ? 'fa-lightbulb' : 'fa-camera'}"></i>${escapeHtml(label)}</span>
    <b data-preset-special-values>${escapeHtml(`${state.horizontal}° / ${state.vertical}° / ${state.zoom.toFixed(1)}${isFlux ? ` / ${state.lightColor}` : ''}`)}</b>
  </div>
  <iframe data-preset-special-viewer="${escapeHtml(kind)}" src="${escapeHtml(presetSpecialViewerUrl(kind))}" title="${escapeHtml(label)}" loading="lazy"></iframe>
  <code data-preset-special-prompt>${escapeHtml(prompt)}</code>
</div>`;
        }

        function filterVisiblePresetParamsForSpecial(node, params) {
            const kind = getPresetSpecialControllerKind(node);
            if (!kind) return params;
            return params.filter(param => param && param.key !== 'scene_additional_prompt_2');
        }

        function getVisiblePresetParams(node) {
            const schema = getPresetSchema(node);
            const prepend = [
                { key: 'prompt', label: t('Positive Prompt', '正向提示词'), type: 'textarea', default: '' },
                { key: 'negative_prompt', label: t('Negative Prompt', '负向提示词'), type: 'textarea', default: '' }
            ];
            const seedParams = [
                { key: 'seed_random', label: 'Random Seed', type: 'checkbox', default: true },
                { key: 'image_seed', label: 'Seed', type: 'number', min: 0, max: 1125899906842623, step: 1, default: 0 }
            ];
            if (Array.isArray(schema.params) && schema.params.length) {
                const params = schema.params.filter(param => param && param.visible !== false && param.key && !isResolutionOwnedPresetParam(param.key));
                const keys = new Set(params.map(item => item.key));
                return filterVisiblePresetParamsForSpecial(node, [...prepend.filter(item => !keys.has(item.key)), ...seedParams.filter(item => !keys.has(item.key)), ...params]
                    .filter(param => shouldShowPresetParam(node, param)));
            }
            return filterVisiblePresetParamsForSpecial(node, [
                ...prepend,
                ...seedParams,
                { key: 'scene_additional_prompt', label: 'Prompt', type: 'textarea', default: '' }
            ].filter(param => shouldShowPresetParam(node, param)));
        }

        function shouldShowPresetParam(node, param) {
            if (!param?.key) return false;
            if (param.key !== 'image_seed') return true;
            const randomValue = presetParamValue(node, { key: 'seed_random', default: true });
            return randomValue === false || randomValue === 'false' || randomValue === 0 || randomValue === '0';
        }

        function isResolutionOwnedPresetParam(key) {
            return ['aspect_ratio', 'scene_aspect_ratio', 'aspect_ratios_selection'].includes(String(key || ''));
        }

        function presetParamValue(node, param) {
            if (!node || !param?.key) return param?.default ?? '';
            if (isPromptTextParam(param?.key)) {
                const source = getPromptTextSourceNode(node, param.key);
                if (source) return source.text?.value || '';
            }
            const params = node.params || {};
            if (Object.prototype.hasOwnProperty.call(params, param.key)) {
                const value = params[param.key];
                if (!isPromptTextParam(param.key) || String(value || '').trim()) return value;
            }
            if (isPromptTextParam(param.key)) {
                const defaults = canvasAgentPresetPromptDefaults(node);
                if (param.key === 'prompt' && defaults.prompt) return defaults.prompt;
                if (param.key === 'negative_prompt' && defaults.negative_prompt) return defaults.negative_prompt;
            }
            const themeInfo = getPresetThemeInfo(node);
            if (themeInfo.defaults && Object.prototype.hasOwnProperty.call(themeInfo.defaults, param.key)) {
                return themeInfo.defaults[param.key];
            }
            return param.default ?? '';
        }

        function isPromptTextParam(key) {
            return key === 'prompt' || key === 'negative_prompt';
        }

        function renderClassicNodeHtml(node) {
            const modes = CLASSIC_MODES || [];
            const mode = node.classic_mode || 't2i';
            const modeInfo = modes.find(m => m.key === mode) || modes[0] || { label: 'T2I', icon: '✏️' };
            const params = node.params || {};
            const ipMax = readNumberConfig(() => getClassicIpMaxImages(node), 4);
            const ipSlots = clamp(Number(node.classic_ip_count || 1), 1, ipMax);
            const imageNumber = clamp(Number(params.image_number ?? 1), 1, 16);
            const uovMethod = params.uov_method || 'Upscale (1.5x)';
            const inpaintMethod = normalizeClassicInpaintMode(params.inpaint_mode || 'Inpaint or Outpaint (default)');
            const outpaintDirs = (() => {
                if (Array.isArray(params.outpaint_selections) && params.outpaint_selections.length) return params.outpaint_selections;
                return (CLASSIC_OUTPAINT_DIRS || []).filter(d => !!params[`outpaint_${d.toLowerCase()}`]);
            })();
            const R_UOV = getClassicUovMethods(node);
            const R_IP_TYPES = getClassicIpTypes(node);
            const R_INPAINT = CLASSIC_INPAINT_METHODS || ['Inpaint or Outpaint (default)', 'Improve Detail (face, hand, eyes, etc.)', 'Modify Content (add objects, change background, etc.)'];
            const R_OUTPAINT = CLASSIC_OUTPAINT_DIRS || ['Left', 'Right', 'Top', 'Bottom'];
            const inputSlotsHtml = (mode === 'ip') ? Array.from({ length: ipSlots }, (_, i) => {
                const slotKey = `ip_image_${i}`;
                const boundNode = node.upload_slots?.[slotKey] ? getNode(node.upload_slots[slotKey]) : null;
                const ipType = params[`ip_type_${i}`] || R_IP_TYPES[0];
                const ipStop = params[`ip_stop_${i}`] ?? 0.5;
                const ipWeight = params[`ip_weight_${i}`] ?? 1.0;
                return `<div class="sai-preset-slot${collapsedKeepClass(node, 'upload', slotKey)}" data-slot-row="${slotKey}" title="${escapeHtml(slotPortTitle(slotKey))}">
  <button type="button" class="sai-node-handle sai-node-handle-in" data-handle-in="${slotKey}" data-slot-index="${i}" title="${escapeHtml(slotPortButtonTitle(slotKey))}"></button>
  <span>IP Image ${i + 1}</span>
  <b>${boundNode ? escapeHtml(boundNode.title || boundNode.id) : escapeHtml(notConnectedText())}</b>
  <small>${escapeHtml(slotPortHintText(slotKey))}</small>
</div>
<div class="sai-classic-ip-params">
  <select data-classic-ip-type="${i}">${R_IP_TYPES.map(t => `<option value="${escapeHtml(t)}" ${t === ipType ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select>
  <label class="sai-node-field sai-node-range"><span>Stop</span><div class="sai-range-pair"><input data-classic-ip-stop="${i}" type="range" min="0" max="1" step="0.05" value="${escapeHtml(ipStop)}"><input data-classic-ip-stop="${i}" type="number" min="0" max="1" step="0.05" value="${escapeHtml(ipStop)}"></div></label>
  <label class="sai-node-field sai-node-range"><span>Weight</span><div class="sai-range-pair"><input data-classic-ip-weight="${i}" type="range" min="0" max="2" step="0.05" value="${escapeHtml(ipWeight)}"><input data-classic-ip-weight="${i}" type="number" min="0" max="2" step="0.05" value="${escapeHtml(ipWeight)}"></div></label>
</div>`;
            }).join('') : '';
            const uovSlotHtml = (mode === 'uov') ? `<div class="sai-preset-slot${collapsedKeepClass(node, 'upload', 'uov_image')}" data-slot-row="uov_image" title="${escapeHtml(slotPortTitle('uov_image'))}">
  <button type="button" class="sai-node-handle sai-node-handle-in" data-handle-in="uov_image" title="${escapeHtml(slotPortButtonTitle('uov_image'))}"></button>
  <span>${escapeHtml(t('Source Image', '源图像'))}</span>
  <b>${node.upload_slots?.uov_image ? escapeHtml(getNode(node.upload_slots.uov_image)?.title || node.upload_slots.uov_image) : escapeHtml(notConnectedText())}</b>
  <small>${escapeHtml(slotPortHintText('uov_image'))}</small>
</div>
<label class="sai-node-field"><span>${escapeHtml(t('Method', '方法'))}</span><select data-node-param="uov_method">${R_UOV.map(m => `<option value="${escapeHtml(m)}" ${m === uovMethod ? 'selected' : ''}>${escapeHtml(tOption(m))}</option>`).join('')}</select></label>
${uovMethod.includes('Vary') || (uovMethod.includes('Upscale') && !uovMethod.includes('Fast')) ? `<label class="sai-node-field sai-node-range"><span>${escapeHtml(t('Denoise', '降噪'))}</span><div class="sai-range-pair"><input data-node-param="uov_denoise_strength" type="range" min="0" max="1" step="0.05" value="${escapeHtml(params.uov_denoise_strength ?? (uovMethod.includes('Strong') ? 0.85 : uovMethod.includes('Vary') ? 0.5 : 0.2))}"><input data-node-param="uov_denoise_strength" type="number" min="0" max="1" step="0.05" value="${escapeHtml(params.uov_denoise_strength ?? (uovMethod.includes('Strong') ? 0.85 : uovMethod.includes('Vary') ? 0.5 : 0.2))}"></div></label>` : ''}
</div>` : '';
            const inpaintSlotHtml = (mode === 'inpaint') ? (() => {
                const R_ENGINES = getClassicInpaintEngines(node);
                const imDefaults = getInpaintModeDefaults(inpaintMethod, node);
                const curEngine = params.inpaint_engine ?? imDefaults.engine;
                const curDenoise = params.inpaint_denoising_strength ?? imDefaults.denoise;
                const curRespective = params.inpaint_respective_field ?? imDefaults.respective;
                const curDisableLatent = params.inpaint_disable_initial_latent ?? imDefaults.disableLatent;
                const curInvertMask = params.invert_mask ?? false;
                const curAdditionalPrompt = params.inpaint_additional_prompt ?? '';
                return `<div class="sai-preset-slot${collapsedKeepClass(node, 'upload', 'inpaint_image')}" data-slot-row="inpaint_image" title="${escapeHtml(slotPortTitle('inpaint_image'))}">
  <button type="button" class="sai-node-handle sai-node-handle-in" data-handle-in="inpaint_image" title="${escapeHtml(slotPortButtonTitle('inpaint_image'))}"></button>
  <span>${escapeHtml(t('Source Image', '源图像'))}</span>
  <b>${node.upload_slots?.inpaint_image ? escapeHtml(getNode(node.upload_slots.inpaint_image)?.title || node.upload_slots.inpaint_image) : escapeHtml(notConnectedText())}</b>
  <small>${escapeHtml(slotPortHintText('inpaint_image'))}</small>
</div>
<div class="sai-preset-slot${collapsedKeepClass(node, 'upload', 'inpaint_mask')}" data-slot-row="inpaint_mask" title="${escapeHtml(t('Double-click port to add Advanced Masking; right-click port to disconnect', '双击接口添加高级遮罩；右键接口断开'))}">
  <button type="button" class="sai-node-handle sai-node-handle-in" data-handle-in="inpaint_mask" title="${escapeHtml(t('Double-click to add Advanced Masking', '双击添加高级遮罩'))}"></button>
  <span>${escapeHtml(t('Mask', '遮罩'))}</span>
  <b>${node.upload_slots?.inpaint_mask ? escapeHtml(getNode(node.upload_slots.inpaint_mask)?.title || node.upload_slots.inpaint_mask) : escapeHtml(notConnectedText())}</b>
  <small>${escapeHtml(portHintText())}</small>
</div>
<label class="sai-node-field"><span>${escapeHtml(t('Method', '方法'))}</span><select data-node-param="inpaint_mode">${R_INPAINT.map(m => `<option value="${escapeHtml(m)}" ${m === inpaintMethod ? 'selected' : ''}>${escapeHtml(tOption(m))}</option>`).join('')}</select></label>
<label class="sai-node-field"><span>${escapeHtml(t('Inpaint Engine', '重绘引擎'))}</span><select data-node-param="inpaint_engine">${R_ENGINES.map(e => `<option value="${escapeHtml(e)}" ${e === curEngine ? 'selected' : ''}>${escapeHtml(e)}</option>`).join('')}</select></label>
<label class="sai-node-field sai-node-range"><span>${escapeHtml(t('Denoise', '降噪'))}</span><div class="sai-range-pair"><input data-node-param="inpaint_denoising_strength" type="range" min="0" max="1" step="0.05" value="${escapeHtml(curDenoise)}"><input data-node-param="inpaint_denoising_strength" type="number" min="0" max="1" step="0.05" value="${escapeHtml(curDenoise)}"></div></label>
<label class="sai-node-field sai-node-range"><span>${escapeHtml(t('Respective Field', '作用范围'))}</span><div class="sai-range-pair"><input data-node-param="inpaint_respective_field" type="range" min="0" max="1" step="0.05" value="${escapeHtml(curRespective)}"><input data-node-param="inpaint_respective_field" type="number" min="0" max="1" step="0.05" value="${escapeHtml(curRespective)}"></div></label>
<label class="sai-node-check"><input data-node-param="inpaint_disable_initial_latent" type="checkbox" ${curDisableLatent ? 'checked' : ''}><span>${escapeHtml(t('Disable Initial Latent', '禁用初始潜空间'))}</span></label>
<label class="sai-node-check"><input data-node-param="invert_mask" type="checkbox" ${curInvertMask ? 'checked' : ''}><span>${escapeHtml(t('Invert Mask', '反转遮罩'))}</span></label>
${imDefaults.showOutpaint ? `<div class="sai-classic-outpaint">${R_OUTPAINT.map(d => `<label class="sai-node-check"><input data-node-param="outpaint_${d.toLowerCase()}" type="checkbox" ${outpaintDirs.includes(d) ? 'checked' : ''}><span>${escapeHtml(d)}</span></label>`).join('')}</div>` : ''}
${imDefaults.showAdditionalPrompt ? `<label class="sai-node-field"><span>${escapeHtml(t('Additional Prompt', '附加提示词'))}</span><textarea data-node-param="inpaint_additional_prompt" rows="2"${danbooruAutocompleteAttrs('inpaint_additional_prompt')} placeholder="${escapeHtml(t('Additional prompt...', '附加提示词...'))}">${escapeHtml(curAdditionalPrompt)}</textarea></label>` : ''}`;
            })() : '';
            const enhanceSlotHtml = (mode === 'enhance') ? (() => {
                const enhanceUovMethod = params.enhance_uov_method || 'Disabled';
                const enhanceStrength = params.enhance_uov_strength ?? 0.5;
                const enhanceOrder = params.enhance_uov_processing_order || 'Before First Enhancement';
                const enhancePromptType = params.enhance_uov_prompt_type || 'Original Prompts';
                const orderChoices = CLASSIC_ENHANCE_UOV_PROCESSING_ORDER || ['Before First Enhancement', 'After Last Enhancement'];
                const promptTypeChoices = CLASSIC_ENHANCE_UOV_PROMPT_TYPES || ['Original Prompts', 'Last Filled Enhancement Prompts'];
                const regionRows = [0, 1, 2].map((index) => {
                    const region = getClassicEnhanceRegionValues(node, index);
                    const preset = getClassicEnhanceRegionDefault(index);
                    const slot = detectionSlotForRegion(index);
                    const currentProject = getProject() || {};
                    const edge = (currentProject.edges || []).find(item => item.type === 'config' && item.to === node.id && item.slot === slot);
                    const configNode = edge ? getNode(edge.from) : null;
                    const modelLabel = region.mask_model === 'sam'
                        ? `SAM / ${region.dino_prompt || preset.prompt || ''}`
                        : `${region.mask_model || 'mask'} / ${region.dino_prompt || preset.prompt || ''}`;
                    return `<div class="sai-enhance-region-row${collapsedKeepClass(node, 'config', slot)}" data-config-interface="${slot}" title="${escapeHtml(t('Double-click to create {label}', '双击创建 {label}').replace('{label}', getDetectionConfigLabel(index)))}">
  <button type="button" class="sai-node-handle sai-node-handle-in" data-config-in="${slot}" title="${escapeHtml(t('{label} input', '{label} 输入').replace('{label}', getDetectionConfigLabel(index)))}"></button>
  <label class="sai-node-check"><input data-node-param="${escapeHtml(enhanceRegionKey(index))}_enabled" type="checkbox" ${region.enabled ? 'checked' : ''}><span></span></label>
  <i class="fa-solid fa-crosshairs"></i>
  <span>${escapeHtml(`${t('Region', '区域')} #${index + 1} ${preset.label || ''}`)}<em>${escapeHtml(configNode ? `${t('from', '来自')} ${configNode.title || configNode.id}` : modelLabel)}</em></span>
  <small>${escapeHtml(portHintText())}</small>
</div>
<div class="sai-enhance-region-controls">
  <label class="sai-node-field sai-node-range"><span>${escapeHtml(t('Denoise', '降噪'))}</span><div class="sai-range-pair"><input data-node-param="${escapeHtml(enhanceRegionKey(index))}_inpaint_strength" type="range" min="0" max="1" step="0.05" value="${escapeHtml(region.inpaint_strength ?? 0.5)}"><input data-node-param="${escapeHtml(enhanceRegionKey(index))}_inpaint_strength" type="number" min="0" max="1" step="0.05" value="${escapeHtml(region.inpaint_strength ?? 0.5)}"></div></label>
  <label class="sai-node-field sai-node-range"><span>${escapeHtml(t('Field', '作用范围'))}</span><div class="sai-range-pair"><input data-node-param="${escapeHtml(enhanceRegionKey(index))}_inpaint_respective_field" type="range" min="0" max="1" step="0.05" value="${escapeHtml(region.inpaint_respective_field ?? 0.2)}"><input data-node-param="${escapeHtml(enhanceRegionKey(index))}_inpaint_respective_field" type="number" min="0" max="1" step="0.05" value="${escapeHtml(region.inpaint_respective_field ?? 0.2)}"></div></label>
</div>`;
                }).join('');
                return `<div class="sai-preset-slot${collapsedKeepClass(node, 'upload', 'enhance_image')}" data-slot-row="enhance_image" title="${escapeHtml(slotPortTitle('enhance_image'))}">
  <button type="button" class="sai-node-handle sai-node-handle-in" data-handle-in="enhance_image" title="${escapeHtml(slotPortButtonTitle('enhance_image'))}"></button>
  <span>${escapeHtml(t('Source Image', '源图像'))}</span>
  <b>${node.upload_slots?.enhance_image ? escapeHtml(getNode(node.upload_slots.enhance_image)?.title || node.upload_slots.enhance_image) : escapeHtml(notConnectedText())}</b>
  <small>${escapeHtml(slotPortHintText('enhance_image'))}</small>
</div>
<label class="sai-node-field"><span>${escapeHtml(t('Upscale / Variation', '放大 / 变化'))}</span><select data-node-param="enhance_uov_method">${R_UOV.map(m => `<option value="${escapeHtml(m)}" ${m === enhanceUovMethod ? 'selected' : ''}>${escapeHtml(tOption(m))}</option>`).join('')}</select></label>
${enhanceUovMethod !== 'Disabled' ? `<label class="sai-node-field sai-node-range"><span>${escapeHtml(t('Denoise', '降噪'))}</span><div class="sai-range-pair"><input data-node-param="enhance_uov_strength" type="range" min="0" max="1" step="0.05" value="${escapeHtml(enhanceStrength)}"><input data-node-param="enhance_uov_strength" type="number" min="0" max="1" step="0.05" value="${escapeHtml(enhanceStrength)}"></div></label>
<label class="sai-node-field"><span>${escapeHtml(t('Order', '顺序'))}</span><select data-node-param="enhance_uov_processing_order">${orderChoices.map(item => `<option value="${escapeHtml(item)}" ${item === enhanceOrder ? 'selected' : ''}>${escapeHtml(tOption(item))}</option>`).join('')}</select></label>
${enhanceOrder === 'After Last Enhancement' ? `<label class="sai-node-field"><span>${escapeHtml(t('Upscale Prompt', '放大提示词'))}</span><select data-node-param="enhance_uov_prompt_type">${promptTypeChoices.map(item => `<option value="${escapeHtml(item)}" ${item === enhancePromptType ? 'selected' : ''}>${escapeHtml(tOption(item))}</option>`).join('')}</select></label>` : ''}` : ''}
<div class="sai-classic-enhance-params">
  <div class="sai-mini-section-title">${escapeHtml(t('Regions', '区域'))} <small>${escapeHtml(t('Double-click the green dot or region row to open Detection Config', '双击绿点或区域行打开检测配置'))}</small></div>
  ${regionRows}
</div>`;
            })() : '';
            const effectivePrompt = getPromptTextSourceNode(node, 'prompt') ? getPromptTextSourceNode(node, 'prompt').text?.value : params.prompt;
            const runDisabled = (mode === 'ip' && !node.upload_slots?.ip_image_0 && !effectivePrompt) ? 'disabled' : '';
            return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtml(modeInfo.icon)} Classic</span>
  <span class="sai-node-title">${escapeHtml(node.title || node.preset?.name || 'Classic')}</span>
  ${renderNodeStateBadges(node)}
  <button type="button" data-node-action="xyz-plot" title="${escapeHtml(t('X/Y/Z Plot', 'X/Y/Z 对比生成'))}"><i class="fa-solid fa-table-cells-large"></i></button>
  <button type="button" data-node-action="run" title="${escapeHtml(t('Run', '运行'))}" ${runDisabled}><i class="fa-solid fa-play"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtml(t('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-preset-meta">
  <span>${escapeHtml(node.runtime?.backend_engine || 'Backend')}</span>
  <span>${escapeHtml(node.runtime?.task_method || 'workflow')}</span>
</div>
${renderPresetModelStatusHtml(node)}
<label class="sai-node-field sai-node-theme"><span>${escapeHtml(t('Mode', '模式'))}</span><select data-classic-mode>${modes.map(m => `<option value="${escapeHtml(m.key)}" ${m.key === mode ? 'selected' : ''}>${escapeHtml(m.icon)} ${escapeHtml(m.label)}</option>`).join('')}</select></label>
<div class="sai-config-strip">
  ${getPresetConfigKinds().map(kind => renderPresetConfigPortRow(node, kind)).join('')}
</div>
<div class="sai-preset-slots">${inputSlotsHtml}${uovSlotHtml}${inpaintSlotHtml}${enhanceSlotHtml}</div>
${(mode === 'ip' && ipMax > 1) ? `<label class="sai-node-field sai-node-range"><span>${escapeHtml(t('IP Images', 'IP 图像'))}</span><div class="sai-range-pair"><input data-classic-param="ip_count" type="range" min="1" max="${ipMax}" step="1" value="${escapeHtml(ipSlots)}"><input data-classic-param="ip_count" type="number" min="1" max="${ipMax}" step="1" value="${escapeHtml(ipSlots)}"></div></label>` : ''}
${renderPresetParamControl(node, { key: 'prompt', label: 'Prompt', type: 'textarea' }, 'data-node-param')}
${renderPresetParamControl(node, { key: 'negative_prompt', label: 'Negative Prompt', type: 'textarea' }, 'data-node-param')}
<div class="sai-preset-param-list">
  <label class="sai-node-check"><input data-node-param="seed_random" type="checkbox" ${params.seed_random !== false ? 'checked' : ''}><span>${escapeHtml(t('Random Seed', '随机种子'))}</span></label>
  ${params.seed_random === false ? `<label class="sai-node-field"><span>${escapeHtml(t('Seed', '种子'))}</span><input data-node-param="image_seed" type="number" step="1" value="${escapeHtml(params.image_seed ?? 0)}"></label>` : ''}
  <label class="sai-node-field sai-node-range"><span>${escapeHtml(t('Images', '图片数'))}</span><div class="sai-range-pair"><input data-node-param="image_number" type="range" min="1" max="16" step="1" value="${escapeHtml(imageNumber)}"><input data-node-param="image_number" type="number" min="1" max="16" step="1" value="${escapeHtml(imageNumber)}"></div></label>
</div>
${renderRunnableNodeStatusFoot(node)}
<button type="button" class="sai-node-secondary" data-node-action="xyz-plot"><i class="fa-solid fa-table-cells-large"></i><span>${escapeHtml(t('X/Y/Z Plot', 'X/Y/Z 对比生成'))}</span></button>
<button type="button" class="sai-node-primary" data-node-action="run" ${runDisabled}><i class="fa-solid fa-play"></i><span>${escapeHtml(t('Run', '运行'))}</span></button>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="preset" title="${escapeHtml(t('Generated output', '生成输出'))}"></button>`;
        }

        function renderPresetNodeHtml(node) {
            const slots = node.upload_slots || {};
            const schema = getPresetSchema(node);
            const themes = Array.isArray(schema.themes) ? schema.themes : [];
            const theme = getPresetTheme(node);
            const params = getVisiblePresetParams(node);
            const uploadSlots = getVisibleUploadSlots(node);
            const taskMethod = getPresetThemeInfo(node).task_method || node.runtime?.task_method || '';
            return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtml(t('Scene', '场景'))}</span>
  <span class="sai-node-title">${escapeHtml(node.title || node.preset?.name || t('Scene', '场景'))}</span>
  ${renderNodeStateBadges(node)}
  ${isStyleTransferPresetNode(node) ? `<button type="button" data-node-action="add-style-selector" title="${escapeHtml(t('Add or focus Style Selector', '添加或定位 Style Selector'))}"><i class="fa-solid fa-palette"></i></button>` : ''}
  ${isLivePortraitVideoExpressionPresetNode(node) ? `<button type="button" data-node-action="edit-liveportrait-video-expression" title="${escapeHtml(t('Edit LivePortrait Video expression', '编辑 LivePortrait 视频表情'))}"><i class="fa-solid fa-face-smile"></i></button>` : ''}
  ${isLtx23MultiGuidePresetNode(node) ? `<button type="button" data-node-action="edit-ltx23-guides" title="${escapeHtml(t('Edit LTX keyframe guides', '编辑 LTX 关键帧引导'))}"><i class="fa-solid fa-sliders"></i></button>` : ''}
  ${isMiniMaxH3PresetNode(node) ? `<button type="button" data-node-action="edit-h3-storyboard" title="${escapeHtml(t('Edit MiniMax H3 storyboard', '编辑 MiniMax H3 分镜表'))}"><i class="fa-solid fa-table-list"></i></button>` : ''}
  <button type="button" data-node-action="xyz-plot" title="${escapeHtml(t('X/Y/Z Plot', 'X/Y/Z 对比生成'))}"><i class="fa-solid fa-table-cells-large"></i></button>
  <button type="button" data-node-action="run" title="${escapeHtml(t('Run', '运行'))}"><i class="fa-solid fa-play"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtml(t('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-preset-meta">
  <span>${escapeHtml(node.runtime?.backend_engine || t('Backend', '后端'))}</span>
  <span>${escapeHtml(localizeCanvasLabel(taskMethod || 'workflow'))}</span>
</div>
${renderPresetModelStatusHtml(node)}
<div class="sai-config-strip">
  ${getPresetConfigKinds().map(kind => renderPresetConfigPortRow(node, kind)).join('')}
</div>
${renderStyleTransferPresetController(node)}
${renderLivePortraitVideoExpressionPresetController(node)}
${renderLtx23GuidePresetController(node)}
${renderMiniMaxH3StoryboardPresetController(node)}
${themes.length ? `<label class="sai-node-field sai-node-theme"><span>${escapeHtml(localizeCanvasLabel(schema.theme_title || 'Theme'))}</span><select data-node-theme>${themes.map(item => `<option value="${escapeHtml(item)}" ${item === theme ? 'selected' : ''}>${escapeHtml(localizeCanvasLabel(item))}</option>`).join('')}</select></label>` : ''}
<div class="sai-preset-slots">
${uploadSlots.map((slotInfo, index) => {
            const slot = slotInfo.key;
            const boundNode = slots[slot] ? getNode(slots[slot]) : null;
            const orderHint = getSlotOrderHint(slot, node);
            return `<div class="sai-preset-slot${collapsedKeepClass(node, 'upload', slot)}" data-slot-row="${slot}" title="${escapeHtml(slotPortTitle(slot))}">
  <button type="button" class="sai-node-handle sai-node-handle-in" data-handle-in="${slot}" data-slot-index="${index}" title="${escapeHtml(slotPortButtonTitle(slot))}"></button>
  <span>${orderHint ? `<em>${escapeHtml(orderHint)}</em> ` : ''}${escapeHtml(localizeCanvasLabel(slotInfo.label || getSlotLabels()[slot] || slot))}</span>
  <b>${boundNode ? escapeHtml(boundNode.title || boundNode.id) : escapeHtml(notConnectedText())}</b>
  <small>${escapeHtml(slotPortHintText(slot))}</small>
</div>`;
        }).join('')}
</div>
${renderPresetSpecialController(node)}
<div class="sai-preset-param-list">${params.map(param => renderPresetParamControl(node, param, 'data-node-param')).join('')}</div>
${renderRunnableNodeStatusFoot(node)}
<button type="button" class="sai-node-secondary" data-node-action="xyz-plot"><i class="fa-solid fa-table-cells-large"></i><span>${escapeHtml(t('X/Y/Z Plot', 'X/Y/Z 对比生成'))}</span></button>
<button type="button" class="sai-node-primary" data-node-action="run"><i class="fa-solid fa-play"></i><span>${escapeHtml(t('Run', '运行'))}</span></button>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="preset" title="${escapeHtml(t('Generated output', '生成输出'))}"></button>`;
        }

        return {
            renderClassicNodeHtml,
            renderPresetNodeHtml,
            getSlotOrderHint,
            getPresetSpecialControllerKind,
            normalizePresetSpecialState,
            presetSpecialControllerState,
            presetSpecialPromptFromState,
            renderPresetSpecialController,
            filterVisiblePresetParamsForSpecial,
            getVisiblePresetParams,
            shouldShowPresetParam,
            isResolutionOwnedPresetParam,
            presetParamValue,
            isPromptTextParam
        };
    }

    window.SimpAICanvasWorkbenchPresetNodeRenderer = Object.assign({}, window.SimpAICanvasWorkbenchPresetNodeRenderer || {}, {
        createCanvasPresetNodeRenderer
    });
})();
