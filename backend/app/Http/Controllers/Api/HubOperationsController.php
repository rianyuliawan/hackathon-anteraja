<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DeliveryStopPlanner;
use App\Services\SatriaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class HubOperationsController extends Controller
{
    public function __construct(private readonly SatriaService $satria, private readonly DeliveryStopPlanner $stopPlanner) {}

    public function hubs(Request $request): JsonResponse
    {
        abort_unless($this->satria->hasRole($request->user(), 'OPS_ADMIN') ||
            $this->satria->hasRole($request->user(), 'HUB_OPERATOR') ||
            $this->satria->hasRole($request->user(), 'COURIER'), 403);
        $rows = DB::table('hubs')->where('active', true)->orderBy('name')->get()
            ->map(function ($hub): array {
                return array_merge((array) $hub, [
                    'zones' => DB::table('service_zones')->where('hub_id', $hub->id)
                        ->where('active', true)->orderBy('name')->get(),
                ]);
            });

        return response()->json(['data' => $rows]);
    }

    public function hubInbound(Request $request, int $id): JsonResponse
    {
        $this->satria->requireHub($request->user(), $id);
        $rows = DB::table('shipments')->where('delivery_hub_id', $id)
            ->whereIn('status', ['PICKED_UP', 'IN_TRANSIT'])->orderBy('created_at')->get()
            ->map(fn ($shipment) => $this->satria->shipmentPayload($shipment));

        return response()->json(['data' => $rows]);
    }

    public function hubReady(Request $request, int $id): JsonResponse
    {
        $this->satria->requireHub($request->user(), $id);
        $rows = DB::table('shipments')->where('delivery_hub_id', $id)
            ->where('current_hub_id', $id)
            ->whereIn('status', ['READY_FOR_LAST_MILE', 'WAITING_REDELIVERY'])
            ->orderBy('created_at')->get()
            ->map(fn ($shipment) => $this->satria->shipmentPayload($shipment));

        return response()->json(['data' => $rows]);
    }

    public function hubCouriers(Request $request, int $id): JsonResponse
    {
        $this->satria->requireHub($request->user(), $id);
        $rows = DB::table('courier_profiles as c')->join('users as u', 'u.id', '=', 'c.user_id')
            ->where('c.home_hub_id', $id)->where('u.active', true)
            ->select('c.*', 'u.name', 'u.email', 'u.phone')->orderBy('u.name')->get()
            ->map(function ($courier): array {
                return array_merge((array) $courier, [
                    'zones' => DB::table('courier_zones as cz')->join('service_zones as z', 'z.id', '=', 'cz.zone_id')
                        ->where('cz.courier_user_id', $courier->user_id)
                        ->where('cz.service_type', 'DELIVERY')->get(['z.id', 'z.name', 'z.code']),
                ]);
            });

        return response()->json(['data' => $rows]);
    }

    public function scanIn(Request $request, int $id): JsonResponse
    {
        $this->satria->requireHub($request->user(), $id);
        $input = $request->validate(['awb' => ['required', 'string']]);
        $shipment = DB::transaction(function () use ($request, $id, $input): object {
            $shipment = DB::table('shipments')->where('awb', $input['awb'])->lockForUpdate()->first();
            abort_if($shipment === null, 404);
            abort_unless($shipment->delivery_hub_id === $id, 403, 'Resi ditujukan ke hub lain.');
            if ($shipment->status === 'READY_FOR_LAST_MILE' && $shipment->current_hub_id === $id) {
                return $shipment;
            }
            abort_unless(in_array($shipment->status, ['PICKED_UP', 'IN_TRANSIT'], true),
                409, 'Paket belum selesai pickup atau sudah diproses.');
            $stop = DB::table('route_stops as s')->join('route_plans as p', 'p.id', '=', 's.route_plan_id')
                ->where('p.shipment_id', $shipment->id)->where('p.active', true)
                ->where('s.hub_id', $id)->whereNull('s.arrived_at')->select('s.id')->first();
            abort_if($stop === null, 409, 'Hub tidak sesuai rute aktif.');
            DB::table('route_stops')->where('id', $stop->id)->update(['arrived_at' => now()]);
            DB::table('shipments')->where('id', $shipment->id)->update([
                'status' => 'READY_FOR_LAST_MILE', 'custody_type' => 'HUB',
                'current_hub_id' => $id, 'current_courier_id' => null, 'updated_at' => now(),
            ]);
            $eventId = $this->satria->event($shipment->id, $request->user()->id,
                'ARRIVED_AT_DELIVERY_HUB', 'READY_FOR_LAST_MILE', [], $id);
            $order = DB::table('orders')->where('id', $shipment->order_id)->first();
            $this->satria->notifyUser($eventId, $shipment->id, $order->customer_id, 'BUYER',
                'ARRIVED_AT_HUB', "Paket {$shipment->awb} sudah tiba di hub tujuan.");

            return DB::table('shipments')->where('id', $shipment->id)->first();
        });

        return response()->json(['data' => $this->satria->shipmentPayload($shipment)]);
    }

    public function hubRuns(Request $request, int $id): JsonResponse
    {
        $this->satria->requireHub($request->user(), $id);
        $rows = DB::table('delivery_runs')->where('hub_id', $id)
            ->orderByDesc('assigned_at')->limit(100)->get()
            ->map(fn ($run) => $this->satria->runPayload($run));

        return response()->json(['data' => $rows]);
    }

    public function createRun(Request $request, int $id): JsonResponse
    {
        $this->satria->requireHub($request->user(), $id);
        $input = $request->validate([
            'zone_id' => ['required', 'integer', 'exists:service_zones,id'],
            'courier_user_id' => ['required', 'integer', 'exists:courier_profiles,user_id'],
            'shipment_ids' => ['required', 'array', 'min:1', 'max:50'],
            'shipment_ids.*' => ['required', 'integer', 'distinct', 'exists:shipments,id'],
            'service_date' => ['required', 'date_format:Y-m-d'],
            'stop_order' => ['nullable', 'array'],
            'stop_order.*' => ['integer', 'distinct'],
        ]);
        $result = DB::transaction(function () use ($request, $id, $input): array {
            $zone = DB::table('service_zones')->where('id', $input['zone_id'])
                ->where('hub_id', $id)->where('active', true)->first();
            abort_if($zone === null, 422, 'Zona bukan bagian dari hub aktif.');
            $courier = DB::table('courier_profiles')->where('user_id', $input['courier_user_id'])
                ->lockForUpdate()->first();
            abort_unless($courier?->available && $courier->home_hub_id === $id &&
                DB::table('users')->where('id', $courier->user_id)->where('active', true)->exists(),
                422, 'Kurir tidak tersedia di hub ini.');
            abort_if(DB::table('delivery_runs')->where('courier_user_id', $courier->user_id)
                ->where('service_date', $input['service_date'])
                ->whereIn('status', ['PENDING_ACCEPT', 'ACCEPTED', 'OUT_FOR_DELIVERY'])->exists(),
                409, 'Kurir sudah memiliki run aktif pada tanggal tersebut.');
            abort_unless(DB::table('courier_zones')->where('courier_user_id', $courier->user_id)
                ->where('zone_id', $zone->id)->where('service_type', 'DELIVERY')->exists(),
                422, 'Kurir tidak melayani zona pengantaran ini.');
            $shipmentIds = array_map('intval', $input['shipment_ids']);
            sort($shipmentIds);
            $shipments = DB::table('shipments')->whereIn('id', $shipmentIds)
                ->orderBy('id')->lockForUpdate()->get();
            abort_unless($shipments->count() === count($shipmentIds), 422);
            $totalWeight = 0;
            foreach ($shipments as $shipment) {
                abort_unless($shipment->delivery_hub_id === $id &&
                    $shipment->current_hub_id === $id &&
                    $shipment->delivery_zone_id === $zone->id &&
                    $shipment->custody_type === 'HUB' &&
                    in_array($shipment->status, ['READY_FOR_LAST_MILE', 'WAITING_REDELIVERY'], true),
                    409, "Resi {$shipment->awb} tidak siap di zona/hub ini.");
                if ($shipment->status === 'WAITING_REDELIVERY') {
                    $scheduled = DB::table('shipment_issues')->where('shipment_id', $shipment->id)
                        ->where('decision', 'RESCHEDULE')->orderByDesc('id')
                        ->value('scheduled_redelivery_at');
                    abort_if($scheduled === null || $input['service_date'] < substr($scheduled, 0, 10),
                        409, 'Tanggal run lebih awal dari jadwal antar ulang.');
                }
                abort_if(DB::table('run_shipments')->where('shipment_id', $shipment->id)
                    ->whereIn('status', ['ASSIGNED', 'HANDED_OVER'])->exists(),
                    409, "Resi {$shipment->awb} masih dalam run aktif.");
                $totalWeight += DB::table('parcels')->where('shipment_id', $shipment->id)->sum('weight_grams');
            }
            abort_if(count($shipmentIds) > $courier->max_parcels || $totalWeight > $courier->max_weight_grams,
                422, 'Jumlah atau berat paket melebihi kapasitas kurir.');
            if (isset($input['stop_order'])) {
                $orderedIds = array_map('intval', $input['stop_order']);
                $comparison = $orderedIds;
                sort($comparison);
                abort_unless($comparison === $shipmentIds, 422, 'stop_order harus berisi semua ID paket tepat sekali.');
                $strategy = 'operator_manual';
            } else {
                [$orderedIds, $strategy] = $this->stopPlanner->order($shipments->all(), $id);
            }

            $runId = DB::table('delivery_runs')->insertGetId([
                'hub_id' => $id, 'zone_id' => $zone->id,
                'courier_user_id' => $courier->user_id,
                'assigned_by' => $request->user()->id,
                'service_date' => $input['service_date'],
                'status' => 'PENDING_ACCEPT', 'assigned_at' => now(),
            ]);
            foreach ($orderedIds as $index => $shipmentId) {
                DB::table('run_shipments')->insert([
                    'run_id' => $runId, 'shipment_id' => $shipmentId,
                    'stop_order' => $index + 1, 'status' => 'ASSIGNED',
                ]);
                DB::table('shipments')->where('id', $shipmentId)->update([
                    'status' => 'DELIVERY_ASSIGNED', 'updated_at' => now(),
                ]);
                $shipment = $shipments->firstWhere('id', $shipmentId);
                $eventId = $this->satria->event($shipmentId, $request->user()->id,
                    'DELIVERY_ASSIGNED', 'DELIVERY_ASSIGNED',
                    ['run_id' => $runId, 'stop_order' => $index + 1, 'route_strategy' => $strategy], $id);
                $this->satria->notifyUser($eventId, $shipmentId, $courier->user_id, 'COURIER',
                    'DELIVERY_ASSIGNED', "Tugas antar baru: {$shipment->awb} pada run #{$runId}. Silakan terima atau tolak.");
            }

            return ['run' => DB::table('delivery_runs')->where('id', $runId)->first(), 'strategy' => $strategy];
        });

        return response()->json(['data' => array_merge($this->satria->runPayload($result['run']), [
            'route_strategy' => $result['strategy'],
        ])], 201);
    }

    public function handover(Request $request, int $id): JsonResponse
    {
        $this->satria->requireHub($request->user(), $id);
        $input = $request->validate([
            'run_id' => ['required', 'integer', 'exists:delivery_runs,id'],
            'awbs' => ['required', 'array', 'min:1'],
            'awbs.*' => ['required', 'string', 'distinct'],
        ]);
        $run = DB::transaction(function () use ($request, $id, $input): object {
            $run = DB::table('delivery_runs')->where('id', $input['run_id'])->lockForUpdate()->first();
            abort_unless($run->hub_id === $id, 403);
            abort_unless($run->status === 'ACCEPTED', 409, 'Run harus diterima kurir.');
            $rows = DB::table('run_shipments')->where('run_id', $run->id)->orderBy('id')->lockForUpdate()->get();
            $expected = DB::table('shipments')->whereIn('id', $rows->pluck('shipment_id'))
                ->pluck('awb')->sort()->values()->all();
            $actual = collect($input['awbs'])->sort()->values()->all();
            abort_unless($expected === $actual, 422, 'Semua AWB dalam run harus di-scan saat serah terima.');
            foreach ($rows as $row) {
                abort_unless($row->status === 'ASSIGNED', 409, 'Paket sudah diserahterimakan.');
                DB::table('run_shipments')->where('id', $row->id)->update([
                    'status' => 'HANDED_OVER', 'handed_over_at' => now(),
                ]);
                DB::table('shipments')->where('id', $row->shipment_id)->update([
                    'custody_type' => 'COURIER', 'current_hub_id' => null,
                    'current_courier_id' => $run->courier_user_id, 'updated_at' => now(),
                ]);
                $this->satria->event($row->shipment_id, $request->user()->id,
                    'HANDOVER_TO_COURIER', 'DELIVERY_ASSIGNED', ['run_id' => $run->id], $id);
            }

            return $run;
        });

        return response()->json(['data' => $this->satria->runPayload($run)]);
    }

    public function returnScan(Request $request, int $id): JsonResponse
    {
        $this->satria->requireHub($request->user(), $id);
        $input = $request->validate(['awb' => ['required', 'string']]);
        $shipment = DB::transaction(function () use ($request, $id, $input): object {
            $shipment = DB::table('shipments')->where('awb', $input['awb'])->lockForUpdate()->first();
            abort_if($shipment === null, 404);
            abort_unless($shipment->delivery_hub_id === $id, 403);
            if ($shipment->status === 'AT_HUB_AWAITING_DECISION' && $shipment->current_hub_id === $id) {
                return $shipment;
            }
            abort_unless($shipment->status === 'DELIVERY_FAILED' &&
                $shipment->custody_type === 'COURIER', 409, 'Paket tidak dalam status gagal kirim oleh kurir.');
            $row = DB::table('run_shipments')->where('shipment_id', $shipment->id)
                ->where('status', 'FAILED')->orderByDesc('id')->lockForUpdate()->first();
            abort_if($row === null, 409, 'Run gagal kirim tidak ditemukan.');
            DB::table('run_shipments')->where('id', $row->id)->update([
                'status' => 'RETURNED_TO_HUB', 'returned_at' => now(),
            ]);
            DB::table('shipments')->where('id', $shipment->id)->update([
                'status' => 'AT_HUB_AWAITING_DECISION', 'custody_type' => 'HUB',
                'current_hub_id' => $id, 'current_courier_id' => null, 'updated_at' => now(),
            ]);
            $eventId = $this->satria->event($shipment->id, $request->user()->id,
                'FAILED_PARCEL_RETURNED_TO_HUB', 'AT_HUB_AWAITING_DECISION', [], $id);
            $this->satria->notifyRoleAtHub($eventId, $shipment->id, 'OPS_ADMIN', null,
                'REDELIVERY_DECISION_REQUIRED',
                "Paket {$shipment->awb} kembali ke hub. Putuskan jadwal ulang atau retur.");

            return DB::table('shipments')->where('id', $shipment->id)->first();
        });

        return response()->json(['data' => $this->satria->shipmentPayload($shipment)]);
    }
}
