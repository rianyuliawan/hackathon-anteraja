import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { parsePairingCode, parseSend, tokenMatches } from '../src/validate.mjs';
import { loadSession, saveSession } from '../src/session-store.mjs';

test('pairing accepts only the explicit one-time code shape', () => {
  assert.equal(parsePairingCode(' satria-AB12CD34 '), 'SATRIA-AB12CD34');
  assert.equal(parsePairingCode('please use SATRIA-AB12CD34'), null);
  assert.equal(parsePairingCode('SATRIA-123'), null);
});

test('send validation requires own sender profile and a peer or phone for LIVE', () => {
  assert.equal(parseSend({
    request_id: 'n-23', mode: 'MOCK', peer_id: null,
    text: 'Paket diambil', sender_profile: 'OPS_ADMIN',
  }, 'OPS_ADMIN').mode, 'MOCK');
  assert.throws(() => parseSend({
    request_id: 'n-23', mode: 'LIVE', peer_id: null,
    text: 'Paket diambil', sender_profile: 'OPS_ADMIN',
  }, 'OPS_ADMIN'), /peer_id/);
  assert.equal(parseSend({ request_id: 'n-24', mode: 'LIVE', phone: '6281219275340',
    text: 'Paket diantar', sender_profile: 'OPS_ADMIN' }, 'OPS_ADMIN').phone, '6281219275340');
  assert.throws(() => parseSend({
    request_id: 'n-23', mode: 'MOCK', peer_id: null,
    text: 'Paket diambil', sender_profile: 'COURIER',
  }, 'OPS_ADMIN'), /sender_profile/);
  assert.equal(tokenMatches('a'.repeat(32), 'a'.repeat(32)), true);
  assert.equal(tokenMatches('a'.repeat(32), 'b'.repeat(32)), false);
});

test('encrypted session round trips and detects tampering', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'satria-adapter-'));
  const file = join(directory, 'session.enc');
  const key = 'ab'.repeat(32);
  await saveSession(file, 'private-session-string', key);
  assert.equal(await loadSession(file, key), 'private-session-string');
  const encoded = JSON.parse(await readFile(file, 'utf8'));
  encoded.ciphertext = Buffer.from('corrupt').toString('base64');
  await writeFile(file, JSON.stringify(encoded));
  await assert.rejects(loadSession(file, key));
});

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

test('MOCK server never claims a Telegram send and dedupes request IDs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'satria-adapter-http-'));
  const port = await freePort();
  const token = 'test-adapter-secret'.padEnd(40, '-');
  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, ADAPTER_MODE: 'MOCK', HOST: '127.0.0.1', PORT: String(port),
      ADAPTER_TOKEN: token, LEDGER_FILE: join(directory, 'ledger.json') },
    stdio: 'ignore',
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`);
        ready = response.ok;
        if (ready) break;
      } catch { /* wait for listener */ }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    assert.equal(ready, true, 'mock adapter should start');
    const url = `http://127.0.0.1:${port}/send`;
    const payload = { request_id: 'notification-1', mode: 'MOCK', peer_id: null,
      text: 'Tugas pickup baru', sender_profile: 'OPS_ADMIN' };
    const unauthorized = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
    assert.equal(unauthorized.status, 401);
    const send = (body) => fetch(url, { method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body) });
    const first = await send(payload);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { ok: true, mode: 'MOCK', status: 'SIMULATED',
      provider_message_id: null, sent_at: null });
    const duplicate = await send(payload);
    assert.equal(duplicate.status, 200);
    const changed = await send({ ...payload, text: 'Different message' });
    assert.equal(changed.status, 422);
    const ledger = JSON.parse(await readFile(join(directory, 'ledger.json'), 'utf8'));
    assert.equal(Object.keys(ledger).length, 1);
    assert.equal(JSON.stringify(ledger).includes('Tugas pickup'), false);
  } finally {
    child.kill('SIGTERM');
  }
});
