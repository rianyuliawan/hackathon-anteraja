-- Small, repeatable demo fixture for a NEW database created with schema.sql.
-- All names, addresses and phone numbers below are fictional test data.
-- Password for every seeded account: DemoSatria#2026 (bcrypt hash only).
-- No Telegram peer, Telegram session, or photo is fabricated by this seed.
BEGIN;

INSERT INTO hubs (code, name, address, latitude, longitude) VALUES
('HUB-JS', 'Hub Demo Jakarta Selatan', 'Area Kebayoran Baru, Jakarta Selatan', -6.243000, 106.800000),
('HUB-JT', 'Hub Demo Jakarta Timur', 'Area Cakung, Jakarta Timur', -6.179000, 106.944000),
('HUB-JB', 'Hub Demo Jakarta Barat', 'Area Kembangan, Jakarta Barat', -6.190000, 106.738000)
ON CONFLICT (code) DO NOTHING;

INSERT INTO service_zones (hub_id, code, name)
SELECT h.id, z.code, z.name
FROM (VALUES
    ('HUB-JS','KEBAYORAN','Kebayoran Baru - pickup'),
    ('HUB-JS','TEBET','Tebet - delivery'),
    ('HUB-JT','CAKUNG','Cakung - delivery'),
    ('HUB-JT','KELAPA_GADING','Kelapa Gading - delivery'),
    ('HUB-JB','KEMBANGAN','Kembangan - delivery')
) AS z(hub_code, code, name)
JOIN hubs h ON h.code = z.hub_code
ON CONFLICT (hub_id, code) DO NOTHING;

INSERT INTO postal_coverages (postcode, purpose, hub_id, zone_id)
SELECT c.postcode, c.purpose, h.id, z.id
FROM (VALUES
    ('12130','ORIGIN','HUB-JS','KEBAYORAN'),
    ('12130','DELIVERY','HUB-JS','KEBAYORAN'),
    ('12810','DELIVERY','HUB-JS','TEBET'),
    ('13910','DELIVERY','HUB-JT','CAKUNG'),
    ('14240','DELIVERY','HUB-JT','KELAPA_GADING'),
    ('11610','DELIVERY','HUB-JB','KEMBANGAN')
) AS c(postcode, purpose, hub_code, zone_code)
JOIN hubs h ON h.code = c.hub_code
JOIN service_zones z ON z.hub_id = h.id AND z.code = c.zone_code
ON CONFLICT (postcode, purpose) DO NOTHING;

INSERT INTO users (email, password, name, phone, default_address, default_postcode) VALUES
('ops@satria.test', '$2y$12$5KeUkXZ/5jrADAH.DOKVUe9MT2zRcCzKrZvG/safc/djwPcOLnhMq', 'Ops Admin Demo', NULL, NULL, NULL),
('hub.jt@satria.test', '$2y$12$5KeUkXZ/5jrADAH.DOKVUe9MT2zRcCzKrZvG/safc/djwPcOLnhMq', 'Operator Hub Timur Demo', NULL, NULL, NULL),
('hub.js@satria.test', '$2y$12$5KeUkXZ/5jrADAH.DOKVUe9MT2zRcCzKrZvG/safc/djwPcOLnhMq', 'Operator Hub Selatan Demo', NULL, NULL, NULL),
('pickup@satria.test', '$2y$12$5KeUkXZ/5jrADAH.DOKVUe9MT2zRcCzKrZvG/safc/djwPcOLnhMq', 'Kurir Pickup Demo', NULL, NULL, NULL),
('courier.cakung@satria.test', '$2y$12$5KeUkXZ/5jrADAH.DOKVUe9MT2zRcCzKrZvG/safc/djwPcOLnhMq', 'Kurir Cakung Demo', NULL, NULL, NULL),
('courier.kelapa@satria.test', '$2y$12$5KeUkXZ/5jrADAH.DOKVUe9MT2zRcCzKrZvG/safc/djwPcOLnhMq', 'Kurir Kelapa Gading Demo', NULL, NULL, NULL),
('seller@satria.test', '$2y$12$5KeUkXZ/5jrADAH.DOKVUe9MT2zRcCzKrZvG/safc/djwPcOLnhMq', 'Toko Baju Demo', NULL, NULL, NULL),
('buyer@satria.test', '$2y$12$5KeUkXZ/5jrADAH.DOKVUe9MT2zRcCzKrZvG/safc/djwPcOLnhMq', 'Pembeli Demo', '+620000000001', 'Alamat contoh Cakung, Jakarta Timur', '13910')
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_roles (user_id, role)
SELECT u.id, r.role
FROM (VALUES
    ('ops@satria.test','OPS_ADMIN'),
    ('pickup@satria.test','COURIER'),
    ('courier.cakung@satria.test','COURIER'),
    ('courier.kelapa@satria.test','COURIER'),
    ('seller@satria.test','SELLER'),
    ('buyer@satria.test','BUYER')
) AS r(email, role)
JOIN users u ON u.email = r.email
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role, hub_id)
SELECT u.id, 'HUB_OPERATOR', h.id
FROM (VALUES
    ('hub.jt@satria.test','HUB-JT'),
    ('hub.js@satria.test','HUB-JS')
) AS r(email, hub_code)
JOIN users u ON u.email = r.email
JOIN hubs h ON h.code = r.hub_code
ON CONFLICT DO NOTHING;

INSERT INTO seller_profiles (user_id, store_name)
SELECT id, 'Satria Fashion Demo' FROM users WHERE email = 'seller@satria.test'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO seller_locations (seller_user_id, address, postcode, contact_name, contact_phone)
SELECT id, 'Alamat contoh Kebayoran Baru, Jakarta Selatan', '12130',
       'Petugas Toko Demo', '+620000000002'
FROM users WHERE email = 'seller@satria.test'
AND NOT EXISTS (
    SELECT 1 FROM seller_locations sl
    WHERE sl.seller_user_id = users.id AND sl.postcode = '12130'
);

INSERT INTO products (seller_user_id, sku, name, price, weight_grams,
                      length_mm, width_mm, height_mm)
SELECT u.id, p.sku, p.name, p.price, p.weight_grams, p.length_mm, p.width_mm, p.height_mm
FROM users u
CROSS JOIN (VALUES
    ('BAJU-001','Kaus Katun Basic',129000,350,300,250,40),
    ('BAJU-002','Kemeja Linen',189000,420,320,260,50),
    ('BAJU-003','Hoodie Fleece',249000,750,350,300,100),
    ('BAJU-004','Jaket Denim',319000,900,380,320,110)
) AS p(sku,name,price,weight_grams,length_mm,width_mm,height_mm)
WHERE u.email = 'seller@satria.test'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO courier_profiles (user_id, home_hub_id, max_parcels, max_weight_grams)
SELECT u.id, h.id, 10, 15000
FROM (VALUES
    ('pickup@satria.test','HUB-JS'),
    ('courier.cakung@satria.test','HUB-JT'),
    ('courier.kelapa@satria.test','HUB-JT')
) AS p(email, hub_code)
JOIN users u ON u.email = p.email
JOIN hubs h ON h.code = p.hub_code
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO courier_zones (courier_user_id, zone_id, service_type)
SELECT u.id, z.id, c.service_type
FROM (VALUES
    ('pickup@satria.test','HUB-JS','KEBAYORAN','PICKUP'),
    ('courier.cakung@satria.test','HUB-JT','CAKUNG','DELIVERY'),
    ('courier.kelapa@satria.test','HUB-JT','KELAPA_GADING','DELIVERY')
) AS c(email, hub_code, zone_code, service_type)
JOIN users u ON u.email = c.email
JOIN hubs h ON h.code = c.hub_code
JOIN service_zones z ON z.hub_id = h.id AND z.code = c.zone_code
ON CONFLICT DO NOTHING;

-- A pending checkout proves that an order exists without a shipment/AWB.
INSERT INTO orders (
    order_no, checkout_key, customer_id, seller_user_id, seller_location_id,
    status, origin_address_snapshot, origin_contact_snapshot, origin_postcode,
    destination_address_snapshot, recipient_name, recipient_phone,
    destination_postcode, estimated_weight_grams, estimated_length_mm,
    estimated_width_mm, estimated_height_mm, subtotal
)
SELECT 'ORD-SEED-PENDING-001', '00000000-0000-4000-8000-000000000001',
       buyer.id, seller.id, sl.id, 'PENDING_APPROVAL',
       sl.address, sl.contact_name, sl.postcode,
       buyer.default_address, buyer.name, buyer.phone, buyer.default_postcode,
       350, 300, 250, 40, 129000
FROM users buyer
JOIN users seller ON seller.email = 'seller@satria.test'
JOIN seller_locations sl ON sl.seller_user_id = seller.id AND sl.postcode = '12130'
WHERE buyer.email = 'buyer@satria.test'
ON CONFLICT (checkout_key) DO NOTHING;

INSERT INTO order_items (order_id, product_id, quantity, product_name_snapshot, price_snapshot)
SELECT o.id, p.id, 1, p.name, p.price
FROM orders o JOIN products p ON p.sku = 'BAJU-001'
WHERE o.checkout_key = '00000000-0000-4000-8000-000000000001'
ON CONFLICT (order_id, product_id) DO NOTHING;

-- A second order is approved and ready for a courier to photograph pickup.
INSERT INTO orders (
    order_no, checkout_key, customer_id, seller_user_id, seller_location_id,
    status, origin_address_snapshot, origin_contact_snapshot, origin_postcode,
    destination_address_snapshot, recipient_name, recipient_phone,
    destination_postcode, destination_latitude, destination_longitude,
    estimated_weight_grams, estimated_length_mm, estimated_width_mm,
    estimated_height_mm, subtotal, reviewed_by, reviewed_at
)
SELECT 'ORD-SEED-READY-001', '00000000-0000-4000-8000-000000000002',
       buyer.id, seller.id, sl.id, 'APPROVED',
       sl.address, sl.contact_name, sl.postcode,
       buyer.default_address, buyer.name, buyer.phone, buyer.default_postcode,
       -6.179500, 106.944500, 420, 320, 260, 50, 189000, ops.id, now()
FROM users buyer
JOIN users seller ON seller.email = 'seller@satria.test'
JOIN users ops ON ops.email = 'ops@satria.test'
JOIN seller_locations sl ON sl.seller_user_id = seller.id AND sl.postcode = '12130'
WHERE buyer.email = 'buyer@satria.test'
ON CONFLICT (checkout_key) DO NOTHING;

INSERT INTO order_items (order_id, product_id, quantity, product_name_snapshot, price_snapshot)
SELECT o.id, p.id, 1, p.name, p.price
FROM orders o JOIN products p ON p.sku = 'BAJU-002'
WHERE o.checkout_key = '00000000-0000-4000-8000-000000000002'
ON CONFLICT (order_id, product_id) DO NOTHING;

INSERT INTO shipments (
    order_id, awb, origin_hub_id, delivery_hub_id, pickup_zone_id,
    delivery_zone_id, status, custody_type
)
SELECT o.id, 'AWB-SEED-20261013-001', hs.id, hd.id, zs.id, zd.id,
       'READY_FOR_PICKUP', 'SELLER'
FROM orders o
JOIN hubs hs ON hs.code = 'HUB-JS'
JOIN hubs hd ON hd.code = 'HUB-JT'
JOIN service_zones zs ON zs.hub_id = hs.id AND zs.code = 'KEBAYORAN'
JOIN service_zones zd ON zd.hub_id = hd.id AND zd.code = 'CAKUNG'
WHERE o.checkout_key = '00000000-0000-4000-8000-000000000002'
ON CONFLICT (order_id) DO NOTHING;

INSERT INTO parcels (shipment_id, parcel_no, weight_grams, length_mm, width_mm, height_mm)
SELECT s.id, 1, 420, 320, 260, 50 FROM shipments s
WHERE s.awb = 'AWB-SEED-20261013-001'
ON CONFLICT (shipment_id, parcel_no) DO NOTHING;

INSERT INTO route_plans (shipment_id, version, active, change_reason)
SELECT id, 1, TRUE, 'Demo: langsung dari toko ke hub tujuan'
FROM shipments WHERE awb = 'AWB-SEED-20261013-001'
ON CONFLICT (shipment_id, version) DO NOTHING;

INSERT INTO route_stops (route_plan_id, sequence_no, hub_id)
SELECT rp.id, 1, h.id
FROM route_plans rp
JOIN shipments s ON s.id = rp.shipment_id AND s.awb = 'AWB-SEED-20261013-001'
JOIN hubs h ON h.code = 'HUB-JT'
WHERE rp.version = 1
ON CONFLICT (route_plan_id, sequence_no) DO NOTHING;

INSERT INTO pickup_tasks (shipment_id, status, ready_at)
SELECT id, 'READY_FOR_PICKUP', now()
FROM shipments WHERE awb = 'AWB-SEED-20261013-001'
ON CONFLICT (shipment_id) DO NOTHING;

INSERT INTO tracking_events (shipment_id, actor_user_id, event_type, status_after,
                             details)
SELECT s.id, ops.id, 'AWB_CREATED', 'READY_FOR_PICKUP',
       '{"source":"seed","message":"Resi demo diterbitkan"}'::jsonb
FROM shipments s
JOIN users ops ON ops.email = 'ops@satria.test'
WHERE s.awb = 'AWB-SEED-20261013-001'
AND NOT EXISTS (SELECT 1 FROM tracking_events te
                WHERE te.shipment_id = s.id AND te.event_type = 'AWB_CREATED')
;

INSERT INTO notification_targets (user_id, channel, destination)
SELECT u.id, 'TELEGRAM', NULL
FROM users u
WHERE u.email IN ('ops@satria.test', 'hub.jt@satria.test',
                  'pickup@satria.test', 'courier.cakung@satria.test',
                  'courier.kelapa@satria.test', 'buyer@satria.test')
ON CONFLICT DO NOTHING;

COMMIT;
