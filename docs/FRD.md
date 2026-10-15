# FRD — fungsi dan alur Satria

Dokumen ini menurunkan [PRD](PRD.md) menjadi perilaku yang bisa diuji. Kolom, relasi, dan aturan data dirinci pada [ERD](ERD.md) serta [schema PostgreSQL](../backend/database/satria-schema.sql). `P0` diperlukan untuk alur demo; `P1` dapat menyusul. Katalog dan web utama adalah aplikasi React terpisah dengan akun Laravel/PostgreSQL yang sama.

## Hak akses

| Aksi | Pembeli | Ops admin | Operator hub | Kurir pickup | Kurir antar |
| --- | :---: | :---: | :---: | :---: | :---: |
| Register publik dan checkout | Ya | — | — | — | — |
| Lihat riwayat order sendiri | Ya | — | — | — | — |
| Konfirmasi penerimaan order sendiri sesudah delivered | Ya | — | — | — | — |
| Setujui order dan terbitkan AWB | — | Ya | — | — | — |
| Buat akun internal dan kelola master hub/zona (API) | — | Ya | — | — | — |
| Lihat antrean dan laporan hub, baca saja (API) | — | Ya | Hubnya | — | — |
| Tetapkan kurir pickup dan tandai paket siap diambil | — | — | Hubnya | — | — |
| Konfirmasi pickup; foto contoh otomatis | — | — | — | Tugasnya | — |
| Scan paket masuk/retur dan buat tugas antar | — | — | Hubnya | — | — |
| Putuskan jadwal ulang atau retur | — | — | Hubnya | — | — |
| Terima/tolak tugas antar dan unggah foto delivery | — | — | — | — | Tugasnya |
| Hubungi penerima untuk shipment terkait | — | Ditangani | Hubnya | — | Tugasnya |
| Hubungi toko untuk pickup terkait | — | Ditangani | — | Tugasnya | — |

Baris bertanda **(API)** berlaku pada backend, tetapi belum memiliki layar pada portal. Verifikasi baris tersebut dilakukan lewat pemanggilan API, bukan lewat aplikasi.

Kolom "Kurir pickup" dan "Kurir antar" adalah **jenis tugas**, bukan dua role login: keduanya memakai role `COURIER`, sementara `courier_zones.service_type` menentukan izin kerja. Satu user internal dapat diberi kemampuan pickup dan antar, tetapi setiap aksi tetap memeriksa role, assignment, hub, dan zona. Hanya pembeli yang mendaftar sendiri. Akun ops admin pertama berasal dari seed; internal lain dibuat lewat API admin. Login membawa role ke halaman yang sesuai. Pencarian AWB memerlukan login dan hanya menampilkan status, waktu, dan lokasi umum; alamat lengkap, nomor HP, dan foto memerlukan otorisasi tambahan.

Dua tingkat izin hub perlu dibedakan. Endpoint **baca** hub (paket masuk, paket siap antar, daftar kurir, daftar tugas antar, laporan harian hub) memakai `requireHub`, sehingga ops admin dan operator hub yang bersangkutan sama-sama boleh membacanya. Endpoint **aksi** hub (scan masuk, scan retur, serah terima, pembentukan dan pratinjau tugas antar, penetapan pickup, penandaan siap diambil) memakai `requireRole('HUB_OPERATOR')`, sehingga hanya operator hub pemilik hub itu yang boleh menjalankannya. Hak baca ops admin itu baru tersedia di API: layar portal ops admin saat ini terbatas pada ringkasan dan pesanan, jadi perilakunya belum bisa diperagakan lewat aplikasi.

## Kebutuhan fungsional

| ID | Prioritas | Perilaku yang harus terbukti |
| --- | :---: | --- |
| AUTH-01 | P0 | Registrasi katalog menyimpan nama, nomor HP, alamat, kode pos, dan kredensial; role selalu `BUYER`. Login yang sama berlaku pada katalog dan web utama. |
| AUTH-02 | P0 | Admin, operator, dan kurir tidak dapat dipilih lewat registrasi publik. Laravel mengarahkan role ke menu yang sesuai dan menolak akses ke objek/area yang bukan miliknya. |
| CAT-01 | P0 | Katalog React menampilkan produk baju dari satu toko dummy yang telah tersimpan di PostgreSQL. Tidak ada pembayaran. |
| CAT-02 | P0 | Checkout memprefill nama, telepon, alamat, dan kode pos dari profil, meminta pembeli mengonfirmasi tujuan, dan mengirim ID produk/jumlah serta `checkout_key`. Laravel menyimpan snapshot penerima, alamat toko, item, harga, dan ukuran; browser tidak menetapkan seller, hub, atau AWB. |
| CAT-03 | P0 | Checkout sukses membuat order `PENDING_APPROVAL` tanpa AWB. Order tetap ada setelah refresh/login ulang. Jika respons jaringan tidak jelas, retry memakai `checkout_key` sama; duplikasi tidak membuat order kedua. |
| CAT-04 | P0 | Riwayat pembeli menampilkan order pending dan yang sudah disetujui. Setelah ACC, permintaan API berikutnya menampilkan AWB dan tautan pencarian tracking pada web utama. Pembeli lain tidak bisa melihatnya. |
| ORD-01 | P0 | Ops admin menyetujui order; **MVP tidak menyediakan penolakan order**. ACC memvalidasi produk, berat/dimensi akhir, cakupan kode pos, serta pilihan hub; satu transaksi membuat shipment, AWB unik, parcel, rencana rute, dan tugas pickup. Approval berulang mengembalikan AWB yang sama. Order di luar cakupan hanya tertahan karena aksi ACC tidak tersedia baginya. Nilai `REJECTED` dan kolom `rejection_reason` masih ada di schema, tetapi tidak ada aksi yang menghasilkannya. |
| HUB-01 | P0 | Master data memuat beberapa hub contoh di DKI beserta cakupan tujuan dan zona antar. Sistem memilih satu `delivery_hub_id` dari alamat penerima; alamat tidak terpetakan ditahan untuk koreksi. Tidak ada transit antarahub pada demo. |
| HUB-02 | P0 | Pickup dimulai di lokasi toko. Hub asal/koordinator pickup boleh berbeda dari hub pengantaran; paket dibawa langsung ke hub pengantaran untuk demo. Satu route stop mencatat hub yang benar-benar disinggahi. |
| PUP-01 | P0 | Tugas pickup dibuat otomatis saat ACC. Operator hub **menetapkan kurir pickup** untuk tugas itu, dan hanya kurir dengan `service_type = PICKUP` pada zona hub tersebut yang dapat dipilih. Kurir pickup menerima tugas; **MVP belum menyediakan penolakan tugas pickup** — hanya tugas antar yang dapat ditolak. Hub tujuan dapat melihat paket yang sedang ditunggu. |
| PUP-02 | P0 | Hanya kurir yang menerima assignment pickup aktif boleh menyelesaikannya. Penyelesaian memerlukan AWB yang cocok dan waktu pickup. Laravel memasang foto contoh dari aset backend pada storage privat dan menyimpan rujukannya pada database. Tanpa aset foto yang tersedia status tidak dapat berubah menjadi `PICKED_UP`. Foto ini adalah simulasi first mile. |
| HUB-03 | P0 | Operator hub yang diizinkan memindai AWB setelah pickup selesai. Scan mencatat pelaku/waktu/hub dan custody, lalu menempatkan paket dalam antrean `READY_FOR_LAST_MILE` zona tujuan. Hub lain tidak boleh mengaku menerima paket tersebut. |
| DSP-01 | P0 | Operator hub membentuk satu delivery run dari paket siap antar yang berada pada satu hub/zona, memilih kurir aktif yang melayani zona dan cukup kapasitas. Shipment tidak boleh ada dalam dua run aktif. |
| DSP-02 | P0 | Kurir dapat menerima/menolak tugas antar. Penolakan mengembalikan paket ke antrean dan memberi tahu operator hub serta admin; belum membuat delivery attempt. Pengingat tugas pending tersedia, sedangkan kedaluwarsa otomatis belum diaktifkan. |
| DSP-03 | P0 | Setelah run diterima, paket dipindai saat serah terima ke kurir. Pesan `OUT_FOR_DELIVERY` ke pembeli baru dipicu setelah kurir menekan Mulai antar, bukan hanya saat ia menerima tugas. |
| DSP-04 | P1 | Sistem menyarankan urutan stop dari hub untuk paket dalam run berdasarkan koordinat/jarak yang tersedia. UI menyebutnya saran rute, bukan jaminan waktu tercepat; operator dapat menyesuaikan urutan sebelum run dimulai. |
| DLV-01 | P0 | Hanya kurir pemilik run aktif boleh mencatat hasil. `DELIVERED` memerlukan nama penerima, waktu, dan **foto serah terima**. Tanpa rujukan foto valid, percobaan berhasil tidak dapat disimpan. Foto tidak muncul pada halaman pelacakan. |
| DLV-02 | P0 | Hasil `FAILED` memerlukan alasan dan menyimpan satu delivery attempt append-only. Foto kegagalan boleh dilampirkan. Pembeli dan admin diberi tahu dengan alasan yang aman dipublikasikan. |
| DLV-03 | P0 | Setelah gagal, custody masih pada kurir. Operator hub harus memindai retur fisik sebelum paket boleh masuk tugas antar baru. |
| DLV-04 | P0 | **Operator hub** memutuskan jadwal ulang atau retur atas kendala tersebut. Tugas antar baru pada AWB yang sama menghasilkan attempt nomor berikutnya; kegagalan sebelumnya tidak diubah. |
| TRK-01 | P0 | Pencarian AWB dilakukan setelah login dan menampilkan timeline yang disanitasi. Pembeli pemilik order dapat melihat detail order dan foto yang diizinkan melalui endpoint privat. |
| TRK-02 | P0 | Sesudah shipment `DELIVERED`, buyer pemilik order dapat menekan Konfirmasi diterima. Laravel menambah tracking event dengan pelaku/waktu; tidak mengedit delivery attempt kurir. Tombol kedua kalinya mengembalikan konfirmasi sebelumnya. |
| COM-01 | P0 | Nomor HP recipient disimpan sebagai kontak pengiriman. Ops admin, operator hub terkait, dan kurir antar yang memegang assignment terkait dapat melihat tombol Hubungi buyer; kurir pickup hanya melihat kontak toko. Tombol telepon membuka dialer. Membuka kontak dicatat sebagai event, bukan bukti pesan terkirim. |
| COM-02 | P1 | **Belum diimplementasikan.** Rencananya buyer login meminta kode taut Telegram yang kedaluwarsa, mengirimnya dari akun Telegram sendiri ke akun pengirim demo, lalu adapter menyimpan peer terverifikasi dan buyer dapat mencabut izinnya. Endpoint dan tabelnya sudah ada di backend, tetapi portal belum punya layarnya dan adapter belum dijalankan. Nomor yang diketik di checkout tidak akan otomatis menjadi peer Telegram. |
| MSG-01 | P0 | Peristiwa ACC/AWB, jadwal pickup/selesai pickup ke pengirim, tugas kurir, pengingat belum direspons, mulai antar, gagal beserta alasan, jadwal ulang, berhasil, dan laporan menghasilkan **satu catatan notifikasi** dengan penerima logis, template, isi pesan, dan tautan relevan. Catatan tersimpan dan dapat dibaca pemiliknya dengan status apa adanya. |
| MSG-02 | P1 | **Belum diimplementasikan.** Rencananya pengiriman nyata ke akun Telegram pribadi uji (admin, kurir, pembeli) tanpa bot, memakai n8n dan adapter MTProto, dengan pengirim sesuai sesi yang dipakai. Selama belum aktif, tidak ada pesan yang dilabeli `SENT` dan aplikasi tetap menampilkan `SIMULATED`. |
| RPT-01 | P0 | Laporan per hub/hari menghitung hasil kirim dan retry tanpa menghitung satu AWB dua kali sebagai dua paket. Pemicu manual tersedia untuk demo. |

## Urutan status dan kasus utama

```text
Checkout katalog → PENDING_APPROVAL (tanpa AWB)
→ ACC ops admin → AWB + pickup task + hub pengantaran terpilih
→ operator hub menetapkan kurir pickup
→ konfirmasi pickup + foto contoh otomatis → PICKED_UP
→ scan diterima di hub tujuan → READY_FOR_LAST_MILE
→ operator membuat tugas antar → DELIVERY_ASSIGNED
→ kurir menerima → scan serah terima → Mulai antar → OUT_FOR_DELIVERY
→ DELIVERED + foto, atau FAILED + alasan
```

```text
FAILED pada attempt #1 → pesan pembeli/admin → kurir kembali
→ hub memindai retur → operator hub memutuskan jadwal ulang
→ tugas antar baru → kurir menerima atau menolak
→ attempt #2 pada AWB yang sama → DELIVERED + foto
```

Menolak tugas antar adalah peristiwa tugas, bukan kegagalan pengantaran; tugas pickup belum dapat ditolak pada MVP. Foto pickup dan delivery disimpan privat; database mencatat rujukan file, aktor, waktu, dan hubungan dengan tugas/attempt. File harus tetap tersedia setelah refresh maupun deployment ulang.

## Skenario penerimaan

1. User baru hanya mendapat role BUYER; kredensialnya berlaku di kedua aplikasi.
2. Checkout tanpa pembayaran muncul sebagai pending tanpa AWB, lalu AWB yang sama muncul setelah ACC.
3. Alamat tujuan di luar cakupan hub contoh ditahan; paket zona Utara tidak bisa dimasukkan ke run kurir Selatan.
4. Pickup tidak dapat selesai tanpa foto; hub tidak dapat memindai masuk sebelum pickup selesai.
5. Kurir menolak tugas antar: operator hub dapat menugaskan ulang dan belum ada delivery attempt.
6. Kurir gagal di alamat: attempt pertama tetap gagal, paket masih di tangan kurir sampai scan retur, lalu attempt kedua bisa dibuat.
7. Pengantaran berhasil tidak dapat disimpan tanpa foto; URL foto tidak bocor pada halaman pelacakan.
8. Operator hub atau admin tidak dapat mengunggah foto atas nama kurir; kurir lain juga tidak dapat mengunggah foto pada tugas yang bukan miliknya.
9. User dengan nomor HP saja tetap dapat menerima update di web dan dihubungi lewat telepon oleh petugas terkait. Taut Telegram belum aktif pada tahap ini, sehingga tidak ada pesan otomatis yang diklaim terkirim.
10. Catatan notifikasi tidak pernah ditampilkan sebagai terkirim selama mode MOCK; setiap catatan menyimpan penerima logis, template, waktu, dan statusnya apa adanya.
11. Operator hub lain tidak dapat menetapkan pickup, memindai paket, atau membuat tugas antar untuk hub yang bukan miliknya, walaupun ops admin berhak membaca antrean hub itu lewat API.
