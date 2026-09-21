# UZ News

Yangiliklar sayti — **SQL baza (Supabase / Postgres)** va **kod bilan kiriladigan admin panel** bilan.

## Ishga tushirish

Kerak: **Node.js 20.12 yoki yangiroq** (`node -v`).

**1. Supabase (bir marta)**
1. Supabase → **SQL Editor** → New query → `db/schema.pg.sql` ichidagi hammasini qo'yib **Run**.
   (Bu jadvallarni yaratadi va ularni publishable kalitdan **yopadi**. Eski sxema allaqachon ishga tushirilgan bo'lsa ham qayta ishga tushirish xavfsiz.)
2. Supabase → **Project Settings → API Keys** → **Secret key** (`sb_secret_...`) ni nusxalang.

**2. Lokal**
```bash
cp .env.example .env      # SUPABASE_KEY (secret), GROQ_API_KEY, ADMIN_CODE ni to'ldiring
npm install
npm start                 # http://localhost:3000   ·   admin: /admin/
```
Windows'da `.env.example` ni `.env` deb nusxalab, keyin `npm install` va `start.bat`.
`index.html` ni fayl sifatida ochmang — API faqat server ishlaganda ishlaydi.

**3. Internetga chiqarish**
Bu **Node.js server** (API + admin + kunlik xulosa taymeri). Netlify/GitHub Pages kabi *statik* hostinglarda ishlamaydi
(`/api/*` 502/404 beradi). Node ishlatadigan hosting kerak: **Render, Railway, Fly.io yoki VPS**.
Build: `npm install`, Start: `npm start`, Environment Variables: `.env.example` dagi qiymatlar
(+ `TRUST_PROXY=1`, `COOKIE_SECURE=1`). **`.env` ni va kalitlarni git'ga yuklamang.**

### Sozlamalar (ixtiyoriy)

| O'zgaruvchi | Ma'nosi |
|---|---|
| `PORT=8080` | Port (standart 3000) |
| `ADMIN_CODE=MeningKodim` | Birinchi ishga tushishda o'zingiz tanlagan kod (bo'sh bo'lsa tasodifiy yaratiladi) |
| `GROQ_API_KEY=gsk_...` | **AI uchun** (Groq bepul kalit). [console.groq.com](https://console.groq.com) |
| `GROQ_MODEL=llama-3.3-70b-versatile` | Model (ixtiyoriy) |
| `NEWS_RETENTION_DAYS=14` | Necha kundan eski yangiliklar o'chiriladi (0 = o'chirmaslik) |
| `DIGEST_ENABLED=0` | Kunlik xulosani avtomatik e'lon qilishni o'chirish (qo'lda e'lon ishlayveradi) |
| `DIGEST_TIME=08:00` | E'lon vaqti, Toshkent vaqti bilan (standart 08:00) |
| `DIGEST_FEEDS="Nom\|https://.../rss,..."` | RSS manbalar (standart: Kun.uz, Daryo, Gazeta.uz, BBC O'zbek) |
| `DIGEST_MIN_ITEMS=8` / `DIGEST_MIN_POINTS=3` | Kamida nechta yangilik / tekshiruvdan o'tgan band kerak |
| `DIGEST_MAX_ATTEMPTS=3` | Kuniga avtomatik urinishlar soni (urinishlar orasida 30 daqiqa) |
| `TRUST_PROXY=1` | nginx / Cloudflare orqasida ishlaganda |
| `COOKIE_SECURE=1` | Sayt HTTPS'da bo'lsa (tavsiya etiladi) |
| `SUPABASE_URL`, `SUPABASE_KEY` | Supabase manzili va **secret** kaliti (majburiy) |

Masalan: `PORT=8080 ADMIN_CODE=MeningKodim GROQ_API_KEY=gsk_xxx npm start`

## Admin kod

- Panelga faqat kod bilan kiriladi. Kod bazada **hash** ko'rinishida saqlanadi (scrypt), ochiq holda emas.
- 5 marta noto'g'ri kiritilsa, shu IP 10 daqiqaga bloklanadi. Sessiya 12 soat.
- Kodni almashtirish: panelda **Xavfsizlik** bo'limi, yoki terminalda
  `npm run set-code` (tasodifiy yangi kod) / `npm run set-code -- YangiKod123`.
  Kod unutilgan bo'lsa ham shu buyruq bilan tiklanadi.

## AI yordamchi

### Admin panelda (haqiqiy AI)
Admin panelda **AI yordamchi** bo'limi va yangilik formasi ichida AI tugmalari bor:
- Sarlavhani yaxshilash
- To'liq matndan qisqa excerpt yaratish
- Matnni kengaytirish
- Ruscha tarjima
- Mavzudan to'liq yangilik generatsiya qilish

Ishlatish uchun `GROQ_API_KEY` kerak (bepul: https://console.groq.com).

### Kun xulosasi (avtomatik)
Har kuni `DIGEST_TIME` da server RSS manbalardan oxirgi 24 soatdagi yangiliklarni o'qiydi, AI qisqa xulosa yozadi va
«Kun xulosasi» bo'limiga e'lon qiladi. Ishonchlilik uchun:
- AI har bir bandga manba ko'rsatishi shart; manbasiz band tashlanadi;
- bandda manbada yo'q raqam bo'lsa, band tashlanadi;
- valyuta kurslarini AI emas, O'zbekiston Markaziy banki (cbu.uz) beradi;
- xato bo'lsa 30 daqiqadan keyin qayta uriniladi (kuniga `DIGEST_MAX_ATTEMPTS` martagacha);
- bir kunda ikki marta avtomatik e'lon qilinmaydi (server qayta ishga tushsa ham).
Admin panelda **Kun xulosasi** bo'limida holat, manbalar, «Sinov» (saqlamasdan) va «Hozir e'lon qilish» tugmalari bor.
Kerak: `GROQ_API_KEY`. Serverni doim ishlab turadigan joyda (VPS/hosting) ishga tushiring — o'chiq server e'lon qilmaydi.

### Sayt (foydalanuvchi)
Saytda `#/ai` sahifasida oddiy yordamchi bor (lokal qidiruv, LLM emas).

## Baza tuzilishi

`db/schema.pg.sql` — jadvallar: `categories`, `articles` (o'zbekcha + ixtiyoriy ruscha matn, ko'rishlar soni),
`settings` (admin kodi hash'i), `admin_sessions`. Boshlang'ich ma'lumotlar: `db/seed.json`.
Standart SQL bo'lgani uchun MySQL/PostgreSQL'ga ko'chirish oson.

**Zaxira nusxa:** Supabase → Database → Backups (yoki `pg_dump`).

## Papkalar

Tuzilishi avvalgi sayt bilan bir xil (index.html, css/, js/, admin/ ildizda), shuning uchun eski papka ustiga ochsangiz ham eski fayllar yangisiga almashadi.

```
index.html, css/, js/, admin/, assets/   sayt va admin paneli (brauzerga beriladi)
server.js        server (API + statik fayllar)
lib/db.js        baza, lib/auth.js  admin kodi va sessiyalar
db/              schema.sql, seed.json
scripts/         set-code.js
data/            uznews.db — SQL baza fayli
start.bat        Windows uchun ishga tushirish
```

`server.js`, `lib/`, `db/`, `data/` brauzerdan ochilmaydi (server ularni bermaydi).

## API

Ochiq: `GET /api/news`, `GET /api/categories`, `POST /api/news/:id/view`
Admin (kod bilan kirgandan keyin): `POST /api/admin/login|logout|code|reset`,
`GET /api/admin/me`, `POST /api/admin/news`, `PUT|DELETE /api/admin/news/:id`,
`GET /api/admin/ai/status`, `POST /api/admin/ai/assist`,
`GET /api/admin/digest/status`, `POST /api/admin/digest/run` (`{dryRun, again}`)
