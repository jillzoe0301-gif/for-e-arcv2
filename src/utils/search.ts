const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;
const CONTROL = /[\u0000-\u001F\u007F]/g;
const CJK_SPACE = /(?<=[\u3400-\u9FFF])\s+(?=[\u3400-\u9FFF])/g;

export function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(ZERO_WIDTH, '')
    .replace(CONTROL, ' ')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(CJK_SPACE, '')
    .trim()
    .toLowerCase();
}

export function compactSearchText(value: unknown): string {
  return normalizeSearchText(value).replace(/\s+/g, '');
}

export function searchIncludes(haystack: unknown, keyword: unknown): boolean {
  const needle = normalizeSearchText(keyword);
  if (!needle) return true;
  const a = normalizeSearchText(haystack);
  if (a.includes(needle)) return true;
  return compactSearchText(haystack).includes(compactSearchText(keyword));
}

export function rowMatchesKeyword(keyword: string, fields: unknown[]): boolean {
  const normalized = normalizeSearchText(keyword);
  if (!normalized) return true;
  return fields.some((field) => searchIncludes(field, normalized));
}
