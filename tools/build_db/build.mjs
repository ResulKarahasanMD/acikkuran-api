#!/usr/bin/env node
// Açık Kuran şemasını açık kaynaklardan yeniden inşa eder ve yerel Postgres'e yükler.
//   node build.mjs fetch   → kaynakları SRC dizinine indirir (mevcut dosyaları atlar)
//   node build.mjs load    → şemayı kurar, tabloları doldurur, sayımları basar
// Kaynaklar: Tanzil (metin, okunuş, mealler; ticari olmayan kullanım + atıf), quran.com v4 (sure künyesi,
// kelime-kelime İngilizce, sayfa/cüz), Quranic Arabic Corpus 0.4 (mustafa0x/quran-morphology çatalı, GPL).
// Açık Kuran'a özgü veriler (Erhan Aktaş meali, dipnotlar, Türkçe kelime mealleri, kök anlamları, ayet parçaları)
// bu kaynaklarda YOKTUR; ilgili kolonlar NULL kalır, sayım tablosunda açıkça raporlanır.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("../../node_modules/pg");

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SRC || join(HERE, "sources");
const DB_URL = process.env.DB_URL || "postgres://localhost:5432/acikkuran";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- kaynak tanımları ---------------- */
// acikkuran yazar kimlikleri: acikkuran-frontend/data/authors.js (49 kayıt). Kaynağı olanlar eşlendi;
// listede olmayan Tanzil/quran.com mealleri 200+ ile eklendi.
const AUTHORS = [
  // id, name, description, language, source
  [11, "Diyanet İşleri", "Kur'an-ı Kerim Türkçe Meali", "tr", "tanzil:tr.diyanet"],
  [6, "Ali Bulaç", "Kur'an-ı Kerim ve Türkçe Anlamı", "tr", "tanzil:tr.bulac"],
  [27, "Süleyman Ateş", "Kur'an-ı Kerim ve Yüce Meali", "tr", "tanzil:tr.ates"],
  [30, "Yaşar Nuri Öztürk", "Kur'an-ı Kerim Meali", "tr", "tanzil:tr.ozturk"],
  [14, "Elmalılı Hamdi Yazır", "Kur'an-ı Kerim ve Yüce Meali", "tr", "tanzil:tr.yazir"],
  [26, "Suat Yıldırım", "Kuran-ı Kerim ve Meali", "tr", "tanzil:tr.yildirim"],
  [13, "Edip Yüksel (Eski Baskı)", "Mesaj: Kuran Çevirisi", "tr", "tanzil:tr.yuksel"],
  [200, "Abdülbaki Gölpınarlı", "Kur'an-ı Kerim ve Meali", "tr", "tanzil:tr.golpinarli"],
  [201, "Diyanet Vakfı", "Kur'an-ı Kerim ve Açıklamalı Meali", "tr", "tanzil:tr.vakfi"],
  [210, "Şaban Britch", "Kur'an-ı Kerim Meali (Rowad)", "tr", "qc:112"],
  [211, "Muslim Şahin", "Kur'an-ı Kerim Meali", "tr", "qc:124"],
  [32, "Sahih International", "(Umm Muhammad, Mary Kennedy, Amatullah Bantley)", "en", "tanzil:en.sahih"],
  [109, "Marmaduke Pickthall", null, "en", "tanzil:en.pickthall"],
  [2, "Abdullah Yusuf Ali", null, "en", "tanzil:en.yusufali"],
  [16, "Arthur John Arberry", null, "en", "tanzil:en.arberry"],
  [1, "Al-Hilali & Khan", null, "en", "tanzil:en.hilali"],
  [110, "Abul A'la Maududi", "Tafhim commentary", "en", "tanzil:en.maududi"],
  [10, "Ali Quli Qarai", null, "en", "tanzil:en.qarai"],
  [113, "Abdul Haleem", null, "en", "qc:85"],
  [111, "Taqi Usmani", null, "en", "qc:84"],
  [202, "M. H. Shakir", null, "en", "tanzil:en.shakir"],
  [203, "Talal Itani", "Clear Quran (Itani)", "en", "tanzil:en.itani"],
  [204, "Ahmed Ali", null, "en", "tanzil:en.ahmedali"],
  [205, "Abdul Majid Daryabadi", null, "en", "tanzil:en.daryabadi"],
  [206, "Wahiduddin Khan", null, "en", "tanzil:en.wahiduddin"],
  [207, "Safi-ur-Rahman al-Mubarakpuri", null, "en", "tanzil:en.mubarakpuri"],
  [208, "Muhammad Sarwar", null, "en", "tanzil:en.sarwar"],
  [209, "Hasan al-Fatih Qaribullah", null, "en", "tanzil:en.qaribullah"],
  [212, "Ahmed Raza Khan", null, "en", "tanzil:en.ahmedraza"],
];
// Kaynağı bulunamayan acikkuran yazarları — kimlikler ayrılsın diye kaydedilir, meali YOK.
const AUTHORS_NO_SOURCE = [
  [105, "Erhan Aktaş", "Kerim Kur'an", "tr"], [50, "Erhan Aktaş (Eski Baskı)", "Kerim Kur'an", "tr"],
  [103, "Edip-Layth", "Quran: A Reformist Translation", "en"], [34, "Sam Gerrans", null, "en"], [112, "Mustafa Khattab", "The Clear Quran", "en"],
  [104, "Edip Yüksel", "Mesaj: Kuran Çevirisi", "tr"], [3, "Ahmed Hulusi", "Türkçe Kur'an Çözümü", "tr"],
  [8, "Bayraktar Bayraklı", "Yeni Bir Anlayışın Işığında Kur'an Meali", "tr"], [15, "Elmalılı (sadeleştirilmiş)", null, "tr"],
  [18, "Gültekin Onan", null, "tr"], [19, "Hasan Basri Çantay", "Kur'an-ı Hakim ve Meal-i Kerim", "tr"], [21, "İbni Kesir", null, "tr"],
  [22, "Muhammed Esed", "Kur'an Mesajı", "tr"], [25, "Şaban Piriş", "Kur'an-ı Kerim Türkçe Anlamı", "tr"], [38, "Mustafa İslamoğlu", "Hayat Kitabı Kur’an", "tr"],
  [51, "Ali Rıza Safa", "Kur'an-ı Kerim Gerçek", "tr"], [52, "Süleymaniye Vakfı", "Süleymaniye Vakfı Meali", "tr"], [107, "Mehmet Okuyan", "Kur’an Meal-Tefsir", "tr"],
  [101, "Rashad Khalifa", "The Final Testament", "en"], [102, "The Monotheist Group", "The Quran: A Monotheist Translation", "en"],
];
const TANZIL_TEXTS = { uthmani: "tanzil_uthmani.txt", simple: "tanzil_simple.txt", "simple-clean": "tanzil_simple-clean.txt" };
const TANZIL_TRANS = ["tr.transliteration", "en.transliteration", ...AUTHORS.filter((a) => a[4].startsWith("tanzil:")).map((a) => a[4].slice(7))];
const QC_TRANS = AUTHORS.filter((a) => a[4].startsWith("qc:")).map((a) => Number(a[4].slice(3)));

/* ---------------- fetch ---------------- */
async function download(url, out, { minBytes = 1000 } = {}) {
  const p = join(SRC, out);
  if (existsSync(p)) return false;
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < minBytes) throw new Error(`${url} → ${buf.length} bayt (çok küçük)`);
  writeFileSync(p, buf);
  return true;
}
async function fetchAll() {
  mkdirSync(join(SRC, "qc_words"), { recursive: true });
  for (const [t, f] of Object.entries(TANZIL_TEXTS))
    console.log(f, await download(`https://tanzil.net/pub/download/index.php?quranType=${t}&outType=txt-2&agree=true`, f) ? "indirildi" : "var");
  for (const id of TANZIL_TRANS) console.log(id, await download(`https://tanzil.net/trans/${id}`, `${id}.txt`) ? "indirildi" : "var");
  for (const id of QC_TRANS) console.log(`qc_trans_${id}`, await download(`https://api.quran.com/api/v4/quran/translations/${id}`, `qc_trans_${id}.json`) ? "indirildi" : "var");
  for (const l of ["tr", "en"]) console.log(`qc_chapters_${l}`, await download(`https://api.quran.com/api/v4/chapters?language=${l}`, `qc_chapters_${l}.json`) ? "indirildi" : "var");
  console.log("quran-data.xml", await download("https://tanzil.net/res/text/metadata/quran-data.xml", "quran-data.xml") ? "indirildi" : "var");
  console.log("quran-morphology.txt", await download("https://raw.githubusercontent.com/mustafa0x/quran-morphology/master/quran-morphology.txt", "quran-morphology.txt") ? "indirildi" : "var");
  for (let c = 1; c <= 114; c++) {
    const out = join(SRC, "qc_words", `${c}.json`);
    if (existsSync(out)) continue;
    const verses = [];
    for (let p = 1; ; p++) {
      const u = `https://api.quran.com/api/v4/verses/by_chapter/${c}?words=true&per_page=50&page=${p}&word_fields=text_uthmani,text_imlaei_simple&fields=text_uthmani,page_number,juz_number`;
      let j, tries = 0;
      for (;;) {
        try { const r = await fetch(u, { signal: AbortSignal.timeout(30000) }); if (r.status === 429 || r.status >= 500) throw new Error("HTTP " + r.status); j = await r.json(); break; }
        catch (e) { if (++tries > 5) throw e; await sleep(2000 * tries); }
      }
      verses.push(...j.verses);
      if (!j.pagination.next_page) break;
      await sleep(250);
    }
    writeFileSync(out, JSON.stringify(verses));
    process.stdout.write(`kelime ${c}:${verses.length} `);
    await sleep(250);
  }
  console.log("\nfetch tamam");
}

/* ---------------- yardımcılar ---------------- */
const readTanzil = (f) => {
  const m = new Map(); // "s:v" -> text
  for (const line of readFileSync(join(SRC, f), "utf8").split("\n")) {
    const x = /^(\d+)\|(\d+)\|(.*)$/.exec(line);
    if (x) m.set(`${x[1]}:${x[2]}`, x[3].trim());
  }
  return m;
};
const stripHtml = (s) => s.replace(/<sup[^>]*>.*?<\/sup>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

// Buckwalter — Quranic Arabic Corpus kök yazımı (Açık Kuran latin kodları bununla uyuşur: Hmd, Elm, Sbr, $kr).
// Kök başındaki hemzeli elifler korpusta 'A' yazılır (Aty, Amn, Akl); diğer konumlarda standart BW.
const BW = { "ء": "A", /* acikkuran: hemze→A ($yA), ذ→p (Axp) — frontend data/rootchars.js */ "آ": "|", "أ": ">", "ؤ": "&", "إ": "<", "ئ": "}", "ا": "A", "ب": "b", "ة": "p", "ت": "t", "ث": "v", "ج": "j", "ح": "H", "خ": "x", "د": "d", "ذ": "p", "ر": "r", "ز": "z", "س": "s", "ش": "$", "ص": "S", "ض": "D", "ط": "T", "ظ": "Z", "ع": "E", "غ": "g", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h", "و": "w", "ي": "y", "ى": "Y" };
const toLatin = (ar) => [...ar].map((ch, i) => ("أإآء".includes(ch) ? "A" : BW[ch] ?? "?")).join("");
const LETTER = { // arabic → [latin(BW), ad-tr, ad-en]
  "ا": ["A", "Elif", "Alif"], "أ": ["A", "Elif", "Alif"], "إ": ["A", "Elif", "Alif"], "آ": ["A", "Elif", "Alif"], "ء": ["'", "Hemze", "Hamza"],
  "ب": ["b", "Ba", "Ba"], "ت": ["t", "Ta", "Ta"], "ث": ["v", "Se", "Tha"], "ج": ["j", "Cim", "Jim"], "ح": ["H", "Ha", "Ha"], "خ": ["x", "Hı", "Kha"],
  "د": ["d", "Dal", "Dal"], "ذ": ["*", "Zel", "Dhal"], "ر": ["r", "Ra", "Ra"], "ز": ["z", "Ze", "Zay"], "س": ["s", "Sin", "Sin"], "ش": ["$", "Şın", "Shin"],
  "ص": ["S", "Sad", "Sad"], "ض": ["D", "Dad", "Dad"], "ط": ["T", "Tı", "Ta"], "ظ": ["Z", "Zı", "Zha"], "ع": ["E", "Ayn", "Ayn"], "غ": ["g", "Gayn", "Ghayn"],
  "ف": ["f", "Fe", "Fa"], "ق": ["q", "Kaf", "Qaf"], "ك": ["k", "Kef", "Kaf"], "ل": ["l", "Lam", "Lam"], "م": ["m", "Mim", "Mim"], "ن": ["n", "Nun", "Nun"],
  "ه": ["h", "He", "Ha"], "و": ["w", "Vav", "Waw"], "ي": ["y", "Ye", "Ya"], "ى": ["Y", "Ye", "Ya"], "ؤ": ["&", "Vav", "Waw"], "ئ": ["}", "Ye", "Ya"],
};
const spell = (ar, k) => [...ar].map((c) => LETTER[c]?.[k] ?? "?").join("-");
// Türkçe sure adı → slug (acikkuran: "isra", "kafirun", "ali-imran")
const slugify = (s) => s.toLowerCase().replace(/İ/g, "i").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c").replace(/â/g, "a").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function insertRows(db, table, cols, rows, batch = 1000) {
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const params = [], tuples = [];
    for (const r of chunk) tuples.push("(" + r.map((v) => { params.push(v); return "$" + params.length; }).join(",") + ")");
    await db.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${tuples.join(",")}`, params);
  }
  return rows.length;
}

/* ---------------- load ---------------- */
async function load() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  await db.query(readFileSync(join(HERE, "schema.sql"), "utf8"));
  const report = [];
  const rep = (k, v) => { report.push([k, v]); console.log(`${k}: ${v}`); };

  // yazarlar
  const authorRows = [...AUTHORS.map(([id, name, desc, lang]) => [id, name, desc, lang, null]), ...AUTHORS_NO_SOURCE.map(([id, name, desc, lang]) => [id, name, desc, lang, null])];
  rep("authors", await insertRows(db, "acikkuran_authors", ["id", "name", "description", "language", "url"], authorRows));

  // sureler
  const quranInfo = JSON.parse(readFileSync(join(HERE, "..", "..", "data", "quranInfo.json"), "utf8"));
  const qcEn = JSON.parse(readFileSync(join(SRC, "qc_chapters_en.json"), "utf8")).chapters;
  const qcTr = JSON.parse(readFileSync(join(SRC, "qc_chapters_tr.json"), "utf8")).chapters;
  const surahRows = quranInfo.map((s) => {
    const en = qcEn.find((c) => c.id === s.id), tr = qcTr.find((c) => c.id === s.id);
    return [s.id, s.names[0], slugify(s.names[0]), s.verse_count, en.pages[0] - 1, /* acikkuran sayfa numarası 0 tabanlı: Fatiha=0, Kafirun=603 (README /page örneği) */ s.names[2], s.names[1], tr.translated_name.name, en.translated_name.name, s.id, s.id, null, null];
  });
  rep("surahs", await insertRows(db, "acikkuran_surahs", ["id", "name", "slug", "verse_count", "page_number", "name_original", "name_en", "name_translation_tr", "name_translation_en", "audio", "audio_en", "duration", "duration_en"], surahRows));

  // ayetler — sıra kimliği acikkuran ile aynı (1:1=1 … 114:6=6236)
  const uth = readTanzil(TANZIL_TEXTS.uthmani), simp = readTanzil(TANZIL_TEXTS.simple), clean = readTanzil(TANZIL_TEXTS["simple-clean"]);
  const trTr = readTanzil("tr.transliteration.txt"), trEn = readTanzil("en.transliteration.txt");
  const verseId = new Map(); const verseRows = []; const qcWords = {};
  let id = 0;
  for (const s of quranInfo) {
    qcWords[s.id] = JSON.parse(readFileSync(join(SRC, "qc_words", `${s.id}.json`), "utf8"));
    if (qcWords[s.id].length !== s.verse_count) throw new Error(`sure ${s.id}: quran.com ${qcWords[s.id].length} ayet, beklenen ${s.verse_count}`);
    for (let v = 1; v <= s.verse_count; v++) {
      const key = `${s.id}:${v}`; id++; verseId.set(key, id);
      const qv = qcWords[s.id][v - 1];
      if (!uth.has(key)) throw new Error(`Tanzil'de ${key} yok`);
      verseRows.push([id, s.id, v, uth.get(key), simp.get(key), clean.get(key), qv.page_number - 1, qv.juz_number, trTr.get(key) ?? null, trEn.get(key) ? stripHtml(trEn.get(key)) : null]);
    }
  }
  rep("verses", await insertRows(db, "acikkuran_verses", ["id", "surah_id", "verse_number", "verse", "verse_simplified", "verse_without_vowel", "page", "juz_number", "transcription", "transcription_en"], verseRows));

  // mealler
  let trRows = [];
  for (const [aid, name, , , src] of AUTHORS) {
    let m;
    if (src.startsWith("tanzil:")) m = readTanzil(`${src.slice(7)}.txt`);
    else {
      m = new Map();
      for (const t of JSON.parse(readFileSync(join(SRC, `qc_trans_${src.slice(3)}.json`), "utf8")).translations) {
        // quran.com bu uçta verse_key vermez; sıra 1:1..114:6 ile aynıdır.
        m.set(t.verse_key ?? String(m.size + 1), stripHtml(t.text));
      }
      if (!m.has("2:255")) { // sıra tabanlı anahtarı ayet anahtarına çevir
        const seq = [...verseId.keys()]; const m2 = new Map();
        [...m.values()].forEach((t, i) => m2.set(seq[i], t)); m = m2;
      }
    }
    let n = 0;
    for (const [key, vid] of verseId) { const t = m.get(key); if (t) { trRows.push([vid, aid, ...key.split(":").map(Number), t]); n++; } }
    if (n !== 6236) console.log(`  ! ${name} (${aid}): ${n}/6236 ayet`);
  }
  rep("translations", await insertRows(db, "acikkuran_translations", ["verse_id", "author_id", "surah_id", "verse_number", "text"], trRows));
  rep("footnotes", 0);

  // kökler — morfoloji dosyası
  const morph = new Map(); // "s:v:w" -> {root, lemma, segs:[...]}
  for (const line of readFileSync(join(SRC, "quran-morphology.txt"), "utf8").split("\n")) {
    const [loc, form, , feats] = line.split("\t"); if (!loc) continue;
    const [s, v, w] = loc.split(":"); const key = `${s}:${v}:${w}`;
    const e = morph.get(key) || { segs: [] }; e.segs.push(form);
    for (const f of (feats || "").split("|")) { if (f.startsWith("ROOT:")) e.root = f.slice(5); else if (f.startsWith("LEM:") && e.root && !e.lemma) e.lemma = f.slice(4); }
    if (e.root && !e.lemma) { const l = (feats || "").split("|").find((f) => f.startsWith("LEM:")); if (l) e.lemma = l.slice(4); }
    morph.set(key, e);
  }
  const rootIds = new Map(); const rootCount = new Map(); const lemmaCount = new Map(); // root -> Map(lemma->n)
  for (const e of morph.values()) {
    if (!e.root) continue;
    if (!rootIds.has(e.root)) rootIds.set(e.root, rootIds.size + 1); // ilk geçiş sırası (acikkuran kimlikleriyle aynı DEĞİL)
    rootCount.set(e.root, (rootCount.get(e.root) || 0) + 1);
    const lm = lemmaCount.get(e.root) || new Map(); lm.set(e.lemma || e.root, (lm.get(e.lemma || e.root) || 0) + 1); lemmaCount.set(e.root, lm);
  }
  // harfler: acik-kuran/acikkuran-frontend data/rootchars.js sırası ve kimlikleri (1=س … 28=ث)
  const order = ["س", "ر", "ح", "ع", "م", "ي", "د", "ه", "ص", "ق", "ن", "غ", "ض", "ك", "و", "ا", "ف", "خ", "ب", "ش", "ز", "ل", "ط", "ت", "ذ", "ظ", "ج", "ث"];
  const charId = new Map(order.map((l, i) => [l, i + 1]));
  rep("rootchars", await insertRows(db, "acikkuran_rootchars", ["id", "arabic", "latin"], order.map((l) => [charId.get(l), l, LETTER[l][0]])));
  const rootRows = [...rootIds].map(([ar, rid]) => [rid, toLatin(ar), ar, spell(ar, 1), spell(ar, 2), null, null, charId.get("أإآ".includes(ar[0]) ? "ا" : ar[0]), rootCount.get(ar)]);
  const latinDup = rootRows.map((r) => r[1]).filter((x, i, a) => a.indexOf(x) !== i);
  if (latinDup.length) throw new Error("latin kök çakışması: " + latinDup.join(","));
  rep("roots", await insertRows(db, "acikkuran_roots", ["id", "latin", "arabic", "transcription", "transcription_en", "mean", "mean_en", "rootchar_id", "count"], rootRows));
  const diffRows = []; const diffId = new Map(); // "root|lemma" -> id
  for (const [ar, lm] of lemmaCount) for (const [lemma, n] of lm) { diffRows.push([rootIds.get(ar), lemma, n]); diffId.set(`${ar}|${lemma}`, diffRows.length); }
  rep("rootdiffs", await insertRows(db, "acikkuran_rootdiffs", ["id", "root_id", "diff", "count"], diffRows.map((r, i) => [i + 1, ...r])));

  // kelimeler: quran.com (metin, İngilizce okunuş+gloss) × korpus (kök, lemma); hizalama kelime konumuyla
  const wordRows = [], partRows = [], rvRows = []; let misaligned = 0;
  for (const s of quranInfo) for (const qv of qcWords[s.id]) {
    const [sid, vn] = qv.verse_key.split(":").map(Number); const vid = verseId.get(qv.verse_key);
    const words = qv.words.filter((w) => w.char_type_name === "word");
    const corpusN = [...morph.keys()].filter((k) => k.startsWith(`${sid}:${vn}:`)).length;
    if (corpusN !== words.length) misaligned++;
    words.forEach((w, i) => {
      const e = morph.get(`${sid}:${vn}:${i + 1}`) || {};
      const rid = e.root ? rootIds.get(e.root) : null;
      const did = e.root ? diffId.get(`${e.root}|${e.lemma || e.root}`) : null;
      const translit = w.transliteration?.text ?? null, gloss = w.translation?.text ?? null;
      wordRows.push([sid, vn, i + 1, w.text_uthmani, translit, null, rid]);
      partRows.push([sid, vn, vid, i + 1, w.text_uthmani, null, translit, null, gloss, rid, did, null]);
      if (rid) rvRows.push([rid, did, i + 1, sid, vn, vid, w.text_uthmani, translit, null]);
    });
  }
  rep("rootwords", await insertRows(db, "acikkuran_rootwords", ["surah_id", "verse_number", "sort_number", "arabic", "transcription", "turkish", "root_id"], wordRows));
  rep("verseparts", await insertRows(db, "acikkuran_verseparts", ["surah_id", "verse_number", "verse_id", "sort_number", "arabic", "transcription_tr", "transcription_en", "translation_tr", "translation_en", "root_id", "rootdiff_id", "details"], partRows));
  rep("rootverses", await insertRows(db, "acikkuran_rootverses", ["root_id", "rootdiff_id", "sort_number", "surah_id", "verse_number", "verse_id", "arabic", "transcription", "turkish"], rvRows));
  rep("verses with word-count mismatch (quran.com vs corpus)", misaligned);
  rep("words without root", wordRows.filter((r) => r[6] == null).length);
  await db.query("ANALYZE");
  await db.end();
  writeFileSync(join(HERE, "last_build.json"), JSON.stringify({ at: new Date().toISOString(), report: Object.fromEntries(report) }, null, 2));
}

const cmd = process.argv[2];
if (cmd === "fetch") await fetchAll();
else if (cmd === "load") await load();
else { console.log("kullanım: node build.mjs fetch | load"); process.exit(1); }
