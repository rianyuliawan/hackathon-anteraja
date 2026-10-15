import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import Brand from '../Brand';
import InstallApp from '../InstallApp';
import { Icon } from '../../ui';
import { get, list, unwrap } from '../../lib/api';
import { allowedHubId, type DashboardData, type DeliveryRun, type PickupAssignment, type Role, type User } from '../../lib/types';
import { menu } from '../../utils/navigation';

type HubAttentionCounts = { pickup_needs_assignment: number; inbound_needs_scan: number };

type Props = {
  user: User;
  role: Role;
  page: string;
  title?: string;
  children: ReactNode;
  onLogout: () => void;
  pwa: { canPrompt: boolean; installed: boolean; install: () => Promise<boolean> };
};

const roleLabels: Record<Role, string> = {
  OPS_ADMIN: 'Ops admin',
  HUB_OPERATOR: 'Operator hub',
  COURIER: 'Kurir',
  BUYER: 'Pelanggan',
  SELLER: 'Toko',
};

export default function PortalShell({ user, role, page, title, children, onLogout, pwa }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<number | null>(null);
  const [hubAttention, setHubAttention] = useState<HubAttentionCounts | null>(null);
  const [courierAttention, setCourierAttention] = useState<{ pickup: number; delivery: number } | null>(null);
  const hubId = allowedHubId(user);
  const links = menu[role].filter((item) => item.hash !== 'tracking' || role === 'BUYER');
  const roleLabel = roleLabels[role];

  useEffect(() => setMenuOpen(false), [page]);
  useEffect(() => {
    if (role !== 'OPS_ADMIN') return;
    let active = true;
    const refreshCount = () => {
      if (document.visibilityState === 'hidden') return;
      get<unknown>('/api/v1/admin/dashboard')
        .then((raw) => { if (active) setPendingOrders(Number(unwrap<DashboardData>(raw).pending_orders || 0)); })
        .catch(() => { if (active) setPendingOrders(null); });
    };
    refreshCount();
    const interval = window.setInterval(refreshCount, 30_000);
    window.addEventListener('ops:orders-updated', refreshCount);
    document.addEventListener('visibilitychange', refreshCount);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('ops:orders-updated', refreshCount); document.removeEventListener('visibilitychange', refreshCount); };
  }, [role]);

  useEffect(() => {
    if (role !== 'HUB_OPERATOR' || !hubId) {
      setHubAttention(null);
      return;
    }
    let active = true;
    const refreshCount = () => {
      if (document.visibilityState === 'hidden') return;
      get<unknown>(`/api/v1/hubs/${hubId}/attention-counts`)
        .then((raw) => { if (active) setHubAttention(unwrap<HubAttentionCounts>(raw)); })
        .catch(() => { if (active) setHubAttention(null); });
    };
    refreshCount();
    const interval = window.setInterval(refreshCount, 30_000);
    window.addEventListener('hub:work-updated', refreshCount);
    document.addEventListener('visibilitychange', refreshCount);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('hub:work-updated', refreshCount);
      document.removeEventListener('visibilitychange', refreshCount);
    };
  }, [role, hubId]);

  useEffect(() => {
    if (role !== 'COURIER') { setCourierAttention(null); return; }
    let active = true;
    const refreshCount = () => {
      if (document.visibilityState === 'hidden') return;
      Promise.all([
        get<unknown>('/api/v1/courier/pickup-assignments'),
        get<unknown>('/api/v1/courier/delivery-runs'),
      ]).then(([pickupRaw, runRaw]) => {
        if (!active) return;
        setCourierAttention({
          pickup: list<PickupAssignment>(pickupRaw).filter((item) => item.status === 'PENDING_ACCEPT').length,
          delivery: list<DeliveryRun>(runRaw).filter((item) => item.status === 'PENDING_ACCEPT').length,
        });
      }).catch(() => { if (active) setCourierAttention(null); });
    };
    refreshCount();
    const interval = window.setInterval(refreshCount, 30_000);
    window.addEventListener('courier:work-updated', refreshCount);
    document.addEventListener('visibilitychange', refreshCount);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('courier:work-updated', refreshCount); document.removeEventListener('visibilitychange', refreshCount); };
  }, [role]);

  const hubPending = role === 'HUB_OPERATOR' && hubAttention
    ? hubAttention.pickup_needs_assignment + hubAttention.inbound_needs_scan : 0;

  return (
    <div className="app-shell min-h-screen bg-[#f7f7f9]">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-brand border-b border-[#e9e9ef]">
          <Brand compact />
          <button className="icon-button mobile-only" onClick={() => setMenuOpen(false)} aria-label="Tutup menu"><Icon name="close" /></button>
        </div>
        <nav className="side-nav" aria-label="Menu utama">
          {links.map((item) => {
            const count = role === 'OPS_ADMIN' && item.hash === 'admin-orders' ? pendingOrders
              : role === 'HUB_OPERATOR' && item.hash === 'hub-pickups' ? hubAttention?.pickup_needs_assignment
              : role === 'HUB_OPERATOR' && item.hash === 'hub-inbound' ? hubAttention?.inbound_needs_scan
              : role === 'COURIER' && item.hash === 'courier-pickups' ? courierAttention?.pickup
              : role === 'COURIER' && item.hash === 'courier-deliveries' ? courierAttention?.delivery
              : null;
            const countLabel = item.hash === 'admin-orders' ? 'pesanan baru'
              : item.hash === 'hub-pickups' ? 'paket perlu ditugaskan pickup'
              : item.hash === 'hub-inbound' ? 'paket perlu dikonfirmasi tiba'
              : item.hash === 'courier-pickups' ? 'tugas pickup baru' : 'tugas antar baru';
            return <div key={item.hash}>
              {item.group ? <div className="nav-group">{item.group}</div> : null}
              <NavLink
                to={`/${item.hash}`}
                aria-current={page === item.hash ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
                className={page === item.hash ? 'active' : ''}
              >
                <Icon name={item.icon} size={19} />
                <span>{item.label}</span>
                {count != null && count > 0 ? <span className="nav-count" aria-label={`${count} ${countLabel}`}>{count > 99 ? '99+' : count}</span> : page === item.hash ? <span className="nav-active-dot" /> : null}
              </NavLink>
            </div>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="side-user">
            <span className="avatar">{user.name?.charAt(0).toUpperCase() || 'A'}</span>
            <div><strong>{user.name}</strong><small>{roleLabel}</small></div>
          </div>
          <button className="logout-link" onClick={onLogout}><Icon name="logout" size={17} /> Keluar</button>
        </div>
      </aside>
      {menuOpen ? <button className="sidebar-scrim" aria-label="Tutup menu" onClick={() => setMenuOpen(false)} /> : null}
      <div className="workspace min-w-0 flex-1">
        <header className="workspace-header bg-white">
          <div className="workspace-header-left">
            <button className="icon-button menu-toggle relative" onClick={() => setMenuOpen(true)} aria-label={hubPending ? `Buka menu, ${hubPending} tugas hub perlu ditangani` : 'Buka menu'}><Icon name="menu" />{hubPending > 0 ? <span className="nav-count mobile-menu-count" aria-hidden="true">{hubPending > 99 ? '99+' : hubPending}</span> : null}</button>
            <div className="breadcrumb"><span>Anteraja</span><Icon name="chevron" size={14} /><strong>{title || links.find((item) => item.hash === page)?.label || 'Lacak AWB'}</strong></div>
          </div>
          <div className="workspace-header-right"><InstallApp {...pwa} iconOnlyMobile/>{role !== 'BUYER' && role !== 'OPS_ADMIN' && role !== 'HUB_OPERATOR' ? <span className="header-role"><Icon name="shield" size={15} />{roleLabel}</span> : null}<span className="top-avatar">{user.name?.charAt(0).toUpperCase() || 'A'}</span></div>
        </header>
        <main className="workspace-main w-full" id="main-content">{children}</main>
        <footer className="workspace-footer">© {new Date().getFullYear()} Anteraja</footer>
      </div>
    </div>
  );
}
