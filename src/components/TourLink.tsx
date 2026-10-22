export function TourLink({ href, title, detail }: { href: string; title: string; detail?: string }) {
  return <a className="card app-link-card" href={href}><span><strong>{title}</strong>{detail ? <small>{detail}</small> : null}</span><b aria-hidden="true">›</b></a>;
}
