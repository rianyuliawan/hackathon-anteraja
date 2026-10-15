# Kontrak Fashionaja ↔ Laravel

Fashionaja adalah katalog baju mandiri pada subdomain sendiri. Satu Laravel API/PostgreSQL menyimpan akun, produk, order, dan AWB. Katalog tidak menampilkan tracking atau menu logistik; nomor AWB hanya muncul di detail riwayat dan dapat disalin.

## Identitas dan endpoint

| Method/path | Akses | Hasil |
| --- | --- | --- |
| `GET /sanctum/csrf-cookie`, `POST /register`, `POST /login`, `POST /logout` | Publik/login | Sesi Laravel dan CSRF; register selalu `BUYER`, email unik. |
| `GET /api/v1/me`, `PATCH /api/v1/me` | Login | Profil dan alamat default. |
| `GET /api/v1/products`, `GET /api/v1/products/{id}` | Login | Produk Fashionaja aktif. |
| `POST /api/v1/orders` | Buyer | Checkout tanpa pembayaran, status `PENDING_APPROVAL`. |
| `GET /api/v1/me/orders`, `GET /api/v1/me/orders/{id}` | Buyer pemilik | Riwayat/detail, termasuk AWB nullable. |

`/api/v1` pada implementasi memerlukan sesi `web` + `auth`, sehingga bukan API publik tanpa login. Login akun yang sama berlaku pada Fashionaja dan Anteraja; sesi frontend dikelola per tab agar role berbeda dapat diuji pada tab terpisah.

## Checkout dan hasil

Browser mengirim `checkout_key` UUID, daftar `items` (`product_id`, `quantity`), dan `recipient` (`name`, `phone`, `address`, `postcode`; koordinat opsional). Backend mengambil toko, alamat pickup, harga, berat, dan dimensi produk dari database. Browser tidak menetapkan hub atau AWB. Nama/telepon/alamat disalin sebagai snapshot order. Nomor order baru berformat `INV-YYYYMMDD-XXXXXXXX`; AWB baru terbit setelah ops admin menyetujui.

Respons mengikuti pembungkus `data`. Checkout ulang dengan `checkout_key` yang sama dan payload yang sama mengembalikan order semula; payload berbeda menghasilkan konflik. Riwayat selalu dimuat ulang dari API sehingga tidak hilang saat browser di-refresh. `localStorage` hanya boleh dipakai untuk keadaan UI/keranjang, bukan sumber kebenaran order. Setelah ACC, order yang sama menampilkan AWB 14 digit berawalan `11` dan tombol salin. Fashionaja tidak memberi tautan langsung ke halaman tracking Anteraja.

## Pengujian minimum

1. Email yang sudah ada tidak dapat register lagi; registrasi tidak bisa memilih role staf.
2. Checkout tersimpan tanpa AWB dan tetap terlihat setelah refresh/login ulang.
3. Ops admin menyetujui, lalu riwayat menampilkan AWB pada order yang sama.
4. Pembeli lain tidak bisa membaca order tersebut.
5. Tidak ada pembayaran, tracking, atau informasi penugasan kurir dalam antarmuka katalog.
