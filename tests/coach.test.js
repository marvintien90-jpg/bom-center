// 營運輔導冒煙測試：權限擋人、建立客戶、記訪視＋開待辦、改狀態、KPI（手動＋損益中心）、燈號、報告、刪除。
// node tests/coach.test.js
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const html = fs.readFileSync(path.join(__dirname, '../consult/coach/index.html'), 'utf8');
// 記憶體版 supabase：支援 select/eq/order/limit/maybeSingle/single/insert/update/upsert/delete/rpc
const fake = (state) => `window.supabase={createClient(){const S=${JSON.stringify(state)};window.__S=S;let seq=1000;
const q=(t)=>{S.tables[t]=S.tables[t]||[];let op='select',payload=null,conf=null,f=[],one=false,maybe=false;
const o={select(){return o},eq(k,v){f.push([k,v]);return o},order(){return o},limit(){return o},
maybeSingle(){maybe=true;return o},single(){one=true;return o},
insert(p){op='insert';payload=p;return o},update(p){op='update';payload=p;return o},upsert(p,c){op='upsert';payload=p;conf=c&&c.onConflict;return o},delete(){op='delete';return o},
then(res,rej){let rows=S.tables[t],out;const m=r=>f.every(([k,v])=>r[k]===v);
 if(op==='select'){out=rows.filter(m)}
 else if(op==='insert'){out=[].concat(payload).map(p=>({id:seq++,share:true,status:'待辦',priority:'中',side:'業主',goals:[],source:'手動',...p}));rows.push(...out)}
 else if(op==='update'){out=rows.filter(m);out.forEach(r=>Object.assign(r,payload))}
 else if(op==='upsert'){const keys=conf.split(',');out=[].concat(payload).map(p=>{let r=rows.find(x=>keys.every(k=>x[k]===p[k]));if(r)Object.assign(r,p);else{r={id:seq++,source:'手動',...p};rows.push(r)}return r})}
 else if(op==='delete'){out=rows.filter(m);S.tables[t]=rows.filter(r=>!m(r));
   if(t==='coach_clients')for(const c of ['coach_visits','coach_actions','coach_kpis'])S.tables[c]=(S.tables[c]||[]).filter(r=>!out.some(x=>x.id===r.client_id))}
 const data=(one||maybe)?(out[0]||null):out;return Promise.resolve({data,error:null}).then(res,rej)}};return o};
return {from:q,rpc:async(n,a)=>({data:n==='coach_pl_clients'?S.pl.clients:S.pl.months,error:null}),
 auth:{getSession:async()=>({data:{session:S.user?{user:S.user}:null}}),onAuthStateChange(){},signOut:async()=>{}}}}}`;
const A = { id: 'a1', email: 'boss@x.com' }, U = { id: 'u1', email: 'o@x.com' };
const d = n => new Date(Date.now() + 8 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const base = (user, role) => ({ user, pl: { clients: [{ client_name: '茗人茶館', brand_name: '茗人茶館' }], months: [{ month: '2025-09-01', revenue: 860548, food_pct: 31.4, labor_pct: 46, rent_pct: 3.5, net_pct: 10 }, { month: '2025-10-01', revenue: 941053, food_pct: 32, labor_pct: 50.1, rent_pct: 12.7, net_pct: -6.7 }] },
  tables: { bom_profiles: [{ user_id: user && user.id, role, status: 'active' }], bom_brands: [{ id: 'yijibang-gongyi', name: '一級棒讚小火鍋（公益店）' }],
    checkup_leads: [{ id: 7, brand: '阿明麵館', biz_type: '麵食', stores: 2, contact_name: '阿明', phone: '0912', status: '已成交' }],
    coach_clients: [{ id: 1, name: '老客戶', stage: '輔導中', visit_every_days: 14, start_on: d(-60), goals: [{ kpi: 'food_pct', target: 30, dir: 'down' }] }],
    coach_visits: [{ id: 11, client_id: 1, visit_on: d(-30), kind: '到店訪視', summary: '舊訪視', share: true }],
    coach_actions: [{ id: 21, client_id: 1, title: '逾期的事', side: '業主', due_on: d(-3), status: '待辦', share: true }],
    coach_kpis: [] } });
let fail = 0; const check = (name, cond, extra) => { if (!cond) fail++; console.log(cond ? 'PASS' : 'FAIL', name, extra || '') };
async function open(br, st, vw, hash) {
  const pg = await br.newPage({ viewport: vw || { width: 1200, height: 900 } }); pg.errs = [];
  pg.on('pageerror', e => pg.errs.push(e.message));
  await pg.route('**/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: fake(st) }));
  await pg.route('https://coach.test/', r => r.fulfill({ contentType: 'text/html', body: html }));
  await pg.goto('https://coach.test/' + (hash || '')); await pg.waitForTimeout(250); return pg;
}
const txt = pg => pg.innerText('body');
(async () => {
  const br = await chromium.launch();
  // 權限
  for (const [n, st, want] of [['未登入', { user: null, tables: {}, pl: {} }, '請先登入'], ['業主', base(U, 'client'), '只開放顧問使用']]) {
    const pg = await open(br, st); const t = await txt(pg);
    check('擋 ' + n, t.includes(want) && !t.includes('老客戶') && !pg.errs.length, pg.errs.join(';')); await pg.close();
  }
  // 顧問：首頁燈號
  let pg = await open(br, base(A, 'admin'));
  let t = await txt(pg);
  check('首頁紅燈', t.includes('老客戶') && t.includes('要處理') && t.includes('1 項待辦逾期') && t.includes('30 天沒訪視'), t.slice(0, 300));
  check('首頁統計', (await pg.$$eval('.stat b', b => b.map(x => x.textContent))).join() === '1,1,0,1');
  // 新增客戶（從健檢名單）
  await pg.click('text=＋ 新增輔導客戶'); await pg.selectOption('#n_lead', '7'); await pg.selectOption('#n_brand', 'yijibang-gongyi');
  check('名單帶入', await pg.inputValue('#f_name') === '阿明麵館' && await pg.inputValue('#f_contact') === '阿明');
  await pg.selectOption('#f_pl', '茗人茶館｜茗人茶館');
  const g = await pg.$$('#goals .gl'); await g[0].$eval('[data-g=target]', (e) => { e.value = '32' });
  await pg.fill('#f_fee', '30000');
  await pg.click('[data-save-client="new"]'); await pg.waitForTimeout(150);
  t = await txt(pg);
  const cl = await pg.evaluate(() => window.__S.tables.coach_clients.find(c => c.name === '阿明麵館'));
  check('建立客戶', cl && cl.lead_id === 7 && cl.brand_id === 'yijibang-gongyi' && cl.pl_client === '茗人茶館' && cl.goals.length === 1 && cl.goals[0].target === 32 && t.includes('已建立客戶'), JSON.stringify(cl));
  // 記訪視＋開待辦
  await pg.click('nav.tabs >> text=訪視紀錄'); await pg.waitForTimeout(100);
  await pg.fill('#v_sum', '巡店：出餐速度慢'); await pg.fill('#v_find', '店長配合度低'); await pg.fill('#v_q', '80'); await pg.fill('#v_s', '70'); await pg.fill('#v_c', '90');
  const al = await pg.$$('#vacts .al'); await (await al[0].$('[data-a=title]')).fill('出餐動線調整'); await (await al[1].$('[data-a=title]')).fill('顧問提供 SOP');
  await (await al[1].$('[data-a=side]')).selectOption('顧問');
  await pg.click('[data-save-visit]'); await pg.waitForTimeout(150);
  const S1 = await pg.evaluate(() => window.__S.tables);
  check('訪視＋待辦', S1.coach_visits.length === 2 && S1.coach_actions.filter(a => a.client_id === cl.id).length === 2 && S1.coach_actions.find(a => a.title === '顧問提供 SOP').side === '顧問');
  // 待辦改完成
  await pg.click('nav.tabs >> text=待辦'); await pg.waitForTimeout(100);
  const aid = S1.coach_actions.find(a => a.title === '出餐動線調整').id;
  await pg.selectOption(`[data-astat="${aid}"]`, '已完成'); await pg.waitForTimeout(100);
  await pg.fill(`[data-ares="${aid}"]`, '縮短 2 分鐘'); await pg.click(`[data-saveres="${aid}"]`); await pg.waitForTimeout(100);
  const a2 = await pg.evaluate(id => window.__S.tables.coach_actions.find(a => a.id === id), aid);
  check('待辦完成', a2.status === '已完成' && a2.done_on && a2.result === '縮短 2 分鐘');
  // KPI：損益中心＋手動
  await pg.click('nav.tabs >> text=KPI'); await pg.waitForTimeout(100); await pg.click('[data-plsync]'); await pg.waitForTimeout(100);
  const m = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 7);
  await pg.fill('#k_month', m); await pg.fill('#k_avg_ticket', '180'); await pg.fill('#k_food_pct', '29.5');
  await pg.click('[data-save-kpi]'); await pg.waitForTimeout(100);
  const K = await pg.evaluate(id => window.__S.tables.coach_kpis.filter(k => k.client_id === id), cl.id);
  t = await txt(pg);
  check('KPI', K.length === 3 && K.filter(k => k.source === '損益中心').length === 2 && K.find(k => k.month === m + '-01').avg_ticket === 180 && t.includes('941,053') && t.includes('80'), JSON.stringify(K));
  // 總覽：目標達標（29.5 ≤ 32）
  await pg.click('nav.tabs >> text=總覽'); await pg.waitForTimeout(100); t = await txt(pg);
  check('目標達標', t.includes('達標') && t.includes('29.5'), t.slice(0,900));
  // 報告：不含內部觀察／月費
  await pg.click('nav.tabs >> text=業主報告'); await pg.waitForTimeout(100); t = await txt(pg);
  check('報告', t.includes('營運輔導進度報告') && t.includes('巡店：出餐速度慢') && t.includes('出餐動線調整') && t.includes('顧問提供 SOP') && !t.includes('店長配合度低') && !t.includes('30,000'), t.slice(0, 400));
  const rt = await pg.evaluate(id => reportText(D.clients.find(c => c.id === id), today().slice(0, 7)), cl.id);
  check('報告文字', rt.includes('食材成本率：29.5%') && rt.includes('✅') && !rt.includes('店長配合度低'));
  // 全部待辦頁
  await pg.goto('https://coach.test/#todo'); await pg.waitForTimeout(150); t = await txt(pg);
  check('全部待辦', t.includes('逾期的事') && t.includes('顧問提供 SOP') && t.includes('逾期'));
  // 刪除客戶（按兩次）
  await pg.goto('https://coach.test/#c=' + cl.id + '&t=edit'); await pg.waitForTimeout(150);
  await pg.click('[data-delc]'); await pg.click('[data-delc]'); await pg.waitForTimeout(150);
  const S2 = await pg.evaluate(() => window.__S.tables);
  check('刪除客戶', !S2.coach_clients.some(c => c.id === cl.id) && !S2.coach_actions.some(a => a.client_id === cl.id));
  t = await txt(pg); check('無 undefined/NaN', !/undefined|NaN/.test(t)); check('無 JS 錯誤', !pg.errs.length, pg.errs.join(';'));
  await pg.close();
  // 手機寬度每頁不水平捲動
  for (const h of ['', '#todo', '#new', '#c=1', '#c=1&t=visits', '#c=1&t=actions', '#c=1&t=kpi', '#c=1&t=report', '#c=1&t=edit']) {
    const p = await open(br, base(A, 'admin'), { width: 375, height: 800 }, h);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth); const tt = await txt(p);
    check('手機 ' + (h || '首頁'), !sw && !p.errs.length && !/undefined|NaN/.test(tt), p.errs.join(';'));
    if (h === '' || h === '#c=1&t=visits') await p.screenshot({ path: path.join(__dirname, `coach-${h ? 'visit' : 'home'}-mobile.png`), fullPage: true });
    await p.close();
  }
  const p = await open(br, base(A, 'admin'), null, ''); await p.screenshot({ path: path.join(__dirname, 'coach-desktop.png'), fullPage: true }); await p.close();
  await br.close(); console.log(fail ? fail + ' failed' : 'all passed'); process.exit(fail ? 1 : 0);
})();
