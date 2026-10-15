# Fashionaja

Fashionaja adalah aplikasi katalog pakaian. Frontend memakai React, TypeScript, Vite, Tailwind CSS v4, React Router DOM, dan React Icons. Pembeli membuat akun, memilih pakaian, checkout tanpa pembayaran untuk demo, lalu melihat riwayat pesanan. Nomor resi dapat disalin dari detail pesanan saat sudah tersedia. Foto katalog dan identitas merek disimpan sebagai aset lokal.

## Menjalankan lokal

Jalankan backend Laravel terlebih dahulu di `http://localhost:8000`, lalu dari folder ini:

```bash
npm install
npm run dev
```

Katalog tersedia di `http://localhost:5173`. Vite mem-proxy API, login, register, logout, dan CSRF ke Laravel. Halaman masuk berada di `/masuk`, halaman daftar di `/daftar`; katalog `/`, pesanan `/pesanan`, checkout `/checkout`, dan profil `/akun`. Backend Laravel perlu berjalan agar login dan data katalog dapat dimuat. `npm run build` menghasilkan berkas produksi.

## Struktur frontend

`src/main.tsx` memasang React Router langsung tanpa `App.tsx`. Alur halaman dan state katalog berada di `src/routes`, halaman di `src/pages`, komponen bersama di `src/components`, komunikasi Laravel di `src/services`, fungsi format di `src/utils`, dan kontrak data di `src/types`. Seluruh tampilan memakai Tailwind CSS; tidak memakai CSS Module.

## Dua subdomain, satu sumber data

Rencana deploy: `katalog.rianyuliawan.my.id` untuk Fashionaja dan `hackathon-anteraja.rianyuliawan.my.id` untuk portal Anteraja. Keduanya adalah frontend berbeda. Hanya Laravel yang mengakses PostgreSQL; Fashionaja membaca dan membuat pesanan melalui API Laravel. Satu database cukup untuk demo ini. Jika kelak Fashionaja benar-benar dioperasikan pihak ketiga, pindahkan data toko ke layanan tersendiri dan integrasikan pesanan melalui API dengan autentikasi antar layanan.

Untuk deploy lintas subdomain, atur `VITE_API_BASE_URL=https://hackathon-anteraja.rianyuliawan.my.id` pada build katalog. Di Laravel, set `APP_URL`, `CATALOG_PUBLIC_URL`, `OPS_PUBLIC_URL`, `SESSION_DOMAIN=.rianyuliawan.my.id`, `SESSION_SECURE_COOKIE=true`, dan `CORS_ALLOWED_ORIGINS=https://katalog.rianyuliawan.my.id,https://hackathon-anteraja.rianyuliawan.my.id`. Pastikan cookie sesi, cookie XSRF, dan respons CORS benar di hosting HTTPS. Kredensial pengguna sama untuk dua aplikasi; setiap aplikasi dapat memeriksa sesi lewat `/api/v1/me`.

Keranjang tersimpan di `localStorage`; pesanan, riwayat, akun, dan resi tersimpan di PostgreSQL melalui Laravel. PWA menyimpan kerangka aplikasi dan aset statis, sedangkan API dan data pribadi tidak di-cache.

## Pasang sebagai aplikasi

Buka Fashionaja di browser, lalu tekan **Pasang aplikasi** pada halaman masuk atau di kanan atas katalog. Pada Chrome/Edge, browser dapat menampilkan dialog instalasi. Pada iPhone/iPad, gunakan menu **Bagikan → Tambahkan ke Layar Utama** di Safari; pada Android, gunakan **Instal aplikasi** atau **Tambahkan ke layar utama** dari menu Chrome. Tombol yang sama menampilkan petunjuk jika dialog instalasi tidak tersedia. Gunakan HTTPS saat membuka dari ponsel; `localhost` hanya berlaku pada perangkat yang menjalankan server.
