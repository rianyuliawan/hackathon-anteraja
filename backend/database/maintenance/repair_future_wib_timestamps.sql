-- One-time repair for WIB wall-clock values previously written to a UTC
-- PostgreSQL connection. Run only after setting DB_TIMEZONE=Asia/Jakarta.
-- Deliberately exclude scheduled delivery fields, provider sent_at times,
-- and append-only tracking_events.
BEGIN;

DO $$
DECLARE
    entry record;
    affected integer;
BEGIN
    FOR entry IN
        SELECT * FROM (VALUES
            ('daily_reports', 'generated_at'),
            ('delivery_runs', 'assigned_at'),
            ('delivery_runs', 'responded_at'),
            ('notifications', 'created_at'),
            ('notifications', 'updated_at'),
            ('orders', 'reviewed_at'),
            ('orders', 'created_at'),
            ('orders', 'updated_at'),
            ('pickup_assignments', 'assigned_at'),
            ('pickup_assignments', 'responded_at'),
            ('pickup_assignments', 'picked_up_at'),
            ('pickup_tasks', 'ready_at'),
            ('pickup_tasks', 'created_at'),
            ('route_plans', 'created_at'),
            ('route_stops', 'arrived_at'),
            ('run_shipments', 'handed_over_at'),
            ('run_shipments', 'returned_at'),
            ('shipment_issues', 'decided_at'),
            ('shipment_issues', 'created_at'),
            ('shipments', 'delivered_at'),
            ('shipments', 'created_at'),
            ('shipments', 'updated_at'),
            ('user_roles', 'created_at'),
            ('users', 'created_at'),
            ('users', 'updated_at')
        ) AS columns_to_repair(table_name, column_name)
    LOOP
        EXECUTE format(
            'UPDATE %I SET %I = %I - interval ''7 hours'' WHERE %I > now() + interval ''5 minutes'' AND %I <= now() + interval ''7 hours 5 minutes''',
            entry.table_name, entry.column_name, entry.column_name,
            entry.column_name, entry.column_name
        );
        GET DIAGNOSTICS affected = ROW_COUNT;
        IF affected > 0 THEN
            RAISE NOTICE '%.%: % rows repaired', entry.table_name, entry.column_name, affected;
        END IF;
    END LOOP;
END $$;

COMMIT;
