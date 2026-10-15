import { useEffect, useRef, useState } from 'react';
import { FiCamera, FiRefreshCw } from 'react-icons/fi';

export type CapturedPhoto = { file: File; capturedAt: string };

export function LiveCameraCapture({ photo, onCapture, label, filePrefix = 'bukti-antar' }: {
  photo: CapturedPhoto | null;
  onCapture: (photo: CapturedPhoto | null) => void;
  label: string;
  filePrefix?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);
  const [starting, setStarting] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');

  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setReady(false);
  }

  async function openCamera() {
    const generation = ++generationRef.current;
    stopCamera();
    setError('');
    setStarting(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Kamera memerlukan HTTPS atau localhost dan izin kamera pada browser.');
      setStarting(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 } },
      });
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setReady(true);
    } catch {
      if (generation === generationRef.current) {
        stopCamera();
        setError('Kamera tidak dapat dibuka. Izinkan akses kamera, lalu coba lagi.');
      }
    } finally {
      if (generation === generationRef.current) setStarting(false);
    }
  }

  useEffect(() => {
    if (!photo) void openCamera();
    return () => {
      generationRef.current++;
      stopCamera();
    };
  }, [photo]);

  function takePhoto() {
    const video = videoRef.current;
    if (!video || !ready || !video.videoWidth || !video.videoHeight) return;
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) { setError('Kamera tidak dapat mengambil gambar.'); return; }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) { setError('Foto gagal diproses. Coba ambil ulang.'); return; }
      const capturedAt = new Date().toISOString();
      onCapture({ file: new File([blob], `${filePrefix}-${Date.now()}.jpg`, { type: 'image/jpeg' }), capturedAt });
      stopCamera();
    }, 'image/jpeg', 0.84);
  }

  return <div className="photo-field">
    <span className="field-label">{label}</span>
    <div className="live-camera">
      {photo && preview ? <img src={preview} alt="Foto baru dari kamera" className="live-camera-view"/>
        : <video ref={videoRef} autoPlay muted playsInline className="live-camera-view" aria-label="Pratinjau kamera langsung"/>}
      {!photo && !ready && !starting ? <div className="live-camera-empty"><FiCamera size={28}/><span>Kamera belum aktif</span></div> : null}
    </div>
    {error ? <small className="live-camera-error" role="alert">{error}</small> : null}
    {photo ? <button type="button" className="button button-soft" onClick={() => onCapture(null)}><FiRefreshCw size={17}/> Ambil ulang foto</button>
      : <div className="live-camera-actions">
        <button type="button" className="button button-primary" onClick={takePhoto} disabled={!ready}><FiCamera size={17}/> Ambil foto sekarang</button>
        {error ? <button type="button" className="button button-soft" onClick={() => void openCamera()}>Buka kamera lagi</button> : null}
      </div>}
    <small>Foto diambil langsung dari kamera. Galeri dan unggahan berkas tidak tersedia.</small>
  </div>;
}
