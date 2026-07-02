export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>): void {
  if (!rows.length) {
    const blob = new Blob([''], { type: 'text/csv;charset=utf-8' });
    trigger(filename, blob);
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => quoteCsv(row[h])).join(','));
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  trigger(filename, blob);
}

function quoteCsv(value: unknown): string {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function trigger(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
