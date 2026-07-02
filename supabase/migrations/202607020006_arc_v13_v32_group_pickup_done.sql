-- ARC V13 V32｜團號必填與已領件領件日
-- 目的：新增案件實際領件日欄位，供「已領件」功能與案件查詢顯示。

alter table public.arc_cases
  add column if not exists pickup_date date;

create index if not exists idx_arc_cases_pickup_date on public.arc_cases(pickup_date);
