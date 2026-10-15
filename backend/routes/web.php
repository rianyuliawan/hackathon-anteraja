<?php

use App\Http\Controllers\Api\AuthController;
use Illuminate\Support\Facades\Route;

Route::get('/', fn () => response()->json([
    'app' => 'Anteraja API', 'api' => '/api/v1', 'status' => 'ok',
]));

Route::get('/sanctum/csrf-cookie', fn () => response()->json(['csrf_token' => csrf_token()])->header('Cache-Control', 'no-store'));
Route::post('/register', [AuthController::class, 'register']);
Route::get('/login', fn () => redirect(rtrim((string) config('satria.ops_public_url'), '/').'/masuk'))->name('login');
Route::post('/login', [AuthController::class, 'login']);
Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth');
