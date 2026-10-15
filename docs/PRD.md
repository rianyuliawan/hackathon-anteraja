# PRD — Satria: katalog baju, pickup, pengiriman ulang, dan notifikasi

**Status:** MVP hackathon, sudah diimplementasikan dan dapat dijalankan end-to-end.
**Dokumen terkait:** [FRD](FRD.md) menurunkan perilaku yang bisa diuji, [ERD](ERD.md) memetakan data, dan [alur bisnis serta arsitektur](ALUR_DAN_ARSITEKTUR.md) menjelaskan komponen dan urutan proses.

Dokumen ini menggantikan versi rancangan awal. Isinya sudah diselaraskan dengan kode backend dan frontend yang berjalan, sehingga angka, status, dan aturan di bawah ini dapat diperiksa langsung pada sistem.

## 1. Latar belakang dan masalah

Layanan pengiriman gagal lebih sering daripada yang terlihat pada layar pelanggan. Ketika penerima tidak ada di tempat, satu paket menyentuh banyak pihak dalam waktu singkat: kurir harus mencatat alasan yang sah, paket harus kembali secara fisik ke hub, petugas hub harus memutuskan jadwal ulang atau retur, dan pembeli tetap perlu mendapat kabar yang jujur. Banyak demo logistik berhenti pada "paket terkirim"; justru bagian gagal, custody, dan percobaan berulang yang paling padat aturan.

Satria mengambil kasus itu sebagai inti. Brief aslinya menekankan penugasan kurir, gagal kirim, keputusan admin, pengiriman ulang, riwayat percobaan, pesan otomatis, dan laporan. Katalog baju, pickup dari toko, pemilihan hub, foto bukti, dan saran urutan antar adalah perluasan cerita tim agar alur terasa utuh dari checkout sampai paket diterima.

Masalah yang ingin dijawab:

1. Bagaimana memastikan sebuah paket gagal kirim tidak "hilang" di antara kurir, hub, dan admin?
2. Bagaimana menjamin bukti serah terima hanya dapat diunggah oleh pihak yang benar-benar memegang paket?
3. Bagaimana menjaga notifikasi tetap jujur — tidak pernah mengklaim terkirim bila hanya disimulasikan?

## 2. Tujuan dan non-tujuan

**Tujuan**

- Menjalankan satu alur utuh: checkout katalog → persetujuan ops admin → pickup toko → penerimaan hub → penugasan kurir → antar → gagal → retur fisik → jadwal ulang → berhasil.
- Menegakkan pemisahan izin berdasarkan role, hub, dan zona pada setiap aksi, dari sisi server — bukan dengan menyembunyikan tombol.
- Menyimpan setiap percobaan antar sebagai riwayat yang tidak dapat diubah, sehingga kegagalan pertama tetap terbaca setelah percobaan kedua berhasil.
- Menyediakan bukti foto yang hanya dapat dibuka pihak berwenang, dan tidak pernah bocor ke halaman pelacakan.
- Melaporkan status pengiriman pesan apa adanya: `SIMULATED`, `QUEUED`, atau `FAILED` tidak pernah ditampilkan sebagai "terkirim".

**Non-tujuan**

- Tidak ada pembayaran, keranjang lintas toko, atau integrasi payment gateway.
- Tidak ada akun resmi, tarif, atau AWB dari penyelenggara. AWB yang dipakai adalah nomor internal unik untuk demo.
- Tidak ada armada transit antarahub, optimasi lalu lintas waktu nyata, atau penugasan otomatis tanpa operator.
- Tidak ada panel seller terpisah; toko dikelola sebagai master data internal.
- Tidak ada penolakan order dan tidak ada penolakan tugas pickup. Order yang tidak memenuhi syarat hanya tertahan karena aksi persetujuan tidak tersedia baginya; kurir yang diberi tugas pickup dapat menerima lalu menyelesaikannya, sementara hanya tugas antar yang dapat ditolak.
- Pengiriman pesan otomatis ke Telegram atau WhatsApp belum dikerjakan. Yang berjalan saat ini adalah pencatatan notifikasi di dalam sistem.

## 3. Pengguna dan peran

Ada lima role pada `user_roles`. Hanya pembeli yang dapat mendaftar sendiri; sisanya dibuat pihak internal.

| Peran | Cara mendapat akun | Pekerjaan utama |
| --- | --- | --- |
| Pembeli (`BUYER`) | Register publik di katalog | Checkout baju, memantau riwayat dan AWB, mencari posisi paket, mengonfirmasi penerimaan setelah paket diserahkan. |
| Ops admin (`OPS_ADMIN`) | Akun pertama dari seed; akun internal berikutnya dibuat lewat API admin | Menyetujui order dan menerbitkan AWB, lalu memantau ringkasan serta daftar pesanan pada portal. Master hub, akun internal, serta antrean dan laporan lintas hub sudah tersedia di API tetapi belum berlayar. Tidak menangani transisi fisik paket. |
| Operator hub (`HUB_OPERATOR`) | Dibuat ops admin, terikat satu hub | Menetapkan kurir pickup, memindai paket masuk dan retur, mengelompokkan paket per zona, membentuk tugas antar, mencatat serah terima ke kurir, serta memutuskan jadwal ulang atau retur. |
| Kurir (`COURIER`) | Dibuat ops admin, terikat hub dan zona | Memenuhi tugas `PICKUP` dan/atau `DELIVERY` sesuai zona, memotret bukti pickup dan serah terima, melaporkan hasil antar. |
| Toko (`SELLER`) | Master data internal | Menjadi asal paket. Tidak memiliki panel tersendiri pada MVP. |

`PICKUP` dan `DELIVERY` adalah **jenis tugas**, bukan dua role login. Keduanya memakai role `COURIER`, sementara `courier_zones.service_type` menentukan izin kerja. Satu kurir boleh memiliki keduanya, tetapi setiap aksi tetap memeriksa role, penugasan, hub, dan zona.

Izin hub punya dua tingkat. Endpoint **baca** hub terbuka bagi ops admin maupun operator hub yang bersangkutan, sedangkan endpoint **aksi** hub hanya untuk operator hub pemilik hub itu. Jadi ops admin berhak membaca antrean tiap hub melalui API, dan tidak dapat memindai paket atau membentuk tugas antar. Yang perlu dicatat: pada portal, layar ops admin baru mencakup ringkasan dan pesanan, sehingga antrean hub belum tampil di sana.

## 4. Perjalanan pengguna utama

**Pembeli.** Daftar dengan nama, nomor HP, alamat, dan kode pos → login → pilih baju → checkout tanpa pembayaran, dengan data profil terisi otomatis → pesanan tercatat sebagai `PENDING_APPROVAL` tanpa AWB → setelah admin menyetujui, AWB muncul pada riwayat → memantau perjalanan → menerima kabar saat kurir mulai mengantar, gagal, dijadwalkan ulang, atau berhasil → mengonfirmasi penerimaan.

**Ops admin.** Membuka daftar pesanan → memeriksa alamat, cakupan kode pos, dan berat/dimensi akhir → menyetujui, sehingga satu transaksi membuat shipment, AWB, parcel, rencana rute, dan tugas pickup → memantau ringkasan dan daftar pesanan. Ia tidak menangani transisi fisik paket; antrean dan laporan tiap hub tersedia di API tetapi belum muncul pada portal.

**Operator hub.** Melihat paket yang menuju hubnya → menetapkan kurir pickup untuk paket yang menunggu dijemput → memindai paket tiba sehingga custody berpindah ke hub dan paket masuk antrean siap antar → membentuk tugas antar untuk satu zona dan satu kurir → mencatat serah terima fisik → memindai paket gagal yang kembali → memutuskan jadwal ulang atau retur.

**Kurir.** Menerima tugas pickup → memenuhi tugas di toko dengan bukti foto → menerima atau menolak tugas antar → memulai pengantaran setelah serah terima → mencatat hasil per AWB: berhasil dengan nama penerima dan foto, atau gagal dengan alasan dan foto opsional.

## 5. Ruang lingkup fitur

Prioritas mengikuti [FRD](FRD.md): `P0` wajib untuk demo, `P1` menyusul. Cakupan di bawah ini menyebut apa yang sudah terpasang di aplikasi; beberapa kemampuan hanya ada di API dan ditandai pada [FRD](FRD.md).

| Kelompok | Cakupan | Prioritas | ID FRD |
| --- | --- | --- | --- |
| Akun dan sesi | Register publik (selalu `BUYER`), login bersama untuk dua aplikasi, role membawa pengguna ke halaman yang sesuai | P0 | AUTH-01, AUTH-02 |
| Katalog dan checkout | Produk satu toko, prefill profil, snapshot penerima, `checkout_key` idempoten, tanpa pembayaran | P0 | CAT-01, CAT-02, CAT-03, CAT-04 |
| Persetujuan dan AWB | Persetujuan order, validasi cakupan, AWB unik sekali terbit, tugas pickup otomatis | P0 | ORD-01 |
| Master hub | Hub, zona layanan, cakupan kode pos, pemilihan satu hub pengantaran dari alamat penerima | P0 | HUB-01 |
| Pickup | Penetapan kurir pickup oleh operator hub, penerimaan tugas, penyelesaian dengan bukti foto | P0 | HUB-02, PUP-01, PUP-02 |
| Penerimaan hub | Pemindaian paket tiba, perpindahan custody, antrean siap antar per zona | P0 | HUB-03 |
| Penugasan antar | Pembentukan tugas antar per hub/zona, pemilihan kurir sesuai zona dan kapasitas, jawaban kurir | P0 | DSP-01, DSP-02, DSP-03 |
| Saran urutan antar | Urutan stop dari koordinat hub dan alamat, dapat dikoreksi operator | P1 | DSP-04 |
| Hasil antar | Berhasil dengan foto wajib, gagal dengan alasan wajib, riwayat percobaan append-only | P0 | DLV-01, DLV-02 |
| Retur dan jadwal ulang | Pemindaian retur fisik, lalu keputusan jadwal ulang atau retur oleh operator hub, percobaan berikutnya pada AWB yang sama | P0 | DLV-03, DLV-04 |
| Pelacakan | Pencarian AWB setelah login, timeline tersanitasi, foto privat hanya untuk pihak berwenang, konfirmasi penerimaan | P0 | TRK-01, TRK-02 |
| Kontak pembeli | Tombol telepon dan catatan membuka kontak untuk petugas berwenang | P0 | COM-01 |
| Notifikasi (catatan) | Laravel mencatat satu notifikasi per peristiwa lengkap dengan penerima logis, template, dan tautan. Statusnya `SIMULATED` selama mode MOCK dan tidak pernah diklaim terkirim | P0 | MSG-01 |
| Pengiriman pesan ke Telegram/WhatsApp | **Belum diimplementasikan.** Rencananya memakai n8n plus adapter akun pribadi, beserta alur pairing pembeli | P1 | COM-02, MSG-02 |
| Laporan | Laporan harian per hub tanpa menghitung satu AWB dua kali | P0 | RPT-01 |

## 6. Aturan domain kunci

Aturan berikut adalah inti produk; sebagian besar ditegakkan di database dan service Laravel.

1. **Order mendahului shipment.** Checkout hanya membuat order `PENDING_APPROVAL`. Shipment dan AWB baru lahir setelah persetujuan, dalam satu transaksi bersama parcel, rencana rute, dan tugas pickup.
2. **Cakupan menentukan hub.** Hanya kode pos yang punya cakupan `DELIVERY` yang dapat disetujui. Alamat di luar cakupan ditahan untuk koreksi, tidak diam-diam diarahkan ke hub asal.
3. **Pickup berangkat dari toko.** Pickup selalu dimulai di lokasi toko, bukan alamat pembeli. Untuk demo, paket dibawa langsung ke hub pengantaran; tidak ada transit antarahub.
4. **Foto adalah syarat, bukan pelengkap.** Tugas pickup tidak dapat selesai dan percobaan antar tidak dapat dinyatakan berhasil tanpa rujukan foto yang sah. Kegagalan boleh disertai foto, tetapi tidak wajib.
5. **Hanya pemegang tugas yang boleh melapor.** Operator hub memindai perpindahan fisik paket; ia tidak dapat mengunggah foto atas nama kurir, dan kurir lain tidak dapat melapor pada tugas yang bukan miliknya.
6. **Custody berpindah secara eksplisit.** Urutannya `SELLER` → `COURIER` saat pickup → `HUB` saat paket tiba → `COURIER` saat serah terima → `RECIPIENT` saat diterima. Setelah gagal, paket tetap di tangan kurir sampai hub memindai retur.
7. **Riwayat tidak dapat diubah.** Baris `delivery_attempts` dan `tracking_events` bersifat append-only, dijaga trigger database. Kegagalan pertama tetap tersimpan setelah percobaan kedua berhasil.
8. **Jadwal ulang menunggu retur fisik.** Keputusan jadwal ulang baru boleh dibuat setelah paket benar-benar kembali ke hub; `RETURN_REQUESTED` bukan bukti paket sudah sampai di toko.
9. **Menolak tugas bukan kegagalan kirim.** Menolak tugas antar sebelum berangkat tidak membuat percobaan antar; hanya kegagalan di alamat yang membuatnya. Tugas pickup belum dapat ditolak pada MVP.
10. **Notifikasi tidak boleh berbohong.** Selama pengiriman nyata belum aktif, semua catatan notifikasi berakhir `SIMULATED` dan tidak pernah ditampilkan sebagai terkirim. `SENT` baru sah bila adapter mengonfirmasi pengiriman sungguhan.
11. **Nomor HP bukan identitas Telegram.** Aturan ini berlaku untuk tahap pengiriman pesan yang menyusul: pembeli harus menghubungkan akunnya sendiri dengan kode sekali pakai dan dapat mencabut izinnya. Nomor HP pada order tetap dipakai sebagai kontak telepon.
12. **Aksi mutasi aman diulang.** Checkout memakai `checkout_key`, persetujuan berulang mengembalikan AWB yang sama, hasil antar unik per penugasan, dan notifikasi memakai `dedupe_key`.
13. **Transisi fisik adalah pekerjaan hub.** Keputusan jadwal ulang dan retur, pemindaian paket, serta pembentukan tugas antar hanya dapat dilakukan operator hub yang memiliki hub tersebut — bukan ops admin. Ops admin hanya berhak membaca data hub melalui API, dan portalnya belum menyediakan layar untuk itu.

## 7. Data demo

Fixture demo disiapkan lewat migration dan seeder, bukan data pribadi dari mesin pengembang.

- **Jaringan hub:** 10 hub di DKI Jakarta (Kebayoran Baru, Tebet, Cakung, Duren Sawit, Kembangan, Palmerah, Kelapa Gading, Penjaringan, Gambir, Tanah Abang) dengan 12 zona layanan.
- **Cakupan kode pos:** 12 kode pos, satu di antaranya punya cakupan `ORIGIN` untuk toko dan semuanya punya cakupan `DELIVERY`. Keunikan baris adalah `(postcode, purpose, hub_id)`, sehingga satu kode pos boleh dilayani beberapa hub; data demo saat ini memakai satu hub per kode pos. Karena hanya satu kode pos yang punya cakupan `ORIGIN`, seluruh paket demo berangkat dari hub Jakarta Selatan.
- **Katalog:** satu toko baju beserta empat produk contoh (`BAJU-001` sampai `BAJU-004`).
- **Akun:** satu akun per role untuk pengujian, ditambah daftar operator hub dan kurir lengkap. Setiap akun demo memakai kata sandi `anteraja123`.
- **Volume transaksi:** ratusan order dan shipment, puluhan tugas antar, kendala gagal kirim, dan riwayat percobaan, sehingga antrean operator benar-benar berisi saat demo.

## 8. Kebutuhan non-fungsional

- **Keamanan sesi:** autentikasi memakai cookie sesi Laravel dan CSRF. Paket Sanctum tidak dipasang; endpoint CSRF hanya jembatan kompatibilitas klien. Setiap aplikasi dapat memakai sesi terpisah per tab.
- **Privasi berkas:** semua foto bukti disimpan pada disk privat. Database hanya menyimpan kunci berkas, dan API memeriksa izin sebelum mengirim gambar. Halaman pelacakan tidak pernah memuat foto, alamat lengkap, atau nomor telepon.
- **Konsistensi data:** identitas unik, foreign key, kecocokan zona dengan hub, dan larangan penugasan aktif ganda ditegakkan di database; transisi status, kapasitas kurir, dan pemeriksaan role ditegakkan di Laravel dalam satu transaksi.
- **Keterbacaan status:** aplikasi menampilkan 16 status shipment dalam bahasa Indonesia yang konsisten dengan nilai enum di database.
- **Ketahanan integrasi:** alur logistik tidak bergantung pada pengiriman pesan. Laravel hanya mencatat notifikasi, sehingga ketiadaan adapter Telegram/n8n tidak menghambat proses dan status pelacakan tetap dapat dibaca.
- **Pengembangan lokal:** PostgreSQL, satu API, dan dua frontend dapat dijalankan pada satu mesin tanpa layanan berbayar. Urutan rute memakai layanan OSRM lokal bila tersedia, dan UI tetap berfungsi tanpanya.

## 9. Ukuran keberhasilan

Demo dinilai berhasil bila:

1. Satu alur utuh berjalan dari checkout sampai paket diterima, termasuk satu kegagalan dan satu pengantaran ulang yang berhasil pada AWB yang sama.
2. Pemisahan izin terbukti: kurir tidak dapat menyentuh tugas kurir lain, operator hub lain ditolak, ops admin tidak dapat melakukan transisi fisik hub, dan pembeli tidak dapat melihat order pembeli lain.
3. Paket gagal tidak menciptakan percobaan antar sebelum kurir berangkat, dan tidak dapat ditugaskan ulang sebelum retur dipindai.
4. Bukti foto hanya dapat dibuka pihak berwenang, dan tidak muncul pada halaman pelacakan.
5. Percobaan pertama tetap terbaca setelah percobaan kedua, termasuk waktu, aktor, dan alasan.
6. Catatan notifikasi jujur: tidak ada `SIMULATED` yang ditampilkan sebagai terkirim, dan pengiriman ke akun nyata tidak diklaim sebelum adapter melaporkan hasilnya.
7. Laporan harian per hub konsisten dengan jumlah paket, tanpa menghitung satu AWB dua kali.

## 10. Asumsi dan risiko

| Asumsi/risiko | Sikap |
| --- | --- |
| Pengiriman pesan otomatis adalah salah satu keluaran wajib brief dan baru akan dikerjakan menyusul. Adapter akun pribadi rawan waktu karena butuh login sesi, peer, dan izin. | Alur logistik dirancang tetap berjalan tanpa pengiriman pesan; yang tersedia sekarang adalah catatan notifikasi dengan status apa adanya, bukan klaim terkirim. |
| AWB yang dipakai adalah nomor internal demo. | Dinyatakan terbuka pada dokumen dan UI; integrasi resmi ada di luar lingkup. |
| Jaringan hub disederhanakan: satu hub pengantaran per paket, tanpa transit antarahub. | Model hub dan `hub_links` sudah tersedia sebagai ruang ekspansi tanpa mengubah alur gagal kirim. |
| Saran urutan stop memakai koordinat dan jarak sederhana. | UI menyebutnya saran, bukan jaminan rute tercepat. Operator tetap dapat mengoreksi urutan. |
| Cakupan kode pos demo tidak mewakili seluruh DKI. | Alamat di luar cakupan ditahan untuk koreksi, bukan ditebak. Karena tidak ada penolakan order, order tersebut berhenti di antrean tanpa keputusan. |
| Beberapa kemampuan hanya ada di API: master hub, akun internal, antrean/laporan lintas hub, dan alur pairing Telegram. | Dicatat apa adanya pada [FRD](FRD.md); belum dihitung sebagai bagian demo sampai layarnya tersedia. |
| Dua frontend berbagi akun dan database, sehingga berbagi sesi lintas aplikasi menuntut konfigurasi cookie, domain, CSRF, dan CORS yang benar. | Didokumentasikan sebagai batasan; setiap aplikasi dapat memakai sesi per tab. |

## 11. Alur demo yang diperagakan

1. Pembeli checkout baju; pesanan tetap ada setelah refresh dan belum punya AWB.
2. Ops admin menyetujui; AWB terbit dan muncul pada riwayat katalog serta pencarian di portal.
3. Operator hub menetapkan kurir pickup; kurir menyelesaikan tugas di toko dengan bukti foto otomatis.
4. Operator hub pengantaran memindai paket tiba; paket masuk antrean siap antar.
5. Operator menyusun tugas antar untuk satu zona dan satu kurir; urutan stop disarankan lalu dikoreksi bila perlu.
6. Kurir menerima tugas, serah terima dicatat, kurir mulai mengantar, pembeli menerima kabar.
7. Kurir gagal karena penerima tidak ada; alasan tersimpan dan pembeli serta petugas hub diberi tahu.
8. Operator memindai paket kembali ke hub; operator hub menjadwalkan ulang.
9. Percobaan kedua berhasil dengan foto oleh kurir antar; riwayat dua percobaan dan laporan terlihat.
