import { useEffect, useState } from 'react';

export default function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    return () => {
      window.removeEventListener('online', connected);
      window.removeEventListener('offline', disconnected);
    };
  }, []);

  return online ? null : (
    <div className="offline-banner" role="status">
      Koneksi terputus. Data paket dan unggahan foto memerlukan jaringan; jangan tutup form sebelum tersambung kembali.
    </div>
  );
}
