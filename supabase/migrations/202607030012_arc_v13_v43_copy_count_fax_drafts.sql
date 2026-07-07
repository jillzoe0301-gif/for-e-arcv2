-- ARC V13.43｜張數欄位與傳真領件暫存修正

alter table public.arc_cases
  add column if not exists copy_count integer not null default 1;

update public.arc_cases
set copy_count = 1
where copy_count is null or copy_count < 1;

alter table public.fax_pickup_items
  add column if not exists copy_count integer not null default 1;

update public.fax_pickup_items f
set copy_count = coalesce(nullif(f.copy_count, 0), c.copy_count, 1)
from public.arc_cases c
where f.case_id = c.id
  and (f.copy_count is null or f.copy_count < 1);

alter table public.fax_pickup_items
  alter column copy_count set default 1;

-- 清除舊版未加入預計領件卻殘留在案件主檔的傳真 keyin 暫存欄位。
-- 已在預計領件區、已領件、或已有正式傳真領件紀錄的資料不會被清除。
update public.arc_cases c
set receipt_no = null,
    foreign_no_last5 = null,
    receipt_order = null,
    handler_last4 = null,
    old_card_checked = null,
    fax_date = null,
    expected_pickup_date = null,
    updated_at = now()
where c.status::text in ('pending_pickup', 'not_received')
  and not exists (
    select 1
    from public.fax_pickup_items f
    where f.case_id = c.id
      and f.status::text = 'pending'
      and f.deleted_at is null
  )
  and not exists (
    select 1
    from public.pickup_record_items pri
    where pri.case_id = c.id
  );
