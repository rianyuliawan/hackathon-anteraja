# ERD logis — Fashionaja dan Anteraja

ERD ini mengikuti [PRD](PRD.md), [FRD](FRD.md), dan [schema PostgreSQL](../backend/database/satria-schema.sql). Diagram dibagi dua agar relasinya terbaca; `USER`, `HUB`, `SERVICE_ZONE`, dan `SHIPMENT` yang muncul pada kedua diagram adalah **entitas yang sama**, bukan tabel duplikat. Diagram menonjolkan kunci dan relasi; daftar kolom serta constraint inti ada di schema dan migrasi Laravel. Fashionaja dan Anteraja memakai satu database melalui Laravel API. Banyak `HUB` tersedia sebagai master data DKI, tetapi satu shipment pada alur MVP memakai **hub penanganan yang sama** untuk koordinasi pickup dan delivery. `HUB_LINK`/rute antarahub ada pada schema sebagai ruang ekspansi, belum menjadi langkah bisnis aktif.

## 1. Toko baju, checkout, AWB, dan hub tujuan

```mermaid
erDiagram
    USER ||--o{ USER_ROLE : memiliki
    HUB |o--o{ USER_ROLE : cakupan_operator
    USER ||--o{ ORDER : membuat
    USER ||--o| SELLER_PROFILE : profil_seller
    SELLER_PROFILE ||--o{ SELLER_LOCATION : lokasi_pickup
    SELLER_PROFILE ||--o{ PRODUCT : menjual
    SELLER_PROFILE ||--o{ ORDER : memenuhi
    SELLER_LOCATION ||--o{ ORDER : asal_paket
    PRODUCT ||--o{ ORDER_ITEM : dipilih
    ORDER ||--|{ ORDER_ITEM : berisi
    ORDER ||--o| SHIPMENT : menghasilkan_setelah_approval
    SHIPMENT ||--|{ PARCEL : memuat
    HUB ||--o{ POSTAL_COVERAGE : melayani
    SERVICE_ZONE ||--o{ POSTAL_COVERAGE : zona_layanan
    HUB ||--o{ SERVICE_ZONE : membagi_area
    HUB ||--o{ HUB_LINK : dari
    HUB ||--o{ HUB_LINK : menuju
    HUB ||--o{ SHIPMENT : hub_asal
    HUB ||--o{ SHIPMENT : hub_terakhir
    SERVICE_ZONE ||--o{ SHIPMENT : zona_pickup
    SERVICE_ZONE ||--o{ SHIPMENT : zona_antar
    SHIPMENT ||--|{ ROUTE_PLAN : memiliki_versi
    ROUTE_PLAN ||--|{ ROUTE_STOP : terdiri_dari
    HUB ||--o{ ROUTE_STOP : disinggahi
    HUB ||--o{ DAILY_REPORT : dilaporkan

    USER {
        bigint id PK
        string email UK
        string password "hash Laravel"
        string name
        string phone
        timestamp telegram_opt_in_at "nullable; persetujuan pelanggan"
        string default_address "nullable untuk akun internal"
        string default_postcode "nullable untuk akun internal"
        boolean active
    }
    USER_ROLE {
        bigint id PK
        bigint user_id FK
        string role
        bigint hub_id FK "nullable; cakupan operator"
    }
    SELLER_PROFILE {
        bigint user_id PK, FK
        string store_name
        boolean active
    }
    SELLER_LOCATION {
        bigint id PK
        bigint seller_user_id FK
        string address
        string postcode
        string contact_name
        string contact_phone
        boolean active
    }
    PRODUCT {
        bigint id PK
        bigint seller_user_id FK
        string sku UK
        string name
        money price
        int weight_grams
        int length_mm
        int width_mm
        int height_mm
        boolean active
    }
    ORDER {
        bigint id PK
        string order_no UK
        string checkout_key UK
        string channel "CATALOG atau MANUAL"
        bigint customer_id FK
        bigint seller_user_id FK
        bigint seller_location_id FK
        string status
        string origin_address_snapshot
        string origin_contact_snapshot
        string origin_postcode
        string destination_address_snapshot
        decimal destination_latitude "opsional, untuk saran stop"
        decimal destination_longitude "opsional, untuk saran stop"
        string recipient_name
        string recipient_phone
        string destination_postcode
        int estimated_weight_grams
        int estimated_length_mm
        int estimated_width_mm
        int estimated_height_mm
        money subtotal
        money shipping_fee
        bigint reviewed_by FK
        datetime reviewed_at
        string rejection_reason "kolom historis; UI aktif tidak menolak order"
    }
    ORDER_ITEM {
        bigint order_id PK, FK
        bigint product_id PK, FK
        int quantity
        string product_name_snapshot
        money price_snapshot
    }
    SHIPMENT {
        bigint id PK
        bigint order_id FK
        string awb UK
        bigint origin_hub_id FK
        bigint delivery_hub_id FK
        bigint pickup_zone_id FK
        bigint delivery_zone_id FK
        string status
        string custody_type
        bigint current_hub_id FK "nullable"
        bigint current_courier_id FK "nullable"
        datetime delivered_at
    }
    PARCEL {
        bigint id PK
        bigint shipment_id FK
        int weight_grams
        int length_mm
        int width_mm
        int height_mm
        datetime measured_at
    }
    HUB {
        bigint id PK
        string code UK
        string name
        decimal latitude "opsional"
        decimal longitude "opsional"
        boolean active
    }
    POSTAL_COVERAGE {
        bigint id PK
        string postcode
        string purpose "ORIGIN atau DELIVERY"
        bigint hub_id FK
        bigint zone_id FK "wajib untuk kedua purpose"
    }
    SERVICE_ZONE {
        bigint id PK
        bigint hub_id FK
        string code
        string name
    }
    HUB_LINK {
        bigint from_hub_id PK, FK
        bigint to_hub_id PK, FK
        int routing_cost
        boolean active
    }
    ROUTE_PLAN {
        bigint id PK
        bigint shipment_id FK
        int version
        boolean active
        string change_reason
    }
    ROUTE_STOP {
        bigint id PK
        bigint route_plan_id FK
        int sequence_no
        bigint hub_id FK
        datetime arrived_at
        datetime departed_at
    }
    DAILY_REPORT {
        bigint id PK
        date report_date
        bigint hub_id FK
        int shipments_created
        int delivered
        int failed_attempts
        int redelivered
    }
```

**Makna penting:** satu toko baju/lokasi pickup serta produk dummy dibuat lewat seed, tanpa panel seller pada MVP. `USER` pembeli menyimpan profil default; `ORDER` menyimpan salinan nama/nomor/alamat tujuan ketika checkout agar histori tidak berubah jika profil diedit. `checkout_key` mencegah checkout ganda. Order sudah tersimpan sebagai `PENDING_APPROVAL` tanpa AWB; `SHIPMENT` baru muncul setelah ACC. `PARCEL` menyimpan berat/dimensi fisik. `POSTAL_COVERAGE` asal mengoordinasikan area pickup toko, sedangkan cakupan tujuan memilih **satu hub pengantaran** dari beberapa hub dummy. Demo membuat satu `ROUTE_PLAN` aktif dan satu `ROUTE_STOP` pada hub yang benar-benar menerima paket. Pada approval saat ini, `origin_hub_id` dan `delivery_hub_id` diisi hub terpilih yang sama. Route plan aktif memiliki satu stop pada hub tersebut. Struktur dua kolom tetap mendukung perluasan kelak.

## 2. Pickup, zona kurir, percobaan antar, dan notifikasi

```mermaid
erDiagram
    USER ||--o| COURIER_PROFILE : profil_kurir
    HUB ||--o{ COURIER_PROFILE : basis
    COURIER_PROFILE ||--o{ COURIER_ZONE : cakupan
    SERVICE_ZONE ||--o{ COURIER_ZONE : memiliki_kurir
    SHIPMENT ||--o| PICKUP_TASK : perlu_dijemput
    PICKUP_TASK ||--o{ PICKUP_ASSIGNMENT : penugasan
    COURIER_PROFILE ||--o{ PICKUP_ASSIGNMENT : menjemput
    HUB ||--o{ DELIVERY_RUN : dispatch_dari
    SERVICE_ZONE ||--o{ DELIVERY_RUN : fokus_zona
    COURIER_PROFILE ||--o{ DELIVERY_RUN : menjalankan
    DELIVERY_RUN ||--|{ RUN_SHIPMENT : berisi
    SHIPMENT ||--o{ RUN_SHIPMENT : ditugaskan_ulang
    RUN_SHIPMENT ||--o| DELIVERY_ATTEMPT : percobaan_fisik
    SHIPMENT ||--o{ SHIPMENT_ISSUE : kendala
    DELIVERY_ATTEMPT ||--o| SHIPMENT_ISSUE : memicu
    SHIPMENT ||--o{ TRACKING_EVENT : riwayat
    USER |o--o{ TRACKING_EVENT : pelaku
    TRACKING_EVENT ||--o| TRACKING_EVENT_TIME_CORRECTION : koreksi_waktu_historis
    TRACKING_EVENT |o--o{ NOTIFICATION : memicu
    USER |o--o{ NOTIFICATION_TARGET : penerima_user
    HUB |o--o{ NOTIFICATION_TARGET : penerima_hub
    NOTIFICATION_TARGET ||--o{ NOTIFICATION : tujuan
    USER ||--o{ TELEGRAM_PAIRING_REQUEST : meminta_tautan
    USER ||--o| TELEGRAM_LINK : memiliki_peer_terverifikasi

    COURIER_PROFILE {
        bigint user_id PK, FK
        bigint home_hub_id FK
        int max_parcels
        int max_weight_grams
        boolean available
    }
    COURIER_ZONE {
        bigint courier_user_id PK, FK
        bigint zone_id PK, FK
        string service_type PK "PICKUP atau DELIVERY"
    }
    PICKUP_TASK {
        bigint id PK
        bigint shipment_id FK, UK
        string status
        datetime ready_at
    }
    PICKUP_ASSIGNMENT {
        bigint id PK
        bigint pickup_task_id FK
        bigint courier_user_id FK
        bigint assigned_by FK
        datetime scheduled_at
        datetime responded_at
        datetime picked_up_at
        datetime failed_at
        string status
        string failure_reason
        string pickup_photo_ref "wajib saat COMPLETED"
    }
    DELIVERY_RUN {
        bigint id PK
        bigint hub_id FK
        bigint zone_id FK
        bigint courier_user_id FK
        date service_date
        string status
        bigint assigned_by FK
    }
    RUN_SHIPMENT {
        bigint id PK
        bigint run_id FK
        bigint shipment_id FK
        int stop_order
        string status
        datetime handed_over_at
        datetime returned_at
    }
    DELIVERY_ATTEMPT {
        bigint id PK
        bigint run_shipment_id FK
        bigint shipment_id FK
        int attempt_no
        string result
        string failure_reason
        string recipient_name
        string delivery_photo_ref "wajib jika DELIVERED"
        datetime attempted_at
    }
    SHIPMENT_ISSUE {
        bigint id PK
        bigint shipment_id FK
        bigint delivery_attempt_id FK, UK
        string status
        string decision
        datetime scheduled_redelivery_at
        bigint decided_by FK
        datetime decided_at
    }
    TRACKING_EVENT {
        bigint id PK
        bigint shipment_id FK
        bigint actor_user_id FK
        bigint hub_id FK "nullable"
        string event_type
        string status_after
        datetime occurred_at
        json details
    }
    TRACKING_EVENT_TIME_CORRECTION {
        bigint tracking_event_id PK, FK
        datetime original_occurred_at
        datetime corrected_occurred_at
        string reason
        datetime created_at
    }
    NOTIFICATION_TARGET {
        bigint id PK
        bigint user_id FK "atau hub_id"
        bigint hub_id FK "atau user_id"
        string channel
        string destination
    }
    TELEGRAM_PAIRING_REQUEST {
        bigint id PK
        bigint user_id FK
        string code_hash UK
        datetime expires_at
        datetime consumed_at
    }
    TELEGRAM_LINK {
        bigint user_id PK, FK
        bigint peer_id UK
        string username
        datetime verified_at
        datetime consented_at
        datetime revoked_at
    }
    NOTIFICATION {
        bigint id PK
        bigint tracking_event_id FK "nullable untuk laporan"
        bigint shipment_id FK "nullable"
        bigint target_id FK
        string logical_recipient
        string channel
        string delivery_mode "MOCK atau LIVE"
        string template_key
        string dedupe_key UK
        string action_url
        string actual_destination
        string status
        string provider_message_id
        int attempts
        datetime sent_at
        string last_error
    }
```

**Makna penting:** `TRACKING_EVENT_TIME_CORRECTION` adalah overlay satu-ke-nol/ satu untuk memperbaiki pembacaan waktu event historis yang pernah tersimpan tujuh jam terlalu maju. Event asli tetap append-only; tracking dan laporan memakai waktu efektif `corrected_occurred_at` jika ada. Tabel ini ditambahkan lewat [migrasi Laravel](../backend/database/migrations/2026_10_15_180231_create_tracking_event_time_corrections_table.php). Satu `PICKUP_TASK` dibuat per shipment setelah ACC; `PICKUP_ASSIGNMENT` menyimpan kurir pickup. Penugasan yang ditolak/gagal tetap tersimpan. Hanya kurir pemilik tugas dapat menyelesaikan pickup dengan **foto di toko**. Satu `DELIVERY_RUN` milik satu kurir, satu tanggal layanan, dan satu zona antar. UI tidak mewajibkan pembagian tiga sesi waktu. `RUN_SHIPMENT` menghubungkan banyak shipment ke run; shipment gagal dapat muncul lagi pada run berikutnya. `DELIVERY_ATTEMPT` dibuat saat kurir pemilik run melaporkan hasil; tugas yang ditolak bukan percobaan. Hasil `DELIVERED` mensyaratkan **foto serah terima**. Rujukan foto menunjuk file pada storage privat, bukan foto BLOB/URL publik. Gagal antar membuka `SHIPMENT_ISSUE` untuk keputusan **operator hub** setelah paket kembali dikonfirmasi di hub. Baris attempt dan event append-only. `TELEGRAM_PAIRING_REQUEST` dan `TELEGRAM_LINK` mendukung pairing opsional. Untuk notifikasi LIVE, Laravel dapat memakai link aktif **atau nomor pada akun user** yang valid, bila akun staf/lama ada dalam allowlist atau pembeli baru telah menyetujui Telegram (`USER.telegram_opt_in_at`). Data seed tidak memiliki persetujuan ini. Provider masih dapat menolak nomor tersebut; hasilnya dicatat `FAILED`. Nomor snapshot penerima pada order tidak otomatis menjadi peer terverifikasi. `NOTIFICATION` mencatat penerima logis, tujuan aktual, mode MOCK/LIVE, deduplikasi, serta hasil pengiriman. `DAILY_REPORT` menyimpan ringkasan per hub/hari.

## 3. Kardinalitas dan aturan data

| Relasi/aturan | Keputusan |
| --- | --- |
| `SELLER_PROFILE` → `PRODUCT`/`SELLER_LOCATION`/`ORDER` | Satu order hanya memakai produk dan satu lokasi milik seller yang sama; alamat pickup disalin ke order agar histori tidak berubah bila lokasi seller diedit. |
| Katalog React → `ORDER` | Katalog adalah frontend; `ORDER` dan `SHIPMENT` berada pada PostgreSQL milik Laravel. API riwayat menampilkan AWB setelah ACC tanpa database kedua. |
| `ORDER` → `SHIPMENT` | 1:0..1; order menunggu approval belum punya shipment/AWB. Satu order yang disetujui menghasilkan satu shipment. |
| `SHIPMENT` → `PARCEL` | 1:N secara model; demo memakai satu parcel per AWB. |
| `SHIPMENT` → `PICKUP_TASK` → `PICKUP_ASSIGNMENT` | Maksimal satu tugas pickup per shipment, tetapi bisa beberapa penugasan berurutan. Hanya satu penugasan yang boleh aktif; pickup sukses hanya sekali per AWB. |
| `SHIPMENT` → `ROUTE_PLAN` → `ROUTE_STOP` | Demo: satu versi aktif dan satu stop pada hub pengantaran. Hub koordinator pickup dan delivery sama pada approval MVP. |
| `POSTAL_COVERAGE` | Satu pasangan `(postcode, purpose)` memilih satu hub dan zona layanan. `DELIVERY` memilih hub/zona penanganan. `ORIGIN` tetap tersedia pada master cakupan, tetapi approval MVP menempatkan kedua peran hub pada hub tujuan yang sama. Bila satu kecamatan mempunyai dua hub, postcode contoh dibagi tanpa cakupan yang tumpang tindih. |
| `COURIER_PROFILE` ↔ `SERVICE_ZONE` | M:N melalui `COURIER_ZONE`; `service_type` menentukan apakah kurir boleh pickup, antar, atau keduanya di zona itu. |
| `DELIVERY_RUN` → `RUN_SHIPMENT` | 1:N; semua item harus cocok dengan hub dan zona run. Satu shipment maksimal punya satu item penugasan yang masih aktif. |
| `SHIPMENT` → `DELIVERY_ATTEMPT` | 1:N melalui `RUN_SHIPMENT`. Nomor percobaan unik per shipment; hasil lama tidak ditimpa. |
| Foto pickup/delivery | `PICKUP_ASSIGNMENT.pickup_photo_ref` wajib saat COMPLETED; `DELIVERY_ATTEMPT.delivery_photo_ref` wajib saat DELIVERED. Foto gagal opsional. Laravel memverifikasi kurir login adalah pemilik assignment/run dan membatasi pembacaan file privat. |
| `DELIVERY_ATTEMPT` → `SHIPMENT_ISSUE` | Percobaan gagal membuka kendala; operator hub mencatat keputusan dan jadwal setelah paket kembali. |
| Gagal kirim dan custody | Sesudah gagal, `custody_type = COURIER`. Konfirmasi retur oleh operator hub mengubahnya ke `HUB`; baru setelah itu dibuat penugasan ulang. |
| Pengembalian ke seller | Keputusan operator hub menghasilkan `RETURN_REQUESTED`; `RETURNED_TO_SELLER` baru setelah serah terima fisik. |
| Pickup dan custody | Sebelum pickup, `custody_type = SELLER`; foto/scan pickup memindahkannya ke `COURIER`; scan masuk **hub pengantaran terpilih** memindahkannya ke `HUB`. Hub lain tidak boleh menerima sebelum pickup sukses. |
| Konfirmasi pembeli | Dicatat sebagai `TRACKING_EVENT` baru pada shipment yang sudah `DELIVERED`; data percobaan kurir tidak diubah. |
| Koreksi waktu audit | `TRACKING_EVENT` → `TRACKING_EVENT_TIME_CORRECTION` adalah 1:0..1. Baris audit asli tidak diubah; waktu efektif dipakai pada tracking pelanggan/operator, prioritas paket, dan laporan. |
| Telegram demo | Adapter MTProto menyimpan sesi pengirim secara privat. Pairing `TELEGRAM_PAIRING_REQUEST` → `TELEGRAM_LINK` tersedia secara opsional; LIVE dapat mencoba nomor akun staf/lama yang masuk allowlist atau pembeli baru yang memiliki `telegram_opt_in_at`. Nomor snapshot order tidak dianggap peer terverifikasi. Pembeli dapat mencabut persetujuan di profil; akun user dapat mencabut link (`revoked_at`). |
| Notifikasi n8n | `dedupe_key` unik per event, penerima, dan template. MOCK berakhir `SIMULATED`; LIVE baru boleh `SENT` setelah adapter mengonfirmasi. Tugas kurir diputuskan di Laravel. |

Perhitungan jalur, pemeriksaan role, kapasitas kurir, kepemilikan produk oleh seller, dan transisi status tetap merupakan aturan Laravel. Schema menegakkan identitas unik, foreign key, kecocokan zona dengan hub, serta larangan penugasan aktif ganda. Laravel membuat event dan notifikasi bersama perubahan status dalam satu transaksi.
