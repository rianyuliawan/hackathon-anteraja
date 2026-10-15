<?php

namespace App\Services;

use Illuminate\Support\Facades\Storage;
use RuntimeException;

class DemoDeliveryPhoto
{
    public const PATH = 'proofs/delivery/demo-delivery.png';

    public function ensureStored(): string
    {
        if (Storage::disk('local')->exists(self::PATH)) {
            return self::PATH;
        }

        $contents = file_get_contents(database_path('assets/delivery-demo.png'));
        if ($contents === false || ! Storage::disk('local')->put(self::PATH, $contents)) {
            throw new RuntimeException('Foto pengantaran contoh tidak dapat disimpan.');
        }

        return self::PATH;
    }
}
