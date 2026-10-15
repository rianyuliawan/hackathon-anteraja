# n8n dan Telegram

Workflow sumber ada di [integrations/n8n](../integrations/n8n/README.md). Laravel mencatat event dan outbox; n8n mengambil notifikasi, memanggil adapter Telegram akun pribadi, lalu mengembalikan hasil. n8n tidak menentukan hub, kurir, status shipment, atau reschedule.

## Alur teknis

1. Perubahan bisnis tersimpan bersama event/notifikasi di PostgreSQL. Setelah commit, Laravel memanggil webhook n8n. Workflow penyapu mengambil notifikasi tertinggal bila webhook tidak sampai.
2. n8n memanggil `POST /api/v1/internal/notifications/{id}/claim` dengan token internal. Laravel menentukan teks, URL, mode, dan profil pengirim.
3. Adapter admin mengirim sebagian besar template; adapter kurir dipakai untuk `OUT_FOR_DELIVERY`. Keduanya memakai sesi Telegram pribadi/MTProto, bukan bot token. Hasil provider dikembalikan ke `/result`.
4. MOCK berakhir `SIMULATED`. LIVE baru `SENT` bila adapter memberi ID pesan; kegagalan koneksi, privasi, atau tujuan menjadi `FAILED`. Retry dibatasi dan pengiriman tidak dijanjikan tepat sekali.

## Template yang diantrekan

| Penerima | Template saat ini |
| --- | --- |
| Buyer | `AWB_GENERATED`, `OUT_FOR_DELIVERY`, `DELIVERY_FAILED`, `REDELIVERY_SCHEDULED`, `DELIVERED` |
| Courier | `DELIVERY_ASSIGNED`, `ASSIGNMENT_REMINDER` |
| Hub operator | `DELIVERY_RUN_REJECTED`, `DELIVERY_ASSIGNMENT_REJECTED`, `DELIVERY_FAILED`, `REDELIVERY_DECISION_REQUIRED`, `TASK_UNRESPONDED`, `DAILY_REPORT` |

Copywriting empat pesan utama milik tim dipakai untuk tugas baru, mulai antar, usulan reschedule, dan tugas ulang; lihat template aktual pada [SatriaService.php](../backend/app/Services/SatriaService.php). Pesan status lain hanya dikirim jika termasuk allowlist template di kode. Laporan dijalankan manual atau terjadwal; reminder tugas menunggu jawaban diproses terpisah.

## Tujuan pelanggan dan LIVE

Nomor HP pada akun buyer dapat dinormalisasi sebagai tujuan Telegram **tanpa pairing lebih dulu**, jika `TELEGRAM_MODE=LIVE`, email ada di `TELEGRAM_LIVE_RECIPIENT_EMAILS`, dan format nomornya valid. Alternatifnya, API pairing dapat menyimpan peer Telegram yang terverifikasi; fitur ini tidak ditampilkan di halaman akun. Nomor valid tidak menjamin Telegram menemukan/mengizinkan kontak tersebut. Uji dengan akun penerima yang menyetujui pesan, cek hasil `SENT`/`FAILED`, dan gunakan tracking/telepon bila pesan gagal. Akun dummy di luar allowlist tetap MOCK.

Link tracking menggunakan `OPS_PUBLIC_URL` sehingga setelah deploy mengarah ke subdomain Anteraja; aksi privat meminta login dan membawa AWB yang dituju. Kredensial API Telegram, session string, `.env`, database n8n, dan token internal tidak boleh masuk Git atau ZIP sumber. Mode LIVE di VPS pernah diuji untuk penugasan kurir internal; pengiriman ke pelanggan baru perlu diuji dengan akun penerima nyata yang disetujui.
