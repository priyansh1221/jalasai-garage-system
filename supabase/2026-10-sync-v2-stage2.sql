-- ════════════════════════════════════════════════════════════════
-- Sync engine v2 — Stage 2 server side (DRAFT — NOT RUN YET)
-- Plan: docs/LONG_TERM_DATA_ROADMAP_2026_10.md "Stage 2"
--       (fixes L3 last-upload-wins, L4 device clocks, L6 whole-record merge)
--
-- REQUIRES supabase/2026-10-fast-sync-phase1.sql to have been run first
-- (server_updated_at + garage_row_history). This file stops if it hasn't.
--
-- ADDITIVE ONLY. Old app versions keep working: they ignore `version` and
-- keep doing plain upserts (which still bump `version`, so new phones notice
-- their writes). Phones on the new app send every change through
-- jalasai_apply_changes(), which refuses to overwrite a newer row.
-- Safe to run more than once.
--
-- Before running on the live project:
--   1. Take a backup (Dashboard → Database → Backups, or pg_dump).
--   2. Make sure Phase 1 has been run (see its VERIFY AFTER block).
--   3. Run this file in the SQL editor in one go.
-- ════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.garage_row_history') is null then
    raise exception 'Run supabase/2026-10-fast-sync-phase1.sql first (garage_row_history is missing).';
  end if;
end;
$$;


-- ── A. Row versions (raised by the server, never by a phone) ────
-- Each row's `version` goes up by one whenever its content or delete state
-- changes. A phone sends the version it last saw; the server only accepts
-- the change if that is still the current version.

create or replace function public.jalasai_bump_row_version()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
  elsif new.record_data is distinct from old.record_data
     or new.deleted_at is distinct from old.deleted_at then
    new.version := coalesce(old.version, 0) + 1;
  else
    -- Identical re-upload (old app versions do this a lot): keep the
    -- version so phones don't see a fake conflict.
    new.version := old.version;
  end if;
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
    execute format('alter table public.%I add column if not exists version bigint not null default 1', t);
    execute format('drop trigger if exists %I on public.%I', t || '_bump_version', t);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.jalasai_bump_row_version()',
      t || '_bump_version', t
    );
  end loop;
end;
$$;


-- ── B. Bookkeeping: applied changes + conflicts ─────────────────
-- garage_applied_changes makes uploads idempotent: if the app is killed after
-- the server saved a change but before the phone heard back, the resend is
-- recognised and not applied twice.
create table if not exists public.garage_applied_changes (
  change_id    text primary key,
  table_name   text not null,
  row_id       text not null,
  version      bigint not null,
  applied_at   timestamptz not null default now(),
  applied_by   uuid,
  device_id    text not null default ''
);
create index if not exists garage_applied_changes_time_idx
  on public.garage_applied_changes (applied_at);

-- Every change the server refused (stale base version) is kept here in full,
-- so a refused edit can always be found and restored by hand.
create table if not exists public.garage_sync_conflicts (
  conflict_id    bigint generated always as identity primary key,
  change_id      text not null,
  table_name     text not null,
  row_id         text not null,
  base_version   bigint,
  server_version bigint,
  incoming       jsonb not null,
  happened_at    timestamptz not null default now(),
  happened_by    uuid,
  device_id      text not null default ''
);
create index if not exists garage_sync_conflicts_row_idx
  on public.garage_sync_conflicts (table_name, row_id, happened_at desc);

alter table public.garage_applied_changes enable row level security;
drop policy if exists "Authenticated full access" on public.garage_applied_changes;
create policy "Authenticated full access"
  on public.garage_applied_changes for all to authenticated using (true) with check (true);

alter table public.garage_sync_conflicts enable row level security;
drop policy if exists "Authenticated can read conflicts" on public.garage_sync_conflicts;
create policy "Authenticated can read conflicts"
  on public.garage_sync_conflicts for select to authenticated using (true);
drop policy if exists "Authenticated can add conflicts" on public.garage_sync_conflicts;
create policy "Authenticated can add conflicts"
  on public.garage_sync_conflicts for insert to authenticated with check (true);


-- ── C. Field-by-field merge ─────────────────────────────────────
-- Three copies of one record_data: B = the version the phone started from
-- (found in garage_row_history), L = the phone's copy, S = the server's
-- current copy. A field only the phone changed takes L, a field only the
-- server changed keeps S, and a field both changed takes L (the later
-- arrival) and is reported in conflict_fields. Lists of items with ids
-- (payments, parts used) are merged item by item, so two phones each adding
-- a payment keeps both.

-- Same key the app uses to union payment entries (buildJobPaymentUnionIndex).
create or replace function public.jalasai_merge_item_key(item jsonb)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(item->>'id', ''),
    concat_ws('|', item->>'amount', item->>'method', coalesce(item->>'at', item->>'timestamp'), item->>'source')
  );
$$;

-- Returns NULL when the values are not all lists of objects (caller then
-- falls back to the whole-field rule).
create or replace function public.jalasai_merge_id_array(b jsonb, l jsonb, s jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  bb jsonb := coalesce(b, '[]'::jsonb);
  ll jsonb := coalesce(l, '[]'::jsonb);
  ss jsonb := coalesce(s, '[]'::jsonb);
  bmap jsonb := '{}'::jsonb;
  lmap jsonb := '{}'::jsonb;
  smap jsonb := '{}'::jsonb;
  out jsonb := '[]'::jsonb;
  item jsonb;
  k text;
begin
  if jsonb_typeof(bb) <> 'array' or jsonb_typeof(ll) <> 'array' or jsonb_typeof(ss) <> 'array' then
    return null;
  end if;
  if exists (select 1 from jsonb_array_elements(bb || ll || ss) e where jsonb_typeof(e) <> 'object') then
    return null;
  end if;
  for item in select value from jsonb_array_elements(bb) loop
    bmap := bmap || jsonb_build_object(public.jalasai_merge_item_key(item), item);
  end loop;
  for item in select value from jsonb_array_elements(ll) loop
    lmap := lmap || jsonb_build_object(public.jalasai_merge_item_key(item), item);
  end loop;
  -- Server order first.
  for item in select value from jsonb_array_elements(ss) loop
    k := public.jalasai_merge_item_key(item);
    smap := smap || jsonb_build_object(k, item);
    if bmap ? k and not (lmap ? k) and (bmap->k) = item then
      continue;                                   -- removed on the phone, untouched on server
    elsif lmap ? k and (not (bmap ? k) or (lmap->k) is distinct from (bmap->k)) then
      out := out || jsonb_build_array(lmap->k);   -- changed on the phone
    else
      out := out || jsonb_build_array(item);
    end if;
  end loop;
  -- Then items the server doesn't have: added on the phone, or edited on the
  -- phone after the server removed them (kept, never silently dropped).
  for item in select value from jsonb_array_elements(ll) loop
    k := public.jalasai_merge_item_key(item);
    if smap ? k then continue; end if;
    if not (bmap ? k) or item is distinct from (bmap->k) then
      out := out || jsonb_build_array(item);
    end if;
  end loop;
  return out;
end;
$$;

create or replace function public.jalasai_merge_record(b jsonb, l jsonb, s jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  -- Bookkeeping fields every save touches: never reported as a conflict.
  quiet text[] := array['updatedAt', 'syncConflict'];
  merged jsonb := coalesce(s, '{}'::jsonb);
  conflicts text[] := '{}';
  k text;
  lv jsonb;
  bv jsonb;
  sv jsonb;
  arr jsonb;
begin
  for k in
    select key from jsonb_object_keys(coalesce(l, '{}'::jsonb)) key
    union
    select key from jsonb_object_keys(coalesce(b, '{}'::jsonb)) key
  loop
    lv := l->k;
    bv := b->k;
    sv := s->k;
    continue when lv is not distinct from bv;     -- phone didn't change it
    continue when lv is not distinct from sv;     -- both made the same change
    if k = 'updatedAt' and lv is not null and sv is not null then
      -- Display only, and stamped by phone clocks: never let it go backwards.
      merged := merged || jsonb_build_object(k, greatest(lv #>> '{}', sv #>> '{}'));
      continue;
    end if;
    if sv is not distinct from bv then            -- only the phone changed it
      merged := case when lv is null then merged - k else merged || jsonb_build_object(k, lv) end;
      continue;
    end if;
    arr := public.jalasai_merge_id_array(bv, lv, sv);
    if arr is not null then
      merged := merged || jsonb_build_object(k, arr);
      continue;
    end if;
    merged := case when lv is null then merged - k else merged || jsonb_build_object(k, lv) end;
    if not (k = any(quiet)) then conflicts := conflicts || k; end if;
  end loop;
  return jsonb_build_object('merged', merged, 'conflict_fields', to_jsonb(conflicts));
end;
$$;


-- ── D. apply_changes: compare-and-set upload ────────────────────
-- Input: jsonb array of
--   { change_id, table, id, op: 'upsert'|'delete', base_version (int|null),
--     force (bool), row: { column: value, ... }, device_id }
-- Output: jsonb array, one per change, in the same order:
--   { change_id, status: 'applied'|'duplicate'|'conflict'|'error',
--     version, deleted_at, message (error only), and for a conflict:
--     record_data (server copy), merged, conflict_fields, base_found }
--
-- Rules:
--   * Row missing                       → insert, version 1.
--   * base_version = current version    → write, version + 1.
--   * force = true                      → write regardless (only for derived
--                                         or append-only tables).
--   * Anything else                     → refuse, log to garage_sync_conflicts
--                                         and return the server copy plus a
--                                         field-by-field merge proposal. The
--                                         phone applies it and resends with
--                                         the new version.
-- The function never decides by device clocks.
-- security invoker: the caller's existing RLS applies.

create or replace function public.jalasai_apply_changes(changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  allowed text[] := array[
    'garage_customers', 'garage_mechanics', 'garage_jobs', 'garage_job_payments',
    'garage_stock_items', 'garage_expenses', 'garage_income_entries',
    'garage_parts_log', 'garage_audit_log', 'garage_stock_movements'
  ];
  -- Columns a phone may never set: the server owns these.
  protected text[] := array['id', 'version', 'server_updated_at'];
  results jsonb := '[]'::jsonb;
  ch jsonb;
  v_change_id text;
  v_table text;
  v_id text;
  v_op text;
  v_base bigint;
  v_force boolean;
  v_row jsonb;
  v_device text;
  v_cols text;
  v_set text;
  v_current record;
  v_found boolean;
  v_new_version bigint;
  v_new_deleted timestamptz;
  v_prev_version bigint;
  v_rows int;
  v_base_record jsonb;
  v_merge jsonb;
begin
  if jsonb_typeof(changes) is distinct from 'array' then
    raise exception 'jalasai_apply_changes expects a JSON array';
  end if;
  if jsonb_array_length(changes) > 500 then
    raise exception 'jalasai_apply_changes accepts at most 500 changes per call';
  end if;

  for ch in select value from jsonb_array_elements(changes) loop
    v_change_id := coalesce(ch->>'change_id', '');
    v_table     := coalesce(ch->>'table', '');
    v_id        := coalesce(ch->>'id', '');
    v_op        := coalesce(ch->>'op', 'upsert');
    v_base      := nullif(ch->>'base_version', '')::bigint;
    v_force     := coalesce((ch->>'force')::boolean, false);
    v_row       := coalesce(ch->'row', '{}'::jsonb);
    v_device    := coalesce(ch->>'device_id', '');

    begin
      if v_change_id = '' or v_id = '' or not (v_table = any(allowed)) or v_op not in ('upsert', 'delete') then
        raise exception 'bad change: table=%, id=%, op=%', v_table, v_id, v_op;
      end if;

      -- Already applied (resend after a lost reply)?
      select version into v_prev_version from public.garage_applied_changes where change_id = v_change_id;
      if found then
        execute format('select deleted_at from public.%I where id = $1', v_table) into v_new_deleted using v_id;
        results := results || jsonb_build_object(
          'change_id', v_change_id, 'status', 'duplicate',
          'version', v_prev_version, 'deleted_at', v_new_deleted);
        continue;
      end if;

      -- Only columns the table really has, minus server-owned ones.
      v_row := v_row - protected;
      if v_op = 'delete' then
        v_row := v_row
          || jsonb_build_object('deleted_at', coalesce(v_row->>'deleted_at', now()::text), 'source_hash', '');
      end if;
      select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position),
             string_agg(format('%1$I = s.%1$I', c.column_name), ', ' order by c.ordinal_position)
        into v_cols, v_set
        from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = v_table
         and v_row ? c.column_name
         and not (c.column_name = any(protected));

      execute format('select version, deleted_at, record_data from public.%I where id = $1 for update', v_table)
        into v_current using v_id;
      v_found := v_current.version is not null;

      if not v_found then
        if v_cols is null then
          raise exception 'change % has no columns to insert', v_change_id;
        end if;
        execute format(
          'insert into public.%1$I (id, %2$s) select $1, %2$s from jsonb_populate_record(null::public.%1$I, $2) on conflict (id) do nothing returning version, deleted_at',
          v_table, v_cols)
          into v_new_version, v_new_deleted using v_id, v_row;
        get diagnostics v_rows = row_count;
        if v_rows = 0 then
          -- Another phone inserted the same id a moment ago: treat as conflict.
          execute format('select version, deleted_at, record_data from public.%I where id = $1', v_table)
            into v_current using v_id;
          v_found := true;
        end if;
      end if;

      if v_found then
        if not v_force and v_base is distinct from v_current.version then
          insert into public.garage_sync_conflicts
            (change_id, table_name, row_id, base_version, server_version, incoming, happened_by, device_id)
          values (v_change_id, v_table, v_id, v_base, v_current.version, ch, auth.uid(), v_device);
          v_base_record := null;
          if v_base is not null then
            select h.old_row->'record_data' into v_base_record
              from public.garage_row_history h
             where h.table_name = v_table and h.row_id = v_id
               and h.old_row->>'version' = v_base::text
             order by h.history_id desc
             limit 1;
          end if;
          v_merge := case
            when v_op = 'upsert' and v_current.deleted_at is null and v_row ? 'record_data'
              then public.jalasai_merge_record(v_base_record, v_row->'record_data', v_current.record_data)
            else null
          end;
          results := results || jsonb_build_object(
            'change_id', v_change_id, 'status', 'conflict',
            'version', v_current.version, 'deleted_at', v_current.deleted_at,
            'record_data', v_current.record_data,
            'merged', v_merge->'merged',
            'conflict_fields', coalesce(v_merge->'conflict_fields', '[]'::jsonb),
            'base_found', v_base_record is not null);
          continue;
        end if;
        if v_set is null then
          raise exception 'change % has no columns to update', v_change_id;
        end if;
        execute format(
          'update public.%1$I t set %2$s from jsonb_populate_record(null::public.%1$I, $2) s where t.id = $1 returning t.version, t.deleted_at',
          v_table, v_set)
          into v_new_version, v_new_deleted using v_id, v_row;
      end if;

      insert into public.garage_applied_changes (change_id, table_name, row_id, version, applied_by, device_id)
      values (v_change_id, v_table, v_id, v_new_version, auth.uid(), v_device)
      on conflict (change_id) do nothing;

      results := results || jsonb_build_object(
        'change_id', v_change_id, 'status', 'applied',
        'version', v_new_version, 'deleted_at', v_new_deleted);
    exception when others then
      -- One bad change must not block the rest of the batch.
      results := results || jsonb_build_object(
        'change_id', v_change_id, 'status', 'error', 'message', sqlerrm);
    end;
  end loop;

  return results;
end;
$$;

-- Lets the app check that this file has been run before switching to v2.
create or replace function public.jalasai_sync_v2_info()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object('engine', 2, 'server_time', now());
$$;

-- Housekeeping: applied-change ids only matter for a few days (resends).
-- Conflicts are kept a year. Run monthly from the SQL editor or pg_cron.
create or replace function public.jalasai_prune_sync_bookkeeping()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  a int;
  c int;
begin
  delete from public.garage_applied_changes where applied_at < now() - interval '30 days';
  get diagnostics a = row_count;
  delete from public.garage_sync_conflicts where happened_at < now() - interval '365 days';
  get diagnostics c = row_count;
  return jsonb_build_object('applied_changes_removed', a, 'conflicts_removed', c);
end;
$$;

grant execute on function public.jalasai_apply_changes(jsonb) to authenticated;
grant execute on function public.jalasai_sync_v2_info() to authenticated;
grant execute on function public.jalasai_prune_sync_bookkeeping() to authenticated;
grant select, insert on public.garage_applied_changes to authenticated;
grant select, insert on public.garage_sync_conflicts to authenticated;


-- ════════════════════════════════════════════════════════════════
-- VERIFY AFTER (read-only)
-- ════════════════════════════════════════════════════════════════
-- select public.jalasai_sync_v2_info();
-- select count(*) filter (where version is null) from public.garage_jobs;          -- expect 0
-- select version, count(*) from public.garage_jobs group by 1 order by 1 limit 5;  -- all 1 at first
-- -- After a day of use: refused (stale) uploads, newest first
-- select happened_at, table_name, row_id, base_version, server_version, device_id
--   from public.garage_sync_conflicts order by happened_at desc limit 20;
