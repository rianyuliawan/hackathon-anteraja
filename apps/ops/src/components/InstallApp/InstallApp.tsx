import { useState } from 'react';
import { FiDownload, FiShare2, FiSmartphone, FiX } from 'react-icons/fi';

type Props = {
  canPrompt: boolean;
  installed: boolean;
  install: () => Promise<boolean>;
  compact?: boolean;
  iconOnlyMobile?: boolean;
};

function installSteps() {
  const userAgent = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return <><FiShare2 className="shrink-0 text-[#b91c6d]" size={20}/><span>Di Safari, ketuk <strong>Bagikan</strong>, lalu pilih <strong>Tambahkan ke Layar Utama</strong>.</span></>;
  }
  if (/Android/i.test(userAgent)) {
    return <><FiSmartphone className="shrink-0 text-[#b91c6d]" size={20}/><span>Buka halaman ini di Chrome, ketuk menu <strong>⋮</strong>, lalu pilih <strong>Instal aplikasi</strong> atau <strong>Tambahkan ke layar utama</strong>.</span></>;
  }
  return <><FiDownload className="shrink-0 text-[#b91c6d]" size={20}/><span>Di Chrome atau Edge, klik ikon instal pada bilah alamat atau buka menu browser lalu pilih <strong>Instal aplikasi</strong>.</span></>;
}

export default function InstallApp({ canPrompt, installed, install, compact = false, iconOnlyMobile = false }: Props) {
  const [showHelp, setShowHelp] = useState(false);
  if (installed) return null;

  const openInstall = async () => {
    if (!canPrompt) { setShowHelp(true); return; }
    try {
      const accepted = await install();
      if (!accepted) setShowHelp(true);
    } catch {
      setShowHelp(true);
    }
  };

  return <>
    <button
      type="button"
      onClick={() => void openInstall()}
      aria-label="Pasang aplikasi"
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-[#ebd8e3] bg-white px-3 py-2.5 text-sm font-bold text-[#9d245f] transition hover:border-[#d98bb6] hover:bg-[#fff4f9] ${compact ? 'w-full' : ''} ${iconOnlyMobile ? 'size-9 px-0 sm:size-auto sm:px-3 sm:py-2.5' : ''}`}
    >
      <FiDownload size={17}/><span className={iconOnlyMobile ? 'hidden sm:inline' : ''}>Pasang aplikasi</span>
    </button>
    {showHelp ? <div className="fixed inset-0 z-[210] grid place-items-center bg-[#231521]/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowHelp(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="install-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><p className="mb-1 text-xs font-extrabold tracking-widest text-[#b91c6d] uppercase">Aplikasi Anteraja</p><h2 id="install-title" className="text-xl font-extrabold text-[#342435]">Pasang di perangkat</h2></div>
          <button type="button" className="grid size-9 shrink-0 place-items-center rounded-full text-[#796b77] hover:bg-[#f8eef4]" onClick={() => setShowHelp(false)} aria-label="Tutup petunjuk"><FiX size={20}/></button>
        </div>
        <p className="mt-4 text-sm leading-6 text-[#6c5d6a]">Pasang Anteraja di layar utama agar layanan mudah dibuka kapan saja.</p>
        <div className="mt-5 flex gap-3 rounded-xl bg-[#fff3f8] p-4 text-sm leading-6 text-[#4f3b4b]">{installSteps()}</div>
        <p className="mt-4 text-xs leading-5 text-[#817480]">Jika pilihan pemasangan belum muncul, buka halaman ini melalui browser utama di perangkat Anda.</p>
      </section>
    </div> : null}
  </>;
}
