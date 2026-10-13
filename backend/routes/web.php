<?php

use App\Http\Controllers\Api\AuthController;
use Illuminate\Support\Facades\Route;

Route::get('/', fn () => response()->json([
    'app' => 'Satria Hackathon Demo', 'api' => '/api/v1', 'status' => 'ok',
]));

Route::get('/sanctum/csrf-cookie', fn () => response()->noContent());
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth');
