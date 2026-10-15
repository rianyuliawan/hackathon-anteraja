import { list } from '../lib/api';
import { Badge, dateTime, Empty, ErrorBox, Icon, Loading, PageHeader, Panel, useResource } from '../ui';

export function AccountPage({ name, email, phone, role, hubName }: { name: string; email: string; phone?: string | null; role: string; hubName?: string }) {
  const notifications = useResource<Array<{ id: number; message_text: string; status: string; delivery_mode: string; created_at: string; sent_at?: string | null; last_error?: string | null }>>('/api/v1/me/notifications', (raw) => list(raw));

  return <div className="page">
    <PageHeader eyebrow="Profil" title="Akun"/>
    <Panel title="Informasi akun">
        <div className="profile-avatar"><Icon name="user" size={30}/></div>
        <div className="detail-row"><span>Nama</span><strong>{name}</strong></div>
        <div className="detail-row"><span>Email</span><strong>{email}</strong></div>
        <div className="detail-row"><span>Nomor telepon</span><strong>{phone || 'Belum tersedia'}</strong></div>
        <div className="detail-row"><span>Peran</span><strong>{({ BUYER: 'Pelanggan', COURIER: 'Kurir', HUB_OPERATOR: 'Operator hub', OPS_ADMIN: 'Admin operasional', SELLER: 'Penjual' } as Record<string, string>)[role] || role}</strong></div>
        {hubName ? <div className="detail-row"><span>Hub</span><strong>{hubName}</strong></div> : null}
    </Panel>
    <Panel title="Notifikasi saya" className="notifications-panel">
      {notifications.loading ? <Loading/> : notifications.error ? <ErrorBox error={notifications.error} retry={notifications.reload}/> : !notifications.data?.length ? <Empty icon="bell" title="Belum ada notifikasi"/> : <div className="stack-list">{notifications.data.map((item) => <div className="notification-item" key={item.id}><span className="small-icon"><Icon name="bell" size={17}/></span><div><p>{item.message_text}</p><small>{dateTime(item.created_at)} · {item.status === 'SENT' ? 'Terkirim melalui Telegram' : item.status === 'SIMULATED' ? 'Tercatat di aplikasi' : item.status === 'FAILED' ? 'Pengiriman Telegram gagal' : 'Menunggu pengiriman'}{item.last_error && item.status === 'FAILED' ? ` · ${item.last_error}` : ''}</small></div><Badge status={item.status}/></div>)}</div>}
    </Panel>
  </div>;
}
