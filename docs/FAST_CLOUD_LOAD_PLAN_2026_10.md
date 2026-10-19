# Fast cloud load plan — newest first, older on demand, delta sync

Status: **Approved 2026-10-19.** Phases 0, 2 and 4 are built, plus local speed
fixes. The Phase 1 SQL is extended. Everything is tested locally; **nothing is
deployed and the SQL hasn't been run on live Supabase yet**. Details are in
"Build status" below.

### Build status (2026-10-19)

**Local speed fixes** (work without any server change). Mac Chrome, synthetic
1 lakh invoices; phones are 3–5× slower:

| Screen | Before | After |
|---|---:|---:|
| Job board | 8.1 s | 65 ms |
| Header stats | 8.0 s | 40 ms |
| Reports | 6.0 s | 0.4–0.7 s |
| Invoices | 2.6 s | 86 ms |
| Mechanics | — | ~0.1 s |

The causes:
- `today()` built a new time-zone formatter on every call, 100,000 times per
  render; now one formatter is reused.
- `isLiveJob` re-ran the regex-heavy pollution check; the result is now worked
  out in `normalizeJob` as `_nonWorkshop`.
- `allRevenueEntries` rebuilt every payment ever made to show today's revenue;
  `revenueEntriesForDate` now reads only the jobs that can have a payment on
  that date.
- `retentionSummary` scanned all jobs once per customer (customers × invoices);
  it now makes one pass.
- Mechanics resolved every job's mechanics once per mechanic card; it's now
  once per render, with a cached `jobMechanicIds`.

**Phase 2, changes-only sync:**
- `jalasai_changes_since()` (SQL §E) reads all tables in one request.
- Cursors use the server clock, one per table, with a 2-minute overlap. Deletes
  are included, and paging is keyset, 500 rows per page.
- Only the changed records are merged in, with the same merge rules as a full
  pull.
- Sync Now uses changes-only. "Repair: re-download everything" is in Sync
  diagnostics.
- The reconnect gap-fill uses the same path, so the 200-row cap is gone.
- Until the SQL is run, the app keeps the old pull unchanged.

**Phase 4, fresh phone loads newest first:**
- `jalasai_recent_jobs()` / `jalasai_jobs_before()` (SQL §F).
- The first screen gets open jobs, invoices since the earlier of the month start
  or 30 days ago, customers, mechanics and stock.
- Older invoices download in the background, 500 per page, newest first. The
  saved position moves only after a page is saved, so a restart resumes without
  gaps.
- Expenses, income and the logs load after that.
- While history is incomplete:
  - the Legacy invoice header shows server totals;
  - the next invoice number also checks the server's maximum;
  - Invoices, Customers and Reports show a "Loading older invoices… x / y" note;
  - the weekly full mirror, customer balance uploads and the customer-linking
    maintenance wait.

**Tested:** two simulated phones running the real `js/` files against local
Postgres.
- Edits, deletes and late uploads from an offline phone arrive via
  changes-only.
- 1,200 changes arrive in 3 requests.
- When nothing has changed, a pull is 1 request.
- A fresh phone starts with 123 of 3,000 invoices and finishes with all 3,000,
  with no duplicates, including across a restart.
- The old server path is unchanged.

**Not built yet (still planned):**
- Phase 3: saving only the changed records. A save still writes the whole table
  to IndexedDB: 34 ms at 20k invoices, 220 ms at 1 lakh.
- Phase 5: server report summaries for old ranges. Reports show the note
  instead, and the history download fills the gap in the background.
- "Load older invoices" on demand and a server-side search fallback. The
  background download makes these less urgent.
- Phase 6: the rolling window. Phones still keep full history, which is fine up
  to ~20k invoices.
- A duplicate invoice-number check against history that hasn't downloaded yet.
Date: 2026-10-19 · Branch at time of writing: `ux-polish`
Part of the long-term roadmap: this plan is **Stage 1** of
`docs/LONG_TERM_DATA_ROADMAP_2026_10.md`. Stage 0 (data-loss safety net) should
ship first.

## 1. Plain summary

Today a fresh phone (or anyone pressing **Sync Now**) downloads every invoice ever
made, 1,000 at a time, one page after another, then merges and re-saves the whole
list. With ~11–12k invoices (invoice numbers passed 10,560 in June) that is slow.

The fix, in the order it should ship:

1. **Make the "only what changed" sync actually reliable** and use it for Sync Now.
   It already exists in the code, but it has gaps that force full downloads and can
   miss rows (details in §3).
2. **Store data in IndexedDB instead of localStorage**, saving only the records that
   changed. Repeat opens become instant and saving an invoice stops re-compressing
   all 12k invoices.
3. **New phones load newest first**: open jobs + last 30 days of invoices +
   customers + stock appear in a couple of seconds; older invoices stream in behind
   the scenes, and the Invoices list shows **"Load older invoices"** if you scroll
   past what has arrived.
4. **Server-side totals** (Supabase functions) so Reports, customer balances and the
   next invoice number stay correct even while old history is still downloading.

Recommendation: do steps 1–4 ("newest first, the rest in the background").
**Update (owner's target: lakhs of invoices per year):** phones won't hold all
history. Background download stops at a rolling window (last ~12 months, capped at
~20k records). Anything older loads from the server on demand, and Reports for
older ranges use server totals. At 1 lakh invoices, today's device storage
freezes for over a minute and then fails silently, so full history on the phone
isn't an option. See "Scale target" in `docs/LONG_TERM_DATA_ROADMAP_2026_10.md`.

## 2. What I measured (local preview, synthetic data, Mac Chrome)

Synthetic invoices shaped like real jobs (2 parts, 1 payment, customer, mechanic,
notes), spread over 2 years. Phones are typically **3–5× slower** than these
desktop numbers.

| Invoices | Cloud download (raw JSON, jobs only) | Pages (requests) | Apply pull + save + render | Save jobs once (LZ compress) | Cold open `loadAll` | Invoices render | Reports render |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 2,000  | 2.4 MB  | 2  | 171 ms   | 115 ms   | 30 ms  | 55 ms  | 134 ms |
| 5,000  | 6.1 MB  | 5  | 394 ms   | 289 ms   | 62 ms  | 126 ms | 307 ms |
| **10,000** | **12.1 MB** | **10** | **903 ms** | **668 ms** | 107 ms | 253 ms | 705 ms |
| 20,000 | 24.3 MB | 20 | 1,976 ms | 1,817 ms | 212 ms | 498 ms | 1,469 ms |

Other numbers:
- ~**1.24 KB per invoice row** as pulled (`record_data` plus 12 duplicated columns).
- Customers + stock add ~2.2 MB raw at 10k invoices.
- gzip shrinks the synthetic jobs to ~0.76 MB at 10k. Real data repeats less, so
  expect roughly 1.5–2.5 MB if Supabase compresses the response. I didn't check
  compression against the live project (that needs a signed-in device), so Phase 0
  measures it.
- localStorage `js_jobs` is 0.94 MB compressed at 10k and 1.8 MB at 20k. That fits
  under the ~5 MB browser limit today, but the backup keys already get dropped for
  being too big (`LOCAL_BACKUP_MAX_CHARS = 900k`).

What this means at the real size (~12k): a fresh phone or Sync Now costs ~12 page
requests for jobs, plus customers, stock and audit pages, all sequential. On mobile
data that is likely **10–25 s** of downloading, followed by **3–5 s** of frozen
screen on a phone (merge, then normalize, then LZ-compress and save, then render).
Separately, **every invoice save** re-compresses the whole jobs list: ~0.7 s on a
Mac at 10k, likely 2–3 s on a phone. That cost is part of the "lag" staff feel.

## 3. How it works today (and the gaps)

Pull path (`js/sync.js`):
- `pullGS` → `pullFromShadowTables` reads each table with
  `deleted_at is null order by source_updated_at desc` and **offset** paging
  (`range(from, to)`, 1,000 rows per page).
- A delta pull exists: `since = jalasai_last_pull_at`, filtered with
  `source_updated_at > since`. But:
  1. **Sync Now always does a full pull.** `options.manual === true` forces
     `isFullPull` and `criticalOnly: false`, so it re-downloads all tables,
     including the audit log.
  2. **The cursor is the device's clock, not the server's.** `source_updated_at` is
     the record's own `updatedAt`, set on the phone that edited it. Example: phone B
     edits a job offline at 10:00 and uploads it at 12:00. Phone A pulled at 11:00,
     so its cursor is already past 10:00 and the delta pull **never fetches B's
     edit**. `mirrored_at` is also stamped on the device (`nowISO()`), so it has
     the same problem.
  3. **Delta pulls skip deletions** because of `deleted_at is null`. Deletions only
     arrive through realtime, or through `refreshRecentCloudChanges`, which is
     capped at **200 rows per table** (`.limit(200)`). A phone that was off for a
     busy week can miss deletions or edits beyond the first 200.
  4. **Offset paging over a changing sort key** can skip or repeat rows if someone
     pushes while a phone is still paging.
  5. A delta pull still runs `applyRemoteSnapshot`, which merges the changed rows
     against the **whole** local list and re-normalizes and re-saves everything
     (~0.9 s at 10k on a Mac). Realtime `upsertRealtimeItem` uses `findIndex` per
     row, so each row scans the full list.
- `initGSSync` already skips the pull on open when local data exists and nothing
  is pending. So repeat opens are mostly fine. The slow cases are **fresh device,
  Sync Now, a device stale for more than 7 days (pre-push pull), and saving**.

Local storage (`js/data.js`): each table is one localStorage key holding a JSON
array, LZ-compressed above 160 KB. `saveAll({domain:'jobs'})` rewrites the whole
array. `loadAll` parses everything synchronously at boot.

Readers of the full `jobs` array (they all assume complete history):
- **Invoices** (`renderInvoices` in both `index.html` and `NEW UI/index.html`): sorts
  all done jobs and totals all of them for the header stats (count, billed,
  collected, owed). Search runs on the device over `_searchText`.
- **Reports** (`js/reports.js`): `jobs.filter(...)` per date window, repeat-customer
  detection across all jobs, `availableYears()`.
- **Customers** (`js/customers.js`): balance and history per customer, built from all
  jobs, with phone/name fallback matching when `custId` is missing.
- **Invoice numbers**: `suggestedNextInvoiceNo()` takes max+1 over all local done
  invoices (`nextInvoiceNo` uses the local `invoiceCtr`). It runs on the device
  only, so two phones can already pick the same number.
- **Push side**: `buildCustomerShadowRows` computes `balance_amount` from local jobs
  during the full mirror. **With partial history this would upload wrong balances.**
  Any partial-history mode must guard against that (§6).

## 4. Target design

### 4.1 What loads first (tier 0, blocks the first screen)
One request where possible (an RPC, §5), otherwise these in parallel:
- **All open jobs** (`job_status <> 'done'`, not deleted). Small: tens of rows.
- **Invoices from the last 30 days** (`job_date >= today-30`, done), newest first.
- **Customers**: thin columns only (id, name, phone, vehicles, last vehicle,
  balance), with no `record_data`. ~2.8k rows, roughly 300 KB raw. Full records
  load in tier 1.
- **Mechanics, stock items**: small, so load them in full.
- **Server totals**: max invoice number, invoice count, all-time totals for the
  Invoices header, and customer balances (§5).
- Expected size: ~300–600 KB raw. **Target: first usable screen ≤ 2.5 s on 4G.**

### 4.2 Tier 1: background backfill (doesn't block anything)
- Fetch older invoices **newest to oldest**, **only back to the rolling window**
  (~12 months or ~20k records, whichever comes first), in pages of 500 using a
  **cursor, not an offset**: `where (job_date, id) < (:last_date, :last_id) order by job_date desc,
  id desc limit 500`.
- Wait for idle time between pages (`requestIdleCallback`) and write each page
  straight to IndexedDB, adding to memory with a `Map` by id. No full re-merge.
- Then the remaining tables: income, expenses, full customer records, parts log,
  stock movements. Audit log last, and only the last 90 days unless asked for.
- Save the backfill cursor so a closed app resumes where it stopped.
- When done, set `syncMeta.historyComplete = true`.
- Show a small chip: "Loading older invoices… 4,500 / 11,800". It disappears when
  done.

### 4.3 Older invoices on demand ("social media" scrolling)
- Invoices list: if `historyComplete` is false and the user scrolls to the end of
  what's loaded, show **"Load older invoices"**. Tapping it, or reaching the end
  with infinite scroll, fetches the next cursor page right away, ahead of the
  background queue.
- Invoice search before backfill finishes: search locally first. If there are
  fewer than 25 hits, also run a server search (`ilike` on
  invoice_no/customer_name/phone/registration_no) and merge the results.
- Customer detail: if history is incomplete, fetch that customer's jobs by
  `customer_id` (plus `phone`) on open.

### 4.4 Delta sync (every open, realtime gap-fill, Sync Now)
- New server column **`server_updated_at`**, set by a trigger to `now()` on every
  insert/update, including tombstones. The cursor uses this server time instead of
  device time.
- Pull = `server_updated_at > cursor - 2 min overlap`, **including deleted rows**,
  ordered by `(server_updated_at, id)` with cursor paging. The overlap covers
  transactions that commit out of order. Re-applying a row is harmless because the
  existing `recordStamp` rule still decides which version wins.
- One RPC `jalasai_changes_since(cursor)` returns changes for all tables in one
  round trip, with a row cap and a `has_more` flag.
- Apply deltas as **patches**: an id → index map, normalize only the changed rows,
  and save only those records to IndexedDB. No full `mergedSyncPayload`.
- **Sync Now = push pending changes, then a delta pull.** A full re-download moves
  to Sync diagnostics as "Repair: re-download everything".
- `refreshRecentCloudChanges` reuses the same delta function, with no 200-row cap.
- **Target: delta with nothing changed ≤ 1 request, ≤ 5 KB, ≤ 700 ms on 4G.**

### 4.5 Local cache: IndexedDB
- One database `jalasai`, one object store per table keyed by `id`, plus a `meta`
  store (cursors, counters, `historyComplete`, syncMeta).
- Indexes on `jobs`: `status`, `job_date`, `invoiceNoNum`, `custId`.
- Writes: `saveAll({domain})` turns into "put the dirty records". The app keeps a
  dirty-id set per table, filled by the existing save sites through a small helper.
  **Target: saving an invoice ≤ 50 ms of main-thread work at 12k invoices.**
- Boot: read open jobs and the last 60 days first and render, then load the rest
  from IndexedDB in chunks. At 12k this is fast enough to load everything into
  memory, so Reports and search keep working offline.
- Migration: on first boot of the new version, copy the localStorage keys into
  IndexedDB once and keep the localStorage copy read-only for one release as a
  fallback, then remove it. No compression needed (IndexedDB has far larger
  quotas). Ask for `navigator.storage.persist()` so the phone doesn't evict it.
- Sign-out must also delete the IndexedDB database (extend
  `clearLocalDeviceDataAfterSignOut`).

## 5. Supabase changes (all additive, so old app versions keep working)

```sql
-- 1. Server-side change clock on every shadow table
alter table public.garage_jobs add column if not exists server_updated_at timestamptz;
update public.garage_jobs set server_updated_at = coalesce(mirrored_at, source_updated_at, now())
  where server_updated_at is null;              -- backfill once, in batches if large
alter table public.garage_jobs alter column server_updated_at set default now();
create or replace function public.jalasai_touch_server_updated_at() returns trigger
language plpgsql as $$ begin new.server_updated_at := now(); return new; end $$;
create trigger garage_jobs_touch before insert or update on public.garage_jobs
  for each row execute function public.jalasai_touch_server_updated_at();
-- repeat for customers, mechanics, stock_items, expenses, income_entries,
-- parts_log, audit_log, stock_movements, job_payments

-- 2. Delta index (includes tombstones — no deleted_at filter)
create index if not exists garage_jobs_server_updated_idx
  on public.garage_jobs (server_updated_at, id);          -- per table

-- 3. Invoice paging + open jobs + per-customer history
create index if not exists garage_jobs_done_date_idx
  on public.garage_jobs (job_date desc, id desc)
  where deleted_at is null and job_status = 'done';
create index if not exists garage_jobs_open_idx
  on public.garage_jobs (job_date desc) where deleted_at is null and job_status <> 'done';
create index if not exists garage_jobs_customer_idx
  on public.garage_jobs (customer_id) where deleted_at is null;
```

RPCs (`security invoker`, so the existing RLS still applies):
- `jalasai_changes_since(p_cursor timestamptz, p_limit int)` returns jsonb
  `{tables: {jobs: [...], customers: [...] ...}, next_cursor, has_more}`.
- `jalasai_boot_bundle(p_recent_days int default 30)` returns the tier-0 data in
  one call (open jobs, recent invoices, thin customers, mechanics, stock, totals).
- `jalasai_invoice_totals()` returns count, billed, collected and due over live
  done jobs. These feed the Invoices header until history is complete.
- `jalasai_report_summary(p_start date, p_end date)`: revenue, invoices, average
  invoice, collections by method (from `garage_job_payments`), income, expenses.
  Used only while `historyComplete` is false. After that Reports keep using local
  data, which also works offline.
- `jalasai_max_invoice_no()` returns the max numeric `invoice_no` over live done
  jobs. `suggestedNextInvoiceNo()` takes the larger of this (cached at boot and
  refreshed on each delta) and the local max. Optional later step: a
  `jalasai_claim_invoice_no()` that hands out numbers atomically so two phones
  can't clash, but only after checking legacy data for duplicate numbers.
- View `garage_customer_balances`: `sum(total - paid)` per `customer_id` over
  live jobs, with a phone fallback for jobs without `customer_id`. Once this
  exists, **stop computing `balance_amount` on the device during the full
  mirror**, which removes the risk of uploading wrong balances from partial
  history.

Things to check on the live project before running (Phase 0):
- Run `explain analyze` on the new queries.
- Row counts per table.
- Whether Supabase gzips REST/RPC responses.
- Free-tier statement timeout. The backfill of `server_updated_at` may need to run
  in batches of 5k.
- Whether the realtime publication still includes the shadow tables (the trigger
  is fine with realtime).

## 6. Keeping things correct while history is partial

| Feature | While backfilling (`historyComplete = false`) | After backfill |
|---|---|---|
| Invoices header totals | `jalasai_invoice_totals()` (cached) | local, as today |
| Invoices list | loaded rows + "Load older invoices" | everything local |
| Invoice search | local, plus server search if < 25 hits | local |
| Reports (today/week/month) | local: the 30-day tier covers these | local |
| Reports (year / older ranges) | `jalasai_report_summary()`; repeat-customer and per-mechanic detail show "loading older data…" | local |
| Customer balance | `garage_customer_balances` | local (cross-check with view in diagnostics) |
| Customer history | fetch that customer's jobs on open | local |
| Next invoice number | max(server max, local max) | same (server max still guards clashes) |
| Push / full mirror | **full mirror and customer balance upload are blocked** until `historyComplete`; scoped pushes of edited records are fine | as today |
| `replaceLocal` on pull | not allowed | only from "Repair" |

Push safety stays the same: `SHADOW_INFER_DELETES` stays `false`, so a phone with
partial history can never delete cloud rows it hasn't downloaded.

## 7. Rollout order and targets

Measure each step on one real phone (Android Chrome, 4G) with the live dataset,
using numbers recorded in Sync diagnostics (added in Phase 0).

| Phase | What ships | Risk | Pass criteria |
|---|---|---|---|
| **0. Measure** | Add timings to Sync diagnostics: pull ms, rows and bytes per table, apply ms, save ms. Run the §5 checks on the live DB. | none | baseline recorded |
| **1. Server prep** | §5 columns, trigger, backfill, indexes, RPCs, balances view. Additive. Old app ignores them. | low | `explain` uses the indexes; RPCs < 300 ms server time; old app still syncs |
| **2. Reliable delta** | `server_updated_at` cursor with overlap, tombstones included, cursor paging, patch-apply, Sync Now = delta, Repair button, no 200-row cap | medium | two-phone offline test: 0 missed edits or deletes; Sync Now ≤ 1.5 s with nothing changed; ≤ 5 KB transfer |
| **3. IndexedDB** | per-record store, one-time migration, persisted storage, sign-out wipe | medium | save invoice ≤ 50 ms main thread at 12k; cold open shows job board ≤ 1 s; no data lost across 3 app restarts and a UI switch |
| **4. Newest-first fresh load** | boot bundle, background backfill with resume, progress chip, "Load older invoices", server search fallback | medium | fresh phone usable ≤ 2.5 s; full backfill ≤ 30 s with no main-thread task > 100 ms |
| **5. Server totals in UI** | Invoices header, Reports (old ranges), customer balance, invoice number use RPCs while partial; device stops uploading balances | low | numbers match the old full-history numbers exactly on a test copy |
| 6. Keep only recent history on phones (**required for lakh scale**) | drop out-of-window records with no pending changes; slim list rows; server search | high | Roadmap Stage 5: 10 lakh invoices on server, phone ≤ 50 MB, same speed targets |

Every phase touches shared `js/` files, so the Legacy UI and NEW UI both get it.
The Invoices markup lives in both `index.html` and `NEW UI/index.html`, so the
"Load older invoices" control and header totals must be added to **both** files.

Deploy: `./deploy.sh` after each phase. Run the SQL for Phase 1 once in the
Supabase SQL editor **before** deploying Phase 2.

## 8. Open questions for the owner

1. OK to change **Sync Now** to "upload, then fetch only changes", with a separate
   "Repair: re-download everything" in Sync diagnostics?
2. Audit log: is the last 90 days enough on phones (older entries viewable on
   request)?
3. Should invoice numbers be handed out by the server (no clashes between phones),
   or stay as "suggested number" like today?
