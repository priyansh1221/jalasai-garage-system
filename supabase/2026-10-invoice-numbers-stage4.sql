-- ════════════════════════════════════════════════════════════════
-- Stage 4 — invoice numbers issued by the server (DRAFT — NOT RUN YET)
-- docs/LONG_TERM_DATA_ROADMAP_2026_10.md "Stage 4"
--
-- Needs supabase/2026-10-fast-sync-phase1.sql first (jalasai_max_invoice_no).
-- The garage is not GST-registered, so numbers stay plain (e.g. 10564) and
-- keep counting from today's highest number. What changes: two phones can
-- never hand out the same number, and a phone that's offline shows a draft
-- number (D-AB12-3) that becomes the real one when it reconnects.
--
-- ADDITIVE ONLY and safe to run more than once. Old app versions keep their
-- own numbering (and the duplicate warning below still sees their numbers).
-- ════════════════════════════════════════════════════════════════

-- Same normalising rules as invoiceRefKey() / simpleInvoiceNumber() in
-- js/jobs.js, so the server's duplicate check agrees with the phone's.
create or replace function public.jalasai_invoice_ref_key(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(upper(trim(coalesce(p, ''))), '\mINVOICE\M', '', 'g'),
             '\mINV\M', '', 'g'),
           '[^A-Z0-9]', '', 'g');
$$;

create or replace function public.jalasai_invoice_simple(p text)
returns text
language sql
immutable
as $$
  select case
    when regexp_replace(upper(trim(coalesce(p, ''))), 'INVOICE|INV|[[:space:]#:/-]', '', 'g') ~ '^[0-9]+$'
      then coalesce(nullif(ltrim(regexp_replace(upper(trim(p)), 'INVOICE|INV|[[:space:]#:/-]', '', 'g'), '0'), ''), '0')
    else ''
  end;
$$;

create index if not exists garage_jobs_invoice_ref_idx
  on public.garage_jobs (public.jalasai_invoice_ref_key(invoice_no))
  where deleted_at is null and job_status = 'done';
create index if not exists garage_jobs_invoice_simple_idx
  on public.garage_jobs (public.jalasai_invoice_simple(invoice_no))
  where deleted_at is null and job_status = 'done';

-- One counter. width keeps the shop's look (leading zeros if the numbers
-- have them, e.g. 0042).
create table if not exists public.garage_invoice_series (
  id         text primary key default 'main',
  next_no    bigint not null,
  width      int not null default 1,
  updated_at timestamptz not null default now()
);

-- Which job got which number. A phone that retries after a lost reply gets
-- the same number back, never a second one.
create table if not exists public.garage_invoice_claims (
  job_id     text primary key,
  invoice_no text not null unique,
  claimed_at timestamptz not null default now(),
  claimed_by uuid
);

alter table public.garage_invoice_series enable row level security;
alter table public.garage_invoice_claims enable row level security;
drop policy if exists "Authenticated can read invoice series" on public.garage_invoice_series;
create policy "Authenticated can read invoice series" on public.garage_invoice_series for select to authenticated using (true);
drop policy if exists "Authenticated can read invoice claims" on public.garage_invoice_claims;
create policy "Authenticated can read invoice claims" on public.garage_invoice_claims for select to authenticated using (true);
grant select on public.garage_invoice_series, public.garage_invoice_claims to authenticated;

-- Start after the highest number in use today (never move backwards on a
-- re-run).
insert into public.garage_invoice_series (id, next_no, width)
select 'main',
       public.jalasai_max_invoice_no() + 1,
       coalesce((
         select length(public.jalasai_invoice_simple(invoice_no))
           from public.garage_jobs
          where deleted_at is null and job_status = 'done'
            and public.jalasai_invoice_simple(invoice_no) <> ''
            and regexp_replace(upper(invoice_no), 'INVOICE|INV|[[:space:]#:/-]', '', 'g') ~ '^0'
          limit 1), 1)
on conflict (id) do update
  set next_no = greatest(public.garage_invoice_series.next_no, excluded.next_no);

-- The id of a live invoice already using this number (other than p_job_id),
-- or null. Matches like the phone: same normalised text, or same plain number.
create or replace function public.jalasai_invoice_no_taken(p_no text, p_job_id text default '')
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select id
    from public.garage_jobs
   where deleted_at is null and job_status = 'done'
     and id <> coalesce(p_job_id, '')
     and public.jalasai_invoice_ref_key(p_no) <> ''
     and (public.jalasai_invoice_ref_key(invoice_no) = public.jalasai_invoice_ref_key(p_no)
          or (public.jalasai_invoice_simple(p_no) <> ''
              and public.jalasai_invoice_simple(invoice_no) = public.jalasai_invoice_simple(p_no)))
   limit 1;
$$;

-- The next free number for this job (or the one it already got).
create or replace function public.jalasai_claim_invoice_no(p_job_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_no bigint;
  v_width int;
  v_text text;
begin
  if coalesce(trim(p_job_id), '') = '' then
    raise exception 'job id required';
  end if;
  select invoice_no into v_text from public.garage_invoice_claims where job_id = p_job_id;
  if found then
    return v_text;
  end if;
  loop
    -- The row lock on the counter makes concurrent claims take turns.
    update public.garage_invoice_series
       set next_no = next_no + 1, updated_at = now()
     where id = 'main'
    returning next_no - 1, width into v_no, v_width;
    if v_no is null then
      raise exception 'invoice series missing: run supabase/2026-10-invoice-numbers-stage4.sql';
    end if;
    v_text := lpad(v_no::text, greatest(coalesce(v_width, 1), length(v_no::text)), '0');
    -- Skip a number someone typed by hand or an old app version used.
    exit when not exists (
        select 1 from public.garage_jobs
         where deleted_at is null and job_status = 'done'
           and public.jalasai_invoice_simple(invoice_no) = v_no::text)
      and not exists (select 1 from public.garage_invoice_claims where invoice_no = v_text);
  end loop;
  insert into public.garage_invoice_claims (job_id, invoice_no, claimed_by)
  values (p_job_id, v_text, auth.uid());
  return v_text;
end;
$$;

revoke all on function public.jalasai_claim_invoice_no(text) from public, anon;
grant execute on function public.jalasai_claim_invoice_no(text) to authenticated;
grant execute on function public.jalasai_invoice_no_taken(text, text) to authenticated;

-- VERIFY AFTER (read-only):
-- select * from public.garage_invoice_series;
-- select public.jalasai_invoice_no_taken('10500');   -- id of the job using 10500, or null
