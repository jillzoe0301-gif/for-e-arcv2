import type { PageKey, Role } from '../types';

const pageRoles: Record<PageKey, Role[]> = {
  dashboard: ['admin', 'staff', 'finance'],
  registration: ['admin', 'staff'],
  payment: ['admin', 'staff'],
  financeConfirm: ['admin', 'finance'],
  financeSearch: ['admin', 'finance'],
  faxPickup: ['admin', 'staff'],
  caseSearch: ['admin', 'staff', 'finance'],
  stats: ['admin', 'staff', 'finance'],
  export: ['admin', 'staff', 'finance'],
  brokersAccounts: ['admin', 'finance'],
  serviceStations: ['admin', 'staff'],
  taskForces: ['admin', 'staff'],
  auditLogs: ['admin'],
  settings: ['admin']
};

export function canAccessPage(role: Role | undefined, page: PageKey): boolean {
  if (!role) return false;
  return pageRoles[page].includes(role);
}

export function canAdjustBalance(role: Role | undefined): boolean {
  return role === 'admin' || role === 'finance';
}

export function canDeletePickupRecord(role: Role | undefined): boolean {
  return role === 'admin';
}
