-- acikkuran_translations fiziksel sırasını yeniden kurar: ayet → dil (tr önce) → yazar id.
-- Neden: /surah/:s/verse/:v/translations ucunda ORDER BY yok; gerçek API ilk kaydı yazar 3 (Ahmed Hulusi) döndürür
-- (test/verses.spec.js). Tabloyu sıralı yeniden yükleyip takas eder; id'ler ve kısıtlar korunur.
\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE acikkuran_translations_new (LIKE acikkuran_translations INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
INSERT INTO acikkuran_translations_new
SELECT t.* FROM acikkuran_translations t JOIN acikkuran_authors a ON a.id = t.author_id
ORDER BY t.verse_id, (a.language = 'tr') DESC, t.author_id;
ALTER SEQUENCE acikkuran_translations_id_seq OWNED BY NONE;
DROP TABLE acikkuran_translations;
ALTER TABLE acikkuran_translations_new RENAME TO acikkuran_translations;
ALTER TABLE acikkuran_translations
  ADD CONSTRAINT acikkuran_translations_verse_id_fkey FOREIGN KEY (verse_id) REFERENCES acikkuran_verses(id),
  ADD CONSTRAINT acikkuran_translations_author_id_fkey FOREIGN KEY (author_id) REFERENCES acikkuran_authors(id);
ALTER SEQUENCE IF EXISTS acikkuran_translations_id_seq OWNED BY acikkuran_translations.id;
ALTER TABLE acikkuran_translations RENAME CONSTRAINT acikkuran_translations_new_pkey TO acikkuran_translations_pkey;
ALTER TABLE acikkuran_translations RENAME CONSTRAINT acikkuran_translations_new_verse_id_author_id_key TO acikkuran_translations_verse_id_author_id_key;
COMMIT;
ANALYZE acikkuran_translations;
SELECT count(*) AS rows_after FROM acikkuran_translations;
SELECT author_id FROM acikkuran_translations WHERE surah_id = 1 AND verse_number = 1 LIMIT 3;
