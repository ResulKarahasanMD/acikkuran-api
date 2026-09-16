import http from "node:http";

const BASE_URL =
  process.env.ACIKKURAN_URL || "http://localhost:3112";
const AUTHOR_ID = process.env.AUTHOR || "105";

function request(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${path}`, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on("error", reject);
  });
}

async function main() {
  const pass = { count: 0 };
  const fail = { count: 0 };

  const c = (desc, fn, expect200 = true) => fn
    .then((r) => {
      if (expect200 ? r.status === 200 : r.status === 404) {
        pass.count++;
        console.log(`  PASS: ${desc} (HTTP ${r.status})`);
      } else { fail.count++; console.log(`  FAIL: ${desc} (HTTP ${r.status})`); }
      return r;
    })
    .catch((e) => { fail.count++; console.log(`  FAIL: ${desc} (${e.message})`); });

  console.log(`\nAçık Kuran API - Node.js Examples (${BASE_URL})\n`);

  const apiInfo = await c("API Info", request("/"));
  console.log(`  -> ${apiInfo.body.name} (${apiInfo.body.website})`);

  const authors = await c("List Authors", request("/authors"));
  console.log(`  -> ${authors.body.data?.length} authors`);

  const surahs = await c("List Surahs", request("/surahs"));
  console.log(`  -> ${surahs.body.data?.length} surahs`);

  const fatiha = await c("Surah Al-Fatiha", request("/surah/1"));
  const first = fatiha.body?.data?.verses?.[0];
  if (first) {
    console.log(`  -> ${fatiha.body.data.name_en}: ${first.verse_number} verses`);
    console.log(`  -> First verse: ${first.transcription}`);
    console.log(`  -> Translation: ${first.translation?.text?.substring(0, 80)}...`);
  }

  const verse = await c("Verse 112:1 (Al-Ikhlas)", request("/surah/112/verse/1"));
  if (verse.body?.data) {
    console.log(`  -> Arabic: ${verse.body.data.verse}`);
    console.log(`  -> Transcription: ${verse.body.data.transcription}`);
    console.log(`  -> Translation: ${verse.body.data.translation?.text}`);
  }

  const trans = await c("Verse Translations (1:1)", request("/surah/1/verse/1/translations"));
  console.log(`  -> ${trans.body.data?.length} translations available`);

  const parts = await c("Verse Parts (1:1)", request("/surah/1/verse/1/verseparts"));
  if (parts.body?.data) {
    parts.body.data.forEach((p) =>
      console.log(`    ${p.translation_tr} (${p.arabic}) [root: ${p.root?.latin || "none"}]`)
    );
  }

  const words = await c("Verse Words (1:1)", request("/surah/1/verse/1/words"));
  console.log(`  -> ${words.body.data?.length} words`);

  const root = await c("Root 'Hmd'", request("/root/latin/Hmd"));
  if (root.body?.data) {
    console.log(`  -> Arabic: ${root.body.data.arabic}`);
    console.log(`  -> Meaning: ${root.body.data.mean_en?.substring(0, 80)}...`);
    console.log(`  -> Diffs: ${root.body.data.diffs?.map((d) => `${d.diff}(${d.count})`).join(", ")}`);
  }

  const rootParts = await c("Root 'Hmd' Verse Parts", request("/root/latin/Hmd/verseparts?page=1&author=105"));
  const firstRootPart = rootParts.body?.data?.[0];
  if (firstRootPart) {
    console.log(`  -> First match: ${firstRootPart.arabic} in ${firstRootPart.surah.name}`);
    console.log(`  -> Verse: ${firstRootPart.verse.transcription_tr || firstRootPart.verse.transcription}`);
  }

  await c("RootChars", request("/rootchars"));
  await c("Roots by letter س", request("/rootchar/1"));
  await c("Page 1", request("/page/1"));
  await c("Page 604", request("/page/604"));

  await c("Non-existent surah (expects 404)", request("/surah/115"), false);
  await c("Non-existent root (expects 404)", request("/root/99999"), false);

  console.log(`\nResults: ${pass.count} passed / ${fail.count} failed\n`);
}

main().catch(console.error);
