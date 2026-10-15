# Kontrak API operasional

Prefix API adalah `/api/v1`. Route bisnis memakai sesi Laravel (`web` + `auth`); route `/internal` memakai token layanan. Daftar ini mengikuti [backend/routes/api.php](../backend/routes/api.php), sementara login/register berada di [backend/routes/web.php](../backend/routes/web.php). Respons utama dibungkus `data`; upload foto memakai `multipart/form-data`.

## Pelanggan dan tracking

| Endpoint | Perilaku |
| --- | --- |
| `GET /tracking/{awb}/preview` | Kartu hasil AWB untuk pencarian hingga 10 nomor di UI. |
| `GET /tracking/{awb}` | Detail AWB dan timeline; bagian sensitif menurut kepemilikan order. |
| `GET /tracking/{awb}/pickup-photo`, `GET /tracking/{awb}/delivery-photo` | Bukti foto privat sesuai otorisasi pelanggan pemilik. |
| `POST /tracking/{awb}/confirm-received`, `POST /tracking/{awb}/confirm-reschedule` | Konfirmasi penerimaan/usulan jadwal ulang pada status yang sah. |
| `POST /routing/road-route` | Geometri rute jalan untuk peta. |

## Ops admin

| Endpoint | Perilaku |
| --- | --- |
| `GET /admin/dashboard`, `GET /admin/orders`, `GET /admin/network` | Ringkasan, antrean order, dan data jaringan untuk pemantauan. |
| `POST /admin/orders/{id}/approve` | ACC order; finalisasi berat/dimensi, pilih hub dari cakupan, terbit AWB dan pickup task dalam transaksi. Tidak ada route reject order. |
| `GET /admin/reports/daily`, `POST /admin/reports/daily/generate` | Lihat/segarkan laporan. |
| `POST /admin/internal-users`, `POST /admin/hubs` | Administrasi master data melalui API; akun staf tidak mendaftar publik. |
| `GET /admin/issues`, `GET /admin/shipments/{id}/attempts` | Monitoring historis; keputusan issue berada pada operator hub. |

## Operator hub

| Endpoint | Perilaku |
| --- | --- |
| `GET /hubs/{id}/attention-counts` | Jumlah tindakan yang perlu perhatian untuk badge navigasi. |
| `GET /hubs/{id}/pickup-tasks`, `GET /hubs/{id}/pickup-couriers`, `POST /hubs/{id}/pickup-tasks/{taskId}/assign` | Tugas dan kurir pickup, termasuk penugasan. `mark-ready` tersedia bila tugas belum siap. |
| `GET /hubs/{id}/inbound`, `POST /hubs/{id}/scan-in` | Konfirmasi paket tiba; nama API `scan-in` tidak berarti UI butuh scanner barcode. |
| `GET /hubs/{id}/ready`, `GET /hubs/{id}/couriers`, `POST /hubs/{id}/delivery-runs/preview` | Antrean, ketersediaan kurir, dan saran urutan run. |
| `POST /hubs/{id}/delivery-runs`, `GET /hubs/{id}/delivery-runs`, `POST /hubs/{id}/handover` | Buat/pantau run dan konfirmasi serah terima paket yang diterima kurir. |
| `GET /hubs/{id}/issues`, `POST /hubs/{id}/return-scan`, `POST /hubs/{id}/issues/{issueId}/decision` | Gagal kirim: terima paket kembali, lalu `RESCHEDULE` atau `RETURN_TO_SELLER`. |
| `GET /hubs/{id}/shipments/{awb}/history` | Riwayat shipment/attempt untuk operator hub terkait. |
| `GET /hubs/{id}/reports/daily`, `POST /hubs/{id}/reports/daily/generate`, `GET /hubs/{id}/reports/daily.xlsx` | Ringkasan, refresh, unduh XLSX. |

## Kurir

| Endpoint | Perilaku |
| --- | --- |
| `GET /courier/pickup-assignments`, `POST /courier/pickup-assignments/{id}/accept`, `POST /courier/pickup-assignments/{id}/complete` | Pickup milik kurir; `complete` memerlukan `awb`, `photo`, dan `captured_at` baru dari kamera. Tidak ada penolakan pickup pada API aktif. |
| `GET /courier/delivery-runs`, `POST /courier/delivery-runs/{id}/accept`, `/respond`, `/reject`, `/start` | Lihat run, terima semua atau jawab per paket, tolak dengan alasan, mulai sesudah handover. |
| `POST /courier/run-shipments/{id}/result` | `DELIVERED` memerlukan penerima/foto; `FAILED` memerlukan alasan; menambah attempt. |
| `GET /courier/shipments`, `GET /courier/shipments/{awb}` | Cari paket terkait dan buka detail/riwayatnya. |

Endpoint `GET /shipments/{id}/contact-options`, `POST /shipments/{id}/contact-opened`, dan foto shipment memeriksa relasi petugas dengan paket. Membuka kanal kontak tidak dihitung sebagai pesan terkirim. Pairing Telegram opsional masih tersedia lewat `POST /me/telegram/pairing`, `DELETE /me/telegram/link`, dan endpoint konfirmasi internal; UI akun tidak menampilkan pairing.

## Integrasi internal

`GET /internal/notifications/pending`, `POST /internal/notifications/{id}/claim`, `POST /internal/notifications/{id}/result`, `GET /internal/tasks/overdue`, `POST /internal/tasks/{id}/remind`, dan `POST /internal/reports/daily` dipakai n8n. Laravel menentukan status dan penerima; n8n hanya mengirim/mencatat hasil. `409` berarti konflik status/idempotensi, `403` tidak berhak, dan `422` validasi. Status bisnis tidak boleh diubah langsung dari n8n.
