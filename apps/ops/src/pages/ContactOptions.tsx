import { useState } from 'react';
import { get, request, unwrap } from '../lib/api';
import { Button, errorMessage, Icon, Notice, phoneHref } from '../ui';

interface Options {
  phone?: string;
  recipient_phone?: string;
  tel_url?: string;
  phone_url?: string;
  telegram_url?: string | null;
  telegram_available?: boolean;
  telegram_username?: string | null;
  recipient_name?: string;
  contact_note?: string | null;
}

export function ContactOptions({ shipmentId }: { shipmentId: number }) {
  const [options, setOptions] = useState<Options | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    setBusy(true); setError('');
    try { setOptions(unwrap<Options>(await get(`/api/v1/shipments/${shipmentId}/contact-options`))); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  const logOpen = (channel: string) => { void request(`/api/v1/shipments/${shipmentId}/contact-opened`, { method: 'POST', body: JSON.stringify({ channel }), keepalive: true }).catch(() => undefined); };
  const phone = options?.phone || options?.recipient_phone;
  const telegram = options?.telegram_url || (options?.telegram_username ? `https://t.me/${options.telegram_username.replace(/^@/, '')}` : undefined);
  return <div className="contact-options"><Button type="button" size="small" variant="secondary" icon="phone" loading={busy} onClick={load}>Hubungi penerima</Button>{error ? <Notice tone="error">{error}</Notice> : null}{options ? <div className="contact-card"><div className="contact-card-title"><Icon name="user" size={17}/><strong>{options.recipient_name || 'Penerima paket'}</strong></div>{phone ? <a href={options.phone_url || options.tel_url || phoneHref(phone)} onClick={() => logOpen('PHONE')}><Icon name="phone" size={16}/> Telepon {phone}</a> : <small>{options.contact_note || 'Nomor telepon belum tersedia.'}</small>}{telegram && options.telegram_available !== false ? <a href={telegram} target="_blank" rel="noreferrer" onClick={() => logOpen('TELEGRAM')}><Icon name="arrow" size={16}/> Buka Telegram</a> : <small>{options.contact_note || 'Pesan Telegram tidak tersedia untuk kontak ini. Gunakan telepon.'}</small>}<small className="muted">Kontak hanya untuk tugas terkait. Pastikan pesan telah terkirim sebelum melanjutkan.</small></div> : null}</div>;
}
