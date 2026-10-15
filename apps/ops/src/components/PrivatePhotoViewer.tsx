import { useState } from 'react';
import { createPortal } from 'react-dom';
import usePrivateImage from '../hooks/usePrivateImage';
import { Button, Modal } from '../ui';
import { PhotoLightbox } from './PhotoLightbox';

export function PrivatePhotoViewer({ path, kind = 'pickup', label, awb = '', takenAt, address }: { path: string; kind?: 'pickup' | 'delivery'; label?: string; awb?: string; takenAt?: string | null; address?: string | null }) {
  const [open, setOpen] = useState(false);
  const photoLabel = kind === 'pickup' ? 'foto penjemputan' : 'foto pengantaran';
  const { url, mimeType, loading, error, retry } = usePrivateImage(open ? path : null);

  return <>
    <Button type="button" size="small" variant="secondary" icon="camera" onClick={() => setOpen(true)}>{label || `Lihat ${photoLabel}`}</Button>
    {open && url ? <PhotoLightbox url={url} mimeType={mimeType} kind={kind} awb={awb} takenAt={takenAt} address={address} onClose={() => setOpen(false)} /> : null}
    {open && !url ? createPortal(<Modal title={kind === 'pickup' ? 'Foto penjemputan' : 'Foto pengantaran'} onClose={() => setOpen(false)}>
      {loading ? <p className="text-sm text-[#897b88]" role="status">Memuat foto…</p> : null}
      {error ? <div className="grid gap-3 text-sm text-[#9d3455]" role="alert"><p>{error}</p><Button type="button" variant="secondary" onClick={retry}>Coba lagi</Button></div> : null}
    </Modal>, document.body) : null}
  </>;
}
