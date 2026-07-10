import { ClipboardEvent, FormEvent, useMemo, useState } from 'react';
import { createCases } from '../api/repository';
import { AnnouncementBanner } from '../components/AnnouncementBanner';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../context/ToastContext';
import type { ArcData, BatchCaseRow, Profile, RegisterCaseInput } from '../types';
import { todayTaipei, parseDateLoose } from '../utils/date';
import { parseMoney } from '../utils/number';

const DATE_ERROR = '申請日期格式不正確，請重新輸入。';
const ENTRY_DATE_ERROR = '入境日格式不正確，請重新輸入。';
const GROUP_NO_REQUIRED = '請輸入團號，團號為必填欄位。';
const SUPPLEMENT_ARCHIVE_ITEMS = new Set(['新入境初次（紙本）', '報備不製證', '重入境許可']);

const emptyRow: BatchCaseRow = {
  handler_name: '',
  broker_id: '',
  employer_name: '',
  worker_name: '',
  entry_date: '',
  application_date: todayTaipei(),
  group_no: '',
  application_item_id: '',
  amount: '',
  copy_count: '1'
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
  { key: 'amount', label: '金額' },
  { key: 'copy_count', label: '張數' }
];

type BatchFill = Pick<BatchCaseRow, 'handler_name' | 'broker_id' | 'employer_name' | 'entry_date' | 'application_date'>;

export function CaseRegistrationPage({
  data,
  profile,
  reload,
  onGoFaxPickup
}: {
  data: ArcData;
  profile: Profile | null;
  reload: () => Promise<void>;
  onGoFaxPickup?: () => void;
}) {
  const { pushToast } = useToast();
  const firstBroker = data.brokers.find((item) => item.is_enabled)?.id ?? '';
  const firstAppItem = data.applicationItems.find((item) => item.is_enabled)?.id ?? '';
  const firstHandler = data.people.find((item) => item.show_as_handler && item.is_enabled)?.name ?? profile?.display_name ?? '';
  const makeDefaultRow = (): BatchCaseRow => ({ ...emptyRow, broker_id: firstBroker, application_item_id: firstAppItem, handler_name: firstHandler, application_date: todayTaipei() });
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [single, setSingle] = useState<BatchCaseRow>(() => makeDefaultRow());
  const [rows, setRows] = useState<BatchCaseRow[]>(() => Array.from({ length: 10 }, makeDefaultRow));
  const [batchFill, setBatchFill] = useState<BatchFill>({ handler_name: firstHandler, broker_id: firstBroker, employer_name: '', entry_date: '', application_date: todayTaipei() });
  const [submitting, setSubmitting] = useState(false);

  const handlers = useMemo(() => data.people.filter((item) => item.is_enabled && item.show_as_handler), [data.people]);
  const brokers = useMemo(() => data.brokers.filter((item) => item.is_enabled), [data.brokers]);
  const appItems = useMemo(() => data.applicationItems.filter((item) => item.is_enabled), [data.applicationItems]);

  function itemAmount(itemId: string): string {
    const item = data.applicationItems.find((entry) => entry.id === itemId);
    return item ? String(Number(item.default_amount ?? 0)) : '';
  }

  function resetSingle() {
    setSingle(makeDefaultRow());
    pushToast({ type: 'info', title: '已清除單筆案件內容' });
  }

  function resetBatchRows() {
    setRows(Array.from({ length: 10 }, makeDefaultRow));
    pushToast({ type: 'info', title: '已清除批次送件內容' });
  }

  function updateSingle(key: keyof BatchCaseRow, value: string) {
    setSingle((current) => ({ ...current, [key]: value, error: '', ...(key === 'application_item_id' ? { amount: itemAmount(value) } : {}) }));
  }

  function updateRow(index: number, key: keyof BatchCaseRow, value: string) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value, error: '', ...(key === 'application_item_id' ? { amount: itemAmount(value) } : {}) } : row));
  }

  function addRows() {
    setRows((current) => [...current, ...Array.from({ length: 5 }, makeDefaultRow)]);
  }

  function deleteRow(index: number) {
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  function applyBatchFill() {
    const parsedEntryDate = batchFill.entry_date ? parseDateLoose(batchFill.entry_date) : '';
    const parsedDate = batchFill.application_date ? parseDateLoose(batchFill.application_date) : '';
    if (batchFill.entry_date && !parsedEntryDate) {
      pushToast({ type: 'warning', title: ENTRY_DATE_ERROR });
      return;
    }
    if (batchFill.application_date && !parsedDate) {
      pushToast({ type: 'warning', title: DATE_ERROR });
      return;
    }
    setRows((current) => current.map((row) => ({
      ...row,
      handler_name: batchFill.handler_name || row.handler_name,
      broker_id: batchFill.broker_id || row.broker_id,
      employer_name: batchFill.employer_name || row.employer_name,
      entry_date: parsedEntryDate || row.entry_date,
      application_date: parsedDate || row.application_date,
      error: ''
    })));
    if (parsedEntryDate || parsedDate) {
      setBatchFill((current) => ({
        ...current,
        entry_date: parsedEntryDate || current.entry_date,
        application_date: parsedDate || current.application_date
      }));
    }
    pushToast({ type: 'success', title: '已一鍵填入批次欄位' });
  }

  function normalizeSelectValue(key: keyof BatchCaseRow, value: string): string {
    const clean = value.trim();
    if (!clean) return '';
    if (key === 'broker_id') {
      const matched = data.brokers.find((item) => [item.id, item.name, item.full_name, item.code].some((v) => String(v ?? '').trim() === clean));
      return matched?.id ?? clean;
    }
    if (key === 'application_item_id') {
      const matched = data.applicationItems.find((item) => item.id === clean || item.name === clean);
      return matched?.id ?? clean;
    }
    if (key === 'handler_name') {
      const matched = data.people.find((item) => item.name === clean || item.display_name === clean);
      return matched?.name ?? clean;
    }
    if (key === 'entry_date' || key === 'application_date') {
      return parseDateLoose(clean) ?? clean;
    }
    if (key === 'amount') {
      const money = parseMoney(clean);
      return money === null ? clean : String(money);
    }
    if (key === 'copy_count') {
      const count = Number(clean.replace(/,/g, ''));
      return Number.isInteger(count) && count > 0 ? String(count) : clean;
    }
    return clean;
  }

  function pasteToGrid(event: ClipboardEvent<HTMLInputElement | HTMLSelectElement>, rowIndex: number, columnKey: keyof BatchCaseRow) {
    const text = event.clipboardData.getData('text');
    if (!text.includes('\n') && !text.includes('\t')) return;
    event.preventDefault();
    const startColumn = batchColumns.findIndex((column) => column.key === columnKey);
    const lines = text.replace(/\r/g, '').split('\n').filter((line) => line.length > 0);
    setRows((current) => {
      const next = [...current];
      while (next.length < rowIndex + lines.length) next.push(makeDefaultRow());
      lines.forEach((line, lineOffset) => {
        const values = line.split('\t');
        values.forEach((value, colOffset) => {
          const column = batchColumns[startColumn + colOffset];
          if (!column) return;
          const actualIndex = rowIndex + lineOffset;
          next[actualIndex] = { ...next[actualIndex], [column.key]: normalizeSelectValue(column.key, value), error: '' };
        });
      });
      return next;
    });
  }

  function normalizeDateField(row: BatchCaseRow, setRow: (row: BatchCaseRow) => void, key: 'entry_date' | 'application_date') {
    const value = row[key];
    if (!value) return;
    const parsed = parseDateLoose(value);
    if (!parsed) {
      setRow({ ...row, error: key === 'application_date' ? DATE_ERROR : ENTRY_DATE_ERROR });
      pushToast({ type: 'warning', title: key === 'application_date' ? DATE_ERROR : ENTRY_DATE_ERROR });
      return;
    }
    setRow({ ...row, [key]: parsed, error: '' });
  }

  function normalizeRowDate(index: number, key: 'entry_date' | 'application_date') {
    const row = rows[index];
    if (!row?.[key]) return;
    const parsed = parseDateLoose(row[key]);
    setRows((current) => current.map((entry, rowIndex) => rowIndex === index ? { ...entry, [key]: parsed ?? entry[key], error: parsed ? '' : (key === 'application_date' ? DATE_ERROR : ENTRY_DATE_ERROR) } : entry));
    if (!parsed) pushToast({ type: 'warning', title: key === 'application_date' ? DATE_ERROR : ENTRY_DATE_ERROR });
  }

  function validateRows(inputRows: BatchCaseRow[]): { valid: RegisterCaseInput[]; errors: BatchCaseRow[] } {
    const valid: RegisterCaseInput[] = [];
    const errors = inputRows.map((row) => ({ ...row, error: '' }));
    inputRows.forEach((row, index) => {
      const hasAny = Object.entries(row).some(([key, value]) => key !== 'error' && key !== 'copy_count' && String(value ?? '').trim());
      if (!hasAny) return;
      const entryDate = row.entry_date ? parseDateLoose(row.entry_date) : null;
      const applicationDate = parseDateLoose(row.application_date);
      const money = parseMoney(row.amount);
      const copyCount = String(row.copy_count ?? '').trim() ? Number(String(row.copy_count).trim().replace(/,/g, '')) : 1;
      if (!applicationDate) {
        errors[index].error = DATE_ERROR;
        return;
      }
      if (row.entry_date && !entryDate) {
        errors[index].error = ENTRY_DATE_ERROR;
        return;
      }
      const groupNo = String(row.group_no ?? '').trim();
      if (!groupNo) {
        errors[index].error = inputRows.length > 1 ? `第 ${index + 1} 列尚未輸入團號，請補齊後再送出。` : GROUP_NO_REQUIRED;
        return;
      }
      const requiredMissing = !String(row.handler_name ?? '').trim() || !String(row.broker_id ?? '').trim() || !String(row.employer_name ?? '').trim() || !String(row.worker_name ?? '').trim() || !String(row.application_item_id ?? '').trim();
      if (requiredMissing) {
        errors[index].error = '必填欄位未完整';
        return;
      }
      if (!data.brokers.some((item) => item.id === row.broker_id)) {
        errors[index].error = '仲介別不正確';
        return;
      }
      if (!data.applicationItems.some((item) => item.id === row.application_item_id)) {
        errors[index].error = '申請項目不正確';
        return;
      }
      if (money === null) {
        errors[index].error = '金額格式錯誤';
        return;
      }
      if (!Number.isInteger(copyCount) || copyCount <= 0) {
        errors[index].error = '張數格式不正確，請輸入正整數。';
        return;
      }
      valid.push({
        handler_name: row.handler_name.trim(),
        broker_id: row.broker_id,
        employer_name: row.employer_name.trim(),
        worker_name: row.worker_name.trim(),
        entry_date: entryDate,
        application_date: applicationDate,
        group_no: groupNo,
        application_item_id: row.application_item_id,
        amount: money,
        copy_count: copyCount
      });
      errors[index].entry_date = entryDate ?? '';
      errors[index].application_date = applicationDate;
      errors[index].amount = String(money);
      errors[index].copy_count = String(copyCount);
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
      setSingle(makeDefaultRow());
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '新增失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitOnsite() {
    const { valid, errors } = validateRows([single]);
    if (!valid.length) {
      setSingle(errors[0]);
      pushToast({ type: 'error', title: '現場申請失敗', message: errors[0]?.error || '請輸入完整資料' });
      return;
    }
    setSubmitting(true);
    try {
      await createCases(valid, data, profile, {
        forceStatus: 'pending_pickup',
        note: '現場申請 / 待傳真領件',
        auditAction: '現場申請案件建立'
      });
      pushToast({ type: 'success', title: '現場申請已建立', message: '案件已直接帶入傳真/領件。' });
      setSingle(makeDefaultRow());
      await reload();
      onGoFaxPickup?.();
    } catch (err) {
      pushToast({ type: 'error', title: '現場申請失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setSubmitting(false);
    }
  }


  async function submitSupplementSingle() {
    const { valid, errors } = validateRows([single]);
    if (!valid.length) {
      setSingle(errors[0]);
      pushToast({ type: 'error', title: '補登失敗', message: errors[0]?.error || '請輸入完整資料' });
      return;
    }
    setSubmitting(true);
    try {
      const itemName = data.applicationItems.find((item) => item.id === valid[0].application_item_id)?.name ?? '';
      const directArchive = SUPPLEMENT_ARCHIVE_ITEMS.has(itemName);
      await createCases(valid, data, profile, {
        forceStatus: directArchive ? 'archive_registered' : 'pending_pickup',
        note: directArchive ? '補登 / 查詢留存' : '補登 / 待加入預計領件',
        auditAction: '補登案件建立'
      });
      pushToast({
        type: 'success',
        title: '補登完成',
        message: directArchive ? '案件已直接移入案件查詢留存。' : '案件已加入傳真/領件待處理區。'
      });
      setSingle(makeDefaultRow());
      await reload();
      if (!directArchive) onGoFaxPickup?.();
    } catch (err) {
      pushToast({ type: 'error', title: '補登失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitBatchSupplement() {
    const { valid, errors } = validateRows(rows);
    setRows(errors);
    const firstError = errors.find((row) => row.error)?.error;
    if (firstError) {
      pushToast({ type: 'error', title: '批次補登失敗', message: firstError });
      return;
    }
    if (!valid.length) {
      pushToast({ type: 'error', title: '批次補登失敗', message: '沒有可補登的有效資料，請檢查紅字列。' });
      return;
    }
    setSubmitting(true);
    try {
      const pickupRows = valid.filter((row) => {
        const itemName = data.applicationItems.find((item) => item.id === row.application_item_id)?.name ?? '';
        return !SUPPLEMENT_ARCHIVE_ITEMS.has(itemName);
      });
      const archiveRows = valid.filter((row) => {
        const itemName = data.applicationItems.find((item) => item.id === row.application_item_id)?.name ?? '';
        return SUPPLEMENT_ARCHIVE_ITEMS.has(itemName);
      });
      if (pickupRows.length) {
        await createCases(pickupRows, data, profile, {
          forceStatus: 'pending_pickup',
          note: '補登 / 待加入預計領件',
          auditAction: valid.length > 1 ? '批次補登案件建立｜傳真領件' : '補登案件建立'
        });
      }
      if (archiveRows.length) {
        await createCases(archiveRows, data, profile, {
          forceStatus: 'archive_registered',
          note: '補登 / 查詢留存',
          auditAction: valid.length > 1 ? '批次補登案件建立｜查詢留存' : '補登案件建立'
        });
      }
      pushToast({
        type: 'success',
        title: '批次補登完成',
        message: `已補登 ${valid.length} 筆：${pickupRows.length} 筆已加入傳真/領件，${archiveRows.length} 筆已直接移入案件查詢。`
      });
      setRows(Array.from({ length: 10 }, makeDefaultRow));
      await reload();
      if (pickupRows.length) onGoFaxPickup?.();
    } catch (err) {
      pushToast({ type: 'error', title: '批次補登失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitBatch() {
    const { valid, errors } = validateRows(rows);
    setRows(errors);
    const firstError = errors.find((row) => row.error)?.error;
    if (firstError) {
      pushToast({ type: 'error', title: '批次送件失敗', message: firstError });
      return;
    }
    if (!valid.length) {
      pushToast({ type: 'error', title: '批次送件失敗', message: '沒有可送出的有效資料，請檢查紅字列。' });
      return;
    }
    setSubmitting(true);
    try {
      await createCases(valid, data, profile);
      pushToast({ type: 'success', title: `批次送件完成`, message: `已新增 ${valid.length} 筆案件。` });
      setRows(Array.from({ length: 10 }, makeDefaultRow));
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
    const dateKey = key === 'entry_date' || key === 'application_date' ? key : null;
    if (dateKey) {
      return (
        <div className="date-input-row">
          <input value={String(row[key] ?? '')} onChange={(e) => onChange(key, e.target.value)} onBlur={() => rowIndex === -1 ? normalizeDateField(row, setSingle, dateKey) : normalizeRowDate(rowIndex, dateKey)} onPaste={(e) => pasteToGrid(e, rowIndex, key)} />
          <button className="mini secondary-button" type="button" onClick={() => onChange(key, todayTaipei())}>今天</button>
        </div>
      );
    }
    return <input value={String(row[key] ?? '')} onChange={(e) => onChange(key, e.target.value)} onPaste={(e) => pasteToGrid(e, rowIndex, key)} />;
  };

  return (
    <div className="page-content">
      <PageHeader title="居留案件登記" description="單筆 / 批次送件；不同仲介可在同一批登記，每列依自己的仲介產生案件編號。" />
      <AnnouncementBanner items={data.announcements} page="居留案件登記" />
      <div className="tabs">
        <button className={mode === 'single' ? 'active' : ''} onClick={() => setMode('single')}>單筆案件登記</button>
        <button className={mode === 'batch' ? 'active' : ''} onClick={() => setMode('batch')}>批次送件</button>
      </div>

      {mode === 'single' ? (
        <form className="card form-grid" onSubmit={submitSingle}>
          {batchColumns.map((column) => (
            <label key={column.key}>
              <span>{column.key === 'group_no' ? '團號 *' : column.label}</span>
              {renderField(single, updateSingle, column.key, -1)}
            </label>
          ))}
          {single.error ? <div className="inline-error full-span">{single.error}</div> : null}
          <div className="form-actions full-span">
            <button className="ghost-button" type="button" onClick={resetSingle} disabled={submitting}>一鍵清除內容</button>
            <button className="secondary-button" type="button" onClick={submitOnsite} disabled={submitting}>現場申請</button>
            <button className="supplement-button" type="button" onClick={submitSupplementSingle} disabled={submitting}>補登</button>
            <button className="primary-button" disabled={submitting}>送出登記</button>
          </div>
        </form>
      ) : (
        <section className="card full-width-card">
          <div className="batch-fill-panel">
            <label><span>一鍵承辦</span><select value={batchFill.handler_name} onChange={(e) => setBatchFill((current) => ({ ...current, handler_name: e.target.value }))}><option value="">不變更</option>{handlers.map((item) => <option key={item.id} value={item.name}>{item.display_name}</option>)}</select></label>
            <label><span>一鍵仲介</span><select value={batchFill.broker_id} onChange={(e) => setBatchFill((current) => ({ ...current, broker_id: e.target.value }))}><option value="">不變更</option>{brokers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span>一鍵雇主</span><input value={batchFill.employer_name} onChange={(e) => setBatchFill((current) => ({ ...current, employer_name: e.target.value }))} /></label>
            <label><span>一鍵入境日</span><div className="date-input-row"><input value={batchFill.entry_date} onChange={(e) => setBatchFill((current) => ({ ...current, entry_date: e.target.value }))} onBlur={() => setBatchFill((current) => ({ ...current, entry_date: parseDateLoose(current.entry_date) ?? current.entry_date }))} /><button className="mini secondary-button" type="button" onClick={() => setBatchFill((current) => ({ ...current, entry_date: todayTaipei() }))}>今天</button></div></label>
            <label><span>一鍵申請日期</span><div className="date-input-row"><input value={batchFill.application_date} onChange={(e) => setBatchFill((current) => ({ ...current, application_date: e.target.value }))} onBlur={() => setBatchFill((current) => ({ ...current, application_date: parseDateLoose(current.application_date) ?? current.application_date }))} /><button className="mini secondary-button" type="button" onClick={() => setBatchFill((current) => ({ ...current, application_date: todayTaipei() }))}>今天</button></div></label>
            <button className="secondary-button" type="button" onClick={applyBatchFill}>一鍵輸入</button>
          </div>
          <div className="toolbar-row">
            <button className="secondary-button" type="button" onClick={addRows}>增加列（+5）</button>
            <button className="ghost-button" type="button" onClick={resetBatchRows}>一鍵清除內容</button>
            <button className="supplement-button" type="button" onClick={submitBatchSupplement} disabled={submitting}>批次補登</button>
            <button className="primary-button" type="button" onClick={submitBatch} disabled={submitting}>批次送出</button>
          </div>
          <div className="table-wrap batch-grid-wrap">
            <table className="data-table batch-table">
              <thead><tr>{batchColumns.map((column) => <th key={column.key}>{column.key === 'group_no' ? '團號 *' : column.label}</th>)}<th>錯誤</th><th>操作</th></tr></thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} className={row.error ? 'row-error' : ''}>
                    {batchColumns.map((column) => <td key={column.key}>{renderField(row, (key, value) => updateRow(index, key, value), column.key, index)}</td>)}
                    <td className="cell-error">{row.error}</td>
                    <td><button className="danger-link" type="button" onClick={() => deleteRow(index)}>刪除</button></td>
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
