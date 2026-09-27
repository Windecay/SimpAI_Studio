(function () {
    'use strict';

    const INTERACTIVE_TARGET_SELECTOR = 'button,input,textarea,select,option,audio,video,[contenteditable="true"],.sai-vlm-chat-log,.sai-vlm-compose,.sai-vlm-compose-images,.sai-media-browser-grid,.sai-media-browser-detail,.sai-media-browser-controls,.sai-media-browser-tabs,.sai-media-browser-foot,.sai-preset-special-controller,[data-hover-preview-kind],[data-model-preview-param],[data-model-preview-lora-index],[data-model-browser-param],[data-model-browser-lora-index],[data-compare-position],[data-compare-mode],[data-compare-mode-select],[data-timeline-param],[data-timeline-clip-param],[data-media-seek],[data-media-trim-start],[data-media-trim-end],[data-media-player],[data-node-param],[data-text-value],[data-inspector-text-value],[data-text-merge-separator],[data-translation-input],[data-translation-param],[data-tagcart-param],[data-wd14-param],[data-vlm-param],[data-mask-param],[data-sam3-video-param],[data-camera-motion-param],[data-config-param],[data-config-model-filter],[data-config-style],[data-style-config-search],[data-style-config-action],[data-config-lora-model],[data-config-lora-weight],[data-config-lora-enabled],[data-config-interface],[data-slot-row],[data-sam3-video-row],[data-classic-mode],[data-classic-ip-type],[data-classic-ip-stop],[data-classic-ip-weight],[data-classic-param]';

    function createCanvasInteractiveTargetController(context) {
        const source = context?.interactiveTargetSource || context || {};
        const isTextareaEditorTitleTarget = typeof source.isTextareaEditorTitleTarget === 'function'
            ? source.isTextareaEditorTitleTarget
            : () => false;

        function isInteractiveTarget(target) {
            if (isTextareaEditorTitleTarget(target)) return true;
            return !!(target && target.closest && target.closest(INTERACTIVE_TARGET_SELECTOR));
        }

        return { isInteractiveTarget };
    }

    window.SimpAICanvasWorkbenchInteractiveTarget = Object.assign(
        window.SimpAICanvasWorkbenchInteractiveTarget || {},
        { createCanvasInteractiveTargetController }
    );
})();
