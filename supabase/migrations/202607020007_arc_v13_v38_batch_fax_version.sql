-- ARC V13.38｜繳費批次明細增減、批次狀態簡化、傳真領件欄位與首頁版本

-- 傳真領件欄位：舊卡手動勾選、經手人後四碼手動輸入
alter table public.arc_cases
  add column if not exists old_card_checked boolean,
  add column if not exists handler_last4 text;

alter table public.fax_pickup_items
  add column if not exists old_card_checked boolean,
  add column if not exists handler_last4 text;

create index if not exists idx_arc_cases_handler_last4 on public.arc_cases(handler_last4);

-- 繳費批次狀態簡化：舊的金額修正狀態統一視為待對帳。
update public.payment_batches
set status = 'pending'
where status not in ('pending', 'confirmed')
  and deleted_at is null;

-- 財務對帳確認可將案件移出批次，因此 payment_batch_items 需允許授權角色刪除批次明細。
drop policy if exists batch_items_delete_staff_finance_admin on public.payment_batch_items;
create policy batch_items_delete_staff_finance_admin on public.payment_batch_items
for delete to authenticated
using (public.is_staff_finance_or_admin());

-- 確保收據順序仍以同一預計領件日、待領狀態唯一。
create unique index if not exists ux_fax_pickup_receipt_order
on public.fax_pickup_items(expected_pickup_date, receipt_order)
where status = 'pending' and deleted_at is null;
