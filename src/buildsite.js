const fs=require('fs');let h=fs.readFileSync('bom-center.html','utf8');
const rep=(a,b)=>{if(!h.includes(a))throw new Error('miss '+a.slice(0,60));h=h.split(a).join(b)};
rep("function render(){","function renderApp(){");
rep("else { try{localStorage.setItem('bom-brands',JSON.stringify(brands))}catch(x){} }","else siteDeleteBrand(id);");
rep("else saveLocalVers(); render(); return }","else siteDeleteVer(id); render(); return }");
/* btnNew 改走品牌管理 */ rep("if(t.id==='btnNew'||d.newbrand){ const id=uid('b'); brands[id]=norm(blank('新品牌 '+(Object.keys(brands).length+1))); cur=id; tab='ing'; touch(); render(); return }","if(t.id==='btnNew'||d.newbrand){ tab='brands'; armed=null; render(); const f=document.getElementById('nbName'); if(f) f.focus(); return }");
{ const a=h.indexOf('<div class="wrap">'), b=h.indexOf('<script src="https://cdnjs'); if(a<0||b<0) throw new Error('layout');
h=h.slice(0,a)+`<div class="shell bare" id="shell">
  <aside id="side" aria-label="主選單">
    <div class="sidehead"><h1>BOM 運算中心</h1><button id="btnClose" class="only-m" aria-label="關閉選單">✕</button></div>
    <div class="sidebrand" id="brandbar">
      <label for="brandSel">目前品牌</label>
      <select id="brandSel"></select>
      <div class="brandbar"><button id="btnNew">新增品牌</button><button id="btnCopy">複製品牌</button></div>
    </div>
    <nav id="nav" aria-label="功能選單"></nav>
    <div id="userbar"></div>
  </aside>
  <div id="scrim"></div>
  <div class="wrap">
    <header class="top">
      <div class="brandbar"><button id="btnMenu" class="only-m" aria-label="開啟選單">☰ 選單</button><b id="crumb"></b></div>
      <div class="brandbar"><span class="status" id="status" role="status"></span><button id="btnExport" hidden>匯出 Excel</button></div>
    </header>
    <div id="banner"></div>
    <main id="main"><div class="empty"><p class="sub">讀取中…</p></div></main>
    <footer class="note" style="text-align:center">BOM 運算中心 · 品牌加辣餐飲顧問工作室 授權使用</footer>
  </div>
</div>

`+h.slice(b) }
rep('<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>','<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>\n<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>');
rep("</style>",`body{margin:0}[hidden]{display:none!important}img{max-width:100%}
input[type=email],input[type=password],input[type=date]{background:var(--field);border:1px solid var(--line);border-radius:6px;padding:7px 9px;font:inherit;color:inherit;min-width:0}
:disabled{opacity:.75;cursor:not-allowed}
.shell{display:grid;grid-template-columns:236px minmax(0,1fr);min-height:100vh}
.shell.bare{grid-template-columns:minmax(0,1fr)}.shell.bare #side,.shell.bare header.top{display:none}
.shell .wrap{margin:0 auto;width:100%}
#side{background:var(--panel);border-right:1px solid var(--line);padding:16px 12px;display:flex;flex-direction:column;gap:14px;position:sticky;top:0;height:100vh;overflow-y:auto}
.sidehead{display:flex;justify-content:space-between;align-items:center;gap:8px}
.sidebrand{display:flex;flex-direction:column;gap:6px}.sidebrand>label{font-size:12px;color:var(--mute)}.sidebrand select{width:100%}
#nav{gap:2px;flex:1}
.navi{display:flex;width:100%;text-align:left;border:1px solid transparent;background:none;border-radius:6px;padding:6px 10px;gap:6px;justify-content:space-between;align-items:center}
.navi:hover{background:var(--field);border-color:transparent}
.navi[aria-current=page]{background:var(--accent-soft);color:var(--accent);font-weight:700}
.navg{font-size:12px;color:var(--mute);letter-spacing:.06em;margin-top:10px}
.navsub{display:flex;flex-direction:column;gap:1px;padding-left:8px}
#userbar{border-top:1px solid var(--line);padding-top:10px;display:flex;flex-direction:column;gap:6px;font-size:12px;overflow-wrap:anywhere}
#userbar:empty{display:none}
.only-m{display:none}#scrim{display:none}
.tip{background:var(--accent-soft);border-radius:8px;padding:8px 12px;font-size:13px;display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;justify-content:space-between}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
.step{border:1px solid var(--line);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:6px;align-items:flex-start}
.step.done{border-color:var(--good);background:var(--good-bg)}.step.done b{color:var(--good)}
details{border:1px solid var(--line);border-radius:8px;padding:8px 12px}summary{cursor:pointer;font-weight:500}details p{margin-top:6px}
.btnlink{display:inline-block;background:#047d3a;color:#fff;border-radius:6px;padding:6px 14px;text-decoration:none;font-weight:500}.btnlink:hover{filter:brightness(.95)}
.board{border:1px solid var(--accent);border-left-width:4px;border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:4px;font-size:13px}.board b{color:var(--accent)}
textarea{font:inherit;color:inherit;background:var(--field);border:1px solid var(--line);border-radius:6px;padding:7px 9px;width:100%;resize:vertical}
.ticker{display:flex;width:100%;align-items:center;gap:10px;text-align:left;border:1px solid var(--accent);border-left-width:4px;border-radius:8px;padding:6px 12px;background:var(--panel);overflow:hidden;min-width:0}
.ticker>b{color:var(--accent);flex:none}.ticker>.tag,.ticker>span[aria-hidden]{flex:none;font-size:12px}
.tk{flex:1;overflow:hidden;white-space:nowrap;min-width:0}.tkin{display:inline-block;padding-left:100%;animation:tk linear infinite}
.ticker:hover .tkin,.ticker:focus-visible .tkin{animation-play-state:paused}
@keyframes tk{to{transform:translateX(-100%)}}
@media (prefers-reduced-motion:reduce){.tkin{animation:none;padding-left:0;display:block;overflow:hidden;text-overflow:ellipsis}}
#annDlg{border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--fg);padding:18px;width:min(560px,92vw);max-height:84vh}
#annDlg::backdrop{background:rgba(0,0,0,.45)}
.ann summary{display:flex;justify-content:space-between;gap:10px;align-items:baseline;list-style:none}.ann summary::-webkit-details-marker{display:none}
.ann[open] summary{margin-bottom:6px}.annbody{white-space:pre-line;font-size:13px;overflow-wrap:anywhere}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--bad);margin-right:6px}
input[type=datetime-local]{background:var(--field);border:1px solid var(--line);border-radius:6px;padding:5px 8px;font:inherit;color:inherit}
.pwrow{display:flex;gap:6px}.pwrow input{flex:1}
main tbody th{width:140px}
@media (max-width:860px){.shell{grid-template-columns:minmax(0,1fr)}
 #side{position:fixed;left:0;top:0;z-index:20;width:268px;max-width:86vw;transform:translateX(-100%);transition:transform .2s}
 .shell.open #side{transform:none}.shell.open #scrim{display:block;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:15}
 .only-m{display:inline-block}}
@media (prefers-reduced-motion:reduce){#side{transition:none}}
</style>`);
const i=h.lastIndexOf("boot();"); h=h.slice(0,i)+fs.readFileSync('sitecode.js','utf8')+h.slice(i+7);
h='<!doctype html>\n<html lang="zh-Hant">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="robots" content="noindex">\n'+h+'\n</html>\n';
fs.mkdirSync('site',{recursive:true});fs.writeFileSync('site/index.html',h);
const js=h.split("<script>")[1].split("</script>")[0];new Function(js);console.log('syntax ok',h.length);
