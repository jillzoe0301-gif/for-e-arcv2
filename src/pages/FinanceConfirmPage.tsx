import { useMemo, useState } from 'react';
import { confirmPaymentBatch, correctPaymentItem, deletePaymentBatch } from '../api/repository';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { BatchStatusBadge } from '../components/StatusBadge';
import { useToast } from '../context/ToastContext';
import type { ArcCase, ArcData, PaymentBatch, PaymentBatchItem, Profile } from '../types';
import { formatDate } from '../utils/date';
import { formatMoney, parseMoney } from '../utils/number';
import { canDeleteData } from '../utils/permissions';

export function FinanceConfirmPage({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [correction, setCorrection] = useState<{ item: PaymentBatchItem; caseRow: ArcCase } | null>(null);
  const [correctedItemId, setCorrectedItemId] = useState('');
  const [correctedAmount, setCorrectedAmount] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');

  const batches = useMemo(() => data.batches.filter((item) => item.deleted_at == null), [data.batches]);
  const selectedBatch = batches.find((item) => item.id === selectedBatchId) ?? batches[0];
  const batchItems = selectedBatch ? data.batchItems.filter((item) => item.batch_id === selectedBatch.id) : [];
  const details = batchItems.map((item) => ({ item, caseRow: data.cases.find((caseRow) => caseRow.id === item.case_id) })).filter((entry): entry is { item: PaymentBatchItem; caseRow: ArcCase } => Boolean(entry.caseRow));

  async function completeBatch(batch: PaymentBatch) {
    try {
      await confirmPaymentBatch(batch, profile);
      pushToast({ type: 'success', title: '對帳完成' });
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
    { key: 'item', title: '申請項目', render: (row: { item: PaymentBatchItem; caseRow: ArcCase }) => data.applicationItems.find((item) => item.id === (row.item.corrected_application_item_id ?? row.caseRow.application_item_id))?.name ?? '' },
    { key: 'amount', title: '項目金額', render: (row: { item: PaymentBatchItem; caseRow: ArcCase }) => formatMoney(row.item.corrected_amount ?? row.caseRow.amount) },
    { key: 'correction', title: '修正紀錄', render: (row: { item: PaymentBatchItem }) => row.item.correction_reason ?? '' },
    { key: 'action', title: '操作', render: (row: { item: PaymentBatchItem; caseRow: ArcCase }) => <button className="danger-button mini" onClick={() => openCorrection(row)}>項目金額錯誤</button> }
  ];

  return (
    <div className="page-content finance-page">
      <PageHeader title="財務對帳確認" description="會計 / 財務與管理員可使用。" />
      <section className="card full-width-card">
        <h2>繳費批次</h2>
        <DataTable columns={batchColumns} rows={batches} rowKey={(row) => row.id} emptyText="目前沒有繳費批次" />
      </section>
      {selectedBatch ? (
        <section className="card full-width-card">
          <div className="finance-detail-head">
            <div><span>繳費日期</span><strong>{formatDate(selectedBatch.payment_date)}</strong></div>
            <div><span>繳款人</span><strong>{selectedBatch.payer_name}</strong></div>
            <div><span>仲介</span><strong>{data.brokers.find((item) => item.id === selectedBatch.broker_id)?.name}</strong></div>
            <div><span>帳戶名稱</span><strong>{data.accounts.find((item) => item.id === selectedBatch.account_id)?.account_name}</strong></div>
          </div>
          <div className="toolbar-row">
            <button className="primary-button" onClick={() => completeBatch(selectedBatch)}>對帳完成</button>
            <span className="subtle-text">項目金額錯誤請在單筆明細右側修正。</span>
          </div>
          <DataTable columns={detailColumns} rows={details} rowKey={(row) => row.item.id} emptyText="此批次沒有明細" />
        </section>
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
