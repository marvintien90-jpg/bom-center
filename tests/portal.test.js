// 餐策雲 DineOS冒煙測試：用假的 supabase-js 載入 portal/index.html，檢查各種業主看到的系統與狀態正確、沒有 JS 錯誤、手機不會左右捲。
// node tests/portal.test.js
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const html = fs.readFileSync(path.join(__dirname, '../portal/index.html'), 'utf8');
const fake = (state) => `window.supabase={createClient(){const S=${JSON.stringify(state)};
const q=(t)=>{let rows=(S.tables[t]||[]).slice();const o={select(){return o},eq(k,v){rows=rows.filter(r=>r[k]===v);return o},order(){return o},
maybeSingle(){return Promise.resolve({data:rows[0]||null})},upsert(x){(window.__w=window.__w||[]).push(['upsert',t,x]);return Promise.resolve({error:null})},delete(){(window.__w=window.__w||[]).push(['delete',t]);return o},then(r){return Promise.resolve({data:rows,error:null}).then(r)}};return o};
return {from:q,rpc:async(n)=>S.rpc&&S.rpc[n]?{data:S.rpc[n],error:null}:{data:null,error:{message:'Could not find the function'}},auth:{getSession:async()=>({data:{session:S.user?{user:S.user}:null}}),onAuthStateChange(){},signOut:async()=>{},
signInWithPassword:async(a)=>{window.__login=a;return {error:a.password==='badpass'?{message:'Invalid login credentials'}:null}},resetPasswordForEmail:async(e,o)=>{window.__reset=[e,o];return {error:null}},updateUser:async(a)=>{window.__pw=a;return {error:null}}}}}}`;
const U = { id: 'u1', email: 'o@x.com', email_confirmed_at: '2026-11-01' };
const sub = (o) => ({ id: 1, user_id: 'u1', email: 'o@x.com', company: '好吃餐飲', brand_name: '好吃鍋', plan: 'member', stores: 1, ...o });
const PLANS = [{ code: 'basic', name: '基本版', sort: 1, active: true, modules: ['bom', 'pl'] }, { code: 'pro', name: '進階版', sort: 2, active: true, modules: ['bom', 'pl', 'hr'] }, { code: 'member', name: '顧問會員', sort: 3, active: true, modules: ['bom', 'pl', 'hr'] }];
const T = (o) => ({ sub_plans: PLANS, sub_settings: [{ id: 1, grace_days: 3 }], ...o });
const cases = [
  ['未登入', { user: null, tables: {} }, ['餐策雲 DineOS', 'BOM 運算中心', '損益分析中心', '訂閱中心', '忘記密碼', '到訂閱中心註冊'], ['業主總覽', '業主入口']],
  ['免費招待業主', { user: U, tables: T({ bom_profiles: [{ user_id: 'u1', role: 'client', status: 'active' }], pl_profiles: [{ user_id: 'u1', role: 'owner', status: 'active' }], sub_subscriptions: [sub({ status: 'comp' })] }) },
    ['進入 BOM 運算中心', '進入 損益分析中心', '進入 人資與勞基法中心', '免費招待', '顧問會員', '不限期', '進入訂閱中心', '授權使用的系統模組', '✓ 人資', '帳號設定', '更改密碼', '授權來源：訂閱方案'], ['業主總覽', '未開通', '顧問工作台', '立地評估']],
  ['試用中基本版', { user: U, tables: T({ bom_profiles: [{ user_id: 'u1', role: 'client', status: 'active', expires_on: '2099-01-01' }], sub_subscriptions: [sub({ status: 'trial', plan: 'basic', trial_ends_on: '2099-01-01' })] }) },
    ['進入 BOM 運算中心', '可使用・到 2099-01-01', '試用中', '需要訂閱', '看包含這個系統的方案', '✕ 人資', '試用到 2099-01-01'], ['進入 損益分析中心', '進入 人資與勞基法中心']],
  ['沒訂閱但顧問加開人資', { user: U, tables: T({ bom_profiles: [{ user_id: 'u1', role: 'client', status: 'active' }], sub_module_grants: [{ user_id: 'u1', module: 'hr', until: null }] }) },
    ['進入 人資與勞基法中心', '授權來源：顧問加開', '還沒訂閱'], []],
  ['伺服器回傳模組', { user: U, rpc: { sub_my_modules: [{ module: 'hr', until: '2099-02-02', source: 'sub' }] }, tables: T({}) },
    ['進入 人資與勞基法中心', '可使用・到 2099-02-02'], []],
  ['等待開通', { user: U, tables: T({ bom_profiles: [{ user_id: 'u1', role: 'client', status: 'pending' }], pl_profiles: [{ user_id: 'u1', role: 'owner', status: 'active' }] }) },
    ['等待開通', '查看開通進度', '進入 損益分析中心', '還沒訂閱', '看方案、免費試用', '✕ 人資'], ['進入 BOM 運算中心', '進入 人資']],
  ['已到期', { user: U, tables: T({ bom_profiles: [{ user_id: 'u1', role: 'client', status: 'active', expires_on: '2020-01-01' }], pl_profiles: [{ user_id: 'u1', role: 'owner', status: 'active', expires_on: '2020-01-01' }], sub_subscriptions: [sub({ status: 'expired', period_end: '2020-01-01' })] }) },
    ['已於 2020-01-01 到期', '已到期', '到訂閱中心續訂', '已停止'], ['進入 BOM 運算中心', '進入 損益分析中心', '進入 人資']],
  ['損益中心 Email 沒驗證', { user: { ...U, email_confirmed_at: null }, tables: T({ pl_profiles: [{ user_id: 'u1', role: 'owner', status: 'active' }] }) },
    ['請先到信箱點驗證信'], ['進入 損益分析中心']],
  ['什麼都沒有', { user: U, tables: T({}) }, ['這個帳號還沒開通任何系統', '看方案、免費試用'], ['進入 BOM']],
  ['管理員', { user: { ...U, id: 'a1', email: 'boss@x.com' }, tables: T({
      bom_profiles: [{ user_id: 'a1', role: 'admin', status: 'active' }, { user_id: 'u1', email: 'o@x.com', role: 'client', status: 'active' }, { user_id: 'u2', email: 'p@x.com', role: 'client', status: 'pending' }],
      pl_profiles: [{ user_id: 'a1', role: 'admin', status: 'active' }, { user_id: 'u1', email: 'o@x.com', role: 'owner', status: 'active' }],
      sub_subscriptions: [sub({ status: 'comp' })], sub_module_grants: [{ user_id: 'u2', module: 'hr', until: null }] }) },
    ['業主總覽', '好吃餐飲', 'p@x.com', '免費招待', '進入訂閱管理', '管理員', '進入顧問工作台', '各方案包含的模組', '取消加開人資', '加開人資', '訂閱有效', '立地評估'], ['boss@x.com</span>']],
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
        const r = await pg.evaluate(() => window.__reset); if (!r || !/bom-center\/portal\/$/.test(r[1].redirectTo)) miss.push('重設信');
      }
      if (name === '免費招待業主' && vw.width > 400) {
        await pg.fill('#np', 'abc12345'); await pg.fill('#np2', 'abc12399'); await pg.click('#pwf button[type=submit]'); await pg.waitForTimeout(100);
        if (!(await pg.innerText('body')).includes('兩次輸入的密碼不一樣')) miss.push('密碼不一致提示');
        await pg.fill('#np', 'abc12345'); await pg.fill('#np2', 'abc12345'); await pg.click('#pwf button[type=submit]'); await pg.waitForTimeout(100);
        if ((await pg.evaluate(() => window.__pw && window.__pw.password)) !== 'abc12345' || !(await pg.innerText('body')).includes('密碼已更新')) miss.push('改密碼');
      }
      if (name === '管理員' && vw.width > 400) {
        await pg.click('[data-grant="u1"][data-mod=hr]'); await pg.waitForTimeout(150);
        const w = await pg.evaluate(() => window.__w || []); if (!w.some(x => x[0] === 'upsert' && x[2].module === 'hr' && x[2].user_id === 'u1')) miss.push('加開人資');
        await pg.screenshot({ path: path.join(__dirname, 'portal-admin-desktop.png'), fullPage: true });
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
