<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\SatriaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class CatalogController extends Controller
{
    public function __construct(private readonly SatriaService $satria) {}

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

            $orderNo = 'ORD'.now()->format('ymd').strtoupper(Str::random(8));
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

    public function tracking(string $awb): JsonResponse
    {
        $shipment = DB::table('shipments')->where('awb', $awb)->first();
        abort_if($shipment === null, 404, 'Resi tidak ditemukan.');
        $events = DB::table('tracking_events as e')->leftJoin('hubs as h', 'h.id', '=', 'e.hub_id')
            ->where('e.shipment_id', $shipment->id)
            ->orderBy('e.occurred_at')->orderBy('e.id')
            ->get(['e.event_type', 'e.status_after', 'e.occurred_at', 'h.name as hub_name']);

        return response()->json(['data' => [
            'awb' => $shipment->awb,
            'status' => $shipment->status,
            'created_at' => $shipment->created_at,
            'delivered_at' => $shipment->delivered_at,
            'events' => $events,
        ]]);
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
