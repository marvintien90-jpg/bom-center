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


CN = "零一二三四五六七八九"


def cnum(n):
    n = int(n)
    if n <= 10:
        return "十" if n == 10 else CN[n]
    if n < 20:
        return "十" + CN[n - 10]
    return CN[n // 10] + "十" + (CN[n % 10] if n % 10 else "")


def norm(s):
    s = (s or "").strip().replace("台", "臺").replace("　", "").replace(" ", "")
    s = s.translate(str.maketrans("０１２３４５６７８９", "0123456789"))
    return re.sub(r"(\d+)段", lambda m: cnum(m.group(1)) + "段", s)


def text(b):
    for enc in ("utf-8-sig", "big5", "cp950"):
        try:
            return b.decode(enc)
        except UnicodeDecodeError:
            pass
    return b.decode("utf-8", "ignore")

# ---------------------------------------------------------------- villages

def village_shapes():
    """(record, [ring of (lon,lat)]) from the official SHP, else the taiwan-atlas topojson (same MOI source)."""
    try:
        import shapefile
        ds = dataset(7438)
        z = zipfile.ZipFile(io.BytesIO(get(ds["distribution"][0]["resourceDownloadUrl"])))
        base = [n[:-4] for n in z.namelist() if n.lower().endswith(".shp")][0]
        rd = shapefile.Reader(shp=io.BytesIO(z.read(base + ".shp")), dbf=io.BytesIO(z.read(base + ".dbf")),
                              shx=io.BytesIO(z.read(base + ".shx")), encoding="utf-8")
        fields = [f[0] for f in rd.fields[1:]]
        out = []
        for sr in rd.iterShapeRecords():
            pts = sr.shape.points; parts = list(sr.shape.parts) + [len(pts)]
            out.append((dict(zip(fields, sr.record)), [pts[parts[i]:parts[i + 1]] for i in range(len(parts) - 1)]))
        META["villages_boundary"] = "內政部 " + (ds.get("modifiedDate") or "")[:10]
        return out
    except Exception as e:
        print("official village SHP failed, using taiwan-atlas:", e)
    topo = json.loads(get("https://cdn.jsdelivr.net/npm/taiwan-atlas@2021.9.20/villages-10t.json"))
    sc = topo["transform"]["scale"]; tr = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0; pts = []
        for dx, dy in arc:
            x += dx; y += dy
            pts.append((x * sc[0] + tr[0], y * sc[1] + tr[1]))
        arcs.append(pts)
    def ring(ix):
        pts = []
        for i in ix:
            a = arcs[i] if i >= 0 else arcs[~i][::-1]
            pts.extend(a if not pts else a[1:])
        return pts
    out = []
    for g in topo["objects"]["villages"]["geometries"]:
        props = g.get("properties", {})
        if g["type"] == "Polygon":
            rings = [ring(r) for r in g["arcs"][:1]]
        elif g["type"] == "MultiPolygon":
            rings = [ring(p[0]) for p in g["arcs"]]
        else:
            continue
        out.append((props, rings))
    META["villages_boundary"] = "taiwan-atlas 2021（內政部村里界）"
    print("atlas props sample", out[0][0] if out else None)
    return out

def villages():
    from pyproj import Geod
    geod = Geod(ellps="GRS80")
    V = {}
    for rec, rings in village_shapes():
        area = 0.0; cx = cy = wsum = 0.0
        for ring in rings:
            if len(ring) < 3:
                continue
            lons, lats = zip(*ring)
            a, _ = geod.polygon_area_perimeter(lons, lats)
            aw = abs(a)
            area += aw
            cx += aw * sum(lons) / len(lons); cy += aw * sum(lats) / len(lats); wsum += aw
        if not wsum:
            continue
        key = (norm(rec["COUNTYNAME"]), norm(rec["TOWNNAME"]), norm(rec["VILLNAME"]))
        V[key] = {"code": rec.get("VILLCODE"), "c": key[0], "t": key[1], "v": key[2],
                  "lat": round(cy / wsum, 5), "lon": round(cx / wsum, 5), "km2": round(area / 1e6, 4)}
    print("village shapes", len(V))

    # population by single age: 戶政司 API ODRP014 (latest available month, paged)
    today = datetime.date.today()
    y, m = today.year - 1911, today.month
    data = None
    for _ in range(8):
        m -= 1
        if m == 0:
            y -= 1; m = 12
        ym = f"{y}{m:02d}"
        try:
            first = json.loads(get(f"https://www.ris.gov.tw/rs-opendata/api/v1/datastore/ODRP014/{ym}?page=1", timeout=120))
            if not first.get("responseData"):
                continue
            data = list(first["responseData"])
            for pg in range(2, int(first.get("totalPage", 1)) + 1):
                data += json.loads(get(f"https://www.ris.gov.tw/rs-opendata/api/v1/datastore/ODRP014/{ym}?page={pg}", timeout=120))["responseData"]
            META["population"] = ym
            break
        except Exception as e:
            print("population month fail", ym, e)
    bands = [(0, 14), (15, 24), (25, 44), (45, 64), (65, 200)]
    matched = 0
    for r in data or []:
        site = norm(r.get("site_id"))
        mm = re.match(r"(.+?[縣市])(.+)", site)
        if not mm:
            continue
        v = V.get((mm.group(1), mm.group(2), norm(r.get("village"))))
        if not v:
            continue
        b = [0] * 5
        for k, val in r.items():
            a = re.match(r"people_age_(\d+)", k)
            if a:
                age = int(a.group(1))
                for j, (lo, hi) in enumerate(bands):
                    if lo <= age <= hi:
                        b[j] += int(val or 0)
        v["pop"] = int(r.get("people_total") or 0); v["hh"] = int(r.get("household_no") or 0); v["age"] = b
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
            ti = next((i for i, c in enumerate(h) if "鄉鎮" in c or "縣市" in c), 0)
            vi = next(i for i, c in enumerate(h) if "村里" in c)
            avg_i = next(i for i, c in enumerate(h) if "平均" in c)
            med_i = next(i for i, c in enumerate(h) if "中位" in c)
            for r in rr[hi + 1:]:
                if len(r) <= med_i:
                    continue
                t = norm(r[ti]); vn = norm(r[vi])
                mt = re.match(r"^(..[縣市])(.+)$", t)
                if mt:
                    t = mt.group(2)
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
