import { useEffect, useState } from 'react';
import { requestPublicDataRefresh } from '../lib/refreshEvents';

export function RefreshButton() {
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!refreshing) return undefined;
    const timeout = window.setTimeout(() => setRefreshing(false), 1200);
    return () => window.clearTimeout(timeout);
  }, [refreshing]);

  return (
    <button
      className={`manual-refresh-button ${refreshing ? 'refreshing' : ''}`}
      type="button"
      onClick={() => {
        setRefreshing(true);
        requestPublicDataRefresh();
      }}
      aria-label="Refresh live tour data"
      title="Refresh live tour data"
    >
      ↻
    </button>
  );
}
