import type { ArcCase, ApplicationItem } from '../types';
import { formatDate } from './date';

export function printFaxPickupSheet(rows: Array<{ caseRow: ArcCase; appItem?: ApplicationItem; brokerName?: string }>, pickupDate: string) {
  const sorted = [...rows].sort((a, b) =>
    String(a.caseRow.payment_date ?? a.caseRow.application_date).localeCompare(String(b.caseRow.payment_date ?? b.caseRow.application_date)) ||
    String(a.caseRow.receipt_no ?? '').localeCompare(String(b.caseRow.receipt_no ?? ''), 'zh-Hant', { numeric: true }) ||
    String(a.caseRow.foreign_no_last5 ?? '').localeCompare(String(b.caseRow.foreign_no_last5 ?? ''), 'zh-Hant', { numeric: true })
  );
  const html = `
  <html><head><title>傳真領件單</title><style>
  @page{size:A4 portrait;margin:12mm;} body{font-family:"Microsoft JhengHei",Arial,sans-serif;color:#222;} h1{text-align:center;font-size:20pt;margin:0 0 12px;} table{width:100%;border-collapse:collapse;font-size:10pt;} th,td{border:1px solid #333;padding:4px 5px;text-align:center;} .small{font-size:8.5pt;} .footer{margin-top:18px;font-size:13pt;line-height:2;display:grid;grid-template-columns:1fr 1fr;} </style></head><body>
  <h1>傳真領件單｜${formatDate(pickupDate)}</h1>
  <table><thead><tr><th>編號</th><th>收費日期</th><th>收件編號</th><th>IC 卡</th><th>張數</th><th>經手人後四碼</th><th>外字五碼</th><th>舊卡</th><th>雇主</th><th>工人</th><th>承辦</th><th class="small">收據順序</th></tr></thead><tbody>
  ${sorted.map((row, index) => `<tr><td>${index + 1}</td><td>${formatDate(row.caseRow.payment_date)}</td><td>${escapeHtml(row.caseRow.receipt_no)}</td><td>${row.appItem?.requires_ic_card ? '是' : '否'}</td><td>1</td><td></td><td>${escapeHtml(row.caseRow.foreign_no_last5)}</td><td>${row.appItem?.requires_old_card ? '是' : '否'}</td><td>${escapeHtml(row.caseRow.employer_name)}</td><td>${escapeHtml(row.caseRow.worker_name)}</td><td>${escapeHtml(row.caseRow.handler_name)}</td><td class="small">${row.caseRow.receipt_order ?? ''}</td></tr>`).join('')}
  </tbody></table>
  <div class="footer"><div>仲介名稱：__________</div><div>電話：__________</div><div>承辦：__________</div><div>總領件數：${sorted.length} 件</div></div>
  </body></html>`;
  openPrint(html);
}

export function printSignatureSheet(rows: Array<{ caseRow: ArcCase; appItem?: ApplicationItem }>, pickupDate: string) {
  const byHandler = new Map<string, Array<{ caseRow: ArcCase; appItem?: ApplicationItem }>>();
  rows.forEach((row) => {
    const key = row.caseRow.handler_name || '未指定';
    byHandler.set(key, [...(byHandler.get(key) ?? []), row]);
  });
  const sections = Array.from(byHandler.entries()).sort(([a], [b]) => a.localeCompare(b, 'zh-Hant')).map(([handler, items]) => `
    <section class="handler-section"><h2>承辦：${escapeHtml(handler)}</h2>
    <table><thead><tr><th>領件日</th><th>雇主</th><th>工人</th><th>團號</th><th>申請項目</th></tr></thead><tbody>
    ${items.map((row) => `<tr><td>${formatDate(pickupDate)}</td><td>${escapeHtml(row.caseRow.employer_name)}</td><td>${escapeHtml(row.caseRow.worker_name)}</td><td>${escapeHtml(row.caseRow.group_no)}</td><td>${escapeHtml(row.appItem?.name)}</td></tr>`).join('')}
    </tbody></table><div class="sign-row">承辦簽名：______________　　本承辦總領件數：${items.length} 件</div></section>
  `).join('');
  const html = `<html><head><title>簽收單</title><style>@page{size:A4 portrait;margin:12mm;} body{font-family:"Microsoft JhengHei",Arial,sans-serif;} h1{text-align:center;font-size:20pt;} h2{font-size:14pt;margin:18px 0 8px;} table{width:100%;border-collapse:collapse;font-size:11pt;} th,td{border:1px solid #333;padding:5px;text-align:center;} .sign-row{font-size:13pt;margin:14px 0 20px;} .handler-section{break-inside:avoid;}</style></head><body><h1>領件簽收單｜${formatDate(pickupDate)}</h1>${sections}</body></html>`;
  openPrint(html);
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
