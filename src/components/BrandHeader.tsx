import { useRef } from 'react';
import { formatDate } from '../lib/formatting';
import { fetchPublicSummary } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';

export function BrandHeader() {
  const { data } = usePublicData(fetchPublicSummary);
  const logoClicks = useRef<number[]>([]);
  const handleLogoClick = () => {
    const now = Date.now();
    logoClicks.current = [...logoClicks.current.filter((time) => now - time <= 5000), now];
    if (logoClicks.current.length >= 10) {
      logoClicks.current = [];
      window.history.pushState(null, '', '/admin');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };
  const tour = data?.tour;

  return (
    <header className="brand-header">
      <div className="brand-lockup">
        <button type="button" className="brand-logo-roundel brand-logo-button" onClick={handleLogoClick} aria-label="Roegusta Tour home mark">
          <img className="brand-logo" src="/brand/roegusta-logo-mark.png" alt="Roegusta Tour mark" />
        </button>
        <div className="brand-copy">
          <p className="eyebrow">Private golf tour</p>
          <h1>{tour?.name ?? 'Roegusta Tour'}</h1>
          <p className="brand-location">{tour?.location ?? 'Location TBC'}</p>
          <p className="brand-dates">{formatDate(tour?.startDate)} — {formatDate(tour?.endDate)}</p>
        </div>
      </div>
    </header>
  );
}
