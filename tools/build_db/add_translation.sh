#!/usr/bin/env bash
# Tanzil biçimli (sure|ayet|metin) bir meali yerel acikkuran DB'sine ekler ve Meilisearch indeksini yeniler.
#
# Kullanım (tools/build_db içinde):
#   ./add_translation.sh <author_id> <tanzil_id|dosya> "<Ad>" "<Eser adı veya ''>" <tr|en> [--no-meili]
# Örnek:
#   ./add_translation.sh 200 tr.golpinarli "Abdülbaki Gölpınarlı" "Kur'an-ı Kerim ve Meali" tr
#
# - author_id: acikkuran'ın kendi 51 yazarı 1–117 arasında; kendi eklemeleriniz için 200+ kullanın.
# - İkinci argüman bir Tanzil kimliğiyse (örn. tr.golpinarli) sources/<id>.txt yoksa tanzil.net'ten indirilir.
# - Aynı (ayet, yazar) tekrar yüklenirse metin güncellenir (upsert).
# - Tanzil koşulları: ticari olmayan kullanım + atıf; yazar/eser adını doğru girin.
set -euo pipefail
cd "$(dirname "$0")"

if [ $# -lt 5 ]; then sed -n 2,13p "$0"; exit 1; fi
AUTHOR_ID=$1; SRC=$2; NAME=$3; DESC=$4; LANG=$5; MEILI=${6:-}
DB_URL=${DB_URL:-postgres://localhost:5432/acikkuran}

case "$LANG" in tr|en) ;; *) echo "dil tr veya en olmalı: $LANG" >&2; exit 1;; esac
[[ "$AUTHOR_ID" =~ ^[0-9]+$ ]] || { echo "author_id sayı olmalı: $AUTHOR_ID" >&2; exit 1; }

if [ -f "$SRC" ]; then FILE=$SRC
else
  FILE="sources/$SRC.txt"
  if [ ! -f "$FILE" ]; then
    echo "indiriliyor: https://tanzil.net/trans/$SRC → $FILE"
    curl -fsSL -o "$FILE" "https://tanzil.net/trans/$SRC"
  fi
fi

# yalnız veri satırları: "sure|ayet|metin"; Tanzil'in sondaki # lisans bloğu ve boş satırlar atılır
CLEAN=$(mktemp); trap 'rm -f "$CLEAN"' EXIT
grep -E '^[0-9]+\|[0-9]+\|' "$FILE" > "$CLEAN"
N=$(wc -l < "$CLEAN" | tr -d ' ')
if [ "$N" -ne 6236 ]; then echo "beklenen 6236 satır, bulunan $N ($FILE)" >&2; exit 1; fi

# metin içindeki ters bölü COPY'de kaçış sayılmasın diye ikilenir
sed 's/\\/\\\\/g' "$CLEAN" > "$CLEAN.esc" && mv "$CLEAN.esc" "$CLEAN"

psql "$DB_URL" -v ON_ERROR_STOP=1 -q \
  -v aid="$AUTHOR_ID" -v aname="$NAME" -v adesc="$DESC" -v alang="$LANG" <<SQL
BEGIN;
INSERT INTO acikkuran_authors (id, name, description, language, url)
  VALUES (:aid, :'aname', NULLIF(:'adesc', ''), :'alang', NULL)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, language = EXCLUDED.language;
CREATE TEMP TABLE t (surah int, verse int, text text);
\\copy t FROM '$CLEAN' WITH (FORMAT text, DELIMITER '|')
INSERT INTO acikkuran_translations (verse_id, author_id, surah_id, verse_number, text)
  SELECT v.id, :aid, t.surah, t.verse, t.text
  FROM t JOIN acikkuran_verses v ON v.surah_id = t.surah AND v.verse_number = t.verse
  ON CONFLICT (verse_id, author_id) DO UPDATE SET text = EXCLUDED.text;
DO \$\$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM acikkuran_translations WHERE author_id = $AUTHOR_ID;
  IF n <> 6236 THEN RAISE EXCEPTION 'yazar % için % satır, 6236 bekleniyordu', $AUTHOR_ID, n; END IF;
END \$\$;
COMMIT;
SELECT a.id, a.name, a.language, count(t.id) AS verses, left(min(t.text) FILTER (WHERE t.verse_id = 1), 60) AS "1:1"
  FROM acikkuran_authors a JOIN acikkuran_translations t ON t.author_id = a.id WHERE a.id = :aid GROUP BY a.id;
SQL

if [ "$MEILI" = "--no-meili" ]; then echo "Meilisearch atlandı (node index_meili.mjs ile yenileyin)"; else node index_meili.mjs; fi
