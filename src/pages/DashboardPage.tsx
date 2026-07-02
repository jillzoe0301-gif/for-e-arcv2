import { AnnouncementBanner } from '../components/AnnouncementBanner';
import { PageHeader } from '../components/PageHeader';
import type { ArcData } from '../types';
import { formatMoney } from '../utils/number';
import { taipeiWeekday, todayTaipei } from '../utils/date';
import { IconImage } from '../utils/icons';

const reminderItems = [
  { title: '週一繳費', content: '整理待繳案件與扣款帳號，送出前確認批次資料。', weekday: 1, dayText: '每週一' },
  { title: '週二傳真', content: '確認收件編號、外字五碼與收據順序後，準備傳真。', weekday: 2, dayText: '每週二' },
  { title: '週四領件', content: '依領件日排序，列印傳真領件單與簽收單。', weekday: 4, dayText: '每週四' }
];

export function DashboardPage({ data }: { data: ArcData }) {
  const pendingPayment = data.cases.filter((item) => item.status === 'pending_payment').length;
  const pendingPickup = data.cases.filter((item) => item.status === 'pending_pickup' || item.status === 'not_received').length;
  const cancelled = data.cases.filter((item) => item.status === 'cancelled').length;
  const pendingBatch = data.batches.filter((item) => item.status === 'pending' || item.status === 'amount_error').length;
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
      <PageHeader title="總覽" description={`今日：${todayTaipei()}（Asia/Taipei）`} />
      <AnnouncementBanner items={data.announcements} page="總覽" />
      <div className="dashboard-grid">
        <div className="stat-card icon-stat-card"><IconImage name="居留證繳費" size={28} /><span>待繳案件</span><strong>{pendingPayment}</strong></div>
        <div className="stat-card icon-stat-card"><IconImage name="傳真/領件" size={28} /><span>待傳真/領件</span><strong>{pendingPickup}</strong></div>
        <div className="stat-card icon-stat-card"><IconImage name="財務對帳確認" size={28} /><span>待財務對帳</span><strong>{pendingBatch}</strong></div>
        <div className="stat-card danger icon-stat-card"><IconImage name="案件查詢" size={28} /><span>取消案件</span><strong>{cancelled}</strong></div>
      </div>
      <section className="card reminder-section">
        <div className="card-title-with-icon"><IconImage name="提醒事項" size={24} /><h2>提醒事項</h2></div>
        <div className="reminder-row quality-reminders">
          {reminderItems.map((item) => {
            const isToday = weekday === item.weekday;
            return (
              <article key={item.title} className={`reminder-card ${isToday ? 'today' : ''}`}>
                <div className="reminder-card-head">
                  <IconImage name="提醒事項" size={22} />
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
        <p className="payment-reminder-text"><IconImage name="提醒事項" size={22} />乾坤、灃禾繳費前請先與財務確認。</p>
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
