<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class SatriaFlowTest extends TestCase
{
    use DatabaseMigrations;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--force' => true]);
        Storage::fake('local');
    }

    public function test_checkout_has_no_awb_until_admin_approves_once(): void
    {
        $buyer = User::where('email', 'buyer@satria.test')->firstOrFail();
        $admin = User::where('email', 'ops@satria.test')->firstOrFail();
        $productId = DB::table('products')->where('sku', 'BAJU-001')->value('id');
        $checkout = $this->actingAs($buyer)->postJson('/api/v1/orders', [
            'checkout_key' => (string) Str::uuid(),
            'items' => [['product_id' => $productId, 'quantity' => 1]],
            'recipient' => [
                'name' => 'Pembeli Demo', 'phone' => '+620000000001',
                'address' => 'Cakung, Jakarta Timur', 'postcode' => '13910',
            ],
        ])->assertCreated()->assertJsonPath('data.status', 'PENDING_APPROVAL')
            ->assertJsonPath('data.awb', null);
        $orderId = $checkout->json('data.id');
        $this->actingAs($buyer)->postJson("/api/v1/admin/orders/{$orderId}/approve", [])
            ->assertForbidden();

        $first = $this->actingAs($admin)->postJson("/api/v1/admin/orders/{$orderId}/approve", [
            'pickup_ready' => true,
        ])->assertOk()->assertJsonPath('data.status', 'APPROVED');
        $awb = $first->json('data.awb');
        $this->assertNotEmpty($awb);
        $second = $this->actingAs($admin)->postJson("/api/v1/admin/orders/{$orderId}/approve", [])
            ->assertOk();
        $this->assertSame($awb, $second->json('data.awb'));
        $this->assertSame(1, DB::table('shipments')->where('order_id', $orderId)->count());
        $this->actingAs($buyer)->getJson("/api/v1/me/orders/{$orderId}")
            ->assertOk()->assertJsonPath('data.awb', $awb)
            ->assertJsonPath('data.tracking_url', 'http://localhost:5174/#tracking?awb='.$awb);
    }

    public function test_failed_delivery_is_returned_and_retried_on_same_awb_with_photos(): void
    {
        $admin = User::where('email', 'ops@satria.test')->firstOrFail();
        $pickupCourier = User::where('email', 'pickup@satria.test')->firstOrFail();
        $hubOperator = User::where('email', 'hub.jt@satria.test')->firstOrFail();
        $otherHubOperator = User::where('email', 'hub.js@satria.test')->firstOrFail();
        $deliveryCourier = User::where('email', 'courier.cakung@satria.test')->firstOrFail();
        $otherZoneCourier = User::where('email', 'courier.kelapa@satria.test')->firstOrFail();
        $buyer = User::where('email', 'buyer@satria.test')->firstOrFail();
        $shipment = DB::table('shipments')->where('awb', 'AWB-SEED-20261013-001')->first();
        $this->assertNotNull($shipment);
        $task = DB::table('pickup_tasks')->where('shipment_id', $shipment->id)->first();
        $hubId = $shipment->delivery_hub_id;
        $zoneId = $shipment->delivery_zone_id;

        $this->actingAs($admin)->postJson("/api/v1/admin/pickup-tasks/{$task->id}/assign", [
            'courier_user_id' => $deliveryCourier->id,
        ])->assertUnprocessable();

        $assignment = $this->actingAs($admin)->postJson("/api/v1/admin/pickup-tasks/{$task->id}/assign", [
            'courier_user_id' => $pickupCourier->id,
        ])->assertCreated()->json('data');
        $this->actingAs($pickupCourier)->postJson("/api/v1/courier/pickup-assignments/{$assignment['id']}/accept")
            ->assertOk();
        $this->actingAs($pickupCourier)->post("/api/v1/courier/pickup-assignments/{$assignment['id']}/complete", [
            'awb' => $shipment->awb,
            'photo' => UploadedFile::fake()->image('pickup.jpg'),
        ], ['Accept' => 'application/json'])->assertOk();
        $this->assertNotNull(DB::table('pickup_assignments')->where('id', $assignment['id'])->value('pickup_photo_ref'));
        $this->actingAs($buyer)->getJson("/api/v1/shipments/{$shipment->id}/pickup-photo")
            ->assertForbidden();
        $this->actingAs($pickupCourier)->get("/api/v1/shipments/{$shipment->id}/pickup-photo")
            ->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        $this->actingAs($hubOperator)->get("/api/v1/shipments/{$shipment->id}/pickup-photo")
            ->assertOk();

        $this->actingAs($otherHubOperator)->postJson("/api/v1/hubs/{$hubId}/scan-in", [
            'awb' => $shipment->awb,
        ])->assertForbidden();
        $this->actingAs($hubOperator)->postJson("/api/v1/hubs/{$hubId}/scan-in", ['awb' => $shipment->awb])
            ->assertOk()->assertJsonPath('data.status', 'READY_FOR_LAST_MILE');
        $this->actingAs($hubOperator)->postJson("/api/v1/hubs/{$hubId}/delivery-runs", [
            'zone_id' => $zoneId, 'courier_user_id' => $otherZoneCourier->id,
            'shipment_ids' => [$shipment->id], 'service_date' => today()->toDateString(),
        ])->assertUnprocessable();
        $run = $this->actingAs($hubOperator)->postJson("/api/v1/hubs/{$hubId}/delivery-runs", [
            'zone_id' => $zoneId, 'courier_user_id' => $deliveryCourier->id,
            'shipment_ids' => [$shipment->id], 'service_date' => today()->toDateString(),
        ])->assertCreated()->json('data');
        $this->actingAs($deliveryCourier)->postJson("/api/v1/courier/delivery-runs/{$run['id']}/accept")
            ->assertOk();
        $this->actingAs($hubOperator)->postJson("/api/v1/hubs/{$hubId}/handover", [
            'run_id' => $run['id'], 'awbs' => [$shipment->awb],
        ])->assertOk();
        $this->actingAs($deliveryCourier)->postJson("/api/v1/courier/delivery-runs/{$run['id']}/start")
            ->assertOk();
        $firstRunShipmentId = DB::table('run_shipments')->where('run_id', $run['id'])->value('id');
        $this->actingAs($deliveryCourier)->postJson("/api/v1/courier/run-shipments/{$firstRunShipmentId}/result", [
            'result' => 'FAILED', 'failure_reason' => 'PENERIMA_TIDAK_ADA',
        ])->assertOk()->assertJsonPath('data.attempt_no', 1);
        $this->actingAs($hubOperator)->postJson("/api/v1/hubs/{$hubId}/return-scan", [
            'awb' => $shipment->awb,
        ])->assertOk()->assertJsonPath('data.status', 'AT_HUB_AWAITING_DECISION');
        $issueId = DB::table('shipment_issues')->where('shipment_id', $shipment->id)->value('id');
        $retryAt = now()->addDay();
        $this->actingAs($admin)->postJson("/api/v1/admin/issues/{$issueId}/decision", [
            'decision' => 'RESCHEDULE', 'scheduled_redelivery_at' => $retryAt->toIso8601String(),
        ])->assertOk();
        $this->travelTo($retryAt->copy()->addMinute());

        $retry = $this->actingAs($hubOperator)->postJson("/api/v1/hubs/{$hubId}/delivery-runs", [
            'zone_id' => $zoneId, 'courier_user_id' => $deliveryCourier->id,
            'shipment_ids' => [$shipment->id], 'service_date' => today()->toDateString(),
        ])->assertCreated()->json('data');
        $this->actingAs($deliveryCourier)->postJson("/api/v1/courier/delivery-runs/{$retry['id']}/accept")
            ->assertOk();
        $this->actingAs($hubOperator)->postJson("/api/v1/hubs/{$hubId}/handover", [
            'run_id' => $retry['id'], 'awbs' => [$shipment->awb],
        ])->assertOk();
        $this->actingAs($deliveryCourier)->postJson("/api/v1/courier/delivery-runs/{$retry['id']}/start")
            ->assertOk();
        $secondRunShipmentId = DB::table('run_shipments')->where('run_id', $retry['id'])->value('id');
        $this->actingAs($deliveryCourier)->post("/api/v1/courier/run-shipments/{$secondRunShipmentId}/result", [
            'result' => 'DELIVERED', 'recipient_name' => 'Pembeli Demo',
            'photo' => UploadedFile::fake()->image('delivered.jpg'),
        ], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('data.attempt_no', 2);

        $this->assertSame(2, DB::table('delivery_attempts')->where('shipment_id', $shipment->id)->count());
        $this->assertSame($shipment->awb, DB::table('shipments')->where('id', $shipment->id)->value('awb'));
        $this->actingAs($buyer)->getJson("/api/v1/me/orders/{$shipment->order_id}/delivery-photo")
            ->assertOk();
        $this->getJson("/api/v1/tracking/{$shipment->awb}")
            ->assertOk()->assertDontSee($buyer->phone);
    }

    public function test_notification_outbox_requires_service_token_and_recovers_stale_claim(): void
    {
        Http::fake();
        config(['satria.n8n_webhook_url' => 'https://n8n.example.invalid/webhook']);
        $admin = User::where('email', 'ops@satria.test')->firstOrFail();
        $orderId = DB::table('orders')->where('order_no', 'ORD-SEED-PENDING-001')->value('id');
        $this->actingAs($admin)->postJson("/api/v1/admin/orders/{$orderId}/approve", [])
            ->assertOk();
        $notification = DB::table('notifications')->where('template_key', 'AWB_GENERATED')->first();
        $this->assertNotNull($notification);
        $this->assertSame('QUEUED', $notification->status);

        $this->getJson('/api/v1/internal/notifications/pending')->assertForbidden();
        $this->withToken((string) config('satria.internal_token'))
            ->getJson('/api/v1/internal/notifications/pending')
            ->assertOk()->assertJsonPath('notifications.0.id', $notification->id);
        $this->postJson("/api/v1/internal/notifications/{$notification->id}/claim")
            ->assertOk()->assertJsonPath('claimed', true)
            ->assertJsonPath('notification.delivery_mode', 'MOCK');
        DB::table('notifications')->where('id', $notification->id)
            ->update(['updated_at' => now()->subMinutes(6)]);
        $this->getJson('/api/v1/internal/notifications/pending')
            ->assertOk()->assertJsonPath('notifications.0.id', $notification->id);
        $this->postJson("/api/v1/internal/notifications/{$notification->id}/claim")
            ->assertOk()->assertJsonPath('claimed', true);
        $this->postJson("/api/v1/internal/notifications/{$notification->id}/result", [
            'status' => 'SIMULATED',
        ])->assertOk()->assertJsonPath('data.status', 'SIMULATED');
        $this->postJson("/api/v1/internal/notifications/{$notification->id}/result", [
            'status' => 'SIMULATED',
        ])->assertOk();
        $this->assertSame(2, DB::table('notifications')->where('id', $notification->id)->value('attempts'));
    }
}
