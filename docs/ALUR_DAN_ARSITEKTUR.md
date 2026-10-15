# Alur bisnis dan arsitektur Satria

Dokumen ini menjabarkan [PRD](PRD.md), [FRD](FRD.md), [ERD](ERD.md), dan [schema PostgreSQL](../backend/database/satria-schema.sql). Alur Satria dari brief berfokus pada penugasan kurir, gagal kirim, pengiriman ulang, pesan otomatis, dan laporan. Katalog baju, pickup toko, hub, foto, dan saran urutan antar adalah rancangan tim.

## 1. Komponen dan batas data

| Komponen | Tugas |
| --- | --- |
| React katalog | Register/login pembeli, produk baju satu toko, checkout tanpa pembayaran, riwayat dan AWB setelah ACC. |
| React web utama | Halaman sesuai role ops admin/operator hub/kurir/buyer, pencarian AWB, tracking, foto privat, dan laporan. |
| Laravel API | Autentikasi, otorisasi, aturan order, approval, AWB, pemilihan hub, pickup, penugasan kurir, upload foto, attempt, custody, tracking, dan notifikasi. |
| PostgreSQL | Satu sumber user, produk, order pending, shipment/AWB, hub/zona, tugas, attempt, event, tujuan dan hasil pesan. Data saat pengembangan adalah dummy. |
| Storage privat | Isi file foto pickup/delivery. Database menyimpan kunci lokasi file; API memeriksa izin sebelum mengembalikan foto. [Laravel File Storage](https://laravel.com/docs/13.x/filesystem). |
| n8n (rencana) | **Belum dijalankan.** Rencananya menerima event setelah commit, menjadwalkan pengingat/laporan, dan meminta adapter mengirim pesan. Alur logistik tidak bergantung padanya. |
| Adapter Telegram (rencana) | **Belum dijalankan.** Rencananya layanan kecil dengan sesi akun Telegram pribadi uji melalui client API/MTProto, karena node Telegram standar n8n hanya mendukung token bot. [n8n Telegram credentials](https://docs.n8n.io/integrations/builtin/credentials/telegram/), [Telegram user authorization](https://core.telegram.org/api/auth). |

Aplikasi katalog dan utama memakai API/database yang sama. Hanya pembeli dapat register sendiri. Akun internal dibuat ops admin; akun ops admin pertama disiapkan lewat seed. Login memuat role dari Laravel dan mengarahkan ke halaman terkait, sedangkan setiap endpoint tetap memeriksa role, kepemilikan objek, hub, dan zona. Kredensial yang sama dapat dipakai di dua aplikasi; berbagi sesi login lintas frontend memerlukan konfigurasi cookie/domain/CSRF/CORS yang benar.

Izin hub dipisah dua tingkat. Endpoint baca hub memakai `requireHub`, sehingga ops admin dan operator hub yang bersangkutan sama-sama dapat membaca. Endpoint aksi hub memakai `requireRole('HUB_OPERATOR')`, sehingga hanya operator hub pemilik hub itu yang dapat memindai paket, membentuk tugas antar, atau menetapkan pickup. Hak baca itu baru ada di API: layar portal ops admin saat ini terbatas pada ringkasan dan pesanan, sehingga antrean hub belum tampil di sana.

## 2. Dari katalog hingga resi

1. Satu toko baju, alamat pickup, beberapa produk, beberapa hub DKI, zona, kurir, dan akun internal disiapkan sebagai **data dummy**. Harga boleh ditampilkan sebagai informasi produk; tidak ada gerbang pembayaran.
2. Pembeli register dengan nama, nomor HP, alamat, dan kode pos, lalu login ke katalog. Form checkout memprefill data profil dan meminta konfirmasi tujuan. Laravel menyimpan snapshot penerima agar perubahan profil nanti tidak mengubah paket lama.
3. Pembeli memilih baju dan menekan Checkout. Laravel menghitung ulang item/ukuran dasar dari database serta menyimpan `orders` dan `order_items` sebagai `PENDING_APPROVAL`. Belum ada AWB. Riwayat katalog mengambil order ini dari API, bukan localStorage.
4. Ops admin memeriksa alamat, cakupan hub, berat/dimensi paket final, lalu ACC. ACC dalam satu transaksi membuat shipment, AWB internal unik, parcel, rencana rute, tugas pickup, dan tracking event. Katalog melakukan refetch dan menampilkan AWB serta tautan pencarian pada web utama. MVP tidak menyediakan penolakan order; order yang tidak memenuhi syarat hanya tertahan karena aksi ACC tidak tersedia baginya.

## 3. Memilih hub dan pickup

Hub adalah master data yang dibuat sekali; beberapa hub contoh ada di DKI Jakarta. `postal_coverages` memetakan satu kode pos penerima ke satu `delivery_hub_id` dan zona antar pada MVP. Bila satu kecamatan punya dua hub, bagi kode pos contoh di antara keduanya. Pemilihan dua hub untuk kode pos yang sama berdasarkan kapasitas/jarak memerlukan model cakupan lebih rinci pada tahap berikutnya. Alamat bebas yang tidak terpetakan tidak boleh diam-diam diarahkan ke hub asal.

Pickup selalu dimulai dari **alamat toko**, bukan dari alamat pembeli atau hub. `origin_hub_id` pada schema mengoordinasikan zona pickup di sekitar toko; `delivery_hub_id` adalah hub tempat paket benar-benar diterima sebelum last mile. Untuk demo, kurir pickup membawa paket **langsung dari toko ke hub pengantaran**. Jika dua hub berbeda, hub asal tidak perlu menjadi route stop fisik. Route plan demo berisi satu stop: hub pengantaran. Ini penyederhanaan layanan DKI; armada transit antarahub dapat ditambah kemudian tanpa mengubah alur gagal kirim.

Tugas pickup dibuat otomatis saat ACC. **Operator hub** menetapkan kurir pickup untuk tugas itu; **kurir pickup yang menerima assignment** memindai AWB di toko, **mengonfirmasi pickup**, lalu menandai tugas selesai. Laravel memeriksa kepemilikan assignment dan memasang foto paket contoh yang sama dari aset backend pada storage privat; rujukan file, aktor, dan waktu tetap tercatat. Foto ini hanya untuk menyederhanakan first mile demo, bukan bukti foto yang baru diambil di toko. Bila aset tidak dapat disimpan, status tetap belum selesai. Tugas pickup belum dapat ditolak pada MVP; kurir menerima lalu menyelesaikannya. Kurir pickup dapat menghubungi petugas toko melalui kontak seller pada tugasnya. Operator hub tujuan melihat paket yang akan masuk, lalu menekan Terima Paket hanya setelah memindai AWB fisik. Scan memindahkan custody ke hub dan menempatkan paket pada antrean `READY_FOR_LAST_MILE` sesuai zona penerima. Operator tidak dapat mengganti rujukan foto pickup.

## 4. Pembagian tugas dan saran rute

Operator hub membuat delivery run dari paket yang sudah ada di hub dan berada pada satu zona. Laravel hanya menawarkan kurir yang aktif, punya izin zona, dan kapasitas yang cukup. Satu AWB tidak boleh berada pada dua run aktif. Kurir menerima atau menolak; penolakan mengembalikan paket ke antrean dan mengabari operator hub serta admin, tetapi **belum membuat delivery attempt**.

Saran urutan stop dihitung setelah paket dan kurir dipilih. Untuk MVP, gunakan koordinat alamat contoh dan jarak sederhana dari hub untuk mengurutkan stop, serta izinkan operator mengoreksi. Tanpa koordinat atau data waktu jalan, UI tidak boleh menyebut hasilnya sebagai rute pasti tercepat. Integrasi matriks waktu perjalanan atau pemecah masalah seperti [OR-Tools Vehicle Routing](https://developers.google.com/optimization/routing) merupakan tahap lanjut. n8n mengirim pesan penugasan, tidak menentukan hub, kurir, atau rute.

Sesudah kurir menerima run, operator memindai serah terima paket. Kurir lalu menekan **Mulai antar**; barulah shipment menjadi `OUT_FOR_DELIVERY` dan pembeli mendapat pesan. Buyer dapat memakai AWB dari katalog untuk melihat timeline pada web utama. Halaman pelacakan memerlukan login dan menyembunyikan alamat lengkap, telepon, serta foto.

## 5. Berhasil, gagal, dan pengiriman ulang

- **Berhasil:** kurir pemilik run mencatat nama penerima dan **foto serah terima**. Laravel menyimpan file privat dan satu `delivery_attempts` hasil `DELIVERED`; tanpa foto, transaksi hasil ditolak. Pembeli mendapat status dan pesan diterima, lalu dapat mengonfirmasi penerimaan di aplikasi. Konfirmasi buyer menambah event dan tidak mengubah hasil kurir.
- **Gagal di alamat:** kurir memilih alasan wajib; foto kegagalan boleh ditambahkan bila relevan. Laravel menambah satu attempt `FAILED` yang tidak dapat diedit, membuat issue, serta memberi tahu pembeli dan admin dengan alasan yang aman ditampilkan.
- **Custody setelah gagal:** paket masih di tangan kurir. Operator hub memindai paket yang kembali; baru kemudian operator hub pula yang memutuskan jadwal ulang atau retur. Paket belum boleh ditugaskan aktif kepada kurir lain sebelum scan retur.
- **Retry:** operator hub membuat tugas antar baru pada AWB yang sama. Kurir baru bisa menerima/menolak. Attempt nomor berikutnya disimpan tanpa menghapus hasil sebelumnya. Pesan jadwal ulang dikirim ke pembeli dan instruksi baru ke kurir.

Foto pickup dapat dilihat petugas berwenang; foto delivery dapat dilihat pembeli pemilik order dan petugas berwenang melalui API privat. Hanya kurir pemilik assignment/run yang mengunggah masing-masing foto; operator hub bertugas memindai perpindahan fisik. API pencarian AWB memerlukan login dan hanya menampilkan status dan waktu. File disimpan di disk privat persisten atau storage objek, bukan langsung sebagai BLOB pada PostgreSQL atau URL publik tetap.

## 6. Menghubungi buyer secara realistis

Nomor HP pada order adalah **kontak pengiriman**, bukan bukti kepemilikan akun Telegram. Pengisian nomor oleh buyer tidak otomatis memberi kemampuan mengirim pesan Telegram. Bahkan nomor yang terkait akun Telegram dapat tersembunyi oleh pengaturan privasi atau pengiriman pesan dapat ditolak. [Telegram contact lookup](https://core.telegram.org/api/contacts), [Telegram sendMessage](https://core.telegram.org/method/messages.sendMessage).

**Hubungkan Telegram belum tersedia.** Rencananya buyer dapat meminta kode sekali pakai, mengirimnya dari akun Telegram miliknya ke akun pengirim demo, lalu adapter menyimpan peer yang terverifikasi dan buyer dapat mencabut izinnya. Endpoint dan tabelnya sudah ada di backend, tetapi portal belum punya layarnya dan adapter belum dijalankan, sehingga pada tahap ini tidak ada tautan Telegram yang bisa dipakai. Yang sudah berjalan adalah tombol telepon: admin, operator hub terkait, dan kurir last mile yang memegang paket dapat membuka dialer ke nomor order, dan membuka kontak dicatat sebagai aktivitas — bukan bukti pesan terkirim. Timeline dalam aplikasi tetap tersedia tanpa Telegram.

Jika paket dikirim ke penerima yang berbeda dari pemilik akun katalog, catatan notifikasi ditujukan kepada pembeli pemilik order, sedangkan kurir menghubungi nomor penerima pada order lewat telepon. Keputusan gagal/berhasil selalu dibuat di aplikasi, bukan dibaca dari chat.

## 7. Pesan: baru sebatas catatan, pengiriman nyata menyusul

Laravel sudah mencatat notifikasi untuk setiap peristiwa penting: penerima logis, template, isi pesan, tautan, dan status. Catatan yang hanya disimulasikan tidak boleh disamakan dengan pesan yang benar-benar terkirim. Pengiriman ke akun Telegram atau WhatsApp nyata — beserta adapter akun pribadi dan pairing pembeli — belum dikerjakan dan direncanakan menyusul.

Rencananya pengiriman memakai **tanpa bot**: karena node Telegram n8n memakai token bot, n8n akan memanggil adapter client API/MTProto melalui HTTP, dengan adapter login sebagai akun pribadi pengirim yang disetujui tim memakai `api_id`/`api_hash` dan sesi tersimpan aman. Notifikasi admin dapat diarahkan ke Saved Messages atau dashboard. Jika pesan otomatis ingin tampil berasal dari akun kurir, diperlukan sesi MTProto kurir terpisah. Seluruh bagian ini belum dibangun dan masih merupakan pekerjaan integrasi nyata. [Telegram API application](https://core.telegram.org/api/obtaining_api_id), [sendMessage](https://core.telegram.org/method/messages.sendMessage), [Saved Messages](https://core.telegram.org/api/saved-messages).

Pembagian tanggung jawabnya nanti: Laravel menentukan event, penerima, isi pesan, dan deep link; n8n menjadwalkan serta menyampaikan ke adapter; hasil nyata `SENT`/`FAILED` kembali ke Laravel. Karena pengiriman belum aktif, approval dan hasil gagal kirim tetap tersimpan sebagai catatan dan tidak ada yang dilabeli terkirim. Daftar pesan yang direncanakan tetap sama: AWB terbit ke buyer; tugas baru/pengingat ke kurir; mulai antar, gagal dengan alasan, jadwal ulang, berhasil ke buyer; penolakan/tidak merespons/gagal/laporan ke admin. Tautan pesan membuka aplikasi dan tetap memerlukan login untuk aksi privat.

## 8. API operasional minimum

| Kelompok | Endpoint konseptual |
| --- | --- |
| Katalog | GET /api/v1/products, POST /api/v1/orders, GET /api/v1/me/orders, GET /api/v1/me/orders/{id} |
| Tracking | GET /api/v1/tracking/{awb}; GET /api/v1/me/orders/{id}/delivery-photo untuk pemilik |
| Ops admin | POST /api/v1/admin/orders/{id}/approve; POST /api/v1/admin/internal-users; POST /api/v1/admin/hubs |
| Pickup | GET /api/v1/hubs/{id}/pickup-tasks; POST /api/v1/hubs/{id}/pickup-tasks/{taskId}/assign; POST /api/v1/courier/pickup-assignments/{id}/complete dengan foto |
| Hub | GET /api/v1/hubs/{id}/inbound, /ready, /couriers, /delivery-runs; POST /api/v1/hubs/{id}/scan-in, /handover, /return-scan, /delivery-runs |
| Kendala | GET /api/v1/hubs/{id}/issues; POST /api/v1/hubs/{id}/issues/{issueId}/decision |
| Kurir antar | POST /api/v1/courier/delivery-runs/{id}/accept atau /reject atau /start; POST /api/v1/courier/run-shipments/{id}/result dengan foto jika berhasil |
| Kontak pembeli | GET /api/v1/shipments/{id}/contact-options; POST /api/v1/shipments/{id}/contact-opened |
| Telegram (rencana) | POST /api/v1/me/telegram/pairing; DELETE /api/v1/me/telegram/link; POST /api/v1/internal/telegram/pairing/confirm — endpoint sudah ada, alurnya belum dijalankan |
| Internal n8n (rencana) | POST /api/v1/internal/notifications/{id}/claim atau /result; GET /api/v1/internal/tasks/overdue; POST /api/v1/internal/reports/daily |

**Batas demo:** beberapa hub contoh di DKI, tetapi satu hub yang disinggahi setiap AWB; satu pickup dengan foto, satu gagal antar, scan retur, lalu satu pengantaran berhasil dengan foto. Pengiriman pesan ke Telegram/WhatsApp belum termasuk demo ini; yang diperagakan adalah catatan notifikasi dan opsi telepon.
