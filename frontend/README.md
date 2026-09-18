# AntarFix Estimator — Frontend

Bagian frontend dari **satu project dan repository AntarFix Estimator**. Menggunakan Vue 3, TypeScript, Vite, Leaflet, OpenStreetMap, dan Lucide. Package, dependency, dan build berada di folder `frontend/`; backend diakses melalui HTTP API. Dokumentasi project ada di [README utama](../README.md).

## Struktur

```text
src/
├── components/EstimatorMap.vue
├── services/estimate.service.ts
├── types/index.ts
├── utils/format.ts
├── utils/format.test.ts
├── App.vue
├── style.css
└── main.ts
```

## Install dan jalankan

Node.js 22.12+ diperlukan. Untuk menjalankan frontend dan backend bersama dalam satu terminal, gunakan `npm run dev` dari root project setelah setup di [README utama](../README.md). Jika hanya menjalankan frontend, dari root repository masuk ke folder `frontend/`:

```bash
cd frontend
npm ci
cp .env.example .env
npm run dev
```

PowerShell: gunakan `npm.cmd` jika `npm.ps1` diblokir execution policy, dan `Copy-Item .env.example .env` untuk setup pertama. Jangan menimpa `.env` yang sudah dikonfigurasi.

Website: http://localhost:5173/. Jalankan backend secara terpisah di http://localhost:3000 atau ubah konfigurasi API. API tidak tersedia hanya dengan menjalankan frontend.

## Environment

| Variabel | Default | Fungsi |
| --- | --- | --- |
| VITE_API_BASE_URL | kosong | Kosong: gunakan `/api` pada origin frontend; isi origin backend jika berbeda host |
| API_PROXY_TARGET | http://localhost:3000 | Target proxy `/api` dan `/health` pada Vite development |

Dengan nilai default, Vite meneruskan `/api` ke backend lokal yang dijalankan dari folder `backend/` pada project yang sama. Saat deployment, backend dapat berada pada host berbeda. Komunikasi frontend/backend menggunakan HTTP, bukan pembacaan filesystem.

Untuk deployment statis terpisah, set sebelum build:

```env
VITE_API_BASE_URL=https://api.antarfix.example
```

Alamat di atas contoh; ganti dengan URL deployment backend yang nyata, tanpa `/api` di akhir. Variabel `VITE_*` bersifat publik dan disematkan saat build. Jangan memasukkan secret. Ubah URL → rebuild/redeploy frontend. `API_PROXY_TARGET` khusus development; `vite preview` dan hosting statis tidak menyediakan proxy ini.

Backend harus mengizinkan origin website ini melalui `FRONTEND_URL`. CORS konfigurasi backend, bukan frontend.

## Commands dan tests

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

`typecheck` memeriksa Vue/TypeScript dan kode test. `test` menjalankan tiga test utility format Rupiah, durasi, dan encoding pesan WhatsApp, tanpa backend atau akses internet. Build menghasilkan `dist/`. `preview` hanya memeriksa build lokal (default port 4173).

## Kontrak API

API base URL adalah origin backend. Frontend menggunakan:

- `GET /api/config` → `{ success: true, data: { pricing: { baseFare, includedKm, pricePerKm, minimumFare }, whatsappNumber } }`.
- `GET /api/geocode/search?q=...` → daftar nama tempat/alamat beserta koordinat.
- `GET /api/geocode/reverse?lat=...&lng=...` → nama/alamat objek terdekat atau `null`.
- `POST /api/estimate?geometry=true`, body hanya `{ pickup: { lat, lng }, destination: { lat, lng } }`.
- Success → `{ success: true, data: { distanceKm, durationMinutes, pricing: { baseFare, includedKm, pricePerKm, minimumFare, additionalKm, billableKm, distanceFare, total }, geometry: { type: 'LineString', coordinates: [[lng, lat], ...] } } }`.
- Error → `{ success: false, error: { code, message } }` dengan HTTP status yang sesuai.

Type API berada di `src/types/index.ts` agar build frontend mandiri. Jika kontrak API berubah, update type/service frontend dan response backend dalam satu perubahan repository. Tidak ada import source backend dari frontend. Tarif dan nomor WhatsApp diambil dari backend. Harga/jarak tidak dihitung sebagai sumber kebenaran di frontend.

## Alur pemakaian

Pengguna dapat memilih target A/B, mengetik nama tempat/alamat, lalu menekan Cari dan memilih hasil. Pencarian tidak berjalan pada setiap ketikan. Alternatifnya, tekan **Pilih langsung di peta**. Aplikasi meminta lokasi perangkat, memusatkan peta, menampilkan titik GPS biru dan area akurasi, lalu memakai posisi tersebut sebagai awal marker A jika titik jemput masih kosong. Saat peta digeser, pin tengah terangkat, indikator status menjelaskan proses pencarian nama, lalu pin mendarat ketika titik siap digunakan. Marker A/B hasil pilihan tetap menampilkan pegangan dan dapat digeser. Klik peta, koordinat manual, dan marker yang digeser memicu reverse geocoding agar field menampilkan nama/alamat terdekat dengan koordinat sebagai fallback. Nama administratif seperti kota atau kelurahan tidak dipakai sebagai judul utama; aplikasi menampilkan `Titik jemput pilihan`/`Titik tujuan pilihan`, sedangkan nama jalan menjadi `Titik di ...`. Jika izin lokasi ditolak atau GPS gagal, peta tetap dapat dipilih manual. Setelah tujuan dipilih, tekan Hitung estimasi. Pada layar mobile, halaman menuju peta ketika pemilihan dimulai dan menuju hasil setelah request selesai. Tombol aksi tetap di bawah layar dan berubah mengikuti langkah aktif. Titik bisa ditukar, dan hasil dihapus setelah lokasi berubah. Saat menghitung, permintaan tambahan dan perubahan titik dinonaktifkan. Rute mengikuti GeoJSON jalan dari backend, tanpa fallback garis lurus.

Layout responsive memakai breakpoint 800 px untuk satu kolom, 540 px untuk ponsel, dan 365 px untuk layar sempit. Pencarian lokasi dan koordinat manual berada dalam dialog/bottom sheet agar halaman utama tetap pendek; kartu hasil tidak dirender sebelum menghitung dan tinggi peta mobile dibatasi. Elemen interaktif utama memiliki target sentuh sekitar 42–59 px, tombol bawah memperhitungkan safe area, dan konten tidak membuat horizontal scrolling. Desktop mempertahankan formulir/hasil di kiri serta peta besar di kanan.

Setelah hasil tersedia, tombol WhatsApp aktif jika backend menyediakan nomor bisnis yang valid. Pesan tidak dikirim otomatis; pengguna meninjau/mengirim di WhatsApp. Nomor kosong membuat tombol disabled dengan penjelasan.

## Deployment

Gunakan satu repository AntarFix Estimator dan set working/root directory layanan frontend ke `frontend/`. Build command `npm ci && npm run build`, output directory `dist` relatif terhadap folder tersebut (`frontend/dist` dari root repository). Set `VITE_API_BASE_URL` sebelum build untuk backend di origin lain, atau biarkan kosong jika `/api` diteruskan oleh reverse proxy pada origin yang sama. Untuk hosting SPA, sajikan `index.html` sebagai fallback bila diperlukan. Gunakan HTTPS untuk akses lokasi perangkat (localhost juga didukung).

## OpenStreetMap dan batasan

Tile: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Attribution `© OpenStreetMap contributors` ditampilkan dengan tautan [copyright](https://www.openstreetmap.org/copyright). Ikuti [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/); tidak ada prefetch atau bulk download tile.

Peta awal Merauke. Internet dibutuhkan untuk tile, routing backend, dan font web; font memiliki fallback sans-serif. Unit test/build tidak memverifikasi rendering atau interaksi browser. Tidak ada database, login, order, payment, tracking, atau Google Maps API.
