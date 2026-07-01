import { useMemo, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { SearchInput } from '../components/SearchInput';
import type { ContactRecord } from '../types';
import { rowMatchesKeyword } from '../utils/search';

export function ContactListPage({
  title,
  description,
  contacts
}: {
  title: string;
  description?: string;
  contacts: ContactRecord[];
}) {
  const [keyword, setKeyword] = useState('');
  const rows = useMemo(() => contacts.filter((row) => rowMatchesKeyword(keyword, [row.name, row.city, row.address, row.phone, row.fax, row.note])), [contacts, keyword]);
  return (
    <div className="page-content">
      <PageHeader title={title} description={description} />
      <section className="card full-width-card">
        <div className="search-toolbar"><SearchInput value={keyword} onCommit={setKeyword} placeholder="關鍵字搜尋" /></div>
        <DataTable columns={[
          { key: 'name', title: '名稱', render: (row: ContactRecord) => row.name },
          { key: 'city', title: '縣市', render: (row: ContactRecord) => row.city ?? '' },
          { key: 'address', title: '地址', render: (row: ContactRecord) => row.address ?? '' },
          { key: 'phone', title: '電話', render: (row: ContactRecord) => row.phone ?? '' },
          { key: 'fax', title: '傳真', render: (row: ContactRecord) => row.fax ?? '' },
          { key: 'note', title: '備註', render: (row: ContactRecord) => row.note ?? '' }
        ]} rows={rows} rowKey={(row) => row.id} emptyText="目前沒有聯絡資訊，請由系統設定新增。" />
      </section>
    </div>
  );
}
