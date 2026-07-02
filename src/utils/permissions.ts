import type { PageKey, Profile, Role } from '../types';

const allPages: PageKey[] = [
  'dashboard',
  'registration',
  'payment',
  'financeConfirm',
  'financeSearch',
  'faxPickup',
  'caseSearch',
  'stats',
  'export',
  'brokersAccounts',
  'serviceStations',
  'taskForces',
  'auditLogs',
  'settings',
  'announcements'
];

const financePages: PageKey[] = ['dashboard', 'financeConfirm', 'financeSearch', 'export'];

const pageRoles: Record<PageKey, Role[]> = allPages.reduce((result, page) => {
  result[page] = ['admin', 'staff'];
  if (financePages.includes(page)) result[page].push('finance');
  return result;
}, {} as Record<PageKey, Role[]>);

export function canAccessPage(role: Role | undefined, page: PageKey): boolean {
  if (!role) return false;
  return pageRoles[page].includes(role);
}

export function canDeleteData(role: Role | undefined): boolean {
  return role === 'admin';
}

export function canDeleteFinanceData(role: Role | undefined): boolean {
  return role === 'admin';
}

export function canDeletePickupRecord(role: Role | undefined): boolean {
  return role === 'admin';
}

export function canManageAccountPasswords(role: Role | undefined): boolean {
  return role === 'admin';
}

export function canManageAccounts(actor: Profile | null | undefined): boolean {
  return actor?.role === 'admin';
}

export function canModifyFinanceBatchDate(role: Role | undefined): boolean {
  return role === 'admin' || role === 'finance' || role === 'staff';
}

export function canAdjustBalance(role: Role | undefined): boolean {
  return role === 'admin' || role === 'finance' || role === 'staff';
}

export function canAdjustFinanceConfirmBalance(role: Role | undefined): boolean {
  return role === 'admin' || role === 'finance' || role === 'staff';
}

export function canEditFinanceDetail(role: Role | undefined): boolean {
  return role === 'admin' || role === 'finance' || role === 'staff';
}

export function canCompleteFinanceBatch(role: Role | undefined): boolean {
  return role === 'admin' || role === 'finance' || role === 'staff';
}

export function canManageAnnouncements(role: Role | undefined): boolean {
  return role === 'admin' || role === 'staff';
}

export function canCompletePickup(role: Role | undefined): boolean {
  return role === 'admin' || role === 'staff';
}
