<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('shipments as shipment')
            ->join('pickup_tasks as task', 'task.shipment_id', '=', 'shipment.id')
            ->whereIn('shipment.status', ['WAITING_SELLER_READY', 'READY_FOR_PICKUP'])
            ->whereNotExists(function ($query): void {
                $query->selectRaw('1')->from('pickup_assignments as assignment')
                    ->whereColumn('assignment.pickup_task_id', 'task.id');
            })
            ->whereColumn('shipment.origin_hub_id', '!=', 'shipment.delivery_hub_id')
            ->select('shipment.id', 'shipment.delivery_hub_id', 'shipment.delivery_zone_id')
            ->orderBy('shipment.id')
            ->get()
            ->each(function ($shipment): void {
                DB::table('shipments')->where('id', $shipment->id)->update([
                    'origin_hub_id' => $shipment->delivery_hub_id,
                    'pickup_zone_id' => $shipment->delivery_zone_id,
                    'updated_at' => now(),
                ]);
            });
    }

    public function down(): void
    {
        // Assignment ownership cannot be safely reconstructed after a pickup has begun.
    }
};
