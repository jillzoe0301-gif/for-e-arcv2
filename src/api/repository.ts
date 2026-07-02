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
    settings: settings as never,
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

export async function createPaymentBatch(params: {
  caseIds: string[];
  brokerId: string;
  accountId: string;
  paymentDate: string;
  payerName: string;
  data: ArcData;
  actor: Profile | null;
}) {
  const { caseIds, brokerId, accountId, paymentDate, payerName, data, actor } = params;
  const selectedCases = data.cases.filter((item) => caseIds.includes(item.id));
  if (!selectedCases.length) throw new Error('請先選擇待繳案件。');
  if (selectedCases.some((item) => item.broker_id !== brokerId)) throw new Error('同一批繳費只能選同一仲介。');
  const broker = data.brokers.find((item) => item.id === brokerId);
  const account = data.accounts.find((item) => item.id === accountId);
  if (!broker || !account) throw new Error('請確認仲介與扣款帳號。');
  const total = selectedCases.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
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

  const itemRows = selectedCases.map((caseRow) => ({
    batch_id: batch.id,
    case_id: caseRow.id,
    original_application_item_id: caseRow.application_item_id,
    original_amount: caseRow.amount
  }));
  const { error: itemsError } = await supabase.from('payment_batch_items').insert(itemRows);
  if (itemsError) throw itemsError;

  for (const caseRow of selectedCases) {
    const appItem = data.applicationItems.find((item) => item.id === caseRow.application_item_id);
    await supabase.from('arc_cases').update({
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
    new_data: { batch, items: selectedCases }
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
    old_data: batch,
    new_data: patch
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
  const { error: batchError } = await supabase.from('payment_batches').update({ status: 'amount_error', updated_by: actor?.id }).eq('id', batch.id);
  if (batchError) throw batchError;
  await addAudit({
    action_type: '金額修正',
    actor_id: actor?.id,
    actor_name: actor?.display_name,
    page_name: '財務對帳確認',
    record_table: 'payment_batch_items',
    record_id: item.id,
    old_data: {
      original_application_item_id: item.original_application_item_id,
      original_amount: item.original_amount,
      case_application_item_id: caseRow.application_item_id,
      case_amount: caseRow.amount
    },
    new_data: patch,
    reason
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
}) {
  const { caseRow, receiptNo, foreignNoLast5, receiptOrder, faxDate, expectedPickupDate, data, actor } = params;
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
    throw new Error(`收據順序不可重複，目前已使用到第 ${used} 號，建議輸入第 ${used + 1} 號`);
  }
  const existing = data.faxPickupItems.find((item) => item.case_id === caseRow.id && item.status === 'pending');
  const payload = {
    case_id: caseRow.id,
    receipt_no: receiptNo,
    foreign_no_last5: foreignNoLast5,
    receipt_order: receiptOrder,
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

export async function softDelete(table: string, row: { id: string; [key: string]: unknown }, actor: Profile | null, pageName: string, reason = '管理員刪除') {
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
