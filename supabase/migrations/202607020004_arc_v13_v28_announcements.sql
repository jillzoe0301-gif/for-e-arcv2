-- ARC V13 V28：公告事項資料表與權限
-- 執行時機：覆蓋 V28 前端後，請先在 Supabase SQL Editor 執行本檔。

create table if not exists public.announcement_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  icon text not null default '公告事項',
  is_enabled boolean not null default true,
  is_pinned boolean not null default false,
  display_pages text[] not null default array['總覽']::text[],
  start_date date,
  end_date date,
  created_by uuid references auth.users(id),
  created_by_name text,
  updated_by uuid references auth.users(id),
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint announcement_items_date_check check (end_date is null or start_date is null or end_date >= start_date)
);

drop trigger if exists trg_announcement_items_updated_at on public.announcement_items;
create trigger trg_announcement_items_updated_at before update on public.announcement_items
for each row execute function public.set_updated_at();

alter table public.announcement_items enable row level security;

drop policy if exists announcement_select_all on public.announcement_items;
create policy announcement_select_all on public.announcement_items
for select to authenticated using (deleted_at is null);

drop policy if exists announcement_insert_staff_admin on public.announcement_items;
create policy announcement_insert_staff_admin on public.announcement_items
for insert to authenticated with check (public.is_staff_or_admin());

drop policy if exists announcement_update_staff_admin on public.announcement_items;
create policy announcement_update_staff_admin on public.announcement_items
for update to authenticated using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create index if not exists idx_announcement_items_display_pages on public.announcement_items using gin(display_pages);
create index if not exists idx_announcement_items_active_dates on public.announcement_items(is_enabled, start_date, end_date);

insert into public.arc_settings(setting_group, setting_key, setting_value, is_enabled)
values ('announcements', 'default_icon', '{"icon":"公告事項"}'::jsonb, true)
on conflict (setting_group, setting_key) do update set setting_value = excluded.setting_value, is_enabled = true;
