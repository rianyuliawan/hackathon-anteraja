<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class LastMileDemoSeeder extends Seeder
{
    public function run(): void
    {
        $sellerLocation = DB::table('seller_locations')->orderBy('id')->first();
        $product = DB::table('products')->where('seller_user_id', $sellerLocation?->seller_user_id)
            ->orderBy('id')->first();
        $delivery = DB::table('postal_coverages')->where('postcode', '13910')
            ->where('purpose', 'DELIVERY')->where('active', true)->orderBy('id')->first();
        $admin = DB::table('user_roles')->where('role', 'OPS_ADMIN')->orderBy('user_id')->value('user_id');
        $courier = DB::table('courier_zones')->where('zone_id', $delivery?->zone_id)
            ->where('service_type', 'DELIVERY')->orderBy('courier_user_id')->value('courier_user_id');
        if (! $sellerLocation || ! $product || ! $delivery || ! $admin || ! $courier) {
            $this->command?->warn('Data toko, cakupan Cakung, admin, atau kurir belum tersedia; skenario last mile dilewati.');

            return;
        }

        $scenarios = [
            ['Ayu Lestari', 'ayu.lestari@example.test', 'Jl. Raya Bekasi No. 21, Cakung Barat', -6.176700, 106.939100, 4, 2, 'READY'],
            ['Rizky Firmansyah', 'rizky.firmansyah@example.test', 'Jl. Tipar Cakung No. 15, Cakung Barat', -6.171800, 106.943400, 19, 14, 'READY'],
            ['Nadia Putri', 'nadia.putri@example.test', 'Jl. Raya Penggilingan No. 8, Penggilingan', -6.184200, 106.949300, 28, 25, 'READY'],
            ['Bima Saputra', 'bima.saputra@example.test', 'Jl. Pulo Gebang No. 34, Cakung', -6.206500, 106.957200, 51, 47, 'READY'],
            ['Dewi Anggraini', 'dewi.anggraini@example.test', 'Jl. Komarudin No. 27, Cakung Timur', -6.177200, 106.953800, 68, 63, 'READY'],
            ['Farhan Hakim', 'farhan.hakim@example.test', 'Jl. Dr. Sumarno No. 6, Penggilingan', -6.190400, 106.944600, 13, 8, 'READY'],
            ['Salsa Maharani', 'salsa.maharani@example.test', 'Jl. Cakung Cilincing No. 12, Cakung', -6.167900, 106.939700, 35, 31, 'RETRY'],
            ['Yoga Prasetyo', 'yoga.prasetyo@example.test', 'Jl. Raya Bekasi KM 23, Cakung Timur', -6.173800, 106.955300, 42, 39, 'ISSUE'],
            ['Maya Kusuma', 'maya.kusuma@example.test', 'Jl. Senopati No. 12, Kebayoran Baru', -6.238900, 106.807400, 16, 10, 'READY', '12130'],
            ['Aditya Ramadhan', 'aditya.ramadhan@example.test', 'Jl. Tebet Barat Dalam No. 9, Tebet', -6.230100, 106.846200, 27, 20, 'READY', '12810'],
            ['Laras Wulandari', 'laras.wulandari@example.test', 'Jl. Malaka Jaya No. 17, Duren Sawit', -6.237400, 106.917700, 33, 28, 'READY', '13440'],
            ['Reza Mahendra', 'reza.mahendra@example.test', 'Jl. Kembangan Raya No. 5, Kembangan', -6.188400, 106.733600, 9, 5, 'READY', '11610'],
            ['Nabila Zahra', 'nabila.zahra@example.test', 'Jl. Palmerah Utara No. 20, Palmerah', -6.200100, 106.800800, 52, 44, 'READY', '11480'],
            ['Taufik Hidayat', 'taufik.hidayat@example.test', 'Jl. Boulevard Raya No. 15, Kelapa Gading', -6.155800, 106.908300, 22, 17, 'READY', '14240'],
            ['Citra Amelia', 'citra.amelia@example.test', 'Jl. Pluit Selatan No. 11, Penjaringan', -6.127800, 106.793600, 38, 31, 'READY', '14440'],
            ['Fikri Setiawan', 'fikri.setiawan@example.test', 'Jl. Veteran No. 8, Gambir', -6.173100, 106.831700, 14, 9, 'READY', '10110'],
            ['Intan Permata', 'intan.permata@example.test', 'Jl. K.H. Mas Mansyur No. 6, Tanah Abang', -6.193200, 106.812800, 61, 54, 'READY', '10250'],

        ];

        foreach ($scenarios as $index => $scenario) {
            [$name, $email, $address, $latitude, $longitude, $createdHours, $arrivedHours, $state] = $scenario;
            $postcode = $scenario[8] ?? '13910';
            $delivery = DB::table('postal_coverages')->where('postcode', $postcode)
                ->where('purpose', 'DELIVERY')->where('active', true)->orderBy('id')->first();
            $courier = DB::table('courier_zones')->where('zone_id', $delivery?->zone_id)
                ->where('service_type', 'DELIVERY')->orderBy('courier_user_id')->value('courier_user_id');
            if (! $delivery || ! $courier) {
                $this->command?->warn("Skenario {$postcode} dilewati karena hub atau kurir belum tersedia.");

                continue;
            }
            $checkoutKey = sprintf('9d260000-0000-4000-8000-%012d', $index + 1);
            if (DB::table('orders')->where('checkout_key', $checkoutKey)->exists()) {
                continue;
            }
            DB::transaction(function () use ($index, $name, $email, $address, $latitude, $longitude,
                $createdHours, $arrivedHours, $state, $checkoutKey, $sellerLocation, $product, $delivery, $admin, $courier, $postcode): void {
                $userId = DB::table('users')->where('email', $email)->value('id');
                if (! $userId) {
                    $userId = DB::table('users')->insertGetId([
                        'email' => $email, 'password' => Hash::make('anteraja123'),
                        'name' => $name, 'phone' => sprintf('+620000000%03d', $index + 101),
                        'default_address' => $address, 'default_postcode' => $postcode,
                    ]);
                    DB::table('user_roles')->insert([
                        'user_id' => $userId, 'role' => 'BUYER', 'created_at' => now(),
                    ]);
                }
                $createdAt = now()->subHours($createdHours);
                $arrivedAt = now()->subHours($arrivedHours);
                $initialHubAt = $state === 'READY' ? $arrivedAt : $createdAt->copy()->addHour();
                $awb = sprintf('1100826000%04d', $index + 401);
                $orderId = DB::table('orders')->insertGetId([
                    'order_no' => 'FA-'.now()->format('Ymd').'-'.sprintf('%06d', $index + 401),
                    'checkout_key' => $checkoutKey,
                    'customer_id' => $userId,
                    'seller_user_id' => $sellerLocation->seller_user_id,
                    'seller_location_id' => $sellerLocation->id,
                    'status' => 'APPROVED',
                    'origin_address_snapshot' => $sellerLocation->address,
                    'origin_contact_snapshot' => $sellerLocation->contact_name,
                    'origin_postcode' => $sellerLocation->postcode,
                    'destination_address_snapshot' => $address,
                    'destination_latitude' => $latitude,
                    'destination_longitude' => $longitude,
                    'recipient_name' => $name,
                    'recipient_phone' => sprintf('+620000000%03d', $index + 101),
                    'destination_postcode' => $postcode,
                    'estimated_weight_grams' => $product->weight_grams,
                    'estimated_length_mm' => $product->length_mm,
                    'estimated_width_mm' => $product->width_mm,
                    'estimated_height_mm' => $product->height_mm,
                    'subtotal' => $product->price,
                    'reviewed_by' => $admin, 'reviewed_at' => $createdAt,
                    'created_at' => $createdAt, 'updated_at' => $createdAt,
                ]);
                DB::table('order_items')->insert([
                    'order_id' => $orderId, 'product_id' => $product->id,
                    'quantity' => 1, 'product_name_snapshot' => $product->name,
                    'price_snapshot' => $product->price,
                ]);
                $shipmentId = DB::table('shipments')->insertGetId([
                    'order_id' => $orderId, 'awb' => $awb,
                    'origin_hub_id' => $delivery->hub_id, 'delivery_hub_id' => $delivery->hub_id,
                    'pickup_zone_id' => $delivery->zone_id, 'delivery_zone_id' => $delivery->zone_id,
                    'status' => $state === 'ISSUE' ? 'AT_HUB_AWAITING_DECISION'
                        : ($state === 'RETRY' ? 'WAITING_REDELIVERY' : 'READY_FOR_LAST_MILE'),
                    'custody_type' => 'HUB', 'current_hub_id' => $delivery->hub_id,
                    'created_at' => $createdAt, 'updated_at' => $arrivedAt,
                ]);
                DB::table('parcels')->insert([
                    'shipment_id' => $shipmentId, 'parcel_no' => 1,
                    'weight_grams' => $product->weight_grams,
                    'length_mm' => $product->length_mm,
                    'width_mm' => $product->width_mm,
                    'height_mm' => $product->height_mm,
                ]);
                $routeId = DB::table('route_plans')->insertGetId([
                    'shipment_id' => $shipmentId, 'version' => 1, 'active' => true,
                    'change_reason' => 'Hub tujuan Jakarta', 'created_at' => $createdAt,
                ]);
                DB::table('route_stops')->insert([
                    'route_plan_id' => $routeId, 'sequence_no' => 1,
                    'hub_id' => $delivery->hub_id, 'arrived_at' => $initialHubAt,
                ]);
                DB::table('pickup_tasks')->insert([
                    'shipment_id' => $shipmentId, 'status' => 'PICKED_UP',
                    'ready_at' => $createdAt, 'created_at' => $createdAt,
                ]);
                DB::table('tracking_events')->insert([
                    'shipment_id' => $shipmentId, 'actor_user_id' => $admin,
                    'hub_id' => $delivery->hub_id,
                    'event_type' => 'ARRIVED_AT_DELIVERY_HUB',
                    'status_after' => 'READY_FOR_LAST_MILE', 'details' => '{}',
                    'occurred_at' => $initialHubAt,
                ]);

                if ($state !== 'READY') {
                    $runId = DB::table('delivery_runs')->insertGetId([
                        'hub_id' => $delivery->hub_id, 'zone_id' => $delivery->zone_id,
                        'courier_user_id' => $courier, 'assigned_by' => $admin,
                        'service_date' => $createdAt->toDateString(), 'status' => 'COMPLETED',
                        'assigned_at' => $createdAt, 'responded_at' => $createdAt,
                    ]);
                    $runShipmentId = DB::table('run_shipments')->insertGetId([
                        'run_id' => $runId, 'shipment_id' => $shipmentId,
                        'stop_order' => 1, 'status' => 'RETURNED_TO_HUB',
                        'handed_over_at' => $createdAt, 'returned_at' => $arrivedAt,
                    ]);
                    $attemptId = DB::table('delivery_attempts')->insertGetId([
                        'run_shipment_id' => $runShipmentId, 'shipment_id' => $shipmentId,
                        'attempt_no' => 1, 'result' => 'FAILED',
                        'failure_reason' => $state === 'RETRY' ? 'PENERIMA_TIDAK_ADA' : 'ALAMAT_TIDAK_DITEMUKAN',
                        'notes' => $state === 'RETRY' ? 'Penerima meminta antar ulang.' : 'Nomor rumah perlu dikonfirmasi.',
                        'attempted_at' => $arrivedAt->copy()->subHour(),
                    ]);
                    DB::table('shipment_issues')->insert([
                        'shipment_id' => $shipmentId, 'delivery_attempt_id' => $attemptId,
                        'status' => $state === 'RETRY' ? 'RESOLVED' : 'OPEN',
                        'decision' => $state === 'RETRY' ? 'RESCHEDULE' : null,
                        'decision_note' => $state === 'RETRY' ? 'Penerima tersedia hari ini.' : null,
                        'scheduled_redelivery_at' => $state === 'RETRY' ? now()->subMinutes(20) : null,
                        'decided_by' => $state === 'RETRY' ? $admin : null,
                        'decided_at' => $state === 'RETRY' ? now()->subHour() : null,
                        'created_at' => $arrivedAt,
                    ]);
                    DB::table('tracking_events')->insert([
                        'shipment_id' => $shipmentId, 'actor_user_id' => $courier,
                        'hub_id' => $delivery->hub_id,
                        'event_type' => 'DELIVERY_FAILED', 'status_after' => 'DELIVERY_FAILED',
                        'details' => json_encode(['attempt_no' => 1], JSON_THROW_ON_ERROR),
                        'occurred_at' => $arrivedAt->copy()->subHour(),
                    ]);
                    DB::table('tracking_events')->insert([
                        'shipment_id' => $shipmentId, 'actor_user_id' => $admin,
                        'hub_id' => $delivery->hub_id,
                        'event_type' => 'FAILED_PARCEL_RETURNED_TO_HUB',
                        'status_after' => 'AT_HUB_AWAITING_DECISION',
                        'details' => '{}', 'occurred_at' => $arrivedAt,
                    ]);
                    if ($state === 'RETRY') {
                        DB::table('tracking_events')->insert([
                            'shipment_id' => $shipmentId, 'actor_user_id' => $admin,
                            'hub_id' => $delivery->hub_id,
                            'event_type' => 'REDELIVERY_SCHEDULED',
                            'status_after' => 'WAITING_REDELIVERY',
                            'details' => json_encode(['scheduled_at' => now()->subMinutes(20)->toIso8601String()], JSON_THROW_ON_ERROR),
                            'occurred_at' => now()->subHour(),
                        ]);
                    }
                }
            });
        }
    }
}
