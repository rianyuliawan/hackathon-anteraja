<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class SatriaService
{
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

    public function notifyUser(
        int $eventId,
        int $shipmentId,
        int $userId,
        string $logicalRecipient,
        string $template,
        string $message
    ): void {
        if (! DB::table('users')->where('id', $userId)->where('active', true)->exists()) {
            return;
        }
        DB::table('notification_targets')->insertOrIgnore([
            'user_id' => $userId, 'channel' => 'TELEGRAM', 'active' => true,
        ]);
        $targetId = DB::table('notification_targets')->where('user_id', $userId)
            ->where('channel', 'TELEGRAM')->value('id');

        $liveLink = DB::table('telegram_links')->where('user_id', $userId)
            ->whereNull('revoked_at')->exists();
        $mode = config('satria.telegram_mode') === 'LIVE' && $liveLink ? 'LIVE' : 'MOCK';
        $webhookUrl = (string) config('satria.n8n_webhook_url', '');
        $status = $mode === 'MOCK' && $webhookUrl === '' ? 'SIMULATED' : 'QUEUED';
        $dedupeKey = hash('sha256', implode(':', [$eventId, $userId, $template]));
        $awb = DB::table('shipments')->where('id', $shipmentId)->value('awb');
        $actionUrl = $logicalRecipient === 'BUYER'
            ? rtrim((string) config('satria.ops_public_url'), '/').'/?awb='.rawurlencode($awb)
            : rtrim((string) config('satria.ops_public_url'), '/').'/';

        $inserted = DB::table('notifications')->insertOrIgnore([
            'tracking_event_id' => $eventId,
            'shipment_id' => $shipmentId,
            'target_id' => $targetId,
            'logical_recipient' => $logicalRecipient,
            'template_key' => $template,
            'message_text' => $message."\nLihat: {$actionUrl}",
            'action_url' => $actionUrl,
            'channel' => 'TELEGRAM',
            'delivery_mode' => $mode,
            'status' => $status,
            'dedupe_key' => $dedupeKey,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        if ($inserted === 0 || $webhookUrl === '') {
            return;
        }

        $notificationId = (int) DB::table('notifications')->where('dedupe_key', $dedupeKey)->value('id');
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
                ? rtrim((string) config('satria.ops_public_url'), '/').'/#tracking?awb='.rawurlencode($shipment->awb)
                : null,
        ]);
    }

    public function shipmentPayload(object $shipment): array
    {
        $order = DB::table('orders')->where('id', $shipment->order_id)->first();
        $zone = DB::table('service_zones')->where('id', $shipment->delivery_zone_id)->first();

        return array_merge((array) $shipment, [
            'order' => $order,
            'delivery_zone' => $zone,
        ]);
    }

    public function runPayload(object $run): array
    {
        $rows = DB::table('run_shipments')->where('run_id', $run->id)
            ->orderBy('stop_order')->get();
        $shipments = $rows->map(function (object $row): array {
            $shipment = DB::table('shipments')->where('id', $row->shipment_id)->first();

            return array_merge((array) $row, [
                'shipment' => $this->shipmentPayload($shipment),
            ]);
        })->toArray();

        return array_merge((array) $run, [
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
            $awb = 'SAT'.now()->format('ymd').strtoupper(Str::random(9));
        } while (DB::table('shipments')->where('awb', $awb)->exists());

        return $awb;
    }

    public function generateDailyReports(string $date): array
    {
        $rows = [];
        foreach (DB::table('hubs')->orderBy('id')->get() as $hub) {
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
                ->where('s.delivery_hub_id', $hub->id)->where('e.event_type', 'RETURN_REQUESTED')
                ->whereDate('e.occurred_at', $date)->count();
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
