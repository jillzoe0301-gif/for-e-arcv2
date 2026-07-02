import { useMemo, useState } from 'react';
import { addFaxPickupPlan, createPickupRecord, deletePickupRecord, markCasePickedUp, markPickupNotReceived } from '../api/repository';
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

type DraftMap = Record<string, { receipt_no: string; foreign_no_last5: string; receipt_order: string; expected_pickup_date: string; fax_date: string }>;

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

  const readyCases = useMemo(() => data.cases
    .filter((caseRow) => ['pending_pickup', 'not_received'].includes(caseRow.status))
    .filter((caseRow) => rowMatchesKeyword(keyword, [caseRow.employer_name, caseRow.worker_name, caseRow.group_no, caseRow.case_no, caseRow.receipt_no, caseRow.foreign_no_last5]))
    .sort((a, b) =>
      String(a.payment_date ?? a.application_date).localeCompare(String(b.payment_date ?? b.application_date)) ||
      String(a.receipt_no ?? '').localeCompare(String(b.receipt_no ?? ''), 'zh-Hant', { numeric: true }) ||
      String(a.foreign_no_last5 ?? '').localeCompare(String(b.foreign_no_last5 ?? ''), 'zh-Hant', { numeric: true })
    ), [data.cases, keyword]);

  const plannedItems = useMemo(() => data.faxPickupItems
    .filter((item) => item.status === 'pending' && item.expected_pickup_date === planDate)
    .sort((a, b) =>
      String(data.cases.find((caseRow) => caseRow.id === a.case_id)?.payment_date ?? '').localeCompare(String(data.cases.find((caseRow) => caseRow.id === b.case_id)?.payment_date ?? '')) ||
      String(a.receipt_no).localeCompare(String(b.receipt_no), 'zh-Hant', { numeric: true }) ||
      String(a.foreign_no_last5).localeCompare(String(b.foreign_no_last5), 'zh-Hant', { numeric: true })
    ), [data.cases, data.faxPickupItems, planDate]);

  const activePickupRecords = useMemo(() => data.pickupRecords.filter((record) => !record.deleted_at), [data.pickupRecords]);

  function draftFor(caseRow: ArcCase) {
    return drafts[caseRow.id] ?? {
      receipt_no: caseRow.receipt_no ?? '',
      foreign_no_last5: caseRow.foreign_no_last5 ?? '',
      receipt_order: String(caseRow.receipt_order ?? ''),
      fax_date: caseRow.fax_date ?? todayTaipei(),
      expected_pickup_date: caseRow.expected_pickup_date ?? nextWeekThursday()
    };
  }

  function setDraft(caseId: string, key: keyof DraftMap[string], value: string) {
    setDrafts((current) => ({ ...current, [caseId]: { ...draftFor(data.cases.find((item) => item.id === caseId) as ArcCase), [key]: value } }));
  }

  async function addPlan(caseRow: ArcCase) {
    const draft = draftFor(caseRow);
    if (!draft.receipt_no.trim() || !draft.foreign_no_last5.trim() || !draft.receipt_order.trim()) {
      pushToast({ type: 'warning', title: '請補齊資料', message: '收件編號、外字末五碼、收據順序都必填。' });
      return;
    }
    const order = Number(draft.receipt_order);
    if (!Number.isInteger(order) || order <= 0) {
      pushToast({ type: 'warning', title: '收據順序格式錯誤' });
      return;
    }
    try {
      await addFaxPickupPlan({
        caseRow,
        receiptNo: draft.receipt_no.trim(),
        foreignNoLast5: draft.foreign_no_last5.trim(),
        receiptOrder: order,
        faxDate: draft.fax_date || todayTaipei(),
        expectedPickupDate: draft.expected_pickup_date || nextWeekThursday(),
        data,
        actor: profile
      });
      pushToast({ type: 'success', title: '已加入預計領件區' });
      setPlanDate(draft.expected_pickup_date || nextWeekThursday());
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '加入失敗', message: err instanceof Error ? err.message : '請檢查收據順序是否重複' });
    }
  }

  function togglePlan(planId: string) {
    setSelectedPlanIds((current) => current.includes(planId) ? current.filter((id) => id !== planId) : [...current, planId]);
  }

  function selectAllPlans() {
    setSelectedPlanIds(plannedItems.map((item) => item.id));
  }

  async function createRecordForPlanIds(planIds: string[]) {
    const selectedPlans = plannedItems.filter((item) => planIds.includes(item.id));
    const caseIds = selectedPlans.map((item) => item.case_id);
    try {
      const record = await createPickupRecord({ caseIds, pickupDate: planDate, data, actor: profile });
      pushToast({ type: 'success', title: '已建立傳真領件紀錄', message: record.record_no });
      setSelectedPlanIds([]);
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '建立紀錄失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }

  async function singlePickup(caseRow: ArcCase) {
    const draft = draftFor(caseRow);
    const plan = data.faxPickupItems.find((item) => item.case_id === caseRow.id && item.status === 'pending');
    try {
      if (!plan) {
        if (!draft.receipt_no.trim() || !draft.foreign_no_last5.trim() || !draft.receipt_order.trim()) {
          pushToast({ type: 'warning', title: '請補齊資料', message: '單筆領件前需填收件編號、外字末五碼、收據順序。' });
          return;
        }
        const order = Number(draft.receipt_order);
        if (!Number.isInteger(order) || order <= 0) {
          pushToast({ type: 'warning', title: '收據順序格式錯誤' });
          return;
        }
        await addFaxPickupPlan({
          caseRow,
          receiptNo: draft.receipt_no.trim(),
          foreignNoLast5: draft.foreign_no_last5.trim(),
          receiptOrder: order,
          faxDate: draft.fax_date || todayTaipei(),
          expectedPickupDate: draft.expected_pickup_date || nextWeekThursday(),
          data,
          actor: profile
        });
        const pickupDate = draft.expected_pickup_date || nextWeekThursday();
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
      pushToast({ type: 'error', title: '單筆領件失敗', message: err instanceof Error ? err.message : '請稍後再試' });
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
      pushToast({ type: 'error', title: '已領件失敗', message: err instanceof Error ? err.message : '請稍後再試' });
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
    return rows;
  }

  function printFaxOnly() {
    const rows = ensurePrintableRows();
    if (!rows) return;
    printFaxPickupSheet(rows, planDate, printOptions());
  }

  function printSignOnly() {
    const rows = ensurePrintableRows();
    if (!rows) return;
    printSignatureSheet(rows, planDate);
  }

  function printBoth() {
    const rows = ensurePrintableRows();
    if (!rows) return;
    printFaxAndSignatureSheets(rows, planDate, printOptions());
  }

  async function markNotReceived(entry: { recordItem: PickupRecordItem; caseRow: ArcCase }) {
    try {
      await markPickupNotReceived({ recordItem: entry.recordItem, caseRow: entry.caseRow, data, actor: profile });
      pushToast({ type: 'success', title: '已標記本次未領到' });
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '更新失敗', message: err instanceof Error ? err.message : '請稍後再試' });
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
      pushToast({ type: 'error', title: '刪除失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }

  const readyColumns = [
    { key: 'no', title: '編號', render: (_row: ArcCase, index: number) => index + 1 },
    { key: 'feeDate', title: '收費日期', render: (row: ArcCase) => formatDate(row.payment_date) },
    { key: 'receiptNo', title: '收件編號', render: (row: ArcCase) => <input className="mini-input" value={draftFor(row).receipt_no} onChange={(e) => setDraft(row.id, 'receipt_no', e.target.value)} /> },
    { key: 'ic', title: 'IC 卡', render: (row: ArcCase) => data.applicationItems.find((item) => item.id === row.application_item_id)?.requires_ic_card ? 'V' : '' },
    { key: 'count', title: '張數', render: () => '1' },
    { key: 'last4', title: '經手人後四碼', render: () => '' },
    { key: 'foreign', title: '外字五碼', render: (row: ArcCase) => <input className="mini-input" value={draftFor(row).foreign_no_last5} onChange={(e) => setDraft(row.id, 'foreign_no_last5', e.target.value)} /> },
    { key: 'old', title: '舊卡', render: (row: ArcCase) => data.applicationItems.find((item) => item.id === row.application_item_id)?.requires_old_card ? 'V' : '' },
    { key: 'employer', title: '雇主', render: (row: ArcCase) => row.employer_name },
    { key: 'worker', title: '工人', render: (row: ArcCase) => row.worker_name },
    { key: 'handler', title: '承辦', render: (row: ArcCase) => row.handler_name },
    { key: 'order', title: '收據順序', render: (row: ArcCase) => <input className="mini-input number" value={draftFor(row).receipt_order} onChange={(e) => setDraft(row.id, 'receipt_order', e.target.value)} /> },
    { key: 'date', title: '領件日', render: (row: ArcCase) => <input type="date" className="mini-input date" value={draftFor(row).expected_pickup_date} onChange={(e) => setDraft(row.id, 'expected_pickup_date', e.target.value)} /> },
    { key: 'action', title: '操作', render: (row: ArcCase) => <div className="action-stack"><button className="secondary-button mini" onClick={() => addPlan(row)}>加入預計</button><button className="primary-button mini" onClick={() => singlePickup(row)}>單筆領件</button><button className="secondary-button mini" onClick={() => openPickedUp(row)}>已領件</button></div> }
  ];

  const planRows = plannedItems.map((plan) => ({ plan, caseRow: data.cases.find((item) => item.id === plan.case_id)! })).filter((row) => row.caseRow);
  const planColumns = [
    { key: 'check', title: '選取', render: (row: { plan: FaxPickupItem }) => <input type="checkbox" checked={selectedPlanIds.includes(row.plan.id)} onChange={() => togglePlan(row.plan.id)} /> },
    { key: 'date', title: '領件日', render: (row: { plan: FaxPickupItem }) => formatDate(row.plan.expected_pickup_date) },
    { key: 'receipt', title: '收件編號', render: (row: { plan: FaxPickupItem }) => row.plan.receipt_no },
    { key: 'foreign', title: '外字五碼', render: (row: { plan: FaxPickupItem }) => row.plan.foreign_no_last5 },
    { key: 'order', title: '收據順序', render: (row: { plan: FaxPickupItem }) => row.plan.receipt_order },
    { key: 'employer', title: '雇主', render: (row: { caseRow: ArcCase }) => row.caseRow.employer_name },
    { key: 'worker', title: '工人', render: (row: { caseRow: ArcCase }) => row.caseRow.worker_name },
    { key: 'handler', title: '承辦', render: (row: { caseRow: ArcCase }) => row.caseRow.handler_name }
  ];

  const recordColumns = [
    { key: 'record_no', title: '紀錄編號', render: (row: PickupRecord) => row.record_no },
    { key: 'pickup_date', title: '領件日期', render: (row: PickupRecord) => formatDate(row.pickup_date) },
    { key: 'created_at', title: '建立日期', render: (row: PickupRecord) => formatDate(row.created_at) },
    { key: 'creator', title: '建立人', render: (row: PickupRecord) => row.created_by_name ?? '' },
    { key: 'count', title: '本次領件案件數', render: (row: PickupRecord) => row.case_count },
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
                  <span>{entry.caseRow.employer_name}｜{entry.caseRow.worker_name}｜{entry.caseRow.handler_name}</span>
                  <CaseStatusBadge status={entry.caseRow.status} />
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
