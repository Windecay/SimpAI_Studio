"""Small bilingual browser consent and authorization-management surfaces."""

import html
import json
from string import Template


LABELS = {
    "cn": {"title": "授权 Agent", "manage": "已授权的 Agent", "client": "申请方（名称由请求提供）", "code": "配对码",
           "identity": "当前身份", "storage": "存储范围", "permissions": "授权权限", "approve": "允许",
           "deny": "拒绝", "login": "更换身份", "studio": "打开 Studio", "refresh": "重新检查", "login_required": "需要登录或管理员批准",
           "done": "授权请求已处理", "revoke": "撤销", "revoked": "已撤销", "empty": "暂无授权",
           "mismatch": "当前身份与请求的 DID 不一致", "expiry": "到期时间",
           "duration": "授权期限", "days": "天",
           "context_changed": "服务模式与配对请求不一致", "account": "账号状态", "continue": "继续",
           "pairing_not_found": "配对请求不存在", "expired_token": "配对请求已过期",
           "pairing_closed": "配对请求已处理", "invalid_user_code": "配对码格式无效",
           "sign_in": "登录身份", "manual": "输入身份", "qr": "身份二维码", "nickname": "昵称",
           "telephone": "电话（含国家区号）", "legacy_contact": "旧身份的电话信息",
           "passphrase": "身份口令", "sign_in_continue": "登录并继续", "back": "返回授权页",
           "qr_file": "选择身份二维码图片", "qr_ready": "已读取身份二维码",
           "image_required": "请选择有效的身份二维码图片", "network_error": "连接失败，请重试",
           "invalid_identity_login": "身份信息或口令不正确",
           "invalid_identity_image": "无法读取身份二维码，请更换图片",
           "account_not_allowed": "该身份尚未获管理员批准，或已被禁用",
           "identity_mismatch": "登录身份与配对请求的 DID 不一致",
           "identity_context_changed": "身份、服务模式或存储范围已变化，请重新配对",
           "identity_unavailable": "身份服务暂不可用，请稍后重试",
           "invalid_csrf_token": "登录页面已失效，请重新打开配对链接",
           "login_in_progress": "登录请求仍在处理中，请稍后重试",
           "rate_limited": "请求过于频繁，请稍后重试",
           "invalid_request": "请检查身份信息是否完整"},
    "en": {"title": "Authorize Agent", "manage": "Authorized Agents", "client": "Requester (self-reported)", "code": "Pairing code",
           "identity": "Current identity", "storage": "Storage scope", "permissions": "Permissions",
           "approve": "Allow", "deny": "Deny", "login": "Change identity", "studio": "Open Studio", "refresh": "Check again",
           "login_required": "Sign-in or administrator approval required", "done": "Authorization request processed",
           "revoke": "Revoke", "revoked": "Revoked", "empty": "No authorizations",
           "mismatch": "The current identity does not match the requested DID", "expiry": "Expires",
           "duration": "Authorization duration", "days": "days",
           "context_changed": "The service mode does not match the pairing request", "account": "Account status",
           "continue": "Continue", "pairing_not_found": "Pairing request not found",
           "expired_token": "Pairing request expired", "pairing_closed": "Pairing request already processed",
           "invalid_user_code": "Invalid pairing code",
           "sign_in": "Sign in", "manual": "Identity details", "qr": "Identity QR code", "nickname": "Nickname",
           "telephone": "Phone (including country code)", "legacy_contact": "Phone details for a legacy identity",
           "passphrase": "Identity passphrase", "sign_in_continue": "Sign in and continue", "back": "Back to authorization",
           "qr_file": "Choose identity QR image", "qr_ready": "Identity QR code read",
           "image_required": "Choose a valid identity QR image", "network_error": "Connection failed. Try again.",
           "invalid_identity_login": "The identity details or passphrase are incorrect.",
           "invalid_identity_image": "The identity QR code could not be read. Choose another image.",
           "account_not_allowed": "This identity is awaiting approval or has been disabled.",
           "identity_mismatch": "The signed-in DID does not match the pairing request.",
           "identity_context_changed": "The identity, service mode or storage scope changed. Pair again.",
           "identity_unavailable": "The identity service is unavailable. Try again later.",
           "invalid_csrf_token": "This sign-in page has expired. Reopen the pairing link.",
           "login_in_progress": "Sign-in is still in progress. Try again later.",
           "rate_limited": "Too many requests. Try again later.",
           "invalid_request": "Check that the identity details are complete."},
}
SCOPE_LABELS = {
    "cn": {"read": "读取自己的预置、素材与任务", "assets.write": "上传素材", "runs.submit": "提交生成任务",
           "runs.cancel": "取消自己的任务", "node.read": "查看节点队列与资源",
           "models.download": "下载预置所需的共享模型", "vlm.infer": "使用本地语言与视觉模型推理"},
    "en": {"read": "Read owned presets, assets and runs", "assets.write": "Upload assets",
           "runs.submit": "Submit generation runs", "runs.cancel": "Cancel owned runs",
           "node.read": "Read node queue and resources", "models.download": "Download shared models required by presets",
           "vlm.infer": "Use local language and vision model inference"},
}


PAGE = Template("""<!doctype html>
<html lang="$lang"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>$title - SimpAI Studio</title>
<style nonce="$nonce">
*{box-sizing:border-box}body{margin:0;background:#f6f7f8;color:#202327;font:15px/1.5 system-ui,sans-serif;letter-spacing:0}
header{border-bottom:1px solid #d8dde2;background:#fff;padding:18px 24px}
header div,main{max-width:680px;margin:auto}header a{color:#202327;font-weight:650;text-decoration:none;display:inline-flex;align-items:center;gap:10px}
header img{width:30px;height:30px;object-fit:contain}
main{padding:30px 24px 48px}h1{font-size:24px;line-height:1.25;margin:0 0 24px}
dl{margin:0}dt{color:#59636c;font-size:13px;margin-top:18px}dd{margin:4px 0 0;overflow-wrap:anywhere}
code{font:14px/1.5 ui-monospace,monospace;overflow-wrap:anywhere}.pairing-code{font-size:22px;font-weight:650}
fieldset{border:0;border-top:1px solid #d8dde2;margin:24px 0 0;padding:18px 0 0}
legend{font-weight:600;padding:0 8px 0 0}label{display:flex;align-items:flex-start;gap:10px;margin:12px 0}
input{margin:4px 0 0;accent-color:#146b58;flex:none}nav{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px}
.code-entry{display:block}.code-entry input{display:block;width:100%;max-width:320px;min-height:44px;margin-top:8px;padding:8px 12px;border:1px solid #aeb8c0;border-radius:6px;font:18px ui-monospace,monospace}
.duration{display:block}.duration select{display:block;margin-top:8px;padding:8px 12px;min-height:40px;background:#fff;color:#202327;border:1px solid #aeb8c0;border-radius:6px;font:inherit;max-width:100%}
button,.command{min-height:40px;padding:8px 18px;border:1px solid #aeb8c0;border-radius:6px;background:#fff;color:#202327;font:inherit;cursor:pointer;text-decoration:none}
button.primary{background:#146b58;border-color:#146b58;color:#fff}button.danger{color:#a33037}button:disabled{opacity:.45;cursor:default}
#status{white-space:pre-wrap;overflow-wrap:anywhere;color:#a33037;margin-top:20px}
.grant{border-top:1px solid #d8dde2;padding:20px 0}.grant h2{font-size:17px;margin:0 0 8px;overflow-wrap:anywhere}
.grant p{margin:8px 0;overflow-wrap:anywhere}.footer-link{display:block;margin-top:30px;color:#405e77}
.login-tabs{display:flex;border-bottom:1px solid #d8dde2;margin:22px 0}
.login-tabs button{flex:1;border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;min-height:48px}
.login-tabs button[aria-selected="true"]{border-bottom-color:#146b58;font-weight:600;color:#146b58}
.login-field{display:block;margin:18px 0}
.login-field input{display:block;width:100%;min-height:44px;padding:10px 12px;margin-top:8px;border:1px solid #aeb8c0;border-radius:6px;background:#fff;color:#202327;font:inherit}
.login-field input[type="file"]{padding:8px;font-size:14px;overflow:hidden}
.login-form details{margin:12px 0}.login-form summary{cursor:pointer;color:#59636c;overflow-wrap:anywhere}
.login-form [hidden]{display:none}.login-tabs button:focus-visible,input:focus-visible{outline:2px solid #146b58;outline-offset:3px}
.login-form nav .primary{flex:1}.login-form nav a{align-self:center;color:#405e77}
@media(max-width:400px){header{padding:16px}main{padding:24px 16px}nav button{flex:1}}
</style></head><body><header><div><a href="$studio"><img src="$logo" alt="">SimpAI Studio</a></div></header>
<main><h1>$title</h1>$body<p id="status" role="status"></p></main>
<script nonce="$nonce">
const data=$data;
async function send(url,body){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
 try{
  const response=await fetch(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
  const result=await response.json();if(!result.ok){const error=new Error(result.error.code+'\\n'+result.error.message);error.code=result.error.code;throw error;}return result.data;
 }finally{clearTimeout(timeout);}
}
async function decide(decision){
 const buttons=Array.from(document.querySelectorAll('button')).map(b=>[b,b.disabled]);buttons.forEach(([b])=>b.disabled=true);
 try{
  const scopes=Array.from(document.querySelectorAll('input[name="scope"]:checked')).map(e=>e.value);
  const authorization_days=Number(document.querySelector('[name="authorization_days"]').value);
  await send(data.decision_url,{user_code:data.user_code,csrf_token:data.csrf_token,decision,scopes,authorization_days});
  document.getElementById('status').style.color='#146b58';document.getElementById('status').textContent=data.done;
 }catch(e){document.getElementById('status').textContent=e.message;buttons.forEach(([b,disabled])=>b.disabled=disabled)}
}
async function revoke(id,button){
 button.disabled=true;
 try{await send(data.credentials_url+'/'+encodeURIComponent(id)+'/revoke',{csrf_token:data.csrf_token});button.textContent=data.revoked}
 catch(e){document.getElementById('status').textContent=e.message;button.disabled=false}
}
document.querySelectorAll('[data-decision]').forEach(button=>button.addEventListener('click',()=>decide(button.dataset.decision)));
document.querySelectorAll('[data-revoke]').forEach(button=>button.addEventListener('click',()=>revoke(button.dataset.revoke,button)));
if(data.login){
 const form=document.querySelector('.login-form');
 const tabs=Array.from(document.querySelectorAll('[data-login-mode]'));
 const status=document.getElementById('status');
 let mode='manual',qrIdentity=null,busy=false;
 const showError=error=>{status.style.color='#a33037';status.textContent=data.errors[error.code]||data.errors.network_error;};
 const setBusy=value=>{busy=value;form.querySelectorAll('button,input').forEach(element=>element.disabled=value);
  if(!value){document.querySelectorAll('#login-manual input').forEach(element=>element.disabled=mode!=='manual');}};
 tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>{
  if(busy)return;mode=tab.dataset.loginMode;
  tabs.forEach(item=>{item.setAttribute('aria-selected',String(item===tab));item.tabIndex=item===tab?0:-1;});
  document.getElementById('login-manual').hidden=mode!=='manual';
  document.getElementById('login-qr').hidden=mode!=='qr';
  document.querySelectorAll('#login-manual input').forEach(element=>element.disabled=mode!=='manual');
  document.getElementById('login-passphrase').value='';status.textContent='';
 });
 tab.addEventListener('keydown',event=>{
  if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;event.preventDefault();
  const next=tabs[(index+1)%tabs.length];next.click();next.focus();
 });});
 document.getElementById('login-image').addEventListener('change',async event=>{
  const file=event.target.files[0];qrIdentity=null;document.getElementById('login-identity').hidden=true;
  if(!file)return;setBusy(true);status.textContent='';
  try{
   if(file.size>4*1024*1024)throw Object.assign(new Error(),{code:'invalid_identity_image'});
   const data_url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
   qrIdentity=await send(data.image_url,{user_code:data.user_code,csrf_token:data.csrf_token,data_url});
   document.getElementById('login-qr-name').textContent=qrIdentity.nickname;
   document.getElementById('login-qr-did').textContent=qrIdentity.did;
   document.getElementById('login-identity').hidden=false;status.style.color='#146b58';status.textContent=data.qr_ready;
  }catch(error){showError(error);}
  finally{event.target.value='';setBusy(false);}
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;status.textContent='';
  if(mode==='qr'&&!qrIdentity){showError({code:'image_required'});return;}
  const body={user_code:data.user_code,csrf_token:data.csrf_token,
   ...(mode==='qr'?qrIdentity:{nickname:document.getElementById('login-nickname').value,
     telephone:document.getElementById('login-telephone').value,did:''}),
   passphrase:document.getElementById('login-passphrase').value};
  setBusy(true);
  try{const result=await send(data.login_url,body);location.assign(result.next_url);}
  catch(error){showError(error);setBusy(false);}
  finally{body.passphrase='';document.getElementById('login-passphrase').value='';}
 });
}
</script></body></html>""")


def render_page(data, lang, nonce, prefix="", grants=None):
    lang = lang if lang in LABELS else "en"
    labels = LABELS[lang]
    escape = html.escape
    title = labels["manage"] if grants is not None else labels["sign_in"] if data.get("login") else labels["title"]
    actor = data.get("identity")
    body = ""
    if actor:
        body += (f'<dl><dt>{labels["identity"]}</dt><dd>{escape(actor["role"])}<br>'
                 f'<code>{escape(actor["did"])}</code></dd><dt>{labels["storage"]}</dt>'
                 f'<dd>{escape(actor["storage"]["scope"])}<br><code>{escape(actor["storage"]["namespace_id"])}</code></dd>'
                 f'<dt>{labels["account"]}</dt><dd>{escape(actor["access_status"])}</dd></dl>')
    if grants is not None:
        for grant in grants:
            scopes = ", ".join(SCOPE_LABELS[lang][scope] for scope in grant["scopes"])
            body += (f'<section class="grant"><h2>{escape(grant["client_name"])}</h2><p>{escape(scopes)}</p>'
                     f'<p>{labels["expiry"]}: <time>{escape(grant["expires_at"])}</time></p>'
                     f'<button class="danger" data-revoke="{escape(grant["id"])}" '
                     f'{"disabled" if grant["revoked"] else ""}>{labels["revoked"] if grant["revoked"] else labels["revoke"]}</button></section>')
        if not grants:
            body += f'<p>{labels["empty"]}</p>'
    elif data.get("login"):
        body += (f'<dl><dt>{labels["code"]}</dt><dd><code class="pairing-code">{escape(data["user_code"])}</code></dd></dl>'
                 '<form class="login-form">'
                 '<div class="login-tabs" role="tablist">'
                 f'<button type="button" id="login-tab-manual" role="tab" data-login-mode="manual" aria-selected="true" aria-controls="login-manual">{labels["manual"]}</button>'
                 f'<button type="button" id="login-tab-qr" role="tab" data-login-mode="qr" aria-selected="false" aria-controls="login-qr" tabindex="-1">{labels["qr"]}</button></div>'
                 '<div id="login-manual" role="tabpanel" aria-labelledby="login-tab-manual">'
                 f'<label class="login-field" for="login-nickname">{labels["nickname"]}'
                 '<input id="login-nickname" name="username" autocomplete="username" maxlength="128" required></label>'
                 f'<details><summary>{labels["legacy_contact"]}</summary>'
                 f'<label class="login-field" for="login-telephone">{labels["telephone"]}'
                 '<input id="login-telephone" type="tel" autocomplete="off" maxlength="40"></label></details></div>'
                 '<div id="login-qr" role="tabpanel" aria-labelledby="login-tab-qr" hidden>'
                 f'<label class="login-field" for="login-image">{labels["qr_file"]}'
                 '<input id="login-image" type="file" accept="image/png,image/jpeg,image/webp,image/bmp"></label>'
                 f'<dl id="login-identity" hidden><dt>{labels["nickname"]}</dt><dd id="login-qr-name"></dd>'
                 f'<dt>DID</dt><dd><code id="login-qr-did"></code></dd></dl></div>'
                 f'<label class="login-field" for="login-passphrase">{labels["passphrase"]}'
                 '<input id="login-passphrase" name="password" type="password" autocomplete="current-password" maxlength="256" required></label>'
                 f'<nav><button type="submit" class="primary">{labels["sign_in_continue"]}</button>'
                 f'<a href="{escape(data["back_url"])}">{labels["back"]}</a></nav></form>'
                 f'<a class="footer-link" href="{escape(prefix + "/")}" target="_blank" rel="noopener noreferrer">{labels["studio"]}</a>')
    elif data.get("entry"):
        if data.get("error_code"):
            body += f'<p>{escape(labels[data["error_code"]])}</p>'
        body += (f'<form method="get" action="{escape(data["entry_url"])}"><label class="code-entry">{labels["code"]}'
                 '<input name="user_code" autocomplete="off" spellcheck="false" maxlength="9" required placeholder="ABCD-EFGH"></label>'
                 f'<input name="lang" type="hidden" value="{lang}"><nav><button class="primary" type="submit">{labels["continue"]}</button></nav></form>')
    else:
        request = data["request"]
        body = (f'<dl><dt>{labels["client"]}</dt><dd>{escape(request["client_name"])}</dd>'
                f'<dt>{labels["code"]}</dt><dd><code class="pairing-code">{escape(data["user_code"])}</code></dd></dl>') + body
        if not data.get("can_authorize"):
            body += f'<p>{labels["login_required"]}</p><nav><a class="command" href="{escape(data["login_page_url"])}">{labels["login"]}</a><a class="command" href="">{labels["refresh"]}</a></nav>'
        else:
            did_mismatch = bool(request["expected_did"] and request["expected_did"] != actor["did"])
            context_changed = request["expected_mode"] != actor["access_mode"] or request["service_id"] != actor["service_id"]
            mismatch = did_mismatch or context_changed
            body += f'<fieldset><legend>{labels["permissions"]}</legend>'
            for scope in request["scopes"]:
                available = scope in actor["available_scopes"]
                body += (f'<label><input name="scope" type="checkbox" value="{escape(scope)}" '
                         f'{"checked" if available else ""} {"disabled" if scope == "read" or not available else ""}>'
                         f'<span>{SCOPE_LABELS[lang][scope]}</span></label>')
            body += '</fieldset>'
            maximum = request.get("authorization_days", 30)
            durations = sorted({day for day in (1, 7, 30, maximum) if day <= maximum})
            body += f'<label class="duration">{labels["duration"]}<select name="authorization_days">'
            for days in durations:
                body += f'<option value="{days}" {"selected" if days == maximum else ""}>{days} {labels["days"]}</option>'
            body += '</select></label>'
            if did_mismatch:
                body += f'<p>{labels["mismatch"]}: <code>{escape(request["expected_did"])}</code></p>'
            if context_changed:
                body += f'<p>{labels["context_changed"]}</p>'
            body += (f'<nav><button class="primary" data-decision="approve" {"disabled" if mismatch else ""}>{labels["approve"]}</button>'
                     f'<button data-decision="deny">{labels["deny"]}</button>'
                     f'<a class="command" href="{escape(data["login_page_url"])}">{labels["login"]}</a></nav>')
        body += f'<a class="footer-link" href="{escape(prefix + "/api/v1/auth/authorizations")}">{labels["manage"]}</a>'
    payload = {**data, "done": labels["done"], "revoked": labels["revoked"]}
    if data.get("login"):
        payload.update(qr_ready=labels["qr_ready"], errors=labels)
    serialized = json.dumps(payload, ensure_ascii=True).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    return PAGE.substitute(lang="zh-CN" if lang == "cn" else "en", title=title, nonce=nonce,
                           studio=escape(prefix + "/"), body=body, data=serialized,
                           logo=escape(prefix + "/api/v1/auth/brand"))
