// 健檢名單管理頁：假的 supabase-js，測未登入、非管理員、管理員（列表、改狀態、備註、複製連結），桌機＋手機。
// node tests/checkup_leads_page.test.js
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs'); const assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '../checkup/leads/index.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '../checkup/score.js'), 'utf8');
const L = [
  { id: 3, created_at: '2026-10-20T03:00:00Z', status_at: new Date(Date.now()-5*864e5).toISOString(), brand: '追蹤店', contact_name: '陳', phone: null, line_id: 'chen', email: null, total: 55, scores: { prod: 50 }, finance: {}, answers: {}, source: 'fb', status: '已聯絡', note: null },
  { id: 2, created_at: new Date().toISOString(), brand: '好吃鍋', contact_name: '王老闆', phone: '0912', line_id: 'wang', email: null, biz_type: '火鍋／鍋物', stores: 2, total: 48, scores: { prod: 60, mkt: 40, hr: 30, rd: 50, fin: 55, info: 53 }, finance: { revenue: '600000', food: '220000', labor: '150000', rent: '60000' }, answers: {}, source: 'ig', status: '新名單', note: null },
  { id: 1, created_at: '2026-10-01T03:00:00Z', brand: '舊客', contact_name: '李', phone: null, line_id: null, email: 'a@b.c', total: 80, scores: {}, finance: {}, answers: { p1: 3, p2: 0 }, source: '', status: '不需要', note: 'x' },
];
const BRIEF = { weak: [{ dim: 'mkt', name: '銷', full: '行銷與營收', score: 40, issues: [{ q: '清楚知道目標客群', answer: '沒有', issue: '定位不清楚<b>', fix: '做一次客群與競品調研' }], ask: ['客人大多從哪裡知道你們？'], tool: '品牌調研' }],
  strong: '資訊與數據', script: '王老闆您好，我是品牌加辣餐飲顧問 Marvin', followup: '王老闆您好，上次健檢提到', prep: ['目前的菜單與售價'] };
const fake = (st) => `window.supabase={createClient(){const S=${JSON.stringify(st)};window.__upd=[];
const q=(t)=>{let rows=(S.tables[t]||[]).slice();let up=null;const o={select(){return o},eq(k,v){if(up){window.__upd.push([t,up,k,v]);return Promise.resolve({error:null})}rows=rows.filter(r=>r[k]===v);return o},order(){return o},limit(){return Promise.resolve({data:rows,error:null})},
maybeSingle(){return Promise.resolve({data:rows[0]||null})},update(p){up=p;return o}};return o};
return {from:q,rpc:async(n,a)=>{(window.__rpc=window.__rpc||[]).push([n,a]);return S.brief?{data:S.brief,error:null}:{data:null,error:{message:'not allowed'}}},auth:{getSession:async()=>({data:{session:S.user?{user:S.user}:null}}),signInWithPassword:async()=>({error:{message:'bad'}}),signOut:async()=>{}}}}}`;
const cases = [
  ['未登入', { user: null, tables: {} }, ['登入', '管理員帳號']],
  ['非管理員', { user: { id: 'u' }, tables: { bom_profiles: [{ user_id: 'u', role: 'client' }] } }, ['只限管理員']],
  ['管理員', { user: { id: 'a' }, tables: { bom_profiles: [{ user_id: 'a', role: 'admin' }], checkup_leads: L }, brief: BRIEF }, ['分享健檢', 'Instagram', '好吃鍋｜王老闆', '待聯絡', '人 30', '銷 40', '5 天沒進展，該追蹤']],
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
        // 通知信連結：?id=1（已結案）→ 自動切到全部、展開答案
        await pg.goto('https://ck.test/bom-center/checkup/leads/?id=1'); await pg.waitForTimeout(250);
        assert.ok(await pg.$eval('#lead-1 details[data-brief]', d => d.open), 'focus brief open');
        const b1 = await pg.innerText('#lead-1'); assert.ok(b1.includes('邀約話術') && b1.includes('做一次客群與競品調研') && b1.includes('定位不清楚<b>') && b1.includes('客人大多從哪裡知道你們'), 'brief shown');
        await pg.click('#lead-1 [data-bcopy=script]'); assert.strictEqual(await pg.evaluate(() => navigator.clipboard.readText()), BRIEF.script);
        assert.deepStrictEqual(await pg.evaluate(() => window.__rpc), [['checkup_brief', { p_id: 1 }]]);
        await pg.click('#lead-1 details:not([data-brief]) summary');
        assert.ok(await pg.$eval('[data-tab=all]', b => b.classList.contains('on')), 'switched to all');
        const t1 = await pg.innerText('#lead-1'); assert.ok(t1.includes('每道菜都有標準食譜') && t1.includes('完整且持續'), 'answers shown');
        await pg.goto('https://ck.test/bom-center/checkup/leads/?id=2'); await pg.waitForTimeout(250);
        await pg.click('#lead-2 details:not([data-brief]) summary'); assert.ok((await pg.innerText('#lead-2')).includes('兩平營業額'), 'kpi shown');
        if (vw.width === 375) await pg.screenshot({ path: path.join(process.env.SHOT_DIR || require('os').tmpdir(), 'leads-mobile.png'), fullPage: true });
      }
      assert.deepStrictEqual(errs, []); console.log('PASS', name, vw.width);
    } catch (e) { fail++; console.log('FAIL', name, vw.width, e.message, errs); }
    await ctx.close();
  }
  await br.close(); console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
})();
