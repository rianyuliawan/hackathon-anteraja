<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::transaction(function (): void {
            $hubId = DB::table('hubs')->where('code', 'HUB-JTD')->value('id');
            if (! $hubId) {
                return;
            }

            $durenSawitId = DB::table('service_zones')->where('hub_id', $hubId)
                ->where('code', 'DUREN_SAWIT')->value('id');
            if (! $durenSawitId) {
                return;
            }

            DB::table('service_zones')->where('id', $durenSawitId)
                ->update(['name' => 'Duren Sawit · 13440']);
            $areas = [
                'PONDOK_KELAPA' => ['Pondok Kelapa · 13450', '13450', -6.239399, 106.934894],
                'PONDOK_KOPI' => ['Pondok Kopi · 13460', '13460', -6.229124, 106.944675],
            ];
            foreach ($areas as $code => [$name, $postcode, $latitude, $longitude]) {
                $zoneId = DB::table('service_zones')->where('hub_id', $hubId)
                    ->where('code', $code)->value('id');
                if (! $zoneId) {
                    $zoneId = DB::table('service_zones')->insertGetId([
                        'hub_id' => $hubId, 'code' => $code, 'name' => $name,
                    ]);
                }
                DB::table('postal_coverages')->updateOrInsert(
                    ['postcode' => $postcode, 'purpose' => 'DELIVERY', 'hub_id' => $hubId],
                    ['zone_id' => $zoneId, 'active' => true, 'latitude' => $latitude,
                        'longitude' => $longitude, 'map_radius_meters' => 1700]
                );
            }

            foreach ([
                'febriansyah.putra@anteraja.id' => 'PONDOK_KELAPA',
                'yogi.mahendra@anteraja.id' => 'PONDOK_KOPI',
            ] as $email => $code) {
                $courierId = DB::table('users')->where('email', $email)->value('id');
                $zoneId = DB::table('service_zones')->where('hub_id', $hubId)
                    ->where('code', $code)->value('id');
                if (! $courierId || ! $zoneId) {
                    continue;
                }
                DB::table('courier_zones')->updateOrInsert(
                    ['courier_user_id' => $courierId, 'zone_id' => $zoneId, 'service_type' => 'DELIVERY'],
                    []
                );
                DB::table('courier_zones')->where('courier_user_id', $courierId)
                    ->where('zone_id', $durenSawitId)->where('service_type', 'DELIVERY')->delete();
            }
        });
    }

    public function down(): void
    {
        // Historic shipments can reference these zones; keep the data on rollback.
    }
};
