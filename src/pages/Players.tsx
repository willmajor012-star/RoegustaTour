export function Players() {
  return (
    <div className="page-stack legacy-players-page">
      <section className="page-title premium-title">
        <h2>Players</h2>
      </section>
      <section className="card legacy-players-card">
        <p>Players now live with squads in Teams. Player performance, sorting and head-to-head live in Stats.</p>
        <div className="quick-link-grid compact">
          <a className="card tappable-card" href="/teams"><strong>Teams</strong><span>›</span></a>
          <a className="card tappable-card" href="/stats"><strong>Stats</strong><span>›</span></a>
        </div>
      </section>
    </div>
  );
}
