import { supabase } from '../lib/supabase';
import type {
  AccountTransaction,
  AnnouncementItem,
  ApplicationItem,
  ArcCase,
  ArcData,
  AuditLog,
  BankAccount,
  BatchStatus,
  BrokerCompany,
  ContactRecord,
  DeletedRecord,
  FaxPickupItem,
  FeeSetting,
  PaymentBatch,
  PaymentBatchItem,
  PersonOption,
  PickupRecord,
  PickupRecordItem,
  Profile,
  RegisterCaseInput
} from '../types';
import { nextAvailablePickupDay, todayTaipei } from '../utils/date';

export const emptyArcData: ArcData = {
  profiles: [],
  people: [],
  brokers: [],
  accounts: [],
  applicationItems: [],
  feeSettings: [],
  cases: [],
  batches: [],
  batchItems: [],
  accountTransactions: [],
  faxPickupItems: [],
  pickupRecords: [],
  pickupRecordItems: [],
  auditLogs: [],
  deletedRecords: [],
  serviceStations: [],
  taskForces: [],
  settings: [],
  announcements: []
};

async function selectAll<T>(table: string, order = 'created_at', ascending = false): Promise<T[]> {
  const { data, error } = await supabase.from(table).select('*').order(order, { ascending });
  if (error) throw error;
  return (data ?? []) as T[];
}

async function selectOptional<T>(table: string, order = 'created_at', ascending = false): Promise<T[]> {
  const { data, error } = await supabase.from(table).select('*').order(order, { ascending });
  if (error) {
    const message = `${error.message ?? ''} ${error.code ?? ''}`;
    if (message.includes('does not exist') || message.includes('PGRST205') || message.includes('42P01')) return [];
    throw error;
  }
  return (data ?? []) as T[];
}

export async function loadArcData(): Promise<ArcData> {
  const [
    profiles,
    people,
    brokers,
    accounts,
    applicationItems,
    feeSettings,
    cases,
    batches,
    batchItems,
    accountTransactions,
    faxPickupItems,
    pickupRecords,
    pickupRecordItems,
    auditLogs,
    deletedRecords,
    serviceStations,
    taskForces,
    settings,
    announcements
  ] = await Promise.all([
    selectAll<Profile>('profiles', 'display_name', true),
    selectAll<PersonOption>('person_options', 'name', true),
    selectAll<BrokerCompany>('broker_companies', 'code', true),
    selectAll<BankAccount>('bank_accounts', 'account_name', true),
    selectAll<ApplicationItem>('application_items', 'sort_order', true),
    selectAll<FeeSetting>('fee_settings', 'fee_name', true),
    selectAll<ArcCase>('arc_cases', 'created_at', false),
    selectAll<PaymentBatch>('payment_batches', 'created_at', false),
    selectAll<PaymentBatchItem>('payment_batch_items', 'created_at', false),
    selectAll<AccountTransaction>('account_transactions', 'created_at', false),
    selectAll<FaxPickupItem>('fax_pickup_items', 'created_at', false),
    selectAll<PickupRecord>('pickup_records', 'created_at', false),
    selectAll<PickupRecordItem>('pickup_record_items', 'created_at', false),
    selectAll<AuditLog>('audit_logs', 'created_at', false),
    selectAll<DeletedRecord>('deleted_records', 'deleted_at', false),
    selectAll<ContactRecord>('immigration_service_stations', 'name', true),
    selectAll<ContactRecord>('task_force_contacts', 'name', true),
    selectAll('arc_settings', 'setting_group', true),
    selectOptional<AnnouncementItem>('announcement_items', 'created_at', false)
  ]);
  return {
    profiles: profiles.filter((item) => !item.deleted_at),
    people,
    brokers,
    accounts,
    applicationItems,
    feeSettings,
    cases,
    batches,
    batchItems,
    accountTransactions,
    faxPickupItems,
    pickupRecords,
    pickupRecordItems,
    auditLogs,
    deletedRecords,
    serviceStations,
    taskForces,
    settings: (settings as { is_enabled?: boolean }[]).filter((item) => item.is_enabled !== false) as never,
    announcements: announcements as AnnouncementItem[]
  };
}


async function rpcOrFallback<T>(rpcName: string, args: Record<string, unknown>, fallback: () => Promise<T>): Promise<T> {
  const { data, error } = await supabase.rpc(rpcName, args);
  if (!error) return data as T;
  const message = `${error.message ?? ''} ${error.code ?? ''}`;
  if (message.includes('does not exist') || message.includes('Could not find') || message.includes('PGRST202') || message.includes('42883')) {
    return fallback();
  }
  throw error;
}

export async function addAudit(params: {
  action_type: string;
  actor_id?: string;
  actor_name?: string;
  page_name?: string;
  record_table?: string;
  record_id?: string;
  old_data?: unknown;
  new_data?: unknown;
  reason?: string;
}) {
  const { error } = await supabase.from('audit_logs').insert(params);
  if (error) console.error('audit log failed', error);
}

export function statusForNewCase(input: RegisterCaseInput, item: ApplicationItem | undefined): ArcCase['status'] {
  if (!item) return 'pending_payment';
  if (item.name === '重入境許可') return 'archive_registered';
  if (!item.requires_payment && item.enters_fax_pickup) return 'pending_pickup';
  if (!item.requires_payment && !item.enters_fax_pickup) return 'archive_registered';
  return 'pending_payment';
}

export function statusAfterPayment(item: ApplicationItem | undefined): ArcCase['status'] {
  if (!item) return 'paid';
  if (item.enters_fax_pickup) return 'pending_pickup';
  return 'archive_paid';
}

export async function createCases(
  inputs: RegisterCaseInput[],
  data: ArcData,
  actor: Profile | null,
  options: { forceStatus?: ArcCase['status']; note?: string; auditAction?: string } = {}
): Promise<ArcCase[]> {
  const rows: Partial<ArcCase>[] = [];
  for (const input of inputs) {
    const broker = data.brokers.find((item) => item.id === input.broker_id);
    const appItem = data.applicationItems.find((item) => item.id === input.application_item_id);
    if (!broker) throw new Error('找不到仲介設定，無法產生案件編號。');
    const { data: caseNo, error } = await supabase.rpc('next_case_no', {
      p_broker_code: broker.code,
      p_application_date: input.application_date
    });
    if (error) throw error;
    rows.push({
      case_no: caseNo as string,
      ...input,
      status: options.forceStatus ?? statusForNewCase(input, appItem),
      note: options.note ?? undefined,
      created_by: actor?.id,
      updated_by: actor?.id
    });
  }
  const { data: inserted, error } = await supabase.from('arc_cases').insert(rows).select('*');
  if (error) throw error;
  await addAudit({
    action_type: options.auditAction ?? (inputs.length > 1 ? '批次新增案件' : '新增案件'),
    actor_id: actor?.id,
    actor_name: actor?.display_name,
    page_name: '居留案件登記',
    record_table: 'arc_cases',
    new_data: inserted
  });
  return inserted as ArcCase[];
}

export async function cancelCasePayment(caseRow: ArcCase, reason: string, actor: Profile | null) {
  const patch = {
    status: 'cancelled',
    cancelled_reason: reason,
    cancelled_by: actor?.id,
    cancelled_at: new Date().toISOString(),
    updated_by: actor?.id
  };
  const { error } = await supabase.from('arc_cases').update(patch).eq('id', caseRow.id);
  if (error) throw error;
  await addAudit({
    action_type: '取消繳費',
    actor_id: actor?.id,
    actor_name: actor?.display_name,
    page_name: '居留證繳費',
    record_table: 'arc_cases',
    record_id: caseRow.id,
    old_data: caseRow,
    new_data: patch,
    reason
  });
}

export async function restoreCaseToPayment(caseRow: ArcCase, reason: string, actor: Profile | null) {
  const patch = {
    status: 'pending_payment',
    cancelled_reason: null,
    cancelled_by: null,
    cancelled_at: null,
    updated_by: actor?.id
  };
  const { error } = await supabase.from('arc_cases').update(patch).eq('id', caseRow.id);
  if (error) throw error;
  await addAudit({
    action_type: '恢復待繳',
    actor_id: actor?.id,
    actor_name: actor?.display_name,
    page_name: '居留證繳費',
    record_table: 'arc_cases',
    record_id: caseRow.id,
    old_data: caseRow,
    new_data: patch,
    reason
  });
}

function assertCanChangePendingPayment(caseRow: ArcCase, actor: Profile | null, actionName: string) {
  if (!actor) throw new Error('請先登入。');
  if (caseRow.status !== 'pending_payment' || caseRow.payment_batch_id || caseRow.payment_account_id) {
    if (actor.role === 'staff') {
      throw new Error(`行政不可直接${actionName}已完成扣款的金額或資料。`);
    }
    throw new Error(`已完成扣款的案件不可直接${actionName}，請改用財務沖正或補差額流程。`);
  }
}

export async function updatePendingPaymentAmount(caseRow: ArcCase, nextAmount: number, actor: Profile | null) {
  assertCanChangePendingPayment(caseRow, actor, '修改');
  if (!Number.isFinite(nextAmount) || nextAmount < 0) throw new Error('金額格式不正確，請重新輸入。');
  const beforeAmount = Number(caseRow.amount ?? 0);
  if (beforeAmount === nextAmount) return;
  const patch = { amount: nextAmount, updated_by: actor?.id };
  const { error } = await supabase.from('arc_cases').update(patch).eq('id', caseRow.id);
  if (error) throw error;
  await addAudit({
    action_type: '待繳金額修改',
    actor_id: actor?.id,
    actor_name: actor?.display_name,
    page_name: '居留證繳費',
    record_table: 'arc_cases',
    record_id: caseRow.id,
    old_data: { 案件編號: caseRow.case_no, 原金額: beforeAmount, 案件: caseRow },
    new_data: { 案件編號: caseRow.case_no, 修改後金額: nextAmount },
    reason: '居留證繳費頁修改待繳金額'
  });
}

export async function removeCaseFromPayment(caseRow: ArcCase, actor: Profile | null) {
  assertAdmin(actor);
  assertCanChangePendingPayment(caseRow, actor, '刪除');
  const patch = {
    status: 'removed_from_payment' as ArcCase['status'],
    note: [caseRow.note, '已從繳費頁移除'].filter(Boolean).join('｜'),
    updated_by: actor?.id
  };
  const { error } = await supabase.from('arc_cases').update(patch).eq('id', caseRow.id);
  if (error) throw error;
  await addAudit({
    action_type: '刪除待繳案件',
    actor_id: actor?.id,
    actor_name: actor?.display_name,
    page_name: '居留證繳費',
    record_table: 'arc_cases',
    record_id: caseRow.id,
    old_data: {
      案件編號: caseRow.case_no,
      雇主: caseRow.employer_name,
      工人: caseRow.worker_name,
      申請項目: caseRow.application_item_id,
      原金額: caseRow.amount,
      原始資料: caseRow
    },
    new_data: patch,
    reason: '管理員從居留證繳費頁移除待繳案件，案件主資料保留於案件查詢。'
  });
}

export async function createPaymentBatch(params: {
  caseIds: string[];
  brokerId: string;
  accountId: string;
  paymentDate: string;
  payerName: string;
  data: ArcData;
  actor: Profile | null;
  amountOverrides?: Record<string, number>;
}) {
  const { caseIds, brokerId, accountId, paymentDate, payerName, data, actor, amountOverrides = {} } = params;
  const selectedCases = data.cases.filter((item) => caseIds.includes(item.id));
  if (!selectedCases.length) throw new Error('請先選擇待繳案件。');
  if (selectedCases.some((item) => item.status !== 'pending_payment' || item.payment_batch_id || item.payment_account_id)) {
    throw new Error('已扣款或非待繳案件不可直接建立扣款，請重新整理後再試。');
  }
  if (selectedCases.some((item) => item.broker_id !== brokerId)) throw new Error('同一批繳費只能選同一仲介。');
  const broker = data.brokers.find((item) => item.id === brokerId);
  const account = data.accounts.find((item) => item.id === accountId && item.is_enabled && item.broker_id === brokerId);
  if (!broker) throw new Error('請確認仲介設定。');
  if (!account) throw new Error('請選擇該仲介的啟用扣款帳號。');

  const selectedPaymentRows = selectedCases.map((caseRow) => {
    const amount = Number(amountOverrides[caseRow.id] ?? caseRow.amount ?? 0);
    if (!Number.isFinite(amount) || amount < 0) throw new Error('金額格式不正確，請重新輸入。');
    return { caseRow, amount };
  });
  const total = selectedPaymentRows.reduce((sum, item) => sum + item.amount, 0);

  const { data: batchNo, error: rpcError } = await supabase.rpc('next_payment_batch_no', {
    p_broker_code: broker.code,
    p_payment_date: paymentDate
  });
  if (rpcError) throw rpcError;
  const { data: batch, error: batchError } = await supabase.from('payment_batches').insert({
    batch_no: batchNo,
    broker_id: brokerId,
    account_id: accountId,
    payment_date: paymentDate,
    payer_name: payerName,
    total_amount: total,
    case_count: selectedCases.length,
    status: 'pending',
    created_by: actor?.id,
    updated_by: actor?.id
  }).select('*').single();
  if (batchError) throw batchError;

  const itemRows = selectedPaymentRows.map(({ caseRow, amount }) => ({
    batch_id: batch.id,
    case_id: caseRow.id,
    original_application_item_id: caseRow.application_item_id,
    original_amount: amount
  }));
  const { error: itemsError } = await supabase.from('payment_batch_items').insert(itemRows);
  if (itemsError) throw itemsError;

  for (const { caseRow, amount } of selectedPaymentRows) {
    const appItem = data.applicationItems.find((item) => item.id === caseRow.application_item_id);
    if (Number(caseRow.amount ?? 0) !== amount) {
      await addAudit({
        action_type: '待繳金額修改',
        actor_id: actor?.id,
        actor_name: actor?.display_name,
        page_name: '居留證繳費',
        record_table: 'arc_cases',
        record_id: caseRow.id,
        old_data: { 案件編號: caseRow.case_no, 原金額: caseRow.amount },
        new_data: { 案件編號: caseRow.case_no, 修改後金額: amount },
        reason: `建立繳費批次 ${batch.batch_no} 前同步本次扣款金額`
      });
    }
    await supabase.from('arc_cases').update({
      amount,
      status: statusAfterPayment(appItem),
      payment_batch_id: batch.id,
      payment_date: paymentDate,
      payment_account_id: accountId,
      updated_by: actor?.id
    }).eq('id', caseRow.id);
  }

  const before = Number(account.current_balance ?? 0);
  const after = before - total;
  const { error: accountError } = await supabase.from('bank_accounts').update({ current_balance: after, updated_by: actor?.id }).eq('id', accountId);
  if (accountError) throw accountError;
  const { error: txnError } = await supabase.from('account_transactions').insert({
    account_id: accountId,
    txn_type: 'debit_payment_batch',
    amount: -total,
    balance_before: before,
    balance_after: after,
    ref_table: 'payment_batches',
    ref_id: batch.id,
    reason: `居留證繳費批次 ${batch.batch_no}`,
    created_by: actor?.id
  });
  if (txnError) throw txnError;

  await addAudit({
    action_type: '新增繳費批次',
    actor_id: actor?.id,
    actor_name: actor?.display_name,
    page_name: '居留證繳費',
    record_table: 'payment_batches',
    record_id: batch.id,
    new_data: {
      batch,
      items: selectedPaymentRows.map(({ caseRow, amount }) => ({
        案件編號: caseRow.case_no,
        仲介: broker.name,
        扣款帳戶: account.account_name,
        帳號後五碼: account.account_last5 ?? account.account_no.slice(-5),
        扣款前餘額: before,
        扣款金額: amount,
        批次扣款後餘額: after,
        caseRow
      }))
    }
  });
  return batch as PaymentBatch;
}

export async function confirmPaymentBatch(batch: PaymentBatch, actor: Profile | null) {
  const patch = { status: 'confirmed', confirmed_by: actor?.id, confirmed_at: new Date().toISOString(), updated_by: actor?.id };
  const { error } = await supabase.from('payment_batches').update(patch).eq('id', batch.id);
  if (error) throw error;
  await addAudit({
    action_type: '會計確認',
    actor_id: actor?.id,
    actor_name: actor?.display_name,
    page_name: '財務對帳確認',
    record_table: 'payment_batches',
    record_id: batch.id,
    old_data: {
      繳費批次編號: batch.batch_no,
      原狀態: batch.status,
      批次案件數: batch.case_count,
      批次總金額: batch.total_amount,
      原始資料: batch
    },
    new_data: {
      繳費批次編號: batch.batch_no,
      新狀態: '對帳完成',
      對帳確認人: actor?.display_name,
      對帳完成時間: patch.confirmed_at,
      批次案件數: batch.case_count,
      批次總金額: batch.total_amount,
      更新資料: patch
    },
    reason: '財務對帳完成後，同一筆繳費批次轉入財務查詢。'
  });
}


export async function updatePaymentBatchDate(params: {
  batch: PaymentBatch;
  nextPaymentDate: string;
  actor: Profile | null;
}) {
  const { batch, nextPaymentDate, actor } = params;
  if (!actor || !['admin', 'finance', 'staff'].includes(actor.role)) throw new Error('您沒有修改繳費日期的權限。');
  if (batch.status === 'confirmed') throw new Error('已對帳完成的批次不可在財務對帳確認修改繳費日期。');
  if (batch.payment_date === nextPaymentDate) return;
  const patch = { payment_date: nextPaymentDate, updated_by: actor?.id };
  const { error } = await supabase.from('payment_batches').update(patch).eq('id', batch.id);
  if (error) throw error;
  const { error: caseError } = await supabase.from('arc_cases').update({ payment_date: nextPaymentDate, updated_by: actor?.id }).eq('payment_batch_id', batch.id);
  if (caseError) throw caseError;
  await addAudit({
    action_type: '財務批次繳費日期修改',
    actor_id: actor?.id,
    actor_name: actor?.display_name,
    page_name: '財務對帳確認',
    record_table: 'payment_batches',
    record_id: batch.id,
    old_data: { 繳費批次編號: batch.batch_no, 原繳費日期: batch.payment_date, 原始資料: batch },
    new_data: { 繳費批次編號: batch.batch_no, 修改後繳費日期: nextPaymentDate, 更新資料: patch },
    reason: '異動來源：財務對帳確認。修改整個繳費批次日期並同步批次內案件繳費日期。'
  });
}

export async function adjustFinanceConfirmAccountBalance(params: {
  batch?: PaymentBatch | null;
  account: BankAccount;
  nextBalance: number;
  reason: string;
  actor: Profile | null;
}) {
  const { batch, account, nextBalance, reason, actor } = params;
  if (!actor || !['admin', 'finance', 'staff'].includes(actor.role)) throw new Error('您沒有修改帳戶餘額的權限。');
  if (!Number.isFinite(nextBalance)) throw new Error('修改後餘額必須為有效數字。');
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error('請輸入餘額調整原因。');
  const before = Number(account.current_balance ?? 0);
  const delta = nextBalance - before;
  if (delta === 0) throw new Error('修改後餘額與目前餘額相同，無需調整。');
  const { error } = await supabase.from('bank_accounts').update({ current_balance: nextBalance, updated_by: actor?.id }).eq('id', account.id);
  if (error) throw error;
  const { error: txnError } = await supabase.from('account_transactions').insert({
    account_id: account.id,
    txn_type: 'finance_confirm_balance_adjustment',
    amount: delta,
    balance_before: before,
    balance_after: nextBalance,
    ref_table: batch ? 'payment_batches' : 'bank_accounts',
    ref_id: batch?.id ?? account.id,
    reason: cleanReason,
    created_by: actor?.id
  });
  if (txnError) throw txnError;
  const common = {
    異動類型: '手動調整餘額',
    繳費批次編號: batch?.batch_no ?? null,
    帳戶名稱: account.account_name,
    修改人: actor?.display_name,
    異動來源: '財務對帳確認'
  };
  await addAudit({
    action_type: '手動調整餘額',
    actor_id: actor?.id,
    actor_name: actor?.display_name,
    page_name: '財務對帳確認',
    record_table: 'bank_accounts',
    record_id: account.id,
    old_data: {
      ...common,
      修改前餘額: before
    },
    new_data: {
      ...common,
      修改後餘額: nextBalance,
      差額: delta,
      調整原因: cleanReason,
      修改時間: new Date().toISOString()
    },
    reason: cleanReason
  });
}

export async function correctPaymentItem(params: {
  batch: PaymentBatch;
  item: PaymentBatchItem;
  caseRow: ArcCase;
  correctedApplicationItemId: string;
  correctedAmount: number;
  reason: string;
  actor: Profile | null;
}) {
  const { batch, item, caseRow, correctedApplicationItemId, correctedAmount, reason, actor } = params;
  const patch = {
    corrected_application_item_id: correctedApplicationItemId,
    corrected_amount: correctedAmount,
    correction_reason: reason,
    corrected_by: actor?.id,
    corrected_at: new Date().toISOString()
  };
  const { error } = await supabase.from('payment_batch_items').update(patch).eq('id', item.id);
  if (error) throw error;
  const { error: caseError } = await supabase.from('arc_cases').update({
    application_item_id: correctedApplicationItemId,
    amount: correctedAmount,
    updated_by: actor?.id
  }).eq('id', caseRow.id);
  if (caseError) throw caseError;
  const { data: latestBatchItems, error: latestItemsError } = await supabase
    .from('payment_batch_items')
    .select('*')
    .eq('batch_id', batch.id);
  if (latestItemsError) throw latestItemsError;
  const recalculatedTotal = (latestBatchItems ?? []).reduce((sum: number, row: PaymentBatchItem) => {
    if (row.id === item.id) return sum + correctedAmount;
    return sum + Number(row.corrected_amount ?? row.original_amount ?? 0);
  }, 0);
  const { error: batchError } = await supabase.from('payment_batches').update({
    status: 'pending',
    total_amount: recalculatedTotal,
    updated_by: actor?.id
  }).eq('id', batch.id);
  if (batchError) throw batchError;
  await addAudit({
    action_type: '金額修正',
    actor_id: actor?.id,
    actor_name: actor?.display_name,
    page_name: '財務對帳確認',
    record_table: 'payment_batch_items',
    record_id: item.id,
    old_data: {
      批次編號: batch.batch_no,
      案件編號: caseRow.case_no,
      原申請項目: item.original_application_item_id ?? caseRow.application_item_id,
      原金額: item.corrected_amount ?? caseRow.amount ?? item.original_amount,
      original_application_item_id: item.original_application_item_id,
      original_amount: item.original_amount,
      case_application_item_id: caseRow.application_item_id,
      case_amount: caseRow.amount
    },
    new_data: patch,
    reason
  });
}

export async function updateFinanceDetailCase(params: {
  batch: PaymentBatch;
  item: PaymentBatchItem;
  caseRow: ArcCase;
  patch: {
    employer_name: string;
    worker_name: string;
    group_no?: string | null;
    entry_date?: string | null;
    application_date: string;
    application_item_id: string;
    amount: number;
  };
  reason: string;
  actor: Profile | null;
  pageName?: string;
}) {
  const { batch, item, caseRow, patch, reason, actor, pageName = '財務對帳確認' } = params;
  if (!actor || !['admin', 'finance', 'staff'].includes(actor.role)) throw new Error('您沒有修改明細資料的權限。');
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error('請輸入修正原因。');
  const nextCasePatch = {
    employer_name: patch.employer_name.trim(),
    worker_name: patch.worker_name.trim(),
    group_no: patch.group_no?.trim() || null,
    entry_date: patch.entry_date || null,
    application_date: patch.application_date,
    application_item_id: patch.application_item_id,
    amount: patch.amount,
    updated_by: actor.id
  };
  if (!nextCasePatch.employer_name) throw new Error('雇主不可空白。');
  if (!nextCasePatch.worker_name) throw new Error('工人不可空白。');
  if (!nextCasePatch.application_date) throw new Error('申請日格式不正確，請重新輸入。');
  if (!nextCasePatch.application_item_id) throw new Error('請選擇申請項目。');
  if (!Number.isFinite(nextCasePatch.amount) || nextCasePatch.amount < 0) throw new Error('金額格式不正確，請重新輸入。');

  const currentApplicationItemId = item.corrected_application_item_id ?? caseRow.application_item_id;
  const currentAmount = Number(item.corrected_amount ?? item.original_amount ?? caseRow.amount ?? 0);
  const caseChanged =
    caseRow.employer_name !== nextCasePatch.employer_name ||
    caseRow.worker_name !== nextCasePatch.worker_name ||
    (caseRow.group_no ?? null) !== nextCasePatch.group_no ||
    (caseRow.entry_date ?? null) !== nextCasePatch.entry_date ||
    caseRow.application_date !== nextCasePatch.application_date ||
    caseRow.application_item_id !== nextCasePatch.application_item_id ||
    Number(caseRow.amount ?? 0) !== nextCasePatch.amount;
  const itemChanged = currentApplicationItemId !== nextCasePatch.application_item_id || currentAmount !== nextCasePatch.amount;
  if (!caseChanged && !itemChanged) return;

  const changedFields: string[] = [];
  if (caseRow.employer_name !== nextCasePatch.employer_name) changedFields.push(`雇主：${caseRow.employer_name || '空白'} → ${nextCasePatch.employer_name}`);
  if (caseRow.worker_name !== nextCasePatch.worker_name) changedFields.push(`工人：${caseRow.worker_name || '空白'} → ${nextCasePatch.worker_name}`);
  if ((caseRow.group_no ?? '') !== (nextCasePatch.group_no ?? '')) changedFields.push(`團號：${caseRow.group_no || '空白'} → ${nextCasePatch.group_no || '空白'}`);
  if ((caseRow.entry_date ?? '') !== (nextCasePatch.entry_date ?? '')) changedFields.push(`入境日：${caseRow.entry_date || '空白'} → ${nextCasePatch.entry_date || '空白'}`);
  if (caseRow.application_date !== nextCasePatch.application_date) changedFields.push(`申請日：${caseRow.application_date || '空白'} → ${nextCasePatch.application_date}`);
  if (currentApplicationItemId !== nextCasePatch.application_item_id) changedFields.push('申請項目：已調整');
  if (currentAmount !== nextCasePatch.amount) changedFields.push(`項目金額：${currentAmount} → ${nextCasePatch.amount}`);

  const { error: caseError } = await supabase.from('arc_cases').update(nextCasePatch).eq('id', caseRow.id);
  if (caseError) throw caseError;

  let itemPatch: Record<string, unknown> | null = null;
  if (itemChanged) {
    itemPatch = {
      corrected_application_item_id: nextCasePatch.application_item_id,
      corrected_amount: nextCasePatch.amount,
      correction_reason: cleanReason,
      corrected_by: actor.id,
      corrected_at: new Date().toISOString()
    };
    const { error: itemError } = await supabase.from('payment_batch_items').update(itemPatch).eq('id', item.id);
    if (itemError) throw itemError;

    const { data: latestBatchItems, error: latestItemsError } = await supabase
      .from('payment_batch_items')
      .select('*')
      .eq('batch_id', batch.id);
    if (latestItemsError) throw latestItemsError;
    const recalculatedTotal = (latestBatchItems ?? []).reduce((sum: number, row: PaymentBatchItem) => {
      if (row.id === item.id) return sum + nextCasePatch.amount;
      return sum + Number(row.corrected_amount ?? row.original_amount ?? 0);
    }, 0);
    const batchPatch: Record<string, unknown> = { total_amount: recalculatedTotal, updated_by: actor.id };
    if (batch.status !== 'confirmed') batchPatch.status = 'pending';
    const { error: batchError } = await supabase.from('payment_batches').update(batchPatch).eq('id', batch.id);
    if (batchError) throw batchError;
  }

  await addAudit({
    action_type: '財務明細資料修改',
    actor_id: actor.id,
    actor_name: actor.display_name,
    page_name: pageName,
    record_table: 'arc_cases',
    record_id: caseRow.id,
    old_data: {
      繳費批次編號: batch.batch_no,
      案件編號: caseRow.case_no,
      雇主: caseRow.employer_name,
      工人: caseRow.worker_name,
      團號: caseRow.group_no,
      入境日: caseRow.entry_date,
      申請日: caseRow.application_date,
      申請項目: currentApplicationItemId,
      項目金額: currentAmount,
      原始案件: caseRow,
      原始批次項目: item
    },
    new_data: {
      繳費批次編號: batch.batch_no,
      案件編號: caseRow.case_no,
      雇主: nextCasePatch.employer_name,
      工人: nextCasePatch.worker_name,
      團號: nextCasePatch.group_no,
      入境日: nextCasePatch.entry_date,
      申請日: nextCasePatch.application_date,
      申請項目: nextCasePatch.application_item_id,
      項目金額: nextCasePatch.amount,
      異動摘要: changedFields.join('；'),
      更新案件: nextCasePatch,
      更新批次項目: itemPatch
    },
    reason: cleanReason
  });
}


async function recalculatePaymentBatch(batchId: string, actor: Profile | null) {
  const { data: latestBatchItems, error: latestItemsError } = await supabase
    .from('payment_batch_items')
    .select('*')
    .eq('batch_id', batchId);
  if (latestItemsError) throw latestItemsError;
  const rows = (latestBatchItems ?? []) as PaymentBatchItem[];
  const total = rows.reduce((sum, row) => sum + Number(row.corrected_amount ?? row.original_amount ?? 0), 0);
  const { error: batchError } = await supabase.from('payment_batches').update({
    total_amount: total,
    case_count: rows.length,
    updated_by: actor?.id
  }).eq('id', batchId);
  if (batchError) throw batchError;
  return { total, count: rows.length };
}

export async function addCasesToPaymentBatch(params: {
  batch: PaymentBatch;
  caseIds: string[];
  data: ArcData;
  actor: Profile | null;
}) {
  const { batch, caseIds, data, actor } = params;
  if (!actor || !['admin', 'finance', 'staff'].includes(actor.role)) throw new Error('您沒有新增案件至批次的權限。');
  if (batch.status === 'confirmed') throw new Error('已對帳完成的批次不可新增案件。');
  const uniqueCaseIds = Array.from(new Set(caseIds));
  if (!uniqueCaseIds.length) throw new Error('請先選擇要加入批次的待繳案件。');
  const existingCaseIds = new Set(data.batchItems.filter((item) => item.batch_id === batch.id).map((item) => item.case_id));
  const selectedCases = data.cases.filter((caseRow) => uniqueCaseIds.includes(caseRow.id));
  if (selectedCases.length !== uniqueCaseIds.length) throw new Error('部分案件不存在，請重新整理後再試。');
  if (selectedCases.some((caseRow) => existingCaseIds.has(caseRow.id))) throw new Error('不可將同一案件重複加入同一批次。');
  if (selectedCases.some((caseRow) => caseRow.broker_id !== batch.broker_id)) throw new Error('不可將不同仲介案件加入同一繳費批次。');
  if (selectedCases.some((caseRow) => caseRow.status !== 'pending_payment' || caseRow.payment_batch_id || caseRow.payment_account_id)) {
    throw new Error('只能加入居留證繳費待繳區中的案件。');
  }

  const itemRows = selectedCases.map((caseRow) => ({
    batch_id: batch.id,
    case_id: caseRow.id,
    original_application_item_id: caseRow.application_item_id,
    original_amount: Number(caseRow.amount ?? 0)
  }));
  const { error: insertError } = await supabase.from('payment_batch_items').insert(itemRows);
  if (insertError) throw insertError;

  for (const caseRow of selectedCases) {
    const appItem = data.applicationItems.find((item) => item.id === caseRow.application_item_id);
    const { error: caseError } = await supabase.from('arc_cases').update({
      status: statusAfterPayment(appItem),
      payment_batch_id: batch.id,
      payment_date: batch.payment_date,
      payment_account_id: batch.account_id,
      updated_by: actor.id
    }).eq('id', caseRow.id);
    if (caseError) throw caseError;
  }

  const addTotal = selectedCases.reduce((sum, caseRow) => sum + Number(caseRow.amount ?? 0), 0);
  const account = data.accounts.find((item) => item.id === batch.account_id);
  if (account && addTotal) {
    const before = Number(account.current_balance ?? 0);
    const after = before - addTotal;
    const { error: accountError } = await supabase.from('bank_accounts').update({ current_balance: after, updated_by: actor.id }).eq('id', account.id);
    if (accountError) throw accountError;
    const { error: txnError } = await supabase.from('account_transactions').insert({
      account_id: account.id,
      txn_type: 'debit_add_cases_to_batch',
      amount: -addTotal,
      balance_before: before,
      balance_after: after,
      ref_table: 'payment_batches',
      ref_id: batch.id,
      reason: `新增案件至繳費批次 ${batch.batch_no}`,
      created_by: actor.id
    });
    if (txnError) throw txnError;
  }

  const recalculated = await recalculatePaymentBatch(batch.id, actor);
  await addAudit({
    action_type: '新增案件至繳費批次',
    actor_id: actor.id,
    actor_name: actor.display_name,
    page_name: '財務對帳確認',
    record_table: 'payment_batches',
    record_id: batch.id,
    old_data: { 繳費批次編號: batch.batch_no, 原件數: batch.case_count, 原總金額: batch.total_amount },
    new_data: {
      繳費批次編號: batch.batch_no,
      加入案件: selectedCases.map((caseRow) => ({
        案件編號: caseRow.case_no,
        雇主: caseRow.employer_name,
        工人: caseRow.worker_name,
        申請項目: caseRow.application_item_id,
        金額: caseRow.amount
      })),
      新件數: recalculated.count,
      新總金額: recalculated.total
    },
    reason: '從居留證繳費待繳區加入目前繳費批次。'
  });
}

export async function removePaymentBatchItem(params: {
  batch: PaymentBatch;
  item: PaymentBatchItem;
  caseRow: ArcCase;
  data: ArcData;
  actor: Profile | null;
}) {
  const { batch, item, caseRow, data, actor } = params;
  if (!actor || !['admin', 'finance', 'staff'].includes(actor.role)) throw new Error('您沒有移除批次案件的權限。');
  if (batch.status === 'confirmed') throw new Error('已對帳完成的批次不可移除案件。');
  const itemAmount = Number(item.corrected_amount ?? item.original_amount ?? caseRow.amount ?? 0);
  const nextApplicationItemId = item.corrected_application_item_id ?? caseRow.application_item_id;

  const { error: itemError } = await supabase.from('payment_batch_items').delete().eq('id', item.id);
  if (itemError) throw itemError;

  const { error: caseError } = await supabase.from('arc_cases').update({
    status: 'pending_payment',
    application_item_id: nextApplicationItemId,
    amount: itemAmount,
    payment_batch_id: null,
    payment_date: null,
    payment_account_id: null,
    updated_by: actor.id
  }).eq('id', caseRow.id);
  if (caseError) throw caseError;

  const account = data.accounts.find((accountRow) => accountRow.id === batch.account_id);
  if (account && itemAmount) {
    const before = Number(account.current_balance ?? 0);
    const after = before + itemAmount;
    const { error: accountError } = await supabase.from('bank_accounts').update({ current_balance: after, updated_by: actor.id }).eq('id', account.id);
    if (accountError) throw accountError;
    const { error: txnError } = await supabase.from('account_transactions').insert({
      account_id: account.id,
      txn_type: 'reverse_remove_case_from_batch',
      amount: itemAmount,
      balance_before: before,
      balance_after: after,
      ref_table: 'payment_batches',
      ref_id: batch.id,
      reason: `案件移出繳費批次 ${batch.batch_no}，回到待繳區`,
      created_by: actor.id
    });
    if (txnError) throw txnError;
  }

  const recalculated = await recalculatePaymentBatch(batch.id, actor);
  await addAudit({
    action_type: '移除繳費批次案件',
    actor_id: actor.id,
    actor_name: actor.display_name,
    page_name: '財務對帳確認',
    record_table: 'payment_batch_items',
    record_id: item.id,
    old_data: {
      批次編號: batch.batch_no,
      移除案件編號: caseRow.case_no,
      雇主: caseRow.employer_name,
      工人: caseRow.worker_name,
      申請項目: nextApplicationItemId,
      金額: itemAmount,
      原批次項目: item
    },
    new_data: { 新件數: recalculated.count, 新總金額: recalculated.total, 流向: '回到居留證繳費待繳區' },
    reason: '移出本繳費批次並回到居留證繳費待繳區。'
  });
}

export async function updateCaseFaxOptions(params: {
  caseRow: ArcCase;
  oldCardChecked?: boolean;
  handlerLast4?: string;
  paymentDate?: string;
  actor: Profile | null;
}) {
  const { caseRow, oldCardChecked, handlerLast4, paymentDate, actor } = params;
  const patch: Partial<ArcCase> & { updated_by?: string } = { updated_by: actor?.id };
  const oldData: Record<string, unknown> = { 案件編號: caseRow.case_no };
  const newData: Record<string, unknown> = { 案件編號: caseRow.case_no };
  if (oldCardChecked !== undefined && oldCardChecked !== caseRow.old_card_checked) {
    patch.old_card_checked = oldCardChecked;
    oldData.原舊卡狀態 = Boolean(caseRow.old_card_checked);
    newData.新舊卡狀態 = oldCardChecked;
  }
  if (handlerLast4 !== undefined) {
    const clean = handlerLast4.trim().replace(/\D/g, '').slice(0, 4);
    if (clean !== (caseRow.handler_last4 ?? '')) {
      patch.handler_last4 = clean;
      oldData.原經手人後四碼 = caseRow.handler_last4 ?? '';
      newData.新經手人後四碼 = clean;
    }
  }
  if (paymentDate !== undefined && paymentDate !== (caseRow.payment_date ?? '')) {
    patch.payment_date = paymentDate;
    oldData.原收費日期 = caseRow.payment_date ?? '';
    newData.修改後收費日期 = paymentDate;
  }
  if (Object.keys(patch).length <= 1) return;
  const { error } = await supabase.from('arc_cases').update(patch).eq('id', caseRow.id);
  if (error) throw error;
  await addAudit({
    action_type: paymentDate !== undefined && oldCardChecked === undefined && handlerLast4 === undefined ? '收費日期修改' : oldCardChecked !== undefined && handlerLast4 === undefined && paymentDate === undefined ? '舊卡狀態修改' : handlerLast4 !== undefined && oldCardChecked === undefined && paymentDate === undefined ? '經手人後四碼修改' : '傳真領件欄位修改',
    actor_id: actor?.id,
    actor_name: actor?.display_name,
    page_name: '傳真/領件',
    record_table: 'arc_cases',
    record_id: caseRow.id,
    old_data: oldData,
    new_data: newData
  });
}


export async function adjustAccountBalance(account: BankAccount, nextBalance: number, reason: string, actor: Profile | null) {
  const before = Number(account.current_balance ?? 0);
  const delta = nextBalance - before;
  const { error } = await supabase.from('bank_accounts').update({ current_balance: nextBalance, updated_by: actor?.id }).eq('id', account.id);
  if (error) throw error;
  const { error: txnError } = await supabase.from('account_transactions').insert({
    account_id: account.id,
    txn_type: 'balance_adjustment',
    amount: delta,
    balance_before: before,
    balance_after: nextBalance,
    reason,
    created_by: actor?.id
  });
  if (txnError) throw txnError;
  await addAudit({
    action_type: '帳戶餘額調整',
    actor_id: actor?.id,
    actor_name: actor?.display_name,
    page_name: '仲介與扣款帳號',
    record_table: 'bank_accounts',
    record_id: account.id,
    old_data: { current_balance: before },
    new_data: { current_balance: nextBalance },
    reason
  });
}

export async function addFaxPickupPlan(params: {
  caseRow: ArcCase;
  receiptNo: string;
  foreignNoLast5: string;
  receiptOrder: number;
  faxDate: string;
  expectedPickupDate: string;
  data: ArcData;
  actor: Profile | null;
  oldCardChecked?: boolean;
  handlerLast4?: string;
  paymentDate?: string;
}) {
  const { caseRow, receiptNo, foreignNoLast5, receiptOrder, faxDate, expectedPickupDate, data, actor, oldCardChecked, handlerLast4, paymentDate } = params;
  const duplicateOrder = data.faxPickupItems.find((item) =>
    item.status === 'pending' &&
    item.expected_pickup_date === expectedPickupDate &&
    Number(item.receipt_order) === Number(receiptOrder) &&
    item.case_id !== caseRow.id
  );
  if (duplicateOrder) {
    const used = Math.max(...data.faxPickupItems
      .filter((item) => item.status === 'pending' && item.expected_pickup_date === expectedPickupDate)
      .map((item) => Number(item.receipt_order || 0)), 0);
    throw new Error(`此領件日已有相同收據順序，請重新輸入。目前此領件日已使用到第 ${used} 號。建議使用第 ${used + 1} 號。`);
  }
  const existing = data.faxPickupItems.find((item) => item.case_id === caseRow.id && item.status === 'pending');
  const payload = {
    case_id: caseRow.id,
    receipt_no: receiptNo,
    foreign_no_last5: foreignNoLast5,
    receipt_order: receiptOrder,
    old_card_checked: oldCardChecked ?? caseRow.old_card_checked ?? false,
    handler_last4: handlerLast4 !== undefined ? handlerLast4.trim().replace(/\D/g, '').slice(0, 4) : (caseRow.handler_last4 ?? null),
    fax_date: faxDate,
    expected_pickup_date: expectedPickupDate,
    status: 'pending',
    updated_by: actor?.id
  };
  if (existing) {
    const { error } = await supabase.from('fax_pickup_items').update(payload).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('fax_pickup_items').insert({ ...payload, created_by: actor?.id });
    if (error) throw error;
  }
  const { error: caseError } = await supabase.from('arc_cases').update({
    receipt_no: receiptNo,
    foreign_no_last5: foreignNoLast5,
    receipt_order: receiptOrder,
    old_card_checked: oldCardChecked ?? caseRow.old_card_checked ?? false,
    handler_last4: handlerLast4 !== undefined ? handlerLast4.trim().replace(/\D/g, '').slice(0, 4) : (caseRow.handler_last4 ?? null),
    payment_date: paymentDate ?? caseRow.payment_date ?? null,
    fax_date: faxDate,
    expected_pickup_date: expectedPickupDate,
    pickup_status: 'pending',
    status: 'pending_pickup',
    updated_by: actor?.id
  }).eq('id', caseRow.id);
  if (caseError) throw caseError;
  await addAudit({
    action_type: '傳真領件紀錄建立',
    actor_id: actor?.id,
    actor_name: actor?.display_name,
    page_name: '傳真/領件',
    record_table: 'fax_pickup_items',
    record_id: existing?.id,
    new_data: payload
  });
}


export async function removeFaxPickupPlan(params: {
  plan: FaxPickupItem;
  caseRow: ArcCase;
  actor: Profile | null;
}) {
  const { plan, caseRow, actor } = params;
  if (!actor || !['admin', 'staff'].includes(actor.role)) throw new Error('您沒有移除預計領件資料的權限。');
  const { error: planError } = await supabase.from('fax_pickup_items').update({
    status: 'cancelled',
    updated_by: actor.id
  }).eq('id', plan.id);
  if (planError) throw planError;
  const { error: caseError } = await supabase.from('arc_cases').update({
    status: 'pending_pickup',
    pickup_status: null,
    receipt_no: plan.receipt_no,
    foreign_no_last5: plan.foreign_no_last5,
    receipt_order: plan.receipt_order,
    old_card_checked: plan.old_card_checked ?? caseRow.old_card_checked ?? false,
    handler_last4: plan.handler_last4 ?? caseRow.handler_last4 ?? null,
    fax_date: plan.fax_date,
    expected_pickup_date: plan.expected_pickup_date,
    updated_by: actor.id
  }).eq('id', caseRow.id);
  if (caseError) throw caseError;
  await addAudit({
    action_type: '預計領件區移除',
    actor_id: actor.id,
    actor_name: actor.display_name,
    page_name: '傳真/領件',
    record_table: 'fax_pickup_items',
    record_id: plan.id,
    old_data: {
      案件編號: caseRow.case_no,
      雇主: caseRow.employer_name,
      工人: caseRow.worker_name,
      團號: caseRow.group_no,
      原領件日: plan.expected_pickup_date,
      原收據順序: plan.receipt_order,
      原預計領件資料: plan
    },
    new_data: {
      狀態: '待加入預計領件',
      流向: '回到移民署傳真領件'
    },
    reason: '從預計領件區移除，案件回到移民署傳真領件待處理區。'
  });
}

export async function createPickupRecord(params: {
  caseIds: string[];
  pickupDate: string;
  data: ArcData;
  actor: Profile | null;
}) {
  const { caseIds, pickupDate, data, actor } = params;
  if (!caseIds.length) throw new Error('請先選擇要領件的案件。');
  let selectedPlans = data.faxPickupItems.filter((item) => caseIds.includes(item.case_id) && item.status === 'pending');
  if (!selectedPlans.length) {
    const { data: freshPlans, error: freshError } = await supabase
      .from('fax_pickup_items')
      .select('*')
      .in('case_id', caseIds)
      .eq('status', 'pending');
    if (freshError) throw freshError;
    selectedPlans = (freshPlans ?? []) as FaxPickupItem[];
  }
  if (!selectedPlans.length) throw new Error('找不到預計領件資料。');
  const { data: recordNo, error: rpcError } = await supabase.rpc('next_pickup_record_no', { p_pickup_date: pickupDate });
  if (rpcError) throw rpcError;
  const { data: record, error } = await supabase.from('pickup_records').insert({
    record_no: recordNo,
    pickup_date: pickupDate,
    created_by: actor?.id,
    created_by_name: actor?.display_name,
    case_count: selectedPlans.length
  }).select('*').single();
  if (error) throw error;
  const recordItems = selectedPlans.map((plan) => ({ record_id: record.id, case_id: plan.case_id, status: 'picked_up' }));
  const { error: itemError } = await supabase.from('pickup_record_items').insert(recordItems);
  if (itemError) throw itemError;
  const planIds = selectedPlans.map((item) => item.id);
  const { error: planError } = await supabase.from('fax_pickup_items').update({ status: 'picked_up', updated_by: actor?.id }).in('id', planIds);
  if (planError) throw planError;
  const { error: caseError } = await supabase.from('arc_cases').update({
    status: 'completed',
    pickup_status: 'picked_up',
    pickup_record_id: record.id,
    updated_by: actor?.id
  }).in('id', caseIds);
  if (caseError) throw caseError;
  await addAudit({
    action_type: caseIds.length === 1 ? '單筆領件' : '批次領件',
    actor_id: actor?.id,
    actor_name: actor?.display_name,
    page_name: '傳真/領件',
    record_table: 'pickup_records',
    record_id: record.id,
    new_data: { record, cases: caseIds }
  });
  return record as PickupRecord;
}

export async function markPickupNotReceived(params: {
  recordItem: PickupRecordItem;
  caseRow: ArcCase;
  data: ArcData;
  actor: Profile | null;
}) {
  const { recordItem, caseRow, data, actor } = params;
  const nextDate = nextAvailablePickupDay(todayTaipei());
  const { error } = await supabase.from('pickup_record_items').update({
    status: 'not_received',
    not_received_at: new Date().toISOString(),
    not_received_by: actor?.id
  }).eq('id', recordItem.id);
  if (error) throw error;
  await supabase.from('arc_cases').update({
    status: 'not_received',
    pickup_status: 'not_received',
    expected_pickup_date: nextDate,
    updated_by: actor?.id
  }).eq('id', caseRow.id);
  const existing = data.faxPickupItems.find((item) => item.case_id === caseRow.id && item.status === 'pending');
  const payload = {
    case_id: caseRow.id,
    receipt_no: caseRow.receipt_no ?? '',
    foreign_no_last5: caseRow.foreign_no_last5 ?? '',
    receipt_order: caseRow.receipt_order ?? 0,
    old_card_checked: caseRow.old_card_checked ?? false,
    handler_last4: caseRow.handler_last4 ?? null,
    fax_date: caseRow.fax_date ?? todayTaipei(),
    expected_pickup_date: nextDate,
    status: 'pending',
    updated_by: actor?.id
  };
  if (existing) await supabase.from('fax_pickup_items').update(payload).eq('id', existing.id);
  else await supabase.from('fax_pickup_items').insert({ ...payload, created_by: actor?.id });
  await addAudit({
    action_type: '本次未領到',
    actor_id: actor?.id,
    actor_name: actor?.display_name,
    page_name: '傳真/領件',
    record_table: 'pickup_record_items',
    record_id: recordItem.id,
    old_data: recordItem,
    new_data: payload
  });
}


export async function markCasePickedUp(params: {
  caseRow: ArcCase;
  pickupDate: string;
  data: ArcData;
  actor: Profile | null;
}) {
  const { caseRow, pickupDate, data, actor } = params;
  if (actor?.role !== 'admin' && actor?.role !== 'staff') throw new Error('您沒有操作已領件的權限。');
  const pendingPlans = data.faxPickupItems.filter((item) => item.case_id === caseRow.id && item.status === 'pending');
  if (pendingPlans.length) {
    const { error: planError } = await supabase
      .from('fax_pickup_items')
      .update({ status: 'picked_up', updated_by: actor?.id })
      .in('id', pendingPlans.map((item) => item.id));
    if (planError) throw planError;
  }

  const patchWithPickupDate: Partial<ArcCase> & { pickup_date?: string } = {
    status: 'completed',
    pickup_status: 'picked_up',
    pickup_date: pickupDate,
    expected_pickup_date: pickupDate,
    updated_by: actor?.id
  };
  const { error: caseError } = await supabase.from('arc_cases').update(patchWithPickupDate).eq('id', caseRow.id);
  if (caseError) {
    const message = `${caseError.message ?? ''} ${caseError.code ?? ''}`;
    if (message.includes('pickup_date') || message.includes('PGRST204') || message.includes('42703')) {
      const fallbackPatch = { ...patchWithPickupDate };
      delete fallbackPatch.pickup_date;
      const { error: fallbackError } = await supabase.from('arc_cases').update(fallbackPatch).eq('id', caseRow.id);
      if (fallbackError) throw fallbackError;
    } else {
      throw caseError;
    }
  }

  await addAudit({
    action_type: '已領件',
    actor_id: actor?.id,
    actor_name: actor?.display_name,
    page_name: '傳真/領件',
    record_table: 'arc_cases',
    record_id: caseRow.id,
    old_data: {
      case_no: caseRow.case_no,
      employer_name: caseRow.employer_name,
      worker_name: caseRow.worker_name,
      group_no: caseRow.group_no,
      status: caseRow.status,
      pickup_status: caseRow.pickup_status,
      expected_pickup_date: caseRow.expected_pickup_date,
      pickup_date: caseRow.pickup_date ?? null
    },
    new_data: {
      case_no: caseRow.case_no,
      employer_name: caseRow.employer_name,
      worker_name: caseRow.worker_name,
      group_no: caseRow.group_no,
      status: 'completed',
      pickup_status: 'picked_up',
      pickup_date: pickupDate
    }
  });
}

export async function deletePickupRecord(record: PickupRecord, reason: string, actor: Profile | null) {
  assertAdmin(actor);
  return rpcOrFallback('arc_delete_pickup_record_v2', {
    p_record_id: record.id,
    p_reason: reason || '管理員刪除傳真領件紀錄'
  }, async () => {
    const { data: recordItems, error: recordItemReadError } = await supabase.from('pickup_record_items').select('*').eq('record_id', record.id);
    if (recordItemReadError) throw recordItemReadError;
    const patch = { deleted_at: new Date().toISOString(), deleted_by: actor?.id, delete_reason: reason };
    const { error } = await supabase.from('pickup_records').update(patch).eq('id', record.id);
    if (error) throw error;
    const { error: detailError } = await supabase.from('pickup_record_items').delete().eq('record_id', record.id);
    if (detailError) throw detailError;
    const { error: deletedError } = await supabase.from('deleted_records').insert({
      table_name: 'pickup_records',
      record_id: record.id,
      data: { record, details: recordItems ?? [] },
      deleted_by: actor?.id,
      deleted_by_name: actor?.display_name
    });
    if (deletedError) throw deletedError;
    await addAudit({
      action_type: '傳真領件紀錄刪除',
      actor_id: actor?.id,
      actor_name: actor?.display_name,
      page_name: '傳真/領件',
      record_table: 'pickup_records',
      record_id: record.id,
      old_data: {
        record_no: record.record_no,
        pickup_date: record.pickup_date,
        case_count: record.case_count,
        details: recordItems ?? []
      },
      new_data: patch,
      reason
    });
  });
}

const settingsDeleteTables = new Set([
  'profiles',
  'person_options',
  'application_items',
  'fee_settings',
  'broker_companies',
  'bank_accounts',
  'arc_settings',
  'announcement_items',
  'immigration_service_stations',
  'task_force_contacts'
]);

export async function softDelete(table: string, row: { id: string; [key: string]: unknown }, actor: Profile | null, pageName: string, reason = '管理員刪除') {
  assertAdmin(actor);
  if (settingsDeleteTables.has(table)) {
    return rpcOrFallback('arc_admin_soft_delete_setting', {
      p_table: table,
      p_id: row.id,
      p_page_name: pageName,
      p_reason: reason
    }, async () => {
      const patch: Record<string, unknown> = { updated_by: actor?.id };
      if ('is_enabled' in row) patch.is_enabled = false;
      if ('deleted_at' in row || table !== 'arc_settings') patch.deleted_at = new Date().toISOString();
      const { error } = await supabase.from(table).update(patch).eq('id', row.id);
      if (error) throw error;
      await supabase.from('deleted_records').insert({
        table_name: table,
        record_id: row.id,
        data: row,
        deleted_by: actor?.id,
        deleted_by_name: actor?.display_name
      });
      await addAudit({
        action_type: '系統設定刪除',
        actor_id: actor?.id,
        actor_name: actor?.display_name,
        page_name: pageName,
        record_table: table,
        record_id: row.id,
        old_data: row,
        new_data: patch,
        reason
      });
    });
  }
  const patch = { deleted_at: new Date().toISOString(), updated_by: actor?.id };
  const { error } = await supabase.from(table).update(patch).eq('id', row.id);
  if (error) throw error;
  await supabase.from('deleted_records').insert({
    table_name: table,
    record_id: row.id,
    data: row,
    deleted_by: actor?.id,
    deleted_by_name: actor?.display_name
  });
  await addAudit({
    action_type: '刪除',
    actor_id: actor?.id,
    actor_name: actor?.display_name,
    page_name: pageName,
    record_table: table,
    record_id: row.id,
    old_data: row,
    new_data: patch,
    reason
  });
}

export async function toggleSettingEnabled(table: string, row: { id: string; is_enabled?: boolean; [key: string]: unknown }, nextEnabled: boolean, actor: Profile | null, pageName: string) {
  assertAdmin(actor);
  return rpcOrFallback('arc_admin_toggle_setting_enabled', {
    p_table: table,
    p_id: row.id,
    p_enabled: nextEnabled,
    p_page_name: pageName,
    p_reason: nextEnabled ? '管理員啟用設定項目' : '管理員停用設定項目'
  }, async () => {
    const patch = { is_enabled: nextEnabled, updated_by: actor?.id };
    const { error } = await supabase.from(table).update(patch).eq('id', row.id);
    if (error) throw error;
    await addAudit({
      action_type: nextEnabled ? '系統設定啟用' : '系統設定停用',
      actor_id: actor?.id,
      actor_name: actor?.display_name,
      page_name: pageName,
      record_table: table,
      record_id: row.id,
      old_data: row,
      new_data: patch
    });
  });
}

export async function updateProfileStatus(userId: string, action: 'disable' | 'enable' | 'delete', actor: Profile | null) {
  assertAdmin(actor);
  return rpcOrFallback('arc_admin_update_profile_status', {
    p_user_id: userId,
    p_action: action,
    p_page_name: '帳號設定'
  }, async () => {
    const { data: target, error: targetError } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (targetError) throw targetError;
    if (!target) throw new Error('找不到要操作的帳號。');
    if (userId === actor?.id) throw new Error('不可操作目前登入中的帳號。');
    if (target.role === 'admin' && ['disable', 'delete'].includes(action)) {
      const { data: admins, error: adminsError } = await supabase.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).is('deleted_at', null).neq('id', userId);
      if (adminsError) throw adminsError;
      if (!admins?.length) throw new Error('系統至少需保留一個啟用中的管理員帳號。');
    }
    const patch: Record<string, unknown> = action === 'enable'
      ? { is_active: true, deleted_at: null }
      : action === 'disable'
        ? { is_active: false }
        : { is_active: false, deleted_at: new Date().toISOString() };
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
    if (error) throw error;
    if (action === 'delete') {
      await supabase.from('deleted_records').insert({
        table_name: 'profiles',
        record_id: userId,
        data: target,
        deleted_by: actor?.id,
        deleted_by_name: actor?.display_name
      });
    }
    await addAudit({
      action_type: action === 'enable' ? '帳號啟用' : action === 'disable' ? '帳號停用' : '帳號刪除',
      actor_id: actor?.id,
      actor_name: actor?.display_name,
      page_name: '帳號設定',
      record_table: 'profiles',
      record_id: userId,
      old_data: target,
      new_data: patch,
      reason: action === 'delete' ? '管理員軟刪除帳號' : undefined
    });
  });
}


function assertAdmin(actor: Profile | null) {
  if (actor?.role !== 'admin') throw new Error('您沒有刪除權限。');
}

export async function deletePaymentBatch(batch: PaymentBatch, data: ArcData, actor: Profile | null, pageName = '財務對帳確認') {
  assertAdmin(actor);
  return rpcOrFallback('arc_delete_payment_batch_v2', {
    p_batch_id: batch.id,
    p_page_name: pageName
  }, async () => {
    const account = data.accounts.find((item) => item.id === batch.account_id);
    const relatedCases = data.cases.filter((item) => item.payment_batch_id === batch.id);
    if (account) {
      const before = Number(account.current_balance ?? 0);
      const reverseAmount = Number(batch.total_amount ?? 0);
      const after = before + reverseAmount;
      const { error: accountError } = await supabase.from('bank_accounts').update({ current_balance: after, updated_by: actor?.id }).eq('id', account.id);
      if (accountError) throw accountError;
      const { error: txnError } = await supabase.from('account_transactions').insert({
        account_id: account.id,
        txn_type: 'reverse_delete_payment_batch',
        amount: reverseAmount,
        balance_before: before,
        balance_after: after,
        ref_table: 'payment_batches',
        ref_id: batch.id,
        reason: `刪除繳費批次 ${batch.batch_no} 沖正`,
        created_by: actor?.id
      });
      if (txnError) throw txnError;
    }
    const patch = { deleted_at: new Date().toISOString(), updated_by: actor?.id, status: 'cancelled' as BatchStatus };
    const { error: batchError } = await supabase.from('payment_batches').update(patch).eq('id', batch.id);
    if (batchError) throw batchError;
    if (relatedCases.length) {
      const { error: caseError } = await supabase.from('arc_cases').update({
        status: 'pending_payment',
        payment_batch_id: null,
        payment_date: null,
        payment_account_id: null,
        updated_by: actor?.id
      }).eq('payment_batch_id', batch.id);
      if (caseError) throw caseError;
    }
    const { error: deletedError } = await supabase.from('deleted_records').insert({
      table_name: 'payment_batches',
      record_id: batch.id,
      data: { batch, related_case_ids: relatedCases.map((item) => item.id), reverse_amount: batch.total_amount },
      deleted_by: actor?.id,
      deleted_by_name: actor?.display_name
    });
    if (deletedError) throw deletedError;
    await addAudit({
      action_type: '刪除財務對帳批次',
      actor_id: actor?.id,
      actor_name: actor?.display_name,
      page_name: pageName,
      record_table: 'payment_batches',
      record_id: batch.id,
      old_data: { batch, relatedCases },
      new_data: patch,
      reason: '管理員刪除並建立帳戶沖正紀錄'
    });
  });
}

export async function deleteFinanceCase(caseRow: ArcCase, data: ArcData, actor: Profile | null, pageName = '財務查詢') {
  assertAdmin(actor);
  return rpcOrFallback('arc_soft_delete_case_v2', {
    p_case_id: caseRow.id,
    p_page_name: pageName
  }, async () => {
    const batch = data.batches.find((item) => item.id === caseRow.payment_batch_id);
    const batchItem = data.batchItems.find((item) => item.case_id === caseRow.id && item.batch_id === caseRow.payment_batch_id);
    const account = data.accounts.find((item) => item.id === (caseRow.payment_account_id ?? batch?.account_id));
    const reverseAmount = Number(batchItem?.corrected_amount ?? caseRow.amount ?? 0);
    if (account && reverseAmount) {
      const before = Number(account.current_balance ?? 0);
      const after = before + reverseAmount;
      const { error: accountError } = await supabase.from('bank_accounts').update({ current_balance: after, updated_by: actor?.id }).eq('id', account.id);
      if (accountError) throw accountError;
      const { error: txnError } = await supabase.from('account_transactions').insert({
        account_id: account.id,
        txn_type: 'reverse_delete_finance_case',
        amount: reverseAmount,
        balance_before: before,
        balance_after: after,
        ref_table: 'arc_cases',
        ref_id: caseRow.id,
        reason: `刪除財務資料 ${caseRow.case_no} 沖正`,
        created_by: actor?.id
      });
      if (txnError) throw txnError;
    }
    if (batch) {
      const nextCount = Math.max(0, Number(batch.case_count ?? 0) - 1);
      const nextTotal = Math.max(0, Number(batch.total_amount ?? 0) - reverseAmount);
      const patch: Record<string, unknown> = { total_amount: nextTotal, case_count: nextCount, updated_by: actor?.id };
      if (nextCount === 0) {
        patch.status = 'cancelled';
        patch.deleted_at = new Date().toISOString();
      }
      const { error: batchError } = await supabase.from('payment_batches').update(patch).eq('id', batch.id);
      if (batchError) throw batchError;
    }
    const patch = { deleted_at: new Date().toISOString(), updated_by: actor?.id };
    const { error } = await supabase.from('arc_cases').update(patch).eq('id', caseRow.id);
    if (error) throw error;
    const { error: deletedError } = await supabase.from('deleted_records').insert({
      table_name: 'arc_cases',
      record_id: caseRow.id,
      data: { case: caseRow, batch, reverse_amount: reverseAmount },
      deleted_by: actor?.id,
      deleted_by_name: actor?.display_name
    });
    if (deletedError) throw deletedError;
    await addAudit({
      action_type: '刪除財務資料',
      actor_id: actor?.id,
      actor_name: actor?.display_name,
      page_name: pageName,
      record_table: 'arc_cases',
      record_id: caseRow.id,
      old_data: { caseRow, batch },
      new_data: patch,
      reason: '管理員刪除並建立帳戶沖正紀錄'
    });
  });
}

export async function deleteArcCase(caseRow: ArcCase, data: ArcData, actor: Profile | null, pageName = '案件查詢') {
  assertAdmin(actor);
  if (caseRow.payment_batch_id || caseRow.payment_account_id) {
    await deleteFinanceCase(caseRow, data, actor, pageName);
    return;
  }
  return rpcOrFallback('arc_soft_delete_case_v2', {
    p_case_id: caseRow.id,
    p_page_name: pageName
  }, async () => {
    await softDelete('arc_cases', caseRow as unknown as { id: string; [key: string]: unknown }, actor, pageName, '管理員刪除案件');
  });
}


export function canManageAnnouncement(actor: Profile | null) {
  return actor?.role === 'admin' || actor?.role === 'staff';
}

export async function upsertAnnouncement(payload: Partial<AnnouncementItem>, actor: Profile | null) {
  if (!canManageAnnouncement(actor)) throw new Error('您沒有修改公告事項的權限。');
  const normalized = {
    ...payload,
    icon: payload.icon || '公告事項',
    display_pages: payload.display_pages?.length ? payload.display_pages : ['總覽'],
    updated_by: actor?.id,
    updated_by_name: actor?.display_name
  } as Record<string, unknown>;
  const isNew = !payload.id;
  let oldData: AnnouncementItem | null = null;
  if (isNew) {
    normalized.created_by = actor?.id;
    normalized.created_by_name = actor?.display_name;
  } else {
    const { data: existing, error: existingError } = await supabase
      .from('announcement_items')
      .select('*')
      .eq('id', payload.id)
      .maybeSingle();
    if (existingError) throw existingError;
    oldData = existing as AnnouncementItem | null;
  }
  const query = isNew
    ? supabase.from('announcement_items').insert(normalized).select('*').single()
    : supabase.from('announcement_items').update(normalized).eq('id', payload.id).select('*').single();
  const { data, error } = await query;
  if (error) throw error;
  await addAudit({
    action_type: isNew ? '公告事項新增' : '公告事項修改',
    actor_id: actor?.id,
    actor_name: actor?.display_name,
    page_name: '公告事項設定',
    record_table: 'announcement_items',
    record_id: (data as { id: string }).id,
    old_data: oldData ? {
      原公告日期: oldData.start_date,
      原公告標題: oldData.title,
      原公告內容: oldData.content,
      原始資料: oldData
    } : undefined,
    new_data: {
      新公告日期: (data as AnnouncementItem).start_date,
      新公告標題: (data as AnnouncementItem).title,
      新公告內容: (data as AnnouncementItem).content,
      新資料: data
    }
  });
  return data as AnnouncementItem;
}

export async function deleteAnnouncement(row: AnnouncementItem, actor: Profile | null) {
  if (!canManageAnnouncement(actor)) throw new Error('您沒有修改公告事項的權限。');
  await softDelete('announcement_items', row as unknown as { id: string; [key: string]: unknown }, actor, '公告事項設定', '刪除公告事項');
}

export async function upsertSettingTable<T extends { id?: string }>(table: string, payload: T, actor: Profile | null, pageName: string) {
  assertAdmin(actor);
  const withActor = { ...payload, updated_by: actor?.id } as Record<string, unknown>;
  const isNew = !payload.id;
  if (isNew) withActor.created_by = actor?.id;
  const query = isNew ? supabase.from(table).insert(withActor).select('*').single() : supabase.from(table).update(withActor).eq('id', payload.id).select('*').single();
  const { data, error } = await query;
  if (error) throw error;
  await addAudit({
    action_type: isNew ? '新增' : '修改',
    actor_id: actor?.id,
    actor_name: actor?.display_name,
    page_name: pageName,
    record_table: table,
    record_id: (data as { id: string }).id,
    new_data: data
  });
  return data as T;
}
