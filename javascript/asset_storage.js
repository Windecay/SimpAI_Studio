(function () {
    'use strict';
    const config = JSON.parse(document.getElementById('asset-storage-data').textContent);
    const stage = config.stage;
    const t = key => stage.__lang === 'cn' ? (config.strings[key] || key) : key;
    const byId = id => document.getElementById(id);
    const bytes = value => {
        const size = Math.max(0, Number(value || 0));
        const unit = Math.min(3, size > 0 ? Math.floor(Math.log(size) / Math.log(1024)) : 0);
        return `${(size / 1024 ** unit).toFixed(unit ? 1 : 0)} ${['B', 'KiB', 'MiB', 'GiB'][unit]}`;
    };
    const text = (id, value) => { byId(id).textContent = value; };
    const protection = {pinned: 'Saved by you', referenced: 'Referenced by a project', only_copy: 'Only remaining result copy', active_task: 'Running task'};
    let offset = 0;
    let busy = false;
    let current;

    async function request(path = '', body) {
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), 30000);
        try {
            const response = await fetch(config.base + path, {
                method: body ? 'POST' : 'GET', credentials: 'same-origin', signal: abort.signal,
                headers: body ? {'Content-Type': 'application/json; charset=utf-8', 'X-SimpAI-Storage': '1'} : {},
                body: body ? JSON.stringify({...body, binding_id: config.binding_id}) : undefined
            });
            const result = await response.json();
            if (!response.ok || !result.ok) throw new Error('storage_request_failed');
            return result.data;
        } finally { clearTimeout(timer); }
    }

    function buttons() {
        document.querySelectorAll('button').forEach(button => { button.disabled = busy; });
        byId('cleanup').disabled = busy || !current?.scan_complete || current?.busy || !current?.reclaimable_files;
        byId('previous').disabled = busy || offset === 0;
        byId('next').disabled = busy || !current?.has_more;
    }

    async function operation(work) {
        if (busy) return;
        busy = true;
        buttons();
        try { await work(); }
        catch (_) { text('message', t('Request failed. Refresh the page and check your Studio identity.')); }
        finally { busy = false; buttons(); }
    }

    async function refresh() {
        current = await request(`?offset=${offset}&limit=50`);
        text('total', `${current.total_files} · ${bytes(current.total_bytes)}`);
        text('protected', current.protected_files);
        text('reclaimable', `${current.reclaimable_files} · ${bytes(current.reclaimable_bytes)}`);
        byId('enabled').checked = current.policy.enabled;
        byId('days').value = current.policy.retention_days;
        byId('limit').value = current.policy.max_gb;
        text('warning', [!current.scan_complete ? t('The reference scan is incomplete. No assets will be deleted.') : '',
            current.inventory_complete === false ? t('Asset indexing is still in progress. Counts may be partial; refresh to continue.') : '',
            current.busy ? t('Generation is active; cleanup is paused.') : '',
            current.over_limit ? t('Storage is full. Clean expired assets or increase the limit.') : ''].filter(Boolean).join(' '));
        const rows = current.items.map(item => {
            const row = document.createElement('tr');
            const values = [item.name, bytes(item.size), new Date(item.last_used * 1000).toLocaleDateString(stage.__lang === 'cn' ? 'zh-CN' : 'en-US'),
                t(protection[item.protection] || (item.eligible ? 'Expired' : 'Temporary'))];
            values.forEach((value, index) => {
                const cell = document.createElement('td');
                cell.dataset.label = t(['File', 'Size', 'Last used', 'Protection'][index]);
                cell.textContent = value; row.appendChild(cell);
            });
            const cell = document.createElement('td');
            const button = document.createElement('button');
            button.textContent = t(item.pinned ? 'Allow expiration' : 'Keep');
            button.addEventListener('click', () => operation(async () => {
                await request('/pin', {entry_id: item.entry_id, pinned: !item.pinned});
                await refresh();
            }));
            cell.appendChild(button); row.appendChild(cell);
            return row;
        });
        byId('files').replaceChildren(...rows);
        if (!rows.length) text('message', t('No assets yet.'));
        buttons();
    }

    byId('policy').addEventListener('submit', event => {
        event.preventDefault();
        operation(async () => {
            await request('/policy', {enabled: byId('enabled').checked, retention_days: Number(byId('days').value), max_gb: Number(byId('limit').value)});
            await refresh(); text('message', t('Settings saved.'));
        });
    });
    byId('refresh').addEventListener('click', () => operation(refresh));
    byId('previous').addEventListener('click', () => operation(async () => { offset = Math.max(0, offset - 50); await refresh(); }));
    byId('next').addEventListener('click', () => operation(async () => { offset += 50; await refresh(); }));
    byId('cleanup').addEventListener('click', () => {
        if (!window.confirm(t('Cleanup only removes expired, unused assets. Continue?'))) return;
        operation(async () => {
            const result = await request('/cleanup', {});
            await refresh();
            const key = {scan_incomplete: 'The reference scan is incomplete. No assets will be deleted.', active_task: 'Generation is active; cleanup is paused.', state_changed: 'References changed during cleanup. Refresh and try again.'}[result.blocked];
            text('message', key ? t(key) : t('Cleanup complete: {count} files, {size} freed.').replace('{count}', result.deleted_files).replace('{size}', bytes(result.deleted_bytes)));
        });
    });
    operation(refresh);
}());
