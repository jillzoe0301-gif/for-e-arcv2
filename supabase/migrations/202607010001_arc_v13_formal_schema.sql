-- ARC 居留證控管系統 V13 Formal Schema
-- 先在 Supabase SQL Editor 執行本檔，再執行 scripts/seed-users.mjs 建立 Auth 帳號。

create extension if not exists pgcrypto;

-- ===== enums =====
do $$ begin
  create type public.app_role as enum ('admin', 'staff', 'finance');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.case_status as enum (
    'pending_payment',
    'paid',
    'pending_pickup',
    'archive_registered',
    'archive_paid',
    'cancelled',
    'not_received',
    'completed',
    'removed_from_payment'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.batch_status as enum ('pending', 'confirmed', 'amount_error', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.pickup_item_status as enum ('pending', 'picked_up', 'not_received', 'cancelled');
exception when duplicate_object then null; end $$;

-- ===== helpers =====
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  role public.app_role not null default 'staff',
  is_active boolean not null default true,
  personnel_id uuid,
  must_change_password boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.current_app_role()
returns public.app_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid() and is_active = true and deleted_at is null
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

create or replace function public.is_finance_or_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_app_role() in ('admin','finance'), false)
$$;

create or replace function public.is_staff_or_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_app_role() in ('admin','staff'), false)
$$;

-- ===== core settings =====
create table if not exists public.person_options (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  display_name text not null,
  department text,
  role_text text,
  is_enabled boolean not null default true,
  show_as_handler boolean not null default true,
  show_as_admin boolean not null default true,
  show_as_runner boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

drop trigger if exists trg_person_options_updated_at on public.person_options;
create trigger trg_person_options_updated_at before update on public.person_options
for each row execute function public.set_updated_at();

create table if not exists public.broker_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  full_name text not null,
  code text not null unique,
  phone text,
  print_name text,
  is_enabled boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

drop trigger if exists trg_broker_companies_updated_at on public.broker_companies;
create trigger trg_broker_companies_updated_at before update on public.broker_companies
for each row execute function public.set_updated_at();

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid not null references public.broker_companies(id),
  account_name text not null,
  bank_code text not null,
  bank_name text not null,
  account_no text not null,
  account_last5 text generated always as (right(regexp_replace(account_no, '\\D', '', 'g'), 5)) stored,
  initial_balance numeric(14,2) not null default 0,
  current_balance numeric(14,2) not null default 0,
  is_enabled boolean not null default true,
  is_default boolean not null default false,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

drop trigger if exists trg_bank_accounts_updated_at on public.bank_accounts;
create trigger trg_bank_accounts_updated_at before update on public.bank_accounts
for each row execute function public.set_updated_at();

create table if not exists public.application_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_amount numeric(12,2) not null default 0,
  is_enabled boolean not null default true,
  requires_payment boolean not null default true,
  enters_fax_pickup boolean not null default true,
  enters_finance boolean not null default true,
  included_in_stats boolean not null default true,
  requires_ic_card boolean not null default true,
  requires_old_card boolean not null default false,
  sort_order int not null default 0,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

drop trigger if exists trg_application_items_updated_at on public.application_items;
create trigger trg_application_items_updated_at before update on public.application_items
for each row execute function public.set_updated_at();

create table if not exists public.fee_settings (
  id uuid primary key default gen_random_uuid(),
  fee_name text not null,
  amount numeric(12,2) not null default 0,
  broker_id uuid references public.broker_companies(id),
  application_item_id uuid references public.application_items(id),
  is_enabled boolean not null default true,
  include_in_finance_search boolean not null default true,
  include_in_reconciliation boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

drop trigger if exists trg_fee_settings_updated_at on public.fee_settings;
create trigger trg_fee_settings_updated_at before update on public.fee_settings
for each row execute function public.set_updated_at();

create table if not exists public.arc_settings (
  id uuid primary key default gen_random_uuid(),
  setting_group text not null,
  setting_key text not null,
  setting_value jsonb not null default '{}'::jsonb,
  is_enabled boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(setting_group, setting_key)
);

drop trigger if exists trg_arc_settings_updated_at on public.arc_settings;
create trigger trg_arc_settings_updated_at before update on public.arc_settings
for each row execute function public.set_updated_at();

-- ===== case/payment/fax data =====
create table if not exists public.serial_counters (
  kind text not null,
  prefix text not null,
  date_key text not null,
  current_value int not null default 0,
  updated_at timestamptz not null default now(),
  primary key(kind, prefix, date_key)
);

create or replace function public.next_serial(
  p_kind text,
  p_prefix text,
  p_date_key text,
  p_padding int default 3,
  p_head text default ''
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value int;
begin
  insert into public.serial_counters(kind, prefix, date_key, current_value)
  values (p_kind, p_prefix, p_date_key, 1)
  on conflict (kind, prefix, date_key)
  do update set current_value = public.serial_counters.current_value + 1, updated_at = now()
  returning current_value into next_value;

  return p_head || p_prefix || p_date_key || lpad(next_value::text, p_padding, '0');
end;
$$;

create or replace function public.next_case_no(p_broker_code text, p_application_date date default current_date)
returns text
language sql
security definer
set search_path = public
as $$
  select public.next_serial('case', upper(p_broker_code), to_char(coalesce(p_application_date, current_date), 'YYYYMMDD'), 3, 'ARC')
$$;

create or replace function public.next_payment_batch_no(p_broker_code text, p_payment_date date default current_date)
returns text
language sql
security definer
set search_path = public
as $$
  select public.next_serial('payment_batch', upper(p_broker_code), to_char(coalesce(p_payment_date, current_date), 'YYYYMMDD'), 3, '')
$$;

create or replace function public.next_pickup_record_no(p_pickup_date date default current_date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date_key text;
  v_raw text;
begin
  v_date_key := to_char(coalesce(p_pickup_date, current_date), 'YYYYMMDD');
  v_raw := public.next_serial('pickup_record', '', v_date_key, 2, 'P');
  return left(v_raw, 9) || '-' || right(v_raw, 2);
end;
$$;

create table if not exists public.arc_cases (
  id uuid primary key default gen_random_uuid(),
  case_no text not null unique,
  handler_name text not null,
  broker_id uuid not null references public.broker_companies(id),
  employer_name text not null,
  worker_name text not null,
  entry_date date,
  application_date date not null,
  group_no text,
  application_item_id uuid not null references public.application_items(id),
  amount numeric(12,2) not null default 0,
  status public.case_status not null default 'pending_payment',
  payment_batch_id uuid,
  payment_date date,
  payment_account_id uuid references public.bank_accounts(id),
  cancelled_reason text,
  cancelled_by uuid references auth.users(id),
  cancelled_at timestamptz,
  receipt_no text,
  foreign_no_last5 text,
  receipt_order int,
  fax_date date,
  expected_pickup_date date,
  pickup_record_id uuid,
  pickup_status public.pickup_item_status,
  note text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_arc_cases_status on public.arc_cases(status);
create index if not exists idx_arc_cases_broker on public.arc_cases(broker_id);
create index if not exists idx_arc_cases_application_date on public.arc_cases(application_date);
create index if not exists idx_arc_cases_payment_batch on public.arc_cases(payment_batch_id);

drop trigger if exists trg_arc_cases_updated_at on public.arc_cases;
create trigger trg_arc_cases_updated_at before update on public.arc_cases
for each row execute function public.set_updated_at();

create table if not exists public.payment_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no text not null unique,
  broker_id uuid not null references public.broker_companies(id),
  account_id uuid not null references public.bank_accounts(id),
  payment_date date not null,
  payer_name text not null,
  total_amount numeric(14,2) not null default 0,
  case_count int not null default 0,
  status public.batch_status not null default 'pending',
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

drop trigger if exists trg_payment_batches_updated_at on public.payment_batches;
create trigger trg_payment_batches_updated_at before update on public.payment_batches
for each row execute function public.set_updated_at();

create table if not exists public.payment_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.payment_batches(id),
  case_id uuid not null references public.arc_cases(id),
  original_application_item_id uuid references public.application_items(id),
  original_amount numeric(12,2) not null default 0,
  corrected_application_item_id uuid references public.application_items(id),
  corrected_amount numeric(12,2),
  correction_reason text,
  corrected_by uuid references auth.users(id),
  corrected_at timestamptz,
  created_at timestamptz not null default now(),
  unique(batch_id, case_id)
);

create table if not exists public.account_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.bank_accounts(id),
  txn_type text not null,
  amount numeric(14,2) not null,
  balance_before numeric(14,2) not null,
  balance_after numeric(14,2) not null,
  ref_table text,
  ref_id uuid,
  reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.fax_pickup_items (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.arc_cases(id),
  receipt_no text not null,
  foreign_no_last5 text not null,
  receipt_order int not null,
  fax_date date not null,
  expected_pickup_date date not null,
  status public.pickup_item_status not null default 'pending',
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists ux_fax_pickup_pending_case
on public.fax_pickup_items(case_id)
where status = 'pending' and deleted_at is null;

create unique index if not exists ux_fax_pickup_receipt_order
on public.fax_pickup_items(expected_pickup_date, receipt_order)
where status = 'pending' and deleted_at is null;

drop trigger if exists trg_fax_pickup_items_updated_at on public.fax_pickup_items;
create trigger trg_fax_pickup_items_updated_at before update on public.fax_pickup_items
for each row execute function public.set_updated_at();

create table if not exists public.pickup_records (
  id uuid primary key default gen_random_uuid(),
  record_no text not null unique,
  pickup_date date not null,
  created_by uuid references auth.users(id),
  created_by_name text,
  case_count int not null default 0,
  created_at timestamptz not null default now(),
  deleted_by uuid references auth.users(id),
  deleted_at timestamptz,
  delete_reason text
);

create table if not exists public.pickup_record_items (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.pickup_records(id),
  case_id uuid not null references public.arc_cases(id),
  status public.pickup_item_status not null default 'picked_up',
  not_received_at timestamptz,
  not_received_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(record_id, case_id)
);

-- ===== contacts =====
create table if not exists public.immigration_service_stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  address text,
  phone text,
  fax text,
  note text,
  is_enabled boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

drop trigger if exists trg_immigration_service_stations_updated_at on public.immigration_service_stations;
create trigger trg_immigration_service_stations_updated_at before update on public.immigration_service_stations
for each row execute function public.set_updated_at();

create table if not exists public.task_force_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  address text,
  phone text,
  fax text,
  note text,
  is_enabled boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

drop trigger if exists trg_task_force_contacts_updated_at on public.task_force_contacts;
create trigger trg_task_force_contacts_updated_at before update on public.task_force_contacts
for each row execute function public.set_updated_at();

-- ===== audit / recycle =====
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  actor_id uuid references auth.users(id),
  actor_name text,
  page_name text,
  record_table text,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_action_type on public.audit_logs(action_type);

create table if not exists public.deleted_records (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  data jsonb not null,
  deleted_by uuid references auth.users(id),
  deleted_by_name text,
  deleted_at timestamptz not null default now(),
  restored_by uuid references auth.users(id),
  restored_at timestamptz,
  restore_reason text
);

-- ===== seed data =====
insert into public.broker_companies(name, full_name, code, print_name, is_enabled)
values
  ('灃康', '灃康人力資源股份有限公司', 'FW', '灃康人力資源股份有限公司', true),
  ('乾坤', '乾坤國際股份有限公司', 'WC', '乾坤國際股份有限公司', true),
  ('灃禾', '灃禾管理顧問股份有限公司', 'FC', '灃禾管理顧問股份有限公司', true)
on conflict (code) do update set
  name = excluded.name,
  full_name = excluded.full_name,
  print_name = excluded.print_name,
  is_enabled = excluded.is_enabled;

insert into public.bank_accounts(broker_id, account_name, bank_code, bank_name, account_no, initial_balance, current_balance, is_enabled)
select b.id, x.account_name, x.bank_code, x.bank_name, x.account_no, 0, 0, true
from (values
  ('FW', '灃康｜玉山銀行 808｜0613440008187', '808', '玉山銀行', '0613440008187'),
  ('FW', '灃康｜中國信託 822｜510540554742', '822', '中國信託', '510540554742'),
  ('WC', '乾坤｜台新銀行 812｜20780100008244', '812', '台新銀行', '20780100008244'),
  ('FC', '灃禾｜台新銀行 812｜20060100008723', '812', '台新銀行', '20060100008723')
) as x(code, account_name, bank_code, bank_name, account_no)
join public.broker_companies b on b.code = x.code
where not exists (select 1 from public.bank_accounts a where a.account_no = x.account_no);

insert into public.application_items(
  name, default_amount, is_enabled, requires_payment, enters_fax_pickup, enters_finance, included_in_stats, requires_ic_card, requires_old_card, sort_order
)
values
  ('新入境初次（紙本）', 1000, true, true, false, true, true, false, false, 1),
  ('新入境展延（卡式）', 1000, true, true, true, true, true, true, false, 2),
  ('續聘展延', 1000, true, true, true, true, true, true, true, 3),
  ('承接展延', 1000, true, true, true, true, true, true, true, 4),
  ('換護照展延', 1000, true, true, true, true, true, true, true, 5),
  ('報備不製證', 1000, true, true, false, true, true, false, false, 6),
  ('遺失補發', 500, true, true, true, true, true, true, false, 7),
  ('資料異動', 0, true, false, true, false, true, true, true, 8),
  ('中階居留證', 1000, true, true, true, true, true, true, true, 9),
  ('雙語居留證', 1000, true, true, true, true, true, true, true, 10),
  ('重入境許可', 0, true, false, false, false, true, false, false, 11),
  ('取消申請', 0, true, false, false, false, false, false, false, 12)
on conflict (name) do update set
  default_amount = excluded.default_amount,
  requires_payment = excluded.requires_payment,
  enters_fax_pickup = excluded.enters_fax_pickup,
  enters_finance = excluded.enters_finance,
  included_in_stats = excluded.included_in_stats,
  requires_ic_card = excluded.requires_ic_card,
  requires_old_card = excluded.requires_old_card,
  sort_order = excluded.sort_order,
  is_enabled = true;

insert into public.person_options(name, display_name, department, role_text, is_enabled, show_as_handler, show_as_admin, show_as_runner)
values
  ('若儀', '若儀', '管理', '管理員', true, true, true, true),
  ('嘉陽', '嘉陽', '行政', '管理員', true, true, true, true),
  ('明書', '明書', '行政', '管理員', true, true, true, true),
  ('詩涵', '詩涵', '行政', '行政', true, true, true, true),
  ('佩珊', '佩珊', '行政', '行政', true, true, true, true),
  ('晏婷', '晏婷', '行政', '行政', true, true, true, true),
  ('奕君', '奕君', '行政', '行政', true, true, true, true),
  ('莞莞', '莞莞', '行政', '行政', true, true, true, true),
  ('芸瑄', '芸瑄', '會計', '會計', true, false, false, false),
  ('淑娥', '淑娥', '會計', '會計', true, false, false, false)
on conflict do nothing;

insert into public.arc_settings(setting_group, setting_key, setting_value, is_enabled)
values
  ('reminders', 'weekly', '{"monday":"週一繳費","tuesday":"週二傳真","thursday":"週四領件","paymentNote":"乾坤、灃禾繳費前請先與財務確認。","enabled":true,"color":"#F4AE52","fontSize":18}'::jsonb, true),
  ('fax_pickup', 'rules', '{"defaultPickupRule":"next_week_thursday","receiptOrderRequired":true,"receiptOrderUnique":true,"printBrokerName":"","printPhone":""}'::jsonb, true),
  ('print', 'fields', '{"faxFields":["編號","收費日期","收件編號","IC 卡","張數","經手人後四碼","外字五碼","舊卡","雇主","工人","承辦","收據順序"],"receiptOrderFontDelta":-1,"footerBrokerName":"__________","footerPhone":"__________","footerHandler":"__________","totalCountMode":"總領件數"}'::jsonb, true)
on conflict(setting_group, setting_key) do update set setting_value = excluded.setting_value, is_enabled = excluded.is_enabled;

-- ===== RLS =====
alter table public.profiles enable row level security;
alter table public.person_options enable row level security;
alter table public.broker_companies enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.application_items enable row level security;
alter table public.fee_settings enable row level security;
alter table public.arc_settings enable row level security;
alter table public.serial_counters enable row level security;
alter table public.arc_cases enable row level security;
alter table public.payment_batches enable row level security;
alter table public.payment_batch_items enable row level security;
alter table public.account_transactions enable row level security;
alter table public.fax_pickup_items enable row level security;
alter table public.pickup_records enable row level security;
alter table public.pickup_record_items enable row level security;
alter table public.immigration_service_stations enable row level security;
alter table public.task_force_contacts enable row level security;
alter table public.audit_logs enable row level security;
alter table public.deleted_records enable row level security;

-- Drop existing policies safely
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Profiles
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_insert_admin on public.profiles for insert to authenticated with check (public.is_admin());
create policy profiles_update_admin_or_self on public.profiles for update to authenticated using (public.is_admin() or id = auth.uid()) with check (public.is_admin() or id = auth.uid());

-- Settings read all authenticated; admin writes. Finance can update bank account balances through front-end controlled flow.
create policy settings_select_all on public.person_options for select to authenticated using (deleted_at is null);
create policy settings_write_admin on public.person_options for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy brokers_select_all on public.broker_companies for select to authenticated using (deleted_at is null);
create policy brokers_write_admin on public.broker_companies for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy accounts_select_all on public.bank_accounts for select to authenticated using (deleted_at is null);
create policy accounts_insert_admin on public.bank_accounts for insert to authenticated with check (public.is_admin());
create policy accounts_update_finance_admin on public.bank_accounts for update to authenticated using (public.is_finance_or_admin()) with check (public.is_finance_or_admin());

create policy app_items_select_all on public.application_items for select to authenticated using (deleted_at is null);
create policy app_items_write_admin on public.application_items for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy fee_settings_select_all on public.fee_settings for select to authenticated using (deleted_at is null);
create policy fee_settings_write_admin on public.fee_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy arc_settings_select_all on public.arc_settings for select to authenticated using (true);
create policy arc_settings_write_admin on public.arc_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy serial_admin on public.serial_counters for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Cases: staff/admin can insert/update operational cases; finance/admin can update finance fields.
create policy cases_select_all on public.arc_cases for select to authenticated using (deleted_at is null);
create policy cases_insert_staff_admin on public.arc_cases for insert to authenticated with check (public.is_staff_or_admin());
create policy cases_update_authenticated on public.arc_cases for update to authenticated using (public.current_app_role() is not null) with check (public.current_app_role() is not null);

-- Finance tables
create policy batches_select_finance_admin on public.payment_batches for select to authenticated using (public.is_finance_or_admin());
create policy batches_insert_staff_admin on public.payment_batches for insert to authenticated with check (public.is_staff_or_admin() or public.is_finance_or_admin());
create policy batches_update_finance_admin on public.payment_batches for update to authenticated using (public.is_finance_or_admin()) with check (public.is_finance_or_admin());

create policy batch_items_select_finance_admin on public.payment_batch_items for select to authenticated using (public.is_finance_or_admin());
create policy batch_items_insert_staff_admin on public.payment_batch_items for insert to authenticated with check (public.is_staff_or_admin() or public.is_finance_or_admin());
create policy batch_items_update_finance_admin on public.payment_batch_items for update to authenticated using (public.is_finance_or_admin()) with check (public.is_finance_or_admin());

create policy account_txn_select_finance_admin on public.account_transactions for select to authenticated using (public.is_finance_or_admin());
create policy account_txn_insert_finance_admin on public.account_transactions for insert to authenticated with check (public.is_finance_or_admin());

-- Fax / pickup
create policy fax_items_select_all on public.fax_pickup_items for select to authenticated using (deleted_at is null);
create policy fax_items_write_staff_admin on public.fax_pickup_items for all to authenticated using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy pickup_records_select_all on public.pickup_records for select to authenticated using (deleted_at is null);
create policy pickup_records_insert_staff_admin on public.pickup_records for insert to authenticated with check (public.is_staff_or_admin());
create policy pickup_records_update_admin_staff on public.pickup_records for update to authenticated using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy pickup_record_items_select_all on public.pickup_record_items for select to authenticated using (true);
create policy pickup_record_items_write_staff_admin on public.pickup_record_items for all to authenticated using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

-- Contacts
create policy stations_select_all on public.immigration_service_stations for select to authenticated using (deleted_at is null);
create policy stations_write_admin on public.immigration_service_stations for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy task_force_select_all on public.task_force_contacts for select to authenticated using (deleted_at is null);
create policy task_force_write_admin on public.task_force_contacts for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Audit / deleted records
create policy audit_select_all on public.audit_logs for select to authenticated using (true);
create policy audit_insert_all on public.audit_logs for insert to authenticated with check (true);

create policy deleted_select_admin on public.deleted_records for select to authenticated using (public.is_admin());
create policy deleted_insert_all on public.deleted_records for insert to authenticated with check (true);
create policy deleted_update_admin on public.deleted_records for update to authenticated using (public.is_admin()) with check (public.is_admin());
