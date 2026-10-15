import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { DeliveryRouteMap } from '../components/DeliveryRouteMap';
import { HubAwbSearch } from '../components/HubAwbSearch';
import { LiveCameraCapture, type CapturedPhoto } from '../components/LiveCameraCapture';
import { PrivatePhotoViewer } from '../components/PrivatePhotoViewer';
import useRefreshOnReturn from '../hooks/useRefreshOnReturn';
import { get, list, newActionKey, post, unwrap, upload } from '../lib/api';
import type { DeliveryRun, PickupAssignment, RunShipment, Shipment } from '../lib/types';
import { Badge, Button, dateOnly, dateTime, Empty, ErrorBox, errorMessage, Field, Icon, Loading, Modal, Notice, PageHeader, Panel, phoneHref, todayJakarta, useResource } from '../ui';
import { ContactOptions } from './ContactOptions';

type Toast = (message: string, tone?: 'success' | 'error') => void;
const failureLabels: Record<string, string> = {
  PENERIMA_TIDAK_ADA: 'Penerima tidak ada di lokasi', ALAMAT_TIDAK_DITEMUKAN: 'Alamat tidak ditemukan',
  PENERIMA_MENOLAK: 'Penerima menolak paket', AKSES_TERHALANG: 'Akses ke alamat terhalang', LAINNYA: 'Alasan lainnya',
};
const pickupAwb = (item: PickupAssignment) => item.awb || item.shipment?.awb || item.task?.shipment?.awb || `Tugas #${item.id}`;
const runItems = (run: DeliveryRun) => [...(run.shipments || run.run_shipments || [])].sort((a, b) => a.stop_order - b.stop_order);
const stopAddress = (item: RunShipment) => item.destination_address_snapshot || item.shipment?.order?.destination_address_snapshot || item.shipment?.destination_address_snapshot || 'Alamat tujuan tercatat pada tugas';

type CourierParcelResult = {
  id: number;
  awb: string;
  status: string;
  recipient_name: string;
  destination_address_snapshot: string;
  updated_at: string;
};

type CourierParcelDetail = {
  shipment: Shipment;
  hub_name: string | null;
  pickup_photo_available: boolean;
  pickup_photo_taken_at: string | null;
  assignments: Array<{ id: number; run_id: number; stop_order: number; status: string; rejection_reason: string | null; service_date: string; run_status: string; assigned_at: string }>;
  attempts: Array<{ attempt_no: number; result: 'DELIVERED' | 'FAILED'; failure_reason: string | null; notes: string | null; recipient_name: string | null; attempted_at: string; photo_available: boolean }>;
};


function CompletePickup({ assignment, onClose, onDone, toast }: { assignment: PickupAssignment; onClose: () => void; onDone: () => void; toast: Toast }) {
  const [awb, setAwb] = useState(pickupAwb(assignment));
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [actionKey] = useState(newActionKey);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!photo) { setError('Ambil foto paket dari kamera sebelum menyelesaikan penjemputan.'); return; }
    setBusy(true); setError('');
    try {
      const form = new FormData();
      form.append('awb', awb.trim()); form.append('photo', photo.file); form.append('captured_at', photo.capturedAt);
      await upload(`/api/v1/courier/pickup-assignments/${assignment.id}/complete`, form, actionKey);
      toast('Penjemputan selesai. Bawa paket ke hub dan serahkan kepada operator.'); onDone(); onClose();
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return <Modal title="Konfirmasi penjemputan" onClose={onClose} wide><form className="grid gap-5" onSubmit={submit}>
    <section className="rounded-2xl border border-[#f2d4e3] bg-[#fff5fa] p-4 sm:p-5">
      <span className="mb-2 inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-[#af2a70]">Langkah 2 dari 3 · Ambil paket</span>
      <h3 className="mb-1 text-base font-extrabold text-[#3c2c38]">{assignment.seller_name || 'Toko pengirim'}</h3>
      <p className="mb-3 break-words text-sm leading-6 text-[#6f5d69]">{assignment.seller_address || 'Alamat toko tercatat pada tugas'}</p>
      <div className="flex items-start gap-2 rounded-xl bg-white p-3 text-xs leading-5 text-[#695665]"><Icon name="package" size={17}/><span>Setelah foto disimpan, bawa paket ke <strong>{assignment.hub_name || 'hub penugasan'}</strong> untuk dikonfirmasi operator.</span></div>
    </section>
    <Field label="Cocokkan nomor resi pada paket" required><input required value={awb} onChange={(event) => setAwb(event.target.value.replace(/\D/g, '').slice(0, 14))} inputMode="numeric" autoComplete="off" pattern="[0-9]{14}" maxLength={14} className="min-h-12 font-mono text-base tracking-wide" /></Field>
    <div className="rounded-2xl border border-[#eee2e9] bg-white p-3 sm:p-4"><LiveCameraCapture label="Foto paket saat diambil *" photo={photo} onCapture={setPhoto} filePrefix="bukti-pickup" compactMobile /></div>
    {error ? <Notice tone="error">{error}</Notice> : null}
    <div className="sticky bottom-0 z-10 -mx-1 flex flex-col-reverse gap-2 border-t border-[#eee2e9] bg-white/95 px-1 py-3 backdrop-blur sm:flex-row sm:justify-end"><Button type="button" variant="secondary" onClick={onClose} className="min-h-12 w-full sm:w-auto">Batal</Button><Button type="submit" loading={busy} disabled={!photo} icon="camera" className="min-h-12 w-full whitespace-normal text-center sm:w-auto">Simpan foto &amp; selesaikan</Button></div>
  </form></Modal>;
}

function PickupCard({ item, busy, onAccept, onComplete }: { item: PickupAssignment; busy: boolean; onAccept: () => void; onComplete: () => void }) {
  const awb = pickupAwb(item);
  const phone = item.seller_phone || item.shipment?.order?.origin_contact_snapshot;
  return <article className="rounded-2xl border border-[#eee2e9] bg-white p-4 shadow-sm sm:p-5">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2"><div><p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#b12d72]">{item.seller_name || 'Toko pengirim'}</p><h3 className="m-0 font-mono text-base font-extrabold">{awb}</h3></div><Badge status={item.status} /></div>
    <p className="mb-3 flex items-start gap-2 break-words text-sm text-[#5f535e]"><Icon name="pin" size={17} />{item.seller_address || 'Alamat toko tercatat pada tugas'}</p>
    <div className="mb-4 grid gap-2 rounded-xl bg-[#faf6f9] p-3 text-xs text-[#766a74] sm:grid-cols-2"><span><strong className="block text-[#4f3d49]">Jadwal penjemputan</strong>{dateTime(item.scheduled_at)}</span><span><strong className="block text-[#4f3d49]">Kembalikan ke hub</strong>{item.hub_name || 'Hub penugasan'}{item.hub_address ? ` · ${item.hub_address}` : ''}</span></div>
    {item.status === 'PENDING_ACCEPT' ? <div className="grid gap-2 sm:flex sm:items-center sm:justify-between"><span className="text-xs text-[#877681]">Terima tugas sebelum menuju toko.</span><Button loading={busy} onClick={onAccept} className="min-h-11 w-full sm:w-auto">Terima tugas</Button></div> : null}
    {['ACCEPTED', 'IN_PROGRESS'].includes(item.status) ? <div className="grid gap-2 sm:flex sm:flex-wrap"><Button icon="camera" onClick={onComplete} className="min-h-11 w-full whitespace-normal sm:w-auto">Foto &amp; konfirmasi paket</Button>{phone ? <a href={phoneHref(phone)} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#e7d8e2] px-3 text-xs font-bold text-[#b42a72]"><Icon name="phone" size={15} />Hubungi toko</a> : null}</div> : null}
    {item.status === 'COMPLETED' ? <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-[#4c805f]">Foto tersimpan. Bawa paket ke hub untuk dikonfirmasi operator.</span>{item.shipment_id ? <PrivatePhotoViewer path={`/api/v1/shipments/${item.shipment_id}/pickup-photo`} awb={awb} takenAt={item.picked_up_at} address={item.seller_address} /> : null}</div> : null}
  </article>;
}

export function CourierOverview() {
  const pickups = useResource<PickupAssignment[]>('/api/v1/courier/pickup-assignments', (raw) => list<PickupAssignment>(raw));
  const runs = useResource<DeliveryRun[]>('/api/v1/courier/delivery-runs', (raw) => list<DeliveryRun>(raw));
  const refresh = () => { pickups.reload(); runs.reload(); };
  useRefreshOnReturn(refresh);
  const pickupPending = pickups.data?.filter((item) => item.status === 'PENDING_ACCEPT').length || 0;
  const pickupActive = pickups.data?.filter((item) => ['ACCEPTED', 'IN_PROGRESS'].includes(item.status)).length || 0;
  const runPending = runs.data?.filter((run) => run.status === 'PENDING_ACCEPT').length || 0;
  const runWaiting = runs.data?.filter((run) => run.status === 'ACCEPTED').length || 0;
  const activeStops = runs.data?.flatMap((run) => run.status === 'OUT_FOR_DELIVERY' ? runItems(run) : []).filter((item) => item.status === 'HANDED_OVER').length || 0;
  const next = activeStops ? { title: `${activeStops} paket perlu diantar`, detail: 'Ikuti urutan tujuan dan catat hasil setiap paket.', href: '/courier-deliveries', action: 'Lanjutkan pengantaran' }
    : runPending ? { title: `${runPending} tugas antar baru`, detail: 'Tinjau daftar paket, lalu terima atau tolak dengan alasan.', href: '/courier-deliveries', action: 'Tinjau tugas' }
      : pickupPending ? { title: `${pickupPending} tugas penjemputan baru`, detail: 'Terima tugas, datangi toko, lalu foto paket saat diambil.', href: '/courier-pickups', action: 'Lihat penjemputan' }
        : pickupActive ? { title: `${pickupActive} penjemputan berjalan`, detail: 'Cocokkan AWB dan ambil foto dari kamera di toko.', href: '/courier-pickups', action: 'Lanjutkan penjemputan' }
          : runWaiting ? { title: 'Menunggu serah terima hub', detail: 'Tugas sudah diterima. Operator hub akan menyerahkan paket sebelum berangkat.', href: '/courier-deliveries', action: 'Lihat tugas' } : null;
  return <div className="page"><PageHeader eyebrow="Ruang kerja kurir" title="Tugas saya" subtitle="Lihat tugas berikutnya dari hub, lalu selesaikan setiap langkah sesuai status paket." action={<Button variant="secondary" icon="refresh" onClick={refresh}>Perbarui</Button>} />
    {pickups.loading || runs.loading ? <Loading /> : pickups.error || runs.error ? <ErrorBox error={pickups.error || runs.error} retry={refresh} /> : <>
      <section className="mb-5 rounded-[1.5rem] border border-[#f4cddd] bg-[#fff1f7] p-5 sm:p-6"><span className="text-xs font-bold uppercase tracking-wide text-[#ac3573]">Langkah berikutnya</span>{next ? <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="mb-1 text-xl font-extrabold text-[#412d3b]">{next.title}</h2><p className="m-0 text-sm leading-6 text-[#766674]">{next.detail}</p></div><Link to={next.href} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#e91681] px-5 text-sm font-bold text-white">{next.action}<Icon name="chevron" size={17} /></Link></div> : <p className="mb-0 mt-2 text-sm text-[#766674]">Belum ada tugas yang perlu ditindaklanjuti. Tugas baru akan muncul otomatis.</p>}</section>
      <div className="grid gap-3 sm:grid-cols-3"><Link to="/courier-pickups" className="rounded-2xl border border-[#eee1e8] bg-white p-4"><strong className="block text-2xl text-[#d62280]">{pickupPending + pickupActive}</strong><span className="text-sm text-[#6e5d69]">Penjemputan perlu ditangani</span></Link><Link to="/courier-deliveries" className="rounded-2xl border border-[#eee1e8] bg-white p-4"><strong className="block text-2xl text-[#d62280]">{runPending + runWaiting}</strong><span className="text-sm text-[#6e5d69]">Tugas antar menunggu</span></Link><Link to="/courier-deliveries" className="rounded-2xl border border-[#eee1e8] bg-white p-4"><strong className="block text-2xl text-[#d62280]">{activeStops}</strong><span className="text-sm text-[#6e5d69]">Paket masih di jalan</span></Link></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><Link to="/courier-pickups" className="flex items-center gap-3 rounded-2xl border border-[#eee1e8] bg-white p-4"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#fff0f7] text-[#d62280]"><Icon name="package" /></span><span className="flex-1"><strong className="block">Penjemputan dari toko</strong><small className="text-[#81717d]">Terima → foto paket → serahkan ke hub</small></span><Icon name="chevron" size={17} /></Link><Link to="/courier-deliveries" className="flex items-center gap-3 rounded-2xl border border-[#eee1e8] bg-white p-4"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#fff0f7] text-[#d62280]"><Icon name="truck" /></span><span className="flex-1"><strong className="block">Antar ke penerima</strong><small className="text-[#81717d]">Jawab tugas → ambil di hub → antar → catat hasil</small></span><Icon name="chevron" size={17} /></Link></div>
    </>}
  </div>;
}

export function CourierPickups({ toast }: { toast: Toast }) {
  const { data, loading, error, reload } = useResource<PickupAssignment[]>('/api/v1/courier/pickup-assignments', (raw) => list<PickupAssignment>(raw));
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [complete, setComplete] = useState<PickupAssignment | null>(null);
  const [selectedView, setSelectedView] = useState<'work' | 'history' | null>(null);
  const refresh = () => { setSelectedView(null); reload(); window.dispatchEvent(new Event('courier:work-updated')); };
  useRefreshOnReturn(refresh);
  const accept = async (item: PickupAssignment) => { setBusyId(item.id); try { await post(`/api/v1/courier/pickup-assignments/${item.id}/accept`); toast('Tugas diterima. Datangi toko dan cocokkan paket.'); refresh(); } catch (cause) { toast(errorMessage(cause), 'error'); } finally { setBusyId(null); } };
  const matching = (data || []).filter((item) => pickupAwb(item).includes(search.trim()));
  const pending = matching.filter((item) => item.status === 'PENDING_ACCEPT');
  const active = matching.filter((item) => ['ACCEPTED', 'IN_PROGRESS'].includes(item.status));
  const completed = matching.filter((item) => item.status === 'COMPLETED');
  const activeView = selectedView ?? (pending.length + active.length ? 'work' : 'history');
  const cards = (items: PickupAssignment[]) => <div className="grid gap-3 lg:grid-cols-2">{items.map((item) => <PickupCard key={item.id} item={item} busy={busyId === item.id} onAccept={() => void accept(item)} onComplete={() => setComplete(item)} />)}</div>;
  return <div className="page"><PageHeader eyebrow="Penjemputan dari toko" title="Tugas penjemputan" subtitle="Terima tugas, foto paket saat diambil, lalu bawa kembali ke hub." action={<Button variant="secondary" icon="refresh" onClick={refresh}>Perbarui</Button>} />
    <HubAwbSearch value={search} onChange={(value) => { setSearch(value); setSelectedView(null); }} awbs={(data || []).map(pickupAwb)} />
    {loading ? <Loading /> : error ? <ErrorBox error={error} retry={refresh} /> : <div className="mt-5">
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-[#eee2e9] bg-white p-1" aria-label="Kelompok tugas penjemputan">
        <button type="button" aria-pressed={activeView === 'work'} onClick={() => setSelectedView('work')} className={`min-h-12 rounded-lg px-2 text-xs font-bold sm:text-sm ${activeView === 'work' ? 'bg-[#e91681] text-white' : 'text-[#705f6c] hover:bg-[#fff0f7]'}`}>Perlu dikerjakan · {pending.length + active.length}</button>
        <button type="button" aria-pressed={activeView === 'history'} onClick={() => setSelectedView('history')} className={`min-h-12 rounded-lg px-2 text-xs font-bold sm:text-sm ${activeView === 'history' ? 'bg-[#e91681] text-white' : 'text-[#705f6c] hover:bg-[#fff0f7]'}`}>Selesai · {completed.length}</button>
      </div>
      {activeView === 'work' ? <div className="grid gap-5">{pending.length ? <Panel title={`Tugas baru · ${pending.length}`}>{cards(pending)}</Panel> : null}{active.length ? <Panel title={`Sedang dijemput · ${active.length}`}>{cards(active)}</Panel> : null}{!pending.length && !active.length ? <Empty icon="check" title={search ? 'Tidak ada tugas aktif dengan resi ini' : 'Belum ada penjemputan yang perlu dikerjakan'} /> : null}</div>
        : completed.length ? <Panel title={`Riwayat penjemputan · ${completed.length}`}>{cards(completed)}</Panel> : <Empty icon="package" title={search ? 'Tidak ada riwayat dengan resi ini' : 'Belum ada penjemputan selesai'} />}
    </div>}
    {complete ? <CompletePickup assignment={complete} onClose={() => setComplete(null)} onDone={refresh} toast={toast} /> : null}
  </div>;
}

function DeliveryResult({ runShipment, onClose, onDone, toast }: { runShipment: RunShipment; onClose: () => void; onDone: () => void; toast: Toast }) {
  const [result, setResult] = useState<'DELIVERED' | 'FAILED'>('DELIVERED');
  const [recipient, setRecipient] = useState(runShipment.shipment?.order?.recipient_name || runShipment.recipient_name || '');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [actionKey] = useState(newActionKey);
  const awb = runShipment.awb || runShipment.shipment?.awb || `Paket #${runShipment.shipment_id}`;
  const address = runShipment.destination_address_snapshot || runShipment.shipment?.order?.destination_address_snapshot;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (result === 'DELIVERED' && !photo) { setError('Foto serah terima wajib diambil dari kamera.'); return; }
    if (result === 'FAILED' && !reason) { setError('Pilih alasan gagal kirim.'); return; }
    setBusy(true); setError('');
    try {
      const form = new FormData(); form.append('result', result); form.append('attempted_at', new Date().toISOString());
      if (result === 'DELIVERED') { form.append('recipient_name', recipient); form.append('photo', photo!.file); form.append('captured_at', photo!.capturedAt); }
      if (result === 'FAILED') form.append('failure_reason', reason);
      if (notes.trim()) form.append('notes', notes.trim());
      await upload(`/api/v1/courier/run-shipments/${runShipment.id}/result`, form, actionKey);
      toast(result === 'DELIVERED' ? `${awb} berhasil diantar. Bukti foto tersimpan.` : `${awb} gagal dikirim. Bawa paket kembali ke hub.`);
      onDone(); onClose();
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return <Modal title={`Catat hasil · ${awb}`} onClose={onClose}><form className="form-stack" onSubmit={submit}>
    <div className="rounded-2xl bg-[#fff6fa] p-4 text-sm"><strong>{runShipment.shipment?.order?.recipient_name || runShipment.recipient_name || 'Penerima'}</strong><p className="mb-0 mt-1 text-[#766873]">{address || 'Alamat tujuan tercatat pada tugas'}</p></div>
    <div className="segmented" role="group" aria-label="Hasil pengantaran"><button type="button" className={result === 'DELIVERED' ? 'selected' : ''} onClick={() => { setResult('DELIVERED'); setError(''); }}>Berhasil diterima</button><button type="button" className={result === 'FAILED' ? 'selected' : ''} onClick={() => { setResult('FAILED'); setPhoto(null); setError(''); }}>Gagal dikirim</button></div>
    {result === 'DELIVERED' ? <><Field label="Nama yang menerima" required><input required value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Nama orang yang menerima paket" /></Field><LiveCameraCapture label="Foto serah terima *" photo={photo} onCapture={setPhoto} /></> : <><Field label="Alasan gagal kirim" required><select required value={reason} onChange={(event) => setReason(event.target.value)}><option value="">Pilih alasan</option><option value="PENERIMA_TIDAK_ADA">Penerima tidak ada</option><option value="ALAMAT_TIDAK_DITEMUKAN">Alamat tidak ditemukan</option><option value="PENERIMA_MENOLAK">Penerima menolak paket</option><option value="AKSES_TERHALANG">Akses terhalang</option><option value="LAINNYA">Lainnya</option></select></Field><Notice tone="error">Percobaan gagal tersimpan. Paket tetap tanggung jawab Anda sampai operator hub mengonfirmasi paket kembali.</Notice></>}
    <Field label="Catatan tambahan"><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={result === 'FAILED' ? 'Kondisi di lokasi dan hasil komunikasi' : 'Catatan serah terima (opsional)'} /></Field>
    {error ? <Notice tone="error">{error}</Notice> : null}<div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Batal</Button><Button type="submit" loading={busy} disabled={result === 'DELIVERED' && !photo} variant={result === 'FAILED' ? 'danger' : 'primary'} icon={result === 'DELIVERED' ? 'camera' : 'alert'}>{result === 'DELIVERED' ? 'Simpan bukti terkirim' : 'Laporkan gagal kirim'}</Button></div>
  </form></Modal>;
}

function RespondRun({ run, onClose, onDone, toast }: { run: DeliveryRun; onClose: () => void; onDone: () => void; toast: Toast }) {
  const shipments = runItems(run);
  const [choices, setChoices] = useState<Record<number, { decision: 'ACCEPTED' | 'REJECTED'; reason: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const choose = (id: number, decision: 'ACCEPTED' | 'REJECTED') => setChoices((current) => ({ ...current, [id]: { decision, reason: current[id]?.reason || '' } }));
  const complete = shipments.length > 0 && shipments.every((item) => choices[item.shipment_id] && (choices[item.shipment_id].decision === 'ACCEPTED' || choices[item.shipment_id].reason.trim().length >= 5));
  const submit = async () => {
    if (!complete) { setError('Jawab setiap paket dan isi alasan bila ada yang ditolak.'); return; }
    setBusy(true); setError('');
    try {
      await post(`/api/v1/courier/delivery-runs/${run.id}/respond`, { decisions: shipments.map((item) => ({ shipment_id: item.shipment_id, ...choices[item.shipment_id] })) });
      const rejected = shipments.filter((item) => choices[item.shipment_id].decision === 'REJECTED').length;
      toast(rejected ? `${shipments.length - rejected} paket diterima, ${rejected} kembali ke antrean hub.` : 'Semua paket diterima. Tunggu operator hub menyerahkan paket.');
      onDone(); onClose();
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return <Modal title={`Tinjau tugas antar #${run.id}`} onClose={onClose} wide><div className="form-stack"><Notice>Jawab setiap paket sebelum berangkat. Paket yang ditolak tidak dihitung gagal kirim dan akan ditugaskan ulang oleh hub.</Notice><Button type="button" variant="secondary" onClick={() => setChoices(Object.fromEntries(shipments.map((item) => [item.shipment_id, { decision: 'ACCEPTED', reason: '' }]))) } icon="check">Terima semua paket</Button><div className="selection-list">{shipments.map((item) => {
    const choice = choices[item.shipment_id];
    return <div className="select-row run-response-row" key={item.id}><span><strong>{item.awb || item.shipment?.awb}</strong><small>Tujuan {item.stop_order} · {item.shipment?.order?.recipient_name || item.recipient_name || 'Penerima'}</small><small>{stopAddress(item)}</small>{item.shipment?.last_attempt?.result === 'FAILED' ? <small className="mt-2 rounded-lg bg-amber-50 p-2 text-amber-900">Percobaan sebelumnya: {failureLabels[item.shipment.last_attempt.failure_reason || ''] || item.shipment.last_attempt.failure_reason || 'Gagal kirim'}{item.shipment.last_attempt.notes ? ` · ${item.shipment.last_attempt.notes}` : ''}</small> : null}</span><div className="run-response-actions"><Button type="button" size="small" variant={choice?.decision === 'ACCEPTED' ? 'primary' : 'secondary'} onClick={() => choose(item.shipment_id, 'ACCEPTED')}>Terima</Button><Button type="button" size="small" variant={choice?.decision === 'REJECTED' ? 'danger' : 'secondary'} onClick={() => choose(item.shipment_id, 'REJECTED')}>Tolak</Button></div>{choice?.decision === 'REJECTED' ? <Field label="Alasan penolakan" required><textarea rows={2} minLength={5} value={choice.reason} onChange={(event) => setChoices((current) => ({ ...current, [item.shipment_id]: { decision: 'REJECTED', reason: event.target.value } }))} placeholder="Contoh: kapasitas kendaraan penuh" /></Field> : null}</div>;
  })}</div>{error ? <Notice tone="error">{error}</Notice> : null}<div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Batal</Button><Button type="button" disabled={!complete} loading={busy} onClick={submit}>Kirim jawaban {Object.keys(choices).length}/{shipments.length}</Button></div></div></Modal>;
}

function CourierRunCard({ run, busy, otherRunActive, onRespond, onAcceptAll, onStart }: { run: DeliveryRun; busy: boolean; otherRunActive: boolean; onRespond: () => void; onAcceptAll: () => void; onStart: () => void }) {
  const shipments = runItems(run);
  const active = shipments.filter((item) => item.status !== 'CANCELLED');
  const handedOver = active.length > 0 && active.every((item) => ['HANDED_OVER', 'DELIVERED', 'FAILED', 'RETURNED_TO_HUB'].includes(item.status));
  const remaining = active.filter((item) => item.status === 'HANDED_OVER');
  const nextStop = remaining[0];
  const canStart = handedOver && !otherRunActive && run.service_date.slice(0, 10) <= todayJakarta();
  return <article className="overflow-hidden rounded-[1.5rem] border border-[#ebe0e7] bg-white shadow-sm">
    <div className="border-b border-[#f2e8ee] p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#b52b73]">{dateOnly(run.service_date)} · {run.zone?.name || `Zona #${run.zone_id}`}</p><h3 className="mb-1 text-lg font-extrabold text-[#3d2f39]">Tugas antar #{run.id}</h3><p className="m-0 text-sm text-[#80727d]">{run.hub?.name || `Hub #${run.hub_id}`} · {active.length} paket</p></div><Badge status={run.status} /></div>
      <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-[#faf5f8] p-1 text-center text-[11px] font-semibold sm:text-xs"><span className={`rounded-lg px-1 py-2 ${run.status !== 'PENDING_ACCEPT' ? 'bg-[#e8f7ee] text-[#238055]' : 'bg-white text-[#8a5774]'}`}>1 · Jawab</span><span className={`rounded-lg px-1 py-2 ${handedOver ? 'bg-[#e8f7ee] text-[#238055]' : 'text-[#8a5774]'}`}>2 · Ambil di hub</span><span className={`rounded-lg px-1 py-2 ${['OUT_FOR_DELIVERY', 'COMPLETED'].includes(run.status) ? 'bg-[#e8f7ee] text-[#238055]' : 'text-[#8a5774]'}`}>3 · Antar</span></div>
    </div>
    <div className="grid gap-4 p-5 sm:p-6">
      {run.status === 'PENDING_ACCEPT' ? <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="m-0 text-sm text-[#6a5965]">Tinjau AWB, alamat, dan urutan paket sebelum menerima tugas.</p><div className="grid gap-2 sm:flex"><Button onClick={onAcceptAll} loading={busy} icon="check" className="min-h-11 w-full sm:w-auto">Terima semua</Button><Button variant="secondary" onClick={onRespond} className="min-h-11 w-full sm:w-auto">Pilih per paket</Button></div></div> : null}
      {run.status === 'ACCEPTED' ? handedOver ? <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="m-0 text-sm text-[#5b4b56]">Paket sudah diserahkan operator hub. {otherRunActive ? 'Selesaikan tugas pengantaran yang sedang berjalan lebih dulu.' : canStart ? 'Anda bisa mulai perjalanan.' : 'Mulai pada tanggal pengantaran yang tertera.'}</p><Button onClick={onStart} loading={busy} disabled={!canStart} icon="truck">Mulai pengantaran</Button></div> : <Notice>Menunggu operator hub mengonfirmasi serah terima. Ambil paket di {run.hub?.name || 'hub penugasan'} sebelum berangkat.</Notice> : null}
      {run.status === 'ACCEPTED' && run.hub?.address ? <p className="m-0 flex items-start gap-2 text-xs text-[#776a75]"><Icon name="pin" size={16} />{run.hub.address}</p> : null}
      {run.status === 'OUT_FOR_DELIVERY' ? <div className="rounded-2xl border border-[#f4cddd] bg-[#fff2f8] p-4"><span className="text-xs font-bold uppercase tracking-wide text-[#ad2d70]">Perjalanan aktif</span><strong className="mt-1 block text-base text-[#3f2e39]">{nextStop ? `Lanjut ke tujuan ${nextStop.stop_order}` : 'Semua tujuan sudah dicatat'}</strong><p className="mb-4 mt-1 text-sm text-[#65545f]">{nextStop ? stopAddress(nextStop) : 'Paket gagal dibawa kembali ke hub untuk dikonfirmasi operator.'}</p><Link to={`/courier-deliveries/${run.id}/map`} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#e91681] px-4 text-sm font-bold text-white sm:w-auto"><Icon name="pin" size={17} />Buka peta pengantaran</Link></div> : null}
      {run.status === 'COMPLETED' ? <Notice tone="success">Tugas selesai. Riwayat hasil dan bukti foto tiap paket tersedia di bawah.</Notice> : null}
      {run.status === 'REJECTED' ? <Notice>Tugas ditolak sebelum berangkat. Paket kembali ke antrean hub untuk penugasan ulang.</Notice> : null}
      {shipments.length ? <div className="grid gap-3 border-t border-[#f0e5eb] pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="m-0 text-sm font-extrabold text-[#45323f]">Paket dalam tugas</h4><span className="text-xs font-semibold text-[#8b7584]">{shipments.length} paket · urutan dari operator</span></div>{shipments.map((item) => {
        const shipment = item.shipment;
        const order = shipment?.order;
        const address = item.destination_address_snapshot || order?.destination_address_snapshot || shipment?.destination_address_snapshot || 'Alamat tujuan tercatat pada tugas';
        const awb = item.awb || shipment?.awb || `Paket #${item.shipment_id}`;
        const attempt = item.delivery_attempt;
        return <div key={item.id} className={`rounded-2xl border p-4 ${item.status === 'HANDED_OVER' && run.status === 'OUT_FOR_DELIVERY' ? 'border-[#efbdd4] bg-[#fffafd]' : 'border-[#eee5eb] bg-white'}`}>
          <div className="mb-2 flex items-center gap-2"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#fff0f7] text-xs font-bold text-[#bd2472]">{item.stop_order}</span><strong className="min-w-0 flex-1 break-all font-mono text-sm">{awb}</strong><Badge status={item.status} /></div><Link to={`/courier-deliveries/package/${awb}`} className="mb-2 inline-flex min-h-9 items-center text-xs font-bold text-[#b62a72] underline underline-offset-2">Lihat detail paket</Link>
          <p className="mb-1 flex items-start gap-2 break-words text-sm text-[#5e515c]"><Icon name="pin" size={16} />{address}</p><p className="mb-3 text-xs text-[#877781]">{item.recipient_name || order?.recipient_name || shipment?.recipient_name || 'Penerima'}{shipment?.attempt_count ? ` · Percobaan ke-${attempt?.attempt_no || shipment.attempt_count + 1}` : ''}</p>{shipment?.last_attempt?.result === 'FAILED' && !attempt ? <div className="mb-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900"><strong>Catatan percobaan sebelumnya:</strong> {failureLabels[shipment.last_attempt.failure_reason || ''] || shipment.last_attempt.failure_reason || 'Gagal kirim'}{shipment.last_attempt.notes ? ` · ${shipment.last_attempt.notes}` : ''}</div> : null}
          {item.status === 'DELIVERED' ? <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-[#29805b]">Diterima {attempt?.recipient_name || 'penerima'} · {dateTime(attempt?.attempted_at)}</span>{attempt?.photo_available ? <PrivatePhotoViewer path={`/api/v1/shipments/${item.shipment_id}/delivery-photo`} kind="delivery" awb={awb} takenAt={attempt.attempted_at} address={address} /> : null}</div> : null}
          {item.status === 'FAILED' ? <Notice tone="error">Gagal: {failureLabels[attempt?.failure_reason || ''] || attempt?.failure_reason || 'Alasan tercatat'}. Bawa paket kembali ke hub; operator akan mengonfirmasi penerimaan.</Notice> : null}
          {item.status === 'RETURNED_TO_HUB' ? <Notice>Paket gagal sudah diterima kembali oleh hub. Pengantaran ulang memakai AWB yang sama.</Notice> : null}
          {item.status === 'CANCELLED' ? <Notice>Ditolak sebelum berangkat. {item.rejection_reason || 'Operator hub akan menugaskan ulang.'}</Notice> : null}
        </div>;
      })}</div> : null}
    </div>
  </article>;
}

export function CourierJourneyPage({ runId, toast }: { runId: number; toast: Toast }) {
  useEffect(() => { window.scrollTo(0, 0); }, [runId]);
  const { data, loading, error, reload } = useResource<DeliveryRun[]>('/api/v1/courier/delivery-runs', (raw) => list<DeliveryRun>(raw));
  const [arrivedStop, setArrivedStop] = useState<RunShipment | null>(null);
  const [headingToStopId, setHeadingToStopId] = useState<number | null>(null);
  useRefreshOnReturn(reload);
  const run = data?.find((item) => item.id === runId);
  const stops = run ? runItems(run).filter((item) => item.status !== 'CANCELLED') : [];
  const nextStop = stops.find((item) => item.status === 'HANDED_OVER');
  const previousStop = stops.filter((item) => nextStop && item.stop_order < nextStop.stop_order && ['DELIVERED', 'FAILED', 'RETURNED_TO_HUB'].includes(item.status)).at(-1);
  const readyToArrive = !previousStop || headingToStopId === nextStop?.id;
  const deliveredCount = stops.filter((item) => item.status === 'DELIVERED').length;
  const failedCount = stops.filter((item) => ['FAILED', 'RETURNED_TO_HUB'].includes(item.status)).length;
  const routeOrigin = previousStop?.shipment?.destination_point || run?.hub;
  const routeOriginLabel = previousStop ? `Tujuan ${previousStop.stop_order}` : run?.hub?.name || 'Hub keberangkatan';
  const mapStops = nextStop ? [{
    order: nextStop.stop_order,
    label: nextStop.awb || nextStop.shipment?.awb || `Paket #${nextStop.shipment_id}`,
    latitude: nextStop.shipment?.destination_point?.latitude ?? null,
    longitude: nextStop.shipment?.destination_point?.longitude ?? null,
    active: true,
  }] : [];
  const done = () => { setArrivedStop(null); setHeadingToStopId(null); reload(); window.dispatchEvent(new Event('courier:work-updated')); };
  return <div className="page courier-journey-page max-w-5xl">
    <div className="mb-4"><Link to="/courier-deliveries" className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[#af2a70]">← Kembali ke tugas antar</Link></div>
    {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : !run ? <Empty icon="truck" title="Tugas pengantaran tidak ditemukan pada akun ini" /> : <>
      <PageHeader eyebrow={`Tugas #${run.id} · ${run.zone?.name || 'Area pengantaran'}`} title="Peta pengantaran" subtitle="Ikuti rute menuju tujuan aktif sesuai urutan dari operator hub." action={<Button variant="secondary" icon="refresh" onClick={reload}>Perbarui</Button>} />
      {run.status === 'OUT_FOR_DELIVERY' ? <>
        {nextStop ? <section className="rounded-2xl border border-[#f0d1e1] bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 px-1 text-sm font-bold text-[#523747]"><span>{routeOriginLabel}</span><span aria-hidden="true" className="text-[#d31d78]">→</span><span>Tujuan {nextStop.stop_order}</span></div>
          <DeliveryRouteMap hub={{ latitude: routeOrigin?.latitude ?? null, longitude: routeOrigin?.longitude ?? null }} stops={mapStops} originLabel={routeOriginLabel} />
          <p className="mb-0 mt-3 px-1 text-xs leading-5 text-[#786b76]">Rute ditampilkan berdasarkan alamat tujuan. Pastikan kondisi jalan sebelum berangkat.</p>
        </section> : null}
        {nextStop ? <section className="mt-4 rounded-2xl border border-[#efbfd6] bg-[#fff3f8] p-4 sm:p-5">
          <span className="text-xs font-extrabold uppercase tracking-wide text-[#ad2d70]">{readyToArrive ? 'Tujuan sekarang' : 'Tujuan berikutnya'} · tujuan {nextStop.stop_order} dari {stops.length}</span>
          <h2 className="mb-1 mt-2 font-mono text-lg font-extrabold text-[#402d3b]">{nextStop.awb || nextStop.shipment?.awb}</h2>
          <p className="mb-1 text-sm font-semibold text-[#533b4a]">{nextStop.recipient_name || nextStop.shipment?.order?.recipient_name || 'Penerima'}</p>
          <p className="mb-4 text-sm leading-6 text-[#6a5864]">{stopAddress(nextStop)}</p>
          {nextStop.shipment?.last_attempt?.result === 'FAILED' ? <p className="mb-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Percobaan sebelumnya: {failureLabels[nextStop.shipment.last_attempt.failure_reason || ''] || nextStop.shipment.last_attempt.failure_reason || 'Gagal kirim'}{nextStop.shipment.last_attempt.notes ? ` · ${nextStop.shipment.last_attempt.notes}` : ''}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">{readyToArrive ? <Button type="button" onClick={() => setArrivedStop(nextStop)} icon="pin">Sudah sampai tujuan {nextStop.stop_order}</Button> : <Button type="button" onClick={() => setHeadingToStopId(nextStop.id)} icon="truck">Lanjut menuju tujuan {nextStop.stop_order}</Button>}<ContactOptions shipmentId={nextStop.shipment_id} /></div>
        </section> : <Notice tone="success">Semua tujuan sudah dicatat: {deliveredCount} berhasil, {failedCount} gagal. Bawa paket gagal kembali ke hub untuk dikonfirmasi operator.</Notice>}
        <section className="mt-5"><h2 className="mb-3 text-base font-extrabold text-[#46313f]">Urutan dari operator</h2><ol className="m-0 grid list-none gap-2 p-0">{stops.map((item) => <li key={item.id} className={`flex items-start gap-3 rounded-2xl border p-3.5 ${item.id === nextStop?.id ? 'border-[#e9a5c7] bg-[#fff8fb]' : 'border-[#ece3e8] bg-white'}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-xs font-extrabold ${item.id === nextStop?.id ? 'bg-[#e91681] text-white' : 'bg-[#f6eaf0] text-[#af2a70]'}`}>{item.stop_order}</span><div className="min-w-0 flex-1"><strong className="block font-mono text-sm text-[#42323c]">{item.awb || item.shipment?.awb}</strong><p className="mb-1 mt-1 break-words text-xs text-[#736572]">{stopAddress(item)}</p><Badge status={item.status} />{item.status === 'FAILED' ? <p className="mb-0 mt-2 text-xs text-[#ac3152]">Bawa paket kembali ke hub.</p> : null}</div></li>)}</ol></section>
      </> : <section className="rounded-2xl border border-[#eee1e8] bg-white p-5"><Badge status={run.status} /><p className="mb-0 mt-3 text-sm text-[#756675]">{run.status === 'COMPLETED' ? `Perjalanan selesai. ${deliveredCount} paket berhasil dan ${failedCount} gagal. Hasil tiap paket tersedia di riwayat tugas.` : 'Perjalanan belum dimulai. Kembali ke tugas antar untuk melihat langkah berikutnya.'}</p></section>}
    </>}
    {arrivedStop ? <DeliveryResult runShipment={arrivedStop} onClose={() => setArrivedStop(null)} onDone={done} toast={toast} /> : null}
  </div>;
}

export function CourierPackagePage({ awb }: { awb: string }) {
  useEffect(() => { window.scrollTo(0, 0); }, [awb]);
  const { data, loading, error, reload } = useResource<CourierParcelDetail>(
    `/api/v1/courier/shipments/${awb}`, (raw) => unwrap<CourierParcelDetail>(raw),
  );
  useRefreshOnReturn(reload);
  const shipment = data?.shipment;
  const currentTask = data?.assignments.find((item) => item.status === 'HANDED_OVER' && item.run_status === 'OUT_FOR_DELIVERY');
  const address = shipment?.order?.destination_address_snapshot || shipment?.destination_address_snapshot || 'Alamat tujuan belum tersedia';
  const successfulAttempt = data?.attempts.find((item) => item.result === 'DELIVERED' && item.photo_available);
  return <div className="page max-w-5xl">
    <Link to={`/courier-deliveries?awb=${awb}`} className="mb-4 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[#af2a70]">← Kembali ke pencarian</Link>
    {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : !shipment || !data ? <Empty icon="package" title="Detail paket tidak tersedia" /> : <>
      <PageHeader eyebrow="Detail paket" title={awb} subtitle="Informasi paket dan riwayat penugasan pengantaran." action={<Button variant="secondary" icon="refresh" onClick={reload}>Perbarui</Button>} />
      <section className="mb-5 rounded-[1.5rem] border border-[#efc9da] bg-[#fff4f8] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wide text-[#aa2c6e]">Status paket</span><Badge status={shipment.status} /></div>
        <h2 className="mb-1 mt-3 text-lg font-extrabold text-[#3e2c38]">{shipment.order?.recipient_name || shipment.recipient_name || 'Penerima'}</h2>
        <p className="mb-3 break-words text-sm leading-6 text-[#645361]">{address}</p>
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-[#6b5965]"><span className="rounded-lg bg-white px-3 py-2">{data.hub_name || 'Hub belum tercatat'}</span><span className="rounded-lg bg-white px-3 py-2">{shipment.delivery_zone?.name || 'Area belum tercatat'}</span><span className="rounded-lg bg-white px-3 py-2">{data.attempts.length} percobaan pengantaran</span></div>
        {currentTask ? <Link to={`/courier-deliveries/${currentTask.run_id}/map`} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#e91681] px-4 text-sm font-bold text-white"><Icon name="pin" size={17} />Lanjutkan pengantaran</Link> : null}
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Riwayat percobaan">
          {data.attempts.length ? <ol className="m-0 grid list-none gap-3 p-0">{data.attempts.map((attempt) => <li key={attempt.attempt_no} className="rounded-xl border border-[#eee3e9] p-3.5"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">Percobaan ke-{attempt.attempt_no}</strong><Badge status={attempt.result} /></div><p className="mb-1 mt-2 text-sm text-[#65545e]">{attempt.result === 'DELIVERED' ? `Diterima oleh ${attempt.recipient_name || 'penerima'}` : failureLabels[attempt.failure_reason || ''] || attempt.failure_reason || 'Pengantaran belum berhasil'}</p>{attempt.notes ? <p className="mb-1 text-xs text-[#7b6a75]">Catatan: {attempt.notes}</p> : null}<small className="text-[#8a7b85]">{dateTime(attempt.attempted_at)}</small></li>)}</ol> : <Empty icon="package" title="Belum ada percobaan pengantaran" />}
        </Panel>
        <Panel title="Penugasan saya">
          <ol className="m-0 grid list-none gap-3 p-0">{data.assignments.map((assignment) => <li key={assignment.id} className="rounded-xl border border-[#eee3e9] p-3.5"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">Tugas #{assignment.run_id} · tujuan {assignment.stop_order}</strong><Badge status={assignment.status} /></div><p className="mb-0 mt-2 text-xs text-[#7b6a75]">{dateOnly(assignment.service_date)} · ditugaskan {dateTime(assignment.assigned_at)}</p>{assignment.rejection_reason ? <p className="mb-0 mt-2 text-xs text-[#9b4c32]">Alasan penolakan: {assignment.rejection_reason}</p> : null}</li>)}</ol>
        </Panel>
      </div>
      {(data.pickup_photo_available || successfulAttempt) ? <Panel title="Bukti foto" className="mt-5"><div className="flex flex-wrap gap-2">{data.pickup_photo_available ? <PrivatePhotoViewer path={`/api/v1/shipments/${shipment.id}/pickup-photo`} kind="pickup" awb={awb} takenAt={data.pickup_photo_taken_at} address={shipment.order?.origin_address_snapshot} /> : null}{successfulAttempt ? <PrivatePhotoViewer path={`/api/v1/shipments/${shipment.id}/delivery-photo`} kind="delivery" awb={awb} takenAt={successfulAttempt.attempted_at} address={address} /> : null}</div></Panel> : null}
    </>}
  </div>;
}

export function CourierDeliveries({ toast }: { toast: Toast }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState(() => (new URLSearchParams(location.search).get('awb') || '').replace(/\D/g, '').slice(0, 14));
  const runParam = new URLSearchParams(location.search).get('run');
  const requestedRunId = runParam && /^[1-9]\d*$/.test(runParam) ? Number(runParam) : null;
  useEffect(() => { if (requestedRunId) setSearch(''); }, [requestedRunId]);
  const [results, setResults] = useState<CourierParcelResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<unknown>(null);
  const [searchRevision, setSearchRevision] = useState(0);
  const { data, loading, error, reload } = useResource<DeliveryRun[]>('/api/v1/courier/delivery-runs', (raw) => list<DeliveryRun>(raw));
  const [busyId, setBusyId] = useState<number | null>(null);
  const [respond, setRespond] = useState<DeliveryRun | null>(null);
  const [selectedView, setSelectedView] = useState<'todo' | 'ongoing' | 'history' | null>(null);
  const refresh = () => { setSelectedView(null); reload(); setSearchRevision((value) => value + 1); window.dispatchEvent(new Event('courier:work-updated')); };
  useRefreshOnReturn(refresh);
  useEffect(() => {
    if (search.length < 2) { setResults([]); setSearchError(null); setSearchLoading(false); return; }
    let active = true;
    setSearchLoading(true);
    setSearchError(null);
    const timer = window.setTimeout(() => {
      void get<unknown>(`/api/v1/courier/shipments?query=${encodeURIComponent(search)}`)
        .then((raw) => { if (active) setResults(list<CourierParcelResult>(raw)); })
        .catch((cause) => { if (active) { setResults([]); setSearchError(cause); } })
        .finally(() => { if (active) setSearchLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search, searchRevision]);
  const acceptAll = async (run: DeliveryRun) => { setBusyId(run.id); try { await post(`/api/v1/courier/delivery-runs/${run.id}/accept`); toast(`Semua ${runItems(run).length} paket diterima. Ambil paket di hub.`); refresh(); } catch (cause) { toast(errorMessage(cause), 'error'); } finally { setBusyId(null); } };
  const start = async (run: DeliveryRun) => { setBusyId(run.id); try { await post(`/api/v1/courier/delivery-runs/${run.id}/start`); toast('Pengantaran dimulai. Ikuti urutan tujuan pada peta.'); window.dispatchEvent(new Event('courier:work-updated')); navigate(`/courier-deliveries/${run.id}/map`); } catch (cause) { toast(errorMessage(cause), 'error'); } finally { setBusyId(null); } };
  const views: Array<{ id: 'todo' | 'ongoing' | 'history'; title: string; statuses: string[]; icon: string }> = [
    { id: 'todo', title: 'Perlu tindakan', statuses: ['PENDING_ACCEPT', 'ACCEPTED'], icon: 'alert' },
    { id: 'ongoing', title: 'Sedang diantar', statuses: ['OUT_FOR_DELIVERY'], icon: 'truck' },
    { id: 'history', title: 'Riwayat', statuses: ['COMPLETED', 'REJECTED'], icon: 'check' },
  ];
  const countFor = (statuses: string[]) => (data || []).filter((run) => statuses.includes(run.status)).length;
  const requestedRun = requestedRunId ? (data || []).find((run) => run.id === requestedRunId) : null;
  const requestedView = requestedRun ? views.find((view) => view.statuses.includes(requestedRun.status))?.id : null;
  const activeView = requestedView ?? selectedView ?? (countFor(views[0].statuses) ? 'todo' : countFor(views[1].statuses) ? 'ongoing' : 'history');
  const currentView = views.find((view) => view.id === activeView)!;
  const visibleRuns = requestedRunId ? (requestedRun ? [requestedRun] : [])
    : (data || []).filter((run) => currentView.statuses.includes(run.status));
  return <div className="page"><PageHeader eyebrow="Tugas kurir" title="Antar paket" subtitle="Tugas baru, perjalanan aktif, dan hasil pengantaran ada di sini." action={<Button variant="secondary" icon="refresh" onClick={refresh}>Perbarui</Button>} />
    {!requestedRunId ? <HubAwbSearch value={search} onChange={(value) => setSearch(value.replace(/\D/g, '').slice(0, 14))} placeholder="Cari nomor resi paket…" /> : null}
    {requestedRunId ? <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#f2cde0] bg-[#fff3f9] px-4 py-3 text-sm"><strong className="text-[#9b2464]">Penugasan #{requestedRunId}</strong><Link to="/courier-deliveries" className="font-bold text-[#aa2b6b] underline underline-offset-2">Lihat semua tugas</Link></div> : null}
    {search ? <section className="mt-5 grid gap-3"><h2 className="mb-0 text-base font-extrabold text-[#44323f]">Hasil pencarian</h2>
      {search.length < 2 ? <Notice>Masukkan sedikitnya dua angka nomor resi.</Notice>
        : searchLoading ? <Loading label="Mencari paket…" />
          : searchError ? <ErrorBox error={searchError} retry={() => setSearchRevision((value) => value + 1)} />
            : results.length ? results.map((parcel) => <article key={parcel.id} className="rounded-2xl border border-[#e9dce4] bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-wrap items-start justify-between gap-2"><div><strong className="block font-mono text-base text-[#412d3a]">{parcel.awb}</strong><p className="mb-0 mt-1 text-sm font-semibold text-[#61515d]">{parcel.recipient_name}</p></div><Badge status={parcel.status} /></div><p className="mb-3 mt-3 break-words text-xs leading-5 text-[#7b6b76]">{parcel.destination_address_snapshot}</p><Link to={`/courier-deliveries/package/${parcel.awb}`} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#e91681] px-4 text-sm font-bold text-white sm:w-auto"><Icon name="package" size={16} />Lihat detail paket</Link></article>)
              : <Empty icon="search" title="Paket tidak ditemukan dalam tugas Anda" detail="Periksa kembali nomor resi atau cari paket yang pernah ditugaskan kepada akun ini." />}
    </section> : loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : <div className="mt-5">
      {!requestedRunId ? <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl border border-[#eee2e9] bg-white p-1" aria-label="Kelompok tugas pengantaran">{views.map((view) => <button key={view.id} type="button" aria-pressed={activeView === view.id} onClick={() => setSelectedView(view.id)} className={`min-h-14 rounded-lg px-1.5 py-2 text-[11px] font-bold leading-4 sm:text-sm ${activeView === view.id ? 'bg-[#e91681] text-white' : 'text-[#705f6c] hover:bg-[#fff0f7]'}`}>{view.title}<span className={`ml-1 inline-flex min-w-5 justify-center rounded-full px-1 py-0.5 text-[10px] ${activeView === view.id ? 'bg-white/25 text-white' : 'bg-[#fff0f7] text-[#aa2b6b]'}`}>{countFor(view.statuses)}</span></button>)}</div> : null}
      <section className="grid gap-3" aria-label={currentView.title}><h2 className="mb-1 flex items-center gap-2 text-base font-extrabold text-[#44323f]"><Icon name={currentView.icon} size={19} />{currentView.title}</h2>
        {visibleRuns.length ? visibleRuns.map((run) => <CourierRunCard key={run.id} run={run} busy={busyId === run.id} otherRunActive={Boolean(data?.some((other) => other.id !== run.id && other.status === 'OUT_FOR_DELIVERY'))} onRespond={() => setRespond(run)} onAcceptAll={() => void acceptAll(run)} onStart={() => void start(run)} />) : <Empty icon={currentView.icon} title={requestedRunId ? 'Penugasan tidak ditemukan pada akun ini' : activeView === 'todo' ? 'Tidak ada tugas yang menunggu tindakan' : activeView === 'ongoing' ? 'Belum ada pengantaran berjalan' : 'Belum ada riwayat tugas'} />}
      </section>
    </div>}
    {respond ? <RespondRun run={respond} onClose={() => setRespond(null)} onDone={refresh} toast={toast} /> : null}
  </div>;
}
