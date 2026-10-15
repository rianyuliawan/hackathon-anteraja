# Status, aktor, dan custody

Acuan ini merangkum transisi utama yang dijalankan Laravel. Nama aksi `scan-in`/`return-scan` masih ada pada API, tetapi UI operator memakai konfirmasi dari daftar/nomor AWB tanpa scanner fisik.

| Transisi | Aktor | Custody sesudah | Syarat dan catatan |
| --- | --- | --- | --- |
| Order → `PENDING_APPROVAL` | Buyer checkout | Belum ada shipment | AWB belum ada; retry `checkout_key` tidak membuat order kedua. |
| `PENDING_APPROVAL` → `APPROVED`/`READY_FOR_PICKUP` | Ops admin setujui | Seller | Validasi produk, ukuran, dan cakupan; terbit AWB dan pickup task pada hub terpilih. |
| `READY_FOR_PICKUP` → `PICKUP_ASSIGNED` | Operator hub menugaskan pickup | Seller | Kurir sesuai area/kapasitas; assignment menunggu penerimaan. |
| `PICKUP_ASSIGNED` → `PICKED_UP` | Kurir pickup pemilik tugas | Courier | Kurir telah menerima; AWB cocok; foto baru dari kamera wajib. |
| `PICKED_UP` → `READY_FOR_LAST_MILE` | Operator hub konfirmasi tiba | Hub | Paket fisik sampai di hub yang ditentukan, waktu/event tercatat. |
| `READY_FOR_LAST_MILE` atau `WAITING_REDELIVERY` → `DELIVERY_ASSIGNED` | Operator hub membuat run | Hub | Satu hub/zona, kurir memenuhi izin/kapasitas, tidak ada assignment aktif ganda. |
| `DELIVERY_ASSIGNED` → kembali ke antrean | Kurir menolak run/paket | Hub | Alasan wajib untuk penolakan per paket; **bukan** delivery attempt. |
| `DELIVERY_ASSIGNED` → `OUT_FOR_DELIVERY` | Kurir terima → hub serah terima → kurir mulai | Courier | Paket yang diterima diserahterimakan fisik sebelum perjalanan dimulai. |
| `OUT_FOR_DELIVERY` → `DELIVERY_FAILED` | Kurir pemilik run | Courier | Alasan wajib; attempt #N dan issue disimpan. |
| `DELIVERY_FAILED` → `AT_HUB_AWAITING_DECISION` | Operator hub konfirmasi retur | Hub | Paket harus benar-benar kembali sebelum keputusan/assignment ulang. |
| `AT_HUB_AWAITING_DECISION` → `WAITING_REDELIVERY` | Operator hub jadwalkan ulang | Hub | AWB tetap, jadwal baru tersimpan; dapat dimasukkan ke run berikutnya. |
| `AT_HUB_AWAITING_DECISION` → `RETURN_REQUESTED` | Operator hub memutuskan return | Hub | Permintaan return bukan bukti paket telah tiba di toko. |
| `OUT_FOR_DELIVERY` → `DELIVERED` | Kurir pemilik run | Recipient | Nama penerima dan foto kamera wajib; attempt #N disimpan. |
| `DELIVERED` → tetap `DELIVERED` | Buyer konfirmasi diterima | Recipient | Menambah tracking event; tidak menimpa attempt kurir. |

`delivery_attempts` dan `tracking_events` mempertahankan riwayat. Pelanggan dapat mengonfirmasi usulan reschedule pada status yang diizinkan, tetapi keputusan operasional dan custody tetap dikelola operator hub. Notifikasi terjadi setelah transisi bisnis; kegagalan Telegram tidak membatalkan perubahan paket.
