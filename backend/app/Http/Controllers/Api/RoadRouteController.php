<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class RoadRouteController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        abort_unless(DB::table('user_roles')->where('user_id', $request->user()->id)
            ->whereIn('role', ['OPS_ADMIN', 'HUB_OPERATOR', 'COURIER'])->exists(), 403);
        $input = $request->validate([
            'points' => ['required', 'array', 'min:2', 'max:21'],
            'points.*.latitude' => ['required', 'numeric', 'between:-90,90'],
            'points.*.longitude' => ['required', 'numeric', 'between:-180,180'],
        ]);
        $points = collect($input['points'])->map(fn (array $point): array => [
            round((float) $point['latitude'], 6), round((float) $point['longitude'], 6),
        ])->all();
        $baseUrl = rtrim((string) config('satria.osrm_url'), '/');
        abort_if($baseUrl === '', 503, 'Layanan rute jalan lokal belum dikonfigurasi.');
        $key = 'road-route:'.hash('sha256', $baseUrl.'|'.json_encode($points, JSON_THROW_ON_ERROR));
        $route = Cache::remember($key, now()->addMinutes(30), function () use ($baseUrl, $points): ?array {
            $coordinates = collect($points)->map(fn (array $point): string => $point[1].','.$point[0])->implode(';');
            try {
                $response = Http::acceptJson()->timeout(8)->get(
                    $baseUrl.'/route/v1/driving/'.$coordinates,
                    ['overview' => 'full', 'geometries' => 'geojson', 'steps' => 'false']
                );
            } catch (\Throwable) {
                return null;
            }
            if (! $response->successful() || $response->json('code') !== 'Ok') {
                return null;
            }
            $first = $response->json('routes.0');
            $geometry = $first['geometry']['coordinates'] ?? null;
            if (! is_array($geometry) || count($geometry) < 2 || ! is_numeric($first['distance'] ?? null)) {
                return null;
            }
            $roadPoints = [];
            foreach ($geometry as $coordinate) {
                if (! is_array($coordinate) || count($coordinate) < 2 ||
                    ! is_numeric($coordinate[0]) || ! is_numeric($coordinate[1])) {
                    return null;
                }
                $roadPoints[] = [(float) $coordinate[1], (float) $coordinate[0]];
            }

            return [
                'points' => $roadPoints,
                'distance_km' => round((float) $first['distance'] / 1000, 2),
                'duration_minutes' => round((float) ($first['duration'] ?? 0) / 60),
                'source' => 'OSRM_LOCAL',
            ];
        });
        abort_if($route === null, 503, 'Rute jalan lokal belum tersedia. Periksa layanan routing lalu coba lagi.');

        return response()->json(['data' => $route])->header('Cache-Control', 'private, max-age=300');
    }
}
