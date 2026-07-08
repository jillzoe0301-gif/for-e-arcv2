import type { BrokerCompany, PersonOption } from '../types';

export const agencyOrder = ['灃康', '乾坤', '灃禾'];
export const handlerOrder = ['嘉陽', '佩珊', '詩涵', '奕君', '晏婷', '林莞'];

const handlerAliases: Record<string, string> = {
  莞莞: '林莞',
  林莞: '林莞'
};

function brokerRank(item: BrokerCompany): number {
  const names = [item.name, item.full_name, item.print_name, item.code].map((value) => String(value ?? '').trim()).filter(Boolean);
  const index = agencyOrder.findIndex((name) => names.some((value) => value === name || value.includes(name)));
  return index >= 0 ? index : agencyOrder.length;
}

function handlerRank(item: PersonOption): number {
  const names = [item.name, item.display_name].map((value) => handlerAliases[String(value ?? '').trim()] ?? String(value ?? '').trim()).filter(Boolean);
  const index = handlerOrder.findIndex((name) => names.includes(name));
  return index >= 0 ? index : handlerOrder.length;
}

export function sortBrokers<T extends BrokerCompany>(items: T[]): T[] {
  return [...items].sort((a, b) => brokerRank(a) - brokerRank(b) || String(a.name).localeCompare(String(b.name), 'zh-Hant'));
}

export function sortPeople<T extends PersonOption>(items: T[]): T[] {
  return [...items].sort((a, b) => handlerRank(a) - handlerRank(b) || String(a.display_name || a.name).localeCompare(String(b.display_name || b.name), 'zh-Hant'));
}
