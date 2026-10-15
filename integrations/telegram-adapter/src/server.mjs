import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { loadSession } from './session-store.mjs';
import { parsePairingCode, parseSend, tokenMatches } from './validate.mjs';

const config = {
  mode: process.env.ADAPTER_MODE ?? 'MOCK',
  host: process.env.HOST ?? '127.0.0.1',
  port: Number(process.env.PORT ?? '8787'),
  senderProfile: process.env.SENDER_PROFILE ?? 'OPS_ADMIN',
  adapterToken: process.env.ADAPTER_TOKEN,
  laravelToken: process.env.LARAVEL_INTERNAL_TOKEN,
  laravelBase: (process.env.LARAVEL_API_BASE ?? 'http://127.0.0.1:8000').replace(/\/$/, ''),
  sessionFile: resolve(process.env.SESSION_FILE ?? './secrets/telegram.session.enc'),
  ledgerFile: resolve(process.env.LEDGER_FILE ?? './secrets/delivery-ledger.json'),
};
if (!['MOCK', 'LIVE'].includes(config.mode)) throw new Error('ADAPTER_MODE must be MOCK or LIVE');
if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('PORT is invalid');
if (!config.adapterToken || config.adapterToken.length < 32) throw new Error('ADAPTER_TOKEN must be 32+ characters');
if (config.mode === 'LIVE' && (!config.laravelToken || config.laravelToken.length < 32)) {
  throw new Error('LARAVEL_INTERNAL_TOKEN must be 32+ characters in LIVE mode');
}

const ledger = new Map();
const inFlight = new Map();
let persistChain = Promise.resolve();
try {
  const entries = JSON.parse(await readFile(config.ledgerFile, 'utf8'));
  for (const [id, value] of Object.entries(entries)) ledger.set(id, value);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

let telegram = null;
let ownPeerId = null;
let telegramApi = null;
let nextPhoneLookupAt = 0;
let phoneLookupChain = Promise.resolve();
if (config.mode === 'LIVE') {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  if (!Number.isSafeInteger(apiId) || apiId <= 0 || !apiHash || !process.env.SESSION_ENCRYPTION_KEY) {
    throw new Error('LIVE requires TELEGRAM_API_ID, TELEGRAM_API_HASH and SESSION_ENCRYPTION_KEY');
  }
  const [{ TelegramClient, Api }, { StringSession }, { NewMessage }] = await Promise.all([
    import('teleproto'), import('teleproto/sessions'), import('teleproto/events'),
  ]);
  telegramApi = Api;
  const session = await loadSession(config.sessionFile, process.env.SESSION_ENCRYPTION_KEY);
  telegram = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 5 });
  await telegram.connect();
  if (!(await telegram.checkAuthorization())) throw new Error('Telegram session is not authorized; run npm run login');
  ownPeerId = (await telegram.getMe()).id.toString();
  // StringSession stores authorization, not a durable peer cache. Pairing starts a private
  // conversation; refresh recent dialogs so teleproto can resolve that user's access hash.
  await telegram.getDialogs({ limit: 200 });
  telegram.addEventHandler(async (event) => {
    const message = event.message;
    if (message?.peerId?.className !== 'PeerUser') return;
    const code = parsePairingCode(message.message);
    if (!code) return;
    const peerId = message.peerId.userId?.toString();
    // A sender may pair their own admin account by writing to Saved Messages.
    // Other outgoing chats cannot authorize the recipient on their behalf.
    if (!peerId || (message.out && peerId !== ownPeerId)) return;
    try {
      const sender = await event.getSender();
      const response = await fetch(`${config.laravelBase}/api/v1/internal/telegram/pairing/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.laravelToken}`,
        },
        body: JSON.stringify({ code, peer_id: peerId, username: sender?.username ?? null }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`Laravel returned HTTP ${response.status}`);
      console.log(`Pairing confirmed for peer ${peerId}`);
    } catch (error) {
      // Never log the one-time code or session secret.
      console.error(`Pairing failed for peer ${peerId}: ${error.message}`);
    }
  }, new NewMessage({}));
}

function persistLedger() {
  const snapshot = JSON.stringify(Object.fromEntries(ledger));
  const operation = persistChain.then(async () => {
    await mkdir(dirname(config.ledgerFile), { recursive: true, mode: 0o700 });
    const temporary = `${config.ledgerFile}.${process.pid}.tmp`;
    await writeFile(temporary, snapshot, { mode: 0o600 });
    await rename(temporary, config.ledgerFile);
  });
  persistChain = operation.catch(() => {});
  return operation;
}

async function resolvePhone(phone) {
  const lookup = phoneLookupChain.then(async () => {
    const delay = Math.max(0, nextPhoneLookupAt - Date.now());
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    nextPhoneLookupAt = Date.now() + 3100;
    const resolved = await telegram.invoke(new telegramApi.contacts.ResolvePhone({ phone }));
    const user = resolved.users?.find((candidate) => candidate.id?.toString() === resolved.peer?.userId?.toString());
    if (!user?.accessHash) throw new Error('Telegram tidak menemukan akun yang dapat dihubungi lewat nomor ini (cek privasi nomor).');
    return new telegramApi.InputPeerUser({ userId: user.id, accessHash: user.accessHash });
  });
  phoneLookupChain = lookup.catch(() => {});
  return lookup;
}

async function send({ requestId, mode, peerId, phone, text, senderProfile }) {
  const textHash = createHash('sha256').update(text).digest('hex');
  const fingerprint = JSON.stringify([mode, peerId, phone, senderProfile, textHash]);
  if (ledger.has(requestId)) {
    const cached = ledger.get(requestId);
    if (cached.mode !== mode || cached.sender_profile !== senderProfile ||
        cached.peer_id !== peerId || (cached.phone ?? null) !== phone || cached.text_hash !== textHash) {
      throw new Error('request_id has already been used with different parameters');
    }
    return cached.result;
  }
  if (inFlight.has(requestId)) {
    const current = inFlight.get(requestId);
    if (current.fingerprint !== fingerprint) {
      throw new Error('request_id has already been used with different parameters');
    }
    return current.promise;
  }
  const operation = (async () => {
    let result;
    if (mode === 'MOCK') {
      result = { ok: true, mode, status: 'SIMULATED', provider_message_id: null, sent_at: null };
    } else {
      if (!telegram) throw new Error('LIVE mode is disabled on this adapter');
      let entity = phone ? await resolvePhone(phone) : 'me';
      if (!phone && peerId !== ownPeerId) {
        try {
          entity = await telegram.getInputEntity(peerId);
        } catch {
          await telegram.getDialogs({ limit: 200 });
          entity = await telegram.getInputEntity(peerId);
        }
      }
      const message = await telegram.sendMessage(entity, { message: text });
      if (!message?.id) throw new Error('Telegram did not return a message ID');
      result = {
        ok: true,
        mode,
        status: 'SENT',
        provider_message_id: String(message.id),
        sent_at: new Date().toISOString(),
      };
    }
    // Retain only successful requests. An interrupted send may still be ambiguous.
    ledger.set(requestId, { mode, sender_profile: senderProfile, peer_id: peerId, phone, text_hash: textHash, result });
    try {
      await persistLedger();
    } catch (error) {
      console.error('Could not persist delivery ledger:', error.message);
    }
    return result;
  })();
  inFlight.set(requestId, { fingerprint, promise: operation });
  try {
    return await operation;
  } finally {
    inFlight.delete(requestId);
  }
}

async function readJson(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 16_384) throw new Error('Request body too large');
  }
  return JSON.parse(raw);
}

function respond(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

const server = createServer(async (request, response) => {
  if (request.url === '/health' && request.method === 'GET') {
    respond(response, 200, { ok: true, mode: config.mode, sender_profile: config.senderProfile });
    return;
  }
  if (request.url !== '/send' || request.method !== 'POST') {
    respond(response, 404, { ok: false, error: 'Not found' });
    return;
  }
  const suppliedToken = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];
  if (!tokenMatches(config.adapterToken, suppliedToken)) {
    respond(response, 401, { ok: false, error: 'Unauthorized' });
    return;
  }
  try {
    const payload = parseSend(await readJson(request), config.senderProfile);
    const result = await send(payload);
    respond(response, 200, result);
  } catch (error) {
    const status = /LIVE mode is disabled|Telegram|Could not find/i.test(error.message) ? 502 : 422;
    console.error('Send request failed:', error.message);
    respond(response, status, { ok: false, status: 'FAILED', error: error.message });
  }
});
server.listen(config.port, config.host, () => {
  console.log(`Satria Telegram adapter ${config.mode} listening on ${config.host}:${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.close();
    if (telegram) await telegram.disconnect();
    process.exit(0);
  });
}
