/* 顧問工具共用元件（品牌加辣餐飲顧問工作室）
   - Kit.toast(文字, 'ok'|'bad'|'info')：右下角跳出訊息
   - 各頁原本的 say() 訊息（#flash）自動改成跳出訊息
   - 按鈕按下的波紋、懸浮、讀取中轉圈；上方讀取進度條；換頁淡入
   - 客戶切換列：同一位客戶在「營運輔導、組織診斷、加盟體系、SOP、BOM」之間一鍵切換，新增時自動帶入客戶
   用法：在頁面自己的 <script> 之後載入本檔，然後 Kit.init({tool:'org', sb:sbc})。
   tool：home（工作台）、coach、org、franchise、sop、docs、leads、site。 */
(function(){
  const me=document.currentScript&&document.currentScript.src||location.href;
  const CONSULT=new URL('../',me).href, BOM=new URL('../../',me).href;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LS='consult.client';
  const store={get(){try{return +localStorage.getItem(LS)||null}catch(_){return null}},set(v){try{v?localStorage.setItem(LS,String(v)):localStorage.removeItem(LS)}catch(_){}}};
  const hp=()=>new URLSearchParams(location.hash.slice(1));

  /* ---------- 跳出訊息 ---------- */
  const ICON={ok:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>',
    bad:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M8 4v5"/><path d="M8 12h.01"/></svg>',
    info:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M8 7v5"/><path d="M8 4h.01"/></svg>'};
  let box=null, last={t:'',at:0};
  function toast(text,type){
    text=String(text||'').trim(); if(!text) return;
    const now=Date.now(); if(text===last.t&&now-last.at<2500) return; last={t:text,at:now};
    type=type==='bad'||type==='ok'||type==='info'?type:(/失敗|錯誤|請先|請填|請選|不能|無法|找不到|沒有存/.test(text)?'bad':'ok');
    if(!box){box=document.createElement('div');box.className='kit-toasts';box.setAttribute('role','status');box.setAttribute('aria-live','polite');document.body.appendChild(box)}
    const ms=type==='bad'?6000:Math.min(6000,2600+text.length*40);
    const el=document.createElement('div'); el.className='kit-toast '+type;
    el.innerHTML=`<span class="ti" aria-hidden="true">${ICON[type]}</span><span class="tt">${esc(text)}</span><button type="button" class="tx" aria-label="關閉">×</button><span class="tb" style="animation-duration:${ms}ms"></span>`;
    box.appendChild(el); while(box.children.length>4) box.firstElementChild.remove();
    let left=ms, start=Date.now(), h=setTimeout(close,left);
    function close(){ if(!el.isConnected) return; el.classList.add('out'); setTimeout(()=>el.remove(),260) }
    el.addEventListener('mouseenter',()=>{clearTimeout(h); left-=Date.now()-start});
    el.addEventListener('mouseleave',()=>{start=Date.now(); h=setTimeout(close,Math.max(800,left))});
    el.addEventListener('click',close);
  }

  /* ---------- 讀取進度條＋按鈕轉圈 ---------- */
  let pending=0, bar=null, barT=null, clicked=null, busyBtns=new Set();
  function loadOn(){ if(!bar){bar=document.createElement('div');bar.className='kit-load';document.body.appendChild(bar)}
    clearTimeout(barT); barT=setTimeout(()=>{bar.classList.remove('done');bar.classList.add('on')},150) }
  function loadOff(){ clearTimeout(barT); if(bar&&bar.classList.contains('on')){bar.classList.remove('on');bar.classList.add('done')}
    busyBtns.forEach(b=>b.classList.remove('kit-busy')); busyBtns.clear() }
  if(window.fetch&&!window.fetch.__kit){
    const f0=window.fetch.bind(window);
    const f=function(...a){
      pending++; if(pending===1) loadOn();
      if(clicked&&Date.now()-clicked.at<400&&clicked.b.isConnected&&!clicked.b.disabled){clicked.b.classList.add('kit-busy');busyBtns.add(clicked.b)}
      return f0(...a).finally(()=>{pending=Math.max(0,pending-1); if(!pending) loadOff()});
    }; f.__kit=true; window.fetch=f;
  }

  /* ---------- 按鈕波紋 ---------- */
  document.addEventListener('pointerdown',e=>{
    const b=e.target.closest('button,a.btn'); if(!b||b.disabled||b.closest('.kit-menu')) return;
    if(b.classList.contains('pri')||/^(save|create|pub|add|conv)/i.test(Object.keys(b.dataset).join(' '))) clicked={b,at:Date.now()};
    if(reduce) return;
    const r=b.getBoundingClientRect(), d=Math.max(r.width,r.height)*2.2, s=document.createElement('span');
    s.className='kit-ripple'; s.style.cssText=`width:${d}px;height:${d}px;left:${e.clientX-r.left-d/2}px;top:${e.clientY-r.top-d/2}px`;
    b.appendChild(s); setTimeout(()=>s.remove(),600);
  },{passive:true});

  /* ---------- 數字跳動 ---------- */
  function countUp(root){
    (root||document).querySelectorAll('[data-count]').forEach(el=>{
      const to=+el.dataset.count; if(!isFinite(to)||reduce||to===0){el.textContent=el.dataset.fmt?Number(to).toLocaleString('zh-TW'):String(to);return}
      const t0=performance.now(), dur=650;
      const step=t=>{const p=Math.min(1,(t-t0)/dur), v=Math.round(to*(1-Math.pow(1-p,3))); el.textContent=el.dataset.fmt?v.toLocaleString('zh-TW'):String(v); if(p<1) requestAnimationFrame(step)};
      requestAnimationFrame(step);
    });
  }

  /* ---------- 客戶資料（給切換列用） ---------- */
  const K={tool:'',sb:null,ok:false,D:null,cur:null,prefilled:'',open:false};
  async function rows(qb){ try{const r=await qb; return r.error?null:(r.data||[])}catch(_){return null} }
  async function loadData(){
    const sb=K.sb; if(!sb) return;
    const [cl,org,fr,sop]=await Promise.all([
      rows(sb.from('coach_clients').select('id,name,stage,brand_id,lead_id,stores,biz_type').order('name')),
      rows(sb.from('org_plans').select('id,client_id')),
      rows(sb.from('fr_plans').select('id,coach_client_id,brand_id')),
      rows(sb.from('sop_manuals').select('id,coach_client_id,brand_id'))]);
    K.D={clients:cl||[],org:org||[],fr:fr||[],sop:sop||[],at:Date.now()};
  }
  const TOOLS=[
    ['home','客戶檔案',c=>({u:CONSULT+'#c='+c.id,has:true})],
    ['coach','營運輔導',c=>({u:CONSULT+'coach/#c='+c.id,has:true})],
    ['org','組織診斷',c=>{const p=K.D.org.find(x=>x.client_id===c.id); return p?{u:CONSULT+'org/#p='+p.id,has:true}:{u:CONSULT+'org/#t=new&client='+c.id}}],
    ['franchise','加盟體系',c=>{const p=K.D.fr.find(x=>x.coach_client_id===c.id); return p?{u:CONSULT+'franchise/#p='+p.id,has:true}:{u:CONSULT+'franchise/#new&client='+c.id}}],
    ['sop','SOP 手冊',c=>{const p=K.D.sop.find(x=>x.coach_client_id===c.id)||(c.brand_id&&K.D.sop.find(x=>x.brand_id===c.brand_id)); return p?{u:CONSULT+'sop/#m='+p.id,has:true}:{u:CONSULT+'sop/#new&client='+c.id}}],
    ['docs','文件中心',c=>({u:CONSULT+'docs/#client='+c.id,has:true})],
    ['bom','BOM 中心',c=>c.brand_id?{u:BOM+'#home&b='+encodeURIComponent(c.brand_id),has:true}:null]];
  function detect(){
    const p=hp(), D=K.D, n=k=>+p.get(k)||null;
    if(n('client')) return n('client');
    if(K.tool==='coach'&&n('c')) return n('c');
    if(K.tool==='org'&&n('p')){const x=D.org.find(o=>o.id===n('p')); if(x) return x.client_id||null; return undefined}
    if(K.tool==='franchise'&&n('p')){const x=D.fr.find(o=>o.id===n('p')); if(x) return x.coach_client_id||(x.brand_id&&(D.clients.find(c=>c.brand_id===x.brand_id)||{}).id)||null; return undefined}
    if(K.tool==='sop'&&n('m')){const x=D.sop.find(o=>o.id===n('m')); if(x) return x.coach_client_id||(x.brand_id&&(D.clients.find(c=>c.brand_id===x.brand_id)||{}).id)||null; return undefined}
    return 0; // 0 = 這一頁沒指定客戶，沿用上次的
  }
  async function resolve(){
    if(!K.ok) return;
    let id=detect();
    if(id===undefined&&K.reloaded!==location.hash){ K.reloaded=location.hash; await loadData(); id=detect() } // 剛建立的紀錄，重讀一次
    if(id) store.set(id);
    const sid=id||(id===0?store.get():null);
    K.cur=K.D.clients.find(c=>c.id===sid)||null;
    drawBar();
  }
  function drawBar(){
    let el=document.querySelector('.kit-bar');
    if(!el){el=document.createElement('div');el.className='kit-bar noprint';el.innerHTML='<div class="kb"></div>';const nv=document.querySelector('.kit-nav');document.body.insertBefore(el,nv?nv.nextSibling:document.body.firstChild)}
    const c=K.cur;
    const links=c?TOOLS.map(([k,l,f])=>{const r=f(c); if(!r) return ''; return `<a href="${esc(r.u)}" class="${k===K.tool?'on':''} ${r.has?'':'add'}" title="${r.has?'打開':'還沒建立，按一下開始'}"><span class="dot"></span>${r.has?'':'＋ '}${esc(l)}</a>`}).join(''):'<span class="kit-links"><span class="note" style="margin:0">選一位客戶，就能在各工具間直接切換</span></span>';
    el.querySelector('.kb').innerHTML=`<a class="kh" href="${CONSULT}"><span class="kl">辣</span>顧問工作台</a><span class="ksep"></span>
      <div class="kit-pick"><button type="button" data-kit-pick aria-haspopup="listbox" aria-expanded="${K.open}"><span class="av">${esc(c?c.name.slice(0,1):'?')}</span><span>${esc(c?c.name:'選擇客戶')}${c?` <span class="cv">${esc(c.stage||'')}</span>`:''}</span><span aria-hidden="true">▾</span></button>${K.open?menu():''}</div>
      <nav class="kit-links" aria-label="這位客戶的其他工具">${links}</nav>`;
    if(K.open){const i=el.querySelector('.kit-menu input'); if(i) i.focus()}
  }
  function menu(q){
    q=(q||'').trim();
    const list=K.D.clients.filter(c=>!q||c.name.includes(q));
    return `<div class="kit-menu" role="listbox"><input type="search" data-kit-q placeholder="搜尋客戶" value="${esc(q)}" aria-label="搜尋客戶">${list.length?list.map(c=>`<button type="button" data-kit-c="${c.id}" class="${K.cur&&K.cur.id===c.id?'on':''}"><span>${esc(c.name)}</span><span class="st">${esc(c.stage||'')}${c.stores?'・'+c.stores+' 店':''}</span></button>`).join(''):`<p class="note" style="padding:6px 10px;margin:0">${K.D.clients.length?'找不到':'還沒有輔導客戶'}。到「營運輔導」新增，或從健檢名單轉入。</p>`}
      <button type="button" data-kit-new style="color:var(--accent)">＋ 新增輔導客戶</button></div>`;
  }
  document.addEventListener('click',e=>{
    if(!K.ok) return;
    if(e.target.closest('[data-kit-pick]')){K.open=!K.open; drawBar(); return}
    const b=e.target.closest('[data-kit-c]');
    if(b){const c=K.D.clients.find(x=>x.id===+b.dataset.kitC); K.open=false; if(!c) return; store.set(c.id); K.cur=c;
      const t=TOOLS.find(x=>x[0]===K.tool), r=t&&t[2](c);
      if(r){ if(!r.has) toast(`「${c.name}」還沒有${t[1]}，已幫你開新增畫面並帶入客戶。`,'info'); location.href=r.u } else drawBar(); return}
    if(e.target.closest('[data-kit-new]')){K.open=false; location.href=CONSULT+'coach/#new'; return}
    if(K.open&&!e.target.closest('.kit-menu')){K.open=false; drawBar()}
  });
  document.addEventListener('input',e=>{ if(e.target.matches('[data-kit-q]')){const m=e.target.closest('.kit-menu'), v=e.target.value; const w=document.createElement('div'); w.innerHTML=menu(v); m.replaceWith(w.firstElementChild); const i=document.querySelector('.kit-menu input'); i.focus(); i.setSelectionRange(v.length,v.length)} });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&K.open){K.open=false; drawBar()} });

  /* 新增畫面自動帶入客戶（?client= / &lead=） */
  function prefill(){
    const p=hp(), key=location.hash; if(K.prefilled===key) return;
    const cid=+p.get('client')||null, lid=+p.get('lead')||null; if(!cid&&!lid) return;
    const set=(sel,v)=>{const el=document.querySelector(sel); if(!el||v==null||el.tagName!=='SELECT') return false; if(![...el.options].some(o=>o.value===String(v))) return false; el.value=String(v); el.dispatchEvent(new Event('change',{bubbles:true})); return true};
    let done=false;
    if(lid) done=set('#n_lead',lid)||done;
    if(cid){ done=set('#n_client',cid)||done; done=set('#f_coach',cid)||done;
      const c=K.D&&K.D.clients.find(x=>x.id===cid);
      if(K.tool==='sop'&&c){const i=document.querySelector('input#n_client'); if(i&&!i.value){i.value=c.name; done=true} const s=document.querySelector('#n_brand'); if(s&&c.brand_id&&!s.value&&[...s.options].some(o=>o.value===c.brand_id)) s.value=c.brand_id}
    }
    if(done) K.prefilled=key;
  }

  /* ---------- 監看畫面：#flash → 跳出訊息、換頁淡入、帶入客戶 ---------- */
  let routeChanged=true;
  window.addEventListener('hashchange',()=>{routeChanged=true; resolve()});
  const BAD=/失敗|錯誤|沒有存|不能|無法|中斷|權限|上限/;
  function watch(extra){
    const attached=new WeakSet();
    const hook=()=>(extra||[]).forEach(([sel,mode])=>{const el=document.querySelector(sel); if(!el||attached.has(el)) return; attached.add(el); let prev=el.textContent.trim();
      new MutationObserver(()=>{const t=el.textContent.trim(); if(!t||t===prev){prev=t;return} prev=t; if(/(…|\.\.\.)$/.test(t)) return;
        const bad=BAD.test(t); if(mode==='bad'&&!bad) return; toast(t,bad?'bad':'ok')}).observe(el,{childList:true,subtree:true,characterData:true})});
    // #flash 裡的訊息（就算整個畫面重畫、#flash 被換掉也抓得到）→ 跳出訊息；#app 換頁淡入、帶入客戶
    const seen=new WeakSet(); let raf=0, appEl=null, appObs=null;
    const scan=()=>{ raf=0; hook();
      const m=document.querySelector('#flash .msg'); if(m&&!seen.has(m)){seen.add(m); toast(m.textContent,m.classList.contains('bad')?'bad':'ok')}
      const app=document.getElementById('app');
      if(app&&app!==appEl){ appEl=app; if(appObs) appObs.disconnect(); appObs=new MutationObserver(onApp); appObs.observe(app,{childList:true}); countUp(app) } };
    const onApp=()=>{ if(routeChanged&&!reduce){routeChanged=false; appEl.classList.remove('kit-in'); void appEl.offsetWidth; appEl.classList.add('kit-in')}
      countUp(appEl); if(K.ok) prefill() };
    new MutationObserver(()=>{ if(!raf) raf=requestAnimationFrame(scan) }).observe(document.body,{childList:true,subtree:true});
    scan();
  }


  /* ======================================================================
     共用導覽列：上一頁／下一頁、可伸縮的功能選單（所有系統與功能頁）、側欄收合
     ====================================================================== */
  const ROOT=BOM, PLC=new URL('../pl-center/',BOM).href;
  const BOMNAV=[['常用',[['home','首頁'],['news','公告欄']]],['資料建立',[['ing','食材主檔'],['semi','半成品'],['recipe','品項配方'],['combo','套餐組合'],['io','上傳與下載表單']]],
    ['庫存與進貨',[['cnt','盤點'],['po','採購單'],['rcv','進貨登記'],['waste','耗損登記'],['sales','銷量匯入'],['var','用量差異'],['supp','供應商']]],
    ['成本與定價',[['cost','成本毛利'],['matrix','產品四象限'],['newp','新品試算'],['price','定價漲價試算'],['channel','外送通路定價']]],
    ['營運管理',[['mrep','每月經營月報'],['sop','SOP 手冊'],['qsc','門市稽核'],['shift','排班與人力成本'],['cash','現金流預估'],['grow','顧客成長'],['order','叫貨推估'],['pricelog','價格紀錄'],['pl','損益趨勢'],['be','損益兩平'],['fc','預估與情境']]],
    ['總部與加盟',[['markup','疊價設定'],['hqitem','單品獲利'],['supply','總供貨試算'],['frsim','加盟主損益']]],
    ['系統',[['ver','版本與備份'],['log','修改紀錄'],['account','我的帳號'],['help','使用說明'],['brands','品牌管理',1],['annc','公告管理',1],['admin','授權管理',1]]]];
  // [key, 圖示, 名稱, 路徑, 功能頁[[hash,名稱,只限顧問]], 只限顧問]
  const SYS=[
    ['home','台','顧問工作台','consult/',[['','總覽']],1],
    ['leads','單','健檢名單','checkup/leads/',[['','名單列表']],1],
    ['checkup','檢','經營健檢（業主填）','checkup/',[['','健檢問卷']],1],
    ['coach','導','營運輔導','consult/coach/',[['','輔導客戶'],['#todo','全部待辦'],['#new','新增客戶']],1],
    ['org','組','組織診斷','consult/org/',[['','診斷列表'],['#t=new','新增診斷']],1],
    ['franchise','盟','加盟體系','consult/franchise/',[['','加盟方案'],['#new','新增方案']],1],
    ['sop','SOP','SOP 手冊與稽核','consult/sop/',[['','手冊列表'],['#audit','督導總覽'],['#new','新增手冊']],1],
    ['site','址','立地評估','site/',[['','評估店址']],1],
    ['portal','入','業主入口','portal/',[['','我的系統']]],
    ['bom','B','BOM 運算中心','',null],
    ['pl','損','損益分析中心',PLC,[['','損益總覽']]],
    ['hr','人','人資與勞基法','hr/',[['','首頁'],['#qa','常見錯誤'],['#case','案例引導'],['#tpl','範本'],['#emp','員工名單'],['#calc','計算工具'],['#law','法規查詢'],['#set','公司設定']]],
    ['member','訂','會員與訂閱','member/',[['','會員中心']]]];
  const sysUrl=s=>/^https?:/.test(s[3])?s[3]:ROOT+s[3];
  const N={on:false,role:null,open:false,q:'',side:false,hasSide:false};
  const ls={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(_){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}}};
  N.role=ls.get('kit.role',null);
  function curSys(){
    const here=location.origin+location.pathname.replace(/index\.html$/,'');
    let best=null;
    SYS.forEach(s=>{const u=sysUrl(s); if(s[0]==='bom'){ if(here===ROOT) best=s; return } if(here===u||(here.startsWith(u)&&(!best||u.length>sysUrl(best).length))) best=s });
    return best;
  }
  function pagesOf(s){
    if(s[0]!=='bom') return [{h:'',items:s[4].map(p=>({u:sysUrl(s)+p[0],h:p[0],n:p[1]}))}];
    const c=curSys(), onBom=c&&c[0]==='bom';
    return BOMNAV.map(([g,list])=>({h:g,items:list.filter(p=>!p[2]||N.role==='admin').map(p=>({u:(onBom?'':ROOT)+'#'+p[0],h:'#'+p[0],n:p[1]}))}));
  }
  function curPage(s){
    if(!s) return null; const h=location.hash||'', all=pagesOf(s).flatMap(g=>g.items);
    let m=all.filter(p=>p.h&&(h===p.h||h.startsWith(p.h+'&'))).sort((a,b)=>b.h.length-a.h.length)[0];
    if(!m&&s[0]==='bom'&&!h) m=all.find(p=>p.h==='#home');
    if(!m&&(!h||!all.some(p=>p.h))) m=all.find(p=>p.h==='');
    if(!m&&s[0]==='hr'){const t='#'+h.slice(1).split('/')[0]; m=all.find(p=>p.h===t)}
    return m||null;
  }
  const homeUrl=()=>N.role==='admin'?CONSULT:ROOT+'portal/';
  function canBack(){ const n=window.navigation; return n&&'canGoBack' in n?n.canGoBack:history.length>1 }
  function canFwd(){ const n=window.navigation; return n&&'canGoForward' in n?n.canGoForward:true }
  const IC={menu:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 5h14M3 10h14M3 15h14"/></svg>',
    back:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 4.5L7 10l5.5 5.5"/></svg>',
    fwd:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 4.5L13 10l-5.5 5.5"/></svg>',
    side:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="3.5" width="15" height="13" rx="2.5"/><path d="M7.5 3.5v13"/></svg>'};
  function drawNav(){
    if(!N.on) return;
    let el=document.querySelector('.kit-nav');
    if(!el){el=document.createElement('div');el.className='kit-nav noprint';document.body.insertBefore(el,document.body.firstChild)}
    const s=curSys(), p=curPage(s);
    const crumb=[`<a href="${esc(homeUrl())}" class="kc-h"><span class="kl">辣</span><span class="kt">${N.role==='admin'?'顧問工作台':'業主入口'}</span></a>`];
    if(s&&!(s[0]==='home'&&N.role==='admin')&&!(s[0]==='portal'&&N.role!=='admin')) crumb.push(`<a href="${esc(sysUrl(s))}">${esc(s[2])}</a>`);
    if(p&&p.h) crumb.push(`<span>${esc(p.n)}</span>`);
    el.innerHTML=`<div class="kn">
      <button type="button" class="kn-b kn-menu" data-kit-menu aria-expanded="${N.open}" aria-controls="kit-drawer" title="功能選單">${IC.menu}<span>功能選單</span></button>
      <span class="kn-g"><button type="button" class="kn-b" data-kit-back ${canBack()?'':'disabled'} title="上一頁" aria-label="上一頁">${IC.back}<span>上一頁</span></button><button type="button" class="kn-b" data-kit-fwd ${canFwd()?'':'disabled'} title="下一頁" aria-label="下一頁">${IC.fwd}<span>下一頁</span></button></span>
      ${N.hasSide?`<button type="button" class="kn-b kn-side" data-kit-side aria-pressed="${!N.side}" title="${N.side?'展開側欄':'收合側欄'}">${IC.side}<span>${N.side?'展開側欄':'收合側欄'}</span></button>`:''}
      <div class="kn-crumb" role="navigation" aria-label="目前位置">${crumb.join('<i aria-hidden="true">›</i>')}</div></div>`;
  }
  function drawerHtml(){
    const s=curSys(), p=curPage(s), q=N.q.trim(), opened=new Set(ls.get('kit.nav.open',[]));
    if(s&&!ls.get('kit.nav.shut',[]).includes(s[0])) opened.add(s[0]);
    const groups=N.role==='admin'?[['顧問工具',SYS.filter(x=>x[5])],['業主系統',SYS.filter(x=>!x[5])]]:[['我的系統',SYS.filter(x=>!x[5])]];
    const body=groups.map(([gt,list])=>`<div class="kd-g"><div class="kd-gt">${gt}</div>${list.map(x=>{
      const pg=pagesOf(x); let items=pg.map(g=>({h:g.h,items:g.items.filter(i=>!q||i.n.includes(q)||x[2].includes(q))})).filter(g=>g.items.length);
      if(q&&!items.length) return '';
      const isCur=s&&s[0]===x[0], open=q?true:opened.has(x[0]), n=pg.reduce((a,g)=>a+g.items.length,0);
      return `<div class="kd-s ${isCur?'cur':''}"><div class="kd-h"><a href="${esc(sysUrl(x))}" class="kd-a"><span class="ki">${esc(x[1])}</span><span class="kn2">${esc(x[2])}</span></a>${n>1?`<button type="button" class="kd-t" data-kit-tog="${x[0]}" aria-expanded="${open}" aria-label="${open?'收合':'展開'}${esc(x[2])}的功能頁"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 4.5L13 10l-5.5 5.5"/></svg></button>`:''}</div>
        ${n>1?`<div class="kd-b" ${open?'':'hidden'}>${items.map(g=>`${g.h&&pg.length>1?`<div class="kd-sub">${esc(g.h)}</div>`:''}${g.items.map(i=>`<a href="${esc(i.u)}" class="${isCur&&p&&p.u===i.u?'on':''}">${esc(i.n)}</a>`).join('')}`).join('')}</div>`:''}</div>`}).join('')}</div>`).join('');
    return body||'<p class="kd-none">找不到這個功能。</p>';
  }
  function drawDrawer(){
    let d=document.getElementById('kit-drawer');
    if(!N.open){ if(d){d.classList.add('out'); const sc=document.querySelector('.kit-scrim'); sc&&sc.classList.add('out'); setTimeout(()=>{d.remove(); sc&&sc.remove()},200)} return }
    if(!d){
      const sc=document.createElement('div'); sc.className='kit-scrim'; sc.dataset.kitClose=''; document.body.appendChild(sc);
      d=document.createElement('div'); d.id='kit-drawer'; d.className='kit-drawer'; d.setAttribute('role','dialog'); d.setAttribute('aria-label','功能選單');
      d.innerHTML=`<div class="kd-top"><span class="kl">辣</span><b>功能選單</b><button type="button" class="kd-x" data-kit-all title="全部展開／收合">全部展開</button><button type="button" class="kd-x" data-kit-close aria-label="關閉">✕</button></div>
        <input type="search" class="kd-q" data-kit-nq placeholder="搜尋功能，例如：盤點、待辦" aria-label="搜尋功能"><div class="kd-list"></div>
        <div class="kd-foot">${N.role===null?'登入後會依你的權限顯示系統。':N.role==='admin'?'顧問帳號：可看到全部系統':'只顯示業主可用的系統'}</div>`;
      document.body.appendChild(d); setTimeout(()=>d.querySelector('.kd-q').focus(),30);
    }
    d.querySelector('.kd-list').innerHTML=drawerHtml();
    const allOpen=!!d.querySelector('.kd-b')&&[...d.querySelectorAll('.kd-b')].every(x=>!x.hidden);
    d.querySelector('[data-kit-all]').textContent=allOpen?'全部收合':'全部展開';
  }
  function setSide(off){ N.side=off; ls.set('kit.side',off); document.documentElement.classList.toggle('kit-side-off',off); drawNav() }
  document.addEventListener('click',e=>{
    if(!N.on) return;
    const t=e.target;
    if(t.closest('[data-kit-menu]')){N.open=!N.open; N.q=''; drawNav(); drawDrawer(); return}
    if(t.closest('[data-kit-close]')){N.open=false; drawNav(); drawDrawer(); return}
    if(t.closest('[data-kit-back]')){ if(canBack()) history.back(); else location.href=homeUrl(); return }
    if(t.closest('[data-kit-fwd]')){ history.forward(); return }
    if(t.closest('[data-kit-side]')){ setSide(!N.side); return }
    const tg=t.closest('[data-kit-tog]');
    if(tg){const k=tg.dataset.kitTog, o=new Set(ls.get('kit.nav.open',[])), sh=new Set(ls.get('kit.nav.shut',[])), open=tg.getAttribute('aria-expanded')!=='true';
      if(open){o.add(k);sh.delete(k)}else{o.delete(k);sh.add(k)} ls.set('kit.nav.open',[...o]); ls.set('kit.nav.shut',[...sh]);
      const bx=tg.closest('.kd-s').querySelector('.kd-b'); tg.setAttribute('aria-expanded',open); tg.setAttribute('aria-label',(open?'收合':'展開')+tg.getAttribute('aria-label').slice(2)); if(bx) bx.hidden=!open; return}
    if(t.closest('[data-kit-all]')){const o=ls.get('kit.nav.open',[]); const all=SYS.every(x=>o.includes(x[0])); ls.set('kit.nav.open',all?[]:SYS.map(x=>x[0])); ls.set('kit.nav.shut',all?SYS.map(x=>x[0]):[]); drawDrawer(); return}
    if(t.closest('.kit-drawer a')){N.open=false; setTimeout(()=>{drawNav(); drawDrawer()},0)}
  });
  document.addEventListener('input',e=>{ if(N.on&&e.target.matches('[data-kit-nq]')){N.q=e.target.value; const d=document.getElementById('kit-drawer'); d&&(d.querySelector('.kd-list').innerHTML=drawerHtml())} });
  document.addEventListener('keydown',e=>{ if(N.on&&e.key==='Escape'&&N.open){N.open=false; drawNav(); drawDrawer()} });
  const renav=()=>{ if(N.on){ drawNav(); if(N.open) drawDrawer() } };
  window.addEventListener('hashchange',renav); window.addEventListener('popstate',renav);
  if(window.navigation&&navigation.addEventListener) navigation.addEventListener('currententrychange',()=>setTimeout(renav,0));
  function pageSb(o){ if(o&&o.sb) return o.sb; try{ if(typeof sbc!=='undefined'&&sbc&&sbc.auth) return sbc }catch(_){} return null }
  async function findRole(o){
    const sb=pageSb(o); if(!sb) return;
    try{ const {data:{session}}=await sb.auth.getSession(); if(!session) return;
      const p=await sb.from('bom_profiles').select('role,status').eq('user_id',session.user.id).maybeSingle();
      const r=p.data&&p.data.role==='admin'&&p.data.status==='active'?'admin':'owner';
      if(r!==N.role){N.role=r; ls.set('kit.role',r); renav()} }catch(_){}
  }
  function initNav(o){
    N.on=true; document.documentElement.classList.add('kit-nav-on');
    N.hasSide=!!document.querySelector('.shell>.side,.shell>#side');
    N.side=N.hasSide&&ls.get('kit.side',false); document.documentElement.classList.toggle('kit-side-off',N.side);
    drawNav(); findRole(o); setTimeout(()=>findRole(o),2500);
    // 側欄是畫面重畫後才出現的（例如登入後），之後再補上收合按鈕
    new MutationObserver(()=>{ const h=!!document.querySelector('.shell>.side,.shell>#side'); if(h!==N.hasSide){N.hasSide=h; drawNav()} }).observe(document.body,{childList:true,subtree:true});
  }

  /* ======================================================================
     刪除前再輸入一次登入密碼
     - 頁面上「確定刪除／再按一次刪除」那一下（或有 data-kit-del 的按鈕）會先跳出密碼框
     - 驗證用另一個不存登入狀態的連線，不會影響目前頁面的登入
     ====================================================================== */
  const DEL=/刪除|移除/, FINAL=/再按一次|確定|確認/;
  function isFinalDelete(b){
    if(!b||b.disabled||b.closest('.kit-dlg')||b.hasAttribute('data-kit-nodel')) return false;
    if(b.hasAttribute('data-kit-del')) return true;
    const t=(b.textContent||'')+' '+(b.getAttribute('aria-label')||'');
    return DEL.test(t)&&(b.classList.contains('armed')||FINAL.test(t));
  }
  function selOf(b){
    if(b.id) return '#'+CSS.escape(b.id);
    const a=[...b.attributes].filter(x=>x.name.startsWith('data-')&&!x.name.startsWith('data-kit')).map(x=>`[${x.name}="${CSS.escape(x.value)}"]`).join('');
    return a?b.tagName.toLowerCase()+a:null;
  }
  async function sessionEmail(){
    const sb=pageSb({sb:K.sb||N.sb}); if(!sb) return null;
    try{ const {data:{session}}=await sb.auth.getSession(); return session&&session.user&&session.user.email||null }catch(_){ return null }
  }
  function authClient(){
    let url=null,key=null; try{url=SUPA_URL;key=SUPA_KEY}catch(_){}
    const sb=pageSb({sb:K.sb||N.sb}); if(!url&&sb){url=sb.supabaseUrl;key=sb.supabaseKey}
    if(!url||!window.supabase) return null;
    return window.supabase.createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'kit-reauth'}});
  }
  function reauth(what){
    return new Promise(async done=>{
      const email=await sessionEmail();
      if(!email){ toast('請先登入，才能刪除資料。','bad'); return done(false) }
      const d=document.createElement('dialog'); d.className='kit-dlg';
      what=String(what||'').replace(/再按一次|確定|確認/g,'').trim();
      d.innerHTML=`<form method="dialog"><div class="kg-ic" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h12M8 6V4.5h4V6M6 6l.7 10h6.6L14 6"/></svg></div>
        <h2>刪除前請輸入密碼</h2><p class="kg-s">為了避免誤刪，請輸入目前登入帳號的密碼。${what?`<br>要執行：<b>${esc(what)}</b>`:''}</p>
        <input type="email" autocomplete="username" value="${esc(email)}" readonly class="kg-u" aria-label="登入帳號">
        <input type="password" autocomplete="current-password" class="kg-p" placeholder="登入密碼" aria-label="登入密碼" required>
        <p class="kg-e" role="alert"></p>
        <div class="kg-r"><button type="button" value="no" class="kg-no">取消</button><button type="submit" class="kg-ok" data-kit-nodel>確認刪除</button></div></form>`;
      document.body.appendChild(d);
      const f=d.querySelector('form'), pw=d.querySelector('.kg-p'), er=d.querySelector('.kg-e'), ok=d.querySelector('.kg-ok');
      let fin=false; const end=v=>{ if(fin) return; fin=true; try{d.close()}catch(_){} d.remove(); done(v) };
      d.querySelector('.kg-no').addEventListener('click',()=>end(false));
      d.addEventListener('cancel',e=>{e.preventDefault(); end(false)});
      d.addEventListener('click',e=>{ if(e.target===d) end(false) });
      f.addEventListener('submit',async e=>{
        e.preventDefault(); const v=pw.value; if(!v){er.textContent='請輸入密碼。'; pw.focus(); return}
        const c=authClient(); if(!c){er.textContent='現在連不上登入服務，請稍後再試。'; return}
        ok.disabled=true; ok.textContent='確認中…'; er.textContent='';
        try{ const {error}=await c.auth.signInWithPassword({email,password:v});
          if(error){ ok.disabled=false; ok.textContent='確認刪除'; er.textContent=/invalid|credentials/i.test(error.message||'')?'密碼不對，請再試一次。':/rate|many/i.test(error.message||'')?'嘗試太多次，請過幾分鐘再試。':'沒有確認成功：'+(error.message||'請稍後再試'); pw.select(); return }
          try{ c.auth.signOut({scope:'local'}) }catch(_){}
          end(true);
        }catch(_){ ok.disabled=false; ok.textContent='確認刪除'; er.textContent='網路中斷，請再試一次。' }
      });
      try{d.showModal()}catch(_){d.setAttribute('open','')} pw.focus();
    });
  }
  let passEl=null;
  document.addEventListener('click',e=>{
    if(!N.guard) return;
    const b=e.target.closest('button,a,[role="button"]'); if(!b||!isFinalDelete(b)) return;
    if(passEl===b){ passEl=null; return }
    e.preventDefault(); e.stopImmediatePropagation();
    const sel=selOf(b), what=(b.textContent||b.getAttribute('aria-label')||'').trim();
    reauth(what).then(ok=>{
      if(!ok) return;
      const find=()=>{ if(b.isConnected&&isFinalDelete(b)) return b; if(!sel) return null; const l=[...document.querySelectorAll(sel)]; return l.find(isFinalDelete)||l[0]||null };
      let el=find(); if(!el){ toast('畫面已更新，請再按一次刪除。','info'); return }
      if(!isFinalDelete(el)){ el.click(); el=find(); if(!el||!isFinalDelete(el)){ toast('畫面已更新，請再按一次刪除。','info'); return } }
      passEl=el; el.click(); passEl=null;
    });
  },true);

  async function init(o){
    o=o||{}; K.tool=o.tool||''; K.sb=o.sb||null;
    document.documentElement.classList.add('kit-on');
    if(!document.querySelector('link[data-kit]')){const l=document.createElement('link');l.rel='stylesheet';l.href=new URL('kit.css',me).href;l.dataset.kit='';document.head.appendChild(l)}
    watch(o.watch);
    N.sb=o.sb||null; N.guard=o.guard!==false;
    if(o.nav!==false) initNav(o);
    if(o.bar===false||!K.sb) return;
    try{
      const {data:{session}}=await K.sb.auth.getSession(); if(!session) return;
      const p=await K.sb.from('bom_profiles').select('role,status').eq('user_id',session.user.id).maybeSingle();
      if(!(p.data&&p.data.role==='admin'&&p.data.status==='active')) return;
    }catch(_){return}
    await loadData(); K.ok=true; await resolve(); prefill();
  }
  window.Kit={init,toast,countUp,store,CONSULT,BOM,reauth,nav:renav,refresh:async()=>{if(K.ok){await loadData(); resolve()}}};
})();
