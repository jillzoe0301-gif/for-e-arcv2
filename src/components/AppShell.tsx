import {
  BarChart3,
  BookOpen,
  Building2,
  ClipboardCheck,
  ClipboardList,
  DatabaseBackup,
  Download,
  FileSearch,
  Landmark,
  LayoutDashboard,
  LogOut,
  MailCheck,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  WalletCards
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import type { PageKey, Profile } from '../types';
import { canAccessPage } from '../utils/permissions';
import { roleLabels } from '../utils/status';

export interface NavItem {
  key: PageKey;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

export const navItems: NavItem[] = [
  { key: 'dashboard', label: '總覽', icon: LayoutDashboard },
  { key: 'registration', label: '居留案件登記', icon: ClipboardList },
  { key: 'payment', label: '居留證繳費', icon: ReceiptText },
  { key: 'financeConfirm', label: '財務對帳確認', icon: ClipboardCheck },
  { key: 'financeSearch', label: '財務查詢', icon: WalletCards },
  { key: 'faxPickup', label: '傳真/領件', icon: MailCheck },
  { key: 'caseSearch', label: '案件查詢', icon: FileSearch },
  { key: 'stats', label: '統計數據', icon: BarChart3 },
  { key: 'export', label: '匯出資料', icon: Download },
  { key: 'brokersAccounts', label: '仲介與扣款帳號', icon: Landmark },
  { key: 'serviceStations', label: '移民署服務站', icon: Building2 },
  { key: 'taskForces', label: '專勤隊聯絡資訊', icon: BookOpen },
  { key: 'auditLogs', label: '操作紀錄', icon: ScrollText },
  { key: 'settings', label: '系統設定', icon: Settings }
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
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                className={currentPage === item.key ? 'active' : ''}
                onClick={() => setCurrentPage(item.key)}
              >
                <Icon size={18} strokeWidth={2.2} />
                <span>{item.label}</span>
              </button>
            );
          })}
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
