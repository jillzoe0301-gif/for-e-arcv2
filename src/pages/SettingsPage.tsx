import { FormEvent, useMemo, useState, type ReactNode } from 'react';
import { softDelete, upsertSettingTable } from '../api/repository';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { SearchInput } from '../components/SearchInput';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import type { ApplicationItem, ArcData, BankAccount, BrokerCompany, ContactRecord, FeeSetting, PersonOption, Profile, Role } from '../types';
import { IconImage } from '../utils/icons';
import { canManageAccounts } from '../utils/permissions';
import { formatMoney, parseMoney } from '../utils/number';
import { rowMatchesKeyword } from '../utils/search';
import { roleLabels } from '../utils/status';

type SettingTab = 'accounts' | 'people' | 'items' | 'fees' | 'brokers' | 'bankAccounts' | 'fax' | 'reminders' | 'print' | 'stations' | 'taskForces' | 'deleted';

const tabs: Array<{ key: SettingTab; label: string; iconName: string }> = [
  { key: 'accounts', label: '帳號設定', iconName: '系統設定' },
  { key: 'people', label: '人員選項設定', iconName: '系統設定' },
  { key: 'items', label: '送件項目設定', iconName: '居留案件登記' },
  { key: 'fees', label: '手續費設定', iconName: '財務查詢' },
  { key: 'brokers', label: '仲介公司設定', iconName: '仲介與扣款帳號' },
  { key: 'bankAccounts', label: '帳戶設定', iconName: '仲介與扣款帳號' },
  { key: 'fax', label: '傳真 / 領件設定', iconName: '傳真/領件' },
  { key: 'reminders', label: '提醒事項設定', iconName: '提醒事項' },
  { key: 'print', label: '列印設定', iconName: '匯出資料' },
  { key: 'stations', label: '移民署服務站', iconName: '移民署服務站' },
  { key: 'taskForces', label: '專勤隊聯絡資訊', iconName: '專勤隊聯絡資訊' },
  { key: 'deleted', label: '刪除救回資料', iconName: '操作紀錄' }
];

export function SettingsPage({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const [tab, setTab] = useState<SettingTab>('accounts');
  return (
    <div className="page-content settings-page">
      <PageHeader title="系統設定" description="管理員可新增、修改、停用、刪除設定項目；不使用系統設定總覽。" />
      <div className="tabs wrap-tabs setting-tabs">{tabs.map((item) => <button key={item.key} className={tab === item.key ? 'active' : ''} onClick={() => setTab(item.key)}><IconImage name={item.iconName} size={18} />{item.label}</button>)}</div>
      {tab === 'accounts' && <AccountSettings data={data} profile={profile} reload={reload} />}
      {tab === 'people' && <PeopleSettings data={data} profile={profile} reload={reload} />}
      {tab === 'items' && <ApplicationItemSettings data={data} profile={profile} reload={reload} />}
      {tab === 'fees' && <FeeSettings data={data} profile={profile} reload={reload} />}
      {tab === 'brokers' && <BrokerSettings data={data} profile={profile} reload={reload} />}
      {tab === 'bankAccounts' && <BankAccountSettings data={data} profile={profile} reload={reload} />}
      {tab === 'fax' && <JsonSetting title="傳真 / 領件設定" group="fax_pickup" settingKey="rules" data={data} profile={profile} reload={reload} />}
      {tab === 'reminders' && <JsonSetting title="提醒事項設定" group="reminders" settingKey="weekly" data={data} profile={profile} reload={reload} />}
      {tab === 'print' && <JsonSetting title="列印設定" group="print" settingKey="fields" data={data} profile={profile} reload={reload} />}
      {tab === 'stations' && <ContactSettings title="移民署服務站" table="immigration_service_stations" rows={data.serviceStations} profile={profile} reload={reload} />}
      {tab === 'taskForces' && <ContactSettings title="專勤隊聯絡資訊" table="task_force_contacts" rows={data.taskForces} profile={profile} reload={reload} />}
      {tab === 'deleted' && <DeletedRecords data={data} />}
    </div>
  );
}

function AccountSettings({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const canManage = canManageAccounts(profile);
  const [newUser, setNewUser] = useState({ email: '', display_name: '', role: 'staff' as Role, password: '123456' });

  async function callAdminUsers(action: string, payload: Record<string, unknown>) {
    const { data: result, error } = await supabase.functions.invoke('arc-admin-users', { body: { action, ...payload } });
    if (error) throw error;
    if (result?.error) throw new Error(result.error);
    return result;
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return pushToast({ type: 'warning', title: '只有管理員可以新增帳號。' });
    try {
      await callAdminUsers('createUser', newUser);
      pushToast({ type: 'success', title: '帳號已建立' });
      setShowCreate(false);
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '建立帳號失敗', message: err instanceof Error ? err.message : '請確認 Edge Function 是否部署' });
    }
  }

  async function setRole(row: Profile, role: Role) {
    if (!canManage) return pushToast({ type: 'warning', title: '只有管理員可以修改帳號角色。' });
    try {
      await callAdminUsers('updateProfile', { userId: row.id, profile: { role } });
      pushToast({ type: 'success', title: '權限已更新' });
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '更新失敗', message: err instanceof Error ? err.message : '' });
    }
  }

  async function resetPassword(row: Profile) {
    if (!canManage) return pushToast({ type: 'warning', title: '行政不可修改其他人的帳號密碼。' });
    const password = window.prompt(`請輸入 ${row.display_name} 的新密碼`, '123456');
    if (!password) return;
    try {
      await callAdminUsers('resetPassword', { userId: row.id, password });
      pushToast({ type: 'success', title: '密碼已重設' });
    } catch (err) {
      pushToast({ type: 'error', title: '重設失敗', message: err instanceof Error ? err.message : '' });
    }
  }

  async function toggleActive(row: Profile) {
    if (!canManage) return pushToast({ type: 'warning', title: '只有管理員可以停用或啟用帳號。' });
    try {
      await callAdminUsers('updateProfile', { userId: row.id, profile: { is_active: !row.is_active } });
      pushToast({ type: 'success', title: row.is_active ? '帳號已停用' : '帳號已啟用' });
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '更新失敗', message: err instanceof Error ? err.message : '' });
    }
  }

  async function deleteUser(row: Profile) {
    if (!canManage) return pushToast({ type: 'warning', title: '只有管理員可以刪除帳號。' });
    if (!window.confirm(`確定要刪除帳號 ${row.display_name} 嗎？`)) return;
    try {
      await callAdminUsers('deleteUser', { userId: row.id });
      pushToast({ type: 'success', title: '帳號已刪除' });
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '刪除失敗', message: err instanceof Error ? err.message : '' });
    }
  }

  return (
    <section className="card full-width-card">
      <div className="toolbar-row"><h2>帳號設定</h2>{canManage ? <button className="primary-button" onClick={() => setShowCreate(true)}>新增帳號</button> : <span className="subtle-text">行政可查看帳號；密碼、角色、停用與刪除僅管理員可維護。</span>}</div>
      <DataTable columns={[
        { key: 'email', title: '帳號', render: (row: Profile) => row.email },
        { key: 'name', title: '使用者名稱', render: (row: Profile) => row.display_name },
        { key: 'role', title: '角色 / 權限', render: (row: Profile) => canManage ? <select value={row.role} onChange={(e) => setRole(row, e.target.value as Role)}>{Object.entries(roleLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select> : roleLabels[row.role] },
        { key: 'active', title: '是否啟用', render: (row: Profile) => row.is_active ? '啟用' : '停用' },
        { key: 'person', title: '所屬人員', render: (row: Profile) => data.people.find((item) => item.id === row.personnel_id)?.display_name ?? '' },
        { key: 'last', title: '最後登入時間', render: (row: Profile) => row.last_login_at ?? '' },
        { key: 'action', title: '操作', render: (row: Profile) => canManage ? <div className="action-stack horizontal"><button className="secondary-button mini" onClick={() => resetPassword(row)}>密碼重設</button><button className="secondary-button mini" onClick={() => toggleActive(row)}>{row.is_active ? '停用' : '啟用'}</button><button className="danger-link" onClick={() => deleteUser(row)}>刪除</button></div> : <span className="subtle-text">僅管理員可維護</span> }
      ]} rows={data.profiles} rowKey={(row) => row.id} />
      {showCreate && canManage ? (
        <Modal title="新增帳號" onClose={() => setShowCreate(false)}>
          <form className="form-grid one-col" onSubmit={createUser}>
            <label><span>Email</span><input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required /></label>
            <label><span>使用者名稱</span><input value={newUser.display_name} onChange={(e) => setNewUser({ ...newUser, display_name: e.target.value })} required /></label>
            <label><span>初始密碼</span><input value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required /></label>
            <label><span>角色</span><select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as Role })}>{Object.entries(roleLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <div className="form-actions"><button className="primary-button">建立帳號</button></div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}

function PeopleSettings({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [editing, setEditing] = useState<Partial<PersonOption> | null>(null);
  async function save() {
    if (!editing?.name || !editing.display_name) return pushToast({ type: 'warning', title: '請輸入人員姓名與顯示名稱' });
    await upsertSettingTable('person_options', editing, profile, '人員選項設定');
    pushToast({ type: 'success', title: '已儲存' });
    setEditing(null);
    await reload();
  }
  return <CrudCard title="人員選項設定" onNew={() => setEditing({ name: '', display_name: '', department: '', role_text: '', is_enabled: true, show_as_handler: true, show_as_admin: true, show_as_runner: true })}>
    <DataTable columns={[
      { key: 'name', title: '人員姓名', render: (row: PersonOption) => row.name },
      { key: 'display', title: '顯示名稱', render: (row: PersonOption) => row.display_name },
      { key: 'dept', title: '部門', render: (row: PersonOption) => row.department ?? '' },
      { key: 'role', title: '角色', render: (row: PersonOption) => row.role_text ?? '' },
      { key: 'enabled', title: '啟用', render: (row: PersonOption) => row.is_enabled ? '是' : '否' },
      { key: 'show', title: '承辦 / 行政 / 送件', render: (row: PersonOption) => `${row.show_as_handler ? '承辦 ' : ''}${row.show_as_admin ? '行政 ' : ''}${row.show_as_runner ? '送件' : ''}` },
      { key: 'action', title: '操作', render: (row: PersonOption) => <SettingActions row={row} table="person_options" pageName="人員選項設定" profile={profile} reload={reload} onEdit={() => setEditing(row)} /> }
    ]} rows={data.people} rowKey={(row) => row.id} />
    {editing ? <Modal title="人員選項設定" onClose={() => setEditing(null)}><div className="form-grid two-col"><TextField label="人員姓名" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} /><TextField label="顯示名稱" value={editing.display_name} onChange={(v) => setEditing({ ...editing, display_name: v })} /><TextField label="部門" value={editing.department} onChange={(v) => setEditing({ ...editing, department: v })} /><TextField label="角色" value={editing.role_text} onChange={(v) => setEditing({ ...editing, role_text: v })} /><BoolField label="是否啟用" checked={editing.is_enabled ?? true} onChange={(v) => setEditing({ ...editing, is_enabled: v })} /><BoolField label="顯示在承辦選項" checked={editing.show_as_handler ?? true} onChange={(v) => setEditing({ ...editing, show_as_handler: v })} /><BoolField label="顯示在行政選項" checked={editing.show_as_admin ?? true} onChange={(v) => setEditing({ ...editing, show_as_admin: v })} /><BoolField label="顯示在送件人員選項" checked={editing.show_as_runner ?? true} onChange={(v) => setEditing({ ...editing, show_as_runner: v })} /></div><div className="form-actions"><button className="primary-button" onClick={save}>儲存</button></div></Modal> : null}
  </CrudCard>;
}

function ApplicationItemSettings({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [editing, setEditing] = useState<Partial<ApplicationItem> | null>(null);
  async function save() {
    if (!editing?.name) return pushToast({ type: 'warning', title: '請輸入送件項目名稱' });
    await upsertSettingTable('application_items', editing, profile, '送件項目設定');
    pushToast({ type: 'success', title: '已儲存' });
    setEditing(null);
    await reload();
  }
  const fields = editing ? <Modal title="送件項目設定" onClose={() => setEditing(null)}><div className="form-grid two-col"><TextField label="送件項目名稱" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} /><TextField label="預設金額" value={String(editing.default_amount ?? 0)} onChange={(v) => setEditing({ ...editing, default_amount: parseMoney(v) ?? 0 })} />{['is_enabled','requires_payment','enters_fax_pickup','enters_finance','included_in_stats','requires_ic_card','requires_old_card'].map((key) => <BoolField key={key} label={labelForItemKey(key)} checked={Boolean((editing as Record<string, unknown>)[key])} onChange={(v) => setEditing({ ...editing, [key]: v })} />)}</div><div className="form-actions"><button className="primary-button" onClick={save}>儲存</button></div></Modal> : null;
  return <CrudCard title="送件項目設定" onNew={() => setEditing({ name: '', default_amount: 0, is_enabled: true, requires_payment: true, enters_fax_pickup: true, enters_finance: true, included_in_stats: true, requires_ic_card: true, requires_old_card: false, sort_order: data.applicationItems.length + 1 })}>
    <DataTable columns={[
      { key: 'name', title: '送件項目名稱', render: (row: ApplicationItem) => row.name },
      { key: 'amount', title: '預設金額', render: (row: ApplicationItem) => formatMoney(row.default_amount) },
      { key: 'flags', title: '規則', render: (row: ApplicationItem) => `${row.requires_payment ? '需繳費 ' : ''}${row.enters_fax_pickup ? '進傳真/領件 ' : ''}${row.enters_finance ? '進財務 ' : ''}${row.included_in_stats ? '列統計' : ''}` },
      { key: 'cards', title: 'IC/舊卡', render: (row: ApplicationItem) => `${row.requires_ic_card ? 'IC卡 ' : ''}${row.requires_old_card ? '舊卡' : ''}` },
      { key: 'action', title: '操作', render: (row: ApplicationItem) => <SettingActions row={row} table="application_items" pageName="送件項目設定" profile={profile} reload={reload} onEdit={() => setEditing(row)} /> }
    ]} rows={data.applicationItems} rowKey={(row) => row.id} />{fields}</CrudCard>;
}

function FeeSettings({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [editing, setEditing] = useState<Partial<FeeSetting> | null>(null);
  async function save() {
    if (!editing?.fee_name) return pushToast({ type: 'warning', title: '請輸入手續費項目名稱' });
    await upsertSettingTable('fee_settings', editing, profile, '手續費設定');
    pushToast({ type: 'success', title: '已儲存' });
    setEditing(null);
    await reload();
  }
  return <CrudCard title="手續費設定" onNew={() => setEditing({ fee_name: '', amount: 0, is_enabled: true, include_in_finance_search: true, include_in_reconciliation: true })}>
    <DataTable columns={[
      { key: 'name', title: '手續費項目名稱', render: (row: FeeSetting) => row.fee_name },
      { key: 'amount', title: '金額', render: (row: FeeSetting) => formatMoney(row.amount) },
      { key: 'broker', title: '對應仲介', render: (row: FeeSetting) => data.brokers.find((item) => item.id === row.broker_id)?.name ?? '全部' },
      { key: 'item', title: '對應申請項目', render: (row: FeeSetting) => data.applicationItems.find((item) => item.id === row.application_item_id)?.name ?? '全部' },
      { key: 'enabled', title: '啟用', render: (row: FeeSetting) => row.is_enabled ? '是' : '否' },
      { key: 'action', title: '操作', render: (row: FeeSetting) => <SettingActions row={row} table="fee_settings" pageName="手續費設定" profile={profile} reload={reload} onEdit={() => setEditing(row)} /> }
    ]} rows={data.feeSettings} rowKey={(row) => row.id} />
    {editing ? <Modal title="手續費設定" onClose={() => setEditing(null)}><div className="form-grid two-col"><TextField label="手續費項目名稱" value={editing.fee_name} onChange={(v) => setEditing({ ...editing, fee_name: v })} /><TextField label="金額" value={String(editing.amount ?? 0)} onChange={(v) => setEditing({ ...editing, amount: parseMoney(v) ?? 0 })} /><label><span>對應仲介</span><select value={editing.broker_id ?? ''} onChange={(e) => setEditing({ ...editing, broker_id: e.target.value || null })}><option value="">全部</option>{data.brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label><span>對應申請項目</span><select value={editing.application_item_id ?? ''} onChange={(e) => setEditing({ ...editing, application_item_id: e.target.value || null })}><option value="">全部</option>{data.applicationItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label><BoolField label="是否啟用" checked={editing.is_enabled ?? true} onChange={(v) => setEditing({ ...editing, is_enabled: v })} /><BoolField label="列入財務查詢" checked={editing.include_in_finance_search ?? true} onChange={(v) => setEditing({ ...editing, include_in_finance_search: v })} /><BoolField label="列入對帳確認" checked={editing.include_in_reconciliation ?? true} onChange={(v) => setEditing({ ...editing, include_in_reconciliation: v })} /></div><div className="form-actions"><button className="primary-button" onClick={save}>儲存</button></div></Modal> : null}
  </CrudCard>;
}

function BrokerSettings({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [editing, setEditing] = useState<Partial<BrokerCompany> | null>(null);
  async function save() {
    if (!editing?.name || !editing.code || !editing.full_name) return pushToast({ type: 'warning', title: '請輸入仲介公司名稱、正式名稱與代碼' });
    await upsertSettingTable('broker_companies', editing, profile, '仲介公司設定');
    pushToast({ type: 'success', title: '已儲存' });
    setEditing(null);
    await reload();
  }
  return <CrudCard title="仲介公司設定" onNew={() => setEditing({ name: '', full_name: '', code: '', phone: '', print_name: '', is_enabled: true })}>
    <DataTable columns={[
      { key: 'name', title: '仲介公司名稱', render: (row: BrokerCompany) => row.name },
      { key: 'code', title: '仲介簡稱/代碼', render: (row: BrokerCompany) => row.code },
      { key: 'phone', title: '電話', render: (row: BrokerCompany) => row.phone ?? '' },
      { key: 'print', title: '列印顯示名稱', render: (row: BrokerCompany) => row.print_name ?? row.full_name },
      { key: 'enabled', title: '啟用', render: (row: BrokerCompany) => row.is_enabled ? '是' : '否' },
      { key: 'action', title: '操作', render: (row: BrokerCompany) => <SettingActions row={row} table="broker_companies" pageName="仲介公司設定" profile={profile} reload={reload} onEdit={() => setEditing(row)} /> }
    ]} rows={data.brokers} rowKey={(row) => row.id} />
    {editing ? <Modal title="仲介公司設定" onClose={() => setEditing(null)}><div className="form-grid two-col"><TextField label="仲介公司名稱" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} /><TextField label="正式名稱" value={editing.full_name} onChange={(v) => setEditing({ ...editing, full_name: v })} /><TextField label="仲介簡稱 / 代碼" value={editing.code} onChange={(v) => setEditing({ ...editing, code: v.toUpperCase() })} /><TextField label="電話" value={editing.phone} onChange={(v) => setEditing({ ...editing, phone: v })} /><TextField label="列印顯示名稱" value={editing.print_name} onChange={(v) => setEditing({ ...editing, print_name: v })} /><BoolField label="是否啟用" checked={editing.is_enabled ?? true} onChange={(v) => setEditing({ ...editing, is_enabled: v })} /></div><div className="form-actions"><button className="primary-button" onClick={save}>儲存</button></div></Modal> : null}
  </CrudCard>;
}

function BankAccountSettings({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [editing, setEditing] = useState<Partial<BankAccount> | null>(null);
  async function save() {
    if (!editing?.account_name || !editing.broker_id || !editing.account_no) return pushToast({ type: 'warning', title: '請輸入帳戶資料' });
    if (editing.is_default && editing.broker_id) {
      await supabase.from('bank_accounts').update({ is_default: false, updated_by: profile?.id }).eq('broker_id', editing.broker_id).neq('id', editing.id ?? '00000000-0000-0000-0000-000000000000');
    }
    await upsertSettingTable('bank_accounts', editing, profile, '帳戶設定');
    pushToast({ type: 'success', title: '已儲存' });
    setEditing(null);
    await reload();
  }
  return <CrudCard title="帳戶設定" onNew={() => setEditing({ account_name: '', broker_id: data.brokers[0]?.id, bank_code: '', bank_name: '', account_no: '', initial_balance: 0, current_balance: 0, is_enabled: true, is_default: false })}>
    <DataTable columns={[
      { key: 'name', title: '帳戶名稱', render: (row: BankAccount) => row.account_name },
      { key: 'broker', title: '所屬仲介', render: (row: BankAccount) => data.brokers.find((item) => item.id === row.broker_id)?.name ?? '' },
      { key: 'last5', title: '帳號後五碼', render: (row: BankAccount) => row.account_last5 ?? row.account_no.slice(-5) },
      { key: 'balance', title: '初始 / 目前餘額', render: (row: BankAccount) => `${formatMoney(row.initial_balance)} / ${formatMoney(row.current_balance)}` },
      { key: 'default', title: '預設扣款', render: (row: BankAccount) => row.is_default ? '是' : '否' },
      { key: 'enabled', title: '啟用', render: (row: BankAccount) => row.is_enabled ? '是' : '否' },
      { key: 'action', title: '操作', render: (row: BankAccount) => <SettingActions row={row} table="bank_accounts" pageName="帳戶設定" profile={profile} reload={reload} onEdit={() => setEditing(row)} /> }
    ]} rows={data.accounts} rowKey={(row) => row.id} />
    {editing ? <Modal title="帳戶設定" onClose={() => setEditing(null)}><div className="form-grid two-col"><label><span>所屬仲介</span><select value={editing.broker_id ?? ''} onChange={(e) => setEditing({ ...editing, broker_id: e.target.value })}>{data.brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><TextField label="帳戶名稱" value={editing.account_name} onChange={(v) => setEditing({ ...editing, account_name: v })} /><TextField label="銀行代碼" value={editing.bank_code} onChange={(v) => setEditing({ ...editing, bank_code: v })} /><TextField label="銀行名稱" value={editing.bank_name} onChange={(v) => setEditing({ ...editing, bank_name: v })} /><TextField label="帳號" value={editing.account_no} onChange={(v) => setEditing({ ...editing, account_no: v })} /><TextField label="初始餘額" value={String(editing.initial_balance ?? 0)} onChange={(v) => { const amount = parseMoney(v) ?? 0; setEditing({ ...editing, initial_balance: amount, current_balance: editing.id ? editing.current_balance : amount }); }} /><BoolField label="是否啟用" checked={editing.is_enabled ?? true} onChange={(v) => setEditing({ ...editing, is_enabled: v })} /><BoolField label="預設扣款帳戶" checked={editing.is_default ?? false} onChange={(v) => setEditing({ ...editing, is_default: v })} /></div><div className="form-actions"><button className="primary-button" onClick={save}>儲存</button></div></Modal> : null}
  </CrudCard>;
}

function JsonSetting({ title, group, settingKey, data, profile, reload }: { title: string; group: string; settingKey: string; data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const setting = data.settings.find((item) => item.setting_group === group && item.setting_key === settingKey);
  const [text, setText] = useState(() => JSON.stringify(setting?.setting_value ?? {}, null, 2));
  async function save() {
    try {
      const value = JSON.parse(text || '{}');
      if (setting?.id) await supabase.from('arc_settings').update({ setting_value: value, updated_by: profile?.id }).eq('id', setting.id);
      else await supabase.from('arc_settings').insert({ setting_group: group, setting_key: settingKey, setting_value: value, created_by: profile?.id, updated_by: profile?.id });
      pushToast({ type: 'success', title: '設定已儲存' });
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: 'JSON 格式錯誤', message: err instanceof Error ? err.message : '' });
    }
  }
  return <section className="card full-width-card"><h2>{title}</h2><textarea className="json-editor" value={text} onChange={(e) => setText(e.target.value)} /><div className="form-actions"><button className="primary-button" onClick={save}>儲存設定</button></div></section>;
}

function ContactSettings({ title, table, rows, profile, reload }: { title: string; table: string; rows: ContactRecord[]; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<Partial<ContactRecord> | null>(null);
  const filtered = useMemo(() => rows.filter((row) => rowMatchesKeyword(keyword, [row.name, row.city, row.address, row.phone, row.fax, row.note])), [keyword, rows]);
  async function save() {
    if (!editing?.name) return pushToast({ type: 'warning', title: '請輸入名稱' });
    await upsertSettingTable(table, editing, profile, title);
    pushToast({ type: 'success', title: '已儲存' });
    setEditing(null);
    await reload();
  }
  return <CrudCard title={title} onNew={() => setEditing({ name: '', city: '', address: '', phone: '', fax: '', note: '', is_enabled: true })}>
    <div className="search-toolbar"><SearchInput value={keyword} onCommit={setKeyword} placeholder="系統設定搜尋" /></div>
    <DataTable columns={[
      { key: 'name', title: '名稱', render: (row: ContactRecord) => row.name },
      { key: 'city', title: '縣市', render: (row: ContactRecord) => row.city ?? '' },
      { key: 'address', title: '地址', render: (row: ContactRecord) => row.address ?? '' },
      { key: 'phone', title: '電話', render: (row: ContactRecord) => row.phone ?? '' },
      { key: 'fax', title: '傳真', render: (row: ContactRecord) => row.fax ?? '' },
      { key: 'enabled', title: '啟用', render: (row: ContactRecord) => row.is_enabled ? '是' : '否' },
      { key: 'action', title: '操作', render: (row: ContactRecord) => <SettingActions row={row} table={table} pageName={title} profile={profile} reload={reload} onEdit={() => setEditing(row)} /> }
    ]} rows={filtered} rowKey={(row) => row.id} />
    {editing ? <Modal title={title} onClose={() => setEditing(null)}><div className="form-grid two-col"><TextField label="名稱" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} /><TextField label="縣市" value={editing.city} onChange={(v) => setEditing({ ...editing, city: v })} /><TextField label="地址" value={editing.address} onChange={(v) => setEditing({ ...editing, address: v })} /><TextField label="電話" value={editing.phone} onChange={(v) => setEditing({ ...editing, phone: v })} /><TextField label="傳真" value={editing.fax} onChange={(v) => setEditing({ ...editing, fax: v })} /><TextField label="備註" value={editing.note} onChange={(v) => setEditing({ ...editing, note: v })} /><BoolField label="是否啟用" checked={editing.is_enabled ?? true} onChange={(v) => setEditing({ ...editing, is_enabled: v })} /></div><div className="form-actions"><button className="primary-button" onClick={save}>儲存</button></div></Modal> : null}
  </CrudCard>;
}

function DeletedRecords({ data }: { data: ArcData }) {
  return <section className="card full-width-card"><h2>刪除救回資料</h2><DataTable columns={[
    { key: 'table', title: '資料表', render: (row: { table_name: string }) => row.table_name },
    { key: 'id', title: '資料ID', render: (row: { record_id: string }) => row.record_id },
    { key: 'by', title: '刪除人', render: (row: { deleted_by_name?: string | null }) => row.deleted_by_name ?? '' },
    { key: 'time', title: '刪除時間', render: (row: { deleted_at: string }) => row.deleted_at },
    { key: 'status', title: '救回狀態', render: (row: { restored_at?: string | null }) => row.restored_at ? '已救回' : '未救回' },
    { key: 'data', title: '原資料', render: (row: { data: unknown }) => <details><summary>查看</summary><pre>{JSON.stringify(row.data, null, 2)}</pre></details> }
  ]} rows={data.deletedRecords} rowKey={(row) => row.id} emptyText="目前沒有刪除資料" /></section>;
}

function CrudCard({ title, onNew, children }: { title: string; onNew: () => void; children: ReactNode }) {
  return <section className="card full-width-card"><div className="toolbar-row"><h2>{title}</h2><button className="primary-button" onClick={onNew}>新增</button></div>{children}</section>;
}

function SettingActions<T extends { id: string }>({ row, table, pageName, profile, reload, onEdit }: { row: T; table: string; pageName: string; profile: Profile | null; reload: () => Promise<void>; onEdit: () => void }) {
  const { pushToast } = useToast();
  async function remove() {
    if (!window.confirm('確定要刪除此筆設定嗎？')) return;
    try {
      await softDelete(table, row as unknown as { id: string; [key: string]: unknown }, profile, pageName);
      pushToast({ type: 'success', title: '已刪除' });
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '刪除失敗', message: err instanceof Error ? err.message : '' });
    }
  }
  return <div className="action-stack horizontal"><button className="secondary-button mini" onClick={onEdit}>修改</button>{profile?.role === 'admin' ? <button className="danger-link" onClick={remove}>刪除</button> : null}</div>;
}

function TextField({ label, value, onChange }: { label: string; value: unknown; onChange: (value: string) => void }) {
  return <label><span>{label}</span><input value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} /></label>;
}

function BoolField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="checkbox-line setting-check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>;
}

function labelForItemKey(key: string) {
  const labels: Record<string, string> = {
    is_enabled: '是否啟用',
    requires_payment: '是否需繳費',
    enters_fax_pickup: '是否進入傳真/領件',
    enters_finance: '是否進入財務對帳',
    included_in_stats: '是否列入統計',
    requires_ic_card: '是否需要 IC 卡',
    requires_old_card: '是否需要舊卡'
  };
  return labels[key] ?? key;
}
