(function () {
    'use strict';

    function createCanvasXyzMatrixEditorController(context) {
        const scope = context?.xyzMatrixEditorSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const presetSource = scope.presetSource || {};
        const serializationSource = scope.serializationSource || {};
        const scriptSource = scope.scriptSource || {};
        const axisSource = scope.axisSource || {};
        const modalSource = scope.modalSource || {};
        const apiSource = scope.apiSource || {};
        const languageSource = scope.languageSource || {};
        const projectSource = scope.projectSource || {};
        const layoutSource = scope.layoutSource || {};
        const historySource = scope.historySource || {};
        const selectionSource = scope.selectionSource || {};
        const renderSource = scope.renderSource || {};
        const runSource = scope.runSource || {};
        const identitySource = scope.identitySource || {};
        const call = (source, name, fallback, ...args) => typeof source?.[name] === 'function'
            ? source[name](...args)
            : fallback;
        const getNode = (...args) => call(nodeSource, 'getNode', null, ...args);
        const getPresetThemeInfo = (...args) => call(presetSource, 'getPresetThemeInfo', {}, ...args) || {};
        const serializeClassicNodeForRun = (...args) => call(serializationSource, 'serializeClassicNodeForRun', {}, ...args) || {};
        const serializePresetForRun = (...args) => call(serializationSource, 'serializePresetForRun', {}, ...args) || {};
        const t = (...args) => call(languageSource, 't', args[0], ...args);
        const clone = (value, fallback) => call(serializationSource, 'cloneRunValue', undefined, value, fallback)
            ?? JSON.parse(JSON.stringify(value ?? fallback));
        const getProject = () => call(projectSource, 'getProject', null);
        const sourceFingerprint = node => call(presetSource, 'computePresetRunFingerprint', '', node)
            || JSON.stringify(serializeXyzSourceNode(node));

        function comparisonError(response) {
            if (response?.error_code === 'too_many_variants') return t('Comparison has {count} variants; maximum is {max}.', '对比包含 {count} 个组合，最多允许 {max} 个。')
                .replace('{count}', response.variant_count).replace('{max}', response.max_variants);
            if (response?.error_code === 'invalid_axes') return t('Parameter values are invalid.', '参数取值不合法。');
            if (response?.error_code === 'invalid_settings') return t('Comparison settings are invalid.', '对比设置不合法。');
            return response?.error || t('Comparison validation failed.', '参数对比校验失败。');
        }

        function comparisonParameterKeys(node) {
            if (node?.type === 'classic') return undefined;
            if (typeof presetSource.getVisiblePresetParams !== 'function') return undefined;
            const fixedPrompt = String(node?.preset?.name || '').toLowerCase() === 'onekeykontext'
                || (node?.preset?.prompt_mode || node?.schema?.prompt_mode) === 'preset_fixed';
            return (presetSource.getVisiblePresetParams(node) || [])
                .filter(param => param?.key && param.visible !== false && param.interactive !== false
                    && !(fixedPrompt && param.key === 'prompt')
                    && !call(presetSource, 'getPromptTextSourceNode', null, node, param.key))
                .map(param => param.key);
        }

        function comparisonAxisOptions(node, options) {
            const keys = comparisonParameterKeys(node);
            let list = Array.isArray(options) && options.length ? options.slice() : (axisSource.fallbackOptions || []).slice();
            list = list.filter(option => option.label !== 'Resolution Template');
            if (keys) {
                const allowed = new Set(keys);
                list = list.filter(option => (!option.param_key || allowed.has(option.param_key))
                    && (option.label !== 'Prompt' || allowed.has('prompt'))
                    && (option.label !== 'Negative Prompt' || allowed.has('negative_prompt')));
                const existing = new Set(list.map(option => option.label));
                for (const param of presetSource.getVisiblePresetParams(node) || []) {
                    if (!allowed.has(param.key) || existing.has(`param:${param.key}`)
                        || ['prompt', 'negative_prompt', 'seed_random', 'image_seed'].includes(param.key)
                        || !/^[A-Za-z][A-Za-z0-9_]*$/.test(param.key)
                        || ['constructor', 'prototype'].includes(param.key)
                        || !['number', 'choice', 'checkbox', 'textarea', 'text'].includes(param.type || 'number')) continue;
                    const choices = param.type === 'checkbox' ? ['false', 'true'] : (param.choices || []);
                    list.push({ label: `param:${param.key}`, display_label: param.label || param.key,
                        param_key: param.key, group: 'preset', mode: 'both', choices,
                        type: param.type === 'checkbox' ? 'bool' : param.type === 'number' ? 'float' : 'str',
                        min: param.min, max: param.max, step: param.step,
                        current_value: node.params?.[param.key] ?? param.default });
                }
            }
            return list;
        }

        function visibleXyzAxisOptions(options, mode) {
            const list = Array.isArray(options) && options.length ? options : axisSource.fallbackOptions || [];
            const normalizedMode = String(mode || 'txt2img').toLowerCase();
            return list.filter((option) => {
                const axisMode = String(option?.mode || 'both').toLowerCase();
                return axisMode === 'both' || axisMode === normalizedMode;
            });
        }

        function getXyzAxisOption(options, label, mode) {
            const list = visibleXyzAxisOptions(options, mode);
            return list.find(option => option.label === label) || list[0] || axisSource.fallbackOptions?.[0];
        }

        function xyzModeForNode(node) {
            if (!node) return 'txt2img';
            if (node.type === 'classic') {
                const mode = String(node.classic_mode || 't2i').toLowerCase();
                return mode === 't2i' || mode === 'txt2img' ? 'txt2img' : 'img2img';
            }
            const themeInfo = getPresetThemeInfo(node);
            const task = String(themeInfo.task_method || node.runtime?.task_method || node.runtime?.engine_type || node.schema?.engine_type || '').toLowerCase();
            return task.includes('img2img') || task.includes('inpaint') || task.includes('upscale') ? 'img2img' : 'txt2img';
        }

        function xyzCsvJoin(values) {
            return (Array.isArray(values) ? values : []).map((value) => {
                const text = String(value ?? '');
                return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
            }).join(', ');
        }

        function defaultXyzPlotState(node) {
            return {
                axes: {
                    x: { axis: 'x', type: 'Seed', values_text: '-1', values: [] },
                    y: { axis: 'y', type: 'Nothing', values_text: '', values: [] },
                    z: { axis: 'z', type: 'Nothing', values_text: '', values: [] }
                },
                options: {
                    stop_on_error: true,
                    draw_legend: true,
                    include_sub_images: false,
                    include_sub_grids: false,
                    keep_minus_one: false,
                    vary_seeds_x: false,
                    vary_seeds_y: false,
                    vary_seeds_z: false,
                    row_count: 0,
                    margin_size: 0,
                    csv_mode: false
                },
                mode: xyzModeForNode(node)
            };
        }

        function collectXyzModalState(modal) {
            if (!modal) return null;
            const state = modal.__xyzState || defaultXyzPlotState(getNode(modal.__sourceNodeId));
            ['x', 'y', 'z'].forEach((axisName) => {
                const typeField = modal.querySelector('[data-xyz-axis-type="' + axisName + '"]');
                const textField = modal.querySelector('[data-xyz-axis-values="' + axisName + '"]');
                const choiceField = modal.querySelector('[data-xyz-axis-choices="' + axisName + '"]');
                const axis = Object.assign({ axis: axisName }, state.axes?.[axisName] || {});
                if (typeField) axis.type = typeField.value || 'Nothing';
                if (choiceField && !state.options.csv_mode) {
                    axis.values = Array.from(choiceField.selectedOptions || []).map(option => option.value);
                    axis.values_text = xyzCsvJoin(axis.values);
                } else if (textField) {
                    axis.values_text = textField.value || '';
                    axis.values = [];
                }
                state.axes[axisName] = axis;
            });
            modal.querySelectorAll('[data-xyz-option]').forEach((field) => {
                const key = field.getAttribute('data-xyz-option');
                if (!key) return;
                if (field.type === 'checkbox') state.options[key] = !!field.checked;
                else if (field.type === 'number' || field.type === 'range') state.options[key] = Number(field.value || 0);
                else state.options[key] = field.value;
            });
            modal.__xyzState = state;
            return state;
        }

        function serializeXyzSourceNode(node) {
            if (!node || !['preset', 'classic'].includes(node.type)) return {};
            const serialized = clone(node.type === 'classic' ? serializeClassicNodeForRun(node) : serializePresetForRun(node), {});
            if (node.type === 'preset' && typeof presetSource.getVisiblePresetParams === 'function') {
                const keys = new Set(comparisonParameterKeys(node));
                serialized.schema = Object.assign({}, serialized.schema || {}, {
                    params: clone((presetSource.getVisiblePresetParams(node) || []).filter(param => keys.has(param.key)), [])
                });
            }
            return serialized;
        }

        function buildXyzJobFromModal(modal) {
            const source = getNode(modal?.__sourceNodeId);
            const state = collectXyzModalState(modal) || defaultXyzPlotState(source);
            const job = {
                script: scriptSource.script || '',
                source_node_id: source?.id || '',
                source_node: serializeXyzSourceNode(source),
                mode: state.mode || xyzModeForNode(source),
                axes: ['x', 'y', 'z'].map(axisName => Object.assign({ axis: axisName }, state.axes[axisName] || {})),
                options: Object.assign({}, state.options || {})
            };
            const keys = comparisonParameterKeys(source);
            if (keys) job.parameter_keys = keys;
            job.max_variants = 128;
            job.execution_mode = 'preset_runs';
            if (modal.__xyzSeedNonce) job.seed_nonce = modal.__xyzSeedNonce;
            return job;
        }

        function renderXyzPlotModal(modal) {
            const source = getNode(modal.__sourceNodeId);
            const state = modal.__xyzState || defaultXyzPlotState(source);
            modal.__xyzState = state;
            modal.innerHTML = modalSource.renderXyzPlotModalHtml(modal, source, state);
            bindXyzPlotModal(modal);
        }

        function bindXyzPlotModal(modal) {
            modal.querySelector('[data-modal-close]')?.addEventListener('click', () => modal.remove());
            if (!modal.__xyzBackdropBound) {
                modal.__xyzBackdropBound = true;
                modal.addEventListener('click', (evt) => {
                    if (evt.target === modal) modal.remove();
                });
            }
            modal.querySelectorAll('[data-xyz-axis-type], [data-xyz-axis-values], [data-xyz-axis-choices], [data-xyz-option]').forEach((field) => {
                const handler = () => {
                    const previous = clone(modal.__xyzState?.axes || {}, {});
                    collectXyzModalState(modal);
                    modal.__xyzPreview = null;
                    modal.__xyzPreviewRequestId = (modal.__xyzPreviewRequestId || 0) + 1;
                    modal.classList.remove('is-busy');
                    if (field.hasAttribute('data-xyz-axis-type')) {
                        const name = field.getAttribute('data-xyz-axis-type');
                        const axis = modal.__xyzState.axes[name];
                        if (axis && previous[name]?.type !== axis.type) {
                            const option = getXyzAxisOption(modal.__xyzAxisOptions, axis.type, modal.__xyzState.mode);
                            const value = option.current_value;
                            axis.values = value !== undefined && value !== null ? [value] : [];
                            axis.values_text = xyzCsvJoin(axis.values);
                        }
                    }
                    if (field.getAttribute('data-xyz-option') === 'csv_mode' || field.hasAttribute('data-xyz-axis-type')) {
                        modal.__xyzPreview = null;
                        renderXyzPlotModal(modal);
                    }
                };
                field.addEventListener('input', handler);
                field.addEventListener('change', handler);
            });
            modal.querySelectorAll('[data-xyz-fill-choices]').forEach((button) => {
                button.addEventListener('click', () => {
                    const axisName = button.getAttribute('data-xyz-fill-choices');
                    const state = collectXyzModalState(modal);
                    const option = getXyzAxisOption(modal.__xyzAxisOptions, state.axes?.[axisName]?.type, state.mode);
                    const choices = Array.isArray(option?.choices) ? option.choices.filter(value => value !== null && value !== undefined) : [];
                    state.axes[axisName].values = choices;
                    state.axes[axisName].values_text = xyzCsvJoin(choices);
                    modal.__xyzPreview = null;
                    renderXyzPlotModal(modal);
                });
            });
            modal.querySelectorAll('[data-xyz-swap]').forEach((button) => {
                button.addEventListener('click', () => {
                    const state = collectXyzModalState(modal);
                    const [left, right] = String(button.getAttribute('data-xyz-swap') || '').split(':');
                    if (!left || !right) return;
                    const leftAxis = Object.assign({}, state.axes[left] || {}, { axis: right });
                    const rightAxis = Object.assign({}, state.axes[right] || {}, { axis: left });
                    state.axes[left] = rightAxis;
                    state.axes[right] = leftAxis;
                    modal.__xyzPreview = null;
                    renderXyzPlotModal(modal);
                });
            });
            modal.querySelector('[data-xyz-action="preview"]')?.addEventListener('click', () => previewXyzPlotFromModal(modal, false));
            modal.querySelector('[data-xyz-action="create"]')?.addEventListener('click', () => previewXyzPlotFromModal(modal, true));
        }

        async function openXyzPlotPanel(node) {
            if (!node || !['preset', 'classic'].includes(node.type)) return;
            const doc = modalSource.document;
            doc.querySelector('.sai-xyz-plot-modal')?.remove();
            const modal = doc.createElement('div');
            modal.className = `sai-canvas-modal sai-xyz-plot-modal ${call(modalSource, 'detectWorkbenchTheme', 'light') === 'dark' ? 'theme-dark' : ''}`;
            modal.__sourceNodeId = node.id;
            modal.__xyzSeedNonce = call(identitySource, 'uid', '', 'comparison');
            modal.__sourceNode = node;
            modal.__sourceProject = getProject();
            modal.__sourceFingerprint = sourceFingerprint(node);
            modal.__xyzState = defaultXyzPlotState(node);
            modal.__xyzAxisOptions = comparisonAxisOptions(node);
            modal.__xyzPreview = null;
            (call(modalSource, 'getRoot', null) || doc.body).appendChild(modal);
            renderXyzPlotModal(modal);
            if (typeof apiSource.xyzAxisOptions === 'function') {
                try {
                    const response = await apiSource.xyzAxisOptions({
                        mode: modal.__xyzState.mode,
                        source_node: serializeXyzSourceNode(node),
                        execution_mode: 'preset_runs',
                        parameter_keys: comparisonParameterKeys(node),
                        include_choices: true
                    });
                    if (response?.ok && Array.isArray(response.options) && response.options.length
                        && doc.body.contains(modal) && getNode(node.id) === node && getProject() === modal.__sourceProject
                        && sourceFingerprint(node) === modal.__sourceFingerprint) {
                        modal.__xyzAxisOptions = comparisonAxisOptions(node, response.options);
                        renderXyzPlotModal(modal);
                    }
                } catch (err) {
                    if (doc.body.contains(modal) && getNode(node.id) === node) {
                        call(modalSource, 'showToast', undefined,
                            t('X/Y/Z axis options failed to load.', 'X/Y/Z 轴选项加载失败。'));
                    }
                }
            }
        }

        async function previewXyzPlotFromModal(modal, createMatrix) {
            const source = getNode(modal?.__sourceNodeId);
            if (!source) return;
            if (modal.__sourceNode && (modal.__sourceNode !== source || getProject() !== modal.__sourceProject
                || sourceFingerprint(source) !== modal.__sourceFingerprint)) {
                call(modalSource, 'showToast', undefined, t('Source settings changed. Reopen parameter comparison.', '来源参数已改变，请重新打开参数对比。'));
                return;
            }
            const requestId = (modal.__xyzPreviewRequestId || 0) + 1;
            modal.__xyzPreviewRequestId = requestId;
            const payload = {
                job: buildXyzJobFromModal(modal),
                user_context: call(apiSource, 'getWorkbenchUserContext', {})
            };
            if (typeof apiSource.xyzPreview !== 'function') {
                modal.__xyzPreview = { ok: false, error: t('X/Y/Z preview API is not loaded.', 'X/Y/Z 预览接口未加载。') };
                renderXyzPlotModal(modal);
                return;
            }
            modal.classList.add('is-busy');
            let response;
            try {
                response = await apiSource.xyzPreview(payload);
            } catch (err) {
                response = { ok: false, error: err?.message || t('X/Y/Z preview failed', 'X/Y/Z 预览失败') };
            }
            if (modal.__xyzPreviewRequestId !== requestId || !modalSource.document.body.contains(modal)) return;
            if (getNode(source.id) !== source || (modal.__sourceProject && getProject() !== modal.__sourceProject)) {
                modal.remove();
                return;
            }
            if (modal.__sourceFingerprint && sourceFingerprint(source) !== modal.__sourceFingerprint) {
                modal.classList.remove('is-busy');
                return;
            }
            modal.classList.remove('is-busy');
            if (response?.ok && response.parameter_comparison_version !== 1) {
                response = { ok: false, error: t('Parameter comparison requires the updated Studio backend.', '参数对比需要加载更新后的 Studio 服务端代码。') };
            }
            if (response && !response.ok && response.error_code) response = Object.assign({}, response, { error: comparisonError(response) });
            modal.__xyzPreview = response;
            if (!response?.ok) {
                renderXyzPlotModal(modal);
                call(modalSource, 'showToast', undefined, response?.error || t('X/Y/Z preview failed', 'X/Y/Z 预览失败'));
                return;
            }
            if (createMatrix) {
                createXyzMatrixFromPreview(source, response, payload.job);
                modal.remove();
                return;
            }
            renderXyzPlotModal(modal);
        }

        function createXyzMatrixFromPreview(source, preview, rawJob) {
            if (!source || !preview?.ok || getNode(source.id) !== source) return null;
            const project = call(projectSource, 'getProject', null);
            if (!project) return null;
            const sourceRect = layoutSource.getNodeRect(source);
            const base = {
                x: Math.round(sourceRect.x + sourceRect.w + 80),
                y: Math.round(sourceRect.y)
            };
            const matrixNode = nodeSource.buildXyzMatrixNode({ source, preview, position: base });
            if (!matrixNode) return null;
            matrixNode.xyz.source_fingerprint = sourceFingerprint(source);
            const jobId = matrixNode.batch_job_id;
            call(historySource, 'pushHistory', undefined, 'Create X/Y/Z matrix');
            layoutSource.placeNodeAvoidingOverlap(matrixNode, base, {});
            Object.assign(project, projectSource.buildProjectNodeAppendPatch(project, matrixNode));
            Object.assign(project, projectSource.buildProjectBatchJobAppendPatch(project, projectSource.buildXyzBatchJob({
                jobId,
                sourceNodeId: source.id,
                axes: preview.axes,
                options: preview.options,
                variants: preview.variants,
                matrixNodeId: matrixNode.id,
                jobPayload: rawJob
            })));
            selectionSource.selectSingleNode(matrixNode.id);
            call(historySource, 'mutate', undefined, { inspector: true });
            call(modalSource, 'showToast', undefined, t('Parameter comparison created.', '参数对比已创建。'));
            return matrixNode;
        }

        function focusXyzMatrixSource(node) {
            const source = getNode(node?.source_node_id || node?.xyz?.source_node_id || '');
            if (!source) {
                call(modalSource, 'showToast', undefined, t('Source node is missing.', '来源节点不存在'));
                return;
            }
            selectionSource.selectSingleNode(source.id);
            const size = layoutSource.defaultNodeSize(source.type);
            layoutSource.centerViewportOnWorld((source.x || 0) + (source.w || size.w) / 2,
                (source.y || 0) + (source.h || size.h) / 2);
            renderSource.renderAll({ inspector: true });
        }

        function selectXyzMatrixCell(node, variantId) {
            if (!node || getNode(node.id) !== node) return;
            const xyz = node.xyz || {};
            const variant = (Array.isArray(xyz.variants) ? xyz.variants : []).find(item => item.id === variantId);
            if (!variant) return;
            const resultNode = getNode(variant.result_node_id || variant.node_id || '');
            if (resultNode) {
                if (Number.isFinite(Number(variant.asset_index))) {
                    nodeSource.selectResultAsset(resultNode, Number(variant.asset_index));
                }
                selectionSource.selectSingleNode(resultNode.id);
                const size = layoutSource.defaultNodeSize(resultNode.type);
                layoutSource.centerViewportOnWorld((resultNode.x || 0) + (resultNode.w || size.w) / 2,
                    (resultNode.y || 0) + (resultNode.h || size.h) / 2);
                renderSource.renderAll({ inspector: true });
                return;
            }
            const selectedVariantIds = Array.isArray(xyz.selected_variant_ids) ? xyz.selected_variant_ids.filter(Boolean) : [];
            const nextSelectedVariantIds = selectedVariantIds.includes(variant.id)
                ? selectedVariantIds.filter(id => id !== variant.id)
                : selectedVariantIds.concat([variant.id]).slice(-2);
            Object.assign(node, nodeSource.buildXyzMatrixStatePatch(node, { selectedVariantIds: nextSelectedVariantIds }));
            call(historySource, 'scheduleSave', undefined);
            renderSource.renderNodes();
            renderSource.renderInspector();
            call(modalSource, 'showToast', undefined,
                t('Matrix cell selected. Generated Result nodes can be compared after live runs are available.',
                    '已选中矩阵单格；真实 Result 生成后可继续创建 Compare。'));
        }

        const activeComparisons = new WeakMap();
        const terminalStates = new Set(['finished', 'failed', 'canceled', 'skipped']);

        function patchComparison(node, patch) {
            Object.assign(node, nodeSource.buildXyzMatrixStatePatch(node, { statePatch: patch }));
        }

        function patchVariant(node, id, patch) {
            patchComparison(node, { variants: (node.xyz?.variants || []).map(variant => variant.id === id ? Object.assign({}, variant, patch) : variant) });
        }

        function comparisonResult(variant) {
            const result = getNode(variant?.result_node_id);
            return result?.type === 'result' && (!variant.run_id || result.producer?.run_id === variant.run_id) ? result : null;
        }

        function isXyzMatrixRunning(node) {
            if (activeComparisons.get(node)?.project === getProject()
                && ['checking', 'running', 'cancelling'].includes(node.status?.state)) return true;
            return (node?.xyz?.variants || []).some(variant => {
                const result = comparisonResult(variant);
                return result && !terminalStates.has(result.status?.state || '') && ['running', 'preparing', 'cancelling'].includes(variant.status);
            });
        }

        async function requestComparisonStop(operation) {
            if (!operation.owns()) return { ok: false, stale: true };
            if (operation.stopRequest) return operation.stopRequest;
            if (!operation.execution && !operation.resultNode) return { ok: true, pending: true };
            const result = operation.resultNode || call(runSource, 'findActiveResultNodeForPreset', null, operation.execution);
            if (!result || getNode(result.id) !== result || terminalStates.has(result.status?.state)) return { ok: true, pending: true };
            if (operation.runId && result.producer?.run_id !== operation.runId) return { ok: false, stale: true };
            operation.resultNode = result;
            operation.runId = result.producer?.run_id;
            operation.stopRequest = Promise.resolve().then(() => call(runSource, 'controlResultRun', { ok: false, error: 'Stop is unavailable' }, result, 'stop'));
            try {
                const response = await operation.stopRequest;
                if (!response?.ok && operation.owns()) operation.stopError = response?.error || t('Stop request failed.', '停止请求失败。');
                else if (response?.ok && operation.owns()) operation.stopError = '';
                return response;
            } catch (err) {
                if (operation.owns()) operation.stopError = err?.message || String(err);
                return { ok: false, error: err?.message || String(err) };
            } finally {
                operation.stopRequest = null;
            }
        }

        async function stopXyzMatrix(node) {
            if (getNode(node?.id) !== node) return { ok: false, stale: true };
            const operation = activeComparisons.get(node);
            if (operation?.project === getProject()) {
                operation.stopped = true;
                node.status = { state: 'cancelling', message: t('Stopping comparison...', '正在停止参数对比...') };
                call(historySource, 'mutate', undefined, { inspector: true });
                return requestComparisonStop(operation);
            }
            const project = getProject();
            const variant = (node.xyz?.variants || []).find(item => {
                const result = comparisonResult(item);
                return result && !terminalStates.has(result.status?.state);
            });
            const result = comparisonResult(variant);
            if (!result) return { ok: true };
            const runId = result.producer?.run_id;
            const response = await call(runSource, 'controlResultRun', { ok: false }, result, 'stop');
            if (getProject() !== project || getNode(node.id) !== node || getNode(result.id) !== result || result.producer?.run_id !== runId) return { ok: false, stale: true };
            if (response?.ok) {
                patchVariant(node, variant.id, { status: response.state === 'canceled' ? 'canceled' : 'cancelling' });
                node.status = { state: response.state === 'canceled' ? 'canceled' : 'cancelling' };
                call(historySource, 'mutate', undefined, { inspector: true });
            }
            return response;
        }

        async function runXyzMatrix(node, options) {
            const opts = options || {};
            const project = getProject();
            if (!project || !['xy_matrix', 'xyz_matrix'].includes(node?.type) || getNode(node.id) !== node) return { ok: false, stale: true };
            if (activeComparisons.has(node)) return { ok: false, error: t('Comparison is already running.', '参数对比正在运行。') };
            if (Array.isArray(opts.variantIds) && !opts.variantIds.length) return { ok: false, error: t('Select a comparison cell first.', '请先选择一个对比单格。') };
            const source = getNode(node.source_node_id || node.xyz?.source_node_id);
            const job = (project.batch_jobs || []).find(item => item.id === node.batch_job_id);
            if (!source || !job?.job_payload || !node.xyz?.source_fingerprint) {
                return { ok: false, error: t('Recreate this comparison from its source preset.', '请从来源预设重新创建参数对比。') };
            }
            if (job.matrix_node_id && job.matrix_node_id !== node.id) {
                return { ok: false, error: t('Comparison plan does not match this node. Recreate it from the source.', '对比计划与此节点不一致，请从来源预设重新创建。') };
            }
            if (isXyzMatrixRunning(node)) return { ok: false, error: t('A previous result is still running. Stop it or wait before resuming.', '此前的结果仍在运行，请停止或等待完成后再继续。') };
            const operation = { project, source, stopped: false, execution: null, resultNode: null, runId: '', variantId: '' };
            operation.owns = () => getProject() === project && getNode(node.id) === node
                && activeComparisons.get(node) === operation && (project.batch_jobs || []).includes(job);
            const inputsCurrent = () => getNode(source.id) === source && sourceFingerprint(source) === node.xyz.source_fingerprint;
            const stale = () => ({ ok: false, stale: true });
            const sourceChanged = () => t('Source settings or inputs changed. Create a new comparison.', '来源参数或输入已改变，请创建新的参数对比。');
            const update = (state, message = '') => {
                const finished = (node.xyz?.variants || []).filter(item => item.status === 'finished').length;
                node.status = { state, message, percent: finished / Math.max(1, node.xyz?.variants?.length || 0) };
                Object.assign(job, { status: state, variants: clone(node.xyz.variants, []) });
                call(historySource, 'mutate', undefined, { inspector: true });
            };
            activeComparisons.set(node, operation);
            try {
                if (!inputsCurrent()) throw new Error(sourceChanged());
                for (const variant of node.xyz.variants || []) {
                    const result = comparisonResult(variant);
                    if (result && !terminalStates.has(result.status?.state)) {
                        throw new Error(t('A previous result is still running. Stop it or wait before resuming.', '此前的结果仍在运行，请停止或等待完成后再继续。'));
                    }
                    if (variant.execution_kind === 'director' && !variant.execution_complete && variant.status !== 'finished') {
                        if (['preparing', 'running', 'cancelling'].includes(variant.status)) {
                            patchVariant(node, variant.id, { status: 'interrupted', error: t('The sequence was interrupted. Rerun this cell explicitly.', '分镜序列已中断，可单独重跑此项。') });
                        }
                    } else if (result && terminalStates.has(result.status?.state)) patchVariant(node, variant.id, { status: result.status.state });
                    else if (['preparing', 'running', 'cancelling'].includes(variant.status)) patchVariant(node, variant.id, { status: 'planned' });
                }
                update('checking', t('Checking comparison parameters...', '正在检查对比参数...'));
                const payload = clone(job.job_payload, {});
                payload.source_node = serializeXyzSourceNode(source);
                payload.parameter_keys = comparisonParameterKeys(source);
                payload.max_variants = 128;
                payload.execution_mode = 'preset_runs';
                const preview = await call(apiSource, 'xyzPreview', { ok: false, error: 'Preview is unavailable' }, { job: payload, user_context: call(apiSource, 'getWorkbenchUserContext', {}) });
                if (!operation.owns()) return stale();
                if (!inputsCurrent()) throw new Error(sourceChanged());
                if (!preview?.ok) throw new Error([comparisonError(preview), preview?.details].filter(Boolean).join(' '));
                if (preview.parameter_comparison_version !== 1) throw new Error(t('Parameter comparison requires the updated Studio backend.', '参数对比需要加载更新后的 Studio 服务端代码。'));
                const verified = new Map((preview.variants || []).map(item => [item.id, item]));
                if (verified.size !== node.xyz.variants.length || verified.size > 128
                    || node.xyz.variants.some(item => !verified.has(item.id) || ['x', 'y', 'z'].some(axis => {
                        const a = item.axis_values?.[axis];
                        const b = verified.get(item.id).axis_values?.[axis];
                        return JSON.stringify([a?.type, a?.value]) !== JSON.stringify([b?.type, b?.value]);
                    }))) throw new Error(t('Comparison plan changed. Create a new comparison.', '对比计划已改变，请创建新的参数对比。'));
                const ids = new Set(opts.variantIds || []);
                const selected = node.xyz.variants.filter(item => ids.size ? ids.has(item.id)
                    : opts.failedOnly ? item.status === 'failed' : !['finished', 'failed', 'interrupted'].includes(item.status));
                const order = preview.processing_order || [];
                selected.sort((a, b) => {
                    for (const axis of order) {
                        const delta = Number(a[`${axis}_index`] || 0) - Number(b[`${axis}_index`] || 0);
                        if (delta) return delta;
                    }
                    return 0;
                });
                let failed = false;
                for (const [selectedIndex, item] of selected.entries()) {
                    if (!operation.owns()) return stale();
                    if (operation.stopped) break;
                    if (!inputsCurrent()) throw new Error(sourceChanged());
                    operation.variantId = item.id;
                    const variant = verified.get(item.id);
                    const rect = layoutSource.getNodeRect(node);
                    const position = { x: rect.x, y: rect.y + rect.h + 60 };
                    const execution = call(nodeSource, 'buildXyzExecutionPreset', null, { source, matrix: node, variant, position });
                    if (!execution) throw new Error(t('Could not create a comparison run.', '无法创建参数对比运行副本。'));
                    call(historySource, 'pushHistory', undefined, 'Run parameter comparison');
                    layoutSource.placeNodeAvoidingOverlap(execution, position, {});
                    Object.assign(project, projectSource.buildProjectNodeAppendPatch(project, execution));
                    const keys = { models: 'models_config', styles: 'styles_config', resolution: 'resolution_config', advanced: 'generation_config' };
                    const edges = (project.edges || []).filter(edge => edge.to === source.id && ['upload', 'text', 'config'].includes(edge.type));
                    for (const edge of edges) {
                        if (edge.type === 'config' && Object.keys(variant.node_patch?.[keys[edge.slot]]?.overrides || {}).length) continue;
                        const copied = Object.assign({}, clone(edge, {}), { id: call(identitySource, 'uid', '', 'edge'), to: execution.id });
                        Object.assign(project, projectSource.buildProjectEdgeAppendPatch(project, copied));
                    }
                    operation.execution = execution;
                    operation.resultNode = null;
                    operation.runId = '';
                    patchVariant(node, item.id, { status: 'preparing', error: '', execution_complete: false, execution_node_id: execution.id, result_node_id: '', run_id: '' });
                    update('running', `${selectedIndex + 1} / ${selected.length}`);
                    const rememberResult = (info, submitted) => {
                        if (!operation.owns() || getNode(execution.id) !== execution) return;
                        operation.resultNode = getNode(info.result_node_id);
                        operation.runId = info.run_id || '';
                        patchVariant(node, item.id, {
                            status: submitted ? 'running' : 'preparing', result_node_id: info.result_node_id, run_id: info.run_id,
                            execution_kind: info.director_segment_index !== undefined ? 'director' : 'preset'
                        });
                        call(historySource, 'mutate', undefined, { inspector: true });
                        if (submitted && operation.stopped && !terminalStates.has(info.response?.state)) {
                            Promise.resolve(operation.stopRequest).then(() => requestComparisonStop(operation)).catch(() => {});
                        }
                    };
                    let outcome;
                    try {
                        outcome = await call(runSource, 'runPresetNode', { ok: false, error: 'Preset runner is unavailable' }, execution, {
                            forceNewResult: true, keepSelection: true, keepViewport: true, allowCurrentRenderToFinish: true,
                            shouldContinue: () => operation.owns() && !operation.stopped && inputsCurrent() && getNode(execution.id) === execution,
                            onRunCreated: info => rememberResult(info, false),
                            onSubmitted: info => rememberResult(info, true)
                        });
                    } catch (err) {
                        outcome = { ok: false, error: err?.message || String(err) };
                    }
                    if (!operation.owns()) return stale();
                    const resultId = outcome?.result_node_id || outcome?.final_result_node_id || outcome?.render_result?.result_node_id || operation.resultNode?.id || '';
                    const result = getNode(resultId);
                    const canceled = operation.stopped || ['canceled', 'skipped'].includes(outcome?.state);
                    const complete = !!(outcome?.ok || outcome?.render_result?.ok);
                    const state = complete ? 'finished' : canceled ? 'canceled' : 'failed';
                    const runId = result ? result.producer?.run_id || '' : outcome?.run_id || operation.runId;
                    patchVariant(node, item.id, { status: state, execution_complete: complete, result_node_id: resultId, run_id: runId, asset_index: 0, error: complete ? '' : outcome?.error || '' });
                    if (runId) job.run_ids = Array.from(new Set([...(job.run_ids || []), runId]));
                    failed = failed || state === 'failed';
                    if (canceled) { operation.stopped = true; break; }
                    if (!outcome?.ok && node.xyz.options?.stop_on_error !== false) break;
                }
                const states = (node.xyz.variants || []).map(item => item.status);
                const state = operation.stopped ? 'canceled' : states.includes('failed') ? 'failed'
                    : states.every(value => value === 'finished') ? 'finished' : 'planned';
                update(state, operation.stopError || '');
                return { ok: !failed && !operation.stopped, state };
            } catch (err) {
                if (!operation.owns()) return stale();
                if (operation.stopped) {
                    update('canceled', operation.stopError || '');
                    return { ok: false, state: 'canceled' };
                }
                const error = err?.message || String(err);
                if (operation.variantId) patchVariant(node, operation.variantId, { status: 'failed', error });
                update('failed', error);
                return { ok: false, error };
            } finally {
                if (activeComparisons.get(node) === operation) activeComparisons.delete(node);
            }
        }

        function handleXyzMatrixAction(node, action) {
            if (!['xy_matrix', 'xyz_matrix'].includes(node?.type)) return false;
            const launch = task => Promise.resolve(task).then(response => {
                if (response?.error && !response?.stale) call(modalSource, 'showToast', undefined, response.error);
            }).catch(err => call(modalSource, 'showToast', undefined, err?.message || String(err)));
            if (action === 'xyz-run') launch(runXyzMatrix(node));
            else if (action === 'xyz-stop') launch(stopXyzMatrix(node));
            else if (action === 'xyz-retry-failed') launch(runXyzMatrix(node, { failedOnly: true }));
            else if (action === 'xyz-retry-selected') launch(runXyzMatrix(node, { variantIds: node.xyz?.selected_variant_ids || [] }));
            else if (action === 'xyz-open') selectXyzMatrixCell(node, node.xyz?.selected_variant_ids?.[0]);
            else if (action === 'xyz-compare') {
                const selected = new Set(node.xyz?.selected_variant_ids || []);
                const results = (node.xyz?.variants || []).filter(item => selected.has(item.id) && item.status === 'finished').map(variant => {
                    const result = comparisonResult(variant);
                    if (result) call(nodeSource, 'selectResultAsset', null, result, variant.asset_index || 0);
                    return result;
                })
                    .filter(result => call(nodeSource, 'isImageCompareSource', false, result));
                if (results.length === 2) call(nodeSource, 'createCompareNodeFromSources', null, results);
                else call(modalSource, 'showToast', undefined, t('Select two completed image results.', '请选择两个已完成的图片结果。'));
            } else if (String(action).startsWith('xyz-select:')) {
                const id = action.slice('xyz-select:'.length);
                if (!(node.xyz?.variants || []).some(item => item.id === id)) return true;
                const selected = node.xyz?.selected_variant_ids || [];
                const next = selected.includes(id) ? selected.filter(value => value !== id) : selected.concat(id).slice(-2);
                Object.assign(node, nodeSource.buildXyzMatrixStatePatch(node, { selectedVariantIds: next }));
                call(historySource, 'mutate', undefined, { inspector: true });
            } else return false;
            return true;
        }

        return {
            comparisonParameterKeys,
            comparisonAxisOptions,
            runXyzMatrix,
            stopXyzMatrix,
            isXyzMatrixRunning,
            handleXyzMatrixAction,
            xyzModeForNode,
            visibleXyzAxisOptions,
            getXyzAxisOption,
            xyzCsvJoin,
            defaultXyzPlotState,
            collectXyzModalState,
            serializeXyzSourceNode,
            buildXyzJobFromModal,
            renderXyzPlotModal,
            bindXyzPlotModal,
            openXyzPlotPanel,
            previewXyzPlotFromModal,
            createXyzMatrixFromPreview,
            focusXyzMatrixSource,
            selectXyzMatrixCell
        };
    }

    window.SimpAICanvasWorkbenchXyzMatrixEditor = Object.assign(
        {},
        window.SimpAICanvasWorkbenchXyzMatrixEditor || {},
        { createCanvasXyzMatrixEditorController }
    );
})();
