import type { BatchStatus, CaseStatus, Role } from '../types';

export const roleLabels: Record<Role, string> = {
  admin: '管理員',
  staff: '行政',
  finance: '會計 / 財務'
};

export const caseStatusLabels: Record<CaseStatus, string> = {
  pending_payment: '待繳款',
  paid: '已繳款',
  pending_pickup: '待傳真/領件',
  archive_registered: '已登記 / 查詢留存',
  archive_paid: '已繳費 / 查詢留存',
  cancelled: '取消案件',
  not_received: '本次未領到',
  completed: '已完成領件',
  removed_from_payment: '已從繳費頁移除'
};

export const batchStatusLabels: Record<BatchStatus, string> = {
  pending: '待對帳',
  confirmed: '對帳完成',
  amount_error: '項目金額錯誤',
  cancelled: '取消批次'
};
