(function () {
    'use strict';

    function createCanvasSpecialNodeEditorController(context) {
        const scope = context?.specialNodeEditorSource || context || {};
        const runtimeSource = scope.runtimeSource || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const pendingOpens = new WeakMap();
        const editorSource = scope.editorSource || {};
        const languageSource = scope.languageSource || {};
        const call = (source, name, fallback, ...args) => typeof source?.[name] === 'function'
            ? source[name](...args)
            : fallback;
        const t = (en, cn) => call(languageSource, 't', en, en, cn);

        async function openEditor(groupName, node, isLoaded, open, loadingMessage, failureMessage) {
            if (!node || (typeof nodeSource.getNode === 'function' && nodeSource.getNode(node.id) !== node)) return null;
            const project = call(projectSource, 'getProject', null);
            const readInputVersion = () => typeof nodeSource.getInputVersion === 'function'
                ? nodeSource.getInputVersion(node) : JSON.stringify(node);
            const inputVersion = readInputVersion();
            const operation = {};
            pendingOpens.set(node, operation);
            const ready = await call(
                runtimeSource,
                'ensureWorkbenchLazyRuntime',
                false,
                groupName,
                isLoaded,
                t(...loadingMessage),
                t(...failureMessage)
            );
            if (!ready || pendingOpens.get(node) !== operation
                || (typeof projectSource.getProject === 'function' && projectSource.getProject() !== project)
                || (typeof nodeSource.getNode === 'function' && nodeSource.getNode(node.id) !== node)
                || readInputVersion() !== inputVersion) return null;
            return call(editorSource, open, null, node);
        }

        function openPoseStudioEditor(node) {
            return openEditor(
                'poseStudio',
                node,
                () => call(editorSource, 'isPoseStudioLoaded', false),
                'openPoseStudioEditor',
                ['Loading Pose Studio...', '正在加载 Pose Studio...'],
                ['Pose Studio editor is not loaded.', 'Pose Studio 编辑器尚未加载。']
            );
        }

        function openGaussianStudioEditor(node) {
            return openEditor(
                'gaussianStudio',
                node,
                () => call(editorSource, 'isGaussianStudioLoaded', false),
                'openGaussianStudioEditor',
                ['Loading Gaussian Studio...', '正在加载 Gaussian Studio...'],
                ['Gaussian Studio editor is not loaded.', 'Gaussian Studio 编辑器尚未加载。']
            );
        }

        function openLivePortraitExpressionEditor(node) {
            return openEditor(
                'livePortraitExpression',
                node,
                () => call(editorSource, 'isLivePortraitExpressionLoaded', false),
                'openLivePortraitExpressionEditor',
                ['Loading LivePortrait Exp...', '正在加载 LivePortrait Exp...'],
                ['LivePortrait Exp editor is not loaded.', 'LivePortrait Exp 编辑器尚未加载。']
            );
        }

        return {
            openPoseStudioEditor,
            openGaussianStudioEditor,
            openLivePortraitExpressionEditor
        };
    }

    window.SimpAICanvasWorkbenchSpecialNodeEditor = Object.assign(
        {},
        window.SimpAICanvasWorkbenchSpecialNodeEditor || {},
        { createCanvasSpecialNodeEditorController }
    );
})();

