(function () {
    'use strict';

    function createCanvasPresetNodeClassifier(source) {
        const scope = source || {};

        function call(name, fallback, ...args) {
            const fn = scope[name];
            return typeof fn === 'function' ? fn(...args) : fallback;
        }

        function presetText(node, includeTaskMethod) {
            const values = [
                node.title,
                node.preset?.name,
                node.preset?.display_name,
                ...(includeTaskMethod ? [node.runtime?.task_method] : []),
                node.runtime?.scene_theme,
                call('getPresetTheme', '', node)
            ];
            return values.filter(Boolean).join(' ').toLowerCase();
        }

        function isStyleTransferPresetNode(node) {
            if (!node || node.type !== 'preset') return false;
            const text = presetText(node, true);
            const compact = text.replace(/[^a-z0-9]+/g, '');
            return compact.includes('styletransfer') || text.includes('style_transfer') || text.includes('flux2_styletransfer');
        }

        function isLivePortraitVideoExpressionPresetNode(node) {
            if (!node || node.type !== 'preset') return false;
            const taskMethod = String(call('getPresetThemeInfo', {}, node)?.task_method || node.runtime?.task_method || '').toLowerCase();
            if (taskMethod.includes('liveportrait_video_expression')) return true;
            const text = presetText(node, false);
            return text.includes('liveportrait') && text.includes('video');
        }

        function isLtx23MultiGuidePresetNode(node) {
            if (!node || node.type !== 'preset') return false;
            const taskMethod = String(call('getPresetThemeInfo', {}, node)?.task_method || node.runtime?.task_method || '').toLowerCase();
            if (taskMethod.includes('ltx_i2v') || taskMethod.includes('ltx_ia2v') || taskMethod.includes('ltx_extent')) return true;
            return /ltx2\.3\s*\((i2v|ia2v|extent)\)/.test(presetText(node, false));
        }

        function isMiniMaxH3PresetNode(node) {
            if (!node || node.type !== 'preset') return false;
            const schema = call('getPresetSchema', {}, node) || {};
            const hidden = Array.isArray(schema.disvisible) ? schema.disvisible : String(schema.disvisible || '').split(',').map((item) => item.trim());
            if (hidden.includes('minimax_h3_storyboard_control')) return false;
            if (String(node.runtime?.engine_type || schema.engine_type || '').toLowerCase() === 'image') return false;
            const taskMethod = String(call('getPresetThemeInfo', {}, node)?.task_method || node.runtime?.task_method || '').toLowerCase();
            if (/minimax_h3_(?:r2i|upscale|region)(?:_|$)/.test(taskMethod)) return false;
            if (taskMethod.includes('minimax_h3')) return true;
            return /minimax[-_\s]*h3/.test(presetText(node, false));
        }

        return {
            isStyleTransferPresetNode,
            isLivePortraitVideoExpressionPresetNode,
            isLtx23MultiGuidePresetNode,
            isMiniMaxH3PresetNode
        };
    }

    window.SimpAICanvasWorkbenchPresetNodeClassifier = Object.assign(
        {},
        window.SimpAICanvasWorkbenchPresetNodeClassifier || {},
        { createCanvasPresetNodeClassifier }
    );
})();
