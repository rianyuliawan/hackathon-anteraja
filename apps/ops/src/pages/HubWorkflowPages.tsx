import { Link } from 'react-router-dom';
import { useState, type FormEvent } from 'react';
import { list, post } from '../lib/api';
import { ContactOptions } from './ContactOptions';
import { PrivatePhotoViewer } from '../components/PrivatePhotoViewer';
import { HubAwbSearch } from '../components/HubAwbSearch';
import useAutoRefresh from '../hooks/useAutoRefresh';
import type { Courier, PickupTask, ShipmentIssue } from '../lib/types';
import { Badge, Button, dateTime, Empty, ErrorBox, errorMessage, Field, Icon, Loading, Modal, Notice, PageHeader, Panel, statusLabel, useResource } from '../ui';

type Toast = (message: string, tone?: 'success' | 'error') => void;

function AssignPickup({ hubId, task, couriers, onClose, onDone, toast }: { hubId: number; task: PickupTask; couriers: Courier[]; onClose: () => void; onDone: () => void; toast: Toast }) {
  const [courier, setCourier] = useState(''); const [date, setDate] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const eligibleCouriers = couriers.filter((item) => item.available !== false && item.zones?.some((zone) => zone.service_type === 'PICKUP'));
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { await post(`/api/v1/hubs/${hubId}/pickup-tasks/${task.id}/assign`, { courier_user_id: Number(courier), scheduled_at: date ? new Date(date).toISOString() : null }); toast('Kurir pickup telah ditugaskan.'); onDone(); onClose(); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); } };
  return <Modal title="Tugaskan kurir pickup" onClose={onClose}><form onSubmit={submit} className="form-stack"><div className="review-card"><strong>{task.shipment?.awb || task.awb || `Tugas #${task.id}`}</strong><span>{task.origin_address_snapshot || task.seller_address || task.shipment?.order?.origin_address_snapshot || 'Alamat toko tersedia pada pesanan'}</span></div><Field label="Kurir pickup" required><select required value={courier} onChange={(e) => setCourier(e.target.value)}><option value="">Pilih kurir</option>{eligibleCouriers.map((item) => <option key={item.user_id || item.id} value={item.user_id || item.id}>{item.name || item.email || `Kurir #${item.user_id || item.id}`}</option>)}</select></Field>{!eligibleCouriers.length ? <Notice tone="error">Belum ada kurir pickup aktif di hub ini.</Notice> : null}<Field label="Jadwal penjemputan"><input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)}/></Field><p className="helper">API memvalidasi hub tugas pickup dan kapasitas kurir sebelum tugas dibuat.</p>{error ? <Notice tone="error">{error}</Notice> : null}<div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Batal</Button><Button type="submit" loading={busy} disabled={!eligibleCouriers.length}>Tugaskan</Button></div></form></Modal>;
}

export function HubPickups({ hubId, toast }: { hubId: number; toast: Toast }) {
  const { data: tasks, loading, error, reload } = useResource<PickupTask[]>(`/api/v1/hubs/${hubId}/pickup-tasks`, (raw) => list<PickupTask>(raw));
  const { data: couriers } = useResource<Courier[]>(`/api/v1/hubs/${hubId}/pickup-couriers`, (raw) => list<Courier>(raw));
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PickupTask | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const refreshWork = () => { reload(); window.dispatchEvent(new Event('hub:work-updated')); };
  useAutoRefresh(refreshWork);
  const chooseCourier = async (task: PickupTask) => {
    if (task.status === 'WAITING_SELLER_READY') {
      setBusyId(task.id);
      try {
        await post(`/api/v1/hubs/${hubId}/pickup-tasks/${task.id}/mark-ready`);
        refreshWork();
      } catch (cause) { toast(errorMessage(cause), 'error'); return; }
      finally { setBusyId(null); }
    }
    setSelected(task);
  };
  const matching = (tasks || []).filter((task) => (task.shipment?.awb || task.awb || '').includes(search.trim()));
  const needsCourier = matching.filter((task) => ['WAITING_SELLER_READY', 'READY_FOR_PICKUP'].includes(task.status));
  const inProgress = matching.filter((task) => task.status === 'ASSIGNED');
  const pickedUp = matching.filter((task) => task.status === 'PICKED_UP');
  const pickupCourierName = (task: PickupTask) => {
    const userId = task.assignments?.[0]?.courier_user_id;
    return couriers?.find((courier) => (courier.user_id || courier.id) === userId)?.name || (userId ? `Kurir #${userId}` : 'Kurir');
  };
  const taskCard = (task: PickupTask) => {
    const awb = task.shipment?.awb || task.awb || `Tugas #${task.id}`;
    return <article key={task.id} className="flex flex-col gap-3 rounded-2xl border border-[#eee3e9] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><div className="mb-1 flex flex-wrap items-center gap-2"><strong className="font-mono text-sm">{awb}</strong><Badge status={task.status} /></div><p className="m-0 break-words text-xs text-[#7e7180]">Toko: {task.origin_address_snapshot || task.seller_address || task.shipment?.order?.origin_address_snapshot || 'Alamat tercatat di pesanan'}</p>{task.assignments?.[0] ? <p className="mb-0 mt-1 text-xs font-semibold text-[#9b5378]">{pickupCourierName(task)} · {statusLabel(task.assignments[0].status)}</p> : null}</div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {['WAITING_SELLER_READY', 'READY_FOR_PICKUP'].includes(task.status) ? <Button size="small" loading={busyId === task.id} onClick={() => void chooseCourier(task)}>Pilih kurir pickup</Button> : null}
        {task.status === 'ASSIGNED' ? <span className="text-xs text-[#817581]">Menunggu kurir menyelesaikan pickup</span> : null}
        {task.status === 'PICKED_UP' ? <><PrivatePhotoViewer path={`/api/v1/shipments/${task.shipment?.id}/pickup-photo`} awb={awb} takenAt={task.assignments?.[0]?.picked_up_at} address={task.origin_address_snapshot || task.seller_address || task.shipment?.order?.origin_address_snapshot} /><Link to="/hub-inbound" className="text-sm font-bold text-[#b52670] hover:underline">Lihat penerimaan hub</Link></> : null}
      </div>
    </article>;
  };
  return <div className="page">
    <PageHeader eyebrow="Tahap 1 · Penjemputan" title="Tugaskan pickup" action={<Button variant="secondary" icon="refresh" onClick={refreshWork}>Perbarui</Button>} />
    <Notice>Kurir menerima tugas, mengambil foto paket di toko, lalu menyelesaikan pickup. Paket sesudahnya muncul di <Link to="/hub-inbound" className="font-bold underline">Paket tiba di hub</Link>.</Notice>
    <div className="my-4"><HubAwbSearch value={search} onChange={setSearch} awbs={(tasks || []).map((task) => task.shipment?.awb || task.awb || '')} /></div>
    {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : <div className="grid gap-5">
      <Panel title={`Perlu ditugaskan · ${needsCourier.length}`}>{needsCourier.length ? <div className="grid gap-3">{needsCourier.map(taskCard)}</div> : <Empty icon="check" title={search ? 'AWB tidak ditemukan' : 'Tidak ada pickup yang perlu ditugaskan'} detail="Paket baru muncul setelah ops admin menerbitkan AWB." />}</Panel>
      <Panel title={`Sedang diproses kurir · ${inProgress.length}`}>{inProgress.length ? <div className="grid gap-3">{inProgress.map(taskCard)}</div> : <Empty icon="truck" title="Belum ada pickup berjalan" />}</Panel>
      {pickedUp.length ? <Panel title={`Pickup selesai · ${pickedUp.length}`}><div className="grid gap-3">{pickedUp.map(taskCard)}</div></Panel> : null}
    </div>}
    {selected ? <AssignPickup hubId={hubId} task={selected} couriers={couriers || []} onClose={() => setSelected(null)} onDone={refreshWork} toast={toast} /> : null}
  </div>;
}

function IssueDecision({ hubId, issue, onClose, onDone, toast }: { hubId: number; issue: ShipmentIssue; onClose: () => void; onDone: () => void; toast: Toast }) {
  const [decision, setDecision] = useState<'RESCHEDULE'|'RETURN_TO_SELLER'>('RESCHEDULE'); const [date, setDate] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { await post(`/api/v1/hubs/${hubId}/issues/${issue.id}/decision`, { decision, scheduled_redelivery_at: decision === 'RESCHEDULE' && date ? new Date(date).toISOString() : null, note }); toast(decision === 'RESCHEDULE' ? 'Pengantaran ulang dijadwalkan pada resi yang sama.' : 'Permintaan retur tersimpan.'); onDone(); onClose(); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); } };
  return <Modal title={`Keputusan kendala #${issue.id}`} onClose={onClose}><form onSubmit={submit} className="form-stack"><Notice>Pastikan paket sudah dikonfirmasi kembali di hub. Penugasan ulang memakai AWB yang sama dan attempt sebelumnya tetap tercatat.</Notice><Field label="Keputusan" required><select value={decision} onChange={(e) => setDecision(e.target.value as 'RESCHEDULE'|'RETURN_TO_SELLER')}><option value="RESCHEDULE">Jadwalkan antar ulang</option><option value="RETURN_TO_SELLER">Minta retur ke toko</option></select></Field>{decision === 'RESCHEDULE' ? <Field label="Jadwal antar ulang" required><input type="datetime-local" required value={date} onChange={(e) => setDate(e.target.value)}/></Field> : null}{issue.shipment?.id ? <ContactOptions shipmentId={issue.shipment.id}/> : null}<Field label="Catatan untuk tim"><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Instruksi dan hasil komunikasi dengan penerima"/></Field>{error ? <Notice tone="error">{error}</Notice> : null}<div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Batal</Button><Button type="submit" loading={busy}>Simpan keputusan</Button></div></form></Modal>;
}

export function HubIssues({ hubId, toast }: { hubId: number; toast: Toast }) {
  const { data: issues, loading, error, reload } = useResource<ShipmentIssue[]>(`/api/v1/hubs/${hubId}/issues`, (raw) => list<ShipmentIssue>(raw));
  const [selected, setSelected] = useState<ShipmentIssue | null>(null);
  const [search, setSearch] = useState('');
  useAutoRefresh(reload);
  const matching = (issues || []).filter((issue) => (issue.shipment?.awb || '').includes(search.trim()));
  return <div className="page"><PageHeader eyebrow="Tindak lanjut pengantaran" title="Kendala & antar ulang" action={<Button variant="secondary" icon="refresh" onClick={reload}>Perbarui</Button>}/><div className="my-4"><HubAwbSearch value={search} onChange={setSearch} awbs={(issues || []).map((issue) => issue.shipment?.awb || '')} /></div><Panel>{loading ? <Loading/> : error ? <ErrorBox error={error} retry={reload}/> : !matching.length ? <Empty icon="check" title={search ? "AWB tidak ditemukan" : "Belum ada kendala"} detail="Percobaan gagal yang dilaporkan kurir akan muncul di sini."/> : <div className="issue-list">{matching.map((issue) => <article className="issue-card" key={issue.id}><div className="issue-card-main"><div className="issue-card-title"><Icon name="alert" size={19}/><strong>{issue.shipment?.awb || `Kendala #${issue.id}`}</strong><Badge status={issue.status}/></div><p>{issue.attempt?.failure_reason || issue.delivery_attempt?.failure_reason || issue.failure_reason || 'Alasan belum tersedia'}</p><small>Percobaan #{issue.attempt?.attempt_no || issue.delivery_attempt?.attempt_no || '—'} · {dateTime(issue.created_at)}</small><small>Status paket: {statusLabel(issue.shipment?.status)}</small>{issue.decision ? <small>Keputusan: {statusLabel(issue.decision)} · {dateTime(issue.scheduled_redelivery_at)}</small> : null}</div><div className="issue-card-action">{issue.status === 'OPEN' && issue.shipment?.status === 'AT_HUB_AWAITING_DECISION' ? <Button size="small" onClick={() => setSelected(issue)}>Ambil keputusan</Button> : issue.status === 'OPEN' ? <small>Menunggu paket kembali ke hub</small> : null}{issue.shipment?.id ? <ContactOptions shipmentId={issue.shipment.id}/> : null}<Link className="text-link" to={`/tracking?awb=${encodeURIComponent(issue.shipment?.awb || '')}`}>Lihat perjalanan</Link></div></article>)}</div>}</Panel>{selected ? <IssueDecision hubId={hubId} issue={selected} onClose={() => setSelected(null)} onDone={reload} toast={toast}/> : null}</div>;
}

