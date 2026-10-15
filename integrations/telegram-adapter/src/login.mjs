import { resolve } from 'node:path';
import { saveSession } from './session-store.mjs';

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const key = process.env.SESSION_ENCRYPTION_KEY;
if (!Number.isSafeInteger(apiId) || apiId <= 0 || !apiHash || !key) {
  throw new Error('Set TELEGRAM_API_ID, TELEGRAM_API_HASH and SESSION_ENCRYPTION_KEY first');
}
const file = resolve(process.env.SESSION_FILE ?? './secrets/telegram.session.enc');
const [{ TelegramClient }, { StringSession }, { default: input }] = await Promise.all([
  import('teleproto'), import('teleproto/sessions'), import('input'),
]);
const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 5 });
try {
  await client.start({
    phoneNumber: async () => input.text('Telegram phone number: '),
    phoneCode: async () => input.text('Telegram login code: '),
    password: async () => input.password('Telegram 2FA password: '),
    onError: (error) => console.error('Telegram login error:', error.message),
  });
  await saveSession(file, client.session.save(), key);
  console.log(`Encrypted session saved to ${file}. Keep this file and the key private.`);
} finally {
  await client.disconnect();
}
