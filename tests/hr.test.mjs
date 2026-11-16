// 人資與勞基法中心冒煙測試：假的 supabase-js＋假的權限資料，檢查各頁、電腦與手機、無 JS 錯誤、無水平捲動。
// node tests/hr.test.mjs
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const dir = path.dirname(fileURLToPath(import.meta.url));
const { LAWS, NOTES, LAWS_CHECKED } = await import('../hr/content/laws.js');
const { TEMPLATES, TEMPLATE_CATS } = await import('../hr/content/templates.js');
const { CASES } = await import('../hr/content/cases.js');
const content = { version: 't', checked: LAWS_CHECKED, laws: LAWS, notes: NOTES, cats: TEMPLATE_CATS, templates: TEMPLATES, cases: CASES };
const html = fs.readFileSync(path.join(dir, '../hr/index.html'), 'utf8');
// 內容檢查：每個條文引用、範本引用、案例連結都存在
let bad = [];
const refOk = r => { const [c, n] = r.split(':'); return c === 'NOTE' ? NOTES.some(x => x.t === n) : LAWS.some(l => l.code === c && l.articles.some(a => a[0] === n)); };
for (const t of TEMPLATES) (t.law || []).forEach(r => refOk(r) || bad.push('tpl ' + t.id + ' ' + r));
for (const c of CASES) for (const [k, n] of Object.entries(c.nodes)) {
  (n.law || []).forEach(r => refOk(r) || bad.push('case ' + c.id + '/' + k + ' ' + r));
  (n.tpl || []).forEach(t => TEMPLATES.some(x => x.id === t) || bad.push('case tpl ' + t));
  (n.opts || []).forEach(o => c.nodes[o[1]] || bad.push('case node ' + o[1]));
  if (n.next && !CASES.some(x => x.id === n.next)) bad.push('next ' + n.next);
}
console.log(bad.length ? 'FAIL refs ' + bad.join(' | ') : 'ok   引用檢查');
const fake = (user, status) => `window.supabase={createClient(){const prof=${status === 200 ? "{role:'client',status:'active',expires_on:null}" : "{role:'client',status:'pending'}"};const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:prof})};return {from:()=>q,auth:{getSession:async()=>({data:{session:${user ? "{user:{id:'u1',email:'o@x.com'},access_token:'t'}" : 'null'}}}),onAuthStateChange(){},signOut:async()=>{},signInWithPassword:async()=>({error:{message:'Invalid login'}})}}}}`;
const pages = ['', '#case', '#case/ot/start.wd.wd_ok', '#case/fire/start.mis.mis_light', '#case/leave/start.injury_go', '#tpl', '#tpl/contract-ft', '#tpl/layoff', '#law', '#law/LEAVE:9-1', '#law/NOTE', '#calc/ot', '#calc/sev', '#calc/al', '#calc/min', '#calc/unused', '#set', '#q/特休'];
const br = await chromium.launch(); let fail = bad.length ? 1 : 0;
const run = async (label, user, status, hash, vw, want, fn) => {
  const pg = await br.newPage({ viewport: vw }); const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: fake(user, status) }));
  await pg.route('https://hr.test/content/*', r => { const f = new URL(r.request().url()).pathname.split('/').pop(); r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(dir, '../hr/content/', f), 'utf8') }); });
  await pg.route('https://hr.test/', r => r.fulfill({ contentType: 'text/html', body: html }));
  await pg.goto('https://hr.test/' + hash); await pg.waitForTimeout(250);
  const miss = [];
  if (fn) await fn(pg, miss);
  const txt = await pg.innerText('body'); (want || []).forEach(w => txt.includes(w) || miss.push(w));
  const sw = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const ok = !errs.length && !miss.length && !sw; if (!ok) fail++;
  console.log(ok ? 'ok  ' : 'FAIL', label, hash, vw.width, errs.join(';'), miss.join(','), sw ? 'horizontal-scroll' : '');
  await pg.close();
};
for (const vw of [{ width: 1200, height: 900 }, { width: 375, height: 800 }]) {
  await run('未登入', false, 200, '', vw, ['登入', '忘記密碼']);
  await run('沒權限', true, 403, '', vw, ['還沒開通', '會員中心']);
  for (const h of pages) await run('業主', true, 200, h, vw, h === '' ? ['常見情境', '29,500'] : null);
}
const W = { width: 1200, height: 900 };
await run('案例走完', true, 200, '#case/ot', W, ['照倍率給加班費', '勞基法 24'], async pg => { await pg.click('text=平常上班日'); await pg.click('text=都有'); await pg.waitForTimeout(100); await pg.click('.chip[data-ref="LSA:24"]'); await pg.waitForTimeout(100); const t = await pg.innerText('.lawbox'); if (!t.includes('三分之一')) throw new Error('law text'); });
await run('範本帶入', true, 200, '#set', W, ['好吃測試有限公司', '王小明'], async pg => { await pg.fill('#c_co', '好吃測試有限公司'); await pg.click('#sf button[type=submit]'); await pg.goto('https://hr.test/#tpl/contract-ft'); await pg.waitForTimeout(200); await pg.fill('#f_emp', '王小明'); await pg.waitForTimeout(100); });
await run('加班計算', true, 200, '#calc/ot', W, ['合計應另發 560 元'], async pg => { await pg.fill('#w', '31000'); await pg.fill('#h1', '3'); await pg.waitForTimeout(100); });
await run('資遣計算', true, 200, '#calc/sev', W, ['1.500 個月', '30 日', '資遣費約 49,500 元'], async pg => { await pg.fill('#s1', '2023-03-01'); await pg.fill('#s2', '2026-03-01'); await pg.fill('#s3', '33000'); await pg.waitForTimeout(100); });
await run('特休計算', true, 200, '#calc/al', W, ['本年度特休 10 日'], async pg => { await pg.fill('#a1', '2024-06-15'); await pg.fill('#a2', '2026-11-16'); await pg.waitForTimeout(100); });
await run('最低工資', true, 200, '#calc/min', W, ['低於 2027 年最低月薪 30,900'], async pg => { await pg.selectOption('#m0', '2027'); await pg.fill('#m2', '30000'); await pg.waitForTimeout(100); });
await br.close(); console.log(fail ? fail + ' failed' : 'all passed'); process.exit(fail ? 1 : 0);
