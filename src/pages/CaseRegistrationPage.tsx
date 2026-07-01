import { ClipboardEvent, FormEvent, useMemo, useState } from 'react';
import { createCases } from '../api/repository';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../context/ToastContext';
import type { ArcData, BatchCaseRow, Profile, RegisterCaseInput } from '../types';
import { todayTaipei, parseDateLoose } from '../utils/date';
import { parseMoney } from '../utils/number';

const emptyRow: BatchCaseRow = {
  handler_name: '',
  broker_id: '',
  employer_name: '',
  worker_name: '',
  entry_date: '',
  application_date: todayTaipei(),
  group_no: '',
  application_item_id: '',
  amount: ''
};

const batchColumns: Array<{ key: keyof BatchCaseRow; label: string; type?: string }> = [
  { key: 'handler_name', label: '承辦' },
  { key: 'broker_id', label: '仲介別' },
  { key: 'employer_name', label: '雇主' },
  { key: 'worker_name', label: '工人' },
  { key: 'entry_date', label: '入境日' },
  { key: 'application_date', label: '申請日' },
  { key: 'group_no', label: '團號' },
  { key: 'application_item_id', label: '申請項目' },
  { key: 'amount', label: '金額' }
];

export function CaseRegistrationPage({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const firstBroker = data.brokers.find((item) => item.is_enabled)?.id ?? '';
  const firstAppItem = data.applicationItems.find((item) => item.is_enabled)?.id ?? '';
  const firstHandler = data.people.find((item) => item.show_as_handler && item.is_enabled)?.name ?? profile?.display_name ?? '';
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [single, setSingle] = useState<BatchCaseRow>({ ...emptyRow, broker_id: firstBroker, application_item_id: firstAppItem, handler_name: firstHandler });
  const [rows, setRows] = useState<BatchCaseRow[]>(() => Array.from({ length: 10 }, () => ({ ...emptyRow, broker_id: firstBroker, application_item_id: firstAppItem, handler_name: firstHandler })));
  const [submitting, setSubmitting] = useState(false);

  const handlers = useMemo(() => data.people.filter((item) => item.is_enabled && item.show_as_handler), [data.people]);
  const brokers = useMemo(() => data.brokers.filter((item) => item.is_enabled), [data.brokers]);
  const appItems = useMemo(() => data.applicationItems.filter((item) => item.is_enabled), [data.applicationItems]);

  function itemAmount(itemId: string): string {
    const item = data.applicationItems.find((entry) => entry.id === itemId);
    return item ? String(Number(item.default_amount ?? 0)) : '';
  }

  function updateSingle(key: keyof BatchCaseRow, value: string) {
    setSingle((current) => ({ ...current, [key]: value, ...(key === 'application_item_id' ? { amount: itemAmount(value) } : {}) }));
  }

  function updateRow(index: number, key: keyof BatchCaseRow, value: string) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value, ...(key === 'application_item_id' ? { amount: itemAmount(value) } : {}) } : row));
  }

  function addRows() {
    setRows((current) => [...current, ...Array.from({ length: 5 }, () => ({ ...emptyRow, broker_id: firstBroker, application_item_id: firstAppItem, handler_name: firstHandler }))]);
  }

  function deleteRow(index: number) {
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  function pasteToGrid(event: ClipboardEvent<HTMLInputElement | HTMLSelectElement>, rowIndex: number, columnKey: keyof BatchCaseRow) {
    const text = event.clipboardData.getData('text');
    if (!text.includes('\n') && !text.includes('\t')) return;
    event.preventDefault();
    const startColumn = batchColumns.findIndex((column) => column.key === columnKey);
    const lines = text.replace(/\r/g, '').split('\n').filter((line) => line.length > 0);
    setRows((current) => {
      const next = [...current];
      while (next.length < rowIndex + lines.length) next.push({ ...emptyRow, broker_id: firstBroker, application_item_id: firstAppItem, handler_name: firstHandler });
      lines.forEach((line, lineOffset) => {
        const values = line.split('\t');
        values.forEach((value, colOffset) => {
          const column = batchColumns[startColumn + colOffset];
          if (!column) return;
          const actualIndex = rowIndex + lineOffset;
          next[actualIndex] = { ...next[actualIndex], [column.key]: value.trim() };
        });
      });
      return next;
    });
  }

  function validateRows(inputRows: BatchCaseRow[]): { valid: RegisterCaseInput[]; errors: BatchCaseRow[] } {
    const valid: RegisterCaseInput[] = [];
    const errors = inputRows.map((row) => ({ ...row, error: '' }));
    inputRows.forEach((row, index) => {
      const hasAny = Object.entries(row).some(([key, value]) => key !== 'error' && String(value ?? '').trim());
      if (!hasAny) return;
      const entryDate = parseDateLoose(row.entry_date);
      const applicationDate = parseDateLoose(row.application_date);
      const money = parseMoney(row.amount);
      const requiredMissing = !row.handler_name || !row.broker_id || !row.employer_name || !row.worker_name || !applicationDate || !row.application_item_id;
      if (requiredMissing) {
        errors[index].error = '必填欄位未完整或日期格式錯誤';
        return;
      }
      if (money === null) {
        errors[index].error = '金額格式錯誤';
        return;
      }
      valid.push({
        handler_name: row.handler_name.trim(),
        broker_id: row.broker_id,
        employer_name: row.employer_name.trim(),
        worker_name: row.worker_name.trim(),
        entry_date: entryDate,
        application_date: applicationDate,
        group_no: row.group_no.trim() || null,
        application_item_id: row.application_item_id,
        amount: money
      });
    });
    return { valid, errors };
  }

  async function submitSingle(event: FormEvent) {
    event.preventDefault();
    const { valid, errors } = validateRows([single]);
    if (!valid.length) {
      setSingle(errors[0]);
      pushToast({ type: 'error', title: '單筆登記失敗', message: errors[0]?.error || '請輸入完整資料' });
      return;
    }
    setSubmitting(true);
    try {
      await createCases(valid, data, profile);
      pushToast({ type: 'success', title: '案件已登記' });
      setSingle({ ...emptyRow, broker_id: firstBroker, application_item_id: firstAppItem, handler_name: firstHandler, application_date: todayTaipei() });
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '新增失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitBatch() {
    const { valid, errors } = validateRows(rows);
    setRows(errors);
    if (!valid.length) {
      pushToast({ type: 'error', title: '批次送件失敗', message: '沒有可送出的有效資料，請檢查紅字列。' });
      return;
    }
    setSubmitting(true);
    try {
      await createCases(valid, data, profile);
      pushToast({ type: 'success', title: `批次送件完成`, message: `已新增 ${valid.length} 筆案件。` });
      setRows(Array.from({ length: 10 }, () => ({ ...emptyRow, broker_id: firstBroker, application_item_id: firstAppItem, handler_name: firstHandler, application_date: todayTaipei() })));
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '批次新增失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setSubmitting(false);
    }
  }

  const renderField = (row: BatchCaseRow, onChange: (key: keyof BatchCaseRow, value: string) => void, key: keyof BatchCaseRow, rowIndex = 0) => {
    if (key === 'handler_name') {
      return <select value={row[key]} onChange={(e) => onChange(key, e.target.value)} onPaste={(e) => pasteToGrid(e, rowIndex, key)}><option value="">請選擇</option>{handlers.map((item) => <option key={item.id} value={item.name}>{item.display_name}</option>)}</select>;
    }
    if (key === 'broker_id') {
      return <select value={row[key]} onChange={(e) => onChange(key, e.target.value)} onPaste={(e) => pasteToGrid(e, rowIndex, key)}><option value="">請選擇</option>{brokers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>;
    }
    if (key === 'application_item_id') {
      return <select value={row[key]} onChange={(e) => onChange(key, e.target.value)} onPaste={(e) => pasteToGrid(e, rowIndex, key)}><option value="">請選擇</option>{appItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>;
    }
    return <input value={String(row[key] ?? '')} onChange={(e) => onChange(key, e.target.value)} onPaste={(e) => pasteToGrid(e, rowIndex, key)} />;
  };

  return (
    <div className="page-content">
      <PageHeader title="居留案件登記" description="單筆 / 批次送件；不同仲介可在同一批登記，每列依自己的仲介產生案件編號。" />
      <div className="tabs">
        <button className={mode === 'single' ? 'active' : ''} onClick={() => setMode('single')}>單筆案件登記</button>
        <button className={mode === 'batch' ? 'active' : ''} onClick={() => setMode('batch')}>批次送件</button>
      </div>

      {mode === 'single' ? (
        <form className="card form-grid" onSubmit={submitSingle}>
          {batchColumns.map((column) => (
            <label key={column.key}>
              <span>{column.label}</span>
              {renderField(single, updateSingle, column.key)}
            </label>
          ))}
          {single.error ? <div className="inline-error full-span">{single.error}</div> : null}
          <div className="form-actions full-span"><button className="primary-button" disabled={submitting}>送出登記</button></div>
        </form>
      ) : (
        <section className="card full-width-card">
          <div className="toolbar-row">
            <button className="secondary-button" type="button" onClick={addRows}>增加列（+5）</button>
            <button className="primary-button" type="button" onClick={submitBatch} disabled={submitting}>批次送出</button>
          </div>
          <div className="table-wrap batch-grid-wrap">
            <table className="data-table batch-table">
              <thead>
                <tr>{batchColumns.map((column) => <th key={column.key}>{column.label}</th>)}<th>操作</th></tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className={row.error ? 'row-error' : ''}>
                    {batchColumns.map((column) => <td key={column.key}>{renderField(row, (key, value) => updateRow(rowIndex, key, value), column.key, rowIndex)}</td>)}
                    <td><button className="danger-link" type="button" onClick={() => deleteRow(rowIndex)}>刪除</button>{row.error ? <div className="cell-error">{row.error}</div> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
