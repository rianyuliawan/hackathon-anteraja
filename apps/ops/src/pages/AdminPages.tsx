import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { list, newActionKey, post, unwrap } from '../lib/api';
import type { DashboardData, Order } from '../lib/types';
import { Badge, Button, dateTime, Empty, ErrorBox, errorMessage, Field, Icon, Loading, Modal, money, Notice, PageHeader, Panel, useResource } from '../ui';

type Toast = (message: string, tone?: 'success' | 'error') => void;

function Metric({ label, value, icon, tone }: { label: string; value?: number; icon: string; tone?: string }) {
  return <div className={`metric metric-${tone || 'normal'}`}><div className="metric-icon"><Icon name={icon}/></div><strong>{value ?? '—'}</strong><span>{label}</span></div>;
}

export function AdminOverview() {
  const { data, loading, error, reload } = useResource<DashboardData>('/api/v1/admin/dashboard', (raw) => unwrap<DashboardData>(raw));
  const { data: pendingOrders, loading: pendingLoading, error: pendingError, reload: reloadPending } = useResource<Order[]>('/api/v1/admin/orders?status=PENDING_APPROVAL', (raw) => list<Order>(raw));
  const { data: approvedOrders, loading: approvedLoading, error: approvedError, reload: reloadApproved } = useResource<Order[]>('/api/v1/admin/orders?status=APPROVED', (raw) => list<Order>(raw));
  const refresh = () => { reload(); reloadPending(); reloadApproved(); };

  return <div className="page">
    <PageHeader eyebrow="Pusat persetujuan" title="Ringkasan pesanan" subtitle="Tinjau pesanan masuk dan pantau resi yang telah diterbitkan." action={<Button variant="secondary" icon="refresh" onClick={refresh}>Perbarui</Button>}/>
    {loading ? <Loading/> : error ? <ErrorBox error={error} retry={reload}/> : <>
      <div className="metric-grid"><Metric label="Menunggu persetujuan" value={data?.pending_orders} icon="clock" tone="warning"/><Metric label="Disetujui hari ini" value={data?.approved_today} icon="check" tone="success"/><Metric label="Total resi terbit" value={data?.awb_issued_total} icon="file"/></div>
      <div className="two-col">
        <Panel title="Menunggu persetujuan">
          {pendingLoading ? <Loading/> : pendingError ? <ErrorBox error={pendingError} retry={reloadPending}/> : !pendingOrders?.length ? <Empty icon="check" title="Semua pesanan sudah ditinjau"/> : <div className="ops-pending-list">{pendingOrders.slice(0, 5).map((order) => <div key={order.id}><span className="ops-attention-icon"><Icon name="file"/></span><span><strong>{order.order_no}</strong><small>{order.recipient_name} · {order.destination_postcode || 'Kode pos belum ada'}</small></span><Link to="/admin-orders">Tinjau</Link></div>)}<Link className="ops-pending-all" to="/admin-orders">Lihat semua {data?.pending_orders ?? pendingOrders.length} pesanan <Icon name="chevron" size={15}/></Link></div>}
        </Panel>
        <Panel title="Resi terbaru">
          {approvedLoading ? <Loading/> : approvedError ? <ErrorBox error={approvedError} retry={reloadApproved}/> : !approvedOrders?.length ? <Empty icon="file" title="Belum ada resi terbit"/> : <div className="ops-pending-list">{approvedOrders.slice(0, 5).map((order) => <div key={order.id}><span className="ops-attention-icon"><Icon name="check"/></span><span><strong className="mono">{order.awb || order.shipment?.awb || 'Resi belum tersedia'}</strong><small>{order.order_no} · {order.recipient_name}</small></span></div>)}<Link className="ops-pending-all" to="/admin-orders">Lihat semua resi <Icon name="chevron" size={15}/></Link></div>}
        </Panel>
      </div>
    </>}
  </div>;
}

function ApproveOrder({ order, onClose, onDone, toast }: { order: Order; onClose: () => void; onDone: () => void; toast: Toast }) {
  const [weight, setWeight] = useState(String(order.estimated_weight_grams || order.weight_grams || 500));
  const [length, setLength] = useState(String(order.estimated_length_mm || order.length_mm || 300));
  const [width, setWidth] = useState(String(order.estimated_width_mm || order.width_mm || 200));
  const [height, setHeight] = useState(String(order.estimated_height_mm || order.height_mm || 40));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [actionKey] = useState(newActionKey);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!order.destination_hub) { setError('Alamat belum masuk cakupan hub aktif. Periksa kode pos tujuan.'); return; }
    setBusy(true); setError('');
    try {
      const raw = await post<unknown>(`/api/v1/admin/orders/${order.id}/approve`, { weight_grams: Number(weight), length_mm: Number(length), width_mm: Number(width), height_mm: Number(height) }, actionKey);
      const result = unwrap<{ awb?: string; shipment?: { awb: string } }>(raw);
      toast(`Pesanan disetujui. Resi ${result.awb || result.shipment?.awb || 'telah terbit'}.`);
      onDone(); window.dispatchEvent(new Event('ops:orders-updated')); onClose();
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return <Modal title={`Setujui pesanan ${order.order_no}`} onClose={onClose}><form onSubmit={submit} className="form-stack"><div className="review-card"><strong>{order.recipient_name}</strong><span>{order.destination_address_snapshot}</span><small>Kode pos {order.destination_postcode}</small></div><p className="helper">Pastikan berat dan ukuran paket sebelum resi diterbitkan. Hub dari alamat penerima ditentukan otomatis dan operator hub tersebut mengatur penjemputan hingga pengantaran.</p><div className="form-grid">{order.destination_hub ? <Notice tone="success">Hub penanganan otomatis: <strong>{order.destination_hub.name}</strong> · zona {order.destination_hub.zone_name}.</Notice> : <Notice tone="error">Alamat belum masuk cakupan hub aktif. Periksa kode pos sebelum disetujui.</Notice>}<Field label="Berat (gram)" required><input type="number" min="1" required value={weight} onChange={(event) => setWeight(event.target.value)}/></Field><Field label="Panjang (mm)" required><input type="number" min="1" required value={length} onChange={(event) => setLength(event.target.value)}/></Field><Field label="Lebar (mm)" required><input type="number" min="1" required value={width} onChange={(event) => setWidth(event.target.value)}/></Field><Field label="Tinggi (mm)" required><input type="number" min="1" required value={height} onChange={(event) => setHeight(event.target.value)}/></Field></div>{error ? <Notice tone="error">{error}</Notice> : null}<div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Batal</Button><Button type="submit" disabled={!order.destination_hub} loading={busy} icon="check">Setujui & terbitkan resi</Button></div></form></Modal>;
}

export function AdminOrders({ toast }: { toast: Toast }) {
  const [filter, setFilter] = useState<'PENDING_APPROVAL' | 'APPROVED'>('PENDING_APPROVAL');
  const { data: orders, loading, error, reload } = useResource<Order[]>(`/api/v1/admin/orders?status=${filter}`, (raw) => list<Order>(raw));
  const [approve, setApprove] = useState<Order | null>(null);
  return <div className="page"><PageHeader eyebrow="Pesanan katalog" title="Pesanan & resi" subtitle="Periksa data pesanan sebelum menerbitkan resi." action={<Button variant="secondary" icon="refresh" onClick={reload}>Perbarui</Button>}/><div className="tabs" role="tablist" aria-label="Filter pesanan">{([['PENDING_APPROVAL', 'Menunggu persetujuan'], ['APPROVED', 'Resi terbit']] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div><Panel>{loading ? <Loading/> : error ? <ErrorBox error={error} retry={reload}/> : !orders?.length ? <Empty icon="file" title="Belum ada pesanan" detail="Pesanan dari katalog akan muncul di sini."/> : <div className="table-wrap"><table><thead><tr><th>Pesanan</th><th>Penerima</th><th>Tujuan</th><th>Nilai barang</th><th>Hub tujuan</th><th>AWB</th><th>Tindakan</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.order_no}</strong><small>{dateTime(order.created_at)}</small></td><td><strong>{order.recipient_name}</strong><small>{order.recipient_phone}</small></td><td><span className="truncate-cell" title={order.destination_address_snapshot}>{order.destination_address_snapshot || '—'}</span><small>{order.destination_postcode}</small></td><td>{money(order.subtotal)}</td><td>{order.destination_hub ? <><strong>{order.destination_hub.name}</strong><small>{order.destination_hub.zone_name}</small></> : <small>Di luar cakupan</small>}</td><td>{order.awb || order.shipment?.awb ? <strong className="mono">{order.awb || order.shipment?.awb}</strong> : <Badge status={order.status}/>}</td><td>{order.status === 'PENDING_APPROVAL' ? <Button size="small" disabled={!order.destination_hub} title={!order.destination_hub ? 'Tujuan di luar cakupan hub aktif' : undefined} onClick={() => setApprove(order)}>Setujui</Button> : <small>Resi terbit</small>}</td></tr>)}</tbody></table></div>}</Panel>{approve ? <ApproveOrder order={approve} onClose={() => setApprove(null)} onDone={reload} toast={toast}/> : null}</div>;
}
