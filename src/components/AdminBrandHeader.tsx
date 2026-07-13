export function AdminBrandHeader() {
  return (
    <header className="brand-header admin-brand-header">
      <div className="brand-lockup">
        <div className="brand-logo-roundel" aria-hidden="true">
          <img className="brand-logo" src="/brand/roegusta-logo-mark.png" alt="" />
        </div>
        <div className="brand-copy">
          <p className="eyebrow">Roegusta Tour</p>
          <h1>Admin mode</h1>
          <p className="brand-location">PIN-protected tour operations</p>
          <p className="brand-dates">Public password access remains separate</p>
        </div>
      </div>
    </header>
  );
}
