# Invoice Recovery Incident — 2026-05-05

## Summary

On 2026-05-05, newly-created invoices around `10008` through `10042` disappeared from the live website after a cloud sync. Supabase Storage still showed several recent job/invoice photos, but the website invoice page did not show the matching invoices.

The invoices page renders from `public.garage_jobs` rows where the job is live and `job_status = 'done'`. Supabase Storage photos are only file objects; they do not contain enough business data to recreate a complete invoice by themselves.

## Impact

- Invoice rows `10009` through `10040` were recovered back into `public.garage_jobs`.
- Invoice `10008` was intentionally left untouched because multiple duplicate `10008` breadcrumbs existed from different devices/users.
- Invoices `10010`, `10041`, and `10042` were not recovered because no usable Supabase breadcrumbs were found during the incident review.
- Recovered rows that had payment breadcrumbs restored with paid amount and total equal to the paid amount.
- Recovered rows without payment/total breadcrumbs restored with amount `0`.
- Original invoice photos and richer job details were not recoverable from the available table breadcrumbs.

## Visible Symptoms

The live website showed invoices only up to `10007`, despite staff having entered later invoice numbers.

Supabase Storage showed recent photo uploads such as:

- `.../job/J009-45HC-...jpg`
- `.../invoice/J009-45HC-...jpg`
- `.../job/J010-45HC-...jpg`
- `.../job/J389-21DD-...jpg`

Those photos mapped to existing non-invoice or hidden job states:

- `J389-21DD`: `waiting`, no invoice number
- `J009-45HC`: `parts-needed`, invoice `9906`, one invoice photo
- `J010-45HC`: `ready`, no invoice number

This proved that photo upload was not the main failure. The invoice records themselves were missing or tombstoned in `garage_jobs`.

## Root Cause

The table-wise sync path treated rows missing from one device's local payload as rows that should be deleted from cloud tables.

In `mirrorPayloadToShadowTables()`, the previous logic built tombstone rows for every active remote row that was not present in the current local payload:

```js
const deletes = [...remoteMeta.entries()]
  .filter(([id, remote]) => !expectedMap.has(id) && !remote.deletedAt)
  .map(([id]) => shadowDeleteRow(id, session));
```

If a stale device had an older local cache and pushed after newer invoices were created elsewhere, it could soft-delete the newer cloud invoice rows. During this incident the live app showed a sync status similar to:

```text
Synced to cloud tables. 15 tables mirrored · 7109 changed · 44 removed.
```

That `44 removed` count lined up with the missing invoice range and related records.

## Immediate Code Fix

The delete inference was disabled in both runtime copies:

- `js/sync.js`
- `deploy/js/sync.js`

New guard:

```js
// Emergency guard: a stale device can have an older local payload that is
// missing valid cloud rows. Do not infer cloud deletes from absence.
const SHADOW_INFER_DELETES = false;
```

Updated delete logic:

```js
const deletes = SHADOW_INFER_DELETES
  ? [...remoteMeta.entries()]
    .filter(([id, remote]) => !expectedMap.has(id) && !remote.deletedAt)
    .map(([id]) => shadowDeleteRow(id, session))
  : [];
```

Important operational rule:

Deploy the patched `deploy/` folder before pressing `Sync Now` on stale devices. Otherwise an older live build can repeat the tombstone behavior.

## Investigation Queries

### Map Recent Photos To Jobs

This query showed that recent photos existed, but the matching job rows were not completed invoices:

```sql
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
```

### Search Audit, Income, And Payment Breadcrumbs

This query found recoverable invoice breadcrumbs in `garage_audit_log` and `garage_job_payments`:

```sql
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
    a.record_data
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
    i.record_data
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
    p.record_data
  from public.garage_job_payments p
  join wanted w on p.invoice_no = w.invoice_no
)
select * from audit_hits
union all
select * from income_hits
union all
select * from payment_hits
order by at desc;
```

## Recovery SQL Used

The final recovery skipped every `10008` record and restored `10009` through `10042` from invoice audit rows plus payment rollups.

```sql
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
    and (a.record_data #>> '{details,invoiceNo}') between '10009' and '10042'
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
    array_remove(array_agg(distinct p.record_data ->> 'mechId'), '') as mechanic_ids,
    array_remove(array_agg(distinct p.record_data ->> 'mechName'), '') as mechanic_names,
    jsonb_agg(p.record_data order by coalesce(p.source_updated_at, p.mirrored_at)) as payments_json
  from public.garage_job_payments p
  where p.invoice_no between '10009' and '10042'
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
    coalesce(pr.payments_json, '[]'::jsonb) as payments_json
  from invoice_audit ia
  left join payment_rollup pr
    on pr.job_id = ia.job_id
   and pr.invoice_no = ia.invoice_no
),
prepared as (
  select
    r.*,
    jsonb_build_object(
      'id', r.job_id,
      'date', r.job_date::text,
      'time', to_char(r.invoice_at at time zone 'Asia/Kolkata', 'HH12:MI am'),
      'createdAt', to_jsonb(r.invoice_at)#>>'{}',
      'updatedAt', to_jsonb(r.invoice_at)#>>'{}',
      'doneAt', to_jsonb(r.invoice_at)#>>'{}',
      'cust', r.customer_name,
      'phone', r.phone,
      'veh', r.vehicle,
      'vno', '',
      'odo', '',
      'prob', 'Recovered invoice from audit/payment records',
      'mechIds', to_jsonb(r.mechanic_ids),
      'mechId', coalesce(r.mechanic_ids[1], ''),
      'mech', array_to_string(r.mechanic_names, ', '),
      'pri', r.priority,
      'status', 'done',
      'lab', r.total_amount,
      'prt', 0,
      'discount', r.discount,
      'payment', r.paid_amount,
      'payMethod', r.pay_method,
      'payments', r.payments_json,
      'partsUsed', '[]'::jsonb,
      'notes', 'Recovered from Supabase audit/payment breadcrumbs',
      'delivery', '',
      'photos', '[]'::jsonb,
      'photo', '',
      'invoicePhotos', '[]'::jsonb,
      'invoicePhoto', '',
      'collectedBy', '',
      'invoiceNo', r.invoice_no
    ) as recovered_record
  from recoverable r
)
insert into public.garage_jobs (
  id, customer_id, customer_name, phone, vehicle, registration_no,
  job_status, priority, job_date, invoice_no, mechanic_ids, mechanic_names,
  total_amount, paid_amount, due_amount, advance_amount,
  service_note, remarks, record_data, source_hash, source_updated_at,
  mirrored_at, mirrored_by_email, device_id, deleted_at
)
select
  job_id, '', customer_name, phone, vehicle, '',
  'done', priority, job_date, invoice_no, mechanic_ids, mechanic_names,
  total_amount, paid_amount,
  greatest(total_amount - paid_amount, 0),
  greatest(paid_amount - total_amount, 0),
  'Recovered invoice from audit/payment records',
  'Recovered after sync data loss',
  recovered_record,
  md5(recovered_record::text),
  invoice_at,
  now(),
  actor_email,
  'sql-recovery-2026-05-05',
  null
from prepared
on conflict (id) do update set
  customer_name = excluded.customer_name,
  phone = excluded.phone,
  vehicle = excluded.vehicle,
  job_status = excluded.job_status,
  priority = excluded.priority,
  job_date = excluded.job_date,
  invoice_no = excluded.invoice_no,
  mechanic_ids = excluded.mechanic_ids,
  mechanic_names = excluded.mechanic_names,
  total_amount = excluded.total_amount,
  paid_amount = excluded.paid_amount,
  due_amount = excluded.due_amount,
  advance_amount = excluded.advance_amount,
  service_note = excluded.service_note,
  remarks = excluded.remarks,
  record_data = excluded.record_data,
  source_hash = excluded.source_hash,
  source_updated_at = excluded.source_updated_at,
  mirrored_at = now(),
  mirrored_by_email = excluded.mirrored_by_email,
  device_id = excluded.device_id,
  deleted_at = null
returning id, invoice_no, job_status, customer_name, total_amount, paid_amount, due_amount;
```

## Recovered Rows

The restore returned the following invoices:

- `10009` — `J163-RPT2` — Ola 6768 Paresh — `₹680`
- `10011` — `J165-RPT2` — Spl 6464 — `₹0`
- `10012` — `J166-RPT2` — Ola 8373 — `₹400`
- `10013` — `J167-RPT2` — Budho kako — `₹0`
- `10014` — `J168-RPT2` — Shine 8281 — `₹200`
- `10015` — `J169-RPT2` — activa 8974 — `₹200`
- `10016` — `J170-RPT2` — Spl 9449 — `₹0`
- `10017` — `J010-45HC` — Jupiter 5407 — `₹400`
- `10018` — `J171-RPT2` — Ola 5003 — `₹0`
- `10019` — `J009-45HC` — Om Ola Vadod — `₹10,500`
- `10020` — `J172-RPT2` — Activa 2010 — `₹0`
- `10021` — `J173-RPT2` — Yash Bhai — `₹0`
- `10022` — `J174-RPT2` — Activa 2623 — `₹2,250`
- `10023` — `J175-RPT2` — Shine bs6 5866 — `₹890`
- `10024` — `J176-RPT2` — Ola 6710 Meet — `₹1,200`
- `10025` — `J177-RPT2` — Ola 6220 — `₹1,100`
- `10026` — `J178-RPT2` — Ola 1984 — `₹150`
- `10027` — `J179-RPT2` — Access 0703 — `₹0`
- `10028` — `J180-RPT2` — Halo Bhai 7498 — `₹3,500`
- `10029` — `J181-RPT2` — Raju bhai 9186 — `₹1,050`
- `10030` — `J182-RPT2` — Ola 2524 — `₹690`
- `10031` — `J183-RPT2` — Rachit bhai — `₹450`
- `10032` — `J184-RPT2` — Spl 8450 — `₹300`
- `10033` — `J185-RPT2` — Activa 6G 9596 — `₹1,200`
- `10034` — `J186-RPT2` — Running — `₹250`
- `10035` — `J187-RPT2` — Access 6869 — `₹350`
- `10036` — `J188-RPT2` — Budho kako — `₹0`
- `10037` — `J189-RPT2` — Lakhan Sarsana — `₹0`
- `10038` — `J190-RPT2` — ola 8280 — `₹430`
- `10039` — `J191-RPT2` — Activa 0241 — `₹0`
- `10040` — `J192-RPT2` — Activa 2535 — `₹1,230`

## Why Photos Could Not Fully Recover The Invoices

Photos are stored separately in Supabase Storage. A photo path can reveal a rough job id and upload time, but not the full invoice state. It does not reliably contain:

- invoice number
- total amount
- paid amount
- customer phone
- original vehicle/work description
- discount
- parts used
- notes
- payment method

Therefore photos can confirm that activity happened, but they cannot recreate a complete invoice row unless matching `garage_jobs`, audit, payment, income, or localStorage data also exists.

## Follow-Up Work

- Deploy the patched `deploy/` folder before any stale devices sync again.
- Manually edit recovered rows with amount `0` if the real totals are known.
- Manually clean placeholder text such as `Recovered invoice`.
- Review invoice number allocation because `10008` was reused multiple times across devices.
- Consider a future hard-delete workflow that only tombstones rows when an explicit delete action exists, never when a row is merely absent from a local payload.
- Consider a daily immutable backup of `garage_jobs` before table sync changes, so full invoice rows can be restored without relying on audit/payment breadcrumbs.
