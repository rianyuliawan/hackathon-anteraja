-- Read-only assertions for schema.sql + seed.sql on a new demo database.
DO $$
DECLARE
    pending_id BIGINT;
    ready_shipment_id BIGINT;
BEGIN
    IF (SELECT count(*) FROM hubs) <> 3 THEN
        RAISE EXCEPTION 'Expected 3 seeded hubs';
    END IF;
    IF (SELECT count(*) FROM products) <> 4 THEN
        RAISE EXCEPTION 'Expected 4 seeded clothing products';
    END IF;
    IF (SELECT count(*) FROM users WHERE email LIKE '%@satria.test') <> 8 THEN
        RAISE EXCEPTION 'Expected 8 seeded users';
    END IF;
    SELECT id INTO pending_id FROM orders
    WHERE checkout_key = '00000000-0000-4000-8000-000000000001'
      AND status = 'PENDING_APPROVAL';
    IF pending_id IS NULL OR EXISTS
        (SELECT 1 FROM shipments WHERE order_id = pending_id) THEN
        RAISE EXCEPTION 'Pending demo order must exist without AWB';
    END IF;
    SELECT id INTO ready_shipment_id FROM shipments
    WHERE awb = 'AWB-SEED-20261013-001'
      AND status = 'READY_FOR_PICKUP'
      AND custody_type = 'SELLER';
    IF ready_shipment_id IS NULL THEN
        RAISE EXCEPTION 'Expected ready-for-pickup AWB';
    END IF;
    IF (SELECT count(*) FROM route_stops rs
        JOIN route_plans rp ON rp.id = rs.route_plan_id
        JOIN hubs h ON h.id = rs.hub_id
        WHERE rp.shipment_id = ready_shipment_id AND h.code = 'HUB-JT') <> 1 THEN
        RAISE EXCEPTION 'Demo shipment must visit exactly its delivery hub';
    END IF;
    IF (SELECT count(*) FROM pickup_tasks WHERE shipment_id = ready_shipment_id
         AND status = 'READY_FOR_PICKUP') <> 1 THEN
        RAISE EXCEPTION 'Ready demo shipment lacks pickup task';
    END IF;
    IF EXISTS (SELECT 1 FROM telegram_links)
       OR EXISTS (SELECT 1 FROM pickup_assignments WHERE pickup_photo_ref IS NOT NULL)
       OR EXISTS (SELECT 1 FROM delivery_attempts WHERE delivery_photo_ref IS NOT NULL) THEN
        RAISE EXCEPTION 'Seed must not fabricate Telegram links or photos';
    END IF;
    RAISE NOTICE 'seed_ok: 3 hubs, 4 products, pending order, ready AWB, one hub stop, no fake Telegram/photo';
END;
$$;
