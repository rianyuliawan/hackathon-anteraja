<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\SatriaService;
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
            ->where('a.courier_user_id', $request->user()->id)
            ->select('a.*', 's.awb', 's.id as shipment_id', 'o.origin_address_snapshot as seller_address',
                'l.contact_phone as seller_phone', 'l.contact_name as seller_name')
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

    public function rejectPickup(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'COURIER');
        $input = $request->validate(['reason' => ['required', 'string', 'max:500']]);
        $assignment = DB::transaction(function () use ($request, $id, $input): object {
            $assignment = DB::table('pickup_assignments')->where('id', $id)->lockForUpdate()->first();
            abort_if($assignment === null, 404);
            abort_unless($assignment->courier_user_id === $request->user()->id, 403);
            if ($assignment->status === 'REJECTED') {
                return $assignment;
            }
            abort_unless($assignment->status === 'PENDING_ACCEPT', 409, 'Tugas pickup sudah dijawab.');
            DB::table('pickup_assignments')->where('id', $id)->update([
                'status' => 'REJECTED', 'responded_at' => now(), 'reject_reason' => $input['reason'],
            ]);
            $task = DB::table('pickup_tasks')->where('id', $assignment->pickup_task_id)->first();
            DB::table('pickup_tasks')->where('id', $task->id)->update(['status' => 'READY_FOR_PICKUP']);
            DB::table('shipments')->where('id', $task->shipment_id)->update([
                'status' => 'READY_FOR_PICKUP', 'updated_at' => now(),
            ]);
            $eventId = $this->satria->event($task->shipment_id, $request->user()->id,
                'PICKUP_REJECTED', 'READY_FOR_PICKUP', ['reason' => $input['reason']]);
            $this->satria->notifyRoleAtHub($eventId, $task->shipment_id, 'OPS_ADMIN', null,
                'PICKUP_REJECTED', 'Kurir menolak pickup. Admin perlu assign ulang.');

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
            'picked_up_at' => ['nullable', 'date'],
        ]);
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
                $pickedAt = $input['picked_up_at'] ?? now();
                DB::table('pickup_assignments')->where('id', $id)->update([
                    'status' => 'COMPLETED', 'picked_up_at' => $pickedAt,
                    'pickup_photo_ref' => $photoRef,
                ]);
                DB::table('pickup_tasks')->where('id', $task->id)->update(['status' => 'PICKED_UP']);
                DB::table('shipments')->where('id', $shipment->id)->update([
                    'status' => 'PICKED_UP', 'custody_type' => 'COURIER',
                    'current_courier_id' => $request->user()->id, 'updated_at' => now(),
                ]);
                $eventId = $this->satria->event($shipment->id, $request->user()->id,
                    'PICKED_UP', 'PICKED_UP');
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
            abort_if(today()->toDateString() < $run->service_date, 409, 'Tanggal layanan run belum tiba.');
            $rows = DB::table('run_shipments')->where('run_id', $id)->get();
            abort_unless($rows->isNotEmpty() && $rows->every(fn ($row) => $row->status === 'HANDED_OVER'),
                409, 'Semua paket harus diserahterimakan dahulu.');
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
            'failure_reason' => ['required_if:result,FAILED', 'nullable', Rule::in([
                'PENERIMA_TIDAK_ADA', 'ALAMAT_TIDAK_DITEMUKAN', 'PENERIMA_MENOLAK',
                'AKSES_TERHALANG', 'LAINNYA',
            ])],
            'notes' => ['nullable', 'string', 'max:1000'],
            'attempted_at' => ['nullable', 'date'],
        ]);
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
                    ['attempt_no' => $attemptNo, 'failure_reason' => $success ? null : $input['failure_reason']]);
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
