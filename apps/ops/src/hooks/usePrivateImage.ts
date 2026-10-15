import { useEffect, useState } from 'react';
import { getPrivateImage } from '../lib/api';

export default function usePrivateImage(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setUrl(null);
    setMimeType('');
    setError('');
    setLoading(Boolean(path));

    if (path) {
      getPrivateImage(path, controller.signal)
        .then((blob) => {
          if (controller.signal.aborted) return;
          objectUrl = URL.createObjectURL(blob);
          setMimeType(blob.type);
          setUrl(objectUrl);
        })
        .catch((cause) => {
          if (!controller.signal.aborted) {
            setError(cause instanceof Error ? cause.message : 'Foto tidak dapat dimuat.');
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, attempt]);

  return { url, mimeType, loading, error, retry: () => setAttempt((current) => current + 1) };
}
