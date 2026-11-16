"""OSM Taiwan extract -> per-tile POI + major-road JSON for the site-evaluation page.

Usage: python osm.py taiwan-latest.osm.pbf OUT_DIR
Tile = 0.02 deg square, key "<floor(lat/0.02)>_<floor(lon/0.02)>".
Each tile: {"p": [[cat, lat_e5, lon_e5, name, sub], ...], "r": {"<cellkey>": roadclass}}
Road cells are 0.002 deg; roadclass 5 motorway/trunk, 4 primary, 3 secondary, 2 tertiary.
"""
import json, math, os, sys
from collections import defaultdict
import osmium

T = 0.02
C = 0.002
ROAD = {"motorway": 5, "trunk": 5, "primary": 4, "secondary": 3, "tertiary": 2,
        "motorway_link": 0, "trunk_link": 3, "primary_link": 3, "secondary_link": 2}


def classify(tags):
    a = tags.get("amenity"); s = tags.get("shop"); r = tags.get("railway")
    pt = tags.get("public_transport"); h = tags.get("highway")
    if a in ("restaurant", "fast_food", "food_court"):
        return "food", a
    if a in ("cafe", "ice_cream") or s in ("tea", "coffee", "beverages", "bubble_tea"):
        return "drink", a or s
    if a in ("bar", "pub", "biergarten"):
        return "bar", a
    if s in ("bakery", "pastry", "confectionery"):
        return "bakery", s
    if s in ("convenience",):
        return "conv", s
    if s in ("supermarket",):
        return "market", s
    if s in ("mall", "department_store") or a == "marketplace":
        return "mall", s or a
    if a in ("school", "university", "college", "kindergarten", "prep_school"):
        return "school", a
    if a in ("hospital", "clinic"):
        return "hospital", a
    if tags.get("office") or tags.get("building") == "office":
        return "office", tags.get("office") or "office"
    if r == "station" or (pt == "station" and tags.get("train") == "yes") or tags.get("station") == "subway":
        sub = tags.get("station") or tags.get("subway") and "subway" or "train"
        if tags.get("station") == "subway" or tags.get("subway") == "yes":
            sub = "subway"
        return "station", sub
    if h == "bus_stop" or (pt == "platform" and tags.get("bus") == "yes"):
        return "bus", "bus"
    if a == "parking":
        return "parking", tags.get("parking", "")
    if a in ("cinema", "theatre") or tags.get("leisure") in ("fitness_centre", "sports_centre"):
        return "leisure", a or tags.get("leisure")
    if tags.get("tourism") in ("hotel", "hostel", "guest_house"):
        return "hotel", tags.get("tourism")
    if tags.get("tourism") == "attraction" or a == "place_of_worship":
        return "attract", tags.get("tourism") or a
    return None, None


def tkey(lat, lon):
    return f"{math.floor(lat / T)}_{math.floor(lon / T)}"


class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.tiles = defaultdict(lambda: {"p": [], "r": {}})
        self.n = 0

    def add(self, tags, lat, lon):
        cat, sub = classify(tags)
        if not cat:
            return
        name = tags.get("name:zh") or tags.get("name") or ""
        brand = tags.get("brand:zh") or tags.get("brand") or ""
        cuisine = tags.get("cuisine", "")
        extra = cuisine if cat in ("food", "drink", "bar", "bakery") else sub
        row = [cat, round(lat * 1e5), round(lon * 1e5), name[:30], (extra or "")[:24]]
        if brand and brand != name:
            row.append(brand[:20])
        self.tiles[tkey(lat, lon)]["p"].append(row)
        self.n += 1

    def node(self, n):
        if n.tags and n.location.valid():
            self.add(n.tags, n.location.lat, n.location.lon)

    def area(self, a):
        try:
            tags = a.tags
            cat, _ = classify(tags)
            if not cat:
                return
            lats = []; lons = []
            for ring in a.outer_rings():
                for nd in ring:
                    if nd.location.valid():
                        lats.append(nd.location.lat); lons.append(nd.location.lon)
            if lats:
                self.add(tags, sum(lats) / len(lats), sum(lons) / len(lons))
        except Exception:
            pass

    def way(self, w):
        cls = ROAD.get(w.tags.get("highway"))
        if not cls:
            return
        try:
            pts = [(nd.location.lat, nd.location.lon) for nd in w.nodes if nd.location.valid()]
        except Exception:
            return
        name = w.tags.get("name", "")
        for i in range(len(pts)):
            a = pts[i]; b = pts[i + 1] if i + 1 < len(pts) else a
            d = max(abs(a[0] - b[0]), abs(a[1] - b[1]))
            steps = max(1, int(d / (C / 2)))
            for k in range(steps):
                lat = a[0] + (b[0] - a[0]) * k / steps
                lon = a[1] + (b[1] - a[1]) * k / steps
                ck = f"{math.floor(lat / C)}_{math.floor(lon / C)}"
                r = self.tiles[tkey(lat, lon)]["r"]
                cur = r.get(ck)
                if not cur or cur[0] < cls:
                    r[ck] = [cls, name[:16]]


def main(pbf, out):
    h = H()
    h.apply_file(pbf, locations=True, idx="flex_mem")
    os.makedirs(out, exist_ok=True)
    idx = {}
    for k, v in h.tiles.items():
        with open(os.path.join(out, k + ".json"), "w", encoding="utf-8") as f:
            json.dump(v, f, ensure_ascii=False, separators=(",", ":"))
        idx[k] = len(v["p"])
    with open(os.path.join(out, "_index.json"), "w") as f:
        json.dump(idx, f, separators=(",", ":"))
    print("pois", h.n, "tiles", len(idx))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
