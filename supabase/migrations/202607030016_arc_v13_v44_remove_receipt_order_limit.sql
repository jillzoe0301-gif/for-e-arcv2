-- ARC V13.44｜取消收據順序限制
-- 本版取消所有「同一領件日收據順序不可重複」的資料庫限制。
-- 收據順序仍保留輸入、儲存、顯示、排序與列印，但不再作為唯一鍵或鎖定條件。

-- 1) 移除所有 fax_pickup_items 上與 receipt_order 相關的唯一約束。
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
      and pg_get_constraintdef(c.oid) ilike '%receipt_order%'
  loop
    execute format('alter table public.fax_pickup_items drop constraint if exists %I', r.conname);
  end loop;
end $$;

-- 2) 移除所有 fax_pickup_items 上與 receipt_order 相關的唯一索引。
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

-- 4) 保留非唯一查詢/排序索引，不作為限制。
create index if not exists idx_fax_pickup_items_receipt_order_display
on public.fax_pickup_items(expected_pickup_date, receipt_order)
where deleted_at is null
  and receipt_order is not null;

-- 5) 更新系統設定：收據順序仍必填，但不需唯一。
update public.arc_settings
set setting_value = jsonb_set(setting_value, '{receiptOrderUnique}', 'false'::jsonb, true),
    updated_at = now()
where setting_group = 'fax_pickup'
  and setting_key = 'rules';

insert into public.arc_settings(setting_group, setting_key, setting_value, is_enabled)
values ('fax_pickup', 'rules', '{"defaultPickupRule":"next_week_thursday","receiptOrderRequired":true,"receiptOrderUnique":false,"printBrokerName":"","printPhone":""}'::jsonb, true)
on conflict(setting_group, setting_key) do update
set setting_value = jsonb_set(public.arc_settings.setting_value, '{receiptOrderUnique}', 'false'::jsonb, true),
    is_enabled = true,
    updated_at = now();
