// 會員中心頁面冒煙測試：用假的 supabase-js 載入 member/index.html，檢查四種畫面能正常顯示、沒有 JS 錯誤。
// node tests/member.test.js
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const html = fs.readFileSync(path.join(__dirname, '../member/index.html'), 'utf8');
const fake = (state) => `window.supabase={createClient(){const S=${JSON.stringify(state)};
const q=(t)=>{let rows=(S.tables[t]||[]).slice();const o={select(){return o},eq(k,v){rows=rows.filter(r=>r[k]===v);return o},neq(k,v){rows=rows.filter(r=>r[k]!==v);return o},order(){return o},limit(){return o},
maybeSingle(){return Promise.resolve({data:rows[0]||null})},single(){return Promise.resolve({data:rows[0]||null})},update(){return o},insert(){return Promise.resolve({error:null})},delete(){return o},then(r){return Promise.resolve({data:rows,error:null}).then(r)}};return o};
return {from:q,rpc:async(n,a)=>{window.__rpc=[n,a];return {data:{trial_ends_on:'2026-11-17'},error:null}},auth:{getSession:async()=>({data:{session:S.user?{user:S.user,access_token:'x'}:null}}),onAuthStateChange(){},signOut:async()=>{}}}}}`;
const plans = [{ code: 'basic', name: '基本版', price_per_store: 990, features: ['a'], sort: 1, active: true }, { code: 'pro', name: '進階版', price_per_store: 1500, features: ['b'], sort: 2, active: true }, { code: 'member', name: '顧問會員', price_per_store: 5000, features: ['c'], sort: 3, active: true }];
const base = { sub_plans: plans, sub_settings: [{ id: 1, signup_open: false, trial_days: 14, grace_days: 3, billing_mode: 'test' }] };
const U = { id: 'u1', email: 'o@x.com', email_confirmed_at: '2026-11-01' };
const cases = [
  ['未登入', { user: null, tables: base }, ['方案與價格', 'NT$990', '註冊新帳號']],
  ['已登入未試用', { user: U, tables: { ...base, bom_profiles: [{ user_id: 'u1', role: 'client', status: 'pending' }] } }, ['開始 14 天免費試用', '開始免費試用']],
  ['試用中', { user: U, tables: { ...base, bom_profiles: [{ user_id: 'u1', role: 'client', status: 'active' }], sub_subscriptions: [{ id: 1, user_id: 'u1', company: '好吃', brand_name: '好吃鍋', store_name: '本店', plan: 'pro', stores: 2, status: 'trial', trial_ends_on: '2026-11-17', sandbox: true, auto_renew: false }], sub_payments: [] } }, ['試用中', 'NT$3,000', '綁定信用卡自動扣款', '發票資訊', '統一編號']],
  ['免費招待', { user: U, tables: { ...base, bom_profiles: [{ user_id: 'u1', role: 'client', status: 'active' }], sub_subscriptions: [{ id: 2, user_id: 'u1', company: '一級棒', brand_name: '一級棒', store_name: '本店', plan: 'member', stores: 1, status: 'comp', trial_ends_on: '2026-11-17', sandbox: false, auto_renew: false }], sub_payments: [] } }, ['免費招待', '不限期，免付費'], ['綁定信用卡', '選這個', '發票資訊']],
  ['管理員看免費招待', { user: { ...U, id: 'a1' }, tables: { ...base, bom_profiles: [{ user_id: 'a1', role: 'admin', status: 'active' }], sub_subscriptions: [{ id: 2, user_id: 'u1', email: 'o@x.com', company: '一級棒', client_name: '一級棒讚企業社', brand_name: '一級棒', store_name: '本店', plan: 'member', stores: 1, status: 'comp', source: 'admin', sandbox: false }], sub_pilots: [], sub_log: [] } }, ['免費招待']],
  ['管理員', { user: { ...U, id: 'a1' }, tables: { ...base, bom_profiles: [{ user_id: 'a1', role: 'admin', status: 'active' }], sub_subscriptions: [], sub_pilots: [], sub_log: [] } }, ['管理：訂閱', '試點名單']],
];
(async () => {
  const br = await chromium.launch(); let fail = 0;
  for (const [name, st, want, notWant = []] of cases) {
    for (const vw of [{ width: 1200, height: 900 }, { width: 375, height: 800 }]) {
      const pg = await br.newPage({ viewport: vw }); const errs = [];
      pg.on('pageerror', e => errs.push(e.message));
      await pg.route('**/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: fake(st) }));
      await pg.route('https://member.test/', r => r.fulfill({ contentType: 'text/html', body: html }));
      await pg.goto('https://member.test/'); await pg.waitForTimeout(300);
      const txt = await pg.innerText('body'); const miss = want.filter(w => !txt.includes(w)).concat(notWant.filter(w => txt.includes(w)).map(w => '不該出現:' + w));
      const sw = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (name === '已登入未試用' && vw.width > 400) {
        await pg.fill('#co', '好吃餐飲'); await pg.fill('#br', '好吃鍋'); await pg.click('#trial button[type=submit]'); await pg.waitForTimeout(200);
        const rpc = await pg.evaluate(() => window.__rpc); if (!rpc || rpc[0] !== 'sub_start_trial' || rpc[1].p.company !== '好吃餐飲') miss.push('rpc');
      }
      const ok = !errs.length && !miss.length && !sw; if (!ok) fail++;
      console.log(ok ? 'ok  ' : 'FAIL', name, vw.width, errs.join(';'), miss.join(','), sw ? 'horizontal-scroll' : '');
      await pg.close();
    }
  }
  await br.close(); console.log(fail ? fail + ' failed' : 'all passed'); process.exit(fail ? 1 : 0);
})();
