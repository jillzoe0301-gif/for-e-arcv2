import { useMemo, useState } from 'react';
import { addFaxPickupPlan, createPickupRecord, deletePickupRecord, markCasePickedUp, markPickupNotReceived, removeFaxPickupPlan, updateCaseFaxOptions } from '../api/repository';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { SearchInput } from '../components/SearchInput';
import { CaseStatusBadge } from '../components/StatusBadge';
import { useToast } from '../context/ToastContext';
import type { ArcCase, ArcData, FaxPickupItem, PickupRecord, PickupRecordItem, Profile } from '../types';
import { formatDate, nextWeekThursday, parseDateLoose, taipeiWeekday, todayTaipei } from '../utils/date';
import { canCompletePickup, canDeletePickupRecord } from '../utils/permissions';
import { printFaxAndSignatureSheets, printFaxPickupSheet, printSignatureSheet } from '../utils/print';
import { rowMatchesKeyword } from '../utils/search';

type FaxDraft = { payment_date: string; receipt_no: string; foreign_no_last5: string; receipt_order: string; copy_count: string; expected_pickup_date: string; fax_date: string; old_card_checked: boolean; handler_last4: string };
type DraftMap = Record<string, FaxDraft>;

export function FaxPickupPage({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [keyword, setKeyword] = useState('');
  const [planDate, setPlanDate] = useState(nextWeekThursday());
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<PickupRecord | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [printHandler, setPrintHandler] = useState(profile?.display_name ?? '');
  const [pickedUpTarget, setPickedUpTarget] = useState<ArcCase | null>(null);
  const [pickedUpDate, setPickedUpDate] = useState(todayTaipei());

  const weekday = taipeiWeekday();
  const reminders = [
    { label: '週一繳費', today: weekday === 1 },
    { label: '週二傳真', today: weekday === 2 },
    { label: '週四領件', today: weekday === 4 }
  ];

  function errorMessage(err: unknown, fallback: string) {
    if (err instanceof Error) return err.message;
    if (err && typeof err === 'object' && 'message' in err) return String((err as { message?: unknown }).message ?? fallback);
    return fallback;
  }

  function isActivePendingPlan(item: FaxPickupItem) {
    if (item.status !== 'pending' || item.deleted_at) return false;
    const caseRow = data.cases.find((row) => row.id === item.case_id);
    if (!caseRow) return false;
    return ['pending_pickup', 'not_received'].includes(caseRow.status) && caseRow.pickup_status === 'pending';
  }

  const activePendingPlans = useMemo(() => data.faxPickupItems.filter((item) => isActivePendingPlan(item)), [data.faxPickupItems, data.cases]);

  const pendingPlanCaseIds = useMemo(() => new Set(activePendingPlans.map((item) => item.case_id)), [activePendingPlans]);

  const readyCases = useMemo(() => data.cases
    .filter((caseRow) => ['pending_pickup', 'not_received'].includes(caseRow.status))
    .filter((caseRow) => !pendingPlanCaseIds.has(caseRow.id))
    .filter((caseRow) => rowMatchesKeyword(keyword, [caseRow.employer_name, caseRow.worker_name, caseRow.group_no, caseRow.case_no, caseRow.receipt_no, caseRow.foreign_no_last5]))
    .sort((a, b) =>
      String(a.payment_date ?? a.application_date).localeCompare(String(b.payment_date ?? b.application_date)) ||
      String(a.receipt_no ?? '').localeCompare(String(b.receipt_no ?? ''), 'zh-Hant', { numeric: true }) ||
      String(a.foreign_no_last5 ?? '').localeCompare(String(b.foreign_no_last5 ?? ''), 'zh-Hant', { numeric: true })
    ), [data.cases, keyword, pendingPlanCaseIds]);

  const plannedItems = useMemo(() => activePendingPlans
    .filter((item) => normalizePickupDateValue(item.expected_pickup_date) === normalizePickupDateValue(planDate))
    .sort((a, b) =>
      String(data.cases.find((caseRow) => caseRow.id === a.case_id)?.payment_date ?? '').localeCompare(String(data.cases.find((caseRow) => caseRow.id === b.case_id)?.payment_date ?? '')) ||
      String(a.receipt_no).localeCompare(String(b.receipt_no), 'zh-Hant', { numeric: true }) ||
      String(a.foreign_no_last5).localeCompare(String(b.foreign_no_last5), 'zh-Hant', { numeric: true })
    ), [data.cases, activePendingPlans, planDate]);

  const activePickupRecords = useMemo(() => data.pickupRecords.filter((record) => !record.deleted_at), [data.pickupRecords]);

  function isOldCardChecked(caseRow: ArcCase) {
    const appItem = data.applicationItems.find((item) => item.id === caseRow.application_item_id);
    return Boolean(caseRow.old_card_checked ?? appItem?.requires_old_card ?? false);
  }

  function draftFor(caseRow: ArcCase): FaxDraft {
    return drafts[caseRow.id] ?? {
      payment_date: caseRow.payment_date ?? caseRow.application_date ?? todayTaipei(),
      receipt_no: '',
      foreign_no_last5: '',
      receipt_order: '',
      copy_count: String(caseRow.copy_count ?? 1),
      fax_date: caseRow.fax_date ?? todayTaipei(),
      expected_pickup_date: caseRow.expected_pickup_date ?? planDate ?? nextWeekThursday(),
      old_card_checked: Boolean(data.applicationItems.find((item) => item.id === caseRow.application_item_id)?.requires_old_card ?? false),
      handler_last4: ''
    };
  }

  function setDraft<K extends keyof FaxDraft>(caseId: string, key: K, value: FaxDraft[K]) {
    const caseRow = data.cases.find((item) => item.id === caseId);
    if (!caseRow) return;
    setDrafts((current) => ({ ...current, [caseId]: { ...draftFor(caseRow), [key]: value } }));
  }

  function normalizeLast4(value: string) {
    return value.trim().replace(/\D/g, '').slice(0, 4);
  }

  function normalizeCopyCount(value: unknown) {
    const text = String(value ?? '').trim().replace(/,/g, '');
    if (!/^\d+$/.test(text)) return '';
    const count = Number(text);
    if (!Number.isInteger(count) || count <= 0) return '';
    return String(count);
  }

  function normalizePickupDateValue(value?: string | null) {
    if (!value) return '';
    return parseDateLoose(value) ?? String(value).slice(0, 10);
  }

  function normalizeReceiptOrderValue(value: unknown) {
    const text = String(value ?? '').trim();
    if (!/^\d+$/.test(text)) return '';
    const order = Number(text);
    if (!Number.isInteger(order) || order <= 0) return '';
    return String(order);
  }

  // V13.44：收據順序不再做任何重複限制。
  // 仍保留數字格式清理與排序用途，但不阻擋同日相同序號。
  function receiptOrderDuplicateMessage(_caseId: string, _expectedPickupDate: string, _receiptOrder: number | string) {
    return '';
  }

  function validateReceiptOrder(_caseRow: ArcCase, _expectedPickupDate: string, _receiptOrder: number) {
    return true;
  }

  function changeReceiptOrder(caseRow: ArcCase, value: string) {
    const clean = value.trim().replace(/\D/g, '');
    setDraft(caseRow.id, 'receipt_order', clean);
  }

  function validateReceiptOrderOnBlur(caseRow: ArcCase) {
    const draft = draftFor(caseRow);
    const order = normalizeReceiptOrderValue(draft.receipt_order);
    if (draft.receipt_order && !order) setDraft(caseRow.id, 'receipt_order', '');
    if (order) setDraft(caseRow.id, 'receipt_order', order);
  }

  async function saveCopyCount(caseRow: ArcCase) {
    const normalized = normalizeCopyCount(draftFor(caseRow).copy_count || '1');
    if (!normalized) {
      pushToast({ type: 'warning', title: '張數格式不正確，請輸入正整數。' });
      setDraft(caseRow.id, 'copy_count', String(caseRow.copy_count ?? 1));
      return null;
    }
    setDraft(caseRow.id, 'copy_count', normalized);
    const count = Number(normalized);
    if (count !== Number(caseRow.copy_count ?? 1)) await saveFaxOption(caseRow, { copyCount: count });
    return count;
  }

  function changeExpectedPickupDate(caseRow: ArcCase, value: string) {
    const nextDate = value || nextWeekThursday();
    setDraft(caseRow.id, 'expected_pickup_date', nextDate);
  }

  function validatePlannedReceiptOrders(_plans: FaxPickupItem[]) {
    return true;
  }

  async function saveFaxOption(caseRow: ArcCase, patch: { oldCardChecked?: boolean; handlerLast4?: string; paymentDate?: string; copyCount?: number }) {
    try {
      await updateCaseFaxOptions({ caseRow, actor: profile, ...patch });
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '欄位更新失敗', message: errorMessage(err, '請稍後再試') });
    }
  }

  async function savePaymentDate(caseRow: ArcCase) {
    const raw = draftFor(caseRow).payment_date;
    const parsed = parseDateLoose(raw);
    if (!parsed) {
      pushToast({ type: 'warning', title: '收費日期格式不正確，請重新輸入。' });
      setDraft(caseRow.id, 'payment_date', caseRow.payment_date ?? caseRow.application_date ?? todayTaipei());
      return null;
    }
    setDraft(caseRow.id, 'payment_date', parsed);
    return parsed;
  }

  function validateDraftBasics(caseRow: ArcCase) {
    const draft = draftFor(caseRow);
    const paymentDate = parseDateLoose(draft.payment_date);
    if (!paymentDate) {
      pushToast({ type: 'warning', title: '收費日期格式不正確，請重新輸入。' });
      return null;
    }
    if (!draft.receipt_no.trim() || !draft.foreign_no_last5.trim() || !draft.receipt_order.trim()) {
      pushToast({ type: 'warning', title: '請補齊資料', message: '收件編號、外字末五碼、收據順序都必填。' });
      return null;
    }
    const copyText = normalizeCopyCount(draft.copy_count || '1');
    if (!copyText) {
      pushToast({ type: 'warning', title: '張數格式不正確，請輸入正整數。' });
      return null;
    }
    const order = Number(draft.receipt_order);
    if (!Number.isInteger(order) || order <= 0) {
      pushToast({ type: 'warning', title: '收據順序格式錯誤' });
      return null;
    }
    const expectedPickupDate = draft.expected_pickup_date || nextWeekThursday();
    if (!validateReceiptOrder(caseRow, expectedPickupDate, order)) return null;
    return { draft, paymentDate, order, copyCount: Number(copyText), expectedPickupDate };
  }

  async function addPlan(caseRow: ArcCase) {
    const valid = validateDraftBasics(caseRow);
    if (!valid) return;
    const { draft, paymentDate, order, copyCount, expectedPickupDate } = valid;
    try {
      await addFaxPickupPlan({
        caseRow,
        receiptNo: draft.receipt_no.trim(),
        foreignNoLast5: draft.foreign_no_last5.trim(),
        receiptOrder: order,
        faxDate: draft.fax_date || todayTaipei(),
        expectedPickupDate,
        data,
        actor: profile,
        oldCardChecked: draft.old_card_checked,
        handlerLast4: draft.handler_last4,
        paymentDate,
        copyCount
      });
      pushToast({ type: 'success', title: '已加入預計領件區' });
      setPlanDate(expectedPickupDate);
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '加入失敗', message: errorMessage(err, '請稍後再試') });
    }
  }

  function togglePlan(planId: string) {
    setSelectedPlanIds((current) => current.includes(planId) ? current.filter((id) => id !== planId) : [...current, planId]);
  }

  function selectAllPlans() {
    setSelectedPlanIds(plannedItems.map((item) => item.id));
  }

  async function addFilledDraftsToPlan() {
    let success = 0;
    let skipped = 0;
    for (const caseRow of readyCases) {
      const draft = draftFor(caseRow);
      const paymentDate = parseDateLoose(draft.payment_date);
      const expectedPickupDate = normalizePickupDateValue(draft.expected_pickup_date || planDate || nextWeekThursday());
      const orderText = normalizeReceiptOrderValue(draft.receipt_order);
      const copyText = normalizeCopyCount(draft.copy_count || '1');
      const requiredFilled = Boolean(draft.receipt_no.trim() && draft.foreign_no_last5.trim() && draft.receipt_order.trim());
      if (!requiredFilled || !paymentDate || !orderText || !copyText) {
        skipped += 1;
        continue;
      }
      try {
        await addFaxPickupPlan({
          caseRow,
          receiptNo: draft.receipt_no.trim(),
          foreignNoLast5: draft.foreign_no_last5.trim(),
          receiptOrder: Number(orderText),
          faxDate: draft.fax_date || todayTaipei(),
          expectedPickupDate,
          data,
          actor: profile,
          oldCardChecked: draft.old_card_checked,
          handlerLast4: draft.handler_last4,
          paymentDate,
          copyCount: Number(copyText)
        });
        success += 1;
      } catch {
        skipped += 1;
      }
    }
    pushToast({ type: success ? 'success' : 'warning', title: '一鍵加入預計完成', message: `已成功加入 ${success} 筆，${skipped} 筆因資料未填完整未加入。` });
    await reload();
  }

  async function removePlan(row: { plan: FaxPickupItem; caseRow: ArcCase }) {
    if (!window.confirm('確定要將此案件移出預計領件區嗎？移除後會回到移民署傳真領件。')) return;
    try {
      await removeFaxPickupPlan({ plan: row.plan, caseRow: row.caseRow, actor: profile });
      pushToast({ type: 'success', title: '已移出預計領件區', message: '案件已回到移民署傳真領件。' });
      setSelectedPlanIds((current) => current.filter((id) => id !== row.plan.id));
      setDrafts((current) => ({
        ...current,
        [row.caseRow.id]: {
          payment_date: row.caseRow.payment_date ?? row.caseRow.application_date ?? todayTaipei(),
          receipt_no: row.plan.receipt_no ?? row.caseRow.receipt_no ?? '',
          foreign_no_last5: row.plan.foreign_no_last5 ?? row.caseRow.foreign_no_last5 ?? '',
          receipt_order: '',
          copy_count: String(row.plan.copy_count ?? row.caseRow.copy_count ?? 1),
          fax_date: row.plan.fax_date ?? row.caseRow.fax_date ?? todayTaipei(),
          expected_pickup_date: nextWeekThursday(),
          old_card_checked: row.plan.old_card_checked ?? isOldCardChecked(row.caseRow),
          handler_last4: row.plan.handler_last4 ?? row.caseRow.handler_last4 ?? ''
        }
      }));
      setPlanDate(nextWeekThursday());
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '移除失敗', message: errorMessage(err, '請稍後再試') });
    }
  }

  async function createRecordForPlanIds(planIds: string[]) {
    const selectedPlans = plannedItems.filter((item) => planIds.includes(item.id));
    const caseIds = selectedPlans.map((item) => item.case_id);
    if (!validatePlannedReceiptOrders(selectedPlans)) return;
    try {
      const record = await createPickupRecord({ caseIds, pickupDate: planDate, data, actor: profile });
      pushToast({ type: 'success', title: '已建立傳真領件紀錄', message: record.record_no });
      setSelectedPlanIds([]);
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '建立紀錄失敗', message: errorMessage(err, '請稍後再試') });
    }
  }
  async function singlePickup(caseRow: ArcCase) {
    const draft = draftFor(caseRow);
    const plan = data.faxPickupItems.find((item) => item.case_id === caseRow.id && item.status === 'pending');
    try {
      if (!plan) {
        const valid = validateDraftBasics(caseRow);
        if (!valid) return;
        const { draft, paymentDate, order, copyCount, expectedPickupDate } = valid;
        await addFaxPickupPlan({
          caseRow,
          receiptNo: draft.receipt_no.trim(),
          foreignNoLast5: draft.foreign_no_last5.trim(),
          receiptOrder: order,
          faxDate: draft.fax_date || todayTaipei(),
          expectedPickupDate,
          data,
          actor: profile,
          oldCardChecked: draft.old_card_checked,
          handlerLast4: draft.handler_last4,
          paymentDate,
          copyCount
        });
        const pickupDate = expectedPickupDate;
        await createPickupRecord({ caseIds: [caseRow.id], pickupDate, data, actor: profile });
        pushToast({ type: 'success', title: '單筆領件已建立' });
        setPlanDate(pickupDate);
        await reload();
        return;
      }
      setPlanDate(plan.expected_pickup_date);
      await createPickupRecord({ caseIds: [caseRow.id], pickupDate: plan.expected_pickup_date, data, actor: profile });
      pushToast({ type: 'success', title: '單筆領件已建立' });
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '單筆領件失敗', message: errorMessage(err, '請稍後再試') });
    }
  }


  function openPickedUp(row: ArcCase) {
    if (!canCompletePickup(profile?.role)) {
      pushToast({ type: 'warning', title: '您沒有操作已領件的權限。' });
      return;
    }
    setPickedUpTarget(row);
    setPickedUpDate(todayTaipei());
  }

  async function confirmPickedUp() {
    if (!pickedUpTarget) return;
    const parsedDate = parseDateLoose(pickedUpDate);
    if (!parsedDate) {
      pushToast({ type: 'warning', title: '領件日格式不正確，請重新輸入。' });
      return;
    }
    try {
      await markCasePickedUp({ caseRow: pickedUpTarget, pickupDate: parsedDate, data, actor: profile });
      pushToast({ type: 'success', title: '已領件完成', message: `${pickedUpTarget.employer_name}｜${pickedUpTarget.worker_name}` });
      setPickedUpTarget(null);
      setPickedUpDate(todayTaipei());
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '已領件失敗', message: errorMessage(err, '請稍後再試') });
    }
  }

  function printableRows() {
    return plannedItems
      .filter((item) => selectedPlanIds.includes(item.id))
      .map((plan) => {
        const caseRow = data.cases.find((item) => item.id === plan.case_id)!;
        return { caseRow, appItem: data.applicationItems.find((item) => item.id === caseRow.application_item_id), brokerName: data.brokers.find((item) => item.id === caseRow.broker_id)?.name };
      })
      .filter((row) => Boolean(row.caseRow));
  }

  function printOptions() {
    const fwBroker = data.brokers.find((item) => item.code === 'FW' || item.name.includes('灃康'));
    const taoyuan = data.serviceStations.find((item) => String(item.city ?? '').includes('桃園') || item.name.includes('桃園'));
    return {
      brokerName: '灃康',
      brokerPhone: fwBroker?.phone ?? '',
      handlerName: printHandler,
      stationInfo: taoyuan ? `桃園移民署電話：${taoyuan.phone ?? ''}　傳真：${taoyuan.fax ?? ''}` : '桃園移民署電話：__________　傳真：__________'
    };
  }

  function ensurePrintableRows() {
    const rows = printableRows();
    if (!rows.length) {
      pushToast({ type: 'warning', title: '請先勾選預計領件資料' });
      return null;
    }
    const plans = plannedItems.filter((item) => selectedPlanIds.includes(item.id));
    if (!validatePlannedReceiptOrders(plans)) return null;
    return rows;
  }

  function printFaxOnly() {
    const rows = ensurePrintableRows();
    if (!rows) return;
    try {
      printFaxPickupSheet(rows, planDate, printOptions());
    } catch (err) {
      pushToast({ type: 'error', title: '列印失敗', message: errorMessage(err, '請稍後再試') });
    }
  }

  function printSignOnly() {
    const rows = ensurePrintableRows();
    if (!rows) return;
    printSignatureSheet(rows, planDate);
  }

  function printBoth() {
    const rows = ensurePrintableRows();
    if (!rows) return;
    try {
      printFaxAndSignatureSheets(rows, planDate, printOptions());
    } catch (err) {
      pushToast({ type: 'error', title: '列印失敗', message: errorMessage(err, '請稍後再試') });
    }
  }

  function printSingleSignatureFromRecord(record: PickupRecord, caseRow: ArcCase) {
    const appItem = data.applicationItems.find((item) => item.id === caseRow.application_item_id);
    printSignatureSheet([{ caseRow, appItem }], record.pickup_date);
  }

  async function markNotReceived(entry: { recordItem: PickupRecordItem; caseRow: ArcCase }) {
    try {
      await markPickupNotReceived({ recordItem: entry.recordItem, caseRow: entry.caseRow, data, actor: profile });
      pushToast({ type: 'success', title: '已標記本次未領到' });
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '更新失敗', message: errorMessage(err, '請稍後再試') });
    }
  }

  async function confirmDeleteRecord() {
    if (!deleteTarget) return;
    try {
      await deletePickupRecord(deleteTarget, deleteReason.trim() || '管理員刪除傳真領件紀錄', profile);
      pushToast({ type: 'success', title: '已刪除傳真領件紀錄' });
      setDeleteTarget(null);
      setDeleteReason('');
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '刪除失敗', message: errorMessage(err, '請稍後再試') });
    }
  }

  const readyColumns = [
    { key: 'no', title: '編號', render: (_row: ArcCase, index: number) => index + 1 },
    { key: 'feeDate', title: '收費日期', render: (row: ArcCase) => <input className="mini-input date" value={draftFor(row).payment_date} onChange={(e) => setDraft(row.id, 'payment_date', e.target.value)} onBlur={() => savePaymentDate(row)} placeholder="YYYY-MM-DD" /> },
    { key: 'receiptNo', title: '收件編號', render: (row: ArcCase) => <input className="mini-input" value={draftFor(row).receipt_no} onChange={(e) => setDraft(row.id, 'receipt_no', e.target.value)} /> },
    { key: 'ic', title: 'IC 卡', render: (row: ArcCase) => data.applicationItems.find((item) => item.id === row.application_item_id)?.requires_ic_card ? 'V' : '' },
    { key: 'count', title: '張數', render: (row: ArcCase) => <input className="mini-input number" inputMode="numeric" value={draftFor(row).copy_count} onChange={(e) => setDraft(row.id, 'copy_count', e.target.value.replace(/\D/g, ''))} onBlur={() => saveCopyCount(row)} /> },
    { key: 'last4', title: '經手人後四碼', render: (row: ArcCase) => <input className="mini-input number short-code-input" inputMode="numeric" maxLength={4} value={draftFor(row).handler_last4} onChange={(e) => setDraft(row.id, 'handler_last4', normalizeLast4(e.target.value))} /> },
    { key: 'foreign', title: '外字五碼', render: (row: ArcCase) => <input className="mini-input" value={draftFor(row).foreign_no_last5} onChange={(e) => setDraft(row.id, 'foreign_no_last5', e.target.value)} /> },
    { key: 'old', title: '舊卡', render: (row: ArcCase) => <input type="checkbox" checked={draftFor(row).old_card_checked} onChange={(e) => setDraft(row.id, 'old_card_checked', e.target.checked)} /> },
    { key: 'employer', title: '雇主', className: 'prominent-person-cell', render: (row: ArcCase) => row.employer_name },
    { key: 'worker', title: '工人', className: 'prominent-person-cell', render: (row: ArcCase) => row.worker_name },
    { key: 'handler', title: '承辦', render: (row: ArcCase) => row.handler_name },
    { key: 'order', title: '收據順序', render: (row: ArcCase) => <input className="mini-input number" inputMode="numeric" value={draftFor(row).receipt_order} onChange={(e) => changeReceiptOrder(row, e.target.value)} onBlur={() => validateReceiptOrderOnBlur(row)} onKeyDown={(e) => { if (e.key === 'Enter') validateReceiptOrderOnBlur(row); }} /> },
    { key: 'date', title: '領件日', render: (row: ArcCase) => <input type="date" className="mini-input date" value={draftFor(row).expected_pickup_date} onChange={(e) => changeExpectedPickupDate(row, e.target.value)} /> },
    { key: 'action', title: '操作', render: (row: ArcCase) => <div className="action-stack horizontal compact-actions fax-row-actions"><button className="secondary-button mini" onClick={() => addPlan(row)}>加入預計</button><button className="primary-button mini" onClick={() => singlePickup(row)}>單筆領件</button><button className="secondary-button mini" onClick={() => openPickedUp(row)}>已領件</button></div> }
  ];

  const planRows = plannedItems.map((plan) => ({ plan, caseRow: data.cases.find((item) => item.id === plan.case_id)! })).filter((row) => row.caseRow);
  const planColumns = [
    { key: 'check', title: '選取', render: (row: { plan: FaxPickupItem }) => <input type="checkbox" checked={selectedPlanIds.includes(row.plan.id)} onChange={() => togglePlan(row.plan.id)} /> },
    { key: 'date', title: '領件日', render: (row: { plan: FaxPickupItem }) => formatDate(row.plan.expected_pickup_date) },
    { key: 'receipt', title: '收件編號', render: (row: { plan: FaxPickupItem }) => row.plan.receipt_no },
    { key: 'foreign', title: '外字五碼', render: (row: { plan: FaxPickupItem }) => row.plan.foreign_no_last5 },
    { key: 'count', title: '張數', render: (row: { plan: FaxPickupItem; caseRow: ArcCase }) => row.plan.copy_count ?? row.caseRow.copy_count ?? 1 },
    { key: 'last4', title: '經手人後四碼', render: (row: { caseRow: ArcCase }) => row.caseRow.handler_last4 ?? '' },
    { key: 'old', title: '舊卡', render: (row: { caseRow: ArcCase }) => isOldCardChecked(row.caseRow) ? 'V' : '' },
    { key: 'order', title: '收據順序', render: (row: { plan: FaxPickupItem }) => row.plan.receipt_order },
    { key: 'employer', title: '雇主', className: 'prominent-person-cell', render: (row: { caseRow: ArcCase }) => row.caseRow.employer_name },
    { key: 'worker', title: '工人', className: 'prominent-person-cell', render: (row: { caseRow: ArcCase }) => row.caseRow.worker_name },
    { key: 'handler', title: '承辦', render: (row: { caseRow: ArcCase }) => row.caseRow.handler_name },
    { key: 'action', title: '操作', render: (row: { plan: FaxPickupItem; caseRow: ArcCase }) => <button className="danger-link" onClick={() => removePlan(row)}>移除</button> }
  ];

  function totalCopyCountForRecord(record: PickupRecord) {
    const items = data.pickupRecordItems.filter((item) => item.record_id === record.id);
    return items.reduce((sum, item) => {
      const caseRow = data.cases.find((caseEntry) => caseEntry.id === item.case_id);
      const count = Number(caseRow?.copy_count ?? 1);
      return sum + (Number.isInteger(count) && count > 0 ? count : 1);
    }, 0);
  }

  const recordColumns = [
    { key: 'record_no', title: '紀錄編號', render: (row: PickupRecord) => row.record_no },
    { key: 'pickup_date', title: '領件日期', render: (row: PickupRecord) => formatDate(row.pickup_date) },
    { key: 'created_at', title: '建立日期', render: (row: PickupRecord) => formatDate(row.created_at) },
    { key: 'creator', title: '建立人', render: (row: PickupRecord) => row.created_by_name ?? '' },
    { key: 'count', title: '本次案件數', render: (row: PickupRecord) => `${row.case_count} 件` },
    { key: 'totalCopy', title: '本次總張數', render: (row: PickupRecord) => `${row.total_copy_count ?? totalCopyCountForRecord(row)} 張` },
    { key: 'action', title: '操作', render: (row: PickupRecord) => <div className="action-stack horizontal">{canDeletePickupRecord(profile?.role) ? <button className="danger-link" onClick={() => setDeleteTarget(row)}>刪除</button> : null}</div> }
  ];

  return (
    <div className="page-content fax-page">
      <PageHeader title="傳真/領件" description="提醒事項、移民署傳真領件、預計領件區與傳真領件紀錄。" />
      <section className="card">
        <h2>提醒事項</h2>
        <div className="reminder-row">
          {reminders.map((item) => <div key={item.label} className={`reminder-card ${item.today ? 'today' : ''}`}><strong>{item.label}</strong>{item.today ? <span className="today-tag">今天</span> : null}</div>)}
        </div>
        <p className="payment-reminder-text">乾坤、灃禾繳費前請先與財務確認。</p>
      </section>
      <section className="card full-width-card fax-table-card">
        <div className="fax-card-head">
          <h2>移民署傳真領件</h2>
          <strong className="red-reminder">收據順序請寫在領件單右上角!</strong>
          <button type="button" className="secondary-button" onClick={addFilledDraftsToPlan}>已填入資訊的一鍵加入預計</button>
        </div>
        <div className="search-toolbar">
          <SearchInput id="faxPickupSearch" value={keyword} onCommit={setKeyword} placeholder="雇主 / 工人 / 團號 / 收件編號 / 外字五碼搜尋" />
        </div>
        <DataTable columns={readyColumns} rows={readyCases} rowKey={(row) => row.id} emptyText="目前沒有待傳真/領件案件" />
      </section>
      <section className="card full-width-card">
        <div className="toolbar-row align-end">
          <h2>預計領件區</h2>
          <label className="inline-field"><span>領件日</span><input type="date" value={planDate} onChange={(e) => { setPlanDate(e.target.value); setSelectedPlanIds([]); }} /></label>
          <label className="inline-field"><span>列印承辦</span><select value={printHandler} onChange={(e) => setPrintHandler(e.target.value)}><option value="">請選擇</option>{data.people.filter((item) => item.is_enabled && item.show_as_handler).map((item) => <option key={item.id} value={item.display_name}>{item.display_name}</option>)}</select></label>
          <button className="secondary-button" onClick={selectAllPlans}>一鍵勾選</button>
          <button className="ghost-button" onClick={() => setSelectedPlanIds([])}>一鍵取消</button>
          <button className="secondary-button" onClick={printFaxOnly}>列印傳真領件單</button>
          <button className="secondary-button" onClick={printSignOnly}>列印簽收單</button>
          <button className="secondary-button" onClick={printBoth}>列印傳真+簽收</button>
          <button className="primary-button" onClick={() => createRecordForPlanIds(selectedPlanIds)}>建立領件紀錄</button>
        </div>
        <DataTable columns={planColumns} rows={planRows} rowKey={(row) => row.plan.id} emptyText="此領件日沒有預計領件資料" />
      </section>
      <section className="card full-width-card">
        <h2>傳真領件紀錄</h2>
        <DataTable columns={recordColumns} rows={activePickupRecords} rowKey={(row) => row.id} emptyText="目前沒有傳真領件紀錄" />
        {activePickupRecords.slice(0, 5).map((record) => {
          const items = data.pickupRecordItems.filter((item) => item.record_id === record.id).map((recordItem) => ({ recordItem, caseRow: data.cases.find((caseRow) => caseRow.id === recordItem.case_id) })).filter((entry): entry is { recordItem: PickupRecordItem; caseRow: ArcCase } => Boolean(entry.caseRow));
          return (
            <details className="record-detail" key={record.id}>
              <summary>{record.record_no} 明細</summary>
              {items.map((entry) => (
                <div className="record-detail-row" key={entry.recordItem.id}>
                  <span>{entry.caseRow.employer_name}｜{entry.caseRow.worker_name}｜張數 {entry.caseRow.copy_count ?? 1}｜{entry.caseRow.handler_name}</span>
                  <CaseStatusBadge status={entry.caseRow.status} />
                  <button className="secondary-button mini" onClick={() => printSingleSignatureFromRecord(record, entry.caseRow)}>列印簽收單</button>
                  {entry.recordItem.status !== 'not_received' ? <button className="danger-link" onClick={() => markNotReceived(entry)}>本次未領到</button> : null}
                </div>
              ))}
            </details>
          );
        })}
      </section>
      {pickedUpTarget ? (
        <Modal title="確認已領件" onClose={() => setPickedUpTarget(null)}>
          <p>請輸入實際領件日，完成後案件會自移民署傳真領件與預計領件區移除，並保留於案件查詢。</p>
          <div className="summary-box">
            <strong>{pickedUpTarget.employer_name}｜{pickedUpTarget.worker_name}</strong>
            <span>團號：{pickedUpTarget.group_no ?? ''}</span>
          </div>
          <label><span>領件日</span><input value={pickedUpDate} onChange={(e) => setPickedUpDate(e.target.value)} onBlur={() => setPickedUpDate((current) => parseDateLoose(current) ?? current)} placeholder="YYYY-MM-DD" /></label>
          <div className="form-actions"><button className="primary-button" onClick={confirmPickedUp}>確認已領件</button></div>
        </Modal>
      ) : null}
      {deleteTarget ? (
        <Modal title="刪除傳真領件紀錄" onClose={() => setDeleteTarget(null)}>
          <p>確定要刪除此筆傳真領件紀錄嗎？刪除後不可復原。</p>
          <label><span>刪除原因</span><textarea value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} /></label>
          <div className="form-actions"><button className="danger-button" onClick={confirmDeleteRecord}>確認刪除</button></div>
        </Modal>
      ) : null}
    </div>
  );
}
