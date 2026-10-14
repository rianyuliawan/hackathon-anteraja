<?php

return [
    'telegram_mode' => env('TELEGRAM_MODE', 'MOCK'),
    'telegram_live_recipient_emails' => array_filter(array_map('trim', explode(',', strtolower((string) env('TELEGRAM_LIVE_RECIPIENT_EMAILS', ''))))),
    'internal_token' => env('SATRIA_INTERNAL_TOKEN', ''),
    'n8n_webhook_url' => env('N8N_WEBHOOK_URL', ''),
    'n8n_webhook_token' => env('N8N_WEBHOOK_TOKEN', ''),
    'catalog_public_url' => env('CATALOG_PUBLIC_URL', 'http://localhost:5173'),
    'ops_public_url' => env('OPS_PUBLIC_URL', 'http://localhost:5174'),
    'osrm_url' => env('OSRM_URL', 'http://127.0.0.1:5000'),
];
