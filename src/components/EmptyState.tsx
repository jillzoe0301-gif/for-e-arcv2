export function EmptyState({ text = '目前沒有資料' }: { text?: string }) {
  return <div className="empty-state">{text}</div>;
}
