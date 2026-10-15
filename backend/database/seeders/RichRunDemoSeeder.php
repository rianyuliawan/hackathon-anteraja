<?php

namespace Database\Seeders;

use App\Services\DeliveryStopPlanner;
use App\Services\DemoDeliveryPhoto;
use App\Services\DemoPickupPhoto;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class RichRunDemoSeeder extends Seeder
{
    private const NAMES = [
        'Aulia Rahmawati', 'Bagas Nugraha', 'Cahya Permata', 'Dinda Maharani',
        'Eka Prasetyo', 'Fani Lestari', 'Gilang Ramadhan', 'Hana Safitri',
        'Iqbal Maulana', 'Jihan Putri', 'Kevin Saputra', 'Laila Amalia',
        'Mira Oktaviani', 'Niko Firmansyah', 'Putra Aditya', 'Raisa Wulandari',
        'Seno Hidayat', 'Tania Anggraini', 'Vina Kusuma', 'Yusuf Fadillah',
    ];

    private const STREETS = ['Melati', 'Kenanga', 'Mawar', 'Anggrek', 'Cempaka', 'Flamboyan', 'Kemuning'];

    public function run(): void
    {
        $seller = DB::table('seller_locations')->orderBy('id')->first();
        $products = DB::table('products')->where('seller_user_id', $seller?->seller_user_id)->orderBy('id')->get();
        $opsId = DB::table('user_roles')->where('role', 'OPS_ADMIN')->value('user_id');
        $buyer = DB::table('users')->where('email', 'siti.nurhaliza@anteraja.id')->first();
        if (! $seller || $products->isEmpty() || ! $opsId || ! $buyer) {
            $this->command?->warn('Prasyarat data run demo belum tersedia.');

            return;
        }
        app(DemoPickupPhoto::class)->ensureStored();
        app(DemoDeliveryPhoto::class)->ensureStored();
        $planner = app(DeliveryStopPlanner::class);
        $coverages = DB::table('postal_coverages as coverage')
            ->join('hubs as hub', 'hub.id', '=', 'coverage.hub_id')
            ->join('service_zones as zone', 'zone.id', '=', 'coverage.zone_id')
            ->where('coverage.purpose', 'DELIVERY')->where('coverage.active', true)
            ->where('hub.active', true)->orderBy('hub.id')
            ->get(['coverage.*', 'hub.code as hub_code', 'zone.name as zone_name']);

        foreach ($coverages as $hubIndex => $coverage) {
            $courierIds = DB::table('courier_zones')->where('zone_id', $coverage->zone_id)
                ->where('service_type', 'DELIVERY')->orderBy('courier_user_id')
                ->pluck('courier_user_id')->all();
            $hubOperatorId = DB::table('user_roles')->where('role', 'HUB_OPERATOR')
                ->where('hub_id', $coverage->hub_id)->value('user_id');
            $pickupCourierId = DB::table('courier_profiles as profile')
                ->join('courier_zones as zone', 'zone.courier_user_id', '=', 'profile.user_id')
                ->where('profile.home_hub_id', $coverage->hub_id)
                ->where('zone.service_type', 'PICKUP')
                ->orderBy('profile.user_id')->value('profile.user_id');
            if (count($courierIds) < 2 || ! $hubOperatorId || ! $pickupCourierId) {
                $this->command?->warn("Hub {$coverage->hub_code} dilewati: butuh operator, kurir pickup, dan dua kurir antar.");

                continue;
            }

            DB::transaction(function () use ($hubIndex, $coverage, $courierIds, $hubOperatorId,
                $seller, $products, $opsId, $pickupCourierId, $buyer, $planner): void {
                $groups = ['READY' => [], 'PENDING' => [], 'ACTIVE' => [], 'HISTORY' => []];
                $number = 0;
                foreach (['READY' => 5, 'PENDING' => 4, 'ACTIVE' => 4, 'HISTORY' => 4] as $stage => $count) {
                    for ($position = 0; $position < $count; $position++) {
                        $number++;
                        $awb = sprintf('11%012d', 902600000000 + ($hubIndex + 1) * 100 + $number);
                        if (DB::table('shipments')->where('awb', $awb)->exists()) {
                            continue;
                        }
                        $ageHours = match ($stage) {
                            'READY' => [7, 17, 29, 53, 73][$position],
                            'PENDING' => 18 + $position * 3,
                            'ACTIVE' => 27 + $position * 3,
                            default => 73 + $position * 4,
                        };
                        $createdAt = now()->subHours($ageHours);
                        $arrivedAt = $createdAt->copy()->addHours(3);
                        $shipmentId = $this->shipment($hubIndex, $number, $awb, $createdAt, $arrivedAt,
                            $coverage, $seller, $products, $opsId, $pickupCourierId,
                            $hubOperatorId, $buyer);
                        $groups[$stage][] = $shipmentId;
                    }
                }
                $this->runFor($groups['PENDING'], $coverage, $hubOperatorId, $courierIds[0],
                    'PENDING_ACCEPT', now()->subMinutes(30), $planner, $opsId);
                $this->runFor($groups['ACTIVE'], $coverage, $hubOperatorId, $courierIds[1],
                    'OUT_FOR_DELIVERY', now()->subHours(2), $planner, $opsId);
                $this->runFor($groups['HISTORY'], $coverage, $hubOperatorId, $courierIds[0],
                    'COMPLETED', now()->subHours(30), $planner, $opsId);
            });
        }
    }

    private function shipment(int $hubIndex, int $number, string $awb, Carbon $createdAt, Carbon $arrivedAt,
        object $coverage, object $seller, object $products, int $opsId,
        int $pickupCourierId, int $hubOperatorId, object $demoBuyer): int
    {
        $name = self::NAMES[($hubIndex * 7 + $number) % count(self::NAMES)];
        $street = self::STREETS[($hubIndex + $number) % count(self::STREETS)];
        $address = "Jl. {$street} No. ".(11 + $number * 3).", {$coverage->zone_name}, Jakarta";
        $email = sprintf('pembeli.%02d.%02d@example.test', $hubIndex + 1, $number);
        $phone = sprintf('+6281200%06d', ($hubIndex + 1) * 100 + $number);
        $latitude = (float) ($coverage->latitude ?? -6.2) + (($number % 5) - 2) * 0.0021;
        $longitude = (float) ($coverage->longitude ?? 106.8) + (($number % 4) - 1) * 0.0023;
        $customerId = $coverage->hub_code === 'HUB-JT' && in_array($number, [1, 6, 10], true)
            ? $demoBuyer->id : DB::table('users')->where('email', $email)->value('id');
        if (! $customerId) {
            $customerId = DB::table('users')->insertGetId([
                'email' => $email, 'password' => $demoBuyer->password,
                'name' => $name, 'phone' => $phone,
                'default_address' => $address, 'default_postcode' => $coverage->postcode,
                'created_at' => $createdAt, 'updated_at' => $createdAt,
            ]);
            DB::table('user_roles')->insert(['user_id' => $customerId, 'role' => 'BUYER', 'created_at' => $createdAt]);
        }
        $product = $products[($hubIndex + $number) % $products->count()];
        $checkoutKey = sprintf('9f260000-0000-4000-8000-%012d', ($hubIndex + 1) * 100 + $number);
        $orderNumber = 'INV-'.$createdAt->format('Ymd').'-'.substr(sprintf('%u', crc32($awb)), 0, 8);
        $reviewedAt = $createdAt->copy()->addMinutes(15);
        $pickupAssignedAt = $createdAt->copy()->addMinutes(30);
        $pickupAcceptedAt = $createdAt->copy()->addMinutes(45);
        $pickedUpAt = $createdAt->copy()->addHour();
        $transitAt = $createdAt->copy()->addMinutes(90);
        $orderId = DB::table('orders')->insertGetId([
            'order_no' => $orderNumber, 'checkout_key' => $checkoutKey,
            'customer_id' => $customerId, 'seller_user_id' => $seller->seller_user_id,
            'seller_location_id' => $seller->id, 'status' => 'APPROVED',
            'origin_address_snapshot' => $seller->address, 'origin_contact_snapshot' => $seller->contact_name,
            'origin_postcode' => $seller->postcode, 'destination_address_snapshot' => $address,
            'destination_latitude' => $latitude, 'destination_longitude' => $longitude,
            'recipient_name' => $name, 'recipient_phone' => $phone,
            'destination_postcode' => $coverage->postcode,
            'estimated_weight_grams' => $product->weight_grams,
            'estimated_length_mm' => $product->length_mm,
            'estimated_width_mm' => $product->width_mm,
            'estimated_height_mm' => $product->height_mm,
            'subtotal' => $product->price, 'reviewed_by' => $opsId,
            'reviewed_at' => $reviewedAt, 'created_at' => $createdAt, 'updated_at' => $reviewedAt,
        ]);
        DB::table('order_items')->insert([
            'order_id' => $orderId, 'product_id' => $product->id, 'quantity' => 1,
            'product_name_snapshot' => $product->name, 'price_snapshot' => $product->price,
        ]);
        $shipmentId = DB::table('shipments')->insertGetId([
            'order_id' => $orderId, 'awb' => $awb,
            'origin_hub_id' => $coverage->hub_id, 'delivery_hub_id' => $coverage->hub_id,
            'pickup_zone_id' => $coverage->zone_id, 'delivery_zone_id' => $coverage->zone_id,
            'status' => 'READY_FOR_LAST_MILE', 'custody_type' => 'HUB',
            'current_hub_id' => $coverage->hub_id, 'created_at' => $reviewedAt, 'updated_at' => $arrivedAt,
        ]);
        DB::table('parcels')->insert([
            'shipment_id' => $shipmentId, 'parcel_no' => 1,
            'weight_grams' => $product->weight_grams, 'length_mm' => $product->length_mm,
            'width_mm' => $product->width_mm, 'height_mm' => $product->height_mm,
        ]);
        $routeId = DB::table('route_plans')->insertGetId([
            'shipment_id' => $shipmentId, 'version' => 1, 'active' => true,
            'change_reason' => 'Hub tujuan dari cakupan kode pos', 'created_at' => $reviewedAt,
        ]);
        DB::table('route_stops')->insert([
            'route_plan_id' => $routeId, 'sequence_no' => 1,
            'hub_id' => $coverage->hub_id, 'arrived_at' => $arrivedAt,
        ]);
        $pickupTaskId = DB::table('pickup_tasks')->insertGetId([
            'shipment_id' => $shipmentId, 'status' => 'PICKED_UP',
            'ready_at' => $reviewedAt, 'created_at' => $reviewedAt,
        ]);
        DB::table('pickup_assignments')->insert([
            'pickup_task_id' => $pickupTaskId, 'courier_user_id' => $pickupCourierId,
            'assigned_by' => $opsId, 'status' => 'COMPLETED',
            'assigned_at' => $pickupAssignedAt, 'responded_at' => $pickupAcceptedAt,
            'picked_up_at' => $pickedUpAt, 'pickup_photo_ref' => DemoPickupPhoto::PATH,
        ]);
        $this->event($shipmentId, $opsId, null, 'AWB_GENERATED', 'READY_FOR_PICKUP', $reviewedAt);
        $this->event($shipmentId, $opsId, null, 'PICKUP_ASSIGNED', 'PICKUP_ASSIGNED', $pickupAssignedAt);
        $this->event($shipmentId, $pickupCourierId, null, 'PICKUP_ACCEPTED', 'PICKUP_ASSIGNED', $pickupAcceptedAt);
        $this->event($shipmentId, $pickupCourierId, null, 'PICKED_UP', 'PICKED_UP', $pickedUpAt);
        $this->event($shipmentId, $pickupCourierId, null, 'IN_TRANSIT', 'IN_TRANSIT', $transitAt);
        $this->event($shipmentId, $hubOperatorId, $coverage->hub_id,
            'ARRIVED_AT_DELIVERY_HUB', 'READY_FOR_LAST_MILE', $arrivedAt);

        return $shipmentId;
    }

    private function runFor(array $shipmentIds, object $coverage, int $operatorId, int $courierId,
        string $state, Carbon $assignedAt, DeliveryStopPlanner $planner, int $opsId): void
    {
        if ($shipmentIds === []) {
            return;
        }
        [$orderedIds] = $planner->order(DB::table('shipments')->whereIn('id', $shipmentIds)->get()->all(), $coverage->hub_id);
        $acceptedAt = $assignedAt->copy()->addMinutes(12);
        $handoverAt = $assignedAt->copy()->addMinutes(24);
        $startedAt = $assignedAt->copy()->addMinutes(36);
        $runId = DB::table('delivery_runs')->insertGetId([
            'hub_id' => $coverage->hub_id, 'zone_id' => $coverage->zone_id,
            'courier_user_id' => $courierId, 'assigned_by' => $operatorId,
            'service_date' => $assignedAt->toDateString(), 'status' => $state,
            'assigned_at' => $assignedAt,
            'responded_at' => $state === 'PENDING_ACCEPT' ? null : $acceptedAt,
        ]);
        foreach ($orderedIds as $index => $shipmentId) {
            $stopOrder = $index + 1;
            $result = $state === 'COMPLETED' ? ($index < 2 ? 'DELIVERED' : ($index === 2 ? 'OPEN' : 'RETRY'))
                : ($state === 'OUT_FOR_DELIVERY' && $index === 0 ? 'FAILED' : null);
            $rowStatus = match ($result) {
                'DELIVERED' => 'DELIVERED',
                'OPEN', 'RETRY' => 'RETURNED_TO_HUB',
                'FAILED' => 'FAILED',
                default => $state === 'PENDING_ACCEPT' ? 'ASSIGNED' : 'HANDED_OVER',
            };
            $returnedAt = in_array($result, ['OPEN', 'RETRY'], true)
                ? $startedAt->copy()->addMinutes(35 + $index * 5) : null;
            $runShipmentId = DB::table('run_shipments')->insertGetId([
                'run_id' => $runId, 'shipment_id' => $shipmentId, 'stop_order' => $stopOrder,
                'status' => $rowStatus,
                'handed_over_at' => $state === 'PENDING_ACCEPT' ? null : $handoverAt,
                'returned_at' => $returnedAt,
            ]);
            $this->event($shipmentId, $operatorId, $coverage->hub_id,
                'DELIVERY_ASSIGNED', 'DELIVERY_ASSIGNED', $assignedAt,
                ['run_id' => $runId, 'stop_order' => $stopOrder]);
            if ($state !== 'PENDING_ACCEPT') {
                $this->event($shipmentId, $courierId, $coverage->hub_id,
                    'DELIVERY_RUN_ACCEPTED', 'DELIVERY_ASSIGNED', $acceptedAt);
                $this->event($shipmentId, $operatorId, $coverage->hub_id,
                    'HANDOVER_TO_COURIER', 'DELIVERY_ASSIGNED', $handoverAt);
                $this->event($shipmentId, $courierId, $coverage->hub_id,
                    'OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY', $startedAt,
                    ['run_id' => $runId, 'stop_order' => $stopOrder]);
            }
            $shipment = DB::table('shipments')->where('id', $shipmentId)->first();
            if ($state === 'PENDING_ACCEPT') {
                DB::table('shipments')->where('id', $shipmentId)->update([
                    'status' => 'DELIVERY_ASSIGNED', 'updated_at' => $assignedAt,
                ]);

                continue;
            }
            if ($result === null) {
                DB::table('shipments')->where('id', $shipmentId)->update([
                    'status' => 'OUT_FOR_DELIVERY', 'custody_type' => 'COURIER',
                    'current_hub_id' => null, 'current_courier_id' => $courierId,
                    'updated_at' => $startedAt,
                ]);

                continue;
            }
            $attemptedAt = $startedAt->copy()->addMinutes(16 + $index * 7);
            $delivered = $result === 'DELIVERED';
            $attemptId = DB::table('delivery_attempts')->insertGetId([
                'run_shipment_id' => $runShipmentId, 'shipment_id' => $shipmentId,
                'attempt_no' => 1, 'result' => $delivered ? 'DELIVERED' : 'FAILED',
                'failure_reason' => $delivered ? null : ($result === 'FAILED' ? 'PENERIMA_TIDAK_ADA' : 'ALAMAT_TIDAK_DITEMUKAN'),
                'notes' => $delivered ? 'Paket diterima di alamat tujuan.' : 'Kurir melaporkan kendala dari lokasi.',
                'recipient_name' => $delivered ? DB::table('orders')->where('id', $shipment->order_id)->value('recipient_name') : null,
                'delivery_photo_ref' => $delivered ? DemoDeliveryPhoto::PATH : null,
                'attempted_at' => $attemptedAt,
            ]);
            if ($delivered) {
                DB::table('shipments')->where('id', $shipmentId)->update([
                    'status' => 'DELIVERED', 'custody_type' => 'RECIPIENT',
                    'current_hub_id' => null, 'current_courier_id' => null,
                    'delivered_at' => $attemptedAt, 'updated_at' => $attemptedAt,
                ]);
                $this->event($shipmentId, $courierId, $coverage->hub_id, 'DELIVERED', 'DELIVERED', $attemptedAt);

                continue;
            }
            DB::table('shipment_issues')->insert([
                'shipment_id' => $shipmentId, 'delivery_attempt_id' => $attemptId,
                'status' => $result === 'RETRY' ? 'RESOLVED' : 'OPEN',
                'decision' => $result === 'RETRY' ? 'RESCHEDULE' : null,
                'decision_note' => $result === 'RETRY' ? 'Penerima dapat menerima pada jadwal berikutnya.' : null,
                'scheduled_redelivery_at' => $result === 'RETRY' ? now()->subMinutes(20) : null,
                'decided_by' => $result === 'RETRY' ? $opsId : null,
                'decided_at' => $result === 'RETRY' ? $returnedAt->copy()->addMinutes(12) : null,
                'created_at' => $attemptedAt,
            ]);
            $this->event($shipmentId, $courierId, $coverage->hub_id,
                'DELIVERY_FAILED', 'DELIVERY_FAILED', $attemptedAt, ['attempt_no' => 1]);
            if ($result === 'FAILED') {
                DB::table('shipments')->where('id', $shipmentId)->update([
                    'status' => 'DELIVERY_FAILED', 'custody_type' => 'COURIER',
                    'current_hub_id' => null, 'current_courier_id' => $courierId,
                    'updated_at' => $attemptedAt,
                ]);

                continue;
            }
            $this->event($shipmentId, $operatorId, $coverage->hub_id,
                'FAILED_PARCEL_RETURNED_TO_HUB', 'AT_HUB_AWAITING_DECISION', $returnedAt);
            if ($result === 'RETRY') {
                $decidedAt = $returnedAt->copy()->addMinutes(12);
                $this->event($shipmentId, $opsId, $coverage->hub_id,
                    'REDELIVERY_SCHEDULED', 'WAITING_REDELIVERY', $decidedAt,
                    ['scheduled_at' => now()->subMinutes(20)->toIso8601String()]);
            }
            DB::table('shipments')->where('id', $shipmentId)->update([
                'status' => $result === 'RETRY' ? 'WAITING_REDELIVERY' : 'AT_HUB_AWAITING_DECISION',
                'custody_type' => 'HUB', 'current_hub_id' => $coverage->hub_id,
                'current_courier_id' => null, 'updated_at' => $result === 'RETRY'
                    ? $returnedAt->copy()->addMinutes(12) : $returnedAt,
            ]);
        }
    }

    private function event(int $shipmentId, int $actorId, ?int $hubId,
        string $type, string $status, Carbon $at, array $details = []): void
    {
        DB::table('tracking_events')->insert([
            'shipment_id' => $shipmentId, 'actor_user_id' => $actorId,
            'hub_id' => $hubId, 'event_type' => $type, 'status_after' => $status,
            'details' => json_encode($details, JSON_THROW_ON_ERROR), 'occurred_at' => $at,
        ]);
    }
}
