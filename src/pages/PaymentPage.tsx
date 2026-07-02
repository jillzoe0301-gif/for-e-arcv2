import { useEffect, useMemo, useState } from 'react';
import { cancelCasePayment, createPaymentBatch, removeCaseFromPayment, restoreCaseToPayment, updatePendingPaymentAmount } from '../api/repository';
import { AnnouncementBanner } from '../components/AnnouncementBanner';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { SearchInput } from '../components/SearchInput';
import { CaseStatusBadge } from '../components/StatusBadge';
import { useToast } from '../context/ToastContext';
import type { ArcCase, ArcData, BankAccount, Profile } from '../types';
import { todayTaipei } from '../utils/date';
import { formatMoney, parseMoney } from '../utils/number';
import { canDeleteData } from '../utils/permissions';
import { rowMatchesKeyword } from '../utils/search';

function strictPaymentAmount(value: unknown): number | null {
  const raw = String(value ?? '').normalize('NFKC').trim();
  if (!raw) return null;
  const parsed = parseMoney(raw);
  if (parsed === null || !Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function accountLabel(account: BankAccount, data: ArcData) {
  const broker = data.brokers.find((item) => item.id === account.broker_id);
  const last5 = account.account_last5 ?? account.account_no.slice(-5);
  return `${broker?.name ?? ''}｜${account.account_name}｜後五碼 ${last5}｜餘額 ${formatMoney(account.current_balance)}`;
}

function getAutoAccountId(accounts: BankAccount[]) {
  if (accounts.length === 1) return accounts[0].id;
  const defaultAccount = accounts.find((account) => account.is_default);
  return defaultAccount?.id ?? '';
}

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
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [amountErrors, setAmountErrors] = useState<Record<string, string>>({});
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
  const selectedAccount = data.accounts.find((item) => item.id === accountId);

  function amountForCase(row: ArcCase) {
    return strictPaymentAmount(amountDrafts[row.id] ?? String(row.amount ?? 0)) ?? 0;
  }

  const total = selectedCases.reduce((sum, item) => sum + amountForCase(item), 0);
  const accountWarning = brokerId && filteredAccounts.length === 0
    ? '此仲介尚未設定扣款帳號，請先至系統設定新增帳戶。'
    : '';
  const multiAccountNotice = brokerId && filteredAccounts.length > 1 && !filteredAccounts.some((account) => account.is_default)
    ? '此仲介有多個啟用帳戶，請選擇本次扣款帳號。'
    : '';

  useEffect(() => {
    if (!brokerId) {
      setAccountId('');
      return;
    }
    const accounts = data.accounts.filter((account) => account.is_enabled && account.broker_id === brokerId);
    setAccountId((current) => {
      if (current && accounts.some((account) => account.id === current)) return current;
      return getAutoAccountId(accounts);
    });
  }, [brokerId, data.accounts]);

  async function copyAccount(account: BankAccount) {
    if (brokerId && account.broker_id === brokerId) setAccountId(account.id);
    try {
      await navigator.clipboard.writeText(account.account_no);
      pushToast({ type: 'success', title: '已複製銀行帳號', message: account.account_no });
    } catch {
      pushToast({ type: 'warning', title: '無法自動複製，請手動複製。' });
    }
  }

  function toggle(row: ArcCase) {
    const nextSelected = selectedIds.includes(row.id) ? selectedIds.filter((id) => id !== row.id) : [...selectedIds, row.id];
    const nextCases = pendingCases.filter((item) => nextSelected.includes(item.id));
    const nextBrokerIds = Array.from(new Set(nextCases.map((item) => item.broker_id)));
    if (nextBrokerIds.length > 1) {
      pushToast({ type: 'warning', title: '同一批繳費只能選同一仲介' });
      return;
    }
    setSelectedIds(nextSelected);
    setBrokerId(nextBrokerIds[0] ?? '');
  }

  function selectBrokerCases(targetBrokerId: string) {
    const ids = pendingCases.filter((item) => item.broker_id === targetBrokerId).map((item) => item.id);
    setSelectedIds(ids);
    setBrokerId(targetBrokerId);
  }

  function clearSelected() {
    setSelectedIds([]);
    setBrokerId('');
    setAccountId('');
  }

  function changeAmount(row: ArcCase, value: string) {
    setAmountDrafts((current) => ({ ...current, [row.id]: value }));
    setAmountErrors((current) => {
      const next = { ...current };
      delete next[row.id];
      return next;
    });
  }

  async function saveAmount(row: ArcCase) {
    const raw = amountDrafts[row.id] ?? String(row.amount ?? 0);
    const nextAmount = strictPaymentAmount(raw);
    if (nextAmount === null) {
      setAmountErrors((current) => ({ ...current, [row.id]: '金額格式不正確，請重新輸入。' }));
      pushToast({ type: 'warning', title: '金額格式不正確，請重新輸入。' });
      return;
    }
    setAmountErrors((current) => {
      const next = { ...current };
      delete next[row.id];
      return next;
    });
    if (Number(row.amount ?? 0) === nextAmount) return;
    try {
      await updatePendingPaymentAmount(row, nextAmount, profile);
      pushToast({ type: 'success', title: '待繳金額已更新', message: `${row.case_no}：${formatMoney(nextAmount)} 元` });
      setAmountDrafts((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '金額修改失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }

  async function submitBatch() {
    if (!selectedIds.length) return pushToast({ type: 'warning', title: '請先勾選待繳案件' });
    if (selectedBrokerIds.length !== 1) return pushToast({ type: 'warning', title: '同一批繳費只能選同一仲介' });
    if (accountWarning) return pushToast({ type: 'warning', title: accountWarning });
    if (!accountId) return pushToast({ type: 'warning', title: '請選擇扣款帳號' });
    if (!selectedAccount || selectedAccount.broker_id !== brokerId) return pushToast({ type: 'warning', title: '請選擇該仲介的扣款帳號' });
    const invalidCase = selectedCases.find((caseRow) => strictPaymentAmount(amountDrafts[caseRow.id] ?? String(caseRow.amount ?? 0)) === null);
    if (invalidCase) {
      setAmountErrors((current) => ({ ...current, [invalidCase.id]: '金額格式不正確，請重新輸入。' }));
      return pushToast({ type: 'warning', title: '金額格式不正確，請重新輸入。', message: invalidCase.case_no });
    }
    const amountOverrides = Object.fromEntries(selectedCases.map((caseRow) => [caseRow.id, amountForCase(caseRow)]));
    setSubmitting(true);
    try {
      await createPaymentBatch({ caseIds: selectedIds, brokerId, accountId, paymentDate, payerName, data, actor: profile, amountOverrides });
      pushToast({ type: 'success', title: '繳費批次已建立', message: `共 ${selectedIds.length} 筆，金額 ${formatMoney(total)} 元。` });
      clearSelected();
      setAmountDrafts({});
      setAmountErrors({});
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

  async function removeCancelled(row: ArcCase) {
    if (!canDeleteData(profile?.role)) {
      pushToast({ type: 'warning', title: '您沒有刪除權限。' });
      return;
    }
    if (!window.confirm('確定要刪除此筆資料嗎？刪除後不可復原。')) return;
    try {
      await removeCaseFromPayment(row, profile);
      pushToast({ type: 'success', title: '取消案件已從繳費頁移除' });
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '刪除失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }

  async function removePending(row: ArcCase) {
    if (!canDeleteData(profile?.role)) {
      pushToast({ type: 'warning', title: '您沒有刪除權限。' });
      return;
    }
    if (!window.confirm('確定要刪除此筆待繳案件嗎？刪除後不可復原。')) return;
    try {
      await removeCaseFromPayment(row, profile);
      pushToast({ type: 'success', title: '已從居留證繳費頁移除', message: '案件主資料仍保留於案件查詢。' });
      setSelectedIds((ids) => ids.filter((id) => id !== row.id));
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '刪除失敗', message: err instanceof Error ? err.message : '請稍後再試' });
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
    { key: 'amount', title: '金額', render: (row: ArcCase) => <div className="amount-edit-wrap"><input className={`mini-input payment-amount-field ${amountErrors[row.id] ? 'error' : ''}`} inputMode="decimal" value={amountDrafts[row.id] ?? String(row.amount ?? 0)} onChange={(event) => changeAmount(row, event.target.value)} onBlur={() => saveAmount(row)} disabled={!profile} />{amountErrors[row.id] ? <span className="inline-error">{amountErrors[row.id]}</span> : null}</div> },
    { key: 'action', title: '操作', render: (row: ArcCase) => <div className="action-stack horizontal"><button className="danger-link" type="button" onClick={() => setCancelTarget(row)}>取消繳費</button>{canDeleteData(profile?.role) ? <button className="danger-link" type="button" onClick={() => removePending(row)}>刪除</button> : null}</div> }
  ];

  const cancelledColumns = [
    { key: 'case_no', title: '案件編號', render: (row: ArcCase) => row.case_no },
    { key: 'status', title: '狀態', render: (row: ArcCase) => <CaseStatusBadge status={row.status} /> },
    { key: 'employer', title: '雇主', render: (row: ArcCase) => row.employer_name },
    { key: 'worker', title: '工人', render: (row: ArcCase) => row.worker_name },
    { key: 'reason', title: '取消原因', render: (row: ArcCase) => row.cancelled_reason ?? '' },
    { key: 'restore', title: '操作', render: (row: ArcCase) => <div className="action-stack horizontal"><button className="secondary-button mini" onClick={() => restore(row)}>恢復待繳</button>{canDeleteData(profile?.role) ? <button className="danger-link" onClick={() => removeCancelled(row)}>刪除</button> : null}</div> }
  ];

  return (
    <div className="page-content">
      <PageHeader title="居留證繳費" description="待繳案件依仲介分開；同一批繳費只能選同一仲介。" />
      <AnnouncementBanner items={data.announcements} page="居留證繳費" />
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

        <div className="account-balance-strip">
          <h3>仲介銀行帳戶餘額</h3>
          <div className="account-balance-grid compact">
            {data.accounts.filter((account) => !brokerId || account.broker_id === brokerId).map((account) => (
              <button type="button" className={`balance-card copy-card ${account.id === accountId ? 'selected' : ''}`} key={account.id} onClick={() => copyAccount(account)} title="點擊複製銀行帳號；若已選仲介也會選定此扣款帳號">
                <span>{accountLabel(account, data)}{account.is_default ? '｜預設' : ''}</span>
                <strong>{formatMoney(account.current_balance)}</strong>
                <small>點擊複製帳號{brokerId && account.broker_id === brokerId ? ' / 選定扣款帳號' : ''}</small>
              </button>
            ))}
          </div>
          {selectedAccount ? <p className="selected-balance-text">目前選擇帳戶餘額：{formatMoney(selectedAccount.current_balance)} 元</p> : null}
          {accountWarning ? <p className="account-warning">{accountWarning}</p> : null}
        </div>
        <div className="payment-panel">
          <label><span>繳費日期</span><input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></label>
          <label><span>繳款人</span><input value={payerName} onChange={(e) => setPayerName(e.target.value)} /></label>
          <label><span>仲介</span><select value={brokerId} onChange={(e) => { setBrokerId(e.target.value); setSelectedIds([]); }}><option value="">請由勾選案件帶入</option>{data.brokers.map((broker) => <option key={broker.id} value={broker.id}>{broker.name}</option>)}</select></label>
          <label><span>扣款帳號</span><select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">請選擇</option>{filteredAccounts.map((account) => <option key={account.id} value={account.id}>{accountLabel(account, data)}{account.is_default ? '｜預設' : ''}</option>)}</select>{multiAccountNotice ? <small className="payment-account-option-text">{multiAccountNotice}</small> : null}</label>
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
