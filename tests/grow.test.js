/* ⑥ 顧客成長：每月紀錄、營收拆解、成長試算、活動成效。node grow.test.js /abs/index.html */
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
const fill=async(pg,p,v)=>{ await pg.fill(`[data-p="${p}"]`,v); await pg.press(`[data-p="${p}"]`,'Tab'); await sleep(150) };
(async()=>{ const br=await chromium.launch();
  for(const [role,w] of [['admin',1280],['pro',375]]){ console.log(role+' '+w); const {pg,errs}=await open(br,role,w);
    await tab(pg,'grow'); let t=await main(pg);
    ok(!bad(t)&&t.includes('顧客成長')&&t.includes('還沒有資料')&&t.includes('成長試算'),'顧客成長頁正常');
    await click(pg,'[data-grm]'); await fill(pg,'growth.months.0.m','2026-09'); await fill(pg,'growth.months.0.guests','3000'); await fill(pg,'growth.months.0.ticket','300');
    await click(pg,'[data-grm]'); ok(await pg.evaluate(()=>B().growth.months[1].m==='2026-10'&&B().growth.months[1].guests===3000),'下個月自動帶月份和上月數字');
    await fill(pg,'growth.months.1.guests','2700'); await fill(pg,'growth.months.1.ticket','310'); await fill(pg,'growth.months.1.star','4.3');
    t=await main(pg);
    ok(t.includes('837,000 元')&&t.includes('-7.0%'),'營收與比上月');
    ok(t.includes('營收少了 63,000 元')&&t.includes('來客變少'),'找出營收下降主因：來客');
    ok(t.includes('4.3 星'),'顯示評分');
    const sim=await pg.evaluate(()=>{ const m=grMargin(B(),ctx(B())); return m });
    ok(t.includes('每月多的營收')&&sim>0&&sim<1,'成長試算（毛利率 '+Math.round(sim*100)+'%）');
    await click(pg,'[data-grc]'); await fill(pg,'growth.camps.0.start','2026-10-01'); await fill(pg,'growth.camps.0.end','2026-10-10');
    await fill(pg,'growth.camps.0.cost','5000'); await fill(pg,'growth.camps.0.base','20000'); await fill(pg,'growth.camps.0.during','23000');
    t=await main(pg); ok(t.includes('10 天多了 30,000 元營收')&&t.includes('投報率'),'活動成效算出多賺與投報率');
    ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'沒有水平捲動');
    ok(!bad(t),'畫面沒有錯誤字樣');
    ok(!errs.length,'沒有頁面錯誤'+(errs.length?'：'+errs.join(' | '):''));
    if(w===375) await pg.screenshot({path:path.join(process.env.SHOT_DIR||require('os').tmpdir(),'grow-mobile.png'),fullPage:true});
  }
  await br.close(); console.log(fails?`\n${fails} 項失敗`:'\n全部通過'); process.exit(fails?1:0) })();
