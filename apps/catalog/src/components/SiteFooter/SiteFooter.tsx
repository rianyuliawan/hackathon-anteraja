import { Link } from "react-router-dom";
import Brand from "../Brand";

export function Footer() {
  return (
    <footer className="bg-[#392137] text-white">
      <div className="mx-auto grid w-[min(100%-2rem,76rem)] gap-8 py-10 md:grid-cols-[2fr_1fr] md:py-14">
        <div>
          <Brand light />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#e9dfe5]">
            Gaya untuk setiap hari. Temukan pakaian yang nyaman dipakai dan
            mudah dipadukan.
          </p>
        </div>
        <div className="flex flex-col gap-3 text-sm">
          <strong className="text-xs uppercase tracking-widest text-[#f5b0a5]">
            Jelajahi
          </strong>
          <Link to="/">Koleksi</Link>
          <Link to="/pesanan">Pesanan saya</Link>
          <Link to="/akun">Akun</Link>
        </div>
      </div>
      <div className="mx-auto flex w-[min(100%-2rem,76rem)] justify-between border-t border-white/15 py-5 text-xs text-[#dbd0d8]">
        <span>© 2026 Fashionaja</span>
        <span>Jakarta, Indonesia</span>
      </div>
    </footer>
  );
}
