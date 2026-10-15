<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('postal_coverages', function (Blueprint $table) {
            $table->decimal('latitude', 9, 6)->nullable();
            $table->decimal('longitude', 9, 6)->nullable();
            $table->unsignedInteger('map_radius_meters')->default(1800);
        });
        DB::statement('ALTER TABLE postal_coverages DROP CONSTRAINT IF EXISTS postal_coverages_postcode_purpose_key');
        DB::statement('CREATE UNIQUE INDEX postal_coverages_hub_unique ON postal_coverages (postcode, purpose, hub_id)');

        foreach ([
            '12130' => [-6.245500, 106.800500, 2200],
            '12810' => [-6.229500, 106.852000, 2400],
            '13910' => [-6.179000, 106.944000, 3000],
            '14240' => [-6.157500, 106.905500, 2400],
            '11610' => [-6.191000, 106.738000, 2700],
            '13440' => [-6.234000, 106.914000, 2200],
            '11480' => [-6.202000, 106.797000, 2200],
            '14440' => [-6.126000, 106.798000, 2400],
            '10110' => [-6.175000, 106.829000, 2200],
            '10250' => [-6.191000, 106.811000, 2000],
        ] as $postcode => [$latitude, $longitude, $radius]) {
            DB::table('postal_coverages')->where('postcode', $postcode)->update([
                'latitude' => $latitude,
                'longitude' => $longitude,
                'map_radius_meters' => $radius,
            ]);
        }
    }

    public function down(): void
    {
        $duplicate = DB::table('postal_coverages')->select('postcode', 'purpose')
            ->groupBy('postcode', 'purpose')->havingRaw('COUNT(*) > 1')->exists();
        if ($duplicate) {
            throw new RuntimeException('Resolve overlapping hub coverage before rolling back this migration.');
        }

        DB::statement('DROP INDEX IF EXISTS postal_coverages_hub_unique');
        DB::statement('ALTER TABLE postal_coverages ADD CONSTRAINT postal_coverages_postcode_purpose_key UNIQUE (postcode, purpose)');
        Schema::table('postal_coverages', function (Blueprint $table) {
            $table->dropColumn(['latitude', 'longitude', 'map_radius_meters']);
        });
    }
};
