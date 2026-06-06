import { useEffect, useState } from 'react';
import type { PublicDataSource } from './publicApi';

export type PublicSource = PublicDataSource | 'local-fallback';

type Options<T> = {
  localFallback?: T;
  onErrorMessage?: string;
};

export function usePublicData<T extends { source: PublicDataSource }, F extends Omit<T, 'source'> & { source: 'local-fallback' }>(loader: () => Promise<T>, options: Options<F> = {}) {
  const [data, setData] = useState<T | F | undefined>(options.localFallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(undefined);
      try {
        const payload = await loader();
        if (!cancelled) setData(payload);
      } catch (caught) {
        console.error('Failed to load public data:', caught);
        if (!cancelled) {
          setError(options.onErrorMessage ?? 'Live data is unavailable.');
          if (options.localFallback) setData(options.localFallback);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error, source: data?.source };
}
