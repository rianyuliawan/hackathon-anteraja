import { useEffect, useRef } from 'react';

export default function useRefreshOnReturn(refresh: () => void) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshRef.current();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);
}
