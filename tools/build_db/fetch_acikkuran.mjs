#!/usr/bin/env node
// acikkuran.com'un kendi sunduğu makine-okunur veriyi ayet ayet indirir (llms.txt: her ayet sayfasının
// .md/JSON ikizi vardır; robots.txt: Allow /, Content-Signal ai-input=yes, ai-train=no; lisans CC BY-NC-SA).
// Next.js veri rotası HTML'in ~1/15'i boyutunda ve yapılandırılmış: tüm mealler + dipnotlar + kelimeler (TR/EN, kök).
// Nazik tarama: tek sıra, varsayılan 2 istek/sn, tanımlayıcı UA, yeniden başlatılabilir (var olan dosya atlanır).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT || join(HERE, "sources", "acikkuran");
const RPS = Number(process.env.RPS || 2);
const UA = "rak-local-quran-study/0.1 (personal research; sequential; " + Math.round(1000 / RPS) + "ms interval)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quranInfo = JSON.parse(readFileSync(join(HERE, "..", "..", "data", "quranInfo.json"), "utf8"));

async function buildId() {
  const r = await fetch("https://acikkuran.com/1/1", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
  const m = /"buildId":"([^"]+)"/.exec(await r.text());
  if (!m) throw new Error("buildId bulunamadı");
  return m[1];
}
let bid = await buildId(); console.log("buildId:", bid);
let done = 0, skipped = 0, failed = [];
const t0 = Date.now();
for (const s of quranInfo) {
  mkdirSync(join(OUT, String(s.id)), { recursive: true });
  for (let v = 1; v <= s.verse_count; v++) {
    const out = join(OUT, String(s.id), `${v}.json`);
    if (existsSync(out)) { skipped++; continue; }
    let ok = false;
    for (let attempt = 0; attempt < 4 && !ok; attempt++) {
      const t = Date.now();
      try {
        const u = `https://acikkuran.com/_next/data/${bid}/${s.id}/${v}.json?surah_id=${s.id}&verse_number=${v}`;
        const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
        if (r.status === 404) { bid = await buildId(); throw new Error("404 → buildId yenilendi " + bid); }
        if (r.status === 429 || r.status >= 500) { await sleep(5000 * (attempt + 1)); throw new Error("HTTP " + r.status); }
        const j = await r.json();
        const pp = j.pageProps;
        if (!pp?.translations?.length || !pp.verse) throw new Error("beklenmeyen gövde");
        writeFileSync(out, JSON.stringify(pp));
        ok = true; done++;
      } catch (e) {
        if (attempt === 3) failed.push(`${s.id}:${v} ${e.message}`);
      }
      const wait = 1000 / RPS - (Date.now() - t);
      if (wait > 0) await sleep(wait);
    }
  }
  const el = Math.round((Date.now() - t0) / 1000);
  process.stdout.write(`${s.id}✓ `);
  if (s.id % 10 === 0) console.log(`| indirilen ${done} · atlanan ${skipped} · hata ${failed.length} · ${el} sn`);
}
console.log(`\nbitti: indirilen ${done}, atlanan ${skipped}, hata ${failed.length}, ${Math.round((Date.now() - t0) / 60000)} dk`);
if (failed.length) { writeFileSync(join(OUT, "_failed.txt"), failed.join("\n")); console.log(failed.slice(0, 10).join("\n")); }
