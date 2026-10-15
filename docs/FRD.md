# FRD — kebutuhan fungsional

FRD ini mengikuti [PRD](PRD.md), [alur dan arsitektur](ALUR_DAN_ARSITEKTUR.md), serta [ERD](ERD.md). Kode status di bawah merujuk perilaku Laravel yang sudah diterapkan.

## Role dan akses

| Role | Fungsi |
| --- | --- |
| `BUYER` | Register/login, checkout dan melihat riwayat di Fashionaja; mencari hingga 10 AWB, membaca detail/foto yang diizinkan, dan memberi konfirmasi penerimaan atau jadwal ulang di Anteraja. |
| `OPS_ADMIN` | Menyetujui order dan membuat AWB; melihat ringkasan pesanan, hub, kurir, serta laporan. API internal juga mendukung pembuatan akun dan hub. |
| `HUB_OPERATOR` | Menangani pickup, konfirmasi tiba/retur, pemilihan paket dan kurir untuk run, serah terima, keputusan kendala, riwayat, dan laporan hub. |
| `COURIER` | Menerima pickup dan mengambil foto; menerima/menolak run atau paket delivery, memulai run, mengikuti stop, mencatat hasil, dan melihat riwayatnya. Izin pickup/delivery mengikuti `courier_zones.service_type`. |

Registrasi publik hanya menghasilkan `BUYER`; email unik. Login mengarahkan ke halaman sesuai role, tetapi seluruh endpoint tetap memverifikasi role, kepemilikan, dan hub terkait. Kedua aplikasi memakai API dan akun yang sama; sesi antartab dijaga agar uji akun berbeda tidak saling menimpa.

## Fungsi dan kriteria terima

| ID | Kriteria terima |
| --- | --- |
| CAT-01 | Katalog memuat produk/toko dari API. Checkout tanpa pembayaran menyimpan order/item, snapshot penerima dan asal toko, serta `checkout_key` unik; AWB masih kosong. Riwayat diambil dari PostgreSQL. |
| CAT-02 | Setelah persetujuan, detail pesanan menampilkan AWB yang dapat disalin. Katalog tidak membuka fitur tracking logistik. |
| OPS-01 | Persetujuan memvalidasi produk, berat/dimensi, dan cakupan; membuat AWB, shipment, parcel, satu stop hub, pickup task, dan event secara atomik. Persetujuan ulang tidak menggandakan AWB. |
| HUB-01 | Hub dan zona dipilih dari cakupan kode pos tujuan. Shipment saat ini hanya melalui hub terpilih; hub itu menangani pickup dan delivery. Master hub/zona dapat ditambah. |
| PUP-01 | Operator memilih kurir pickup sesuai izin/kapasitas. Kurir menerima tugas; penyelesaian memerlukan AWB dan foto baru dari kamera (maksimum 5 MB, waktu tangkap maksimal 5 menit sebelumnya). File privat. |
| PUP-02 | Operator mengonfirmasi paket tiba dari daftar atau pencarian AWB, tanpa scanner fisik. Custody pindah ke hub dan paket masuk antrean siap antar. |
| RUN-01 | Operator memilih beberapa paket dari hub/zona yang sama. Pratinjau menunjukkan kurir yang memenuhi cakupan/kapasitas dan urutan berdasarkan rute jalan bila OSRM tersedia, usia paket, serta prioritas retry. Tidak boleh ada penugasan aktif ganda. |
| RUN-02 | Kurir dapat menerima semua atau memilih per paket. Penolakan wajib punya alasan, kembali ke antrean hub, dan tidak menambah delivery attempt. Operator mengonfirmasi serah terima paket yang diterima sebelum kurir berangkat. |
| ROUTE-01 | Peta Leaflet/OpenStreetMap menampilkan segmen hub→stop pertama dan stop sebelumnya→stop berikutnya. Fallback koordinat tersedia; peta merupakan panduan, bukan navigasi GPS langsung atau jaminan rute tercepat mutlak. |
| DLV-01 | Hanya kurir pemilik run dapat mengirim hasil. Sukses wajib nama penerima dan foto kamera; gagal wajib alasan. Tiap hasil menghasilkan nomor attempt, waktu, aktor, dan tracking event. |
| DLV-02 | Setelah gagal, custody tetap pada kurir. Operator hub harus mengonfirmasi retur fisik sebelum memilih jadwal ulang atau return. Reschedule membuat paket dapat dimasukkan ke run berikutnya dengan AWB yang sama dan attempt lama tetap ada. |
| TRK-01 | Pelanggan dapat memasukkan hingga 10 AWB sebagai chip. Hasil awal berupa kartu pratinjau; seluruh area kartu dapat diklik/diakses keyboard, memiliki hover/focus, dan menuju halaman detail. |
| TRK-02 | Detail menampilkan timeline terbaru di atas, jam WIB, hub, nama kurir bila relevan, nomor attempt, alasan penolakan/gagal kirim, catatan kurir, jadwal ulang, serta foto pickup/delivery yang diizinkan. Pengguna lain menerima detail terbatas dari server. |
| TRK-03 | Refresh halaman atau tombol perbarui status memuat kembali AWB yang sedang dibuka. Waktu event historis yang dikoreksi dibaca dari tabel koreksi, tanpa mengubah baris audit asli. |
| RPT-01 | Operator hub dapat menyegarkan laporan per hari dan mengunduh XLSX aktivitas/percobaan. Ops admin melihat ringkasan lintas hub. Laporan memakai waktu WIB efektif. |
| MSG-01 | Laravel membuat outbox hanya untuk template yang diizinkan. n8n/adapter menyimpan `SIMULATED`, `SENT` dengan ID provider, atau `FAILED`; kegagalan pesan tidak membatalkan transaksi paket. |

## Transisi status dan pemegang paket

| Aksi | Status hasil | Pemegang paket |
| --- | --- | --- |
| Checkout → ops admin setujui | `PENDING_APPROVAL` → `READY_FOR_PICKUP` | Toko |
| Kurir pickup menerima dan memfoto | `PICKED_UP` | Kurir pickup |
| Operator hub mengonfirmasi tiba | `READY_FOR_LAST_MILE` | Hub |
| Hub membuat run; kurir menerima; hub menyerahkan; kurir mulai | `OUT_FOR_DELIVERY` | Kurir delivery |
| Kurir melaporkan gagal | `DELIVERY_FAILED` | Kurir delivery |
| Hub mengonfirmasi retur dan menentukan tindak lanjut | `AT_HUB_AWAITING_DECISION` → `WAITING_REDELIVERY` atau `RETURN_REQUESTED` | Hub |
| Kurir menyerahkan ke penerima dengan foto | `DELIVERED` | Penerima |

Penolakan assignment terjadi sebelum kunjungan alamat dan tidak mengubah nomor percobaan. Konfirmasi pelanggan menambah tracking event; hasil kurir dan audit sebelumnya tidak ditimpa.

## Skenario uji akhir ke akhir

`Checkout → ACC/AWB → hub tugaskan pickup → kurir terima dan foto → hub konfirmasi tiba → hub buat run → kurir terima/tolak per paket → hub serah terima → kurir mulai → gagal dengan alasan → hub konfirmasi retur → hub jadwalkan ulang → run kedua → berhasil dengan foto → pelanggan melihat seluruh attempt → laporan XLSX.`
