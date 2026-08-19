import { useEffect, useMemo, useState } from 'react';
import {
  createStampBatch,
  createStampOrder,
  createStampOrders,
  deleteStampOrder,
  updateStampOrder
} from '../api/repository';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../context/ToastContext';
import type { ArcData, Profile, StampBatch, StampOrder } from '../types';
import { formatDate, parseDateLoose, todayTaipei } from '../utils/date';
import { formatMoney } from '../utils/number';

const STAMP_TYPES = [
  '木頭章',
  '連續章（姓名章）',
  '藍色連續章',
  '特殊印章'
] as const;

const DEPARTMENTS = ['一部', '二部'] as const;

const SENDER_OPTIONS = [
  { name: '嘉陽', extension: '113' },
  { name: '佩珊', extension: '117' },
  { name: '詩涵', extension: '175' },
  { name: '奕君', extension: '111' },
  { name: '晏婷', extension: '119' },
  { name: '林莞', extension: '114' },
  { name: '若儀', extension: '184' }
] as const;

const ADMIN_DEPARTMENT_MAP: Record<string, string> = {
  '林莞': '二部',
  '奕君': '二部',
  '佩珊': '二部',
  '嘉陽': '一部',
  '詩涵': '一部',
  '晏婷': '一部'
};

function profileAdminName(displayName?: string | null) {
  const text = String(displayName ?? '');
  return [...Object.keys(ADMIN_DEPARTMENT_MAP), '若儀'].find((name) => text.includes(name)) ?? '';
}

function defaultDepartmentForAdmin(adminName: string) {
  return ADMIN_DEPARTMENT_MAP[adminName] ?? '';
}

type Draft = {
  stamp_date: string;
  department: string;
  admin_name: string;
  employer_department: string;
  name_content: string;
  stamp_type: string;
  spec_note: string;
  quantity: string;
  unit_price: string;
};

function orderToDraft(order: StampOrder): Draft {
  return {
    stamp_date: order.stamp_date,
    department: order.department,
    admin_name: order.admin_name,
    employer_department: order.employer_department,
    name_content: order.name_content,
    stamp_type: order.stamp_type,
    spec_note: order.spec_note ?? '',
    quantity: String(order.quantity ?? 1),
    unit_price: String(order.unit_price ?? 0)
  };
}

function addDays(dateText: string, days: number) {
  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function lineDate(dateText: string) {
  if (!dateText) return '';
  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
  return `${month}/${day}(${weekday})`;
}

function stampPreset(type: string) {
  if (type === '木頭章') return { spec: '', price: 40 };
  if (type === '連續章（姓名章）') return { spec: '長 1.2 × 寬 0.8', price: 0 };
  if (type === '藍色連續章') return { spec: '不加框｜長 3 × 寬 1', price: 140 };
  return { spec: '', price: 0 };
}

function orderAmount(order: Pick<StampOrder, 'quantity' | 'unit_price'>) {
  return Number(order.quantity ?? 0) * Number(order.unit_price ?? 0);
}

function selectedOrAll(selectedIds: Set<string>, pendingOrders: StampOrder[]) {
  const selected = pendingOrders.filter((order) => selectedIds.has(order.id));
  return selected.length ? selected : pendingOrders;
}

function makeLineMessage(params: {
  senderName: string;
  senderExtension: string;
  requiredDate: string;
  orders: StampOrder[];
}) {
  const woodOrders = params.orders.filter((order) => order.stamp_type === '木頭章');
  const specialOrders = params.orders.filter((order) => order.stamp_type !== '木頭章');
  const woodDept1Amount = woodOrders
    .filter((order) => order.department === '一部')
    .reduce((sum, order) => sum + orderAmount(order), 0);
  const woodDept2Amount = woodOrders
    .filter((order) => order.department === '二部')
    .reduce((sum, order) => sum + orderAmount(order), 0);

  const specialDept1Orders = specialOrders.filter((order) => order.department === '一部');
  const specialDept2Orders = specialOrders.filter((order) => order.department === '二部');
  const specialDept1Amount = specialDept1Orders.reduce((sum, order) => sum + orderAmount(order), 0);
  const specialDept2Amount = specialDept2Orders.reduce((sum, order) => sum + orderAmount(order), 0);
  const unassignedSpecialOrders = specialOrders.filter((order) => order.department !== '一部' && order.department !== '二部');
  const unassignedSpecialAmount = unassignedSpecialOrders.reduce((sum, order) => sum + orderAmount(order), 0);
  const receiptCount =
    (woodDept1Amount > 0 ? 1 : 0) +
    (woodDept2Amount > 0 ? 1 : 0) +
    (specialDept1Amount > 0 ? 1 : 0) +
    (specialDept2Amount > 0 ? 1 : 0) +
    (unassignedSpecialAmount > 0 ? 1 : 0);
  const receiptLines: string[] = [`收據請協助開立：(${receiptCount}張)`];
  const woodReceiptParts: string[] = [];
  if (woodDept1Amount > 0) woodReceiptParts.push(`一張(一部)$${formatMoney(woodDept1Amount)}`);
  if (woodDept2Amount > 0) woodReceiptParts.push(`一張(二部)$${formatMoney(woodDept2Amount)}`);
  if (woodReceiptParts.length) receiptLines.push(woodReceiptParts.join('、'));

  const specialGroups = [
    { label: '一部', amount: specialDept1Amount, orders: specialDept1Orders },
    { label: '二部', amount: specialDept2Amount, orders: specialDept2Orders },
    { label: '未指定部門', amount: unassignedSpecialAmount, orders: unassignedSpecialOrders }
  ].filter((group) => group.amount > 0);

  if (specialGroups.length) {
    receiptLines.push(`其他印章請開立(${specialGroups.length}張收據)：`);
    specialGroups.forEach((group) => {
      receiptLines.push(`一張(${group.label}－其他印章)$${formatMoney(group.amount)}`);
    });
  }

  const orderLines = params.orders
    .map((order) => {
      const name = order.name_content.trim();
      if (!name) return '';
      if (order.stamp_type === '木頭章') return name;
      const spec = String(order.spec_note ?? '').trim();
      return [name, order.stamp_type, spec].filter(Boolean).join('｜');
    })
    .filter(Boolean);

  const intro = params.senderExtension.trim()
    ? `您好，我是分機 ${params.senderExtension.trim()} ${params.senderName.trim()}`
    : `您好，我是 ${params.senderName.trim()}`;
  return [
    intro,
    '麻煩您協助刻章，謝謝您。',
    `請幫忙${lineDate(params.requiredDate)}下午4點以前，方便時協助送來即可。`,
    ...receiptLines,
    '工人姓名如下：',
    ...orderLines
  ].join('\n');
}

function receiptHtml(rows: StampOrder[]) {
  const count = rows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
  const amount = rows.reduce((sum, row) => sum + orderAmount(row), 0);
  const adminNames = Array.from(new Set(rows.map((row) => row.admin_name?.trim() || '未指定').filter(Boolean)));
  const groupedBody = adminNames.map((adminName) => {
    const adminRows = rows.filter((row) => (row.admin_name?.trim() || '未指定') === adminName);
    const adminCount = adminRows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
    const adminAmount = adminRows.reduce((sum, row) => sum + orderAmount(row), 0);
    const detailRows = adminRows.map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${row.stamp_date}</td>
        <td>${escapeHtml(row.department)}</td>
        <td>${escapeHtml(row.employer_department)}</td>
        <td>${escapeHtml(row.name_content)}</td>
        <td>${escapeHtml(row.stamp_type)}</td>
        <td>${row.stamp_type === '木頭章' ? '' : escapeHtml(row.spec_note ?? '')}</td>
        <td>${row.quantity}</td>
        <td>$${formatMoney(orderAmount(row))}</td>
      </tr>`).join('');
    return `
      <tr class="admin-group-row">
        <td colspan="9"><strong>行政：${escapeHtml(adminName)}</strong><span>｜印章數：${adminCount}｜金額：$${formatMoney(adminAmount)}</span></td>
      </tr>
      ${detailRows}
      <tr class="admin-sign-row">
        <td colspan="9">${escapeHtml(adminName)} 簽收：________________________　簽收日期：________________</td>
      </tr>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>印章送刻簽收單</title><style>
    @page { size:A4 landscape; margin:0.5cm; }
    body { font-family: Arial, "Microsoft JhengHei", sans-serif; color:#1f2d3d; margin:0; }
    .page { width:100%; }
    h1 { text-align:center; font-size:22px; margin:4px 0 10px; }
    .meta { margin-bottom:8px; font-size:14px; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:11px; }
    th,td { border:1px solid #6f7782; padding:5px 4px; vertical-align:middle; word-break:break-word; }
    th { background:#eef3e9; }
    th:nth-child(1),td:nth-child(1){width:4%} th:nth-child(2),td:nth-child(2){width:9%} th:nth-child(3),td:nth-child(3){width:6%}
    th:nth-child(4),td:nth-child(4){width:16%} th:nth-child(5),td:nth-child(5){width:17%} th:nth-child(6),td:nth-child(6){width:11%}
    th:nth-child(7),td:nth-child(7){width:17%} th:nth-child(8),td:nth-child(8){width:6%} th:nth-child(9),td:nth-child(9){width:10%}
    .admin-group-row td { background:#e9f1df; font-size:13px; padding:7px 8px; }
    .admin-group-row span { margin-left:12px; font-weight:600; color:#596579; }
    .admin-sign-row td { background:#fafbf8; font-size:13px; font-weight:700; text-align:right; padding:10px 8px; }
    .summary-sign { margin-top:12px; font-size:12px; color:#667085; }
  </style></head><body><section class="page">
    <h1>印章送刻簽收單</h1>
    <div class="meta"><strong>行政：</strong>${escapeHtml(adminNames.join('、') || '未指定')}　　<strong>總印章數：</strong>${count}　　<strong>總金額：</strong>$${formatMoney(amount)}</div>
    <table>
      <thead><tr><th>#</th><th>送刻日期</th><th>部門</th><th>雇主</th><th>工人姓名 / 內容</th><th>印章種類</th><th>規格 / 備註</th><th>數量</th><th>金額</th></tr></thead>
      <tbody>${groupedBody}</tbody>
    </table>
    <div class="summary-sign">本簽收單為同一批次單一文件；各行政於自己的區塊完成簽收即可。</div>
  </section><script>setTimeout(()=>window.print(),250)<\/script></body></html>`;
}

function escapeHtml(value: string) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char));
}

export function StampOrderPage({ data, profile, reload }: { data: ArcData; profile: Profile | null; reload: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const loginAdminName = profileAdminName(profile?.display_name);
  const loginDepartment = defaultDepartmentForAdmin(loginAdminName);
  const initialSender = SENDER_OPTIONS.find((item) => profile?.display_name?.includes(item.name));
  const [senderName, setSenderName] = useState(initialSender?.name ?? '');
  const [senderExtension, setSenderExtension] = useState(initialSender?.extension ?? '');
  const [requiredDate, setRequiredDate] = useState(addDays(todayTaipei(), 1));
  const [pasteText, setPasteText] = useState('');
  const [importingPaste, setImportingPaste] = useState(false);
  const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [linePreview, setLinePreview] = useState<string | null>(null);

  const pendingOrders = useMemo(() => data.stampOrders
    .filter((order) => !order.deleted_at && order.status === 'pending')
    .sort((a, b) => `${b.stamp_date}${b.created_at ?? ''}`.localeCompare(`${a.stamp_date}${a.created_at ?? ''}`)), [data.stampOrders]);

  const sentBatches = useMemo(() => data.stampBatches
    .filter((batch) => !batch.deleted_at)
    .sort((a, b) => `${b.sent_date}${b.batch_no}`.localeCompare(`${a.sent_date}${a.batch_no}`)), [data.stampBatches]);

  useEffect(() => {
    const next: Record<string, Draft> = {};
    data.stampOrders.filter((order) => !order.deleted_at).forEach((order) => { next[order.id] = orderToDraft(order); });
    setDrafts(next);
  }, [data.stampOrders]);

  const adminOptions = useMemo(() => data.people.filter((person) => person.is_enabled && person.show_as_admin), [data.people]);

  const effectivePendingOrders = useMemo(() => pendingOrders.map((order) => {
    const draft = drafts[order.id];
    if (!draft) return order;
    return {
      ...order,
      stamp_date: draft.stamp_date,
      department: draft.department,
      admin_name: draft.admin_name,
      employer_department: draft.employer_department,
      name_content: draft.name_content,
      stamp_type: draft.stamp_type,
      spec_note: draft.spec_note,
      quantity: Number(draft.quantity || 0),
      unit_price: Number(draft.unit_price || 0)
    } as StampOrder;
  }), [drafts, pendingOrders]);

  const pendingStats = useMemo(() => {
    const calc = (department: string) => {
      const rows = effectivePendingOrders.filter((order) => order.department === department);
      return {
        count: rows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0),
        amount: rows.reduce((sum, row) => sum + orderAmount(row), 0)
      };
    };
    const one = calc('一部');
    const two = calc('二部');
    return { one, two, totalCount: one.count + two.count, totalAmount: one.amount + two.amount };
  }, [effectivePendingOrders]);

  const workingOrders = useMemo(() => selectedOrAll(selectedIds, effectivePendingOrders), [effectivePendingOrders, selectedIds]);
  const lineMessage = useMemo(() => makeLineMessage({ senderName, senderExtension, requiredDate, orders: workingOrders }), [requiredDate, senderExtension, senderName, workingOrders]);

  function patchDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  function changeSender(value: string) {
    const selected = SENDER_OPTIONS.find((item) => item.name === value);
    setSenderName(selected?.name ?? '');
    setSenderExtension(selected?.extension ?? '');
  }

  function parsePasteRows(text: string) {
    const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trimEnd()).filter((line) => line.trim());
    if (!lines.length) return [];

    const rows = lines.map((line) => line.split('\t').map((cell) => cell.trim()));
    const normalizedHeader = (value: string) => value.replace(/\s+/g, '').replace(/[／/]/g, '/').toLowerCase();
    const headerAliases: Record<string, keyof Draft> = {
      '送刻日期': 'stamp_date',
      '日期': 'stamp_date',
      '部門': 'department',
      '行政': 'admin_name',
      '雇主': 'employer_department',
      '雇主/部門': 'employer_department',
      '雇主部門': 'employer_department',
      '工人': 'name_content',
      '姓名': 'name_content',
      '內容': 'name_content',
      '姓名/內容': 'name_content',
      '工人姓名/內容': 'name_content',
      '工人姓名': 'name_content',
      '印章種類': 'stamp_type',
      '種類': 'stamp_type',
      '規格/備註': 'spec_note',
      '規格': 'spec_note',
      '備註': 'spec_note',
      '數量': 'quantity',
      '單價': 'unit_price',
      '金額': 'unit_price'
    };

    const headerKeys = rows[0].map((cell) => headerAliases[normalizedHeader(cell)] ?? null);
    const hasHeader = headerKeys.some(Boolean);
    const dataRows = hasHeader ? rows.slice(1) : rows;

    return dataRows.map((cells, index) => {
      const base = {
        lineNo: index + 1,
        stamp_date: todayTaipei(),
        department: loginDepartment,
        admin_name: loginAdminName,
        employer_department: '',
        name_content: '',
        stamp_type: '木頭章',
        spec_note: '',
        quantity: 1,
        unit_price: 40
      };

      if (hasHeader) {
        const row: Record<string, unknown> = { ...base };
        cells.forEach((cell, cellIndex) => {
          const key = headerKeys[cellIndex];
          if (!key) return;
          if (key === 'stamp_date') {
            row[key] = cell ? (parseDateLoose(cell) ?? todayTaipei()) : base.stamp_date;
          } else if (key === 'quantity') {
            const parsed = Number(cell.replace(/,/g, ''));
            row[key] = Number.isInteger(parsed) && parsed > 0 ? parsed : base.quantity;
          } else if (key === 'unit_price') {
            const parsed = Number(cell.replace(/[$,]/g, ''));
            row[key] = Number.isFinite(parsed) && parsed >= 0 ? parsed : base.unit_price;
          } else if (key === 'stamp_type') {
            row[key] = cell || base.stamp_type;
            if (cell) {
              const preset = stampPreset(cell);
              if (!cells.some((_, i) => headerKeys[i] === 'spec_note')) row.spec_note = preset.spec;
              if (!cells.some((_, i) => headerKeys[i] === 'unit_price')) row.unit_price = cell === '木頭章' ? 40 : preset.price;
            }
          } else {
            row[key] = cell;
          }
        });
        const admin = String(row.admin_name ?? '');
        if (!String(row.department ?? '').trim()) row.department = defaultDepartmentForAdmin(admin) || loginDepartment;
        return row as typeof base;
      }

      // 無標題時依欄數判斷，不把一般文字誤當成日期/部門。
      // 1欄：姓名/內容
      // 2欄：雇主｜姓名/內容
      // 3欄：行政｜雇主｜姓名/內容
      // 4欄：部門｜行政｜雇主｜姓名/內容
      // 5欄以上：送刻日期｜部門｜行政｜雇主｜姓名/內容｜印章種類｜規格/備註｜數量｜單價
      if (cells.length === 1) {
        return { ...base, name_content: cells[0] ?? '' };
      }
      if (cells.length === 2) {
        return { ...base, employer_department: cells[0] ?? '', name_content: cells[1] ?? '' };
      }
      if (cells.length === 3) {
        const [adminName = '', employer = '', worker = ''] = cells;
        const resolvedAdmin = adminName || loginAdminName;
        return {
          ...base,
          admin_name: resolvedAdmin,
          department: defaultDepartmentForAdmin(resolvedAdmin) || loginDepartment,
          employer_department: employer,
          name_content: worker
        };
      }
      if (cells.length === 4) {
        const [department = '', adminName = '', employer = '', worker = ''] = cells;
        const resolvedAdmin = adminName || loginAdminName;
        const validDepartment = department === '一部' || department === '二部' ? department : '';
        return {
          ...base,
          department: validDepartment || defaultDepartmentForAdmin(resolvedAdmin) || loginDepartment,
          admin_name: resolvedAdmin,
          employer_department: employer,
          name_content: worker
        };
      }

      const [rawDate = '', department = '', adminName = '', employer = '', worker = '', rawType = '', rawSpec = '', rawQuantity = '', rawPrice = ''] = cells;
      const resolvedAdmin = adminName || loginAdminName;
      const validDepartment = department === '一部' || department === '二部' ? department : '';
      const resolvedDepartment = validDepartment || defaultDepartmentForAdmin(resolvedAdmin) || loginDepartment;
      const date = rawDate ? (parseDateLoose(rawDate) ?? todayTaipei()) : todayTaipei();
      const stampType = rawType || '木頭章';
      const preset = stampPreset(stampType);
      const quantityNumber = rawQuantity ? Number(rawQuantity.replace(/,/g, '')) : 1;
      const priceNumber = rawPrice ? Number(rawPrice.replace(/[$,]/g, '')) : (stampType === '木頭章' ? 40 : preset.price);
      return {
        lineNo: index + 1,
        stamp_date: date,
        department: resolvedDepartment,
        admin_name: resolvedAdmin,
        employer_department: employer,
        name_content: worker,
        stamp_type: stampType,
        spec_note: rawSpec || preset.spec,
        quantity: Number.isInteger(quantityNumber) && quantityNumber > 0 ? quantityNumber : 1,
        unit_price: Number.isFinite(priceNumber) && priceNumber >= 0 ? priceNumber : 40
      };
    });
  }

  async function importPasteRows() {
    const parsed = parsePasteRows(pasteText);
    if (!parsed.length) {
      pushToast({ type: 'warning', title: '請先貼上要新增的印章資料。' });
      return;
    }
    setImportingPaste(true);
    try {
      await createStampOrders(parsed.map(({ lineNo: _lineNo, ...row }) => row), profile);
      setPasteText('');
      await reload();
      pushToast({ type: 'success', title: `已批次新增 ${parsed.length} 筆印章資料` });
    } catch (err) {
      pushToast({ type: 'error', title: '批次新增失敗', message: err instanceof Error ? err.message : '批次新增失敗，請檢查貼上資料內容。' });
    } finally {
      setImportingPaste(false);
    }
  }

  async function addRow() {
    try {
      await createStampOrder({
        stamp_date: todayTaipei(),
        department: loginDepartment,
        admin_name: loginAdminName,
        employer_department: '',
        name_content: '',
        stamp_type: '木頭章',
        spec_note: '',
        quantity: 1,
        unit_price: 40
      }, profile);
      await reload();
      pushToast({ type: 'success', title: '已新增印章送刻資料' });
    } catch (err) {
      pushToast({ type: 'error', title: '新增失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }

  async function saveRow(order: StampOrder) {
    const draft = drafts[order.id];
    if (!draft) return;
    const quantity = Number(draft.quantity);
    const unitPrice = Number(draft.unit_price);
    if (!draft.stamp_date || !draft.department || !draft.admin_name || !draft.employer_department.trim() || !draft.name_content.trim()) {
      pushToast({ type: 'warning', title: '送刻日期、部門、行政、雇主、工人姓名 / 內容為必填。' });
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      pushToast({ type: 'warning', title: '數量或單價格式不正確。' });
      return;
    }
    setSavingId(order.id);
    try {
      await updateStampOrder(order.id, {
        stamp_date: draft.stamp_date,
        department: draft.department,
        admin_name: draft.admin_name,
        employer_department: draft.employer_department.trim(),
        name_content: draft.name_content.trim(),
        stamp_type: draft.stamp_type,
        spec_note: draft.stamp_type === '木頭章' ? null : (draft.spec_note.trim() || null),
        quantity,
        unit_price: unitPrice
      }, profile);
      await reload();
      pushToast({ type: 'success', title: '印章資料已儲存' });
    } catch (err) {
      pushToast({ type: 'error', title: '儲存失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setSavingId(null);
    }
  }

  async function removeRow(order: StampOrder) {
    if (!window.confirm(`確定刪除「${order.name_content || '此筆印章'}」嗎？`)) return;
    try {
      await deleteStampOrder(order.id, profile);
      setSelectedIds((current) => { const next = new Set(current); next.delete(order.id); return next; });
      await reload();
      pushToast({ type: 'success', title: '已刪除' });
    } catch (err) {
      pushToast({ type: 'error', title: '刪除失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((current) => current.size === pendingOrders.length ? new Set() : new Set(pendingOrders.map((order) => order.id)));
  }

  async function copyLineText(message: string) {
    try {
      await navigator.clipboard.writeText(message);
      pushToast({ type: 'success', title: 'LINE 訊息已複製' });
      return true;
    } catch {
      pushToast({ type: 'warning', title: '無法自動複製', message: 'LINE 訊息已開啟，請按視窗內的「再次複製」。' });
      return false;
    }
  }

  async function openLineMessage(message = lineMessage) {
    setLinePreview(message);
    await copyLineText(message);
  }

  function printReceipt(rows = workingOrders) {
    if (!rows.length) {
      pushToast({ type: 'warning', title: '目前沒有可列印的印章資料。' });
      return;
    }
    const popup = window.open('', '_blank', 'width=1200,height=850');
    if (!popup) {
      pushToast({ type: 'warning', title: '瀏覽器阻擋列印視窗，請允許彈出視窗。' });
      return;
    }
    popup.document.open();
    popup.document.write(receiptHtml(rows));
    popup.document.close();
  }

  async function markSent() {
    const rows = workingOrders;
    if (!rows.length) {
      pushToast({ type: 'warning', title: '目前沒有待送刻資料。' });
      return;
    }
    const invalid = rows.find((order) => !order.department || !order.admin_name || !order.employer_department.trim() || !order.name_content.trim());
    if (invalid) {
      pushToast({ type: 'warning', title: '請先把選取資料的必填欄位補齊並儲存。' });
      return;
    }
    if (!senderName || !senderExtension) {
      pushToast({ type: 'warning', title: '請先選擇送刻者。' });
      return;
    }
    if (!window.confirm(`確定將 ${rows.length} 筆資料建立為已送刻批次嗎？`)) return;
    setCreatingBatch(true);
    try {
      const batch = await createStampBatch({
        orderIds: rows.map((row) => row.id),
        sentDate: todayTaipei(),
        requiredDate,
        senderName: senderName.trim() || profile?.display_name || '',
        senderExtension: senderExtension.trim(),
        lineMessage
      }, profile);
      setSelectedIds(new Set());
      await reload();
      setTab('history');
      setExpandedBatchIds(new Set([batch.id]));
      pushToast({ type: 'success', title: `已建立送刻批次 ${batch.batch_no}` });
    } catch (err) {
      pushToast({ type: 'error', title: '建立送刻批次失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setCreatingBatch(false);
    }
  }

  function changeStampType(id: string, value: string) {
    const preset = stampPreset(value);
    patchDraft(id, { stamp_type: value, spec_note: preset.spec, unit_price: String(preset.price) });
  }

  const inputStyle = { minHeight: 36, padding: '6px 8px', fontSize: 13 } as const;
  const tableStyle = { width: '100%', borderCollapse: 'collapse' as const, tableLayout: 'fixed' as const };
  const thStyle = { background: '#eef3e9', color: '#315985', padding: '8px 6px', borderBottom: '1px solid #dce5d4', fontSize: 13, textAlign: 'left' as const };
  const tdStyle = { padding: '7px 6px', borderBottom: '1px solid #e7ece3', verticalAlign: 'top' as const };

  return (
    <div className="page-content">
      <PageHeader title="印章送刻" description="印章送刻登記、列印簽收單、部門印章數與金額、LINE 訊息及已送刻批次紀錄。" />
      <div className="tabs">
        <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>待送刻</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>已送刻批次</button>
      </div>

      {tab === 'pending' ? (
        <>
          <section className="card full-width-card" style={{ padding: 16, marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))', gap: 12 }}>
              <div style={{ border: '1px solid #d6e3d0', borderRadius: 14, padding: 14, background: '#f4faf2' }}><div style={{ color: '#638069', fontSize: 12, fontWeight: 800 }}>一部</div><strong style={{ display: 'block', fontSize: 22, marginTop: 4 }}>{pendingStats.one.count} 顆｜${formatMoney(pendingStats.one.amount)}</strong></div>
              <div style={{ border: '1px solid #eadba9', borderRadius: 14, padding: 14, background: '#fffaf0' }}><div style={{ color: '#8b741f', fontSize: 12, fontWeight: 800 }}>二部</div><strong style={{ display: 'block', fontSize: 22, marginTop: 4 }}>{pendingStats.two.count} 顆｜${formatMoney(pendingStats.two.amount)}</strong></div>
              <div style={{ border: '1px solid #d8e0ec', borderRadius: 14, padding: 14, background: '#f7f9fc' }}><div style={{ color: '#66748a', fontSize: 12, fontWeight: 800 }}>待送刻總數</div><strong style={{ display: 'block', fontSize: 22, marginTop: 4 }}>{pendingStats.totalCount} 顆</strong></div>
              <div style={{ border: '1px solid #d8e0ec', borderRadius: 14, padding: 14, background: '#f7f9fc' }}><div style={{ color: '#66748a', fontSize: 12, fontWeight: 800 }}>待送刻總金額</div><strong style={{ display: 'block', fontSize: 22, marginTop: 4 }}>${formatMoney(pendingStats.totalAmount)}</strong></div>
            </div>
          </section>

          <section className="card full-width-card" style={{ padding: 16 }}>
            <div className="toolbar-row" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="primary-button" onClick={addRow}>＋ 新增印章</button>
                <button type="button" className="secondary-button" onClick={toggleAll}>{selectedIds.size === pendingOrders.length && pendingOrders.length ? '取消全選' : '全選待送刻'}</button>
                <button type="button" className="secondary-button" onClick={() => printReceipt()}>列印簽收單</button>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="secondary-button" onClick={() => openLineMessage()}>LINE 訊息</button>
                <button type="button" className="primary-button" disabled={creatingBatch} onClick={markSent}>{creatingBatch ? '建立中...' : '建立已送刻批次'}</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '160px 220px 120px', gap: 12, marginBottom: 12, alignItems: 'end' }}>
              <label><span>希望送達日</span><input style={inputStyle} type="date" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} /></label>
              <label><span>送刻者</span><select style={inputStyle} value={senderName} onChange={(e) => changeSender(e.target.value)}><option value="">請選擇</option>{SENDER_OPTIONS.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
              <label><span>分機</span><input style={inputStyle} value={senderExtension} readOnly placeholder="自動帶入" /></label>
            </div>

            <div className="subtle-text" style={{ marginBottom: 10 }}>自動帶入：林莞、奕君、佩珊＝二部；嘉陽、詩涵、晏婷＝一部；若儀的部門請手動選擇。日期預設為今天，所有欄位新增後皆可自行修改或刪除。</div>

            <div style={{ border: '1px solid #dce5d4', borderRadius: 14, padding: 12, marginBottom: 14, background: '#fafcf8' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <div><strong style={{ color: '#315985' }}>整批複製貼上</strong><div className="subtle-text">貼上什麼就先帶入什麼，不再因缺少其他欄位擋住。只貼 1 欄＝姓名／內容；2 欄＝雇主｜姓名／內容；若貼上含標題的多欄資料，會依標題自動對應。沒貼到的欄位才使用系統預設值，新增後可逐筆手動修改。</div></div>
                <button type="button" className="primary-button" disabled={importingPaste} onClick={importPasteRows}>{importingPaste ? '新增中...' : '批次新增'}</button>
              </div>
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={6} placeholder={'雇主\t工人姓名 / 內容\n宏電\t阿沙里\n美德耐\t黃美奈秀'} style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
            </div>

            <datalist id="stamp-admin-options">
              {adminOptions.map((admin) => <option key={admin.id} value={admin.display_name} />)}
              {SENDER_OPTIONS.map((item) => <option key={`sender-${item.name}`} value={item.name} />)}
            </datalist>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ ...tableStyle, minWidth: 1480 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 42 }}></th>
                    <th style={{ ...thStyle, width: 110 }}>送刻日期</th>
                    <th style={{ ...thStyle, width: 90 }}>部門</th>
                    <th style={{ ...thStyle, width: 130 }}>行政</th>
                    <th style={{ ...thStyle, width: 190 }}>雇主</th>
                    <th style={{ ...thStyle, width: 190 }}>工人姓名 / 內容</th>
                    <th style={{ ...thStyle, width: 160 }}>印章種類</th>
                    <th style={{ ...thStyle, width: 180 }}>規格 / 備註</th>
                    <th style={{ ...thStyle, width: 75 }}>數量</th>
                    <th style={{ ...thStyle, width: 85 }}>單價</th>
                    <th style={{ ...thStyle, width: 95 }}>金額</th>
                    <th style={{ ...thStyle, width: 140 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingOrders.length ? pendingOrders.map((order) => {
                    const draft = drafts[order.id] ?? orderToDraft(order);
                    const amount = Number(draft.quantity || 0) * Number(draft.unit_price || 0);
                    return (
                      <tr key={order.id}>
                        <td style={tdStyle}><input type="checkbox" checked={selectedIds.has(order.id)} onChange={() => toggleSelected(order.id)} /></td>
                        <td style={tdStyle}><input style={inputStyle} type="date" value={draft.stamp_date} onChange={(e) => patchDraft(order.id, { stamp_date: e.target.value })} /></td>
                        <td style={tdStyle}><select style={inputStyle} value={draft.department} onChange={(e) => patchDraft(order.id, { department: e.target.value })}><option value="">請選擇</option>{DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}</select></td>
                        <td style={tdStyle}><input style={inputStyle} list="stamp-admin-options" value={draft.admin_name} onChange={(e) => { const adminName = e.target.value; const mappedDepartment = defaultDepartmentForAdmin(adminName); patchDraft(order.id, { admin_name: adminName, ...(mappedDepartment ? { department: mappedDepartment } : {}) }); }} placeholder="行政" /></td>
                        <td style={tdStyle}><input style={inputStyle} value={draft.employer_department} onChange={(e) => patchDraft(order.id, { employer_department: e.target.value })} /></td>
                        <td style={tdStyle}><input style={inputStyle} value={draft.name_content} onChange={(e) => patchDraft(order.id, { name_content: e.target.value })} /></td>
                        <td style={tdStyle}><select style={inputStyle} value={draft.stamp_type} onChange={(e) => changeStampType(order.id, e.target.value)}>{STAMP_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></td>
                        <td style={tdStyle}>{draft.stamp_type === '木頭章' ? <span style={{ color: '#9aa4b2' }}>—</span> : <input style={inputStyle} value={draft.spec_note} onChange={(e) => patchDraft(order.id, { spec_note: e.target.value })} />}</td>
                        <td style={tdStyle}><input style={inputStyle} inputMode="numeric" value={draft.quantity} onChange={(e) => patchDraft(order.id, { quantity: e.target.value.replace(/\D/g, '') })} /></td>
                        <td style={tdStyle}><input style={inputStyle} inputMode="numeric" value={draft.unit_price} onChange={(e) => patchDraft(order.id, { unit_price: e.target.value.replace(/[^\d.]/g, '') })} /></td>
                        <td style={{ ...tdStyle, fontWeight: 900, color: '#27548a', whiteSpace: 'nowrap' }}>${formatMoney(amount)}</td>
                        <td style={tdStyle}><div style={{ display: 'flex', gap: 6 }}><button type="button" className="secondary-button mini" disabled={savingId === order.id} onClick={() => saveRow(order)}>{savingId === order.id ? '儲存中' : '儲存'}</button><button type="button" className="danger-button mini" onClick={() => removeRow(order)}>刪除</button></div></td>
                      </tr>
                    );
                  }) : <tr><td colSpan={12} style={{ padding: 26, textAlign: 'center', color: '#7b8494' }}>目前沒有待送刻資料。</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="subtle-text" style={{ marginTop: 10 }}>印章種類預設：木頭章 $40（不顯示規格備註）；連續章（姓名章）規格長 1.2 × 寬 0.8；藍色連續章 $140、不加框、長 3 × 寬 1。除木頭章外，其他印章依部門各自統一開一張收據。特殊印章與其他連續章單價仍可依實際報價調整。</p>
          </section>
        </>
      ) : (
        <section className="card full-width-card" style={{ padding: 16 }}>
          {sentBatches.length ? sentBatches.map((batch: StampBatch) => {
            const expanded = expandedBatchIds.has(batch.id);
            const rows = data.stampOrders.filter((order) => order.batch_id === batch.id && !order.deleted_at);
            return (
              <article key={batch.id} style={{ border: '1px solid #dbe4d6', borderRadius: 16, marginBottom: 12, overflow: 'hidden', background: '#fff' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 170px 130px 180px 1fr auto', gap: 14, alignItems: 'center', padding: 14 }}>
                  <button type="button" className="secondary-button mini" onClick={() => setExpandedBatchIds((current) => { const next = new Set(current); if (next.has(batch.id)) next.delete(batch.id); else next.add(batch.id); return next; })}>{expanded ? '收合' : '展開'}</button>
                  <strong style={{ color: '#2f6198', fontSize: 18 }}>{batch.batch_no}</strong>
                  <div><span style={{ display: 'block', color: '#7b8494', fontSize: 11 }}>送刻日期</span><b>{formatDate(batch.sent_date)}</b></div>
                  <div><span style={{ display: 'block', color: '#7b8494', fontSize: 11 }}>送刻者</span><b>{batch.sender_name}</b></div>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}><span>一部 {batch.dept1_count} 顆｜${formatMoney(batch.dept1_amount)}</span><span>二部 {batch.dept2_count} 顆｜${formatMoney(batch.dept2_amount)}</span><strong>總計 {batch.total_count} 顆｜${formatMoney(batch.total_amount)}</strong></div>
                  <div style={{ display: 'flex', gap: 8 }}><button type="button" className="secondary-button mini" onClick={() => openLineMessage(makeLineMessage({ senderName: batch.sender_name, senderExtension: batch.sender_extension ?? '', requiredDate: batch.required_date, orders: rows.map((row) => { const draft = drafts[row.id]; return draft ? { ...row, department: draft.department, name_content: draft.name_content, quantity: Number(draft.quantity || 0), unit_price: Number(draft.unit_price || 0) } as StampOrder : row; }) }))}>LINE 訊息</button><button type="button" className="secondary-button mini" onClick={() => printReceipt(rows)}>列印簽收單</button></div>
                </div>
                {expanded ? (
                  <div style={{ borderTop: '1px solid #e7ece3', padding: 14, overflowX: 'auto' }}>
                    <table style={{ ...tableStyle, minWidth: 1450 }}>
                      <thead><tr><th style={thStyle}>送刻日期</th><th style={thStyle}>部門</th><th style={thStyle}>行政</th><th style={thStyle}>雇主</th><th style={thStyle}>工人姓名 / 內容</th><th style={thStyle}>印章種類</th><th style={thStyle}>規格 / 備註</th><th style={thStyle}>數量</th><th style={thStyle}>單價</th><th style={thStyle}>金額</th><th style={thStyle}>操作</th></tr></thead>
                      <tbody>{rows.map((row) => {
                        const draft = drafts[row.id] ?? orderToDraft(row);
                        const amount = Number(draft.quantity || 0) * Number(draft.unit_price || 0);
                        return <tr key={row.id}>
                          <td style={tdStyle}><input style={inputStyle} type="date" value={draft.stamp_date} onChange={(e) => patchDraft(row.id, { stamp_date: e.target.value })} /></td>
                          <td style={tdStyle}><select style={inputStyle} value={draft.department} onChange={(e) => patchDraft(row.id, { department: e.target.value })}><option value="">請選擇</option>{DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}</select></td>
                          <td style={tdStyle}><input style={inputStyle} value={draft.admin_name} onChange={(e) => { const adminName = e.target.value; const mappedDepartment = defaultDepartmentForAdmin(adminName); patchDraft(row.id, { admin_name: adminName, ...(mappedDepartment ? { department: mappedDepartment } : {}) }); }} /></td>
                          <td style={tdStyle}><input style={inputStyle} value={draft.employer_department} onChange={(e) => patchDraft(row.id, { employer_department: e.target.value })} /></td>
                          <td style={tdStyle}><input style={inputStyle} value={draft.name_content} onChange={(e) => patchDraft(row.id, { name_content: e.target.value })} /></td>
                          <td style={tdStyle}><select style={inputStyle} value={draft.stamp_type} onChange={(e) => changeStampType(row.id, e.target.value)}>{STAMP_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></td>
                          <td style={tdStyle}>{draft.stamp_type === '木頭章' ? <span style={{ color: '#9aa4b2' }}>—</span> : <input style={inputStyle} value={draft.spec_note} onChange={(e) => patchDraft(row.id, { spec_note: e.target.value })} />}</td>
                          <td style={tdStyle}><input style={inputStyle} inputMode="numeric" value={draft.quantity} onChange={(e) => patchDraft(row.id, { quantity: e.target.value.replace(/\D/g, '') })} /></td>
                          <td style={tdStyle}><input style={inputStyle} inputMode="numeric" value={draft.unit_price} onChange={(e) => patchDraft(row.id, { unit_price: e.target.value.replace(/[^\d.]/g, '') })} /></td>
                          <td style={{ ...tdStyle, fontWeight: 900, color: '#27548a', whiteSpace: 'nowrap' }}>${formatMoney(amount)}</td>
                          <td style={tdStyle}><div style={{ display: 'flex', gap: 6 }}><button type="button" className="secondary-button mini" disabled={savingId === row.id} onClick={() => saveRow(row)}>{savingId === row.id ? '儲存中' : '儲存'}</button><button type="button" className="danger-button mini" onClick={() => removeRow(row)}>刪除</button></div></td>
                        </tr>;
                      })}</tbody>
                    </table>
                  </div>
                ) : null}
              </article>
            );
          }) : <div style={{ padding: 28, textAlign: 'center', color: '#7b8494' }}>目前沒有已送刻批次紀錄。</div>}
        </section>
      )}
      {linePreview !== null ? (
        <Modal title="LINE 訊息" onClose={() => setLinePreview(null)}>
          <textarea
            value={linePreview}
            readOnly
            rows={12}
            style={{ width: '100%', resize: 'vertical', minHeight: 260, lineHeight: 1.65, fontSize: 14 }}
          />
          <div className="form-actions" style={{ marginTop: 12 }}>
            <button type="button" className="secondary-button" onClick={() => copyLineText(linePreview)}>再次複製</button>
            <button type="button" className="primary-button" onClick={() => setLinePreview(null)}>完成</button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
