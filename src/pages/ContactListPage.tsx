import { useMemo, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { SearchInput } from '../components/SearchInput';
import { useToast } from '../context/ToastContext';
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
  const { pushToast } = useToast();
  const [keyword, setKeyword] = useState('');
  const rows = useMemo(() => contacts.filter((row) => rowMatchesKeyword(keyword, [row.name, row.city, row.address, row.phone, row.fax, row.note])), [contacts, keyword]);

  async function copyText(label: string, value?: string | null) {
    const text = String(value ?? '').trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      pushToast({ type: 'success', title: `已複製${label}`, message: text });
    } catch {
      pushToast({ type: 'warning', title: '無法自動複製，請手動複製。' });
    }
  }

  const copyCell = (label: string, value?: string | null) => {
    const text = String(value ?? '').trim();
    if (!text) return '';
    return <button type="button" className="copy-text-button" onClick={() => copyText(label, text)} title={`點擊複製${label}`}>{text}</button>;
  };

  return (
    <div className="page-content">
      <PageHeader title={title} description={description} />
      <section className="card full-width-card">
        <div className="search-toolbar"><SearchInput value={keyword} onCommit={setKeyword} placeholder="關鍵字搜尋" /></div>
        <DataTable columns={[
          { key: 'name', title: '名稱', render: (row: ContactRecord) => copyCell('名稱', row.name) },
          { key: 'city', title: '縣市', render: (row: ContactRecord) => row.city ?? '' },
          { key: 'address', title: '地址', render: (row: ContactRecord) => copyCell('地址', row.address) },
          { key: 'phone', title: '電話', render: (row: ContactRecord) => copyCell('電話', row.phone) },
          { key: 'fax', title: '傳真', render: (row: ContactRecord) => copyCell('傳真', row.fax) },
          { key: 'note', title: '備註', render: (row: ContactRecord) => row.note ?? '' }
        ]} rows={rows} rowKey={(row) => row.id} emptyText="目前沒有聯絡資訊，請由系統設定新增。" />
      </section>
    </div>
  );
}
