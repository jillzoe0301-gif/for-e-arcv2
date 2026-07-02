import { useMemo, useState } from 'react';
import {
  adjustFinanceConfirmAccountBalance,
  confirmPaymentBatch,
  correctPaymentItem,
  deletePaymentBatch,
  updatePaymentBatchDate
} from '../api/repository';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { BatchStatusBadge } from '../components/StatusBadge';
import { useToast } from '../context/ToastContext';
import type { ArcCase, ArcData, BankAccount, PaymentBatch, PaymentBatchItem, Profile } from '../types';
import { formatDate, parseDateLoose } from '../utils/date';
import { formatMoney, parseMoney } from '../utils/number';
import { canAdjustFinanceConfirmBalance, canDeleteData, canModifyFinanceBatchDate } from '../utils/permissions';

type AccountBalanceRow = {
  account: BankAccount;
  brokerName: string;
};

type AccountDraft = {
  nextBalance: string;
  reason: string;
};

export function FinanceConfirmPage({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [correction, setCorrection] = useState<{ item: PaymentBatchItem; caseRow: ArcCase } | null>(null);
  const [correctedItemId, setCorrectedItemId] = useState('');
  const [correctedAmount, setCorrectedAmount] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [dateEditor, setDateEditor] = useState<{ batch: PaymentBatch; value: string } | null>(null);
  const [accountDrafts, setAccountDrafts] = useState<Record<string, AccountDraft>>({});

  const batches = useMemo(() => data.batches
    .filter((item) => item.deleted_at == null)
    .filter((item) => item.status === 'pending' || item.status === 'amount_error')
    .sort((a, b) => `${b.payment_date}${b.batch_no}`.localeCompare(`${a.payment_date}${a.batch_no}`)), [data.batches]);

  const selectedBatch = batches.find((item) => item.id === selectedBatchId) ?? batches[0];
  const selectedBroker = selectedBatch ? data.brokers.find((item) => item.id === selectedBatch.broker_id) : undefined;
  const selectedAccount = selectedBatch ? data.accounts.find((item) => item.id === selectedBatch.account_id) : undefined;
  const batchItems = selectedBatch ? data.batchItems.filter((item) => item.batch_id === selectedBatch.id) : [];
  const details = batchItems
    .map((item) => ({ item, caseRow: data.cases.find((caseRow) => caseRow.id === item.case_id) }))
    .filter((entry): entry is { item: PaymentBatchItem; caseRow: ArcCase } => Boolean(entry.caseRow));

  const accountRows = useMemo<AccountBalanceRow[]>(() => data.accounts
    .filter((account) => account.is_enabled)
    .map((account) => ({
      account,
      brokerName: data.brokers.find((broker) => broker.id === account.broker_id)?.name ?? ''
    }))
    .sort((a, b) => `${a.brokerName}${a.account.account_name}`.localeCompare(`${b.brokerName}${b.account.account_name}`, 'zh-Hant')),
  [data.accounts, data.brokers]);

  const mayChangeDate = selectedBatch ? canModifyFinanceBatchDate(profile?.role) && selectedBatch.status !== 'confirmed' : false;
  const mayAdjustBalance = canAdjustFinanceConfirmBalance(profile?.role);

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
    setCorrection(entry);
    setCorrectedItemId(entry.item.corrected_application_item_id ?? entry.caseRow.application_item_id);
    setCorrectedAmount(String(entry.item.corrected_amount ?? entry.caseRow.amount ?? entry.item.original_amount));
    setCorrectionReason(entry.item.correction_reason ?? '');
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

  async function submitCorrection() {
    if (!selectedBatch || !correction) return;
    const money = parseMoney(correctedAmount);
    if (money === null) return pushToast({ type: 'warning', title: '金額格式錯誤' });
    if (!correctionReason.trim()) return pushToast({ type: 'warning', title: '請輸入錯誤原因' });
    try {
      await correctPaymentItem({
        batch: selectedBatch,
        item: correction.item,
        caseRow: correction.caseRow,
        correctedApplicationItemId: correctedItemId,
        correctedAmount: money,
        reason: correctionReason.trim(),
        actor: profile
      });
      pushToast({ type: 'success', title: '項目金額已修正' });
      setCorrection(null);
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '修正失敗', message: err instanceof Error ? err.message : '請稍後再試' });
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
    { key: 'employer', title: '雇主', render: (row: { caseRow: ArcCase }) => row.caseRow.employer_name },
    { key: 'worker', title: '工人', render: (row: { caseRow: ArcCase }) => row.caseRow.worker_name },
    { key: 'group', title: '團號', render: (row: { caseRow: ArcCase }) => row.caseRow.group_no ?? '' },
    { key: 'item', title: '申請項目', render: (row: { item: PaymentBatchItem; caseRow: ArcCase }) => data.applicationItems.find((item) => item.id === (row.item.corrected_application_item_id ?? row.caseRow.application_item_id))?.name ?? '' },
    { key: 'amount', title: '項目金額', render: (row: { item: PaymentBatchItem; caseRow: ArcCase }) => formatMoney(row.item.corrected_amount ?? row.caseRow.amount) },
    { key: 'handler', title: '承辦', render: (row: { caseRow: ArcCase }) => row.caseRow.handler_name },
    { key: 'payment_date', title: '收費日期', render: () => formatDate(selectedBatch?.payment_date) },
    { key: 'correction', title: '修正紀錄', render: (row: { item: PaymentBatchItem }) => row.item.correction_reason ?? '' },
    { key: 'action', title: '操作', render: (row: { item: PaymentBatchItem; caseRow: ArcCase }) => <button className="danger-button mini" onClick={() => openCorrection(row)}>項目金額錯誤</button> }
  ];

  return (
    <div className="page-content finance-page">
      <PageHeader title="財務對帳確認" description="會計 / 財務與管理員可使用。可一次查看與調整所有啟用帳戶餘額，並在對帳完成前修正批次繳費日期。" />

      <section className="card full-width-card finance-account-balance-card">
        <div className="section-title-row">
          <div>
            <h2>所有帳戶餘額</h2>
            <p className="subtle-text">一次顯示所有啟用中的仲介帳戶。餘額修改只調整該帳戶，不新增批次、不影響案件金額、不重複扣款。</p>
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
          </div>

          <div className="toolbar-row">
            <button className="primary-button" onClick={() => completeBatch(selectedBatch)}>對帳完成並轉入財務查詢</button>
            <span className="subtle-text">項目金額錯誤請在單筆明細右側修正。帳戶餘額請於上方「所有帳戶餘額」區塊調整。</span>
          </div>
          <DataTable columns={detailColumns} rows={details} rowKey={(row) => row.item.id} emptyText="此批次沒有明細" />
        </section>
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
        <Modal title="項目金額錯誤" onClose={() => setCorrection(null)}>
          <div className="form-grid one-col">
            <label><span>申請項目</span><select value={correctedItemId} onChange={(e) => setCorrectedItemId(e.target.value)}>{data.applicationItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span>項目金額</span><input value={correctedAmount} onChange={(e) => setCorrectedAmount(e.target.value)} /></label>
            <label><span>備註 / 錯誤原因</span><textarea value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} /></label>
          </div>
          <div className="form-actions"><button className="danger-button" onClick={submitCorrection}>儲存修正</button></div>
        </Modal>
      ) : null}
    </div>
  );
}
