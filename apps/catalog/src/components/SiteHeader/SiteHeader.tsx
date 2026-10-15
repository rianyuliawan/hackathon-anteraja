import { NavLink } from "react-router-dom";
import type { Buyer } from "../../types/catalog";
import Brand from "../Brand";
import Icon from "../Icon";
import InstallApp from "../InstallApp";

export function Header({
  count,
  openCart,
  user,
  logout,
  pwa,
}: {
  count: number;
  openCart: () => void;
  user: Buyer;
  logout: () => void;
  pwa: { canPrompt: boolean; installed: boolean; install: () => Promise<boolean> };
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#eee6e5] bg-[#fffdfa]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-[68px] w-[min(100%-2rem,76rem)] items-center justify-between gap-3 md:h-20">
        <NavLink to="/" aria-label="Fashionaja, beranda">
          <Brand />
        </NavLink>
        <nav
          className="ml-auto hidden items-center gap-2 md:flex"
          aria-label="Navigasi utama"
        >
          <NavLink
            className={({ isActive }) =>
              `rounded-full px-4 py-2.5 text-sm font-bold transition ${isActive ? "bg-[#f8e8e5] text-[#392137]" : "text-[#786d78] hover:bg-[#f8f3f0]"}`
            }
            to="/"
            end
          >
            Koleksi
          </NavLink>
          <NavLink
            className={({ isActive }) =>
              `rounded-full px-4 py-2.5 text-sm font-bold transition ${isActive ? "bg-[#f8e8e5] text-[#392137]" : "text-[#786d78] hover:bg-[#f8f3f0]"}`
            }
            to="/pesanan"
          >
            Pesanan saya
          </NavLink>
        </nav>
        <div className="flex items-center gap-2 md:gap-3">
          <InstallApp {...pwa} iconOnlyMobile/>
          <button
            className="relative grid size-11 place-items-center rounded-full border border-[#e8dddf] bg-white text-[#392137] transition hover:bg-[#fbefec] md:size-12"
            type="button"
            onClick={openCart}
            aria-label={`Buka keranjang, ${count} barang`}
          >
            <Icon name="bag" size={21} />
            {count > 0 && (
              <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[#ed7564] text-[10px] font-extrabold text-white">
                {count}
              </span>
            )}
          </button>
          <details className="group relative hidden md:block">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-[#e8dddf] bg-white p-1 pr-3 text-sm font-bold text-[#392137] [&::-webkit-details-marker]:hidden">
              <span className="grid size-9 place-items-center rounded-full bg-[#392137] text-white">
                {user.name.charAt(0).toUpperCase()}
              </span>
              {user.name.split(" ")[0]}
              <Icon name="chevron" size={15} className="rotate-90" />
            </summary>
            <div className="absolute right-0 top-[calc(100%+10px)] grid w-44 gap-1 rounded-2xl border border-[#eee6e5] bg-white p-2 shadow-xl">
              <NavLink
                className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-[#fbf0ed]"
                to="/akun"
              >
                Akun saya
              </NavLink>
              <button
                className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#a3424f] hover:bg-[#fff1ef]"
                type="button"
                onClick={logout}
              >
                Keluar akun
              </button>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
