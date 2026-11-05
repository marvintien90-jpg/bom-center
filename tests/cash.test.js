/* ⑤ 現金流預估：13 週餘額、每月付款日、安全水位與缺口。node cash.test.js /abs/index.html */
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
    await tab(pg,'cash'); let t=await main(pg);
    ok(!bad(t)&&t.includes('現金流預估')&&t.includes('13 週後餘額'),'現金流頁正常');
    ok(await pg.evaluate(()=>{ const r=B().cash.rows; return r.find(x=>x.name==='營業收入').amt>0&&r.find(x=>x.name==='食材進貨').amt>0 }),'收入與進貨由品項配方估出');
    // 換成可驗算的數字
    await pg.evaluate(()=>{ const C=B().cash; C.rows=[{id:'a',name:'營業收入',kind:'in',freq:'w',amt:70000},{id:'b',name:'食材進貨',kind:'out',freq:'w',amt:25000},{id:'c',name:'房租',kind:'out',freq:'m',day:1,amt:120000},{id:'d',name:'薪資',kind:'out',freq:'m',day:31,amt:90000}]; C.from='2026-11-02'; C.start=50000; C.safety=150000; render() });
    await sleep(200);
    const R=await pg.evaluate(()=>{ const R=cfCalc(B()); return R.W.map(w=>[cfIso(w.a),w.inn,w.out,w.bal]) });
    ok(R.length===13&&R[0][0]==='2026-11-02','13 週，從週一 11/2 開始');
    ok(R[0][2]===25000+90000*0,'第一週只付進貨（11/1 房租在前一週）');
    ok(R[4][2]===25000+120000+90000,'11/30–12/6 那週：進貨＋12/1 房租＋11/30 薪資（11 月沒有 31 號，算月底）');
    ok(R[12][3]===50000+13*45000-2*120000-3*90000,'13 週後餘額（房租 12/1、1/1；薪資 11/30、12/31、1/31）'+R[12][3]);
    t=await main(pg); ok(t.includes('低於安全水位')||t.includes('會透支'),'有缺口提醒');
    ok(t.includes('提早準備')&&t.includes('房租'),'最低那週列出大筆付款');
    await click(pg,'[data-cfadd="out"]'); ok(await pg.evaluate(()=>B().cash.rows.slice(-1)[0].freq==='once'),'可以加一次性支出');
    await fill(pg,'cash.rows.4.amt','10000'); ok(await pg.evaluate(()=>cfCalc(B()).W[0].out===35000),'一次性支出算在開始那週');
    await click(pg,'[data-cfreset]'); ok(await pg.evaluate(()=>B().cash.start===50000&&B().cash.rows.some(r=>r.name==='營業收入'&&r.amt!==70000)),'重新估算保留目前餘額');
    ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'沒有水平捲動');
    t=await main(pg); ok(!bad(t),'畫面沒有錯誤字樣'); ok(t.includes('筆支出是 0 元'),'提醒還沒填金額的支出');
    ok(!errs.length,'沒有頁面錯誤'+(errs.length?'：'+errs.join(' | '):''));
    if(w===375) await pg.screenshot({path:path.join(process.env.SHOT_DIR||require('os').tmpdir(),'cash-mobile.png'),fullPage:true});
  }
  await br.close(); console.log(fails?`\n${fails} 項失敗`:'\n全部通過'); process.exit(fails?1:0) })();
