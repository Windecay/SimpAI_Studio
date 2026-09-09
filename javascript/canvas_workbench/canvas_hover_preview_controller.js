(function () {
    'use strict';

    function createCanvasHoverPreviewController(context) {
        const scope = context || {};
        const getDocument = () => scope.document || (typeof document !== 'undefined' ? document : null);
        const getWindow = () => scope.window || (typeof window !== 'undefined' ? window : { innerWidth: 0, innerHeight: 0 });
        const getRoot = () => typeof scope.getRoot === 'function' ? scope.getRoot() : null;
        const getNodesLayer = () => typeof scope.getNodesLayer === 'function' ? scope.getNodesLayer() : null;
        const getNode = (id) => typeof scope.getNode === 'function' ? scope.getNode(id) : null;
        const isCanvasPointerGestureActive = () => (
            typeof scope.isCanvasPointerGestureActive === 'function'
            && scope.isCanvasPointerGestureActive()
        );
        const escapeHtml = typeof scope.escapeHtml === 'function' ? scope.escapeHtml : value => String(value ?? '');
        const t = typeof scope.t === 'function' ? scope.t : ((en, cn) => cn || en);
        const getSystemParams = () => typeof scope.getSystemParams === 'function'
            ? (scope.getSystemParams() || {})
            : (getWindow().simpleaiTopbarSystemParams || {});
        const workbenchStaticFilePath = value => typeof scope.workbenchStaticFilePath === 'function'
            ? scope.workbenchStaticFilePath(value)
            : String(value || '');
        const cssEscape = value => {
            if (typeof scope.cssEscape === 'function') return scope.cssEscape(value);
            if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
            return String(value || '').replace(/["\\]/g, '\\$&');
        };
        const fetchImpl = scope.fetch || (typeof fetch !== 'undefined' ? fetch : null);
        const ImageCtor = scope.Image || (typeof Image !== 'undefined' ? Image : null);
        let hoverPreviewEl = null;
        let hoverPreviewTarget = null;
        let hoverPreviewImageRequestId = 0;
        const hoverPreviewImageCache = new Map();
        const hoverPreviewModelCache = new Map();

        function metaContent(name) {
            if (!name) return '';
            const doc = getDocument();
            const node = doc?.querySelector?.(`meta[name="${String(name).replace(/"/g, '\\"')}"]`);
            return String(node?.getAttribute('content') || '').trim();
        }

        function splitMetaPathList(name) {
            return String(metaContent(name) || '')
                .split(',')
                .map(path => path.split('?')[0].replace(/\\/g, '/').replace(/\/+$/, '').trim())
                .filter(Boolean);
        }

        function uniqueStrings(items) {
            const result = [];
            (items || []).forEach((item) => {
                const text = String(item || '').trim();
                if (text && !result.includes(text)) result.push(text);
            });
            return result;
        }

        function normalizePreviewModelPath(value) {
            const normalized = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
            if (!normalized) return '';
            const parts = normalized.split('/').filter(Boolean);
            if (!parts.length) return '';
            parts[parts.length - 1] = parts[parts.length - 1].replace(/\.[^/.]+$/, '');
            return parts.join('/');
        }

        function isDefaultPreviewModelName(value) {
            const text = String(value || '').trim().toLowerCase();
            return !text || text === 'none' || text === 'default' || text === 'default (model)';
        }

        function appendPreviewPath(basePath, modelPath, extension) {
            const base = String(basePath || '').replace(/\/+$/, '');
            const encoded = String(modelPath || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
            if (!base || !encoded || !extension) return '';
            return `${base}/${encoded}.${extension}`;
        }

        function modelBrowserPreviewRoute(path) {
            let text = String(path || '').trim();
            if (!text || /^(data:|blob:|https?:)/i.test(text)) return '';
            if (text.startsWith('/model-browser/preview')) return text;
            for (const marker of ['/gradio_api/file=', '/file=', 'file=']) {
                const index = text.indexOf(marker);
                if (index >= 0) {
                    text = text.slice(index + marker.length);
                    break;
                }
            }
            text = text.split(/[?#]/, 1)[0];
            try {
                text = decodeURIComponent(text);
            } catch (err) {}
            text = text.replace(/\\/g, '/');
            if (/^\/(model-browser|gradio_api|file=|presets|javascript|css|extensions|assets)\b/i.test(text)) return '';
            if (!/^[a-zA-Z]:\//.test(text) && !text.startsWith('/')) return '';
            return `/model-browser/preview?path=${encodeURIComponent(text)}`;
        }

        function modelPreviewBasePaths(folder) {
            const key = String(folder || '').trim();
            if (!key) return [];
            const roots = [];
            if (key === 'checkpoints') roots.push(...splitMetaPathList('checkpoints-paths'));
            if (key === 'loras') roots.push(...splitMetaPathList('loras-paths'));
            const modelRoot = metaContent('model-path').replace(/\\/g, '/').replace(/\/+$/, '');
            if (modelRoot) roots.push(`${modelRoot}/${key}`);
            return uniqueStrings(roots);
        }

        function modelPreviewCandidates(modelName, folders) {
            const modelPath = normalizePreviewModelPath(modelName);
            const noImage = workbenchStaticFilePath('presets/samples/noimage.jpg');
            if (!modelPath || isDefaultPreviewModelName(modelName)) return [noImage];
            const extensions = ['webp', 'png', 'jpg', 'jpeg'];
            const candidates = [];
            (folders || []).forEach((folder) => {
                modelPreviewBasePaths(folder).forEach((basePath) => {
                    extensions.forEach((extension) => {
                        const candidate = appendPreviewPath(basePath, modelPath, extension);
                        const routed = modelBrowserPreviewRoute(candidate);
                        candidates.push(routed || candidate);
                    });
                });
            });
            candidates.push(noImage);
            return uniqueStrings(candidates);
        }

        function stylePreviewStem(styleName) {
            return String(styleName || '')
                .toLowerCase()
                .replaceAll(' ', '_')
                .replace(/[^a-z0-9_]/g, '');
        }

        function stylePreviewCandidates(styleName) {
            const samplesPath = metaContent('samples-path') || workbenchStaticFilePath('sdxl_styles/samples/fooocus_v2.jpg');
            const stem = stylePreviewStem(styleName);
            const defaultUrl = samplesPath.replace('fooocus_v2', 'default_style');
            const candidateUrl = samplesPath.replace('fooocus_v2', stem || 'default_style');
            return uniqueStrings([candidateUrl, defaultUrl]);
        }

        function firstPreviewImageField(source) {
            if (!source) return '';
            if (typeof source === 'string') return source;
            if (Array.isArray(source)) {
                for (const item of source) {
                    const value = firstPreviewImageField(item);
                    if (value) return value;
                }
                return '';
            }
            if (typeof source !== 'object') return '';
            for (const key of ['preview_url', 'preview', 'thumbnail', 'thumb', 'image', 'cover', 'path']) {
                const value = source[key];
                if (typeof value === 'string' && value.trim()) return value.trim();
                if (value && typeof value === 'object') {
                    const nested = firstPreviewImageField(value);
                    if (nested) return nested;
                }
            }
            return '';
        }

        function previewMetadataForModel(modelName, kind, node) {
            const catalog = node?.config?.catalog || getSystemParams().__canvas_model_catalog || {};
            const keys = kind === 'lora'
                ? ['lora_previews', 'lora_preview_images', 'lora_metadata', 'loras']
                : ['model_previews', 'model_preview_images', 'model_metadata', 'models', `${kind || 'model'}_previews`];
            const normalized = String(modelName || '').replace(/\\/g, '/').toLowerCase();
            const basename = normalized.split('/').pop();
            for (const key of keys) {
                const source = catalog?.[key];
                if (!source) continue;
                if (Array.isArray(source)) {
                    const match = source.find((item) => {
                        const name = String(item?.name || item?.model || item?.filename || item?.path || '').replace(/\\/g, '/').toLowerCase();
                        return name === normalized || name.endsWith(`/${basename}`) || name === basename;
                    });
                    if (match) {
                        return {
                            image: firstPreviewImageField(match),
                            description: String(match.description || match.info || match.note || '').trim()
                        };
                    }
                    continue;
                }
                if (typeof source === 'object') {
                    const entry = source[modelName] || source[normalized] || source[basename];
                    if (entry) {
                        return {
                            image: firstPreviewImageField(entry),
                            description: typeof entry === 'object' ? String(entry.description || entry.info || entry.note || '').trim() : ''
                        };
                    }
                }
            }
            return { image: '', description: '' };
        }

        function previewKindIcon(kind) {
            if (kind === 'style') return 'fa-palette';
            if (kind === 'lora') return 'fa-cubes';
            if (kind === 'model') return 'fa-boxes-stacked';
            return 'fa-image';
        }

        function previewKindLabel(kind) {
            if (kind === 'style') return t('Style', '风格');
            if (kind === 'lora') return 'LoRA';
            if (kind === 'model') return t('Model', '模型');
            return t('Preview', '预览');
        }

        function breakablePreviewText(value) {
            return escapeHtml(value)
                .replace(/([\\/_.-])/g, '$1<wbr>')
                .replace(/([a-zA-Z0-9]{18})/g, '$1<wbr>');
        }

        function ensureHoverPreview() {
            if (hoverPreviewEl && hoverPreviewEl.isConnected) return hoverPreviewEl;
            const doc = getDocument();
            if (!doc?.createElement) return null;
            hoverPreviewEl = doc.createElement('div');
            hoverPreviewEl.className = 'sai-hover-preview';
            hoverPreviewEl.hidden = true;
            hoverPreviewEl.setAttribute('role', 'tooltip');
            (getRoot() || doc.body)?.appendChild?.(hoverPreviewEl);
            return hoverPreviewEl;
        }

        function positionHoverPreview(clientX, clientY) {
            if (!hoverPreviewEl || hoverPreviewEl.hidden) return;
            const pad = 12;
            const offset = 16;
            const rect = hoverPreviewEl.getBoundingClientRect();
            const viewport = getWindow();
            let left = clientX + offset;
            let top = clientY + offset;
            if (left + rect.width + pad > viewport.innerWidth) left = Math.max(pad, clientX - rect.width - offset);
            if (top + rect.height + pad > viewport.innerHeight) top = Math.max(pad, clientY - rect.height - offset);
            hoverPreviewEl.style.left = `${Math.round(left)}px`;
            hoverPreviewEl.style.top = `${Math.round(top)}px`;
        }

        function renderHoverPreview(payload, imageSrc, imageLoading) {
            const preview = ensureHoverPreview();
            if (!preview) return;
            const kind = String(payload?.kind || 'preview');
            const prompt = String(payload?.prompt || '').trim();
            const negative = String(payload?.negative || '').trim();
            const description = String(payload?.description || '').trim();
            const subtitle = String(payload?.subtitle || '').trim();
            const meta = String(payload?.meta || '').trim();
            const imageHtml = imageSrc
                ? `<div class="sai-hover-preview-image"><img src="${escapeHtml(imageSrc)}" alt=""></div>`
                : `<div class="sai-hover-preview-image sai-hover-preview-empty"><i class="fa-solid ${previewKindIcon(kind)}"></i><span>${escapeHtml(imageLoading ? t('Loading preview...', '正在读取预览...') : t('No preview image', '暂无预览图'))}</span></div>`;
            preview.innerHTML = `
<div class="sai-hover-preview-head">
  <span><i class="fa-solid ${previewKindIcon(kind)}"></i>${escapeHtml(previewKindLabel(kind))}</span>
  ${subtitle ? `<small>${escapeHtml(subtitle)}</small>` : ''}
</div>
${imageHtml}
<div class="sai-hover-preview-title">${breakablePreviewText(payload?.title || '')}</div>
${description ? `<div class="sai-hover-preview-desc">${escapeHtml(description)}</div>` : ''}
${prompt ? `<div class="sai-hover-preview-text"><b>${escapeHtml(t('Prompt', '提示词'))}</b><p>${escapeHtml(prompt)}</p></div>` : ''}
${negative ? `<div class="sai-hover-preview-text"><b>${escapeHtml(t('Negative', '负向'))}</b><p>${escapeHtml(negative)}</p></div>` : ''}
${meta ? `<div class="sai-hover-preview-meta">${escapeHtml(meta)}</div>` : ''}
`;
        }

        function findFirstPreviewImage(candidates, callback) {
            const list = uniqueStrings(candidates);
            if (!list.length) {
                callback('');
                return;
            }
            const key = list.join('|');
            if (hoverPreviewImageCache.has(key)) {
                callback(hoverPreviewImageCache.get(key) || '');
                return;
            }
            if (typeof ImageCtor !== 'function') {
                hoverPreviewImageCache.set(key, '');
                callback('');
                return;
            }
            let index = 0;
            const tryNext = () => {
                if (index >= list.length) {
                    hoverPreviewImageCache.set(key, '');
                    callback('');
                    return;
                }
                const src = list[index++];
                const image = new ImageCtor();
                image.onload = () => {
                    hoverPreviewImageCache.set(key, src);
                    callback(src);
                };
                image.onerror = tryNext;
                image.src = src;
            };
            tryNext();
        }

        function hoverPreviewCandidates(payload) {
            if (!payload) return [];
            if (payload.image) {
                const routed = modelBrowserPreviewRoute(payload.image);
                return uniqueStrings([routed, payload.image]);
            }
            if (payload.kind === 'style') return stylePreviewCandidates(payload.styleName || payload.title);
            if (payload.kind === 'model' || payload.kind === 'lora') return modelPreviewCandidates(payload.title, payload.folders || []);
            return [];
        }

        function modelBrowserTypeForHoverPayload(payload) {
            if (payload?.modelType) return payload.modelType;
            if (payload?.kind === 'lora') return 'lora';
            const folders = Array.isArray(payload?.folders) ? payload.folders : [];
            if (folders.includes('upscale_models')) return 'upscale';
            if (folders.includes('loras')) return 'lora';
            if (String(payload?.subtitle || '').toLowerCase().includes('refiner')) return 'refiner';
            return 'base';
        }

        async function fetchModelBrowserHoverPreview(payload) {
            if (!payload || !['model', 'lora'].includes(payload.kind)) return '';
            const name = String(payload.title || '').trim();
            if (!name || isDefaultPreviewModelName(name) || typeof fetchImpl !== 'function') return '';
            const type = modelBrowserTypeForHoverPayload(payload);
            const cacheKey = `${type}:${name}`;
            if (hoverPreviewModelCache.has(cacheKey)) return hoverPreviewModelCache.get(cacheKey) || '';
            try {
                const response = await fetchImpl('/model-browser/detail', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type, name })
                });
                if (!response.ok) {
                    hoverPreviewModelCache.set(cacheKey, '');
                    return '';
                }
                const data = await response.json().catch(() => null);
                const url = String(data?.item?.preview_url || '');
                hoverPreviewModelCache.set(cacheKey, url);
                return url;
            } catch (err) {
                hoverPreviewModelCache.set(cacheKey, '');
                return '';
            }
        }

        function modelHoverPreviewPayload(el, options) {
            const optionValue = options && Object.prototype.hasOwnProperty.call(options, 'value')
                ? options.value
                : (el?.getAttribute?.('data-preview-option-value') ?? undefined);
            const nodeId = el?.closest?.('[data-node-id]')?.getAttribute('data-node-id')
                || el?.getAttribute?.('data-preview-node-id')
                || '';
            const nodesLayer = getNodesLayer();
            const nodeEl = nodeId && nodesLayer
                ? nodesLayer.querySelector(`[data-node-id="${cssEscape(nodeId)}"]`)
                : el?.closest?.('[data-node-id]');
            const node = nodeId ? getNode(nodeId) : (nodeEl ? getNode(nodeEl.getAttribute('data-node-id')) : null);
            if (!nodeEl) return null;
            const loraIndexRaw = options?.loraIndex ?? el.getAttribute('data-model-preview-lora-index');
            if (loraIndexRaw !== null) {
                const index = Number(loraIndexRaw);
                const select = nodeEl.querySelector(`[data-config-lora-model="${index}"]`);
                const weight = nodeEl.querySelector(`[data-config-lora-weight="${index}"]`);
                const modelName = optionValue !== undefined ? optionValue : (select?.value || 'None');
                const meta = previewMetadataForModel(modelName, 'lora', node);
                return {
                    kind: 'lora',
                    modelType: 'lora',
                    title: modelName,
                    subtitle: `LoRA ${Number.isFinite(index) ? index + 1 : ''}`.trim(),
                    meta: weight ? `${t('Weight', '权重')}: ${weight.value}` : '',
                    image: meta.image,
                    description: meta.description,
                    folders: ['loras']
                };
            }
            const key = options?.key || el.getAttribute('data-model-preview-param');
            if (!key) return null;
            const select = el.matches?.('select') ? el : nodeEl.querySelector(`[data-config-param="${cssEscape(key)}"]`);
            const modelName = optionValue !== undefined ? optionValue : (select?.value || node?.config?.values?.[key] || '');
            const labels = {
                base_model: t('Base Model', '基础模型'),
                refiner_model: t('Refiner', '精修模型'),
                clip_model: 'CLIP',
                vae: 'VAE',
                upscale_model: t('Upscale Model', '放大模型')
            };
            const foldersByKey = {
                base_model: ['checkpoints', 'diffusion_models'],
                refiner_model: ['checkpoints', 'diffusion_models'],
                clip_model: ['clip'],
                vae: ['vae'],
                upscale_model: ['upscale_models']
            };
            const typeByKey = {
                base_model: 'base',
                refiner_model: 'refiner',
                upscale_model: 'upscale',
                clip_model: 'clip',
                vae: 'vae'
            };
            const meta = previewMetadataForModel(modelName, key, node);
            return {
                kind: 'model',
                modelType: typeByKey[key] || 'base',
                title: modelName || t('Default model', '默认模型'),
                subtitle: labels[key] || key,
                description: meta.description || (isDefaultPreviewModelName(modelName) ? t('Uses the preset or backend default.', '使用预设或后端默认值。') : ''),
                image: meta.image,
                folders: foldersByKey[key] || ['checkpoints']
            };
        }

        function staticHoverPreviewPayload(el) {
            const kind = String(el?.getAttribute?.('data-hover-preview-kind') || '').trim();
            if (!kind) return null;
            return {
                kind,
                title: String(el.getAttribute('data-hover-preview-title') || '').trim(),
                subtitle: String(el.getAttribute('data-hover-preview-subtitle') || '').trim(),
                description: String(el.getAttribute('data-hover-preview-description') || '').trim(),
                prompt: String(el.getAttribute('data-hover-preview-prompt') || '').trim(),
                negative: String(el.getAttribute('data-hover-preview-negative') || '').trim(),
                meta: String(el.getAttribute('data-hover-preview-meta') || '').trim(),
                image: String(el.getAttribute('data-hover-preview-image') || '').trim(),
                styleName: String(el.getAttribute('data-hover-preview-style') || '').trim()
            };
        }

        function hoverPreviewPayloadFromElement(el) {
            if (!el) return null;
            if (el.hasAttribute?.('data-model-preview-param') || el.hasAttribute?.('data-model-preview-lora-index')) {
                return modelHoverPreviewPayload(el);
            }
            return staticHoverPreviewPayload(el);
        }

        function hoverPreviewElementFromTarget(target) {
            if (!target?.closest) return null;
            return target.closest('[data-hover-preview-kind],[data-model-preview-param],[data-model-preview-lora-index]');
        }

        function showHoverPreviewFor(target, clientX, clientY) {
            if (isCanvasPointerGestureActive()) return;
            const root = getRoot();
            if (!target || root?.hidden) return;
            const payload = hoverPreviewPayloadFromElement(target);
            if (!payload || !payload.title) return;
            if (typeof scope.hideCanvasTooltip === 'function') scope.hideCanvasTooltip();
            hoverPreviewTarget = target;
            const requestId = ++hoverPreviewImageRequestId;
            const initialImage = modelBrowserPreviewRoute(payload.image || '') || payload.image || '';
            renderHoverPreview(payload, initialImage, !initialImage);
            const preview = ensureHoverPreview();
            if (!preview) return;
            preview.hidden = false;
            preview.classList.add('is-visible');
            positionHoverPreview(clientX, clientY);
            if (initialImage) return;
            if (payload.kind === 'model' || payload.kind === 'lora') {
                fetchModelBrowserHoverPreview(payload).then((src) => {
                    if (requestId !== hoverPreviewImageRequestId || hoverPreviewTarget !== target) return;
                    renderHoverPreview(payload, src, false);
                    positionHoverPreview(clientX, clientY);
                });
                return;
            }
            findFirstPreviewImage(hoverPreviewCandidates(payload), (src) => {
                if (requestId !== hoverPreviewImageRequestId || hoverPreviewTarget !== target) return;
                renderHoverPreview(payload, src, false);
                positionHoverPreview(clientX, clientY);
            });
        }

        function hideHoverPreview() {
            hoverPreviewTarget = null;
            hoverPreviewImageRequestId += 1;
            if (hoverPreviewEl) {
                hoverPreviewEl.classList.remove('is-visible');
                hoverPreviewEl.hidden = true;
            }
        }

        function onHoverPreviewPointerOver(evt) {
            if (isCanvasPointerGestureActive()) {
                if (hoverPreviewTarget) hideHoverPreview();
                return;
            }
            const target = hoverPreviewElementFromTarget(evt.target);
            if (!target || target === hoverPreviewTarget) return;
            showHoverPreviewFor(target, evt.clientX, evt.clientY);
        }

        function onHoverPreviewPointerMove(evt) {
            if (isCanvasPointerGestureActive()) {
                if (hoverPreviewTarget) hideHoverPreview();
                return;
            }
            if (!hoverPreviewTarget) return;
            if (!hoverPreviewTarget.isConnected) {
                hideHoverPreview();
                return;
            }
            positionHoverPreview(evt.clientX, evt.clientY);
        }

        function onHoverPreviewPointerOut(evt) {
            if (!hoverPreviewTarget) return;
            if (evt.relatedTarget && hoverPreviewTarget.contains?.(evt.relatedTarget)) return;
            hideHoverPreview();
        }

        function onHoverPreviewFocusIn(evt) {
            if (isCanvasPointerGestureActive()) return;
            const target = hoverPreviewElementFromTarget(evt.target);
            if (!target) return;
            const rect = target.getBoundingClientRect();
            showHoverPreviewFor(target, rect.left + rect.width / 2, rect.bottom);
        }

        return {
            metaContent,
            splitMetaPathList,
            uniqueStrings,
            normalizePreviewModelPath,
            isDefaultPreviewModelName,
            appendPreviewPath,
            modelBrowserPreviewRoute,
            modelPreviewBasePaths,
            modelPreviewCandidates,
            stylePreviewStem,
            stylePreviewCandidates,
            firstPreviewImageField,
            previewMetadataForModel,
            previewKindIcon,
            previewKindLabel,
            breakablePreviewText,
            ensureHoverPreview,
            positionHoverPreview,
            renderHoverPreview,
            findFirstPreviewImage,
            hoverPreviewCandidates,
            modelBrowserTypeForHoverPayload,
            fetchModelBrowserHoverPreview,
            modelHoverPreviewPayload,
            staticHoverPreviewPayload,
            hoverPreviewPayloadFromElement,
            hoverPreviewElementFromTarget,
            showHoverPreviewFor,
            hideHoverPreview,
            onHoverPreviewPointerOver,
            onHoverPreviewPointerMove,
            onHoverPreviewPointerOut,
            onHoverPreviewFocusIn
        };
    }

    window.SimpAICanvasWorkbenchHoverPreviewController = Object.assign({}, window.SimpAICanvasWorkbenchHoverPreviewController || {}, {
        createCanvasHoverPreviewController
    });
})();
