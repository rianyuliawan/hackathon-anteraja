<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(file_get_contents(database_path('satria-schema.sql')));
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
            DROP TABLE IF EXISTS daily_reports, notifications, telegram_links,
              telegram_pairing_requests, notification_targets, tracking_events,
              shipment_issues, delivery_attempts, run_shipments, delivery_runs,
              pickup_assignments, pickup_tasks, route_stops, route_plans,
              parcels, shipments, courier_zones, courier_profiles, order_items,
              orders, products, seller_locations, seller_profiles, hub_links,
              postal_coverages, service_zones, user_roles, hubs, users CASCADE;
            DROP FUNCTION IF EXISTS prevent_audit_mutation();
        SQL);
    }
};
