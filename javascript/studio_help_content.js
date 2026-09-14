(function (root) {
    'use strict';

    const pair = (en, cn) => ({ en, cn });
    const text = (value, state) => {
        if (typeof value === 'string') return value;
        const chinese = /^(cn|zh)(-|_|$)/i.test(String(state?.__lang || 'en'));
        return String((chinese ? value?.cn : value?.en) || value?.en || '');
    };
    const titles = {
        home: pair('Studio help', 'Studio 使用指引'),
        preset: pair('Preset introduction', '预置包简介'),
        store: pair('Preset Store guide', '预置仓库指引'),
        agent: pair('Agents in Studio', 'Studio 智能体'),
        setup: pair('Set up an agent model', '配置智能体模型'),
        local: pair('Install a local model', '本地模型安装'),
        api: pair('API connection', 'API 连接'),
        prompt: pair('Prompt tools', '提示词工具'),
        media: pair('Input media', '输入素材'),
        image_prompt: pair('Image Prompt guide', '图片提示指引'),
        image_uov: pair('Upscale and Variation guide', '放大与变化指引'),
        image_inpaint: pair('Inpaint and Outpaint guide', '内外重绘指引'),
        image_enhance: pair('Enhance guide', '增强修图指引'),
        mask: pair('Masks and controls', '蒙版与条件控制'),
        sam3: pair('SAM3 video mask guide', 'SAM3 视频蒙版指引'),
        cfg: pair('CFG / Guidance', 'CFG / 引导强度'),
        models: pair('Generation models', '生成模型指引'),
        refiner: pair('Refiner / Low-noise model', '精修 / 低噪声模型'),
        clip: pair('CLIP / Text encoder', 'CLIP / 文本编码器'),
        vae: pair('VAE guide', 'VAE 指引'),
        upscale: pair('Upscale model guide', '放大模型指引'),
        lora: pair('LoRA guide', 'LoRA 指引'),
        general: pair('General generation settings', '常规生成设置'),
        sampling: pair('Sampling settings', '采样设置'),
        control: pair('Control preprocessing', '控图预处理'),
        inpaint: pair('Inpaint settings', '重绘设置'),
        resolution: pair('Resolution and image fitting', '分辨率与画面适配'),
        profiles: pair('Saved parameter profiles', '参数方案'),
        styles: pair('Style selection', '风格选择'),
        describe: pair('Describe media', '媒体内容反推'),
        metadata: pair('Restore generation parameters', '生成参数提取'),
        obfuscate: pair('Image obfuscation', '图片混淆'),
        application: pair('Application preferences', '应用偏好设置'),
        system: pair('Local system settings', '本地系统设置'),
        access: pair('User permissions', '用户权限'),
    };
    const cfgSummary = pair(
        'Guidance strength, not a quality score. Start with the preset default; CFG and distilled Guidance behave differently.',
        '引导强度不代表画质高低。建议从预置默认值开始；普通 CFG 与蒸馏 Guidance 的作用不同。'
    );
    const topics = {
        home: {
            intro: pair('Choose a topic for the part of Studio you are using.', '选择当前需要了解的区域。'),
            links: ['preset', 'store', 'general', 'sampling', 'cfg', 'resolution', 'profiles', 'styles', 'models', 'agent', 'setup', 'prompt', 'media', 'sam3', 'metadata', 'application'],
        },
        general: {
            intro: pair('These settings control the current generation task. Their availability and effect follow the selected preset and engine.', '这里设置当前生成任务。各项是否可用、如何生效，取决于所选预置和引擎。'),
            sections: [
                [pair('Performance and quantity', '性能与数量'), [
                    pair('Performance modes can change sampling steps and acceleration settings together. Keep the preset mode initially; a speed mode is not a universal switch that preserves identical output.', '性能模式可能同时调整采样步数和加速配置。首次使用保留预置模式；速度模式不保证与其他模式得到完全相同的结果。'),
                    pair('Image Number sets how many results to request, not the video duration. More results require more work. Quick Enhance enables the supported 1.5x enhancement path; its denoising strength can also change details.', '生成数量决定请求多少个结果，不是视频时长。增加数量会增加任务量。“快捷放大增强”启用受支持的 1.5 倍增强流程，降噪强度还可能改变细节。'),
                ]],
                [pair('Prompts, seed and output', '提示词、种子与输出'), [
                    pair('Negative prompts describe unwanted content, but not every workflow uses them. At ordinary CFG=1 they may have no effect; consult the preset rather than adding longer negative prompts automatically.', '反向提示词描述不希望出现的内容，但并非每个流程都会使用它。普通 CFG 为 1 时可能不起作用，请以预置为准，不要只靠增加反向提示词长度调整效果。'),
                    pair('Random seed produces different starting noise. Disable Random to enter a fixed seed for comparisons. Reproduction also requires the same model, preset, prompt, dimensions and sampling settings, and can vary across environments.', '随机种子会改变起始噪声。需要对比参数时关闭“随机种子”并填写固定种子。复现还需要相同模型、预置、提示词、尺寸和采样设置，不同运行环境也可能带来差异。'),
                    pair('Output Format controls supported image output formats, not the video codec. Saving generation metadata is a separate option under My > Application.', '存图格式控制受支持的图片输出格式，不是视频编码格式。是否保存生成参数，需要在“我的 > 应用”中单独设置。'),
                ]],
            ],
            links: ['profiles', 'resolution', 'sampling', 'styles', 'application'],
        },
        sampling: {
            intro: pair('Steps, sampler and scheduler work together with the model. More steps or a different sampler do not automatically improve quality.', '步数、采样器和调度器需要与模型配合。增加步数或更换采样器不代表画质一定提高。'),
            sections: [[pair('Use the preset combination', '使用预置搭配'), [
                pair('Start with the preset steps. Where -1 is available for Forced Overwrite of Sampling Step, it disables the manual override and lets the performance/preset path decide; it does not request negative sampling steps.', '从预置步数开始。“采样步数”提供 -1 时，表示不手动覆盖，由性能模式或预置流程决定，不是执行负数步采样。'),
                pair('The sampler controls the numerical sampling method; the scheduler controls how noise levels are arranged. Distilled and few-step models may require specific combinations, so change one setting at a time.', '采样器决定数值采样方法，调度器决定噪声级别的安排。蒸馏和少步模型可能要求特定组合，调整时每次只改变一项。'),
                pair('The SDXL advanced group and FreeU (Fooocus only) are engine-specific. ADM, sharpness, CFG mimicking and refiner swap options should not be assumed to apply to Flux, Wan or H3 workflows.', 'SDXL 高级设置和 FreeU（仅 Fooocus）有特定适用范围。ADM、锐度、CFG Mimicking 和精修切换方式不能默认套用到 Flux、Wan 或 H3 工作流。'),
            ]]],
            links: ['cfg', 'models', 'refiner', 'general'],
        },
        control: {
            intro: pair('This tab adjusts supported image-conditioning preprocessors. It does not activate a ControlNet workflow by itself.', '这里调整受支持的图像条件预处理，仅修改这些参数不会自动启用 ControlNet 流程。'),
            sections: [[pair('Prepare a matching condition', '准备匹配的条件图'), [
                pair('Choose the input and control type supported by the preset first. Debug Preprocessors shows the derived condition for inspection; it is a diagnostic view rather than a finished generation result.', '先选择预置支持的输入和控图类型。“调试预处理器”用于查看生成的条件图，这类预览不是最终生成结果。'),
                pair('Skip Preprocessors expects a condition that is already prepared, such as a Canny edge map or depth map. Do not enable it for an ordinary photo unless the workflow explicitly expects the photo as its condition.', '“跳过预处理器”要求输入已经处理好的条件，例如 Canny 边缘图或深度图。普通照片不要直接启用此项，除非工作流明确要求以原图作为条件。'),
                pair('Canny thresholds affect detected edges; inspect the preview when changing them. ControlNet softness applies only to the compatible control path, not every image or video reference.', 'Canny 高低阈值影响检测到的边缘，修改后应检查预览。ControlNet 柔和度仅作用于兼容的控图流程，不是所有图片和视频参考的通用强度。'),
            ]]],
            links: ['media', 'mask', 'inpaint'],
        },
        inpaint: {
            intro: pair('These are supporting settings for a compatible inpaint task. Upload the source and define the mask in the task area first.', '这些设置用于配合兼容的重绘任务。请在任务区域上传源素材并明确蒙版范围。'),
            sections: [[pair('Engine, mask and debugging', '引擎、蒙版与调试'), [
                pair('Keep the inpaint engine selected by the preset. Disabling the initial latent changes how much original image information is used; it is not a general quality improvement switch.', '保留预置指定的重绘引擎。“禁用初始潜空间”会改变对原始图像信息的使用方式，不是通用画质增强开关。'),
                pair('Positive Mask Erode or Dilate values enlarge the white mask area; negative values shrink it. This operation is applied before mask inversion. Inspect both the boundary and invert state before submitting.', '“蒙版侵蚀或膨胀”正值扩大白色区域，负值缩小白色区域，在蒙版反转之前处理。提交前同时检查边界与反转状态。'),
                pair('GroundingDINO box expansion adjusts the detection box before SAM processes it. Preprocessing, enhancement-mask and GroundingDINO debug switches are for checking intermediate inputs, not for improving every result.', 'GroundingDINO 检测框扩缩在 SAM 处理前调整检测框。预处理、增强蒙版和 GroundingDINO 调试开关用于检查中间输入，不需要为了提高效果全部开启。'),
            ]]],
            links: ['mask', 'control', 'models'],
        },
        resolution: {
            intro: pair('Resolution controls the requested dimensions and how input media fits them. The active workflow may further normalize the final size.', '分辨率设置决定请求尺寸和输入画面的适配方式，当前工作流还可能进一步规范最终尺寸。'),
            sections: [[pair('Size and fitting', '尺寸与适配'), [
                pair('Choose a template and aspect ratio, or set width and height. Normalize rounds dimensions to the selected step for model compatibility. Values such as -1 indicate an automatic/unset dimension, not a negative output size.', '选择模板与比例，或填写宽高。“规格化”按所选步长对齐尺寸，以符合模型要求。-1 这类值表示自动或未指定尺寸，不是负数输出尺寸。'),
                pair('Keep preserves the source aspect ratio; Crop can remove content outside the target frame; Scale fits the target dimensions and may distort proportions; Pad fills the outside area. Padding is not the same as generative outpainting.', '“等比”保持原比例；“裁剪”可能移除目标画框外内容；“缩放”适配目标宽高，可能改变比例；“填充”处理画面外区域。填充不等于生成式扩图。'),
                pair('Ratio Lock links width and height. Random Size and Original Input follow the preset-supported path; neither guarantees every downstream stage keeps exactly the uploaded pixel dimensions.', '比例锁定联动宽高。随机尺寸和原图输入以预置支持的流程为准，不保证后续所有阶段都保持上传素材的原始像素尺寸。'),
                pair('Increasing both width and height increases the pixel count substantially. Check memory and runtime before increasing scale, especially for video.', '同时增加宽高会明显增加像素量，提升倍率前请考虑内存与耗时，视频任务尤其如此。'),
            ]]],
            links: ['general', 'media', 'preset'],
        },
        profiles: {
            intro: pair('The name field beside Save/Delete stores parameter profiles for the current user and preset. A profile is different from a complete preset package.', '名称框旁的保存 / 删除用于管理当前用户、当前预置下的参数方案。参数方案与完整预置包不同。'),
            sections: [[pair('Save and reuse', '保存与复用'), [
                pair('Enter a name and save the current parameters. Saving an existing name replaces that profile; use another name to keep both versions. Selecting a saved profile restores its supported parameters.', '填写名称后保存当前参数。同名保存会更新该方案；需要保留两个版本时请使用不同名称。选择已保存方案会恢复其中受支持的参数。'),
                pair('Delete removes the selected saved profile, not the model files or the preset package. Confirm the selected name before deleting.', '删除移除所选参数方案，不删除模型文件或预置包。删除前请检查所选名称。'),
                pair('A profile does not install required models or package all source images, video and audio. Recheck the restored values and required media before generation.', '参数方案不会安装所需模型，也不会打包所有源图片、视频和音频。恢复后请检查参数及必需素材再生成。'),
            ]]],
            links: ['preset', 'store', 'metadata'],
        },
        styles: {
            intro: pair('Styles supply prompt templates, not model files. Their effect depends on the active preset and model.', '风格提供提示词模板，不是模型文件，实际效果取决于当前预置和模型。'),
            sections: [[pair('Select and compare', '选择与比较'), [
                pair('Search by style name, then click a style to select or deselect it. Several styles may be selected together; check the selected-style area before generation.', '按风格名称搜索，点击风格可选中或取消。可以同时选择多个风格，生成前请检查已选风格区域。'),
                pair('A style can add positive and negative prompt text. Preview its content before combining it with detailed prompts; several templates can conflict or change the intended subject and composition.', '风格可能添加正向和反向提示词。与详细提示词组合前请查看模板内容；多个模板可能互相冲突，改变原本的主体或构图。'),
                pair('Random Style can vary the chosen style between results. For controlled comparisons, use an explicit style and a fixed seed. Selecting a style does not download a LoRA or change the base model.', '随机风格可能使结果使用不同风格。需要对照参数时，请使用明确风格和固定种子。选择风格不会下载 LoRA 或更换基础模型。'),
            ]]],
            links: ['prompt', 'lora', 'general'],
        },
        describe: {
            intro: pair('Describe Media asks a supported VLM to interpret uploaded media. It does not recover the exact prompt or generation settings originally used.', '媒体内容反推使用受支持的 VLM 理解上传素材，不会还原素材原本使用的准确提示词或生成参数。'),
            sections: [[pair('Before interpreting media', '开始反推前'), [
                pair('Select a model with the required image or video input support. Files present or API configured are not proof that the model can process every media type.', '选择支持所需图片或视频输入的模型。文件齐全或 API 配置完成，不代表模型支持所有素材类型。'),
                pair('Tags, Chinese output and artist options change the requested description where supported. Review the output before using it as a generation prompt; descriptions can omit or misidentify details.', '标签、中文输出和艺术家选项会在受支持时影响反推要求。用于生成前请检查文本，模型描述可能遗漏或误认细节。'),
                pair('An API-backed model may send the media to its provider and incur usage. Local models require sufficient resources. Use the chat entry for follow-up questions; use Metadata for embedded generation parameters.', '通过 API 使用模型时，素材可能发送到服务商并产生用量。本地模型需要足够运行资源。追问可使用对话入口；读取文件内嵌生成参数请使用“生成参数提取”。'),
            ]]],
            links: ['setup', 'agent', 'metadata'],
        },
        metadata: {
            intro: pair('This tool reads generation parameters embedded in a supported image or video. It does not infer missing settings from the picture.', '此工具读取受支持图片或视频内嵌的生成参数，不会根据画面猜出缺失设置。'),
            sections: [[pair('Preview before applying', '预览后再应用'), [
                pair('Upload the original generated file and inspect Preview Metadata. Apply Metadata becomes available when reusable parameters are found; applying can replace current generation settings.', '上传原始生成文件并查看参数预览。找到可恢复参数后，才可“提取生成参数并重置环境”；应用可能覆盖当前生成设置。'),
                pair('Screenshots, recompression and platform sharing can strip metadata. If no parameters are found, try the original file. Media description is a separate VLM task and cannot guarantee exact reconstruction.', '截图、重新压缩或平台转发可能移除元数据。未找到参数时请尝试原始文件。媒体反推属于另一个 VLM 任务，不能保证准确还原。'),
                pair('Parameters do not contain all referenced media or model files. Check model availability, inputs and preset after applying; reproduction is not guaranteed across versions or environments.', '参数不包含所有引用素材或模型文件。应用后检查模型、输入和预置；不同版本或环境下不保证完全复现。'),
            ]]],
            links: ['profiles', 'models', 'application'],
        },
        obfuscate: {
            intro: pair('Image obfuscation rearranges pixels. Despite the Encrypt/Decrypt labels, it is not secure encryption and should not protect sensitive material.', '图片混淆通过重排像素改变画面。虽然按钮使用加密 / 解密字样，但它不是安全加密，不应依靠它保护敏感素材。'),
            sections: [[pair('Preserve a reversible copy', '保留可还原的副本'), [
                pair('Upload an image, set the transformation code and run the desired direction. To restore it, use the matching code and the original obfuscated PNG.', '上传图片，填写变换口令后选择混淆或还原。还原时使用相同口令和原始混淆 PNG 文件。'),
                pair('Keep a separate original. Resizing, cropping, screenshots or lossy conversion such as JPEG can prevent exact recovery. The tool writes PNG results even if another generation output format is selected.', '另外保留原图。缩放、裁剪、截图或转为 JPEG 等有损格式可能导致无法准确还原。即使生成存图格式选择了其他格式，此工具仍输出 PNG。'),
                pair('Save decrypted image controls whether the restored result is added to saved output. Read the result before sharing; an obfuscated appearance does not remove all privacy risks.', '“保存解密图片”决定是否将还原结果加入保存输出。分享前请检查结果，画面不可直接辨认不等于没有隐私风险。'),
            ]]],
            links: ['metadata', 'application'],
        },
        application: {
            intro: pair('My > Application contains display, output and workflow preferences. Some settings depend on your permissions or the current engine.', '“我的 > 应用”包含显示、输出和流程偏好，部分设置受权限或当前引擎限制。'),
            sections: [[pair('Know what a preference changes', '分清设置的作用'), [
                pair('Language and theme change the interface. Hiding the welcome image or blurring gallery previews does not change generated content or encrypt saved files.', '语言和主题改变界面显示。隐藏欢迎图或模糊图库预览，不会改变生成内容，也不会加密保存的文件。'),
                pair('Backfill prompt can replace the editor prompt when you switch gallery images. Disable seed increment changes seed handling across a batch; it is separate from Random Seed.', '切换图片时回填提示词可能替换编辑框内容。“禁用种子递增”改变批量任务的种子处理，与“随机种子”是不同设置。'),
                pair('Disable Preview, Disable Intermediate Results and Save only final enhanced image affect which intermediate content is displayed or retained. They do not all stop the underlying intermediate computations.', '禁用预览、禁用中间结果和仅保存最终增强图片，影响中间内容的显示或保留方式，不代表都能停止相应中间计算。'),
                pair('Save Metadata to Images allows later parameter recovery and may expose prompts/settings when you share the file. Inspect metadata before sharing sensitive work. A metadata scheme does not include every reference image.', '保存生成参数便于日后恢复，也可能在分享文件时暴露提示词和设置。分享敏感作品前请检查元数据；参数格式不会包含每一张参考图片。'),
                pair('Missing model filter hides affected presets; it does not install models. Disabling model download notifications suppresses a notice, not the need for model files. Save as preset package is separate from the parameter-profile row in Settings.', '缺失模型过滤会隐藏相应预置，不会安装模型。关闭模型下载提醒只影响提醒，不会消除模型文件要求。“保存为预置包”与设置页的参数方案分开管理。'),
            ]]],
            links: ['profiles', 'metadata', 'system', 'access'],
        },
        system: {
            intro: pair('Local System contains server-level options. Access depends on permissions; do not change them while another task is running.', '本地系统包含服务端选项，是否可操作取决于权限。其他任务正在执行时请勿随意修改。'),
            sections: [[pair('Memory, caches and defaults', '内存、缓存与默认设置'), [
                pair('Keeping Comfyd active can reduce repeated startup/loading, but resources may remain occupied. Clear caches on finish trades reuse for resource release; follow any restart instructions shown by the control.', '保持 Comfyd 活跃可能减少重复启动和加载，但也可能持续占用资源。完成后清理缓存会以减少复用换取资源释放；请遵循控件中的重启提示。'),
                pair('Reserved VRAM leaves room for other allocations; it does not increase total VRAM. RAM cache uses system memory, not additional VRAM. Raising either number is not automatically faster.', '预留显存是为其他分配保留空间，不会增加显存总量。RAM 缓存使用系统内存，不是额外显存。两者都不是数值越高越快。'),
                pair('DynamicVRAM, smart memory and optimizations can depend on hardware and backend versions. Start with existing defaults and change one option at a time.', 'DynamicVRAM、智能内存和优化选项可能依赖硬件及后端版本。从现有默认设置开始，每次只改变一项。'),
                pair('Restore all defaults clears saved local settings for the current user and requires confirmation. It is not just a reset of the active generation task; record settings you need before confirming.', '恢复全部默认值会清除当前用户保存的本地设置，并要求确认。它不只是重置当前生成任务，确认前请记录需要保留的配置。'),
            ]]],
            links: ['application', 'setup', 'access'],
        },
        access: {
            intro: pair('The Users tab manages access on this Studio server. Reading help does not grant or change permissions.', '用户 tab 管理这台 Studio 服务的访问权限，阅读帮助不会授予或修改权限。'),
            sections: [[pair('Guests and selected users', '访客与指定用户'), [
                pair('Guest permissions and selected-user permissions are separate. Check the selected user before approving, rejecting or saving. Generation and model downloads are separate permissions.', '访客权限与指定用户权限分开设置。批准、拒绝或保存前，请核对当前选中的用户。生成与模型下载属于不同权限。'),
                pair('Save guest permission applies guest settings; Save permission applies the selected user settings. These actions can enable resource usage on the server, so grant only the access needed.', '保存访客权限用于访客设置；保存权限用于所选用户设置。这些操作可能允许使用服务端资源，请仅授予需要的权限。'),
                pair('Refresh applications updates the request list; it does not approve requests. If controls are hidden or disabled, use an authorized administrator account rather than assuming the server is broken.', '刷新申请用于更新申请列表，不会自动批准。控件隐藏或禁用时，需要有权限的管理员处理。'),
            ]]],
            links: ['application', 'system'],
        },
        cfg: {
            intro: cfgSummary,
            sections: [
                [pair('What it controls', '它控制什么'), [
                    pair('Ordinary CFG combines positive and negative condition predictions. Increasing it can strengthen the conditioning, but excessive values can cause oversaturation, distortion or reduced variation. Higher is not always better.', '普通 CFG 根据正、负条件的预测差异进行引导。增大数值可能加强条件的影响，过高也可能导致过饱和、失真或结果变化减少，并非越高越好。'),
                    pair('In ordinary CFG, 1 means no additional positive/negative difference guidance; the positive prompt is still used. Whether a negative prompt has an effect depends on the workflow.', '普通 CFG 为 1 时，不额外施加正、负条件差值引导，但仍会使用正向提示词。负面提示词是否生效，需要看当前工作流。'),
                ]],
                [pair('Different models, different meanings', '不同模型不能照搬数值'), [
                    pair('Studio reuses this control across engines. For example, the Flux1 workflow passes it to distilled Guidance in text conditioning, which is not ordinary sampler CFG. A label alone does not identify the implementation.', 'Studio 在不同引擎中复用此控件。例如 Flux1 工作流会将它传给文本条件中的蒸馏 Guidance，与采样器的普通 CFG 不同，不能仅凭标签判断实际作用。'),
                    pair('Distilled, Turbo and few-step models should use their preset defaults as a starting point. A default of 1 can be intentional; do not automatically replace it with values used for older SDXL workflows.', '蒸馏、Turbo 和少步模型应从各自预置默认值开始。默认值为 1 可能就是设计要求，不要直接套用旧 SDXL 工作流的数值。'),
                    pair('Shift changes the noise schedule; it is neither ordinary CFG nor distilled Guidance. Do not treat the video/audio shift controls as prompt-strength controls.', 'Shift 调整噪声调度，既不是普通 CFG，也不是蒸馏 Guidance。不要把视频偏移、音频偏移当作提示词强度。'),
                ]],
                [pair('How to adjust', '如何调整'), [
                    pair('Keep the prompt, seed, steps and other settings unchanged when comparing values. Make small changes around the preset default; return to it if detail, color or consistency gets worse.', '比较数值时，保持提示词、种子、步数和其他设置一致。在预置默认值附近小幅调整；细节、颜色或一致性变差时恢复默认值。'),
                    pair('Runtime depends on whether the workflow calculates an extra negative branch and on its optimizations. Increasing the number does not imply a proportional increase in generation time.', '耗时取决于工作流是否额外计算负条件分支以及相关优化，数值增大不代表生成时间按比例增加。'),
                ]],
            ],
            links: ['preset', 'models'],
        },
        models: {
            intro: pair('This panel selects generation models and their supporting components. These are separate from the LLM/VLM selected for chat and agents.', '这里选择生成模型及其配套组件，与对话和智能体使用的 LLM / VLM 模型分开配置。'),
            sections: [
                [pair('Start with a preset', '从预置开始'), [
                    pair('Choose a preset for the task first, then inspect its model selections and missing-file list. Keep the preset combination for the first attempt; files with the same extension are not necessarily compatible.', '选择符合任务的预置后，查看它选用的模型和缺失文件清单。首次使用建议保留预置搭配；文件扩展名相同不代表互相兼容。'),
                    pair('The base model performs the main generation. In workflows with separate noise stages, this field may select the high-noise model and the refiner field the low-noise model. Use the pair required by the preset.', '基础模型负责主要生成过程。在区分噪声阶段的工作流中，此处可能对应高噪声模型，精修位置可能对应低噪声模型，应使用预置要求的配套组合。'),
                    pair('A greyed-out field means the current preset does not expose that setting. It does not by itself mean files are missing. This help remains readable while its controls are disabled.', '字段变灰表示当前预置未开放该设置，不能仅据此判断模型缺失。控件不可操作时，仍可阅读相应指引。'),
                ]],
                [pair('Select and install', '选择与安装'), [
                    pair('Use the dropdown to choose a listed file, or the browse button beside it to open the model browser. Panel edits synchronize with the generation settings; check the selected file before starting generation.', '使用下拉菜单选择已列出的文件，或点击旁边的浏览按钮打开模型浏览器。面板修改会同步到生成设置，生成前请检查当前选择。'),
                    pair('For manual installation, follow the preset missing-file list and configured directories for checkpoints/diffusion models, text encoders, VAE, LoRA and upscalers. Keep the required relative paths, then use Refresh Local Model List.', '手动安装时，按照预置缺失清单及已配置目录，分别放置主模型、文本编码器、VAE、LoRA 和放大模型，保留要求的相对路径，然后点击“刷新本地模型列表”。'),
                    pair('Directories are on the Studio server. A file appearing in the list does not prove architectural compatibility or sufficient memory. Opening help does not download or load models.', '模型目录位于运行 Studio 的电脑上。文件出现在列表中，不代表架构匹配或内存足够。打开指引不会下载或加载模型。'),
                ]],
            ],
            links: ['refiner', 'clip', 'vae', 'lora', 'upscale', 'cfg', 'setup'],
        },
        refiner: {
            intro: pair('The refiner field can mean a refinement model or a low-noise model, depending on the preset.', '精修位置可能用于精修模型，也可能用于低噪声模型，具体含义随预置变化。'),
            sections: [
                [pair('Model and switch point', '模型与切换点'), [
                    pair('In a base/refiner workflow, the base model begins sampling and the refiner continues the later stage. In high/low-noise workflows, the two models specialize in different noise stages; the low-noise model is not a generic detail enhancer.', '基础 / 精修工作流由基础模型开始采样，精修模型继续后续阶段。高 / 低噪声工作流则由两个模型分别负责不同噪声阶段，低噪声模型不是通用的细节增强器。'),
                    pair('Where supported, Refiner Switch sets the fraction of the sampling process before switching. For example, 0.8 means switching after roughly 80% of the process, not an 80% model blend. Some workflows manage stages internally and do not use this field.', '支持“精修切换点”的流程中，该值表示切换前的采样进度比例。例如 0.8 表示约在 80% 进度后切换，不是两个模型按 80% 混合。部分工作流自行管理阶段，不使用此字段。'),
                    pair('Keep the preset pair and switch point initially. If the field is disabled or the preset selects None, do not add an unrelated model merely to fill the slot.', '首次使用保留预置指定的模型组合与切换点。字段变灰或预置选择 None 时，不需要为了填满位置而添加无关模型。'),
                ]],
            ],
            links: ['models', 'cfg'],
        },
        clip: {
            intro: pair('The text encoder converts prompts into conditioning for the generation model. CLIP is a historical field name; a preset may use T5, Qwen or another encoder.', '文本编码器把提示词转换为生成模型使用的条件。CLIP 是沿用的字段名称，预置也可能使用 T5、Qwen 等其他编码器。'),
            sections: [[pair('Compatibility', '配套要求'), [
                pair('Match the architecture, version and format required by the preset. Some workflows load multiple encoders or fixed companion files; this selector may cover only one of them.', '按预置要求选择架构、版本和格式。部分工作流会同时加载多个编码器或固定的配套文件，此下拉框可能只负责其中一个。'),
                pair('A generation text encoder is not the chat agent model. Even when its filename contains Qwen, selecting it here does not configure chat or enable an agent.', '生成用文本编码器不等于对话智能体模型。即使文件名带有 Qwen，在这里选择它也不会完成对话配置或启用智能体。'),
            ]]],
            links: ['models', 'setup'],
        },
        vae: {
            intro: pair('VAE converts between media and the latent representation used in generation. It is not a style model or an upscaler.', 'VAE 负责媒体与生成过程所用潜空间表示之间的转换，不是风格模型，也不是放大模型。'),
            sections: [[pair('Choose the matching VAE', '选择配套 VAE'), [
                pair('Keep the VAE required by the preset. Image and video VAEs, different model families and different compression layouts are not interchangeable just because their file format matches.', '保留预置要求的 VAE。图片与视频 VAE、不同模型家族和压缩结构不能仅因文件格式相同就互换。'),
                pair('Default or built-in selections are interpreted by the active engine; they do not always mean that no VAE is used. If decoding fails or colors are abnormal, check the preset model combination and reported errors.', '默认或内置选项由当前引擎解释，不一定表示没有使用 VAE。解码失败或颜色异常时，检查预置模型搭配和错误提示。'),
            ]]],
            links: ['models'],
        },
        upscale: {
            intro: pair('An upscaler enlarges media in workflows that support it. Selecting one does not enable upscaling in every generation mode.', '放大模型用于支持它的放大流程。选择了放大模型，不代表所有生成模式都会执行放大。'),
            sections: [[pair('Use the active workflow', '以当前流程为准'), [
                pair('Choose a model compatible with the image or video upscaling task and check the preset scale/resolution controls. Output size, memory and runtime also depend on the workflow.', '选择与图片或视频放大任务兼容的模型，并检查预置中的倍率和分辨率设置。输出尺寸、内存与耗时还取决于工作流。'),
                pair('Upscaling can synthesize detail; it does not guarantee recovery of the original detail. A Default selection follows the engine or preset configuration.', '放大可能生成新的细节，不保证还原原始细节。选择 Default 时，以当前引擎或预置配置为准。'),
            ]]],
            links: ['models', 'preset'],
        },
        lora: {
            intro: pair('LoRA adapts a compatible base model for a subject, style or capability. It is not a replacement for the base model.', 'LoRA 在兼容的基础模型上调整主体、风格或能力，不能替代基础模型本身。'),
            sections: [
                [pair('Slots 1-5 and 6-10', '1–5 与 6–10 的分组'), [
                    pair('For Wan2.2 workflows with separate high-noise and low-noise models, slots 1-5 are for high-noise LoRAs and slots 6-10 are for low-noise LoRAs. Match each LoRA to the model and noise stage of its group; do not use the two groups interchangeably.', 'Wan2.2 系列使用高低噪双模型结构时，1–5 输入高噪 LoRA，6–10 输入低噪 LoRA。每组 LoRA 要与对应的模型及噪声阶段匹配，不能混用两组位置。'),
                    pair('Single-model workflows do not distinguish high-noise and low-noise LoRA groups. Slots 6-10 are not reserved for a low-noise model in those workflows.', '单模型流程不区分高噪与低噪 LoRA 分组，6–10 在这类流程中并不是低噪专用位置。'),
                ]],
                [pair('Enable, select and weight', '启用、选择与权重'), [
                pair('Each row has its own enable checkbox, file selector and weight. Check the row, choose a compatible LoRA and start with the weight and trigger words recommended for that file.', '每行都有独立启用开关、文件选择和权重。勾选该行，选择兼容的 LoRA，并从该文件建议的权重与触发词开始。'),
                pair('Weight is not a percentage or a quality score. The numeric input may allow negative values and values above 1; those ranges do not guarantee a useful result. Increasing weight can distort details or overpower the prompt.', '权重不是百分比，也不是画质评分。数字框可能允许负数和大于 1 的数值，但可输入不代表效果合适。权重过高可能使细节失真或压过提示词。'),
                pair('Several LoRAs can interfere with one another. When comparing, enable one at a time. Speed/step-distillation LoRAs may also require matching steps and CFG; keep those bundled with the preset unless you understand their role.', '多个 LoRA 可能互相影响，比较效果时可逐个启用。加速或步数蒸馏 LoRA 还可能要求配套的步数和 CFG；未了解其作用前，建议保留预置自带的配置。'),
                ]],
            ],
            links: ['models', 'cfg'],
        },
        store: {
            intro: pair('Organize the presets shown in the top navbar. Changes stay in the draft until you apply them. Organizing presets does not require an LLM.', '整理顶部导航栏中的常用预置。仓库内的调整先保留在草稿中，点击应用后才更新导航栏。整理预置不需要 LLM。'),
            sections: [
                [pair('Find and add presets', '查找与添加'), [
                    pair('Search by preset name and combine engine and task filters to narrow the list. User presets are listed separately from the built-in pool.', '按预置名称搜索，可同时使用引擎和任务筛选。个人预设与内置预置池分开展示。'),
                    pair('Click a preset to add it to the draft, or drag it to the desired position. Highlighted presets are already in the draft; clicking one again removes it from the draft.', '点击预置可添加到草稿，也可拖到草稿中的指定位置。带选中底色的预置已在草稿中，再次点击会将其移出草稿。'),
                ]],
                [pair('Order and capacity', '排序与数量'), [
                    pair('Drag items within the draft to reorder them. The count shows the current number and the limit; keep at least one preset.', '在草稿中拖动条目调整顺序。数字显示当前数量与上限，至少需要保留一个预置。'),
                    pair('Adding a new preset when the draft is full removes the last item. Remove an unwanted item first when you need to keep the others.', '草稿已满时继续添加新预置，会移出末尾条目。需要保留其余条目时，请提前移除不需要的预置。'),
                ]],
                [pair('Apply, reset and close', '应用、重置与关闭'), [
                    pair('Apply to Navbar saves the draft order and keeps the store open. Apply to Navbar and Close saves it and closes the store.', '“应用到导航栏”保存草稿顺序并保持仓库打开；“应用到导航栏并关闭”保存后关闭仓库。'),
                    pair('Reset restores the draft to the currently applied navbar, not the factory defaults. Closing the store alone does not apply the draft.', '“重置”将草稿恢复为当前已应用的导航栏内容，不会恢复出厂预置。仅关闭仓库不会应用草稿。'),
                ]],
                [pair('Removal and model files', '移除与模型文件'), [
                    pair('The remove button in the draft only removes a navbar entry; it does not delete the preset file. The delete button on a user preset asks for confirmation and deletes its file.', '草稿条目的移除按钮只移除导航入口，不删除预置文件。个人预设上的删除按钮会要求确认，确认后删除该预设文件。'),
                    pair('Adding a preset does not install its models or start generation. A missing-model marker means you should inspect the model check after selecting that preset.', '添加预置不会安装模型或开始生成。出现模型缺失标记时，选择该预置后查看模型检查结果。'),
                ]],
            ],
            links: ['preset', 'agent'],
        },
        agent: {
            intro: pair('Chat, prompt tools and Canvas Agent use language models for different tasks. Image and video generation also need their own presets and models.', '对话、提示词工具和画布 Agent 分别使用语言模型完成不同任务。图片和视频生成还需要对应的预置包和生成模型。'),
            sections: [
                [pair('Choose an entry', '选择入口'), [
                    pair('Main chat: open the chat icon in Describe Media. Guide mode explains workflows; Creative mode can submit supported generation tasks.', '主界面对话：在“描述媒体”区域打开对话图标。向导模式提供使用建议；创作模式可以提交支持的生成任务。'),
                    pair('Prompt tools: translate or refine the current prompt. Check the selected action before applying the result.', '提示词工具：翻译或优化当前提示词。应用结果前，检查所选操作及生成的文本。'),
                    pair('Canvas Agent: use selected nodes as references, choose a task, then inspect the resulting workflow and run status.', '画布 Agent：引用选中的节点，选择任务，并查看生成的工作流和执行状态。'),
                ]],
                [pair('Model selection', '模型选择'), [
                    pair('Select a model at the entry you are using. Canvas Agent has its own model selection and API synchronization controls; configuring main chat does not automatically change every agent.', '在实际使用的入口选择模型。画布 Agent 有自己的模型选择与 API 同步按钮；配置主界面对话后，不会自动更改所有智能体。'),
                    pair('Thinking and prompt refinement need a language model. Ordinary generation and tools that do not use an LLM remain available without one.', '思考模式和智能优化需要语言模型。未配置 LLM 时，普通生成及不依赖 LLM 的工具仍可使用。'),
                ]],
            ],
            links: ['setup', 'prompt', 'preset'],
        },
        setup: {
            intro: pair('Choose an API connection or install a supported local model. Help remains available without a model.', '可以配置 API，也可以安装受支持的本地模型。没有模型时仍可阅读本指引。'),
            sections: [
                [pair('Complete the setup', '配置流程'), [
                    pair('API: enter the service address and model name, add a key when required, save the configuration, and use Test API.', 'API：填写服务地址和模型名称，按服务要求填写密钥，保存配置后使用“测试 API”。'),
                    pair('Local model: install the required files, refresh the model list, and select the model in chat or Canvas Agent.', '本地模型：安装所需文件，刷新模型列表，并在对话或画布 Agent 中选择该模型。'),
                    pair('Check text first with a short request. For image understanding, also verify image input support. Tests may load a model or incur API usage.', '使用一条简短请求检查文本能力。需要理解图片时，还要检查图像输入能力。测试可能加载模型或产生 API 用量。'),
                ]],
                [pair('Understand status', '理解状态'), [
                    pair('Files present and configuration complete are preparation checks, not a successful inference test. A model that is not loaded is not necessarily missing.', '文件齐全、配置完整表示准备条件满足，不代表已经成功推理。模型尚未加载也不等于文件缺失。'),
                    pair('If generation is unavailable after chat works, check the generation preset and its model files separately.', '对话可用但无法生成图片或视频时，还需要检查生成预置包及其模型文件。'),
                ]],
            ],
            links: ['api', 'local', 'agent'],
            actions: ['settings'],
        },
        local: {
            intro: pair('These steps cover Studio-managed local language models. A model served by another application uses the API connection route.', '以下步骤适用于由 Studio 加载的本地语言模型。由其他应用提供服务的模型使用 API 连接方式。'),
            sections: [
                [pair('Manual installation', '手动安装'), [
                    pair('Select a supported model and inspect its missing-file list. Match the model architecture and required format; renaming a file does not make it compatible.', '选择受支持的模型，查看缺失文件清单。核对模型架构和文件格式；更改文件名不能使不兼容的模型获得支持。'),
                    pair('For the llama.cpp route, place the GGUF model under a configured LLM directory, retaining the required relative subdirectory. Vision models may also require the matching mmproj file.', '使用 llama.cpp 时，将 GGUF 模型放入配置的 LLM 目录，并保留清单要求的相对子目录。视觉模型还可能需要与主模型配套的 mmproj 文件。'),
                    pair('Other backends may require a complete model folder and different directories. Follow the missing-file list for the selected model; do not place every format in the GGUF directory.', '其他后端可能需要完整的模型文件夹和不同目录。以所选模型的缺失文件清单为准，不要把所有格式都放入 GGUF 目录。'),
                    pair('Refresh the model list after copying files. Reopen the selector if necessary, select the model, and send a short test request.', '复制文件后刷新模型列表，必要时重新打开模型选择器，选择模型并发送一条简短测试请求。'),
                    pair('If files are present but loading fails, inspect the reported format, runtime and memory requirements. For memory limits, reduce context size or use a smaller compatible model.', '文件存在但加载失败时，检查提示中的格式、运行库和内存要求。内存不足时可降低上下文长度，或改用较小的兼容模型。'),
                ]],
                [pair('Where files belong', '文件放在哪里'), [
                    pair('Directories belong to the machine running Studio, not necessarily the device displaying this page. Remote users should ask the administrator to install or refresh models.', '目录位于运行 Studio 的电脑上，不一定是当前浏览网页的设备。远程用户需要联系管理员安装或刷新模型。'),
                    pair('Opening this guide does not download or load any model. Review file size and available disk space before starting a download.', '打开本指引不会下载或加载模型。开始下载前，请查看文件大小和磁盘剩余空间。'),
                ]],
            ],
            links: ['api', 'setup'],
        },
        api: {
            intro: pair('Use a saved API profile for a remote service or a local model server.', '使用保存的 API 配置连接远程服务或本地模型服务。'),
            sections: [
                [pair('Connection steps', '连接步骤'), [
                    pair('Open API settings. Choose a provider and the API format it actually supports, then enter its Base URL.', '打开 API 设置。选择服务商及其实际支持的 API 格式，并填写 Base URL。'),
                    pair('Common local Base URLs: Ollama http://127.0.0.1:11434/v1 and LM Studio http://127.0.0.1:1234/v1. Use the actual address shown by your service.', '常见本地 Base URL：Ollama 为 http://127.0.0.1:11434/v1，LM Studio 为 http://127.0.0.1:1234/v1。请以实际服务显示的地址为准。'),
                    pair('Enter an API key when required. Some local services allow an empty key. Never place keys in prompts, screenshots or shared project files.', '按服务要求填写 API Key。部分本地服务允许留空。不要把密钥写入提示词、截图或共享项目文件。'),
                    pair('Fetch models or enter the exact model identifier supplied by the service. Save the configuration and use Test API.', '获取模型列表，或填写服务提供的准确模型标识。保存配置后使用“测试 API”。'),
                    pair('Enable image input only when the selected model and endpoint support it. A working text connection does not establish image support.', '只有所选模型和接口支持图片时，才启用图像输入。文本连接成功不能证明图像能力可用。'),
                ]],
                [pair('Connection problems', '连接问题'), [
                    pair('Connection refused: confirm that the service is running and reachable from the Studio server. localhost refers to that server, not the browser device.', '连接被拒绝：检查服务是否启动，以及运行 Studio 的电脑能否访问。localhost 指向该电脑，不是浏览器所在设备。'),
                    pair('Authentication or model errors: check key permissions, the model identifier and API format. A successful model-list request is not an inference test.', '认证或模型错误：检查密钥权限、模型标识及 API 格式。获取模型列表成功不等于推理测试成功。'),
                ]],
            ],
            links: ['local', 'setup'],
            actions: ['settings'],
        },
        prompt: {
            intro: pair('Write the result you want, then use translation or refinement when needed.', '描述希望得到的结果，再按需要使用翻译或智能优化。'),
            sections: [
                [pair('First use', '首次使用'), [
                    pair('Check the selected preset and mode. Editing prompts should name the intended change and what must stay unchanged.', '检查当前预置包和模式。编辑提示词应写清要修改什么，以及哪些内容需要保持不变。'),
                    pair('Choose the prompt action before executing it. Intelligent refinement needs a configured language model; manual prompts do not.', '执行前选择提示词操作。智能优化需要已配置的语言模型；手动填写提示词不需要。'),
                    pair('Review the result before generation. Keep required reference names and any format required by the selected preset.', '生成前检查优化结果，保留所选 preset 要求的参考名称及文本格式。'),
                ]],
            ],
            links: ['preset', 'setup'],
        },
        media: {
            intro: pair('Input requirements follow the selected preset and mode.', '输入要求随预置包和当前模式变化。'),
            sections: [
                [pair('Prepare media', '准备素材'), [
                    pair('Distinguish the source being edited from reference images, driving video and audio. Follow the visible slot labels; their roles are not interchangeable.', '区分被编辑的源素材、参考图、驱动视频和音频。按当前输入框的名称放置素材，各位置的作用不能互换。'),
                    pair('Check required inputs and reference limits in the preset introduction. Uploading an image does not mean the active mode will use it.', '在预置包简介中查看必需输入与参考数量限制。上传了图片不代表当前模式会使用它。'),
                    pair('In Canvas Agent, select or explicitly reference the intended nodes. Review the reference list before submitting.', '使用画布 Agent 时，选中或明确引用所需节点。提交前检查引用列表。'),
                ]],
            ],
            links: ['preset', 'image_prompt', 'image_uov', 'image_inpaint', 'image_enhance', 'mask', 'sam3', 'agent'],
        },
        image_prompt: {
            intro: pair('Use images as conditioning for a compatible generation workflow. This is different from editing the source image in Upscale or Variation or Inpaint or Outpaint.', '在兼容的生成流程中，用图片提供条件约束。这里与“放大与变化”“内外重绘”中直接修改源图的用途不同。'),
            sections: [
                [pair('Images and control types', '图片与控图类型'), [
                    pair('Upload images to the reference slots and choose a control type supported by the current preset, such as edges, depth or pose. The available types depend on the workflow; uploading a portrait alone does not enable identity matching or face swapping.', '将图片放入参考槽位，选择当前预置支持的控图类型，例如边缘、深度或姿态。可选类型取决于工作流，上传人像本身不会启用身份保持或换脸。'),
                    pair('Automatic control-type detection can update the type, Stop At and Weight when the image changes. Review the detected result; disable automatic detection before keeping your own settings.', '自动识别控图类型可能在图片变化时更新类型、“停在”和权重。请检查识别结果；需要保留手动设置时关闭自动识别。'),
                ]],
                [pair('Advanced settings and mixing', '高级设置与混合使用'), [
                    pair('Each image has its own settings. Weight controls conditioning strength; Stop At sets the sampling progress where conditioning ends, from 0 to 1. For example, 0.5 ends it halfway through the supported sampling path, not at 50% image opacity.', '每张图有独立设置。权重控制条件影响强度；“停在”表示条件参与采样的结束进度，范围为 0 到 1。例如 0.5 表示在受支持的采样流程中途停止作用，不是图片透明度 50%。'),
                    pair('More images or higher weights can introduce conflicting constraints. Begin with one image and preset defaults, then adjust one setting at a time.', '多张图或较高权重可能造成约束冲突。建议从一张图和预置默认值开始，每次只调整一项。'),
                    pair('To combine these references with Upscale or Variation or Inpaint or Outpaint, enable Mixing Image Prompt on that task page. The preset must support the combination; images in this tab are not automatically used by every task.', '要与放大、变化或重绘一起使用，请在对应任务页启用“混合图片提示”。组合方式仍需预置支持，本页上传的图片不会自动参与所有任务。'),
                ]],
            ],
            links: ['preset', 'control', 'image_uov', 'image_inpaint'],
        },
        image_uov: {
            intro: pair('Upload the source image and choose a method. Disabled leaves this operation off; opening the tab or uploading an image does not start processing.', '上传源图后选择处理方式。“不启用”表示不执行此操作，仅打开页面或上传图片不会开始处理。'),
            sections: [
                [pair('Choose the result you need', '选择需要的效果'), [
                    pair('Subtle Variation makes a gentler reinterpretation of the source; Strong Variation allows larger changes. Variation is not a promise to increase resolution or preserve the subject exactly.', '细微变化用于较温和的重新演绎，强烈变化允许更大幅度的改变。“变化”不保证提高分辨率，也不保证主体完全不变。'),
                    pair('1.5x and 2x detail upscaling increase resolution with detail regeneration in supported workflows. They can alter textures, faces and small structures.', '1.5 倍和 2 倍细节放大在受支持的流程中提高分辨率并重新生成细节，可能改变纹理、人脸和小结构。'),
                    pair('All fast upscaling uses the upscale model specified in the model configuration for non-diffusion upscaling, across all engines. Fast 2x does not perform diffusion sampling and is not detail upscaling with a lower denoising strength.', '所有快速放大都使用模型配置中指定的 upscale model（放大模型）进行非扩散放大，适用于全部引擎。2 倍快速放大不执行扩散采样，也不等于降低降噪强度的细节放大。'),
                ]],
                [pair('Strength, size and references', '强度、尺寸与参考图'), [
                    pair('When shown, denoising strength controls how far the result may depart from the source. Higher values allow more changes and may affect consistency; start with the method default. Original Size / Final Size is a read-only size preview.', '显示降噪强度时，它控制结果可以偏离源图的程度。较高值允许更多变化，可能影响一致性，建议从当前方法默认值开始。“原图尺寸 | 目标尺寸”是只读尺寸预览。'),
                    pair('Mixing Image Prompt also uses the references and control settings from Image Prompt where the preset supports it. Leave it off when you only need to process the source image.', '“混合图片提示”会在预置支持时同时使用“图片提示”页的参考图和控图设置。只需处理源图时可保持关闭。'),
                ]],
                [pair('Batch processing', '批量处理'), [
                    pair('Expand Batch and provide multiple uploaded images or a folder path on the machine running Studio. A remote browser cannot use a folder on its own computer through this server-side path field; use file upload instead.', '展开“批量处理”，上传多张图片，或填写运行 Studio 的机器上的目录路径。远程浏览器无法通过这个服务器目录输入框读取自己电脑上的文件夹，请使用文件上传。'),
                    pair('Check the method and strength on one image before Batch Start. Batch status shows progress; Batch Stop requests a stop, so check the status before starting again. Help does not start or stop a batch.', '建议用单张图片检查方法和强度后，再点击“批量开始”。进度显示在批量状态中；“批量停止”发出停止请求，再次开始前请查看状态。打开指引不会开始或停止批量任务。'),
                ]],
            ],
            links: ['upscale', 'image_prompt', 'image_enhance', 'preset'],
        },
        image_inpaint: {
            intro: pair('This page offers three methods: Improve Detail, Modify Content, and default Inpaint or Outpaint. For everyday local repairs, start with Improve Detail; choose a method and preset that support the change you need.', '本页提供细节提升、内容修改、默认内外重绘三种方法。日常局部修图最常用的是“细节提升重绘”，请按需要的改动选择方法，并使用支持对应操作的预置。'),
            sections: [
                [pair('Improve Detail: everyday local repairs', '细节提升重绘：常用的局部修图'), [
                    pair('Improve Detail (face, hand, eyes, etc.) refines existing features such as faces, hands, eyes, hair and textures while aiming to retain the source structure. Use it when the overall image is satisfactory but a small area needs clearer or more natural detail.', '“细节提升重绘（脸、手、眼睛等）”用于改善已有的人脸、手部、眼睛、发丝和纹理，尽量保留原图结构。整体画面已经满意，只想让局部细节更清晰、自然时，优先选择这个模式。'),
                    pair('Upload the source, choose Improve Detail in Method, and mask the area to refine. Use the additional prompt to describe the desired local result, for example "natural eyes, clear iris detail", then generate. Merely selecting the method does not automatically detect faces or hands; use a drawn, uploaded or generated mask to specify the area.', '上传源图，在“方法”中选择细节提升，使用蒙版标出需要修复的区域。在追加提示词中描述希望得到的局部效果，例如“自然的眼睛，清晰的虹膜细节”，再执行生成。仅选择这个模式不会自动检测脸或手，需要手绘、上传或生成蒙版来指定范围。'),
                    pair('Selecting this mode retains the source initial latent, sets denoising strength to 0.5 and Respective Field to 0.2, and clears outpaint directions. Start with these values and adjust afterward; changing the method resets related settings.', '选择此模式会保留原图初始潜空间，将降噪强度设为 0.5、重绘感受范围设为 0.2，并清空扩图方向。建议从这些值开始，再按结果调整；切换方法会重设相关参数。'),
                    pair('This is generative redrawing, not simple sharpening or non-diffusion upscaling. Higher denoising allows larger changes and can alter facial identity or texture; lower it when the repair changes too much of the original appearance.', '细节提升属于生成式重绘，不是简单锐化或非扩散放大。较高降噪强度允许更大改动，也可能改变人脸身份特征或纹理；修复后偏离原貌过多时，可降低强度。'),
                ]],
                [pair('When to choose the other methods', '另外两种方法怎么选'), [
                    pair('Modify Content (add objects, change background, etc.) is for replacing or adding content inside the selected area, such as changing clothing or a background. Describe what should appear after the edit. Its default denoising strength is 1.0, allowing more substantial reconstruction than Improve Detail; it also clears outpaint directions.', '“内容修改重绘（增加物体或改变背景等）”用于替换或增加选区内的内容，例如更换衣物或背景。提示词应描述修改后应出现的内容。默认降噪强度为 1.0，比细节提升允许更大幅度的重建；此模式也会清空扩图方向。'),
                    pair('Inpaint or Outpaint (default) is for general masked redrawing or extending the image beyond its edges. Use a mask for changes inside the image; choose this default method and select directions when extending the canvas.', '“内部或外部重绘（默认选择）”用于常规蒙版重绘或向画面边缘外扩图。修改图内内容时使用蒙版；需要扩展画面时，选择这个默认方法并设置扩图方向。'),
                ]],
                [pair('Source, mask and direction', '源图、蒙版与方向'), [
                    pair('Upload the source and paint the area to change. Normally the white mask marks the area to redraw; Invert Mask When Generating reverses it. Inspect the mask before submitting so the intended area is preserved or changed.', '上传源图并涂抹需要修改的区域。通常白色蒙版表示重绘区域；“生成时反转蒙版”会反转这个范围。提交前检查蒙版，避免把希望保留的部分作为重绘区域。'),
                    pair('Choose the inpaint method and describe the intended result in the prompt or the additional prompt when available. For outpainting, select Left, Right, Top or Bottom; outpainting generates beyond the image rather than simply resizing it.', '选择重绘方法，在提示词或可用的追加提示词中描述希望得到的结果。需要扩图时选择左、右、上、下方向；扩图会生成画面外内容，不只是调整图片尺寸。'),
                ]],
                [pair('Advanced masks', '高级蒙版'), [
                    pair('Enable Advanced Masking Features to upload a mask or generate one with a supported mask model. Detection prompts identify what to select, such as face or hand; they are not the description of the final edited appearance. Generate Mask prepares a mask, not a finished edited image.', '启用高级蒙版后，可以上传蒙版，或使用受支持的蒙版模型生成蒙版。检测提示词用于指定要选中的对象，例如 face、hand，不是修改后外观的描述。“生成蒙版”只准备蒙版，不会直接得到修图成品。'),
                    pair('Review the generated selection. Thresholds and Maximum Number of Detections affect detection; 0 means all detections. The chosen mask model may require separate files, but manual masking does not require an LLM agent.', '检查生成的选区。阈值与最大检测数量会影响检测结果，数量为 0 表示全部检测。所选蒙版模型可能需要另外的模型文件，手绘蒙版本身不需要 LLM 智能体。'),
                ]],
                [pair('Strength and context', '强度与上下文范围'), [
                    pair('Denoising strength controls redraw intensity. Respective Field controls the surrounding context used for the masked edit: 0 focuses on the masked area and 1 uses the whole image. In the supported outpaint path both use 1; these sliders are not outpaint-size controls.', '降噪强度控制重绘幅度。“重绘感受范围”控制重绘时使用的周围上下文：0 侧重蒙版区域，1 使用整图。受支持的扩图流程中这两项使用 1，它们不是扩图尺寸设置。'),
                    pair('Mixing Image Prompt combines references from Image Prompt only where supported. Additional engine and mask-boundary options are in Settings > Inpaint.', '“混合图片提示”仅在支持时结合“图片提示”页的参考条件。其他引擎与蒙版边缘参数位于“设置 > 重绘”。'),
                ]],
            ],
            links: ['mask', 'inpaint', 'image_prompt', 'preset'],
        },
        image_enhance: {
            intro: pair('Enhance combines whole-image upscaling or variation with optional region repairs. Enable Enhance to use this stage; opening a region tab alone does not enable that region.', '增强修图将整图放大或变化与可选的分区修复组合使用。启用“增强修图”后才使用这一阶段，仅打开某个区域 tab 不会启用该区域。'),
            sections: [
                [pair('Existing image or generated result', '处理已有图片或生成结果'), [
                    pair('With Enhance enabled, an uploaded image is processed directly and skips initial image generation. Without an uploaded image, a compatible workflow can enhance its generated result. Check the preset support before submitting.', '启用增强后，上传的图片会直接进入增强流程，跳过初始图片生成。不上传图片时，兼容流程可以对生成结果进行增强。提交前请检查预置是否支持。'),
                    pair('Choose the whole-image method in Upscale or Variation. Order of Processing places it before the first region repair or after the last. When processing afterward, the prompt source can be the original prompts or the last filled enhancement prompts.', '在“放大或变化”子页选择整图处理方式。“处理顺序”决定整图操作在第一次区域修复之前，还是最后一次区域修复之后执行。后置处理时，可选择使用原始提示词或最后填写的增强提示词。'),
                ]],
                [pair('Region 1 / 2 / 3', '区域 1 / 2 / 3'), [
                    pair('Enable only the regions you need, then configure each matching tab. Detection prompts select objects such as face, hand or eye; region positive and negative prompts describe the repair result. Empty region prompts reuse the original prompts.', '只启用需要的区域，再进入对应子页设置。检测提示词选择 face、hand、eye 等对象；区域正向与反向提示词描述修复结果。区域提示词为空时沿用原始提示词。'),
                    pair('The Detection group controls the mask model and detection thresholds. The Inpaint group controls the repair engine, denoising, context, mask expansion or erosion, and inversion. Inspect detection before increasing repair strength; stronger repair can change identity or texture.', '“检测”组设置蒙版模型和检测阈值；“重绘”组设置修复引擎、降噪、感受范围、蒙版扩缩和反转。增加修复强度前请检查检测范围，较强修复可能改变身份特征或纹理。'),
                ]],
                [pair('Batch processing', '批量处理'), [
                    pair('Test the enabled regions and processing order on one image, then expand Batch to upload multiple images or use a folder on the Studio server. A directory on a remote browser computer must be uploaded instead.', '用单张图片检查已启用区域和处理顺序，再展开“批量处理”上传多张图片，或填写 Studio 服务器上的目录。远程浏览器所在电脑的目录需要改用上传。'),
                    pair('Batch Start submits processing; Batch Stop requests a stop. Watch Batch status before starting another batch. Help does not enable Enhance, select regions or submit processing.', '“批量开始”提交处理，“批量停止”发出停止请求。再次开始前查看批量状态。打开指引不会启用增强、勾选区域或提交处理。'),
                ]],
            ],
            links: ['image_uov', 'image_inpaint', 'inpaint', 'preset'],
        },
        sam3: {
            intro: pair('The SAM3 Video Mask panel defines which part of a source video a compatible preset will process. Choose target tracking, fixed polygons, or an uploaded mask video. Preparing a mask does not generate the final edited video.', 'SAM3 视频蒙版面板用于指定兼容预置要处理的源视频区域。可选择目标跟踪、固定多边形或上传 mask 视频。制作蒙版不会直接生成最终编辑视频。'),
            sections: [
                [pair('Prepare the source and choose a method', '准备源视频并选择方式'), [
                    pair('Expand SAM3 Video Mask and upload the source to the left Video input. Finish any source trimming before preparing the mask. The right Mask Video area shows or accepts the mask video, not the replacement reference image.', '展开“SAM3 视频蒙版”，在左侧视频输入区上传源视频。需要裁剪时，完成裁剪后再制作蒙版。右侧“蒙版视频”区域用于预览或上传 mask 视频，不是替换参考图的位置。'),
                    pair('Track a moving person or object with Point Mode. Use Polygon Mask for an area fixed in screen coordinates. Upload a prepared mask video when you already have an accurate selection. Normally white selects the region and black leaves it unselected; the preset decides whether to replace, remove or otherwise edit that region.', '移动的人物或物体使用 Point Mode 点选跟踪；固定在画面同一位置的区域使用 Polygon Mask 多边形；已有准确选区时直接上传 mask 视频。通常白色表示选中区域、黑色表示未选中，选区用于替换、移除还是其他编辑，由当前预置决定。'),
                ]],
                [pair('Target tracking with SAM3', '使用 SAM3 跟踪目标'), [
                    pair('After the source video loads, double-click the video picture on the left to open the frames editor. Choose Point Mode and use the frame slider to find a frame where the target is clearly visible.', '源视频加载后，双击左侧视频画面打开逐帧编辑器。选择 Point Mode 点选模式，拖动帧滑块，找到目标清晰可见的一帧。'),
                    pair('Left-click inside the target to add positive points; right-click unwanted areas to add exclusion points. For face replacement, select the intended face rather than the whole person. These points initialize tracking from the selected frame; they are not a frame-by-frame hand-drawn mask.', '左键点击目标内部添加正向点，右键点击不需要的区域添加排除点。换脸时应选择目标脸部，不要把整个人都选入。这些点用于从选定帧建立跟踪，不是逐帧手绘蒙版。'),
                    pair('Confirm submits mask generation and closes the editor; it does not merely save the points. Wait for the right Mask Video preview to update, then inspect the beginning, middle, end and any occlusions. If the selection drifts or includes the wrong object, choose clearer points and regenerate before the main generation.', '点击“确认”会提交蒙版生成并关闭编辑器，不只是保存点位。等待右侧蒙版视频更新，再检查开头、中间、结尾以及遮挡处。出现漂移或误选时，重新选择更明确的点并生成蒙版，再执行主生成。'),
                    pair('Alternatively, expand SAM3 Prompt Segmentation, enter a target description such as woman or dress, and click Generate Mask. This prompt selects an object, not its replacement appearance. Point or text tracking requires the SAM3 model; a configured LLM agent is not required for point tracking.', '也可以展开“SAM3 语义分割”，输入 woman、dress 等目标描述，再点击“生成蒙版”。这里的提示词用于选择对象，不用于描述替换后的外观。点选或文字跟踪需要 SAM3 模型；点选跟踪不要求配置 LLM 智能体。'),
                ]],
                [pair('Fixed polygons without tracking', '固定多边形，不跟踪目标'), [
                    pair('In the same frames editor, switch to Polygon Mask. Left-click at least three vertices around the intended area; click near the first point or double-click to close the polygon. You can draw several polygons, and their areas are combined.', '在同一逐帧编辑器中选择 Polygon Mask。沿目标区域左键添加至少三个顶点，靠近首点点击或双击闭合多边形。可以绘制多个多边形，所有区域按并集合并。'),
                    pair('Select a polygon to edit it: drag a vertex to adjust it, click an edge to add a vertex, right-click a vertex to remove it, or right-click inside to delete the polygon. Undo, Redo and Clear operate on the current editor selections.', '选中多边形后可以拖动顶点调整，点击边线增加顶点，右键顶点删除该点，右键内部删除该多边形。撤销、重做和清空用于当前编辑器选区。'),
                    pair('Confirm creates a mask using the same polygon coordinates on every frame, without running SAM3. It does not follow object or camera movement. This suits a fixed screen area such as a stationary watermark; for a moving target use tracking or a frame-aligned mask video.', '点击“确认”会按相同多边形坐标生成所有帧的蒙版，不运行 SAM3，也不会跟随目标或镜头运动。适合固定水印等画面位置不变的区域；移动目标应使用跟踪或逐帧对齐的 mask 视频。'),
                ]],
                [pair('Upload a mask video', '手动上传 mask 视频'), [
                    pair('Upload the source video first. Upload or drop a prepared mask video into the right Mask Video area. This area accepts video files only; images and other non-video files are not supported.', '先上传源视频，再将制作好的 mask 视频上传或拖入右侧蒙版视频区域。此区域仅接受视频文件，不接受图片或其他非视频文件。'),
                    pair('An uploaded mask video is used without SAM3 tracking. For a fixed area, draw a Polygon Mask in the frames editor and confirm to generate a mask video; do not upload a still image.', '上传的 mask 视频不经过 SAM3 跟踪。固定区域可以在逐帧编辑器中绘制 Polygon Mask，确认后生成蒙版视频，不要上传静态图片。'),
                    pair('Studio matches mask size, FPS and frame count to the source. A longer mask video is truncated; a shorter one repeats its last frame. This does not track the target or align mismatched action timing. Prepare matching frames yourself and inspect the resulting preview, especially after changing or trimming the source.', 'Studio 会按源视频匹配蒙版尺寸、FPS 和帧数：过长的 mask 视频截断，过短的延续最后一帧。这不会自动跟踪目标，也不会校正动作时间错位。请自行准备对应帧，更换或裁剪源视频后尤其要检查转换后的预览。'),
                ]],
                [pair('Check the mask before the final generation', '主生成前检查蒙版'), [
                    pair('Inspect the actual mask preview, including its white/black meaning, boundaries, motion and duration. SAM3 Params such as smoothing and inversion affect mask generation; changing them does not automatically rewrite an already generated or uploaded mask.', '检查实际蒙版预览的黑白含义、边缘、运动和时长。SAM3 高级参数中的平滑、翻转等设置作用于蒙版生成，修改这些参数不会自动重写已有或已上传的 mask。'),
                    pair('Generate Mask and the editor Confirm button prepare a mask; the main Generate button runs the selected editing preset. Check replacement references and prompts before that final step. Stop requests cancellation of mask generation; a failed or cancelled attempt can leave the previous mask in place, so verify that the preview is the intended version.', '“生成蒙版”和编辑器中的“确认”用于制作 mask，主界面的“生成”才会执行所选编辑预置。执行前检查替换参考图和提示词。“停止”用于请求取消蒙版生成；失败或取消后可能仍保留旧蒙版，请确认预览确实是需要的版本。'),
                ]],
            ],
            links: ['preset', 'mask', 'media', 'models'],
        },
        mask: {
            intro: pair('Mask and condition support depend on the selected preset and mode.', '蒙版和条件控制的支持范围取决于当前预置包与模式。'),
            sections: [
                [pair('Before submitting', '提交之前'), [
                    pair('Load the source media, then use the mask or condition editor exposed by the current mode.', '上传源素材后，使用当前模式提供的蒙版或条件编辑器。'),
                    pair('Inspect the mask preview and its meaning, especially when invert is enabled. Image masks and temporal video masks are different inputs.', '检查蒙版预览及其作用，尤其注意反转选项。图片蒙版与视频时序蒙版属于不同输入。'),
                    pair('For video masks, inspect multiple frames and the selected time range. Return to the task after confirming the preview.', '视频蒙版需要检查多个画面和所选时间范围，确认预览后返回任务。'),
                ]],
            ],
            links: ['sam3', 'media', 'preset'],
        },
    };
    const taskNames = {
        text_to_image: pair('Text to image', '文生图'),
        text_to_video: pair('Text to video', '文生视频'),
        image_to_video: pair('Image to video', '图生视频'),
        multi_image_to_video: pair('Multi-image to video', '多图生视频'),
        image_audio_to_video: pair('Image and audio to video', '图片与音频生视频'),
        audio_to_video: pair('Audio to video', '音频生视频'),
        video_audio_to_video: pair('Video and audio to video', '视频与音频生成'),
        image_edit: pair('Image editing', '图片编辑'),
        multi_image_edit: pair('Multi-image editing', '多图编辑'),
        image_anime_to_real: pair('Anime to realistic image', '动漫转写实'),
        image_background_removal: pair('Remove image background', '图片去背景'),
        image_depth_estimation: pair('Image depth estimation', '图片深度估计'),
        image_detail_enhance: pair('Enhance image details', '图片细节增强'),
        image_expression_transfer: pair('Image expression transfer', '图片表情迁移'),
        image_face_swap: pair('Image face swap', '图片换脸'),
        image_object_removal: pair('Remove image objects', '图片物体移除'),
        image_object_transfer: pair('Image object transfer', '图片物体迁移'),
        image_outpaint: pair('Image outpainting', '图片扩展'),
        image_pose_extraction: pair('Extract image pose', '图片姿态提取'),
        image_pose_transfer: pair('Image pose transfer', '图片姿态迁移'),
        image_relight: pair('Image relighting', '图片重新打光'),
        image_restore: pair('Image restoration', '图片修复'),
        image_style_transfer: pair('Image style transfer', '图片风格迁移'),
        image_upscale: pair('Image upscaling', '图片放大'),
        image_view_synthesis: pair('Image view synthesis', '图片视角生成'),
        lip_sync: pair('Lip sync', '口型同步'),
        video_edit: pair('Video editing', '视频编辑'),
        video_expression_transfer: pair('Video expression transfer', '视频表情迁移'),
        video_extend: pair('Video extension', '视频续写'),
        video_face_swap: pair('Video face swap', '视频换脸'),
        video_frame_interpolation: pair('Video frame interpolation', '视频插帧'),
        video_motion_transfer: pair('Video motion transfer', '视频动作迁移'),
        video_object_removal: pair('Remove video objects', '视频物体移除'),
        video_object_replace: pair('Replace video objects', '视频物体替换'),
        video_outpaint: pair('Video outpainting', '视频扩展'),
        video_person_replace: pair('Replace video subjects', '视频人物替换'),
        video_restore: pair('Video restoration', '视频修复'),
        video_subtitle_removal: pair('Remove video subtitles', '视频字幕移除'),
        video_to_audio: pair('Video to audio', '视频配音效'),
        video_upscale: pair('Video upscaling', '视频放大'),
        video_watermark_removal: pair('Remove video watermarks', '视频水印移除'),
    };

    const taskGuides = {
        text_to_image: {
            intro: pair('Generate a new image from a written description of the subject, scene and visual style.', '根据文字描述生成新图片，适合创作人物、场景、产品图或插画。提示词描述主体、构图和希望呈现的风格。'),
            inputs: pair('A text prompt. Reference images are only needed for modes that offer image conditioning.', '文字提示词；使用带图像条件的模式时，再添加对应参考图。'),
        },
        text_to_video: {
            intro: pair('Generate a video from a description of an unfolding scene. Describe motion and camera changes as well as appearance.', '用文字描述生成视频。除了人物和场景，还要写清动作如何发展、镜头怎样移动，让内容适合在指定时长内完成。'),
            inputs: pair('A scene and action prompt, plus the requested video duration.', '场景与动作提示词，以及需要生成的视频时长。'),
        },
        image_to_video: {
            intro: pair('Animate an input image into a video, using a prompt to describe the motion and camera movement that follow.', '以输入图片为起点生成视频，用提示词说明接下来的动作和镜头变化，适合让静态画面产生运动。'),
            inputs: pair('A starting image and a motion prompt. Add end frames or other references only where the current mode supports them.', '起始图片和动作提示词；当前模式支持尾帧或其他参考图时，可按对应位置添加。'),
        },
        multi_image_to_video: {
            intro: pair('Use multiple images to guide a video, such as its subjects, keyframes or beginning and ending states.', '用多张图片引导视频中的人物、关键画面或首尾状态。不同图片的作用由当前模式决定，并非把上传图片直接做成幻灯片。'),
            inputs: pair('Images assigned to the roles shown by the current mode, and a prompt describing how the scene develops.', '按当前模式分配用途的参考图片，以及描述动作发展或画面衔接的提示词。'),
        },
        image_audio_to_video: {
            intro: pair('Generate a video using an image for appearance and an audio track for speech or timing.', '结合图片和音频生成视频：图片提供人物或场景外观，音频提供说话内容或节奏，适合制作会说话的人像等内容。'),
            inputs: pair('An appearance image and an audio file; describe any additional motion in the prompt.', '人物或场景图片、音频文件；需要额外动作时填写动作提示词。'),
        },
        audio_to_video: {
            intro: pair('Generate visuals around an audio track, with the prompt defining the scene and the actions that accompany the sound.', '围绕输入音频生成视频画面，由提示词说明场景、人物和与声音对应的动作，适合让画面配合已有声音或节奏。'),
            inputs: pair('An audio file and a description of the visuals to generate.', '音频文件，以及希望生成的画面和动作描述。'),
        },
        video_audio_to_video: {
            intro: pair('Generate a video using source footage together with an audio track. The selected mode determines how much of the source appearance and motion is retained.', '结合源视频和音频生成新视频，用于让已有画面配合新的语音或声音内容。原有动作和外观的保留方式取决于当前模式。'),
            inputs: pair('A source video and an audio file, with a prompt if the selected mode accepts one.', '源视频、音频文件；当前模式接受提示词时，再描述需要改变的内容。'),
        },
        image_edit: {
            intro: pair('Edit an existing image with instructions describing what should change and what should remain unchanged.', '通过文字指令修改已有图片，适合调整内容、环境或外观。说明需要修改的部分，也写清需要保留的人物和构图。'),
            inputs: pair('The image to edit and an editing instruction.', '待编辑图片和修改指令。'),
        },
        multi_image_edit: {
            intro: pair('Edit or combine images using additional pictures as references for appearance, objects or composition.', '结合多张图片进行编辑或合成，让参考图片提供人物外观、物体或构图。说明每张图的用途，避免参考内容混淆。'),
            inputs: pair('A source image, the relevant reference images, and an instruction assigning their roles.', '原图、所需参考图片，以及说明各图片用途的编辑指令。'),
        },
        image_anime_to_real: {
            intro: pair('Reinterpret a drawn or stylized subject as a more photographic image while using the source as an appearance reference.', '将动漫或风格化图片改绘成偏写实的画面，以原图作为人物外观和构图参考，适合尝试真人化或摄影质感。'),
            inputs: pair('A drawn or stylized image; describe the desired photographic appearance where a prompt is available.', '动漫或风格化原图；有提示词输入时，可描述希望得到的写实效果。'),
        },
        image_background_removal: {
            intro: pair('Separate the foreground subject from its background for compositing or further editing.', '将前景主体与背景分离，适合抠图、制作合成素材或为后续编辑准备主体图片。'),
            inputs: pair('The image containing the subject to keep.', '包含需要保留主体的图片。'),
        },
        image_depth_estimation: {
            intro: pair('Estimate the relative depth of an image to create a structural reference for other image workflows.', '从图片估计前后远近关系，生成可供其他图像流程使用的深度参考；深度结果不等同于精确的三维测量。'),
            inputs: pair('An image whose scene structure should be extracted.', '需要提取空间结构的图片。'),
        },
        image_detail_enhance: {
            intro: pair('Regenerate image details to improve their appearance. Fine textures may change during enhancement.', '重新生成图片中的细节，改善局部纹理和观感。增强过程中可能改变细小内容，处理后需要与原图对照。'),
            inputs: pair('The source image and the enhancement settings available in the current mode.', '需要增强的原图，以及当前模式提供的增强设置。'),
        },
        image_expression_transfer: {
            intro: pair('Adjust the expression of a portrait using expression controls or a driving reference provided by the selected mode.', '借助表情参数或驱动参考调整人像表情，适合让同一人物呈现不同神态；具体驱动方式由当前模式决定。'),
            inputs: pair('A portrait, then expression parameters or a driving reference as required by the mode.', '人像图片，以及当前模式要求的表情参数或驱动参考。'),
        },
        image_face_swap: {
            intro: pair('Replace a face in an image using an identity reference while keeping the target composition as the editing base.', '以身份参考图替换目标图片中的脸部，目标图继续提供姿态和构图。人物较多时需要明确要处理哪张脸。'),
            inputs: pair('A target image and a clear face reference, assigned to their labelled input slots.', '目标图片和清晰的脸部参考图，分别放入对应素材位置。'),
        },
        image_object_removal: {
            intro: pair('Remove an unwanted object and generate content for the area it occupied.', '移除图片中不需要的物体，并生成被移除区域的内容，适合清理画面或减少干扰元素。'),
            inputs: pair('The source image; identify the object with the mask or text selection required by the current mode.', '原图；按当前模式要求，用蒙版或文字指定要移除的对象。'),
        },
        image_object_transfer: {
            intro: pair('Bring a referenced object or appearance into a target image, such as clothing or a product.', '把参考图中的物体或外观应用到目标图片，例如服装或产品。编辑指令应明确参考对象及其在目标图中的位置。'),
            inputs: pair('A target image, an object or appearance reference, and instructions for the transfer.', '目标图、物体或外观参考图，以及迁移要求。'),
        },
        image_outpaint: {
            intro: pair('Generate content beyond the original image edges to create a wider or taller composition.', '在原图边缘之外生成新内容，扩展画面宽度或高度，适合调整构图和画幅；新增区域由模型生成。'),
            inputs: pair('The original image, the expansion area or target size, and a description of the new surroundings.', '原图、扩展区域或目标尺寸，以及新增环境的描述。'),
        },
        image_pose_extraction: {
            intro: pair('Extract a pose reference from an image for use in pose-controlled generation or editing.', '从图片提取人物姿态参考，供后续姿态控制生成或编辑使用；此任务主要输出姿态信息。'),
            inputs: pair('An image with a clearly visible pose.', '姿态清晰、肢体尽量完整的图片。'),
        },
        image_pose_transfer: {
            intro: pair('Use a pose reference to change a subject posture while using another image for appearance.', '用姿态参考调整人物的动作或站姿，由人物参考图提供外观，适合让同一角色尝试不同姿势。'),
            inputs: pair('A subject image and a pose reference, assigned according to the current input labels.', '人物图片和姿态参考，按当前素材位置的标注分别添加。'),
        },
        image_relight: {
            intro: pair('Change the lighting of an image to explore light direction, intensity or atmosphere.', '重新调整图片的打光，尝试不同光线方向、明暗关系和氛围。需要保留原背景还是重新生成背景，由当前模式决定。'),
            inputs: pair('The source image and the lighting description or controls provided by the mode.', '原图，以及当前模式提供的光照描述或打光参数。'),
        },
        image_restore: {
            intro: pair('Restore a damaged or low-quality image. Reconstructed details are estimates, not verified original information.', '改善模糊、受损或低质量图片，可用于老照片等素材的修复。重新生成的细节不代表真实还原了原始信息。'),
            inputs: pair('The image to restore; add reference pictures only when the selected restoration mode offers them.', '待修复原图；选择带参考图的修复模式时，再添加相应参考。'),
        },
        image_style_transfer: {
            intro: pair('Reinterpret an image using the visual style of a reference while retaining the source as a content guide.', '参考另一张图的视觉风格重新表现原图，适合改变画面质感和表现方式；原图提供内容，风格图提供视觉参考。'),
            inputs: pair('A content image and a style reference.', '内容原图和风格参考图。'),
        },
        image_upscale: {
            intro: pair('Increase image dimensions and reconstruct details for a larger output. Inspect faces and small text after processing.', '放大图片并重新生成细节，适合需要更大尺寸的输出。处理后重点检查人脸、细小文字和纹理是否发生变化。'),
            inputs: pair('The source image and the scale or target dimensions offered by the preset.', '原图，以及预置包提供的放大倍率或目标尺寸。'),
        },
        image_view_synthesis: {
            intro: pair('Generate another view of the subject from a reference image. Newly exposed areas are generated estimates.', '根据参考图片生成主体的其他视角，适合探索不同机位下的外观；原图看不到的部分由模型推测生成。'),
            inputs: pair('A subject image and the requested view or camera-angle controls.', '主体图片，以及目标视角描述或机位参数。'),
        },
        lip_sync: {
            intro: pair('Animate visible mouth movement to follow speech audio while using the selected visual input for appearance.', '让画面中的口型跟随语音音频，适合制作说话人物。人物外观来自当前模式使用的图片或视频素材。'),
            inputs: pair('Speech audio and the portrait image or video required by the selected mode.', '语音音频，以及当前模式要求的人像图片或视频。'),
        },
        video_edit: {
            intro: pair('Modify existing footage rather than create a video from an empty scene. Describe the changes and the content to preserve.', '以已有视频为基础修改画面内容。编辑前明确要改变什么、保留什么，并按当前模式选择需要处理的对象或片段。'),
            inputs: pair('A source video, with editing instructions and any reference or mask inputs required by the current mode.', '源视频、编辑要求，以及当前模式需要的参考素材或蒙版。'),
        },
        video_expression_transfer: {
            intro: pair('Use motion from a driving video to animate the expression of a reference portrait.', '利用驱动视频中的表情变化带动参考人像，适合把一段表情表演应用到另一张人物图片。'),
            inputs: pair('A portrait image and a driving video with clear facial movement.', '人物图片和面部动作清晰的驱动视频。'),
        },
        video_extend: {
            intro: pair('Generate a new segment after an existing video ends. Describe what happens next instead of restarting the scene.', '在已有视频结束后生成新的片段，适合延长镜头或继续动作。提示词描述接下来发生的事情，避免让场景从头重演。'),
            inputs: pair('The previous video and a continuation prompt; add reference media only where the preset supports it.', '前一段视频和续写提示词；预置包支持额外参考素材时，可按对应位置添加。'),
        },
        video_face_swap: {
            intro: pair('Replace a face throughout a video using a reference identity. Inspect motion, occlusions and transitions between frames.', '使用身份参考图替换视频中的脸部，适合保持原有表演并改变脸部外观。处理后需要检查转头、遮挡和帧间变化。'),
            inputs: pair('A source video and a face reference; choose the target face or mask if required by the mode.', '源视频和脸部参考图；当前模式要求时，选择目标脸部或制作蒙版。'),
        },
        video_frame_interpolation: {
            intro: pair('Generate intermediate frames to increase the frame rate and make motion appear smoother.', '在原有帧之间生成中间帧，提高帧率，让运动看起来更连贯。插帧与提高画面分辨率是不同处理。'),
            inputs: pair('A source video and the interpolation multiplier or target frame rate.', '源视频，以及插帧倍率或目标帧率。'),
        },
        video_motion_transfer: {
            intro: pair('Use a driving video for movement and a subject reference for appearance to generate a new performance.', '用驱动视频提供动作，用主体参考提供外观，生成新的表演画面，适合让参考角色跟随已有动作。'),
            inputs: pair('A subject reference and a driving video, assigned to their labelled input slots.', '主体参考图和动作驱动视频，分别放入对应素材位置。'),
        },
        video_object_removal: {
            intro: pair('Remove an object from footage and regenerate its occupied region across the affected frames.', '移除视频中的指定物体，并重新生成它在各帧中占据的区域，适合清理持续出现的干扰对象。'),
            inputs: pair('A source video and the target-object selection or mask required by the mode.', '源视频，以及当前模式要求的对象选择或蒙版。'),
        },
        video_object_replace: {
            intro: pair('Replace a selected object in footage using a reference or editing description while retaining the source as the motion context.', '根据参考或编辑描述替换视频中的指定对象，原视频继续提供运动和场景关系。需要检查替换对象与遮挡区域的衔接。'),
            inputs: pair('A source video, replacement references or instructions, and a target selection where required.', '源视频、替换参考或指令，以及当前模式要求的目标对象选择。'),
        },
        video_outpaint: {
            intro: pair('Generate content outside the original video frame to expand its composition while following the existing motion.', '在原视频画幅之外生成新内容，扩展画面边界并跟随原有运动，适合将视频调整为更宽或更高的构图。'),
            inputs: pair('A source video, the expansion size or area, and a description of the new surroundings.', '源视频、扩展尺寸或区域，以及新增环境的描述。'),
        },
        video_person_replace: {
            intro: pair('Replace a person in footage using a subject reference, with the original clip providing the movement and scene context.', '用参考人物替换视频中的指定人物，原视频提供动作和场景关系。与只换脸相比，此任务可能重绘更大的人物区域。'),
            inputs: pair('A source video and a subject reference; select the person or mask where required.', '源视频和人物参考图；当前模式要求时，指定人物或制作蒙版。'),
        },
        video_restore: {
            intro: pair('Regenerate degraded footage to improve its visual quality. Inspect both detail changes and consistency between frames.', '重新生成低质量视频中的画面细节，改善观感。处理后既要检查单帧细节，也要检查人物和纹理在前后帧中是否一致。'),
            inputs: pair('The video to restore and the restoration settings available in the selected mode.', '待修复视频，以及当前模式提供的修复参数。'),
        },
        video_subtitle_removal: {
            intro: pair('Remove visible subtitles from footage and reconstruct the image regions behind them.', '移除视频画面上已经显示的字幕，并重新生成字幕覆盖的区域；此任务处理画面内容。'),
            inputs: pair('A source video; identify the subtitle region if the current mode requires it.', '源视频；当前模式要求时，指定字幕所在区域。'),
        },
        video_to_audio: {
            intro: pair('Generate sound effects or ambience for existing footage. Visual guidance does not recover the original recorded sound.', '为已有视频生成与画面相关的音效或环境声，适合给无声片段配声音；生成声音不等于恢复原始录音。'),
            inputs: pair('A source video and, where supported, a description of the desired sound.', '源视频；当前模式支持时，可添加希望出现的声音描述。'),
        },
        video_upscale: {
            intro: pair('Increase video resolution and reconstruct visual details for a larger output. Review frame consistency and the final dimensions.', '提高视频分辨率并重新生成画面细节，适合制作更大尺寸的输出。处理后检查实际尺寸、人物细节和帧间一致性。'),
            inputs: pair('A source video and the scale or output size offered by the preset.', '源视频，以及预置包提供的放大倍率或输出尺寸。'),
        },
        video_watermark_removal: {
            intro: pair('Remove a visible watermark and reconstruct the covered image region in footage you are authorized to edit.', '对有权编辑的视频移除画面水印，并重新生成水印覆盖的区域。处理后需要检查背景纹理和帧间变化。'),
            inputs: pair('A source video; identify the watermark region if the current mode requires it.', '源视频；当前模式要求时，指定水印所在区域。'),
        },
    };

    const h3TwoPassPresets = new Set([
        'MiniMax-H3(I2V)', 'MiniMax-H3(R2C)', 'MiniMax-H3(R2I)', 'MiniMax-H3(R2V)', 'MiniMax-H3(T2V)',
    ]);
    const h3SamplingModes = [
        pair('Basic: generate with a single sampling stage.', '基础：单次采样生成。'),
        pair('2 pass: combine a low-resolution first sampling stage with a high-resolution second sampling stage to balance image quality and speed. This may slightly affect consistency.', '双采样：通过低分辨率一采与高分辨率二采，平衡画质与速度，可能略微影响一致性。'),
    ];
    const sam3Presets = new Set([
        'MiniMax-H3(Edit)', 'MiniMax-H3(Swap-SAM3)', 'Wan-Animate', 'Wan-Remover', 'Wan-SCAIL2-SAM3',
    ]);
    const sam3Summary = pair(
        'SAM3 mask: upload the source, then double-click its video for point tracking or fixed polygons, or upload a mask video to the right (video files only). Inspect the mask before the final generation.',
        'SAM3 蒙版：上传源视频后，双击画面选择目标点选跟踪或固定多边形，也可在右侧上传 mask 视频（仅支持视频文件）。检查蒙版后再执行主生成。'
    );

    function presetUsesSam3(state, preset, data) {
        const hidden = [state?.__scene_disvisible, state?.__engine_disvisible].flatMap(value =>
            Array.isArray(value) ? value : String(value || '').split(',')).map(value => String(value).trim());
        if (['sam3_video_mask_accordion', 'sam3_input_video', 'sam3_mask_video'].some(id => hidden.includes(id))) return false;
        if (sam3Presets.has(preset)) return true;
        const ownsScene = !state?.__scene_theme_preset || state.__scene_theme_preset === preset;
        return /sam3(?!d)/i.test(String(data.theme || ''))
            || (ownsScene && /sam3(?!d)/i.test([state?.__scene_theme, state?.__scene_task_method].filter(Boolean).join(' ')));
    }

    const presetGuides = {
        'MiniMax-H3(Region)': {
            intro: pair('Rework a selected time range in an existing video. Motion Rebuild regenerates motion and can slow it down; Face Refine improves facial detail; Tile Refine enlarges and redraws individual image regions to improve detail across the frame.', '针对已有视频的指定时间片段进行重建与细节优化。动态重建用于重新生成动作或制作慢动作；面部优化用于改善人脸细节；分区优化将画面分区放大重绘，改善全画面细节。'),
            inputs: pair('A source video, the start and end times, and a prompt describing the desired result. Optionally add up to 3 appearance reference images; no manually prepared mask is required.', '源视频、处理片段的起止时间，以及描述目标效果的提示词。可选添加最多 3 张外观参考图，无需手动制作蒙版。'),
            keyPoint: pair('Face Refine and Tile Refine merge the refined regions back at the original video dimensions. Tile enlargement is an intermediate refinement step, not an increase in output resolution. Review identity and consistency between frames after generation.', '面部优化和分区优化均将重绘区域合回原尺寸视频，分区放大不改变成片分辨率。生成后需检查人物外观与前后帧细节是否一致。'),
        },
        'MiniMax-H3(Edit)': {
            intro: pair('Edit or replace the area selected by a SAM3 temporal mask in an existing video. Define the change in text and optionally provide a replacement reference image.', '通过 SAM3 时序蒙版指定已有视频中的区域，进行局部修改或替换。用文字说明改动，也可提供替换参考图。'),
            inputs: pair('Required: a source video in the SAM3 panel and its mask. Optional: one replacement reference image in the reference-image input.', '必需：SAM3 面板中的源视频及对应蒙版。可选：在参考图输入区放置一张替换参考图。'),
        },
        'MiniMax-H3(Swap-SAM3)': {
            intro: pair('Replace the face selected by a SAM3 temporal mask using a facial reference. Select only the intended face, keeping unrelated people and areas outside the mask.', '用人脸参考图替换 SAM3 时序蒙版选中的脸部。蒙版应仅选择目标脸部，将无关人物和区域留在选区之外。'),
            inputs: pair('Required: the source video, a mask video selecting its target face, and one face reference image. Upload the reference separately from the mask video.', '必需：源视频、选中目标脸部的蒙版视频，以及一张人脸参考图。参考图与 mask 视频分别上传。'),
        },
        'Wan-Animate': {
            intro: pair('Use a SAM3 video mask and a replacement reference to replace an object, face or person. Choose the matching mode before preparing the target selection.', '结合 SAM3 视频蒙版与替换参考图，进行物体替换、换脸或人物替换。制作目标选区前，选择对应模式。'),
            inputs: pair('A source video in the SAM3 panel, its target mask, and a replacement reference appropriate to the selected mode.', 'SAM3 面板中的源视频、目标蒙版，以及与当前模式匹配的替换参考图。'),
        },
        'Wan-Remover': {
            intro: pair('Remove the object selected by a SAM3 video mask and reconstruct the vacated area. Select the unwanted content, not the area you want to keep.', '移除 SAM3 视频蒙版选中的对象，并重建被移除的区域。蒙版应选择要消除的内容，不要反过来选中希望保留的区域。'),
            inputs: pair('The source video and a mask selecting the object to remove. The right Mask Video input is for the mask video, not a replacement image.', '源视频，以及选中待移除对象的蒙版。右侧蒙版视频输入用于 mask 视频，不用于替换参考图。'),
        },
        'Wan-SCAIL2-SAM3': {
            intro: pair('Replace a character using the manually prepared SAM3-panel mask and a character reference. Use tracking, fixed polygons or a supplied mask video according to the target motion.', '使用 SAM3 面板中手动准备的蒙版和角色参考图替换人物。根据目标运动情况，选择点选跟踪、固定多边形或已有 mask 视频。'),
            inputs: pair('A source video, its target-character mask, and a character reference image in the reference input.', '源视频、对应目标人物蒙版，以及参考图输入区中的角色参考图。'),
        },
        'MiniMax-H3(R2C)': {
            intro: pair('Continue an existing video with a new segment of picture and sound. Use it to extend a shot or carry an action forward from the previous ending.', '接着已有视频的结尾生成新的画面和声音，适合延长镜头、继续人物动作或推进下一段情节。续写从前段的结束状态出发。'),
            inputs: pair('Required: the previous video. Optional: 1-9 images for identity or appearance references. No separate audio input is used in this preset.', '必需：前一段视频。可选：1 至 9 张人物或外观参考图。此预置包不使用单独上传的音频。'),
            keyPoint: pair('Video Duration is the new segment length. Append Original Video includes the previous clip; turn it off to output only the continuation.', '“视频时长”是新增片段长度。“拼接原视频”开启时输出前段与续写的合成结果，关闭时只输出续写片段。'),
            steps: [
                pair('Upload the previous clip to the source-video input. Add identity images only when additional appearance guidance is needed.', '在视频输入位置上传前一段视频；需要更多外观参考时，再添加人物或物体图片。'),
                pair('Start with Basic mode and the default 5-second duration. Describe only what happens after the existing ending.', '首次使用可选择“基础”模式和默认 5 秒时长，提示词只写视频结束之后发生的动作。'),
                pair('Set whether to append the original video, then generate. Review the join for position, direction of motion and sound continuity.', '设置是否“拼接原视频”后生成，重点检查连接处的人物位置、动作方向和声音是否自然。'),
            ],
            notes: [
                pair('The duration control allows 0.2-30 seconds of new footage, not the total length including the source.', '时长控件允许新增 0.2 至 30 秒内容，不是包含源视频在内的总时长。'),
                pair('Example: The person keeps walking forward; the camera follows, retaining the existing light and ambience.', '提示词示例：人物继续向前走，镜头跟随，保持原有光线与环境声。'),
            ],
        },
        'MiniMax-H3(Transition)': {
            intro: pair('Generate a new audiovisual passage between two videos, moving from the end of the first clip to the start of the second.', '在两段视频之间生成新的画面和声音，让前段结尾逐步过渡到后段开头，适合衔接不同动作或镜头状态。'),
            inputs: pair('Required: the preceding and following videos. Optional pictures and audio can guide the inserted middle.', '必需：前段视频和后段视频。可选图片与音频可作为中间过渡内容的参考。'),
            keyPoint: pair('Inserted Transition Duration controls the new middle, not the full result. Include Both Source Videos controls whether both originals are retained in the output.', '“插入过渡时长”控制新增的中间片段，不是成片总时长；是否包含两段源视频由对应开关决定。'),
        },
        'MiniMax-H3(R2V)': {
            intro: pair('Generate video from mixed media references, using the prompt to assign the role of each image, audio track or video.', '结合图片、音频或视频参考生成新视频，适合需要同时参考人物外观、声音和运动内容的创作。提示词应说明各素材分别提供什么信息。'),
            inputs: pair('Reference media appropriate to the goal, plus a prompt describing their roles and the scene to generate.', '与目标相关的参考素材，以及说明素材用途和目标画面的提示词。'),
        },
        GeneralAPIImage: {
            intro: pair('Generate or edit images through a configured external image API. Available tasks depend on the chosen provider and model.', '通过已配置的外部图像 API 生成或编辑图片，适合使用在线图像模型。实际可用的编辑能力取决于所选服务商和模型。'),
            inputs: pair('An image API configuration and a prompt; editing also needs the source and relevant reference images.', '图像 API 配置与提示词；编辑任务还需要原图及相应参考图片。'),
            keyPoint: pair('Configure the image service before submitting a task. Availability of a chat model does not configure this image API.', '提交任务前需要配置图像服务；已有可用的聊天模型不代表这个图像 API 已经配置完成。'),
        },
        'Depth Video': {
            intro: pair('Extract a depth-reference video from source footage using Depth Anything V2, for use in other video workflows.', '使用 Depth Anything V2 从源视频提取深度参考视频，供其他视频流程作为结构条件使用；不会按文字指令改写视频内容。'),
            inputs: pair('The video whose depth structure should be extracted.', '需要提取深度结构的源视频。'),
        },
    };

    function presetTopic(state) {
        const data = state?.__studio_help?.preset || {};
        const preset = data.preset || state?.__preset || '';
        const tasks = Array.isArray(data.tasks) ? data.tasks : [];
        const knownTasks = tasks.filter(key => Object.hasOwn(taskGuides, key));
        const dedicated = Object.hasOwn(presetGuides, preset) ? presetGuides[preset] : null;
        const sam3 = presetUsesSam3(state, preset, data);
        const guide = dedicated || taskGuides[knownTasks[0]] || {
            intro: pair('This custom preset has no declared task description. Its name alone does not identify its intended result.', '此自定义预置包尚未声明任务用途，仅凭名称无法判断它会生成或处理什么内容。'),
            inputs: pair('Input requirements have not been declared; check the preset author instructions and the visible input labels.', '尚未声明素材要求，请查看作者提供的说明及当前输入位置的标注。'),
        };
        const modes = h3TwoPassPresets.has(preset) ? h3SamplingModes : [];
        const steps = guide.steps || [
            pair('Choose the required mode before adding media. When editing, state both the intended change and what must remain unchanged.', '添加素材前选择需要的模式；编辑任务中，同时说明要修改和要保留的内容。'),
            pair('Use the preset defaults for the first result, then inspect it before adjusting quality, size or duration.', '首次生成保留预置默认参数，查看结果后再调整质量、尺寸或时长。'),
        ];
        const sections = [
            [pair('Input media', '输入素材'), [guide.inputs]],
        ];
        if (modes.length) sections.push([pair('Sampling modes', '采样模式'), modes]);
        sections.push([pair('First use', '首次使用'), steps]);
        if (sam3) sections.push(...topics.sam3.sections);
        const notes = [...(guide.notes || [])];
        if (guide.keyPoint) notes.unshift(guide.keyPoint);
        notes.push(pair('If model files are missing, use the model check and the installation guide before generation. The help dialog does not install or load models.', '模型文件缺失时，生成前查看模型检查和安装指引。打开帮助不会安装或加载模型。'));
        sections.push([pair('Important details', '使用要点'), notes]);
        if (!dedicated && knownTasks.length > 1) {
            sections.push([pair('Other declared tasks', '还支持的任务'), knownTasks.slice(1).map(key => taskGuides[key].intro)]);
        }
        return {
            title: preset || text(titles.preset, state),
            intro: text(guide.intro, state),
            inputs: text(guide.inputs, state),
            keyPoint: [guide.keyPoint, sam3 ? sam3Summary : null].filter(Boolean).map(value => text(value, state)).join(' '),
            mode: modes.map(mode => text(mode, state)).join(' '),
            sections,
            links: sam3 ? ['sam3', 'media', 'prompt', 'models'] : ['media', 'prompt', 'setup'],
        };
    }

    function availability(status) {
        if (!status || typeof status !== 'object') return '';
        if (status.reason) return status.reason;
        if (status.state === 'missing' || (status.ready === false && Number(status.missing_count) > 0)) return 'files_missing';
        if (status.vision_status === 'missing') return 'vision_missing';
        if (status.state === 'config_missing' || status.state === 'unconfigured' || (status.state === 'custom' && status.ready === false)) return 'api_missing';
        if (status.ready === false || status.ok === false) return 'unavailable';
        return '';
    }
    const notices = {
        files_missing: pair('The selected model has missing files.', '当前所选模型缺少文件。'),
        api_missing: pair('The selected API configuration is incomplete.', '当前所选 API 配置不完整。'),
        vision_missing: pair('Vision files are missing; image understanding is unavailable.', '缺少视觉模型文件，图像理解暂不可用。'),
        unavailable: pair('The selected model is not ready. Check its configuration and reported error.', '当前所选模型未就绪，请检查配置及错误提示。'),
    };
    const api = { text, titles, topics, cfgSummary, taskNames, taskGuides, presetTopic, availability, notices };
    root.SimpAIStudioHelpContent = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
