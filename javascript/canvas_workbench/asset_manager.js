(function () {
    'use strict';

    function call(context, name, fallback, ...args) {
        return typeof context?.[name] === 'function' ? context[name](...args) : fallback;
    }

    function t(context, en, cn) {
        return call(context, 't', cn || en, en, cn);
    }

    function escapeHtml(context, value) {
        return call(context, 'escapeHtml', String(value ?? ''), value);
    }

    function getDocument(context) {
        return call(context, 'getDocument', typeof document !== 'undefined' ? document : null);
    }

    function getClipboard(context) {
        return call(context, 'getClipboard', typeof navigator !== 'undefined' ? navigator.clipboard : null);
    }

    function confirmAction(context, message) {
        return call(context, 'confirm', false, message);
    }

    function setAssetRoot(context, root) {
        call(context, 'setAssetRoot', null, root);
    }

    function writeClipboardText(context, value) {
        const clipboard = getClipboard(context);
        if (!clipboard || typeof clipboard.writeText !== 'function') {
            return Promise.reject(new Error('clipboard is unavailable'));
        }
        try {
            return Promise.resolve(clipboard.writeText(value));
        } catch (error) {
            return Promise.reject(error);
        }
    }

    function normalizeAssetPath(path) {
        return String(path || '').replace(/\\/g, '/');
    }

    function getAssetIdentity(asset, fallback) {
        if (!asset || typeof asset !== 'object') return fallback || '';
        return normalizeAssetPath(asset.asset_relative_path || asset.relative_path || asset.path || asset.output_path || asset.original_output_path || '') || asset.asset_id || asset.preview_url || fallback || '';
    }

    function cloneValue(context, value, fallback) {
        if (typeof context?.cloneValue === 'function') return context.cloneValue(value, fallback);
        if (typeof context?.structuredClone === 'function') {
            try { return context.structuredClone(value ?? fallback); } catch (err) {}
        }
        if (typeof structuredClone === 'function') {
            try { return structuredClone(value ?? fallback); } catch (err) {}
        }
        try {
            return JSON.parse(JSON.stringify(value ?? fallback));
        } catch (err) {
            return fallback;
        }
    }

    function addAssetReference(map, asset, ref, context) {
        if (!asset || typeof asset !== 'object') return;
        const key = getAssetIdentity(asset, ref?.fallback);
        if (!key) return;
        if (!map.has(key)) {
            map.set(key, {
                key,
                asset: cloneValue(context, asset, {}),
                paths: new Set(),
                nodes: [],
                runs: [],
                roles: new Set()
            });
        }
        const item = map.get(key);
        [asset.asset_relative_path, asset.relative_path, asset.path, asset.output_path, asset.original_output_path].forEach((path) => {
            const normalized = normalizeAssetPath(path);
            if (normalized) item.paths.add(normalized);
        });
        if (ref?.node && !item.nodes.some(node => node.id === ref.node.id)) item.nodes.push(ref.node);
        if (ref?.run && !item.runs.some(run => run.id === ref.run.id)) item.runs.push(ref.run);
        if (ref?.role) item.roles.add(ref.role);
    }

    function getProject(context) {
        const project = typeof context?.getProject === 'function' ? context.getProject() : null;
        return project && typeof project === 'object' ? project : {};
    }

    function collectProjectAssetReferences(context) {
        const project = getProject(context);
        const map = new Map();
        (Array.isArray(project.nodes) ? project.nodes : []).forEach((node) => {
            addAssetReference(map, node.asset, { node, role: `${node.type}:main`, fallback: `${node.id}:asset` }, context);
            if (Array.isArray(node.assets)) {
                node.assets.forEach((asset, index) => addAssetReference(map, asset, { node, role: `${node.type}:stack:${index + 1}`, fallback: `${node.id}:asset:${index}` }, context));
            }
            if (node.mask) addAssetReference(map, node.mask, { node, role: `${node.type}:mask`, fallback: `${node.id}:mask` }, context);
        });
        (Array.isArray(project.runs) ? project.runs : []).forEach((run) => {
            addAssetReference(map, run.asset, { run, role: 'run:main', fallback: `${run.id}:asset` }, context);
            if (Array.isArray(run.assets)) {
                run.assets.forEach((asset, index) => addAssetReference(map, asset, { run, role: `run:stack:${index + 1}`, fallback: `${run.id}:asset:${index}` }, context));
            }
        });
        return Array.from(map.values()).map((item) => Object.assign({}, item, {
            paths: Array.from(item.paths),
            roles: Array.from(item.roles)
        }));
    }

    function projectId(context) {
        const project = getProject(context);
        const currentId = typeof context?.getProjectId === 'function' ? context.getProjectId() : '';
        return project.id || currentId || 'default';
    }

    function formatBytes(context, bytes) {
        return call(context, 'formatBytes', '', bytes);
    }

    function delegate(context, name) {
        if (typeof context?.[name] !== 'function') return undefined;
        return (...args) => context[name](...args);
    }

    function createAssetManagerContext(source) {
        const scope = source?.assetManagerSource || source || {};
        const languageSource = scope.languageSource || {};
        const utilitySource = scope.utilitySource || {};
        const domSource = scope.domSource || {};
        const browserSource = scope.browserSource || {};
        const projectSource = scope.projectSource || {};
        const assetSource = scope.assetSource || {};
        const viewportSource = scope.viewportSource || {};
        const viewSource = scope.viewSource || {};
        const uiSource = scope.uiSource || {};
        const stateSource = scope.stateSource || {};
        return {
            t: typeof languageSource.t === 'function' ? languageSource.t : ((en, cn) => cn || en),
            escapeHtml: typeof utilitySource.escapeHtml === 'function' ? utilitySource.escapeHtml : (value => String(value ?? '')),
            cloneValue: delegate(utilitySource, 'cloneValue'),
            structuredClone: delegate(utilitySource, 'structuredClone'),
            formatBytes: delegate(utilitySource, 'formatBytes'),
            getDocument: () => typeof domSource.getDocument === 'function'
                ? domSource.getDocument()
                : domSource.document || (typeof document !== 'undefined' ? document : null),
            getClipboard: () => typeof browserSource.getClipboard === 'function'
                ? browserSource.getClipboard()
                : browserSource.clipboard || (typeof navigator !== 'undefined' ? navigator.clipboard : null),
            confirm: (...args) => typeof browserSource.confirm === 'function'
                ? browserSource.confirm(...args)
                : (typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(...args) : false),
            getProject: delegate(projectSource, 'getProject'),
            getProjectId: delegate(projectSource, 'getProjectId'),
            assetDisplaySrc: delegate(assetSource, 'assetDisplaySrc'),
            deleteAssets: delegate(assetSource, 'deleteAssets'),
            listAssets: delegate(assetSource, 'listAssets'),
            readAssetSize: delegate(assetSource, 'readAssetSize'),
            centerViewportOnWorld: delegate(viewportSource, 'centerViewportOnWorld'),
            defaultNodeSize: delegate(viewportSource, 'defaultNodeSize'),
            locateNode: delegate(viewportSource, 'locateNode'),
            closeContextMenu: delegate(viewSource, 'closeContextMenu'),
            detectWorkbenchTheme: delegate(viewSource, 'detectWorkbenchTheme'),
            openAssetViewer: delegate(viewSource, 'openAssetViewer'),
            showToast: delegate(uiSource, 'showToast'),
            setAssetRoot: typeof stateSource.setAssetRoot === 'function'
                ? (...args) => stateSource.setAssetRoot(...args)
                : (root) => {
                    if (typeof window !== 'undefined') window.SimpAICanvasWorkbenchAssetRoot = String(root || '');
                }
        };
    }

    function assetDisplaySrc(context, asset) {
        return call(context, 'assetDisplaySrc', '', asset);
    }

    function readAssetSize(context, asset) {
        return call(context, 'readAssetSize', '', asset);
    }

    async function openPanel(context) {
        call(context, 'closeContextMenu', null);
        const doc = getDocument(context);
        if (!doc?.createElement) return false;
        const modal = doc.createElement('div');
        modal.className = 'sai-canvas-modal';
        modal.classList.toggle('theme-dark', call(context, 'detectWorkbenchTheme', 'dark') === 'dark');
        modal.innerHTML = `
<div class="sai-canvas-modal-panel sai-asset-manager">
  <div class="sai-canvas-modal-head">
    <span>${escapeHtml(context, t(context, 'Asset Manager', '资产管理'))}</span>
    <button type="button" data-modal-close title="${escapeHtml(context, t(context, 'Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="sai-asset-manager-body"><p>${escapeHtml(context, t(context, 'Loading assets...', '正在加载资产...'))}</p></div>
</div>`;
        doc.body?.appendChild(modal);
        modal.addEventListener('click', (evt) => {
            if (evt.target === modal || evt.target.closest('[data-modal-close]')) modal.remove();
        });
        renderPanel(modal, context).catch((err) => {
            const body = modal.querySelector('.sai-asset-manager-body');
            if (body) body.innerHTML = `<div class="sai-inspector-note">${escapeHtml(context, t(context, 'Asset Manager failed: {error}', '资产管理加载失败：{error}').replace('{error}', err?.message || String(err || 'unknown error')))}</div>`;
        });
        return true;
    }

    async function renderPanel(modal, context) {
        const body = modal.querySelector('.sai-asset-manager-body');
        if (!body) return;
        const refs = collectProjectAssetReferences(context);
        let disk = { ok: false, assets: [], asset_root: '', error: '' };
        try {
            const response = await call(context, 'listAssets', null, {
                project_id: projectId(context),
                max_files: 1500,
                max_seconds: 2.5,
                include_dimensions: false
            });
            if (response && response.ok) disk = response;
            else disk = Object.assign(disk, { error: response?.error || 'Asset directory scan failed' });
        } catch (err) {
            disk.error = err?.message || String(err || 'Asset directory scan failed');
        }
        setAssetRoot(context, disk.asset_root || '');
        const referencedPaths = new Set();
        refs.forEach(item => item.paths.forEach(path => referencedPaths.add(normalizeAssetPath(path))));
        const diskAssets = Array.isArray(disk.assets) ? disk.assets : [];
        const isDiskAssetReferenced = (item) => referencedPaths.has(normalizeAssetPath(item.path)) || referencedPaths.has(normalizeAssetPath(item.relative_path));
        const unreferenced = diskAssets.filter(item => !isDiskAssetReferenced(item));
        const referencedSize = refs.reduce((sum, item) => sum + Number(item.asset?.size || 0), 0);
        const diskSize = diskAssets.reduce((sum, item) => sum + Number(item.size || 0), 0);
        body.innerHTML = `
<div class="sai-asset-summary">
  <div><span>${escapeHtml(context, t(context, 'Referenced', '已引用'))}</span><b>${refs.length}</b><small>${escapeHtml(context, formatBytes(context, referencedSize))}</small></div>
  <div><span>${escapeHtml(context, t(context, 'Disk Files', '磁盘文件'))}</span><b>${diskAssets.length}</b><small>${escapeHtml(context, formatBytes(context, diskSize))}</small></div>
  <div><span>${escapeHtml(context, t(context, 'Unreferenced', '未引用'))}</span><b>${unreferenced.length}</b><small>${escapeHtml(context, formatBytes(context, unreferenced.reduce((sum, item) => sum + Number(item.size || 0), 0)))}</small></div>
</div>
${disk.asset_root ? `<div class="sai-inspector-path"><span>${escapeHtml(context, t(context, 'Asset Root', '资产根目录'))}</span><code>${escapeHtml(context, disk.asset_root)}</code></div>` : ''}
${disk.error ? `<div class="sai-inspector-note">${escapeHtml(context, disk.error)}</div>` : ''}
${disk.truncated ? `<div class="sai-inspector-note">${escapeHtml(context, t(context, 'Asset directory scan was limited to {count} files. Use Refresh after cleanup if needed.', '资产目录扫描限制为 {count} 个文件。清理后可按需刷新。').replace('{count}', String(disk.scan_limit || diskAssets.length)))}</div>` : ''}
${disk.ok ? `<div class="sai-inspector-note">${escapeHtml(context, t(context, 'Project assets are saved with relative references when they live under this root. You can clean unused files manually here; expiration-based cleanup can be configured later.', '项目资产位于该根目录内时会使用相对引用保存。你可以在这里手动清理未引用文件，后续可配置到期自动清理。'))}</div>` : ''}
${disk.ok ? `<div class="sai-inspector-note">${escapeHtml(context, t(context, 'Scanned {count} file(s) in {seconds}s across {folders} folder(s).', '已扫描 {count} 个文件，用时 {seconds}s，覆盖 {folders} 个文件夹。').replace('{count}', String(diskAssets.length)).replace('{seconds}', String(disk.scan_elapsed ?? '?')).replace('{folders}', String(disk.scanned_dirs ?? '?')))}</div>` : ''}
<div class="sai-asset-toolbar">
  <button type="button" data-asset-action="refresh"><i class="fa-solid fa-rotate"></i><span>${escapeHtml(context, t(context, 'Refresh', '刷新'))}</span></button>
  <button type="button" data-asset-action="copy-root" ${disk.asset_root ? '' : 'disabled'}><i class="fa-solid fa-copy"></i><span>${escapeHtml(context, t(context, 'Copy Root', '复制根目录'))}</span></button>
  <button type="button" data-asset-action="delete-unreferenced" class="danger" ${unreferenced.length ? '' : 'disabled'}><i class="fa-solid fa-trash"></i><span>${escapeHtml(context, t(context, 'Delete Unreferenced', '删除未引用资产'))}</span></button>
</div>
<h3>${escapeHtml(context, t(context, 'Project References', '项目引用'))}</h3>
<div class="sai-asset-list">${refs.length ? refs.map((item, index) => renderAssetReferenceRow(item, index, context)).join('') : `<p>${escapeHtml(context, t(context, 'No referenced assets in this project.', '当前项目没有引用资产。'))}</p>`}</div>
<h3>${escapeHtml(context, t(context, 'Asset Directory Files', '资产目录文件'))}</h3>
<div class="sai-asset-list">${diskAssets.length ? diskAssets.map((item, index) => renderDiskAssetRow(item, index, isDiskAssetReferenced(item), context)).join('') : `<p>${escapeHtml(context, t(context, 'No files found in asset directory.', '资产目录中没有文件。'))}</p>`}</div>`;
        bindPanel(modal, refs, diskAssets, unreferenced, disk.asset_root || '', context);
    }

    function renderAssetReferenceRow(item, index, context) {
        const asset = item.asset || {};
        const nodeText = item.nodes.length ? item.nodes.map(node => node.title || node.id).join(', ') : t(context, 'Run history only', '仅运行历史');
        const path = asset.asset_relative_path || asset.relative_path || asset.path || asset.output_path || asset.preview_url || asset.asset_id || '';
        const src = assetDisplaySrc(context, asset);
        return `
<div class="sai-asset-row" data-ref-index="${index}">
  <div class="sai-asset-thumb">${src ? `<img src="${escapeHtml(context, src)}" alt="">` : '<i class="fa-solid fa-file-image"></i>'}</div>
  <div class="sai-asset-meta"><b>${escapeHtml(context, asset.name || nodeText || item.key)}</b><span>${escapeHtml(context, readAssetSize(context, asset) || asset.mime || asset.kind || '')}</span><code>${escapeHtml(context, path)}</code><small>${escapeHtml(context, item.roles.join(', '))}</small></div>
  <div class="sai-asset-actions">
    <button type="button" data-ref-action="locate" ${item.nodes.length ? '' : 'disabled'} title="${escapeHtml(context, t(context, 'Locate', '定位'))}"><i class="fa-solid fa-crosshairs"></i></button>
    <button type="button" data-ref-action="view" ${src ? '' : 'disabled'} title="${escapeHtml(context, t(context, 'View', '查看'))}"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
    <button type="button" data-ref-action="copy" title="${escapeHtml(context, t(context, 'Copy path', '复制路径'))}"><i class="fa-solid fa-copy"></i></button>
  </div>
</div>`;
    }

    function renderDiskAssetRow(item, index, referenced, context) {
        return `
<div class="sai-asset-row ${referenced ? 'is-referenced' : 'is-unreferenced'}" data-disk-index="${index}">
  <div class="sai-asset-thumb">${item.preview_url ? `<img src="${escapeHtml(context, item.preview_url)}" alt="">` : '<i class="fa-solid fa-file"></i>'}</div>
  <div class="sai-asset-meta"><b>${escapeHtml(context, item.name || item.relative_path || item.path)}</b><span>${escapeHtml(context, [referenced ? t(context, 'referenced', '已引用') : t(context, 'unreferenced', '未引用'), item.width && item.height ? `${item.width} x ${item.height}` : '', formatBytes(context, item.size)].filter(Boolean).join(' / '))}</span><code>${escapeHtml(context, item.relative_path || item.path || '')}</code></div>
  <div class="sai-asset-actions">
    <button type="button" data-disk-action="view" ${item.preview_url ? '' : 'disabled'} title="${escapeHtml(context, t(context, 'View', '查看'))}"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
    <button type="button" data-disk-action="copy" title="${escapeHtml(context, t(context, 'Copy path', '复制路径'))}"><i class="fa-solid fa-copy"></i></button>
  </div>
</div>`;
    }

    function bindPanel(modal, refs, diskAssets, unreferenced, assetRoot, context) {
        modal.querySelectorAll('[data-ref-action]').forEach((button) => {
            button.addEventListener('click', () => {
                const row = button.closest('[data-ref-index]');
                const item = refs[Number(row?.getAttribute('data-ref-index')) || 0];
                const action = button.getAttribute('data-ref-action');
                if (!item) return;
                if (action === 'locate' && item.nodes[0]) {
                    call(context, 'locateNode', null, item.nodes[0]);
                } else if (action === 'view') {
                    call(context, 'openAssetViewer', null, item.asset, item.asset?.name || item.nodes[0]?.title || 'Asset');
                } else if (action === 'copy') {
                    copyAssetPath(item.asset, context);
                }
            });
        });
        modal.querySelectorAll('[data-disk-action]').forEach((button) => {
            button.addEventListener('click', () => {
                const row = button.closest('[data-disk-index]');
                const item = diskAssets[Number(row?.getAttribute('data-disk-index')) || 0];
                if (!item) return;
                const action = button.getAttribute('data-disk-action');
                if (action === 'view') call(context, 'openAssetViewer', null, { preview_url: item.preview_url, path: item.path, mime: item.mime, width: item.width, height: item.height, size: item.size, name: item.name }, item.name || 'Asset file');
                else if (action === 'copy') writeClipboardText(context, item.path || '').then(() => call(context, 'showToast', null, t(context, 'Path copied.', '路径已复制。')), () => call(context, 'showToast', null, t(context, 'Copy failed.', '复制失败。')));
            });
        });
        modal.querySelector('[data-asset-action="refresh"]')?.addEventListener('click', () => renderPanel(modal, context));
        modal.querySelector('[data-asset-action="copy-root"]')?.addEventListener('click', () => writeClipboardText(context, assetRoot || '').then(() => call(context, 'showToast', null, t(context, 'Asset root copied.', '资产根目录已复制。')), () => call(context, 'showToast', null, t(context, 'Copy failed.', '复制失败。'))));
        modal.querySelector('[data-asset-action="delete-unreferenced"]')?.addEventListener('click', async () => {
            if (!unreferenced.length) return;
            if (!confirmAction(context, `Delete ${unreferenced.length} unreferenced asset file(s) from the project asset directory? This cannot be undone.`)) return;
            const response = await call(context, 'deleteAssets', null, { project_id: projectId(context), paths: unreferenced.map(item => item.path) });
            call(context, 'showToast', null, response?.ok ? t(context, 'Deleted {count} file(s).', '已删除 {count} 个文件。').replace('{count}', String((response.deleted || []).length)) : t(context, 'Delete failed: {error}', '删除失败：{error}').replace('{error}', response?.error || 'unknown error'));
            await renderPanel(modal, context);
        });
    }

    function copyAssetPath(asset, context) {
        const path = asset?.asset_relative_path || asset?.relative_path || asset?.path || asset?.output_path || asset?.preview_url || asset?.asset_id || '';
        if (!path) {
            call(context, 'showToast', null, t(context, 'Current result has no path to copy.', '当前结果没有可复制路径。'));
            return;
        }
        writeClipboardText(context, path).then(
            () => call(context, 'showToast', null, t(context, 'Path copied.', '路径已复制。')),
            () => call(context, 'showToast', null, t(context, 'Copy failed; view the Inspector path manually.', '复制失败，请手动查看 Inspector 路径。'))
        );
    }

    window.SimpAICanvasWorkbenchAssetManager = {
        collectProjectAssetReferences,
        copyAssetPath,
        createAssetManagerContext,
        getAssetIdentity,
        normalizeAssetPath,
        openPanel
    };
})();
