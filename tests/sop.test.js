// SOP 手冊與督導總覽（consult/sop/）：權限、依業態建立、編輯存檔、交付到 BOM 品牌（稽核項目取代／合併）、Word/列印、複製、刪除、督導總覽。
// node tests/sop.test.js
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const html = fs.readFileSync(path.join(__dirname, '../consult/sop/index.html'), 'utf8');
const fake = (state) => `window.supabase={createClient(){const S=${JSON.stringify(state)};window.__S=S;let seq=100;
const q=(t)=>{S.tables[t]=S.tables[t]||[];let op='select',payload=null,f=[],one=false,maybe=false;
const o={select(){return o},eq(k,v){f.push([k,v]);return o},order(){return o},limit(){return o},
maybeSingle(){maybe=true;return o},single(){one=true;return o},
insert(p){op='insert';payload=p;return o},update(p){op='update';payload=p;return o},delete(){op='delete';return o},
then(res,rej){let rows=S.tables[t],out;const m=r=>f.every(([k,v])=>r[k]===v);
 if(S.fail===t) return Promise.resolve({data:null,error:{message:'relation does not exist'}}).then(res,rej);
 if(S.noProfile&&(op==='insert'||op==='update')&&[].concat(payload).some(p=>p&&'profile' in p)) return Promise.resolve({data:null,error:{message:"Could not find the 'profile' column of 'sop_manuals'"}}).then(res,rej);
 if(op==='select'){out=rows.filter(m)}
 else if(op==='insert'){const ts=new Date(Date.now()+(seq)).toISOString();out=[].concat(payload).map(p=>({id:seq++,status:'草稿',version:1,published_at:null,note:null,created_at:ts,updated_at:ts,...p}));rows.push(...out)}
 else if(op==='update'){out=rows.filter(m);out.forEach(r=>Object.assign(r,JSON.parse(JSON.stringify(payload))))}
 else if(op==='delete'){out=rows.filter(m);S.tables[t]=rows.filter(r=>!m(r))}
 out=JSON.parse(JSON.stringify(out));const data=(one||maybe)?(out[0]||null):out;return Promise.resolve({data,error:null}).then(res,rej)}};return o};
return {from:q,auth:{getSession:async()=>({data:{session:S.user?{user:S.user}:null}}),onAuthStateChange(){},signOut:async()=>{}}}}}`;
const A = { id: 'a1', email: 'boss@x.com' }, U = { id: 'u1', email: 'o@x.com' };
const d = n => new Date(Date.now() + 8 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const base = (user, role) => ({ user, tables: {
  bom_profiles: [{ user_id: user && user.id, role, status: 'active' }],
  bom_brands: [{ id: 'b1', name: '阿明麵館', rev: 3, data: { name: '阿明麵館', qscItems: [{ id: 'q1', cat: '品質', text: '舊項目' }], audits: [] } },
               { id: 'b2', name: '老店火鍋', rev: 7, data: { name: '老店火鍋', qscItems: [{ id: 'q1', cat: '品質', text: '舊項目' }], audits: [{ id: 'a9', done: true, res: { q1: { s: 2 } } }] } }],
  sop_manuals: [],
  qsc_audits: [
    { audit_id: 'x1', brand_id: 'b2', store: '中山店', audit_date: d(-40), kind: 'supervisor', score: 72, open_count: 0, overdue_count: 0 },
    { audit_id: 'x2', brand_id: 'b2', store: '中山店', audit_date: d(-5), kind: 'self', score: 64, open_count: 3, overdue_count: 2 },
    { audit_id: 'x3', brand_id: 'b1', store: '本店', audit_date: d(-3), kind: 'supervisor', score: 91, open_count: 1, overdue_count: 0 }] } });
let fail = 0; const check = (name, cond, extra) => { if (!cond) fail++; console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : (extra || '')) };
async function open(br, st, vw, hash) {
  const ctx = await br.newContext({ viewport: vw || { width: 1200, height: 900 }, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://sop.test' });
  const pg = await ctx.newPage(); pg.errs = [];
  pg.on('pageerror', e => pg.errs.push(e.message));
  await pg.route('**/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: fake(st) }));
  await pg.route('https://sop.test/', r => r.fulfill({ contentType: 'text/html', body: html }));
  await pg.route('**/checkup/score.js', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, '../checkup/score.js'), 'utf8') }));
  await pg.goto('https://sop.test/' + (hash || '')); await pg.waitForTimeout(250); return pg;
}
const txt = pg => pg.innerText('body');
const bad = t => /NaN|undefined|\[object|null/.test(t);
const SHOT = process.env.SHOT_DIR || require('os').tmpdir();
(async () => {
  const br = await chromium.launch();
  for (const [n, st, want] of [['未登入', { user: null, tables: {} }, '請先登入'], ['業主', base(U, 'client'), '只開放顧問使用']]) {
    const pg = await open(br, st); const t = await txt(pg); check('擋 ' + n, t.includes(want) && !pg.errs.length, pg.errs.join(';')); await pg.close();
  }
  { const st = base(A, 'admin'); st.fail = 'sop_manuals'; const pg = await open(br, st); check('資料表未安裝提示', (await txt(pg)).includes('資料表還沒建立')); await pg.close() }
  let pg = await open(br, base(A, 'admin'));
  let t = await txt(pg);
  check('空白首頁', t.includes('還沒有 SOP 手冊') && t.includes('新增第一本手冊'), t.slice(0, 200));
  // 建立：麵食
  await pg.click('text=＋ 新增第一本手冊'); await pg.waitForTimeout(100);
  await pg.click('label:has-text("麵食／拉麵")'); await pg.waitForTimeout(80);
  await pg.fill('#n_client', '阿明麵館'); await pg.selectOption('#n_brand', 'b1');
  await pg.click('label:has-text("異常與客訴處理")'); await pg.waitForTimeout(80); // 取消一章
  check('預設外送 30% 以下 → 建議外送章節', (await txt(pg)).includes('外送與外帶') && (await txt(pg)).includes('依店況建議'));
  await pg.click('label.chip:has-text("幾乎沒有")'); await pg.waitForTimeout(80); // 沒有外送 → 不加外送章
  check('切換業態不會清掉已填的客戶', await pg.inputValue('#n_client') === '阿明麵館');
  await pg.click('[data-create]'); await pg.waitForTimeout(250);
  let m = await pg.evaluate(() => window.__S.tables.sop_manuals[0]);
  check('建立手冊（8 章、含麵食步驟）', m && m.title === '阿明麵館 門市 SOP 手冊' && m.biz_type === '麵食／拉麵' && m.brand_id === 'b1' && m.sections.length === 8
    && m.sections.some(s => s.steps.some(x => x.text === '煮麵計時')) && !m.sections.some(s => s.name === '異常與客訴處理'), JSON.stringify(m && m.sections.map(s => s.name)));
  t = await txt(pg);
  check('進入編輯頁', t.includes('交付到門市') && t.includes('已建立「阿明麵館 門市 SOP 手冊」') && (await pg.$$('.sec')).length === 8);
  // 編輯
  const f0 = '.sec[data-si="0"] .st[data-ti="0"]';
  await pg.fill(f0 + ' textarea[data-f=text]', '店長 9:30 到店解除保全'); 
  check('修改後顯示未存', (await pg.innerText('.sticky')).includes('有修改還沒存'));
  await pg.click(f0 + ' [data-f=audit]'); // 勾稽核
  await pg.selectOption(f0 + ' [data-f=role]', '副店長');
  await pg.click('.sec[data-si="1"] [data-addt]'); await pg.waitForTimeout(80);
  check('加步驟後游標在新步驟', await pg.evaluate(() => document.activeElement.dataset.f === 'text' && document.activeElement.closest('.sec').dataset.si === '1'));
  await pg.keyboard.type('冰箱除霜');
  await pg.click('[data-mv="0|1|-1"]'); await pg.waitForTimeout(60);
  await pg.click('[data-dt="0|7"]'); await pg.waitForTimeout(60); check('刪步驟要按兩次', (await pg.innerText('.sec[data-si="0"]')).includes('確定刪除'));
  await pg.click('[data-dt="0|7"]'); await pg.waitForTimeout(60);
  await pg.click('[data-adds]'); await pg.waitForTimeout(60);
  await pg.fill('.sec[data-si="8"] header [data-sf=name]', '外送平台作業');
  await pg.click('[data-save]'); await pg.waitForTimeout(250);
  m = await pg.evaluate(() => window.__S.tables.sop_manuals[0]);
  const s0 = m.sections[0].steps;
  check('儲存：改字、角色、稽核、排序、刪除、加章節', s0.length === 7 && s0[1].text === '店長 9:30 到店解除保全' && s0[1].role === '副店長' && s0[1].audit === true
    && m.sections[1].steps.slice(-1)[0].text === '冰箱除霜' && m.sections[8].name === '外送平台作業' && m.updated_by === 'boss@x.com', JSON.stringify(s0.slice(0, 2)));
  check('存好後沒有未存標記', !(await pg.innerText('.sticky')).includes('有修改還沒存') && (await txt(pg)).includes('已儲存'));
  // 預覽與 Word 下載
  await pg.click('text=手冊預覽／列印'); await pg.waitForTimeout(150); t = await txt(pg);
  check('預覽頁（封面、目錄、店況、章節表）', t.includes('目錄') && t.includes('9. 外送平台作業') && t.includes('品牌加辣餐飲顧問工作室') && t.includes('本店狀況與手冊設計重點') && t.includes('桌邊點餐') && !bad(t));
  await pg.screenshot({ path: path.join(SHOT, 'sop-doc.png'), fullPage: false });
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-word]')]);
  const wf = await dl.path(); const wd = fs.readFileSync(wf, 'utf8');
  check('下載 Word', (await pg.evaluate(()=>1)) && wd.includes('煮麵計時') && wd.includes('<table border="1"') && wd.includes('★ 店長 9:30'), dl.suggestedFilename()+' '+wd.includes('煮麵計時')+wd.includes('<table border="1"')+wd.includes('★ 店長 9:30'));
  await pg.click('text=← 回編輯'); await pg.waitForTimeout(100);
  await pg.click('[data-copytxt]'); await pg.waitForTimeout(100);
  const clip = await pg.evaluate(() => navigator.clipboard.readText());
  check('複製文字', clip.includes('【1. 開店準備】') && clip.includes('★ 店長 9:30 到店解除保全｜標準：開店前 60 分鐘到店｜副店長'), clip.slice(0, 120));
  // 交付 b1（無已完成稽核 → 取代）
  await pg.click('[data-pub]'); await pg.waitForTimeout(60); check('交付要按兩次', (await pg.innerText('[data-pub]')).includes('再按一次'));
  await pg.click('[data-pub]'); await pg.waitForTimeout(300);
  let b1 = await pg.evaluate(() => window.__S.tables.bom_brands[0]); m = await pg.evaluate(() => window.__S.tables.sop_manuals[0]);
  const na = m.sections.reduce((s, x) => s + x.steps.filter(y => y.audit).length, 0);
  check('交付：品牌寫入 SOP、rev+1', b1.rev === 4 && b1.data.sop && b1.data.sop.ver === 1 && b1.data.sop.sections.length === 9 && b1.data.sop.title === m.title);
  check('交付：沒有稽核紀錄 → 稽核項目換成手冊稽核點', b1.data.qscItems.length === na && b1.data.qscItems.every(i => i.id.startsWith('sop-') && i.sop && i.cat) && b1.data.qscItems.some(i => i.text === '煮麵計時' && i.cat === '品質'), b1.data.qscItems.length + '/' + na);
  check('手冊狀態變已交付', m.status === '已交付' && m.version === 1 && m.published_at && (await txt(pg)).includes('已交付第 1 版到「阿明麵館」'));
  // 再交付 → v2
  await pg.fill('.sec[data-si="2"] .st[data-ti="0"] [data-f=std]', '份量照食譜卡，每碗麵 180 g'); 
  await pg.click('[data-pub]'); await pg.click('[data-pub]'); await pg.waitForTimeout(300);
  b1 = await pg.evaluate(() => window.__S.tables.bom_brands[0]); m = await pg.evaluate(() => window.__S.tables.sop_manuals[0]);
  check('修改後再交付：先存檔、版本 +1', m.version === 2 && b1.data.sop.ver === 2 && b1.data.sop.sections[2].steps[0].std === '份量照食譜卡，每碗麵 180 g' && b1.rev === 5);
  // 複製一份 → 對應 b2（有稽核紀錄 → 合併）
  await pg.click('[data-dup]'); await pg.waitForTimeout(250);
  t = await txt(pg); check('複製一份', t.includes('已複製一份') && (await pg.inputValue('#e_title')).includes('（複本）'));
  const ids = await pg.evaluate(() => window.__S.tables.sop_manuals.map(x => x.sections[0].steps[0].id));
  check('複本的步驟 id 是新的', ids[0] !== ids[1], ids.join());
  await pg.selectOption('#e_brand', 'b2'); await pg.waitForTimeout(80);
  await pg.click('[data-pub]'); await pg.click('[data-pub]'); await pg.waitForTimeout(300);
  const b2 = await pg.evaluate(() => window.__S.tables.bom_brands[1]);
  check('交付到有稽核紀錄的品牌 → 保留舊項目再加上手冊稽核點', b2.data.qscItems[0].id === 'q1' && b2.data.qscItems.length === na + 1 && b2.data.audits.length === 1 && b2.rev === 8, b2.data.qscItems.length);
  // 督導總覽
  await pg.click('text=督導總覽'); await pg.waitForTimeout(150); t = await txt(pg);
  check('督導總覽統計', (await pg.$$eval('.stat b', b => b.map(x => x.textContent))).join() === '2,78,0,2,1', (await pg.$$eval('.stat b', b => b.map(x => x.textContent))).join());
  const rows = await pg.$$eval('tbody tr', r => r.map(x => x.innerText));
  check('督導總覽：逾期的排第一、分數比上次、趨勢、深連結', rows[0].includes('老店火鍋') && rows[0].includes('中山店') && rows[0].includes('64') && rows[0].includes('-8') && rows[0].includes('30 天沒督導') && rows[0].includes('督導 0・自檢 1') && rows[1].includes('阿明麵館') && rows[1].includes('91'), rows.join(' / '));
  check('巡店連結帶品牌', await pg.$eval('tbody tr a', a => a.href).then(h => h.endsWith('#qsc&b=b2')));
  check('有趨勢圖', await pg.$$eval('svg.spark', s => s.length) === 1);
  check('督導總覽沒有錯誤字樣', !bad(t));
  // 首頁清單
  await pg.click('nav >> text=SOP 手冊'); await pg.waitForTimeout(100); t = await txt(pg);
  check('首頁清單', t.includes('阿明麵館 門市 SOP 手冊') && t.includes('已交付 v2') && t.includes('（複本）') && (await pg.$$eval('.stat b', b => b.map(x => x.textContent))).slice(0, 3).join() === '2,2,0');
  await pg.screenshot({ path: path.join(SHOT, 'sop-home.png') });
  // 刪除複本
  await pg.click('tbody tr:nth-child(1) a.btn'); await pg.waitForTimeout(120);
  const title = await pg.inputValue('#e_title');
  await pg.click('[data-delm]'); await pg.click('[data-delm]'); await pg.waitForTimeout(250);
  check('刪除手冊', (await pg.evaluate(() => window.__S.tables.sop_manuals.length)) === 1 && (await txt(pg)).includes('已刪除手冊'), title);
  check('顧問頁沒有頁面錯誤', !pg.errs.length, pg.errs.join(';'));
  // 手機
  const mp = await open(br, base(A, 'admin'), { width: 375, height: 800 }, '#new');
  await mp.click('[data-create]'); await mp.waitForTimeout(250);
  check('手機：編輯頁沒有水平捲動', await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await mp.screenshot({ path: path.join(SHOT, 'sop-edit-mobile.png') });
  await mp.goto('https://sop.test/#audit'); await mp.waitForTimeout(250);
  check('手機：督導總覽沒有水平捲動', await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  check('手機沒有頁面錯誤', !mp.errs.length, mp.errs.join(';'));
  // ===== v2：店況問卷、健檢帶入、BOM 菜單、專業度、檢核表、訓練表、關鍵項 =====
  {
    const st = base(A, 'admin');
    st.tables.checkup_leads = [{ id: 7, brand: '小王熱炒', biz_type: '中式餐館', stores: 3, total: 41, created_at: '2026-11-10T00:00:00Z', answers: { p1: 0, p2: 2, p3: 2, p4: 2, p5: 1, h1: 1, h2: 2, h3: 3, h4: 0, m3: 1 } }];
    st.tables.coach_clients = [{ id: 5, name: '小王熱炒', biz_type: '中式餐館', stores: 3, brand_id: 'b1', lead_id: 7 }];
    st.tables.bom_brands[0].data.ingredients = [{ id: 'i1', name: '牛五花', unit: '克' }, { id: 'i2', name: '高麗菜', unit: '克' }];
    st.tables.bom_brands[0].data.semis = [{ id: 's1', name: '招牌醬', unit: '克' }];
    st.tables.bom_brands[0].data.items = [{ id: 'm1', name: '沙茶牛肉', cat: '熱炒', price: 220, monthlySales: 300, lines: [{ ref: 'i:i1', qty: 120 }, { ref: 'i:i2', qty: 80 }, { ref: 's:s1', qty: 15 }] }, { id: 'm2', name: '炒高麗菜', price: 120, monthlySales: 500, lines: [{ ref: 'i:i2', qty: 250 }] }, { id: 'm3', name: '白飯', price: 15, lines: [] }];
    const p = await open(br, st, null, '#new&client=5'); let t = await txt(p);
    check('v2 從顧問客戶帶入：業態、店數、健檢低分題', await p.$eval('input[data-nt]:checked', e => e.value) === '中式熱炒／餐館' && await p.$eval('input[name=pf_stage]:checked', e => e.value) === '2–5 店' && t.includes('已帶入健檢結果') && await p.inputValue('#n_client') === '小王熱炒', t.slice(0, 400));
    for (const c of ['櫃台點餐', '1–3 人', '中央廚房配送', '30% 以上', '油炸機', '有賣酒', '出餐慢', '開放加盟']) { await p.click(`label.chip:has-text("${c}")`); await p.waitForTimeout(40) }
    t = await txt(p); check('v2 預覽數字會跟著店況變', /預覽：\d+ 章/.test(t) && t.includes('多店標準與督導') && t.includes('中央廚房配送與復熱'));
    await p.click('[data-create]'); await p.waitForTimeout(250);
    let m = await p.evaluate(() => window.__S.tables.sop_manuals.slice(-1)[0]); const S = n => m.sections.find(x => x.name === n), T = (n, x) => (S(n) || { steps: [] }).steps.find(y => y.text === x);
    check('v2 章節依店況產生', m.sections[0].name === '本店優先改善' && ['中央廚房配送與復熱', '外送與外帶', '新人訓練與上線檢核', '多店標準與督導'].every(S) && m.coach_client_id === 5 && m.biz_type === '中式熱炒／餐館', m.sections.map(x => x.name).join());
    check('v2 櫃台型：拿掉桌邊服務、加櫃台點餐', !T('外場服務流程', '迎賓') && !T('外場服務流程', '巡桌') && T('外場服務流程', '櫃台點餐') && T('外場服務流程', '櫃台點餐').why.includes('櫃台'));
    check('v2 人少：零用金改拍照存證、加一人多工', T('收銀與現金管理', '開店點收零用金').std.includes('拍照') && T('開店準備', '一人多工分工'));
    check('v2 設備與特性：炸油（關鍵項）、酒類', T('出餐品質標準', '炸油管理') && T('出餐品質標準', '炸油管理').crit && T('收銀與現金管理', '酒類販售'));
    const f = S('本店優先改善').steps;
    check('v2 痛點＋健檢 → 優先改善附 KPI 與原因', f.some(x => x.text === '尖峰出餐時間' && x.std.includes('12 分鐘') && x.why.includes('店況問卷')) && f.some(x => x.text === '每日開店試吃' && x.why.startsWith('健檢')) && f.some(x => x.text === '食安關鍵點每日檢查') && f.some(x => x.text === '巡店稽核追到完成') && f.some(x => x.text === '網路評價回覆'), f.map(x => x.text + '/' + x.why).join(' | '));
    check('v2 加盟：加指定品項進貨', T('多店標準與督導', '指定品項進貨'));
    check('v2 店況存檔', m.profile && m.profile.svc === '櫃台點餐' && m.profile.ck.length >= 4 && m.profile.lead === 7, JSON.stringify(m.profile));
    t = await txt(p); check('v2 編輯頁：店況、專業度、為什麼', t.includes('店況') && t.includes('專業度檢查') && t.includes('為什麼有這條'));
    // BOM 菜單 → 出餐標準卡
    await p.click('[data-rec]'); await p.waitForTimeout(250);
    t = await txt(p); check('v2 帶入 BOM 出餐標準卡', t.includes('已帶入 2 道菜') && await p.$$eval('[data-sf=name]', a => a.some(x => x.value === '出餐標準卡（份量）')), p.errs.join(';'));
    await p.click('[data-save]'); await p.waitForTimeout(250);
    m = await p.evaluate(() => window.__S.tables.sop_manuals.slice(-1)[0]); const rc = m.sections.find(x => x.key === 'recipe');
    check('v2 出餐標準卡內容：依銷量排序、份量、售價', rc && rc.steps[0].text === '炒高麗菜' && rc.steps[1].std === '牛五花 120 克、高麗菜 80 克、招牌醬 15 克｜售價 220 元' && rc.steps[0].audit && m.sections.indexOf(rc) === m.sections.findIndex(x => x.key === 'serve') + 1, rc && JSON.stringify(rc.steps.slice(0, 2)));
    // 專業度：清空一個稽核點的標準
    const score = () => p.$eval('.card h2 .pill', e => +e.textContent.replace(/\D/g, ''));
    const pc0 = await score();
    await p.fill('.sec[data-si="1"] .st[data-ti="1"] [data-f=std]', ''); await p.click('[data-save]'); await p.waitForTimeout(250);
    t = await txt(p); const pc1 = await score();
    check('v2 專業度檢查抓到沒寫標準的稽核點', t.includes('沒有寫標準，稽核時無法判斷合不合格') && pc1 < pc0, pc0 + '→' + pc1);
    await p.click('.issues li.bad .linkb'); await p.waitForTimeout(100);
    check('v2 點問題會跳到那一條', await p.evaluate(() => document.activeElement && document.activeElement.dataset.f === 'std'));
    // 改店況 → 補上建議步驟
    await p.click('summary:has-text("修改店況")'); await p.click('label.chip:has-text("有生食")'); await p.waitForTimeout(80);
    t = await txt(p); check('v2 改店況後出現補上建議', /依店況補上 \d+ 個建議步驟/.test(t) && (await p.$('details[open]')) !== null);
    await p.click('[data-sug]'); await p.click('[data-save]'); await p.waitForTimeout(250);
    m = await p.evaluate(() => window.__S.tables.sop_manuals.slice(-1)[0]);
    check('v2 補上的步驟有原因、不重複', m.sections.some(x => x.steps.some(y => y.text === '生食管理' && y.why === '有供應生食')) && m.profile.extra.includes('有生食') && !(await txt(p)).includes('依店況補上'));
    // 每日檢核表、新人訓練表
    await p.click('.sticky >> text=每日檢核表'); await p.waitForTimeout(150); t = await txt(p);
    check('v2 每日檢核表', t.includes('每日檢核表') && t.includes('店長簽名') && t.includes('開店準備') && !t.includes('出餐標準卡') && (await p.$$('table.ck th.d')).length >= 7 && !bad(t));
    await p.screenshot({ path: path.join(SHOT, 'sop-check.png'), fullPage: false });
    await p.click('a.btn:has-text("新人訓練表")'); await p.waitForTimeout(150); await p.selectOption('[data-trole]', '外場'); await p.waitForTimeout(120); t = await txt(p);
    check('v2 新人訓練表依職務', t.includes('新人訓練表｜外場') && t.includes('上線核准') && t.includes('外送單核對') && !t.includes('一人多工分工') && !bad(t));
    const [d2] = await Promise.all([p.waitForEvent('download'), p.click('[data-word]')]); const w2 = fs.readFileSync(await d2.path(), 'utf8');
    check('v2 訓練表可下載 Word', w2.includes('新人訓練表') && w2.includes('外送單核對'));
    await p.click('text=← 回編輯'); await p.waitForTimeout(100);
    // 交付 → 關鍵項帶到稽核
    await p.click('[data-pub]'); await p.click('[data-pub]'); await p.waitForTimeout(300);
    const b1 = await p.evaluate(() => window.__S.tables.bom_brands[0]);
    check('v2 交付：關鍵項帶進門市稽核與 SOP', b1.data.qscItems.some(i => i.text === '炸油管理' && i.crit === true) && b1.data.qscItems.some(i => i.crit === false) && b1.data.sop.sections.some(s => s.steps.some(x => x.crit)));
    check('v2 沒有頁面錯誤', !p.errs.length, p.errs.join(';'));
    await p.screenshot({ path: path.join(SHOT, 'sop-v2-edit.png'), fullPage: false });
    // 從健檢名單帶入（不是顧問客戶）
    await p.goto('https://sop.test/#new'); await p.waitForTimeout(200);
    await p.selectOption('#n_src', 'l:7'); await p.waitForTimeout(100);
    check('v2 從健檢名單帶入', await p.inputValue('#n_client') === '小王熱炒' && (await txt(p)).includes('已帶入健檢結果'));
    await p.close();
  }
  { // 資料庫還沒有 profile 欄位：店況改存在備註，照樣能建、能讀
    const st = base(A, 'admin'); st.noProfile = true;
    const p = await open(br, st, null, '#new');
    await p.click('label.chip:has-text("自助取餐")'); await p.fill('#n_client', '甲'); await p.click('[data-create]'); await p.waitForTimeout(300);
    const m = await p.evaluate(() => window.__S.tables.sop_manuals[0]);
    check('v2 沒有 profile 欄位也能建立（店況存在備註）', m && !('profile' in m) && m.note.includes('#店況:') && m.note.includes('自助取餐'), JSON.stringify(m && m.note));
    const t = await txt(p); check('v2 備註欄不顯示店況 JSON', (await p.inputValue('#e_note')) === '' && t.includes('自助取餐'));
    await p.fill('#e_note', '內部'); await p.click('[data-save]'); await p.waitForTimeout(250);
    const m2 = await p.evaluate(() => window.__S.tables.sop_manuals[0]);
    check('v2 沒有 profile 欄位也能儲存', m2.note.startsWith('內部') && m2.note.includes('自助取餐') && !p.errs.length, m2.note + p.errs.join(';'));
    await p.close();
  }
  await br.close(); console.log(fail ? `\n${fail} 項失敗` : '\n全部通過'); process.exit(fail ? 1 : 0);
})();
