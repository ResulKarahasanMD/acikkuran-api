#!/usr/bin/env node
// Postgres'teki mealleri Meilisearch 'translations' indeksine yazar (routes/searches.js'in beklediği belge şekli).
// searches.js: filter author.id/language, sort verse_id/author.id, attributesToSearchOn text/verse.transcription/verse.verse,
// random-search: filter surah.id / verse.verse_number.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("../../node_modules/pg");
const { MeiliSearch } = require("../../node_modules/meilisearch");
const DB_URL = process.env.DB_URL || "postgres://localhost:5432/acikkuran";
const client = new MeiliSearch({ host: process.env.MEILI_HOST || "http://localhost:7700", apiKey: process.env.MEILI_API_KEY || "" });
const db = new Client({ connectionString: DB_URL }); await db.connect();
const { rows } = await db.query(`
  SELECT t.id, t.text, a.language, v.id AS verse_id, jsonb_build_object('id', a.id, 'name', a.name, 'language', a.language) AS author,
         jsonb_build_object('id', s.id, 'name', s.name, 'name_en', s.name_en, 'slug', s.slug) AS surah,
         jsonb_build_object('id', v.id, 'verse_number', v.verse_number, 'verse', v.verse, 'transcription', coalesce(v.transcription, '')) AS verse
  FROM acikkuran_translations t JOIN acikkuran_authors a ON a.id = t.author_id
  JOIN acikkuran_verses v ON v.id = t.verse_id JOIN acikkuran_surahs s ON s.id = v.surah_id`);
await db.end();
console.log("belge:", rows.length);
try { await (await client.deleteIndex("translations")).waitTask?.(); } catch {}
const idx = client.index("translations");
await client.createIndex("translations", { primaryKey: "id" });
await idx.updateSettings({ filterableAttributes: ["author.id", "language", "surah.id", "verse.verse_number"], sortableAttributes: ["verse_id", "author.id"], searchableAttributes: ["text", "verse.transcription", "verse.verse"], displayedAttributes: ["*"] });
let last;
for (let i = 0; i < rows.length; i += 5000) last = await idx.addDocuments(rows.slice(i, i + 5000));
const wait = async (t) => { for (;;) { const s = await client.tasks.getTask(t.taskUid ?? t.uid); if (["succeeded", "failed", "canceled"].includes(s.status)) return s; await new Promise((r) => setTimeout(r, 500)); } };
const s = await wait(last); console.log("son görev:", s.status, s.error?.message ?? "");
const st = await idx.getStats(); console.log("indeksteki belge:", st.numberOfDocuments, "indeksleniyor:", st.isIndexing);
