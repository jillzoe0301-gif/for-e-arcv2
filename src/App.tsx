import { useEffect, useRef, useState } from 'react';
import { AppShell, navItems } from './components/AppShell';
import { useAuth } from './context/AuthContext';
import { useToast } from './context/ToastContext';
import { useArcData } from './hooks/useArcData';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CaseRegistrationPage } from './pages/CaseRegistrationPage';
import { PaymentPage } from './pages/PaymentPage';
import { FinanceConfirmPage } from './pages/FinanceConfirmPage';
import { FinanceSearchPage } from './pages/FinanceSearchPage';
import { FaxPickupPage } from './pages/FaxPickupPage';
import { CaseSearchPage } from './pages/CaseSearchPage';
import { StatsPage } from './pages/StatsPage';
import { ExportPage } from './pages/ExportPage';
import { BrokersAccountsPage } from './pages/BrokersAccountsPage';
import { ContactListPage } from './pages/ContactListPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AnnouncementsPage } from './pages/AnnouncementsPage';
import type { PageKey } from './types';
import { canAccessPage } from './utils/permissions';

export function App() {
  const { loading: authLoading, profile, signOut } = useAuth();
  const { pushToast } = useToast();
  const [currentPage, setCurrentPage] = useState<PageKey>('dashboard');
  const lastBlockedPageRef = useRef<PageKey | null>(null);
  const { data, loading, error, reload } = useArcData(Boolean(profile));

  useEffect(() => {
    if (error) pushToast({ type: 'error', title: '資料載入失敗', message: error });
  }, [error, pushToast]);

  useEffect(() => {
    if (profile && !canAccessPage(profile.role, currentPage)) {
      if (lastBlockedPageRef.current !== currentPage) {
        pushToast({ type: 'warning', title: '您沒有進入此功能的權限。' });
        lastBlockedPageRef.current = currentPage;
      }
      const first = navItems.find((item) => canAccessPage(profile.role, item.key));
      setCurrentPage(first?.key ?? 'dashboard');
    }
  }, [currentPage, profile, pushToast]);

  if (authLoading) return <div className="loading-screen">載入中...</div>;
  if (!profile) return <LoginPage />;
  if (!profile.is_active) return <div className="loading-screen">此帳號已停用，請聯絡管理員。</div>;

  function renderPage() {
    switch (currentPage) {
      case 'dashboard': return <DashboardPage data={data} profile={profile} reload={reload} />;
      case 'registration': return <CaseRegistrationPage data={data} profile={profile} reload={reload} onGoFaxPickup={() => setCurrentPage('faxPickup')} />;
      case 'payment': return <PaymentPage data={data} profile={profile} reload={reload} />;
      case 'financeConfirm': return <FinanceConfirmPage data={data} profile={profile} reload={reload} />;
      case 'financeSearch': return <FinanceSearchPage data={data} profile={profile} reload={reload} />;
      case 'faxPickup': return <FaxPickupPage data={data} profile={profile} reload={reload} />;
      case 'caseSearch': return <CaseSearchPage data={data} profile={profile} reload={reload} />;
      case 'stats': return <StatsPage data={data} />;
      case 'export': return <ExportPage data={data} />;
      case 'announcements': return <AnnouncementsPage data={data} profile={profile} reload={reload} />;
      case 'brokersAccounts': return <BrokersAccountsPage data={data} profile={profile} reload={reload} />;
      case 'serviceStations': return <ContactListPage title="移民署服務站" description="移民署服務站聯絡資料，可在系統設定維護。" contacts={data.serviceStations} />;
      case 'taskForces': return <ContactListPage title="專勤隊聯絡資訊" description="專勤隊聯絡資料，可在系統設定維護。" contacts={data.taskForces} />;
      case 'auditLogs': return <AuditLogsPage data={data} />;
      case 'settings': return <SettingsPage data={data} profile={profile} reload={reload} />;
      default: return <DashboardPage data={data} profile={profile} reload={reload} />;
    }
  }

  return (
    <AppShell currentPage={currentPage} setCurrentPage={setCurrentPage} profile={profile} onSignOut={signOut}>
      {loading ? <div className="page-loader">資料同步中...</div> : null}
      {renderPage()}
    </AppShell>
  );
}
