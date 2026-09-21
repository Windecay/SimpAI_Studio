(function () {
    'use strict';

    function createCanvasMediaBrowserActionController(context) {
        const scope = context?.mediaBrowserActionSource || context || {};
        const stateSource = scope.stateSource || {};
        const metadataSource = scope.metadataSource || {};
        const targetSource = scope.targetSource || {};
        const browserSource = scope.browserSource || {};
        const networkSource = scope.networkSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const metadataCall = (name, ...args) => call(metadataSource, name, undefined, ...args);
        const center = () => call(stateSource, 'viewportCenterWorld', { x: 0, y: 0 });
        const getDeleteApi = () => call(networkSource, 'getMediaGalleryDeleteApi', null);
        const toast = text => call(uiSource, 'showToast', undefined, text);
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };

        async function copyMediaBrowserItemPrompt(item) {
            const prompt = metadataCall('mediaBrowserItemPrompt', item);
            if (!prompt) return false;
            try {
                await call(browserSource, 'writeClipboardText', undefined, prompt);
                toast(t('Prompt copied.', '提示词已复制。'));
                return true;
            } catch (err) {
                toast(t('Copy failed.', '复制失败。'));
                return false;
            }
        }

        function applyMediaBrowserPromptToTarget(item, getWorld) {
            const metadata = metadataCall('mediaBrowserItemMetadata', item);
            const prompt = metadataCall('mediaBrowserItemPrompt', item);
            if (!prompt) {
                toast(t('Selected media has no prompt metadata.', '选中的媒体没有提示词元数据。'));
                return false;
            }
            const target = call(targetSource, 'resolveGenerationPromptTarget', null, null, getWorld());
            if (!target) {
                toast(t('Select a Preset/Classic generator node first.', '请先选中一个 Preset/Classic 生成节点。'));
                return false;
            }
            return call(targetSource, 'applyGenerationMetadataToPromptTarget', false, target, Object.assign({}, metadata, {
                prompt,
                negative_prompt: metadataCall('mediaBrowserItemNegativePrompt', item) || metadata.negative_prompt || ''
            }), { sourceLabel: item?.name || item?.title || 'media browser' });
        }

        function applyMediaBrowserItemPromptToTarget(item, state) {
            return applyMediaBrowserPromptToTarget(item, () => state?.world || center());
        }

        async function copySelectedMediaBrowserPrompt(modal) {
            const item = call(stateSource, 'selectedMediaBrowserItem', null, modal);
            await copyMediaBrowserItemPrompt(item);
        }

        function applySelectedMediaBrowserPromptToTarget(modal) {
            const item = call(stateSource, 'selectedMediaBrowserItem', null, modal);
            return applyMediaBrowserPromptToTarget(item, () => {
                const state = modal.__mediaBrowserState || call(stateSource, 'mediaBrowserInitialState', {}, center());
                return state.world || center();
            });
        }

        async function deleteLocalMediaBrowserItem(item, state) {
            if (!item || state?.tab === 'danbooru') return false;
            if (typeof getDeleteApi() !== 'function') {
                toast(t('Media delete API is not loaded.', '媒体删除接口未加载。'));
                return false;
            }
            const rel = String(item.relative_path || item.id || '').trim();
            if (!rel) {
                toast(t('Selected media has no local relative path.', '选中的媒体没有本地相对路径。'));
                return false;
            }
            const ok = call(browserSource, 'confirm', false,
                `${t('Delete this local file from disk?', '确定从磁盘删除这个本地文件吗？')}\n\n${item.name || rel}`);
            if (!ok) return false;
            const response = await getDeleteApi()({
                ids: [rel],
                media_type: state.mediaType || item.media_type || 'image'
            });
            if (!response?.ok) {
                const detail = response?.errors?.[0]?.error || response?.details || response?.error || t('unknown error', '未知错误');
                toast(`${t('Delete failed:', '删除失败：')} ${detail}`);
                return false;
            }
            toast(t('Local media file deleted.', '本地媒体文件已删除。'));
            return true;
        }

        return {
            copyMediaBrowserItemPrompt, applyMediaBrowserItemPromptToTarget, deleteLocalMediaBrowserItem,
            copySelectedMediaBrowserPrompt, applySelectedMediaBrowserPromptToTarget
        };
    }

    window.SimpAICanvasWorkbenchMediaBrowserAction = Object.assign(
        {}, window.SimpAICanvasWorkbenchMediaBrowserAction || {}, { createCanvasMediaBrowserActionController }
    );
})();
