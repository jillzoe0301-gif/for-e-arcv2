import { supabase } from '../lib/supabase';
import type { BankAccount, Profile } from '../types';
import { canCreateBankAccount } from '../utils/permissions';
import { addAudit } from './repository';

export type NewBankAccount = Pick<BankAccount, 'broker_id' | 'account_name' | 'bank_code' | 'bank_name' | 'account_no' | 'initial_balance'>;

export async function createBankAccount(input: NewBankAccount, actor: Profile | null): Promise<BankAccount> {
  if (!actor?.is_active || !canCreateBankAccount(actor.role)) throw new Error('您沒有新增扣款帳號的權限。');
  const payload = {
    broker_id: input.broker_id,
    account_name: input.account_name.trim(),
    bank_code: input.bank_code.normalize('NFKC').trim(),
    bank_name: input.bank_name.trim(),
    account_no: input.account_no.normalize('NFKC').replace(/[\s-]/g, ''),
    initial_balance: input.initial_balance,
    current_balance: input.initial_balance,
    is_enabled: true,
    is_default: false,
    created_by: actor.id,
    updated_by: actor.id
  };
  if (!payload.broker_id || !payload.account_name || !payload.bank_name) throw new Error('請完整填寫所屬仲介、帳戶名稱及銀行名稱。');
  if (!/^\d{3}$/.test(payload.bank_code)) throw new Error('銀行代碼請輸入 3 位數字。');
  if (!/^\d+$/.test(payload.account_no)) throw new Error('請輸入正確的銀行帳號。');
  if (!Number.isFinite(payload.initial_balance)) throw new Error('初始餘額格式錯誤。');

  const { data: broker, error: brokerError } = await supabase.from('broker_companies').select('id, is_enabled').eq('id', payload.broker_id).maybeSingle();
  if (brokerError) throw brokerError;
  if (!broker?.is_enabled) throw new Error('請選擇啟用中的仲介公司。');

  const { data: existing, error: lookupError } = await supabase.from('bank_accounts').select('id, account_no')
    .eq('broker_id', payload.broker_id).eq('bank_code', payload.bank_code).is('deleted_at', null);
  if (lookupError) throw lookupError;
  if (existing?.some((row) => String(row.account_no).normalize('NFKC').replace(/[\s-]/g, '') === payload.account_no)) {
    throw new Error('此仲介已設定相同的銀行帳號，請確認現有帳戶。');
  }

  const { data, error } = await supabase.from('bank_accounts').insert(payload).select('*').single();
  if (error) throw error;
  await addAudit({ action_type: '新增扣款帳號', actor_id: actor.id, actor_name: actor.display_name,
    page_name: '仲介與扣款帳號', record_table: 'bank_accounts', record_id: data.id, new_data: data });
  return data as BankAccount;
}
