// tag_cart.js - Refactored with Fixed Layout, Preset Categories, and LAZY LOADING

// 声明 appRootInstance 在外部作用域
let appRootInstance;
let fullTagMap = new Map(); // [新增点 1] 声明一个全局的Map变量，用于快速查找标签
let simpleaiTagAssistantBootStarted = false;

// 将所有核心逻辑封装到一个函数中
function initializeTagAssistantLogic() {
    console.log("initializeTagAssistantLogic started.");

    // ==================== 样式配置 ====================
    // [新增] 为加载指示器添加样式
    const newStyles = `
        .loading-indicator, .error-indicator {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100%;
            font-size: 1rem;
            color: #888;
        }
        /* [新增点 2] 为“未匹配标签”添加特殊样式 */
        .unmatched-tag {
            /* 使用CSS变量，使其能自适应亮/暗主题的背景色 */
            background-color: var(--neutral-100, #F3F4F6); /* 亮色主题下的背景色 */
            border: 1px dashed var(--neutral-400, #A3A3A3); /* 添加虚线边框以示区分 */
            color: var(--neutral-500, #737373); /* 文字颜色也变浅一些 */
        }
        [data-theme="dark"] .unmatched-tag {
            background-color: var(--neutral-800, #262626); /* 暗色主题下的背景色 */
        }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.innerText = newStyles;
    document.head.appendChild(styleSheet);


    // --- 全局状态和常量 ---
    const resolveAssetBasePath = () => {
        const scriptSrc = document.currentScript?.src || '';
        if (scriptSrc) {
            const matchedBase = scriptSrc.match(/^(.*\/(?:gradio_api\/)?file=)(?:javascript\/tag_cart\.js)(?:\?.*)?$/i);
            if (matchedBase && matchedBase[1]) {
                return matchedBase[1];
            }
        }
        return '/gradio_api/file=';
    };

    const buildAssetUrl = (relativePath) => {
        const normalized = String(relativePath || '').replace(/^\/+/, '');
        const encodedPath = normalized
            .split('/')
            .map((segment) => encodeURIComponent(segment))
            .join('/');
        return `${resolveAssetBasePath()}${encodedPath}`;
    };

    const getMetaContent = (name) => {
        const node = document.querySelector(`meta[name="${name}"]`);
        return node ? String(node.content || '').trim() : '';
    };

    const curatedCsvUrl = buildAssetUrl('tags/weilin_tagcart.csv');
    const danbooruCsvUrl = buildAssetUrl('tags/danbooru_all.csv');
    // [优化 1] 移除不再需要的远程URL
    // const giteeCsvUrl = '...';
    // const githubCsvUrl = '...';
    const customCsvUrl = getMetaContent('tag-cart-custom-tags-path') || buildAssetUrl('tags/custom_tags.csv');
    const customTagsApiUrl = '/tag-cart/custom-tags';

    const wildcardCnListUrl = buildAssetUrl('wildcards/cn_list.json');
    const wildcardCnWordsUrl = buildAssetUrl('wildcards/cn_words.json');

    // [优化 2] 简化 determineCsvUrl 函数，只使用本地路径
    async function determineCsvUrl() {
        // 根据要求，优化为仅使用本地URL，不再检查远程备份。
        // 这避免了不必要的网络请求和潜在的CORS跨域问题。
        console.log("使用本地 CSV 文件路径。");
        return curatedCsvUrl;
    }

    const TAGS_PER_PAGE = 32; // Fallback used before the tag grid is measurable.
    const DEFAULT_PROMPT_WEIGHT = 1;
    const PROMPT_WEIGHT_STEP = 0.1;
    const CATEGORIES_PER_PAGE = 13; // [修改点 4] 修改这个数字来改变每页显示的按钮数量

    // --- 全局UI文本配置 (无变化) ---
    const uiTexts = {
        // ... (内容与您提供的版本完全相同，为节省篇幅已折叠)
        searchInputPlaceholder: { zh: '搜索标签 (英文, 中文, 别名, 分类...)', en: 'Search tags (English, Chinese, aliases, categories...)' },
        draggableHandleText: { zh: '标签助手 v1.2 - 拖拽此处可移动', en: 'TagCart v1.2 - Drag Here' },
        formatButtonLabels: { 'spaces': { zh: '空格', en: 'Spaces' }, 'underscores': { zh: '下划线', en: 'Underscores' } },
        actionButtonLabels: { 'append': { zh: '追加', en: 'Append' }, 'replace': { zh: '替换', en: 'Replace' } },
        targetButtonLabels: { 'positive': { zh: '正向', en: 'Positive' }, 'negative': { zh: '反向', en: 'Negative' } },
        buttonTitles: {
            resetSearch: { zh: '清空搜索并重置类别', en: 'Clear search & reset categories' },
            copy: { zh: '发送到提示词框', en: 'Send to Prompt' },
            nsfwFilter: { zh: 'NSFW 过滤', en: 'NSFW Filter' },
            clearAll: { zh: '清空已选', en: 'Clear All Selected' },
            toggleLanguage: { zh: '切换显示语言', en: 'Toggle Display Language' }
        },
        presetCustomCategories: { // [修改点 2] 在这里添加新的自定义分类，直接删除或注释掉您不想要的那一行。添加ID标记和中英文名称。
            // 'ID'是这个分类在代码内部的唯一标识符（ID）。您的CSV文件里的<一级分类>列就需要填写这个字符串。zh 和 en 字段是它在界面上显示的中文和英文名称。
            '人物': { zh: '人物', en: 'People' },
            '服饰': { zh: '服饰', en: 'Clothing' },
            '表情动作': { zh: '表情动作', en: 'Expression & Pose' },
            '画面': { zh: '画面', en: 'Image' },
            '环境': { zh: '环境', en: 'Environment' },
            '场景': { zh: '场景', en: 'Scene' },
            '物品': { zh: '物品', en: 'Objects' },
            '镜头': { zh: '镜头', en: 'Camera' },
            '汉服': { zh: '汉服', en: 'Hanfu' },
            '魔法系': { zh: '魔法系', en: 'Magic' },
            'NSFW': { zh: 'NSFW', en: 'NSFW' },
            '自定义': { zh: '自定义', en: 'Custom' }
        },
        primaryCategoryNames: {
            'All': { zh: '全部', en: 'All' }, 'General': { zh: '通用', en: 'General' }, 'Artist': { zh: '画师', en: 'Artist' }, 'Copyright': { zh: '作品', en: 'Copyright' },
            'Character': { zh: '角色', en: 'Character' }, 'Meta': { zh: '元数据', en: 'Meta' }, 
            'Wildcard': { zh: '通配符', en: 'Wildcard' },
            'Custom': { zh: '自定义', en: 'Custom' }
        },
        secondaryCategoryNames: {
            '二次元角色': { zh: '二次元角色', en: 'Anime Characters' },
            'anime characters': { zh: '二次元角色', en: 'Anime Characters' },
            '对象': { zh: '对象', en: 'Subject' },
            'subject': { zh: '对象', en: 'Subject' },
            '年龄': { zh: '年龄', en: 'Age' },
            'age': { zh: '年龄', en: 'Age' },
            '头发': { zh: '头发', en: 'Hair' },
            'hair': { zh: '头发', en: 'Hair' },
            '嘴巴': { zh: '嘴巴', en: 'Mouth' },
            'mouth': { zh: '嘴巴', en: 'Mouth' },
            '牙齿': { zh: '牙齿', en: 'Teeth' },
            'teeth': { zh: '牙齿', en: 'Teeth' },
            '皮肤': { zh: '皮肤', en: 'Skin' },
            'skin': { zh: '皮肤', en: 'Skin' },
            '眉毛': { zh: '眉毛', en: 'Eyebrows' },
            'eyebrows': { zh: '眉毛', en: 'Eyebrows' },
            '眼睛': { zh: '眼睛', en: 'Eyes' },
            'eyes': { zh: '眼睛', en: 'Eyes' },
            'eye': { zh: '眼睛', en: 'Eyes' },
            '瞳孔': { zh: '瞳孔', en: 'Pupils' },
            'pupils': { zh: '瞳孔', en: 'Pupils' },
            'pupil': { zh: '瞳孔', en: 'Pupils' },
            '耳朵': { zh: '耳朵', en: 'Ears' },
            'ears': { zh: '耳朵', en: 'Ears' },
            'ear': { zh: '耳朵', en: 'Ears' },
            '翅膀': { zh: '翅膀', en: 'Wings' },
            'wings': { zh: '翅膀', en: 'Wings' },
            'wing': { zh: '翅膀', en: 'Wings' },
            '指甲': { zh: '指甲', en: 'Nails' },
            'nails': { zh: '指甲', en: 'Nails' },
            'nail': { zh: '指甲', en: 'Nails' },
            '鼻子': { zh: '鼻子', en: 'Nose' },
            'nose': { zh: '鼻子', en: 'Nose' },
            '胸部': { zh: '胸部', en: 'Chest' },
            'chest': { zh: '胸部', en: 'Chest' },
            '腹部': { zh: '腹部', en: 'Abdomen' },
            'abdomen': { zh: '腹部', en: 'Abdomen' },
            '面部': { zh: '面部', en: 'Face' },
            'face': { zh: '面部', en: 'Face' },
            '脸型': { zh: '脸型', en: 'Face Shape' },
            'face shape': { zh: '脸型', en: 'Face Shape' },
            '舌头': { zh: '舌头', en: 'Tongue' },
            'tongue': { zh: '舌头', en: 'Tongue' },
            '身份': { zh: '身份', en: 'Identity' },
            'identity': { zh: '身份', en: 'Identity' },
            '身材': { zh: '身材', en: 'Body Type' },
            'body type': { zh: '身材', en: 'Body Type' },
            '上杉': { zh: '上杉', en: 'Upper Garment' },
            '长衫': { zh: '长衫', en: 'Long Shirt' },
            '领子': { zh: '领子', en: 'Collar' },
            '齐胸破裙': { zh: '齐胸破裙', en: 'Broken Qixiong Skirt' },
            '齐胸褶裙': { zh: '齐胸褶裙', en: 'Pleated Qixiong Skirt' },
            '靴子': { zh: '靴子', en: 'Boots' },
            'boots': { zh: '靴子', en: 'Boots' },
            '未分类': { zh: '未分类', en: 'Uncategorized' },
            'uncategorized': { zh: '未分类', en: 'Uncategorized' }
        },
        tagTitleDefaults: {
            en: { noTranslation: 'None', noAliases: 'None', noCustomCategory: 'None', noSecondaryCategory: 'None', unknownCategory: 'Unknown Category' },
            zh: { noTranslation: '无', noAliases: '无', noCustomCategory: '无', noSecondaryCategory: '无', unknownCategory: '未知类别' }
        },
        customTagsEditor: {
            openButton: { zh: '自定义 CSV', en: 'Custom CSV' },
            editTitle: { zh: '编辑 custom_tags.csv', en: 'Edit custom_tags.csv' },
            title: { zh: '自定义标签 CSV', en: 'Custom Tags CSV' },
            hint: { zh: '每行一个自定义标签。保存时会写入 custom_tags.csv。', en: 'One row per custom tag. Save writes custom_tags.csv.' },
            reload: { zh: '重新读取', en: 'Reload' },
            save: { zh: '保存', en: 'Save' },
            close: { zh: '关闭', en: 'Close' },
            tag: { zh: '标签', en: 'Tag' },
            translation: { zh: '译名', en: 'Translation' },
            aliases: { zh: '别名', en: 'Aliases' },
            addRow: { zh: '添加行', en: 'Add Row' },
            deleteRow: { zh: '删除此行', en: 'Delete row' },
            loading: { zh: '正在读取 custom_tags.csv ...', en: 'Loading custom_tags.csv ...' },
            loadedRows: { zh: '已加载 {count} 行。', en: 'Loaded {count} rows.' },
            saving: { zh: '正在保存 custom_tags.csv ...', en: 'Saving custom_tags.csv ...' },
            saved: { zh: '已保存并重新加载。', en: 'Saved and reloaded.' },
            loadFailedStatus: { zh: '读取自定义标签失败：{status}', en: 'Failed to load custom tags: {status}' },
            saveFailedStatus: { zh: '保存自定义标签失败：{status}', en: 'Failed to save custom tags: {status}' },
            reloadFailed: { zh: '重新读取 custom_tags.csv 失败。', en: 'Failed to reload custom_tags.csv.' },
            loadFailed: { zh: '读取 custom_tags.csv 失败。', en: 'Failed to load custom_tags.csv.' },
            saveFailed: { zh: '保存 custom_tags.csv 失败。', en: 'Failed to save custom_tags.csv.' }
        }
    };

    function getInitialTagCartLang() {
        const candidates = [];
        try {
            const params = new URLSearchParams(window.location.search || '');
            candidates.push(params.get('__lang'), params.get('lang'), params.get('language'));
        } catch (error) {
            // URL parsing can fail in embedded test documents.
        }
        try {
            candidates.push(window.locale_lang);
        } catch (error) {
            // Some standalone contexts do not expose locale_lang.
        }
        try {
            candidates.push(localStorage.getItem('ailang'));
        } catch (error) {
            // localStorage may be blocked in private contexts.
        }
        candidates.push(document.documentElement.lang);
        const normalized = candidates
            .map(value => String(value || '').trim().toLowerCase())
            .find(Boolean);
        return normalized && normalized.startsWith('en') ? 'en' : 'zh';
    }

    function tagCartLang() {
        return displayEnglishOnly ? 'en' : 'zh';
    }

    function localizedText(entry, replacements = {}) {
        const lang = tagCartLang();
        let text = String(entry?.[lang] || entry?.zh || entry?.en || '');
        Object.entries(replacements || {}).forEach(([key, value]) => {
            text = text.replaceAll(`{${key}}`, String(value));
        });
        return text;
    }

    function customTagsEditorText(key, replacements = {}) {
        return localizedText(uiTexts.customTagsEditor[key], replacements);
    }
    
    // --- 全局状态变量 ---
    // [优化 3] 新增 isDataLoaded 状态标志
    let isDataLoaded = false;
    let allTags = [], filteredTags = [], selectedTags = [];
    let searchableWildcardTags = [];
    let currentPage = 1, debounceTimer;
    let isNsfwFilterActive = true, displayEnglishOnly = getInitialTagCartLang() === 'en';
    let activeFormat = 'spaces', activeAction = 'append', activeTarget = 'positive';
    
    let primaryCategories = [], secondaryCategories = new Set();
    let wildcardFilenames = {}, wildcardTranslations = {}, wildcardWordTranslations = {};
    let activePrimaryCategory = 'All', activeSecondaryCategory = null;
    let primaryCategoryPage = 1, secondaryCategoryPage = 1;

    // --- DOM 元素引用 ---
    let selectedTagsContainer, tagDisplayContainer, searchInput, resetSearchBtn, nsfwFilterBtn, clearAllBtn, copyBtn;
    let editCustomBtn;
    let importBtn; // [新增] 在这里声明 importBtn
    let paginationContainer, toggleLanguageBtn, draggableContainer, draggableHandle, closeBtn;
    let formatBtnGroup, actionBtnGroup, targetBtnGroup;
    let primaryCategoryRow, secondaryCategoryRow;
    let customTagsEditor, customTagsTableBody, customTagsStatus, customTagsPathLabel;
    let customTagsEditorTitle, customTagsEditorHint, customTagsThead;
    let customTagsSaveBtn, customTagsReloadBtn, customTagsCloseBtn, customTagsAddBtn;
    let customTagEditorRows = [];
    let tagcartResizeState = null;
    let hasCenteredTagCartOnFirstOpen = false;
    let workbenchTarget = null;
    let workbenchBaseText = '';
    let workbenchAutoWriteTimer = 0;
    let workbenchInlineMode = false;
    let workbenchCloseHandler = null;
    let tagCartCopyFeedbackTimer = 0;

    // --- 初始化函数 (无变化) ---
    function init() {
        console.log("init() started.");
        appRootInstance = document.createElement('div');
        appRootInstance.id = 'app-root';
        appRootInstance.className = 'fixed top-0 left-0 w-0 h-0 p-0 m-0 overflow-visible pointer-events-none';
        appRootInstance.style.zIndex = '2147483647';
        draggableContainer = document.createElement('div');
        draggableContainer.id = 'draggable-container';
        draggableContainer.className = 'tagcart-panel absolute flex flex-col space-y-2 p-4 bg-neutral-100 dark:bg-neutral-800 rounded-2xl shadow-lg';
        draggableContainer.style.display = 'none';
        draggableContainer.style.width = '970px';
        draggableContainer.style.minHeight = '';
        draggableContainer.style.height = 'min(650px, calc(100dvh - 20px))';
        draggableContainer.style.pointerEvents = 'auto';

        const headerContainer = document.createElement('div');
        headerContainer.className = 'tagcart-header flex justify-between items-center w-full flex-shrink-0';
        draggableHandle = document.createElement('div');
        draggableHandle.id = 'draggable-handle';
        draggableHandle.className = 'tagcart-handle flex-grow cursor-grab';
        closeBtn = document.createElement('button');
        closeBtn.id = 'close-draggable-btn';
        closeBtn.className = 'btn tagcart-close-btn p-1 rounded-md w-5 h-5 flex items-center justify-center flex-shrink-0';
        closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        closeBtn.title = '关闭';
        headerContainer.appendChild(draggableHandle);
        headerContainer.appendChild(closeBtn);
        draggableContainer.appendChild(headerContainer);
        
        selectedTagsContainer = document.createElement('div');
        selectedTagsContainer.id = 'selected-tags-container';
        selectedTagsContainer.className = 'selected-tags-surface p-2 rounded-lg h-[125px] flex flex-wrap gap-2 content-start overflow-y-auto';
        draggableContainer.appendChild(selectedTagsContainer);

        const controlBar = document.createElement('div');
        controlBar.className = 'tagcart-toolbar flex-shrink-0 flex items-center gap-3';
        const searchWrapper = document.createElement('div');
        searchWrapper.className = 'tagcart-search-wrap relative flex-grow';
        searchInput = document.createElement('input');
        searchInput.type = 'text'; searchInput.id = 'search-input'; searchInput.className = 'input-control tagcart-search-input w-full p-2 pl-4 rounded-lg h-10';
        resetSearchBtn = document.createElement('button');
        resetSearchBtn.id = 'reset-search-btn'; resetSearchBtn.className = 'absolute right-2 top-1/2 -translate-y-1/2 p-1'; resetSearchBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        searchWrapper.appendChild(searchInput); searchWrapper.appendChild(resetSearchBtn);
        controlBar.appendChild(searchWrapper);
        
        // [新增点 3] 创建并添加“导入”按钮
        // [修改] 移除 const，直接为全局变量赋值
        // [修改] 替换为这个新版本
        importBtn = document.createElement('button');
        importBtn.id = 'import-btn';

        // [核心修改]
        // 1. 添加 'flex items-center gap-2' 使其成为flex容器，并让图标和文字垂直居中、有2个单位的间距。
        // 2. 调整内边距，左右padding(px-3)比上下(py-2)稍大，更适合带文字的按钮。
        importBtn.className = 'btn tagcart-toolbar-btn tagcart-import-btn px-4 py-2 rounded-lg h-10 flex-shrink-0 flex items-center gap-2';

        // [核心修改]
        // 现在 innerHTML 同时包含图标和包裹在 <span> 中的文字
        importBtn.innerHTML = '<i class="fa-solid fa-file-import"></i> <span>从提示词读取</span>';
        importBtn.title = '从正面提示词框中读取文本，并拆分成标签'; // 添加悬停提示
        controlBar.appendChild(importBtn); // 将它添加到 controlBar

        editCustomBtn = document.createElement('button');
        editCustomBtn.id = 'custom-tags-editor-btn';
        editCustomBtn.className = 'btn tagcart-toolbar-btn px-3 py-2 rounded-lg h-10 flex-shrink-0 flex items-center gap-2';
        editCustomBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> <span></span>';
        controlBar.appendChild(editCustomBtn);

        copyBtn = document.createElement('button'); copyBtn.id = 'copy-btn'; copyBtn.className = 'btn tagcart-primary-btn px-5 py-2 rounded-lg h-10 flex-shrink-0 flex items-center justify-center gap-2'; copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i>';
        nsfwFilterBtn = document.createElement('button'); nsfwFilterBtn.id = 'nsfw-filter-btn'; nsfwFilterBtn.className = 'btn tagcart-toolbar-btn p-2 rounded-lg h-10 w-10 flex-shrink-0 active'; nsfwFilterBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
        toggleLanguageBtn = document.createElement('button'); toggleLanguageBtn.id = 'toggle-language-btn'; toggleLanguageBtn.className = 'btn tagcart-toolbar-btn p-2 rounded-lg h-10 w-10 flex-shrink-0'; toggleLanguageBtn.innerHTML = '<i class="fa-solid fa-language"></i>';
        clearAllBtn = document.createElement('button'); clearAllBtn.id = 'clear-all-btn'; clearAllBtn.className = 'btn tagcart-toolbar-btn p-2 rounded-lg h-10 w-10'; clearAllBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        controlBar.appendChild(nsfwFilterBtn); controlBar.appendChild(toggleLanguageBtn); controlBar.appendChild(clearAllBtn);
        draggableContainer.appendChild(controlBar);

        primaryCategoryRow = createCategoryRowDOM('primary-category-container', true);
        draggableContainer.appendChild(primaryCategoryRow);
        secondaryCategoryRow = createCategoryRowDOM('secondary-category-container', false);
        draggableContainer.appendChild(secondaryCategoryRow);
        
        tagDisplayContainer = document.createElement('div');
        tagDisplayContainer.id = 'tag-display-container';
        tagDisplayContainer.className = 'tagcart-tag-grid flex-grow overflow-y-auto p-1';
        draggableContainer.appendChild(tagDisplayContainer);

        const bottomWrapper = document.createElement('div');
        bottomWrapper.className = 'tagcart-footer flex-shrink-0 flex justify-between items-center w-full mt-1';
        const otherControlBar = document.createElement('div');
        otherControlBar.id = 'other-control-bar';
        otherControlBar.className = 'flex items-center gap-4';
        const footerActionBar = document.createElement('div');
        footerActionBar.className = 'tagcart-footer-actions flex items-center gap-3';
        const createButtonGroup = (valueMap, defaultValue, groupClass) => {
            const groupContainer = document.createElement('div');
            groupContainer.className = `flex items-center gap-1 p-1 rounded-lg ${groupClass} custom-group-bg`;
            Object.keys(valueMap).forEach(value => {
                const btn = document.createElement('button');
                btn.className = 'btn px-3 py-1 text-sm rounded-md';
                btn.dataset.value = value;
                if (value === defaultValue) btn.classList.add('active');
                groupContainer.appendChild(btn);
            });
            return groupContainer;
        };
        formatBtnGroup = createButtonGroup(uiTexts.formatButtonLabels, activeFormat, 'format-group');
        actionBtnGroup = createButtonGroup(uiTexts.actionButtonLabels, activeAction, 'action-group');
        targetBtnGroup = createButtonGroup(uiTexts.targetButtonLabels, activeTarget, 'target-group');
        otherControlBar.appendChild(formatBtnGroup);
        otherControlBar.appendChild(actionBtnGroup);
        otherControlBar.appendChild(targetBtnGroup);
        footerActionBar.appendChild(copyBtn);
        footerActionBar.appendChild(otherControlBar);
        bottomWrapper.appendChild(footerActionBar);
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'pagination-container';
        paginationContainer.className = 'tagcart-pagination flex-shrink-0 flex justify-center items-center gap-1';
        bottomWrapper.appendChild(paginationContainer);
        draggableContainer.appendChild(bottomWrapper);

        customTagsEditor = document.createElement('div');
        customTagsEditor.id = 'custom-tags-editor';
        customTagsEditor.className = 'tagcart-editor';
        customTagsEditor.style.display = 'none';

        const customEditorHeader = document.createElement('div');
        customEditorHeader.className = 'tagcart-editor-header';

        const customEditorTitleWrap = document.createElement('div');
        customEditorTitleWrap.className = 'tagcart-editor-title-wrap';
        customTagsEditorTitle = document.createElement('div');
        customTagsEditorTitle.className = 'tagcart-editor-title';
        customTagsPathLabel = document.createElement('div');
        customTagsPathLabel.className = 'tagcart-editor-path';
        customEditorTitleWrap.appendChild(customTagsEditorTitle);
        customEditorTitleWrap.appendChild(customTagsPathLabel);

        const customEditorActions = document.createElement('div');
        customEditorActions.className = 'tagcart-editor-actions';
        customTagsReloadBtn = document.createElement('button');
        customTagsReloadBtn.type = 'button';
        customTagsReloadBtn.className = 'btn tagcart-editor-btn';
        customTagsSaveBtn = document.createElement('button');
        customTagsSaveBtn.type = 'button';
        customTagsSaveBtn.className = 'btn tagcart-editor-btn active';
        customTagsCloseBtn = document.createElement('button');
        customTagsCloseBtn.type = 'button';
        customTagsCloseBtn.className = 'btn tagcart-editor-btn';
        customEditorActions.appendChild(customTagsReloadBtn);
        customEditorActions.appendChild(customTagsSaveBtn);
        customEditorActions.appendChild(customTagsCloseBtn);

        customEditorHeader.appendChild(customEditorTitleWrap);
        customEditorHeader.appendChild(customEditorActions);

        customTagsEditorHint = document.createElement('div');
        customTagsEditorHint.className = 'tagcart-editor-hint';

        const customTableWrap = document.createElement('div');
        customTableWrap.className = 'tagcart-editor-table-wrap';
        const customTagsTable = document.createElement('table');
        customTagsTable.className = 'tagcart-editor-table';
        customTagsThead = document.createElement('thead');
        customTagsTableBody = document.createElement('tbody');
        customTagsTable.appendChild(customTagsThead);
        customTagsTable.appendChild(customTagsTableBody);
        customTableWrap.appendChild(customTagsTable);

        const customEditorTableActions = document.createElement('div');
        customEditorTableActions.className = 'tagcart-editor-table-actions';
        customTagsAddBtn = document.createElement('button');
        customTagsAddBtn.type = 'button';
        customTagsAddBtn.className = 'btn tagcart-editor-btn';
        customEditorTableActions.appendChild(customTagsAddBtn);

        customTagsStatus = document.createElement('div');
        customTagsStatus.className = 'tagcart-editor-status';

        customTagsEditor.appendChild(customEditorHeader);
        customTagsEditor.appendChild(customTagsEditorHint);
        customTagsEditor.appendChild(customTableWrap);
        customTagsEditor.appendChild(customEditorTableActions);
        customTagsEditor.appendChild(customTagsStatus);
        draggableContainer.appendChild(customTagsEditor);
        
        appRootInstance.appendChild(draggableContainer);
        console.log("init() completed.");
    }

    // ... createCategoryRowDOM, positionDraggableContainer, setupEventListeners, etc. ...
    // ... 这些函数与您提供的版本完全相同，为节省篇幅已折叠 ...
    // ... 它们内部没有任何逻辑需要为懒加载而修改 ...
    function createCategoryRowDOM(id, isPrimary = false) {
        const row = document.createElement('div');
        row.id = id;
        row.className = 'category-row tagcart-category-row flex-shrink-0 flex items-center gap-2';
        
        if (isPrimary) {
            const allBtn = document.createElement('button');
            allBtn.id = 'fixed-all-btn';
            allBtn.className = 'btn px-3 py-1 text-sm rounded-md flex-shrink-0';
            allBtn.dataset.categoryName = 'All';
            row.appendChild(allBtn);
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'buttons-wrapper tagcart-category-buttons flex-grow';
        row.appendChild(wrapper);

        const paginationDiv = document.createElement('div');
        paginationDiv.className = 'flex items-center gap-1 flex-shrink-0';
        
        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn p-1 rounded-md w-6 h-6 flex items-center justify-center';
        prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
        paginationDiv.appendChild(prevBtn);

        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn p-1 rounded-md w-6 h-6 flex items-center justify-center';
        nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        paginationDiv.appendChild(nextBtn);

        row.appendChild(paginationDiv);

        return row;
    }
    function positionDraggableContainer() { // 添加一个函数来设置浮动框 draggableContainer 的初始位置坐标
        const containerWidth = 970;
        centerTagCartInViewport(false);
        return;
        const containerHeight = 500;
        let initialTop = 220; //从顶部开始计算，正数为向下偏移
        let initialLeft = ((window.innerWidth - containerWidth) / 2) - 260; // 从左侧开始计算，正数为向右偏移，负数为向左偏移
        if (initialTop < 10) initialTop = 10;
        if (initialLeft < 10) initialLeft = 10;
        draggableContainer.style.top = `${initialTop}px`;
        draggableContainer.style.left = `${initialLeft}px`;
        draggableContainer.style.transform = '';
        ensureTagCartWithinViewport(true);
    }

    function getTagCartViewportMargin() {
        return window.matchMedia && window.matchMedia('(max-width: 700px)').matches ? 8 : 10;
    }

    function clampTagCartPosition(left, top, width, height) {
        const margin = getTagCartViewportMargin();
        const safeWidth = Math.min(Math.max(width || 0, 1), Math.max(1, window.innerWidth - margin * 2));
        const safeHeight = Math.min(Math.max(height || 0, 1), Math.max(1, window.innerHeight - margin * 2));
        const maxLeft = Math.max(margin, window.innerWidth - margin - safeWidth);
        const maxTop = Math.max(margin, window.innerHeight - margin - safeHeight);
        return {
            left: Math.min(maxLeft, Math.max(margin, left)),
            top: Math.min(maxTop, Math.max(margin, top))
        };
    }

    function getTagCartFallbackSize() {
        const margin = getTagCartViewportMargin();
        return {
            width: Math.min(970, Math.max(280, window.innerWidth - margin * 2)),
            height: Math.min(650, Math.max(220, window.innerHeight - margin * 2))
        };
    }

    function centerTagCartInViewport(useActualSize = true) {
        if (!draggableContainer) return;
        const fallback = getTagCartFallbackSize();
        const rect = draggableContainer.getBoundingClientRect();
        const width = useActualSize && rect.width > 0 ? rect.width : fallback.width;
        const height = useActualSize && rect.height > 0 ? rect.height : fallback.height;
        const next = clampTagCartPosition(
            (window.innerWidth - width) / 2,
            (window.innerHeight - height) / 2,
            width,
            height
        );
        draggableContainer.style.left = `${Math.round(next.left)}px`;
        draggableContainer.style.top = `${Math.round(next.top)}px`;
        draggableContainer.style.right = 'auto';
        draggableContainer.style.bottom = 'auto';
        draggableContainer.style.transform = 'none';
    }

    function ensureTagCartWithinViewport(force = false) {
        if (!draggableContainer) return;
        if (!force && draggableContainer.style.display === 'none') return;

        const margin = getTagCartViewportMargin();
        let rect = draggableContainer.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const maxWidth = Math.max(280, window.innerWidth - margin * 2);
        const maxHeight = Math.max(220, window.innerHeight - margin * 2);
        if (rect.width > maxWidth) {
            draggableContainer.style.width = `${Math.round(maxWidth)}px`;
        }
        if (rect.height > maxHeight) {
            draggableContainer.style.height = `${Math.round(maxHeight)}px`;
        }

        rect = draggableContainer.getBoundingClientRect();
        const next = clampTagCartPosition(rect.left, rect.top, rect.width, rect.height);
        draggableContainer.style.left = `${Math.round(next.left)}px`;
        draggableContainer.style.top = `${Math.round(next.top)}px`;
        draggableContainer.style.right = 'auto';
        draggableContainer.style.bottom = 'auto';
        draggableContainer.style.transform = 'none';
    }

    function installTagCartResize() {
        if (workbenchInlineMode) return tagcartResizeState;
        if (tagcartResizeState || typeof window.installResizablePopup !== 'function') {
            return tagcartResizeState;
        }
        tagcartResizeState = window.installResizablePopup(draggableContainer, {
            modal: draggableContainer,
            minWidth: 620,
            minHeight: 360,
            margin: getTagCartViewportMargin(),
            isHidden: () => draggableContainer.style.display === 'none'
        });
        return tagcartResizeState;
    }

    function tagCartScrollableOverflow(value) {
        return /auto|scroll|overlay/i.test(String(value || ''));
    }

    function canTagCartWheelScrollAxis(scroller, axis, delta) {
        if (!scroller || Math.abs(delta || 0) < 0.01) return false;
        if (axis === 'x') {
            const maxLeft = scroller.scrollWidth - scroller.clientWidth;
            if (maxLeft <= 1) return false;
            return delta < 0 ? scroller.scrollLeft > 0 : scroller.scrollLeft < maxLeft - 1;
        }
        const maxTop = scroller.scrollHeight - scroller.clientHeight;
        if (maxTop <= 1) return false;
        return delta < 0 ? scroller.scrollTop > 0 : scroller.scrollTop < maxTop - 1;
    }

    function findTagCartWheelScroller(target, root, deltaX, deltaY) {
        let node = target instanceof Element ? target : target?.parentElement;
        while (node && node !== document.documentElement) {
            const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
            if (style) {
                const canScrollY = tagCartScrollableOverflow(style.overflowY)
                    && canTagCartWheelScrollAxis(node, 'y', deltaY);
                const canScrollX = tagCartScrollableOverflow(style.overflowX)
                    && canTagCartWheelScrollAxis(node, 'x', deltaX);
                if (canScrollY || canScrollX) return node;
            }
            if (node === root) break;
            node = node.parentElement;
        }
        return null;
    }

    function bindTagCartWheelContainment() {
        if (!draggableContainer || draggableContainer.dataset.simpleaiWheelContainmentBound === '1') return;
        draggableContainer.dataset.simpleaiWheelContainmentBound = '1';
        draggableContainer.addEventListener('wheel', (event) => {
            if (draggableContainer.style.display === 'none') return;
            const scroller = findTagCartWheelScroller(
                event.target,
                draggableContainer,
                event.deltaX,
                event.deltaY
            );
            if (!scroller && event.cancelable) {
                event.preventDefault();
            }
            event.stopPropagation();
        }, { passive: false, capture: true });
    }

    function hideTagCartPanel() {
        const closeHandler = workbenchCloseHandler;
        const wasInlineMode = workbenchInlineMode;
        workbenchTarget = null;
        workbenchInlineMode = false;
        workbenchCloseHandler = null;
        if (targetBtnGroup) targetBtnGroup.style.display = '';
        if (draggableContainer) draggableContainer.style.display = 'none';
        if (wasInlineMode && typeof closeHandler === 'function') {
            try {
                closeHandler();
            } catch (err) {
                console.warn('[TagCart] Workbench inline close callback failed:', err);
            }
        }
    }

    function setupEventListeners() {
        bindTagCartWheelContainment();
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.trim();
            
            if (query && activePrimaryCategory !== 'All') {
                handlePrimaryCategorySelect('All');
            }
            
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                applyFiltersAndRender();
            }, 300);
        });
        primaryCategoryRow.querySelector('#fixed-all-btn')?.addEventListener('click', () => {
            handlePrimaryCategorySelect('All');
        });

        const setupPaginationListeners = (rowElement, pageState, renderFunc, getCategoryList) => {
            const paginationDiv = rowElement.querySelector('.flex.items-center.gap-1');
            const prevBtn = paginationDiv.querySelector('button:first-child');
            const nextBtn = paginationDiv.querySelector('button:last-child');

            prevBtn.addEventListener('click', () => {
                if (pageState.page > 1) {
                    pageState.page--;
                    renderFunc();
                }
            });
            nextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(getCategoryList().length / CATEGORIES_PER_PAGE);
                if (pageState.page < totalPages) {
                    pageState.page++;
                    renderFunc();
                }
            });
        };

        setupPaginationListeners(primaryCategoryRow, { get page() { return primaryCategoryPage; }, set page(val) { primaryCategoryPage = val; } }, renderPrimaryCategories, () => primaryCategories);
        setupPaginationListeners(secondaryCategoryRow, { get page() { return secondaryCategoryPage; }, set page(val) { secondaryCategoryPage = val; } }, renderSecondaryCategories, () => Array.from(secondaryCategories));
        
        closeBtn.addEventListener('click', hideTagCartPanel);
        resetSearchBtn.addEventListener('click', () => { searchInput.value = ''; handlePrimaryCategorySelect('All'); });
        nsfwFilterBtn.addEventListener('click', () => { isNsfwFilterActive = !isNsfwFilterActive; nsfwFilterBtn.classList.toggle('active', isNsfwFilterActive); applyFiltersAndRender(); });
        clearAllBtn.addEventListener('click', () => { selectedTags = []; renderSelectedTags(); renderTags(); scheduleWorkbenchAutoWrite(true); });
        copyBtn.addEventListener('click', copyTagsToClipboard);
        const setupButtonGroupListener = (groupElement, stateUpdater) => {
            groupElement.addEventListener('click', (e) => {
                const clickedButton = e.target.closest('button');
                if (!clickedButton) return;
                const value = clickedButton.dataset.value;
                if (value) {
                    stateUpdater(value);
                    groupElement.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                    clickedButton.classList.add('active');
                }
            });
        };


        // [新增点 7] 绑定导入按钮的点击事件
        // [修改] 不再使用 getElementById，直接使用我们已经保存的变量
        if (importBtn) {
            console.log("找到导入按钮变量，正在绑定点击事件...");
            importBtn.addEventListener('click', importFromPrompt);
            if (editCustomBtn) {
                editCustomBtn.addEventListener('click', openCustomTagsEditor);
            }
            if (customTagsCloseBtn) {
                customTagsCloseBtn.addEventListener('click', closeCustomTagsEditor);
            }
            if (customTagsReloadBtn) {
                customTagsReloadBtn.addEventListener('click', async () => {
                    try {
                        await loadCustomTagsEditorContent();
                    } catch (error) {
                        console.error('Failed to reload custom tag editor:', error);
                        setCustomTagsStatus(error.message || customTagsEditorText('reloadFailed'), 'error');
                    }
                });
            }
            if (customTagsSaveBtn) {
                customTagsSaveBtn.addEventListener('click', async () => {
                    try {
                        await saveCustomTagsEditorContent();
                    } catch (error) {
                        console.error('Failed to save custom tag editor:', error);
                        setCustomTagsStatus(error.message || customTagsEditorText('saveFailed'), 'error');
                    }
                });
            }
            if (customTagsAddBtn) {
                customTagsAddBtn.addEventListener('click', () => {
                    customTagEditorRows.push({ name: '', translation: '', aliases: '' });
                    renderCustomTagsEditorRows();
                });
            }
            if (customTagsTableBody) {
                customTagsTableBody.addEventListener('input', handleCustomTagsTableInput);
                customTagsTableBody.addEventListener('click', handleCustomTagsTableClick);
            }
        } else {
            // 这个错误理论上不会再发生了
            console.error("致命错误：importBtn 变量未被正确初始化！");
        }

        closeBtn.addEventListener('click', hideTagCartPanel);

        if (window.ResizeObserver && tagDisplayContainer) {
            let resizeFrame = 0;
            const tagGridResizeObserver = new ResizeObserver(() => {
                if (!isDataLoaded) return;
                cancelAnimationFrame(resizeFrame);
                resizeFrame = requestAnimationFrame(() => {
                    currentPage = Math.min(currentPage, getTotalTagPages());
                    renderTags();
                    renderPagination();
                });
            });
            tagGridResizeObserver.observe(tagDisplayContainer);
        }


        setupButtonGroupListener(formatBtnGroup, value => { activeFormat = value; scheduleWorkbenchAutoWrite(); });
        setupButtonGroupListener(actionBtnGroup, value => { activeAction = value; scheduleWorkbenchAutoWrite(true); });
        setupButtonGroupListener(targetBtnGroup, value => { activeTarget = value; scheduleWorkbenchAutoWrite(true); });
        toggleLanguageBtn.addEventListener('click', () => {
            displayEnglishOnly = !displayEnglishOnly;
            toggleLanguageBtn.classList.toggle('active', displayEnglishOnly);
            updateUIText(displayEnglishOnly ? 'en' : 'zh');
        });
        let isDraggingContainer = false, containerOffset = { x: 0, y: 0 };
        const onPanelPointerMove = (e) => {
            if (!isDraggingContainer) return;
            const rect = draggableContainer.getBoundingClientRect();
            const next = clampTagCartPosition(
                (e.clientX ?? 0) - containerOffset.x,
                (e.clientY ?? 0) - containerOffset.y,
                rect.width,
                rect.height
            );
            draggableContainer.style.left = `${Math.round(next.left)}px`;
            draggableContainer.style.top = `${Math.round(next.top)}px`;
            draggableContainer.style.right = 'auto';
            draggableContainer.style.bottom = 'auto';
            draggableContainer.style.transform = 'none';
            e.preventDefault();
        };
        const onPanelPointerUp = () => {
            if (!isDraggingContainer) return;
            isDraggingContainer = false;
            draggableHandle.style.cursor = 'grab';
            window.removeEventListener('pointermove', onPanelPointerMove, true);
            window.removeEventListener('pointerup', onPanelPointerUp, true);
            if (tagcartResizeState && tagcartResizeState.ensureWithinViewport) {
                tagcartResizeState.ensureWithinViewport(true);
            } else {
                ensureTagCartWithinViewport(true);
            }
        };
        draggableHandle.addEventListener('pointerdown', (e) => {
            if (workbenchInlineMode) return;
            if (e.button !== undefined && e.button !== 0) return;
            if (e.target && e.target.closest && e.target.closest('button, input, textarea, select, .simpleai-popup-resize-handle')) return;
            installTagCartResize();
            if (tagcartResizeState && tagcartResizeState.syncCurrentRectToInline) {
                tagcartResizeState.syncCurrentRectToInline();
            }
            const rect = draggableContainer.getBoundingClientRect();
            isDraggingContainer = true;
            containerOffset = { x: (e.clientX ?? 0) - rect.left, y: (e.clientY ?? 0) - rect.top };
            draggableHandle.style.cursor = 'grabbing';
            window.addEventListener('pointermove', onPanelPointerMove, true);
            window.addEventListener('pointerup', onPanelPointerUp, true);
            e.preventDefault();
        }, { passive: false });
        window.addEventListener('resize', () => ensureTagCartWithinViewport(false));
    }


    // --- 功能模块: 数据加载与解析 ---
    
    // [优化 4] 新增懒加载主函数
    async function triggerDataLoadAndDisplay() {
        // 如果数据已经加载过，或者正在加载中（isDataLoaded已为true），则直接返回
        if (isDataLoaded) {
            return;
        }
        // 立即设置状态为 true，防止用户快速重复点击导致多次加载
        isDataLoaded = true; 
        console.log("首次激活面板，开始懒加载数据...");

        // 在UI上显示加载提示
        tagDisplayContainer.innerHTML = '<div class="loading-indicator">正在加载标签数据...</div>';

        try {
            await loadAllData(); // 调用真正的数据加载函数
            
            // 数据加载成功后，执行首次渲染和UI更新
            renderPrimaryCategories();
            applyFiltersAndRender();
            updateUIText(displayEnglishOnly ? 'en' : 'zh');
            
            console.log("数据懒加载并渲染完成。");

        } catch (error) {
            console.error("懒加载数据失败:", error);
            // 显示错误信息
            tagDisplayContainer.innerHTML = '<div class="error-indicator">数据加载失败，请检查控制台信息。</div>';
        }
    }

    /**
     * [新增点 4] 从正面提示词框导入、解析并更新已选区
     */
    // [修改] 替换为这个具备智能分隔符检测功能的新版本
    async function importFromPrompt() {
        console.log("[导入流程开始]");

        let text = null;
        if (workbenchTarget && typeof workbenchTarget.getText === 'function') {
            text = String(workbenchTarget.getText() || '');
        }
        const root = typeof gradioApp === 'function' ? gradioApp() : document;
        const targetId = activeTarget === 'positive' ? 'positive_prompt' : 'negative_prompt';
        const promptTextarea = root && root.querySelector
            ? root.querySelector(`#${targetId} textarea, #${targetId} [data-testid="textbox"]`)
            : null;
        if (text === null && !promptTextarea) {
            console.error("[导入中断] 找不到文本框。");
            return;
        }

        if (text === null) text = promptTextarea.value;
        console.log(`[步骤1] 获取到文本: "${text}"`);
        if (!text.trim()) {
            console.log("[导入中断] 文本框为空。");
            alert("提示：正面提示词输入框是空的。");
            return;
        }

        // [核心修改] 智能检测分隔符
        let potentialTags;
        if (text.includes(',')) {
            // 模式一：检测到逗号，使用逗号作为唯一分隔符
            console.log("[解析模式] 检测到逗号，使用逗号作为主要分隔符。");
            potentialTags = text.split(',');
        } else {
            // 模式二：未检测到逗号，假定是Danbooru风格，使用空格作为分隔符
            console.log("[解析模式] 未检测到逗号，使用空格作为分隔符。");
            // 使用正则表达式 \s+ 来分割一个或多个连续的空白字符（空格、换行等）
            // 这可以避免因多个空格导致数组中出现空字符串。
            potentialTags = text.split(/\s+/);
        }

        console.log(`[步骤2] 分割为 ${potentialTags.length} 个潜在标签:`, potentialTags);

        selectedTags = []; // 重置
        const newlySelectedTags = [];
        const addedTagNames = new Set();

        for (const rawTag of potentialTags) {
            const cleanedName = cleanTagName(rawTag);
            const promptWeight = extractPromptWeight(rawTag);
            // console.log(`[步骤3] 处理 "${rawTag}" -> 清洗为 "${cleanedName}"`);
            if (!cleanedName || addedTagNames.has(cleanedName)) {
                continue;
            }
            addedTagNames.add(cleanedName);

            if (fullTagMap.has(cleanedName)) {
                const foundTag = fullTagMap.get(cleanedName);
                newlySelectedTags.push(createSelectedTag(foundTag, promptWeight));
                //console.log(`  -> 匹配成功！添加官方标签:`, foundTag);
            } else {
                const unmatchedTag = {
                    name: cleanedName,
                    // translation: "未匹配的标签", // 未匹配标签不需要翻译
                    category: -99,
                    isUnmatched: true,
                    count: 0,
                    aliases: '',
                    customCategory: '',
                    secondaryCategory: ''
                };
                newlySelectedTags.push(createSelectedTag(unmatchedTag, promptWeight));
                //console.log(`  -> 匹配失败。添加为未匹配标签:`, unmatchedTag);
            }
        }

        selectedTags = newlySelectedTags;
        console.log(`[步骤4] 构建完成，新的 selectedTags 数组 (${selectedTags.length}个):`, selectedTags);

        console.log("[步骤5] 准备刷新UI...");
        renderSelectedTags();
        renderTags();
        console.log("[导入流程结束]");
    }

    /**
     * [新增点 5] 清洗从提示词中提取的单个标签字符串的辅助函数
     * @param {string} rawTag - 从提示词中分割出的原始字符串
     * @returns {string} - 清理好的、可用作查找键的标签名
     */
    function cleanTagName(rawTag) {
        if (!rawTag) return '';
        let tag = rawTag.trim();
        
        // 移除可能存在的Lora或Lyco格式，例如 <lora:name:1.0> -> ""
        tag = tag.replace(/<l(ora|yco):.*?>/g, '').trim();
        if (!tag) return '';

        // 处理转义括号 \( \)，变回 ( )
        tag = tag.replace(/\\\(/g, '(').replace(/\\\)/g, ')');
        
        // 循环去除首尾的圆括号和方括号，以处理多重嵌套如 ((tag))
        while (tag.startsWith('(') && tag.endsWith(')')) {
            tag = tag.substring(1, tag.length - 1).trim();
        }
        while (tag.startsWith('[') && tag.endsWith(']')) {
            tag = tag.substring(1, tag.length - 1).trim();
        }

        // 移除权重，例如 "masterpiece:1.2" -> "masterpiece"
        tag = tag.split(':')[0].trim();
        
        // 将空格替换为下划线，以匹配Danbooru格式
        tag = tag.replace(/ /g, '_');
        
        return tag;
    }

    // loadAllData 函数本身逻辑不变，它仍然是加载所有数据的核心
    function extractPromptWeight(rawTag) {
        if (!rawTag) return DEFAULT_PROMPT_WEIGHT;
        let tag = String(rawTag).trim();
        tag = tag.replace(/<l(ora|yco):.*?>/g, '').trim();
        if (!tag) return DEFAULT_PROMPT_WEIGHT;
        tag = tag.replace(/\\\(/g, '(').replace(/\\\)/g, ')');

        const wrappedMatch = tag.match(/^\((.*):(-?\d+(?:\.\d+)?)\)$/);
        if (wrappedMatch) return normalizePromptWeight(wrappedMatch[2]);

        const trailingMatch = tag.match(/:(-?\d+(?:\.\d+)?)$/);
        if (trailingMatch) return normalizePromptWeight(trailingMatch[1]);

        return DEFAULT_PROMPT_WEIGHT;
    }

    function createSelectedTag(tag, promptWeight = DEFAULT_PROMPT_WEIGHT) {
        return {
            ...tag,
            promptWeight: normalizePromptWeight(promptWeight)
        };
    }

    function getTagPromptWeight(tag) {
        return normalizePromptWeight(tag?.promptWeight ?? DEFAULT_PROMPT_WEIGHT);
    }

    function buildUnmatchedTag(name) {
        return {
            name,
            category: -99,
            isUnmatched: true,
            count: 0,
            aliases: '',
            customCategory: '',
            secondaryCategory: ''
        };
    }

    function rebuildFullTagMap() {
        fullTagMap.clear();
        allTags.forEach(tag => {
            if (tag && tag.name && !fullTagMap.has(tag.name)) {
                fullTagMap.set(tag.name, tag);
            }
        });
    }

    function restoreSelectedTags(tagNames) {
        const names = Array.isArray(tagNames) ? tagNames : [];
        const seen = new Set();
        selectedTags = names
            .filter(name => {
                if (!name || seen.has(name)) return false;
                seen.add(name);
                return true;
            })
            .map(name => createSelectedTag(fullTagMap.get(name) || buildUnmatchedTag(name)));
    }

    function normalizeCustomTagRow(row) {
        if (Array.isArray(row)) {
            return {
                name: String(row[0] || '').trim(),
                translation: String(row[1] || '').trim(),
                aliases: String(row[2] || '').trim()
            };
        }
        return {
            name: String(row?.name || '').trim(),
            translation: String(row?.translation || '').trim(),
            aliases: String(row?.aliases || '').trim()
        };
    }

    function parseCustomTagsCsv(content) {
        const text = String(content || '').trim();
        if (!text) return [];
        const parsed = Papa.parse(text, {
            skipEmptyLines: true
        });
        if (parsed.errors && parsed.errors.length > 0) {
            console.warn('custom_tags.csv parse warnings:', parsed.errors);
        }
        return parsed.data
            .map(normalizeCustomTagRow)
            .filter(row => row.name || row.translation || row.aliases);
    }

    function collectCustomTagsEditorRows() {
        if (!customTagsTableBody) return [];
        return Array.from(customTagsTableBody.querySelectorAll('tr'))
            .map(row => ({
                name: row.querySelector('[data-field="name"]')?.value || '',
                translation: row.querySelector('[data-field="translation"]')?.value || '',
                aliases: row.querySelector('[data-field="aliases"]')?.value || ''
            }))
            .map(normalizeCustomTagRow)
            .filter(row => row.name || row.translation || row.aliases);
    }

    function serializeCustomTagsRows(rows) {
        const normalized = rows
            .map(normalizeCustomTagRow)
            .filter(row => row.name);
        if (normalized.length === 0) return '';
        return Papa.unparse(
            normalized.map(row => [row.name, row.translation, row.aliases]),
            { newline: '\n' }
        ) + '\n';
    }

    function renderCustomTagsEditorRows() {
        if (!customTagsTableBody) return;
        customTagsTableBody.innerHTML = '';
        const rows = customTagEditorRows.length > 0
            ? customTagEditorRows
            : [{ name: '', translation: '', aliases: '' }];

        rows.forEach((row, index) => {
            const normalized = normalizeCustomTagRow(row);
            const tr = document.createElement('tr');
            tr.dataset.index = String(index);
            tr.innerHTML = `
                <td><input data-field="name" value="" placeholder="1girl" /></td>
                <td><input data-field="translation" value="" placeholder="1个女孩" /></td>
                <td><input data-field="aliases" value="" placeholder="solo girl" /></td>
                <td><button type="button" class="btn tagcart-editor-icon-btn" data-action="delete-row" title="${customTagsEditorText('deleteRow')}"><i class="fa-solid fa-trash-can"></i></button></td>
            `;
            tr.querySelector('[data-field="name"]').value = normalized.name;
            tr.querySelector('[data-field="translation"]').value = normalized.translation;
            tr.querySelector('[data-field="aliases"]').value = normalized.aliases;
            customTagsTableBody.appendChild(tr);
        });
    }

    function handleCustomTagsTableInput(event) {
        const input = event.target.closest('input[data-field]');
        if (!input) return;
        const rowEl = input.closest('tr');
        const index = Number(rowEl?.dataset.index);
        if (!Number.isFinite(index)) return;
        customTagEditorRows[index] = customTagEditorRows[index] || { name: '', translation: '', aliases: '' };
        customTagEditorRows[index][input.dataset.field] = input.value;
    }

    function handleCustomTagsTableClick(event) {
        const deleteButton = event.target.closest('[data-action="delete-row"]');
        if (!deleteButton) return;
        const rowEl = deleteButton.closest('tr');
        const index = Number(rowEl?.dataset.index);
        if (!Number.isFinite(index)) return;
        customTagEditorRows.splice(index, 1);
        renderCustomTagsEditorRows();
    }

    function setCustomTagsStatus(message, tone = 'info') {
        if (!customTagsStatus) return;
        customTagsStatus.textContent = message || '';
        delete customTagsStatus.dataset.messageKey;
        delete customTagsStatus.dataset.messageParams;
        customTagsStatus.dataset.tone = tone || 'info';
    }

    function setCustomTagsStatusKey(key, params = {}, tone = 'info') {
        if (!customTagsStatus) return;
        customTagsStatus.dataset.messageKey = key;
        customTagsStatus.dataset.messageParams = JSON.stringify(params || {});
        customTagsStatus.textContent = customTagsEditorText(key, params);
        customTagsStatus.dataset.tone = tone || 'info';
    }

    function refreshCustomTagsStatusText() {
        if (!customTagsStatus || !customTagsStatus.dataset.messageKey) return;
        let params = {};
        try {
            params = JSON.parse(customTagsStatus.dataset.messageParams || '{}');
        } catch (error) {
            params = {};
        }
        customTagsStatus.textContent = customTagsEditorText(customTagsStatus.dataset.messageKey, params);
    }

    function closeCustomTagsEditor() {
        if (customTagsEditor) {
            customTagsEditor.style.display = 'none';
        }
    }

    async function loadCustomTagsEditorContent() {
        setCustomTagsStatusKey('loading');
        const response = await fetch(customTagsApiUrl, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(customTagsEditorText('loadFailedStatus', { status: response.status }));
        }
        const payload = await response.json();
        customTagEditorRows = parseCustomTagsCsv(typeof payload.content === 'string' ? payload.content : '');
        renderCustomTagsEditorRows();
        customTagsPathLabel.textContent = payload.path || '';
        setCustomTagsStatusKey('loadedRows', { count: customTagEditorRows.length }, 'success');
    }

    async function openCustomTagsEditor() {
        if (!customTagsEditor) return;
        customTagsEditor.style.display = 'flex';
        try {
            await loadCustomTagsEditorContent();
        } catch (error) {
            console.error('Failed to open custom tag editor:', error);
            setCustomTagsStatus(error.message || customTagsEditorText('loadFailed'), 'error');
        }
    }

    async function refreshTagData({ preserveSelection = true } = {}) {
        const previousSelection = preserveSelection ? selectedTags.map(tag => tag.name) : [];
        const previousPrimary = activePrimaryCategory;
        const previousSecondary = activeSecondaryCategory;

        await loadAllData();

        renderPrimaryCategories();
        renderSecondaryCategories();

        if (previousPrimary && previousPrimary !== 'All' && primaryCategories.includes(previousPrimary)) {
            activePrimaryCategory = previousPrimary;
            await handlePrimaryCategorySelect(previousPrimary);
            if (previousSecondary && secondaryCategories.has(previousSecondary)) {
                activeSecondaryCategory = previousSecondary;
                renderSecondaryCategories();
            }
        } else {
            activePrimaryCategory = 'All';
            activeSecondaryCategory = null;
            secondaryCategories.clear();
            primaryCategoryPage = 1;
            secondaryCategoryPage = 1;
        }

        restoreSelectedTags(previousSelection);
        renderSelectedTags();
        applyFiltersAndRender();
        updateUIText(displayEnglishOnly ? 'en' : 'zh');
    }

    async function saveCustomTagsEditorContent() {
        customTagEditorRows = collectCustomTagsEditorRows();
        const content = serializeCustomTagsRows(customTagEditorRows);
        setCustomTagsStatusKey('saving');
        const response = await fetch(customTagsApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        if (!response.ok) {
            let message = customTagsEditorText('saveFailedStatus', { status: response.status });
            try {
                const payload = await response.json();
                if (payload && payload.details) {
                    message = payload.details;
                }
            } catch (error) {
                console.warn('Failed to parse custom tag save error:', error);
            }
            throw new Error(message);
        }
        await response.json();
        await refreshTagData({ preserveSelection: true });
        setCustomTagsStatusKey('saved', {}, 'success');
    }

    async function loadAllData() {
        try {
            const finalCsvUrl = await determineCsvUrl();

            const [curatedTagsResult, danbooruTagsResult, customTagsResult] = await Promise.all([
                loadCSV(finalCsvUrl, { sourceType: 'curated' }),
                loadCSV(danbooruCsvUrl, { sourceType: 'danbooru' }),
                loadCustomTags()
            ]);
            
            searchableWildcardTags = [];
            wildcardFilenames = {};
            wildcardTranslations = {};
            wildcardWordTranslations = {};
            allTags = [
                ...customTagsResult,
                ...curatedTagsResult,
                ...danbooruTagsResult
            ];

            // [新增点 6] 填充全量标签Map以优化导入搜索性能
            rebuildFullTagMap();

            console.log(`所有数据加载和解析完成。Map已填充，包含 ${fullTagMap.size} 个唯一标签。`);
            processCategories();
        } catch (error) {
            console.error("加载所有数据时发生严重错误:", error);
            throw error;
        }
    }

    // ... loadWildcardData, loadCSV, loadCustomTags 等函数 ...
    // ... 这些函数与您提供的版本完全相同，为节省篇幅已折叠 ...
    // ... 它们内部没有任何逻辑需要为懒加载而修改 ...

    // [修改] 替换您JS文件中旧的 loadWildcardData 函数
    async function loadWildcardData() {
        try {
            console.log("正在使用官方 API 获取通配符文件列表...");
            // [新增] 1. 调用官方API获取真实的文件名列表
            const apiResponse = await fetch('/gradio_api/run/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fn_index: 1, // 根据文档，fn_index 为 1
                    data: []
                })
            });

            if (!apiResponse.ok) {
                throw new Error(`通配符API请求失败: ${apiResponse.status} ${apiResponse.statusText}`);
            }

            const result = await apiResponse.json();
            const filenamesFromApi = result.data[0]; // "artists,clothes,scenery"
            
            // 将API返回的逗号分隔字符串转换为数组，并过滤掉可能的空值
            const officialFileNames = filenamesFromApi.split(',')
                .map(name => name.trim())
                .filter(Boolean); // filter(Boolean) 会移除空字符串

            console.log("从API获取到的官方文件名列表:", officialFileNames);

            // [修改] 2. 仍然加载翻译文件，但仅作查询使用
            const fetchWithTimeout = (url, options = {}, timeout = 5000) => {
                return Promise.race([fetch(url, options), new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), timeout))]);
            };

            const [cnListRes, cnWordsRes] = await Promise.all([
                fetchWithTimeout(wildcardCnListUrl).catch(e => { console.warn('无法加载通配符列表翻译:', e.message); return { ok: false }; }),
                fetchWithTimeout(wildcardCnWordsUrl).catch(e => { console.warn('无法加载通配符词条翻译:', e.message); return { ok: false }; })
            ]);

            let rawTranslations = {};
            if (cnListRes.ok) {
                rawTranslations = await cnListRes.json(); // 形如 {"wildcards/artists": "艺术家", ...}
            }
            if (cnWordsRes.ok) { 
                wildcardWordTranslations = await cnWordsRes.json(); 
            }

            // [修改] 3. 基于官方列表构建 wildcardFilenames，确保准确性
            wildcardFilenames = {}; // 清空旧数据
            officialFileNames.forEach(filename => {
                const translationKey = `list/${filename}`;
                // 从翻译文件中查找翻译，如果找不到，就用文件名本身作为显示文本
                wildcardFilenames[filename] = rawTranslations[translationKey] || filename;
            });

            console.log("整理后的通配符分类:", wildcardFilenames);
            
            // 4. 基于官方列表加载所有通配符词条用于搜索 (这部分逻辑不变，但数据源更准确了)
            if (officialFileNames.length === 0) { 
                console.log("API返回的通配符文件列表为空，跳过加载。"); 
                return; 
            }

            const allWildcardPromises = officialFileNames.map(async (filename) => {
                try {
                    // 注意：这里拼接路径是根据您之前代码的逻辑，确保 webpath 和路径正确
                    const response = await fetch(buildAssetUrl(`wildcards/${filename}.txt`));
                    if (!response.ok) return [];
                    const text = await response.text();
                    return text.split('\n').map(line => line.trim()).filter(line => line !== '');
                } catch (e) { 
                    console.warn(`加载通配符文件 ${filename}.txt 失败:`, e); 
                    return []; 
                }
            });

            const allLinesNested = await Promise.all(allWildcardPromises);
            const allLinesFlat = allLinesNested.flat();

            searchableWildcardTags = allLinesFlat.map(line => ({
                name: line,
                translation: wildcardWordTranslations[line] || '',
                category: -2,
                count: 0,
                isWildcard: true,
                aliases: '',
                customCategory: '通配符',
                secondaryCategory: ''
            }));
            
            console.log(`通配符数据处理完成，共加载 ${searchableWildcardTags.length} 个可搜索词条。`);
        } catch (err) {
            console.error('处理通配符数据时出错:', err);
            // 出错时清空，避免显示错误/过时的按钮
            wildcardFilenames = {};
            searchableWildcardTags = [];
        }
    }

    async function loadCSV(source, { sourceType = 'danbooru' } = {}) {
        console.log("loadCSV started for source:", source);
        const parsedTags = [];
        try {
            const response = await fetch(source);
            if (!response.ok) {
                throw new Error(`网络响应不佳: ${response.status} ${response.statusText}`);
            }
            const csvData = await response.text();
            
            return new Promise((resolve, reject) => {
                Papa.parse(csvData, {
                    worker: true, 
                    header: false, 
                    encoding: "UTF-8", 
                    step: (row) => { 
                        const data = row.data;
                        if (data.length >= 3 && data[0]) {
                            const category = parseInt(data[1], 10);
                            const rawCustomCategory = (data[5] || '').trim();
                            const rawSecondaryCategory = (data[6] || '').trim();
                            const rawRemarks = (data[7] || '').trim();
                            const remarks = sourceType === 'danbooru'
                                ? [rawCustomCategory, rawSecondaryCategory, rawRemarks].filter(Boolean).join(' > ')
                                : rawRemarks;
                            parsedTags.push({
                                name: data[0].trim(),
                                category,
                                count: parseInt(data[2], 10),
                                aliases: (data[3] || '').trim(),
                                translation: (data[4] || '').trim(),
                                customCategory: sourceType === 'danbooru' ? '' : rawCustomCategory,
                                secondaryCategory: sourceType === 'danbooru' ? '' : rawSecondaryCategory,
                                remarks,
                                sourceType,
                                isCurated: sourceType === 'curated',
                                isDanbooru: sourceType === 'danbooru'
                            });
                        }
                    },
                    complete: () => { 
                        console.log("CSV parsing completed.");
                        resolve(parsedTags);
                    },
                    error: (err) => { 
                        console.error("解析CSV时出错:", err);
                        reject(err);
                    }
                });
            });
        } catch (err) {
            console.error(`加载或获取 CSV 源 (${source}) 时出错:`, err);
            return Promise.reject(err);
        }
    }
    async function loadCustomTags() {
        console.log("加载自定义标签 custom_tags.csv...");
        const customTags = [];
        try {
            const response = await fetch(customCsvUrl);
            if (!response.ok) {
                console.warn("custom_tags.csv 未找到或加载失败，跳过。");
                return []; 
            }
            const csvData = await response.text();
            
            return new Promise((resolve, reject) => {
                Papa.parse(csvData, {
                    header: false,
                    skipEmptyLines: true,
                    step: (row) => {
                        const data = row.data;
                        if (data && data[0]) {
                            customTags.push({
                                name: (data[0] || '').trim(), 
                                category: 9, 
                                count: Infinity, 
                                aliases: (data[2] || '').trim(), 
                                translation: (data[1] || '').trim(),
                                customCategory: '自定义',
                                secondaryCategory: '',
                                sourceType: 'custom',
                                isCustom: true,
                                isCurated: true
                            });
                        }
                    },
                    complete: () => {
                        console.log(`自定义标签加载完成，共 ${customTags.length} 个。`);
                        resolve(customTags);
                    },
                    error: (err) => {
                        console.error("解析 custom_tags.csv 时出错:", err);
                        reject(err);
                    }
                });
            });
        } catch (err) {
            console.error("获取 custom_tags.csv 时出错:", err);
            return [];
        }
    }

    // --- 功能模块: 分类处理与渲染 ---
    // --- 功能模块: 核心交互逻辑 ---
    // --- 功能模块: UI渲染与更新 ---
    // ... processCategories, renderPrimaryCategories, handlePrimaryCategorySelect, etc. ...
    // ... 剩余所有功能函数与您提供的版本完全相同，为节省篇幅已折叠 ...
    // ... 它们内部没有任何逻辑需要为懒加载而修改 ...
    function processCategories() {
        const standardCategoryCodes = {
            General: 0,
            Artist: 1,
            Copyright: 3,
            Character: 4,
            Meta: 5
        };
        const standardCategories = Object.entries(standardCategoryCodes)
            .filter(([, code]) => allTags.some(tag => tag.isDanbooru && tag.category === code))
            .map(([name]) => name);
        const customCategories = Array.from(new Set(
            allTags
                .filter(tag => !tag.isDanbooru)
                .map(tag => (tag.customCategory || '').trim())
                .filter(Boolean)
        ));
        
        let processedCategories = [...standardCategories, ...customCategories];

        const desiredOrder = [
        // [修改点 1] “一级分类按钮的期望顺序”在这里调整分类按钮的顺序，这里填写的分类名称必须与上面 processCategories 函数中生成的分类名称ID一致
            '人物', '服饰', '表情动作', '画面', '环境', '场景',
            '物品', '镜头', '汉服', '魔法系', 'NSFW', '自定义',
            'General', 'Character', 'Copyright', 'Artist', 'Meta'
        ];

        processedCategories = Array.from(new Set(processedCategories));
        primaryCategories = processedCategories.sort((a, b) => {
            const indexA = desiredOrder.indexOf(a);
            const indexB = desiredOrder.indexOf(b);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.localeCompare(b);
        });
    }

    function isDataBackedPrimaryCategory(category) {
        if (!category || category === 'All' || category === 'Wildcard') return false;
        return allTags.some(tag => !tag.isDanbooru && tag.customCategory === category);
    }

    function resolveLocalizedCategoryEntry(lookupTable, rawCategory, normalizedCategory) {
        if (!lookupTable) return null;
        return lookupTable[rawCategory]
            || lookupTable[normalizedCategory]
            || null;
    }

    function getLocalizedCategoryLabel(category, lang, isPrimary = false) {
        const rawCategory = String(category || '').trim();
        if (!rawCategory) return rawCategory;
        const normalizedCategory = rawCategory.toLowerCase();

        const primaryFallbackLabels = {
            'all': { zh: '全部', en: 'All' },
            'All': { zh: '全部', en: 'All' },
            'general': { zh: '通用', en: 'General' },
            'General': { zh: '通用', en: 'General' },
            'artist': { zh: '画师', en: 'Artist' },
            'Artist': { zh: '画师', en: 'Artist' },
            'copyright': { zh: '作品', en: 'Copyright' },
            'character': { zh: '角色', en: 'Character' },
            'Character': { zh: '角色', en: 'Character' },
            'meta': { zh: '元数据', en: 'Meta' },
            'Meta': { zh: '元数据', en: 'Meta' },
            'people': { zh: '人物', en: 'People' },
            'People': { zh: '人物', en: 'People' },
            'clothing': { zh: '服饰', en: 'Clothing' },
            'Clothing': { zh: '服饰', en: 'Clothing' },
            'expression & pose': { zh: '表情动作', en: 'Expression & Pose' },
            'expression and pose': { zh: '表情动作', en: 'Expression & Pose' },
            'Expression & Pose': { zh: '表情动作', en: 'Expression & Pose' },
            'image': { zh: '画面', en: 'Image' },
            'Image': { zh: '画面', en: 'Image' },
            'environment': { zh: '环境', en: 'Environment' },
            'Environment': { zh: '环境', en: 'Environment' },
            'scene': { zh: '场景', en: 'Scene' },
            'Scene': { zh: '场景', en: 'Scene' },
            'objects': { zh: '物品', en: 'Objects' },
            'Objects': { zh: '物品', en: 'Objects' },
            'camera': { zh: '镜头', en: 'Camera' },
            'Camera': { zh: '镜头', en: 'Camera' },
            'hanfu': { zh: '汉服', en: 'Hanfu' },
            'Hanfu': { zh: '汉服', en: 'Hanfu' },
            'magic': { zh: '魔法系', en: 'Magic' },
            'Magic': { zh: '魔法系', en: 'Magic' },
            'nsfw': { zh: 'NSFW', en: 'NSFW' },
            'NSFW': { zh: 'NSFW', en: 'NSFW' },
            'custom': { zh: '自定义', en: 'Custom' },
            'Custom': { zh: '自定义', en: 'Custom' },
            'wildcard': { zh: '通配符', en: 'Wildcard' }
        };

        const secondaryFallbackLabels = {
            '肩部': { zh: '肩部', en: 'Shoulders' },
            'shoulder': { zh: '肩部', en: 'Shoulders' },
            'shoulders': { zh: '肩部', en: 'Shoulders' },
            '腰部': { zh: '腰部', en: 'Waist' },
            'waist': { zh: '腰部', en: 'Waist' },
            '乐器': { zh: '乐器', en: 'Instruments' },
            'instrument': { zh: '乐器', en: 'Instruments' },
            'instruments': { zh: '乐器', en: 'Instruments' },
            '其它物品': { zh: '其它物品', en: 'Other Objects' },
            '其他物品': { zh: '其它物品', en: 'Other Objects' },
            'other objects': { zh: '其它物品', en: 'Other Objects' },
            'animal': { zh: '动物', en: 'Animals' },
            'animals': { zh: '动物', en: 'Animals' },
            '动物': { zh: '动物', en: 'Animals' },
            'Animal': { zh: '动物', en: 'Animals' },
            'flora': { zh: '植物', en: 'Flora' },
            '植物': { zh: '植物', en: 'Flora' },
            'Flora': { zh: '植物', en: 'Flora' },
            '学习用品': { zh: '学习用品', en: 'Study Supplies' },
            'study supplies': { zh: '学习用品', en: 'Study Supplies' },
            '数码设备': { zh: '数码设备', en: 'Digital Devices' },
            'digital devices': { zh: '数码设备', en: 'Digital Devices' },
            '武器': { zh: '武器', en: 'Weapons' },
            'weapon': { zh: '武器', en: 'Weapons' },
            'weapons': { zh: '武器', en: 'Weapons' },
            '食物': { zh: '食物', en: 'Food' },
            'food': { zh: '食物', en: 'Food' },
            '餐具': { zh: '餐具', en: 'Tableware' },
            'tableware': { zh: '餐具', en: 'Tableware' },
            '主角动作': { zh: '主角动作', en: 'Character Action' },
            'character action': { zh: '主角动作', en: 'Character Action' },
            '其他构图': { zh: '其他构图', en: 'Other Composition' },
            'other composition': { zh: '其他构图', en: 'Other Composition' },
            '效果': { zh: '效果', en: 'Effects' },
            'effect': { zh: '效果', en: 'Effects' },
            'effects': { zh: '效果', en: 'Effects' },
            '特写镜头': { zh: '特写镜头', en: 'Close-up Shot' },
            'close-up shot': { zh: '特写镜头', en: 'Close-up Shot' },
            '镜头角度': { zh: '镜头角度', en: 'Camera Angle' },
            'camera angle': { zh: '镜头角度', en: 'Camera Angle' },
            'camera': { zh: '镜头', en: 'Camera' },
            '上衣': { zh: '上衣', en: 'Tops' },
            'tops': { zh: '上衣', en: 'Tops' },
            '上衫': { zh: '上衫', en: 'Upper Garment' },
            'upper garment': { zh: '上衫', en: 'Upper Garment' },
            '与袜子互动': { zh: '与袜子互动', en: 'Sock Interaction' },
            'sock interaction': { zh: '与袜子互动', en: 'Sock Interaction' },
            '与裙子互动': { zh: '与裙子互动', en: 'Skirt Interaction' },
            'skirt interaction': { zh: '与裙子互动', en: 'Skirt Interaction' },
            '与裤子互动': { zh: '与裤子互动', en: 'Pants Interaction' },
            'pants interaction': { zh: '与裤子互动', en: 'Pants Interaction' },
            '休闲装': { zh: '休闲装', en: 'Casual Wear' },
            'casual wear': { zh: '休闲装', en: 'Casual Wear' },
            '其他': { zh: '其他', en: 'Other' },
            'other': { zh: '其他', en: 'Other' },
            '制服': { zh: '制服', en: 'Uniform' },
            'uniform': { zh: '制服', en: 'Uniform' },
            '发饰': { zh: '发饰', en: 'Hair Accessories' },
            'hair accessories': { zh: '发饰', en: 'Hair Accessories' },
            '围巾': { zh: '围巾', en: 'Scarves' },
            'scarf': { zh: '围巾', en: 'Scarves' },
            'scarves': { zh: '围巾', en: 'Scarves' },
            '外套': { zh: '外套', en: 'Coats' },
            'coat': { zh: '外套', en: 'Coats' },
            'coats': { zh: '外套', en: 'Coats' },
            '头饰': { zh: '头饰', en: 'Headwear' },
            'headwear': { zh: '头饰', en: 'Headwear' },
            '小装饰': { zh: '小装饰', en: 'Small Accessories' },
            'small accessories': { zh: '小装饰', en: 'Small Accessories' },
            '帽子': { zh: '帽子', en: 'Hats' },
            'hat': { zh: '帽子', en: 'Hats' },
            'hats': { zh: '帽子', en: 'Hats' },
            '手部': { zh: '手部', en: 'Hands' },
            'hand': { zh: '手部', en: 'Hands' },
            'hands': { zh: '手部', en: 'Hands' },
            'Hand': { zh: '手部', en: 'Hands' },
            '手套': { zh: '手套', en: 'Gloves' },
            'glove': { zh: '手套', en: 'Gloves' },
            'gloves': { zh: '手套', en: 'Gloves' },
            '手臂': { zh: '手臂', en: 'Arms' },
            'arm': { zh: '手臂', en: 'Arms' },
            'arms': { zh: '手臂', en: 'Arms' },
            '材质': { zh: '材质', en: 'Materials' },
            'material': { zh: '材质', en: 'Materials' },
            'materials': { zh: '材质', en: 'Materials' },
            '正装': { zh: '正装', en: 'Formal Wear' },
            'formal wear': { zh: '正装', en: 'Formal Wear' },
            '泳装': { zh: '泳装', en: 'Swimwear' },
            'swimwear': { zh: '泳装', en: 'Swimwear' },
            '盔甲': { zh: '盔甲', en: 'Armor' },
            'armor': { zh: '盔甲', en: 'Armor' },
            '眼镜': { zh: '眼镜', en: 'Glasses' },
            'glasses': { zh: '眼镜', en: 'Glasses' },
            '耳饰': { zh: '耳饰', en: 'Earrings' },
            'earrings': { zh: '耳饰', en: 'Earrings' },
            '花纹': { zh: '花纹', en: 'Patterns' },
            'pattern': { zh: '花纹', en: 'Patterns' },
            'patterns': { zh: '花纹', en: 'Patterns' },
            '袜子': { zh: '袜子', en: 'Socks' },
            'sock': { zh: '袜子', en: 'Socks' },
            'socks': { zh: '袜子', en: 'Socks' },
            '装饰': { zh: '装饰', en: 'Accessories' },
            'accessory': { zh: '装饰', en: 'Accessories' },
            'accessories': { zh: '装饰', en: 'Accessories' },
            '裙子': { zh: '裙子', en: 'Skirts' },
            'skirt': { zh: '裙子', en: 'Skirts' },
            'skirts': { zh: '裙子', en: 'Skirts' },
            '裤子': { zh: '裤子', en: 'Pants' },
            'pants': { zh: '裤子', en: 'Pants' },
            '运动服': { zh: '运动服', en: 'Sportswear' },
            'sportswear': { zh: '运动服', en: 'Sportswear' },
            '面具': { zh: '面具', en: 'Masks' },
            'mask': { zh: '面具', en: 'Masks' },
            'masks': { zh: '面具', en: 'Masks' },
            '鞋子': { zh: '鞋子', en: 'Shoes' },
            'shoe': { zh: '鞋子', en: 'Shoes' },
            'shoes': { zh: '鞋子', en: 'Shoes' },
            '鞋底': { zh: '鞋底', en: 'Soles' },
            'sole': { zh: '鞋底', en: 'Soles' },
            'soles': { zh: '鞋底', en: 'Soles' },
            '领口': { zh: '领口', en: 'Neckline' },
            'neckline': { zh: '领口', en: 'Neckline' },
            'styles': { zh: '风格', en: 'Styles' },
            '首饰': { zh: '首饰', en: 'Jewelry' },
            'jewelry': { zh: '首饰', en: 'Jewelry' },
            '不开心': { zh: '不开心', en: 'Unhappy' },
            'unhappy': { zh: '不开心', en: 'Unhappy' },
            '其它动作': { zh: '其它动作', en: 'Other Actions' },
            '其他动作': { zh: '其它动作', en: 'Other Actions' },
            'other actions': { zh: '其它动作', en: 'Other Actions' },
            '其他表情': { zh: '其他表情', en: 'Other Expressions' },
            'other expressions': { zh: '其他表情', en: 'Other Expressions' },
            '哭': { zh: '哭', en: 'Cry' },
            'cry': { zh: '哭', en: 'Cry' },
            '基础动作': { zh: '基础动作', en: 'Basic Actions' },
            'basic actions': { zh: '基础动作', en: 'Basic Actions' },
            '手部动作': { zh: '手部动作', en: 'Hand Actions' },
            'hand actions': { zh: '手部动作', en: 'Hand Actions' },
            '手部动作(抓着某物)': { zh: '手部动作(抓着某物)', en: 'Hand Actions (Grabbing)' },
            'hand actions (grabbing)': { zh: '手部动作(抓着某物)', en: 'Hand Actions (Grabbing)' },
            '手部动作(拿着某物)': { zh: '手部动作(拿着某物)', en: 'Hand Actions (Holding)' },
            'hand actions (holding)': { zh: '手部动作(拿着某物)', en: 'Hand Actions (Holding)' },
            '手部动作(放在某地)': { zh: '手部动作(放在某地)', en: 'Hand Actions (Placing)' },
            'hand actions (placing)': { zh: '手部动作(放在某地)', en: 'Hand Actions (Placing)' },
            '生气': { zh: '生气', en: 'Angry' },
            'angry': { zh: '生气', en: 'Angry' },
            '笑': { zh: '笑', en: 'Smile' },
            'smile': { zh: '笑', en: 'Smile' },
            '腿部动作': { zh: '腿部动作', en: 'Leg Actions' },
            'leg actions': { zh: '腿部动作', en: 'Leg Actions' },
            '蔑视': { zh: '蔑视', en: 'Scorn' },
            'scorn': { zh: '蔑视', en: 'Scorn' },
            '光照': { zh: '光照', en: 'Lighting' },
            'lighting': { zh: '光照', en: 'Lighting' },
            'realistic': { zh: '写实', en: 'Realistic' },
            '写实': { zh: '写实', en: 'Realistic' },
            'Realistic': { zh: '写实', en: 'Realistic' },
            '画笔': { zh: '画笔', en: 'Brushwork' },
            'brushwork': { zh: '画笔', en: 'Brushwork' },
            '画质': { zh: '画质', en: 'Quality' },
            'quality': { zh: '画质', en: 'Quality' },
            '素描': { zh: '素描', en: 'Sketch' },
            'sketch': { zh: '素描', en: 'Sketch' },
            '背景': { zh: '背景', en: 'Background' },
            'background': { zh: '背景', en: 'Background' },
            '艺术家风格': { zh: '艺术家风格', en: 'Artist Style' },
            'artist style': { zh: '艺术家风格', en: 'Artist Style' },
            '艺术派系': { zh: '艺术派系', en: 'Art School' },
            'art school': { zh: '艺术派系', en: 'Art School' },
            '艺术类型': { zh: '艺术类型', en: 'Art Type' },
            'art type': { zh: '艺术类型', en: 'Art Type' },
            '艺术风格': { zh: '艺术风格', en: 'Art Style' },
            'art style': { zh: '艺术风格', en: 'Art Style' },
            '颜色': { zh: '颜色', en: 'Color' },
            'color': { zh: '颜色', en: 'Color' },
            '云': { zh: '云', en: 'Clouds' },
            'cloud': { zh: '云', en: 'Clouds' },
            'clouds': { zh: '云', en: 'Clouds' },
            '大自然': { zh: '大自然', en: 'Nature' },
            'nature': { zh: '大自然', en: 'Nature' },
            '天气': { zh: '天气', en: 'Weather' },
            'weather': { zh: '天气', en: 'Weather' },
            '天空': { zh: '天空', en: 'Sky' },
            'sky': { zh: '天空', en: 'Sky' },
            '季节': { zh: '季节', en: 'Season' },
            'season': { zh: '季节', en: 'Season' },
            '氛围': { zh: '氛围', en: 'Atmosphere' },
            'atmosphere': { zh: '氛围', en: 'Atmosphere' },
            '水': { zh: '水', en: 'Water' },
            'water': { zh: '水', en: 'Water' },
            '地板': { zh: '地板', en: 'Floor' },
            'floor': { zh: '地板', en: 'Floor' },
            '城市': { zh: '城市', en: 'City' },
            'city': { zh: '城市', en: 'City' },
            '室内': { zh: '室内', en: 'Indoor' },
            'indoor': { zh: '室内', en: 'Indoor' },
            '室外': { zh: '室外', en: 'Outdoor' },
            'outdoor': { zh: '室外', en: 'Outdoor' },
            '家具': { zh: '家具', en: 'Furniture' },
            'furniture': { zh: '家具', en: 'Furniture' },
            '床上用品': { zh: '床上用品', en: 'Bedding' },
            'bedding': { zh: '床上用品', en: 'Bedding' },
            '浴室': { zh: '浴室', en: 'Bathroom' },
            'bathroom': { zh: '浴室', en: 'Bathroom' },
            '唐风:': { zh: '唐风:', en: 'Tang Style:' },
            'tang style:': { zh: '唐风:', en: 'Tang Style:' },
            '宋抹': { zh: '宋抹', en: 'Song Mo' },
            'song mo': { zh: '宋抹', en: 'Song Mo' },
            '宋风:': { zh: '宋风:', en: 'Song Style:' },
            'song style:': { zh: '宋风:', en: 'Song Style:' },
            '披帛': { zh: '披帛', en: 'Pibo Shawl' },
            'pibo shawl': { zh: '披帛', en: 'Pibo Shawl' },
            '明风:': { zh: '明风:', en: 'Ming Style:' },
            'ming style:': { zh: '明风:', en: 'Ming Style:' },
            '百褶裙': { zh: '百褶裙', en: 'Pleated Skirt' },
            'pleated skirt': { zh: '百褶裙', en: 'Pleated Skirt' },
            '短衫': { zh: '短衫', en: 'Short Shirt' },
            'short shirt': { zh: '短衫', en: 'Short Shirt' },
            '系带': { zh: '系带', en: 'Ties' },
            'ties': { zh: '系带', en: 'Ties' },
            '长上衫': { zh: '长上衫', en: 'Long Upper Garment' },
            'long upper garment': { zh: '长上衫', en: 'Long Upper Garment' },
            '魔法1.0': { zh: '魔法1.0', en: 'Magic 1.0' },
            'magic 1.0': { zh: '魔法1.0', en: 'Magic 1.0' },
            '魔法1.5': { zh: '魔法1.5', en: 'Magic 1.5' },
            'magic 1.5': { zh: '魔法1.5', en: 'Magic 1.5' },
            'r18词': { zh: 'R18词', en: 'R18 Terms' },
            'r18 terms': { zh: 'R18词', en: 'R18 Terms' }
        };

        const primaryEntry = resolveLocalizedCategoryEntry(uiTexts.primaryCategoryNames, rawCategory, normalizedCategory)
            || resolveLocalizedCategoryEntry(uiTexts.presetCustomCategories, rawCategory, normalizedCategory)
            || resolveLocalizedCategoryEntry(primaryFallbackLabels, rawCategory, normalizedCategory);
        if (primaryEntry) {
            return primaryEntry[lang] || primaryEntry.zh || rawCategory;
        }
        if (!isPrimary) {
            const secondaryEntry = resolveLocalizedCategoryEntry(uiTexts.secondaryCategoryNames, rawCategory, normalizedCategory)
                || resolveLocalizedCategoryEntry(secondaryFallbackLabels, rawCategory, normalizedCategory);
            if (secondaryEntry) {
                return secondaryEntry[lang] || secondaryEntry.zh || rawCategory;
            }
        }

        return rawCategory;
    }
    
    function renderCategoryRow(rowElement, categories, currentPage, activeCategory, clickHandler, isPrimary = false) {
        const wrapper = rowElement.querySelector('.buttons-wrapper');
        wrapper.innerHTML = '';
        
        const categoriesForPagination = isPrimary ? categories.filter(c => c !== 'All') : Array.from(categories);
        const totalPages = Math.ceil(categoriesForPagination.length / CATEGORIES_PER_PAGE);
        
        const paginationDiv = rowElement.querySelector('.flex.items-center.gap-1');
        const prevBtn = paginationDiv.querySelector('button:first-child');
        const nextBtn = paginationDiv.querySelector('button:last-child');
        
        prevBtn.disabled = currentPage === 1;
        nextBtn.disabled = currentPage >= totalPages || categoriesForPagination.length === 0;

        if (categories.length === 0) return;

        const startIndex = (currentPage - 1) * CATEGORIES_PER_PAGE;
        const endIndex = startIndex + CATEGORIES_PER_PAGE;
        const categoriesToRender = categoriesForPagination.slice(startIndex, endIndex);

        categoriesToRender.forEach(category => {
            const btn = document.createElement('button');
            btn.className = 'btn px-3 py-1 text-sm rounded-md flex-shrink-0';
            btn.dataset.categoryName = category;
            
            const lang = displayEnglishOnly ? 'en' : 'zh';
            const displayText = getLocalizedCategoryLabel(category, lang, isPrimary);
            btn.textContent = displayText;

            if (category === activeCategory) {
                btn.classList.add('active');
            }
            btn.addEventListener('click', () => clickHandler(category));
            wrapper.appendChild(btn);
        });

        if (isPrimary) {
            const allBtn = rowElement.querySelector('#fixed-all-btn');
            allBtn.classList.toggle('active', activeCategory === 'All');
        }
    }
    function renderPrimaryCategories() { renderCategoryRow(primaryCategoryRow, primaryCategories, primaryCategoryPage, activePrimaryCategory, handlePrimaryCategorySelect, true); }
    function renderSecondaryCategories() { renderCategoryRow(secondaryCategoryRow, Array.from(secondaryCategories), secondaryCategoryPage, activeSecondaryCategory, handleSecondaryCategorySelect, false); }
    async function selectAndLoadWildcard(categoryName) {
        activeSecondaryCategory = categoryName;
        renderSecondaryCategories();
        await loadAndDisplayWildcardContent(categoryName);
    }

    // [新版本] handlePrimaryCategorySelect 函数
    async function handlePrimaryCategorySelect(category) {
        console.log(`一级分类选择: ${category}`);
        activePrimaryCategory = category;
        activeSecondaryCategory = null; // 重置二级分类选择
        secondaryCategories.clear();
        secondaryCategoryPage = 1;

        // [核心修改] 逻辑重构，不再使用 "内置分类-" 前缀
        if (category === 'Wildcard') {
            // --- 通配符逻辑 (保持不变) ---
            const wildcardList = Object.keys(wildcardFilenames).sort();
            secondaryCategories = new Set(wildcardList);
            
            if (wildcardList.length > 0) {
                const firstWildcard = wildcardList[0];
                console.log(`通配符分类被选中，自动加载第一个文件: ${firstWildcard}`);
                await selectAndLoadWildcard(firstWildcard);
            }
        } 
        else if (isDataBackedPrimaryCategory(category)) {
            // --- 新的自定义分类逻辑 ---
            const secondarySet = new Set();
            // 1. 筛选出所有属于当前一级分类的标签
            const relevantTags = allTags.filter(tag => tag.customCategory === category);
            
            // 2. 从这些标签中提取二级分类
            relevantTags.forEach(tag => {
                // 如果二级分类字段为空，则归入"未分类"；否则使用其自身的值
                secondarySet.add(tag.secondaryCategory || '未分类');
            });

            if (secondarySet.size > 0) {
                secondaryCategories = new Set(Array.from(secondarySet).sort());
            }
        }
        
        // 更新一级分类的分页（逻辑不变）
        const categoryIndex = primaryCategories.indexOf(category);
        if (categoryIndex !== -1) {
            primaryCategoryPage = Math.ceil((categoryIndex + 1) / CATEGORIES_PER_PAGE);
        }
        if(category === 'All') primaryCategoryPage = 1;

        // 重新渲染分类按钮
        renderPrimaryCategories();
        renderSecondaryCategories();
        
        // 如果不是通配符分类，则立即应用筛选并显示结果
        if (category !== 'Wildcard') {
            applyFiltersAndRender();
        }
    }

    // [修改] 替换为这个新的 handleSecondaryCategorySelect 函数
    async function handleSecondaryCategorySelect(category) {
        // 确定新的活动分类。如果点击的是当前已激活的，则取消选择 (newActiveCategory 为 null)
        const newActiveCategory = activeSecondaryCategory === category ? null : category;
        
        // 更新活动二级分类的状态
        activeSecondaryCategory = newActiveCategory;

        // 首先，无条件地重新渲染二级分类按钮，以正确反映高亮状态
        renderSecondaryCategories();

        // 如果没有新的活动分类（即用户取消了选择），则恢复默认过滤并返回
        if (!newActiveCategory) {
            applyFiltersAndRender();
            return;
        }

        // [核心逻辑] 根据当前的一级分类，决定下一步操作
        if (activePrimaryCategory === 'Wildcard') {
            // --- 这是通配符分类的专属逻辑 ---
            
            // 1. 加载并显示该通配符文件的内容
            await loadAndDisplayWildcardContent(newActiveCategory);

            // 2. [重要] 为通配符创建占位符并添加到已选区
            const wildcardTag = {
                name: `__${newActiveCategory}__`,
                translation: `__${wildcardFilenames[newActiveCategory] || newActiveCategory}__`,
                category: -1, 
                isWildcardPlaceholder: true
            };
            toggleTagSelection(wildcardTag);

        } else {
            // --- 这是所有其他（非通配符）二级分类的逻辑 ---
            
            // 只需要根据新选择的二级分类来过滤标签列表即可
            // 不执行任何文件加载，也不添加任何东西到已选区
            applyFiltersAndRender();
        }
    }

    async function loadAndDisplayWildcardContent(filename) {
        try {
            const response = await fetch(buildAssetUrl(`wildcards/${filename}.txt`));
            if (!response.ok) throw new Error('File not found');
            const text = await response.text();
            const lines = text.split('\n').filter(line => line.trim() !== '');

            filteredTags = lines.map(line => {
                const name = line.trim();
                return { name: name, translation: wildcardWordTranslations[name] || '', category: -2, count: 0, isWildcard: true };
            });
            currentPage = 1;
            renderTags();
            renderPagination();
        } catch (error) {
            console.error(`加载通配符文件 ${filename}.txt 失败:`, error);
            filteredTags = [];
            renderTags();
            renderPagination();
        }
    }

    // [新版本] applyFiltersAndRender 函数
    function applyFiltersAndRender() {
        // 如果正在显示通配符文件内容，则不执行常规过滤
        if (activePrimaryCategory === 'Wildcard' && activeSecondaryCategory) {
            return;
        }
        
        const query = searchInput.value.toLowerCase().trim();
        let tempFilteredTags = [...allTags, ...searchableWildcardTags];

        // [核心修改 1] 扩大搜索范围，包含 "remarks" 字段
        if (query) {
            tempFilteredTags = tempFilteredTags.filter(tag => 
                tag.name.toLowerCase().includes(query) || 
                (tag.aliases && tag.aliases.toLowerCase().includes(query)) || 
                (tag.translation && tag.translation.toLowerCase().includes(query)) || 
                (tag.customCategory && tag.customCategory.toLowerCase().includes(query)) ||
                (tag.remarks && tag.remarks.toLowerCase().includes(query)) // <-- 已包含备注搜索
            );
        }

        if (activePrimaryCategory === 'All' && !query) {
            tempFilteredTags = tempFilteredTags.filter(t => !t.isDanbooru);
        }

        // [核心修改 2] 简化分类过滤逻辑
        if (activePrimaryCategory && activePrimaryCategory !== 'All') {
            switch (activePrimaryCategory) {
                // --- 标准分类 (逻辑不变) ---
                case 'General':   tempFilteredTags = tempFilteredTags.filter(t => t.isDanbooru && t.category === 0); break;
                case 'Character': tempFilteredTags = tempFilteredTags.filter(t => t.isDanbooru && t.category === 4); break;
                case 'Copyright': tempFilteredTags = tempFilteredTags.filter(t => t.isDanbooru && t.category === 3); break;
                case 'Artist':    tempFilteredTags = tempFilteredTags.filter(t => t.isDanbooru && t.category === 1); break;
                case 'Meta':      tempFilteredTags = tempFilteredTags.filter(t => t.isDanbooru && t.category === 5); break;
                case 'Wildcard':  // (逻辑不变)
                    if (!query) { tempFilteredTags = []; } 
                    else { tempFilteredTags = tempFilteredTags.filter(t => t.isWildcard); }
                    break;
                // --- 新的自定义分类过滤逻辑 ---
                default:
                    if (isDataBackedPrimaryCategory(activePrimaryCategory)) {
                        // 1. 按一级分类筛选
                        tempFilteredTags = tempFilteredTags.filter(t => t.customCategory === activePrimaryCategory);
                        
                        // 2. 如果有二级分类被激活，则进一步筛选
                        if (activeSecondaryCategory) {
                            if (activeSecondaryCategory === '未分类') {
                                // 如果选择的是"未分类"，则筛选出 secondaryCategory 为空的标签
                                tempFilteredTags = tempFilteredTags.filter(t => !t.secondaryCategory);
                            } else {
                                // 否则，精确匹配二级分类名称
                                tempFilteredTags = tempFilteredTags.filter(t => t.secondaryCategory === activeSecondaryCategory);
                            }
                        }
                    }
                    break;
            }
        }

        // NSFW 过滤 (逻辑不变)
        if (isNsfwFilterActive) {
            tempFilteredTags = tempFilteredTags.filter(tag => {
                const category = String(tag.customCategory || '').toLowerCase();
                return !category.includes('内置分类-禁') && !category.includes('nsfw');
            });
        }

        // 去重、排序和渲染 (逻辑不变)
        const uniqueNames = new Set();
        const uniqueTags = tempFilteredTags.filter(tag => {
            if (uniqueNames.has(tag.name)) return false;
            else { uniqueNames.add(tag.name); return true; }
        });
        uniqueTags.sort((a, b) => (b.count || 0) - (a.count || 0));
        filteredTags = uniqueTags;
        currentPage = 1; 
        renderTags(); 
        renderPagination(); 
    }

    function prettifyTagText(value) {
        return String(value || '').replace(/_/g, ' ').trim();
    }

    function getTagDisplayLines(tag) {
        const english = prettifyTagText(tag?.name || '');
        const translated = String(tag?.translation || '').trim();
        const normalizedEnglish = english.replace(/\s+/g, ' ').toLowerCase();
        const normalizedTranslated = translated.replace(/\s+/g, ' ').toLowerCase();
        const primary = normalizedTranslated && normalizedTranslated !== normalizedEnglish
            ? translated
            : english;
        return { primary, secondary: english };
    }

    function appendTagTextContent(tagEl, tag, compact = false) {
        const { primary, secondary } = getTagDisplayLines(tag);
        const stack = document.createElement('span');
        stack.className = `tag-text-stack${compact ? ' tag-text-stack-compact' : ''}`;
        const visualLength = Math.max(getTextVisualLength(primary), getTextVisualLength(secondary));
        if (visualLength >= 30) {
            tagEl.classList.add('tag-text-very-long');
        } else if (visualLength >= 22) {
            tagEl.classList.add('tag-text-long');
        }

        const primarySpan = document.createElement('span');
        primarySpan.className = 'tag-text-primary';
        primarySpan.textContent = primary || prettifyTagText(tag?.name || '');
        stack.appendChild(primarySpan);

        const secondarySpan = document.createElement('span');
        secondarySpan.className = 'tag-text-secondary';
        secondarySpan.textContent = secondary || primarySpan.textContent;
        stack.appendChild(secondarySpan);
        tagEl.classList.add('has-secondary');

        tagEl.appendChild(stack);
    }

    function getTextVisualLength(text) {
        return Array.from(String(text || '')).reduce((total, char) => {
            return total + (/[\u3000-\u9fff\uff00-\uffef]/.test(char) ? 2 : 1);
        }, 0);
    }

    function setButtonGroupValue(groupElement, value) {
        if (!groupElement) return;
        groupElement.querySelectorAll('button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === value);
        });
    }

    function getTagsPerPage() {
        if (!tagDisplayContainer) return TAGS_PER_PAGE;

        const rect = tagDisplayContainer.getBoundingClientRect();
        const containerWidth = tagDisplayContainer.clientWidth || rect.width;
        const containerHeight = tagDisplayContainer.clientHeight || rect.height;
        if (containerWidth < 80 || containerHeight < 80) return TAGS_PER_PAGE;

        const styles = window.getComputedStyle(tagDisplayContainer);
        const gapValue = parseFloat(styles.gap) || 6;
        const columnGap = parseFloat(styles.columnGap) || gapValue;
        const rowGap = parseFloat(styles.rowGap) || gapValue;
        const paddingX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
        const paddingY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
        const usableWidth = Math.max(0, containerWidth - paddingX - 4);
        const usableHeight = Math.max(0, containerHeight - paddingY - 8);
        const minColumnWidth = 94;
        const rowHeight = 50;
        const columns = Math.max(1, Math.floor((usableWidth + columnGap) / (minColumnWidth + columnGap)));
        const rows = Math.max(1, Math.floor((usableHeight + rowGap) / (rowHeight + rowGap)));

        return Math.max(1, columns * rows);
    }

    function getTotalTagPages() {
        return Math.max(1, Math.ceil(filteredTags.length / getTagsPerPage()));
    }

    function renderTags() {
        tagDisplayContainer.innerHTML = ''; 
        tagDisplayContainer.scrollTop = 0;
        const tagsPerPage = getTagsPerPage();
        currentPage = Math.min(currentPage, getTotalTagPages());
        const startIndex = (currentPage - 1) * tagsPerPage;
        const tagsToRender = filteredTags.slice(startIndex, startIndex + tagsPerPage); 
        tagsToRender.forEach(tag => {
            const tagEl = document.createElement('button');
            tagEl.type = 'button';
            tagEl.className = 'tag-item tag-card tag-interactive';
            tagEl.dataset.category = tag.category; 
            tagEl.dataset.tagName = tag.name; 
            tagEl.title = generateTagTitle(tag);             

            if (tag.isCustom) tagEl.classList.add('custom-tag');
            else if (tag.isWildcard) tagEl.classList.add('wildcard-tag');

            appendTagTextContent(tagEl, tag);
            if (selectedTags.some(st => st.name === tag.name)) tagEl.classList.add('selected');
            tagEl.addEventListener('click', () => toggleTagSelection(tag)); 
            tagDisplayContainer.appendChild(tagEl);
        });
    }
    function renderSelectedTags() {
        selectedTagsContainer.innerHTML = ''; 
        selectedTags.forEach(tag => {
            const tagEl = document.createElement('div');
            tagEl.className = 'tag-item tag-chip tag-interactive selected-tag-chip';
            tagEl.tabIndex = 0;
            tagEl.setAttribute('role', 'group');
            tagEl.dataset.category = tag.category; 
            tagEl.title = generateTagTitle(tag);
            
            // [修改点] 检查并应用特殊样式
            if (tag.isUnmatched) {
                tagEl.classList.add('unmatched-tag');
            } else if (tag.isCustom) {
                tagEl.classList.add('custom-tag');
            } else if (tag.isWildcardPlaceholder || tag.isWildcard) {
                tagEl.classList.add('wildcard-tag');
            }

            if (tag.isCustom) tagEl.classList.add('custom-tag');
            else if (tag.isWildcardPlaceholder || tag.isWildcard) tagEl.classList.add('wildcard-tag');

            if (formatPromptWeight(getTagPromptWeight(tag)) !== '1') tagEl.classList.add('has-chip-weight');

            appendTagTextContent(tagEl, tag, true);
            tagEl.appendChild(createSelectedTagWeightControl(tag));
            tagEl.addEventListener('click', (event) => {
                if (event.target && event.target.closest && event.target.closest('.tag-chip-weight-control')) return;
                toggleTagSelection(tag);
            });
            tagEl.addEventListener('keydown', (event) => {
                if (event.target && event.target.closest && event.target.closest('.tag-chip-weight-control')) return;
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleTagSelection(tag);
                }
            });
            selectedTagsContainer.appendChild(tagEl);
        });
    }
    function createSelectedTagWeightControl(tag) {
        const weightControl = document.createElement('div');
        weightControl.className = 'tag-chip-weight-control';
        weightControl.title = 'Prompt weight for this tag';

        const updateWeight = (nextValue) => {
            tag.promptWeight = normalizePromptWeight(nextValue);
            renderSelectedTags();
            scheduleWorkbenchAutoWrite();
        };

        const minusBtn = document.createElement('button');
        minusBtn.type = 'button';
        minusBtn.className = 'tag-chip-weight-btn';
        minusBtn.textContent = '-';
        minusBtn.title = 'Decrease weight';

        const input = document.createElement('input');
        input.type = 'number';
        input.step = String(PROMPT_WEIGHT_STEP);
        input.min = '-5';
        input.max = '5';
        input.className = 'tag-chip-weight-input';
        input.value = formatPromptWeight(getTagPromptWeight(tag));
        input.title = 'Weight';

        const plusBtn = document.createElement('button');
        plusBtn.type = 'button';
        plusBtn.className = 'tag-chip-weight-btn';
        plusBtn.textContent = '+';
        plusBtn.title = 'Increase weight';

        [minusBtn, input, plusBtn].forEach(control => {
            control.addEventListener('click', event => event.stopPropagation());
            control.addEventListener('pointerdown', event => event.stopPropagation());
        });

        minusBtn.addEventListener('click', () => updateWeight(getTagPromptWeight(tag) - PROMPT_WEIGHT_STEP));
        plusBtn.addEventListener('click', () => updateWeight(getTagPromptWeight(tag) + PROMPT_WEIGHT_STEP));
        input.addEventListener('input', () => {
            const parsed = parseFloat(input.value);
            if (Number.isFinite(parsed)) {
                tag.promptWeight = normalizePromptWeight(parsed);
                scheduleWorkbenchAutoWrite();
            }
        });
        input.addEventListener('change', () => updateWeight(input.value));
        input.addEventListener('blur', () => updateWeight(input.value));

        weightControl.appendChild(minusBtn);
        weightControl.appendChild(input);
        weightControl.appendChild(plusBtn);
        return weightControl;
    }

    function renderPagination() {
        paginationContainer.innerHTML = '';
        const totalPages = getTotalTagPages();
        if (totalPages <= 1) return;
        const createButton = (html, disabled, onClick) => {
            const btn = document.createElement('button');
            btn.innerHTML = html;
            btn.className = 'btn p-2 rounded-lg h-8 w-8 flex items-center justify-center';
            btn.disabled = disabled;
            if (!disabled) btn.onclick = onClick;
            return btn;
        };
        paginationContainer.appendChild(createButton('<i class="fa-solid fa-chevron-left"></i>', currentPage === 1, () => { currentPage--; renderTags(); renderPagination(); }));
        const pageInfo = document.createElement('span');
        pageInfo.textContent = `${currentPage} / ${totalPages}`;
        pageInfo.className = 'text-sm';
        paginationContainer.appendChild(pageInfo);
        paginationContainer.appendChild(createButton('<i class="fa-solid fa-chevron-right"></i>', currentPage === totalPages, () => { currentPage++; renderTags(); renderPagination(); }));
    }
    function toggleTagSelection(tag) {
        const index = selectedTags.findIndex(st => st.name === tag.name);
        if (index > -1) { selectedTags.splice(index, 1); } 
        else { selectedTags.push(createSelectedTag(tag)); }
        renderSelectedTags(); 
        const displayedTagElement = tagDisplayContainer.querySelector(`[data-tag-name="${tag.name}"]`);
        if (displayedTagElement) { displayedTagElement.classList.toggle('selected', index === -1); }
        scheduleWorkbenchAutoWrite();
    }

    function generateTagTitle(tag) {
        // [修改点] 在函数最开头添加判断
        if (tag.isUnmatched) {
            return `未匹配的标签: ${tag.name}\n该标签将按原样保留和导出。`;
        }
        if (tag.isWildcardPlaceholder) return `通配符: ${tag.name}`;
        if (tag.isWildcard) return `通配符词条\n英文: ${tag.name}\n中文: ${tag.translation || '无'}`;

        const lang = displayEnglishOnly ? 'en' : 'zh';
        const getCategoryName = (categoryCode) => {
            if (tag.customCategory) {
                return uiTexts.presetCustomCategories[tag.customCategory]?.[lang] || tag.customCategory;
            }
            const map = {0: 'General', 1: 'Artist', 3: 'Copyright', 4: 'Character', 5: 'Meta'};
            const key = map[categoryCode];
            return uiTexts.primaryCategoryNames[key]?.[lang] || `${uiTexts.tagTitleDefaults[lang].unknownCategory} (${categoryCode})`;
        };

        return [
            `英文: ${tag.name}`, `中文: ${tag.translation || uiTexts.tagTitleDefaults[lang].noTranslation}`,
            `别名: ${tag.aliases || uiTexts.tagTitleDefaults[lang].noAliases}`,
            `${lang === 'zh' ? '类别' : 'Category'}: ${getCategoryName(tag.category)}`,
            `${lang === 'zh' ? '帖子数量' : 'Post Count'}: ${tag.count.toLocaleString()}`,
            `${lang === 'zh' ? '自定义分类' : 'Custom Category'}: ${tag.customCategory || uiTexts.tagTitleDefaults[lang].noCustomCategory}`,
            `${lang === 'zh' ? '二级分类' : 'Secondary'}: ${tag.secondaryCategory || uiTexts.tagTitleDefaults[lang].noSecondaryCategory}`,
            `${lang === 'zh' ? '备注' : 'Remarks'}: ${tag.remarks || uiTexts.tagTitleDefaults[lang].noTranslation}` // <-- 新增这一行，'无'/'None'的翻译可以复用
        ].join('\n');
    }

    function normalizePromptWeight(value) {
        const parsed = parseFloat(value);
        if (!Number.isFinite(parsed)) return DEFAULT_PROMPT_WEIGHT;
        const rounded = Math.round(parsed * 100) / 100;
        return Math.min(5, Math.max(-5, rounded));
    }

    function formatPromptWeight(value) {
        return String(normalizePromptWeight(value)).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    }

    function hasOnlySingleParentheses(text) {
        return text.startsWith('(')
            && text.endsWith(')')
            && !text.slice(1, -1).includes('(')
            && !text.slice(1, -1).includes(')')
            && !text.slice(1, -1).includes('[')
            && !text.slice(1, -1).includes(']')
            && !text.slice(1, -1).includes('{')
            && !text.slice(1, -1).includes('}')
            && !text.slice(1, -1).includes('<')
            && !text.slice(1, -1).includes('>');
    }

    function applyPromptWeight(text, weight) {
        const normalizedText = String(text || '').trim();
        const normalizedWeight = formatPromptWeight(weight);
        if (!normalizedText || normalizedWeight === '1') return normalizedText;

        const weightedFormatMatch = normalizedText.match(/^\((.*):(-?\d+(?:\.\d+)?)\)$/);
        if (weightedFormatMatch) {
            return `(${weightedFormatMatch[1]}:${normalizedWeight})`;
        }

        if (/:(-?\d+(?:\.\d+)?)$/.test(normalizedText)) {
            return normalizedText.replace(/:(-?\d+(?:\.\d+)?)$/, `:${normalizedWeight}`);
        }

        if (hasOnlySingleParentheses(normalizedText)) {
            return normalizedText.replace(/\)$/, `:${normalizedWeight})`);
        }

        return `(${normalizedText}:${normalizedWeight})`;
    }

    function formatTags() {
        return selectedTags.map(tag => {
            let tagName = String(tag.name || '').trim();

            if (tag.isUnmatched) {
                return applyPromptWeight(tagName, getTagPromptWeight(tag));
            }
            if (tag.isWildcardPlaceholder || tag.isWildcard) return tagName;
            tagName = tagName.replace(/\(/g, '\\(').replace(/\)/g, '\\)');
            tagName = activeFormat === 'underscores' ? tagName.replace(/\s+/g, '_') : tagName.replace(/_/g, ' ');
            tagName = applyPromptWeight(tagName, getTagPromptWeight(tag));
            return tagName;
        }).filter(Boolean).join(', '); 
    }

    function getWorkbenchBaseText() {
        const target = workbenchTarget;
        if (!target) return '';
        if (typeof target.getBaseText === 'function') {
            return String(target.getBaseText() || '');
        }
        return String(workbenchBaseText || '');
    }

    function combineTagsWithBaseText(baseText, formattedString) {
        const base = String(baseText || '').trim();
        const tags = String(formattedString || '').trim();
        if (activeAction !== 'append') return tags;
        if (!tags) return base;
        return base ? `${base}, ${tags}` : tags;
    }

    function tagCartCopyLabel() {
        const lang = displayEnglishOnly ? 'en' : 'zh';
        return uiTexts.buttonTitles.copy[lang] || uiTexts.buttonTitles.copy.zh;
    }

    function flashTagCartCopyFeedback(message, tone) {
        if (!copyBtn) return;
        clearTimeout(tagCartCopyFeedbackTimer);
        copyBtn.classList.remove('is-write-ok', 'is-write-warn', 'is-write-error');
        copyBtn.classList.add(tone === 'error' ? 'is-write-error' : (tone === 'warn' ? 'is-write-warn' : 'is-write-ok'));
        const icon = tone === 'error' ? 'fa-triangle-exclamation' : (tone === 'warn' ? 'fa-circle-info' : 'fa-check');
        copyBtn.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
        tagCartCopyFeedbackTimer = setTimeout(() => {
            copyBtn.classList.remove('is-write-ok', 'is-write-warn', 'is-write-error');
            copyBtn.innerHTML = `<i class="fa-solid fa-copy"></i> ${tagCartCopyLabel()}`;
        }, 1400);
    }

    function writeTagsToWorkbenchTarget(formattedString, options) {
        const target = workbenchTarget;
        if (!target || typeof target.setText !== 'function') return false;
        const opts = options || {};
        const formatted = String(formattedString || '');
        if (!formatted && !opts.allowEmpty) {
            flashTagCartCopyFeedback(displayEnglishOnly ? 'No tags' : '未选择标签', 'warn');
            return false;
        }
        const baseText = getWorkbenchBaseText();
        const next = combineTagsWithBaseText(baseText, formatted);
        try {
            const result = target.setText(next, {
                action: activeAction,
                target: activeTarget,
                formattedString: formatted,
                baseText,
                auto: !!opts.auto
            });
            const ok = result !== false;
            if (!opts.auto) flashTagCartCopyFeedback(ok ? (displayEnglishOnly ? 'Sent' : '已发送') : (displayEnglishOnly ? 'Failed' : '发送失败'), ok ? 'ok' : 'error');
            return ok;
        } catch (error) {
            console.warn('[TagCart] Workbench target write failed:', error);
            if (!opts.auto) flashTagCartCopyFeedback(displayEnglishOnly ? 'Failed' : '发送失败', 'error');
            return false;
        }
    }

    function scheduleWorkbenchAutoWrite(allowEmpty = false) {
        if (!workbenchTarget || workbenchTarget.autoWrite === false) return;
        clearTimeout(workbenchAutoWriteTimer);
        workbenchAutoWriteTimer = setTimeout(() => {
            writeTagsToWorkbenchTarget(formatTags(), { allowEmpty, auto: true });
        }, 80);
    }

    function copyTagsToClipboard() {
        const formattedString = formatTags(); 
        if (!formattedString) {
            flashTagCartCopyFeedback(displayEnglishOnly ? 'No tags' : '未选择标签', 'warn');
            return;
        }
        if (writeTagsToWorkbenchTarget(formattedString)) return;
        const targetId = activeTarget === 'positive' ? 'positive_prompt' : 'negative_prompt';
        const root = typeof gradioApp === 'function' ? gradioApp() : document;
        const promptTextarea = root && root.querySelector
            ? root.querySelector(`#${targetId} textarea, #${targetId} [data-testid="textbox"]`)
            : null;

        if (promptTextarea) {
            if (activeAction === 'append') {
                promptTextarea.value += (promptTextarea.value ? ', ' : '') + formattedString;
            } else { promptTextarea.value = formattedString; }
            promptTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            flashTagCartCopyFeedback(displayEnglishOnly ? 'Sent' : '已发送', 'ok');
        } else {
            console.warn(`未能找到ID为 "${targetId}" 的Gradio文本框。`);
            flashTagCartCopyFeedback(displayEnglishOnly ? 'No target' : '未找到目标', 'error');
        }
        // navigator.clipboard.writeText(formattedString).catch(err => console.error('复制失败', err));
    }

    function positionTagCartNearAnchor(anchor) {
        if (!draggableContainer || !anchor) return false;
        const rect = typeof anchor.getBoundingClientRect === 'function' ? anchor.getBoundingClientRect() : anchor;
        const panelRect = draggableContainer.getBoundingClientRect();
        const fallback = getTagCartFallbackSize();
        const width = panelRect.width > 0 ? panelRect.width : fallback.width;
        const height = panelRect.height > 0 ? panelRect.height : fallback.height;
        const next = clampTagCartPosition(
            (Number(rect.left) || 0) - width + (Number(rect.width) || 0),
            (Number(rect.bottom) || Number(rect.top) || 0) + 10,
            width,
            height
        );
        draggableContainer.style.left = `${Math.round(next.left)}px`;
        draggableContainer.style.top = `${Math.round(next.top)}px`;
        draggableContainer.style.right = 'auto';
        draggableContainer.style.bottom = 'auto';
        draggableContainer.style.transform = 'none';
        return true;
    }

    function openTagCartForWorkbench(options) {
        const opts = options || {};
        workbenchTarget = opts.target && typeof opts.target.setText === 'function' ? opts.target : null;
        if (workbenchTarget) {
            if (typeof opts.baseText === 'string') {
                workbenchBaseText = opts.baseText;
            } else if (typeof workbenchTarget.getBaseText === 'function') {
                workbenchBaseText = String(workbenchTarget.getBaseText() || '');
            } else if (typeof workbenchTarget.getText === 'function') {
                workbenchBaseText = String(workbenchTarget.getText() || '');
            } else {
                workbenchBaseText = '';
            }
        } else {
            workbenchBaseText = '';
        }
        if (opts.action) {
            activeAction = opts.action;
            setButtonGroupValue(actionBtnGroup, activeAction);
        }
        if (opts.targetKind) {
            activeTarget = opts.targetKind === 'negative' ? 'negative' : 'positive';
            setButtonGroupValue(targetBtnGroup, activeTarget);
        }
        if (!draggableContainer) return false;
        const inlineHost = opts.inlineContainer && opts.inlineContainer.appendChild ? opts.inlineContainer : null;
        const floatingHost = !inlineHost && opts.container && opts.container.appendChild ? opts.container : document.body;
        workbenchInlineMode = !!inlineHost;
        workbenchCloseHandler = typeof opts.onClose === 'function' ? opts.onClose : null;
        hasCenteredTagCartOnFirstOpen = true;
        if (appRootInstance && inlineHost) {
            inlineHost.appendChild(appRootInstance);
        } else if (appRootInstance && appRootInstance.parentNode !== floatingHost) {
            floatingHost.appendChild(appRootInstance);
        } else if (appRootInstance && appRootInstance.parentNode) {
            appRootInstance.parentNode.appendChild(appRootInstance);
        }
        if (appRootInstance) {
            appRootInstance.classList.toggle('tagcart-inline-root', workbenchInlineMode);
            appRootInstance.classList.toggle('tagcart-workbench-root', !workbenchInlineMode && floatingHost !== document.body);
            appRootInstance.style.zIndex = workbenchInlineMode ? 'auto' : '2147483646';
            appRootInstance.style.position = workbenchInlineMode ? 'relative' : (floatingHost !== document.body ? 'absolute' : '');
            appRootInstance.style.width = workbenchInlineMode ? '100%' : '';
            appRootInstance.style.height = workbenchInlineMode ? 'auto' : '';
            appRootInstance.style.overflow = workbenchInlineMode ? 'visible' : '';
            appRootInstance.style.pointerEvents = workbenchInlineMode ? 'auto' : '';
        }
        draggableContainer.classList.toggle('tagcart-panel-inline', workbenchInlineMode);
        if (targetBtnGroup) targetBtnGroup.style.display = workbenchInlineMode ? 'none' : '';
        draggableContainer.style.display = 'flex';
        if (workbenchInlineMode) {
            draggableContainer.style.position = 'relative';
            draggableContainer.style.left = 'auto';
            draggableContainer.style.top = 'auto';
            draggableContainer.style.right = 'auto';
            draggableContainer.style.bottom = 'auto';
            draggableContainer.style.transform = 'none';
            draggableContainer.style.width = '100%';
            draggableContainer.style.maxWidth = 'none';
            draggableContainer.style.height = `${Math.max(420, Number(opts.inlineHeight || 520))}px`;
            draggableContainer.style.minHeight = '720px';
        } else {
            draggableContainer.style.position = '';
            draggableContainer.style.maxWidth = '';
            draggableContainer.style.minHeight = '';
            if (!draggableContainer.style.width || draggableContainer.style.width === '100%') draggableContainer.style.width = '970px';
            if (!draggableContainer.style.height || draggableContainer.style.height.endsWith('px')) draggableContainer.style.height = 'min(650px, calc(100dvh - 20px))';
            installTagCartResize();
        }
        requestAnimationFrame(() => {
            const anchored = workbenchInlineMode ? true : positionTagCartNearAnchor(opts.anchor);
            if (!anchored) centerTagCartInViewport(true);
            if (!workbenchInlineMode && tagcartResizeState && tagcartResizeState.syncCurrentRectToInline) {
                tagcartResizeState.syncCurrentRectToInline();
            }
            if (!workbenchInlineMode && tagcartResizeState && tagcartResizeState.ensureWithinViewport) {
                tagcartResizeState.ensureWithinViewport(true);
            } else if (!workbenchInlineMode) {
                ensureTagCartWithinViewport(true);
            }
        });
        triggerDataLoadAndDisplay();
        return true;
    }

    function updateCustomTagsEditorText() {
        const editLabel = editCustomBtn?.querySelector('span');
        if (editLabel) editLabel.textContent = customTagsEditorText('openButton');
        if (editCustomBtn) editCustomBtn.title = customTagsEditorText('editTitle');
        if (customTagsEditorTitle) customTagsEditorTitle.textContent = customTagsEditorText('title');
        if (customTagsEditorHint) customTagsEditorHint.textContent = customTagsEditorText('hint');
        if (customTagsReloadBtn) customTagsReloadBtn.textContent = customTagsEditorText('reload');
        if (customTagsSaveBtn) customTagsSaveBtn.textContent = customTagsEditorText('save');
        if (customTagsCloseBtn) customTagsCloseBtn.textContent = customTagsEditorText('close');
        if (customTagsThead) {
            customTagsThead.innerHTML = `<tr><th>${customTagsEditorText('tag')}</th><th>${customTagsEditorText('translation')}</th><th>${customTagsEditorText('aliases')}</th><th></th></tr>`;
        }
        if (customTagsAddBtn) customTagsAddBtn.textContent = customTagsEditorText('addRow');
        if (customTagsTableBody) {
            customTagsTableBody.querySelectorAll('[data-action="delete-row"]').forEach(button => {
                button.title = customTagsEditorText('deleteRow');
            });
        }
        refreshCustomTagsStatusText();
    }

    function updateUIText(lang) {
        searchInput.placeholder = uiTexts.searchInputPlaceholder[lang];
        draggableHandle.textContent = uiTexts.draggableHandleText[lang];
        copyBtn.innerHTML = `<i class="fa-solid fa-copy"></i> ${uiTexts.buttonTitles.copy[lang]}`;
        const allBtn = primaryCategoryRow.querySelector('#fixed-all-btn');
        if (allBtn) allBtn.textContent = getLocalizedCategoryLabel('All', lang, true);

        const updateButtonGroupText = (groupElement, labels) => {
            groupElement.querySelectorAll('button').forEach(btn => {
                const value = btn.dataset.value;
                if (labels[value]) btn.textContent = labels[value][lang];
            });
        };
        updateButtonGroupText(formatBtnGroup, uiTexts.formatButtonLabels);
        updateButtonGroupText(actionBtnGroup, uiTexts.actionButtonLabels);
        updateButtonGroupText(targetBtnGroup, uiTexts.targetButtonLabels);

        resetSearchBtn.title = uiTexts.buttonTitles.resetSearch[lang];
        nsfwFilterBtn.title = uiTexts.buttonTitles.nsfwFilter[lang];
        clearAllBtn.title = uiTexts.buttonTitles.clearAll[lang];
        toggleLanguageBtn.title = uiTexts.buttonTitles.toggleLanguage[lang];
        updateCustomTagsEditorText();

        // 只有在数据加载后才执行渲染，否则会出错
        if (isDataLoaded) {
            renderPrimaryCategories();
            renderSecondaryCategories();
            renderTags();
            renderSelectedTags();
        }
    }
    function applyThemeFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const systemParams = window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === 'object'
            ? window.simpleaiTopbarSystemParams
            : {};
        const rawTheme = params.get('__theme')
            || systemParams.__theme
            || document.documentElement.getAttribute('data-theme')
            || document.body?.getAttribute?.('data-theme')
            || 'light';
        const theme = String(rawTheme).toLowerCase().includes('dark') ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.classList.toggle('dark', theme === 'dark');
        document.documentElement.classList.toggle('light', theme !== 'dark');
        if (document.body) {
            document.body.setAttribute('data-theme', theme);
            document.body.classList.toggle('dark', theme === 'dark');
            document.body.classList.toggle('light', theme !== 'dark');
        }
    }

    // --- 启动应用 ---
    init(); // 1. 初始化UI骨架
    applyThemeFromUrl(); 
    setupEventListeners(); // 2. 绑定基础事件
    positionDraggableContainer();
    if (isNsfwFilterActive) nsfwFilterBtn.classList.add('active');
    if (displayEnglishOnly) toggleLanguageBtn.classList.add('active');
    updateUIText(tagCartLang());
    window.SimpAITagCartAdapter = {
        open: openTagCartForWorkbench,
        close: hideTagCartPanel,
        clearTarget: () => { workbenchTarget = null; workbenchBaseText = ''; clearTimeout(workbenchAutoWriteTimer); },
        formatSelectedTags: () => formatTags(),
        isReady: () => !!draggableContainer
    };
    
    // [优化 5] 设置MutationObserver来监听面板显示，以触发懒加载
    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            // 我们只关心 style 属性的变化
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                // 当面板从 'none' 变为可见状态时 (外部脚本会设置 display: 'block')
                // 并且数据尚未加载
                if (draggableContainer.style.display !== 'none') {
                    installTagCartResize();
                    requestAnimationFrame(() => {
                        if (!hasCenteredTagCartOnFirstOpen) {
                            centerTagCartInViewport(true);
                            hasCenteredTagCartOnFirstOpen = true;
                            if (tagcartResizeState && tagcartResizeState.syncCurrentRectToInline) {
                                tagcartResizeState.syncCurrentRectToInline();
                            }
                        } else if (tagcartResizeState && tagcartResizeState.ensureWithinViewport) {
                            tagcartResizeState.ensureWithinViewport(true);
                        } else {
                            ensureTagCartWithinViewport(true);
                        }
                    });
                }
                if (draggableContainer.style.display !== 'none' && !isDataLoaded) {
                    console.log("检测到面板变为可见，首次触发数据加载。");
                    triggerDataLoadAndDisplay(); // 调用我们的懒加载函数
                    
                    // 可选：数据只需要加载一次，之后可以断开观察者以节省资源
                    // observer.disconnect(); // 但保持连接也无害，因为 isDataLoaded 标志会阻止重复加载
                }
            }
        }
    });

    // 开始观察 draggableContainer 的属性变化
    observer.observe(draggableContainer, { attributes: true });


    new Sortable(selectedTagsContainer, {
        animation: 150, 
        ghostClass: 'ghost-class', 
        filter: '.tag-chip-weight-control, .tag-chip-weight-btn, .tag-chip-weight-input',
        preventOnFilter: false,
        onEnd: (evt) => {
            const movedTag = selectedTags.splice(evt.oldIndex, 1)[0];
            selectedTags.splice(evt.newIndex, 0, movedTag);
            scheduleWorkbenchAutoWrite();
        }
    });

    // [优化 6] 移除原有的立即执行的异步加载块
    /*
    (async () => {
        await loadAllData();
        renderPrimaryCategories();
        applyFiltersAndRender();
        updateUIText(displayEnglishOnly ? 'en' : 'zh');
    })();
    */
   // 现在，所有数据加载和后续渲染都由 MutationObserver 触发。
}

// ==================== 移动设备检测 ====================
function isMobileDevice() {
    return /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent.toLowerCase());
}

// --- 轮询机制 (无变化) ---
function bootTagAssistantLogic() {
    if (simpleaiTagAssistantBootStarted) return;
    simpleaiTagAssistantBootStarted = true;
    if (isMobileDevice()) {
        console.log("移动设备，启用触控版标签助手。");
    }
    console.log("Window loaded. Initializing tag assistant logic and starting to poll for Gradio app...");

    try {
        initializeTagAssistantLogic(); // 立即执行，创建UI骨架和监听器

        if (window.SimpAIInfiniteCanvasStandalone) {
            document.body.appendChild(appRootInstance);
            return;
        }

        let attempts = 0;
        const maxAttempts = 50;
        const intervalId = setInterval(() => {
            const gradioContainer = typeof gradioApp === 'function' ? gradioApp() : null;
            
            if (gradioContainer) {
                console.log("Gradio app found! Appending tag assistant.");
                gradioContainer.appendChild(appRootInstance);
                clearInterval(intervalId);
            } else {
                attempts++;
                if (attempts >= maxAttempts) {
                    console.error("Gradio app not found after multiple attempts. Appending to body as a fallback.");
                    document.body.appendChild(appRootInstance);
                    clearInterval(intervalId);
                }
            }
        }, 100);

    } catch (e) {
        console.error("Failed to initialize Tag Assistant Logic:", e);
    }
}

if (document.readyState === 'complete') {
    bootTagAssistantLogic();
} else {
    window.addEventListener('load', bootTagAssistantLogic, { once: true });
}
