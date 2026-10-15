<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DemoPickupPhoto;
use App\Services\SatriaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

class CatalogController extends Controller
{
    public function __construct(
        private readonly SatriaService $satria,
        private readonly DemoPickupPhoto $demoPickupPhoto
    ) {}

    public function products(Request $request): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'BUYER');
        $rows = DB::table('products as p')
            ->join('seller_profiles as s', 's.user_id', '=', 'p.seller_user_id')
            ->where('p.active', true)->where('s.active', true)
            ->select('p.*', 's.store_name')->orderBy('p.id')->get();

        return response()->json(['data' => $rows]);
    }

    public function product(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'BUYER');
        $row = DB::table('products as p')
            ->join('seller_profiles as s', 's.user_id', '=', 'p.seller_user_id')
            ->where('p.active', true)->where('s.active', true)->where('p.id', $id)
            ->select('p.*', 's.store_name')->first();
        abort_if($row === null, 404);

        return response()->json(['data' => $row]);
    }

    public function checkout(Request $request): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'BUYER');
        $input = $request->validate([
            'checkout_key' => ['required', 'uuid'],
            'items' => ['required', 'array', 'min:1', 'max:20'],
            'items.*.product_id' => ['required', 'integer', 'distinct'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:20'],
            'recipient' => ['required', 'array'],
            'recipient.name' => ['required', 'string', 'max:160'],
            'recipient.phone' => ['required', 'string', 'max:30'],
            'recipient.address' => ['required', 'string', 'max:1000'],
            'recipient.postcode' => ['required', 'regex:/^[0-9]{5}$/'],
            'recipient.latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'recipient.longitude' => ['nullable', 'numeric', 'between:-180,180'],
        ]);
        abort_if(
            array_key_exists('latitude', $input['recipient']) !== array_key_exists('longitude', $input['recipient']),
            422,
            'Latitude dan longitude harus diisi bersama.'
        );

        $order = DB::transaction(function () use ($request, $input): object {
            DB::select('SELECT pg_advisory_xact_lock(hashtext(?))', [$input['checkout_key']]);
            $existing = DB::table('orders')->where('checkout_key', $input['checkout_key'])
                ->lockForUpdate()->first();
            if ($existing !== null) {
                abort_unless($existing->customer_id === $request->user()->id, 409, 'Kunci checkout telah dipakai.');
                $oldItems = DB::table('order_items')->where('order_id', $existing->id)
                    ->orderBy('product_id')->get(['product_id', 'quantity'])
                    ->map(fn ($row) => [(int) $row->product_id, (int) $row->quantity])->toArray();
                $newItems = collect($input['items'])->map(fn ($item) => [
                    (int) $item['product_id'], (int) $item['quantity'],
                ])->sortBy('0')->values()->toArray();
                abort_if(
                    $oldItems !== $newItems ||
                    $existing->recipient_name !== $input['recipient']['name'] ||
                    $existing->recipient_phone !== $input['recipient']['phone'] ||
                    $existing->destination_address_snapshot !== $input['recipient']['address'] ||
                    $existing->destination_postcode !== $input['recipient']['postcode'] ||
                    ($existing->destination_latitude === null ? null : round((float) $existing->destination_latitude, 6)) !==
                        (isset($input['recipient']['latitude']) ? round((float) $input['recipient']['latitude'], 6) : null) ||
                    ($existing->destination_longitude === null ? null : round((float) $existing->destination_longitude, 6)) !==
                        (isset($input['recipient']['longitude']) ? round((float) $input['recipient']['longitude'], 6) : null),
                    409,
                    'Kunci checkout sudah digunakan untuk data berbeda.'
                );

                return $existing;
            }

            $coverage = DB::table('postal_coverages')->where('postcode', $input['recipient']['postcode'])
                ->where('purpose', 'DELIVERY')->where('active', true)->first();
            abort_if($coverage === null, 422, 'Kode pos penerima belum tercakup di demo Jakarta.');

            $ids = collect($input['items'])->pluck('product_id')->all();
            $products = DB::table('products')->whereIn('id', $ids)->where('active', true)
                ->get()->keyBy('id');
            abort_unless($products->count() === count($ids), 422, 'Ada produk yang tidak tersedia.');
            $sellerIds = $products->pluck('seller_user_id')->unique();
            abort_unless($sellerIds->count() === 1, 422, 'Satu checkout hanya untuk satu toko.');
            $sellerId = (int) $sellerIds->first();
            abort_unless(DB::table('seller_profiles')->where('user_id', $sellerId)
                ->where('active', true)->exists(), 422, 'Toko sedang tidak aktif.');
            $location = DB::table('seller_locations')->where('seller_user_id', $sellerId)
                ->where('active', true)->orderBy('id')->first();
            abort_if($location === null, 422, 'Alamat pickup toko belum tersedia.');

            $subtotal = 0;
            $weight = 0;
            $length = 0;
            $width = 0;
            $height = 0;
            foreach ($input['items'] as $item) {
                $product = $products[$item['product_id']];
                $quantity = (int) $item['quantity'];
                $subtotal += (float) $product->price * $quantity;
                $weight += (int) $product->weight_grams * $quantity;
                $length = max($length, (int) $product->length_mm);
                $width = max($width, (int) $product->width_mm);
                $height += (int) $product->height_mm * $quantity;
            }

            do {
                $orderNo = 'INV-'.now()->format('Ymd').'-'.str_pad((string) random_int(0, 99999999), 8, '0', STR_PAD_LEFT);
            } while (DB::table('orders')->where('order_no', $orderNo)->exists());
            $id = DB::table('orders')->insertGetId([
                'order_no' => $orderNo,
                'checkout_key' => $input['checkout_key'],
                'channel' => 'CATALOG',
                'customer_id' => $request->user()->id,
                'seller_user_id' => $sellerId,
                'seller_location_id' => $location->id,
                'status' => 'PENDING_APPROVAL',
                'origin_address_snapshot' => $location->address,
                'origin_contact_snapshot' => $location->contact_name,
                'origin_postcode' => $location->postcode,
                'destination_address_snapshot' => $input['recipient']['address'],
                'destination_latitude' => $input['recipient']['latitude'] ?? null,
                'destination_longitude' => $input['recipient']['longitude'] ?? null,
                'recipient_name' => $input['recipient']['name'],
                'recipient_phone' => $input['recipient']['phone'],
                'destination_postcode' => $input['recipient']['postcode'],
                'estimated_weight_grams' => $weight,
                'estimated_length_mm' => $length,
                'estimated_width_mm' => $width,
                'estimated_height_mm' => $height,
                'subtotal' => $subtotal,
                'shipping_fee' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            foreach ($input['items'] as $item) {
                $product = $products[$item['product_id']];
                DB::table('order_items')->insert([
                    'order_id' => $id,
                    'product_id' => $product->id,
                    'quantity' => $item['quantity'],
                    'product_name_snapshot' => $product->name,
                    'price_snapshot' => $product->price,
                ]);
            }

            return DB::table('orders')->where('id', $id)->first();
        });

        return response()->json(['data' => $this->satria->orderPayload($order)], 201);
    }

    public function myOrders(Request $request): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'BUYER');
        $orders = DB::table('orders')->where('customer_id', $request->user()->id)
            ->orderByDesc('created_at')->limit(100)->get()
            ->map(fn ($order) => $this->satria->orderPayload($order));

        return response()->json(['data' => $orders]);
    }

    public function myOrder(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'BUYER');
        $order = DB::table('orders')->where('id', $id)->where('customer_id', $request->user()->id)->first();
        abort_if($order === null, 404);

        return response()->json(['data' => $this->satria->orderPayload($order)]);
    }

    public function trackingPreview(Request $request, string $awb): JsonResponse
    {
        $shipment = DB::table('shipments as s')
            ->leftJoin('hubs as origin', 'origin.id', '=', 's.origin_hub_id')
            ->leftJoin('hubs as destination', 'destination.id', '=', 's.delivery_hub_id')
            ->where('s.awb', $awb)
            ->first([
                's.id', 's.awb', 's.status', 's.updated_at',
                'origin.name as origin', 'destination.name as destination',
            ]);
        abort_if($shipment === null, 404, 'Resi tidak ditemukan.');

        $latestUpdate = DB::table('tracking_events as event')
            ->leftJoin('tracking_event_time_corrections as correction', 'correction.tracking_event_id', '=', 'event.id')
            ->where('event.shipment_id', $shipment->id)
            ->orderByRaw('COALESCE(correction.corrected_occurred_at, event.occurred_at) DESC')
            ->orderByDesc('event.id')
            ->value(DB::raw('COALESCE(correction.corrected_occurred_at, event.occurred_at)'));

        return response()->json(['data' => [
            'awb' => $shipment->awb,
            'status' => $shipment->status,
            'origin' => $shipment->origin,
            'destination' => $shipment->destination,
            'latest_update' => $latestUpdate ?? $shipment->updated_at,
        ]]);
    }

    public function tracking(Request $request, string $awb): JsonResponse
    {
        $shipment = DB::table('shipments')->where('awb', $awb)->first();
        abort_if($shipment === null, 404, 'Resi tidak ditemukan.');

        $order = DB::table('orders')->where('id', $shipment->order_id)->first();
        $isCustomer = (int) $order->customer_id === (int) $request->user()->id;
        $events = DB::table('tracking_events as e')
            ->leftJoin('hubs as h', 'h.id', '=', 'e.hub_id')
            ->leftJoin('users as actor', 'actor.id', '=', 'e.actor_user_id')
            ->leftJoin('tracking_event_time_corrections as correction', 'correction.tracking_event_id', '=', 'e.id')
            ->where('e.shipment_id', $shipment->id)
            ->orderByRaw('COALESCE(correction.corrected_occurred_at, e.occurred_at)')
            ->orderBy('e.id')
            ->get(['e.id', 'e.event_type', 'e.status_after', 'e.details',
                'h.name as hub_name', 'actor.name as actor_name',
                DB::raw('COALESCE(correction.corrected_occurred_at, e.occurred_at) AS occurred_at')])
            ->map(function ($event) use ($isCustomer): array {
                $details = $isCustomer ? json_decode((string) $event->details, true) : null;
                $details = is_array($details) ? $details : [];
                $visibleDetails = [];
                if ($isCustomer) {
                    foreach (['reason', 'failure_reason', 'attempt_no', 'scheduled_at'] as $key) {
                        if (isset($details[$key]) && (is_string($details[$key]) || is_int($details[$key]))) {
                            $visibleDetails[$key] = $details[$key];
                        }
                    }
                }

                return [
                    'id' => $event->id,
                    'event_type' => $event->event_type,
                    'status_after' => $event->status_after,
                    'occurred_at' => $event->occurred_at,
                    'hub_name' => $event->hub_name,
                    'actor_name' => $isCustomer && in_array($event->event_type, [
                        'PICKUP_ACCEPTED', 'PICKED_UP', 'DELIVERY_RUN_ACCEPTED',
                        'DELIVERY_RUN_REJECTED', 'DELIVERY_ASSIGNMENT_REJECTED',
                        'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED',
                    ], true) ? $event->actor_name : null,
                    'details' => $visibleDetails,
                ];
            });
        $parcel = DB::table('parcels')->where('shipment_id', $shipment->id)
            ->orderBy('parcel_no')->first(['weight_grams', 'length_mm', 'width_mm', 'height_mm']);
        $issue = DB::table('shipment_issues')->where('shipment_id', $shipment->id)
            ->orderByDesc('created_at')->orderByDesc('id')->first();
        $attempt = $issue ? DB::table('delivery_attempts')->where('id', $issue->delivery_attempt_id)
            ->first(['failure_reason', 'attempted_at']) : null;
        $attempts = $isCustomer ? DB::table('delivery_attempts as attempt')
            ->leftJoin('run_shipments as stop', 'stop.id', '=', 'attempt.run_shipment_id')
            ->leftJoin('delivery_runs as run', 'run.id', '=', 'stop.run_id')
            ->leftJoin('users as courier', 'courier.id', '=', 'run.courier_user_id')
            ->where('attempt.shipment_id', $shipment->id)
            ->orderBy('attempt.attempt_no')
            ->get(['attempt.attempt_no', 'attempt.result', 'attempt.failure_reason',
                'attempt.recipient_name', 'attempt.notes', 'attempt.attempted_at',
                'courier.name as courier_name']) : collect();
        $pickupPhoto = $isCustomer
            ? DB::table('pickup_assignments as a')->join('pickup_tasks as t', 't.id', '=', 'a.pickup_task_id')
                ->where('t.shipment_id', $shipment->id)->where('a.status', 'COMPLETED')
                ->whereNotNull('a.pickup_photo_ref')->orderByDesc('a.id')
                ->first(['a.pickup_photo_ref', 'a.picked_up_at'])
            : null;
        if ($pickupPhoto?->pickup_photo_ref === DemoPickupPhoto::PATH) {
            $this->demoPickupPhoto->ensureStored();
        }
        $deliveryPhoto = $isCustomer && $shipment->status === 'DELIVERED'
            ? DB::table('delivery_attempts')->where('shipment_id', $shipment->id)
                ->where('result', 'DELIVERED')->whereNotNull('delivery_photo_ref')
                ->orderByDesc('attempt_no')->first(['delivery_photo_ref', 'attempted_at'])
            : null;
        $pickupDetails = $pickupPhoto
            ? DB::table('tracking_events')->where('shipment_id', $shipment->id)
                ->where('event_type', 'PICKED_UP')->orderByDesc('id')->value('details')
            : null;
        $deliveryDetails = $deliveryPhoto
            ? DB::table('tracking_events')->where('shipment_id', $shipment->id)
                ->where('event_type', 'DELIVERED')->orderByDesc('id')->value('details')
            : null;
        $pickupCapturedAt = $pickupDetails ? json_decode($pickupDetails, true)['photo_captured_at'] ?? null : null;
        $deliveryCapturedAt = $deliveryDetails ? json_decode($deliveryDetails, true)['photo_captured_at'] ?? null : null;

        return response()->json(['data' => [
            'awb' => $shipment->awb,
            'status' => $shipment->status,
            'created_at' => $shipment->created_at,
            'delivered_at' => $shipment->delivered_at,
            'latest_update' => $events->last()['occurred_at'] ?? $shipment->updated_at,
            'origin' => DB::table('hubs')->where('id', $shipment->origin_hub_id)->value('name'),
            'destination' => DB::table('hubs')->where('id', $shipment->delivery_hub_id)->value('name'),
            'parcel' => $parcel,
            'is_customer' => $isCustomer,
            'sender_name' => $isCustomer ? $order->origin_contact_snapshot : null,
            'recipient_name' => $isCustomer ? $order->recipient_name : null,
            'origin_address' => $isCustomer ? $order->origin_address_snapshot : null,
            'destination_address' => $isCustomer ? $order->destination_address_snapshot : null,
            'issue' => $issue ? [
                'status' => $issue->status,
                'decision' => $issue->decision,
                'failure_reason' => $isCustomer ? $attempt?->failure_reason : null,
                'attempted_at' => $attempt?->attempted_at,
                'scheduled_redelivery_at' => $isCustomer ? $issue->scheduled_redelivery_at : null,
                'reschedule_confirmed' => $isCustomer && DB::table('tracking_events')
                    ->where('shipment_id', $shipment->id)->where('event_type', 'BUYER_CONFIRMED_RESCHEDULE')
                    ->where('details->issue_id', $issue->id)->exists(),
            ] : null,
            'pickup_photo_available' => $pickupPhoto !== null && Storage::disk('local')->exists($pickupPhoto->pickup_photo_ref),
            'pickup_photo_taken_at' => $pickupPhoto ? $pickupCapturedAt ?? $pickupPhoto->picked_up_at : null,
            'proof_available' => $deliveryPhoto !== null && Storage::disk('local')->exists($deliveryPhoto->delivery_photo_ref),
            'delivery_photo_taken_at' => $deliveryPhoto ? $deliveryCapturedAt ?? $deliveryPhoto->attempted_at : null,
            'recipient_confirmed' => $isCustomer && DB::table('tracking_events')
                ->where('shipment_id', $shipment->id)->where('event_type', 'BUYER_CONFIRMED_RECEIVED')->exists(),
            'attempts' => $attempts,
            'events' => $events,
        ]]);
    }

    public function pickupPhotoByAwb(Request $request, string $awb): Response
    {
        $shipment = DB::table('shipments')->where('awb', $awb)->first();
        abort_if($shipment === null, 404, 'Resi tidak ditemukan.');
        $order = DB::table('orders')->where('id', $shipment->order_id)->first();
        abort_unless($order !== null && (int) $order->customer_id === (int) $request->user()->id, 403);

        $photoRef = DB::table('pickup_assignments as a')->join('pickup_tasks as t', 't.id', '=', 'a.pickup_task_id')
            ->where('t.shipment_id', $shipment->id)->where('a.status', 'COMPLETED')
            ->whereNotNull('a.pickup_photo_ref')->orderByDesc('a.id')->value('a.pickup_photo_ref');
        abort_if($photoRef === null, 404, 'Foto pickup belum tersedia.');
        if ($photoRef === DemoPickupPhoto::PATH) {
            $this->demoPickupPhoto->ensureStored();
        }
        abort_unless(Storage::disk('local')->exists($photoRef), 404, 'Berkas foto pickup tidak ditemukan.');

        return Storage::disk('local')->response($photoRef, null, ['Cache-Control' => 'private, no-store']);
    }

    public function deliveryPhotoByAwb(Request $request, string $awb): Response
    {
        $orderId = DB::table('shipments')->where('awb', $awb)->value('order_id');
        abort_if($orderId === null, 404, 'Resi tidak ditemukan.');

        return $this->deliveryPhoto($request, (int) $orderId);
    }

    public function confirmRescheduleByAwb(Request $request, string $awb): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'BUYER');
        $shipment = DB::table('shipments as shipment')->join('orders as order', 'order.id', '=', 'shipment.order_id')
            ->where('shipment.awb', $awb)->where('order.customer_id', $request->user()->id)
            ->first(['shipment.id', 'shipment.status', 'shipment.delivery_hub_id']);
        abort_if($shipment === null, 404, 'Resi tidak ditemukan pada akun ini.');
        $issue = DB::table('shipment_issues')->where('shipment_id', $shipment->id)
            ->orderByDesc('id')->first();
        abort_unless($issue !== null && $issue->decision === 'RESCHEDULE' &&
            $issue->scheduled_redelivery_at !== null &&
            in_array($shipment->status, ['WAITING_REDELIVERY', 'DELIVERY_ASSIGNED'], true),
            409, 'Jadwal pengantaran ulang belum tersedia untuk dikonfirmasi.');
        $confirmed = DB::table('tracking_events')->where('shipment_id', $shipment->id)
            ->where('event_type', 'BUYER_CONFIRMED_RESCHEDULE')
            ->where('details->issue_id', $issue->id)->exists();
        if (! $confirmed) {
            $this->satria->event($shipment->id, $request->user()->id, 'BUYER_CONFIRMED_RESCHEDULE',
                $shipment->status, ['issue_id' => $issue->id, 'scheduled_at' => $issue->scheduled_redelivery_at],
                $shipment->delivery_hub_id);
        }

        return response()->json(['data' => ['confirmed' => true, 'awb' => $awb]]);
    }

    public function confirmReceivedByAwb(Request $request, string $awb): JsonResponse
    {
        $orderId = DB::table('shipments')->where('awb', $awb)->value('order_id');
        abort_if($orderId === null, 404, 'Resi tidak ditemukan.');

        return $this->confirmReceived($request, (int) $orderId);
    }

    public function deliveryPhoto(Request $request, int $id): Response
    {
        $this->satria->requireRole($request->user(), 'BUYER');
        $order = DB::table('orders')->where('id', $id)->where('customer_id', $request->user()->id)->first();
        abort_if($order === null, 404);
        $shipment = DB::table('shipments')->where('order_id', $order->id)->first();
        abort_if($shipment === null || $shipment->status !== 'DELIVERED', 404);
        $photoRef = DB::table('delivery_attempts')->where('shipment_id', $shipment->id)
            ->where('result', 'DELIVERED')->orderByDesc('attempt_no')->value('delivery_photo_ref');
        abort_if($photoRef === null || ! Storage::disk('local')->exists($photoRef), 404);

        return Storage::disk('local')->response($photoRef);
    }

    public function confirmReceived(Request $request, int $id): JsonResponse
    {
        $this->satria->requireRole($request->user(), 'BUYER');
        $order = DB::table('orders')->where('id', $id)->where('customer_id', $request->user()->id)->first();
        abort_if($order === null, 404);
        $shipment = DB::table('shipments')->where('order_id', $order->id)->first();
        abort_if($shipment === null || $shipment->status !== 'DELIVERED', 409, 'Paket belum tercatat terkirim.');
        $exists = DB::table('tracking_events')->where('shipment_id', $shipment->id)
            ->where('event_type', 'BUYER_CONFIRMED_RECEIVED')->exists();
        if (! $exists) {
            $this->satria->event($shipment->id, $request->user()->id, 'BUYER_CONFIRMED_RECEIVED', 'DELIVERED');
        }

        return response()->json(['data' => ['confirmed' => true, 'awb' => $shipment->awb]]);
    }
}
