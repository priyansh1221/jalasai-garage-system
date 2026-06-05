-- JalaSai invoice recovery check for invoices 10008-10042.
-- Run section 1 first in Supabase SQL Editor. Run section 2 only if
-- section 1 shows the invoices exist with deleted_at set.

-- 1) Inspect invoice rows, including tombstoned rows.
select
  id,
  invoice_no,
  job_status,
  customer_name,
  job_date,
  source_updated_at,
  mirrored_at,
  deleted_at,
  record_data ->> 'invoiceNo' as record_invoice_no,
  record_data ->> 'cust' as record_customer,
  record_data ->> 'invoicePhoto' as invoice_photo
from public.garage_jobs
where invoice_no between '10008' and '10042'
   or record_data ->> 'invoiceNo' between '10008' and '10042'
order by coalesce(nullif(invoice_no, ''), record_data ->> 'invoiceNo');

-- 2) Restore rows if they were only soft-deleted by sync.
-- Uncomment and run after checking the SELECT above.
-- update public.garage_jobs
-- set
--   deleted_at = null,
--   source_updated_at = coalesce(
--     nullif(record_data ->> 'updatedAt', '')::timestamptz,
--     nullif(record_data ->> 'doneAt', '')::timestamptz,
--     source_updated_at,
--     mirrored_at,
--     now()
--   ),
--   mirrored_at = now()
-- where (
--     invoice_no between '10008' and '10042'
--     or record_data ->> 'invoiceNo' between '10008' and '10042'
--   )
--   and deleted_at is not null
-- returning id, invoice_no, job_status, customer_name, deleted_at;

-- 3) Optional: see recent storage photos. These can exist even when the
-- matching garage_jobs row is tombstoned, which makes photos visible in
-- Supabase but not on the website.
select
  bucket_id,
  name,
  created_at,
  updated_at,
  metadata
from storage.objects
where bucket_id = 'job-photos'
order by updated_at desc
limit 100;

-- 4) Map recent photo uploads back to garage_jobs rows by the job id embedded
-- in paths like ".../job/J009-45HC-1777986491259.jpg".
with recent_photos as (
  select
    name,
    created_at,
    updated_at,
    split_part(split_part(name, '/', 3), '-', 1)
      || '-' ||
      split_part(split_part(name, '/', 3), '-', 2) as guessed_job_id
  from storage.objects
  where bucket_id = 'job-photos'
    and updated_at >= '2026-05-05 12:00:00+00'::timestamptz
    and split_part(name, '/', 2) in ('job', 'invoice')
    and split_part(name, '/', 3) not like 'draft-%'
)
select
  p.guessed_job_id,
  count(*) as photo_count,
  min(p.created_at) as first_photo_at,
  max(p.updated_at) as last_photo_at,
  j.id as job_row_id,
  j.invoice_no,
  j.job_status,
  j.customer_name,
  j.job_date,
  j.source_updated_at,
  j.deleted_at,
  j.record_data ->> 'invoiceNo' as record_invoice_no,
  j.record_data ->> 'cust' as record_customer
from recent_photos p
left join public.garage_jobs j on j.id = p.guessed_job_id
group by
  p.guessed_job_id,
  j.id,
  j.invoice_no,
  j.job_status,
  j.customer_name,
  j.job_date,
  j.source_updated_at,
  j.deleted_at,
  j.record_data
order by last_photo_at desc;

-- 8) Search side tables for any breadcrumb of invoices 10008-10042.
-- If invoice jobs were lost but audit/income/payment rows survived, this may
-- show the invoice number, job id, customer, paid amount, or total.
with wanted as (
  select generate_series(10008, 10042)::text as invoice_no
),
audit_hits as (
  select
    'audit' as source,
    a.id,
    a.happened_at as at,
    a.entity_id as related_id,
    a.record_data #>> '{details,invoiceNo}' as invoice_no,
    a.action,
    a.entity,
    a.record_data as record_data
  from public.garage_audit_log a
  join wanted w on a.record_data #>> '{details,invoiceNo}' = w.invoice_no
),
income_hits as (
  select
    'income' as source,
    i.id,
    i.source_updated_at as at,
    '' as related_id,
    i.invoice_no,
    i.income_kind as action,
    i.category as entity,
    i.record_data as record_data
  from public.garage_income_entries i
  join wanted w on i.invoice_no = w.invoice_no
),
payment_hits as (
  select
    'payment' as source,
    p.id,
    p.source_updated_at as at,
    p.job_id as related_id,
    p.invoice_no,
    p.payment_kind as action,
    p.method as entity,
    p.record_data as record_data
  from public.garage_job_payments p
  join wanted w on p.invoice_no = w.invoice_no
)
select *
from audit_hits
union all
select *
from income_hits
union all
select *
from payment_hits
order by at desc;

-- 9) Preview recoverable TODAY invoice rows from audit + payment breadcrumbs.
-- This reconstructs missing/hidden garage_jobs rows for invoice events made on
-- 2026-05-05 IST. It uses audit as the source of truth for invoice creation
-- and payments for paid amount / method / phone / mechanic.
with invoice_audit as (
  select distinct on (a.entity_id, a.record_data #>> '{details,invoiceNo}')
    a.entity_id as job_id,
    a.happened_at as invoice_at,
    a.actor_email,
    a.action,
    a.record_data #>> '{details,invoiceNo}' as invoice_no,
    a.record_data #>> '{details,customer}' as customer_name,
    coalesce(nullif(a.record_data #>> '{details,paid}', '')::numeric, 0) as audit_paid,
    coalesce(nullif(a.record_data #>> '{details,total}', '')::numeric, 0) as audit_total,
    coalesce(nullif(a.record_data #>> '{details,discount}', '')::numeric, 0) as discount
  from public.garage_audit_log a
  where a.entity = 'invoice'
    and a.action in ('create', 'complete')
    and a.happened_at >= '2026-05-04 18:30:00+00'::timestamptz
    and a.happened_at <  '2026-05-05 18:30:00+00'::timestamptz
    and (a.record_data #>> '{details,invoiceNo}') between '10008' and '10042'
  order by a.entity_id, a.record_data #>> '{details,invoiceNo}', a.happened_at desc
),
payment_rollup as (
  select
    p.job_id,
    p.invoice_no,
    sum(p.amount) as paid_amount,
    max(nullif(p.method, '')) as pay_method,
    max(nullif(p.customer_name, '')) as payment_customer,
    max(nullif(p.phone, '')) as phone,
    array_remove(array_agg(distinct unnest_id), '') as mechanic_ids,
    array_remove(array_agg(distinct unnest_name), '') as mechanic_names,
    jsonb_agg(p.record_data order by coalesce(p.source_updated_at, p.mirrored_at)) as payments_json
  from public.garage_job_payments p
  left join lateral unnest(coalesce(p.mechanic_ids, '{}'::text[])) as unnest_id on true
  left join lateral unnest(coalesce(p.mechanic_names, '{}'::text[])) as unnest_name on true
  where p.deleted_at is null
    and p.invoice_no between '10008' and '10042'
  group by p.job_id, p.invoice_no
),
recoverable as (
  select
    ia.job_id,
    ia.invoice_no,
    coalesce(nullif(ia.customer_name, ''), pr.payment_customer, 'Recovered Customer') as customer_name,
    coalesce(pr.phone, '') as phone,
    'Recovered invoice' as vehicle,
    'done' as job_status,
    'normal' as priority,
    (ia.invoice_at at time zone 'Asia/Kolkata')::date as job_date,
    coalesce(pr.mechanic_ids, '{}'::text[]) as mechanic_ids,
    coalesce(pr.mechanic_names, '{}'::text[]) as mechanic_names,
    greatest(coalesce(ia.audit_total, 0), coalesce(pr.paid_amount, 0), coalesce(ia.audit_paid, 0)) as total_amount,
    greatest(coalesce(pr.paid_amount, 0), coalesce(ia.audit_paid, 0)) as paid_amount,
    ia.discount,
    coalesce(pr.pay_method, case when greatest(coalesce(pr.paid_amount, 0), coalesce(ia.audit_paid, 0)) > 0 then 'cash' else '' end) as pay_method,
    ia.invoice_at,
    ia.actor_email,
    ia.action,
    coalesce(pr.payments_json, '[]'::jsonb) as payments_json,
    j.id as existing_job_id,
    j.invoice_no as existing_invoice_no,
    j.job_status as existing_job_status,
    j.deleted_at as existing_deleted_at
  from invoice_audit ia
  left join payment_rollup pr
    on pr.job_id = ia.job_id
   and pr.invoice_no = ia.invoice_no
  left join public.garage_jobs j
    on j.id = ia.job_id
)
select
  job_id,
  invoice_no,
  customer_name,
  phone,
  job_status,
  job_date,
  total_amount,
  paid_amount,
  total_amount - paid_amount as due_amount,
  pay_method,
  mechanic_names,
  invoice_at,
  actor_email,
  action,
  existing_job_id,
  existing_invoice_no,
  existing_job_status,
  existing_deleted_at
from recoverable
order by invoice_at;

-- 10) Restore/upsert TODAY invoices from section 9.
-- Run section 9 first. Then uncomment this block to rebuild the invoice rows.
-- Existing rows with the same job id are updated to done invoices.
-- Unpaid quick invoices may restore with total 0 because only audit breadcrumbs
-- survived for those rows.
-- with invoice_audit as (
--   select distinct on (a.entity_id, a.record_data #>> '{details,invoiceNo}')
--     a.entity_id as job_id,
--     a.happened_at as invoice_at,
--     a.actor_email,
--     a.action,
--     a.record_data #>> '{details,invoiceNo}' as invoice_no,
--     a.record_data #>> '{details,customer}' as customer_name,
--     coalesce(nullif(a.record_data #>> '{details,paid}', '')::numeric, 0) as audit_paid,
--     coalesce(nullif(a.record_data #>> '{details,total}', '')::numeric, 0) as audit_total,
--     coalesce(nullif(a.record_data #>> '{details,discount}', '')::numeric, 0) as discount
--   from public.garage_audit_log a
--   where a.entity = 'invoice'
--     and a.action in ('create', 'complete')
--     and a.happened_at >= '2026-05-04 18:30:00+00'::timestamptz
--     and a.happened_at <  '2026-05-05 18:30:00+00'::timestamptz
--     and (a.record_data #>> '{details,invoiceNo}') between '10008' and '10042'
--   order by a.entity_id, a.record_data #>> '{details,invoiceNo}', a.happened_at desc
-- ),
-- payment_rollup as (
--   select
--     p.job_id,
--     p.invoice_no,
--     sum(p.amount) as paid_amount,
--     max(nullif(p.method, '')) as pay_method,
--     max(nullif(p.customer_name, '')) as payment_customer,
--     max(nullif(p.phone, '')) as phone,
--     array_remove(array_agg(distinct unnest_id), '') as mechanic_ids,
--     array_remove(array_agg(distinct unnest_name), '') as mechanic_names,
--     jsonb_agg(p.record_data order by coalesce(p.source_updated_at, p.mirrored_at)) as payments_json
--   from public.garage_job_payments p
--   left join lateral unnest(coalesce(p.mechanic_ids, '{}'::text[])) as unnest_id on true
--   left join lateral unnest(coalesce(p.mechanic_names, '{}'::text[])) as unnest_name on true
--   where p.deleted_at is null
--     and p.invoice_no between '10008' and '10042'
--   group by p.job_id, p.invoice_no
-- ),
-- recoverable as (
--   select
--     ia.job_id,
--     ia.invoice_no,
--     coalesce(nullif(ia.customer_name, ''), pr.payment_customer, 'Recovered Customer') as customer_name,
--     coalesce(pr.phone, '') as phone,
--     'Recovered invoice' as vehicle,
--     'done' as job_status,
--     'normal' as priority,
--     (ia.invoice_at at time zone 'Asia/Kolkata')::date as job_date,
--     coalesce(pr.mechanic_ids, '{}'::text[]) as mechanic_ids,
--     coalesce(pr.mechanic_names, '{}'::text[]) as mechanic_names,
--     greatest(coalesce(ia.audit_total, 0), coalesce(pr.paid_amount, 0), coalesce(ia.audit_paid, 0)) as total_amount,
--     greatest(coalesce(pr.paid_amount, 0), coalesce(ia.audit_paid, 0)) as paid_amount,
--     ia.discount,
--     coalesce(pr.pay_method, case when greatest(coalesce(pr.paid_amount, 0), coalesce(ia.audit_paid, 0)) > 0 then 'cash' else '' end) as pay_method,
--     ia.invoice_at,
--     ia.actor_email,
--     ia.action,
--     coalesce(pr.payments_json, '[]'::jsonb) as payments_json
--   from invoice_audit ia
--   left join payment_rollup pr
--     on pr.job_id = ia.job_id
--    and pr.invoice_no = ia.invoice_no
-- ),
-- prepared as (
--   select
--     r.*,
--     jsonb_build_object(
--       'id', r.job_id,
--       'date', r.job_date::text,
--       'time', to_char(r.invoice_at at time zone 'Asia/Kolkata', 'HH12:MI am'),
--       'createdAt', to_jsonb(r.invoice_at)#>>'{}',
--       'updatedAt', to_jsonb(r.invoice_at)#>>'{}',
--       'doneAt', to_jsonb(r.invoice_at)#>>'{}',
--       'cust', r.customer_name,
--       'phone', r.phone,
--       'veh', r.vehicle,
--       'vno', '',
--       'odo', '',
--       'prob', 'Recovered invoice from audit/payment records',
--       'mechIds', to_jsonb(r.mechanic_ids),
--       'mechId', coalesce(r.mechanic_ids[1], ''),
--       'mech', array_to_string(r.mechanic_names, ', '),
--       'pri', r.priority,
--       'status', 'done',
--       'lab', r.total_amount,
--       'prt', 0,
--       'discount', r.discount,
--       'payment', r.paid_amount,
--       'payMethod', r.pay_method,
--       'payments', r.payments_json,
--       'partsUsed', '[]'::jsonb,
--       'notes', 'Recovered from Supabase audit/payment breadcrumbs',
--       'delivery', '',
--       'photos', '[]'::jsonb,
--       'photo', '',
--       'invoicePhotos', '[]'::jsonb,
--       'invoicePhoto', '',
--       'collectedBy', '',
--       'invoiceNo', r.invoice_no
--     ) as recovered_record
--   from recoverable r
-- )
-- insert into public.garage_jobs (
--   id,
--   customer_id,
--   customer_name,
--   phone,
--   vehicle,
--   registration_no,
--   job_status,
--   priority,
--   job_date,
--   invoice_no,
--   mechanic_ids,
--   mechanic_names,
--   total_amount,
--   paid_amount,
--   due_amount,
--   advance_amount,
--   service_note,
--   remarks,
--   record_data,
--   source_hash,
--   source_updated_at,
--   mirrored_at,
--   mirrored_by_email,
--   device_id,
--   deleted_at
-- )
-- select
--   job_id,
--   '',
--   customer_name,
--   phone,
--   vehicle,
--   '',
--   'done',
--   priority,
--   job_date,
--   invoice_no,
--   mechanic_ids,
--   mechanic_names,
--   total_amount,
--   paid_amount,
--   greatest(total_amount - paid_amount, 0),
--   greatest(paid_amount - total_amount, 0),
--   'Recovered invoice from audit/payment records',
--   'Recovered after sync data loss',
--   recovered_record,
--   md5(recovered_record::text),
--   invoice_at,
--   now(),
--   actor_email,
--   'sql-recovery-2026-05-05',
--   null
-- from prepared
-- on conflict (id) do update set
--   customer_name = excluded.customer_name,
--   phone = excluded.phone,
--   vehicle = excluded.vehicle,
--   job_status = excluded.job_status,
--   priority = excluded.priority,
--   job_date = excluded.job_date,
--   invoice_no = excluded.invoice_no,
--   mechanic_ids = excluded.mechanic_ids,
--   mechanic_names = excluded.mechanic_names,
--   total_amount = excluded.total_amount,
--   paid_amount = excluded.paid_amount,
--   due_amount = excluded.due_amount,
--   advance_amount = excluded.advance_amount,
--   service_note = excluded.service_note,
--   remarks = excluded.remarks,
--   record_data = excluded.record_data,
--   source_hash = excluded.source_hash,
--   source_updated_at = excluded.source_updated_at,
--   mirrored_at = now(),
--   mirrored_by_email = excluded.mirrored_by_email,
--   device_id = excluded.device_id,
--   deleted_at = null
-- returning id, invoice_no, job_status, customer_name, total_amount, paid_amount, due_amount;

-- 5) TODAY-ONLY recovery scan.
-- In IST, 2026-05-05 is 2026-05-04 18:30:00+00 through
-- 2026-05-05 18:29:59+00. This shows every job row touched today,
-- including soft-deleted rows and non-done rows that the invoice page hides.
select
  id,
  invoice_no,
  job_status,
  customer_name,
  phone,
  vehicle,
  registration_no,
  job_date,
  source_updated_at,
  mirrored_at,
  deleted_at,
  record_data ->> 'invoiceNo' as record_invoice_no,
  record_data ->> 'status' as record_status,
  record_data ->> 'doneAt' as record_done_at,
  record_data ->> 'invoicePhoto' as record_invoice_photo,
  jsonb_array_length(coalesce(record_data -> 'invoicePhotos', '[]'::jsonb)) as invoice_photo_count,
  record_data
from public.garage_jobs
where source_updated_at >= '2026-05-04 18:30:00+00'::timestamptz
   or mirrored_at >= '2026-05-04 18:30:00+00'::timestamptz
   or deleted_at >= '2026-05-04 18:30:00+00'::timestamptz
   or nullif(record_data ->> 'doneAt', '')::timestamptz >= '2026-05-04 18:30:00+00'::timestamptz
order by coalesce(deleted_at, source_updated_at, mirrored_at) desc;

-- 6) Restore all TODAY soft-deleted jobs/invoices.
-- Use this if section 5 shows today's missing invoice rows with deleted_at set.
-- It does not invent invoices; it only makes today's tombstoned rows live again.
-- update public.garage_jobs
-- set
--   deleted_at = null,
--   source_updated_at = coalesce(
--     nullif(record_data ->> 'updatedAt', '')::timestamptz,
--     nullif(record_data ->> 'doneAt', '')::timestamptz,
--     source_updated_at,
--     mirrored_at,
--     now()
--   ),
--   mirrored_at = now()
-- where deleted_at >= '2026-05-04 18:30:00+00'::timestamptz
-- returning
--   id,
--   invoice_no,
--   job_status,
--   customer_name,
--   source_updated_at,
--   deleted_at,
--   record_data ->> 'invoiceNo' as record_invoice_no,
--   record_data ->> 'status' as record_status;

-- 7) Show photo-backed active rows from today that are hidden from Invoices.
-- These are not deleted, but the invoice page hides them when job_status <> done
-- or invoice_no is blank.
with recent_photos as (
  select
    name,
    created_at,
    updated_at,
    split_part(split_part(name, '/', 3), '-', 1)
      || '-' ||
      split_part(split_part(name, '/', 3), '-', 2) as guessed_job_id,
    split_part(name, '/', 2) as photo_kind
  from storage.objects
  where bucket_id = 'job-photos'
    and updated_at >= '2026-05-04 18:30:00+00'::timestamptz
    and split_part(name, '/', 2) in ('job', 'invoice')
    and split_part(name, '/', 3) not like 'draft-%'
)
select
  p.guessed_job_id,
  count(*) as photo_count,
  bool_or(p.photo_kind = 'invoice') as has_invoice_photo,
  min(p.created_at) as first_photo_at,
  max(p.updated_at) as last_photo_at,
  j.invoice_no,
  j.job_status,
  j.customer_name,
  j.job_date,
  j.source_updated_at,
  j.deleted_at,
  j.record_data ->> 'invoiceNo' as record_invoice_no,
  j.record_data ->> 'status' as record_status,
  j.record_data ->> 'doneAt' as record_done_at
from recent_photos p
left join public.garage_jobs j on j.id = p.guessed_job_id
group by
  p.guessed_job_id,
  j.id,
  j.invoice_no,
  j.job_status,
  j.customer_name,
  j.job_date,
  j.source_updated_at,
  j.deleted_at,
  j.record_data
having j.id is null
    or j.deleted_at is not null
    or coalesce(j.job_status, '') <> 'done'
    or coalesce(j.invoice_no, '') = ''
order by last_photo_at desc;
