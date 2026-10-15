# Satria n8n workflows

These four JSON files are importable n8n workflows. They are **inactive after import**. n8n is a dispatcher and timer; Laravel remains the source of truth for shipment state, notification recipient, and report totals.

| File | Trigger | Calls |
| --- | --- | --- |
| `workflows/notification-dispatch.json` | `POST /webhook/satria-notifications` | Laravel claim → personal Telegram adapter → Laravel result. |
| `workflows/pending-notifications.json` | Every minute | Laravel pending queue → existing notification webhook for each ID. |
| `workflows/overdue-reminders.json` | Every minute | Laravel overdue list → Laravel reminder for each task. |
| `workflows/daily-report.json` | Daily 17:00 Asia/Jakarta | Laravel daily report generator; Laravel sends one Telegram summary per hub operator and date. |

## Configuration

1. Load the variables in `.env.example` into the **n8n server process**, with real private values. `SATRIA_API_BASE`, `SATRIA_ADAPTER_URL`, `SATRIA_COURIER_ADAPTER_URL`, and `SATRIA_N8N_WEBHOOK_URL` must be reachable **from inside n8n**, not only from your browser. `SATRIA_INTERNAL_TOKEN` must equal Laravel `SATRIA_INTERNAL_TOKEN`; `SATRIA_ADAPTER_TOKEN` and `SATRIA_COURIER_ADAPTER_TOKEN` must match their respective adapter `ADAPTER_TOKEN` values.
2. Import each JSON using n8n's **Import from File** action. The webhook validates `X-Satria-Webhook-Token` in its first Code node against n8n `SATRIA_WEBHOOK_TOKEN`; set the same value as Laravel `N8N_WEBHOOK_TOKEN`. No manual n8n credential or phone-number mapping is required. The exported workflow contains no secrets.
3. Set Laravel `N8N_WEBHOOK_URL` and n8n `SATRIA_N8N_WEBHOOK_URL` to the active webhook URL, usually `http://n8n:5678/webhook/satria-notifications` on an internal Docker network. The `/webhook-test/` URL only works while the editor listens for a test run. Laravel sends `{"notification_id": 123}` after the database transaction commits, with `X-Satria-Webhook-Token` header.
4. On n8n 2.x, set `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` for the `$env.SATRIA_*` expressions. Restrict n8n editor access to trusted operators. Set `GENERIC_TIMEZONE=Asia/Jakarta` and check each workflow timezone after import. Activate only after a MOCK send and internal API test pass.

## Local demo check

The current local setup uses Laravel on `127.0.0.1:8000`, n8n on `127.0.0.1:5678`, and separate personal-account adapters on ports `8787` (admin) and `8788` (courier). The private `.env` files carry tokens; they and n8n state are ignored by Git. Start the already-configured n8n container with `docker start satria-n8n`. From `integrations/telegram-adapter`, start `node --env-file=.env src/server.mjs` and `node --env-file=.env.courier src/server.mjs` in separate terminals. In MOCK mode, a successful workflow records `SIMULATED` in PostgreSQL and sends nothing to Telegram.

The four demo logins and their real phone numbers are stored only in the local database. They are deliberately absent from the public seed. To test a real personal-account send later, each sender must authorize its own Telegram session with `npm run login` using its private env file, then change both adapters to LIVE and Laravel `TELEGRAM_MODE=LIVE`. Phone resolution does not guarantee that Telegram will expose every recipient account.

## Safe LIVE recipients for a mixed demo run

Laravel uses `TELEGRAM_LIVE_RECIPIENT_EMAILS` for staff and legacy accounts. A newly registered buyer who explicitly enables Telegram notifications at registration or in their profile is automatically eligible for LIVE when `TELEGRAM_MODE=LIVE` and their mobile number is valid. No manual allowlist entry or pairing is needed for that buyer. A syntactically valid seed phone is not proof that it belongs to a participant: seed buyers have no opt-in and remain `MOCK`/`SIMULATED`. The claim API rechecks eligibility before dispatch, downgrading ineligible queued LIVE messages. Telegram privacy settings may prevent resolving an eligible number; then delivery is recorded as `FAILED`.

A run may contain real and dummy shipments. Assignment messages still reach an allowlisted courier. At run start Laravel creates one customer notification per accepted shipment: opted-in buyers and allowlisted legacy buyers are eligible for a real message; dummy buyers get simulated records. Delivery failure, delivery success, and reschedule notifications follow the same rule. Hub operators also receive alerts for rejected assignments, failed deliveries, unresolved decisions, unanswered tasks, and the daily report. Check notification `delivery_mode` and `status` in PostgreSQL when rehearsing.

## API envelopes

`POST /api/v1/internal/notifications/{id}/claim` responds with `{ "claimed": true, "notification": { "id": 123, "delivery_mode": "MOCK", "channel": "TELEGRAM", "message": "...", "peer_id": null, "phone": null, "sender_profile": "OPS_ADMIN" } }`. An already claimed/completed row responds with `{"claimed": false}`. The adapter responds with `SIMULATED` in MOCK or `SENT` plus real `provider_message_id` and `sent_at` in LIVE. n8n sends the result back to `POST /api/v1/internal/notifications/{id}/result`.

`GET /api/v1/internal/notifications/pending` responds with `{ "notifications": [{ "id": 123 }] }`. The sweeper sends each ID through the same authenticated webhook used by Laravel after commit. Laravel's pending endpoint requeues stale `SENDING` notifications after five minutes with a bounded attempt count; the claim endpoint remains atomic. This recovers from a missed webhook when n8n was unavailable, while preserving one notification row per dedupe key.

`GET /api/v1/internal/tasks/overdue` responds with `{ "tasks": [{ "id": 5, "type": "pickup_assignment" }] }`. n8n calls `POST /api/v1/internal/tasks/5/remind` with `{ "type": "pickup_assignment" }`; `delivery_run` is the other valid type. Laravel rechecks the typed task and sends at most one reminder per pending task. For a delivery run, it also alerts the hub operator if the courier has not responded. The daily workflow calls `POST /api/v1/internal/reports/daily` with `{}`; Laravel upserts by hub/date and queues a dated summary to each hub operator. The summary links to the XLSX report in the app; the file itself is not attached to Telegram.

HTTP failures while sending to the adapter are normalized as `FAILED` and reported to Laravel. A missed one-shot webhook is recovered by the pending-notifications workflow. A failure to report the final result can leave a `SENDING` row until Laravel's stale-claim policy requeues it; sending over networks cannot guarantee exactly once. The adapter caches successful request IDs to reduce duplicate sends.

## Validate the files

Run `node build_workflows.mjs` after editing the generator, then `node verify_workflows.mjs`. This checks JSON, graph edges, and embedded JavaScript syntax. It does not replace importing into a running n8n instance and sending a MOCK test.

Sender profile is `COURIER` for `OUT_FOR_DELIVERY` and `OPS_ADMIN` for assignment/reschedule messages; the same admin Telegram account can represent both ops and hub. In LIVE, Laravel reads the recipient phone from `users.phone` at claim time and sends it in 62 format to the adapter. If an older verified Telegram peer link exists, it takes precedence. Telegram may hide a phone lookup under the recipient's privacy settings; a failed lookup is recorded as `FAILED`, not as a sent message.

No Telegram bot token is involved. The n8n Telegram node is deliberately absent because the demo uses personal accounts. See [n8n Telegram credentials](https://docs.n8n.io/integrations/builtin/credentials/telegram/) and the [Telegram client API](https://core.telegram.org/api/auth).
