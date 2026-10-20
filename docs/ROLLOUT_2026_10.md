# Rollout checklist — 2026-10 data, speed and safety work

Everything below is built and tested locally on branch `ux-polish`. Nothing is
deployed, and none of the SQL has been run on live Supabase. Each step is safe
on its own and can stop there; the app detects what the server has and only
switches on the matching features.

Tested setups (two simulated phones, the real `js/` files, local Postgres):
- **today's live server** (no new SQL): the new app syncs exactly as before;
- **Phase 1 only**: changes-only sync, newest-first, rolling window, cloud
  report totals;
- **every SQL file**: all of the above plus two-phone safety, server invoice
  numbers, the ledger, roles and statements.

## Progress log

| Date | Step | Result |
|---|---|---|
| 2026-10-20 | 1. App deployed (`ux-polish` ff6e37d) | live site loads, new code running, no errors |
| 2026-10-20 | 3. CHECK FIRST | existing **duplicate invoice numbers** found: 10607 ×3; 10594, 11068, 10499, 10609, 10500, 9721, 9785 ×2. Not caused by this work; Stage 4 prevents new ones. The query in step 3 lists which invoices share a number. |
| 2026-10-20 | 4. Phase 1 SQL run on live | daily totals rebuilt: 1,902 rows; highest invoice 12747 |
| 2026-10-20 | Bug found | an old phone stayed stuck at invoice 12076 even after refreshing (it last synced weeks ago). Fixed in commit "Old phones catch up by themselves…" (c145aa8). |
| 2026-10-20 | Fix deployed (`ux-polish` 389e5e3, build jalasai-1792477571) | live site loads with the catch-up fix; payment-date fix still not included |
| next | Watch phones ~1 day | Sync diagnostics → "Changes only", Sync Now ≈ 1 s |
| waiting | Payment-date fix (branch `claude/loving-leavitt-0cfc46`) | not merged yet, by choice; after merging, re-run its updated section of the Phase 1 SQL (it recomputes totals) |
| waiting | 5. Stage 2 SQL | after the phones look good |

## Order

| # | Step | Where | What switches on | Check |
|---|---|---|---|---|
| 1 | Deploy the app: `./deploy.sh` from `ux-polish` | terminal | grouped device storage (faster saves), daily close, UPI field | app opens; Sync diagnostics shows "Last Download Speed" |
| 2 | **Back up** Supabase | Dashboard → Database → Backups (or pg_dump) | — | backup listed |
| 3 | Run the **CHECK FIRST** queries at the bottom of `supabase/2026-10-fast-sync-phase1.sql` | SQL editor | — | note row counts, DB size, statement timeout, and any **duplicate invoice numbers** |
| 4 | Run `supabase/2026-10-fast-sync-phase1.sql` | SQL editor | changes-only sync, Sync Now ≈ 1 s, row history, newest-first for new phones, rolling window (lakh scale), cloud report totals, cloud search, "Load older invoices" | VERIFY AFTER queries in that file; within 6 h (or on reopening) Sync diagnostics shows "Changes only" |
| 5 | Run `supabase/2026-10-sync-v2-stage2.sql` | SQL editor | upload queue, server versions, field-by-field merge (two phones can't overwrite each other) | Sync diagnostics shows the upload queue; `select count(*) from garage_sync_conflicts` stays small |
| 6 | Run `supabase/2026-10-ledger-stage3.sql` | SQL editor | insert-only money ledger | `select count(*) from public.jalasai_ledger_reconcile();` → **0** |
| 7 | Run `supabase/2026-10-invoice-numbers-stage4.sql` | SQL editor | server invoice numbers, offline drafts, cloud duplicate warning | `select * from garage_invoice_series;` → next number = highest + 1; the number box shows "Auto" |
| 8 | Run `supabase/2026-10-customer-features-stage6.sql` | SQL editor | staff roles, statement links | `select public.jalasai_my_role();` → `owner` |
| 9 | Admin → **Staff roles** → "Make me the owner", then set mechanics by their sign-in email | app | mechanics lose money reports | sign in as a mechanic: Reports/Admin hidden |
| 10 | Admin → Garage profile → **UPI ID** | app | "Pay by UPI" on statements | Customers → Share statement → open the link |
| 11 | R2 backups: bucket + token + 4 GitHub secrets ("Backups to Cloudflare R2" in `docs/OPERATIONS.md`) | Cloudflare + GitHub | nightly copies, 30 days + 12 months | Actions → Nightly Supabase Backup → Run; `daily/<today>/` appears |
| 12 | Practise a restore into a scratch project (`scripts/supabase-restore.mjs`, "Restoring from a backup") | terminal | — | `--check` counts match |

Steps 5–8 can wait days or weeks after step 4. Step 6 must come before step 8.

## If something looks wrong

- **Data looks wrong on one phone:** Sync diagnostics → "Repair: re-download
  everything". The cloud copy is untouched by that.
- **A bad edit or delete in the cloud:** the old version is in
  `garage_row_history` (after step 4). See "Restoring from a backup" in
  `docs/OPERATIONS.md`.
- **Report totals look off:** `select public.jalasai_rebuild_daily_totals();`
  recomputes them from the invoices.
- **Ledger reconcile isn't 0:** don't use statements yet; send the rows from
  `select * from jalasai_ledger_reconcile()` for a look. The ledger never
  changes invoices.
- **Invoice numbering:** to go back to phone numbering, drop the two functions
  (`drop function public.jalasai_claim_invoice_no(text), public.jalasai_invoice_no_taken(text, text);`).
  Phones fall back within 6 hours or on reopening, and drafts already made keep
  their numbers.
- **Roles locked someone out:** `delete from garage_staff;` restores today's
  full access for everyone.

## Known follow-ups

- Payment dates come from the UTC timestamp, so a payment between midnight and
  5:30 am IST counts on the previous day. That affects "Today collected", Reports
  and daily close. It's an older app behaviour, not new.
- Gujarati / Hindi labels and a lite mode for cheap phones: the owner decides
  the language.
- Stage 7 (many garages): waiting for a go / no-go (see the roadmap).
