-- ARC V13 V30 居留證繳費：金額修改、待繳移除、扣款帳戶預設值

-- 1) 案件狀態新增：已從繳費頁移除
do $$ begin
  alter type public.case_status add value if not exists 'removed_from_payment';
exception when duplicate_object then null; end $$;

-- 2) 帳戶新增預設扣款帳戶欄位
alter table public.bank_accounts
add column if not exists is_default boolean not null default false;

-- 3) 每個仲介至少帶入一個預設帳戶，避免多帳戶時無法自動帶入
with first_enabled as (
  select distinct on (broker_id) id, broker_id
  from public.bank_accounts
  where deleted_at is null and is_enabled = true
  order by broker_id, created_at asc, account_name asc
), brokers_without_default as (
  select f.id
  from first_enabled f
  where not exists (
    select 1
    from public.bank_accounts a
    where a.broker_id = f.broker_id
      and a.deleted_at is null
      and a.is_enabled = true
      and coalesce(a.is_default, false) = true
  )
)
update public.bank_accounts a
set is_default = true
where a.id in (select id from brokers_without_default);

-- 4) 操作紀錄可保留前端寫入的金額修改 / 待繳刪除紀錄；本 SQL 不會刪除既有金流。
