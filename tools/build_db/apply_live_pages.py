#!/usr/bin/env python3
"""acikkuran.com sayfa düzenini yerel DB'ye uygular.

Girdi: sources/live_pages.json — her sayfa (0..604) için acikkuran.com/page/<n> sayfasının `uniqueSurahs`
listesi (o sayfada geçen her surenin ilk ayeti: id, surah_id, verse_number, page).
Sayfa başlangıcı = o sayfadaki en küçük ayet id'si; ayet id'si [start(p), start(p+1)) aralığındaysa sayfası p.
Ardından acikkuran_verses.page ve acikkuran_surahs.page_number (surenin 1. ayetinin sayfası) güncellenir.

Kullanım: python3 apply_live_pages.py [DB_URL]   (varsayılan postgres://localhost:5432/acikkuran)
"""
import json, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB_URL = sys.argv[1] if len(sys.argv) > 1 else "postgres://localhost:5432/acikkuran"
data = json.load((HERE / "sources" / "live_pages.json").open(encoding="utf-8"))
pages = {int(k): v for k, v in data["pages"].items()}
if data.get("errors"):
    sys.exit(f"tarama hataları var, önce düzelt: {data['errors'][:5]}")
missing = [p for p in range(0, 605) if p not in pages or not pages[p]]
if missing:
    sys.exit(f"eksik sayfalar: {missing[:20]} …")

start = {p: min(v["id"] for v in pages[p]) for p in pages}
# tutarlılık: sayfa başlangıçları artan olmalı, sayfa 0 ayet 1'den başlamalı
if start[0] != 1:
    sys.exit(f"sayfa 0 ayet 1 ile başlamıyor: {start[0]}")
for p in range(1, 605):
    if start[p] <= start[p - 1]:
        sys.exit(f"sayfa başlangıcı artmıyor: {p - 1}→{start[p - 1]}, {p}→{start[p]}")
# uniqueSurahs içindeki 'page' alanı da sayfa numarasıyla aynı olmalı
bad = [(p, v) for p in pages for v in pages[p] if v["page"] != p]
if bad:
    sys.exit(f"page alanı uyuşmuyor: {bad[:5]}")

rows = []
for p in range(0, 605):
    lo, hi = start[p], (start[p + 1] if p < 604 else 6237)
    rows.extend((vid, p) for vid in range(lo, hi))
assert len(rows) == 6236, len(rows)

csv_path = HERE / "sources" / "live_pages_by_verse.csv"
with csv_path.open("w", encoding="utf-8") as f:
    f.write("verse_id,page\n")
    f.writelines(f"{vid},{p}\n" for vid, p in rows)

sql = f"""
\\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE lp (verse_id int PRIMARY KEY, page int NOT NULL);
\\copy lp FROM '{csv_path}' WITH (FORMAT csv, HEADER true)
UPDATE acikkuran_verses v SET page = lp.page FROM lp WHERE lp.verse_id = v.id AND v.page IS DISTINCT FROM lp.page;
UPDATE acikkuran_surahs s SET page_number = v.page FROM acikkuran_verses v
 WHERE v.surah_id = s.id AND v.verse_number = 1 AND s.page_number IS DISTINCT FROM v.page;
COMMIT;
SELECT 'verses page min='||min(page)||' max='||max(page)||' distinct='||count(DISTINCT page) FROM acikkuran_verses;
SELECT 'surahs: '||string_agg(id||'='||page_number, ' ' ORDER BY id) FROM acikkuran_surahs WHERE id IN (1,2,3,89,90,109,112,114);
"""
r = subprocess.run(["psql", DB_URL, "-At"], input=sql, text=True, capture_output=True)
print(r.stdout)
if r.returncode != 0:
    sys.exit(r.stderr)
print(f"uygulandı: {len(rows)} ayet, {len(start)} sayfa (kaynak: acikkuran.com/page/0..604)")
