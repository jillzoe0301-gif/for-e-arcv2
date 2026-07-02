import { LogOut, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PageKey, Profile } from '../types';
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
  children
}: {
  currentPage: PageKey;
  setCurrentPage: (page: PageKey) => void;
  profile: Profile;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const visibleItems = navItems.filter((item) => canAccessPage(profile.role, item.key));
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-logo">ARC</div>
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
          <button type="button" className="logout-button" onClick={onSignOut}>
            <LogOut size={17} />登出
          </button>
        </div>
      </aside>
      <main className="main-panel">{children}</main>
    </div>
  );
}
