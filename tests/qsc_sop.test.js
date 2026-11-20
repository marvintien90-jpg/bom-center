/* 稽核加強＋SOP 手冊頁：照片、督導／自檢、SOP 標準提示、同步摘要到 qsc_audits、品牌深連結、SOP 只讀頁。node qsc_sop.test.js /abs/index.html */
const {chromium}=require('playwright'); const fs=require('fs'), path=require('path');
const SITE=process.argv[2], MOCK=fs.readFileSync(path.join(__dirname,'mock.js'),'utf8'), XL=fs.readFileSync(path.join(__dirname,'node_modules/xlsx/dist/xlsx.full.min.js'),'utf8');
let fails=0; const ok=(c,m)=>{ if(c) console.log('  ✓ '+m); else { fails++; console.log('  ✗ '+m) } };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SOP={title:'測試石鍋 門市 SOP 手冊',biz:'火鍋',ver:2,at:'2026-11-18T00:00:00Z',sections:[{name:'開店準備',when:'開店前 60 分鐘',steps:[{text:'打開冷藏冷凍設備確認溫度',std:'冷藏 0–7°C',role:'店長',audit:true,crit:true},{text:'檢查湯底備量',std:'',role:'廚房',audit:false}]},{name:'收銀與現金',steps:[{text:'交班點零用金',std:'差額 0 元',role:'收銀',audit:true}]}]};
async function open(br,role,w,hash,pre){ const ctx=await br.newContext({viewport:{width:w||1280,height:900}}); const pg=await ctx.newPage(); const errs=[];
  pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/*',r=>{ const u=r.request().url();
    if(u.includes('supabase-js')) return r.fulfill({contentType:'application/javascript',body:`window.__MOCK=${JSON.stringify({role})};\n`+MOCK+`\n;(${pre||'()=>{}'})(window.__db);`});
    if(u.includes('xlsx')) return r.fulfill({contentType:'application/javascript',body:XL});
    if(u.startsWith('file:')) return r.continue(); return r.fulfill({status:404,body:''}) });
  await pg.goto('file://'+SITE+(hash||'')); await sleep(600); return {pg,errs} }
const tab=async(pg,id)=>{ await pg.evaluate(id=>document.querySelector(`#nav [data-tab="${id}"]`).click(),id); await sleep(200) };
const main=pg=>pg.$eval('#main',e=>e.innerText);
const bad=t=>/NaN|undefined|\[object|Infinity|null 分/.test(t);
const click=async(pg,s)=>{ await pg.click(s); await sleep(150) };
const withSop=`db=>{ db.bom_brands[0].data.sop=${JSON.stringify(SOP)}; db.bom_brands[0].data.qscItems=[{id:'s1',cat:'品質',text:'冷藏冷凍設備溫度正確',std:'冷藏 0–7°C',sop:'開店準備',crit:true},{id:'s2',cat:'服務',text:'交班點零用金',std:'差額 0 元',sop:'收銀與現金'}] }`;
(async()=>{ const br=await chromium.launch();
  console.log('管理員：督導巡店＋照片＋同步');
  { const {pg,errs}=await open(br,'admin',1280,'',withSop);
    await tab(pg,'qsc'); await click(pg,'[data-qsnew]'); let t=await main(pg);
    ok(t.includes('標準：冷藏 0–7°C（SOP「開店準備」）'),'稽核項目顯示 SOP 標準'); ok(t.includes('關鍵項'),'關鍵項有標示');
    ok(await pg.$eval('[data-p="audits.0.kind"]',e=>e.value)==='supervisor','管理員預設「督導巡店」');
    await click(pg,'[data-qsv$="|s1|0"]'); await click(pg,'[data-qsv$="|s2|2"]');
    const fi=await pg.$('input[data-qsph$="|s1"]'); ok(!!fi,'不符合的項目有「拍照」');
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==','base64');
    await fi.setInputFiles({name:'a.png',mimeType:'image/png',buffer:png}); await sleep(600);
    const up=await pg.evaluate(()=>window.__up||[]);
    ok(up.length===1&&up[0].bk==='qsc-photos'&&/^b1\/a[^/]+\/s1-[a-z0-9]+\.jpg$/.test(up[0].p)&&up[0].type==='image/jpeg','照片壓成 JPEG 傳到 qsc-photos/品牌/稽核/');
    ok(await pg.evaluate(()=>B().audits[0].res.s1.ph.length===1),'照片路徑存進稽核紀錄');
    ok(await pg.evaluate(()=>!!document.querySelector('img[alt="缺失照片 1"]')),'顯示照片縮圖');
    await click(pg,'[data-qsphdel]'); ok((await main(pg)).includes('再按一次刪除'),'刪照片要按兩次');
    await click(pg,'[data-qsphdel]'); ok(await pg.isVisible('.kit-dlg'),'刪除前要輸入密碼');
    await pg.fill('.kit-dlg .kg-p','wrong'); await pg.click('.kit-dlg .kg-ok'); await sleep(200); ok((await pg.textContent('.kit-dlg .kg-e')).includes('密碼不對')&&await pg.evaluate(()=>B().audits[0].res.s1.ph.length===1),'密碼錯不會刪');
    await pg.fill('.kit-dlg .kg-p','pass1234'); await pg.click('.kit-dlg .kg-ok'); await sleep(300); ok(await pg.evaluate(()=>B().audits[0].res.s1.ph.length===0&&(window.__rm||[]).length===1),'照片刪除');
    await pg.$('input[data-qsph$="|s1"]').then(x=>x.setInputFiles({name:'b.png',mimeType:'image/png',buffer:png})); await sleep(600);
    await click(pg,'[data-qsdone]'); await sleep(500); t=await main(pg);
    ok(t.includes('督導巡店')&&t.includes('50'),'紀錄表有類型與分數');
    ok(await pg.evaluate(()=>!!document.querySelector('img[alt="缺失照片 1"]')),'改善追蹤也看得到照片');
    let rows=await pg.evaluate(()=>window.__db.qsc_audits||[]);
    ok(rows.length===1&&rows[0].brand_id==='b1'&&rows[0].kind==='supervisor'&&rows[0].score===50&&rows[0].open_count===1&&rows[0].bad_count===1&&rows[0].crit_fail===1,'摘要同步到 qsc_audits：'+JSON.stringify(rows[0]||{}));
    await click(pg,'[data-qsok$="|s1"]'); await sleep(400);
    rows=await pg.evaluate(()=>window.__db.qsc_audits);
    ok(rows[0].open_count===0,'改善完成後摘要更新');
    ok(!bad(await main(pg))&&!errs.length,'沒有錯誤'+(errs.length?'：'+errs.join('|'):''));
  }
  console.log('深連結 #qsc&b=b2');
  { const {pg,errs}=await open(br,'admin',1280,'#qsc&b=b2');
    ok(await pg.evaluate(()=>cur==='b2'&&tab==='qsc'),'直接開到第二品牌的門市稽核'); ok(!errs.length,'沒有錯誤') }
  console.log('進階版業主（手機）：門市自檢＋SOP 手冊');
  { const {pg,errs}=await open(br,'pro',375,'',withSop);
    await tab(pg,'sop'); let t=await main(pg);
    ok(t.includes('測試石鍋 門市 SOP 手冊')&&t.includes('第 2 版')&&t.includes('打開冷藏冷凍設備確認溫度')&&t.includes('負責：店長')&&t.includes('★'),'SOP 手冊頁顯示內容');
    await pg.fill('#sopq','零用金'); await sleep(250); t=await main(pg);
    ok(t.includes('找到 1 步')&&t.includes('交班點零用金')&&!t.includes('檢查湯底'),'搜尋 SOP');
    ok(await pg.evaluate(()=>document.activeElement&&document.activeElement.id==='sopq'),'搜尋時游標不跳掉');
    await pg.fill('#sopq',''); await sleep(200);
    ok((await main(pg)).includes('關鍵'),'SOP 頁標示關鍵項');
    await click(pg,'[data-soprole="廚房"]'); t=await main(pg); ok(t.includes('檢查湯底')&&!t.includes('交班點零用金')&&!t.includes('打開冷藏')&&t.includes('只顯示「廚房」'),'依職務只看自己的步驟');
    await click(pg,'[data-soprole="*"]'); t=await main(pg); ok(t.includes('交班點零用金')&&t.includes('檢查湯底'),'切回全部');
    await click(pg,'[data-sopsec="0"]'); t=await main(pg); ok(t.includes('打開冷藏')&&!t.includes('交班點零用金'),'可以只展開一個章節');
    await tab(pg,'qsc'); await click(pg,'[data-qsnew]');
    ok(await pg.$eval('[data-p="audits.0.kind"]',e=>e.value)==='self','業主預設「門市自檢」');
    ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'手機沒有水平捲動');
    await pg.screenshot({path:path.join(process.env.SHOT_DIR||require('os').tmpdir(),'sop-owner-mobile.png')});
    ok(!errs.length,'沒有錯誤'+(errs.length?'：'+errs.join('|'):'')) }
  console.log('基本版只讀：可看 SOP，不能拍照');
  { const {pg,errs}=await open(br,'basic',375,'',withSop);
    ok(await pg.evaluate(()=>allowed('sop')),'基本版可以看 SOP 手冊');
    await tab(pg,'sop'); ok((await main(pg)).includes('打開冷藏冷凍設備確認溫度'),'內容正常');
    ok(!errs.length,'沒有錯誤') }
  console.log('還沒交付手冊');
  { const {pg}=await open(br,'pro',1280); await tab(pg,'sop'); ok((await main(pg)).includes('顧問還沒有交付'),'空白提示') }
  await br.close(); console.log(fails?`\n${fails} 項失敗`:'\n全部通過'); process.exit(fails?1:0) })();
