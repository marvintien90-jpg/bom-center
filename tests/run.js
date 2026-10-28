const {chromium}=require('playwright'); const fs=require('fs'), path=require('path');
const SITE=process.argv[2], MOCK=fs.readFileSync(path.join(__dirname,'mock.js'),'utf8'), XL=fs.readFileSync(path.join(__dirname,'node_modules/xlsx/dist/xlsx.full.min.js'),'utf8');
let fails=0; const ok=(c,m)=>{ if(c) console.log('  ✓ '+m); else { fails++; console.log('  ✗ '+m) } };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function open(br,role,w){ const ctx=await br.newContext({viewport:{width:w||1280,height:900}}); const pg=await ctx.newPage(); const errs=[];
  pg.on('pageerror',e=>errs.push(e.message+' @ '+(e.stack||'').split('\n').slice(1,3).join(' '))); pg.on('console',m=>{ if(m.type()==='error'&&!/favicon|Failed to load resource/.test(m.text())) errs.push('console: '+m.text()) });
  await pg.route('**/*',r=>{ const u=r.request().url();
    if(u.includes('supabase-js')) return r.fulfill({contentType:'application/javascript',body:`window.__MOCK=${JSON.stringify({role})};\n`+MOCK});
    if(u.includes('xlsx')) return r.fulfill({contentType:'application/javascript',body:XL});
    if(u.startsWith('file:')) return r.continue(); return r.fulfill({status:404,body:''}) });
  await pg.goto('file://'+SITE); await sleep(400); return {pg,errs,ctx} }
const tab=async(pg,id)=>{ await pg.evaluate(id=>{ const b=document.querySelector(`#nav [data-tab="${id}"]`)||document.querySelector(`[data-tab="${id}"]`); b.click() },id); await sleep(150) };
const iv=async(pg,a)=>{ await pg.evaluate(a=>{ const b=document.querySelector(`[data-iv="${a}"]`); if(!b) throw new Error('no button '+a); b.click() },a); await sleep(120) };
const main=pg=>pg.$eval('#main',e=>e.innerText);
const bad=t=>/NaN|undefined|\[object/.test(t);
const fill=async(pg,sel,v)=>{ await pg.fill(sel,String(v)); await pg.dispatchEvent(sel,'change'); await sleep(120) };
async function allTabs(pg,label){ const ids=await pg.$$eval('#nav [data-tab]',bs=>bs.map(b=>b.dataset.tab)); let badTabs=[];
  for(const id of ids){ await tab(pg,id); const t=await main(pg); if(bad(t)) badTabs.push(id) }
  ok(!badTabs.length,label+'：所有分頁沒有 NaN/undefined'+(badTabs.length?' → '+badTabs.join(','):'')) }
(async()=>{ const br=await chromium.launch();
  /* 管理員 */
  console.log('管理員'); { const {pg,errs}=await open(br,'admin');
    await tab(pg,'supp'); await sleep(200); let t=await main(pg); ok(t.includes('大成肉品'),'供應商列表讀到既有廠商');
    await iv(pg,'supnew'); await pg.fill('#iv-supF-name','青菜行'); await pg.dispatchEvent('#iv-supF-name','input'); await pg.fill('#iv-supF-pay_terms','月結 30 天'); await pg.dispatchEvent('#iv-supF-pay_terms','input'); await iv(pg,'supsave'); await sleep(100);
    t=await main(pg); ok(t.includes('青菜行')&&t.includes('月結 30 天'),'新增供應商');
    await iv(pg,'supnew'); await pg.fill('#iv-supF-name','青菜行'); await pg.dispatchEvent('#iv-supF-name','input'); await iv(pg,'supsave'); t=await main(pg); ok(t.includes('已經有一家叫「青菜行」'),'同名供應商擋下'); await iv(pg,'supcancel');
    await tab(pg,'rcv'); t=await main(pg); ok(t.includes('大成肉品')&&/4,830/.test(t),'進貨紀錄顯示本月既有單據');
    await iv(pg,'rcvnew'); await pg.selectOption('#iv-rl-0','i:i7'); await pg.dispatchEvent('#iv-rl-0','input'); await pg.dispatchEvent('#iv-rl-0','change'); await sleep(150);
    ok(await pg.$eval('#iv-rp-0',e=>e.placeholder)==='35.00','選品項後單價預設帶主檔價');
    await pg.fill('#iv-rq-0','5'); await pg.dispatchEvent('#iv-rq-0','input'); await pg.fill('#iv-rp-0','40'); await pg.dispatchEvent('#iv-rp-0','input'); await sleep(50);
    ok((await pg.$eval('#iv-rtot',e=>e.textContent))==='$200','即時合計');
    await iv(pg,'rladd'); await pg.selectOption('#iv-rl-1','s:s1'); await pg.dispatchEvent('#iv-rl-1','input'); await pg.dispatchEvent('#iv-rl-1','change'); await sleep(120); await pg.fill('#iv-rq-1','2'); await pg.dispatchEvent('#iv-rq-1','input');
    const sid=await pg.$$eval('#iv-rsup option',os=>os.find(o=>o.textContent==='青菜行').value); await pg.selectOption('#iv-rsup',sid); await pg.dispatchEvent('#iv-rsup','input');
    await iv(pg,'rcvsave'); await sleep(150); t=await main(pg);
    ok(t.includes('這張單的進價跟食材主檔不一樣')&&t.includes('洋蔥'),'進價不同時提示更新主檔'); ok(!/招牌燒肉醬：主檔/.test(t),'總部半成品不提示更新');
    const r=await pg.evaluate(()=>window.__db.bom_receipts.slice(-1)[0]); ok(r.lines.length===2&&r.lines[1].price>0&&r.supplier_name==='青菜行','進貨單寫入（空白單價用主檔價、帶供應商名）');
    await iv(pg,'rcvupd'); await sleep(1200); const bd=await pg.evaluate(()=>{ const b=window.__db.bom_brands[0].data; return {p:b.ingredients[1].buyPrice,log:b.priceLog.length} });
    ok(bd.p===40&&bd.log===1,'一鍵更新主檔進價並寫價格紀錄（已存回資料庫）');
    await iv(pg,'rcvnew'); await iv(pg,'rcvsave'); t=await main(pg); ok(t.includes('至少要填一列'),'空白進貨單擋下'); await iv(pg,'rcvcancel');
    await tab(pg,'cnt'); t=await main(pg); ok(t.includes('9 月盤點')&&t.includes('已完成'),'盤點清單');
    await iv(pg,'cntnew'); await iv(pg,'cntcreate'); await sleep(100); t=await main(pg); ok(t.includes('0 / 5'),'建立盤點單（4 食材＋1 總部半成品）');
    ok(t.includes('5.5 公斤'),'顯示上次盤點數量');
    await fill(pg,'#cq-i_i1','3.5'); await sleep(100); ok((await pg.$eval('#cv-i_i1',e=>e.textContent))==='$1,691','填數量立即存並算金額（3.5kg×483）');
    ok((await pg.$eval('#cntDone',e=>e.textContent))==='1 / 5','進度更新');
    let L=await pg.evaluate(()=>window.__db.bom_count_lines.filter(l=>l.count_id!=='c0')); ok(L.length===1&&L[0].qty_base===3500,'資料庫存基本單位 3500');
    await fill(pg,'#cq-i_i1',''); L=await pg.evaluate(()=>window.__db.bom_count_lines.filter(l=>l.count_id!=='c0')); ok(L.length===0,'清空就刪除該列');
    await fill(pg,'#cq-i_i10','1.5'); ok((await pg.$eval('#cv-i_i10',e=>e.textContent))==='$1,650','以箱計的雞蛋金額正確');
    await pg.check('#iv-ct'); await pg.dispatchEvent('#iv-ct','change'); await sleep(120); t=await main(pg); ok(!t.includes('雞蛋')&&t.includes('洋蔥'),'只看還沒填的');
    await pg.uncheck('#iv-ct'); await pg.dispatchEvent('#iv-ct','change'); await sleep(120);
    const cid=await pg.evaluate(()=>window.__db.bom_counts.find(c=>c.status==='open').id);
    await iv(pg,'cntclose:'+cid); t=await main(pg); ok(t.includes('沒填的 4 項當作 0'),'完成前提醒未填項目'); await iv(pg,'cntclose:'+cid); await sleep(200);
    const st=await pg.evaluate(id=>({s:window.__db.bom_counts.find(c=>c.id===id).status,n:window.__db.bom_count_lines.filter(l=>l.count_id===id).length}),cid); ok(st.s==='closed'&&st.n===5,'完成盤點：未填補 0、狀態已完成');
    t=await main(pg); ok(t.includes('重新開啟（顧問）'),'管理員可重新開啟');
    await iv(pg,'cntxls'); await sleep(100);
    await allTabs(pg,'管理員'); ok(!errs.length,'沒有頁面錯誤'+(errs.length?'：'+errs.join(' | '):'')); }
  /* 進階版可編輯業主 */
  console.log('進階版業主'); { const {pg,errs}=await open(br,'pro');
    await tab(pg,'cnt'); let t=await main(pg); ok(t.includes('開始新盤點'),'業主可開始盤點');
    await iv(pg,'cntopen:c0'); t=await main(pg); ok(!(await pg.$('[data-iv^=cntreopen]'))&&!(await pg.$('[data-iv^=cntdel]'))&&!(await pg.$('#cq-i_i1')),'已完成盤點：業主不能改、不能刪、不能重開');
    await iv(pg,'cntback'); await iv(pg,'cntnew'); await iv(pg,'cntcreate'); await sleep(100);
    await pg.evaluate(()=>{ window.__fail={t:'bom_count_lines',op:'upsert',msg:'TypeError: Failed to fetch'} }); await fill(pg,'#cq-i_i7','2'); await sleep(100); t=await main(pg); ok(t.includes('連線有問題'),'存檔失敗顯示白話錯誤'); await pg.evaluate(()=>{ window.__fail=null });
    await tab(pg,'supp'); t=await main(pg); ok(t.includes('新增供應商'),'業主可管理供應商');
    await allTabs(pg,'進階版業主'); ok(!errs.length,'沒有頁面錯誤'+(errs.length?'：'+errs.join(' | '):'')); }
  /* 基本版只讀，手機寬度 */
  console.log('基本版只讀（手機）'); { const {pg,errs}=await open(br,'basic',390);
    const navs=await pg.$$eval('#nav [data-tab]',bs=>bs.map(b=>b.dataset.tab+(b.innerText.includes('進階')?'*':''))); ok(['cnt','rcv','supp'].every(x=>navs.includes(x)),'選單有盤點／進貨／供應商且不是進階功能');
    for(const id of ['cnt','rcv','supp']){ await tab(pg,id); const t=await main(pg); ok(!/開始新盤點|新增進貨單|新增供應商/.test(t),id+'：只讀看不到新增按鈕'); ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),id+'：手機沒有水平捲動') }
    await tab(pg,'cnt'); await iv(pg,'cntopen:c0'); let t=await main(pg); ok(t.includes('5.5 公斤')&&!(await pg.$('[data-cq]')),'只讀可查看盤點內容');
    ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'盤點明細手機沒有水平捲動');
    await allTabs(pg,'基本版只讀'); ok(!errs.length,'沒有頁面錯誤'+(errs.length?'：'+errs.join(' | '):'')); }
  console.log('待開通／未登入'); { const {pg,errs}=await open(br,'pending'); ok((await main(pg)).includes('開通'),'待開通畫面'); ok(!errs.length,'沒有頁面錯誤'); }
  { const {pg,errs}=await open(br,'none'); ok(await pg.$('#auEmail'),'未登入顯示登入畫面'); ok(!errs.length,'沒有頁面錯誤'+(errs.length?'：'+errs.join(' | '):'')); }
  await br.close(); console.log(fails?`\n${fails} 項失敗`:'\n全部通過'); process.exit(fails?1:0) })().catch(e=>{ console.error(e); process.exit(2) });
