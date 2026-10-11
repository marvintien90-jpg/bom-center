/* ===== 網站版：登入、授權、資料存取（Supabase） ===== */
const SUPA_URL='https://thxqncpkkzmpktwuvzvz.supabase.co';
const SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoeHFuY3Bra3ptcGt0d3V2enZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MTMyODcsImV4cCI6MjEwNjk4OTI4N30.cDjeuOxx2UZLrOWYcNhqy4dO2cdznscJ7CWr0DZGZ2g';
const LICENSOR='品牌加辣餐飲顧問工作室';
const PLAN_NAME={basic:'基本版',pro:'進階版'}, BASIC=['home','account','help','ing','semi','recipe','cost','price','order','ver','log'];
let sbc=null, me=null, prof=null, G='loading', authMsg='', authMode='in', adm={profiles:[],access:[]}, adminTab=false, notice='', logRows=null, watchOn=false, rtT=null; const revs={}, saving=new Set();
TABS[TABS.length-1][2].push(['log','修改紀錄']);
/* 左側選單：照業主的工作順序分層 */
const NAV=[['data','資料建立',['ing','semi','recipe','combo']],['price','成本與定價',['cost','matrix','price','channel']],['ops','營運管理',['order','pricelog','pl','be']],['hq','總部與加盟',['markup','hqitem','supply','frsim']],['sys','系統',['ver','log','account','help','admin']]];
const LAB={home:'首頁',ing:'食材主檔',semi:'半成品',recipe:'品項配方',combo:'套餐組合',cost:'成本毛利',matrix:'產品四象限',price:'定價漲價試算',channel:'外送通路定價',order:'叫貨推估',pricelog:'價格紀錄',pl:'損益趨勢',be:'損益兩平',markup:'疊價設定',hqitem:'單品獲利',supply:'總供貨試算',frsim:'加盟主損益',ver:'版本與備份',log:'修改紀錄',account:'我的帳號',help:'使用說明',admin:'授權管理'};
/* 每頁一句話：這頁要先做什麼、做完去哪 */
const TIP={ing:['從這裡開始。每樣食材填名稱、進貨價和一包的量，後面的配方才選得到。','recipe'],semi:['有先煮好再用的醬料、高湯才需要填，沒有可以跳過。','recipe'],recipe:['左邊選一道菜，右邊填它用了哪些食材和用量，再填售價和月銷量。','cost'],combo:['先建好單品，才能在這裡把它們綁成套餐。','cost'],
 cost:['紅色代表成本超過目標。想知道該賣多少錢，到定價試算。','price'],matrix:['要先在品項配方填每道菜的月銷量，分類才會準。','price'],price:['上半部看建議售價，下半部試算食材漲價的影響。這頁的試算不會改到你的資料。','order'],channel:['先新增外送平台和抽成比例，就能看外送價該加幾成。','be'],
 order:['要先在品項配方填月銷量，才算得出每樣食材該叫多少。',''],pricelog:['不用手動填。只要在食材主檔改進貨價，這裡就會自動記一筆。',''],pl:['每個月把損益表的數字填進來，就能看成本率的走勢。','be'],be:['先填每月固定費用，就能算出一個月要做多少營收才不賠。',''],
 markup:['先設一個預設疊價，個別食材要不一樣再單獨填。','hqitem'],hqitem:['這頁只看不用填，數字來自疊價設定和配方。','supply'],supply:['先在上方填直營店和加盟店的家數。','frsim'],frsim:['填一家加盟店的營收和費用，看它賺不賺、多久回本。','']};
let navShut={}, acctMsg='', authF={name:'',email:''}, needConfirm=false; try{ navShut=JSON.parse(localStorage.getItem('bom-nav')||'{}')||{} }catch(e){}
function navHtml(){ const it=id=>`<button class="navi" data-tab="${id}" ${tab===id?'aria-current="page"':''}><span>${LAB[id]}</span>${allowed(id)?'':'<span class="tag">進階</span>'}</button>`;
  return it('home')+NAV.map(g=>{ const ids=g[2].filter(id=>id!=='admin'||isAdmin()), open=!navShut[g[0]]||ids.includes(tab);
    return `<button class="navi navg" data-grp="${g[0]}" aria-expanded="${open}"><span>${g[1]}</span><span aria-hidden="true">${open?'−':'+'}</span></button>${open?`<div class="navsub">${ids.map(it).join('')}</div>`:''}` }).join('') }
const pwField=(id,label,ac,hint)=>`<label for="${id}">${label}</label><div class="pwrow"><input type="password" id="${id}" minlength="8" required autocomplete="${ac}"><button type="button" data-eye="${id}" aria-label="顯示或隱藏密碼">顯示</button></div>${hint?`<span class="note" data-pwhint="${id}">至少 8 個字，可以混合英文和數字。</span>`:''}`;
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

/* ---- 首頁、我的帳號、使用說明 ---- */
const LOGIN_FAQ=()=>`<details><summary>忘記密碼</summary><p class="sub">在登入頁按「忘記密碼」，輸入註冊的 Email。幾分鐘內會收到一封信，點信裡的連結就能設定新密碼。連結一小時內有效，而且只能用一次。</p></details>
<details><summary>註冊後沒收到驗證信</summary><p class="sub">先看垃圾信匣或「促銷內容」分類，寄件人是 no-reply@mail.spicesupbrand.com。還是沒有的話，回到登入頁填好 Email，按「重寄驗證信」。</p></details>
<details><summary>顯示「Email 或密碼不正確」</summary><p class="sub">最常見是大小寫或多打了空白。按密碼欄旁的「顯示」可以看到自己打了什麼。確定記不得就用「忘記密碼」。</p></details>
<details><summary>登入後顯示「帳號等待開通」</summary><p class="sub">這是正常的。本系統是付費授權服務，註冊後要等 ${LICENSOR} 確認並開通。開通後你會收到通知信，再回來登入即可。</p></details>
<details><summary>顯示「授權已到期」或「已停用」</summary><p class="sub">你的資料都還在，沒有被刪除。聯絡 ${LICENSOR} 續約後，登入就能繼續使用。</p></details>
<details><summary>點了信裡的連結卻說連結失效</summary><p class="sub">每個連結只能用一次，而且有時間限制。有些信箱會先自動「預覽」連結，也會讓它失效。重新操作一次（忘記密碼或重寄驗證信），收到新信後直接點最新那一封。</p></details>`;
V.home=(b,c)=>{ const t=b.settings.targetRate/100; let sales=0,cost=0,over=0; b.items.forEach(it=>{ const k=itemCalc(it,c),q=it.monthlySales||0; sales+=it.price*q; cost+=k.fr*q; if(it.price>0&&k.fr/it.price>t+0.03) over++ });
  const s1=b.ingredients.length>0, s2=b.items.length>0, s3=sales>0, done=s1&&s2&&s3;
  const step=(n,ok,title,desc,to,btn)=>`<div class="step ${ok?'done':''}"><b>${ok?'✓':n} ${title}</b><span class="sub">${desc}</span>${allowed(to)?`<button data-tab="${to}" class="${ok?'':'pri'}">${btn}</button>`:''}</div>`;
  const left=prof&&prof.expires_on?Math.round((new Date(prof.expires_on)-new Date(today()))/86400e3):null;
  const pend=isAdmin()?adm.profiles.filter(p=>p.role!=='admin'&&p.status==='pending').length:0;
  const rows=(logRows||[]).filter(r=>r.brand_id===cur).slice(0,5), who={admin:'顧問',client:'業主',system:'系統'};
  return `<div class="head"><div><h2>${esc(b.name)}</h2><p class="sub">${done?'資料已經建好，下面是目前的重點數字。':'照下面的順序做，三步就能看到每道菜的成本和毛利。'}</p></div></div>
${!isAdmin()&&left!==null&&left<=30?`<p class="sample">你的使用授權將在 ${left} 天後（${esc(prof.expires_on)}）到期。到期後資料會保留，但需要續約才能繼續使用，請聯絡 ${LICENSOR}。</p>`:''}
${pend?`<p class="sample">有 ${pend} 位業主註冊後在等你開通。 <button data-tab="admin">前往授權管理</button></p>`:''}
${RO()?'<p class="note">你的帳號是「只能看」權限，可以瀏覽數字和使用試算，但不能修改資料。</p>':''}
<div class="steps">${step('①',s1,'建立食材','目前 '+b.ingredients.length+' 樣。填名稱、進貨價、一包的量。','ing',s1?'查看食材':'開始建立食材')}
${step('②',s2,'建立品項配方','目前 '+b.items.length+' 道。每道菜用了哪些食材、各多少。','recipe',s2?'查看配方':'開始建立配方')}
${step('③',s3,'填售價和月銷量','有了銷量才能算整體成本率和該叫多少貨。','recipe',s3?'調整銷量':'去填月銷量')}
${step('④',false,'看成本與毛利','哪道菜賺、哪道菜成本超標，一眼看出來。','cost','看成本毛利')}</div>
${s2?`<div class="tiles"><div class="tile"><span>食材</span><b>${b.ingredients.length}</b></div><div class="tile"><span>品項</span><b>${b.items.length}</b></div><div class="tile"><span>整體食材成本率</span><b>${pct(cost/sales)}</b><span>目標 ${nf(b.settings.targetRate,0)}%</span></div><div class="tile"><span>成本超標的品項</span><b>${over}</b><span>超過目標 3 個百分點以上</span></div></div>`:''}
<h2>最近的修改</h2><div class="scroll"><table><thead><tr><th>時間</th><th>誰</th><th>改了哪些</th></tr></thead><tbody>${logRows===null?'<tr><td colspan="3">讀取中…</td></tr>':rows.map(r=>`<tr><td>${tm(r.at)}</td><td>${esc(r.actor_email||'')}（${who[r.actor_role]||''}）</td><td style="white-space:normal">${(r.sections||[]).map(x=>SEC[x]||x).join('、')||'建立或刪除'}</td></tr>`).join('')||'<tr><td colspan="3">這個品牌還沒有修改紀錄。</td></tr>'}</tbody></table></div>
<p class="note">資料會自動儲存，不需要按存檔。每個人每天第一次修改前，系統會先自動備份一份，可以在「版本與備份」還原。</p>` };
V.account=()=>`<div class="head"><div><h2>我的帳號</h2><p class="sub">查看你的方案和到期日，或修改登入密碼。</p></div></div>
<div class="scroll"><table><tbody><tr><th>登入 Email</th><td>${esc(me&&me.email||'')}</td></tr><tr><th>名稱</th><td>${esc(prof&&prof.display_name||'')}</td></tr><tr><th>身分</th><td>${isAdmin()?'管理員（顧問）':'業主'}</td></tr>${isAdmin()?'':`<tr><th>方案</th><td>${PLAN_NAME[prof.plan]}</td></tr><tr><th>權限</th><td>${RO()?'只能看':'可編輯'}</td></tr><tr><th>到期日</th><td>${esc(prof.expires_on||'不限期')}</td></tr>`}</tbody></table></div>
<h2>修改密碼</h2><form id="pwForm" class="col" style="max-width:380px">${pwField('npw','新密碼','new-password',true)}<div><button class="pri" type="submit">儲存新密碼</button></div></form>
${acctMsg?`<p class="sample" role="status">${esc(acctMsg)}</p>`:''}
<p class="note">想變更方案、權限或登入 Email，請聯絡 ${LICENSOR}。</p>`;
V.help=()=>`<div class="head"><div><h2>使用說明</h2><p class="sub">常見問題整理在這裡。點問題可以展開答案。</p></div></div>
<h2>操作</h2>
<details><summary>要從哪裡開始？</summary><p class="sub">照首頁的順序：先建食材，再建品項配方並填售價和月銷量，最後看成本毛利。左側選單也是照這個順序由上往下排。</p></details>
<details><summary>改了資料要按存檔嗎？</summary><p class="sub">不用。離開輸入格後約一秒會自動儲存，畫面右上角會顯示「已儲存」。如果顯示「儲存失敗」，請檢查網路後重新整理頁面。</p></details>
<details><summary>改錯了可以救回來嗎？</summary><p class="sub">可以。到「版本與備份」找到之前的存檔點按「還原」。系統每天在你第一次修改前會自動存一份；重要調整前也可以自己按「建立存檔點」。</p></details>
<details><summary>我和顧問同時改會不會互相蓋掉？</summary><p class="sub">不會。系統發現別人剛改過，就不會把你的版本蓋上去，而是把你的修改另存成一個存檔點，並在畫面上方通知你。</p></details>
<details><summary>選單上有「進階」標記的是什麼？</summary><p class="sub">那是進階版才有的功能。想使用請聯絡 ${LICENSOR} 升級方案。</p></details>
<details><summary>可以在手機上用嗎？</summary><p class="sub">可以。手機上選單會收在左上角的「選單」按鈕裡。表格比較寬時可以左右滑動。</p></details>
<h2>登入與帳號</h2>${LOGIN_FAQ()}`;

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
function gate(){ const box=h=>`<div class="col" style="max-width:420px;margin:24px auto;width:100%"><div><h1>BOM 運算中心</h1><p class="sub">餐飲品牌的食材、配方、成本與獲利試算工具</p></div>${h}</div>`, msg=authMsg?`<p class="sample" role="status">${esc(authMsg)}</p>`:'';
  const faq=`<details><summary>登不進去？常見狀況與解法</summary><div class="col" style="margin-top:8px">${LOGIN_FAQ()}</div></details>`;
  const stepl=(a)=>`<ol class="sub" style="padding-left:20px">${a.map((x,i)=>`<li>${x}</li>`).join('')}</ol>`;
  if(G==='loading') return EMPTY('讀取中…');
  if(G==='error') return box(`<h2>連線發生問題</h2><p class="sub">${esc(authMsg||'請重新整理頁面。')}</p><div><button class="pri" data-auth="hard">重新整理</button>${me?' <button data-auth="out">登出</button>':''}</div>`);
  if(G==='pending') return box(`<h2>帳號等待開通</h2><p class="sub">你的帳號（${esc(me&&me.email||'')}）已經建立，目前在等待審核。</p>${stepl(['註冊完成 ✓','Email 驗證完成 ✓','<b>等待 '+LICENSOR+' 確認付款並開通（目前在這一步）</b>','收到開通通知信後，回到這裡登入就能使用'])}<p class="note">已經收到開通信但還是看到這頁？按「重新檢查」。</p><div><button class="pri" data-auth="reload">重新檢查</button> <button data-auth="out">登出</button></div>`);
  if(G==='blocked'){ const sus=prof&&prof.status==='suspended'; return box(`<h2>${sus?'授權已停用':'授權已到期'}</h2><p class="sub">${sus?'這個帳號的使用授權目前已停用。':'這個帳號的使用授權已於 '+esc(prof&&prof.expires_on||'')+' 到期。'}</p>${stepl(['你的資料都完整保存著，沒有被刪除','聯絡 '+LICENSOR+' 辦理'+(sus?'恢復':'續約'),'處理完成後回到這裡按「重新檢查」，就能繼續使用'])}<div><button class="pri" data-auth="reload">重新檢查</button> <button data-auth="out">登出</button></div>`) }
  if(G==='recover') return box(`<h2>設定新密碼</h2><p class="sub">請輸入一組新的密碼，儲存後會直接登入。</p><form id="authForm" class="col">${pwField('auPass','新密碼','new-password',true)}<button class="pri" type="submit">儲存新密碼</button></form>${msg}`);
  const up=authMode==='up', fg=authMode==='forgot';
  return box(`<h2>${fg?'重設密碼':up?'註冊新帳號':'登入'}</h2><p class="sub">${fg?'輸入註冊時的 Email，我們會寄一封重設密碼的信給你。':up?'本系統為付費授權服務。註冊後需經 '+LICENSOR+' 審核開通才能使用，開通時會以 Email 通知。':'請輸入註冊時的 Email 和密碼。'}</p>
<form id="authForm" class="col">${up?`<label for="auName">店名或公司名稱</label><input type="text" id="auName" required maxlength="60" autocomplete="organization" value="${esc(authF.name)}">`:''}
<label for="auEmail">Email</label><input type="email" id="auEmail" required autocomplete="username" value="${esc(authF.email)}">
${fg?'':pwField('auPass','密碼',up?'new-password':'current-password',up)}
<button class="pri" type="submit">${fg?'寄出重設信':up?'註冊':'登入'}</button></form>${msg}
${needConfirm?'<div><button data-auth="resend">重寄驗證信</button></div>':''}
<div class="brandbar">${up||fg?'<button data-auth="in">已有帳號，回登入</button>':'<button data-auth="up">註冊新帳號</button><button data-auth="forgot">忘記密碼</button>'}${needConfirm?'':'<button data-auth="resend">重寄驗證信</button>'}</div>
${faq}`) }
const AUTH_ERR=e=>{ const raw=(e&&e.message||''), m=raw.toLowerCase();
  if(m.includes('failed to fetch')||m.includes('network')||m.includes('load failed')) return '連不上伺服器。請確認網路正常後再試一次；如果用的是公司網路，可以改用手機網路試試。';
  if(m.includes('invalid login')) return 'Email 或密碼不正確。請檢查大小寫和有沒有多打空白（可按「顯示」看密碼）。忘記密碼請按下方「忘記密碼」；還沒註冊請按「註冊新帳號」。';
  if(m.includes('not confirmed')){ needConfirm=true; return '這個 Email 還沒完成驗證。請到信箱點確認信裡的連結；找不到信的話，按下面的「重寄驗證信」。' }
  if(m.includes('already registered')||m.includes('already been registered')) return '這個 Email 已經註冊過，請直接登入。忘記密碼可按「忘記密碼」。';
  if(m.includes('email rate limit')) return '短時間內寄信次數太多。請等一小時後再試，或聯絡 '+LICENSOR+' 協助。';
  if(m.includes('rate limit')||m.includes('security purposes')) return '操作太頻繁，請等一分鐘再試。';
  if(m.includes('different from the old')) return '新密碼不能和原本的密碼一樣，請換一組。';
  if(m.includes('session missing')||m.includes('expired')) return '這個連結已經失效。請回登入頁重新按「忘記密碼」，再點最新那封信裡的連結。';
  if(m.includes('invalid')&&m.includes('email')) return 'Email 格式不正確，請檢查有沒有打錯。';
  if(m.includes('password')) return '密碼不符合規定，請至少輸入 8 個字。';
  return '無法完成（'+raw.slice(0,70)+'）。請稍後再試一次；還是不行的話，把這段訊息告訴 '+LICENSOR+'。' };
const REDIR=()=>location.origin+location.pathname;
function grab(){ const n=document.getElementById('auName'), e=document.getElementById('auEmail'); if(n) authF.name=n.value.trim(); if(e) authF.email=e.value.trim() }
async function resendConfirm(){ grab(); if(!authF.email){ authMsg='請先在上面填入註冊用的 Email，再按「重寄驗證信」。'; return render() }
  authMsg='處理中…'; render();
  try{ const {error}=await sbc.auth.resend({type:'signup',email:authF.email,options:{emailRedirectTo:REDIR()}}); if(error) throw error; authMsg='如果 '+authF.email+' 是尚未驗證的帳號，驗證信已重新寄出。請到信箱點最新那封信的連結，也看一下垃圾信匣。' }catch(e){ authMsg=AUTH_ERR(e) } render() }
async function authSubmit(){ grab(); const pe=document.getElementById('auPass'), pass=pe?pe.value:''; authMsg='處理中…'; render();
  try{ if(G==='recover'){ const {error}=await sbc.auth.updateUser({password:pass}); if(error) throw error; authMsg=''; notice='密碼已更新，下次請用新密碼登入。'; G='loading'; render(); return loadAll() }
    if(authMode==='forgot'){ const {error}=await sbc.auth.resetPasswordForEmail(authF.email,{redirectTo:REDIR()}); if(error) throw error; authMsg='如果這個 Email 有註冊過，重設信已經寄出。請在一小時內點信裡的連結；沒收到請看垃圾信匣。'; return render() }
    if(authMode==='up'){ const {data,error}=await sbc.auth.signUp({email:authF.email,password:pass,options:{data:{display_name:authF.name},emailRedirectTo:REDIR()}}); if(error) throw error;
      if(data.user&&data.user.identities&&!data.user.identities.length){ authMode='in'; authMsg='這個 Email 已經註冊過，請直接登入。忘記密碼可按「忘記密碼」。'; return render() }
      if(!data.session){ authMode='in'; needConfirm=true; authMsg='註冊成功。我們寄了一封確認信到 '+authF.email+'，請點信裡的連結完成驗證，再回來登入。沒收到請看垃圾信匣，或按「重寄驗證信」。'; return render() } authMsg=''; return }
    const {error}=await sbc.auth.signInWithPassword({email:authF.email,password:pass}); if(error) throw error; authMsg=''; needConfirm=false }
  catch(e){ authMsg=AUTH_ERR(e); render() } }
async function pwSubmit(){ const e=document.getElementById('npw'), p=e?e.value:''; acctMsg='處理中…'; render();
  const {error}=await sbc.auth.updateUser({password:p}); acctMsg=error?AUTH_ERR(error):'密碼已更新，下次請用新密碼登入。'; render() }

async function loadAll(){ try{
    const {data:p,error:pe}=await sbc.from('bom_profiles').select('*').eq('user_id',me.id).maybeSingle(); if(pe) throw pe; prof=p;
    if(!prof||prof.status==='pending'){ G='pending'; return render() }
    if(prof.status==='suspended'||(!isAdmin()&&expired())){ G='blocked'; return render() }
    const bs=await sbc.from('bom_brands').select('id,name,data,rev').order('name');
    if(bs.error) throw bs.error;
    brands={}; Object.keys(revs).forEach(k=>delete revs[k]); (bs.data||[]).forEach(applyRemote);
    await loadVersions();
    if(isAdmin()){ if(!adminTab){ TABS[TABS.length-1][2].push(['admin','授權管理']); adminTab=true } await loadAdmin() }
    cur=null; pick(); if(!V[tab]||!allowed(tab)||(tab==='admin'&&!isAdmin())) tab='home'; G='app'; setStatus('已連線'); startWatch(); render(); loadLog().then(()=>{ if(tab==='home') render() }) }
  catch(e){ G='error'; authMsg='讀取資料時發生問題，請重新整理頁面。'; render() } }

function render(){ const app=G==='app', ub=$('#userbar'), sh=$('#shell'); sh.classList.toggle('bare',!app); if(!app) sh.classList.remove('open');
  ub.innerHTML=me&&app?`<span>${esc(me.email)}</span><span class="status">${isAdmin()?'管理員':PLAN_NAME[prof.plan]+' · '+(RO()?'只能看':'可編輯')+(prof.expires_on?' · 到期 '+prof.expires_on:'')}</span><div class="brandbar"><button data-tab="account">我的帳號</button><button data-auth="out">登出</button></div>`:'';
  if(!app){ $('#nav').innerHTML=''; $('#banner').innerHTML=''; $('#main').innerHTML=gate(); return }
  if(!V[tab]) tab='home';
  renderApp();
  $('#nav').innerHTML=navHtml(); const g=NAV.find(x=>x[2].includes(tab)); $('#crumb').textContent=(g?g[1]+' › ':'')+LAB[tab]; document.title=LAB[tab]+'｜BOM 運算中心';
  if(tab!=='home'){ const p=$('#banner .params'); if(p) p.remove() }
  if(notice) $('#banner').insertAdjacentHTML('afterbegin','<div class="sample" role="status" style="margin-bottom:10px">'+esc(notice)+' <button data-notice="1">知道了</button></div>');
  $('#btnNew').hidden=!isAdmin(); $('#btnCopy').hidden=!isAdmin()||!B();
  if(tab==='account'||tab==='help'){ $('#main').innerHTML=V[tab](); return }
  if(!B()&&!isAdmin()){ $('#main').innerHTML=EMPTY('你的帳號還沒有被指派品牌。請聯絡 '+LICENSOR+'。'); return }
  if(!B()) return;
  if(!isAdmin()) document.querySelectorAll('#banner [data-del],#banner [data-unsample]').forEach(el=>el.hidden=true);
  if(!allowed(tab)){ $('#main').innerHTML=`<div class="empty"><h2>「${LAB[tab]}」是進階版功能</h2><p class="sub">你目前的方案是${PLAN_NAME[prof.plan]}。想使用這項分析，請聯絡 ${LICENSOR} 升級為進階版。升級後原本的資料會直接沿用。</p><button data-tab="home">回首頁</button></div>`; return }
  if(TIP[tab]){ const n=TIP[tab][1]; $('#main').insertAdjacentHTML('afterbegin',`<div class="tip"><span><b>提示</b>　${TIP[tab][0]}</span>${n&&allowed(n)?`<button data-tab="${n}">下一步：${LAB[n]} →</button>`:''}</div>`) }
  if(RO()){ document.querySelectorAll('#main [data-p],#banner [data-p]').forEach(el=>{ if(!el.dataset.ui&&!el.dataset.mx&&!el.dataset.sim) el.disabled=true });
    document.querySelectorAll('#main [data-add],#main [data-del],#main [data-act],#main [data-arm],#main #verNote').forEach(el=>el.hidden=true) } }

document.addEventListener('submit',e=>{ if(e.target.id==='authForm'){ e.preventDefault(); authSubmit() } if(e.target.id==='pwForm'){ e.preventDefault(); pwSubmit() } });
document.addEventListener('input',e=>{ const h=document.querySelector('[data-pwhint="'+e.target.id+'"]'); if(!h) return; const n=e.target.value.length; h.textContent=n>=8?'長度足夠。':'還差 '+(8-n)+' 個字。' });
document.addEventListener('click',e=>{ if(e.target.id==='scrim') $('#shell').classList.remove('open') });
document.addEventListener('click',e=>{ const t=e.target.closest('button'); if(!t) return; const a=t.dataset.auth;
  if(t.dataset.notice){ notice=''; render(); return }
  if(t.id==='btnMenu'){ $('#shell').classList.add('open'); return } if(t.id==='btnClose'){ $('#shell').classList.remove('open'); return }
  if(t.dataset.eye){ const i=document.getElementById(t.dataset.eye); if(i){ i.type=i.type==='password'?'text':'password'; t.textContent=i.type==='password'?'顯示':'隱藏' } return }
  if(t.dataset.grp){ navShut[t.dataset.grp]=!navShut[t.dataset.grp]; try{localStorage.setItem('bom-nav',JSON.stringify(navShut))}catch(x){} $('#nav').innerHTML=navHtml(); return }
  if(t.dataset.tab){ $('#shell').classList.remove('open'); acctMsg=''; window.scrollTo(0,0); if(t.dataset.tab==='home') loadLog().then(()=>{ if(tab==='home') render() }) }
  if(a==='resend'){ resendConfirm(); return } if(a==='hard'){ location.reload(); return }
  if(t.dataset.tab==='log'||t.dataset.act==='logreload'){ loadLog().then(()=>{ if(tab==='log') render() }) }
  if(a==='up'||a==='in'||a==='forgot'){ grab(); authMode=a; authMsg=''; render(); return }
  if(a==='out'){ sbc.auth.signOut(); return }
  if(a==='reload'){ G='loading'; render(); loadAll(); return }
  if(t.dataset.act==='admreload'&&isAdmin()){ loadAdmin().then(render) }
  if(t.dataset.mail&&isAdmin()){ setStatus('寄送中…'); sendApproval(t.dataset.mail).then(setStatus) } });
document.addEventListener('change',async e=>{ const el=e.target; if(!isAdmin()) return;
  if(el.dataset.adm){ const [uidv,f]=el.dataset.adm.split('|'), was=adm.profiles.find(p=>p.user_id===uidv)||{}; const {error}=await sbc.from('bom_profiles').update({[f]:el.value===''?null:el.value}).eq('user_id',uidv); let m=error?'更新失敗':'授權已更新';
    if(!error&&f==='status'&&el.value==='active'&&was.status!=='active'&&was.email) m=(await approvalSent(was.email))?'已開通，並已自動寄出開通通知信給 '+was.email:'已開通。通知信未寄出：寄信服務尚未設定完成，設定後可按「重寄開通信」';
    setStatus(m); await loadAdmin(); render() }
  else if(el.dataset.admb){ const [uidv,bid]=el.dataset.admb.split('|'); const r=el.checked?await sbc.from('bom_brand_access').insert({user_id:uidv,brand_id:bid}):await sbc.from('bom_brand_access').delete().eq('user_id',uidv).eq('brand_id',bid); setStatus(r.error?'更新失敗':'品牌權限已更新'); await loadAdmin(); render() } });

async function siteBoot(){ const h=location.hash.slice(1); tab=LAB[h]?h:'home';
  if(/error_code=|error=access_denied/.test(h)){ authMsg='這個連結已經過期或已經用過。請在下面重新操作一次（忘記密碼或重寄驗證信），再點最新那封信裡的連結。'; try{history.replaceState(null,'',location.pathname)}catch(x){} }
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
