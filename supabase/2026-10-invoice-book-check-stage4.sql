-- ════════════════════════════════════════════════════════════════
-- Stage 4 — invoice-number duplicate check against the cloud ("book mode")
-- docs/LONG_TERM_DATA_ROADMAP_2026_10.md "Stage 4"
--
-- Invoice numbers come from the garage's physical invoice book: staff type
-- the number written in the book, and the app never makes one up. Phones
-- only hold about a year of invoices (rolling window), so the phone's own
-- duplicate check can't see older ones. This file adds one read-only check
-- the app calls after a number is typed: "is this number already used by
-- another invoice anywhere in the cloud?"
--
-- It does NOT issue numbers. No counter, no drafts, nothing is written.
-- ADDITIVE ONLY and safe to run more than once. Old app versions ignore it.
-- (An earlier draft of this file issued numbers from the server; that was
-- dropped on 2026-10-21 because the numbers must match the paper book.
-- It was never run on live.)
-- ════════════════════════════════════════════════════════════════

-- Same normalising rules as invoiceRefKey() / simpleInvoiceNumber() in
-- js/jobs.js and js/data.js, so the server's check agrees with the phone's.
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

-- The id of a live invoice already using this number (other than p_job_id),
-- or null. Matches like the phone: same normalised text, or same plain number
-- (so "INV-0042" and "42" count as the same).
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

grant execute on function public.jalasai_invoice_no_taken(text, text) to authenticated;

-- ════════════════════════════════════════════════════════════════
-- VERIFY AFTER (read-only). One row:
--   taken_10500 → the id of the job using 10500 (or null)
--   free_check  → null (nobody uses this made-up number)
--   duplicates  → how many book numbers are used by more than one invoice
-- ════════════════════════════════════════════════════════════════
-- select
--   public.jalasai_invoice_no_taken('10500') as taken_10500,
--   public.jalasai_invoice_no_taken('99999999') as free_check,
--   (select count(*) from (
--      select public.jalasai_invoice_simple(invoice_no)
--        from public.garage_jobs
--       where deleted_at is null and job_status = 'done'
--         and public.jalasai_invoice_simple(invoice_no) <> ''
--       group by 1 having count(*) > 1) d) as duplicates;
