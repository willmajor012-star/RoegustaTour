export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return <div className="empty-state card"><h3>{title}</h3>{detail && <p>{detail}</p>}</div>;
}
