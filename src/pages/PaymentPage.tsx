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

function isNoBalanceBrokerName(name: string | undefined) {
  return Boolean(name && (name.includes('灃禾') || name.includes('乾坤')));
}

function accountLabel(account: BankAccount, data: ArcData, showBalance = true) {
  const broker = data.brokers.find((item) => item.id === account.broker_id);
  const last5 = account.account_last5 ?? account.account_no.slice(-5);
  const base = `${broker?.name ?? ''}｜${account.account_name}｜後五碼 ${last5}`;
  return showBalance ? `${base}｜餘額 ${formatMoney(account.current_balance)}` : base;
}

function shortAccountLabel(account: BankAccount) {
  const last5 = account.account_last5 ?? account.account_no.slice(-5);
  return `${account.account_name}｜後五碼 ${last5}`;
}

function getAutoAccountId(accounts: BankAccount[]) {
  if (accounts.length === 1) return accounts[0].id;
  const defaultAccount = accounts.find((account) => account.is_default);
  return defaultAccount?.id ?? '';
}

interface BrokerPaymentMeta {
  paymentDate?: string;
  payerName?: string;
}

export function PaymentPage({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [keyword, setKeyword] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [defaultPaymentDate] = useState(todayTaipei());
  const [cancelTarget, setCancelTarget] = useState<ArcCase | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [amountErrors, setAmountErrors] = useState<Record<string, string>>({});
  const [accountIdsByBroker, setAccountIdsByBroker] = useState<Record<string, string>>({});
  const [paymentMetaByBroker, setPaymentMetaByBroker] = useState<Record<string, BrokerPaymentMeta>>({});
  const [submittingBrokerId, setSubmittingBrokerId] = useState<string | null>(null);

  const pendingCases = useMemo(() => data.cases.filter((caseRow) =>
    caseRow.status === 'pending_payment' && rowMatchesKeyword(keyword, [caseRow.employer_name, caseRow.worker_name, caseRow.group_no, caseRow.case_no])
  ), [data.cases, keyword]);

  const cancelledCases = useMemo(() => data.cases.filter((caseRow) =>
    caseRow.status === 'cancelled' && rowMatchesKeyword(keyword, [caseRow.employer_name, caseRow.worker_name, caseRow.group_no, caseRow.case_no])
  ), [data.cases, keyword]);

  function amountForCase(row: ArcCase) {
    return strictPaymentAmount(amountDrafts[row.id] ?? String(row.amount ?? 0)) ?? 0;
  }

  function getBrokerMeta(brokerId: string) {
    const meta = paymentMetaByBroker[brokerId] ?? {};
    return {
      paymentDate: meta.paymentDate ?? defaultPaymentDate,
      payerName: meta.payerName ?? profile?.display_name ?? ''
    };
  }

  function updateBrokerMeta(brokerId: string, patch: BrokerPaymentMeta) {
    setPaymentMetaByBroker((current) => ({
      ...current,
      [brokerId]: { ...(current[brokerId] ?? {}), ...patch }
    }));
  }

  useEffect(() => {
    setAccountIdsByBroker((current) => {
      const next = { ...current };
      for (const broker of data.brokers.filter((item) => item.is_enabled)) {
        const accounts = data.accounts.filter((account) => account.is_enabled && account.broker_id === broker.id);
        const currentAccountId = current[broker.id];
        if (currentAccountId && accounts.some((account) => account.id === currentAccountId)) continue;
        const autoAccountId = getAutoAccountId(accounts);
        if (autoAccountId) next[broker.id] = autoAccountId;
        else delete next[broker.id];
      }
      return next;
    });
  }, [data.accounts, data.brokers]);

  const brokerGroups = useMemo(() => data.brokers
    .filter((broker) => broker.is_enabled)
    .map((broker) => {
      const cases = pendingCases.filter((caseRow) => caseRow.broker_id === broker.id);
      const accounts = data.accounts.filter((account) => account.is_enabled && account.broker_id === broker.id);
      const selectedCases = cases.filter((caseRow) => selectedIds.includes(caseRow.id));
      const selectedAccountId = accountIdsByBroker[broker.id] ?? getAutoAccountId(accounts);
      const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;
      const pendingTotal = cases.reduce((sum, caseRow) => sum + amountForCase(caseRow), 0);
      const selectedTotal = selectedCases.reduce((sum, caseRow) => sum + amountForCase(caseRow), 0);
      const accountWarning = accounts.length === 0 ? '此仲介尚未設定扣款帳號，請先至系統設定新增帳戶。' : '';
      const multiAccountNotice = accounts.length > 1 && !accounts.some((account) => account.is_default)
        ? '此仲介有多個啟用帳戶，請選擇本次扣款帳號。'
        : '';
      return { broker, cases, accounts, selectedCases, selectedAccountId, selectedAccount, pendingTotal, selectedTotal, accountWarning, multiAccountNotice };
    })
    .filter((group) => group.cases.length > 0), [accountIdsByBroker, amountDrafts, data.accounts, data.brokers, pendingCases, selectedIds]);

  async function copyAccount(account: BankAccount) {
    setAccountIdsByBroker((current) => ({ ...current, [account.broker_id]: account.id }));
    try {
      await navigator.clipboard.writeText(account.account_no);
      pushToast({ type: 'success', title: '已複製銀行帳號', message: account.account_no });
    } catch {
      pushToast({ type: 'warning', title: '無法自動複製，請手動複製。' });
    }
  }

  function setBrokerAccountId(brokerId: string, accountId: string) {
    setAccountIdsByBroker((current) => ({ ...current, [brokerId]: accountId }));
  }

  function toggle(row: ArcCase) {
    setSelectedIds((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id]);
  }

  function selectBrokerCases(targetBrokerId: string) {
    const ids = pendingCases.filter((item) => item.broker_id === targetBrokerId).map((item) => item.id);
    setSelectedIds((current) => Array.from(new Set([...current, ...ids])));
  }

  function clearBrokerSelection(targetBrokerId: string) {
    const ids = new Set(pendingCases.filter((item) => item.broker_id === targetBrokerId).map((item) => item.id));
    setSelectedIds((current) => current.filter((id) => !ids.has(id)));
  }

  function clearSelected() {
    setSelectedIds([]);
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

  async function submitBrokerBatch(brokerId: string) {
    const broker = data.brokers.find((item) => item.id === brokerId);
    const selectedCases = pendingCases.filter((caseRow) => caseRow.broker_id === brokerId && selectedIds.includes(caseRow.id));
    const accountId = accountIdsByBroker[brokerId] ?? '';
    const selectedAccount = data.accounts.find((item) => item.id === accountId && item.is_enabled);
    const accounts = data.accounts.filter((item) => item.is_enabled && item.broker_id === brokerId);
    const { paymentDate, payerName } = getBrokerMeta(brokerId);

    if (!selectedCases.length) return pushToast({ type: 'warning', title: `請先勾選${broker?.name ?? '此仲介'}待繳案件` });
    if (accounts.length === 0) return pushToast({ type: 'warning', title: '此仲介尚未設定扣款帳號，請先至系統設定新增帳戶。' });
    if (!accountId) return pushToast({ type: 'warning', title: '請選擇扣款帳號' });
    if (!selectedAccount || selectedAccount.broker_id !== brokerId) return pushToast({ type: 'warning', title: '請選擇該仲介的扣款帳號' });
    const invalidCase = selectedCases.find((caseRow) => strictPaymentAmount(amountDrafts[caseRow.id] ?? String(caseRow.amount ?? 0)) === null);
    if (invalidCase) {
      setAmountErrors((current) => ({ ...current, [invalidCase.id]: '金額格式不正確，請重新輸入。' }));
      return pushToast({ type: 'warning', title: '金額格式不正確，請重新輸入。', message: invalidCase.case_no });
    }
    const amountOverrides = Object.fromEntries(selectedCases.map((caseRow) => [caseRow.id, amountForCase(caseRow)]));
    const total = selectedCases.reduce((sum, caseRow) => sum + amountForCase(caseRow), 0);
    setSubmittingBrokerId(brokerId);
    try {
      await createPaymentBatch({ caseIds: selectedCases.map((caseRow) => caseRow.id), brokerId, accountId, paymentDate, payerName, data, actor: profile, amountOverrides });
      pushToast({ type: 'success', title: `${broker?.name ?? '此仲介'}繳費批次已建立`, message: `共 ${selectedCases.length} 筆，金額 ${formatMoney(total)} 元。` });
      clearBrokerSelection(brokerId);
      setAmountDrafts((current) => {
        const next = { ...current };
        for (const caseRow of selectedCases) delete next[caseRow.id];
        return next;
      });
      setAmountErrors((current) => {
        const next = { ...current };
        for (const caseRow of selectedCases) delete next[caseRow.id];
        return next;
      });
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '建立批次失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setSubmittingBrokerId(null);
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
    { key: 'handler', title: '承辦', render: (row: ArcCase) => row.handler_name },
    { key: 'employer', title: '雇主', render: (row: ArcCase) => row.employer_name },
    { key: 'worker', title: '工人', render: (row: ArcCase) => row.worker_name },
    { key: 'group', title: '團號', render: (row: ArcCase) => row.group_no ?? '' },
    { key: 'item', title: '申請項目', render: (row: ArcCase) => data.applicationItems.find((item) => item.id === row.application_item_id)?.name ?? '' },
    { key: 'date', title: '申請日 / 收費日期', render: (row: ArcCase) => row.application_date ?? '' },
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
    <div className="page-content payment-page">
      <PageHeader title="居留證繳費" description="待繳案件依仲介分區顯示；每個仲介區塊可獨立選帳戶、勾選與扣款。" />
      <AnnouncementBanner items={data.announcements} page="居留證繳費" />
      <div className="payment-fixed-warning">乾坤、灃禾繳費前請先與財務確認。</div>
      <section className="card full-width-card payment-search-card">
        <div className="search-toolbar payment-search-toolbar">
          <SearchInput id="pendingPaymentSearch" value={keyword} onCommit={setKeyword} placeholder="搜尋待繳案件：雇主、工人、團號、案件編號" />
          <button className="ghost-button" type="button" onClick={clearSelected}>全部取消勾選</button>
        </div>
      </section>

      <div className="payment-broker-groups">
        {brokerGroups.length ? brokerGroups.map((group) => {
          const { broker, cases, accounts, selectedCases, selectedAccount, selectedAccountId, pendingTotal, selectedTotal, accountWarning, multiAccountNotice } = group;
          const meta = getBrokerMeta(broker.id);
          const hideBalance = isNoBalanceBrokerName(broker.name);
          return (
            <section className="broker-payment-card" key={broker.id}>
              <div className="broker-payment-head">
                <div>
                  <h2>{broker.name}</h2>
                  <p>本區只顯示 {broker.name} 的待繳案件，扣款只會使用本區選定帳戶。</p>
                </div>
                <div className="broker-payment-metrics">
                  <span>待繳件數<strong>{cases.length} 件</strong></span>
                  <span>待繳總金額<strong>{formatMoney(pendingTotal)} 元</strong></span>
                  <span>已選金額<strong>{formatMoney(selectedTotal)} 元</strong></span>
                </div>
              </div>

              <div className="broker-account-summary">
                <div>
                  <span className="summary-label">扣款帳號</span>
                  <strong>{selectedAccount ? shortAccountLabel(selectedAccount) : '尚未選擇扣款帳號'}</strong>
                  {selectedAccount?.is_default ? <small className="default-account-pill">預設帳戶</small> : null}
                </div>
                {!hideBalance ? (
                  <div>
                    <span className="summary-label">目前餘額</span>
                    <strong>{selectedAccount ? `${formatMoney(selectedAccount.current_balance)} 元` : '-'}</strong>
                  </div>
                ) : null}
                <div>
                  <span className="summary-label">本區選取</span>
                  <strong>{selectedCases.length} 件</strong>
                </div>
              </div>

              {accounts.length ? (
                <div className="broker-account-list">
                  {accounts.map((account) => (
                    <button type="button" className={`balance-card copy-card ${account.id === selectedAccountId ? 'selected' : ''}`} key={account.id} onClick={() => copyAccount(account)} title="點擊複製銀行帳號並選定本區扣款帳號">
                      <span>{accountLabel(account, data, !hideBalance)}{account.is_default ? '｜預設' : ''}</span>
                      {!hideBalance ? <strong>{formatMoney(account.current_balance)}</strong> : null}
                      <small>點擊複製帳號 / 選定本區扣款帳號</small>
                    </button>
                  ))}
                </div>
              ) : <p className="account-warning">{accountWarning}</p>}

              <div className="payment-panel broker-payment-panel">
                <label><span>繳費日期</span><input type="date" value={meta.paymentDate} onChange={(e) => updateBrokerMeta(broker.id, { paymentDate: e.target.value })} /></label>
                <label><span>繳款人</span><input value={meta.payerName} onChange={(e) => updateBrokerMeta(broker.id, { payerName: e.target.value })} /></label>
                <label><span>扣款帳號</span><select value={selectedAccountId} onChange={(e) => setBrokerAccountId(broker.id, e.target.value)}><option value="">請選擇</option>{accounts.map((account) => <option key={account.id} value={account.id}>{accountLabel(account, data, !hideBalance)}{account.is_default ? '｜預設' : ''}</option>)}</select>{multiAccountNotice ? <small className="payment-account-option-text">{multiAccountNotice}</small> : null}</label>
                <div className="payment-summary"><span>本區已選 {selectedCases.length} 件</span><strong>{formatMoney(selectedTotal)} 元</strong></div>
                <div className="broker-payment-buttons">
                  <button className="secondary-button" type="button" onClick={() => selectBrokerCases(broker.id)}>本區一鍵勾選</button>
                  <button className="ghost-button" type="button" onClick={() => clearBrokerSelection(broker.id)}>本區取消</button>
                  <button className="primary-button" onClick={() => submitBrokerBatch(broker.id)} disabled={submittingBrokerId === broker.id}>{submittingBrokerId === broker.id ? '建立中...' : `${broker.name} 繳費扣款`}</button>
                </div>
              </div>

              <div className="result-area scroll-result broker-payment-table-wrap">
                <DataTable columns={columns} rows={cases} rowKey={(row) => row.id} emptyText={`此仲介目前無符合資料`} />
              </div>
            </section>
          );
        }) : <section className="card full-width-card empty-state">目前沒有符合條件的待繳案件</section>}
      </div>

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
