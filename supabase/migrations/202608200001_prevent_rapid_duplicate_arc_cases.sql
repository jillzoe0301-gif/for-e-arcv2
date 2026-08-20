create or replace function public.prevent_rapid_duplicate_arc_case()
returns trigger
language plpgsql
as $$
declare
  v_key text;
  v_exists boolean;
begin
  v_key := concat_ws('|',
    coalesce(new.broker_id::text, ''),
    lower(trim(coalesce(new.employer_name, ''))),
    lower(trim(coalesce(new.worker_name, ''))),
    coalesce(new.application_date::text, ''),
    trim(coalesce(new.group_no, '')),
    coalesce(new.application_item_id::text, ''),
    coalesce(new.amount::text, ''),
    coalesce(new.copy_count::text, '1'),
    coalesce(new.status::text, '')
  );

  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  select exists (
    select 1
    from public.arc_cases c
    where c.deleted_at is null
      and c.broker_id = new.broker_id
      and lower(trim(c.employer_name)) = lower(trim(new.employer_name))
      and lower(trim(c.worker_name)) = lower(trim(new.worker_name))
      and c.application_date = new.application_date
      and coalesce(trim(c.group_no), '') = coalesce(trim(new.group_no), '')
      and c.application_item_id = new.application_item_id
      and c.amount = new.amount
      and coalesce(c.copy_count, 1) = coalesce(new.copy_count, 1)
      and c.status = new.status
      and c.created_at >= clock_timestamp() - interval '20 seconds'
  ) into v_exists;

  if v_exists then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_rapid_duplicate_arc_cases on public.arc_cases;
create trigger trg_prevent_rapid_duplicate_arc_cases
before insert on public.arc_cases
for each row execute function public.prevent_rapid_duplicate_arc_case();
