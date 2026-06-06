import { useEffect, useState } from 'react';
import type { PublicDataSource } from './publicApi';

type Options = {
  onErrorMessage?: string;
};

export function usePublicData<T extends { source: PublicDataSource }>(loader: () => Promise<T>, options: Options = {}) {
  const [data, setData] = useState<T | undefined>();
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
          setData(undefined);
          setError(options.onErrorMessage ?? 'Live tour data could not be loaded. Please refresh or try again later.');
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
