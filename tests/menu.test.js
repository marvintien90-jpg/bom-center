/* 菜單工程：產品四象限（POS 實際銷量、調整試算）與新品試算。node menu.test.js /abs/index.html
   用 bigdata.js 的模擬門市（60 道菜、9 月 POS 銷量）。 */
const {chromium}=require('playwright'); const fs=require('fs'), path=require('path');
const SITE=process.argv[2], MOCK=fs.readFileSync(path.join(__dirname,'mock.js'),'utf8'), BIG=fs.readFileSync(path.join(__dirname,'bigdata.js'),'utf8'), XL=fs.readFileSync(path.join(__dirname,'node_modules/xlsx/dist/xlsx.full.min.js'),'utf8');
let fails=0; const ok=(c,m)=>{ if(c) console.log('  ✓ '+m); else { fails++; console.log('  ✗ '+m) } };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function open(br,role,w){ const ctx=await br.newContext({viewport:{width:w||1280,height:900}}); const pg=await ctx.newPage(); const errs=[];
  pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/*',r=>{ const u=r.request().url();
    if(u.includes('supabase-js')) return r.fulfill({contentType:'application/javascript',body:BIG+`\nwindow.__MOCK=${JSON.stringify({role})};\n`+MOCK});
    if(u.includes('xlsx')) return r.fulfill({contentType:'application/javascript',body:XL});
    if(u.startsWith('file:')) return r.continue(); return r.fulfill({status:404,body:''}) });
  await pg.goto('file://'+SITE); await sleep(600); return {pg,errs} }
const tab=async(pg,id)=>{ await pg.evaluate(id=>document.querySelector(`#nav [data-tab="${id}"]`).click(),id); await sleep(200) };
const main=pg=>pg.$eval('#main',e=>e.innerText);
const bad=t=>/NaN|undefined|\[object|Infinity/.test(t);
(async()=>{ const br=await chromium.launch();
  for(const [role,w] of [['admin',1280],['pro',375]]){ console.log(role+' '+w); const {pg,errs}=await open(br,role,w);
    await tab(pg,'matrix'); await sleep(800); let t=await main(pg);
    ok(!bad(t)&&t.includes('產品四象限分析'),'四象限頁正常');
    const opts=await pg.$$eval('#mxsrc option',o=>o.map(x=>x.value));
    ok(opts.length>=2,'有 POS 銷量來源可選（'+(opts.length-1)+' 筆）');
    if(opts.length>=2){ await pg.selectOption('#mxsrc',opts[1]); await sleep(300); t=await main(pg);
      ok(t.includes('實際份數，換算成 30 天')&&!bad(t),'切到 POS 銷量');
      ok(t.includes('調整試算')&&/售價調高|每月多賣|下架的話/.test(t),'有調整試算與具體數字');
      const q=await pg.evaluate(()=>{ const s=inv.sales.find(x=>x.id===mxSrc), b=B(); const it=b.items.find(i=>s.lines.some(l=>l.key==='m:'+i.id)); const l=s.lines.find(l=>l.key==='m:'+it.id); const d=Math.round((new Date(s.end_on)-new Date(s.start_on))/864e5)+1; return {name:it.name,want:Math.round(l.qty*30/d),orig:it.monthlySales} });
      ok(t.includes(q.name),'品項出現在表格：'+q.name);
      ok(await pg.evaluate(()=>B().items.every(i=>typeof i.monthlySales==='number')),'沒有改到品項配方的月銷量'); }
    ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'沒有水平捲動');
    // 新品試算
    await tab(pg,'newp'); t=await main(pg); ok(t.includes('新品試算')&&t.includes('新增試算'),'新品試算頁');
    const n0=await pg.evaluate(()=>B().items.length);
    await pg.click('[data-npnew]'); await sleep(150);
    await pg.fill('[data-p="drafts.0.price"]','180'); await pg.press('[data-p="drafts.0.price"]','Tab'); await sleep(150);
    await pg.fill('[data-p="drafts.0.monthlySales"]','300'); await pg.press('[data-p="drafts.0.monthlySales"]','Tab'); await sleep(150);
    await pg.click('[data-npline]'); await sleep(150);
    await pg.fill('[data-p="drafts.0.lines.0.qty"]','150'); await pg.press('[data-p="drafts.0.lines.0.qty"]','Tab'); await sleep(200);
    t=await main(pg); ok(!bad(t)&&t.includes('建議售價')&&t.includes('上市後預測'),'算出成本、建議售價與預測象限');
    ok(await pg.evaluate(()=>B().items.length)===n0,'試算不會加進品項');
    await pg.click('[data-npgo]'); await sleep(200);
    ok(await pg.evaluate(n0=>B().items.length===n0+1&&tab==='recipe'&&B().drafts.length===0,n0),'加入品項配方後跳到配方頁');
    t=await main(pg); ok(t.includes('新品試算 1'),'配方頁看得到新品項');
    ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'新品試算沒有水平捲動');
    ok(!errs.length,'沒有頁面錯誤'+(errs.length?'：'+errs.join(' | '):''));
    if(w===375){ await tab(pg,'newp'); await pg.click('[data-npnew]'); await sleep(200); await pg.screenshot({path:path.join(process.env.SHOT_DIR||'/tmp','newp-mobile.png'),fullPage:true});
      await tab(pg,'matrix'); await sleep(300); const o=await pg.$$eval('#mxsrc option',o=>o.map(x=>x.value)); if(o[1]) await pg.selectOption('#mxsrc',o[1]); await sleep(300); await pg.screenshot({path:path.join(process.env.SHOT_DIR||'/tmp','matrix-mobile.png'),fullPage:true}) }
  }
  await br.close(); console.log(fails?`\n${fails} 項失敗`:'\n全部通過'); process.exit(fails?1:0) })();
