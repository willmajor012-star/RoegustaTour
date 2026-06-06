import { currentTourId, tours } from '../data/mockData';

export function BrandHeader() {
  const tour = tours.find((item) => item.id === currentTourId);
  return (
    <header className="brand-header">
      <div className="brand-lockup">
        <div className="brand-monogram" aria-hidden="true">
          <span>TR</span>
        </div>
        <div>
          <p className="eyebrow">Private golf tour</p>
          <h1>Roegusta Tour</h1>
          <span>{tour?.name} · {tour?.location}</span>
        </div>
      </div>
    </header>
  );
}
