# Satria Laravel API

Lihat [README proyek](../README.md) untuk ringkasan dan cara menjalankan. Backend memakai Laravel 13, PHP 8.3+, dan PostgreSQL 16. Migration `create_satria_schema` menerapkan SQL di `database/satria-schema.sql`; `DatabaseSeeder` menjalankan `database/satria-seed.sql`.

Endpoint `/api/v1` ada di `routes/api.php`. Route untuk buyer dan petugas memakai middleware `web` dan `auth` agar cookie sesi serta CSRF tetap berlaku; tracking publik dan integrasi internal bersifat stateless. Login, registrasi, logout, dan `/sanctum/csrf-cookie` tetap ada di `routes/web.php`. Endpoint CSRF tersebut disediakan untuk kompatibilitas frontend; paket Sanctum tidak terpasang. Route internal memakai Bearer `SATRIA_INTERNAL_TOKEN`. Semua foto berada di disk `local` privat.

Pada mesin baru, instal PostgreSQL lalu buat role dan database kosong. Jalankan SQL berikut sebagai administrator PostgreSQL (misalnya lewat `sudo -u postgres psql` di Ubuntu):

```sql
CREATE ROLE satria LOGIN PASSWORD 'satria_local';
CREATE DATABASE satria OWNER satria;
```

Password di atas hanya contoh untuk pengembangan lokal. Dari folder `backend`, jalankan:

```bash
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
php artisan db:seed
php artisan serve --host=127.0.0.1 --port=8000
```

Pastikan ekstensi PHP `pdo_pgsql` aktif dan `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, serta `DB_PASSWORD` di `.env` cocok dengan PostgreSQL mesin tersebut. Docker tidak wajib. Migration membaca `database/satria-schema.sql`, lalu seeder membaca `database/satria-seed.sql`; keduanya sudah ada di repository. Seed mengisi akun dan paket **dummy**, bukan data pesanan pribadi dari mesin pengembang. Jalankan seed setelah migration; untuk database demo yang sudah berisi data, jangan gunakan `migrate:fresh`.

Pengujian fitur bisnis memerlukan database PostgreSQL khusus test. Set `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, dan `DB_PASSWORD` ke database test, lalu jalankan `php artisan test --compact tests/Feature/SatriaFlowTest.php`. Test melakukan migration/rollback dan akan menghapus tabel test.
