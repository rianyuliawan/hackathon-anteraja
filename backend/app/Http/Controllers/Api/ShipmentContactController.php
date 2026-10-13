<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\SatriaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ShipmentContactController extends Controller
{
    public function __construct(private readonly SatriaService $satria) {}

    public function contactOptions(Request $request, int $id): JsonResponse
    {
        $shipment = DB::table('shipments')->where('id', $id)->first();
        abort_if($shipment === null, 404);
        $this->authorizeContact($request->user(), $shipment);
        $order = DB::table('orders')->where('id', $shipment->order_id)->first();
        $buyer = DB::table('users')->where('id', $order->customer_id)->first();
        $link = DB::table('telegram_links')->where('user_id', $order->customer_id)
            ->whereNull('revoked_at')->first();
        $samePerson = $buyer->phone !== null && $buyer->phone === $order->recipient_phone;
        $username = $samePerson ? $link?->username : null;
        $telegramUrl = $username && preg_match('/^[A-Za-z0-9_]{5,32}$/', $username)
            ? 'https://t.me/'.$username : null;

        return response()->json(['data' => [
            'awb' => $shipment->awb,
            'recipient_name' => $order->recipient_name,
            'recipient_phone' => $order->recipient_phone,
            'phone_url' => 'tel:'.preg_replace('/[^+0-9]/', '', $order->recipient_phone),
            'telegram_url' => $telegramUrl,
            'telegram_note' => $telegramUrl ? 'Akun pembeli terhubung; chat manual.'
                : 'Chat Telegram manual tidak tersedia. Hubungi nomor penerima lewat telepon.',
        ]]);
    }

    public function contactOpened(Request $request, int $id): JsonResponse
    {
        $input = $request->validate(['channel' => ['required', Rule::in(['PHONE', 'TELEGRAM'])]]);
        $shipment = DB::table('shipments')->where('id', $id)->first();
        abort_if($shipment === null, 404);
        $this->authorizeContact($request->user(), $shipment);
        if ($input['channel'] === 'TELEGRAM') {
            $options = $this->contactOptions($request, $id)->getData(true)['data'];
            abort_if($options['telegram_url'] === null, 422, 'Chat Telegram manual tidak tersedia.');
        }
        $eventId = $this->satria->event($shipment->id, $request->user()->id,
            'CONTACT_OPENED', $shipment->status, ['channel' => $input['channel']]);

        return response()->json(['data' => ['event_id' => $eventId, 'channel' => $input['channel']]]);
    }

    public function pickupPhoto(Request $request, int $id): StreamedResponse
    {
        $shipment = DB::table('shipments')->where('id', $id)->first();
        abort_if($shipment === null, 404);
        $user = $request->user();
        abort_unless($user->active, 403, 'Akun tidak aktif.');

        $pickupAssignment = DB::table('pickup_assignments as a')
            ->join('pickup_tasks as t', 't.id', '=', 'a.pickup_task_id')
            ->where('t.shipment_id', $id)
            ->where('a.status', 'COMPLETED')
            ->whereNotNull('a.pickup_photo_ref')
            ->select('a.courier_user_id', 'a.pickup_photo_ref')
            ->orderByDesc('a.id')->first();
        abort_if($pickupAssignment === null, 404, 'Foto pickup belum tersedia.');

        $isAssignedDeliveryCourier = DB::table('run_shipments as rs')
            ->join('delivery_runs as r', 'r.id', '=', 'rs.run_id')
            ->where('rs.shipment_id', $id)
            ->where('r.courier_user_id', $user->id)->exists();
        $allowed = $this->satria->hasRole($user, 'OPS_ADMIN')
            || $this->satria->hasRole($user, 'HUB_OPERATOR', $shipment->origin_hub_id)
            || $this->satria->hasRole($user, 'HUB_OPERATOR', $shipment->delivery_hub_id)
            || ($pickupAssignment->courier_user_id === $user->id && $this->satria->hasRole($user, 'COURIER'))
            || ($isAssignedDeliveryCourier && $this->satria->hasRole($user, 'COURIER'));
        abort_unless($allowed, 403, 'Foto pickup hanya untuk petugas terkait.');
        abort_unless(Storage::disk('local')->exists($pickupAssignment->pickup_photo_ref), 404,
            'Berkas foto pickup tidak ditemukan.');

        return Storage::disk('local')->response($pickupAssignment->pickup_photo_ref, null, [
            'Cache-Control' => 'private, no-store',
        ]);
    }

    private function authorizeContact(User $user, object $shipment): void
    {
        abort_unless($user->active, 403, 'Akun tidak aktif.');
        if ($this->satria->hasRole($user, 'OPS_ADMIN') ||
            $this->satria->hasRole($user, 'HUB_OPERATOR', $shipment->delivery_hub_id)) {
            return;
        }
        $assigned = DB::table('run_shipments as rs')
            ->join('delivery_runs as r', 'r.id', '=', 'rs.run_id')
            ->where('rs.shipment_id', $shipment->id)
            ->where('r.courier_user_id', $user->id)
            ->where('r.status', 'OUT_FOR_DELIVERY')
            ->where('rs.status', 'HANDED_OVER')->exists();
        abort_unless($assigned, 403, 'Hanya petugas terkait yang dapat melihat kontak penerima.');
    }
}
