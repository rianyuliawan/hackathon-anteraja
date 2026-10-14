import { timingSafeEqual } from 'node:crypto';

export function tokenMatches(expected, supplied) {
  if (!expected || !supplied) return false;
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(supplied));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseSend(body, configuredSender) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Body must be a JSON object');
  }
  const { request_id: requestId, mode, peer_id: peerId, phone, text, sender_profile: senderProfile } = body;
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9:_-]{1,100}$/.test(requestId)) {
    throw new Error('request_id is invalid');
  }
  if (!['MOCK', 'LIVE'].includes(mode)) throw new Error('mode must be MOCK or LIVE');
  if (typeof text !== 'string' || text.trim().length === 0 || text.length > 4096) {
    throw new Error('text must be 1-4096 characters');
  }
  if (senderProfile !== configuredSender) throw new Error('sender_profile does not match this account');
  const validPeer = /^[0-9]{1,20}$/.test(String(peerId ?? ''));
  const validPhone = /^628[0-9]{8,11}$/.test(String(phone ?? ''));
  if (mode === 'LIVE' && !validPeer && !validPhone) {
    throw new Error('LIVE needs a numeric peer_id or Indonesian phone in 62 format');
  }
  return { requestId, mode, peerId: mode === 'LIVE' && validPeer ? String(peerId) : null,
    phone: mode === 'LIVE' && !validPeer ? String(phone) : null, text, senderProfile };
}

export function parsePairingCode(message) {
  if (typeof message !== 'string') return null;
  const match = /^SATRIA-[A-Z0-9]{8}$/i.exec(message.trim());
  return match ? match[0].toUpperCase() : null;
}
