# Satria personal Telegram adapter

Laravel owns recipients and permission checks. n8n POSTs only to this private adapter. In `MOCK`, the adapter never connects to Telegram and returns `SIMULATED`. In `LIVE`, it uses an authorized personal Telegram account through [teleproto](https://github.com/sanyok12345/teleproto), a maintained GramJS-compatible MTProto client. It sends a normal message from that account and returns a real message ID. The native n8n Telegram node is for bots and is not used.

## Development

Requires Node.js 20.11 or newer. Run `npm ci`, copy `.env.example` to `.env`, generate independent secrets with `openssl rand -hex 32`, then start with `node --env-file=.env src/server.mjs`. `GET /health` reports the mode; `POST /send` needs `Authorization: Bearer <ADAPTER_TOKEN>`.

MOCK request:

```json
{
  "request_id": "notification-123",
  "mode": "MOCK",
  "peer_id": null,
  "phone": null,
  "text": "Paket sedang diantar",
  "sender_profile": "OPS_ADMIN"
}
```

Response is `{ "ok": true, "mode": "MOCK", "status": "SIMULATED", "provider_message_id": null, "sent_at": null }`. This is not proof that anyone received a message. The adapter accepts only the configured `SENDER_PROFILE`, so a single admin session cannot impersonate a courier.

## Personal-account demo

1. The account owner creates an API application at [my.telegram.org](https://my.telegram.org), gives permission, and enters `TELEGRAM_API_ID`/`TELEGRAM_API_HASH` on the server. Never place those values in React, n8n workflow JSON, or Git.
2. Generate `SESSION_ENCRYPTION_KEY` using `openssl rand -hex 32` and set `SESSION_FILE` under `./secrets`. The owner runs `node --env-file=.env src/login.mjs` interactively and enters their own Telegram login code and optional 2FA password. The login tool writes an AES-256-GCM encrypted session file with restrictive permissions; it never prints the session string.
3. Set `ADAPTER_MODE=LIVE` and start the admin adapter on port 8787. Start a second instance with `SENDER_PROFILE=COURIER`, port 8788, its own token, ledger, encrypted session, and the courier's consent. n8n routes by `sender_profile`.
4. Set Laravel `TELEGRAM_MODE=LIVE` only after both account sessions are authorized. Laravel reads `users.phone` when claiming a notification; the adapter resolves the phone with Telegram `contacts.resolvePhone` and sends from the selected personal account. The phone must be in Indonesian 62 format after Laravel normalization. A previously verified peer link can still be used. The recipient does not have to run app pairing, but Telegram may decline to resolve a phone due to privacy settings; this returns `FAILED` and should be handled by the team during the demo.
5. Confirm a small LIVE send using a consenting test recipient and inspect `notifications.status`, `provider_message_id`, and `last_error` in PostgreSQL. MOCK only proves the workflow path, not Telegram delivery.

The adapter never exposes a public pairing endpoint. `POST /send` must stay on a private network and is protected by a long random Bearer token. The local encrypted session and delivery ledger live under ignored `secrets/`; use a persistent private volume in Docker. The ledger records request IDs and message IDs but not message text. If a process dies between Telegram's acceptance and ledger write, retry may be ambiguous; reconcile before retrying repeatedly. Telegram may reject or limit messages because of account privacy or anti-abuse rules. Laravel keeps shipment history and offers a phone fallback.

## Local checks

`npm test` covers pairing code parsing, sender/peer-or-phone validation, encrypted session tamper detection, and a local HTTP MOCK send. `node --check src/server.mjs` checks syntax. A LIVE send requires real owner authorization and cannot be verified from dummy data.
