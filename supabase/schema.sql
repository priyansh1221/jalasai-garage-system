create table if not exists public.garage_customers (
  id text primary key,
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  last_vehicle text not null default '',
  vehicle_list text[] not null default '{}',
  balance_state text not null default 'clear',
  balance_amount numeric not null default 0,
  record_data jsonb not null default '{}'::jsonb,
  source_hash text not null default '',
  source_updated_at timestamptz,
  mirrored_at timestamptz not null default now(),
  mirrored_by uuid references auth.users(id) on delete set null,
  mirrored_by_email text not null default '',
  device_id text not null default '',
  deleted_at timestamptz
);

create table if not exists public.garage_mechanics (
  id text primary key,
  name text not null default '',
  phone text not null default '',
  specialty text not null default '',
  color text not null default '',
  active boolean not null default true,
  record_data jsonb not null default '{}'::jsonb,
  source_hash text not null default '',
  source_updated_at timestamptz,
  mirrored_at timestamptz not null default now(),
  mirrored_by uuid references auth.users(id) on delete set null,
  mirrored_by_email text not null default '',
  device_id text not null default '',
  deleted_at timestamptz
);

create table if not exists public.garage_jobs (
  id text primary key,
  customer_id text not null default '',
  customer_name text not null default '',
  phone text not null default '',
  vehicle text not null default '',
  registration_no text not null default '',
  job_status text not null default '',
  priority text not null default '',
  job_date date,
  invoice_no text not null default '',
  mechanic_ids text[] not null default '{}',
  mechanic_names text[] not null default '{}',
  total_amount numeric not null default 0,
  paid_amount numeric not null default 0,
  due_amount numeric not null default 0,
  advance_amount numeric not null default 0,
  service_note text not null default '',
  remarks text not null default '',
  record_data jsonb not null default '{}'::jsonb,
  source_hash text not null default '',
  source_updated_at timestamptz,
  mirrored_at timestamptz not null default now(),
  mirrored_by uuid references auth.users(id) on delete set null,
  mirrored_by_email text not null default '',
  device_id text not null default '',
  deleted_at timestamptz
);

create table if not exists public.garage_job_payments (
  id text primary key,
  job_id text not null default '',
  payment_kind text not null default '',
  payment_date date,
  amount numeric not null default 0,
  method text not null default '',
  invoice_no text not null default '',
  customer_name text not null default '',
  phone text not null default '',
  note text not null default '',
  mechanic_ids text[] not null default '{}',
  mechanic_names text[] not null default '{}',
  record_data jsonb not null default '{}'::jsonb,
  source_hash text not null default '',
  source_updated_at timestamptz,
  mirrored_at timestamptz not null default now(),
  mirrored_by uuid references auth.users(id) on delete set null,
  mirrored_by_email text not null default '',
  device_id text not null default '',
  deleted_at timestamptz
);

create table if not exists public.garage_stock_items (
  id text primary key,
  sku text not null default '',
  name text not null default '',
  category text not null default '',
  bike text not null default '',
  manufacturer text not null default '',
  company_brand text not null default '',
  supplier_part_no text not null default '',
  qty numeric not null default 0,
  min_qty numeric not null default 0,
  buy_price numeric not null default 0,
  sell_price numeric not null default 0,
  last_supplier text not null default '',
  fitment_models text[] not null default '{}',
  aliases text[] not null default '{}',
  notes text not null default '',
  record_data jsonb not null default '{}'::jsonb,
  source_hash text not null default '',
  source_updated_at timestamptz,
  mirrored_at timestamptz not null default now(),
  mirrored_by uuid references auth.users(id) on delete set null,
  mirrored_by_email text not null default '',
  device_id text not null default '',
  deleted_at timestamptz
);

create table if not exists public.garage_expenses (
  id text primary key,
  expense_date date,
  category text not null default '',
  description text not null default '',
  paid_to text not null default '',
  amount numeric not null default 0,
  record_data jsonb not null default '{}'::jsonb,
  source_hash text not null default '',
  source_updated_at timestamptz,
  mirrored_at timestamptz not null default now(),
  mirrored_by uuid references auth.users(id) on delete set null,
  mirrored_by_email text not null default '',
  device_id text not null default '',
  deleted_at timestamptz
);

create table if not exists public.garage_income_entries (
  id text primary key,
  entry_date date,
  income_kind text not null default '',
  category text not null default '',
  amount numeric not null default 0,
  method text not null default '',
  invoice_no text not null default '',
  note text not null default '',
  mechanic_id text not null default '',
  mechanic_name text not null default '',
  record_data jsonb not null default '{}'::jsonb,
  source_hash text not null default '',
  source_updated_at timestamptz,
  mirrored_at timestamptz not null default now(),
  mirrored_by uuid references auth.users(id) on delete set null,
  mirrored_by_email text not null default '',
  device_id text not null default '',
  deleted_at timestamptz
);

create table if not exists public.garage_parts_log (
  id text primary key,
  entry_date date,
  entry_time text not null default '',
  sku text not null default '',
  part_name text not null default '',
  record_data jsonb not null default '{}'::jsonb,
  source_hash text not null default '',
  source_updated_at timestamptz,
  mirrored_at timestamptz not null default now(),
  mirrored_by uuid references auth.users(id) on delete set null,
  mirrored_by_email text not null default '',
  device_id text not null default '',
  deleted_at timestamptz
);

create table if not exists public.garage_audit_log (
  id text primary key,
  happened_at timestamptz,
  actor_email text not null default '',
  action text not null default '',
  entity text not null default '',
  entity_id text not null default '',
  summary text not null default '',
  record_data jsonb not null default '{}'::jsonb,
  source_hash text not null default '',
  source_updated_at timestamptz,
  mirrored_at timestamptz not null default now(),
  mirrored_by uuid references auth.users(id) on delete set null,
  mirrored_by_email text not null default '',
  device_id text not null default '',
  deleted_at timestamptz
);

create table if not exists public.garage_stock_movements (
  id text primary key,
  stock_id text not null default '',
  sku text not null default '',
  movement_type text not null default '',
  qty numeric not null default 0,
  rate numeric not null default 0,
  amount numeric not null default 0,
  source text not null default '',
  source_id text not null default '',
  supplier text not null default '',
  movement_at timestamptz,
  record_data jsonb not null default '{}'::jsonb,
  source_hash text not null default '',
  source_updated_at timestamptz,
  mirrored_at timestamptz not null default now(),
  mirrored_by uuid references auth.users(id) on delete set null,
  mirrored_by_email text not null default '',
  device_id text not null default '',
  deleted_at timestamptz
);

-- One row per device. Updated on every successful push.
-- Supabase Realtime fires an event to all other devices instantly.
create table if not exists public.garage_sync_heartbeat (
  device_id    text primary key,
  pushed_at    timestamptz not null default now(),
  device_label text not null default ''
);

create index if not exists garage_customers_name_idx on public.garage_customers (name);
create index if not exists garage_customers_phone_idx on public.garage_customers (phone);
create index if not exists garage_jobs_status_date_idx on public.garage_jobs (job_status, job_date);
create index if not exists garage_jobs_invoice_no_idx on public.garage_jobs (invoice_no);
create index if not exists garage_job_payments_job_date_idx on public.garage_job_payments (job_id, payment_date);
create index if not exists garage_stock_items_sku_idx on public.garage_stock_items (sku);
create index if not exists garage_stock_items_name_idx on public.garage_stock_items (name);
create index if not exists garage_expenses_date_idx on public.garage_expenses (expense_date);
create index if not exists garage_income_entries_date_idx on public.garage_income_entries (entry_date);
create index if not exists garage_income_entries_mechanic_idx on public.garage_income_entries (mechanic_id, entry_date);
create index if not exists garage_stock_movements_stock_idx on public.garage_stock_movements (stock_id, movement_at);

-- Pull path indexes. The frontend table sync reads every live shadow table with
-- `deleted_at is null order by source_updated_at desc`; without these indexes,
-- stale devices can fail to pull with Supabase statement timeouts.
create index if not exists garage_customers_live_updated_idx on public.garage_customers (source_updated_at desc) where deleted_at is null;
create index if not exists garage_mechanics_live_updated_idx on public.garage_mechanics (source_updated_at desc) where deleted_at is null;
create index if not exists garage_jobs_live_updated_idx on public.garage_jobs (source_updated_at desc) where deleted_at is null;
create index if not exists garage_stock_items_live_updated_idx on public.garage_stock_items (source_updated_at desc) where deleted_at is null;
create index if not exists garage_expenses_live_updated_idx on public.garage_expenses (source_updated_at desc) where deleted_at is null;
create index if not exists garage_income_entries_live_updated_idx on public.garage_income_entries (source_updated_at desc) where deleted_at is null;
create index if not exists garage_parts_log_live_updated_idx on public.garage_parts_log (source_updated_at desc) where deleted_at is null;
create index if not exists garage_audit_log_live_updated_idx on public.garage_audit_log (source_updated_at desc) where deleted_at is null;
create index if not exists garage_stock_movements_live_updated_idx on public.garage_stock_movements (source_updated_at desc) where deleted_at is null;

create or replace function public.jalasai_apply_authenticated_full_access(target_table regclass)
returns void
language plpgsql
as $$
begin
  execute format('alter table %s enable row level security', target_table);
  execute format('drop policy if exists %I on %s', 'Authenticated full access', target_table);
  execute format(
    'create policy %I on %s for all to authenticated using (true) with check (true)',
    'Authenticated full access',
    target_table
  );
end;
$$;

select public.jalasai_apply_authenticated_full_access('public.garage_customers');
select public.jalasai_apply_authenticated_full_access('public.garage_mechanics');
select public.jalasai_apply_authenticated_full_access('public.garage_jobs');
select public.jalasai_apply_authenticated_full_access('public.garage_job_payments');
select public.jalasai_apply_authenticated_full_access('public.garage_stock_items');
select public.jalasai_apply_authenticated_full_access('public.garage_expenses');
select public.jalasai_apply_authenticated_full_access('public.garage_income_entries');
select public.jalasai_apply_authenticated_full_access('public.garage_parts_log');
select public.jalasai_apply_authenticated_full_access('public.garage_audit_log');
select public.jalasai_apply_authenticated_full_access('public.garage_stock_movements');
select public.jalasai_apply_authenticated_full_access('public.garage_sync_heartbeat');

drop function if exists public.jalasai_apply_authenticated_full_access(regclass);

-- Enable realtime for heartbeat table so all devices get instant push notifications.
-- Supabase errors if a table is added to a publication twice, so keep this
-- guarded for repeat-safe schema runs.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'garage_sync_heartbeat'
  ) then
    alter publication supabase_realtime add table public.garage_sync_heartbeat;
  end if;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', true, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Authenticated can upload job photos" on storage.objects;
create policy "Authenticated can upload job photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'job-photos');

drop policy if exists "Authenticated can update job photos" on storage.objects;
create policy "Authenticated can update job photos"
on storage.objects for update
to authenticated
using (bucket_id = 'job-photos')
with check (bucket_id = 'job-photos');

drop policy if exists "Authenticated can delete job photos" on storage.objects;
create policy "Authenticated can delete job photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'job-photos');

-- Incremental pull cursor
ALTER TABLE garage_sync_heartbeat
  ADD COLUMN IF NOT EXISTS last_pull_at timestamptz;

-- Covering indexes for delta pull queries
-- (source_updated_at already exists on some tables — use IF NOT EXISTS
--  on all of them to be safe)

CREATE INDEX IF NOT EXISTS idx_garage_jobs_updated
  ON garage_jobs (source_updated_at ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_garage_stock_items_updated
  ON garage_stock_items (source_updated_at ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_garage_customers_updated
  ON garage_customers (source_updated_at ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_garage_expenses_updated
  ON garage_expenses (source_updated_at ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_garage_income_entries_updated
  ON garage_income_entries (source_updated_at ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_garage_mechanics_updated
  ON garage_mechanics (source_updated_at ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_garage_audit_log_updated
  ON garage_audit_log (source_updated_at ASC);

CREATE INDEX IF NOT EXISTS idx_garage_parts_log_updated
  ON garage_parts_log (source_updated_at ASC);

CREATE INDEX IF NOT EXISTS idx_garage_job_payments_updated
  ON garage_job_payments (source_updated_at ASC);

-- ════════════════════════════════════════════════════════════════
-- Phase 5 (2026-06-12): multi-tenant groundwork — ADDITIVE ONLY.
-- Adds tenant_id with a default of 'jalasai' to every live table so
-- existing rows and existing app versions keep working unchanged.
-- RLS still grants full access to authenticated users; per-tenant
-- policies come later together with JWT claims. The app only starts
-- WRITING tenant_id when JALASAI_SEND_TENANT_ID is enabled in
-- js/sync.js — flip it only AFTER this SQL has been run once.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.garage_customers      ADD COLUMN IF NOT EXISTS tenant_id text not null default 'jalasai';
ALTER TABLE public.garage_mechanics      ADD COLUMN IF NOT EXISTS tenant_id text not null default 'jalasai';
ALTER TABLE public.garage_jobs           ADD COLUMN IF NOT EXISTS tenant_id text not null default 'jalasai';
ALTER TABLE public.garage_job_payments   ADD COLUMN IF NOT EXISTS tenant_id text not null default 'jalasai';
ALTER TABLE public.garage_stock_items    ADD COLUMN IF NOT EXISTS tenant_id text not null default 'jalasai';
ALTER TABLE public.garage_expenses       ADD COLUMN IF NOT EXISTS tenant_id text not null default 'jalasai';
ALTER TABLE public.garage_income_entries ADD COLUMN IF NOT EXISTS tenant_id text not null default 'jalasai';
ALTER TABLE public.garage_parts_log      ADD COLUMN IF NOT EXISTS tenant_id text not null default 'jalasai';
ALTER TABLE public.garage_audit_log      ADD COLUMN IF NOT EXISTS tenant_id text not null default 'jalasai';
ALTER TABLE public.garage_stock_movements ADD COLUMN IF NOT EXISTS tenant_id text not null default 'jalasai';
ALTER TABLE public.garage_sync_heartbeat ADD COLUMN IF NOT EXISTS tenant_id text not null default 'jalasai';

-- ────────────────────────────────────────────────────────────────
-- Report views (free tier friendly). The app intentionally keeps
-- computing reports from local data so reports stay instant and
-- offline; these views exist for dashboards / SQL editor use and
-- future server-side reporting.
-- ────────────────────────────────────────────────────────────────

create or replace view public.garage_monthly_revenue as
select
  to_char(coalesce(p.payment_date, p.mirrored_at::date), 'YYYY-MM') as month,
  count(distinct p.job_id)                                          as jobs_paid,
  sum(p.amount)                                                     as total_collected,
  sum(p.amount) filter (where lower(p.method) = 'cash')             as cash_collected,
  sum(p.amount) filter (where lower(p.method) = 'upi')              as upi_collected
from public.garage_job_payments p
where p.deleted_at is null
group by 1
order by 1 desc;

create or replace view public.garage_outstanding_dues as
select
  j.id,
  j.invoice_no,
  j.customer_name,
  j.phone,
  j.vehicle,
  j.job_date,
  j.total_amount,
  j.paid_amount,
  j.due_amount
from public.garage_jobs j
where j.deleted_at is null
  and j.job_status = 'done'
  and j.due_amount > 0
order by j.job_date desc;

create or replace view public.garage_stock_alerts as
select
  s.sku,
  s.name,
  s.bike,
  s.qty,
  s.min_qty,
  case when s.qty <= 0 then 'out' else 'low' end as status
from public.garage_stock_items s
where s.deleted_at is null
  and s.qty <= s.min_qty
order by s.qty asc;
