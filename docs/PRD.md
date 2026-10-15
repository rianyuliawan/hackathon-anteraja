# PRD — Fashionaja dan Anteraja

**Kondisi produk per 15 Oktober 2026.** Fokus hackathon adalah pengantaran last mile: pembagian paket kepada kurir sesuai area, penolakan tugas, gagal kirim, pengembalian ke hub, pengiriman ulang pada AWB yang sama, dokumentasi riwayat, dan laporan harian. [Alur dan arsitektur](ALUR_DAN_ARSITEKTUR.md), [FRD](FRD.md), serta [ERD](ERD.md) menjabarkan implementasinya.

## Tujuan dan pengguna

| Pengguna | Kebutuhan |
| --- | --- |
| Pembeli/pelanggan | Berbelanja baju di Fashionaja, menerima AWB setelah pesanan diproses, lalu melacak AWB di Anteraja dan melihat bukti/riwayat pengiriman yang menjadi haknya. |
| Ops admin | Meninjau pesanan, menyetujui dan menerbitkan AWB, serta memantau ringkasan hub. |
| Operator hub | Menangani pickup dan kedatangan paket, menyusun run yang masuk akal, mengatur serah terima, menangani penolakan dan gagal kirim, serta membuat laporan harian. |
| Kurir pickup/delivery | Menerima tugas, mengambil foto lewat kamera, mengikuti urutan stop, dan mencatat hasil kunjungan. Kedua jenis pekerjaan menggunakan role kurir dengan cakupan layanan berbeda. |

Fashionaja merupakan katalog pihak ketiga secara tampilan dan domain, tetapi dalam proyek ini kedua frontend memakai **satu Laravel API dan satu PostgreSQL**. Hanya pembeli yang dapat mendaftar publik. Akun internal dibuat lewat proses internal/seed. Kedua frontend responsif dan dapat dipasang sebagai PWA; pengambilan foto kamera pada HP memerlukan HTTPS atau localhost.

## Hasil produk yang diharapkan

1. Checkout menyimpan order `PENDING_APPROVAL` tanpa AWB. Data profil pembeli, tujuan, asal toko, dan item dicatat sebagai snapshot agar riwayat tetap benar saat profil atau produk berubah.
2. Ops admin menyetujui pesanan. Sistem memvalidasi cakupan, memilih hub/zona tujuan, lalu membuat shipment dan AWB unik 14 digit berawalan `11`. Antarmuka ops admin saat ini berfokus pada persetujuan, tanpa tombol tolak.
3. Operator hub yang dipilih sistem menugaskan pickup. Kurir menerima dan memfoto paket lewat kamera, lalu hub mengonfirmasi kedatangan. Satu hub yang sama menangani pickup dan delivery shipment pada alur sekarang.
4. Operator hub memilih paket untuk satu run, melihat rekomendasi urutan berdasarkan jalan, usia paket, dan retry, serta memilih kurir yang sesuai area dan kapasitas. Kurir dapat menerima semuanya atau menolak paket tertentu dengan alasan. Setelah itu hub mengonfirmasi serah terima fisik.
5. Kurir mengikuti peta per stop. Keberhasilan membutuhkan nama penerima dan foto kamera; kegagalan membutuhkan alasan. Aplikasi menyimpan waktu, aktor, nomor percobaan, dan catatan.
6. Paket gagal harus dikembalikan secara fisik dan dikonfirmasi operator hub sebelum keputusan jadwal ulang/retur. Run berikutnya menggunakan AWB yang sama. Penolakan sebelum berangkat bukan percobaan pengantaran.
7. Pelanggan dapat mencari sampai 10 AWB, membuka kartu preview, lalu melihat halaman detail dengan jam WIB, kurir, alasan/catatan, foto sesuai izin, serta seluruh percobaan. Refresh atau tombol perbarui status memuat data terbaru pada AWB yang sama. Fashionaja hanya menampilkan pesanan dan AWB, tanpa tautan tracking.
8. Operator hub dapat menyegarkan dan mengunduh laporan harian XLSX. Ops admin dapat memantau ringkasan operasional. Riwayat audit tidak ditimpa.

## Integrasi dan batasannya

Laravel membuat event serta outbox notifikasi; n8n menangani pengiriman, pemulihan antrean, pengingat, dan laporan melalui adapter Telegram. Template pelanggan meliputi AWB terbit, mulai diantar, gagal kirim, jadwal ulang, dan terkirim; template internal meliputi penugasan dan kendala. Pelanggan baru dapat menyetujui notifikasi Telegram saat mendaftar atau di profil; bila nomor ponsel valid, pengiriman LIVE tidak memerlukan allowlist manual atau pairing. Akun dummy seed tetap MOCK. Nomor telepon bukan jaminan akun Telegram dapat dihubungi. Gagal mengirim pesan tidak membatalkan perubahan status paket.

Integrasi AWB resmi Anteraja, pembayaran, transit antarahub, pelacakan GPS langsung, optimasi rute global yang dijamin, dan jaminan Telegram mencapai setiap nomor berada di luar cakupan implementasi saat ini.

## Kriteria keberhasilan

Alur akhir ke akhir berhasil bila checkout bertahan setelah refresh; ops admin menerbitkan AWB; hub mengatur pickup, menerima paket, dan membuat run; kurir dapat menolak paket tertentu, lalu menjalani percobaan gagal dan berhasil setelah retur/jadwal ulang; pelanggan melihat riwayat kedua percobaan dan bukti yang tepat; laporan hub menghitung AWB dan attempt tanpa menggandakan paket. Hak akses berbeda tetap berlaku pada setiap API.
