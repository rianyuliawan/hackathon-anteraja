# Template deploy Anteraja dan Fashionaja

Folder ini berisi **template** Nginx dan systemd serta catatan deployment. Layak dimasukkan ke GitHub bersama kode dan docs. File di server yang berisi `.env`, password, token, sesi Telegram, private key, dump PostgreSQL, database n8n, dan foto privat **tidak** boleh masuk repo atau ZIP sumber.

## Topologi

| Komponen | Lokasi contoh |
| --- | --- |
| Fashionaja | `https://katalog-fashionaja.rianyuliawan.my.id` → `apps/catalog/dist` |
| Anteraja + API | `https://hackathon-anteraja.rianyuliawan.my.id` → `apps/ops/dist` dan Laravel |
| Laravel/PostgreSQL | VPS; database tidak dibuka langsung ke browser |
| OSRM, n8n, adapter Telegram | Service internal/localhost, tidak dibuka publik |
| Foto pickup/delivery | `backend/storage/app/private`, volume persisten |

Template `deploy/nginx` dan `deploy/systemd` harus disesuaikan dengan hostname, direktori, PHP-FPM, dan user service pada VPS target. Aktifkan HTTPS sebelum memasang PWA atau memakai kamera di Android. Bila memakai Cloudflare proxy, gunakan TLS **Full (strict)** dengan sertifikat origin valid.

## Persiapan

1. Siapkan DNS dua subdomain ke VPS, Nginx, PHP/Composer, Node, PostgreSQL, serta sertifikat HTTPS. Simpan `backend/.env` dan file `.env` adapter hanya pada server.
2. Buat database kosong, isi koneksi `DB_*`, `APP_KEY`, `APP_URL`, `OPS_PUBLIC_URL`, `CATALOG_PUBLIC_URL`, domain cookie/CSRF/CORS, token internal, dan password seed kuat. Jangan menaruh nilai rahasia di frontend `VITE_*`.
3. Jalankan `composer install --no-dev --optimize-autoloader`, `php artisan migrate --force`, lalu `php artisan db:seed --force` **hanya pada instalasi awal/dataset demo**. Seeder memuat akun Rian ops, Rian hub Cakung, dan Afrien kurir Cakung. Password awal bisa berbeda menurut `DEMO_ACCOUNT_PASSWORD` server; jangan simpan di repo.
4. Build katalog dengan `VITE_API_BASE_URL=https://hackathon-anteraja.rianyuliawan.my.id`. Build portal dengan `VITE_API_ORIGIN=` dan `VITE_CATALOG_URL=https://katalog-fashionaja.rianyuliawan.my.id`. Variabel Vite dibaca saat build.
5. Pasang template Nginx dan systemd yang sudah disesuaikan. Arahkan `/api/*`, `/sanctum/*`, `/login`, `/logout`, `/register`, dan `/up` portal ke Laravel; route SPA lain ke `index.html`. Jalankan pemeriksaan konfigurasi Nginx lalu reload.
6. Siapkan n8n dan adapter sebagai service privat. Mulai `TELEGRAM_MODE=MOCK`; setelah sesi admin/kurir, workflow, URL produksi, dan daftar email penerima benar, uji LIVE dengan akun penerima yang setuju. Nomor pelanggan yang tampak valid belum tentu dapat dihubungi Telegram.

## Pembaruan dan backup

Deploy dari commit Git **baru aman setelah semua source yang dipakai (kedua frontend, backend, integrations, docs, deploy) telah di-commit dan di-push**. Jika source masih hanya ada di ZIP/working tree, `git pull` pada VPS tidak akan memuatnya. Build ulang frontend setiap kali `VITE_*` berubah. Pada deploy berikutnya jalankan migration yang baru, tetapi **jangan reseed** database berisi data transaksi tanpa rencana reset.

Sebelum mengubah database, buat backup `pg_dump` privat. Backup juga `backend/storage/app/private`, konfigurasi rahasia, dan sesi adapter. Jangan commit atau menyisipkan backup tersebut ke ZIP. Setelah deploy, uji `/up`, login tiap role, checkout→AWB, pickup kamera, delivery, tracking, dan pemasangan PWA pada Android.
