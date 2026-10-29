import type { ArcCase, BrokerCompany, PersonOption } from '../types';
import { staffFullName } from './personNames';

export const agencyOrder = ['灃康', '乾坤', '灃禾'];
export const handlerOrder = ['徐嘉陽', '蔡佩珊', '劉詩涵', '郭奕君', '胡晏婷', '林莞'];

function brokerRank(item: BrokerCompany): number {
  const names = [item.name, item.full_name, item.print_name, item.code].map((value) => String(value ?? '').trim()).filter(Boolean);
  const index = agencyOrder.findIndex((name) => names.some((value) => value === name || value.includes(name)));
  return index >= 0 ? index : agencyOrder.length;
}

function handlerRank(item: PersonOption): number {
  const names = [item.name, item.display_name].map(staffFullName).filter(Boolean);
  const index = handlerOrder.findIndex((name) => names.includes(name));
  return index >= 0 ? index : handlerOrder.length;
}

export function sortBrokers<T extends BrokerCompany>(items: T[]): T[] {
  return [...items].sort((a, b) => brokerRank(a) - brokerRank(b) || String(a.name).localeCompare(String(b.name), 'zh-Hant'));
}

export function sortPeople<T extends PersonOption>(items: T[]): T[] {
  return [...items].sort((a, b) => handlerRank(a) - handlerRank(b) || String(a.display_name || a.name).localeCompare(String(b.display_name || b.name), 'zh-Hant'));
}


function normalizedSortDate(value: unknown): string {
  const raw = String(value ?? '').trim();
  return raw || '9999-12-31';
}

/** 依申請日、團號排序；空白申請日置底，最後以案件編號穩定排序。 */
export function sortCasesByApplicationDateAndGroup<T extends ArcCase>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    normalizedSortDate(a.application_date).localeCompare(normalizedSortDate(b.application_date)) ||
    String(a.group_no ?? '').localeCompare(String(b.group_no ?? ''), 'zh-Hant', { numeric: true, sensitivity: 'base' }) ||
    String(a.case_no ?? '').localeCompare(String(b.case_no ?? ''), 'zh-Hant', { numeric: true, sensitivity: 'base' })
  );
}

