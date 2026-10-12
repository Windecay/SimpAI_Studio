(function () {
    'use strict';
    const element = document.getElementById('agent-connection-data');
    if (!element || !document.getElementById('inference-key-manager')) return;
    const config = JSON.parse(element.textContent);
    const stage = config.state;
    const t = key => stage.__lang === 'cn' ? (config.strings[key] || key) : key;
    const id = value => document.getElementById(value);
    const base = (config.prefix || '') + '/api/v1/auth/inference-keys';
    let metadata = null;
    let busy = false;
    const errors = {
        invalid_csrf_token: 'Refresh key management after signing in or changing identity. The request was not retried.',
        identity_context_changed: 'Refresh key management after signing in or changing identity. The request was not retried.',
        vlm_inference_not_allowed: 'This identity has no local inference permission. You can still revoke existing keys.',
        inference_key_limit: 'Revoke an unused key before creating another.',
        inference_key_inactive: 'This inference key is expired or revoked. Refresh the key list.',
        inference_key_not_recoverable: 'This older key has no recoverable copy. Create a new key.',
        inference_key_secret_unavailable: 'The encrypted key store is unavailable. Restore its private backup to view saved keys.',
        inference_key_model_unavailable: 'The selected model is no longer installed. Refresh the model list.'
    };

    function status(text, error = false) {
        id('inference-key-status').textContent = text;
        id('inference-key-status').classList.toggle('inference-key-error', error);
    }

    function clearGuide() {
        id('inference-key-guide').hidden = true;
        id('inference-key-guide-link').hidden = true;
        id('inference-key-guide-link').removeAttribute('href');
        id('inference-key-guide-address').textContent = '';
    }

    function showGuide(title, description, next, link, label) {
        status('');
        id('inference-key-guide-title').textContent = t(title);
        id('inference-key-guide-description').textContent = t(description);
        id('inference-key-guide-next').textContent = t(next);
        if (link) {
            id('inference-key-guide-link').href = link.href;
            id('inference-key-guide-link').textContent = t(label);
            id('inference-key-guide-link').hidden = false;
            id('inference-key-guide-address').textContent = link.origin + link.pathname;
        }
        id('inference-key-guide').hidden = false;
    }

    function pageUrl(value) {
        const url = new URL(value, location.origin);
        url.searchParams.set('lang', stage.__lang === 'cn' ? 'cn' : 'en');
        if (['dark', 'light'].includes(stage.__theme)) url.searchParams.set('theme', stage.__theme);
        return url;
    }

    async function showTransportGuide() {
        status(t('Checking the available key management address...'));
        id('inference-key-refresh').textContent = t('Check available address again');
        try {
            const response = await fetch((config.prefix || '') + '/api/v1/auth/discovery', {
                credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10000)
            });
            const result = await response.json();
            if (!response.ok || !result.ok || !['local', 'multi-user'].includes(result.data?.access_mode)) throw new Error('discovery_failed');
            const local = window.SimpAIAgentConnection.localEndpoint(result.data, location.origin + (config.prefix || ''));
            if (local) {
                const url = pageUrl(local.guide);
                url.searchParams.set('manage_keys', '1');
                url.hash = 'local-llm-api';
                showGuide('Continue at the address for this computer',
                    'This page is still using a LAN address. Studio has provided another address on this computer for managing API keys.',
                    'The button opens key management in a new tab. If asked, sign in with your existing Studio identity. This address works only on this computer; clients on other computers need an HTTPS address from the administrator.',
                    url, 'Open key management on this computer');
            } else {
                showGuide('A different access address is needed',
                    'If Studio is on another computer, ask its administrator for an HTTPS address, then open this page through that address. The current HTTP address cannot manage or use API keys in multi-user mode.',
                    'If Studio is on this computer, open its local entry from the launcher. This service has not provided a local address for this page to open.');
            }
        } catch (_) {
            showGuide('Could not check the access address',
                'Check that Studio is still running, then click "Check available address again".',
                'No address has been selected.');
        }
    }

    function showLoginGuide() {
        const url = new URL((config.prefix || '') + '/', location.origin);
        if (['dark', 'light'].includes(stage.__theme)) url.searchParams.set('__theme', stage.__theme);
        showGuide('Sign in to manage your API keys',
            'Open Studio below and sign in with your existing identity. This address may need a separate sign-in even if another Studio tab is already signed in.',
            'After signing in, return to this tab and click "Refresh after sign-in".',
            url, 'Open Studio to sign in');
        id('inference-key-refresh').textContent = t('Refresh after sign-in');
    }

    function clearSecret() {
        id('inference-key-value').value = '';
        id('inference-key-value').type = 'password';
        id('inference-key-secret').hidden = true;
        id('inference-key-selected-name').textContent = '';
        id('inference-key-toggle').textContent = t('Show API key');
    }

    function buttons() {
        id('inference-key-refresh').disabled = busy;
        id('inference-key-create').disabled = busy || !metadata?.can_create;
        id('inference-model-copy').disabled = busy || !id('inference-model-id').value;
        id('inference-key-vram').disabled = busy || !metadata?.can_create;
        id('inference-key-rows').querySelectorAll('[data-key-policy]').forEach(select => {
            select.disabled = busy || !metadata?.can_create || select.dataset.inactive === 'true';
        });
        id('inference-key-rows').querySelectorAll('button').forEach(button => { button.disabled = busy || !metadata || button.dataset.revoked === 'true' || button.dataset.unavailable === 'true'; });
    }

    async function request(path = '', body) {
        const response = await fetch(base + path, {method: body ? 'POST' : 'GET', credentials: 'same-origin',
            cache: 'no-store', signal: AbortSignal.timeout(30000),
            headers: body ? {'Content-Type': 'application/json; charset=utf-8'} : {},
            body: body ? JSON.stringify({...body, csrf_token: metadata.csrf_token, binding_id: metadata.binding_id}) : undefined});
        const result = await response.json();
        if (!response.ok || !result.ok) {
            const error = new Error('inference_key_request_failed');
            error.code = result.error?.code;
            throw error;
        }
        return result.data;
    }

    async function operation(work) {
        if (busy) return;
        busy = true; clearGuide(); buttons();
        try { await work(); }
        catch (error) {
            clearSecret();
            if (['authentication_required', 'browser_session_required', 'secure_transport_required', 'identity_context_changed', 'invalid_csrf_token', 'account_not_allowed'].includes(error.code)) {
                metadata = null;
                id('inference-key-content').hidden = true;
                id('inference-key-transport').textContent = '';
            }
            if (error.code === 'secure_transport_required') await showTransportGuide();
            else if (['authentication_required', 'browser_session_required'].includes(error.code)) showLoginGuide();
            else status(t(errors[error.code] || 'Key management is unavailable. Check the Studio connection and retry.'), true);
        } finally { busy = false; buttons(); }
    }

    const date = value => new Date(value * 1000).toLocaleDateString(stage.__lang === 'cn' ? 'zh-CN' : 'en-US');

    function renderRows() {
        const rows = metadata.items.map(item => {
            const row = document.createElement('tr');
            const values = [item.name, item.models.length ? item.models.join(', ') : t('All local models'),
                item.expires_at ? date(item.expires_at) : t('No expiration'), item.last_used_at ? date(item.last_used_at) : t('Not used yet'),
                t({active: 'Active', expired: 'Expired', revoked: 'Revoked'}[item.state])];
            values.forEach((value, index) => {
                const cell = document.createElement('td');
                cell.dataset.label = t(['Name', 'Models', 'Expires', 'Last used', 'State'][index]);
                cell.textContent = value;
                if (index === 0) { const hint = document.createElement('code'); hint.textContent = item.hint; cell.appendChild(hint); }
                row.appendChild(cell);
            });
            const policyCell = document.createElement('td');
            policyCell.className = 'inference-vram-cell';
            policyCell.dataset.label = t('Default VRAM policy');
            const policy = document.createElement('select');
            policy.dataset.keyPolicy = item.id;
            policy.dataset.inactive = String(item.state !== 'active');
            policy.setAttribute('aria-label', t('Default VRAM policy') + ': ' + item.name);
            for (const [value, label] of [['extreme', 'GPU priority'], ['standard', 'Balanced VRAM'], ['relaxed', 'More free VRAM'], ['cpu', 'CPU only']]) {
                const option = document.createElement('option'); option.value = value; option.textContent = t(label); policy.appendChild(option);
            }
            policy.value = item.vram_policy;
            policy.addEventListener('change', () => operation(async () => {
                try {
                    const data = await request('/' + encodeURIComponent(item.id) + '/settings', {vram_policy: policy.value});
                    Object.assign(item, data.key);
                    status(t('VRAM preference saved. It applies to the next request.'));
                } finally { if (metadata) renderRows(); }
            }));
            policyCell.appendChild(policy); row.appendChild(policyCell);
            const cell = document.createElement('td');
            for (const action of ['view', 'copy']) {
                const control = document.createElement('button');
                control.type = 'button'; control.dataset.keyAction = action;
                control.dataset.unavailable = String(!item.can_reveal);
                control.textContent = t(action === 'view' ? 'View API key' : 'Copy API key');
                if (!item.can_reveal) control.title = t('This older key has no recoverable copy. Create a new key.');
                control.addEventListener('click', () => operation(async () => {
                    const data = await request('/' + encodeURIComponent(item.id) + '/reveal', {});
                    clearSecret();
                    id('inference-key-value').value = data.api_key;
                    delete data.api_key;
                    id('inference-key-selected-name').textContent = data.key.name;
                    id('inference-key-secret').hidden = false;
                    if (data.key.models.length && !data.key.models.includes(id('inference-model-id').value)) id('inference-model-id').value = data.key.models[0];
                    if (action === 'view') {
                        id('inference-key-value').type = 'text';
                        id('inference-key-toggle').textContent = t('Hide API key');
                        id('inference-key-secret').scrollIntoView({block: 'nearest', behavior: 'smooth'});
                    } else await copy(id('inference-key-value').value, control, 'Copy API key');
                    status(t('API key ready. You can view or copy it again when needed.'));
                }));
                cell.appendChild(control);
            }
            const button = document.createElement('button');
            button.type = 'button'; button.textContent = t('Revoke key'); button.dataset.revoked = String(item.state === 'revoked');
            button.addEventListener('click', () => {
                if (!window.confirm(t('Revoke this inference key? Clients using it will lose access and active inference will stop at the next cancellation check.'))) return;
                operation(async () => {
                    await request('/' + encodeURIComponent(item.id) + '/revoke', {});
                    clearSecret(); item.state = 'revoked'; renderRows(); status(t('Key revoked.'));
                });
            });
            cell.appendChild(button); row.appendChild(cell);
            return row;
        });
        id('inference-key-rows').replaceChildren(...rows);
        buttons();
    }

    async function refresh() {
        clearSecret(); status(t('Loading inference keys...'));
        metadata = await request();
        id('inference-key-content').hidden = false;
        id('inference-key-refresh').textContent = t('Refresh key list');
        const prior = id('inference-model-id').value;
        id('inference-model-id').replaceChildren(...metadata.models.map(model => {
            const option = document.createElement('option'); option.value = model.id; option.textContent = model.id; return option;
        }));
        if (metadata.models.some(model => model.id === prior)) id('inference-model-id').value = prior;
        id('inference-key-models').replaceChildren(...metadata.models.map(model => {
            const label = document.createElement('label');
            const input = document.createElement('input'); input.type = 'checkbox'; input.value = model.id;
            const text = document.createElement('span'); text.textContent = model.id;
            label.append(input, text); return label;
        }));
        renderRows();
        id('inference-key-transport').textContent = t(metadata.access_mode === 'local'
            ? 'Local mode: inference keys work with this Studio HTTP or HTTPS address. Existing local access rules still apply.'
            : 'Use this key at the address for this computer or at an HTTPS address provided by the administrator. A LAN HTTP address cannot be used in multi-user mode.');
        status(t(!metadata.can_create ? 'This identity has no local inference permission. You can still revoke existing keys.'
            : !metadata.models.length ? 'No installed local models. Install a model in Studio before using this inference endpoint.'
            : !metadata.items.length ? 'No inference keys yet.' : ''));
    }

    async function copy(value, button, label) {
        if (!value) return;
        let success = false;
        try { await navigator.clipboard.writeText(value); success = true; }
        catch (_) {
            const field = document.createElement('textarea'); field.value = value;
            document.body.appendChild(field); field.select();
            try { success = document.execCommand('copy'); } catch (_) {}
            field.value = ''; field.remove(); button.focus();
        }
        button.textContent = t(success ? 'Copied' : 'Copy failed; select and copy the text.');
        setTimeout(() => { button.textContent = t(label); }, 1600);
    }

    id('inference-key-refresh').addEventListener('click', () => operation(refresh));
    id('inference-model-id').addEventListener('change', buttons);
    id('inference-key-scope').addEventListener('change', event => { id('inference-key-models').hidden = event.target.value === 'all'; });
    id('inference-key-form').addEventListener('submit', event => {
        event.preventDefault();
        operation(async () => {
            const all = id('inference-key-scope').value === 'all';
            const models = all ? [] : Array.from(id('inference-key-models').querySelectorAll('input:checked'), input => input.value);
            if (!all && !models.length) { status(t('Select at least one installed model.'), true); return; }
            clearSecret();
            const data = await request('', {name: id('inference-key-name').value.trim(), expires_days: Number(id('inference-key-days').value),
                allow_all_models: all, models, vram_policy: id('inference-key-vram').value});
            id('inference-key-value').value = data.api_key;
            delete data.api_key;
            id('inference-key-secret').hidden = false;
            id('inference-key-selected-name').textContent = data.key.name;
            if (!all && !models.includes(id('inference-model-id').value)) id('inference-model-id').value = models[0];
            metadata.items.unshift(data.key); renderRows();
            status(t('Key created. You can view or copy it here again.'));
        });
    });
    id('inference-key-copy').addEventListener('click', event => copy(id('inference-key-value').value, event.currentTarget, 'Copy API key'));
    id('inference-model-copy').addEventListener('click', event => copy(id('inference-model-id').value, event.currentTarget, 'Copy model ID'));
    id('inference-key-toggle').addEventListener('click', event => {
        const field = id('inference-key-value'); field.type = field.type === 'password' ? 'text' : 'password';
        event.currentTarget.textContent = t(field.type === 'password' ? 'Show API key' : 'Hide API key');
    });
    id('inference-key-dismiss').addEventListener('click', clearSecret);
    window.addEventListener('pagehide', clearSecret);
    // A link from the transport guide carries the user's request to the new tab.
    // Other public guide visits do not load private management data.
    buttons();
    if (new URL(location.href).searchParams.get('manage_keys') === '1') operation(refresh);
}());
