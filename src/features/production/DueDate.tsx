export function DueDate({ value }: { value?: string | null }) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return <>—</>;
  const due = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(due)) return <>—</>;
  const now = new Date();
  const days = Math.round((due - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const label = days === 0 ? 'Bugün termin' : days > 0 ? `${days} gün kaldı` : `Termin ${-days} gün geçti`;
  return <span className="order-due-date"><time dateTime={value}>{value.split('-').reverse().join('.')}</time><small>{label}</small></span>;
}
