-- ARC V13.40 系統設定刪除、停用、帳號狀態修正
-- 目的：修正系統設定各分類刪除 / 停用失敗，並提供管理員帳號狀態 RPC 後備機制。

create or replace function public.arc_is_settings_table(p_table text)
returns boolean
language sql
immutable
as $$
  select p_table = any(array[
    'profiles',
    'person_options',
    'application_items',
    'fee_settings',
    'broker_companies',
    'bank_accounts',
    'arc_settings',
    'announcement_items',
    'immigration_service_stations',
    'task_force_contacts'
  ]::text[])
$$;

create or replace function public.arc_table_has_column(p_table text, p_column text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = p_column
  )
$$;

create or replace function public.arc_admin_soft_delete_setting(
  p_table text,
  p_id uuid,
  p_page_name text default '系統設定',
  p_reason text default '管理員刪除設定項目'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_old jsonb;
  v_sql text;
begin
  if not public.is_admin() then
    raise exception '您沒有刪除權限。';
  end if;
  if not public.arc_is_settings_table(p_table) then
    raise exception '不支援的系統設定資料表：%', p_table;
  end if;

  select display_name into v_actor_name from public.profiles where id = v_actor_id;

  execute format('select to_jsonb(t) from public.%I t where id = $1', p_table)
    using p_id
    into v_old;
  if v_old is null then
    raise exception '找不到要刪除的設定資料。';
  end if;

  if p_table = 'profiles' then
    if p_id = v_actor_id then
      raise exception '不可刪除目前登入中的帳號。';
    end if;
    if (v_old ->> 'role') = 'admin' then
      if (
        select count(*)
        from public.profiles
        where role = 'admin'
          and is_active = true
          and deleted_at is null
          and id <> p_id
      ) < 1 then
        raise exception '系統至少需保留一個啟用中的管理員帳號。';
      end if;
    end if;
  end if;

  if public.arc_table_has_column(p_table, 'deleted_at') then
    v_sql := format('update public.%I set deleted_at = now()%s%s where id = $1',
      p_table,
      case when public.arc_table_has_column(p_table, 'is_enabled') then ', is_enabled = false' else '' end,
      case when public.arc_table_has_column(p_table, 'updated_by') then ', updated_by = auth.uid()' else '' end
    );
  elsif public.arc_table_has_column(p_table, 'is_enabled') then
    v_sql := format('update public.%I set is_enabled = false%s where id = $1',
      p_table,
      case when public.arc_table_has_column(p_table, 'updated_by') then ', updated_by = auth.uid()' else '' end
    );
  else
    raise exception '此設定資料表沒有可用的刪除 / 停用欄位：%', p_table;
  end if;

  execute v_sql using p_id;

  insert into public.deleted_records(table_name, record_id, data, deleted_by, deleted_by_name)
  values (p_table, p_id, v_old, v_actor_id, v_actor_name);

  insert into public.audit_logs(action_type, actor_id, actor_name, page_name, record_table, record_id, old_data, new_data, reason)
  values ('系統設定刪除', v_actor_id, v_actor_name, coalesce(p_page_name, '系統設定'), p_table, p_id, v_old, jsonb_build_object('deleted_at', now(), 'soft_delete', true), coalesce(p_reason, '管理員刪除設定項目'));

  return jsonb_build_object('ok', true, 'table', p_table, 'id', p_id, 'mode', 'soft_delete');
end;
$$;

create or replace function public.arc_admin_toggle_setting_enabled(
  p_table text,
  p_id uuid,
  p_enabled boolean,
  p_page_name text default '系統設定',
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_old jsonb;
  v_sql text;
begin
  if not public.is_admin() then
    raise exception '您沒有停用或啟用權限。';
  end if;
  if not public.arc_is_settings_table(p_table) then
    raise exception '不支援的系統設定資料表：%', p_table;
  end if;
  if not public.arc_table_has_column(p_table, 'is_enabled') then
    raise exception '此設定資料表不支援停用 / 啟用：%', p_table;
  end if;

  select display_name into v_actor_name from public.profiles where id = v_actor_id;

  execute format('select to_jsonb(t) from public.%I t where id = $1', p_table)
    using p_id
    into v_old;
  if v_old is null then
    raise exception '找不到要更新的設定資料。';
  end if;

  v_sql := format('update public.%I set is_enabled = $2%s where id = $1',
    p_table,
    case when public.arc_table_has_column(p_table, 'updated_by') then ', updated_by = auth.uid()' else '' end
  );
  execute v_sql using p_id, p_enabled;

  insert into public.audit_logs(action_type, actor_id, actor_name, page_name, record_table, record_id, old_data, new_data, reason)
  values (
    case when p_enabled then '系統設定啟用' else '系統設定停用' end,
    v_actor_id,
    v_actor_name,
    coalesce(p_page_name, '系統設定'),
    p_table,
    p_id,
    v_old,
    jsonb_build_object('is_enabled', p_enabled),
    coalesce(p_reason, case when p_enabled then '管理員啟用設定項目' else '管理員停用設定項目' end)
  );

  return jsonb_build_object('ok', true, 'table', p_table, 'id', p_id, 'is_enabled', p_enabled);
end;
$$;

create or replace function public.arc_admin_update_profile_status(
  p_user_id uuid,
  p_action text,
  p_page_name text default '帳號設定'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_old jsonb;
  v_target_role text;
  v_patch jsonb;
begin
  if not public.is_admin() then
    raise exception '只有管理員可以停用、啟用或刪除帳號。';
  end if;
  if p_user_id = v_actor_id then
    raise exception '不可操作目前登入中的帳號。';
  end if;
  if p_action not in ('disable', 'enable', 'delete') then
    raise exception '不支援的帳號狀態操作：%', p_action;
  end if;

  select display_name into v_actor_name from public.profiles where id = v_actor_id;
  select to_jsonb(p), p.role::text into v_old, v_target_role
  from public.profiles p
  where p.id = p_user_id;

  if v_old is null then
    raise exception '找不到要操作的帳號。';
  end if;

  if p_action in ('disable','delete') and v_target_role = 'admin' then
    if (
      select count(*)
      from public.profiles
      where role = 'admin'
        and is_active = true
        and deleted_at is null
        and id <> p_user_id
    ) < 1 then
      raise exception '系統至少需保留一個啟用中的管理員帳號。';
    end if;
  end if;

  if p_action = 'disable' then
    update public.profiles set is_active = false, updated_at = now() where id = p_user_id;
    v_patch := jsonb_build_object('is_active', false);
  elsif p_action = 'enable' then
    update public.profiles set is_active = true, deleted_at = null, updated_at = now() where id = p_user_id;
    v_patch := jsonb_build_object('is_active', true, 'deleted_at', null);
  elsif p_action = 'delete' then
    update public.profiles set is_active = false, deleted_at = now(), updated_at = now() where id = p_user_id;
    insert into public.deleted_records(table_name, record_id, data, deleted_by, deleted_by_name)
    values ('profiles', p_user_id, v_old, v_actor_id, v_actor_name);
    v_patch := jsonb_build_object('is_active', false, 'deleted_at', now(), 'soft_delete', true);
  end if;

  insert into public.audit_logs(action_type, actor_id, actor_name, page_name, record_table, record_id, old_data, new_data, reason)
  values (
    case p_action when 'disable' then '帳號停用' when 'enable' then '帳號啟用' else '帳號刪除' end,
    v_actor_id,
    v_actor_name,
    coalesce(p_page_name, '帳號設定'),
    'profiles',
    p_user_id,
    v_old,
    v_patch,
    case p_action when 'disable' then '管理員停用帳號' when 'enable' then '管理員啟用帳號' else '管理員軟刪除帳號' end
  );

  return jsonb_build_object('ok', true, 'user_id', p_user_id, 'action', p_action);
end;
$$;

grant execute on function public.arc_admin_soft_delete_setting(text, uuid, text, text) to authenticated;
grant execute on function public.arc_admin_toggle_setting_enabled(text, uuid, boolean, text, text) to authenticated;
grant execute on function public.arc_admin_update_profile_status(uuid, text, text) to authenticated;

-- 確保管理員可於設定頁寫入設定資料；查詢仍保留既有 RLS。
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (deleted_at is null or public.is_admin());
