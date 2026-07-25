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
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M20 7v5h-5" />
        <path d="M18.2 16.2A8 8 0 1 1 19.4 9" />
      </svg>
    </button>
  );
}
