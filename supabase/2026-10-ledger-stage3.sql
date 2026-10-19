-- ════════════════════════════════════════════════════════════════
-- Stage 3 — money ledger (DRAFT — NOT RUN YET)
-- docs/LONG_TERM_DATA_ROADMAP_2026_10.md "Stage 3"
--
-- Needs supabase/2026-10-fast-sync-phase1.sql first (jalasai_num).
--
-- garage_ledger_entries is INSERT-ONLY: nothing in it is ever updated or
-- deleted. Every saved change to a job's money adds lines:
--   * "charge"  — the invoice total (ref 'total');
--   * "payment" / "advance" — one line per payment entry (ref = its id),
--     amount negative (money received);
--   * "unlisted-payment" — the part of the job's paid amount not covered by
--     payment entries (old single-amount records), so the lines always add up
--     to exactly total − paid;
--   * "change" — when an amount above is edited later: a line with the
--     difference;
--   * "reversal" — when a payment is removed or the job is deleted: a line
--     cancelling what was there.
-- So for every job, sum(amount) = what the customer owes on it (negative =
-- advance), exactly as the app computes it (jobTotal − jobPaid), and every
-- rupee ever recorded stays visible with who/when/which phone.
-- jalasai_ledger_reconcile() lists any job where that isn't true (expect none).
--
-- The app keeps working on its job records unchanged; the ledger follows them
-- on the server, so this adds safety without touching how invoices are made.
-- ADDITIVE ONLY and safe to run more than once.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.garage_ledger_entries (
  entry_id     bigint generated always as identity primary key,
  job_id       text not null,
  customer_key text not null default '',   -- customer id, else phone, else job id
  kind         text not null,              -- charge | payment | advance | unlisted-payment | change | reversal
  ref          text not null,              -- 'total', a payment id, or 'unlisted'
  amount       numeric not null,           -- + adds to what the customer owes, − is money in
  method       text not null default '',
  day          date,                       -- business date of the money event
  invoice_no   text not null default '',
  note         text not null default '',
  recorded_at  timestamptz not null default now(),
  recorded_by  uuid,
  device_id    text not null default ''
);

create index if not exists garage_ledger_job_idx on public.garage_ledger_entries (job_id, ref);
create index if not exists garage_ledger_customer_idx on public.garage_ledger_entries (customer_key, day, entry_id);
create index if not exists garage_ledger_day_idx on public.garage_ledger_entries (day);

-- Insert-only, enforced.
create or replace function public.jalasai_ledger_no_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'garage_ledger_entries is insert-only; add a reversal line instead';
end;
$$;

drop trigger if exists garage_ledger_no_update on public.garage_ledger_entries;
create trigger garage_ledger_no_update before update or delete on public.garage_ledger_entries
  for each row execute function public.jalasai_ledger_no_change();

alter table public.garage_ledger_entries enable row level security;
drop policy if exists "Authenticated can read ledger" on public.garage_ledger_entries;
create policy "Authenticated can read ledger" on public.garage_ledger_entries for select to authenticated using (true);
grant select on public.garage_ledger_entries to authenticated;

-- What the ledger should currently say for one job: (ref, kind, amount,
-- method, day). Empty for a deleted job.
create or replace function public.jalasai_job_ledger_lines(r jsonb, deleted_at timestamptz, total numeric, paid numeric)
returns table (ref text, kind text, amount numeric, method text, day date)
language sql
immutable
as $$
  with job as (
    select r,
           case when jsonb_typeof(r->'payments') = 'array' then r->'payments' else '[]'::jsonb end as pays,
           coalesce(public.jalasai_day(r->>'doneAt'), public.jalasai_day(r->>'date')) as job_day
     where deleted_at is null
  ),
  pay as (
    select coalesce(nullif(p->>'id', ''), 'pay-' || md5(p::text)) as ref,
           case when p->>'source' = 'job-create' then 'advance' else 'payment' end as kind,
           -public.jalasai_num(p->>'amount') as amount,
           coalesce(nullif(p->>'method', ''), job.r->>'payMethod', '') as method,
           coalesce(public.jalasai_day(p->>'at'), job.job_day) as day
      from job, jsonb_array_elements(job.pays) p
     where public.jalasai_num(p->>'amount') <> 0
  )
  select 'total', 'charge', coalesce(total, 0), '', job_day from job
  union all
  select ref, kind, amount, method, day from pay
  union all
  -- Paid amount not covered by payment entries (old records with only a
  -- single "payment" figure, or entries that don't add up to it).
  select 'unlisted', 'unlisted-payment',
         -(coalesce(paid, 0) + coalesce((select sum(amount) from pay), 0)),
         coalesce(r->>'payMethod', ''), job_day
    from job
   where abs(coalesce(paid, 0) + coalesce((select sum(amount) from pay), 0)) > 0.0001;
$$;

-- Adds the lines that move the ledger from what it says now to what the job
-- says now. Called by the trigger (one job at a time, under the job row's
-- lock) and by the one-time backfill.
create or replace function public.jalasai_ledger_sync_job(p_job_id text, r jsonb, deleted_at timestamptz, total numeric, paid numeric,
                                                          p_customer_key text, p_invoice_no text, p_device text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  with want as (
    -- One line per ref (two payment entries sharing an id count once each
    -- in the amount, under one ref).
    select ref, max(kind) as kind, sum(amount) as amount, max(method) as method, max(day) as day
      from public.jalasai_job_ledger_lines(r, deleted_at, total, paid)
     group by ref
  ),
  have as (
    select ref, sum(amount) as amount, count(*) as lines
      from public.garage_ledger_entries
     where job_id = p_job_id
     group by ref
  ),
  delta as (
    select coalesce(w.ref, h.ref) as ref,
           coalesce(w.amount, 0) - coalesce(h.amount, 0) as amount,
           w.kind as want_kind, w.method, w.day,
           coalesce(h.lines, 0) as had_lines,
           (w.ref is null) as gone
      from want w full join have h on h.ref = w.ref
  )
  insert into public.garage_ledger_entries (job_id, customer_key, kind, ref, amount, method, day, invoice_no, recorded_by, device_id)
  select p_job_id, coalesce(p_customer_key, ''),
         case when gone then 'reversal'
              when had_lines = 0 then want_kind
              else 'change' end,
         ref, amount, coalesce(method, ''),
         coalesce(day, current_date), coalesce(p_invoice_no, ''), auth.uid(), coalesce(p_device, '')
    from delta
   where abs(amount) > 0.0001;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.jalasai_job_customer_key(customer_id text, phone text, job_id text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(trim(customer_id), ''), nullif(trim(phone), ''), job_id);
$$;

create or replace function public.jalasai_jobs_ledger_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.record_data is not distinct from new.record_data
     and old.deleted_at is not distinct from new.deleted_at
     and old.total_amount is not distinct from new.total_amount
     and old.paid_amount is not distinct from new.paid_amount then
    return new;
  end if;
  if tg_op = 'DELETE' then
    perform public.jalasai_ledger_sync_job(old.id, old.record_data, now(), 0, 0,
      public.jalasai_job_customer_key(old.customer_id, old.phone, old.id), old.invoice_no, '');
    return old;
  end if;
  perform public.jalasai_ledger_sync_job(new.id, new.record_data, new.deleted_at, new.total_amount, new.paid_amount,
    public.jalasai_job_customer_key(new.customer_id, new.phone, new.id), new.invoice_no, coalesce(new.device_id, ''));
  return new;
end;
$$;

drop trigger if exists garage_jobs_ledger on public.garage_jobs;
create trigger garage_jobs_ledger after insert or update or delete on public.garage_jobs
  for each row execute function public.jalasai_jobs_ledger_trigger();

-- One-time opening lines for jobs that have none yet (re-runs add nothing).
do $$
declare
  j record;
begin
  for j in
    select g.* from public.garage_jobs g
     where not exists (select 1 from public.garage_ledger_entries e where e.job_id = g.id)
  loop
    perform public.jalasai_ledger_sync_job(j.id, j.record_data, j.deleted_at, j.total_amount, j.paid_amount,
      public.jalasai_job_customer_key(j.customer_id, j.phone, j.id), j.invoice_no, coalesce(j.device_id, ''));
  end loop;
end;
$$;

-- Jobs where the ledger and the job disagree (expect no rows). The job's
-- figure is the app's: total − paid for a live job, 0 for a deleted one.
create or replace function public.jalasai_ledger_reconcile()
returns table (job_id text, ledger numeric, job numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with l as (select e.job_id, sum(e.amount) as amount from public.garage_ledger_entries e group by e.job_id),
       j as (select g.id, case when g.deleted_at is null then coalesce(g.total_amount, 0) - coalesce(g.paid_amount, 0) else 0 end as amount
               from public.garage_jobs g)
  select coalesce(j.id, l.job_id), coalesce(l.amount, 0), coalesce(j.amount, 0)
    from j full join l on l.job_id = j.id
   where abs(coalesce(l.amount, 0) - coalesce(j.amount, 0)) > 0.005;
$$;

-- Customer balances straight from the ledger (+ owes, − advance).
create or replace view public.garage_ledger_balances
with (security_invoker = true)
as
select customer_key, sum(amount) as balance, count(*) as lines, max(recorded_at) as last_entry_at
  from public.garage_ledger_entries
 group by customer_key;
grant select on public.garage_ledger_balances to authenticated;

-- A customer's statement: every line in a date range, with the balance
-- before it. Used by the Stage 6 statement link / PDF.
create or replace function public.jalasai_customer_statement(p_customer_key text, p_from date default null, p_to date default null)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with lines as (
    -- The invoice's current number (a draft number later replaced by the
    -- server's shows as the real one).
    select e.*, coalesce(nullif(j.invoice_no, ''), e.invoice_no) as current_invoice_no
      from public.garage_ledger_entries e
      left join public.garage_jobs j on j.id = e.job_id
     where e.customer_key = p_customer_key
  ),
  opening as (
    select coalesce(sum(amount), 0) as amount from lines where p_from is not null and day < p_from
  ),
  inrange as (
    select * from lines
     where (p_from is null or day >= p_from) and (p_to is null or day <= p_to)
     order by day, entry_id
  )
  select jsonb_build_object(
    'customer_key', p_customer_key,
    'from', p_from, 'to', p_to,
    'opening', (select amount from opening),
    'closing', (select amount from opening) + coalesce((select sum(amount) from inrange), 0),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
        'day', day, 'kind', kind, 'amount', amount, 'method', method,
        'invoice_no', current_invoice_no, 'job_id', job_id, 'recorded_at', recorded_at)
        order by day, entry_id) from inrange), '[]'::jsonb)
  );
$$;

grant execute on function public.jalasai_ledger_reconcile() to authenticated;
grant execute on function public.jalasai_customer_statement(text, date, date) to authenticated;
revoke all on function public.jalasai_ledger_sync_job(text, jsonb, timestamptz, numeric, numeric, text, text, text) from public, anon, authenticated;

-- VERIFY AFTER (read-only):
-- select count(*) from public.jalasai_ledger_reconcile();   -- expect 0
-- select * from public.garage_ledger_balances order by balance desc limit 20;
