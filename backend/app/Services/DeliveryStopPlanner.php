<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class DeliveryStopPlanner
{
    /** @return array{0: array<int, int>, 1: string} */
    public function order(array $shipments, int $hubId): array
    {
        $hub = DB::table('hubs')->where('id', $hubId)->first();
        $coordinates = [];
        foreach ($shipments as $shipment) {
            $order = DB::table('orders')->where('id', $shipment->order_id)->first();
            if ($hub->latitude === null || $hub->longitude === null ||
                $order->destination_latitude === null || $order->destination_longitude === null) {
                $rows = collect($shipments)->map(function ($item): array {
                    $destination = DB::table('orders')->where('id', $item->order_id)->first();

                    return [
                        'id' => (int) $item->id,
                        'postcode' => $destination->destination_postcode,
                        'address' => $destination->destination_address_snapshot,
                    ];
                })->sortBy(fn ($row) => $row['postcode'].'|'.$row['address'])->values();

                return [$rows->pluck('id')->all(), 'postcode_fallback'];
            }
            $coordinates[$shipment->id] = [
                (float) $order->destination_latitude, (float) $order->destination_longitude,
            ];
        }
        $current = [(float) $hub->latitude, (float) $hub->longitude];
        $ordered = [];
        while ($coordinates !== []) {
            $bestId = null;
            $bestDistance = INF;
            foreach ($coordinates as $shipmentId => $point) {
                $latitudeDistance = ($point[0] - $current[0]) * 111.0;
                $longitudeDistance = ($point[1] - $current[1]) * 108.0;
                $distance = $latitudeDistance ** 2 + $longitudeDistance ** 2;
                if ($distance < $bestDistance) {
                    $bestDistance = $distance;
                    $bestId = $shipmentId;
                }
            }
            $ordered[] = (int) $bestId;
            $current = $coordinates[$bestId];
            unset($coordinates[$bestId]);
        }

        return [$ordered, 'nearest_neighbor_estimate'];
    }
}
