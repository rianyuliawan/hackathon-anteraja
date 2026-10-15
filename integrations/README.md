# Integrasi n8n dan Telegram pribadi

Folder ini berisi [workflow n8n](n8n/README.md) dan [adapter Telegram](telegram-adapter/README.md). Laravel tetap menjadi pemilik status paket, pilihan penerima, dan laporan; n8n hanya memanggil API internal, lalu adapter mengirim pesan bila mode LIVE.

## Mulai dari mode dummy

1. Jalankan Laravel dan PostgreSQL. Isi secret server-ke-server Laravel, n8n, dan adapter dengan nilai acak yang cocok di kedua sisi. Jangan commit `.env` atau file sesi Telegram.
2. Di `telegram-adapter`, jalankan `npm ci`, set `ADAPTER_MODE=MOCK`, lalu `node --env-file=.env src/server.mjs`. `GET /health` harus menunjukkan `MOCK`.
3. Impor empat file `n8n/workflows/*.json`, pasang kredensial Header Auth webhook, serta set variabel lingkungan yang dijelaskan di `n8n/README.md`. Aktifkan workflow dan kirim satu notifikasi uji dari Laravel. Status akhir harus `SIMULATED`. Workflow `pending-notifications` menyapu notifikasi yang tertinggal setiap menit.
4. Uji login buyer, checkout, approval AWB, foto pickup/delivery, gagal kirim, scan retur, dan retry saat Telegram tetap MOCK.

## Menyiapkan demo Telegram asli

Pemilik akun pengirim (admin dan kurir) mengisi kredensial API Telegram di server dan menjalankan login interaktif adapter. Setelah adapter siap, aktifkan `ADAPTER_MODE=LIVE` dan `TELEGRAM_MODE=LIVE`. Pembeli baru dapat menyetujui notifikasi Telegram saat daftar atau di profil; nomor ponselnya dipakai langsung tanpa pairing dan tanpa menambah email ke allowlist. Akun staf atau akun lama dapat diizinkan melalui `TELEGRAM_LIVE_RECIPIENT_EMAILS`. Data dummy seed tetap MOCK. Pesan LIVE harus memperoleh `provider_message_id`; status `SIMULATED` tidak pernah dianggap terkirim. Telegram dapat membatasi pencarian nomor sesuai pengaturan privasi penerima.

## Pemeriksaan lokal

- `cd n8n && node verify_workflows.mjs`
- `cd telegram-adapter && npm test`
- `cd telegram-adapter && node --check src/server.mjs`

Tes HTTP adapter membuka listener sementara pada `127.0.0.1`, sehingga lingkungan sandbox yang melarang socket lokal perlu izin untuk menjalankannya. Integrasi LIVE memerlukan tiga akun Telegram pribadi yang pemiliknya memberi izin; tidak ada credential asli atau data peer di repo.
