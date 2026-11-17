// 勞健保、職保、勞退級距與費率（2026／民國 115 年 1 月 1 日起適用）
// 來源（2026-11-16 核對）：
//   勞保投保薪資分級表 https://www.bli.gov.tw/Files/25661
//   職災保險行業別費率表 https://www.bli.gov.tw/Files/24759（住宿業、餐飲業 行業別 0.12% ＋ 上下班 0.07% ＝ 0.19%）
//   勞退月提繳分級表（勞動部 114-11-24 勞動福3字第1140153598號令，115-01-01 生效）https://www.bli.gov.tw/0013083.html
//   健保投保金額分級表（115-01-01 生效）https://www.nhi.gov.tw/ch/cp-19418-9eefb-2576-1.html
export const INS_CHECKED = '2026-11-16';
export const INS_YEAR = 2026;

// 勞保／就保：一般 29,500 起、最高 45,800
const LI_MAIN = [29500, 30300, 31800, 33300, 34800, 36300, 38200, 40100, 42000, 43900, 45800];
// 部分工時薪資未達最低工資：11,100、12,540 兩級；超過 12,540 依 13,500～28,590 各級覈實申報
const LI_PT = [11100, 12540, 13500, 15840, 16500, 17280, 17880, 19047, 20008, 21009, 22000, 23100, 24000, 25250, 26400, 27600, 28590];
// 健保：58 級，最低 29,500（部分工時也不能低於第 1 級）、最高 313,000
const NHI = [29500, 30300, 31800, 33300, 34800, 36300, 38200, 40100, 42000, 43900, 45800, 48200, 50600, 53000, 55400, 57800, 60800, 63800, 66800, 69800, 72800, 76500, 80200, 83900, 87600, 92100, 96600, 101100, 105600, 110100, 115500, 120900, 126300, 131700, 137100, 142500, 147900, 150000, 156400, 162800, 169200, 175600, 182000, 189500, 197000, 204500, 212000, 219500, 228200, 236900, 245600, 254300, 263000, 273000, 283000, 293000, 303000, 313000];
// 勞退：62 級，1,500～150,000
const LP = [1500, 3000, 4500, 6000, 7500, 8700, 9900, 11100, 12540, 13500, 15840, 16500, 17280, 17880, 19047, 20008, 21009, 22000, 23100, 24000, 25250, 26400, 27600, 28590, 29500, 30300, 31800, 33300, 34800, 36300, 38200, 40100, 42000, 43900, 45800, 48200, 50600, 53000, 55400, 57800, 60800, 63800, 66800, 69800, 72800, 76500, 80200, 83900, 87600, 92100, 96600, 101100, 105600, 110100, 115500, 120900, 126300, 131700, 137100, 142500, 147900, 150000];
// 職災保險：最低 29,500（部分工時同勞保低級距）、最高 72,800
const OI_MAX = 72800;

export const RATES = {
  li: 0.115,        // 勞保普通事故
  ei: 0.01,         // 就業保險
  liEmp: 0.2, liEr: 0.7,   // 勞保、就保：勞工 20%、雇主 70%、政府 10%
  oiDefault: 0.0019, // 職災保險：餐飲業 0.12% + 上下班 0.07%，雇主全額
  wage: 0.00025,    // 積欠工資墊償基金 0.025%，雇主負擔
  nhi: 0.0517,      // 健保費率 5.17%
  nhiEmp: 0.3, nhiEr: 0.6, nhiDep: 0.56, // 健保：勞工 30%（本人＋眷屬，最多計 3 口）；雇主 60% × (1 + 平均眷口數 0.56)
  lp: 0.06,         // 勞退雇主至少 6%
};

const up = (tbl, w) => tbl.find(g => w <= g) ?? tbl[tbl.length - 1];
export function liGrade(w, pt) {
  if (pt && w < LI_MAIN[0]) return up(LI_PT, w);
  return up(LI_MAIN, Math.max(w, LI_MAIN[0]));
}
export function oiGrade(w, pt) {
  if (pt && w < LI_MAIN[0]) return up(LI_PT, w);
  return Math.min(OI_MAX, up(NHI, Math.max(w, NHI[0])));
}
export const nhiGrade = w => up(NHI, Math.max(w, NHI[0]));
export const lpGrade = w => up(LP, Math.max(w, LP[0]));
const r = Math.round;

// opt: {pt, dep 眷屬數, self 自提% , oi 職災費率, senior 65 歲以上或已領勞保老年給付（只保職保）, nhiHere 健保在本公司加保}
export function premiums(w, opt = {}) {
  const pt = !!opt.pt, dep = Math.min(3, Math.max(0, opt.dep | 0)), oi = opt.oi ?? RATES.oiDefault, senior = !!opt.senior;
  const nhiHere = opt.nhiHere !== false;
  const li = senior ? 0 : liGrade(w, pt);
  const oiG = oiGrade(w, pt);
  const nh = nhiHere ? nhiGrade(w) : 0;
  const lp = lpGrade(w);
  const nhiBase = nh * RATES.nhi;
  const o = {
    grades: { li, oi: oiG, nhi: nh, lp },
    emp: {
      li: senior ? 0 : r(li * RATES.li * RATES.liEmp) + r(li * RATES.ei * RATES.liEmp), // 普通事故、就保分開四捨五入（同勞保局表）
      nhi: nhiHere ? r(nhiBase * RATES.nhiEmp) * (1 + dep) : 0,
      lpSelf: r(lp * Math.min(6, Math.max(0, opt.self || 0)) / 100),
    },
    er: {
      li: senior ? 0 : r(li * RATES.li * RATES.liEr) + r(li * RATES.ei * RATES.liEr),
      oi: r(oiG * oi),
      wage: r((senior ? oiG : li) * RATES.wage),
      nhi: nhiHere ? r(nhiBase * RATES.nhiEr * (1 + RATES.nhiDep)) : 0,
      lp: r(lp * RATES.lp),
    },
  };
  o.empTotal = o.emp.li + o.emp.nhi;           // 從薪水扣（不含自提，自提另列，可節稅）
  o.erTotal = o.er.li + o.er.oi + o.er.wage + o.er.nhi + o.er.lp;
  return o;
}

export const INS_SOURCES = [
  ['勞工保險投保薪資分級表（115-01-01）', 'https://www.bli.gov.tw/Files/25661'],
  ['職災保險適用行業別及費率表', 'https://www.bli.gov.tw/Files/24759'],
  ['勞工退休金月提繳分級表（115-01-01）', 'https://www.bli.gov.tw/0013083.html'],
  ['健保投保金額分級表（115-01-01）', 'https://www.nhi.gov.tw/ch/cp-19418-9eefb-2576-1.html'],
];
