(function () {
    'use strict';

    function createCanvasResultNodeFactoryController(context) {
        const scope = context || {};
        const uid = typeof scope.uid === 'function' ? scope.uid : (type) => `${type}-node`;
        const t = typeof scope.t === 'function' ? scope.t : ((en, cn) => cn || en);
        const defaultResultNodeSize = typeof scope.defaultResultNodeSize === 'function'
            ? scope.defaultResultNodeSize
            : () => ({ w: 360, h: 460 });

        function buildManualOutputNode(world) {
            const position = world || { x: 0, y: 0 };
            const size = defaultResultNodeSize() || { w: 360, h: 460 };
            return {
                id: uid('result'),
                type: 'result',
                x: position.x,
                y: position.y,
                w: size.w,
                h: size.h,
                title: t('Manual Output', '手动输出'),
                producer: { preset_node_id: null, run_id: null, task_id: null },
                status: {
                    state: 'manual',
                    queue_position: null,
                    step: 0,
                    total_steps: 0,
                    percent: 1,
                    message: t('You can manually replace the image and connect it to the next preset input.', '可手动替换图片，并连接到下一个 preset 输入。')
                },
                preview: null,
                asset: null,
                source: { kind: 'manual_output' }
            };
        }

        return { buildManualOutputNode };
    }

    window.SimpAICanvasWorkbenchResultNodeFactory = Object.assign({}, window.SimpAICanvasWorkbenchResultNodeFactory || {}, {
        createCanvasResultNodeFactoryController
    });
})();
