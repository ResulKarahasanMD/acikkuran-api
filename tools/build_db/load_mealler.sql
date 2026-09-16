-- acikkuran.com'dan derlenmiş meal CSV'sini (sira,sure,ayet,metin,hoca) yerel şemaya yükler (upsert).
-- Kaynak: github.com/mermer98/acikkuran-quran-app mealler.csv — acikkuran.com verisi, CC BY-NC-SA 4.0; çevirmen atfı korunur.
-- Yazar kimlikleri: sources/author_map.csv (make_author_map.py ile üretilir).
-- Çalıştırma (tools/build_db içinde):
--   psql "$DB_URL" -f load_mealler.sql   (yollar tools/build_db dizinine görelidir)
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE m (sira int, sure int, ayet int, metin text, hoca text);
\copy m FROM 'sources/mealler.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE amap (id int PRIMARY KEY, name text UNIQUE, description text, language text);
\copy amap FROM 'sources/author_map.csv' WITH (FORMAT csv, HEADER true, NULL '')

-- eşleşmeyen çevirmen adı varsa dur
DO $$ DECLARE bad text; BEGIN
  SELECT string_agg(DISTINCT hoca, ', ') INTO bad FROM m WHERE hoca NOT IN (SELECT name FROM amap);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'eslesmeyen cevirmen: %', bad; END IF;
END $$;

INSERT INTO acikkuran_authors (id, name, description, language, url)
SELECT id, name, description, language, NULL FROM amap
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, language = EXCLUDED.language;

-- CSV'deki yazarlar için metin acikkuran sürümüyle güncellenir (Tanzil/quran.com kaynaklı satırlar üzerine yazılır)
INSERT INTO acikkuran_translations (verse_id, author_id, surah_id, verse_number, text)
SELECT DISTINCT ON (v.id, a.id) v.id, a.id, m.sure, m.ayet, COALESCE(m.metin, '')  -- kaynakta (ve canlı sitede) boş olan ayetler boş dize olarak korunur
FROM m JOIN amap a ON a.name = m.hoca
JOIN acikkuran_verses v ON v.surah_id = m.sure AND v.verse_number = m.ayet
ORDER BY v.id, a.id, m.sira
ON CONFLICT (verse_id, author_id) DO UPDATE SET text = EXCLUDED.text, surah_id = EXCLUDED.surah_id, verse_number = EXCLUDED.verse_number;

-- doğrulama: CSV'deki her yazar için 6236 ayet
DO $$ DECLARE bad text; BEGIN
  SELECT string_agg(a.name || '=' || c.n, ', ') INTO bad
  FROM (SELECT author_id, count(*) n FROM acikkuran_translations GROUP BY author_id) c
  JOIN amap a ON a.id = c.author_id WHERE a.name IN (SELECT DISTINCT hoca FROM m) AND c.n <> 6236;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'eksik ayet: %', bad; END IF;
END $$;
COMMIT;

SELECT count(DISTINCT author_id) AS csv_authors_loaded FROM acikkuran_translations
 WHERE author_id IN (SELECT id FROM amap WHERE name IN (SELECT DISTINCT hoca FROM m));
SELECT a.id, a.name, a.language, count(t.id) AS n
FROM acikkuran_authors a LEFT JOIN acikkuran_translations t ON t.author_id = a.id
GROUP BY a.id ORDER BY a.id;
