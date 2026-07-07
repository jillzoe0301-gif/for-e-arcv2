import { useMemo, useState } from 'react';
import { deleteArcCase, updateCaseFromCaseSearch } from '../api/repository';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { SearchInput } from '../components/SearchInput';
import { CaseStatusBadge } from '../components/StatusBadge';
import { useToast } from '../context/ToastContext';
import type { ArcCase, ArcData, CaseStatus, Profile } from '../types';
import { formatDate, parseDateLoose } from '../utils/date';
import { formatMoney, parseMoney } from '../utils/number';
import { canDeleteData } from '../utils/permissions';
import { rowMatchesKeyword } from '../utils/search';
import { caseStatusLabels } from '../utils/status';

type CaseEditForm = {
  handler_name: string;
  broker_id: string;
  employer_name: string;
  worker_name: string;
  entry_date: string;
  application_date: string;
  group_no: string;
  application_item_id: string;
  amount: string;
  copy_count: string;
  payment_date: string;
  receipt_no: string;
  foreign_no_last5: string;
  handler_last4: string;
  old_card_checked: boolean;
  receipt_order: string;
  expected_pickup_date: string;
  note: string;
};

function toEditForm(row: ArcCase): CaseEditForm {
  return {
    handler_name: row.handler_name ?? '',
    broker_id: row.broker_id ?? '',
    employer_name: row.employer_name ?? '',
    worker_name: row.worker_name ?? '',
    entry_date: row.entry_date ?? '',
    application_date: row.application_date ?? '',
    group_no: row.group_no ?? '',
    application_item_id: row.application_item_id ?? '',
    amount: String(row.amount ?? 0),
    copy_count: String(row.copy_count ?? 1),
    payment_date: row.payment_date ?? '',
    receipt_no: row.receipt_no ?? '',
    foreign_no_last5: row.foreign_no_last5 ?? '',
    handler_last4: row.handler_last4 ?? '',
    old_card_checked: Boolean(row.old_card_checked),
    receipt_order: row.receipt_order === null || row.receipt_order === undefined ? '' : String(row.receipt_order),
    expected_pickup_date: row.pickup_date ?? row.expected_pickup_date ?? '',
    note: row.note ?? ''
  };
}

export function CaseSearchPage({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<CaseStatus | ''>('');
  const [editingCase, setEditingCase] = useState<ArcCase | null>(null);
  const [editForm, setEditForm] = useState<CaseEditForm | null>(null);
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => data.cases
    .filter((caseRow) => !status || caseRow.status === status)
    .filter((caseRow) => rowMatchesKeyword(keyword, [
      caseRow.case_no,
      caseRow.employer_name,
      caseRow.worker_name,
      caseRow.group_no,
      data.applicationItems.find((item) => item.id === caseRow.application_item_id)?.name,
      caseRow.receipt_no,
      caseRow.foreign_no_last5,
      caseRow.handler_last4,
      caseRow.copy_count,
      caseRow.old_card_checked ? '舊卡' : ''
    ])), [data.applicationItems, data.cases, keyword, status]);

  async function remove(row: ArcCase) {
    if (!canDeleteData(profile?.role)) {
      pushToast({ type: 'warning', title: '您沒有刪除權限。' });
      return;
    }
    if (!window.confirm('確定要刪除此筆資料嗎？刪除後不可復原。')) return;
    try {
      await deleteArcCase(row, data, profile, '案件查詢');
      pushToast({ type: 'success', title: '案件已刪除' });
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '刪除失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }

  function openEdit(row: ArcCase) {
    if (!profile) {
      pushToast({ type: 'warning', title: '請先登入。' });
      return;
    }
    setEditingCase(row);
    setEditForm(toEditForm(row));
  }

  function updateForm<K extends keyof CaseEditForm>(key: K, value: CaseEditForm[K]) {
    setEditForm((current) => current ? { ...current, [key]: value } : current);
  }

  function normalizeDateField(key: 'entry_date' | 'application_date' | 'payment_date' | 'expected_pickup_date', label: string) {
    if (!editForm) return true;
    const value = editForm[key];
    if (!value && key !== 'application_date') return true;
    const parsed = parseDateLoose(value);
    if (!parsed) {
      pushToast({ type: 'warning', title: `${label}格式不正確，請重新輸入。` });
      return false;
    }
    updateForm(key, parsed);
    return true;
  }

  async function saveEdit() {
    if (!editingCase || !editForm) return;
    if (!editForm.employer_name.trim() || !editForm.worker_name.trim()) {
      pushToast({ type: 'warning', title: '雇主與工人不可空白。' });
      return;
    }
    if (!editForm.group_no.trim()) {
      pushToast({ type: 'warning', title: '團號為必填欄位。' });
      return;
    }
    const applicationDate = parseDateLoose(editForm.application_date);
    if (!applicationDate) {
      pushToast({ type: 'warning', title: '申請日期格式不正確，請重新輸入。' });
      return;
    }
    const entryDate = editForm.entry_date.trim() ? parseDateLoose(editForm.entry_date) : null;
    if (editForm.entry_date.trim() && !entryDate) {
      pushToast({ type: 'warning', title: '入境日格式不正確，請重新輸入。' });
      return;
    }
    const paymentDate = editForm.payment_date.trim() ? parseDateLoose(editForm.payment_date) : null;
    if (editForm.payment_date.trim() && !paymentDate) {
      pushToast({ type: 'warning', title: '收費日期格式不正確，請重新輸入。' });
      return;
    }
    const pickupDate = editForm.expected_pickup_date.trim() ? parseDateLoose(editForm.expected_pickup_date) : null;
    if (editForm.expected_pickup_date.trim() && !pickupDate) {
      pushToast({ type: 'warning', title: '領件日格式不正確，請重新輸入。' });
      return;
    }
    const amount = parseMoney(editForm.amount);
    if (amount === null || amount < 0) {
      pushToast({ type: 'warning', title: '金額格式不正確，請重新輸入。' });
      return;
    }
    const copyCount = Number(String(editForm.copy_count || '1').replace(/,/g, '').trim());
    if (!Number.isInteger(copyCount) || copyCount <= 0) {
      pushToast({ type: 'warning', title: '張數格式不正確，請輸入正整數。' });
      return;
    }
    const receiptOrderText = editForm.receipt_order.trim();
    const receiptOrder = receiptOrderText ? Number(receiptOrderText.replace(/,/g, '')) : null;
    if (receiptOrderText && (!Number.isInteger(receiptOrder) || Number(receiptOrder) <= 0)) {
      pushToast({ type: 'warning', title: '收據順序格式錯誤。' });
      return;
    }
    setSaving(true);
    try {
      await updateCaseFromCaseSearch({
        caseRow: editingCase,
        data,
        actor: profile,
        patch: {
          handler_name: editForm.handler_name.trim(),
          broker_id: editForm.broker_id,
          employer_name: editForm.employer_name.trim(),
          worker_name: editForm.worker_name.trim(),
          entry_date: entryDate,
          application_date: applicationDate,
          group_no: editForm.group_no.trim(),
          application_item_id: editForm.application_item_id,
          amount,
          copy_count: copyCount,
          payment_date: paymentDate,
          receipt_no: editForm.receipt_no.trim() || null,
          foreign_no_last5: editForm.foreign_no_last5.trim() || null,
          handler_last4: editForm.handler_last4.trim().replace(/\D/g, '').slice(0, 4) || null,
          old_card_checked: editForm.old_card_checked,
          receipt_order: receiptOrder,
          expected_pickup_date: pickupDate,
          note: editForm.note.trim() || null
        }
      });
      pushToast({ type: 'success', title: '案件資料已更新' });
      setEditingCase(null);
      setEditForm(null);
      await reload();
    } catch (err) {
      pushToast({ type: 'error', title: '修改失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setSaving(false);
    }
  }

  function statusCell(row: ArcCase) {
    if (row.status === 'pending_pickup' && row.note?.includes('現場申請')) {
      return <span className="status-badge status-pending_pickup">現場申請 / 待傳真領件</span>;
    }
    return <CaseStatusBadge status={row.status} />;
  }

  const columns = [
    { key: 'case_no', title: '案件編號', render: (row: ArcCase) => row.case_no },
    { key: 'status', title: '狀態', render: (row: ArcCase) => statusCell(row) },
    { key: 'broker', title: '仲介', render: (row: ArcCase) => data.brokers.find((item) => item.id === row.broker_id)?.name ?? '' },
    { key: 'handler', title: '承辦', render: (row: ArcCase) => row.handler_name },
    { key: 'employer', title: '雇主', render: (row: ArcCase) => row.employer_name },
    { key: 'worker', title: '工人', render: (row: ArcCase) => row.worker_name },
    { key: 'group', title: '團號', render: (row: ArcCase) => row.group_no ?? '' },
    { key: 'item', title: '申請項目', render: (row: ArcCase) => data.applicationItems.find((item) => item.id === row.application_item_id)?.name ?? '' },
    { key: 'amount', title: '金額', render: (row: ArcCase) => formatMoney(row.amount) },
    { key: 'receipt', title: '收件編號', render: (row: ArcCase) => row.receipt_no ?? '' },
    { key: 'foreign', title: '外字五碼', render: (row: ArcCase) => row.foreign_no_last5 ?? '' },
    { key: 'copy_count', title: '張數', render: (row: ArcCase) => row.copy_count ?? 1 },
    { key: 'last4', title: '經手人後四碼', render: (row: ArcCase) => row.handler_last4 ?? '' },
    { key: 'old_card', title: '舊卡', render: (row: ArcCase) => (row.old_card_checked ?? data.applicationItems.find((item) => item.id === row.application_item_id)?.requires_old_card) ? 'V' : '' },
    { key: 'application_date', title: '申請日', render: (row: ArcCase) => formatDate(row.application_date) },
    { key: 'payment_date', title: '收費日期', render: (row: ArcCase) => formatDate(row.payment_date) },
    { key: 'fax_date', title: '傳真日期', render: (row: ArcCase) => formatDate(row.fax_date) },
    { key: 'pickup_date', title: '領件日', render: (row: ArcCase) => formatDate(row.pickup_date ?? (row.status === 'completed' ? row.expected_pickup_date : null)) },
    { key: 'edit', title: '修改', render: (row: ArcCase) => profile ? <button className="secondary-button mini" onClick={() => openEdit(row)}>修改</button> : null },
    { key: 'delete', title: '刪除', render: (row: ArcCase) => canDeleteData(profile?.role) ? <button className="danger-link" onClick={() => remove(row)}>刪除</button> : null }
  ];

  return (
    <div className="page-content">
      <PageHeader title="案件查詢" description="可搜尋案件編號、雇主、工人、團號、申請項目、收件編號、外字五碼。" />
      <section className="card full-width-card">
        <div className="search-toolbar finance-toolbar">
          <SearchInput id="caseSearchInput" value={keyword} onCommit={setKeyword} placeholder="案件編號 / 雇主 / 工人 / 團號 / 申請項目 / 收件編號 / 外字五碼" />
          <label className="inline-field"><span>狀態</span><select value={status} onChange={(e) => setStatus(e.target.value as CaseStatus | '')}><option value="">全部狀態</option>{Object.entries(caseStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        </div>
        <div className="search-result-area">
          <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} emptyText="查無案件資料" />
        </div>
      </section>
      {editingCase && editForm ? (
        <Modal title={`修改案件｜${editingCase.case_no}`} onClose={() => { setEditingCase(null); setEditForm(null); }}>
          <div className="settings-form-grid case-edit-grid">
            <label><span>仲介</span><select value={editForm.broker_id} onChange={(e) => updateForm('broker_id', e.target.value)}>{data.brokers.filter((item) => item.is_enabled).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span>承辦</span><select value={editForm.handler_name} onChange={(e) => updateForm('handler_name', e.target.value)}><option value="">請選擇</option>{data.people.filter((item) => item.is_enabled && item.show_as_handler).map((item) => <option key={item.id} value={item.display_name}>{item.display_name}</option>)}</select></label>
            <label><span>雇主</span><input value={editForm.employer_name} onChange={(e) => updateForm('employer_name', e.target.value)} /></label>
            <label><span>工人</span><input value={editForm.worker_name} onChange={(e) => updateForm('worker_name', e.target.value)} /></label>
            <label><span>團號</span><input value={editForm.group_no} onChange={(e) => updateForm('group_no', e.target.value)} /></label>
            <label><span>申請項目</span><select value={editForm.application_item_id} onChange={(e) => updateForm('application_item_id', e.target.value)}>{data.applicationItems.filter((item) => item.is_enabled).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span>金額</span><input value={editForm.amount} onChange={(e) => updateForm('amount', e.target.value)} /></label>
            <label><span>張數</span><input inputMode="numeric" value={editForm.copy_count} onChange={(e) => updateForm('copy_count', e.target.value.replace(/\D/g, ''))} /></label>
            <label><span>入境日</span><input value={editForm.entry_date} onChange={(e) => updateForm('entry_date', e.target.value)} onBlur={() => normalizeDateField('entry_date', '入境日')} /></label>
            <label><span>申請日</span><input value={editForm.application_date} onChange={(e) => updateForm('application_date', e.target.value)} onBlur={() => normalizeDateField('application_date', '申請日')} /></label>
            <label><span>收費日期</span><input value={editForm.payment_date} onChange={(e) => updateForm('payment_date', e.target.value)} onBlur={() => normalizeDateField('payment_date', '收費日期')} /></label>
            <label><span>領件日</span><input value={editForm.expected_pickup_date} onChange={(e) => updateForm('expected_pickup_date', e.target.value)} onBlur={() => normalizeDateField('expected_pickup_date', '領件日')} /></label>
            <label><span>收件編號</span><input value={editForm.receipt_no} onChange={(e) => updateForm('receipt_no', e.target.value)} /></label>
            <label><span>外字五碼</span><input value={editForm.foreign_no_last5} onChange={(e) => updateForm('foreign_no_last5', e.target.value)} /></label>
            <label><span>經手人後四碼</span><input inputMode="numeric" value={editForm.handler_last4} onChange={(e) => updateForm('handler_last4', e.target.value.replace(/\D/g, '').slice(0, 4))} /></label>
            <label><span>收據順序</span><input inputMode="numeric" value={editForm.receipt_order} onChange={(e) => updateForm('receipt_order', e.target.value.replace(/\D/g, ''))} /></label>
            <label className="checkbox-line"><input type="checkbox" checked={editForm.old_card_checked} onChange={(e) => updateForm('old_card_checked', e.target.checked)} /><span>舊卡</span></label>
            <label className="wide-field"><span>備註</span><textarea value={editForm.note} onChange={(e) => updateForm('note', e.target.value)} /></label>
          </div>
          <div className="form-actions"><button className="primary-button" disabled={saving} onClick={saveEdit}>{saving ? '儲存中...' : '儲存修改'}</button></div>
        </Modal>
      ) : null}
    </div>
  );
}
