import { useMemo, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { SearchInput } from '../components/SearchInput';
import { BatchStatusBadge } from '../components/StatusBadge';
import type { ArcCase, ArcData } from '../types';
import { formatDate, monthKey } from '../utils/date';
import { formatMoney } from '../utils/number';
import { rowMatchesKeyword } from '../utils/search';

export function FinanceSearchPage({ data }: { data: ArcData }) {
  const [keyword, setKeyword] = useState('');
  const [month, setMonth] = useState('');

  const financeRows = useMemo(() => {
    return data.cases
      .filter((caseRow) => caseRow.payment_batch_id)
      .filter((caseRow) => !month || monthKey(caseRow.payment_date) === month)
      .filter((caseRow) => rowMatchesKeyword(keyword, [caseRow.employer_name, caseRow.worker_name, caseRow.group_no, caseRow.case_no]))
      .map((caseRow) => {
        const batch = data.batches.find((item) => item.id === caseRow.payment_batch_id);
        return { caseRow, batch };
      });
  }, [data.batches, data.cases, keyword, month]);

  const monthOptions = Array.from(new Set(data.cases.map((item) => monthKey(item.payment_date)).filter(Boolean))).sort().reverse();

  const columns = [
    { key: 'case_no', title: '案件編號', render: (row: { caseRow: ArcCase }) => row.caseRow.case_no },
    { key: 'payment_date', title: '繳費日期', render: (row: { caseRow: ArcCase }) => formatDate(row.caseRow.payment_date) },
    { key: 'batch_no', title: '批次編號', render: (row: { batch?: { batch_no: string } }) => row.batch?.batch_no ?? '' },
    { key: 'broker', title: '仲介', render: (row: { caseRow: ArcCase }) => data.brokers.find((item) => item.id === row.caseRow.broker_id)?.name ?? '' },
    { key: 'account', title: '帳戶名稱', render: (row: { caseRow: ArcCase }) => data.accounts.find((item) => item.id === row.caseRow.payment_account_id)?.account_name ?? '' },
    { key: 'employer', title: '雇主', render: (row: { caseRow: ArcCase }) => row.caseRow.employer_name },
    { key: 'worker', title: '工人', render: (row: { caseRow: ArcCase }) => row.caseRow.worker_name },
    { key: 'group', title: '團號', render: (row: { caseRow: ArcCase }) => row.caseRow.group_no ?? '' },
    { key: 'item', title: '申請項目', render: (row: { caseRow: ArcCase }) => data.applicationItems.find((item) => item.id === row.caseRow.application_item_id)?.name ?? '' },
    { key: 'amount', title: '金額', render: (row: { caseRow: ArcCase }) => formatMoney(row.caseRow.amount) },
    { key: 'status', title: '對帳狀態', render: (row: { batch?: { status: never } }) => row.batch ? <BatchStatusBadge status={row.batch.status} /> : '' }
  ];

  return (
    <div className="page-content finance-query-page">
      <PageHeader title="財務查詢" description="預設顯示全部資料，可用繳費月份與雇主 / 工人名稱查詢篩選。" />
      <section className="card full-width-card no-compress">
        <div className="search-toolbar finance-toolbar">
          <SearchInput id="financeKeywordSearch" value={keyword} onCommit={setKeyword} placeholder="雇主 / 工人名稱查詢" />
          <label className="inline-field"><span>繳費月份</span><select value={month} onChange={(e) => setMonth(e.target.value)}><option value="">全部月份</option>{monthOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        </div>
        <DataTable columns={columns} rows={financeRows} rowKey={(row) => row.caseRow.id} emptyText="查無財務資料" />
      </section>
    </div>
  );
}
