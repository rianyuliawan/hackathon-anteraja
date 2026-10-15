import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/catalog.service";
import type { Buyer } from "../../types/catalog";
import Brand from "../../components/Brand";
import Icon from "../../components/Icon";
import InstallApp from "../../components/InstallApp";
import { errorText } from "../../utils/format";

type AuthMode = "login" | "register";
type AuthForm = {
  name: string;
  email: string;
  phone: string;
  telegram_consent: boolean;
  default_address: string;
  default_postcode: string;
  password: string;
  password_confirmation: string;
};
const inputClass =
  "min-h-12 w-full rounded-xl border border-[#e7dce0] bg-white px-4 py-3 text-sm text-[#322636] outline-none transition placeholder:text-[#a99da5] focus:border-[#a14f68] focus:ring-2 focus:ring-[#f5d8db]";

export default function AuthPage({
  mode,
  onAuth,
  pwa,
}: {
  mode: AuthMode;
  onAuth: (buyer: Buyer) => void;
  pwa: { canPrompt: boolean; installed: boolean; install: () => Promise<boolean> };
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<AuthForm>({
    name: "",
    email: "",
    phone: "",
    telegram_consent: false,
    default_address: "",
    default_postcode: "",
    password: "",
    password_confirmation: "",
  });
  const register = mode === "register";
  function change(field: keyof AuthForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (register && form.password !== form.password_confirmation) {
      setError("Konfirmasi kata sandi belum sama.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      onAuth(
        register
          ? await api.register(form)
          : await api.login(form.email, form.password),
      );
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }
  const field = (label: string, element: React.ReactNode) => (
    <label className="grid gap-1.5 text-xs font-bold text-[#4c3d4d]">
      {label}
      {element}
    </label>
  );

  return (
    <div className="min-h-screen bg-[#fffaf7] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(480px,.9fr)]">
      <aside
        className={`relative isolate overflow-hidden bg-[#392137] ${register ? "h-36" : "h-48"} lg:min-h-screen lg:h-auto`}
      >
        <img
          className="absolute inset-0 -z-20 h-full w-full object-cover object-[50%_32%] lg:object-center"
          src={register ? "/images/register.webp" : "/images/login.webp"}
          alt=""
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#302033]/85 via-[#302033]/40 to-[#302033]/5 lg:bg-gradient-to-t lg:from-[#302033]/90 lg:via-[#302033]/25" />
        <div className="mx-auto flex h-full w-[min(100%-2rem,38rem)] flex-col justify-between py-5 lg:w-auto lg:px-[clamp(2rem,5vw,5rem)] lg:py-10">
          <Brand light />
          <div className="hidden max-w-lg lg:block">
            <span className="text-xs font-extrabold uppercase tracking-[.22em] text-[#ffc0af]">
              Pilihan untuk setiap hari
            </span>
            <h1 className="mt-5 text-5xl font-extrabold leading-[1.12] tracking-[-.06em] text-white xl:text-6xl">
              {register
                ? "Gaya baru dimulai dari sini."
                : "Temukan gaya yang terasa seperti Anda."}
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/85">
              {register
                ? "Buat akun untuk menyimpan pilihan dan melihat riwayat belanja Anda."
                : "Koleksi esensial untuk hari yang bergerak. Masuk dan lanjutkan pilihan Anda."}
            </p>
          </div>
          <p className="hidden text-xs font-semibold text-white/70 lg:block">
            Fashionaja · Jakarta, Indonesia
          </p>
        </div>
      </aside>
      <main className="relative -mt-5 min-h-[calc(100vh-11rem)] rounded-t-[1.75rem] bg-[#fffaf7] px-5 pb-10 pt-8 sm:px-8 lg:mt-0 lg:grid lg:min-h-screen lg:place-items-center lg:rounded-none lg:px-12 lg:py-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-6">
            <span className="text-[11px] font-extrabold uppercase tracking-[.2em] text-[#aa6173]">
              {register ? "Buat akun" : "Selamat datang"}
            </span>
            <h2 className="mt-2 text-[28px] font-extrabold leading-tight tracking-[-.05em] text-[#392137] sm:text-4xl">
              {register ? "Daftar Fashionaja" : "Masuk ke Fashionaja"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#7a6d78]">
              {register
                ? "Isi data diri untuk mulai memilih koleksi favorit."
                : "Masukkan email dan kata sandi untuk membuka katalog."}
            </p>
          </div>
          <form onSubmit={submit} className="grid gap-4">
            {register &&
              field(
                "Nama lengkap",
                <input
                  className={inputClass}
                  required
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => change("name", e.target.value)}
                  placeholder="Nama lengkap Anda"
                />,
              )}
            {field(
              "Email",
              <input
                className={inputClass}
                required
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => change("email", e.target.value)}
                placeholder="nama@email.com"
              />,
            )}
            {register &&
              field(
                "Nomor HP",
                <input
                  className={inputClass}
                  required
                  type="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(e) => change("phone", e.target.value)}
                  placeholder="08xx xxxx xxxx"
                />,
              )}
            {register && (
              <label className="flex items-start gap-3 rounded-xl border border-[#eadce3] bg-white px-4 py-3 text-xs leading-5 text-[#554451]">
                <input
                  className="mt-0.5 size-4 shrink-0 accent-[#9e455e]"
                  type="checkbox"
                  checked={form.telegram_consent}
                  onChange={(event) => setForm((current) => ({ ...current, telegram_consent: event.target.checked }))}
                />
                <span>Saya setuju menerima pembaruan pesanan melalui Telegram pada nomor HP ini.</span>
              </label>
            )}
            {register &&
              field(
                "Alamat pengiriman",
                <textarea
                  className={inputClass}
                  required
                  rows={2}
                  autoComplete="street-address"
                  value={form.default_address}
                  onChange={(e) => change("default_address", e.target.value)}
                  placeholder="Jalan, nomor rumah, kelurahan, kecamatan"
                />,
              )}
            {register &&
              field(
                "Kode pos",
                <input
                  className={inputClass}
                  required
                  inputMode="numeric"
                  minLength={5}
                  maxLength={5}
                  pattern="[0-9]{5}"
                  title="Masukkan 5 digit kode pos"
                  autoComplete="postal-code"
                  value={form.default_postcode}
                  onChange={(e) => change("default_postcode", e.target.value)}
                  placeholder="Contoh: 13910"
                />,
              )}
            {field(
              "Kata sandi",
              <input
                className={inputClass}
                required
                minLength={8}
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                value={form.password}
                onChange={(e) => change("password", e.target.value)}
                placeholder={
                  register ? "Minimal 8 karakter" : "Masukkan kata sandi"
                }
              />,
            )}
            {register &&
              field(
                "Ulangi kata sandi",
                <input
                  className={inputClass}
                  required
                  minLength={8}
                  type="password"
                  autoComplete="new-password"
                  value={form.password_confirmation}
                  onChange={(e) =>
                    change("password_confirmation", e.target.value)
                  }
                  placeholder="Ulangi kata sandi"
                />,
              )}
            {error && (
              <p
                className="rounded-xl border border-[#eab4b4] bg-[#fff0ef] px-4 py-3 text-xs font-semibold text-[#a84450]"
                role="alert"
              >
                {error}
              </p>
            )}
            <button
              className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#392137] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_22px_rgba(57,33,55,.15)] transition hover:bg-[#55304d] disabled:opacity-60"
              disabled={busy}
              type="submit"
            >
              {busy ? "Memproses..." : register ? "Buat akun" : "Masuk"}
              <Icon name="arrow" size={17} />
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-[#756875]">
            {register ? "Sudah memiliki akun?" : "Belum memiliki akun?"}{" "}
            <Link
              className="font-extrabold text-[#9e455e] hover:underline"
              to={register ? "/masuk" : "/daftar"}
            >
              {register ? "Masuk" : "Daftar"}
            </Link>
          </p>
          <div className="mt-6 flex justify-center"><InstallApp {...pwa}/></div>
        </div>
      </main>
    </div>
  );
}
