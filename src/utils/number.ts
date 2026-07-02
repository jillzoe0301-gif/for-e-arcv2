export function parseMoney(value: unknown): number | null {
  const raw = String(value ?? '').normalize('NFKC').trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/[,$\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

export function formatMoney(value: unknown): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString('zh-TW', { maximumFractionDigits: 0 });
}

export function safeNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}
