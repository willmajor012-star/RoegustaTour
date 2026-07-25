import { useCallback, useEffect, useRef, useState } from 'react';
import { PUBLIC_DATA_REFRESH_EVENT } from './refreshEvents';
import { clearPublicDataCache, type PublicDataSource } from './publicApi';

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
  const inFlightRef = useRef<Promise<void> | null>(null);
  const lastSuccessfulAtRef = useRef(0);
  const errorMessageRef = useRef(options.onErrorMessage);
  errorMessageRef.current = options.onErrorMessage;

  const refresh = useCallback((showLoading = !hasDataRef.current) => {
    if (inFlightRef.current) return inFlightRef.current;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const request = (async () => {
      if (showLoading) setLoading(true);
      setError(undefined);
      try {
        const payload = await loader();
        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        hasDataRef.current = true;
        lastSuccessfulAtRef.current = Date.now();
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
    })();
    inFlightRef.current = request;
    void request.finally(() => {
      if (inFlightRef.current === request) inFlightRef.current = null;
    });
    return request;
  }, [loader]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh(true);
    const refreshMs = options.refreshMs ?? 60_000;
    const refreshIfUseful = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      if (Date.now() - lastSuccessfulAtRef.current < refreshMs) return;
      void refresh(false);
    };
    const interval = window.setInterval(refreshIfUseful, refreshMs);
    const handleManualRefresh = () => {
      clearPublicDataCache();
      lastSuccessfulAtRef.current = 0;
      void refresh(false);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshIfUseful();
    };
    window.addEventListener(PUBLIC_DATA_REFRESH_EVENT, handleManualRefresh);
    window.addEventListener('focus', refreshIfUseful);
    window.addEventListener('online', refreshIfUseful);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      window.clearInterval(interval);
      window.removeEventListener(PUBLIC_DATA_REFRESH_EVENT, handleManualRefresh);
      window.removeEventListener('focus', refreshIfUseful);
      window.removeEventListener('online', refreshIfUseful);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [options.refreshMs, refresh]);

  return { data, loading, error, source: data?.source, refresh, lastUpdatedAt };
}
