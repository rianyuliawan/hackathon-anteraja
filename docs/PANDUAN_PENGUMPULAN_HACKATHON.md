# Panduan pengumpulan Hackathon Anteraja

Dokumen ini memetakan tiga komponen yang diminta panitia ke aplikasi dan berkas proyek. Periksa kembali URL dan akses akun sebelum mengisi formulir akhir. Jangan menaruh password, token Telegram, `.env`, atau data pribadi peserta di repositori publik.

## Jawaban yang dapat disalin ke formulir

| Kolom pengumpulan | Isi |
| --- | --- |
| Repository GitHub | https://github.com/rianyuliawan/hackathon-anteraja |
| App pembeli (hybrid/PWA) | https://katalog-fashionaja.rianyuliawan.my.id |
| App kurir (hybrid/PWA) | https://hackathon-anteraja.rianyuliawan.my.id/masuk — masuk dengan akun kurir; aplikasi dapat dipasang dari Chrome Android. |
| Dashboard admin | https://hackathon-anteraja.rianyuliawan.my.id/masuk — akun ops admin membuka persetujuan pesanan dan AWB; akun operator hub membuka penjemputan, pengantaran, kendala, dan laporan harian. |
| Workflow automasi | https://github.com/rianyuliawan/hackathon-anteraja/tree/main/integrations/n8n/workflows — empat file JSON yang dapat diimpor ke n8n. |
| Auto report dan log history | Dashboard operator hub: https://hackathon-anteraja.rianyuliawan.my.id/hub-reports (login diperlukan). Penjelasan: https://github.com/rianyuliawan/hackathon-anteraja/blob/main/docs/N8N_WORKFLOWS.md dan https://github.com/rianyuliawan/hackathon-anteraja/blob/main/docs/DEMO_RUNBOOK.md. |

**Catatan untuk kolom “App Pembeli & Kurir”:** dua aplikasi memang dipisahkan. Fashionaja adalah toko pihak ketiga tempat pembeli checkout; portal Anteraja menampung kurir, pelanggan untuk lacak AWB, serta admin. Keduanya web responsif yang dapat dipasang sebagai PWA pada Android. Katalog dan portal memakai API serta database yang sama.

## Apa yang ditunjukkan saat penilaian

1. **Pembeli:** login Fashionaja → checkout → pesanan muncul di riwayat → setelah disetujui ops admin, AWB muncul. Salin AWB dan gunakan di portal Anteraja untuk melihat status.
2. **Ops admin:** lihat pesanan masuk → setujui dan terbitkan AWB → hub tujuan dipilih oleh sistem.
3. **Operator hub:** tugaskan penjemputan → konfirmasi paket tiba → susun run pengantaran, kurir, dan urutan stop → tangani paket yang ditolak atau gagal kirim → buka **Laporan harian** dan unduh XLSX.
4. **Kurir:** terima atau tolak paket dalam run dengan alasan → mulai pengantaran sesuai urutan → dokumentasikan berhasil/gagal antar dan foto melalui kamera → jika gagal, kembalikan paket ke hub.
5. **Pengantaran ulang:** operator hub menerima retur fisik, menetapkan tindakan/jadwal, lalu membuat run baru dengan **AWB yang sama**. Percobaan pertama dan berikutnya tetap terlihat di riwayat paket.
6. **Pelanggan:** masukkan AWB di portal Anteraja → buka detail paket → lihat timeline, status, serta bukti foto jika tersedia.

Runbook dan akun peran tersedia di [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md). Berikan password demo kepada penilai melalui kanal pengumpulan yang privat, bukan melalui README atau repository publik.

## Bukti workflow dan laporan

| Workflow | Fungsi | File ekspor |
| --- | --- | --- |
| Dispatch notification | Event Laravel → klaim notifikasi → adapter Telegram → hasil pengiriman dicatat kembali di Laravel. | [notification-dispatch.json](../integrations/n8n/workflows/notification-dispatch.json) |
| Recover pending notifications | Menyapu notifikasi yang tertinggal setiap menit. | [pending-notifications.json](../integrations/n8n/workflows/pending-notifications.json) |
| Remind overdue tasks | Mengingatkan tugas penjemputan/pengantaran yang belum dijawab. | [overdue-reminders.json](../integrations/n8n/workflows/overdue-reminders.json) |
| Daily report | Pukul **17.00 WIB**, meminta Laravel membuat ringkasan harian per hub dan mengantrekan notifikasi operator. | [daily-report.json](../integrations/n8n/workflows/daily-report.json) |

Laravel dan PostgreSQL adalah sumber status serta angka laporan. n8n menjadwalkan dan mengorkestrasi panggilan, bukan menghitung ulang status paket. Laporan harian tersedia di menu **Laporan harian** milik operator hub dan dapat diunduh sebagai XLSX berisi ringkasan, aktivitas, dan percobaan pengantaran. Riwayat AWB, percobaan, kendala, serta status notifikasi tersimpan di backend. Rincian teknis ada di [N8N_WORKFLOWS.md](N8N_WORKFLOWS.md).

Editor n8n berada di layanan privat, jadi untuk pengumpulan gunakan link folder ekspor JSON di GitHub. Jika penilai meminta demonstrasi workflow yang berjalan, tampilkan editor n8n lewat sesi presentasi atau akses terbatas; jangan publikasikan kredensial editor.

## Pemeriksaan sebelum submit

- [ ] Gabungkan branch backend terbaru `feat/backend-updates-wib-2026-10-15` ke `main`, lalu pastikan kedua frontend, dokumen, dan workflow terbaru juga ada di `main`. Link formulir di atas diarahkan ke `main`.
- [ ] Pastikan undangan kolaborator GitHub untuk alamat yang diminta panitia benar. Saat panduan ini dibuat, ada undangan tertunda untuk akun GitHub `itmaxyacademy`; verifikasi bahwa itu akun milik `it.maxy.academy@gmail.com`.
- [ ] Buka kedua URL produksi dari ponsel, login sebagai pembeli dan kurir, serta pastikan PWA dapat dipasang.
- [ ] Login sebagai ops admin dan operator hub. Siapkan akun demo/password melalui kanal privat.
- [ ] Uji satu alur checkout → AWB → pickup → hub → run → berhasil/gagal → laporan XLSX. Gunakan AWB yang benar-benar ada saat demo.
- [ ] Tunjukkan empat workflow n8n yang aktif atau kirim berkas JSON ekspornya. Periksa satu eksekusi terbaru dan satu entri status notifikasi.
- [ ] Simpan tangkapan layar seperlunya: checkout/AWB, daftar tugas kurir, kendala dan antar ulang, laporan XLSX, serta halaman workflow/eksekusi n8n. Tutupi nomor telepon dan token pada tangkapan layar publik.

## Dokumen pendukung dalam repo

- [PRD](PRD.md), [FRD](FRD.md), [ERD](ERD.md), dan [alur/arsitektur](ALUR_DAN_ARSITEKTUR.md).
- [Runbook demo](DEMO_RUNBOOK.md), [n8n dan Telegram](N8N_WORKFLOWS.md), dan [panduan backend](../backend/README.md).
