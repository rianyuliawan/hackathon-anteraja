<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('tracking_event_time_corrections', function (Blueprint $table) {
            $table->foreignId('tracking_event_id')->primary()->constrained('tracking_events');
            $table->timestampTz('original_occurred_at');
            $table->timestampTz('corrected_occurred_at');
            $table->text('reason');
            $table->timestampTz('created_at')->useCurrent();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tracking_event_time_corrections');
    }
};
