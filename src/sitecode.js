/* ===== 網站版：登入、授權、資料存取（Supabase） ===== */
const SUPA_URL='https://thxqncpkkzmpktwuvzvz.supabase.co';
const SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoeHFuY3Bra3ptcGt0d3V2enZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MTMyODcsImV4cCI6MjEwNjk4OTI4N30.cDjeuOxx2UZLrOWYcNhqy4dO2cdznscJ7CWr0DZGZ2g';
const LICENSOR='品牌加辣餐飲顧問工作室';
const PLAN_NAME={basic:'基本版',pro:'進階版'}, BASIC=['ing','semi','recipe','cost','price','order','ver','log'];
let sbc=null, me=null, prof=null, G='loading', authMsg='', authMode='in', adm={profiles:[],access:[]}, adminTab=false, notice='', logRows=null, watchOn=false, rtT=null; const revs={}, saving=new Set();
TABS[TABS.length-1][2].push(['log','修改紀錄']);
const isAdmin=()=>!!prof&&prof.role==='admin';
const today=()=>new Date(Date.now()+8*3600e3).toISOString().slice(0,10);
const expired=()=>!!prof&&!!prof.expires_on&&prof.expires_on<today();
const RO=()=>!isAdmin()&&(!prof||prof.access!=='edit');
const allowed=t=>isAdmin()||(prof&&prof.plan==='pro')||BASIC.includes(t);

function touch(){ if(!cur||RO()) return; dirty.add(cur); setStatus('儲存中…'); clearTimeout(timer); timer=setTimeout(flush,900) }
function flush(){ const ids=[...dirty]; dirty.clear();
  ids.forEach(id=>{ chain=chain.then(()=>saveBrand(id)).catch(()=>{ saving.delete(id); setStatus('儲存失敗：連線中斷，請重新整理後再試') }) }) }
/* 每次存檔都帶著「我手上是第幾版」；資料庫裡的版本若已被別人往前推，這次就不寫入 */
async function saveBrand(id){ const b=brands[id]; if(!b) return; const body=JSON.parse(JSON.stringify(b)), base=revs[id]; saving.add(id);
  const res=base===undefined
    ? await sbc.from('bom_brands').insert({id,name:b.name,data:body,edited_on_site:true}).select('id,rev')
    : await sbc.from('bom_brands').update({name:b.name,data:body,edited_on_site:true,rev:base+1}).eq('id',id).eq('rev',base).select('id,rev');
  saving.delete(id);
  if(res.error&&!/BOM_CONFLICT/.test(res.error.message||'')) throw res.error;
  if(res.data&&res.data.length){ revs[id]=res.data[0].rev; if(!dirty.size) setStatus('已儲存'); return }
  await resolveConflict(id) }
function applyRemote(r){ const d=r.data&&typeof r.data==='object'?r.data:{}; brands[r.id]=norm(Object.assign(blank(r.name),d,{name:r.name})); revs[r.id]=r.rev }
async function loadVersions(){ const vs=await sbc.from('bom_snapshots').select('id,brand_id,brand_name,note,data,created_at,created_by_email,auto').order('created_at',{ascending:false}).limit(150);
  versions=(vs.data||[]).map(r=>({id:r.id,brandId:r.brand_id,brandName:r.brand_name,note:r.note,at:r.created_at,data:r.data,by:r.created_by_email,auto:r.auto,synced:true})) }
async function resolveConflict(id){ const mine=JSON.parse(JSON.stringify(brands[id])); dirty.delete(id);
  const {data:r}=await sbc.from('bom_brands').select('id,name,data,rev,updated_by_email').eq('id',id).maybeSingle();
  if(!r||r.rev===revs[id]){ setStatus('儲存失敗：你沒有修改這個品牌的權限'); return }
  const {error}=await sbc.from('bom_snapshots').insert({id:uid('c')+Date.now().toString(36),brand_id:id,brand_name:mine.name,note:'衝突保留：我未存入的修改',data:mine});
  applyRemote(r); await loadVersions();
  notice='「'+r.name+'」剛被 '+(r.updated_by_email||'其他人')+' 更新。為了避免互相覆蓋，你剛才的修改沒有存入，畫面已換成最新版本。'+(error?'':'你的修改沒有遺失，已另存到「版本存檔」，名稱是「衝突保留：我未存入的修改」，可以前往查看或還原。');
  setStatus('已載入最新版本'); render() }
/* 定期與回到分頁時檢查：別人有沒有更新、品牌清單有沒有變 */
async function checkRemote(){ if(G!=='app'||!sbc) return; const {data,error}=await sbc.from('bom_brands').select('id,rev,name,updated_by_email'); if(error||!data||G!=='app') return;
  const need=data.filter(r=>!dirty.has(r.id)&&!saving.has(r.id)&&(revs[r.id]===undefined?!brands[r.id]:r.rev>revs[r.id])), seen=new Set(data.map(r=>r.id)); let changed=false, msg='';
  if(need.length){ const full=await sbc.from('bom_brands').select('id,name,data,rev,updated_by_email').in('id',need.map(r=>r.id));
    (full.data||[]).forEach(r=>{ if(dirty.has(r.id)||saving.has(r.id)) return; const isNew=revs[r.id]===undefined; applyRemote(r); changed=true;
      if(r.id===cur&&!isNew) msg='「'+r.name+'」已由 '+(r.updated_by_email||'其他人')+' 更新，畫面已同步為最新版本。' }) }
  Object.keys(brands).forEach(id=>{ if(!seen.has(id)&&revs[id]!==undefined&&!dirty.has(id)){ delete brands[id]; delete revs[id]; changed=true; if(id===cur) msg='你原本開啟的品牌已無法使用，可能已被移除或取消授權。' } });
  if(changed){ if(msg) notice=msg; pick(); await loadVersions(); render() } }
function startWatch(){ if(watchOn) return; watchOn=true; setInterval(checkRemote,60000);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) checkRemote() });
  try{ sbc.channel('bom-brands').on('postgres_changes',{event:'*',schema:'public',table:'bom_brands'},()=>{ clearTimeout(rtT); rtT=setTimeout(checkRemote,500) }).subscribe() }catch(e){} }
function saveLocalVers(){}
function sbQueue(){}
async function markSynced(){}
function siteDeleteBrand(id){ const keep=brands[id]||null, keepRev=revs[id]; delete revs[id]; setStatus("刪除中…");
  sbc.from("bom_brands").delete().eq("id",id).select("id").then(({data,error})=>{ if(error||!data||!data.length){ window.__delErr=error?(error.code+" "+error.message):"0 rows"; notice="品牌沒有刪除成功"+(error?"（"+(error.message||"").slice(0,80)+"）":"：資料庫沒有刪到任何資料")+"。資料仍然保留，請把這段訊息告訴顧問。"; setStatus("刪除失敗"); checkRemote().then(render); render() } else { setStatus("已刪除，並已自動保留一份刪除前備份"); loadVersions() } }) }
function siteDeleteVer(id){ sbc.from('bom_snapshots').delete().eq('id',id).then(({error})=>{ if(error) setStatus('刪除失敗：只有管理員可以刪除存檔點') }) }
async function verCreate(brandId,note){ const b=brands[brandId]; if(!b||RO()) return null;
  const v={id:uid('v')+Date.now().toString(36),brandId,brandName:b.name,note:note||'手動存檔',at:new Date().toISOString(),data:JSON.parse(JSON.stringify(b)),by:me&&me.email,auto:false,synced:true};
  const {error}=await sbc.from('bom_snapshots').insert({id:v.id,brand_id:brandId,brand_name:b.name,note:v.note,data:v.data,created_at:v.at});
  if(error){ setStatus('存檔點建立失敗'); return null } versions.unshift(v); return v }

V.ver=(b,c)=>{ const mine=versions.filter(v=>v.brandId===cur);
  const arm=(k,l,cls)=>`<button class="${cls||''} ${armed===k?'del armed':''}" data-arm="${k}">${armed===k?'確定'+l:l}</button>`;
  return `<div class="head"><div><h2>版本存檔</h2><p class="sub">存檔點就像遊戲存檔：改壞了、試算完想回到之前的樣子，按還原就回去。還原前系統會先自動替目前資料存一個檔，所以還原也可以反悔。</p></div></div>
<div class="params"><label for="verNote">這次存檔的說明 <input type="text" id="verNote" placeholder="例如：調整售價前" style="min-width:220px"></label><button class="pri" data-act="vnew">建立存檔點</button></div>
<div class="scroll"><table><thead><tr><th>時間</th><th>說明</th><th>建立者</th><th class="n">食材</th><th class="n">品項</th><th class="n">損益期數</th><th></th></tr></thead><tbody>${mine.map(v=>`<tr><td>${tm(v.at)}</td><td>${v.auto?'<span class="tag">自動</span> ':''}${esc(v.note)}</td><td>${esc(v.by||'')}</td><td class="n">${((v.data||{}).ingredients||[]).length}</td><td class="n">${((v.data||{}).items||[]).length}</td><td class="n">${((v.data||{}).periods||[]).length}</td><td>${arm('vres:'+v.id,'還原')} ${isAdmin()?arm('vdel:'+v.id,'刪除','del'):''}</td></tr>`).join('')||'<tr><td colspan="7">還沒有存檔點。重要調整前先按上方「建立存檔點」。</td></tr>'}</tbody></table></div>
<p class="note">每個人每天第一次修改前，系統會自動先存一份，並標示是誰改的。所有資料與存檔點都即時存在雲端資料庫，換電腦或手機登入都看得到。存檔點只有管理員能刪除。</p>` };

/* ---- 修改紀錄 ---- */
const SEC={ingredients:'食材',semis:'半成品',items:'品項配方',settings:'參數設定',periods:'損益資料',combos:'套餐',channels:'外送通路',fixed:'固定費用',be:'損益兩平設定',fr:'加盟主試算設定',priceLog:'價格紀錄',name:'品牌名稱',sample:'範例標記'};
async function loadLog(){ const r=await sbc.from('bom_change_log').select('*').order('at',{ascending:false}).limit(300); logRows=r.error?[]:(r.data||[]) }
V.log=(b,c)=>{ const all=isAdmin()&&ui.logAll==='1', rows=(logRows||[]).filter(r=>all||r.brand_id===cur), who={admin:'顧問',client:'業主',system:'系統'}, act={create:'建立品牌',delete:'刪除品牌',update:'修改'};
  return `<div class="head"><div><h2>修改紀錄</h2><p class="sub">誰在什麼時候改了哪些資料，都會自動記下來。同一個人十分鐘內連續修改會合併成一筆。這份紀錄由系統寫入，任何人都無法修改或刪除。</p></div><button data-act="logreload">重新整理</button></div>
${isAdmin()?`<div class="params"><label for="logsel">顯示範圍 <select id="logsel" data-ui="logAll" data-p="ui.logAll"><option value="0" ${all?'':'selected'}>目前這個品牌</option><option value="1" ${all?'selected':''}>全部品牌</option></select></label></div>`:''}
<div class="scroll"><table><thead><tr><th>時間</th>${all?'<th>品牌</th>':''}<th>誰</th><th>身分</th><th>動作</th><th>改了哪些</th><th class="n">儲存次數</th></tr></thead><tbody>${logRows===null?'<tr><td colspan="7">讀取中…</td></tr>':rows.map(r=>`<tr><td>${tm(r.at)}</td>${all?'<td>'+esc(r.brand_name||r.brand_id)+'</td>':''}<td>${esc(r.actor_email||'')}</td><td><span class="pill ${r.actor_role==='admin'?'puz':r.actor_role==='client'?'good':'warn'}">${who[r.actor_role]||r.actor_role}</span></td><td>${act[r.action]||r.action}</td><td style="white-space:normal">${(r.sections||[]).map(s=>SEC[s]||s).join('、')}</td><td class="n">${r.edits}</td></tr>`).join('')||'<tr><td colspan="7">目前沒有修改紀錄。</td></tr>'}</tbody></table></div>` };

/* ---- 授權管理（僅管理員） ---- */
async function loadAdmin(){ const [p,a]=await Promise.all([sbc.from('bom_profiles').select('*').order('created_at',{ascending:false}),sbc.from('bom_brand_access').select('*')]); adm={profiles:p.data||[],access:a.data||[]} }
V.admin=(b,c)=>{ const ps=adm.profiles.filter(p=>p.role!=='admin'), t=today(), soon=new Date(Date.now()+38*86400e3).toISOString().slice(0,10);
  const opt=(uid,f,v,os)=>`<select data-adm="${uid}|${f}" aria-label="${f}">${os.map(o=>`<option value="${o[0]}" ${o[0]===v?'selected':''}>${o[1]}</option>`).join('')}</select>`;
  return `<div class="head"><div><h2>授權管理</h2><p class="sub">業主自行在登入頁註冊後會出現在這裡，狀態是「待開通」。你替他選方案、權限、到期日並勾選可使用的品牌，確認收款後把狀態改成「使用中」，系統會自動寄開通通知信給他，信裡有一鍵登入的連結。</p></div><button data-act="admreload">重新整理名單</button></div>
<div class="tiles"><div class="tile"><span>業主帳號</span><b>${ps.length}</b></div><div class="tile"><span>待開通</span><b>${ps.filter(p=>p.status==='pending').length}</b></div><div class="tile"><span>30 天內到期</span><b>${ps.filter(p=>p.status==='active'&&p.expires_on&&p.expires_on>=t&&p.expires_on<=soon).length}</b></div><div class="tile"><span>已到期或停權</span><b>${ps.filter(p=>p.status==='suspended'||(p.expires_on&&p.expires_on<t)).length}</b></div></div>
<div class="scroll"><table><thead><tr><th>業主</th><th>狀態</th><th>方案</th><th>權限</th><th>到期日（留空為不限期）</th><th>可使用的品牌</th><th>備註（付款紀錄等）</th><th></th></tr></thead><tbody>${ps.map(p=>{const ex=p.expires_on&&p.expires_on<t;return `<tr><td style="white-space:normal"><b>${esc(p.display_name||'（未填名稱）')}</b><br><span class="note">${esc(p.email)}</span></td>
<td>${opt(p.user_id,'status',p.status,[['pending','待開通'],['active','使用中'],['suspended','停權']])} ${ex?'<span class="pill bad">已到期</span>':''}</td>
<td>${opt(p.user_id,'plan',p.plan,[['basic','基本版'],['pro','進階版']])}</td><td>${opt(p.user_id,'access',p.access,[['edit','可編輯'],['view','只能看']])}</td>
<td><input type="date" data-adm="${p.user_id}|expires_on" value="${p.expires_on||''}" aria-label="到期日"></td>
<td style="white-space:normal">${Object.keys(brands).map(id=>`<label style="display:inline-flex;gap:4px;margin-right:10px"><input type="checkbox" data-admb="${p.user_id}|${id}" ${adm.access.some(a=>a.user_id===p.user_id&&a.brand_id===id)?'checked':''}>${esc(brands[id].name)}</label>`).join('')||'<span class="note">請先新增品牌</span>'}</td>
<td><input type="text" data-adm="${p.user_id}|note" value="${esc(p.note||'')}" placeholder="例如：10/10 已匯款年費" aria-label="備註" style="min-width:180px"></td><td>${p.status==='active'?`<button data-mail="${p.user_id}">重寄開通信</button>`:''}</td></tr>`}).join('')||'<tr><td colspan="8">還沒有業主註冊。把網站網址傳給業主，請他按「註冊新帳號」。</td></tr>'}</tbody></table></div>
<h2>方案差異</h2><div class="scroll"><table><thead><tr><th>方案</th><th>可用功能</th></tr></thead><tbody><tr><td>基本版</td><td style="white-space:normal">食材主檔、半成品、品項配方、成本毛利、定價漲價試算、叫貨推估、版本存檔</td></tr><tr><td>進階版</td><td style="white-space:normal">基本版全部，加上套餐組合、價格紀錄、產品四象限、外送通路定價、損益趨勢、損益兩平、總部試算四頁</td></tr></tbody></table></div>
<p class="note">「只能看」的業主可以瀏覽所有數字與使用試算，但無法修改資料。到期日當天仍可使用，隔天起自動失效。品牌由你用上方「新增品牌」建立，業主不能自行新增或刪除品牌。</p>` };

/* 開通信由資料庫在狀態改成「使用中」時自動寄出；這裡只負責重寄與回報結果 */
async function sendApproval(uidv){ const {data,error}=await sbc.rpc('bom_send_approval',{target:uidv});
  return error?'通知信未寄出，請稍後再試':data==='sent'?'已寄出開通通知信':data==='nokey'?'通知信未寄出：寄信服務尚未設定完成':'找不到這個帳號' }
async function approvalSent(email){ const since=new Date(Date.now()-60000).toISOString(); const {data}=await sbc.from('bom_mail_log').select('id').eq('recipient',email).eq('kind','approval').gte('at',since).limit(1); return !!(data&&data.length) }

/* ---- 登入與狀態畫面 ---- */
function gate(){ const box=h=>`<div class="col" style="max-width:400px;margin:24px auto;width:100%">${h}</div>`, msg=authMsg?`<p class="sample">${esc(authMsg)}</p>`:'';
  if(G==='loading') return EMPTY('讀取中…');
  if(G==='error') return EMPTY(esc(authMsg||'連線發生問題，請重新整理頁面。'));
  if(G==='pending') return box(`<h2>帳號等待開通</h2><p class="sub">你的帳號（${esc(me&&me.email||'')}）已建立。本系統為付費授權服務，完成付款並經 ${LICENSOR} 審核開通後，你會收到一封開通通知信，即可登入使用。</p><div><button data-auth="reload">重新整理</button> <button data-auth="out">登出</button></div>`);
  if(G==='blocked') return box(`<h2>${prof&&prof.status==='suspended'?'授權已停用':'授權已到期'}</h2><p class="sub">${prof&&prof.status==='suspended'?'這個帳號的使用授權目前已停用。':'這個帳號的使用授權已於 '+esc(prof&&prof.expires_on||'')+' 到期。'}你的資料仍完整保存，續約後即可繼續使用。請聯絡 ${LICENSOR}。</p><div><button data-auth="out">登出</button></div>`);
  if(G==='recover') return box(`<h2>設定新密碼</h2><form id="authForm" class="col"><label for="auPass">新密碼（至少 8 個字）</label><input type="password" id="auPass" minlength="8" required autocomplete="new-password"><button class="pri" type="submit">儲存新密碼</button></form>${msg}`);
  const up=authMode==='up', fg=authMode==='forgot';
  return box(`<h2>${fg?'重設密碼':up?'註冊新帳號':'登入'}</h2><p class="sub">${fg?'輸入註冊時的 Email，我們會寄一封重設密碼的信給你。':up?'本系統為付費授權服務。註冊後需經 '+LICENSOR+' 審核開通才能使用，開通時會以 Email 通知。':'餐飲品牌的食材、配方、成本與獲利試算工具。'}</p>
<form id="authForm" class="col">${up?'<label for="auName">店名或公司名稱</label><input type="text" id="auName" required maxlength="60" autocomplete="organization">':''}
<label for="auEmail">Email</label><input type="email" id="auEmail" required autocomplete="username">
${fg?'':`<label for="auPass">密碼${up?'（至少 8 個字）':''}</label><input type="password" id="auPass" minlength="8" required autocomplete="${up?'new-password':'current-password'}">`}
<button class="pri" type="submit">${fg?'寄出重設信':up?'註冊':'登入'}</button></form>${msg}
<div class="brandbar">${up||fg?'<button data-auth="in">已有帳號，回登入</button>':'<button data-auth="up">註冊新帳號</button><button data-auth="forgot">忘記密碼</button>'}</div>`) }
const AUTH_ERR=e=>{ const m=(e&&e.message||'').toLowerCase();
  if(m.includes('invalid login')) return 'Email 或密碼不正確。';
  if(m.includes('not confirmed')) return '這個 Email 還沒完成驗證，請到信箱點擊確認信裡的連結。';
  if(m.includes('already registered')||m.includes('already been registered')) return '這個 Email 已經註冊過，請直接登入。';
  if(m.includes('rate limit')||m.includes('security purposes')) return '操作太頻繁，請稍等一分鐘再試。';
  if(m.includes('password')) return '密碼不符合規定，請至少輸入 8 個字。';
  return '無法完成，請檢查網路後再試一次。' };
async function authSubmit(){ const F={}; ['auName','auEmail','auPass'].forEach(id=>{const e=document.getElementById(id); F[id]=e?(id==='auPass'?e.value:e.value.trim()):''}); const v=id=>F[id];
  const keep=()=>{['auName','auEmail'].forEach(id=>{const e=document.getElementById(id); if(e) e.value=F[id]})}; authMsg='處理中…'; render(); keep();
  try{ if(G==='recover'){ const {error}=await sbc.auth.updateUser({password:v('auPass')}); if(error) throw error; authMsg=''; G='loading'; render(); return loadAll() }
    if(authMode==='forgot'){ const {error}=await sbc.auth.resetPasswordForEmail(v('auEmail'),{redirectTo:location.origin+location.pathname}); if(error) throw error; authMsg='重設信已寄出，請到信箱收信。'; return render() }
    if(authMode==='up'){ const {data,error}=await sbc.auth.signUp({email:v('auEmail'),password:v('auPass'),options:{data:{display_name:v('auName')},emailRedirectTo:location.origin+location.pathname}}); if(error) throw error;
      if(!data.session){ authMode='in'; authMsg='註冊成功。請到信箱點擊確認信裡的連結，再回來登入。'; return render() } authMsg=''; return }
    const {error}=await sbc.auth.signInWithPassword({email:v('auEmail'),password:v('auPass')}); if(error) throw error; authMsg='' }
  catch(e){ authMsg=AUTH_ERR(e); render(); keep() } }

async function loadAll(){ try{
    const {data:p,error:pe}=await sbc.from('bom_profiles').select('*').eq('user_id',me.id).maybeSingle(); if(pe) throw pe; prof=p;
    if(!prof||prof.status==='pending'){ G='pending'; return render() }
    if(prof.status==='suspended'||(!isAdmin()&&expired())){ G='blocked'; return render() }
    const bs=await sbc.from('bom_brands').select('id,name,data,rev').order('name');
    if(bs.error) throw bs.error;
    brands={}; Object.keys(revs).forEach(k=>delete revs[k]); (bs.data||[]).forEach(applyRemote);
    await loadVersions();
    if(isAdmin()){ if(!adminTab){ TABS[TABS.length-1][2].push(['admin','授權管理']); adminTab=true } await loadAdmin() }
    cur=null; pick(); if(!allowed(tab)) tab='cost'; G='app'; setStatus('已連線'); startWatch(); render() }
  catch(e){ G='error'; authMsg='讀取資料時發生問題，請重新整理頁面。'; render() } }

function render(){ const app=G==='app', ub=$('#userbar'); $('#nav').hidden=!app; $('#brandbar').hidden=!app;
  ub.innerHTML=me&&G!=='login'&&G!=='recover'?`<span class="status">${esc(me.email)}${prof&&app?' · '+(isAdmin()?'管理員':PLAN_NAME[prof.plan]+' · '+(RO()?'只能看':'可編輯')+(prof.expires_on?' · 到期 '+prof.expires_on:'')):''}</span><button data-auth="out">登出</button>`:'';
  if(!app){ $('#nav').innerHTML=''; $('#banner').innerHTML=''; $('#main').innerHTML=gate(); return }
  renderApp();
  if(notice) $('#banner').insertAdjacentHTML('afterbegin','<div class="sample" role="status" style="margin-bottom:10px">'+esc(notice)+' <button data-notice="1">知道了</button></div>');
  document.querySelectorAll('#nav [data-tab]').forEach(el=>{ if(!allowed(el.dataset.tab)){ el.insertAdjacentHTML('beforeend',' <span class="tag">進階</span>') } });
  $('#btnNew').hidden=!isAdmin(); $('#btnCopy').hidden=!isAdmin()||!B();
  if(!B()&&!isAdmin()){ $('#main').innerHTML=EMPTY('你的帳號還沒有被指派品牌。請聯絡 '+LICENSOR+'。'); return }
  if(!isAdmin()) document.querySelectorAll('#banner [data-del],#banner [data-unsample]').forEach(el=>el.hidden=true);
  if(B()&&!allowed(tab)){ $('#main').innerHTML=`<div class="empty"><h2>這是進階版功能</h2><p class="sub">你目前的方案是${PLAN_NAME[prof.plan]}。想使用這項分析，請聯絡 ${LICENSOR} 升級為進階版。</p></div>`; return }
  if(RO()){ document.querySelectorAll('#main [data-p],#banner [data-p]').forEach(el=>{ if(!el.dataset.ui&&!el.dataset.mx&&!el.dataset.sim) el.disabled=true });
    document.querySelectorAll('#main [data-add],#main [data-del],#main [data-act],#main [data-arm],#main #verNote').forEach(el=>el.hidden=true) } }

document.addEventListener('submit',e=>{ if(e.target.id==='authForm'){ e.preventDefault(); authSubmit() } });
document.addEventListener('click',e=>{ const t=e.target.closest('button'); if(!t) return; const a=t.dataset.auth;
  if(t.dataset.notice){ notice=''; render(); return }
  if(t.dataset.tab==='log'||t.dataset.act==='logreload'){ loadLog().then(()=>{ if(tab==='log') render() }) }
  if(a==='up'||a==='in'||a==='forgot'){ authMode=a; authMsg=''; render(); return }
  if(a==='out'){ sbc.auth.signOut(); return }
  if(a==='reload'){ G='loading'; render(); loadAll(); return }
  if(t.dataset.act==='admreload'&&isAdmin()){ loadAdmin().then(render) }
  if(t.dataset.mail&&isAdmin()){ setStatus('寄送中…'); sendApproval(t.dataset.mail).then(setStatus) } });
document.addEventListener('change',async e=>{ const el=e.target; if(!isAdmin()) return;
  if(el.dataset.adm){ const [uidv,f]=el.dataset.adm.split('|'), was=adm.profiles.find(p=>p.user_id===uidv)||{}; const {error}=await sbc.from('bom_profiles').update({[f]:el.value===''?null:el.value}).eq('user_id',uidv); let m=error?'更新失敗':'授權已更新';
    if(!error&&f==='status'&&el.value==='active'&&was.status!=='active'&&was.email) m=(await approvalSent(was.email))?'已開通，並已自動寄出開通通知信給 '+was.email:'已開通。通知信未寄出：寄信服務尚未設定完成，設定後可按「重寄開通信」';
    setStatus(m); await loadAdmin(); render() }
  else if(el.dataset.admb){ const [uidv,bid]=el.dataset.admb.split('|'); const r=el.checked?await sbc.from('bom_brand_access').insert({user_id:uidv,brand_id:bid}):await sbc.from('bom_brand_access').delete().eq('user_id',uidv).eq('brand_id',bid); setStatus(r.error?'更新失敗':'品牌權限已更新'); await loadAdmin(); render() } });

async function siteBoot(){ const h=location.hash.slice(1); if(TABIDS.includes(h)) tab=h;
  if(!window.supabase){ G='error'; authMsg='無法載入登入元件，請檢查網路後重新整理。'; return render() }
  sbc=window.supabase.createClient(SUPA_URL,SUPA_KEY);
  dl={save:async({filename,data})=>{ const u=URL.createObjectURL(new Blob([data])), a=document.createElement('a'); a.href=u; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u),5000) }};
  sbc.auth.onAuthStateChange((ev,s)=>{ setTimeout(()=>{
    if(ev==='PASSWORD_RECOVERY'){ me=s&&s.user; G='recover'; authMsg=''; render(); return }
    if(ev==='SIGNED_OUT'){ me=null; prof=null; brands={}; versions=[]; notice=''; logRows=null; cur=null; G='login'; authMode='in'; render(); return }
    if(ev==='SIGNED_IN'&&s&&G!=='recover'&&(!me||me.id!==s.user.id)){ me=s.user; G='loading'; render(); loadAll() } },0) });
  const {data}=await sbc.auth.getSession();
  if(data&&data.session){ if(!me){ me=data.session.user; G='loading'; render(); loadAll() } } else if(G==='loading'){ G='login'; render() } }
siteBoot();
