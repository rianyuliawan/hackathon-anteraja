import { list } from '../lib/api';
import { Badge, dateTime, Empty, ErrorBox, Icon, Loading, Notice, PageHeader, Panel, useResource } from '../ui';

export function AccountPage({ name, email, phone, role, hubName }: { name: string; email: string; phone?: string | null; role: string; hubName?: string }) {
  const notifications = useResource<Array<{ id: number; message_text: string; status: string; delivery_mode: string; created_at: string }>>('/api/v1/me/notifications', (raw) => list(raw));

  return <div className="page">
    <PageHeader eyebrow="Profil" title="Akun & komunikasi"/>
    <div className="two-col">
      <Panel title="Akun aplikasi">
        <div className="profile-avatar"><Icon name="user" size={30}/></div>
        <div className="detail-row"><span>Nama</span><strong>{name}</strong></div>
        <div className="detail-row"><span>Email</span><strong>{email}</strong></div>
        <div className="detail-row"><span>Nomor telepon</span><strong>{phone || 'Belum tersedia'}</strong></div>
        <div className="detail-row"><span>Peran</span><strong>{role === 'BUYER' ? 'Pelanggan' : role.replaceAll('_', ' ')}</strong></div>
        {hubName ? <div className="detail-row"><span>Hub</span><strong>{hubName}</strong></div> : null}
      </Panel>
      <Panel title="Pemberitahuan Telegram">
        <Notice>Pesan akan terkirim jika akun Telegram dapat ditemukan dari nomor ini dan layanan Telegram sedang aktif. Status pengiriman pesan dapat dilihat di bawah.</Notice>
      </Panel>
    </div>
    <Panel title="Notifikasi saya" className="notifications-panel">
      {notifications.loading ? <Loading/> : notifications.error ? <ErrorBox error={notifications.error} retry={notifications.reload}/> : !notifications.data?.length ? <Empty icon="bell" title="Belum ada notifikasi"/> : <div className="stack-list">{notifications.data.map((item) => <div className="notification-item" key={item.id}><span className="small-icon"><Icon name="bell" size={17}/></span><div><p>{item.message_text}</p><small>{dateTime(item.created_at)} · {item.delivery_mode === 'MOCK' ? 'Simulasi' : 'Live'}</small></div><Badge status={item.status}/></div>)}</div>}
    </Panel>
  </div>;
}
