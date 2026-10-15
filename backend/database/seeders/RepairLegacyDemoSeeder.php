<?php

namespace Database\Seeders;

use App\Services\DemoPickupPhoto;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class RepairLegacyDemoSeeder extends Seeder
{
    public function run(): void
    {
        $opsId = DB::table('user_roles')->where('role', 'OPS_ADMIN')->value('user_id');
        $pickupCourierId = DB::table('users')->where('email', 'bagus.setiawan@anteraja.id')->value('id');
        if (! $opsId || ! $pickupCourierId) {
            return;
        }
        if (! app()->environment(['local', 'testing'])) {
            return;
        }
        app(DemoPickupPhoto::class)->ensureStored();
        DB::transaction(function () use ($opsId, $pickupCourierId): void {
            DB::statement('ALTER TABLE tracking_events DISABLE TRIGGER tracking_events_append_only');
            DB::statement('ALTER TABLE delivery_attempts DISABLE TRIGGER delivery_attempts_append_only');
            try {
                for ($number = 401; $number <= 417; $number++) {
                    $awb = sprintf('1100826000%04d', $number);
                    $shipment = DB::table('shipments')->where('awb', $awb)->first();
                    if (! $shipment) {
                        continue;
                    }
                    $eventTypes = DB::table('tracking_events')->where('shipment_id', $shipment->id)
                        ->pluck('event_type')->all();
                    $seedEvents = ['ARRIVED_AT_DELIVERY_HUB', 'DELIVERY_FAILED',
                        'FAILED_PARCEL_RETURNED_TO_HUB', 'REDELIVERY_SCHEDULED'];
                    if (array_diff($eventTypes, $seedEvents) !== [] ||
                        ! in_array($shipment->status,
                            ['READY_FOR_LAST_MILE', 'WAITING_REDELIVERY', 'AT_HUB_AWAITING_DECISION'], true)) {
                        continue;
                    }
                    DB::transaction(function () use ($shipment, $opsId, $pickupCourierId): void {
                        $order = DB::table('orders')->where('id', $shipment->order_id)->first();
                        $task = DB::table('pickup_tasks')->where('shipment_id', $shipment->id)->first();
                        $operatorId = DB::table('user_roles')->where('role', 'HUB_OPERATOR')
                            ->where('hub_id', $shipment->delivery_hub_id)->value('user_id');
                        if (! $order || ! $task || ! $operatorId) {
                            return;
                        }
                        $createdAt = Carbon::parse($order->created_at);
                        $reviewedAt = $createdAt->copy()->addMinutes(15);
                        $pickupAssignedAt = $createdAt->copy()->addMinutes(30);
                        $pickupAcceptedAt = $createdAt->copy()->addMinutes(45);
                        $pickedUpAt = $createdAt->copy()->addHour();
                        $transitAt = $createdAt->copy()->addMinutes(90);
                        $arrivedAt = Carbon::parse($shipment->updated_at);
                        DB::table('orders')->where('id', $order->id)->update(['reviewed_at' => $reviewedAt]);
                        DB::table('pickup_tasks')->where('id', $task->id)->update(['ready_at' => $reviewedAt]);
                        DB::table('pickup_assignments')->insert([
                            'pickup_task_id' => $task->id, 'courier_user_id' => $pickupCourierId,
                            'assigned_by' => $opsId, 'status' => 'COMPLETED',
                            'assigned_at' => $pickupAssignedAt, 'responded_at' => $pickupAcceptedAt,
                            'picked_up_at' => $pickedUpAt, 'pickup_photo_ref' => DemoPickupPhoto::PATH,
                        ]);
                        $this->event($shipment->id, $opsId, null, 'AWB_GENERATED', 'READY_FOR_PICKUP', $reviewedAt);
                        $this->event($shipment->id, $opsId, null, 'PICKUP_ASSIGNED', 'PICKUP_ASSIGNED', $pickupAssignedAt);
                        $this->event($shipment->id, $pickupCourierId, null, 'PICKUP_ACCEPTED', 'PICKUP_ASSIGNED', $pickupAcceptedAt);
                        $this->event($shipment->id, $pickupCourierId, null, 'PICKED_UP', 'PICKED_UP', $pickedUpAt);
                        $this->event($shipment->id, $pickupCourierId, null, 'IN_TRANSIT', 'IN_TRANSIT', $transitAt);
                        DB::table('tracking_events')->where('shipment_id', $shipment->id)
                            ->where('event_type', 'ARRIVED_AT_DELIVERY_HUB')
                            ->update(['actor_user_id' => $operatorId, 'occurred_at' => $arrivedAt]);
                        DB::table('route_stops')->whereIn('route_plan_id', DB::table('route_plans')
                            ->where('shipment_id', $shipment->id)->select('id'))
                            ->update(['arrived_at' => $arrivedAt]);
                        if ($shipment->status === 'READY_FOR_LAST_MILE') {
                            return;
                        }
                        $row = DB::table('run_shipments')->where('shipment_id', $shipment->id)->first();
                        $attempt = DB::table('delivery_attempts')->where('shipment_id', $shipment->id)->first();
                        if (! $row || ! $attempt) {
                            return;
                        }
                        $run = DB::table('delivery_runs')->where('id', $row->run_id)->first();
                        $assignedAt = $arrivedAt->copy()->addMinutes(10);
                        $acceptedAt = $arrivedAt->copy()->addMinutes(20);
                        $handoverAt = $arrivedAt->copy()->addMinutes(30);
                        $startedAt = $arrivedAt->copy()->addMinutes(40);
                        $attemptedAt = $arrivedAt->copy()->addHour();
                        $returnedAt = $arrivedAt->copy()->addMinutes(80);
                        DB::table('delivery_runs')->where('id', $run->id)->update([
                            'assigned_by' => $operatorId, 'service_date' => $assignedAt->toDateString(),
                            'assigned_at' => $assignedAt, 'responded_at' => $acceptedAt,
                        ]);
                        DB::table('run_shipments')->where('id', $row->id)->update([
                            'handed_over_at' => $handoverAt, 'returned_at' => $returnedAt,
                        ]);
                        DB::table('delivery_attempts')->where('id', $attempt->id)->update(['attempted_at' => $attemptedAt]);
                        DB::table('shipment_issues')->where('delivery_attempt_id', $attempt->id)->update([
                            'created_at' => $attemptedAt,
                            'decided_by' => $shipment->status === 'WAITING_REDELIVERY' ? $opsId : null,
                            'decided_at' => $shipment->status === 'WAITING_REDELIVERY'
                                ? $returnedAt->copy()->addMinutes(12) : null,
                        ]);
                        $this->event($shipment->id, $operatorId, $shipment->delivery_hub_id,
                            'DELIVERY_ASSIGNED', 'DELIVERY_ASSIGNED', $assignedAt,
                            ['run_id' => $run->id, 'stop_order' => 1]);
                        $this->event($shipment->id, $run->courier_user_id, $shipment->delivery_hub_id,
                            'DELIVERY_RUN_ACCEPTED', 'DELIVERY_ASSIGNED', $acceptedAt);
                        $this->event($shipment->id, $operatorId, $shipment->delivery_hub_id,
                            'HANDOVER_TO_COURIER', 'DELIVERY_ASSIGNED', $handoverAt);
                        $this->event($shipment->id, $run->courier_user_id, $shipment->delivery_hub_id,
                            'OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY', $startedAt);
                        DB::table('tracking_events')->where('shipment_id', $shipment->id)
                            ->where('event_type', 'DELIVERY_FAILED')
                            ->update(['occurred_at' => $attemptedAt]);
                        DB::table('tracking_events')->where('shipment_id', $shipment->id)
                            ->where('event_type', 'FAILED_PARCEL_RETURNED_TO_HUB')
                            ->update(['actor_user_id' => $operatorId, 'occurred_at' => $returnedAt]);
                        if ($shipment->status === 'WAITING_REDELIVERY') {
                            DB::table('tracking_events')->where('shipment_id', $shipment->id)
                                ->where('event_type', 'REDELIVERY_SCHEDULED')
                                ->update(['actor_user_id' => $opsId,
                                    'occurred_at' => $returnedAt->copy()->addMinutes(12)]);
                        }
                        DB::table('shipments')->where('id', $shipment->id)->update([
                            'updated_at' => $shipment->status === 'WAITING_REDELIVERY'
                                ? $returnedAt->copy()->addMinutes(12) : $returnedAt,
                        ]);
                    });
                }
            } finally {
                DB::statement('ALTER TABLE delivery_attempts ENABLE TRIGGER delivery_attempts_append_only');
                DB::statement('ALTER TABLE tracking_events ENABLE TRIGGER tracking_events_append_only');
            }
        });
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
