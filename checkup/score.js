// 餐飲經營健檢：題庫與評分（瀏覽器與 node 共用）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Checkup = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SCALE = ['沒有', '偶爾／部分', '大致有', '完整且持續'];

  const DIMS = [
    { key: 'prod', name: '產', full: '生產與營運', qs: [
      ['p1', '每道菜都有標準食譜（份量、做法），出餐品質一致'],
      ['p2', '算過每道菜的食材成本，進價變動時會更新'],
      ['p3', '至少每月盤點一次，並比對理論用量與實際用量'],
      ['p4', '叫貨有安全庫存規則，很少缺貨或叫太多'],
      ['p5', '有食安與衛生紀錄（溫度、效期、清潔）'] ] },
    { key: 'mkt', name: '銷', full: '行銷與營收', qs: [
      ['m1', '清楚知道目標客群，以及和競品不同的地方'],
      ['m2', '每月追蹤來客數、客單價與回客'],
      ['m3', '固定經營社群或 Google 商家，並回覆評論'],
      ['m4', '有會員、集點或其他回購機制'],
      ['m5', '外送平台與內用的毛利分開計算'] ] },
    { key: 'hr', name: '人', full: '人力資源', qs: [
      ['h1', '主要崗位都有書面 SOP'],
      ['h2', '新人有固定的訓練流程與上線檢核'],
      ['h3', '依預估營業額排班，而不是固定人數'],
      ['h4', '定期巡店或稽核，並追蹤改善到完成'],
      ['h5', '有考核或獎勵制度，員工流動率在可接受範圍'] ] },
    { key: 'rd', name: '發', full: '商品研發', qs: [
      ['r1', '每季檢視菜單，知道哪些品項賺錢又好賣'],
      ['r2', '新品上市前會試算成本、訂價與目標毛利'],
      ['r3', '新品有試作、試賣、檢討的固定流程'],
      ['r4', '會依季節或節慶規劃商品與活動'],
      ['r5', '會參考市場趨勢與競品動態調整商品'] ] },
    { key: 'fin', name: '財', full: '財務管理', qs: [
      ['f1', '每月看損益表，且在次月 15 日前完成'],
      ['f2', '知道每月的損益兩平營業額'],
      ['f3', '有年度或月預算，並每月比較預算與實際'],
      ['f4', '掌握未來 1–3 個月的現金流'],
      ['f5', '定期檢視食材、人事、租金三大成本占比'] ] },
    { key: 'info', name: '資', full: '資訊與數據', qs: [
      ['i1', 'POS 銷售資料可以匯出，並且定期拿來用'],
      ['i2', '進貨、庫存、損益資料集中在同一個地方'],
      ['i3', '主管每天或每週可以看到關鍵數字'],
      ['i4', '公告與交辦事項有追蹤，不只靠 LINE 群組'],
      ['i5', '重要文件、SOP、合約集中存放，找得到'] ] },
  ];

  // 改善建議與對應工具（顧問服務）
  const RECS = {
    prod: { tip: '先建立標準食譜與成本卡，每月盤點並看理論與實際用量的差異，找出耗損與偷料。', tool: 'BOM×ERP 運算中心（基本版）' },
    mkt: { tip: '先釐清客群與差異化定位，再每月追蹤來客數、客單價、回客三個數字。', tool: '品牌調研與定位提案' },
    hr: { tip: '先把主要崗位寫成 SOP 並配訓練檢核，再用巡店稽核追蹤執行，依營業額排班控制人事費。', tool: '門市稽核＋SOP 訓練、排班與人力成本（即將推出）' },
    rd: { tip: '用菜單工程把品項分成明星、金牛、問號、低效四類，新品上市前先過成本與毛利試算。', tool: '菜單工程與新品開發（即將推出）＋BOM 毛利試算' },
    fin: { tip: '每月固定時間出損益表，算出兩平營業額，盯緊食材、人事、租金三大成本占比。', tool: '損益分析中心' },
    info: { tip: '把 POS、進貨、損益集中到同一個系統，讓主管每週看得到關鍵數字。', tool: 'BOM＋損益中心訂閱、顧問會員每月經營月報' },
  };

  // 財務參考值（餐飲業常見範圍，顧問經驗值，非法規標準）
  const KPI = [
    { key: 'food', name: '食材成本率', good: 35, warn: 40, dir: 'low' },
    { key: 'labor', name: '人事費率', good: 28, warn: 33, dir: 'low' },
    { key: 'rent', name: '租金占比', good: 12, warn: 15, dir: 'low' },
    { key: 'prime', name: '主要成本率（食材＋人事）', good: 60, warn: 65, dir: 'low' },
    { key: 'margin', name: '營業利益率', good: 12, warn: 5, dir: 'high' },
  ];

  const num = v => { const n = Number(String(v ?? '').replace(/[,\s]/g, '')); return Number.isFinite(n) && n >= 0 ? n : null; };
  const r1 = x => Math.round(x * 10) / 10;
  const level = s => s >= 75 ? 'good' : s >= 50 ? 'warn' : 'bad';
  const LEVEL_NAME = { good: '良好', warn: '需加強', bad: '優先改善' };

  function kpis(fin) {
    const f = fin || {}; const rev = num(f.revenue);
    if (!rev) return null;
    const food = num(f.food) ?? 0, labor = num(f.labor) ?? 0, rent = num(f.rent) ?? 0, other = num(f.other) ?? 0;
    const pct = x => r1(x / rev * 100);
    const v = { food: pct(food), labor: pct(labor), rent: pct(rent), prime: pct(food + labor), margin: pct(rev - food - labor - rent - other) };
    const list = KPI.map(k => {
      const val = v[k.key]; let lv;
      if (k.dir === 'low') lv = val <= k.good ? 'good' : val <= k.warn ? 'warn' : 'bad';
      else lv = val >= k.good ? 'good' : val >= k.warn ? 'warn' : 'bad';
      return { ...k, value: val, level: lv };
    });
    const fixed = labor + rent + other, varRatio = food / rev;
    const breakeven = varRatio < 1 ? Math.round(fixed / (1 - varRatio)) : null;
    const safety = breakeven ? r1((rev - breakeven) / rev * 100) : null;
    const kscore = Math.round(list.reduce((s, k) => s + (k.level === 'good' ? 100 : k.level === 'warn' ? 50 : 0), 0) / list.length);
    return { list, breakeven, safety, score: kscore, revenue: rev };
  }

  function score(answers, fin) {
    const a = answers || {};
    const k = kpis(fin);
    const dims = DIMS.map(d => {
      const vals = d.qs.map(([id]) => { const x = Number(a[id]); return Number.isInteger(x) && x >= 0 && x <= 3 ? x : 0; });
      let s = Math.round(vals.reduce((p, x) => p + x, 0) / (d.qs.length * 3) * 100);
      if (d.key === 'fin' && k) s = Math.round(s * 0.6 + k.score * 0.4);
      return { key: d.key, name: d.name, full: d.full, score: s, level: level(s) };
    });
    const total = Math.round(dims.reduce((p, d) => p + d.score, 0) / dims.length);
    const weakest = dims.slice().sort((x, y) => x.score - y.score || DIMS.findIndex(q => q.key === x.key) - DIMS.findIndex(q => q.key === y.key));
    const recs = weakest.filter(d => d.score < 75).slice(0, 3).map(d => ({ key: d.key, name: d.name, full: d.full, score: d.score, ...RECS[d.key] }));
    const gaps = [];
    for (const d of DIMS) for (const [id, text] of d.qs) { const x = Number(a[id]) || 0; if (x <= 1) gaps.push({ id, dim: d.name, text, value: x }); }
    gaps.sort((x, y) => x.value - y.value);
    return { dims, total, level: level(total), kpis: k, recs, gaps: gaps.slice(0, 5), answered: DIMS.reduce((n, d) => n + d.qs.filter(([id]) => a[id] !== undefined && a[id] !== '').length, 0) };
  }

  const QUESTION_COUNT = DIMS.reduce((n, d) => n + d.qs.length, 0);
  return { SCALE, DIMS, RECS, KPI, LEVEL_NAME, QUESTION_COUNT, score, kpis, level };
});
