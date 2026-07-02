import { useMemo, useState } from 'react';
import { deletePaymentBatch, updateFinanceDetailCase } from '../api/repository';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { SearchInput } from '../components/SearchInput';
import { BatchStatusBadge } from '../components/StatusBadge';
import { useToast } from '../context/ToastContext';
import type { AccountTransaction, ArcCase, ArcData, PaymentBatch, PaymentBatchItem, Profile } from '../types';
import { displayDateTime, formatDate, monthKey, parseDateLoose } from '../utils/date';
import { formatMoney, parseMoney } from '../utils/number';
import { canDeleteData, canEditFinanceDetail } from '../utils/permissions';
import { rowMatchesKeyword } from '../utils/search';

type FinanceBatchDetailRow = {
  item: PaymentBatchItem;
  caseRow: ArcCase;
  paymentDate: string;
};

type FinanceBatchRow = {
  batch: PaymentBatch;
  brokerName: string;
  accountName: string;
  accountLast5: string;
  confirmedByName: string;
  details: FinanceBatchDetailRow[];
  balanceTransactions: AccountTransaction[];
};

type BalanceTransactionRow = {
  txn: AccountTransaction;
  brokerName: string;
  accountName: string;
  actorName: string;
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

export function FinanceSearchPage({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [keyword, setKeyword] = useState('');
  const [month, setMonth] = useState('');
  const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(new Set());
  const [editingDetail, setEditingDetail] = useState<{ batch: PaymentBatch; row: FinanceBatchDetailRow } | null>(null);
  const [detailDraft, setDetailDraft] = useState<DetailEditDraft>({ employer_name: '', worker_name: '', group_no: '', entry_date: '', application_date: '', application_item_id: '', amount: '', reason: '' });

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
          .map((item) => ({ item, caseRow: data.cases.find((caseRow) => caseRow.id === item.case_id), paymentDate: batch.payment_date }))
          .filter((entry): entry is FinanceBatchDetailRow => Boolean(entry.caseRow));
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
        const detailFields = row.details.flatMap(({ item, caseRow, paymentDate }) => [
          caseRow.case_no,
          caseRow.group_no,
          caseRow.employer_name,
          caseRow.worker_name,
          caseRow.entry_date,
          caseRow.application_date,
          data.applicationItems.find((appItem) => appItem.id === (item.corrected_application_item_id ?? caseRow.application_item_id))?.name,
          item.corrected_amount ?? item.original_amount ?? caseRow.amount,
          paymentDate,
          caseRow.handler_name,
          formatCorrectionRecord(item, caseRow, data)
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


  const balanceTransactionRows = useMemo<BalanceTransactionRow[]>(() => {
    return data.accountTransactions
      .filter((txn) => txn.txn_type === 'finance_confirm_balance_adjustment' || txn.txn_type === 'balance_adjustment')
      .filter((txn) => !month || monthKey(txn.created_at) === month)
      .map((txn) => {
        const account = data.accounts.find((item) => item.id === txn.account_id);
        const broker = account ? data.brokers.find((item) => item.id === account.broker_id) : undefined;
        const actor = data.profiles.find((item) => item.id === txn.created_by);
        return {
          txn,
          brokerName: broker?.name ?? '',
          accountName: account?.account_name ?? '',
          actorName: actor?.display_name ?? txn.created_by ?? ''
        };
      })
      .filter((row) => rowMatchesKeyword(keyword, [
        row.brokerName,
        row.accountName,
        row.txn.txn_type,
        row.txn.reason,
        row.txn.balance_before,
        row.txn.balance_after,
        row.txn.amount,
        row.actorName,
        row.txn.created_at
      ]))
      .sort((a, b) => String(b.txn.created_at).localeCompare(String(a.txn.created_at)));
  }, [data.accountTransactions, data.accounts, data.brokers, data.profiles, keyword, month]);

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

  const canEditFinanceDetailFlag = canEditFinanceDetail(profile?.role);

  function openDetailEditor(batch: PaymentBatch, row: FinanceBatchDetailRow) {
    const itemId = row.item.corrected_application_item_id ?? row.caseRow.application_item_id;
    setEditingDetail({ batch, row });
    setDetailDraft({
      employer_name: row.caseRow.employer_name ?? '',
      worker_name: row.caseRow.worker_name ?? '',
      group_no: row.caseRow.group_no ?? '',
      entry_date: formatDate(row.caseRow.entry_date) ?? '',
      application_date: formatDate(row.caseRow.application_date) ?? '',
      application_item_id: itemId,
      amount: String(row.item.corrected_amount ?? row.item.original_amount ?? row.caseRow.amount ?? ''),
      reason: row.item.correction_reason ?? ''
    });
  }

  function updateDetailDraft(patch: Partial<DetailEditDraft>) {
    setDetailDraft((current) => ({ ...current, ...patch }));
  }

  async function submitDetailEdit() {
    if (!editingDetail) return;
    if (!canEditFinanceDetailFlag) {
      pushToast({ type: 'warning', title: '您沒有修改明細資料的權限。' });
      return;
    }
    const money = parseMoney(detailDraft.amount);
    if (money === null) return pushToast({ type: 'warning', title: '金額格式錯誤' });
    const entryDate = detailDraft.entry_date.trim() ? parseDateLoose(detailDraft.entry_date) : '';
    if (detailDraft.entry_date.trim() && !entryDate) return pushToast({ type: 'warning', title: '入境日格式不正確，請重新輸入。' });
    const applicationDate = parseDateLoose(detailDraft.application_date);
    if (!applicationDate) return pushToast({ type: 'warning', title: '申請日格式不正確，請重新輸入。' });
    if (!detailDraft.reason.trim()) return pushToast({ type: 'warning', title: '請輸入修正原因' });
    try {
      await updateFinanceDetailCase({
        batch: editingDetail.batch,
        item: editingDetail.row.item,
        caseRow: editingDetail.row.caseRow,
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
        pageName: '財務查詢'
      });
      pushToast({ type: 'success', title: '明細資料已修正' });
      setEditingDetail(null);
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '修正失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }

  const detailColumns = [
    { key: 'case_no', title: '案件編號', render: (row: FinanceBatchDetailRow) => row.caseRow.case_no },
    { key: 'group', title: '團號', render: (row: FinanceBatchDetailRow) => row.caseRow.group_no ?? '' },
    { key: 'employer', title: '雇主', render: (row: FinanceBatchDetailRow) => row.caseRow.employer_name },
    { key: 'worker', title: '工人', render: (row: FinanceBatchDetailRow) => row.caseRow.worker_name },
    { key: 'entry_date', title: '入境日', render: (row: FinanceBatchDetailRow) => formatDate(row.caseRow.entry_date) },
    { key: 'application_date', title: '申請日', render: (row: FinanceBatchDetailRow) => formatDate(row.caseRow.application_date) },
    { key: 'item', title: '申請項目', render: (row: FinanceBatchDetailRow) => data.applicationItems.find((item) => item.id === (row.item.corrected_application_item_id ?? row.caseRow.application_item_id))?.name ?? '' },
    { key: 'amount', title: '項目金額', render: (row: FinanceBatchDetailRow) => formatMoney(row.item.corrected_amount ?? row.item.original_amount ?? row.caseRow.amount) },
    { key: 'payment_date', title: '繳費日期', render: (row: FinanceBatchDetailRow) => formatDate(row.paymentDate) },
    { key: 'handler', title: '承辦', render: (row: FinanceBatchDetailRow) => row.caseRow.handler_name },
    { key: 'correction', title: '修正紀錄', render: (row: FinanceBatchDetailRow) => formatCorrectionRecord(row.item, row.caseRow, data) },
    { key: 'action', title: '操作', render: (row: FinanceBatchDetailRow) => canEditFinanceDetailFlag ? <button type="button" className="secondary-button mini" onClick={() => { const batch = data.batches.find((item) => item.id === row.item.batch_id); if (batch) openDetailEditor(batch, row); }}>修改明細</button> : null }
  ];


  const transactionColumns = [
    { key: 'broker', title: '仲介', render: (row: BalanceTransactionRow) => row.brokerName },
    { key: 'account', title: '帳戶名稱', render: (row: BalanceTransactionRow) => row.accountName },
    { key: 'before', title: '修改前餘額', render: (row: BalanceTransactionRow) => formatMoney(row.txn.balance_before) },
    { key: 'after', title: '修改後餘額', render: (row: BalanceTransactionRow) => formatMoney(row.txn.balance_after) },
    { key: 'delta', title: '差額', render: (row: BalanceTransactionRow) => `${row.txn.amount >= 0 ? '增加 ' : '減少 '}${formatMoney(Math.abs(row.txn.amount))}` },
    { key: 'reason', title: '調整原因', render: (row: BalanceTransactionRow) => row.txn.reason ?? '' },
    { key: 'actor', title: '修改人', render: (row: BalanceTransactionRow) => row.actorName },
    { key: 'time', title: '修改時間', render: (row: BalanceTransactionRow) => displayDateTime(row.txn.created_at) }
  ];

  return (
    <div className="page-content finance-query-page">
      <PageHeader title="財務查詢" description="已完成對帳的繳費批次會在此查詢，可展開查看批次內案件明細；管理員、會計與行政可修改明細，僅管理員可刪除。" />
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

      <section className="card full-width-card no-compress finance-transaction-query-card">
        <h2>帳戶餘額異動紀錄</h2>
        <p className="subtle-text">顯示財務對帳確認與帳戶設定產生的餘額異動紀錄；此頁只供查看，不提供直接修改餘額。</p>
        <DataTable columns={transactionColumns} rows={balanceTransactionRows} rowKey={(row) => row.txn.id} emptyText="目前沒有符合條件的餘額異動紀錄" />
      </section>

      {editingDetail ? (
        <Modal title="修改財務查詢明細" onClose={() => setEditingDetail(null)}>
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
          <div className="form-actions"><button className="danger-button" onClick={submitDetailEdit}>儲存修正</button></div>
        </Modal>
      ) : null}

    </div>
  );
}
