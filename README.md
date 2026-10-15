# Hackathon Anteraja

Aplikasi pengiriman dari checkout Fashionaja hingga pengantaran terakhir. Fashionaja dan portal Anteraja adalah dua frontend terpisah yang memakai satu API Laravel dan satu database PostgreSQL. Fitur inti meliputi pembuatan AWB, penugasan hub dan kurir, bukti foto, pelacakan, penanganan gagal kirim, pengantaran ulang dengan AWB yang sama, dan laporan harian.

## Teknologi

- PHP 8.3+, Laravel 13, Composer, PostgreSQL 16
- React, TypeScript, Vite, Tailwind CSS, PWA
- Leaflet/OpenStreetMap untuk peta; OSRM lokal untuk geometri rute jalan
- n8n dan adapter Telegram **opsional** untuk notifikasi

## Menjalankan dari clone baru

Prasyarat: PHP beserta ekstensi `pdo_pgsql`, Composer, PostgreSQL 16, dan Node.js 20.19+ atau 22.12+. Gunakan tiga terminal untuk backend dan kedua frontend.

1. Clone repository dan buat database lokal kosong. Contoh di Ubuntu:

   ```bash
   git clone https://github.com/rianyuliawan/hackathon-anteraja.git
   cd hackathon-anteraja
   sudo -u postgres psql
   ```

   Di prompt PostgreSQL, jalankan:

   ```sql
   CREATE ROLE satria LOGIN PASSWORD 'satria_local';
   CREATE DATABASE satria OWNER satria;
   \q
   ```

   Jika role sudah ada, gunakan role/database lain dan sesuaikan `DB_*` pada `backend/.env`.

2. Terminal backend:

   ```bash
   cd backend
   composer install
   cp .env.example .env
   php artisan key:generate
   php artisan migrate
   php artisan db:seed
   php artisan serve --host=127.0.0.1 --port=8000
   ```

   Sebelum migrasi, ubah `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, dan `DB_PASSWORD` di `.env` bila tidak memakai contoh di atas. Seed pertama dapat memakan waktu sekitar satu menit. Cek `http://127.0.0.1:8000/up`.

3. Terminal Fashionaja, dari root repository:

   ```bash
   cd apps/catalog
   cp .env.example .env
   npm ci
   npm run dev
   ```

   Buka `http://localhost:5173`.

4. Terminal Anteraja, dari root repository:

   ```bash
   cd apps/ops
   cp .env.example .env
   npm ci
   npm run dev
   ```

   Buka `http://localhost:5174`. Kedua frontend mem-proxy API ke `http://127.0.0.1:8000` secara default. Jika backend memakai port lain, ubah `VITE_PROXY_TARGET` di **kedua** `.env` frontend dan restart Vite. Gunakan hostname yang konsisten di browser agar cookie login terbaca.

| Peran | Akun contoh | Kata sandi |
| --- | --- | --- |
| Pembeli | `siti.nurhaliza@anteraja.id` | `anteraja123` |
| Ops admin | `rianyuliawan@anteraja.id` | `anteraja123` |
| Operator hub Cakung | `rianyuliawan1@anteraja.id` | `anteraja123` |
| Kurir antar Cakung | `afrien@anteraja.id` | `anteraja123` |
| Kurir pickup | `bagus.setiawan@anteraja.id` | `anteraja123` |

Akun tersebut berasal dari seed dan hanya untuk pengujian lokal. Lihat [panduan backend](backend/README.md) untuk skenario dan AWB contoh. Data clone adalah **fixture demo yang konsisten**, bukan salinan transaksi yang terjadi di VPS.

## Peta, PWA, dan automasi

Tanpa OSRM, aplikasi inti tetap bisa dijalankan, tetapi geometri rute jalan tidak tersedia. Untuk menyalakan OSRM lokal, pasang Docker lalu jalankan `./routing/start-local.sh` dari root proyek. Skrip mengunduh dan memproses peta Jakarta; proses awal memerlukan waktu dan ruang disk. Kamera kurir pada ponsel memerlukan HTTPS; `localhost` hanya berlaku pada perangkat pengembang. Kedua frontend menyediakan PWA, tetapi pemasangan di ponsel harus diuji lewat domain HTTPS.

n8n dan Telegram tidak dibutuhkan untuk checkout, AWB, pickup, run kurir, tracking, atau laporan pada web. Konfigurasi automasi ada di [integrations](integrations/README.md). Jangan menyalin kredensial atau database produksi ke repository.

## Verifikasi

Dari masing-masing folder frontend, jalankan `npm run build`. Untuk tes backend, buat database PostgreSQL terpisah bernama `satria_test`, lalu dari `backend` jalankan `php artisan test --compact tests/Feature/SatriaFlowTest.php`; tes memakai database tersebut dan dapat menghapus tabelnya. Dokumentasi produk tersedia di [docs](docs).
