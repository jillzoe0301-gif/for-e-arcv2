import { KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { PageKey, Profile } from '../types';
import { Modal } from './Modal';
import { useToast } from '../context/ToastContext';
import { IconImage } from '../utils/icons';
import { canAccessPage } from '../utils/permissions';
import { roleLabels } from '../utils/status';

export interface NavItem {
  key: PageKey;
  label: string;
  iconName: string;
}

export const navItems: NavItem[] = [
  { key: 'dashboard', label: '總覽', iconName: '總覽' },
  { key: 'registration', label: '居留案件登記', iconName: '居留案件登記' },
  { key: 'payment', label: '居留證繳費', iconName: '居留證繳費' },
  { key: 'financeConfirm', label: '財務對帳確認', iconName: '財務對帳確認' },
  { key: 'financeSearch', label: '財務查詢', iconName: '財務查詢' },
  { key: 'faxPickup', label: '傳真/領件', iconName: '傳真/領件' },
  { key: 'caseSearch', label: '案件查詢', iconName: '案件查詢' },
  { key: 'stats', label: '統計數據', iconName: '統計數據' },
  { key: 'export', label: '匯出資料', iconName: '匯出資料' },
  { key: 'announcements', label: '公告事項', iconName: '公告事項' },
  { key: 'brokersAccounts', label: '仲介與扣款帳號', iconName: '仲介與扣款帳號' },
  { key: 'serviceStations', label: '移民署服務站', iconName: '移民署服務站' },
  { key: 'taskForces', label: '專勤隊聯絡資訊', iconName: '專勤隊聯絡資訊' },
  { key: 'auditLogs', label: '操作紀錄', iconName: '操作紀錄' },
  { key: 'settings', label: '系統設定', iconName: '系統設定' }
];

export function AppShell({
  currentPage,
  setCurrentPage,
  profile,
  onSignOut,
  onChangeOwnPassword,
  children
}: {
  currentPage: PageKey;
  setCurrentPage: (page: PageKey) => void;
  profile: Profile;
  onSignOut: () => void;
  onChangeOwnPassword: (oldPassword: string, newPassword: string) => Promise<void>;
  children: ReactNode;
}) {
  const { pushToast } = useToast();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const visibleItems = navItems.filter((item) => canAccessPage(profile.role, item.key));

  async function submitPasswordChange() {
    if (!oldPassword || !newPassword || !confirmPassword) {
      pushToast({ type: 'warning', title: '請完整輸入密碼欄位。' });
      return;
    }
    if (newPassword !== confirmPassword) {
      pushToast({ type: 'warning', title: '新密碼與確認密碼不一致。' });
      return;
    }
    setSavingPassword(true);
    try {
      await onChangeOwnPassword(oldPassword, newPassword);
      pushToast({ type: 'success', title: '密碼已更新，請使用新密碼登入。' });
      setPasswordOpen(false);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      pushToast({ type: 'error', title: err instanceof Error ? err.message : '密碼修改失敗。' });
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-logo"><img src="/arc-logo.png" alt="ARC" /></div>
          <div>
            <strong>居留證控管</strong>
            <span>V13 Formal</span>
          </div>
        </div>
        <nav className="side-nav">
          {visibleItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={currentPage === item.key ? 'active' : ''}
              onClick={() => setCurrentPage(item.key)}
            >
              <IconImage name={item.iconName} size={20} className="nav-icon" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="profile-chip">
            <ShieldCheck size={18} />
            <div>
              <strong>{profile.display_name}</strong>
              <span>{roleLabels[profile.role]}</span>
            </div>
          </div>
          <button type="button" className="password-button" onClick={() => setPasswordOpen(true)}>
            <KeyRound size={17} />修改密碼
          </button>
          <button type="button" className="logout-button" onClick={onSignOut}>
            <LogOut size={17} />登出
          </button>
        </div>
      </aside>
      <main className="main-panel">{children}</main>
      {passwordOpen ? (
        <Modal title="修改密碼" onClose={() => setPasswordOpen(false)}>
          <div className="form-grid">
            <label><span>原密碼</span><input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} autoComplete="current-password" /></label>
            <label><span>新密碼</span><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" /></label>
            <label><span>確認新密碼</span><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" /></label>
          </div>
          <div className="form-actions">
            <button type="button" className="ghost-button" onClick={() => setPasswordOpen(false)}>取消</button>
            <button type="button" className="primary-button" disabled={savingPassword} onClick={submitPasswordChange}>{savingPassword ? '儲存中...' : '儲存密碼'}</button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
