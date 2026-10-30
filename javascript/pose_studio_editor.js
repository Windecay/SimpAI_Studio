(function () {
    'use strict';

    const UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const studioEndpointUrl = UTILS.studioEndpointUrl || (url => url);
    const API = window.SimpAICanvasWorkbenchApi || {};
    const escapeHtml = UTILS.escapeHtml || ((value) => String(value ?? ''));
    const t = UTILS.t || ((en, cn) => {
        const state = window.simpleaiTopbarSystemParams || {};
        return String(state.__lang || 'en').toLowerCase().startsWith('en') ? en : (window.localization?.[en] || cn || en);
    });

    let activeModal = null;
    let openSequence = 0;
    let poseViewerCorePromise = null;
    const poseViewerModules = new Map();
    let handPresetsPromise = null;
    let sceneBridgeAttached = false;
    const POSE_VIEWER_CORE_VERSION = 'simpai-pose-library-20261029-3';
    const RENDER_STYLES = { original: 'Original material', clay: 'Gray clay', lineart: 'Line art' };
    const LIBRARY_VIEWS = {
        current: { label: 'Default view' }, front: { label: 'Front view', yaw: 0, pitch: 0 },
        high: { label: 'High angle', yaw: 0, pitch: -25 }, low: { label: 'Low angle', yaw: 0, pitch: 20 },
        side: { label: 'Side view', yaw: 90, pitch: 0 }, diagonal: { label: 'Three-quarter view', yaw: 45, pitch: -10 }
    };

    function call(options, name, ...args) {
        if (typeof options?.[name] !== 'function') return null;
        return options[name](...args);
    }

    function modalContext(modal) {
        return modal?.dataset?.poseStudioContext || '';
    }

    function studioAssetUrl(value) {
        const src = String(value || '');
        return /^\/(?:file=|gradio_api\/file=)/.test(src) ? studioEndpointUrl(src) : src;
    }

    function closeActiveModal(expectedContext) {
        if (expectedContext && activeModal && modalContext(activeModal) !== expectedContext) return false;
        ++openSequence;
        if (activeModal && typeof activeModal.__poseStudioCleanup === 'function') {
            try {
                activeModal.__poseStudioCleanup();
            } catch (err) {
                console.warn('[SimpAI Pose Studio] cleanup failed:', err);
            }
        }
        if (activeModal && activeModal.parentElement) activeModal.remove();
        activeModal = null;
        return true;
    }

    function loadPoseViewerModule(name, version = POSE_VIEWER_CORE_VERSION) {
        const previous = poseViewerModules.get(name);
        if (previous?.promise) return previous.promise;
        const attempt = (previous?.attempt || 0) + 1;
        const retry = attempt > 1 ? `&retry=${attempt}` : '';
        const promise = import(studioEndpointUrl(`/pose-studio/vendor/${name}?v=${version}${retry}`))
            .catch(error => {
                if (poseViewerModules.get(name)?.promise === promise) poseViewerModules.set(name, { attempt });
                throw error;
            });
        poseViewerModules.set(name, { attempt, promise });
        return promise;
    }

    function loadPoseViewerCore() {
        if (!poseViewerCorePromise) {
            const promise = Promise.all([
                loadPoseViewerModule('vnccs_pose_studio_core.js'),
                loadPoseViewerModule('vnccs_pose_scene.js'),
                loadPoseViewerModule('simpai_pose_spatial_view.js', `${POSE_VIEWER_CORE_VERSION}-grey-20261011`),
                loadPoseViewerModule('simpai_pose_regions.js')
            ]).then(([core, scene, spatial, regions]) => ({ ...core, ...scene, ...spatial, ...regions }))
                .catch(error => {
                    if (poseViewerCorePromise === promise) poseViewerCorePromise = null;
                    throw error;
                });
            poseViewerCorePromise = promise;
        }
        return poseViewerCorePromise;
    }

    function loadHandPresets() {
        if (!handPresetsPromise) {
            handPresetsPromise = loadPoseViewerModule('vnccs_hand_presets.js')
                .then((module) => module?.HAND_PRESETS || null)
                .catch((err) => {
                    console.warn('[SimpAI Pose Studio] hand presets unavailable:', err);
                    handPresetsPromise = null;
                    return null;
                });
        }
        return handPresetsPromise;
    }

    function gradioRoot() {
        try {
            if (typeof window.gradioApp === 'function') return window.gradioApp();
        } catch (err) {
            // fall through to document
        }
        return document;
    }

    function findById(id) {
        const root = gradioRoot();
        return (root && typeof root.getElementById === 'function' ? root.getElementById(id) : null) || document.getElementById(id);
    }

    function setNativeValue(el, value) {
        if (!el) return false;
        const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement?.prototype : window.HTMLInputElement?.prototype;
        const setter = proto ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : null;
        if (setter) setter.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    function setBridgeValue(id, value) {
        const host = findById(id);
        const input = host?.querySelector?.('textarea, input') || (host?.matches?.('textarea,input') ? host : null);
        return setNativeValue(input, value);
    }

    function readBridgeValue(id) {
        const host = findById(id);
        const input = host?.querySelector?.('textarea, input') || (host?.matches?.('textarea,input') ? host : null);
        return input?.value || '';
    }

    function clickBridgeButton(id) {
        const host = findById(id);
        const button = host?.querySelector?.('button') || (host?.matches?.('button') ? host : null);
        if (!button) return false;
        button.click();
        return true;
    }

    function safeJsonParse(value, fallback = {}) {
        if (!value || typeof value !== 'string') return fallback;
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed : fallback;
        } catch (err) {
            return fallback;
        }
    }

    function cssEscape(value) {
        if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
        return String(value).replace(/["\\\]\[]/g, '\\$&');
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function canvasToDataUrl(canvas) {
        if (!canvas || typeof canvas.toDataURL !== 'function') return '';
        try {
            return canvas.toDataURL('image/png');
        } catch (err) {
            return '';
        }
    }

    function canvasHasContent(canvas) {
        if (!canvas || !canvas.width || !canvas.height) return false;
        try {
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const stepX = Math.max(1, Math.floor(canvas.width / 32));
            const stepY = Math.max(1, Math.floor(canvas.height / 32));
            for (let y = 0; y < canvas.height; y += stepY) {
                for (let x = 0; x < canvas.width; x += stepX) {
                    const pixel = ctx.getImageData(x, y, 1, 1).data;
                    if (pixel[3] > 4 && (pixel[0] < 248 || pixel[1] < 248 || pixel[2] < 248)) return true;
                }
            }
        } catch (err) {
            return false;
        }
        return false;
    }

    async function imageSrcToDataUrl(src) {
        const value = studioAssetUrl(src);
        if (!value) return '';
        if (value.startsWith('data:image/')) return value;
        try {
            const response = await fetch(value);
            const blob = await response.blob();
            if (blob?.type?.startsWith('image/')) return await blobToDataUrl(blob);
        } catch (err) {
            // Some Gradio image previews are canvas-safe but not fetchable.
        }
        try {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = reject;
                image.src = value;
            });
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth || image.width || 1;
            canvas.height = image.naturalHeight || image.height || 1;
            canvas.getContext('2d').drawImage(image, 0, 0);
            return canvas.toDataURL('image/png');
        } catch (err) {
            return '';
        }
    }

    function normalizeImageSize(width, height) {
        const w = Math.round(Number(width) || 0);
        const h = Math.round(Number(height) || 0);
        if (w < 16 || h < 16) return null;
        return { width: w, height: h };
    }

    function readImageSize(src) {
        const value = studioAssetUrl(src);
        if (!value) return Promise.resolve(null);
        return new Promise((resolve) => {
            const image = new Image();
            image.onload = () => resolve(normalizeImageSize(image.naturalWidth || image.width, image.naturalHeight || image.height));
            image.onerror = () => resolve(null);
            image.src = value;
        });
    }

    async function resolveInitialCanvasSize(options) {
        const editorState = options?.editorState || {};
        // A restored pose and camera must keep the frame used by the previous export.
        for (const params of [editorState.camera_export_params, editorState.export_params]) {
            const savedSize = normalizeImageSize(params?.view_width, params?.view_height);
            if (savedSize) return savedSize;
        }
        const stateSize = normalizeImageSize(editorState.reference_size?.width, editorState.reference_size?.height);
        if (stateSize && (hasStoredPoseForEditing(options?.poseData, editorState) || hasStoredPose(editorState.person_scene))) {
            return stateSize;
        }
        const explicit = normalizeImageSize(options?.referenceWidth, options?.referenceHeight);
        if (explicit) return explicit;
        const asset = options?.referenceAsset || {};
        const assetSize = normalizeImageSize(asset.width, asset.height);
        if (assetSize) return assetSize;
        if (stateSize) return stateSize;
        return await readImageSize(options?.referenceImageDataUrl || options?.referenceSrc || '');
    }

    function sceneBridgeConfig() {
        const state = window.simpleaiTopbarSystemParams || {};
        if (typeof resolvePoseStudioSceneConfig === 'function') return resolvePoseStudioSceneConfig(state);
        if (state.__scene_pose_studio?.pose_studio_output_slot || state.__scene_pose_studio?.pose_studio_reference_slots) {
            return state.__scene_pose_studio;
        }
        return state.scene_frontend || state.default_engine?.scene_frontend
            || state.__preset_prepared?.engine?.scene_frontend || {};
    }

    async function readSceneReference() {
        const configuredSlots = sceneBridgeConfig().pose_studio_reference_slots;
        const slots = Array.isArray(configuredSlots) && configuredSlots.length
            ? configuredSlots.filter(id => ['scene_canvas', 'scene_input_image1', 'scene_input_image2'].includes(id))
            : ['scene_input_image1', 'scene_canvas', 'scene_input_image2'];
        for (const id of slots) {
            const host = findById(id);
            if (!host) continue;
            const img = host.querySelector?.('img');
            const src = img?.currentSrc || img?.src || '';
            const imageSize = normalizeImageSize(img?.naturalWidth || img?.width, img?.naturalHeight || img?.height);
            if (src && imageSize) {
                const dataUrl = await imageSrcToDataUrl(src);
                if (dataUrl) return { src, dataUrl, sourceId: id, width: imageSize.width, height: imageSize.height };
            }
            const canvas = host.querySelector?.('canvas');
            if (canvasHasContent(canvas)) {
                const canvasData = canvasToDataUrl(canvas);
                const canvasSize = normalizeImageSize(canvas.width, canvas.height);
                if (canvasData) return { src: canvasData, dataUrl: canvasData, sourceId: id, width: canvasSize?.width || 0, height: canvasSize?.height || 0 };
            }
        }
        return { src: '', dataUrl: '', sourceId: '', width: 0, height: 0 };
    }

    function updateSceneBridgePreview(response, message) {
        const host = findById('pose_studio_scene_control');
        const status = host?.querySelector?.('[data-pose-studio-scene-status]');
        const thumb = host?.querySelector?.('[data-pose-studio-scene-thumb]');
        const image = response?.pose_image || response?.asset_ref || {};
        const src = studioAssetUrl(image.preview_url || image.data_url || '');
        if (status) status.textContent = message || t('Pose image ready', '姿势图已就绪');
        if (thumb) {
            if (src) {
                thumb.src = src;
                thumb.hidden = false;
            } else {
                thumb.removeAttribute('src');
                thumb.hidden = true;
            }
        }
    }

    function clearScenePresetBridge() {
        closeActiveModal('scene_preset');
        setBridgeValue('pose_studio_scene_payload', '');
        setBridgeValue('pose_studio_scene_state', '');
        updateSceneBridgePreview(null, t('Scene pose image', 'Scene pose image'));
    }

    function sceneOutputSlot() {
        const configured = sceneBridgeConfig().pose_studio_output_slot;
        return ['scene_canvas_image', 'scene_input_image1', 'scene_input_image2'].includes(configured)
            ? configured : 'scene_input_image1';
    }

    function sceneImageNumber(slot) {
        return slot === 'scene_canvas' ? 1 : ['scene_canvas_image', 'scene_input_image1', 'scene_input_image2'].indexOf(slot) + 1;
    }

    function refreshSceneBridgeFlow() {
        const flow = findById('pose_studio_scene_control')?.querySelector?.('[data-pose-studio-scene-flow]');
        if (!flow) return;
        const slots = sceneBridgeConfig().pose_studio_reference_slots;
        const source = Array.isArray(slots) && slots.length === 1 ? sceneImageNumber(slots[0]) : 0;
        const target = sceneImageNumber(sceneOutputSlot());
        flow.textContent = source
            ? t(`Image ${source} original → Pose Studio → Image ${target} pose`, `图${source}人物原图 → Pose Studio → 图${target}姿势图`)
            : t(`Pose Studio → Image ${target} pose`, `Pose Studio → 图${target}姿势图`);
    }

    async function syncSceneCanvasFromBridge() {
        const state = safeJsonParse(readBridgeValue('pose_studio_scene_state'));
        if (!state.ok || state.slot !== 'scene_canvas_image') return false;
        const root = findById('scene_canvas');
        const field = root?.querySelector?.('textarea, input[type="text"], input:not([type])');
        const value = safeJsonParse(field?.value);
        if (!value.image) return false;
        const api = root ? (window.SimpAISketch?.get?.(root) || root.__simpaiSketch) : null;
        if (api?.setValue) return !!(await api.setValue(value, { change: false }));
        if (root && typeof window.SimpAISketch?.setValue === 'function') {
            return !!(await window.SimpAISketch.setValue(root, value, { change: false }));
        }
        return false;
    }

    async function refreshSceneBridge() {
        const state = safeJsonParse(readBridgeValue('pose_studio_scene_state'));
        if (!state.ok) {
            if (state.error) updateSceneBridgePreview(null, t('Pose export was not applied.', '姿势图未写入，请重新打开编辑器后再确认。'));
            return;
        }
        await syncSceneCanvasFromBridge();
        const number = sceneImageNumber(state.slot);
        updateSceneBridgePreview(state, t(`Pose image sent to Image ${number}`, `姿势图已发送到图${number}`));
        if (typeof refresh_scene_localization === 'function') refresh_scene_localization();
        const source = state.slot === 'scene_canvas_image' ? 'scene_canvas' : state.slot;
        if (typeof refreshResolutionControlSource === 'function') refreshResolutionControlSource(source, 'pose_studio');
        else if (typeof syncResolutionControlWidgets === 'function') syncResolutionControlWidgets();
    }

    async function openScenePresetBridge() {
        closeActiveModal();
        const openingSequence = openSequence;
        refreshSceneBridgeFlow();
        const state = safeJsonParse(readBridgeValue('pose_studio_scene_state'), {});
        const reference = await readSceneReference();
        if (openingSequence !== openSequence) return null;
        const outputSlot = sceneOutputSlot();
        const poseData = state.pose_data || {};
        const editorState = state.editor_state || {};
        return open({
            title: 'Pose Studio',
            context: 'scene_preset',
            projectId: 'scene-preset',
            nodeId: 'scene_preset_pose_studio',
            referenceSrc: reference.src || reference.dataUrl || '',
            referenceImageDataUrl: reference.dataUrl || '',
            referenceWidth: reference.width || 0,
            referenceHeight: reference.height || 0,
            poseData,
            editorState,
            detectTheme: detectPageTheme,
            onConfirm(response) {
                const payload = JSON.stringify(Object.assign({}, response || {}, {
                    scene_reference_source: reference.sourceId || '',
                    scene_bridge_target: outputSlot
                }));
                setBridgeValue('pose_studio_scene_target', outputSlot);
                setBridgeValue('pose_studio_scene_payload', payload);
                clickBridgeButton('pose_studio_scene_apply_btn');
                const number = sceneImageNumber(outputSlot);
                const message = t(`Sending pose image to Image ${number}...`, `正在将姿势图发送到图${number}…`);
                updateSceneBridgePreview(response, message);
            }
        });
    }

    function attachScenePresetBridge() {
        if (sceneBridgeAttached) return;
        sceneBridgeAttached = true;
        refreshSceneBridgeFlow();
        window.addEventListener('simpai:system-params-updated', refreshSceneBridgeFlow);
        document.addEventListener('click', (evt) => {
            const trigger = evt.target.closest?.('[data-pose-studio-scene-open]');
            if (!trigger || !trigger.closest?.('#pose_studio_scene_control')) return;
            evt.preventDefault();
            openScenePresetBridge();
        }, true);
        document.addEventListener('dblclick', (evt) => {
            const trigger = evt.target.closest?.('#pose_studio_scene_control');
            if (!trigger) return;
            evt.preventDefault();
            openScenePresetBridge();
        }, true);
        document.addEventListener('change', (evt) => {
            if (evt.target.closest?.('#scene_theme')) clearScenePresetBridge();
        }, true);
    }

    function detectPageTheme() {
        const className = [
            document.documentElement?.className || '',
            document.body?.className || ''
        ].join(' ').toLowerCase();
        if (className.includes('light')) return 'light';
        if (className.includes('dark') || document.documentElement?.getAttribute('data-theme') === 'dark') return 'dark';
        try {
            return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
        } catch (err) {
            return 'dark';
        }
    }

    function poseStudioResourceStatusText(response) {
        if (!response) return t('Pose Studio status unavailable.', 'Pose Studio 状态不可用。');
        const parts = [response.available ? t('Pose Studio resources are ready.', 'Pose Studio 资源已就绪。') : t('Pose Studio resources are incomplete.', 'Pose Studio 资源不完整。')];
        const sam3d = response.sam3d || {};
        if (sam3d.dependency_error) {
            parts.push(t('SAM3D runtime dependencies are missing or incompatible.', 'SAM3D 运行依赖缺失或不兼容。'));
        } else if (sam3d.person_detector_ready === false) {
            parts.push(t('Person detector is missing. Install it through model management, then retry.', '缺少人物检测模型，请通过模型管理安装后重试。'));
        } else if (sam3d.ready) {
            parts.push(t('SAM3D pose parser models are ready.', 'SAM3D 姿势解析模型已就绪。'));
        } else {
            parts.push(t('SAM3D models are missing. Install them through model management, then retry.', '缺少 SAM3D 模型，请通过模型管理安装后重试。'));
        }
        return parts.filter(Boolean).join(' ');
    }

    function defaultMeshParams() {
        return {
            age: 25,
            gender: 0.5,
            weight: 0.5,
            muscle: 0.5,
            height: 0.5,
            breast_size: 0.5,
            firmness: 0.5,
            penis_len: 0.5,
            penis_circ: 0.5,
            penis_test: 0.5,
            head_size: 1.0,
            arm_size: 1.0,
            hand_size: 1.0,
            upper_arm_l_length: 0.5,
            upper_arm_r_length: 0.5,
            forearm_l_length: 0.5,
            forearm_r_length: 0.5,
            thigh_l_length: 0.5,
            thigh_r_length: 0.5,
            shin_l_length: 0.5,
            shin_r_length: 0.5,
            spine_length: 0.5
        };
    }

    function defaultExportParams() {
        return {
            view_width: 1024,
            view_height: 1024,
            cam_zoom: 1.0,
            cam_distance: 1.0,
            cam_offset_x: 0,
            cam_offset_y: 0,
            cam_yaw_deg: 0,
            cam_pitch_deg: 0,
            bg_color: [255, 255, 255],
            samApplyCamera: true
        };
    }

    const CONTROL_SLIDERS = Object.freeze([
        { group: 'body', key: 'age', label: t('Age', '年龄'), min: 1, max: 90, step: 1, def: 25 },
        { group: 'body', key: 'weight', label: t('Weight', '体重'), min: 0, max: 1, step: 0.01, def: 0.5 },
        { group: 'body', key: 'muscle', label: t('Muscle', '肌肉'), min: 0, max: 1, step: 0.01, def: 0.5 },
        { group: 'body', key: 'height', label: t('Height', '身高'), min: 0, max: 2, step: 0.01, def: 0.5 },
        { group: 'body', key: 'breast_size', label: t('Breast Size', '胸部大小'), min: 0, max: 2, step: 0.01, def: 0.5, gender: 'female' },
        { group: 'body', key: 'firmness', label: t('Firmness', '紧实度'), min: 0, max: 1, step: 0.01, def: 0.5, gender: 'female' },
        { group: 'proportion', key: 'head_size', label: t('Head Size', '头部大小'), min: 0.5, max: 2, step: 0.01, def: 1.0 },
        { group: 'proportion', key: 'arm_size', label: t('Arm Size', '手臂大小'), min: 0.5, max: 2, step: 0.01, def: 1.0 },
        { group: 'proportion', key: 'hand_size', label: t('Hand Size', '手部大小'), min: 0.5, max: 2, step: 0.01, def: 1.0 },
        { group: 'proportion', key: 'spine_length', label: t('Spine Length', '脊柱长度'), min: 0, max: 1, step: 0.01, def: 0.5 },
        { group: 'rotation', key: 'rot_x', axis: 'x', label: 'X', min: -180, max: 180, step: 1, def: 0, suffix: 'deg' },
        { group: 'rotation', key: 'rot_y', axis: 'y', label: 'Y', min: -180, max: 180, step: 1, def: 0, suffix: 'deg' },
        { group: 'rotation', key: 'rot_z', axis: 'z', label: 'Z', min: -180, max: 180, step: 1, def: 0, suffix: 'deg' },
        { group: 'camera', key: 'cam_zoom', label: t('View zoom', '视角缩放'), min: 0.1, max: 7, step: 0.01, def: 1.0 },
        { group: 'camera', key: 'cam_distance', label: t('Camera distance', '相机远近'), min: 0.1, max: 5, step: 0.01, def: 1.0 },
        { group: 'camera', key: 'cam_offset_x', label: t('Pan X', '平移 X'), min: -20, max: 20, step: 0.1, def: 0 },
        { group: 'camera', key: 'cam_offset_y', label: t('Pan Y', '平移 Y'), min: -20, max: 20, step: 0.1, def: 0 },
        { group: 'camera', key: 'cam_yaw_deg', label: t('Yaw', '水平旋转'), min: -180, max: 180, step: 1, def: 0, suffix: 'deg' },
        { group: 'camera', key: 'cam_pitch_deg', label: t('Pitch', '俯仰'), min: -89, max: 89, step: 1, def: 0, suffix: 'deg' }
    ]);
    const FINGER_PREFIXES = Object.freeze(['thumb', 'index', 'middle', 'ring', 'pinky']);
    const HAND_SLIDERS = Object.freeze([
        { key: 'spread', label: t('Spread', '张开'), min: 0, max: 1, step: 0.01, def: 0 },
        { key: 'grasp', label: t('Grasp', '握拳'), min: 0, max: 1, step: 0.01, def: 0 },
        { key: 'thumb', label: t('Thumb', '拇指'), min: 0, max: 1, step: 0.01, def: 0 },
        { key: 'index', label: t('Index', '食指'), min: 0, max: 1, step: 0.01, def: 0 },
        { key: 'middle', label: t('Middle', '中指'), min: 0, max: 1, step: 0.01, def: 0 },
        { key: 'ring', label: t('Ring', '无名指'), min: 0, max: 1, step: 0.01, def: 0 },
        { key: 'pinky', label: t('Pinky', '小指'), min: 0, max: 1, step: 0.01, def: 0 }
    ]);
    const HAND_DEFAULT_SLIDER_VALUES = Object.freeze({
        spread: 0,
        grasp: 0,
        thumb: 0,
        index: 0,
        middle: 0,
        ring: 0,
        pinky: 0
    });
    const TOE_SLIDERS = Object.freeze([
        { key: 'splay', label: t('Side Tilt', '侧向摆'), min: -1, max: 1, step: 0.01, def: 0 },
        { key: 'lift', label: t('Lift', '上下摆'), min: -1, max: 1, step: 0.01, def: 0 }
    ]);
    const TOE_DEFAULT_SLIDER_VALUES = Object.freeze({
        splay: 0,
        lift: 0
    });
    const TOE_ROTATION_LIMITS = Object.freeze({
        splay: 18,
        lift: 35
    });
    const SAM3D_MAX_SAFE_AUTO_FRAME_ZOOM = 4.2;

    function sliderValueText(value, def) {
        const num = Number(value);
        if (!Number.isFinite(num)) return '';
        if (def?.suffix === 'deg') return `${Math.round(num)}°`;
        if (Number(def?.step) >= 1) return String(Math.round(num));
        return num.toFixed(2);
    }

    function sliderControlHtml(def, value) {
        const current = Number.isFinite(Number(value)) ? Number(value) : Number(def.def || 0);
        return `
<label class="sai-pose-studio-control-field" data-pose-studio-field="${escapeHtml(def.key)}" data-pose-studio-group="${escapeHtml(def.group || '')}" ${def.gender ? `data-pose-studio-gender="${escapeHtml(def.gender)}"` : ''}>
  <span><b>${escapeHtml(def.label || def.key)}</b><em data-pose-studio-value="${escapeHtml(def.key)}">${escapeHtml(sliderValueText(current, def))}</em></span>
  <input type="range" data-pose-studio-slider="${escapeHtml(def.key)}" min="${escapeHtml(def.min)}" max="${escapeHtml(def.max)}" step="${escapeHtml(def.step)}" value="${escapeHtml(current)}">
</label>`;
    }

    function handSliderControlHtml(def, value) {
        const current = Number.isFinite(Number(value)) ? Number(value) : Number(def.def || 0);
        return `
<label class="sai-pose-studio-control-field" data-pose-studio-hand-field="${escapeHtml(def.key)}">
  <span><b>${escapeHtml(def.label || def.key)}</b><em data-pose-studio-hand-value="${escapeHtml(def.key)}">${escapeHtml(sliderValueText(current, def))}</em></span>
  <input type="range" data-pose-studio-hand-slider="${escapeHtml(def.key)}" min="${escapeHtml(def.min)}" max="${escapeHtml(def.max)}" step="${escapeHtml(def.step)}" value="${escapeHtml(current)}">
</label>`;
    }

    function toeSliderControlHtml(def, value) {
        const current = Number.isFinite(Number(value)) ? Number(value) : Number(def.def || 0);
        return `
<label class="sai-pose-studio-control-field" data-pose-studio-toe-field="${escapeHtml(def.key)}">
  <span><b>${escapeHtml(def.label || def.key)}</b><em data-pose-studio-toe-value="${escapeHtml(def.key)}">${escapeHtml(sliderValueText(current, def))}</em></span>
  <input type="range" data-pose-studio-toe-slider="${escapeHtml(def.key)}" min="${escapeHtml(def.min)}" max="${escapeHtml(def.max)}" step="${escapeHtml(def.step)}" value="${escapeHtml(current)}">
</label>`;
    }

    function applySAM3DFrameFitToViewer(args) {
        const viewer = args?.viewer || null;
        const rawPose = args?.rawPose || null;
        const meshData = args?.meshData || null;
        const exportParams = args?.exportParams || {};
        if (!viewer || typeof viewer.computeSAM3DFrameCameraParams !== 'function') return { applied: false, mode: '' };
        if (!rawPose || typeof rawPose !== 'object') return { applied: false, mode: '' };

        const width = Number(exportParams.view_width) || 1024;
        const height = Number(exportParams.view_height) || 1024;
        const useSamProjection = !!exportParams.samApplyCamera;
        const frameParams = viewer.computeSAM3DFrameCameraParams(rawPose, width, height, meshData, !useSamProjection);
        if (!frameParams) {
            if (typeof viewer.setSAMProjectionCameraFrame === 'function') viewer.setSAMProjectionCameraFrame(null);
            call(args, 'persistCameraParams', { sam3d_frame_fit: { applied: false } });
            return { applied: false, mode: '' };
        }

        if (useSamProjection) {
            if (typeof viewer.setSAMProjectionCameraFrame === 'function') {
                viewer.setSAMProjectionCameraFrame(frameParams.sam_projection || null);
            }
            exportParams.cam_zoom = frameParams.zoom || 1.0;
            exportParams.cam_distance = 1.0;
            exportParams.cam_offset_x = frameParams.offset_x || 0;
            exportParams.cam_offset_y = frameParams.offset_y || 0;
            exportParams.cam_yaw_deg = frameParams.yaw_deg || 0;
            exportParams.cam_pitch_deg = frameParams.pitch_deg || 0;
            call(args, 'applyCameraToViewer', true);
            call(args, 'persistCameraParams', {
                sam3d_frame_fit: {
                    applied: true,
                    mode: frameParams.sam_projection ? 'sam_projection' : 'bbox',
                    has_projection: !!frameParams.sam_projection
                }
            });
            return {
                applied: true,
                mode: frameParams.sam_projection ? 'sam_projection' : 'bbox',
                frameParams
            };
        }

        if (typeof viewer.setSAMProjectionCameraFrame === 'function') viewer.setSAMProjectionCameraFrame(null);
        const fallbackParams = viewer.computeSAM3DFrameCameraParams(rawPose, width, height, meshData, true) || frameParams;
        const fallbackZoom = Number(fallbackParams.zoom) || 1.0;
        if (fallbackZoom > SAM3D_MAX_SAFE_AUTO_FRAME_ZOOM) {
            call(args, 'persistCameraParams', {
                sam3d_frame_fit: {
                    applied: false,
                    skipped: true,
                    reason: 'unsafe_high_zoom',
                    zoom: fallbackZoom
                }
            });
            return {
                applied: false,
                skipped: true,
                reason: 'unsafe_high_zoom',
                mode: 'skipped_unsafe_high_zoom',
                frameParams: fallbackParams
            };
        }
        exportParams.cam_zoom = fallbackZoom;
        exportParams.cam_distance = 1.0;
        exportParams.cam_offset_x = fallbackParams.offset_x || 0;
        exportParams.cam_offset_y = fallbackParams.offset_y || 0;
        exportParams.cam_yaw_deg = 0;
        exportParams.cam_pitch_deg = 0;
        const yaw = Number(fallbackParams.yaw_deg) || 0;
        const pitch = Number(fallbackParams.pitch_deg) || 0;
        call(args, 'applyCameraToViewer', true);
        call(args, 'persistCameraParams', {
            sam3d_frame_fit: {
                applied: true,
                mode: 'bbox_overlay_locked',
                yaw_deg: yaw,
                pitch_deg: pitch,
                bbox_inverse_model_rotation: {
                    applied: false,
                    yaw_deg: yaw,
                    pitch_deg: pitch
                }
            }
        });
        return {
            applied: true,
            mode: 'bbox_overlay_locked',
            frameParams: fallbackParams,
            ignored_yaw_deg: yaw,
            ignored_pitch_deg: pitch
        };
    }

    function runSAM3DFrameFitSmoke() {
        const rawPose = { image_size: { width: 1024, height: 1024 }, bbox: [220, 90, 810, 980] };
        const meshData = { render_frame: { image_size: { width: 1024, height: 1024 } } };
        const projectionParams = {
            zoom: 1,
            offset_x: 0,
            offset_y: 0,
            yaw_deg: 0,
            pitch_deg: 0,
            sam_projection: { fov: 37, cameraPosition: { x: 3, y: 4, z: 45 } }
        };
        const fallbackParams = {
            zoom: 2.4,
            offset_x: 1.25,
            offset_y: -3.5,
            yaw_deg: 12,
            pitch_deg: -5
        };

        const runCase = (samApplyCamera) => {
            const calls = [];
            const persisted = [];
            const appliedCamera = [];
            let rotation = [1, 2, 3];
            let projectionFrame = undefined;
            let poseUpdates = 0;
            const exportParams = Object.assign(defaultExportParams(), { samApplyCamera });
            const viewer = {
                computeSAM3DFrameCameraParams(_pose, width, height, _mesh, forceFallback = false) {
                    calls.push({ width, height, forceFallback: !!forceFallback });
                    return forceFallback ? fallbackParams : projectionParams;
                },
                setSAMProjectionCameraFrame(frame) {
                    projectionFrame = frame || null;
                },
                getPose() {
                    return { modelRotation: rotation.slice(), smoke: true };
                },
                setModelRotation(x, y, z) {
                    rotation = [x, y, z];
                }
            };
            const result = applySAM3DFrameFitToViewer({
                viewer,
                rawPose,
                meshData,
                exportParams,
                applyCameraToViewer(snap) {
                    appliedCamera.push({ snap: !!snap, zoom: exportParams.cam_zoom, yaw: exportParams.cam_yaw_deg, pitch: exportParams.cam_pitch_deg });
                    return true;
                },
                persistCameraParams(extra) {
                    persisted.push({ extra, camera: {
                        zoom: exportParams.cam_zoom,
                        offset_x: exportParams.cam_offset_x,
                        offset_y: exportParams.cam_offset_y,
                        yaw_deg: exportParams.cam_yaw_deg,
                        pitch_deg: exportParams.cam_pitch_deg
                    } });
                },
                onPoseUpdated() {
                    poseUpdates += 1;
                }
            });
            return { result, calls, persisted, appliedCamera, rotation, projectionFrame, poseUpdates, exportParams };
        };

        const bboxCase = runCase(false);
        const projectionCase = runCase(true);
        const bboxOk = bboxCase.result.applied
            && bboxCase.result.mode === 'bbox_overlay_locked'
            && bboxCase.calls.length === 2
            && bboxCase.calls[0].forceFallback === true
            && bboxCase.calls[1].forceFallback === true
            && bboxCase.projectionFrame === null
            && bboxCase.exportParams.cam_yaw_deg === 0
            && bboxCase.exportParams.cam_pitch_deg === 0
            && bboxCase.rotation[0] === 1
            && bboxCase.rotation[1] === 2
            && bboxCase.rotation[2] === 3
            && bboxCase.poseUpdates === 0;
        const projectionOk = projectionCase.result.applied
            && projectionCase.result.mode === 'sam_projection'
            && projectionCase.calls.length === 1
            && projectionCase.calls[0].forceFallback === false
            && projectionCase.projectionFrame === projectionParams.sam_projection
            && projectionCase.exportParams.cam_zoom === projectionParams.zoom
            && projectionCase.exportParams.cam_yaw_deg === projectionParams.yaw_deg
            && projectionCase.poseUpdates === 0;
        const unsafeCase = (() => {
            const exportParams = Object.assign(defaultExportParams(), { samApplyCamera: false });
            const viewer = {
                computeSAM3DFrameCameraParams() {
                    return { zoom: SAM3D_MAX_SAFE_AUTO_FRAME_ZOOM + 1, offset_x: 0, offset_y: 0, yaw_deg: 0, pitch_deg: 0 };
                },
                setSAMProjectionCameraFrame() {},
                getPose() {
                    return { modelRotation: [0, 0, 0] };
                },
                setModelRotation() {}
            };
            return applySAM3DFrameFitToViewer({ viewer, rawPose, meshData, exportParams });
        })();
        const unsafeOk = unsafeCase.skipped === true && unsafeCase.reason === 'unsafe_high_zoom';
        return {
            ok: bboxOk && projectionOk && unsafeOk,
            bbox: {
                mode: bboxCase.result.mode,
                calls: bboxCase.calls,
                camera: bboxCase.persisted.at(-1)?.camera || null,
                rotation: bboxCase.rotation,
                pose_updates: bboxCase.poseUpdates
            },
            projection: {
                mode: projectionCase.result.mode,
                calls: projectionCase.calls,
                camera: projectionCase.persisted.at(-1)?.camera || null,
                has_projection_frame: !!projectionCase.projectionFrame
            },
            unsafe: {
                skipped: !!unsafeCase.skipped,
                reason: unsafeCase.reason || ''
            }
        };
    }

    function drawPoseSkeleton(ctx, width, height) {
        const cx = width / 2;
        const headY = height * 0.18;
        const shoulderY = height * 0.34;
        const hipY = height * 0.58;
        const kneeY = height * 0.76;
        const footY = height * 0.9;
        ctx.strokeStyle = '#f97316';
        ctx.fillStyle = '#f8fafc';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const lines = [
            [cx, headY + 44, cx, hipY],
            [cx - 72, shoulderY, cx + 72, shoulderY],
            [cx - 72, shoulderY, cx - 112, height * 0.48],
            [cx + 72, shoulderY, cx + 118, height * 0.46],
            [cx, hipY, cx - 58, kneeY],
            [cx - 58, kneeY, cx - 92, footY],
            [cx, hipY, cx + 62, kneeY],
            [cx + 62, kneeY, cx + 98, footY],
        ];
        lines.forEach(([x1, y1, x2, y2]) => {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        });
        ctx.beginPath();
        ctx.arc(cx, headY, 34, 0, Math.PI * 2);
        ctx.stroke();
        [
            [cx, headY], [cx, headY + 44], [cx - 72, shoulderY], [cx + 72, shoulderY],
            [cx - 112, height * 0.48], [cx + 118, height * 0.46], [cx, hipY],
            [cx - 58, kneeY], [cx + 62, kneeY], [cx - 92, footY], [cx + 98, footY],
        ].forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function drawFallbackPose(ctx, width, height) {
        ctx.clearRect(0, 0, width, height);
        const cx = width / 2;
        const headY = height * 0.18;
        const shoulderY = height * 0.34;
        const hipY = height * 0.58;
        const kneeY = height * 0.76;
        const footY = height * 0.9;
        ctx.fillStyle = '#10131d';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        for (let x = 0; x < width; x += 32) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 0; y < height; y += 32) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        ctx.strokeStyle = '#f97316';
        ctx.fillStyle = '#f8fafc';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const lines = [
            [cx, headY + 44, cx, hipY],
            [cx - 72, shoulderY, cx + 72, shoulderY],
            [cx - 72, shoulderY, cx - 112, height * 0.48],
            [cx + 72, shoulderY, cx + 118, height * 0.46],
            [cx, hipY, cx - 58, kneeY],
            [cx - 58, kneeY, cx - 92, footY],
            [cx, hipY, cx + 62, kneeY],
            [cx + 62, kneeY, cx + 98, footY],
        ];
        lines.forEach(([x1, y1, x2, y2]) => {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        });
        ctx.beginPath();
        ctx.arc(cx, headY, 34, 0, Math.PI * 2);
        ctx.stroke();
        [
            [cx, headY], [cx, headY + 44], [cx - 72, shoulderY], [cx + 72, shoulderY],
            [cx - 112, height * 0.48], [cx + 118, height * 0.46], [cx, hipY],
            [cx - 58, kneeY], [cx + 62, kneeY], [cx - 92, footY], [cx + 98, footY],
        ].forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function drawReference(ctx, canvas, src) {
        return new Promise((resolve) => {
            if (!src) {
                drawFallbackPose(ctx, canvas.width, canvas.height);
                resolve(false);
                return;
            }
            const img = new Image();
            img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#10131d';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
                const w = img.width * scale;
                const h = img.height * scale;
                const x = (canvas.width - w) / 2;
                const y = (canvas.height - h) / 2;
                ctx.globalAlpha = 0.45;
                ctx.drawImage(img, x, y, w, h);
                ctx.globalAlpha = 1;
                drawPoseSkeleton(ctx, canvas.width, canvas.height);
                resolve(true);
            };
            img.onerror = () => {
                drawFallbackPose(ctx, canvas.width, canvas.height);
                resolve(false);
            };
            img.src = studioAssetUrl(src);
        });
    }

    function renderLibraryItems(items) {
        const rows = Array.isArray(items) ? items : [];
        if (!rows.length) {
            return `<div class="sai-pose-studio-empty">${escapeHtml(t('No poses found.', '没有姿势。'))}</div>`;
        }
        return rows.map((item) => `
<div class="sai-pose-studio-pose" role="button" tabindex="0" data-pose-id="${escapeHtml(item.id || item.relative_path || '')}" title="${escapeHtml(item.source === 'built_in' ? t(item.name || '') : item.name || '')}">
  <span data-pose-library-preview>${item.preview_url && item.source !== 'built_in' ? `<img src="${escapeHtml(studioAssetUrl(item.preview_url))}" alt="" loading="lazy">` : '<i class="fa-solid fa-person-walking"></i>'}</span>
  <b>${escapeHtml(item.source === 'built_in' ? t(item.name || '') : item.name || '')}</b>
  <small>${escapeHtml(t(item.category_label || item.category || 'Other poses'))}</small>
  ${item.can_delete ? `<em class="sai-pose-studio-pose-actions">
    <button type="button" data-pose-library-action="rename" title="${escapeHtml(t('Rename', '重命名'))}"><i class="fa-solid fa-pen"></i></button>
    <button type="button" data-pose-library-action="delete" title="${escapeHtml(t('Delete', '删除'))}"><i class="fa-solid fa-trash"></i></button>
  </em>` : ''}
</div>`).join('');
    }

    function createImportTaskId(nodeId) {
        const base = String(nodeId || 'pose').replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 48) || 'pose';
        return `${base}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
    }

    function poseDataSummary(data) {
        if (!data || typeof data !== 'object') return '';
        const coords = Array.isArray(data.joint_coords) ? data.joint_coords.length : 0;
        const rotations = Array.isArray(data.joint_rotations) ? data.joint_rotations.length : 0;
        const keypoints = Array.isArray(data.canonical_keypoints_3d) ? data.canonical_keypoints_3d.length : 0;
        const parts = [];
        if (coords) parts.push(`${coords} joints`);
        if (rotations) parts.push(`${rotations} rotations`);
        if (keypoints) parts.push(`${keypoints} keypoints`);
        return parts.join(' / ');
    }

    function hasStoredPose(data) {
        if (!data || typeof data !== 'object') return false;
        const pose = Array.isArray(data.poses) ? (data.poses[0] || {}) : data;
        if (!pose || typeof pose !== 'object') return false;
        return Object.keys(pose).some((key) => {
            const value = pose[key];
            if (value == null) return false;
            if (Array.isArray(value)) return value.length > 0;
            if (typeof value === 'object') return Object.keys(value).length > 0;
            return value !== '';
        });
    }

    function personLimitStatusText(response) {
        const detected = Number(response?.detected_people);
        const parsed = Number(response?.parsed_people);
        if (response?.selection_method === 'manual' && Number.isInteger(parsed) && parsed > 0) {
            return t(`Parsed ${parsed} manually selected ${parsed === 1 ? 'person' : 'people'}.`, `已按框选区域解析 ${parsed} 人。`);
        }
        if (!Number.isInteger(detected) || !Number.isInteger(parsed) || parsed < 1 || detected <= parsed) return '';
        if (response?.selection_method === 'subject') {
            return t(`Detected ${detected} people. Parsed ${parsed} by subject priority (size and centrality).`,
                `检测到 ${detected} 人，已按主角优先（人物大小与居中程度）解析 ${parsed} 人。`);
        }
        return t(`Detected ${detected} people. Parsed the first ${parsed} from left to right.`,
            `检测到 ${detected} 人，已按从左到右的顺序解析前 ${parsed} 人。`);
    }

    function hasStoredPoseForEditing(poseData, editorState) {
        return hasStoredPose(poseData)
            || hasStoredPose(editorState?.viewer_pose)
            || hasStoredPose(editorState?.sam3d_pose_data);
    }

    function storedPoseForEditing(poseData, editorState) {
        const candidates = [
            { source: 'viewer_pose', pose: editorState?.viewer_pose },
            { source: 'pose_data', pose: poseData },
            { source: 'sam3d_pose_data', pose: editorState?.sam3d_pose_data }
        ];
        return candidates.find(item => hasStoredPose(item.pose)) || { source: '', pose: {} };
    }

    async function open(options) {
        closeActiveModal();
        const openingSequence = openSequence;
        options = options || {};
        const canvasSize = await resolveInitialCanvasSize(options);
        if (openingSequence !== openSequence) return null;
        const theme = call(options, 'detectTheme') || detectPageTheme();
        const modal = document.createElement('div');
        let closed = false;
        let exportRequestId = 0;
        const isCurrent = () => !closed && openingSequence === openSequence && activeModal === modal && modal.isConnected;
        modal.className = 'sai-canvas-modal sai-pose-studio-modal';
        modal.dataset.poseStudioContext = options.context || (options.projectId === 'scene-preset' ? 'scene_preset' : 'canvas');
        modal.classList.toggle('theme-dark', theme !== 'light');
        modal.innerHTML = `
<div class="sai-canvas-modal-panel sai-pose-studio-panel">
  <div class="sai-canvas-modal-head">
    <span><i class="fa-solid fa-person-walking"></i> ${escapeHtml(options.title || 'Pose Studio')}</span>
    <div class="sai-pose-studio-head-actions">
      <button type="button" class="primary sai-pose-studio-confirm" data-pose-studio-action="export" title="${escapeHtml(t('Export pose image', '导出姿势图'))}"><i class="fa-solid fa-check"></i><span>${escapeHtml(t('Confirm', '确认'))}</span></button>
      <button type="button" data-pose-studio-action="help" title="${escapeHtml(t('Shortcuts', '快捷键'))}"><i class="fa-solid fa-question"></i></button>
      <button type="button" data-pose-studio-close title="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
    </div>
  </div>
  <div class="sai-pose-studio-help" data-pose-studio-help hidden>
    <b>${escapeHtml(t('Shortcuts', '快捷键'))}</b>
    <dl>
      <dt>${escapeHtml(t('Wheel over viewport', '视口滚轮'))}</dt>
      <dd>${escapeHtml(t('Zoom the export viewport; hold Shift for fine zoom.', '缩放导出视口；按住 Shift 可细调。'))}</dd>
      <dt>${escapeHtml(t('Right drag / Alt + left drag', '右键拖动 / Alt＋左键拖动'))}</dt>
      <dd>${escapeHtml(t('Orbit the export camera horizontally and vertically; Shift makes smaller adjustments.', '调整导出相机的水平角和俯仰；Shift 可精调。'))}</dd>
      <dt>${escapeHtml(t('Alt + wheel', 'Alt＋滚轮'))}</dt>
      <dd>${escapeHtml(t('Move the export camera closer or farther; Shift makes smaller adjustments.', '移动导出相机的远近；Shift 可精调。'))}</dd>
      <dt>${escapeHtml(t('Middle drag viewport', '中键拖拽视口'))}</dt>
      <dd>${escapeHtml(t('Pan the export viewport without selecting a joint first.', '无需先选中关节，直接平移导出视口。'))}</dd>
      <dt>${escapeHtml(t('Drag joint marker', '拖拽关节点'))}</dt>
      <dd>${escapeHtml(t('Move the pose joint or IK target.', '移动姿势关节或 IK 目标。'))}</dd>
      <dt>${escapeHtml(t('Ctrl + middle drag', 'Ctrl + 中键拖拽'))}</dt>
      <dd>${escapeHtml(t('Rotate the observe-only viewer; it does not change the exported camera.', '旋转仅观察视角；不改变导出相机。'))}</dd>
      <dt>${escapeHtml(t('Arrow keys / PageUp / PageDown / R', '方向键 / PageUp / PageDown / R'))}</dt>
      <dd>${escapeHtml(t('Focus the viewport or camera diagram: arrows orbit, PageUp moves closer, PageDown moves farther, R resets the camera. Shift makes smaller adjustments.', '点击主画面或相机小窗后：方向键旋转，PageUp 靠近，PageDown 远离，R 重置相机；Shift 可精调。'))}</dd>
      <dt>${escapeHtml(t('Drag in the camera diagram', '拖动相机小窗'))}</dt>
      <dd>${escapeHtml(t('Top view changes yaw and distance; side view changes pitch and distance. Wheel changes distance; Fit reframes only the diagram.', '俯视调整水平角与远近，侧视调整俯仰与远近；滚轮调整远近。“适应”仅调整小窗显示范围。'))}</dd>
    </dl>
  </div>
  <div class="sai-pose-studio-toolbar">
    <label class="sai-pose-studio-tool-group" data-pose-studio-people hidden>
      <span>${escapeHtml(t('Person', '人物'))}</span>
      <select data-pose-studio-person aria-label="${escapeHtml(t('Select person to edit', '选择要编辑的人物'))}"></select>
    </label>
    <div class="sai-pose-studio-tool-group">
      <span>${escapeHtml(t('Reference', '参考'))}</span>
      <button type="button" data-pose-studio-action="reference" title="${escapeHtml(t('Load reference image', '载入参考图'))}"><i class="fa-solid fa-image"></i><span>${escapeHtml(t('Load', '载入'))}</span></button>
      <button type="button" data-pose-studio-action="parse-reference" title="${escapeHtml(t('Parse reference pose', '解析参考姿势'))}"><i class="fa-solid fa-wand-magic-sparkles"></i><span>${escapeHtml(t('Parse', '解析'))}</span></button>
      <button type="button" data-pose-studio-action="select-regions" aria-pressed="false"><i class="fa-solid fa-vector-square"></i><span>${escapeHtml(t('Select people', '框选人物'))}</span></button>
      <button type="button" data-pose-studio-action="clear-regions" hidden>${escapeHtml(t('Clear regions', '清除框选'))}</button>
    </div>
    <div class="sai-pose-studio-tool-group">
      <span>${escapeHtml(t('Pose', '姿势'))}</span>
      <button type="button" data-pose-studio-action="save-library" title="${escapeHtml(t('Save pose to library', '保存到姿势库'))}"><i class="fa-solid fa-floppy-disk"></i><span>${escapeHtml(t('Save', '保存'))}</span></button>
      <button type="button" data-pose-studio-action="status" title="${escapeHtml(t('Check resources', '检查资源'))}"><i class="fa-solid fa-circle-check"></i><span>${escapeHtml(t('Check', '检查'))}</span></button>
    </div>
    <label class="sai-pose-studio-tool-group">
      <span>${escapeHtml(t('Render style'))}</span>
      <select data-pose-studio-render-style disabled aria-label="${escapeHtml(t('Render style'))}">
        ${Object.entries(RENDER_STYLES).map(([value, label]) => `<option value="${value}">${escapeHtml(t(label))}</option>`).join('')}
      </select>
    </label>
    <input type="file" accept="image/*" data-pose-studio-reference-file hidden>
  </div>
  <div class="sai-pose-studio-body">
    <aside class="sai-pose-studio-controls" data-pose-studio-controls>
      <details data-pose-studio-advanced>
        <summary><i class="fa-solid fa-sliders"></i><span>${escapeHtml(t('Advanced parameters', '高级参数'))}</span></summary>
        <label class="sai-pose-studio-control-field">
          <span><b>${escapeHtml(t('Maximum people', '最大人数'))}</b></span>
          <input type="number" data-pose-studio-max-people min="1" step="1" value="2" required aria-label="${escapeHtml(t('Maximum people', '最大人数'))}">
          <small>${escapeHtml(t('Applies to the next parse.', '用于下一次解析。'))}</small>
        </label>
        <label class="sai-pose-studio-control-field">
          <span><b>${escapeHtml(t('Person priority', '人物选择'))}</b></span>
          <select data-pose-studio-person-selection aria-label="${escapeHtml(t('Person priority', '人物选择'))}">
            <option value="subject">${escapeHtml(t('Main subject first', '主角优先'))}</option>
            <option value="left_to_right">${escapeHtml(t('Left to right', '从左到右'))}</option>
          </select>
          <small>${escapeHtml(t('Subject priority favors larger people near the center. Draw regions to choose exact people.', '主角优先按人物大小与居中程度选择；可用“框选人物”指定目标。'))}</small>
        </label>
      </details>
      <details open>
        <summary><i class="fa-solid fa-person-walking"></i><span>${escapeHtml(t('Pose', '姿势'))}</span></summary>
        <div class="sai-pose-studio-control-actions">
          <button type="button" data-pose-studio-action="reset-pose"><i class="fa-solid fa-rotate-left"></i><span>${escapeHtml(t('Reset Pose', '重置姿势'))}</span></button>
        </div>
        ${CONTROL_SLIDERS.filter(item => item.group === 'rotation').map(item => sliderControlHtml(item, item.def)).join('')}
      </details>
      <details open>
        <summary><i class="fa-solid fa-hand"></i><span>${escapeHtml(t('Hands', '手部'))}</span></summary>
        <div class="sai-pose-studio-hand-panel" data-pose-studio-hand-panel>
          <div class="sai-pose-studio-hand-side-toggle" data-pose-studio-hand-side-toggle>
            <button type="button" data-pose-studio-hand-side="l">${escapeHtml(t('Left', '左手'))}</button>
            <button type="button" data-pose-studio-hand-side="r">${escapeHtml(t('Right', '右手'))}</button>
          </div>
          <div class="sai-pose-studio-control-actions">
            <button type="button" data-pose-studio-action="reset-hand"><i class="fa-solid fa-rotate-left"></i><span>${escapeHtml(t('Reset Hand', '重置手部'))}</span></button>
          </div>
          <div class="sai-pose-studio-hand-status" data-pose-studio-hand-status></div>
          ${HAND_SLIDERS.map(item => handSliderControlHtml(item, item.def)).join('')}
        </div>
      </details>
      <details open>
        <summary><i class="fa-solid fa-shoe-prints"></i><span>${escapeHtml(t('Toes', '脚趾'))}</span></summary>
        <div class="sai-pose-studio-toe-panel" data-pose-studio-toe-panel>
          <div class="sai-pose-studio-toe-side-toggle" data-pose-studio-toe-side-toggle>
            <button type="button" data-pose-studio-toe-side="l">${escapeHtml(t('Left', '左脚'))}</button>
            <button type="button" data-pose-studio-toe-side="r">${escapeHtml(t('Right', '右脚'))}</button>
          </div>
          <div class="sai-pose-studio-control-actions">
            <button type="button" data-pose-studio-action="reset-toes"><i class="fa-solid fa-rotate-left"></i><span>${escapeHtml(t('Reset Toes', '重置脚趾'))}</span></button>
          </div>
          <div class="sai-pose-studio-toe-status" data-pose-studio-toe-status></div>
          ${TOE_SLIDERS.map(item => toeSliderControlHtml(item, item.def)).join('')}
        </div>
      </details>
      <details open>
        <summary><i class="fa-solid fa-camera"></i><span>${escapeHtml(t('Camera', '相机'))}</span></summary>
        <div class="sai-pose-studio-control-actions">
          <button type="button" data-pose-studio-action="reset-camera"><i class="fa-solid fa-crosshairs"></i><span>${escapeHtml(t('Reset Camera', '重置相机'))}</span></button>
        </div>
        ${CONTROL_SLIDERS.filter(item => item.group === 'camera').map(item => sliderControlHtml(item, item.def)).join('')}
        <p class="sai-pose-studio-control-hint">${escapeHtml(t('Distance: 1 is the original camera position; lower moves closer, higher moves farther.', '相机远近：1 为初始位置；小于 1 靠近，大于 1 远离。'))}</p>
      </details>
      <details open>
        <summary><i class="fa-solid fa-sliders"></i><span>${escapeHtml(t('Body', '角色'))}</span></summary>
        <div class="sai-pose-studio-gender-toggle" data-pose-studio-gender-toggle>
          <button type="button" data-pose-studio-gender="1">${escapeHtml(t('Male', '男性'))}</button>
          <button type="button" data-pose-studio-gender="0">${escapeHtml(t('Female', '女性'))}</button>
        </div>
        ${CONTROL_SLIDERS.filter(item => item.group === 'body').map(item => sliderControlHtml(item, item.def)).join('')}
      </details>
      <details>
        <summary><i class="fa-solid fa-ruler-combined"></i><span>${escapeHtml(t('Proportions', '比例'))}</span></summary>
        ${CONTROL_SLIDERS.filter(item => item.group === 'proportion').map(item => sliderControlHtml(item, item.def)).join('')}
      </details>
    </aside>
    <div class="sai-pose-studio-stage">
      <div class="sai-pose-studio-canvas-wrap" tabindex="0" aria-label="${escapeHtml(t('Pose viewport', '姿势视口'))}">
        <img class="sai-pose-studio-reference-bg" data-pose-studio-reference-bg alt="" hidden>
        <canvas data-pose-studio-viewer-canvas></canvas>
        <canvas data-pose-studio-fallback-canvas></canvas>
        <div class="sai-pose-studio-regions" data-pose-studio-regions hidden></div>
        <div class="sai-pose-studio-busy" data-pose-studio-busy hidden>
          <i class="fa-solid fa-spinner fa-spin"></i>
          <span></span>
        </div>
      </div>
    </div>
    <aside class="sai-pose-studio-library">
      <details class="sai-pose-studio-spatial" data-pose-studio-spatial>
        <summary>${escapeHtml(t('Camera & characters', '相机与角色'))}</summary>
        <div class="sai-pose-studio-spatial-tabs">
          <button type="button" data-pose-spatial-view="top" aria-pressed="true">${escapeHtml(t('Top view', '俯视'))}</button>
          <button type="button" data-pose-spatial-view="side" aria-pressed="false">${escapeHtml(t('Side view', '侧视'))}</button>
          <button type="button" data-pose-spatial-fit title="${escapeHtml(t('Fit the diagram without moving the camera', '适应小窗范围，不移动相机'))}">${escapeHtml(t('Fit', '适应'))}</button>
        </div>
        <canvas data-pose-spatial-canvas tabindex="0" width="240" height="180" aria-label="${escapeHtml(t('Camera diagram: drag to adjust the camera; arrow keys orbit', '相机空间图：拖动调整相机，方向键旋转'))}"></canvas>
        <div class="sai-pose-studio-spatial-hint">${escapeHtml(t('Drag: angle & distance · Wheel: distance · Shift: fine', '拖动：角度与远近 · 滚轮：远近 · Shift：精调'))}</div>
        <div class="sai-pose-studio-spatial-legend"><span>${escapeHtml(t('Blue: camera', '蓝色：相机'))}</span><span>${escapeHtml(t('Orange: selected person', '橙色：当前人物'))}</span></div>
      </details>
      <div class="sai-pose-studio-library-head">
        <span>${escapeHtml(t('Pose Library', '姿势库'))}</span>
        <button type="button" data-pose-studio-action="refresh-library" title="${escapeHtml(t('Refresh', '刷新'))}"><i class="fa-solid fa-arrows-rotate"></i></button>
      </div>
      <div class="sai-pose-library-filters" data-pose-library-filters>
        <input type="search" data-pose-library-search placeholder="${escapeHtml(t('Search poses'))}" aria-label="${escapeHtml(t('Search poses'))}">
        <div class="sai-pose-library-filter-row">
          <select data-pose-library-source aria-label="${escapeHtml(t('Pose source'))}">
            <option value="">${escapeHtml(t('All sources'))}</option>
            <option value="built_in">${escapeHtml(t('Built-in poses'))}</option>
            <option value="user">${escapeHtml(t('My poses'))}</option>
          </select>
          <select data-pose-library-series aria-label="${escapeHtml(t('Pose series'))}"><option value="">${escapeHtml(t('All series'))}</option></select>
        </div>
        <div class="sai-pose-library-filter-row">
          <select data-pose-library-category aria-label="${escapeHtml(t('Pose category'))}"><option value="">${escapeHtml(t('All categories'))}</option></select>
          <select data-pose-library-view aria-label="${escapeHtml(t('View angle'))}">
            ${Object.entries(LIBRARY_VIEWS).map(([value, view]) => `<option value="${value}">${escapeHtml(t(view.label))}</option>`).join('')}
          </select>
        </div>
      </div>
      <form class="sai-pose-library-save" data-pose-library-save hidden>
        <label>${escapeHtml(t('Pose name', '姿势名称'))}<input data-pose-library-name required maxlength="100" autocomplete="off"></label>
        <label>${escapeHtml(t('Pose series'))}<select data-pose-library-save-series></select></label>
        <label>${escapeHtml(t('Pose category'))}<select data-pose-library-save-category></select></label>
        <div class="sai-pose-library-filter-row">
          <button type="submit"><i class="fa-solid fa-check"></i>${escapeHtml(t('Save', '保存'))}</button>
          <button type="button" data-pose-library-cancel><i class="fa-solid fa-xmark"></i>${escapeHtml(t('Cancel', '取消'))}</button>
        </div>
      </form>
      <div class="sai-pose-studio-library-list" data-pose-library-list></div>
      <div class="sai-pose-library-pagination">
        <span data-pose-library-count aria-live="polite"></span>
        <button type="button" data-pose-library-page="previous" title="${escapeHtml(t('Previous page'))}" disabled><i class="fa-solid fa-chevron-left"></i></button>
        <button type="button" data-pose-library-page="next" title="${escapeHtml(t('Next page'))}" disabled><i class="fa-solid fa-chevron-right"></i></button>
      </div>
    </aside>
  </div>
  <div class="sai-pose-studio-status" data-pose-studio-status></div>
</div>`;
        document.body.appendChild(modal);
        activeModal = modal;
        call(options, 'ensureFormNames', modal, 'pose_studio');

        const viewerCanvas = modal.querySelector('[data-pose-studio-viewer-canvas]');
        const fallbackCanvas = modal.querySelector('[data-pose-studio-fallback-canvas]');
        const referenceBg = modal.querySelector('[data-pose-studio-reference-bg]');
        const canvasWrap = modal.querySelector('.sai-pose-studio-canvas-wrap');
        const stageEl = modal.querySelector('.sai-pose-studio-stage');
        const busyEl = modal.querySelector('[data-pose-studio-busy]');
        const busyText = busyEl?.querySelector?.('span');
        const referenceFileInput = modal.querySelector('[data-pose-studio-reference-file]');
        const helpEl = modal.querySelector('[data-pose-studio-help]');
        const ctx = fallbackCanvas.getContext('2d');
        const status = modal.querySelector('[data-pose-studio-status]');
        const libraryList = modal.querySelector('[data-pose-library-list]');
        const librarySearch = modal.querySelector('[data-pose-library-search]');
        const librarySource = modal.querySelector('[data-pose-library-source]');
        const librarySeries = modal.querySelector('[data-pose-library-series]');
        const libraryCategory = modal.querySelector('[data-pose-library-category]');
        const libraryView = modal.querySelector('[data-pose-library-view]');
        const libraryCount = modal.querySelector('[data-pose-library-count]');
        const librarySaveForm = modal.querySelector('[data-pose-library-save]');
        const librarySaveSeries = modal.querySelector('[data-pose-library-save-series]');
        const librarySaveCategory = modal.querySelector('[data-pose-library-save-category]');
        const libraryName = modal.querySelector('[data-pose-library-name]');
        let libraryRequestId = 0, poseLoadRequestId = 0, librarySearchTimer = null;
        let libraryOffset = 0, libraryNextOffset = null, libraryItems = [];
        let libraryTaxonomy = { series: [], categories: {} };
        let thumbnailViewer = null, thumbnailData = null, thumbnailCore = null;
        let libraryCameraParams = null;
        let thumbnailRequestId = 0;
        let thumbnailQueue = Promise.resolve();
        const libraryThumbnails = new Map();
        const peopleControl = modal.querySelector('[data-pose-studio-people]');
        const personSelect = modal.querySelector('[data-pose-studio-person]');
        const maxPeopleInput = modal.querySelector('[data-pose-studio-max-people]');
        const personSelectionInput = modal.querySelector('[data-pose-studio-person-selection]');
        const renderStyleInput = modal.querySelector('[data-pose-studio-render-style]');
        const selectRegionsButton = modal.querySelector('[data-pose-studio-action="select-regions"]');
        const clearRegionsButton = modal.querySelector('[data-pose-studio-action="clear-regions"]');
        const controlSliders = Array.from(modal.querySelectorAll('[data-pose-studio-slider]'));
        const genderButtons = Array.from(modal.querySelectorAll('button[data-pose-studio-gender]'));
        const handSliders = Array.from(modal.querySelectorAll('[data-pose-studio-hand-slider]'));
        const handSideButtons = Array.from(modal.querySelectorAll('button[data-pose-studio-hand-side]'));
        const handStatus = modal.querySelector('[data-pose-studio-hand-status]');
        const toeSliders = Array.from(modal.querySelectorAll('[data-pose-studio-toe-slider]'));
        const toeSideButtons = Array.from(modal.querySelectorAll('button[data-pose-studio-toe-side]'));
        const toeStatus = modal.querySelector('[data-pose-studio-toe-status]');
        let poseData = options.poseData || {};
        let editorState = options.editorState || {};
        let libraryCameraPose = editorState.library_camera_defaults || null;
        const libraryFilters = Object.assign({ query: '', source: '', series: '', category: '', view: 'current' }, editorState.library_filters || {});
        if (!['', 'built_in', 'user'].includes(libraryFilters.source)) libraryFilters.source = '';
        if (!Object.hasOwn(LIBRARY_VIEWS, libraryFilters.view)) libraryFilters.view = 'current';
        librarySearch.value = libraryFilters.query;
        librarySource.value = libraryFilters.source;
        libraryView.value = libraryFilters.view;
        let renderStyle = editorState.render_style || poseData.render_style || 'original';
        if (!Object.hasOwn(RENDER_STYLES, renderStyle)) renderStyle = 'original';
        renderStyleInput.value = renderStyle;
        const storedMaxPeople = Number(editorState.max_people);
        let maxPeople = Number.isSafeInteger(storedMaxPeople) && storedMaxPeople > 0 ? storedMaxPeople : 2;
        maxPeopleInput.value = String(maxPeople);
        let personSelection = editorState.person_selection === 'left_to_right' ? 'left_to_right' : 'subject';
        personSelectionInput.value = personSelection;
        let meshParams = Object.assign(defaultMeshParams(), options.meshParams || {}, editorState.mesh_params || {});
        let exportParams = Object.assign(
            defaultExportParams(),
            editorState.export_params || {},
            editorState.camera_export_params || {}
        );
        exportParams.samApplyCamera = true;
        const exportReferenceBackground = options.exportReferenceBackground === true || editorState.export_reference_background === true;
        if (editorState.camera_params && typeof editorState.camera_params === 'object') {
            exportParams = Object.assign(exportParams, {
                cam_zoom: Number(editorState.camera_params.zoom ?? exportParams.cam_zoom),
                cam_distance: Number(editorState.camera_params.distance_scale ?? exportParams.cam_distance),
                cam_offset_x: Number(editorState.camera_params.offset_x ?? exportParams.cam_offset_x),
                cam_offset_y: Number(editorState.camera_params.offset_y ?? exportParams.cam_offset_y),
                cam_yaw_deg: Number(editorState.camera_params.yaw_deg ?? exportParams.cam_yaw_deg),
                cam_pitch_deg: Number(editorState.camera_params.pitch_deg ?? exportParams.cam_pitch_deg)
            });
        }
        if (canvasSize) {
            exportParams.view_width = canvasSize.width;
            exportParams.view_height = canvasSize.height;
            editorState = Object.assign({}, editorState, { reference_size: canvasSize });
        }
        let referenceAsset = options.referenceAsset || null;
        let referenceAssetSource = options.referenceAssetSource || null;
        let referenceDataUrl = options.referenceImageDataUrl || (String(options.referenceSrc || '').startsWith('data:image/') ? options.referenceSrc : '');
        let referenceSrc = options.referenceSrc || referenceDataUrl || referenceAsset?.preview_url || referenceAsset?.data_url || referenceAsset?.thumb || '';
        let referenceDrawn = false;
        let importPollTimer = null;
        let viewer = null;
        let personScene = null;
        let spatialView = null;
        let cameraGestures = null;
        let regionSelector = null;
        let meshUpdatePending = false;
        let viewerReady = false;
        let usingFallbackCanvas = true;
        let busyActive = false;
        let canvasRatio = 1;
        let canvasWrapResizeObserver = null;
        let meshUpdateTimer = null;
        let meshUpdateRequestId = 0;
        const controlDefByKey = new Map(CONTROL_SLIDERS.map(item => [item.key, item]));
        const handSliderDefByKey = new Map(HAND_SLIDERS.map(item => [item.key, item]));
        const toeSliderDefByKey = new Map(TOE_SLIDERS.map(item => [item.key, item]));
        let handPresets = null;
        let activeHandSide = editorState.hand_controls?.active_side === 'r' ? 'r' : 'l';
        let handSliderValues = Object.assign({}, HAND_DEFAULT_SLIDER_VALUES, editorState.hand_controls?.values || {});
        let handSliderDefaults = Object.assign({}, HAND_DEFAULT_SLIDER_VALUES, handSliderValues);
        const handBiasValues = [1.0, 1.0, 1.0];
        let activeToeSide = editorState.toe_controls?.active_side === 'r' ? 'r' : 'l';
        let toeSliderValues = Object.assign({}, TOE_DEFAULT_SLIDER_VALUES, editorState.toe_controls?.values || {});
        let toeBaseRotations = {};

        const setStatus = (message, failed) => {
            if (!isCurrent() || !status) return;
            status.textContent = message || '';
            status.classList.toggle('is-error', !!failed);
            if (busyActive && busyText && message) busyText.textContent = message;
        };

        const setBusy = (message, active = true) => {
            if (!isCurrent()) return;
            busyActive = !!active;
            modal.classList.toggle('is-busy', busyActive);
            if (busyEl) busyEl.hidden = !busyActive;
            if (busyText) busyText.textContent = busyActive ? (message || t('Working...', '处理中...')) : '';
            if (personSelect) personSelect.disabled = busyActive || meshUpdatePending;
            maxPeopleInput.disabled = busyActive;
            personSelectionInput.disabled = busyActive;
            renderStyleInput.disabled = busyActive || !viewerReady;
            libraryView.disabled = busyActive || !viewerReady;
            libraryList.inert = busyActive || !viewerReady;
            librarySaveForm.querySelectorAll('input, select, button').forEach(control => { control.disabled = busyActive || !viewerReady; });
            controlSliders.forEach(slider => { slider.disabled = busyActive || !viewerReady; });
            modal.querySelectorAll('[data-pose-studio-action]').forEach((button) => {
                const action = button.getAttribute('data-pose-studio-action') || '';
                button.disabled = action === 'export'
                    ? busyActive || !viewerReady || usingFallbackCanvas
                    : busyActive && action !== 'status';
            });
            handSliders.forEach((slider) => {
                slider.disabled = busyActive || !viewerReady || !handPresets || !activeHandSide;
            });
            handSideButtons.forEach((button) => {
                button.disabled = busyActive || !viewerReady;
            });
            toeSliders.forEach((slider) => {
                slider.disabled = busyActive || !viewerReady || !activeToeSide || !viewer?.bones?.[`ball_${activeToeSide}`];
            });
            toeSideButtons.forEach((button) => {
                button.disabled = busyActive || !viewerReady;
            });
        };

        const isPoseStudioScrollableArea = (target) => !!target?.closest?.(
            '.sai-pose-studio-body, .sai-pose-studio-controls, .sai-pose-studio-library-list'
        );

        const handleModalWheelBoundary = (evt) => {
            if (!modal.contains(evt.target)) return;
            if (canvasWrap && canvasWrap.contains(evt.target)) return;
            evt.stopPropagation();
            if (!isPoseStudioScrollableArea(evt.target)) evt.preventDefault();
        };

        const handleModalInputBoundary = (evt) => {
            if (!modal.contains(evt.target)) return;
            evt.stopPropagation();
            const isCanvasGesture = !!(canvasWrap && canvasWrap.contains(evt.target));
            if (isCanvasGesture && typeof evt.preventDefault === 'function') evt.preventDefault();
        };

        modal.addEventListener('wheel', handleModalWheelBoundary, { passive: false });
        [
            'pointerdown',
            'pointermove',
            'pointerup',
            'pointercancel',
            'mousedown',
            'mousemove',
            'mouseup',
            'contextmenu',
            'dragstart',
            'touchstart',
            'touchmove',
            'touchend',
            'touchcancel'
        ].forEach((type) => {
            modal.addEventListener(type, handleModalInputBoundary, { passive: false });
        });

        const activeModelRotation = () => {
            const rotation = viewerReady && viewer && typeof viewer.getPose === 'function'
                ? viewer.getPose()?.modelRotation
                : poseData?.modelRotation;
            return Array.isArray(rotation) ? rotation : [0, 0, 0];
        };

        const updateControlValue = (key, value) => {
            const def = controlDefByKey.get(key) || {};
            const slider = modal.querySelector(`[data-pose-studio-slider="${cssEscape(key)}"]`);
            const label = modal.querySelector(`[data-pose-studio-value="${cssEscape(key)}"]`);
            if (slider && document.activeElement !== slider) slider.value = String(value ?? def.def ?? 0);
            if (label) label.textContent = sliderValueText(value ?? def.def ?? 0, def);
        };

        const syncGenderControls = () => {
            const gender = Number(meshParams.gender);
            const isFemale = Number.isFinite(gender) ? gender < 0.5 : true;
            genderButtons.forEach((button) => {
                const value = Number(button.getAttribute('data-pose-studio-gender'));
                button.classList.toggle('is-active', value === (isFemale ? 0 : 1));
            });
            modal.querySelectorAll('[data-pose-studio-gender="female"]').forEach((field) => {
                field.hidden = !isFemale;
            });
        };

        const syncControlValues = () => {
            CONTROL_SLIDERS.forEach((def) => {
                if (def.group === 'rotation') {
                    const rotation = activeModelRotation();
                    const index = def.axis === 'x' ? 0 : def.axis === 'y' ? 1 : 2;
                    updateControlValue(def.key, Number(rotation[index]) || 0);
                } else if (def.group === 'camera') {
                    updateControlValue(def.key, Number(exportParams[def.key] ?? def.def));
                } else {
                    updateControlValue(def.key, Number(meshParams[def.key] ?? def.def));
                }
            });
            syncGenderControls();
        };

        const persistEditorState = (extra = {}) => {
            if (!isCurrent() || personScene?.loading) return editorState;
            editorState = Object.assign({}, editorState, extra, {
                mesh_params: Object.assign({}, meshParams),
                export_params: Object.assign({}, exportParams),
                render_style: renderStyle,
                library_filters: { ...libraryFilters },
                max_people: maxPeople,
                person_selection: personSelection,
                person_scene: personScene?.serialize(meshParams) || null
            });
            return editorState;
        };

        const readMaxPeople = () => {
            const value = Number(maxPeopleInput.value);
            if (!Number.isSafeInteger(value) || value < 1) return false;
            maxPeople = value;
            persistEditorState();
            return true;
        };
        maxPeopleInput.addEventListener('input', readMaxPeople);
        personSelectionInput.addEventListener('change', () => {
            personSelection = personSelectionInput.value;
            persistEditorState();
        });
        const applyRenderStyle = (value) => {
            renderStyle = viewer.setRenderStyle(value);
            renderStyleInput.value = renderStyle;
            persistEditorState();
            libraryThumbnails.clear();
            renderLibraryPreviews(libraryItems, libraryRequestId);
        };
        renderStyleInput.addEventListener('change', () => applyRenderStyle(renderStyleInput.value));

        const clampHandSliderValue = (key, value) => {
            const def = handSliderDefByKey.get(key) || {};
            let next = Number(value);
            if (!Number.isFinite(next)) next = Number(def.def) || 0;
            if (Number.isFinite(Number(def.min))) next = Math.max(Number(def.min), next);
            if (Number.isFinite(Number(def.max))) next = Math.min(Number(def.max), next);
            return next;
        };

        const currentHandControlState = () => ({
            active_side: activeHandSide,
            values: Object.assign({}, handSliderValues),
            defaults: Object.assign({}, handSliderDefaults)
        });

        const persistHandControls = (extra = {}) => persistEditorState(Object.assign({
            hand_controls: currentHandControlState()
        }, extra));

        const updateHandControlValue = (key, value) => {
            const def = handSliderDefByKey.get(key) || {};
            const next = clampHandSliderValue(key, value);
            const slider = modal.querySelector(`[data-pose-studio-hand-slider="${cssEscape(key)}"]`);
            const label = modal.querySelector(`[data-pose-studio-hand-value="${cssEscape(key)}"]`);
            if (slider && document.activeElement !== slider) slider.value = String(next);
            if (label) label.textContent = sliderValueText(next, def);
        };

        const syncHandControls = () => {
            const canUse = !!viewerReady && !!viewer && !!handPresets;
            handSideButtons.forEach((button) => {
                const side = button.getAttribute('data-pose-studio-hand-side') || '';
                button.classList.toggle('is-active', side === activeHandSide);
                button.disabled = busyActive || !viewerReady;
            });
            handSliders.forEach((slider) => {
                slider.disabled = busyActive || !canUse || !activeHandSide;
            });
            HAND_SLIDERS.forEach((def) => updateHandControlValue(def.key, handSliderValues[def.key] ?? def.def));
            if (handStatus) {
                if (!viewerReady) {
                    handStatus.textContent = '';
                } else if (!handPresets) {
                    handStatus.textContent = t('Hand controls unavailable.', '手部控制不可用。');
                } else {
                    handStatus.textContent = activeHandSide === 'r' ? t('Right Hand', '右手') : t('Left Hand', '左手');
                }
            }
        };

        const getPresetDataForSide = (preset, side) => (side === 'r' ? preset?.preset_r : preset?.preset_l);

        const lerpHandPresetData = (poseA, poseB, amount, side) => {
            const dataA = getPresetDataForSide(poseA, side);
            const dataB = getPresetDataForSide(poseB, side);
            const result = {};
            const tValue = Math.max(0, Math.min(1, Number(amount) || 0));
            if (!dataA || !dataB) return result;
            Object.keys(dataA).forEach((key) => {
                const a = dataA[key];
                const b = dataB[key];
                if (!a || !b) return;
                const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
                const bFlip = dot < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b;
                const blended = [
                    a[0] * (1 - tValue) + bFlip[0] * tValue,
                    a[1] * (1 - tValue) + bFlip[1] * tValue,
                    a[2] * (1 - tValue) + bFlip[2] * tValue,
                    a[3] * (1 - tValue) + bFlip[3] * tValue
                ];
                const length = Math.hypot(blended[0], blended[1], blended[2], blended[3]) || 1;
                result[key] = [
                    blended[0] / length,
                    blended[1] / length,
                    blended[2] / length,
                    blended[3] / length
                ];
            });
            return result;
        };

        const sampleCurrentHandPose = (side) => {
            if (!viewer?.bones || !side) return null;
            const result = {};
            FINGER_PREFIXES.forEach((prefix) => {
                ['01', '02', '03'].forEach((segment) => {
                    const bone = viewer.bones[`${prefix}_${segment}_${side}`];
                    if (!bone) return;
                    result[`${prefix}_${segment}`] = [
                        bone.quaternion.x,
                        bone.quaternion.y,
                        bone.quaternion.z,
                        bone.quaternion.w
                    ];
                });
            });
            return result;
        };

        const quatAngularDistance = (a, b) => {
            const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
            const clamped = Math.max(-1, Math.min(1, dot));
            return 2 * Math.acos(clamped);
        };

        const estimateHandInterpolationValue = (currentData, startData, endData, keys) => {
            let bestT = 0;
            let bestScore = Number.POSITIVE_INFINITY;
            if (!currentData || !startData || !endData || !keys?.length) return bestT;
            for (let step = 0; step <= 100; step += 1) {
                const amount = step / 100;
                const sampled = lerpHandPresetData(
                    { preset_l: startData, preset_r: startData },
                    { preset_l: endData, preset_r: endData },
                    amount,
                    'l'
                );
                let score = 0;
                keys.forEach((key) => {
                    const current = currentData[key];
                    const target = sampled[key];
                    if (!current || !target) return;
                    score += quatAngularDistance(current, target);
                });
                if (score < bestScore) {
                    bestScore = score;
                    bestT = amount;
                }
            }
            return bestT;
        };

        const resetHandSliders = () => {
            handSliderValues = Object.assign({}, HAND_DEFAULT_SLIDER_VALUES, handSliderDefaults);
            HAND_SLIDERS.forEach((def) => updateHandControlValue(def.key, handSliderValues[def.key] ?? def.def));
        };

        const calibrateHandSliderDefaults = (side) => {
            if (!viewer || !handPresets || !side) return;
            const { OPEN, CHOP, FIST } = handPresets;
            if (!OPEN || !CHOP || !FIST) return;
            const currentData = sampleCurrentHandPose(side);
            if (!currentData) return;
            const allKeys = Object.keys(currentData);
            const spread = estimateHandInterpolationValue(
                currentData,
                getPresetDataForSide(CHOP, side),
                getPresetDataForSide(OPEN, side),
                allKeys
            );
            const spreadBaseData = lerpHandPresetData(CHOP, OPEN, spread, side);
            const fistData = getPresetDataForSide(FIST, side);
            const perFinger = {};
            FINGER_PREFIXES.forEach((prefix) => {
                const keys = ['01', '02', '03'].map((segment) => `${prefix}_${segment}`);
                perFinger[prefix] = estimateHandInterpolationValue(currentData, spreadBaseData, fistData, keys);
            });
            const grasp = FINGER_PREFIXES.reduce((total, prefix) => total + (perFinger[prefix] || 0), 0) / FINGER_PREFIXES.length;
            handSliderDefaults = Object.assign({}, HAND_DEFAULT_SLIDER_VALUES, perFinger, { spread, grasp });
            resetHandSliders();
        };

        const applyActiveHandSliders = () => {
            if (!viewerReady || !viewer || !handPresets || !activeHandSide) return false;
            if (typeof viewer.interpolateHandPose !== 'function' || typeof viewer.interpolateFingerPose !== 'function') return false;
            const { OPEN, CHOP, FIST } = handPresets;
            if (!OPEN || !CHOP || !FIST) return false;
            const side = activeHandSide;
            const spread = clampHandSliderValue('spread', handSliderValues.spread);
            viewer.interpolateHandPose(CHOP, OPEN, spread, side);
            const spreadBaseData = lerpHandPresetData(CHOP, OPEN, spread, side);
            const fistData = getPresetDataForSide(FIST, side);
            FINGER_PREFIXES.forEach((prefix) => {
                const startPose = { preset_l: spreadBaseData, preset_r: spreadBaseData };
                const endPose = { preset_l: fistData, preset_r: fistData };
                viewer.interpolateFingerPose(startPose, endPose, clampHandSliderValue(prefix, handSliderValues[prefix]), side, prefix, handBiasValues);
            });
            if (typeof viewer.showHandHighlightRing === 'function') viewer.showHandHighlightRing(side);
            poseData = viewer?.getPose?.() || poseData;
            persistHandControls({ viewer_pose: poseData, viewer_enabled: true });
            return true;
        };

        const activateHandSide = async (side, flash = true) => {
            if (!isCurrent()) return false;
            if (side !== 'l' && side !== 'r') return false;
            activeHandSide = side;
            if (!handPresets) {
                handPresets = await loadHandPresets();
                if (!isCurrent()) return false;
            }
            if (viewerReady && viewer && handPresets) {
                calibrateHandSliderDefaults(side);
                if (typeof viewer.showHandHighlightRing === 'function') viewer.showHandHighlightRing(side);
                if (flash && typeof viewer.flashHandMarkers === 'function') viewer.flashHandMarkers(side);
            }
            syncHandControls();
            persistHandControls();
            return !!handPresets;
        };

        const clampToeSliderValue = (key, value) => {
            const def = toeSliderDefByKey.get(key) || {};
            let next = Number(value);
            if (!Number.isFinite(next)) next = Number(def.def) || 0;
            if (Number.isFinite(Number(def.min))) next = Math.max(Number(def.min), next);
            if (Number.isFinite(Number(def.max))) next = Math.min(Number(def.max), next);
            return next;
        };

        const toeSplaySign = (side) => (side === 'r' ? -1 : 1);
        const degToRad = (deg) => Number(deg || 0) * Math.PI / 180;
        const radToDeg = (rad) => Number(rad || 0) * 180 / Math.PI;

        const currentToeControlState = () => ({
            active_side: activeToeSide,
            values: Object.assign({}, toeSliderValues)
        });

        const persistToeControls = (extra = {}) => persistEditorState(Object.assign({
            toe_controls: currentToeControlState()
        }, extra));

        const updateToeControlValue = (key, value) => {
            const def = toeSliderDefByKey.get(key) || {};
            const next = clampToeSliderValue(key, value);
            const slider = modal.querySelector(`[data-pose-studio-toe-slider="${cssEscape(key)}"]`);
            const label = modal.querySelector(`[data-pose-studio-toe-value="${cssEscape(key)}"]`);
            if (slider && document.activeElement !== slider) slider.value = String(next);
            if (label) label.textContent = sliderValueText(next, def);
        };

        const toeBoneForSide = (side) => viewer?.bones?.[`ball_${side}`] || null;

        const captureToeBaseRotation = (side) => {
            const bone = toeBoneForSide(side);
            if (!bone) return null;
            const lift = clampToeSliderValue('lift', toeSliderValues.lift);
            const splay = clampToeSliderValue('splay', toeSliderValues.splay);
            const base = {
                x: radToDeg(bone.rotation.x) - (lift * TOE_ROTATION_LIMITS.lift),
                y: radToDeg(bone.rotation.y),
                z: radToDeg(bone.rotation.z) - (splay * TOE_ROTATION_LIMITS.splay * toeSplaySign(side))
            };
            toeBaseRotations[side] = base;
            return base;
        };

        const syncToeControls = () => {
            const canUse = !!viewerReady && !!viewer && !!toeBoneForSide(activeToeSide);
            toeSideButtons.forEach((button) => {
                const side = button.getAttribute('data-pose-studio-toe-side') || '';
                button.classList.toggle('is-active', side === activeToeSide);
                button.disabled = busyActive || !viewerReady;
            });
            toeSliders.forEach((slider) => {
                slider.disabled = busyActive || !canUse || !activeToeSide;
            });
            TOE_SLIDERS.forEach((def) => updateToeControlValue(def.key, toeSliderValues[def.key] ?? def.def));
            if (toeStatus) {
                if (!viewerReady) {
                    toeStatus.textContent = '';
                } else if (!canUse) {
                    toeStatus.textContent = t('Toe controls unavailable for this rig.', '当前骨架没有可用的脚趾控制骨骼。');
                } else {
                    toeStatus.textContent = activeToeSide === 'r' ? t('Right Foot', '右脚') : t('Left Foot', '左脚');
                }
            }
        };

        const applyActiveToeSliders = () => {
            if (!viewerReady || !viewer || !activeToeSide) return false;
            const bone = toeBoneForSide(activeToeSide);
            if (!bone) {
                syncToeControls();
                return false;
            }
            const base = toeBaseRotations[activeToeSide] || captureToeBaseRotation(activeToeSide) || { x: 0, y: 0, z: 0 };
            const splay = clampToeSliderValue('splay', toeSliderValues.splay);
            const lift = clampToeSliderValue('lift', toeSliderValues.lift);
            bone.rotation.set(
                degToRad(base.x + (lift * TOE_ROTATION_LIMITS.lift)),
                degToRad(base.y),
                degToRad(base.z + (splay * TOE_ROTATION_LIMITS.splay * toeSplaySign(activeToeSide)))
            );
            bone.updateMatrixWorld(true);
            if (viewer.skeleton) viewer.skeleton.update();
            viewer.skinnedMesh?.updateMatrixWorld?.(true);
            viewer.updateMarkers?.();
            viewer.requestRender?.();
            poseData = viewer.getPose?.() || poseData;
            persistToeControls({ viewer_pose: poseData, viewer_enabled: true });
            syncToeControls();
            return true;
        };

        const resetToeSliders = () => {
            toeSliderValues = Object.assign({}, TOE_DEFAULT_SLIDER_VALUES);
            TOE_SLIDERS.forEach((def) => updateToeControlValue(def.key, toeSliderValues[def.key] ?? def.def));
        };

        const activateToeSide = (side) => {
            if (side !== 'l' && side !== 'r') return false;
            activeToeSide = side;
            if (viewerReady && viewer) captureToeBaseRotation(side);
            syncToeControls();
            persistToeControls();
            return !!toeBoneForSide(side);
        };

        const fitCanvasWrap = () => {
            if (!canvasWrap) return;
            const ratio = Number(canvasRatio) > 0 ? Number(canvasRatio) : 1;
            const stageRect = stageEl?.getBoundingClientRect?.() || null;
            const viewportWidth = Math.max(320, window.innerWidth || document.documentElement.clientWidth || 1024);
            const viewportHeight = Math.max(320, window.innerHeight || document.documentElement.clientHeight || 768);
            const maxWidth = Math.max(120, Math.min(720, (stageRect?.width || viewportWidth) - 28));
            const maxHeight = Math.max(120, Math.min((stageRect?.height || viewportHeight) - 28, viewportHeight - 210));
            let width = maxWidth;
            let height = width / ratio;
            if (height > maxHeight) {
                height = maxHeight;
                width = height * ratio;
            }
            canvasWrap.style.width = `${Math.max(1, Math.round(width))}px`;
            canvasWrap.style.height = `${Math.max(1, Math.round(height))}px`;
        };

        const handleCanvasWrapResize = () => {
            window.requestAnimationFrame(fitCanvasWrap);
        };

        const applyCanvasResolution = () => {
            const size = normalizeImageSize(exportParams.view_width, exportParams.view_height) || { width: 1024, height: 1024 };
            [viewerCanvas, fallbackCanvas].forEach((canvas) => {
                if (!canvas) return;
                canvas.width = size.width;
                canvas.height = size.height;
            });
            canvasRatio = size.width / size.height;
            if (canvasWrap) {
                canvasWrap.style.setProperty('--sai-pose-studio-aspect', `${size.width} / ${size.height}`);
                canvasWrap.style.setProperty('--sai-pose-studio-ratio', `${canvasRatio}`);
                fitCanvasWrap();
            }
            editorState = Object.assign({}, editorState, { reference_size: size });
            return size;
        };

        applyCanvasResolution();
        if (window.ResizeObserver && stageEl) {
            canvasWrapResizeObserver = new ResizeObserver(handleCanvasWrapResize);
            canvasWrapResizeObserver.observe(stageEl);
        }
        window.addEventListener('resize', handleCanvasWrapResize);
        syncControlValues();
        syncHandControls();
        syncToeControls();

        const currentCameraParams = () => ({
            offset_x: Number(exportParams.cam_offset_x) || 0,
            offset_y: Number(exportParams.cam_offset_y) || 0,
            zoom: Number(exportParams.cam_zoom) || 1.0,
            distance_scale: Number(exportParams.cam_distance) || 1.0,
            yaw_deg: Number(exportParams.cam_yaw_deg) || 0,
            pitch_deg: Number(exportParams.cam_pitch_deg) || 0
        });

        const persistCameraParams = (extra = {}) => {
            const cameraParams = currentCameraParams();
            editorState = Object.assign({}, editorState, extra, {
                camera_params: cameraParams,
                mesh_params: Object.assign({}, meshParams),
                export_params: Object.assign({}, exportParams)
            });
            return cameraParams;
        };

        const applyCameraToViewer = (snap = true) => {
            if (!viewerReady || !viewer) return false;
            const width = Number(exportParams.view_width) || 1024;
            const height = Number(exportParams.view_height) || 1024;
            const zoom = Number(exportParams.cam_zoom) || 1.0;
            const offsetX = Number(exportParams.cam_offset_x) || 0;
            const offsetY = Number(exportParams.cam_offset_y) || 0;
            const yaw = Number(exportParams.cam_yaw_deg) || 0;
            const pitch = Number(exportParams.cam_pitch_deg) || 0;
            const distance = Number(exportParams.cam_distance) || 1.0;
            if (snap && typeof viewer.snapToCaptureCamera === 'function') {
                viewer.snapToCaptureCamera(width, height, zoom, offsetX, offsetY, yaw, pitch, distance);
            } else if (typeof viewer.updateCaptureCamera === 'function') {
                viewer.updateCaptureCamera(width, height, zoom, offsetX, offsetY, yaw, pitch, distance);
            }
            if (typeof viewer.setCameraParams === 'function') viewer.setCameraParams(currentCameraParams());
            persistCameraParams();
            return true;
        };

        const clampControlValue = (key, value) => {
            const def = controlDefByKey.get(key) || {};
            let next = Number(value);
            if (!Number.isFinite(next)) next = Number(def.def) || 0;
            if (Number.isFinite(Number(def.min))) next = Math.max(Number(def.min), next);
            if (Number.isFinite(Number(def.max))) next = Math.min(Number(def.max), next);
            return next;
        };

        const applyCameraControlValue = (key, value, snap = true) => {
            const def = controlDefByKey.get(key);
            if (!def || def.group !== 'camera') return null;
            const next = clampControlValue(key, value);
            exportParams[key] = next;
            applyCameraToViewer(snap);
            persistCameraParams();
            updateControlValue(key, next);
            return next;
        };

        const canControlCamera = () => viewerReady && !!viewer && !busyActive && !meshUpdatePending && !regionSelector?.active;
        const applyCameraGesturePatch = (patch) => {
            if (!canControlCamera()) return false;
            for (const [key, value] of Object.entries(patch)) {
                if (controlDefByKey.get(key)?.group !== 'camera' || !Number.isFinite(value)) continue;
                exportParams[key] = clampControlValue(key, value);
                updateControlValue(key, exportParams[key]);
            }
            applyCameraToViewer(true);
            return true;
        };
        const handleCameraKey = event => {
            if (!canControlCamera() || event.target?.closest?.('input, textarea, select, button, [contenteditable="true"]')) return;
            const action = cameraGestures?.cameraKeyboardAction(exportParams, event);
            if (!action) return;
            event.preventDefault(); event.stopPropagation();
            if (action.reset) resetCameraControls();
            else applyCameraGesturePatch(action.patch);
        };
        let viewportRotationDrag = null;
        const startViewportRotationDrag = event => {
            if (!canControlCamera()) return;
            canvasWrap.focus({ preventScroll: true });
            if (event.button !== 2 && !(event.button === 0 && event.altKey && !event.ctrlKey && !event.metaKey)) return;
            event.preventDefault(); event.stopImmediatePropagation();
            viewportRotationDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
            canvasWrap.setPointerCapture(event.pointerId);
            canvasWrap.classList.add('is-camera-rotating');
        };
        const moveViewportRotationDrag = event => {
            if (event.pointerId !== viewportRotationDrag?.id) return;
            event.preventDefault(); event.stopImmediatePropagation();
            const drag = viewportRotationDrag;
            const patch = cameraGestures.cameraRotationPatch(exportParams, event.clientX - drag.x, event.clientY - drag.y, event.shiftKey);
            drag.x = event.clientX; drag.y = event.clientY;
            applyCameraGesturePatch(patch);
        };
        const stopViewportRotationDrag = event => {
            if (event.pointerId !== viewportRotationDrag?.id) return;
            const id = viewportRotationDrag.id;
            viewportRotationDrag = null;
            canvasWrap.classList.remove('is-camera-rotating');
            if (canvasWrap.hasPointerCapture(id)) canvasWrap.releasePointerCapture(id);
            event.stopImmediatePropagation();
        };
        let viewportPanDrag = null;
        let viewportObserveDrag = null;
        const isObserveModifier = (evt) => !!(evt && (evt.ctrlKey || evt.metaKey));

        const observeCameraState = () => {
            if (!viewerReady || !viewer?.camera || !viewer?.orbit) return null;
            const camera = viewer.camera;
            const target = viewer.orbit.target;
            return {
                position: [camera.position.x, camera.position.y, camera.position.z],
                target: [target.x, target.y, target.z],
                cameraParams: currentCameraParams()
            };
        };

        const startViewportObserveDrag = (evt) => {
            if (!canvasWrap || busyActive || evt.button !== 1 || !isObserveModifier(evt)) return false;
            if (!viewerReady || !viewer?.camera || !viewer?.orbit || !viewer?.THREE) return false;
            evt.preventDefault();
            evt.stopPropagation();
            const offset = viewer.camera.position.clone().sub(viewer.orbit.target);
            const spherical = new viewer.THREE.Spherical().setFromVector3(offset);
            viewportObserveDrag = {
                pointerId: evt.pointerId,
                startX: evt.clientX,
                startY: evt.clientY,
                radius: spherical.radius,
                theta: spherical.theta,
                phi: spherical.phi,
                target: viewer.orbit.target.clone()
            };
            canvasWrap.setPointerCapture?.(evt.pointerId);
            return true;
        };

        const applyViewportObserveDelta = (dx, dy, start) => {
            if (!viewerReady || !viewer?.camera || !viewer?.orbit || !viewer?.THREE || !start) return false;
            const rect = canvasWrap?.getBoundingClientRect?.();
            const basis = Math.max(1, rect?.height || rect?.width || 512);
            const rotateSpeed = Number(viewer.orbit.rotateSpeed) || 0.95;
            const nextTheta = start.theta - (2 * Math.PI * (Number(dx) || 0) / basis * rotateSpeed);
            const minPhi = 0.01;
            const maxPhi = Math.PI - 0.01;
            const nextPhi = Math.max(minPhi, Math.min(maxPhi, start.phi - (2 * Math.PI * (Number(dy) || 0) / basis * rotateSpeed)));
            const spherical = new viewer.THREE.Spherical(start.radius, nextPhi, nextTheta);
            const offset = new viewer.THREE.Vector3().setFromSpherical(spherical);
            viewer.orbit.target.copy(start.target);
            viewer.camera.position.copy(start.target).add(offset);
            viewer.camera.lookAt(start.target);
            viewer.camera.updateProjectionMatrix?.();
            viewer.orbit.update?.();
            viewer.requestRender?.();
            return true;
        };

        const moveViewportObserveDrag = (evt) => {
            if (!viewportObserveDrag || evt.pointerId !== viewportObserveDrag.pointerId) return false;
            evt.preventDefault();
            evt.stopPropagation();
            return applyViewportObserveDelta(
                (Number(evt.clientX) || 0) - viewportObserveDrag.startX,
                (Number(evt.clientY) || 0) - viewportObserveDrag.startY,
                viewportObserveDrag
            );
        };

        const stopViewportObserveDrag = (evt) => {
            if (!viewportObserveDrag || evt.pointerId !== viewportObserveDrag.pointerId) return false;
            evt.preventDefault();
            evt.stopPropagation();
            canvasWrap?.releasePointerCapture?.(evt.pointerId);
            viewportObserveDrag = null;
            return true;
        };

        const applyViewportPanDelta = (dx, dy, startParams = exportParams) => {
            if (!canvasWrap) return false;
            const rect = canvasWrap.getBoundingClientRect();
            const width = Math.max(1, rect.width || Number(exportParams.view_width) || 1024);
            const height = Math.max(1, rect.height || Number(exportParams.view_height) || 1024);
            const aspect = width / height;
            const zoom = Math.max(0.1, Number(startParams.cam_zoom ?? exportParams.cam_zoom) || 1.0);
            const visibleHeight = (2 * 45 * Math.tan(15 * Math.PI / 180)) / zoom;
            const visibleWidth = visibleHeight * aspect;
            const startX = Number(startParams.cam_offset_x ?? exportParams.cam_offset_x) || 0;
            const startY = Number(startParams.cam_offset_y ?? exportParams.cam_offset_y) || 0;
            const nextX = startX + (Number(dx) || 0) / width * visibleWidth;
            const nextY = startY - (Number(dy) || 0) / height * visibleHeight;
            applyCameraControlValue('cam_offset_x', nextX, true);
            applyCameraControlValue('cam_offset_y', nextY, true);
            return true;
        };

        const startViewportPanDrag = (evt) => {
            if (!canvasWrap || busyActive || regionSelector?.active || evt.button !== 1) return;
            if (startViewportObserveDrag(evt)) return;
            if (isObserveModifier(evt)) {
                evt.preventDefault();
                evt.stopPropagation();
                return;
            }
            evt.preventDefault();
            evt.stopPropagation();
            viewportPanDrag = {
                pointerId: evt.pointerId,
                startX: evt.clientX,
                startY: evt.clientY,
                startParams: {
                    cam_zoom: Number(exportParams.cam_zoom) || 1.0,
                    cam_offset_x: Number(exportParams.cam_offset_x) || 0,
                    cam_offset_y: Number(exportParams.cam_offset_y) || 0
                }
            };
            canvasWrap.setPointerCapture?.(evt.pointerId);
        };

        const moveViewportPanDrag = (evt) => {
            if (moveViewportObserveDrag(evt)) return;
            if (!viewportPanDrag || evt.pointerId !== viewportPanDrag.pointerId) return;
            evt.preventDefault();
            evt.stopPropagation();
            applyViewportPanDelta(
                (Number(evt.clientX) || 0) - viewportPanDrag.startX,
                (Number(evt.clientY) || 0) - viewportPanDrag.startY,
                viewportPanDrag.startParams
            );
        };

        const stopViewportPanDrag = (evt) => {
            if (stopViewportObserveDrag(evt)) return;
            if (!viewportPanDrag || evt.pointerId !== viewportPanDrag.pointerId) return;
            evt.preventDefault();
            evt.stopPropagation();
            canvasWrap?.releasePointerCapture?.(evt.pointerId);
            viewportPanDrag = null;
        };

        const preventViewportMiddleClick = (evt) => {
            if (evt.button !== 1) return;
            evt.preventDefault();
            evt.stopPropagation();
        };

        const handleViewportWheel = (evt) => {
            if (!canvasWrap || !canControlCamera()) return;
            if (evt.currentTarget && evt.target && !evt.currentTarget.contains(evt.target)) return;
            evt.preventDefault();
            evt.stopPropagation();
            const patch = cameraGestures.cameraWheelPatch(exportParams, evt);
            if (patch) applyCameraGesturePatch(patch);
        };

        if (canvasWrap) {
            canvasWrap.addEventListener('pointerdown', startViewportRotationDrag, { passive: false, capture: true });
            canvasWrap.addEventListener('pointermove', moveViewportRotationDrag, { passive: false, capture: true });
            canvasWrap.addEventListener('pointerup', stopViewportRotationDrag, { passive: false, capture: true });
            canvasWrap.addEventListener('pointercancel', stopViewportRotationDrag, { passive: false, capture: true });
            canvasWrap.addEventListener('lostpointercapture', stopViewportRotationDrag);
            canvasWrap.addEventListener('keydown', handleCameraKey);
            canvasWrap.addEventListener('wheel', handleViewportWheel, { passive: false, capture: true });
            canvasWrap.addEventListener('pointerdown', startViewportPanDrag, { passive: false, capture: true });
            canvasWrap.addEventListener('pointermove', moveViewportPanDrag, { passive: false, capture: true });
            canvasWrap.addEventListener('pointerup', stopViewportPanDrag, { passive: false, capture: true });
            canvasWrap.addEventListener('pointercancel', stopViewportPanDrag, { passive: false, capture: true });
            canvasWrap.addEventListener('mousedown', preventViewportMiddleClick, { passive: false, capture: true });
            canvasWrap.addEventListener('auxclick', preventViewportMiddleClick, { passive: false, capture: true });
        }

        modal.__poseStudioDebug = Object.assign({}, modal.__poseStudioDebug || {}, {
            getObserveCameraState: observeCameraState
        });

        const applyClientMeshControl = (key, value) => {
            if (!viewerReady || !viewer) return false;
            if (key === 'head_size' && typeof viewer.updateHeadScale === 'function') {
                viewer.updateHeadScale(value);
                return true;
            }
            if (key === 'arm_size' && typeof viewer.updateArmScale === 'function') {
                viewer.updateArmScale(value);
                return true;
            }
            if (key === 'hand_size' && typeof viewer.updateHandScale === 'function') {
                viewer.updateHandScale(value);
                return true;
            }
            if (key.endsWith('_length') && typeof viewer.updateBoneLengthScale === 'function') {
                viewer.updateBoneLengthScale(key.replace(/_length$/, ''), value);
                return true;
            }
            return false;
        };

        const applyClientMeshControls = () => {
            ['head_size', 'arm_size', 'hand_size', 'spine_length'].forEach((key) => {
                applyClientMeshControl(key, Number(meshParams[key] ?? defaultMeshParams()[key]));
            });
        };

        const reloadCharacterPreview = async () => {
            if (!isCurrent()) return false;
            if (!viewerReady || !viewer || typeof API.poseStudioCharacterPreview !== 'function') {
                persistEditorState();
                return false;
            }
            const requestId = ++meshUpdateRequestId;
            meshUpdatePending = true;
            personSelect.disabled = true;
            const currentPose = typeof viewer.getPose === 'function' ? viewer.getPose() : poseData;
            const currentPosition = viewer.skinnedMesh.position.toArray();
            setStatus(t('Updating character...', '正在更新角色...'), false);
            try {
                const response = await API.poseStudioCharacterPreview(meshParams);
                if (!isCurrent() || requestId !== meshUpdateRequestId) return false;
                if (!response?.ok && !response?.vertices) {
                    setStatus(response?.details || response?.error || t('Character update failed.', '角色更新失败。'), true);
                    return false;
                }
                viewer.loadData(response, true);
                viewer.skinnedMesh.position.fromArray(currentPosition);
                if (personScene) {
                    personScene.meshData = response;
                    if (personScene.people.length) personScene.people[personScene.active].meshData = response;
                }
                viewer.updateLights?.([{ type: 'ambient', color: '#ffffff', intensity: 1.0, x: 0, y: 0, z: 0 }]);
                applyClientMeshControls();
                if (currentPose) {
                    const { bonePositions, ...reshapedPose } = currentPose;
                    applyPoseToViewer(reshapedPose, true);
                }
                applyCameraToViewer(true);
                thumbnailData = response;
                libraryThumbnails.clear();
                renderLibraryPreviews(libraryItems, libraryRequestId);
                persistEditorState();
                setStatus(t('Character updated.', '角色已更新。'), false);
                return true;
            } catch (err) {
                if (isCurrent() && requestId === meshUpdateRequestId) {
                    setStatus(err?.message || t('Character update failed.', '角色更新失败。'), true);
                }
                return false;
            } finally {
                if (isCurrent() && requestId === meshUpdateRequestId) {
                    meshUpdatePending = false;
                    personSelect.disabled = busyActive;
                }
            }
        };

        const scheduleCharacterPreviewUpdate = () => {
            meshUpdatePending = true;
            personSelect.disabled = true;
            if (meshUpdateTimer) window.clearTimeout(meshUpdateTimer);
            meshUpdateTimer = window.setTimeout(() => {
                meshUpdateTimer = null;
                reloadCharacterPreview();
            }, 260);
        };

        const setModelRotationAxis = (axis, value) => {
            const rotation = activeModelRotation().slice();
            const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
            rotation[index] = value;
            if (viewerReady && viewer && typeof viewer.setModelRotation === 'function') {
                viewer.setModelRotation(rotation[0], rotation[1], rotation[2]);
                poseData = viewer.getPose?.() || Object.assign({}, poseData, { modelRotation: rotation });
            } else {
                poseData = Object.assign({}, poseData || {}, { modelRotation: rotation });
            }
            persistEditorState({ viewer_pose: poseData });
            syncControlValues();
        };

        const resetPoseControls = () => {
            if (viewerReady && viewer && typeof viewer.resetPose === 'function') {
                viewer.recordState?.();
                viewer.resetPose();
                poseData = viewer.getPose?.() || {};
                applyCameraToViewer(true);
            } else {
                poseData = {};
            }
            persistEditorState({ viewer_pose: poseData });
            syncControlValues();
            resetToeSliders();
            toeBaseRotations = {};
            if (activeToeSide) captureToeBaseRotation(activeToeSide);
            syncToeControls();
            if (activeHandSide && handPresets) {
                calibrateHandSliderDefaults(activeHandSide);
                syncHandControls();
            }
            setStatus(t('Pose reset.', '姿势已重置。'), false);
        };

        const resetCameraControls = () => {
            Object.assign(exportParams, {
                cam_zoom: 1.0,
                cam_distance: 1.0,
                cam_offset_x: 0,
                cam_offset_y: 0,
                cam_yaw_deg: 0,
                cam_pitch_deg: 0
            });
            applyCameraToViewer(true);
            persistCameraParams();
            syncControlValues();
            setStatus(t('Camera reset.', '相机已重置。'), false);
        };

        const stopImportStatusPolling = () => {
            if (importPollTimer) {
                window.clearInterval(importPollTimer);
                importPollTimer = null;
            }
        };

        const startImportStatusPolling = (taskId) => {
            stopImportStatusPolling();
            if (!isCurrent() || !taskId || typeof API.poseStudioImportStatus !== 'function') return;
            importPollTimer = window.setInterval(() => {
                if (!isCurrent()) return stopImportStatusPolling();
                API.poseStudioImportStatus({ task_id: taskId }).then((response) => {
                    if (!isCurrent() || !response?.ok) return;
                    const progress = Number(response.progress || 0);
                    const message = response.message || t('Parsing reference pose...', '正在解析参考姿势...');
                    setStatus(`${message}${Number.isFinite(progress) ? ` ${Math.round(progress)}%` : ''}`, response.status === 'error');
                    if (response.status === 'complete' || response.status === 'error') stopImportStatusPolling();
                }).catch(() => {});
            }, 800);
        };

        const showFallbackCanvas = (show) => {
            usingFallbackCanvas = !!show;
            if (fallbackCanvas) fallbackCanvas.hidden = !show;
            if (viewerCanvas) viewerCanvas.hidden = !!show;
        };

        const currentReferenceSrc = () => referenceSrc || referenceDataUrl || referenceAsset?.preview_url || referenceAsset?.data_url || referenceAsset?.thumb || '';

        const updateReferenceBackground = (src) => {
            if (!referenceBg) return;
            if (src) {
                referenceBg.src = studioAssetUrl(src);
                referenceBg.hidden = false;
            } else {
                referenceBg.removeAttribute('src');
                referenceBg.hidden = true;
            }
        };

        const applyPoseToViewer = (data, preserveCamera = true) => {
            if (!isCurrent() || !viewerReady || !viewer || !data || typeof data !== 'object') return false;
            const pose = Array.isArray(data.poses) ? (data.poses[0] || {}) : data;
            try {
                if (pose.bones || pose.modelRotation || pose.ikEffectorPositions) {
                    viewer.setPose(pose, preserveCamera);
                    const currentPose = viewer.getPose();
                    poseData = currentPose;
                    persistEditorState({ viewer_pose: currentPose, viewer_enabled: true });
                    syncControlValues();
                    toeBaseRotations = {};
                    if (activeToeSide) captureToeBaseRotation(activeToeSide);
                    syncToeControls();
                    if (activeHandSide && handPresets) {
                        calibrateHandSliderDefaults(activeHandSide);
                        syncHandControls();
                    }
                    return true;
                }
                if (pose.joint_coords || pose.joint_rotations || pose.canonical_keypoints_3d) {
                    const ok = viewer.applySAM3DImport(pose);
                    if (ok) {
                        const currentPose = viewer.getPose();
                        poseData = currentPose;
                        persistEditorState({
                            viewer_pose: currentPose,
                            viewer_enabled: true,
                            sam3d_pose_data: pose
                        });
                        syncControlValues();
                        toeBaseRotations = {};
                        if (activeToeSide) captureToeBaseRotation(activeToeSide);
                        syncToeControls();
                        if (activeHandSide && handPresets) {
                            calibrateHandSliderDefaults(activeHandSide);
                            syncHandControls();
                        }
                    }
                    return !!ok;
                }
            } catch (err) {
                console.warn('[SimpAI Pose Studio] apply pose failed:', err);
            }
            return false;
        };

        const drawCurrentReference = async () => {
            if (!isCurrent()) return false;
            const src = currentReferenceSrc();
            if (viewerReady && viewer) {
                updateReferenceBackground(src);
                if (typeof viewer.removeReferenceImage === 'function') viewer.removeReferenceImage();
                return !!src;
            }
            return drawReference(ctx, fallbackCanvas, src);
        };

        const syncPeopleControl = () => {
            const people = personScene?.people || [];
            peopleControl.hidden = people.length < 2;
            personSelect.replaceChildren(...people.map((person, index) => {
                const option = document.createElement('option');
                option.value = String(index);
                option.textContent = `${t('Person', '人物')} ${index + 1}`;
                return option;
            }));
            personSelect.value = String(personScene?.active || 0);
        };

        const syncSelectedPerson = () => {
            const person = personScene.people[personScene.active];
            if (!person) return;
            if (modal.contains(document.activeElement) && document.activeElement?.matches('input[type="range"]')) {
                document.activeElement.blur();
            }
            meshParams = { ...defaultMeshParams(), ...person.mesh_params };
            poseData = viewer.getPose();
            toeBaseRotations = {};
            resetToeSliders();
            if (activeToeSide) captureToeBaseRotation(activeToeSide);
            syncToeControls();
            if (activeHandSide && handPresets) calibrateHandSliderDefaults(activeHandSide);
            syncHandControls();
            syncControlValues();
            syncPeopleControl();
            applyCameraToViewer(true);
            persistEditorState({ viewer_pose: poseData, sam3d_pose_data: null, viewer_enabled: true });
        };

        const selectPerson = (index) => {
            if (busyActive || meshUpdatePending || !personScene) return;
            ++meshUpdateRequestId;
            if (meshUpdateTimer) window.clearTimeout(meshUpdateTimer);
            meshUpdateTimer = null;
            if (personScene.select(index, meshParams)) syncSelectedPerson();
        };
        personSelect.addEventListener('change', () => selectPerson(Number(personSelect.value)));
        viewerCanvas.addEventListener('pointerdown', (event) => {
            if (busyActive || !personScene) return;
            const index = personScene.pick(event);
            if (index >= 0 && index !== personScene.active) {
                event.preventDefault();
                event.stopImmediatePropagation();
                selectPerson(index);
            }
        }, true);

        const loadPersonScene = async (data) => {
            if (!isCurrent()) return;
            if (!viewerReady || !personScene) throw new Error(t('Pose viewer is unavailable.', '姿势编辑器尚未就绪。'));
            ++meshUpdateRequestId;
            if (meshUpdateTimer) window.clearTimeout(meshUpdateTimer);
            meshUpdateTimer = null;
            meshUpdatePending = false;
            await personScene.load(data, meshParams,
                params => {
                    if (!isCurrent()) throw new Error('Pose editor is closed.');
                    return API.poseStudioCharacterPreview(params);
                },
                (pose, params) => {
                    if (!isCurrent()) throw new Error('Pose editor is closed.');
                    return API.poseStudioRenderOverlay({ pose_data: pose, body_preset: { body_params: params }, pose_adjust: 0.0 });
                }
            );
            if (!isCurrent()) return;
            if (!data.projection) {
                Object.assign(exportParams, { cam_zoom: 1, cam_distance: 1, cam_offset_x: 0, cam_offset_y: 0, cam_yaw_deg: 0, cam_pitch_deg: 0 });
            }
            syncSelectedPerson();
            persistCameraParams();
        };

        const loadReferenceFile = async (file) => {
            if (!isCurrent() || !file) return;
            if (file.type && !String(file.type).startsWith('image/')) {
                setStatus(t('Please choose an image file.', '请选择图片文件。'), true);
                return;
            }
            setBusy(t('Loading reference image...', '正在载入参考图...'), true);
            try {
                const dataUrl = await readFileAsDataUrl(file);
                if (!isCurrent()) return;
                const size = await readImageSize(dataUrl);
                if (!isCurrent()) return;
                referenceDataUrl = dataUrl;
                regionSelector?.clear();
                referenceSrc = dataUrl;
                referenceAsset = null;
                referenceAssetSource = null;
                options.referenceImageDataUrl = dataUrl;
                options.referenceSrc = dataUrl;
                options.referenceAssetSource = null;
                if (size) {
                    exportParams.view_width = size.width;
                    exportParams.view_height = size.height;
                    applyCanvasResolution();
                    applyCameraToViewer(true);
                }
                referenceDrawn = await drawCurrentReference();
                if (!isCurrent()) return;
                setStatus(t('Reference image loaded. Click Parse to extract the pose.', '参考图已载入。点击解析提取姿势。'), false);
            } catch (err) {
                setStatus(err?.message || t('Reference load failed.', '参考图载入失败。'), true);
            } finally {
                setBusy('', false);
                if (isCurrent() && referenceFileInput) referenceFileInput.value = '';
            }
        };

        const renderSAMOverlayForPose = async (rawPose, options = {}) => {
            if (!isCurrent()) return { ok: false, mesh: null };
            if (!viewerReady || !viewer || typeof viewer.setSAMMeshOverlayData !== 'function') return { ok: false, mesh: null };
            if (!rawPose || typeof rawPose !== 'object' || typeof API.poseStudioRenderOverlay !== 'function') return { ok: false, mesh: null };
            const fitToOverlay = options.fitToOverlay !== false;
            try {
                setStatus(options.restoreCamera
                    ? t('Restoring SAM camera...', '正在恢复 SAM 相机...')
                    : t('Building SAM3D overlay...', '正在生成 SAM3D 对照网格...'), false);
                const response = await API.poseStudioRenderOverlay({
                    pose_data: rawPose,
                    body_preset: {
                        body_params: meshParams || defaultMeshParams()
                    },
                    pose_adjust: 0.0
                });
                if (!isCurrent() || !response?.ok || !response.mesh) return { ok: false, mesh: null };
                const ok = viewer.setSAMMeshOverlayData(response.mesh, rawPose,
                    options.restoreCamera ? editorState.sam3d_overlay_frame : null);
                if (ok && typeof viewer.setSAMMeshOverlayVisible === 'function') {
                    viewer.setSAMMeshOverlayVisible(true);
                }
                let fittedToOverlay = false;
                if (ok && fitToOverlay && typeof viewer.fitCurrentPoseToSAMMeshOverlay === 'function') {
                    fittedToOverlay = !!viewer.fitCurrentPoseToSAMMeshOverlay();
                    const fittedPose = viewer.getPose?.();
                    if (fittedPose) {
                        poseData = fittedPose;
                        persistEditorState({
                            viewer_pose: fittedPose,
                            viewer_enabled: true,
                            sam3d_pose_data: rawPose
                        });
                        syncControlValues();
                    }
                }
                persistEditorState({
                    sam3d_overlay_ready: !!ok,
                    sam3d_overlay_fit: fittedToOverlay,
                    sam3d_pose_data: rawPose,
                    sam3d_overlay_frame: ok ? {
                        pelvisWorld: viewer._samMeshOverlaySourceFrame.pelvisWorld.toArray(),
                        scale: viewer._samMeshOverlaySourceFrame.scale
                    } : null,
                    sam3d_overlay_mesh: ok ? { vertex_count: Array.isArray(response.mesh.vertices) ? response.mesh.vertices.length : 0 } : null
                });
                return { ok: !!ok, mesh: response.mesh, fitted: fittedToOverlay };
            } catch (err) {
                console.warn('[SimpAI Pose Studio] SAM3D overlay failed:', err);
                return { ok: false, mesh: null };
            }
        };

        const applySAM3DFrameCameraParams = (rawPose, meshData = null) => {
            if (!viewerReady || !viewer) return false;
            const result = applySAM3DFrameFitToViewer({
                viewer,
                rawPose,
                meshData,
                exportParams,
                applyCameraToViewer,
                persistCameraParams,
                onPoseUpdated(refreshedPose) {
                    poseData = refreshedPose;
                    persistEditorState({ viewer_pose: refreshedPose, viewer_enabled: true });
                    syncControlValues();
                }
            });
            if (result?.applied) {
                persistEditorState({ sam3d_projection_frame: viewer._samProjectionCameraFrame || null });
            }
            syncControlValues();
            return result || { applied: false, mode: '' };
        };

        const captureCurrentImage = () => {
            if (!usingFallbackCanvas && viewerReady && viewer && typeof viewer.capture === 'function') {
                const width = Number(exportParams.view_width) || 1024;
                const height = Number(exportParams.view_height) || 1024;
                const bg = Array.isArray(exportParams.bg_color) ? exportParams.bg_color : [255, 255, 255];
                const referencePlane = viewer.refPlane || null;
                const oldReferenceVisible = referencePlane ? referencePlane.visible : null;
                let captured = null;
                try {
                    if (referencePlane && !exportReferenceBackground) referencePlane.visible = false;
                    captured = viewer.capture(
                        width,
                        height,
                        Number(exportParams.cam_zoom) || 1.0,
                        bg,
                        Number(exportParams.cam_offset_x) || 0,
                        Number(exportParams.cam_offset_y) || 0,
                        Number(exportParams.cam_yaw_deg) || 0,
                        Number(exportParams.cam_pitch_deg) || 0,
                        Number(exportParams.cam_distance) || 1.0
                    );
                } finally {
                    if (referencePlane && oldReferenceVisible !== null) referencePlane.visible = oldReferenceVisible;
                }
                if (captured) return captured;
            }
            throw new Error(t('Pose viewer is unavailable.', '姿势编辑器尚未就绪。'));
        };

        const disposeViewer = () => {
            thumbnailViewer?.dispose();
            thumbnailViewer = null;
            viewportRotationDrag = null;
            cameraGestures = null;
            regionSelector?.dispose();
            regionSelector = null;
            spatialView?.dispose();
            spatialView = null;
            personScene?.clear();
            personScene = null;
            if (viewer && typeof viewer.dispose === 'function') {
                try {
                    viewer.dispose();
                } catch (err) {
                    console.warn('[SimpAI Pose Studio] viewer dispose failed:', err);
                }
            }
            viewer = null;
            viewerReady = false;
        };

        modal.__poseStudioCleanup = () => {
            closed = true;
            ++exportRequestId;
            ++meshUpdateRequestId;
            stopImportStatusPolling();
            ++libraryRequestId;
            ++poseLoadRequestId;
            if (librarySearchTimer) window.clearTimeout(librarySearchTimer);
            if (meshUpdateTimer) {
                window.clearTimeout(meshUpdateTimer);
                meshUpdateTimer = null;
            }
            if (canvasWrapResizeObserver) {
                canvasWrapResizeObserver.disconnect();
                canvasWrapResizeObserver = null;
            }
            window.removeEventListener('resize', handleCanvasWrapResize);
            disposeViewer();
        };

        const initializeViewer = async () => {
            if (!isCurrent()) return false;
            if (!viewerCanvas || typeof API.poseStudioCharacterPreview !== 'function') {
                showFallbackCanvas(true);
                return false;
            }
            setStatus(t('Loading PoseViewerCore...', '正在载入 PoseViewerCore...'), false);
            setBusy(t('Loading Pose Studio resources...', '正在载入 Pose Studio 资源...'), true);
            try {
                const [{ PoseViewerCore, PoseScene, PoseSpatialView, PoseRegionSelector, cameraKeyboardAction, cameraRotationPatch, cameraWheelPatch, libraryPoseCameraParams }, loadedHandPresets, modelData] = await Promise.all([
                    loadPoseViewerCore(),
                    loadHandPresets(),
                    API.poseStudioCharacterPreview(meshParams)
                ]);
                if (!isCurrent()) return false;
                handPresets = loadedHandPresets;
                cameraGestures = { cameraKeyboardAction, cameraRotationPatch, cameraWheelPatch };
                if (!PoseViewerCore) throw new Error('PoseViewerCore export is unavailable.');
                if (!modelData?.ok) throw new Error(modelData?.details || modelData?.error || 'character preview failed');
                thumbnailCore = PoseViewerCore;
                libraryCameraParams = libraryPoseCameraParams;
                thumbnailData = modelData;
                viewer = new PoseViewerCore(viewerCanvas, {
                    enableLighting: false,
                    enableMultiPass: false,
                    showReferenceImage: false,
                    showCaptureFrame: false,
                    matchViewportToCaptureCamera: true,
                    transparentBackground: true,
                    orbitEnabled: false,
                    syncMode: 'end',
                    skinMode: 'naked',
                    onRender: () => spatialView?.render(),
                    onHandHover: ({ side }) => {
                        if (!viewerReady || !viewer || busyActive) return;
                        if (side && typeof viewer.showHandHighlightRing === 'function') {
                            viewer.showHandHighlightRing(side);
                        } else if (activeHandSide && typeof viewer.showHandHighlightRing === 'function') {
                            viewer.showHandHighlightRing(activeHandSide);
                        } else if (typeof viewer.hideHandHighlightRing === 'function') {
                            viewer.hideHandHighlightRing();
                        }
                    },
                    onHandActivate: ({ side }) => {
                        activateHandSide(side).catch((err) => {
                            console.warn('[SimpAI Pose Studio] hand activation failed:', err);
                        });
                    },
                    onPoseChange: (pose) => {
                        if (personScene?.loading) return;
                        poseData = pose || {};
                        persistEditorState({ viewer_pose: poseData, viewer_enabled: true });
                        syncControlValues();
                    },
                    onError: (err) => console.warn('[SimpAI Pose Studio] viewer error:', err)
                });
                const initializingViewer = viewer;
                try {
                    await initializingViewer.init();
                } finally {
                    if (!isCurrent()) initializingViewer.dispose?.();
                }
                if (!isCurrent()) return false;
                viewer.loadData(modelData, true);
                viewer.setRenderStyle(renderStyle);
                personScene = new PoseScene(viewer);
                personScene.meshData = modelData;
                spatialView = new PoseSpatialView(modal.querySelector('[data-pose-studio-spatial]'), viewer, () => personScene, t, {
                    getParams: () => exportParams, apply: applyCameraGesturePatch, enabled: canControlCamera, keydown: handleCameraKey
                });
                regionSelector = new PoseRegionSelector(modal.querySelector('[data-pose-studio-regions]'), referenceBg, {
                    getMaximum: () => Number(maxPeopleInput.value),
                    onLimit: () => setStatus(t('Increase Maximum people or clear the existing regions.', '请提高“最大人数”或清除已有框选。'), true),
                    onChange: (selector) => {
                        stageEl.classList.toggle('is-selecting-people', selector.active);
                        selectRegionsButton.setAttribute('aria-pressed', String(selector.active));
                        selectRegionsButton.querySelector('span').textContent = selector.active ? t('Finish selection', '完成框选') : t('Select people', '框选人物');
                        clearRegionsButton.hidden = !selector.boxes.length;
                        setStatus(selector.boxes.length
                            ? t(`Selected ${selector.boxes.length} regions. Click Parse; clear regions to restore automatic detection.`, `已框选 ${selector.boxes.length} 人，点击解析。清除框选可恢复自动识别。`)
                            : (selector.active ? t('Drag a box around each person, then click Parse.', '拖动框住每个人物，再点击解析。') : t('Automatic person selection enabled.', '已恢复自动选择人物。')), false);
                    }
                });
                viewer.updateLights([{ type: 'ambient', color: '#ffffff', intensity: 1.0, x: 0, y: 0, z: 0 }]);
                viewerReady = true;
                applyClientMeshControls();
                showFallbackCanvas(false);
                await drawCurrentReference();
                if (!isCurrent()) return false;
                const initialScene = editorState.person_scene || (poseData.format === 'simpai_pose_scene' ? poseData : null);
                if (initialScene) {
                    await loadPersonScene(initialScene);
                    if (!isCurrent()) return false;
                    setStatus(t('Stored scene loaded.', '已载入上次的多人场景。'), false);
                    return true;
                }
                const initialPoseState = storedPoseForEditing(poseData, editorState);
                const initialPose = initialPoseState.pose || {};
                const appliedInitialPose = applyPoseToViewer(initialPose, true);
                if (hasStoredPose(initialPose) && !appliedInitialPose) throw new Error(t('Pose viewer is unavailable.', '姿势编辑器尚未就绪。'));
                if (appliedInitialPose && editorState.sam3d_projection_frame && exportParams.samApplyCamera) {
                    viewer.setSAMProjectionCameraFrame(editorState.sam3d_projection_frame);
                }
                applyCameraToViewer(true);
                syncControlValues();
                await activateHandSide(activeHandSide, false);
                if (!isCurrent()) return false;
                activateToeSide(activeToeSide);
                setStatus(appliedInitialPose ? t('Stored pose loaded.', '已载入上次姿态。') : t('PoseViewerCore ready.', 'PoseViewerCore 已就绪。'), false);
                return true;
            } catch (err) {
                if (!isCurrent()) return false;
                console.warn('[SimpAI Pose Studio] PoseViewerCore init failed, using fallback canvas:', err);
                disposeViewer();
                showFallbackCanvas(true);
                await drawReference(ctx, fallbackCanvas, currentReferenceSrc());
                if (!isCurrent()) return false;
                setStatus(err?.message || t('PoseViewerCore unavailable, using fallback canvas.', 'PoseViewerCore 不可用，已使用降级画布。'), true);
                return false;
            } finally {
                setBusy('', false);
                if (isCurrent() && viewerReady) renderLibraryPreviews(libraryItems, libraryRequestId);
            }
        };

        const renderLibraryPreviews = (items, requestId) => {
            if (!viewerReady || !thumbnailCore || !thumbnailData || !API.poseStudioLibraryGet) return;
            const generation = ++thumbnailRequestId;
            const active = () => isCurrent() && generation === thumbnailRequestId && requestId === libraryRequestId;
            thumbnailQueue = thumbnailQueue.then(async () => {
                for (const item of items) {
                    if (!active()) return;
                    if (item.source !== 'built_in') continue;
                    const key = `${item.id}:${item.revision || ''}:${renderStyle}:${libraryView.value}`;
                    let image = libraryThumbnails.get(key);
                    if (!image) {
                        const response = await API.poseStudioLibraryGet({ id: item.id });
                        if (!active()) return;
                        if (!response?.ok || !response.pose_data?.bones) continue;
                        if (!thumbnailViewer) {
                            const canvas = document.createElement('canvas');
                            canvas.width = 192; canvas.height = 256;
                            const instance = new thumbnailCore(canvas, {
                                enableLighting: false, enableMultiPass: false, showSkeletonHelper: false,
                                showCaptureFrame: false, showReferenceImage: false, orbitEnabled: false
                            });
                            thumbnailViewer = instance;
                            await instance.init();
                            if (!active()) {
                                instance.dispose();
                                if (thumbnailViewer === instance) thumbnailViewer = null;
                                return;
                            }
                            instance.updateLights([{ type: 'ambient', color: '#ffffff', intensity: 1 }]);
                        }
                        const v = thumbnailViewer;
                        v.loadData(thumbnailData, true);
                        v.setPose(response.pose_data, true);
                        v.setRenderStyle(renderStyle);
                        const view = LIBRARY_VIEWS[libraryView.value] || LIBRARY_VIEWS.current;
                        const camera = libraryCameraParams(v, response.pose_data, 192, 256, { ...view, key: libraryView.value });
                        image = v.capture(192, 256, camera.zoom, [255, 255, 255], camera.offset_x, camera.offset_y,
                            camera.yaw_deg, camera.pitch_deg, camera.distance_scale);
                        if (!active()) return;
                        if (libraryThumbnails.size >= 144) libraryThumbnails.delete(libraryThumbnails.keys().next().value);
                        libraryThumbnails.set(key, image);
                    }
                    const target = libraryList.querySelector(`[data-pose-id="${cssEscape(item.id)}"] [data-pose-library-preview]`);
                    if (target && image) {
                        const img = document.createElement('img'); img.src = image; img.alt = '';
                        target.replaceChildren(img);
                    }
                    await new Promise(window.requestAnimationFrame);
                }
            }).catch(error => {
                if (active()) console.warn('[SimpAI Pose Studio] library preview failed:', error);
            });
        };

        const setLibraryOptions = (select, entries, value, allLabel, counts = {}) => {
            const rows = allLabel ? [['', allLabel], ...entries] : entries;
            select.replaceChildren(...rows.map(([id, label]) => {
                const option = document.createElement('option'); option.value = id;
                option.textContent = `${t(label)}${id && counts[id] !== undefined ? ` (${counts[id]})` : ''}`;
                return option;
            }));
            if (rows.some(([id]) => id === value)) select.value = value;
        };
        const categoryOptions = (series) => {
            const keys = libraryTaxonomy.series.find(entry => entry.id === series)?.categories || Object.keys(libraryTaxonomy.categories);
            return keys.map(id => [id, libraryTaxonomy.categories[id]]);
        };
        const refreshLibrary = async () => {
            if (!isCurrent() || !libraryList || typeof API.poseStudioLibraryList !== 'function') return;
            const requestId = ++libraryRequestId;
            libraryList.innerHTML = `<div class="sai-pose-studio-empty">${escapeHtml(t('Loading...', '加载中...'))}</div>`;
            modal.querySelectorAll('[data-pose-library-page]').forEach(button => { button.disabled = true; });
            try {
                const response = await API.poseStudioLibraryList({ ...libraryFilters, offset: libraryOffset, limit: 24 });
                if (!isCurrent() || requestId !== libraryRequestId) return;
                if (!response?.ok) throw new Error(response?.error || t('Load failed.', '加载失败。'));
                if (response.taxonomy) {
                    libraryTaxonomy = response.taxonomy;
                    const series = libraryTaxonomy.series.some(entry => entry.id === libraryFilters.series) ? libraryFilters.series : '';
                    const category = categoryOptions(series).some(([id]) => id === libraryFilters.category) ? libraryFilters.category : '';
                    if (series !== libraryFilters.series || category !== libraryFilters.category) {
                        Object.assign(libraryFilters, { series, category });
                        libraryOffset = 0;
                        persistEditorState();
                        return refreshLibrary();
                    }
                }
                libraryItems = response.items || [];
                const total = Number(response.total ?? libraryItems.length);
                if (!libraryItems.length && libraryOffset > 0) {
                    libraryOffset = Math.max(0, Math.ceil(total / 24) - 1) * 24;
                    return refreshLibrary();
                }
                libraryTaxonomy = response.taxonomy || libraryTaxonomy;
                setLibraryOptions(librarySeries, libraryTaxonomy.series.map(entry => [entry.id, entry.label]), libraryFilters.series, 'All series', response.series_counts);
                setLibraryOptions(libraryCategory, categoryOptions(libraryFilters.series), libraryFilters.category, 'All categories', response.category_counts);
                libraryNextOffset = response.next_offset ?? null;
                libraryCount.textContent = `${total ? libraryOffset + 1 : 0}-${libraryOffset + libraryItems.length} / ${total}`;
                modal.querySelector('[data-pose-library-page="previous"]').disabled = libraryOffset === 0;
                modal.querySelector('[data-pose-library-page="next"]').disabled = libraryNextOffset === null;
                libraryList.innerHTML = renderLibraryItems(libraryItems);
                libraryList.scrollTop = 0;
                libraryList.querySelector(`[data-pose-id="${cssEscape(editorState.library_pose_id || '')}"]`)?.setAttribute('aria-current', 'true');
                renderLibraryPreviews(libraryItems, requestId);
            } catch (error) {
                if (isCurrent() && requestId === libraryRequestId) {
                    libraryItems = [];
                    libraryCount.textContent = '';
                    libraryList.innerHTML = `<div class="sai-pose-studio-empty">${escapeHtml(error.message)}</div>`;
                }
            }
        };

        const changeLibraryFilter = () => {
            Object.assign(libraryFilters, { query: librarySearch.value.trim(), source: librarySource.value,
                series: librarySeries.value, category: libraryCategory.value });
            libraryOffset = 0;
            persistEditorState();
            refreshLibrary();
        };
        librarySearch.addEventListener('input', () => {
            ++libraryRequestId;
            window.clearTimeout(librarySearchTimer);
            librarySearchTimer = window.setTimeout(changeLibraryFilter, 180);
        });
        librarySource.addEventListener('change', changeLibraryFilter);
        libraryCategory.addEventListener('change', changeLibraryFilter);
        librarySeries.addEventListener('change', () => {
            setLibraryOptions(libraryCategory, categoryOptions(librarySeries.value), '', 'All categories');
            changeLibraryFilter();
        });
        libraryView.addEventListener('change', () => {
            libraryFilters.view = libraryView.value;
            const view = LIBRARY_VIEWS[libraryView.value];
            if (libraryCameraPose && libraryCameraParams) {
                applyLibraryCamera(libraryCameraPose, view);
                applyCameraToViewer(true);
            } else if (view?.yaw !== undefined) applyCameraGesturePatch({ cam_yaw_deg: view.yaw, cam_pitch_deg: view.pitch });
            persistEditorState();
            renderLibraryPreviews(libraryItems, libraryRequestId);
        });
        modal.querySelectorAll('[data-pose-library-page]').forEach(button => button.addEventListener('click', () => {
            libraryOffset = button.dataset.poseLibraryPage === 'next' ? libraryNextOffset : Math.max(0, libraryOffset - 24);
            refreshLibrary();
        }));
        libraryList.addEventListener('keydown', event => {
            if (!['Enter', ' '].includes(event.key) || event.target.hasAttribute('data-pose-library-action')) return;
            if (!event.target.matches('[data-pose-id]')) return;
            event.preventDefault(); event.target.click();
        });

        const applyLibraryCamera = (pose, view = LIBRARY_VIEWS[libraryView.value] || LIBRARY_VIEWS.current) => {
            const camera = libraryCameraParams(viewer, pose, exportParams.view_width, exportParams.view_height, { ...view, key: libraryView.value });
            Object.assign(exportParams, {
                cam_zoom: camera.zoom, cam_offset_x: camera.offset_x, cam_offset_y: camera.offset_y,
                cam_yaw_deg: camera.yaw_deg, cam_pitch_deg: camera.pitch_deg, cam_distance: camera.distance_scale
            });
            syncControlValues();
        };
        const loadPose = async (poseId) => {
            if (!isCurrent() || !poseId || typeof API.poseStudioLibraryGet !== 'function') return;
            const requestId = ++poseLoadRequestId;
            let response;
            try { response = await API.poseStudioLibraryGet({ id: poseId }); }
            catch (error) {
                if (isCurrent() && requestId === poseLoadRequestId) setStatus(error.message, true);
                return;
            }
            if (!isCurrent() || requestId !== poseLoadRequestId) return;
            if (!response?.ok) {
                setStatus(response?.error || t('Pose load failed.', '姿势加载失败。'), true);
                return;
            }
            poseData = response.pose_data || {};
            libraryCameraPose = response.source === 'built_in' && poseData.cameraParams
                ? { cameraParams: { ...poseData.cameraParams }, cameraViews: poseData.cameraViews,
                    _library: { series: poseData._library?.series } } : null;
            persistEditorState({ library_camera_defaults: libraryCameraPose });
            if (viewerReady && Object.hasOwn(RENDER_STYLES, poseData.render_style)) applyRenderStyle(poseData.render_style);
            editorState = Object.assign({}, editorState, { library_pose_id: poseId, library_pose_name: response.name || '', library_pose_source: response.source || '' });
            libraryList.querySelectorAll('[data-pose-id]').forEach(card => card.setAttribute('aria-current', String(card.dataset.poseId === poseId)));
            if (poseData.format === 'simpai_pose_scene') {
                setBusy(t('Loading pose scene...', '正在载入姿势场景...'), true);
                try {
                    await loadPersonScene(poseData);
                    if (!isCurrent()) return;
                    setStatus(response.name || poseId, false);
                } catch (err) {
                    if (!isCurrent()) return;
                    showFallbackCanvas(true);
                    setStatus(err.message, true);
                } finally {
                    setBusy('', false);
                }
                return;
            }
            personScene?.clear();
            viewer?.skinnedMesh?.position.set(0, 0, 0);
            viewer?.clearSAMMeshOverlay?.();
            syncPeopleControl();
            persistEditorState({ sam3d_pose_data: null, sam3d_projection_frame: null });
            if (!applyPoseToViewer(poseData, true)) {
                drawFallbackPose(ctx, fallbackCanvas.width, fallbackCanvas.height);
                showFallbackCanvas(true);
                setBusy('', false);
                setStatus(t('Pose viewer is unavailable.', '姿势编辑器尚未就绪。'), true);
                return;
            }
            showFallbackCanvas(false);
            if (libraryCameraPose && libraryCameraParams) applyLibraryCamera(libraryCameraPose);
            applyCameraToViewer(true);
            setBusy('', false);
            setStatus(response.source === 'built_in' ? t(response.name || poseId) : response.name || poseId, false);
        };

        const renameLibraryPose = async (poseId) => {
            if (!isCurrent() || !poseId || typeof API.poseStudioLibraryRename !== 'function') return;
            const currentName = poseId.split('/').pop()?.replace(/\.[^.]+$/, '') || '';
            const nextName = window.prompt(t('Rename pose', '重命名姿势'), currentName);
            if (!nextName || nextName.trim() === currentName) return;
            const response = await API.poseStudioLibraryRename({ id: poseId, name: nextName.trim() });
            if (!isCurrent()) return;
            if (!response?.ok) {
                setStatus(response?.details || response?.error || t('Pose rename failed.', '姿势重命名失败。'), true);
                return;
            }
            if (editorState.library_pose_id === poseId) {
                editorState = Object.assign({}, editorState, {
                    library_pose_id: response.id || '',
                    library_pose_name: response.name || nextName.trim(),
                    library_pose_source: 'user'
                });
            }
            setStatus(t('Pose renamed.', '姿势已重命名。'), false);
            refreshLibrary();
        };

        const deleteLibraryPose = async (poseId) => {
            if (!isCurrent() || !poseId || typeof API.poseStudioLibraryDelete !== 'function') return;
            if (!window.confirm(t('Delete this saved pose?', '删除这个已保存姿势？'))) return;
            const response = await API.poseStudioLibraryDelete({ id: poseId });
            if (!isCurrent()) return;
            if (!response?.ok) {
                setStatus(response?.details || response?.error || t('Pose delete failed.', '姿势删除失败。'), true);
                return;
            }
            if (editorState.library_pose_id === poseId) {
                editorState = Object.assign({}, editorState, {
                    library_pose_id: '',
                    library_pose_name: '',
                    library_pose_source: ''
                });
            }
            setStatus(t('Pose deleted from user library.', '姿势已从用户姿势库删除。'), false);
            refreshLibrary();
        };

        const parseReference = async () => {
            if (!isCurrent() || busyActive || !viewerReady) return;
            if (typeof API.poseStudioImportReference !== 'function') {
                setStatus('Pose Studio import API is not loaded.', true);
                return;
            }
            if (!readMaxPeople()) {
                modal.querySelector('[data-pose-studio-advanced]').open = true;
                maxPeopleInput.reportValidity();
                setStatus(t('Maximum people must be a positive integer.', '最大人数必须为正整数。'), true);
                return;
            }
            const manualRegions = regionSelector?.getBoxes() || [];
            if ((regionSelector?.active && !manualRegions.length) || manualRegions.length > maxPeople) {
                setStatus(t('Draw a person region within the maximum count, or clear regions for automatic selection.', '请在最大人数范围内框选人物，或清除框选后自动识别。'), true);
                return;
            }
            if (regionSelector?.active) regionSelector.setActive(false);
            const taskId = createImportTaskId(options.node?.id || options.nodeId);
            const payload = {
                project_id: options.projectId || 'default',
                node_id: options.node?.id || options.nodeId || '',
                task_id: taskId,
                max_people: maxPeople,
                person_selection: personSelection,
                asset_source: referenceAssetSource || (referenceAsset ? {
                    node_id: options.node?.id || options.nodeId || '',
                    type: 'pose_reference',
                    title: t('Pose reference', '姿势参考图'),
                    asset: referenceAsset,
                    source: { kind: 'pose_studio_reference' }
                } : null)
            };
            if (manualRegions.length) payload.person_regions = manualRegions;
            if (!payload.asset_source && referenceDataUrl) {
                payload.image_data_url = referenceDataUrl;
            }
            if (!payload.asset_source && !payload.image_data_url) {
                setStatus(t('Connect or load a reference image first.', '请先连接或载入参考图。'), true);
                return;
            }
            setStatus(t('Parsing reference pose...', '正在解析参考姿势...'), false);
            setBusy(t('Parsing reference pose...', '正在解析参考姿势...'), true);
            startImportStatusPolling(taskId);
            try {
                const response = await API.poseStudioImportReference(payload);
                if (!isCurrent()) return;
                stopImportStatusPolling();
                if (!response?.ok) {
                    setStatus(response?.error_code === 'no_people_detected'
                        ? t('No person detected; reconstruction has not started. Select people manually, then parse again.', '未检测到人物，尚未重建。请框选目标人物后再次解析。')
                        : response?.error_code === 'resource_missing'
                            ? t('SAM3D models are missing. Install them through model management, then retry.', '缺少 SAM3D 模型，请通过模型管理安装后重试。')
                        : (response?.details || response?.error || t('Pose import failed.', '姿势解析失败。')), true);
                    return;
                }
                poseData = response.pose_data || {};
                libraryCameraPose = null;
                persistEditorState({ library_camera_defaults: null });
                referenceAsset = response.reference_asset || referenceAsset || null;
                referenceAssetSource = null;
                if (!referenceSrc && referenceAsset) referenceSrc = referenceAsset.preview_url || referenceAsset.data_url || referenceAsset.thumb || '';
                persistEditorState({
                    sam3d_task_id: taskId,
                    sam3d_imported_at: response.imported_at || '',
                    sam3d_import_source: 'reference_image'
                });
                const rawPoseData = poseData;
                const limitText = personLimitStatusText(response);
                if (rawPoseData.format === 'simpai_pose_scene') {
                    await loadPersonScene(rawPoseData);
                    if (!isCurrent()) return;
                    referenceDrawn = await drawCurrentReference();
                    if (!isCurrent()) return;
                    setStatus(limitText || `${t('People parsed:', '已解析人物：')}${personScene.people.length}${t('. Select a person to edit; export includes everyone.', '。选择人物分别编辑，导出时包含所有人。')}`, false);
                    return;
                }
                personScene?.clear();
                viewer?.skinnedMesh?.position.set(0, 0, 0);
                viewer?.clearSAMMeshOverlay?.();
                syncPeopleControl();
                const summary = poseDataSummary(rawPoseData);
                const appliedToViewer = applyPoseToViewer(rawPoseData, true);
                showFallbackCanvas(!appliedToViewer);
                if (!appliedToViewer) {
                    setStatus(t('Pose viewer is unavailable.', '姿势编辑器尚未就绪。'), true);
                    return;
                }
                const overlayResult = appliedToViewer ? await renderSAMOverlayForPose(rawPoseData) : { ok: false, mesh: null };
                if (!isCurrent()) return;
                const frameFitResult = appliedToViewer ? applySAM3DFrameCameraParams(rawPoseData, overlayResult.mesh || null) : { applied: false };
                const frameFitReady = !!frameFitResult.applied;
                referenceDrawn = await drawCurrentReference();
                if (!isCurrent()) return;
                const viewerText = appliedToViewer ? t(' Applied to mannequin.', ' 已应用到人偶。') : '';
                const overlayText = overlayResult.ok ? t(' Overlay ready.', ' 对照网格已就绪。') : '';
                const frameText = frameFitReady
                    ? (frameFitResult.mode === 'sam_projection' ? t(' SAM camera angle applied.', ' 已应用 SAM 相机角度。') : t(' Frame fit applied.', ' 构图已适配。'))
                    : (frameFitResult.skipped ? t(' Close-up detected; camera fit skipped to avoid broken framing.', ' 检测到近景；已跳过相机自动拉近，避免构图错位。') : '');
                setStatus(limitText || (summary ? `${t('Reference pose parsed.', '参考姿势已解析。')} ${summary}${viewerText}${overlayText}${frameText}` : `${t('Reference pose parsed.', '参考姿势已解析。')}${viewerText}${overlayText}${frameText}`), false);
            } catch (err) {
                setStatus(err?.message || t('Pose import failed.', '姿势解析失败。'), true);
            } finally {
                stopImportStatusPolling();
                setBusy('', false);
            }
        };

        const closeLibrarySave = () => {
            librarySaveForm.hidden = true;
            modal.querySelector('[data-pose-library-filters]').hidden = false;
        };
        const openLibrarySave = () => {
            if (!viewerReady || busyActive) return;
            const selected = libraryItems.find(item => item.id === editorState.library_pose_id);
            libraryName.value = editorState.library_pose_name || options.node?.title || 'pose';
            setLibraryOptions(librarySaveSeries, libraryTaxonomy.series.map(entry => [entry.id, entry.label]), selected?.series_id || libraryFilters.series || 'full_standard');
            setLibraryOptions(librarySaveCategory, categoryOptions(librarySaveSeries.value), selected?.category_id || libraryFilters.category || 'other');
            modal.querySelector('[data-pose-library-filters]').hidden = true;
            librarySaveForm.hidden = false;
            libraryName.focus(); libraryName.select();
        };
        librarySaveSeries.addEventListener('change', () => setLibraryOptions(librarySaveCategory, categoryOptions(librarySaveSeries.value), 'other'));
        modal.querySelector('[data-pose-library-cancel]').addEventListener('click', closeLibrarySave);
        librarySaveForm.addEventListener('submit', event => { event.preventDefault(); savePoseToLibrary(); });
        const savePoseToLibrary = async () => {
            if (!isCurrent() || busyActive || !viewerReady) return;
            if (typeof API.poseStudioLibrarySave !== 'function') {
                setStatus('Pose Studio library save API is not loaded.', true);
                return;
            }
            const name = libraryName.value.trim();
            if (!name) return;
            poseData = viewer.getPose();
            let previewDataUrl = '';
            try {
                previewDataUrl = captureCurrentImage();
            } catch (err) {
                previewDataUrl = '';
            }
            persistEditorState();
            setBusy(t('Saving pose...'), true);
            let response;
            try {
                response = await API.poseStudioLibrarySave({
                    name,
                    category: 'Saved',
                    ...(librarySaveSeries.value && librarySaveCategory.value ? {
                        classification: { series: librarySaveSeries.value, category: librarySaveCategory.value }
                    } : {}),
                    pose_data: Object.assign({}, personScene?.serialize(meshParams) || poseData, { render_style: renderStyle }),
                    editor_state: editorState,
                    preview_data_url: previewDataUrl
                });
            } catch (error) {
                if (isCurrent()) setStatus(error.message, true);
                return;
            } finally { setBusy('', false); }
            if (!isCurrent()) return;
            if (!response?.ok) {
                setStatus(response?.details || response?.error || t('Pose save failed.', '姿势保存失败。'), true);
                return;
            }
            editorState = Object.assign({}, editorState, {
                library_pose_id: response.id || '',
                library_pose_name: response.name || name,
                library_pose_source: 'user'
            });
            closeLibrarySave();
            librarySource.value = 'user';
            librarySearch.value = '';
            librarySeries.value = ''; libraryCategory.value = '';
            Object.assign(libraryFilters, { source: 'user', query: '', series: '', category: '' });
            libraryOffset = 0;
            persistEditorState();
            setStatus(t('Pose saved to user library.', '姿势已保存到用户姿势库。'), false);
            refreshLibrary();
        };

        const exportPose = async () => {
            if (!isCurrent() || busyActive) return;
            if (typeof API.poseStudioExport !== 'function') {
                setStatus('Pose Studio API is not loaded.', true);
                return;
            }
            let imageDataUrl = '';
            try {
                imageDataUrl = captureCurrentImage();
            } catch (err) {
                setStatus(err?.message || 'Canvas export failed.', true);
                return;
            }
            if (viewerReady && viewer && typeof viewer.getPose === 'function') {
                const currentPose = viewer.getPose() || poseData || {};
                if (hasStoredPose(currentPose)) {
                    poseData = currentPose;
                    persistEditorState({ viewer_pose: currentPose, viewer_enabled: true });
                }
            }
            persistCameraParams();
            const requestId = ++exportRequestId;
            const response = await API.poseStudioExport({
                project_id: options.projectId || 'default',
                node_id: options.node?.id || options.nodeId || '',
                image_data_url: imageDataUrl,
                pose_data: Object.assign({}, personScene?.serialize(meshParams) || poseData, { render_style: renderStyle }),
                editor_state: Object.assign({}, editorState, {
                    reference_drawn: referenceDrawn,
                    viewer_enabled: viewerReady,
                    export_reference_background: exportReferenceBackground
                }),
                reference_asset: referenceAsset || null,
            });
            if (!isCurrent() || requestId !== exportRequestId) return;
            if (!response?.ok) {
                setStatus(response?.details || response?.error || t('Export failed.', '导出失败。'), true);
                return;
            }
            call(options, 'onConfirm', response);
            if (isCurrent()) closeActiveModal();
        };

        controlSliders.forEach((slider) => {
            slider.addEventListener('input', () => {
                const key = slider.getAttribute('data-pose-studio-slider') || '';
                const def = controlDefByKey.get(key);
                if (!def) return;
                const min = Number(def.min);
                const max = Number(def.max);
                let value = Number(slider.value);
                if (!Number.isFinite(value)) value = Number(def.def) || 0;
                if (Number.isFinite(min)) value = Math.max(min, value);
                if (Number.isFinite(max)) value = Math.min(max, value);
                slider.value = String(value);
                updateControlValue(key, value);
                if (def.group === 'rotation') {
                    setModelRotationAxis(def.axis, value);
                    return;
                }
                if (def.group === 'camera') {
                    applyCameraControlValue(key, value, true);
                    return;
                }
                meshParams[key] = value;
                persistEditorState();
                if (def.group === 'proportion' && applyClientMeshControl(key, value)) {
                    poseData = viewer?.getPose?.() || poseData;
                    persistEditorState({ viewer_pose: poseData });
                    return;
                }
                scheduleCharacterPreviewUpdate();
            });
        });

        handSliders.forEach((slider) => {
            slider.addEventListener('input', () => {
                const key = slider.getAttribute('data-pose-studio-hand-slider') || '';
                if (!handSliderDefByKey.has(key)) return;
                const value = clampHandSliderValue(key, slider.value);
                slider.value = String(value);
                if (key === 'grasp') {
                    const oldGrasp = clampHandSliderValue('grasp', handSliderValues.grasp);
                    handSliderValues.grasp = value;
                    const epsilon = 1e-9;
                    FINGER_PREFIXES.forEach((prefix) => {
                        const current = clampHandSliderValue(prefix, handSliderValues[prefix]);
                        let nextValue;
                        if (value >= oldGrasp) {
                            const denom = 1 - oldGrasp;
                            nextValue = denom < epsilon ? 1 : current + ((value - oldGrasp) * (1 - current) / denom);
                        } else {
                            nextValue = oldGrasp < epsilon ? 0 : current * (value / oldGrasp);
                        }
                        handSliderValues[prefix] = Math.max(0, Math.min(1, nextValue));
                    });
                } else {
                    handSliderValues[key] = value;
                }
                HAND_SLIDERS.forEach((def) => updateHandControlValue(def.key, handSliderValues[def.key] ?? def.def));
                applyActiveHandSliders();
            });
        });

        handSideButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const side = button.getAttribute('data-pose-studio-hand-side') || '';
                activateHandSide(side).catch((err) => {
                    console.warn('[SimpAI Pose Studio] hand side switch failed:', err);
                });
            });
        });

        toeSliders.forEach((slider) => {
            slider.addEventListener('input', () => {
                const key = slider.getAttribute('data-pose-studio-toe-slider') || '';
                if (!toeSliderDefByKey.has(key)) return;
                const value = clampToeSliderValue(key, slider.value);
                slider.value = String(value);
                toeSliderValues[key] = value;
                updateToeControlValue(key, value);
                applyActiveToeSliders();
            });
        });

        toeSideButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const side = button.getAttribute('data-pose-studio-toe-side') || '';
                activateToeSide(side);
            });
        });

        genderButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const value = Number(button.getAttribute('data-pose-studio-gender'));
                meshParams.gender = Number.isFinite(value) ? value : 0.5;
                persistEditorState();
                syncControlValues();
                scheduleCharacterPreviewUpdate();
            });
        });

        modal.addEventListener('click', (evt) => {
            if (!isCurrent()) return;
            if (evt.target === modal || evt.target.closest('[data-pose-studio-close]')) {
                closeActiveModal();
                call(options, 'onClose');
                return;
            }
            const action = evt.target.closest('[data-pose-studio-action]')?.getAttribute('data-pose-studio-action') || '';
            if (action === 'reset-pose') {
                resetPoseControls();
                return;
            }
            if (action === 'help') {
                evt.preventDefault();
                evt.stopPropagation();
                if (helpEl) helpEl.hidden = !helpEl.hidden;
                return;
            }
            if (action === 'reset-hand') {
                resetHandSliders();
                applyActiveHandSliders();
                persistHandControls();
                return;
            }
            if (action === 'reset-toes') {
                resetToeSliders();
                applyActiveToeSliders();
                persistToeControls();
                return;
            }
            if (action === 'reset-camera') {
                resetCameraControls();
                return;
            }
            if (action === 'status' && typeof API.poseStudioStatus === 'function') {
                setStatus(t('Checking Pose Studio resources...', '正在检查 Pose Studio 资源...'), false);
                API.poseStudioStatus({}).then((response) => {
                    setStatus(poseStudioResourceStatusText(response), !response?.available || !!response?.sam3d?.dependency_error);
                }).catch((err) => {
                    setStatus(err?.message || t('Pose Studio status unavailable.', 'Pose Studio 状态不可用。'), true);
                });
                return;
            }
            if (action === 'reference') {
                if (referenceFileInput) {
                    referenceFileInput.click();
                    return;
                }
                drawCurrentReference().then((ok) => {
                    referenceDrawn = !!ok;
                    setStatus(ok ? t('Reference loaded.', '参考图已载入。') : t('Default pose ready.', '默认姿势已就绪。'), false);
                });
                return;
            }
            if (action === 'parse-reference') {
                parseReference();
                return;
            }
            if (action === 'select-regions') {
                if (!currentReferenceSrc() || !regionSelector) {
                    setStatus(t('Load a reference image and wait for the editor to be ready.', '请载入参考图并等待编辑器就绪。'), true);
                    return;
                }
                regionSelector.setActive(!regionSelector.active);
                return;
            }
            if (action === 'clear-regions') {
                regionSelector?.clear();
                return;
            }
            if (action === 'save-library') {
                openLibrarySave();
                return;
            }
            if (action === 'refresh-library') {
                refreshLibrary();
                return;
            }
            if (action === 'export') {
                exportPose();
                return;
            }
            const libraryAction = evt.target.closest('[data-pose-library-action]');
            if (libraryAction) {
                evt.preventDefault();
                evt.stopPropagation();
                const poseId = libraryAction.closest('[data-pose-id]')?.getAttribute('data-pose-id') || '';
                const libraryActionName = libraryAction.getAttribute('data-pose-library-action') || '';
                if (libraryActionName === 'rename') renameLibraryPose(poseId);
                if (libraryActionName === 'delete') deleteLibraryPose(poseId);
                return;
            }
            const poseButton = evt.target.closest('[data-pose-id]');
            if (poseButton) loadPose(poseButton.getAttribute('data-pose-id'));
        });

        referenceFileInput?.addEventListener('change', () => {
            loadReferenceFile(referenceFileInput.files?.[0] || null);
        });

        showFallbackCanvas(true);
        drawReference(ctx, fallbackCanvas, currentReferenceSrc()).then((ok) => {
            if (!isCurrent()) return false;
            referenceDrawn = !!ok;
            setStatus(ok
                ? t('Reference loaded.', '参考图已载入。')
                : t('Default pose ready.', '默认姿势已就绪。'), false);
            return ok;
        });
        initializeViewer();
        refreshLibrary();
        return modal;
    }

    window.SimpAIPoseStudioEditor = {
        open,
        openScenePreset: openScenePresetBridge,
        close: closeActiveModal,
        closeScenePreset: clearScenePresetBridge,
        refreshSceneBridge,
        __runSAM3DFrameFitSmoke: runSAM3DFrameFitSmoke
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachScenePresetBridge, { once: true });
    } else {
        attachScenePresetBridge();
    }
})();
