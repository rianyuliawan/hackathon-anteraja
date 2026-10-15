import { Link } from 'react-router-dom';
import { FiArrowLeft, FiClock, FiFileText, FiMapPin, FiMessageCircle, FiPackage, FiTruck } from 'react-icons/fi';
import { unwrap } from '../lib/api';
import type { HubShipmentHistory } from '../lib/types';
import { Badge, Button, dateTime, Empty, ErrorBox, Loading, useResource } from '../ui';
import { PrivatePhotoViewer } from '../components/PrivatePhotoViewer';
import { eventDescription, failureReasonLabel } from './TrackingDetailPage';

const recipientLabels: Record<string, string> = {
  BUYER: 'Pelanggan', COURIER: 'Kurir', HUB_OPERATOR: 'Operator hub',
  OPS_ADMIN: 'Admin operasional', SELLER: 'Pengirim',
};

export function HubHistoryPage({ hubId, awb }: { hubId: number; awb: string }) {
  const { data, loading, error, reload } = useResource<HubShipmentHistory>(
    `/api/v1/hubs/${hubId}/shipments/${awb}/history`,
    (raw) => unwrap<HubShipmentHistory>(raw),
  );
  const shipment = data?.shipment;

  return <div className="page mx-auto max-w-6xl">
    <Link to="/hub-overview" className="mb-4 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[#ad286c] hover:underline"><FiArrowLeft size={17} /> Kembali ke ringkasan hub</Link>
    {loading ? <Loading label="Memuat riwayat paket…" /> : error ? <ErrorBox error={error} retry={reload} /> : !shipment || !data ? <Empty icon="package" title="Riwayat paket tidak tersedia" /> : <>
      <header className="mb-5 rounded-[1.5rem] border border-[#f2d7e4] bg-[#fff4f8] p-5 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><span className="text-xs font-extrabold uppercase tracking-wider text-[#ad3474]">Riwayat paket · {data.hub_name}</span><Badge status={shipment.status} /></div>
        <h1 className="mb-2 break-all font-mono text-2xl font-extrabold text-[#392c38] sm:text-3xl">{awb}</h1>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#6b5866]"><span className="inline-flex items-center gap-2"><FiPackage size={16} />{shipment.recipient_name || 'Penerima'}</span><span className="inline-flex items-center gap-2"><FiClock size={16} />Dibuat {dateTime(shipment.created_at)}</span></div>
        <div className="mt-4"><Button type="button" size="small" variant="secondary" icon="refresh" onClick={reload}>Perbarui riwayat</Button></div>
      </header>

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-[#eee3e9] bg-white p-5"><div className="mb-2 flex items-center gap-2 font-bold text-[#453542]"><FiMapPin className="text-[#d22179]" /> Alamat pengantaran</div><p className="mb-1 text-sm leading-6 text-[#615360]">{shipment.destination_address || 'Alamat belum tersedia'}</p><small className="text-[#8b7b87]">Kode pos {shipment.destination_postcode || '—'}</small></section>
        <section className="rounded-2xl border border-[#eee3e9] bg-white p-5"><div className="mb-2 flex items-center gap-2 font-bold text-[#453542]"><FiTruck className="text-[#d22179]" /> Asal paket</div><p className="mb-1 text-sm font-semibold text-[#615360]">{shipment.sender_name || 'Pengirim'}</p><small className="leading-5 text-[#8b7b87]">{shipment.origin_address || 'Alamat asal belum tersedia'}</small></section>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]">
        <div className="grid gap-5">
          <section className="rounded-[1.5rem] border border-[#eee2e9] bg-white p-5 sm:p-6" aria-labelledby="hub-attempts-title">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 id="hub-attempts-title" className="mb-1 text-lg font-extrabold text-[#382c38]">Percobaan pengantaran</h2><p className="mb-0 text-xs text-[#8a7a87]">Semua hasil tetap tercatat pada resi ini.</p></div><span className="rounded-full bg-[#fff0f7] px-3 py-1 text-xs font-bold text-[#ac286b]">{data.attempts.length} percobaan</span></div>
            {data.attempts.length ? <ol className="m-0 grid list-none gap-3 p-0">{data.attempts.map((attempt) => <li key={attempt.id} className={`rounded-2xl border p-4 ${attempt.result === 'DELIVERED' ? 'border-[#c9ead7] bg-[#f5fcf7]' : 'border-[#f0dcc6] bg-[#fffbf3]'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-[#3e303b]">Percobaan ke-{attempt.attempt_no}</strong><Badge status={attempt.result} /></div>
              <p className="mb-1 mt-2 text-sm font-semibold text-[#5e4b58]">{attempt.result === 'DELIVERED' ? `Diterima oleh ${attempt.recipient_name || 'penerima'}` : failureReasonLabel(attempt.failure_reason)}</p>
              <p className="mb-2 text-xs text-[#766774]">{attempt.courier_name || 'Kurir'} · Tugas #{attempt.run_id} · {dateTime(attempt.attempted_at)} WIB</p>
              {attempt.notes ? <p className="mb-2 rounded-xl bg-white/75 px-3 py-2 text-xs leading-5 text-[#6f5d69]">Catatan kurir: {attempt.notes}</p> : null}
              {attempt.result === 'DELIVERED' && attempt.photo_available ? <PrivatePhotoViewer path={`/api/v1/shipments/${shipment.id}/delivery-photo`} kind="delivery" awb={awb} takenAt={attempt.attempted_at} address={shipment.destination_address} /> : null}
            </li>)}</ol> : <Empty icon="truck" title="Belum ada percobaan pengantaran" />}
          </section>

          {data.issues.length ? <section className="rounded-[1.5rem] border border-[#eee2e9] bg-white p-5 sm:p-6" aria-labelledby="hub-decisions-title"><h2 id="hub-decisions-title" className="mb-4 text-lg font-extrabold text-[#382c38]">Keputusan tindak lanjut</h2><ol className="m-0 grid list-none gap-3 p-0">{data.issues.map((issue) => <li key={issue.id} className="rounded-xl border border-[#f0e6eb] bg-[#fffafc] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">Setelah percobaan ke-{issue.attempt_no}</strong><Badge status={issue.status} /></div><p className="mb-1 mt-2 text-sm text-[#62515e]">{issue.decision === 'RESCHEDULE' ? 'Dijadwalkan untuk pengantaran ulang' : issue.decision === 'RETURN_TO_SELLER' ? 'Dikembalikan ke pengirim' : 'Menunggu keputusan operator'}</p>{issue.scheduled_redelivery_at ? <p className="mb-1 text-xs text-[#775f70]">Jadwal baru: {dateTime(issue.scheduled_redelivery_at)} WIB</p> : null}{issue.decision_note ? <p className="mb-1 text-xs text-[#775f70]">Catatan: {issue.decision_note}</p> : null}<small className="text-[#8c7b87]">{issue.decided_by_name || 'Belum diputuskan'} · {dateTime(issue.decided_at || issue.created_at)}</small></li>)}</ol></section> : null}
          {data.pickup_photo_available ? <section className="rounded-[1.5rem] border border-[#eee2e9] bg-white p-5 sm:p-6"><h2 className="mb-3 text-lg font-extrabold text-[#382c38]">Bukti penjemputan</h2><PrivatePhotoViewer path={`/api/v1/shipments/${shipment.id}/pickup-photo`} kind="pickup" awb={awb} takenAt={data.pickup_photo_taken_at} address={shipment.origin_address} /></section> : null}
        </div>

        <div className="grid gap-5">
          <section className="rounded-[1.5rem] border border-[#eee2e9] bg-white p-5 sm:p-6" aria-labelledby="hub-events-title"><div className="mb-4 flex items-center gap-2"><FiFileText className="text-[#d22179]" /><h2 id="hub-events-title" className="mb-0 text-lg font-extrabold text-[#382c38]">Riwayat proses</h2></div>{data.events.length ? <ol className="relative ml-2 border-l-2 border-[#f0d9e6]">{[...data.events].reverse().map((event) => <li key={event.id} className="relative pb-5 pl-6 last:pb-0"><span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-[#e91b83] ring-4 ring-white" /><strong className="block text-sm leading-5 text-[#4b3947]">{eventDescription(event)}</strong>{typeof event.details?.reason === 'string' ? <p className="mb-0 mt-1 text-xs text-[#8c536e]">Alasan: {event.details.reason}</p> : null}<p className="mb-0 mt-1 text-xs text-[#776875]">{event.actor_name || 'Sistem'}{event.hub_name ? ` · ${event.hub_name}` : ''}</p><time className="text-xs text-[#998b95]">{dateTime(event.occurred_at)} WIB</time></li>)}</ol> : <Empty icon="clock" title="Belum ada pembaruan proses" />}</section>
          <section className="rounded-[1.5rem] border border-[#eee2e9] bg-white p-5 sm:p-6" aria-labelledby="hub-messages-title"><div className="mb-4 flex items-center gap-2"><FiMessageCircle className="text-[#d22179]" /><h2 id="hub-messages-title" className="mb-0 text-lg font-extrabold text-[#382c38]">Riwayat pemberitahuan</h2></div>{data.notifications.length ? <ol className="m-0 grid list-none gap-3 p-0">{data.notifications.map((message) => <li key={message.id} className="rounded-xl border border-[#f0e5eb] p-3.5"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs text-[#493947]">{recipientLabels[message.logical_recipient] || message.logical_recipient}{message.recipient_name ? ` · ${message.recipient_name}` : ''}</strong><Badge status={message.status} /></div><p className="mb-1 mt-2 text-xs text-[#766671]">{eventDescription({ event_type: message.template_key, occurred_at: message.created_at })}</p><small className="text-[#94858f]">{message.sent_at ? 'Dikirim' : 'Dicatat'} {dateTime(message.sent_at || message.created_at)} WIB</small>{message.status === 'FAILED' && message.last_error ? <p className="mb-0 mt-2 text-xs text-[#a34453]">Gagal dikirim: {message.last_error}</p> : null}</li>)}</ol> : <Empty icon="bell" title="Belum ada pemberitahuan untuk paket ini" />}</section>
        </div>
      </div>
    </>}
  </div>;
}
