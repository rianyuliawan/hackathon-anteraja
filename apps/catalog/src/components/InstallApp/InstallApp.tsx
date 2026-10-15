import { useState } from "react";
import { FiDownload, FiShare2, FiSmartphone, FiX } from "react-icons/fi";

type Props = {
  canPrompt: boolean;
  installed: boolean;
  install: () => Promise<boolean>;
  iconOnlyMobile?: boolean;
};

function instructions() {
  const userAgent = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return <><FiShare2 className="shrink-0 text-[#a34d66]" size={20}/><span>Di Safari, ketuk <strong>Bagikan</strong>, lalu pilih <strong>Tambahkan ke Layar Utama</strong>.</span></>;
  }
  if (/Android/i.test(userAgent)) {
    return <><FiSmartphone className="shrink-0 text-[#a34d66]" size={20}/><span>Buka Fashionaja di Chrome, ketuk menu <strong>⋮</strong>, lalu pilih <strong>Instal aplikasi</strong> atau <strong>Tambahkan ke layar utama</strong>.</span></>;
  }
  return <><FiDownload className="shrink-0 text-[#a34d66]" size={20}/><span>Di Chrome atau Edge, klik ikon instal pada bilah alamat atau buka menu browser lalu pilih <strong>Instal aplikasi</strong>.</span></>;
}

export default function InstallApp({ canPrompt, installed, install, iconOnlyMobile = false }: Props) {
  const [showHelp, setShowHelp] = useState(false);
  if (installed) return null;

  async function openInstall() {
    if (!canPrompt) { setShowHelp(true); return; }
    try {
      const accepted = await install();
      if (!accepted) setShowHelp(true);
    } catch {
      setShowHelp(true);
    }
  }

  return <>
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#e6d5d5] bg-white px-3 text-xs font-bold text-[#392137] transition hover:bg-[#fbefec] ${iconOnlyMobile ? "size-11 px-0 md:size-auto md:px-4" : "px-4"}`}
      type="button"
      onClick={() => void openInstall()}
      aria-label="Pasang aplikasi Fashionaja"
    >
      <FiDownload size={17}/><span className={iconOnlyMobile ? "hidden md:inline" : ""}>Pasang aplikasi</span>
    </button>
    {showHelp ? <div className="fixed inset-0 z-[100] grid place-items-center bg-[#2b1a29]/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowHelp(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="fashionaja-install-title" className="w-full max-w-md rounded-2xl bg-[#fffaf7] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><p className="mb-1 text-xs font-extrabold tracking-widest text-[#a34d66] uppercase">Fashionaja</p><h2 id="fashionaja-install-title" className="text-xl font-extrabold text-[#392137]">Pasang di perangkat</h2></div>
          <button className="grid size-9 shrink-0 place-items-center rounded-full text-[#80717c] hover:bg-[#f6e8e8]" type="button" onClick={() => setShowHelp(false)} aria-label="Tutup petunjuk"><FiX size={20}/></button>
        </div>
        <p className="mt-4 text-sm leading-6 text-[#6c5d6a]">Pasang Fashionaja di layar utama untuk membuka katalog dengan lebih mudah.</p>
        <div className="mt-5 flex gap-3 rounded-xl bg-[#f8e8e5] p-4 text-sm leading-6 text-[#4f3b4b]">{instructions()}</div>
        <p className="mt-4 text-xs leading-5 text-[#817480]">Jika pilihan pemasangan belum muncul, buka halaman ini melalui browser utama di perangkat Anda.</p>
      </section>
    </div> : null}
  </>;
}
