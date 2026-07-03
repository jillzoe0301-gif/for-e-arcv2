import { FormEvent, useMemo, useState } from 'react';
import { deleteAnnouncement, upsertAnnouncement } from '../api/repository';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { SearchInput } from '../components/SearchInput';
import { useToast } from '../context/ToastContext';
import type { AnnouncementItem, AnnouncementPageName, ArcData, Profile } from '../types';
import { IconImage } from '../utils/icons';
import { canManageAnnouncements } from '../utils/permissions';
import { rowMatchesKeyword } from '../utils/search';

const pageOptions: AnnouncementPageName[] = ['總覽', '居留案件登記', '居留證繳費'];

const blankAnnouncement: Partial<AnnouncementItem> = {
  title: '',
  content: '',
  icon: '公告事項',
  is_enabled: true,
  is_pinned: false,
  display_pages: ['總覽'],
  start_date: '',
  end_date: ''
};

export function AnnouncementsPage({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<Partial<AnnouncementItem> | null>(null);
  const canManage = canManageAnnouncements(profile?.role);
  const canDelete = profile?.role === 'admin';

  const filtered = useMemo(() => data.announcements.filter((row) => rowMatchesKeyword(keyword, [row.title, row.content, row.display_pages?.join(' '), row.created_by_name, row.updated_by_name])), [data.announcements, keyword]);

  function openNew() {
    if (!canManage) {
      pushToast({ type: 'warning', title: '您沒有修改公告事項的權限。' });
      return;
    }
    setEditing(blankAnnouncement);
  }

  function openEdit(row: AnnouncementItem) {
    if (!canManage) {
      pushToast({ type: 'warning', title: '您沒有修改公告事項的權限。' });
      return;
    }
    setEditing({ ...row });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing?.title?.trim() || !editing.content?.trim()) {
      pushToast({ type: 'warning', title: '請輸入公告標題與內容' });
      return;
    }
    try {
      await upsertAnnouncement({
        ...editing,
        title: editing.title.trim(),
        content: editing.content.trim(),
        start_date: editing.start_date || null,
        end_date: editing.end_date || null,
        icon: editing.icon || '公告事項'
      }, profile);
      pushToast({ type: 'success', title: '公告事項已儲存' });
      setEditing(null);
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '公告事項儲存失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }

  async function toggle(row: AnnouncementItem) {
    if (!canManage) return pushToast({ type: 'warning', title: '您沒有修改公告事項的權限。' });
    try {
      await upsertAnnouncement({ ...row, is_enabled: !row.is_enabled }, profile);
      pushToast({ type: 'success', title: row.is_enabled ? '公告已停用' : '公告已啟用' });
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '公告狀態更新失敗', message: err instanceof Error ? err.message : '' });
    }
  }

  async function remove(row: AnnouncementItem) {
    if (!canDelete) return pushToast({ type: 'warning', title: '您沒有刪除權限。' });
    if (!window.confirm('確定要刪除此筆公告事項嗎？')) return;
    try {
      await deleteAnnouncement(row, profile);
      pushToast({ type: 'success', title: '公告事項已刪除' });
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '公告事項刪除失敗', message: err instanceof Error ? err.message : '' });
    }
  }

  return (
    <div className="page-content announcement-page">
      <PageHeader title="公告事項" description="行政與管理員可新增、修改、停用公告；其他角色只可查看公告。" />
      <section className="card full-width-card">
        <div className="toolbar-row">
          <h2>公告事項管理</h2>
          {canManage ? <button className="primary-button" type="button" onClick={openNew}>新增公告</button> : null}
        </div>
        <div className="search-toolbar">
          <SearchInput value={keyword} onCommit={setKeyword} placeholder="搜尋公告標題、內容、顯示頁面" />
        </div>
        <DataTable columns={[
          { key: 'icon', title: 'Icon', render: (row: AnnouncementItem) => <IconImage name={row.icon || '公告事項'} size={22} /> },
          { key: 'title', title: '公告標題', render: (row: AnnouncementItem) => <strong>{row.title}</strong> },
          { key: 'content', title: '公告內容', render: (row: AnnouncementItem) => <span className="announcement-red-text">{row.content}</span> },
          { key: 'pages', title: '顯示頁面', render: (row: AnnouncementItem) => row.display_pages?.join('、') ?? '' },
          { key: 'date', title: '顯示日期', render: (row: AnnouncementItem) => `${row.start_date || '不限'} ～ ${row.end_date || '不限'}` },
          { key: 'status', title: '狀態', render: (row: AnnouncementItem) => <span className={row.is_enabled ? 'status-badge status-completed' : 'status-badge status-cancelled'}>{row.is_enabled ? '啟用' : '停用'}</span> },
          { key: 'pin', title: '置頂', render: (row: AnnouncementItem) => row.is_pinned ? '是' : '否' },
          { key: 'action', title: '操作', render: (row: AnnouncementItem) => canManage ? <div className="action-stack horizontal"><button className="secondary-button mini" onClick={() => openEdit(row)}>修改</button><button className="secondary-button mini" onClick={() => toggle(row)}>{row.is_enabled ? '停用' : '啟用'}</button>{canDelete ? <button className="danger-link" onClick={() => remove(row)}>刪除</button> : null}</div> : '僅可查看' }
        ]} rows={filtered} rowKey={(row) => row.id} emptyText="目前沒有公告事項" />
      </section>

      {editing ? (
        <Modal title={editing.id ? '修改公告事項' : '新增公告事項'} onClose={() => setEditing(null)}>
          <form className="form-grid one-col" onSubmit={save}>
            <label><span>公告標題</span><input value={editing.title ?? ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} required /></label>
            <label><span>公告內容</span><textarea value={editing.content ?? ''} onChange={(e) => setEditing({ ...editing, content: e.target.value })} required /></label>
            <label><span>公告 icon</span><input value={editing.icon ?? '公告事項'} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} placeholder="公告事項" /></label>
            <div className="checkbox-group-card">
              <span>顯示頁面</span>
              <div className="checkbox-grid">
                {pageOptions.map((page) => (
                  <label key={page} className="checkbox-line setting-check">
                    <input
                      type="checkbox"
                      checked={(editing.display_pages ?? []).includes(page)}
                      onChange={(e) => {
                        const current = editing.display_pages ?? [];
                        const next = e.target.checked ? [...current, page] : current.filter((item) => item !== page);
                        setEditing({ ...editing, display_pages: next });
                      }}
                    />
                    <span>{page}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="form-grid two-col full-span">
              <label><span>開始顯示日期</span><input type="date" value={editing.start_date ?? ''} onChange={(e) => setEditing({ ...editing, start_date: e.target.value })} /></label>
              <label><span>結束顯示日期</span><input type="date" value={editing.end_date ?? ''} onChange={(e) => setEditing({ ...editing, end_date: e.target.value })} /></label>
            </div>
            <div className="checkbox-grid">
              <label className="checkbox-line setting-check"><input type="checkbox" checked={editing.is_enabled ?? true} onChange={(e) => setEditing({ ...editing, is_enabled: e.target.checked })} /><span>是否啟用</span></label>
              <label className="checkbox-line setting-check"><input type="checkbox" checked={editing.is_pinned ?? false} onChange={(e) => setEditing({ ...editing, is_pinned: e.target.checked })} /><span>是否置頂</span></label>
            </div>
            <div className="form-actions"><button className="primary-button">儲存公告</button></div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
