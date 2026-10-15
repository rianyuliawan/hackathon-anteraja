# Status implementasi dan pekerjaan tim

Dokumen ini menggantikan rencana build awal yang sudah tidak mencerminkan proyek. Lihat [PRD](PRD.md), [FRD](FRD.md), dan [runbook uji](DEMO_RUNBOOK.md) untuk ruang lingkup saat ini.

| Area | Implementasi saat ini | Pemilik integrasi yang perlu koordinasi |
| --- | --- | --- |
| Fashionaja | React PWA, auth buyer, produk, checkout tanpa pembayaran, riwayat, salin AWB. | Tim frontend katalog dan backend memastikan kontrak order tetap sinkron. |
| Anteraja pelanggan | Pencarian hingga 10 AWB, pratinjau, halaman detail, timeline, foto sesuai izin, konfirmasi. | Tim frontend ops dan backend menjaga privasi data tracking. |
| Ops admin | ACC/order, AWB, ringkasan/laporan. | Backend menjaga pemilihan hub dan idempotensi approval. |
| Hub operator | Pickup assignment, konfirmasi tiba/retur, run last mile, kendala, reschedule, laporan XLSX. | Tim hub/kurir menguji handover dan hak akses zona. |
| Kurir | Pickup kamera, terima/tolak per paket, peta stop, delivery sukses/gagal, riwayat. | Uji pada HP HTTPS dengan izin kamera. |
| Otomasi | Outbox Laravel, workflow n8n, adapter MTProto admin/kurir, MOCK/LIVE. | Uji LIVE internal dan pelanggan nyata secara terpisah; jangan menganggap setiap nomor dapat menerima Telegram. |
| Deploy | Dua subdomain, satu Laravel/PostgreSQL, template Nginx/systemd, PWA. | Saat GitHub sudah memuat seluruh source, deploy dari commit yang sama dan backup DB/storage. |

## Gerbang verifikasi sebelum presentasi

1. Jalankan alur checkout→AWB→pickup foto→hub→run→gagal→retur→jadwal ulang→berhasil pada AWB yang sama.
2. Cek penolakan satu paket kembali ke hub tanpa delivery attempt; kurir zona lain tidak dapat mengambil tugas.
3. Cek refresh dan dua tab role berbeda tidak saling mengubah sesi; tracking detail langsung dari link kembali ke AWB yang benar sesudah login.
4. Cek bukti foto dan XLSX harian; upload foto baru memerlukan kamera, bukan galeri.
5. Jika menampilkan Telegram LIVE, pastikan hanya penerima yang disetujui, adapter sender benar, link produksi benar, dan `SENT` disertai ID provider.
6. Pastikan ZIP/Git tidak berisi `.env`, sesi Telegram, storage foto privat, dump DB, atau data n8n. Dokumentasi dan template `deploy/` dapat ikut di-commit.
