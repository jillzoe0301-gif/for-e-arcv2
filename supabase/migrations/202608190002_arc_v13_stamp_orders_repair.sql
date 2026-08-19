-- ARC V13.51.8.15：印章送刻新增失敗修復
-- 此檔可重複執行；即使 V13.51.8.14 的 migration 未執行，也可直接建立所需物件。

create table if not exists public.stamp_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no text not null unique,
  sent_date date not null,
  required_date date not null,
  sender_name text not null default '',
  sender_extension text not null default '',
  dept1_count integer not null default 0,
  dept1_amount numeric(12,2) not null default 0,
  dept2_count integer not null default 0,
  dept2_amount numeric(12,2) not null default 0,
  total_count integer not null default 0,
  total_amount numeric(12,2) not null default 0,
  line_message text,
  status text not null default 'sent' check (status in ('sent','cancelled')),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.stamp_orders (
  id uuid primary key default gen_random_uuid(),
  stamp_date date not null default current_date,
  department text not null default '' check (department in ('','一部','二部')),
  admin_name text not null default '',
  employer_department text not null default '',
  name_content text not null default '',
  stamp_type text not null default '木頭章',
  spec_note text,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 40 check (unit_price >= 0),
  status text not null default 'pending' check (status in ('pending','sent','cancelled')),
  batch_id uuid references public.stamp_batches(id),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_stamp_orders_status_date on public.stamp_orders(status, stamp_date desc);
create index if not exists idx_stamp_orders_batch_id on public.stamp_orders(batch_id);
create index if not exists idx_stamp_batches_sent_date on public.stamp_batches(sent_date desc);

-- 確保 API 角色具備資料表權限；實際可操作範圍仍由 RLS 限制。
grant select, insert, update, delete on table public.stamp_orders to authenticated;
grant select, insert, update, delete on table public.stamp_batches to authenticated;

alter table public.stamp_orders enable row level security;
alter table public.stamp_batches enable row level security;

drop policy if exists stamp_orders_select on public.stamp_orders;
create policy stamp_orders_select on public.stamp_orders for select to authenticated using (deleted_at is null);
drop policy if exists stamp_orders_insert on public.stamp_orders;
create policy stamp_orders_insert on public.stamp_orders for insert to authenticated with check (public.is_staff_or_admin());
drop policy if exists stamp_orders_update on public.stamp_orders;
create policy stamp_orders_update on public.stamp_orders for update to authenticated using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());
drop policy if exists stamp_orders_delete on public.stamp_orders;
create policy stamp_orders_delete on public.stamp_orders for delete to authenticated using (public.is_staff_or_admin());

drop policy if exists stamp_batches_select on public.stamp_batches;
create policy stamp_batches_select on public.stamp_batches for select to authenticated using (deleted_at is null);
drop policy if exists stamp_batches_insert on public.stamp_batches;
create policy stamp_batches_insert on public.stamp_batches for insert to authenticated with check (public.is_staff_or_admin());
drop policy if exists stamp_batches_update on public.stamp_batches;
create policy stamp_batches_update on public.stamp_batches for update to authenticated using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create or replace function public.next_stamp_batch_no(p_sent_date date)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_prefix text;
  v_seq integer;
begin
  perform pg_advisory_xact_lock(hashtext('stamp_batch:' || p_sent_date::text));
  v_prefix := 'ST' || to_char(p_sent_date, 'YYYYMMDD');
  select coalesce(max(nullif(substring(batch_no from length(v_prefix) + 1), '')::integer), 0) + 1
    into v_seq
    from public.stamp_batches
   where batch_no like v_prefix || '%';
  return v_prefix || lpad(v_seq::text, 2, '0');
end;
$$;

create or replace function public.create_stamp_batch(
  p_order_ids uuid[],
  p_sent_date date,
  p_required_date date,
  p_sender_name text,
  p_sender_extension text,
  p_line_message text
)
returns public.stamp_batches
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch public.stamp_batches;
  v_count integer;
  v_dept1_count integer;
  v_dept1_amount numeric(12,2);
  v_dept2_count integer;
  v_dept2_amount numeric(12,2);
  v_total_count integer;
  v_total_amount numeric(12,2);
begin
  if coalesce(array_length(p_order_ids, 1), 0) = 0 then
    raise exception '沒有選取印章資料';
  end if;

  select count(*),
         coalesce(sum(quantity) filter (where department = '一部'), 0),
         coalesce(sum(quantity * unit_price) filter (where department = '一部'), 0),
         coalesce(sum(quantity) filter (where department = '二部'), 0),
         coalesce(sum(quantity * unit_price) filter (where department = '二部'), 0),
         coalesce(sum(quantity), 0),
         coalesce(sum(quantity * unit_price), 0)
    into v_count, v_dept1_count, v_dept1_amount, v_dept2_count, v_dept2_amount, v_total_count, v_total_amount
    from public.stamp_orders
   where id = any(p_order_ids)
     and status = 'pending'
     and deleted_at is null;

  if v_count <> array_length(p_order_ids, 1) then
    raise exception '部分印章資料已不在待送刻狀態，請重新整理後再操作';
  end if;

  insert into public.stamp_batches(
    batch_no, sent_date, required_date, sender_name, sender_extension,
    dept1_count, dept1_amount, dept2_count, dept2_amount, total_count, total_amount,
    line_message, created_by, updated_by
  ) values (
    public.next_stamp_batch_no(p_sent_date), p_sent_date, p_required_date, coalesce(p_sender_name,''), coalesce(p_sender_extension,''),
    v_dept1_count, v_dept1_amount, v_dept2_count, v_dept2_amount, v_total_count, v_total_amount,
    p_line_message, auth.uid(), auth.uid()
  ) returning * into v_batch;

  update public.stamp_orders
     set status = 'sent', batch_id = v_batch.id, updated_by = auth.uid()
   where id = any(p_order_ids)
     and status = 'pending'
     and deleted_at is null;

  return v_batch;
end;
$$;

grant execute on function public.next_stamp_batch_no(date) to authenticated;
grant execute on function public.create_stamp_batch(uuid[],date,date,text,text,text) to authenticated;

-- PostgREST schema cache refresh
notify pgrst, 'reload schema';
