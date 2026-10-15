# FRD — fungsi yang tersedia

Dokumen ini merinci [PRD](PRD.md) sesuai aplikasi dan endpoint yang ada. Status dan custody dijelaskan di [matriks status](STATUS_DAN_CUSTODY.md); endpoint ada di [kontrak operasional](OPERATIONS_API_CONTRACT.md).

## Role dan akses

| Role | Tindakan utama |
| --- | --- |
| `BUYER` | Register/login, checkout Fashionaja, lihat order dan salin AWB; di Anteraja cari hingga 10 AWB sekaligus, buka halaman detail, lihat riwayat/foto yang diizinkan, konfirmasi penerimaan atau usulan jadwal ulang. |
| `OPS_ADMIN` | Tinjau dan setujui order, terbitkan AWB; lihat ringkasan dan laporan. API juga menyediakan pembuatan akun internal dan hub, meski navigasi utama disederhanakan. |
| `HUB_OPERATOR` | Tangani pickup, konfirmasi paket tiba/retur, pratinjau dan buat run, pilih kurir/urutan, serah terima, putuskan kendala, lihat riwayat dan unduh laporan XLSX untuk hubnya. |
| `COURIER` | Terima pickup dan foto paket lewat kamera; untuk delivery, terima/tolak run atau paket, ikuti stop, catat berhasil/gagal, dan lihat riwayat/tugasnya. Izin `PICKUP`/`DELIVERY` berasal dari `courier_zones.service_type`, bukan role login berbeda. |

## Kebutuhan fungsional dan kriteria uji

| ID | Perilaku yang harus terbukti |
| --- | --- |
| AUTH-01 | Registrasi publik hanya membuat `BUYER`; email yang sudah terdaftar ditolak. Kedua aplikasi memakai kredensial dan API yang sama, dengan sesi per tab agar pergantian role pada tab lain tidak menimpa sesi ini. |
| CAT-01 | Produk dan satu toko baju dimuat dari API. Checkout tanpa pembayaran menyimpan snapshot penerima/item, status `PENDING_APPROVAL`, dan `checkout_key` unik. Riwayat diambil dari PostgreSQL, bukan localStorage. |
| CAT-02 | Katalog menampilkan status pesanan dan AWB bila ada; pengguna bisa menyalin AWB dari detail. Tidak ada tautan tracking atau menu perjalanan paket dalam Fashionaja. |
| OPS-01 | Persetujuan order memeriksa produk, berat/dimensi, dan cakupan alamat; transaksi membuat AWB, shipment, parcel, route stop tunggal, pickup task, dan event. Persetujuan ulang tidak menghasilkan AWB baru. |
| HUB-01 | Hub dipilih otomatis dari cakupan tujuan; hub terpilih menangani pickup dan delivery shipment tersebut. Master data mencakup banyak hub/zona Jakarta, tetapi satu shipment MVP hanya melalui satu hub. |
| PUP-01 | Operator hub memilih kurir pickup yang memenuhi izin dan kapasitas. Kurir menerima tugas; penyelesaian memerlukan AWB dan foto kamera baru (maksimum 5 MB, waktu tangkap tidak lebih dari 5 menit). Foto disimpan privat. |
| PUP-02 | Sesudah pickup, operator hub terkait mengonfirmasi kedatangan melalui daftar paket/nomor resi; barcode scanner fisik tidak diwajibkan. Custody pindah ke hub dan paket siap diatur untuk delivery. |
| RUN-01 | Operator memilih beberapa paket dari hub/zona yang sama; pratinjau memberi saran urutan dan mengecek kelayakan kurir. Kurir yang sedang memiliki tugas aktif atau tidak mencakup zona tidak boleh dipilih secara keliru. |
| RUN-02 | Kurir dapat menerima semua atau memutuskan paket satu per satu. Paket yang ditolak wajib punya alasan, kembali ke antrean operator, dan tidak membuat attempt. Operator mengonfirmasi serah terima paket yang diterima sebelum kurir mulai. |
| ROUTE-01 | Pratinjau mempertimbangkan waktu tempuh jalan melalui OSRM bila tersedia, dengan fallback koordinat/jarak dan prioritas usia paket/retry. Peta Leaflet/OpenStreetMap menampilkan lintasan hub→stop pertama, lalu stop sebelumnya→stop berikutnya. Ini panduan, bukan navigasi GPS langsung atau janji rute optimal global. |
| DLV-01 | Kurir pemilik run mencatat hasil per paket. Sukses memerlukan nama penerima dan foto kamera; gagal memerlukan alasan. Hasil membuat `delivery_attempts` bernomor dan event tracking. |
| DLV-02 | Setelah gagal, paket masih pada kurir. Operator hub mengonfirmasi paket kembali secara fisik, baru dapat menjadwalkan ulang atau memutuskan return. Run berikutnya memakai AWB lama; attempt lama tetap ada. |
| TRK-01 | Pelanggan login dapat mencari maksimal 10 AWB yang dipisahkan koma/chip. Hasil awal berupa kartu pratinjau; tombol detail membuka halaman tersendiri. Refresh halaman detail memperbarui AWB itu, sedangkan kembali ke pencarian mengikuti navigasi aplikasi. |
| TRK-02 | Detail menunjukkan status, urutan event, attempt, foto pickup dan delivery jika pelanggan pemilik order, waktu serta alamat bukti, dan konfirmasi yang diizinkan. Pengguna lain mendapat data yang dibatasi server. |
| RPT-01 | Ringkasan per hub/hari menghitung AWB, keberhasilan, kegagalan/percobaan ulang. Operator dapat menyegarkan dan mengunduh XLSX. |
| MSG-01 | Hanya template Telegram yang diizinkan dibuat sebagai outbox. n8n/adapter mengembalikan `SIMULATED`, `SENT` dengan ID provider, atau `FAILED`; perubahan status paket tetap berhasil saat pesan gagal. |

## Skenario akhir ke akhir

`Checkout → ACC/AWB → tugas pickup oleh hub → kurir pickup terima & foto → hub konfirmasi tiba → hub buat run → kurir terima paket → hub serah terima → kurir mulai → gagal dengan alasan → hub konfirmasi retur → hub jadwalkan ulang → run kedua → berhasil dengan foto → pelanggan melihat dua attempt dan laporan hub.`

Penolakan assignment terjadi sebelum kunjungan alamat dan tidak menambah nomor percobaan. Foto delivery dan pickup untuk transaksi baru diambil dari kamera kurir, sementara fixture historis pada seed boleh menunjuk aset contoh untuk kebutuhan tampilan.
