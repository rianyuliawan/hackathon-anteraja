<?php

namespace Database\Seeders;

use App\Services\DemoPickupPhoto;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $freshDatabase = ! DB::table('users')->exists();
        DB::unprepared(file_get_contents(database_path('satria-seed.sql')));
        app(DemoPickupPhoto::class)->ensureStored();
        $this->call(LastMileDemoSeeder::class);
        $this->call(RepairLegacyDemoSeeder::class);
        $this->call(DemoCourierSeeder::class);
        $this->call(RichRunDemoSeeder::class);
        $this->call(CakungHackathonSeeder::class);
        $demoPassword = (string) config('satria.demo_account_password');
        if ($freshDatabase && $demoPassword !== '' && $demoPassword !== 'anteraja123') {
            DB::table('users')->where('email', 'like', '%@anteraja.id')->update([
                'password' => Hash::make($demoPassword), 'updated_at' => now(),
            ]);
        }
    }
}
