(function () {
    'use strict';

    function createCanvasMiniMaxH3StoryboardPresetData(context) {
        const scope = context?.miniMaxH3StoryboardPresetDataSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const editorSource = scope.editorSource || {};
        const stateSource = scope.stateSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const getSlotOrder = () => {
            const value = call(nodeSource, 'getSlotOrder', []);
            return Array.isArray(value) ? value : [];
        };
        const getPresetUploadRunEdges = node => {
            const value = call(nodeSource, 'getPresetUploadRunEdges', [], node);
            return Array.isArray(value) ? value : [];
        };
        const getUploadSlotMediaKind = slot => call(nodeSource, 'getUploadSlotMediaKind', '', slot);
        const getNode = id => call(nodeSource, 'getNode', null, id);
        const getSelectedResultAsset = node => call(nodeSource, 'getSelectedResultAsset', null, node);
        const getStoryboardEditor = () => call(editorSource, 'getStoryboardEditor', null);

        function h3StoryboardVlmReferencesForPreset(node) {
            const counts = { image: 0, video: 0, audio: 0 };
            const tokenNames = { image: 'Picture', video: 'Video', audio: 'Audio' };
            const slotOrder = getSlotOrder();
            return getPresetUploadRunEdges(node)
                .slice()
                .sort((left, right) => slotOrder.indexOf(left?.slot || '') - slotOrder.indexOf(right?.slot || ''))
                .map(edge => {
                    const kind = getUploadSlotMediaKind(edge?.slot || '');
                    const sourceNode = getNode(edge?.from);
                    const asset = sourceNode?.type === 'result' ? getSelectedResultAsset(sourceNode) : sourceNode?.asset;
                    if (!sourceNode || !asset || !tokenNames[kind]) return null;
                    counts[kind] += 1;
                    return {
                        kind,
                        token: '<' + tokenNames[kind] + ' ' + counts[kind] + '>',
                        slot: edge?.slot || '',
                        node: sourceNode,
                        asset,
                        label: String(sourceNode?.title || sourceNode?.name || edge?.slot || '').trim()
                    };
                })
                .filter(Boolean);
        }

        function h3StoryboardVlmReferenceSummary(references, language, motionReferenceSlot) {
            const currentLanguage = call(runtimeSource, 'runtimeUiLang', '');
            const isEnglish = String(language || currentLanguage || '').toLowerCase() === 'en';
            const motionSlot = String(motionReferenceSlot || 'scene_reference_video').trim();
            return (Array.isArray(references) ? references : []).map(reference => {
                const asset = reference.asset || {};
                const details = [
                    reference.label,
                    reference.slot,
                    asset.width && asset.height ? String(asset.width) + 'x' + asset.height : '',
                    asset.duration ? String(Math.round(Number(asset.duration) * 1000) / 1000) + 's' : '',
                    asset.fps ? String(Math.round(Number(asset.fps) * 1000) / 1000) + 'fps' : ''
                ].filter(Boolean).join(' / ');
                const suffix = details ? ' / ' + details : '';
                if (reference.kind === 'audio') {
                    const availability = isEnglish
                        ? 'connected audio metadata only; audio content is not decoded during prompt optimization'
                        : '仅连接音频元数据；提示词优化不会解码音频内容';
                    return reference.token + ': ' + availability + suffix;
                }
                if (reference.kind === 'video' && reference.slot === motionSlot) {
                    const role = isEnglish
                        ? 'motion/timing reference; apply its visible pose, action, timing, and compatible camera trajectory to the Picture subject, without copying the video actor identity'
                        : '运动与时序参考；把视频中的姿态、动作、节奏和兼容的镜头轨迹应用到图片角色，不复制视频人物身份';
                    return reference.token + ': ' + role + suffix;
                }
                if (reference.kind === 'video') {
                    const role = isEnglish
                        ? 'scene/composition video reference; use its setting and framing unless another video is explicitly assigned motion'
                        : '场景与构图视频参考；使用其场景和取景，除非另一个视频被明确指定为动作来源';
                    return reference.token + ': ' + role + suffix;
                }
                const availability = isEnglish
                    ? 'attached ' + reference.kind + ' reference'
                    : '已连接' + (reference.kind === 'image' ? '图片' : '视频') + '参考';
                return reference.token + ': ' + availability + suffix;
            }).join('\n');
        }

        function h3StoryboardMotionPictureIndex(prompt, motionReferenceToken, pictureCount) {
            const text = String(prompt || '');
            const token = String(motionReferenceToken || '').trim();
            const explicitPictureNumbers = [...text.matchAll(/<Picture\s+(\d+)>/gi)]
                .map(match => Number(match[1] || 0))
                .filter(number => number > 0);
            const uniquePictureNumbers = [...new Set(explicitPictureNumbers)];
            const availablePictureCount = Number.isFinite(Number(pictureCount)) && Number(pictureCount) > 0
                ? Number(pictureCount)
                : uniquePictureNumbers.length;
            if (!text || !token) return availablePictureCount === 1 ? (uniquePictureNumbers[0] || 1) : 0;
            const escapedToken = token.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
            const shotBodies = text.match(/\[Shot\s+\d+\][\s\S]*?(?=\[Shot\s+\d+\]|$)/gi) || [];
            for (const body of shotBodies) {
                if (!new RegExp(escapedToken, 'i').test(body)) continue;
                const shotPictures = [...body.matchAll(/<Picture\s+(\d+)>/gi)]
                    .map(match => Number(match[1] || 0))
                    .filter(number => number > 0);
                const uniqueShotPictures = [...new Set(shotPictures)];
                if (uniqueShotPictures.length === 1) return uniqueShotPictures[0];
                if (uniqueShotPictures.length > 1) return 0;
            }
            return availablePictureCount === 1 ? (uniquePictureNumbers[0] || 1) : 0;
        }

        function h3StoryboardInventoryForPreset(node) {
            const promptContext = call(nodeSource, 'canvasAgentPromptCompilerContext', {}, node);
            const refs = { image: [], video: [], audio: [] };
            const slotOrder = getSlotOrder();
            getPresetUploadRunEdges(node)
                .slice()
                .sort((left, right) => slotOrder.indexOf(left?.slot || '') - slotOrder.indexOf(right?.slot || ''))
                .forEach(edge => {
                    const kind = getUploadSlotMediaKind(edge?.slot || '');
                    if (!refs[kind]) return;
                    const sourceNode = getNode(edge?.from);
                    const asset = sourceNode?.type === 'result' ? getSelectedResultAsset(sourceNode) : sourceNode?.asset;
                    const fallback = asset?.preview_url || asset?.thumb || asset?.data_url || asset?.url || '';
                    const preview = kind === 'image'
                        ? call(nodeSource, 'safeAssetFullDisplaySrc', fallback, asset || {}, fallback)
                        : (asset?.preview_url || asset?.data_url || asset?.url || '');
                    const label = String(sourceNode?.title || sourceNode?.name || edge?.slot || (kind + ' ' + (refs[kind].length + 1))).trim();
                    refs[kind].push({
                        slot: edge?.slot || '',
                        asset_id: asset?.asset_id || '',
                        source_id: sourceNode?.id || '',
                        label_en: label,
                        label_cn: label,
                        preview
                    });
                });
            return {
                image_count: Math.max(0, Number(promptContext?.image_count || 0)),
                video_count: Math.max(0, Number(promptContext?.video_count || 0)),
                audio_count: Math.max(0, Number(promptContext?.audio_count || 0)),
                image_refs: refs.image,
                video_refs: refs.video,
                audio_refs: refs.audio
            };
        }

        function h3StoryboardModeForPreset(node) {
            const inventory = h3StoryboardInventoryForPreset(node);
            const promptTarget = call(nodeSource, 'canvasAgentPromptTargetFromNode', {}, node, 'video');
            const themeInfo = call(nodeSource, 'getPresetThemeInfo', {}, node);
            const modeHint = promptTarget?.prompt_compiler
                || themeInfo?.task_method
                || node.runtime?.task_method
                || node.preset?.name
                || '';
            const editor = getStoryboardEditor();
            if (typeof editor?.normalizeMode === 'function') return editor.normalizeMode(modeHint, { inventory });
            const compiler = typeof modeHint === 'string' ? modeHint : JSON.stringify(modeHint);
            const compact = String(compiler || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
            if (compact.includes('ref2va') || compact.includes('reference') || compact.includes('ref2v') || compact.includes('r2v') || compact.includes('r2c') || compact.includes('minimaxh3avatar')) return 'Ref2VA';
            if (compact.includes('fl2va') || compact.includes('firstlast')) return 'FL2VA';
            if (compact.includes('l2va') || compact.includes('lastframe')) return 'L2VA';
            if (compact.includes('frameanchor')) return inventory.image_count >= 2 ? 'FL2VA' : 'I2VA';
            if (compact.includes('i2va')) return 'I2VA';
            if (compact.includes('i2v')) return inventory.image_count >= 2 ? 'FL2VA' : 'I2VA';
            return 'T2VA';
        }

        function h3StoryboardOptionsForPreset(node) {
            return {
                mode: h3StoryboardModeForPreset(node),
                duration: Math.max(0.3, Number(node?.params?.scene_video_duration || 5)),
                inventory: h3StoryboardInventoryForPreset(node),
                langState: call(stateSource, 'getLanguageState', { __lang: 'en' }) || { __lang: 'en' }
            };
        }

        function h3StoryboardStateForPreset(node) {
            const options = h3StoryboardOptionsForPreset(node);
            const source = node?.h3_storyboard || node?.params?.prompt || '';
            const editor = getStoryboardEditor();
            if (typeof editor?.normalize === 'function') return editor.normalize(source, options);
            let stored = source && typeof source === 'object' ? source : {};
            if (typeof source === 'string' && source.trim().startsWith('{')) {
                try { stored = JSON.parse(source); } catch (error) { stored = {}; }
            }
            const shotMatches = String(node?.params?.prompt || '').match(/\[Shot\s+\d+\]/gi) || [];
            return {
                mode: options.mode,
                optimize: !!stored.optimize,
                shots: Array.isArray(stored.shots) && stored.shots.length
                    ? stored.shots
                    : Array.from({ length: Math.max(1, shotMatches.length || 3) }, () => ({}))
            };
        }

        return {
            h3StoryboardVlmReferencesForPreset,
            h3StoryboardVlmReferenceSummary,
            h3StoryboardMotionPictureIndex,
            h3StoryboardInventoryForPreset,
            h3StoryboardModeForPreset,
            h3StoryboardOptionsForPreset,
            h3StoryboardStateForPreset
        };
    }

    window.SimpAICanvasWorkbenchMiniMaxH3StoryboardPresetData = Object.assign(
        {}, window.SimpAICanvasWorkbenchMiniMaxH3StoryboardPresetData || {},
        { createCanvasMiniMaxH3StoryboardPresetData }
    );
})();
