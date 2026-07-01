import { useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import type { ArcData, ArcCase, PaymentBatch, PickupRecord, AuditLog } from '../types';
import { monthKey, todayTaipei, yearKey } from '../utils/date';
import { downloadCsv } from '../utils/csv';

export function ExportPage({ data }: { data: ArcData }) {
  const [target, setTarget] = useState<'cases' | 'payments' | 'pickup' | 'audit'>('cases');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [applicationItemId, setApplicationItemId] = useState('');
  const [handlerName, setHandlerName] = useState('');

  const yearOptions = useMemo(() => Array.from(new Set([
    ...data.cases.map((item) => yearKey(item.application_date)),
    ...data.batches.map((item) => yearKey(item.payment_date)),
    ...data.pickupRecords.map((item) => yearKey(item.pickup_date)),
    ...data.auditLogs.map((item) => yearKey(item.created_at))
  ].filter(Boolean))).sort().reverse(), [data.auditLogs, data.batches, data.cases, data.pickupRecords]);

  const monthOptions = useMemo(() => Array.from(new Set([
    ...data.cases.map((item) => monthKey(item.application_date)),
    ...data.batches.map((item) => monthKey(item.payment_date)),
    ...data.pickupRecords.map((item) => monthKey(item.pickup_date)),
    ...data.auditLogs.map((item) => monthKey(item.created_at))
  ].filter((item) => item && (!year || item.startsWith(year))))).sort().reverse(), [data.auditLogs, data.batches, data.cases, data.pickupRecords, year]);

  function casePassesFilters(caseRow: ArcCase) {
    if (year && yearKey(caseRow.application_date) !== year) return false;
    if (month && monthKey(caseRow.application_date) !== month) return false;
    if (applicationItemId && caseRow.application_item_id !== applicationItemId) return false;
    if (handlerName && caseRow.handler_name !== handlerName) return false;
    return true;
  }

  function batchPassesFilters(batch: PaymentBatch) {
    if (year && yearKey(batch.payment_date) !== year) return false;
    if (month && monthKey(batch.payment_date) !== month) return false;
    const relatedCases = data.cases.filter((caseRow) => caseRow.payment_batch_id === batch.id);
    if (applicationItemId && !relatedCases.some((caseRow) => caseRow.application_item_id === applicationItemId)) return false;
    if (handlerName && !relatedCases.some((caseRow) => caseRow.handler_name === handlerName)) return false;
    return true;
  }

  function pickupPassesFilters(record: PickupRecord) {
    if (year && yearKey(record.pickup_date) !== year) return false;
    if (month && monthKey(record.pickup_date) !== month) return false;
    const caseIds = data.pickupRecordItems.filter((item) => item.record_id === record.id).map((item) => item.case_id);
    const relatedCases = data.cases.filter((caseRow) => caseIds.includes(caseRow.id));
    if (applicationItemId && !relatedCases.some((caseRow) => caseRow.application_item_id === applicationItemId)) return false;
    if (handlerName && !relatedCases.some((caseRow) => caseRow.handler_name === handlerName)) return false;
    return true;
  }

  function auditPassesFilters(log: AuditLog) {
    if (year && yearKey(log.created_at) !== year) return false;
    if (month && monthKey(log.created_at) !== month) return false;
    if (handlerName && log.actor_name !== handlerName) return false;
    return true;
  }

  function exportData() {
    const suffix = [year || '全部年份', month || '全部月份', handlerName || '全部人員', applicationItemId ? data.applicationItems.find((item) => item.id === applicationItemId)?.name : '全部項目'].filter(Boolean).join('_');
    if (target === 'cases') {
      downloadCsv(`ARC案件資料_${suffix}_${todayTaipei()}.csv`, data.cases.filter(casePassesFilters).map((caseRow) => ({
        案件編號: caseRow.case_no,
        承辦: caseRow.handler_name,
        仲介: data.brokers.find((item) => item.id === caseRow.broker_id)?.name,
        雇主: caseRow.employer_name,
        工人: caseRow.worker_name,
        入境日: caseRow.entry_date,
        申請日: caseRow.application_date,
        團號: caseRow.group_no,
        申請項目: data.applicationItems.find((item) => item.id === caseRow.application_item_id)?.name,
        金額: caseRow.amount,
        狀態: caseRow.status,
        收件編號: caseRow.receipt_no,
        外字五碼: caseRow.foreign_no_last5,
        收據順序: caseRow.receipt_order
      })));
    }
    if (target === 'payments') {
      downloadCsv(`ARC繳費批次_${suffix}_${todayTaipei()}.csv`, data.batches.filter(batchPassesFilters).map((batch) => ({
        批次編號: batch.batch_no,
        繳費日期: batch.payment_date,
        繳款人: batch.payer_name,
        仲介: data.brokers.find((item) => item.id === batch.broker_id)?.name,
        帳戶: data.accounts.find((item) => item.id === batch.account_id)?.account_name,
        件數: batch.case_count,
        金額: batch.total_amount,
        狀態: batch.status
      })));
    }
    if (target === 'pickup') {
      downloadCsv(`ARC傳真領件紀錄_${suffix}_${todayTaipei()}.csv`, data.pickupRecords.filter(pickupPassesFilters).map((record) => ({
        紀錄編號: record.record_no,
        領件日期: record.pickup_date,
        建立日期: record.created_at,
        建立人: record.created_by_name,
        本次領件案件數: record.case_count
      })));
    }
    if (target === 'audit') {
      downloadCsv(`ARC操作紀錄_${suffix}_${todayTaipei()}.csv`, data.auditLogs.filter(auditPassesFilters).map((log) => ({
        操作類型: log.action_type,
        操作人: log.actor_name,
        操作時間: log.created_at,
        操作頁面: log.page_name,
        異動原因: log.reason,
        資料表: log.record_table,
        資料ID: log.record_id
      })));
    }
  }

  return (
    <div className="page-content">
      <PageHeader title="匯出資料" description="可依年份、月份、申請項目與人員篩選後匯出 CSV。" />
      <section className="card export-card full-width-card">
        <div className="export-filter-grid">
          <label><span>匯出項目</span><select value={target} onChange={(e) => setTarget(e.target.value as never)}><option value="cases">案件資料</option><option value="payments">繳費批次</option><option value="pickup">傳真領件紀錄</option><option value="audit">操作紀錄</option></select></label>
          <label><span>年份</span><select value={year} onChange={(e) => { setYear(e.target.value); setMonth(''); }}><option value="">全部年份</option>{yearOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span>月份</span><select value={month} onChange={(e) => setMonth(e.target.value)}><option value="">全部月份</option>{monthOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span>申請項目</span><select value={applicationItemId} onChange={(e) => setApplicationItemId(e.target.value)}><option value="">全部項目</option>{data.applicationItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>人員 / 承辦</span><select value={handlerName} onChange={(e) => setHandlerName(e.target.value)}><option value="">全部人員</option>{data.people.filter((item) => item.show_as_handler).map((item) => <option key={item.id} value={item.name}>{item.display_name}</option>)}</select></label>
        </div>
        <button className="primary-button" onClick={exportData}>匯出 CSV</button>
      </section>
    </div>
  );
}
