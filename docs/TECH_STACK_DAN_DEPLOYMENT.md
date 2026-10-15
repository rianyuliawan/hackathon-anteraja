# Tech stack dan deployment

## Komponen yang digunakan

| Lapisan | Implementasi |
| --- | --- |
| Fashionaja dan Anteraja | Dua aplikasi React + TypeScript + Vite + Tailwind CSS, React Router, responsif, manifest/service worker PWA. |
| API | Laravel/PHP, autentikasi sesi dan CSRF, otorisasi role/objek, transaksi bisnis, upload dan pembacaan foto privat. |
| Data | PostgreSQL tunggal untuk akun, katalog, pesanan, hub, shipment, attempts, tracking, laporan, dan outbox. |
| Peta/rute | Leaflet + OpenStreetMap pada UI; OSRM untuk geometri/waktu jalan bila layanan tersedia, fallback jarak koordinat. Tidak ada pelacakan GPS langsung atau trafik live. |
| Otomasi | n8n webhook dan jadwal; dua adapter MTProto akun Telegram pribadi untuk sender admin dan kurir. Mode MOCK/LIVE dikendalikan dari konfigurasi server. |
| Bukti foto | Laravel private local disk pada storage persisten; metadata/referensi pada PostgreSQL. Foto baru diambil dari kamera browser kurir. |

## Topologi yang dipakai

- Katalog: `https://katalog-fashionaja.rianyuliawan.my.id` → build `apps/catalog`.
- Portal Anteraja + API: `https://hackathon-anteraja.rianyuliawan.my.id` → build `apps/ops`, dengan path API/login diarahkan ke Laravel.
- Kedua frontend memanggil backend yang sama; backend terhubung ke PostgreSQL. n8n, OSRM, dan adapter hanya menerima koneksi internal di VPS.
- HTTPS diperlukan untuk instalasi PWA dan kamera pada Android. Tombol aplikasi memicu prompt instalasi bila browser menyediakannya; jika belum memenuhi syarat, petunjuk pemasangan browser digunakan. PWA terpasang sebagai aplikasi web, bukan APK native.

`VITE_API_BASE_URL` pada katalog dan `VITE_API_ORIGIN`/`VITE_CATALOG_URL` pada portal dibaca saat build. Di Laravel, atur `APP_URL`, `OPS_PUBLIC_URL`, `CATALOG_PUBLIC_URL`, `SESSION_DOMAIN`, `SESSION_SECURE_COOKIE`, `CORS_ALLOWED_ORIGINS`, koneksi `DB_*`, dan `APP_KEY` sesuai domain. Link AWB pada notifikasi memakai `OPS_PUBLIC_URL`. Variabel n8n, token internal, Telegram LIVE/allowlist, dan sesi adapter hanya disimpan di `.env`/storage privat server, tidak di Git.

## Instalasi database dan file

Migration Laravel memuat [satria-schema.sql](../backend/database/satria-schema.sql); seeder memuat [satria-seed.sql](../backend/database/satria-seed.sql) dan kelas seeder tambahan. Pada database **baru**, jalankan `php artisan migrate --force` dan `php artisan db:seed --force` dari `backend`. Jangan jalankan SQL tersebut lagi manual pada database yang sama. Setelah ada transaksi riil, jangan menjalankan seed pada setiap deploy. `DEMO_ACCOUNT_PASSWORD` sebaiknya diisi password kuat **sebelum seed baru pada VPS**; akun yang sudah ada tidak otomatis dirotasi. Simpan `backend/storage/app/private` secara persisten dan backup bersama PostgreSQL.

## Deploy dan batas skala

Template Nginx/systemd dan panduan operasional ada di [deploy/README.md](../deploy/README.md). `deploy/` layak masuk repo sebagai template dan instruksi, sepanjang tidak berisi `.env`, token, password, sesi Telegram, dump DB, sertifikat privat, atau file storage. Kode yang sudah dibangun bisa dideploy dari Git setelah frontend, backend, docs, integrations, dan template deploy sama-sama di-commit; sampai itu terjadi, `git pull` di VPS saja tidak mencerminkan working tree lokal.

Hub/zona/cakupan tersimpan sebagai data sehingga bisa diperluas, tetapi pemilihan hub MVP memakai cakupan kode pos dan satu hub per shipment. Pada skala lebih besar diperlukan geocoding/cakupan spasial, kapasitas hub, koordinasi antarahub, job queue, object storage, dan evaluasi performa rute. Saran stop saat ini adalah heuristik yang membantu operator, bukan optimasi global dengan trafik waktu nyata.
