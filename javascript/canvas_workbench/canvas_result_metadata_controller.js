(function () {
    'use strict';

    function createCanvasResultMetadataController(context) {
        const scope = context?.resultMetadataSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const presetSource = scope.presetSource || {};
        const languageSource = scope.languageSource || {};

        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject?.[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const getProject = () => call(projectSource, 'getProject', {}) || {};
        const getNode = (id) => call(nodeSource, 'getNode', null, id);
        const presetParamValue = (...args) => call(presetSource, 'presetParamValue', '', ...args);
        const getLanguageState = () => call(languageSource, 'getLanguageState', { __lang: 'en' });
        const t = (english, chinese) => call(
            languageSource,
            't',
            chinese || english,
            english,
            chinese,
            getLanguageState()
        );

        function resultRunRecord(node) {
            const runId = node?.producer?.run_id || '';
            if (!runId) return null;
            const runs = Array.isArray(getProject().runs) ? getProject().runs : [];
            return runs.find(item => item.id === runId) || null;
        }

        function resultMetadataSources(node) {
            const run = resultRunRecord(node);
            const last = run?.last_response && typeof run.last_response === 'object' ? run.last_response : {};
            const dryRun = node?.source?.dry_run && typeof node.source.dry_run === 'object' ? node.source.dry_run : {};
            const taskArgs = last.task_args_preview || dryRun.task_args_preview || {};
            const backend = taskArgs.params_backend_preview || last.params_backend_preview || {};
            const taskPreview = last.task_preview || run?.task_preview || dryRun.task_preview || {};
            const preset = getNode(node?.producer?.preset_node_id);
            return { run, last, dryRun, taskArgs, backend, taskPreview, preset };
        }

        function stringifyMetadataValue(value) {
            if (value === undefined || value === null || value === '') return '';
            if (Array.isArray(value)) {
                const compact = value.filter(item => item !== undefined && item !== null && item !== '' && item !== 'None');
                if (!compact.length) return '';
                return compact.map(item => typeof item === 'object' ? JSON.stringify(item) : String(item)).join('\n');
            }
            if (typeof value === 'object') return JSON.stringify(value, null, 2);
            return String(value);
        }

        function resultMetadataRows(node, asset) {
            const { run, taskArgs, backend, taskPreview, preset } = resultMetadataSources(node);
            const generation = taskArgs.generation_preview || {};
            const models = taskArgs.models_preview || {};
            const resolution = taskArgs.effective_resolution_preview || taskArgs.resolution_preview || {};
            const enabledLoras = Array.isArray(models.enabled_loras)
                ? models.enabled_loras.map(item => {
                    if (!item) return '';
                    if (typeof item === 'string') return item;
                    return [item.model || item.name || '', item.weight !== undefined ? `@ ${item.weight}` : ''].filter(Boolean).join(' ');
                }).filter(Boolean)
                : [];
            const sizeText = asset?.width && asset?.height
                ? `${asset.width} x ${asset.height}`
                : (taskArgs.resolved_size?.width && taskArgs.resolved_size?.height ? `${taskArgs.resolved_size.width} x ${taskArgs.resolved_size.height}` : '');
            const presetPrompt = preset ? presetParamValue(preset, { key: 'prompt', default: '' }) : '';
            const presetNegativePrompt = preset ? presetParamValue(preset, { key: 'negative_prompt', default: '' }) : '';
            const rows = [
                [t('Prompt', '提示词'), taskPreview.prompt || backend.prompt || backend.scene_additional_prompt || presetPrompt],
                [t('Negative Prompt', '负向提示词'), taskPreview.negative_prompt || backend.negative_prompt || presetNegativePrompt],
                [t('Preset', '预设'), taskPreview.display_name || taskPreview.preset || backend.preset || preset?.title || ''],
                [t('Task Method', '任务方式'), taskPreview.task_method || backend.task_method || preset?.runtime?.task_method || ''],
                [t('Theme / Mode', '主题 / 模式'), [backend.scene_theme || taskPreview.scene_theme || '', taskPreview.current_tab || taskArgs.current_tab || ''].filter(Boolean).join(' / ')],
                [t('Seed', '种子'), run?.resolved_seed ?? taskArgs.resolved_seed ?? backend.image_seed ?? ''],
                [t('Size', '尺寸'), sizeText],
                [t('Steps', '步数'), backend.scene_steps ?? taskPreview.scene_steps ?? backend.steps ?? generation.steps ?? ''],
                [t('Images', '图片数'), backend.scene_image_number ?? taskPreview.scene_image_number ?? run?.output_count ?? ''],
                [t('Base Model', '基础模型'), models.base_model || backend.scene_base_model || backend.base_model || ''],
                [t('Refiner', '精炼模型'), models.refiner_model || backend.scene_refiner_model || backend.refiner_model || ''],
                ['CLIP', models.clip_model || backend.clip_model || ''],
                ['VAE', models.vae || backend.vae_name || backend.vae || ''],
                [t('Upscale Model', '放大模型'), models.upscale_model || backend.upscale_model || ''],
                ['LoRA', enabledLoras],
                [t('Sampler', '采样器'), backend.sampler || generation.sampler || ''],
                [t('Scheduler', '调度器'), backend.scheduler || generation.scheduler || ''],
                ['CFG', backend.cfg_scale ?? generation.cfg_scale ?? ''],
                [t('Denoise', '降噪'), backend.denoise ?? generation.denoise ?? ''],
                [t('Resolution Config', '分辨率配置'), resolution && Object.keys(resolution).length ? resolution : ''],
                [t('Run ID', '运行 ID'), node?.producer?.run_id || ''],
                [t('Task ID', '任务 ID'), node?.producer?.task_id || ''],
                [t('Asset', '资源'), asset?.asset_relative_path || asset?.relative_path || asset?.path || asset?.name || '']
            ].map(([label, value]) => ({ label, value: stringifyMetadataValue(value) })).filter(row => row.value);
            return rows;
        }

        return {
            resultRunRecord,
            resultMetadataSources,
            stringifyMetadataValue,
            resultMetadataRows
        };
    }

    window.SimpAICanvasWorkbenchResultMetadata = Object.assign(
        {},
        window.SimpAICanvasWorkbenchResultMetadata || {},
        { createCanvasResultMetadataController }
    );
})();
