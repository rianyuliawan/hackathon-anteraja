import { Link, useNavigate } from 'react-router-dom';
import { useState, type FormEvent } from 'react';
import { downloadFile, list, post, unwrap } from '../lib/api';
import type { Courier, DailyReport, DeliveryRun, RoutePreview, Shipment, PickupTask } from '../lib/types';
import { Badge, Button, dateOnly, Empty, ErrorBox, errorMessage, Field, Icon, Loading, Modal, Notice, PageHeader, Panel, statusLabel, todayJakarta, useResource } from '../ui';
import { DeliveryRouteMap } from '../components/DeliveryRouteMap';
import { HubAwbSearch } from '../components/HubAwbSearch';
import useRefreshOnReturn from '../hooks/useRefreshOnReturn';

type Toast = (message: string, tone?: 'success' | 'error') => void;
export function HubOverview({ hubId, hubName }: { hubId: number; hubName?: string }) {
  const navigate = useNavigate();
  const [historyAwb, setHistoryAwb] = useState('');
  const [historyError, setHistoryError] = useState('');
  const pickups = useResource<PickupTask[]>(`/api/v1/hubs/${hubId}/pickup-tasks`, (raw) => list<PickupTask>(raw));
  const runs = useResource<DeliveryRun[]>(`/api/v1/hubs/${hubId}/delivery-runs`, (raw) => list<DeliveryRun>(raw));
  const attention = useResource<{
    pickup_needs_assignment: number;
    inbound_needs_scan: number;
    delivery_needs_assignment: number;
    handover_needs_confirmation: number;
    failed_needs_return: number;
    returned_needs_decision: number;
  }>(`/api/v1/hubs/${hubId}/attention-counts`, (raw) => unwrap(raw));
  const loading = attention.loading;
  const error = attention.error;
  const reload = () => { pickups.reload(); runs.reload(); attention.reload(); };
  useRefreshOnReturn(reload);

  const counts = attention.data;
  const actions = [
    { title: 'Putuskan tindak lanjut', detail: 'Paket gagal sudah kembali. Hubungi penerima, lalu jadwalkan ulang atau proses retur.', count: counts?.returned_needs_decision || 0, href: '/hub-issues', icon: 'alert', tone: 'amber' },
    { title: 'Terima paket gagal', detail: 'Cocokkan paket yang dikembalikan kurir sebelum mengambil keputusan.', count: counts?.failed_needs_return || 0, href: '/hub-issues', icon: 'package', tone: 'amber' },
    { title: 'Serahkan ke kurir', detail: 'Kurir sudah menerima tugas. Periksa paket fisik dan konfirmasi serah terima.', count: counts?.handover_needs_confirmation || 0, href: '/hub-dispatch', icon: 'check', tone: 'pink' },
    { title: 'Konfirmasi paket tiba', detail: 'Penjemputan selesai. Cocokkan paket fisik yang masuk ke hub.', count: counts?.inbound_needs_scan || 0, href: '/hub-inbound', icon: 'package', tone: 'pink' },
    { title: 'Susun tugas antar', detail: 'Paket siap dikelompokkan menurut zona, usia, dan urutan rute.', count: counts?.delivery_needs_assignment || 0, href: '/hub-dispatch', icon: 'truck', tone: 'pink' },
    { title: 'Tugaskan penjemputan', detail: 'Resi baru dari admin operasional menunggu kurir penjemputan.', count: counts?.pickup_needs_assignment || 0, href: '/hub-pickups', icon: 'package', tone: 'pink' },
  ];
  const pendingCount = actions.reduce((total, item) => total + item.count, 0);
  const activeActions = actions.filter((item) => item.count > 0);
  const pickupInProgress = pickups.data?.filter((task) => task.status === 'ASSIGNED').length || 0;
  const waitingCourier = runs.data?.filter((run) => run.status === 'PENDING_ACCEPT').length || 0;
  const inCourierHands = runs.data?.filter((run) => run.status === 'OUT_FOR_DELIVERY' || (run.status === 'ACCEPTED' && !(run.shipments || run.run_shipments || []).some((item) => item.status === 'ASSIGNED'))).length || 0;
  const journey = [
    { label: 'Jemput dari toko', count: counts?.pickup_needs_assignment || 0, description: `${pickupInProgress} penjemputan berjalan`, href: '/hub-pickups' },
    { label: 'Terima di hub', count: counts?.inbound_needs_scan || 0, description: 'Konfirmasi paket fisik', href: '/hub-inbound' },
    { label: 'Atur dan serahkan', count: (counts?.delivery_needs_assignment || 0) + (counts?.handover_needs_confirmation || 0), description: `${waitingCourier} tugas menunggu kurir`, href: '/hub-dispatch' },
    { label: 'Pantau kurir', count: inCourierHands, description: 'Siap jalan atau sedang diantar', href: '/hub-dispatch' },
  ];

  return <div className="page mx-auto max-w-6xl">
    <PageHeader eyebrow="Operasional hub" title={hubName || 'Pusat kerja hub'} subtitle="Pilih tindakan yang perlu diselesaikan. Setiap perubahan dari admin operasional dan kurir akan masuk ke antrean yang sesuai." action={<Button variant="secondary" icon="refresh" onClick={reload}>Perbarui</Button>} />
    {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : <>
      <section className="mb-5 rounded-[1.5rem] border border-[#f3d7e6] bg-[#fff4f9] p-5 sm:p-6" aria-labelledby="hub-priority-title">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="mb-1 text-xs font-bold uppercase tracking-wider text-[#a92b70]">Antrean kerja</p><h2 id="hub-priority-title" className="mb-0 text-xl font-extrabold text-[#40303b]">{pendingCount ? `${pendingCount} tindakan menunggu` : 'Semua tindakan sudah ditangani'}</h2></div><span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#ae3173]">{activeActions.length} jenis pekerjaan</span></div>
        <p className="mb-0 mt-2 text-sm text-[#7c6876]">Mulai dari paket gagal yang perlu keputusan, lalu lanjutkan serah terima, penerimaan, dan penugasan paket.</p>
      </section>
      {activeActions.length ? <section className="mb-6" aria-label="Tindakan yang perlu diselesaikan"><div className="grid gap-3 md:grid-cols-2">{activeActions.map((item) => <Link key={item.title} to={item.href} className="group flex items-start gap-4 rounded-2xl border border-[#eadfe7] bg-white p-4 shadow-sm transition hover:border-[#e3a9ca] hover:shadow-md sm:p-5"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${item.tone === 'amber' ? 'bg-[#fff1de] text-[#a85b23]' : 'bg-[#fff0f7] text-[#c92378]'}`}><Icon name={item.icon} size={20}/></span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="text-sm text-[#443541]">{item.title}</strong><span className="rounded-full bg-[#fff0f7] px-2.5 py-1 text-xs font-extrabold text-[#b52170]">{item.count}</span></span><small className="mt-1 block text-xs leading-5 text-[#806f7c]">{item.detail}</small></span><Icon name="chevron" size={16}/></Link>)}</div></section> : <Notice>Belum ada pekerjaan yang memerlukan konfirmasi. Anda dapat memantau tugas berjalan atau mencari riwayat resi di bawah.</Notice>}
      <section className="mb-5" aria-labelledby="hub-flow-title"><div className="mb-3 flex flex-wrap items-end justify-between gap-2"><h2 id="hub-flow-title" className="m-0 text-base font-extrabold text-[#40303b]">Alur paket di hub</h2><Link to="/hub-issues" className="text-xs font-bold text-[#af2b70] hover:underline">Lihat kendala & antar ulang</Link></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{journey.map((step, index) => <Link key={step.label} to={step.href} className="rounded-2xl border border-[#ece3e9] bg-white p-4 transition hover:border-[#e3a9ca]"><span className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#fff0f7] text-xs font-extrabold text-[#bb2475]">{index + 1}</span><strong className="block text-sm text-[#453542]">{step.label}</strong><small className="mt-1 block text-xs text-[#82717e]">{step.description}</small><span className="mt-3 inline-flex text-xs font-bold text-[#ac2a6f]">{step.count} {index === 3 ? 'tugas di tangan kurir' : 'perlu tindakan'} <Icon name="chevron" size={15}/></span></Link>)}</div></section>
      <form className="rounded-2xl border border-[#eee1e8] bg-white p-4 sm:p-5" onSubmit={(event) => {
        event.preventDefault();
        const awb = historyAwb.trim();
        if (!/^\d{14}$/.test(awb)) { setHistoryError('Masukkan 14 digit nomor resi.'); return; }
        setHistoryError('');
        navigate(`/hub-shipments/${awb}`);
      }}>
        <label className="mb-2 block text-sm font-bold text-[#443440]" htmlFor="hub-history-awb">Cari riwayat paket</label>
        <div className="flex flex-col gap-2 sm:flex-row"><input id="hub-history-awb" inputMode="numeric" pattern="[0-9]{14}" maxLength={14} value={historyAwb} onChange={(event) => { setHistoryAwb(event.target.value.replace(/\D/g, '').slice(0, 14)); setHistoryError(''); }} placeholder="Masukkan 14 digit nomor resi" className="min-w-0 flex-1" /><Button type="submit" icon="search">Lihat riwayat</Button></div>
        {historyError ? <p role="alert" className="mb-0 mt-2 text-xs font-semibold text-[#b73a5b]">{historyError}</p> : null}
      </form>
    </>}
  </div>;
}

export function HubInbound({ hubId, toast }: { hubId: number; toast: Toast }) {
  const { data, loading, error, reload } = useResource<Shipment[]>(`/api/v1/hubs/${hubId}/inbound`, (raw) => list<Shipment>(raw));
  const [search, setSearch] = useState('');
  const [busyAwb, setBusyAwb] = useState<string | null>(null);
  const matching = (data || []).filter((shipment) => shipment.awb.includes(search.trim()));
  const onWay = matching.filter((shipment) => ['PICKED_UP', 'IN_TRANSIT'].includes(shipment.status));
  const stillAtSeller = (data || []).filter((shipment) => !['PICKED_UP', 'IN_TRANSIT'].includes(shipment.status)).length;
  const refreshWork = () => { reload(); window.dispatchEvent(new Event('hub:work-updated')); };
  useRefreshOnReturn(refreshWork);
  const confirmArrival = async (awb: string) => {
    setBusyAwb(awb);
    try {
      await post(`/api/v1/hubs/${hubId}/scan-in`, { awb });
      toast(`${awb} sudah diterima di hub. Paket kini siap ditugaskan antar.`);
      refreshWork();
    } catch (cause) { toast(errorMessage(cause), 'error'); }
    finally { setBusyAwb(null); }
  };
  const packageRow = (shipment: Shipment) => <article key={shipment.id} className="flex flex-col gap-3 rounded-2xl border border-[#eee5eb] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0"><div className="mb-1 flex flex-wrap items-center gap-2"><strong className="font-mono text-sm text-[#3e3039]">{shipment.awb}</strong><Badge status={shipment.status} /></div><p className="m-0 text-sm font-semibold text-[#554550]">{shipment.order?.recipient_name || shipment.recipient_name || 'Penerima'}</p><p className="mb-0 mt-1 break-words text-xs text-[#817581]">Dari {shipment.order?.origin_address_snapshot || 'alamat toko pada pesanan'}</p></div>
    <div className="flex flex-wrap items-center gap-2 sm:shrink-0"><Link to={`/hub-shipments/${shipment.awb}`} className="text-link text-sm">Lihat riwayat</Link><Button size="small" loading={busyAwb === shipment.awb} onClick={() => void confirmArrival(shipment.awb)}>Konfirmasi sudah tiba</Button></div>
  </article>;
  return <div className="page">
    <PageHeader eyebrow="Tahap 2 · Penerimaan" title="Paket tiba di hub" subtitle="Setelah kurir menyelesaikan penjemputan, paket muncul di antrean. Cocokkan paket fisik lalu klik konfirmasi." action={<Button variant="secondary" icon="refresh" onClick={refreshWork}>Perbarui</Button>} />
    <Notice>Kurir mengambil foto paket saat penjemputan. Cocokkan paket fisik yang sudah dibawa ke hub sebelum mengonfirmasi kedatangannya. Setelah itu paket masuk ke <Link to="/hub-dispatch" className="font-bold underline">Atur pengantaran</Link>.</Notice>
    <div className="my-4"><HubAwbSearch value={search} onChange={setSearch} awbs={(data || []).filter((shipment) => ['PICKED_UP', 'IN_TRANSIT'].includes(shipment.status)).map((shipment) => shipment.awb)} /></div>
    {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : <div className="grid gap-5">
      <Panel title={`Perlu dikonfirmasi tiba · ${onWay.length}`}>{onWay.length ? <div className="grid gap-3">{onWay.map(packageRow)}</div> : <Empty icon="check" title={search ? 'AWB tidak ada di antrean kedatangan' : 'Belum ada paket tiba'} detail="Paket masuk setelah kurir menyelesaikan penjemputan." />}</Panel>
      {stillAtSeller ? <Link to="/hub-pickups" className="flex items-center justify-between gap-3 rounded-2xl border border-[#eee3e9] bg-white p-4 text-sm text-[#6d5967] hover:border-[#dba5c1]"><span><strong className="block text-[#473442]">{stillAtSeller} paket masih dalam proses penjemputan</strong><small>Lihat penugasan kurir dan status pengambilan paket.</small></span><Icon name="chevron" size={17}/></Link> : null}
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
  const availableCouriers = zoneCouriers.filter((courier) => courier.available !== false && !conflictFor(courier) && !courier.unreturned_failed_count);
  const unavailableCouriers = zoneCouriers.filter((courier) => !availableCouriers.includes(courier));
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
    if (!preview) { setError('Lihat dan konfirmasi urutan paket sebelum menugaskan kurir.'); return; }
    if (chosenCourier?.max_parcels && selected.length > chosenCourier.max_parcels) { setError('Jumlah paket melebihi kapasitas kurir.'); return; }
    setBusy(true); setError('');
    try {
      await post(`/api/v1/hubs/${hubId}/delivery-runs`, { zone_id: Number(zoneId), courier_user_id: Number(courierId), shipment_ids: selected, stop_order: preview.shipment_ids, service_date: date });
      toast(`Tugas antar ${selected.length} paket dibuat. Kurir perlu menerima tugas sebelum serah terima.`);
      onDone(); onClose();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };

  return <Modal title="Buat tugas pengantaran" onClose={onClose} wide>
    <form className="form-stack" onSubmit={submit}>
      <div className="rounded-2xl border border-[#f5d6e7] bg-gradient-to-r from-[#fff2f9] to-[#fffaf2] p-4 sm:p-5">
        <span className="eyebrow">ATUR PENGANTARAN</span>
        <p className="mb-0 mt-2 text-sm leading-6 text-[#655260]">Tentukan tanggal dan zona, pilih paket, lalu tetapkan kurir. Urutan tujuan akan ditinjau di peta sebelum tugas dikirim.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tanggal pengantaran" required><input type="date" required min={todayJakarta()} value={date} onChange={(event) => changeDate(event.target.value)}/></Field>
        <Field label="Zona pengantaran" required><select required value={zoneId} onChange={(event) => changeZone(event.target.value)}>{zones.map(([id, zone]) => <option key={id} value={id}>{zone?.name || `Zona #${id}`}</option>)}</select></Field>
      </div>
      <div className="field">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="field-label">Paket siap antar <span className="required">*</span></span><span className="rounded-full bg-[#fff0f7] px-2.5 py-1 text-xs font-semibold text-[#be2374]">{selected.length} dipilih dari {zoned.length}</span></div>
        <p className="mb-2 mt-0 text-xs text-[#806f7a]">Paket yang paling lama menunggu tampil lebih dulu. Riwayat percobaan terlihat pada setiap paket.</p>
        <div className="selection-list">{zoned.length ? zoned.map((shipment) => <label key={shipment.id} className="select-row"><input type="checkbox" checked={selected.includes(shipment.id)} onChange={() => toggle(shipment.id)}/><span><strong>{shipment.awb}</strong><small>{shipment.order?.recipient_name || shipment.recipient_name} · {shipment.order?.destination_address_snapshot || shipment.destination_address_snapshot}</small><small className={shipment.waiting_hours !== undefined && shipment.waiting_hours >= 24 ? 'text-amber-700' : ''}>Menunggu di hub {shipment.waiting_hours ?? '—'} jam · penanganan total {shipment.age_hours ?? '—'} jam · {shipment.attempt_count || 0} percobaan sebelumnya</small><small>{shipment.status === 'WAITING_REDELIVERY' ? 'Antar ulang' : 'Pengantaran pertama'} · {statusLabel(shipment.status)}</small></span></label>) : <Empty icon="package" title="Tidak ada paket di zona ini"/>}</div>
      </div>
      <div className="field">
        <div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor="run-courier" className="field-label">Kurir pengantaran <span className="required">*</span></label><span className="text-xs font-semibold text-[#28805b]">{availableCouriers.length} tersedia</span></div>
        <select id="run-courier" required value={courierId} onChange={(event) => setCourierId(event.target.value)} disabled={!availableCouriers.length}>
          <option value="">{availableCouriers.length ? 'Pilih kurir untuk zona ini' : 'Belum ada kurir tersedia'}</option>
          {availableCouriers.map((courier) => <option key={courier.user_id || courier.id} value={courier.user_id || courier.id}>{courier.name || courier.email || `Kurir #${courier.user_id || courier.id}`} · maks. {courier.max_parcels || '—'} paket</option>)}
        </select>
        {chosenCourier ? <div className="flex items-center gap-3 rounded-xl border border-[#d8eee2] bg-[#f3fbf6] px-3 py-2.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#278058]"><Icon name="truck" size={18}/></span><span className="min-w-0"><strong className="block truncate text-sm text-[#285d44]">{chosenCourier.name || chosenCourier.email}</strong><small className="block text-xs text-[#5d806c]">{selected.length} dari maks. {chosenCourier.max_parcels || '—'} paket · tersedia {date}</small></span></div> : null}
        {unavailableCouriers.length ? <details className="rounded-xl border border-[#eee3e9] bg-[#fcfafb] px-3 py-2.5 text-xs text-[#756673]"><summary className="cursor-pointer font-semibold">{unavailableCouriers.length} kurir belum bisa ditugaskan</summary><ul className="mb-0 mt-2 space-y-1.5 pl-4">{unavailableCouriers.map((courier) => { const conflict = conflictFor(courier); return <li key={courier.user_id || courier.id}>{courier.name || courier.email || `Kurir #${courier.user_id || courier.id}`} · {courier.available === false ? 'tidak aktif' : courier.unreturned_failed_count ? `${courier.unreturned_failed_count} paket gagal belum kembali ke hub` : conflict?.status === 'OUT_FOR_DELIVERY' ? 'sedang mengantar' : 'sudah memiliki tugas pada tanggal ini'}</li>; })}</ul></details> : null}
        {!zoneCouriers.length ? <Notice tone="error">Belum ada kurir untuk zona ini.</Notice> : null}
        {zoneCouriers.length && !availableCouriers.length ? <Notice tone="error">Belum ada kurir yang dapat ditugaskan. Lihat alasan pada daftar di atas; kurir yang membawa paket gagal tersedia lagi setelah paket diterima hub.</Notice> : null}
      </div>
      <Button type="button" variant="secondary" onClick={calculate} loading={previewBusy} disabled={!selected.length}>Lihat urutan & peta</Button>
      {preview ? <section className="route-preview" aria-label="Pratinjau urutan pengantaran"><div className="route-preview-head"><div><span className="eyebrow">SARAN PENGANTARAN</span><h3>{preview.stops.length} tujuan · rute melalui jalan</h3></div><small>{preview.strategy === 'distance_age_priority' ? 'Jarak + prioritas umur paket' : 'Prioritas umur + kode pos'}</small></div><DeliveryRouteMap hub={preview.hub} stops={preview.stops.map((stop) => ({ order: stop.stop_order, label: stop.awb, latitude: stop.latitude, longitude: stop.longitude, priority: stop.priority }))} onDuration={setRoadMinutes}/><ol className="route-preview-list">{preview.stops.map((stop) => <li key={stop.shipment_id}><b>{stop.stop_order}</b><span><strong>{stop.awb}</strong><small>{stop.recipient_name} · {stop.postcode}</small><small>Dalam sistem {stop.age_hours} jam · di antrean {stop.waiting_hours} jam · {stop.attempt_count} percobaan sebelumnya</small></span><em className={`route-priority ${stop.priority.toLowerCase()}`}>{stop.priority === 'URGENT' ? 'Prioritas tinggi' : stop.priority === 'WATCH' ? 'Perlu dipantau' : 'Normal'}</em></li>)}</ol>{estimatedMinutes !== null ? <p className="mt-3 rounded-xl bg-[#eaf8ef] p-3 text-sm text-[#23724b]">Perkiraan {estimatedMinutes} menit untuk perjalanan dan 8 menit per tujuan. Belum termasuk kemacetan langsung.</p> : null}<p className="helper">Indikator usia paket membantu menentukan prioritas. Rute dapat disesuaikan dengan kondisi jalan.</p></section> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Batal</Button><Button type="submit" loading={busy} disabled={!chosenCourier || !selected.length || !preview}>Tugaskan {selected.length} paket</Button></div>
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

type DispatchStage = 'action' | 'waiting' | 'active' | 'history';

export function HubDispatch({ hubId, toast }: { hubId: number; toast: Toast }) {
  const ready = useResource<Shipment[]>(`/api/v1/hubs/${hubId}/ready`, (raw) => list<Shipment>(raw));
  const runs = useResource<DeliveryRun[]>(`/api/v1/hubs/${hubId}/delivery-runs`, (raw) => list<DeliveryRun>(raw));
  const couriers = useResource<Courier[]>(`/api/v1/hubs/${hubId}/couriers`, (raw) => list<Courier>(raw));
  const [create, setCreate] = useState(false);
  const [handover, setHandover] = useState<DeliveryRun | null>(null);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<DispatchStage>('action');
  const reload = () => { ready.reload(); runs.reload(); couriers.reload(); window.dispatchEvent(new Event('hub:work-updated')); };
  useRefreshOnReturn(reload);

  const runShipments = (run: DeliveryRun) => run.shipments || run.run_shipments || [];
  const needsHandover = (run: DeliveryRun) => run.status === 'ACCEPTED' && runShipments(run).some((item) => item.status === 'ASSIGNED');
  const pendingRuns = (runs.data || []).filter((run) => run.status === 'PENDING_ACCEPT');
  const handoverRuns = (runs.data || []).filter(needsHandover);
  const activeRuns = (runs.data || []).filter((run) => run.status === 'OUT_FOR_DELIVERY' || (run.status === 'ACCEPTED' && !needsHandover(run)));
  const historyRuns = (runs.data || []).filter((run) => !['PENDING_ACCEPT', 'ACCEPTED', 'OUT_FOR_DELIVERY'].includes(run.status));
  const rejectedReasons = new Map<number, string>();
  for (const run of [...(runs.data || [])].reverse()) {
    for (const item of runShipments(run)) {
      if (item.status === 'CANCELLED') rejectedReasons.set(item.shipment_id, item.rejection_reason || 'Perlu penugasan ulang');
    }
  }
  const matchesRun = (run: DeliveryRun) => runShipments(run).some((item) => (item.awb || item.shipment?.awb || '').includes(search.trim()));
  const matchingReady = (ready.data || []).filter((shipment) => shipment.awb.includes(search.trim()))
    .sort((left, right) => Number(right.status === 'WAITING_REDELIVERY') - Number(left.status === 'WAITING_REDELIVERY')
      || (right.waiting_hours || 0) - (left.waiting_hours || 0));
  const matchingHandover = handoverRuns.filter(matchesRun);
  const matchingPending = pendingRuns.filter(matchesRun);
  const matchingActive = activeRuns.filter(matchesRun);
  const matchingHistory = historyRuns.filter(matchesRun);
  const searching = search.trim().length > 0;
  const tabs: Array<{ id: DispatchStage; label: string; count: number }> = [
    { id: 'action', label: 'Perlu tindakan', count: (ready.data?.length || 0) + handoverRuns.length },
    { id: 'waiting', label: 'Menunggu kurir', count: pendingRuns.length },
    { id: 'active', label: 'Diserahkan / di jalan', count: activeRuns.length },
    { id: 'history', label: 'Riwayat tugas', count: historyRuns.length },
  ];
  const visible = (part: DispatchStage) => searching || stage === part;
  const runCard = (run: DeliveryRun) => {
    const items = runShipments(run);
    const accepted = items.filter((item) => item.status === 'ASSIGNED');
    const rejected = items.filter((item) => item.status === 'CANCELLED');
    return <article key={run.id} className="rounded-2xl border border-[#eee2e9] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-sm text-[#443440]">Tugas #{run.id}</strong><p className="mb-0 mt-1 text-xs text-[#81717c]">{run.zone?.name || `Zona #${run.zone_id}`} · {dateOnly(run.service_date)}</p></div><Badge status={run.status}/></div>
      <p className="mb-1 mt-3 text-sm font-semibold text-[#5a4654]">{run.courier?.name || `Kurir #${run.courier_user_id}`}</p>
      <p className="mb-0 text-xs leading-5 text-[#81717c]">{items.length} paket{rejected.length ? ` · ${rejected.length} ditolak kurir dan kembali ke antrean` : ''}</p>
      <details className="mt-3 rounded-xl border border-[#f0e7ec] bg-[#fffafc] px-3 py-2"><summary className="cursor-pointer text-xs font-bold text-[#a92c70]">Lihat daftar paket dan urutan stop</summary><ol className="m-0 mt-3 grid list-none gap-2 p-0">{items.map((item) => { const awb = item.awb || item.shipment?.awb; return <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 border-t border-[#f1e9ee] pt-2 text-xs"><span><strong className="block font-mono text-[#473943]">Stop {item.stop_order} · {awb || `Paket #${item.shipment_id}`}</strong><small className="text-[#81717c]">{item.status === 'CANCELLED' ? 'Ditolak kurir' : item.status === 'ASSIGNED' && run.status === 'ACCEPTED' ? 'Diterima, menunggu serah terima' : statusLabel(item.status)}{item.rejection_reason ? ` · ${item.rejection_reason}` : ''}</small></span>{awb ? <Link to={`/hub-shipments/${awb}`} className="font-bold text-[#ad2b70] hover:underline">Riwayat</Link> : null}</li>; })}</ol></details>
      {run.status === 'PENDING_ACCEPT' ? <p className="mb-0 mt-3 text-xs text-[#8a6878]">Kurir perlu menerima atau menolak setiap paket. Paket yang ditolak kembali ke antrean siap antar.</p> : null}
      {run.status === 'ACCEPTED' && !accepted.length ? <p className="mb-0 mt-3 text-xs text-[#8a6878]">Paket sudah diserahkan. Kurir dapat memulai pengantaran.</p> : null}
      {needsHandover(run) ? <div className="mt-4"><Button size="small" onClick={() => setHandover(run)} icon="check">Konfirmasi serah terima {accepted.length} paket</Button></div> : null}
    </article>;
  };

  return <div className="page mx-auto max-w-6xl">
    <PageHeader eyebrow="Operasional hub · Pengantaran" title="Atur pengantaran" subtitle="Paket siap antar disusun menjadi tugas kurir. Setelah kurir menerima, konfirmasi serah terima dan pantau hasilnya." action={<Button variant="secondary" icon="refresh" onClick={reload}>Perbarui</Button>} />
    <div className="mb-5 rounded-2xl border border-[#f1d9e6] bg-[#fff5f9] p-4 text-sm text-[#6f5364] sm:p-5"><strong className="text-[#473240]">Alur kerja:</strong> pilih paket dan kurir → kurir menerima atau menolak → konfirmasi serah terima → kurir mengantar. Paket gagal ditindaklanjuti di <Link to="/hub-issues" className="font-bold text-[#b52473] underline">Kendala & antar ulang</Link>.</div>
    <div className="mb-4"><HubAwbSearch value={search} onChange={setSearch} awbs={[...(ready.data || []).map((shipment) => shipment.awb), ...(runs.data || []).flatMap((run) => runShipments(run).map((item) => item.awb || item.shipment?.awb || ''))]} /></div>
    {!searching ? <div className="mb-5 flex gap-2 overflow-x-auto pb-1" aria-label="Tahap tugas pengantaran">{tabs.map((tab) => <button key={tab.id} type="button" aria-pressed={stage === tab.id} onClick={() => setStage(tab.id)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d8197b] ${stage === tab.id ? 'border-[#de9bc0] bg-[#fff0f7] text-[#9e1f61]' : 'border-[#e9e1e7] bg-white text-[#766977] hover:border-[#d7b8c9]'}`}>{tab.label}<span className={`rounded-full px-2 py-0.5 ${stage === tab.id ? 'bg-white' : 'bg-[#f4eef2]'}`}>{tab.count}</span></button>)}</div> : <p className="mb-4 text-sm text-[#7f6e7b]">Hasil pencarian ditampilkan dari semua tahap tugas.</p>}
    {visible('action') ? <section className="grid gap-5" aria-label="Perlu tindakan">
      {matchingHandover.length || runs.loading || runs.error ? <Panel title={`Siap diserahkan ke kurir · ${matchingHandover.length}`}>{runs.loading ? <Loading/> : runs.error ? <ErrorBox error={runs.error} retry={runs.reload}/> : <div className="grid gap-3">{matchingHandover.map(runCard)}</div>}</Panel> : null}
      <Panel title={`Paket siap ditugaskan · ${matchingReady.length}`} action={ready.data?.length ? <Button size="small" onClick={() => setCreate(true)} icon="truck">Buat tugas antar</Button> : undefined}>{ready.loading ? <Loading/> : ready.error ? <ErrorBox error={ready.error} retry={ready.reload}/> : matchingReady.length ? <div className="grid gap-3">{matchingReady.map((shipment) => <Link key={shipment.id} to={`/hub-shipments/${shipment.awb}`} aria-label={`Lihat riwayat paket ${shipment.awb}`} className="group rounded-2xl border border-[#eee5eb] bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[#e59dbf] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e91681] motion-reduce:transform-none"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="font-mono text-sm text-[#443541]">{shipment.awb}</strong><Badge status={shipment.status}/></div><p className="mb-0 mt-2 text-sm font-semibold text-[#604d5b]">{shipment.order?.recipient_name || shipment.recipient_name || 'Penerima'} · {shipment.delivery_zone?.name || `Zona #${shipment.delivery_zone_id}`}</p><p className="mb-0 mt-1 text-xs text-[#81717c]">Menunggu {shipment.waiting_hours ?? '—'} jam di hub · {shipment.attempt_count || 0} percobaan sebelumnya</p>{rejectedReasons.has(shipment.id) ? <p className="mb-0 mt-1 text-xs font-semibold text-[#a85c2b]">Sebelumnya ditolak kurir: {rejectedReasons.get(shipment.id)}</p> : null}<span className="mt-2 inline-flex text-xs font-bold text-[#ad2b70] group-hover:underline">Lihat riwayat dan catatan paket</span></Link>)}</div> : <Empty icon="package" title={searching ? 'Tidak ditemukan di antrean siap antar' : 'Belum ada paket siap antar'} detail="Paket masuk setelah kedatangan di hub dikonfirmasi atau jadwal antar ulang dibuat."/>}</Panel>
    </section> : null}
    {visible('waiting') ? <Panel title={`Menunggu jawaban kurir · ${matchingPending.length}`}>{runs.loading ? <Loading/> : runs.error ? <ErrorBox error={runs.error} retry={runs.reload}/> : matchingPending.length ? <div className="grid gap-3">{matchingPending.map(runCard)}</div> : <Empty icon="truck" title={searching ? 'Tidak ditemukan di tahap ini' : 'Tidak ada tugas menunggu kurir'}/>}</Panel> : null}
    {visible('active') ? <Panel title={`Diserahkan atau di jalan · ${matchingActive.length}`}>{runs.loading ? <Loading/> : runs.error ? <ErrorBox error={runs.error} retry={runs.reload}/> : matchingActive.length ? <div className="grid gap-3">{matchingActive.map(runCard)}</div> : <Empty icon="truck" title={searching ? 'Tidak ditemukan di tahap ini' : 'Belum ada tugas berjalan'} detail="Tugas berpindah ke sini sesudah serah terima paket."/>}</Panel> : null}
    {visible('history') ? <Panel title={`Riwayat tugas · ${matchingHistory.length}`}>{runs.loading ? <Loading/> : runs.error ? <ErrorBox error={runs.error} retry={runs.reload}/> : matchingHistory.length ? <div className="grid gap-3">{matchingHistory.map(runCard)}</div> : <Empty icon="file" title={searching ? 'Tidak ditemukan di riwayat tugas' : 'Belum ada tugas selesai'}/>}</Panel> : null}
    {create ? <CreateRun hubId={hubId} shipments={ready.data || []} couriers={couriers.data || []} runs={runs.data || []} onClose={() => setCreate(false)} onDone={reload} toast={toast}/> : null}
    {handover ? <HandoverRun hubId={hubId} run={handover} onClose={() => setHandover(null)} onDone={reload} toast={toast}/> : null}
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
    <PageHeader eyebrow="Laporan per hub" title="Laporan harian" subtitle="Ringkasan, peristiwa paket, dan riwayat percobaan hub pada tanggal pilihan." action={<div className="inline-form"><input type="date" aria-label="Tanggal laporan" value={reportDate} onChange={(event) => setReportDate(event.target.value)}/><Button onClick={generate} loading={busy} icon="refresh">Perbarui</Button></div>}/>
    {loading ? <Loading/> : error ? <ErrorBox error={error} retry={reload}/> : <>
      {report ? <><div className="metric-grid metric-grid-three"><div className="metric metric-success"><div className="metric-icon"><Icon name="check"/></div><strong>{report.delivered ?? 0}</strong><span>Terkirim</span></div><div className="metric metric-danger"><div className="metric-icon"><Icon name="alert"/></div><strong>{report.failed_attempts ?? 0}</strong><span>Percobaan gagal</span></div><div className="metric"><div className="metric-icon"><Icon name="refresh"/></div><strong>{report.redelivered ?? 0}</strong><span>Berhasil setelah pengantaran ulang</span></div></div>
        <Panel title={`${report.hub_name || `Hub #${hubId}`} · ${dateOnly(reportDate)}`} action={<Button size="small" variant="secondary" loading={downloading} onClick={download}>Unduh XLSX</Button>}><div className="stack-list"><div className="stack-item"><strong>Paket baru tujuan hub</strong><span>{report.shipments_created ?? 0}</span></div><div className="stack-item"><strong>Permintaan retur</strong><span>{report.returned_requested ?? 0}</span></div></div><p className="helper">File Excel memuat tiga bagian: Ringkasan, Aktivitas, dan Percobaan. Simpan file Excel sebagai arsip operasional hub.</p></Panel></> : <Panel><Empty icon="file" title="Belum ada laporan pada tanggal ini" detail="Tekan Perbarui untuk menghitung data hub dan menyiapkan file Excel."/></Panel>}
    </>}
  </div>;
}
