<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DailyReportXlsx;
use App\Services\DeliveryStopPlanner;
use App\Services\SatriaService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

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

    public function hubDailyReports(Request $request, int $id): JsonResponse
    {
        $this->satria->requireHub($request->user(), $id);
        $date = $request->validate(['date' => ['nullable', 'date_format:Y-m-d']])['date'] ?? today()->toDateString();
        $rows = DB::table('daily_reports as report')->join('hubs as hub', 'hub.id', '=', 'report.hub_id')
            ->where('report.hub_id', $id)->where('report.report_date', $date)
            ->get(['report.*', 'hub.name as hub_name']);

        return response()->json(['data' => $rows]);
    }

    public function generateHubDailyReport(Request $request, int $id): JsonResponse
    {
        $this->satria->requireHub($request->user(), $id);
        abort_unless(DB::table('hubs')->where('id', $id)->exists(), 404);
        $date = $request->validate(['report_date' => ['nullable', 'date_format:Y-m-d']])['report_date']
            ?? today()->toDateString();

        return response()->json(['data' => $this->satria->generateDailyReports($date, $id)]);
    }

    public function downloadHubDailyReport(Request $request, int $id, DailyReportXlsx $xlsx): BinaryFileResponse
    {
        $this->satria->requireHub($request->user(), $id);
        $hub = DB::table('hubs')->where('id', $id)->first();
        abort_if($hub === null, 404);
        $date = $request->validate(['date' => ['nullable', 'date_format:Y-m-d']])['date'] ?? today()->toDateString();
        $this->satria->generateDailyReports($date, $id);
        $path = $xlsx->create($id, $date);

        return response()->download($path, "laporan-{$hub->code}-{$date}.xlsx", [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])->deleteFileAfterSend(true);
    }

    public function attentionCounts(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'HUB_OPERATOR', $id);
        $pickupNeedsAssignment = DB::table('pickup_tasks as task')
            ->join('shipments as shipment', 'shipment.id', '=', 'task.shipment_id')
            ->where('shipment.origin_hub_id', $id)
            ->whereIn('task.status', ['WAITING_SELLER_READY', 'READY_FOR_PICKUP'])
            ->count();
        $inboundNeedsScan = DB::table('shipments')
            ->where('delivery_hub_id', $id)
            ->whereIn('status', ['PICKED_UP', 'IN_TRANSIT'])
            ->count();
        $deliveryNeedsAssignment = DB::table('shipments')
            ->where('delivery_hub_id', $id)
            ->where('current_hub_id', $id)
            ->whereIn('status', ['READY_FOR_LAST_MILE', 'WAITING_REDELIVERY'])
            ->count();
        $handoverNeedsConfirmation = DB::table('delivery_runs as run')
            ->where('run.hub_id', $id)
            ->where('run.status', 'ACCEPTED')
            ->whereExists(function ($query): void {
                $query->selectRaw('1')->from('run_shipments as item')
                    ->whereColumn('item.run_id', 'run.id')->where('item.status', 'ASSIGNED');
            })->count();
        $failedNeedsReturn = DB::table('shipments')
            ->where('delivery_hub_id', $id)
            ->where('status', 'DELIVERY_FAILED')
            ->where('custody_type', 'COURIER')
            ->count();
        $returnedNeedsDecision = DB::table('shipments as shipment')
            ->where('shipment.delivery_hub_id', $id)
            ->where('shipment.status', 'AT_HUB_AWAITING_DECISION')
            ->whereExists(function ($query): void {
                $query->selectRaw('1')->from('shipment_issues as issue')
                    ->whereColumn('issue.shipment_id', 'shipment.id')->where('issue.status', 'OPEN');
            })->count();

        return response()->json(['data' => [
            'pickup_needs_assignment' => $pickupNeedsAssignment,
            'inbound_needs_scan' => $inboundNeedsScan,
            'delivery_needs_assignment' => $deliveryNeedsAssignment,
            'handover_needs_confirmation' => $handoverNeedsConfirmation,
            'failed_needs_return' => $failedNeedsReturn,
            'returned_needs_decision' => $returnedNeedsDecision,
        ]]);
    }

    public function hubInbound(Request $request, int $id): JsonResponse
    {
        $this->satria->requireHub($request->user(), $id);
        $rows = DB::table('shipments as shipment')
            ->join('hubs as origin', 'origin.id', '=', 'shipment.origin_hub_id')
            ->where('shipment.delivery_hub_id', $id)
            ->whereIn('shipment.status', [
                'WAITING_SELLER_READY', 'READY_FOR_PICKUP', 'PICKUP_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT',
            ])
            ->orderByDesc('shipment.created_at')->limit(100)
            ->get(['shipment.*', 'origin.name as origin_hub_name'])
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
            ->map(function ($shipment): array {
                $readySince = DB::table('tracking_events')->where('shipment_id', $shipment->id)
                    ->whereIn('event_type', ['ARRIVED_AT_DELIVERY_HUB', 'REDELIVERY_SCHEDULED'])
                    ->orderByDesc('occurred_at')->value('occurred_at') ?? $shipment->created_at;

                return array_merge($this->satria->shipmentPayload($shipment), [
                    'ready_since' => $readySince,
                    'waiting_hours' => max(0, round((now()->timestamp - strtotime((string) $readySince)) / 3600, 1)),
                    'age_hours' => max(0, round((now()->timestamp - strtotime((string) $shipment->created_at)) / 3600, 1)),
                ]);
            });

        return response()->json(['data' => $rows]);
    }

    public function hubCouriers(Request $request, int $id): JsonResponse
    {
        $this->satria->requireHub($request->user(), $id);
        $unreturnedFailed = DB::table('shipments')
            ->where('delivery_hub_id', $id)
            ->where('status', 'DELIVERY_FAILED')
            ->where('custody_type', 'COURIER')
            ->whereNotNull('current_courier_id')
            ->select('current_courier_id')
            ->selectRaw('COUNT(*) as total')
            ->groupBy('current_courier_id')
            ->pluck('total', 'current_courier_id');
        $rows = DB::table('courier_profiles as c')->join('users as u', 'u.id', '=', 'c.user_id')
            ->where('c.home_hub_id', $id)->where('u.active', true)
            ->select('c.*', 'u.name', 'u.email', 'u.phone')->orderBy('u.name')->get()
            ->map(function ($courier) use ($unreturnedFailed): array {
                return array_merge((array) $courier, [
                    'unreturned_failed_count' => (int) ($unreturnedFailed[$courier->user_id] ?? 0),
                    'zones' => DB::table('courier_zones as cz')->join('service_zones as z', 'z.id', '=', 'cz.zone_id')
                        ->where('cz.courier_user_id', $courier->user_id)
                        ->where('cz.service_type', 'DELIVERY')->get(['z.id', 'z.name', 'z.code']),
                ]);
            });

        return response()->json(['data' => $rows]);
    }

    public function pickupTasks(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'HUB_OPERATOR', $id);
        $rows = DB::table('pickup_tasks as task')->join('shipments as shipment', 'shipment.id', '=', 'task.shipment_id')
            ->where('shipment.origin_hub_id', $id)->orderByDesc('task.created_at')->limit(100)
            ->get('task.*')->map(function ($task): array {
                $shipment = DB::table('shipments')->where('id', $task->shipment_id)->first();

                return array_merge((array) $task, [
                    'shipment' => $this->satria->shipmentPayload($shipment),
                    'assignments' => DB::table('pickup_assignments')->where('pickup_task_id', $task->id)
                        ->orderByDesc('id')->get(),
                ]);
            });

        return response()->json(['data' => $rows]);
    }

    public function pickupCouriers(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'HUB_OPERATOR', $id);
        $rows = DB::table('courier_profiles as c')->join('users as u', 'u.id', '=', 'c.user_id')
            ->where('c.home_hub_id', $id)->where('u.active', true)
            ->select('c.*', 'u.name', 'u.email', 'u.phone')->orderBy('u.name')->get()
            ->map(function ($courier): array {
                return array_merge((array) $courier, [
                    'zones' => DB::table('courier_zones as cz')->join('service_zones as z', 'z.id', '=', 'cz.zone_id')
                        ->where('cz.courier_user_id', $courier->user_id)
                        ->where('cz.service_type', 'PICKUP')->get(['z.id', 'z.name', 'cz.service_type']),
                ]);
            });

        return response()->json(['data' => $rows]);
    }

    public function hubIssues(Request $request, int $hubId): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'HUB_OPERATOR', $hubId);
        $rows = DB::table('shipment_issues as issue')
            ->join('shipments as shipment', 'shipment.id', '=', 'issue.shipment_id')
            ->where('shipment.delivery_hub_id', $hubId)->orderByDesc('issue.created_at')
            ->limit(100)->get('issue.*')->map(function ($issue): array {
                $shipment = DB::table('shipments')->where('id', $issue->shipment_id)->first();
                $attempt = DB::table('delivery_attempts')->where('id', $issue->delivery_attempt_id)->first();

                return array_merge((array) $issue, [
                    'shipment' => $this->satria->shipmentPayload($shipment),
                    'attempt' => $attempt,
                    'delivery_attempt' => $attempt,
                ]);
            });

        return response()->json(['data' => $rows]);
    }

    public function markPickupReady(Request $request, int $id, int $taskId): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'HUB_OPERATOR', $id);
        $task = DB::transaction(function () use ($request, $id, $taskId): object {
            $task = DB::table('pickup_tasks')->where('id', $taskId)->lockForUpdate()->first();
            abort_if($task === null, 404);
            abort_unless(DB::table('shipments')->where('id', $task->shipment_id)
                ->where('origin_hub_id', $id)->exists(), 403, 'Pickup bukan tugas hub ini.');
            if ($task->status === 'READY_FOR_PICKUP') {
                return $task;
            }
            abort_unless($task->status === 'WAITING_SELLER_READY', 409, 'Pickup tidak dapat ditandai siap.');
            DB::table('pickup_tasks')->where('id', $taskId)->update(['status' => 'READY_FOR_PICKUP', 'ready_at' => now()]);
            DB::table('shipments')->where('id', $task->shipment_id)->update([
                'status' => 'READY_FOR_PICKUP', 'updated_at' => now(),
            ]);
            $this->satria->event($task->shipment_id, $request->user()->id, 'SELLER_READY', 'READY_FOR_PICKUP');

            return DB::table('pickup_tasks')->where('id', $taskId)->first();
        });

        return response()->json(['data' => $task]);
    }

    public function assignPickup(Request $request, int $id, int $taskId): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'HUB_OPERATOR', $id);
        $input = $request->validate([
            'courier_user_id' => ['required', 'integer', 'exists:courier_profiles,user_id'],
            'scheduled_at' => ['nullable', 'date'],
        ]);
        $assignment = DB::transaction(function () use ($request, $id, $taskId, $input): object {
            $task = DB::table('pickup_tasks')->where('id', $taskId)->lockForUpdate()->first();
            abort_if($task === null, 404);
            abort_unless(DB::table('shipments')->where('id', $task->shipment_id)
                ->where('origin_hub_id', $id)->exists(), 403, 'Pickup bukan tugas hub ini.');
            abort_unless($task->status === 'READY_FOR_PICKUP', 409, 'Paket belum siap pickup.');
            $shipment = DB::table('shipments')->where('id', $task->shipment_id)->lockForUpdate()->first();
            $courier = DB::table('courier_profiles')->where('user_id', $input['courier_user_id'])
                ->lockForUpdate()->first();
            abort_unless($courier?->available && $courier->home_hub_id === $id && DB::table('users')->where('id', $courier->user_id)
                ->where('active', true)->exists(), 422, 'Kurir tidak tersedia.');
            abort_unless(DB::table('courier_zones as courier_zone')
                ->join('service_zones as zone', 'zone.id', '=', 'courier_zone.zone_id')
                ->where('courier_zone.courier_user_id', $courier->user_id)
                ->where('courier_zone.service_type', 'PICKUP')
                ->where('zone.hub_id', $id)->exists(),
                422, 'Kurir tidak bertugas pickup dari hub ini.');
            $weight = DB::table('parcels')->where('shipment_id', $shipment->id)->sum('weight_grams');
            $activeShipments = DB::table('pickup_assignments as a')
                ->join('pickup_tasks as t', 't.id', '=', 'a.pickup_task_id')
                ->where('a.courier_user_id', $courier->user_id)
                ->whereIn('a.status', ['PENDING_ACCEPT', 'ACCEPTED', 'IN_PROGRESS'])
                ->pluck('t.shipment_id');
            $activeWeight = DB::table('parcels')->whereIn('shipment_id', $activeShipments)
                ->sum('weight_grams');
            abort_if($activeShipments->count() + 1 > $courier->max_parcels ||
                $activeWeight + $weight > $courier->max_weight_grams,
                422, 'Jumlah atau berat pickup melebihi kapasitas kurir.');
            $assignmentId = DB::table('pickup_assignments')->insertGetId([
                'pickup_task_id' => $task->id,
                'courier_user_id' => $courier->user_id,
                'assigned_by' => $request->user()->id,
                'status' => 'PENDING_ACCEPT',
                'scheduled_at' => $input['scheduled_at'] ?? null,
                'assigned_at' => now(),
            ]);
            DB::table('pickup_tasks')->where('id', $task->id)->update(['status' => 'ASSIGNED']);
            DB::table('shipments')->where('id', $shipment->id)->update([
                'status' => 'PICKUP_ASSIGNED', 'updated_at' => now(),
            ]);
            $eventId = $this->satria->event($shipment->id, $request->user()->id, 'PICKUP_ASSIGNED', 'PICKUP_ASSIGNED');
            $this->satria->notifyUser($eventId, $shipment->id, $courier->user_id,
                'COURIER', 'PICKUP_ASSIGNED', "Tugas pickup baru untuk resi {$shipment->awb}. Buka aplikasi kurir.");
            $order = DB::table('orders')->where('id', $shipment->order_id)->first();
            $this->satria->notifyUser($eventId, $shipment->id, $order->seller_user_id,
                'SELLER', 'PICKUP_SCHEDULED', "Pickup resi {$shipment->awb} sudah dijadwalkan. Siapkan paket di toko.");

            return DB::table('pickup_assignments')->where('id', $assignmentId)->first();
        });

        return response()->json(['data' => $assignment], 201);
    }

    public function issueDecision(Request $request, int $hubId, int $issueId): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'HUB_OPERATOR', $hubId);
        $input = $request->validate([
            'decision' => ['required', Rule::in(['RESCHEDULE', 'RETURN_TO_SELLER'])],
            'scheduled_redelivery_at' => ['required_if:decision,RESCHEDULE', 'nullable', 'date', 'after_or_equal:today'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);
        $issue = DB::transaction(function () use ($request, $hubId, $issueId, $input): object {
            $issue = DB::table('shipment_issues')->where('id', $issueId)->lockForUpdate()->first();
            abort_if($issue === null, 404);
            abort_unless(DB::table('shipments')->where('id', $issue->shipment_id)
                ->where('delivery_hub_id', $hubId)->exists(), 403, 'Kendala bukan milik hub ini.');
            if ($issue->status === 'RESOLVED') {
                abort_unless($issue->decision === $input['decision'], 409, 'Keputusan sudah dibuat.');

                return $issue;
            }
            $shipment = DB::table('shipments')->where('id', $issue->shipment_id)->lockForUpdate()->first();
            abort_unless($shipment->delivery_hub_id === $hubId, 403, 'Kendala bukan milik hub ini.');
            abort_unless($shipment->status === 'AT_HUB_AWAITING_DECISION' &&
                $shipment->custody_type === 'HUB', 409, 'Paket harus dikonfirmasi kembali di hub.');
            $nextStatus = $input['decision'] === 'RESCHEDULE' ? 'WAITING_REDELIVERY' : 'RETURN_REQUESTED';
            DB::table('shipment_issues')->where('id', $issueId)->update([
                'status' => 'RESOLVED', 'decision' => $input['decision'],
                'decision_note' => $input['note'] ?? null,
                'scheduled_redelivery_at' => $input['scheduled_redelivery_at'] ?? null,
                'decided_by' => $request->user()->id, 'decided_at' => now(),
            ]);
            DB::table('shipments')->where('id', $shipment->id)->update([
                'status' => $nextStatus, 'updated_at' => now(),
            ]);
            $eventType = $input['decision'] === 'RESCHEDULE' ? 'REDELIVERY_SCHEDULED' : 'RETURN_REQUESTED';
            $eventId = $this->satria->event($shipment->id, $request->user()->id,
                $eventType, $nextStatus, ['scheduled_at' => $input['scheduled_redelivery_at'] ?? null],
                $shipment->delivery_hub_id);
            $order = DB::table('orders')->where('id', $shipment->order_id)->first();
            $message = $input['decision'] === 'RESCHEDULE'
                ? "Resi {$shipment->awb} dijadwalkan untuk pengantaran ulang. Pantau status di aplikasi."
                : "Resi {$shipment->awb} diajukan untuk dikembalikan ke toko.";
            $this->satria->notifyUser($eventId, $shipment->id, $order->customer_id,
                'BUYER', $eventType, $message);

            return DB::table('shipment_issues')->where('id', $issueId)->first();
        });

        return response()->json(['data' => $issue]);
    }

    public function previewRun(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'HUB_OPERATOR', $id);
        $input = $request->validate([
            'zone_id' => ['required', 'integer', 'exists:service_zones,id'],
            'shipment_ids' => ['required', 'array', 'min:1', 'max:50'],
            'shipment_ids.*' => ['required', 'integer', 'distinct', 'exists:shipments,id'],
        ]);
        abort_unless(DB::table('service_zones')->where('id', $input['zone_id'])
            ->where('hub_id', $id)->where('active', true)->exists(), 422, 'Zona bukan bagian dari hub aktif.');
        $shipments = DB::table('shipments')->whereIn('id', $input['shipment_ids'])->get();
        abort_unless($shipments->count() === count($input['shipment_ids']), 422);
        foreach ($shipments as $shipment) {
            abort_unless($shipment->delivery_hub_id === $id
                && $shipment->delivery_zone_id === $input['zone_id']
                && $shipment->current_hub_id === $id
                && $shipment->custody_type === 'HUB'
                && in_array($shipment->status, ['READY_FOR_LAST_MILE', 'WAITING_REDELIVERY'], true),
                409, "Resi {$shipment->awb} tidak siap di zona/hub ini.");
        }

        return response()->json(['data' => $this->stopPlanner->preview($shipments->all(), $id)]);
    }

    public function scanIn(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'HUB_OPERATOR', $id);
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

    public function shipmentHistory(Request $request, int $id, string $awb): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'HUB_OPERATOR', $id);
        abort_unless(preg_match('/^[0-9]{14}$/', $awb), 404);
        $shipment = DB::table('shipments')->where('awb', $awb)
            ->where('delivery_hub_id', $id)->first();
        abort_if($shipment === null, 404, 'Resi tidak ditemukan di hub ini.');
        $order = DB::table('orders')->where('id', $shipment->order_id)
            ->first(['recipient_name', 'destination_address_snapshot', 'destination_postcode',
                'origin_contact_snapshot', 'origin_address_snapshot']);
        $events = DB::table('tracking_events as event')
            ->leftJoin('users as actor', 'actor.id', '=', 'event.actor_user_id')
            ->leftJoin('hubs as hub', 'hub.id', '=', 'event.hub_id')
            ->where('event.shipment_id', $shipment->id)
            ->orderBy('event.occurred_at')->orderBy('event.id')
            ->get(['event.id', 'event.event_type', 'event.status_after', 'event.details',
                'event.occurred_at', 'actor.name as actor_name', 'hub.name as hub_name'])
            ->map(function ($event): array {
                $row = (array) $event;
                $row['details'] = json_decode((string) $event->details, true) ?: [];

                return $row;
            });
        $attempts = DB::table('delivery_attempts as attempt')
            ->join('run_shipments as stop', 'stop.id', '=', 'attempt.run_shipment_id')
            ->join('delivery_runs as run', 'run.id', '=', 'stop.run_id')
            ->leftJoin('users as courier', 'courier.id', '=', 'run.courier_user_id')
            ->where('attempt.shipment_id', $shipment->id)
            ->orderBy('attempt.attempt_no')
            ->get(['attempt.id', 'attempt.attempt_no', 'attempt.result', 'attempt.failure_reason',
                'attempt.notes', 'attempt.recipient_name', 'attempt.attempted_at',
                'attempt.delivery_photo_ref', 'run.id as run_id', 'courier.name as courier_name'])
            ->map(function ($attempt): array {
                $row = (array) $attempt;
                $row['photo_available'] = $attempt->delivery_photo_ref !== null
                    && Storage::disk('local')->exists($attempt->delivery_photo_ref);
                unset($row['delivery_photo_ref']);

                return $row;
            });
        $issues = DB::table('shipment_issues as issue')
            ->join('delivery_attempts as attempt', 'attempt.id', '=', 'issue.delivery_attempt_id')
            ->leftJoin('users as actor', 'actor.id', '=', 'issue.decided_by')
            ->where('issue.shipment_id', $shipment->id)
            ->orderBy('attempt.attempt_no')
            ->get(['issue.id', 'attempt.attempt_no', 'issue.status', 'issue.decision',
                'issue.decision_note', 'issue.scheduled_redelivery_at', 'issue.created_at',
                'issue.decided_at', 'actor.name as decided_by_name']);
        $notifications = DB::table('notifications as notification')
            ->leftJoin('notification_targets as target', 'target.id', '=', 'notification.target_id')
            ->leftJoin('users as recipient', 'recipient.id', '=', 'target.user_id')
            ->where('notification.shipment_id', $shipment->id)
            ->orderByDesc('notification.created_at')->orderByDesc('notification.id')
            ->get(['notification.id', 'notification.logical_recipient', 'notification.template_key',
                'notification.status', 'notification.delivery_mode', 'notification.created_at',
                'notification.sent_at', 'notification.last_error', 'recipient.name as recipient_name']);
        $pickupPhoto = DB::table('pickup_assignments as assignment')
            ->join('pickup_tasks as task', 'task.id', '=', 'assignment.pickup_task_id')
            ->where('task.shipment_id', $shipment->id)->where('assignment.status', 'COMPLETED')
            ->whereNotNull('assignment.pickup_photo_ref')
            ->orderByDesc('assignment.id')->first(['assignment.picked_up_at']);

        return response()->json(['data' => [
            'shipment' => [
                'id' => $shipment->id, 'awb' => $shipment->awb, 'status' => $shipment->status,
                'created_at' => $shipment->created_at, 'delivered_at' => $shipment->delivered_at,
                'custody_type' => $shipment->custody_type,
                'recipient_name' => $order?->recipient_name,
                'destination_address' => $order?->destination_address_snapshot,
                'destination_postcode' => $order?->destination_postcode,
                'sender_name' => $order?->origin_contact_snapshot,
                'origin_address' => $order?->origin_address_snapshot,
            ],
            'hub_name' => DB::table('hubs')->where('id', $id)->value('name'),
            'pickup_photo_available' => $pickupPhoto !== null,
            'pickup_photo_taken_at' => $pickupPhoto?->picked_up_at,
            'events' => $events,
            'attempts' => $attempts,
            'issues' => $issues,
            'notifications' => $notifications,
        ]]);
    }

    public function createRun(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'HUB_OPERATOR', $id);
        $input = $request->validate([
            'zone_id' => ['required', 'integer', 'exists:service_zones,id'],
            'courier_user_id' => ['required', 'integer', 'exists:courier_profiles,user_id'],
            'shipment_ids' => ['required', 'array', 'min:1', 'max:50'],
            'shipment_ids.*' => ['required', 'integer', 'distinct', 'exists:shipments,id'],
            'service_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'stop_order' => ['nullable', 'array'],
            'stop_order.*' => ['integer', 'distinct'],
        ]);
        $windowStart = '00:00';
        $windowEnd = '23:59';
        $result = DB::transaction(function () use ($request, $id, $input, $windowStart, $windowEnd): array {
            $zone = DB::table('service_zones')->where('id', $input['zone_id'])
                ->where('hub_id', $id)->where('active', true)->first();
            abort_if($zone === null, 422, 'Zona bukan bagian dari hub aktif.');
            $courier = DB::table('courier_profiles')->where('user_id', $input['courier_user_id'])
                ->lockForUpdate()->first();
            abort_unless($courier?->available && $courier->home_hub_id === $id &&
                DB::table('users')->where('id', $courier->user_id)->where('active', true)->exists(),
                422, 'Kurir tidak tersedia di hub ini.');
            abort_if(DB::table('delivery_runs')->where('courier_user_id', $courier->user_id)
                ->whereIn('status', ['PENDING_ACCEPT', 'ACCEPTED', 'OUT_FOR_DELIVERY'])
                ->where(function ($query) use ($input): void {
                    $query->where('status', 'OUT_FOR_DELIVERY')
                        ->orWhere('service_date', $input['service_date']);
                })->exists(),
                409, 'Kurir sedang mengantar atau sudah memiliki tugas aktif pada tanggal tersebut.');
            abort_if(DB::table('shipments')->where('delivery_hub_id', $id)
                ->where('current_courier_id', $courier->user_id)
                ->where('status', 'DELIVERY_FAILED')
                ->where('custody_type', 'COURIER')->exists(),
                409, 'Kurir masih membawa paket gagal. Konfirmasi penerimaan paket di hub terlebih dahulu.');
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
                    abort_if($scheduled === null || $input['service_date'] <
                        Carbon::parse($scheduled)->timezone('Asia/Jakarta')->toDateString(),
                        409, 'Tanggal tugas lebih awal dari jadwal antar ulang yang dijanjikan.');
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
                'window_start' => $windowStart, 'window_end' => $windowEnd,
                'status' => 'PENDING_ACCEPT', 'assigned_at' => now(),
            ]);
            $assignmentEventId = null;
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
                $assignmentEventId ??= $eventId;
            }
            $this->satria->notifyUser($assignmentEventId, $orderedIds[0], $courier->user_id, 'COURIER',
                'DELIVERY_ASSIGNED', "Tugas antar baru pada run #{$runId}. Silakan terima atau tolak.");

            return ['run' => DB::table('delivery_runs')->where('id', $runId)->first(), 'strategy' => $strategy];
        });

        return response()->json(['data' => array_merge($this->satria->runPayload($result['run']), [
            'route_strategy' => $result['strategy'],
        ])], 201);
    }

    public function handover(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'HUB_OPERATOR', $id);
        $input = $request->validate([
            'run_id' => ['required', 'integer', 'exists:delivery_runs,id'],
            'awbs' => ['required', 'array', 'min:1'],
            'awbs.*' => ['required', 'string', 'distinct'],
        ]);
        $run = DB::transaction(function () use ($request, $id, $input): object {
            $run = DB::table('delivery_runs')->where('id', $input['run_id'])->lockForUpdate()->first();
            abort_unless($run->hub_id === $id, 403);
            abort_unless($run->status === 'ACCEPTED', 409, 'Run harus diterima kurir.');
            $rows = DB::table('run_shipments')->where('run_id', $run->id)
                ->where('status', 'ASSIGNED')->orderBy('id')->lockForUpdate()->get();
            abort_unless($rows->isNotEmpty(), 409, 'Tidak ada paket yang diterima kurir.');
            $expected = DB::table('shipments')->whereIn('id', $rows->pluck('shipment_id'))
                ->pluck('awb')->sort()->values()->all();
            $actual = collect($input['awbs'])->sort()->values()->all();
            abort_unless($expected === $actual, 422, 'Daftar AWB harus sesuai dengan seluruh paket yang diterima kurir.');
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
        $this->satria->requireRole($request->user(), 'HUB_OPERATOR', $id);
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
            $this->satria->notifyRoleAtHub($eventId, $shipment->id, 'HUB_OPERATOR', $id,
                'REDELIVERY_DECISION_REQUIRED',
                "Paket {$shipment->awb} kembali ke hub. Putuskan jadwal ulang atau retur.");

            return DB::table('shipments')->where('id', $shipment->id)->first();
        });

        return response()->json(['data' => $this->satria->shipmentPayload($shipment)]);
    }
}
