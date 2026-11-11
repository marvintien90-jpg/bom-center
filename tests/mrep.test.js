/* 每月經營月報：彙整各頁、優先三件事、列印與複製文字。node mrep.test.js /abs/index.html */
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
    await pg.context().grantPermissions(['clipboard-read','clipboard-write']).catch(()=>{});
    await tab(pg,'mrep'); let t=await main(pg);
    ok(!bad(t)&&t.includes('每月經營月報')&&t.includes('本月優先三件事'),'月報頁正常');
    ok(t.includes('菜單與成本')&&t.includes('還沒開始用'),'沒用過的頁面列在「還沒開始用」');
    // 放入各頁資料
    await pg.evaluate(()=>{ const b=B(); const d=new Date().toISOString().slice(0,10);
      b.periods=b.periods||[]; b.periods.push({period:'2026-10',label:'2026-10',revenue:[{name:'內用',amount:1000000}],purchases:[{name:'肉品',amount:450000}],expenses:[{name:'薪資',amount:300000},{name:'房租',amount:300000}]});
      qsInit(b); const a={id:'a1',date:'2026-10-01',store:'台北店',by:'',done:true,res:{}}; b.qscItems.forEach((it,i)=>a.res[it.id]={s:i<3?0:2,due:'2026-10-08'}); b.audits.push(a);
      shInit(b); b.staff=[{id:'p1',name:'A',pay:'h',rate:200}]; b.shifts=[{id:'s1',staff:'p1',day:'0',start:'10:00',end:'20:00'}];
      cfInit(b,ctx(b)); b.cash.start=0; b.cash.safety=100000;
      grInit(b); b.growth.months=[{m:'2026-09',guests:3000,ticket:300},{m:'2026-10',guests:2600,ticket:300}];
      render() }); await sleep(300); t=await main(pg);
    ok(t.includes('損益（2026-10）')&&t.includes('淨利 -50,000 元'),'損益：抓最新一期、算出虧損');
    ok(t.includes('本月虧損 50,000 元'),'優先事項：虧損排第一');
    ok(t.includes('3 項已逾期'),'稽核：逾期缺失');
    ok(t.includes('來客 2,600 人（-13.3%）'),'顧客成長：來客下滑');
    ok(await pg.$$eval('.board span',x=>x.length)===3,'只列三件事');
    await pg.click('.board button[data-tab]'); await sleep(200); ok(await pg.evaluate(()=>tab==='pl'),'「去處理」跳到對應頁');
    await tab(pg,'mrep'); await pg.click('[data-mrcopy]'); await sleep(300);
    const txt=await pg.evaluate(()=>mrText(B(),ctx(B())));
    ok(txt.includes('經營月報】')&&txt.includes('1. 本月虧損')&&!/<[a-z]/.test(txt),'文字版（給 LINE）沒有 HTML');
    await pg.evaluate(()=>{ window.print=()=>{ window.__printed=document.body.classList.contains('mrprint') } }); await pg.click('[data-mrprint]'); await sleep(100);
    ok(await pg.evaluate(()=>window.__printed===true),'列印時切換成月報版面');
    ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'沒有水平捲動');
    t=await main(pg); ok(!bad(t),'畫面沒有錯誤字樣');
    ok(!errs.length,'沒有頁面錯誤'+(errs.length?'：'+errs.join(' | '):''));
    if(w===375) await pg.screenshot({path:path.join(process.env.SHOT_DIR||require('os').tmpdir(),'mrep-mobile.png'),fullPage:true});
  }
  await br.close(); console.log(fails?`\n${fails} 項失敗`:'\n全部通過'); process.exit(fails?1:0) })();
