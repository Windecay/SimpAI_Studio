(function () {
    'use strict';

    function createCanvasAgentActionController(source) {
        const scope = source?.actionSource || source || {};
        const languageSource = scope.languageSource || {};
        const stateSource = scope.stateSource || {};
        const referenceSource = scope.referenceSource || {};
        const promptSource = scope.promptSource || {};
        const targetSource = scope.targetSource || {};
        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const languageCall = (name, fallback, ...args) => call(languageSource, name, fallback, ...args);
        const stateCall = (name, fallback, ...args) => call(stateSource, name, fallback, ...args);
        const referenceCall = (name, fallback, ...args) => call(referenceSource, name, fallback, ...args);
        const promptCall = (name, fallback, ...args) => call(promptSource, name, fallback, ...args);
        const targetCall = (name, fallback, ...args) => call(targetSource, name, fallback, ...args);
        const t = languageSource.t || ((en, cn) => cn || en);

        function canvasAgentPrimaryAction() {
            const target = targetCall('getCanvasAgentTargetNode', null);
            const meta = canvasAgentPrimaryActionMeta(target);
            return meta.enabled ? meta.action : '';
        }

        function canvasAgentPrimaryActionMeta(target) {
            const counts = referenceCall('canvasAgentReferenceCounts', {},) || {};
            const state = stateCall('getCanvasAgentState', {}) || {};
            const intent = promptCall('canvasAgentPromptMediaIntent', {}, state.input || '') || {};
            const targetKind = targetCall('getCanvasAgentTargetMediaKind', '', target);
            const hasImage = targetKind === 'image' || Number(counts.images) > 0;
            const hasVideo = targetKind === 'video' || Number(counts.videos) > 0;
            const hasAudio = targetKind === 'audio' || Number(counts.audio) > 0;
            if (intent.wantsVideoEdit && hasVideo) {
                return {
                    action: 'edit-video',
                    label: intent.wantsVideoExtend ? t('Extend video', '延长视频') : t('Edit video', '编辑视频'),
                    icon: 'fa-film',
                    enabled: true
                };
            }
            if (intent.wantsVideo && hasVideo) {
                return {
                    action: 'generate-video',
                    label: t('Reference to video', '参考生成视频'),
                    icon: 'fa-film',
                    enabled: true
                };
            }
            if (intent.wantsVideo && hasImage && !hasAudio) {
                return {
                    action: 'image-to-video',
                    label: t('Image to video', '图生视频'),
                    icon: 'fa-film',
                    enabled: true
                };
            }
            if (intent.wantsVideo && hasAudio) {
                return {
                    action: 'audio-to-video',
                    label: t('Audio to video', '音频生成视频'),
                    icon: 'fa-wave-square',
                    enabled: true
                };
            }
            if (intent.wantsVideo && !hasImage && !hasVideo) {
                return {
                    action: 'generate-video',
                    label: t('New video', '新建视频'),
                    icon: 'fa-film',
                    enabled: !target || targetCall('isCanvasAgentGeneratorTarget', false, target)
                };
            }
            if ((intent.wantsAudio || targetKind === 'audio' || Number(counts.audio) > 0) && hasAudio) {
                return {
                    action: 'edit-audio',
                    label: t('Edit audio', '编辑音频'),
                    icon: 'fa-wave-square',
                    enabled: true
                };
            }
            if (intent.wantsAudio && !hasAudio) {
                return {
                    action: 'generate-audio',
                    label: t('New audio', '新建音频'),
                    icon: 'fa-music',
                    enabled: !target || targetCall('isCanvasAgentGeneratorTarget', false, target)
                };
            }
            if (targetKind === 'video') {
                return {
                    action: 'edit-video',
                    label: t('Edit video', '编辑视频'),
                    icon: 'fa-film',
                    enabled: true
                };
            }
            if (!targetCall('isCanvasAgentImageTarget', false, target) && Number(counts.images) > 0) {
                return {
                    action: 'edit-image',
                    label: t('Edit image', '编辑图片'),
                    icon: 'fa-pen-to-square',
                    enabled: true
                };
            }
            if (targetCall('isCanvasAgentImageTarget', false, target)) {
                return {
                    action: 'edit-image',
                    label: t('Edit image', '编辑图片'),
                    icon: 'fa-pen-to-square',
                    enabled: true
                };
            }
            if (targetCall('isCanvasAgentTextTarget', false, target)) {
                return {
                    action: 'refine-text',
                    label: t('Refine', '优化'),
                    icon: 'fa-wand-magic-sparkles',
                    enabled: true
                };
            }
            if (target && targetCall('isCanvasAgentMediaReferenceTarget', false, target)) {
                return {
                    action: 'use-selected',
                    label: t('Use reference', '引用素材'),
                    icon: 'fa-paperclip',
                    enabled: true
                };
            }
            const canGenerate = !target || call('isCanvasAgentGeneratorTarget', false, target);
            return {
                action: 'generate-image',
                label: target ? t('Generate', '生成') : t('New image', '新建文生图'),
                icon: 'fa-image',
                enabled: canGenerate
            };
        }

        return {
            canvasAgentPrimaryAction,
            canvasAgentPrimaryActionMeta
        };
    }

    window.SimpAICanvasWorkbenchCanvasAgentAction = Object.assign(
        {},
        window.SimpAICanvasWorkbenchCanvasAgentAction || {},
        { createCanvasAgentActionController }
    );
})();
