# CLAUDE.md — acikkuran-api

## Ne bu
Açık Kuran API'si — **Fastify** tabanlı Node servisi. Klon: `ziegfiroyt/acikkuran-api`, dal `main` (son upstream commit 2024-12).

Yığın: Fastify + `@fastify/postgres` + `@fastify/redis` + `abstract-cache-redis` + Meilisearch. Giriş `index.js`, uygulama `app.js`, ayar `config.js`, uçlar `routes/`, testler `test/` (node-tap).

## Komutlar
```bash
npm run dev        # nodemon index.js
npm start          # node index.js
npm test           # ENVIRONMENT=test tap test/*.spec.js
npm run test:watch
```

Postgres + Redis + Meilisearch bağımlılığı var; `Dockerfile` mevcut.

## Dikkat
- `.env` gerçek bağlantı bilgileri içeriyor (`.env.example` şablon). **Okuma, yazdırma, commit etme.**
- Kuran metni ve meal verisi (`data/`) **doğruluk kaynağıdır** — otomatik düzeltme, normalizasyon veya "temizlik" yapma. Ayet numaralandırma ve sure sınırları sessizce değiştirilirse hata fark edilmez.
- Meal/tefsir çıktısı üretirken kaynak ve çevirmen atfını koru; uydurma çeviri ekleme.
- Upstream başkasına ait — push etmeden önce sor.
- İlgili: `~/quran-ios` (meal ekleme), `~/projects/develop/quran-agent`, `quran-connections-acikkuran` skill'i.
