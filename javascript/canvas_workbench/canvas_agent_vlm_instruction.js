(function () {
    'use strict';

    function createCanvasAgentPromptContext(source) {
        const scope = source || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const t = scope.t || ((en, cn) => cn || en);
        const getSlotOrder = () => {
            const value = call('getSlotOrder', []);
            return Array.isArray(value) ? value : [];
        };

        function normalizePresetName(value) {
            return call('normalizePresetName', String(value || '').trim(), value);
        }

        function getNode(id) {
            return call('getNode', null, id);
        }

        function getSelectedResultAsset(node) {
            return call('getSelectedResultAsset', null, node);
        }

        function assetIsAvailable(asset) {
            return !!asset && !!(
                asset.data_url
                || asset.path
                || asset.output_path
                || asset.original_output_path
                || asset.preview_url
                || asset.thumb
                || asset.asset_relative_path
                || asset.relative_path
            );
        }

        function sortedUploadEdges(node) {
            const edges = call('getPresetUploadRunEdges', [], node);
            return (Array.isArray(edges) ? edges : [])
                .slice()
                .sort((left, right) => getSlotOrder().indexOf(left?.slot || '') - getSlotOrder().indexOf(right?.slot || ''));
        }

        function canvasAgentPromptCompilerContext(entryOrNode) {
            const node = entryOrNode && ['preset', 'classic'].includes(entryOrNode.type) ? entryOrNode : null;
            const imageIds = new Set();
            const videoIds = new Set();
            const audioIds = new Set();
            const imageDescriptors = [];
            const videoDescriptors = [];
            const audioDescriptors = [];
            const uploadEdges = node ? sortedUploadEdges(node) : [];
            if (node) {
                uploadEdges.forEach((edge) => {
                    const kind = call('getUploadSlotMediaKind', '', edge?.slot || '');
                    const sourceNode = getNode(edge?.from);
                    const asset = sourceNode?.type === 'result' ? getSelectedResultAsset(sourceNode) : sourceNode?.asset;
                    if (!assetIsAvailable(asset)) return;
                    if (kind === 'image') imageIds.add(edge.from);
                    else if (kind === 'video') videoIds.add(edge.from);
                    else if (kind === 'audio') audioIds.add(edge.from);
                });
            } else {
                const refs = call('normalizeCanvasAgentReferences', []);
                (Array.isArray(refs) ? refs : []).forEach((ref) => {
                    if (ref.kind === 'image') imageIds.add(ref.nodeId);
                    else if (ref.kind === 'video') videoIds.add(ref.nodeId);
                    else if (ref.kind === 'audio') audioIds.add(ref.nodeId);
                });
                const primaryImage = call('getCanvasAgentPrimaryMediaNode', null, 'image');
                if (primaryImage?.id) imageIds.add(primaryImage.id);
                const primaryVideo = call('getCanvasAgentPrimaryMediaNode', null, 'video');
                if (primaryVideo?.id) videoIds.add(primaryVideo.id);
                const primaryAudio = call('getCanvasAgentPrimaryMediaNode', null, 'audio');
                if (primaryAudio?.id) audioIds.add(primaryAudio.id);
            }
            const entry = node ? call('getPresetCatalogEntryForNode', null, node) : entryOrNode;
            const schema = (node?.schema && typeof node.schema === 'object')
                ? node.schema
                : (entry?.schema && typeof entry.schema === 'object' ? entry.schema : {});
            const compilerText = [
                node?.runtime?.prompt_compiler,
                node?.preset?.prompt_compiler,
                node?.schema?.prompt_compiler,
                entry?.prompt_compiler,
                schema.prompt_compiler
            ].filter(Boolean).join(' ').toLowerCase();
            const isH3ReferenceMode = /minimax[_\s-]*h3/.test(compilerText) && /ref2va|r2v|reference/.test(compilerText);
            const referenceRoleForSlot = (kind, slot) => {
                if (kind === 'video') {
                    if (slot === 'scene_reference_video' || slot === 'scene_reference_video2') return 'motion/timing reference video';
                    if (slot === 'scene_video' && isH3ReferenceMode) return 'scene/composition video reference';
                    return 'video reference';
                }
                if (kind === 'image') return 'identity/appearance reference image';
                if (kind === 'audio') return 'independent audio reference';
                return `${kind} reference`;
            };
            const addDescriptor = (kind, slot, sourceNode) => {
                const list = kind === 'image' ? imageDescriptors : (kind === 'video' ? videoDescriptors : audioDescriptors);
                if (!list) return;
                const asset = sourceNode?.type === 'result' ? getSelectedResultAsset(sourceNode) : sourceNode?.asset;
                if (!assetIsAvailable(asset)) return;
                list.push({
                    slot: String(slot || '').trim(),
                    index: list.length + 1,
                    role: referenceRoleForSlot(kind, String(slot || '').trim()),
                    available: true,
                    node_id: sourceNode?.id || ''
                });
            };
            if (node) {
                uploadEdges.forEach((edge) => {
                    const kind = call('getUploadSlotMediaKind', '', edge?.slot || '');
                    if (!['image', 'video', 'audio'].includes(kind)) return;
                    addDescriptor(kind, edge?.slot || '', getNode(edge?.from));
                });
            } else {
                const refs = call('normalizeCanvasAgentReferences', []);
                (Array.isArray(refs) ? refs : []).forEach((ref) => {
                    if (!['image', 'video', 'audio'].includes(ref.kind)) return;
                    addDescriptor(ref.kind, ref.slot || '', call('canvasAgentReferenceNode', null, ref));
                });
            }
            const theme = node?.runtime?.scene_theme || schema.default_theme || (Array.isArray(schema.themes) ? schema.themes[0] : '') || '';
            const themeInfo = schema.per_theme?.[theme] && typeof schema.per_theme[theme] === 'object' ? schema.per_theme[theme] : {};
            const themeDefaults = themeInfo.defaults && typeof themeInfo.defaults === 'object' ? themeInfo.defaults : {};
            const rawDuration = node?.params?.scene_video_duration
                ?? node?.preset?.defaults?.scene_video_duration
                ?? themeDefaults.scene_video_duration
                ?? null;
            const duration = Number(rawDuration);
            const selectedVideo = videoDescriptors.find((item) => item.slot === 'scene_reference_video2')
                || videoDescriptors.find((item) => item.slot === 'scene_reference_video')
                || videoDescriptors[0]
                || null;
            const referenceVideos = videoDescriptors.filter((item) => item.slot === 'scene_reference_video' || item.slot === 'scene_reference_video2');
            if (isH3ReferenceMode && selectedVideo) {
                videoDescriptors.forEach((item) => {
                    item.role = item === selectedVideo
                        ? 'motion/timing reference video'
                        : 'scene/composition video reference';
                });
            }
            const videoSource = selectedVideo?.slot === 'scene_reference_video2'
                ? 'reference_video2'
                : (selectedVideo?.slot === 'scene_reference_video' ? 'reference_video' : (selectedVideo ? 'main_video' : ''));
            return {
                image_count: node ? imageDescriptors.length : imageIds.size,
                video_count: node ? videoDescriptors.length : videoIds.size,
                audio_count: node ? audioDescriptors.length : audioIds.size,
                image_descriptors: imageDescriptors,
                video_descriptors: videoDescriptors,
                audio_descriptors: audioDescriptors,
                video_reference_index: selectedVideo?.index || 0,
                motion_picture_index: selectedVideo && (node ? imageDescriptors.length : imageIds.size) === 1 ? 1 : 0,
                video_requested: !!selectedVideo,
                video_used: !!selectedVideo?.available,
                video_source: videoSource,
                reference_video_present: referenceVideos.length > 0,
                reference_video_content_available: referenceVideos.some((item) => item.available),
                duration_seconds: Number.isFinite(duration) && duration > 0 ? duration : null,
                inventory_known: true,
                language: call('runtimeUiLang', 'en')
            };
        }

        function canvasAgentAttachPromptCompilerContext(target, entryOrNode) {
            if (!target?.prompt_compiler) return target;
            target.prompt_compiler_context = canvasAgentPromptCompilerContext(entryOrNode);
            return target;
        }

        function canvasAgentMergeDanbooruPromptWithContext(prompt, contextText, target, purpose, options) {
            if (String(target?.key || '') !== 'sdxl_danbooru') return prompt;
            const base = String(prompt || '').trim();
            const context = String(contextText || '').trim();
            const formatPrompt = (tags) => typeof scope.canvasAgentFormatDanbooruPrompt === 'function'
                ? scope.canvasAgentFormatDanbooruPrompt(tags, true)
                : canvasAgentFormatDanbooruPrompt(tags, true);
            if (!base || !context) return formatPrompt(String(base || '').split(','));
            const fallbackOptions = Object.assign({}, options || {}, { purpose });
            const extra = typeof scope.canvasAgentDanbooruFallbackPrompt === 'function'
                ? scope.canvasAgentDanbooruFallbackPrompt(context, target, fallbackOptions, [])
                : canvasAgentDanbooruFallbackPrompt(context, target, fallbackOptions, []);
            if (!extra) return formatPrompt(base.split(','));
            const tags = [];
            const push = (tag) => {
                if (typeof scope.canvasAgentPushDanbooruTag === 'function') scope.canvasAgentPushDanbooruTag(tags, tag);
                else canvasAgentPushDanbooruTag(tags, tag);
            };
            base.split(',').forEach(push);
            extra.split(',').forEach(push);
            return formatPrompt(tags.slice(0, 48));
        }

        function canvasAgentPushDanbooruTag(tags, tag) {
            if (!Array.isArray(tags)) return;
            const clean = String(tag || '').trim().replace(/\s+/g, '_');
            if (!clean || !/^[a-z0-9_()+\-:.]+$/i.test(clean)) return;
            if (canvasAgentDanbooruTagIsLowSignal(clean)) return;
            if (!tags.includes(clean)) tags.push(clean);
        }

        function canvasAgentFormatDanbooruTag(tag, spaceSeparated = true) {
            const text = String(tag || '').trim();
            if (!text) return '';
            const weighted = text.match(/^\(([^:()]+):([0-9.]+)\)$/);
            if (weighted) {
                const name = spaceSeparated ? String(weighted[1] || '').replace(/_/g, ' ') : String(weighted[1] || '');
                return `(${name}:${weighted[2]})`;
            }
            return spaceSeparated ? text.replace(/_/g, ' ') : text;
        }

        function canvasAgentFormatDanbooruPrompt(tags, spaceSeparated = true) {
            return (Array.isArray(tags) ? tags : [])
                .map(tag => canvasAgentFormatDanbooruTag(tag, spaceSeparated))
                .filter(Boolean)
                .join(', ');
        }

        function canvasAgentDanbooruTagIsLowSignal(tag) {
            const clean = String(tag || '').trim().toLowerCase();
            if (!clean) return true;
            if (/^(1girl|1boy|2girls|2boys|3girls|3boys)$/.test(clean)) return false;
            if (/^[a-z]{1,2}$/.test(clean)) return true;
            if (/^(black|green|white|blue|red|pink|yellow|purple|brown|grey|gray)$/.test(clean)) return true;
            if (/^(eyes?|hair|fur|patch|cat|facial|face|lighting|illustration|day|holding|style|features?|detail|detailed|quality|high|soft|base|roots?|outfit|wearing|cute|anime|character)$/.test(clean)) return true;
            if (/^(ant|arin|ett|eta|ast|kgr|ssi|iu)$/.test(clean)) return true;
            if (/^(worthing|low|quality|bad|missing|wrong)$/.test(clean)) return true;
            if (/^(double_fox_shadow_puppet)$/.test(clean)) return true;
            return false;
        }

        function canvasAgentDanbooruTagLooksFabricated(tag) {
            const clean = String(tag || '').trim().toLowerCase().replace(/\s+/g, '_');
            if (!clean) return false;
            if (/^(masterpiece|best_quality|highres|absurdres|newest|very_aesthetic|amazing_quality)$/.test(clean)) return false;
            if (/^(1girl|1boy|2girls|2boys|solo|catgirl|cat_ears|animal_ears|black_hair|white_hair|green_eyes|blue_eyes|twintails|streaked_hair|white_streaked_hair|long_hair|short_hair|smile|shy|selfie|holding_phone|looking_at_viewer|pov|from_behind|from_above|full_body|upper_body|cowboy_shot|standing|sitting|lying|indoors|outdoors|street|city|cityscape|bridge|fog|snow|winter_clothes|jacket|pants|skirt|school_uniform|dress|hoodie|soft_lighting|cinematic_lighting|depth_of_field|blurry_background|simple_background|close-up|ear_fluff|tail|white_fur|holding_hands|reaching_towards_viewer|facing_viewer|walking|no_humans|scenery|landscape|sky|cloud|cloudy_sky|blue_sky|starry_sky|sunset|sunrise|dawn|dusk|night|mountain|mountains|lake|river|waterfall|ocean|sea|beach|forest|tree|grass|flower|field|meadow|water|reflection|building|road|path|wide_shot|panoramic)$/.test(clean)) return false;
            if (/shadow_puppet/.test(clean)) return true;
            if (/(?:^|_)(?:facial|features?|illustration|quality|style|detailed|detail|character)(?:_|$)/.test(clean)) return true;
            if (clean.length > 36) return true;
            if ((clean.match(/_/g) || []).length >= 4) return true;
            return /(?:^|_)(?:with|wearing|front|background|landmarks?|distance|roots?|outfit|at|and|of|in)(?:_|$)/.test(clean);
        }

        function canvasAgentDanbooruTagLooksFabricatedForContext(tag) {
            return typeof scope.canvasAgentDanbooruTagLooksFabricated === 'function'
                ? !!scope.canvasAgentDanbooruTagLooksFabricated(tag)
                : canvasAgentDanbooruTagLooksFabricated(tag);
        }

        function canvasAgentDanbooruTextHasHumanIntent(text) {
            const source = String(text || '');
            if (/\u7f8e\u5973|\u7f8e\u5c11\u5973/.test(source)) return true;
            return /\b(?:1girl|1boy|2girls|2boys|girl|boy|woman|man|person|people|character|portrait|selfie|avatar|catgirl|cat_girl|maid|nun)\b/i.test(source)
                || /(?:女孩|男孩|少女|少年|女人|男人|人物|角色|人像|肖像|自拍|头像|猫耳娘|猫娘|女仆|修女)/.test(source);
        }

        function canvasAgentDanbooruTextHasSceneryIntent(text) {
            const source = String(text || '');
            return /\b(?:landscape|scenery|background|wallpaper|wide shot|panoramic|mountain|lake|river|waterfall|ocean|sea|beach|forest|sky|sunset|sunrise|cityscape)\b/i.test(source)
                || /(?:风景|景色|风光|背景图|背景|壁纸|场景图|山|湖|河|瀑布|海|海边|森林|天空|云|夕阳|日出|城市夜景|夜景|全景|远景)/.test(source);
        }

        const VLM_ASSISTANT_PERSONA_DANBOORU_TAGS = new Set([
            'catgirl',
            'cat_ears',
            'black_hair',
            'twintails',
            'green_eyes',
            'streaked_hair',
            'white_streaked_hair',
            'ear_fluff',
            'white_fur',
            'tail'
        ]);

        const VLM_ASSISTANT_PERSONA_ANIMAL_TAGS = new Set([
            'catgirl',
            'cat_ears',
            'animal_ears',
            'wolf_ears',
            'fox_ears',
            'ear_fluff',
            'white_fur',
            'wolf_tail',
            'fox_tail',
            'tail'
        ]);

        function vlmAgentUserPromptHasAssistantPersonaImageIntent(text) {
            const source = String(text || '').trim();
            if (!source) return false;
            return /\b(?:yourself|your\s+(?:selfie|look|appearance|avatar|portrait|photo|picture|image)|show\s+me\s+your(?:self)?|draw\s+you|generate\s+you|make\s+you|with\s+you|holding\s+your\s+hand|you\s+(?:wearing|holding|standing|sitting|lying|in|as))\b/i.test(source)
                || /(?:\u770b\u770b\u4f60|\u4f60\u7684(?:\u6837\u5b50|\u5916\u8c8c|\u957f\u76f8|\u81ea\u62cd|\u7167\u7247|\u56fe\u7247|\u56fe\u50cf|\u5934\u50cf|\u624b)|(?:\u753b|\u751f\u6210|\u7ed8\u5236|\u770b).{0,12}\u4f60|\u548c\u4f60|\u4f60\u7a7f|\u4f60\u62ff|\u4f60\u7ad9|\u4f60\u5750|\u4f60\u8eba|\u4f60\u5728|\u7275\u7740\u4f60)/.test(source);
        }

        function canvasAgentFilterPersonaLeakTags(tags, userPrompt) {
            const list = (Array.isArray(tags) ? tags : []).map(tag => String(tag || '').trim()).filter(Boolean);
            if (!list.length || vlmAgentUserPromptHasAssistantPersonaImageIntent(userPrompt)) return list;
            const requestedTags = new Set(canvasAgentCanonicalDanbooruTagsFromPrompt(userPrompt));
            const hasRequestedAnimalIdentity = Array.from(VLM_ASSISTANT_PERSONA_ANIMAL_TAGS).some(tag => requestedTags.has(tag));
            const hasUnrequestedAnimalIdentity = list.some(tag => VLM_ASSISTANT_PERSONA_ANIMAL_TAGS.has(String(tag || '').toLowerCase())) && !hasRequestedAnimalIdentity;
            const personaTagCount = list.filter(tag => VLM_ASSISTANT_PERSONA_DANBOORU_TAGS.has(String(tag || '').toLowerCase())).length;
            if (!hasUnrequestedAnimalIdentity && personaTagCount < 4) return list;
            return list.filter(tag => {
                const clean = String(tag || '').trim().toLowerCase();
                if (!clean || requestedTags.has(clean)) return true;
                if (VLM_ASSISTANT_PERSONA_DANBOORU_TAGS.has(clean)) return false;
                if (VLM_ASSISTANT_PERSONA_ANIMAL_TAGS.has(clean)) return false;
                return true;
            });
        }

        function canvasAgentCanonicalDanbooruTagsFromPrompt(prompt) {
            const tags = [];
            const source = String(prompt || '');
            const push = (tag) => canvasAgentPushDanbooruTag(tags, tag);
            const emit = (items) => items.forEach(push);
            const lowerSource = source.toLowerCase();
            if (/\bganyu\b|\u7518\u96e8/.test(lowerSource)) emit(['1girl', 'solo', 'ganyu_(genshin_impact)', 'genshin_impact', 'horns', 'blue_hair', 'long_hair']);
            if (/\bnahida\b|\u7eb3\u897f\u59b2|\u7d0d\u897f\u59b2/.test(lowerSource)) emit(['1girl', 'solo', 'nahida_(genshin_impact)', 'genshin_impact']);
            if (/\bhu[_\s-]?tao\b|\u80e1\u6843/.test(lowerSource)) emit(['1girl', 'solo', 'hu_tao_(genshin_impact)', 'genshin_impact']);
            if (/\bzhongli\b|\u949f\u79bb|\u937e\u96e2/.test(lowerSource)) emit(['1boy', 'zhongli_(genshin_impact)', 'genshin_impact']);
            if (/\bventi\b|\u6e29\u8fea|\u6eab\u8fea/.test(lowerSource)) emit(['1boy', 'venti_(genshin_impact)', 'genshin_impact']);
            if (/\braiden[_\s-]?shogun\b|\u96f7\u7535\u5c06\u519b|\u96f7\u96fb\u5c07\u8ecd/.test(lowerSource)) emit(['1girl', 'solo', 'raiden_shogun', 'genshin_impact']);
            if (/\bgenshin(?:[_\s-]?impact)?\b|\u539f\u795e/.test(lowerSource)) push('genshin_impact');
            if (/\b(?:cat\s*girl|catgirl)\b|\u732b\u8033\u5a18|\u732b\u5a18/.test(lowerSource)) emit(['catgirl', 'cat_ears']);
            if (/\bcat[-_\s]?ears?\b|\u732b\u8033/.test(lowerSource)) push('cat_ears');
            if (/\b(?:black|dark)[-_\s]*(?:hair|twin[-_\s]?tails?|twintails?|pigtails?)\b|\b(?:twin[-_\s]?tails?|twintails?|pigtails?).{0,24}\bblack\b|\u9ed1\u53d1|\u9ed1\u8272.{0,6}\u5934\u53d1|\u9ed1\u8272.{0,6}\u53cc\u9a6c\u5c3e/.test(lowerSource)) push('black_hair');
            if (/\b(?:emerald[-_\s]*)?green[-_\s]*eyes?\b|\u7fe0\u7eff.{0,6}\u773c|\u7eff\u8272?.{0,6}\u773c/.test(lowerSource)) push('green_eyes');
            if (/\btwin[-_\s]?tails?\b|\btwintails?\b|\bdouble[-_\s]?pigtails?\b|\bpigtails?\b|\u53cc\u9a6c\u5c3e|\u96d9\u99ac\u5c3e/.test(lowerSource)) push('twintails');
            if (/\b(?:one[-_\s]*)?white[-_\s]*(?:hair[-_\s]*)?(?:streak|highlight|dye)\b|\b(?:streak|highlight|dye).{0,24}\bwhite\b|\u767d\u8272?\u6311\u67d3|\u767d\u53d1\u6311\u67d3|\u6311\u67d3\u767d\u53d1|\u4e00\u6761\u6311\u67d3/.test(lowerSource)) emit(['streaked_hair', 'white_streaked_hair']);
            if (/\bwhite[-_]*fur\b|\bfur.{0,32}\b(?:ear|ears|base|root|roots)\b|\b(?:ear|ears|base|root|roots).{0,32}\bwhite[-_]*fur\b|\u8033\u6735\u6839\u90e8.{0,8}\u767d\u6bdb|\u8033\u6839.{0,8}\u767d\u6bdb|\u767d\u8272?\u7ed2\u6bdb/.test(lowerSource)) emit(['white_fur', 'ear_fluff']);
            if (/\bselfie\b|\u81ea\u62cd|\u770b\u770b\u4f60\u7684\u6837\u5b50|\u4f60\u7684\u6837\u5b50/.test(lowerSource)) emit(['1girl', 'solo', 'looking_at_viewer']);
            source.split(',').forEach((raw) => {
                const tag = String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
                if (!tag) return;
                if (/^(masterpiece|best_quality|highres|absurdres|newest|very_aesthetic|amazing_quality)$/.test(tag)) return push(tag);
                if (/^1girl$|^1boy$|^solo$/.test(tag)) return push(tag);
                if (tag === 'room') return push('bedroom');
                if (/catgirl|cat_girl/.test(tag)) emit(['catgirl', 'cat_ears']);
                if (/cat_ears?/.test(tag)) push('cat_ears');
                if (/animal_ears?/.test(tag)) push('animal_ears');
                if (/black_hair|black.*hair|black.*twin_?tails?|twin_?tails?.*black/.test(tag)) push('black_hair');
                if (/white_hair/.test(tag)) push('white_hair');
                if (/green_eyes|emerald/.test(tag)) push('green_eyes');
                else if (/blue_eyes/.test(tag)) push('blue_eyes');
                if (/twin_?tails?|double_pigtails?|pigtails?/.test(tag)) push('twintails');
                if (/white_streak|white_streaked_hair|white_highlight|white.*dye|streak.*white/.test(tag)) emit(['streaked_hair', 'white_streaked_hair']);
                else if (/streak|highlight/.test(tag)) push('streaked_hair');
                if (/ear_fluff|fluffy.*ear|fur.*ear|ear.*fur|ear.*root|base.*ear/.test(tag)) push('ear_fluff');
                if (/white_fur|fur.*white/.test(tag)) push('white_fur');
                if (/tail/.test(tag)) push('tail');
                if (/selfie/.test(tag)) emit(['selfie', 'holding_phone']);
                if (/holding_phone|smartphone|phone/.test(tag)) push('holding_phone');
                if (/holding_.*hand|holding_hands/.test(tag)) push('holding_hands');
                if (/first_person|pov/.test(tag)) push('pov');
                if (/front_view|facing/.test(tag)) push('facing_viewer');
                if (/looking.*viewer|viewer/.test(tag)) push('looking_at_viewer');
                if (/looking_up/.test(tag)) push('from_above');
                if (/smile/.test(tag)) push('smile');
                if (/shy/.test(tag)) push('shy');
                if (/ski|snow|winter/.test(tag)) push('winter_clothes');
                if (/jacket|hoodie/.test(tag)) push('jacket');
                if (/pants/.test(tag)) push('pants');
                if (/dress/.test(tag)) push('dress');
                if (/street/.test(tag)) push('street');
                if (/london|city|urban/.test(tag)) push('city');
                if (/tower_bridge|bridge/.test(tag)) push('bridge');
                if (/fog|foggy/.test(tag)) push('fog');
                if (/no_humans|without_people|empty_scene/.test(tag)) push('no_humans');
                if (/landscape|scenery|风景|景色|风光/.test(tag)) emit(['scenery', 'landscape']);
                if (/mountain|山/.test(tag)) push('mountain');
                if (/lake|湖/.test(tag)) push('lake');
                if (/river|河/.test(tag)) push('river');
                if (/waterfall|瀑布/.test(tag)) push('waterfall');
                if (/ocean|sea|beach|海|海边/.test(tag)) push('ocean');
                if (/forest|森林/.test(tag)) push('forest');
                if (/sky|天空/.test(tag)) push('sky');
                if (/cloud|云/.test(tag)) push('cloud');
                if (/sunset|夕阳|黄昏/.test(tag)) push('sunset');
                if (/sunrise|dawn|日出|黎明/.test(tag)) push('sunrise');
                if (/night|夜景|夜晚/.test(tag)) push('night');
                if (/wide_shot|panoramic|全景|远景/.test(tag)) push('wide_shot');
                if (/cinematic/.test(tag)) push('cinematic_lighting');
                if (/soft_lighting|soft_light/.test(tag)) push('soft_lighting');
                if (/depth_of_field/.test(tag)) push('depth_of_field');
                if (!canvasAgentDanbooruTagLooksFabricated(tag)) push(tag);
            });
            return tags;
        }

        function vlmAgentExplicitSubjectCountsFromText(text) {
            const source = String(text || '').toLowerCase();
            const countValue = (raw) => {
                const value = String(raw || '').trim().toLowerCase();
                if (/^\d+$/.test(value)) return Math.min(6, Math.max(0, Math.round(Number(value))));
                const map = {
                    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
                    '\u4e00': 1, '\u4e8c': 2, '\u4e24': 2, '\u5169': 2, '\u4fe9': 2, '\u5006': 2,
                    '\u4e09': 3, '\u56db': 4, '\u4e94': 5, '\u516d': 6
                };
                return map[value] || 0;
            };
            const countToken = '(\\d+|one|two|three|four|five|six|\u4e00|\u4e8c|\u4e24|\u5169|\u4fe9|\u5006|\u4e09|\u56db|\u4e94|\u516d)';
            let girls = 0;
            let boys = 0;
            const scan = (pattern, setter) => {
                let match;
                const regex = new RegExp(pattern, 'gi');
                while ((match = regex.exec(source))) setter(countValue(match[1] || match[2]));
            };
            scan(`${countToken}\\s*(?:个|個|位|名)?\\s*(?:女(?:人|性|孩|角色|的)|少女)|${countToken}\\s*(?:girls?|women|females?)\\b`, value => { girls = Math.max(girls, value); });
            scan(`${countToken}\\s*(?:个|個|位|名)?\\s*(?:男(?:人|性|孩|角色|的)|少年)|${countToken}\\s*(?:boys?|men|males?)\\b`, value => { boys = Math.max(boys, value); });
            if (/一\s*(?:个|個|位|名)?\s*男.{0,8}一\s*(?:个|個|位|名)?\s*女|一\s*(?:个|個|位|名)?\s*女.{0,8}一\s*(?:个|個|位|名)?\s*男|\b1\s*(?:boy|man|male)\b.{0,8}\b1\s*(?:girl|woman|female)\b|\b1\s*(?:girl|woman|female)\b.{0,8}\b1\s*(?:boy|man|male)\b/i.test(source)) {
                girls = Math.max(girls, 1);
                boys = Math.max(boys, 1);
            }
            return { girls, boys, total: girls + boys };
        }

        function canvasAgentSubjectCountsFromDanbooruTags(tags) {
            const next = Array.isArray(tags) ? tags.filter(Boolean).map(tag => String(tag).trim().toLowerCase()).filter(Boolean) : [];
            let girls = 0;
            let boys = 0;
            let others = 0;
            let total = 0;
            if (next.includes('no_humans')) return { girls: 0, boys: 0, others: 0, total: 0 };
            next.forEach((tag) => {
                let match = tag.match(/^([1-6])girls$/);
                if (match) {
                    girls = Math.max(girls, Number(match[1]) || 0);
                    return;
                }
                match = tag.match(/^([1-6])boys$/);
                if (match) {
                    boys = Math.max(boys, Number(match[1]) || 0);
                    return;
                }
                if (tag === '1girl') girls = Math.max(girls, 1);
                else if (tag === '1boy') boys = Math.max(boys, 1);
                else if (tag === 'multiple_others') others = Math.max(others, 1);
            });
            total = Math.max(total, girls + boys + others);
            return { girls, boys, others, total };
        }

        function canvasAgentRepairMultiCharacterDanbooruTags(tags, userText, subjectCounts) {
            const next = Array.isArray(tags) ? tags.filter(Boolean).map(tag => String(tag).trim()).filter(Boolean) : [];
            const text = String(userText || '');
            const characterTags = next.filter(tag => /_\([^)]+\)$/.test(tag));
            const promptCounts = canvasAgentSubjectCountsFromDanbooruTags(next);
            let femaleCount = 0;
            let maleCount = 0;
            let otherCount = 0;
            const hinted = subjectCounts && typeof subjectCounts === 'object' ? subjectCounts : null;
            if (hinted && (hinted.girls || hinted.boys || hinted.others || hinted.total === 0)) {
                femaleCount = hinted.girls || 0;
                maleCount = hinted.boys || 0;
                otherCount = hinted.others || Math.max(0, (hinted.total || 0) - femaleCount - maleCount);
            } else {
                const explicitCounts = vlmAgentExplicitSubjectCountsFromText(text);
                femaleCount = explicitCounts.girls || 0;
                maleCount = explicitCounts.boys || 0;
            }
            const explicitTwoPerson = (femaleCount + maleCount + otherCount) >= 2
                || (characterTags.length >= 2 && /(?:\b2girls\b|\b1girl\b.{0,12}\b1boy\b|\btwo\s+girls\b|\btwo\s+characters\b|\btogether\b|\band\b|\u548c|\u4e0e|\u8207|\u4e00\u8d77|\u4e24\u4eba|\u5169\u4eba|\u4e8c\u4eba)/i.test(text));
            if (!explicitTwoPerson) return next;
            const remove = new Set(['1girl', '1boy', '2girls', '2boys', '3girls', '3boys', '4girls', '4boys', '5girls', '5boys', '6girls', '6boys', 'solo', 'no_humans']);
            const cleaned = next.filter(tag => !remove.has(tag));
            const singletonTraitTags = new Set([
                'green_eyes', 'blue_eyes', 'horns', 'blue_hair', 'white_hair', 'black_hair',
                'long_hair', 'short_hair', 'twintails', 'streaked_hair', 'white_streaked_hair',
                'chest'
            ]);
            const explicitTraitText = /(?:green eyes|blue eyes|horns?|blue hair|white hair|black hair|long hair|short hair|twintails?|streaked hair|\u7eff\u773c|\u84dd\u773c|\u89d2|\u84dd\u53d1|\u767d\u53d1|\u9ed1\u53d1|\u957f\u53d1|\u77ed\u53d1|\u53cc\u9a6c\u5c3e|\u6311\u67d3)/i;
            const pruned = explicitTraitText.test(text) ? cleaned : cleaned.filter(tag => !singletonTraitTags.has(tag));
            if (femaleCount >= 1 || maleCount >= 1) {
                const countTags = [];
                if (femaleCount === 1) countTags.push('1girl');
                else if (femaleCount > 1) countTags.push(`${Math.min(femaleCount, 6)}girls`);
                if (maleCount === 1) countTags.push('1boy');
                else if (maleCount > 1) countTags.push(`${Math.min(maleCount, 6)}boys`);
                if (otherCount > 0 || (hinted?.total || 0) > (femaleCount + maleCount)) countTags.push('multiple_others');
                pruned.unshift(...countTags);
            } else if (promptCounts.total >= 2) {
                return next;
            } else if ((hinted?.others || 0) > 0 || hinted?.total >= 2) {
                pruned.unshift('multiple_others');
            } else if (characterTags.length >= 2) {
                return pruned;
            } else {
                return next;
            }
            if (/(?:kiss|kissing|\u63a5\u543b|\u4eb2\u543b|\u4eb2\u5634|\u820c\u543b)/i.test(text)) {
                ['kiss', 'couple', 'facing_another'].forEach(tag => canvasAgentPushDanbooruTag(pruned, tag));
                if (femaleCount >= 2 && maleCount === 0) canvasAgentPushDanbooruTag(pruned, 'yuri');
            }
            if (/(?:\u6478\u80f8|\u63c9\u80f8|\u629a\u6478\u80f8|\u64ab\u6478\u80f8|breast\s+grab|fondl(?:e|ing).{0,12}breast)/i.test(text)) {
                canvasAgentPushDanbooruTag(pruned, 'breast_grab');
            }
            return pruned;
        }

        function canvasAgentCanonicalizeDanbooruPrompt(prompt, contextText, target, purpose, options) {
            if (String(target?.key || '') !== 'sdxl_danbooru') return prompt;
            const opts = options || {};
            const promptTags = canvasAgentCanonicalDanbooruTagsFromPrompt(prompt);
            const rawContextTags = canvasAgentCanonicalDanbooruTagsFromPrompt(contextText);
            const contextTags = canvasAgentCanonicalDanbooruTagsFromPrompt(canvasAgentDanbooruFallbackPrompt(contextText, target, Object.assign({}, options || {}, { purpose }), []));
            let tags = [];
            const push = (tag) => canvasAgentPushDanbooruTag(tags, tag);
            promptTags.forEach(push);
            rawContextTags.forEach(push);
            contextTags.forEach(push);
            tags = canvasAgentFilterPersonaLeakTags(tags, opts.userPrompt || contextText || '');
            const hasVisibleCharacter = tags.some(tag => /^(1girl|1boy|2girls|2boys|solo|catgirl|cat_ears|animal_ears|selfie|portrait)$/.test(String(tag || '').toLowerCase()));
            if (hasVisibleCharacter) {
                const index = tags.indexOf('no_humans');
                if (index >= 0) tags.splice(index, 1);
                if (!tags.includes('solo') && tags.some(tag => /^(1girl|1boy|catgirl|selfie|portrait)$/.test(String(tag || '').toLowerCase()))) {
                    tags.splice(Math.min(2, tags.length), 0, 'solo');
                }
            }
            if (tags.length < 6) {
                canvasAgentDanbooruFallbackPrompt(`${prompt}\n${contextText}`, target, Object.assign({}, options || {}, { purpose }), [])
                    .split(',')
                    .forEach(push);
                tags = canvasAgentFilterPersonaLeakTags(tags, opts.userPrompt || contextText || '');
            }
            tags = canvasAgentRepairMultiCharacterDanbooruTags(tags, opts.userPrompt || contextText || '', opts.subjectCounts || null);
            return canvasAgentFormatDanbooruPrompt(tags.slice(0, 42), true);
        }

        function canvasAgentDanbooruFallbackPrompt(prompt, target, options, matches) {
            if (String(target?.key || '') !== 'sdxl_danbooru') return '';
            const text = String(prompt || '');
            const lower = text.toLowerCase();
            const opts = options || {};
            const defaults = opts.presetDefaults || canvasAgentPromptDefaultsForPurpose(opts.purpose || '', opts);
            const haystack = [
                target?.name || '',
                target?.backend_engine || '',
                target?.task_method || '',
                Array.isArray(defaults.styles) ? defaults.styles.join(', ') : ''
            ].join('|').toLowerCase();
            const hasHumanIntent = canvasAgentDanbooruTextHasHumanIntent(text);
            const hasSceneryIntent = canvasAgentDanbooruTextHasSceneryIntent(text);
            const tags = [];
            if (hasSceneryIntent) {
                ['scenery', 'landscape', 'outdoors'].forEach(tag => canvasAgentPushDanbooruTag(tags, tag));
                if (!hasHumanIntent) canvasAgentPushDanbooruTag(tags, 'no_humans');
            }
            (Array.isArray(matches) ? matches : []).slice(0, 14).forEach(item => {
                const tag = String(item?.tag || '').trim();
                const score = Number(item?.score || 0);
                if (tag && score >= 45 && !/^(commentary|translation_request|bad_id)$/i.test(tag) && !canvasAgentDanbooruTagLooksFabricated(tag)) canvasAgentPushDanbooruTag(tags, tag);
            });
            const rules = [
                [/\bfull[-_\s]?body\b|\u5168\u8eab/, ['full_body']],
                [/\bself[-_\s]?portrait\b|\bportrait\b|\u8096\u50cf|\u81ea\u753b\u50cf/, ['solo', 'looking_at_viewer']],
                [/\bsolo\b|\bone\b|\u5355\u4eba|\u4e00\u4eba/, ['solo']],
                [/\bstanding\b|\u7ad9\u7acb/, ['standing']],
                [/\bsitting\b|\u5750/, ['sitting']],
                [/\blooking at viewer\b|\u770b\u5411\u955c\u5934/, ['looking_at_viewer']],
                [/\blong hair\b|\u957f\u53d1/, ['long_hair']],
                [/\bshort hair\b|\u77ed\u53d1/, ['short_hair']],
                [/\bwhite hair\b|\u767d\u53d1/, ['white_hair']],
                [/\bblue eyes\b|\u84dd\u773c/, ['blue_eyes']],
                [/\bnun\b|\u4fee\u5973/, ['nun']],
                [/\bchurch\b|\u6559\u5802|\u5723\u5802/, ['church']],
                [/\bdress\b|\u8fde\u8863\u88d9|\u957f\u88d9/, ['dress']],
                [/\bsuit\b|\bprofessional\b|\u897f\u88c5|\u804c\u4e1a/, ['suit']],
                [/\bglow(?:ing)?\b|\u53d1\u5149|\u5149\u8292/, ['glowing']],
                [/\bfuturistic\b|\bsci[-_\s]?fi\b|\u672a\u6765|\u79d1\u5e7b/, ['science_fiction']],
                [/\bstudio\b|\bindoor(?:s)?\b|\u5ba4\u5185|\u5de5\u4f5c\u5ba4/, ['indoors']],
                [/\bsoft light|\bambient\b|\u67d4\u548c\u5149/, ['soft_lighting']],
                [/\bcinematic\b|\u7535\u5f71\u611f/, ['cinematic_lighting']],
                [/\brealistic\b|\bphotorealistic\b|\u5199\u5b9e/, ['realistic']],
                [/\banime\b|\u52a8\u6f2b|\u4e8c\u6b21\u5143/, ['anime_style']],
                [/\bcat\s*girl\b|\bcatgirl\b|\u732b\u8033\u5a18|\u732b\u5a18/, ['catgirl', 'cat_ears']],
                [/\bcat[-_\s]?ears?\b|\u732b\u8033/, ['cat_ears']],
                [/\banimal[-_\s]?ears?\b|\u517d\u8033|\u7378\u8033/, ['animal_ears']],
                [/\bblack hair\b|\u9ed1\u53d1|\u9ed1\u8272\u5934\u53d1/, ['black_hair']],
                [/\bgreen eyes\b|\u7eff\u773c|\u7fe0\u7eff\u8272.*\u773c|\u7eff\u8272.*\u773c/, ['green_eyes']],
                [/\btwin[-_\s]?tails?\b|\btwintails?\b|\u53cc\u9a6c\u5c3e|\u96d9\u99ac\u5c3e/, ['twintails']],
                [/\bwhite streak\b|\bwhite highlight\b|\u767d\u8272\u6311\u67d3|\u767d\u6311\u67d3|\u6311\u67d3/, ['streaked_hair', 'white_streaked_hair']],
                [/\bwhite fur\b|\bear[-_\s]?root(?:s)? fur\b|\bfur at (?:the )?base of (?:cat )?ears?\b|\u8033\u6735\u6839\u90e8.{0,8}\u767d\u6bdb|\u8033\u6839.{0,8}\u767d\u6bdb|\u767d\u8272?\u7ed2\u6bdb/, ['ear_fluff', 'white_fur']],
                [/\bselfie\b|\u81ea\u62cd|\u624b\u673a\u81ea\u62cd|\u624b\u6a5f\u81ea\u62cd/, ['selfie', 'holding_phone']],
                [/\bsmil(e|ing)\b|\u5fae\u7b11|\u7b11\u5bb9/, ['smile']],
                [/\bclose[-_\s]?up\b|\u8fd1\u666f|\u7279\u5199|\u8d34\u8fd1\u5c4f\u5e55/, ['close-up']],
                [/\blying\b|\u8db4\u7740|\u8eba/, ['lying']],
                [/\blandscape\b|\bscenery\b|\u98ce\u666f|\u666f\u8272|\u98ce\u5149/, ['scenery', 'landscape']],
                [/\bmountains?\b|\u5c71|\u5c71\u8109/, ['mountain']],
                [/\blake\b|\u6e56|\u6e56\u6cca/, ['lake']],
                [/\briver\b|\u6cb3|\u6cb3\u6d41/, ['river']],
                [/\bwaterfall\b|\u7011\u5e03/, ['waterfall']],
                [/\bocean\b|\bsea\b|\bbeach\b|\u6d77|\u6d77\u8fb9|\u6d77\u7058/, ['ocean']],
                [/\bforest\b|\u68ee\u6797/, ['forest']],
                [/\bsky\b|\u5929\u7a7a/, ['sky']],
                [/\bclouds?\b|\u4e91|\u4e91\u5c42/, ['cloud']],
                [/\bsunset\b|\u5915\u9633|\u9ec4\u660f|\u665a\u971e/, ['sunset']],
                [/\bsunrise\b|\bdawn\b|\u65e5\u51fa|\u9ece\u660e/, ['sunrise']],
                [/\bnight\b|\u591c\u666f|\u591c\u665a/, ['night']],
                [/\bwide[-_\s]?shot\b|\bpanoramic\b|\u5168\u666f|\u8fdc\u666f/, ['wide_shot']]
            ];
            rules.forEach(([pattern, mapped]) => {
                if (pattern.test(lower) || pattern.test(text)) mapped.forEach(tag => canvasAgentPushDanbooruTag(tags, tag));
            });
            if (tags.length < 5) {
                if (hasHumanIntent) {
                    ['solo', 'full_body', 'looking_at_viewer', 'standing', 'simple_background'].forEach(tag => canvasAgentPushDanbooruTag(tags, tag));
                } else if (hasSceneryIntent) {
                    ['scenery', 'landscape', 'outdoors', 'wide_shot', 'no_humans'].forEach(tag => canvasAgentPushDanbooruTag(tags, tag));
                } else {
                    canvasAgentPushDanbooruTag(tags, 'simple_background');
                }
            }
            return canvasAgentFormatDanbooruPrompt(tags.slice(0, 32), true);
        }

        function firstNonBlankText() {
            for (const value of arguments) {
                if (value === undefined || value === null || Array.isArray(value)) continue;
                if (typeof value === 'object') continue;
                const text = String(value || '').trim();
                if (text) return text;
            }
            return '';
        }

        function themeScopedValue(source, key, theme, fallback) {
            if (!source || typeof source !== 'object') return fallback;
            const raw = source[key];
            if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                if (theme && Object.prototype.hasOwnProperty.call(raw, theme)) return raw[theme];
                const firstKey = Object.keys(raw).find(item => raw[item] !== undefined && raw[item] !== null && raw[item] !== '');
                return firstKey ? raw[firstKey] : fallback;
            }
            return raw !== undefined ? raw : fallback;
        }

        function canvasAgentPresetPromptDefaults(entryOrNode) {
            const entry = ['preset', 'classic'].includes(entryOrNode?.type)
                ? call('getPresetCatalogEntryForNode', null, entryOrNode)
                : entryOrNode;
            const preset = entryOrNode?.preset && typeof entryOrNode.preset === 'object' ? entryOrNode.preset : {};
            const snapshot = preset.snapshot && typeof preset.snapshot === 'object' ? preset.snapshot : {};
            const presetDefaults = preset.defaults && typeof preset.defaults === 'object' ? preset.defaults : {};
            const schema = (entryOrNode?.schema && typeof entryOrNode.schema === 'object')
                ? entryOrNode.schema
                : (entry?.schema && typeof entry.schema === 'object' ? entry.schema : {});
            const themes = Array.isArray(schema.themes) ? schema.themes : [];
            const defaultEngine = entry?.default_engine && typeof entry.default_engine === 'object' ? entry.default_engine : {};
            const schemaSceneFrontend = schema.scene_frontend && typeof schema.scene_frontend === 'object' ? schema.scene_frontend : {};
            const defaultSceneFrontend = defaultEngine.scene_frontend && typeof defaultEngine.scene_frontend === 'object' ? defaultEngine.scene_frontend : {};
            const sceneFrontend = Object.assign({}, schemaSceneFrontend, defaultSceneFrontend);
            const sceneThemes = Array.isArray(sceneFrontend.theme) ? sceneFrontend.theme : [];
            const selectedTheme = entryOrNode?.runtime?.scene_theme
                || schema.default_theme
                || sceneFrontend.default_theme
                || sceneFrontend.defaultTheme
                || themes[0]
                || sceneThemes[0]
                || '';
            const perTheme = schema.per_theme && typeof schema.per_theme === 'object' ? schema.per_theme : {};
            const themeInfo = perTheme[selectedTheme] && typeof perTheme[selectedTheme] === 'object' ? perTheme[selectedTheme] : {};
            const themeDefaults = themeInfo.defaults && typeof themeInfo.defaults === 'object' ? themeInfo.defaults : {};
            const nodeGeneration = entryOrNode?.generation_config && typeof entryOrNode.generation_config === 'object' ? entryOrNode.generation_config : {};
            const nodeGenerationDefaults = nodeGeneration.defaults && typeof nodeGeneration.defaults === 'object' ? nodeGeneration.defaults : {};
            const nodeGenerationOverrides = nodeGeneration.overrides && typeof nodeGeneration.overrides === 'object' ? nodeGeneration.overrides : {};
            const entryGeneration = entry?.generation_config && typeof entry.generation_config === 'object' ? entry.generation_config : {};
            const parseStyles = (value) => {
                if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
                const text = String(value || '').trim();
                if (!text) return [];
                try {
                    const parsed = JSON.parse(text.replace(/'/g, '"'));
                    if (Array.isArray(parsed)) return parsed.map(item => String(item || '').trim()).filter(Boolean);
                } catch (err) {}
                return text.split(',').map(item => item.trim()).filter(Boolean);
            };
            const styles = parseStyles(entryOrNode?.params?.style_selections).length
                ? parseStyles(entryOrNode?.params?.style_selections).slice(0, 6)
                : parseStyles(
                    snapshot.default_styles
                    || presetDefaults.default_styles
                    || preset.default_styles
                    || entry?.default_styles
                    || entry?.styles
                    || nodeGenerationOverrides.style_selections
                    || nodeGenerationDefaults.style_selections
                    || entryGeneration.style_selections
                ).slice(0, 6);
            const prompt = firstNonBlankText(
                entryOrNode?.params?.prompt,
                snapshot.default_prompt,
                snapshot.prompt,
                presetDefaults.default_prompt,
                presetDefaults.prompt,
                preset.default_prompt,
                preset.prompt,
                themeDefaults.prompt,
                themeDefaults.default_prompt,
                entry?.default_prompt,
                entry?.prompt,
                themeScopedValue(sceneFrontend, 'prompt', selectedTheme, '')
            );
            const negative = firstNonBlankText(
                entryOrNode?.params?.negative_prompt,
                snapshot.default_prompt_negative,
                snapshot.negative_prompt,
                presetDefaults.default_prompt_negative,
                presetDefaults.negative_prompt,
                preset.default_prompt_negative,
                preset.negative_prompt,
                themeDefaults.negative_prompt,
                themeDefaults.default_prompt_negative,
                entry?.default_prompt_negative,
                entry?.negative_prompt
            );
            return {
                styles,
                prompt,
                negative_prompt: negative
            };
        }

        function canvasAgentPresetDefaultPrompt(entryOrNode, fallback) {
            return firstNonBlankText(canvasAgentPresetPromptDefaults(entryOrNode).prompt, fallback);
        }

        function canvasAgentPromptLooksDanbooru(text) {
            const value = String(text || '').trim();
            if (!value) return false;
            if (/[\u3400-\u9fff]/.test(value)) return false;
            if (!value.includes(',')) return false;
            const tags = value.split(',').map(item => item.trim()).filter(Boolean);
            if (tags.length < 2) return false;
            if (!tags.every(tag => tag.length <= 64 && /^[a-z0-9_ ()+\-:.]+$/i.test(tag))) return false;
            if (tags.some(tag => canvasAgentDanbooruTagLooksFabricatedForContext(tag))) return false;
            if (/^[a-z][a-z\s-]{1,28}\s+(?:of|with|wearing|standing|sitting|looking|holding)\b/i.test(tags[0])) return false;
            if (/\b(?:there\s+is|portrait\s+of|image\s+of|photo\s+of|depicted\s+as|shown\s+as)\b/i.test(value)) return false;
            if (/[.!?]\s*$/.test(value)) return false;
            return true;
        }

        function canvasAgentPromptLooksDanbooruTagListish(text) {
            const value = String(text || '').trim();
            if (!value || /[\u3400-\u9fff]/.test(value) || !value.includes(',')) return false;
            const tags = value.split(',').map(item => item.trim()).filter(Boolean);
            if (tags.length < 2) return false;
            return tags.every(tag => tag.length <= 80 && /^[a-z0-9_ ()+\-:.]+$/i.test(tag));
        }

        function canvasAgentPromptNeedsTargetRewrite(prompt, target) {
            const key = String(target?.key || '');
            const text = String(prompt || '').trim();
            if (!text) return false;
            if (key === 'sdxl_danbooru') {
                return !canvasAgentPromptLooksDanbooru(text)
                    && !canvasAgentPromptLooksDanbooruTagListish(text);
            }
            if (key === 'anima') {
                return /[\u3400-\u9fff]/.test(text);
            }
            if (key === 'qwen_natural') {
                return canvasAgentPromptLooksDanbooru(text)
                    || canvasAgentPromptLooksDanbooruTagListish(text);
            }
            if (key === 'flux_t5_en') {
                return /[\u3400-\u9fff]/.test(text)
                    || canvasAgentPromptLooksDanbooru(text)
                    || canvasAgentPromptLooksDanbooruTagListish(text);
            }
            if (key === 'outpaint_instruction') {
                return /[\u3400-\u9fff]/.test(text);
            }
            return false;
        }

        function canvasAgentPromptDefaultsForPurpose(purpose, options) {
            const entry = canvasAgentPromptTargetEntryForPurpose(purpose, options || {});
            return canvasAgentPresetPromptDefaults(entry);
        }

        function canvasAgentPresetPromptDefaultsFacts(target, entryOrNode) {
            if (String(target?.key || '') !== 'sdxl_danbooru') return [];
            const defaults = canvasAgentPresetPromptDefaults(entryOrNode);
            const facts = [];
            if (Array.isArray(defaults.styles) && defaults.styles.length) {
                facts.push({ label: t('SDXL styles', 'SDXL 样式'), value: defaults.styles.join(', ') });
            }
            if (defaults.negative_prompt) {
                const value = defaults.negative_prompt.length > 180
                    ? `${defaults.negative_prompt.slice(0, 180).trim()}...`
                    : defaults.negative_prompt;
                facts.push({ label: t('Preset negative', 'Preset 反向'), value });
            }
            return facts;
        }

        function canvasAgentPromptTargetLabel(target) {
            const key = String(target?.key || '').trim();
            const labels = {
                anima: t('Anima / hybrid anime prompt', 'Anima / 混合动漫提示词'),
                minimax_h3: t('MiniMax H3 / structured audiovisual prompt', 'MiniMax H3 / 结构化视听提示词'),
                minimax_h3_image_edit: t('MiniMax H3 / image editing prompt', 'MiniMax H3 / 图像编辑提示词'),
                qwen_natural: t('Qwen / Chinese natural prompt', 'Qwen / 中文自然语言提示词'),
                wan_video_cn: t('Wan / Chinese video prompt', 'Wan / 中文视频动态提示词'),
                flux_t5_en: t('FLUX/T5XXL / English prompt', 'FLUX/T5XXL / 英文提示词'),
                sdxl_danbooru: t('SDXL / Danbooru tags', 'SDXL / Danbooru 标签'),
                outpaint_instruction: t('FLUX outpaint / English prompt', 'FLUX 扩图 / 英文提示词'),
                unknown_default: t('Default queue target', '默认队列目标')
            };
            return labels[key] || labels.unknown_default;
        }

        function canvasAgentFirstObjectValue(obj) {
            if (!obj || typeof obj !== 'object') return '';
            const key = Object.keys(obj).find(item => obj[item] != null && obj[item] !== '');
            return key ? obj[key] : '';
        }

        function canvasAgentPresetTaskMethod(entry) {
            if (!entry || typeof entry !== 'object') return '';
            const defaultEngine = entry.default_engine && typeof entry.default_engine === 'object' ? entry.default_engine : {};
            const backendParams = defaultEngine.backend_params && typeof defaultEngine.backend_params === 'object' ? defaultEngine.backend_params : {};
            const sceneFrontend = defaultEngine.scene_frontend && typeof defaultEngine.scene_frontend === 'object' ? defaultEngine.scene_frontend : {};
            const schema = entry.schema && typeof entry.schema === 'object' ? entry.schema : {};
            const perTheme = schema.per_theme && typeof schema.per_theme === 'object' ? schema.per_theme : {};
            const themeInfo = canvasAgentFirstObjectValue(perTheme) || {};
            const sceneTaskMethod = sceneFrontend.task_method && typeof sceneFrontend.task_method === 'object'
                ? canvasAgentFirstObjectValue(sceneFrontend.task_method)
                : sceneFrontend.task_method;
            return String(entry.task_method || backendParams.task_method || themeInfo.task_method || sceneTaskMethod || '').trim();
        }

        function canvasAgentPresetModelList(entryOrNode) {
            if (!entryOrNode || typeof entryOrNode !== 'object') return [];
            const requirements = entryOrNode.model_requirements && typeof entryOrNode.model_requirements === 'object' ? entryOrNode.model_requirements : {};
            if (Array.isArray(requirements.model_list)) return requirements.model_list.slice();
            if (Array.isArray(entryOrNode.model_list)) return entryOrNode.model_list.slice();
            const catalogEntry = entryOrNode.type === 'preset' ? call('getPresetCatalogEntryForNode', null, entryOrNode) : null;
            if (Array.isArray(catalogEntry?.model_list)) return catalogEntry.model_list.slice();
            return [];
        }

        function canvasAgentPromptTargetFromMeta(meta, purpose) {
            const data = meta && typeof meta === 'object' ? meta : {};
            const modelList = Array.isArray(data.model_list) ? data.model_list : [];
            const promptCompiler = data.prompt_compiler || '';
            const promptCompilerText = typeof promptCompiler === 'string' ? promptCompiler : JSON.stringify(promptCompiler || {});
            const hasH3Compiler = /minimax[_\s-]*h3/i.test(promptCompilerText);
            const name = normalizePresetName(data.name || data.display_name || data.preset || '');
            const backend = String(data.backend_engine || '').trim();
            const taskMethod = String(data.task_method || '').trim();
            const source = String(data.source || data.workflow || '').trim();
            const purposeText = String(purpose || '').toLowerCase();
            const haystack = [
                name,
                data.display_name || '',
                backend,
                taskMethod,
                source,
                data.engine_type || '',
                modelList.join('|')
            ].join('|').toLowerCase();
            let key = purposeText.includes('outpaint') ? 'outpaint_instruction' : 'unknown_default';
            const taskMethodLower = taskMethod.toLowerCase();
            const taskMethodIsChinese = /(?:^|[_-])cn$/.test(taskMethodLower);
            const isH3ImageEdit = hasH3Compiler && (
                /(?:^|[^a-z0-9])r2i(?:$|[^a-z0-9])|reference[_\s-]*to[_\s-]*image|image[_\s-]*edit/i.test(haystack)
                || (purposeText.includes('edit') && !/(?:r2v|video)/i.test(haystack))
            );
            if (key === 'unknown_default' && isH3ImageEdit) key = 'minimax_h3_image_edit';
            if (key === 'unknown_default' && hasH3Compiler) key = 'minimax_h3';
            if (key === 'unknown_default') {
                if (/(^|[^a-z0-9])anima(?:[_\s-]?aio|-base|$|[^a-z0-9])|anima-base-v/i.test(haystack)) key = 'anima';
                else if (taskMethodIsChinese && (purposeText.includes('video') || /wan|umt5/i.test(haystack))) key = 'wan_video_cn';
                else if (taskMethodIsChinese) key = 'qwen_natural';
                else if (/(qwen|z[-_ ]?image|zimage|lumina2|flux2|flux[-_ ]?2)/i.test(haystack)) key = 'qwen_natural';
                else if (/(wan|umt5)/i.test(haystack)) key = 'wan_video_cn';
                else if (/(illustrious|noob|sd15|sdxl|fooocus|pony|danbooru|chenkin|animagine)/i.test(haystack)) key = 'sdxl_danbooru';
                else if (/(flux|t5xxl|t5[-_ ]?xxl)/i.test(haystack)) key = 'flux_t5_en';
            }
            if (key === 'unknown_default') {
                if (purposeText.includes('video')) key = 'wan_video_cn';
                else if (purposeText.includes('edit')) key = 'qwen_natural';
                else if (purposeText.includes('image') || purposeText.includes('t2i')) key = 'qwen_natural';
            }
            const encoder = /(qwen[^|,\s"]*)/i.exec(haystack)?.[1]
                || (/flux2|flux[-_ ]?2/i.test(haystack) ? 'Qwen 8B' : '')
                || /(umt5[^|,\s"]*)/i.exec(haystack)?.[1]
                || /(t5xxl[^|,\s"]*)/i.exec(haystack)?.[1]
                || (/clip_l|sdxl|sd15|fooocus/i.test(haystack) ? 'CLIP/Danbooru' : '');
            const target = {
                key,
                name,
                backend_engine: backend,
                task_method: taskMethod,
                source,
                text_encoder: encoder,
                model_list: modelList.slice(0, 8)
            };
            if (hasH3Compiler) target.prompt_compiler = promptCompiler;
            target.label = canvasAgentPromptTargetLabel(target);
            return target;
        }

        function canvasAgentPromptTargetFromEntry(entry, purpose) {
            if (!entry || typeof entry !== 'object') {
                return canvasAgentPromptTargetFromMeta({ name: '', backend_engine: '', task_method: '', model_list: [] }, purpose);
            }
            const defaultEngine = entry.default_engine && typeof entry.default_engine === 'object' ? entry.default_engine : {};
            const backendParams = defaultEngine.backend_params && typeof defaultEngine.backend_params === 'object' ? defaultEngine.backend_params : {};
            return canvasAgentAttachPromptCompilerContext(canvasAgentPromptTargetFromMeta({
                name: entry.name || entry.display_name || '',
                display_name: entry.display_name || entry.name || '',
                backend_engine: entry.backend_engine || defaultEngine.backend_engine || backendParams.backend_engine || '',
                engine_type: entry.engine_type || defaultEngine.engine_type || '',
                task_method: canvasAgentPresetTaskMethod(entry),
                source: entry.source || (entry.name ? `presets/${entry.name}.json` : ''),
                model_list: canvasAgentPresetModelList(entry),
                prompt_compiler: entry.prompt_compiler || entry.schema?.prompt_compiler || ''
            }, purpose), entry);
        }

        function canvasAgentPromptTargetFromNode(node, purpose) {
            if (!node || typeof node !== 'object') return canvasAgentPromptTargetFromPurpose(purpose, {});
            if (node.type === 'preset') {
                const entry = call('getPresetCatalogEntryForNode', null, node);
                return canvasAgentAttachPromptCompilerContext(canvasAgentPromptTargetFromMeta({
                    name: node.preset?.name || node.title || entry?.name || '',
                    display_name: node.title || entry?.display_name || '',
                    backend_engine: node.runtime?.backend_engine || entry?.backend_engine || '',
                    engine_type: node.runtime?.engine_type || entry?.engine_type || '',
                    task_method: node.runtime?.task_method || canvasAgentPresetTaskMethod(entry),
                    source: node.model_requirements?.source || entry?.source || '',
                    model_list: canvasAgentPresetModelList(node),
                    prompt_compiler: entry?.prompt_compiler || node.schema?.prompt_compiler || ''
                }, purpose), node);
            }
            if (node.type === 'classic') {
                return canvasAgentPromptTargetFromMeta({
                    name: node.title || 'CLASSIC',
                    backend_engine: node.runtime?.backend_engine || '',
                    engine_type: node.runtime?.engine_type || '',
                    task_method: node.runtime?.task_method || '',
                    model_list: []
                }, purpose);
            }
            return canvasAgentPromptTargetFromPurpose(purpose, {});
        }

        function canvasAgentPromptTargetFromPurpose(purpose, options) {
            const opts = options || {};
            const entry = canvasAgentPromptTargetEntryForPurpose(purpose, opts);
            return entry ? canvasAgentPromptTargetFromEntry(entry, purpose) : canvasAgentPromptTargetFromMeta({}, purpose);
        }

        function canvasAgentPromptTargetEntryForPurpose(purpose, options) {
            const opts = options || {};
            const planPreset = normalizePresetName(opts.presetName || opts.plan?.preset || '');
            const purposeText = String(purpose || '').toLowerCase();
            const requestedKind = purposeText.includes('video') && purposeText.includes('edit') ? 'video_edit'
                : (purposeText.includes('image-to-video') || purposeText.includes('image to video') || purposeText.includes('i2v') ? 'i2v'
                : (purposeText.includes('audio+image-to-video') || purposeText.includes('audio to video') || purposeText.includes('audio-to-video') ? 'audio_to_video'
                : (purposeText.includes('text-to-video') || purposeText.includes('text to video') || purposeText.includes('t2v') || purposeText.includes('video') ? 't2v'
                : (purposeText.includes('edit') ? 'edit' : 't2i'))));
            return call('findCanvasAgentPresetEntryByAlias', null, planPreset)
                || call('findPresetCatalogEntryByName', null, planPreset)
                || call('findPresetCatalogEntryByName', null, call('getCanvasAgentPresetQueue', [], requestedKind)[0] || '')
                || null;
        }

        return {
            canvasAgentPromptCompilerContext,
            canvasAgentAttachPromptCompilerContext,
            canvasAgentMergeDanbooruPromptWithContext,
            canvasAgentPushDanbooruTag,
            canvasAgentFormatDanbooruTag,
            canvasAgentFormatDanbooruPrompt,
            canvasAgentDanbooruTagIsLowSignal,
            canvasAgentDanbooruTagLooksFabricated,
            canvasAgentDanbooruTextHasHumanIntent,
            canvasAgentDanbooruTextHasSceneryIntent,
            vlmAgentUserPromptHasAssistantPersonaImageIntent,
            canvasAgentFilterPersonaLeakTags,
            canvasAgentCanonicalDanbooruTagsFromPrompt,
            vlmAgentExplicitSubjectCountsFromText,
            canvasAgentSubjectCountsFromDanbooruTags,
            canvasAgentRepairMultiCharacterDanbooruTags,
            canvasAgentCanonicalizeDanbooruPrompt,
            canvasAgentDanbooruFallbackPrompt,
            canvasAgentPresetPromptDefaults,
            canvasAgentPresetDefaultPrompt,
            canvasAgentPromptLooksDanbooru,
            canvasAgentPromptLooksDanbooruTagListish,
            canvasAgentPromptNeedsTargetRewrite,
            canvasAgentPromptDefaultsForPurpose,
            canvasAgentPresetPromptDefaultsFacts,
            canvasAgentPromptTargetLabel,
            canvasAgentPresetTaskMethod,
            canvasAgentPresetModelList,
            canvasAgentPromptTargetFromMeta,
            canvasAgentPromptTargetFromEntry,
            canvasAgentPromptTargetFromNode,
            canvasAgentPromptTargetFromPurpose,
            canvasAgentPromptTargetEntryForPurpose
        };
    }

    function createCanvasAgentVlmInstructionController(context) {
        const scope = context || {};
        const t = scope.t || ((en, cn) => cn || en);
        const uid = scope.uid || ((prefix) => `${prefix || 'id'}_${Date.now()}`);
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const schedule = typeof scope.setTimeout === 'function' ? scope.setTimeout : globalThis.setTimeout;
        const unschedule = typeof scope.clearTimeout === 'function' ? scope.clearTimeout : globalThis.clearTimeout;
        const getPlannerTimeoutMs = () => Math.max(5000, Number(call('getPlannerTimeoutMs', 90000) || 90000));
        let activeRequest = null;

        function getDefaultProjectId() {
            return String(call('getDefaultProjectId', 'default') || 'default').trim() || 'default';
        }

        function projectIdFor(project) {
            return String(project?.id || getDefaultProjectId()).trim() || getDefaultProjectId();
        }

        function canvasAgentVlmCancelPayload(payload) {
            const body = payload || {};
            const params = body.params && typeof body.params === 'object' ? body.params : {};
            return {
                project_id: String(body.project_id || getDefaultProjectId()).trim(),
                node_id: String(body.node_id || params.node_id || '').trim(),
                conversation_id: String(body.conversation_id || params.conversation_id || '').trim(),
                request_id: String(body.request_id || params.request_id || '').trim()
            };
        }

        function canvasAgentVlmAgentContextPayload(options) {
            const opts = options || {};
            const context = Object.assign({}, call('buildVlmAgentContext', {}, null, {
                userPrompt: opts.userPrompt || opts.prompt || ''
            }) || {}, {
                agent_references: call('normalizeCanvasAgentReferences', []).map(ref => ({
                    role: ref.role,
                    kind: ref.kind,
                    node_id: ref.nodeId || ref.node_id,
                    label: ref.label,
                    meta: ref.meta || {}
                }))
            });
            if (opts.promptTarget && typeof opts.promptTarget === 'object') {
                context.prompt_generation_targets = Object.assign({}, context.prompt_generation_targets || {}, {
                    text_to_image: Object.assign({}, opts.promptTarget)
                });
            }
            return context;
        }

        function projectRequestStillCurrent(request) {
            const currentProject = call('getProject', {}) || {};
            const currentId = projectIdFor(currentProject);
            if (currentId !== request.projectId) return false;
            if (typeof scope.isProjectRequestCurrent === 'function') {
                return scope.isProjectRequestCurrent(request, currentProject) !== false;
            }
            return !request.projectRef || currentProject === request.projectRef;
        }

        function requestStillActive(request) {
            return activeRequest === request && !request.cancelled && !request.timedOut && !request.superseded;
        }

        function resolveInterruptedRequest(request, result) {
            if (typeof request.resolveInterrupted === 'function') {
                request.resolveInterrupted(result);
                request.resolveInterrupted = null;
            }
        }

        function deactivateRequest(request) {
            if (activeRequest === request) activeRequest = null;
        }

        function scheduleBackendCancel(request) {
            const sendCancel = scope.sendCanvasVlmCancelRequest;
            if (typeof sendCancel !== 'function') return Promise.resolve({ ok: false, error: 'VLM cancel API is unavailable' });
            return Promise.resolve(sendCancel(canvasAgentVlmCancelPayload(request.payload))).catch((err) => ({
                ok: false,
                error: err?.message || String(err || 'VLM cancel failed')
            }));
        }

        function interruptRequest(request, kind, error) {
            if (!request || request.finished) return;
            request[kind] = true;
            deactivateRequest(request);
            try { request.controller?.abort(); } catch (err) {}
            resolveInterruptedRequest(request, {
                ok: false,
                aborted: true,
                cancelled: kind === 'cancelled',
                timeout: kind === 'timedOut',
                stale: kind === 'superseded',
                error: error || (kind === 'cancelled'
                    ? t('VLM planner cancelled.', 'VLM 计划已取消。')
                    : (kind === 'timedOut'
                        ? t('VLM planner timed out. The local plan will be used.', 'VLM 计划超时，将使用本地计划。')
                        : t('VLM planner response is no longer current.', 'VLM 计划响应已过期。')))
            });
        }

        async function requestCanvasAgentVlmInstructionPlan(rawPrompt, requestedAction) {
            const prompt = String(rawPrompt || '').trim();
            if (!prompt) return { ok: false, error: t('The Agent instruction is empty.', 'Agent 指令为空。') };

            if (activeRequest) {
                const previousRequest = activeRequest;
                interruptRequest(previousRequest, 'superseded');
                await scheduleBackendCancel(previousRequest);
            }

            const project = call('getProject', {}) || {};
            const projectId = projectIdFor(project);
            const model = String(call('getCanvasAgentRewriteModel', '') || '').trim();
            const target = call('getCanvasAgentTargetNode', null);
            const requestId = uid('vlm_plan');
            const payload = {
                project_id: projectId,
                node_id: 'canvas_agent_instruction_planner',
                request_id: requestId,
                asset_sources: call('getCanvasAgentVlmReferenceSources', [], { fallbackTarget: target }),
                conversation_id: `canvas_agent_plan:${projectId}`,
                chat_messages: [],
                agent_context: canvasAgentVlmAgentContextPayload({ userPrompt: prompt }),
                params: Object.assign({
                    version: model,
                    mode: 'chat',
                    request_id: requestId,
                    prompt: call('canvasAgentInstructionPlanPrompt', '', prompt, requestedAction),
                    system_prompt: 'You are a strict JSON planner and prompt recommender for SimpAI Studio. Use built-in skill docs and image prompting target rules. Return one JSON object only.',
                    save_context: false,
                    agent_use_skills: true,
                    agent_use_canvas_context: true,
                    agent_action_hints: false,
                    output_chinese: false,
                    video_frames: Number(call('getCanvasAgentSettings', {})?.videoFrames || 0),
                    max_tokens: 900,
                    temperature: 0.1,
                    top_p: 0.8,
                    top_k: 20,
                    repetition_penalty: 1.05,
                    seed: -1,
                    free_after: false
                }, model === 'Custom' ? (call('getCanvasAgentCustomRuntimeParams', {}) || {}) : {})
            };
            const controller = typeof AbortController === 'function' ? new AbortController() : null;
            const request = {
                requestId,
                projectId,
                projectRef: project,
                payload,
                controller,
                cancelled: false,
                timedOut: false,
                superseded: false,
                finished: false,
                resolveInterrupted: null
            };
            activeRequest = request;

            let timer = null;
            const interrupted = new Promise(resolve => {
                request.resolveInterrupted = resolve;
            });
            const responsePromise = Promise.resolve()
                .then(() => call('sendCanvasVlmRunRequest', null, payload, controller ? { signal: controller.signal } : {}))
                .catch(err => ({ ok: false, error: err?.message || String(err || 'VLM planner failed') }));
            if (getPlannerTimeoutMs() > 0) {
                timer = schedule(() => {
                    request.timedOut = true;
                    interruptRequest(request, 'timedOut');
                    scheduleBackendCancel(request).catch(() => {});
                }, getPlannerTimeoutMs());
            }

            try {
                const response = await Promise.race([responsePromise, interrupted]);
                if (request.timedOut) {
                    return {
                        ok: false,
                        timeout: true,
                        error: t('VLM planner timed out. The local plan will be used.', 'VLM 计划超时，将使用本地计划。')
                    };
                }
                if (request.cancelled) {
                    return {
                        ok: false,
                        cancelled: true,
                        error: t('VLM planner cancelled.', 'VLM 计划已取消。')
                    };
                }
                if (request.superseded || !requestStillActive(request)) {
                    return { ok: false, stale: true, error: t('VLM planner response is no longer current.', 'VLM 计划响应已过期。') };
                }
                if (!projectRequestStillCurrent(request)) {
                    deactivateRequest(request);
                    return { ok: false, projectChanged: true, stale: true, error: t('The project changed while the Agent was thinking.', 'Agent 思考期间项目已发生变化。') };
                }
                if (!response?.ok) {
                    return { ok: false, error: response?.details || response?.error || t('VLM planner failed.', 'VLM 计划失败。') };
                }
                const parsed = call('extractCanvasAgentJsonObject', null, response.text || '');
                if (!parsed) {
                    return { ok: false, error: t('VLM planner returned no JSON.', 'VLM 计划没有返回 JSON。'), text: response.text || '' };
                }
                const plan = call('normalizeCanvasAgentInstructionPlan', null, parsed, prompt, 'vlm_agent');
                if (!plan) {
                    return { ok: false, error: t('VLM planner returned an invalid plan.', 'VLM 计划格式无效。'), text: response.text || '' };
                }
                return { ok: true, plan, text: response.text || '', request_id: requestId };
            } finally {
                request.finished = true;
                if (timer) unschedule(timer);
                if (activeRequest === request) activeRequest = null;
            }
        }

        async function cancelCanvasAgentVlmInstruction() {
            const request = activeRequest;
            if (!request) return { ok: false, cancelled: false, error: 'no active VLM planner request' };
            request.cancelled = true;
            interruptRequest(request, 'cancelled');
            const cancelResult = await scheduleBackendCancel(request);
            return Object.assign({ ok: true, cancelled: true, request_id: request.requestId }, cancelResult?.ok === false ? { cancel_error: cancelResult.error } : {});
        }

        function getCanvasAgentVlmInstructionRequestState() {
            if (!activeRequest) return null;
            return {
                request_id: activeRequest.requestId,
                project_id: activeRequest.projectId,
                cancelled: !!activeRequest.cancelled,
                timed_out: !!activeRequest.timedOut,
                superseded: !!activeRequest.superseded
            };
        }

        return {
            canvasAgentVlmAgentContextPayload,
            requestCanvasAgentVlmInstructionPlan,
            cancelCanvasAgentVlmInstruction,
            getCanvasAgentVlmInstructionRequestState,
            plannerTimeoutMs: getPlannerTimeoutMs()
        };
    }

    window.SimpAICanvasWorkbenchVlmInstruction = Object.assign({}, window.SimpAICanvasWorkbenchVlmInstruction || {}, {
        createCanvasAgentPromptContext,
        createCanvasAgentVlmInstructionController
    });
})();
