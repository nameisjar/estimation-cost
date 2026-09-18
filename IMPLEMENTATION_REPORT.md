# Penerapan arsitektur satu repository

## Hasil

AntarFix Estimator menggunakan satu root project/repository `antarfix-estimator/` dengan bagian frontend dan backend. Masing-masing bagian memiliki package.json, lockfile, dependency, build, dan pengujian sendiri. Penyimpanan source dan perubahan kontrak API dilakukan dalam satu repository.

Tidak ada npm workspace. package.json root menyediakan perintah gabungan dev/build/typecheck/lint/test dan instalasi dependency aplikasi. Satu perintah npm run dev menjalankan frontend/backend dalam satu terminal; package aplikasi masing-masing tetap terpisah.

## Perubahan

- README utama: struktur satu repo, setup satu terminal, perintah gabungan, workflow satu GitHub repo, dan petunjuk deployment dengan PM2/Nginx.
- README frontend/backend: istilah dan petunjuk path disesuaikan menjadi bagian dalam satu project; layanan hosting memilih working directory masing-masing.
- .gitignore utama: aturan berlaku pada seluruh project dan melindungi .env, node_modules, dist, cache, log, dan coverage di kedua bagian. .env.example dan package-lock.json tetap masuk Git.
- Laporan ini menggantikan rencana dua repository sebelumnya.
- Satu repository Git lokal diinisialisasi pada root antarfix-estimator dengan branch main. Tidak ada repository Git di dalam frontend/backend; belum ada commit atau push.

Source aplikasi, package.json frontend/backend, lockfile frontend/backend, pricing, dan endpoint API tidak berubah. Ditambahkan package.json/lockfile root, ecosystem.config.js untuk backend production pada PM2, dan deploy/nginx.conf.example untuk frontend statis + proxy API. File .env lokal dipertahankan. Konfigurasi server disiapkan dalam repository dan belum dipasang di Ubuntu.

## Validasi

Repository root dan aturan Git sebelumnya diperiksa: .env, node_modules, dist, dan cache diabaikan; .env.example dan lockfile tetap bisa masuk repository.

Validasi terbaru dari root setelah penambahan perintah gabungan:

- npm install root: lulus, concurrently terpasang dan package-lock.json root dibuat.
- npm run typecheck: lulus backend/frontend termasuk kode test.
- npm run lint: lulus syntax ecosystem.config.js dan lint backend/frontend.
- npm test awal: backend 25 test lulus, frontend 3 test lulus. Setelah test normalisasi WhatsApp ditambahkan: backend 26 test dan frontend 3 test lulus, 0 gagal.
- npm run build: lulus backend/dist dan frontend/dist.
- Konfigurasi PM2 di-load lewat Node: nama proses, cwd backend, path script hasil build, environment production, serta watch=false terverifikasi. PM2 daemon tidak dijalankan pada Windows atau server Ubuntu.
- npm run dev: satu perintah berhasil menjalankan API dan Vite bersamaan. Uji dilakukan dengan override WhatsApp kosong hanya pada environment proses karena nilai .env lokal belum valid; file .env tetap dipertahankan.
- HTTP frontend dan backend health melalui proxy Vite: HTTP 200.
- npm run test:smoke: OSRM live estimate, GeoJSON, pricing, health, config, dan koordinat invalid lulus. Koordinat contoh menghasilkan 0,9996 km, 2,108333 menit, Rp8.000, dan 35 titik geometri.

Proses development uji dihentikan setelah verifikasi. Tidak ada QA visual/browser baru. Contoh Nginx belum divalidasi menggunakan nginx -t karena Nginx server belum diakses; deployment PM2/Nginx di Ubuntu belum diuji.

## Penyempurnaan responsive mobile

Frontend diperbarui dengan indikator tiga langkah, kartu lokasi yang menampilkan status dan koordinat secara terpisah, pemilih target pada input koordinat manual, kontrol cepat A/B pada peta, serta harga sebagai fokus pertama di kartu hasil. Pada layar <=800 px, urutannya menjadi lokasi → peta → hasil. Tombol aksi fixed di bawah layar berubah dari Pilih jemput, Pilih tujuan, Hitung estimasi, hingga status menghitung; safe-area perangkat diperhitungkan.

Pemilihan field memindahkan viewport mobile ke peta. Setelah A dipilih, mode B aktif tanpa menggeser peta. Setelah request sukses/gagal, viewport menuju kartu hasil. Tombol fit map diekspos dari komponen peta untuk input koordinat manual. Marker lama tetap diperbarui, bisa digeser, dan hasil lama dihapus saat titik berubah.

Validasi setelah perubahan UI: typecheck backend/frontend lulus; lint frontend lulus; build production lulus; frontend HTTP dan proxy backend HTTP lulus; OSRM live smoke test lulus dengan 35 titik geometri. Browser runtime tidak tersedia pada lingkungan ini (daftar browser kosong), sehingga QA visual, resize, dan klik langsung di browser belum dapat dilakukan.

Tindak lanjut dari pemeriksaan pengguna pada iPhone 16 Pro Max emulator: intrinsic width pada grid/flex masih dapat melebarkan halaman. Semua container utama kini memakai `width:100%`, `min-width:0`, dan batas viewport; indikator langkah memakai `repeat(3,minmax(0,1fr))`; label tahap dipersingkat; judul boleh membungkus; product label header disembunyikan pada <=540 px. Typecheck, lint, build, 26 test backend dan 3 test frontend lulus setelah perubahan ini.

Log Vite `ECONNREFUSED /api/config` disebabkan backend belum listening. Akar masalah lokal adalah WHATSAPP_NUMBER tidak valid yang sebelumnya membuat config backend melempar error. Nomor sekarang dinormalisasi dari format umum; nilai yang tetap invalid hanya menghasilkan warning dan WhatsApp dinonaktifkan. API tidak berhenti. Dengan proses development pengguna yang sudah aktif, endpoint backend langsung, `/health` melalui Vite, dan `/api/config` melalui Vite masing-masing kembali HTTP 200. Percobaan membuka proses dev kedua ditolak karena port 3000/5173 sudah dipakai proses yang aktif; proses pengguna tidak dihentikan.

## Catatan

Repo GitHub remote belum dibuat atau di-push; URL repo belum diberikan. Perintah publikasi dijelaskan di README utama.

WHATSAPP_NUMBER pada .env backend lokal sebelumnya tidak sesuai format. API sekarang tetap berjalan dan menonaktifkan fitur WhatsApp untuk nilai invalid. Gunakan kosong atau nomor bisnis internasional agar tombol pemesanan aktif. Pengujian backend memakai test-env.mjs sehingga tidak bergantung pada nilai .env lokal.
