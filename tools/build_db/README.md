# build_db — yerel Açık Kuran veritabanı

Resmi test veritabanı (`test-db.acikkuran.com:27743`, `.env.example` içindeki) **artık yok**: 2026-09-17'de
üç dış DNS çözümleyicide de NXDOMAIN. Canlı API (`oud.acikkuran.com`) özel, 403 döner. Bu dizin, `routes/*.js`
içindeki SQL'in beklediği şemayı açık kaynaklardan yeniden kurar, meal metnini acikkuran.com'dan derlenmiş bir
CSV ile doldurur ve sayfa/kök kodlaması gibi acikkuran'a özgü sözleşmeleri canlı siteden doğrulanmış verilerle hizalar.

## Adımlar (tools/build_db içinde, sırayla)

```bash
node build.mjs fetch                      # Tanzil, quran.com v4, Quranic Arabic Corpus → sources/
node build.mjs load                       # schema.sql + metin/okunuş/sayfa/kök/kelime tabloları
python3 make_author_map.py sources/live_2_255.html sources/fe_authors.js   # 51 yazar → sources/author_map.csv
psql "$DB_URL" -f load_mealler.sql        # sources/mealler.csv → acikkuran_translations (51 yazar × 6236 ayet, upsert)
psql "$DB_URL" -f fix_translation_order.sql   # ORDER BY'sız /translations ucu için fiziksel sıra: tr önce, yazar id
python3 apply_live_pages.py               # sources/live_pages.json → gerçek sayfa düzeni (0..604)
```

`DB_URL` varsayılanı `postgres://localhost:5432/acikkuran`; ana `.env` de buraya bakar.
`build.mjs load` yalnız Tanzil/quran.com kaynaklı yazarları yükler; acikkuran'da olmayan ek yazar eklemez
(2026-09-17'de 200–212 arası 13 Tanzil yazarı DB'den kaldırıldı, gerçek `/authors` 51 kayıttır).

## Kaynaklar

| Dosya | Kaynak | Not |
|---|---|---|
| `sources/tanzil_*.txt`, `tr.*.txt`, `en.*.txt`, `quran-data.xml` | tanzil.net | ticari olmayan kullanım + atıf |
| `sources/qc_*.json`, `sources/qc_words/` | api.quran.com v4 | sure künyesi, sayfa/cüz, kelime-kelime İngilizce |
| `sources/quran-morphology.txt` | mustafa0x/quran-morphology (Quranic Arabic Corpus 0.4) | GPL |
| `sources/mealler.csv` (57.8 MB, sha256 `26607d42…33baa`) | github.com/mermer98/acikkuran-quran-app | acikkuran.com verisi, CC BY-NC-SA 4.0; çevirmen atfı `hoca` sütununda |
| `sources/author_map.csv` | acikkuran.com `/2/255` `__NEXT_DATA__` ∪ acikkuran-frontend `data/authors.js` | 51 yazar; 115 ve 117 yalnız canlı sayfada |
| `sources/live_pages.json` | acikkuran.com `/page/0..604` `uniqueSurahs` | her sayfanın ilk ayeti |
| kök harf tablosu (`schema` içi) | acikkuran-frontend `data/rootchars.js` | 28 harf, kimlik ve sıra birebir |

## Canlı siteyle doğrulananlar (2026-09-17)

- 2:255 Erhan Aktaş (105) metni CSV ile birebir aynı; Bijan Moeinian 4:1 hem CSV'de hem sitede boş (toplam 5 boş ayet, boş dize).
- Sayfa numarası 0 tabanlı (Fatiha=0, 2:1=1, 2:255=41, 4:1=76, 109:1=603, 112:1=604). quran.com−1 kuralından
  240 ayet (5:89 civarından 114'e kadar 15+ ayrı bölgede) sapar; bu yüzden sayfa tablosu doğrudan siteden çekilir (`apply_live_pages.py`).
- Kök Latin kodlaması: hemze→`A`, ذ→`p` (`Axp`, `Apn`, `$yA`); harf kimlikleri 1=س 2=ر 3=ح 4=ع … 28=ث.
- `/surah/1/verse/1/translations` ilk kaydı gerçekte yazar 3 (Ahmed Hulusi); `fix_translation_order.sql` fiziksel sırayı buna göre kurar
  ama uçtaki GROUP BY sırayı yine değiştirebiliyor — test hâlâ başarısız (kod değişikliği gerekir, yapılmadı).

## Bilinen eksikler (gerçek DB'de olup burada olmayanlar)

- **Kök kimlikleri farklı.** Gerçekte `qwm`=13, `Hyy`=119, `wsn`=532; yerelde 14, 121, 536 (Allah lafzına kök atanmaması
  ve korpus farkları). Latin kodla erişim (`/root/latin/qwm`) doğru, `/root/<id>` kimlikleri gerçekle uyuşmaz.
- `acikkuran_footnotes` boş — Erhan Aktaş metnindeki `[1]` işaretleri duruyor, dipnot metinleri yok.
- `acikkuran_rootwords.turkish`, `acikkuran_roots.mean/mean_en`, `verseparts.translation_tr` NULL (Türkçe kelime mealleri ve kök anlamları yalnız acikkuran'da).
- `لؤلؤ` (l&l&) ve `هاء` (hAA) köklerinin gerçek Latin kodu doğrulanmadı.
- Meilisearch yok → `/search*` uçları çalışmaz; testlerdeki 2 arama başarısızlığı bundandır.
- Test sonucu (2026-09-17): 281 testten 276 geçer; kalanlar kök id (`/root/latin/qwm` id=13 bekler), `/translations` sırası ve 2 arama testi.
- `app.js`: yerel Postgres SSL sunmadığı için `DB_SSL=false` ile SSL kapatma seçeneği eklendi (önceki oturum, commit edilmedi).
