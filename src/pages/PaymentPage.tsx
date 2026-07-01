import { useMemo, useState } from 'react';
import { cancelCasePayment, createPaymentBatch, restoreCaseToPayment } from '../api/repository';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { SearchInput } from '../components/SearchInput';
import { CaseStatusBadge } from '../components/StatusBadge';
import { useToast } from '../context/ToastContext';
import type { ArcCase, ArcData, Profile } from '../types';
import { todayTaipei } from '../utils/date';
import { formatMoney } from '../utils/number';
import { rowMatchesKeyword } from '../utils/search';

export function PaymentPage({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [keyword, setKeyword] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [brokerId, setBrokerId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [payerName, setPayerName] = useState(profile?.display_name ?? '');
  const [paymentDate, setPaymentDate] = useState(todayTaipei());
  const [cancelTarget, setCancelTarget] = useState<ArcCase | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pendingCases = useMemo(() => data.cases.filter((caseRow) =>
    caseRow.status === 'pending_payment' && rowMatchesKeyword(keyword, [caseRow.employer_name, caseRow.worker_name, caseRow.group_no, caseRow.case_no])
  ), [data.cases, keyword]);

  const cancelledCases = useMemo(() => data.cases.filter((caseRow) =>
    caseRow.status === 'cancelled' && rowMatchesKeyword(keyword, [caseRow.employer_name, caseRow.worker_name, caseRow.group_no, caseRow.case_no])
  ), [data.cases, keyword]);

  const selectedCases = pendingCases.filter((item) => selectedIds.includes(item.id));
  const selectedBrokerIds = Array.from(new Set(selectedCases.map((item) => item.broker_id)));
  const filteredAccounts = data.accounts.filter((account) => account.is_enabled && account.broker_id === brokerId);
  const total = selectedCases.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);

  function toggle(row: ArcCase) {
    const nextSelected = selectedIds.includes(row.id) ? selectedIds.filter((id) => id !== row.id) : [...selectedIds, row.id];
    const nextCases = pendingCases.filter((item) => nextSelected.includes(item.id));
    const nextBrokerIds = Array.from(new Set(nextCases.map((item) => item.broker_id)));
    if (nextBrokerIds.length > 1) {
      pushToast({ type: 'warning', title: '同一批繳費只能選同一仲介' });
      return;
    }
    setSelectedIds(nextSelected);
    const nextBrokerId = nextBrokerIds[0] ?? '';
    setBrokerId(nextBrokerId);
    setAccountId((current) => data.accounts.some((account) => account.id === current && account.broker_id === nextBrokerId) ? current : '');
  }

  function selectBrokerCases(targetBrokerId: string) {
    const ids = pendingCases.filter((item) => item.broker_id === targetBrokerId).map((item) => item.id);
    setSelectedIds(ids);
    setBrokerId(targetBrokerId);
    setAccountId('');
  }

  function clearSelected() {
    setSelectedIds([]);
    setBrokerId('');
    setAccountId('');
  }

  async function submitBatch() {
    if (!selectedIds.length) return pushToast({ type: 'warning', title: '請先勾選待繳案件' });
    if (selectedBrokerIds.length !== 1) return pushToast({ type: 'warning', title: '同一批繳費只能選同一仲介' });
    if (!accountId) return pushToast({ type: 'warning', title: '請選擇扣款帳號' });
    setSubmitting(true);
    try {
      await createPaymentBatch({ caseIds: selectedIds, brokerId, accountId, paymentDate, payerName, data, actor: profile });
      pushToast({ type: 'success', title: '繳費批次已建立', message: `共 ${selectedIds.length} 筆，金額 ${formatMoney(total)} 元。` });
      clearSelected();
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '建立批次失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) return pushToast({ type: 'warning', title: '請輸入取消原因' });
    try {
      await cancelCasePayment(cancelTarget, cancelReason.trim(), profile);
      pushToast({ type: 'success', title: '已取消繳費' });
      setCancelTarget(null);
      setCancelReason('');
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '取消失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }

  async function restore(row: ArcCase) {
    const reason = window.prompt('請輸入恢復待繳原因') || '';
    if (!reason.trim()) return;
    try {
      await restoreCaseToPayment(row, reason, profile);
      pushToast({ type: 'success', title: '已恢復為待繳' });
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '恢復失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }

  const columns = [
    { key: 'check', title: '選取', render: (row: ArcCase) => <input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggle(row)} /> },
    { key: 'case_no', title: '案件編號', render: (row: ArcCase) => row.case_no },
    { key: 'broker', title: '仲介', render: (row: ArcCase) => data.brokers.find((item) => item.id === row.broker_id)?.name ?? '' },
    { key: 'handler', title: '承辦', render: (row: ArcCase) => row.handler_name },
    { key: 'employer', title: '雇主', render: (row: ArcCase) => row.employer_name },
    { key: 'worker', title: '工人', render: (row: ArcCase) => row.worker_name },
    { key: 'group', title: '團號', render: (row: ArcCase) => row.group_no ?? '' },
    { key: 'item', title: '申請項目', render: (row: ArcCase) => data.applicationItems.find((item) => item.id === row.application_item_id)?.name ?? '' },
    { key: 'amount', title: '金額', render: (row: ArcCase) => formatMoney(row.amount) },
    { key: 'action', title: '操作', render: (row: ArcCase) => <button className="danger-link" type="button" onClick={() => setCancelTarget(row)}>取消繳費</button> }
  ];

  const cancelledColumns = [
    { key: 'case_no', title: '案件編號', render: (row: ArcCase) => row.case_no },
    { key: 'status', title: '狀態', render: (row: ArcCase) => <CaseStatusBadge status={row.status} /> },
    { key: 'employer', title: '雇主', render: (row: ArcCase) => row.employer_name },
    { key: 'worker', title: '工人', render: (row: ArcCase) => row.worker_name },
    { key: 'reason', title: '取消原因', render: (row: ArcCase) => row.cancelled_reason ?? '' },
    { key: 'restore', title: '操作', render: (row: ArcCase) => <button className="secondary-button mini" onClick={() => restore(row)}>恢復待繳</button> }
  ];

  return (
    <div className="page-content">
      <PageHeader title="居留證繳費" description="待繳案件依仲介分開；同一批繳費只能選同一仲介。" />
      <section className="card full-width-card">
        <div className="search-toolbar">
          <SearchInput id="pendingPaymentSearch" value={keyword} onCommit={setKeyword} placeholder="搜尋待繳案件：雇主、工人、團號、案件編號" />
        </div>
        <div className="broker-action-row">
          {data.brokers.filter((item) => item.is_enabled).map((broker) => (
            <button key={broker.id} className="secondary-button" type="button" onClick={() => selectBrokerCases(broker.id)}>{broker.name} 一鍵勾選</button>
          ))}
          <button className="ghost-button" type="button" onClick={clearSelected}>一鍵取消</button>
        </div>
        <div className="payment-panel">
          <label><span>繳費日期</span><input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></label>
          <label><span>繳款人</span><input value={payerName} onChange={(e) => setPayerName(e.target.value)} /></label>
          <label><span>仲介</span><select value={brokerId} onChange={(e) => { setBrokerId(e.target.value); setSelectedIds([]); setAccountId(''); }}><option value="">請由勾選案件帶入</option>{data.brokers.map((broker) => <option key={broker.id} value={broker.id}>{broker.name}</option>)}</select></label>
          <label><span>扣款帳號</span><select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">請選擇</option>{filteredAccounts.map((account) => <option key={account.id} value={account.id}>{account.account_name}｜餘額 {formatMoney(account.current_balance)}</option>)}</select></label>
          <div className="payment-summary"><span>已選 {selectedIds.length} 件</span><strong>{formatMoney(total)} 元</strong></div>
          <button className="primary-button" onClick={submitBatch} disabled={submitting}>建立繳費批次</button>
        </div>
        <div className="result-area scroll-result">
          <DataTable columns={columns} rows={pendingCases} rowKey={(row) => row.id} emptyText="沒有待繳案件" />
        </div>
      </section>
      <section className="card full-width-card">
        <h2>取消案件 / 可恢復待繳</h2>
        <DataTable columns={cancelledColumns} rows={cancelledCases} rowKey={(row) => row.id} emptyText="目前沒有取消案件" />
      </section>
      {cancelTarget ? (
        <Modal title="取消繳費" onClose={() => setCancelTarget(null)}>
          <p>案件：{cancelTarget.case_no}｜{cancelTarget.employer_name}｜{cancelTarget.worker_name}</p>
          <label><span>取消原因</span><textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></label>
          <div className="form-actions"><button className="danger-button" onClick={confirmCancel}>確認取消</button></div>
        </Modal>
      ) : null}
    </div>
  );
}
