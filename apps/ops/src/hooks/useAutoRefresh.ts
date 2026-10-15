import { useEffect, useRef } from 'react';

export default function useAutoRefresh(refresh: () => void, intervalMs = 30_000) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') refreshRef.current();
    };
    const interval = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs]);
}
