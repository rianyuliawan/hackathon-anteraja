<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('delivery_runs', function (Blueprint $table) {
            $table->time('window_start')->default('00:00:00');
            $table->time('window_end')->default('23:59:00');
        });
        DB::statement('ALTER TABLE delivery_runs ADD CONSTRAINT delivery_runs_valid_window CHECK (window_start < window_end)');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement('ALTER TABLE delivery_runs DROP CONSTRAINT IF EXISTS delivery_runs_valid_window');
        Schema::table('delivery_runs', function (Blueprint $table) {
            $table->dropColumn(['window_start', 'window_end']);
        });
    }
};
