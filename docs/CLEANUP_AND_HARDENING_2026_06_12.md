# Cleanup and Sync Hardening — 2026-06-12

One-shot execution of the audited cleanup and hardening plan agreed with the owner. Repository state before this change is tagged `pre-cleanup-2026-06-12`.

## Scope decided by the owner

- Remove: supplier catalog / agent-JSON / invoice-import review pipeline, legacy `garage_state` blob paths, Google Apps Script integrations.
- Keep as-is by design: physical invoice book is the invoice-number source of truth (no server-side sequence), client-side admin email config, negative stock allowed (stock scan in/out is reference data, not invoice-linked).
- Both UI shells (root and `/newui/`) stay alive and must behave identically.

## Phase 1 — Deletions

- **Supplier-import pipeline removed** (~1,050 lines from `js/stock.js`, plus state, storage keys, sync table configs, normalizers and UI in both shells). The five domains `reviewItems`, `importBatches`, `purchaseEntries`, `supplierCatalogMap`, `invoiceImportReviews` no longer exist in the app. Their Supabase tables were removed from `supabase/schema.sql`; existing cloud rows are untouched (archive in place — drop manually if ever desired). `stockMovements` is kept: it is the stock audit trail used by receive/recount.
- **Legacy `garage_state` blob removed** from code and schema: pull fallback, weekly Sunday blob, manual `Copy Data to garage_state` admin action, `importLegacyBundle`. The Admin "Backup" card now downloads a full local JSON backup instead.
- **Dead validation machinery removed** (`garage_sync_validation_runs`, validate/summarize/log functions): it could never run because it was gated on `!IO_SAVER_SYNC` and `IO_SAVER_SYNC` is permanently `true`.
- **Demo/seed purge code removed** (`SEED_*`, `DEMO_*`, `purgeSeededSampleData`, `purgeDemoStockData`, sample-text detectors). Production has no demo data left; boot maintenance now only does mechanic recovery, temp-job purge and customer tidy-up.
- **`apps-script/` deleted.** Both scripts read/wrote a 2024-era record shape (single mechanic field, no `payments[]`, no discount) and would have corrupted current data if ever run. Sheet/Drive backup is replaced by the GitHub Action (Phase 5).
- Old SQL recovery scripts under `supabase/` deleted (kept in git history).

## Phase 2 — Sync hardening (js/sync.js)

1. **Delta-pull cursor fixed.** `extractMaxUpdatedAt` read `source_updated_at` from reconstructed `record_data` rows, where that column never exists — the cursor never advanced, so every "incremental" pull silently became a full pull. The cursor now advances using the real `source_updated_at` observed during the pull (`newestRemoteUpdatedAt`).
2. **`replaceLocal` guard.** Replacing the local dataset with the cloud view is now only allowed when the pull was full (not `since`-delta), not `criticalOnly`, and had zero per-table fallbacks. This closes a latent data-truncation path that fixing (1) alone would have armed: a delta pull in replace mode would have shrunk local data to just the delta.
3. **Delete propagation.** Explicit user deletes (invoice remove, job remove, part delete, expense/income delete) previously never reached the cloud: the row builders skipped tombstoned records and `SHADOW_INFER_DELETES` is off, so other devices resurrected deleted records. Builders now emit explicit tombstone rows (`deleted_at` set, `source_updated_at` = deletion time) for customers, mechanics, jobs, stock, expenses and income entries.
4. **Offline-gap sweep.** The reconnect/visibility "recent cloud changes" sweep (the only pull path that can see `deleted_at` rows) now widens its window to cover the time since the device last pulled (capped at 7 days) instead of a fixed 2 minutes, so deletes made while a device was offline are applied instead of resurrected.
5. **Payments-union merge.** Two devices recording different payments on the same job offline used to lose one payment to whole-record last-write-wins. Payment entries are now unioned across both copies (keyed by payment id) and the legacy `payment` total is recomputed. Union only widens; it never drops entries.

## Phase 3 — Shared shell runtime (js/shell.js)

The two HTML shells each carried ~1,050 lines of inline JS with 52 duplicated functions (including `confirmDone`, the invoice completion path). 50 were byte-identical and now live once in `js/shell.js`, loaded by both shells after `sync.js`. The two genuinely diverged functions (`invoiceSortParts`, `renderInvoices` — the New UI shows a month-scoped stats line and last-digit-group sorting) remain inline per shell, plus each shell's bootstrap. Extraction was verified byte-identical against both shells' previous behavior; `sw.js` caches the new file; `deploy.sh`'s existing cache-busting regex covers it.

## Phase 4 — Offline scan/print and stock workflow speed

- **Sticker QR codes are now rendered locally first** with the bundled `QRGen` encoder; `api.qrserver.com` is only a fallback if local drawing fails. Label printing now works fully offline and SKUs are no longer sent to a third party.
- **Batch scan mode** (checkbox next to both Start Camera buttons): the camera keeps running across scans. In Receive Stock each known sticker adds +1; on the Scan page each known sticker deducts −1 (no job/price dialog). A repeat-guard ignores the same sticker for 2.5 s. Requires a cloud session; otherwise falls back to the interactive flow.
- **Set Count (shelf reconciliation)** in the Receive Stock card: scan a bin, type the actual count; qty is reset and an audited `recount` stock movement is logged. This is the monthly answer to deliberate stock drift.
- **Book Check line in the closing summary**: first and last invoice numbers entered for the period plus a missing-in-range count, for fast reconciliation against the physical invoice book (the source of truth).
- jsQR/ZXing remain CDN-loaded for now; vendoring them locally needs an owner-approved dependency download (blocked by policy in this session). Native `BarcodeDetector` (Android Chrome) already scans offline.

## Phase 5 — Settings, backup, tenant groundwork

- **Garage Profile** (Admin page, both shells): shop name, short name, address, city, phone. Used by printed invoices, WhatsApp bill/reminder/order messages and the closing summary. Defaults equal the previously hardcoded values; stored per device (`js_garageprofile`).
- **Nightly Supabase backup**: `.github/workflows/nightly-backup.yml` + `scripts/supabase-backup.mjs` dump all live tables daily at 03:00 IST and push to a private backup repo. Skips gracefully (stays green) until secrets are configured: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`, `BACKUP_REPO` (private!), `BACKUP_REPO_TOKEN`. Dumps are never stored in this public repo or as artifacts.
- **tenant_id groundwork**: additive `tenant_id text not null default 'jalasai'` columns in `supabase/schema.sql` for all live tables, plus report views (`garage_monthly_revenue`, `garage_outstanding_dues`, `garage_stock_alerts`). The app does NOT write `tenant_id` yet — flip `JALASAI_SEND_TENANT_ID` in `js/sync.js` to `true` only after running the new SQL once. Reports intentionally keep computing locally so they stay instant and offline.

## Verification

- All `js/*.js` pass `node --check`; both shells' remaining inline blocks parse.
- Both `/` and `/newui/` loaded from a locally built `deploy/` with zero console errors/warnings.
- Live checks: local QR canvas renders a real code; payments-union merges `p1`+`p2` → total 150; Book Check correctly reports `#1041 – #1044 (3 entered · 1 missing in range)`; removed functions are absent from both shells; garage profile defaults intact.

## Deploy steps for the owner

1. Run the updated `supabase/schema.sql` once in the Supabase SQL editor (additive: tenant_id columns + views). Nothing breaks if delayed — the app does not send `tenant_id` yet.
2. Deploy with `./deploy.sh` as usual.
3. Optional: configure the four backup secrets to activate the nightly backup.
4. Later (after step 1 is confirmed): set `JALASAI_SEND_TENANT_ID = true` in `js/sync.js` and redeploy.
