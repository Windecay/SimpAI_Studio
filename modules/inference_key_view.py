"""Translated controls embedded in the Studio connection page."""

KEY_STRINGS = (
    "Inference API keys", "Manage keys", "Loading inference keys...", "Refresh key list",
    "Create inference key", "Key name", "External Harness", "Validity", "30 days", "90 days", "365 days", "No expiration",
    "Default VRAM policy", "GPU priority", "Balanced VRAM", "More free VRAM", "CPU only",
    "GPU priority uses more of the available GPU memory for faster local inference. Other policies leave more memory free or use the CPU.",
    "Used when the client does not specify a VRAM policy. Changes apply to the next request; the API key stays the same.",
    "VRAM preference saved. It applies to the next request.",
    "This inference key is expired or revoked. Refresh the key list.",
    "Model access", "All local models, including future installations", "Selected models only", "Select at least one installed model.",
    "Model ID", "Copy model ID", "Copy API key", "View API key", "Show API key", "Hide API key", "Dismiss API key",
    "Save the key in your client's private API-key setting. After signing in, you can view or copy it again from this page.",
    "This older key has no recoverable copy. Create a new key.",
    "The encrypted key store is unavailable. Restore its private backup to view saved keys.",
    "API key ready. You can view or copy it again when needed.",
    "Create an API key for your external AI client's settings. You can return here to view, copy or revoke it.",
    "API key usage details",
    "Inference keys permit model listing and Chat Completions only. They do not authorize Studio tools, uploads, downloads or private assets. Send images as data URLs.",
    "Local mode: inference keys work with this Studio HTTP or HTTPS address. Existing local access rules still apply.",
    "Use this key at the address for this computer or at an HTTPS address provided by the administrator. A LAN HTTP address cannot be used in multi-user mode.",
    "This identity has no local inference permission. You can still revoke existing keys.",
    "Checking the available key management address...", "Check available address again",
    "Continue at the address for this computer",
    "This page is still using a LAN address. Studio has provided another address on this computer for managing API keys.",
    "The button opens key management in a new tab. If asked, sign in with your existing Studio identity. This address works only on this computer; clients on other computers need an HTTPS address from the administrator.",
    "Open key management on this computer",
    "A different access address is needed",
    "If Studio is on another computer, ask its administrator for an HTTPS address, then open this page through that address. The current HTTP address cannot manage or use API keys in multi-user mode.",
    "If Studio is on this computer, open its local entry from the launcher. This service has not provided a local address for this page to open.",
    "Could not check the access address",
    'Check that Studio is still running, then click "Check available address again".',
    "No address has been selected.",
    "Sign in to manage your API keys",
    "Open Studio below and sign in with your existing identity. This address may need a separate sign-in even if another Studio tab is already signed in.",
    'After signing in, return to this tab and click "Refresh after sign-in".',
    "Open Studio to sign in", "Refresh after sign-in",
    "No installed local models. Install a model in Studio before using this inference endpoint.",
    "No inference keys yet.", "Name", "Models", "Expires", "Last used", "State", "Revoke key",
    "Active", "Expired", "Revoked", "Not used yet", "All local models",
    "Revoke this inference key? Clients using it will lose access and active inference will stop at the next cancellation check.",
    "Key revoked.", "Key created. You can view or copy it here again.",
    "Refresh key management after signing in or changing identity. The request was not retried.",
    "Key management is unavailable. Check the Studio connection and retry.",
    "Revoke an unused key before creating another.", "The selected model is no longer installed. Refresh the model list.",
)

KEY_STYLE = """
.inference-key-head{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:20px}
.inference-key-head h3{margin:0}.inference-key-form{display:grid;grid-template-columns:minmax(0,1fr) 180px;gap:12px 18px;margin-top:12px}
.inference-key-form label{margin:0}.inference-key-form select{width:100%;margin-top:4px}.inference-key-form .wide{grid-column:1/-1}
.inference-model-options{display:flex;flex-wrap:wrap;gap:8px 18px;padding:10px 0;max-height:200px;overflow:auto}
.inference-model-options label{display:flex;align-items:center;gap:8px;overflow-wrap:anywhere}.inference-model-options input{width:16px;flex:none;margin:0}
.inference-key-form button{justify-self:start}.inference-key-secret{border:1px solid var(--accent);border-radius:8px;padding:14px;margin:16px 0}
.inference-key-secret .row{margin-top:10px}.inference-key-secret button{white-space:nowrap}.inference-key-table{overflow:auto}
.inference-key-table table{width:100%;border-collapse:collapse;margin-top:12px}.inference-key-table td,.inference-key-table th{text-align:left;padding:10px 6px;border-bottom:1px solid var(--border);overflow-wrap:anywhere}
.inference-key-table code{display:block;font-size:12px}.inference-key-table td:first-child{min-width:130px}.inference-key-table td:last-child{min-width:170px}.inference-key-table td:last-child button{white-space:nowrap;margin:2px 5px 2px 0}
.inference-key-table select{max-width:100%;width:100%;min-width:105px;padding:6px}.inference-key-table .inference-vram-cell{min-width:135px}
.inference-key-error{color:var(--accent)}#inference-key-status:empty{display:none}#inference-key-manager [hidden]{display:none!important}
.inference-key-guide{border:1px solid var(--accent);border-radius:8px;padding:16px;margin-top:14px}.inference-key-guide h4{margin:0 0 8px;font-size:16px}
.inference-key-guide a{display:inline-block;border-radius:7px;background:var(--accent);color:var(--card);padding:9px 14px;font-weight:600;text-decoration:none;margin-top:8px;max-width:100%;overflow-wrap:anywhere}.inference-key-guide a:focus-visible{outline:2px solid var(--fg);outline-offset:3px}
.inference-key-guide small{display:block;overflow-wrap:anywhere;margin-top:6px}.inference-key-details{border:0;padding:0;margin-top:10px}.inference-key-details summary{font-size:14px;font-weight:400;color:var(--muted)}
@media(max-width:620px){.inference-key-form{grid-template-columns:1fr}.inference-key-form .wide{grid-column:auto}.inference-key-table thead{display:none}.inference-key-table tr{display:grid;grid-template-columns:1fr 1fr;gap:8px;border-bottom:1px solid var(--border);padding:12px 0}.inference-key-table td{border:0;padding:0;min-width:0!important}.inference-key-table td:first-child,.inference-key-table td:nth-child(2){grid-column:1/-1}.inference-key-table td::before{content:attr(data-label);display:block;font-size:12px;color:var(--muted)}.inference-key-table td:last-child{grid-column:1/-1;align-self:end;justify-self:start}}
"""


def render_controls(t):
    return f'''<div id="inference-key-manager">
<div class="inference-key-head"><h3>{t('Inference API keys')}</h3><button type="button" id="inference-key-refresh">{t('Manage keys')}</button></div>
<p class="muted">{t("Create an API key for your external AI client's settings. You can return here to view, copy or revoke it.")}</p>
<p id="inference-key-status" role="status"></p><p id="inference-key-transport" class="muted"></p>
<div id="inference-key-guide" class="inference-key-guide" role="region" aria-labelledby="inference-key-guide-title" hidden>
<h4 id="inference-key-guide-title"></h4><p id="inference-key-guide-description"></p>
<a id="inference-key-guide-link" target="_blank" rel="noopener noreferrer" hidden></a>
<small id="inference-key-guide-address" class="muted"></small><p id="inference-key-guide-next" class="muted"></p>
</div>
<div id="inference-key-content" hidden>
<label for="inference-model-id">{t('Model ID')}</label><div class="row"><select id="inference-model-id"></select><button type="button" id="inference-model-copy">{t('Copy model ID')}</button></div>
<form id="inference-key-form" class="inference-key-form">
<label>{t('Key name')}<input id="inference-key-name" maxlength="100" placeholder="{t('External Harness')}" required autocomplete="off"></label>
<label>{t('Validity')}<select id="inference-key-days"><option value="30">{t('30 days')}</option><option value="90" selected>{t('90 days')}</option><option value="365">{t('365 days')}</option><option value="0">{t('No expiration')}</option></select></label>
<label class="wide">{t('Model access')}<select id="inference-key-scope"><option value="all">{t('All local models, including future installations')}</option><option value="selected">{t('Selected models only')}</option></select></label>
<div id="inference-key-models" class="inference-model-options wide" hidden></div>
<label class="wide">{t('Default VRAM policy')}<select id="inference-key-vram"><option value="extreme">{t('GPU priority')}</option><option value="standard">{t('Balanced VRAM')}</option><option value="relaxed">{t('More free VRAM')}</option><option value="cpu">{t('CPU only')}</option></select></label>
<p class="wide muted">{t('GPU priority uses more of the available GPU memory for faster local inference. Other policies leave more memory free or use the CPU.')}</p>
<button type="submit" class="wide" id="inference-key-create">{t('Create inference key')}</button>
</form>
<div id="inference-key-secret" class="inference-key-secret" hidden>
<strong id="inference-key-selected-name"></strong>
<p>{t("Save the key in your client's private API-key setting. After signing in, you can view or copy it again from this page.")}</p>
<input id="inference-key-value" type="password" readonly autocomplete="off" spellcheck="false" aria-label="API Key">
<div class="row"><button type="button" id="inference-key-copy">{t('Copy API key')}</button><button type="button" id="inference-key-toggle">{t('Show API key')}</button><button type="button" id="inference-key-dismiss">{t('Dismiss API key')}</button></div>
</div>
<p class="muted">{t('Used when the client does not specify a VRAM policy. Changes apply to the next request; the API key stays the same.')}</p>
<div class="inference-key-table"><table><thead><tr>{''.join('<th>'+t(key)+'</th>' for key in ('Name','Models','Expires','Last used','State','Default VRAM policy'))}<th></th></tr></thead><tbody id="inference-key-rows"></tbody></table></div>
</div><details class="inference-key-details"><summary>{t('API key usage details')}</summary>
<p class="muted">{t('Inference keys permit model listing and Chat Completions only. They do not authorize Studio tools, uploads, downloads or private assets. Send images as data URLs.')}</p>
</details></div>'''
