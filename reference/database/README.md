# PostgreSQL schema Satria

[schema.sql](schema.sql) adalah rancangan database baru yang mengikuti [ERD](../docs/ERD.md) dan alur katalog React/web utama React → Laravel → PostgreSQL, dengan n8n untuk orkestrasi pesan. [seed.sql](seed.sql) adalah fixture dummy kecil untuk schema ini. File tidak menghapus tabel. Jalankan pada database kosong; saat aplikasi Laravel dibangun, pindahkan struktur ini ke migration Laravel dan seed ke DatabaseSeeder. Laravel menjadi satu-satunya komponen yang menulis data operasional.

```bash
createdb satria_demo
psql -v ON_ERROR_STOP=1 -d satria_demo -f database/schema.sql
psql -v ON_ERROR_STOP=1 -d satria_demo -f database/seed.sql
psql -v ON_ERROR_STOP=1 -d satria_demo -f database/verify_seed.sql
```

Seed dapat dijalankan ulang tanpa menambah baris duplikat untuk data contoh. Ia memakai identity default PostgreSQL, sehingga `fix_sequences.sql` dari dataset teman **tidak diperlukan**. Jangan menjalankan schema/seed teman dari folder Downloads pada database ini karena struktur tabelnya berbeda. Password dummy dan daftar akun ada pada [runbook](../docs/DEMO_RUNBOOK.md). Jangan jalankan seed ini pada database berisi akun nyata.

## Peta tabel

- Identitas dan master: users, user_roles, hubs, service_zones, postal_coverages, hub_links, seller_profiles, seller_locations, products, courier_profiles, courier_zones.
- Belanja dan perjalanan: orders, order_items, shipments, parcels, route_plans, route_stops.
- Tugas dan hasil: pickup_tasks, pickup_assignments, delivery_runs, run_shipments, delivery_attempts, shipment_issues, tracking_events.
- Otomasi/kontak: notification_targets, notifications, telegram_pairing_requests, telegram_links, daily_reports.

Order PENDING_APPROVAL **sudah tersimpan dalam orders/order_items di PostgreSQL**, tetapi belum memiliki shipment/AWB. Approval membuat satu shipment/AWB, route plan satu stop di hub pengantaran terpilih, parcel, pickup task, dan tracking event dalam satu transaksi. Beberapa hub dummy dapat ada, tetapi satu AWB demo hanya mengunjungi satu hub. Kolom checkout_key dan order_id UNIQUE mencegah checkout/approval ganda. Kolom dedupe_key UNIQUE pada notifications mencegah log ganda. delivery_attempts dan tracking_events dijaga append-only dengan trigger. `localStorage` katalog hanya untuk keranjang/kunci retry, bukan basis data order.

`users.default_address`/`default_postcode` menyimpan alamat profil buyer; `orders` menyimpan snapshot tujuan per checkout. `pickup_assignments.pickup_photo_ref` wajib ketika status COMPLETED dan `delivery_attempts.delivery_photo_ref` wajib saat hasil DELIVERED. **Kurir pemilik tugas** adalah aktor upload; operator hub hanya melakukan scan fisik. Kolom foto menyimpan kunci file privat; file gambar ada pada disk privat persisten/storage objek Laravel. Laravel memvalidasi tipe dan ukuran file serta pemeriksaan izin sebelum mengembalikan foto. Hasil FAILED boleh mempunyai foto opsional pada kolom yang sama. `telegram_pairing_requests` dan `telegram_links` memisahkan nomor HP paket dari peer Telegram yang sudah diverifikasi/disetujui. Seed tidak mengisi peer atau foto palsu. `notifications.delivery_mode=MOCK` berakhir `SIMULATED`, sedangkan `SENT` hanya sah pada mode LIVE setelah pengiriman nyata melalui adapter Telegram pribadi dikonfirmasi dan ID pesan ada.

Koordinat hub dan tujuan order bersifat opsional untuk fitur P1 saran urutan antar. Katalog tidak mengirim koordinat yang dipercaya; Laravel dapat mengisinya dari geocoding atau seed alamat demo setelah validasi. Tanpa koordinat/matriks perjalanan, UI tidak mengklaim urutan tercepat.

Model Eloquent perlu mengatur nama tabel/primary key yang sesuai dan mematikan timestamp otomatis pada tabel yang tidak memiliki pasangan created_at/updated_at; tabel inti users, orders, dan shipments memakai keduanya. Password users adalah hash sesuai mekanisme autentikasi Laravel. Aturan lintas tabel yang tidak diekspresikan oleh foreign key, seperti order item harus milik seller order, kurir harus cocok zona/kapasitas, dan transisi custody, dijalankan dalam service Laravel.

## Hubungan dengan paket dataset teman

File schema.sql dan seed.sql pada folder satria-day1 di Downloads memakai model lain. **Seed itu tidak dapat langsung dijalankan di schema baru ini.** Untuk memanfaatkan data latar, buat proses transformasi:

1. hubs dan coverage_areas lama → hubs, service_zones, postal_coverages. Tentukan zona pickup/antar untuk setiap kode pos.
2. users lama → users dan user_roles; Satria → courier_profiles/courier_zones; hub admin → user_roles dengan hub_id.
3. sellers lama → satu akun toko baju contoh, seller_profiles, seller_locations; products lama dapat diganti seed beberapa baju. Isi dimensi produk dari data dummy yang disetujui tim karena dataset lama hanya memiliki berat.
4. orders/order_items lama → orders/order_items dengan checkout_key dan status yang masuk akal. Untuk data histori yang telah dikirim, status APPROVED dan shipment dapat dimigrasikan bersama.
5. shipments lama → shipments/parcels/route_plans/route_stops. Untuk demo, pilih hub pengantaran dari cakupan alamat penerima dan isi satu stop di hub itu. Hub koordinator pickup boleh berbeda tanpa menjadi stop fisik. Transit data lama tidak diperlukan.
6. shipment_tasks/delivery_attempts/events/issues/notifications lama → pickup_assignments, delivery_runs/run_shipments, delivery_attempts, tracking_events, shipment_issues, notification_targets/notifications. Karena struktur penugasan berbeda, data ini perlu mapping dan audit waktu/status, bukan sekadar ganti nama kolom.

Untuk live demo, [seed.sql](seed.sql) menyiapkan satu toko baju, empat produk, tiga hub/zona/alamat contoh DKI, buyer/ops admin/operator/kurir dummy, satu order pending, dan satu AWB siap pickup. Checkout baru, foto pickup, gagal antar, scan retur, dan foto delivery dibuat lewat aplikasi saat demo agar jejak peristiwa nyata. Integrasi Telegram demo memakai tiga akun pribadi uji yang benar-benar dapat menerima pesan; jangan memakai nomor dummy sebagai peer Telegram. Dataset besar lama dapat ditambahkan setelah alur kecil ini berjalan. `hub_links` dan banyak route stop disediakan untuk ekspansi, bukan UI transit MVP.
