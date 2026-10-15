import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FiArrowRight } from 'react-icons/fi';
import { Button, Notice } from '../../ui';
import Brand from '../../components/Brand';
import InstallApp from '../../components/InstallApp';

export type BuyerRegistration = {
  name: string;
  email: string;
  phone: string;
  telegram_consent: boolean;
  default_address: string;
  default_postcode: string;
  password: string;
  password_confirmation: string;
};

type PwaControls = { canPrompt: boolean; installed: boolean; install: () => Promise<boolean> };

function AuthFrame({ children, register = false, pwa }: { children: ReactNode; register?: boolean; pwa: PwaControls }) {
  return (
    <div className="min-h-screen bg-[#fff9fc] text-[#302433] lg:grid lg:grid-cols-[min(600px,64vh)_minmax(460px,1fr)]">
      <aside className="sticky top-0 hidden h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_54%,#ffe0eb_0%,#fff0ea_54%,#fff8f3_100%)] lg:flex" aria-label="Ilustrasi kurir Anteraja">
        <div className="absolute left-1/2 top-1/2 h-[min(75vh,560px)] w-[min(75vh,560px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40" aria-hidden="true"/>
        <img src="/auth-courier.png" alt="Ilustrasi kurir Anteraja membawa paket" className="relative z-10 max-h-[74vh] w-[min(100%,620px)] object-contain drop-shadow-[0_28px_25px_rgba(97,37,65,0.16)]"/>
      </aside>
      <main className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex min-h-[72px] items-center border-b border-[#f4e8ef] bg-white/95 px-5 shadow-[0_4px_20px_rgba(92,30,64,0.04)] backdrop-blur-md sm:px-9 lg:min-h-[84px] lg:px-[clamp(2.5rem,5vw,6rem)]">
          <Brand/>
        </header>
        <div className={`mx-auto flex w-full max-w-[530px] flex-1 flex-col justify-center px-4 py-8 sm:px-6 ${register ? 'lg:py-10' : 'lg:py-16'}`}>
          <div className="rounded-[26px] border border-[#f2e5ed] bg-white px-5 py-7 shadow-[0_18px_52px_rgba(95,30,69,0.07)] sm:rounded-[30px] sm:px-9 sm:py-9">
            {children}
          </div>
        </div>
        <footer className="flex flex-col items-center gap-3 px-5 pb-6 text-center text-xs text-[#938792]"><InstallApp {...pwa}/><span>© {new Date().getFullYear()} Anteraja</span></footer>
      </main>
    </div>
  );
}

const field = 'min-h-12 w-full rounded-xl border border-[#e7dce4] bg-[#fffafd] px-4 py-3 text-sm text-[#302433] outline-none transition-colors placeholder:text-[#a49aa3] hover:border-[#d8bbc9] focus:border-[#c02073] focus:bg-white focus:ring-2 focus:ring-[#f9d7e9]';
const label = 'grid gap-1.5 text-xs font-bold text-[#594957]';

export function LoginPage({ onLogin, busy, error, pwa }: { onLogin: (email: string, password: string) => Promise<void>; busy: boolean; error: string; pwa: PwaControls }) {
  const location = useLocation();
  const next = new URLSearchParams(location.search).get('next');
  const registerHref = next ? `/daftar?next=${encodeURIComponent(next)}` : '/daftar';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); void onLogin(email.trim(), password); };
  return <AuthFrame pwa={pwa}>
    <p className="mb-3 inline-flex items-center gap-2 text-xs font-extrabold tracking-[.13em] text-[#b91c6d] uppercase"><span className="h-2 w-2 rounded-full bg-[#ec1688]" aria-hidden="true"/>Selamat datang</p>
    <h2 className="mb-2 text-[30px] leading-tight font-extrabold tracking-[-.045em] text-[#342435] sm:text-4xl">Masuk ke Anteraja</h2>
    <p className="mb-7 text-sm leading-6 text-[#7d707b]">Selamat datang kembali. Masukkan akun Anda untuk melanjutkan.</p>
    <form onSubmit={submit} className="grid gap-4">
      <label className={label}>Email<input className={field} type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@email.com"/></label>
      <label className={label}>Kata sandi<input className={field} type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Masukkan kata sandi"/></label>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button type="submit" loading={busy} className="mt-2 min-h-12 w-full justify-center rounded-xl!">Masuk <FiArrowRight size={17}/></Button>
    </form>
    <p className="mt-7 text-center text-sm text-[#7d707b]">Belum punya akun? <Link className="font-bold text-[#b91c6d] hover:underline" to={registerHref}>Daftar</Link></p>
  </AuthFrame>;
}

export function RegisterPage({ onRegister, busy, error, pwa }: { onRegister: (payload: BuyerRegistration) => Promise<void>; busy: boolean; error: string; pwa: PwaControls }) {
  const location = useLocation();
  const next = new URLSearchParams(location.search).get('next');
  const loginHref = next ? `/masuk?next=${encodeURIComponent(next)}` : '/masuk';
  const [form, setForm] = useState<BuyerRegistration>({ name: '', email: '', phone: '', telegram_consent: false, default_address: '', default_postcode: '', password: '', password_confirmation: '' });
  const [localError, setLocalError] = useState('');
  const update = (key: keyof BuyerRegistration, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (form.password !== form.password_confirmation) { setLocalError('Ulangi kata sandi dengan benar.'); return; }
    setLocalError('');
    void onRegister({ ...form, name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), default_address: form.default_address.trim() });
  };
  return <AuthFrame register pwa={pwa}>
    <h2 className="mb-2 text-[30px] leading-tight font-extrabold tracking-[-.045em] text-[#342435] sm:text-4xl">Daftar akun</h2>
    <p className="mb-6 text-sm leading-6 text-[#7d707b]">Isi data diri Anda untuk membuat akun.</p>
    <form onSubmit={submit} className="grid gap-3.5">
      <label className={label}>Nama lengkap<input className={field} required autoComplete="name" value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Nama lengkap Anda"/></label>
      <label className={label}>Email<input className={field} required type="email" autoComplete="email" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="nama@email.com"/></label>
      <label className={label}>Nomor HP<input className={field} required type="tel" autoComplete="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="08xx xxxx xxxx"/></label>
      <label className="flex items-start gap-3 rounded-xl border border-[#eadce4] bg-[#fffafd] px-4 py-3 text-xs leading-5 text-[#594957]">
        <input className="mt-0.5 size-4 shrink-0 accent-[#c02073]" type="checkbox" checked={form.telegram_consent} onChange={(event) => update('telegram_consent', event.target.checked)}/>
        <span>Saya setuju menerima pembaruan pengiriman melalui Telegram pada nomor HP ini.</span>
      </label>
      <label className={label}>Alamat<textarea className={`${field} min-h-20 resize-y`} required rows={2} autoComplete="street-address" value={form.default_address} onChange={(event) => update('default_address', event.target.value)} placeholder="Jalan, nomor rumah, kelurahan, kecamatan"/></label>
      <label className={label}>Kode pos<input className={field} required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} title="Masukkan 5 digit kode pos" autoComplete="postal-code" value={form.default_postcode} onChange={(event) => update('default_postcode', event.target.value)} placeholder="Contoh: 13910"/></label>
      <label className={label}>Kata sandi<input className={field} required type="password" minLength={8} autoComplete="new-password" value={form.password} onChange={(event) => update('password', event.target.value)} placeholder="Minimal 8 karakter"/></label>
      <label className={label}>Ulangi kata sandi<input className={field} required type="password" minLength={8} autoComplete="new-password" value={form.password_confirmation} onChange={(event) => update('password_confirmation', event.target.value)} placeholder="Ulangi kata sandi"/></label>
      {localError || error ? <Notice tone="error">{localError || error}</Notice> : null}
      <Button type="submit" loading={busy} className="mt-2 min-h-12 w-full justify-center rounded-xl!">Buat akun<FiArrowRight size={17}/></Button>
    </form>
    <p className="mt-6 text-center text-sm text-[#7d707b]">Sudah punya akun? <Link className="font-bold text-[#b91c6d] hover:underline" to={loginHref}>Masuk</Link></p>
  </AuthFrame>;
}
