-- JalaSai expense recovery check for 2026-05-05 IST.
-- Run sections in order. Prefer restoring tombstoned garage_expenses rows
-- because they still contain the original description, paid_to, receipts, etc.

-- IST day window:
-- 2026-05-05 00:00 IST = 2026-05-04 18:30 UTC
-- 2026-05-06 00:00 IST = 2026-05-05 18:30 UTC

-- 1) Inspect today's expenses, including soft-deleted rows.
select
  id,
  expense_date,
  category,
  description,
  paid_to,
  amount,
  source_updated_at,
  mirrored_at,
  deleted_at,
  record_data ->> 'date' as record_date,
  record_data ->> 'cat' as record_category,
  record_data ->> 'desc' as record_description,
  record_data ->> 'paidTo' as record_paid_to,
  record_data ->> 'amount' as record_amount,
  jsonb_array_length(coalesce(record_data -> 'receipts', '[]'::jsonb)) as receipt_count
from public.garage_expenses
where expense_date = '2026-05-05'::date
   or source_updated_at >= '2026-05-04 18:30:00+00'::timestamptz
   or mirrored_at >= '2026-05-04 18:30:00+00'::timestamptz
   or deleted_at >= '2026-05-04 18:30:00+00'::timestamptz
   or nullif(record_data ->> 'date', '')::date = '2026-05-05'::date
order by coalesce(deleted_at, source_updated_at, mirrored_at) desc;

-- 2) Restore today's soft-deleted original expense rows.
-- Run this if section 1 shows missing expenses with deleted_at filled.
-- This preserves original record_data and receipt references.
-- update public.garage_expenses
-- set
--   deleted_at = null,
--   source_updated_at = coalesce(
--     nullif(record_data ->> 'updatedAt', '')::timestamptz,
--     nullif(record_data ->> 'timestamp', '')::timestamptz,
--     source_updated_at,
--     mirrored_at,
--     now()
--   ),
--   mirrored_at = now(),
--   device_id = 'sql-expense-recovery-2026-05-05'
-- where deleted_at is not null
--   and (
--     expense_date = '2026-05-05'::date
--     or deleted_at >= '2026-05-04 18:30:00+00'::timestamptz
--     or nullif(record_data ->> 'date', '')::date = '2026-05-05'::date
--   )
-- returning
--   id,
--   expense_date,
--   category,
--   description,
--   paid_to,
--   amount,
--   deleted_at;

-- 3) Search audit breadcrumbs for today's expense actions.
-- Audit create/update only kept amount/category, so use this for diagnosis.
select
  id,
  happened_at,
  actor_email,
  action,
  entity,
  entity_id as expense_id,
  record_data #>> '{details,amount}' as amount,
  record_data #>> '{details,cat}' as category,
  record_data
from public.garage_audit_log
where entity = 'expense'
  and happened_at >= '2026-05-04 18:30:00+00'::timestamptz
  and happened_at <  '2026-05-05 18:30:00+00'::timestamptz
order by happened_at desc;

-- 4) Rebuild minimal expense rows from audit breadcrumbs.
-- Only use this if the original rows are absent from garage_expenses.
-- Description/paid_to/receipt cannot be recovered from audit because they were
-- not logged there.
-- with expense_audit as (
--   select distinct on (a.entity_id)
--     a.entity_id as expense_id,
--     a.happened_at,
--     a.actor_email,
--     a.record_data #>> '{details,cat}' as category,
--     coalesce(nullif(a.record_data #>> '{details,amount}', '')::numeric, 0) as amount
--   from public.garage_audit_log a
--   where a.entity = 'expense'
--     and a.action in ('create', 'update')
--     and a.happened_at >= '2026-05-04 18:30:00+00'::timestamptz
--     and a.happened_at <  '2026-05-05 18:30:00+00'::timestamptz
--   order by a.entity_id, a.happened_at desc
-- ),
-- prepared as (
--   select
--     expense_id,
--     (happened_at at time zone 'Asia/Kolkata')::date as expense_date,
--     coalesce(nullif(category, ''), 'Recovered') as category,
--     'Recovered expense from audit log' as description,
--     '' as paid_to,
--     amount,
--     happened_at,
--     actor_email,
--     jsonb_build_object(
--       'id', expense_id,
--       'date', ((happened_at at time zone 'Asia/Kolkata')::date)::text,
--       'cat', coalesce(nullif(category, ''), 'Recovered'),
--       'desc', 'Recovered expense from audit log',
--       'paidTo', '',
--       'amount', amount,
--       'receipts', '[]'::jsonb,
--       'receipt', '',
--       'timestamp', to_jsonb(happened_at)#>>'{}',
--       'createdAt', to_jsonb(happened_at)#>>'{}',
--       'updatedAt', to_jsonb(happened_at)#>>'{}'
--     ) as recovered_record
--   from expense_audit
--   where amount > 0
-- )
-- insert into public.garage_expenses (
--   id,
--   expense_date,
--   category,
--   description,
--   paid_to,
--   amount,
--   record_data,
--   source_hash,
--   source_updated_at,
--   mirrored_at,
--   mirrored_by_email,
--   device_id,
--   deleted_at
-- )
-- select
--   expense_id,
--   expense_date,
--   category,
--   description,
--   paid_to,
--   amount,
--   recovered_record,
--   md5(recovered_record::text),
--   happened_at,
--   now(),
--   actor_email,
--   'sql-expense-audit-recovery-2026-05-05',
--   null
-- from prepared
-- on conflict (id) do update set
--   expense_date = excluded.expense_date,
--   category = excluded.category,
--   description = excluded.description,
--   paid_to = excluded.paid_to,
--   amount = excluded.amount,
--   record_data = excluded.record_data,
--   source_hash = excluded.source_hash,
--   source_updated_at = excluded.source_updated_at,
--   mirrored_at = now(),
--   mirrored_by_email = excluded.mirrored_by_email,
--   device_id = excluded.device_id,
--   deleted_at = null
-- returning id, expense_date, category, description, paid_to, amount, deleted_at;
