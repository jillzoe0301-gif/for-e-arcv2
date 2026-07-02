-- ARC V13 V37.6
-- 行政權限修正：行政可查看/修改財務對帳確認與財務查詢資料，僅管理員可刪除會計資訊；帳號密碼維持管理員管理。

create or replace function public.is_staff_finance_or_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_app_role() in ('admin','staff','finance'), false)
$$;

-- ===== 財務資料：行政/會計/管理員可讀取與修改；刪除仍只能由管理員透過前端與 RPC 流程處理 =====
drop policy if exists batches_select_finance_admin on public.payment_batches;
drop policy if exists batches_insert_staff_admin on public.payment_batches;
drop policy if exists batches_update_finance_admin on public.payment_batches;
drop policy if exists batches_select_staff_finance_admin on public.payment_batches;
drop policy if exists batches_insert_staff_finance_admin on public.payment_batches;
drop policy if exists batches_update_staff_finance_admin on public.payment_batches;
create policy batches_select_staff_finance_admin on public.payment_batches
for select to authenticated
using (deleted_at is null and public.is_staff_finance_or_admin());
create policy batches_insert_staff_finance_admin on public.payment_batches
for insert to authenticated
with check (public.is_staff_finance_or_admin());
create policy batches_update_staff_finance_admin on public.payment_batches
for update to authenticated
using (public.is_staff_finance_or_admin())
with check (public.is_admin() or (public.current_app_role() in ('staff','finance') and deleted_at is null));

drop policy if exists batch_items_select_finance_admin on public.payment_batch_items;
drop policy if exists batch_items_insert_staff_admin on public.payment_batch_items;
drop policy if exists batch_items_update_finance_admin on public.payment_batch_items;
drop policy if exists batch_items_select_staff_finance_admin on public.payment_batch_items;
drop policy if exists batch_items_insert_staff_finance_admin on public.payment_batch_items;
drop policy if exists batch_items_update_staff_finance_admin on public.payment_batch_items;
create policy batch_items_select_staff_finance_admin on public.payment_batch_items
for select to authenticated
using (public.is_staff_finance_or_admin());
create policy batch_items_insert_staff_finance_admin on public.payment_batch_items
for insert to authenticated
with check (public.is_staff_finance_or_admin());
create policy batch_items_update_staff_finance_admin on public.payment_batch_items
for update to authenticated
using (public.is_staff_finance_or_admin())
with check (public.is_staff_finance_or_admin());

drop policy if exists account_txn_select_finance_admin on public.account_transactions;
drop policy if exists account_txn_insert_finance_admin on public.account_transactions;
drop policy if exists account_txn_select_staff_finance_admin on public.account_transactions;
drop policy if exists account_txn_insert_staff_finance_admin on public.account_transactions;
create policy account_txn_select_staff_finance_admin on public.account_transactions
for select to authenticated
using (public.is_staff_finance_or_admin());
create policy account_txn_insert_staff_finance_admin on public.account_transactions
for insert to authenticated
with check (public.is_staff_finance_or_admin());

-- 扣款與財務對帳餘額更新需可由行政/會計/管理員執行；刪除仍由前端與 deleted_at 檢查限制管理員。
drop policy if exists accounts_insert_admin on public.bank_accounts;
drop policy if exists accounts_insert_staff_finance_admin on public.bank_accounts;
create policy accounts_insert_staff_finance_admin on public.bank_accounts
for insert to authenticated
with check (public.is_staff_finance_or_admin());

drop policy if exists accounts_update_finance_admin on public.bank_accounts;
drop policy if exists accounts_update_staff_finance_admin on public.bank_accounts;
create policy accounts_update_staff_finance_admin on public.bank_accounts
for update to authenticated
using (public.is_staff_finance_or_admin())
with check (public.is_admin() or (public.current_app_role() in ('staff','finance') and deleted_at is null));

-- ===== 系統設定：行政可維護一般設定，但不能透過軟刪除移除資料；帳號密碼仍由 Edge Function 限制管理員。 =====
drop policy if exists settings_write_admin on public.person_options;
drop policy if exists settings_insert_staff_admin on public.person_options;
drop policy if exists settings_update_staff_admin on public.person_options;
create policy settings_insert_staff_admin on public.person_options
for insert to authenticated
with check (public.is_staff_or_admin());
create policy settings_update_staff_admin on public.person_options
for update to authenticated
using (public.is_staff_or_admin())
with check (public.is_admin() or (public.current_app_role() = 'staff' and deleted_at is null));

drop policy if exists brokers_write_admin on public.broker_companies;
drop policy if exists brokers_insert_staff_admin on public.broker_companies;
drop policy if exists brokers_update_staff_admin on public.broker_companies;
create policy brokers_insert_staff_admin on public.broker_companies
for insert to authenticated
with check (public.is_staff_or_admin());
create policy brokers_update_staff_admin on public.broker_companies
for update to authenticated
using (public.is_staff_or_admin())
with check (public.is_admin() or (public.current_app_role() = 'staff' and deleted_at is null));

drop policy if exists app_items_write_admin on public.application_items;
drop policy if exists app_items_insert_staff_admin on public.application_items;
drop policy if exists app_items_update_staff_admin on public.application_items;
create policy app_items_insert_staff_admin on public.application_items
for insert to authenticated
with check (public.is_staff_or_admin());
create policy app_items_update_staff_admin on public.application_items
for update to authenticated
using (public.is_staff_or_admin())
with check (public.is_admin() or (public.current_app_role() = 'staff' and deleted_at is null));

drop policy if exists fee_settings_write_admin on public.fee_settings;
drop policy if exists fee_settings_insert_staff_admin on public.fee_settings;
drop policy if exists fee_settings_update_staff_admin on public.fee_settings;
create policy fee_settings_insert_staff_admin on public.fee_settings
for insert to authenticated
with check (public.is_staff_or_admin());
create policy fee_settings_update_staff_admin on public.fee_settings
for update to authenticated
using (public.is_staff_or_admin())
with check (public.is_admin() or (public.current_app_role() = 'staff' and deleted_at is null));

drop policy if exists arc_settings_write_admin on public.arc_settings;
drop policy if exists arc_settings_insert_staff_admin on public.arc_settings;
drop policy if exists arc_settings_update_staff_admin on public.arc_settings;
create policy arc_settings_insert_staff_admin on public.arc_settings
for insert to authenticated
with check (public.is_staff_or_admin());
create policy arc_settings_update_staff_admin on public.arc_settings
for update to authenticated
using (public.is_staff_or_admin())
with check (public.is_staff_or_admin());

drop policy if exists stations_write_admin on public.immigration_service_stations;
drop policy if exists stations_insert_staff_admin on public.immigration_service_stations;
drop policy if exists stations_update_staff_admin on public.immigration_service_stations;
create policy stations_insert_staff_admin on public.immigration_service_stations
for insert to authenticated
with check (public.is_staff_or_admin());
create policy stations_update_staff_admin on public.immigration_service_stations
for update to authenticated
using (public.is_staff_or_admin())
with check (public.is_admin() or (public.current_app_role() = 'staff' and deleted_at is null));

drop policy if exists task_force_write_admin on public.task_force_contacts;
drop policy if exists task_force_insert_staff_admin on public.task_force_contacts;
drop policy if exists task_force_update_staff_admin on public.task_force_contacts;
create policy task_force_insert_staff_admin on public.task_force_contacts
for insert to authenticated
with check (public.is_staff_or_admin());
create policy task_force_update_staff_admin on public.task_force_contacts
for update to authenticated
using (public.is_staff_or_admin())
with check (public.is_admin() or (public.current_app_role() = 'staff' and deleted_at is null));
