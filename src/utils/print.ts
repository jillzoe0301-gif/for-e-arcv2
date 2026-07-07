import type { ArcCase, ApplicationItem } from '../types';
import { formatDate } from './date';

export interface FaxPrintOptions {
  brokerName?: string;
  brokerPhone?: string;
  handlerName?: string;
  stationInfo?: string;
}

type PrintRow = { caseRow: ArcCase; appItem?: ApplicationItem; brokerName?: string };

function sortRows(rows: PrintRow[]) {
  return [...rows].sort((a, b) =>
    String(a.caseRow.payment_date ?? a.caseRow.application_date).localeCompare(String(b.caseRow.payment_date ?? b.caseRow.application_date)) ||
    String(a.caseRow.receipt_no ?? '').localeCompare(String(b.caseRow.receipt_no ?? ''), 'zh-Hant', { numeric: true }) ||
    String(a.caseRow.foreign_no_last5 ?? '').localeCompare(String(b.caseRow.foreign_no_last5 ?? ''), 'zh-Hant', { numeric: true })
  );
}


function isOldCardChecked(row: PrintRow) {
  return Boolean(row.caseRow.old_card_checked ?? row.appItem?.requires_old_card ?? false);
}

function faxSheetHtml(rows: PrintRow[], pickupDate: string, options: FaxPrintOptions = {}) {
  const sorted = sortRows(rows);
  const brokerName = options.brokerName || '灃康';
  const brokerPhone = options.brokerPhone || '';
  const handlerName = options.handlerName || '';
  const stationInfo = options.stationInfo || '桃園移民署電話：__________　傳真：__________';
  return `
  <section class="print-page fax-page-print">
    <div class="print-title-wrap">
      <h1>移民署ARC傳真領件單　領件日期：${formatDate(pickupDate)}</h1>
      <div class="station-info">${escapeHtml(stationInfo)}</div>
    </div>
    <table><thead><tr><th>編號</th><th>收費日期</th><th>收件編號</th><th>IC 卡</th><th>張數</th><th>經手人後四碼</th><th>外字五碼</th><th>舊卡</th><th>雇主</th><th>工人</th><th>承辦</th><th class="small">收據順序</th></tr></thead><tbody>
    ${sorted.map((row, index) => `<tr><td>${index + 1}</td><td>${formatDate(row.caseRow.payment_date)}</td><td>${escapeHtml(row.caseRow.receipt_no)}</td><td>${row.appItem?.requires_ic_card ? 'V' : ''}</td><td>${row.caseRow.copy_count ?? 1}</td><td>${escapeHtml(row.caseRow.handler_last4)}</td><td>${escapeHtml(row.caseRow.foreign_no_last5)}</td><td>${isOldCardChecked(row) ? 'V' : ''}</td><td>${escapeHtml(row.caseRow.employer_name)}</td><td>${escapeHtml(row.caseRow.worker_name)}</td><td>${escapeHtml(row.caseRow.handler_name)}</td><td class="small">${row.caseRow.receipt_order ?? ''}</td></tr>`).join('')}
    </tbody></table>
    <div class="footer"><div>仲介名稱：${escapeHtml(brokerName)}</div><div>電話：${escapeHtml(brokerPhone)}</div><div>承辦：${escapeHtml(handlerName)}</div><div>總領件數：${sorted.length} 件</div></div>
  </section>`;
}

function signatureSheetHtml(rows: Array<{ caseRow: ArcCase; appItem?: ApplicationItem }>, pickupDate: string) {
  const byHandler = new Map<string, Array<{ caseRow: ArcCase; appItem?: ApplicationItem }>>();
  rows.forEach((row) => {
    const key = row.caseRow.handler_name || '未指定';
    byHandler.set(key, [...(byHandler.get(key) ?? []), row]);
  });
  return Array.from(byHandler.entries()).sort(([a], [b]) => a.localeCompare(b, 'zh-Hant')).map(([handler, items]) => `
    <section class="handler-section"><h2>承辦：${escapeHtml(handler)}</h2>
    <table><thead><tr><th>領件日</th><th>雇主</th><th>工人</th><th>團號</th><th>申請項目</th></tr></thead><tbody>
    ${items.map((row) => `<tr><td>${formatDate(pickupDate)}</td><td>${escapeHtml(row.caseRow.employer_name)}</td><td>${escapeHtml(row.caseRow.worker_name)}</td><td>${escapeHtml(row.caseRow.group_no)}</td><td>${escapeHtml(row.appItem?.name)}</td></tr>`).join('')}
    </tbody></table><div class="sign-row">承辦簽名：______________　　本承辦總領件數：${items.length} 件</div></section>
  `).join('');
}

function printShell(title: string, body: string) {
  return `<html><head><title>${escapeHtml(title)}</title><style>
  @page{size:A4 portrait;margin:12mm;} body{font-family:"Microsoft JhengHei",Arial,sans-serif;color:#222;} h1{text-align:center;font-size:18pt;margin:0;} h2{font-size:14pt;margin:18px 0 8px;} table{width:100%;border-collapse:collapse;font-size:10pt;} th,td{border:1px solid #333;padding:4px 5px;text-align:center;} .small{font-size:8.5pt;} .footer{margin-top:18px;font-size:13pt;line-height:2;display:grid;grid-template-columns:1fr 1fr;} .station-info{text-align:center;font-size:8.5pt;margin:4px 0 10px;} .sign-row{font-size:13pt;margin:14px 0 20px;} .handler-section{break-inside:avoid;} .page-break{break-before:page;} .print-page{break-after:page;} .print-page:last-child{break-after:auto;}</style></head><body>${body}</body></html>`;
}

export function printFaxPickupSheet(rows: PrintRow[], pickupDate: string, options: FaxPrintOptions = {}) {
  openPrint(printShell('移民署ARC傳真領件單', faxSheetHtml(rows, pickupDate, options)));
}

export function printSignatureSheet(rows: Array<{ caseRow: ArcCase; appItem?: ApplicationItem }>, pickupDate: string) {
  const body = `<section class="print-page"><h1>領件簽收單｜${formatDate(pickupDate)}</h1>${signatureSheetHtml(rows, pickupDate)}</section>`;
  openPrint(printShell('簽收單', body));
}

export function printFaxAndSignatureSheets(rows: PrintRow[], pickupDate: string, options: FaxPrintOptions = {}) {
  const body = `${faxSheetHtml(rows, pickupDate, options)}<section class="print-page"><h1>領件簽收單｜${formatDate(pickupDate)}</h1>${signatureSheetHtml(rows, pickupDate)}</section>`;
  openPrint(printShell('移民署ARC傳真領件單與簽收單', body));
}

function openPrint(html: string) {
  const win = window.open('', '_blank', 'width=980,height=720');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char));
}
