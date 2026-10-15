import { NavLink } from "react-router-dom";
import Icon from "../Icon";

const navClass = (active: boolean) =>
  `flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold ${active ? "text-[#392137]" : "text-[#8d838d]"}`;

export function MobileNav({
  count,
  openCart,
}: {
  count: number;
  openCart: () => void;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[#eee6e5] bg-[#fffdfa]/97 px-3 pb-[max(.35rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-8px_28px_rgba(48,32,47,.06)] backdrop-blur md:hidden"
      aria-label="Navigasi ponsel"
    >
      <div className="mx-auto flex max-w-lg items-center gap-1">
        <NavLink className={({ isActive }) => navClass(isActive)} to="/" end>
          <Icon name="home" size={21} />
          <span>Beranda</span>
        </NavLink>
        <NavLink className={({ isActive }) => navClass(isActive)} to="/pesanan">
          <Icon name="package" size={21} />
          <span>Pesanan</span>
        </NavLink>
        <button
          className={navClass(false)}
          type="button"
          onClick={openCart}
          aria-label={`Keranjang, ${count} barang`}
        >
          <span className="relative">
            <Icon name="bag" size={21} />
            {count > 0 && (
              <b className="absolute -right-3 -top-2 grid size-4 place-items-center rounded-full bg-[#ed7564] text-[9px] text-white">
                {count}
              </b>
            )}
          </span>
          <span>Keranjang</span>
        </button>
        <NavLink className={({ isActive }) => navClass(isActive)} to="/akun">
          <Icon name="user" size={21} />
          <span>Akun</span>
        </NavLink>
      </div>
    </nav>
  );
}
