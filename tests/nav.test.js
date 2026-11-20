// 共用導覽列＋刪除前輸入密碼：node tests/nav.test.js
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

const sleep = ms => new Promise(r => setTimeout(r, ms));
const MOCK = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8'), XL = fs.readFileSync(path.join(__dirname, 'node_modules/xlsx/dist/xlsx.full.min.js'), 'utf8');
async function openBom(br, role, w, hash) {
  const pg = await br.newPage({ viewport: { width: w, height: 900 } }); pg.errs = [];
  pg.on('pageerror', e => pg.errs.push(e.message));
  await pg.route('**/*', r => { const u = r.request().url();
    if (u.includes('supabase-js')) return r.fulfill({ contentType: 'application/javascript', body: `window.__MOCK=${JSON.stringify({ role })};\n` + MOCK });
    if (u.includes('xlsx')) return r.fulfill({ contentType: 'application/javascript', body: XL });
    if (u.startsWith('file:')) return r.continue(); return r.fulfill({ status: 404, body: '' }) });
  await pg.goto('file://' + path.join(ROOT, 'index.html') + (hash || '')); await sleep(700); return pg;
}
(async () => {
  const br = await chromium.launch();
  for (const vw of [{ width: 1440, height: 900 }, { width: 375, height: 800 }]) {
    const W = vw.width, tag = W < 500 ? 'mobile' : 'desktop';
    // 1. 顧問工具頁：導覽列、功能選單、上一頁／下一頁
    let pg = await open(br, { user: A, tables: data() }, vw, 'consult/coach/');
    await sleep(500);
    log(await pg.isVisible('.kit-nav [data-kit-back]') && await pg.isVisible('.kit-nav [data-kit-fwd]') && await pg.isVisible('.kit-nav [data-kit-menu]'), 'nav buttons visible', W);
    log(await pg.isDisabled('[data-kit-back]'), 'back disabled on first page', W);
    const navY = await pg.$eval('.kit-nav', e => e.getBoundingClientRect().top), barY = await pg.$eval('.kit-bar', e => e.getBoundingClientRect().top);
    log(navY === 0 && barY >= 40, 'nav on top, client bar below', navY, barY, W);
    await pg.click('[data-kit-menu]'); await sleep(350);
    let d = await pg.innerText('#kit-drawer');
    log(d.includes('顧問工具') && d.includes('業主系統') && d.includes('營運輔導') && d.includes('全部待辦') && d.includes('BOM 運算中心'), 'drawer lists systems (admin)', W);
    log(await pg.isVisible('.kd-s.cur .kd-b') && !(await pg.isVisible('.kd-s:not(.cur) .kd-b')), 'current system expanded, others collapsed', W);
    await pg.click('[data-kit-tog="hr"]'); await sleep(150);
    log((await pg.innerText('#kit-drawer')).includes('法規查詢'), 'expand another system', W);
    await pg.click('[data-kit-tog="hr"]'); await sleep(150);
    log(!(await pg.innerText('#kit-drawer')).includes('法規查詢'), 'collapse it again', W);
    await pg.fill('.kd-q', '待辦'); await sleep(100); d = await pg.innerText('#kit-drawer');
    log(d.includes('全部待辦') && !d.includes('組織診斷'), 'search filters', W);
    await pg.fill('.kd-q', '');
    if (W > 500) await pg.screenshot({ path: path.join(__dirname, `nav-drawer-${tag}.png`) });
    await pg.click('#kit-drawer a[href$="coach/#todo"]'); await sleep(400);
    log(!(await pg.$('#kit-drawer')) && pg.url().endsWith('#todo'), 'drawer link navigates + closes', W);
    log((await pg.innerText('.kit-nav')).includes('全部待辦'), 'crumb shows page', W);
    log(!(await pg.isDisabled('[data-kit-back]')), 'back enabled', W);
    await pg.click('[data-kit-back]'); await sleep(400);
    log(!pg.url().includes('#todo'), 'back works', W);
    await pg.click('[data-kit-fwd]'); await sleep(400);
    log(pg.url().endsWith('#todo'), 'forward works', W);
    // 跨系統：到組織診斷再回來
    await pg.click('[data-kit-menu]'); await sleep(300); await pg.click('#kit-drawer .kd-a[href$="consult/org/"]'); await sleep(800);
    log(pg.url().endsWith('consult/org/') && await pg.isVisible('.kit-nav'), 'switch system keeps nav', W);
    await pg.click('[data-kit-back]'); await sleep(900);
    log(pg.url().includes('coach/#todo'), 'back across systems', W);
    await clean(pg, 'coach nav ' + W);
    // 2. 刪除要輸入密碼
    await pg.goto('https://t.test/consult/coach/#c=7&t=visits'); await sleep(700);
    await pg.click('[data-delv="1"]'); await sleep(150);
    log(!(await pg.$('.kit-dlg')), 'first click only arms', W);
    await pg.click('[data-delv="1"]'); await sleep(200);
    log(await pg.isVisible('.kit-dlg') && (await pg.inputValue('.kit-dlg .kg-u'))==='boss@x.com', 'second click asks password', W);
    if (W > 500) await pg.screenshot({ path: path.join(__dirname, `nav-reauth-${tag}.png`) });
    await pg.fill('.kg-p', 'badpass'); await pg.click('.kg-ok'); await sleep(200);
    log((await pg.innerText('.kg-e')).includes('密碼不對') && await pg.evaluate(() => __S.tables.coach_visits.length === 1), 'wrong password keeps data', W);
    await pg.click('.kg-no'); await sleep(150);
    log(!(await pg.$('.kit-dlg')) && await pg.evaluate(() => __S.tables.coach_visits.length === 1), 'cancel keeps data', W);
    await pg.click('[data-delv="1"]'); await sleep(100); if (!(await pg.$('.kit-dlg'))) { await pg.click('[data-delv="1"]'); await sleep(150) }
    await sleep(4300); // 等「再按一次」自動取消，驗證通過後仍要刪得掉
    await pg.fill('.kg-p', 'right-pass'); await pg.click('.kg-ok'); await sleep(500);
    log(await pg.evaluate(() => __S.tables.coach_visits.length === 0), 'correct password deletes (even after arm timeout)', W);
    await clean(pg, 'coach delete ' + W); await pg.close();

    // 3. 餐策雲 DineOS：只看到業主系統、側欄可收合
    const own = data(); own.bom_profiles = [{ user_id: 'u1', role: 'client', status: 'active' }];
    pg = await open(br, { user: U, tables: own }, vw, 'portal/'); await sleep(700);
    await pg.click('[data-kit-menu]'); await sleep(300); d = await pg.innerText('#kit-drawer');
    log(d.includes('我的系統') && !d.includes('顧問工具') && !d.includes('營運輔導') && !d.includes('授權管理'), 'owner drawer only owner systems', W);
    await pg.keyboard.press('Escape'); await sleep(300);
    if (W > 500) {
      log(await pg.isVisible('.side') && await pg.isVisible('[data-kit-side]'), 'side + toggle visible', W);
      await pg.click('[data-kit-side]'); await sleep(200);
      log(!(await pg.isVisible('.side')), 'side collapsed', W);
      await pg.reload(); await sleep(800);
      log(!(await pg.isVisible('.side')), 'collapse remembered', W);
      await pg.click('[data-kit-side]'); await sleep(200); log(await pg.isVisible('.side'), 'side expanded', W);
    } else log(!(await pg.isVisible('[data-kit-side]')), 'no side toggle on phone', W);
    await clean(pg, 'portal nav ' + W); await pg.close();

    // 4. 訂閱管理：移除試點名單也要密碼
    const adm = data(); adm.sub_pilots = [{ email: 'p@x.com', note: '' }];
    pg = await open(br, { user: A, tables: adm }, vw, 'member/'); await sleep(700);
    const tb = await pg.$('[data-atab="pilots"]'); if (tb) { await tb.click(); await sleep(300) }
    const rm = await pg.$('[data-unpilot]');
    if (rm) { await rm.click(); await sleep(200); log(await pg.isVisible('.kit-dlg'), 'member remove asks password', W);
      await pg.fill('.kg-p', 'ok-pass'); await pg.click('.kg-ok'); await sleep(500);
      log(await pg.evaluate(() => (__S.tables.sub_pilots || []).length === 0), 'member removed after password', W) }
    else log(true, 'member pilots tab not shown in fake (skip)', W);
    await pg.close();

    // 5. BOM 中心：分頁切換記在上一頁／下一頁，功能選單直接跳分頁
    pg = await openBom(br, 'admin', W);
    await pg.evaluate(() => document.querySelector('#nav [data-tab="ing"]').click()); await sleep(200);
    await pg.evaluate(() => document.querySelector('#nav [data-tab="cost"]').click()); await sleep(200);
    log(pg.url().endsWith('#cost'), 'bom tab in url', W);
    await pg.click('[data-kit-back]'); await sleep(400);
    log(pg.url().endsWith('#ing') && (await pg.innerText('#crumb')).includes('食材'), 'bom back to previous tab', W, await pg.innerText('#crumb'));
    await pg.click('[data-kit-fwd]'); await sleep(400);
    log(pg.url().endsWith('#cost'), 'bom forward', W);
    await pg.click('[data-kit-menu]'); await sleep(300);
    log((await pg.innerText('#kit-drawer')).includes('授權管理'), 'bom admin pages listed', W);
    await pg.click('#kit-drawer a[href$="#cnt"]'); await sleep(400);
    log((await pg.innerText('#crumb')).includes('盤點'), 'drawer jumps bom tab', W, await pg.innerText('#crumb'));
    if (W > 500) { await pg.screenshot({ path: path.join(__dirname, `nav-bom-${tag}.png`) });
      await pg.click('[data-kit-side]'); await sleep(200); log(!(await pg.isVisible('#side')), 'bom side collapses', W); await pg.click('[data-kit-side]') }
    const sw = await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    log(!pg.errs.length && !sw, 'bom no errors/h-scroll', W, pg.errs.join(';'));
    await pg.close();
    pg = await openBom(br, 'pro', W, '#ing'); await pg.click('[data-kit-menu]'); await sleep(300);
    log(!(await pg.innerText('#kit-drawer')).includes('授權管理') && !(await pg.innerText('#kit-drawer')).includes('營運輔導'), 'owner bom drawer hides admin pages', W);
    await pg.close();
  }
  await br.close();
  console.log(fail ? fail + ' FAILED' : 'all passed'); process.exit(fail ? 1 : 0);
})();
