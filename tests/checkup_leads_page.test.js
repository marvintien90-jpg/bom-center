// 健檢名單管理頁：假的 supabase-js，測未登入、非管理員、管理員（列表、改狀態、備註、複製連結），桌機＋手機。
// node tests/checkup_leads_page.test.js
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs'); const assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '../checkup/leads/index.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '../checkup/score.js'), 'utf8');
const L = [
  { id: 2, created_at: new Date().toISOString(), brand: '好吃鍋', contact_name: '王老闆', phone: '0912', line_id: 'wang', email: null, biz_type: '火鍋／鍋物', stores: 2, total: 48, scores: { prod: 60, mkt: 40, hr: 30, rd: 50, fin: 55, info: 53 }, finance: { revenue: '600000', food: '220000' }, source: 'ig', status: '新名單', note: null },
  { id: 1, created_at: '2026-10-01T03:00:00Z', brand: '舊客', contact_name: '李', phone: null, line_id: null, email: 'a@b.c', total: 80, scores: {}, finance: {}, source: '', status: '不需要', note: 'x' },
];
const fake = (st) => `window.supabase={createClient(){const S=${JSON.stringify(st)};window.__upd=[];
const q=(t)=>{let rows=(S.tables[t]||[]).slice();let up=null;const o={select(){return o},eq(k,v){if(up){window.__upd.push([t,up,k,v]);return Promise.resolve({error:null})}rows=rows.filter(r=>r[k]===v);return o},order(){return o},limit(){return Promise.resolve({data:rows,error:null})},
maybeSingle(){return Promise.resolve({data:rows[0]||null})},update(p){up=p;return o}};return o};
return {from:q,auth:{getSession:async()=>({data:{session:S.user?{user:S.user}:null}}),signInWithPassword:async()=>({error:{message:'bad'}}),signOut:async()=>{}}}}}`;
const cases = [
  ['未登入', { user: null, tables: {} }, ['登入', '管理員帳號']],
  ['非管理員', { user: { id: 'u' }, tables: { bom_profiles: [{ user_id: 'u', role: 'client' }] } }, ['只限管理員']],
  ['管理員', { user: { id: 'a' }, tables: { bom_profiles: [{ user_id: 'a', role: 'admin' }], checkup_leads: L } }, ['分享健檢', 'Instagram', '好吃鍋｜王老闆', '待聯絡', '人 30', '銷 40']],
];
(async () => {
  const br = await chromium.launch(); let fail = 0;
  for (const [name, st, want] of cases) for (const vw of [{ width: 1100, height: 900 }, { width: 375, height: 800 }]) {
    const ctx = await br.newContext({ viewport: vw, permissions: ['clipboard-read', 'clipboard-write'] }); const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    await pg.route('**/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: fake(st) }));
    await pg.route('https://ck.test/bom-center/checkup/score.js', r => r.fulfill({ contentType: 'application/javascript', body: js }));
    await pg.route(u => u.pathname === '/bom-center/checkup/leads/', r => r.fulfill({ contentType: 'text/html', body: html }));
    try {
      await pg.goto('https://ck.test/bom-center/checkup/leads/'); await pg.waitForTimeout(250);
      const txt = await pg.innerText('body'); const miss = want.filter(w => !txt.includes(w)); assert.deepStrictEqual(miss, []);
      assert.ok(!(await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'h-scroll');
      if (name === '管理員') {
        assert.ok(!txt.includes('舊客'), 'closed lead hidden in 待處理');
        await pg.click('[data-tab=all]'); assert.ok((await pg.innerText('body')).includes('舊客'));
        await pg.click('[data-copy=ig]'); const clip = await pg.evaluate(() => navigator.clipboard.readText());
        assert.strictEqual(clip, 'https://ck.test/bom-center/checkup/?src=ig');
        await pg.click('[data-copy=""]'); assert.strictEqual(await pg.evaluate(() => navigator.clipboard.readText()), 'https://ck.test/bom-center/checkup/');
        await pg.selectOption('.lead[data-id="2"] [data-status]', '已聯絡'); await pg.waitForTimeout(100);
        await pg.fill('.lead[data-id="2"] [data-note]', '週五回電'); await pg.click('h1'); await pg.waitForTimeout(100);
        const upd = await pg.evaluate(() => window.__upd);
        assert.deepStrictEqual(upd, [['checkup_leads', { status: '已聯絡' }, 'id', 2], ['checkup_leads', { note: '週五回電' }, 'id', 2]]);
        if (vw.width === 375) await pg.screenshot({ path: path.join(process.env.SHOT_DIR || __dirname, 'leads-mobile.png'), fullPage: true });
      }
      assert.deepStrictEqual(errs, []); console.log('PASS', name, vw.width);
    } catch (e) { fail++; console.log('FAIL', name, vw.width, e.message, errs); }
    await ctx.close();
  }
  await br.close(); console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
})();
