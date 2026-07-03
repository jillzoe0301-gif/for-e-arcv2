-- ARC V13.39｜傳真領件收費日期、預計領件移除、收據順序防重、修改自己密碼

-- 保留 V38 欄位，避免尚未跑前版 SQL 的環境缺欄位。
alter table public.arc_cases
  add column if not exists old_card_checked boolean,
  add column if not exists handler_last4 text;

alter table public.fax_pickup_items
  add column if not exists old_card_checked boolean,
  add column if not exists handler_last4 text;

-- 同一領件日、待領件狀態下，收據順序不可重複。
create unique index if not exists ux_fax_pickup_receipt_order
on public.fax_pickup_items(expected_pickup_date, receipt_order)
where status = 'pending' and deleted_at is null;

-- 舊版若有其他 pickup_status，取消預計後回到待加入預計時以前端狀態控制，不需新增 enum。
-- 修改自己密碼使用 Supabase Auth updateUser，不保存明文密碼。
