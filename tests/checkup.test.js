// 經營健檢：評分單元測試＋頁面測試（假的 supabase-js）。node tests/checkup.test.js
const assert = require('assert'); const path = require('path'); const fs = require('fs');
const C = require('../checkup/score.js');
let fail = 0; const t = (name, fn) => { try { fn(); console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, e.message); } };
const all = v => Object.fromEntries(C.DIMS.flatMap(d => d.qs.map(([id]) => [id, v])));
t('30 題六構面', () => { assert.strictEqual(C.QUESTION_COUNT, 30); assert.deepStrictEqual(C.DIMS.map(d => d.name), ['產', '銷', '人', '發', '財', '資']); });
t('全滿分 100、無建議', () => { const r = C.score(all(3)); assert.strictEqual(r.total, 100); assert.strictEqual(r.recs.length, 0); assert.strictEqual(r.gaps.length, 0); });
t('全零分 0、三個建議、五個缺口', () => { const r = C.score(all(0)); assert.strictEqual(r.total, 0); assert.strictEqual(r.recs.length, 3); assert.strictEqual(r.gaps.length, 5); });
t('最弱構面排第一', () => { const a = all(3); for (const [id] of C.DIMS[2].qs) a[id] = 0; const r = C.score(a); assert.strictEqual(r.recs[0].key, 'hr'); assert.strictEqual(r.recs.length, 1); });
t('財務指標與兩平', () => { const k = C.kpis({ revenue: '600,000', food: 210000, labor: 168000, rent: 60000, other: 42000 });
  assert.strictEqual(k.list.find(x => x.key === 'food').value, 35); assert.strictEqual(k.list.find(x => x.key === 'food').level, 'good');
  assert.strictEqual(k.list.find(x => x.key === 'margin').value, 20); assert.strictEqual(k.breakeven, Math.round(270000 / 0.65)); });
t('數字併入財構面 60/40', () => { const a = all(3); const r = C.score(a, { revenue: 100, food: 50, labor: 40, rent: 20, other: 0 }); assert.strictEqual(r.dims.find(d => d.key === 'fin').score, 60); });
t('沒填營業額不算指標', () => assert.strictEqual(C.kpis({ food: 1 }), null));
t('奇怪的答案當 0', () => { const r = C.score({ p1: 9, p2: 'x', p3: -1 }); assert.strictEqual(r.dims[0].score, 0); });

(async () => {
  const { chromium } = require('playwright');
  const dir = path.join(__dirname, '../checkup');
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), js = fs.readFileSync(path.join(dir, 'score.js'), 'utf8');
  const fake = (mode) => `window.supabase={createClient(){return {rpc:async(n,a)=>{window.__rpc=[n,a];return ${mode === 'err' ? "{data:null,error:{message:'daily limit'}}" : "{data:{id:7},error:null}"}}}}}`;
  const br = await chromium.launch();
  for (const vw of [{ width: 1200, height: 900 }, { width: 375, height: 800 }]) {
    for (const mode of ['ok', 'err']) {
      const name = `頁面 ${vw.width}px ${mode}`;
      const pg = await br.newPage({ viewport: vw }); const errs = [];
      pg.on('pageerror', e => errs.push(e.message));
      await pg.route('**/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: fake(mode) }));
      await pg.route('https://ck.test/checkup/score.js', r => r.fulfill({ contentType: 'application/javascript', body: js }));
      await pg.route(u => u.hostname === 'ck.test' && u.pathname === '/checkup/', r => r.fulfill({ contentType: 'text/html', body: html }));
      try {
        await pg.goto('https://ck.test/checkup/?src=ig');
        await pg.fill('#brand', '好吃鍋'); await pg.selectOption('#biz', '火鍋／鍋物'); await pg.click('#f1 button[type=submit]');
        // 少答一題 → 擋下
        const ids = C.DIMS.flatMap(d => d.qs.map(([id]) => id));
        for (const [i, id] of ids.entries()) if (i) await pg.click(`input[name=${id}][value="${i % 4}"]`, { force: true });
        await pg.click('#f2 button[type=submit]');
        assert.ok((await pg.innerText('#qmsg')).includes('還有 1 題'), 'missing-check');
        await pg.click(`input[name=${ids[0]}][value="2"]`, { force: true }); await pg.click('#f2 button[type=submit]');
        await pg.fill('#food', '1000'); await pg.click('#f3 button[type=submit]');
        assert.ok((await pg.innerText('#fmsg')).includes('月營業額'), 'need revenue');
        await pg.fill('#revenue', '600000'); await pg.fill('#labor', '180000'); await pg.fill('#food', '220000'); await pg.fill('#rent', '70000'); await pg.click('#f3 button[type=submit]');
        const txt = await pg.innerText('#result');
        for (const w of ['好吃鍋', '健檢結果', '最該先改善', '對應工具', '兩平營業額', '食材成本率']) assert.ok(txt.includes(w), 'result missing ' + w);
        assert.ok(await pg.isVisible('#lead'), 'lead visible');
        const sw = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1); assert.ok(!sw, 'horizontal scroll');
        await pg.click('#lsend'); assert.ok((await pg.innerText('#lmsg')).includes('稱呼'));
        await pg.fill('#cname', '王老闆'); await pg.fill('#line', 'wang'); await pg.click('#lsend'); assert.ok((await pg.innerText('#lmsg')).includes('同意'));
        await pg.check('#consent'); await pg.click('#lsend'); await pg.waitForTimeout(150);
        const lm = await pg.innerText('#lmsg');
        if (mode === 'ok') { assert.ok(lm.includes('已收到'), lm); const rpc = await pg.evaluate(() => window.__rpc);
          assert.strictEqual(rpc[0], 'checkup_submit'); assert.strictEqual(rpc[1].p.source, 'ig'); assert.strictEqual(Object.keys(rpc[1].p.answers).length, 30); assert.ok(rpc[1].p.scores.fin >= 0); }
        else assert.ok(lm.includes('預約已滿'), lm);
        // 重新整理後答案還在
        await pg.reload(); assert.ok((await pg.innerText('#result')).includes('健檢結果') || (await pg.isVisible('#f3')), 'restore');
        if (vw.width === 375 && mode === 'ok') await pg.screenshot({ path: path.join(process.env.SHOT_DIR || __dirname, 'checkup-mobile.png'), fullPage: true });
        if (vw.width === 1200 && mode === 'ok') { await pg.goto('https://ck.test/checkup/'); await pg.screenshot({ path: path.join(process.env.SHOT_DIR || __dirname, 'checkup-desktop.png'), fullPage: true }); }
        assert.deepStrictEqual(errs, []);
        console.log('PASS', name);
      } catch (e) { fail++; console.log('FAIL', name, e.message, errs); }
      await pg.close();
    }
  }
  await br.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED'); process.exit(fail ? 1 : 0);
})();
