-- ARC V13.42｜修正收據順序誤判重複
-- 目的：收據順序只鎖定目前有效、尚未刪除且仍在預計領件區的資料。
-- 已移除 / 已作廢 / 已刪除 / 已領件完成的資料不再占用同一領件日的收據順序。

-- 移除舊版可能未限制狀態、未排除已刪除資料的唯一索引。
drop index if exists public.ux_fax_pickup_receipt_order;
drop index if exists public.ux_fax_pickup_receipt_order_pending;
drop index if exists public.ux_fax_pickup_items_receipt_order;

-- 只對真正有效的預計領件資料建立防重：同一領件日 + 收據順序不可重複。
create unique index if not exists ux_fax_pickup_receipt_order_active
on public.fax_pickup_items(expected_pickup_date, receipt_order)
where status = 'pending'
  and deleted_at is null
  and receipt_order is not null
  and receipt_order > 0;

-- 已取消 / 已移除的預計領件資料補上 deleted_at，避免舊資料繼續被當成有效占用。
update public.fax_pickup_items
set deleted_at = coalesce(deleted_at, updated_at, now())
where status in ('cancelled', 'removed', 'void')
  and deleted_at is null;

-- 若案件已不是待傳真領件 / 本次未領到，但仍有 pending 暫存，將該暫存標記失效，避免歷史資料占用收據順序。
update public.fax_pickup_items f
set status = 'cancelled',
    deleted_at = coalesce(f.deleted_at, now())
from public.arc_cases c
where f.case_id = c.id
  and f.status = 'pending'
  and f.deleted_at is null
  and c.status not in ('pending_pickup', 'not_received');
