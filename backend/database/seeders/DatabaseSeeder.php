<?php

namespace Database\Seeders;

use App\Services\DemoPickupPhoto;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        DB::unprepared(file_get_contents(database_path('satria-seed.sql')));
        app(DemoPickupPhoto::class)->ensureStored();
        $this->call(LastMileDemoSeeder::class);
        $this->call(RepairLegacyDemoSeeder::class);
        $this->call(DemoCourierSeeder::class);
        $this->call(RichRunDemoSeeder::class);
    }
}
