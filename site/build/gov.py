"""Taiwan government open data -> compact JSON for the site-evaluation page.

Outputs into OUT_DIR:
  villages.json  村里: centroid, area, population by age band, households, income
  biz/<county>.json  稅籍餐飲登記 aggregated by town|road (counts, new openings)
  rent.json      實價登錄 店面租金 median NT$/坪 by town and town|road
  meta.json      data vintages
Every source is optional: a failed download is logged and the rest still builds.
"""
import csv, io, json, os, re, sys, zipfile, datetime, statistics, traceback
from collections import defaultdict
import requests

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
S = requests.Session()
S.headers["User-Agent"] = "Mozilla/5.0 (site-eval data build)"
META = {"built": datetime.date.today().isoformat()}


def get(url, **kw):
    r = S.get(url, timeout=kw.pop("timeout", 300), **kw)
    r.raise_for_status()
    return r.content


def dataset(i):
    return json.loads(get(f"https://data.gov.tw/api/v2/rest/dataset/{i}"))["result"]


def norm(s):
    return (s or "").strip().replace("台", "臺").replace("　", "")


def text(b):
    for enc in ("utf-8-sig", "big5", "cp950"):
        try:
            return b.decode(enc)
        except UnicodeDecodeError:
            pass
    return b.decode("utf-8", "ignore")

# ---------------------------------------------------------------- villages
def villages():
    import shapefile  # pyshp
    from pyproj import Geod
    geod = Geod(ellps="GRS80")
    ds = dataset(7438)
    url = ds["distribution"][0]["resourceDownloadUrl"]
    z = zipfile.ZipFile(io.BytesIO(get(url)))
    names = z.namelist()
    base = [n[:-4] for n in names if n.lower().endswith(".shp")][0]
    rd = shapefile.Reader(shp=io.BytesIO(z.read(base + ".shp")), dbf=io.BytesIO(z.read(base + ".dbf")),
                          shx=io.BytesIO(z.read(base + ".shx")), encoding="utf-8")
    fields = [f[0] for f in rd.fields[1:]]
    V = {}
    for sr in rd.iterShapeRecords():
        rec = dict(zip(fields, sr.record))
        pts = sr.shape.points
        if not pts:
            continue
        parts = list(sr.shape.parts) + [len(pts)]
        area = 0.0; cx = cy = wsum = 0.0
        for i in range(len(parts) - 1):
            ring = pts[parts[i]:parts[i + 1]]
            if len(ring) < 3:
                continue
            lons, lats = zip(*ring)
            a, _ = geod.polygon_area_perimeter(lons, lats)
            area += a  # signed: holes subtract
            aw = abs(a)
            cx += aw * sum(lons) / len(lons); cy += aw * sum(lats) / len(lats); wsum += aw
        if not wsum:
            continue
        key = (norm(rec["COUNTYNAME"]), norm(rec["TOWNNAME"]), norm(rec["VILLNAME"]))
        V[key] = {"code": rec["VILLCODE"], "c": key[0], "t": key[1], "v": key[2],
                  "lat": round(cy / wsum, 5), "lon": round(cx / wsum, 5), "km2": round(abs(area) / 1e6, 4)}
    META["villages_boundary"] = ds.get("modifiedDate")
    print("village shapes", len(V))

    # population by single age (latest month)
    ds = dataset(77132)
    dist = sorted(ds["distribution"], key=lambda d: d["resourceDescription"][:5])
    d = dist[-1]
    META["population"] = d["resourceDescription"][:5]
    raw = text(get(d["resourceDownloadUrl"]))
    rows = list(csv.reader(io.StringIO(raw)))
    hdr = rows[0]
    print("pop header", hdr[:8], len(hdr), rows[1][:6])
    if rows[1] and not re.match(r"\d", rows[1][0] or ""):  # second header row (english)
        rows = rows[1:]
    H = {h: i for i, h in enumerate(hdr)}
    def col(name):
        return H.get(name)
    age_cols = defaultdict(list)
    for h, i in H.items():
        m = re.match(r"people_age_(\d+)(?:up)?_(m|f)", h) or re.match(r"(\d+)歲.*[男女]", h)
        if m:
            age_cols[int(m.group(1))].append(i)
    if not age_cols:  # chinese headers like 0歲-男
        for h, i in H.items():
            m = re.search(r"(\d+)", h)
            if m and ("男" in h or "女" in h):
                age_cols[int(m.group(1))].append(i)
    site_i = col("site_id") if col("site_id") is not None else col("區域別")
    vill_i = col("village") if col("village") is not None else col("村里名稱")
    hh_i = col("household_no") if col("household_no") is not None else col("戶數")
    pop_i = col("people_total") if col("people_total") is not None else col("人口數")
    bands = [(0, 14), (15, 24), (25, 44), (45, 64), (65, 200)]
    matched = 0
    for r in rows[1:]:
        if len(r) < len(hdr) - 2 or not r[pop_i].strip().isdigit():
            continue
        site = norm(r[site_i])
        m = re.match(r"(.+?[縣市])(.+)", site)
        if not m:
            continue
        key = (m.group(1), m.group(2), norm(r[vill_i]))
        v = V.get(key)
        if not v:
            continue
        b = [0] * 5
        for age, idxs in age_cols.items():
            n = sum(int(r[i] or 0) for i in idxs)
            for j, (lo, hi) in enumerate(bands):
                if lo <= age <= hi:
                    b[j] += n
        v["pop"] = int(r[pop_i]); v["hh"] = int(r[hh_i] or 0); v["age"] = b
        matched += 1
    print("population matched", matched)
    for v in V.values():
        VT[(v["t"], v["v"])].append(v)

    # income by village (latest year available), one file per county letter
    letters = "ABCDEFGHIJKMNOPQTUVWXZ"
    year = None
    for y in range(datetime.date.today().year - 1911, 105, -1):
        try:
            requests.head(f"https://www.fia.gov.tw/WEB/fia/ias/ias{y}/{y}_165-A.csv", timeout=30).raise_for_status()
            if S.get(f"https://www.fia.gov.tw/WEB/fia/ias/ias{y}/{y}_165-A.csv", timeout=60).status_code == 200:
                year = y; break
        except Exception:
            continue
    inc = 0
    if year:
        META["income"] = f"{year}年度"
        for L in letters:
            try:
                raw = text(get(f"https://www.fia.gov.tw/WEB/fia/ias/ias{year}/{year}_165-{L}.csv"))
            except Exception:
                continue
            rr = list(csv.reader(io.StringIO(raw)))
            title = "".join(rr[0]) if rr else ""
            hi = next((i for i, r in enumerate(rr) if any("中位數" in c for c in r)), None)
            if hi is None:
                continue
            h = rr[hi]
            if L == "A": print("income header", h, rr[hi+1][:6])
            ti = next(i for i, c in enumerate(h) if "鄉鎮" in c)
            vi = next(i for i, c in enumerate(h) if "村里" in c)
            avg_i = next(i for i, c in enumerate(h) if "平均" in c)
            med_i = next(i for i, c in enumerate(h) if "中位" in c)
            for r in rr[hi + 1:]:
                if len(r) <= med_i:
                    continue
                t = norm(r[ti]); vn = norm(r[vi])
                cand = [x for x in VT.get((t, vn), []) if x["c"] == CODE2C.get(L.lower())]
                if cand:
                    pick = cand[0]
                    if pick:
                        try:
                            pick["inc_med"] = round(float(r[med_i]))
                            pick["inc_avg"] = round(float(r[avg_i]))
                            inc += 1
                        except ValueError:
                            pass
    print("income matched", inc, year)
    out = [v for v in V.values()]
    with open(os.path.join(OUT, "villages.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))


VT = defaultdict(list)

# ---------------------------------------------------------------- business registry
ADDR = re.compile(r"^(?P<c>..[縣市])(?P<t>.{1,4}?[鄉鎮市區])(?:.{1,4}?[村里])?(?:\d+鄰)?(?P<r>[^\d段巷弄號]{1,10}?(?:路|街|大道))(?P<s>[一二三四五六七八九十\d]+段)?")
SUB = {"5611": "餐館", "5612": "小吃", "5613": "外帶外送", "5619": "其他餐食", "5620": "外燴團膳",
       "5621": "外燴團膳", "5631": "飲料店", "5632": "酒吧", "5630": "飲料店"}


def biz():
    url = "https://eip.fia.gov.tw/data/BGMOPEN1.zip"
    z = zipfile.ZipFile(io.BytesIO(get(url, timeout=900)))
    name = [n for n in z.namelist() if n.lower().endswith(".csv")][0]
    today = datetime.date.today()
    agg = defaultdict(lambda: defaultdict(lambda: {"n": 0, "y1": 0, "y3": 0, "sub": defaultdict(int)}))
    with z.open(name) as fh:
        rd = csv.reader(io.TextIOWrapper(fh, encoding="utf-8-sig", errors="ignore"))
        hdr = next(rd)
        H = {h.strip(): i for i, h in enumerate(hdr)}
        ai = H["營業地址"]; di = H["設立日期"]
        ind = [i for h, i in H.items() if h.startswith("行業代號")]
        n = 0
        for r in rd:
            if len(r) <= ai:
                continue
            codes = [r[i].strip() for i in ind if i < len(r)]
            code = next((c for c in codes if c.startswith("56")), None)
            if not code:
                continue
            m = ADDR.match(norm(r[ai]))
            if not m:
                continue
            c, t = m.group("c"), m.group("t")
            road = m.group("r") + (m.group("s") or "")
            age = None
            try:
                ds = r[di].strip()
                y = int(ds[:-4]) + 1911; mo = int(ds[-4:-2])
                age = (today.year - y) * 12 + today.month - mo
            except Exception:
                pass
            sub = SUB.get(code[:4], "其他餐飲")
            for k in (t + "|", t + "|" + road, t + "|" + m.group("r")):
                a = agg[c][k]
                a["n"] += 1; a["sub"][sub] += 1
                if age is not None and age <= 12: a["y1"] += 1
                if age is not None and age <= 36: a["y3"] += 1
            n += 1
    os.makedirs(os.path.join(OUT, "biz"), exist_ok=True)
    for c, d in agg.items():
        out = {k: [v["n"], v["y1"], v["y3"], dict(v["sub"])] for k, v in d.items()}
        with open(os.path.join(OUT, "biz", c + ".json"), "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    META["biz"] = today.isoformat()
    print("biz rows", n)

# ---------------------------------------------------------------- rent (實價登錄 租賃)
CODE2C = {"a": "臺北市", "b": "臺中市", "c": "基隆市", "d": "臺南市", "e": "高雄市", "f": "新北市", "g": "宜蘭縣",
          "h": "桃園市", "i": "嘉義市", "j": "新竹縣", "k": "苗栗縣", "m": "南投縣", "n": "彰化縣", "o": "新竹市",
          "p": "雲林縣", "q": "嘉義縣", "t": "屏東縣", "u": "花蓮縣", "v": "臺東縣", "w": "金門縣", "x": "澎湖縣", "z": "連江縣"}


def rent():
    today = datetime.date.today()
    y = today.year - 1911; q = (today.month - 1) // 3 + 1
    seasons = []
    for _ in range(8):
        q -= 1
        if q == 0:
            y -= 1; q = 4
        seasons.append(f"{y}S{q}")
    vals = defaultdict(list)
    got = []
    for s in seasons:
        if len(got) >= 4:
            break
        try:
            b = get(f"https://plvr.land.moi.gov.tw/DownloadSeason?season={s}&type=zip&fileName=lvr_landcsv.zip", timeout=600)
            z = zipfile.ZipFile(io.BytesIO(b))
        except Exception as e:
            print("rent season fail", s, e); continue
        got.append(s)
        for nm in z.namelist():
            m = re.match(r"([a-z])_lvr_land_c\.csv$", nm.lower())
            if not m:
                continue
            c = CODE2C.get(m.group(1))
            rows = list(csv.reader(io.StringIO(text(z.read(nm)))))
            H = {h: i for i, h in enumerate(rows[0])}
            ti = H.get("鄉鎮市區"); ai = H.get("土地位置建物門牌"); bi = H.get("建物型態")
            ui = H.get("主要用途"); pi = H.get("總額元"); si = H.get("建物總面積平方公尺"); oi = H.get("租賃標的")
            for r in rows[2:]:
                try:
                    kind = r[bi] + r[ui] + (r[oi] if oi is not None else "")
                    if "店" not in kind and "商業" not in r[ui]:
                        continue
                    price = float(r[pi]); area = float(r[si]) * 0.3025
                    if price <= 0 or area < 3:
                        continue
                    pp = price / area
                    if pp < 100 or pp > 30000:
                        continue
                    t = norm(r[ti])
                    mm = ADDR.match(norm(c + t + re.sub(r"^.{2}[縣市]", "", re.sub(r"^.+?[鄉鎮市區]", "", r[ai]))))
                    vals[c + "|" + t].append(pp)
                    if mm:
                        vals[c + "|" + t + "|" + mm.group("r") + (mm.group("s") or "")].append(pp)
                        vals[c + "|" + t + "|" + mm.group("r")].append(pp)
                except Exception:
                    continue
    out = {k: [round(statistics.median(v)), len(v)] for k, v in vals.items() if len(v) >= 3}
    with open(os.path.join(OUT, "rent.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    META["rent"] = ",".join(got)
    print("rent keys", len(out), got)


def run(fn):
    try:
        fn()
    except Exception:
        traceback.print_exc()
        META.setdefault("errors", []).append(fn.__name__)


if __name__ == "__main__":
    which = sys.argv[2:] or ["villages", "biz", "rent"]
    for w in which:
        run(globals()[w])
    mp = os.path.join(OUT, "meta.json")
    old = json.load(open(mp)) if os.path.exists(mp) else {}
    old.update(META)
    json.dump(old, open(mp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
