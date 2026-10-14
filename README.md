# Satria — demo logistik Anteraja

Satria adalah proyek hackathon untuk mengelola pengiriman dari checkout katalog baju hingga paket diterima. Fokusnya adalah penugasan kurir, bukti foto pickup dan delivery, pelacakan AWB, serta penanganan gagal kirim dan penugasan ulang.

## Tech stack

- **Backend:** PHP 8.3+, Laravel 13, PostgreSQL 16.
- **Frontend tim:** React, TypeScript, Vite, PWA; katalog dan portal operasional terpisah.
- **Automasi opsional:** n8n dan adapter Telegram untuk notifikasi demo.

Kontribusi backend berada di [`backend`](backend). API menyediakan autentikasi berbasis sesi, katalog dan checkout, persetujuan order dan pembuatan AWB, proses hub dan kurir, tracking, bukti foto, serta integrasi notifikasi. Frontend mengakses API Laravel melalui proxy Vite.

## Menjalankan backend

Siapkan PostgreSQL dan database `satria`, lalu jalankan dari folder `backend`:

```bash
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
php artisan db:seed
php artisan serve --host=127.0.0.1 --port=8000
```

Sesuaikan `DB_*` di `.env` sebelum migration; [panduan backend](backend/README.md) menjelaskan pembuatan database PostgreSQL lokal. Cek API di `http://127.0.0.1:8000/`. Pengujian fitur: `php artisan test --compact tests/Feature/SatriaFlowTest.php` dengan database PostgreSQL khusus test. File `.env`, `vendor`, volume Docker, dan data runtime tidak perlu di-commit.

## Rute jalan lokal

Peta run memakai geometri jalan dari OSRM lokal, terpisah dari PostgreSQL lokal. Jalankan sekali dari root proyek:

```bash
./routing/start-local.sh
```

Skrip mengunduh ekstrak jalan Jakarta publik, memprosesnya di Docker, lalu membuka OSRM hanya pada `127.0.0.1:5000`. Berkas peta ada di `routing/data/` dan diabaikan Git. Jalankan kembali skrip yang sama setelah restart jika kontainer belum aktif. Hentikan dengan `docker stop anteraja-osrm`. Laravel memakai `OSRM_URL=http://127.0.0.1:5000` secara default; alamat tujuan pengiriman tidak dikirim ke router publik. Kamera kurir memerlukan HTTPS pada ponsel atau `localhost` pada mesin pengembang.
