import { useCallback, useEffect, useRef, useState } from 'react';
import { PUBLIC_DATA_REFRESH_EVENT } from './refreshEvents';
import type { PublicDataSource } from './publicApi';

type Options = {
  onErrorMessage?: string;
  refreshMs?: number;
};

export function usePublicData<T extends { source: PublicDataSource }>(loader: () => Promise<T>, options: Options = {}) {
  const [data, setData] = useState<T | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | undefined>();
  const hasDataRef = useRef(false);
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const errorMessageRef = useRef(options.onErrorMessage);
  errorMessageRef.current = options.onErrorMessage;

  const refresh = useCallback(async (showLoading = !hasDataRef.current) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (showLoading) setLoading(true);
    setError(undefined);
    try {
      const payload = await loader();
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      hasDataRef.current = true;
      setData(payload);
      setLastUpdatedAt(new Date().toISOString());
    } catch (caught) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      console.error('Failed to load public data:', caught);
      setError(errorMessageRef.current ?? 'Live tour data could not be loaded. Please refresh or try again later.');
      if (!hasDataRef.current) setData(undefined);
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) setLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh(true);
    const interval = window.setInterval(() => void refresh(false), options.refreshMs ?? 20000);
    const handleManualRefresh = () => void refresh(false);
    window.addEventListener(PUBLIC_DATA_REFRESH_EVENT, handleManualRefresh);
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      window.clearInterval(interval);
      window.removeEventListener(PUBLIC_DATA_REFRESH_EVENT, handleManualRefresh);
    };
  }, [options.refreshMs, refresh]);

  return { data, loading, error, source: data?.source, refresh, lastUpdatedAt };
}
