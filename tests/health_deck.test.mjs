// node tests/health_deck.test.mjs [輸出資料夾]：用模擬門市資料產生健檢簡報並檢查指標
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path';
import { computeHealth, buildDeck, light, targetMonth, isStale } from '../supabase/functions/_shared/health_deck.js';
const require = createRequire(import.meta.url); const PptxGen = require('pptxgenjs');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m) } else console.log('ok  ', m) };
// 模擬門市：6 個月，第 6 個月食材成本拉高
const rows = []; const ms = ['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06'];
ms.forEach((m, i) => {
  const rev = 900000 + i * 10000;
  rows.push({ m, s: '營業收入', c: '內用/外帶', a: rev * 0.6 }, { m, s: '營業收入', c: 'UBER外送', a: rev * 0.4 });
  rows.push({ m, s: '營業成本', c: '食材成本', a: rev * (i === 5 ? 0.42 : 0.33) });
  rows.push({ m, s: '營業費用', c: '人事費用', a: 210000 }, { m, s: '營業費用', c: '租金', a: 100000 }, { m, s: '營業費用', c: 'UBER平台費用', a: rev * 0.4 * 0.32 }, { m, s: '營業費用', c: '水電燃料', a: 45000 });
});
const H = computeHealth(rows);
ok(H.month === '2026-06' && H.trend.length === 6, '取最新月份與 6 個月趨勢');
ok(Math.abs(H.cur.r.food - 0.42) < 1e-9 && light('food', H.cur.r.food) === 'r', '食材成本率 42% 紅燈');
ok(H.advice[0].k === 'food', '第一項建議是食材（紅燈且惡化最多）');
ok(H.cur.breakeven > 0 && H.cur.breakeven < H.cur.rev * 2, '兩平點合理');
ok(Math.abs(H.cur.r.platform - 0.32) < 1e-9, '平台抽成 = 平台費用 / 外送營收');
const H1 = computeHealth(rows.filter(r => r.m === '2026-01'));
ok(H1.prev === null && H1.advice.length >= 1, '只有一個月也能產生');
ok(computeHealth([]) === null, '沒有資料回傳 null');
ok(targetMonth(new Date('2026-11-05T01:00:00Z')) === '2026-10', '11/5 排程做 10 月');
ok(targetMonth(new Date('2026-01-04T20:00:00Z')) === '2025-12', '1 月排程做去年 12 月');
ok(targetMonth(new Date('2026-01-31T17:00:00Z')) === '2026-01', '台北已是 2/1 就做 1 月');
ok(isStale(computeHealth(rows, '2026-10'), '2026-10') && computeHealth(rows, '2026-10').month === '2026-06', '只有到 6 月的資料，10 月排程判定為過期');
ok(!isStale(computeHealth(rows, '2026-05'), '2026-05') && computeHealth(rows, '2026-05').month === '2026-05', '指定有資料的月份就用那個月');
const p = buildDeck(PptxGen, H, { brand: '模擬門市' });
const out = process.argv[2] || '/tmp'; const f = path.join(out, '健檢簡報_模擬門市_2026-06.pptx');
await p.writeFile({ fileName: f }); ok(fs.statSync(f).size > 20000, '簡報檔產生 ' + f);
console.log(fail ? fail + ' failed' : 'all passed'); process.exit(fail ? 1 : 0);
