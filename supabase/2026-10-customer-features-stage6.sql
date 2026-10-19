-- ════════════════════════════════════════════════════════════════
-- Stage 6 — customer statements and staff roles (DRAFT — NOT RUN YET)
-- docs/LONG_TERM_DATA_ROADMAP_2026_10.md "Stage 6"
--
-- Needs supabase/2026-10-ledger-stage3.sql first (the money ledger).
-- ADDITIVE ONLY and safe to run more than once. Until an owner adds staff
-- roles, every signed-in user keeps the access they have today.
-- ════════════════════════════════════════════════════════════════

-- ── A. Staff roles ───────────────────────────────────────────────
-- owner: everything, manages roles. manager: everything except roles.
-- mechanic: jobs and stock, but not money reports, the ledger or statements.
-- While garage_staff is empty everyone is treated as owner (today's access);
-- the first person to open "Staff roles" becomes the owner. A signed-in user
-- not on the list once it exists is a manager (staff who sign in today keep
-- working).
create table if not exists public.garage_staff (
  user_id   uuid primary key,
  email     text not null default '',
  role      text not null check (role in ('owner', 'manager', 'mechanic')),
  added_at  timestamptz not null default now(),
  added_by  uuid
);
alter table public.garage_staff enable row level security;
drop policy if exists "Staff can read staff list" on public.garage_staff;
create policy "Staff can read staff list" on public.garage_staff for select to authenticated using (true);
grant select on public.garage_staff to authenticated;

create or replace function public.jalasai_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (select 1 from public.garage_staff) then 'owner'
    else coalesce((select role from public.garage_staff where user_id = auth.uid()), 'manager')
  end;
$$;

-- First owner: only while nobody has a role yet.
create or replace function public.jalasai_claim_owner()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  lock table public.garage_staff in exclusive mode;
  if exists (select 1 from public.garage_staff) then
    return public.jalasai_my_role();
  end if;
  insert into public.garage_staff (user_id, email, role, added_by)
  select auth.uid(), coalesce((select email from auth.users where id = auth.uid()), ''), 'owner', auth.uid();
  return 'owner';
end;
$$;

-- Owner only: set someone's role by the email they sign in with.
create or replace function public.jalasai_set_staff_role(p_email text, p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if public.jalasai_my_role() <> 'owner' then raise exception 'only the owner can change staff roles'; end if;
  if p_role not in ('owner', 'manager', 'mechanic') then raise exception 'role must be owner, manager or mechanic'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_user is null then raise exception 'no account signs in with %', p_email; end if;
  if v_user = auth.uid() and p_role <> 'owner'
     and not exists (select 1 from public.garage_staff where role = 'owner' and user_id <> auth.uid()) then
    raise exception 'add another owner before changing your own role';
  end if;
  insert into public.garage_staff (user_id, email, role, added_by)
  values (v_user, lower(trim(p_email)), p_role, auth.uid())
  on conflict (user_id) do update set role = excluded.role, email = excluded.email, added_by = excluded.added_by, added_at = now();
  return p_role;
end;
$$;

-- Money data only for owner / manager (mechanics still see jobs and stock).
drop policy if exists "Authenticated can read ledger" on public.garage_ledger_entries;
drop policy if exists "Owner and manager can read ledger" on public.garage_ledger_entries;
create policy "Owner and manager can read ledger" on public.garage_ledger_entries
  for select to authenticated using (public.jalasai_my_role() in ('owner', 'manager'));
drop policy if exists "Authenticated can read daily totals" on public.garage_daily_totals;
drop policy if exists "Owner and manager can read daily totals" on public.garage_daily_totals;
create policy "Owner and manager can read daily totals" on public.garage_daily_totals
  for select to authenticated using (public.jalasai_my_role() in ('owner', 'manager'));

grant execute on function public.jalasai_my_role() to authenticated;
grant execute on function public.jalasai_claim_owner() to authenticated;
grant execute on function public.jalasai_set_staff_role(text, text) to authenticated;


-- ── B. Customer statement links ──────────────────────────────────
-- A link the garage sends on WhatsApp. Anyone holding the link (and only
-- them — the token is 122 random bits) can see that one customer's
-- statement until it expires. Links can be revoked.
create table if not exists public.garage_statement_links (
  token         text primary key,
  customer_key  text not null,
  customer_phone text not null default '',              -- ledger lines of jobs without a customer id use the phone
  customer_name text not null default '',
  garage        jsonb not null default '{}'::jsonb,   -- name, phone, address, upi at the time of sharing
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  created_by    uuid,
  revoked_at    timestamptz
);
create index if not exists garage_statement_links_customer_idx on public.garage_statement_links (customer_key, created_at desc);
alter table public.garage_statement_links enable row level security;
drop policy if exists "Owner and manager can read statement links" on public.garage_statement_links;
create policy "Owner and manager can read statement links" on public.garage_statement_links
  for select to authenticated using (public.jalasai_my_role() in ('owner', 'manager'));
grant select on public.garage_statement_links to authenticated;

alter table public.garage_statement_links add column if not exists customer_phone text not null default '';

drop function if exists public.jalasai_create_statement_link(text, text, jsonb, int);
create or replace function public.jalasai_create_statement_link(p_customer_key text, p_customer_phone text, p_customer_name text, p_garage jsonb, p_days int default 30)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if public.jalasai_my_role() not in ('owner', 'manager') then raise exception 'only owner or manager can share statements'; end if;
  if coalesce(trim(p_customer_key), '') = '' then raise exception 'customer required'; end if;
  insert into public.garage_statement_links (token, customer_key, customer_phone, customer_name, garage, expires_at, created_by)
  values (v_token, p_customer_key, coalesce(trim(p_customer_phone), ''), coalesce(p_customer_name, ''),
          coalesce(p_garage, '{}'::jsonb) - 'secret',
          now() + make_interval(days => least(greatest(coalesce(p_days, 30), 1), 180)), auth.uid());
  return v_token;
end;
$$;

create or replace function public.jalasai_revoke_statement_links(p_customer_key text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if public.jalasai_my_role() not in ('owner', 'manager') then raise exception 'only owner or manager can revoke statement links'; end if;
  update public.garage_statement_links set revoked_at = now()
   where customer_key = p_customer_key and revoked_at is null and expires_at > now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- What the public statement page shows. Callable without signing in, but
-- only with a valid, unexpired, unrevoked token; returns that customer only.
create or replace function public.jalasai_statement_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_link public.garage_statement_links;
  v_statement jsonb;
begin
  select * into v_link from public.garage_statement_links
   where token = p_token and revoked_at is null and expires_at > now();
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'This link has expired or was cancelled. Ask the garage for a new one.');
  end if;
  with lines as (
    select e.*, coalesce(nullif(j.invoice_no, ''), e.invoice_no) as current_invoice_no
      from public.garage_ledger_entries e
      left join public.garage_jobs j on j.id = e.job_id
     where e.customer_key = v_link.customer_key
        or (v_link.customer_phone <> '' and e.customer_key = v_link.customer_phone)
  ),
  shown as (
    select * from lines where day >= current_date - 365
  )
  select jsonb_build_object(
    'opening', coalesce((select sum(amount) from lines where day < current_date - 365), 0),
    'balance', coalesce((select sum(amount) from lines), 0),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
        'day', day, 'kind', kind, 'amount', amount, 'method', method, 'invoice_no', current_invoice_no)
        -- invoices before the payments made on the same day
        order by day, (kind <> 'charge'), entry_id) from shown), '[]'::jsonb)
  ) into v_statement;
  return jsonb_build_object(
    'ok', true,
    'customer', v_link.customer_name,
    'garage', v_link.garage,
    'expires_at', v_link.expires_at,
    'statement', v_statement
  );
end;
$$;

revoke all on function public.jalasai_statement_by_token(text) from public;
grant execute on function public.jalasai_statement_by_token(text) to anon, authenticated;
grant execute on function public.jalasai_create_statement_link(text, text, text, jsonb, int) to authenticated;
grant execute on function public.jalasai_revoke_statement_links(text) to authenticated;

-- VERIFY AFTER (read-only):
-- select public.jalasai_my_role();   -- 'owner' until roles are set
