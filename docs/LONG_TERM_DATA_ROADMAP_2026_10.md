# JalaSai long-term data roadmap: fast, safe, never lose a rupee

Status (2026-10-20): Stage 0 is built (L1/L2 fixes live; R2 nightly export and restore script ready, waiting on R2 secrets). Stage 1 (speed, lakh scale) and Stage 2 (two-phone safety) are built and tested locally, not deployed; their SQL has not been run on live Supabase. Stages 3–7 are in progress.
Date: 2026-10-19 · Companion to `docs/FAST_CLOUD_LOAD_PLAN_2026_10.md` (Stage 1 below)

## Rule #1: no data loss, ever

Every stage below must pass this test before it ships:

1. **Nothing typed into the app is lost.** That includes a phone going offline, a
   phone with the wrong clock, two staff editing the same job, the app being closed
   mid-sync, sign-out, a full phone, or a buggy release.
2. **If something can't be saved, the app says so loudly.** A red banner that stays
   until it's fixed, not a hidden console message.
3. **Everything can be undone.** Every old version of every record is kept
   somewhere, so a bad edit or a bad sync can be rolled back.

### Ways data can be lost in today's code (found during this review)

| # | Risk | Where | What can happen |
|---|---|---|---|
| L1 | **Disconnect wipes unsynced changes** | `disconnectGS()` in `js/sync.js:2052` calls `clearLocalDeviceDataAfterSignOut()` without checking `syncMeta.pendingSync`, and without asking first | Staff tap Disconnect while offline and lose today's invoices |
| L2 | **Failed device saves are silent** | `setLocalStorageSafe` / `saveAll` in `js/data.js:394–512` only `console.warn` | Phone storage full → invoice looks saved, gone after reload, **no error shown** |
| L3 | **Last upload wins on the server** | `upsertShadowRows` does a plain upsert with no version check | A phone with an old copy of a job uploads it and overwrites a newer edit from another phone |
| L4 | **Device clocks decide who wins** | `mergeByKey` / `recordStamp` compare `updatedAt` from each phone | A phone with a wrong date/time wins or loses every merge |
| L5 | **Delta pull can miss rows** | cursor = `source_updated_at` (device time), deletions filtered out, gap-fill capped at 200 rows | A phone never sees an edit or delete, and later (L3) uploads its stale copy over it |
| L6 | **Whole-record merge** | `mergeByKey` keeps one whole record per id. Only payments are union-merged | Two staff edit different fields of the same job; one edit vanishes |
| L7 | **Upload window can skip old-stamped edits** | IO-saver push only sends rows stamped inside the recent window; others wait for the weekly full mirror | If the phone is wiped before the weekly mirror, that edit never reached the cloud |
| L8 | **No backup of our own** | Supabase is the only copy | A bad SQL run or a bad release has nothing to restore from |

L1 and L2 are small, urgent fixes and shouldn't wait for this roadmap
(see Stage 0).

## What we learn from other apps

These lessons come from how these apps behave for users. I couldn't find any
published write-up of Khatabook's internal design, so none of this claims to copy
their code.

| App | What they do | What JalaSai takes from it |
|---|---|---|
| **Khatabook** | Every "you gave / you got" is one ledger entry. The balance is the sum of entries. Works offline. One-tap WhatsApp/SMS payment reminders. Shareable PDF statements. Local languages. Runs on cheap phones. | Money becomes **entries, not edited fields** (Stage 3). Reminders and statement links (Stage 5). Phone-first speed targets. Telugu option. |
| **Banks / accounting (Tally, Vyapar)** | Never delete money. Mistakes are fixed with a reversing entry. Books close per financial year. GST invoice series per year. | Payments and adjustments are **append-only**. Financial-year close and archive. Server-issued **GST-valid invoice numbers** (Stage 4). |
| **WhatsApp** | Each message shows a clock (waiting), one tick (sent), two ticks (delivered). Messages queue offline and send later. | Each job/invoice shows **"waiting to upload" vs "saved to cloud"**. An **outbox** queue that survives restarts (Stage 2). |
| **Instagram / Gmail** | Newest first. Older items load as you scroll. Cached so it opens instantly. | Stage 1 (fast-load plan). |
| **Linear / Figma / Replicache / PowerSync** | Local database on the device, a queue of changes, and a server that gives every change a version number. Conflicts are resolved per field, not per record. | Sync engine v2 (Stage 2). Field-level merge for job details. |
| **Git** | Every version is kept. You can see who changed what, and go back. | A **row history table** on the server (Stage 0), plus a "history" view on each invoice. |

## End state (where we want to be in about 6–12 months)

```
Phone (PWA)                                   Supabase (source of truth)
┌──────────────────────────────┐              ┌───────────────────────────────────┐
│ IndexedDB                     │  outbox ──▶ │ apply_changes() RPC                │
│  • records (jobs, customers…) │             │  • checks version, rejects stale   │
│  • ledger entries (money)     │             │  • writes row + row_history        │
│  • outbox (pending changes)   │ ◀── delta ─ │  • bumps server version/seq        │
│  • cursors, summaries         │             │ changes_since(cursor) RPC          │
└──────────────────────────────┘              │ daily_summary, customer_balance   │
   UI reads local first, always               │ invoice_series (per FY)            │
   instant; shows ✓ / ⏳ per record           │ nightly export → Cloudflare R2     │
                                               └───────────────────────────────────┘
```

- **The device is fast, the server is the judge.** The UI only ever reads the local
  database, so the app opens and works instantly, even offline. The server decides
  the order of changes and refuses stale overwrites.
- **Money lives in an append-only ledger.** Invoices, payments, advances, refunds
  and discounts are entries. Balances, reports and dues are sums, kept up to date
  by the server, so no phone ever needs the full history to show a correct number.
- **Three safety nets:** row history on the server, a nightly export the garage
  controls, and the outbox on the phone. Nothing is deleted until the server has
  confirmed it.

## Scale target: lakhs of invoices every year

The owner's long-term goal is **more than 1 lakh (100,000) invoices per year**. Kept
for 5+ years, that is **5–15 lakh jobs** and several million payment and log rows.
That target changes the design.

**Measured on the local preview (Mac Chrome, synthetic invoices):**
- 20k invoices: 24 MB to download, 1.8 MB stored even after compression, 1.8 s to
  save once.
- **1 lakh invoices: about 124 MB to download.** Saving to device storage froze
  the page for **more than a minute**, which is longer than the test tool would
  wait, and the data is too big for the ~5 MB localStorage limit in any case. The
  phone would end up keeping **nothing**, with no error shown (risk L2).
- Phones are 3–5× slower than this Mac.

**So these rules apply from Stage 1 onwards:**
1. **Phones hold a rolling window, never all history.** Open jobs, the last
   ~30–90 days of invoices, active customers, all stock and mechanics. Capped by
   count (goal: ≤ 20k records, ≤ 50 MB on the phone) so a busy garage doesn't
   overflow it.
2. **Older data lives on the server only.** It loads page by page (cursor, 50–500
   rows) when someone scrolls, searches, or opens a customer or invoice. Like
   Instagram: the phone never has the whole feed.
3. **Totals are never computed by scanning history.** Server summary tables are
   kept up to date by triggers as each entry is written:
   - `daily_summary` (date × payment method × kind) and `customer_balance`
   - Any report range is then a sum of at most 366 daily rows, which is instant
     even with crores of rupees and millions of rows.
4. **Search runs on the server** (Postgres `pg_trgm` index on invoice number,
   customer name, phone, vehicle number). Local search only covers the window
   for instant results while offline.
5. **Lists load slim rows** (~250 bytes: number, customer, vehicle, date, total,
   paid, due). The full invoice (parts, photos, notes) loads only when it's
   opened.
   - A slim or partial record must **never be uploaded over the full one**. The
     Stage 2 outbox guarantees this because it uploads only the fields a person
     changed.
   - Until Stage 2 ships, the phone keeps full records for everything in its
     window.
6. **Every server query is bounded and indexed:** ≤ 500 rows per request, under
   300 ms of database time. Checked with `explain analyze` before release.
7. **Database growth plan:**
   - Fine as is up to a few million rows with the right indexes.
   - Split (partition) jobs and ledger tables **by financial year** when a table
     passes ~5M rows, or when archiving old years. Partition the audit log and row
     history **by month**, keep 2 years in the database, and move older months to
     the R2 archive.
   - Expect to need a paid Supabase plan for storage at this size (rough guess
     2–5 GB at 10 lakh jobs with indexes). Check current Supabase pricing before
     Stage 5.
8. **Realtime:** per-row change events are fine for one garage. For many garages
   (Stage 7), switch to one broadcast channel per garage.

## Stages

Each stage ships on its own, is deployed with `./deploy.sh`, and changes shared
`js/`. Any markup change goes into both `index.html` and `NEW UI/index.html`.

### Stage 0: Safety net first (about 1–2 weeks, before anything else)
- **Fix L1:** Disconnect checks `pendingSync`. If changes are waiting, it tries to
  upload first. If that fails, it refuses to wipe and offers "Download backup file"
  instead. It always asks before wiping.
- **Fix L2:** if a device save fails, show a red banner that stays ("This phone
  could not save. Do not close the app. Tap to download a backup."), and record it
  in Sync diagnostics.
- **Row history (server):** a trigger copies the old row into `garage_row_history`
  (table, id, old record_data, who, device, when) on every update/delete of the
  shadow tables. This makes L3/L5/L6 recoverable straight away, even before
  they're fixed.
- **Nightly export:** a scheduled Cloudflare Worker (or Supabase cron) exports all
  tables to Cloudflare R2 as dated JSON, keeping 30 daily and 12 monthly copies.
  Add a "Restore from date" runbook in `docs/OPERATIONS.md`.
- **Data-loss test checklist** (below), run by hand first, automated later.
- *Pass:* every L1–L8 scenario either can't lose data or is recoverable from
  history; the export restores into a test project.

### Stage 1: Fast load
Everything in `docs/FAST_CLOUD_LOAD_PLAN_2026_10.md`: server change clock,
reliable delta (fixes L5), IndexedDB (removes the storage limit behind L2), newest
invoices first, older on demand, server totals. Background backfill stops at the
**rolling window** (see Scale target), not at full history.
*Pass:* fresh phone usable ≤ 2.5 s, Sync Now ≤ 1.5 s, saving an invoice ≤ 50 ms.

### Stage 2: Sync engine v2: outbox + server versions (fixes L3, L4, L6, L7)
- **Outbox:** every save writes `{op, table, id, fields changed, base_version,
  client_time}` to an IndexedDB outbox, in the same transaction as the record. The
  upload sends the outbox in order and deletes each entry only after the server
  confirms it. The IO-saver window and weekly full mirror are no longer needed.
- **Server versions:** each row gets `version bigint`, raised by the server on
  every change. `apply_changes()` accepts a change only if `base_version` matches.
  Otherwise it **merges field by field** (different fields both kept). If the same
  field was changed on two phones, the later server arrival wins and the other
  value goes to `row_history`, with a "changed on two phones" note on the invoice.
- **No device clocks in decisions.** `updatedAt` is display-only. The server's
  version order is what counts (fixes L4).
- **Per-record status** in the UI, like WhatsApp: ⏳ waiting, ✓ in cloud, ⚠ conflict.
- Option to consider at this stage: use **PowerSync** (built for Supabase, local
  SQLite in the browser) instead of building our own. Upside: proven queue and
  partial sync. Downside: it likely needs a bundler and WASM workers, while the
  app today is plain HTML/JS with no build step. Its Safari support needs testing,
  and it's another service to pay for. **Decide with a 2-day spike** before
  starting Stage 2.

#### Stage 2 status (2026-10-20): built, merged onto Stage 1, tested locally

Built 2026-10-19, parked while Stage 1 landed, then merged on 2026-10-20:
- Downloads all go through Stage 1's changes-only path. `applyChangedRecords`
  captures local edits first, keeps records with changes waiting, takes the
  server copy for everything else on a v2 server, and marks applied records as
  matching the cloud (no echo uploads).
- Stage 1's server functions return whole rows, so each row's `version`
  arrives with it once the Stage 2 SQL is run.
- The one-time "learn every version" full download is skipped on phones that
  keep only recent history (it would download everything); their versions
  arrive with each pull.
- Tested again with two phones against local Postgres: the data-loss
  checklist, upgrade-in-place, old-app safety, and all Stage 1 suites in both
  modes (Phase 1 SQL only, and Phase 1 + Stage 2 SQL).

Built our own engine (no build step, no new service). PowerSync was not tried.

- **Phone:** `js/sync-outbox.js`, wired into `js/sync.js` / `js/data.js`, loaded by
  both UIs. After each save, every record is fingerprinted and changed ones go
  into an IndexedDB outbox (`jalasai-sync`), with no timestamps involved. An
  entry is removed only when the server confirms that exact content.
- **Server:** `supabase/2026-10-sync-v2-stage2.sql` (needs Phase 1 first):
  - `version` on every row, raised by a trigger;
  - `jalasai_apply_changes()` compare-and-set, so resends are recognised;
  - field-by-field merge using `garage_row_history` as the common base.
    Lists with ids (payments, parts) merge item by item;
  - every refused change is kept in `garage_sync_conflicts`.
- **Different from the plan above:** the merge runs on the **server**, because it
  already has every old version. The phone keeps only version numbers, not a
  second copy of the data, which matters for the 50 MB phone budget. And ✓ isn't
  shown: a record shows nothing once it's saved to the cloud (calm UI). It shows
  ⏳ while waiting and ⚠ for 7 days after a two-phone conflict.
- **Safe before the SQL is run:** the app detects the missing function and keeps
  the old table sync. It also uploads exactly the queued records, so L7 is fixed
  even on today's server.
- **Tested** on local Postgres, with two simulated phones running the real `js/`
  files. The checklist below, items 1, 2, 3, 4, 5, 8 and 9, all pass. Also tested:
  an old-stamped edit (L7), no echo uploads after a download, a live upgrade
  (queued change kept, versions learned, no conflict round trips afterwards), and
  a phone still on the old app not being overwritten.
- **Known limits:**
  - Phones still on the old app keep plain upserts, so L3 stays possible for
    their writes until every phone has updated.
  - A delete beats an offline edit; the edit is kept in `garage_sync_conflicts`,
    not on the invoice.
  - Change capture is a full table pass in the background after saves (≈0.1 s
    per 20k jobs on a Mac, chunked so the screen never freezes). Downloads only
    check the records they touch.

**Rollout order** (each step is safe on its own):
1. Deploy the app (`./deploy.sh`). Phones keep using the old server path.
2. Back up, then run `supabase/2026-10-fast-sync-phase1.sql`.
3. Run `supabase/2026-10-sync-v2-stage2.sql`. Within 6 h, or on the next app
   open, phones switch to v2 and do one full download to learn versions.
4. Monthly: `select public.jalasai_prune_sync_bookkeeping();`

### Stage 3: Money as a ledger (Khatabook model)
- New table `garage_ledger_entries`: `id, customer_id, job_id, kind (invoice |
  payment | advance | refund | discount | adjustment | reversal), amount,
  method, at, by, device, reverses_id`. **Insert only**: no updates, no deletes.
  A mistake is fixed with a `reversal` entry.
- The job keeps its parts and labour. Its money (`payments[]`, `payment`, totals)
  becomes entries. This removes the special payment union-merge hack and makes
  two phones taking payments at once safe by design.
- Server-maintained `customer_balance` (sum of entries) and `daily_summary`
  (date × method × kind), kept up to date by triggers, so Reports, dues and
  balances are instant and always correct, whatever the phone has downloaded.
- Migration: one-time script turns existing `payments[]` into entries, with a
  **reconciliation report** (old balance vs new balance per customer, which must
  match to the rupee) before switching the app over. The old fields stay
  read-only for 2 releases.
- *Pass:* 0 rupee difference on every customer and every day across all history.

#### Stage 3 status (2026-10-20): built, tested locally — server-side ledger

Built as an **insert-only ledger on the server that follows the job records**,
rather than rewriting the app's money model. Every invoice, payment, edit,
print and balance screen works on `jobs[].payments` today; changing that is
the highest-risk change possible for a garage's money. The ledger gives the
same guarantees without it:
- `supabase/2026-10-ledger-stage3.sql` (needs Phase 1): `garage_ledger_entries`,
  insert-only (updates and deletes are refused). A trigger on `garage_jobs`
  adds lines for every saved change: the invoice total (charge), one line per
  payment / advance, the part of the paid figure not covered by entries (old
  records), and `change` / `reversal` lines when anything is edited or removed.
  A removed payment keeps its original line next to its reversal.
- For every job the lines add up to exactly what the app shows (total − paid).
  `jalasai_ledger_reconcile()` lists any job where they don't (expect none).
- `garage_ledger_balances` (customer balances) and
  `jalasai_customer_statement(customer, from, to)` (opening, lines, closing)
  feed the Stage 6 statement and reminders.
- Two phones taking payments at once are already safe: Stage 2's server merge
  combines payment lists entry by entry.
- Tested with messy money data (partial payments, negative adjustments,
  advances, old single-figure payments, figures that don't match their entries,
  deletes): 0 rupee difference per job and per customer, before and after
  edits, with and without the Stage 2 SQL.
- Not done: moving the app itself to ledger entries. Revisit only if the job
  model blocks a feature; the reconcile check makes that switch provable.

### Stage 4: Invoices that follow GST rules
- GST rule (CGST Rule 46): invoice serial must be **consecutive, unique per
  financial year, ≤ 16 characters**, using only letters, digits, `-` and `/`.
- Server table `invoice_series(fy, prefix, next_no)` and RPC `claim_invoice_no()`
  that hands out the next number atomically (no clashes between phones).
- Format suggestion: `JS/26-27/0001`. Offline phones get a **draft number**
  (`D-…`) and the real number when they reach the server. Or, if staff need the
  number on paper offline, each device gets a reserved block of numbers. That
  choice is the owner's.
- Financial-year close: at 1 April, lock the old year (only reversals allowed)
  and keep it as an archive the phone loads on demand.
- First, check whether the garage is GST-registered. If not, keep the simple
  numbering but still issue numbers from the server.

#### Stage 4 status (2026-10-20): built, tested locally (no GST)

The garage isn't GST-registered, so numbers stay plain and keep counting from
today's highest (e.g. 10564). `supabase/2026-10-invoice-numbers-stage4.sql`
(needs Phase 1):
- `garage_invoice_series` (one counter) + `garage_invoice_claims` (job → number,
  unique). `jalasai_claim_invoice_no(job_id)` hands out the next free number,
  skipping any number already in use, and returns the same number if a phone
  retries.
- `jalasai_invoice_no_taken(no, job_id)`: duplicate check against all invoices
  in the cloud, with the phone's own matching rules (INV- prefix, leading
  zeros), indexed.
- App: with that SQL installed, the number box shows "Auto". A new invoice gets
  a draft number unique to the phone (D-AB12-3), shown as a draft on the printed
  invoice. It becomes the real number right after the save when online, on
  reconnect, and before every upload. Any phone can turn any draft into a real
  number. A number typed by hand is used as typed, and a warning shows if
  another invoice in the cloud already uses it.
- Tested with two phones: simultaneous invoices get different numbers; offline
  drafts become the next numbers in order; a retried claim returns the same
  number; a stranded draft from a lost phone gets fixed by another phone; the
  cloud ends with no duplicates and no drafts; a typed duplicate in history that
  isn't on the phone is caught; without the SQL the old numbering is unchanged.

### Stage 5: Lakh-scale history (server-only old data)
- Phones drop records older than the window from local storage, but only records
  with **no pending changes in the outbox**. They stay readable from the server
  on demand.
- Slim list rows (columns only) for Invoices / Customers, with the full record
  fetched on open. Server search (`pg_trgm`) for invoices and customers.
- Customer list paged and searched on the server (tens of thousands of customers
  at this scale). Phones keep recent and active customers only.
- Partition jobs / ledger by financial year and audit/history by month. Old
  months go to the R2 archive with a "Download year" option.
- Load test before release: generate **10 lakh synthetic invoices in a scratch
  Supabase project** and check every screen still meets the targets below.
- *Pass:* with 10 lakh invoices on the server, fresh phone ≤ 2.5 s, Sync Now
  ≤ 1.5 s, any report range ≤ 1 s, search ≤ 1 s, phone storage ≤ 50 MB.

### Stage 6: Khatabook-style features on the solid base
- WhatsApp/SMS **due reminders** with the UPI link and the amount due, from the
  ledger balance.
- **Customer statement link / PDF** (read-only share page per customer, with an
  expiring token).
- **Daily close:** cash counted vs app cash, difference recorded as an entry.
- **Staff roles:** owner / manager / mechanic, enforced by Supabase RLS (today any
  signed-in user has full access, and Reports are behind a `1122` code on the
  device only).
- Telugu labels; "lite mode" for cheap phones.

#### Stage 6 status (2026-10-20): built, tested locally

`supabase/2026-10-customer-features-stage6.sql` (needs Stage 3):
- **Staff roles** (owner / manager / mechanic) in `garage_staff`. While the list
  is empty everyone keeps today's full access; "Staff roles" on the Admin page
  lets the first person become owner, and the owner sets roles by sign-in
  email. Unlisted staff are managers. Mechanics are blocked from admin pages in
  the app, and the server refuses them the ledger, report totals and statement
  links (jobs and stock still work).
- **Customer statement links:** "Share statement" on a customer and the due
  reminder on WhatsApp now carry a link to `statement.html?t=…`. That page works
  without signing in, but only with the link's 64-character random token (30
  days, revocable) and shows only that customer: balance, every ledger line
  with a running balance, "Pay by UPI" (opens the UPI app with the amount),
  Save as PDF, Call garage. The garage's UPI ID is a new field in the Garage
  profile.
- **Daily close** (Reports → "Close the day"): opening float + cash received −
  cash paid out = expected; the counted amount is saved in the audit log and a
  difference is recorded as a "Cash difference" expense (short) or income
  (extra).
- Tested: roles and their server limits, link creation / anon access / expiry /
  revoke / one-customer scope, statement totals by id and phone, the statement
  page on a phone, and daily close maths.
- Not done: Gujarati / Hindi labels and a lite mode. Which language to support
  is the owner's call.

### Stage 7: Many garages (if JalaSai becomes a product)
- Turn on `tenant_id` (groundwork exists: `JALASAI_SEND_TENANT_ID`), per-tenant
  RLS from JWT claims, tenant-scoped exports and backups. Add a landing page at the
  public URL, with the app behind sign-in.
- Only after Stages 0–3, since it multiplies the cost of any data bug.

## Data-loss test checklist (must pass before every sync-related release)

1. Phone A offline: create 3 invoices, close the app, reopen, go online → all 3
   in the cloud.
2. Phones A and B edit the **same job** (different fields) offline → both edits
   kept.
3. Same field on both phones → one wins, the other is visible in history, with a
   conflict note.
4. Phone with the date set 2 days wrong edits a job → it doesn't overwrite newer
   edits.
5. Delete on A while B is offline for a week with 500+ other changes → B sees the
   delete and doesn't bring it back.
6. Tap Disconnect with pending changes → blocked or uploaded first, never wiped.
7. Fill phone storage (test page) → red banner. Nothing silently lost.
8. Kill the app in the middle of an upload → the outbox resends, no duplicates.
9. Two phones take a payment on the same invoice at the same time → both
   payments exist and the balance is correct.
10. Restore the nightly export into a scratch Supabase project → counts and
    money totals match live.

## Targets (owner-visible)

| Measure | Today (est., 12k invoices, phone) | Today at 1 lakh invoices | Goal (up to 10 lakh+ on server) |
|---|---|---|---|
| New phone, first usable screen | 15–30 s | minutes; phone can't store it | ≤ 2.5 s |
| Sync Now | 10–25 s (full download) | ~124 MB download | ≤ 1.5 s |
| Save an invoice (screen freeze) | ~2–3 s | > 1 min, then save fails silently | ≤ 50 ms |
| Report for any date range | 0.7–3 s on phone | doesn't work | ≤ 1 s (server daily summaries) |
| Phone storage used | ~1 MB | over the limit | ≤ 50 MB, capped |
| Lost or overwritten records | possible (L1–L8) | **0**, and everything recoverable |
| Report numbers vs cloud | depends on what the phone has | always exact (server summaries) |
| Backups we control | none | nightly, 30 days + 12 months |

## Decisions needed from the owner

1. Start with **Stage 0 (safety fixes)** now, before the speed work?
2. Is the garage **GST-registered**? (This decides the invoice number format.)
3. Build our own sync engine (Stage 2), or try **PowerSync** first (adds a build
   step and a monthly cost)?
4. Where should nightly backups go: **Cloudflare R2** (same account as the site)
   or Google Drive?
