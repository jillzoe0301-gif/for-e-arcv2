import { useMemo, useState } from 'react';
import { deletePaymentBatch } from '../api/repository';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { SearchInput } from '../components/SearchInput';
import { BatchStatusBadge } from '../components/StatusBadge';
import { useToast } from '../context/ToastContext';
import type { AccountTransaction, ArcCase, ArcData, PaymentBatch, PaymentBatchItem, Profile } from '../types';
import { displayDateTime, formatDate, monthKey } from '../utils/date';
import { formatMoney } from '../utils/number';
import { canDeleteData } from '../utils/permissions';
import { rowMatchesKeyword } from '../utils/search';

type FinanceBatchRow = {
  batch: PaymentBatch;
  brokerName: string;
  accountName: string;
  accountLast5: string;
  confirmedByName: string;
  details: Array<{ item: PaymentBatchItem; caseRow: ArcCase }>;
  balanceTransactions: AccountTransaction[];
};

export function FinanceSearchPage({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [keyword, setKeyword] = useState('');
  const [month, setMonth] = useState('');
  const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(new Set());

  const allConfirmedBatches = useMemo(() => {
    return data.batches
      .filter((batch) => batch.deleted_at == null)
      .filter((batch) => batch.status === 'confirmed')
      .sort((a, b) => `${b.payment_date}${b.batch_no}`.localeCompare(`${a.payment_date}${a.batch_no}`));
  }, [data.batches]);

  const monthOptions = useMemo(() => {
    return Array.from(new Set(allConfirmedBatches.map((item) => monthKey(item.payment_date)).filter(Boolean))).sort().reverse();
  }, [allConfirmedBatches]);

  const financeRows = useMemo<FinanceBatchRow[]>(() => {
    return allConfirmedBatches
      .filter((batch) => !month || monthKey(batch.payment_date) === month)
      .map((batch) => {
        const broker = data.brokers.find((item) => item.id === batch.broker_id);
        const account = data.accounts.find((item) => item.id === batch.account_id);
        const confirmedBy = data.profiles.find((item) => item.id === batch.confirmed_by);
        const details = data.batchItems
          .filter((item) => item.batch_id === batch.id)
          .map((item) => ({ item, caseRow: data.cases.find((caseRow) => caseRow.id === item.case_id) }))
          .filter((entry): entry is { item: PaymentBatchItem; caseRow: ArcCase } => Boolean(entry.caseRow));
        const balanceTransactions = data.accountTransactions
          .filter((txn) => txn.ref_table === 'payment_batches' && txn.ref_id === batch.id)
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        return {
          batch,
          brokerName: broker?.name ?? '',
          accountName: account ? `${account.bank_name}｜${account.account_name}` : '',
          accountLast5: account?.account_last5 ?? account?.account_no?.slice(-5) ?? '',
          confirmedByName: confirmedBy?.display_name ?? batch.confirmed_by ?? '',
          details,
          balanceTransactions
        };
      })
      .filter((row) => {
        const batchFields = [
          row.batch.batch_no,
          row.batch.payment_date,
          row.batch.payer_name,
          row.brokerName,
          row.accountName,
          row.accountLast5,
          row.batch.status,
          row.confirmedByName
        ];
        const detailFields = row.details.flatMap(({ item, caseRow }) => [
          caseRow.case_no,
          caseRow.employer_name,
          caseRow.worker_name,
          caseRow.group_no,
          data.applicationItems.find((appItem) => appItem.id === (item.corrected_application_item_id ?? caseRow.application_item_id))?.name,
          caseRow.handler_name,
          caseRow.payment_date,
          caseRow.note,
          item.correction_reason
        ]);
        const transactionFields = row.balanceTransactions.flatMap((txn) => [
          txn.txn_type,
          txn.reason,
          txn.balance_before,
          txn.balance_after,
          txn.amount,
          data.profiles.find((profileItem) => profileItem.id === txn.created_by)?.display_name
        ]);
        return rowMatchesKeyword(keyword, [...batchFields, ...detailFields, ...transactionFields]);
      });
  }, [allConfirmedBatches, data.accountTransactions, data.accounts, data.applicationItems, data.batchItems, data.brokers, data.cases, data.profiles, keyword, month]);

  function toggleDetails(batchId: string) {
    setExpandedBatchIds((current) => {
      const next = new Set(current);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  }

  async function removeBatch(row: FinanceBatchRow) {
    if (!canDeleteData(profile?.role)) {
      pushToast({ type: 'warning', title: '您沒有刪除權限。' });
      return;
    }
    if (!window.confirm('確定要刪除此筆資料嗎？刪除後不可復原。')) return;
    try {
      await deletePaymentBatch(row.batch, data, profile, '財務查詢');
      pushToast({ type: 'success', title: '已刪除財務查詢批次', message: '已同步建立帳戶沖正紀錄。' });
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '刪除失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }

  const detailColumns = [
    { key: 'case_no', title: '案件編號', render: (row: { caseRow: ArcCase }) => row.caseRow.case_no },
    { key: 'employer', title: '雇主', render: (row: { caseRow: ArcCase }) => row.caseRow.employer_name },
    { key: 'worker', title: '工人', render: (row: { caseRow: ArcCase }) => row.caseRow.worker_name },
    { key: 'group', title: '團號', render: (row: { caseRow: ArcCase }) => row.caseRow.group_no ?? '' },
    { key: 'item', title: '申請項目', render: (row: { item: PaymentBatchItem; caseRow: ArcCase }) => data.applicationItems.find((item) => item.id === (row.item.corrected_application_item_id ?? row.caseRow.application_item_id))?.name ?? '' },
    { key: 'amount', title: '金額', render: (row: { item: PaymentBatchItem; caseRow: ArcCase }) => formatMoney(row.item.corrected_amount ?? row.item.original_amount ?? row.caseRow.amount) },
    { key: 'handler', title: '承辦', render: (row: { caseRow: ArcCase }) => row.caseRow.handler_name },
    { key: 'payment_date', title: '收費日期', render: (row: { caseRow: ArcCase }) => formatDate(row.caseRow.payment_date) },
    { key: 'note', title: '備註', render: (row: { item: PaymentBatchItem; caseRow: ArcCase }) => row.item.correction_reason ?? row.caseRow.note ?? '' }
  ];

  return (
    <div className="page-content finance-query-page">
      <PageHeader title="財務查詢" description="已完成對帳的繳費批次會在此查詢，可展開查看批次內案件明細。" />
      <section className="card full-width-card no-compress finance-batch-query-card">
        <div className="search-toolbar finance-toolbar">
          <SearchInput id="financeKeywordSearch" value={keyword} onCommit={setKeyword} placeholder="批次編號 / 繳款人 / 仲介 / 帳戶 / 雇主 / 工人 / 團號 / 申請項目" />
          <label className="inline-field"><span>繳費月份</span><select value={month} onChange={(e) => setMonth(e.target.value)}><option value="">全部月份</option>{monthOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        </div>
        <div className="finance-batch-list">
          {financeRows.length ? financeRows.map((row) => {
            const isExpanded = expandedBatchIds.has(row.batch.id);
            return (
              <article className="finance-batch-card" key={row.batch.id}>
                <div className="finance-batch-summary">
                  <div className="finance-batch-title">
                    <button type="button" className="link-button batch-expand-button" onClick={() => toggleDetails(row.batch.id)}>{isExpanded ? '收合明細' : '查看明細'}</button>
                    <strong>{row.batch.batch_no}</strong>
                    <BatchStatusBadge status={row.batch.status} />
                  </div>
                  <div className="finance-batch-meta">
                    <span><b>繳費日期</b>{formatDate(row.batch.payment_date)}</span>
                    <span><b>繳款人</b>{row.batch.payer_name}</span>
                    <span><b>仲介</b>{row.brokerName}</span>
                    <span><b>扣款帳戶</b>{row.accountName || '未設定'}</span>
                    <span><b>帳號後五碼</b>{row.accountLast5}</span>
                    <span><b>批次案件數</b>{row.batch.case_count} 件</span>
                    <span><b>批次總金額</b>{formatMoney(row.batch.total_amount)}</span>
                    <span><b>對帳完成時間</b>{displayDateTime(row.batch.confirmed_at)}</span>
                    <span><b>對帳確認人</b>{row.confirmedByName}</span>
                  </div>
                  {canDeleteData(profile?.role) ? (
                    <button className="danger-button mini" type="button" onClick={() => removeBatch(row)}>刪除</button>
                  ) : null}
                </div>
                {isExpanded ? (
                  <div className="finance-batch-detail">
                    <DataTable columns={detailColumns} rows={row.details} rowKey={(detail) => detail.item.id} emptyText="此批次沒有明細" />
                    <div className="finance-transaction-panel">
                      <h3>本批次帳戶餘額異動紀錄</h3>
                      {row.balanceTransactions.length ? (
                        <div className="transaction-list">
                          {row.balanceTransactions.map((txn) => {
                            const actorName = data.profiles.find((profileItem) => profileItem.id === txn.created_by)?.display_name ?? txn.created_by ?? '';
                            return (
                              <div className="transaction-row" key={txn.id}>
                                <span><b>類型</b>{txn.txn_type === 'finance_confirm_balance_adjustment' ? '手動修改餘額' : txn.txn_type}</span>
                                <span><b>修改前餘額</b>{formatMoney(txn.balance_before)}</span>
                                <span><b>修改後餘額</b>{formatMoney(txn.balance_after)}</span>
                                <span><b>差額</b>{txn.amount >= 0 ? '增加 ' : '減少 '}{formatMoney(Math.abs(txn.amount))}</span>
                                <span><b>調整原因</b>{txn.reason ?? ''}</span>
                                <span><b>修改人</b>{actorName}</span>
                                <span><b>修改時間</b>{displayDateTime(txn.created_at)}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : <p className="subtle-text">此批次尚無額外餘額修改紀錄。</p>}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          }) : <div className="empty-state">查無已完成對帳的財務批次</div>}
        </div>
      </section>
    </div>
  );
}
