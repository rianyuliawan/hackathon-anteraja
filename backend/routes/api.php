<?php

use App\Http\Controllers\Api\AdminOperationsController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\CourierOperationsController;
use App\Http\Controllers\Api\HubOperationsController;
use App\Http\Controllers\Api\IntegrationController;
use App\Http\Controllers\Api\ShipmentContactController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    Route::get('/tracking/{awb}', [CatalogController::class, 'tracking']);

    Route::middleware('satria.internal')->prefix('internal')->group(function (): void {
        Route::get('/notifications/pending', [IntegrationController::class, 'pendingNotifications']);
        Route::post('/notifications/{id}/claim', [IntegrationController::class, 'claimNotification']);
        Route::post('/notifications/{id}/result', [IntegrationController::class, 'notificationResult']);
        Route::get('/tasks/overdue', [IntegrationController::class, 'overdueTasks']);
        Route::post('/tasks/{id}/remind', [IntegrationController::class, 'remindTask']);
        Route::post('/reports/daily', [IntegrationController::class, 'generateDailyReport']);
        Route::post('/telegram/pairing/confirm', [IntegrationController::class, 'confirmPairing']);
    });

    Route::middleware(['web', 'auth'])->group(function (): void {
        Route::get('/me', [AuthController::class, 'me']);
        Route::patch('/me', [AuthController::class, 'updateProfile']);
        Route::post('/me/telegram/pairing', [AuthController::class, 'createPairing']);
        Route::delete('/me/telegram/link', [AuthController::class, 'revokeTelegram']);
        Route::get('/me/notifications', [AuthController::class, 'notifications']);

        Route::get('/products', [CatalogController::class, 'products']);
        Route::get('/products/{id}', [CatalogController::class, 'product']);
        Route::post('/orders', [CatalogController::class, 'checkout']);
        Route::get('/me/orders', [CatalogController::class, 'myOrders']);
        Route::get('/me/orders/{id}', [CatalogController::class, 'myOrder']);
        Route::get('/me/orders/{id}/delivery-photo', [CatalogController::class, 'deliveryPhoto']);
        Route::post('/me/orders/{id}/confirm-received', [CatalogController::class, 'confirmReceived']);

        Route::get('/admin/dashboard', [AdminOperationsController::class, 'dashboard']);
        Route::get('/admin/orders', [AdminOperationsController::class, 'adminOrders']);
        Route::post('/admin/orders/{id}/approve', [AdminOperationsController::class, 'approveOrder']);
        Route::post('/admin/orders/{id}/reject', [AdminOperationsController::class, 'rejectOrder']);
        Route::get('/admin/pickup-tasks', [AdminOperationsController::class, 'pickupTasks']);
        Route::post('/admin/pickup-tasks/{id}/mark-ready', [AdminOperationsController::class, 'markPickupReady']);
        Route::post('/admin/pickup-tasks/{id}/assign', [AdminOperationsController::class, 'assignPickup']);
        Route::get('/admin/couriers', [AdminOperationsController::class, 'adminCouriers']);
        Route::get('/admin/issues', [AdminOperationsController::class, 'issues']);
        Route::post('/admin/issues/{id}/decision', [AdminOperationsController::class, 'issueDecision']);
        Route::get('/admin/shipments/{id}/attempts', [AdminOperationsController::class, 'attempts']);
        Route::get('/admin/reports/daily', [AdminOperationsController::class, 'dailyReports']);
        Route::post('/admin/reports/daily/generate', [AdminOperationsController::class, 'generateDailyReport']);
        Route::post('/admin/internal-users', [AdminOperationsController::class, 'createInternalUser']);
        Route::post('/admin/hubs', [AdminOperationsController::class, 'createHub']);

        Route::get('/hubs', [HubOperationsController::class, 'hubs']);
        Route::get('/hubs/{id}/inbound', [HubOperationsController::class, 'hubInbound']);
        Route::get('/hubs/{id}/ready', [HubOperationsController::class, 'hubReady']);
        Route::get('/hubs/{id}/couriers', [HubOperationsController::class, 'hubCouriers']);
        Route::get('/hubs/{id}/delivery-runs', [HubOperationsController::class, 'hubRuns']);
        Route::post('/hubs/{id}/scan-in', [HubOperationsController::class, 'scanIn']);
        Route::post('/hubs/{id}/delivery-runs', [HubOperationsController::class, 'createRun']);
        Route::post('/hubs/{id}/handover', [HubOperationsController::class, 'handover']);
        Route::post('/hubs/{id}/return-scan', [HubOperationsController::class, 'returnScan']);

        Route::get('/courier/pickup-assignments', [CourierOperationsController::class, 'courierPickupAssignments']);
        Route::post('/courier/pickup-assignments/{id}/accept', [CourierOperationsController::class, 'acceptPickup']);
        Route::post('/courier/pickup-assignments/{id}/reject', [CourierOperationsController::class, 'rejectPickup']);
        Route::post('/courier/pickup-assignments/{id}/complete', [CourierOperationsController::class, 'completePickup']);
        Route::get('/courier/delivery-runs', [CourierOperationsController::class, 'courierRuns']);
        Route::post('/courier/delivery-runs/{id}/accept', [CourierOperationsController::class, 'acceptRun']);
        Route::post('/courier/delivery-runs/{id}/reject', [CourierOperationsController::class, 'rejectRun']);
        Route::post('/courier/delivery-runs/{id}/start', [CourierOperationsController::class, 'startRun']);
        Route::post('/courier/run-shipments/{id}/result', [CourierOperationsController::class, 'deliveryResult']);

        Route::get('/shipments/{id}/contact-options', [ShipmentContactController::class, 'contactOptions']);
        Route::post('/shipments/{id}/contact-opened', [ShipmentContactController::class, 'contactOpened']);
        Route::get('/shipments/{id}/pickup-photo', [ShipmentContactController::class, 'pickupPhoto']);
    });
});
