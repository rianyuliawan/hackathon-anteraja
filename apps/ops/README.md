# Anteraja — portal pengiriman dan operasional

Frontend React + TypeScript + Tailwind CSS + React Router untuk ops admin, operator hub, kurir, pembeli, dan pelacakan resi setelah login. Ini adalah portal pengiriman yang terhubung ke API Laravel yang sama dengan katalog baju.

## Menjalankan

Siapkan PostgreSQL, jalankan migrasi/seed dan server Laravel. Lihat [alur dan arsitektur](../../docs/ALUR_DAN_ARSITEKTUR.md) serta [FRD](../../docs/FRD.md) untuk urutan layanan dan alur data. Dari folder `apps/ops`:

```bash
cp .env.example .env
npm install
npm run dev
```

Buka `http://localhost:5174`. Untuk memeriksa build produksi, jalankan `npm run build`; hasilnya berada di `dist/`. `npm run preview` menyajikan hasil build untuk pemeriksaan lokal.

`VITE_PROXY_TARGET` pada `.env` menunjuk ke Laravel (default `http://127.0.0.1:8000`). Vite meneruskan `/api`, `/sanctum`, `/login`, `/logout`, dan `/register` ke backend, sehingga cookie session dan CSRF dapat digunakan pada origin lokal yang sama. `VITE_API_ORIGIN` boleh dikosongkan selama memakai proxy; jika frontend dan backend dideploy pada origin berbeda, isi alamat API dan sesuaikan CORS serta domain cookie Laravel. `VITE_CATALOG_URL` menunjuk ke aplikasi katalog (default `http://localhost:5173`).

## Akun contoh untuk alur demo

Seluruh akun berikut memakai kata sandi `anteraja123`. Identitas dan alamat email ini adalah data fiktif untuk pengembangan; daftar lengkap kurir dan operator tersedia di seed backend.

| Peran | Email | Area |
| --- | --- | --- |
| Ops admin | `dimas.pratama@anteraja.id` | Semua hub |
| Operator hub | `fajar.hidayat@anteraja.id` | Cakung |
| Operator hub | `rani.putri@anteraja.id` | Kebayoran Baru |
| Kurir pickup | `bagus.setiawan@anteraja.id` | Kebayoran Baru |
| Kurir antar | `andika.wijaya@anteraja.id` | Cakung |
| Kurir antar | `reza.firmansyah@anteraja.id` | Kelapa Gading |
| Pembeli | `siti.nurhaliza@anteraja.id` | Cakung |
| Penjual | `maya.kusuma@anteraja.id` | Kebayoran Baru |

Login tersedia di `/masuk`. Pendaftaran pembeli tersedia di halaman `/daftar` Anteraja maupun di katalog. Keduanya membuat akun `BUYER` pada backend yang sama. Akun kurir, operator hub, dan ops admin dibuat oleh ops admin; formulir pendaftaran tidak menyediakan pilihan peran. Semua halaman Anteraja, termasuk pelacakan AWB, meminta login. Setelah login atau daftar, peran dari server menentukan halaman awal. Akses langsung ke halaman milik peran lain dialihkan ke halaman awal peran akun.

## PWA dan batas offline

Portal dapat dipasang dari tombol **Pasang aplikasi** di halaman masuk, header, atau menu aplikasi. Pada Chrome/Edge, browser dapat menampilkan dialog instalasi; pada Safari iPhone/iPad, gunakan **Bagikan → Tambahkan ke Layar Utama**. Tombol menampilkan petunjuk jika dialog tidak tersedia. Gunakan HTTPS untuk mengakses dari ponsel; `localhost` hanya berlaku pada perangkat yang menjalankan server. Manifest, ikon, dan service worker menyediakan shell antarmuka ketika koneksi terputus. Permintaan API, autentikasi, data paket pribadi, dan foto **tidak** disimpan offline; scan, penugasan, dan bukti foto membutuhkan koneksi sebelum bisa dikirim. Foto pickup contoh dipasang otomatis pada saat konfirmasi pickup; gunakan kamera ponsel untuk bukti pengantaran nyata dan pastikan hasil unggahan tercatat sebelum berpindah tugas. Fitur install bergantung pada dukungan dan kriteria browser.

Kontak Telegram dibuat melalui persetujuan dan pairing akun pembeli pada backend. Nomor telepon tidak otomatis menjadi identitas Telegram. Tautan kontak dan catatan komunikasi menggunakan API yang sama; aplikasi ini tidak mengirim chat langsung dari browser.
