(function () {
    'use strict';

    const UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const escapeHtml = UTILS.escapeHtml || ((value) => String(value ?? ''));
    const t = UTILS.t || ((en, cn) => cn || en);

    function call(context, name, fallback, ...args) {
        return typeof context?.[name] === 'function' ? context[name](...args) : fallback;
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
        if (typeof window.structuredClone === 'function') {
            try { return window.structuredClone(value ?? fallback); } catch (err) {}
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
        const context = source || {};
        return {
            getProject: delegate(context, 'getProject'),
            getProjectId: delegate(context, 'getProjectId'),
            assetDisplaySrc: delegate(context, 'assetDisplaySrc'),
            centerViewportOnWorld: delegate(context, 'centerViewportOnWorld'),
            cloneValue: delegate(context, 'cloneValue'),
            closeContextMenu: delegate(context, 'closeContextMenu'),
            defaultNodeSize: delegate(context, 'defaultNodeSize'),
            deleteAssets: delegate(context, 'deleteAssets'),
            detectWorkbenchTheme: delegate(context, 'detectWorkbenchTheme'),
            formatBytes: delegate(context, 'formatBytes'),
            listAssets: delegate(context, 'listAssets'),
            locateNode: delegate(context, 'locateNode'),
            openAssetViewer: delegate(context, 'openAssetViewer'),
            readAssetSize: delegate(context, 'readAssetSize'),
            showToast: delegate(context, 'showToast')
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
        const modal = document.createElement('div');
        modal.className = 'sai-canvas-modal';
        modal.classList.toggle('theme-dark', call(context, 'detectWorkbenchTheme', 'dark') === 'dark');
        modal.innerHTML = `
<div class="sai-canvas-modal-panel sai-asset-manager">
  <div class="sai-canvas-modal-head">
    <span>${escapeHtml(t('Asset Manager', '资产管理'))}</span>
    <button type="button" data-modal-close title="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="sai-asset-manager-body"><p>${escapeHtml(t('Loading assets...', '正在加载资产...'))}</p></div>
</div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', (evt) => {
            if (evt.target === modal || evt.target.closest('[data-modal-close]')) modal.remove();
        });
        renderPanel(modal, context).catch((err) => {
            const body = modal.querySelector('.sai-asset-manager-body');
            if (body) body.innerHTML = `<div class="sai-inspector-note">${escapeHtml(t('Asset Manager failed: {error}', '资产管理加载失败：{error}').replace('{error}', err?.message || String(err || 'unknown error')))}</div>`;
        });
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
        window.SimpAICanvasWorkbenchAssetRoot = disk.asset_root || '';
        const referencedPaths = new Set();
        refs.forEach(item => item.paths.forEach(path => referencedPaths.add(normalizeAssetPath(path))));
        const diskAssets = Array.isArray(disk.assets) ? disk.assets : [];
        const isDiskAssetReferenced = (item) => referencedPaths.has(normalizeAssetPath(item.path)) || referencedPaths.has(normalizeAssetPath(item.relative_path));
        const unreferenced = diskAssets.filter(item => !isDiskAssetReferenced(item));
        const referencedSize = refs.reduce((sum, item) => sum + Number(item.asset?.size || 0), 0);
        const diskSize = diskAssets.reduce((sum, item) => sum + Number(item.size || 0), 0);
        body.innerHTML = `
<div class="sai-asset-summary">
  <div><span>${escapeHtml(t('Referenced', '已引用'))}</span><b>${refs.length}</b><small>${escapeHtml(formatBytes(context, referencedSize))}</small></div>
  <div><span>${escapeHtml(t('Disk Files', '磁盘文件'))}</span><b>${diskAssets.length}</b><small>${escapeHtml(formatBytes(context, diskSize))}</small></div>
  <div><span>${escapeHtml(t('Unreferenced', '未引用'))}</span><b>${unreferenced.length}</b><small>${escapeHtml(formatBytes(context, unreferenced.reduce((sum, item) => sum + Number(item.size || 0), 0)))}</small></div>
</div>
${disk.asset_root ? `<div class="sai-inspector-path"><span>${escapeHtml(t('Asset Root', '资产根目录'))}</span><code>${escapeHtml(disk.asset_root)}</code></div>` : ''}
${disk.error ? `<div class="sai-inspector-note">${escapeHtml(disk.error)}</div>` : ''}
${disk.truncated ? `<div class="sai-inspector-note">${escapeHtml(t('Asset directory scan was limited to {count} files. Use Refresh after cleanup if needed.', '资产目录扫描限制为 {count} 个文件。清理后可按需刷新。').replace('{count}', String(disk.scan_limit || diskAssets.length)))}</div>` : ''}
${disk.ok ? `<div class="sai-inspector-note">${escapeHtml(t('Project assets are saved with relative references when they live under this root. You can clean unused files manually here; expiration-based cleanup can be configured later.', '项目资产位于该根目录内时会使用相对引用保存。你可以在这里手动清理未引用文件，后续可配置到期自动清理。'))}</div>` : ''}
${disk.ok ? `<div class="sai-inspector-note">${escapeHtml(t('Scanned {count} file(s) in {seconds}s across {folders} folder(s).', '已扫描 {count} 个文件，用时 {seconds}s，覆盖 {folders} 个文件夹。').replace('{count}', String(diskAssets.length)).replace('{seconds}', String(disk.scan_elapsed ?? '?')).replace('{folders}', String(disk.scanned_dirs ?? '?')))}</div>` : ''}
<div class="sai-asset-toolbar">
  <button type="button" data-asset-action="refresh"><i class="fa-solid fa-rotate"></i><span>${escapeHtml(t('Refresh', '刷新'))}</span></button>
  <button type="button" data-asset-action="copy-root" ${disk.asset_root ? '' : 'disabled'}><i class="fa-solid fa-copy"></i><span>${escapeHtml(t('Copy Root', '复制根目录'))}</span></button>
  <button type="button" data-asset-action="delete-unreferenced" class="danger" ${unreferenced.length ? '' : 'disabled'}><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete Unreferenced', '删除未引用资产'))}</span></button>
</div>
<h3>${escapeHtml(t('Project References', '项目引用'))}</h3>
<div class="sai-asset-list">${refs.length ? refs.map((item, index) => renderAssetReferenceRow(item, index, context)).join('') : `<p>${escapeHtml(t('No referenced assets in this project.', '当前项目没有引用资产。'))}</p>`}</div>
<h3>${escapeHtml(t('Asset Directory Files', '资产目录文件'))}</h3>
<div class="sai-asset-list">${diskAssets.length ? diskAssets.map((item, index) => renderDiskAssetRow(item, index, isDiskAssetReferenced(item), context)).join('') : `<p>${escapeHtml(t('No files found in asset directory.', '资产目录中没有文件。'))}</p>`}</div>`;
        bindPanel(modal, refs, diskAssets, unreferenced, disk.asset_root || '', context);
    }

    function renderAssetReferenceRow(item, index, context) {
        const asset = item.asset || {};
        const nodeText = item.nodes.length ? item.nodes.map(node => node.title || node.id).join(', ') : t('Run history only', '仅运行历史');
        const path = asset.asset_relative_path || asset.relative_path || asset.path || asset.output_path || asset.preview_url || asset.asset_id || '';
        const src = assetDisplaySrc(context, asset);
        return `
<div class="sai-asset-row" data-ref-index="${index}">
  <div class="sai-asset-thumb">${src ? `<img src="${escapeHtml(src)}" alt="">` : '<i class="fa-solid fa-file-image"></i>'}</div>
  <div class="sai-asset-meta"><b>${escapeHtml(asset.name || nodeText || item.key)}</b><span>${escapeHtml(readAssetSize(context, asset) || asset.mime || asset.kind || '')}</span><code>${escapeHtml(path)}</code><small>${escapeHtml(item.roles.join(', '))}</small></div>
  <div class="sai-asset-actions">
    <button type="button" data-ref-action="locate" ${item.nodes.length ? '' : 'disabled'} title="${escapeHtml(t('Locate', '定位'))}"><i class="fa-solid fa-crosshairs"></i></button>
    <button type="button" data-ref-action="view" ${src ? '' : 'disabled'} title="${escapeHtml(t('View', '查看'))}"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
    <button type="button" data-ref-action="copy" title="${escapeHtml(t('Copy path', '复制路径'))}"><i class="fa-solid fa-copy"></i></button>
  </div>
</div>`;
    }

    function renderDiskAssetRow(item, index, referenced, context) {
        return `
<div class="sai-asset-row ${referenced ? 'is-referenced' : 'is-unreferenced'}" data-disk-index="${index}">
  <div class="sai-asset-thumb">${item.preview_url ? `<img src="${escapeHtml(item.preview_url)}" alt="">` : '<i class="fa-solid fa-file"></i>'}</div>
  <div class="sai-asset-meta"><b>${escapeHtml(item.name || item.relative_path || item.path)}</b><span>${escapeHtml([referenced ? t('referenced', '已引用') : t('unreferenced', '未引用'), item.width && item.height ? `${item.width} x ${item.height}` : '', formatBytes(context, item.size)].filter(Boolean).join(' / '))}</span><code>${escapeHtml(item.relative_path || item.path || '')}</code></div>
  <div class="sai-asset-actions">
    <button type="button" data-disk-action="view" ${item.preview_url ? '' : 'disabled'} title="${escapeHtml(t('View', '查看'))}"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
    <button type="button" data-disk-action="copy" title="${escapeHtml(t('Copy path', '复制路径'))}"><i class="fa-solid fa-copy"></i></button>
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
                else if (action === 'copy') navigator.clipboard?.writeText(item.path || '').then(() => call(context, 'showToast', null, t('Path copied.', '路径已复制。')), () => call(context, 'showToast', null, t('Copy failed.', '复制失败。')));
            });
        });
        modal.querySelector('[data-asset-action="refresh"]')?.addEventListener('click', () => renderPanel(modal, context));
        modal.querySelector('[data-asset-action="copy-root"]')?.addEventListener('click', () => navigator.clipboard?.writeText(assetRoot || '').then(() => call(context, 'showToast', null, t('Asset root copied.', '资产根目录已复制。')), () => call(context, 'showToast', null, t('Copy failed.', '复制失败。'))));
        modal.querySelector('[data-asset-action="delete-unreferenced"]')?.addEventListener('click', async () => {
            if (!unreferenced.length) return;
            if (!window.confirm(`Delete ${unreferenced.length} unreferenced asset file(s) from the project asset directory? This cannot be undone.`)) return;
            const response = await call(context, 'deleteAssets', null, { project_id: projectId(context), paths: unreferenced.map(item => item.path) });
            call(context, 'showToast', null, response?.ok ? t('Deleted {count} file(s).', '已删除 {count} 个文件。').replace('{count}', String((response.deleted || []).length)) : t('Delete failed: {error}', '删除失败：{error}').replace('{error}', response?.error || 'unknown error'));
            await renderPanel(modal, context);
        });
    }

    function copyAssetPath(asset, context) {
        const path = asset?.asset_relative_path || asset?.relative_path || asset?.path || asset?.output_path || asset?.preview_url || asset?.asset_id || '';
        if (!path) {
            call(context, 'showToast', null, t('Current result has no path to copy.', '当前结果没有可复制路径。'));
            return;
        }
        navigator.clipboard?.writeText(path).then(
            () => call(context, 'showToast', null, t('Path copied.', '路径已复制。')),
            () => call(context, 'showToast', null, t('Copy failed; view the Inspector path manually.', '复制失败，请手动查看 Inspector 路径。'))
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
