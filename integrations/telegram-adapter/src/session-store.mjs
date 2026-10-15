import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

function keyFromHex(hex) {
  if (!/^[0-9a-fA-F]{64}$/.test(hex ?? '')) {
    throw new Error('SESSION_ENCRYPTION_KEY must be 64 hexadecimal characters (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

export async function saveSession(file, session, hexKey) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFromHex(hexKey), nonce);
  const ciphertext = Buffer.concat([cipher.update(session, 'utf8'), cipher.final()]);
  const payload = JSON.stringify({
    version: 1,
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  });
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, payload, { mode: 0o600 });
  await rename(temporary, file);
}

export async function loadSession(file, hexKey) {
  const payload = JSON.parse(await readFile(file, 'utf8'));
  if (payload.version !== 1) throw new Error('Unknown session file format');
  const decipher = createDecipheriv(
    'aes-256-gcm', keyFromHex(hexKey), Buffer.from(payload.nonce, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
