<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        foreach ([
            '12130' => [-6.245500, 106.800500, 2200],
            '12810' => [-6.229500, 106.852000, 2400],
            '13910' => [-6.179000, 106.944000, 3000],
            '13440' => [-6.234000, 106.914000, 2200],
            '11610' => [-6.191000, 106.738000, 2700],
            '11480' => [-6.202000, 106.797000, 2200],
            '14240' => [-6.157500, 106.905500, 2400],
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
        // Data titik pusat tetap berguna walau migration dibatalkan.
    }
};
