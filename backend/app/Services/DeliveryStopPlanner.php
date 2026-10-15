<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class DeliveryStopPlanner
{
    /** @return array{0: array<int, int>, 1: string} */
    public function order(array $shipments, int $hubId): array
    {
        $preview = $this->preview($shipments, $hubId);

        return [$preview['shipment_ids'], $preview['strategy']];
    }

    /** @return array{shipment_ids: array<int, int>, strategy: string, distance_km: float|null, stops: array<int, array<string, mixed>>, hub: array<string, mixed>} */
    public function preview(array $shipments, int $hubId): array
    {
        $hub = DB::table('hubs')->where('id', $hubId)->first();
        $origin = $this->point($hub?->latitude, $hub?->longitude);
        $rows = [];

        foreach ($shipments as $shipment) {
            $order = DB::table('orders')->where('id', $shipment->order_id)->first();
            $coverage = DB::table('postal_coverages')
                ->where('postcode', $order->destination_postcode)
                ->where('purpose', 'DELIVERY')
                ->where('hub_id', $hubId)
                ->where('zone_id', $shipment->delivery_zone_id)
                ->where('active', true)
                ->first();
            $exact = $this->point($order->destination_latitude, $order->destination_longitude);
            $point = $exact ?? $this->point($coverage?->latitude, $coverage?->longitude);
            $ageHours = max(0, now()->diffInMinutes($shipment->created_at, false) * -1 / 60);
            $readyEvent = DB::table('tracking_events as event')
                ->leftJoin('tracking_event_time_corrections as correction', 'correction.tracking_event_id', '=', 'event.id')
                ->where('event.shipment_id', $shipment->id)
                ->whereIn('event.event_type', ['ARRIVED_AT_DELIVERY_HUB', 'REDELIVERY_SCHEDULED'])
                ->orderByRaw('COALESCE(correction.corrected_occurred_at, event.occurred_at) DESC')
                ->value(DB::raw('COALESCE(correction.corrected_occurred_at, event.occurred_at)'));
            $readySince = $readyEvent ?? $shipment->created_at;
            $waitingHours = max(0, now()->diffInMinutes($readySince, false) * -1 / 60);

            $rows[$shipment->id] = [
                'shipment_id' => (int) $shipment->id,
                'awb' => $shipment->awb,
                'recipient_name' => $order->recipient_name,
                'address' => $order->destination_address_snapshot,
                'postcode' => $order->destination_postcode,
                'latitude' => $point[0] ?? null,
                'longitude' => $point[1] ?? null,
                'point_source' => $exact ? 'ADDRESS' : ($point ? 'POSTCODE' : 'NONE'),
                'age_hours' => round($ageHours, 1),
                'waiting_hours' => round($waitingHours, 1),
                'priority' => $ageHours >= 48 ? 'URGENT' : ($ageHours >= 24 ? 'WATCH' : 'NORMAL'),
                'attempt_count' => DB::table('delivery_attempts')->where('shipment_id', $shipment->id)->count(),
            ];
        }

        $allLocated = $origin !== null && collect($rows)->every(fn (array $row): bool => $row['latitude'] !== null);
        $roadDurations = $allLocated ? $this->roadDurations($origin, $rows) : null;
        $ordered = [];
        $distance = 0.0;
        $currentId = 0;
        $current = $origin;

        if ($allLocated) {
            while ($rows !== []) {
                $bestId = null;
                $bestScore = INF;
                $bestDistance = INF;
                foreach ($rows as $id => $row) {
                    $leg = $this->distance($current, [(float) $row['latitude'], (float) $row['longitude']]);
                    $ageCredit = min(5.0, max(0, $row['age_hours'] - 12) / 8);
                    $retryCredit = $row['attempt_count'] > 0 ? 1.0 : 0.0;
                    $roadMinutes = $roadDurations[$currentId][$id] ?? null;
                    $score = $roadMinutes !== null
                        ? $roadMinutes - $ageCredit * 3 - $retryCredit * 6
                        : $leg - $ageCredit - $retryCredit;
                    if ($score < $bestScore || ($score === $bestScore && $id < $bestId)) {
                        $bestId = $id;
                        $bestScore = $score;
                        $bestDistance = $leg;
                    }
                }
                $row = $rows[$bestId];
                $row['leg_distance_km'] = round($bestDistance, 2);
                $row['stop_order'] = count($ordered) + 1;
                $ordered[] = $row;
                $distance += $bestDistance;
                $current = [(float) $row['latitude'], (float) $row['longitude']];
                $currentId = $bestId;
                unset($rows[$bestId]);
            }
            $strategy = 'distance_age_priority';
        } else {
            $ordered = collect($rows)->sort(function (array $left, array $right): int {
                return ($right['age_hours'] <=> $left['age_hours'])
                    ?: ($right['attempt_count'] <=> $left['attempt_count'])
                    ?: strcmp($left['postcode'].'|'.$left['address'], $right['postcode'].'|'.$right['address']);
            })->values()->map(function (array $row, int $index): array {
                $row['stop_order'] = $index + 1;
                $row['leg_distance_km'] = null;

                return $row;
            })->all();
            $strategy = 'age_postcode_fallback';
        }

        return [
            'shipment_ids' => array_column($ordered, 'shipment_id'),
            'strategy' => $strategy,
            'distance_km' => $allLocated ? round($distance, 2) : null,
            'stops' => $ordered,
            'hub' => [
                'id' => $hubId, 'name' => $hub?->name,
                'latitude' => $origin[0] ?? null, 'longitude' => $origin[1] ?? null,
            ],
        ];
    }

    /** @param array{0: float, 1: float} $origin
     * @param  array<int, array<string, mixed>>  $rows
     * @return array<int, array<int, float>>|null
     */
    private function roadDurations(array $origin, array $rows): ?array
    {
        $baseUrl = rtrim((string) config('satria.osrm_url'), '/');
        if ($baseUrl === '') {
            return null;
        }
        $points = [0 => $origin];
        foreach ($rows as $id => $row) {
            $points[$id] = [(float) $row['latitude'], (float) $row['longitude']];
        }
        $coordinates = collect($points)->map(fn (array $point): string => $point[1].','.$point[0])->implode(';');
        try {
            $response = Http::acceptJson()->timeout(4)->get($baseUrl.'/table/v1/driving/'.$coordinates,
                ['annotations' => 'duration']);
        } catch (\Throwable) {
            return null;
        }
        if (! $response->successful() || $response->json('code') !== 'Ok') {
            return null;
        }
        $matrix = $response->json('durations');
        $ids = array_keys($points);
        if (! is_array($matrix) || count($matrix) !== count($ids)) {
            return null;
        }
        $durations = [];
        foreach ($ids as $fromIndex => $fromId) {
            foreach ($ids as $toIndex => $toId) {
                $seconds = $matrix[$fromIndex][$toIndex] ?? null;
                if (! is_numeric($seconds)) {
                    return null;
                }
                $durations[$fromId][$toId] = (float) $seconds / 60;
            }
        }

        return $durations;
    }

    /** @return array{0: float, 1: float}|null */
    private function point(mixed $latitude, mixed $longitude): ?array
    {
        return $latitude === null || $longitude === null ? null : [(float) $latitude, (float) $longitude];
    }

    /** @param array{0: float, 1: float} $from
     * @param  array{0: float, 1: float}  $to
     */
    private function distance(array $from, array $to): float
    {
        $latitudeDelta = deg2rad($to[0] - $from[0]);
        $longitudeDelta = deg2rad($to[1] - $from[1]);
        $haversine = sin($latitudeDelta / 2) ** 2
            + cos(deg2rad($from[0])) * cos(deg2rad($to[0])) * sin($longitudeDelta / 2) ** 2;

        return 6371 * 2 * asin(min(1, sqrt($haversine)));
    }
}
