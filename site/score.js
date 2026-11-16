// 餐飲立地評估：評分模型（瀏覽器與 node 測試共用）
(function (root) {
  const FORMATS = {
    breakfast: { label: '早餐／早午餐', radius: 300, freq: 0.22, ticket: 90,
      w: { pop: .30, flow: .30, access: .10, comp: .20, cost: .10 }, ages: [0, 0, 1, .6, .3], kidBonus: true,
      re: /早餐|早午餐|美而美|麥味登|拉亞|弘爺|q ?burger|晨間|蛋餅/i, cuisine: /breakfast|brunch/ },
    bento: { label: '便當／自助餐', radius: 500, freq: 0.12, ticket: 110,
      w: { pop: .25, flow: .30, access: .10, comp: .20, cost: .15 }, ages: [0, .5, 1, .8, .4], office: true,
      re: /便當|自助餐|飯包|池上|悟饕|快餐|排骨飯|雞腿飯/, cuisine: /bento|lunch/ },
    noodle: { label: '小吃／麵食', radius: 500, freq: 0.12, ticket: 130,
      w: { pop: .25, flow: .25, access: .15, comp: .20, cost: .15 }, ages: [0, .7, 1, .8, .5],
      re: /麵|水餃|餃子|小吃|滷肉飯|魯肉飯|牛肉麵|拉麵|粥|米粉|鍋貼|肉圓/, cuisine: /noodle|ramen|dumpling|taiwanese|soup/ },
    drink: { label: '手搖飲／飲料', radius: 300, freq: 0.25, ticket: 60,
      w: { pop: .10, flow: .40, access: .15, comp: .20, cost: .15 }, ages: [.3, 1, .9, .4, .1], school: true,
      re: /茶|飲|50嵐|五十嵐|清心|可不可|coco|迷客夏|萬波|大苑子|五桐號|麻古|得正|鮮茶|珍珠|果汁/i, cuisine: /bubble_tea|tea|juice/ },
    cafe: { label: '咖啡／輕食', radius: 500, freq: 0.06, ticket: 180,
      w: { pop: .20, flow: .30, access: .10, comp: .20, cost: .20 }, ages: [0, .7, 1, .6, .2], office: true, income: true,
      re: /咖啡|coffee|caf[eé]|星巴克|starbucks|路易莎|louisa|cama|85度c/i, cuisine: /coffee|cafe/ },
    dinner: { label: '正餐／火鍋／燒肉', radius: 1000, freq: 0.035, ticket: 450,
      w: { pop: .25, flow: .15, access: .30, comp: .15, cost: .15 }, ages: [.2, .5, 1, 1, .4], income: true, car: true,
      re: /火鍋|鍋|燒肉|燒烤|牛排|餐廳|石鍋|壽司|料理|食堂|韓式|泰式|義大利|美式/, cuisine: /hot_pot|barbecue|bbq|japanese|korean|steak|thai|italian|sushi|chinese|american|buffet/ },
    night: { label: '宵夜／居酒屋／熱炒', radius: 500, freq: 0.03, ticket: 400,
      w: { pop: .20, flow: .30, access: .15, comp: .20, cost: .15 }, ages: [0, .8, 1, .7, .1],
      re: /居酒屋|串燒|熱炒|酒|鹹酥雞|宵夜|啤酒|快炒/, cuisine: /izakaya|yakitori/ }
  };

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

  function population(site, villages, R) {
    let pop = 0, hh = 0, age = [0, 0, 0, 0, 0], incW = 0, incSum = 0, home = null, best = 1e9;
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
      if (v.inc_med) { incW += v.pop * f; incSum += v.inc_med * v.pop * f; }
    }
    return { pop: Math.round(pop), hh: Math.round(hh), age: age.map(Math.round), inc: incW ? Math.round(incSum / incW) : null, home };
  }

  function near(site, pois, R) {
    return pois.map(p => ({ ...p, d: dist(site, p) })).filter(p => p.d <= R).sort((a, b) => a.d - b.d);
  }

  function isFormat(p, F) {
    if (!['food', 'drink', 'bar', 'bakery'].includes(p.cat)) return false;
    return F.re.test(p.name || '') || F.re.test(p.brand || '') || F.cuisine.test(p.sub || '');
  }

  /**
   * site: {lat, lon}; ctx: {pois, roads:[{lat,lon,cls,name}], villages, biz, rent, inc}
   * opt: {format, ticket, rent (monthly NT$), ping}
   */
  function evaluate(site, ctx, opt) {
    const F = FORMATS[opt.format] || FORMATS.noodle;
    const R = F.radius;
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
    const sFlow = clamp(scale(flowRaw, [[0, 5], [15, 30], [40, 55], [80, 75], [140, 90], [220, 100]]));

    // ---- 交通可及／車流 (road class at the door, stations, parking)
    let roadCls = 0, roadName = '';
    for (const r of ctx.roads) {
      const d = dist(site, r);
      if (d <= 80 && r.cls > roadCls) { roadCls = r.cls; roadName = r.name; }
    }
    const parking = cnt(P3, 'parking');
    const roadScore = [35, 35, 55, 75, 90, 70][roadCls]; // 快速道路旁可見但難停
    let sAccess = roadScore * (F.car ? .55 : .45) + scale(parking, [[0, 20], [2, 55], [5, 85], [8, 100]]) * (F.car ? .30 : .15) +
      (nearestStation != null ? scale(-nearestStation, [[-500, 40], [-300, 70], [-150, 100]]) : 25) * (F.car ? .15 : .40);
    sAccess = clamp(sAccess);

    // ---- 競爭 (same-format saturation vs clustering benefit)
    const sameR = near(site, ctx.pois.filter(p => isFormat(p, F)), R);
    const same3 = sameR.filter(p => p.d <= 300).length;
    const foodR = (R === 300 ? P3 : R === 500 ? P5 : P10).filter(p => ['food', 'drink', 'bakery', 'bar'].includes(p.cat)).length;
    const perK = sameR.length / Math.max(popR.pop / 1000, 0.5); // 每千人同業家數
    let sComp = scale(perK, [[0, 90], [0.3, 80], [0.7, 65], [1.2, 50], [2, 35], [3.5, 20]]);
    sComp += scale(foodR, [[0, -10], [10, 0], [40, 8], [120, 5]]); // 有聚集效應但過度飽和不加分
    const chains = sameR.filter(p => CHAINS.test(p.name || '') || CHAINS.test(p.brand || '')).length;
    sComp -= Math.min(chains * 3, 12);
    let bizRoad = null, bizTown = null;
    if (ctx.biz) {
      bizRoad = ctx.biz.road || null; bizTown = ctx.biz.town || null;
      if (bizRoad && bizRoad[0] >= 5) {
        const newRate = bizRoad[1] / bizRoad[0];
        if (newRate > .25) sComp -= 6; // 新開店比例高：換手頻繁或過熱
      }
    }
    sComp = clamp(sComp);

    // ---- 營收潛力 (very rough, shown as a range)
    const ticket = opt.ticket || F.ticket;
    const capture = 1 / (1 + sameR.length * 0.9);
    const residentVisits = popR.pop * F.freq * capture;
    const flowVisits = flowRaw * (F.freq * 30) * capture;
    const daily = residentVisits + flowVisits;
    const monthly = daily * 30 * ticket;
    const rev = { low: Math.round(monthly * 0.6 / 1000) * 1000, mid: Math.round(monthly / 1000) * 1000, high: Math.round(monthly * 1.5 / 1000) * 1000, daily: Math.round(daily) };

    // ---- 成本 (rent)
    let market = null;
    if (ctx.rent) market = ctx.rent.road || ctx.rent.town || null; // [median NT$/坪/月, n]
    let sCost = 60, rentRatio = null, rentVsMarket = null;
    if (opt.rent && rev.mid) {
      rentRatio = opt.rent / rev.mid;
      sCost = scale(rentRatio, [[0.05, 100], [0.10, 85], [0.15, 65], [0.20, 45], [0.30, 20], [0.45, 5]]);
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
    if (perK >= 1.2) cons.push(`同業密度高：${R} 公尺內 ${sameR.length} 家同類店（每千人 ${perK.toFixed(1)} 家）`);
    else if (sameR.length <= 2) pros.push(`${R} 公尺內同類店只有 ${sameR.length} 家，競爭少`);
    if (chains >= 2) cons.push(`附近已有 ${chains} 家連鎖同業，價格與品牌壓力大`);
    if (bizRoad && bizRoad[0] >= 5 && bizRoad[1] / bizRoad[0] > .25) cons.push(`這條路近一年新登記餐飲 ${bizRoad[1]} 家（占 ${Math.round(bizRoad[1] / bizRoad[0] * 100)}%），換手快，需確認原店退場原因`);
    if (rentRatio != null && rentRatio > .18) cons.push(`租金約占推估營收 ${Math.round(rentRatio * 100)}%，超過餐飲常見安全線 15%`);
    if (rentRatio != null && rentRatio <= .10) pros.push(`租金約占推估營收 ${Math.round(rentRatio * 100)}%，成本壓力低`);
    if (rentVsMarket != null && rentVsMarket > 1.2) cons.push(`開價比附近店面行情高約 ${Math.round((rentVsMarket - 1) * 100)}%，可議價`);
    if (popR.inc && F.income && popR.inc >= 900) pros.push(`周邊家戶所得中位數約 ${popR.inc} 千元，消費力佳`);

    return {
      format: opt.format, label: F.label, radius: R, total, grade, dims, weights: F.w,
      numbers: { pop5: pop5.pop, pop10: pop10.pop, hh5: pop5.hh, age5: pop5.age, inc: popR.inc, home: pop5.home,
        stations: stations5.slice(0, 3).map(p => ({ name: p.name, sub: p.sub, d: Math.round(p.d) })), ...g, parking,
        roadCls, roadName, same: sameR.length, same3, perK: +perK.toFixed(2), foodR, chains, bizRoad, bizTown, market },
      competitors: sameR.slice(0, 20).map(p => ({ name: p.name || '(未命名)', d: Math.round(p.d), lat: p.lat, lon: p.lon, chain: CHAINS.test(p.name || '') || CHAINS.test(p.brand || '') })),
      revenue: rev, ticket, rentRatio, rentVsMarket, pros, cons
    };
  }

  const api = { FORMATS, evaluate, dist, overlapFrac, population, scale };
  if (typeof module !== 'undefined') module.exports = api; else root.SiteScore = api;
})(this);
