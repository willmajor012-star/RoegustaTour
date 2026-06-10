type Props = { label: string; value: string | number; detail?: string; href?: string };
export function StatCard({ label, value, detail, href }: Props) {
  const content = <><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}<em aria-hidden="true">›</em></>;
  return href ? <a className="stat-card tappable-card" href={href}>{content}</a> : <article className="stat-card">{content}</article>;
}
