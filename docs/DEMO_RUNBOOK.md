# Runbook uji akhir ke akhir

Gunakan data seed hanya pada database demo/baru. Jalankan migration dan seed dari `backend`, lalu buka Fashionaja dan Anteraja pada dua browser/tab. Rangkaian inti tetap bisa diuji tanpa n8n; mode Telegram MOCK tidak mengirim chat nyata. Lihat [panduan backend](../backend/README.md) untuk lingkungan VPS dan [N8N_WORKFLOWS.md](N8N_WORKFLOWS.md) untuk LIVE.

## Akun dan data awal

| Akun | Role/kegunaan |
| --- | --- |
| `rianyuliawan@anteraja.id` | Ops admin. |
| `rianyuliawan1@anteraja.id` | Operator hub Cakung. |
| `afrien@anteraja.id` | Kurir delivery Cakung, memiliki run contoh menunggu respons. |
| `siti.nurhaliza@anteraja.id` | Buyer seed untuk melihat katalog/riwayat contoh. |
| `hanif.saputra@anteraja.id` | Kurir delivery cadangan Cakung untuk run baru bila tersedia pada seed. |

Seed menyediakan beberapa hub Jakarta, zona, kurir pickup/delivery, shipment berbagai status, foto historis, dan laporan harian Cakung. Contoh AWB Cakung: `11007182634955` (alur pickup) dan `11007182634956` (siap di hub); data run tambahan terdapat pada seeder. Untuk alur checkout nyata, buat order baru di UI Fashionaja. Akun pelanggan `mkevin@gmail.com` yang pernah dipakai saat uji tidak diasumsikan selalu ada setelah reseed database baru; daftarkan lagi jika diperlukan.

**Password:** lokal default `anteraja123` jika `DEMO_ACCOUNT_PASSWORD` tidak diubah. VPS dapat memakai password seed berbeda yang disimpan privat pada server; jangan tulis password itu di repo/ZIP. Jangan mengandalkan nomor telepon seed sebagai penerima Telegram nyata.

## Skenario dari checkout sampai retry

1. Buyer login Fashionaja, checkout produk. Pastikan order `PENDING_APPROVAL` tanpa AWB tetap muncul setelah refresh.
2. Ops admin di Anteraja melihat badge antrean, membuka pesanan dan menekan **Setujui & terbitkan resi**. Cek AWB baru di riwayat Fashionaja dan salin nomor tersebut.
3. Operator hub yang dipilih otomatis melihat pickup task. Pilih kurir pickup yang sesuai; kurir membuka tugas dan menerimanya.
4. Kurir pickup memotret paket **langsung melalui kamera**, mengirim AWB/foto, lalu operator hub mengonfirmasi paket telah tiba. Foto/waktu/tempat muncul pada detail tracking buyer pemilik order.
5. Operator hub membuka paket siap antar, memilih beberapa paket satu zona, meninjau usia paket, prioritas, saran urutan, dan kurir tersedia. Buat run. Kurir menerima semua atau merespons per paket; penolakan membutuhkan alasan dan kembali terlihat di hub.
6. Hub mengonfirmasi serah terima paket yang diterima. Kurir mulai antar; peta menunjukkan hub→stop 1. Setelah tiap hasil, segmen berikutnya dimulai dari stop sebelumnya.
7. Pada satu stop, catat `FAILED` dengan alasan penerima tidak ada. Cek attempt #1 dan kendala pada hub. Paket masih di kurir sampai operator mengonfirmasi retur fisik.
8. Operator hub memutuskan jadwal ulang, berkomunikasi dengan pelanggan bila perlu, lalu membuat run baru pada **AWB yang sama**. Kurir menerima dan melakukan kunjungan kedua.
9. Pada stop kedua, isi nama penerima dan foto kamera. Cek attempt #2 `DELIVERED`, timeline pelanggan, bukti delivery, dan laporan XLSX hub. Attempt pertama harus tetap terbaca.

## Telegram dan keamanan uji

LIVE hanya untuk email dalam `TELEGRAM_LIVE_RECIPIENT_EMAILS` dengan nomor/peer valid, dan hanya bila n8n serta adapter aktif. Uji satu pesan internal lalu satu pesan ke pelanggan nyata yang setuju menerima; cek ledger notifikasi `SENT`/`FAILED`. Nomor dummy tetap MOCK. Foto baru tidak boleh dipilih dari galeri pada UI kurir; HTTPS dan izin kamera diperlukan di HP. Kurir/hub lain tidak boleh menulis pada paket yang bukan haknya. Jika pesan Telegram gagal, status paket dan tracking tetap berjalan.
