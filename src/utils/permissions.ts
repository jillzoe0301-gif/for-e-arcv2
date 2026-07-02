import type { PageKey, Role } from '../types';

const pageRoles: Record<PageKey, Role[]> = {
  dashboard: ['admin', 'staff', 'finance'],
  registration: ['admin', 'staff'],
  payment: ['admin', 'staff'],
  financeConfirm: ['admin', 'finance', 'staff'],
  financeSearch: ['admin', 'finance'],
  faxPickup: ['admin', 'staff'],
  caseSearch: ['admin', 'staff'],
  stats: ['admin', 'staff'],
  export: ['admin', 'staff', 'finance'],
  brokersAccounts: ['admin'],
  serviceStations: ['admin', 'staff'],
  taskForces: ['admin', 'staff'],
  auditLogs: ['admin'],
  settings: ['admin'],
  announcements: ['admin', 'staff']
};

export function canAccessPage(role: Role | undefined, page: PageKey): boolean {
  if (!role) return false;
  return pageRoles[page].includes(role);
}

export function canAdjustBalance(role: Role | undefined): boolean {
  return role === 'admin';
}

export function canModifyFinanceBatchDate(role: Role | undefined): boolean {
  return role === 'admin' || role === 'finance';
}

export function canAdjustFinanceConfirmBalance(role: Role | undefined): boolean {
  return role === 'admin' || role === 'finance';
}

export function canDeleteData(role: Role | undefined): boolean {
  return role === 'admin';
}

export function canDeletePickupRecord(role: Role | undefined): boolean {
  return role === 'admin';
}

export function canManageAnnouncements(role: Role | undefined): boolean {
  return role === 'admin' || role === 'staff';
}

export function canCompletePickup(role: Role | undefined): boolean {
  return role === 'admin' || role === 'staff';
}
