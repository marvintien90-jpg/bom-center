// 顧問工作台＋工具串聯測試（模擬 Supabase）：
//  1. 工作台：權限、數字、今日要做、客戶旅程、客戶檔案抽屜、工具箱篩選、跳出訊息；桌面與手機無錯誤、不左右捲
//  2. 客戶切換列：各工具頁顯示目前客戶、連到同一客戶的其他工具、新增時自動帶入客戶
//  3. 名單 → 輔導客戶：從名單一鍵轉入，資料帶入，名單自動標成已成交
// node tests/consult.test.js
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const fake = (state) => `window.__S=${JSON.stringify(state)};window.supabase={createClient(){const S=window.__S;let seq=100;
const q=(t)=>{const T=S.tables[t]=S.tables[t]||[];let f=[],op='select',v=null,one=false;
 const o={select(){return o},eq(k,x){f.push(r=>r[k]===x);return o},not(k,a,x){f.push(r=>r[k]!=null);return o},neq(k,x){f.push(r=>r[k]!==x);return o},in(k,x){f.push(r=>x.includes(r[k]));return o},gte(){return o},lte(){return o},order(){return o},limit(){return o},
 insert(x){op='insert';v=x;return o},update(x){op='update';v=x;return o},upsert(x){op='insert';v=x;return o},delete(){op='del';return o},
 single(){one=true;return o},maybeSingle(){one=true;return o},
 then(res,rej){let out;if(S.missing&&S.missing.includes(t))out={data:null,error:{message:'relation does not exist'}};
  else if(op==='select'){const rows=T.filter(r=>f.every(g=>g(r)));out={data:one?(rows[0]||null):JSON.parse(JSON.stringify(rows)),error:null}}
  else if(op==='insert'){const r=Object.assign({id:++seq,created_at:new Date().toISOString(),updated_at:new Date().toISOString()},JSON.parse(JSON.stringify(v)));T.push(r);const c=JSON.parse(JSON.stringify(r));out={data:one?c:[c],error:null}}
  else if(op==='update'){const rows=T.filter(r=>f.every(g=>g(r)));rows.forEach(r=>Object.assign(r,JSON.parse(JSON.stringify(v))));out={data:JSON.parse(JSON.stringify(rows)),error:null}}
  else {S.tables[t]=T.filter(r=>!f.every(g=>g(r)));out={data:null,error:null}}
  return Promise.resolve(out).then(res,rej)}};return o};
return {from:q,rpc:async()=>({data:[],error:null}),auth:{getSession:async()=>({data:{session:S.user?{user:S.user}:null}}),onAuthStateChange(){},signOut:async()=>{},signInWithPassword:async(a)=>({error:a.password==='badpass'?{message:'Invalid login credentials'}:null}),resetPasswordForEmail:async()=>({error:null})}}}}`;
const iso = d => new Date(Date.now() - d * 864e5).toISOString(), ds = d => iso(d).slice(0, 10);
const A = { id: 'a1', email: 'boss@x.com' }, U = { id: 'u1', email: 'o@x.com' };
const data = () => ({
  bom_profiles: [{ user_id: 'a1', role: 'admin', status: 'active' }],
  checkup_leads: [
    { id: 1, brand: '老王滷味', contact_name: '王先生', status: '新名單', created_at: iso(5), total: 58, phone: '0912', biz_type: '小吃', stores: 2 },
    { id: 2, brand: '小李咖啡', contact_name: '李小姐', status: '新名單', created_at: iso(0), total: 71 },
    { id: 3, brand: '阿明牛肉麵', contact_name: '阿明', status: '已成交', created_at: iso(40), total: 64 },
    { id: 4, brand: '陳家火鍋', contact_name: '陳先生', status: '已聯絡', created_at: iso(9), status_at: iso(5), total: 49 }],
  coach_clients: [
    { id: 7, name: '阿明牛肉麵', stage: '輔導中', stores: 5, biz_type: '麵食', brand_id: 'b1', lead_id: 3, visit_every_days: 14, goals: [] },
    { id: 8, name: '好食便當', stage: '洽談中', stores: 1, biz_type: '便當', goals: [] }],
  coach_actions: [{ id: 1, client_id: 7, title: '冷藏庫溫度紀錄', status: '待辦', due_on: ds(3), priority: '高' }],
  coach_visits: [{ id: 1, client_id: 7, visit_on: ds(20) }],
  coach_kpis: [],
  org_plans: [{ id: 21, client_id: 7, stores: 5, target_stores: 15, updated_at: iso(1), data: {}, rev: 1 }],
  fr_plans: [], fr_stores: [], fr_visits: [], fr_dues: [],
  sop_manuals: [{ id: 31, title: '阿明 門市 SOP 手冊', status: '已交付', version: 2, brand_id: 'b1', coach_client_id: null, sections: [], biz_type: '通用', updated_at: iso(2) }],
  qsc_audits: [{ audit_id: 'x', brand_id: 'b1', score: 82, audit_date: ds(4), kind: 'supervisor', open_count: 2, overdue_count: 1 }],
  bom_brands: [{ id: 'b1', name: '阿明牛肉麵' }]
});
let fail = 0; const log = (ok, ...m) => { if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', ...m) };
async function open(br, st, vw, url) {
  const pg = await br.newPage({ viewport: vw }); pg.errs = [];
  pg.on('pageerror', e => pg.errs.push(e.message)); pg.on('dialog', d => { pg.errs.push('dialog ' + d.message()); d.dismiss() });
  await pg.route('**/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: fake(st) }));
  await pg.route('https://t.test/**', r => { const u = new URL(r.request().url()); let p = path.join(ROOT, decodeURIComponent(u.pathname)); if (p.endsWith('/')) p += 'index.html';
    if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ contentType: p.endsWith('.js') ? 'application/javascript' : p.endsWith('.css') ? 'text/css' : 'text/html', body: fs.readFileSync(p) }) });
  await pg.goto('https://t.test/' + url); await pg.waitForTimeout(500); return pg;
}
const clean = async (pg, name) => { const t = await pg.innerText('body'); const sw = await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  const bad = ['undefined', 'NaN', '[object'].filter(w => t.includes(w)); log(!bad.length && !sw && !pg.errs.length, name, bad.join(), sw ? 'h-scroll' : '', pg.errs.join(';')); return t };
const toastText = pg => pg.$$eval('.kit-toast', e => e.map(x => x.textContent).join('|'));

(async () => {
  const br = await chromium.launch();
  for (const vw of [{ width: 1440, height: 900 }, { width: 375, height: 800 }]) {
    const W = vw.width, tag = W < 500 ? 'mobile' : 'desktop';
    // 權限
    let pg = await open(br, { user: null, tables: {} }, vw, 'consult/'); let t = await clean(pg, 'guest ' + W); log(t.includes('請先登入') && !t.includes('立地評估'), 'guest blocked', W); await pg.close();
    pg = await open(br, { user: U, tables: { bom_profiles: [{ user_id: 'u1', role: 'client', status: 'active' }], checkup_leads: data().checkup_leads } }, vw, 'consult/');
    t = await clean(pg, 'owner ' + W); log(t.includes('只開放顧問使用') && !t.includes('名單管理'), 'owner blocked', W); await pg.close();
    pg = await open(br, { user: A, tables: { bom_profiles: [{ user_id: 'a1', role: 'admin', status: 'disabled' }] } }, vw, 'consult/');
    t = await clean(pg, 'disabled admin ' + W); log(t.includes('只開放顧問使用'), 'disabled admin blocked', W); await pg.close();

    // 工作台
    pg = await open(br, { user: A, tables: data() }, vw, 'consult/');
    await pg.waitForTimeout(700);
    t = await clean(pg, 'workbench ' + W);
    const want = ['今日要做', '客戶旅程', '工具箱', '經營健檢', '名單管理＋顧問作業包', '餐飲立地評估', 'BOM 運算中心（顧問工具）', '菜單四象限', '損益分析中心', '營運輔導', '品牌案件工作台', '文件中心', '招募考核範本包', '總部組織與權責診斷', '加盟體系', 'SOP 手冊與督導稽核', '業主入口（總覽）', '訂閱與會員管理', '人資與勞基法中心', '2 筆新名單', '新名單待聯絡', '該追蹤（逾期）', '累計成交', '聯絡健檢名單：老王滷味', '追蹤：陳家火鍋', '冷藏庫溫度紀錄', '該訪視了：阿明牛肉麵', '稽核改善逾期：阿明牛肉麵', '好食便當'];
    const miss = want.filter(w => !t.includes(w)); log(!miss.length, 'workbench content', W, miss.join());
    const m0 = new Date(new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 7) + '-01T00:00:00+08:00'), exp = data().checkup_leads.filter(l => new Date(l.created_at) >= m0).length;
    const s = await pg.$$eval('.stat b', b => b.map(x => x.dataset.count + '=' + x.textContent));
    log(s.join() === '2=2,2=2,1=1,1=1,'+exp+'=' + exp + ',1=1', 'stats + count-up finished', s.join(), W);
    const pipe = await pg.$$eval('.col', c => c.map(x => x.querySelector('.n').textContent));
    log(pipe.join() === '3,1,1,0', 'pipeline columns (converted lead excluded)', pipe.join(), W);
    await pg.screenshot({ path: path.join(__dirname, `consult-${tag}.png`), fullPage: true });
    // 工具篩選
    await pg.click('[data-filt="g4"]'); await pg.waitForTimeout(100); t = await pg.innerText('#tools');
    log(t.includes('加盟體系') && !t.includes('經營健檢'), 'tool filter', W);
    await pg.click('[data-filt="all"]');
    // 複製連結 → 跳出訊息
    await pg.evaluate(() => { navigator.clipboard.writeText = async () => {} });
    await pg.click('.hero [data-copy]'); await pg.waitForTimeout(150);
    log((await toastText(pg)).includes('已複製健檢連結'), 'copy shows toast', W);
    // 客戶檔案
    await pg.click('[data-open="c=7"]'); await pg.waitForTimeout(450);
    t = await clean(pg, 'client drawer ' + W);
    log(t.includes('64 分') && t.includes('逾期 1') && t.includes('5 店 → 目標 15 店') && t.includes('阿明 門市 SOP 手冊') && t.includes('最近稽核 82 分') && t.includes('BOM 品牌：阿明牛肉麵'), 'client 360 steps', W);
    const hrefs = await pg.$$eval('.drawer a', a => a.map(x => x.getAttribute('href')));
    log(hrefs.some(h => h.endsWith('org/#p=21')) && hrefs.some(h => h.endsWith('franchise/#new&client=7')) && hrefs.some(h => h.endsWith('sop/#m=31')) && hrefs.some(h => h.includes('#mrep&b=b1')), 'client 360 deep links', W);
    if (W > 500) await pg.screenshot({ path: path.join(__dirname, 'consult-client-desktop.png') });
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(150); log(!(await pg.$('#drawer')), 'drawer closes with Esc', W);
    await pg.click('[data-open="l=1"]'); await pg.waitForTimeout(300); t = await pg.innerText('#drawer');
    log(t.includes('老王滷味') && t.includes('轉成輔導客戶'), 'lead drawer', W);
    const conv = await pg.$eval('#drawer a.pri', a => a.getAttribute('href')); log(conv.endsWith('coach/#new&lead=1'), 'lead convert link', conv, W);
    await pg.close();
  }

  // 客戶切換列＋帶入客戶（桌面）
  const vw = { width: 1440, height: 900 };
  let pg = await open(br, { user: A, tables: data() }, vw, 'consult/org/#p=21'); await pg.waitForTimeout(300);
  let bar = await pg.innerText('.kit-bar'); log(bar.includes('阿明牛肉麵') && bar.includes('組織診斷') && bar.includes('＋ 加盟體系'), 'org page bar shows client', bar.replace(/\s+/g, ' '));
  let links = await pg.$$eval('.kit-links a', a => a.map(x => x.getAttribute('href')));
  log(links.some(h => h.endsWith('franchise/#new&client=7')) && links.some(h => h.endsWith('sop/#m=31')) && links.some(h => h.endsWith('coach/#c=7')), 'bar links', links.join(' '));
  await pg.click('[data-kit-pick]'); await pg.waitForTimeout(100); await pg.fill('[data-kit-q]', '好食'); await pg.waitForTimeout(100);
  const items = await pg.$$eval('[data-kit-c]', b => b.map(x => x.textContent)); log(items.length === 1 && items[0].includes('好食便當'), 'picker search', items.join());
  await pg.click('[data-kit-c="8"]'); await pg.waitForTimeout(500);
  log(pg.url().endsWith('#t=new&client=8') && (await pg.$eval('#n_client', e => e.value)) === '8', 'pick client without plan → new form prefilled', pg.url());
  log((await toastText(pg)).includes('還沒有組織診斷'), 'pick shows toast');
  await clean(pg, 'org with kit'); await pg.close();

  pg = await open(br, { user: A, tables: data() }, vw, 'consult/franchise/#new&client=7'); await pg.waitForTimeout(300);
  log((await pg.$eval('#f_coach', e => e.value)) === '7' && (await pg.$eval('#f_name', e => e.value)) === '阿明牛肉麵' && (await pg.$eval('#f_brand', e => e.value)) === 'b1', 'franchise new prefilled from client');
  await clean(pg, 'franchise with kit'); await pg.close();

  pg = await open(br, { user: A, tables: data() }, vw, 'consult/sop/#new&client=8'); await pg.waitForTimeout(300);
  log((await pg.$eval('#n_client', e => e.value)) === '好食便當', 'sop new prefilled client name');
  await pg.click('[data-create]'); await pg.waitForTimeout(400);
  const sopRow = await pg.evaluate(() => window.__S.tables.sop_manuals.slice(-1)[0]);
  log(sopRow.coach_client_id === 8 && sopRow.client_name === '好食便當', 'sop saved with coach client', JSON.stringify({ c: sopRow.coach_client_id, n: sopRow.client_name }));
  log((await toastText(pg)).includes('已建立'), 'sop create toast');
  bar = await pg.innerText('.kit-bar'); log(bar.includes('好食便當'), 'bar follows new manual', bar.replace(/\s+/g, ' '));
  await clean(pg, 'sop with kit'); await pg.close();

  // 名單 → 輔導客戶
  pg = await open(br, { user: A, tables: data() }, vw, 'checkup/leads/'); await pg.waitForTimeout(300);
  const lc = await pg.$$eval('#lead-1 a', a => a.map(x => x.textContent + ' ' + x.getAttribute('href')).join('|')); log(lc.includes('轉成輔導客戶 → ') && lc.includes('coach/#new&lead=1'), 'leads page has convert button', lc);
  const l3 = await pg.$$eval('#lead-3 a', a => a.map(x => x.getAttribute('href')).join('|')).catch(() => ''); 
  await pg.close();
  pg = await open(br, { user: A, tables: data() }, vw, 'consult/coach/#new&lead=1'); await pg.waitForTimeout(400);
  log((await pg.$eval('#f_name', e => e.value)) === '老王滷味' && (await pg.$eval('#f_phone', e => e.value)) === '0912', 'coach new prefilled from lead');
  await pg.click('[data-save-client="new"]'); await pg.waitForTimeout(500);
  const st = await pg.evaluate(() => ({ lead: window.__S.tables.checkup_leads.find(l => l.id === 1).status, c: window.__S.tables.coach_clients.slice(-1)[0] }));
  log(st.lead === '已成交' && st.c.lead_id === 1 && st.c.name === '老王滷味', 'lead converted + marked 已成交', JSON.stringify({ l: st.lead, id: st.c.lead_id }));
  log((await toastText(pg)).includes('健檢名單已標成「已成交」'), 'convert toast');
  await pg.screenshot({ path: path.join(__dirname, 'consult-coach-toast.png') });
  await clean(pg, 'coach with kit'); await pg.close();

  // 業主入口（含共用元件）
  const U1 = { id: 'u1', email: 'o@x.com', email_confirmed_at: '2026-11-01' };
  const own = { user: U1, tables: { bom_profiles: [{ user_id: 'u1', role: 'client', status: 'active', expires_on: '2099-01-01' }], pl_profiles: [{ user_id: 'u1', role: 'owner', status: 'pending' }], sub_subscriptions: [{ user_id: 'u1', company: '好吃餐飲', plan: 'pro', stores: 2, status: 'active', period_end: '2099-01-01' }] } };
  for (const w of [{ width: 1440, height: 900 }, { width: 375, height: 800 }]) {
    const W = w.width, tag = W < 500 ? 'mobile' : 'desktop';
    pg = await open(br, { user: null, tables: {} }, w, 'portal/'); await clean(pg, 'portal login ' + W);
    if (W > 500) await pg.screenshot({ path: path.join(__dirname, 'portal-login-desktop.png') });
    await pg.fill('#em', 'o@x.com'); await pg.fill('#pw', 'badpass'); await pg.click('#auth button[type=submit]'); await pg.waitForTimeout(300);
    log((await toastText(pg)).includes('Email 或密碼不正確'), 'portal login error toast', W); await pg.close();
    pg = await open(br, own, w, 'portal/'); let t = await clean(pg, 'portal owner ' + W);
    log(t.includes('午安') || t.includes('早安') || t.includes('晚安'), 'portal greeting', W);
    log(t.includes('進入 BOM 運算中心') && t.includes('查看開通進度') && t.includes('訂閱中') && !t.includes('顧問工作台'), 'portal owner systems', W);
    await pg.screenshot({ path: path.join(__dirname, `portal-owner-${tag}.png`), fullPage: true }); await pg.close();
    const adm = { user: { id: 'a1', email: 'boss@x.com' }, tables: { bom_profiles: [{ user_id: 'a1', role: 'admin', status: 'active' }, { user_id: 'u1', email: 'o@x.com', role: 'client', status: 'active' }, { user_id: 'u2', email: 'p@x.com', role: 'client', status: 'pending' }], pl_profiles: [], sub_subscriptions: [{ user_id: 'u1', email: 'o@x.com', company: '好吃餐飲', plan: 'member', stores: 1, status: 'comp' }] } };
    pg = await open(br, adm, w, 'portal/'); t = await clean(pg, 'portal admin ' + W);
    log(t.includes('進入顧問工作台') && t.includes('業主總覽') && t.includes('等待開通'), 'portal admin', W);
    await pg.fill('#ownerq', 'p@'); await pg.waitForTimeout(100); const rows = await pg.$$eval('#ownerrows tr', r => r.length); log(rows === 1, 'owner search filters', rows, W);
    await pg.screenshot({ path: path.join(__dirname, `portal-admin-${tag}.png`), fullPage: true }); await pg.close();
  }
  // 人資、會員中心載入共用元件不出錯
  for (const u of ['hr/', 'member/']) { pg = await open(br, own, vw, u); await pg.waitForTimeout(300); log(await pg.evaluate(() => document.documentElement.classList.contains('kit-on')), 'kit on ' + u); log(!pg.errs.length, 'no errors ' + u, pg.errs.join(';')); await pg.close() }

  await br.close(); console.log(fail ? fail + ' failed' : 'all passed'); process.exit(fail ? 1 : 0);
})();
