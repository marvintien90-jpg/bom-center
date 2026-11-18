/* 顧問工具共用元件（品牌加辣餐飲顧問工作室）
   - Kit.toast(文字, 'ok'|'bad'|'info')：右下角跳出訊息
   - 各頁原本的 say() 訊息（#flash）自動改成跳出訊息
   - 按鈕按下的波紋、懸浮、讀取中轉圈；上方讀取進度條；換頁淡入
   - 客戶切換列：同一位客戶在「營運輔導、組織診斷、加盟體系、SOP、BOM」之間一鍵切換，新增時自動帶入客戶
   用法：在頁面自己的 <script> 之後載入本檔，然後 Kit.init({tool:'org', sb:sbc})。
   tool：home（工作台）、coach、org、franchise、sop、leads、site。 */
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
    if(!el){el=document.createElement('div');el.className='kit-bar noprint';el.innerHTML='<div class="kb"></div>';document.body.insertBefore(el,document.body.firstChild)}
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

  async function init(o){
    o=o||{}; K.tool=o.tool||''; K.sb=o.sb||null;
    document.documentElement.classList.add('kit-on');
    if(!document.querySelector('link[data-kit]')){const l=document.createElement('link');l.rel='stylesheet';l.href=new URL('kit.css',me).href;l.dataset.kit='';document.head.appendChild(l)}
    watch(o.watch);
    if(o.bar===false||!K.sb) return;
    try{
      const {data:{session}}=await K.sb.auth.getSession(); if(!session) return;
      const p=await K.sb.from('bom_profiles').select('role,status').eq('user_id',session.user.id).maybeSingle();
      if(!(p.data&&p.data.role==='admin'&&p.data.status==='active')) return;
    }catch(_){return}
    await loadData(); K.ok=true; await resolve(); prefill();
  }
  window.Kit={init,toast,countUp,store,CONSULT,BOM,refresh:async()=>{if(K.ok){await loadData(); resolve()}}};
})();
