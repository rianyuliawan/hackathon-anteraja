# PRD — Fashionaja dan Anteraja

**Status:** menggambarkan implementasi proyek saat ini (15 Oktober 2026). Kasus utama hackathon adalah penugasan kurir last mile, gagal kirim, pengembalian ke hub, pengiriman ulang dengan AWB yang sama, riwayat percobaan, dan laporan. Katalog dan pickup melengkapi alur dari pesanan hingga paket siap diantar. Rincian perilaku ada di [FRD](FRD.md) dan [alur bisnis](ALUR_DAN_ARSITEKTUR.md).

## Produk dan pengguna

- **Fashionaja** adalah aplikasi katalog baju tersendiri. Pembeli mendaftar, login, memilih produk, checkout tanpa pembayaran, melihat riwayat pesanan, dan menyalin AWB setelah terbit. Antarmukanya tidak menyajikan pelacakan logistik.
- **Anteraja** adalah aplikasi kedua untuk pelanggan melacak AWB, ops admin menyetujui pesanan, operator hub mengelola paket/kurir, dan kurir menangani pickup serta delivery. Kedua frontend memakai satu Laravel API dan PostgreSQL; Fashionaja tidak memiliki database terpisah.
- Hanya pelanggan (`BUYER`) dapat mendaftar publik. Akun `OPS_ADMIN`, `HUB_OPERATOR`, dan `COURIER` disiapkan melalui seed atau dibuat internal. Login mengarahkan ke halaman sesuai role; server tetap memeriksa hak akses pada setiap permintaan.
- Kedua frontend responsif dan dapat dipasang sebagai PWA pada browser/perangkat yang mendukung instalasi. Kamera kurir pada HP membutuhkan HTTPS atau localhost.

## Alur bisnis inti

1. Checkout membuat order `PENDING_APPROVAL` tanpa AWB. Nama, telepon, alamat, produk, dan harga tersimpan sebagai snapshot. Idempotensi `checkout_key` mencegah duplikasi ketika permintaan diulang.
2. Ops admin meninjau dan **menyetujui** order, mengonfirmasi berat/dimensi. Sistem memilih hub dan zona dari cakupan kode pos tujuan, menerbitkan AWB internal unik 14 digit berawalan `11`, lalu membuat shipment dan tugas pickup. Antarmuka ops admin saat ini tidak memiliki aksi tolak. Order tanpa cakupan tidak bisa disetujui.
3. Hub yang terpilih mengatur kurir pickup. Kurir menerima tugas, mengambil paket di toko, dan mengambil **foto baru melalui kamera**. Operator hub mengonfirmasi paket yang tiba; selama MVP satu shipment hanya melewati hub penanganan itu, tanpa transit antarahub. Hub yang sama menjadi hub pickup dan delivery pada data operasional.
4. Operator hub memilih paket siap antar yang cocok dengan zona dan kapasitas kurir. Pratinjau run memberi saran urutan berdasarkan jalan bila layanan rute tersedia, serta usia paket dan prioritas retry. Operator menentukan kurir, urutan, dan jadwal. Kurir dapat menerima semua paket atau menerima/menolak per paket dengan alasan. Penolakan sebelum berangkat tidak membuat delivery attempt.
5. Setelah kurir menerima, operator mengonfirmasi serah terima. Kurir menekan mulai, mengikuti peta per stop, lalu untuk setiap paket mencatat penerima dan foto kamera bila berhasil, atau alasan bila gagal. Peta adalah panduan rute; aplikasi tidak melacak posisi GPS kurir secara langsung.
6. Paket gagal tetap dalam custody kurir sampai operator hub mengonfirmasi pengembalian fisik. **Operator hub** memutuskan jadwal ulang atau return, lalu dapat membuat run baru pada **AWB yang sama**. Setiap hasil kunjungan tersimpan sebagai attempt baru; riwayat sebelumnya tidak ditimpa. Pelanggan dapat melihat timeline, bukti foto yang diizinkan, dan mengonfirmasi penerimaan atau jadwal ulang sesuai status.
7. Operator hub dapat melihat riwayat dan mengekspor laporan harian XLSX; ops admin memantau pesanan/resi dan ringkasan operasional.

## Notifikasi dan batasannya

Laravel membuat event dan outbox notifikasi setelah perubahan status. n8n mengorkestrasi pengiriman lewat adapter akun Telegram pribadi. Template pelanggan dibatasi pada AWB terbit, mulai diantar, gagal kirim, jadwal ulang, dan terkirim. Template kurir mencakup penugasan/pengingat; operator hub menerima kendala dan laporan. Nomor telepon pelanggan dapat dicoba sebagai tujuan LIVE **hanya** bila mode LIVE, email masuk allowlist, dan nomor/peer memenuhi syarat. Pairing API tersedia tetapi tidak wajib untuk alur nomor pelanggan. Telegram dapat menolak tujuan karena privasi atau akun tidak ada; statusnya harus `FAILED`, sedangkan mode pengembangan dicatat `SIMULATED`. Keberhasilan alur paket tidak bergantung pada keberhasilan pesan.

## Ukuran keberhasilan dan batas MVP

Satu demonstrasi berhasil bila checkout tetap ada setelah refresh; AWB muncul setelah persetujuan; hub mengatur pickup dan mengonfirmasi kedatangan; kurir menerima run, gagal pada attempt pertama, mengembalikan paket, lalu berhasil pada attempt kedua dengan foto; pelanggan melihat riwayat yang utuh; dan laporan harian menghitung paket serta attempt tanpa menggandakan AWB. Penolakan per paket dan pembatasan area kurir harus terlihat. Integrasi AWB resmi, pembayaran, transit antarahub, lalu lintas waktu nyata, serta jaminan pengiriman Telegram ke setiap nomor berada di luar implementasi ini.
