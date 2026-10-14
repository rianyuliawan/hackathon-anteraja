<?php

namespace App\Services;

use Illuminate\Support\Facades\Storage;
use RuntimeException;

class DemoPickupPhoto
{
    public const PATH = 'proofs/pickup/demo-pickup.jpg';

    public function ensureStored(): string
    {
        if (Storage::disk('local')->exists(self::PATH)) {
            return self::PATH;
        }

        $source = database_path('assets/pickup-demo.jpg');
        $contents = file_get_contents($source);
        if ($contents === false || ! Storage::disk('local')->put(self::PATH, $contents)) {
            throw new RuntimeException('Foto pickup contoh tidak dapat disimpan.');
        }

        return self::PATH;
    }
}
