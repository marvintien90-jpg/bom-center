/* ===== 網站版：登入、授權、資料存取（Supabase） ===== */
const SUPA_URL='https://thxqncpkkzmpktwuvzvz.supabase.co';
const SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoeHFuY3Bra3ptcGt0d3V2enZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MTMyODcsImV4cCI6MjEwNjk4OTI4N30.cDjeuOxx2UZLrOWYcNhqy4dO2cdznscJ7CWr0DZGZ2g';
const LICENSOR='品牌加辣餐飲顧問工作室';
const PLAN_NAME={basic:'基本版',pro:'進階版'}, BASIC=['home','account','help','io','ing','semi','recipe','cost','price','order','ver','log'];
let sbc=null, me=null, prof=null, G='loading', authMsg='', authMode='in', adm={profiles:[],access:[]}, adminTab=false, notice='', logRows=null, watchOn=false, rtT=null; const revs={}, saving=new Set();
TABS[TABS.length-1][2].push(['log','修改紀錄']);
/* 左側選單：照業主的工作順序分層 */
const NAV=[['data','資料建立',['ing','semi','recipe','combo','io']],['price','成本與定價',['cost','matrix','price','channel']],['ops','營運管理',['order','pricelog','pl','be']],['hq','總部與加盟',['markup','hqitem','supply','frsim']],['sys','系統',['ver','log','account','help','brands','admin']]];
const LAB={brands:'品牌管理',io:'上傳與下載表單',home:'首頁',ing:'食材主檔',semi:'半成品',recipe:'品項配方',combo:'套餐組合',cost:'成本毛利',matrix:'產品四象限',price:'定價漲價試算',channel:'外送通路定價',order:'叫貨推估',pricelog:'價格紀錄',pl:'損益趨勢',be:'損益兩平',markup:'疊價設定',hqitem:'單品獲利',supply:'總供貨試算',frsim:'加盟主損益',ver:'版本與備份',log:'修改紀錄',account:'我的帳號',help:'使用說明',admin:'授權管理'};
/* 每頁一句話：這頁要先做什麼、做完去哪 */
const TIP={ing:['從這裡開始。每樣食材填名稱、進貨價和一包的量，後面的配方才選得到。','recipe'],semi:['有先煮好再用的醬料、高湯才需要填，沒有可以跳過。','recipe'],recipe:['左邊選一道菜，右邊填它用了哪些食材和用量，再填售價和月銷量。','cost'],combo:['先建好單品，才能在這裡把它們綁成套餐。','cost'],
 cost:['紅色代表成本超過目標。想知道該賣多少錢，到定價試算。','price'],matrix:['要先在品項配方填每道菜的月銷量，分類才會準。','price'],price:['上半部看建議售價，下半部試算食材漲價的影響。這頁的試算不會改到你的資料。','order'],channel:['先新增外送平台和抽成比例，就能看外送價該加幾成。','be'],
 order:['要先在品項配方填月銷量，才算得出每樣食材該叫多少。',''],pricelog:['不用手動填。只要在食材主檔改進貨價，這裡就會自動記一筆。',''],pl:['每個月把損益表的數字填進來，就能看成本率的走勢。','be'],be:['先填每月固定費用，就能算出一個月要做多少營收才不賠。',''],
 markup:['先設一個預設疊價，個別食材要不一樣再單獨填。','hqitem'],hqitem:['這頁只看不用填，數字來自疊價設定和配方。','supply'],supply:['先在上方填直營店和加盟店的家數。','frsim'],frsim:['填一家加盟店的營收和費用，看它賺不賺、多久回本。','']};
let pub={}, wantAdmin=false, imp=null, impMode='update', ups=null, upMsg='', navShut={}, acctMsg='', authF={name:'',email:''}, needConfirm=false; try{ navShut=JSON.parse(localStorage.getItem('bom-nav')||'{}')||{} }catch(e){}
function navHtml(){ const it=id=>`<button class="navi" data-tab="${id}" ${tab===id?'aria-current="page"':''}><span>${LAB[id]}</span>${allowed(id)?'':'<span class="tag">進階</span>'}</button>`;
  return it('home')+NAV.map(g=>{ const ids=g[2].filter(id=>(id!=='admin'&&id!=='brands')||isAdmin()), open=!navShut[g[0]]||ids.includes(tab);
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
async function checkRemote(){ if(G!=='app'||!sbc) return;
  { const {data:p}=await sbc.from('bom_profiles').select('*').eq('user_id',me.id).maybeSingle(); if(G!=='app') return;
    if(p&&prof){ const was=prof; prof=p;
      if(p.status!=='active'||(!isAdmin()&&expired())){ G=p.status==='pending'?'pending':'blocked'; return render() }
      if(!isAdmin()&&(was.plan!==p.plan||was.access!==p.access||was.expires_on!==p.expires_on)){ notice='你的使用內容剛剛由顧問更新：'+PLAN_NAME[p.plan]+'、'+(p.access==='edit'?'可編輯':'只能看')+'、使用期限 '+(p.expires_on||'不限期')+'。畫面已套用新的設定。'; if(!allowed(tab)) tab='home'; render() } } } const {data,error}=await sbc.from('bom_brands').select('id,rev,name,updated_by_email'); if(error||!data||G!=='app') return;
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
${isAdmin()&&(ups||[]).some(u=>u.status==='new')?`<p class="sample">有 ${(ups||[]).filter(u=>u.status==='new').length} 個業主上傳的檔案等你處理。 <button data-tab="io">前往查看</button></p>`:''}
${RO()?'<p class="note">你的帳號是「只能看」權限，可以瀏覽數字和使用試算，但不能修改資料。</p>':''}
<div class="steps">${step('①',s1,'建立食材','目前 '+b.ingredients.length+' 樣。填名稱、進貨價、一包的量。','ing',s1?'查看食材':'開始建立食材')}
${step('②',s2,'建立品項配方','目前 '+b.items.length+' 道。每道菜用了哪些食材、各多少。','recipe',s2?'查看配方':'開始建立配方')}
${step('③',s3,'填售價和月銷量','有了銷量才能算整體成本率和該叫多少貨。','recipe',s3?'調整銷量':'去填月銷量')}
${step('④',false,'看成本與毛利','哪道菜賺、哪道菜成本超標，一眼看出來。','cost','看成本毛利')}</div>
${s2?`<div class="tiles"><div class="tile"><span>食材</span><b>${b.ingredients.length}</b></div><div class="tile"><span>品項</span><b>${b.items.length}</b></div><div class="tile"><span>整體食材成本率</span><b>${pct(cost/sales)}</b><span>目標 ${nf(b.settings.targetRate,0)}%</span></div><div class="tile"><span>成本超標的品項</span><b>${over}</b><span>超過目標 3 個百分點以上</span></div></div>`:''}
<p class="note">手上已經有 Excel 或 PDF 資料？不用一筆一筆輸入。 <button data-tab="io">前往上傳與下載表單</button></p>
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

/* ---- 上傳與下載表單 ---- */
const SH={ing:['食材',['食材名稱*','分類','進貨單位','進貨價*','每單位含量*','用量單位*','可用率%','供貨方式'],[16,10,10,10,12,10,9,12]],semi:['半成品',['半成品名稱*','單位','一批做出總量','來源'],[16,8,14,14]],semiL:['半成品材料',['半成品名稱*','材料名稱*','一批用量*'],[16,16,10]],item:['品項',['品名*','分類','售價*','單店月銷量'],[18,10,8,12]],line:['配方',['品名*','用料名稱*','一份用量*'],[18,16,10]]};
function tplXlsx(withData){ const b=B(), wb=XLSX.utils.book_new(), nm={}; if(b){ b.ingredients.forEach(i=>nm['i:'+i.id]=i.name); b.semis.forEach(x=>nm['s:'+x.id]=x.name) }
  const add=(k,rows)=>{ const ws=XLSX.utils.aoa_to_sheet([SH[k][1],...rows]); ws['!cols']=SH[k][2].map(w=>({wch:w+4})); XLSX.utils.book_append_sheet(wb,ws,SH[k][0]) };
  const g=XLSX.utils.aoa_to_sheet([['BOM 運算中心　資料填寫表'],[''],['怎麼填'],['1. 每個分頁是一種資料。請照「食材 → 半成品 → 品項 → 配方」的順序填。'],['2. 第一列是欄位名稱，請不要修改或刪除。有 * 的欄位一定要填。'],['3. 開頭是「（範例）」的那幾列只是示範，系統不會匯入，可以留著或刪掉。'],['4. 「配方」分頁：一道菜用了幾樣料就填幾列，品名要和「品項」分頁完全一樣，用料名稱要和「食材」或「半成品」的名稱完全一樣。'],['5. 沒有半成品（先煮好再用的醬料、高湯）可以不填那兩個分頁。'],['6. 填好後回到系統「上傳與下載表單」頁上傳，系統會先檢查並讓你預覽，確認後才會寫入。'],[''],['欄位說明'],['進貨單位','你跟廠商買的單位，例如：公斤、箱、包'],['進貨價','買一個進貨單位多少錢，只填數字'],['每單位含量','一個進貨單位等於多少「用量單位」。例如進貨單位是公斤、用量單位是克，就填 1000'],['用量單位','配方裡使用的單位，例如：克、毫升、顆'],['可用率%','去皮去骨後剩下的比例，不會損耗就填 100'],['供貨方式','填「總部供貨」或「門市自採」'],['來源（半成品）','填「門市自製」或「總部製作供貨」'],['一批做出總量','煮一鍋做出來的總量，例如一鍋醬 2000 克就填 2000'],['損益表','損益表格式每家不同，請直接在同一頁用「把檔案交給顧問」上傳 PDF 或 Excel']]); g['!cols']=[{wch:22},{wch:90}]; XLSX.utils.book_append_sheet(wb,g,'填寫說明');
  const sup=v=>v==='hq'?'總部供貨':'門市自採', d=withData&&b;
  add('ing',d?b.ingredients.map(i=>[i.name,i.cat,i.packUnit,i.buyPrice,i.packSize,i.unit,i.yield,sup(i.supply)]):[['（範例）牛五花','肉類','公斤',420,1000,'克',100,'門市自採'],['（範例）高麗菜','蔬菜','顆',45,1200,'克',85,'門市自採']]);
  add('semi',d?b.semis.map(x=>[x.name,x.unit,x.batchYield,x.supply==='hq'?'總部製作供貨':'門市自製']):[['（範例）招牌醬','克',2000,'門市自製']]);
  add('semiL',d?b.semis.flatMap(x=>x.lines.map(l=>[x.name,nm[l.ref]||'',l.qty])):[['（範例）招牌醬','（範例）醬油',1500]]);
  add('item',d?b.items.map(x=>[x.name,x.cat,x.price,x.monthlySales||0]):[['（範例）牛五花石鍋','主餐',280,600]]);
  add('line',d?b.items.flatMap(x=>x.lines.map(l=>[x.name,nm[l.ref]||'',l.qty])):[['（範例）牛五花石鍋','（範例）牛五花',120],['（範例）牛五花石鍋','（範例）高麗菜',80]]);
  dl.save({filename:(d?b.name+'_目前資料':'BOM資料填寫表_空白')+'.xlsx',data:XLSX.write(wb,{type:'array',bookType:'xlsx'})}); setStatus('表單已下載') }
async function impRead(file){ const b=B(); if(!b||!file) return; let wb; try{ wb=XLSX.read(await file.arrayBuffer()) }catch(e){ imp={fatal:'這個檔案打不開。請確認是用我們的表單填寫、另存成 .xlsx 的 Excel 檔。'}; return render() }
  const P={file:file.name,ing:[],semi:[],semiL:[],item:[],line:[],errs:[]}, err=(k,n,m)=>P.errs.push({sheet:SH[k][0],row:n,msg:m});
  const N=v=>{ if(v===''||v==null) return null; const x=typeof v==='number'?v:parseFloat(String(v).replace(/[,$\s]/g,'')); return isFinite(x)?x:NaN };
  const rows=k=>{ const ws=wb.Sheets[SH[k][0]]; if(!ws) return []; return XLSX.utils.sheet_to_json(ws,{header:1,defval:''}).slice(1).map((r,i)=>({r:r.map(x=>typeof x==='string'?x.trim():x),n:i+2})).filter(x=>x.r.some(v=>v!=='')&&!String(x.r[0]).startsWith('（範例）')) };
  if(!['ing','semi','item','line'].some(k=>wb.Sheets[SH[k][0]])){ imp={fatal:'找不到「食材」「品項」這些分頁。請使用本頁下載的表單來填寫；如果是其他格式的檔案，請改用下方「把檔案交給顧問」。'}; return render() }
  const dup=(k,set,name,n)=>{ if(set.has(name)){ err(k,n,'「'+name+'」在這個分頁重複出現，只會採用第一筆'); return true } set.add(name); return false };
  let seen=new Set(); rows('ing').forEach(({r,n})=>{ const [name,cat,packUnit,bp,ps,unit,y,sp]=r; if(!name) return err('ing',n,'沒有填食材名稱'); if(dup('ing',seen,name,n)) return;
    const buyPrice=N(bp), packSize=N(ps), yl=N(y); if(buyPrice===null||isNaN(buyPrice)||buyPrice<0) return err('ing',n,'「'+name+'」的進貨價要填數字'); if(isNaN(packSize)||(packSize!==null&&packSize<=0)) return err('ing',n,'「'+name+'」的每單位含量要填大於 0 的數字'); if(isNaN(yl)||(yl!==null&&(yl<=0||yl>100))) return err('ing',n,'「'+name+'」的可用率要填 1 到 100');
    P.ing.push({name:String(name),cat:String(cat||''),packUnit:String(packUnit||''),buyPrice,packSize:packSize||1,unit:String(unit||packUnit||''),yield:yl||100,supply:/總部/.test(sp)?'hq':'self'}) });
  seen=new Set(); rows('semi').forEach(({r,n})=>{ const [name,unit,by,src]=r; if(!name) return err('semi',n,'沒有填半成品名稱'); if(dup('semi',seen,name,n)) return; const y=N(by); if(isNaN(y)||(y!==null&&y<=0)) return err('semi',n,'「'+name+'」的一批做出總量要填大於 0 的數字');
    P.semi.push({name:String(name),unit:String(unit||'份'),batchYield:y||1,supply:/總部/.test(src)?'hq':'self'}) });
  const ingN=new Set([...b.ingredients.map(i=>i.name),...P.ing.map(i=>i.name)]), semiN=new Set([...b.semis.map(i=>i.name),...P.semi.map(i=>i.name)]);
  rows('semiL').forEach(({r,n})=>{ const [sn,mat,q]=r, qty=N(q); if(!sn||!mat) return err('semiL',n,'半成品名稱和材料名稱都要填'); if(!semiN.has(sn)) return err('semiL',n,'找不到半成品「'+sn+'」，請先在「半成品」分頁建立'); if(!ingN.has(mat)) return err('semiL',n,'找不到食材「'+mat+'」，名稱要和「食材」分頁完全一樣'); if(!(qty>0)) return err('semiL',n,'「'+sn+'」的「'+mat+'」用量要填大於 0 的數字'); P.semiL.push({owner:String(sn),ref:String(mat),qty}) });
  seen=new Set(); rows('item').forEach(({r,n})=>{ const [name,cat,pr,ms]=r; if(!name) return err('item',n,'沒有填品名'); if(dup('item',seen,name,n)) return; const price=N(pr), m=N(ms); if(price===null||isNaN(price)||price<0) return err('item',n,'「'+name+'」的售價要填數字'); if(isNaN(m)||(m!==null&&m<0)) return err('item',n,'「'+name+'」的月銷量要填數字');
    P.item.push({name:String(name),cat:String(cat||''),price,monthlySales:m||0}) });
  const itemN=new Set([...b.items.map(i=>i.name),...P.item.map(i=>i.name)]);
  rows('line').forEach(({r,n})=>{ const [inm,mat,q]=r, qty=N(q); if(!inm||!mat) return err('line',n,'品名和用料名稱都要填'); if(!itemN.has(inm)) return err('line',n,'找不到品項「'+inm+'」，請先在「品項」分頁建立'); if(!ingN.has(mat)&&!semiN.has(mat)) return err('line',n,'找不到用料「'+mat+'」，名稱要和「食材」或「半成品」完全一樣'); if(!(qty>0)) return err('line',n,'「'+inm+'」的「'+mat+'」用量要填大於 0 的數字'); P.line.push({owner:String(inm),ref:String(mat),qty}) });
  const cnt=(a,ex)=>{ const E=new Set(ex.map(x=>x.name)); return [a.filter(x=>!E.has(x.name)).length,a.filter(x=>E.has(x.name)).length] };
  P.c={ing:cnt(P.ing,b.ingredients),semi:cnt(P.semi,b.semis),item:cnt(P.item,b.items)}; P.total=P.ing.length+P.semi.length+P.item.length+P.semiL.length+P.line.length; imp=P; render() }
async function impApply(){ const b=B(), P=imp; if(!b||!P||P.fatal||RO()) return; const upd=impMode==='update'; setStatus('匯入中…');
  const v=await verCreate(cur,'Excel 匯入前自動備份（'+P.file+'）'); if(!v){ notice='沒有匯入：匯入前的備份沒有建立成功，為了安全先停止。請檢查網路後再試一次。'; return render() }
  const touched={semi:new Set(),item:new Set()};
  P.ing.forEach(x=>{ const e=b.ingredients.find(i=>i.name===x.name); if(e){ if(!upd) return; if(e.buyPrice!==x.buyPrice){ b.priceLog.push({id:e.id,name:e.name,date:today(),from:e.buyPrice,to:x.buyPrice}); if(b.priceLog.length>300) b.priceLog.shift() } Object.assign(e,x) } else b.ingredients.push(Object.assign({id:uid('i')},x)) });
  P.semi.forEach(x=>{ const e=b.semis.find(i=>i.name===x.name); if(e){ if(upd){ Object.assign(e,x); touched.semi.add(x.name) } } else { b.semis.push(Object.assign({id:uid('s'),packSize:1,packUnit:'',lines:[]},x)); touched.semi.add(x.name) } });
  P.item.forEach(x=>{ const e=b.items.find(i=>i.name===x.name); if(e){ if(upd){ Object.assign(e,x); touched.item.add(x.name) } } else { b.items.push(Object.assign({id:uid('m'),lines:[]},x)); touched.item.add(x.name) } });
  const ref=n=>{ const i=b.ingredients.find(x=>x.name===n); if(i) return 'i:'+i.id; const m=b.semis.find(x=>x.name===n); return m?'s:'+m.id:null };
  const fill=(rows,list,T,onlyIng)=>{ const by={}; rows.forEach(l=>(by[l.owner]=by[l.owner]||[]).push(l)); Object.keys(by).forEach(n=>{ const o=list.find(x=>x.name===n); if(!o||(!upd&&!T.has(n))) return; o.lines=by[n].map(l=>({ref:onlyIng?('i:'+(b.ingredients.find(x=>x.name===l.ref)||{}).id):ref(l.ref),qty:l.qty})).filter(l=>l.ref&&!/undefined$/.test(l.ref)) }) };
  fill(P.semiL,b.semis,touched.semi,true); fill(P.line,b.items,touched.item,false);
  brands[cur]=norm(b); touch(); notice='匯入完成：食材 '+P.ing.length+' 筆、半成品 '+P.semi.length+' 筆、品項 '+P.item.length+' 筆、配方 '+P.line.length+' 列。匯入前的資料已自動備份，想反悔可以到「版本與備份」還原。'; imp=null; tab='cost'; render() }
async function loadUps(){ const r=await sbc.from('bom_uploads').select('*').order('created_at',{ascending:false}).limit(100); ups=r.error?[]:(r.data||[]) }
async function sendFile(){ const f=($('#upFile').files||[])[0], note=$('#upNote').value.trim(); if(!f){ upMsg='請先按「選擇檔案」挑一個檔案。'; return render() }
  const ext=(f.name.split('.').pop()||'').toLowerCase(); if(!['pdf','xlsx','xls','csv','jpg','jpeg','png','doc','docx'].includes(ext)){ upMsg='這種檔案類型不能上傳。可以上傳 PDF、Excel、Word、CSV 或照片（JPG、PNG）。'; return render() }
  if(f.size>10*1024*1024){ upMsg='檔案超過 10MB，太大了。可以拆成幾個檔案分次上傳，或把照片縮小。'; return render() }
  upMsg='上傳中，請不要關閉頁面…'; render(); const path=cur+'/'+(crypto.randomUUID?crypto.randomUUID():uid('f')+Date.now())+'.'+ext;
  const up=await sbc.storage.from('bom-uploads').upload(path,f,{contentType:f.type||'application/octet-stream'}); if(up.error){ upMsg='上傳沒有成功（'+(up.error.message||'').slice(0,70)+'）。請檢查網路後再試一次。'; return render() }
  const ins=await sbc.from('bom_uploads').insert({brand_id:cur,filename:f.name,path,size:f.size,note:note||null}); if(ins.error){ upMsg='檔案已上傳，但登記時出了問題（'+(ins.error.message||'').slice(0,70)+'）。請再試一次或聯絡顧問。'; return render() }
  upMsg='「'+f.name+'」已經送出'+(isAdmin()?'。':'，顧問會收到通知。處理好之後，這裡的狀態會變成「已處理」。'); await loadUps(); render() }
async function getFile(id){ const u=(ups||[]).find(x=>x.id===id); if(!u) return; setStatus('準備下載…'); const {data,error}=await sbc.storage.from('bom-uploads').createSignedUrl(u.path,120,{download:u.filename}); if(error||!data){ setStatus('下載失敗，請重新整理後再試'); return }
  const a=document.createElement('a'); a.href=data.signedUrl; a.download=u.filename; document.body.appendChild(a); a.click(); a.remove(); setStatus('已開始下載') }
async function doneFile(id){ const i=document.getElementById('rp-'+id); const {error}=await sbc.from('bom_uploads').update({status:'done',reply:i&&i.value.trim()||null}).eq('id',id); setStatus(error?'更新失敗':'已標記為處理完成'); await loadUps(); render() }
V.io=(b,c)=>{ const kb=n=>n>1048576?nf(n/1048576,1)+' MB':nf(n/1024,0)+' KB', mine=(ups||[]).filter(u=>isAdmin()||u.brand_id===cur);
  const prev=!imp?'':imp.fatal?`<p class="sample">${esc(imp.fatal)} <button data-io="cancel">知道了</button></p>`:`<div class="col" style="border:1px solid var(--accent);border-radius:8px;padding:12px">
<h2>檢查結果：${esc(imp.file)}</h2><p class="sub">還沒有寫入。請先看下面的數字對不對，確認後再按「確認匯入」。</p>
<div class="tiles"><div class="tile"><span>食材</span><b>${imp.ing.length}</b><span>新增 ${imp.c.ing[0]}、同名 ${imp.c.ing[1]}</span></div><div class="tile"><span>半成品</span><b>${imp.semi.length}</b><span>新增 ${imp.c.semi[0]}、同名 ${imp.c.semi[1]}</span></div><div class="tile"><span>品項</span><b>${imp.item.length}</b><span>新增 ${imp.c.item[0]}、同名 ${imp.c.item[1]}</span></div><div class="tile"><span>配方用料</span><b>${imp.line.length}</b><span>列</span></div><div class="tile"><span>有問題的列</span><b>${imp.errs.length}</b><span>${imp.errs.length?'這些列不會匯入':'全部通過檢查'}</span></div></div>
${imp.errs.length?`<div class="scroll"><table><thead><tr><th>分頁</th><th class="n">第幾列</th><th>問題</th></tr></thead><tbody>${imp.errs.slice(0,60).map(e=>`<tr><td>${e.sheet}</td><td class="n">${e.row}</td><td style="white-space:normal">${esc(e.msg)}</td></tr>`).join('')}</tbody></table></div><p class="note">可以先匯入沒問題的部分，或按「取消」回 Excel 修正後重新上傳。${imp.errs.length>60?'（只顯示前 60 筆）':''}</p>`:''}
<div class="params"><label for="impMode">遇到同名的資料 <select id="impMode"><option value="update" ${impMode==='update'?'selected':''}>用檔案的內容更新（配方會整份換成檔案裡的）</option><option value="skip" ${impMode==='skip'?'selected':''}>略過，保留系統裡原本的</option></select></label></div>
<div class="brandbar">${imp.total?'<button class="pri" data-io="apply">確認匯入</button>':''}<button data-io="cancel">取消</button></div><p class="note">匯入前系統會自動備份一份目前的資料，匯錯可以到「版本與備份」還原。</p></div>`;
  return `<div class="head"><div><h2>上傳與下載表單</h2><p class="sub">不想一筆一筆輸入？下載空白表單，在 Excel 填好後一次上傳。手上只有 PDF 或其他格式的資料，可以直接交給顧問處理。</p></div></div>
<h2>① 下載表單</h2><div class="brandbar"><button class="pri" data-io="tpl">下載空白表單</button>${b.ingredients.length||b.items.length?'<button data-io="tpld">下載含目前資料的表單</button>':''}</div><p class="note">表單裡有「填寫說明」分頁和範例。想大量改價時，可以下載含目前資料的表單，改完再上傳。</p>
<h2>② 上傳填好的表單</h2>${RO()?'<p class="note">你的帳號是「只能看」權限，不能匯入資料。需要修改請聯絡顧問，或用下方把檔案交給顧問。</p>':prev||'<div class="params"><label for="impFile">選擇填好的 Excel 檔（.xlsx） <input type="file" id="impFile" accept=".xlsx,.xls"></label></div><p class="note">上傳後會先檢查並顯示預覽，不會馬上寫入。</p>'}
<h2>③ 把檔案交給顧問</h2><p class="sub">損益表、廠商報價單、手寫配方的照片等等，不用自己整理，上傳後顧問會收到通知並協助轉成系統資料。</p>
<div class="params"><label for="upFile">檔案 <input type="file" id="upFile" accept=".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.doc,.docx"></label><label for="upNote">留言 <input type="text" id="upNote" maxlength="300" placeholder="例如：九月損益表" style="min-width:220px"></label><button class="pri" data-io="send">送出檔案</button></div>
${upMsg?`<p class="sample" role="status">${esc(upMsg)}</p>`:''}<p class="note">可以上傳 PDF、Excel、Word、CSV、照片，每個檔案 10MB 以內。檔案只有你和顧問看得到。</p>
<div class="scroll"><table><thead><tr><th>上傳時間</th>${isAdmin()?'<th>品牌</th><th>上傳者</th>':''}<th>檔名</th><th class="n">大小</th><th>留言</th><th>狀態</th><th></th></tr></thead><tbody>${ups===null?'<tr><td colspan="8">讀取中…</td></tr>':mine.map(u=>`<tr><td>${tm(u.created_at)}</td>${isAdmin()?`<td>${esc(u.brand_name||u.brand_id)}</td><td>${esc(u.email||'')}</td>`:''}<td style="white-space:normal">${esc(u.filename)}</td><td class="n">${kb(u.size||0)}</td><td style="white-space:normal">${esc(u.note||'')}</td><td style="white-space:normal">${u.status==='done'?'<span class="pill good">已處理</span>'+(u.reply?' '+esc(u.reply):''):'<span class="pill warn">待處理</span>'}</td><td><button data-io="get:${u.id}">下載</button>${isAdmin()&&u.status!=='done'?` <input type="text" id="rp-${u.id}" placeholder="回覆給業主（可不填）" aria-label="回覆" style="min-width:150px"> <button data-io="done:${u.id}">標記已處理</button>`:''}</td></tr>`).join('')||'<tr><td colspan="8">還沒有上傳過檔案。</td></tr>'}</tbody></table></div>` };
document.addEventListener('change',e=>{ if(e.target.id==='impFile'&&!RO()) impRead(e.target.files[0]); if(e.target.id==='impMode') impMode=e.target.value });
document.addEventListener('click',e=>{ const t=e.target.closest('button'); if(!t) return; if(t.dataset.tab==='io'){ upMsg=''; loadUps().then(()=>{ if(tab==='io') render() }) } const a=t.dataset.io; if(!a) return;
  if(a==='tpl') tplXlsx(false); else if(a==='tpld') tplXlsx(true); else if(a==='cancel'){ imp=null; render() } else if(a==='apply') impApply(); else if(a==='send') sendFile(); else if(a.startsWith('get:')) getFile(a.slice(4)); else if(a.startsWith('done:')&&isAdmin()) doneFile(a.slice(5)) });

/* ---- 品牌管理（僅管理員） ---- */
function touchId(id){ dirty.add(id); setStatus('儲存中…'); clearTimeout(timer); timer=setTimeout(flush,900) }
function makeBrand(name,from){ const id=uid('b'), src=from&&brands[from]; brands[id]=src?norm(Object.assign(JSON.parse(JSON.stringify(src)),{name,sample:false})):norm(blank(name)); return id }
V.brands=()=>{ const ids=Object.keys(brands), owners=id=>adm.access.filter(a=>a.brand_id===id).map(a=>(adm.profiles.find(p=>p.user_id===a.user_id)||{})).filter(p=>p.email);
  return `<div class="head"><div><h2>品牌管理</h2><p class="sub">每個品牌是一套獨立的食材、配方和損益資料。先在這裡建立品牌，再到「授權管理」指派給業主。品牌名稱可以隨時直接修改。</p></div></div>
<h2>新增品牌</h2><form id="nbForm" class="params"><label for="nbName">品牌名稱 <input type="text" id="nbName" required maxlength="60" placeholder="例如：嗑肉石鍋" style="min-width:200px"></label><label for="nbFrom">起始內容 <select id="nbFrom"><option value="">空白（從頭建立）</option>${ids.map(id=>`<option value="${id}">複製「${esc(brands[id].name)}」的資料</option>`).join('')}</select></label><button class="pri" type="submit">建立品牌</button></form>
<h2>所有品牌</h2><div class="scroll"><table><thead><tr><th>品牌名稱（可直接修改）</th><th class="n">食材</th><th class="n">品項</th><th class="n">損益期數</th><th>可使用的業主</th><th></th></tr></thead><tbody>${ids.map(id=>{ const b=brands[id], os=owners(id), k='bd:'+id; return `<tr><td><input type="text" data-bname="${id}" value="${esc(b.name)}" maxlength="60" aria-label="品牌名稱"></td><td class="n">${b.ingredients.length}</td><td class="n">${b.items.length}</td><td class="n">${(b.periods||[]).length}</td><td style="white-space:normal">${os.map(p=>esc(p.display_name||p.email)+(p.status==='active'?'':'（'+({pending:'待開通',suspended:'停權'}[p.status]||'')+'）')).join('、')||'<span class="pill warn">尚未指派</span>'}</td><td><button data-bopen="${id}">開啟</button> <button data-bexp="${id}">匯出 Excel</button> <button class="del ${armed===k?'armed':''}" data-bdel="${id}">${armed===k?'確定刪除':'刪除'}</button></td></tr>` }).join('')||'<tr><td colspan="6">還沒有品牌。請用上方表單建立第一個。</td></tr>'}</tbody></table></div>
<p class="note">刪除品牌前系統會自動保留一份備份。刪除後，原本被指派的業主就看不到這個品牌。業主解約需要交接資料時，按「匯出 Excel」會下載這個品牌所有頁面的完整資料。</p>` };

/* ---- 授權管理（僅管理員） ---- */
async function loadAdmin(){ const [p,a]=await Promise.all([sbc.from('bom_profiles').select('*').order('created_at',{ascending:false}),sbc.from('bom_brand_access').select('*')]); adm={profiles:p.data||[],access:a.data||[]} }
V.admin=(b,c)=>{ const ORD={pending:0,active:1,suspended:2,rejected:3}, ps=adm.profiles.filter(p=>p.role!=='admin').sort((a,z)=>(ORD[a.status]||0)-(ORD[z.status]||0)), t=today(), soon=new Date(Date.now()+38*86400e3).toISOString().slice(0,10);
  const opt=(uid,f,v,os)=>`<select data-adm="${uid}|${f}" aria-label="${f}">${os.map(o=>`<option value="${o[0]}" ${o[0]===v?'selected':''}>${o[1]}</option>`).join('')}</select>`;
  return `<div class="head"><div><h2>授權管理</h2><p class="sub">業主在登入頁註冊並完成 Email 驗證後會出現在這裡。請由左到右設定，最後才改狀態。</p><ol class="sub" style="padding-left:20px;margin:0"><li>選<b>方案</b>、<b>權限</b>、<b>到期日</b></li><li>勾選<b>可使用的品牌</b>；還沒有品牌就按「建立品牌並指派」</li><li>確認收款後把<b>狀態</b>改成「使用中」，系統會自動寄開通信</li><li>之後調整方案、權限或到期日會立刻生效；要通知業主請按「寄異動通知」</li><li>解約或欠費時把狀態改成「停權」，業主無法登入但資料保留，系統會寄信告知。需要交接資料，到「品牌管理」按「匯出 Excel」</li><li>不打算開通的申請改成「不開通」：不會寄信，也不會再算進待開通</li></ol></div><button data-act="admreload">重新整理名單</button></div>
<div class="tiles"><div class="tile"><span>業主帳號</span><b>${ps.length}</b></div><div class="tile"><span>待開通</span><b>${ps.filter(p=>p.status==='pending').length}</b></div><div class="tile"><span>30 天內到期</span><b>${ps.filter(p=>p.status==='active'&&p.expires_on&&p.expires_on>=t&&p.expires_on<=soon).length}</b></div><div class="tile"><span>已到期或停權</span><b>${ps.filter(p=>p.status==='suspended'||(p.expires_on&&p.expires_on<t)).length}</b></div></div>
<div class="scroll"><table><thead><tr><th>業主</th><th>狀態</th><th>方案</th><th>權限</th><th>到期日（留空為不限期）</th><th>可使用的品牌</th><th>備註（付款紀錄等）</th><th></th></tr></thead><tbody>${ps.map(p=>{const ex=p.expires_on&&p.expires_on<t;return `<tr><td style="white-space:normal"><b>${esc(p.display_name||'（未填名稱）')}</b><br><span class="note">${esc(p.email)}</span></td>
<td>${opt(p.user_id,'status',p.status,[['pending','待開通'],['active','使用中'],['suspended','停權'],['rejected','不開通']])} ${ex?'<span class="pill bad">已到期</span>':''}</td>
<td>${opt(p.user_id,'plan',p.plan,[['basic','基本版'],['pro','進階版']])}</td><td>${opt(p.user_id,'access',p.access,[['edit','可編輯'],['view','只能看']])}</td>
<td><input type="date" data-adm="${p.user_id}|expires_on" value="${p.expires_on||''}" aria-label="到期日"></td>
<td style="white-space:normal">${Object.keys(brands).map(id=>`<label style="display:inline-flex;gap:4px;margin-right:10px"><input type="checkbox" data-admb="${p.user_id}|${id}" ${adm.access.some(a=>a.user_id===p.user_id&&a.brand_id===id)?'checked':''}>${esc(brands[id].name)}</label>`).join('')}${adm.access.some(a=>a.user_id===p.user_id)?'':` <span class="pill warn">尚未指派品牌</span> <button data-mkbrand="${p.user_id}">建立品牌並指派</button>`}</td>
<td><input type="text" data-adm="${p.user_id}|note" value="${esc(p.note||'')}" placeholder="例如：10/10 已匯款年費" aria-label="備註" style="min-width:180px"></td><td>${p.status==='active'?`<button data-mail="${p.user_id}">重寄開通信</button> <button data-chg="${p.user_id}">寄異動通知</button>`:''}</td></tr>`}).join('')||'<tr><td colspan="8">還沒有業主註冊。把網站網址傳給業主，請他按「註冊新帳號」。</td></tr>'}</tbody></table></div>
<h2>登入頁顯示的內容</h2><p class="sub">這裡填的內容會顯示在登入頁的「方案與費用說明」，還沒登入的人也看得到。留空的費用會顯示「請洽詢」。</p><div class="params">${[['line_url','LINE 官方帳號連結','https://lin.ee/…'],['basic_price','基本版費用','例如：每月 NT$1,500'],['pro_price','進階版費用','例如：每月 NT$3,000'],['intro','補充說明','例如：年繳享 85 折']].map(f=>`<label for="pub-${f[0]}">${f[1]} <input type="text" id="pub-${f[0]}" data-pub="${f[0]}" value="${esc(pub&&pub[f[0]]||'')}" placeholder="${f[2]}" maxlength="200" style="min-width:220px"></label>`).join('')}</div>
<h2>方案差異</h2><div class="scroll"><table><thead><tr><th>方案</th><th>可用功能</th></tr></thead><tbody><tr><td>基本版</td><td style="white-space:normal">食材主檔、半成品、品項配方、成本毛利、定價漲價試算、叫貨推估、版本存檔</td></tr><tr><td>進階版</td><td style="white-space:normal">基本版全部，加上套餐組合、價格紀錄、產品四象限、外送通路定價、損益趨勢、損益兩平、總部試算四頁</td></tr></tbody></table></div>
<p class="note">「只能看」的業主可以瀏覽所有數字與使用試算，但無法修改資料。到期日當天仍可使用，隔天起自動失效。品牌由你用上方「新增品牌」建立，業主不能自行新增或刪除品牌。</p>` };

/* 開通信由資料庫在狀態改成「使用中」時自動寄出；這裡只負責重寄與回報結果 */
async function sendApproval(uidv){ const {data,error}=await sbc.rpc('bom_send_approval',{target:uidv});
  return error?'通知信未寄出，請稍後再試':data==='sent'?'已寄出開通通知信':data==='nokey'?'通知信未寄出：寄信服務尚未設定完成':'找不到這個帳號' }
async function approvalSent(email){ const since=new Date(Date.now()-60000).toISOString(); const {data}=await sbc.from('bom_mail_log').select('id').eq('recipient',email).eq('kind','approval').gte('at',since).limit(1); return !!(data&&data.length) }

/* ---- 登入與狀態畫面 ---- */
const lineBtn=t=>pub&&/^https:\/\//.test(pub.line_url||'')?`<a class="btnlink" href="${esc(pub.line_url)}" target="_blank" rel="noopener">${t||'用 LINE 聯絡我們'}</a>`:'';
const PLANS=()=>`<div class="scroll"><table><thead><tr><th>方案</th><th>可以做什麼</th><th>費用</th></tr></thead><tbody><tr><td><b>基本版</b></td><td style="white-space:normal">食材主檔、半成品、品項配方、成本毛利、定價與漲價試算、叫貨推估、Excel 匯入匯出、版本備份</td><td style="white-space:normal">${esc(pub&&pub.basic_price||'請洽詢')}</td></tr><tr><td><b>進階版</b></td><td style="white-space:normal">基本版全部，加上套餐組合、產品四象限、外送通路定價、損益趨勢、損益兩平、總部疊價與加盟主損益試算</td><td style="white-space:normal">${esc(pub&&pub.pro_price||'請洽詢')}</td></tr></tbody></table></div>${pub&&pub.intro?`<p class="sub">${esc(pub.intro)}</p>`:''}<p class="note">流程：註冊帳號 → 完成 Email 驗證 → 聯絡我們確認方案與付款 → 開通後收到通知信即可使用。</p>`;
function gate(){ const box=h=>`<div class="col" style="max-width:420px;margin:24px auto;width:100%"><div><h1>BOM 運算中心</h1><p class="sub">餐飲品牌的食材、配方、成本與獲利試算工具</p></div>${h}</div>`, msg=authMsg?`<p class="sample" role="status">${esc(authMsg)}</p>`:'';
  const faq=`<details><summary>登不進去？常見狀況與解法</summary><div class="col" style="margin-top:8px">${LOGIN_FAQ()}</div></details>`;
  const notAdm=wantAdmin&&me?`<p class="sample"><b>這個瀏覽器目前登入的是業主帳號 ${esc(me.email)}，不是管理員。</b><br>要開通業主，請先按下面的「登出」，再用管理員帳號登入，就會直接進到授權管理。</p>`:'';
  const stepl=(a)=>`<ol class="sub" style="padding-left:20px">${a.map((x,i)=>`<li>${x}</li>`).join('')}</ol>`;
  if(G==='loading') return EMPTY('讀取中…');
  if(G==='error') return box(`<h2>連線發生問題</h2><p class="sub">${esc(authMsg||'請重新整理頁面。')}</p><div><button class="pri" data-auth="hard">重新整理</button>${me?' <button data-auth="out">登出</button>':''}</div>`);
  if(G==='pending') return box(`${notAdm}<h2>帳號等待開通</h2><p class="sub">你的帳號（${esc(me&&me.email||'')}）已經建立，目前在等待審核。</p>${stepl(['註冊完成 ✓','Email 驗證完成 ✓','<b>等待 '+LICENSOR+' 確認付款並開通（目前在這一步）</b>','收到開通通知信後，回到這裡登入就能使用'])}<p class="note">已經收到開通信但還是看到這頁？按「重新檢查」。</p><div class="brandbar"><button class="pri" data-auth="reload">重新檢查</button>${lineBtn('用 LINE 聯絡開通')}<button data-auth="out">登出</button></div><details><summary>方案與費用說明</summary><div class="col" style="margin-top:8px">${PLANS()}</div></details>`);
  if(G==='blocked'&&prof&&prof.status==='rejected') return box(`<h2>帳號尚未開通</h2><p class="sub">這個帳號（${esc(me&&me.email||'')}）目前沒有開通使用。如果想了解方案，或認為這是誤會，歡迎和 ${LICENSOR} 聯絡。</p><div class="brandbar">${lineBtn()}<button data-auth="reload">重新檢查</button><button data-auth="out">登出</button></div>`);
  if(G==='blocked'){ const sus=prof&&prof.status==='suspended'; return box(`<h2>${sus?'授權已停用':'授權已到期'}</h2><p class="sub">${sus?'這個帳號的使用授權目前已停用。':'這個帳號的使用授權已於 '+esc(prof&&prof.expires_on||'')+' 到期。'}</p>${stepl(['你的資料都完整保存著，沒有被刪除','聯絡 '+LICENSOR+' 辦理'+(sus?'恢復':'續約'),'處理完成後回到這裡按「重新檢查」，就能繼續使用'])}<div class="brandbar"><button class="pri" data-auth="reload">重新檢查</button>${lineBtn(sus?'':'用 LINE 聯絡續約')}<button data-auth="out">登出</button></div>`) }
  if(G==='recover') return box(`<h2>設定新密碼</h2><p class="sub">請輸入一組新的密碼，儲存後會直接登入。</p><form id="authForm" class="col">${pwField('auPass','新密碼','new-password',true)}<button class="pri" type="submit">儲存新密碼</button></form>${msg}`);
  const up=authMode==='up', fg=authMode==='forgot';
  return box(`<h2>${fg?'重設密碼':up?'註冊新帳號':'登入'}</h2><p class="sub">${fg?'輸入註冊時的 Email，我們會寄一封重設密碼的信給你。':up?'本系統為付費授權服務。註冊後需經 '+LICENSOR+' 審核開通才能使用，開通時會以 Email 通知。':'請輸入註冊時的 Email 和密碼。'}</p>
<form id="authForm" class="col">${up?`<label for="auName">店名或公司名稱</label><input type="text" id="auName" required maxlength="60" autocomplete="organization" value="${esc(authF.name)}">`:''}
<label for="auEmail">Email</label><input type="email" id="auEmail" required autocomplete="username" value="${esc(authF.email)}">
${fg?'':pwField('auPass','密碼',up?'new-password':'current-password',up)}
<button class="pri" type="submit">${fg?'寄出重設信':up?'註冊':'登入'}</button></form>${msg}
${needConfirm?'<div><button data-auth="resend">重寄驗證信</button></div>':''}
<div class="brandbar">${up||fg?'<button data-auth="in">已有帳號，回登入</button>':'<button data-auth="up">註冊新帳號</button><button data-auth="forgot">忘記密碼</button>'}${needConfirm?'':'<button data-auth="resend">重寄驗證信</button>'}</div>
<details ${up?'open':''}><summary>方案與費用說明</summary><div class="col" style="margin-top:8px">${PLANS()}<div>${lineBtn('用 LINE 詢問方案')}</div></div></details>
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
    if(prof.status==='suspended'||prof.status==='rejected'||(!isAdmin()&&expired())){ G='blocked'; return render() }
    const bs=await sbc.from('bom_brands').select('id,name,data,rev').order('name');
    if(bs.error) throw bs.error;
    brands={}; Object.keys(revs).forEach(k=>delete revs[k]); (bs.data||[]).forEach(applyRemote);
    await loadVersions();
    if(isAdmin()){ if(!adminTab){ TABS[TABS.length-1][2].push(['admin','授權管理']); adminTab=true } await loadAdmin() }
    cur=null; pick(); if(wantAdmin&&!isAdmin()) notice='你開的是管理員專用的連結，但目前登入的是業主帳號 '+me.email+'。要進授權管理，請先登出，再用管理員帳號登入。'; if(isAdmin()) wantAdmin=false; if(!V[tab]||!allowed(tab)||((tab==='admin'||tab==='brands')&&!isAdmin())) tab='home'; G='app'; setStatus('已連線'); startWatch(); render(); loadLog().then(()=>{ if(tab==='home') render() }); loadUps().then(()=>{ if(tab==='home'||tab==='io') render() }) }
  catch(e){ G='error'; authMsg='讀取資料時發生問題，請重新整理頁面。'; render() } }

function render(){ const app=G==='app', ub=$('#userbar'), sh=$('#shell'); sh.classList.toggle('bare',!app); if(!app) sh.classList.remove('open');
  ub.innerHTML=me&&app?`<span>${esc(me.email)}</span><span class="status">${isAdmin()?'管理員':PLAN_NAME[prof.plan]+' · '+(RO()?'只能看':'可編輯')+(prof.expires_on?' · 到期 '+prof.expires_on:'')}</span><div class="brandbar"><button data-tab="account">我的帳號</button><button data-auth="out">登出</button></div>`:'';
  if(!app){ $('#nav').innerHTML=''; $('#banner').innerHTML=''; $('#main').innerHTML=gate(); return }
  if(!V[tab]) tab='home';
  renderApp();
  $('#nav').innerHTML=navHtml(); const g=NAV.find(x=>x[2].includes(tab)); $('#crumb').textContent=(g?g[1]+' › ':'')+LAB[tab]; document.title=LAB[tab]+'｜BOM 運算中心';
  if(tab!=='home'){ const p=$('#banner .params'); if(p) p.remove() }
  if(notice) $('#banner').insertAdjacentHTML('afterbegin','<div class="sample" role="status" style="margin-bottom:10px">'+esc(notice)+' <button data-notice="1">知道了</button></div>');
  $('#btnNew').hidden=!isAdmin(); $('#btnCopy').hidden=true;
  if(tab==='account'||tab==='help'||((tab==='brands'||tab==='admin')&&isAdmin())){ $('#main').innerHTML=V[tab](); return }
  if(!B()&&!isAdmin()){ $('#main').innerHTML=EMPTY('你的帳號還沒有被指派品牌。請聯絡 '+LICENSOR+'。'); return }
  if(!B()) return;
  if(!isAdmin()) document.querySelectorAll('#banner [data-del],#banner [data-unsample]').forEach(el=>el.hidden=true);
  if(!allowed(tab)){ $('#main').innerHTML=`<div class="empty"><h2>「${LAB[tab]}」是進階版功能</h2><p class="sub">你目前的方案是${PLAN_NAME[prof.plan]}。想使用這項分析，請聯絡 ${LICENSOR} 升級為進階版。升級後原本的資料會直接沿用。</p><button data-tab="home">回首頁</button></div>`; return }
  if(TIP[tab]){ const n=TIP[tab][1]; $('#main').insertAdjacentHTML('afterbegin',`<div class="tip"><span><b>提示</b>　${TIP[tab][0]}</span>${n&&allowed(n)?`<button data-tab="${n}">下一步：${LAB[n]} →</button>`:''}</div>`) }
  if(RO()){ document.querySelectorAll('#main [data-p],#banner [data-p]').forEach(el=>{ if(!el.dataset.ui&&!el.dataset.mx&&!el.dataset.sim) el.disabled=true });
    document.querySelectorAll('#main [data-add],#main [data-del],#main [data-act],#main [data-arm],#main #verNote').forEach(el=>el.hidden=true) } }

document.addEventListener('submit',e=>{ if(e.target.id==='nbForm'&&isAdmin()){ e.preventDefault(); const n=$('#nbName').value.trim(); if(!n) return; const id=makeBrand(n,$('#nbFrom').value); cur=id; selItem=selSemi=null; touchId(id); tab='home'; notice='已建立品牌「'+n+'」。下一步：到「授權管理」把它指派給業主，或直接開始建立食材。'; window.scrollTo(0,0); render(); return }
  if(e.target.id==='authForm'){ e.preventDefault(); authSubmit() } if(e.target.id==='pwForm'){ e.preventDefault(); pwSubmit() } });
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
  if(t.dataset.chg&&isAdmin()){ setStatus('寄送中…'); sbc.rpc('bom_send_change',{target:t.dataset.chg}).then(({data,error})=>setStatus(error?'通知信未寄出，請稍後再試':data==='sent'?'已寄出異動通知信':'通知信未寄出')) }
  if(t.dataset.mkbrand&&isAdmin()){ const p=adm.profiles.find(x=>x.user_id===t.dataset.mkbrand); if(!p) return; const id=makeBrand((p.display_name||p.email.split('@')[0]).slice(0,60)); setStatus('建立中…');
    saveBrand(id).then(()=>sbc.from('bom_brand_access').insert({user_id:p.user_id,brand_id:id})).then(r=>{ setStatus(r&&r.error?'品牌已建立，但指派失敗，請手動勾選':'已建立品牌並指派'); notice='已建立品牌「'+brands[id].name+'」並指派給 '+(p.display_name||p.email)+'。品牌名稱可以到「品牌管理」修改。'; return loadAdmin() }).then(render).catch(()=>{ setStatus('建立失敗，請重新整理後再試') }); return }
  if(t.dataset.bexp&&brands[t.dataset.bexp]&&isAdmin()){ cur=t.dataset.bexp; selItem=selSemi=null; exportXlsx(); return }
  if(t.dataset.bopen&&brands[t.dataset.bopen]){ cur=t.dataset.bopen; selItem=selSemi=null; tab='home'; window.scrollTo(0,0); render(); return }
  if(t.dataset.bdel&&isAdmin()){ const id=t.dataset.bdel, k='bd:'+id; if(armed!==k){ armed=k; render(); return } armed=null; delete brands[id]; dirty.delete(id); if(cur===id){ cur=null; pick() } siteDeleteBrand(id); loadAdmin().then(render); render(); return }
  if(t.dataset.mail&&isAdmin()){ setStatus('寄送中…'); sendApproval(t.dataset.mail).then(setStatus) } });
document.addEventListener('change',async e=>{ const el=e.target; if(!isAdmin()) return;
  if(el.dataset.pub){ const f=el.dataset.pub, v=el.value.trim(); if(f==='line_url'&&v&&!/^https:\/\//.test(v)){ setStatus('LINE 連結要以 https:// 開頭'); return } const {error}=await sbc.from('bom_public_settings').update({[f]:v||null,updated_at:new Date().toISOString()}).eq('id',1); if(!error) pub[f]=v||null; setStatus(error?'更新失敗':'登入頁內容已更新'); return }
  if(el.dataset.bname){ const id=el.dataset.bname, n=el.value.trim(); if(!brands[id]) return; if(!n){ el.value=brands[id].name; return } brands[id].name=n; touchId(id); render(); return }
  if(el.dataset.adm){ const [uidv,f]=el.dataset.adm.split('|'), was=adm.profiles.find(p=>p.user_id===uidv)||{}; const {error}=await sbc.from('bom_profiles').update({[f]:el.value===''?null:el.value}).eq('user_id',uidv); let m=error?'更新失敗':'授權已更新';
    if(!error&&f==='status'&&el.value==='rejected') m='已設為不開通，不會寄信給對方。之後想開通，改成「使用中」即可。';
    if(!error&&f==='status'&&el.value==='suspended'&&was.status==='active') m='已停權，系統已寄信告知 '+was.email+'。資料仍完整保留，改回「使用中」即可恢復。';
    if(!error&&f==='status'&&el.value==='active'&&!adm.access.some(a=>a.user_id===uidv)) notice='注意：'+(was.display_name||was.email)+' 已開通，但還沒有指派任何品牌，他登入後會看不到資料。請在「可使用的品牌」勾選，或按「建立品牌並指派」。';
    if(!error&&f==='status'&&el.value==='active'&&was.status!=='active'&&was.email) m=(await approvalSent(was.email))?'已開通，並已自動寄出開通通知信給 '+was.email:'已開通。通知信未寄出：寄信服務尚未設定完成，設定後可按「重寄開通信」';
    setStatus(m); await loadAdmin(); render() }
  else if(el.dataset.admb){ const [uidv,bid]=el.dataset.admb.split('|'); const r=el.checked?await sbc.from('bom_brand_access').insert({user_id:uidv,brand_id:bid}):await sbc.from('bom_brand_access').delete().eq('user_id',uidv).eq('brand_id',bid); setStatus(r.error?'更新失敗':'品牌權限已更新'); await loadAdmin(); render() } });

async function siteBoot(){ const h=location.hash.slice(1); tab=LAB[h]?h:'home'; wantAdmin=h==='admin';
  if(/error_code=|error=access_denied/.test(h)){ authMsg='這個連結已經過期或已經用過。請在下面重新操作一次（忘記密碼或重寄驗證信），再點最新那封信裡的連結。'; try{history.replaceState(null,'',location.pathname)}catch(x){} }
  if(!window.supabase){ G='error'; authMsg='無法載入登入元件，請檢查網路後重新整理。'; return render() }
  sbc=window.supabase.createClient(SUPA_URL,SUPA_KEY);
  sbc.from('bom_public_settings').select('*').eq('id',1).maybeSingle().then(r=>{ pub=(r&&r.data&&!Array.isArray(r.data))?r.data:{}; const e=document.getElementById('auEmail'), p=document.getElementById('auPass'); if(G!=='app'&&G!=='loading'&&!(e&&e.value)&&!(p&&p.value)) render() });
  dl={save:async({filename,data})=>{ const u=URL.createObjectURL(new Blob([data])), a=document.createElement('a'); a.href=u; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u),5000) }};
  sbc.auth.onAuthStateChange((ev,s)=>{ setTimeout(()=>{
    if(ev==='PASSWORD_RECOVERY'){ me=s&&s.user; G='recover'; authMsg=''; render(); return }
    if(ev==='SIGNED_OUT'){ if(wantAdmin) tab='admin'; me=null; prof=null; brands={}; versions=[]; notice=''; logRows=null; ups=null; imp=null; upMsg=''; cur=null; G='login'; authMode='in'; render(); return }
    if(ev==='SIGNED_IN'&&s&&G!=='recover'&&(!me||me.id!==s.user.id)){ me=s.user; G='loading'; render(); loadAll() } },0) });
  const {data}=await sbc.auth.getSession();
  if(data&&data.session){ if(!me){ me=data.session.user; G='loading'; render(); loadAll() } } else if(G==='loading'){ G='login'; render() } }
siteBoot();
