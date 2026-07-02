import { useState } from 'react';
import { adjustAccountBalance } from '../api/repository';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../context/ToastContext';
import type { ArcData, BankAccount, Profile } from '../types';
import { formatMoney, parseMoney } from '../utils/number';
import { canAdjustBalance } from '../utils/permissions';

export function BrokersAccountsPage({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [target, setTarget] = useState<BankAccount | null>(null);
  const [nextBalance, setNextBalance] = useState('');
  const [reason, setReason] = useState('');

  function open(account: BankAccount) {
    setTarget(account);
    setNextBalance(String(account.current_balance ?? 0));
    setReason('');
  }

  async function copyAccount(account: BankAccount) {
    try {
      await navigator.clipboard.writeText(account.account_no);
      pushToast({ type: 'success', title: '已複製銀行帳號', message: account.account_no });
    } catch {
      pushToast({ type: 'warning', title: '無法自動複製，請手動複製。' });
    }
  }

  async function submit() {
    if (!target) return;
    const money = parseMoney(nextBalance);
    if (money === null) return pushToast({ type: 'warning', title: '餘額格式錯誤' });
    if (!reason.trim()) return pushToast({ type: 'warning', title: '請輸入調整原因' });
    try {
      await adjustAccountBalance(target, money, reason.trim(), profile);
      pushToast({ type: 'success', title: '帳戶餘額已調整' });
      setTarget(null);
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '調整失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }

  return (
    <div className="page-content">
      <PageHeader title="仲介與扣款帳號" description="灃康不同帳號餘額分開顯示，不合併成灃康總額。銀行帳號可點擊複製。" />
      <section className="card full-width-card">
        <h2>仲介公司</h2>
        <DataTable columns={[
          { key: 'name', title: '仲介', render: (row: { name: string }) => row.name },
          { key: 'full', title: '正式名稱', render: (row: { full_name: string }) => row.full_name },
          { key: 'code', title: '代碼', render: (row: { code: string }) => row.code },
          { key: 'phone', title: '電話', render: (row: { phone?: string | null }) => row.phone ?? '' },
          { key: 'enabled', title: '啟用', render: (row: { is_enabled: boolean }) => row.is_enabled ? '是' : '否' }
        ]} rows={data.brokers} rowKey={(row) => row.id} />
      </section>
      <section className="card full-width-card">
        <h2>扣款帳號 / 餘額</h2>
        <p className="subtle-text">會計角色可查看仲介、扣款帳號與餘額；不可直接手動調整帳戶餘額或刪除帳戶。</p>
        <DataTable columns={[
          { key: 'broker', title: '所屬仲介', render: (row: BankAccount) => data.brokers.find((item) => item.id === row.broker_id)?.name ?? '' },
          { key: 'account', title: '帳戶名稱', render: (row: BankAccount) => row.account_name },
          { key: 'bank', title: '銀行', render: (row: BankAccount) => `${row.bank_name} ${row.bank_code}` },
          { key: 'last5', title: '帳號後五碼', render: (row: BankAccount) => row.account_last5 ?? row.account_no.slice(-5) },
          { key: 'no', title: '完整帳號', render: (row: BankAccount) => <button type="button" className="copy-text-button" onClick={() => copyAccount(row)} title="點擊複製銀行帳號">{row.account_no}</button> },
          { key: 'balance', title: '目前餘額', render: (row: BankAccount) => formatMoney(row.current_balance) },
          { key: 'default', title: '預設帳戶', render: (row: BankAccount) => row.is_default ? '是' : '否' },
          { key: 'enabled', title: '是否啟用', render: (row: BankAccount) => row.is_enabled ? '啟用' : '停用' },
          { key: 'action', title: '操作', render: (row: BankAccount) => canAdjustBalance(profile?.role) ? <button className="secondary-button mini" onClick={() => open(row)}>調整餘額</button> : <span className="subtle-text">僅可查看</span> }
        ]} rows={data.accounts} rowKey={(row) => row.id} />
      </section>
      {target ? (
        <Modal title="調整帳戶餘額" onClose={() => setTarget(null)}>
          <p>{target.account_name}</p>
          <label><span>調整後餘額</span><input value={nextBalance} onChange={(e) => setNextBalance(e.target.value)} /></label>
          <label><span>異動原因</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <div className="form-actions"><button className="primary-button" onClick={submit}>儲存調整</button></div>
        </Modal>
      ) : null}
    </div>
  );
}
