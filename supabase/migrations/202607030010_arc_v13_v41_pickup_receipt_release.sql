-- ARC V13.41｜預計領件區移除後收據順序釋放與下一個週四預設修正

-- 舊版曾建立同名但未限定 pending 狀態的唯一索引，會讓已移除 / 已作廢預計領件仍占用收據順序。
-- 先移除舊索引，再改成只鎖定「目前有效待領件」的收據順序。
drop index if exists public.ux_fax_pickup_receipt_order;
create unique index if not exists ux_fax_pickup_receipt_order
on public.fax_pickup_items(expected_pickup_date, receipt_order)
where status = 'pending' and deleted_at is null;

-- 已移除 / 已作廢的舊暫存資料不應再出現在有效待領件資料集中，也不應占用收據序號。
update public.fax_pickup_items
set deleted_at = coalesce(deleted_at, updated_at, now())
where status = 'cancelled'
  and deleted_at is null;

-- 保險修正：已回到傳真領件待處理的案件，不再用舊預計領件的 pickup_status 占用待領狀態。
update public.arc_cases c
set pickup_status = null
where c.status = 'pending_pickup'
  and c.pickup_status = 'pending'
  and not exists (
    select 1
    from public.fax_pickup_items f
    where f.case_id = c.id
      and f.status = 'pending'
      and f.deleted_at is null
  );
