/* ③ 門市稽核：逐項打勾、自動算分、缺失改善追蹤、紀錄與趨勢、自訂項目。node qsc.test.js /abs/index.html */
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
const bad=t=>/NaN|undefined|\[object|Infinity|null 分/.test(t);
const click=async(pg,s)=>{ await pg.click(s); await sleep(120) };
(async()=>{ const br=await chromium.launch();
  for(const [role,w] of [['admin',1280],['pro',375]]){ console.log(role+' '+w); const {pg,errs}=await open(br,role,w);
    ok(await pg.evaluate(()=>!!document.querySelector('#nav [data-tab="qsc"]')),'選單有「門市稽核」');
    await tab(pg,'qsc'); let t=await main(pg);
    ok(!bad(t)&&t.includes('門市稽核')&&t.includes('開始新稽核')&&t.includes('目前沒有待改善'),'稽核首頁正常');
    await click(pg,'[data-qsnew]'); t=await main(pg);
    ok(t.includes('目前分數')&&t.includes('已檢查 0 / 23 項')&&t.includes('清潔'),'新稽核：23 項分四類');
    await pg.fill('[data-p="audits.0.store"]','台北店'); await pg.press('[data-p="audits.0.store"]','Tab'); await sleep(150);
    const ids=await pg.evaluate(()=>B().qscItems.map(i=>i.id));
    for(const id of ids) await pg.evaluate(id=>document.querySelector(`[data-qsv$="|${id}|2"]`).click(),id);
    await sleep(150);
    await click(pg,`[data-qsv$="|${ids[4]}|0"]`); await click(pg,`[data-qsv$="|${ids[13]}|1"]`);
    t=await main(pg); ok(t.includes('已檢查 23 / 23 項')&&t.includes('93 分'),'自動算分（43/46 → 93 分）');
    await pg.fill(`[data-p="audits.0.res.${ids[4]}.n"]`,'冷藏 9°C'); await pg.press(`[data-p="audits.0.res.${ids[4]}.n"]`,'Tab'); await sleep(150);
    await click(pg,'[data-qsdone]'); t=await main(pg);
    ok(t.includes('改善追蹤')&&t.includes('待改善')&&t.includes('2 項')&&t.includes('冷藏 9°C'),'完成後缺失進到改善追蹤');
    ok(await pg.evaluate(()=>Object.values(B().audits[0].res).filter(r=>r.due).length===2),'缺失自動帶 7 天期限');
    await pg.fill(`[data-p="audits.0.res.${ids[4]}.who"]`,'阿明'); await pg.press(`[data-p="audits.0.res.${ids[4]}.who"]`,'Tab'); await sleep(150);
    ok(await pg.evaluate(id=>B().audits[0].res[id].who==='阿明',ids[4]),'可以填負責人');
    await click(pg,`[data-qsok$="|${ids[4]}"]`); t=await main(pg);
    ok(/待改善\s*1 項/.test(t),'按已改善後剩 1 項');
    ok(t.includes('稽核紀錄')&&t.includes('台北店')&&t.includes('稽核分數趨勢')===false,'有紀錄表');
    ok(await pg.evaluate(()=>!!document.querySelector('svg[aria-label="稽核分數趨勢"]')),'有分數趨勢圖');
    // 第二次稽核：門市沿用上次
    await click(pg,'[data-qsnew]'); ok(await pg.evaluate(()=>B().audits[1].store==='台北店'),'第二次稽核沿用門市');
    await click(pg,'[data-qsback]'); t=await main(pg); ok(t.includes('進行中')&&t.includes('繼續'),'進行中的稽核可以先存著');
    // 自訂項目
    await click(pg,'[data-qsedit]'); await click(pg,'[data-qsadd]');
    ok(await pg.evaluate(()=>B().qscItems.length===24),'可以新增稽核項目');
    ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'沒有水平捲動');
    t=await main(pg); ok(!bad(t),'畫面沒有錯誤字樣');
    ok(!errs.length,'沒有頁面錯誤'+(errs.length?'：'+errs.join(' | '):''));
    if(w===375){ await click(pg,'[data-qspick]'); await pg.screenshot({path:path.join(process.env.SHOT_DIR||require('os').tmpdir(),'qsc-audit-mobile.png'),fullPage:false});
      await click(pg,'[data-qsback]'); await pg.screenshot({path:path.join(process.env.SHOT_DIR||require('os').tmpdir(),'qsc-list-mobile.png'),fullPage:true}) }
  }
  { const {pg}=await open(br,'basic',1280); ok(await pg.evaluate(()=>!allowed('qsc')&&/進階/.test(document.querySelector('#nav [data-tab="qsc"]').innerText)),'基本版標示為進階功能'); }
  await br.close(); console.log(fails?`\n${fails} 項失敗`:'\n全部通過'); process.exit(fails?1:0) })();
