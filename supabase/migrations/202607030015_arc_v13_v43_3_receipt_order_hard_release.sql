-- ARC V13.43.3｜收據序號硬釋放與防重索引清理
-- 目的：避免已移出預計領件區、已作廢、已取消的舊暫存資料繼續占用同一領件日的收據序號。

-- 1) 移除所有可能以 expected_pickup_date + receipt_order 建立的唯一約束。
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'fax_pickup_items'
      and c.contype in ('u', 'x')
      and pg_get_constraintdef(c.oid) ilike '%expected_pickup_date%'
      and pg_get_constraintdef(c.oid) ilike '%receipt_order%'
  loop
    execute format('alter table public.fax_pickup_items drop constraint if exists %I', r.conname);
  end loop;
end $$;

-- 2) 移除所有可能以 expected_pickup_date + receipt_order 建立的唯一索引。
do $$
declare
  r record;
begin
  for r in
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'fax_pickup_items'
      and indexdef ilike '%unique%'
      and indexdef ilike '%expected_pickup_date%'
      and indexdef ilike '%receipt_order%'
  loop
    execute format('drop index if exists public.%I', r.indexname);
  end loop;
end $$;

-- 3) 移除舊版已知名稱。
drop index if exists public.ux_fax_pickup_receipt_order;
drop index if exists public.ux_fax_pickup_receipt_order_pending;
drop index if exists public.ux_fax_pickup_items_receipt_order;
drop index if exists public.ux_fax_pickup_receipt_order_active;

-- 4) 將不應繼續占用序號的 pending 暫存標記為 cancelled/deleted。
--    只保留：案件仍處於 pending_pickup / not_received，且 pickup_status = pending 的有效預計領件。
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

-- 5) 若案件主檔已經沒有收據序號或領件日，但 fax_pickup_items 仍有 pending，也標記失效。
update public.fax_pickup_items f
set status = 'cancelled',
    deleted_at = coalesce(f.deleted_at, now()),
    updated_at = now()
from public.arc_cases c
where f.case_id = c.id
  and f.status = 'pending'
  and f.deleted_at is null
  and (
    c.receipt_order is null
    or c.expected_pickup_date is null
  );

-- 6) 建立非唯一查詢索引。實際防重由前後端只讀有效資料判斷，避免舊資料卡住序號。
create index if not exists idx_fax_pickup_items_receipt_order_lookup
on public.fax_pickup_items(expected_pickup_date, receipt_order)
where status = 'pending'
  and deleted_at is null
  and receipt_order is not null
  and receipt_order > 0;
