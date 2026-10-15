<?php

namespace Database\Seeders;

use App\Services\SatriaService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class CakungHackathonSeeder extends Seeder
{
    public function run(): void
    {
        $hubId = DB::table('hubs')->where('code', 'HUB-JT')->value('id');
        $zoneId = DB::table('service_zones')->where('hub_id', $hubId)
            ->where('code', 'CAKUNG')->value('id');
        if (! $hubId || ! $zoneId) {
            $this->command?->warn('Hub atau zona Cakung belum tersedia.');

            return;
        }

        DB::transaction(function () use ($hubId, $zoneId): void {
            $this->ensureAccount('rianyuliawan@anteraja.id', 'Rian Yuliawan', 'OPS_ADMIN', null,
                config('satria.demo_ops_phone'));
            $this->ensureAccount('rianyuliawan1@anteraja.id', 'Rian Yuliawan', 'HUB_OPERATOR', $hubId,
                config('satria.demo_hub_phone'));
            $courierId = $this->ensureAccount('afrien@anteraja.id', 'Afrien', 'COURIER', null,
                config('satria.demo_courier_phone'));
            DB::table('courier_profiles')->insertOrIgnore([
                'user_id' => $courierId, 'home_hub_id' => $hubId,
                'max_parcels' => 12, 'max_weight_grams' => 20000, 'available' => true,
            ]);
            DB::table('courier_zones')->insertOrIgnore([
                'courier_user_id' => $courierId, 'zone_id' => $zoneId,
                'service_type' => 'DELIVERY',
            ]);

            $pendingRun = DB::table('delivery_runs as run')
                ->join('run_shipments as item', 'item.run_id', '=', 'run.id')
                ->join('shipments as shipment', 'shipment.id', '=', 'item.shipment_id')
                ->join('users as courier', 'courier.id', '=', 'run.courier_user_id')
                ->where('shipment.awb', '11902600000306')
                ->where('run.hub_id', $hubId)
                ->where('run.status', 'PENDING_ACCEPT')
                ->whereNull('run.responded_at')
                ->where('courier.email', 'andika.wijaya@anteraja.id')
                ->value('run.id');
            if ($pendingRun) {
                DB::table('delivery_runs')->where('id', $pendingRun)
                    ->update(['courier_user_id' => $courierId]);
            }
        });

        for ($daysAgo = 0; $daysAgo <= 3; $daysAgo++) {
            app(SatriaService::class)->generateDailyReports(today()->subDays($daysAgo)->toDateString(), $hubId);
        }
    }

    private function ensureAccount(string $email, string $name, string $role, ?int $hubId, ?string $phone): int
    {
        $userId = DB::table('users')->where('email', $email)->value('id');
        if (! $userId) {
            $userId = DB::table('users')->insertGetId([
                'email' => $email, 'password' => Hash::make(config('satria.demo_account_password') ?: 'anteraja123'),
                'name' => $name, 'phone' => $phone, 'active' => true,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
        DB::table('user_roles')->insertOrIgnore([
            'user_id' => $userId, 'role' => $role, 'hub_id' => $hubId,
            'created_at' => now(),
        ]);

        return $userId;
    }
}
