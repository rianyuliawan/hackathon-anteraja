import { Link } from 'react-router-dom';
import { useState, type FormEvent } from 'react';
import { downloadFile, list, post, unwrap } from '../lib/api';
import type { Courier, DailyReport, DeliveryRun, RoutePreview, Shipment, PickupTask } from '../lib/types';
import { Badge, Button, dateOnly, Empty, ErrorBox, errorMessage, Field, Icon, Loading, Modal, Notice, PageHeader, Panel, statusLabel, todayJakarta, useResource } from '../ui';
import { DeliveryRouteMap } from '../components/DeliveryRouteMap';
import { HubAwbSearch } from '../components/HubAwbSearch';
import useAutoRefresh from '../hooks/useAutoRefresh';

type Toast = (message: string, tone?: 'success' | 'error') => void;
export function HubOverview({ hubId, hubName }: { hubId: number; hubName?: string }) {
  const pickups = useResource<PickupTask[]>(`/api/v1/hubs/${hubId}/pickup-tasks`, (raw) => list<PickupTask>(raw));
  const inbound = useResource<Shipment[]>(`/api/v1/hubs/${hubId}/inbound`, (raw) => list<Shipment>(raw));
  const ready = useResource<Shipment[]>(`/api/v1/hubs/${hubId}/ready`, (raw) => list<Shipment>(raw));
  const runs = useResource<DeliveryRun[]>(`/api/v1/hubs/${hubId}/delivery-runs`, (raw) => list<DeliveryRun>(raw));
  const loading = pickups.loading || inbound.loading || ready.loading || runs.loading;
  const error = pickups.error || inbound.error || ready.error || runs.error;
  const reload = () => { pickups.reload(); inbound.reload(); ready.reload(); runs.reload(); };
  useAutoRefresh(reload);
  const pickupToAssign = pickups.data?.filter((task) => ['WAITING_SELLER_READY', 'READY_FOR_PICKUP'].includes(task.status)).length || 0;
  const pickupInProgress = pickups.data?.filter((task) => task.status === 'ASSIGNED').length || 0;
  const arrivalToConfirm = inbound.data?.filter((shipment) => ['PICKED_UP', 'IN_TRANSIT'].includes(shipment.status)).length || 0;
  const readyToAssign = ready.data?.length || 0;
  const waitingCourier = runs.data?.filter((run) => run.status === 'PENDING_ACCEPT').length || 0;
  const handoverReady = runs.data?.filter((run) => run.status === 'ACCEPTED' && (run.shipments || run.run_shipments || []).some((item) => item.status === 'ASSIGNED')).length || 0;
  const failedToReturn = runs.data?.flatMap((run) => run.shipments || run.run_shipments || []).filter((item) => item.status === 'FAILED' && item.shipment?.status === 'DELIVERY_FAILED').length || 0;
  const next = arrivalToConfirm ? { label: 'Konfirmasi paket yang tiba', href: '/hub-inbound', count: arrivalToConfirm }
    : pickupToAssign ? { label: 'Tugaskan kurir pickup', href: '/hub-pickups', count: pickupToAssign }
      : handoverReady ? { label: 'Serahkan paket ke kurir', href: '/hub-dispatch', count: handoverReady }
        : readyToAssign ? { label: 'Atur pengantaran', href: '/hub-dispatch', count: readyToAssign }
          : failedToReturn ? { label: 'Terima paket gagal kirim', href: '/hub-returns', count: failedToReturn }
            : null;
  const steps = [
    { number: '01', title: 'Tugaskan pickup', description: 'Paket dari ops admin otomatis masuk ke hub ini. Pilih kurir untuk mengambil dari toko.', count: pickupToAssign, detail: `${pickupInProgress} sedang dijemput`, href: '/hub-pickups' },
    { number: '02', title: 'Terima di hub', description: 'Setelah kurir memfoto paket dan menyelesaikan pickup, konfirmasi paket fisik tiba.', count: arrivalToConfirm, detail: 'menunggu konfirmasi tiba', href: '/hub-inbound' },
    { number: '03', title: 'Atur pengantaran', description: 'Pilih paket satu area, tentukan kurir, dan lihat saran urutan pengantaran.', count: readyToAssign, detail: `${waitingCourier} tugas menunggu jawaban kurir`, href: '/hub-dispatch' },
    { number: '04', title: 'Serahkan ke kurir', description: 'Saat kurir menerima tugas, periksa daftar paket dan konfirmasi serah terima.', count: handoverReady, detail: 'run siap diserahkan', href: '/hub-dispatch' },
  ];
  return <div className="page">
    <PageHeader eyebrow="Operasi hub" title={hubName || `Hub #${hubId}`} action={<Button variant="secondary" icon="refresh" onClick={reload}>Perbarui</Button>} />
    {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : <>
      <section className="mb-5 rounded-[1.5rem] border border-[#f5d5e4] bg-[#fff3f8] p-5 sm:p-6">
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-[#aa3370]">Perlu tindakan sekarang</p>
        {next ? <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="mb-1 text-xl font-extrabold text-[#462d3b]">{next.count} {next.label.toLowerCase()}</h2><p className="m-0 text-sm text-[#806b78]">Paket muncul otomatis sesuai status dari ops admin atau kurir.</p></div><Link to={next.href} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#e91681] px-5 text-sm font-bold text-white hover:bg-[#c60c69]">Buka antrean <Icon name="chevron" size={17} /></Link></div>
          : <p className="m-0 text-sm text-[#684d5d]">Belum ada paket yang perlu dikonfirmasi. Pantau tugas yang sedang berjalan di bawah.</p>}
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        {steps.map((step) => <Link key={step.number} to={step.href} className="group rounded-2xl border border-[#eee1e8] bg-white p-5 shadow-sm transition hover:border-[#e9a8c9] hover:shadow-md">
          <div className="mb-3 flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#fff0f7] text-sm font-extrabold text-[#c51c70]">{step.number}</span><span className="rounded-full bg-[#fff0f7] px-3 py-1 text-xs font-bold text-[#b72772]">{step.count} perlu tindakan</span></div>
          <h2 className="mb-1 text-base font-extrabold text-[#392d36]">{step.title}</h2><p className="mb-3 text-sm leading-6 text-[#7e7180]">{step.description}</p><span className="flex items-center justify-between text-xs font-semibold text-[#a9507d]">{step.detail}<Icon name="chevron" size={16} /></span>
        </Link>)}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Link to="/hub-returns" className="flex items-center gap-3 rounded-2xl border border-[#eee1e8] bg-white p-4 text-sm"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fff2e7] text-[#b76028]"><Icon name="refresh" /></span><span className="flex-1"><strong className="block">Paket gagal kembali</strong><small className="text-[#80717c]">{failedToReturn} paket menunggu diterima dari kurir</small></span><Icon name="chevron" size={16} /></Link>
        <Link to="/hub-issues" className="flex items-center gap-3 rounded-2xl border border-[#eee1e8] bg-white p-4 text-sm"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fff2e7] text-[#b76028]"><Icon name="alert" /></span><span className="flex-1"><strong className="block">Kendala & antar ulang</strong><small className="text-[#80717c]">Hubungi penerima dan gunakan AWB yang sama</small></span><Icon name="chevron" size={16} /></Link>
      </div>
    </>}
  </div>;
}

export function HubInbound({ hubId, toast }: { hubId: number; toast: Toast }) {
  const { data, loading, error, reload } = useResource<Shipment[]>(`/api/v1/hubs/${hubId}/inbound`, (raw) => list<Shipment>(raw));
  const [search, setSearch] = useState('');
  const [busyAwb, setBusyAwb] = useState<string | null>(null);
  const matching = (data || []).filter((shipment) => shipment.awb.includes(search.trim()));
  const planned = matching.filter((shipment) => !['PICKED_UP', 'IN_TRANSIT'].includes(shipment.status));
  const onWay = matching.filter((shipment) => ['PICKED_UP', 'IN_TRANSIT'].includes(shipment.status));
  const refreshWork = () => { reload(); window.dispatchEvent(new Event('hub:work-updated')); };
  useAutoRefresh(refreshWork);
  const confirmArrival = async (awb: string) => {
    setBusyAwb(awb);
    try {
      await post(`/api/v1/hubs/${hubId}/scan-in`, { awb });
      toast(`${awb} sudah diterima di hub. Paket kini siap ditugaskan antar.`);
      refreshWork();
    } catch (cause) { toast(errorMessage(cause), 'error'); }
    finally { setBusyAwb(null); }
  };
  const packageRow = (shipment: Shipment, canConfirm: boolean) => <article key={shipment.id} className="flex flex-col gap-3 rounded-2xl border border-[#eee5eb] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0"><div className="mb-1 flex flex-wrap items-center gap-2"><strong className="font-mono text-sm text-[#3e3039]">{shipment.awb}</strong><Badge status={shipment.status} /></div><p className="m-0 text-sm font-semibold text-[#554550]">{shipment.order?.recipient_name || shipment.recipient_name || 'Penerima'}</p><p className="mb-0 mt-1 break-words text-xs text-[#817581]">Dari {shipment.order?.origin_address_snapshot || 'alamat toko pada pesanan'}</p></div>
    {canConfirm ? <Button size="small" loading={busyAwb === shipment.awb} onClick={() => void confirmArrival(shipment.awb)}>Konfirmasi sudah tiba</Button> : <Link to="/hub-pickups" className="text-sm font-bold text-[#bb236f] hover:underline">Lihat proses pickup</Link>}
  </article>;
  return <div className="page">
    <PageHeader eyebrow="Tahap 2 · Penerimaan" title="Paket tiba di hub" action={<Button variant="secondary" icon="refresh" onClick={refreshWork}>Perbarui</Button>} />
    <Notice>Kurir pickup mengambil foto di toko. Setelah paket diserahkan ke hub, pilih <strong>Konfirmasi sudah tiba</strong>. Paket lalu otomatis masuk ke halaman Atur pengantaran.</Notice>
    <div className="my-4"><HubAwbSearch value={search} onChange={setSearch} awbs={(data || []).map((shipment) => shipment.awb)} /></div>
    {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : <div className="grid gap-5">
      <Panel title={`Perlu dikonfirmasi tiba · ${onWay.length}`}>{onWay.length ? <div className="grid gap-3">{onWay.map((shipment) => packageRow(shipment, true))}</div> : <Empty icon="check" title={search ? 'AWB tidak ada di antrean ini' : 'Belum ada paket yang dibawa kurir'} detail="Paket muncul di sini setelah kurir menyelesaikan pickup dan mengambil foto." />}</Panel>
      <Panel title={`Masih menunggu pickup · ${planned.length}`}>{planned.length ? <div className="grid gap-3">{planned.map((shipment) => packageRow(shipment, false))}</div> : <Empty icon="package" title="Tidak ada paket menunggu pickup" detail="Pesanan yang di-ACC ops admin akan muncul otomatis di hub terkait." />}</Panel>
    </div>}
  </div>;
}

function CreateRun({ hubId, shipments, couriers, runs, onClose, onDone, toast }: { hubId: number; shipments: Shipment[]; couriers: Courier[]; runs: DeliveryRun[]; onClose: () => void; onDone: () => void; toast: Toast }) {
  const zones = [...new Map(shipments.map((shipment) => [shipment.delivery_zone_id, shipment.delivery_zone])).entries()].filter(([id]) => id);
  const [zoneId, setZoneId] = useState(String(zones[0]?.[0] || ''));
  const [courierId, setCourierId] = useState('');
  const [date, setDate] = useState(todayJakarta);
  const [selected, setSelected] = useState<number[]>([]);
  const [preview, setPreview] = useState<RoutePreview | null>(null);
  const [roadMinutes, setRoadMinutes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [error, setError] = useState('');
  const zoned = shipments.filter((shipment) => String(shipment.delivery_zone_id) === zoneId)
    .sort((left, right) => (right.waiting_hours || 0) - (left.waiting_hours || 0));
  const zoneCouriers = couriers.filter((courier) => courier.zones?.some((zone) => zone.id === Number(zoneId)));
  const conflictFor = (courier: Courier) => runs.find((run) => run.courier_user_id === (courier.user_id || courier.id)
    && ['PENDING_ACCEPT', 'ACCEPTED', 'OUT_FOR_DELIVERY'].includes(run.status)
    && (run.status === 'OUT_FOR_DELIVERY' || run.service_date.slice(0, 10) === date));
  const availableCouriers = zoneCouriers.filter((courier) => courier.available !== false && !conflictFor(courier));
  const chosenCourier = availableCouriers.find((courier) => String(courier.user_id || courier.id) === courierId);
  const estimatedMinutes = roadMinutes === null ? null : roadMinutes + selected.length * 8;

  const toggle = (id: number) => { setPreview(null); setRoadMinutes(null); setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); };
  const changeZone = (value: string) => { setZoneId(value); setSelected([]); setCourierId(''); setPreview(null); setRoadMinutes(null); };
  const changeDate = (nextDate: string) => { setDate(nextDate); setCourierId(''); };
  const calculate = async () => {
    if (!selected.length) { setError('Pilih minimal satu paket untuk disusun.'); return; }
    setPreviewBusy(true); setError(''); setRoadMinutes(null);
    try {
      const response = await post<unknown>(`/api/v1/hubs/${hubId}/delivery-runs/preview`, { zone_id: Number(zoneId), shipment_ids: selected });
      setPreview(unwrap<RoutePreview>(response));
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setPreviewBusy(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected.length) { setError('Pilih minimal satu paket.'); return; }
    if (chosenCourier?.max_parcels && selected.length > chosenCourier.max_parcels) { setError('Jumlah paket melebihi kapasitas kurir.'); return; }
    setBusy(true); setError('');
    try {
      await post(`/api/v1/hubs/${hubId}/delivery-runs`, { zone_id: Number(zoneId), courier_user_id: Number(courierId), shipment_ids: selected, service_date: date });
      toast(`Tugas antar ${selected.length} paket dibuat. Kurir perlu menerima tugas sebelum serah terima.`);
      onDone(); onClose();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };

  return <Modal title="Buat tugas pengantaran" onClose={onClose} wide>
    <form className="form-stack" onSubmit={submit}>
      <Notice>Pilih paket dalam satu zona. Sistem menyarankan urutan berdasarkan jarak titik tujuan, lama menunggu, dan riwayat percobaan. Kurir harus menerima tugas sebelum paket diserahkan.</Notice>
      <Field label="Tanggal pengantaran" required><input type="date" required min={todayJakarta()} value={date} onChange={(event) => changeDate(event.target.value)}/></Field>
      <Field label="Zona pengantaran" required><select required value={zoneId} onChange={(event) => changeZone(event.target.value)}>{zones.map(([id, zone]) => <option key={id} value={id}>{zone?.name || `Zona #${id}`}</option>)}</select></Field>
      <div className="field"><span className="field-label">Paket siap antar <span className="required">*</span></span><p className="mb-2 mt-0 text-xs text-[#806f7a]">Urut dari waktu menunggu terlama di hub. Periksa status dan percobaan sebelumnya sebelum memilih.</p><div className="selection-list">{zoned.length ? zoned.map((shipment) => <label key={shipment.id} className="select-row"><input type="checkbox" checked={selected.includes(shipment.id)} onChange={() => toggle(shipment.id)}/><span><strong>{shipment.awb}</strong><small>{shipment.order?.recipient_name || shipment.recipient_name} · {shipment.order?.destination_address_snapshot || shipment.destination_address_snapshot}</small><small className={shipment.waiting_hours !== undefined && shipment.waiting_hours >= 24 ? 'text-amber-700' : ''}>Menunggu di hub {shipment.waiting_hours ?? '—'} jam · penanganan total {shipment.age_hours ?? '—'} jam · {shipment.attempt_count || 0} percobaan sebelumnya</small><small>{shipment.status === 'WAITING_REDELIVERY' ? 'Antar ulang' : 'Pengantaran pertama'} · {statusLabel(shipment.status)}</small></span></label>) : <Empty icon="package" title="Tidak ada paket di zona ini"/>}</div></div>
      <div className="field"><span className="field-label">Kurir yang melayani zona ini <span className="required">*</span></span><p className="mb-2 mt-0 text-xs text-[#806f7a]">Ketersediaan dihitung untuk {date}. Kurir yang sedang mengantar atau sudah memiliki tugas aktif pada tanggal ini tidak dapat dipilih.</p><div className="selection-list">{zoneCouriers.length ? zoneCouriers.map((courier) => { const conflict = conflictFor(courier); const unavailable = courier.available === false || Boolean(conflict); const id = courier.user_id || courier.id; return <label key={id} className={`select-row ${unavailable ? 'opacity-60' : ''}`}><input type="radio" name="delivery-courier" value={id} checked={courierId === String(id)} disabled={unavailable} onChange={() => setCourierId(String(id))}/><span><strong>{courier.name || courier.email || `Kurir #${id}`}</strong><small>{unavailable ? courier.available === false ? 'Tidak aktif / tidak tersedia' : conflict?.status === 'OUT_FOR_DELIVERY' ? `Sedang mengantar · tugas #${conflict.id}` : 'Sudah memiliki tugas aktif pada tanggal ini' : 'Tersedia pada tanggal ini'} · maks. {courier.max_parcels || '—'} paket</small></span></label>; }) : <Empty icon="truck" title="Tidak ada kurir untuk zona ini"/>}</div></div>
      {!availableCouriers.length ? <Notice tone="error">Tidak ada kurir yang tersedia pada tanggal ini. Pilih tanggal lain.</Notice> : null}
      <Button type="button" variant="secondary" onClick={calculate} loading={previewBusy} disabled={!selected.length}>Lihat urutan & peta</Button>
      {preview ? <section className="route-preview" aria-label="Pratinjau urutan pengantaran"><div className="route-preview-head"><div><span className="eyebrow">SARAN PENGANTARAN</span><h3>{preview.stops.length} stop · jalur jalan</h3></div><small>{preview.strategy === 'distance_age_priority' ? 'Jarak + prioritas umur paket' : 'Prioritas umur + kode pos'}</small></div><DeliveryRouteMap hub={preview.hub} stops={preview.stops.map((stop) => ({ order: stop.stop_order, label: stop.awb, latitude: stop.latitude, longitude: stop.longitude, priority: stop.priority }))} onDuration={setRoadMinutes}/><ol className="route-preview-list">{preview.stops.map((stop) => <li key={stop.shipment_id}><b>{stop.stop_order}</b><span><strong>{stop.awb}</strong><small>{stop.recipient_name} · {stop.postcode}</small><small>Dalam sistem {stop.age_hours} jam · di antrean {stop.waiting_hours} jam · {stop.attempt_count} percobaan sebelumnya</small></span><em className={`route-priority ${stop.priority.toLowerCase()}`}>{stop.priority === 'URGENT' ? 'Prioritas tinggi' : stop.priority === 'WATCH' ? 'Perlu dipantau' : 'Normal'}</em></li>)}</ol>{estimatedMinutes !== null ? <p className="mt-3 rounded-xl bg-[#eaf8ef] p-3 text-sm text-[#23724b]">Perkiraan {estimatedMinutes} menit untuk perjalanan dan 8 menit per stop. Belum termasuk kemacetan langsung.</p> : null}<p className="helper">Ambang 24/48 jam adalah indikator demo, bukan janji SLA resmi. Rute final dapat disesuaikan bila kondisi jalan berubah.</p></section> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Batal</Button><Button type="submit" loading={busy} disabled={!chosenCourier || !selected.length}>Tugaskan {selected.length} paket</Button></div>
    </form>
  </Modal>;
}

function HandoverRun({ hubId, run, onClose, onDone, toast }: { hubId: number; run: DeliveryRun; onClose: () => void; onDone: () => void; toast: Toast }) {
  const shipments = (run.shipments || run.run_shipments || []).filter((item) => item.status === 'ASSIGNED');
  const awbs = shipments.map((item) => item.awb || item.shipment?.awb).filter((value): value is string => Boolean(value));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true); setError('');
    try {
      await post(`/api/v1/hubs/${hubId}/handover`, { run_id: run.id, awbs });
      toast(`${awbs.length} paket diserahkan ke kurir. Kurir bisa mulai pengantaran.`);
      onDone(); onClose();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  return <Modal title={`Serahkan paket · tugas #${run.id}`} onClose={onClose}>
    <div className="grid gap-4">
      <Notice>Kurir sudah menerima tugas. Cocokkan paket fisik dengan daftar ini, lalu konfirmasi seluruh paket yang diterima kurir.</Notice>
      <div className="grid gap-2">{shipments.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-[#eee3e9] p-3"><Icon name="package" size={18} /><div><strong className="block font-mono text-sm">{item.awb || item.shipment?.awb || `Paket #${item.shipment_id}`}</strong><small className="text-[#817581]">Stop {item.stop_order}</small></div></div>)}</div>
      {!awbs.length || awbs.length !== shipments.length ? <Notice tone="error">Nomor resi paket belum lengkap. Perbarui halaman sebelum melanjutkan.</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Batal</Button><Button type="button" onClick={submit} disabled={!awbs.length || awbs.length !== shipments.length} loading={busy}>Konfirmasi serah terima {awbs.length} paket</Button></div>
    </div>
  </Modal>;
}

export function HubDispatch({ hubId, toast }: { hubId: number; toast: Toast }) {
  const ready = useResource<Shipment[]>(`/api/v1/hubs/${hubId}/ready`, (raw) => list<Shipment>(raw));
  const runs = useResource<DeliveryRun[]>(`/api/v1/hubs/${hubId}/delivery-runs`, (raw) => list<DeliveryRun>(raw));
  const couriers = useResource<Courier[]>(`/api/v1/hubs/${hubId}/couriers`, (raw) => list<Courier>(raw));
  const [create, setCreate] = useState(false);
  const [handover, setHandover] = useState<DeliveryRun | null>(null);
  const [search, setSearch] = useState('');
  const reload = () => { ready.reload(); runs.reload(); couriers.reload(); };
  useAutoRefresh(reload);
  const pending = runs.data?.filter((run) => run.status === 'PENDING_ACCEPT').length || 0;
  const accepted = runs.data?.filter((run) => run.status === 'ACCEPTED' && (run.shipments || run.run_shipments || []).some((item) => item.status === 'ASSIGNED')).length || 0;
  const onRoad = runs.data?.filter((run) => run.status === 'OUT_FOR_DELIVERY').length || 0;
  const rejected = (runs.data || []).flatMap((run) => run.shipments || run.run_shipments || []).filter((item) => item.status === 'CANCELLED').length;
  const filteredReady = (ready.data || []).filter((shipment) => shipment.awb.includes(search.trim()));
  const filteredRuns = (runs.data || []).filter((run) => (run.shipments || run.run_shipments || []).some((item) => (item.awb || item.shipment?.awb || '').includes(search.trim())));
  const rejectedReasons = new Map<number, string>();
  for (const run of runs.data || []) {
    for (const item of run.shipments || run.run_shipments || []) {
      if (item.status === 'CANCELLED' && !rejectedReasons.has(item.shipment_id)) rejectedReasons.set(item.shipment_id, item.rejection_reason || 'Perlu assign ulang');
    }
  }

  return <div className="page">
    <PageHeader eyebrow="Last mile · operator hub" title="Atur pengantaran" action={<Button onClick={() => setCreate(true)} icon="truck" disabled={!ready.data?.length}>Buat tugas antar</Button>}/>
    <div className="dispatch-flow"><div><b>1</b><span><strong>Tugaskan paket</strong><small>Kurir menjawab per paket atau menerima semuanya.</small></span></div><div><b>2</b><span><strong>Konfirmasi serah terima</strong><small>Cocokkan daftar paket yang diterima kurir, lalu klik konfirmasi.</small></span></div><div><b>3</b><span><strong>Antar & laporkan</strong><small>Kurir mulai jalan dan mencatat hasil per paket.</small></span></div></div>
    <div className="dispatch-metrics"><span><strong>{ready.data?.length ?? 0}</strong> siap di hub</span><span><strong>{pending}</strong> menunggu kurir</span><span><strong>{accepted}</strong> siap diserahkan</span><span><strong>{onRoad}</strong> di jalan</span><span><strong>{rejected}</strong> pernah ditolak</span></div>
    <div className="my-4"><HubAwbSearch value={search} onChange={setSearch} awbs={[...(ready.data || []).map((shipment) => shipment.awb), ...(runs.data || []).flatMap((run) => (run.shipments || run.run_shipments || []).map((item) => item.awb || item.shipment?.awb || ''))]} /></div>
    <div className="two-col"><Panel title={`Paket siap · ${filteredReady.length}`} action={<button className="icon-button" onClick={reload} aria-label="Perbarui"><Icon name="refresh" size={17}/></button>}>
      {ready.loading ? <Loading/> : ready.error ? <ErrorBox error={ready.error} retry={ready.reload}/> : !filteredReady.length ? <Empty icon="package" title={search ? "AWB tidak ditemukan" : "Antrean kosong"} detail="Konfirmasi paket tiba atau tunggu keputusan antar ulang."/> : <div className="stack-list">{filteredReady.map((shipment) => {
        const age = shipment.created_at ? Math.max(0, Math.floor((Date.now() - new Date(shipment.created_at).getTime()) / 3600000)) : null;
        return <div key={shipment.id} className="stack-item"><span className="small-icon"><Icon name="package" size={17}/></span><div><strong>{shipment.awb}</strong><small>{shipment.delivery_zone?.name || `Zona #${shipment.delivery_zone_id}`} · {shipment.order?.recipient_name || shipment.recipient_name}</small><small>{shipment.waiting_hours ?? '—'} jam menunggu di hub · {shipment.age_hours ?? age ?? '—'} jam penanganan total{shipment.attempt_count ? ` · ${shipment.attempt_count} percobaan gagal` : ''}</small>{rejectedReasons.has(shipment.id) ? <small className="text-amber-700">Ditolak kurir · {rejectedReasons.get(shipment.id)} · assign ulang</small> : null}</div><Badge status={shipment.status}/></div>;
      })}</div>}
    </Panel><Panel title={`Tugas kurir · ${filteredRuns.length}`}>
      {runs.loading ? <Loading/> : runs.error ? <ErrorBox error={runs.error} retry={runs.reload}/> : !filteredRuns.length ? <Empty icon="truck" title={search ? "AWB tidak ditemukan" : "Belum ada tugas kurir"}/> : <div className="stack-list">{filteredRuns.map((run) => <div key={run.id} className="run-card"><div className="run-card-top"><strong>Tugas #{run.id}</strong><Badge status={run.status}/></div><p>{run.zone?.name || `Zona #${run.zone_id}`} · {dateOnly(run.service_date)}</p><small>{run.courier?.name || `Kurir #${run.courier_user_id}`} · {run.parcel_count || run.shipments?.length || run.run_shipments?.length || 0} paket</small><small>{run.status === 'PENDING_ACCEPT' ? 'Menunggu jawaban kurir untuk setiap paket.' : run.status === 'ACCEPTED' ? (run.shipments || run.run_shipments || []).some((item) => item.status === 'ASSIGNED') ? 'Kurir sudah menerima tugas. Cocokkan paket lalu konfirmasi serah terima.' : 'Paket sudah diserahkan. Menunggu kurir memulai pengantaran.' : run.status === 'REJECTED' ? 'Ditolak. Paket kembali ke antrean siap untuk assign ulang.' : run.status === 'OUT_FOR_DELIVERY' ? 'Kurir sedang mengantar; hasil tiap paket akan muncul di sini.' : 'Riwayat run tersimpan.'}</small><details className="run-parcel-details"><summary>Lihat {(run.shipments || run.run_shipments || []).length} paket dalam run</summary><div>{(run.shipments || run.run_shipments || []).map((item) => <div key={item.id}><strong className="mono">{item.awb || item.shipment?.awb || `Paket #${item.shipment_id}`}</strong><span>{item.status === 'CANCELLED' ? 'Ditolak kurir · assign ulang' : item.status === 'ASSIGNED' && run.status === 'ACCEPTED' ? 'Diterima · menunggu serah terima' : item.status === 'ASSIGNED' ? 'Menunggu jawaban' : item.status === 'HANDED_OVER' ? 'Diserahkan ke kurir' : statusLabel(item.status)}</span>{item.rejection_reason ? <small>Alasan: {item.rejection_reason}</small> : null}</div>)}</div></details>{(run.shipments || run.run_shipments || []).some((item) => item.status === 'CANCELLED') ? <small className="text-amber-700">{(run.shipments || run.run_shipments || []).filter((item) => item.status === 'CANCELLED').length} paket ditolak dan kembali ke antrean siap antar.</small> : null}{run.status === 'ACCEPTED' && (run.shipments || run.run_shipments || []).some((item) => item.status === 'ASSIGNED') ? <Button size="small" variant="secondary" onClick={() => setHandover(run)} icon="check">Konfirmasi serah terima</Button> : null}</div>)}</div>}
    </Panel></div>
    {create ? <CreateRun hubId={hubId} shipments={ready.data || []} couriers={couriers.data || []} runs={runs.data || []} onClose={() => setCreate(false)} onDone={reload} toast={toast}/> : null}
    {handover ? <HandoverRun hubId={hubId} run={handover} onClose={() => setHandover(null)} onDone={reload} toast={toast}/> : null}
  </div>;
}

export function HubReturns({ hubId, toast }: { hubId: number; toast: Toast }) {
  const { data: runs, loading, error, reload } = useResource<DeliveryRun[]>(`/api/v1/hubs/${hubId}/delivery-runs`, (raw) => list<DeliveryRun>(raw));
  const [search, setSearch] = useState('');
  const [busyAwb, setBusyAwb] = useState<string | null>(null);
  useAutoRefresh(reload);
  const failed = (runs || []).flatMap((run) => run.shipments || run.run_shipments || [])
    .filter((item) => item.status === 'FAILED' && item.shipment?.status === 'DELIVERY_FAILED')
    .filter((item) => (item.awb || item.shipment?.awb || '').includes(search.trim()));
  const confirmReturn = async (awb: string) => {
    setBusyAwb(awb);
    try {
      await post(`/api/v1/hubs/${hubId}/return-scan`, { awb });
      toast(`${awb} diterima kembali di hub. Sekarang tentukan tindak lanjutnya.`);
      reload();
      window.dispatchEvent(new Event('hub:work-updated'));
    } catch (cause) { toast(errorMessage(cause), 'error'); }
    finally { setBusyAwb(null); }
  };
  return <div className="page">
    <PageHeader eyebrow="Setelah gagal kirim" title="Terima paket kembali" action={<Button variant="secondary" icon="refresh" onClick={reload}>Perbarui</Button>} />
    <Notice>Sesudah dikonfirmasi kembali, buka <Link to="/hub-issues" className="font-bold underline">Kendala & antar ulang</Link> untuk menghubungi penerima dan menentukan jadwal berikutnya.</Notice>
    <div className="my-4"><HubAwbSearch value={search} onChange={setSearch} awbs={(runs || []).flatMap((run) => run.shipments || run.run_shipments || []).filter((item) => item.status === 'FAILED' && item.shipment?.status === 'DELIVERY_FAILED').map((item) => item.awb || item.shipment?.awb || '')} /></div>
    <Panel title={`Menunggu diterima kembali · ${failed.length}`}>
      {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : failed.length ? <div className="grid gap-3">{failed.map((item) => {
        const awb = item.awb || item.shipment?.awb || '';
        return <article key={item.id} className="flex flex-col gap-3 rounded-2xl border border-[#eee3e9] bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><strong className="font-mono text-sm">{awb}</strong><p className="mb-0 mt-1 text-xs text-[#806f7b]">Percobaan gagal · paket masih dibawa kurir</p></div><Button size="small" disabled={!awb} loading={busyAwb === awb} onClick={() => void confirmReturn(awb)}>Konfirmasi paket kembali</Button></article>;
      })}</div> : <Empty icon="check" title={search ? 'AWB tidak ditemukan' : 'Belum ada paket kembali'} detail="Paket baru muncul setelah kurir melaporkan gagal kirim." />}
    </Panel>
  </div>;
}

export function HubReports({ hubId, toast }: { hubId: number; toast: Toast }) {
  const [reportDate, setReportDate] = useState(todayJakarta);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { data, loading, error, reload } = useResource<DailyReport[]>(`/api/v1/hubs/${hubId}/reports/daily?date=${reportDate}`, (raw) => list<DailyReport>(raw));
  const report = data?.[0];
  const generate = async () => {
    setBusy(true);
    try {
      await post(`/api/v1/hubs/${hubId}/reports/daily/generate`, { report_date: reportDate });
      toast('Laporan hub diperbarui.');
      reload();
    } catch (cause) { toast(errorMessage(cause), 'error'); }
    finally { setBusy(false); }
  };
  const download = async () => {
    setDownloading(true);
    try { await downloadFile(`/api/v1/hubs/${hubId}/reports/daily.xlsx?date=${reportDate}`, `laporan-hub-${hubId}-${reportDate}.xlsx`); }
    catch (cause) { toast(errorMessage(cause), 'error'); }
    finally { setDownloading(false); }
  };
  return <div className="page">
    <PageHeader eyebrow="Laporan per hub" title="Laporan harian" action={<div className="inline-form"><input type="date" aria-label="Tanggal laporan" value={reportDate} onChange={(event) => setReportDate(event.target.value)}/><Button onClick={generate} loading={busy} icon="refresh">Perbarui</Button></div>}/>
    {loading ? <Loading/> : error ? <ErrorBox error={error} retry={reload}/> : <>
      {report ? <><div className="metric-grid metric-grid-three"><div className="metric metric-success"><div className="metric-icon"><Icon name="check"/></div><strong>{report.delivered ?? 0}</strong><span>Terkirim</span></div><div className="metric metric-danger"><div className="metric-icon"><Icon name="alert"/></div><strong>{report.failed_attempts ?? 0}</strong><span>Attempt gagal</span></div><div className="metric"><div className="metric-icon"><Icon name="refresh"/></div><strong>{report.redelivered ?? 0}</strong><span>Berhasil setelah retry</span></div></div>
        <Panel title={`${report.hub_name || `Hub #${hubId}`} · ${dateOnly(reportDate)}`} action={<Button size="small" variant="secondary" loading={downloading} onClick={download}>Unduh XLSX</Button>}><div className="stack-list"><div className="stack-item"><strong>Shipment baru tujuan hub</strong><span>{report.shipments_created ?? 0}</span></div><div className="stack-item"><strong>Permintaan retur</strong><span>{report.returned_requested ?? 0}</span></div></div><p className="helper">File Excel memuat tiga sheet: Ringkasan, Aktivitas, dan Percobaan. Simpan file Excel sebagai arsip operasional hub.</p></Panel></> : <Panel><Empty icon="file" title="Belum ada laporan pada tanggal ini" detail="Tekan Perbarui untuk menghitung data hub dan menyiapkan file Excel."/></Panel>}
    </>}
  </div>;
}
