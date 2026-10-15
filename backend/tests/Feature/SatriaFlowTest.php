<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\SatriaService;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;
use ZipArchive;

class SatriaFlowTest extends TestCase
{
    use DatabaseMigrations;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--force' => true]);
        Storage::fake('local');
    }

    public function test_cakung_hackathon_accounts_and_reports_are_seeded_idempotently(): void
    {
        $hubId = DB::table('hubs')->where('code', 'HUB-JT')->value('id');
        $accounts = [
            'rianyuliawan@anteraja.id' => 'OPS_ADMIN',
            'rianyuliawan1@anteraja.id' => 'HUB_OPERATOR',
            'afrien@anteraja.id' => 'COURIER',
        ];
        foreach ($accounts as $email => $role) {
            $user = User::where('email', $email)->firstOrFail();
            $this->assertTrue(Hash::check('anteraja123', $user->password));
            $this->assertTrue(DB::table('user_roles')->where('user_id', $user->id)
                ->where('role', $role)->exists());
        }
        $afrien = User::where('email', 'afrien@anteraja.id')->firstOrFail();
        $this->assertSame($hubId, DB::table('courier_profiles')->where('user_id', $afrien->id)
            ->value('home_hub_id'));
        $this->assertTrue(DB::table('delivery_runs as run')
            ->join('run_shipments as item', 'item.run_id', '=', 'run.id')
            ->join('shipments as shipment', 'shipment.id', '=', 'item.shipment_id')
            ->where('shipment.awb', '11902600000306')
            ->where('run.courier_user_id', $afrien->id)
            ->where('run.status', 'PENDING_ACCEPT')->exists());
        $this->assertSame(4, DB::table('daily_reports')->where('hub_id', $hubId)->count());

        $users = DB::table('users')->count();
        $runs = DB::table('delivery_runs')->count();
        $this->artisan('db:seed', ['--class' => 'CakungHackathonSeeder', '--force' => true]);
        $this->assertSame($users, DB::table('users')->count());
        $this->assertSame($runs, DB::table('delivery_runs')->count());
        $this->assertSame(4, DB::table('daily_reports')->where('hub_id', $hubId)->count());
    }

    public function test_workspace_scopes_receive_separate_session_cookies(): void
    {
        $first = $this->withHeader('X-Workspace-Session', 'f8848ea1-77ac-4bde-853c-75ca4d0e21a1')
            ->getJson('/sanctum/csrf-cookie')->assertOk();
        $second = $this->withHeader('X-Workspace-Session', 'a77f0635-81d2-469e-9ba5-5987c582e71f')
            ->getJson('/sanctum/csrf-cookie')->assertOk();
        $firstCookie = collect($first->headers->getCookies())->first(fn ($cookie): bool => str_contains($cookie->getName(), 'session'));
        $secondCookie = collect($second->headers->getCookies())->first(fn ($cookie): bool => str_contains($cookie->getName(), 'session'));
        $this->assertNotNull($firstCookie);
        $this->assertNotNull($secondCookie);
        $this->assertNotSame($firstCookie->getName(), $secondCookie->getName());
        $this->assertNotSame($first->json('csrf_token'), $second->json('csrf_token'));
    }

    public function test_courier_can_search_and_open_only_assigned_parcels(): void
    {
        $courier = User::where('email', 'galih.pratama@anteraja.id')->firstOrFail();
        $buyer = User::where('email', 'siti.nurhaliza@anteraja.id')->firstOrFail();
        $assigned = DB::table('run_shipments as rs')
            ->join('delivery_runs as r', 'r.id', '=', 'rs.run_id')
            ->join('shipments as s', 's.id', '=', 'rs.shipment_id')
            ->where('r.courier_user_id', $courier->id)
            ->orderByDesc('r.assigned_at')->first(['s.id', 's.awb']);
        $this->assertNotNull($assigned);
        $query = substr($assigned->awb, -8);

        $this->actingAs($courier)->getJson('/api/v1/courier/shipments?query='.$query)
            ->assertOk()->assertJsonFragment(['awb' => $assigned->awb]);
        $this->actingAs($courier)->getJson('/api/v1/courier/shipments/'.$assigned->awb)
            ->assertOk()->assertJsonPath('data.shipment.awb', $assigned->awb)
            ->assertJsonStructure(['data' => ['assignments', 'attempts', 'pickup_photo_available']]);

        $unassigned = DB::table('shipments as s')->whereNotExists(function ($query) use ($courier): void {
            $query->selectRaw('1')->from('run_shipments as rs')
                ->join('delivery_runs as r', 'r.id', '=', 'rs.run_id')
                ->whereColumn('rs.shipment_id', 's.id')
                ->where('r.courier_user_id', $courier->id);
        })->value('s.awb');
        $this->assertNotNull($unassigned);
        $this->actingAs($courier)->getJson('/api/v1/courier/shipments/'.$unassigned)
            ->assertForbidden();
        $this->actingAs($buyer)->getJson('/api/v1/courier/shipments?query='.$query)
            ->assertForbidden();
        $this->actingAs($buyer)->getJson('/api/v1/courier/shipments/'.$assigned->awb)
            ->assertForbidden();
    }

    public function test_road_route_uses_local_osrm_geometry_and_restricts_roles(): void
    {
        config(['satria.osrm_url' => 'http://127.0.0.1:5000']);
        Http::fake(['http://127.0.0.1:5000/route/v1/driving/*' => Http::response([
            'code' => 'Ok',
            'routes' => [[
                'distance' => 4200,
                'duration' => 780,
                'geometry' => ['coordinates' => [[106.90, -6.20], [106.905, -6.203], [106.91, -6.21]]],
            ]],
        ])]);
        $points = [
            ['latitude' => -6.20, 'longitude' => 106.90],
            ['latitude' => -6.21, 'longitude' => 106.91],
        ];
        $buyer = User::where('email', 'siti.nurhaliza@anteraja.id')->firstOrFail();
        $courier = User::where('email', 'galih.pratama@anteraja.id')->firstOrFail();
        $this->actingAs($buyer)->postJson('/api/v1/routing/road-route', ['points' => $points])
            ->assertForbidden();
        $this->actingAs($courier)->postJson('/api/v1/routing/road-route', ['points' => $points])
            ->assertOk()->assertJsonPath('data.distance_km', 4.2)
            ->assertJsonPath('data.points.1.0', -6.203)
            ->assertJsonPath('data.points.1.1', 106.905);
        Http::assertSent(fn ($request): bool => str_starts_with($request->url(),
            'http://127.0.0.1:5000/route/v1/driving/106.9,-6.2;106.91,-6.21'));
    }

    public function test_legacy_demo_failures_have_full_pickup_and_run_history(): void
    {
        foreach (['11008260000407', '11008260000408'] as $awb) {
            $shipment = DB::table('shipments')->where('awb', $awb)->first();
            $pickup = DB::table('tracking_events')->where('shipment_id', $shipment->id)
                ->where('event_type', 'PICKED_UP')->value('occurred_at');
            $arrival = DB::table('tracking_events')->where('shipment_id', $shipment->id)
                ->where('event_type', 'ARRIVED_AT_DELIVERY_HUB')->value('occurred_at');
            $assigned = DB::table('tracking_events')->where('shipment_id', $shipment->id)
                ->where('event_type', 'DELIVERY_ASSIGNED')->value('occurred_at');
            $failed = DB::table('tracking_events')->where('shipment_id', $shipment->id)
                ->where('event_type', 'DELIVERY_FAILED')->value('occurred_at');
            $returned = DB::table('tracking_events')->where('shipment_id', $shipment->id)
                ->where('event_type', 'FAILED_PARCEL_RETURNED_TO_HUB')->value('occurred_at');
            $this->assertLessThan($arrival, $pickup);
            $this->assertLessThan($assigned, $arrival);
            $this->assertLessThan($failed, $assigned);
            $this->assertLessThan($returned, $failed);
            $this->assertSame('proofs/pickup/demo-pickup.jpg', DB::table('pickup_assignments as assignment')
                ->join('pickup_tasks as task', 'task.id', '=', 'assignment.pickup_task_id')
                ->where('task.shipment_id', $shipment->id)->value('assignment.pickup_photo_ref'));
        }
    }

    public function test_run_demo_data_has_pickup_hub_and_delivery_in_time_order(): void
    {
        $deliveryAreas = DB::table('postal_coverages')->where('purpose', 'DELIVERY')
            ->where('active', true)->count();
        $this->assertSame($deliveryAreas, DB::table('delivery_runs')->where('status', 'PENDING_ACCEPT')->count());
        $this->assertSame($deliveryAreas, DB::table('delivery_runs')->where('status', 'OUT_FOR_DELIVERY')->count());
        $this->assertSame($deliveryAreas + 2, DB::table('delivery_runs')->where('status', 'COMPLETED')->count());
        $this->assertGreaterThanOrEqual(100, DB::table('run_shipments')->count());

        $demoShipments = DB::table('shipments')->where('awb', 'like', '119026%')->get();
        $this->assertCount($deliveryAreas * 17, $demoShipments);
        foreach ($demoShipments as $shipment) {
            $pickup = DB::table('pickup_assignments as assignment')
                ->join('pickup_tasks as task', 'task.id', '=', 'assignment.pickup_task_id')
                ->where('task.shipment_id', $shipment->id)->where('assignment.status', 'COMPLETED')
                ->first(['assignment.assigned_at', 'assignment.picked_up_at', 'assignment.pickup_photo_ref']);
            $arrival = DB::table('tracking_events')->where('shipment_id', $shipment->id)
                ->where('event_type', 'ARRIVED_AT_DELIVERY_HUB')->value('occurred_at');
            $this->assertNotNull($pickup);
            $this->assertSame('proofs/pickup/demo-pickup.jpg', $pickup->pickup_photo_ref);
            $this->assertLessThan($pickup->picked_up_at, $pickup->assigned_at);
            $this->assertLessThan($arrival, $pickup->picked_up_at);
            foreach (DB::table('run_shipments as stop')
                ->join('delivery_runs as run', 'run.id', '=', 'stop.run_id')
                ->where('stop.shipment_id', $shipment->id)
                ->get(['run.assigned_at', 'run.hub_id', 'stop.id']) as $stop) {
                $this->assertLessThan($stop->assigned_at, $arrival);
                $this->assertSame($shipment->delivery_hub_id, $stop->hub_id);
                $attempt = DB::table('delivery_attempts')->where('run_shipment_id', $stop->id)->first();
                if ($attempt) {
                    $this->assertLessThan($attempt->attempted_at, $stop->assigned_at);
                }
            }
        }
    }

    public function test_daily_report_is_scoped_per_hub_and_downloads_valid_xlsx(): void
    {
        $hubId = DB::table('hubs')->where('code', 'HUB-JT')->value('id');
        $hubOperator = User::where('email', 'fajar.hidayat@anteraja.id')->firstOrFail();
        $otherOperator = User::where('email', 'rani.putri@anteraja.id')->firstOrFail();
        $admin = User::where('email', 'dimas.pratama@anteraja.id')->firstOrFail();
        $date = today()->toDateString();

        $this->actingAs($otherOperator)->getJson("/api/v1/hubs/{$hubId}/reports/daily?date={$date}")
            ->assertForbidden();
        $this->actingAs($otherOperator)->postJson("/api/v1/hubs/{$hubId}/reports/daily/generate", [
            'report_date' => $date,
        ])->assertForbidden();
        $this->actingAs($otherOperator)->get("/api/v1/hubs/{$hubId}/reports/daily.xlsx?date={$date}")
            ->assertForbidden();

        $this->actingAs($hubOperator)->postJson("/api/v1/hubs/{$hubId}/reports/daily/generate", [
            'report_date' => $date,
        ])->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($hubOperator)->getJson("/api/v1/hubs/{$hubId}/reports/daily?date={$date}")
            ->assertOk()->assertJsonPath('data.0.hub_id', $hubId);
        $download = $this->actingAs($hubOperator)
            ->get("/api/v1/hubs/{$hubId}/reports/daily.xlsx?date={$date}");
        $download->assertOk()->assertHeader(
            'content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        $this->assertStringContainsString('.xlsx', $download->headers->get('content-disposition'));
        $archive = new ZipArchive;
        $this->assertTrue($archive->open($download->baseResponse->getFile()->getPathname()) === true);
        $workbook = $archive->getFromName('xl/workbook.xml');
        $this->assertStringContainsString('Ringkasan', $workbook);
        $this->assertStringContainsString('Aktivitas', $workbook);
        $this->assertStringContainsString('Percobaan', $workbook);
        $this->assertNotFalse($archive->getFromName('xl/worksheets/sheet1.xml'));
        $this->assertNotFalse($archive->getFromName('xl/worksheets/sheet2.xml'));
        $this->assertNotFalse($archive->getFromName('xl/worksheets/sheet3.xml'));
        $archive->close();
        $issueId = DB::table('shipment_issues')->where('status', 'OPEN')->value('id');
        $this->actingAs($admin)->postJson("/api/v1/hubs/{$hubId}/issues/{$issueId}/decision", [
            'decision' => 'RETURN_TO_SELLER',
        ])->assertForbidden();
        $this->actingAs($admin)->getJson("/api/v1/admin/reports/daily?date={$date}")
            ->assertOk()->assertJsonPath('data.0.hub_id', $hubId);
    }

    public function test_registered_email_cannot_be_registered_again_regardless_of_letter_case(): void
    {
        $existingUsers = DB::table('users')->count();
        $payload = [
            'name' => 'Pembeli Baru',
            'email' => 'siti.nurhaliza@anteraja.id',
            'phone' => '081234567890',
            'default_address' => 'Jl. Melati No. 1, Jakarta',
            'default_postcode' => '13910',
            'password' => 'anteraja123',
            'password_confirmation' => 'anteraja123',
        ];

        $this->postJson('/register', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email'])
            ->assertJsonPath('errors.email.0', 'Email sudah terdaftar. Silakan masuk dengan akun tersebut.');

        DB::table('users')->where('email', $payload['email'])
            ->update(['email' => strtoupper($payload['email'])]);
        $this->postJson('/register', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email'])
            ->assertJsonPath('errors.email.0', 'Email sudah terdaftar. Silakan masuk dengan akun tersebut.');

        $this->assertSame($existingUsers, DB::table('users')->count());
    }

    public function test_new_buyer_can_receive_live_awb_without_manual_allowlist(): void
    {
        config([
            'satria.telegram_mode' => 'LIVE',
            'satria.n8n_webhook_url' => '',
            'satria.telegram_live_recipient_emails' => [],
        ]);
        $registration = $this->postJson('/register', [
            'name' => 'Pembeli Uji',
            'email' => 'pembeli.uji@example.com',
            'phone' => '0812 3456-7890',
            'telegram_consent' => true,
            'default_address' => 'Jl. Melati No. 1, Cakung, Jakarta Timur',
            'default_postcode' => '13910',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])->assertCreated()->assertJsonPath('data.user.telegram_opt_in', true);
        $buyer = User::findOrFail($registration->json('data.user.id'));
        $this->assertSame('081234567890', $buyer->phone);
        $this->assertTrue(app(SatriaService::class)->telegramLiveAllowed($buyer->id));

        $productId = DB::table('products')->where('sku', 'BAJU-001')->value('id');
        $orderId = $this->actingAs($buyer)->postJson('/api/v1/orders', [
            'checkout_key' => (string) Str::uuid(),
            'items' => [['product_id' => $productId, 'quantity' => 1]],
            'recipient' => [
                'name' => $buyer->name, 'phone' => $buyer->phone,
                'address' => $buyer->default_address, 'postcode' => $buyer->default_postcode,
            ],
        ])->assertCreated()->json('data.id');
        $admin = User::where('email', 'rianyuliawan@anteraja.id')->firstOrFail();
        $this->actingAs($admin)->postJson("/api/v1/admin/orders/{$orderId}/approve")
            ->assertOk();
        $notification = DB::table('notifications as notification')
            ->join('notification_targets as target', 'target.id', '=', 'notification.target_id')
            ->where('target.user_id', $buyer->id)
            ->where('notification.template_key', 'AWB_GENERATED')
            ->select('notification.*')->first();
        $this->assertNotNull($notification);
        $this->assertSame('LIVE', $notification->delivery_mode);
        $this->assertSame('QUEUED', $notification->status);
        $this->withToken((string) config('satria.internal_token'))
            ->postJson("/api/v1/internal/notifications/{$notification->id}/claim")
            ->assertOk()->assertJsonPath('notification.phone', '6281234567890');

        $this->actingAs($buyer)->patchJson('/api/v1/me', [
            'phone' => '081298765432',
        ])->assertOk()->assertJsonPath('data.user.telegram_opt_in', false);
        $this->assertFalse(app(SatriaService::class)->telegramLiveAllowed($buyer->id));
    }

    public function test_demo_fixture_is_ready_for_last_mile_with_shared_pickup_photo(): void
    {
        $admin = User::where('email', 'dimas.pratama@anteraja.id')->firstOrFail();
        $this->assertTrue(Hash::check('anteraja123', $admin->password));
        $this->assertSame(10, DB::table('hubs')->count());
        $this->assertSame(11, DB::table('courier_zones')->where('service_type', 'PICKUP')->distinct()->count('courier_user_id'));
        $this->assertSame(34, DB::table('courier_zones')->where('service_type', 'DELIVERY')->distinct()->count('courier_user_id'));
        foreach ([
            'rangga.firmansyah@anteraja.id' => 'DUREN_SAWIT',
            'febriansyah.putra@anteraja.id' => 'PONDOK_KELAPA',
            'yogi.mahendra@anteraja.id' => 'PONDOK_KOPI',
        ] as $email => $zoneCode) {
            $actual = DB::table('courier_zones as assignment')
                ->join('users as courier', 'courier.id', '=', 'assignment.courier_user_id')
                ->join('service_zones as zone', 'zone.id', '=', 'assignment.zone_id')
                ->where('courier.email', $email)->where('assignment.service_type', 'DELIVERY')
                ->value('zone.code');
            $this->assertSame($zoneCode, $actual);
        }
        $this->assertSame(3, DB::table('postal_coverages as coverage')
            ->join('hubs as hub', 'hub.id', '=', 'coverage.hub_id')
            ->where('hub.code', 'HUB-JTD')->where('coverage.purpose', 'DELIVERY')->count());
        $this->assertNotNull(DB::table('postal_coverages')->where('postcode', '13450')->value('latitude'));

        $shipment = DB::table('shipments')->where('awb', '11007182634956')->first();
        $this->assertNotNull($shipment);
        $this->assertSame('READY_FOR_LAST_MILE', $shipment->status);
        $photoRef = DB::table('pickup_assignments as a')
            ->join('pickup_tasks as t', 't.id', '=', 'a.pickup_task_id')
            ->where('t.shipment_id', $shipment->id)->value('a.pickup_photo_ref');
        $this->assertSame('proofs/pickup/demo-pickup.jpg', $photoRef);
        $this->actingAs($admin)->get("/api/v1/shipments/{$shipment->id}/pickup-photo")->assertOk();
        Storage::disk('local')->assertExists($photoRef);
    }

    public function test_tracking_shows_private_details_only_to_the_related_customer(): void
    {
        $customer = User::where('email', 'siti.nurhaliza@anteraja.id')->firstOrFail();
        $otherUser = User::where('email', 'dimas.pratama@anteraja.id')->firstOrFail();
        $awb = '11007182634956';

        $this->actingAs($otherUser)->getJson("/api/v1/tracking/{$awb}/preview")
            ->assertOk()
            ->assertJsonPath('data.awb', $awb)
            ->assertJsonPath('data.status', 'READY_FOR_LAST_MILE')
            ->assertJsonMissingPath('data.recipient_name');
        $this->actingAs($otherUser)->getJson('/api/v1/tracking/11000000000000/preview')
            ->assertNotFound();

        $this->actingAs($otherUser)->getJson("/api/v1/tracking/{$awb}")
            ->assertOk()
            ->assertJsonPath('data.is_customer', false)
            ->assertJsonPath('data.destination_address', null)
            ->assertJsonPath('data.recipient_name', null)
            ->assertJsonPath('data.proof_available', false)
            ->assertJsonPath('data.pickup_photo_available', false)
            ->assertJsonPath('data.pickup_photo_taken_at', null)
            ->assertJsonPath('data.delivery_photo_taken_at', null)
            ->assertJsonPath('data.events.0.actor_name', null)
            ->assertJsonPath('data.events.0.details', []);
        $this->actingAs($otherUser)->get("/api/v1/tracking/{$awb}/pickup-photo")
            ->assertForbidden();
        $this->actingAs($otherUser)->get("/api/v1/tracking/{$awb}/delivery-photo")
            ->assertForbidden();
        $this->actingAs($otherUser)->postJson("/api/v1/tracking/{$awb}/confirm-received")
            ->assertForbidden();

        $this->actingAs($customer)->getJson("/api/v1/tracking/{$awb}")
            ->assertOk()
            ->assertJsonPath('data.is_customer', true)
            ->assertJsonPath('data.recipient_name', 'Siti Nurhaliza')
            ->assertJsonPath('data.parcel.weight_grams', 750)
            ->assertJsonPath('data.pickup_photo_available', true)
            ->assertJsonCount(3, 'data.events');
        $this->actingAs($customer)->get("/api/v1/tracking/{$awb}/pickup-photo")
            ->assertOk();
    }

    public function test_tracking_uses_corrected_event_time_without_changing_audit_event(): void
    {
        $customer = User::where('email', 'siti.nurhaliza@anteraja.id')->firstOrFail();
        $awb = '11007182634956';
        $shipmentId = DB::table('shipments')->where('awb', $awb)->value('id');
        $lastEvent = DB::table('tracking_events')->where('shipment_id', $shipmentId)
            ->orderByDesc('occurred_at')->orderByDesc('id')->first();
        $this->assertNotNull($lastEvent);
        $originalTime = $lastEvent->occurred_at;
        DB::table('tracking_event_time_corrections')->insert([
            'tracking_event_id' => $lastEvent->id,
            'original_occurred_at' => $originalTime,
            'corrected_occurred_at' => DB::raw("TIMESTAMPTZ '{$originalTime}' - interval '7 hours'"),
            'reason' => 'Legacy timezone correction test',
        ]);

        $preview = $this->actingAs($customer)->getJson("/api/v1/tracking/{$awb}/preview")->assertOk();
        $detail = $this->actingAs($customer)->getJson("/api/v1/tracking/{$awb}")->assertOk();
        $this->assertNotSame($originalTime, $preview->json('data.latest_update'));
        $this->assertSame($preview->json('data.latest_update'), $detail->json('data.latest_update'));
        $this->assertSame($detail->json('data.latest_update'), collect($detail->json('data.events'))->last()['occurred_at']);
        $this->assertSame($originalTime, DB::table('tracking_events')->where('id', $lastEvent->id)->value('occurred_at'));
    }

    public function test_checkout_has_no_awb_until_admin_approves_once(): void
    {
        $buyer = User::where('email', 'siti.nurhaliza@anteraja.id')->firstOrFail();
        $admin = User::where('email', 'dimas.pratama@anteraja.id')->firstOrFail();
        $productId = DB::table('products')->where('sku', 'BAJU-001')->value('id');
        $checkout = $this->actingAs($buyer)->postJson('/api/v1/orders', [
            'checkout_key' => (string) Str::uuid(),
            'items' => [['product_id' => $productId, 'quantity' => 1]],
            'recipient' => [
                'name' => 'Siti Nurhaliza', 'phone' => '+620000000001',
                'address' => 'Cakung, Jakarta Timur', 'postcode' => '13910',
            ],
        ])->assertCreated()->assertJsonPath('data.status', 'PENDING_APPROVAL')
            ->assertJsonPath('data.awb', null);
        $orderId = $checkout->json('data.id');
        $this->actingAs($buyer)->postJson("/api/v1/admin/orders/{$orderId}/approve", [])
            ->assertForbidden();

        $first = $this->actingAs($admin)->postJson("/api/v1/admin/orders/{$orderId}/approve", [])
            ->assertOk()->assertJsonPath('data.status', 'APPROVED');
        $awb = $first->json('data.awb');
        $this->assertMatchesRegularExpression('/^11[0-9]{12}$/', $awb);
        $second = $this->actingAs($admin)->postJson("/api/v1/admin/orders/{$orderId}/approve", [])
            ->assertOk();
        $this->assertSame($awb, $second->json('data.awb'));
        $this->assertSame(1, DB::table('shipments')->where('order_id', $orderId)->count());
        $this->actingAs($admin)->postJson("/api/v1/admin/orders/{$orderId}/reject", [
            'reason' => 'Tidak sesuai',
        ])->assertNotFound();
        $this->actingAs($admin)->getJson('/api/v1/admin/dashboard')
            ->assertOk()
            ->assertJsonStructure(['data' => ['pending_orders', 'approved_today', 'awb_issued_total']]);
        $shipment = DB::table('shipments')->where('order_id', $orderId)->first();
        $destinationOperatorId = DB::table('user_roles')->where('role', 'HUB_OPERATOR')
            ->where('hub_id', $shipment->delivery_hub_id)->value('user_id');
        $this->actingAs(User::findOrFail($destinationOperatorId))
            ->getJson("/api/v1/hubs/{$shipment->delivery_hub_id}/inbound")
            ->assertOk()->assertJsonFragment([
                'awb' => $awb,
                'status' => 'READY_FOR_PICKUP',
                'origin_hub_name' => 'Hub Cakung',
            ]);
        $this->actingAs(User::findOrFail($destinationOperatorId))
            ->postJson("/api/v1/hubs/{$shipment->delivery_hub_id}/scan-in", ['awb' => $awb])
            ->assertStatus(409);
        $this->assertSame($shipment->delivery_hub_id, $shipment->origin_hub_id);
        $this->assertSame($shipment->delivery_zone_id, $shipment->pickup_zone_id);
        $this->assertSame('READY_FOR_PICKUP', DB::table('pickup_tasks')
            ->where('shipment_id', $shipment->id)->value('status'));
        $pickupOperatorId = DB::table('user_roles')->where('role', 'HUB_OPERATOR')
            ->where('hub_id', $shipment->origin_hub_id)->value('user_id');
        $this->actingAs(User::findOrFail($pickupOperatorId))
            ->getJson("/api/v1/hubs/{$shipment->origin_hub_id}/pickup-tasks")
            ->assertOk()->assertJsonFragment(['awb' => $awb]);
        $this->actingAs($buyer)->getJson("/api/v1/me/orders/{$orderId}")
            ->assertOk()->assertJsonPath('data.awb', $awb)
            ->assertJsonPath('data.tracking_url', rtrim(config('satria.ops_public_url'), '/').'/tracking?awb='.$awb);

        $hubOperator = User::findOrFail($destinationOperatorId);
        $otherHubOperator = User::where('email', 'rani.putri@anteraja.id')->firstOrFail();
        $attentionUrl = "/api/v1/hubs/{$shipment->delivery_hub_id}/attention-counts";
        $this->actingAs($otherHubOperator)->getJson($attentionUrl)->assertForbidden();
        $countsOnApproval = $this->actingAs($hubOperator)->getJson($attentionUrl)
            ->assertOk()->json('data');
        $this->assertGreaterThan(0, $countsOnApproval['pickup_needs_assignment']);
        $pickupCourier = User::where('email', 'arif.rahman@anteraja.id')->firstOrFail();
        $taskId = DB::table('pickup_tasks')->where('shipment_id', $shipment->id)->value('id');
        $this->actingAs($pickupCourier)
            ->postJson('/api/v1/courier/pickup-assignments/1/reject', ['reason' => 'Tidak tersedia'])
            ->assertNotFound();
        $assignment = $this->actingAs($hubOperator)
            ->postJson("/api/v1/hubs/{$shipment->delivery_hub_id}/pickup-tasks/{$taskId}/assign", [
                'courier_user_id' => $pickupCourier->id,
            ])->assertCreated()->json('data');
        $this->assertSame('PICKUP_ASSIGNED', DB::table('shipments')
            ->where('id', $shipment->id)->value('status'));
        $this->actingAs($hubOperator)->getJson($attentionUrl)->assertOk()
            ->assertJsonPath('data.pickup_needs_assignment', $countsOnApproval['pickup_needs_assignment'] - 1)
            ->assertJsonPath('data.inbound_needs_scan', $countsOnApproval['inbound_needs_scan']);
        $this->actingAs($hubOperator)
            ->postJson("/api/v1/hubs/{$shipment->delivery_hub_id}/scan-in", ['awb' => $awb])
            ->assertStatus(409);
        $this->actingAs($pickupCourier)
            ->postJson("/api/v1/courier/pickup-assignments/{$assignment['id']}/accept")
            ->assertOk()->assertJsonPath('data.status', 'ACCEPTED');
        $this->actingAs($hubOperator)
            ->postJson("/api/v1/hubs/{$shipment->delivery_hub_id}/scan-in", ['awb' => $awb])
            ->assertStatus(409);
        $this->actingAs($pickupCourier)->post(
            "/api/v1/courier/pickup-assignments/{$assignment['id']}/complete",
            [
                'awb' => $awb,
                'photo' => UploadedFile::fake()->image('pickup-langsung.jpg'),
                'captured_at' => now()->toIso8601String(),
            ],
            ['Accept' => 'application/json']
        )->assertOk()->assertJsonPath('data.status', 'COMPLETED');
        $photoRef = DB::table('pickup_assignments')->where('id', $assignment['id'])
            ->value('pickup_photo_ref');
        Storage::disk('local')->assertExists($photoRef);
        $this->actingAs($hubOperator)->getJson($attentionUrl)->assertOk()
            ->assertJsonPath('data.inbound_needs_scan', $countsOnApproval['inbound_needs_scan'] + 1);
        $this->actingAs($hubOperator)
            ->getJson("/api/v1/hubs/{$shipment->delivery_hub_id}/inbound")
            ->assertOk()->assertJsonFragment(['awb' => $awb, 'status' => 'PICKED_UP']);
        $this->actingAs($hubOperator)
            ->postJson("/api/v1/hubs/{$shipment->delivery_hub_id}/scan-in", ['awb' => $awb])
            ->assertOk()->assertJsonPath('data.status', 'READY_FOR_LAST_MILE');
        $this->actingAs($hubOperator)
            ->getJson("/api/v1/hubs/{$shipment->delivery_hub_id}/ready")
            ->assertOk()->assertJsonFragment(['awb' => $awb]);
        $this->actingAs($hubOperator)->getJson($attentionUrl)->assertOk()
            ->assertJsonPath('data.inbound_needs_scan', $countsOnApproval['inbound_needs_scan']);
        $this->assertSame([
            'AWB_GENERATED', 'PICKUP_ASSIGNED', 'PICKUP_ACCEPTED',
            'PICKED_UP', 'ARRIVED_AT_DELIVERY_HUB',
        ], DB::table('tracking_events')->where('shipment_id', $shipment->id)
            ->orderBy('id')->pluck('event_type')->all());
    }

    public function test_failed_delivery_is_returned_and_retried_on_same_awb_with_photos(): void
    {
        $admin = User::where('email', 'dimas.pratama@anteraja.id')->firstOrFail();
        $pickupCourier = User::where('email', 'arif.rahman@anteraja.id')->firstOrFail();
        $hubOperator = User::where('email', 'fajar.hidayat@anteraja.id')->firstOrFail();
        $otherHubOperator = User::where('email', 'rani.putri@anteraja.id')->firstOrFail();
        $deliveryCourier = User::where('email', 'hanif.saputra@anteraja.id')->firstOrFail();
        $otherZoneCourier = User::where('email', 'reza.firmansyah@anteraja.id')->firstOrFail();
        $buyer = User::where('email', 'siti.nurhaliza@anteraja.id')->firstOrFail();
        $shipment = DB::table('shipments')->where('awb', '11007182634955')->first();
        $this->assertNotNull($shipment);
        $this->getJson("/api/v1/tracking/{$shipment->awb}")->assertUnauthorized();
        $task = DB::table('pickup_tasks')->where('shipment_id', $shipment->id)->first();
        $hubId = $shipment->delivery_hub_id;
        $zoneId = $shipment->delivery_zone_id;
        $pickupHubId = $shipment->origin_hub_id;
        $pickupOperatorId = DB::table('user_roles')->where('role', 'HUB_OPERATOR')
            ->where('hub_id', $pickupHubId)->value('user_id');
        $pickupOperator = User::findOrFail($pickupOperatorId);

        $this->actingAs($admin)->postJson("/api/v1/hubs/{$pickupHubId}/pickup-tasks/{$task->id}/assign", [
            'courier_user_id' => $pickupCourier->id,
        ])->assertForbidden();
        $this->actingAs($pickupOperator)->postJson("/api/v1/hubs/{$pickupHubId}/pickup-tasks/{$task->id}/assign", [
            'courier_user_id' => $deliveryCourier->id,
        ])->assertUnprocessable();

        $assignment = $this->actingAs($pickupOperator)->postJson("/api/v1/hubs/{$pickupHubId}/pickup-tasks/{$task->id}/assign", [
            'courier_user_id' => $pickupCourier->id,
        ])->assertCreated()->json('data');
        $this->actingAs($pickupCourier)->postJson("/api/v1/courier/pickup-assignments/{$assignment['id']}/accept")
            ->assertOk();
        $pickupUrl = "/api/v1/courier/pickup-assignments/{$assignment['id']}/complete";
        $this->actingAs($pickupCourier)->post($pickupUrl, [
            'awb' => $shipment->awb,
        ], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->actingAs($pickupCourier)->post($pickupUrl, [
            'awb' => $shipment->awb,
            'photo' => UploadedFile::fake()->image('foto-lama.jpg'),
            'captured_at' => now()->subMinutes(10)->toIso8601String(),
        ], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->actingAs($pickupCourier)->post($pickupUrl, [
            'awb' => $shipment->awb,
            'photo' => UploadedFile::fake()->image('pickup-baru.jpg'),
            'captured_at' => now()->toIso8601String(),
        ], ['Accept' => 'application/json'])->assertOk();
        $photoRef = DB::table('pickup_assignments')->where('id', $assignment['id'])->value('pickup_photo_ref');
        $this->assertStringStartsWith('proofs/pickup/', $photoRef);
        $this->assertNotSame('proofs/pickup/demo-pickup.jpg', $photoRef);
        Storage::disk('local')->assertExists($photoRef);
        $pickupEventDetails = DB::table('tracking_events')->where('shipment_id', $shipment->id)
            ->where('event_type', 'PICKED_UP')->orderByDesc('id')->value('details');
        $this->actingAs($buyer)->getJson("/api/v1/tracking/{$shipment->awb}")
            ->assertOk()
            ->assertJsonPath('data.pickup_photo_available', true)
            ->assertJsonPath('data.pickup_photo_taken_at', json_decode($pickupEventDetails, true)['photo_captured_at']);
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
        $attentionUrl = "/api/v1/hubs/{$hubId}/attention-counts";
        $readyCount = $this->actingAs($hubOperator)->getJson($attentionUrl)
            ->assertOk()->json('data.delivery_needs_assignment');
        $this->assertGreaterThan(0, $readyCount);
        $this->actingAs($hubOperator)->postJson("/api/v1/hubs/{$hubId}/delivery-runs", [
            'zone_id' => $zoneId, 'courier_user_id' => $otherZoneCourier->id,
            'shipment_ids' => [$shipment->id], 'service_date' => today()->toDateString(),
        ])->assertUnprocessable();
        $run = $this->actingAs($hubOperator)->postJson("/api/v1/hubs/{$hubId}/delivery-runs", [
            'zone_id' => $zoneId, 'courier_user_id' => $deliveryCourier->id,
            'shipment_ids' => [$shipment->id], 'service_date' => today()->toDateString(),
        ])->assertCreated()->json('data');
        $this->actingAs($hubOperator)->getJson($attentionUrl)->assertOk()
            ->assertJsonPath('data.delivery_needs_assignment', $readyCount - 1);
        $this->actingAs($deliveryCourier)->postJson("/api/v1/courier/delivery-runs/{$run['id']}/accept")
            ->assertOk();
        $handoverCount = $this->actingAs($hubOperator)->getJson($attentionUrl)
            ->assertOk()->json('data.handover_needs_confirmation');
        $this->assertGreaterThan(0, $handoverCount);
        $this->actingAs($hubOperator)->postJson("/api/v1/hubs/{$hubId}/handover", [
            'run_id' => $run['id'], 'awbs' => [$shipment->awb],
        ])->assertOk();
        $this->actingAs($hubOperator)->getJson($attentionUrl)->assertOk()
            ->assertJsonPath('data.handover_needs_confirmation', $handoverCount - 1);
        $this->actingAs($deliveryCourier)->postJson("/api/v1/courier/delivery-runs/{$run['id']}/start")
            ->assertOk();
        $firstRunShipmentId = DB::table('run_shipments')->where('run_id', $run['id'])->value('id');
        $this->actingAs($deliveryCourier)->postJson("/api/v1/courier/run-shipments/{$firstRunShipmentId}/result", [
            'result' => 'FAILED', 'failure_reason' => 'PENERIMA_TIDAK_ADA',
            'notes' => 'Penerima belum ada di lokasi saat kurir tiba.',
        ])->assertOk()->assertJsonPath('data.attempt_no', 1);
        $tracking = $this->actingAs($buyer)->getJson("/api/v1/tracking/{$shipment->awb}")
            ->assertOk()->assertJsonPath('data.attempts.0.courier_name', $deliveryCourier->name)
            ->assertJsonPath('data.attempts.0.notes', 'Penerima belum ada di lokasi saat kurir tiba.')
            ->json('data');
        $failureEvent = collect($tracking['events'])->firstWhere('event_type', 'DELIVERY_FAILED');
        $this->assertSame($deliveryCourier->name, $failureEvent['actor_name']);
        $this->assertSame('PENERIMA_TIDAK_ADA', $failureEvent['details']['failure_reason']);
        $failedCount = $this->actingAs($hubOperator)->getJson($attentionUrl)
            ->assertOk()->json('data.failed_needs_return');
        $this->assertGreaterThan(0, $failedCount);
        $this->actingAs($hubOperator)->postJson("/api/v1/hubs/{$hubId}/return-scan", [
            'awb' => $shipment->awb,
        ])->assertOk()->assertJsonPath('data.status', 'AT_HUB_AWAITING_DECISION');
        $this->actingAs($hubOperator)->getJson($attentionUrl)->assertOk()
            ->assertJsonPath('data.failed_needs_return', $failedCount - 1);
        $decisionCount = $this->actingAs($hubOperator)->getJson($attentionUrl)
            ->assertOk()->json('data.returned_needs_decision');
        $this->assertGreaterThan(0, $decisionCount);
        $issueId = DB::table('shipment_issues')->where('shipment_id', $shipment->id)->value('id');
        $this->actingAs($admin)->getJson("/api/v1/shipments/{$shipment->id}/contact-options")
            ->assertForbidden();
        $this->actingAs($hubOperator)->getJson("/api/v1/shipments/{$shipment->id}/contact-options")
            ->assertOk();
        $retryAt = now()->addDay();
        $this->actingAs($admin)->postJson("/api/v1/hubs/{$hubId}/issues/{$issueId}/decision", [
            'decision' => 'RESCHEDULE', 'scheduled_redelivery_at' => $retryAt->toIso8601String(),
        ])->assertForbidden();
        $this->actingAs($otherHubOperator)->postJson("/api/v1/hubs/{$hubId}/issues/{$issueId}/decision", [
            'decision' => 'RESCHEDULE', 'scheduled_redelivery_at' => $retryAt->toIso8601String(),
        ])->assertForbidden();
        $this->actingAs($hubOperator)->postJson("/api/v1/hubs/{$hubId}/issues/{$issueId}/decision", [
            'decision' => 'RESCHEDULE', 'scheduled_redelivery_at' => $retryAt->toIso8601String(),
        ])->assertOk();
        $this->actingAs($hubOperator)->getJson($attentionUrl)->assertOk()
            ->assertJsonPath('data.returned_needs_decision', $decisionCount - 1);
        $this->travelTo($retryAt->copy()->addMinute());

        $retry = $this->actingAs($hubOperator)->postJson("/api/v1/hubs/{$hubId}/delivery-runs", [
            'zone_id' => $zoneId, 'courier_user_id' => $deliveryCourier->id,
            'shipment_ids' => [$shipment->id], 'service_date' => today()->toDateString(),
        ]);
        $this->assertSame(201, $retry->status(), $retry->getContent());
        $retry = $retry->json('data');
        $this->actingAs($deliveryCourier)->postJson("/api/v1/courier/delivery-runs/{$retry['id']}/accept")
            ->assertOk();
        $this->actingAs($hubOperator)->postJson("/api/v1/hubs/{$hubId}/handover", [
            'run_id' => $retry['id'], 'awbs' => [$shipment->awb],
        ])->assertOk();
        $this->actingAs($deliveryCourier)->postJson("/api/v1/courier/delivery-runs/{$retry['id']}/start")
            ->assertOk();
        $secondRunShipmentId = DB::table('run_shipments')->where('run_id', $retry['id'])->value('id');
        $this->actingAs($deliveryCourier)->post('/api/v1/courier/run-shipments/'.$secondRunShipmentId.'/result', [
            'result' => 'DELIVERED', 'recipient_name' => 'Siti Nurhaliza',
            'photo' => UploadedFile::fake()->image('old-photo.jpg'),
            'captured_at' => now()->subMinutes(10)->toIso8601String(),
        ], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->actingAs($deliveryCourier)->post("/api/v1/courier/run-shipments/{$secondRunShipmentId}/result", [
            'result' => 'DELIVERED', 'recipient_name' => 'Siti Nurhaliza',
            'photo' => UploadedFile::fake()->image('delivered.jpg'),
            'captured_at' => now()->toIso8601String(),
        ], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('data.attempt_no', 2);

        $this->assertSame(2, DB::table('delivery_attempts')->where('shipment_id', $shipment->id)->count());
        $this->actingAs($buyer)->getJson("/api/v1/tracking/{$shipment->awb}")
            ->assertOk()->assertJsonCount(2, 'data.attempts')
            ->assertJsonPath('data.attempts.0.attempt_no', 1)
            ->assertJsonPath('data.attempts.0.failure_reason', 'PENERIMA_TIDAK_ADA')
            ->assertJsonPath('data.attempts.1.attempt_no', 2)
            ->assertJsonPath('data.attempts.1.result', 'DELIVERED');
        $historyUrl = "/api/v1/hubs/{$hubId}/shipments/{$shipment->awb}/history";
        $this->actingAs($hubOperator)->getJson($historyUrl)
            ->assertOk()->assertJsonCount(2, 'data.attempts')
            ->assertJsonPath('data.shipment.awb', $shipment->awb)
            ->assertJsonPath('data.attempts.0.failure_reason', 'PENERIMA_TIDAK_ADA')
            ->assertJsonPath('data.attempts.1.result', 'DELIVERED')
            ->assertJsonCount(1, 'data.issues');
        $this->actingAs($otherHubOperator)->getJson($historyUrl)->assertForbidden();
        $this->actingAs($buyer)->getJson($historyUrl)->assertForbidden();
        $this->actingAs($otherZoneCourier)->getJson("/api/v1/tracking/{$shipment->awb}")
            ->assertOk()->assertJsonCount(0, 'data.attempts');
        $this->assertSame($shipment->awb, DB::table('shipments')->where('id', $shipment->id)->value('awb'));
        $this->actingAs($buyer)->getJson("/api/v1/me/orders/{$shipment->order_id}/delivery-photo")
            ->assertOk();
        $deliveryEventDetails = DB::table('tracking_events')->where('shipment_id', $shipment->id)
            ->where('event_type', 'DELIVERED')->orderByDesc('id')->value('details');
        $this->actingAs($buyer)->getJson("/api/v1/tracking/{$shipment->awb}")
            ->assertOk()->assertJsonPath('data.proof_available', true)
            ->assertJsonPath('data.delivery_photo_taken_at', json_decode($deliveryEventDetails, true)['photo_captured_at'])
            ->assertDontSee($buyer->phone);
        $this->actingAs($buyer)->get("/api/v1/tracking/{$shipment->awb}/delivery-photo")
            ->assertOk();
        $this->actingAs($deliveryCourier)->get("/api/v1/shipments/{$shipment->id}/delivery-photo")
            ->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        $this->actingAs($hubOperator)->get("/api/v1/shipments/{$shipment->id}/delivery-photo")
            ->assertOk();
        $this->actingAs($otherZoneCourier)->get("/api/v1/shipments/{$shipment->id}/delivery-photo")
            ->assertForbidden();
        $this->actingAs($buyer)->get("/api/v1/shipments/{$shipment->id}/delivery-photo")
            ->assertForbidden();
        $this->actingAs($deliveryCourier)->getJson('/api/v1/courier/delivery-runs')
            ->assertOk()->assertJsonFragment(['photo_available' => true, 'attempt_no' => 2]);
    }

    public function test_hub_route_preview_orders_multiple_packages_and_respects_roles(): void
    {
        $operator = User::where('email', 'fajar.hidayat@anteraja.id')->firstOrFail();
        $admin = User::where('email', 'dimas.pratama@anteraja.id')->firstOrFail();
        $courier = User::where('email', 'hanif.saputra@anteraja.id')->firstOrFail();
        $shipments = DB::table('shipments')->whereIn('awb', [
            '11008260000401', '11008260000402', '11008260000405',
        ])->orderBy('id')->get();
        $this->assertCount(3, $shipments);
        $hubId = $shipments->first()->delivery_hub_id;
        $zoneId = $shipments->first()->delivery_zone_id;
        $ids = $shipments->pluck('id')->all();
        $this->assertSame(1, $shipments->pluck('delivery_zone_id')->unique()->count());

        $this->actingAs($courier)->postJson("/api/v1/hubs/{$hubId}/delivery-runs/preview", [
            'zone_id' => $zoneId, 'shipment_ids' => $ids,
        ])->assertForbidden();
        $this->actingAs($admin)->postJson("/api/v1/hubs/{$hubId}/delivery-runs/preview", [
            'zone_id' => $zoneId, 'shipment_ids' => $ids,
        ])->assertForbidden();
        $this->actingAs($admin)->postJson("/api/v1/hubs/{$hubId}/delivery-runs", [
            'zone_id' => $zoneId, 'courier_user_id' => $courier->id,
            'shipment_ids' => $ids, 'service_date' => today()->toDateString(),
        ])->assertForbidden();
        $preview = $this->actingAs($operator)->postJson("/api/v1/hubs/{$hubId}/delivery-runs/preview", [
            'zone_id' => $zoneId, 'shipment_ids' => $ids,
        ])->assertOk()->assertJsonCount(3, 'data.stops')
            ->assertJsonPath('data.strategy', 'distance_age_priority')
            ->json('data');
        $this->assertEqualsCanonicalizing($ids, $preview['shipment_ids']);
        $this->assertSame('URGENT', collect($preview['stops'])->firstWhere('awb', '11008260000405')['priority']);
        $this->assertGreaterThan(0, $preview['distance_km']);

        $run = $this->actingAs($operator)->postJson("/api/v1/hubs/{$hubId}/delivery-runs", [
            'zone_id' => $zoneId,
            'courier_user_id' => $courier->id,
            'shipment_ids' => $ids,
            'service_date' => today()->toDateString(),
        ]);
        $this->assertSame(201, $run->status(), $run->getContent());
        $run->assertJsonPath('data.status', 'PENDING_ACCEPT');
        $run = $run->json('data');
        $this->assertSame($preview['shipment_ids'], DB::table('run_shipments')->where('run_id', $run['id'])
            ->orderBy('stop_order')->pluck('shipment_id')->all());
        $this->assertSame(1, DB::table('notifications as notification')
            ->join('tracking_events as event', 'event.id', '=', 'notification.tracking_event_id')
            ->where('event.event_type', 'DELIVERY_ASSIGNED')
            ->where('event.details->run_id', $run['id'])
            ->where('notification.template_key', 'DELIVERY_ASSIGNED')->count());
        $this->actingAs($admin)->getJson('/api/v1/admin/network')->assertOk()
            ->assertJsonCount(10, 'data.hubs');
        $this->actingAs($courier)->getJson('/api/v1/admin/network')->assertForbidden();
    }

    public function test_hub_prevents_a_second_active_run_for_the_same_courier_and_date(): void
    {
        $operator = User::where('email', 'fajar.hidayat@anteraja.id')->firstOrFail();
        $courier = User::where('email', 'hanif.saputra@anteraja.id')->firstOrFail();
        $shipments = DB::table('shipments')->whereIn('awb', [
            '11008260000401', '11008260000402',
        ])->orderBy('id')->get();
        $this->assertCount(2, $shipments);
        $date = today()->addDay()->toDateString();
        $base = [
            'zone_id' => $shipments->first()->delivery_zone_id,
            'courier_user_id' => $courier->id,
            'service_date' => $date,
        ];
        $endpoint = "/api/v1/hubs/{$shipments->first()->delivery_hub_id}/delivery-runs";
        $first = $this->actingAs($operator)->postJson($endpoint, array_merge($base, [
            'shipment_ids' => [$shipments[0]->id],
        ]))->assertCreated()->json('data');
        $this->assertSame('00:00:00', $first['window_start']);
        $this->assertSame('23:59:00', $first['window_end']);

        $this->actingAs($operator)->postJson($endpoint, array_merge($base, [
            'shipment_ids' => [$shipments[1]->id],
        ]))->assertStatus(409);
        $this->actingAs($operator)->postJson($endpoint, array_merge($base, [
            'shipment_ids' => [$shipments[1]->id],
            'service_date' => today()->addDays(2)->toDateString(),
        ]))->assertCreated();
    }

    public function test_courier_is_available_again_after_failed_parcel_is_returned_to_hub(): void
    {
        $operator = User::where('email', 'fajar.hidayat@anteraja.id')->firstOrFail();
        $courier = User::where('email', 'hanif.saputra@anteraja.id')->firstOrFail();
        $shipments = DB::table('shipments')->whereIn('awb', [
            '11008260000401', '11008260000402',
        ])->orderBy('id')->get();
        $this->assertCount(2, $shipments);
        $hubId = $shipments->first()->delivery_hub_id;
        $endpoint = "/api/v1/hubs/{$hubId}/delivery-runs";
        $assignment = [
            'zone_id' => $shipments->first()->delivery_zone_id,
            'courier_user_id' => $courier->id,
            'service_date' => today()->toDateString(),
        ];
        $firstRun = $this->actingAs($operator)->postJson($endpoint, array_merge($assignment, [
            'shipment_ids' => [$shipments[0]->id],
        ]))->assertCreated()->json('data');
        $this->actingAs($courier)->postJson("/api/v1/courier/delivery-runs/{$firstRun['id']}/accept")
            ->assertOk();
        $this->actingAs($operator)->postJson("/api/v1/hubs/{$hubId}/handover", [
            'run_id' => $firstRun['id'], 'awbs' => [$shipments[0]->awb],
        ])->assertOk();
        $this->actingAs($courier)->postJson("/api/v1/courier/delivery-runs/{$firstRun['id']}/start")
            ->assertOk();
        $runShipmentId = DB::table('run_shipments')->where('run_id', $firstRun['id'])->value('id');
        $this->actingAs($courier)->postJson("/api/v1/courier/run-shipments/{$runShipmentId}/result", [
            'result' => 'FAILED', 'failure_reason' => 'PENERIMA_TIDAK_ADA',
        ])->assertOk();
        $this->assertSame('COMPLETED', DB::table('delivery_runs')->where('id', $firstRun['id'])->value('status'));

        $courierList = $this->actingAs($operator)->getJson("/api/v1/hubs/{$hubId}/couriers")
            ->assertOk()->json('data');
        $this->assertSame(1, collect($courierList)->firstWhere('user_id', $courier->id)['unreturned_failed_count']);
        $this->actingAs($operator)->postJson($endpoint, array_merge($assignment, [
            'shipment_ids' => [$shipments[1]->id],
        ]))->assertStatus(409);

        $this->actingAs($operator)->postJson("/api/v1/hubs/{$hubId}/return-scan", [
            'awb' => $shipments[0]->awb,
        ])->assertOk();
        $courierList = $this->actingAs($operator)->getJson("/api/v1/hubs/{$hubId}/couriers")
            ->assertOk()->json('data');
        $this->assertSame(0, collect($courierList)->firstWhere('user_id', $courier->id)['unreturned_failed_count']);
        $this->actingAs($operator)->postJson($endpoint, array_merge($assignment, [
            'shipment_ids' => [$shipments[1]->id],
        ]))->assertCreated();
    }

    public function test_redelivery_cannot_be_assigned_before_the_promised_date(): void
    {
        $shipment = DB::table('shipments')->where('status', 'WAITING_REDELIVERY')->first();
        $this->assertNotNull($shipment);
        $operatorId = DB::table('user_roles')->where('role', 'HUB_OPERATOR')
            ->where('hub_id', $shipment->delivery_hub_id)->value('user_id');
        $operator = User::findOrFail($operatorId);
        $courierId = DB::table('courier_zones as zone')
            ->join('courier_profiles as profile', 'profile.user_id', '=', 'zone.courier_user_id')
            ->where('zone.zone_id', $shipment->delivery_zone_id)
            ->where('zone.service_type', 'DELIVERY')
            ->where('profile.home_hub_id', $shipment->delivery_hub_id)
            ->where('profile.available', true)
            ->value('zone.courier_user_id');
        $this->assertNotNull($courierId);

        $date = today()->addDays(2)->toDateString();
        DB::table('shipment_issues')->where('shipment_id', $shipment->id)
            ->where('decision', 'RESCHEDULE')
            ->update(['scheduled_redelivery_at' => $date.' 15:00:00+07']);

        $endpoint = "/api/v1/hubs/{$shipment->delivery_hub_id}/delivery-runs";
        $assignment = [
            'zone_id' => $shipment->delivery_zone_id,
            'courier_user_id' => $courierId,
            'shipment_ids' => [$shipment->id],
        ];
        $this->actingAs($operator)->postJson($endpoint, array_merge($assignment, [
            'service_date' => today()->addDay()->toDateString(),
        ]))->assertStatus(409);
        $this->actingAs($operator)->postJson($endpoint, array_merge($assignment, [
            'service_date' => $date,
        ]))->assertCreated();
    }

    public function test_existing_run_with_later_legacy_window_can_start_without_waiting_for_session(): void
    {
        $this->travelTo(today('Asia/Jakarta')->addHours(9));
        $operator = User::where('email', 'fajar.hidayat@anteraja.id')->firstOrFail();
        $courier = User::where('email', 'hanif.saputra@anteraja.id')->firstOrFail();
        $shipment = DB::table('shipments')->where('awb', '11008260000401')->first();
        $this->assertNotNull($shipment);
        $hubId = $shipment->delivery_hub_id;
        $run = $this->actingAs($operator)->postJson("/api/v1/hubs/{$hubId}/delivery-runs", [
            'zone_id' => $shipment->delivery_zone_id,
            'courier_user_id' => $courier->id,
            'shipment_ids' => [$shipment->id],
            'service_date' => today()->toDateString(),
        ])->assertCreated()->json('data');
        DB::table('delivery_runs')->where('id', $run['id'])
            ->update(['window_start' => '16:00', 'window_end' => '20:00']);

        $this->actingAs($courier)->postJson("/api/v1/courier/delivery-runs/{$run['id']}/accept")
            ->assertOk();
        $this->actingAs($operator)->postJson("/api/v1/hubs/{$hubId}/handover", [
            'run_id' => $run['id'], 'awbs' => [$shipment->awb],
        ])->assertOk();
        $this->actingAs($courier)->postJson("/api/v1/courier/delivery-runs/{$run['id']}/start")
            ->assertOk()->assertJsonPath('data.status', 'OUT_FOR_DELIVERY');
    }

    public function test_courier_can_accept_some_packages_and_hub_can_reassign_rejected_package(): void
    {
        $operator = User::where('email', 'fajar.hidayat@anteraja.id')->firstOrFail();
        $courier = User::where('email', 'hanif.saputra@anteraja.id')->firstOrFail();
        $otherCourier = User::where('email', 'reza.firmansyah@anteraja.id')->firstOrFail();
        $rescheduledCourier = User::where('email', 'andika.wijaya@anteraja.id')->firstOrFail();
        $shipments = DB::table('shipments')->whereIn('awb', [
            '11008260000401', '11008260000402', '11008260000405',
        ])->orderBy('id')->get();
        $this->assertCount(3, $shipments);
        $hubId = $shipments->first()->delivery_hub_id;
        $zoneId = $shipments->first()->delivery_zone_id;
        $run = $this->actingAs($operator)->postJson("/api/v1/hubs/{$hubId}/delivery-runs", [
            'zone_id' => $zoneId, 'courier_user_id' => $courier->id,
            'shipment_ids' => $shipments->pluck('id')->all(),
            'service_date' => today()->toDateString(),
        ])->assertCreated()->json('data');
        $rejected = $shipments->last();
        $decisions = $shipments->map(fn ($shipment): array => [
            'shipment_id' => $shipment->id,
            'decision' => $shipment->id === $rejected->id ? 'REJECTED' : 'ACCEPTED',
            'reason' => $shipment->id === $rejected->id ? 'Kapasitas kendaraan penuh' : null,
        ])->all();
        $this->actingAs($operator)->postJson("/api/v1/courier/delivery-runs/{$run['id']}/respond", [
            'decisions' => $decisions,
        ])->assertForbidden();
        $this->actingAs($otherCourier)->postJson("/api/v1/courier/delivery-runs/{$run['id']}/respond", [
            'decisions' => $decisions,
        ])->assertForbidden();
        $this->actingAs($courier)->postJson("/api/v1/courier/delivery-runs/{$run['id']}/respond", [
            'decisions' => array_slice($decisions, 0, 2),
        ])->assertUnprocessable();
        $this->actingAs($courier)->postJson("/api/v1/courier/delivery-runs/{$run['id']}/respond", [
            'decisions' => $decisions,
        ])->assertOk()->assertJsonPath('data.status', 'ACCEPTED');
        $this->assertSame('READY_FOR_LAST_MILE', DB::table('shipments')->where('id', $rejected->id)->value('status'));
        $this->assertSame('Kapasitas kendaraan penuh', DB::table('run_shipments')
            ->where('run_id', $run['id'])->where('shipment_id', $rejected->id)->value('rejection_reason'));
        $buyerId = DB::table('orders')->where('id', $rejected->order_id)->value('customer_id');
        $tracking = $this->actingAs(User::findOrFail($buyerId))
            ->getJson("/api/v1/tracking/{$rejected->awb}")->assertOk()->json('data');
        $rejectionEvent = collect($tracking['events'])->firstWhere('event_type', 'DELIVERY_ASSIGNMENT_REJECTED');
        $this->assertSame('Kapasitas kendaraan penuh', $rejectionEvent['details']['reason']);
        $this->assertSame($courier->name, $rejectionEvent['actor_name']);
        $this->actingAs($otherCourier)->getJson("/api/v1/tracking/{$rejected->awb}")
            ->assertOk()->assertJsonCount(0, 'data.attempts')
            ->assertJsonMissing(['actor_name' => $courier->name]);
        $this->actingAs($operator)->getJson("/api/v1/hubs/{$hubId}/ready")
            ->assertOk()->assertJsonFragment(['awb' => $rejected->awb]);
        $acceptedAwbs = $shipments->take(2)->pluck('awb')->all();
        $this->actingAs($operator)->postJson("/api/v1/hubs/{$hubId}/handover", [
            'run_id' => $run['id'], 'awbs' => $acceptedAwbs,
        ])->assertOk();
        $this->actingAs($courier)->postJson("/api/v1/courier/delivery-runs/{$run['id']}/start")
            ->assertOk()->assertJsonPath('data.status', 'OUT_FOR_DELIVERY');
        $this->assertSame('READY_FOR_LAST_MILE', DB::table('shipments')->where('id', $rejected->id)->value('status'));
        $reassigned = $this->actingAs($operator)->postJson("/api/v1/hubs/{$hubId}/delivery-runs", [
            'zone_id' => $zoneId, 'courier_user_id' => $rescheduledCourier->id,
            'shipment_ids' => [$rejected->id],
            'service_date' => today()->addDay()->toDateString(),
        ])->assertCreated()->json('data');
        $this->assertSame('PENDING_ACCEPT', $reassigned['status']);
        $this->assertSame($rejected->id, DB::table('run_shipments')
            ->where('run_id', $reassigned['id'])->value('shipment_id'));
        $this->actingAs($rescheduledCourier)->postJson("/api/v1/courier/delivery-runs/{$reassigned['id']}/respond", [
            'decisions' => [['shipment_id' => $rejected->id, 'decision' => 'ACCEPTED']],
        ])->assertOk()->assertJsonPath('data.status', 'ACCEPTED');
    }

    public function test_telegram_queues_key_customer_events_only(): void
    {
        $shipment = DB::table('shipments')->orderBy('id')->first();
        $order = DB::table('orders')->where('id', $shipment->order_id)->first();
        $eventId = app(SatriaService::class)->event($shipment->id, null, 'NOTICE_POLICY_CHECK', $shipment->status);
        $service = app(SatriaService::class);
        $service->notifyUser($eventId, $shipment->id, $order->customer_id, 'BUYER', 'PICKED_UP', '');
        $service->notifyUser($eventId, $shipment->id, $order->customer_id, 'BUYER', 'DELIVERED', '');
        $service->notifyUser($eventId, $shipment->id, $order->customer_id, 'BUYER', 'AWB_GENERATED', '');
        $rows = DB::table('notifications')->where('tracking_event_id', $eventId)->get();
        $this->assertCount(2, $rows);
        $this->assertEqualsCanonicalizing(['AWB_GENERATED', 'DELIVERED'], $rows->pluck('template_key')->all());
        $this->assertStringContainsString($shipment->awb, $rows->first()->message_text);
    }

    public function test_daily_report_queues_one_hub_summary_per_date(): void
    {
        config(['satria.telegram_mode' => 'MOCK', 'satria.n8n_webhook_url' => '']);
        $hubAdmin = User::where('email', 'rianyuliawan1@anteraja.id')->firstOrFail();
        $this->travelTo(today()->setTime(9, 40));
        $date = today()->toDateString();

        $this->withToken((string) config('satria.internal_token'))
            ->postJson('/api/v1/internal/reports/daily', ['report_date' => $date])->assertOk();
        $this->assertSame(0, DB::table('notifications')->where('template_key', 'DAILY_REPORT')->count());

        $this->travelTo(today()->setTime(17, 1));
        $this->postJson('/api/v1/internal/reports/daily', ['report_date' => $date])->assertOk();
        $this->postJson('/api/v1/internal/reports/daily', ['report_date' => $date])->assertOk();

        $rows = DB::table('notifications as notification')
            ->join('notification_targets as target', 'target.id', '=', 'notification.target_id')
            ->where('target.user_id', $hubAdmin->id)->where('notification.template_key', 'DAILY_REPORT')
            ->get(['notification.status', 'notification.message_text', 'notification.shipment_id']);
        $this->assertCount(1, $rows);
        $this->assertSame('SIMULATED', $rows->first()->status);
        $this->assertNull($rows->first()->shipment_id);
        $this->assertStringContainsString('unduh XLSX', $rows->first()->message_text);
    }

    public function test_delivery_assignment_message_links_to_its_run(): void
    {
        config(['satria.telegram_mode' => 'MOCK', 'satria.n8n_webhook_url' => '']);
        $courier = User::where('email', 'afrien@anteraja.id')->firstOrFail();
        $run = DB::table('delivery_runs')->where('courier_user_id', $courier->id)
            ->where('status', 'PENDING_ACCEPT')->first();
        $this->assertNotNull($run);
        $shipmentId = DB::table('run_shipments')->where('run_id', $run->id)
            ->orderBy('stop_order')->value('shipment_id');
        $eventId = app(SatriaService::class)->event($shipmentId, null, 'DELIVERY_ASSIGNED',
            'DELIVERY_ASSIGNED', ['run_id' => $run->id]);
        app(SatriaService::class)->notifyUser($eventId, $shipmentId, $courier->id,
            'COURIER', 'DELIVERY_ASSIGNED', 'Tugas baru.');
        $notification = DB::table('notifications')->where('tracking_event_id', $eventId)->first();
        $this->assertNotNull($notification);
        $this->assertStringEndsWith('/courier-deliveries?run='.$run->id, $notification->action_url);
        $this->assertStringContainsString($notification->action_url, $notification->message_text);
    }

    public function test_overdue_delivery_run_sends_one_reminder_to_courier_and_hub(): void
    {
        config(['satria.telegram_mode' => 'MOCK', 'satria.n8n_webhook_url' => '']);
        $courier = User::where('email', 'afrien@anteraja.id')->firstOrFail();
        $run = DB::table('delivery_runs')->where('courier_user_id', $courier->id)
            ->where('status', 'PENDING_ACCEPT')->first();
        $this->assertNotNull($run);
        DB::table('delivery_runs')->where('id', $run->id)->update(['assigned_at' => now()->subMinutes(20)]);

        $this->withToken((string) config('satria.internal_token'))
            ->postJson("/api/v1/internal/tasks/{$run->id}/remind", ['type' => 'delivery_run'])
            ->assertOk()->assertJsonPath('data.reminded', 1);
        $this->postJson("/api/v1/internal/tasks/{$run->id}/remind", ['type' => 'delivery_run'])
            ->assertOk()->assertJsonPath('data.reminded', 0);

        $shipmentId = DB::table('run_shipments')->where('run_id', $run->id)
            ->orderBy('stop_order')->value('shipment_id');
        $events = DB::table('tracking_events')->where('shipment_id', $shipmentId)
            ->where('event_type', 'ASSIGNMENT_REMINDER')->get(['id']);
        $this->assertCount(1, $events);
        $templates = DB::table('notifications')->where('tracking_event_id', $events->first()->id)
            ->pluck('template_key')->all();
        $this->assertSame(1, count(array_filter($templates, fn ($template): bool => $template === 'ASSIGNMENT_REMINDER')));
        $this->assertContains('TASK_UNRESPONDED', $templates);
        $reminderUrl = DB::table('notifications')->where('tracking_event_id', $events->first()->id)
            ->where('template_key', 'ASSIGNMENT_REMINDER')->value('action_url');
        $this->assertStringEndsWith('/courier-deliveries?run='.$run->id, $reminderUrl);
    }

    public function test_notification_uses_database_phone_and_correct_sender_profile(): void
    {
        config(['satria.telegram_mode' => 'LIVE', 'satria.n8n_webhook_url' => '']);
        $shipment = DB::table('shipments')->orderBy('id')->first();
        $order = DB::table('orders')->where('id', $shipment->order_id)->first();
        $eventId = DB::table('tracking_events')->where('shipment_id', $shipment->id)->value('id');
        $courier = User::where('email', 'galih.pratama@anteraja.id')->firstOrFail();
        config(['satria.telegram_live_recipient_emails' => [
            strtolower($courier->email), strtolower((string) DB::table('users')->where('id', $order->customer_id)->value('email')),
        ]]);
        DB::table('users')->where('id', $order->customer_id)->update(['phone' => '081200000001']);
        DB::table('users')->where('id', $courier->id)->update(['phone' => '081200000002']);
        $service = app(SatriaService::class);
        $service->notifyUser($eventId, $shipment->id, $courier->id, 'COURIER', 'DELIVERY_ASSIGNED', '');
        $service->notifyUser($eventId, $shipment->id, $order->customer_id, 'BUYER', 'OUT_FOR_DELIVERY', '');

        $assignment = DB::table('notifications')->where('template_key', 'DELIVERY_ASSIGNED')->latest('id')->first();
        $delivery = DB::table('notifications')->where('template_key', 'OUT_FOR_DELIVERY')->latest('id')->first();
        $this->assertSame('LIVE', $assignment->delivery_mode);
        $this->assertStringContainsString('Penugasan Pengiriman Baru', $assignment->message_text);
        $this->assertStringContainsString('/courier-deliveries', $assignment->message_text);
        $this->assertStringContainsString($shipment->awb, $delivery->message_text);
        $this->assertStringContainsString($order->recipient_name, $delivery->message_text);
        $this->assertStringContainsString($order->destination_address_snapshot, $delivery->message_text);
        $this->withToken((string) config('satria.internal_token'))
            ->postJson("/api/v1/internal/notifications/{$assignment->id}/claim")
            ->assertOk()->assertJsonPath('notification.sender_profile', 'OPS_ADMIN')
            ->assertJsonPath('notification.phone', '6281200000002');
        $this->postJson("/api/v1/internal/notifications/{$delivery->id}/claim")
            ->assertOk()->assertJsonPath('notification.sender_profile', 'COURIER')
            ->assertJsonPath('notification.phone', '6281200000001');
    }

    public function test_dummy_recipient_stays_mock_even_with_valid_phone_and_legacy_live_queue(): void
    {
        config([
            'satria.telegram_mode' => 'LIVE',
            'satria.n8n_webhook_url' => '',
            'satria.telegram_live_recipient_emails' => ['afrien@anteraja.id'],
        ]);
        $shipment = DB::table('shipments')->orderBy('id')->first();
        $customerId = (int) DB::table('orders')->where('id', $shipment->order_id)->value('customer_id');
        DB::table('users')->where('id', $customerId)->update(['phone' => '081200000001']);
        $service = app(SatriaService::class);
        $eventId = $service->event($shipment->id, null, 'DEMO_NOTIFICATION_CHECK', $shipment->status);
        $service->notifyUser($eventId, $shipment->id, $customerId, 'BUYER', 'OUT_FOR_DELIVERY', '');
        $notification = DB::table('notifications')->where('tracking_event_id', $eventId)->first();
        $this->assertSame('MOCK', $notification->delivery_mode);
        $this->assertSame('SIMULATED', $notification->status);

        DB::table('notifications')->where('id', $notification->id)->update([
            'delivery_mode' => 'LIVE', 'status' => 'QUEUED',
        ]);
        $this->withToken((string) config('satria.internal_token'))
            ->postJson("/api/v1/internal/notifications/{$notification->id}/claim")
            ->assertOk()->assertJsonPath('notification.delivery_mode', 'MOCK')
            ->assertJsonPath('notification.phone', null)
            ->assertJsonPath('notification.peer_id', null);
        $this->assertSame('MOCK', DB::table('notifications')->where('id', $notification->id)->value('delivery_mode'));
        $operatorId = DB::table('user_roles')->where('role', 'HUB_OPERATOR')
            ->where('hub_id', $shipment->delivery_hub_id)->value('user_id');
        $operator = User::findOrFail($operatorId);
        $this->actingAs($operator)->getJson("/api/v1/shipments/{$shipment->id}/contact-options")
            ->assertOk()->assertJsonPath('data.contact_allowed', false)
            ->assertJsonPath('data.recipient_phone', null)
            ->assertJsonPath('data.phone_url', null);
        $this->actingAs($operator)->postJson("/api/v1/shipments/{$shipment->id}/contact-opened", [
            'channel' => 'PHONE',
        ])->assertUnprocessable();
        $customerEmail = DB::table('users')->where('id', $customerId)->value('email');
        config(['satria.telegram_live_recipient_emails' => [strtolower($customerEmail)]]);
        DB::table('orders')->where('id', $shipment->order_id)->update(['recipient_phone' => '+6281200000001']);
        $this->actingAs($operator)->getJson("/api/v1/shipments/{$shipment->id}/contact-options")
            ->assertOk()->assertJsonPath('data.contact_allowed', true)
            ->assertJsonPath('data.recipient_phone', '+6281200000001');
    }

    public function test_buyer_can_confirm_own_reschedule_once(): void
    {
        $issue = DB::table('shipment_issues')->where('decision', 'RESCHEDULE')->orderBy('id')->first();
        $shipment = DB::table('shipments')->where('id', $issue->shipment_id)->first();
        $order = DB::table('orders')->where('id', $shipment->order_id)->first();
        DB::table('shipments')->where('id', $shipment->id)->update(['status' => 'WAITING_REDELIVERY']);
        $otherBuyer = User::where('email', 'siti.nurhaliza@anteraja.id')->firstOrFail();
        $this->actingAs($otherBuyer)->postJson("/api/v1/tracking/{$shipment->awb}/confirm-reschedule")
            ->assertNotFound();
        $buyer = User::findOrFail($order->customer_id);
        $this->actingAs($buyer)->postJson("/api/v1/tracking/{$shipment->awb}/confirm-reschedule")
            ->assertOk()->assertJsonPath('data.confirmed', true);
        $this->postJson("/api/v1/tracking/{$shipment->awb}/confirm-reschedule")->assertOk();
        $this->assertSame(1, DB::table('tracking_events')->where('shipment_id', $shipment->id)
            ->where('event_type', 'BUYER_CONFIRMED_RESCHEDULE')->count());
        $this->getJson("/api/v1/tracking/{$shipment->awb}")
            ->assertOk()->assertJsonPath('data.issue.reschedule_confirmed', true);
    }

    public function test_notification_outbox_requires_service_token_and_recovers_stale_claim(): void
    {
        Http::fake();
        config(['satria.n8n_webhook_url' => 'https://n8n.example.invalid/webhook']);
        $admin = User::where('email', 'dimas.pratama@anteraja.id')->firstOrFail();
        $orderId = DB::table('orders')->where('checkout_key', '7c24c5e1-45a8-43f5-9d36-84f2d6e31901')->value('id');
        $this->actingAs($admin)->postJson("/api/v1/admin/orders/{$orderId}/approve", [])
            ->assertOk();
        $notification = DB::table('notifications')->where('template_key', 'AWB_GENERATED')->first();
        $this->assertNotNull($notification);
        $this->assertSame('QUEUED', $notification->status);
        $this->assertNull(DB::table('notifications')->where('template_key', 'PICKUP_READY')->first());

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
            ->assertOk()->assertJsonFragment(['id' => $notification->id]);
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
