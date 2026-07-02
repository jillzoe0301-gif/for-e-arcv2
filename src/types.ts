export type Role = 'admin' | 'staff' | 'finance';

export type PageKey =
  | 'dashboard'
  | 'registration'
  | 'payment'
  | 'financeConfirm'
  | 'financeSearch'
  | 'faxPickup'
  | 'caseSearch'
  | 'stats'
  | 'export'
  | 'brokersAccounts'
  | 'serviceStations'
  | 'taskForces'
  | 'auditLogs'
  | 'settings'
  | 'announcements';

export type CaseStatus =
  | 'pending_payment'
  | 'paid'
  | 'pending_pickup'
  | 'archive_registered'
  | 'archive_paid'
  | 'cancelled'
  | 'not_received'
  | 'completed'
  | 'removed_from_payment';

export type BatchStatus = 'pending' | 'confirmed' | 'amount_error' | 'cancelled';
export type PickupItemStatus = 'pending' | 'picked_up' | 'not_received' | 'cancelled';

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  personnel_id?: string | null;
  must_change_password: boolean;
  last_login_at?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface PersonOption {
  id: string;
  name: string;
  display_name: string;
  department?: string | null;
  role_text?: string | null;
  is_enabled: boolean;
  show_as_handler: boolean;
  show_as_admin: boolean;
  show_as_runner: boolean;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface BrokerCompany {
  id: string;
  name: string;
  full_name: string;
  code: string;
  phone?: string | null;
  print_name?: string | null;
  is_enabled: boolean;
}

export interface BankAccount {
  id: string;
  broker_id: string;
  account_name: string;
  bank_code: string;
  bank_name: string;
  account_no: string;
  account_last5?: string | null;
  initial_balance: number;
  current_balance: number;
  is_enabled: boolean;
  is_default?: boolean;
}

export interface ApplicationItem {
  id: string;
  name: string;
  default_amount: number;
  is_enabled: boolean;
  requires_payment: boolean;
  enters_fax_pickup: boolean;
  enters_finance: boolean;
  included_in_stats: boolean;
  requires_ic_card: boolean;
  requires_old_card: boolean;
  sort_order: number;
}

export interface FeeSetting {
  id: string;
  fee_name: string;
  amount: number;
  broker_id?: string | null;
  application_item_id?: string | null;
  is_enabled: boolean;
  include_in_finance_search: boolean;
  include_in_reconciliation: boolean;
}

export interface ArcCase {
  id: string;
  case_no: string;
  handler_name: string;
  broker_id: string;
  employer_name: string;
  worker_name: string;
  entry_date?: string | null;
  application_date: string;
  group_no?: string | null;
  application_item_id: string;
  amount: number;
  status: CaseStatus;
  payment_batch_id?: string | null;
  payment_date?: string | null;
  payment_account_id?: string | null;
  cancelled_reason?: string | null;
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  receipt_no?: string | null;
  foreign_no_last5?: string | null;
  receipt_order?: number | null;
  fax_date?: string | null;
  expected_pickup_date?: string | null;
  pickup_date?: string | null;
  pickup_record_id?: string | null;
  pickup_status?: PickupItemStatus | null;
  note?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface PaymentBatch {
  id: string;
  batch_no: string;
  broker_id: string;
  account_id: string;
  payment_date: string;
  payer_name: string;
  total_amount: number;
  case_count: number;
  status: BatchStatus;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface PaymentBatchItem {
  id: string;
  batch_id: string;
  case_id: string;
  original_application_item_id?: string | null;
  original_amount: number;
  corrected_application_item_id?: string | null;
  corrected_amount?: number | null;
  correction_reason?: string | null;
  corrected_by?: string | null;
  corrected_at?: string | null;
  created_at?: string;
}

export interface AccountTransaction {
  id: string;
  account_id: string;
  txn_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  ref_table?: string | null;
  ref_id?: string | null;
  reason?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface FaxPickupItem {
  id: string;
  case_id: string;
  receipt_no: string;
  foreign_no_last5: string;
  receipt_order: number;
  fax_date: string;
  expected_pickup_date: string;
  status: PickupItemStatus;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface PickupRecord {
  id: string;
  record_no: string;
  pickup_date: string;
  created_by?: string | null;
  created_by_name?: string | null;
  case_count: number;
  created_at: string;
  deleted_by?: string | null;
  deleted_at?: string | null;
  delete_reason?: string | null;
}

export interface PickupRecordItem {
  id: string;
  record_id: string;
  case_id: string;
  status: PickupItemStatus;
  not_received_at?: string | null;
  not_received_by?: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  action_type: string;
  actor_id?: string | null;
  actor_name?: string | null;
  page_name?: string | null;
  record_table?: string | null;
  record_id?: string | null;
  old_data?: unknown;
  new_data?: unknown;
  reason?: string | null;
  created_at: string;
}

export interface DeletedRecord {
  id: string;
  table_name: string;
  record_id: string;
  data: Record<string, unknown>;
  deleted_by?: string | null;
  deleted_by_name?: string | null;
  deleted_at: string;
  restored_by?: string | null;
  restored_at?: string | null;
  restore_reason?: string | null;
}

export interface ContactRecord {
  id: string;
  name: string;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  fax?: string | null;
  note?: string | null;
  is_enabled: boolean;
}


export type AnnouncementPageName = '總覽' | '居留案件登記' | '居留證繳費';

export interface AnnouncementItem {
  id: string;
  title: string;
  content: string;
  icon?: string | null;
  is_enabled: boolean;
  is_pinned: boolean;
  display_pages: AnnouncementPageName[];
  start_date?: string | null;
  end_date?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface ArcSetting {
  id: string;
  setting_group: string;
  setting_key: string;
  setting_value: Record<string, unknown>;
  is_enabled: boolean;
}

export interface ArcData {
  profiles: Profile[];
  people: PersonOption[];
  brokers: BrokerCompany[];
  accounts: BankAccount[];
  applicationItems: ApplicationItem[];
  feeSettings: FeeSetting[];
  cases: ArcCase[];
  batches: PaymentBatch[];
  batchItems: PaymentBatchItem[];
  accountTransactions: AccountTransaction[];
  faxPickupItems: FaxPickupItem[];
  pickupRecords: PickupRecord[];
  pickupRecordItems: PickupRecordItem[];
  auditLogs: AuditLog[];
  deletedRecords: DeletedRecord[];
  serviceStations: ContactRecord[];
  taskForces: ContactRecord[];
  settings: ArcSetting[];
  announcements: AnnouncementItem[];
}

export interface RegisterCaseInput {
  handler_name: string;
  broker_id: string;
  employer_name: string;
  worker_name: string;
  entry_date?: string | null;
  application_date: string;
  group_no?: string | null;
  application_item_id: string;
  amount: number;
}

export interface BatchCaseRow {
  handler_name: string;
  broker_id: string;
  employer_name: string;
  worker_name: string;
  entry_date: string;
  application_date: string;
  group_no: string;
  application_item_id: string;
  amount: string;
  error?: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
}
