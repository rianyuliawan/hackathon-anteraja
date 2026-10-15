import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, get, post } from '../lib/api';
import { allowedHubId, primaryRole, type Role, type User } from '../lib/types';
import { ErrorBox, Loading, Notice } from '../ui';
import Brand from '../components/Brand';
import OfflineBanner from '../components/OfflineBanner';
import PortalShell from '../components/PortalShell';
import usePwaInstall from '../hooks/usePwaInstall';
import { home, menu } from '../utils/navigation';
import { LoginPage, RegisterPage, type BuyerRegistration } from '../pages/auth';
import { AdminOrders, AdminOverview } from '../pages/AdminPages';
import { AccountPage } from '../pages/BuyerPages';
import { CourierDeliveries, CourierJourneyPage, CourierOverview, CourierPackagePage, CourierPickups } from '../pages/CourierPages';
import { HubIssues, HubPickups } from '../pages/HubWorkflowPages';
import { HubHistoryPage } from '../pages/HubHistoryPage';
import { HubDispatch, HubInbound, HubOverview, HubReports } from '../pages/HubPages';
import { TrackingPage } from '../pages/TrackingPage';
import { TrackingDetailPage } from '../pages/TrackingDetailPage';

type Toast = { message: string; tone: 'success' | 'error' } | null;

function trackingDestination(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const target = new URL(raw, window.location.origin);
    if (target.origin !== window.location.origin || target.hash) return null;
    if (target.pathname === '/tracking' && [...target.searchParams.keys()].every((key) => key === 'awb')) {
      const awb = target.searchParams.get('awb');
      return awb && /^\d{14}$/.test(awb) ? `/tracking/${awb}?from=${awb}` : null;
    }
    if (!/^\/tracking\/\d{14}$/.test(target.pathname)) return null;
    if ([...target.searchParams.keys()].some((key) => key !== 'from')) return null;
    const from = target.searchParams.get('from');
    if (from && !/^\d{14}(,\d{14}){0,9}$/.test(from)) return null;
    return target.pathname + (from ? `?from=${encodeURIComponent(from)}` : '');
  } catch {
    return null;
  }
}

function courierDestination(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const target = new URL(raw, window.location.origin);
    if (target.origin !== window.location.origin || target.hash) return null;
    if (target.pathname === '/courier-pickups' && !target.search) return '/courier-pickups';
    if (target.pathname !== '/courier-deliveries') return null;
    if ([...target.searchParams.keys()].some((key) => key !== 'run')) return null;
    const run = target.searchParams.get('run');
    return run === null ? '/courier-deliveries'
      : /^[1-9]\d*$/.test(run) ? `/courier-deliveries?run=${run}` : null;
  } catch {
    return null;
  }
}

function parseUser(raw: unknown): User {
  const envelope = raw && typeof raw === 'object' && 'data' in raw ? (raw as { data: unknown }).data : raw;
  if (!envelope || typeof envelope !== 'object') throw new Error('Respons profil tidak valid.');
  const record = envelope as Record<string, unknown>;
  const body = record.user && typeof record.user === 'object' ? record.user as User : record as unknown as User;
  return {
    ...body,
    roles: (record.roles || body.roles || []) as User['roles'],
    role: (record.primary_role || body.role) as Role | undefined,
  };
}

export default function PortalRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const route = location.pathname.slice(1);
  const detailAwb = /^tracking\/(\d{14})$/.exec(route)?.[1] || null;
  const journeyRunId = /^courier-deliveries\/(\d+)\/map$/.exec(route)?.[1] || null;
  const courierPackageAwb = /^courier-deliveries\/package\/(\d{14})$/.exec(route)?.[1] || null;
  const hubHistoryAwb = /^hub-shipments\/(\d{14})$/.exec(route)?.[1] || null;
  const params = new URLSearchParams(location.search);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const pwa = usePwaInstall();

  useEffect(() => {
    const legacy = location.hash.replace(/^#/, '');
    if (legacy) navigate(`/${legacy}`, { replace: true });
  }, [location.hash, navigate]);
  useEffect(() => {
    get<unknown>('/api/v1/me')
      .then((raw) => setUser(parseUser(raw)))
      .catch((cause) => {
        if (!(cause instanceof ApiError && cause.status === 401)) {
          setAuthError('Layanan sedang tidak tersedia. Coba lagi beberapa saat.');
        }
      })
      .finally(() => setAuthLoading(false));
  }, []);
  useEffect(() => {
    setAuthError('');
  }, [route]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = (message: string, tone: 'success' | 'error' = 'success') => setToast({ message, tone });
  const role = primaryRole(user);
  const hubId = allowedHubId(user);
  const detailAllowed = Boolean(detailAwb && role && menu[role].some((item) => item.hash === 'tracking'));
  const journeyAllowed = Boolean(journeyRunId && role === 'COURIER');
  const courierPackageAllowed = Boolean(courierPackageAwb && role === 'COURIER');
  const hubHistoryAllowed = Boolean(hubHistoryAwb && role === 'HUB_OPERATOR');
  const page = role
    ? detailAllowed ? 'tracking' : journeyAllowed ? 'courier-journey' : courierPackageAllowed ? 'courier-package' : hubHistoryAllowed ? 'hub-history' : menu[role].some((item) => item.hash === route) ? route : home[role]
    : route === 'daftar' ? 'daftar' : 'masuk';

  const finishAuth = (next: User, message: string) => {
    const nextRole = primaryRole(next);
    if (!nextRole) throw new Error('Akun belum memiliki peran. Hubungi admin.');
    setUser(next);
    const trackingPath = trackingDestination(params.get('next'));
    const courierPath = nextRole === 'COURIER' ? courierDestination(params.get('next')) : null;
    const destination = trackingPath && menu[nextRole].some((item) => item.hash === 'tracking')
      ? trackingPath : courierPath;
    navigate(destination || `/${home[nextRole]}`, { replace: true });
    notify(message);
  };

  const login = async (email: string, password: string) => {
    setAuthBusy(true);
    setAuthError('');
    try {
      await post('/login', { email, password });
      const next = parseUser(await get<unknown>('/api/v1/me'));
      finishAuth(next, `Selamat datang, ${next.name}.`);
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : 'Gagal masuk. Periksa email dan kata sandi.');
    } finally {
      setAuthBusy(false);
    }
  };

  const register = async (payload: BuyerRegistration) => {
    setAuthBusy(true);
    setAuthError('');
    try {
      await post('/register', payload);
      const next = parseUser(await get<unknown>('/api/v1/me'));
      finishAuth(next, 'Akun pembeli berhasil dibuat.');
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : 'Pendaftaran gagal. Periksa data Anda.');
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = async () => {
    try {
      await post('/logout');
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.status === 401)) {
        notify('Gagal keluar. Periksa koneksi lalu coba lagi.', 'error');
        return;
      }
    }
    setUser(null);
    navigate('/masuk', { replace: true });
    notify('Anda sudah keluar.');
  };
  const toastElement = toast ? <div className={`toast toast-${toast.tone}`} role="status">{toast.message}</div> : null;

  if (authLoading) return <div className="app-boot"><Brand/><Loading label="Menyiapkan ruang kerja…"/></div>;
  if (location.hash) return null;
  const nextTrackingPath = trackingDestination(params.get('next'));
  const nextCourierPath = role === 'COURIER' ? courierDestination(params.get('next')) : null;
  if (user && (route === 'masuk' || route === 'daftar')) {
    const destination = nextTrackingPath && menu[role || 'BUYER'].some((item) => item.hash === 'tracking')
      ? nextTrackingPath : nextCourierPath;
    if (destination) return <Navigate to={destination} replace/>;
  }
  if (route !== page && !detailAllowed && !journeyAllowed && !courierPackageAllowed && !hubHistoryAllowed) {
    const destination = !user && (detailAwb || (route === 'tracking' && trackingDestination(location.pathname + location.search)) || courierDestination(location.pathname + location.search))
      ? `/masuk?next=${encodeURIComponent(location.pathname + location.search)}`
      : `/${page}${page === 'tracking' ? location.search : ''}`;
    return <Navigate to={destination} replace/>;
  }
  if (!user || !role) {
    return <>
      <OfflineBanner/>
      {page === 'daftar'
        ? <RegisterPage onRegister={register} busy={authBusy} error={authError} pwa={pwa}/>
        : <LoginPage onLogin={login} busy={authBusy} error={authError} pwa={pwa}/>}
      {toastElement}
    </>;
  }

  let content: ReactNode;
  if (page === 'tracking') {
    const fromAwbs = (params.get('from') || '').split(',').filter((value) => /^\d{14}$/.test(value)).slice(0, 10).join(',');
    content = detailAllowed && detailAwb
      ? <TrackingDetailPage awb={detailAwb} searchAwbs={fromAwbs} toast={notify}/>
      : <TrackingPage awb={params.get('awb') || ''}/>;
  }
  else if (page === 'account') content = <AccountPage name={user.name} email={user.email} phone={user.phone} role={role}/>;
  else if (role === 'OPS_ADMIN') {
    content = ({ 'admin-overview': <AdminOverview/>, 'admin-orders': <AdminOrders toast={notify}/> } as Record<string, ReactNode>)[page];
  } else if (role === 'HUB_OPERATOR') {
    if (!hubId) content = <div className="page"><ErrorBox error={new Error('Akun operator belum ditautkan ke hub. Hubungi admin operasional.')}/></div>;
    else content = page === 'hub-history' ? <HubHistoryPage hubId={hubId} awb={hubHistoryAwb || ''}/> : ({ 'hub-overview': <HubOverview hubId={hubId} hubName={user.hub_name || undefined}/>, 'hub-pickups': <HubPickups hubId={hubId} toast={notify}/>, 'hub-issues': <HubIssues hubId={hubId} toast={notify}/>, 'hub-inbound': <HubInbound hubId={hubId} toast={notify}/>, 'hub-dispatch': <HubDispatch hubId={hubId} toast={notify}/>, 'hub-returns': <Navigate to="/hub-issues" replace/>, 'hub-reports': <HubReports hubId={hubId} toast={notify}/> } as Record<string, ReactNode>)[page];
  } else if (role === 'COURIER') {
    content = ({ 'courier-overview': <CourierOverview/>, 'courier-pickups': <CourierPickups toast={notify}/>, 'courier-deliveries': <CourierDeliveries toast={notify}/>, 'courier-journey': <CourierJourneyPage runId={Number(journeyRunId)} toast={notify}/>, 'courier-package': <CourierPackagePage awb={courierPackageAwb || ''}/> } as Record<string, ReactNode>)[page];
  }
  else content = null;

  if (!content) content = <div className="page"><Notice tone="error">Halaman ini tidak tersedia untuk peran Anda.</Notice></div>;
  return <>
    <OfflineBanner/>
    <PortalShell user={user} role={role} page={page} title={detailAllowed || courierPackageAllowed || hubHistoryAllowed ? 'Detail paket' : journeyAllowed ? 'Peta pengantaran' : undefined} onLogout={logout} pwa={pwa}>{content}</PortalShell>
    {toastElement}
  </>;
}
