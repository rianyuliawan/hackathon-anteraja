import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ApiError, get } from './lib/api';
import { FiAlertTriangle, FiArrowRight, FiBell, FiCamera, FiCheck, FiChevronRight, FiClock, FiFileText, FiGrid, FiLogOut, FiMapPin, FiMaximize, FiMenu, FiPackage, FiPhone, FiRefreshCw, FiSearch, FiShield, FiTruck, FiUser, FiX } from 'react-icons/fi';

const icons = {
  grid: FiGrid, package: FiPackage, truck: FiTruck, scan: FiMaximize,
  clock: FiClock, check: FiCheck, chevron: FiChevronRight, search: FiSearch,
  logout: FiLogOut, user: FiUser, pin: FiMapPin, alert: FiAlertTriangle,
  phone: FiPhone, camera: FiCamera, arrow: FiArrowRight, refresh: FiRefreshCw,
  file: FiFileText, bell: FiBell, menu: FiMenu, close: FiX, shield: FiShield,
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const Component = icons[name as keyof typeof icons] || FiPackage;
  return <Component aria-hidden="true" size={size}/>;
}

export function Button({ variant = 'primary', size = 'normal', loading, icon, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary'|'secondary'|'ghost'|'danger'; size?: 'normal'|'small'; loading?: boolean; icon?: string }) {
  return <button {...rest} disabled={rest.disabled || loading} className={`button button-${variant} button-${size} ${rest.className || ''}`.trim()}>{loading ? <span className="spinner"/> : icon ? <Icon name={icon} size={size === 'small' ? 16 : 18}/> : null}<span className="inline-flex items-center justify-center gap-2">{children}</span></button>;
}

export function Badge({ status, children }: { status?: string; children?: ReactNode }) {
  const s = (status || '').toUpperCase();
  const tone = /DELIVERED|APPROVED|COMPLETED|ACCEPTED|SENT|RESOLVED/.test(s) ? 'success'
    : /FAILED|REJECTED|EXPIRED|RETURN_REQUESTED|CANCELLED/.test(s) ? 'danger'
    : /PENDING|WAITING|ASSIGNED|READY/.test(s) ? 'warning' : 'neutral';
  return <span className={`badge badge-${tone}`}><span className="badge-dot"/>{children || statusLabel(status)}</span>;
}

export function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    PENDING_APPROVAL: 'Menunggu persetujuan', APPROVED: 'Disetujui', REJECTED: 'Ditolak',
    WAITING_SELLER_READY: 'Menunggu toko siap', READY_FOR_PICKUP: 'Siap dijemput', PICKUP_ASSIGNED: 'Kurir penjemputan ditugaskan',
    PENDING_ACCEPT: 'Menunggu kurir', ACCEPTED: 'Diterima kurir', PICKED_UP: 'Sudah dijemput',
    READY_FOR_LAST_MILE: 'Siap antar', DELIVERY_ASSIGNED: 'Kurir antar ditugaskan',
    OUT_FOR_DELIVERY: 'Dalam pengantaran', DELIVERY_FAILED: 'Gagal dikirim',
    AT_HUB_AWAITING_DECISION: 'Retur diterima hub', WAITING_REDELIVERY: 'Menunggu antar ulang',
    DELIVERED: 'Terkirim', FAILED: 'Gagal', COMPLETED: 'Selesai', RETURN_REQUESTED: 'Diminta retur', RETURN_TO_SELLER: 'Retur ke pengirim', RESCHEDULE: 'Antar ulang dijadwalkan',
    HANDED_OVER: 'Diserahkan ke kurir', ASSIGNED: 'Ditugaskan', OPEN: 'Perlu keputusan',
    RESOLVED: 'Ditangani', SIMULATED: 'Belum dikirim', QUEUED: 'Menunggu dikirim', SENDING: 'Sedang dikirim', SENT: 'Terkirim',
  };
  return labels[status || ''] || (status || '—').replaceAll('_', ' ').toLowerCase();
}

export function dateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(date);
}

export function dateOnly(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' }).format(date);
}

export function todayJakarta() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function money(value?: number | string) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

export function phoneHref(phone?: string | null) {
  return phone ? `tel:${phone.replace(/[^+\d]/g, '')}` : undefined;
}

export function Panel({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`.trim()}>{title || action ? <div className="panel-head"><h2>{title}</h2>{action}</div> : null}{children}</section>;
}

export function Empty({ icon = 'package', title, detail, action }: { icon?: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="empty"><span className="empty-icon"><Icon name={icon} size={27}/></span><strong>{title}</strong>{detail ? <p>{detail}</p> : null}{action}</div>;
}

export function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="page-header"><div>{eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}<h1>{title}</h1>{subtitle ? <p className="muted">{subtitle}</p> : null}</div>{action ? <div className="page-action">{action}</div> : null}</div>;
}

export function Field({ label, hint, children, required }: { label: string; hint?: string; children: ReactNode; required?: boolean }) {
  return <label className="field"><span className="field-label">{label}{required ? <span className="required"> *</span> : null}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info'|'error'|'success' }) {
  return <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Terjadi kesalahan saat memuat data.';
  return <Notice tone="error"><div className="between"><span>{message}</span>{retry ? <Button type="button" variant="ghost" size="small" onClick={retry}>Coba lagi</Button> : null}</div></Notice>;
}

export function Loading({ label = 'Memuat data…' }: { label?: string }) {
  return <div className="loading"><span className="spinner"/>{label}</div>;
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Tutup"><Icon name="close"/></button></div><div className="modal-body">{children}</div></div></div>;
}

export function useResource<T>(path: string, normalize: (raw: unknown) => T) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    get<unknown>(path).then((raw) => { if (active) { setData(normalize(raw)); setError(null); } })
      .catch((cause) => { if (active) setError(cause); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path, revision]);
  return { data, loading, error, reload: () => setRevision((value) => value + 1) };
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 422 && Object.keys(error.errors).length) {
    return `${error.message} ${Object.values(error.errors).flat().join(' ')}`;
  }
  return error instanceof Error ? error.message : 'Aksi gagal. Coba lagi.';
}
