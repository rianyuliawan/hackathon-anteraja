<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $request->merge(['email' => Str::lower(trim((string) $request->input('email', '')))]);
        $input = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'email' => [
                'required', 'email', 'max:255', 'unique:users,email',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if (DB::table('users')->whereRaw('LOWER(email) = ?', [Str::lower((string) $value)])
                        ->where('email', '!=', $value)->exists()) {
                        $fail('Email sudah terdaftar. Silakan masuk dengan akun tersebut.');
                    }
                },
            ],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'phone' => ['required', 'string', 'max:30'],
            'default_address' => ['required', 'string', 'max:1000'],
            'default_postcode' => ['required', 'regex:/^[0-9]{5}$/'],
        ], [
            'email.unique' => 'Email sudah terdaftar. Silakan masuk dengan akun tersebut.',
        ]);

        $user = DB::transaction(function () use ($input): User {
            $user = User::create([
                'name' => $input['name'],
                'email' => Str::lower($input['email']),
                'password' => Hash::make($input['password']),
                'phone' => $input['phone'],
                'default_address' => $input['default_address'],
                'default_postcode' => $input['default_postcode'],
            ]);
            DB::table('user_roles')->insert([
                'user_id' => $user->id, 'role' => 'BUYER', 'created_at' => now(),
            ]);

            return $user;
        });

        Auth::login($user);
        $request->session()->regenerate();

        return response()->json(['data' => $this->identity($user)], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $input = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::attempt(['email' => Str::lower($input['email']), 'password' => $input['password'], 'active' => true])) {
            throw ValidationException::withMessages(['email' => 'Email atau kata sandi tidak cocok.']);
        }

        $request->session()->regenerate();

        return response()->json(['data' => $this->identity($request->user())]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Berhasil keluar.']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->identity($request->user())]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $input = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:160'],
            'phone' => ['sometimes', 'required', 'string', 'max:30'],
            'default_address' => ['sometimes', 'required', 'string', 'max:1000'],
            'default_postcode' => ['sometimes', 'required', 'regex:/^[0-9]{5}$/'],
        ]);
        $request->user()->update($input);

        return response()->json(['data' => $this->identity($request->user()->fresh())]);
    }

    public function createPairing(Request $request): JsonResponse
    {
        $request->validate(['consent' => ['required', 'accepted']]);
        $user = $request->user();
        $linked = DB::table('telegram_links')->where('user_id', $user->id)
            ->whereNull('revoked_at')->exists();
        abort_if($linked, 409, 'Telegram sudah terhubung. Cabut dahulu untuk mengganti akun.');

        $code = 'SATRIA-'.strtoupper(Str::random(8));
        DB::table('telegram_pairing_requests')->where('user_id', $user->id)
            ->whereNull('consumed_at')->update(['consumed_at' => now()]);
        DB::table('telegram_pairing_requests')->insert([
            'user_id' => $user->id,
            'code_hash' => hash('sha256', $code),
            'expires_at' => now()->addMinutes(10),
            'created_at' => now(),
        ]);

        return response()->json(['data' => [
            'code' => $code,
            'expires_at' => now()->addMinutes(10)->toIso8601String(),
            'instruction' => 'Kirim kode ini dari chat pribadi akun Telegram Anda ke akun demo yang ditentukan tim.',
        ]]);
    }

    public function revokeTelegram(Request $request): JsonResponse
    {
        DB::table('telegram_links')->where('user_id', $request->user()->id)
            ->whereNull('revoked_at')->update(['revoked_at' => now(), 'updated_at' => now()]);

        return response()->json(['message' => 'Tautan Telegram dicabut.']);
    }

    public function notifications(Request $request): JsonResponse
    {
        $rows = DB::table('notifications as n')
            ->join('notification_targets as t', 't.id', '=', 'n.target_id')
            ->where('t.user_id', $request->user()->id)
            ->select('n.id', 'n.message_text', 'n.template_key', 'n.status', 'n.delivery_mode',
                'n.created_at', 'n.sent_at', 'n.last_error', 'n.shipment_id')
            ->orderByDesc('n.created_at')->limit(50)->get();

        return response()->json(['data' => $rows]);
    }

    private function identity(User $user): array
    {
        $assignments = DB::table('user_roles')->where('user_id', $user->id)
            ->orderByRaw("CASE role WHEN 'OPS_ADMIN' THEN 1 WHEN 'HUB_OPERATOR' THEN 2 WHEN 'COURIER' THEN 3 WHEN 'SELLER' THEN 4 ELSE 5 END")
            ->get(['role', 'hub_id']);
        $roles = $assignments->pluck('role')->unique()->values()->toArray();
        $hubId = $assignments->firstWhere('role', 'HUB_OPERATOR')?->hub_id;
        $userData = $user->only(['id', 'name', 'email', 'phone', 'default_address', 'default_postcode', 'active']);
        $userData['hub_id'] = $hubId;
        $userData['hub_name'] = $hubId ? DB::table('hubs')->where('id', $hubId)->value('name') : null;
        $userData['telegram_linked'] = DB::table('telegram_links')->where('user_id', $user->id)
            ->whereNull('revoked_at')->exists();

        return [
            'user' => $userData,
            'roles' => $roles,
            'primary_role' => $roles[0] ?? null,
            'role_assignments' => $assignments,
        ];
    }
}
