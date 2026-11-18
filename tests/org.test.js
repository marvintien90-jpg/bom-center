// 總部組織診斷冒煙測試：權限、建立、畫組織、診斷、範本、RACI、KPI、報告、存檔衝突；無 JS 錯誤、手機不左右捲。
// node tests/org.test.js
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const html = fs.readFileSync(path.join(__dirname, '../consult/org/index.html'), 'utf8');
const fake = (state) => `window.__S=${JSON.stringify(state)};window.supabase={createClient(){const S=window.__S;let seq=100;
const q=(t)=>{const T=S.tables[t]=S.tables[t]||[];let f=[],op='select',v=null,one=false;
 const o={select(){return o},eq(k,x){f.push(r=>r[k]===x);return o},order(){return o},limit(){return o},
 insert(x){op='insert';v=x;return o},update(x){op='update';v=x;return o},delete(){op='del';return o},
 single(){one=true;return o},maybeSingle(){one=true;return o},
 then(res,rej){let out;if(S.missing&&S.missing.includes(t))out={data:null,error:{message:'relation does not exist'}};
  else if(op==='select'){const rows=T.filter(r=>f.every(g=>g(r)));out={data:one?(rows[0]||null):JSON.parse(JSON.stringify(rows)),error:null}}
  else if(op==='insert'){const r=Object.assign({id:++seq,updated_at:new Date().toISOString()},JSON.parse(JSON.stringify(v)));T.push(r);const c=JSON.parse(JSON.stringify(r));out={data:one?c:[c],error:null}}
  else if(op==='update'){const rows=T.filter(r=>f.every(g=>g(r)));rows.forEach(r=>Object.assign(r,JSON.parse(JSON.stringify(v))));out={data:JSON.parse(JSON.stringify(rows)),error:null}}
  else {S.tables[t]=T.filter(r=>!f.every(g=>g(r)));out={data:null,error:null}}
  return Promise.resolve(out).then(res,rej)}};return o};
return {from:q,auth:{getSession:async()=>({data:{session:S.user?{user:S.user}:null}}),onAuthStateChange(){},signOut:async()=>{}}}}}`;
const A = { id: 'a1', email: 'boss@x.com' }, U = { id: 'u1', email: 'o@x.com' };
const admin = (extra = {}) => Object.assign({ user: A, tables: { bom_profiles: [{ user_id: 'a1', role: 'admin', status: 'active' }], coach_clients: [{ id: 7, name: '阿明牛肉麵', stores: 5, biz_type: '麵食' }], org_plans: [] } }, extra);
let fail = 0; const log = (ok, ...m) => { if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', ...m) };
async function open(br, st, vw, hash = '') {
  const pg = await br.newPage({ viewport: vw }); pg.errs = [];
  pg.on('pageerror', e => pg.errs.push(e.message)); pg.on('dialog', d => { pg.errs.push('dialog ' + d.message()); d.dismiss() });
  await pg.route('**/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: fake(st) }));
  await pg.route('https://org.test/', r => r.fulfill({ contentType: 'text/html', body: html }));
  await pg.goto('https://org.test/' + hash); await pg.waitForTimeout(250); return pg;
}
const clean = async (pg, name) => { const t = await pg.innerText('body'); const sw = await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  const bad = ['undefined', 'NaN', '[object'].filter(w => t.includes(w)); log(!bad.length && !sw && !pg.errs.length, name, bad.join(), sw ? 'h-scroll' : '', pg.errs.join(';')); return t };
(async () => {
  const br = await chromium.launch();
  for (const vw of [{ width: 1200, height: 900 }, { width: 375, height: 800 }]) {
    const W = vw.width;
    let pg = await open(br, { user: null, tables: {} }, vw); let t = await clean(pg, 'guest ' + W); log(t.includes('請先登入'), 'guest blocked', W); await pg.close();
    pg = await open(br, { user: U, tables: { bom_profiles: [{ user_id: 'u1', role: 'client', status: 'active' }] } }, vw); t = await clean(pg, 'owner ' + W); log(t.includes('只開放顧問使用') && !t.includes('新增診斷'), 'owner blocked', W); await pg.close();
    pg = await open(br, admin({ missing: ['coach_clients'] }), vw, '#t=new'); t = await clean(pg, 'no coach table ' + W); log(t.includes('直接輸入名稱'), 'fallback without coach table', W); await pg.close();

    pg = await open(br, admin(), vw, '#t=new');
    await pg.selectOption('#n_client', '7'); await pg.fill('#n_stores', '5'); await pg.fill('#n_target', '15'); await pg.click('[data-create]'); await pg.waitForTimeout(200);
    t = await clean(pg, 'asis blank ' + W); log(t.includes('現況組織圖') && t.includes('阿明牛肉麵'), 'created plan', W);
    await pg.click('[data-edit="boss"]'); await pg.fill('#d_person', '阿明');
    for (const k of ['ops', 'rd', 'buy', 'mkt']) await pg.check(`[data-df="${k}"]`);
    await pg.click('[data-savepos]'); await pg.waitForTimeout(100);
    for (const [title, person, funcs] of [['會計', '阿美', ['fin', 'hr']], ['內場主管', '阿美', []], ['店長', '', []]]) {
      await pg.click('[data-addpos="asis"]'); await pg.fill('#d_title', title); await pg.fill('#d_person', person); for (const k of funcs) await pg.check(`[data-df="${k}"]`);
      if (title === '店長') { await pg.check('#d_st'); await pg.fill('#d_n', '5') }
      await pg.click('[data-savepos]'); await pg.waitForTimeout(80);
    }
    t = await clean(pg, 'asis drawn ' + W); log(t.includes('一人身兼 2 個職位') && t.includes('負荷過重') && t.includes('店長 ×5'), 'asis flags', W);
    await pg.click('a[href$="t=diag"]'); await pg.waitForTimeout(150);
    t = await clean(pg, 'diag ' + W); log(t.includes('4–10 店') && t.includes('建制期') && t.includes('督導與稽核') && t.includes('缺 ') && t.includes('目標 15 店'), 'diag stage & gaps', W);
    await pg.selectOption('[data-gov="jd"]', '2'); await pg.selectOption('[data-gov="mtg"]', '1'); await pg.waitForTimeout(100);
    const g = await pg.$$eval('.stat b', b => b.map(x => x.textContent)); log(+g[2] > 0, 'gov score moves', g.join(','), W);
    await pg.click('a[href$="t=tobe"]'); await pg.waitForTimeout(100);
    t = await pg.innerText('body'); log(t.includes('套用「11–30 店」範本（建議）'), 'suggests next-stage template', W);
    await pg.click('[data-tpl="2"]'); await pg.waitForTimeout(150);
    t = await clean(pg, 'tobe ' + W); log(t.includes('營運部經理') && t.includes('補齊') && t.includes('建議組織圖'), 'tobe template + compare', W);
    await pg.click('a[href$="t=duty"]'); await pg.waitForTimeout(100); t = await clean(pg, 'duty ' + W); log(t.includes('定期巡店與 QSC 稽核'), 'duties listed', W);
    await pg.uncheck('[data-duty="sup|audit|0"]');
    await pg.click('a[href$="t=raci"]'); await pg.waitForTimeout(150); t = await clean(pg, 'raci ' + W);
    const s0 = await pg.$eval('.stat b', b => b.textContent); log(s0 === '0', 'auto RACI has no conflicts', s0, W);
    const sel = await pg.$$('[data-raci^="t_open|"]'); await sel[sel.length - 1].selectOption('A'); await pg.waitForTimeout(150);
    t = await pg.innerText('body'); log(t.includes('2 人拍板'), 'detects two A', W);
    await pg.click('a[href$="t=kpi"]'); await pg.waitForTimeout(100); t = await clean(pg, 'kpi ' + W);
    const kv = await pg.$eval('[data-kpi="ops|0|n"]', e => e.value); log(kv === '營收目標達成率' && t.includes('權重 100%'), 'kpi suggested', kv, W);
    await pg.fill('[data-kpi="ops|0|w"]', '10'); await pg.dispatchEvent('[data-kpi="ops|0|w"]', 'change'); await pg.waitForTimeout(100);
    t = await pg.innerText('body'); log(t.includes('要調成 100%'), 'kpi weight warning', W);
    await pg.click('a[href$="t=rep"]'); await pg.waitForTimeout(150); t = await clean(pg, 'report ' + W);
    log(t.includes('一、診斷摘要') && t.includes('三、建議組織') && t.includes('權責分工（RACI）') && t.includes('90 天導入步驟') && !t.includes('定期巡店與 QSC 稽核'), 'report sections + duty off respected', W);
    await pg.waitForTimeout(900);
    const saved = await pg.evaluate(() => { const p = window.__S.tables.org_plans[0]; return { rev: p.rev, pos: p.data.tobe && p.data.tobe.positions.length, gov: p.data.gov.jd } });
    log(saved.rev > 1 && saved.pos > 10 && saved.gov === 2, 'autosaved to db', JSON.stringify(saved), W);
    await pg.screenshot({ path: path.join(__dirname, `org-report-${W < 500 ? 'mobile' : 'desktop'}.png`), fullPage: true });
    await pg.click('a[href$="t=tobe"]'); await pg.waitForTimeout(100); await pg.screenshot({ path: path.join(__dirname, `org-chart-${W < 500 ? 'mobile' : 'desktop'}.png`) });
    await pg.evaluate(() => { window.__S.tables.org_plans[0].rev = 99 });
    await pg.click('a[href$="t=diag"]'); await pg.waitForTimeout(100); await pg.selectOption('[data-gov="pl"]', '2'); await pg.waitForTimeout(1000);
    t = await pg.innerText('body'); log(t.includes('另一個視窗被改過'), 'conflict detected', W, await pg.$eval('#saved', e => e.textContent), JSON.stringify(await pg.evaluate(() => window.__S.tables.org_plans[0].data.gov)));
    await pg.goto('https://org.test/#'); await pg.waitForTimeout(250); t = await clean(pg, 'home ' + W); log(t.includes('阿明牛肉麵') && t.includes('現況'), 'home lists plan', W);
    await pg.close();
  }
  await br.close(); console.log(fail ? fail + ' failed' : 'all passed'); process.exit(fail ? 1 : 0);
})();
