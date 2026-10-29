/* 大量資料驗證：node big.js /abs/index.html
   用 bigdata.js 的模擬門市（1500 張進貨單、14 次盤點、2160 行明細）跑盤點／進貨／供應商／用量差異／損益串接，並量畫面速度。 */
const {chromium}=require('playwright'); const fs=require('fs'), path=require('path');
const SITE=process.argv[2], MOCK=fs.readFileSync(path.join(__dirname,'mock.js'),'utf8'), BIG=fs.readFileSync(path.join(__dirname,'bigdata.js'),'utf8'), XL=fs.readFileSync(path.join(__dirname,'node_modules/xlsx/dist/xlsx.full.min.js'),'utf8');
let fails=0; const ok=(c,m)=>{ if(c) console.log('  ✓ '+m); else { fails++; console.log('  ✗ '+m) } };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function open(br,role,w){ const ctx=await br.newContext({viewport:{width:w||1280,height:900}}); const pg=await ctx.newPage(); const errs=[];
  pg.on('pageerror',e=>errs.push(e.message)); pg.on('console',m=>{ if(m.type()==='error'&&!/favicon|Failed to load resource/.test(m.text())) errs.push('console: '+m.text()) });
  await pg.route('**/*',r=>{ const u=r.request().url();
    if(u.includes('supabase-js')) return r.fulfill({contentType:'application/javascript',body:BIG+`\nwindow.__MOCK=${JSON.stringify({role})};\n`+MOCK});
    if(u.includes('xlsx')) return r.fulfill({contentType:'application/javascript',body:XL});
    if(u.startsWith('file:')) return r.continue(); return r.fulfill({status:404,body:''}) });
  await pg.goto('file://'+SITE); await sleep(600); return {pg,errs} }
const tab=async(pg,id)=>{ await pg.evaluate(id=>document.querySelector(`#nav [data-tab="${id}"]`).click(),id) };
const waitFor=async(pg,fn,ms=8000)=>{ const t0=Date.now(); while(Date.now()-t0<ms){ if(await pg.evaluate(fn)) return Date.now()-t0; await sleep(25) } return -1 };
const main=pg=>pg.$eval('#main',e=>e.innerText);
const bad=t=>/NaN|undefined|\[object|Infinity/.test(t);
const timed=async(pg,f)=>{ const t0=Date.now(); await f(); return Date.now()-t0 };
(async()=>{ const br=await chromium.launch();
  console.log('管理員（電腦版）'); { const {pg,errs}=await open(br,'admin');
    await tab(pg,'cnt'); const ms=await waitFor(pg,()=>inv.brand===cur&&!inv.loading);
    const S=await pg.evaluate(()=>({r:inv.rcv.length,c:inv.cnt.length,l:Object.values(inv.lines).reduce((t,a)=>t+a.length,0),s:inv.supp.length,uniq:new Set(inv.rcv.map(x=>x.id)).size}));
    ok(S.r===1500&&S.uniq===1500,`讀到全部 1500 張進貨單、沒有重複（分頁超過 1000 筆）→ ${S.r}/${S.uniq}`);
    const EL=await pg.evaluate(()=>window.__BIG.lines.length);
    ok(S.c===14&&S.l===EL&&S.s===25,`盤點 14 次、明細 ${EL} 行、供應商 25 家 → ${S.c}/${S.l}/${S.s}`);
    ok(ms>=0&&ms<3000,`庫存資料讀完 ${ms} ms`);
    let t=await main(pg); ok(t.includes('盤點中')&&t.includes('9 月盤點')&&!bad(t),'盤點清單顯示 14 次');
    let d=await timed(pg,()=>pg.evaluate(()=>document.querySelector('[data-iv="cntopen:bcopen"]').click())); t=await main(pg);
    const NK=await pg.evaluate(()=>Object.keys(window.__BIG.v).length), NO=await pg.evaluate(()=>window.__BIG.lines.filter(l=>l.count_id==='bcopen').length);
    ok(t.includes(NO+' / '+NK),`盤點中的單：已填 ${NO} / ${NK} 項`); ok(d<1500,`打開 ${NK} 項盤點單 ${d} ms`);
    const cq=await pg.$('[id^="cq-i_i"]'); const qid=await cq.evaluate(e=>e.id); await pg.fill('#'+qid,'2.5'); await pg.dispatchEvent('#'+qid,'change'); await sleep(200);
    ok(await pg.evaluate(id=>window.__db.bom_count_lines.some(l=>l.count_id==='bcopen'&&l.item_key===id.slice(3).replace('_',':')&&l.qty_base===2500),qid),'在大資料盤點單裡填數量會即時存');
    await pg.evaluate(()=>document.querySelector('[data-iv="cntback"]').click()); await sleep(100);
    d=await timed(pg,()=>pg.evaluate(()=>document.querySelector('[data-iv="cntopen:bc12"]').click())); t=await main(pg); ok(t.includes(NK+' / '+NK)&&!bad(t),`查看已完成盤點（${d} ms）`);
    await pg.evaluate(()=>document.querySelector('[data-iv="cntback"]').click());
    d=await timed(pg,async()=>{ await tab(pg,'rcv'); await sleep(50) }); t=await main(pg); ok(!bad(t),`進貨登記頁（${d} ms，預設本月）`);
    const mSel=await pg.$eval('#main select',e=>e.id), mOpts=await pg.$$eval('#main select option',os=>os.map(o=>o.value)); ok(mOpts.length>=13,'進貨可依月份切換（'+mOpts.length+' 個月）');
    await pg.selectOption('#'+mSel,'2026-09'); await pg.dispatchEvent('#'+mSel,'change'); await sleep(150); t=await main(pg);
    const sepTot=await pg.evaluate(()=>window.__BIG.rcv.filter(r=>r.received_on.startsWith('2026-09')).reduce((s,r)=>s+r.total,0));
    ok(/測試供應商/.test(t)&&t.includes(Math.round(sepTot).toLocaleString()),'切到 9 月：125 張單、合計 '+Math.round(sepTot).toLocaleString());
    await tab(pg,'supp'); await sleep(50); t=await main(pg); ok(t.includes('測試供應商25')&&!bad(t),'供應商列表 25 家');
    d=await timed(pg,async()=>{ await tab(pg,'var'); await waitFor(pg,()=>!!document.querySelector('#main table')) }); t=await main(pg);
    ok(t.includes('2026-08-31 ～ 2026-09-30')&&!bad(t),`用量差異預設最近一期 9 月（${d} ms）`);
    /* 核對：每樣東西的差異率應該等於預埋的偏差（進貨數量有四捨五入，容許 1%） */
    const chk=await pg.evaluate(()=>{ const b=brands[cur], c=ctx(b), cl=inv.cnt.filter(x=>x.status==='closed'), out=[];
      for(let i=0;i<cl.length-1;i++){ const R=varCalc(b,c,cl[i+1],cl[i]); R.rows.forEach(r=>{ const v=window.__BIG.v[r.p.key]; out.push({k:r.p.key,m:cl[i].count_on,rate:r.rate,v,act:r.act}) }) }
      return out });
    /* 每次送貨數量四捨五入到 0.01 公斤，用量小的品項會差幾十克，所以容許 1% 或 30 克 */
    const withV=chk.filter(x=>x.v!=null), off=withV.filter(x=>!(Math.abs(x.rate-x.v)<0.01||Math.abs(x.act-x.act/(1+x.rate)*(1+x.v))<30)), noUse=chk.filter(x=>x.v==null&&x.act>0);
    const nV=Object.values(await pg.evaluate(()=>window.__BIG.v)).filter(x=>x!=null).length;
    ok(withV.length===12*nV&&!off.length,`12 期 × 有配方的品項，差異率都等於預埋偏差（${withV.length} 筆，對不上的 ${off.length} 筆）${off.length?' 例：'+JSON.stringify(off.slice(0,3)):''}`);
    ok(noUse.length>0&&noUse.every(x=>!isFinite(x.rate)),`沒在配方裡、卻有進貨用掉的品項被另外標出（${noUse.length/12} 樣）`);
    const pills=await pg.$$eval('#main tbody tr',rs=>rs.map(r=>[r.cells[0].textContent,r.cells[9].textContent]));
    const big=Object.entries(await pg.evaluate(()=>window.__BIG.v)).filter(([k,v])=>v!=null&&v>=0.12).length;
    const red=pills.filter(p=>/用太多/.test(p[1])).length; ok(red>=big-3&&red<=big+3,`9 月「用太多」標紅 ${red} 樣（預埋多用 12% 以上的有 ${big} 樣；金額小於 100 元不標）`);
    ok(pills.some(p=>/配方沒用到/.test(p[1])),'表上有「配方沒用到」提示');
    ok(t.includes('帶入損益表營業額'),'有損益串接的「帶入營業額」按鈕');
    await pg.evaluate(()=>document.querySelector('[data-varpl]').click()); await sleep(150); t=await main(pg);
    const sepRev=await pg.evaluate(()=>window.__BIG.plp.find(p=>p.month==='2026-09').revenue.reduce((s,x)=>s+x.amount,0));
    ok(await pg.$eval('#iv-vrev',e=>+e.value)===sepRev&&t.includes('實際食材成本率'),'帶入 9 月營業額 '+sepRev.toLocaleString()+' 並算成本率');
    const rate=(t.match(/實際食材成本率\s*([\d.]+)%/)||[])[1]; ok(rate&&+rate>10&&+rate<45,'實際食材成本率 '+rate+'%（合理範圍）');
    /* 跨期：最早一期也要算得出來 */
    const firstId=await pg.$$eval('#iv-vend option',os=>os[os.length-1].value); await pg.selectOption('#iv-vend',firstId); await pg.dispatchEvent('#iv-vend','change'); await sleep(200); t=await main(pg);
    ok(t.includes('2025-09-30 ～ 2025-10-31')&&!bad(t),'切到最早一期 2025-10 也算得出來');
    await tab(pg,'pl'); await sleep(200); t=await main(pg); ok(t.includes('損益數字來自損益分析中心')&&!bad(t),'損益趨勢讀損益分析中心 12 個月');
    ok(await pg.evaluate(()=>brands[cur].periods.length)===12,'品牌畫面上有 12 個月損益');
    await tab(pg,'be'); await sleep(150); t=await main(pg); ok(!bad(t),'兩平分析沒有錯誤數字');
    const ids=await pg.$$eval('#nav [data-tab]',bs=>bs.map(b=>b.dataset.tab)); const slow=[], badT=[];
    for(const id of ids){ const ms=await timed(pg,async()=>{ await tab(pg,id); await sleep(30) }); const tt=await main(pg); if(bad(tt)) badT.push(id); if(ms>1500) slow.push(id+' '+ms+'ms') }
    ok(!badT.length,'全部分頁沒有 NaN/undefined'+(badT.length?' → '+badT:'')); ok(!slow.length,'全部分頁切換都在 1.5 秒內'+(slow.length?' → '+slow:''));
    ok(await pg.evaluate(()=>!JSON.stringify(plain(cur).periods).includes('損益分析中心')),'存檔資料不含損益中心數字');
    ok(!errs.length,'沒有程式錯誤'+(errs.length?' → '+errs.slice(0,3).join(' | '):'')); }
  console.log('手機版（390px）'); { const {pg,errs}=await open(br,'admin',390);
    await tab(pg,'cnt'); await waitFor(pg,()=>inv.brand===cur&&!inv.loading);
    await pg.evaluate(()=>document.querySelector('[data-iv="cntopen:bcopen"]').click()); await sleep(150);
    const w=await pg.evaluate(()=>({doc:document.documentElement.scrollWidth,vw:innerWidth}));
    ok(w.doc<=w.vw+1,`盤點單整頁沒有橫向捲動（${w.doc}/${w.vw}）`);
    const inp=await pg.$eval('[id^="cq-"]',e=>{ const r=e.getBoundingClientRect(); return r.right<=innerWidth&&r.width>40 }); ok(inp,'數量輸入框在畫面內');
    await tab(pg,'var'); await waitFor(pg,()=>!!document.querySelector('#main table')); const w2=await pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1); ok(w2,'差異表在手機上只有表格內捲動');
    ok(!errs.length,'沒有程式錯誤'+(errs.length?' → '+errs.slice(0,3).join(' | '):'')); }
  await br.close(); console.log(fails?`\n${fails} 項沒過`:'\n全部通過'); process.exit(fails?1:0) })();
