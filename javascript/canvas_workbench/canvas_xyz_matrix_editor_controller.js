(function () {
    'use strict';

    function createCanvasXyzMatrixEditorController(context) {
        const scope = context?.xyzMatrixEditorSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const presetSource = scope.presetSource || {};
        const serializationSource = scope.serializationSource || {};
        const scriptSource = scope.scriptSource || {};
        const call = (source, name, fallback, ...args) => typeof source?.[name] === 'function'
            ? source[name](...args)
            : fallback;
        const getNode = (...args) => call(nodeSource, 'getNode', null, ...args);
        const getPresetThemeInfo = (...args) => call(presetSource, 'getPresetThemeInfo', {}, ...args) || {};
        const serializeClassicNodeForRun = (...args) => call(serializationSource, 'serializeClassicNodeForRun', {}, ...args) || {};
        const serializePresetForRun = (...args) => call(serializationSource, 'serializePresetForRun', {}, ...args) || {};

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

        return {
            xyzModeForNode,
            xyzCsvJoin,
            defaultXyzPlotState,
            collectXyzModalState,
            serializeXyzSourceNode,
            buildXyzJobFromModal
        };
    }

    window.SimpAICanvasWorkbenchXyzMatrixEditor = Object.assign(
        {},
        window.SimpAICanvasWorkbenchXyzMatrixEditor || {},
        { createCanvasXyzMatrixEditorController }
    );
})();
