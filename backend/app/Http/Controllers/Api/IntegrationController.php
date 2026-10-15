<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\SatriaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class IntegrationController extends Controller
{
    public function __construct(private readonly SatriaService $satria) {}

    public function pendingNotifications(): JsonResponse
    {
        DB::table('notifications')->where('status', 'SENDING')
            ->where('updated_at', '<', now()->subMinutes(5))
            ->where('attempts', '<', 3)
            ->update(['status' => 'QUEUED', 'last_error' => 'Dispatch timed out; retry queued.', 'updated_at' => now()]);
        DB::table('notifications')->where('status', 'SENDING')
            ->where('updated_at', '<', now()->subMinutes(5))
            ->where('attempts', '>=', 3)
            ->update(['status' => 'FAILED', 'last_error' => 'Dispatch timed out after retry limit.', 'updated_at' => now()]);
        $rows = DB::table('notifications')->whereIn('status', ['QUEUED', 'FAILED'])
            ->where(function ($query): void {
                $query->where(function ($buyer): void {
                    $buyer->where('logical_recipient', 'BUYER')
                        ->whereIn('template_key', ['AWB_GENERATED', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'REDELIVERY_SCHEDULED', 'DELIVERED']);
                })->orWhere(function ($courier): void {
                    $courier->where('logical_recipient', 'COURIER')
                        ->whereIn('template_key', ['DELIVERY_ASSIGNED', 'ASSIGNMENT_REMINDER']);
                })->orWhere(function ($hub): void {
                    $hub->where('logical_recipient', 'HUB_OPERATOR')
                        ->whereIn('template_key', ['DELIVERY_RUN_REJECTED', 'DELIVERY_ASSIGNMENT_REJECTED', 'DELIVERY_FAILED', 'REDELIVERY_DECISION_REQUIRED', 'TASK_UNRESPONDED', 'DAILY_REPORT']);
                });
            })
            ->where('attempts', '<', 3)
            ->orderBy('created_at')->limit(100)->get(['id']);

        return response()->json(['notifications' => $rows]);
    }

    public function confirmPairing(Request $request): JsonResponse
    {
        $input = $request->validate([
            'code' => ['required', 'regex:/^SATRIA-[A-Z0-9]{8}$/i'],
            'peer_id' => ['required', 'integer'],
            'username' => ['nullable', 'string', 'max:32'],
        ]);
        $codeHash = hash('sha256', strtoupper($input['code']));
        $link = DB::transaction(function () use ($input, $codeHash): object {
            $pairing = DB::table('telegram_pairing_requests')->where('code_hash', $codeHash)
                ->lockForUpdate()->first();
            abort_if($pairing === null || $pairing->consumed_at !== null ||
                now()->greaterThan($pairing->expires_at), 422, 'Kode pairing tidak valid atau kedaluwarsa.');
            $other = DB::table('telegram_links')->where('peer_id', $input['peer_id'])
                ->where('user_id', '!=', $pairing->user_id)->exists();
            abort_if($other, 409, 'Akun Telegram sudah pernah dipasangkan ke akun lain.');
            DB::table('telegram_pairing_requests')->where('id', $pairing->id)
                ->update(['consumed_at' => now()]);
            DB::table('telegram_links')->updateOrInsert(
                ['user_id' => $pairing->user_id],
                [
                    'peer_id' => $input['peer_id'],
                    'username' => $input['username'] ?? null,
                    'verified_at' => now(), 'consented_at' => now(),
                    'revoked_at' => null, 'updated_at' => now(),
                ]
            );

            return DB::table('telegram_links')->where('user_id', $pairing->user_id)->first();
        });

        return response()->json(['data' => [
            'user_id' => $link->user_id, 'linked' => true,
        ]]);
    }

    public function claimNotification(int $id): JsonResponse
    {
        $claim = DB::transaction(function () use ($id): array {
            $notification = DB::table('notifications')->where('id', $id)->lockForUpdate()->first();
            abort_if($notification === null, 404);
            if (! $this->satria->telegramTemplateAllowed($notification->logical_recipient, $notification->template_key)) {
                DB::table('notifications')->where('id', $id)->update([
                    'status' => 'FAILED', 'attempts' => 3,
                    'last_error' => 'Template not enabled for Telegram dispatch.', 'updated_at' => now(),
                ]);

                return ['claimed' => false];
            }
            if (! in_array($notification->status, ['QUEUED', 'FAILED'], true) || $notification->attempts >= 3) {
                return ['claimed' => false];
            }
            $target = DB::table('notification_targets')->where('id', $notification->target_id)->first();
            if ($target === null || ! $target->active || $target->channel !== 'TELEGRAM' ||
                ($target->user_id !== null && ! DB::table('users')->where('id', $target->user_id)
                    ->where('active', true)->exists())) {
                DB::table('notifications')->where('id', $id)->update([
                    'status' => 'FAILED', 'attempts' => 3,
                    'last_error' => 'Target not active or unsupported.',
                    'updated_at' => now(),
                ]);

                return ['claimed' => false];
            }
            $deliveryMode = $notification->delivery_mode;
            if ($deliveryMode === 'LIVE' && ! $this->satria->telegramLiveAllowed((int) $target->user_id)) {
                $deliveryMode = 'MOCK';
                DB::table('notifications')->where('id', $id)->update(['delivery_mode' => 'MOCK']);
            }
            $peerId = null;
            $phone = null;
            if ($deliveryMode === 'LIVE') {
                $link = DB::table('telegram_links')->where('user_id', $target->user_id)
                    ->whereNull('revoked_at')->first();
                $peerId = $link ? (string) $link->peer_id : null;
                if ($peerId === null) {
                    $storedPhone = (string) DB::table('users')->where('id', $target->user_id)->value('phone');
                    $digits = preg_replace('/\D/', '', $storedPhone);
                    $phone = str_starts_with($digits, '0') ? '62'.substr($digits, 1) : $digits;
                    if (preg_match('/^628[0-9]{8,11}$/', $phone) !== 1) {
                        DB::table('notifications')->where('id', $id)->update([
                            'status' => 'FAILED', 'attempts' => 3,
                            'last_error' => 'Nomor telepon penerima belum valid untuk Telegram.',
                            'updated_at' => now(),
                        ]);

                        return ['claimed' => false];
                    }
                }
            }
            DB::table('notifications')->where('id', $id)->update([
                'status' => 'SENDING', 'attempts' => $notification->attempts + 1,
                'last_error' => null, 'updated_at' => now(),
            ]);

            return ['claimed' => true, 'notification' => [
                'id' => $notification->id,
                'delivery_mode' => $deliveryMode,
                'channel' => $notification->channel,
                'message' => $notification->message_text,
                'action_url' => $notification->action_url,
                'peer_id' => $peerId,
                'phone' => $phone,
                'sender_profile' => $notification->template_key === 'OUT_FOR_DELIVERY' ? 'COURIER' : 'OPS_ADMIN',
            ]];
        });

        return response()->json($claim);
    }

    public function notificationResult(Request $request, int $id): JsonResponse
    {
        $input = $request->validate([
            'status' => ['required', Rule::in(['SENT', 'SIMULATED', 'FAILED'])],
            'provider_message_id' => ['nullable', 'string', 'max:255'],
            'sent_at' => ['nullable', 'date'],
            'error' => ['nullable', 'string', 'max:2000'],
            'destination' => ['nullable', 'string', 'max:255'],
        ]);
        $notification = DB::transaction(function () use ($id, $input): object {
            $notification = DB::table('notifications')->where('id', $id)->lockForUpdate()->first();
            abort_if($notification === null, 404);
            if ($notification->status === $input['status']) {
                return $notification;
            }
            abort_unless($notification->status === 'SENDING', 409, 'Notifikasi tidak sedang dikirim.');
            if ($input['status'] === 'SENT') {
                abort_unless($notification->delivery_mode === 'LIVE' &&
                    ! empty($input['provider_message_id']) && ! empty($input['sent_at']),
                    422, 'Bukti provider diperlukan untuk status SENT.');
            }
            if ($input['status'] === 'SIMULATED') {
                abort_unless($notification->delivery_mode === 'MOCK', 422);
            }
            DB::table('notifications')->where('id', $id)->update([
                'status' => $input['status'],
                'provider_message_id' => $input['status'] === 'SENT' ? $input['provider_message_id'] : null,
                'sent_at' => $input['status'] === 'SENT' ? $input['sent_at'] : null,
                'actual_destination' => $input['destination'] ?? null,
                'last_error' => $input['status'] === 'FAILED' ? ($input['error'] ?? 'Adapter failed.') : null,
                'updated_at' => now(),
            ]);

            return DB::table('notifications')->where('id', $id)->first();
        });

        return response()->json(['data' => $notification]);
    }

    public function overdueTasks(): JsonResponse
    {
        $cutoff = now()->subMinutes(15);
        $tasks = [];
        foreach (DB::table('pickup_assignments')->where('status', 'PENDING_ACCEPT')
            ->where('assigned_at', '<', $cutoff)->get(['id']) as $row) {
            $tasks[] = ['id' => $row->id, 'type' => 'pickup_assignment'];
        }
        foreach (DB::table('delivery_runs')->where('status', 'PENDING_ACCEPT')
            ->where('assigned_at', '<', $cutoff)->get(['id']) as $row) {
            $tasks[] = ['id' => $row->id, 'type' => 'delivery_run'];
        }

        return response()->json(['tasks' => $tasks]);
    }

    public function remindTask(Request $request, int $id): JsonResponse
    {
        $input = $request->validate(['type' => ['required', Rule::in(['pickup_assignment', 'delivery_run'])]]);
        if ($input['type'] === 'pickup_assignment') {
            $assignment = DB::table('pickup_assignments')->where('id', $id)->first();
            abort_if($assignment === null, 404);
            abort_unless($assignment->status === 'PENDING_ACCEPT', 409);
            $shipmentIds = [DB::table('pickup_tasks')->where('id', $assignment->pickup_task_id)->value('shipment_id')];
            $courierId = $assignment->courier_user_id;
        } else {
            $run = DB::table('delivery_runs')->where('id', $id)->first();
            abort_if($run === null, 404);
            abort_unless($run->status === 'PENDING_ACCEPT', 409);
            $shipmentIds = DB::table('run_shipments')->where('run_id', $id)->orderBy('stop_order')
                ->limit(1)->pluck('shipment_id')->all();
            $courierId = $run->courier_user_id;
        }
        $sent = 0;
        foreach ($shipmentIds as $shipmentId) {
            $recent = DB::table('tracking_events')->where('shipment_id', $shipmentId)
                ->where('event_type', 'ASSIGNMENT_REMINDER')
                ->whereRaw("details::jsonb ->> 'task_id' = ?", [(string) $id])
                ->whereRaw("details::jsonb ->> 'type' = ?", [$input['type']])->exists();
            if ($recent) {
                continue;
            }
            $shipment = DB::table('shipments')->where('id', $shipmentId)->first();
            $eventId = $this->satria->event($shipmentId, null, 'ASSIGNMENT_REMINDER',
                $shipment->status, ['type' => $input['type'], 'task_id' => $id]);
            $this->satria->notifyUser($eventId, $shipmentId, $courierId, 'COURIER',
                'ASSIGNMENT_REMINDER', "Pengingat tugas {$input['type']} untuk resi {$shipment->awb}. Silakan jawab di aplikasi.");
            if ($input['type'] === 'delivery_run') {
                $this->satria->notifyRoleAtHub($eventId, $shipmentId, 'HUB_OPERATOR',
                    $run->hub_id, 'TASK_UNRESPONDED',
                    "Kurir belum menjawab tugas antar #{$id} untuk resi {$shipment->awb}. Tinjau penugasan.");
            }
            $sent++;
        }

        return response()->json(['data' => ['reminded' => $sent]]);
    }

    public function generateDailyReport(Request $request): JsonResponse
    {
        $date = $request->validate(['report_date' => ['nullable', 'date_format:Y-m-d']])['report_date']
            ?? today()->toDateString();

        $reports = $this->satria->generateDailyReports($date);
        foreach ($reports as $report) {
            $this->satria->notifyDailyReport($report);
        }

        return response()->json(['data' => $reports]);
    }
}
