import { useMemo, useState } from 'react';
import { deleteArcCase } from '../api/repository';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { SearchInput } from '../components/SearchInput';
import { CaseStatusBadge } from '../components/StatusBadge';
import { useToast } from '../context/ToastContext';
import type { ArcCase, ArcData, CaseStatus, Profile } from '../types';
import { formatDate } from '../utils/date';
import { formatMoney } from '../utils/number';
import { canDeleteData } from '../utils/permissions';
import { rowMatchesKeyword } from '../utils/search';
import { caseStatusLabels } from '../utils/status';

export function CaseSearchPage({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<CaseStatus | ''>('');

  const rows = useMemo(() => data.cases
    .filter((caseRow) => !status || caseRow.status === status)
    .filter((caseRow) => rowMatchesKeyword(keyword, [
      caseRow.case_no,
      caseRow.employer_name,
      caseRow.worker_name,
      caseRow.group_no,
      data.applicationItems.find((item) => item.id === caseRow.application_item_id)?.name,
      caseRow.receipt_no,
      caseRow.foreign_no_last5
    ])), [data.applicationItems, data.cases, keyword, status]);

  async function remove(row: ArcCase) {
    if (!canDeleteData(profile?.role)) {
      pushToast({ type: 'warning', title: '您沒有刪除權限。' });
      return;
    }
    if (!window.confirm('確定要刪除此筆資料嗎？刪除後不可復原。')) return;
    try {
      await deleteArcCase(row, data, profile, '案件查詢');
      pushToast({ type: 'success', title: '案件已刪除' });
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '刪除失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }

  function statusCell(row: ArcCase) {
    if (row.status === 'pending_pickup' && row.note?.includes('現場申請')) {
      return <span className="status-badge status-pending_pickup">現場申請 / 待傳真領件</span>;
    }
    return <CaseStatusBadge status={row.status} />;
  }

  const columns = [
    { key: 'case_no', title: '案件編號', render: (row: ArcCase) => row.case_no },
    { key: 'status', title: '狀態', render: (row: ArcCase) => statusCell(row) },
    { key: 'broker', title: '仲介', render: (row: ArcCase) => data.brokers.find((item) => item.id === row.broker_id)?.name ?? '' },
    { key: 'handler', title: '承辦', render: (row: ArcCase) => row.handler_name },
    { key: 'employer', title: '雇主', render: (row: ArcCase) => row.employer_name },
    { key: 'worker', title: '工人', render: (row: ArcCase) => row.worker_name },
    { key: 'group', title: '團號', render: (row: ArcCase) => row.group_no ?? '' },
    { key: 'item', title: '申請項目', render: (row: ArcCase) => data.applicationItems.find((item) => item.id === row.application_item_id)?.name ?? '' },
    { key: 'amount', title: '金額', render: (row: ArcCase) => formatMoney(row.amount) },
    { key: 'receipt', title: '收件編號', render: (row: ArcCase) => row.receipt_no ?? '' },
    { key: 'foreign', title: '外字五碼', render: (row: ArcCase) => row.foreign_no_last5 ?? '' },
    { key: 'application_date', title: '申請日', render: (row: ArcCase) => formatDate(row.application_date) },
    { key: 'payment_date', title: '收費日期', render: (row: ArcCase) => formatDate(row.payment_date) },
    { key: 'fax_date', title: '傳真日期', render: (row: ArcCase) => formatDate(row.fax_date) },
    { key: 'pickup_date', title: '領件日', render: (row: ArcCase) => formatDate(row.pickup_date ?? (row.status === 'completed' ? row.expected_pickup_date : null)) },
    { key: 'delete', title: '刪除', render: (row: ArcCase) => canDeleteData(profile?.role) ? <button className="danger-link" onClick={() => remove(row)}>刪除</button> : null }
  ];

  return (
    <div className="page-content">
      <PageHeader title="案件查詢" description="可搜尋案件編號、雇主、工人、團號、申請項目、收件編號、外字五碼。" />
      <section className="card full-width-card">
        <div className="search-toolbar finance-toolbar">
          <SearchInput id="caseSearchInput" value={keyword} onCommit={setKeyword} placeholder="案件編號 / 雇主 / 工人 / 團號 / 申請項目 / 收件編號 / 外字五碼" />
          <label className="inline-field"><span>狀態</span><select value={status} onChange={(e) => setStatus(e.target.value as CaseStatus | '')}><option value="">全部狀態</option>{Object.entries(caseStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        </div>
        <div className="search-result-area">
          <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} emptyText="查無案件資料" />
        </div>
      </section>
    </div>
  );
}
