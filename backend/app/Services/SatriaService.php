<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SatriaService
{
    public function deliveryCoverage(string $postcode, ?float $latitude = null, ?float $longitude = null): ?object
    {
        $candidates = DB::table('postal_coverages as coverage')
            ->join('hubs as hub', 'hub.id', '=', 'coverage.hub_id')
            ->join('service_zones as zone', 'zone.id', '=', 'coverage.zone_id')
            ->where('coverage.postcode', $postcode)
            ->where('coverage.purpose', 'DELIVERY')
            ->where('coverage.active', true)
            ->where('hub.active', true)
            ->where('zone.active', true)
            ->orderBy('coverage.id')
            ->get(['coverage.*', 'hub.name as hub_name', 'hub.latitude as hub_latitude',
                'hub.longitude as hub_longitude', 'zone.name as zone_name']);
        if ($candidates->isEmpty()) {
            return null;
        }

        $reference = $candidates->first(fn ($candidate) => $candidate->latitude !== null && $candidate->longitude !== null);
        $targetLatitude = $latitude ?? ($reference ? (float) $reference->latitude : null);
        $targetLongitude = $longitude ?? ($reference ? (float) $reference->longitude : null);
        if ($targetLatitude === null || $targetLongitude === null) {
            return $candidates->first();
        }

        return $candidates->sort(function ($left, $right) use ($targetLatitude, $targetLongitude): int {
            $distance = function (object $candidate) use ($targetLatitude, $targetLongitude): float {
                if ($candidate->hub_latitude === null || $candidate->hub_longitude === null) {
                    return INF;
                }
                $latitudeDelta = deg2rad((float) $candidate->hub_latitude - $targetLatitude);
                $longitudeDelta = deg2rad((float) $candidate->hub_longitude - $targetLongitude);
                $haversine = sin($latitudeDelta / 2) ** 2
                    + cos(deg2rad($targetLatitude)) * cos(deg2rad((float) $candidate->hub_latitude))
                    * sin($longitudeDelta / 2) ** 2;

                return 6371 * 2 * asin(min(1, sqrt($haversine)));
            };

            return ($distance($left) <=> $distance($right)) ?: ($left->id <=> $right->id);
        })->first();
    }

    public function hasRole(User $user, string $role, ?int $hubId = null): bool
    {
        if (! $user->active) {
            return false;
        }

        return DB::table('user_roles')->where('user_id', $user->id)->where('role', $role)
            ->when($hubId !== null, fn ($query) => $query->where('hub_id', $hubId))->exists();
    }

    public function requireRole(User $user, string $role, ?int $hubId = null): void
    {
        abort_unless($this->hasRole($user, $role, $hubId), 403, 'Akses role atau hub tidak sesuai.');
        abort_unless($user->active, 403, 'Akun tidak aktif.');
    }

    public function requireHub(User $user, int $hubId): void
    {
        abort_unless($user->active, 403, 'Akun tidak aktif.');
        abort_unless(
            $this->hasRole($user, 'OPS_ADMIN') || $this->hasRole($user, 'HUB_OPERATOR', $hubId),
            403,
            'Operator tidak memiliki akses ke hub ini.'
        );
    }

    public function event(
        int $shipmentId,
        ?int $actorId,
        string $eventType,
        ?string $statusAfter,
        array $details = [],
        ?int $hubId = null
    ): int {
        return DB::table('tracking_events')->insertGetId([
            'shipment_id' => $shipmentId,
            'actor_user_id' => $actorId,
            'hub_id' => $hubId,
            'event_type' => $eventType,
            'status_after' => $statusAfter,
            'details' => json_encode($details, JSON_THROW_ON_ERROR),
            'occurred_at' => now(),
        ]);
    }

    public function telegramLiveAllowed(int $userId): bool
    {
        $email = DB::table('users')->where('id', $userId)->value('email');

        return $email !== null && in_array(strtolower((string) $email),
            config('satria.telegram_live_recipient_emails', []), true);
    }

    public function telegramTemplateAllowed(string $recipient, string $template): bool
    {
        return match ($recipient) {
            'BUYER' => in_array($template, ['AWB_GENERATED', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'REDELIVERY_SCHEDULED', 'DELIVERED'], true),
            'COURIER' => in_array($template, ['DELIVERY_ASSIGNED', 'ASSIGNMENT_REMINDER'], true),
            'HUB_OPERATOR' => in_array($template, ['DELIVERY_RUN_REJECTED', 'DELIVERY_ASSIGNMENT_REJECTED', 'DELIVERY_FAILED', 'REDELIVERY_DECISION_REQUIRED', 'TASK_UNRESPONDED', 'DAILY_REPORT'], true),
            default => false,
        };
    }

    public function notifyUser(
        int $eventId,
        int $shipmentId,
        int $userId,
        string $logicalRecipient,
        string $template,
        string $message
    ): void {
        if (! $this->telegramTemplateAllowed($logicalRecipient, $template)) {
            return;
        }
        if (! DB::table('users')->where('id', $userId)->where('active', true)->exists()) {
            return;
        }
        DB::table('notification_targets')->insertOrIgnore([
            'user_id' => $userId, 'channel' => 'TELEGRAM', 'active' => true,
        ]);
        $targetId = DB::table('notification_targets')->where('user_id', $userId)
            ->where('channel', 'TELEGRAM')->value('id');

        $phone = (string) DB::table('users')->where('id', $userId)->value('phone');
        $liveLink = DB::table('telegram_links')->where('user_id', $userId)
            ->whereNull('revoked_at')->exists();
        $hasDestination = $liveLink || preg_match('/^(?:\+62|62|0)8[0-9]{8,11}$/', $phone) === 1;
        $mode = config('satria.telegram_mode') === 'LIVE' && $hasDestination && $this->telegramLiveAllowed($userId)
            ? 'LIVE' : 'MOCK';
        $webhookUrl = (string) config('satria.n8n_webhook_url', '');
        $status = $mode === 'MOCK' && $webhookUrl === '' ? 'SIMULATED' : 'QUEUED';
        $dedupeKey = hash('sha256', implode(':', [$eventId, $userId, $template]));
        $awb = DB::table('shipments')->where('id', $shipmentId)->value('awb');
        $baseUrl = rtrim((string) config('satria.ops_public_url'), '/');
        $eventDetails = json_decode((string) DB::table('tracking_events')->where('id', $eventId)->value('details'), true);
        $deliveryRunId = match ($template) {
            'DELIVERY_ASSIGNED' => (int) ($eventDetails['run_id'] ?? 0),
            'ASSIGNMENT_REMINDER' => ($eventDetails['type'] ?? null) === 'delivery_run'
                ? (int) ($eventDetails['task_id'] ?? 0) : 0,
            default => 0,
        };
        $courierActionUrl = $deliveryRunId > 0
            ? $baseUrl.'/courier-deliveries?run='.$deliveryRunId
            : (($eventDetails['type'] ?? null) === 'pickup_assignment'
                ? $baseUrl.'/courier-pickups' : $baseUrl.'/courier-deliveries');
        $actionUrl = match ($template) {
            'DELIVERY_ASSIGNED', 'ASSIGNMENT_REMINDER' => $courierActionUrl,
            'DELIVERY_RUN_REJECTED', 'DELIVERY_ASSIGNMENT_REJECTED', 'TASK_UNRESPONDED' => $baseUrl.'/hub-dispatch',
            'DELIVERY_FAILED', 'REDELIVERY_DECISION_REQUIRED' => $logicalRecipient === 'HUB_OPERATOR'
                ? $baseUrl.'/hub-issues' : $baseUrl.'/tracking/'.rawurlencode($awb).'?from='.rawurlencode($awb),
            'OUT_FOR_DELIVERY', 'REDELIVERY_SCHEDULED', 'DELIVERED' => $baseUrl.'/tracking/'.rawurlencode($awb).'?from='.rawurlencode($awb),
            default => $logicalRecipient === 'BUYER'
                ? $baseUrl.'/tracking/'.rawurlencode($awb).'?from='.rawurlencode($awb)
                : $baseUrl.'/',
        };
        $order = DB::table('shipments as shipment')->join('orders as order', 'order.id', '=', 'shipment.order_id')
            ->where('shipment.id', $shipmentId)->first(['order.recipient_name', 'order.destination_address_snapshot']);
        $message = match ($template) {
            'AWB_GENERATED' => "Halo, Kak {$order->recipient_name}! 👋🏻\n\nPesanan Anda sudah diproses dan nomor resinya telah terbit.\n\n📦 Nomor resi: {$awb}\n\nAnda dapat melihat perjalanan paket melalui tautan berikut:\n🔗 {$actionUrl}\n\nTerima kasih telah menggunakan Anteraja! 🙏🏻",
            'DELIVERY_ASSIGNED' => "📦 Penugasan Pengiriman Baru\n\nHalo, Satria!\n\nAda paket baru yang perlu kamu kirimkan. Silakan cek detail penugasan dan lakukan konfirmasi persetujuan pengiriman melalui tautan berikut:\n\n🔗 Lihat Detail Penugasan: {$actionUrl}\n\nTerima kasih atas kerja samanya. 🙌",
            'OUT_FOR_DELIVERY' => "Halo, Kak {$order->recipient_name} 👋🏻\n\nKami dari Anteraja akan melakukan proses delivery paket dengan nomor waybill {$awb} ke alamat Anda di {$order->destination_address_snapshot}.\nMohon ditunggu ya,\n\nTerima kasih! 🙏🏻😊",
            'DELIVERY_FAILED' => $logicalRecipient === 'BUYER'
                ? "Halo, Kak {$order->recipient_name}! 👋🏻\n\n{$message}\n\nKami akan memberi tahu langkah berikutnya. Lihat riwayat dan kendalanya: {$actionUrl}"
                : $message."\nTangani di: {$actionUrl}",
            'DELIVERED' => "Halo, Kak {$order->recipient_name}! Paket dengan resi {$awb} telah diantar. Silakan periksa paket dan lihat rincian pengiriman di {$actionUrl}. Terima kasih! 🙏🏻",
            'ASSIGNMENT_REMINDER' => "Halo, Satria! Tugas pengantaran untuk resi {$awb} masih menunggu jawaban Anda. Mohon terima atau tolak tugas melalui {$actionUrl}.",
            'REDELIVERY_SCHEDULED' => $this->rescheduleMessage($shipmentId, $awb, (string) $order->recipient_name, $actionUrl),
            default => $message."\nLihat: {$actionUrl}",
        };

        $inserted = DB::table('notifications')->insertOrIgnore([
            'tracking_event_id' => $eventId,
            'shipment_id' => $shipmentId,
            'target_id' => $targetId,
            'logical_recipient' => $logicalRecipient,
            'template_key' => $template,
            'message_text' => $message,
            'action_url' => $actionUrl,
            'channel' => 'TELEGRAM',
            'delivery_mode' => $mode,
            'status' => $status,
            'dedupe_key' => $dedupeKey,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        if ($inserted !== 0) {
            $notificationId = (int) DB::table('notifications')->where('dedupe_key', $dedupeKey)->value('id');
            $this->dispatchNotification($notificationId);
        }
    }

    public function notifyDailyReport(object $report): void
    {
        $hub = DB::table('hubs')->where('id', $report->hub_id)->first(['name']);
        if ($hub === null) {
            return;
        }
        $date = Carbon::parse($report->report_date)->format('d-m-Y');
        $actionUrl = rtrim((string) config('satria.ops_public_url'), '/').'/hub-reports';
        $message = "📊 Laporan Harian {$hub->name} — {$date}\n\n"
            ."Paket baru: {$report->shipments_created}\n"
            ."Paket terkirim: {$report->delivered}\n"
            ."Percobaan gagal: {$report->failed_attempts}\n"
            ."Berhasil setelah antar ulang: {$report->redelivered}\n"
            ."Permintaan retur: {$report->returned_requested}\n\n"
            ."Lihat rincian dan unduh XLSX: {$actionUrl}";
        $userIds = DB::table('user_roles')->where('role', 'HUB_OPERATOR')
            ->where('hub_id', $report->hub_id)->distinct()->pluck('user_id');

        foreach ($userIds as $userId) {
            $userId = (int) $userId;
            $user = DB::table('users')->where('id', $userId)->where('active', true)->first(['phone']);
            if ($user === null) {
                continue;
            }
            DB::table('notification_targets')->insertOrIgnore([
                'user_id' => $userId, 'channel' => 'TELEGRAM', 'active' => true,
            ]);
            $targetId = DB::table('notification_targets')->where('user_id', $userId)
                ->where('channel', 'TELEGRAM')->value('id');
            $linked = DB::table('telegram_links')->where('user_id', $userId)
                ->whereNull('revoked_at')->exists();
            $hasDestination = $linked || preg_match('/^(?:\+62|62|0)8[0-9]{8,11}$/', (string) $user->phone) === 1;
            $mode = config('satria.telegram_mode') === 'LIVE' && $hasDestination && $this->telegramLiveAllowed($userId)
                ? 'LIVE' : 'MOCK';
            $dedupeKey = hash('sha256', implode(':', ['DAILY_REPORT', $report->report_date, $report->hub_id, $userId]));
            $inserted = DB::table('notifications')->insertOrIgnore([
                'tracking_event_id' => null,
                'shipment_id' => null,
                'target_id' => $targetId,
                'logical_recipient' => 'HUB_OPERATOR',
                'template_key' => 'DAILY_REPORT',
                'message_text' => $message,
                'action_url' => $actionUrl,
                'channel' => 'TELEGRAM',
                'delivery_mode' => $mode,
                'status' => $mode === 'MOCK' && config('satria.n8n_webhook_url') === '' ? 'SIMULATED' : 'QUEUED',
                'dedupe_key' => $dedupeKey,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            if ($inserted !== 0) {
                $notificationId = (int) DB::table('notifications')->where('dedupe_key', $dedupeKey)->value('id');
                $this->dispatchNotification($notificationId);
            }
        }
    }

    private function dispatchNotification(int $notificationId): void
    {
        $webhookUrl = (string) config('satria.n8n_webhook_url', '');
        if ($webhookUrl === '') {
            return;
        }
        DB::afterCommit(function () use ($webhookUrl, $notificationId): void {
            try {
                Http::timeout(2)->withHeaders([
                    'X-Satria-Webhook-Token' => (string) config('satria.n8n_webhook_token', ''),
                ])->post($webhookUrl, ['notification_id' => $notificationId]);
            } catch (\Throwable $exception) {
                Log::warning('n8n webhook unavailable', ['id' => $notificationId, 'error' => $exception->getMessage()]);
            }
        });
    }

    private function rescheduleMessage(int $shipmentId, string $awb, string $recipientName, string $actionUrl): string
    {
        $issue = DB::table('shipment_issues as issue')
            ->join('delivery_attempts as attempt', 'attempt.id', '=', 'issue.delivery_attempt_id')
            ->where('issue.shipment_id', $shipmentId)->where('issue.decision', 'RESCHEDULE')
            ->orderByDesc('issue.id')->first(['issue.scheduled_redelivery_at', 'attempt.failure_reason']);
        $scheduled = $issue?->scheduled_redelivery_at
            ? Carbon::parse($issue->scheduled_redelivery_at)->timezone('Asia/Jakarta') : null;
        $date = $scheduled?->translatedFormat('l, d F Y') ?? 'Menunggu konfirmasi hub';
        $time = $scheduled?->format('H:i').' WIB';
        $reason = $issue?->failure_reason === 'PENERIMA_TIDAK_ADA'
            ? 'karena Kakak tidak berada di lokasi saat kurir tiba'
            : 'karena kendala pada percobaan sebelumnya';

        return "Halo, Kak {$recipientName}! 👋🏻😊\n\nKami dari Anteraja ingin menginformasikan bahwa pengiriman paket dengan nomor resi {$awb} belum berhasil dilakukan {$reason}.\n\nAgar paket dapat segera dikirimkan kembali, kami menyarankan penjadwalan ulang pengiriman pada:\n\n📅 Tanggal: {$date}\n🕒 Waktu: {$time}\n\nApakah jadwal tersebut sesuai untuk Kakak?\n\nSilakan klik tautan berikut untuk melihat detail pengiriman dan mengonfirmasi jadwal pengiriman ulang.\n\n🔗 {$actionUrl}\n\nTerima kasih atas pengertian dan kerja samanya, Kak! 🙏🏻💙\nAnteraja — #PastiBawaHepi";
    }

    public function notifyRoleAtHub(
        int $eventId,
        int $shipmentId,
        string $role,
        ?int $hubId,
        string $template,
        string $message
    ): void {
        $users = DB::table('user_roles')->where('role', $role)
            ->when($hubId !== null, fn ($query) => $query->where('hub_id', $hubId))
            ->pluck('user_id');
        foreach ($users as $userId) {
            $this->notifyUser($eventId, $shipmentId, (int) $userId, $role, $template, $message);
        }
    }

    public function orderPayload(object $order): array
    {
        $items = DB::table('order_items')->where('order_id', $order->id)
            ->orderBy('product_id')->get()->toArray();
        $shipment = DB::table('shipments')->where('order_id', $order->id)->first();

        return array_merge((array) $order, [
            'items' => $items,
            'awb' => $shipment?->awb,
            'shipment_status' => $shipment?->status,
            'tracking_url' => $shipment
                ? rtrim((string) config('satria.ops_public_url'), '/').'/tracking?awb='.rawurlencode($shipment->awb)
                : null,
        ]);
    }

    public function shipmentPayload(object $shipment): array
    {
        $order = DB::table('orders')->where('id', $shipment->order_id)->first();
        $zone = DB::table('service_zones')->where('id', $shipment->delivery_zone_id)->first();
        $coverage = DB::table('postal_coverages')
            ->where('postcode', $order->destination_postcode)
            ->where('purpose', 'DELIVERY')
            ->where('hub_id', $shipment->delivery_hub_id)
            ->where('zone_id', $shipment->delivery_zone_id)
            ->where('active', true)->first();
        $exact = $order->destination_latitude !== null && $order->destination_longitude !== null;
        $latitude = $exact ? $order->destination_latitude : $coverage?->latitude;
        $longitude = $exact ? $order->destination_longitude : $coverage?->longitude;

        return array_merge((array) $shipment, [
            'order' => $order,
            'delivery_zone' => $zone,
            'attempt_count' => DB::table('delivery_attempts')->where('shipment_id', $shipment->id)->count(),
            'destination_point' => $latitude !== null && $longitude !== null
                ? ['latitude' => (float) $latitude, 'longitude' => (float) $longitude,
                    'source' => $exact ? 'ADDRESS' : 'POSTCODE']
                : null,
        ]);
    }

    public function runPayload(object $run): array
    {
        $rows = DB::table('run_shipments')->where('run_id', $run->id)
            ->orderBy('stop_order')->get();
        $attempts = DB::table('delivery_attempts')->whereIn('run_shipment_id', $rows->pluck('id'))
            ->get(['run_shipment_id', 'attempt_no', 'result', 'failure_reason', 'notes',
                'recipient_name', 'attempted_at', 'delivery_photo_ref'])
            ->keyBy('run_shipment_id');
        $shipments = $rows->map(function (object $row) use ($attempts): array {
            $shipment = DB::table('shipments')->where('id', $row->shipment_id)->first();
            $attempt = $attempts->get($row->id);
            $shipmentData = $this->shipmentPayload($shipment);
            $shipmentData['last_attempt'] = DB::table('delivery_attempts')
                ->where('shipment_id', $row->shipment_id)->orderByDesc('attempt_no')
                ->first(['attempt_no', 'result', 'failure_reason', 'notes', 'attempted_at']);

            return array_merge((array) $row, [
                'shipment' => $shipmentData,
                'delivery_attempt' => $attempt ? [
                    'attempt_no' => $attempt->attempt_no,
                    'result' => $attempt->result,
                    'failure_reason' => $attempt->failure_reason,
                    'notes' => $attempt->notes,
                    'recipient_name' => $attempt->recipient_name,
                    'attempted_at' => $attempt->attempted_at,
                    'photo_available' => $attempt->delivery_photo_ref !== null,
                ] : null,
            ]);
        })->toArray();

        return array_merge((array) $run, [
            'hub' => DB::table('hubs')->where('id', $run->hub_id)
                ->first(['id', 'name', 'address', 'latitude', 'longitude']),
            'zone' => DB::table('service_zones')->where('id', $run->zone_id)->first(),
            'courier' => DB::table('users')->select('id', 'name', 'phone')
                ->where('id', $run->courier_user_id)->first(),
            'run_shipments' => $shipments,
            'shipments' => $shipments,
        ]);
    }

    public function uniqueAwb(): string
    {
        do {
            $awb = '11'.str_pad((string) random_int(0, 999999999999), 12, '0', STR_PAD_LEFT);
        } while (DB::table('shipments')->where('awb', $awb)->exists());

        return $awb;
    }

    public function generateDailyReports(string $date, ?int $hubId = null): array
    {
        $rows = [];
        foreach (DB::table('hubs')->when($hubId !== null, fn ($query) => $query->where('id', $hubId))->orderBy('id')->get() as $hub) {
            $created = DB::table('shipments')->where('delivery_hub_id', $hub->id)
                ->whereDate('created_at', $date)->count();
            $delivered = DB::table('shipments')->where('delivery_hub_id', $hub->id)
                ->whereDate('delivered_at', $date)->count();
            $failed = DB::table('delivery_attempts as a')->join('shipments as s', 's.id', '=', 'a.shipment_id')
                ->where('s.delivery_hub_id', $hub->id)->where('a.result', 'FAILED')
                ->whereDate('a.attempted_at', $date)->count();
            $redelivered = DB::table('delivery_attempts as a')->join('shipments as s', 's.id', '=', 'a.shipment_id')
                ->where('s.delivery_hub_id', $hub->id)->where('a.result', 'DELIVERED')
                ->where('a.attempt_no', '>', 1)->whereDate('a.attempted_at', $date)->count();
            $returns = DB::table('tracking_events as e')->join('shipments as s', 's.id', '=', 'e.shipment_id')
                ->leftJoin('tracking_event_time_corrections as correction', 'correction.tracking_event_id', '=', 'e.id')
                ->where('s.delivery_hub_id', $hub->id)->where('e.event_type', 'RETURN_REQUESTED')
                ->whereRaw('DATE(COALESCE(correction.corrected_occurred_at, e.occurred_at)) = ?', [$date])->count();
            DB::table('daily_reports')->updateOrInsert(
                ['report_date' => $date, 'hub_id' => $hub->id],
                [
                    'shipments_created' => $created, 'delivered' => $delivered,
                    'failed_attempts' => $failed, 'redelivered' => $redelivered,
                    'returned_requested' => $returns, 'generated_at' => now(),
                ]
            );
            $rows[] = DB::table('daily_reports')->where('report_date', $date)
                ->where('hub_id', $hub->id)->first();
        }

        return $rows;
    }
}
