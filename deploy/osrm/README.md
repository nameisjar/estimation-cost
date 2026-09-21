# OSRM lokal AntarFix

Folder ini menyiapkan mesin routing mobil khusus area Merauke pada laptop server. Container hanya dipublikasikan ke `127.0.0.1:5000`, sehingga port routing tidak terbuka ke internet.

## Persiapan data

1. Buat atau unduh ekstrak OpenStreetMap yang mencakup seluruh area layanan dan sedikit ruang di sekelilingnya.
2. Simpan sebagai `deploy/osrm/data/merauke.osm.pbf`.
3. Dari root repository di server Linux/CasaOS, jalankan:

```bash
chmod +x deploy/osrm/prepare.sh
./deploy/osrm/prepare.sh
docker compose -f deploy/osrm/compose.yaml up -d
```

Persiapan data memakai CPU, RAM, dan penyimpanan lebih besar daripada pelayanan rute sehari-hari. Jalankan ulang proses persiapan ketika data jalan diperbarui.

## Verifikasi

```bash
curl "http://127.0.0.1:5000/route/v1/driving/140.4018,-8.4932;140.4072,-8.4965?overview=false"
docker compose -f deploy/osrm/compose.yaml logs --tail=100 osrm
```

Respons yang sehat memiliki `"code":"Ok"`. Setelah itu atur backend:

```env
OSRM_BASE_URL=http://127.0.0.1:5000
OSRM_FALLBACK_BASE_URL=https://router.project-osrm.org
```

Fallback publik hanya untuk masa transisi. Setelah rute lokal teruji stabil, kosongkan `OSRM_FALLBACK_BASE_URL` agar trafik production tidak bergantung pada server demo.

Jika PM2 berjalan langsung di host, alamat `127.0.0.1:5000` dapat digunakan. Jika backend juga dijalankan di dalam container, masukkan backend dan OSRM ke network Docker yang sama lalu gunakan `http://osrm:5000`.
