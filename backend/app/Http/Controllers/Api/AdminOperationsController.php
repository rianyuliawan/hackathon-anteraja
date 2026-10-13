<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\SatriaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminOperationsController extends Controller
{
    public function __construct(private readonly SatriaService $satria) {}

    public function dashboard(Request $request): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'OPS_ADMIN');

        return response()->json(['data' => [
            'pending_orders' => DB::table('orders')->where('status', 'PENDING_APPROVAL')->count(),
            'pickup_pending' => DB::table('pickup_tasks')->whereIn('status', ['READY_FOR_PICKUP', 'ASSIGNED'])->count(),
            'ready_for_last_mile' => DB::table('shipments')->whereIn('status', ['READY_FOR_LAST_MILE', 'WAITING_REDELIVERY'])->count(),
            'active_runs' => DB::table('delivery_runs')->whereIn('status', ['PENDING_ACCEPT', 'ACCEPTED', 'OUT_FOR_DELIVERY'])->count(),
            'open_issues' => DB::table('shipment_issues')->where('status', 'OPEN')->count(),
            'delivered_today' => DB::table('shipments')->where('status', 'DELIVERED')->whereDate('delivered_at', today())->count(),
        ]]);
    }

    public function adminOrders(Request $request): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'OPS_ADMIN');
        $status = $request->query('status');
        $rows = DB::table('orders')->when($status, fn ($query) => $query->where('status', $status))
            ->orderByDesc('created_at')->limit(100)->get()
            ->map(fn ($order) => $this->satria->orderPayload($order));

        return response()->json(['data' => $rows]);
    }

    public function approveOrder(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'OPS_ADMIN');
        $input = $request->validate([
            'weight_grams' => ['nullable', 'integer', 'min:1', 'max:100000'],
            'length_mm' => ['nullable', 'integer', 'min:1', 'max:3000'],
            'width_mm' => ['nullable', 'integer', 'min:1', 'max:3000'],
            'height_mm' => ['nullable', 'integer', 'min:1', 'max:3000'],
            'pickup_ready' => ['sometimes', 'boolean'],
        ]);

        $order = DB::transaction(function () use ($request, $id, $input): object {
            $order = DB::table('orders')->where('id', $id)->lockForUpdate()->first();
            abort_if($order === null, 404);
            if ($order->status === 'APPROVED') {
                return $order;
            }
            abort_unless($order->status === 'PENDING_APPROVAL', 409, 'Order tidak dapat di-ACC.');
            abort_unless(DB::table('order_items')->where('order_id', $order->id)->exists(), 422, 'Item order kosong.');
            abort_unless(DB::table('seller_profiles')->where('user_id', $order->seller_user_id)
                ->where('active', true)->exists(), 422, 'Toko sedang tidak aktif.');
            $origin = DB::table('postal_coverages')->where('postcode', $order->origin_postcode)
                ->where('purpose', 'ORIGIN')->where('active', true)->first();
            $delivery = DB::table('postal_coverages')->where('postcode', $order->destination_postcode)
                ->where('purpose', 'DELIVERY')->where('active', true)->first();
            abort_if($origin === null || $delivery === null, 422, 'Kode pos asal atau tujuan belum tercakup.');
            abort_unless(
                DB::table('hubs')->whereIn('id', [$origin->hub_id, $delivery->hub_id])->where('active', true)->count()
                    === count(array_unique([$origin->hub_id, $delivery->hub_id])),
                422,
                'Hub asal atau tujuan tidak aktif.'
            );

            $weight = $input['weight_grams'] ?? $order->estimated_weight_grams;
            $length = $input['length_mm'] ?? $order->estimated_length_mm;
            $width = $input['width_mm'] ?? $order->estimated_width_mm;
            $height = $input['height_mm'] ?? $order->estimated_height_mm;
            $ready = $input['pickup_ready'] ?? true;
            $shipmentStatus = $ready ? 'READY_FOR_PICKUP' : 'WAITING_SELLER_READY';
            $awb = $this->satria->uniqueAwb();

            DB::table('orders')->where('id', $order->id)->update([
                'status' => 'APPROVED', 'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(), 'updated_at' => now(),
            ]);
            $shipmentId = DB::table('shipments')->insertGetId([
                'order_id' => $order->id, 'awb' => $awb,
                'origin_hub_id' => $origin->hub_id, 'delivery_hub_id' => $delivery->hub_id,
                'pickup_zone_id' => $origin->zone_id, 'delivery_zone_id' => $delivery->zone_id,
                'status' => $shipmentStatus, 'custody_type' => 'SELLER',
                'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('parcels')->insert([
                'shipment_id' => $shipmentId, 'parcel_no' => 1,
                'weight_grams' => $weight, 'length_mm' => $length,
                'width_mm' => $width, 'height_mm' => $height,
            ]);
            $planId = DB::table('route_plans')->insertGetId([
                'shipment_id' => $shipmentId, 'version' => 1,
                'active' => true, 'change_reason' => 'Rute demo langsung ke hub tujuan',
                'created_at' => now(),
            ]);
            DB::table('route_stops')->insert([
                'route_plan_id' => $planId, 'sequence_no' => 1,
                'hub_id' => $delivery->hub_id,
            ]);
            DB::table('pickup_tasks')->insert([
                'shipment_id' => $shipmentId,
                'status' => $shipmentStatus,
                'ready_at' => $ready ? now() : null,
                'created_at' => now(),
            ]);
            $eventId = $this->satria->event($shipmentId, $request->user()->id, 'AWB_GENERATED', $shipmentStatus, [
                'awb' => $awb,
            ]);
            $this->satria->notifyUser(
                $eventId, $shipmentId, $order->customer_id, 'BUYER', 'AWB_GENERATED',
                "Pesanan {$order->order_no} disetujui. Resi Anda: {$awb}. Lacak di aplikasi Satria."
            );

            return DB::table('orders')->where('id', $order->id)->first();
        });

        return response()->json(['data' => $this->satria->orderPayload($order)]);
    }

    public function rejectOrder(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'OPS_ADMIN');
        $input = $request->validate(['reason' => ['required', 'string', 'max:1000']]);
        $order = DB::transaction(function () use ($request, $id, $input): object {
            $order = DB::table('orders')->where('id', $id)->lockForUpdate()->first();
            abort_if($order === null, 404);
            abort_unless($order->status === 'PENDING_APPROVAL', 409, 'Order sudah diproses.');
            DB::table('orders')->where('id', $id)->update([
                'status' => 'REJECTED', 'rejection_reason' => $input['reason'],
                'reviewed_by' => $request->user()->id, 'reviewed_at' => now(), 'updated_at' => now(),
            ]);

            return DB::table('orders')->where('id', $id)->first();
        });

        return response()->json(['data' => $this->satria->orderPayload($order)]);
    }

    public function pickupTasks(Request $request): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'OPS_ADMIN');
        $rows = DB::table('pickup_tasks')->orderByDesc('created_at')->limit(100)->get()
            ->map(function ($task): array {
                $shipment = DB::table('shipments')->where('id', $task->shipment_id)->first();

                return array_merge((array) $task, [
                    'shipment' => $this->satria->shipmentPayload($shipment),
                    'assignments' => DB::table('pickup_assignments')->where('pickup_task_id', $task->id)
                        ->orderByDesc('id')->get(),
                ]);
            });

        return response()->json(['data' => $rows]);
    }

    public function markPickupReady(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'OPS_ADMIN');
        $task = DB::transaction(function () use ($request, $id): object {
            $task = DB::table('pickup_tasks')->where('id', $id)->lockForUpdate()->first();
            abort_if($task === null, 404);
            if ($task->status === 'READY_FOR_PICKUP') {
                return $task;
            }
            abort_unless($task->status === 'WAITING_SELLER_READY', 409, 'Pickup tidak dapat ditandai siap.');
            DB::table('pickup_tasks')->where('id', $id)->update(['status' => 'READY_FOR_PICKUP', 'ready_at' => now()]);
            DB::table('shipments')->where('id', $task->shipment_id)->update([
                'status' => 'READY_FOR_PICKUP', 'updated_at' => now(),
            ]);
            $this->satria->event($task->shipment_id, $request->user()->id, 'SELLER_READY', 'READY_FOR_PICKUP');

            return DB::table('pickup_tasks')->where('id', $id)->first();
        });

        return response()->json(['data' => $task]);
    }

    public function assignPickup(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'OPS_ADMIN');
        $input = $request->validate([
            'courier_user_id' => ['required', 'integer', 'exists:courier_profiles,user_id'],
            'scheduled_at' => ['nullable', 'date'],
        ]);
        $assignment = DB::transaction(function () use ($request, $id, $input): object {
            $task = DB::table('pickup_tasks')->where('id', $id)->lockForUpdate()->first();
            abort_if($task === null, 404);
            abort_unless($task->status === 'READY_FOR_PICKUP', 409, 'Paket belum siap pickup.');
            $shipment = DB::table('shipments')->where('id', $task->shipment_id)->lockForUpdate()->first();
            $courier = DB::table('courier_profiles')->where('user_id', $input['courier_user_id'])
                ->lockForUpdate()->first();
            abort_unless($courier?->available && DB::table('users')->where('id', $courier->user_id)
                ->where('active', true)->exists(), 422, 'Kurir tidak tersedia.');
            abort_unless(DB::table('courier_zones')->where('courier_user_id', $courier->user_id)
                ->where('zone_id', $shipment->pickup_zone_id)->where('service_type', 'PICKUP')->exists(),
                422, 'Kurir tidak melayani zona pickup.');
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

    public function adminCouriers(Request $request): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'OPS_ADMIN');
        $rows = DB::table('courier_profiles as c')->join('users as u', 'u.id', '=', 'c.user_id')
            ->select('c.*', 'u.name', 'u.email', 'u.phone')->orderBy('u.name')->get()
            ->map(function ($courier): array {
                return array_merge((array) $courier, [
                    'zones' => DB::table('courier_zones as cz')
                        ->join('service_zones as z', 'z.id', '=', 'cz.zone_id')
                        ->where('cz.courier_user_id', $courier->user_id)
                        ->get(['z.id', 'z.name', 'cz.service_type']),
                ]);
            });

        return response()->json(['data' => $rows]);
    }

    public function issues(Request $request): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'OPS_ADMIN');
        $rows = DB::table('shipment_issues')->orderByDesc('created_at')->limit(100)->get()
            ->map(function ($issue): array {
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

    public function issueDecision(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'OPS_ADMIN');
        $input = $request->validate([
            'decision' => ['required', Rule::in(['RESCHEDULE', 'RETURN_TO_SELLER'])],
            'scheduled_redelivery_at' => ['required_if:decision,RESCHEDULE', 'nullable', 'date', 'after_or_equal:today'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);
        $issue = DB::transaction(function () use ($request, $id, $input): object {
            $issue = DB::table('shipment_issues')->where('id', $id)->lockForUpdate()->first();
            abort_if($issue === null, 404);
            if ($issue->status === 'RESOLVED') {
                abort_unless($issue->decision === $input['decision'], 409, 'Keputusan sudah dibuat.');

                return $issue;
            }
            $shipment = DB::table('shipments')->where('id', $issue->shipment_id)->lockForUpdate()->first();
            abort_unless($shipment->status === 'AT_HUB_AWAITING_DECISION' &&
                $shipment->custody_type === 'HUB', 409, 'Paket harus kembali dan di-scan di hub.');
            $nextStatus = $input['decision'] === 'RESCHEDULE' ? 'WAITING_REDELIVERY' : 'RETURN_REQUESTED';
            DB::table('shipment_issues')->where('id', $id)->update([
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

            return DB::table('shipment_issues')->where('id', $id)->first();
        });

        return response()->json(['data' => $issue]);
    }

    public function attempts(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'OPS_ADMIN');
        abort_unless(DB::table('shipments')->where('id', $id)->exists(), 404);
        $rows = DB::table('delivery_attempts as a')
            ->join('run_shipments as rs', 'rs.id', '=', 'a.run_shipment_id')
            ->join('delivery_runs as r', 'r.id', '=', 'rs.run_id')
            ->join('users as u', 'u.id', '=', 'r.courier_user_id')
            ->where('a.shipment_id', $id)
            ->orderBy('a.attempt_no')
            ->get(['a.*', 'r.courier_user_id', 'u.name as courier_name']);

        return response()->json(['data' => $rows]);
    }

    public function dailyReports(Request $request): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'OPS_ADMIN');
        $date = $request->validate(['date' => ['nullable', 'date_format:Y-m-d']])['date'] ?? today()->toDateString();
        $rows = DB::table('daily_reports as r')->join('hubs as h', 'h.id', '=', 'r.hub_id')
            ->where('r.report_date', $date)->orderBy('h.name')
            ->get(['r.*', 'h.name as hub_name']);

        return response()->json(['data' => $rows]);
    }

    public function generateDailyReport(Request $request): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'OPS_ADMIN');
        $date = $request->validate(['report_date' => ['nullable', 'date_format:Y-m-d']])['report_date']
            ?? today()->toDateString();

        return response()->json(['data' => $this->satria->generateDailyReports($date)]);
    }

    public function createInternalUser(Request $request): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'OPS_ADMIN');
        $request->merge(['email' => Str::lower(trim((string) $request->input('email', '')))]);
        $input = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'email' => ['required', 'email', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'phone' => ['nullable', 'string', 'max:30'],
            'role' => ['required', Rule::in(['OPS_ADMIN', 'HUB_OPERATOR', 'COURIER', 'SELLER'])],
            'hub_id' => ['required_if:role,HUB_OPERATOR,COURIER', 'nullable', 'integer', 'exists:hubs,id'],
            'zone_ids' => ['array'],
            'zone_ids.*' => ['integer', 'exists:service_zones,id'],
            'service_type' => ['nullable', Rule::in(['PICKUP', 'DELIVERY'])],
            'store_name' => ['required_if:role,SELLER', 'nullable', 'string', 'max:160'],
        ]);
        $user = DB::transaction(function () use ($input): User {
            $user = User::create([
                'name' => $input['name'], 'email' => Str::lower($input['email']),
                'password' => Hash::make($input['password']), 'phone' => $input['phone'] ?? null,
            ]);
            DB::table('user_roles')->insert([
                'user_id' => $user->id, 'role' => $input['role'],
                'hub_id' => $input['role'] === 'HUB_OPERATOR' ? $input['hub_id'] : null,
                'created_at' => now(),
            ]);
            if ($input['role'] === 'COURIER') {
                DB::table('courier_profiles')->insert([
                    'user_id' => $user->id, 'home_hub_id' => $input['hub_id'],
                ]);
                foreach ($input['zone_ids'] ?? [] as $zoneId) {
                    abort_unless(DB::table('service_zones')->where('id', $zoneId)
                        ->where('hub_id', $input['hub_id'])->exists(), 422, 'Zona harus di hub kurir.');
                    DB::table('courier_zones')->insert([
                        'courier_user_id' => $user->id, 'zone_id' => $zoneId,
                        'service_type' => $input['service_type'] ?? 'DELIVERY',
                    ]);
                }
            }
            if ($input['role'] === 'SELLER') {
                DB::table('seller_profiles')->insert([
                    'user_id' => $user->id, 'store_name' => $input['store_name'],
                ]);
            }

            return $user;
        });

        return response()->json(['data' => $user->only(['id', 'name', 'email', 'phone'])], 201);
    }

    public function createHub(Request $request): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'OPS_ADMIN');
        $input = $request->validate([
            'code' => ['required', 'string', 'max:30', 'unique:hubs,code'],
            'name' => ['required', 'string', 'max:160'],
            'address' => ['nullable', 'string', 'max:500'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'zones' => ['required', 'array', 'min:1'],
            'zones.*.code' => ['required', 'string', 'max:50', 'distinct'],
            'zones.*.name' => ['required', 'string', 'max:160'],
            'coverages' => ['array'],
            'coverages.*.postcode' => ['required', 'regex:/^[0-9]{5}$/'],
            'coverages.*.purpose' => ['required', Rule::in(['ORIGIN', 'DELIVERY'])],
            'coverages.*.zone_code' => ['required', 'string'],
        ]);
        abort_if(array_key_exists('latitude', $input) !== array_key_exists('longitude', $input),
            422, 'Koordinat hub harus berpasangan.');
        $hub = DB::transaction(function () use ($input): object {
            $id = DB::table('hubs')->insertGetId([
                'code' => $input['code'], 'name' => $input['name'],
                'address' => $input['address'] ?? null,
                'latitude' => $input['latitude'] ?? null,
                'longitude' => $input['longitude'] ?? null,
                'created_at' => now(),
            ]);
            $zoneIds = [];
            foreach ($input['zones'] as $zone) {
                $zoneIds[$zone['code']] = DB::table('service_zones')->insertGetId([
                    'hub_id' => $id, 'code' => $zone['code'], 'name' => $zone['name'],
                ]);
            }
            foreach ($input['coverages'] ?? [] as $coverage) {
                abort_unless(isset($zoneIds[$coverage['zone_code']]), 422, 'Kode zona cakupan tidak ada.');
                abort_if(DB::table('postal_coverages')->where('postcode', $coverage['postcode'])
                    ->where('purpose', $coverage['purpose'])->exists(), 409, 'Cakupan kode pos sudah dipakai.');
                DB::table('postal_coverages')->insert([
                    'postcode' => $coverage['postcode'], 'purpose' => $coverage['purpose'],
                    'hub_id' => $id, 'zone_id' => $zoneIds[$coverage['zone_code']],
                ]);
            }

            return DB::table('hubs')->where('id', $id)->first();
        });

        return response()->json(['data' => $hub], 201);
    }
}
