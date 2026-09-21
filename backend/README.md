# AntarFix Estimator — Backend

Bagian backend dari **satu project dan repository AntarFix Estimator**. Menggunakan Node.js 22.12+, Express 5, TypeScript, OSRM, pricing engine, serta PostgreSQL + PostGIS opsional untuk katalog tempat hasil survei. Package, dependency, dan build berada di folder `backend/`. Frontend berada di folder `frontend/` dan berkomunikasi melalui HTTP API; kedua bagian dapat dideploy pada host berbeda. Dokumentasi project ada di [README utama](../README.md).

## Struktur dan arsitektur

```text
src/
├── controllers/estimate.controller.ts
├── routes/estimate.routes.ts
├── services/
│   ├── routing/{routing.service,osrm.provider,fallback-routing.provider}.ts
│   └── pricing/pricing.service.ts
├── types/index.ts
├── validation.ts
├── config.ts
├── errors.ts
├── app.ts
└── server.ts
scripts/smoke.mjs
```

`Estimate Controller → RoutingService → RoutingProvider → OsrmProvider`. Jika `OSRM_FALLBACK_BASE_URL` diisi, `FallbackRoutingProvider` mencoba provider kedua hanya ketika primary gagal. PricingService hanya menerima jarak dan tidak mengetahui OSRM. Routing provider dapat diganti tanpa memindahkan logic OSRM ke controller atau pricing.

## Install dan jalankan

Untuk development kedua bagian sekaligus, gunakan `npm run dev` dari root project setelah setup di [README utama](../README.md). Untuk menjalankan backend saja, dari root repository masuk ke folder `backend/`:

```bash
cd backend
npm ci
cp .env.example .env
npm run dev
```

PowerShell: `npm.cmd` jika execution policy memblokir `npm.ps1`, dan `Copy-Item .env.example .env` untuk setup pertama. Jangan menimpa `.env` yang sudah ada. Backend default http://localhost:3000, health http://localhost:3000/health. Frontend tidak perlu berjalan untuk menjalankan API/test backend.

## Environment

| Variabel | Default | Fungsi |
| --- | --- | --- |
| PORT | 3000 | Port Express |
| OSRM_BASE_URL | http://127.0.0.1:5000 | Endpoint primary OSRM lokal pada deployment mandiri |
| OSRM_FALLBACK_BASE_URL | kosong | Endpoint fallback opsional selama masa transisi |
| OSRM_TIMEOUT_MS | 12000 | Timeout request OSRM |
| GEOCODING_BASE_URL | https://nominatim.openstreetmap.org | Endpoint pencarian dan reverse geocoding |
| GEOCODING_TIMEOUT_MS | 10000 | Timeout request geocoding |
| GEOCODING_USER_AGENT | AntarFixEstimator/1.0 (...) | Identitas aplikasi untuk provider geocoding; sesuaikan saat deployment |
| GEOCODING_SEARCH_RADIUS_KM | 20 | Radius pencarian nama tempat dari fokus pencarian; maksimal sebesar radius layanan |
| DATABASE_URL | kosong | Connection string PostgreSQL/PostGIS; kosong berarti fitur data survei dinonaktifkan |
| DATABASE_POOL_MAX | 10 | Maksimum koneksi database backend |
| SERVICE_AREA_CENTER_LAT | -8.4932 | Latitude pusat area layanan |
| SERVICE_AREA_CENTER_LNG | 140.4018 | Longitude pusat area layanan |
| SERVICE_AREA_RADIUS_KM | 50 | Radius maksimum titik jemput/tujuan dari pusat layanan |
| MAX_DELIVERY_DISTANCE_KM | 50 | Jarak rute jalan maksimum yang dapat diestimasi |
| RATE_LIMIT_WINDOW_MS | 60000 | Durasi jendela pembatasan API per alamat IP |
| RATE_LIMIT_MAX_REQUESTS | 60 | Maksimum request API per alamat IP dalam satu jendela |
| BASE_FARE | 8000 | Tarif dasar Rupiah |
| INCLUDED_KM | 2 | Km termasuk tarif dasar |
| PRICE_PER_KM | 2500 | Tarif per km tambahan setelah ceiling |
| MINIMUM_FARE | 8000 | Tarif minimum |
| FRONTEND_URL | http://localhost:5173 | Satu origin frontend yang diizinkan CORS |
| FRONTEND_URLS | kosong | Daftar origin frontend dipisahkan koma; menggantikan `FRONTEND_URL` bila diisi |
| ADMIN_USERNAME | kosong | Username dashboard admin; isi bersama hash dan session secret |
| ADMIN_PASSWORD_HASH | kosong | Hash scrypt dari perintah `npm run admin:hash-password` |
| ADMIN_SESSION_SECRET | kosong | Secret penanda sesi, minimal 32 karakter |
| ADMIN_SESSION_HOURS | 8 | Masa berlaku sesi admin, 1–168 jam |
| WHATSAPP_NUMBER | kosong | Nomor bisnis internasional; digit saja atau format umum seperti `+62 812-...` |

Tarif/URL berasal dari environment dan divalidasi saat startup. Isi `FRONTEND_URL` dengan satu origin persis atau `FRONTEND_URLS` dengan beberapa origin yang dipisahkan koma, tanpa path/trailing slash. Ubah variabel runtime → restart/redeploy backend. `.env` diabaikan Git; commit `.env.example` saja.

Nomor WhatsApp kosong berarti pemesanan belum aktif. Format seperti `+62 812-3456-7890` dinormalisasi menjadi digit internasional. Nilai yang tidak dapat dinormalisasi menghasilkan peringatan saat startup dan menonaktifkan tombol WhatsApp, tetapi API estimasi tetap berjalan. `/api/config` menyediakan tarif dan nomor bisnis publik, bukan secret.

## PostGIS dan import CSV survei

Aktifkan ekstensi dan tabel dengan `npm run db:migrate`, lalu impor data menggunakan `npm run places:import -- <path.csv>`. Header CSV:

```csv
placeId,name,category,address,latitude,longitude,rating,reviewCount,phone,website,openingHours,googleMapsUrl,searchKeyword,searchArea,collectedAt
```

`name` dan koordinat wajib tersedia. Jika kolom koordinat kosong, importer mencoba membacanya dari `googleMapsUrl`. Kolom lain boleh kosong, termasuk `placeId`. Baris tidak valid dilewati dengan peringatan dan dihitung pada ringkasan import. Data sumber lengkap tetap disimpan, sedangkan pencarian menggabungkan nama, kategori, alamat, kata kunci, dan area. Jenis ikon diturunkan dari nama dan kategori tempat; `searchKeyword` tidak menentukan ikon karena hanya menunjukkan kata kunci saat survei. Rating, jumlah ulasan, dan jenis tempat menentukan prioritas label serta tingkat zoom. Data survei menjadi hasil utama; Nominatim hanya dipakai saat database tidak menemukan kandidat. File contoh ada di `data/places.example.csv`.

Admin juga dapat mengimpor dari dashboard tanpa CLI. `POST /api/admin/places/import/preview` memvalidasi dan menghitung perubahan tanpa menulis database, sedangkan `POST /api/admin/places/import/commit` menyimpan seluruh hasil dalam satu transaksi. Keduanya menerima body `text/csv`, memerlukan sesi admin dan token CSRF, serta mendukung query `mode=upsert` atau `mode=insert-only`. Aplikasi tidak menetapkan batas ukuran file maupun jumlah baris; kapasitas aktual mengikuti RAM dan kemampuan database server. Koordinat valid di luar radius layanan disimpan dan dilaporkan sebagai `warnings`, sedangkan `outsideServiceRows` memuat jumlah lengkapnya. Data tersebut tetap tidak memperluas area pemesanan karena pencarian dan estimasi menggunakan konfigurasi layanan secara terpisah. Koordinat invalid dipulihkan dari `googleMapsUrl` atau ditukar jika pasangan latitude/longitude jelas terbalik. Duplikat berdasarkan `placeId`, atau nama sama dalam jarak 20 meter, digabung dan dipakai untuk melengkapi nilai kosong; respons menyediakan `correctedRows`, `corrections`, `mergedRows`, dan `merges` agar seluruh perubahan dapat diaudit sebelum commit. Konfigurasi Nginx contoh menonaktifkan batas body hanya untuk endpoint ini; endpoint API lain tetap dibatasi 8 KB.

Poligon bangunan disimpan terpisah dari POI. Setelah migrasi, isi data bangunan OpenStreetMap di sekitar pusat layanan dengan:

```bash
npm run buildings:sync -- --radius-km=3
```

Script mengambil way/relation bertanda `building`, area fasilitas terpilih seperti lapangan, taman, sekolah, rumah sakit, dan pasar, atribut alamat, serta POI bernama (`office`, `shop`, `amenity`, `tourism`, `healthcare`, `craft`, dan kategori relevan lainnya) melalui Overpass. Bangunan diubah menjadi Polygon/MultiPolygon valid di `building_footprints`, area fasilitas disimpan di `osm_areas`, dan POI disimpan di `osm_pois`. Radius default tanpa argumen adalah 3 km. Jalankan perintah ini sebagai pekerjaan sinkronisasi berkala; untuk penggunaan produksi, isi `OVERPASS_BASE_URL` dengan instance/provider yang kapasitas dan kebijakannya sesuai kebutuhan.

Jika alamat CSV kosong, nilai asli tetap ditandai `missing`, tetapi API publik menampilkan `searchArea` dalam format yang mudah dibaca agar pengguna tidak melihat placeholder. Jalankan migrasi dan pengayaan alamat secara bertahap:

```bash
npm run db:migrate
npm run places:enrich-addresses -- --limit=25
# Satu tempat tertentu:
npm run places:enrich-addresses -- --id=UUID-TEMPAT --limit=1
```

Alamat hasil reverse geocoding disimpan dengan status `automatic` dan belum dianggap diperiksa. Saat admin membuka lalu menyimpan alamat tersebut, status menjadi `manual` dan terverifikasi. Import ulang bersifat non-destruktif: nilai CSV kosong tidak menimpa alamat survei, alamat otomatis, alamat manual, alias, telepon, website, rating, jumlah ulasan, jam operasional, URL Google Maps, kata kunci, area pencarian, atau tanggal pengumpulan yang sudah tersedia. Status aktif/nonaktif dari dashboard dan `placeId` lama juga dipertahankan. Nilai CSV yang terisi tetap dapat melengkapi data; alamat manual hanya dapat diubah melalui dashboard. Nominatim publik dibatasi script menjadi maksimal 50 data per batch dengan interval lebih dari satu detik; provider atau instance sendiri diperlukan untuk proses rutin atau jumlah besar.

## API

### GET /health

```json
{"success":true,"message":"AntarFix Estimator API is running"}
```

### GET /api/config

```json
{"success":true,"data":{"pricing":{"baseFare":8000,"includedKm":2,"pricePerKm":2500,"minimumFare":8000},"whatsappNumber":"","serviceArea":{"centerLat":-8.4932,"centerLng":140.4018,"radiusKm":50,"maxDistanceKm":50}}}
```

### POST /api/estimate

```bash
curl -X POST http://localhost:3000/api/estimate \
  -H 'Content-Type: application/json' \
  -d '{"pickup":{"lat":-8.4932,"lng":140.4018},"destination":{"lat":-8.4965,"lng":140.4072}}'
```

Contoh respons ilustratif untuk jarak 5,2 km, bukan jarak aktual koordinat tersebut:

```json
{
  "success": true,
  "data": {
    "distanceKm": 5.2,
    "durationMinutes": 12,
    "pricing": {
      "baseFare": 8000,
      "includedKm": 2,
      "pricePerKm": 2500,
      "minimumFare": 8000,
      "additionalKm": 3.2,
      "billableKm": 4,
      "distanceFare": 10000,
      "total": 18000
    }
  }
}
```

Default memakai `overview=false`. `POST /api/estimate?geometry=true` memberikan tambahan `data.geometry` sebagai GeoJSON LineString (`coordinates: [[longitude, latitude], ...]`) melalui `overview=full&geometries=geojson`. Jarak, durasi, dan geometri berasal dari satu panggilan OSRM. Struktur satu repository mempertahankan kontrak API yang ada.

Latitude harus number finite -90 sampai 90; longitude number finite -180 sampai 180. Secara default, kedua titik harus berada dalam radius 50 km dari pusat area Merauke dan rute jalan tidak boleh melebihi 50 km. Field distance/harga dari client diabaikan. Backend selalu menghitung ulang jarak, durasi, dan biaya.

### GET /api/geocode/search dan /api/geocode/reverse

`GET /api/geocode/search?q=Merauke&lat=-8.4932&lng=140.4018` mencari maksimal lima nama tempat/alamat di sekitar fokus tersebut. `lat` dan `lng` bersifat opsional tetapi harus dikirim berpasangan; tanpa fokus, backend memakai pusat area layanan. Query harus 3–120 karakter dan dipanggil setelah pengguna menekan tombol Cari. Radius default 20 km dibatasi lagi oleh area layanan menggunakan viewbox Nominatim. `GET /api/geocode/reverse?lat=-8.4932&lng=140.4018` mencari objek OpenStreetMap terdekat dari koordinat.

Provider mengirim `User-Agent`, referer, bahasa Indonesia, membatasi request Nominatim publik menjadi satu per detik, dan memakai cache memori (10 menit untuk pencarian, 24 jam untuk reverse). Nama tempat tidak dijamin tersedia; hasil bergantung pada data OpenStreetMap dan koordinat tetap dipakai sebagai fallback. Atur `GEOCODING_USER_AGENT` ke identitas deployment yang nyata dan ikuti [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/).

### GET /api/places/suggestions

`GET /api/places/suggestions?q=wa&lat=-8.4932&lng=140.4018` menerima query 2–120 karakter dan mengembalikan maksimal enam saran dari PostGIS lokal. Pencarian mencakup nama, alamat, alias, kategori, kata kunci, dan area pencarian, dengan urutan kecocokan nama, kemiripan teks, prioritas, popularitas, lalu jarak. Endpoint ini tidak memakai fallback Nominatim sehingga aman dipanggil sebagai autocomplete dengan debounce. `lat` dan `lng` opsional tetapi harus dikirim berpasangan.

### GET /api/places/map

Menerima `north`, `south`, `east`, `west`, `zoom`, dan `limit` opsional (maksimal 200). Endpoint mengembalikan tempat survei aktif dalam viewport untuk label Leaflet. Pada zoom di bawah 14 respons selalu kosong; tanpa konfigurasi database respons juga aman berupa array kosong.

### GET /api/buildings/at

`GET /api/buildings/at?lat=-8.4932&lng=140.4018` hanya mengembalikan poligon PostGIS yang benar-benar menutupi koordinat. Bangunan diprioritaskan saat bertumpuk dengan area fasilitas; setelah itu bidang terkecil dipilih. Nama berasal dari tag OSM atau POI survei/OSM yang koordinatnya berada di dalam poligon yang sama; POI terdekat di luar bidang tidak digunakan. Respons menyertakan `kind` bernilai `building` atau `area`, sehingga frontend dapat membedakan gaya sorot. Nama endpoint dipertahankan untuk kompatibilitas. Tanpa database atau tanpa poligon yang cocok, `data` bernilai `null`; frontend tidak menggambar lingkaran pengganti.

### Dashboard dan API admin

Frontend dashboard tersedia pada `/admin`. Aktifkan akun dengan mengisi `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, dan `ADMIN_SESSION_SECRET` bersama-sama. Buat nilai yang diperlukan dengan:

```bash
npm run admin:hash-password -- "password-baru-yang-kuat"
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

API `/api/admin/*` memakai cookie sesi `HttpOnly` bertanda tangan, `SameSite=Strict`, masa berlaku terbatas, validasi origin CORS, dan header mutasi khusus. Endpoint mencakup login/logout, pemeriksaan sesi, statistik, daftar dengan pencarian serta filter status, tambah, edit, dan perubahan status tempat. Data tempat tidak dihapus permanen dari dashboard; nonaktifkan tempat agar riwayat tetap tersimpan dan tempat tidak muncul di estimator.

Kategori mengatur kelompok tempat dan prioritas label, sedangkan `icon_type` menentukan simbol khusus pada peta. Dashboard menandai pilihan ikon sebagai sudah diperiksa sehingga import berikutnya tidak menimpanya. Setelah aturan klasifikasi diperbarui, jalankan `npm run places:reclassify-icons` untuk memperbarui data lama yang belum diperiksa admin.

Error:

```json
{"success":false,"error":{"code":"INVALID_COORDINATES","message":"pickup.lat harus berupa angka antara -90 dan 90."}}
```

HTTP 400 koordinat/JSON invalid, 403 origin ditolak, 413 body terlalu besar (batas 8 KB), 422 rute tidak ditemukan/di luar batas layanan, 429 terlalu banyak request, 502 upstream/network/response invalid, 504 OSRM timeout, dan 500 kesalahan internal tanpa stack trace. CORS hanya mengizinkan origin dalam `FRONTEND_URLS` atau fallback `FRONTEND_URL`; request tanpa Origin tetap tersedia untuk API publik/CLI. Rate limit in-memory diterapkan pada seluruh endpoint `/api` per alamat IP. Nginx production memberi lapisan rate limit tambahan.

## Pricing

```text
additionalKm = max(0, distanceKm - INCLUDED_KM)
distanceFare = ceil(additionalKm) × PRICE_PER_KM
total = max(MINIMUM_FARE, BASE_FARE + distanceFare)
```

| Jarak | Total default |
| --- | --- |
| 1 km | Rp8.000 |
| 2 km | Rp8.000 |
| 5,2 km | Rp18.000 |
| 10 km | Rp28.000 |

Jarak asli OSRM tidak dibulatkan sebelum pricing. Nilai 2,001 km menagih satu km tambahan. Formula/pricing terpisah dari provider routing.

## Commands dan pengujian

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

Build menghasilkan `dist/`; start menjalankan `dist/server.js`. Typecheck juga memeriksa kode test. `npm test` menjalankan unit/integration tests dengan test runner bawaan Node + tsx: tarif, koordinat, area layanan, rate limit, HTTP API, geocoding, cache, identitas provider, CORS, otoritas pricing backend, urutan/unit OSRM, geometri dan error upstream. `scripts/test-env.mjs` memuat konfigurasi test tetap sebelum config aplikasi dibaca, sehingga pengujian tidak bergantung pada `.env` lokal atau secret deployment. Provider dimock dalam test sehingga tidak membutuhkan internet atau frontend; integration test membuka port HTTP lokal sementara.

Untuk uji OSRM sungguhan, jalankan backend dahulu, lalu di terminal lain dari folder `backend/`:

```bash
npm run test:smoke
```

Smoke test memeriksa health, public config, estimate default, GeoJSON route, konsistensi pricing/jarak/durasi, dan koordinat invalid. Memerlukan internet; tidak membutuhkan frontend. `SMOKE_API_URL` dapat diarahkan ke API lain jika diperlukan.

## OSRM dan deployment

Koordinat dikirim dalam format longitude,latitude; meter menjadi km, detik menjadi menit. `radiuses=1000;1000` membatasi snapping maksimum 1 km dari jalan. Durasi profil driving belum memperhitungkan lalu lintas real time atau waktu menunggu. Lihat [OSRM HTTP API](https://project-osrm.org/docs/v5.24.0/api/).

Public OSRM endpoint untuk development/testing tidak otomatis cocok untuk traffic production berskala besar. Deployment mandiri memakai container pada [deploy/osrm](../deploy/osrm/README.md) dan mengarahkannya melalui `OSRM_BASE_URL=http://127.0.0.1:5000`. Fallback bersifat opsional dan sebaiknya dikosongkan setelah instance lokal stabil. Gunakan ekstrak yang mencakup seluruh radius layanan dan perbarui graph ketika data jalan diperbarui.

Gunakan satu repository AntarFix Estimator dan set working/root directory layanan backend ke `backend/` pada host Node.js. Install/build `npm ci && npm run build`, start `npm start`. DevDependencies dibutuhkan pada tahap build; dependency runtime dapat dipangkas setelah build. Set PORT sesuai platform, environment pricing/OSRM, `FRONTEND_URL` ke origin frontend, dan nomor WhatsApp bisnis bila tersedia. Gunakan HTTPS. Nginx dapat menyajikan `frontend/dist` dan meneruskan `/api` ke Express pada origin yang sama. Seluruh source disimpan dalam satu repository; proses frontend dan backend tetap terpisah.

Konfigurasi PM2 tersedia pada `ecosystem.config.js` di root project: proses `antarfix-estimator-api`, cwd backend, dan script hasil build `backend/dist/server.js`. Jalankan `pm2 start ecosystem.config.js` dari root sesudah build. Petunjuk Nginx, PM2 save/startup, dan update ada di [README utama](../README.md).

PostGIS digunakan untuk katalog tempat dan dashboard admin. Autentikasi hanya melindungi dashboard admin; belum ada akun pelanggan, payment, order system, tracking, atau Google Maps API.
