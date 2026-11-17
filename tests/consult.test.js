// 顧問工作台冒煙測試：只有管理員看得到系統清單；業主與未登入被擋；名單數字正確；無 JS 錯誤、手機不左右捲。
// node tests/consult.test.js
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const html = fs.readFileSync(path.join(__dirname, '../consult/index.html'), 'utf8');
const fake = (state) => `window.supabase={createClient(){const S=${JSON.stringify(state)};
const q=(t)=>{let rows=(S.tables[t]||[]).slice();const o={select(){return o},eq(k,v){rows=rows.filter(r=>r[k]===v);return o},order(){return o},limit(){return o},
maybeSingle(){return Promise.resolve({data:rows[0]||null})},then(r){return Promise.resolve({data:rows,error:null}).then(r)}};return o};
return {from:q,auth:{getSession:async()=>({data:{session:S.user?{user:S.user}:null}}),onAuthStateChange(){},signOut:async()=>{}}}}}`;
const old = new Date(Date.now() - 5 * 864e5).toISOString(), now = new Date().toISOString();
const A = { id: 'a1', email: 'boss@x.com' }, U = { id: 'u1', email: 'o@x.com' };
const leads = [{ id: 1, status: '新名單', created_at: old }, { id: 2, status: '新名單', created_at: now }, { id: 3, status: '已成交', created_at: old }, { id: 4, status: '已聯絡', created_at: old, status_at: old }];
const cases = [
  ['未登入', { user: null, tables: {} }, ['請先登入', '到入口登入'], ['經營健檢', '立地評估']],
  ['業主', { user: U, tables: { bom_profiles: [{ user_id: 'u1', role: 'client', status: 'active' }], checkup_leads: leads } }, ['只開放顧問使用', '回業主入口'], ['立地評估', '名單管理']],
  ['停用的管理員', { user: A, tables: { bom_profiles: [{ user_id: 'a1', role: 'admin', status: 'disabled' }] } }, ['只開放顧問使用'], ['立地評估']],
  ['顧問', { user: A, tables: { bom_profiles: [{ user_id: 'a1', role: 'admin', status: 'active' }], checkup_leads: leads } },
    ['經營健檢', '名單管理＋顧問作業包', '餐飲立地評估', 'BOM 運算中心（顧問工具）', '菜單四象限', '損益分析中心', '品牌案件工作台', '文件與簡報管理', '招募考核範本包', '業主入口（總覽）', '訂閱與會員管理', '人資與勞基法中心', '2 筆新名單', '新名單待聯絡', '該追蹤（逾期）', '累計成交'], ['undefined', 'NaN']],
];
(async () => {
  const br = await chromium.launch(); let fail = 0;
  for (const [name, st, want, notWant] of cases) for (const vw of [{ width: 1200, height: 900 }, { width: 375, height: 800 }]) {
    const pg = await br.newPage({ viewport: vw }); const errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    await pg.route('**/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: fake(st) }));
    await pg.route('https://consult.test/', r => r.fulfill({ contentType: 'text/html', body: html }));
    await pg.goto('https://consult.test/'); await pg.waitForTimeout(300);
    const txt = await pg.innerText('body');
    const miss = want.filter(w => !txt.includes(w)), extra = notWant.filter(w => txt.includes(w));
    const sw = await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (name === '顧問') { const s = await pg.$$eval('.stat b', b => b.map(x => x.textContent)); if (s[0] !== '2' || s[1] !== '2' || s[3] !== '1') miss.push('stats ' + s.join()); }
    const ok = !miss.length && !extra.length && !errs.length && !sw;
    if (!ok) fail++;
    console.log(ok ? 'PASS' : 'FAIL', name, vw.width, miss.length ? 'missing:' + miss : '', extra.length ? 'unexpected:' + extra : '', errs.join(';'), sw ? 'h-scroll' : '');
    if (name === '顧問') await pg.screenshot({ path: path.join(__dirname, `consult-${vw.width < 500 ? 'mobile' : 'desktop'}.png`), fullPage: true });
    await pg.close();
  }
  await br.close(); console.log(fail ? fail + ' failed' : 'all passed'); process.exit(fail ? 1 : 0);
})();
