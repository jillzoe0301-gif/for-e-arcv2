import { PageHeader } from '../components/PageHeader';
import type { ArcData } from '../types';
import { formatMoney } from '../utils/number';
import { taipeiWeekday, todayTaipei } from '../utils/date';

export function DashboardPage({ data }: { data: ArcData }) {
  const pendingPayment = data.cases.filter((item) => item.status === 'pending_payment').length;
  const pendingPickup = data.cases.filter((item) => item.status === 'pending_pickup' || item.status === 'not_received').length;
  const cancelled = data.cases.filter((item) => item.status === 'cancelled').length;
  const pendingBatch = data.batches.filter((item) => item.status === 'pending' || item.status === 'amount_error').length;
  const weekday = taipeiWeekday();
  const todayLabel = weekday === 1 ? '週一繳費' : weekday === 2 ? '週二傳真' : weekday === 4 ? '週四領件' : '今日無固定提醒';
  const chipResidenceUrl = String(data.settings.find((item) => item.setting_group === 'links' && item.setting_key === 'chip_residence_query')?.setting_value?.url ?? '');
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
      <div className="dashboard-grid">
        <div className="stat-card"><span>待繳案件</span><strong>{pendingPayment}</strong></div>
        <div className="stat-card"><span>待傳真/領件</span><strong>{pendingPickup}</strong></div>
        <div className="stat-card"><span>待財務對帳</span><strong>{pendingBatch}</strong></div>
        <div className="stat-card danger"><span>取消案件</span><strong>{cancelled}</strong></div>
      </div>
      <section className="card">
        <h2>提醒事項</h2>
        <div className="reminder-row">
          {['週一繳費', '週二傳真', '週四領件'].map((label) => (
            <div key={label} className={`reminder-card ${todayLabel === label ? 'today' : ''}`}>
              <strong>{label}</strong>
              {todayLabel === label ? <span className="today-tag">今天</span> : null}
            </div>
          ))}
        </div>
        <p className="payment-reminder-text">乾坤、灃禾繳費前請先與財務確認。</p>
      </section>

      <section className="card full-width-card">
        <h2>常用外部連結</h2>
        <div className="external-link-grid">
          {externalLinks.map((item) => item.url ? (
            <a key={item.label} className="external-link-card" href={item.url} target="_blank" rel="noreferrer">{item.label}</a>
          ) : (
            <span key={item.label} className="external-link-card disabled">{item.label}<small>請至系統設定補上網址</small></span>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>帳戶餘額</h2>
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
