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
        const getLanguageState = () => call(languageSource, 'getLanguageState', { __lang: 'en' });
        const t = (english, chinese) => {
            const state = getLanguageState();
            const fallback = state?.__lang === 'cn' || state?.__lang === 'zh' ? chinese || english : english;
            return call(languageSource, 't', fallback, english, chinese, state);
        };

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
            const snapshot = node?.source?.metadata_snapshot || run?.metadata_snapshot || {};
            const sources = [dryRun, snapshot, run || {}, last];
            const taskArgs = Object.assign({}, ...sources.map(item => item.task_args_preview));
            for (const key of ['params_backend_preview', 'models_preview', 'generation_preview',
                'effective_resolution_preview', 'resolution_preview', 'resolved_size']) {
                const values = Object.assign({}, ...sources.map(item => item.task_args_preview?.[key]));
                if (Object.keys(values).length) taskArgs[key] = values;
            }
            const backend = Object.assign({}, taskArgs.params_backend_preview, last.params_backend_preview);
            const taskPreview = Object.assign({}, ...sources.map(item => item.task_preview));
            const preset = getNode(node?.producer?.preset_node_id);
            return { run, last, dryRun, snapshot, taskArgs, backend, taskPreview, preset };
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
            const { run, snapshot, taskArgs, backend, taskPreview } = resultMetadataSources(node);
            const metadata = (asset || node?.asset)?.generation_metadata || node?.source?.generation_metadata || {};
            const parameters = metadata.parameters || {};
            const parameterMap = Object.fromEntries(Object.entries(parameters).map(([key, value]) => [key.toLowerCase(), value]));
            const parameter = (...keys) => keys.map(key => parameterMap[key.toLowerCase()])
                .find(value => value !== undefined && value !== null);
            const metadataLoras = Object.entries(parameters)
                .filter(([key]) => /^lora(?:[\s_\d-]|$)/i.test(key))
                .map(([, value]) => value);
            const generation = taskArgs.generation_preview || {};
            const models = taskArgs.models_preview || {};
            const effectiveResolution = taskArgs.effective_resolution_preview || {};
            const resolution = Object.keys(effectiveResolution).length ? effectiveResolution : taskArgs.resolution_preview || {};
            const enabledLoras = Array.isArray(models.enabled_loras)
                ? models.enabled_loras.map(item => {
                    if (!item) return '';
                    if (typeof item === 'string') return item;
                    return [item.model || item.name || '', item.weight !== undefined ? `@ ${item.weight}` : ''].filter(Boolean).join(' ');
                }).filter(Boolean)
                : [];
            const sizeText = asset?.width && asset?.height
                ? `${asset.width} x ${asset.height}`
                : (parameter('width') && parameter('height') ? `${parameter('width')} x ${parameter('height')}`
                    : (taskArgs.resolved_size?.width && taskArgs.resolved_size?.height ? `${taskArgs.resolved_size.width} x ${taskArgs.resolved_size.height}` : ''));
            const prompt = metadata.prompt ?? metadata.positive_prompt ?? taskPreview.prompt ?? backend.prompt ?? backend.scene_additional_prompt;
            const negativePrompt = metadata.negative_prompt ?? taskPreview.negative_prompt ?? backend.negative_prompt;
            const rows = [
                [t('Prompt', '提示词'), prompt ?? t('Not recorded', '未记录')],
                [t('Negative Prompt', '负向提示词'), negativePrompt ?? t('Not recorded', '未记录')],
                [t('Preset', '预设'), taskPreview.display_name || taskPreview.preset || backend.preset || ''],
                [t('Task Method', '任务方式'), taskPreview.task_method || backend.task_method || ''],
                [t('Theme / Mode', '主题 / 模式'), [backend.scene_theme || taskPreview.scene_theme || '', taskPreview.current_tab || taskArgs.current_tab || ''].filter(Boolean).join(' / ')],
                [t('Seed', '种子'), parameter('seed', 'image_seed') ?? run?.resolved_seed ?? snapshot.resolved_seed ?? taskArgs.resolved_seed ?? backend.image_seed ?? ''],
                [t('Size', '尺寸'), sizeText],
                [t('Steps', '步数'), parameter('steps') ?? backend.scene_steps ?? taskPreview.scene_steps ?? backend.steps ?? generation.steps ?? ''],
                [t('Images', '图片数'), backend.scene_image_number ?? taskPreview.scene_image_number ?? run?.output_count ?? snapshot.output_count ?? ''],
                [t('Base Model', '基础模型'), parameter('base_model', 'model') ?? (models.base_model || backend.scene_base_model || backend.base_model || '')],
                [t('Refiner', '精炼模型'), parameter('refiner_model', 'refiner') ?? (models.refiner_model || backend.scene_refiner_model || backend.refiner_model || '')],
                ['CLIP', parameter('clip_model', 'clip') ?? (models.clip_model || backend.clip_model || '')],
                ['VAE', parameter('vae', 'vae_name') ?? (models.vae || backend.vae_name || backend.vae || '')],
                [t('Upscale Model', '放大模型'), parameter('upscale_model') ?? (models.upscale_model || backend.upscale_model || '')],
                ['LoRA', metadataLoras.length ? metadataLoras : enabledLoras],
                [t('Sampler', '采样器'), parameter('sampler') ?? (backend.sampler || generation.sampler || '')],
                [t('Scheduler', '调度器'), parameter('scheduler') ?? (backend.scheduler || generation.scheduler || '')],
                ['CFG', parameter('cfg_scale', 'guidance_scale', 'CFG scale') ?? backend.cfg_scale ?? generation.cfg_scale ?? ''],
                [t('Denoise', '降噪'), parameter('denoise') ?? backend.denoise ?? generation.denoise ?? ''],
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
