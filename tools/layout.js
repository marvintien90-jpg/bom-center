// ===== 品牌加辣 知識卡 v2.1：版面（Node 測試與 Supabase 共用同一段程式） =====
// 2026-11-03 Marvin：參考圖太像，要強調品牌加辣自己的定位與辨識度。
// 識別：方格紙（總部報表感）、辣紅支柱標籤、紅色步驟編號、炭黑「數字框」公式、
// 辣點提醒、炭黑品牌頁尾（實戰派・可複製輔導・總部思維）、結尾卡反白。1080x1350。
const W = 1080;
const H0 = 1350;
const HS = 1920;
const C = {
  paper: "#F3F1EC",
  ink: "#1A1A1A",
  body: "#2E2B28",
  soft: "#77716A",
  line: "#D9D4CE",
  red: "#C4311D",
  redDeep: "#7A0E08",
  tint: "#F6DED8",
  gold: "#F9B900",
};
const MAX = 160;

const SERIES = {
  hq: ["總部思維", "HQ THINKING"],
  num: ["數字會說話", "NUMBERS TALK"],
  floor: ["現場實戰", "ON THE FLOOR"],
  fr: ["加盟觀點", "FRANCHISE TALK"],
  tool: ["工具與案例", "TOOLS & CASES"],
  pos: ["品牌定位", "BRAND POSITIONING"],
};

function clean(v) {
  return (v ?? "").replace(/[\u0000-\u001f]/g, "").slice(0, MAX);
}
function rows(v, n = 4) {
  return v.split("|").map((s) => s.trim()).filter((s) => s.length > 0).slice(0, n);
}
function el(style, children) {
  return { type: "div", props: { style: { display: "flex", ...style }, children } };
}

function header(ser, page, dark) {
  const [a, b] = page.split("/").map((s) => parseInt(s.trim(), 10));
  const total = Math.min(Number.isFinite(b) ? b : 0, 10);
  const segs = [];
  for (let i = 1; i <= total; i++) {
    segs.push(el({ width: 30, height: 8, marginLeft: 8, borderRadius: 4, backgroundColor: i === a ? C.red : (dark ? "#4A4744" : C.line) }));
  }
  const left = el({ alignItems: "center" }, [
      el({ backgroundColor: C.red, color: "#FFFFFF", fontSize: 30, fontWeight: 900, padding: "8px 22px", borderRadius: 6, letterSpacing: 3 }, ser[0]),
      el({ marginLeft: 20, fontFamily: "Forum", fontSize: 30, letterSpacing: 6, color: dark ? "#BDB7B0" : C.soft }, ser[1]),
    ]);
  if (!(Number.isFinite(a) && total)) return el({ alignItems: "center", width: "100%" }, [left]);
  return el({ justifyContent: "space-between", alignItems: "center", width: "100%" }, [
    el({ alignItems: "center" }, [
      el({ backgroundColor: C.red, color: "#FFFFFF", fontSize: 30, fontWeight: 900, padding: "8px 22px", borderRadius: 6, letterSpacing: 3 }, ser[0]),
      el({ marginLeft: 20, fontFamily: "Forum", fontSize: 30, letterSpacing: 6, color: dark ? "#BDB7B0" : C.soft }, ser[1]),
    ]),
    el({ flexDirection: "column", alignItems: "flex-end" }, [
      el({ fontFamily: "Forum", fontSize: 34, color: dark ? "#F3F1EC" : C.ink, letterSpacing: 2 }, Number.isFinite(a) && total ? `${String(a).padStart(2, "0")} / ${String(b).padStart(2, "0")}` : " "),
      el({ marginTop: 8 }, segs),
    ]),
  ]);
}

function footer(handle) {
  return el({ position: "absolute", left: 0, right: 0, bottom: 0, height: 132, backgroundColor: C.ink, padding: "0 72px", justifyContent: "space-between", alignItems: "center" }, [
    el({ alignItems: "center" }, [
      el({ width: 70, height: 70, backgroundColor: C.red, color: "#FFFFFF", fontSize: 44, fontWeight: 900, alignItems: "center", justifyContent: "center", borderRadius: 8 }, "辣"),
      el({ flexDirection: "column", marginLeft: 20 }, [
        el({ fontSize: 32, fontWeight: 900, color: "#FFFFFF", letterSpacing: 2 }, "馬文｜品牌加辣餐飲顧問"),
        el({ fontSize: 22, fontWeight: 500, color: C.gold, letterSpacing: 4, marginTop: 6 }, "實戰派・可複製輔導・總部思維"),
      ]),
    ]),
    el({ fontSize: 30, fontWeight: 500, color: "#E9E5DF" }, handle),
  ]);
}

function titleBlock(title, size, color) {
  return el({ flexDirection: "column", borderLeft: `12px solid ${C.red}`, paddingLeft: 30 },
    title.map((t) => el({ fontSize: size, fontWeight: 900, lineHeight: 1.3, letterSpacing: 2, color }, t)));
}

// 公式：炭黑數字框，等號左邊用品牌黃
function formula(f) {
  const i = f.indexOf("=");
  const parts = i > 0
    ? [el({ fontWeight: 900, color: C.gold }, f.slice(0, i).trim()), el({ margin: "0 16px", color: "#FFFFFF" }, "="), el({ color: "#FFFFFF" }, f.slice(i + 1).trim())]
    : [el({ fontWeight: 900, color: C.gold }, f)];
  return el({ marginTop: 40, backgroundColor: C.ink, borderRadius: 14, padding: "22px 30px", justifyContent: "center", fontSize: 36, fontWeight: 500 }, parts);
}

function bullets(list, size, dark) {
  return el({ flexDirection: "column", marginTop: 22 }, list.map((t) =>
    el({ marginTop: 10, fontSize: size, fontWeight: 900, lineHeight: 1.45, color: dark ? "#FFFFFF" : C.ink, alignItems: "flex-start" }, [
      el({ width: 16, height: 16, backgroundColor: C.red, marginTop: size * 0.5, marginRight: 22, flexShrink: 0 }),
      el({ flex: 1, flexWrap: "wrap" }, t),
    ])
  ));
}

function tipBox(lines, label, dark) {
  return el({ marginTop: 36, flexDirection: "column", backgroundColor: dark ? "#2B2826" : C.tint, borderLeft: `10px solid ${C.red}`, padding: "22px 34px" }, [
    el({ alignItems: "center", marginBottom: 6 }, [
      el({ width: 14, height: 14, borderRadius: 7, backgroundColor: C.red, marginRight: 12 }),
      el({ fontSize: 26, fontWeight: 900, color: dark ? "#FF8A73" : C.redDeep, letterSpacing: 3 }, label),
    ]),
    ...lines.map((t) => el({ fontSize: 30, fontWeight: 500, lineHeight: 1.6, color: dark ? "#E9E5DF" : C.body }, t)),
  ]);
}

function buildCard(params, paperUrl, darkUrl) {
  const g = (k) => clean(params.get(k));
  const type = g("type") || "item";
  const story = type === "story" || g("sz") === "story";
  const H = story ? HS : H0;
  const dark = type === "end";
  const page = g("p").slice(0, 12);
  const ser = SERIES[g("sr")] ?? [g("sr") || "總部思維", (g("en") || "HQ THINKING").toUpperCase()];
  const handle = g("hd") || "spicesupbrand.com";
  const title = rows(g("t"), 3);
  const num = g("n").slice(0, 2);
  const f = g("f");
  const body = rows(g("b"), 4);
  const li = rows(g("l"), 4);
  const tip = rows(g("tip"), 3);
  const kick = g("k");
  const tl = g("tl").slice(0, 8) || "辣點提醒";
  if (title.length === 0) throw new Error("missing t");

  const maxLen = Math.max(...title.map((t) => t.length));
  const fit = (w, cap) => Math.min(cap, Math.floor(w / maxLen));
  const bodyEl = (size) => el({ flexDirection: "column", marginTop: 34 }, body.map((t) => el({ fontSize: size, fontWeight: 500, lineHeight: 1.65, color: dark ? "#E9E5DF" : C.body }, t)));
  const none = el({}, " ");
  let main;
  if (type === "cover") {
    main = [
      kick ? el({ fontSize: 40, fontWeight: 900, color: C.red, letterSpacing: 4, marginBottom: 34 }, kick) : none,
      titleBlock(title, fit(860, 112), C.ink),
      body.length ? el({ flexDirection: "column", marginTop: 50 }, body.map((t) => el({ fontSize: 44, fontWeight: 500, lineHeight: 1.6, color: C.body }, t))) : none,
      li.length ? bullets(li, 38, false) : none,
    ];
  } else if (type === "story") {
    const cta = rows(g("cta") || "完整做法看最新貼文|免費經營健檢｜LINE @084ayepb", 2);
    main = [
      kick ? el({ fontSize: 46, fontWeight: 900, color: C.red, letterSpacing: 4, marginBottom: 40 }, kick) : none,
      titleBlock(title, fit(860, 118), C.ink),
      body.length ? el({ flexDirection: "column", marginTop: 60 }, body.map((t) => el({ fontSize: 50, fontWeight: 500, lineHeight: 1.6, color: C.body }, t))) : none,
      li.length ? bullets(li, 44, false) : none,
      g("cta") === "-" ? none : el({ marginTop: 80, flexDirection: "column", backgroundColor: C.red, borderRadius: 18, padding: "34px 44px" }, [
        el({ fontSize: 46, fontWeight: 900, color: "#FFFFFF", letterSpacing: 2 }, "→ " + cta[0]),
        cta[1] ? el({ fontSize: 36, fontWeight: 500, color: "#FFE9E3", marginTop: 12 }, cta[1]) : none,
      ]),
    ];
  } else if (type === "end") {
    main = [
      el({ fontSize: 36, fontWeight: 900, color: C.gold, letterSpacing: 6, marginBottom: 30 }, kick || "這篇重點"),
      titleBlock(title, fit(860, 80), "#FFFFFF"),
      body.length ? bodyEl(36) : none,
      li.length ? bullets(li, 37, true) : none,
      tip.length ? tipBox(tip, tl, true) : none,
    ];
  } else {
    main = [
      num ? el({ alignItems: "flex-end", marginBottom: 18 }, [
        el({ fontFamily: "Forum", fontSize: 30, letterSpacing: 6, color: C.red, marginRight: 14, marginBottom: 14 }, "STEP"),
        el({ fontFamily: "Forum", fontSize: 130, lineHeight: 0.9, color: C.red }, num),
      ]) : none,
      titleBlock(title, fit(860, 76), C.ink),
      f ? formula(f) : none,
      body.length ? bodyEl(36) : none,
      li.length ? bullets(li, 37, false) : none,
      tip.length ? tipBox(tip, tl, false) : none,
    ];
  }

  const deco = (type === "cover" || type === "story")
    ? [el({ position: "absolute", right: -40, bottom: 120, fontSize: 560, fontWeight: 900, color: C.red, opacity: 0.07, lineHeight: 1 }, "辣")]
    : [];
  const root = el(
    { position: "relative", flexDirection: "column", width: W, height: H, padding: story ? "230px 80px 0 80px" : "72px 80px 0 80px", backgroundColor: dark ? C.ink : C.paper, backgroundImage: `url(${dark ? darkUrl : paperUrl})`, backgroundRepeat: "repeat", backgroundSize: "540px 540px", fontFamily: "Noto Sans TC" },
    [...deco, header(ser, page, dark), el({ flex: 1, flexDirection: "column", justifyContent: "center", paddingBottom: story ? 330 : 150 }, main), footer(handle)],
  );
  const text = "馬文｜品牌加辣餐飲顧問實戰派・可複製輔導・總部思維" + ser[0] + "辣點提醒這篇重點=0123456789/ ." + page + handle + title.join("") + num + f + body.join("") + li.join("") + tip.join("") + kick + tl + g("cta") + "完整做法看最新貼文免費經營健檢｜LINE @084ayepb→";
  const latin = ser[1] + "STEP0123456789/ " + num;
  return { root, text, latin, W, H };
}
