-- ARC V13.50｜財務對帳完成備註欄位

alter table if exists public.payment_batches
add column if not exists note text;

comment on column public.payment_batches.note is '財務對帳完成備註，可空白。';

notify pgrst, 'reload schema';
