-- ARC V13.43.2｜收據序號釋放與防重判斷修正

-- 先移除舊版可能造成「已移除資料仍占用序號」的唯一索引。
drop index if exists public.ux_fax_pickup_receipt_order;
drop index if exists public.ux_fax_pickup_receipt_order_pending;
drop index if exists public.ux_fax_pickup_items_receipt_order;
drop index if exists public.ux_fax_pickup_receipt_order_active;

-- 改用非唯一索引輔助查詢；真正防重由前端/後端邏輯依有效狀態判斷，避免舊暫存誤占用。
create index if not exists idx_fax_pickup_items_receipt_order_lookup
on public.fax_pickup_items(expected_pickup_date, receipt_order)
where status = 'pending'
  and deleted_at is null
  and receipt_order is not null
  and receipt_order > 0;

-- 將已從預計領件移除、或案件不再處於正式預計領件狀態的 pending 暫存標記失效。
-- 這些資料不可再占用同一領件日的收據序號。
update public.fax_pickup_items f
set status = 'cancelled',
    deleted_at = coalesce(f.deleted_at, now()),
    updated_at = now()
from public.arc_cases c
where f.case_id = c.id
  and f.status = 'pending'
  and f.deleted_at is null
  and (
    c.status::text not in ('pending_pickup', 'not_received')
    or coalesce(c.pickup_status::text, '') <> 'pending'
  );

-- 舊資料：若案件主檔已清空收據序號，但仍有 pending 預計領件暫存，也標記失效。
update public.fax_pickup_items f
set status = 'cancelled',
    deleted_at = coalesce(f.deleted_at, now()),
    updated_at = now()
from public.arc_cases c
where f.case_id = c.id
  and f.status = 'pending'
  and f.deleted_at is null
  and c.receipt_order is null;
