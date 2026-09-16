#!/usr/bin/env python3
"""acikkuran yazar kimlik eşlemesini üretir → sources/author_map.csv (id,name,description,language).

Kaynaklar (öncelik sırasıyla):
  1. acikkuran.com ayet sayfasının __NEXT_DATA__ JSON'u (canlı kimlikler; 115, 117 gibi frontend listesinde olmayanlar burada)
  2. acik-kuran/acikkuran-frontend data/authors.js (49 kayıt; açıklama metinleri)
Kullanım: python3 make_author_map.py <live_page.html> <fe_authors.js>
"""
import csv, json, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
live_html, fe_js = sys.argv[1], sys.argv[2]

h = Path(live_html).read_text(encoding="utf-8")
m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', h, re.S)
if not m:
    sys.exit("__NEXT_DATA__ bulunamadı")
data = json.loads(m.group(1))

live = {}
def walk(o):
    if isinstance(o, dict):
        if isinstance(o.get("id"), int) and "name" in o and "language" in o:
            live[o["id"]] = (o["name"], o.get("description"), o["language"])
        for v in o.values():
            walk(v)
    elif isinstance(o, list):
        for v in o:
            walk(v)
walk(data)

fe = {}
src = Path(fe_js).read_text(encoding="utf-8")
for mm in re.finditer(r'\{\s*description:\s*(null|"[^"]*"),\s*id:\s*(\d+),\s*language:\s*"(\w+)",\s*name:\s*"([^"]+)"', src):
    desc, i, lang, name = mm.groups()
    fe[int(i)] = (name, None if desc == "null" else desc.strip('"'), lang)

allm = dict(fe)
allm.update(live)  # canlı sayfa öncelikli

out = HERE / "sources" / "author_map.csv"
with out.open("w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["id", "name", "description", "language"])
    for i in sorted(allm):
        name, desc, lang = allm[i]
        w.writerow([i, name, desc if desc is not None else "", lang])

print(f"author_map rows: {len(allm)} → {out}")
print("live-only ids:", sorted(set(live) - set(fe)), "| fe-only ids:", sorted(set(fe) - set(live)))
for i in (24, 115, 117):
    print(i, allm.get(i))
