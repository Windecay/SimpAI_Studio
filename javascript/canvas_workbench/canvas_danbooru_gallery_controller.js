(function () {
    'use strict';

    const DEFAULT_ENDPOINT = '/canvas-workbench/danbooru-gallery';

    function delegate(source, name) {
        if (typeof source?.[name] !== 'function') return null;
        return (...args) => source[name](...args);
    }

    function sourceValue(group, scope, name, fallback) {
        if (group && Object.prototype.hasOwnProperty.call(group, name)) return group[name];
        if (Object.prototype.hasOwnProperty.call(scope, name)) return scope[name];
        return fallback;
    }

    function createCanvasDanbooruGalleryController(source) {
        const scope = source?.danbooruGallerySource || source || {};
        const configSource = scope.configSource || {};
        const languageSource = scope.languageSource || {};
        const networkSource = scope.networkSource || {};
        const browserSource = scope.browserSource || {};
        const timeSource = scope.timeSource || {};
        const nodeSource = scope.nodeSource || {};
        const viewportSource = scope.viewportSource || {};
        const metadataSource = scope.metadataSource || {};
        const patchSource = scope.patchSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const uiSource = scope.uiSource || {};
        const pick = (group, name) => delegate(group, name) || delegate(scope, name);
        const endpoint = String(sourceValue(configSource, scope, 'endpoint', DEFAULT_ENDPOINT) || DEFAULT_ENDPOINT);
        const fetchImpl = pick(networkSource, 'fetch');
        const fileCtor = sourceValue(browserSource, scope, 'File', null);
        const searchParamsCtor = sourceValue(browserSource, scope, 'URLSearchParams', null);
        const now = pick(timeSource, 'now') || (() => 0);
        const nowIso = pick(timeSource, 'nowIso') || (() => '');
        const translate = pick(languageSource, 't') || ((en, cn) => cn || en);
        const showToast = pick(uiSource, 'showToast') || (() => {});

        function t(en, cn, state) {
            return translate(en, cn, state);
        }

        function currentTime() {
            const value = Number(now());
            return Number.isFinite(value) ? value : 0;
        }

        function danbooruGalleryImageProxyUrl(url) {
            return `${endpoint}/image-proxy?url=${encodeURIComponent(url || '')}`;
        }

        function danbooruPostExtension(post) {
            const ext = String(post?.file_ext || '').trim().toLowerCase();
            if (ext) return ext;
            const url = String(post?.file_url || post?.large_file_url || post?.preview_file_url || '').split(/[?#]/, 1)[0];
            return (url.match(/\.([a-z0-9]+)$/i)?.[1] || 'jpg').toLowerCase();
        }

        function danbooruPostMediaType(post) {
            const ext = danbooruPostExtension(post);
            return ['webm', 'mp4', 'mov'].includes(ext) ? 'video' : 'image';
        }

        function danbooruPostPrompt(post) {
            if (!post) return '';
            const groups = [
                post.tag_string_character,
                post.tag_string_copyright,
                post.tag_string_general,
                post.tag_string_meta,
            ].filter(Boolean).join(' ');
            const sourceText = groups || post.tag_string || '';
            return sourceText.split(/\s+/).map(tag => tag.trim()).filter(Boolean).join(', ');
        }

        function normalizeDanbooruBrowserPost(post) {
            if (!post || !post.id) return null;
            const previewUrl = post.preview_file_url
                ? danbooruGalleryImageProxyUrl(post.preview_file_url + (post.md5 ? `?v=${post.md5}` : ''))
                : '';
            const fullUrl = post.file_url || post.large_file_url || post.preview_file_url || '';
            const title = `danbooru_${post.id}.${post.file_ext || danbooruPostExtension(post)}`;
            const prompt = danbooruPostPrompt(post);
            return {
                id: `danbooru:${post.id}`,
                name: title,
                title,
                media_type: danbooruPostMediaType(post),
                preview_url: previewUrl,
                file_url: fullUrl,
                post_url: `https://danbooru.donmai.us/posts/${post.id}`,
                rating: post.rating || '',
                width: post.image_width || null,
                height: post.image_height || null,
                size: post.file_size || 0,
                prompt,
                generation_metadata: {
                    ok: true,
                    source: 'danbooru',
                    prompt,
                    parameters: {
                        post_id: post.id,
                        rating: post.rating || '',
                        score: post.score || '',
                        source: post.source || ''
                    },
                    raw_keys: ['tag_string_character', 'tag_string_copyright', 'tag_string_general', 'tag_string_meta']
                },
                raw: post
            };
        }

        async function fetchDanbooruGalleryPosts(state) {
            if (typeof fetchImpl !== 'function') throw new Error('Danbooru gallery fetch is unavailable');
            if (typeof searchParamsCtor !== 'function') throw new Error('URLSearchParams is unavailable');
            const params = new searchParamsCtor();
            params.set('search[tags]', state.danbooruQuery || '');
            params.set('limit', '40');
            params.set('page', String(Math.max(1, Number(state.page || 1))));
            if (state.rating && state.rating !== 'all') params.set('search[rating]', state.rating);
            const response = await fetchImpl(`${endpoint}/posts?${params.toString()}`);
            let payload = null;
            try {
                payload = await response.json();
            } catch (err) {
                payload = null;
            }
            if (!response.ok || payload?.ok === false) {
                const detail = String(payload?.details || '').replace(/\s+/g, ' ').slice(0, 240);
                const message = payload?.error
                    ? (detail ? `${payload.error}: ${detail}` : payload.error)
                    : (detail || `Danbooru Gallery HTTP ${response.status}`);
                throw new Error(message);
            }
            const posts = Array.isArray(payload) ? payload : (Array.isArray(payload?.posts) ? payload.posts : (Array.isArray(payload?.items) ? payload.items : []));
            const items = (Array.isArray(posts) ? posts : []).map(normalizeDanbooruBrowserPost).filter(Boolean);
            const page = Math.max(1, Number(state.page || 1) || 1);
            const hasMore = payload && typeof payload.has_more === 'boolean' ? payload.has_more : items.length >= 40;
            const nextPage = payload?.next_page || (hasMore ? page + 1 : null);
            return { ok: true, items, page, has_more: hasMore, next_page: nextPage };
        }

        async function importDanbooruGalleryPost(item, world) {
            const url = item?.file_url || item?.preview_url || '';
            if (!url) {
                showToast(t('Danbooru post has no importable file URL.', '该 Danbooru 条目没有可导入文件地址。'));
                return null;
            }
            if (typeof fetchImpl !== 'function') throw new Error('Danbooru gallery fetch is unavailable');
            if (typeof fileCtor !== 'function') throw new Error('File constructor is unavailable');
            showToast(t('Importing Danbooru media...', '正在导入 Danbooru 媒体...'));
            const response = await fetchImpl(danbooruGalleryImageProxyUrl(url));
            if (!response.ok) throw new Error(`Danbooru media HTTP ${response.status}`);
            const blob = await response.blob();
            const ext = danbooruPostExtension(item.raw || item);
            const mime = blob.type || (item.media_type === 'video' ? 'video/mp4' : 'image/jpeg');
            const file = new fileCtor([blob], item.name || `danbooru_${currentTime()}.${ext}`, { type: mime });
            const centerWorld = pick(viewportSource, 'viewportCenterWorld');
            const addMediaNodeFromFile = pick(nodeSource, 'addMediaNodeFromFile');
            const node = typeof addMediaNodeFromFile === 'function'
                ? await addMediaNodeFromFile(file, world || (typeof centerWorld === 'function' ? centerWorld() : null))
                : null;
            if (node) {
                const metadata = pick(metadataSource, 'mediaBrowserItemMetadata');
                const generationMetadata = typeof metadata === 'function' ? metadata(item) : {};
                const buildState = pick(patchSource, 'buildMediaNodeStatePatch');
                const buildSource = pick(patchSource, 'buildMediaNodeSourcePatch');
                const buildAssetMetadata = pick(patchSource, 'buildAssetMetadataPatch');
                if (typeof buildState === 'function') {
                    Object.assign(node, buildState(node, { title: item.name || node.title }));
                }
                if (typeof buildSource === 'function') {
                    Object.assign(node, buildSource(node, {
                        kind: 'danbooru_gallery',
                        post_id: String(item.raw?.id || '').trim(),
                        post_url: item.post_url || '',
                        original_url: url,
                        prompt: item.prompt || '',
                        generation_metadata: generationMetadata,
                        imported_at: nowIso()
                    }));
                }
                if (node.asset && typeof buildState === 'function' && typeof buildAssetMetadata === 'function') {
                    Object.assign(node, buildState(node, {
                        asset: buildAssetMetadata(node.asset, {
                            original_url: url,
                            danbooru_post_id: item.raw?.id || '',
                            generation_metadata: generationMetadata
                        })
                    }));
                }
                const mutate = pick(runtimeSource, 'mutate');
                if (typeof mutate === 'function') mutate({ inspector: true });
                showToast(t('Danbooru media added to canvas.', 'Danbooru 媒体已加入画布。'));
            } else {
                showToast(t('Media import failed.', '媒体导入失败。'));
            }
            return node;
        }

        return {
            fetchDanbooruGalleryPosts,
            danbooruGalleryImageProxyUrl,
            normalizeDanbooruBrowserPost,
            danbooruPostExtension,
            danbooruPostMediaType,
            danbooruPostPrompt,
            importDanbooruGalleryPost
        };
    }

    window.SimpAICanvasWorkbenchDanbooruGallery = Object.assign(
        {},
        window.SimpAICanvasWorkbenchDanbooruGallery || {},
        {
            createCanvasDanbooruGalleryController,
            DEFAULT_ENDPOINT
        }
    );
})();
