<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DatabaseTimezoneTest extends TestCase
{
    public function test_postgresql_interprets_application_timestamps_as_wib(): void
    {
        $this->assertSame('Asia/Jakarta', DB::selectOne('SHOW TIME ZONE')->TimeZone);

        $result = DB::selectOne(
            'SELECT ABS(EXTRACT(EPOCH FROM (?::timestamptz - now()))) AS seconds_apart',
            [now()->format('Y-m-d H:i:s')]
        );

        $this->assertLessThan(5, (float) $result->seconds_apart);
    }
}
