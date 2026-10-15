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
            'approved_today' => DB::table('orders')->where('status', 'APPROVED')->whereDate('reviewed_at', today())->count(),
            'awb_issued_total' => DB::table('shipments')->count(),
            'pickup_pending' => DB::table('pickup_tasks')->whereIn('status', ['READY_FOR_PICKUP', 'ASSIGNED'])->count(),
            'ready_for_last_mile' => DB::table('shipments')->whereIn('status', ['READY_FOR_LAST_MILE', 'WAITING_REDELIVERY'])->count(),
            'active_runs' => DB::table('delivery_runs')->whereIn('status', ['PENDING_ACCEPT', 'ACCEPTED', 'OUT_FOR_DELIVERY'])->count(),
            'open_issues' => DB::table('shipment_issues')->where('status', 'OPEN')->count(),
            'delivered_today' => DB::table('shipments')->where('status', 'DELIVERED')->whereDate('delivered_at', today())->count(),
        ]]);
    }

    public function network(Request $request): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'OPS_ADMIN');
        $coverages = DB::table('postal_coverages')->where('active', true)->orderBy('postcode')->get()
            ->groupBy('zone_id');
        $zones = DB::table('service_zones')->where('active', true)->orderBy('name')->get()
            ->groupBy('hub_id');
        $assignments = DB::table('courier_zones')->get()->groupBy('courier_user_id');
        $couriers = DB::table('courier_profiles as courier')
            ->join('users as user', 'user.id', '=', 'courier.user_id')
            ->where('user.active', true)
            ->get(['courier.*', 'user.name', 'user.phone'])->groupBy('home_hub_id');
        $activeRuns = DB::table('delivery_runs')->whereIn('status', ['PENDING_ACCEPT', 'ACCEPTED', 'OUT_FOR_DELIVERY'])
            ->get(['courier_user_id', 'status'])->groupBy('courier_user_id');
        $activePickups = DB::table('pickup_assignments')->whereIn('status', ['PENDING_ACCEPT', 'ACCEPTED', 'IN_PROGRESS'])
            ->get(['courier_user_id', 'status'])->groupBy('courier_user_id');
        $courierIssues = DB::table('shipment_issues as issue')
            ->join('delivery_attempts as attempt', 'attempt.id', '=', 'issue.delivery_attempt_id')
            ->join('run_shipments as stop', 'stop.id', '=', 'attempt.run_shipment_id')
            ->join('delivery_runs as run', 'run.id', '=', 'stop.run_id')
            ->where('issue.status', 'OPEN')->select('run.courier_user_id')
            ->selectRaw('COUNT(*) AS total')->groupBy('run.courier_user_id')
            ->pluck('total', 'run.courier_user_id');
        $operators = DB::table('user_roles as role')->join('users as user', 'user.id', '=', 'role.user_id')
            ->where('role.role', 'HUB_OPERATOR')->where('user.active', true)
            ->get(['role.hub_id', 'user.id', 'user.name'])->groupBy('hub_id');
        $shipmentCounts = DB::table('shipments')->select('delivery_hub_id')
            ->selectRaw("COUNT(*) AS total, COUNT(*) FILTER (WHERE status IN ('WAITING_SELLER_READY', 'READY_FOR_PICKUP', 'PICKUP_ASSIGNED')) AS before_pickup, COUNT(*) FILTER (WHERE status IN ('PICKED_UP', 'IN_TRANSIT')) AS inbound, COUNT(*) FILTER (WHERE status IN ('READY_FOR_LAST_MILE', 'WAITING_REDELIVERY', 'AT_HUB_AWAITING_DECISION', 'DELIVERY_ASSIGNED')) AS processing, COUNT(*) FILTER (WHERE status = 'OUT_FOR_DELIVERY') AS out_for_delivery, COUNT(*) FILTER (WHERE status = 'DELIVERED') AS delivered")
            ->groupBy('delivery_hub_id')->get()->keyBy('delivery_hub_id');
        $rows = DB::table('hubs')->where('active', true)->orderBy('name')->get()
            ->map(function ($hub) use ($zones, $coverages, $assignments, $couriers, $operators, $shipmentCounts, $activeRuns, $activePickups, $courierIssues): array {
                $counts = $shipmentCounts->get($hub->id);

                return [
                    'id' => $hub->id,
                    'code' => $hub->code,
                    'name' => $hub->name,
                    'address' => $hub->address,
                    'latitude' => $hub->latitude,
                    'longitude' => $hub->longitude,
                    'shipment_counts' => [
                        'total' => (int) ($counts->total ?? 0),
                        'before_pickup' => (int) ($counts->before_pickup ?? 0),
                        'inbound' => (int) ($counts->inbound ?? 0),
                        'processing' => (int) ($counts->processing ?? 0),
                        'out_for_delivery' => (int) ($counts->out_for_delivery ?? 0),
                        'delivered' => (int) ($counts->delivered ?? 0),
                    ],
                    'zones' => $zones->get($hub->id, collect())->map(function ($zone) use ($coverages): array {
                        return [
                            'id' => $zone->id,
                            'code' => $zone->code,
                            'name' => $zone->name,
                            'coverages' => $coverages->get($zone->id, collect())->map(fn ($coverage): array => [
                                'postcode' => $coverage->postcode,
                                'purpose' => $coverage->purpose,
                                'latitude' => $coverage->latitude,
                                'longitude' => $coverage->longitude,
                                'map_radius_meters' => $coverage->map_radius_meters,
                            ])->values()->all(),
                        ];
                    })->values()->all(),
                    'couriers' => $couriers->get($hub->id, collect())->map(function ($courier) use ($assignments, $activeRuns, $activePickups, $courierIssues): array {
                        $runs = $activeRuns->get($courier->user_id, collect());
                        $pickups = $activePickups->get($courier->user_id, collect());
                        $issueCount = (int) ($courierIssues->get($courier->user_id) ?? 0);
                        $status = $runs->contains('status', 'OUT_FOR_DELIVERY') ? 'MENGANTAR'
                            : ($pickups->contains('status', 'IN_PROGRESS') ? 'PICKUP'
                            : ($runs->isNotEmpty() || $pickups->isNotEmpty() ? 'MENUNGGU_TUGAS'
                            : ($issueCount > 0 ? 'GANGGUAN' : ($courier->available ? 'READY' : 'TIDAK_TERSEDIA'))));

                        return [
                            'user_id' => $courier->user_id,
                            'name' => $courier->name,
                            'phone' => $courier->phone,
                            'available' => $courier->available,
                            'operational_status' => $status,
                            'active_task_count' => $runs->count() + $pickups->count(),
                            'open_issue_count' => $issueCount,
                            'zones' => $assignments->get($courier->user_id, collect())->map(fn ($assignment): array => [
                                'zone_id' => $assignment->zone_id,
                                'service_type' => $assignment->service_type,
                            ])->values()->all(),
                        ];
                    })->values()->all(),
                    'operators' => $operators->get($hub->id, collect())->map(fn ($operator): array => [
                        'id' => $operator->id, 'name' => $operator->name,
                    ])->values()->all(),
                ];
            });

        return response()->json(['data' => ['hubs' => $rows, 'updated_at' => now()->toIso8601String()]]);
    }

    public function adminOrders(Request $request): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'OPS_ADMIN');
        $status = $request->query('status');
        $rows = DB::table('orders')->when($status, fn ($query) => $query->where('status', $status))
            ->orderByDesc('created_at')->limit(100)->get()
            ->map(function ($order): array {
                $payload = $this->satria->orderPayload($order);
                $assigned = DB::table('shipments as shipment')
                    ->join('hubs as hub', 'hub.id', '=', 'shipment.delivery_hub_id')
                    ->join('service_zones as zone', 'zone.id', '=', 'shipment.delivery_zone_id')
                    ->where('shipment.order_id', $order->id)
                    ->first(['hub.id', 'hub.name', 'zone.name as zone_name']);
                if ($assigned) {
                    $payload['destination_hub'] = [
                        'id' => $assigned->id, 'name' => $assigned->name,
                        'zone_name' => $assigned->zone_name, 'routing_basis' => 'ASSIGNED',
                    ];
                } else {
                    $coverage = $this->satria->deliveryCoverage($order->destination_postcode,
                        $order->destination_latitude === null ? null : (float) $order->destination_latitude,
                        $order->destination_longitude === null ? null : (float) $order->destination_longitude);
                    $payload['destination_hub'] = $coverage ? [
                        'id' => $coverage->hub_id,
                        'name' => $coverage->hub_name,
                        'zone_name' => $coverage->zone_name,
                        'routing_basis' => $order->destination_latitude === null ? 'POSTCODE_CENTER' : 'ADDRESS_COORDINATE',
                    ] : null;
                }

                return $payload;
            });

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
            $delivery = $this->satria->deliveryCoverage($order->destination_postcode,
                $order->destination_latitude === null ? null : (float) $order->destination_latitude,
                $order->destination_longitude === null ? null : (float) $order->destination_longitude);
            abort_if($delivery === null, 422, 'Kode pos tujuan belum tercakup oleh hub aktif.');

            $weight = $input['weight_grams'] ?? $order->estimated_weight_grams;
            $length = $input['length_mm'] ?? $order->estimated_length_mm;
            $width = $input['width_mm'] ?? $order->estimated_width_mm;
            $height = $input['height_mm'] ?? $order->estimated_height_mm;
            $shipmentStatus = 'READY_FOR_PICKUP';
            $awb = $this->satria->uniqueAwb();

            DB::table('orders')->where('id', $order->id)->update([
                'status' => 'APPROVED', 'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(), 'updated_at' => now(),
            ]);
            $shipmentId = DB::table('shipments')->insertGetId([
                'order_id' => $order->id, 'awb' => $awb,
                'origin_hub_id' => $delivery->hub_id, 'delivery_hub_id' => $delivery->hub_id,
                'pickup_zone_id' => $delivery->zone_id, 'delivery_zone_id' => $delivery->zone_id,
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
                'active' => true, 'change_reason' => 'Pickup toko menuju satu hub operasional',
                'created_at' => now(),
            ]);
            DB::table('route_stops')->insert([
                'route_plan_id' => $planId, 'sequence_no' => 1,
                'hub_id' => $delivery->hub_id,
            ]);
            DB::table('pickup_tasks')->insert([
                'shipment_id' => $shipmentId,
                'status' => $shipmentStatus,
                'ready_at' => now(),
                'created_at' => now(),
            ]);
            $eventId = $this->satria->event($shipmentId, $request->user()->id, 'AWB_GENERATED', $shipmentStatus, [
                'awb' => $awb,
            ]);
            $this->satria->notifyUser(
                $eventId, $shipmentId, $order->customer_id, 'BUYER', 'AWB_GENERATED',
                "Pesanan {$order->order_no} disetujui. Resi Anda: {$awb}. Lacak di aplikasi Anteraja."
            );
            $this->satria->notifyRoleAtHub($eventId, $shipmentId, 'HUB_OPERATOR', $delivery->hub_id,
                'PICKUP_READY', "Resi {$awb} siap dijemput. Atur kurir pickup dari hub Anda.");

            return DB::table('orders')->where('id', $order->id)->first();
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
