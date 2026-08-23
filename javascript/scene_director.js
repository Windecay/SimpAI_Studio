const SCENE_DIRECTOR_TEXT = {
    "Director": "导演",
    "Director Workspace": "导演工作台",
    "Director mode": "导演模式",
    "Director README": "导演台说明",
    "Compose timeline": "合成时间线",
    "Timeline format": "时间线格式",
    "Timeline preview": "时间线预览",
    "Video track": "视频轨",
    "Audio track": "音频轨",
    "Prompt track": "提示词轨",
    "Compose on": "合成开启",
    "Compose off": "合成关闭",
    "No shots": "无分镜",
    "Move shot": "移动分镜",
    "Adjust start": "调整开始",
    "Adjust end": "调整结束",
    "Width": "宽度",
    "Height": "高度",
    "FPS": "FPS",
    "Duration": "时长",
    "Compose width": "合成宽度",
    "Compose height": "合成高度",
    "Compose FPS": "合成 FPS",
    "Timeline range": "时间轴范围",
    "Director audio pool": "导演音频素材",
    "Director video pool": "导演视频素材",
    "Shots": "分镜",
    "Start": "开始",
    "End": "结束",
    "Prompt": "提示词",
    "Prompt Tools": "提示工具",
    "Image ref": "图像引用",
    "Image ref 1": "图像引用 1",
    "Image ref 2": "图像引用 2",
    "Image refs": "图像引用",
    "Image": "图片",
    "Images": "图片",
    "Image 1": "图片 1",
    "Image 2": "图片 2",
    "Image 3": "图片 3",
    "Image 4": "图片 4",
    "Image 5": "图片 5",
    "Image 6": "图片 6",
    "Image 7": "图片 7",
    "Image 8": "图片 8",
    "Image 9": "图片 9",
    "Drop image": "拖入图片",
    "Click or drop": "点击或拖入",
    "Clear": "清除",
    "Audio": "音频",
    "Video": "视频",
    "Upload below": "在下方上传",
    "Previous shot result": "上一段结果",
    "Previous shot last frame": "上一段尾帧",
    "Inherit previous shot last frame": "继承上段尾帧",
    "Generate": "生成",
    "Generate shots": "生成分镜",
    "None": "无",
    "Text-to-Video": "文生视频",
    "No image input": "不使用图片",
    "Media input disabled for current preset": "当前 preset 不使用此类素材",
    "Director mode uses shot prompts": "导演模式使用分镜提示词",
    "Missing first frame": "缺首帧",
    "Shot": "分镜",
    "Add shot": "新增分镜",
    "Delete shot": "删除分镜",
    "Move up": "上移",
    "Move down": "下移",
    "0 images: Text-to-Video": "0 张图：文生视频",
    "1 image: Image-to-Video / first frame": "1 张图：图生视频 / 首帧",
    "1 image: {image} as first frame": "1 张图：{image} 作为首帧",
    "2 images: First/last frame": "2 张图：首尾帧",
    "2 images: {first} first frame / {last} last frame": "2 张图：{first} 首帧 / {last} 尾帧",
    "3-9 images: Reference set": "3-9 张图：参考图组",
    "3-9 images: Reference set ({images})": "3-9 张图：参考图组（{images}）",
    "First frame": "首帧",
    "Last frame": "尾帧",
    "Reference {index}": "参考 {index}",
    "Not selectable: current preset accepts up to {count} image(s)": "不可选：当前 preset 最多支持 {count} 张图",
    "Current preset requires a first-frame image": "当前 preset 需要首帧图片",
    "Current preset does not use image refs": "当前 preset 不使用图片引用",
    "Current preset accepts up to {count} image(s)": "当前 preset 最多支持 {count} 张图",
    "Max {count} image(s)": "上限 {count} 张",
    "0 image = Text-to-Video | 1 image = Image-to-Video / first frame | 2 images = First/last frame | 3-9 images = Reference set | optional video_1 = Video reference": "0 张图 = 文生视频 | 1 张图 = 图生视频 / 首帧 | 2 张图 = 首尾帧 | 3-9 张图 = 参考图组 | 可选 video_1 = 视频参考",
    "0 image = Text-to-Video | 1 image = Image-to-Video / first frame | 2 images = First/last frame | 3-9 images = Reference set | previous_segment_last_frame = previous shot last frame | audio_1-5 / video_1-5 = media refs | previous_segment = previous shot result": "0 张图 = 文生视频 | 1 张图 = 图生视频 / 首帧 | 2 张图 = 首尾帧 | 3-9 张图 = 参考图组 | previous_segment_last_frame = 上一段尾帧 | audio_1-5 / video_1-5 = 媒体引用 | previous_segment = 上一段结果",
    "Audio ref": "音频引用",
    "Video ref": "视频引用"
};

const SCENE_DIRECTOR_MEDIA_RULES_TEXT = "0 image = Text-to-Video | 1 image = Image-to-Video / first frame | 2 images = First/last frame | 3-9 images = Reference set | previous_segment_last_frame = previous shot last frame | audio_1-5 / video_1-5 = media refs | previous_segment = previous shot result";
const SCENE_DIRECTOR_README_TEXT = "Director README";

function sceneDirectorQuery(selector) {
    try {
        const root = (typeof gradioApp === "function") ? gradioApp() : document;
        return (root && root.querySelector ? root.querySelector(selector) : null) || document.querySelector(selector);
    } catch (e) {
        try { return document.querySelector(selector); } catch (_e) { return null; }
    }
}

function sceneDirectorIsEnglish() {
    try {
        if (window.SimpAII18n && typeof window.SimpAII18n.isEnglishUi === "function") {
            return window.SimpAII18n.isEnglishUi(window.simpleaiTopbarSystemParams || {});
        }
    } catch (e) {}
    const lang = String(
        (window.simpleaiTopbarSystemParams && window.simpleaiTopbarSystemParams.__lang) ||
        (typeof locale_lang !== "undefined" ? locale_lang : "") ||
        ""
    ).toLowerCase();
    return lang.startsWith("en");
}

function sceneDirectorText(en) {
    if (sceneDirectorIsEnglish()) return en;
    if (window.localization && window.localization[en]) return window.localization[en];
    return SCENE_DIRECTOR_TEXT[en] || en;
}

function sceneDirectorLanguageKey() {
    return sceneDirectorIsEnglish() ? "en" : "zh";
}

function sceneDirectorIdentity(text) {
    const clean = String(text || "").trim();
    if (!clean) return "";
    if (SCENE_DIRECTOR_TEXT[clean]) return clean;
    for (const [en, cn] of Object.entries(SCENE_DIRECTOR_TEXT)) {
        if (clean === cn) return en;
    }
    return "";
}

function sceneDirectorSetText(node, en) {
    if (!node) return;
    const wanted = sceneDirectorText(en);
    if (node.textContent.trim() !== wanted) {
        node.textContent = wanted;
    }
    try {
        if (node.getAttribute("data-original-text") !== en) {
            node.setAttribute("data-original-text", en);
        }
    } catch (e) {}
}

function sceneDirectorTranslateTextNodes(root) {
    if (!root || !document.createTreeWalker) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node && node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            if (["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "OPTION"].includes(parent.tagName)) {
                return NodeFilter.FILTER_REJECT;
            }
            return sceneDirectorIdentity(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
        const original = String(node.nodeValue || "");
        const identity = sceneDirectorIdentity(original);
        if (!identity) return;
        const leading = (original.match(/^\s*/) || [""])[0];
        const trailing = (original.match(/\s*$/) || [""])[0];
        const wanted = `${leading}${sceneDirectorText(identity)}${trailing}`;
        if (node.nodeValue !== wanted) {
            node.nodeValue = wanted;
        }
        try {
            if (node.parentElement.getAttribute("data-original-text") !== identity) {
                node.parentElement.setAttribute("data-original-text", identity);
            }
        } catch (e) {}
    });
}

function sceneDirectorTranslateAttributes(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll("[aria-label], [placeholder], [title]").forEach((node) => {
        ["aria-label", "placeholder", "title"].forEach((attr) => {
            const identity = sceneDirectorIdentity(node.getAttribute(attr));
            if (!identity) return;
            const wanted = sceneDirectorText(identity);
            if (node.getAttribute(attr) !== wanted) node.setAttribute(attr, wanted);
        });
    });
}

function sceneDirectorLabelNode(root) {
    if (!root || !root.querySelector) return null;
    return root.querySelector("label span") ||
        root.querySelector(".label-wrap span") ||
        root.querySelector(".block-label span") ||
        root.querySelector("span");
}

function sceneDirectorSetComponentLabel(selector, en) {
    const root = sceneDirectorQuery(selector);
    sceneDirectorSetText(sceneDirectorLabelNode(root), en);
}

const SCENE_DIRECTOR_MAX_IMAGE_REFS = 9;
const SCENE_DIRECTOR_LEGACY_MAX_IMAGE_REFS = 5;
const SCENE_DIRECTOR_IMAGE_START_INDEX = 3;
const SCENE_DIRECTOR_AUDIO_INDEX = SCENE_DIRECTOR_IMAGE_START_INDEX + SCENE_DIRECTOR_MAX_IMAGE_REFS;
const SCENE_DIRECTOR_VIDEO_INDEX = SCENE_DIRECTOR_AUDIO_INDEX + 1;
const SCENE_DIRECTOR_IMAGE_OPTIONS = ["", "image_1", "image_2", "image_3", "image_4", "image_5", "image_6", "image_7", "image_8", "image_9"];
const SCENE_DIRECTOR_AUDIO_OPTIONS = ["", "audio_1", "audio_2", "audio_3", "audio_4", "audio_5"];
const SCENE_DIRECTOR_VIDEO_OPTIONS = ["", "video_1", "video_2", "video_3", "video_4", "video_5"];
const SCENE_DIRECTOR_PREVIOUS_VIDEO_REF = "previous_segment";
const SCENE_DIRECTOR_PREVIOUS_IMAGE_REF = "previous_segment_last_frame";
const SCENE_DIRECTOR_DEFAULT_ROWS = [
    [0, 5, "A slow camera move across a neon street.", "image_1", "", "", "", "", "", "", "", "", "", ""],
    [5, 10, "The subject turns toward the light.", "", "", "", "", "", "", "", "", "", "", "", ""],
];
const SCENE_DIRECTOR_DRAFT_SCHEMA = "simpai.scene_director_draft.v1";
const SCENE_DIRECTOR_DRAFT_STORAGE_PREFIX = "simpai.sceneDirectorDraft.v1:";
const SCENE_DIRECTOR_DRAFT_ASSET_DB = "simpai.sceneDirectorDraftAssets";
const SCENE_DIRECTOR_DRAFT_ASSET_STORE = "assets";
const SCENE_DIRECTOR_DRAFT_INLINE_MEDIA_LIMIT = 12000;
const SCENE_DIRECTOR_DRAFT_MEDIA_KEYS = ["data_url", "src", "thumb", "data"];
const SCENE_DIRECTOR_DRAFT_CONTROL_SELECTORS = [
    "#scene_director_enabled",
    "#scene_director_compose",
    "#scene_director_width",
    "#scene_director_height",
    "#scene_director_fps",
    "#scene_director_duration",
];
const SCENE_DIRECTOR_CAPABILITY_KEYS = [
    "image_policy", "audio_policy", "video_policy", "max_images", "min_images", "image_modes", "video_modes",
    "timeline_format", "target_format", "chain_output", "requires_sequential", "mixed_segments", "director_supported", "segment_duration_param", "min_segment_duration", "max_segment_duration",
    "duration_strategy", "audio_output",
    "imagePolicy", "audioPolicy", "videoPolicy", "maxImages", "minImages", "imageModes", "videoModes", "chainOutput",
    "directorSupported", "segmentDurationParam", "durationStrategy", "audioOutput", "minSegmentDuration", "maxSegmentDuration",
];
const SCENE_DIRECTOR_PRESET_CAPABILITY_CACHE = new Map();
const SCENE_DIRECTOR_PRESET_CAPABILITY_LOADING = new Set();
let sceneDirectorDraftSaveTimer = null;
let sceneDirectorDraftActiveKey = "";
let sceneDirectorDraftReady = false;
let sceneDirectorDraftRestoreTimer = null;
let sceneDirectorDraftRestorePending = false;
let sceneDirectorDraftSaveRevision = 0;
let sceneDirectorDraftCommittedRevision = 0;
let sceneDirectorDraftSavePaused = 0;
let sceneDirectorDraftAssetDbPromise = null;
let sceneDirectorWorkspaceInitTimer = null;
let sceneDirectorWorkspaceInitializing = false;
let sceneDirectorLocalizationRefreshing = false;
let sceneDirectorTimelineDragState = null;
let sceneDirectorTimelineDragFrame = null;
let sceneDirectorTimelineDragPendingPoint = null;
let sceneDirectorActiveShotIndex = 0;

function sceneDirectorCapability() {
    sceneDirectorEnsurePresetCapabilityLoaded();
    let inferredDerivedCapability = null;
    try {
        if (typeof window.sceneDirectorCapabilityFromSystemParams === "function") {
            const params = window.simpleaiTopbarSystemParams || {};
            const derivedCapability = window.sceneDirectorCapabilityFromSystemParams(params);
            if (derivedCapability && typeof derivedCapability === "object") {
                const normalized = sceneDirectorNormalizeCapability(derivedCapability);
                if (String(derivedCapability.source || "") !== "inferred") {
                    sceneDirectorApplyCapabilityDataset(normalized);
                    return normalized;
                }
                inferredDerivedCapability = normalized;
            }
        }
    } catch (e) {}
    const systemCapability = sceneDirectorSystemCapability();
    if (sceneDirectorHasCapability(systemCapability)) {
        const normalized = sceneDirectorNormalizeCapability(systemCapability);
        sceneDirectorApplyCapabilityDataset(normalized);
        return normalized;
    }
    const cachedCapability = sceneDirectorCachedPresetCapability();
    if (sceneDirectorHasCapability(cachedCapability)) {
        const normalized = sceneDirectorNormalizeCapability(cachedCapability);
        sceneDirectorApplyCapabilityDataset(normalized);
        return normalized;
    }
    const datasetCapability = sceneDirectorDatasetCapability();
    if (sceneDirectorHasCapability(datasetCapability)) {
        return sceneDirectorNormalizeCapability(datasetCapability);
    }
    if (sceneDirectorHasCapability(inferredDerivedCapability)) {
        sceneDirectorApplyCapabilityDataset(inferredDerivedCapability);
        return inferredDerivedCapability;
    }
    return sceneDirectorNormalizeCapability(sceneDirectorDatasetCapability(true));
}

function sceneDirectorMediaGroupTitle(groupKey) {
    if (groupKey === "images") return "Images";
    if (groupKey === "audio") return "Audio";
    if (groupKey === "video") return "Video";
    return "";
}

function sceneDirectorRenderRules() {
    const root = sceneDirectorQuery("#scene_director_media_rules");
    if (!root) return;
    const textNode = root.querySelector("[data-scene-director-rules-text]");
    if (textNode) {
        sceneDirectorSetText(textNode, SCENE_DIRECTOR_MEDIA_RULES_TEXT);
    } else {
        sceneDirectorTranslateTextNodes(root);
    }
    const readmeLink = root.querySelector("[data-scene-director-readme-link]");
    if (readmeLink) {
        sceneDirectorSetText(readmeLink, SCENE_DIRECTOR_README_TEXT);
        readmeLink.setAttribute("target", "_blank");
        readmeLink.setAttribute("rel", "noopener noreferrer");
    }
    sceneDirectorTranslateAttributes(root);
}

function sceneDirectorHasCapability(value) {
    return !!(value && typeof value === "object" && !Array.isArray(value) &&
        SCENE_DIRECTOR_CAPABILITY_KEYS.some((key) => Object.prototype.hasOwnProperty.call(value, key)));
}

function sceneDirectorThemeValue(value, theme, fallback) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        if (theme && Object.prototype.hasOwnProperty.call(value, theme)) return value[theme];
        if (Object.prototype.hasOwnProperty.call(value, "default")) return value.default;
        const first = Object.values(value)[0];
        return first === undefined ? fallback : first;
    }
    return value === undefined || value === null ? fallback : value;
}

function sceneDirectorCapabilityCandidate(value, theme) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    if (sceneDirectorHasCapability(value)) return value;
    if (theme && value[theme] && typeof value[theme] === "object") return value[theme];
    if (value.default && typeof value.default === "object") return value.default;
    return {};
}

function sceneDirectorThemeFromParams(params) {
    const direct = String((params && (params.__scene_theme || params.scene_theme)) || "").trim();
    if (direct) return direct;
    const engine = params && params.default_engine && typeof params.default_engine === "object" ? params.default_engine : {};
    const frontend = params && params.scene_frontend && typeof params.scene_frontend === "object"
        ? params.scene_frontend
        : (engine.scene_frontend && typeof engine.scene_frontend === "object" ? engine.scene_frontend : {});
    const themes = frontend.theme;
    if (typeof themes === "string") return themes;
    if (Array.isArray(themes)) return String(themes[0] || "");
    return "";
}

function sceneDirectorSystemCapability() {
    const params = window.simpleaiTopbarSystemParams || {};
    const theme = sceneDirectorThemeFromParams(params);
    const sceneFrontend = params.scene_frontend && typeof params.scene_frontend === "object" ? params.scene_frontend : {};
    const defaultEngine = params.default_engine && typeof params.default_engine === "object" ? params.default_engine : {};
    const defaultScene = defaultEngine.scene_frontend && typeof defaultEngine.scene_frontend === "object" ? defaultEngine.scene_frontend : {};
    const prepared = params && typeof params.__preset_prepared === "object" ? params.__preset_prepared : {};
    const preparedEngine = prepared && typeof prepared.engine === "object" ? prepared.engine : {};
    const preparedScene = preparedEngine.scene_frontend && typeof preparedEngine.scene_frontend === "object" ? preparedEngine.scene_frontend : {};
    const candidates = [
        params.director_capability,
        params.__director_capability,
        sceneFrontend.director_capability,
        defaultEngine.director_capability,
        defaultScene.director_capability,
        preparedEngine.director_capability,
        preparedScene.director_capability,
    ];
    for (const candidate of candidates) {
        const capability = sceneDirectorCapabilityCandidate(candidate, theme);
        if (sceneDirectorHasCapability(capability)) return capability;
    }
    return {};
}

function sceneDirectorDatasetCapability(withDefaults = false) {
    const root = document.documentElement;
    const accordion = sceneDirectorQuery("#scene_director_accordion");
    const datasetValue = (key, fallback = "") => {
        const rootValue = root && root.dataset ? root.dataset[key] : "";
        const accordionValue = accordion && accordion.dataset ? accordion.dataset[key] : "";
        return String(rootValue || accordionValue || fallback);
    };
    const raw = {
        imagePolicy: datasetValue("simpaiSceneDirectorImagePolicy", withDefaults ? "optional" : ""),
        audioPolicy: datasetValue("simpaiSceneDirectorAudioPolicy", withDefaults ? "optional" : ""),
        videoPolicy: datasetValue("simpaiSceneDirectorVideoPolicy", withDefaults ? "optional" : ""),
        maxImages: datasetValue("simpaiSceneDirectorMaxImages", withDefaults ? "5" : ""),
        minImages: datasetValue("simpaiSceneDirectorMinImages", ""),
        segmentDurationParam: datasetValue("simpaiSceneDirectorSegmentDurationParam", withDefaults ? "scene_video_duration" : ""),
        durationStrategy: datasetValue("simpaiSceneDirectorDurationStrategy", withDefaults ? "shot" : ""),
        audioOutput: datasetValue("simpaiSceneDirectorAudioOutput", withDefaults ? "silent" : ""),
        directorSupported: datasetValue("simpaiSceneDirectorSupported", withDefaults ? "1" : ""),
        minSegmentDuration: datasetValue("simpaiSceneDirectorMinSegmentDuration", withDefaults ? "0.1" : ""),
        maxSegmentDuration: datasetValue("simpaiSceneDirectorMaxSegmentDuration", withDefaults ? "10" : ""),
        videoModes: datasetValue("simpaiSceneDirectorVideoModes", withDefaults ? "explicit" : ""),
        chainOutput: datasetValue("simpaiSceneDirectorChainOutput", withDefaults ? "timeline" : ""),
    };
    if (!withDefaults) {
        Object.keys(raw).forEach((key) => {
            if (raw[key] === "") delete raw[key];
        });
    }
    return raw;
}

function sceneDirectorPresetName() {
    const params = window.simpleaiTopbarSystemParams || {};
    return String(params.__preset || params.preset || params.preset_name || params.bar_button || "").trim();
}

function sceneDirectorDraftIdentity() {
    const params = window.simpleaiTopbarSystemParams || {};
    const prepared = params && typeof params.__preset_prepared === "object" ? params.__preset_prepared : {};
    const preset = sceneDirectorPresetName() || String(prepared.name || prepared.preset || "default").trim() || "default";
    const theme = sceneDirectorThemeFromParams(params) || String(params.__theme || params.theme || "default").trim() || "default";
    const user = String(params.__user_did || params.user_did || params.user_id || params.username || "local").trim() || "local";
    return { preset, theme, user };
}

function sceneDirectorDraftStorageKey() {
    const identity = sceneDirectorDraftIdentity();
    return SCENE_DIRECTOR_DRAFT_STORAGE_PREFIX + [identity.user, identity.preset, identity.theme]
        .map((part) => encodeURIComponent(String(part || "default")))
        .join(":");
}

function sceneDirectorCurrentDraftKey() {
    const key = sceneDirectorDraftStorageKey();
    if (key !== sceneDirectorDraftActiveKey) {
        sceneDirectorDraftActiveKey = key;
        sceneDirectorDraftReady = false;
        sceneDirectorDraftRestorePending = false;
        sceneDirectorDraftSaveRevision = 0;
        sceneDirectorDraftCommittedRevision = 0;
        if (sceneDirectorDraftSaveTimer) {
            clearTimeout(sceneDirectorDraftSaveTimer);
            sceneDirectorDraftSaveTimer = null;
        }
    }
    return key;
}

function sceneDirectorWithDraftSavePaused(callback) {
    sceneDirectorDraftSavePaused += 1;
    try {
        return callback();
    } finally {
        sceneDirectorDraftSavePaused = Math.max(0, sceneDirectorDraftSavePaused - 1);
    }
}

function sceneDirectorLocalStorage() {
    try {
        return window.localStorage || null;
    } catch (e) {
        return null;
    }
}

function sceneDirectorIndexedDB() {
    try {
        return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB || null;
    } catch (e) {
        return null;
    }
}

function sceneDirectorOpenDraftAssetDB() {
    if (sceneDirectorDraftAssetDbPromise) return sceneDirectorDraftAssetDbPromise;
    const indexedDBImpl = sceneDirectorIndexedDB();
    if (!indexedDBImpl) {
        sceneDirectorDraftAssetDbPromise = Promise.resolve(null);
        return sceneDirectorDraftAssetDbPromise;
    }
    sceneDirectorDraftAssetDbPromise = new Promise((resolve) => {
        let request = null;
        try {
            request = indexedDBImpl.open(SCENE_DIRECTOR_DRAFT_ASSET_DB, 1);
        } catch (e) {
            resolve(null);
            return;
        }
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(SCENE_DIRECTOR_DRAFT_ASSET_STORE)) {
                const store = db.createObjectStore(SCENE_DIRECTOR_DRAFT_ASSET_STORE, { keyPath: "id" });
                store.createIndex("draft_key", "draft_key", { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
    });
    return sceneDirectorDraftAssetDbPromise;
}

function sceneDirectorDraftAssetId(draftKey, group, ref) {
    return `${draftKey}:${group}:${ref}`;
}

function sceneDirectorDraftAssetTx(db, mode, callback) {
    return new Promise((resolve) => {
        if (!db) {
            resolve(null);
            return;
        }
        let tx = null;
        try {
            tx = db.transaction(SCENE_DIRECTOR_DRAFT_ASSET_STORE, mode);
            const store = tx.objectStore(SCENE_DIRECTOR_DRAFT_ASSET_STORE);
            const result = callback(store);
            tx.oncomplete = () => resolve(result);
            tx.onerror = () => resolve(null);
            tx.onabort = () => resolve(null);
        } catch (e) {
            resolve(null);
        }
    });
}

async function sceneDirectorPutDraftAsset(record) {
    const db = await sceneDirectorOpenDraftAssetDB();
    return sceneDirectorDraftAssetTx(db, "readwrite", (store) => store.put(record));
}

async function sceneDirectorGetDraftAsset(id) {
    const db = await sceneDirectorOpenDraftAssetDB();
    return new Promise((resolve) => {
        if (!db || !id) {
            resolve(null);
            return;
        }
        try {
            const tx = db.transaction(SCENE_DIRECTOR_DRAFT_ASSET_STORE, "readonly");
            const request = tx.objectStore(SCENE_DIRECTOR_DRAFT_ASSET_STORE).get(id);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => resolve(null);
            tx.onerror = () => resolve(null);
            tx.onabort = () => resolve(null);
        } catch (e) {
            resolve(null);
        }
    });
}

async function sceneDirectorDeleteDraftAsset(id) {
    const db = await sceneDirectorOpenDraftAssetDB();
    return sceneDirectorDraftAssetTx(db, "readwrite", (store) => store.delete(id));
}

function sceneDirectorDraftMediaGroups(text) {
    if (!text) return { images: {}, audio: {}, video: {} };
    try {
        const parsed = JSON.parse(String(text || "{}"));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { images: {}, audio: {}, video: {} };
        return {
            images: parsed.images && typeof parsed.images === "object" && !Array.isArray(parsed.images) ? parsed.images : {},
            audio: parsed.audio && typeof parsed.audio === "object" && !Array.isArray(parsed.audio) ? parsed.audio : {},
            video: parsed.video && typeof parsed.video === "object" && !Array.isArray(parsed.video) ? parsed.video : {},
        };
    } catch (e) {
        return { images: {}, audio: {}, video: {} };
    }
}

function sceneDirectorShouldExternalizeMediaValue(value) {
    const text = typeof value === "string" ? value : "";
    return text.length > SCENE_DIRECTOR_DRAFT_INLINE_MEDIA_LIMIT || /^data:/i.test(text);
}

function sceneDirectorDraftMediaRefList() {
    return {
        images: SCENE_DIRECTOR_IMAGE_OPTIONS.filter(Boolean),
        audio: SCENE_DIRECTOR_AUDIO_OPTIONS.filter(Boolean),
        video: SCENE_DIRECTOR_VIDEO_OPTIONS.filter(Boolean),
    };
}

async function sceneDirectorExternalizeDraftMediaState(mediaStateText, draftKey) {
    const db = await sceneDirectorOpenDraftAssetDB();
    if (!db) {
        return {
            media_state: mediaStateText || "",
            media_asset_ids: [],
            media_storage: "inline",
        };
    }
    const groups = sceneDirectorDraftMediaGroups(mediaStateText);
    const refsByGroup = sceneDirectorDraftMediaRefList();
    const keepAssetIds = new Set();
    await Promise.all(Object.entries(groups).flatMap(([group, bucket]) => (
        Object.entries(bucket || {}).map(async ([ref, item]) => {
            if (!item || typeof item !== "object") return;
            const fields = {};
            SCENE_DIRECTOR_DRAFT_MEDIA_KEYS.forEach((field) => {
                const value = item[field];
                if (sceneDirectorShouldExternalizeMediaValue(value)) fields[field] = value;
            });
            const id = sceneDirectorDraftAssetId(draftKey, group, ref);
            if (Object.keys(fields).length) {
                keepAssetIds.add(id);
                await sceneDirectorPutDraftAsset({
                    id,
                    draft_key: draftKey,
                    group,
                    ref,
                    fields,
                    updated_at: new Date().toISOString(),
                    name: item.name || item.title || ref,
                    mime: item.mime || "",
                    size: item.size || 0,
                });
                item.__draft_asset_id = id;
                item.__draft_asset_fields = Object.keys(fields);
                Object.keys(fields).forEach((field) => {
                    delete item[field];
                });
            } else if (item.__draft_asset_id) {
                keepAssetIds.add(String(item.__draft_asset_id));
            }
        })
    )));
    const allAssetIds = Object.entries(refsByGroup).flatMap(([group, refs]) => (
        refs.map((ref) => sceneDirectorDraftAssetId(draftKey, group, ref))
    ));
    await Promise.all(allAssetIds.filter((id) => !keepAssetIds.has(id)).map((id) => sceneDirectorDeleteDraftAsset(id)));
    return {
        media_state: JSON.stringify(groups),
        media_asset_ids: Array.from(keepAssetIds),
        media_storage: keepAssetIds.size ? "indexeddb" : "inline",
    };
}

async function sceneDirectorHydrateDraftMediaState(draft) {
    if (!draft || typeof draft !== "object" || typeof draft.media_state !== "string") return draft;
    const groups = sceneDirectorDraftMediaGroups(draft.media_state);
    const entries = Object.values(groups).flatMap((bucket) => Object.entries(bucket || {}));
    await Promise.all(entries.map(async ([_ref, item]) => {
        if (!item || typeof item !== "object" || !item.__draft_asset_id) return;
        const asset = await sceneDirectorGetDraftAsset(String(item.__draft_asset_id));
        const fields = asset && asset.fields && typeof asset.fields === "object" ? asset.fields : {};
        Object.entries(fields).forEach(([field, value]) => {
            if (typeof value === "string" && !item[field]) item[field] = value;
        });
    }));
    return Object.assign({}, draft, { media_state: JSON.stringify(groups) });
}

function sceneDirectorControlInput(selector) {
    const root = sceneDirectorQuery(selector);
    if (!root || !root.querySelector) return null;
    return root.querySelector('input[type="number"]') ||
        root.querySelector("select") ||
        root.querySelector("textarea") ||
        root.querySelector('input:not([type="range"]):not([type="checkbox"])') ||
        root.querySelector('input[type="range"]') ||
        root.querySelector("input");
}

function sceneDirectorControlValue(selector) {
    const input = sceneDirectorControlInput(selector);
    return input ? input.value : "";
}

function sceneDirectorSetTextFieldValue(field, value, dispatch = false) {
    if (!field) return false;
    const next = String(value ?? "");
    if (field.value === next) return false;
    field.value = next;
    if (dispatch) {
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
}

function sceneDirectorDispatchFieldChange(field) {
    if (!field) return false;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
}

function sceneDirectorDispatchControlChange(selector) {
    const field = sceneDirectorCheckboxInput(selector) || sceneDirectorControlInput(selector);
    return sceneDirectorDispatchFieldChange(field);
}

function sceneDirectorDispatchDraftValues() {
    [
        "#scene_director_enabled",
        "#scene_director_compose",
        "#scene_director_width",
        "#scene_director_height",
        "#scene_director_fps",
        "#scene_director_duration",
    ].forEach((selector) => sceneDirectorDispatchControlChange(selector));
    sceneDirectorDispatchFieldChange(sceneDirectorEditorField());
    sceneDirectorDispatchFieldChange(sceneDirectorMediaStateField());
}

function sceneDirectorSetControlValue(selector, value, dispatch = false) {
    const root = sceneDirectorQuery(selector);
    if (!root || !root.querySelectorAll) return false;
    const next = String(value ?? "");
    let changed = false;
    root.querySelectorAll("input, textarea, select").forEach((node) => {
        if (node.type === "checkbox") return;
        if (node.value !== next) {
            node.value = next;
            changed = true;
            if (dispatch) {
                node.dispatchEvent(new Event("input", { bubbles: true }));
                node.dispatchEvent(new Event("change", { bubbles: true }));
            }
        }
    });
    return changed;
}

function sceneDirectorDraftControlsMounted() {
    return !!(
        sceneDirectorCheckboxInput("#scene_director_enabled") &&
        sceneDirectorCheckboxInput("#scene_director_compose") &&
        sceneDirectorControlInput("#scene_director_width") &&
        sceneDirectorControlInput("#scene_director_height") &&
        sceneDirectorControlInput("#scene_director_fps") &&
        sceneDirectorControlInput("#scene_director_duration") &&
        sceneDirectorEditorField() &&
        sceneDirectorMediaStateField()
    );
}

function sceneDirectorScheduleDraftRestore(delay = 80) {
    if (sceneDirectorDraftRestoreTimer) clearTimeout(sceneDirectorDraftRestoreTimer);
    sceneDirectorDraftRestoreTimer = setTimeout(() => {
        sceneDirectorDraftRestoreTimer = null;
        sceneDirectorRestoreDraft();
    }, delay);
}

function sceneDirectorBindDraftRestoreObserver() {
    const accordion = sceneDirectorQuery("#scene_director_accordion");
    if (!accordion) return;
    if (accordion.dataset.sceneDirectorDraftRestoreBound !== "1") accordion.dataset.sceneDirectorDraftRestoreBound = "1";
    if (!accordion.__sceneDirectorDraftRestoreObserver && typeof MutationObserver !== "undefined") {
        const observer = new MutationObserver(() => {
            sceneDirectorBindDraftStorage();
            if (!sceneDirectorDraftReady || sceneDirectorDraftRestorePending) {
                sceneDirectorScheduleDraftRestore(50);
            }
        });
        observer.observe(accordion, { childList: true, subtree: true });
        accordion.__sceneDirectorDraftRestoreObserver = observer;
    }
}

function sceneDirectorDraftPayload(revision = sceneDirectorDraftSaveRevision) {
    const identity = sceneDirectorDraftIdentity();
    const editorField = sceneDirectorEditorField();
    const mediaField = sceneDirectorMediaStateField();
    const now = new Date();
    return {
        schema: SCENE_DIRECTOR_DRAFT_SCHEMA,
        updated_at: now.toISOString(),
        updated_at_ms: now.getTime(),
        revision,
        compose_default_policy: "manual",
        preset: identity.preset,
        theme: identity.theme,
        user: identity.user,
        enabled: sceneDirectorGenerateEnabled(),
        compose: !!(sceneDirectorCheckboxInput("#scene_director_compose") && sceneDirectorCheckboxInput("#scene_director_compose").checked),
        width: sceneDirectorControlValue("#scene_director_width"),
        height: sceneDirectorControlValue("#scene_director_height"),
        fps: sceneDirectorControlValue("#scene_director_fps"),
        duration: sceneDirectorControlValue("#scene_director_duration"),
        editor_state: editorField ? String(editorField.value || "") : "",
        media_state: mediaField ? String(mediaField.value || "") : "",
    };
}

async function sceneDirectorPrepareDraftPayload(payload, draftKey) {
    const next = Object.assign({}, payload || {});
    if (next.media_state) {
        const media = await sceneDirectorExternalizeDraftMediaState(next.media_state, draftKey);
        next.media_state = media.media_state;
        next.media_asset_ids = media.media_asset_ids;
        next.media_storage = media.media_storage;
    } else {
        next.media_asset_ids = [];
        next.media_storage = "inline";
    }
    return next;
}

function sceneDirectorCompactDraftPayload(payload) {
    const next = Object.assign({}, payload || {});
    if (!next.media_state) return next;
    try {
        const parsed = JSON.parse(next.media_state);
        ["images", "audio", "video"].forEach((group) => {
            const bucket = parsed && parsed[group] && typeof parsed[group] === "object" ? parsed[group] : {};
            Object.values(bucket).forEach((item) => {
                if (!item || typeof item !== "object") return;
                ["data_url", "src", "thumb"].forEach((key) => {
                    if (typeof item[key] === "string" && item[key].length > 200000) {
                        delete item[key];
                    }
                });
            });
        });
        next.media_state = JSON.stringify(parsed);
        next.media_state_compacted = true;
    } catch (e) {
        next.media_state = "";
        next.media_state_compacted = true;
    }
    return next;
}

async function sceneDirectorSaveDraft(revision = ++sceneDirectorDraftSaveRevision) {
    if (sceneDirectorDraftSavePaused > 0) return false;
    const key = sceneDirectorCurrentDraftKey();
    if (!sceneDirectorDraftReady) return false;
    const storage = sceneDirectorLocalStorage();
    if (!storage) return false;
    const saveRevision = Number(revision) || 0;
    if (saveRevision < sceneDirectorDraftSaveRevision) return false;
    const payload = await sceneDirectorPrepareDraftPayload(sceneDirectorDraftPayload(saveRevision), key);
    if (saveRevision < sceneDirectorDraftSaveRevision) return false;
    try {
        storage.setItem(key, JSON.stringify(payload));
        sceneDirectorDraftCommittedRevision = Math.max(sceneDirectorDraftCommittedRevision, saveRevision);
        return true;
    } catch (e) {
        try {
            storage.setItem(key, JSON.stringify(sceneDirectorCompactDraftPayload(payload)));
            sceneDirectorDraftCommittedRevision = Math.max(sceneDirectorDraftCommittedRevision, saveRevision);
            return true;
        } catch (_e) {
            return false;
        }
    }
}

function sceneDirectorScheduleDraftSave() {
    if (sceneDirectorDraftSavePaused > 0) return;
    const key = sceneDirectorCurrentDraftKey();
    if (!sceneDirectorDraftReady || !key) return;
    const revision = ++sceneDirectorDraftSaveRevision;
    if (sceneDirectorDraftSaveTimer) clearTimeout(sceneDirectorDraftSaveTimer);
    sceneDirectorDraftSaveTimer = setTimeout(() => {
        sceneDirectorDraftSaveTimer = null;
        sceneDirectorSaveDraft(revision);
    }, 250);
}

function sceneDirectorApplyDraft(draft) {
    if (!draft || typeof draft !== "object") return false;
    if (!sceneDirectorDraftControlsMounted()) return false;
    const directorAvailable = sceneDirectorPresetAvailable(sceneDirectorDatasetCapability(true));
    sceneDirectorWithDraftSavePaused(() => {
        sceneDirectorSetCheckboxValue("#scene_director_enabled", directorAvailable && !!draft.enabled, false);
        sceneDirectorSetControlValue("#scene_director_width", draft.width || 1280, false);
        sceneDirectorSetControlValue("#scene_director_height", draft.height || 720, false);
        sceneDirectorSetControlValue("#scene_director_fps", draft.fps || 24, false);
        sceneDirectorSetControlValue("#scene_director_duration", draft.duration || 10, false);
        const restoreCompose = draft.compose_default_policy === "manual" ? !!draft.compose : false;
        sceneDirectorSetCheckboxValue("#scene_director_compose", restoreCompose, false);
        if (typeof draft.editor_state === "string") {
            sceneDirectorSetTextFieldValue(sceneDirectorEditorField(), draft.editor_state, false);
        }
        if (typeof draft.media_state === "string") {
            sceneDirectorSetTextFieldValue(sceneDirectorMediaStateField(), draft.media_state, false);
        }
    });
    sceneDirectorSyncComposeControls();
    sceneDirectorSetGenerateButtonLabel();
    const editor = sceneDirectorQuery("#scene_director_editor_root");
    if (editor && editor.dataset) {
        delete editor.dataset.sceneDirectorRefreshSignature;
        editor.dataset.sceneDirectorRendered = "";
    }
    refresh_scene_director_editor();
    sceneDirectorDispatchDraftValues();
    return true;
}

async function sceneDirectorRestoreDraft(options = {}) {
    const key = sceneDirectorCurrentDraftKey();
    sceneDirectorBindDraftRestoreObserver();
    if (sceneDirectorDraftReady && !options.force) return false;
    if (!sceneDirectorDraftControlsMounted()) {
        sceneDirectorDraftRestorePending = true;
        return false;
    }
    const storage = sceneDirectorLocalStorage();
    let restored = false;
    if (storage && key) {
        try {
            const raw = storage.getItem(key);
            const draft = raw ? JSON.parse(raw) : null;
            if (draft && draft.schema === SCENE_DIRECTOR_DRAFT_SCHEMA) {
                restored = sceneDirectorApplyDraft(await sceneDirectorHydrateDraftMediaState(draft));
            }
        } catch (e) {
            restored = false;
        }
    }
    sceneDirectorDraftRestorePending = false;
    sceneDirectorDraftReady = true;
    return restored;
}

function sceneDirectorBindDraftStorage() {
    SCENE_DIRECTOR_DRAFT_CONTROL_SELECTORS.forEach((selector) => {
        const root = sceneDirectorQuery(selector);
        if (!root || root.dataset.sceneDirectorDraftBound === "1") return;
        root.dataset.sceneDirectorDraftBound = "1";
        root.addEventListener("input", sceneDirectorScheduleDraftSave, true);
        root.addEventListener("change", sceneDirectorScheduleDraftSave, true);
    });
    [sceneDirectorEditorField(), sceneDirectorMediaStateField()].forEach((field) => {
        if (!field || field.dataset.sceneDirectorDraftBound === "1") return;
        field.dataset.sceneDirectorDraftBound = "1";
        field.addEventListener("input", sceneDirectorScheduleDraftSave, true);
        field.addEventListener("change", sceneDirectorScheduleDraftSave, true);
    });
    sceneDirectorBindDraftRestoreObserver();
}

function sceneDirectorCachedPresetCapability() {
    const name = sceneDirectorPresetName();
    const key = sceneDirectorPresetCapabilityCacheKey(name);
    return key ? (SCENE_DIRECTOR_PRESET_CAPABILITY_CACHE.get(key) || {}) : {};
}

function sceneDirectorPresetCapabilityCacheKey(name = sceneDirectorPresetName(), theme = sceneDirectorThemeFromParams(window.simpleaiTopbarSystemParams || {})) {
    const presetName = String(name || "").trim();
    if (!presetName) return "";
    const themeName = String(theme || "default").trim() || "default";
    return `${presetName}::${themeName}`;
}

function sceneDirectorCapabilityWithFrontendDuration(capability, sceneFrontend, theme) {
    if (!sceneDirectorHasCapability(capability)) return capability;
    const next = Object.assign({}, capability);
    const hasMin = next.minSegmentDuration !== undefined || next.min_segment_duration !== undefined;
    const hasMax = next.maxSegmentDuration !== undefined || next.max_segment_duration !== undefined;
    if (!hasMin && sceneFrontend && (sceneFrontend.video_duration_min !== undefined || sceneFrontend.var_number_min !== undefined)) {
        next.min_segment_duration = sceneDirectorThemeValue(sceneFrontend.video_duration_min ?? sceneFrontend.var_number_min, theme, 0.1);
    }
    if (!hasMax && sceneFrontend && (sceneFrontend.video_duration_max !== undefined || sceneFrontend.var_number_max !== undefined)) {
        next.max_segment_duration = sceneDirectorThemeValue(sceneFrontend.video_duration_max ?? sceneFrontend.var_number_max, theme, 10);
    }
    return next;
}

function sceneDirectorApplyCapabilityDataset(capability) {
    const normalized = sceneDirectorNormalizeCapability(capability);
    let changed = false;
    const apply = (node) => {
        if (!node || !node.dataset) return;
        const values = {
            simpaiSceneDirectorImagePolicy: normalized.imagePolicy,
            simpaiSceneDirectorAudioPolicy: normalized.audioPolicy,
            simpaiSceneDirectorVideoPolicy: normalized.videoPolicy,
            simpaiSceneDirectorMaxImages: String(normalized.maxImages),
            simpaiSceneDirectorMinImages: String(normalized.minImages),
            simpaiSceneDirectorChainOutput: normalized.chainOutput,
            simpaiSceneDirectorVideoModes: normalized.videoModes.join(","),
            simpaiSceneDirectorSegmentDurationParam: normalized.segmentDurationParam,
            simpaiSceneDirectorDurationStrategy: normalized.durationStrategy,
            simpaiSceneDirectorAudioOutput: normalized.audioOutput,
            simpaiSceneDirectorSupported: normalized.directorSupported ? "1" : "0",
            simpaiSceneDirectorMinSegmentDuration: String(normalized.minSegmentDuration),
            simpaiSceneDirectorMaxSegmentDuration: String(normalized.maxSegmentDuration),
        };
        Object.entries(values).forEach(([key, value]) => {
            if (node.dataset[key] !== value) {
                node.dataset[key] = value;
                changed = true;
            }
        });
    };
    const root = document.documentElement;
    apply(root);
    apply(sceneDirectorQuery("#scene_director_accordion"));
    try {
        root.classList.toggle("simpai-scene-director-image-required", normalized.imagePolicy === "required");
        root.classList.toggle("simpai-scene-director-image-forbidden", normalized.imagePolicy === "forbidden");
        root.classList.toggle("simpai-scene-director-image-optional", normalized.imagePolicy === "optional");
        root.classList.toggle("simpai-scene-director-audio-required", normalized.audioPolicy === "required");
        root.classList.toggle("simpai-scene-director-audio-forbidden", normalized.audioPolicy === "forbidden");
        root.classList.toggle("simpai-scene-director-audio-optional", normalized.audioPolicy === "optional");
        root.classList.toggle("simpai-scene-director-video-required", normalized.videoPolicy === "required");
        root.classList.toggle("simpai-scene-director-video-forbidden", normalized.videoPolicy === "forbidden");
        root.classList.toggle("simpai-scene-director-video-optional", normalized.videoPolicy === "optional");
        sceneDirectorDeactivateIfUnsupported(normalized);
        if (changed) {
            window.dispatchEvent(new CustomEvent("simpai:scene-director-capability-updated", { detail: normalized }));
        }
    } catch (e) {}
}

function sceneDirectorPresetFetchUrl(name) {
    const base = String(typeof webpath !== "undefined" ? webpath : "").replace(/\/$/, "");
    return `${base}/presets/${encodeURIComponent(name)}.json?${Date.now()}`;
}

function sceneDirectorEnsurePresetCapabilityLoaded() {
    const name = sceneDirectorPresetName();
    const theme = sceneDirectorThemeFromParams(window.simpleaiTopbarSystemParams || {});
    const cacheKey = sceneDirectorPresetCapabilityCacheKey(name, theme);
    if (!name || !cacheKey || SCENE_DIRECTOR_PRESET_CAPABILITY_CACHE.has(cacheKey) || SCENE_DIRECTOR_PRESET_CAPABILITY_LOADING.has(cacheKey)) return;
    if (typeof fetch !== "function") return;
    SCENE_DIRECTOR_PRESET_CAPABILITY_LOADING.add(cacheKey);
    fetch(sceneDirectorPresetFetchUrl(name))
        .then((response) => response && response.ok ? response.json() : null)
        .then((preset) => {
            const engine = preset && typeof preset.engine === "object"
                ? preset.engine
                : (preset && typeof preset.default_engine === "object" ? preset.default_engine : (preset || {}));
            const sceneFrontend = engine && typeof engine.scene_frontend === "object" ? engine.scene_frontend : {};
            const capability = sceneDirectorCapabilityWithFrontendDuration(
                sceneDirectorCapabilityCandidate(sceneFrontend.director_capability || engine.director_capability, theme),
                sceneFrontend,
                theme,
            );
            if (sceneDirectorHasCapability(capability)) {
                const normalized = sceneDirectorNormalizeCapability(capability);
                SCENE_DIRECTOR_PRESET_CAPABILITY_CACHE.set(cacheKey, normalized);
                sceneDirectorApplyCapabilityDataset(normalized);
                try { refresh_scene_director_editor(); } catch (e) {}
            }
        })
        .catch(() => {})
        .finally(() => {
            SCENE_DIRECTOR_PRESET_CAPABILITY_LOADING.delete(cacheKey);
        });
}

function sceneDirectorNormalizeCapability(raw) {
    const read = (camel, snake, fallback) => raw && raw[camel] !== undefined ? raw[camel] : (raw && raw[snake] !== undefined ? raw[snake] : fallback);
    const policy = String(read("imagePolicy", "image_policy", "optional")).trim().toLowerCase();
    const audioPolicy = String(read("audioPolicy", "audio_policy", "optional")).trim().toLowerCase();
    const videoPolicy = String(read("videoPolicy", "video_policy", "optional")).trim().toLowerCase();
    const maxImages = Number(read("maxImages", "max_images", SCENE_DIRECTOR_MAX_IMAGE_REFS));
    const minImages = Number(read("minImages", "min_images", policy === "required" ? 1 : 0));
    const minSegmentDuration = Number(read("minSegmentDuration", "min_segment_duration", 0.1));
    const maxSegmentDuration = Number(read("maxSegmentDuration", "max_segment_duration", 10));
    const segmentDurationParam = String(read("segmentDurationParam", "segment_duration_param", "scene_video_duration")).trim();
    const durationStrategy = String(read("durationStrategy", "duration_strategy", "shot")).trim().toLowerCase().replace(/-/g, "_");
    const audioOutput = String(read("audioOutput", "audio_output", "silent")).trim().toLowerCase().replace(/-/g, "_");
    const directorSupportedRaw = read("directorSupported", "director_supported", true);
    const rawImageModes = read("imageModes", "image_modes", []);
    const imageModes = (Array.isArray(rawImageModes) ? rawImageModes : String(rawImageModes || "").split(","))
        .map((item) => String(item).trim())
        .filter(Boolean);
    const rawVideoModes = read("videoModes", "video_modes", "explicit");
    const videoModes = (Array.isArray(rawVideoModes) ? rawVideoModes : String(rawVideoModes || "explicit").split(","))
        .map((item) => String(item).trim())
        .filter(Boolean);
    const chainOutput = String(read("chainOutput", "chain_output", "timeline")).trim().toLowerCase();
    const normalizedDurationStrategy = ["shot", "audio_min", "video_min"].includes(durationStrategy) ? durationStrategy : "shot";
    const minDurationFloor = normalizedDurationStrategy === "audio_min" || normalizedDurationStrategy === "video_min" ? 0 : 0.05;
    const normalizedMinSegmentDuration = Number.isFinite(minSegmentDuration) ? Math.max(minDurationFloor, Math.min(86400, minSegmentDuration)) : (minDurationFloor === 0 ? 0 : 0.1);
    const normalizedMaxSegmentDuration = Number.isFinite(maxSegmentDuration) ? Math.max(normalizedMinSegmentDuration, Math.min(86400, maxSegmentDuration)) : Math.max(normalizedMinSegmentDuration, 10);
    return {
        imagePolicy: ["required", "forbidden", "optional"].includes(policy) ? policy : "optional",
        audioPolicy: ["required", "forbidden", "optional"].includes(audioPolicy) ? audioPolicy : "optional",
        videoPolicy: ["required", "forbidden", "optional"].includes(videoPolicy) ? videoPolicy : "optional",
        maxImages: Number.isFinite(maxImages) ? Math.max(0, Math.min(SCENE_DIRECTOR_MAX_IMAGE_REFS, Math.round(maxImages))) : SCENE_DIRECTOR_MAX_IMAGE_REFS,
        minImages: Number.isFinite(minImages) ? Math.max(0, Math.min(SCENE_DIRECTOR_MAX_IMAGE_REFS, Math.round(minImages))) : 0,
        imageModes,
        segmentDurationParam: /^[A-Za-z_][A-Za-z0-9_]*$/.test(segmentDurationParam) ? segmentDurationParam : "scene_video_duration",
        durationStrategy: normalizedDurationStrategy,
        audioOutput: ["silent", "generated", "input_audio", "source_audio"].includes(audioOutput) ? audioOutput : "silent",
        directorSupported: !(directorSupportedRaw === false || directorSupportedRaw === "false" || directorSupportedRaw === "0"),
        minSegmentDuration: normalizedMinSegmentDuration,
        maxSegmentDuration: normalizedMaxSegmentDuration,
        videoModes: videoModes.length ? videoModes : ["explicit"],
        chainOutput: ["timeline", "last_result"].includes(chainOutput) ? chainOutput : "timeline",
    };
}

function sceneDirectorCapabilitySignature() {
    const capability = sceneDirectorCapability();
    return `${capability.imagePolicy}:${capability.minImages}:${capability.maxImages}:${capability.imageModes.join(",")}:${capability.audioPolicy}:${capability.videoPolicy}:${capability.videoModes.join(",")}:${capability.chainOutput}:${capability.segmentDurationParam}:${capability.durationStrategy}:${capability.audioOutput}:${capability.directorSupported}:${capability.minSegmentDuration}:${capability.maxSegmentDuration}`;
}

function sceneDirectorEscapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function sceneDirectorEditorField() {
    const root = sceneDirectorQuery("#scene_director_editor_state");
    return root ? root.querySelector("textarea, input") : null;
}

function sceneDirectorMediaStateField() {
    const root = sceneDirectorQuery("#scene_director_media_state");
    return root ? root.querySelector("textarea, input") : null;
}

function sceneDirectorReadMediaState() {
    const field = sceneDirectorMediaStateField();
    const text = field ? String(field.value || "").trim() : "";
    if (!text) return {};
    try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object") return {};
        const hasGroups = ["images", "audio", "video"].some((key) => parsed[key] && typeof parsed[key] === "object");
        if (!hasGroups) return parsed;
        return Object.assign({}, parsed.images || {}, parsed.audio || {}, parsed.video || {});
    } catch (e) {
        return {};
    }
}

function sceneDirectorWriteMediaState(media) {
    const field = sceneDirectorMediaStateField();
    if (!field) return;
    const groups = { images: {}, audio: {}, video: {} };
    Object.entries(media && typeof media === "object" ? media : {}).forEach(([ref, item]) => {
        if (!item || typeof item !== "object") return;
        if (/^image_[1-9]$/.test(ref)) groups.images[ref] = item;
        else if (/^audio_[1-5]$/.test(ref)) groups.audio[ref] = item;
        else if (/^video_[1-5]$/.test(ref)) groups.video[ref] = item;
    });
    field.value = JSON.stringify(groups);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    sceneDirectorScheduleDraftSave();
}

function sceneDirectorCloneRows(rows) {
    return (Array.isArray(rows) ? rows : []).map((row, index) => {
        if (Array.isArray(row)) {
            const rowStart = row[0] ?? (index * 5);
            const rowEnd = row[1] ?? ((index + 1) * 5);
            const rowPrompt = row[2] ?? "";
            if (row.length >= SCENE_DIRECTOR_VIDEO_INDEX + 1) {
                return [
                    rowStart,
                    rowEnd,
                    rowPrompt,
                    ...Array.from({ length: SCENE_DIRECTOR_MAX_IMAGE_REFS }, (_, imageIndex) => row[SCENE_DIRECTOR_IMAGE_START_INDEX + imageIndex] ?? ""),
                    row[SCENE_DIRECTOR_AUDIO_INDEX] ?? "",
                    row[SCENE_DIRECTOR_VIDEO_INDEX] ?? "",
                ];
            }
            if (row.length >= SCENE_DIRECTOR_IMAGE_START_INDEX + SCENE_DIRECTOR_LEGACY_MAX_IMAGE_REFS + 2) {
                return [
                    rowStart,
                    rowEnd,
                    rowPrompt,
                    ...Array.from({ length: SCENE_DIRECTOR_MAX_IMAGE_REFS }, (_, imageIndex) => (
                        imageIndex < SCENE_DIRECTOR_LEGACY_MAX_IMAGE_REFS
                            ? row[SCENE_DIRECTOR_IMAGE_START_INDEX + imageIndex] ?? ""
                            : ""
                    )),
                    row[SCENE_DIRECTOR_IMAGE_START_INDEX + SCENE_DIRECTOR_LEGACY_MAX_IMAGE_REFS] ?? "",
                    row[SCENE_DIRECTOR_IMAGE_START_INDEX + SCENE_DIRECTOR_LEGACY_MAX_IMAGE_REFS + 1] ?? "",
                ];
            }
            if (row.length >= SCENE_DIRECTOR_IMAGE_START_INDEX + SCENE_DIRECTOR_LEGACY_MAX_IMAGE_REFS + 1) {
                return [
                    rowStart,
                    rowEnd,
                    rowPrompt,
                    ...Array.from({ length: SCENE_DIRECTOR_MAX_IMAGE_REFS }, (_, imageIndex) => (
                        imageIndex < SCENE_DIRECTOR_LEGACY_MAX_IMAGE_REFS
                            ? row[SCENE_DIRECTOR_IMAGE_START_INDEX + imageIndex] ?? ""
                            : ""
                    )),
                    row[SCENE_DIRECTOR_IMAGE_START_INDEX + SCENE_DIRECTOR_LEGACY_MAX_IMAGE_REFS] ?? "",
                    "",
                ];
            }
            return [
                rowStart,
                rowEnd,
                rowPrompt,
                row[3] ?? "",
                row[4] ?? "",
                ...Array(SCENE_DIRECTOR_MAX_IMAGE_REFS - 2).fill(""),
                row[5] ?? "",
                "",
            ];
        }
        if (row && typeof row === "object") {
            const imageRefs = Array.isArray(row.images)
                ? row.images.map((item) => item && typeof item === "object" ? item.source_ref || "" : "").filter(Boolean)
                : [];
            const videoRefs = Array.isArray(row.video || row.videos)
                ? (row.video || row.videos).map((item) => item && typeof item === "object" ? item.source_ref || "" : "").filter(Boolean)
                : [];
            const imageValue = (n) => imageRefs[n - 1] || row[`image_ref_${n}`] || row[`image${n}`] || "";
            return [
                row.start ?? (index * 5),
                row.end ?? ((index + 1) * 5),
                row.prompt ?? "",
                ...Array.from({ length: SCENE_DIRECTOR_MAX_IMAGE_REFS }, (_, imageIndex) => imageValue(imageIndex + 1)),
                row.audio_ref || row.audio || "",
                videoRefs[0] || row.video_ref || row.video || "",
            ];
        }
        return [index * 5, (index + 1) * 5, "", ...Array(SCENE_DIRECTOR_MAX_IMAGE_REFS + 2).fill("")];
    });
}

function sceneDirectorReadRows() {
    const field = sceneDirectorEditorField();
    if (!field || !String(field.value || "").trim()) {
        const rows = sceneDirectorNormalizeRowsForCapability(SCENE_DIRECTOR_DEFAULT_ROWS);
        sceneDirectorActiveShotIndex = Math.max(0, Math.min(rows.length - 1, sceneDirectorActiveShotIndex));
        return rows;
    }
    try {
        const parsed = JSON.parse(field.value);
        const rows = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.rows) ? parsed.rows : []);
        const normalized = sceneDirectorNormalizeRowsForCapability(rows.length ? rows : SCENE_DIRECTOR_DEFAULT_ROWS);
        if (parsed && !Array.isArray(parsed) && typeof parsed === "object") {
            const selected = Number(parsed.active_index ?? parsed.active_segment_index);
            if (Number.isFinite(selected)) sceneDirectorActiveShotIndex = Math.round(selected);
        }
        sceneDirectorActiveShotIndex = Math.max(0, Math.min(normalized.length - 1, sceneDirectorActiveShotIndex));
        return normalized;
    } catch (e) {
        const rows = sceneDirectorNormalizeRowsForCapability(SCENE_DIRECTOR_DEFAULT_ROWS);
        sceneDirectorActiveShotIndex = Math.max(0, Math.min(rows.length - 1, sceneDirectorActiveShotIndex));
        return rows;
    }
}

function sceneDirectorSyncActiveShot(editor) {
    const root = editor || sceneDirectorQuery("#scene_director_editor_root");
    if (!root) return;
    root.querySelectorAll("[data-scene-director-shot]").forEach((node) => {
        const index = Number(node.getAttribute("data-scene-director-index") || 0);
        const active = index === sceneDirectorActiveShotIndex;
        node.classList.toggle("is-active-shot", active);
        if (active) node.setAttribute("aria-current", "true");
        else node.removeAttribute("aria-current");
    });
}

function sceneDirectorSetActiveShot(editor, index) {
    const rows = sceneDirectorRowsFromEditor(editor);
    const next = Math.max(0, Math.min(Math.max(0, rows.length - 1), Math.round(Number(index) || 0)));
    const changed = next !== sceneDirectorActiveShotIndex;
    sceneDirectorActiveShotIndex = next;
    sceneDirectorSyncActiveShot(editor);
    return changed;
}

function sceneDirectorWriteRows(rows) {
    const field = sceneDirectorEditorField();
    if (!field) return;
    const normalized = sceneDirectorNormalizeRowsForCapability(rows);
    sceneDirectorActiveShotIndex = Math.max(0, Math.min(Math.max(0, normalized.length - 1), sceneDirectorActiveShotIndex));
    field.value = JSON.stringify({ rows: normalized, active_index: sceneDirectorActiveShotIndex });
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    sceneDirectorSyncActiveShot();
    sceneDirectorRenderTimelinePreview(normalized);
    sceneDirectorScheduleDraftSave();
}

function sceneDirectorOptionHtml(options, value) {
    return options.map((option) => {
        const text = String(option || "");
        const label = text ? sceneDirectorMediaLabel(text) : sceneDirectorText("None");
        return `<option value="${sceneDirectorEscapeHtml(text)}" ${text === String(value || "") ? "selected" : ""}>${sceneDirectorEscapeHtml(label)}</option>`;
    }).join("");
}

function sceneDirectorVideoOptions() {
    const capability = sceneDirectorCapability();
    if (capability.videoPolicy === "forbidden") return [""];
    const options = SCENE_DIRECTOR_VIDEO_OPTIONS.slice();
    if (capability.videoPolicy !== "forbidden" && capability.videoModes.includes(SCENE_DIRECTOR_PREVIOUS_VIDEO_REF)) {
        options.push(SCENE_DIRECTOR_PREVIOUS_VIDEO_REF);
    }
    return options;
}

function sceneDirectorAudioOptions() {
    const capability = sceneDirectorCapability();
    return capability.audioPolicy === "forbidden" ? [""] : SCENE_DIRECTOR_AUDIO_OPTIONS.slice();
}

function sceneDirectorMediaKindPolicy(kind, capability = sceneDirectorCapability()) {
    if (kind === "image") return capability.imagePolicy;
    if (kind === "audio") return capability.audioPolicy;
    if (kind === "video") return capability.videoPolicy;
    return "optional";
}

function sceneDirectorMediaKindForbidden(kind, capability = sceneDirectorCapability()) {
    return sceneDirectorMediaKindPolicy(kind, capability) === "forbidden";
}

function sceneDirectorMediaKindFromGroupKey(groupKey) {
    if (groupKey === "images") return "image";
    if (groupKey === "audio") return "audio";
    if (groupKey === "video") return "video";
    return "";
}

function sceneDirectorImageLabel(ref) {
    if (String(ref || "") === SCENE_DIRECTOR_PREVIOUS_IMAGE_REF) return sceneDirectorText("Previous shot last frame");
    const match = String(ref || "").match(/_(\d+)$/);
    return match ? `${sceneDirectorText("Image")} ${match[1]}` : String(ref || "");
}

function sceneDirectorMediaLabel(ref) {
    const text = String(ref || "");
    if (text === SCENE_DIRECTOR_PREVIOUS_VIDEO_REF) return sceneDirectorText("Previous shot result");
    if (text === SCENE_DIRECTOR_PREVIOUS_IMAGE_REF) return sceneDirectorText("Previous shot last frame");
    const match = text.match(/^(image|audio|video)_(\d+)$/);
    if (!match) return text;
    const key = match[1] === "image" ? "Image" : match[1] === "audio" ? "Audio" : "Video";
    return `${sceneDirectorText(key)} ${match[2]}`;
}

function sceneDirectorImageRoleText(index, total) {
    if (total <= 1) return sceneDirectorText("First frame");
    if (total === 2) return index === 0 ? sceneDirectorText("First frame") : sceneDirectorText("Last frame");
    return sceneDirectorText("Reference {index}").replace("{index}", String(index + 1));
}

function sceneDirectorMediaMap() {
    const map = new Map();
    const state = sceneDirectorReadMediaState();
    Object.entries(state).forEach(([ref, item]) => {
        if (!ref || !item || typeof item !== "object") return;
        const src = String(item.thumb || item.data_url || item.src || "");
        map.set(ref, {
            src,
            label: String(item.name || item.title || sceneDirectorMediaLabel(ref)),
            mime: String(item.mime || ""),
            path: String(item.path || ""),
        });
    });
    document.querySelectorAll("#scene_director_media_preview [data-scene-director-ref]").forEach((tile) => {
        const ref = String(tile.getAttribute("data-scene-director-ref") || "").trim();
        if (!ref || map.has(ref)) return;
        const img = tile.querySelector("img");
        map.set(ref, {
            src: tile.getAttribute("data-scene-director-src") || (img ? img.getAttribute("src") || "" : ""),
            label: tile.getAttribute("data-scene-director-label") || ref,
            path: tile.getAttribute("data-scene-director-path") || "",
        });
    });
    return map;
}

function sceneDirectorSelectedImageRefs(rowNode) {
    const refs = [];
    if (!rowNode) return refs;
    for (let index = 1; index <= SCENE_DIRECTOR_MAX_IMAGE_REFS; index += 1) {
        const field = rowNode.querySelector(`[data-scene-director-field="image_ref_${index}"]`);
        const ref = String(field ? field.value || "" : "").trim();
        if (ref && !refs.includes(ref)) refs.push(ref);
    }
    return refs;
}

function sceneDirectorMaxImagesForCapability(capability = sceneDirectorCapability()) {
    const maxImages = Math.max(0, Math.min(SCENE_DIRECTOR_MAX_IMAGE_REFS, Number(capability.maxImages || 0)));
    if (capability.imagePolicy === "forbidden") return 0;
    return Number.isFinite(maxImages) ? maxImages : 0;
}

function sceneDirectorPreviousImageSupported(capability = sceneDirectorCapability()) {
    if (capability.imagePolicy === "forbidden" || sceneDirectorMaxImagesForCapability(capability) <= 0) return false;
    const modes = Array.isArray(capability.imageModes) ? capability.imageModes.map((item) => String(item).toLowerCase()) : [];
    if (!modes.length) return true;
    return modes.some((mode) => ["first_frame", "first_last", "ordered_keyframes"].includes(mode));
}

function sceneDirectorNormalizeImageRefs(refs, capability = sceneDirectorCapability()) {
    const maxImages = sceneDirectorMaxImagesForCapability(capability);
    if (maxImages <= 0) return [];
    return Array.from(new Set((Array.isArray(refs) ? refs : [])
        .map((item) => String(item || "").trim())
        .filter((item) => item && (item !== SCENE_DIRECTOR_PREVIOUS_IMAGE_REF || sceneDirectorPreviousImageSupported(capability)))))
        .slice(0, maxImages);
}

function sceneDirectorNormalizeRowValues(row, capability = sceneDirectorCapability(), rowIndex = null) {
    const values = sceneDirectorCloneRows([row])[0];
    let refs = sceneDirectorNormalizeImageRefs(values.slice(SCENE_DIRECTOR_IMAGE_START_INDEX, SCENE_DIRECTOR_AUDIO_INDEX), capability);
    if (rowIndex !== null && Number(rowIndex) === 0) refs = refs.filter((ref) => ref !== SCENE_DIRECTOR_PREVIOUS_IMAGE_REF);
    for (let index = 0; index < SCENE_DIRECTOR_MAX_IMAGE_REFS; index += 1) {
        values[index + SCENE_DIRECTOR_IMAGE_START_INDEX] = refs[index] || "";
    }
    if (capability.audioPolicy === "forbidden") values[SCENE_DIRECTOR_AUDIO_INDEX] = "";
    if (capability.videoPolicy === "forbidden") values[SCENE_DIRECTOR_VIDEO_INDEX] = "";
    return values;
}

function sceneDirectorNormalizeRowsForCapability(rows, capability = sceneDirectorCapability()) {
    return sceneDirectorCloneRows(rows).map((row, index) => sceneDirectorNormalizeRowValues(row, capability, index));
}

function sceneDirectorSetSelectedImageRefs(rowNode, refs, capability = sceneDirectorCapability()) {
    if (!rowNode) return;
    const selected = sceneDirectorNormalizeImageRefs(refs, capability);
    let changed = false;
    for (let index = 1; index <= SCENE_DIRECTOR_MAX_IMAGE_REFS; index += 1) {
        const field = rowNode.querySelector(`[data-scene-director-field="image_ref_${index}"]`);
        const nextValue = selected[index - 1] || "";
        if (field && field.value !== nextValue) {
            field.value = nextValue;
            changed = true;
        }
    }
    return changed;
}

function sceneDirectorNextImageRefs(ref, selectedRefs, capability = sceneDirectorCapability()) {
    const refs = sceneDirectorNormalizeImageRefs(selectedRefs, capability);
    const maxImages = sceneDirectorMaxImagesForCapability(capability);
    const minImages = Math.max(0, Math.min(maxImages, Number(capability.minImages || 0)));
    if (capability.imagePolicy === "forbidden" || maxImages <= 0) return [];
    if (!ref) return capability.imagePolicy === "required" ? refs.slice(0, maxImages) : [];
    if (refs.includes(ref)) {
        const nextRefs = refs.filter((item) => item !== ref);
        return nextRefs.length < minImages ? refs : nextRefs;
    }
    if (refs.length >= maxImages) return refs;
    return refs.concat(ref);
}

function sceneDirectorImageChoiceHtml(ref, selectedRefs, mediaMap, capability = sceneDirectorCapability()) {
    const selectedIndex = selectedRefs.indexOf(ref);
    const active = selectedIndex >= 0;
    const maxImages = sceneDirectorMaxImagesForCapability(capability);
    const selectedCount = selectedRefs.length;
    const blockedByLimit = !active && selectedCount >= maxImages;
    const disabled = capability.imagePolicy === "forbidden" ||
        maxImages <= 0 ||
        blockedByLimit;
    const media = mediaMap.get(ref) || {};
    const src = String(media.src || "");
    const label = String(media.label || sceneDirectorImageLabel(ref));
    const title = blockedByLimit
        ? sceneDirectorText("Not selectable: current preset accepts up to {count} image(s)").replace("{count}", String(maxImages))
        : label;
    const role = active ? sceneDirectorImageRoleText(selectedIndex, selectedCount) : "";
    const preview = src
        ? `<img src="${sceneDirectorEscapeHtml(src)}" alt="">`
        : `<span>${sceneDirectorEscapeHtml(ref.replace("image_", ""))}</span>`;
    return `<button type="button" class="scene-director-ref-choice ${active ? "is-active" : ""} ${blockedByLimit ? "is-limit-disabled" : ""} ${src ? "has-image" : "is-empty"}" data-scene-director-ref-choice="${sceneDirectorEscapeHtml(ref)}" aria-pressed="${active ? "true" : "false"}" title="${sceneDirectorEscapeHtml(title)}" ${disabled ? 'disabled aria-disabled="true"' : ""}>${preview}${role ? `<em class="scene-director-ref-role">${sceneDirectorEscapeHtml(role)}</em>` : ""}<small>${sceneDirectorEscapeHtml(ref)}</small></button>`;
}

function sceneDirectorImagePickerSignature(selectedRefs, mediaMap, capability) {
    const imageState = SCENE_DIRECTOR_IMAGE_OPTIONS.filter(Boolean).map((ref) => {
        const media = mediaMap.get(ref) || {};
        return [
            ref,
            media.src ? "1" : "0",
            String(media.label || ""),
        ].join(":");
    }).join("|");
    return [
        sceneDirectorLanguageKey(),
        capability.imagePolicy,
        capability.minImages,
        capability.maxImages,
        selectedRefs.join(","),
        imageState,
    ].join("\n");
}

function sceneDirectorRenderImageRefPicker(rowNode, mediaMap = sceneDirectorMediaMap()) {
    if (!rowNode) return;
    const picker = rowNode.querySelector("[data-scene-director-ref-picker]");
    if (!picker) return;
    const capability = sceneDirectorCapability();
    const selectedRefs = sceneDirectorNormalizeImageRefs(sceneDirectorSelectedImageRefs(rowNode), capability);
    const changed = sceneDirectorSetSelectedImageRefs(rowNode, selectedRefs, capability);
    const rowIndex = Number(rowNode.getAttribute("data-scene-director-index") || 0);
    const inheritField = rowNode.querySelector("[data-scene-director-inherit-tail]");
    if (inheritField) {
        inheritField.checked = selectedRefs.includes(SCENE_DIRECTOR_PREVIOUS_IMAGE_REF);
        inheritField.disabled = rowIndex <= 0 || !sceneDirectorPreviousImageSupported(capability);
        inheritField.setAttribute("aria-disabled", inheritField.disabled ? "true" : "false");
    }
    const noneDisabled = capability.imagePolicy === "required" || capability.imagePolicy === "forbidden";
    const noneLabel = sceneDirectorNoneChoiceLabel(capability, selectedRefs.length);
    const nextHtml = [
        `<button type="button" class="scene-director-ref-choice scene-director-ref-none ${selectedRefs.length ? "" : "is-active"}" data-scene-director-ref-choice="" aria-pressed="${selectedRefs.length ? "false" : "true"}" ${noneDisabled ? 'disabled aria-disabled="true"' : ""}><span>${sceneDirectorEscapeHtml(noneLabel)}</span></button>`,
        ...SCENE_DIRECTOR_IMAGE_OPTIONS.filter(Boolean).map((ref) => sceneDirectorImageChoiceHtml(ref, selectedRefs, mediaMap, capability)),
    ].join("");
    const signature = sceneDirectorImagePickerSignature(selectedRefs, mediaMap, capability);
    if (picker.dataset.sceneDirectorRefPickerSignature !== signature) {
        picker.innerHTML = nextHtml;
        picker.dataset.sceneDirectorRefPickerSignature = signature;
    }
    return changed;
}

function sceneDirectorNoneChoiceLabel(capability, selectedCount) {
    if (selectedCount > 0) return sceneDirectorText("None");
    if (capability.imagePolicy === "required") return sceneDirectorText("Missing first frame");
    if (capability.imagePolicy === "forbidden") return sceneDirectorText("No image input");
    return sceneDirectorText("Text-to-Video");
}

function sceneDirectorRefreshEditorPreviews(editor, options = {}) {
    const root = editor || sceneDirectorQuery("#scene_director_editor_root");
    if (!root) return;
    const mediaMap = sceneDirectorMediaMap();
    let changed = false;
    root.querySelectorAll("[data-scene-director-shot]").forEach((rowNode) => {
        if (sceneDirectorRenderImageRefPicker(rowNode, mediaMap)) changed = true;
        sceneDirectorUpdateRule(rowNode);
    });
    if (options.writeRows && changed) sceneDirectorWriteRows(sceneDirectorRowsFromEditor(root));
    sceneDirectorRenderTimelinePreview(sceneDirectorRowsFromEditor(root));
}

function sceneDirectorRenderMediaPreview(options = {}) {
    const root = sceneDirectorQuery("#scene_director_media_preview");
    if (!root) return;
    const refreshEditor = options.refreshEditor !== false;
    const state = sceneDirectorReadMediaState();
    root.querySelectorAll("[data-scene-director-kind-group]").forEach((group) => {
        const groupKey = String(group.getAttribute("data-scene-director-kind-group") || "").trim();
        const groupKind = sceneDirectorMediaKindFromGroupKey(groupKey);
        const disabled = groupKind ? sceneDirectorMediaKindForbidden(groupKind) : false;
        const titleNode = group.querySelector("[data-scene-director-media-group-title], .scene-director-media-group-head strong");
        const title = sceneDirectorMediaGroupTitle(groupKey);
        if (title) sceneDirectorSetText(titleNode, title);
        sceneDirectorSetText(group.querySelector(".scene-director-media-upload-hint"), "Click or drop");
        group.classList.toggle("is-policy-disabled", disabled);
        group.setAttribute("aria-disabled", disabled ? "true" : "false");
    });
    root.querySelectorAll("[data-scene-director-ref]").forEach((tile) => {
        const ref = String(tile.getAttribute("data-scene-director-ref") || "").trim();
        const kind = String(tile.getAttribute("data-scene-director-kind") || "").trim();
        const disabled = sceneDirectorMediaKindForbidden(kind);
        const item = ref && state[ref] && typeof state[ref] === "object" ? state[ref] : {};
        const src = String(item.thumb || item.data_url || item.src || "");
        const path = String(item.path || "");
        const label = String(item.name || item.title || sceneDirectorMediaLabel(ref));
        const drop = tile.querySelector("[data-scene-director-media-drop]");
        if (drop) {
            const icon = kind === "audio" ? "♪" : kind === "video" ? "▶" : "";
            const nextHtml = (kind === "image" || kind === "video") && src
                ? `<img src="${sceneDirectorEscapeHtml(src)}" alt="">`
                : `<span class="scene-director-empty-image">${sceneDirectorEscapeHtml(path ? icon : sceneDirectorText("Click or drop"))}</span>`;
            const dropSignature = [sceneDirectorLanguageKey(), kind, src, path, label].join("\n");
            if (drop.dataset.sceneDirectorMediaDropSignature !== dropSignature) {
                drop.innerHTML = nextHtml;
                drop.dataset.sceneDirectorMediaDropSignature = dropSignature;
            }
            drop.disabled = disabled;
            drop.setAttribute("aria-disabled", disabled ? "true" : "false");
            drop.title = disabled ? sceneDirectorText("Media input disabled for current preset") : "";
        }
        tile.classList.toggle("is-policy-disabled", disabled);
        tile.classList.toggle("has-image", !!(src || path));
        tile.classList.toggle("has-media", !!(src || path));
        if (tile.getAttribute("data-scene-director-src") !== src) {
            tile.setAttribute("data-scene-director-src", src);
        }
        if (tile.getAttribute("data-scene-director-path") !== path) {
            tile.setAttribute("data-scene-director-path", path);
        }
        if (tile.getAttribute("data-scene-director-label") !== label) {
            tile.setAttribute("data-scene-director-label", label);
        }
        const clear = tile.querySelector("[data-scene-director-media-clear]");
        if (clear) clear.setAttribute("title", sceneDirectorText("Clear"));
        const title = tile.querySelector("b");
        if (title) {
            const displayTitle = sceneDirectorMediaLabel(ref);
            if (title.textContent !== displayTitle) title.textContent = displayTitle;
        }
        const small = tile.querySelector("small");
        const smallText = src || path ? label : "";
        if (small && small.textContent !== smallText) small.textContent = smallText;
    });
    sceneDirectorBindMediaPreviewObserver();
    if (refreshEditor) {
        sceneDirectorRefreshEditorPreviews();
        sceneDirectorRenderTimelinePreview();
    }
}

function sceneDirectorUploadRoot(kind) {
    if (kind === "audio") return sceneDirectorQuery("#scene_director_audio_files");
    if (kind === "video") return sceneDirectorQuery("#scene_director_video_files");
    return null;
}

function sceneDirectorUploadInput(kind) {
    const root = sceneDirectorUploadRoot(kind);
    return root ? root.querySelector('input[type="file"]') : null;
}

function sceneDirectorFileMatchesKind(file, kind) {
    if (!file) return false;
    const type = String(file.type || "").toLowerCase();
    const name = String(file.name || "").toLowerCase();
    if (kind === "image") {
        return type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|avif|tiff?)$/i.test(name);
    }
    if (kind === "audio") {
        return type.startsWith("audio/") || /\.(wav|mp3|flac|ogg|m4a|aac|opus)$/i.test(name);
    }
    if (kind === "video") {
        return type.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(name);
    }
    return false;
}

function sceneDirectorOpenTemporaryFileDialog(accept, multiple, onFiles) {
    if (typeof document === "undefined" || !document.body) return false;
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = !!multiple;
    input.accept = accept;
    input.setAttribute("data-scene-director-temp-input", "1");
    input.style.position = "fixed";
    input.style.left = "-10000px";
    input.style.top = "0";
    input.style.width = "1px";
    input.style.height = "1px";
    input.style.opacity = "0";
    input.style.pointerEvents = "none";
    const cleanup = () => {
        try { input.remove(); } catch (e) {}
    };
    input.addEventListener("change", () => {
        try {
            onFiles(input.files);
        } finally {
            window.setTimeout(cleanup, 0);
        }
    }, { once: true });
    document.body.appendChild(input);
    try {
        input.click();
        window.setTimeout(() => {
            if (!input.files || !input.files.length) cleanup();
        }, 30000);
        return true;
    } catch (e) {
        cleanup();
        return false;
    }
}

function sceneDirectorOpenMediaFileDialog(kind) {
    const targetInput = sceneDirectorUploadInput(kind);
    if (sceneDirectorMediaKindForbidden(kind)) return false;
    if (!targetInput) return false;
    const accept = kind === "audio"
        ? ".wav,.mp3,.flac,.ogg,.m4a,.aac,.opus,audio/*"
        : ".mp4,.webm,.mov,.mkv,.avi,.m4v,video/*";
    return sceneDirectorOpenTemporaryFileDialog(accept, true, (files) => {
        sceneDirectorUploadMediaFiles(kind, files);
    });
}

function sceneDirectorUploadMediaFiles(kind, fileList) {
    const input = sceneDirectorUploadInput(kind);
    if (sceneDirectorMediaKindForbidden(kind)) return false;
    if (!input || !fileList || !fileList.length || typeof DataTransfer === "undefined") return false;
    const files = Array.from(fileList).filter((file) => sceneDirectorFileMatchesKind(file, kind)).slice(0, 5);
    if (!files.length) return false;
    try {
        sceneDirectorDispatchFieldChange(sceneDirectorMediaStateField());
        const transfer = new DataTransfer();
        files.forEach((file) => transfer.items.add(file));
        input.files = transfer.files;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    } catch (e) {
        return false;
    }
}

function sceneDirectorReadImageFile(file, ref) {
    if (!sceneDirectorFileMatchesKind(file, "image")) return;
    const reader = new FileReader();
    reader.onload = () => {
        const state = sceneDirectorReadMediaState();
        state[ref] = {
            type: "image",
            name: file.name || ref,
            title: file.name || ref,
            mime: file.type || "image/png",
            size: file.size || 0,
            data_url: String(reader.result || ""),
            thumb: String(reader.result || ""),
        };
        sceneDirectorWriteMediaState(state);
        sceneDirectorRenderMediaPreview();
    };
    reader.readAsDataURL(file);
}

function sceneDirectorOpenImageFileDialog(ref) {
    if (sceneDirectorMediaKindForbidden("image")) return false;
    return sceneDirectorOpenTemporaryFileDialog(".png,.jpg,.jpeg,.webp,.gif,.bmp,.avif,.tif,.tiff,image/*", false, (files) => {
        const file = files && files[0];
        if (file) sceneDirectorReadImageFile(file, ref);
    });
}

function sceneDirectorBindMediaPreviewObserver() {
    const root = sceneDirectorQuery("#scene_director_media_preview");
    if (!root || root.dataset.sceneDirectorMediaObserverBound === "1") return;
    root.dataset.sceneDirectorMediaObserverBound = "1";
    root.addEventListener("click", (event) => {
        const clear = event.target.closest("[data-scene-director-media-clear]");
        if (clear) {
            const tile = clear.closest("[data-scene-director-ref]");
            const ref = tile ? String(tile.getAttribute("data-scene-director-ref") || "") : "";
            const state = sceneDirectorReadMediaState();
            delete state[ref];
            sceneDirectorWriteMediaState(state);
            sceneDirectorRenderMediaPreview();
            return;
        }
        const drop = event.target.closest("[data-scene-director-media-drop]");
        if (!drop) return;
        const tile = drop.closest("[data-scene-director-ref]");
        const ref = tile ? String(tile.getAttribute("data-scene-director-ref") || "") : "";
        const kind = tile ? String(tile.getAttribute("data-scene-director-kind") || "") : "";
        if (sceneDirectorMediaKindForbidden(kind)) return;
        if (ref && kind === "image") sceneDirectorOpenImageFileDialog(ref);
        if (kind === "audio" || kind === "video") sceneDirectorOpenMediaFileDialog(kind);
    });
    root.addEventListener("dragover", (event) => {
        const drop = event.target.closest("[data-scene-director-media-drop]");
        if (!drop) return;
        const tile = drop.closest("[data-scene-director-ref]");
        const kind = tile ? String(tile.getAttribute("data-scene-director-kind") || "") : "";
        event.preventDefault();
        if (sceneDirectorMediaKindForbidden(kind)) return;
        drop.classList.add("is-dragover");
    });
    root.addEventListener("dragleave", (event) => {
        const drop = event.target.closest("[data-scene-director-media-drop]");
        if (drop) drop.classList.remove("is-dragover");
    });
    root.addEventListener("drop", (event) => {
        const drop = event.target.closest("[data-scene-director-media-drop]");
        if (!drop) return;
        drop.classList.remove("is-dragover");
        const tile = drop.closest("[data-scene-director-ref]");
        const ref = tile ? String(tile.getAttribute("data-scene-director-ref") || "") : "";
        const kind = tile ? String(tile.getAttribute("data-scene-director-kind") || "") : "";
        event.preventDefault();
        if (sceneDirectorMediaKindForbidden(kind)) return;
        const files = event.dataTransfer && event.dataTransfer.files;
        const file = files && Array.from(files).find((item) => sceneDirectorFileMatchesKind(item, kind));
        if (ref && file && kind === "image") sceneDirectorReadImageFile(file, ref);
        if ((kind === "audio" || kind === "video") && files && files.length) sceneDirectorUploadMediaFiles(kind, files);
    });
}

function sceneDirectorImageCount(row) {
    const refs = sceneDirectorImageRefsFromRow(row);
    return new Set(refs).size;
}

function sceneDirectorImageRefsFromRow(row) {
    return Array.from(new Set((Array.isArray(row) ? row.slice(SCENE_DIRECTOR_IMAGE_START_INDEX, SCENE_DIRECTOR_AUDIO_INDEX) : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)));
}

function sceneDirectorRowRuleText(row) {
    const capability = sceneDirectorCapability();
    const refs = sceneDirectorImageRefsFromRow(row);
    const labels = refs.map((ref) => sceneDirectorImageLabel(ref));
    const count = refs.length;
    const withLimit = (text) => `${text}${sceneDirectorImageLimitSuffix(capability)}`;
    if (capability.imagePolicy === "forbidden") return sceneDirectorText("Current preset does not use image refs");
    if (capability.imagePolicy === "required" && count < capability.minImages) return withLimit(sceneDirectorText("Current preset requires a first-frame image"));
    if (count > capability.maxImages) {
        return sceneDirectorText("Current preset accepts up to {count} image(s)").replace("{count}", String(capability.maxImages));
    }
    if (count >= 3) return withLimit(sceneDirectorText("3-9 images: Reference set ({images})").replace("{images}", labels.join(", ")));
    if (count >= 2) {
        return withLimit(sceneDirectorText("2 images: {first} first frame / {last} last frame")
            .replace("{first}", labels[0])
            .replace("{last}", labels[1]));
    }
    if (count === 1) return withLimit(sceneDirectorText("1 image: {image} as first frame").replace("{image}", labels[0]));
    return withLimit(sceneDirectorText("0 images: Text-to-Video"));
}

function sceneDirectorImageLimitSuffix(capability) {
    const maxImages = sceneDirectorMaxImagesForCapability(capability);
    if (capability.imagePolicy === "forbidden" || maxImages >= SCENE_DIRECTOR_MAX_IMAGE_REFS) return "";
    return ` · ${sceneDirectorText("Max {count} image(s)").replace("{count}", String(maxImages))}`;
}

function sceneDirectorTimelineNumber(value, fallback, min = -Infinity, max = Infinity) {
    const number = Number(value);
    const next = Number.isFinite(number) ? number : Number(fallback);
    return Math.max(min, Math.min(max, Number.isFinite(next) ? next : 0));
}

function sceneDirectorTimelineControlNumber(selector, fallback, min = -Infinity, max = Infinity) {
    return sceneDirectorTimelineNumber(sceneDirectorControlValue(selector), fallback, min, max);
}

function sceneDirectorTimelineFormatSeconds(value) {
    const number = Math.round(sceneDirectorTimelineNumber(value, 0, 0, 86400) * 10) / 10;
    return `${Number.isInteger(number) ? number.toFixed(0) : number.toFixed(1)}s`;
}

function sceneDirectorTimelineRoundSeconds(value) {
    return Math.round(sceneDirectorTimelineNumber(value, 0, 0, 86400) * 10) / 10;
}

function sceneDirectorTimelineRows(rows) {
    return sceneDirectorCloneRows(Array.isArray(rows) ? rows : sceneDirectorReadRows())
        .map((row, index) => {
            const start = sceneDirectorTimelineNumber(row[0], index * 5, 0, 86400);
            const end = Math.max(start, sceneDirectorTimelineNumber(row[1], start + 1, 0, 86400));
            return {
                index,
                start,
                end,
                prompt: String(row[2] || "").trim(),
                imageRefs: row.slice(SCENE_DIRECTOR_IMAGE_START_INDEX, SCENE_DIRECTOR_AUDIO_INDEX).map((item) => String(item || "").trim()).filter(Boolean),
                audioRef: String(row[SCENE_DIRECTOR_AUDIO_INDEX] || "").trim(),
                videoRef: String(row[SCENE_DIRECTOR_VIDEO_INDEX] || "").trim(),
            };
        })
        .filter((row) => row.prompt || row.imageRefs.length || row.audioRef || row.videoRef);
}

function sceneDirectorTimelineTotalDuration(rows) {
    const controlDuration = sceneDirectorTimelineControlNumber("#scene_director_duration", 10, 0.1, 86400);
    const rowEnd = rows.reduce((maxValue, row) => Math.max(maxValue, row.end), 0);
    return Math.max(0.1, controlDuration, rowEnd);
}

function sceneDirectorTimelineRefChips(refs, mediaMap) {
    return refs.map((ref) => {
        const media = mediaMap.get(ref) || {};
        const src = String(media.src || "");
        const label = String(media.label || sceneDirectorMediaLabel(ref));
        const body = src
            ? `<img src="${sceneDirectorEscapeHtml(src)}" alt="">`
            : `<span>${sceneDirectorEscapeHtml(ref.replace(/^(image|audio|video)_/, ""))}</span>`;
        return `<em class="scene-director-timeline-ref" title="${sceneDirectorEscapeHtml(label)}">${body}</em>`;
    }).join("");
}

function sceneDirectorTimelineClipHtml(row, totalDuration, mediaMap) {
    const left = Math.max(0, Math.min(100, row.start / totalDuration * 100));
    const right = Math.max(0, Math.min(100, (totalDuration - row.end) / totalDuration * 100));
    const duration = Math.max(0, row.end - row.start);
    const refs = row.imageRefs.length ? row.imageRefs : (row.videoRef ? [row.videoRef] : []);
    const badges = [
        ...row.imageRefs.map((ref) => `@${ref}`),
        row.audioRef ? `@${row.audioRef}` : "",
        row.videoRef ? `@${row.videoRef}` : "",
    ].filter(Boolean).join(" ");
    const title = `${sceneDirectorText("Shot")} ${row.index + 1} · ${sceneDirectorTimelineFormatSeconds(row.start)}-${sceneDirectorTimelineFormatSeconds(row.end)}`;
    const prompt = row.prompt || sceneDirectorMediaLabel(row.videoRef) || sceneDirectorText("Text-to-Video");
    return `
<article class="scene-director-timeline-clip ${row.imageRefs.length ? "has-image" : ""} ${row.videoRef ? "has-video" : ""}" style="left:${left}%; right:${right}%;" title="${sceneDirectorEscapeHtml(prompt)}" data-scene-director-timeline-clip="${row.index}" data-scene-director-timeline-drag="move" aria-label="${sceneDirectorEscapeHtml(sceneDirectorText("Move shot"))}">
  <button type="button" class="scene-director-timeline-handle is-start" data-scene-director-timeline-drag="start" title="${sceneDirectorEscapeHtml(sceneDirectorText("Adjust start"))}" aria-label="${sceneDirectorEscapeHtml(sceneDirectorText("Adjust start"))}"></button>
  <div class="scene-director-timeline-clip-media">${sceneDirectorTimelineRefChips(refs, mediaMap)}</div>
  <div class="scene-director-timeline-clip-body">
    <b>${sceneDirectorEscapeHtml(title)}</b>
    <span>${sceneDirectorEscapeHtml(prompt)}</span>
    <small>${sceneDirectorEscapeHtml(badges || sceneDirectorTimelineFormatSeconds(duration))}</small>
  </div>
  <button type="button" class="scene-director-timeline-handle is-end" data-scene-director-timeline-drag="end" title="${sceneDirectorEscapeHtml(sceneDirectorText("Adjust end"))}" aria-label="${sceneDirectorEscapeHtml(sceneDirectorText("Adjust end"))}"></button>
</article>`;
}

function sceneDirectorTimelineAudioHtml(row, totalDuration) {
    if (!row.audioRef) return "";
    const left = Math.max(0, Math.min(100, row.start / totalDuration * 100));
    const right = Math.max(0, Math.min(100, (totalDuration - row.end) / totalDuration * 100));
    return `<span class="scene-director-timeline-audio-segment" data-scene-director-timeline-audio="${row.index}" style="left:${left}%; right:${right}%;">${sceneDirectorEscapeHtml(row.audioRef)}</span>`;
}

function sceneDirectorTimelinePromptHtml(row, totalDuration) {
    const left = Math.max(0, Math.min(100, row.start / totalDuration * 100));
    const right = Math.max(0, Math.min(100, (totalDuration - row.end) / totalDuration * 100));
    const prompt = row.prompt || sceneDirectorText("No shots");
    return `<span class="scene-director-timeline-prompt-segment" data-scene-director-timeline-prompt="${row.index}" style="left:${left}%; right:${right}%;">${sceneDirectorEscapeHtml(prompt)}</span>`;
}

function sceneDirectorTimelineRulerHtml(totalDuration) {
    const steps = 4;
    const fps = sceneDirectorTimelineControlNumber("#scene_director_fps", 24, 1, 240);
    return Array.from({ length: steps + 1 }, (_item, index) => {
        const seconds = totalDuration * index / steps;
        const left = index / steps * 100;
        const frame = Math.round(seconds * fps);
        return `<span style="left:${left}%"><b>${sceneDirectorTimelineFormatSeconds(seconds)}</b><small>${frame}f</small></span>`;
    }).join("");
}

function sceneDirectorSetHtmlIfChanged(node, html) {
    if (!node || node.innerHTML === html) return false;
    node.innerHTML = html;
    return true;
}

function sceneDirectorRenderTimelinePreview(rows) {
    const preview = sceneDirectorQuery("[data-scene-director-timeline-preview]");
    if (!preview) return;
    const timelineRows = sceneDirectorTimelineRows(rows);
    const totalDuration = sceneDirectorTimelineTotalDuration(timelineRows);
    const mediaMap = sceneDirectorMediaMap();
    const composeEnabled = sceneDirectorComposeEnabled();
    preview.classList.toggle("is-compose-enabled", composeEnabled);
    preview.classList.toggle("is-compose-disabled", !composeEnabled);

    const title = preview.querySelector("[data-scene-director-timeline-title]");
    if (title) title.textContent = sceneDirectorText("Timeline preview");
    const meta = preview.querySelector("[data-scene-director-timeline-meta]");
    if (meta) {
        const fps = sceneDirectorTimelineControlNumber("#scene_director_fps", 24, 1, 240);
        const width = sceneDirectorTimelineControlNumber("#scene_director_width", 1280, 64, 8192);
        const height = sceneDirectorTimelineControlNumber("#scene_director_height", 720, 64, 8192);
        const status = sceneDirectorText(composeEnabled ? "Compose on" : "Compose off");
        meta.textContent = `${status} · ${Math.round(width)}x${Math.round(height)} · ${fps}fps · ${sceneDirectorTimelineFormatSeconds(totalDuration)}`;
    }

    const ruler = preview.querySelector("[data-scene-director-timeline-ruler]");
    if (ruler) sceneDirectorSetHtmlIfChanged(ruler, sceneDirectorTimelineRulerHtml(totalDuration));
    const videoTrack = preview.querySelector("[data-scene-director-timeline-video-track]");
    if (videoTrack) {
        const html = timelineRows.length
            ? `<strong>${sceneDirectorEscapeHtml(sceneDirectorText("Video track"))}</strong>${timelineRows.map((row) => sceneDirectorTimelineClipHtml(row, totalDuration, mediaMap)).join("")}`
            : `<strong>${sceneDirectorEscapeHtml(sceneDirectorText("Video track"))}</strong><span class="scene-director-timeline-empty">${sceneDirectorEscapeHtml(sceneDirectorText("No shots"))}</span>`;
        sceneDirectorSetHtmlIfChanged(videoTrack, html);
    }
    const audioTrack = preview.querySelector("[data-scene-director-timeline-audio-track]");
    if (audioTrack) {
        const html = `<strong>${sceneDirectorEscapeHtml(sceneDirectorText("Audio track"))}</strong>${timelineRows.map((row) => sceneDirectorTimelineAudioHtml(row, totalDuration)).join("")}`;
        sceneDirectorSetHtmlIfChanged(audioTrack, html);
    }
    const promptTrack = preview.querySelector("[data-scene-director-timeline-prompt-track]");
    if (promptTrack) {
        const html = `<strong>${sceneDirectorEscapeHtml(sceneDirectorText("Prompt track"))}</strong>${timelineRows.map((row) => sceneDirectorTimelinePromptHtml(row, totalDuration)).join("")}`;
        sceneDirectorSetHtmlIfChanged(promptTrack, html);
    }
}

function sceneDirectorTimelineMinDuration() {
    const capability = sceneDirectorCapability();
    const value = Number(capability && capability.minSegmentDuration);
    return Number.isFinite(value) ? Math.max(0.05, value) : 1;
}

function sceneDirectorTimelineMaxDuration() {
    const capability = sceneDirectorCapability();
    const minDuration = sceneDirectorTimelineMinDuration();
    const value = Number(capability && capability.maxSegmentDuration);
    return Number.isFinite(value) ? Math.max(minDuration, value) : Math.max(minDuration, 10);
}

function sceneDirectorTimelineClamp(value, min, max) {
    const low = Number.isFinite(min) ? min : 0;
    const high = Number.isFinite(max) ? max : 86400;
    if (high < low) return low;
    return Math.max(low, Math.min(high, value));
}

function sceneDirectorTimelineNeighborBounds(rows, index) {
    const bounds = { previousEnd: 0, nextStart: 86400 };
    sceneDirectorTimelineRows(rows).forEach((item) => {
        if (item.index < index) {
            bounds.previousEnd = Math.max(bounds.previousEnd, item.end);
        } else if (item.index > index) {
            bounds.nextStart = Math.min(bounds.nextStart, item.start);
        }
    });
    bounds.previousEnd = sceneDirectorTimelineRoundSeconds(bounds.previousEnd);
    bounds.nextStart = sceneDirectorTimelineRoundSeconds(bounds.nextStart);
    return bounds;
}

function sceneDirectorTimelineSetEditorRowTimes(rows) {
    const editor = sceneDirectorQuery("#scene_director_editor_root");
    if (!editor) return;
    sceneDirectorCloneRows(rows).forEach((row, index) => {
        const rowNode = editor.querySelector(`[data-scene-director-shot][data-scene-director-index="${index}"]`);
        if (!rowNode) return;
        const start = rowNode.querySelector('[data-scene-director-field="start"]');
        const end = rowNode.querySelector('[data-scene-director-field="end"]');
        const startValue = String(row[0] ?? "");
        const endValue = String(row[1] ?? "");
        if (start && start.value !== startValue) start.value = startValue;
        if (end && end.value !== endValue) end.value = endValue;
        sceneDirectorUpdateRule(rowNode);
    });
}

function sceneDirectorTimelineDragRows(event) {
    const state = sceneDirectorTimelineDragState;
    if (!state || !state.trackWidth) return null;
    const delta = (event.clientX - state.startClientX) / state.trackWidth * state.totalDuration;
    const minDuration = state.minDuration;
    const maxDuration = state.maxDuration;
    const rows = sceneDirectorCloneRows(state.rows);
    const row = rows[state.index];
    if (!row) return null;
    const sourceStart = state.sourceStart;
    const sourceEnd = state.sourceEnd;
    const previousEndValue = Number.isFinite(state.previousEnd) ? state.previousEnd : 0;
    const nextStartValue = Number.isFinite(state.nextStart) ? state.nextStart : 86400;
    const previousEnd = sceneDirectorTimelineRoundSeconds(Math.max(0, previousEndValue));
    const nextStartLimit = sceneDirectorTimelineRoundSeconds(Math.min(86400, nextStartValue));
    const availableDuration = Math.max(0, nextStartLimit - previousEnd);
    const boundedMinDuration = Math.min(minDuration, availableDuration || minDuration);
    const sourceDuration = availableDuration > 0
        ? Math.min(availableDuration, Math.max(boundedMinDuration, Math.min(maxDuration, sourceEnd - sourceStart)))
        : Math.max(minDuration, Math.min(maxDuration, sourceEnd - sourceStart));
    let nextStart = sourceStart;
    let nextEnd = sourceEnd;
    if (state.mode === "start") {
        const anchorEnd = sceneDirectorTimelineClamp(sourceEnd, previousEnd, nextStartLimit);
        const allowedDuration = Math.max(0, Math.min(maxDuration, anchorEnd - previousEnd));
        const lower = anchorEnd - allowedDuration;
        const upper = anchorEnd - Math.min(minDuration, allowedDuration);
        nextStart = sceneDirectorTimelineClamp(sourceStart + delta, lower, upper);
        nextEnd = anchorEnd;
    } else if (state.mode === "end") {
        const anchorStart = sceneDirectorTimelineClamp(sourceStart, previousEnd, nextStartLimit);
        const allowedDuration = Math.max(0, Math.min(maxDuration, nextStartLimit - anchorStart));
        const lower = anchorStart + Math.min(minDuration, allowedDuration);
        const upper = anchorStart + allowedDuration;
        nextEnd = sceneDirectorTimelineClamp(sourceEnd + delta, lower, upper);
        nextStart = anchorStart;
    } else {
        const lower = previousEnd;
        const upper = Math.min(nextStartLimit - sourceDuration, 86400 - sourceDuration);
        nextStart = sceneDirectorTimelineClamp(sourceStart + delta, lower, upper);
        nextEnd = nextStart + sourceDuration;
    }
    const roundedStart = sceneDirectorTimelineRoundSeconds(nextStart);
    const endUpper = Math.max(roundedStart, Math.min(nextStartLimit, roundedStart + maxDuration));
    const endLower = Math.min(endUpper, roundedStart + Math.min(minDuration, Math.max(0, nextStartLimit - roundedStart)));
    row[0] = roundedStart;
    row[1] = sceneDirectorTimelineRoundSeconds(Math.max(endLower, Math.min(endUpper, nextEnd)));
    return rows;
}

function sceneDirectorTimelineSetSegmentStyle(node, row, totalDuration) {
    if (!node || !row || !totalDuration) return;
    const left = Math.max(0, Math.min(100, row.start / totalDuration * 100));
    const right = Math.max(0, Math.min(100, (totalDuration - row.end) / totalDuration * 100));
    node.style.left = `${left}%`;
    node.style.right = `${right}%`;
}

function sceneDirectorUpdateTimelineDragPreview(rows) {
    const preview = sceneDirectorQuery("[data-scene-director-timeline-preview]");
    if (!preview) return;
    const timelineRows = sceneDirectorTimelineRows(rows);
    const totalDuration = sceneDirectorTimelineTotalDuration(timelineRows);
    timelineRows.forEach((row) => {
        const clip = preview.querySelector(`[data-scene-director-timeline-clip="${row.index}"]`);
        sceneDirectorTimelineSetSegmentStyle(clip, row, totalDuration);
        if (clip) {
            const title = clip.querySelector(".scene-director-timeline-clip-body b");
            if (title) {
                title.textContent = `${sceneDirectorText("Shot")} ${row.index + 1} · ${sceneDirectorTimelineFormatSeconds(row.start)}-${sceneDirectorTimelineFormatSeconds(row.end)}`;
            }
            const duration = Math.max(0, row.end - row.start);
            const small = clip.querySelector(".scene-director-timeline-clip-body small");
            if (small && !String(small.textContent || "").trim().startsWith("@")) {
                small.textContent = sceneDirectorTimelineFormatSeconds(duration);
            }
        }
        sceneDirectorTimelineSetSegmentStyle(preview.querySelector(`[data-scene-director-timeline-audio="${row.index}"]`), row, totalDuration);
        sceneDirectorTimelineSetSegmentStyle(preview.querySelector(`[data-scene-director-timeline-prompt="${row.index}"]`), row, totalDuration);
    });
}

function sceneDirectorTimelineApplyDrag(event, commit = false) {
    const rows = sceneDirectorTimelineDragRows(event);
    if (!rows) return;
    if (commit) {
        sceneDirectorTimelineSetEditorRowTimes(rows);
        sceneDirectorWriteRows(rows);
        sceneDirectorRefreshEditorPreviews();
    } else {
        sceneDirectorUpdateTimelineDragPreview(rows);
    }
}

function sceneDirectorTimelineScheduleDragPreview(event) {
    sceneDirectorTimelineDragPendingPoint = { clientX: event.clientX };
    if (sceneDirectorTimelineDragFrame !== null) return;
    sceneDirectorTimelineDragFrame = window.requestAnimationFrame(() => {
        const point = sceneDirectorTimelineDragPendingPoint;
        sceneDirectorTimelineDragFrame = null;
        sceneDirectorTimelineDragPendingPoint = null;
        if (point && sceneDirectorTimelineDragState) {
            sceneDirectorTimelineApplyDrag(point, false);
        }
    });
}

function sceneDirectorTimelineCancelDragPreviewFrame() {
    if (sceneDirectorTimelineDragFrame !== null) {
        window.cancelAnimationFrame(sceneDirectorTimelineDragFrame);
        sceneDirectorTimelineDragFrame = null;
    }
    sceneDirectorTimelineDragPendingPoint = null;
}

function sceneDirectorTimelinePointerMove(event) {
    if (!sceneDirectorTimelineDragState) return;
    event.preventDefault();
    sceneDirectorTimelineScheduleDragPreview(event);
}

function sceneDirectorTimelinePointerUp(event) {
    if (!sceneDirectorTimelineDragState) return;
    event.preventDefault();
    sceneDirectorTimelineCancelDragPreviewFrame();
    sceneDirectorTimelineApplyDrag(event, true);
    const preview = sceneDirectorQuery("[data-scene-director-timeline-preview]");
    if (preview) preview.classList.remove("is-dragging");
    document.removeEventListener("pointermove", sceneDirectorTimelinePointerMove, true);
    document.removeEventListener("pointerup", sceneDirectorTimelinePointerUp, true);
    document.removeEventListener("pointercancel", sceneDirectorTimelinePointerUp, true);
    sceneDirectorTimelineDragState = null;
}

function sceneDirectorTimelinePointerDown(event) {
    if (!event || event.button !== 0) return;
    const dragNode = event.target && event.target.closest ? event.target.closest("[data-scene-director-timeline-drag]") : null;
    const clip = event.target && event.target.closest ? event.target.closest("[data-scene-director-timeline-clip]") : null;
    const track = event.target && event.target.closest ? event.target.closest("[data-scene-director-timeline-video-track]") : null;
    if (!dragNode || !clip || !track) return;
    const index = Number(clip.getAttribute("data-scene-director-timeline-clip"));
    if (!Number.isFinite(index)) return;
    const rows = sceneDirectorCloneRows(sceneDirectorReadRows());
    const row = rows[index];
    if (!row) return;
    const rect = track.getBoundingClientRect();
    if (!rect || rect.width <= 1) return;
    const sourceStart = sceneDirectorTimelineNumber(row[0], index * 5, 0, 86400);
    const sourceEnd = Math.max(sourceStart + sceneDirectorTimelineMinDuration(), sceneDirectorTimelineNumber(row[1], sourceStart + 1, 0, 86400));
    const timelineRows = sceneDirectorTimelineRows(rows);
    const neighborBounds = sceneDirectorTimelineNeighborBounds(rows, index);
    sceneDirectorTimelineDragState = {
        index,
        rows,
        mode: dragNode.getAttribute("data-scene-director-timeline-drag") || "move",
        startClientX: event.clientX,
        trackWidth: rect.width,
        totalDuration: sceneDirectorTimelineTotalDuration(timelineRows),
        sourceStart,
        sourceEnd,
        minDuration: sceneDirectorTimelineMinDuration(),
        maxDuration: sceneDirectorTimelineMaxDuration(),
        previousEnd: neighborBounds.previousEnd,
        nextStart: neighborBounds.nextStart,
    };
    const preview = sceneDirectorQuery("[data-scene-director-timeline-preview]");
    if (preview) preview.classList.add("is-dragging");
    event.preventDefault();
    document.addEventListener("pointermove", sceneDirectorTimelinePointerMove, true);
    document.addEventListener("pointerup", sceneDirectorTimelinePointerUp, true);
    document.addEventListener("pointercancel", sceneDirectorTimelinePointerUp, true);
}

function sceneDirectorBindTimelinePreviewControls() {
    const preview = sceneDirectorQuery("[data-scene-director-timeline-preview]");
    if (!preview || preview.dataset.sceneDirectorTimelinePreviewBound === "1") return;
    preview.dataset.sceneDirectorTimelinePreviewBound = "1";
    preview.addEventListener("pointerdown", sceneDirectorTimelinePointerDown, true);
    ["#scene_director_compose", "#scene_director_width", "#scene_director_height", "#scene_director_fps", "#scene_director_duration"].forEach((selector) => {
        const root = sceneDirectorQuery(selector);
        if (!root) return;
        root.addEventListener("input", () => sceneDirectorRenderTimelinePreview(), true);
        root.addEventListener("change", () => sceneDirectorRenderTimelinePreview(), true);
    });
}

function sceneDirectorRowsFromEditor(editor) {
    return Array.from(editor.querySelectorAll("[data-scene-director-shot]")).map((row) => {
        const value = (key) => {
            const field = row.querySelector(`[data-scene-director-field="${key}"]`);
            return field ? field.value : "";
        };
        return [
            value("start"),
            value("end"),
            value("prompt"),
            ...Array.from({ length: SCENE_DIRECTOR_MAX_IMAGE_REFS }, (_, imageIndex) => value(`image_ref_${imageIndex + 1}`)),
            value("audio_ref"),
            value("video_ref"),
        ];
    });
}

function sceneDirectorUpdateRule(rowNode) {
    if (!rowNode) return;
    const editor = rowNode.closest("[data-scene-director-editor]");
    if (!editor) return;
    const index = Number(rowNode.getAttribute("data-scene-director-index") || 0);
    const row = sceneDirectorRowsFromEditor(editor)[index] || [];
    const node = rowNode.querySelector("[data-scene-director-rule]");
    if (node) node.textContent = sceneDirectorRowRuleText(row);
}

function sceneDirectorRenderShot(row, index, total) {
    const capability = sceneDirectorCapability();
    const values = sceneDirectorNormalizeRowValues(row, capability, index);
    const mediaMap = sceneDirectorMediaMap();
    const startNumber = Number(values[0]);
    const endMin = Number.isFinite(startNumber) ? Math.round((startNumber + capability.minSegmentDuration) * 1000) / 1000 : "";
    const endMax = Number.isFinite(startNumber) ? Math.round((startNumber + capability.maxSegmentDuration) * 1000) / 1000 : "";
    const imageRefs = values.slice(SCENE_DIRECTOR_IMAGE_START_INDEX, SCENE_DIRECTOR_AUDIO_INDEX).map((item) => String(item || "").trim()).filter(Boolean);
    const inheritPreviousTail = imageRefs.includes(SCENE_DIRECTOR_PREVIOUS_IMAGE_REF);
    const inheritDisabled = index <= 0 || !sceneDirectorPreviousImageSupported(capability);
    const hiddenImageFields = Array.from({ length: SCENE_DIRECTOR_MAX_IMAGE_REFS }, (_, imageIndex) => imageIndex + 1).map((itemIndex) => (
        `<input type="hidden" data-scene-director-field="image_ref_${itemIndex}" value="${sceneDirectorEscapeHtml(imageRefs[itemIndex - 1] || "")}">`
    )).join("");
    return `
<div class="scene-director-shot ${index === sceneDirectorActiveShotIndex ? "is-active-shot" : ""}" data-scene-director-shot data-scene-director-index="${index}" ${index === sceneDirectorActiveShotIndex ? 'aria-current="true"' : ""}>
  <div class="scene-director-shot-head">
    <b>${sceneDirectorEscapeHtml(sceneDirectorText("Shot"))} ${index + 1}</b>
    <span data-scene-director-rule>${sceneDirectorEscapeHtml(sceneDirectorRowRuleText(values))}</span>
    <div>
      <button type="button" data-scene-director-action="move-up" title="${sceneDirectorEscapeHtml(sceneDirectorText("Move up"))}" ${index === 0 ? "disabled" : ""}>↑</button>
      <button type="button" data-scene-director-action="move-down" title="${sceneDirectorEscapeHtml(sceneDirectorText("Move down"))}" ${index >= total - 1 ? "disabled" : ""}>↓</button>
      <button type="button" data-scene-director-action="delete" title="${sceneDirectorEscapeHtml(sceneDirectorText("Delete shot"))}" ${total <= 1 ? "disabled" : ""}>×</button>
    </div>
  </div>
  <div class="scene-director-shot-grid">
    <label><span>${sceneDirectorEscapeHtml(sceneDirectorText("Start"))}</span><input type="number" min="0" max="86400" step="0.1" data-scene-director-field="start" value="${sceneDirectorEscapeHtml(values[0])}"></label>
    <label><span>${sceneDirectorEscapeHtml(sceneDirectorText("End"))}</span><input type="number" min="${sceneDirectorEscapeHtml(endMin)}" max="${sceneDirectorEscapeHtml(endMax)}" step="0.1" data-scene-director-field="end" value="${sceneDirectorEscapeHtml(values[1])}"></label>
    <label class="scene-director-shot-prompt"><span class="scene-director-shot-prompt-heading"><span>${sceneDirectorEscapeHtml(sceneDirectorText("Prompt"))}</span><button type="button" data-scene-director-action="prompt-tools" title="${sceneDirectorEscapeHtml(sceneDirectorText("Prompt Tools"))}" aria-label="${sceneDirectorEscapeHtml(sceneDirectorText("Prompt Tools"))}" ${String(values[2] || "").trim() ? "" : "disabled"}><i class="fa-solid fa-wand-magic-sparkles"></i><span>${sceneDirectorEscapeHtml(sceneDirectorText("Prompt Tools"))}</span></button></span><textarea rows="2" data-scene-director-field="prompt">${sceneDirectorEscapeHtml(values[2])}</textarea></label>
    <label class="scene-director-image-refs-field"><span>${sceneDirectorEscapeHtml(sceneDirectorText("Image refs"))}</span>${hiddenImageFields}<span class="scene-director-inherit-tail"><input type="checkbox" data-scene-director-inherit-tail ${inheritPreviousTail ? "checked" : ""} ${inheritDisabled ? 'disabled aria-disabled="true"' : ""}><span>${sceneDirectorEscapeHtml(sceneDirectorText("Inherit previous shot last frame"))}</span></span><div class="scene-director-ref-picker" data-scene-director-ref-picker>${SCENE_DIRECTOR_IMAGE_OPTIONS.filter(Boolean).map((ref) => sceneDirectorImageChoiceHtml(ref, imageRefs, mediaMap, capability)).join("")}</div></label>
    <label><span>${sceneDirectorEscapeHtml(sceneDirectorText("Audio"))}</span><select data-scene-director-field="audio_ref" ${capability.audioPolicy === "forbidden" ? 'disabled aria-disabled="true"' : ""}>${sceneDirectorOptionHtml(sceneDirectorAudioOptions(), values[SCENE_DIRECTOR_AUDIO_INDEX])}</select></label>
    <label><span>${sceneDirectorEscapeHtml(sceneDirectorText("Video"))}</span><select data-scene-director-field="video_ref" ${capability.videoPolicy === "forbidden" ? 'disabled aria-disabled="true"' : ""}>${sceneDirectorOptionHtml(sceneDirectorVideoOptions(), values[SCENE_DIRECTOR_VIDEO_INDEX])}</select></label>
  </div>
</div>`;
}

function sceneDirectorRenderEditor(rows) {
    const editor = sceneDirectorQuery("#scene_director_editor_root");
    if (!editor) return;
    const list = editor.querySelector("[data-scene-director-shot-list]");
    if (!list) return;
    const sourceRows = sceneDirectorCloneRows(rows.length ? rows : SCENE_DIRECTOR_DEFAULT_ROWS);
    const capability = sceneDirectorCapability();
    const capabilitySignature = sceneDirectorCapabilitySignature();
    const nextRows = sourceRows.map((row, index) => sceneDirectorNormalizeRowValues(row, capability, index));
    sceneDirectorActiveShotIndex = Math.max(0, Math.min(Math.max(0, nextRows.length - 1), sceneDirectorActiveShotIndex));
    const title = editor.querySelector("[data-scene-director-title]");
    if (title) title.textContent = sceneDirectorText("Shots");
    const add = editor.querySelector('[data-scene-director-action="add"]');
    if (add) add.textContent = sceneDirectorText("Add shot");
    list.innerHTML = nextRows.map((row, index) => sceneDirectorRenderShot(row, index, nextRows.length)).join("");
    sceneDirectorRefreshEditorPreviews(editor, { writeRows: true });
    sceneDirectorRenderTimelinePreview(nextRows);
    if (JSON.stringify(sourceRows) !== JSON.stringify(nextRows)) sceneDirectorWriteRows(nextRows);
    editor.dataset.sceneDirectorRendered = "1";
    editor.dataset.sceneDirectorRenderedCapabilitySignature = capabilitySignature;
    if (typeof syncPositivePromptMetaState === "function") {
        try { syncPositivePromptMetaState(); } catch (e) {}
    }
}

function sceneDirectorBindEditor() {
    const editor = sceneDirectorQuery("#scene_director_editor_root");
    if (!editor || editor.dataset.sceneDirectorBound === "1") return;
    editor.dataset.sceneDirectorBound = "1";
    editor.addEventListener("focusin", (event) => {
        const row = event.target.closest("[data-scene-director-shot]");
        if (!row) return;
        const index = Number(row.getAttribute("data-scene-director-index") || 0);
        if (sceneDirectorSetActiveShot(editor, index)) {
            sceneDirectorWriteRows(sceneDirectorRowsFromEditor(editor));
        }
    });
    editor.addEventListener("input", (event) => {
        if (!event.target.closest("[data-scene-director-field]")) return;
        if (event.target.matches('[data-scene-director-field="prompt"]')) {
            const row = event.target.closest("[data-scene-director-shot]");
            const button = row ? row.querySelector('[data-scene-director-action="prompt-tools"]') : null;
            if (button) {
                const enabled = !!String(event.target.value || "").trim();
                button.disabled = !enabled;
                button.setAttribute("aria-disabled", enabled ? "false" : "true");
            }
            if (typeof syncPositivePromptMetaState === "function") {
                try { syncPositivePromptMetaState(); } catch (e) {}
            }
        }
        sceneDirectorWriteRows(sceneDirectorRowsFromEditor(editor));
    });
    editor.addEventListener("change", (event) => {
        const inheritField = event.target.closest("[data-scene-director-inherit-tail]");
        if (inheritField) {
            const rowNode = inheritField.closest("[data-scene-director-shot]");
            const capability = sceneDirectorCapability();
            const explicitRefs = sceneDirectorSelectedImageRefs(rowNode).filter((ref) => ref !== SCENE_DIRECTOR_PREVIOUS_IMAGE_REF);
            const nextRefs = inheritField.checked
                ? [SCENE_DIRECTOR_PREVIOUS_IMAGE_REF, ...explicitRefs].slice(0, sceneDirectorMaxImagesForCapability(capability))
                : explicitRefs;
            sceneDirectorSetSelectedImageRefs(rowNode, nextRefs, capability);
            sceneDirectorRenderImageRefPicker(rowNode);
            sceneDirectorUpdateRule(rowNode);
            sceneDirectorWriteRows(sceneDirectorRowsFromEditor(editor));
            return;
        }
        if (!event.target.closest("[data-scene-director-field]")) return;
        const row = event.target.closest("[data-scene-director-shot]");
        sceneDirectorUpdateRule(row);
        sceneDirectorRenderImageRefPicker(row);
        sceneDirectorWriteRows(sceneDirectorRowsFromEditor(editor));
    });
    editor.addEventListener("click", (event) => {
        const clickedRow = event.target.closest("[data-scene-director-shot]");
        const activeChanged = clickedRow
            ? sceneDirectorSetActiveShot(editor, Number(clickedRow.getAttribute("data-scene-director-index") || 0))
            : false;
        const refChoice = event.target.closest("[data-scene-director-ref-choice]");
        if (refChoice) {
            if (refChoice.disabled || refChoice.getAttribute("aria-disabled") === "true") return;
            const rowNode = refChoice.closest("[data-scene-director-shot]");
            const ref = String(refChoice.getAttribute("data-scene-director-ref-choice") || "").trim();
            const refs = sceneDirectorSelectedImageRefs(rowNode);
            const capability = sceneDirectorCapability();
            const nextRefs = sceneDirectorNextImageRefs(ref, refs, capability);
            sceneDirectorSetSelectedImageRefs(rowNode, nextRefs, capability);
            sceneDirectorRenderImageRefPicker(rowNode);
            sceneDirectorUpdateRule(rowNode);
            sceneDirectorWriteRows(sceneDirectorRowsFromEditor(editor));
            return;
        }
        const actionNode = event.target.closest("[data-scene-director-action]");
        if (!actionNode) {
            if (activeChanged) sceneDirectorWriteRows(sceneDirectorRowsFromEditor(editor));
            return;
        }
        const action = actionNode.getAttribute("data-scene-director-action");
        if (action === "prompt-tools") {
            if (actionNode.disabled || actionNode.getAttribute("aria-disabled") === "true") return;
            const promptField = actionNode.closest("[data-scene-director-shot]")?.querySelector('[data-scene-director-field="prompt"]');
            if (promptField && typeof window.openSimpleAIPromptToolsForField === "function") {
                window.openSimpleAIPromptToolsForField(promptField);
            }
            return;
        }
        if (action === "add") {
            const rows = sceneDirectorRowsFromEditor(editor);
            const last = rows[rows.length - 1] || [0, 5, "", "", "", "", "", "", "", ""];
            const start = Number(last[1] || last[0] || rows.length * 5);
            const end = Number.isFinite(start) ? start + 5 : (rows.length + 1) * 5;
            rows.push([start, end, "", "", "", "", "", "", "", ""]);
            sceneDirectorActiveShotIndex = rows.length - 1;
            sceneDirectorRenderEditor(rows);
            sceneDirectorWriteRows(rows);
            return;
        }
        const rowNode = actionNode.closest("[data-scene-director-shot]");
        if (!rowNode) return;
        const index = Number(rowNode.getAttribute("data-scene-director-index") || 0);
        const rows = sceneDirectorRowsFromEditor(editor);
        if (action === "delete" && rows.length > 1) {
            rows.splice(index, 1);
            sceneDirectorActiveShotIndex = Math.min(index, rows.length - 1);
        } else if (action === "move-up" && index > 0) {
            [rows[index - 1], rows[index]] = [rows[index], rows[index - 1]];
            sceneDirectorActiveShotIndex = index - 1;
        } else if (action === "move-down" && index < rows.length - 1) {
            [rows[index + 1], rows[index]] = [rows[index], rows[index + 1]];
            sceneDirectorActiveShotIndex = index + 1;
        } else {
            return;
        }
        sceneDirectorRenderEditor(rows);
        sceneDirectorWriteRows(rows);
    });
}

function sceneDirectorGenerateEnabled() {
    const root = sceneDirectorQuery("#scene_director_enabled");
    const input = root ? root.querySelector('input[type="checkbox"]') : null;
    return !!(input && input.checked);
}

function sceneDirectorPresetAvailable(capability = null) {
    const normalized = sceneDirectorNormalizeCapability(capability || sceneDirectorDatasetCapability(true));
    const engineType = String(document.documentElement?.dataset?.simpaiPresetEngineType || "").trim().toLowerCase();
    return normalized.directorSupported && (!engineType || engineType === "video");
}

function sceneDirectorDeactivateIfUnsupported(capability = null) {
    if (sceneDirectorPresetAvailable(capability)) return false;
    let changed = false;
    sceneDirectorWithDraftSavePaused(() => {
        const enabledInput = sceneDirectorCheckboxInput("#scene_director_enabled");
        const composeInput = sceneDirectorCheckboxInput("#scene_director_compose");
        if (enabledInput && enabledInput.checked) {
            sceneDirectorSetCheckboxValue("#scene_director_enabled", false, true);
            changed = true;
        }
        if (composeInput && composeInput.checked) {
            sceneDirectorSetCheckboxValue("#scene_director_compose", false, true);
            changed = true;
        }
    });
    sceneDirectorSetGenerateButtonLabel();
    return changed;
}

function sceneDirectorCheckboxInput(selector) {
    const root = sceneDirectorQuery(selector);
    return root ? root.querySelector('input[type="checkbox"]') : null;
}

function sceneDirectorSetCheckboxValue(selector, checked, dispatch = false) {
    const input = sceneDirectorCheckboxInput(selector);
    if (!input) return false;
    const next = !!checked;
    if (input.checked !== next) {
        input.checked = next;
        if (dispatch) {
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }
    return true;
}

function sceneDirectorSetComponentInteractive(selector, interactive) {
    const root = sceneDirectorQuery(selector);
    if (!root) return;
    const enabled = !!interactive;
    root.classList.toggle("scene-director-control-disabled", !enabled);
    root.querySelectorAll("input, textarea, select, button").forEach((node) => {
        node.disabled = !enabled;
        node.setAttribute("aria-disabled", enabled ? "false" : "true");
    });
}

function sceneDirectorCanComposeTimeline() {
    return sceneDirectorCapability().chainOutput === "timeline";
}

function sceneDirectorComposeEnabled() {
    const input = sceneDirectorCheckboxInput("#scene_director_compose");
    return !!(input && input.checked && sceneDirectorCanComposeTimeline());
}

function sceneDirectorSyncComposeControls(options = {}) {
    const composeRoot = sceneDirectorQuery("#scene_director_compose");
    const composeInput = sceneDirectorCheckboxInput("#scene_director_compose");
    const capability = sceneDirectorCapability();
    const canCompose = capability.chainOutput === "timeline";
    const signature = capability.chainOutput;
    if (composeInput && composeRoot && (options.fromCapability || !composeRoot.dataset.sceneDirectorComposeCapabilitySignature)) {
        if (composeRoot.dataset.sceneDirectorComposeCapabilitySignature !== signature) {
            composeRoot.dataset.sceneDirectorComposeCapabilitySignature = signature;
            delete composeRoot.dataset.sceneDirectorComposeUserChanged;
        }
    }
    if (composeInput && !canCompose && composeInput.checked) {
        sceneDirectorWithDraftSavePaused(() => {
            sceneDirectorSetCheckboxValue("#scene_director_compose", false, true);
        });
    }
    if (composeInput) {
        composeInput.disabled = !canCompose;
        composeInput.setAttribute("aria-disabled", canCompose ? "false" : "true");
    }
    if (composeRoot) {
        composeRoot.classList.toggle("scene-director-control-disabled", !canCompose);
    }
    const composeEnabled = sceneDirectorComposeEnabled();
    ["#scene_director_width", "#scene_director_height", "#scene_director_fps", "#scene_director_duration"].forEach((selector) => {
        sceneDirectorSetComponentInteractive(selector, composeEnabled);
    });
    document.documentElement.classList.toggle("simpai-scene-director-compose-enabled", composeEnabled);
    document.documentElement.classList.toggle("simpai-scene-director-compose-disabled", !composeEnabled);
    sceneDirectorRenderTimelinePreview();
}

function sceneDirectorBindComposeControls() {
    const root = sceneDirectorQuery("#scene_director_compose");
    if (!root || root.dataset.sceneDirectorComposeBound === "1") return;
    root.dataset.sceneDirectorComposeBound = "1";
    root.addEventListener("input", () => {
        root.dataset.sceneDirectorComposeUserChanged = "1";
        sceneDirectorSyncComposeControls();
    }, true);
    root.addEventListener("change", () => {
        root.dataset.sceneDirectorComposeUserChanged = "1";
        sceneDirectorSyncComposeControls();
    }, true);
    sceneDirectorSyncComposeControls({ fromCapability: true });
}

function sceneDirectorSetGenerateButtonLabel() {
    const root = sceneDirectorQuery("#generate_button");
    sceneDirectorSyncPromptInputInteractivity();
    if (!root) return;
    const label = sceneDirectorGenerateEnabled() ? sceneDirectorText("Generate shots") : sceneDirectorText("Generate");
    const button = root.matches && root.matches("button") ? root : root.querySelector("button");
    if (button && !button.disabled && button.textContent.trim() !== label) {
        button.textContent = label;
    }
    const span = root.querySelector("span");
    if (span && span.textContent.trim() !== label) {
        span.textContent = label;
    }
}

function sceneDirectorBindGenerateButtonLabel() {
    const root = sceneDirectorQuery("#scene_director_enabled");
    if (!root || root.dataset.sceneDirectorGenerateLabelBound === "1") return;
    root.dataset.sceneDirectorGenerateLabelBound = "1";
    root.addEventListener("input", sceneDirectorSetGenerateButtonLabel, true);
    root.addEventListener("change", sceneDirectorSetGenerateButtonLabel, true);
    sceneDirectorSetGenerateButtonLabel();
}

function sceneDirectorSyncPromptInputInteractivity() {
    const promptRoot = sceneDirectorQuery("#positive_prompt");
    const input = promptRoot ? promptRoot.querySelector("textarea, [data-testid='textbox'], input") : null;
    const directorEnabled = sceneDirectorGenerateEnabled();
    if (promptRoot) {
        promptRoot.classList.toggle("scene-director-prompt-readonly", directorEnabled);
        promptRoot.setAttribute("aria-disabled", directorEnabled ? "true" : "false");
    }
    if (input) {
        input.readOnly = directorEnabled;
        input.setAttribute("aria-readonly", directorEnabled ? "true" : "false");
        input.title = directorEnabled ? sceneDirectorText("Director mode uses shot prompts") : "";
    }
    const container = promptRoot && promptRoot.closest ? promptRoot.closest(".prompt-container") : null;
    if (container) {
        container.querySelectorAll(".clear-prompt-btn, .clear-prompt-btn button").forEach((node) => {
            if (!node) return;
            node.disabled = directorEnabled;
            node.setAttribute("aria-disabled", directorEnabled ? "true" : "false");
        });
    }
    document.documentElement.classList.toggle("simpai-scene-director-mode-enabled", directorEnabled);
    if (typeof syncPositivePromptMetaState === "function") {
        try { syncPositivePromptMetaState(); } catch (e) {}
    }
}

function sceneDirectorWorkspaceReady() {
    return !!(
        sceneDirectorQuery("#scene_director_accordion") &&
        sceneDirectorQuery("#scene_director_editor_root") &&
        sceneDirectorCheckboxInput("#scene_director_enabled") &&
        sceneDirectorCheckboxInput("#scene_director_compose")
    );
}

function sceneDirectorInitWorkspace() {
    if (sceneDirectorWorkspaceInitializing || !sceneDirectorWorkspaceReady()) return false;
    const accordion = sceneDirectorQuery("#scene_director_accordion");
    if (accordion && accordion.dataset.sceneDirectorWorkspaceInitialized === "1") return true;
    sceneDirectorWorkspaceInitializing = true;
    try {
        sceneDirectorBindGenerateButtonLabel();
        sceneDirectorBindComposeControls();
        sceneDirectorBindDraftStorage();
        sceneDirectorRestoreDraft();
        sceneDirectorSyncComposeControls();
        sceneDirectorSetGenerateButtonLabel();
        refresh_scene_director_editor();
        if (accordion) accordion.dataset.sceneDirectorWorkspaceInitialized = "1";
        return true;
    } finally {
        sceneDirectorWorkspaceInitializing = false;
    }
}

function sceneDirectorScheduleWorkspaceInit(delay = 60) {
    if (sceneDirectorWorkspaceInitTimer) return;
    sceneDirectorWorkspaceInitTimer = setTimeout(() => {
        sceneDirectorWorkspaceInitTimer = null;
        sceneDirectorInitWorkspace();
    }, delay);
}

function refresh_scene_director_editor() {
    const editor = sceneDirectorQuery("#scene_director_editor_root");
    if (!editor) return;
    const rowField = sceneDirectorEditorField();
    const mediaField = sceneDirectorMediaStateField();
    const capabilitySignature = sceneDirectorCapabilitySignature();
    const signature = [
        sceneDirectorLanguageKey(),
        capabilitySignature,
        rowField ? rowField.value || "" : "",
        mediaField ? mediaField.value || "" : "",
        editor.dataset.sceneDirectorRendered || "",
    ].join("\n");
    if (editor.dataset.sceneDirectorRefreshing === "1") return;
    if (editor.dataset.sceneDirectorRefreshSignature === signature && editor.dataset.sceneDirectorRendered === "1") return;
    editor.dataset.sceneDirectorRefreshing = "1";
    sceneDirectorBindEditor();
    sceneDirectorBindTimelinePreviewControls();
    sceneDirectorBindMediaPreviewObserver();
    try {
        sceneDirectorRenderRules();
        sceneDirectorRenderMediaPreview();
        const capabilityChanged = editor.dataset.sceneDirectorRenderedCapabilitySignature !== capabilitySignature;
        if (editor.dataset.sceneDirectorRendered !== "1" || capabilityChanged) {
            const rows = sceneDirectorReadRows();
            sceneDirectorRenderEditor(rows);
        } else {
            sceneDirectorRefreshEditorPreviews(editor);
        }
        editor.dataset.sceneDirectorRefreshSignature = [
            sceneDirectorLanguageKey(),
            capabilitySignature,
            rowField ? rowField.value || "" : "",
            mediaField ? mediaField.value || "" : "",
            editor.dataset.sceneDirectorRendered || "",
        ].join("\n");
    } finally {
        editor.dataset.sceneDirectorRefreshing = "0";
    }
}

function refresh_scene_director_localization() {
    if (sceneDirectorLocalizationRefreshing) return;
    const accordion = sceneDirectorQuery("#scene_director_accordion");
    if (!accordion) return;
    sceneDirectorLocalizationRefreshing = true;
    try {

        const accordionLabel = accordion.querySelector("button span") ||
            accordion.querySelector("summary span") ||
            sceneDirectorLabelNode(accordion);
        sceneDirectorSetText(accordionLabel, "Director Workspace");

        sceneDirectorSetComponentLabel("#scene_director_enabled", "Director mode");
        sceneDirectorSetComponentLabel("#scene_director_compose", "Compose timeline");
        sceneDirectorSetComponentLabel("#scene_director_width", "Compose width");
        sceneDirectorSetComponentLabel("#scene_director_height", "Compose height");
        sceneDirectorSetComponentLabel("#scene_director_fps", "Compose FPS");
        sceneDirectorSetComponentLabel("#scene_director_duration", "Timeline range");
        sceneDirectorSetComponentLabel("#scene_director_audio_files", "Director audio pool");
        sceneDirectorSetComponentLabel("#scene_director_video_files", "Director video pool");
        sceneDirectorRenderRules();
        sceneDirectorRenderMediaPreview({ refreshEditor: false });
        sceneDirectorScheduleWorkspaceInit();
        const signature = sceneDirectorLanguageKey();
        if (accordion.dataset.sceneDirectorLocalizationSignature !== signature) {
            sceneDirectorTranslateTextNodes(accordion);
            sceneDirectorTranslateAttributes(accordion);
            accordion.dataset.sceneDirectorLocalizationSignature = signature;
        }
    } finally {
        sceneDirectorLocalizationRefreshing = false;
    }
}


window.sceneDirectorQuery = sceneDirectorQuery;
window.sceneDirectorDraftPayload = sceneDirectorDraftPayload;
window.sceneDirectorRestoreDraft = sceneDirectorRestoreDraft;
window.sceneDirectorSaveDraft = sceneDirectorSaveDraft;
window.sceneDirectorSetGenerateButtonLabel = sceneDirectorSetGenerateButtonLabel;
window.sceneDirectorSyncComposeControls = sceneDirectorSyncComposeControls;
window.sceneDirectorSyncPromptInputInteractivity = sceneDirectorSyncPromptInputInteractivity;
window.sceneDirectorDeactivateIfUnsupported = sceneDirectorDeactivateIfUnsupported;
window.sceneDirectorInitWorkspace = sceneDirectorInitWorkspace;
window.refresh_scene_director_editor = refresh_scene_director_editor;
window.refresh_scene_director_localization = refresh_scene_director_localization;

if (!window.__simpaiSceneDirectorComposeControlsBound) {
    window.__simpaiSceneDirectorComposeControlsBound = true;
    sceneDirectorScheduleWorkspaceInit();
    try {
        window.addEventListener("simpai:scene-director-capability-updated", async (event) => {
            sceneDirectorBindComposeControls();
            sceneDirectorBindDraftStorage();
            sceneDirectorDeactivateIfUnsupported(event && event.detail);
            sceneDirectorSyncComposeControls({ fromCapability: true });
            await sceneDirectorRestoreDraft();
            sceneDirectorDeactivateIfUnsupported();
            sceneDirectorSyncComposeControls();
            refresh_scene_director_editor();
        });
        window.addEventListener("simpai:system-params-updated", async () => {
            sceneDirectorBindDraftStorage();
            await sceneDirectorRestoreDraft();
            sceneDirectorDeactivateIfUnsupported();
            sceneDirectorSyncComposeControls();
            refresh_scene_director_editor();
        });
    } catch (e) {}
}
