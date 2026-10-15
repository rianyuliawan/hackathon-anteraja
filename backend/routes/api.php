<?php

use App\Http\Controllers\Api\AdminOperationsController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\CourierOperationsController;
use App\Http\Controllers\Api\HubOperationsController;
use App\Http\Controllers\Api\IntegrationController;
use App\Http\Controllers\Api\RoadRouteController;
use App\Http\Controllers\Api\ShipmentContactController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
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
        Route::get('/tracking/{awb}/pickup-photo', [CatalogController::class, 'pickupPhotoByAwb']);
        Route::get('/tracking/{awb}/delivery-photo', [CatalogController::class, 'deliveryPhotoByAwb']);
        Route::post('/tracking/{awb}/confirm-received', [CatalogController::class, 'confirmReceivedByAwb']);
        Route::post('/tracking/{awb}/confirm-reschedule', [CatalogController::class, 'confirmRescheduleByAwb']);
        Route::get('/tracking/{awb}/preview', [CatalogController::class, 'trackingPreview']);
        Route::get('/tracking/{awb}', [CatalogController::class, 'tracking']);
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/routing/road-route', [RoadRouteController::class, 'show']);
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
        Route::get('/admin/network', [AdminOperationsController::class, 'network']);
        Route::get('/admin/orders', [AdminOperationsController::class, 'adminOrders']);
        Route::post('/admin/orders/{id}/approve', [AdminOperationsController::class, 'approveOrder']);
        Route::get('/admin/pickup-tasks', [AdminOperationsController::class, 'pickupTasks']);
        Route::get('/admin/couriers', [AdminOperationsController::class, 'adminCouriers']);
        Route::get('/admin/issues', [AdminOperationsController::class, 'issues']);
        Route::get('/admin/shipments/{id}/attempts', [AdminOperationsController::class, 'attempts']);
        Route::get('/admin/reports/daily', [AdminOperationsController::class, 'dailyReports']);
        Route::post('/admin/reports/daily/generate', [AdminOperationsController::class, 'generateDailyReport']);
        Route::post('/admin/internal-users', [AdminOperationsController::class, 'createInternalUser']);
        Route::post('/admin/hubs', [AdminOperationsController::class, 'createHub']);

        Route::get('/hubs', [HubOperationsController::class, 'hubs']);
        Route::get('/hubs/{id}/reports/daily', [HubOperationsController::class, 'hubDailyReports']);
        Route::post('/hubs/{id}/reports/daily/generate', [HubOperationsController::class, 'generateHubDailyReport']);
        Route::get('/hubs/{id}/reports/daily.xlsx', [HubOperationsController::class, 'downloadHubDailyReport']);
        Route::get('/hubs/{id}/attention-counts', [HubOperationsController::class, 'attentionCounts']);
        Route::get('/hubs/{id}/pickup-tasks', [HubOperationsController::class, 'pickupTasks']);
        Route::get('/hubs/{id}/pickup-couriers', [HubOperationsController::class, 'pickupCouriers']);
        Route::post('/hubs/{id}/pickup-tasks/{taskId}/mark-ready', [HubOperationsController::class, 'markPickupReady']);
        Route::post('/hubs/{id}/pickup-tasks/{taskId}/assign', [HubOperationsController::class, 'assignPickup']);
        Route::get('/hubs/{id}/issues', [HubOperationsController::class, 'hubIssues']);
        Route::post('/hubs/{id}/issues/{issueId}/decision', [HubOperationsController::class, 'issueDecision']);
        Route::get('/hubs/{id}/inbound', [HubOperationsController::class, 'hubInbound']);
        Route::get('/hubs/{id}/ready', [HubOperationsController::class, 'hubReady']);
        Route::get('/hubs/{id}/couriers', [HubOperationsController::class, 'hubCouriers']);
        Route::get('/hubs/{id}/delivery-runs', [HubOperationsController::class, 'hubRuns']);
        Route::get('/hubs/{id}/shipments/{awb}/history', [HubOperationsController::class, 'shipmentHistory']);
        Route::post('/hubs/{id}/scan-in', [HubOperationsController::class, 'scanIn']);
        Route::post('/hubs/{id}/delivery-runs', [HubOperationsController::class, 'createRun']);
        Route::post('/hubs/{id}/delivery-runs/preview', [HubOperationsController::class, 'previewRun']);
        Route::post('/hubs/{id}/handover', [HubOperationsController::class, 'handover']);
        Route::post('/hubs/{id}/return-scan', [HubOperationsController::class, 'returnScan']);

        Route::get('/courier/pickup-assignments', [CourierOperationsController::class, 'courierPickupAssignments']);
        Route::post('/courier/pickup-assignments/{id}/accept', [CourierOperationsController::class, 'acceptPickup']);
        Route::post('/courier/pickup-assignments/{id}/complete', [CourierOperationsController::class, 'completePickup']);
        Route::get('/courier/shipments', [CourierOperationsController::class, 'searchShipments']);
        Route::get('/courier/shipments/{awb}', [CourierOperationsController::class, 'courierShipment']);
        Route::get('/courier/delivery-runs', [CourierOperationsController::class, 'courierRuns']);
        Route::post('/courier/delivery-runs/{id}/accept', [CourierOperationsController::class, 'acceptRun']);
        Route::post('/courier/delivery-runs/{id}/respond', [CourierOperationsController::class, 'respondRun']);
        Route::post('/courier/delivery-runs/{id}/reject', [CourierOperationsController::class, 'rejectRun']);
        Route::post('/courier/delivery-runs/{id}/start', [CourierOperationsController::class, 'startRun']);
        Route::post('/courier/run-shipments/{id}/result', [CourierOperationsController::class, 'deliveryResult']);

        Route::get('/shipments/{id}/contact-options', [ShipmentContactController::class, 'contactOptions']);
        Route::post('/shipments/{id}/contact-opened', [ShipmentContactController::class, 'contactOpened']);
        Route::get('/shipments/{id}/pickup-photo', [ShipmentContactController::class, 'pickupPhoto']);
        Route::get('/shipments/{id}/delivery-photo', [ShipmentContactController::class, 'deliveryPhoto']);
    });
});
