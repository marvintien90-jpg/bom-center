// 餐飲立地評估：評分模型（瀏覽器與 node 測試共用）
(function (root) {
  const FORMATS = {
    breakfast: { base: 160, label: '早餐／早午餐', radius: 300, freq: 0.22, ticket: 90,
      w: { pop: .30, flow: .30, access: .10, comp: .20, cost: .10 }, ages: [0, 0, 1, .6, .3], kidBonus: true,
      re: /早餐|早午餐|美而美|麥味登|拉亞|弘爺|q ?burger|晨間|蛋餅/i, cuisine: /breakfast|brunch/ },
    bento: { base: 180, label: '便當／自助餐', radius: 500, freq: 0.12, ticket: 110,
      w: { pop: .25, flow: .30, access: .10, comp: .20, cost: .15 }, ages: [0, .5, 1, .8, .4], office: true,
      re: /便當|自助餐|飯包|池上|悟饕|快餐|排骨飯|雞腿飯/, cuisine: /bento|lunch/ },
    noodle: { base: 150, label: '小吃／麵食', radius: 500, freq: 0.12, ticket: 130,
      w: { pop: .25, flow: .25, access: .15, comp: .20, cost: .15 }, ages: [0, .7, 1, .8, .5],
      re: /麵|水餃|餃子|小吃|滷肉飯|魯肉飯|牛肉麵|拉麵|粥|米粉|鍋貼|肉圓/, cuisine: /noodle|ramen|dumpling|taiwanese|soup/ },
    drink: { base: 280, label: '手搖飲／飲料', radius: 300, freq: 0.25, ticket: 60,
      w: { pop: .10, flow: .40, access: .15, comp: .20, cost: .15 }, ages: [.3, 1, .9, .4, .1], school: true,
      re: /茶|飲|50嵐|五十嵐|清心|可不可|coco|迷客夏|萬波|大苑子|五桐號|麻古|得正|鮮茶|珍珠|果汁/i, cuisine: /bubble_tea|tea|juice/ },
    cafe: { base: 110, label: '咖啡／輕食', radius: 500, freq: 0.06, ticket: 180,
      w: { pop: .20, flow: .30, access: .10, comp: .20, cost: .20 }, ages: [0, .7, 1, .6, .2], office: true, income: true,
      re: /咖啡|coffee|caf[eé]|星巴克|starbucks|路易莎|louisa|cama|85度c/i, cuisine: /coffee|cafe/ },
    dinner: { base: 110, label: '正餐／火鍋／燒肉', radius: 1000, freq: 0.035, ticket: 450,
      w: { pop: .25, flow: .15, access: .30, comp: .15, cost: .15 }, ages: [.2, .5, 1, 1, .4], income: true, car: true,
      re: /火鍋|鍋|燒肉|燒烤|牛排|餐廳|石鍋|壽司|料理|食堂|韓式|泰式|義大利|美式/, cuisine: /hot_pot|barbecue|bbq|japanese|korean|steak|thai|italian|sushi|chinese|american|buffet/ },
    night: { base: 70, label: '宵夜／居酒屋／熱炒', radius: 500, freq: 0.03, ticket: 400,
      w: { pop: .20, flow: .30, access: .15, comp: .20, cost: .15 }, ages: [0, .8, 1, .7, .1],
      re: /居酒屋|串燒|熱炒|酒|鹹酥雞|宵夜|啤酒|快炒/, cuisine: /izakaya|yakitori/ }
  };

  // 替代競爭：滿足同一餐期／同一需求、但不是同一種店（權重 0.3 計入競爭）
  const SUBST = {
    breakfast: { fmts: ['cafe'], cats: ['bakery', 'conv'], subs: /fast_food|burger|sandwich|bakery/ },
    bento: { fmts: ['noodle'], cats: ['conv'], subs: /fast_food|burger|chicken|food_court/ },
    noodle: { fmts: ['bento'], cats: [], subs: /fast_food|burger|chicken|food_court|chinese|taiwanese/ },
    drink: { fmts: ['cafe'], cats: [], subs: /ice_cream|dessert|juice/ },
    cafe: { fmts: ['drink'], cats: ['bakery'], subs: /dessert|ice_cream|cake/ },
    dinner: { fmts: ['night'], cats: [], subs: /restaurant|chinese|japanese|korean|thai|italian|american|seafood|buffet/ },
    night: { fmts: ['dinner'], cats: ['bar'], subs: /chicken|barbecue|bbq/ }
  };
  const SUB_W = 0.3;

  const CHAINS = /7-?eleven|統一超商|全家|萊爾富|ok ?mart|麥當勞|mcdonald|肯德基|kfc|摩斯|mos|漢堡王|星巴克|starbucks|路易莎|85度c|50嵐|清心|可不可|迷客夏|八方雲集|四海遊龍|鬍鬚張|爭鮮|瓦城|王品|陶板屋|西堤|石二鍋|海底撈|麥味登|拉亞|弘爺|q ?burger|全聯|家樂福|subway|必勝客|達美樂|頂呱呱|丹丹|吉野家|sukiya|すき家|コメダ|cama/i;

  const R_EARTH = 6371000;
  function dist(a, b) {
    const x = (b.lon - a.lon) * Math.PI / 180 * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180);
    const y = (b.lat - a.lat) * Math.PI / 180;
    return Math.sqrt(x * x + y * y) * R_EARTH;
  }
  // area of intersection of two circles / area of second circle
  function overlapFrac(R, r, d) {
    if (d >= R + r) return 0;
    if (d <= Math.abs(R - r)) return R >= r ? 1 : (R * R) / (r * r);
    const a = R * R * Math.acos((d * d + R * R - r * r) / (2 * d * R));
    const b = r * r * Math.acos((d * d + r * r - R * R) / (2 * d * r));
    const c = 0.5 * Math.sqrt((-d + R + r) * (d + R - r) * (d - R + r) * (d + R + r));
    return (a + b - c) / (Math.PI * r * r);
  }
  // piecewise linear scale: pts = [[x, score], ...] ascending x
  function scale(x, pts) {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
      }
    }
    return pts[pts.length - 1][1];
  }
  const clamp = v => Math.max(0, Math.min(100, Math.round(v)));

  // 全台村里加總（客群指數的分母），算一次就快取
  let NAT = null;
  function national(villages) {
    if (NAT && NAT.n === villages.length) return NAT;
    const a10 = new Array(10).fill(0), age = [0, 0, 0, 0, 0]; let pop = 0, hh = 0, m = 0, f = 0; const incs = [];
    for (const v of villages) { if (!v.pop) continue; pop += v.pop; hh += v.hh || 0; if (v.a10) v.a10.forEach((n, i) => a10[i] += n); if (v.age) v.age.forEach((n, i) => age[i] += n); if (v.mf) { m += v.mf[0]; f += v.mf[1]; } if (v.inc_med) incs.push(v.inc_med); }
    incs.sort((a, b) => a - b);
    NAT = { n: villages.length, pop, hh, a10, age, m, f, incs };
    return NAT;
  }
  function incPct(nat, x) { if (!x || !nat.incs.length) return null; let lo = 0, hi = nat.incs.length; while (lo < hi) { const md = (lo + hi) >> 1; if (nat.incs[md] < x) lo = md + 1; else hi = md; } return Math.round(lo / nat.incs.length * 100); }

  function population(site, villages, R) {
    let pop = 0, hh = 0, age = [0, 0, 0, 0, 0], a10 = new Array(10).fill(0), mf = [0, 0], incW = 0, incSum = 0, home = null, best = 1e9, has10 = false;
    for (const v of villages) {
      if (!v.pop) continue;
      const d = dist(site, v);
      if (d < best) { best = d; home = v; }
      if (d > R + 4000) continue;
      const rv = Math.sqrt((v.km2 || 0.05) / Math.PI) * 1000;
      const f = overlapFrac(R, rv, d);
      if (f <= 0) continue;
      pop += v.pop * f; hh += (v.hh || 0) * f;
      if (v.age) v.age.forEach((n, i) => age[i] += n * f);
      if (v.a10) { has10 = true; v.a10.forEach((n, i) => a10[i] += n * f); }
      if (v.mf) { mf[0] += v.mf[0] * f; mf[1] += v.mf[1] * f; }
      if (v.inc_med) { incW += v.pop * f; incSum += v.inc_med * v.pop * f; }
    }
    return { pop: Math.round(pop), hh: Math.round(hh), age: age.map(Math.round), a10: has10 ? a10.map(Math.round) : null, mf: mf.map(Math.round), inc: incW ? Math.round(incSum / incW) : null, home };
  }

  function near(site, pois, R) {
    return pois.map(p => ({ ...p, d: dist(site, p) })).filter(p => p.d <= R).sort((a, b) => a.d - b.d);
  }

  function kwRe(kw) {
    const parts = String(kw || '').split(/[\s,，、|]+/).map(x => x.trim()).filter(Boolean).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return parts.length ? new RegExp(parts.join('|'), 'i') : null;
  }
  function isFormat(p, F, kw) {
    if (!['food', 'drink', 'bar', 'bakery'].includes(p.cat)) return false;
    if (kw) return kw.test(p.name || '') || kw.test(p.brand || '') || kw.test(p.sub || '');
    return F.re.test(p.name || '') || F.re.test(p.brand || '') || F.cuisine.test(p.sub || '');
  }
  const isChain = p => CHAINS.test(p.name || '') || CHAINS.test(p.brand || '');

  /**
   * site: {lat, lon}; ctx: {pois, roads:[{lat,lon,cls,name}], villages, biz, rent, inc}
   * opt: {format, ticket, rent (monthly NT$), ping}
   */
  const RENT_GOOD = 0.05, RENT_RED = 0.08; // 租金占營收：3–5% 優良，8–10% 紅燈
  const pct1 = x => (Math.round(x * 1000) / 10).toString();

  // 客群輪廓：區隔占比 ÷ 全台占比 ×100 = 指數（>120 明顯偏多、<80 偏少）
  const SEGS = [
    { k: 'kid', label: '學齡兒童家庭', note: '0–12 歲', idx: [0, 1] },
    { k: 'teen', label: '中學生', note: '13–18 歲', idx: [2] },
    { k: 'young', label: '大學生／社會新鮮人', note: '19–24 歲', idx: [3] },
    { k: 'work', label: '年輕上班族', note: '25–34 歲', idx: [4] },
    { k: 'family', label: '成家主力', note: '35–44 歲', idx: [5] },
    { k: 'mid', label: '中壯年', note: '45–54 歲', idx: [6] },
    { k: 'mature', label: '熟齡', note: '55–64 歲', idx: [7] },
    { k: 'senior', label: '銀髮', note: '65 歲以上', idx: [8, 9] }
  ];
  // 各業態偏好的客群（權重）；office/income/single 為補充訊號
  const FIT = {
    breakfast: { kid: 1, teen: 1, young: .5, work: .6, family: .8, senior: .5, office: .5 },
    bento: { work: 1, young: .7, mid: .6, office: 1, single: .7 },
    noodle: { young: .6, work: .7, family: .5, mid: .6, mature: .6, senior: .6, single: .6 },
    drink: { teen: 1, young: 1, work: .8, kid: .3 },
    cafe: { young: .6, work: 1, family: .5, office: .8, income: 1 },
    dinner: { family: 1, mid: .9, mature: .7, senior: .3, kid: .5, income: 1 },
    night: { young: 1, work: 1, single: .8, senior: -.5 }
  };
  function profile(pp, nat, ctxSig) {
    const segs = [];
    const has10 = !!pp.a10, src = has10 ? pp.a10 : null, nsrc = nat.a10;
    const tot = src ? src.reduce((a, b) => a + b, 0) : 0, ntot = nsrc.reduce((a, b) => a + b, 0);
    if (has10 && tot && ntot) for (const sg of SEGS) {
      const n = sg.idx.reduce((a, i) => a + src[i], 0), nn = sg.idx.reduce((a, i) => a + nsrc[i], 0);
      segs.push({ ...sg, n, share: n / tot, index: Math.round((n / tot) / (nn / ntot) * 100) });
    }
    const hhSize = pp.hh ? pp.pop / pp.hh : null, nhh = nat.hh ? nat.pop / nat.hh : 2.6;
    const male = pp.mf && (pp.mf[0] + pp.mf[1]) ? pp.mf[0] / (pp.mf[0] + pp.mf[1]) : null;
    const incP = incPct(nat, pp.inc);
    const sig = { office: Math.min(150, 60 + (ctxSig.office || 0) * 3), income: incP == null ? 100 : 50 + incP, single: hhSize ? Math.round(nhh / hhSize * 100) : 100 };
    const idx = {}; segs.forEach(s => idx[s.k] = s.index); Object.assign(idx, sig);
    const fits = Object.entries(FIT).map(([f, w]) => {
      let num = 0, den = 0; const why = [];
      for (const [k, wt] of Object.entries(w)) { if (idx[k] == null) continue; num += wt * (idx[k] - 100); den += Math.abs(wt); if (wt > 0 && idx[k] >= 115) why.push(k); }
      return { f, label: FORMATS[f].label, score: Math.max(0, Math.min(100, Math.round(50 + (den ? num / den : 0) * 1.2))), why };
    }).sort((a, b) => b.score - a.score);
    const top = segs.slice().sort((a, b) => b.index - a.index);
    return { segs, top: top.slice(0, 3), low: top.slice(-2), hhSize: hhSize && +hhSize.toFixed(2), nhh: +nhh.toFixed(2), male, inc: pp.inc, incP, sig, fits };
  }

  function evaluate(site, ctx, opt) {
    const F0 = FORMATS[opt.format] || FORMATS.noodle;
    let W = F0.w;
    if (opt.weights) { const t = Object.values(opt.weights).reduce((a, b) => a + (+b || 0), 0); if (t > 0) { W = {}; for (const k in F0.w) W[k] = (+opt.weights[k] || 0) / t; } }
    const F = { ...F0, w: W };
    const R = Math.max(150, Math.min(2000, +opt.radius || F0.radius));
    const KW = kwRe(opt.keyword);
    const P3 = near(site, ctx.pois, 300), P5 = near(site, ctx.pois, 500), P10 = near(site, ctx.pois, 1000);
    const cnt = (arr, cat, sub) => arr.filter(p => p.cat === cat && (!sub || p.sub === sub)).length;
    const popR = population(site, ctx.villages, R), pop5 = population(site, ctx.villages, 500), pop10 = population(site, ctx.villages, 1000);

    // ---- 客群 (population fit)
    const popScore = scale(pop5.pop, [[0, 5], [2000, 30], [6000, 55], [12000, 75], [20000, 90], [30000, 100]]);
    const tot = pop5.age.reduce((a, b) => a + b, 0) || 1;
    const share = pop5.age.map(n => n / tot);
    const ref = [0.12, 0.10, 0.28, 0.30, 0.20]; // 全國約略結構
    let fit = 0; F.ages.forEach((w, i) => fit += w * (share[i] - ref[i]));
    const fitScore = clamp(60 + fit * 250);
    let incScore = null;
    if (popR.inc) incScore = scale(popR.inc, [[450, 30], [600, 55], [750, 75], [1000, 92], [1400, 100]]); // 千元 中位數
    const sPop = clamp(popScore * .55 + fitScore * .25 + (incScore ?? 60) * (F.income ? .20 : .20));

    // ---- 人流 (foot-traffic generators)
    const stations5 = P5.filter(p => p.cat === 'station');
    const subway5 = stations5.filter(p => p.sub === 'subway').length, rail5 = stations5.length - subway5;
    const nearestStation = stations5[0] ? Math.round(stations5[0].d) : null;
    const g = {
      conv: cnt(P3, 'conv'), bus: cnt(P3, 'bus'), school: cnt(P5, 'school'), office: cnt(P5, 'office'),
      hospital: cnt(P5, 'hospital'), mall: cnt(P5, 'mall') + cnt(P5, 'market'), attract: cnt(P5, 'attract') + cnt(P5, 'leisure'),
      hotel: cnt(P5, 'hotel'), food3: P3.filter(p => ['food', 'drink', 'bakery', 'bar'].includes(p.cat)).length
    };
    let flowRaw = g.conv * 6 + g.bus * 1.5 + g.school * (F.school ? 6 : 3) + g.office * (F.office ? 3 : 1.5) + g.hospital * 4 +
      g.mall * 6 + g.attract * 1.5 + g.hotel * 1 + Math.min(g.food3, 60) * 0.6;
    if (nearestStation != null) flowRaw += (subway5 ? 30 : 15) * (nearestStation < 200 ? 1.4 : nearestStation < 350 ? 1 : .6);
    const sFlow = clamp(scale(flowRaw, [[0, 5], [40, 30], [100, 55], [180, 72], [300, 88], [450, 100]]));

    // ---- 交通可及／車流 (road class at the door, stations, parking)
    let roadCls = 0, roadName = '';
    for (const r of ctx.roads) {
      const d = dist(site, r);
      if (d <= 130 && r.cls > roadCls) { roadCls = r.cls; roadName = r.name; }
    }
    const parking = cnt(P3, 'parking');
    const roadScore = [35, 35, 55, 75, 90, 70][roadCls]; // 快速道路旁可見但難停
    let sAccess = roadScore * (F.car ? .55 : .45) + scale(parking, [[0, 20], [2, 55], [5, 85], [8, 100]]) * (F.car ? .30 : .15) +
      (nearestStation != null ? scale(-nearestStation, [[-500, 40], [-300, 70], [-150, 100]]) : 25) * (F.car ? .15 : .40);
    sAccess = clamp(sAccess);

    // ---- 競爭 (same-format saturation vs clustering benefit)
    const sameR = near(site, ctx.pois.filter(p => isFormat(p, F, KW)), R);
    const same3 = sameR.filter(p => p.d <= 300).length;
    const SB = SUBST[opt.format] || SUBST.noodle;
    const directSet = new Set(sameR);
    const subR = near(site, ctx.pois.filter(p => !isFormat(p, F, KW) && (SB.cats.includes(p.cat) ||
      (['food', 'drink', 'bakery', 'bar'].includes(p.cat) && (SB.fmts.some(k => isFormat(p, FORMATS[k])) || SB.subs.test(p.sub || ''))))), R);
    const foodR = near(site, ctx.pois, R).filter(p => ['food', 'drink', 'bakery', 'bar'].includes(p.cat)).length;
    const effComp = sameR.length + subR.length * SUB_W;
    const perK = effComp / Math.max((popR.pop + flowRaw * 100) / 1000, 0.5); // 每千位（居民＋活動人口）有效競爭家數（直接 1、替代 0.3）
    let sComp = scale(perK, [[0, 90], [0.3, 80], [0.7, 65], [1.2, 50], [2, 35], [3.5, 20]]);
    sComp += scale(foodR, [[0, -10], [10, 0], [40, 8], [120, 5]]); // 有聚集效應但過度飽和不加分
    const chains = sameR.filter(isChain).length;
    sComp -= Math.min(chains * 3, 12);
    let bizRoad = null, bizTown = null;
    if (ctx.biz) {
      bizRoad = ctx.biz.road || null; bizTown = ctx.biz.town || null;
      const loc = ctx.biz.near || null;
      if (loc && loc[0] >= 5) {
        const newRate = loc[1] / loc[0];
        if (newRate > .25) sComp -= 6; // 新開店比例高：換手頻繁或過熱
      }
    }
    sComp = clamp(sComp);

    // ---- 營收潛力：同業標準店來客 × 立地係數（先算分數再回填）
    const ticket = opt.ticket || F.ticket;
    let rev = null;
    const revenueFor = score => {
      const factor = 0.55 + score / 100 * 0.9; // 50 分 ≈ 標準店
      const daily = F.base * factor;
      const monthly = daily * 30 * ticket;
      return { low: Math.round(monthly * 0.75 / 1000) * 1000, mid: Math.round(monthly / 1000) * 1000, high: Math.round(monthly * 1.3 / 1000) * 1000, daily: Math.round(daily), factor: +factor.toFixed(2) };
    };

    // ---- 成本 (rent)
    let market = null;
    if (ctx.rent) market = ctx.rent.road || ctx.rent.town || null; // [median NT$/坪/月, n]
    let sCost = 60, rentRatio = null, rentVsMarket = null;
    const pre = { pop: sPop, flow: sFlow, access: sAccess, comp: sComp };
    let preT = 0, preW = 0; for (const k in pre) { preT += F.w[k] * pre[k]; preW += F.w[k]; }
    rev = revenueFor(preT / preW);
    if (opt.rent && rev.mid) {
      rentRatio = opt.rent / rev.mid;
      sCost = scale(rentRatio, [[0.03, 100], [0.05, 90], [0.065, 65], [0.08, 40], [0.10, 15], [0.15, 0]]);
    }
    if (opt.rent && opt.ping && market) {
      rentVsMarket = (opt.rent / opt.ping) / market[0];
      sCost = sCost * .6 + scale(rentVsMarket, [[0.7, 100], [0.9, 85], [1.1, 65], [1.3, 45], [1.6, 20]]) * .4;
    }
    sCost = clamp(sCost);

    const dims = { pop: sPop, flow: sFlow, access: sAccess, comp: sComp, cost: sCost };
    let total = 0; for (const k in F.w) total += F.w[k] * dims[k];
    total = clamp(total);
    const grade = total >= 80 ? 'A' : total >= 65 ? 'B' : total >= 50 ? 'C' : 'D';

    // ---- 文字解讀
    const pros = [], cons = [];
    if (pop5.pop >= 12000) pros.push(`500 公尺內約 ${pop5.pop.toLocaleString()} 位居民，住宅腹地厚`);
    else if (pop5.pop < 4000) cons.push(`500 公尺內居民僅約 ${pop5.pop.toLocaleString()} 人，要靠外來人流或外送`);
    if (nearestStation != null && nearestStation <= 300) pros.push(`${stations5[0].name || '車站'} 約 ${nearestStation} 公尺，步行可達`);
    if (g.conv >= 4) pros.push(`300 公尺內有 ${g.conv} 家便利商店，代表日常人流穩定`);
    if (g.conv <= 1) cons.push('300 公尺內便利商店很少，日常人流偏弱');
    if (F.office && g.office >= 10) pros.push(`500 公尺內有 ${g.office} 個辦公點，平日午餐客源充足`);
    if (F.school && g.school >= 3) pros.push(`500 公尺內有 ${g.school} 所學校，學生客群明確`);
    if (roadCls >= 4) pros.push(`位於${roadName || '主要道路'}旁，車行可見度高`);
    if (roadCls <= 1 && F.car) cons.push('門前不是主要道路，開車客較難注意到');
    if (F.car && parking <= 1) cons.push('300 公尺內停車場少，開車來客會流失');
    if (perK >= 1.2) cons.push(`競爭密度高：${R} 公尺內直接競爭 ${sameR.length} 家、替代競爭 ${subR.length} 家（每千人 ${perK.toFixed(1)} 家有效競爭）`);
    else if (sameR.length <= 2) pros.push(`${R} 公尺內直接競爭只有 ${sameR.length} 家${subR.length ? `（替代競爭 ${subR.length} 家）` : ''}，競爭少`);
    if (sameR.length <= 2 && subR.length >= 15) cons.push(`直接同業少，但有 ${subR.length} 家替代型店家在搶同一餐期的客人`);
    if (chains >= 2) cons.push(`附近已有 ${chains} 家連鎖同業，價格與品牌壓力大`);
    const loc = ctx.biz && ctx.biz.near;
    if (loc && loc[0] >= 5 && loc[1] / loc[0] > .25) cons.push(`門前這一段近一年新登記餐飲 ${loc[1]} 家（占 ${Math.round(loc[1] / loc[0] * 100)}%），換手快，需確認原店退場原因`);
    if (rentRatio != null && rentRatio > RENT_RED) cons.push(`租金約占推估營收 ${pct1(rentRatio)}%，已達紅燈（8% 以上）`);
    else if (rentRatio != null && rentRatio > RENT_GOOD) cons.push(`租金約占推估營收 ${pct1(rentRatio)}%，高於優良標準 5%，需要議價或拉高營收`);
    if (rentRatio != null && rentRatio <= RENT_GOOD) pros.push(`租金約占推估營收 ${pct1(rentRatio)}%，在 3–5% 優良範圍內`);
    if (rentVsMarket != null && rentVsMarket > 1.2) cons.push(`開價比附近店面行情高約 ${Math.round((rentVsMarket - 1) * 100)}%，可議價`);
    if (popR.inc && F.income && popR.inc >= 900) pros.push(`周邊家戶所得中位數約 ${popR.inc} 千元，消費力佳`);

    // ---- 時段潛力（依周邊設施組成推估，0–100）
    const P5f = P5.filter(p => ['food', 'drink', 'bakery', 'bar'].includes(p.cat));
    const bars5 = P5.filter(p => p.cat === 'bar').length, popS = scale(pop5.pop, [[0, 0], [6000, 50], [20000, 100]]);
    const stS = nearestStation != null ? scale(-nearestStation, [[-500, 20], [-150, 60]]) : 0;
    const young = share[1] + share[2];
    const daypart = { // 各項上限加總為 100
      breakfast: clamp(popS * .4 + stS / 60 * 20 + Math.min(g.school, 5) * 4 + Math.min(g.office, 40) * .5),
      lunch: clamp(Math.min(g.office, 40) + Math.min(g.school, 5) * 3 + Math.min(g.hospital, 5) * 3 + Math.min(g.mall, 5) * 3 + popS * .15),
      afternoon: clamp(Math.min(g.school, 5) * 4 + Math.min(g.mall, 5) * 4 + Math.min(g.attract, 10) * 2 + Math.min(P5f.length, 100) * .25 + stS / 60 * 15),
      dinner: clamp(popS * .5 + Math.min(g.mall, 5) * 3 + (roadCls >= 3 ? 10 : 0) + Math.min(parking, 5) * 3 + stS / 60 * 10),
      late: clamp(Math.min(bars5, 8) * 5 + Math.min(g.hotel, 5) * 2 + Math.min(P5f.length, 100) * .2 + young * 40 + Math.min(g.attract, 5) * 2)
    };


    return {
      format: opt.format, keyword: opt.keyword || '', custom: !!(opt.weights || opt.radius || opt.keyword), daypart, label: F.label, radius: R, total, grade, dims, weights: F.w,
      profile: profile(pop5, national(ctx.villages), { office: g.office }),
      numbers: { popR: popR.pop, a10: pop5.a10, sub: subR.length, bizNear: ctx.biz ? ctx.biz.near || null : null, bizLane: ctx.biz ? ctx.biz.lane || null : null, bizNearLabel: ctx.biz ? ctx.biz.nearLabel || '' : '', pop5: pop5.pop, pop10: pop10.pop, hh5: pop5.hh, age5: pop5.age, inc: popR.inc, home: pop5.home,
        stations: stations5.slice(0, 3).map(p => ({ name: p.name, sub: p.sub, d: Math.round(p.d) })), ...g, parking,
        roadCls, roadName, flowRaw: Math.round(flowRaw), same: sameR.length, same3, perK: +perK.toFixed(2), foodR, chains, bizRoad, bizTown, market },
      competitors: sameR.slice(0, 60).map(p => ({ name: p.name || '(未命名)', d: Math.round(p.d), lat: p.lat, lon: p.lon, sub: p.sub || '', brand: p.brand || '', chain: isChain(p) })),
      substitutes: subR.slice(0, 60).map(p => ({ name: p.name || '(未命名)', d: Math.round(p.d), lat: p.lat, lon: p.lon, cat: p.cat, sub: p.sub || '', brand: p.brand || '', chain: isChain(p) })),
      revenue: rev, ticket, rentRatio, rentVsMarket, pros, cons
    };
  }

    // 損益試算：月營收 × (1 − 食材 − 雜支) − 租金 − 人事
  const DEF_COST = { breakfast: [38, 70000], bento: [42, 90000], noodle: [38, 80000], drink: [30, 100000], cafe: [32, 90000], dinner: [40, 220000], night: [38, 120000] };
  function pnl(res, inp) {
    const d = DEF_COST[res.format] || [38, 90000];
    const food = (inp.food ?? d[0]) / 100, other = (inp.other ?? 10) / 100, labor = inp.labor ?? d[1], rent = inp.rent || 0, invest = inp.invest || 0;
    const fixed = labor + rent, margin = 1 - food - other;
    const at = rev => Math.round(rev * margin - fixed);
    const beRev = margin > 0 ? fixed / margin : null;
    const beDaily = beRev && res.ticket ? Math.ceil(beRev / 30 / res.ticket) : null;
    const mid = at(res.revenue.mid);
    return { food: food * 100, other: other * 100, labor, rent, invest, low: at(res.revenue.low), mid, high: at(res.revenue.high),
      beRev: beRev && Math.round(beRev), beDaily, payback: invest && mid > 0 ? +(invest / mid).toFixed(1) : null, defaults: d };
  }

  // 反向找點：某半徑內每天可支撐的來客 =（居民＋活動人口）× 業態每日消費頻率 ÷（1 + 直接競爭 + 0.3 × 替代競爭）
  function capacity(site, ctx, opt, radius) {
    const r = evaluate(site, ctx, { ...opt, radius });
    const F = FORMATS[opt.format] || FORMATS.noodle;
    // 活動人口（上班、上學、過路）依面積放大，最多 4 倍；單店市占 2%–20%
    const people = r.numbers.popR + r.numbers.flowRaw * 100 * Math.min(4, (radius / 500) ** 2);
    const share = Math.max(0.02, Math.min(0.2, 1 / (1 + r.numbers.same + SUB_W * r.numbers.sub)));
    return { radius, daily: Math.round(people * F.freq * share), people: Math.round(people), share, same: r.numbers.same, sub: r.numbers.sub, res: r };
  }
  // 找出能支撐每日 need 位來客的最小半徑（200–1500m）
  function suggestRadius(site, ctx, opt, need) {
    let last = null;
    for (let R = 200; R <= 1500; R += 100) { const c = capacity(site, ctx, opt, R); last = c; if (c.daily >= need) return { ...c, ok: true }; }
    return { ...last, ok: false };
  }
  // 目標客群契合度：選定客群的指數平均，100 = 全台平均
  function segFit(profile, keys) {
    if (!keys || !keys.length) return null;
    const idx = {}; (profile.segs || []).forEach(s => idx[s.k] = s.index); Object.assign(idx, profile.sig || {});
    const v = keys.map(k => idx[k]).filter(x => x != null); if (!v.length) return null;
    const avg = v.reduce((a, b) => a + Math.min(b, 170), 0) / v.length;
    return { avg: Math.round(avg), score: clamp(50 + (avg - 100) * 1.0) };
  }

  const api = { capacity, suggestRadius, segFit, RENT_GOOD, RENT_RED, SEGS, FORMATS, evaluate, dist, overlapFrac, population, scale, pnl, isChain };
  if (typeof module !== 'undefined') module.exports = api; else root.SiteScore = api;
})(this);
