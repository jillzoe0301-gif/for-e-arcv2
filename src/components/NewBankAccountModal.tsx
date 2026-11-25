import { FormEvent, useRef, useState } from 'react';
import { createBankAccount } from '../api/bankAccounts';
import { useToast } from '../context/ToastContext';
import type { BrokerCompany, Profile } from '../types';
import { parseMoney } from '../utils/number';
import { Modal } from './Modal';

export function NewBankAccountModal({ brokers, profile, reload, onClose }: {
  brokers: BrokerCompany[]; profile: Profile | null; reload: () => Promise<void>; onClose: () => void;
}) {
  const { pushToast } = useToast();
  const enabledBrokers = brokers.filter((broker) => broker.is_enabled);
  const [form, setForm] = useState({ broker_id: enabledBrokers[0]?.id ?? '', account_name: '', bank_code: '', bank_name: '', account_no: '', initial_balance: '0' });
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    const balance = parseMoney(form.initial_balance);
    if (balance === null || !Number.isFinite(balance)) return pushToast({ type: 'warning', title: '初始餘額格式錯誤' });
    pending.current = true;
    setSaving(true);
    try {
      await createBankAccount({ ...form, initial_balance: balance }, profile);
    } catch (error) {
      pushToast({ type: 'error', title: '新增失敗', message: error instanceof Error ? error.message : (error as { message?: string })?.message ?? '請稍後再試' });
      pending.current = false;
      setSaving(false);
      return;
    }
    pushToast({ type: 'success', title: '扣款帳號已新增', message: '可於居留證繳費及財務對帳選用。' });
    onClose();
    try { await reload(); } catch {
      pushToast({ type: 'warning', title: '帳號已新增，請重新整理頁面載入最新資料。' });
    }
  }

  return <Modal title="新增扣款帳號" onClose={() => { if (!pending.current) onClose(); }}>
    <form onSubmit={save}>
      <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="form-grid two-col">
          <label><span>所屬仲介</span><select value={form.broker_id} onChange={(e) => update('broker_id', e.target.value)} required><option value="">請選擇</option>{enabledBrokers.map((broker) => <option key={broker.id} value={broker.id}>{broker.name}</option>)}</select></label>
          <label><span>帳戶名稱</span><input value={form.account_name} onChange={(e) => update('account_name', e.target.value)} placeholder="例如：灃禾－台灣銀行" required /></label>
          <label><span>銀行代碼</span><input value={form.bank_code} onChange={(e) => update('bank_code', e.target.value)} inputMode="numeric" placeholder="3 位銀行代碼" required /></label>
          <label><span>銀行名稱</span><input value={form.bank_name} onChange={(e) => update('bank_name', e.target.value)} placeholder="例如：台灣銀行" required /></label>
          <label><span>完整帳號</span><input value={form.account_no} onChange={(e) => update('account_no', e.target.value)} inputMode="numeric" autoComplete="off" required /></label>
          <label><span>初始餘額</span><input value={form.initial_balance} onChange={(e) => update('initial_balance', e.target.value)} inputMode="decimal" required /></label>
        </div>
        <p className="subtle-text">新增後立即啟用，目前餘額會以初始餘額帶入。</p>
        {!enabledBrokers.length ? <p className="subtle-text">請先在仲介公司設定新增並啟用所屬仲介。</p> : null}
        <div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button type="submit" className="primary-button" disabled={!enabledBrokers.length}>{saving ? '儲存中…' : '新增帳號'}</button></div>
      </fieldset>
    </form>
  </Modal>;
}
