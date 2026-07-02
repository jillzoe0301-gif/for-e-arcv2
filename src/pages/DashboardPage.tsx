import { FormEvent, useMemo, useState } from 'react';
import { upsertAnnouncement } from '../api/repository';
import { getVisibleAnnouncements } from '../components/AnnouncementBanner';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../context/ToastContext';
import type { AnnouncementItem, ArcData, Profile } from '../types';
import { monthKey, todayTaipei, taipeiWeekday } from '../utils/date';
import { IconImage } from '../utils/icons';
import { formatMoney } from '../utils/number';
import { canManageAnnouncements } from '../utils/permissions';
import { APP_UPDATED_AT, APP_UPDATE_NOTE, APP_VERSION } from '../utils/version';

const reminderItems = [
  { title: '週一繳費', content: '整理待繳案件與扣款帳號，送出前確認批次資料。', weekday: 1, dayText: '每週一' },
  { title: '週二傳真', content: '確認收件編號、外字五碼與收據順序後，準備傳真。', weekday: 2, dayText: '每週二' },
  { title: '週四領件', content: '依領件日排序，列印傳真領件單與簽收單。', weekday: 4, dayText: '每週四' }
];

function DashboardAnnouncementEditor({
  announcements,
  profile,
  reload
}: {
  announcements: AnnouncementItem[];
  profile: Profile | null;
  reload: () => Promise<void>;
}) {
  const { pushToast } = useToast();
  const canManage = canManageAnnouncements(profile?.role);
  const visible = useMemo(() => getVisibleAnnouncements(announcements, '總覽'), [announcements]);
  const current = visible[0] ?? announcements.find((item) => item.display_pages?.includes('總覽') && !item.deleted_at) ?? null;
  const displayDate = current?.start_date || todayTaipei();
  const displayContent = current?.content || '';
  const [isEditing, setIsEditing] = useState(false);
  const [draftDate, setDraftDate] = useState(displayDate);
  const [draftContent, setDraftContent] = useState(displayContent);

  function startEdit() {
    if (!canManage) {
      pushToast({ type: 'warning', title: '您沒有修改公告事項的權限。' });
      return;
    }
    setDraftDate(displayDate);
    setDraftContent(displayContent);
    setIsEditing(true);
  }

  function cancelEdit() {
    setDraftDate(displayDate);
    setDraftContent(displayContent);
    setIsEditing(false);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage) {
      pushToast({ type: 'warning', title: '您沒有修改公告事項的權限。' });
      return;
    }
    if (!draftDate) {
      pushToast({ type: 'warning', title: '請選擇公告日期' });
      return;
    }
    const content = draftContent.trim();
    try {
      await upsertAnnouncement({
        ...(current ?? {}),
        title: current?.title || '總覽公告',
        content,
        start_date: draftDate,
        end_date: current?.end_date || null,
        icon: current?.icon || '公告事項',
        is_enabled: Boolean(content),
        is_pinned: current?.is_pinned ?? true,
        display_pages: Array.from(new Set([...(current?.display_pages ?? []), '總覽']))
      }, profile);
      pushToast({ type: 'success', title: '總覽公告已更新' });
      setIsEditing(false);
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '公告儲存失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }

  return (
    <section className="dashboard-announcement-card" aria-label="總覽公告事項">
      <div className="dashboard-announcement-head">
        <h2>公告事項</h2>
        {canManage && !isEditing ? <button type="button" className="secondary-button mini" onClick={startEdit}>編輯公告</button> : null}
      </div>
      {isEditing ? (
        <form className="dashboard-announcement-form" onSubmit={save}>
          <label>
            <span>公告日期</span>
            <input type="date" value={draftDate} onChange={(event) => setDraftDate(event.target.value)} required />
          </label>
          <label>
            <span>公告內容</span>
            <textarea value={draftContent} onChange={(event) => setDraftContent(event.target.value)} rows={4} placeholder="請輸入公告內容，可使用多行文字" />
          </label>
          <div className="form-actions compact-actions">
            <button className="primary-button" type="submit">儲存公告</button>
            <button className="secondary-button" type="button" onClick={cancelEdit}>取消</button>
          </div>
        </form>
      ) : displayContent ? (
        <div className="dashboard-announcement-display">
          <div><span>公告日期：</span><strong>{displayDate}</strong></div>
          <p><span>公告內容：</span>{displayContent}</p>
        </div>
      ) : (
        <p className="dashboard-announcement-empty">目前沒有公告事項</p>
      )}
    </section>
  );
}

export function DashboardPage({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const pendingPayment = data.cases.filter((item) => item.status === 'pending_payment').length;
  const pendingPickup = data.cases.filter((item) => item.status === 'pending_pickup' || item.status === 'not_received').length;
  const cancelled = data.cases.filter((item) => item.status === 'cancelled').length;
  const activeBatches = data.batches.filter((item) => !item.deleted_at);
  const pendingBatch = activeBatches.filter((item) => item.status !== 'confirmed' && item.status !== 'cancelled').length;
  const confirmedBatch = activeBatches.filter((item) => item.status === 'confirmed').length;
  const today = todayTaipei();
  const currentMonth = monthKey(today);
  const todayBatchCount = activeBatches.filter((item) => item.payment_date === today).length;
  const monthBatchCount = activeBatches.filter((item) => monthKey(item.payment_date) === currentMonth).length;
  const weekday = taipeiWeekday();
  const chipResidenceUrl = String(data.settings.find((item) => item.setting_group === 'links' && item.setting_key === 'chip_residence_query')?.setting_value?.url ?? 'https://niaicinfo.immigration.gov.tw/icinfo-frontend/zh#MyAnchor');
  const externalLinks = [
    { label: '外籍移工線上申辦系統', url: 'https://coa.immigration.gov.tw/coa-frontend/foreign-labor' },
    { label: '移民署全球資訊網', url: 'https://www.immigration.gov.tw/7163' },
    { label: '外國專業人才及親屬線上申辦系統', url: 'https://coa.immigration.gov.tw/coa-frontend/foreign-white-collar' },
    { label: '晶片居留證資料查詢', url: chipResidenceUrl },
    { label: '入出國移民法', url: 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0080132' }
  ];

  return (
    <div className="page-content">
      <div className="dashboard-header-row"><PageHeader title="總覽" description={`今日：${today}（Asia/Taipei）`} /><div className="version-pill"><strong>目前版本：{APP_VERSION}</strong><span>更新日期：{APP_UPDATED_AT}</span><small>{APP_UPDATE_NOTE}</small></div></div>
      <DashboardAnnouncementEditor announcements={data.announcements} profile={profile} reload={reload} />
      {profile?.role === 'finance' ? (
        <div className="dashboard-grid finance-dashboard-grid">
          <div className="stat-card icon-stat-card"><IconImage name="財務對帳確認" size={28} /><span>待對帳批次數</span><strong>{pendingBatch}</strong></div>
          <div className="stat-card icon-stat-card"><IconImage name="財務查詢" size={28} /><span>已對帳批次數</span><strong>{confirmedBatch}</strong></div>
          <div className="stat-card icon-stat-card"><IconImage name="財務查詢" size={28} /><span>今日繳費批次</span><strong>{todayBatchCount}</strong></div>
          <div className="stat-card icon-stat-card"><IconImage name="匯出資料" size={28} /><span>本月繳費批次</span><strong>{monthBatchCount}</strong></div>
        </div>
      ) : (
        <div className="dashboard-grid">
          <div className="stat-card icon-stat-card"><IconImage name="居留證繳費" size={28} /><span>待繳案件</span><strong>{pendingPayment}</strong></div>
          <div className="stat-card icon-stat-card"><IconImage name="傳真/領件" size={28} /><span>待傳真/領件</span><strong>{pendingPickup}</strong></div>
          <div className="stat-card icon-stat-card"><IconImage name="財務對帳確認" size={28} /><span>待財務對帳</span><strong>{pendingBatch}</strong></div>
          <div className="stat-card danger icon-stat-card"><IconImage name="案件查詢" size={28} /><span>取消案件</span><strong>{cancelled}</strong></div>
        </div>
      )}
      <section className="card reminder-section">
        <div className="plain-card-title"><h2>提醒事項</h2></div>
        <div className="reminder-row quality-reminders">
          {reminderItems.map((item) => {
            const isToday = weekday === item.weekday;
            return (
              <article key={item.title} className={`reminder-card ${isToday ? 'today' : ''}`}>
                <div className="reminder-card-head no-icon-head">
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.dayText}</span>
                  </div>
                  {isToday ? <span className="today-tag">今天</span> : null}
                </div>
                <p>{item.content}</p>
                <div className="reminder-meta"><span>狀態：啟用</span><span>{isToday ? '今日需處理' : '非當天提醒'}</span></div>
              </article>
            );
          })}
        </div>
        <p className="payment-reminder-text no-icon-payment-reminder">乾坤、灃禾繳費前請先與財務確認。</p>
      </section>

      <section className="card full-width-card">
        <div className="card-title-with-icon"><IconImage name="總覽" size={24} /><h2>常用外部連結</h2></div>
        <div className="external-link-grid">
          {externalLinks.map((item) => item.url ? (
            <a key={item.label} className="external-link-card" href={item.url} target="_blank" rel="noreferrer">{item.label}</a>
          ) : (
            <span key={item.label} className="external-link-card disabled">{item.label}<small>請至系統設定補上網址</small></span>
          ))}
        </div>
      </section>
      <section className="card">
        <div className="card-title-with-icon"><IconImage name="仲介與扣款帳號" size={24} /><h2>帳戶餘額</h2></div>
        <div className="account-balance-grid">
          {data.accounts.map((account) => {
            const broker = data.brokers.find((item) => item.id === account.broker_id);
            return (
              <div className="balance-card" key={account.id}>
                <span>{broker?.name}｜{account.bank_name} {account.bank_code}</span>
                <strong>{formatMoney(account.current_balance)}</strong>
                <small>{account.account_no}</small>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
