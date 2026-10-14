<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DemoCourierSeeder extends Seeder
{
    private const COURIERS = [
        'HUB-JS' => ['Rizal Prakoso', 'rizal.prakoso@anteraja.id'],
        'HUB-JST' => ['Taufik Hidayat', 'taufik.hidayat@anteraja.id'],
        'HUB-JT' => ['Hanif Saputra', 'hanif.saputra@anteraja.id'],
        'HUB-JTD' => ['Yogi Mahendra', 'yogi.mahendra@anteraja.id'],
        'HUB-JB' => ['Farhan Hakim', 'farhan.hakim@anteraja.id'],
        'HUB-JBP' => ['Daffa Ramadhan', 'daffa.ramadhan@anteraja.id'],
        'HUB-JU' => ['Akbar Nugraha', 'akbar.nugraha@anteraja.id'],
        'HUB-JUP' => ['Nanda Wijaya', 'nanda.wijaya@anteraja.id'],
        'HUB-JP' => ['Fikri Santoso', 'fikri.santoso@anteraja.id'],
        'HUB-JPT' => ['Dimas Kurnia', 'dimas.kurnia@anteraja.id'],
    ];

    private const PICKUP_COURIERS = [
        'HUB-JST' => ['Satria Pamungkas', 'satria.pamungkas@anteraja.id'],
        'HUB-JTD' => ['Wahyu Pratama', 'wahyu.pratama@anteraja.id'],
        'HUB-JBP' => ['Deni Saputra', 'deni.saputra@anteraja.id'],
        'HUB-JUP' => ['Rizki Ramadhan', 'rizki.ramadhan@anteraja.id'],
        'HUB-JP' => ['Fahmi Setiawan', 'fahmi.setiawan@anteraja.id'],
        'HUB-JPT' => ['Ardi Nugroho', 'ardi.nugroho@anteraja.id'],
    ];

    private const DUREN_SAWIT_DELIVERY_COURIERS = [
        ['Hendra Maulana', 'hendra.maulana@anteraja.id', 'DUREN_SAWIT'],
        ['Rafi Setiawan', 'rafi.setiawan@anteraja.id', 'PONDOK_KELAPA'],
        ['Ilham Prakoso', 'ilham.prakoso@anteraja.id', 'PONDOK_KOPI'],
    ];

    public function run(): void
    {
        foreach (self::COURIERS as $hubCode => [$name, $email]) {
            $hub = DB::table('hubs')->where('code', $hubCode)->first();
            $zoneId = $hub ? DB::table('service_zones')->where('hub_id', $hub->id)
                ->when($hubCode === 'HUB-JTD', fn ($query) => $query->where('code', 'PONDOK_KOPI'))
                ->value('id') : null;
            if (! $hub || ! $zoneId) {
                continue;
            }
            DB::transaction(function () use ($hub, $zoneId, $name, $email): void {
                $userId = DB::table('users')->where('email', $email)->value('id');
                if (! $userId) {
                    $userId = DB::table('users')->insertGetId([
                        'email' => $email,
                        'password' => Hash::make('anteraja123'),
                        'name' => $name,
                        'active' => true,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
                if (! DB::table('user_roles')->where('user_id', $userId)->where('role', 'COURIER')->exists()) {
                    DB::table('user_roles')->insert([
                        'user_id' => $userId, 'role' => 'COURIER', 'created_at' => now(),
                    ]);
                }
                if (! DB::table('courier_profiles')->where('user_id', $userId)->exists()) {
                    DB::table('courier_profiles')->insert([
                        'user_id' => $userId, 'home_hub_id' => $hub->id,
                        'max_parcels' => 12, 'max_weight_grams' => 20000, 'available' => true,
                    ]);
                }
                if (! DB::table('courier_zones')->where('courier_user_id', $userId)
                    ->where('zone_id', $zoneId)->where('service_type', 'DELIVERY')->exists()) {
                    DB::table('courier_zones')->insert([
                        'courier_user_id' => $userId, 'zone_id' => $zoneId, 'service_type' => 'DELIVERY',
                    ]);
                }
            });
        }

        $durenSawitHub = DB::table('hubs')->where('code', 'HUB-JTD')->first();
        foreach (self::DUREN_SAWIT_DELIVERY_COURIERS as [$name, $email, $zoneCode]) {
            $zoneId = $durenSawitHub ? DB::table('service_zones')->where('hub_id', $durenSawitHub->id)
                ->where('code', $zoneCode)->value('id') : null;
            if (! $durenSawitHub || ! $zoneId) {
                continue;
            }
            DB::transaction(function () use ($durenSawitHub, $zoneId, $name, $email): void {
                $userId = DB::table('users')->where('email', $email)->value('id');
                if (! $userId) {
                    $userId = DB::table('users')->insertGetId([
                        'email' => $email, 'password' => Hash::make('anteraja123'),
                        'name' => $name, 'active' => true,
                        'created_at' => now(), 'updated_at' => now(),
                    ]);
                }
                DB::table('user_roles')->insertOrIgnore([
                    'user_id' => $userId, 'role' => 'COURIER', 'created_at' => now(),
                ]);
                DB::table('courier_profiles')->insertOrIgnore([
                    'user_id' => $userId, 'home_hub_id' => $durenSawitHub->id,
                    'max_parcels' => 12, 'max_weight_grams' => 20000, 'available' => true,
                ]);
                DB::table('courier_zones')->insertOrIgnore([
                    'courier_user_id' => $userId, 'zone_id' => $zoneId, 'service_type' => 'DELIVERY',
                ]);
            });
        }

        foreach (self::PICKUP_COURIERS as $hubCode => [$name, $email]) {
            $hub = DB::table('hubs')->where('code', $hubCode)->first();
            $zoneId = $hub ? DB::table('service_zones')->where('hub_id', $hub->id)->value('id') : null;
            if (! $hub || ! $zoneId) {
                continue;
            }
            DB::transaction(function () use ($hub, $zoneId, $name, $email): void {
                $userId = DB::table('users')->where('email', $email)->value('id');
                if (! $userId) {
                    $userId = DB::table('users')->insertGetId([
                        'email' => $email,
                        'password' => Hash::make('anteraja123'),
                        'name' => $name,
                        'active' => true,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
                DB::table('user_roles')->insertOrIgnore([
                    'user_id' => $userId, 'role' => 'COURIER', 'created_at' => now(),
                ]);
                DB::table('courier_profiles')->insertOrIgnore([
                    'user_id' => $userId, 'home_hub_id' => $hub->id,
                    'max_parcels' => 12, 'max_weight_grams' => 20000, 'available' => true,
                ]);
                DB::table('courier_zones')->insertOrIgnore([
                    'courier_user_id' => $userId, 'zone_id' => $zoneId, 'service_type' => 'PICKUP',
                ]);
            });
        }
    }
}
