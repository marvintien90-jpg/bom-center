// 業主入口冒煙測試：用假的 supabase-js 載入 portal/index.html，檢查各種業主看到的系統與狀態正確、沒有 JS 錯誤、手機不會左右捲。
// node tests/portal.test.js
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const html = fs.readFileSync(path.join(__dirname, '../portal/index.html'), 'utf8');
const fake = (state) => `window.supabase={createClient(){const S=${JSON.stringify(state)};
const q=(t)=>{let rows=(S.tables[t]||[]).slice();const o={select(){return o},eq(k,v){rows=rows.filter(r=>r[k]===v);return o},order(){return o},
maybeSingle(){return Promise.resolve({data:rows[0]||null})},then(r){return Promise.resolve({data:rows,error:null}).then(r)}};return o};
return {from:q,auth:{getSession:async()=>({data:{session:S.user?{user:S.user}:null}}),onAuthStateChange(){},signOut:async()=>{},
signInWithPassword:async(a)=>{window.__login=a;return {error:a.password==='badpass'?{message:'Invalid login credentials'}:null}},resetPasswordForEmail:async(e,o)=>{window.__reset=[e,o];return {error:null}}}}}}`;
const U = { id: 'u1', email: 'o@x.com', email_confirmed_at: '2026-11-01' };
const sub = (o) => ({ id: 1, user_id: 'u1', email: 'o@x.com', company: '好吃餐飲', brand_name: '好吃鍋', plan: 'member', stores: 1, ...o });
const cases = [
  ['未登入', { user: null, tables: {} }, ['BOM 運算中心', '損益分析中心', 'BOM＋損益 訂閱版', '忘記密碼', '到會員中心註冊'], ['業主總覽']],
  ['免費招待業主', { user: U, tables: { bom_profiles: [{ user_id: 'u1', role: 'client', status: 'active' }], pl_profiles: [{ user_id: 'u1', role: 'owner', status: 'active' }], sub_subscriptions: [sub({ status: 'comp' })] } },
    ['進入 BOM 運算中心', '進入損益分析中心', '免費招待', '顧問會員', '不限期', '進入會員中心'], ['業主總覽', '未開通']],
  ['試用中只有 BOM', { user: U, tables: { bom_profiles: [{ user_id: 'u1', role: 'client', status: 'active', expires_on: '2099-01-01' }], sub_subscriptions: [sub({ status: 'trial', plan: 'basic', trial_ends_on: '2099-01-01' })] } },
    ['進入 BOM 運算中心', '可使用・到 2099-01-01', '試用中', '未開通', '到會員中心續訂'], ['進入損益分析中心']],
  ['等待開通', { user: U, tables: { bom_profiles: [{ user_id: 'u1', role: 'client', status: 'pending' }], pl_profiles: [{ user_id: 'u1', role: 'owner', status: 'active' }] } },
    ['等待開通', '查看開通進度', '進入損益分析中心', '還沒訂閱', '看方案、免費試用'], ['進入 BOM 運算中心']],
  ['已到期', { user: U, tables: { bom_profiles: [{ user_id: 'u1', role: 'client', status: 'active', expires_on: '2020-01-01' }], pl_profiles: [{ user_id: 'u1', role: 'owner', status: 'active', expires_on: '2020-01-01' }], sub_subscriptions: [sub({ status: 'expired', period_end: '2020-01-01' })] } },
    ['已於 2020-01-01 到期', '已到期', '到會員中心續訂'], ['進入 BOM 運算中心', '進入損益分析中心']],
  ['損益中心 Email 沒驗證', { user: { ...U, email_confirmed_at: null }, tables: { pl_profiles: [{ user_id: 'u1', role: 'owner', status: 'active' }] } },
    ['請先到信箱點驗證信'], ['進入損益分析中心']],
  ['什麼都沒有', { user: U, tables: {} }, ['這個帳號還沒開通任何系統', '看方案、免費試用'], ['進入 BOM']],
  ['管理員', { user: { ...U, id: 'a1', email: 'boss@x.com' }, tables: {
      bom_profiles: [{ user_id: 'a1', role: 'admin', status: 'active' }, { user_id: 'u1', email: 'o@x.com', role: 'client', status: 'active' }, { user_id: 'u2', email: 'p@x.com', role: 'client', status: 'pending' }],
      pl_profiles: [{ user_id: 'a1', role: 'admin', status: 'active' }, { user_id: 'u1', email: 'o@x.com', role: 'owner', status: 'active' }],
      sub_subscriptions: [sub({ status: 'comp' })] } },
    ['業主總覽', '好吃餐飲', 'p@x.com', '免費招待', '進入訂閱管理', '管理員'], ['boss@x.com</span>']],
];
(async () => {
  const br = await chromium.launch(); let fail = 0;
  for (const [name, st, want, notWant = []] of cases) {
    for (const vw of [{ width: 1200, height: 900 }, { width: 375, height: 800 }]) {
      const pg = await br.newPage({ viewport: vw }); const errs = [];
      pg.on('pageerror', e => errs.push(e.message));
      await pg.route('**/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: fake(st) }));
      await pg.route('https://portal.test/', r => r.fulfill({ contentType: 'text/html', body: html }));
      await pg.goto('https://portal.test/'); await pg.waitForTimeout(300);
      const txt = await pg.innerText('body'); const src = await pg.content();
      const miss = want.filter(w => !txt.includes(w)).concat(notWant.filter(w => (w.includes('<') ? src : txt).includes(w)).map(w => '不該出現:' + w));
      const sw = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (name === '未登入' && vw.width > 400) {
        await pg.fill('#em', 'o@x.com'); await pg.fill('#pw', 'badpass'); await pg.click('#auth button[type=submit]'); await pg.waitForTimeout(150);
        if (!(await pg.innerText('body')).includes('Email 或密碼不正確')) miss.push('登入錯誤訊息');
        await pg.click('[data-mode=forgot]'); await pg.fill('#em', 'o@x.com'); await pg.click('#auth button[type=submit]'); await pg.waitForTimeout(150);
        const r = await pg.evaluate(() => window.__reset); if (!r || !/bom-center\/$/.test(r[1].redirectTo)) miss.push('重設信');
      }
      const ok = !errs.length && !miss.length && !sw; if (!ok) fail++;
      console.log(ok ? 'ok  ' : 'FAIL', name, vw.width, errs.join(';'), miss.join(','), sw ? 'horizontal-scroll' : '');
      if (vw.width < 400 && ['免費招待業主', '管理員'].includes(name)) await pg.screenshot({ path: path.join(__dirname, `portal-${name === '管理員' ? 'admin' : 'owner'}-mobile.png`), fullPage: true });
      if (vw.width > 400 && name === '免費招待業主') await pg.screenshot({ path: path.join(__dirname, 'portal-owner-desktop.png') });
      await pg.close();
    }
  }
  await br.close(); console.log(fail ? fail + ' failed' : 'all passed'); process.exit(fail ? 1 : 0);
})();
