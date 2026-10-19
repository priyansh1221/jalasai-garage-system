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
