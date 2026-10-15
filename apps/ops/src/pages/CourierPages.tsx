import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { DeliveryRouteMap } from '../components/DeliveryRouteMap';
import { HubAwbSearch } from '../components/HubAwbSearch';
import { LiveCameraCapture, type CapturedPhoto } from '../components/LiveCameraCapture';
import { PrivatePhotoViewer } from '../components/PrivatePhotoViewer';
import useAutoRefresh from '../hooks/useAutoRefresh';
import { list, newActionKey, post, upload } from '../lib/api';
import type { DeliveryRun, PickupAssignment, RunShipment } from '../lib/types';
import { Badge, Button, dateOnly, dateTime, Empty, ErrorBox, errorMessage, Field, Icon, Loading, Modal, Notice, PageHeader, Panel, phoneHref, todayJakarta, useResource } from '../ui';
import { ContactOptions } from './ContactOptions';

type Toast = (message: string, tone?: 'success' | 'error') => void;
const failureLabels: Record<string, string> = {
  PENERIMA_TIDAK_ADA: 'Penerima tidak ada di lokasi', ALAMAT_TIDAK_DITEMUKAN: 'Alamat tidak ditemukan',
  PENERIMA_MENOLAK: 'Penerima menolak paket', AKSES_TERHALANG: 'Akses ke alamat terhalang', LAINNYA: 'Alasan lainnya',
};
const pickupAwb = (item: PickupAssignment) => item.awb || item.shipment?.awb || item.task?.shipment?.awb || `Tugas #${item.id}`;
const runItems = (run: DeliveryRun) => [...(run.shipments || run.run_shipments || [])].sort((a, b) => a.stop_order - b.stop_order);

function CompletePickup({ assignment, onClose, onDone, toast }: { assignment: PickupAssignment; onClose: () => void; onDone: () => void; toast: Toast }) {
  const [awb, setAwb] = useState(pickupAwb(assignment));
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [actionKey] = useState(newActionKey);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!photo) { setError('Ambil foto paket dari kamera sebelum menyelesaikan pickup.'); return; }
    setBusy(true); setError('');
    try {
      const form = new FormData();
      form.append('awb', awb.trim()); form.append('photo', photo.file); form.append('captured_at', photo.capturedAt);
      await upload(`/api/v1/courier/pickup-assignments/${assignment.id}/complete`, form, actionKey);
      toast('Pickup selesai. Bawa paket ke hub dan serahkan kepada operator.'); onDone(); onClose();
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return <Modal title="Ambil paket di toko" onClose={onClose}><form className="form-stack" onSubmit={submit}>
    <div className="rounded-2xl bg-[#fff5fa] p-4 text-sm"><strong>{assignment.seller_name || 'Toko pengirim'}</strong><p className="mb-0 mt-1 text-[#766874]">{assignment.seller_address}</p></div>
    <Notice>Cocokkan AWB pada paket, lalu foto langsung dari kamera. Setelah menyimpan, bawa paket ke {assignment.hub_name || 'hub penugasan'}.</Notice>
    <Field label="Nomor AWB pada paket" required><input required value={awb} onChange={(event) => setAwb(event.target.value)} inputMode="numeric" pattern="[0-9]{14}" /></Field>
    <LiveCameraCapture label="Foto paket saat pickup *" photo={photo} onCapture={setPhoto} filePrefix="bukti-pickup" />
    {error ? <Notice tone="error">{error}</Notice> : null}
    <div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Batal</Button><Button type="submit" loading={busy} disabled={!photo} icon="camera">Simpan foto & selesaikan pickup</Button></div>
  </form></Modal>;
}

function PickupCard({ item, busy, onAccept, onComplete }: { item: PickupAssignment; busy: boolean; onAccept: () => void; onComplete: () => void }) {
  const awb = pickupAwb(item);
  const phone = item.seller_phone || item.shipment?.order?.origin_contact_snapshot;
  return <article className="rounded-2xl border border-[#eee2e9] bg-white p-4 shadow-sm sm:p-5">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2"><div><p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#b12d72]">{item.seller_name || 'Toko pengirim'}</p><h3 className="m-0 font-mono text-base font-extrabold">{awb}</h3></div><Badge status={item.status} /></div>
    <p className="mb-3 flex items-start gap-2 break-words text-sm text-[#5f535e]"><Icon name="pin" size={17} />{item.seller_address || 'Alamat toko tercatat pada tugas'}</p>
    <div className="mb-4 grid gap-2 rounded-xl bg-[#faf6f9] p-3 text-xs text-[#766a74] sm:grid-cols-2"><span><strong className="block text-[#4f3d49]">Jadwal pickup</strong>{dateTime(item.scheduled_at)}</span><span><strong className="block text-[#4f3d49]">Kembalikan ke hub</strong>{item.hub_name || 'Hub penugasan'}{item.hub_address ? ` · ${item.hub_address}` : ''}</span></div>
    {item.status === 'PENDING_ACCEPT' ? <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-[#877681]">Terima tugas sebelum menuju toko.</span><Button size="small" loading={busy} onClick={onAccept}>Terima tugas pickup</Button></div> : null}
    {['ACCEPTED', 'IN_PROGRESS'].includes(item.status) ? <div className="flex flex-wrap gap-2"><Button size="small" icon="camera" onClick={onComplete}>Foto & konfirmasi pickup</Button>{phone ? <a href={phoneHref(phone)} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#e7d8e2] px-3 text-xs font-bold text-[#b42a72]"><Icon name="phone" size={15} />Hubungi toko</a> : null}</div> : null}
    {item.status === 'COMPLETED' ? <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-[#4c805f]">Foto tersimpan. Bawa paket ke hub untuk dikonfirmasi operator.</span>{item.shipment_id ? <PrivatePhotoViewer path={`/api/v1/shipments/${item.shipment_id}/pickup-photo`} awb={awb} takenAt={item.picked_up_at} address={item.seller_address} /> : null}</div> : null}
  </article>;
}

export function CourierOverview() {
  const pickups = useResource<PickupAssignment[]>('/api/v1/courier/pickup-assignments', (raw) => list<PickupAssignment>(raw));
  const runs = useResource<DeliveryRun[]>('/api/v1/courier/delivery-runs', (raw) => list<DeliveryRun>(raw));
  const refresh = () => { pickups.reload(); runs.reload(); };
  useAutoRefresh(refresh);
  const pickupPending = pickups.data?.filter((item) => item.status === 'PENDING_ACCEPT').length || 0;
  const pickupActive = pickups.data?.filter((item) => ['ACCEPTED', 'IN_PROGRESS'].includes(item.status)).length || 0;
  const runPending = runs.data?.filter((run) => run.status === 'PENDING_ACCEPT').length || 0;
  const runWaiting = runs.data?.filter((run) => run.status === 'ACCEPTED').length || 0;
  const activeStops = runs.data?.flatMap((run) => run.status === 'OUT_FOR_DELIVERY' ? runItems(run) : []).filter((item) => item.status === 'HANDED_OVER').length || 0;
  const next = activeStops ? { title: `${activeStops} paket perlu diantar`, detail: 'Ikuti urutan stop dan catat hasil setiap paket.', href: '/courier-deliveries', action: 'Lanjutkan pengantaran' }
    : runPending ? { title: `${runPending} tugas antar baru`, detail: 'Tinjau daftar paket, lalu terima atau tolak dengan alasan.', href: '/courier-deliveries', action: 'Tinjau tugas' }
      : pickupPending ? { title: `${pickupPending} tugas pickup baru`, detail: 'Terima tugas, datangi toko, lalu foto paket saat diambil.', href: '/courier-pickups', action: 'Lihat pickup' }
        : pickupActive ? { title: `${pickupActive} pickup berjalan`, detail: 'Cocokkan AWB dan ambil foto dari kamera di toko.', href: '/courier-pickups', action: 'Lanjutkan pickup' }
          : runWaiting ? { title: 'Menunggu serah terima hub', detail: 'Tugas sudah diterima. Operator hub akan menyerahkan paket sebelum berangkat.', href: '/courier-deliveries', action: 'Lihat tugas' } : null;
  return <div className="page"><PageHeader eyebrow="Ruang kerja kurir" title="Tugas saya" action={<Button variant="secondary" icon="refresh" onClick={refresh}>Perbarui</Button>} />
    {pickups.loading || runs.loading ? <Loading /> : pickups.error || runs.error ? <ErrorBox error={pickups.error || runs.error} retry={refresh} /> : <>
      <section className="mb-5 rounded-[1.5rem] border border-[#f4cddd] bg-[#fff1f7] p-5 sm:p-6"><span className="text-xs font-bold uppercase tracking-wide text-[#ac3573]">Langkah berikutnya</span>{next ? <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="mb-1 text-xl font-extrabold text-[#412d3b]">{next.title}</h2><p className="m-0 text-sm leading-6 text-[#766674]">{next.detail}</p></div><Link to={next.href} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#e91681] px-5 text-sm font-bold text-white">{next.action}<Icon name="chevron" size={17} /></Link></div> : <p className="mb-0 mt-2 text-sm text-[#766674]">Belum ada tugas yang perlu ditindaklanjuti. Tugas baru akan muncul otomatis.</p>}</section>
      <div className="grid gap-3 sm:grid-cols-3"><Link to="/courier-pickups" className="rounded-2xl border border-[#eee1e8] bg-white p-4"><strong className="block text-2xl text-[#d62280]">{pickupPending + pickupActive}</strong><span className="text-sm text-[#6e5d69]">Pickup perlu ditangani</span></Link><Link to="/courier-deliveries" className="rounded-2xl border border-[#eee1e8] bg-white p-4"><strong className="block text-2xl text-[#d62280]">{runPending + runWaiting}</strong><span className="text-sm text-[#6e5d69]">Tugas antar menunggu</span></Link><Link to="/courier-deliveries" className="rounded-2xl border border-[#eee1e8] bg-white p-4"><strong className="block text-2xl text-[#d62280]">{activeStops}</strong><span className="text-sm text-[#6e5d69]">Paket masih di jalan</span></Link></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><Link to="/courier-pickups" className="flex items-center gap-3 rounded-2xl border border-[#eee1e8] bg-white p-4"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#fff0f7] text-[#d62280]"><Icon name="package" /></span><span className="flex-1"><strong className="block">Pickup dari toko</strong><small className="text-[#81717d]">Terima → foto paket → serahkan ke hub</small></span><Icon name="chevron" size={17} /></Link><Link to="/courier-deliveries" className="flex items-center gap-3 rounded-2xl border border-[#eee1e8] bg-white p-4"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#fff0f7] text-[#d62280]"><Icon name="truck" /></span><span className="flex-1"><strong className="block">Antar ke penerima</strong><small className="text-[#81717d]">Jawab tugas → ambil di hub → antar → catat hasil</small></span><Icon name="chevron" size={17} /></Link></div>
    </>}
  </div>;
}

export function CourierPickups({ toast }: { toast: Toast }) {
  const { data, loading, error, reload } = useResource<PickupAssignment[]>('/api/v1/courier/pickup-assignments', (raw) => list<PickupAssignment>(raw));
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [complete, setComplete] = useState<PickupAssignment | null>(null);
  const refresh = () => { reload(); window.dispatchEvent(new Event('courier:work-updated')); };
  useAutoRefresh(refresh);
  const accept = async (item: PickupAssignment) => { setBusyId(item.id); try { await post(`/api/v1/courier/pickup-assignments/${item.id}/accept`); toast('Tugas diterima. Datangi toko dan cocokkan paket.'); refresh(); } catch (cause) { toast(errorMessage(cause), 'error'); } finally { setBusyId(null); } };
  const matching = (data || []).filter((item) => pickupAwb(item).includes(search.trim()));
  const pending = matching.filter((item) => item.status === 'PENDING_ACCEPT');
  const active = matching.filter((item) => ['ACCEPTED', 'IN_PROGRESS'].includes(item.status));
  const completed = matching.filter((item) => item.status === 'COMPLETED');
  const cards = (items: PickupAssignment[]) => <div className="grid gap-3 lg:grid-cols-2">{items.map((item) => <PickupCard key={item.id} item={item} busy={busyId === item.id} onAccept={() => void accept(item)} onComplete={() => setComplete(item)} />)}</div>;
  return <div className="page"><PageHeader eyebrow="Pickup dari toko" title="Tugas pickup" action={<Button variant="secondary" icon="refresh" onClick={reload}>Perbarui</Button>} />
    <div className="mb-4 rounded-2xl bg-[#fff7fa] p-4 text-xs leading-5 text-[#775a6c]">1. Terima tugas → 2. Ambil dan foto paket → 3. Bawa ke hub untuk dikonfirmasi operator.</div><HubAwbSearch value={search} onChange={setSearch} awbs={(data || []).map(pickupAwb)} />
    {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : <div className="mt-5 grid gap-5"><Panel title={`Tugas baru · ${pending.length}`}>{pending.length ? cards(pending) : <Empty icon="check" title={search ? 'AWB tidak ditemukan' : 'Belum ada tugas baru'} />}</Panel><Panel title={`Sedang dijemput · ${active.length}`}>{active.length ? cards(active) : <Empty icon="truck" title="Tidak ada pickup berjalan" />}</Panel>{completed.length ? <details className="rounded-2xl border border-[#eee1e8] bg-white p-4"><summary className="cursor-pointer text-sm font-bold text-[#574050]">Pickup selesai · {completed.length}</summary><div className="mt-4">{cards(completed)}</div></details> : null}</div>}
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
    return <div className="select-row run-response-row" key={item.id}><span><strong>{item.awb || item.shipment?.awb}</strong><small>Stop {item.stop_order} · {item.shipment?.order?.recipient_name || item.recipient_name || 'Penerima'}</small><small>{item.shipment?.order?.destination_address_snapshot || item.destination_address_snapshot || 'Alamat tujuan tercatat pada tugas'}</small></span><div className="run-response-actions"><Button type="button" size="small" variant={choice?.decision === 'ACCEPTED' ? 'primary' : 'secondary'} onClick={() => choose(item.shipment_id, 'ACCEPTED')}>Terima</Button><Button type="button" size="small" variant={choice?.decision === 'REJECTED' ? 'danger' : 'secondary'} onClick={() => choose(item.shipment_id, 'REJECTED')}>Tolak</Button></div>{choice?.decision === 'REJECTED' ? <Field label="Alasan penolakan" required><textarea rows={2} minLength={5} value={choice.reason} onChange={(event) => setChoices((current) => ({ ...current, [item.shipment_id]: { decision: 'REJECTED', reason: event.target.value } }))} placeholder="Contoh: kapasitas kendaraan penuh" /></Field> : null}</div>;
  })}</div>{error ? <Notice tone="error">{error}</Notice> : null}<div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Batal</Button><Button type="button" disabled={!complete} loading={busy} onClick={submit}>Kirim jawaban {Object.keys(choices).length}/{shipments.length}</Button></div></div></Modal>;
}

function CourierRunCard({ run, busy, otherRunActive, onRespond, onStart, onResult }: { run: DeliveryRun; busy: boolean; otherRunActive: boolean; onRespond: () => void; onStart: () => void; onResult: (item: RunShipment) => void }) {
  const [showStops, setShowStops] = useState(run.status === 'OUT_FOR_DELIVERY');
  const [showMap, setShowMap] = useState(run.status === 'OUT_FOR_DELIVERY');
  useEffect(() => { if (run.status === 'OUT_FOR_DELIVERY') { setShowStops(true); setShowMap(true); } }, [run.status]);
  const shipments = runItems(run);
  const active = shipments.filter((item) => item.status !== 'CANCELLED');
  const handedOver = active.length > 0 && active.every((item) => ['HANDED_OVER', 'DELIVERED', 'FAILED', 'RETURNED_TO_HUB'].includes(item.status));
  const remaining = active.filter((item) => item.status === 'HANDED_OVER');
  const nextStop = remaining[0];
  const stops = active.map((item) => ({ order: item.stop_order, label: item.awb || item.shipment?.awb || `Paket #${item.shipment_id}`, latitude: item.shipment?.destination_point?.latitude ?? null, longitude: item.shipment?.destination_point?.longitude ?? null }));
  const canStart = handedOver && !otherRunActive && run.service_date.slice(0, 10) <= todayJakarta();
  return <article className="overflow-hidden rounded-[1.5rem] border border-[#ebe0e7] bg-white shadow-sm">
    <div className="border-b border-[#f2e8ee] p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#b52b73]">{dateOnly(run.service_date)} · {run.zone?.name || `Zona #${run.zone_id}`}</p><h3 className="mb-1 text-lg font-extrabold text-[#3d2f39]">Tugas antar #{run.id}</h3><p className="m-0 text-sm text-[#80727d]">{run.hub?.name || `Hub #${run.hub_id}`} · {active.length} paket</p></div><Badge status={run.status} /></div>
      <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-[#faf5f8] p-1 text-center text-[11px] font-semibold sm:text-xs"><span className={`rounded-lg px-1 py-2 ${run.status !== 'PENDING_ACCEPT' ? 'bg-[#e8f7ee] text-[#238055]' : 'bg-white text-[#8a5774]'}`}>1 · Jawab</span><span className={`rounded-lg px-1 py-2 ${handedOver ? 'bg-[#e8f7ee] text-[#238055]' : 'text-[#8a5774]'}`}>2 · Ambil di hub</span><span className={`rounded-lg px-1 py-2 ${['OUT_FOR_DELIVERY', 'COMPLETED'].includes(run.status) ? 'bg-[#e8f7ee] text-[#238055]' : 'text-[#8a5774]'}`}>3 · Antar</span></div>
    </div>
    <div className="grid gap-4 p-5 sm:p-6">
      {run.status === 'PENDING_ACCEPT' ? <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="m-0 text-sm text-[#6a5965]">Tinjau AWB, alamat, dan urutan paket sebelum menerima tugas.</p><Button onClick={onRespond}>Tinjau & jawab {shipments.length} paket</Button></div> : null}
      {run.status === 'ACCEPTED' ? handedOver ? <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="m-0 text-sm text-[#5b4b56]">Paket sudah diserahkan operator hub. {otherRunActive ? 'Selesaikan run yang sedang berjalan lebih dulu.' : canStart ? 'Anda bisa mulai perjalanan.' : 'Mulai pada tanggal pengantaran yang tertera.'}</p><Button onClick={onStart} loading={busy} disabled={!canStart} icon="truck">Mulai pengantaran</Button></div> : <Notice>Menunggu operator hub mengonfirmasi serah terima. Ambil paket di {run.hub?.name || 'hub penugasan'} sebelum berangkat.</Notice> : null}
      {run.status === 'ACCEPTED' && run.hub?.address ? <p className="m-0 flex items-start gap-2 text-xs text-[#776a75]"><Icon name="pin" size={16} />{run.hub.address}</p> : null}
      {run.status === 'OUT_FOR_DELIVERY' ? nextStop ? <div className="rounded-2xl border border-[#f4cddd] bg-[#fff2f8] p-4"><span className="text-xs font-bold uppercase tracking-wide text-[#ad2d70]">Berikutnya · stop {nextStop.stop_order}</span><strong className="mt-1 block font-mono text-base text-[#3f2e39]">{nextStop.awb || nextStop.shipment?.awb}</strong><p className="mb-3 mt-1 text-sm text-[#65545f]">{nextStop.shipment?.order?.destination_address_snapshot || nextStop.destination_address_snapshot || 'Alamat tujuan tercatat pada tugas'}</p><Button size="small" onClick={() => { setShowStops(true); onResult(nextStop); }}>Catat hasil stop ini</Button></div> : <Notice>Semua stop sudah memiliki hasil. Jika ada paket gagal, bawa kembali ke hub untuk dikonfirmasi operator.</Notice> : null}
      {run.status === 'COMPLETED' ? <Notice tone="success">Tugas selesai. Riwayat hasil dan bukti foto tiap paket tersedia di bawah.</Notice> : null}
      {run.status === 'REJECTED' ? <Notice>Tugas ditolak sebelum berangkat. Paket kembali ke antrean hub untuk penugasan ulang.</Notice> : null}
      {shipments.length ? <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" size="small" onClick={() => setShowStops((value) => !value)}>{showStops ? 'Sembunyikan' : 'Lihat'} daftar {shipments.length} paket</Button>{!['PENDING_ACCEPT', 'REJECTED'].includes(run.status) ? <Button type="button" variant="secondary" size="small" onClick={() => setShowMap((value) => !value)}>{showMap ? 'Sembunyikan peta' : 'Lihat rute di peta'}</Button> : null}</div> : null}
      {showMap && !['PENDING_ACCEPT', 'REJECTED'].includes(run.status) ? <DeliveryRouteMap hub={{ latitude: run.hub?.latitude ?? null, longitude: run.hub?.longitude ?? null }} stops={stops} /> : null}
      {showStops ? <div className="grid gap-3"><h4 className="m-0 text-sm font-bold text-[#45323f]">Urutan stop · ikuti nomor di peta</h4>{shipments.map((item) => {
        const shipment = item.shipment;
        const order = shipment?.order;
        const address = item.destination_address_snapshot || order?.destination_address_snapshot || shipment?.destination_address_snapshot || 'Alamat tujuan tercatat pada tugas';
        const awb = item.awb || shipment?.awb || `Paket #${item.shipment_id}`;
        const attempt = item.delivery_attempt;
        return <div key={item.id} className={`rounded-2xl border p-4 ${item.status === 'HANDED_OVER' && run.status === 'OUT_FOR_DELIVERY' ? 'border-[#efbdd4] bg-[#fffafd]' : 'border-[#eee5eb] bg-white'}`}>
          <div className="mb-2 flex items-center gap-2"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#fff0f7] text-xs font-bold text-[#bd2472]">{item.stop_order}</span><strong className="min-w-0 flex-1 break-all font-mono text-sm">{awb}</strong><Badge status={item.status} /></div>
          <p className="mb-1 flex items-start gap-2 break-words text-sm text-[#5e515c]"><Icon name="pin" size={16} />{address}</p><p className="mb-3 text-xs text-[#877781]">{item.recipient_name || order?.recipient_name || shipment?.recipient_name || 'Penerima'}{shipment?.attempt_count ? ` · Percobaan ke-${attempt?.attempt_no || shipment.attempt_count + 1}` : ''}</p>
          {run.status === 'OUT_FOR_DELIVERY' && item.status === 'HANDED_OVER' ? <div className="flex flex-wrap gap-2"><Button size="small" onClick={() => onResult(item)}>Catat hasil</Button><ContactOptions shipmentId={item.shipment_id} /></div> : null}
          {item.status === 'DELIVERED' ? <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-[#29805b]">Diterima {attempt?.recipient_name || 'penerima'} · {dateTime(attempt?.attempted_at)}</span>{attempt?.photo_available ? <PrivatePhotoViewer path={`/api/v1/shipments/${item.shipment_id}/delivery-photo`} kind="delivery" awb={awb} takenAt={attempt.attempted_at} address={address} /> : null}</div> : null}
          {item.status === 'FAILED' ? <Notice tone="error">Gagal: {failureLabels[attempt?.failure_reason || ''] || attempt?.failure_reason || 'Alasan tercatat'}. Bawa paket kembali ke hub; operator akan mengonfirmasi penerimaan.</Notice> : null}
          {item.status === 'RETURNED_TO_HUB' ? <Notice>Paket gagal sudah diterima kembali oleh hub. Pengantaran ulang memakai AWB yang sama.</Notice> : null}
          {item.status === 'CANCELLED' ? <Notice>Ditolak sebelum berangkat. {item.rejection_reason || 'Operator hub akan menugaskan ulang.'}</Notice> : null}
        </div>;
      })}</div> : null}
    </div>
  </article>;
}

export function CourierDeliveries({ toast }: { toast: Toast }) {
  const { data, loading, error, reload } = useResource<DeliveryRun[]>('/api/v1/courier/delivery-runs', (raw) => list<DeliveryRun>(raw));
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [respond, setRespond] = useState<DeliveryRun | null>(null);
  const [result, setResult] = useState<RunShipment | null>(null);
  const refresh = () => { reload(); window.dispatchEvent(new Event('courier:work-updated')); };
  useAutoRefresh(refresh);
  const start = async (run: DeliveryRun) => { setBusyId(run.id); try { await post(`/api/v1/courier/delivery-runs/${run.id}/start`); toast('Pengantaran dimulai. Admin dan penerima dapat melihat status terbaru.'); refresh(); } catch (cause) { toast(errorMessage(cause), 'error'); } finally { setBusyId(null); } };
  const matching = (data || []).filter((run) => runItems(run).some((item) => (item.awb || item.shipment?.awb || '').includes(search.trim())));
  const groups = [
    { title: 'Sedang diantar', statuses: ['OUT_FOR_DELIVERY'], icon: 'truck' },
    { title: 'Tugas baru · perlu dijawab', statuses: ['PENDING_ACCEPT'], icon: 'alert' },
    { title: 'Menunggu serah terima hub', statuses: ['ACCEPTED'], icon: 'package' },
    { title: 'Riwayat tugas', statuses: ['COMPLETED', 'REJECTED'], icon: 'check' },
  ];
  return <div className="page"><PageHeader eyebrow="Pengantaran ke penerima" title="Tugas antar" action={<Button variant="secondary" icon="refresh" onClick={reload}>Perbarui</Button>} />
    <div className="mb-4 rounded-2xl bg-[#fff7fa] p-4 text-xs leading-5 text-[#775a6c]">1. Terima atau tolak paket → 2. Tunggu operator menyerahkan paket → 3. Mulai antar dan catat hasil. Jika gagal, bawa paket kembali ke hub.</div><HubAwbSearch value={search} onChange={setSearch} awbs={(data || []).flatMap(runItems).map((item) => item.awb || item.shipment?.awb || '')} />
    {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : <div className="mt-5 grid gap-6">{groups.map((group) => {
      const runs = matching.filter((run) => group.statuses.includes(run.status));
      return <section key={group.title} className="grid gap-3"><h2 className="mb-0 flex items-center gap-2 text-base font-extrabold text-[#44323f]"><Icon name={group.icon} size={19} />{group.title}<span className="rounded-full bg-[#fff0f7] px-2 py-0.5 text-xs text-[#ae2a71]">{runs.length}</span></h2>{runs.length ? runs.map((run) => <CourierRunCard key={run.id} run={run} busy={busyId === run.id} otherRunActive={Boolean(data?.some((other) => other.id !== run.id && other.status === 'OUT_FOR_DELIVERY'))} onRespond={() => setRespond(run)} onStart={() => void start(run)} onResult={setResult} />) : <div className="rounded-2xl border border-dashed border-[#e9dfe5] bg-white px-4 py-5 text-sm text-[#91818d]">{search ? 'Tidak ada AWB yang cocok di tahap ini.' : 'Belum ada tugas pada tahap ini.'}</div>}</section>;
    })}</div>}
    {respond ? <RespondRun run={respond} onClose={() => setRespond(null)} onDone={refresh} toast={toast} /> : null}
    {result ? <DeliveryResult runShipment={result} onClose={() => setResult(null)} onDone={refresh} toast={toast} /> : null}
  </div>;
}
