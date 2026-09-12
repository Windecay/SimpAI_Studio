(function () {
    'use strict';

    function createCanvasAgentActionController(source) {
        const scope = source || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const t = scope.t || ((en, cn) => cn || en);

        function canvasAgentPrimaryAction() {
            const target = call('getCanvasAgentTargetNode', null);
            const meta = canvasAgentPrimaryActionMeta(target);
            return meta.enabled ? meta.action : '';
        }

        function canvasAgentPrimaryActionMeta(target) {
            const counts = call('canvasAgentReferenceCounts', {},) || {};
            const state = call('getCanvasAgentState', {}) || {};
            const intent = call('canvasAgentPromptMediaIntent', {}, state.input || '') || {};
            const targetKind = call('getCanvasAgentTargetMediaKind', '', target);
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
                    enabled: !target || call('isCanvasAgentGeneratorTarget', false, target)
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
                    enabled: !target || call('isCanvasAgentGeneratorTarget', false, target)
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
            if (!call('isCanvasAgentImageTarget', false, target) && Number(counts.images) > 0) {
                return {
                    action: 'edit-image',
                    label: t('Edit image', '编辑图片'),
                    icon: 'fa-pen-to-square',
                    enabled: true
                };
            }
            if (call('isCanvasAgentImageTarget', false, target)) {
                return {
                    action: 'edit-image',
                    label: t('Edit image', '编辑图片'),
                    icon: 'fa-pen-to-square',
                    enabled: true
                };
            }
            if (call('isCanvasAgentTextTarget', false, target)) {
                return {
                    action: 'refine-text',
                    label: t('Refine', '优化'),
                    icon: 'fa-wand-magic-sparkles',
                    enabled: true
                };
            }
            if (target && call('isCanvasAgentMediaReferenceTarget', false, target)) {
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
