-- ARC V13 V26 修正：刪除 RPC、晶片居留證查詢網址
-- 請在 Supabase SQL Editor 執行本檔。

insert into public.arc_settings(setting_group, setting_key, setting_value, is_enabled)
values (
  'links',
  'chip_residence_query',
  '{"url":"https://niaicinfo.immigration.gov.tw/icinfo-frontend/zh#MyAnchor"}'::jsonb,
  true
)
on conflict(setting_group, setting_key)
do update set setting_value = excluded.setting_value, is_enabled = excluded.is_enabled;

create or replace function public.arc_delete_pickup_record_v2(
  p_record_id uuid,
  p_reason text default '管理員刪除傳真領件紀錄'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.pickup_records%rowtype;
  v_items jsonb;
begin
  if not public.is_admin() then
    raise exception '您沒有刪除權限。';
  end if;

  select * into v_record
  from public.pickup_records
  where id = p_record_id;

  if not found then
    raise exception '找不到傳真領件紀錄。';
  end if;

  select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb)
  into v_items
  from public.pickup_record_items i
  where i.record_id = p_record_id;

  update public.pickup_records
  set deleted_at = now(),
      deleted_by = auth.uid(),
      delete_reason = coalesce(nullif(trim(p_reason), ''), '管理員刪除傳真領件紀錄')
  where id = p_record_id;

  delete from public.pickup_record_items
  where record_id = p_record_id;

  insert into public.deleted_records(table_name, record_id, data, deleted_by, deleted_by_name)
  values (
    'pickup_records',
    p_record_id,
    jsonb_build_object('record', to_jsonb(v_record), 'details', v_items),
    auth.uid(),
    (select display_name from public.profiles where id = auth.uid())
  );

  insert into public.audit_logs(action_type, actor_id, actor_name, page_name, record_table, record_id, old_data, new_data, reason)
  values (
    '傳真領件紀錄刪除',
    auth.uid(),
    (select display_name from public.profiles where id = auth.uid()),
    '傳真/領件',
    'pickup_records',
    p_record_id,
    jsonb_build_object(
      'record_no', v_record.record_no,
      'pickup_date', v_record.pickup_date,
      'case_count', v_record.case_count,
      'details', v_items
    ),
    jsonb_build_object('deleted_at', now(), 'deleted_by', auth.uid()),
    coalesce(nullif(trim(p_reason), ''), '管理員刪除傳真領件紀錄')
  );

  return jsonb_build_object('ok', true, 'record_id', p_record_id);
end;
$$;

create or replace function public.arc_soft_delete_case_v2(
  p_case_id uuid,
  p_page_name text default '案件查詢'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.arc_cases%rowtype;
  v_batch public.payment_batches%rowtype;
  v_batch_item public.payment_batch_items%rowtype;
  v_account public.bank_accounts%rowtype;
  v_reverse_amount numeric := 0;
  v_before numeric;
  v_after numeric;
  v_next_count integer;
  v_next_total numeric;
begin
  if not public.is_admin() then
    raise exception '您沒有刪除權限。';
  end if;

  select * into v_case
  from public.arc_cases
  where id = p_case_id
    and deleted_at is null;

  if not found then
    raise exception '找不到案件資料或案件已刪除。';
  end if;

  if v_case.payment_batch_id is not null then
    select * into v_batch
    from public.payment_batches
    where id = v_case.payment_batch_id;

    select * into v_batch_item
    from public.payment_batch_items
    where batch_id = v_case.payment_batch_id
      and case_id = p_case_id
    limit 1;

    v_reverse_amount := coalesce(v_batch_item.corrected_amount, v_batch_item.original_amount, v_case.amount, 0);

    if coalesce(v_case.payment_account_id, v_batch.account_id) is not null then
      select * into v_account
      from public.bank_accounts
      where id = coalesce(v_case.payment_account_id, v_batch.account_id);

      if v_account.id is not null and v_reverse_amount <> 0 then
        v_before := coalesce(v_account.current_balance, 0);
        v_after := v_before + v_reverse_amount;

        update public.bank_accounts
        set current_balance = v_after,
            updated_by = auth.uid()
        where id = v_account.id;

        insert into public.account_transactions(account_id, txn_type, amount, balance_before, balance_after, ref_table, ref_id, reason, created_by)
        values (
          v_account.id,
          'reverse_delete_finance_case',
          v_reverse_amount,
          v_before,
          v_after,
          'arc_cases',
          p_case_id,
          '刪除財務資料 ' || v_case.case_no || ' 沖正',
          auth.uid()
        );
      end if;
    end if;

    if v_batch.id is not null then
      v_next_count := greatest(coalesce(v_batch.case_count, 0) - 1, 0);
      v_next_total := greatest(coalesce(v_batch.total_amount, 0) - v_reverse_amount, 0);

      update public.payment_batches
      set total_amount = v_next_total,
          case_count = v_next_count,
          status = case when v_next_count = 0 then 'cancelled'::public.batch_status else status end,
          deleted_at = case when v_next_count = 0 then now() else deleted_at end,
          updated_by = auth.uid()
      where id = v_batch.id;

      delete from public.payment_batch_items
      where batch_id = v_batch.id
        and case_id = p_case_id;
    end if;
  end if;

  update public.arc_cases
  set deleted_at = now(),
      updated_by = auth.uid()
  where id = p_case_id;

  insert into public.deleted_records(table_name, record_id, data, deleted_by, deleted_by_name)
  values (
    'arc_cases',
    p_case_id,
    jsonb_build_object('case', to_jsonb(v_case), 'batch', to_jsonb(v_batch), 'reverse_amount', v_reverse_amount),
    auth.uid(),
    (select display_name from public.profiles where id = auth.uid())
  );

  insert into public.audit_logs(action_type, actor_id, actor_name, page_name, record_table, record_id, old_data, new_data, reason)
  values (
    case when v_case.payment_batch_id is not null then '刪除財務資料' else '刪除案件' end,
    auth.uid(),
    (select display_name from public.profiles where id = auth.uid()),
    coalesce(nullif(trim(p_page_name), ''), '案件查詢'),
    'arc_cases',
    p_case_id,
    to_jsonb(v_case),
    jsonb_build_object('deleted_at', now(), 'deleted_by', auth.uid()),
    case when v_case.payment_batch_id is not null then '管理員刪除並建立帳戶沖正紀錄' else '管理員刪除案件' end
  );

  return jsonb_build_object('ok', true, 'case_id', p_case_id, 'reverse_amount', v_reverse_amount);
end;
$$;

create or replace function public.arc_delete_payment_batch_v2(
  p_batch_id uuid,
  p_page_name text default '財務對帳確認'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.payment_batches%rowtype;
  v_account public.bank_accounts%rowtype;
  v_related_cases jsonb;
  v_before numeric;
  v_after numeric;
  v_reverse_amount numeric := 0;
begin
  if not public.is_admin() then
    raise exception '您沒有刪除權限。';
  end if;

  select * into v_batch
  from public.payment_batches
  where id = p_batch_id
    and deleted_at is null;

  if not found then
    raise exception '找不到財務批次資料或資料已刪除。';
  end if;

  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
  into v_related_cases
  from public.arc_cases c
  where c.payment_batch_id = p_batch_id
    and c.deleted_at is null;

  select * into v_account
  from public.bank_accounts
  where id = v_batch.account_id;

  v_reverse_amount := coalesce(v_batch.total_amount, 0);

  if v_account.id is not null and v_reverse_amount <> 0 then
    v_before := coalesce(v_account.current_balance, 0);
    v_after := v_before + v_reverse_amount;

    update public.bank_accounts
    set current_balance = v_after,
        updated_by = auth.uid()
    where id = v_account.id;

    insert into public.account_transactions(account_id, txn_type, amount, balance_before, balance_after, ref_table, ref_id, reason, created_by)
    values (
      v_account.id,
      'reverse_delete_payment_batch',
      v_reverse_amount,
      v_before,
      v_after,
      'payment_batches',
      p_batch_id,
      '刪除繳費批次 ' || v_batch.batch_no || ' 沖正',
      auth.uid()
    );
  end if;

  update public.payment_batches
  set status = 'cancelled'::public.batch_status,
      deleted_at = now(),
      updated_by = auth.uid()
  where id = p_batch_id;

  update public.arc_cases
  set status = 'pending_payment'::public.case_status,
      payment_batch_id = null,
      payment_date = null,
      payment_account_id = null,
      updated_by = auth.uid()
  where payment_batch_id = p_batch_id
    and deleted_at is null;

  delete from public.payment_batch_items
  where batch_id = p_batch_id;

  insert into public.deleted_records(table_name, record_id, data, deleted_by, deleted_by_name)
  values (
    'payment_batches',
    p_batch_id,
    jsonb_build_object('batch', to_jsonb(v_batch), 'related_cases', v_related_cases, 'reverse_amount', v_reverse_amount),
    auth.uid(),
    (select display_name from public.profiles where id = auth.uid())
  );

  insert into public.audit_logs(action_type, actor_id, actor_name, page_name, record_table, record_id, old_data, new_data, reason)
  values (
    '刪除財務對帳批次',
    auth.uid(),
    (select display_name from public.profiles where id = auth.uid()),
    coalesce(nullif(trim(p_page_name), ''), '財務對帳確認'),
    'payment_batches',
    p_batch_id,
    jsonb_build_object('batch', to_jsonb(v_batch), 'related_cases', v_related_cases),
    jsonb_build_object('deleted_at', now(), 'status', 'cancelled', 'reverse_amount', v_reverse_amount),
    '管理員刪除並建立帳戶沖正紀錄'
  );

  return jsonb_build_object('ok', true, 'batch_id', p_batch_id, 'reverse_amount', v_reverse_amount);
end;
$$;
