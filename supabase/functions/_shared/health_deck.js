// 每月經營健檢簡報：從損益中心的月報算出指標、燈號、兩平點與三項建議，用 pptxgenjs 產生 .pptx。
// 純 JS，Deno（edge function）與 Node 都能跑。rows 格式：[{ m:'YYYY-MM', s:'營業收入'|'營業成本'|'營業費用', c:科目中類, a:金額 }]
// 品牌加辣（顧問工作室）配色；不使用任何客戶公司的模板。

const COL = { ink: '1A1A1A', red: 'AE140C', gold: 'F9B900', green: '016936', orange: 'E08208', grey: '8C8C8C', paper: 'F4F2EF', line: 'D9D4CE', white: 'FFFFFF' };
const FONT = 'Microsoft JhengHei';
const STUDIO = '品牌加辣餐飲顧問工作室';

// 燈號門檻（佔營收比例）：[綠燈上限, 黃燈上限]；net 與 safety 是越高越好
export const BENCH = {
  food: { name: '食材成本率', g: 0.35, y: 0.40 },
  labor: { name: '人事費用率', g: 0.25, y: 0.30 },
  rent: { name: '租金率', g: 0.10, y: 0.15 },
  prime: { name: '主成本率（食材＋人事）', g: 0.60, y: 0.65 },
  platform: { name: '外送平台抽成（佔外送營收）', g: 0.30, y: 0.36 },
  net: { name: '淨利率', g: 0.10, y: 0.0, up: true },
  safety: { name: '安全邊際（營收高於兩平點）', g: 0.15, y: 0.0, up: true },
};
export const light = (k, v) => {
  const b = BENCH[k]; if (v == null || !isFinite(v)) return 'na';
  if (b.up) return v >= b.g ? 'g' : v >= b.y ? 'y' : 'r';
  return v <= b.g ? 'g' : v <= b.y ? 'y' : 'r';
};

const isLabor = c => /人事|薪資|勞健保|獎金/.test(c);
const isRent = c => /租金/.test(c);
const isPlatformFee = c => /平台費用|平台抽成|外送平台/.test(c);
const isDeliveryRev = c => /外送|UBER|熊貓|foodpanda|夠麻吉/i.test(c);

export function monthStats(rows, m) {
  const R = { total: 0, by: {} }; let C = 0, O = 0, labor = 0, rent = 0, plat = 0, dRev = 0;
  for (const r of rows) {
    if (r.m !== m) continue; const a = Number(r.a) || 0;
    if (r.s === '營業收入') { R.total += a; R.by[r.c] = (R.by[r.c] || 0) + a; if (isDeliveryRev(r.c)) dRev += a; }
    else if (r.s === '營業成本') C += a;
    else if (r.s === '營業費用') { O += a; if (isLabor(r.c)) labor += a; if (isRent(r.c)) rent += a; if (isPlatformFee(r.c)) plat += a; }
  }
  const rev = R.total, net = rev - C - O, d = x => rev ? x / rev : null;
  // 兩平點：人事與租金視為固定，其餘（食材、平台、水電、耗材…）視為隨營收變動
  const fixed = labor + rent, variable = C + O - fixed, vr = rev ? variable / rev : null;
  const be = vr != null && vr < 1 ? fixed / (1 - vr) : null;
  return {
    m, rev, cogs: C, opex: O, net, labor, rent, platformFee: plat, deliveryRev: dRev, channels: R.by,
    r: { food: d(C), labor: d(labor), rent: d(rent), prime: d(C + labor), net: d(net), platform: dRev ? plat / dRev : null, safety: be && rev ? (rev - be) / rev : null },
    breakeven: be, fixed, varRate: vr,
  };
}

// 每月排程要做的月份：台北時間的上個月（YYYY-MM）
export function targetMonth(now = new Date()) {
  const t = new Date(now.getTime() + 8 * 3600e3);
  const y = t.getUTCFullYear(), m = t.getUTCMonth(); // m 是本月（0 起算），上個月就是 m
  return m === 0 ? `${y - 1}-12` : `${y}-${String(m).padStart(2, '0')}`;
}

// 排程時資料最新月份比目標月份舊 → 不產生舊月份的簡報（避免 11 月寄出 6 月的健檢）
export function isStale(H, target) {
  return !H || H.month < target;
}

export function computeHealth(rows, month) {
  const months = [...new Set(rows.map(r => r.m))].sort();
  if (!months.length) return null;
  const m = month && months.includes(month) ? month : months[months.length - 1];
  const idx = months.indexOf(m), cur = monthStats(rows, m), prev = idx > 0 ? monthStats(rows, months[idx - 1]) : null;
  const trend = months.slice(Math.max(0, idx - 5), idx + 1).map(x => monthStats(rows, x));
  const lights = Object.keys(BENCH).map(k => ({ k, name: BENCH[k].name, v: cur.r[k], l: light(k, cur.r[k]), pv: prev ? prev.r[k] : null }));
  return { month: m, cur, prev, trend, lights, advice: advise(cur, prev) };
}

const pct = v => v == null || !isFinite(v) ? '–' : (v * 100).toFixed(1) + '%';
const ntd = v => v == null || !isFinite(v) ? '–' : 'NT$' + Math.round(v).toLocaleString('en-US');
export const fmt = { pct, ntd };

// 依嚴重度挑三件事：紅燈優先，再看黃燈與本月惡化最多的項目
export function advise(cur, prev) {
  const T = {
    food: v => [`食材成本率 ${pct(v)}，超過 ${pct(BENCH.food.y)} 的警戒線`, '先在 BOM 運算中心用「用量差異」找出理論與實際用量差最多的 5 項食材，再檢查份量標準與耗損登記。'],
    labor: v => [`人事費用率 ${pct(v)} 偏高`, '對照每小時營收排班：離峰時段減少一個班次，尖峰用兼職補位；先以兩週為一個試行週期。'],
    rent: v => [`租金率 ${pct(v)} 偏高`, '租金很難短期調降，重點放在提高坪效：延長熱門時段、增加外帶與外送品項。'],
    prime: v => [`主成本率（食材＋人事）${pct(v)}`, '主成本超過 65% 時獲利空間很薄。先處理食材與排班兩項中燈號較差的一項。'],
    platform: v => [`外送平台抽成佔外送營收 ${pct(v)}`, '檢查各平台的活動折扣是否划算，把抽成最高的平台價格調高 5~10%，或導流到自取。'],
    net: v => [v < 0 ? `本月虧損，淨利率 ${pct(v)}` : `淨利率 ${pct(v)}，低於 ${pct(BENCH.net.g)}`, '用「預估與情境」試算漲價、提高來客或降食材成本各需要多少，才能回到 10% 淨利。'],
    safety: v => [`營收只比兩平點高 ${pct(v)}`, `兩平營收約 ${ntd(cur.breakeven)}／月。營收再掉一點就會虧損，建議先穩住來客、避免新增固定支出。`],
  };
  const sev = { r: 2, y: 1, g: 0, na: -1 };
  const items = Object.keys(BENCH).map(k => {
    const v = cur.r[k], l = light(k, v), worse = prev && prev.r[k] != null && v != null ? (BENCH[k].up ? prev.r[k] - v : v - prev.r[k]) : 0;
    return { k, v, l, score: sev[l] * 10 + Math.max(0, worse) * 100 };
  }).filter(x => x.l === 'r' || x.l === 'y').sort((a, b) => b.score - a.score).slice(0, 3);
  const out = items.map(x => { const [t, a] = T[x.k](x.v); return { k: x.k, l: x.l, title: t, action: a }; });
  if (!out.length) out.push({ k: 'ok', l: 'g', title: '各項指標都在綠燈範圍', action: '維持目前做法，下個月重點放在提高營收：檢視四象限中的明星品項，加強曝光與加購。' });
  if (prev && cur.rev && prev.rev) {
    const g = cur.rev / prev.rev - 1;
    if (g < -0.1 && out.length < 3) out.push({ k: 'rev', l: 'y', title: `營收比上月少 ${pct(-g)}`, action: '確認是否為季節性；若不是，檢查外送平台排名、評價與內用來客數。' });
  }
  return out;
}

const LC = { g: COL.green, y: COL.orange, r: COL.red, na: COL.grey };
const LT = { g: '綠燈', y: '黃燈', r: '紅燈', na: '無資料' };

// 產生簡報，回傳 pptxgen 物件（呼叫端決定輸出 base64／檔案）
export function buildDeck(PptxGen, H, meta) {
  const p = new PptxGen(); p.layout = 'LAYOUT_16x9'; p.company = STUDIO; p.title = `${meta.brand} ${H.month} 經營健檢`;
  const W = 10, base = { fontFace: FONT, color: COL.ink };
  const [yy, mm] = H.month.split('-'), title = `${yy} 年 ${Number(mm)} 月 經營健檢`, c = H.cur, pv = H.prev;
  const head = (s, t, sub) => {
    s.background = { color: COL.white };
    s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: 5.625, fill: { color: COL.red } });
    s.addText(t, { ...base, x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 24, bold: true });
    if (sub) s.addText(sub, { ...base, x: 0.5, y: 0.85, w: 9, h: 0.4, fontSize: 13, color: COL.grey });
    s.addText(`${meta.brand}｜${title}｜${STUDIO}`, { ...base, x: 0.5, y: 5.2, w: 9, h: 0.3, fontSize: 9, color: COL.grey });
  };
  // 1 封面
  let s = p.addSlide(); s.background = { color: COL.ink };
  s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 5.625, fill: { color: COL.red } });
  s.addText(meta.brand, { ...base, x: 0.7, y: 1.3, w: 8.5, h: 0.6, fontSize: 18, color: COL.gold });
  s.addText(title, { ...base, x: 0.7, y: 1.9, w: 8.5, h: 1.0, fontSize: 36, bold: true, color: COL.white });
  s.addText(`資料來源：損益分析中心月報（${H.trend[0].m} ~ ${H.month}）`, { ...base, x: 0.7, y: 3.0, w: 8.5, h: 0.5, fontSize: 14, color: COL.line });
  s.addText(STUDIO + '｜顧問會員專屬', { ...base, x: 0.7, y: 4.8, w: 8, h: 0.4, fontSize: 12, color: COL.gold });

  // 2 本月重點
  s = p.addSlide(); head(s, '本月重點', pv ? `和 ${pv.m} 相比` : '第一個月份，下個月起會顯示與上月比較');
  const tiles = [
    ['營業收入', ntd(c.rev), pv ? c.rev - pv.rev : null, true],
    ['本月淨利', ntd(c.net), pv ? c.net - pv.net : null, true],
    ['淨利率', pct(c.r.net), pv && pv.r.net != null && c.r.net != null ? c.r.net - pv.r.net : null, true, true],
    ['主成本率', pct(c.r.prime), pv && pv.r.prime != null && c.r.prime != null ? c.r.prime - pv.r.prime : null, false, true],
  ];
  tiles.forEach((t, i) => {
    const x = 0.5 + i * 2.3, good = t[2] == null ? null : (t[3] ? t[2] >= 0 : t[2] <= 0);
    s.addShape(p.ShapeType.rect, { x, y: 1.5, w: 2.1, h: 2.2, fill: { color: COL.paper }, line: { color: COL.line } });
    s.addText(t[0], { ...base, x: x + 0.15, y: 1.6, w: 1.8, h: 0.4, fontSize: 13, color: COL.grey });
    s.addText(t[1], { ...base, x: x + 0.1, y: 2.1, w: 1.95, h: 0.7, fontSize: t[1].length > 8 ? 16 : 20, bold: true });
    if (t[2] != null) s.addText((t[2] >= 0 ? '▲ ' : '▼ ') + (t[4] ? (Math.abs(t[2]) * 100).toFixed(1) + ' 個百分點' : ntd(Math.abs(t[2]))), { ...base, x: x + 0.15, y: 2.9, w: 1.8, h: 0.4, fontSize: 12, color: good ? COL.green : COL.red });
  });
  s.addText(`本月最需要注意：${H.advice[0].title}`, { ...base, x: 0.5, y: 4.1, w: 9, h: 0.6, fontSize: 15, bold: true, color: H.advice[0].l === 'g' ? COL.green : COL.red });

  // 3 燈號
  s = p.addSlide(); head(s, '經營燈號', '綠燈：健康　黃燈：注意　紅燈：需要處理');
  const rowsT = [[{ text: '指標', options: { bold: true } }, { text: '本月', options: { bold: true } }, { text: '上月', options: { bold: true } }, { text: '綠燈標準', options: { bold: true } }, { text: '燈號', options: { bold: true } }]]
    .concat(H.lights.map(L => [L.name, pct(L.v), pct(L.pv), (BENCH[L.k].up ? '≥ ' : '≤ ') + pct(BENCH[L.k].g), { text: LT[L.l], options: { color: COL.white, bold: true, fill: { color: LC[L.l] }, align: 'center' } }]));
  s.addTable(rowsT, { x: 0.5, y: 1.35, w: 9, colW: [3.4, 1.3, 1.3, 1.6, 1.4], fontFace: FONT, fontSize: 12, color: COL.ink, border: { type: 'solid', color: COL.line, pt: 0.5 }, rowH: 0.42 });

  // 4 趨勢：兩張圖各自的座標軸，從 0 開始，避免誇大變化
  s = p.addSlide(); head(s, '近 6 個月營收與淨利', H.trend.length > 1 ? `${H.trend[0].m} ~ ${H.month}` : '下個月起會顯示趨勢');
  const labels = H.trend.map(t => t.m.slice(2).replace('-', '/'));
  const ax = { catAxisLabelFontFace: FONT, valAxisLabelFontFace: FONT, valAxisLabelFormatCode: '#,##0', showValue: true, dataLabelFormatCode: '#,##0', dataLabelFontSize: 9, barGapWidthPct: 50, valGridLine: { color: 'EEEEEE', size: 0.5 }, showTitle: true, titleFontFace: FONT, titleFontSize: 13 };
  s.addChart(p.ChartType.bar, [{ name: '營業收入', labels, values: H.trend.map(t => Math.round(t.rev)) }], { ...ax, x: 0.4, y: 1.3, w: 4.6, h: 3.7, chartColors: ['8C8C8C'], title: '營業收入', valAxisMinVal: 0 });
  s.addChart(p.ChartType.bar, [{ name: '淨利', labels, values: H.trend.map(t => Math.round(t.net)) }], { ...ax, x: 5.1, y: 1.3, w: 4.6, h: 3.7, chartColors: [COL.red], invertIfNegative: false, title: '淨利' });

  // 5 營收結構
  s = p.addSlide(); head(s, '營收來源', `外送佔營收 ${pct(c.rev ? c.deliveryRev / c.rev : null)}`);
  const ch = Object.entries(c.channels).sort((a, b) => b[1] - a[1]);
  if (ch.length) s.addChart(p.ChartType.bar, [{ name: '營收', labels: ch.map(x => x[0]), values: ch.map(x => Math.round(x[1])) }], { x: 0.5, y: 1.3, w: 9, h: 3.7, barDir: 'bar', chartColors: [COL.red], showValue: true, dataLabelFormatCode: '#,##0', valAxisHidden: true, valGridLine: { style: 'none' }, catAxisLabelFontFace: FONT, catAxisLabelFontSize: 12 });

  // 6 兩平點
  s = p.addSlide(); head(s, '損益兩平點', '人事與租金視為固定支出，其餘視為隨營收變動');
  const be = [['每月固定支出（人事＋租金）', ntd(c.fixed)], ['變動成本率', pct(c.varRate)], ['兩平營收（每月）', ntd(c.breakeven)], ['本月營收', ntd(c.rev)], ['安全邊際', pct(c.r.safety)]];
  s.addTable(be.map((r, i) => [{ text: r[0], options: { bold: i === 2 } }, { text: r[1], options: { align: 'right', bold: i === 2, color: i === 2 ? COL.red : COL.ink } }]), { x: 1.5, y: 1.5, w: 7, colW: [4.5, 2.5], fontFace: FONT, fontSize: 16, border: { type: 'solid', color: COL.line, pt: 0.5 }, rowH: 0.55 });

  // 7 三件事
  s = p.addSlide(); head(s, '下個月先做這三件事', '依燈號嚴重度與本月變化排序');
  H.advice.slice(0, 3).forEach((a, i) => {
    const y = 1.35 + i * 1.25;
    s.addShape(p.ShapeType.rect, { x: 0.5, y, w: 0.12, h: 1.05, fill: { color: LC[a.l] } });
    s.addText(`${i + 1}. ${a.title}`, { ...base, x: 0.8, y, w: 8.7, h: 0.45, fontSize: 16, bold: true });
    s.addText(a.action, { ...base, x: 0.8, y: y + 0.45, w: 8.7, h: 0.6, fontSize: 13, color: '3A3A3A', valign: 'top' });
  });

  // 8 結尾
  s = p.addSlide(); s.background = { color: COL.ink };
  s.addText('有問題直接回覆顧問', { ...base, x: 0.7, y: 1.8, w: 8.5, h: 0.8, fontSize: 28, bold: true, color: COL.white });
  s.addText('顧問會員每月可預約一次線上諮詢，帶著這份簡報一起討論最有效率。\n數字來自你上傳到損益分析中心的月報；月報有更新，下個月的簡報會自動重算。', { ...base, x: 0.7, y: 2.7, w: 8.5, h: 1.2, fontSize: 14, color: COL.line });
  s.addText(STUDIO, { ...base, x: 0.7, y: 4.8, w: 8, h: 0.4, fontSize: 12, color: COL.gold });
  return p;
}
