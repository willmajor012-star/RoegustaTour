type Props = { label: string; value: string | number; detail?: string };
export function StatCard({ label, value, detail }: Props) {
  return <article className="stat-card"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>;
}
