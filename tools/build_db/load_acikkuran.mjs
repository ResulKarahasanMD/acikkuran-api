#!/usr/bin/env node
// fetch_acikkuran.mjs'in indirdiği ayet JSON'larını (acikkuran.com'un kendi verisi) Postgres'e işler.
// build.mjs'in açık kaynaklardan kurduğu tabloların ÜZERİNE yazar: acikkuran'da olan her şey esas alınır,
// acikkuran'da olmayan Tanzil/quran.com yazarları (kimlik ≥ 200) korunur.
//   node load_acikkuran.mjs --dry      → yalnız ayrıştır ve say (DB'ye yazmaz)
//   node load_acikkuran.mjs            → tam yükleme (6236 dosya şart)
//   node load_acikkuran.mjs --partial  → eksik dosyalara rağmen yükle (deneme)
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("../../node_modules/pg");
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "sources", "acikkuran");
const DB_URL = process.env.DB_URL || "postgres://localhost:5432/acikkuran";
const DRY = process.argv.includes("--dry"), PARTIAL = process.argv.includes("--partial");
const quranInfo = JSON.parse(readFileSync(join(HERE, "..", "..", "data", "quranInfo.json"), "utf8"));
const KEEP_AUTHOR_MIN = 200; // build.mjs'in acikkuran dışı yazarları

/* ---------- oku ---------- */
const authors = new Map(), roots = new Map();
const verseUpd = [], trRows = [], fnRows = [], wordRows = [], partRows = [], rvRows = [], surahUpd = new Map();
let files = 0, missing = 0, seq = 0;
const detailText = (d, i) => Array.isArray(d?.[i]) && d[i].length ? d[i].map((x) => x.tr).join(", ") : null;
for (const s of quranInfo) {
  for (let v = 1; v <= s.verse_count; v++) {
    seq++;
    const p = join(SRC, String(s.id), `${v}.json`);
    if (!existsSync(p)) { missing++; continue; }
    const pp = JSON.parse(readFileSync(p, "utf8")); files++;
    const V = pp.verse;
    if (V.id !== seq) throw new Error(`${s.id}:${v} ayet kimliği ${V.id}, beklenen ${seq}`);
    verseUpd.push([seq, V.original, V.transcription, V.transcription_en, V.page, V.juz_number]);
    if (!surahUpd.has(s.id)) surahUpd.set(s.id, [s.id, pp.surah.name_en, pp.surah.audio?.duration ?? null, pp.surah.audio?.duration_en ?? null]);
    for (const t of pp.translations) {
      const a = t.author; authors.set(a.id, [a.id, a.name, a.description ?? null, a.language, a.url ?? null]);
      trRows.push([t.id, seq, a.id, s.id, v, t.text]);
      for (const f of t.footnotes || []) fnRows.push([f.id, seq, a.id, f.number, f.text]);
    }
    for (const w of pp.words) {
      const r = w.root;
      if (r) roots.set(r.id, [r.id, r.latin, r.arabic, r.transcription ?? null, r.transcription_en ?? null, r.mean ?? null, r.mean_en ?? null, r.count ?? 0]);
      wordRows.push([w.id, s.id, v, w.sort_number, w.arabic, w.transcription_tr, w.translation_tr, r?.id ?? null]);
      partRows.push([w.id, s.id, v, seq, w.sort_number, w.arabic, w.transcription_tr, w.transcription_en, w.translation_tr, w.translation_en, r?.id ?? null, JSON.stringify(w.details ?? [])]);
      if (r) rvRows.push([w.id, r.id, w.sort_number, s.id, v, seq, w.arabic, w.transcription_tr, w.translation_tr, ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => detailText(w.details, i))]);
    }
  }
}
const dupTr = trRows.length - new Set(trRows.map((r) => r[0])).size;
console.log(`dosya ${files} · eksik ${missing} · yazar ${authors.size} · meal ${trRows.length} (mükerrer kimlik ${dupTr}) · dipnot ${fnRows.length} · kök ${roots.size} · kelime ${wordRows.length} · köklü kelime ${rvRows.length}`);
const byLang = {}; for (const a of authors.values()) byLang[a[3]] = (byLang[a[3]] || 0) + 1; console.log("yazar/dil:", JSON.stringify(byLang));
if (missing && !PARTIAL && !DRY) { console.error(`${missing} ayet eksik; önce fetch_acikkuran.mjs bitsin (ya da --partial)`); process.exit(1); }
if (DRY) process.exit(0);

/* ---------- yaz ---------- */
const db = new Client({ connectionString: DB_URL }); await db.connect();
async function insertRows(table, cols, rows, batch = 1000) {
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch), params = [], tuples = [];
    for (const r of chunk) tuples.push("(" + r.map((x) => { params.push(x); return "$" + params.length; }).join(",") + ")");
    await db.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${tuples.join(",")}`, params);
  }
  return rows.length;
}
const rep = {};
await db.query("BEGIN");
// şema küçük düzeltmeleri: audio_en 3 haneli ("002.mp3"), kimlikler acikkuran'dan gelir
await db.query("ALTER TABLE acikkuran_surahs ALTER COLUMN audio_en TYPE text USING lpad(audio_en::text, 3, '0')");
await db.query("ALTER TABLE acikkuran_verseparts DROP CONSTRAINT IF EXISTS acikkuran_verseparts_rootdiff_id_fkey");

// yazarlar (upsert)
for (const a of authors.values())
  await db.query("INSERT INTO acikkuran_authors (id,name,description,language,url) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, language=EXCLUDED.language, url=EXCLUDED.url", a);
rep.authors = (await db.query("SELECT count(*) FROM acikkuran_authors")).rows[0].count;

// ayetler + sureler
for (const r of verseUpd) await db.query("UPDATE acikkuran_verses SET verse=$2, transcription=$3, transcription_en=$4, page=$5, juz_number=$6 WHERE id=$1", r);
for (const r of surahUpd.values()) await db.query("UPDATE acikkuran_surahs SET name_en=$2, duration=$3, duration_en=$4 WHERE id=$1", r);
rep.verses_updated = verseUpd.length;

// mealler + dipnotlar: acikkuran yazarlarını sil, acikkuran kimlikleriyle yeniden yaz; ≥200 olanlar kalır
const aIds = [...authors.keys()];
await db.query("DELETE FROM acikkuran_footnotes");
await db.query("DELETE FROM acikkuran_translations WHERE author_id = ANY($1)", [aIds]);
// Tanzil kaynaklı satırların seri kimlikleri acikkuran kimlikleriyle çakışmasın
await db.query("UPDATE acikkuran_translations SET id = id + 10000000 WHERE id < 10000000");
rep.translations_acikkuran = await insertRows("acikkuran_translations", ["id", "verse_id", "author_id", "surah_id", "verse_number", "text"], trRows);
rep.footnotes = await insertRows("acikkuran_footnotes", ["id", "verse_id", "author_id", "number", "text"], fnRows);
await db.query("SELECT setval(pg_get_serial_sequence('acikkuran_translations','id'), (SELECT max(id) FROM acikkuran_translations))");
await db.query("SELECT setval(pg_get_serial_sequence('acikkuran_footnotes','id'), (SELECT max(id) FROM acikkuran_footnotes))");

// kökler: acikkuran kimlikleri esas; türevler korpustan Arapça kök eşleşmesiyle taşınır
const oldRoots = (await db.query("SELECT id, arabic FROM acikkuran_roots")).rows;
const oldDiffs = (await db.query("SELECT root_id, diff, count FROM acikkuran_rootdiffs")).rows;
const norm = (a) => a.replace(/[أإآ]/g, "ا").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/ى/g, "ي");
const oldByArabic = new Map(oldRoots.map((r) => [norm(r.arabic), r.id]));
const chars = (await db.query("SELECT id, arabic FROM acikkuran_rootchars")).rows;
const charId = new Map(chars.map((c) => [c.arabic, c.id]));
await db.query("DELETE FROM acikkuran_rootverses"); await db.query("DELETE FROM acikkuran_verseparts"); await db.query("DELETE FROM acikkuran_rootwords");
await db.query("DELETE FROM acikkuran_rootdiffs"); await db.query("DELETE FROM acikkuran_roots");
const rootRows = [...roots.values()].map((r) => [...r, charId.get(r[2][0]) ?? charId.get("ا") ?? null]);
rep.roots = await insertRows("acikkuran_roots", ["id", "latin", "arabic", "transcription", "transcription_en", "mean", "mean_en", "count", "rootchar_id"], rootRows);
const newByArabic = new Map(rootRows.map((r) => [norm(r[2]), r[0]]));
const oldToNew = new Map(); for (const [ar, oid] of oldByArabic) if (newByArabic.has(ar)) oldToNew.set(oid, newByArabic.get(ar));
const diffRows = oldDiffs.filter((d) => oldToNew.has(d.root_id)).map((d) => [oldToNew.get(d.root_id), d.diff, d.count]);
rep.rootdiffs = await insertRows("acikkuran_rootdiffs", ["root_id", "diff", "count"], diffRows);
rep.roots_without_diffs = rootRows.length - new Set(diffRows.map((d) => d[0])).size;
// /words ucunun kimlikleri gerçek DB'de ayrı bir sayaçtır (1:1 ilk kelime = 1, mushaf sırası); canlı sitenin kelime
// kimlikleri (verseparts ile aynı) korunmaz. test/verses.spec.js bunu bekler.
wordRows.sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[3] - b[3]).forEach((r, i) => (r[0] = i + 1));
rep.rootwords = await insertRows("acikkuran_rootwords", ["id", "surah_id", "verse_number", "sort_number", "arabic", "transcription", "turkish", "root_id"], wordRows);
rep.verseparts = await insertRows("acikkuran_verseparts", ["id", "surah_id", "verse_number", "verse_id", "sort_number", "arabic", "transcription_tr", "transcription_en", "translation_tr", "translation_en", "root_id", "details"], partRows);
rep.rootverses = await insertRows("acikkuran_rootverses", ["id", "root_id", "sort_number", "surah_id", "verse_number", "verse_id", "arabic", "transcription", "turkish", "detail_1", "detail_2", "detail_3", "detail_4", "detail_5", "detail_6", "detail_7", "detail_8"], rvRows);
for (const t of ["acikkuran_rootwords", "acikkuran_verseparts", "acikkuran_rootverses"]) await db.query(`SELECT setval(pg_get_serial_sequence('${t}','id'), (SELECT max(id) FROM ${t}))`);
await db.query("COMMIT");
await db.query("ANALYZE");
await db.end();
console.log(JSON.stringify(rep, null, 1));
writeFileSync(join(HERE, "last_build_acikkuran.json"), JSON.stringify({ at: new Date().toISOString(), files, missing, report: rep }, null, 2));
