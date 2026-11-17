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
const { QA } = await import('../hr/content/qa.js'); const { GUIDES, BIZ } = await import('../hr/content/biz.js');
for (const q of QA) { (q.law || []).forEach(r => refOk(r) || bad.push('qa ' + q.id + ' ' + r)); (q.tpl || []).forEach(t => TEMPLATES.some(x => x.id === t) || bad.push('qa tpl ' + t)); }
if (QA.length < 50) bad.push('QA < 50'); for (const t of TEMPLATES) if (!GUIDES[t.id]) bad.push('guide ' + t.id);
console.log(bad.length ? 'FAIL refs ' + bad.join(' | ') : 'ok   引用檢查');
const fake = (user, status) => `window.supabase={createClient(){const prof=${status === 200 ? "{role:'client',status:'active',expires_on:null}" : "{role:'client',status:'pending'}"};
const db=window.__db||(window.__db={hr_settings:null,hr_employees:JSON.parse(sessionStorage.getItem('emps')||'[]')});
const save=()=>sessionStorage.setItem('emps',JSON.stringify(db.hr_employees));
const mk=tb=>{let op='sel',payload=null,id=null;const res=()=>{
  if(tb==='bom_profiles'||tb==='pl_profiles')return {data:prof};
  if(tb==='hr_settings'){if(op==='up'){db.hr_settings=payload;sessionStorage.setItem('set',JSON.stringify(payload));return {data:null}}const v=db.hr_settings||JSON.parse(sessionStorage.getItem('set')||'null');return {data:v}}
  if(op==='ins'){const r={id:'e'+Date.now()+Math.random().toString(36).slice(2,6),active:true,created_at:new Date().toISOString(),...payload};db.hr_employees.push(r);save();return {data:r}}
  if(op==='upd'){const i=db.hr_employees.findIndex(x=>x.id===id);db.hr_employees[i]={...db.hr_employees[i],...payload};save();return {data:db.hr_employees[i]}}
  if(op==='del'){db.hr_employees=db.hr_employees.filter(x=>x.id!==id);save();return {data:null}}
  return {data:db.hr_employees}};
 const q={select(){return q},order(){return q},eq(k,v){if(k==='id')id=v;return q},insert(p){op='ins';payload=p;return q},update(p){op='upd';payload=p;return q},delete(){op='del';return q},upsert(p){op='up';payload=p;return q},
  maybeSingle:async()=>res(),single:async()=>res(),then(ok,no){return Promise.resolve(res()).then(ok,no)}};return q};
return {from:mk,auth:{getSession:async()=>({data:{session:${user ? "{user:{id:'u1',email:'o@x.com'},access_token:'t'}" : 'null'}}}),onAuthStateChange(){},signOut:async()=>{},signInWithPassword:async()=>({error:{message:'Invalid login'}})}}}}`;
const pages = ['', '#qa', '#qa/pay', '#qa/all/q27', '#emp', '#emp/new', '#calc/ins', '#tpl/job-post', '#case', '#case/ot/start.wd.wd_ok', '#case/fire/start.mis.mis_light', '#case/leave/start.injury_go', '#tpl', '#tpl/contract-ft', '#tpl/layoff', '#law', '#law/LEAVE:9-1', '#law/NOTE', '#calc/ot', '#calc/sev', '#calc/al', '#calc/min', '#calc/unused', '#set', '#q/特休'];
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
const { premiums } = await import('../hr/content/insurance.js');
{ const p = premiums(29500), q = premiums(45800), r = premiums(12000, { pt: true });
  const ok = p.emp.li === 738 && p.er.li === 2582 && p.emp.nhi === 458 && p.er.nhi === 1428 && p.er.lp === 1770 && q.er.li === 4008 && q.emp.li === 1145 && r.grades.li === 12540 && r.grades.nhi === 29500;
  if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', '保費計算對照官方表'); }
await run('勞健保計算', true, 200, '#calc/ins', W, ['雇主每月負擔 5,843 元', '員工薪水扣 1,196 元'], async pg => { await pg.fill('#i1', '29500'); await pg.waitForTimeout(100); });
await run('新增員工', true, 200, '#emp/new', W, ['王小美', '兼職', '員工名單（1 人）'], async pg => {
  await pg.selectOption('#e_kind', 'pt'); await pg.fill('#e_name', '王小美'); await pg.fill('#e_rate', '200'); await pg.fill('#e_mh', '80'); await pg.click('#esave'); await pg.waitForTimeout(200); });
await run('業態與範本警告', true, 200, '#set', W, ['產出前提醒', '可能違法', '時薪 180 元低於'], async pg => {
  await pg.selectOption('#c_biz', 'hotpot'); await pg.fill('#c_co', '測試餐飲'); await pg.click('#sf button[type=submit]'); await pg.waitForTimeout(150);
  await pg.goto('https://hr.test/#tpl/contract-pt'); await pg.waitForTimeout(250);
  const g = await pg.innerText('.guide'); if (!g.includes('火鍋')) throw new Error('biz guide');
  await pg.fill('#f_rate', '180'); await pg.fill('#f_hours', '每日 10 小時，試用期隨時可解僱'); await pg.waitForTimeout(100); await pg.click('#cp'); await pg.waitForTimeout(150);
  if (!(await pg.isVisible('dialog#dlg'))) throw new Error('no dialog'); });
await run('合法不跳警告', true, 200, '#tpl/handover', W, ['已複製', '沒有發現違法疑慮'], async pg => { await pg.context().grantPermissions(['clipboard-read', 'clipboard-write']); await pg.click('#cp'); await pg.waitForTimeout(150); if (await pg.$('dialog#dlg')) throw new Error('dialog'); });
await br.close(); console.log(fail ? fail + ' failed' : 'all passed'); process.exit(fail ? 1 : 0);
