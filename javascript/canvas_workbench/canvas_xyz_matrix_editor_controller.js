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
        const call = (source, name, fallback, ...args) => typeof source?.[name] === 'function'
            ? source[name](...args)
            : fallback;
        const getNode = (...args) => call(nodeSource, 'getNode', null, ...args);
        const getPresetThemeInfo = (...args) => call(presetSource, 'getPresetThemeInfo', {}, ...args) || {};
        const serializeClassicNodeForRun = (...args) => call(serializationSource, 'serializeClassicNodeForRun', {}, ...args) || {};
        const serializePresetForRun = (...args) => call(serializationSource, 'serializePresetForRun', {}, ...args) || {};
        const t = (...args) => call(languageSource, 't', args[0], ...args);

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
            return node.type === 'classic' ? serializeClassicNodeForRun(node) : serializePresetForRun(node);
        }

        function buildXyzJobFromModal(modal) {
            const source = getNode(modal?.__sourceNodeId);
            const state = collectXyzModalState(modal) || defaultXyzPlotState(source);
            return {
                script: scriptSource.script || '',
                source_node_id: source?.id || '',
                source_node: serializeXyzSourceNode(source),
                mode: state.mode || xyzModeForNode(source),
                axes: ['x', 'y', 'z'].map(axisName => Object.assign({ axis: axisName }, state.axes[axisName] || {})),
                options: Object.assign({}, state.options || {})
            };
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
                    collectXyzModalState(modal);
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
                    const choices = Array.isArray(option?.choices) ? option.choices.filter(Boolean) : [];
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
            modal.__xyzState = defaultXyzPlotState(node);
            modal.__xyzAxisOptions = axisSource.fallbackOptions || [];
            modal.__xyzPreview = null;
            (call(modalSource, 'getRoot', null) || doc.body).appendChild(modal);
            renderXyzPlotModal(modal);
            if (typeof apiSource.xyzAxisOptions === 'function') {
                try {
                    const response = await apiSource.xyzAxisOptions({
                        mode: modal.__xyzState.mode,
                        source_node: serializeXyzSourceNode(node),
                        include_choices: true
                    });
                    if (response?.ok && Array.isArray(response.options) && response.options.length
                        && doc.body.contains(modal) && getNode(node.id) === node) {
                        modal.__xyzAxisOptions = response.options;
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
            if (modal.__xyzPreviewRequestId !== requestId || !modalSource.document.body.contains(modal)
                || getNode(source.id) !== source) return;
            modal.classList.remove('is-busy');
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
            call(modalSource, 'showToast', undefined, t('X/Y/Z Matrix created.', 'X/Y/Z 矩阵已创建'));
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

        return {
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
