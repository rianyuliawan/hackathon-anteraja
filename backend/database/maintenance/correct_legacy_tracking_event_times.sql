-- One-time, idempotent repair for the 48 audit events written seven hours ahead
-- on 15 October 2026. Preserve tracking_events; render corrected time via overlay.
-- Apply after create_tracking_event_time_corrections_table migration and a private pg_dump.
BEGIN;

DO $$
DECLARE
    event_count integer;
    already_corrected integer;
BEGIN
    SELECT count(*) INTO event_count
    FROM tracking_events
    WHERE id BETWEEN 1780 AND 1827
      AND occurred_at::date = DATE '2026-10-15';
    IF event_count <> 48 THEN
        RAISE EXCEPTION 'Expected 48 legacy tracking events; found %', event_count;
    END IF;

    SELECT count(*) INTO already_corrected
    FROM tracking_event_time_corrections
    WHERE tracking_event_id BETWEEN 1780 AND 1827;
    IF already_corrected NOT IN (0, 48) THEN
        RAISE EXCEPTION 'Partial correction detected: % rows', already_corrected;
    END IF;

    INSERT INTO tracking_event_time_corrections
        (tracking_event_id, original_occurred_at, corrected_occurred_at, reason)
    SELECT id, occurred_at, occurred_at - interval '7 hours',
        'Legacy WIB timestamp stored seven hours ahead before database timezone repair'
    FROM tracking_events
    WHERE id BETWEEN 1780 AND 1827
    ON CONFLICT (tracking_event_id) DO NOTHING;
END $$;

COMMIT;
