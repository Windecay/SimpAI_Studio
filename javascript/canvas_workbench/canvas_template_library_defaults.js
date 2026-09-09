(function () {
    'use strict';

    function createCanvasTemplateLibraryDefaults(context) {
        const scope = context || {};
        const t = scope.t || ((en, cn) => cn || en);

        function getDefaultWorkbenchTemplateLibraryItems() {
            return [
                {
                    id: 'canvas_quick_start',
                    title: t('Canvas Quick Start', '画布快速入门'),
                    description: t('A model-free canvas with one blank Image node for local image upload.', '只包含一个空白图像节点，用于上传本地图片。'),
                    category: 'starter',
                    tags: ['starter', 'image', 'upload'],
                    typeLabel: t('Image upload', '图片上传'),
                    modelDependency: {
                        mode: 'model_free',
                        label: t('Model-free', '无模型依赖'),
                        note: t('No generation model is required for the blank upload node.', '空白上传节点不需要生成模型。')
                    },
                    path: 'javascript/canvas_workbench/demo/infinite-canvas-demo-workbench.canvas.json',
                    preview: ''
                },
                {
                    id: 'prompt_helper_starter',
                    title: t('Prompt Helper Starter', '提示词助手入门'),
                    description: t('A guided canvas showing Text, Translation, Wildcards Helper, and notes for prompt building.', '用 Text、Translation、通配符助手和提示贴演示提示词搭建流程。'),
                    category: 'starter',
                    tags: ['starter', 'prompt', 'text', 'wildcards'],
                    typeLabel: t('Prompt tools', '提示词工具'),
                    modelDependency: {
                        mode: 'model_free',
                        label: t('Model-free', '无模型依赖'),
                        note: t('Prompt helper nodes can be inspected without model files.', '提示词辅助节点无需模型文件即可查看。')
                    },
                    path: 'javascript/canvas_workbench/templates/prompt-helper-starter.canvas.json',
                    preview: ''
                },
                {
                    id: 'preset_node_basics',
                    title: t('Preset Node Basics', 'Preset 节点入门'),
                    description: t('A model-free starter canvas that explains Preset nodes, prompt links, configs, model readiness, Run Queue, and Results.', '不依赖模型的入门画布，讲解 Preset 节点、提示词接线、配置、模型状态、运行队列和结果。'),
                    category: 'starter',
                    tags: ['starter', 'preset', 'config', 'models', 'queue', 'result'],
                    typeLabel: t('Preset guide', 'Preset 引导'),
                    modelDependency: {
                        mode: 'teaching_only',
                        label: t('Teaching only', '教学示例'),
                        note: t('Uses a skipped static Preset node; no backend model is required.', '使用跳过的静态 Preset 节点，不需要后端模型。')
                    },
                    path: 'javascript/canvas_workbench/templates/preset-node-basics.canvas.json',
                    preview: ''
                },
                {
                    id: 'model_readiness_basics',
                    title: t('Model Readiness Basics', '模型就绪入门'),
                    description: t('A model-free guide to Models ready, Missing, Checking, Queued, Check failed, and what to do before Run.', '不依赖模型的指南，讲解 Models ready、Missing、Checking、Queued、Check failed，以及运行前该做什么。'),
                    category: 'starter',
                    tags: ['starter', 'models', 'readiness', 'missing', 'download', 'preset'],
                    typeLabel: t('Model guide', '模型引导'),
                    modelDependency: {
                        mode: 'teaching_only',
                        label: t('Teaching only', '教学示例'),
                        note: t('Static model status examples; no backend check or download is required.', '静态模型状态示例，不需要后端检查或下载。')
                    },
                    path: 'javascript/canvas_workbench/templates/model-readiness-basics.canvas.json',
                    preview: ''
                },
                {
                    id: 'run_queue_result_basics',
                    title: t('Run Queue & Result Basics', '运行队列与结果入门'),
                    description: t('A safe walkthrough of queued runs, Result placeholders, retry/history concepts, and downstream reuse.', '安全演示排队任务、结果占位、重试/历史概念和下游复用。'),
                    category: 'starter',
                    tags: ['starter', 'queue', 'result', 'history'],
                    typeLabel: t('Workflow guide', '工作流引导'),
                    modelDependency: {
                        mode: 'model_free',
                        label: t('Model-free', '无模型依赖'),
                        note: t('Uses safe Result examples rather than real generation.', '使用安全的 Result 示例，不触发真实生成。')
                    },
                    path: 'javascript/canvas_workbench/templates/run-queue-result-basics.canvas.json',
                    preview: ''
                },
                {
                    id: 'anima_text_to_image',
                    title: t('Anima Text to Image', 'Anima 文生图'),
                    description: t('A runnable Image template for Anima classic text-to-image with prompt text nodes, Models, Resolution, Advanced Config, Run Queue, and Result placeholder.', '可运行的 Anima classic 文生图模板，包含提示词 Text 节点、Models、Resolution、Advanced Config、运行队列和结果占位。'),
                    category: 'image',
                    tags: ['image', 'anima', 't2i', 'classic', 'preset', 'anime', 'runnable'],
                    typeLabel: t('Runnable preset', '可运行 Preset'),
                    modelDependency: {
                        mode: 'requires_models',
                        label: t('Requires models', '需要模型'),
                        note: t('Requires the Anima model files from presets/Anima.json. Check/download models before Run.', '需要 presets/Anima.json 中的 Anima 模型文件。运行前请先检查/下载模型。'),
                        models: [
                            'anima-base-v1.0.safetensors',
                            'qwen_3_06b_base.safetensors',
                            'qwen_image_vae.safetensors',
                            '4x-AnimeSharp.pth'
                        ]
                    },
                    path: 'javascript/canvas_workbench/templates/anima-text-to-image.canvas.json',
                    preview: ''
                },
                {
                    id: 'flux2_a2r_image_edit',
                    title: t('Flux2-A2R Image Edit', 'Flux2-A2R 图像编辑'),
                    description: t('A runnable Image-edit template for Flux2-A2R anime-to-real conversion with a source image placeholder, internal prompt defaults, configs, and Result placeholder.', '可运行的 Flux2-A2R 动漫转写实图像编辑模板，包含源图占位、Preset 内部提示词默认值、配置节点和结果占位。'),
                    category: 'image',
                    tags: ['image', 'flux', 'flux2', 'a2r', 'edit', 'anime-to-real', 'preset', 'runnable'],
                    typeLabel: t('Image edit preset', '图像编辑预设'),
                    modelDependency: {
                        mode: 'requires_models',
                        label: t('Requires models', '需要模型'),
                        note: t('Requires Flux2-A2R model files and a source image before Run.', '运行前需要 Flux2-A2R 模型文件和一张源图。'),
                        models: [
                            'Flux2-Klein-9B-True-V3-int8mixedrow.safetensors',
                            'qwen3_8b_abliterated_v2-fp8mixed.safetensors',
                            'Flux2 Klein动漫转写实真人 AnythingtoRealCharacters.safetensors',
                            'flux2-vae.safetensors',
                            'dw-ll_ucoco_384_bs5.torchscript.pt',
                            'yolox_l.onnx'
                        ]
                    },
                    path: 'javascript/canvas_workbench/templates/flux2-a2r-image-edit.canvas.json',
                    preview: ''
                },
                {
                    id: 'wan_t2v_basic',
                    title: t('Wan T2V Basic', 'Wan 文生视频基础'),
                    description: t('A runnable Wan2.2 text-to-video template with motion prompt, video parameters, model checks, Run Queue, and video Result placeholder.', '可运行的 Wan2.2 文生视频模板，包含动态提示词、视频参数、模型检查、运行队列和视频结果占位。'),
                    category: 'video',
                    tags: ['video', 'wan', 'wan2.2', 't2v', 'text-to-video', 'motion', 'runnable'],
                    typeLabel: t('Text to video', '文生视频'),
                    modelDependency: {
                        mode: 'requires_models',
                        label: t('Requires models', '需要模型'),
                        note: t('Requires Wan T2V model files before Run.', '运行前需要 Wan T2V 模型文件。'),
                        models: [
                            'Wan2.2_T2V_High_Noise_14B_VACE-Q4_K_M.gguf',
                            'Wan2.2_T2V_Low_Noise_14B_VACE-Q4_K_M.gguf',
                            'nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors',
                            'wan_2.1_vae.safetensors',
                            'Bernini-R_LightX2V_low_noise.safetensors',
                            'flownet.pkl'
                        ]
                    },
                    path: 'javascript/canvas_workbench/templates/wan-t2v-basic.canvas.json',
                    preview: ''
                },
                {
                    id: 'minimax_h3_t2v_basic',
                    title: t('MiniMax H3 Text to Video', 'MiniMax-H3 文生视频'),
                    description: t('A runnable MiniMax H3 text-to-video template with native generated audio, model checks, resolution controls, and a video Result.', '可运行的 MiniMax H3 文生视频模板，包含原生生成音频、模型检查、分辨率控制和视频结果。'),
                    category: 'video',
                    tags: ['video', 'minimax', 'h3', 't2v', 'text-to-video', 'native-audio', 'runnable', '文生视频'],
                    typeLabel: t('Text to video', '文生视频'),
                    modelDependency: {
                        mode: 'requires_models',
                        label: t('Requires H3 models', '需要 H3 模型'),
                        note: t('Requires the MiniMax H3 hybrid FL2VA/Ref2VA model, Qwen3-VL text encoder, and both H3 VAEs.', '需要 MiniMax H3 FL2VA/Ref2VA 混合模型、Qwen3-VL 文本编码器和两个 H3 VAE。'),
                        models: [
                            'minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors',
                            'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
                            'minimax_h3_video_vae_int8_convrot.safetensors',
                            'minimax_h3_audio_vae_fp32.safetensors'
                        ]
                    },
                    path: 'javascript/canvas_workbench/templates/minimax-h3-t2v-basic.canvas.json',
                    preview: ''
                },
                {
                    id: 'minimax_h3_i2v_basic',
                    title: t('MiniMax H3 Image to Video', 'MiniMax-H3 图生视频'),
                    description: t('A runnable MiniMax H3 image-to-video template using a required first frame and an optional last frame, with native generated audio.', '可运行的 MiniMax H3 图生视频模板，使用必需首帧和可选尾帧，并生成原生音频。'),
                    category: 'video',
                    tags: ['video', 'minimax', 'h3', 'i2v', 'image-to-video', 'first-frame', 'last-frame', 'native-audio', 'runnable', '图生视频'],
                    typeLabel: t('Image to video', '图生视频'),
                    modelDependency: {
                        mode: 'requires_models',
                        label: t('Requires images + H3 models', '需要图片和 H3 模型'),
                        note: t('Requires the MiniMax H3 hybrid FL2VA/Ref2VA model, Qwen3-VL text encoder, both H3 VAEs, and a first-frame image.', '需要 MiniMax H3 FL2VA/Ref2VA 混合模型、Qwen3-VL 文本编码器、两个 H3 VAE 和一张首帧图。'),
                        models: [
                            'minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors',
                            'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
                            'minimax_h3_video_vae_int8_convrot.safetensors',
                            'minimax_h3_audio_vae_fp32.safetensors'
                        ]
                    },
                    path: 'javascript/canvas_workbench/templates/minimax-h3-i2v-basic.canvas.json',
                    preview: ''
                },
                {
                    id: 'minimax_h3_r2v_basic',
                    title: t('MiniMax H3 Mixed References to Video', 'MiniMax-H3 多参考视频'),
                    description: t('A runnable MiniMax H3 reference-to-video template supporting up to nine images, three videos with paired soundtracks, and three standalone audio references.', '可运行的 MiniMax H3 多参考视频模板，支持最多九张图片、三个带配对音轨的视频和三个独立音频参考。'),
                    category: 'video',
                    tags: ['video', 'minimax', 'h3', 'r2v', 'reference-to-video', 'multi-image', 'multi-modal', 'video-reference', 'audio-reference', 'ordered-references', 'native-audio', 'runnable', '多参考视频'],
                    typeLabel: t('Mixed references to video', '多参考视频'),
                    modelDependency: {
                        mode: 'requires_models',
                        label: t('Requires media + H3 models', '需要参考媒体和 H3 模型'),
                        note: t('Requires the MiniMax H3 hybrid FL2VA/Ref2VA model, Qwen3-VL text encoder, both H3 VAEs, and at least one image, video, or audio reference.', '需要 MiniMax H3 FL2VA/Ref2VA 混合模型、Qwen3-VL 文本编码器、两个 H3 VAE，以及至少一个图片、视频或音频参考。'),
                        models: [
                            'minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors',
                            'minimax_h3_fl2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors',
                            'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
                            'minimax_h3_video_vae_int8_convrot.safetensors',
                            'taeh3.safetensors',
                            'minimax_h3_audio_vae_fp32.safetensors'
                        ]
                    },
                    path: 'javascript/canvas_workbench/templates/minimax-h3-r2v-basic.canvas.json',
                    preview: ''
                },
                {
                    id: 'director_minimax_h3_loop',
                    title: t('Director + MiniMax H3 Native Audio', 'Director + MiniMax-H3 原生音频分镜'),
                    description: t('A runnable Director Timeline template that generates two MiniMax H3 shots and composes the segment videos while retaining their generated audio.', '可运行的 Director Timeline 模板，生成两个 MiniMax H3 分镜，并在合成分段视频时保留模型生成的音频。'),
                    category: 'video',
                    tags: ['video', 'director', 'timeline', 'minimax', 'h3', 't2v', 'native-audio', 'prompt_override', 'result', 'runnable', '导演', '分镜'],
                    typeLabel: t('Director video with audio', '导演分镜音画'),
                    modelDependency: {
                        mode: 'requires_models',
                        label: t('Requires H3 models', '需要 H3 模型'),
                        note: t('Requires the MiniMax H3 T2V model set. Each shot generates video and audio before Timeline composition.', '需要 MiniMax H3 文生视频模型组。每个分镜先生成视频和音频，再进入 Timeline 合成。'),
                        models: [
                            'minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors',
                            'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
                            'minimax_h3_video_vae_int8_convrot.safetensors',
                            'minimax_h3_audio_vae_fp32.safetensors'
                        ]
                    },
                    path: 'javascript/canvas_workbench/templates/director-minimax-h3-loop.canvas.json',
                    preview: ''
                },
                {
                    id: 'director_wan22_loop',
                    title: t('Director + Wan2.2 Loop', 'Director + Wan2.2 分镜视频'),
                    description: t('A runnable Director Timeline template that runs Wan2.2 T2V per shot and then renders the segment Results through Timeline.', '可运行的 Director Timeline 模板，按分镜运行 Wan2.2 T2V，并把分段视频 Result 放入 Timeline 合成。'),
                    category: 'video',
                    tags: ['video', 'director', 'timeline', 'wan', 'wan2.2', 't2v', 'prompt_override', 'result', 'runnable', '导演', '分镜'],
                    typeLabel: t('Director video', '导演分镜视频'),
                    modelDependency: {
                        mode: 'requires_models',
                        label: t('Requires images + models', '需要图片和模型'),
                        note: t('Requires Wan T2V model files and optional image references before Run.', '运行前需要 Wan T2V 模型文件，可替换图片参考。'),
                        models: [
                            'Wan2.2_Remix_SFW_t2v_14b_high_lighting_v1.0_dyno.safetensors',
                            'wan2.2_bernini_r_low_noise_fp8_scaled.safetensors',
                            'nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors',
                            'wan_2.1_vae.safetensors',
                            'Bernini-R_LightX2V_low_noise.safetensors',
                            'flownet.pkl'
                        ]
                    },
                    path: 'javascript/canvas_workbench/templates/director-wan22-loop.canvas.json',
                    preview: ''
                },
                {
                    id: 'director_result_timeline_mix',
                    title: t('Director Result + Timeline Mix', 'Director Result + Timeline 合成'),
                    description: t('A model-free template for placing Director segment Results into the existing Timeline and rendering a final video Result.', '不依赖模型的 Director 后期模板，把分段视频 Result 放入现有 Timeline，并渲染最终视频 Result。'),
                    category: 'video',
                    tags: ['video', 'director', 'timeline', 'result', 'mix', 'model-free', '导演', '分镜', '合成'],
                    typeLabel: t('Timeline mix', 'Timeline 合成'),
                    modelDependency: {
                        mode: 'model_free',
                        label: t('Model-free', '无模型依赖'),
                        note: t('Replace the segment Result placeholders with generated videos, then render Timeline.', '把分段 Result 占位替换为生成视频后，直接渲染 Timeline。')
                    },
                    path: 'javascript/canvas_workbench/templates/director-result-timeline-mix.canvas.json',
                    preview: ''
                },
                {
                    id: 'wan_i2v_basic',
                    title: t('Wan I2V Basic', 'Wan 图生视频基础'),
                    description: t('A runnable Wan2.2 image-to-video template with first-frame and optional last-frame placeholders, motion prompt, model checks, and video Result placeholder.', '可运行的 Wan2.2 图生视频模板，包含首帧和可选尾帧占位、运动提示词、模型检查和视频结果占位。'),
                    category: 'video',
                    tags: ['video', 'wan', 'wan2.2', 'i2v', 'image-to-video', 'motion', 'runnable'],
                    typeLabel: t('Image to video', '图生视频'),
                    modelDependency: {
                        mode: 'requires_models',
                        label: t('Requires models', '需要模型'),
                        note: t('Requires Wan I2V model files and a first-frame image before Run.', '运行前需要 Wan I2V 模型文件和一张首帧图。'),
                        models: [
                            'Wan2.2-I2V-A14B-HighNoise-Q4_K_M.gguf',
                            'Wan2.2-I2V-A14B-LowNoise-Q4_K_M.gguf',
                            'nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors',
                            'wan_2.1_vae.safetensors',
                            'Wan2.2_I2V_LightX2V_2step_high_noise.safetensors',
                            'Wan2.2_I2V_LightX2V_2step_low_noise.safetensors',
                            'flownet.pkl'
                        ]
                    },
                    path: 'javascript/canvas_workbench/templates/wan-i2v-basic.canvas.json',
                    preview: ''
                },
                {
                    id: 'wan_video_extend',
                    title: t('Wan Video Extend', 'Wan 视频延长'),
                    description: t('A runnable Wan-Extent template for extending an existing generated or imported video, with source video input, continuation prompt, model checks, and video Result placeholder.', '可运行的 Wan-Extent 视频延长模板，支持接入已生成或导入的视频，包含源视频输入、续写提示词、模型检查和视频结果占位。'),
                    category: 'video',
                    tags: ['video', 'wan', 'wan2.2', 'extend', 'extension', 'continue', 'Wan-Extent', 'runnable', '延长', '续写'],
                    typeLabel: t('Video extend', '视频延长'),
                    modelDependency: {
                        mode: 'requires_models',
                        label: t('Requires models', '需要模型'),
                        note: t('Requires Wan I2V model files plus SVI extend LoRAs and a source video before Run.', '运行前需要 Wan I2V 模型、SVI 延长 LoRA 和一个源视频。'),
                        models: [
                            'Wan2.2-I2V-A14B-HighNoise-Q4_K_M.gguf',
                            'Wan2.2-I2V-A14B-LowNoise-Q4_K_M.gguf',
                            'nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors',
                            'wan_2.1_vae.safetensors',
                            'Wan2.2_I2V_LightX2V_2step_high_noise.safetensors',
                            'Wan2.2_I2V_LightX2V_2step_low_noise.safetensors',
                            'SVI_v2_PRO_Wan2.2-I2V-A14B_HIGH_lora_rank_128_fp16.safetensors',
                            'SVI_v2_PRO_Wan2.2-I2V-A14B_LOW_lora_rank_128_fp16.safetensors',
                            'flownet.pkl'
                        ]
                    },
                    path: 'javascript/canvas_workbench/templates/wan-video-extend.canvas.json',
                    preview: ''
                },
                {
                    id: 'qwen_tts_voice_design',
                    title: t('Qwen TTS Voice Design', 'Qwen TTS 音色设计'),
                    description: t('A runnable audio template that generates speech from text and a natural-language voice instruction.', '可运行的音频模板，通过文本和自然语言音色描述生成语音。'),
                    category: 'audio',
                    tags: ['audio', 'tts', 'qwen', 'qwen3-tts', 'voice-design', 'speech', 'runnable', '配音', '音色'],
                    typeLabel: t('Text to speech', '文本转语音'),
                    modelDependency: {
                        mode: 'requires_models',
                        label: t('Requires models', '需要模型'),
                        note: t('Requires Qwen3-TTS VoiceDesign and tokenizer models before Run.', '运行前需要 Qwen3-TTS VoiceDesign 和 tokenizer 模型。'),
                        models: [
                            'Qwen/Qwen3-TTS-Tokenizer-12Hz',
                            'Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign'
                        ]
                    },
                    path: 'javascript/canvas_workbench/templates/qwen-tts-voice-design.canvas.json',
                    preview: ''
                },
                {
                    id: 'qwen_tts_voice_clone',
                    title: t('Qwen TTS Voice Clone', 'Qwen TTS 音色克隆'),
                    description: t('A runnable audio template for cloning a reference voice and speaking new target text.', '可运行的音频模板，用参考音频克隆音色并朗读新的目标文本。'),
                    category: 'audio',
                    tags: ['audio', 'tts', 'qwen', 'qwen3-tts', 'voice-clone', 'reference-audio', 'speech', 'runnable', '克隆', '参考音频'],
                    typeLabel: t('Voice clone', '音色克隆'),
                    modelDependency: {
                        mode: 'requires_models',
                        label: t('Requires audio + models', '需要音频和模型'),
                        note: t('Requires Qwen3-TTS Base, tokenizer, and a reference audio clip.', '需要 Qwen3-TTS Base、tokenizer 和一段参考音频。'),
                        models: [
                            'Qwen/Qwen3-TTS-Tokenizer-12Hz',
                            'Qwen/Qwen3-TTS-12Hz-1.7B-Base'
                        ]
                    },
                    path: 'javascript/canvas_workbench/templates/qwen-tts-voice-clone.canvas.json',
                    preview: ''
                },
                {
                    id: 'qwen_tts_custom_voice',
                    title: t('Qwen TTS Custom Voice', 'Qwen TTS 预设音色'),
                    description: t('A runnable audio template using built-in Qwen TTS speakers for quick narration.', '可运行的音频模板，使用 Qwen TTS 内置音色快速生成旁白。'),
                    category: 'audio',
                    tags: ['audio', 'tts', 'qwen', 'qwen3-tts', 'custom-voice', 'speaker', 'narration', 'runnable', '预设音色', '旁白'],
                    typeLabel: t('Preset voice', '预设音色'),
                    modelDependency: {
                        mode: 'requires_models',
                        label: t('Requires models', '需要模型'),
                        note: t('Requires Qwen3-TTS CustomVoice and tokenizer models before Run.', '运行前需要 Qwen3-TTS CustomVoice 和 tokenizer 模型。'),
                        models: [
                            'Qwen/Qwen3-TTS-Tokenizer-12Hz',
                            'Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice'
                        ]
                    },
                    path: 'javascript/canvas_workbench/templates/qwen-tts-custom-voice.canvas.json',
                    preview: ''
                },
                {
                    id: 'qwen_tts_dialogue',
                    title: t('Qwen TTS Dialogue', 'Qwen TTS 多角色对话'),
                    description: t('A runnable audio template that turns a Role: line script into merged multi-speaker dialogue.', '可运行的音频模板，把“角色: 台词”脚本生成为合并的多角色对话音频。'),
                    category: 'audio',
                    tags: ['audio', 'tts', 'qwen', 'qwen3-tts', 'dialogue', 'multi-speaker', 'script', 'runnable', '多角色', '对话'],
                    typeLabel: t('Dialogue', '多角色对话'),
                    modelDependency: {
                        mode: 'requires_models',
                        label: t('Requires audio + models', '需要音频和模型'),
                        note: t('Requires Qwen3-TTS Base, tokenizer, and reference audio for script roles.', '需要 Qwen3-TTS Base、tokenizer，以及脚本角色的参考音频。'),
                        models: [
                            'Qwen/Qwen3-TTS-Tokenizer-12Hz',
                            'Qwen/Qwen3-TTS-12Hz-1.7B-Base'
                        ]
                    },
                    path: 'javascript/canvas_workbench/templates/qwen-tts-dialogue.canvas.json',
                    preview: ''
                },
                {
                    id: 'qwen_tts_director_ltx23_ta2v',
                    title: t('Qwen TTS + Director + LTX TA2V', 'Qwen TTS + Director + LTX 音频视频'),
                    description: t('A runnable chain where Qwen TTS creates narration audio, Director Timeline writes prompt_override, and LTX TA2V generates the video.', '可运行链路：Qwen TTS 生成旁白音频，Director Timeline 输出 prompt_override，LTX TA2V 生成视频。'),
                    category: 'video',
                    tags: ['video', 'audio', 'tts', 'qwen', 'director', 'timeline', 'ltx', 'ltx', 'ta2v', 'prompt_override', 'runnable', '旁白', '导演'],
                    typeLabel: t('Audio-driven director video', '音频驱动导演视频'),
                    modelDependency: {
                        mode: 'requires_models',
                        label: t('Requires TTS + LTX models', '需要 TTS 和 LTX 模型'),
                        note: t('Requires Qwen3-TTS VoiceDesign plus LTX TA2V model files; run TTS before LTX.', '需要 Qwen3-TTS VoiceDesign 和 LTX TA2V 模型；先生成 TTS 音频，再运行 LTX。'),
                        models: [
                            'Qwen/Qwen3-TTS-Tokenizer-12Hz',
                            'Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign',
                            'ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors',
                            'gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors',
                            'ltx-2.5-audio-vae-bf16.safetensors',
                            'ltx-2.5-video-vae-bf16.safetensors',
                            'ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors',
                            'flownet.pkl'
                        ]
                    },
                    path: 'javascript/canvas_workbench/templates/qwen-tts-director-ltx23-ta2v.canvas.json',
                    preview: ''
                },
                {
                    id: 'ltx23_insight_toolbox',
                    title: t('LTX Insight ToolBox', 'LTX Insight 视频修复工具箱'),
                    description: t('A runnable LTX Insight video template for restoration, HD enhancement, watermark removal, and subtitle removal.', '可运行的 LTX Insight 视频模板，用于视频修复、高清增强、水印移除和字幕移除。'),
                    category: 'video',
                    tags: ['video', 'ltx', 'ltx', 'insight', 'restoration', 'upscale', 'watermark-removal', 'subtitle-removal', 'ic-lora', 'runnable', '视频修复', '去水印', '去字幕'],
                    typeLabel: t('Video restoration', '视频修复'),
                    modelDependency: {
                        mode: 'requires_models',
                        label: t('Requires video + LTX models', '需要视频和 LTX 模型'),
                        note: t('Requires the LTX transformer, text encoder, audio/video VAEs, spatial upscaler, task IC-LoRAs, RIFE, and a source video.', '需要 LTX transformer、文本编码器、音频/视频 VAE、spatial upscaler、任务 IC-LoRA、RIFE，以及源视频。'),
                        models: [
                            'ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors',
                            'gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors',
                            'ltx-2.5-audio-vae-bf16.safetensors',
                            'ltx-2.5-video-vae-bf16.safetensors',
                            'ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors',
                            'ltx2.3-video-restoration-general.safetensors',
                            'ltx2.3-ic-video-upscale-general.safetensors',
                            'ltx2.3-ic-watermark-remove-general.safetensors',
                            'ltx2.3-ic-subtitles-remove-general.safetensors',
                            'flownet.pkl'
                        ]
                    },
                    path: 'javascript/canvas_workbench/templates/ltx23-insight-toolbox.canvas.json',
                    preview: ''
                }
            ];
        }
        return {
            getDefaultWorkbenchTemplateLibraryItems
        };
    }

    window.SimpAICanvasWorkbenchTemplateLibraryDefaults = Object.assign({}, window.SimpAICanvasWorkbenchTemplateLibraryDefaults || {}, {
        createCanvasTemplateLibraryDefaults
    });
})();

