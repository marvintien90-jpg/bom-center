// 加盟體系冒煙測試：權限、建立方案、準備度、模式、試算（含損益中心帶入）、揭露書、門市、繳款、督導、燈號、刪除、手機寬度。
// node tests/franchise.test.js
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const html = fs.readFileSync(path.join(__dirname, '../consult/franchise/index.html'), 'utf8');
const fake = (state) => `window.supabase={createClient(){const S=${JSON.stringify(state)};window.__S=S;let seq=1000;
const q=(t)=>{let op='select',payload=null,conf=null,f=[],one=false,maybe=false;
const o={select(){return o},eq(k,v){f.push([k,v]);return o},order(){return o},limit(){return o},
maybeSingle(){maybe=true;return o},single(){one=true;return o},
insert(p){op='insert';payload=p;return o},update(p){op='update';payload=p;return o},upsert(p,c){op='upsert';payload=p;conf=c&&c.onConflict;return o},delete(){op='delete';return o},
then(res,rej){if(!S.tables[t])return Promise.resolve({data:null,error:{message:'relation does not exist'}}).then(res,rej);let rows=S.tables[t],out;const m=r=>f.every(([k,v])=>r[k]===v);
 if(op==='select'){out=rows.filter(m)}
 else if(op==='insert'){out=[].concat(payload).map(p=>({id:seq++,closed:false,status:'營運中',kind:'加盟',royalty_mode:'pct',data:{},...JSON.parse(JSON.stringify(p))}));rows.push(...out)}
 else if(op==='update'){out=rows.filter(m);out.forEach(r=>Object.assign(r,JSON.parse(JSON.stringify(payload))))}
 else if(op==='upsert'){const keys=conf.split(',');out=[].concat(payload).map(p=>{let r=rows.find(x=>keys.every(k=>x[k]===p[k]));if(r)Object.assign(r,p);else{r={id:seq++,...p};rows.push(r)}return r})}
 else if(op==='delete'){out=rows.filter(m);S.tables[t]=rows.filter(r=>!m(r))}
 const data=(one||maybe)?(out[0]||null):out;return Promise.resolve({data,error:null}).then(res,rej)}};return o};
return {from:q,rpc:async(n,a)=>({data:n==='coach_pl_clients'?S.pl.clients:S.pl.months,error:null}),
 auth:{getSession:async()=>({data:{session:S.user?{user:S.user}:null}}),onAuthStateChange(){},signOut:async()=>{}}}}}`;
const A = { id: 'a1', email: 'boss@x.com' }, U = { id: 'u1', email: 'o@x.com' };
const d = n => new Date(Date.now() + 8 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const mAgo = n => { const x = new Date(Date.now() + 8 * 3600e3); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() - n); return x.toISOString().slice(0, 7) + '-01' };
const base = (user, role) => ({ user, pl: { clients: [{ client_name: '阿明麵館', brand_name: '阿明' }], months: [
  { month: mAgo(3), revenue: 500000, food_pct: 34, labor_pct: 26, rent_pct: 10, net_pct: 12 },
  { month: mAgo(2), revenue: 600000, food_pct: 36, labor_pct: 24, rent_pct: 10, net_pct: 14 },
  { month: mAgo(1), revenue: 700000, food_pct: 35, labor_pct: 25, rent_pct: 10, net_pct: 15 }] },
  tables: { bom_profiles: [{ user_id: user && user.id, role, status: 'active' }], bom_brands: [{ id: 'aming', name: '阿明麵館' }],
    coach_clients: [{ id: 5, name: '阿明麵館', brand_id: 'aming', pl_client: '阿明麵館', pl_brand: '阿明' }],
    qsc_audits: [{ brand_id: 'aming', store: '老店', audit_date: d(-5), score: 65 }],
    fr_plans: [{ id: 1, name: '老品牌', status: '營運中', data: { model: { visitDays: 30 } } }],
    fr_stores: [{ id: 10, plan_id: 1, name: '老店', kind: '加盟', status: '營運中', open_on: d(-400), contract_end: d(40), royalty_mode: 'pct', royalty_value: 5, mkt_pct: 1, brand_id: 'aming' }],
    fr_visits: [{ id: 30, store_id: 10, visit_on: d(-70), kind: '督導訪店', actions: '冰箱除霜', due_on: d(-10), closed: false }],
    fr_dues: [{ id: 40, store_id: 10, month: mAgo(1), sales: 500000, royalty: 25000, mkt: 5000, paid: 20000 }] } });
let fail = 0; const check = (name, cond, extra) => { if (!cond) fail++; console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : (extra || '')) };
async function open(br, st, vw, hash) {
  const pg = await br.newPage({ viewport: vw || { width: 1200, height: 900 } }); pg.errs = [];
  pg.on('pageerror', e => pg.errs.push(e.message));
  await pg.route('**/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: fake(st) }));
  await pg.route('https://fr.test/', r => r.fulfill({ contentType: 'text/html', body: html }));
  await pg.goto('https://fr.test/' + (hash || '')); await pg.waitForTimeout(250); return pg;
}
const txt = pg => pg.innerText('body');
const bad = t => /NaN|undefined|\[object/.test(t);
(async () => {
  const br = await chromium.launch();
  for (const [n, st, want] of [['未登入', { user: null, tables: {}, pl: {} }, '請先登入'], ['業主', base(U, 'client'), '只開放顧問使用']]) {
    const pg = await open(br, st); const t = await txt(pg);
    check('擋 ' + n, t.includes(want) && !t.includes('老品牌') && !pg.errs.length, pg.errs.join(';')); await pg.close();
  }
  { const st = base(A, 'admin'); delete st.tables.fr_plans; const pg = await open(br, st); check('資料表未建提示', (await txt(pg)).includes('資料表還沒建立')); await pg.close() }
  let pg = await open(br, base(A, 'admin'));
  let t = await txt(pg);
  check('首頁警示', t.includes('要處理的門市') && t.includes('改善逾期') && t.includes('權利金未繳') && t.includes('QSC 65') && t.includes('合約 40 天後到期'), t.slice(0, 600));
  check('首頁無 NaN', !bad(t) && !pg.errs.length, pg.errs.join(';'));
  // 新增方案（從營運輔導帶入）
  await pg.click('text=＋ 新增加盟方案'); await pg.selectOption('#f_coach', '5');
  check('輔導客戶帶入', await pg.inputValue('#f_name') === '阿明麵館' && await pg.inputValue('#f_brand') === 'aming' && await pg.inputValue('#f_pl') === '阿明麵館｜阿明');
  await pg.click('[data-saveplan="new"]'); await pg.waitForTimeout(200); await pg.click('nav.tabs >> text=① 準備度'); await pg.waitForTimeout(100);
  const P = () => pg.evaluate(() => window.__S.tables.fr_plans.find(p => p.name === '阿明麵館'));
  let p = await P(); check('建立方案', p && p.coach_client_id === 5 && p.pl_client === '阿明麵館' && p.pl_brand === '阿明', JSON.stringify(p));
  // 準備度：全部做到，但商標(關鍵)沒有
  const keys = await pg.$$eval('[data-ready]', e => [...new Set(e.map(x => x.dataset.ready))]);
  for (const k of keys) await pg.click(`label:has(input[name="r_${k}"][value="${k === 'l1' ? 0 : 2}"])`);
  await pg.waitForTimeout(800); t = await txt(pg);
  check('關鍵題擋下', t.includes('先不要開放加盟') && t.includes('建議模式：直營') && t.includes('立即申請商標'), t.slice(0, 800));
  await pg.click('label:has(input[name="r_l1"][value="2"])'); await pg.waitForTimeout(800); t = await txt(pg);
  check('全部做到 → 可以開放', t.includes('100%') && t.includes('可以開放加盟') && t.includes('建議模式：一般加盟'));
  p = await P(); check('準備度存檔', p.data.ready && p.data.ready.l1 === 2 && Object.keys(p.data.ready).length === keys.length, JSON.stringify(p.data));
  // 模式
  await pg.click('nav.tabs >> text=② 模式與條件'); await pg.waitForTimeout(100);
  await pg.click('label.model:has-text("委託加盟")'); await pg.fill('#x_model_years', '7'); await pg.fill('#x_model_radius', '800'); await pg.waitForTimeout(800);
  p = await P(); check('模式存檔', p.data.model.type === '委託加盟' && p.data.model.years === 7 && p.data.model.radius === 800, JSON.stringify(p.data.model));
  // 試算
  await pg.click('nav.tabs >> text=③ 費用與回本'); await pg.waitForTimeout(150); t = await txt(pg);
  // 預設：rev 60萬，food35 labor25 util5 mkt1 roy4 → 變動 30% =180000；扣 rent60000 other10000 → 110000；投資 160 萬 → 14.5 月
  check('預設試算', t.includes('14.5 個月') && t.includes('$110,000') && t.includes('$1,600,000'), t.slice(0, 1500));
  check('總部每店', t.includes('$24,000') && t.includes('$18,900') && t.includes('$34,900') && t.includes('$120,000'), '');
  await pg.click('[data-plfill]'); await pg.waitForTimeout(800); t = await txt(pg);
  p = await P(); check('損益中心帶入', p.data.calc.rev === 600000 && p.data.calc.food === 35 && p.data.calc.rent === 60000 && t.includes('已帶入 3 個月'), JSON.stringify(p.data.calc));
  await pg.fill('#x_calc_rev', '200000'); await pg.waitForTimeout(700); t = await txt(pg);
  check('營收太低警示', t.includes('無法回本') && t.includes('加盟主每月虧損') && !bad(t));
  await pg.fill('#x_calc_rev', '600000'); await pg.selectOption('#x_calc_royMode', 'fixed'); await pg.waitForTimeout(700);
  check('固定權利金欄位', !!(await pg.$('#x_calc_royFix')) && !(await pg.$('#x_calc_royPct')));
  await pg.selectOption('#x_calc_royMode', 'pct'); await pg.waitForTimeout(700);
  check('試算無 NaN', !bad(await txt(pg)) && !pg.errs.length, pg.errs.join(';'));
  // 合約與揭露
  await pg.click('nav.tabs >> text=④ 合約與揭露'); await pg.waitForTimeout(100);
  await pg.selectOption('[data-ck="d0"]', '已完成'); await pg.fill('[data-cknote="d1"]', '第 5 條'); await pg.press('[data-cknote="d1"]', 'Tab'); await pg.waitForTimeout(800);
  t = await txt(pg); p = await P();
  check('合約清單', p.data.contract.d0.st === '已完成' && p.data.contract.d1.note === '第 5 條' && t.includes('完成 1／24'), JSON.stringify(p.data.contract));
  check('揭露書帶入', t.includes('加盟期間 7 年') && t.includes('半徑 800 公尺') && t.includes('加盟金：$150,000') && t.includes('營業額的 4%') && t.includes('10 天前'), '');
  // 門市
  await pg.click('nav.tabs >> text=⑥ 加盟店督導'); await pg.waitForTimeout(100);
  check('預設類型跟模式', await pg.inputValue('#n_kind') === '委託加盟');
  await pg.fill('#n_name', '逢甲店'); await pg.fill('#n_owner', '小王'); await pg.fill('#n_open', d(-100)); await pg.click('[data-addstore]'); await pg.waitForTimeout(200);
  const S = () => pg.evaluate(() => window.__S.tables.fr_stores.find(s => s.name === '逢甲店'));
  let s = await S(); check('新增門市', s && s.royalty_value === 4 && s.mkt_pct === 1 && s.brand_id === 'aming' && s.contract_end === new Date(Date.parse(d(-100)) + (Math.round(7 * 365.25) - 1) * 864e5).toISOString().slice(0, 10) && s.status === '營運中', JSON.stringify(s));
  t = await txt(pg); check('門市卡片', t.includes('逢甲店') && t.includes('營業額未回報'), t.slice(-500));
  await pg.click('a.cl:has-text("逢甲店")'); await pg.waitForTimeout(150);
  await pg.fill('#d_month', mAgo(1).slice(0, 7)); await pg.fill('#d_sales', '500000'); await pg.click('[data-savedue]'); await pg.waitForTimeout(200);
  let du = await pg.evaluate(id => window.__S.tables.fr_dues.find(x => x.store_id === id), s.id);
  t = await txt(pg); check('權利金自動算', du && du.royalty === 20000 && du.mkt === 5000 && t.includes('應繳 $25,000') && t.includes('欠 $25,000'), JSON.stringify(du));
  await pg.click(`[data-editdue="${du.id}"]`); await pg.fill('#d_paid', '25000'); await pg.click('[data-savedue]'); await pg.waitForTimeout(200);
  du = await pg.evaluate(id => window.__S.tables.fr_dues.find(x => x.store_id === id), s.id);
  t = await txt(pg); check('繳清', du.paid === 25000 && du.sales === 500000 && t.includes('結清'), JSON.stringify(du));
  await pg.fill('#v_qsc', '72'); await pg.fill('#v_act', '廁所清潔表'); await pg.fill('#v_due', d(7)); await pg.click('[data-savevisit]'); await pg.waitForTimeout(200);
  t = await txt(pg); check('督導紀錄＋QSC 注意', t.includes('QSC 72') && t.includes('注意'), t.slice(0, 500));
  await pg.click('[data-closev]'); await pg.waitForTimeout(150); check('標記已改善', (await txt(pg)).includes('已改善'));
  await pg.fill('#v_qsc', '120'); await pg.click('[data-savevisit]'); await pg.waitForTimeout(100); check('QSC 範圍', (await txt(pg)).includes('0 到 100'));
  await pg.fill('#s_owner', '王小明'); await pg.selectOption('#s_status', '輔導改善'); await pg.click('[data-savestore]'); await pg.waitForTimeout(150);
  s = await S(); check('編輯門市', s.owner_name === '王小明' && s.status === '輔導改善');
  check('門市頁無錯', !bad(await txt(pg)) && !pg.errs.length, pg.errs.join(';'));
  await pg.screenshot({ path: path.join(__dirname, 'franchise-store.png'), fullPage: true });
  // 刪除門市（兩次確認）
  await pg.click('[data-dels]'); check('刪除需確認', (await txt(pg)).includes('再按一次確定刪除'));
  await pg.click('[data-dels]'); await pg.waitForTimeout(300); check('刪除門市', !(await S()));
  // ===== v2：現況與目標 =====
  { const pid0 = (await P()).id; await pg.goto(`https://fr.test/#p=${pid0}&t=now`); await pg.waitForTimeout(250); }
  await pg.selectOption('#x_now_fmt', '手搖飲'); await pg.waitForTimeout(150);
  await pg.fill('#x_now_direct', '3'); await pg.fill('#x_now_target3', '30'); await pg.press('#x_now_target3', 'Tab'); await pg.waitForTimeout(200);
  t = await txt(pg); check('階段判斷', t.includes('驗證期') && t.includes('體系期') && t.includes('手搖飲 常見範圍'), t.slice(0, 900));
  await pg.fill('#x_now_avgRev', '450000'); await pg.press('#x_now_avgRev', 'Tab'); await pg.waitForTimeout(150);
  await pg.click('[data-applyfmt]'); await pg.waitForTimeout(800);
  p = await P(); check('套用業態', p.data.calc.royMode === 'fixed' && p.data.calc.royFix === 8000 && p.data.calc.rev === 450000 && p.data.calc.supplyShare === 85 && p.data.calc.y2 === 6 && p.data.types.length === 2 && p.data.types[0].name === '外帶小店' && p.data.types[0].rev === 320000, JSON.stringify(p.data.calc) + JSON.stringify(p.data.types));
  await pg.click('nav.tabs >> text=③ 費用與回本'); await pg.waitForTimeout(200); t = await txt(pg);
  check('店型比較', t.includes('店型比較') && t.includes('外帶小店') && t.includes('商場櫃位'), '');
  check('業態範圍', t.includes('和「手搖飲」常見範圍比') && t.includes('常見 28–36%'), '');
  check('總部打平店數', /要 \d+ 家加盟店總部才打平/.test(t), t.slice(-1500));
  await pg.fill('#x_calc_food', '50'); await pg.waitForTimeout(700); t = await txt(pg);
  check('超出範圍警示', t.includes('偏高') && t.includes('超出「手搖飲」常見範圍'));
  await pg.fill('#x_calc_food', '32'); await pg.fill('#x_types_0_rev', '300000'); await pg.waitForTimeout(800);
  p = await P(); check('店型可編輯', p.data.types[0].rev === 300000 && p.data.calc.food === 32);
  check('v2 試算無 NaN', !bad(await txt(pg)) && !pg.errs.length, pg.errs.join(';'));
  // ===== v2：招募 =====
  await pg.click('nav.tabs >> text=⑤ 招募'); await pg.waitForTimeout(150);
  await pg.fill('#r_name', '陳先生'); await pg.fill('#r_city', '台中'); await pg.click('[data-padd]'); await pg.waitForTimeout(200);
  await pg.selectOption('[data-pp="0.stage"]', '已簽約'); await pg.waitForTimeout(150);
  t = await txt(pg); check('沒揭露日警示', t.includes('沒有紀錄揭露書交付日'), t.slice(0, 600));
  await pg.fill('[data-pp="0.disclosed_on"]', d(-15)); await pg.press('[data-pp="0.disclosed_on"]', 'Tab');
  await pg.fill('[data-pp="0.contract_on"]', d(-12)); await pg.press('[data-pp="0.contract_on"]', 'Tab');
  await pg.fill('[data-pp="0.signed_on"]', d(-10)); await pg.press('[data-pp="0.signed_on"]', 'Tab'); await pg.waitForTimeout(200);
  t = await txt(pg); check('揭露不足 10 天', t.includes('揭露書只提前 5 天') && t.includes('合約審閱只有 2 天') && t.includes('前交付'), t.slice(0, 900));
  await pg.fill('[data-pp="0.disclosed_on"]', d(-40)); await pg.press('[data-pp="0.disclosed_on"]', 'Tab');
  await pg.fill('[data-pp="0.contract_on"]', d(-30)); await pg.press('[data-pp="0.contract_on"]', 'Tab');
  await pg.fill('[data-pp="0.delivered_on"]', d(-5)); await pg.press('[data-pp="0.delivered_on"]', 'Tab'); await pg.waitForTimeout(200);
  t = await txt(pg); check('合規通過', !t.includes('揭露書只提前') && !t.includes('審閱只有') && (await pg.$$eval('.stat b', b => b.map(x => x.textContent)))[8] === '0', t.slice(0, 600));
  for (const [k, v] of [['cap', '5'], ['exp', '4'], ['self', '5'], ['fit', '4'], ['loc', '3']]) { await pg.selectOption(`[data-pp="0.sc.${k}"]`, v); await pg.waitForTimeout(60) }
  t = await txt(pg); check('甄選評分', t.includes('甄選 21/25'));
  await pg.click('[data-pstore="0"]'); await pg.waitForTimeout(300);
  const ns = await pg.evaluate(() => window.__S.tables.fr_stores.find(s => s.owner_name === '陳先生'));
  p = await P(); check('申請人轉門市', ns && ns.status === '籌備中' && ns.royalty_mode === 'fixed' && p.data.prospects[0].store_id === ns.id && (await txt(pg)).includes('看門市'), JSON.stringify(ns));
  await pg.waitForTimeout(700);
  // ===== v2：報告 =====
  await pg.click('nav.tabs >> text=⑦ 路線圖與報告'); await pg.waitForTimeout(200); t = await txt(pg);
  check('顧問報告', t.includes('加盟體系規劃報告') && t.includes('驗證期') && t.includes('七、執行路線圖') && t.includes('6–12 個月｜試點') && t.includes('外帶小店') && t.includes('督導') && !bad(t), t.slice(0, 1500));
  await pg.click('[data-rview="fr"]'); await pg.waitForTimeout(150);
  await pg.fill('#x_now_pitch', '三代傳承的手搖茶'); await pg.waitForTimeout(700); await pg.click('[data-rview="owner"]'); await pg.click('[data-rview="fr"]'); await pg.waitForTimeout(150);
  t = await txt(pg); check('招商說明', t.includes('加盟招商說明') && t.includes('三代傳承的手搖茶') && t.includes('不代表保證獲利') && t.includes('至少 10 天') && !t.includes('總部分走') && !t.includes('供貨毛利'), t.slice(0, 1500));
  await pg.screenshot({ path: path.join(__dirname, 'franchise-prospectus.png'), fullPage: true });
  await pg.click('[data-rview="owner"]'); await pg.waitForTimeout(150);
  await pg.screenshot({ path: path.join(__dirname, 'franchise-report.png'), fullPage: true });
  check('報告頁無錯', !pg.errs.length, pg.errs.join(';'));
  // 截圖桌面
  const pid = (await P()).id;
  await pg.goto(`https://fr.test/#p=${pid}&t=calc`); await pg.waitForTimeout(300);
  await pg.screenshot({ path: path.join(__dirname, 'franchise-calc.png'), fullPage: true });
  await pg.goto(`https://fr.test/#p=${pid}&t=ready`); await pg.waitForTimeout(300);
  await pg.screenshot({ path: path.join(__dirname, 'franchise-ready.png'), fullPage: true });
  // 刪方案
  await pg.goto(`https://fr.test/#p=${pid}&t=set`); await pg.waitForTimeout(200);
  await pg.click('[data-delp]'); await pg.click('[data-delp]'); await pg.waitForTimeout(300);
  check('刪除方案', !(await P()) && (await txt(pg)).includes('已刪除加盟方案'));
  await pg.close();
  // 手機
  for (const h of ['', '#p=1&t=ready', '#p=1&t=model', '#p=1&t=calc', '#p=1&t=contract', '#p=1&t=stores', '#p=1&t=now', '#p=1&t=recruit', '#p=1&t=report', '#s=10']) {
    const m = await open(br, base(A, 'admin'), { width: 375, height: 800 }, h);
    const w = await m.evaluate(() => document.documentElement.scrollWidth); const tt = await txt(m);
    check('手機 ' + (h || '首頁'), w <= 376 && !bad(tt) && !m.errs.length, `w=${w} ${m.errs.join(';')}`);
    if (h === '#p=1&t=calc') await m.screenshot({ path: path.join(__dirname, 'franchise-mobile.png'), fullPage: true });
    await m.close();
  }
  await br.close();
  console.log(fail ? `\n${fail} 項失敗` : '\n全部通過'); process.exit(fail ? 1 : 0);
})();
