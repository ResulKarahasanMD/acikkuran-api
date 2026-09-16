# build_db — yerel Açık Kuran veritabanı

Resmi test veritabanı (`test-db.acikkuran.com:27743`, `.env.example` içindeki) **artık yok**: 2026-09-17'de
üç dış DNS çözümleyicide de NXDOMAIN. Canlı API (`oud.acikkuran.com`) özel, 403 döner. Bu dizin, `routes/*.js`
içindeki SQL'in beklediği şemayı açık kaynaklardan kurar, sonra acikkuran.com'un her ayet sayfası için sunduğu
makine-okunur JSON'u (mealler, dipnotlar, kelime mealleri, kökler) üzerine yazar ve Meilisearch indeksini kurar.

## Adımlar (tools/build_db içinde, sırayla)

```bash
node build.mjs fetch                      # Tanzil, quran.com v4, Quranic Arabic Corpus → sources/
node build.mjs load                       # schema.sql + metin/okunuş/sayfa/kök/kelime tabloları (iskelet)
python3 make_author_map.py sources/live_2_255.html sources/fe_authors.js   # 51 yazar → sources/author_map.csv
psql "$DB_URL" -f load_mealler.sql        # sources/mealler.csv → acikkuran_translations (51 yazar × 6236, upsert)
psql "$DB_URL" -f fix_translation_order.sql   # ORDER BY'sız /translations ucu için fiziksel sıra: tr önce, yazar id
python3 apply_live_pages.py               # sources/live_pages.json → gerçek sayfa düzeni (0..604)
node fetch_acikkuran.mjs                  # acikkuran.com ayet JSON'ları → sources/acikkuran/ (2 istek/sn, sürdürülebilir)
node load_acikkuran.mjs                   # acikkuran verisini tabloların ÜZERİNE yazar (dipnot, kelime meali, kök id)
node index_meili.mjs                      # acikkuran_translations → Meilisearch 'translations' indeksi (318.000 belge)
./add_translation.sh 200 tr.golpinarli "Abdülbaki Gölpınarlı" "Kur'an-ı Kerim ve Meali" tr   # isteğe bağlı: Tanzil meali ekle (upsert + Meili)
```

`DB_URL` varsayılanı `postgres://localhost:5432/acikkuran`; ana `.env` de buraya bakar. Yerel Postgres SSL sunmadığı
için `.env`'de `DB_SSL=false` gerekir (`app.js`). Meilisearch: Homebrew servisi, `MEILI_HOST=http://localhost:7700`,
ana anahtar yoksa `MEILI_API_KEY` boş kalır. `load_acikkuran.mjs` çalıştıktan sonra `load_mealler.sql` ve
`apply_live_pages.py` yalnız acikkuran verisi elde edilemediğinde gereken ara adımlardır; sonuç tablolarını
acikkuran verisi belirler.

## Kaynaklar

| Dosya | Kaynak | Not |
|---|---|---|
| `sources/tanzil_*.txt`, `tr.*.txt`, `en.*.txt`, `quran-data.xml` | tanzil.net | ticari olmayan kullanım + atıf |
| `sources/qc_*.json`, `sources/qc_words/` | api.quran.com v4 | sure künyesi, sayfa/cüz, kelime-kelime İngilizce |
| `sources/quran-morphology.txt` | mustafa0x/quran-morphology (Quranic Arabic Corpus 0.4) | GPL |
| `sources/mealler.csv` (57.8 MB, sha256 `26607d42…33baa`) | github.com/mermer98/acikkuran-quran-app | acikkuran.com verisi, CC BY-NC-SA 4.0; çevirmen atfı `hoca` sütununda |
| `sources/author_map.csv` | acikkuran.com `/2/255` `__NEXT_DATA__` ∪ acikkuran-frontend `data/authors.js` | 51 yazar; 115 ve 117 yalnız canlı sayfada |
| `sources/live_pages.json` | acikkuran.com `/page/0..604` `uniqueSurahs` | her sayfanın ilk ayeti |
| `sources/acikkuran/<sure>/<ayet>.json` (6236 dosya) | acikkuran.com Next.js veri rotası | robots.txt Allow /, ai-input=yes, ai-train=no; CC BY-NC-SA 4.0 |
| kök harf tablosu (`schema` içi) | acikkuran-frontend `data/rootchars.js` | 28 harf, kimlik ve sıra birebir |

## Durum (2026-09-17, `load_acikkuran.mjs` + `index_meili.mjs` sonrası)

| Tablo | Satır |
|---|---|
| acikkuran_authors | 51 |
| acikkuran_verses | 6236 |
| acikkuran_translations | 318.000 (acikkuran kaynaklı 311.764; Süleymaniye Vakfı 63:6–67:16 arası 34 ayet ve The Monotheist Group 9:128–129 kaynakta yok) |
| acikkuran_footnotes | 33.373 |
| acikkuran_roots / rootdiffs | 1641 / 4612 (5 kökün diff'i yok) |
| acikkuran_rootwords / verseparts | 77.429 / 77.429 |
| acikkuran_rootverses | 47.253 |
| Meilisearch `translations` | 318.000 belge |

- Kök kimlikleri gerçekle aynı (`qwm`=13). Kök Latin kodlaması: hemze→`A`, ذ→`p` (`Axp`, `Apn`, `$yA`).
- Sayfa numarası 0 tabanlı (Fatiha=0, 2:1=1, 2:255=41, 109:1=603, 112:1=604); quran.com−1 kuralından 240 ayet sapar.
- Test: 291 testin tamamı geçer. `acikkuran_rootwords.id` gerçek DB gibi mushaf sırasında 1'den başlar (`/words` ucu);
  canlı sitenin kelime kimlikleri `acikkuran_verseparts.id`'de korunur.
- `/surah/1/verse/1/translations` sırası: uçta ORDER BY yok; `fix_translation_order.sql` fiziksel sırayı kurar, test geçer.

## Meal ekleme

`add_translation.sh <author_id> <tanzil_id|dosya> "<Ad>" "<Eser>" <tr|en> [--no-meili]` Tanzil biçimli (`sure|ayet|metin`)
bir meali indirir, 6236 satır doğrular, yazarı ve meali upsert eder, Meilisearch indeksini yeniler. Kendi eklemeleriniz için
`author_id` 200 ve üstünü kullanın; 1–117 acikkuran'ın 51 yazarına ayrılmıştır. 2026-09-17: 200 = Abdülbaki Gölpınarlı (tr.golpinarli) eklendi,
`/authors` 52 kayıt, 291 test geçer.

## Bilinen sınırlar

- `sources/` git dışındadır (67 MB açık kaynak + 58 MB CSV + 6236 JSON); yeniden kurmak için adımları baştan çalıştırın.
- Veri CC BY-NC-SA 4.0 (acikkuran.com) ve Tanzil koşullarına tabidir: yalnız ticari olmayan kullanım, çevirmen atfı korunur.
