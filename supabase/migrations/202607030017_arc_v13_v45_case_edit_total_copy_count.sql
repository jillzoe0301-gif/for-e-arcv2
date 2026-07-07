-- ARC V13.45｜傳真領件單總張數與案件查詢修改連動

-- 1. 確保案件與傳真領件暫存都有張數欄位。
alter table if exists public.arc_cases
  add column if not exists copy_count integer;

update public.arc_cases
set copy_count = 1
where copy_count is null or copy_count < 1;

alter table if exists public.arc_cases
  alter column copy_count set default 1;
alter table if exists public.arc_cases
  alter column copy_count set not null;

alter table if exists public.arc_cases
  drop constraint if exists arc_cases_copy_count_positive;
alter table if exists public.arc_cases
  add constraint arc_cases_copy_count_positive check (copy_count >= 1);

alter table if exists public.fax_pickup_items
  add column if not exists copy_count integer;

update public.fax_pickup_items f
set copy_count = coalesce(nullif(f.copy_count, 0), c.copy_count, 1)
from public.arc_cases c
where f.case_id = c.id
  and (f.copy_count is null or f.copy_count < 1);

alter table if exists public.fax_pickup_items
  alter column copy_count set default 1;
alter table if exists public.fax_pickup_items
  alter column copy_count set not null;

alter table if exists public.fax_pickup_items
  drop constraint if exists fax_pickup_items_copy_count_positive;
alter table if exists public.fax_pickup_items
  add constraint fax_pickup_items_copy_count_positive check (copy_count >= 1);

-- 2. 傳真領件紀錄增加本次總張數。
do $$
begin
  if to_regclass('public.pickup_records') is not null then
    execute 'alter table public.pickup_records add column if not exists total_copy_count integer';

    update public.pickup_records pr
    set total_copy_count = coalesce(x.total_copy_count, pr.case_count, 0)
    from (
      select pri.record_id, sum(coalesce(nullif(c.copy_count, 0), 1))::integer as total_copy_count
      from public.pickup_record_items pri
      join public.arc_cases c on c.id = pri.case_id
      group by pri.record_id
    ) x
    where x.record_id = pr.id
      and (pr.total_copy_count is null or pr.total_copy_count < 1);

    update public.pickup_records
    set total_copy_count = coalesce(nullif(total_copy_count, 0), case_count, 0)
    where total_copy_count is null or total_copy_count < 1;

    execute 'alter table public.pickup_records alter column total_copy_count set default 0';
    execute 'alter table public.pickup_records alter column total_copy_count set not null';

    execute 'alter table public.pickup_records drop constraint if exists pickup_records_total_copy_count_non_negative';
    execute 'alter table public.pickup_records add constraint pickup_records_total_copy_count_non_negative check (total_copy_count >= 0)';
  end if;
end $$;

-- 3. 常用查詢索引。
create index if not exists idx_payment_batch_items_case_id on public.payment_batch_items(case_id);
create index if not exists idx_fax_pickup_items_case_id_active on public.fax_pickup_items(case_id) where deleted_at is null;

-- 4. 重新整理 Supabase / PostgREST schema cache。
notify pgrst, 'reload schema';
