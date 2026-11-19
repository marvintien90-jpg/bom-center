// 文件中心冒煙測試：權限、建議文件、產出（欄位即時預覽）、改版留版本、差異、還原、重新產生、檢視、一次產出、從待辦產出、刪除、手機寬度。
// node tests/docs.test.js
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const fake = (state) => `window.supabase={createClient(){const S=${JSON.stringify(state)};window.__S=S;let seq=1000;
const q=(t)=>{S.tables[t]=S.tables[t]||[];let op='select',payload=null,conf=null,f=[],one=false,maybe=false;
const o={select(){return o},eq(k,v){f.push([k,v]);return o},order(){return o},limit(){return o},
maybeSingle(){maybe=true;return o},single(){one=true;return o},
insert(p){op='insert';payload=p;return o},update(p){op='update';payload=p;return o},upsert(p,c){op='upsert';payload=p;conf=c&&c.onConflict;return o},delete(){op='delete';return o},
then(res,rej){let rows=S.tables[t],out;const m=r=>f.every(([k,v])=>r[k]===v);
 if(op==='select'){out=rows.filter(m)}
 else if(op==='insert'){out=[].concat(payload).map(p=>({id:seq++,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...p}));rows.push(...out)}
 else if(op==='update'){out=rows.filter(m);out.forEach(r=>Object.assign(r,payload))}
 else if(op==='delete'){out=rows.filter(m);S.tables[t]=rows.filter(r=>!m(r));if(t==='doc_items')S.tables.doc_versions=(S.tables.doc_versions||[]).filter(v=>!out.some(x=>x.id===v.doc_id))}
 const data=(one||maybe)?(out[0]||null):out;return Promise.resolve({data,error:null}).then(res,rej)}};return o};
return {from:q,rpc:async()=>({data:[],error:null}),auth:{getSession:async()=>({data:{session:S.user?{user:S.user}:null}}),onAuthStateChange(){},signOut:async()=>{}}}}}`;
const A = { id: 'a1', email: 'boss@x.com' }, U = { id: 'u1', email: 'o@x.com' };
const d = n => new Date(Date.now() + 8 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const base = (user, role) => ({ user, tables: {
  bom_profiles: [{ user_id: user && user.id, role, status: 'active' }],
  coach_clients: [{ id: 1, name: '阿明牛肉麵', stage: '輔導中', stores: 4, biz_type: '麵食', contact_name: '林阿明' }, { id: 2, name: '小店', stage: '輔導中', stores: 1 }],
  coach_actions: [{ id: 21, client_id: 1, title: '冷藏庫溫度每天記錄兩次', side: '業主', assignee: '王店長', due_on: d(5), status: '待辦' }, { id: 22, client_id: 1, title: '已完成的事', side: '業主', status: '已完成' }],
  fr_plans: [], doc_items: [{ id: 50, client_id: 1, tpl: 'ops-hours', dept: 'ops', ev: '營業調整', kind: '公告', title: '營業時間調整公告', doc_no: '阿明-OPS-202601-001', version: 1, status: '已發布', fields: { store: '全門市', neu: '11:00–20:30' }, body: '舊內容', review_days: 180, next_review: d(-2), created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
  doc_versions: [{ id: 60, doc_id: 50, version: 1, title: '營業時間調整公告', body: '舊內容', note: '第一版', created_at: '2026-01-01T00:00:00Z' }] } });
let fail = 0; const check = (n, c, x) => { if (!c) fail++; console.log(c ? 'PASS' : 'FAIL', n, c ? '' : (x || '')) };
async function open(br, st, vw, hash) {
  const pg = await br.newPage({ viewport: vw || { width: 1280, height: 900 } }); pg.errs = [];
  pg.on('pageerror', e => pg.errs.push(e.message));
  await pg.route('**/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: fake(st) }));
  await pg.route('https://t.test/**', r => { const u = new URL(r.request().url()); let p = path.join(ROOT, decodeURIComponent(u.pathname)); if (p.endsWith('/')) p += 'index.html';
    r.fulfill({ contentType: p.endsWith('.js') ? 'application/javascript' : p.endsWith('.css') ? 'text/css' : 'text/html', body: fs.readFileSync(p) }) });
  await pg.goto('https://t.test/consult/docs/' + (hash || '')); await pg.waitForTimeout(400); return pg;
}
const txt = pg => pg.innerText('body'), S = pg => pg.evaluate(() => window.__S.tables), nav = async (pg, h) => { await pg.evaluate(h => location.hash = h, h); await pg.waitForTimeout(250) };
(async () => {
  const br = await chromium.launch();
  for (const [n, st, want] of [['未登入', { user: null, tables: {} }, '請先登入'], ['業主', base(U, 'client'), '只開放顧問使用']]) {
    const pg = await open(br, st); const t = await txt(pg); check('擋 ' + n, t.includes(want) && !t.includes('阿明牛肉麵') && !pg.errs.length, t.slice(0, 200)); await pg.close();
  }
  let pg = await open(br, base(A, 'admin'));
  let t = await txt(pg);
  check('選客戶', t.includes('選一位客戶開始') && t.includes('阿明牛肉麵') && t.includes('該重新檢視'));
  await nav(pg, 'client=1'); t = await txt(pg);
  check('部門矩陣', ['總經理室', '營運部', '人資部', '財務部', '採購物流', '研發品保', '行銷部', '核決權限表', '營業時間調整公告', '該檢視'].every(w => t.includes(w)) && !t.includes('加盟主歡迎信'), t.slice(0, 600));
  check('待辦轉文件', t.includes('把 1 項待辦轉成'));
  // 單店客戶不建議 3 店以上範本
  await nav(pg, 'client=2'); t = await txt(pg); check('單店建議', !t.includes('核決權限表') && t.includes('營業時間調整公告'));
  await pg.click('[data-filt=all]'); await pg.waitForTimeout(100); t = await txt(pg); check('全部範本', t.includes('核決權限表') && t.includes('此階段非必要'));
  // 產出：售價調整簽呈
  await nav(pg, 'client=1&new=fin-price');
  await pg.fill('#f_items', '招牌牛肉麵｜180｜200\n小菜｜40｜45'); await pg.fill('#f__head', '陳財務'); await pg.waitForTimeout(100);
  let pv = await pg.innerText('#p_body');
  check('即時預覽', pv.includes('1. 招牌牛肉麵｜180｜200') && pv.includes('擬辦：陳財務') && pv.includes('核示：林阿明'), pv);
  await pg.click('[data-create="1"]'); await pg.waitForTimeout(300);
  let s = await S(pg); let doc = s.doc_items.find(x => x.tpl === 'fin-price');
  check('存草稿', doc && doc.status === '草稿' && doc.version === 1 && /^阿明-FIN-\d{6}-001$/.test(doc.doc_no) && s.doc_versions.some(v => v.doc_id === doc.id && v.version === 1) && doc.next_review, JSON.stringify(doc));
  t = await txt(pg); check('文件頁', t.includes('版本歷程') && t.includes('v1') && t.includes('下載 Word'));
  // 改版 v2（改欄位）
  await nav(pg, `client=1&d=${doc.id}&edit`); await pg.fill('#f_eff', '2026-12-01'); await pg.fill('#f__note', '確定實施日'); await pg.click(`[data-savever="${doc.id}"]`); await pg.waitForTimeout(300);
  s = await S(pg); doc = s.doc_items.find(x => x.id === doc.id);
  check('改版 v2', doc.version === 2 && doc.body.includes('2026-12-01') && s.doc_versions.filter(v => v.doc_id === doc.id).length === 2);
  // 手動改內文 v3
  await nav(pg, `client=1&d=${doc.id}&edit`); await pg.fill('#f__body', doc.body + '\n附註：外送平台同步調整。'); await pg.click(`[data-savever="${doc.id}"]`); await pg.waitForTimeout(300);
  s = await S(pg); doc = s.doc_items.find(x => x.id === doc.id);
  check('手動改版 v3', doc.version === 3 && doc.body.includes('外送平台同步調整'));
  // 看舊版差異、還原
  await pg.waitForTimeout(200); await pg.click('[data-ver="1"]'); await pg.waitForTimeout(100); t = await txt(pg);
  check('版本差異', t.includes('正在看 v1') && (await pg.$$('.diff .add')).length > 0);
  const v1 = s.doc_versions.find(v => v.doc_id === doc.id && v.version === 1);
  await pg.click(`[data-restore="${v1.id}"]`); await pg.click(`[data-restore="${v1.id}"]`); await pg.waitForTimeout(300);
  s = await S(pg); doc = s.doc_items.find(x => x.id === doc.id);
  check('還原', doc.version === 4 && !doc.body.includes('2026-12-01') && s.doc_versions.some(v => v.doc_id === doc.id && v.note === '還原成 v1'));
  // 狀態與檢視
  await pg.selectOption('#d_status', '已發布'); await pg.waitForTimeout(150);
  s = await S(pg); check('發布', s.doc_items.find(x => x.id === doc.id).status === '已發布');
  // 到期文件：已檢視
  await nav(pg, 'client=1&d=50'); await pg.click('[data-reviewed="50"]'); await pg.waitForTimeout(150);
  s = await S(pg); check('已檢視', s.doc_items.find(x => x.id === 50).next_review === d(180) && s.doc_items.find(x => x.id === 50).version === 1);
  // 重新產生（按兩次）
  await pg.click('[data-regen="50"]'); await pg.click('[data-regen="50"]'); await pg.waitForTimeout(300);
  s = await S(pg); let d50 = s.doc_items.find(x => x.id === 50);
  check('重新產生', d50.version === 2 && d50.body.includes('11:00–20:30') && d50.body.includes('阿明牛肉麵'), d50.body);
  // 從待辦產出
  await nav(pg, 'client=1&new=ops-fix&a=all'); const items = await pg.inputValue('#f_items');
  check('待辦帶入', items.includes('冷藏庫溫度每天記錄兩次｜王店長') && !items.includes('已完成的事'), items);
  await pg.click('[data-create="1"][data-pub]'); await pg.waitForTimeout(300);
  s = await S(pg); const fx = s.doc_items.find(x => x.tpl === 'ops-fix'); check('待辦→通知單', fx && fx.status === '已發布' && fx.action_id === 21);
  // 一次產出
  await nav(pg, 'client=1'); const before = (await S(pg)).doc_items.length; await pg.click('[data-batch="1"]'); await pg.waitForTimeout(800);
  s = await S(pg); const n = s.doc_items.length - before; t = await txt(pg);
  check('一次產出', n > 15 && t.includes(`已產出 ${n} 份草稿`) && !t.includes('一次產出'), n);
  // 檢視清單
  await nav(pg, 'review'); t = await txt(pg); check('檢視清單', t.includes('該重新檢視的文件') && t.includes('30 天內到期'));
  // 刪除
  await nav(pg, `client=1&d=${doc.id}`); await pg.click(`[data-deld="${doc.id}"]`); await pg.click(`[data-deld="${doc.id}"]`); await pg.waitForTimeout(250);
  s = await S(pg); check('刪除', !s.doc_items.some(x => x.id === doc.id) && !s.doc_versions.some(v => v.doc_id === doc.id));
  t = await txt(pg); check('無 undefined/NaN', !/undefined|NaN/.test(t)); check('無 JS 錯誤', !pg.errs.length, pg.errs.join(';'));
  await pg.close();
  for (const h of ['', '#client=1', '#client=1&new=hr-onboard', '#client=1&d=50', '#client=1&d=50&edit', '#review']) {
    const p = await open(br, base(A, 'admin'), { width: 375, height: 800 }, h);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth); const tt = await txt(p);
    check('手機 ' + (h || '首頁'), !sw && !p.errs.length && !/undefined|NaN/.test(tt), p.errs.join(';') + (sw ? ' h-scroll' : ''));
    if (h === '#client=1&new=hr-onboard') await p.screenshot({ path: path.join(__dirname, 'docs-new-mobile.png'), fullPage: true });
    await p.close();
  }
  for (const [h, f] of [['#client=1', 'docs-client-desktop.png'], ['#client=1&new=fin-price', 'docs-new-desktop.png']]) { const p = await open(br, base(A, 'admin'), null, h); await p.screenshot({ path: path.join(__dirname, f), fullPage: true }); await p.close() }
  await br.close(); console.log(fail ? fail + ' failed' : 'all passed'); process.exit(fail ? 1 : 0);
})();
