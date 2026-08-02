(function () {
    'use strict';

    const params = new URLSearchParams(window.location.search || '');
    const rawLang = String(params.get('__lang') || 'en').trim().toLowerCase();
    const lang = rawLang.startsWith('en') ? 'en' : 'cn';

    const PAIRS = [
        ['LayerForge Editor', 'LayerForge 编辑器'],
        ['Save and Close', '保存并关闭'],
        ['Cancel', '取消'],
        ['Color Brush', '彩色画笔'],
        ['Eraser', '橡皮擦'],
        ['Pen Selection', '钢笔选区'],
        ['New Layer', '新建层'],
        ['Clear Layer', '清空层'],
        ['Ready', '就绪'],
        ['Pen selection written to mask', '钢笔选区已写入遮罩'],
        ['Pen selection: click to add points, double-click or click the first point to finish, Alt to undo the last point', '钢笔选区：单击添加点，双击或点击首点完成，Alt 撤销上一点'],
        ['Pen selection: click to add points, double-click or click the first point to finish', '钢笔选区：单击添加点，双击或点击首点完成'],
        ['Open in editor', '在编辑器中打开'],
        ['Layers panel', '图层面板'],
        ['Keep aspect ratio', '等比缩放'],
        ['Add Image', '添加图像'],
        ['Add image from file', '从文件添加图像'],
        ['Import Input', '导入输入'],
        ['Import image from another node', '从其他节点导入图像'],
        ['Paste Image', '粘贴图像'],
        ['Paste image from clipboard', '从剪贴板粘贴图像'],
        ['Clipboard: Clipspace', '剪贴板：Clipspace'],
        ['Clipboard: System', '剪贴板：系统'],
        ['System', '系统'],
        ['Auto Fit Output', '自动调整输出'],
        ['Fit output area to selected layers', '自动调整输出区域以适应选定图层'],
        ['Select one or more layers first', '请先选择一个或多个图层'],
        ['Unable to calculate a valid output area size', '无法计算有效的输出区域尺寸'],
        ['Output Area Size', '输出区域大小'],
        ['Transform output area - drag handles to resize', '变换输出区域 - 拖动手柄调整大小'],
        ['Click and drag a handle to resize the output area. Click elsewhere to exit.', '点击并拖动手柄以调整输出区域大小。点击其他位置退出。'],
        ['Remove Layer', '移除图层'],
        ['Remove selected layers', '移除选定图层'],
        ['Move Layer Up', '图层上移'],
        ['Move selected layers up', '上移选定图层'],
        ['Move Layer Down', '图层下移'],
        ['Move selected layers down', '下移选定图层'],
        ['Merge Layers', '合并图层'],
        ['Merge selected layers into one layer', '将选定图层合并为单个图层'],
        ['Switch selected layers between transform and crop modes', '在变换和裁剪模式之间切换选定图层'],
        ['Crop', '裁剪'],
        ['Transform', '变换'],
        ['Rotate +90°', '旋转 +90°'],
        ['Rotate selected layers by +90 degrees', '将选定图层旋转 +90 度'],
        ['Scale Up +5%', '放大 +5%'],
        ['Scale selected layers up by 5%', '将选定图层放大 5%'],
        ['Scale Down -5%', '缩小 -5%'],
        ['Scale selected layers down by 5%', '将选定图层缩小 5%'],
        ['Flip Horizontal', '水平镜像'],
        ['Flip selected layers horizontally', '水平镜像选定图层'],
        ['Flip Vertical', '垂直镜像'],
        ['Flip selected layers vertically', '垂直镜像选定图层'],
        ['Remove Background', '抠图'],
        ['Remove the background from the selected layer', '对选定图层执行背景移除'],
        ['The background-removal model must be downloaded first. It will download automatically when you continue (internet connection required).', '需要先下载抠图模型。这将在您继续时自动发生（需要互联网连接）。'],
        ['The background-removal model (about 1 GB) must be downloaded once. Continue?', '需要下载抠图模型（约 1GB）。这是一次性下载。您要继续吗？'],
        ['Downloading the background-removal model... This may take a few minutes.', '正在下载抠图模型... 这可能需要几分钟。'],
        ['Starting background removal...', '开始背景移除过程...'],
        ['Select exactly one image layer for background removal.', '请选择且仅选择一个图像图层进行抠图。'],
        ['Failed to download the background-removal model. Check your internet connection and try again.', '下载抠图模型失败。请检查您的互联网连接并重试。'],
        ['Model loading error. Check the console for details.', '模型加载错误。请检查控制台以获取详细信息。'],
        ['Required dependencies are missing.', '缺少所需的依赖项。'],
        ['Unable to locate the selected layer', '无法定位所选图层'],
        ['Background removed successfully!', '背景移除成功！'],
        ['Smart Cutout', '智能抠图'],
        ['Use SAM3 for interactive point selection (right-click adds a negative point)', '使用 SAM3 通过点选进行交互式抠图（右键为负样本）'],
        ['The SAM3 model must be downloaded first. It will download automatically when you continue (internet connection required).', '需要先下载 SAM3 模型。这将在您继续时自动发生（需要互联网连接）。'],
        ['The SAM3 model (about 3.2 GB) must be downloaded once. Continue?', '需要下载 SAM3 模型（约 3.2GB）。这是一次性下载。要继续吗？'],
        ['Downloading the SAM3 model... This may take a few minutes.', '正在下载 SAM3 模型... 这可能需要几分钟。'],
        ['SAM3 model is unavailable', 'SAM3 模型不可用'],
        ['Select exactly one image layer for Smart Cutout', '请选择且仅选择一个图像图层进行智能抠图'],
        ['Left-click to add green points; right-click to add red points; click Confirm to generate a layer', '左键添加绿色点；右键添加红色点；点击“确认”生成图层'],
        ['Undo', '撤销'],
        ['Redo', '重做'],
        ['Clear', '清空'],
        ['Invert Mask', '反向蒙版'],
        ['Confirm', '确认'],
        ['Live Generate', '实时生成'],
        ['Close Edges', '边缘闭合'],
        ['Fill Holes', '填充孔洞'],
        ['Merge into Mask', '合并到蒙版'],
        ['Loading...', '正在加载...'],
        ['Generating mask...', '正在生成蒙版...'],
        ['The first run will load the model and generate a mask...', '首次运行将加载模型并生成蒙版...'],
        ['Smart Cutout finished and created a new layer!', '智能抠图完成，已生成新图层！'],
        ['Unknown error', '未知错误'],
        ['Pose Editor', '骨骼编辑'],
        ['Detect OpenPose and edit the skeleton on the selected layer', '对选定图层执行 OpenPose 检测并编辑骨骼'],
        ['Required OpenPose model files are missing', '缺少 OpenPose 模型文件'],
        ['Required ONNX model files were not found. Allow automatic download?', '未检测到所需的 ONNX 模型文件。是否允许自动下载？'],
        ['OpenPose model is unavailable', 'OpenPose 模型不可用'],
        ['Select exactly one image layer for pose editing', '请选择且仅选择一个图像图层进行骨骼编辑'],
        ['Select the main layer or a Pose layer for pose editing', '请选择主图层或 Pose 图层进行骨骼编辑'],
        ['Running OpenPose detection...', '正在进行 OpenPose 检测...'],
        ['No valid pose_json was returned', '未获取到有效的 pose_json'],
        ['Pose editing cancelled', '已取消骨骼编辑'],
        ['Unable to create the background canvas', '无法创建背景画布'],
        ['Unable to locate the pose layer', '无法定位骨骼图层'],
        ['Pose layer updated', '骨骼图层已更新'],
        ['Pose layer created', '骨骼图层已创建'],
        ['An unknown error occurred', '发生未知错误'],
        ['Undo the last operation', '撤销上一步操作'],
        ['Redo the last undone operation', '重做上一步撤销的操作'],
        ['Toggle mask overlay visibility on the canvas (the mask still affects output when hidden)', '切换画布上的遮罩叠加层可见性 (禁用时遮罩仍会影响输出)'],
        ['Edit Mask', '编辑遮罩'],
        ['Open the current canvas view in the mask editor', '在遮罩编辑器中打开当前画布视图'],
        ['Draw Mask', '绘制遮罩'],
        ['Toggle mask drawing mode', '切换遮罩绘制模式'],
        ['Mask Opacity:', '遮罩不透明度:'],
        ['Size:', '大小:'],
        ['Strength:', '强度:'],
        ['Hardness:', '硬度:'],
        ['Clear Mask', '清除遮罩'],
        ['Clear the entire mask', '清除整个遮罩'],
        ['Are you sure you want to clear the mask?', '您确定要清除遮罩吗？'],
        ['Run GC', '运行GC'],
        ['Run garbage collection to clean unused images', '运行垃圾回收以清理未使用的图像'],
        ['An error occurred while running garbage collection. Check the console for details.', '运行垃圾回收时出错。请检查控制台以获取详细信息。'],
        ['Clear Cache', '清除缓存'],
        ['Clear all saved canvas states from browser storage', '从浏览器存储中清除所有保存的画布状态'],
        ['Are you sure you want to clear all saved canvas states? This cannot be undone.', '您确定要清除所有保存的画布状态吗？此操作无法撤销。'],
        ['Canvas cache cleared successfully!', '画布缓存已成功清除！'],
        ['An error occurred while clearing the canvas cache. Check the console for details.', '清除画布缓存时出错。请检查控制台以获取详细信息。'],
        ['Keep aspect ratio: On', '等比缩放：开'],
        ['Keep aspect ratio: Off', '等比缩放：关'],
        ['Close editor (ESC)', '关闭编辑器 (ESC)'],
        ['Open in Mask Editor', '在遮罩编辑器中打开'],
        ['Open Image', '打开图像'],
        ['Open Image with Alpha Mask', '打开带有 Alpha 遮罩的图像'],
        ['Copy Image', '复制图像'],
        ['Copy Image with Alpha Mask', '复制带有 Alpha 遮罩的图像'],
        ['Save Image', '保存图像'],
        ['Save Image with Alpha Mask', '保存带有 Alpha 遮罩的图像'],
        ['Layers', '图层'],
        ['Toggle all layer visibility', '切换所有图层可见性'],
        ['Delete layer', '删除图层'],
        ['Toggle layer visibility', '切换图层可见性'],
        ['No layer selected', '未选择图层'],
        ['Hidden', '隐'],
        ['Normal', '正常'],
        ['Multiply', '正片叠底'],
        ['Screen', '滤色'],
        ['Overlay', '叠加'],
        ['Darken', '变暗'],
        ['Lighten', '变亮'],
        ['Color Dodge', '颜色减淡'],
        ['Color Burn', '颜色加深'],
        ['Hard Light', '强光'],
        ['Soft Light', '柔光'],
        ['Difference', '差值'],
        ['Exclusion', '排除'],
        ['Blend Area', '混合区域'],
        ['Select at least two layers to merge.', '请至少选择2个图层进行合并。'],
        ['Unable to merge layers: calculated size is invalid.', '无法合并图层：计算出的尺寸无效。'],
        ['Custom output area active', '自定义输出区域激活'],
        ['Minimize menu', '最小化菜单'],
        ['Automatically apply shape mask', '自动应用形状遮罩'],
        ['Automatically apply the mask from the custom output shape to all layers inside its bounds.', '根据自定义输出区域形状自动应用遮罩。启用后，遮罩将应用于形状边界内的所有图层。'],
        ['Expand / Contract Mask', '扩展/收缩遮罩'],
        ['Dilate (expand) or erode (contract) the shape mask. Positive values expand it outward; negative values contract it inward.', '扩张（扩展）或侵蚀（收缩）形状遮罩。正值向外扩展遮罩，负值向内收缩。'],
        ['Expansion:', '扩展量：'],
        ['Feather Edges', '羽化边缘'],
        ['Soften shape-mask edges with an opaque-to-transparent gradient.', '通过创建从不透明到透明的渐变过渡来柔化形状遮罩的边缘。'],
        ['Feather Amount:', '羽化程度:'],
        ['Extend Output Area', '扩展输出区域'],
        ['Extend output bounds in each direction without changing the custom shape.', '允许在不改变自定义形状的情况下向各个方向扩展输出区域边界。'],
        ['Top Extension:', '顶部扩展:'],
        ['Bottom Extension:', '底部扩展:'],
        ['Left Extension:', '左侧扩展:'],
        ['Right Extension:', '右侧扩展:'],
        ['Previous', '上一张'],
        ['Next', '下一张'],
        ['Cancel All', '全部取消'],
        ['Close', '关闭'],
        ['Success', '成功'],
        ['Error', '错误'],
        ['Information', '信息'],
        ['Warning', '警告'],
        ['Notice', '提示'],
        ['Copy Error', '复制错误'],
        ['Error details copied!', '错误信息已复制！'],
        ['Layer pasted from the internal clipboard', '图层已从内部剪贴板粘贴'],
        ['No valid image found in Clipspace or the system clipboard', '在 Clipspace 或系统剪贴板中未找到有效图像'],
        ['No valid image found in the clipboard', '剪贴板中未找到有效图像'],
        ['Image pasted from Clipspace', '已从 Clipspace 粘贴图像'],
        ['Image loaded from file path', '已从文件路径加载图像'],
        ['Image pasted from the system clipboard', '已从系统剪贴板粘贴图像'],
        ['Image pasted from clipboard (base64)', '已从剪贴板粘贴图像 (base64)'],
        ['Failed to load base64 image from clipboard', '从剪贴板加载 base64 图像失败'],
        ['Error while processing a base64 image from the clipboard', '处理剪贴板中的 base64 图像时出错'],
        ['Image loaded from URL', '已从 URL 加载图像'],
        ['Image loaded from selected file', '已从所选文件加载图像'],
        ['Tip: You can also drag files directly onto the canvas', '提示：您也可以直接将文件拖放到画布上'],
        ['Blob object is required', '需要 Blob 对象'],
        ['Blob object cannot be empty', 'Blob 对象不能为空'],
        ['Failed to load the uploaded image', '加载上传的图像失败'],
        ['Unsupported Canvas type', '不支持的 Canvas 类型'],
        ['Failed to create Canvas Blob', '生成 Canvas Blob 失败'],
        ['Canvas object is required', '需要 Canvas 对象'],
        ['Canvas does not support mask operations', 'Canvas 不支持遮罩操作'],
        ['Failed to create a Canvas Blob with mask', '生成带遮罩的 Canvas Blob 失败'],
        ['Input image or mask node is not connected', '未连接输入图像或遮罩节点'],
        ['Input image imported', '已导入输入图像'],
        ['SAM detector closed. No mask was applied.', 'SAM 检测器已关闭。未应用遮罩。'],
        ['SAM detector mask applied to LayerForge!', 'SAM 检测器遮罩已应用到 LayerForge！'],
        ['Show Background', '显示底图'],
        ['Bold Skeleton', '加粗骨骼'],
        ['Use the mouse wheel to zoom, middle-drag to pan, and drag keypoints to adjust the pose', '滚轮缩放，中键拖动平移，拖动关节点调整姿势'],
        ['Complete Missing Points', '补全'],
        ['Delete Point', '删点'],
        ['Person', '人物'],
        ['Canvas Controls', '画布控制'],
        ['Clipboard & I/O', '剪贴板 & I/O'],
        ['Layer Interaction', '图层交互'],
        ['Transform Handles (Selected Layers)', '变换手柄 (选定图层)'],
        ['Mask Mode', '遮罩模式'],
        ['Pan canvas view', '平移画布视图'],
        ['Zoom in/out', '放大/缩小视图'],
        ['Shift + Click (background)', 'Shift + 点击 (背景)'],
        ['Start resizing the canvas area', '开始调整画布区域大小'],
        ['Shift + Ctrl + Click', 'Shift + Ctrl + 点击'],
        ['Start moving the entire canvas', '开始移动整个画布'],
        ['Shift + S + Left Click', 'Shift + S + 左键点击'],
        ['Draw a custom output-area shape', '绘制自定义输出区域形状'],
        ['Click (background)', '单击 (背景)'],
        ['Deselect all layers', '取消选择所有图层'],
        ['Close fullscreen editor mode', '关闭全屏编辑器模式'],
        ['Copy selected layers', '复制选定图层'],
        ['Paste from clipboard (image or internal layer)', '从剪贴板粘贴 (图像或内部图层)'],
        ['Drop image files', '拖放图像文件'],
        ['Add images as new layers', '添加图像为新图层'],
        ['Move selected layers', '移动选定图层'],
        ['Ctrl + Click', 'Ctrl + 点击'],
        ['Add/remove layers from the selection', '添加/移除图层选择'],
        ['Alt + Drag', 'Alt + 拖动'],
        ['Clone selected layers', '克隆选定图层'],
        ['Right Click', '右键点击'],
        ['Show the blend mode and opacity menu', '显示混合模式和不透明度菜单'],
        ['Scale layers (snap to grid)', '缩放图层 (吸附到网格)'],
        ['Ctrl + Mouse Wheel', 'Ctrl + 鼠标滚轮'],
        ['Fine-scale layers', '精细缩放图层'],
        ['Shift + Mouse Wheel', 'Shift + 鼠标滚轮'],
        ['Rotate layers by 5°', '旋转图层 5°'],
        ['Shift + Ctrl + Mouse Wheel', 'Shift + Ctrl + 鼠标滚轮'],
        ['Snap rotation to 5° increments', '吸附旋转到 5° 增量'],
        ['Move layers by 1px', '移动图层 1px'],
        ['Shift + Arrow Keys', 'Shift + 方向键'],
        ['Move layers by 10px', '移动图层 10px'],
        ['or', '或'],
        ['Rotate by 1°', '旋转 1°'],
        ['Rotate by 10°', '旋转 10°'],
        ['Delete selected layers', '删除选定图层'],
        ['Drag a corner/edge', '拖动角/边'],
        ['Resize layers', '调整图层大小'],
        ['Drag the rotation handle', '拖动旋转手柄'],
        ['Rotate layers', '旋转图层'],
        ['Hold Shift', '按住 Shift'],
        ['Keep aspect ratio / snap rotation to 15°', '保持纵横比 / 吸附旋转到 15°'],
        ['Hold Ctrl', '按住 Ctrl'],
        ['Snap to grid', '吸附到网格'],
        ['Draw on the mask', '在遮罩上绘制'],
        ['Use the sliders to control brush', '使用滑块控制画笔'],
        ['Size', '大小'],
        ['Strength', '强度'],
        [', and', ', 和'],
        ['Hardness', '硬度'],
        ['Remove the entire mask', '移除整个遮罩'],
        ['Click the "Draw Mask" button again', '再次点击 "绘制遮罩" 按钮'],
        ['System Clipboard Mode', '系统剪贴板模式'],
        ['ComfyUI Clipspace Mode', 'ComfyUI Clipspace 模式'],
        ['📋 System Clipboard Mode', '📋 系统剪贴板模式'],
        ['📋 ComfyUI Clipspace Mode', '📋 ComfyUI Clipspace 模式'],
        ['Copy selected layers to the internal clipboard +', '复制选定图层到内部剪贴板 +'],
        ['as a flattened image', '作为扁平化图像'],
        ['System Clipboard', '系统剪贴板'],
        ['1️⃣ Internal clipboard (copied layers)', '1️⃣ 内部剪贴板 (复制的图层)'],
        ['2️⃣ System clipboard (images, screenshots)', '2️⃣ 系统剪贴板 (图像, 截图)'],
        ['3️⃣ System clipboard (file paths, URLs)', '3️⃣ 系统剪贴板 (文件路径, URLs)'],
        ['2️⃣ ComfyUI Clipspace (workflow images)', '2️⃣ ComfyUI Clipspace (工作流图像)'],
        ['3️⃣ System clipboard (fallback)', '3️⃣ 系统剪贴板 (后备)'],
        ['Same as Ctrl+V, but follows the fit_on_add setting', '同 Ctrl+V 但遵循 fit_on_add 设置'],
        ['Load images directly from files', '直接从文件加载图像'],
        ['For external images, the "Paste Image" button may not work because of browser security restrictions. Use Ctrl+V or drag and drop.', '针对外部图像的 "粘贴图像" 按钮可能因浏览器安全限制而无法工作。请使用 Ctrl+V 或拖放。'],
        ['Screenshots, copied images, file paths, and URLs.', '处理截图, 复制的图像, 文件路径和 URLs。'],
        ['ComfyUI workflow integration and image transfer between nodes', 'ComfyUI 工作流集成和节点间图像传输'],
        ['Click + Drag', '点击 + 拖动'],
        ['Mouse Wheel', '鼠标滚轮'],
        ['Middle Button + Drag', '中键 + 拖动'],
        ['Arrow Keys', '方向键'],
        ['Drag and Drop', '拖放'],
        ['Priority:', '优先级:'],
        ['Security note:', '安全提示:'],
        ['Best for:', '最适合:'],
        ['Brush Controls', '画笔控制'],
        ['Exit Mode', '退出模式']
    ];

    const enToCn = new Map(PAIRS.map(([en, cn]) => [en, cn]));
    const cnToEn = new Map(PAIRS.map(([en, cn]) => [cn, en]));
    const dynamicRules = [
        [/^钢笔选区：(\d+) 个点$/, 'Pen selection: $1 points'],
        [/^输出区域已调整为 (.+)$/, 'Output area resized to $1'],
        [/^删除 (\d+) 个选定图层$/, 'Delete $1 selected layers'],
        [/^人物 (\d+)$/, 'Person $1'],
        [/^混合模式: (.+)$/, 'Blend mode: $1'],
        [/^导入输入失败: (.+)$/, 'Failed to import input: $1'],
        [/^导入输入图像失败: (.+)$/, 'Failed to import input image: $1'],
        [/^导入最新图像失败: (.+)$/, 'Failed to import latest image: $1'],
        [/^合并图层时出错: (.+)$/, 'Error while merging layers: $1'],
        [/^检查模型时出错: (.+)$/, 'Error while checking the model: $1'],
        [/^抠图失败: (.+)$/, 'Background removal failed: $1'],
        [/^合并到蒙版失败: (.+)$/, 'Failed to merge into mask: $1'],
        [/^生成图层失败: (.+)$/, 'Failed to generate layer: $1'],
        [/^智能抠图失败: (.+)$/, 'Smart Cutout failed: $1'],
        [/^骨骼编辑失败: (.+)$/, 'Pose editing failed: $1'],
        [/^应用 SAM 遮罩失败: (.+)$/, 'Failed to apply SAM mask: $1'],
        [/^上传图像失败: (.+)$/, 'Failed to upload image: $1'],
        [/^垃圾回收完成！\n跟踪的图像: (\d+)\n总引用: (\d+)\n操作: (.+)$/, 'Garbage collection complete!\nTracked images: $1\nTotal references: $2\nOperations: $3'],
        [/^从 URL 加载图像失败\n链接可能不正确或未指向图像文件。: (.+)$/, 'Failed to load image from URL\nThe link may be incorrect or may not point to an image file: $1'],
        [/^画布缓存已成功清除！$/, 'Canvas cache cleared successfully!'],
        [/^Person (\d+)$/, '人物 $1'],
        [/^Pen selection: (\d+) points$/, '钢笔选区：$1 个点'],
        [/^Output area resized to (.+)$/, '输出区域已调整为 $1'],
        [/^Delete (\d+) selected layers$/, '删除 $1 个选定图层'],
        [/^Blend mode: (.+)$/, '混合模式: $1'],
        [/^Garbage collection complete!\nTracked images: (\d+)\nTotal references: (\d+)\nOperations: (.+)$/, '垃圾回收完成！\n跟踪的图像: $1\n总引用: $2\n操作: $3']
    ];

    function getLang() {
        return lang;
    }

    function t(en, cn) {
        return lang === 'en' ? String(en ?? '') : String(cn ?? en ?? '');
    }

    function translateCore(value) {
        const text = String(value || '');
        const exact = lang === 'en' ? cnToEn.get(text) : enToCn.get(text);
        if (exact !== undefined) return exact;
        for (const [pattern, replacement] of dynamicRules) {
            const sourceIsChinese = /[\u4e00-\u9fff]/.test(pattern.source);
            if ((lang === 'en') !== sourceIsChinese) continue;
            if (pattern.test(text)) return text.replace(pattern, replacement);
        }
        return text;
    }

    function translateText(value) {
        const text = String(value ?? '');
        if (!text.trim()) return text;
        const leading = text.match(/^\s*/)?.[0] || '';
        const trailing = text.match(/\s*$/)?.[0] || '';
        const core = text.slice(leading.length, text.length - trailing.length);
        return `${leading}${translateCore(core)}${trailing}`;
    }

    function localizeAttributes(element) {
        if (!(element instanceof Element)) return;
        for (const name of ['title', 'placeholder', 'aria-label']) {
            if (!element.hasAttribute(name)) continue;
            const current = element.getAttribute(name) || '';
            const next = translateText(current);
            if (next !== current) element.setAttribute(name, next);
        }
    }

    function localizeElement(root) {
        if (!root) return;
        if (root.nodeType === Node.TEXT_NODE) {
            const parentName = root.parentElement?.tagName || '';
            if (parentName === 'SCRIPT' || parentName === 'STYLE') return;
            const next = translateText(root.textContent || '');
            if (next !== root.textContent) root.textContent = next;
            return;
        }
        if (!(root instanceof Element) && root !== document) return;
        if (root instanceof Element) localizeAttributes(root);
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            if (node.nodeType === Node.TEXT_NODE) {
                const parentName = node.parentElement?.tagName || '';
                if (parentName === 'SCRIPT' || parentName === 'STYLE') continue;
                const next = translateText(node.textContent || '');
                if (next !== node.textContent) node.textContent = next;
            } else {
                localizeAttributes(node);
            }
        }
    }

    const nativeAlert = window.alert.bind(window);
    const nativeConfirm = window.confirm.bind(window);
    window.alert = (message) => nativeAlert(translateText(message));
    window.confirm = (message) => nativeConfirm(translateText(message));

    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    window.LayerForgeI18n = { getLang, t, translateText, localizeElement };
    localizeElement(document.documentElement);

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'characterData') {
                localizeElement(mutation.target);
            } else if (mutation.type === 'attributes') {
                localizeAttributes(mutation.target);
            } else {
                mutation.addedNodes.forEach(localizeElement);
            }
        }
    });
    observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['title', 'placeholder', 'aria-label']
    });
})();
