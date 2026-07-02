import { useMemo, useState } from 'react';
import {
  addCasesToPaymentBatch,
  adjustFinanceConfirmAccountBalance,
  confirmPaymentBatch,
  updateFinanceDetailCase,
  deletePaymentBatch,
  removePaymentBatchItem,
  updatePaymentBatchDate
} from '../api/repository';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { SearchInput } from '../components/SearchInput';
import { BatchStatusBadge } from '../components/StatusBadge';
import { useToast } from '../context/ToastContext';
import type { ArcCase, ArcData, BankAccount, PaymentBatch, PaymentBatchItem, Profile } from '../types';
import { displayDateTime, formatDate, parseDateLoose } from '../utils/date';
import { formatMoney, parseMoney } from '../utils/number';
import { rowMatchesKeyword } from '../utils/search';
import { canAdjustFinanceConfirmBalance, canCompleteFinanceBatch, canDeleteData, canEditFinanceDetail, canModifyFinanceBatchDate } from '../utils/permissions';

type AccountBalanceRow = {
  account: BankAccount;
  brokerName: string;
};

type AccountDraft = {
  nextBalance: string;
  reason: string;
};

type DetailEditDraft = {
  employer_name: string;
  worker_name: string;
  group_no: string;
  entry_date: string;
  application_date: string;
  application_item_id: string;
  amount: string;
  reason: string;
};

function isNoBalanceBrokerName(name: string | undefined) {
  return Boolean(name && (name.includes('灃禾') || name.includes('乾坤')));
}

function formatCorrectionRecord(item: PaymentBatchItem, caseRow: ArcCase, data: ArcData) {
  const hasCorrection = Boolean(item.corrected_application_item_id || item.corrected_amount != null || item.correction_reason);
  const records: string[] = [];

  if (hasCorrection) {
    const originalApplicationItemId = item.original_application_item_id ?? caseRow.application_item_id;
    const correctedApplicationItemId = item.corrected_application_item_id ?? originalApplicationItemId;
    const originalApplicationItemName = data.applicationItems.find((appItem) => appItem.id === originalApplicationItemId)?.name ?? '';
    const correctedApplicationItemName = data.applicationItems.find((appItem) => appItem.id === correctedApplicationItemId)?.name ?? originalApplicationItemName;
    const originalAmount = Number(item.original_amount ?? caseRow.amount ?? 0);
    const correctedAmount = Number(item.corrected_amount ?? originalAmount);

    if (originalApplicationItemId !== correctedApplicationItemId) {
      records.push(`項目：${originalApplicationItemName} → ${correctedApplicationItemName}`);
    }
    if (originalAmount !== correctedAmount) {
      records.push(`金額：${formatMoney(originalAmount)} → ${formatMoney(correctedAmount)}`);
    }
    if (item.correction_reason) {
      records.push(`原因：${item.correction_reason}`);
    }
    if (item.corrected_at) {
      records.push(`修正時間：${formatDate(item.corrected_at)}`);
    }
  }

  const detailEditLogs = data.auditLogs
    .filter((log) => log.action_type === '財務明細資料修改' && log.record_id === caseRow.id)
    .slice(0, 2)
    .map((log) => {
      const nextData = (log.new_data ?? {}) as Record<string, unknown>;
      const summary = String(nextData.異動摘要 ?? '').trim();
      return summary ? `明細：${summary}（${displayDateTime(log.created_at)}）` : `明細資料修改（${displayDateTime(log.created_at)}）`;
    });
  records.push(...detailEditLogs);

  return records.join('；');
}

export function FinanceConfirmPage({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [correction, setCorrection] = useState<{ item: PaymentBatchItem; caseRow: ArcCase } | null>(null);
  const [correctedItemId, setCorrectedItemId] = useState('');
  const [correctedAmount, setCorrectedAmount] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [detailDraft, setDetailDraft] = useState<DetailEditDraft>({ employer_name: '', worker_name: '', group_no: '', entry_date: '', application_date: '', application_item_id: '', amount: '', reason: '' });
  const [dateEditor, setDateEditor] = useState<{ batch: PaymentBatch; value: string } | null>(null);
  const [accountDrafts, setAccountDrafts] = useState<Record<string, AccountDraft>>({});
  const [isAddCaseOpen, setIsAddCaseOpen] = useState(false);
  const [addCaseKeyword, setAddCaseKeyword] = useState('');
  const [selectedAddCaseIds, setSelectedAddCaseIds] = useState<string[]>([]);

  const batches = useMemo(() => data.batches
    .filter((item) => item.deleted_at == null)
    .filter((item) => item.status !== 'confirmed' && item.status !== 'cancelled')
    .sort((a, b) => `${b.payment_date}${b.batch_no}`.localeCompare(`${a.payment_date}${a.batch_no}`)), [data.batches]);

  const selectedBatch = batches.find((item) => item.id === selectedBatchId) ?? batches[0];
  const selectedBroker = selectedBatch ? data.brokers.find((item) => item.id === selectedBatch.broker_id) : undefined;
  const selectedAccount = selectedBatch ? data.accounts.find((item) => item.id === selectedBatch.account_id) : undefined;
  const batchItems = selectedBatch ? data.batchItems.filter((item) => item.batch_id === selectedBatch.id) : [];
  const details = batchItems
    .map((item) => ({ item, caseRow: data.cases.find((caseRow) => caseRow.id === item.case_id) }))
    .filter((entry): entry is { item: PaymentBatchItem; caseRow: ArcCase } => Boolean(entry.caseRow));

  const addableCases = useMemo(() => {
    if (!selectedBatch) return [];
    const existingCaseIds = new Set(details.map((entry) => entry.caseRow.id));
    return data.cases
      .filter((caseRow) => caseRow.status === 'pending_payment' && !caseRow.payment_batch_id && !caseRow.payment_account_id)
      .filter((caseRow) => caseRow.broker_id === selectedBatch.broker_id)
      .filter((caseRow) => !existingCaseIds.has(caseRow.id))
      .filter((caseRow) => rowMatchesKeyword(addCaseKeyword, [
        caseRow.employer_name,
        caseRow.worker_name,
        caseRow.group_no,
        caseRow.case_no,
        data.applicationItems.find((item) => item.id === caseRow.application_item_id)?.name,
        caseRow.handler_name,
        data.brokers.find((broker) => broker.id === caseRow.broker_id)?.name
      ]))
      .sort((a, b) => String(a.application_date).localeCompare(String(b.application_date)) || String(a.case_no).localeCompare(String(b.case_no), 'zh-Hant', { numeric: true }));
  }, [addCaseKeyword, data.applicationItems, data.brokers, data.cases, details, selectedBatch]);

  const accountRows = useMemo<AccountBalanceRow[]>(() => data.accounts
    .filter((account) => account.is_enabled)
    .map((account) => ({
      account,
      brokerName: data.brokers.find((broker) => broker.id === account.broker_id)?.name ?? ''
    }))
    .filter((row) => !isNoBalanceBrokerName(row.brokerName))
    .sort((a, b) => `${a.brokerName}${a.account.account_name}`.localeCompare(`${b.brokerName}${b.account.account_name}`, 'zh-Hant')),
  [data.accounts, data.brokers]);

  const selectedBatchTotal = details.reduce((sum, entry) => sum + Number(entry.item.corrected_amount ?? entry.caseRow.amount ?? entry.item.original_amount ?? 0), 0);
  const mayChangeDate = selectedBatch ? canModifyFinanceBatchDate(profile?.role) && selectedBatch.status !== 'confirmed' : false;
  const mayAdjustBalance = canAdjustFinanceConfirmBalance(profile?.role);
  const mayCompleteBatch = canCompleteFinanceBatch(profile?.role);
  const canEditFinanceDetailFlag = canEditFinanceDetail(profile?.role);

  function setAccountDraft(accountId: string, patch: Partial<AccountDraft>) {
    setAccountDrafts((current) => ({
      ...current,
      [accountId]: {
        nextBalance: current[accountId]?.nextBalance ?? '',
        reason: current[accountId]?.reason ?? '',
        ...patch
      }
    }));
  }

  function clearAccountDraft(accountId: string) {
    setAccountDrafts((current) => {
      const next = { ...current };
      delete next[accountId];
      return next;
    });
  }

  async function completeBatch(batch: PaymentBatch) {
    if (!mayCompleteBatch) {
      pushToast({ type: 'warning', title: '行政不可執行對帳完成。' });
      return;
    }
    try {
      await confirmPaymentBatch(batch, profile);
      pushToast({ type: 'success', title: '對帳完成', message: '此批次已轉入財務查詢。' });
      setSelectedBatchId('');
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '對帳失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }

  function openCorrection(entry: { item: PaymentBatchItem; caseRow: ArcCase }) {
    const itemId = entry.item.corrected_application_item_id ?? entry.caseRow.application_item_id;
    const amount = String(entry.item.corrected_amount ?? entry.item.original_amount ?? entry.caseRow.amount ?? '');
    const reason = entry.item.correction_reason ?? '';
    setCorrection(entry);
    setCorrectedItemId(itemId);
    setCorrectedAmount(amount);
    setCorrectionReason(reason);
    setDetailDraft({
      employer_name: entry.caseRow.employer_name ?? '',
      worker_name: entry.caseRow.worker_name ?? '',
      group_no: entry.caseRow.group_no ?? '',
      entry_date: formatDate(entry.caseRow.entry_date) ?? '',
      application_date: formatDate(entry.caseRow.application_date) ?? '',
      application_item_id: itemId,
      amount,
      reason
    });
  }

  async function removeBatch(batch: PaymentBatch) {
    if (!canDeleteData(profile?.role)) {
      pushToast({ type: 'warning', title: '您沒有刪除權限。' });
      return;
    }
    if (!window.confirm('確定要刪除此筆資料嗎？刪除後不可復原。')) return;
    try {
      await deletePaymentBatch(batch, data, profile, '財務對帳確認');
      pushToast({ type: 'success', title: '已刪除財務對帳資料', message: '已同步建立帳戶沖正紀錄。' });
      setSelectedBatchId('');
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '刪除失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }

  async function submitBatchDate() {
    if (!dateEditor) return;
    if (!canModifyFinanceBatchDate(profile?.role)) {
      pushToast({ type: 'warning', title: '您沒有修改繳費日期的權限。' });
      return;
    }
    const normalized = parseDateLoose(dateEditor.value);
    if (!normalized) {
      pushToast({ type: 'warning', title: '繳費日期格式不正確，請重新輸入。' });
      return;
    }
    try {
      await updatePaymentBatchDate({ batch: dateEditor.batch, nextPaymentDate: normalized, actor: profile });
      pushToast({ type: 'success', title: '繳費日期已更新。' });
      setDateEditor(null);
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '修改日期失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }

  async function submitAccountBalance(account: BankAccount) {
    if (!mayAdjustBalance) {
      pushToast({ type: 'warning', title: '您沒有修改帳戶餘額的權限。' });
      return;
    }
    const draft = accountDrafts[account.id];
    if (!draft || !draft.nextBalance.trim()) {
      pushToast({ type: 'warning', title: '修改後餘額格式不正確，請重新輸入。' });
      return;
    }
    const nextBalance = parseMoney(draft.nextBalance);
    if (nextBalance === null) {
      pushToast({ type: 'warning', title: '修改後餘額格式不正確，請重新輸入。' });
      return;
    }
    if (!draft.reason.trim()) {
      pushToast({ type: 'warning', title: '請輸入餘額調整原因。' });
      return;
    }
    try {
      await adjustFinanceConfirmAccountBalance({
        account,
        nextBalance,
        reason: draft.reason.trim(),
        actor: profile
      });
      pushToast({ type: 'success', title: '帳戶餘額已更新。' });
      clearAccountDraft(account.id);
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '餘額修改失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }

  function updateDetailDraft(patch: Partial<DetailEditDraft>) {
    setDetailDraft((current) => ({ ...current, ...patch }));
    if (patch.application_item_id !== undefined) setCorrectedItemId(patch.application_item_id);
    if (patch.amount !== undefined) setCorrectedAmount(patch.amount);
    if (patch.reason !== undefined) setCorrectionReason(patch.reason);
  }

  async function submitCorrection() {
    if (!selectedBatch || !correction) return;
    const money = parseMoney(detailDraft.amount);
    if (money === null) return pushToast({ type: 'warning', title: '金額格式錯誤' });
    const entryDate = detailDraft.entry_date.trim() ? parseDateLoose(detailDraft.entry_date) : '';
    if (detailDraft.entry_date.trim() && !entryDate) return pushToast({ type: 'warning', title: '入境日格式不正確，請重新輸入。' });
    const applicationDate = parseDateLoose(detailDraft.application_date);
    if (!applicationDate) return pushToast({ type: 'warning', title: '申請日格式不正確，請重新輸入。' });
    if (!detailDraft.reason.trim()) return pushToast({ type: 'warning', title: '請輸入修正原因' });
    try {
      await updateFinanceDetailCase({
        batch: selectedBatch,
        item: correction.item,
        caseRow: correction.caseRow,
        patch: {
          employer_name: detailDraft.employer_name,
          worker_name: detailDraft.worker_name,
          group_no: detailDraft.group_no,
          entry_date: entryDate || null,
          application_date: applicationDate,
          application_item_id: detailDraft.application_item_id,
          amount: money
        },
        reason: detailDraft.reason.trim(),
        actor: profile,
        pageName: '財務對帳確認'
      });
      pushToast({ type: 'success', title: '明細資料已修正' });
      setCorrection(null);
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '修正失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }


  function openAddCasesModal() {
    if (!selectedBatch) return;
    if (selectedBatch.status === 'confirmed') {
      pushToast({ type: 'warning', title: '已對帳完成的批次不可新增案件。' });
      return;
    }
    setSelectedAddCaseIds([]);
    setAddCaseKeyword('');
    setIsAddCaseOpen(true);
  }

  function toggleAddCase(caseId: string) {
    setSelectedAddCaseIds((current) => current.includes(caseId) ? current.filter((id) => id !== caseId) : [...current, caseId]);
  }

  async function submitAddCases() {
    if (!selectedBatch) return;
    try {
      await addCasesToPaymentBatch({ batch: selectedBatch, caseIds: selectedAddCaseIds, data, actor: profile });
      pushToast({ type: 'success', title: '已新增案件至批次', message: '案件已自居留證繳費待繳區移除。' });
      setIsAddCaseOpen(false);
      setSelectedAddCaseIds([]);
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '新增案件失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }

  async function removeDetailFromBatch(entry: { item: PaymentBatchItem; caseRow: ArcCase }) {
    if (!selectedBatch) return;
    if (selectedBatch.status === 'confirmed') {
      pushToast({ type: 'warning', title: '已對帳完成的批次不可移除案件。' });
      return;
    }
    if (!window.confirm('確定要將此案件移出本繳費批次嗎？移除後會回到待繳區。')) return;
    try {
      await removePaymentBatchItem({ batch: selectedBatch, item: entry.item, caseRow: entry.caseRow, data, actor: profile });
      pushToast({ type: 'success', title: '已移出批次', message: '案件已回到居留證繳費待繳區。' });
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '移除失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }


  const accountBalanceColumns = [
    { key: 'broker', title: '仲介', render: (row: AccountBalanceRow) => row.brokerName },
    { key: 'account', title: '帳戶名稱', render: (row: AccountBalanceRow) => row.account.account_name },
    { key: 'current', title: '目前餘額', render: (row: AccountBalanceRow) => formatMoney(row.account.current_balance) },
    {
      key: 'next',
      title: '修改後餘額',
      render: (row: AccountBalanceRow) => (
        <input
          className="table-input money-input"
          value={accountDrafts[row.account.id]?.nextBalance ?? ''}
          onChange={(e) => setAccountDraft(row.account.id, { nextBalance: e.target.value })}
          disabled={!mayAdjustBalance}
          placeholder="輸入新餘額"
        />
      )
    },
    {
      key: 'delta',
      title: '差額',
      render: (row: AccountBalanceRow) => {
        const raw = accountDrafts[row.account.id]?.nextBalance ?? '';
        if (!raw.trim()) return '';
        const nextBalance = parseMoney(raw);
        if (nextBalance === null) return <span className="danger-text">格式錯誤</span>;
        const delta = nextBalance - Number(row.account.current_balance ?? 0);
        if (delta === 0) return '無異動';
        return `${delta > 0 ? '增加 ' : '減少 '}${formatMoney(Math.abs(delta))}`;
      }
    },
    {
      key: 'reason',
      title: '調整原因',
      render: (row: AccountBalanceRow) => (
        <input
          className="table-input reason-input"
          value={accountDrafts[row.account.id]?.reason ?? ''}
          onChange={(e) => setAccountDraft(row.account.id, { reason: e.target.value })}
          disabled={!mayAdjustBalance}
          placeholder="必填"
        />
      )
    },
    {
      key: 'action',
      title: '操作',
      render: (row: AccountBalanceRow) => mayAdjustBalance
        ? <button type="button" className="primary-button mini" onClick={() => submitAccountBalance(row.account)}>儲存</button>
        : <span className="subtle-text">無權限</span>
    }
  ];

  const batchColumns = [
    { key: 'batch_no', title: '批次編號', render: (row: PaymentBatch) => <button className="link-button" onClick={() => setSelectedBatchId(row.id)}>{row.batch_no}</button> },
    { key: 'date', title: '繳費日期', render: (row: PaymentBatch) => formatDate(row.payment_date) },
    { key: 'broker', title: '仲介', render: (row: PaymentBatch) => data.brokers.find((item) => item.id === row.broker_id)?.name ?? '' },
    { key: 'account', title: '帳戶名稱', render: (row: PaymentBatch) => data.accounts.find((item) => item.id === row.account_id)?.account_name ?? '' },
    { key: 'count', title: '件數', render: (row: PaymentBatch) => row.case_count },
    { key: 'amount', title: '金額', render: (row: PaymentBatch) => formatMoney(row.total_amount) },
    { key: 'status', title: '狀態', render: (row: PaymentBatch) => <BatchStatusBadge status={row.status} /> },
    { key: 'delete', title: '刪除', render: (row: PaymentBatch) => canDeleteData(profile?.role) ? <button className="danger-link" onClick={() => removeBatch(row)}>刪除</button> : null }
  ];

  const detailColumns = [
    { key: 'case_no', title: '案件編號', render: (row: { caseRow: ArcCase }) => row.caseRow.case_no },
    { key: 'group', title: '團號', render: (row: { caseRow: ArcCase }) => row.caseRow.group_no ?? '' },
    { key: 'employer', title: '雇主', render: (row: { caseRow: ArcCase }) => row.caseRow.employer_name },
    { key: 'worker', title: '工人', render: (row: { caseRow: ArcCase }) => row.caseRow.worker_name },
    { key: 'entry_date', title: '入境日', render: (row: { caseRow: ArcCase }) => formatDate(row.caseRow.entry_date) },
    { key: 'application_date', title: '申請日', render: (row: { caseRow: ArcCase }) => formatDate(row.caseRow.application_date) },
    { key: 'item', title: '申請項目', render: (row: { item: PaymentBatchItem; caseRow: ArcCase }) => data.applicationItems.find((item) => item.id === (row.item.corrected_application_item_id ?? row.caseRow.application_item_id))?.name ?? '' },
    { key: 'amount', title: '項目金額', render: (row: { item: PaymentBatchItem; caseRow: ArcCase }) => formatMoney(row.item.corrected_amount ?? row.item.original_amount ?? row.caseRow.amount) },
    { key: 'payment_date', title: '繳費日期', render: () => formatDate(selectedBatch?.payment_date) },
    { key: 'handler', title: '承辦', render: (row: { caseRow: ArcCase }) => row.caseRow.handler_name },
    { key: 'correction', title: '修正紀錄', render: (row: { item: PaymentBatchItem; caseRow: ArcCase }) => formatCorrectionRecord(row.item, row.caseRow, data) },
    { key: 'action', title: '操作', render: (row: { item: PaymentBatchItem; caseRow: ArcCase }) => (
      <div className="action-stack horizontal compact-actions">
        {canEditFinanceDetailFlag ? <button className="secondary-button mini" onClick={() => openCorrection(row)}>修改明細</button> : null}
        {selectedBatch?.status !== 'confirmed' ? <button className="danger-link mini" onClick={() => removeDetailFromBatch(row)}>移除</button> : null}
      </div>
    ) }
  ];

  return (
    <div className="page-content finance-page">
      <PageHeader title="財務對帳確認" description="管理員、行政、會計可修改財務明細並處理對帳；僅管理員可刪除會計資訊。" />

      <div className="receipt-path-note">收據存放路徑：Z:\行政\$移民署繳費</div>

      <section className="card full-width-card finance-account-balance-card">
        <div className="section-title-row">
          <div>
            <h2>所有帳戶餘額</h2>
            <p className="subtle-text">一次顯示需控管餘額的啟用帳戶。灃禾、乾坤不列入餘額顯示與餘額修改。餘額修改只調整該帳戶，不新增批次、不影響案件金額、不重複扣款。</p>
          </div>
          {!mayAdjustBalance ? <span className="subtle-text">您沒有修改帳戶餘額的權限。</span> : null}
        </div>
        <DataTable columns={accountBalanceColumns} rows={accountRows} rowKey={(row) => row.account.id} emptyText="目前沒有啟用中的扣款帳戶" />
      </section>

      <section className="card full-width-card">
        <h2>待對帳繳費批次</h2>
        <DataTable columns={batchColumns} rows={batches} rowKey={(row) => row.id} emptyText="目前沒有待對帳繳費批次" />
      </section>

      {selectedBatch ? (
        <section className="card full-width-card finance-confirm-detail-card">
          <div className="finance-detail-head finance-detail-head-rich">
            <div>
              <span>繳費日期</span>
              <strong>{formatDate(selectedBatch.payment_date)}</strong>
              {mayChangeDate ? <button type="button" className="secondary-button mini inline-mini-button" onClick={() => setDateEditor({ batch: selectedBatch, value: formatDate(selectedBatch.payment_date) })}>修改日期</button> : null}
            </div>
            <div><span>繳款人</span><strong>{selectedBatch.payer_name}</strong></div>
            <div><span>仲介</span><strong>{selectedBroker?.name ?? ''}</strong></div>
            <div><span>扣款帳戶</span><strong>{selectedAccount?.account_name ?? '未設定'}</strong></div>
            <div><span>該筆總金額</span><strong>{formatMoney(selectedBatchTotal)} 元</strong></div>
          </div>

          <div className="receipt-path-note inline">收據存放路徑：Z:\行政\$移民署繳費</div>

          <div className="toolbar-row">
            {selectedBatch.status !== 'confirmed' ? <button className="secondary-button" onClick={openAddCasesModal}>新增案件至批次</button> : null}
            {mayCompleteBatch ? <button className="primary-button" onClick={() => completeBatch(selectedBatch)}>對帳完成並轉入財務查詢</button> : null}
            <span className="subtle-text">項目金額錯誤請在單筆明細右側修正。帳戶餘額請於上方「所有帳戶餘額」區塊調整。</span>
          </div>
          <DataTable columns={detailColumns} rows={details} rowKey={(row) => row.item.id} emptyText="此批次沒有明細" />
        </section>
      ) : null}


      {isAddCaseOpen && selectedBatch ? (
        <Modal title="新增案件至批次" onClose={() => setIsAddCaseOpen(false)}>
          <p className="subtle-text">只能加入同仲介且仍在居留證繳費待繳區的案件。加入後會自待繳區移除，並重新計算批次件數與總金額。</p>
          <SearchInput id="addCaseToBatchSearch" value={addCaseKeyword} onCommit={setAddCaseKeyword} placeholder="雇主 / 工人 / 團號 / 申請項目 / 承辦 / 仲介搜尋" />
          <DataTable columns={[
            { key: 'check', title: '選取', render: (row: ArcCase) => <input type="checkbox" checked={selectedAddCaseIds.includes(row.id)} onChange={() => toggleAddCase(row.id)} /> },
            { key: 'case_no', title: '案件編號', render: (row: ArcCase) => row.case_no },
            { key: 'employer', title: '雇主', render: (row: ArcCase) => row.employer_name },
            { key: 'worker', title: '工人', render: (row: ArcCase) => row.worker_name },
            { key: 'group', title: '團號', render: (row: ArcCase) => row.group_no ?? '' },
            { key: 'item', title: '申請項目', render: (row: ArcCase) => data.applicationItems.find((item) => item.id === row.application_item_id)?.name ?? '' },
            { key: 'amount', title: '金額', render: (row: ArcCase) => formatMoney(row.amount) },
            { key: 'handler', title: '承辦', render: (row: ArcCase) => row.handler_name }
          ]} rows={addableCases} rowKey={(row) => row.id} emptyText="沒有可加入此批次的待繳案件" />
          <div className="form-actions"><button className="primary-button" onClick={submitAddCases}>加入所選案件</button></div>
        </Modal>
      ) : null}

      {dateEditor ? (
        <Modal title="修改批次繳費日期" onClose={() => setDateEditor(null)}>
          <div className="form-grid one-col">
            <p className="subtle-text">修改的是整個繳費批次日期，會同步更新此批次內案件的繳費日期。</p>
            <label><span>繳費批次編號</span><input value={dateEditor.batch.batch_no} disabled /></label>
            <label><span>繳費日期</span><input value={dateEditor.value} onChange={(e) => setDateEditor({ ...dateEditor, value: e.target.value })} placeholder="例如 20260701、115/07/01、民國115年7月1日" /></label>
          </div>
          <div className="form-actions"><button className="primary-button" onClick={submitBatchDate}>儲存日期</button></div>
        </Modal>
      ) : null}

      {correction ? (
        <Modal title="修改財務明細資料" onClose={() => setCorrection(null)}>
          <div className="form-grid two-col">
            <label><span>雇主</span><input value={detailDraft.employer_name} onChange={(e) => updateDetailDraft({ employer_name: e.target.value })} /></label>
            <label><span>工人</span><input value={detailDraft.worker_name} onChange={(e) => updateDetailDraft({ worker_name: e.target.value })} /></label>
            <label><span>團號</span><input value={detailDraft.group_no} onChange={(e) => updateDetailDraft({ group_no: e.target.value })} /></label>
            <label><span>入境日</span><input value={detailDraft.entry_date} onChange={(e) => updateDetailDraft({ entry_date: e.target.value })} onBlur={() => updateDetailDraft({ entry_date: detailDraft.entry_date ? (parseDateLoose(detailDraft.entry_date) ?? detailDraft.entry_date) : '' })} placeholder="例：20260701 / 1150701" /></label>
            <label><span>申請日</span><input value={detailDraft.application_date} onChange={(e) => updateDetailDraft({ application_date: e.target.value })} onBlur={() => updateDetailDraft({ application_date: parseDateLoose(detailDraft.application_date) ?? detailDraft.application_date })} placeholder="例：20260701 / 1150701" /></label>
            <label><span>申請項目</span><select value={detailDraft.application_item_id} onChange={(e) => updateDetailDraft({ application_item_id: e.target.value })}>{data.applicationItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span>項目金額</span><input value={detailDraft.amount} onChange={(e) => updateDetailDraft({ amount: e.target.value })} /></label>
            <label className="full-span"><span>修正原因 / 備註</span><textarea value={detailDraft.reason} onChange={(e) => updateDetailDraft({ reason: e.target.value })} /></label>
          </div>
          <div className="form-actions"><button className="danger-button" onClick={submitCorrection}>儲存修正</button></div>
        </Modal>
      ) : null}
    </div>
  );
}
