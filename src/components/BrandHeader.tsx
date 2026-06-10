import { formatDate } from '../lib/formatting';
import { fetchPublicSummary } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';

export function BrandHeader() {
  const { data } = usePublicData(fetchPublicSummary);
  const tour = data?.tour;

  return (
    <header className="brand-header">
      <div className="brand-lockup">
        <span className="brand-logo-roundel">
          <img className="brand-logo" src="/brand/roegusta-logo-mark.png" alt="Roegusta Tour mark" />
        </span>
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
