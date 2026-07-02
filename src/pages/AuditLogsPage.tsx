import { useMemo, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { SearchInput } from '../components/SearchInput';
import type { ArcData, AuditLog } from '../types';
import { displayDateTime } from '../utils/date';
import { rowMatchesKeyword } from '../utils/search';

export function AuditLogsPage({ data }: { data: ArcData }) {
  const [keyword, setKeyword] = useState('');
  const rows = useMemo(() => data.auditLogs.filter((log) => rowMatchesKeyword(keyword, [log.action_type, log.actor_name, log.page_name, log.reason, log.record_table, log.record_id])), [data.auditLogs, keyword]);
  return (
    <div className="page-content">
      <PageHeader title="操作紀錄" description="新增、修改、刪除、取消、會計確認、金額修正、登入登出與系統設定異動。" />
      <section className="card full-width-card">
        <div className="search-toolbar"><SearchInput value={keyword} onCommit={setKeyword} placeholder="操作類型 / 操作人 / 頁面 / 原因搜尋" /></div>
        <DataTable columns={[
          { key: 'time', title: '操作時間', render: (row: AuditLog) => displayDateTime(row.created_at) },
          { key: 'type', title: '操作類型', render: (row: AuditLog) => row.action_type },
          { key: 'actor', title: '操作人', render: (row: AuditLog) => row.actor_name ?? '' },
          { key: 'page', title: '操作頁面', render: (row: AuditLog) => row.page_name ?? '' },
          { key: 'table', title: '資料表', render: (row: AuditLog) => row.record_table ?? '' },
          { key: 'reason', title: '異動原因', render: (row: AuditLog) => row.reason ?? '' },
          { key: 'diff', title: '原資料 / 新資料', render: (row: AuditLog) => <details><summary>查看</summary><pre>{JSON.stringify({ old_data: row.old_data, new_data: row.new_data }, null, 2)}</pre></details> }
        ]} rows={rows} rowKey={(row) => row.id} emptyText="目前沒有操作紀錄" />
      </section>
    </div>
  );
}
