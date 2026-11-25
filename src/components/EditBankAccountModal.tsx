import { FormEvent, useRef, useState } from 'react';
import { updateBankAccount } from '../api/bankAccounts';
import { useToast } from '../context/ToastContext';
import type { BankAccount, Profile } from '../types';
import { formatMoney } from '../utils/number';
import { Modal } from './Modal';

export function EditBankAccountModal({ account, brokerName, profile, reload, onClose }: {
  account: BankAccount; brokerName: string; profile: Profile | null; reload: () => Promise<void>; onClose: () => void;
}) {
  const { pushToast } = useToast();
  const [form, setForm] = useState({ account_name: account.account_name, bank_code: account.bank_code, bank_name: account.bank_name, account_no: account.account_no });
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    try {
      await updateBankAccount(account, form, profile);
    } catch (error) {
      pushToast({ type: 'error', title: '修改失敗', message: error instanceof Error ? error.message : (error as { message?: string })?.message ?? '請稍後再試' });
      pending.current = false;
      setSaving(false);
      return;
    }
    pushToast({ type: 'success', title: '帳戶資料已更新' });
    onClose();
    try { await reload(); } catch {
      pushToast({ type: 'warning', title: '帳戶已更新，請重新整理頁面載入最新資料。' });
    }
  }

  return <Modal title="修改帳戶" onClose={() => { if (!pending.current) onClose(); }}>
    <p className="subtle-text">所屬仲介：{brokerName}｜目前餘額：{formatMoney(account.current_balance)}</p>
    <form onSubmit={save}>
      <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="form-grid two-col">
          <label><span>帳戶名稱</span><input value={form.account_name} onChange={(e) => update('account_name', e.target.value)} required /></label>
          <label><span>銀行代碼</span><input value={form.bank_code} onChange={(e) => update('bank_code', e.target.value)} inputMode="numeric" placeholder="3 位銀行代碼" required /></label>
          <label><span>銀行名稱</span><input value={form.bank_name} onChange={(e) => update('bank_name', e.target.value)} required /></label>
          <label><span>完整帳號</span><input value={form.account_no} onChange={(e) => update('account_no', e.target.value)} inputMode="numeric" autoComplete="off" required /></label>
        </div>
        <div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button type="submit" className="primary-button">{saving ? '儲存中…' : '儲存修改'}</button></div>
      </fieldset>
    </form>
  </Modal>;
}
