export const TAIPEI_TIME_ZONE = 'Asia/Taipei';

export function todayTaipei(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TAIPEI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function taipeiWeekday(): number {
  const label = new Intl.DateTimeFormat('en-US', { timeZone: TAIPEI_TIME_ZONE, weekday: 'short' }).format(new Date());
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(label);
}

function cleanDateText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\t\r\n]/g, '')
    .trim();
}

function normalizeYear(yearText: string): string {
  const year = Number(yearText);
  if (yearText.length <= 3 || year < 1911) return String(year + 1911);
  return String(year);
}

export function parseDateLoose(value: unknown): string | null {
  const raw = cleanDateText(value);
  if (!raw) return null;

  const chinese = raw.match(/^民國\s*(\d{2,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/);
  if (chinese) {
    const y = normalizeYear(chinese[1]);
    const m = chinese[2].padStart(2, '0');
    const d = chinese[3].padStart(2, '0');
    return isValidDateParts(y, m, d) ? `${y}-${m}-${d}` : null;
  }

  const normalized = raw
    .replace(/^民國\s*/, '')
    .replace(/[年月/.]/g, '-')
    .replace(/日$/g, '')
    .replace(/--+/g, '-');

  const compact = normalized.replace(/-/g, '');
  if (/^\d{8}$/.test(compact)) {
    const y = compact.slice(0, 4);
    const m = compact.slice(4, 6);
    const d = compact.slice(6, 8);
    if (isValidDateParts(y, m, d)) return `${y}-${m}-${d}`;
  }
  if (/^\d{7}$/.test(compact)) {
    const y = normalizeYear(compact.slice(0, 3));
    const m = compact.slice(3, 5);
    const d = compact.slice(5, 7);
    if (isValidDateParts(y, m, d)) return `${y}-${m}-${d}`;
  }

  const match = normalized.match(/^(\d{2,4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const y = normalizeYear(match[1]);
    const m = match[2].padStart(2, '0');
    const d = match[3].padStart(2, '0');
    if (isValidDateParts(y, m, d)) return `${y}-${m}-${d}`;
  }
  return null;
}

function isValidDateParts(y: string, m: string, d: string): boolean {
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function formatDate(value?: string | null): string {
  if (!value) return '';
  const parsed = parseDateLoose(value) ?? String(value).slice(0, 10);
  return parsed;
}

export function addDays(dateString: string, days: number): string {
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function nextWeekThursday(base = todayTaipei()): string {
  const [y, m, d] = base.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay();
  const daysUntilThisWeekThursday = (4 - day + 7) % 7;
  const days = daysUntilThisWeekThursday + 7;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function nextAvailablePickupDay(base = todayTaipei()): string {
  return nextWeekThursday(base);
}

export function monthKey(dateString?: string | null): string {
  if (!dateString) return '';
  return formatDate(dateString).slice(0, 7);
}

export function yearKey(dateString?: string | null): string {
  if (!dateString) return '';
  return formatDate(dateString).slice(0, 4);
}

export function displayDateTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: TAIPEI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}
