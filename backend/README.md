# Satria Laravel API

Lihat [README proyek](../README.md) untuk ringkasan dan cara menjalankan. Backend memakai Laravel 13, PHP 8.3+, dan PostgreSQL 16. Migration `create_satria_schema` menerapkan SQL di `database/satria-schema.sql`; `DatabaseSeeder` menjalankan `database/satria-seed.sql`.

Endpoint `/api/v1` ada di `routes/api.php`. Route untuk buyer dan petugas memakai middleware `web` dan `auth` agar cookie sesi serta CSRF tetap berlaku; pelacakan resi juga meminta login, sedangkan integrasi internal memakai token layanan. Login, registrasi, logout, dan `/sanctum/csrf-cookie` tetap ada di `routes/web.php`. Endpoint CSRF tersebut disediakan untuk kompatibilitas frontend; paket Sanctum tidak terpasang. Route internal memakai Bearer `SATRIA_INTERNAL_TOKEN`. Semua foto berada di disk `local` privat.

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

Pastikan ekstensi PHP `pdo_pgsql` aktif dan `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, serta `DB_PASSWORD` di `.env` cocok dengan PostgreSQL mesin tersebut. Docker tidak wajib. Migration membaca `database/satria-schema.sql`, lalu seeder membaca `database/satria-seed.sql`; keduanya sudah ada di repository. Seed mengisi akun dan paket **dummy**, bukan data pesanan pribadi dari mesin pengembang. Fixture Jakarta berisi 10 hub, 11 kurir pickup, dan 34 kurir delivery (tiga per hub). Seeder run menyediakan 17 paket tambahan per hub: lima siap ditugaskan, empat pada run menunggu penerimaan, empat pada run aktif, dan empat pada run selesai. Total tambahan adalah 170 paket dan 30 run. Setiap paket tersebut memiliki riwayat AWB, tugas pickup yang diterima, foto pickup, transit, dan scan tiba di hub sebelum masuk run. Paket gagal kirim baru muncul setelah kurir memulai run. Data lama Cakung yang belum memiliki tahap pickup dilengkapi secara aman; paket yang sudah berubah lewat aplikasi dilewati. Semua akun contoh memakai kata sandi `anteraja123`; contoh login ops admin: `rianyuliawan@anteraja.id`, operator hub Cakung: `rianyuliawan1@anteraja.id`, kurir antar Cakung yang menunggu run: `andika.wijaya@anteraja.id`, kurir dengan run aktif: `galih.pratama@anteraja.id`, kurir cadangan untuk assignment baru: `hanif.saputra@anteraja.id`, kurir pickup: `bagus.setiawan@anteraja.id`, pembeli: `siti.nurhaliza@anteraja.id`. Daftar akun dasar ada di `database/satria-seed.sql`; kurir cadangan ada di `database/seeders/DemoCourierSeeder.php`. Nomor AWB demo berbentuk 14 digit diawali `11`, meniru tampilan contoh tanpa terhubung ke penerbit resi Anteraja.

Foto pickup contoh disimpan sebagai `database/assets/pickup-demo.jpg` dan dipasang otomatis saat kurir pickup mengonfirmasi tugas; fixture last-mile juga memakainya. File yang diberikan bernama `.webp`, tetapi isi berkasnya JPEG, sehingga aset proyek memakai ekstensi `.jpg`. Run historis yang sudah terkirim memakai `database/assets/delivery-demo.png` sebagai bukti foto demo. Untuk pengantaran baru, kurir membuka kamera langsung dari form hasil antar, mengambil foto saat itu juga, dan dapat mengambil ulang. Galeri/unggah berkas tidak tersedia pada UI; API menolak waktu pengambilan foto yang lebih lama dari lima menit. Kamera browser memerlukan HTTPS pada ponsel atau localhost saat pengembangan. Jalankan seed setelah migration; untuk database demo yang sudah berisi data transaksi nyata, jangan gunakan `migrate:fresh`.

## Akun dan AWB untuk demo Cakung

Semua akun di bawah memakai kata sandi `anteraja123`.

| Peran | Akun | Yang dapat dilihat |
| --- | --- | --- |
| Ops admin | `rianyuliawan@anteraja.id` | ACC pesanan, AWB, seluruh hub, kendala dan keputusan antar ulang |
| Operator hub Cakung | `rianyuliawan1@anteraja.id` | Antrean Cakung, pratinjau rute, assignment dan serah terima run |
| Kurir run menunggu | `afrien@anteraja.id` | Empat paket yang perlu diterima sebagai satu run |
| Kurir run aktif | `galih.pratama@anteraja.id` | Empat stop aktif; salah satunya sudah tercatat gagal dan masih perlu scan retur |
| Kurir cadangan Cakung | `hanif.saputra@anteraja.id` | Kosong, tersedia untuk membuat run baru dari antrean siap antar |
| Kurir pickup | `bagus.setiawan@anteraja.id` | Alur pickup dari toko; fitur penunjang |
| Pembeli | `siti.nurhaliza@anteraja.id` | Tracking paket miliknya dan riwayat di Fashionaja |

Contoh AWB Cakung: `11902600000301` siap ditugaskan, `11902600000306` berada di run menunggu kurir, `11902600000310` berada di run aktif, dan `11902600000313` gagal kirim dan masih di tangan kurir, `11902600000314` menunggu antar ulang, `11902600000315` menunggu keputusan ops, sedangkan `11902600000316` dan `11902600000317` sudah terkirim dengan bukti foto demo. AWB tetap 14 digit dan tidak berubah pada percobaan ulang. Data ini relatif terhadap waktu seeding; status bisa berubah setelah dipakai untuk demo.

Untuk menambah data baru ke database lokal yang sudah dipakai, jalankan `php artisan db:seed --force`. Seeder ini tidak menghapus pesanan yang sudah ada. Dua frontend memakai cookie sesi yang berbeda per tab, sehingga login admin tidak mengganti login pembeli. Saat berpindah dari versi lama aplikasi, masuk ulang sekali pada tiap frontend. Gunakan hostname yang konsisten pada satu tab (`localhost` atau `127.0.0.1`), karena browser memisahkan cookie keduanya.


### Akun Cakung untuk VPS

`DatabaseSeeder` selalu memanggil `CakungHackathonSeeder`. Pada database baru, seed membuat `rianyuliawan@anteraja.id` (ops admin), `rianyuliawan1@anteraja.id` (operator Hub Cakung), dan `afrien@anteraja.id` (kurir antar Cakung). Ketiganya memakai password awal lokal `anteraja123`. Pada database VPS baru, isi `DEMO_ACCOUNT_PASSWORD` dengan password kuat sebelum seed; seluruh akun staf contoh memakai nilai tersebut. Run menunggu penerimaan yang berisi AWB `11902600000306` sampai `11902600000309` dialihkan ke Afrien. Seed mengisi laporan Hub Cakung untuk hari ini dan tiga hari sebelumnya serta dapat dijalankan ulang tanpa menggandakan akun atau run. Akun yang sudah ada tidak ditimpa password atau nomor teleponnya.

Sebelum seed pertama di VPS, isi `DEMO_OPS_PHONE`, `DEMO_HUB_PHONE`, dan `DEMO_COURIER_PHONE` pada `backend/.env`. Nomor asli hanya berada di file `.env` server. Jika akun sudah terlanjur dibuat tanpa nomor, isi nomor melalui administrasi database atau profil akun; menjalankan ulang seeder tidak menimpa data akun tersebut. `TELEGRAM_LIVE_RECIPIENT_EMAILS` digunakan untuk akun staf dan akun pelanggan lama yang sudah dikonfirmasi. Pelanggan yang baru mendaftar dengan nomor ponsel valid dan menyetujui notifikasi Telegram otomatis memenuhi syarat LIVE tanpa mengubah `.env`; data dummy seed tetap MOCK.

## Alur operasional yang dapat dicoba

1. **Ops admin** memeriksa pesanan, melihat hub tujuan yang dipilih dari cakupan kode pos/koordinat, lalu ACC untuk menerbitkan AWB. Hub tujuan menerima paket baru untuk ditugaskan ke kurir pickup sesuai zona toko.
2. **Kurir pickup** menerima tugas. Setelah diterima dan paket diambil, status serta foto pickup contoh tercatat. Foto pickup dan waktu pengambilan tersimpan di riwayat paket.
3. **Operator hub tujuan** mengonfirmasi kedatangan fisik melalui tombol pada antrean. Pada **Run pengantaran**, ia memilih beberapa AWB dalam satu zona dan kurir yang melayani zona itu. Urutan stop disarankan dari kedekatan titik, umur paket, dan riwayat gagal kirim. Garis pada peta memakai rute jalan OSRM lokal dan jarak yang ditampilkan berasal dari jalur jalan. Ambang 24/48 jam hanya indikator prioritas demo, bukan SLA resmi.
4. **Kurir antar** menerima atau menolak run. Jika diterima, operator hub memindai semua AWB saat serah terima. Kurir kemudian menekan **Mulai antar**, mengikuti urutan stop, dan mencatat hasil tiap paket. Foto penerimaan wajib saat berhasil.
5. **Gagal kirim** menyimpan alasan serta attempt dan muncul pada admin/hub. Kurir membawa paket kembali untuk scan retur; ops admin menghubungi penerima bila perlu dan memutuskan jadwal ulang atau retur. Pengantaran ulang membentuk run baru dengan **AWB yang sama**; attempt lama tetap ada. Pelanggan dapat melihat perubahan status melalui tracking.

Setiap operator hub membuka **Laporan harian** untuk hubnya sendiri, memilih tanggal, lalu menekan **Perbarui**. Ops admin melihat ringkasan semua hub di menu **Laporan**. Tombol **Unduh XLSX** menghasilkan file per hub dengan sheet Ringkasan, Aktivitas, dan Percobaan; permintaan dibatasi sesuai role dan hub. Perhitungan laporan juga tersedia melalui endpoint internal yang dipanggil workflow n8n `integrations/n8n/workflows/daily-report.json` setiap pukul 17.00 WIB setelah workflow diimpor dan diaktifkan. Panduan hackathon mewajibkan ringkasan harian kepada admin, tetapi tidak menetapkan format file; XLSX adalah pilihan implementasi proyek ini.

Perubahan status membuat event tracking. Telegram dibatasi pada AWB terbit, penugasan run baru, mulai pengantaran, dan usulan jadwal ulang; status lain tetap terlihat pada aplikasi tanpa chat tambahan. Mode LIVE baru diaktifkan setelah adapter dan n8n tersedia di VPS. Peta memakai Leaflet/OpenStreetMap dan geometri jalan dari OSRM lokal (`./routing/start-local.sh`). Urutan stop masih heuristik kedekatan titik dan prioritas umur paket; perkiraan waktu OSRM tidak memuat lalu lintas langsung. Bila OSRM tidak tersedia, peta menampilkan titik dan pesan untuk mencoba lagi tanpa menggambar garis lurus.

Pengujian fitur bisnis memerlukan database PostgreSQL khusus test. Buat database `satria_test` terpisah, lalu set `DB_HOST`, `DB_PORT`, `DB_USERNAME`, dan `DB_PASSWORD` sesuai database test. `phpunit.xml` mengunci `DB_DATABASE=satria_test` agar database aplikasi lokal tidak terhapus. Setelah itu jalankan `php artisan test --compact tests/Feature/SatriaFlowTest.php`. Test melakukan migration/rollback dan akan menghapus tabel test.
