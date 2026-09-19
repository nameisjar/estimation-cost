# AntarFix Estimator

**Satu project, satu repository GitHub, dengan dua bagian: frontend dan backend.** Aplikasi publik untuk memilih titik A/B di peta dan menghitung estimasi jarak jalan, waktu, serta biaya pengiriman. Frontend menangani tampilan/peta; backend memvalidasi koordinat, menghubungi OSRM, menghitung tarif, serta membaca data tempat hasil survei dari PostgreSQL + PostGIS.

## Struktur project

```text
antarfix-estimator/                 # Root satu repository GitHub
├── frontend/                      # Vue 3 + TypeScript + Vite + Leaflet
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── package-lock.json
│   ├── .env.example
│   └── README.md
├── backend/                       # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/
│   │   │   ├── routing/
│   │   │   └── pricing/
│   │   └── app.ts
│   ├── scripts/
│   ├── package.json
│   ├── package-lock.json
│   ├── .env.example
│   └── README.md
├── .gitignore
├── package.json                    # Perintah gabungan dari satu terminal
├── package-lock.json
├── ecosystem.config.js             # Proses backend production pada PM2
├── deploy/nginx.conf.example
├── IMPLEMENTATION_REPORT.md
└── README.md
```

Dependency aplikasi, lockfile, dan konfigurasi lint/typecheck masing-masing bagian berada di foldernya sendiri. Keduanya berkomunikasi melalui HTTP API. package.json root menyediakan perintah gabungan tanpa npm workspace; seluruh source tetap disimpan bersama dalam satu repo.

## Install dan jalankan

Prasyarat: Node.js 22.12+ dan npm. Setup pertama dari root project dalam **satu terminal PowerShell**:

```powershell
cd "D:\Doc\estimation cost\antarfix-estimator"
npm.cmd ci
npm.cmd run install:apps
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (!(Test-Path frontend/.env)) { Copy-Item frontend/.env.example frontend/.env }
npm.cmd run dev
```

Jika dependency sudah terinstal, penggunaan berikutnya cukup:

```powershell
cd "D:\Doc\estimation cost\antarfix-estimator"
npm.cmd run dev
```

Perintah tersebut menjalankan backend dan frontend bersamaan dengan label log API/WEB. Buka http://localhost:5173/. Backend default http://localhost:3000/. Ctrl+C menghentikan keduanya; jika salah satu proses berhenti, proses lain juga dihentikan. Perbaiki konfigurasi yang menyebabkan error lalu jalankan kembali.

Pada macOS/Linux, gunakan `npm` dan salin .env.example hanya pada setup pertama. Menjalankan `npm run dev` dari folder frontend/backend secara terpisah tetap tersedia bila diperlukan.

## Environment

- Backend: lihat `backend/.env.example` untuk PORT, OSRM, geocoding Nominatim, PostgreSQL, batas wilayah/jarak layanan, rate limit, tarif, FRONTEND_URL, dan WHATSAPP_NUMBER.
- Frontend: `frontend/.env.example` menyediakan VITE_API_BASE_URL dan API_PROXY_TARGET.
- Development default: VITE_API_BASE_URL kosong; Vite meneruskan `/api` dan `/health` ke API_PROXY_TARGET (http://localhost:3000).
- FRONTEND_URL backend harus sesuai origin frontend. WHATSAPP_NUMBER boleh kosong. Format umum seperti `+62 812-3456-7890` diterima dan dinormalisasi; nilai yang tidak valid hanya menonaktifkan pemesanan WhatsApp tanpa menghentikan API.

File `.env` disimpan lokal di komputer/server dan diabaikan Git. Commit `.env.example` serta semua package-lock.json (root/frontend/backend). Variabel VITE_* bersifat publik dan disematkan saat build; perubahan URL API frontend memerlukan rebuild, sedangkan perubahan environment backend memerlukan restart.

## Data tempat hasil survei dengan PostGIS

Database bersifat opsional. Tanpa `DATABASE_URL`, estimasi tetap berjalan dan pencarian memakai Nominatim/OpenStreetMap. Jika PostgreSQL + PostGIS dikonfigurasi, backend memprioritaskan data survei untuk pencarian dan reverse geocoding, lalu memakai Nominatim jika tidak ada hasil. POI disembunyikan pada zoom 14–15. Mulai zoom 16, aplikasi memilih tempat berdasarkan kategori, rating, jumlah ulasan, dan grid posisi agar icon serta label tidak bertumpuk.

Header CSV yang didukung sama dengan data Anda:

```csv
placeId,name,category,address,latitude,longitude,rating,reviewCount,phone,website,openingHours,googleMapsUrl,searchKeyword,searchArea,collectedAt
```

Semua kolom header harus tersedia agar format konsisten. Nilai yang wajib hanya `name`, `latitude`, dan `longitude`; nilai lainnya boleh kosong. `placeId` tidak menjadi primary key database dan boleh kosong. Jika ada, nilainya dipakai sebagai ID sumber agar impor ulang memperbarui tempat yang sama. Tanpa `placeId`, importer mengenali kombinasi nama yang sama dalam jarak 20 meter. Simpan hanya data survei sendiri atau data yang memang boleh digunakan.

Setup lokal/server setelah PostgreSQL dan ekstensi PostGIS tersedia:

```bash
cd backend
# Isi DATABASE_URL di .env, contoh:
# DATABASE_URL=postgresql://antarfix:password@127.0.0.1:5432/antarfix_estimator
npm run db:migrate
npm run places:import -- ./data/places.csv
```

Contoh format tersedia di `backend/data/places.example.csv`. Importer memeriksa header, koordinat, rating, jumlah ulasan, tanggal, dan radius area layanan. Jika koordinat kosong tetapi `googleMapsUrl` berisi koordinat, importer memulihkannya dari URL. `searchKeyword` dipakai untuk menentukan kategori icon ketika `category` kosong. Baris yang tetap tidak valid dilewati dengan peringatan agar baris valid tetap diproses. Proses dapat dijalankan ulang: data dengan `placeId` yang sama akan diperbarui, bukan digandakan.

## API dan pricing

- GET /health: health check API.
- GET /api/config: tarif aktif, batas layanan, dan nomor WhatsApp bisnis publik.
- POST /api/estimate: menerima pickup/destination dengan lat/lng berupa number; default OSRM overview=false.
- POST /api/estimate?geometry=true: menambahkan geometri rute jalan GeoJSON dalam response untuk Leaflet.
- GET /api/geocode/search?q=Merauke&lat=-8.4932&lng=140.4018: mencari maksimal lima tempat/alamat di sekitar fokus dalam radius lokal dan area layanan.
- GET /api/geocode/reverse?lat=-8.4932&lng=140.4018: menerjemahkan koordinat menjadi nama dan alamat terdekat.
- GET /api/places/map?north=...&south=...&east=...&west=...&zoom=16: mengambil POI survei dalam area peta untuk label Leaflet.

```text
additionalKm = max(0, distanceKm - INCLUDED_KM)
distanceFare = ceil(additionalKm) × PRICE_PER_KM
total = max(MINIMUM_FARE, BASE_FARE + distanceFare)
```

Default: tarif dasar Rp8.000 termasuk 2 km, tambahan Rp2.500/km, minimum Rp8.000. Jarak 1/2 km → Rp8.000; 5,2 km → Rp18.000; 10 km → Rp28.000. Backend menghitung jarak/durasi/tarif; input harga dari frontend bukan sumber kebenaran. Titik A/B dibatasi dalam radius 50 km dari pusat Merauke dan rute maksimal 50 km secara default. Nilai ini dapat diubah melalui environment.

Contoh request, response, validasi, dan error tersedia di [README backend](backend/README.md).

## Tampilan responsive dan alur mobile

Desain memakai pendekatan mobile-first dan alur ringkas. Pada layar sampai 800 px, formulir dan peta tersusun satu kolom dan tombol aksi berada di bawah layar agar mudah dijangkau ibu jari. Pencarian lokasi serta koordinat manual dibuka dalam bottom sheet, kartu hasil baru muncul saat proses hitung dimulai, dan peta dipendekkan pada mobile. Ruang bawah halaman menyesuaikan safe area perangkat agar tombol tidak bertabrakan dengan navigasi sistem.

Alur pengguna:

1. Cari nama tempat dengan memilih A/B dan menekan Cari, atau tekan Pilih titik jemput untuk memilih langsung di peta.
2. Setelah A dipilih, mode otomatis beralih ke tujuan B tanpa menggeser peta.
3. Setelah dua titik tersedia, tombol bawah berubah menjadi Hitung estimasi.
4. Saat perhitungan selesai atau gagal, halaman menuju kartu hasil. Harga tampil sebagai informasi utama, disusul jarak jalan dan waktu.

Peta menyediakan lokasi perangkat, fit rute, pin tengah A/B saat memilih, marker hasil yang dapat digeser, dan petunjuk status. Saat **Pilih langsung di peta** dibuka, aplikasi meminta izin lokasi, memusatkan peta pada perangkat, dan menampilkan titik GPS beserta area akurasi. Jika titik jemput A masih kosong, lokasi perangkat dipakai sebagai posisi awal. Pengguna menggeser peta sampai pin tengah tepat lalu mengonfirmasi titik. Setelah titik dipilih atau marker hasil digeser, backend mencari nama/alamat terdekat; koordinat tetap menjadi fallback. Koordinat manual tetap tersedia dengan pemilih A/B dan lokasi A/B dapat ditukar. Pada desktop, formulir/hasil berada di kiri dan peta luas di kanan. Breakpoint tambahan menangani tablet, ponsel 540 px, dan layar sempit 365 px tanpa scroll horizontal.

Jika terminal Vite pernah menampilkan `http proxy error ECONNREFUSED`, artinya frontend mencoba mengakses API ketika backend belum mendengarkan pada API_PROXY_TARGET. Pastikan perintah dijalankan dari root dengan `npm run dev` dan tunggu log `AntarFix API: http://localhost:3000`. Uji `http://localhost:3000/health`; response HTTP 200 menandakan backend siap. Pesan lama tetap terlihat pada terminal, tetapi request baru akan berhasil setelah API aktif.

## Pengujian dan build

Jalankan dari root project untuk memeriksa kedua bagian:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Perintah satu bagian saja dari root repository:

```powershell
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix backend run typecheck
npm.cmd --prefix frontend run lint
npm.cmd --prefix backend run lint
npm.cmd --prefix frontend test
npm.cmd --prefix backend test
npm.cmd --prefix frontend run build
npm.cmd --prefix backend run build
```

Frontend build menghasilkan frontend/dist. Backend build menghasilkan backend/dist; jalankan `npm start` dari backend untuk runtime production. Smoke test OSRM sungguhan: jalankan API, lalu `npm run test:smoke` dari backend. Unit/integration tests memakai konfigurasi test tetap dan tidak bergantung pada .env lokal.

## Satu repository GitHub

Inisialisasi Git dilakukan hanya pada root `antarfix-estimator/`. Simpan folder frontend, backend, .gitignore, dan dokumentasi dalam **repo yang sama**. Tidak perlu repository Git di dalam frontend atau backend.

Untuk publikasi ke satu repo GitHub kosong, jalankan dari root project setelah meninjau file yang akan masuk Git:

```bash
git add .
git commit -m "Initial AntarFix Estimator"
git remote add origin <URL_REPO_ANTARFIX_ESTIMATOR>
git push -u origin main
```

Ganti placeholder dengan URL repo nyata. Repo remote belum dibuat atau di-push otomatis. .gitignore root berlaku juga pada frontend/backend: node_modules, dist, .env, cache, log, dan coverage tidak masuk Git.

## Deployment dari repo yang sama

Satu repository dapat dideploy menjadi dua layanan. Set working/root directory layanan frontend ke `frontend/`, backend ke `backend/`.

### Satu origin dengan reverse proxy

Contoh: `https://estimator.antarfix.id` menyajikan frontend/dist; Nginx meneruskan `/api` ke proses Express lokal. Biarkan VITE_API_BASE_URL kosong dan isi FRONTEND_URL dengan `https://estimator.antarfix.id`. Untuk `/api/estimate`, proxy harus meneruskan path `/api/estimate` utuh ke Express.

Di server Ubuntu, clone satu repository ke `/data/projects/antarfix-estimator`. Build frontend/backend dari masing-masing folder. PM2 menjalankan backend dengan working directory backend dan script dist/server.js; nama proses dapat memakai antarfix-estimator-api. Nginx menyajikan frontend/dist dan melakukan reverse proxy ke backend. .env backend tetap lokal di server.

### Langkah server dengan PM2 dan Nginx

Prasyarat server: Node.js 22.12+, npm, PM2, dan Nginx sudah terpasang. Dari root project pada server:

```bash
cd /data/projects/antarfix-estimator
npm ci
npm run install:apps
# Setup .env pertama kali; tidak menimpa file yang sudah ada.
test -f backend/.env || cp backend/.env.example backend/.env
test -f frontend/.env || cp frontend/.env.example frontend/.env
```

Edit backend/.env: PORT=3000, FRONTEND_URL sesuai origin HTTPS, area/jarak layanan, rate limit, tarif/OSRM, dan WHATSAPP_NUMBER kosong atau nomor bisnis valid. Untuk satu origin via Nginx, VITE_API_BASE_URL frontend kosong. Setelah konfigurasi siap:

```bash
npm run build
cd backend && npm run db:migrate && cd ..
pm2 start ecosystem.config.js
pm2 save
pm2 status
```

PM2 menjalankan satu proses **antarfix-estimator-api** di background. Konfigurasi menentukan cwd backend agar dotenv membaca backend/.env, dan memakai file JavaScript hasil build. Frontend berupa file frontend/dist yang disajikan Nginx, sehingga tidak membutuhkan Vite dev server atau terminal terbuka di production.

Gunakan contoh [deploy/nginx.conf.example](deploy/nginx.conf.example), sesuaikan domain/path/port serta lokasi sertifikat, lalu pasang melalui konfigurasi Nginx server Anda. Contoh mengalihkan HTTP ke HTTPS, menyediakan TLS, rate limit tambahan, compression, cache aset, dan security headers. Pastikan sertifikat sudah tersedia sebelum mengaktifkan blok port 443. Jalankan `sudo nginx -t` sebelum reload konfigurasi dan pastikan Nginx punya akses baca ke frontend/dist.

Untuk auto-start PM2 setelah reboot, jalankan `pm2 startup`, ikuti perintah yang dicetak untuk user deployment, kemudian `pm2 save`. Detail: [PM2 startup](https://pm2.keymetrics.io/docs/usage/startup/).

Sesudah update source/configuration dan build ulang, jalankan `pm2 restart ecosystem.config.js --update-env`. Log API: `pm2 logs antarfix-estimator-api`. Konfigurasi mengikuti [PM2 ecosystem file](https://pm2.keymetrics.io/docs/usage/application-declaration/); proxy mempertahankan path API sesuai [Nginx proxy_pass](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass).

### Dua origin atau subdomain

Contoh frontend `https://estimator.antarfix.id`, backend `https://api-estimator.antarfix.id`:

- Set VITE_API_BASE_URL frontend ke `https://api-estimator.antarfix.id` sebelum build.
- Set FRONTEND_URL backend ke `https://estimator.antarfix.id`, lalu restart/redeploy.
- Frontend menjadi website statis, backend di host Node.js; keduanya tetap mengambil source dari repo yang sama.

Domain dan server block di atas merupakan contoh, belum dipasang atau dideploy. PM2/Nginx belum dijalankan pada server Ubuntu Anda. Vite development proxy tidak tersedia pada hosting statis/preview production; gunakan reverse proxy atau VITE_API_BASE_URL sesuai pilihan deployment.

## Dokumentasi dan batasan

- [Frontend: peta, API service, environment, pengujian](frontend/README.md)
- [Backend: routing, API, pricing, pengujian](backend/README.md)
- [Laporan penerapan arsitektur satu repository](IMPLEMENTATION_REPORT.md)

Peta Leaflet dan pencarian Nominatim memakai data OpenStreetMap dengan attribution © OpenStreetMap contributors. Search dijalankan saat tombol Cari ditekan, bukan autocomplete. Backend membatasi request Nominatim publik menjadi satu per detik dan memakai cache memori. Isi `GEOCODING_USER_AGENT` dengan identitas deployment yang nyata. Ikuti [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) dan [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/). Public OSRM/Nominatim untuk development atau trafik ringan tidak otomatis cocok untuk production berskala besar; gunakan provider/instance sesuai kapasitas.

API memiliki rate limit in-memory per alamat IP dan contoh Nginx menambahkan lapisan pembatas kedua. Halaman [privasi lokasi](frontend/public/privacy.html) menjelaskan pemakaian koordinat dan layanan pihak ketiga. Workflow `.github/workflows/ci.yml` menjalankan typecheck, lint, test, dan build pada setiap push serta pull request.

Database PostGIS bersifat opsional dan hanya menyimpan katalog tempat survei. Aplikasi belum memiliki login, sistem order, pembayaran, tracking, atau Google Maps API. Tombol WhatsApp memakai nomor bisnis dari konfigurasi dan tidak mengirim pesan otomatis.
