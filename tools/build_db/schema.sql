-- acikkuran-api şeması — routes/*.js içindeki SQL'den türetildi (2026-09-17).
-- Kolon adları ve tipleri uçların beklediği gibi; acikkuran.com'un gerçek DDL'i özel, bu bir yeniden inşadır.
DROP TABLE IF EXISTS acikkuran_footnotes, acikkuran_translations, acikkuran_rootverses, acikkuran_verseparts,
  acikkuran_rootwords, acikkuran_rootdiffs, acikkuran_roots, acikkuran_rootchars, acikkuran_verses,
  acikkuran_surahs, acikkuran_authors CASCADE;

CREATE TABLE acikkuran_authors (
  id integer PRIMARY KEY, name text NOT NULL, description text, language text NOT NULL, url text
);
CREATE TABLE acikkuran_surahs (
  id integer PRIMARY KEY, name text NOT NULL, slug text NOT NULL, verse_count integer NOT NULL, page_number integer NOT NULL,
  name_original text, name_en text, name_translation_tr text, name_translation_en text,
  audio integer, audio_en integer, duration integer, duration_en integer
);
CREATE TABLE acikkuran_verses (
  id integer PRIMARY KEY, surah_id integer NOT NULL REFERENCES acikkuran_surahs(id), verse_number integer NOT NULL,
  verse text NOT NULL, verse_simplified text, verse_without_vowel text, page integer NOT NULL, juz_number integer NOT NULL,
  transcription text, transcription_en text, UNIQUE (surah_id, verse_number)
);
CREATE TABLE acikkuran_translations (
  id serial PRIMARY KEY, verse_id integer NOT NULL REFERENCES acikkuran_verses(id), author_id integer NOT NULL REFERENCES acikkuran_authors(id),
  surah_id integer NOT NULL, verse_number integer NOT NULL, text text NOT NULL, UNIQUE (verse_id, author_id)
);
CREATE TABLE acikkuran_footnotes (
  id serial PRIMARY KEY, verse_id integer NOT NULL REFERENCES acikkuran_verses(id), author_id integer NOT NULL REFERENCES acikkuran_authors(id),
  number integer NOT NULL, text text NOT NULL
);
CREATE TABLE acikkuran_rootchars (id integer PRIMARY KEY, arabic text NOT NULL, latin text NOT NULL);
CREATE TABLE acikkuran_roots (
  id integer PRIMARY KEY, latin text NOT NULL UNIQUE, arabic text NOT NULL, transcription text, transcription_en text,
  mean text, mean_en text, rootchar_id integer REFERENCES acikkuran_rootchars(id), count integer NOT NULL DEFAULT 0
);
CREATE TABLE acikkuran_rootdiffs (id serial PRIMARY KEY, root_id integer NOT NULL REFERENCES acikkuran_roots(id), diff text NOT NULL, count integer NOT NULL);
-- /words ucu: kelime + kök
CREATE TABLE acikkuran_rootwords (
  id serial PRIMARY KEY, surah_id integer NOT NULL, verse_number integer NOT NULL, sort_number integer NOT NULL,
  arabic text NOT NULL, transcription text, turkish text, root_id integer REFERENCES acikkuran_roots(id)
);
-- /verseparts ve kök konkordansı
CREATE TABLE acikkuran_verseparts (
  id serial PRIMARY KEY, surah_id integer NOT NULL, verse_number integer NOT NULL, verse_id integer NOT NULL REFERENCES acikkuran_verses(id),
  sort_number integer NOT NULL, arabic text NOT NULL, transcription_tr text, transcription_en text, translation_tr text, translation_en text,
  root_id integer REFERENCES acikkuran_roots(id), rootdiff_id integer REFERENCES acikkuran_rootdiffs(id), details jsonb
);
-- eski /root/latin/:l/verses ucu
CREATE TABLE acikkuran_rootverses (
  id serial PRIMARY KEY, root_id integer NOT NULL REFERENCES acikkuran_roots(id), rootdiff_id integer, sort_number integer NOT NULL,
  surah_id integer NOT NULL, verse_number integer NOT NULL, verse_id integer NOT NULL, arabic text NOT NULL, transcription text, turkish text,
  detail_1 text, detail_2 text, detail_3 text, detail_4 text, detail_5 text, detail_6 text, detail_7 text, detail_8 text
);
CREATE INDEX ON acikkuran_translations (surah_id, verse_number);
CREATE INDEX ON acikkuran_translations (author_id);
CREATE INDEX ON acikkuran_footnotes (verse_id, author_id);
CREATE INDEX ON acikkuran_verses (page);
CREATE INDEX ON acikkuran_rootwords (surah_id, verse_number);
CREATE INDEX ON acikkuran_verseparts (surah_id, verse_number);
CREATE INDEX ON acikkuran_verseparts (root_id, verse_id);
CREATE INDEX ON acikkuran_verseparts (verse_id, root_id);
CREATE INDEX ON acikkuran_rootverses (root_id, verse_id);
CREATE INDEX ON acikkuran_roots (rootchar_id);
