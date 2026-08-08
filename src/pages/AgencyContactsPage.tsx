import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { ContactListPage } from './ContactListPage';
import type { ContactRecord } from '../types';

export function AgencyContactsPage({
  serviceStations,
  taskForces
}: {
  serviceStations: ContactRecord[];
  taskForces: ContactRecord[];
}) {
  const [tab, setTab] = useState<'stations' | 'taskForces'>('stations');

  return (
    <div className="page-content agency-contacts-page">
      <PageHeader title="移民署／專勤隊" description="集中查詢移民署服務站與專勤隊聯絡資訊。" />
      <div className="tabs agency-contact-tabs">
        <button type="button" className={tab === 'stations' ? 'active' : ''} onClick={() => setTab('stations')}>移民署服務站</button>
        <button type="button" className={tab === 'taskForces' ? 'active' : ''} onClick={() => setTab('taskForces')}>專勤隊聯絡資訊</button>
      </div>
      <div className="agency-contact-content">
        {tab === 'stations' ? (
          <ContactListPage title="移民署服務站" contacts={serviceStations} />
        ) : (
          <ContactListPage title="專勤隊聯絡資訊" contacts={taskForces} />
        )}
      </div>
    </div>
  );
}
