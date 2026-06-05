create table if not exists public.garage_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_by_email text not null default ''
);

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

create table if not exists public.garage_review_items (
  id text primary key,
  status text not null default '',
  label text not null default '',
  supplier text not null default '',
  part_no text not null default '',
  description text not null default '',
  reference_id text not null default '',
  record_data jsonb not null default '{}'::jsonb,
  source_hash text not null default '',
  source_updated_at timestamptz,
  mirrored_at timestamptz not null default now(),
  mirrored_by uuid references auth.users(id) on delete set null,
  mirrored_by_email text not null default '',
  device_id text not null default '',
  deleted_at timestamptz
);

create table if not exists public.garage_import_batches (
  id text primary key,
  status text not null default '',
  source_name text not null default '',
  file_name text not null default '',
  batch_name text not null default '',
  started_at timestamptz,
  record_data jsonb not null default '{}'::jsonb,
  source_hash text not null default '',
  source_updated_at timestamptz,
  mirrored_at timestamptz not null default now(),
  mirrored_by uuid references auth.users(id) on delete set null,
  mirrored_by_email text not null default '',
  device_id text not null default '',
  deleted_at timestamptz
);

create table if not exists public.garage_purchase_entries (
  id text primary key,
  supplier text not null default '',
  invoice_no text not null default '',
  supplier_part_no text not null default '',
  part_name text not null default '',
  qty numeric not null default 0,
  purchase_rate numeric not null default 0,
  mrp numeric not null default 0,
  amount numeric not null default 0,
  status text not null default '',
  mapped_stock_id text not null default '',
  mapped_sku text not null default '',
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

create table if not exists public.garage_supplier_catalog_map (
  id text primary key,
  supplier text not null default '',
  supplier_part_no text not null default '',
  mapped_stock_id text not null default '',
  mapped_sku text not null default '',
  review_status text not null default '',
  confidence numeric not null default 0,
  description text not null default '',
  record_data jsonb not null default '{}'::jsonb,
  source_hash text not null default '',
  source_updated_at timestamptz,
  mirrored_at timestamptz not null default now(),
  mirrored_by uuid references auth.users(id) on delete set null,
  mirrored_by_email text not null default '',
  device_id text not null default '',
  deleted_at timestamptz
);

create table if not exists public.garage_invoice_import_reviews (
  id text primary key,
  status text not null default '',
  purchase_entry_id text not null default '',
  suggested_stock_id text not null default '',
  suggested_sku text not null default '',
  confidence numeric not null default 0,
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

-- One row per device. Updated on every successful push.
-- Supabase Realtime fires an event to all other devices instantly.
create table if not exists public.garage_sync_heartbeat (
  device_id    text primary key,
  pushed_at    timestamptz not null default now(),
  device_label text not null default ''
);

create table if not exists public.garage_sync_validation_runs (
  id text primary key,
  run_at timestamptz not null default now(),
  ok boolean not null default false,
  summary text not null default '',
  expected_counts jsonb not null default '{}'::jsonb,
  actual_counts jsonb not null default '{}'::jsonb,
  mismatch_counts jsonb not null default '{}'::jsonb,
  mismatch_samples jsonb not null default '[]'::jsonb,
  validation_started_at timestamptz,
  validation_until timestamptz,
  payload_updated_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text not null default '',
  device_id text not null default '',
  created_at timestamptz not null default now()
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
create index if not exists garage_purchase_entries_status_idx on public.garage_purchase_entries (status);
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
create index if not exists garage_review_items_live_updated_idx on public.garage_review_items (source_updated_at desc) where deleted_at is null;
create index if not exists garage_import_batches_live_updated_idx on public.garage_import_batches (source_updated_at desc) where deleted_at is null;
create index if not exists garage_purchase_entries_live_updated_idx on public.garage_purchase_entries (source_updated_at desc) where deleted_at is null;
create index if not exists garage_stock_movements_live_updated_idx on public.garage_stock_movements (source_updated_at desc) where deleted_at is null;
create index if not exists garage_supplier_catalog_map_live_updated_idx on public.garage_supplier_catalog_map (source_updated_at desc) where deleted_at is null;
create index if not exists garage_invoice_import_reviews_live_updated_idx on public.garage_invoice_import_reviews (source_updated_at desc) where deleted_at is null;

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

select public.jalasai_apply_authenticated_full_access('public.garage_state');
select public.jalasai_apply_authenticated_full_access('public.garage_customers');
select public.jalasai_apply_authenticated_full_access('public.garage_mechanics');
select public.jalasai_apply_authenticated_full_access('public.garage_jobs');
select public.jalasai_apply_authenticated_full_access('public.garage_job_payments');
select public.jalasai_apply_authenticated_full_access('public.garage_stock_items');
select public.jalasai_apply_authenticated_full_access('public.garage_expenses');
select public.jalasai_apply_authenticated_full_access('public.garage_income_entries');
select public.jalasai_apply_authenticated_full_access('public.garage_parts_log');
select public.jalasai_apply_authenticated_full_access('public.garage_audit_log');
select public.jalasai_apply_authenticated_full_access('public.garage_review_items');
select public.jalasai_apply_authenticated_full_access('public.garage_import_batches');
select public.jalasai_apply_authenticated_full_access('public.garage_purchase_entries');
select public.jalasai_apply_authenticated_full_access('public.garage_stock_movements');
select public.jalasai_apply_authenticated_full_access('public.garage_supplier_catalog_map');
select public.jalasai_apply_authenticated_full_access('public.garage_invoice_import_reviews');
select public.jalasai_apply_authenticated_full_access('public.garage_sync_validation_runs');
select public.jalasai_apply_authenticated_full_access('public.garage_sync_heartbeat');

drop function if exists public.jalasai_apply_authenticated_full_access(regclass);

-- Enable realtime for heartbeat table so all devices get instant push notifications
alter publication supabase_realtime add table public.garage_sync_heartbeat;

insert into public.garage_state (id, payload)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;

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
