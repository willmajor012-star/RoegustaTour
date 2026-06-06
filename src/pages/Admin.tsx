const sections = ['Players','Tours','Teams','Rounds','Matches','Results','Historic Import','Betting Markets'];
export function Admin() {
  return <div className="page-stack"><section className="page-title"><p className="eyebrow">Future PIN-protected admin</p><h2>Admin</h2><p>Placeholder shell only. Future Netlify Functions will verify a shared PIN and record changes in audit_log.</p></section><div className="admin-grid">{sections.map((section) => <article className="card" key={section}><h3>{section}</h3><p>Mock admin state. Supabase-backed create/edit tools will be added here.</p><button disabled>Coming soon</button></article>)}</div></div>;
}
