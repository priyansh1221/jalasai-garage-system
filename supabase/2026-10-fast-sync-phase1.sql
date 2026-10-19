-- ════════════════════════════════════════════════════════════════
-- Fast sync — Phase 1 server prep (DRAFT — NOT RUN YET)
-- Plan: docs/FAST_CLOUD_LOAD_PLAN_2026_10.md §5 and
--       docs/LONG_TERM_DATA_ROADMAP_2026_10.md (Stage 0 row history, Stage 1)
--
-- ADDITIVE ONLY. Old app versions ignore every object created here, and
-- nothing here deletes or rewrites existing data (the one UPDATE fills a
-- brand-new column). Safe to run more than once.
--
-- Before running on the live project:
--   1. Take a backup (Dashboard → Database → Backups, or pg_dump).
--   2. Run the "CHECK FIRST" queries at the bottom and note the numbers.
--   3. Run this file in the SQL editor in one go.
-- ════════════════════════════════════════════════════════════════


-- ── A. Server change clock ──────────────────────────────────────
-- source_updated_at / mirrored_at are stamped by each PHONE's clock, so a
-- change uploaded late (offline phone) can sort before another phone's pull
-- cursor and never be fetched. server_updated_at is stamped by Postgres on
-- every insert/update — including tombstones — and becomes the delta cursor.

create or replace function public.jalasai_touch_server_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
  shadow_tables text[] := array[
    'garage_customers', 'garage_mechanics', 'garage_jobs', 'garage_job_payments',
    'garage_stock_items', 'garage_expenses', 'garage_income_entries',
    'garage_parts_log', 'garage_audit_log', 'garage_stock_movements'
  ];
begin
  foreach t in array shadow_tables loop
    execute format('alter table public.%I add column if not exists server_updated_at timestamptz', t);

    -- Backfill BEFORE the trigger exists, so old rows keep their real age
    -- instead of all becoming "changed just now".
    execute format(
      'update public.%I set server_updated_at = coalesce(mirrored_at, source_updated_at, now()) where server_updated_at is null',
      t
    );

    execute format('alter table public.%I alter column server_updated_at set default now()', t);

    execute format('drop trigger if exists %I on public.%I', t || '_touch_server_updated_at', t);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.jalasai_touch_server_updated_at()',
      t || '_touch_server_updated_at', t
    );

    -- Delta pull index: (server_updated_at, id) keyset, tombstones INCLUDED.
    execute format(
      'create index if not exists %I on public.%I (server_updated_at, id)',
      t || '_server_updated_idx', t
    );
  end loop;
end;
$$;


-- ── B. Row history (nothing overwritten is ever unrecoverable) ──
-- Every time a shadow row's content or delete state changes, the OLD row is
-- copied here. Identical re-uploads (same hash, record_data and deleted_at) are
-- skipped so routine syncs don't bloat the table.

create table if not exists public.garage_row_history (
  history_id   bigint generated always as identity primary key,
  table_name   text not null,
  row_id       text not null,
  operation    text not null,                 -- UPDATE | DELETE
  old_row      jsonb not null,                -- full previous row incl. record_data
  changed_at   timestamptz not null default now(),
  changed_by   uuid,                          -- auth user that made the change
  new_device_id text not null default ''      -- device that made the change
);

create index if not exists garage_row_history_row_idx
  on public.garage_row_history (table_name, row_id, changed_at desc);
create index if not exists garage_row_history_time_idx
  on public.garage_row_history (changed_at desc);

create or replace function public.jalasai_capture_row_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.source_hash is not distinct from new.source_hash
     and old.record_data is not distinct from new.record_data
     and old.deleted_at is not distinct from new.deleted_at then
    return new;
  end if;
  insert into public.garage_row_history (table_name, row_id, operation, old_row, changed_by, new_device_id)
  values (
    tg_table_name,
    old.id,
    tg_op,
    to_jsonb(old),
    auth.uid(),
    case when tg_op = 'UPDATE' then coalesce(new.device_id, '') else '' end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  t text;
  shadow_tables text[] := array[
    'garage_customers', 'garage_mechanics', 'garage_jobs', 'garage_job_payments',
    'garage_stock_items', 'garage_expenses', 'garage_income_entries',
    'garage_parts_log', 'garage_audit_log', 'garage_stock_movements'
  ];
begin
  foreach t in array shadow_tables loop
    execute format('drop trigger if exists %I on public.%I', t || '_row_history', t);
    execute format(
      'create trigger %I after update or delete on public.%I for each row execute function public.jalasai_capture_row_history()',
      t || '_row_history', t
    );
  end loop;
end;
$$;

-- Staff can read history (for "restore old version"); nobody writes it
-- directly — only the trigger above (security definer) inserts.
alter table public.garage_row_history enable row level security;
drop policy if exists "Authenticated can read row history" on public.garage_row_history;
create policy "Authenticated can read row history"
  on public.garage_row_history for select to authenticated using (true);


-- ── C. Indexes for newest-first loading and on-demand history ──

-- Invoices page: newest first, cursor paging by (job_date, id).
create index if not exists garage_jobs_done_date_idx
  on public.garage_jobs (job_date desc, id desc)
  where deleted_at is null and job_status = 'done';

-- Job board: open jobs only.
create index if not exists garage_jobs_open_idx
  on public.garage_jobs (job_date desc)
  where deleted_at is null and job_status <> 'done';

-- Customer detail: that customer's jobs on demand.
create index if not exists garage_jobs_customer_idx
  on public.garage_jobs (customer_id)
  where deleted_at is null;
create index if not exists garage_jobs_phone_idx
  on public.garage_jobs (phone)
  where deleted_at is null;


-- ── D. Server totals (correct even when a phone has partial history) ──
-- security invoker: the caller's existing RLS applies.

create or replace function public.jalasai_invoice_totals()
returns table (invoice_count bigint, billed numeric, collected numeric, net_due numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)                                   as invoice_count,
    coalesce(sum(total_amount), 0)             as billed,
    coalesce(sum(paid_amount), 0)              as collected,
    coalesce(sum(total_amount - paid_amount), 0) as net_due
  from public.garage_jobs
  where deleted_at is null and job_status = 'done';
$$;

-- Same rule as simpleInvoiceNumber() in js/data.js: strip INVOICE/INV and
-- separators, keep only all-digit numbers.
create or replace function public.jalasai_max_invoice_no()
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(max(cleaned::bigint), 0)
  from (
    select regexp_replace(upper(invoice_no), 'INVOICE|INV|[[:space:]#:/-]', '', 'g') as cleaned
    from public.garage_jobs
    where deleted_at is null and job_status = 'done' and invoice_no <> ''
  ) s
  where cleaned ~ '^[0-9]{1,15}$';
$$;

-- Customer balance = sum(total - paid) over live jobs, like jobNetBalance()
-- in js/data.js. Jobs without customer_id are not counted here; the app's
-- phone/name fallback matching stays on the device. Use as a cross-check
-- until the Stage 3 ledger makes this exact.
create or replace view public.garage_customer_balances
with (security_invoker = true)
as
select
  customer_id,
  count(*)                                 as job_count,
  sum(total_amount)                        as billed,
  sum(paid_amount)                         as paid,
  sum(total_amount - paid_amount)          as net_balance
from public.garage_jobs
where deleted_at is null and customer_id <> ''
group by customer_id;

grant execute on function public.jalasai_invoice_totals() to authenticated;
grant execute on function public.jalasai_max_invoice_no() to authenticated;
grant select on public.garage_customer_balances to authenticated;


-- ── E. Changes since a cursor (one request for every table) ────
-- Input:  { "garage_jobs": {"at": "<su>", "id": "<id>"}, "garage_customers": {...}, ... }
--         Only the tables named are read. "at" is the "su" string of the last
--         row this phone applied (microseconds, UTC); leave both empty for
--         "from the beginning". The phone subtracts a 2-minute overlap on the
--         first page so rows from transactions that committed out of order
--         are not missed; re-applying a row is harmless.
-- Output: { "tables": { "garage_jobs": { "rows": [...], "has_more": bool } },
--           "server_time": "<su>" }
--         Rows include deleted ones (deleted_at set), ordered by
--         (server_updated_at, id), at most p_limit per table per call.
-- Keyset paging on (server_updated_at, id) uses the index from section A.

create or replace function public.jalasai_changes_since(p_cursors jsonb, p_limit int default 500)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  allowed text[] := array[
    'garage_customers', 'garage_mechanics', 'garage_jobs', 'garage_stock_items',
    'garage_expenses', 'garage_income_entries', 'garage_parts_log', 'garage_audit_log',
    'garage_stock_movements'
  ];
  -- Same extra columns the app's table pull reads (js/sync.js pullFromShadowTables).
  extra jsonb := jsonb_build_object(
    'garage_jobs', 'customer_id, customer_name, phone, vehicle, registration_no, job_status, job_date, invoice_no, mechanic_ids, mechanic_names, service_note, remarks',
    'garage_income_entries', 'entry_date, income_kind, category, amount, method, invoice_no, note, mechanic_id, mechanic_name'
  );
  lim int := least(greatest(coalesce(p_limit, 500), 1), 1000);
  result jsonb := '{}'::jsonb;
  t text;
  cur jsonb;
  v_at timestamptz;
  v_id text;
  v_rows jsonb;
  v_count int;
begin
  if jsonb_typeof(p_cursors) is distinct from 'object' then
    raise exception 'jalasai_changes_since expects an object of table cursors';
  end if;
  for t in select jsonb_object_keys(p_cursors) loop
    continue when not (t = any(allowed));
    cur := p_cursors->t;
    v_at := coalesce(nullif(cur->>'at', '')::timestamptz, '-infinity'::timestamptz);
    v_id := coalesce(cur->>'id', '');
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(s) order by s.server_updated_at, s.id), ''[]''::jsonb), count(*)
         from (
           select id, record_data, source_updated_at, mirrored_at, deleted_at, server_updated_at%s,
                  to_char(server_updated_at at time zone ''UTC'', ''YYYY-MM-DD"T"HH24:MI:SS.US"Z"'') as su
             from public.%I
            where (server_updated_at, id) > ($1, $2)
            order by server_updated_at, id
            limit $3
         ) s',
      coalesce(', ' || (extra->>t), ''), t)
      into v_rows, v_count
      using v_at, v_id, lim + 1;
    result := result || jsonb_build_object(t, jsonb_build_object(
      'rows', case when v_count > lim then v_rows - lim else v_rows end,
      'has_more', v_count > lim
    ));
  end loop;
  return jsonb_build_object(
    'tables', result,
    'server_time', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );
end;
$$;

grant execute on function public.jalasai_changes_since(jsonb, int) to authenticated;


-- ── F. Newest-first loading for a fresh phone ────────────────────
-- jalasai_recent_jobs: what the first screen needs — every open job, every
-- job without a date, and invoices on or after p_since.
-- jalasai_jobs_before: older invoices, newest first, one page at a time,
-- keyset (job_date, id) so paging never skips or repeats rows. Uses
-- garage_jobs_done_date_idx from section C.
-- Both return the same row shape as jalasai_changes_since.

create or replace function public.jalasai_recent_jobs(p_since date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
  from (
    select id, record_data, source_updated_at, mirrored_at, deleted_at, server_updated_at,
           customer_id, customer_name, phone, vehicle, registration_no, job_status, job_date,
           invoice_no, mechanic_ids, mechanic_names, service_note, remarks,
           to_char(server_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as su
      from public.garage_jobs
     where deleted_at is null
       and (job_status <> 'done' or job_date is null or job_date >= p_since)
  ) s;
$$;

create or replace function public.jalasai_jobs_before(p_date date, p_id text, p_limit int default 500)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(s) order by s.job_date desc, s.id desc), '[]'::jsonb)
  from (
    select id, record_data, source_updated_at, mirrored_at, deleted_at, server_updated_at,
           customer_id, customer_name, phone, vehicle, registration_no, job_status, job_date,
           invoice_no, mechanic_ids, mechanic_names, service_note, remarks,
           to_char(server_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as su
      from public.garage_jobs
     where deleted_at is null
       and job_status = 'done'
       and job_date is not null
       and (job_date, id) < (p_date, p_id)
     order by job_date desc, id desc
     limit least(greatest(coalesce(p_limit, 500), 1), 1000)
  ) s;
$$;

grant execute on function public.jalasai_recent_jobs(date) to authenticated;
grant execute on function public.jalasai_jobs_before(date, text, int) to authenticated;


-- ── G. Report totals for any date range (fast-load Phase 5) ─────
-- Reports for a range whose invoices aren't on the phone (history still
-- downloading, or older than the phone's rolling window) read these instead
-- of local data. garage_daily_totals keeps one running total per day and
-- metric, kept current by triggers on jobs, income and expenses, so any
-- range is a sum of at most a few hundred small rows — fast at lakhs of
-- invoices. Same rules as reportBundle() / jobPaymentEntries() /
-- buildRevenueEntries() in js/:
--   invoices / billed / discounts: live done jobs on their report date
--     (doneAt's date, else date); billed = total_amount;
--   revenue: every positive payment entry on its own date (else doneAt /
--     date) + every live income entry on its date; a done job with no
--     positive payment entries counts its legacy "payment" once;
--   method buckets: contains "upi" -> upi, else contains "cash" -> cash,
--     else other; invoice revenue = job payments; manual income = income
--     entries of kind regular_income / other_income.
-- An entry with no usable date at all is left out (the app would show it
-- on "today", which moves every day). jalasai_rebuild_daily_totals()
-- recomputes everything from scratch; it runs once at the end of this file.

create or replace function public.jalasai_num(p text)
returns numeric
language sql
immutable
as $$
  select case when p ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then trim(p)::numeric else 0 end;
$$;

create or replace function public.jalasai_day(p text)
returns date
language sql
immutable
as $$
  select case when left(coalesce(p, ''), 10) ~ '^\d{4}-\d{2}-\d{2}$' then left(p, 10)::date else null end;
$$;

create or replace function public.jalasai_method_bucket(p text)
returns text
language sql
immutable
as $$
  select case when lower(coalesce(p, '')) like '%upi%' then 'rev_upi'
              when lower(coalesce(p, '')) like '%cash%' then 'rev_cash'
              else 'rev_other' end;
$$;

create table if not exists public.garage_daily_totals (
  day     date    not null,
  metric  text    not null,  -- invoices, billed, discounts, rev_cash, rev_upi, rev_other, rev_invoice, rev_manual, expense
  amount  numeric not null default 0,
  primary key (day, metric)
);

alter table public.garage_daily_totals enable row level security;
drop policy if exists "Authenticated can read daily totals" on public.garage_daily_totals;
create policy "Authenticated can read daily totals"
  on public.garage_daily_totals for select to authenticated using (true);
grant select on public.garage_daily_totals to authenticated;

-- What one job row adds to the daily totals (nothing unless live and done).
create or replace function public.jalasai_job_day_totals(r jsonb, status text, deleted_at timestamptz, total numeric)
returns table (day date, metric text, amount numeric)
language sql
immutable
as $$
  with job as (
    select r,
           case when jsonb_typeof(r->'payments') = 'array' then r->'payments' else '[]'::jsonb end as pays,
           coalesce(public.jalasai_day(r->>'doneAt'), public.jalasai_day(r->>'date')) as report_day
     where deleted_at is null and status = 'done'
  ),
  pay as (
    select coalesce(public.jalasai_day(p->>'at'), public.jalasai_day(job.r->>'doneAt'), public.jalasai_day(job.r->>'date')) as day,
           public.jalasai_num(p->>'amount') as amount,
           coalesce(nullif(p->>'method', ''), job.r->>'payMethod', '') as method
      from job, jsonb_array_elements(job.pays) p
     where public.jalasai_num(p->>'amount') > 0
    union all
    select job.report_day, public.jalasai_num(job.r->>'payment'), coalesce(job.r->>'payMethod', '')
      from job
     where public.jalasai_num(job.r->>'payment') > 0
       and not exists (select 1 from jsonb_array_elements(job.pays) p where public.jalasai_num(p->>'amount') > 0)
  )
  select report_day, 'invoices', 1::numeric from job where report_day is not null
  union all select report_day, 'billed', coalesce(total, 0) from job where report_day is not null
  union all select report_day, 'discounts', greatest(0, public.jalasai_num(r->>'discount')) from job where report_day is not null
  union all select day, public.jalasai_method_bucket(method), amount from pay where day is not null
  union all select day, 'rev_invoice', amount from pay where day is not null;
$$;

create or replace function public.jalasai_income_day_totals(p_day date, p_kind text, p_method text, p_amount numeric, p_deleted_at timestamptz)
returns table (day date, metric text, amount numeric)
language sql
immutable
as $$
  select p_day, public.jalasai_method_bucket(p_method), coalesce(p_amount, 0) where p_deleted_at is null and p_day is not null
  union all
  select p_day, 'rev_manual', coalesce(p_amount, 0) where p_deleted_at is null and p_day is not null and p_kind in ('regular_income', 'other_income');
$$;

create or replace function public.jalasai_add_day_totals(rows jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.garage_daily_totals (day, metric, amount)
  select (x->>'day')::date, x->>'metric', sum((x->>'amount')::numeric)
    from jsonb_array_elements(rows) x
   group by 1, 2
  having sum((x->>'amount')::numeric) <> 0
  on conflict (day, metric) do update set amount = public.garage_daily_totals.amount + excluded.amount;
$$;

create or replace function public.jalasai_jobs_daily_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta jsonb := '[]'::jsonb;
begin
  if tg_op = 'UPDATE'
     and old.record_data is not distinct from new.record_data
     and old.job_status is not distinct from new.job_status
     and old.deleted_at is not distinct from new.deleted_at
     and old.total_amount is not distinct from new.total_amount then
    return new;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    select coalesce(jsonb_agg(jsonb_build_object('day', t.day, 'metric', t.metric, 'amount', -t.amount)), '[]'::jsonb) || delta into delta
      from public.jalasai_job_day_totals(old.record_data, old.job_status, old.deleted_at, old.total_amount) t;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select delta || coalesce(jsonb_agg(jsonb_build_object('day', t.day, 'metric', t.metric, 'amount', t.amount)), '[]'::jsonb) into delta
      from public.jalasai_job_day_totals(new.record_data, new.job_status, new.deleted_at, new.total_amount) t;
  end if;
  if jsonb_array_length(delta) > 0 then perform public.jalasai_add_day_totals(delta); end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.jalasai_income_daily_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta jsonb := '[]'::jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select coalesce(jsonb_agg(jsonb_build_object('day', t.day, 'metric', t.metric, 'amount', -t.amount)), '[]'::jsonb) into delta
      from public.jalasai_income_day_totals(old.entry_date, old.income_kind, old.method, old.amount, old.deleted_at) t;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select delta || coalesce(jsonb_agg(jsonb_build_object('day', t.day, 'metric', t.metric, 'amount', t.amount)), '[]'::jsonb) into delta
      from public.jalasai_income_day_totals(new.entry_date, new.income_kind, new.method, new.amount, new.deleted_at) t;
  end if;
  if jsonb_array_length(delta) > 0 then perform public.jalasai_add_day_totals(delta); end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.jalasai_expense_daily_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta jsonb := '[]'::jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.deleted_at is null and old.expense_date is not null then
    delta := delta || jsonb_build_array(jsonb_build_object('day', old.expense_date, 'metric', 'expense', 'amount', -coalesce(old.amount, 0)));
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.deleted_at is null and new.expense_date is not null then
    delta := delta || jsonb_build_array(jsonb_build_object('day', new.expense_date, 'metric', 'expense', 'amount', coalesce(new.amount, 0)));
  end if;
  if jsonb_array_length(delta) > 0 then perform public.jalasai_add_day_totals(delta); end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists garage_jobs_daily_totals on public.garage_jobs;
create trigger garage_jobs_daily_totals after insert or update or delete on public.garage_jobs
  for each row execute function public.jalasai_jobs_daily_trigger();
drop trigger if exists garage_income_entries_daily_totals on public.garage_income_entries;
create trigger garage_income_entries_daily_totals after insert or update or delete on public.garage_income_entries
  for each row execute function public.jalasai_income_daily_trigger();
drop trigger if exists garage_expenses_daily_totals on public.garage_expenses;
create trigger garage_expenses_daily_totals after insert or update or delete on public.garage_expenses
  for each row execute function public.jalasai_expense_daily_trigger();

-- Recompute every daily total from the source tables (safe to re-run; used
-- once below and whenever totals need checking).
create or replace function public.jalasai_rebuild_daily_totals()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  lock table public.garage_daily_totals in exclusive mode;
  delete from public.garage_daily_totals;
  insert into public.garage_daily_totals (day, metric, amount)
  select day, metric, sum(amount) from (
    select t.* from public.garage_jobs j,
      lateral public.jalasai_job_day_totals(j.record_data, j.job_status, j.deleted_at, j.total_amount) t
    union all
    select t.* from public.garage_income_entries i,
      lateral public.jalasai_income_day_totals(i.entry_date, i.income_kind, i.method, i.amount, i.deleted_at) t
    union all
    select e.expense_date, 'expense', coalesce(e.amount, 0) from public.garage_expenses e
     where e.deleted_at is null and e.expense_date is not null
  ) s
  where day is not null
  group by 1, 2
  having sum(amount) <> 0;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.jalasai_report_summary(p_start date, p_end date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with t as (
    select metric, coalesce(sum(amount), 0) as amount
      from public.garage_daily_totals
     where day between p_start and p_end
     group by metric
  ),
  m as (
    select coalesce(max(amount) filter (where metric = 'invoices'), 0) as invoices,
           coalesce(max(amount) filter (where metric = 'billed'), 0) as billed,
           coalesce(max(amount) filter (where metric = 'discounts'), 0) as discounts,
           coalesce(max(amount) filter (where metric = 'rev_cash'), 0) as cash,
           coalesce(max(amount) filter (where metric = 'rev_upi'), 0) as upi,
           coalesce(max(amount) filter (where metric = 'rev_other'), 0) as other,
           coalesce(max(amount) filter (where metric = 'rev_invoice'), 0) as invoice_revenue,
           coalesce(max(amount) filter (where metric = 'rev_manual'), 0) as manual_income,
           coalesce(max(amount) filter (where metric = 'expense'), 0) as expense
      from t
  )
  select jsonb_build_object(
    'start', p_start,
    'end', p_end,
    'invoices', invoices,
    'billed', billed,
    'discounts', discounts,
    'revenue', cash + upi + other,
    'paymentMix', jsonb_build_object('cash', cash, 'upi', upi, 'other', other),
    'invoiceRevenue', invoice_revenue,
    'manualIncome', manual_income,
    'expense', expense
  )
  from m;
$$;

grant execute on function public.jalasai_report_summary(date, date) to authenticated;
revoke all on function public.jalasai_add_day_totals(jsonb) from public, anon, authenticated;
revoke all on function public.jalasai_rebuild_daily_totals() from public, anon, authenticated;

select public.jalasai_rebuild_daily_totals();

-- ── H. Lakh scale: rolling window, older invoices on demand, search ──
-- Phones keep about the last year of invoices (capped at a number of
-- invoices) and fetch older ones only when someone scrolls, searches or
-- opens a customer. These functions return the same row shape as
-- jalasai_changes_since, so the app merges them with the normal rules.

-- First day a phone keeps: a year back, or later if that would be more than
-- p_max invoices.
create or replace function public.jalasai_window_from(p_days int default 365, p_max int default 20000)
returns date
language sql
stable
security invoker
set search_path = public
as $$
  select greatest(
    current_date - greatest(coalesce(p_days, 365), 30),
    coalesce((select job_date from public.garage_jobs
               where deleted_at is null and job_status = 'done' and job_date is not null
               order by job_date desc, id desc
              offset greatest(coalesce(p_max, 20000), 1000) - 1 limit 1), date '1900-01-01')
  );
$$;

-- Older invoices a phone must still hold: anything with money owing or an
-- advance (customer balances need it) and every customer's latest job
-- (service reminders and "last visit" need it).
create or replace function public.jalasai_jobs_keep(p_before date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with live as (
    select * from public.garage_jobs
     where deleted_at is null and job_status = 'done' and job_date < p_before
  ),
  owing as (
    select id from live where abs(coalesce(total_amount, 0) - coalesce(paid_amount, 0)) > 0.009
  ),
  latest as (
    select distinct on (coalesce(nullif(customer_id, ''), nullif(phone, ''), id)) id
      from public.garage_jobs
     where deleted_at is null
     order by coalesce(nullif(customer_id, ''), nullif(phone, ''), id), job_date desc nulls last, id desc
  )
  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
  from (
    select id, record_data, source_updated_at, mirrored_at, deleted_at, server_updated_at,
           customer_id, customer_name, phone, vehicle, registration_no, job_status, job_date,
           invoice_no, mechanic_ids, mechanic_names, service_note, remarks,
           to_char(server_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as su
      from live
     where id in (select id from owing) or id in (select id from latest)
  ) s;
$$;

-- Every job of one customer (by id and/or phone), newest first.
create or replace function public.jalasai_customer_jobs(p_customer_id text, p_phone text, p_limit int default 500)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(s) order by s.job_date desc nulls last, s.id desc), '[]'::jsonb)
  from (
    select id, record_data, source_updated_at, mirrored_at, deleted_at, server_updated_at,
           customer_id, customer_name, phone, vehicle, registration_no, job_status, job_date,
           invoice_no, mechanic_ids, mechanic_names, service_note, remarks,
           to_char(server_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as su
      from public.garage_jobs
     where deleted_at is null
       and ((coalesce(p_customer_id, '') <> '' and customer_id = p_customer_id)
         or (coalesce(p_phone, '') <> '' and phone = p_phone))
     order by job_date desc nulls last, id desc
     limit least(greatest(coalesce(p_limit, 500), 1), 2000)
  ) s;
$$;

-- Search all invoices on the server: invoice number, customer, phone,
-- vehicle, registration. Uses a trigram index so "contains" search stays
-- fast at lakhs of rows.
create extension if not exists pg_trgm;

create or replace function public.jalasai_job_search_text(invoice_no text, customer_name text, phone text, vehicle text, registration_no text)
returns text
language sql
immutable
as $$
  select lower(concat_ws(' ', invoice_no, customer_name, phone, vehicle, registration_no));
$$;

create index if not exists garage_jobs_search_trgm_idx
  on public.garage_jobs using gin (public.jalasai_job_search_text(invoice_no, customer_name, phone, vehicle, registration_no) gin_trgm_ops)
  where deleted_at is null;

create or replace function public.jalasai_search_jobs(p_query text, p_limit int default 50)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(s) order by s.job_date desc nulls last, s.id desc), '[]'::jsonb)
  from (
    select id, record_data, source_updated_at, mirrored_at, deleted_at, server_updated_at,
           customer_id, customer_name, phone, vehicle, registration_no, job_status, job_date,
           invoice_no, mechanic_ids, mechanic_names, service_note, remarks,
           to_char(server_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as su
      from public.garage_jobs
     where deleted_at is null
       and length(trim(coalesce(p_query, ''))) >= 2
       and public.jalasai_job_search_text(invoice_no, customer_name, phone, vehicle, registration_no)
           like '%' || lower(trim(p_query)) || '%'
     order by job_date desc nulls last, id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200)
  ) s;
$$;

-- Before a phone drops an old record it checks the cloud holds the same
-- version (same source_hash, same delete state). Only these tables.
drop function if exists public.jalasai_record_hashes(text, text[]);
create or replace function public.jalasai_record_hashes(p_table text, p_ids jsonb)
returns table (id text, source_hash text, deleted boolean)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_table not in ('garage_jobs', 'garage_expenses', 'garage_income_entries', 'garage_stock_movements', 'garage_parts_log', 'garage_audit_log') then
    raise exception 'table % not allowed', p_table;
  end if;
  return query execute format(
    'select t.id, t.source_hash, (t.deleted_at is not null) from public.%I t where t.id = any($1)', p_table
  ) using array(select jsonb_array_elements_text(coalesce(p_ids, '[]'::jsonb)));
end;
$$;

grant execute on function public.jalasai_window_from(int, int) to authenticated;
grant execute on function public.jalasai_jobs_keep(date) to authenticated;
grant execute on function public.jalasai_customer_jobs(text, text, int) to authenticated;
grant execute on function public.jalasai_search_jobs(text, int) to authenticated;
grant execute on function public.jalasai_record_hashes(text, jsonb) to authenticated;




-- ════════════════════════════════════════════════════════════════
-- CHECK FIRST (run alone, before the file above; copy the results into
-- the plan doc). Read-only.
-- ════════════════════════════════════════════════════════════════
-- select 'jobs' t, count(*) total, count(*) filter (where deleted_at is null) live,
--        count(*) filter (where deleted_at is null and job_status = 'done') invoices
--   from public.garage_jobs
-- union all select 'customers', count(*), count(*) filter (where deleted_at is null), null from public.garage_customers
-- union all select 'job_payments', count(*), count(*) filter (where deleted_at is null), null from public.garage_job_payments
-- union all select 'audit_log', count(*), count(*) filter (where deleted_at is null), null from public.garage_audit_log
-- union all select 'stock_items', count(*), count(*) filter (where deleted_at is null), null from public.garage_stock_items;
--
-- select pg_size_pretty(pg_total_relation_size('public.garage_jobs')) jobs_size,
--        pg_size_pretty(pg_database_size(current_database()))     db_size;
--
-- show statement_timeout;
--
-- -- Duplicate live invoice numbers (must be understood before any future
-- -- unique index / server-issued numbering):
-- select upper(invoice_no), count(*) from public.garage_jobs
--  where deleted_at is null and job_status = 'done' and invoice_no <> ''
--  group by 1 having count(*) > 1 order by 2 desc limit 50;

-- ════════════════════════════════════════════════════════════════
-- VERIFY AFTER (read-only)
-- ════════════════════════════════════════════════════════════════
-- select count(*) filter (where server_updated_at is null) from public.garage_jobs;   -- expect 0
-- select * from public.jalasai_invoice_totals();
-- select public.jalasai_max_invoice_no();
-- explain analyze select id from public.garage_jobs
--  where server_updated_at > now() - interval '1 day' order by server_updated_at, id limit 500;
-- explain analyze select id, invoice_no from public.garage_jobs
--  where deleted_at is null and job_status = 'done' order by job_date desc, id desc limit 50;
