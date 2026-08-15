(function () {
    'use strict';

    const REGISTRY = window.SimpAICanvasWorkbenchRegistry || {};
    const UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const t = UTILS.t || ((en, cn) => cn || en);

    const VLM_VERSION_CHOICES = REGISTRY.VLM_VERSION_CHOICES || [
        'Qwen3.5-9B-abliterated-Q4_K_M',
        'Qwen3.5-9B-abliterated-Q2_K',
        'Qwen3.5-9B-abliterated-Q6_K',
        'Qwen3.5-9B-abliterated-Q8_0',
        'Gemma4-12B-it-heretic-Q4_K_XL',
        'Qwen3VL-4B-TextEncoder',
        'Custom'
    ];

    const VLM_IMAGE_SLOTS = REGISTRY.VLM_IMAGE_SLOTS || [
        { key: 'image_1', label: t('Image 1', '图像 1') },
        { key: 'image_2', label: t('Image 2', '图像 2') },
        { key: 'image_3', label: t('Image 3', '图像 3') }
    ];

    const CUSTOM_API_PROVIDERS = [
        { key: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', format: 'openai_compatible', supportsImages: true },
        { key: 'google', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', format: 'openai_compatible', supportsImages: true },
        { key: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', format: 'openai_compatible', supportsImages: false },
        { key: 'xai', label: 'xAI', baseUrl: 'https://api.x.ai/v1', format: 'openai_compatible', supportsImages: true },
        { key: 'zai', label: 'Z.ai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', format: 'openai_compatible', supportsImages: true },
        { key: 'minimax_global', label: 'MiniMax Global', baseUrl: 'https://api.minimax.io/v1', format: 'openai_compatible', supportsImages: true },
        { key: 'kimi_global', label: 'Kimi Global', baseUrl: 'https://api.moonshot.ai/v1', format: 'openai_compatible', supportsImages: true },
        { key: 'byteplus', label: 'BytePlus', baseUrl: 'https://ark.ap-southeast.bytepluses.com/api/v3', format: 'openai_compatible', supportsImages: true },
        { key: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', format: 'openai_compatible', supportsImages: true },
        { key: 'novita', label: 'Novita', baseUrl: 'https://api.novita.ai/v3/openai', format: 'openai_compatible', supportsImages: true },
        { key: 'siliconflow', label: t('SiliconFlow', '硅基流动'), baseUrl: 'https://api.siliconflow.cn/v1', format: 'openai_compatible', supportsImages: true },
        { key: 'alibaba', label: t('Alibaba Cloud DashScope', '阿里云 DashScope'), baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', format: 'openai_compatible', supportsImages: true },
        { key: 'tencent', label: t('Tencent Cloud', '腾讯云'), baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1', format: 'openai_compatible', supportsImages: true },
        { key: 'ppio', label: 'PPIO', baseUrl: 'https://api.ppinfra.com/v3/openai', format: 'openai_compatible', supportsImages: true },
        { key: 'ollama_cloud', label: 'Ollama Cloud', baseUrl: 'https://ollama.com/v1', format: 'openai_compatible', supportsImages: true },
        { key: 'custom', label: 'Custom OpenAI API', baseUrl: '', format: 'openai_compatible', supportsImages: true }
    ];

    window.SimpAICanvasWorkbenchVlm = Object.assign({}, window.SimpAICanvasWorkbenchVlm || {}, {
        VLM_VERSION_CHOICES,
        VLM_MODEL_LABELS: REGISTRY.VLM_MODEL_LABELS || {},
        VLM_MODEL_CATALOG: REGISTRY.VLM_MODEL_CATALOG || [],
        vlmModelLabel: REGISTRY.vlmModelLabel || ((value) => String(value || '')),
        VLM_IMAGE_SLOTS,
        VLM_SINGLE_NODE_SIZE: { w: 360, h: 520 },
        VLM_CHAT_NODE_SIZE: { w: 500, h: 720 },
        VLM_CHAT_DEFAULT_FONT_SIZE: 14,
        VLM_CHAT_DEFAULT_MAX_HISTORY: 12,
        VLM_CHAT_CONTEXT_CHARS_MIN: 1200,
        VLM_CHAT_DEFAULT_CONTEXT_CHARS: 6000,
        VLM_CHAT_CONTEXT_CHARS_HARD_MAX: 18000,
        VLM_CONTEXT_WINDOWS: REGISTRY.VLM_CONTEXT_WINDOWS || {
            'Qwen3.5-9B-abliterated-Q4_K_M': 8192,
            'Qwen3.5-9B-abliterated-Q2_K': 8192,
            'Qwen3.5-9B-abliterated-Q6_K': 8192,
            'Qwen3.5-9B-abliterated-Q8_0': 8192,
            'Gemma4-12B-it-heretic-Q4_K_XL': 8192,
            'Qwen3VL-4B-TextEncoder': 32768,
            'Custom': 32768
        },
        VLM_CUSTOM_API_STORAGE_KEY: 'simpai.canvas.vlmCustomApiProfiles.v1',
        VLM_AGENT_MODE_CHOICES: [
            { key: 'raw', label: t('Raw Model', '原始模型') },
            { key: 'persona', label: t('Persona Chat', '人格聊天') },
            { key: 'canvas_agent', label: t('Canvas Tool Agent', '画布工具 Agent') }
        ],
        VLM_CHAT_TOOL_COMMANDS: [
            { command: '/t2i', label: t('Generate image', '生成图片') },
            { command: '/edit', label: t('Edit selected image', '编辑选中图片') },
            { command: '/Regen', label: t('Regenerate last target', '再来一张') },
            { command: '/outpaint', label: t('Outpaint', '扩图') },
            { command: '/erase', label: t('Erase', '擦除') },
            { command: '/replace', label: t('Replace', '替换') },
            { command: '/upscale', label: t('Upscale', '放大') },
            { command: '/status', label: t('Tool status', '工具状态') }
        ],
        CUSTOM_API_PROVIDERS
    });
})();
