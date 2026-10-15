import { createPortal } from 'react-dom';
import { FiClock, FiDownload, FiMapPin } from 'react-icons/fi';
import { dateTime, Modal } from '../ui';

interface PhotoLightboxProps {
  url: string;
  mimeType: string;
  kind: 'pickup' | 'delivery';
  awb: string;
  takenAt?: string | null;
  address?: string | null;
  onClose: () => void;
}

export function PhotoLightbox({ url, mimeType, kind, awb, takenAt, address, onClose }: PhotoLightboxProps) {
  const label = kind === 'pickup' ? 'Foto penjemputan' : 'Foto pengantaran';
  const extension = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const filename = `anteraja-${kind}-${awb.replace(/[^a-zA-Z0-9-]/g, '')}.${extension}`;

  return createPortal(
    <Modal title={label} onClose={onClose} wide>
      <div className="grid gap-4">
        <img src={url} alt={`${label} untuk resi ${awb}`} className="max-h-[65vh] w-full rounded-2xl bg-[#f8f3f6] object-contain" />
        <div className="grid gap-2 rounded-2xl bg-[#fff7fa] p-4 text-sm text-[#493645]">
          <p className="m-0 flex items-start gap-2"><FiClock className="mt-0.5 shrink-0 text-[#c22578]" aria-hidden="true" /><span><strong>Waktu foto:</strong> {takenAt ? `${dateTime(takenAt)} WIB` : 'Belum tercatat'}</span></p>
          <p className="m-0 flex items-start gap-2"><FiMapPin className="mt-0.5 shrink-0 text-[#c22578]" aria-hidden="true" /><span><strong>Alamat lokasi:</strong> {address || 'Alamat belum tersedia'}</span></p>
        </div>
        <a href={url} download={filename} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#e91681] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#c60c69]">
          <FiDownload aria-hidden="true" /> Unduh foto
        </a>
      </div>
    </Modal>,
    document.body,
  );
}
