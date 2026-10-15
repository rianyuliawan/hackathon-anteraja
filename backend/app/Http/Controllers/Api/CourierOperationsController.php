<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\SatriaService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class CourierOperationsController extends Controller
{
    public function __construct(private readonly SatriaService $satria) {}

    public function courierPickupAssignments(Request $request): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'COURIER');
        $rows = DB::table('pickup_assignments as a')
            ->join('pickup_tasks as t', 't.id', '=', 'a.pickup_task_id')
            ->join('shipments as s', 's.id', '=', 't.shipment_id')
            ->join('orders as o', 'o.id', '=', 's.order_id')
            ->join('seller_locations as l', 'l.id', '=', 'o.seller_location_id')
            ->join('hubs as h', 'h.id', '=', 's.origin_hub_id')
            ->where('a.courier_user_id', $request->user()->id)
            ->select('a.*', 's.awb', 's.id as shipment_id', 'o.origin_address_snapshot as seller_address',
                'l.contact_phone as seller_phone', 'l.contact_name as seller_name',
                'h.name as hub_name', 'h.address as hub_address')
            ->orderByDesc('a.assigned_at')->limit(100)->get();

        return response()->json(['data' => $rows]);
    }

    public function acceptPickup(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'COURIER');
        $assignment = DB::transaction(function () use ($request, $id): object {
            $assignment = DB::table('pickup_assignments')->where('id', $id)->lockForUpdate()->first();
            abort_if($assignment === null, 404);
            abort_unless($assignment->courier_user_id === $request->user()->id, 403);
            if ($assignment->status === 'ACCEPTED') {
                return $assignment;
            }
            abort_unless($assignment->status === 'PENDING_ACCEPT', 409, 'Tugas pickup sudah dijawab.');
            DB::table('pickup_assignments')->where('id', $id)->update([
                'status' => 'ACCEPTED', 'responded_at' => now(),
            ]);
            $shipmentId = DB::table('pickup_tasks')->where('id', $assignment->pickup_task_id)->value('shipment_id');
            $this->satria->event($shipmentId, $request->user()->id, 'PICKUP_ACCEPTED', 'PICKUP_ASSIGNED');

            return DB::table('pickup_assignments')->where('id', $id)->first();
        });

        return response()->json(['data' => $assignment]);
    }

    public function completePickup(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'COURIER');
        $input = $request->validate([
            'awb' => ['required', 'string'],
            'photo' => ['required', 'image', 'max:5120'],
            'captured_at' => ['required', 'date'],
        ]);
        $capturedAt = Carbon::parse($input['captured_at']);
        abort_if($capturedAt->lt(now()->subMinutes(5)) || $capturedAt->gt(now()->addSeconds(30)),
            422, 'Foto pickup harus diambil dari kamera dalam lima menit terakhir.');
        $photoRef = $request->file('photo')->store('proofs/pickup', 'local');
        abort_if($photoRef === false, 422, 'Foto pickup gagal disimpan.');
        try {
            $assignment = DB::transaction(function () use ($request, $id, $input, $photoRef): object {
                $assignment = DB::table('pickup_assignments')->where('id', $id)->lockForUpdate()->first();
                abort_if($assignment === null, 404);
                abort_unless($assignment->courier_user_id === $request->user()->id, 403);
                abort_unless($assignment->status === 'ACCEPTED', 409, 'Tugas pickup belum diterima atau sudah selesai.');
                $task = DB::table('pickup_tasks')->where('id', $assignment->pickup_task_id)->lockForUpdate()->first();
                $shipment = DB::table('shipments')->where('id', $task->shipment_id)->lockForUpdate()->first();
                abort_unless($shipment->awb === $input['awb'] && $shipment->status === 'PICKUP_ASSIGNED',
                    409, 'Resi atau status paket tidak sesuai.');
                DB::table('pickup_assignments')->where('id', $id)->update([
                    'status' => 'COMPLETED', 'picked_up_at' => now(),
                    'pickup_photo_ref' => $photoRef,
                ]);
                DB::table('pickup_tasks')->where('id', $task->id)->update(['status' => 'PICKED_UP']);
                DB::table('shipments')->where('id', $shipment->id)->update([
                    'status' => 'PICKED_UP', 'custody_type' => 'COURIER',
                    'current_courier_id' => $request->user()->id, 'updated_at' => now(),
                ]);
                $eventId = $this->satria->event($shipment->id, $request->user()->id,
                    'PICKED_UP', 'PICKED_UP', ['photo_captured_at' => $input['captured_at']]);
                $order = DB::table('orders')->where('id', $shipment->order_id)->first();
                $this->satria->notifyUser($eventId, $shipment->id, $order->customer_id, 'BUYER',
                    'PICKED_UP', "Paket {$shipment->awb} sudah diambil kurir dari toko.");
                $this->satria->notifyUser($eventId, $shipment->id, $order->seller_user_id, 'SELLER',
                    'PICKED_UP', "Paket {$shipment->awb} sudah diambil kurir dari toko Anda.");
                $this->satria->notifyRoleAtHub($eventId, $shipment->id, 'HUB_OPERATOR',
                    $shipment->delivery_hub_id, 'INBOUND_EXPECTED',
                    "Paket {$shipment->awb} menuju hub Anda dan perlu scan saat tiba.");

                return DB::table('pickup_assignments')->where('id', $id)->first();
            });
        } catch (\Throwable $exception) {
            Storage::disk('local')->delete($photoRef);
            throw $exception;
        }

        return response()->json(['data' => $assignment]);
    }

    public function courierRuns(Request $request): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'COURIER');
        $rows = DB::table('delivery_runs')->where('courier_user_id', $request->user()->id)
            ->orderByDesc('assigned_at')->limit(100)->get()
            ->map(fn ($run) => $this->satria->runPayload($run));

        return response()->json(['data' => $rows]);
    }

    public function searchShipments(Request $request): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'COURIER');
        $input = $request->validate(['query' => ['required', 'string', 'regex:/^[0-9]{2,14}$/']]);
        $rows = DB::table('shipments as s')
            ->join('run_shipments as rs', 'rs.shipment_id', '=', 's.id')
            ->join('delivery_runs as r', 'r.id', '=', 'rs.run_id')
            ->join('orders as o', 'o.id', '=', 's.order_id')
            ->where('r.courier_user_id', $request->user()->id)
            ->where('s.awb', 'like', '%'.$input['query'].'%')
            ->select('s.id', 's.awb', 's.status', 'o.recipient_name',
                'o.destination_address_snapshot', 's.updated_at')
            ->distinct()->orderByDesc('s.updated_at')->limit(20)->get();

        return response()->json(['data' => $rows]);
    }

    public function courierShipment(Request $request, string $awb): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'COURIER');
        abort_unless(preg_match('/^[0-9]{14}$/', $awb), 404);
        $shipment = DB::table('shipments')->where('awb', $awb)->first();
        abort_if($shipment === null, 404, 'Resi tidak ditemukan.');
        $assigned = DB::table('run_shipments as rs')
            ->join('delivery_runs as r', 'r.id', '=', 'rs.run_id')
            ->where('rs.shipment_id', $shipment->id)
            ->where('r.courier_user_id', $request->user()->id)->exists();
        abort_unless($assigned, 403, 'Paket tidak ditugaskan kepada akun ini.');

        $assignments = DB::table('run_shipments as rs')
            ->join('delivery_runs as r', 'r.id', '=', 'rs.run_id')
            ->where('rs.shipment_id', $shipment->id)
            ->where('r.courier_user_id', $request->user()->id)
            ->orderByDesc('r.assigned_at')
            ->get(['rs.id', 'rs.run_id', 'rs.stop_order', 'rs.status', 'rs.rejection_reason',
                'rs.handed_over_at', 'rs.returned_at', 'r.service_date', 'r.status as run_status',
                'r.hub_id', 'r.assigned_at']);
        $attempts = DB::table('delivery_attempts as a')
            ->join('run_shipments as rs', 'rs.id', '=', 'a.run_shipment_id')
            ->join('delivery_runs as r', 'r.id', '=', 'rs.run_id')
            ->where('a.shipment_id', $shipment->id)
            ->orderByDesc('a.attempt_no')
            ->get(['a.attempt_no', 'a.result', 'a.failure_reason', 'a.notes', 'a.recipient_name',
                'a.attempted_at', 'r.courier_user_id', 'a.delivery_photo_ref'])
            ->map(fn ($attempt): array => [
                'attempt_no' => $attempt->attempt_no,
                'result' => $attempt->result,
                'failure_reason' => $attempt->failure_reason,
                'notes' => $attempt->notes,
                'recipient_name' => $attempt->recipient_name,
                'attempted_at' => $attempt->attempted_at,
                'photo_available' => $attempt->delivery_photo_ref !== null
                    && (int) $attempt->courier_user_id === (int) $request->user()->id,
            ]);
        $pickupPhoto = DB::table('pickup_assignments as a')
            ->join('pickup_tasks as t', 't.id', '=', 'a.pickup_task_id')
            ->where('t.shipment_id', $shipment->id)
            ->where('a.status', 'COMPLETED')->whereNotNull('a.pickup_photo_ref')
            ->orderByDesc('a.picked_up_at')->first(['a.picked_up_at']);

        return response()->json(['data' => [
            'shipment' => $this->satria->shipmentPayload($shipment),
            'hub_name' => DB::table('hubs')->where('id', $shipment->delivery_hub_id)->value('name'),
            'assignments' => $assignments,
            'attempts' => $attempts,
            'pickup_photo_available' => $pickupPhoto !== null,
            'pickup_photo_taken_at' => $pickupPhoto?->picked_up_at,
        ]]);
    }

    public function acceptRun(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'COURIER');
        $run = DB::transaction(function () use ($request, $id): object {
            $run = DB::table('delivery_runs')->where('id', $id)->lockForUpdate()->first();
            abort_if($run === null, 404);
            abort_unless($run->courier_user_id === $request->user()->id, 403);
            if ($run->status === 'ACCEPTED') {
                return $run;
            }
            abort_unless($run->status === 'PENDING_ACCEPT', 409, 'Run sudah dijawab.');
            DB::table('delivery_runs')->where('id', $id)->update([
                'status' => 'ACCEPTED', 'responded_at' => now(),
            ]);
            foreach (DB::table('run_shipments')->where('run_id', $id)->get() as $row) {
                $this->satria->event($row->shipment_id, $request->user()->id,
                    'DELIVERY_RUN_ACCEPTED', 'DELIVERY_ASSIGNED', ['run_id' => $id], $run->hub_id);
            }

            return DB::table('delivery_runs')->where('id', $id)->first();
        });

        return response()->json(['data' => $this->satria->runPayload($run)]);
    }

    public function rejectRun(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'COURIER');
        $input = $request->validate(['reason' => ['required', 'string', 'max:500']]);
        $run = DB::transaction(function () use ($request, $id, $input): object {
            $run = DB::table('delivery_runs')->where('id', $id)->lockForUpdate()->first();
            abort_if($run === null, 404);
            abort_unless($run->courier_user_id === $request->user()->id, 403);
            if ($run->status === 'REJECTED') {
                return $run;
            }
            abort_unless($run->status === 'PENDING_ACCEPT', 409, 'Run sudah dijawab.');
            DB::table('delivery_runs')->where('id', $id)->update([
                'status' => 'REJECTED', 'responded_at' => now(),
            ]);
            foreach (DB::table('run_shipments')->where('run_id', $id)->get() as $row) {
                DB::table('run_shipments')->where('id', $row->id)->update(['status' => 'CANCELLED']);
                $hasFailure = DB::table('delivery_attempts')->where('shipment_id', $row->shipment_id)
                    ->where('result', 'FAILED')->exists();
                $nextStatus = $hasFailure ? 'WAITING_REDELIVERY' : 'READY_FOR_LAST_MILE';
                DB::table('shipments')->where('id', $row->shipment_id)->update([
                    'status' => $nextStatus, 'updated_at' => now(),
                ]);
                $eventId = $this->satria->event($row->shipment_id, $request->user()->id,
                    'DELIVERY_RUN_REJECTED', $nextStatus,
                    ['run_id' => $id, 'reason' => $input['reason']], $run->hub_id);
                $this->satria->notifyRoleAtHub($eventId, $row->shipment_id,
                    'HUB_OPERATOR', $run->hub_id, 'DELIVERY_RUN_REJECTED',
                    "Run #{$id} ditolak kurir. Paket perlu di-assign ulang.");
            }

            return DB::table('delivery_runs')->where('id', $id)->first();
        });

        return response()->json(['data' => $this->satria->runPayload($run)]);
    }

    public function respondRun(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'COURIER');
        $input = $request->validate([
            'decisions' => ['required', 'array', 'min:1', 'max:50'],
            'decisions.*.shipment_id' => ['required', 'integer', 'distinct', 'exists:shipments,id'],
            'decisions.*.decision' => ['required', Rule::in(['ACCEPTED', 'REJECTED'])],
            'decisions.*.reason' => ['nullable', 'string', 'max:500'],
        ]);
        $run = DB::transaction(function () use ($request, $id, $input): object {
            $run = DB::table('delivery_runs')->where('id', $id)->lockForUpdate()->first();
            abort_if($run === null, 404);
            abort_unless($run->courier_user_id === $request->user()->id, 403);
            abort_unless($run->status === 'PENDING_ACCEPT', 409, 'Run sudah dijawab.');
            $rows = DB::table('run_shipments')->where('run_id', $id)->lockForUpdate()->get();
            $expectedIds = $rows->pluck('shipment_id')->map(fn ($value): int => (int) $value)->sort()->values()->all();
            $decisions = collect($input['decisions'])->keyBy('shipment_id');
            $actualIds = $decisions->keys()->map(fn ($value): int => (int) $value)->sort()->values()->all();
            abort_unless($expectedIds === $actualIds && $rows->every(fn ($row): bool => $row->status === 'ASSIGNED'),
                422, 'Setiap paket dalam run harus dijawab tepat satu kali.');
            $accepted = 0;
            foreach ($rows as $row) {
                $choice = $decisions->get($row->shipment_id);
                if ($choice['decision'] === 'ACCEPTED') {
                    $accepted++;
                    $this->satria->event($row->shipment_id, $request->user()->id,
                        'DELIVERY_RUN_ACCEPTED', 'DELIVERY_ASSIGNED', ['run_id' => $id], $run->hub_id);

                    continue;
                }
                $reason = trim($choice['reason'] ?? '');
                abort_unless(mb_strlen($reason) >= 5, 422, 'Alasan wajib diisi untuk setiap paket yang ditolak.');
                DB::table('run_shipments')->where('id', $row->id)->update([
                    'status' => 'CANCELLED', 'rejection_reason' => $reason,
                ]);
                $hasFailure = DB::table('delivery_attempts')->where('shipment_id', $row->shipment_id)
                    ->where('result', 'FAILED')->exists();
                $nextStatus = $hasFailure ? 'WAITING_REDELIVERY' : 'READY_FOR_LAST_MILE';
                DB::table('shipments')->where('id', $row->shipment_id)->update([
                    'status' => $nextStatus, 'updated_at' => now(),
                ]);
                $eventId = $this->satria->event($row->shipment_id, $request->user()->id,
                    'DELIVERY_ASSIGNMENT_REJECTED', $nextStatus,
                    ['run_id' => $id, 'reason' => $reason], $run->hub_id);
                $this->satria->notifyRoleAtHub($eventId, $row->shipment_id, 'HUB_OPERATOR', $run->hub_id,
                    'DELIVERY_ASSIGNMENT_REJECTED', "Paket dalam run #{$id} ditolak kurir. Assign ulang dari antrean hub.");
            }
            DB::table('delivery_runs')->where('id', $id)->update([
                'status' => $accepted > 0 ? 'ACCEPTED' : 'REJECTED', 'responded_at' => now(),
            ]);

            return DB::table('delivery_runs')->where('id', $id)->first();
        });

        return response()->json(['data' => $this->satria->runPayload($run)]);
    }

    public function startRun(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'COURIER');
        $run = DB::transaction(function () use ($request, $id): object {
            $run = DB::table('delivery_runs')->where('id', $id)->lockForUpdate()->first();
            abort_if($run === null, 404);
            abort_unless($run->courier_user_id === $request->user()->id, 403);
            if ($run->status === 'OUT_FOR_DELIVERY') {
                return $run;
            }
            abort_unless($run->status === 'ACCEPTED', 409, 'Run belum diterima.');
            abort_if(DB::table('delivery_runs')->where('courier_user_id', $run->courier_user_id)
                ->where('id', '!=', $run->id)->where('status', 'OUT_FOR_DELIVERY')->exists(),
                409, 'Selesaikan run pengantaran yang sedang berjalan lebih dulu.');
            abort_if(today('Asia/Jakarta')->lt(Carbon::parse($run->service_date, 'Asia/Jakarta')->startOfDay()),
                409, 'Tanggal pengantaran belum tiba.');
            $rows = DB::table('run_shipments')->where('run_id', $id)
                ->where('status', 'HANDED_OVER')->get();
            abort_unless($rows->isNotEmpty() && ! DB::table('run_shipments')->where('run_id', $id)
                ->where('status', 'ASSIGNED')->exists(), 409, 'Semua paket yang diterima harus diserahterimakan dahulu.');
            DB::table('delivery_runs')->where('id', $id)->update(['status' => 'OUT_FOR_DELIVERY']);
            foreach ($rows as $row) {
                $shipment = DB::table('shipments')->where('id', $row->shipment_id)->first();
                $scheduled = DB::table('shipment_issues')->where('shipment_id', $shipment->id)
                    ->where('decision', 'RESCHEDULE')->orderByDesc('id')
                    ->value('scheduled_redelivery_at');
                abort_if($scheduled !== null && now()->lt($scheduled), 409,
                    'Waktu antar ulang yang dijanjikan belum tiba.');
                DB::table('shipments')->where('id', $row->shipment_id)->update([
                    'status' => 'OUT_FOR_DELIVERY', 'updated_at' => now(),
                ]);
                $eventId = $this->satria->event($row->shipment_id, $request->user()->id,
                    'OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY',
                    ['run_id' => $id, 'stop_order' => $row->stop_order]);
                $order = DB::table('orders')->where('id', $shipment->order_id)->first();
                $this->satria->notifyUser($eventId, $shipment->id, $order->customer_id,
                    'BUYER', 'OUT_FOR_DELIVERY',
                    "Paket {$shipment->awb} sedang diantar. Pastikan penerima dapat dihubungi.");
            }

            return DB::table('delivery_runs')->where('id', $id)->first();
        });

        return response()->json(['data' => $this->satria->runPayload($run)]);
    }

    public function deliveryResult(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'COURIER');
        $input = $request->validate([
            'result' => ['required', Rule::in(['DELIVERED', 'FAILED'])],
            'recipient_name' => ['required_if:result,DELIVERED', 'nullable', 'string', 'max:160'],
            'photo' => ['required_if:result,DELIVERED', 'nullable', 'image', 'max:5120'],
            'captured_at' => ['required_with:photo', 'nullable', 'date'],
            'failure_reason' => ['required_if:result,FAILED', 'nullable', Rule::in([
                'PENERIMA_TIDAK_ADA', 'ALAMAT_TIDAK_DITEMUKAN', 'PENERIMA_MENOLAK',
                'AKSES_TERHALANG', 'LAINNYA',
            ])],
            'notes' => ['nullable', 'string', 'max:1000'],
            'attempted_at' => ['nullable', 'date'],
        ]);
        if ($request->hasFile('photo')) {
            $capturedAt = Carbon::parse($input['captured_at']);
            abort_if($capturedAt->lt(now()->subMinutes(5)) || $capturedAt->gt(now()->addSeconds(30)),
                422, 'Foto harus diambil dari kamera dalam lima menit terakhir.');
        }
        $photoRef = $request->hasFile('photo')
            ? $request->file('photo')->store('proofs/delivery', 'local') : null;
        abort_if($photoRef === false, 422, 'Foto hasil antar gagal disimpan.');
        try {
            $attempt = DB::transaction(function () use ($request, $id, $input, $photoRef): object {
                $row = DB::table('run_shipments')->where('id', $id)->lockForUpdate()->first();
                abort_if($row === null, 404);
                $run = DB::table('delivery_runs')->where('id', $row->run_id)->lockForUpdate()->first();
                abort_unless($run->courier_user_id === $request->user()->id, 403);
                $existing = DB::table('delivery_attempts')->where('run_shipment_id', $row->id)->first();
                if ($existing !== null) {
                    abort_unless($existing->result === $input['result'], 409, 'Hasil sudah dicatat berbeda.');

                    return $existing;
                }
                abort_unless($run->status === 'OUT_FOR_DELIVERY' && $row->status === 'HANDED_OVER',
                    409, 'Paket belum dalam perjalanan aktif.');
                $shipment = DB::table('shipments')->where('id', $row->shipment_id)->lockForUpdate()->first();
                abort_unless($shipment->status === 'OUT_FOR_DELIVERY' &&
                    $shipment->current_courier_id === $request->user()->id, 409);
                $attemptNo = (int) DB::table('delivery_attempts')
                    ->where('shipment_id', $shipment->id)->max('attempt_no') + 1;
                $attemptId = DB::table('delivery_attempts')->insertGetId([
                    'run_shipment_id' => $row->id, 'shipment_id' => $shipment->id,
                    'attempt_no' => $attemptNo, 'result' => $input['result'],
                    'failure_reason' => $input['result'] === 'FAILED' ? $input['failure_reason'] : null,
                    'notes' => $input['notes'] ?? null,
                    'recipient_name' => $input['result'] === 'DELIVERED' ? $input['recipient_name'] : null,
                    'delivery_photo_ref' => $photoRef,
                    'attempted_at' => $input['attempted_at'] ?? now(),
                ]);
                $success = $input['result'] === 'DELIVERED';
                DB::table('run_shipments')->where('id', $row->id)->update([
                    'status' => $success ? 'DELIVERED' : 'FAILED',
                ]);
                DB::table('shipments')->where('id', $shipment->id)->update([
                    'status' => $success ? 'DELIVERED' : 'DELIVERY_FAILED',
                    'custody_type' => $success ? 'RECIPIENT' : 'COURIER',
                    'current_courier_id' => $success ? null : $request->user()->id,
                    'delivered_at' => $success ? now() : null,
                    'updated_at' => now(),
                ]);
                if (! $success) {
                    DB::table('shipment_issues')->insert([
                        'shipment_id' => $shipment->id,
                        'delivery_attempt_id' => $attemptId,
                        'status' => 'OPEN', 'created_at' => now(),
                    ]);
                }
                $remaining = DB::table('run_shipments')->where('run_id', $run->id)
                    ->whereIn('status', ['ASSIGNED', 'HANDED_OVER'])->exists();
                if (! $remaining) {
                    DB::table('delivery_runs')->where('id', $run->id)->update(['status' => 'COMPLETED']);
                }
                $eventType = $success ? 'DELIVERED' : 'DELIVERY_FAILED';
                $eventId = $this->satria->event($shipment->id, $request->user()->id,
                    $eventType, $eventType,
                    ['attempt_no' => $attemptNo, 'failure_reason' => $success ? null : $input['failure_reason'],
                        'photo_captured_at' => $input['captured_at'] ?? null]);
                $order = DB::table('orders')->where('id', $shipment->order_id)->first();
                $reasonLabel = [
                    'PENERIMA_TIDAK_ADA' => 'penerima tidak ada di lokasi',
                    'ALAMAT_TIDAK_DITEMUKAN' => 'alamat belum ditemukan',
                    'PENERIMA_MENOLAK' => 'penerima menolak paket',
                    'AKSES_TERHALANG' => 'akses ke alamat terhalang',
                    'LAINNYA' => 'kendala lain di lokasi',
                ];
                $message = $success
                    ? "Paket {$shipment->awb} berhasil diantar. Terima kasih."
                    : "Pengantaran paket {$shipment->awb} belum berhasil karena {$reasonLabel[$input['failure_reason']]}. Petugas akan mengatur langkah berikutnya.";
                $this->satria->notifyUser($eventId, $shipment->id, $order->customer_id,
                    'BUYER', $eventType, $message);
                if (! $success) {
                    $this->satria->notifyRoleAtHub($eventId, $shipment->id, 'OPS_ADMIN', null,
                        'DELIVERY_FAILED', "Resi {$shipment->awb} gagal kirim. Alasan: {$input['failure_reason']}.");
                    $this->satria->notifyRoleAtHub($eventId, $shipment->id, 'HUB_OPERATOR', $run->hub_id,
                        'DELIVERY_FAILED', "Resi {$shipment->awb} gagal kirim. Tunggu scan balik kurir.");
                }

                return DB::table('delivery_attempts')->where('id', $attemptId)->first();
            });
        } catch (\Throwable $exception) {
            if ($photoRef !== null) {
                Storage::disk('local')->delete($photoRef);
            }
            throw $exception;
        }
        if ($attempt->delivery_photo_ref !== $photoRef && $photoRef !== null) {
            Storage::disk('local')->delete($photoRef);
        }

        return response()->json(['data' => $attempt]);
    }
}
