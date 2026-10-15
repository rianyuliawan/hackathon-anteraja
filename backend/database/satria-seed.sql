-- Data contoh operasional Jakarta untuk database kosong; semua identitas adalah fiktif.
-- Password seluruh akun contoh: anteraja123 (disimpan sebagai bcrypt).
-- Nomor telepon contoh bukan akun Telegram yang telah terverifikasi.
BEGIN;

INSERT INTO hubs (code, name, address, latitude, longitude) VALUES
('HUB-JS', 'Hub Kebayoran Baru', 'Kebayoran Baru, Jakarta Selatan', -6.243, 106.8),
('HUB-JST', 'Hub Tebet', 'Tebet, Jakarta Selatan', -6.229, 106.852),
('HUB-JT', 'Hub Cakung', 'Cakung, Jakarta Timur', -6.179, 106.944),
('HUB-JTD', 'Hub Duren Sawit', 'Duren Sawit, Jakarta Timur', -6.234, 106.914),
('HUB-JB', 'Hub Kembangan', 'Kembangan, Jakarta Barat', -6.19, 106.738),
('HUB-JBP', 'Hub Palmerah', 'Palmerah, Jakarta Barat', -6.202, 106.797),
('HUB-JU', 'Hub Kelapa Gading', 'Kelapa Gading, Jakarta Utara', -6.16, 106.905),
('HUB-JUP', 'Hub Penjaringan', 'Penjaringan, Jakarta Utara', -6.126, 106.798),
('HUB-JP', 'Hub Gambir', 'Gambir, Jakarta Pusat', -6.175, 106.829),
('HUB-JPT', 'Hub Tanah Abang', 'Tanah Abang, Jakarta Pusat', -6.191, 106.811)
ON CONFLICT (code) DO NOTHING;

INSERT INTO service_zones (hub_id, code, name)
SELECT h.id, z.code, z.name FROM (VALUES
('HUB-JS', 'KEBAYORAN', 'Kebayoran Baru'),
('HUB-JST', 'TEBET', 'Tebet'),
('HUB-JT', 'CAKUNG', 'Cakung'),
('HUB-JTD', 'DUREN_SAWIT', 'Duren Sawit · 13440'),
('HUB-JTD', 'PONDOK_KELAPA', 'Pondok Kelapa · 13450'),
('HUB-JTD', 'PONDOK_KOPI', 'Pondok Kopi · 13460'),
('HUB-JB', 'KEMBANGAN', 'Kembangan'),
('HUB-JBP', 'PALMERAH', 'Palmerah'),
('HUB-JU', 'KELAPA_GADING', 'Kelapa Gading'),
('HUB-JUP', 'PENJARINGAN', 'Penjaringan'),
('HUB-JP', 'GAMBIR', 'Gambir'),
('HUB-JPT', 'TANAH_ABANG', 'Tanah Abang')
) AS z(hub_code, code, name) JOIN hubs h ON h.code=z.hub_code
ON CONFLICT (hub_id, code) DO NOTHING;

INSERT INTO postal_coverages (postcode, purpose, hub_id, zone_id)
SELECT c.postcode,c.purpose,h.id,z.id FROM (VALUES
('12130', 'DELIVERY', 'HUB-JS', 'KEBAYORAN'),
('12810', 'DELIVERY', 'HUB-JST', 'TEBET'),
('13910', 'DELIVERY', 'HUB-JT', 'CAKUNG'),
('13440', 'DELIVERY', 'HUB-JTD', 'DUREN_SAWIT'),
('13450', 'DELIVERY', 'HUB-JTD', 'PONDOK_KELAPA'),
('13460', 'DELIVERY', 'HUB-JTD', 'PONDOK_KOPI'),
('11610', 'DELIVERY', 'HUB-JB', 'KEMBANGAN'),
('11480', 'DELIVERY', 'HUB-JBP', 'PALMERAH'),
('14240', 'DELIVERY', 'HUB-JU', 'KELAPA_GADING'),
('14440', 'DELIVERY', 'HUB-JUP', 'PENJARINGAN'),
('10110', 'DELIVERY', 'HUB-JP', 'GAMBIR'),
('10250', 'DELIVERY', 'HUB-JPT', 'TANAH_ABANG'),
('12130', 'ORIGIN', 'HUB-JS', 'KEBAYORAN')
) AS c(postcode,purpose,hub_code,zone_code) JOIN hubs h ON h.code=c.hub_code
JOIN service_zones z ON z.hub_id=h.id AND z.code=c.zone_code
ON CONFLICT (postcode,purpose,hub_id) DO NOTHING;

UPDATE postal_coverages AS coverage SET
latitude = center.latitude, longitude = center.longitude, map_radius_meters = center.radius
FROM (VALUES
('12130', -6.245500, 106.800500, 2200),
('12810', -6.229500, 106.852000, 2400),
('13910', -6.179000, 106.944000, 3000),
('13440', -6.230707, 106.914606, 1800),
('13450', -6.239399, 106.934894, 1700),
('13460', -6.229124, 106.944675, 1700),
('11610', -6.191000, 106.738000, 2700),
('11480', -6.202000, 106.797000, 2200),
('14240', -6.157500, 106.905500, 2400),
('14440', -6.126000, 106.798000, 2400),
('10110', -6.175000, 106.829000, 2200),
('10250', -6.191000, 106.811000, 2000)
) AS center(postcode,latitude,longitude,radius)
WHERE coverage.postcode = center.postcode;

INSERT INTO users (email,password,name,phone,default_address,default_postcode) VALUES
('dimas.pratama@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Dimas Pratama', NULL, NULL, NULL),
('rani.putri@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Rani Putri', NULL, NULL, NULL),
('tiara.anggraini@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Tiara Anggraini', NULL, NULL, NULL),
('fajar.hidayat@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Fajar Hidayat', NULL, NULL, NULL),
('yoga.saputra@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Yoga Saputra', NULL, NULL, NULL),
('nadia.salsabila@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Nadia Salsabila', NULL, NULL, NULL),
('siska.lestari@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Siska Lestari', NULL, NULL, NULL),
('rizky.maulana@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Rizky Maulana', NULL, NULL, NULL),
('hafiz.ramadhan@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Hafiz Ramadhan', NULL, NULL, NULL),
('putri.maharani@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Putri Maharani', NULL, NULL, NULL),
('ayu.wulandari@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Ayu Wulandari', NULL, NULL, NULL),
('bagus.setiawan@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Bagus Setiawan', NULL, NULL, NULL),
('ferdi.kurniawan@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Ferdi Kurniawan', NULL, NULL, NULL),
('arif.rahman@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Arif Rahman', NULL, NULL, NULL),
('dewi.kartika@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Dewi Kartika', NULL, NULL, NULL),
('bima.prakoso@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Bima Prakoso', NULL, NULL, NULL),
('aditya.nugraha@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Aditya Nugraha', NULL, NULL, NULL),
('naufal.hakim@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Naufal Hakim', NULL, NULL, NULL),
('ilham.maulana@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Ilham Maulana', NULL, NULL, NULL),
('rio.saputra@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Rio Saputra', NULL, NULL, NULL),
('andika.wijaya@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Andika Wijaya', NULL, NULL, NULL),
('galih.pratama@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Galih Pratama', NULL, NULL, NULL),
('rangga.firmansyah@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Rangga Firmansyah', NULL, NULL, NULL),
('febriansyah.putra@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Febriansyah Putra', NULL, NULL, NULL),
('agung.wicaksono@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Agung Wicaksono', NULL, NULL, NULL),
('wahyu.nugroho@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Wahyu Nugroho', NULL, NULL, NULL),
('doni.susanto@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Doni Susanto', NULL, NULL, NULL),
('eko.prasetyo@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Eko Prasetyo', NULL, NULL, NULL),
('reza.firmansyah@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Reza Firmansyah', NULL, NULL, NULL),
('irfan.fauzi@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Irfan Fauzi', NULL, NULL, NULL),
('rafi.mahendra@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Rafi Mahendra', NULL, NULL, NULL),
('raka.hidayat@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Raka Hidayat', NULL, NULL, NULL),
('danu.permana@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Danu Permana', NULL, NULL, NULL),
('hendra.santoso@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Hendra Santoso', NULL, NULL, NULL),
('fikri.ramadhan@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Fikri Ramadhan', NULL, NULL, NULL),
('bayu.prasetya@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Bayu Prasetya', NULL, NULL, NULL),
('maya.kusuma@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Maya Kusuma', NULL, NULL, NULL),
('siti.nurhaliza@anteraja.id', '$2y$12$fhSH17HikJYWq5bWTFMSIe7Il0uek9vuXhJ3hcQ3XtYeue/8uYWVu', 'Siti Nurhaliza', '+620000000001', 'Jl. Raya Bekasi No. 88, Cakung, Jakarta Timur', '13910')
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_roles (user_id,role) SELECT u.id,r.role FROM (VALUES
('dimas.pratama@anteraja.id', 'OPS_ADMIN'),
('bagus.setiawan@anteraja.id', 'COURIER'),
('ferdi.kurniawan@anteraja.id', 'COURIER'),
('arif.rahman@anteraja.id', 'COURIER'),
('dewi.kartika@anteraja.id', 'COURIER'),
('bima.prakoso@anteraja.id', 'COURIER'),
('aditya.nugraha@anteraja.id', 'COURIER'),
('naufal.hakim@anteraja.id', 'COURIER'),
('ilham.maulana@anteraja.id', 'COURIER'),
('rio.saputra@anteraja.id', 'COURIER'),
('andika.wijaya@anteraja.id', 'COURIER'),
('galih.pratama@anteraja.id', 'COURIER'),
('rangga.firmansyah@anteraja.id', 'COURIER'),
('febriansyah.putra@anteraja.id', 'COURIER'),
('agung.wicaksono@anteraja.id', 'COURIER'),
('wahyu.nugroho@anteraja.id', 'COURIER'),
('doni.susanto@anteraja.id', 'COURIER'),
('eko.prasetyo@anteraja.id', 'COURIER'),
('reza.firmansyah@anteraja.id', 'COURIER'),
('irfan.fauzi@anteraja.id', 'COURIER'),
('rafi.mahendra@anteraja.id', 'COURIER'),
('raka.hidayat@anteraja.id', 'COURIER'),
('danu.permana@anteraja.id', 'COURIER'),
('hendra.santoso@anteraja.id', 'COURIER'),
('fikri.ramadhan@anteraja.id', 'COURIER'),
('bayu.prasetya@anteraja.id', 'COURIER'),
('maya.kusuma@anteraja.id', 'SELLER'),
('siti.nurhaliza@anteraja.id', 'BUYER')
) AS r(email,role) JOIN users u ON u.email=r.email ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id,role,hub_id) SELECT u.id,'HUB_OPERATOR',h.id FROM (VALUES
('rani.putri@anteraja.id', 'HUB-JS'),
('tiara.anggraini@anteraja.id', 'HUB-JST'),
('fajar.hidayat@anteraja.id', 'HUB-JT'),
('yoga.saputra@anteraja.id', 'HUB-JTD'),
('nadia.salsabila@anteraja.id', 'HUB-JB'),
('siska.lestari@anteraja.id', 'HUB-JBP'),
('rizky.maulana@anteraja.id', 'HUB-JU'),
('hafiz.ramadhan@anteraja.id', 'HUB-JUP'),
('putri.maharani@anteraja.id', 'HUB-JP'),
('ayu.wulandari@anteraja.id', 'HUB-JPT')
) AS r(email,hub_code) JOIN users u ON u.email=r.email JOIN hubs h ON h.code=r.hub_code ON CONFLICT DO NOTHING;

INSERT INTO seller_profiles (user_id,store_name) SELECT id,'Maya Mode Jakarta' FROM users WHERE email='maya.kusuma@anteraja.id' ON CONFLICT (user_id) DO NOTHING;

INSERT INTO seller_locations (seller_user_id,address,postcode,contact_name,contact_phone) SELECT id,'Jl. Wolter Monginsidi No. 24, Kebayoran Baru, Jakarta Selatan','12130','Maya Kusuma','+620000000002' FROM users WHERE email='maya.kusuma@anteraja.id' AND NOT EXISTS (SELECT 1 FROM seller_locations sl WHERE sl.seller_user_id=users.id AND sl.postcode='12130');

INSERT INTO products (seller_user_id,sku,name,price,weight_grams,length_mm,width_mm,height_mm)
SELECT u.id,p.sku,p.name,p.price,p.weight_grams,p.length_mm,p.width_mm,p.height_mm FROM users u CROSS JOIN (VALUES
('BAJU-001', 'Kaus Katun Basic', 129000, 350, 300, 250, 40),
('BAJU-002', 'Kemeja Linen', 189000, 420, 320, 260, 50),
('BAJU-003', 'Hoodie Fleece', 249000, 750, 350, 300, 100),
('BAJU-004', 'Jaket Denim', 319000, 900, 380, 320, 110)
) AS p(sku,name,price,weight_grams,length_mm,width_mm,height_mm) WHERE u.email='maya.kusuma@anteraja.id' ON CONFLICT (sku) DO NOTHING;

INSERT INTO courier_profiles (user_id,home_hub_id,max_parcels,max_weight_grams) SELECT u.id,h.id,12,20000 FROM (VALUES
('bagus.setiawan@anteraja.id', 'HUB-JS'),
('ferdi.kurniawan@anteraja.id', 'HUB-JS'),
('arif.rahman@anteraja.id', 'HUB-JT'),
('dewi.kartika@anteraja.id', 'HUB-JB'),
('bima.prakoso@anteraja.id', 'HUB-JU'),
('aditya.nugraha@anteraja.id', 'HUB-JS'),
('naufal.hakim@anteraja.id', 'HUB-JS'),
('ilham.maulana@anteraja.id', 'HUB-JST'),
('rio.saputra@anteraja.id', 'HUB-JST'),
('andika.wijaya@anteraja.id', 'HUB-JT'),
('galih.pratama@anteraja.id', 'HUB-JT'),
('rangga.firmansyah@anteraja.id', 'HUB-JTD'),
('febriansyah.putra@anteraja.id', 'HUB-JTD'),
('agung.wicaksono@anteraja.id', 'HUB-JB'),
('wahyu.nugroho@anteraja.id', 'HUB-JB'),
('doni.susanto@anteraja.id', 'HUB-JBP'),
('eko.prasetyo@anteraja.id', 'HUB-JBP'),
('reza.firmansyah@anteraja.id', 'HUB-JU'),
('irfan.fauzi@anteraja.id', 'HUB-JU'),
('rafi.mahendra@anteraja.id', 'HUB-JUP'),
('raka.hidayat@anteraja.id', 'HUB-JUP'),
('danu.permana@anteraja.id', 'HUB-JP'),
('hendra.santoso@anteraja.id', 'HUB-JP'),
('fikri.ramadhan@anteraja.id', 'HUB-JPT'),
('bayu.prasetya@anteraja.id', 'HUB-JPT')
) AS p(email,hub_code) JOIN users u ON u.email=p.email JOIN hubs h ON h.code=p.hub_code ON CONFLICT (user_id) DO NOTHING;

INSERT INTO courier_zones (courier_user_id,zone_id,service_type) SELECT u.id,z.id,c.service_type FROM (VALUES
('bagus.setiawan@anteraja.id', 'HUB-JS', 'KEBAYORAN', 'PICKUP'),
('ferdi.kurniawan@anteraja.id', 'HUB-JS', 'KEBAYORAN', 'PICKUP'),
('arif.rahman@anteraja.id', 'HUB-JT', 'CAKUNG', 'PICKUP'),
('dewi.kartika@anteraja.id', 'HUB-JB', 'KEMBANGAN', 'PICKUP'),
('bima.prakoso@anteraja.id', 'HUB-JU', 'KELAPA_GADING', 'PICKUP'),
('aditya.nugraha@anteraja.id', 'HUB-JS', 'KEBAYORAN', 'DELIVERY'),
('naufal.hakim@anteraja.id', 'HUB-JS', 'KEBAYORAN', 'DELIVERY'),
('ilham.maulana@anteraja.id', 'HUB-JST', 'TEBET', 'DELIVERY'),
('rio.saputra@anteraja.id', 'HUB-JST', 'TEBET', 'DELIVERY'),
('andika.wijaya@anteraja.id', 'HUB-JT', 'CAKUNG', 'DELIVERY'),
('galih.pratama@anteraja.id', 'HUB-JT', 'CAKUNG', 'DELIVERY'),
('rangga.firmansyah@anteraja.id', 'HUB-JTD', 'DUREN_SAWIT', 'DELIVERY'),
('febriansyah.putra@anteraja.id', 'HUB-JTD', 'PONDOK_KELAPA', 'DELIVERY'),
('agung.wicaksono@anteraja.id', 'HUB-JB', 'KEMBANGAN', 'DELIVERY'),
('wahyu.nugroho@anteraja.id', 'HUB-JB', 'KEMBANGAN', 'DELIVERY'),
('doni.susanto@anteraja.id', 'HUB-JBP', 'PALMERAH', 'DELIVERY'),
('eko.prasetyo@anteraja.id', 'HUB-JBP', 'PALMERAH', 'DELIVERY'),
('reza.firmansyah@anteraja.id', 'HUB-JU', 'KELAPA_GADING', 'DELIVERY'),
('irfan.fauzi@anteraja.id', 'HUB-JU', 'KELAPA_GADING', 'DELIVERY'),
('rafi.mahendra@anteraja.id', 'HUB-JUP', 'PENJARINGAN', 'DELIVERY'),
('raka.hidayat@anteraja.id', 'HUB-JUP', 'PENJARINGAN', 'DELIVERY'),
('danu.permana@anteraja.id', 'HUB-JP', 'GAMBIR', 'DELIVERY'),
('hendra.santoso@anteraja.id', 'HUB-JP', 'GAMBIR', 'DELIVERY'),
('fikri.ramadhan@anteraja.id', 'HUB-JPT', 'TANAH_ABANG', 'DELIVERY'),
('bayu.prasetya@anteraja.id', 'HUB-JPT', 'TANAH_ABANG', 'DELIVERY')
) AS c(email,hub_code,zone_code,service_type) JOIN users u ON u.email=c.email JOIN hubs h ON h.code=c.hub_code JOIN service_zones z ON z.hub_id=h.id AND z.code=c.zone_code ON CONFLICT DO NOTHING;
-- A pending checkout proves that an order exists without a shipment/AWB.
INSERT INTO orders (
    order_no, checkout_key, customer_id, seller_user_id, seller_location_id,
    status, origin_address_snapshot, origin_contact_snapshot, origin_postcode,
    destination_address_snapshot, recipient_name, recipient_phone,
    destination_postcode, estimated_weight_grams, estimated_length_mm,
    estimated_width_mm, estimated_height_mm, subtotal
)
SELECT 'INV-' || to_char(now(), 'YYYYMMDD') || '-58391472', '7c24c5e1-45a8-43f5-9d36-84f2d6e31901',
       buyer.id, seller.id, sl.id, 'PENDING_APPROVAL',
       sl.address, sl.contact_name, sl.postcode,
       buyer.default_address, buyer.name, buyer.phone, buyer.default_postcode,
       350, 300, 250, 40, 129000
FROM users buyer
JOIN users seller ON seller.email = 'maya.kusuma@anteraja.id'
JOIN seller_locations sl ON sl.seller_user_id = seller.id AND sl.postcode = '12130'
WHERE buyer.email = 'siti.nurhaliza@anteraja.id'
ON CONFLICT (checkout_key) DO NOTHING;

INSERT INTO order_items (order_id, product_id, quantity, product_name_snapshot, price_snapshot)
SELECT o.id, p.id, 1, p.name, p.price
FROM orders o JOIN products p ON p.sku = 'BAJU-001'
WHERE o.checkout_key = '7c24c5e1-45a8-43f5-9d36-84f2d6e31901'
ON CONFLICT (order_id, product_id) DO NOTHING;

-- An approved order waits for pickup confirmation; the demo photo is attached at pickup completion.
INSERT INTO orders (
    order_no, checkout_key, customer_id, seller_user_id, seller_location_id,
    status, origin_address_snapshot, origin_contact_snapshot, origin_postcode,
    destination_address_snapshot, recipient_name, recipient_phone,
    destination_postcode, destination_latitude, destination_longitude,
    estimated_weight_grams, estimated_length_mm, estimated_width_mm,
    estimated_height_mm, subtotal, reviewed_by, reviewed_at
)
SELECT 'INV-' || to_char(now(), 'YYYYMMDD') || '-58391473', '8b75f413-739b-42d6-88e4-628dbe116a92',
       buyer.id, seller.id, sl.id, 'APPROVED',
       sl.address, sl.contact_name, sl.postcode,
       buyer.default_address, buyer.name, buyer.phone, buyer.default_postcode,
       -6.179500, 106.944500, 420, 320, 260, 50, 189000, ops.id, now()
FROM users buyer
JOIN users seller ON seller.email = 'maya.kusuma@anteraja.id'
JOIN users ops ON ops.email = 'dimas.pratama@anteraja.id'
JOIN seller_locations sl ON sl.seller_user_id = seller.id AND sl.postcode = '12130'
WHERE buyer.email = 'siti.nurhaliza@anteraja.id'
ON CONFLICT (checkout_key) DO NOTHING;

INSERT INTO order_items (order_id, product_id, quantity, product_name_snapshot, price_snapshot)
SELECT o.id, p.id, 1, p.name, p.price
FROM orders o JOIN products p ON p.sku = 'BAJU-002'
WHERE o.checkout_key = '8b75f413-739b-42d6-88e4-628dbe116a92'
ON CONFLICT (order_id, product_id) DO NOTHING;

INSERT INTO shipments (
    order_id, awb, origin_hub_id, delivery_hub_id, pickup_zone_id,
    delivery_zone_id, status, custody_type
)
SELECT o.id, '11007182634955', hd.id, hd.id, zd.id, zd.id,
       'READY_FOR_PICKUP', 'SELLER'
FROM orders o
JOIN hubs hd ON hd.code = 'HUB-JT'
JOIN service_zones zd ON zd.hub_id = hd.id AND zd.code = 'CAKUNG'
WHERE o.checkout_key = '8b75f413-739b-42d6-88e4-628dbe116a92'
ON CONFLICT (order_id) DO NOTHING;

INSERT INTO parcels (shipment_id, parcel_no, weight_grams, length_mm, width_mm, height_mm)
SELECT s.id, 1, 420, 320, 260, 50 FROM shipments s
WHERE s.awb = '11007182634955'
ON CONFLICT (shipment_id, parcel_no) DO NOTHING;

INSERT INTO route_plans (shipment_id, version, active, change_reason)
SELECT id, 1, TRUE, 'Langsung dari toko ke hub tujuan'
FROM shipments WHERE awb = '11007182634955'
ON CONFLICT (shipment_id, version) DO NOTHING;

INSERT INTO route_stops (route_plan_id, sequence_no, hub_id)
SELECT rp.id, 1, h.id
FROM route_plans rp
JOIN shipments s ON s.id = rp.shipment_id AND s.awb = '11007182634955'
JOIN hubs h ON h.code = 'HUB-JT'
WHERE rp.version = 1
ON CONFLICT (route_plan_id, sequence_no) DO NOTHING;

INSERT INTO pickup_tasks (shipment_id, status, ready_at)
SELECT id, 'READY_FOR_PICKUP', now()
FROM shipments WHERE awb = '11007182634955'
ON CONFLICT (shipment_id) DO NOTHING;

INSERT INTO tracking_events (shipment_id, actor_user_id, event_type, status_after,
                             details)
SELECT s.id, ops.id, 'AWB_CREATED', 'READY_FOR_PICKUP',
       '{"source":"catalog","message":"Resi diterbitkan"}'::jsonb
FROM shipments s
JOIN users ops ON ops.email = 'dimas.pratama@anteraja.id'
WHERE s.awb = '11007182634955'
AND NOT EXISTS (SELECT 1 FROM tracking_events te
                WHERE te.shipment_id = s.id AND te.event_type = 'AWB_CREATED')
;

-- Paket yang sudah melewati pickup dan tiba di hub Cakung, siap ditugaskan untuk last mile.
INSERT INTO orders (
    order_no, checkout_key, customer_id, seller_user_id, seller_location_id,
    status, origin_address_snapshot, origin_contact_snapshot, origin_postcode,
    destination_address_snapshot, recipient_name, recipient_phone,
    destination_postcode, destination_latitude, destination_longitude,
    estimated_weight_grams, estimated_length_mm, estimated_width_mm,
    estimated_height_mm, subtotal, reviewed_by, reviewed_at, created_at, updated_at
)
SELECT 'INV-' || to_char(now(), 'YYYYMMDD') || '-58391474',
       '5e12ab79-16c2-4d2e-b549-0f23b70a9d31',
       buyer.id, seller.id, sl.id, 'APPROVED',
       sl.address, sl.contact_name, sl.postcode,
       buyer.default_address, buyer.name, buyer.phone, buyer.default_postcode,
       -6.179500, 106.944500, 750, 350, 300, 100, 249000,
       ops.id, now() - interval '5 hours', now() - interval '6 hours', now() - interval '5 hours'
FROM users buyer
JOIN users seller ON seller.email = 'maya.kusuma@anteraja.id'
JOIN users ops ON ops.email = 'dimas.pratama@anteraja.id'
JOIN seller_locations sl ON sl.seller_user_id = seller.id AND sl.postcode = '12130'
WHERE buyer.email = 'siti.nurhaliza@anteraja.id'
ON CONFLICT (checkout_key) DO NOTHING;

INSERT INTO order_items (order_id, product_id, quantity, product_name_snapshot, price_snapshot)
SELECT o.id, p.id, 1, p.name, p.price
FROM orders o JOIN products p ON p.sku = 'BAJU-003'
WHERE o.checkout_key = '5e12ab79-16c2-4d2e-b549-0f23b70a9d31'
ON CONFLICT (order_id, product_id) DO NOTHING;

INSERT INTO shipments (
    order_id, awb, origin_hub_id, delivery_hub_id, pickup_zone_id,
    delivery_zone_id, status, custody_type, current_hub_id, created_at, updated_at
)
SELECT o.id, '11007182634956', hd.id, hd.id, zd.id, zd.id,
       'READY_FOR_LAST_MILE', 'HUB', hd.id, now() - interval '5 hours', now() - interval '2 hours'
FROM orders o
JOIN hubs hd ON hd.code = 'HUB-JT'
JOIN service_zones zd ON zd.hub_id = hd.id AND zd.code = 'CAKUNG'
WHERE o.checkout_key = '5e12ab79-16c2-4d2e-b549-0f23b70a9d31'
ON CONFLICT (order_id) DO NOTHING;

INSERT INTO parcels (shipment_id, parcel_no, weight_grams, length_mm, width_mm, height_mm)
SELECT id, 1, 750, 350, 300, 100 FROM shipments WHERE awb = '11007182634956'
ON CONFLICT (shipment_id, parcel_no) DO NOTHING;

INSERT INTO route_plans (shipment_id, version, active, change_reason, created_at)
SELECT id, 1, TRUE, 'Hub tujuan dipilih dari kode pos penerima', now() - interval '5 hours'
FROM shipments WHERE awb = '11007182634956'
ON CONFLICT (shipment_id, version) DO NOTHING;

INSERT INTO route_stops (route_plan_id, sequence_no, hub_id)
SELECT rp.id, 1, h.id FROM route_plans rp
JOIN shipments s ON s.id = rp.shipment_id AND s.awb = '11007182634956'
JOIN hubs h ON h.code = 'HUB-JT'
WHERE rp.version = 1
ON CONFLICT (route_plan_id, sequence_no) DO NOTHING;

INSERT INTO pickup_tasks (shipment_id, status, ready_at)
SELECT id, 'PICKED_UP', now() - interval '5 hours'
FROM shipments WHERE awb = '11007182634956'
ON CONFLICT (shipment_id) DO NOTHING;

INSERT INTO pickup_assignments (
    pickup_task_id, courier_user_id, assigned_by, status, assigned_at,
    responded_at, picked_up_at, pickup_photo_ref
)
SELECT t.id, courier.id, ops.id, 'COMPLETED', now() - interval '5 hours',
       now() - interval '4 hours 45 minutes', now() - interval '4 hours',
       'proofs/pickup/demo-pickup.jpg'
FROM pickup_tasks t
JOIN shipments s ON s.id = t.shipment_id AND s.awb = '11007182634956'
JOIN users courier ON courier.email = 'bagus.setiawan@anteraja.id'
JOIN users ops ON ops.email = 'dimas.pratama@anteraja.id'
WHERE NOT EXISTS (SELECT 1 FROM pickup_assignments a WHERE a.pickup_task_id = t.id AND a.status = 'COMPLETED');

INSERT INTO tracking_events (shipment_id, actor_user_id, event_type, status_after, details, occurred_at)
SELECT s.id, actor.id, e.event_type, e.status_after,
       jsonb_build_object('message', e.message), now() - e.age
FROM shipments s
CROSS JOIN (VALUES
    ('AWB_CREATED','READY_FOR_PICKUP','Resi diterbitkan',interval '5 hours','dimas.pratama@anteraja.id'),
    ('PICKED_UP','PICKED_UP','Paket dijemput dari toko',interval '4 hours','bagus.setiawan@anteraja.id'),
    ('ARRIVED_AT_HUB','READY_FOR_LAST_MILE','Paket tiba di hub Cakung',interval '2 hours','fajar.hidayat@anteraja.id')
) AS e(event_type,status_after,message,age,actor_email)
JOIN users actor ON actor.email = e.actor_email
WHERE s.awb = '11007182634956'
AND NOT EXISTS (SELECT 1 FROM tracking_events te WHERE te.shipment_id = s.id AND te.event_type = e.event_type);

INSERT INTO notification_targets (user_id, channel, destination)
SELECT u.id, 'TELEGRAM', NULL FROM users u
WHERE u.email LIKE '%@anteraja.id'
ON CONFLICT DO NOTHING;

COMMIT;
