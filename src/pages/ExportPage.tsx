import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import type { ArcData } from '../types';
import { todayTaipei } from '../utils/date';
import { downloadCsv } from '../utils/csv';

export function ExportPage({ data }: { data: ArcData }) {
  const [target, setTarget] = useState<'cases' | 'payments' | 'pickup' | 'audit'>('cases');

  function exportData() {
    if (target === 'cases') {
      downloadCsv(`ARC案件資料_${todayTaipei()}.csv`, data.cases.map((caseRow) => ({
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
      downloadCsv(`ARC繳費批次_${todayTaipei()}.csv`, data.batches.map((batch) => ({
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
      downloadCsv(`ARC傳真領件紀錄_${todayTaipei()}.csv`, data.pickupRecords.map((record) => ({
        紀錄編號: record.record_no,
        領件日期: record.pickup_date,
        建立日期: record.created_at,
        建立人: record.created_by_name,
        本次領件案件數: record.case_count
      })));
    }
    if (target === 'audit') {
      downloadCsv(`ARC操作紀錄_${todayTaipei()}.csv`, data.auditLogs.map((log) => ({
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
      <PageHeader title="匯出資料" description="匯出案件、繳費批次、傳真領件紀錄與操作紀錄 CSV。" />
      <section className="card export-card">
        <label><span>匯出項目</span><select value={target} onChange={(e) => setTarget(e.target.value as never)}><option value="cases">案件資料</option><option value="payments">繳費批次</option><option value="pickup">傳真領件紀錄</option><option value="audit">操作紀錄</option></select></label>
        <button className="primary-button" onClick={exportData}>匯出 CSV</button>
      </section>
    </div>
  );
}
