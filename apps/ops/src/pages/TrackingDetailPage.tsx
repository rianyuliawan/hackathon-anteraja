import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiAlertCircle, FiArrowLeft, FiArrowRight, FiBox, FiCamera, FiCheck, FiCheckCircle, FiChevronDown, FiCopy, FiMapPin, FiRefreshCw, FiTruck } from 'react-icons/fi';
import { get, post, unwrap } from '../lib/api';
import usePrivateImage from '../hooks/usePrivateImage';
import { PhotoLightbox } from '../components/PhotoLightbox';
import type { Tracking, TrackingEvent } from '../lib/types';
import { Button, dateTime, Empty, Loading, statusLabel } from '../ui';

export function eventDescription(event: TrackingEvent) {
  const copy: Record<string, string> = {
    AWB_CREATED: 'Resi diterbitkan', AWB_GENERATED: 'Resi diterbitkan dan paket menunggu penjemputan',
    SELLER_READY: 'Paket siap dijemput dari pengirim', PICKUP_ASSIGNED: 'Kurir ditugaskan menjemput paket',
    PICKUP_ACCEPTED: 'Kurir menerima tugas penjemputan', PICKUP_SCHEDULED: 'Penjemputan dijadwalkan',
    PICKED_UP: 'Paket telah dijemput dari pengirim', ARRIVED_AT_HUB: 'Paket tiba di hub',
    ARRIVED_AT_DELIVERY_HUB: 'Paket tiba di hub tujuan', READY_FOR_LAST_MILE: 'Paket siap diantar ke penerima',
    DELIVERY_RUN_ASSIGNED: 'Kurir pengantaran ditugaskan', DELIVERY_RUN_ACCEPTED: 'Kurir menerima tugas pengantaran',
    DELIVERY_ASSIGNMENT_REJECTED: 'Kurir menolak penugasan paket', DELIVERY_RUN_REJECTED: 'Kurir menolak tugas pengantaran',
    DELIVERY_ASSIGNED: 'Penugasan pengantaran baru', ASSIGNMENT_REMINDER: 'Pengingat konfirmasi penugasan',
    CONTACT_OPENED: 'Penerima dihubungi untuk tindak lanjut',
    HANDOVER_TO_COURIER: 'Paket diserahkan ke kurir', OUT_FOR_DELIVERY: 'Paket sedang diantar ke penerima',
    DELIVERY_FAILED: 'Pengantaran belum berhasil', FAILED_PARCEL_RETURNED_TO_HUB: 'Paket kembali ke hub setelah gagal kirim',
    REDELIVERY_DECISION_REQUIRED: 'Pengantaran menunggu keputusan admin', REDELIVERY_SCHEDULED: 'Pengantaran ulang dijadwalkan',
    RETURN_REQUESTED: 'Paket dijadwalkan kembali ke pengirim', DELIVERED: 'Paket telah diterima',
    BUYER_CONFIRMED_RECEIVED: 'Penerima mengonfirmasi paket',
    BUYER_CONFIRMED_RESCHEDULE: 'Penerima menyetujui jadwal pengantaran ulang',
  };
  return copy[event.event_type] || (event.status_after ? statusLabel(event.status_after) : event.event_type.replaceAll('_', ' '));
}

export function failureReasonLabel(reason?: string | null) {
  const labels: Record<string, string> = {
    PENERIMA_TIDAK_ADA: 'Penerima tidak berada di lokasi',
    ALAMAT_TIDAK_DITEMUKAN: 'Alamat tidak ditemukan',
    PENERIMA_MENOLAK: 'Penerima menolak paket',
    AKSES_TERHALANG: 'Akses ke alamat terhalang',
    LAINNYA: 'Kendala lain di lokasi',
  };
  return labels[reason || ''] || reason || 'Alasan belum tersedia';
}

function packageWeight(grams?: number | null) {
  if (!grams) return '—';
  return grams >= 1000 ? `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(grams / 1000)} kg` : `${grams} g`;
}
function packageDimensions(parcel?: Tracking['parcel']) {
  if (!parcel) return '—';
  const cm = (mm: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(mm / 10);
  return `${cm(parcel.length_mm)} × ${cm(parcel.width_mm)} × ${cm(parcel.height_mm)} cm`;
}
function EvidencePhoto({ awb, kind, available, takenAt, address }: { awb: string; kind: 'pickup' | 'delivery'; available?: boolean; takenAt?: string | null; address?: string | null }) {
  const [open, setOpen] = useState(false);
  const isPickup = kind === 'pickup';
  const label = isPickup ? 'Foto penjemputan' : 'Foto pengantaran';
  const path = available ? `/api/v1/tracking/${encodeURIComponent(awb)}/${kind}-photo` : null;
  const { url, mimeType, loading, error, retry } = usePrivateImage(path);
  return (
    <div className="overflow-hidden rounded-2xl border border-[#efe3eb] bg-[#fffafd]">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-bold text-[#443240]">
          <FiCamera className={isPickup ? 'text-[#d62280]' : 'text-[#b57914]'} aria-hidden="true" />
          {label}
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${available ? 'bg-[#e8f7ee] text-[#248359]' : 'bg-[#f2edf1] text-[#8e818b]'}`}>
          {available ? 'Tersedia' : 'Menunggu'}
        </span>
      </div>
      {url ? (
        <button type="button" onClick={() => setOpen(true)} aria-label={`Perbesar ${label.toLowerCase()} untuk resi ${awb}`} className="group block w-full cursor-zoom-in text-left">
          <img src={url} alt={label} className="h-44 w-full object-cover transition duration-300 group-hover:scale-[1.02] sm:h-48" loading="lazy" />
        </button>
      ) : available && loading ? (
        <div className="flex h-36 items-center justify-center bg-[#fff0f7] text-xs text-[#9a6a85]" role="status">Memuat foto…</div>
      ) : available && error ? (
        <div className="flex h-36 flex-col items-center justify-center gap-2 bg-[#fff0f7] px-3 text-center text-xs text-[#9d3455]" role="alert">
          <span>{error}</span>
          <button type="button" onClick={retry} className="font-bold underline">Coba lagi</button>
        </div>
      ) : (
        <div className={`flex h-36 flex-col items-center justify-center gap-2 ${isPickup ? 'bg-[#fff0f7]' : 'bg-[#fff7e7]'} text-[#a28d9b]`}>
          <FiCamera size={25} aria-hidden="true" />
          <span className="text-xs">Foto belum tersedia</span>
        </div>
      )}
      {available ? <div className="grid gap-1 border-t border-[#f3e9ef] px-4 py-3 text-xs text-[#756875]">
        <span><strong>Waktu:</strong> {takenAt ? `${dateTime(takenAt)} WIB` : 'Belum tercatat'}</span>
        <span className="break-words"><strong>Tempat:</strong> {address || 'Alamat belum tersedia'}</span>
      </div> : null}
      {open && url ? <PhotoLightbox url={url} mimeType={mimeType} kind={kind} awb={awb} takenAt={takenAt} address={address} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function TrackingDetails({ data, onConfirm, onConfirmReschedule, confirming }: { data: Tracking; onConfirm: () => void; onConfirmReschedule: () => void; confirming: boolean }) {
  const [showAddress, setShowAddress] = useState(false);
  const events = [...(data.events || [])].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
  const delivered = data.status === 'DELIVERED';

  return (
    <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,.94fr)]">
      <div className="grid gap-5">
        <section className="overflow-hidden rounded-[1.5rem] border border-[#efe3eb] bg-white shadow-[0_12px_30px_rgba(95,35,73,.05)]">
          <div className="flex items-center gap-3 border-b border-[#f2e9ef] px-5 py-4 sm:px-6">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#fff0f7] text-[#d62280]"><FiMapPin size={20} aria-hidden="true" /></span>
            <div><h2 className="mb-0 text-base font-extrabold text-[#352735]">Rute pengiriman</h2><p className="mb-0 text-xs text-[#8d7e89]">Dari toko pengirim menuju hub penanganan</p></div>
          </div>
          <div className="grid gap-4 px-5 py-5 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:px-6 sm:py-6">
            <div className="rounded-2xl bg-[#fff0f7] px-4 py-4">
              <span className="mb-1 block text-xs font-semibold text-[#a85079]">Dijemput dari</span>
              <strong className="block text-sm text-[#422f3c]">{data.sender_name || 'Toko pengirim'}</strong>
            </div>
            <FiArrowRight className="hidden text-[#d9a6bf] sm:block" size={20} aria-hidden="true" />
            <div className="rounded-2xl bg-[#fff5dc] px-4 py-4">
              <span className="mb-1 block text-xs font-semibold text-[#a47835]">Diproses di</span>
              <strong className="block text-sm text-[#422f3c]">{data.destination || 'Tujuan'}</strong>
            </div>
          </div>
          {data.is_customer ? (
            <div className="border-t border-[#f2e9ef] px-5 py-4 sm:px-6">
              <button type="button" onClick={() => setShowAddress((current) => !current)} aria-expanded={showAddress} className="flex w-full items-center justify-between gap-3 text-left text-sm font-bold text-[#bd1f70]">
                {showAddress ? 'Sembunyikan alamat lengkap' : 'Lihat alamat lengkap'}
                <FiChevronDown size={18} className={`transition-transform ${showAddress ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {showAddress ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-[#fffafd] p-4 text-sm"><p className="mb-1 text-xs font-semibold text-[#92838f]">Pengirim</p><strong>{data.sender_name || '—'}</strong><p className="mb-0 mt-1 text-[#756875]">{data.origin_address || 'Alamat tidak tersedia'}</p></div>
                  <div className="rounded-xl bg-[#fffafd] p-4 text-sm"><p className="mb-1 text-xs font-semibold text-[#92838f]">Penerima</p><strong>{data.recipient_name || '—'}</strong><p className="mb-0 mt-1 text-[#756875]">{data.destination_address || 'Alamat tidak tersedia'}</p></div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="rounded-[1.5rem] border border-[#efe3eb] bg-white p-5 shadow-[0_12px_30px_rgba(95,35,73,.05)] sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-extrabold text-[#352735]"><FiBox className="text-[#d62280]" aria-hidden="true" /> Informasi paket</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl bg-[#fff3d9] p-4"><p className="mb-1 text-xs text-[#8b7045]">Berat paket</p><strong className="text-base text-[#3d3039]">{packageWeight(data.parcel?.weight_grams)}</strong></div>
            <div className="rounded-2xl bg-[#eaf7f6] p-4"><p className="mb-1 text-xs text-[#567b78]">Dimensi</p><strong className="text-sm text-[#3d3039]">{packageDimensions(data.parcel)}</strong></div>
          </div>
        </section>

        {data.issue && !delivered ? (
          <section className="rounded-[1.5rem] border border-[#f2d9d2] bg-[#fff9ec] p-5 sm:p-6">
            <h2 className="mb-2 flex items-center gap-2 text-base font-bold text-[#854b33]"><FiAlertCircle aria-hidden="true" /> Informasi pengantaran</h2>
            <p className="mb-1 text-sm text-[#6f5e58]">{data.issue.failure_reason ? failureReasonLabel(data.issue.failure_reason) : 'Paket memerlukan tindak lanjut pengantaran.'}</p>
            {data.issue.scheduled_redelivery_at ? <p className="mb-0 text-sm font-semibold text-[#854b33]">Dijadwalkan ulang: {dateTime(data.issue.scheduled_redelivery_at)}</p> : null}
            {data.is_customer && data.issue.decision === 'RESCHEDULE' && data.status === 'WAITING_REDELIVERY' ? (
              data.issue.reschedule_confirmed
                ? <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#248359]"><FiCheckCircle size={18} /> Jadwal pengantaran ulang sudah dikonfirmasi.</p>
                : <Button type="button" onClick={onConfirmReschedule} loading={confirming} icon="check" className="mt-3 w-full justify-center rounded-xl! sm:w-auto">Konfirmasi jadwal ulang</Button>
            ) : null}
            {data.issue.decision === 'RETURN_TO_SELLER' ? <p className="mb-0 text-sm font-semibold text-[#854b33]">Paket akan dikembalikan ke pengirim.</p> : null}
          </section>
        ) : null}

        {data.is_customer && data.attempts?.length ? (
          <section className="rounded-[1.5rem] border border-[#efe3eb] bg-white p-5 shadow-[0_12px_30px_rgba(95,35,73,.05)] sm:p-6" aria-labelledby="attempt-history-title">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
              <div><h2 id="attempt-history-title" className="mb-1 text-base font-extrabold text-[#352735]">Riwayat percobaan pengantaran</h2><p className="mb-0 text-xs text-[#8d7e89]">Setiap percobaan tersimpan pada nomor resi yang sama.</p></div>
              <span className="rounded-full bg-[#fff0f7] px-3 py-1 text-xs font-bold text-[#ad266a]">{data.attempts.length} percobaan</span>
            </div>
            <ol className="m-0 grid list-none gap-3 p-0">
              {data.attempts.map((attempt) => <li key={attempt.attempt_no} className={`rounded-2xl border p-4 ${attempt.result === 'DELIVERED' ? 'border-[#c9ead6] bg-[#f4fcf7]' : 'border-[#f3dfc4] bg-[#fffbf2]'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-[#3d3039]">Percobaan ke-{attempt.attempt_no}</strong><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${attempt.result === 'DELIVERED' ? 'bg-[#dff5e8] text-[#207449]' : 'bg-[#fff0d5] text-[#9c6229]'}`}>{attempt.result === 'DELIVERED' ? 'Berhasil diantar' : 'Belum berhasil'}</span></div>
                <p className="mb-1 mt-2 text-sm leading-6 text-[#5f505b]">{attempt.result === 'DELIVERED' ? `Diterima oleh ${attempt.recipient_name || 'penerima'}` : failureReasonLabel(attempt.failure_reason)}</p>
                <time className="text-xs text-[#8b7c86]">{dateTime(attempt.attempted_at)} WIB</time>
              </li>)}
            </ol>
          </section>
        ) : null}

        {data.is_customer ? (
          <section className="rounded-[1.5rem] border border-[#efe3eb] bg-white p-5 shadow-[0_12px_30px_rgba(95,35,73,.05)] sm:p-6">
            <h2 className="mb-1 text-base font-extrabold text-[#352735]">Foto perjalanan paket</h2>
            <p className="mb-4 text-xs leading-5 text-[#897b88]">Foto tersedia setelah paket dijemput atau diantar.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <EvidencePhoto awb={data.awb} kind="pickup" available={data.pickup_photo_available} takenAt={data.pickup_photo_taken_at} address={data.origin_address} />
              <EvidencePhoto awb={data.awb} kind="delivery" available={delivered && data.proof_available} takenAt={data.delivery_photo_taken_at} address={data.destination_address} />
            </div>
            {delivered ? (
              <div className="mt-5 border-t border-[#f0e9ee] pt-5">
                {data.recipient_confirmed ? (
                  <p className="mb-0 flex items-center gap-2 text-sm font-semibold text-[#28845c]"><FiCheckCircle size={19} /> Penerimaan paket sudah dikonfirmasi.</p>
                ) : (
                  <Button type="button" onClick={onConfirm} loading={confirming} icon="check" className="w-full justify-center rounded-xl! sm:w-auto">Konfirmasi paket diterima</Button>
                )}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      <section className="rounded-[1.5rem] border border-[#efe3eb] bg-white p-5 shadow-[0_12px_30px_rgba(95,35,73,.05)] sm:p-6">
        <div className="mb-6 flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#fff0f7] text-[#d62280]"><FiTruck size={20} aria-hidden="true" /></span>
          <div><h2 className="mb-0 text-base font-extrabold text-[#352735]">Riwayat perjalanan</h2><p className="mb-0 text-xs text-[#8d7e89]">Pembaruan terbaru berada di atas</p></div>
        </div>
        {events.length ? (
          <ol className="relative ml-3 border-l-2 border-[#f4d8e7]">
            {events.map((event, index) => (
              <li key={event.id || `${event.event_type}-${event.occurred_at}-${index}`} className="relative pb-7 pl-7 last:pb-0">
                <span className={`absolute -left-[17px] top-0 flex h-8 w-8 items-center justify-center rounded-full border-4 border-white ${index === 0 ? 'bg-[#ec1688] text-white' : 'bg-[#eff0f2] text-[#87918f]'}`}><FiCheck size={15} aria-hidden="true" /></span>
                <div className={index === 0 ? 'rounded-xl bg-[#fff1f7] p-3' : ''}>
                  <strong className={`block text-sm leading-5 ${index === 0 ? 'text-[#b91f70]' : 'text-[#453943]'}`}>{eventDescription(event)}</strong>
                  {event.hub_name || event.location ? <p className="mb-0 mt-1 text-xs text-[#817580]">{event.hub_name || event.location}</p> : null}
                  <time className="mt-1 block text-xs text-[#988b96]">{dateTime(event.occurred_at)}</time>
                </div>
              </li>
            ))}
          </ol>
        ) : <Empty icon="clock" title="Belum ada pembaruan" detail="Riwayat paket akan muncul setelah status berubah." />}
      </section>
    </div>
  );
}

export function TrackingDetailPage({ awb, searchAwbs, toast }: { awb: string; searchAwbs?: string; toast: (message: string, tone?: 'success' | 'error') => void }) {
  const [data, setData] = useState<Tracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const backHref = `/tracking?awb=${encodeURIComponent(searchAwbs || awb)}`;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [awb]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    get<unknown>(`/api/v1/tracking/${encodeURIComponent(awb)}`)
      .then((raw) => { if (active) setData(unwrap<Tracking>(raw)); })
      .catch((cause) => {
        if (active) {
          setData(null);
          setError(cause instanceof Error ? cause.message : 'Detail paket tidak dapat dimuat.');
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [awb, retry]);

  useEffect(() => {
    let active = true;
    const refreshTracking = () => {
      if (document.visibilityState === 'hidden') return;
      get<unknown>(`/api/v1/tracking/${encodeURIComponent(awb)}`)
        .then((raw) => { if (active) setData(unwrap<Tracking>(raw)); })
        .catch(() => undefined);
    };
    document.addEventListener('visibilitychange', refreshTracking);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', refreshTracking);
    };
  }, [awb]);

  const copyAwb = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.awb);
      toast('Nomor resi disalin.');
    } catch {
      toast('Nomor resi belum dapat disalin.', 'error');
    }
  };

  const confirmReschedule = async () => {
    if (!data) return;
    setConfirming(true);
    try {
      await post(`/api/v1/tracking/${encodeURIComponent(data.awb)}/confirm-reschedule`);
      toast('Jadwal pengantaran ulang sudah dikonfirmasi.');
      setRetry((current) => current + 1);
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : 'Konfirmasi jadwal belum berhasil.', 'error');
    } finally {
      setConfirming(false);
    }
  };

  const confirmReceived = async () => {
    if (!data) return;
    setConfirming(true);
    try {
      await post(`/api/v1/tracking/${encodeURIComponent(data.awb)}/confirm-received`);
      toast('Terima kasih, penerimaan paket sudah dikonfirmasi.');
      setRetry((current) => current + 1);
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : 'Konfirmasi belum berhasil. Coba lagi.', 'error');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="page mx-auto max-w-6xl">
      <Link to={backHref} className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#eadce5] bg-white px-4 text-sm font-bold text-[#ac286d] hover:bg-[#fff0f7]">
        <FiArrowLeft size={17} aria-hidden="true" /> Kembali ke hasil pencarian
      </Link>
      <header className="relative isolate overflow-hidden rounded-[1.75rem] bg-[#ec1688] px-5 py-6 text-white shadow-[0_18px_45px_rgba(158,24,92,.14)] sm:px-8 sm:py-8">
        <div aria-hidden="true" className="absolute -right-14 -top-24 h-64 w-64 rounded-full bg-[#ff6aae]/60" />
        <div aria-hidden="true" className="absolute -bottom-20 right-32 h-44 w-44 rounded-full bg-[#ffc84f]/90" />
        <div className="relative z-10 grid gap-5 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center">
          <div>
            <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1.5 text-xs font-bold"><FiTruck size={14} aria-hidden="true" /> Pelacakan Anteraja</span>
            <h1 className="mb-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Detail perjalanan paket</h1>
            <p className="mb-4 text-sm text-white/85">Ikuti setiap langkah paketmu sampai tujuan.</p>
            <div className="flex max-w-md items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-[#392c36] shadow-sm">
              <div className="min-w-0"><span className="mb-0.5 block text-[11px] font-semibold text-[#907d8c]">Nomor resi</span><strong className="block break-all font-mono text-base tracking-[.04em] sm:text-lg">{awb}</strong></div>
              <button type="button" onClick={copyAwb} disabled={!data} aria-label="Salin nomor resi" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fff0f7] text-[#c21d73] transition hover:bg-[#ffe0ee] disabled:opacity-50"><FiCopy size={18} aria-hidden="true" /></button>
            </div>
            {data ? <div className="mt-4 flex flex-wrap items-center gap-2 text-xs"><span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-bold text-[#b91e6d]"><FiCheckCircle size={14} aria-hidden="true" />{statusLabel(data.status)}</span><span className="text-white/90">Diperbarui {dateTime(data.latest_update)}</span><button type="button" onClick={() => setRetry((current) => current + 1)} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/60 bg-white/15 px-3 font-bold text-white hover:bg-white/25 disabled:opacity-60"><FiRefreshCw size={15} aria-hidden="true" />Perbarui status</button></div> : null}
          </div>
          <div aria-hidden="true" className="hidden h-28 w-28 -rotate-6 items-center justify-center rounded-[1.8rem] border-4 border-white/90 bg-[#ffcd48] text-[#d41475] shadow-xl sm:flex"><FiBox size={54} /></div>
        </div>
      </header>
      {loading ? <Loading label="Mengambil detail paket…" /> : null}
      {error ? <div className="mt-5 rounded-2xl border border-[#f2d6de] bg-[#fff5f6] p-4 text-sm text-[#9d3455]" role="alert">
        {error}<button type="button" onClick={() => setRetry((current) => current + 1)} className="ml-2 font-bold underline">Coba lagi</button>
      </div> : null}
      {data && !loading ? <TrackingDetails key={data.awb} data={data} onConfirm={confirmReceived} onConfirmReschedule={confirmReschedule} confirming={confirming} /> : null}
    </div>
  );
}
