# JalaSai Changelog

Last updated: 2026-06-07

## 2026-06-07

### Supabase project unhealthy incident documentation

- Documented the 2026-06-07 Supabase project unhealthy incident in `docs/SUPABASE_PROJECT_UNHEALTHY_INCIDENT_2026_06_07.md`.
- Added `docs/INCIDENTS.md` as a central incident index.
- Added an Operations runbook for the `Supabase project URL or anon/publishable key may be wrong, or Supabase is not responding.` warning.
- Recorded the verified cause: Supabase project database connection path was unhealthy; restarting the Supabase database restored Auth, PostgREST, Storage, and Cloud Sync.
- Clarified that valid Cloudflare runtime config and anon key were present, so Cloudflare/app deployment changes were not required for recovery.

### Save and stock-search freeze follow-up

- Fixed foreground cloud-sync work after routine saves: stock, scan, and job save paths no longer call `pushGS()` directly after `saveAll()`.
- Added domain-scoped auto-sync so invoice/job saves mirror job-related Supabase shadow tables and stock saves mirror stock-related tables instead of rebuilding every table on the browser main thread.
- Added short yields during shadow-table mirror preparation so background sync gives the browser event loop time between table batches.
- Preserved the local-first save behavior: data is still written locally immediately, while cloud upload continues through queued background sync.
- Added newer-local-change protection so a cloud push finishing late does not clear a pending save made while the upload was in flight.
- Added missing `updatedAt` stamps to stock quantity, scan, job-part, catalog-review, and agent-import mutations so IO-saver sync uploads the changed stock rows.
- Cached stock list sorting, bike filters, and value totals per data version so stock search/filtering does less repeated work on large inventories.
- Added a Cloudflare Pages runtime `/config.js` worker so Supabase URL/anon key can be set permanently with Wrangler/Cloudflare variables instead of being typed into the setup modal or committed into `js/cloud-config.js`.
- Verification completed with JavaScript parse checks, whitespace checks, direct `pushGS()` call grep, and local static HTML fetch. Playwright/browser automation was unavailable in this thread.

## 2026-06-05

### Quick invoice usability follow-up

- Moved legacy startup cleanup/repair work out of `loadAll()` so refresh can show saved local data first instead of repeating customer/job maintenance on every page load.
- Added a versioned background data-maintenance pass that waits for idle time before recovering old mechanic links, purging demo/sample data, removing temporary verification jobs, and tidying customer ownership.
- Deferred maintenance after cloud pulls as well, so realtime refresh applies and renders first instead of blocking the UI with customer/job repair scans.
- Bumped the service worker cache to `jalasai-v49` and registration URLs to `sw.js?v=49` so Brave/PWA clients receive the refresh/runtime fix.
- Restored Quick Invoice manual entry usability by detaching the native customer-search datalist from both old and new UI forms.
- Kept customer recommendations in the custom result list only, shown after at least 3 letters/digits.
- Made the customer search field prefill manual Customer Name and Phone fields while typing, so new customers can be written without selecting a recommendation.
- Removed the visible `Sync Now` button from both old and new UI chrome; realtime/background sync remains the daily path and diagnostics still cover recovery.
- Made New Job and Quick Invoice open immediately by showing the modal before recent customer/bike chips, service shortcuts, and customer datalist hydration run.
- Removed the New Job native customer-name datalist and capped New Job customer search recommendations to the same 3-character custom result flow.
- Reworked New Job and Quick Invoice customer suggestions to use a cached customer-only index: 3-character threshold, 12-result cap, and 90 ms debounce.
- Removed per-suggestion job scans from customer hint rendering so typing no longer pauses while suggestions are calculated.
- Changed refresh/startup to paint the app shell first, then load the local saved dataset on the next tick; cached devices finish the startup overlay immediately while realtime/cloud refresh continues in the background.
- Added a delayed startup overlay so fast cached refreshes do not flash, while slow local/cloud loads show an Instagram-style loading state instead of a frozen page.
- Cached recent customer/bike shortcut lists and the suggested next invoice number so repeated opens do not rescan the full jobs/customers dataset.
- Bumped the service worker cache to `jalasai-v48` and registration URLs to `sw.js?v=48` so Brave/PWA clients receive the corrected Quick Invoice/New Job/startup runtime.
- Verified in Brave on the local server: name typing preserved `Customer 0412` and showed the exact match in about `89ms`; phone typing preserved `9000000412` and showed the exact match in about `67ms`; New UI tab switching stayed around `62-104ms` in the smoke test.
- 2026-06-05 v49 follow-up was syntax/parity checked only after local browser testing was stopped at operator request; live Cloudflare verification still requires deployment with valid Cloudflare auth.
- Updated `docs/PERFORMANCE_SYNC_UI_INCIDENT_2026_06_04.md` with the follow-up root cause and corrective action.

## 2026-06-04

### Quick invoice, realtime sync UI, and startup performance

- Documented the 2026-06-04 performance/sync UI pass in `docs/PERFORMANCE_SYNC_UI_INCIDENT_2026_06_04.md`.
- Fixed Brave quick-invoice typing lag by limiting customer recommendations to query-scoped results after at least 3 letters/digits.
- Capped Quick Invoice customer suggestions instead of loading the full customer database into the input.
- Debounced Quick Invoice draft persistence during typing while keeping immediate save on committed `change` events.
- Removed the always-visible New UI header `Sync Now` action; the small sync badge now appears only when sync is busy, pending, or failed.
- Changed startup to local-first when business data exists: no startup overlay, no duplicate forced render after cloud init, and service worker registration is deferred until idle.
- Old UI startup now restores the remembered valid page instead of always rendering Jobs.
- Verified in Brave on the local server: Quick Invoice customer search dropped from about `826ms` to about `39ms`, New UI Jobs startup was about `569ms`, and old UI Stock startup was about `383ms`.

## 2026-06-03

### Old/new UI merge and deploy hardening

- Packaged the new interface under `deploy/newui/` while keeping the existing interface at the deploy root.
- Added old/new UI switches that save a local backup before navigation.
- Moved new UI registration to the root service worker and bumped the root cache to `jalasai-v43`.
- Replaced the root UI favicon/app icons with the updated New UI icon set.
- Changed the service worker app-shell strategy to cache-first with background refresh, reducing long tab-level loading on healthy Supabase.
- Reduced the startup loading fallback from 120 seconds to 12 seconds.
- Root service worker now pre-caches both old UI and new UI runtime files for smoother UI switching.
- Added cleanup for legacy nested `/newui/sw.js` registrations.
- Changed startup loading to a data-load overlay that stays until the first usable dataset renders; normal background cloud sync no longer blocks work with a full-screen blur.
- Fixed New UI Home dashboard rendering so KPI cards update from loaded data instead of staying at HTML default zeros.
- Fixed New UI mobile drawer navigation so tapping any menu item closes the drawer immediately and shows the selected page.
- Reduced two-device navigation slowdown by changing visibility/focus refresh from direct cloud pull to heartbeat stale-check and by debouncing last-page storage writes during rapid page switching.
- Added same-UI tab render caching so switching back to already-rendered tabs does not repeatedly rebuild heavy tables.
- Added New UI Home metric fixes so imported customer-master-only rows do not inflate customer count or pending dues.
- Excluded imported customer rows and the temporary verification job `J009-FEFV` / `ZZ UI TEST 20260603` from active workshop jobs.
- Added future-date guards for invoice, expense, and income entry dates.
- Enabled an emergency Supabase IO-saver sync profile: normal saves upload only changed shadow rows, auto pushes are batched, automatic pulls are throttled, and background stale checks now run every 5 minutes.
- Bumped the root service worker cache to `jalasai-v43` so the deployed runtime and favicon hotfix replaces older cached files.
- Added `docs/NEW_UI_MERGE_2026_06_03.md` with deployment notes and manual checks.

### Invoice sync stall and long-list pagination

- Documented the invoice sync stall in `docs/INVOICE_SYNC_STALL_INCIDENT_2026_06_03.md`.
- Fixed stale local cache refusal when cloud has newer invoice numbers: cloud pulls now apply if the remote invoice max is higher than local, even when local metadata timestamp looks newer.
- Hardened table pulls so `garage_jobs` loads first and non-critical table failures do not block invoice refresh.
- Added 100-record pagination to high-volume views: Jobs, Invoices, Stock, Customers, Expenses, Income, and Activity Logs.
- Search/filter logic runs before pagination, so searches still cover the full dataset rather than only the current page.
- Service worker cache bumped to `jalasai-v23` and the registration URL to `sw.js?v=23`.

## 2026-05-08

### Job status and mechanics filter update

- Added `Returned` as a first-class active job status in job create/edit flows, job board filters, inline status selectors, and reports.
- Extended mechanic totals on the `Mechanics` screen with period filters for `Month`, `Date`, and `Year`.
- Service worker cache bumped to `jalasai-v20` and the registration URL to `sw.js?v=20`.

## 2026-05-05

### Invoice recovery incident

- Documented the 2026-05-05 invoice loss/recovery event in `docs/INVOICE_RECOVERY_INCIDENT_2026_05_05.md`.
- Root cause: stale-device table sync inferred cloud deletes from rows missing in one device's local payload.
- Emergency sync guard added in `js/sync.js` and `deploy/js/sync.js`: `SHADOW_INFER_DELETES = false`, preventing missing local rows from tombstoning active cloud rows.
- Recovered invoices `10009` through `10040` from Supabase audit/payment breadcrumbs; `10008` was intentionally left untouched due to duplicates.
- Noted that Supabase Storage photos survived but could not fully reconstruct invoice rows because photos do not contain complete billing state.

## 2026-05-02

### Stale device sync recovery

- Changed `Sync Now` from push-only to pull-first sync: the app now downloads the latest cloud tables first, then pushes only if local pending changes still need upload.
- Added a long-idle device guard: if a device has not pulled cloud data for more than 24 hours, any upload first refreshes from cloud to avoid overwriting newer work from other devices.
- Startup cloud sync now force-refreshes devices whose last pull is older than 24 hours, so old laptops/phones recover without clearing browser cache.
- Cloud pulls now replace the local business cache when there are no pending local edits, which removes stale rows the same way manual cache clearing used to.
- Reduced normal two-device sync latency: auto-upload delay is now 350 ms, realtime pull debounce is 150 ms, and fallback polling is 15 seconds.
- Successful cloud pulls now clear any old `lastSyncError`, so Admin does not keep showing a stale network error after sync has recovered.
- In-progress sync statuses no longer append the previous merge summary, so messages like `Sending latest data...` no longer show stale-looking repair text beside them.
- Service worker cache bumped to `jalasai-v19` and the registration URL to `sw.js?v=19`.

## 2026-05-01

### Customer data repair and menu speed

- Repaired customer ownership logic after the shadow-table split: jobs now match customers through strict live-record checks, normalized phone keys, safer name-token matching, and identity-conflict guards.
- Khatabook opening-balance rows are treated as unique imported balance records unless there is real matching evidence, so random opening balances no longer inflate unrelated customers.
- Added cleanup for duplicate live customer IDs and exact duplicate customer records, then queued normal cloud sync so repaired links propagate to the shadow tables.
- Customer vehicle chips now rebuild from jobs that still actually belong to the customer, so old moved-balance vehicle labels do not linger.
- Invoice duplicate checks now ignore soft-deleted or non-completed jobs and use strict invoice reference matching.
- Invoice number sorting is numeric, so `9999` sorts directly before `10000`; combined references such as `9609,9610` sort by their first visible number.
- Removed the remaining top-nav text label beside the logo and enlarged the logo/nav tap targets.
- Customers, Reminders, and Invoices now use one-pass summary/index builds instead of repeated per-row scans.
- Customers renders the first 240 cards and shows `Load more customers`, preventing thousands of DOM cards from being created during a tab switch.
- Service worker cache bumped to `jalasai-v13` and the registration URL to `sw.js?v=13`.

## 2026-04-25

### Reminders tab

- Added a dedicated `Reminders` tab between Customers and Scan, with three sub-lists: Feedback Due (7+ days), Service Due (75+ days), Payment Due (any unpaid balance)
- Each row offers `Send WhatsApp`, `Mark as Sent`, and `Remove`. Customers without a phone show `Edit Customer · Add Phone` instead of Send/Mark
- Reminders persist past the 7/75 day window — they no longer disappear quietly after the due date and stay listed until the user explicitly handles them
- "Mark as Sent" or "Remove" hides the row until the next cycle:
  - Feedback / Service reappear automatically when a newer completed invoice exists (a new service auto-resets the timer to zero)
  - Payment hides for 7 days, and reappears immediately if the due balance grows during that window
- Sending a Service reminder also auto-dismisses the matching Feedback entry for the same job, so the user is not double-prompted
- Removed the old bulk `Feedback Due`, `Service Due`, and `Remind Customer Due` buttons from the Customers page header — they are superseded by the new tab
- Storage piggybacks on the existing customer object (`customer.reminders`), so cloud sync needed no schema change

## 2026-04-23

### Release hardening

- Locked `Print QR` back to the Admin-only route so non-admin users cannot reach it from Jobs/Stock or by direct page navigation
- Standardized shared business-date helpers to `Asia/Kolkata`, keeping Jobs, Expenses, Reports, and reminder windows aligned on the same day boundaries
- Rounded average rupee values in Reports so dashboard cards and analysis rows show clean currency figures instead of raw decimal precision
- Updated deployment and operations docs to match the current runtime: shadow-table primary sync, 30-second fallback checks, manual `Sync Now` push behavior, and legacy blob backup as a manual/optional path

## 2026-04-15

### Realtime multi-device sync — Supabase Realtime heartbeat

- Added `garage_sync_heartbeat` table to `supabase/schema.sql` — one row per device, updated on every successful push; requires one-time SQL run to activate
- Added `startRealtimeSync(client)` in `sync.js` — subscribes to `garage_sync_heartbeat` via Supabase Realtime; when another device pushes, all other devices receive the event within ~1 second and automatically pull
- After every successful shadow table push, the device upserts its row in `garage_sync_heartbeat` to notify other devices
- Added `checkAndPullIfStale(client)` — fallback that queries heartbeat for other devices' push timestamps and pulls if newer than local `lastPulledAt`; catches events missed when realtime drops (phone sleep, network blip)
- Background loop reduced from 5 minutes to 30 seconds; now runs `checkAndPullIfStale` on each tick when no pending changes exist
- Realtime subscription starts on sign-in and is removed on sign-out via `bindAuthListener`
- Sync button (`Syncing...`) no longer stays stuck after push/pull completes — added `updateQuickSyncButton()` to the `finally` blocks of both `pushGS` and `pullGS`
- `local-newer` pull result now auto-queues a push even when `pendingSync` is false, so local changes are never silently left unsynced after page load

### Sync Diagnostics panel cleanup

- Removed 6 rows: Last Remote Change Seen, Last Merge (when empty), Last Sync Error (when empty), Table Sync Error (as separate row), 2-Day Validation, Last Cloud Upload
- Merged `Table Sync (Primary)` and `Table Sync Error` into a single `Table Sync` row — shows success summary or failure inline with timestamp
- Error rows for Last Sync Error and Last Merge now only appear when there is an actual value
- `Weekly Blob Backup` no longer appends schedule note when a backup has already been written

### Sync error message normalization

- `TypeError: Failed to fetch` and similar network errors now display as "Network error — check connection and try again." in the diagnostics panel
- Translation is applied at render time so old stored error strings in localStorage are also normalized without requiring a new sync
- Error timestamp (`shadowLastMirrorAt`) is now always set to the failure time, not preserved from the last success

## 2026-04-15

### Reports crash fix — REPORT_TIMEZONE temporal dead zone

- Fixed a critical crash in `reports.js` that caused the entire Reports module to silently fail to load, showing no data on any report screen
- Root cause: `const REPORT_TIMEZONE` was declared on line 13, after the `reportFilters` initializer block (lines 5–11) which calls `reportTodayIST()` which reads `REPORT_TIMEZONE` — JavaScript `const` is not hoisted and is in the temporal dead zone until execution reaches the declaration, causing a `ReferenceError` that crashed the module at load time
- Fix: moved `const REPORT_TIMEZONE = 'Asia/Kolkata'` to above the `reportFilters` declaration so it is always initialized before use
- This was a regression introduced in a previous session; no other reports logic was changed

### Auto-sync interval — 5 minutes, background push only

- Changed background sync loop from 60-second interval to 5-minute interval (300,000 ms) to reduce unnecessary API calls and avoid hitting Supabase rate limits
- Background loop now only pushes when there are pending local changes (`pendingSync` is true); it no longer pulls in the background
- Manual `Sync Now` button still performs a full sync (push + pull) as before
- This separates routine background saves from deliberate full-sync operations initiated by staff

### Storage migration — shadow tables now primary

- Shadow tables (`garage_customers`, `garage_jobs`, etc.) are now the live source of truth for all cloud sync
- `pullGS()` now reads from shadow tables first; falls back to `garage_state` blob only if shadow tables are empty or unreachable
- `pushGS()` now writes directly to shadow tables on every sync; blob write removed from regular sync path
- `garage_state` blob is now a weekly backup — written automatically every Sunday between 5:50–7:59 PM IST when app is open and by Apps Script Sunday trigger as a reliable fallback
- Added `SHADOW_PULL_TABLES` constant — mirrors `SHADOW_SYNC_TABLES` but excludes derived `jobPayments` table
- Added `pullFromShadowTables()` — reads all 14 shadow tables, reconstructs full payload from `record_data` fields
- Added `writeGarageStateBlob()` — writes current payload to `garage_state`; called Sunday or via `forceBlobBackup` option
- Added `shouldWriteWeeklyBlob()` — detects Sunday 5:50–7:59 PM IST window and checks 7-day gap since last blob write
- Added `lastBlobBackupAt` to `DEFAULT_SYNC_META` in `data.js`
- Sync diagnostics updated: "Table Sync (Primary)", "Table Sync Error", and new "Weekly Blob Backup" rows

### Google Drive backup — reads shadow tables

- `JalaSaiDriveBackup.gs` fully rewritten
- `backupShadowTablesToDrive()` — daily Drive backup reads from all 14 shadow tables; saves timestamped JSON; keeps last 30 days
- `writeSundayBlobFromTables()` — reads shadow tables, writes reconstructed payload to `garage_state`; runs every Sunday 6 PM IST via Apps Script trigger
- `setupDailyBackupTrigger()` — daily Drive backup at 10 PM IST
- `setupSundayBlobTrigger()` — Sunday 6 PM IST blob trigger
- Legacy `backupGarageStateToDrive()` kept for reference; no longer scheduled

## 2026-04-12

### Sync-safe deletes
- Fixed customer, stock item, and mechanic deletes to use tombstones instead of hard local removal
- Updated affected views to hide tombstoned records so deleted entries do not reappear in normal workflow
- Aligned these modules with the existing sync merge model already used by jobs and expenses

### Reports mobile readability
- Split dense report analysis into smaller cards for easier phone usage
- Separated `Top Parts Used`, `Customer Retention`, and `Reminder Return Proxy` into different report cards
- Reworked service profitability into stacked analysis cards instead of one wide table
- Reworked the revenue heatmap into day-wise card groups that stay inside the app on mobile

### Photo capture and mechanic display
- Added explicit `Open Camera` and `Upload Photos` buttons to all photo attach flows:
  - job receive photo
  - quick invoice photo
  - final invoice photo
  - stock part photo
  - expense photo
- Fixed mechanic names not showing after load/sync by normalizing mechanics before dependent render paths reuse them
- Added mechanic name fallback so older jobs still show stored mechanic text even when linked IDs are incomplete

## 2026-04-11

### Verified sync state
- Confirmed healthy live sync diagnostics:
  - `Pending Local Changes: No`
  - `Table Dataset: 15 tables already up to date`
  - `Last Validation: OK · 15 tables matched the current payload`
  - `Table Mirror Error: None`

### Photos and stock identification
- Made phone photo picking safer by persisting draft state before camera/file picker opens
- Added stock photo attach / replace / remove
- Added stock photo thumbnail display in stock and part-pick flows
- Kept stock photos out of stock QR print output

### Part pricing and data entry
- Added saved-price plus manual-price flow when adding stock parts into jobs
- Added the same saved-price plus manual-price flow in scan-to-use part flow
- Manual entered part price now becomes the new saved selling price every time
- Fixed select-on-focus inputs so users can still place the cursor and edit normally

### Visibility and defaults
- Job cards now show created date and time
- Linked income matching now uses exact invoice reference matching
- Default invoice list sort is `Invoice No.` high to low
- Default customer list sort is `Due: High to Low`

## 2026-04-10

### Navigation and access
- Added shared back navigation across nested views:
  - page-level `Back` beside `Cloud`
  - modal-level back in detail, customer, and invoice flows
- Global `Back` is hidden on the Jobs home screen
- Added password gate for `Admin -> Reports`
- Reports password is now `1122`

### Jobs and finance
- Made `Today's Revenue` clickable from Jobs dashboard
- Added same-day finance breakdown popup for:
  - saved job payments
  - manual income
  - expenses
  - net total
- Added `Open Job` from revenue breakdown entries
- Reordered customer sort options to:
  - `Sort: Name`
  - `Due: Low to High`
  - `Due: High to Low`
  - `Advance: High to Low`
  - `Advance: Low to High`
- Added mechanic selection to `Regular` manual income
- Included regular manual income in mechanic revenue/work totals
- Added `+ Expense` beside `+ Income` on Jobs home actions

### Cloud migration safety
- Kept the old `garage_state` JSON sync as the live source of truth
- Added shadow Supabase tables for customers, mechanics, jobs, payments, stock, expenses, income, logs, imports, and reviews
- New table mirror writes only changed rows and soft-deletes removed rows
- Added a 2-day validation window for table mirror verification after sync
- Added sync diagnostics for table mirror state, validation status, and mirror errors

### Code cleanup
- Removed dead Python code found by `ruff` and `vulture`
- Removed dead JavaScript helpers and orphaned stock-review code paths after repo-wide usage cleanup

## 2026-04-06

### AI operations and documentation
- Added `AI_OPERATING_MODEL.md`
- Documented the human-run, AI-assisted business rule
- Documented lowest-cost rollout order for AI use:
  - note cleanup
  - reminder drafting
  - closing summary drafting
  - supplier part normalization
  - service-type profit grouping
  - stock prediction later
- Linked AI operating guidance from main documentation
- Added live prompt-copy AI assist inside the app for:
  - Job Card work / notes cleanup
  - Quick Invoice work / notes cleanup
  - invoice completion note cleanup
  - customer feedback and service reminder drafting
  - closing summary drafting
  - catalog row normalization prompting
- Added paste-back apply flow for AI note cleanup so cleaned results can be applied directly into the original field

## 2026-04-03

### Reporting and filters
- Added `Closing Summary` sharing from Reports
- Closing summary now includes:
  - bikes added
  - invoices
  - done jobs
  - revenue
  - cash
  - UPI
  - expenses
  - net
- Added `Yesterday` filter to Reports
- Added `Yesterday` filter to Expenses

### Fast entry and billing
- Added chip-based mechanic selection across fast-entry flows
- Added chip-based payment method selection using `Cash` and `UPI`
- Added chip-based income type selection using `Regular` and `Other`
- Added service shortcut chips to Quick Invoice:
  - `Puncture`
  - `Brake`
  - `Oil`
  - `Wiring`
  - `Service`
- Added the same shortcut chips to manual income
- Added recent customer chips in Quick Invoice and Job Card
- Added recent bike chips in Quick Invoice and Job Card
- Added `Save & Next` in Job Card
- Added `Save as Job Card` inside Quick Invoice
- Added duplicate invoice number warning before save
- Added invoice number auto-suggestion from latest saved invoice number
- Removed `Collected By` from active invoice/job entry flows
- Added select-all-on-focus behavior for normal editable fields

### Billing and invoice behavior
- Added invoice date support in Quick Invoice
- Added invoice date editing in the full invoice flow
- Added discount support in Quick Invoice
- Added discount support in Job Card staging
- Added discount support in `Collect Payment`
- Expanded `Collect Payment` to allow clearing by discount, payment, or both
- Kept full invoice edit inside the main invoice form
- Removed old unreachable invoice edit modal code

### Jobs and dashboard
- Added optional invoice number on Job Card
- Added notes/remarks display on job dashboard cards
- Added one-tap `Invoice` shortcut on pending job cards

### Income and linking
- Exposed `+ Income` to normal users from Jobs dashboard
- Added optional invoice number to manual income
- Added linked-income visibility in invoice list
- Improved invoice reference matching for values like:
  - `0000`
  - `INV-0000`
  - `Invoice 0000`

### Cleanup and docs
- Removed stale helper code from older invoice/customer flow
- Removed temporary thumbnail files and stray `.DS_Store`
- Updated:
  - `OPERATIONS.md`
  - `PROJECT_REFERENCE.md`
  - `DEPLOYMENT.md`
  - `catalog/README.md`
- Added:
  - `PROJECT_HISTORY.md`
  - `CHANGELOG.md`

### Mobile polish
- Increased mobile touch target sizes
- Improved modal padding and stacking on small screens
- Improved chip wrapping on mobile
- Improved job/customer/mechanic card layout on phone
- Improved mobile table scrolling
- Improved toast placement on mobile

## 2026-04-02

### Navigation and visibility
- Restored `Invoices` near the front of navigation
- Moved `Print QR` under `Admin`
- Simplified report visibility for non-admin users
- Hid finance summaries from normal users where needed

### Quick Invoice and invoice workflow
- Added `Quick Invoice`
- Added sticky drafts for job and invoice forms
- Stopped accidental modal-close data loss on outside click
- Changed invoice edit to use the same main invoice form as invoice creation
- Added photo support to Quick Invoice
- Added full-screen image viewer for job/invoice photos
- Removed invoice photo from customer print/PDF
- Removed buying rate from printed invoice
- Removed manufacturer / supplier part no. line from printed invoice

### Customer and reminders
- Fixed customer card balance display to show real current balance
- Made invoice customer name open customer history popup in-place
- Added follow-up reminders:
  - feedback after 7 days
  - service reminder after 75 days
- Changed follow-up logic to ignore old imported history and start from new invoices only

### Income and reports
- Moved manual income into daily workflow from Jobs dashboard
- Included manual income in Jobs revenue and reports
- Simplified reports by removing extra trend display

### QR and printing
- Added multi-label support for same part in Print QR
- Improved Print QR layout so label count is visible and easier to use

## 2026-04-01

### Stock and part master
- Removed demo trial stock and cleanup-migrated saved data
- Simplified Add Part form
- Moved invoice-only part metadata under `More details`
- Added fitment models, manufacturer, supplier part no., and price history support
- Added photo reference support in jobs and invoices

### Supplier / catalog import direction
- Removed old supplier intake mediator UI from stock page
- Switched to `Import Agent JSON` for supplier invoice intake
- Added catalog CSV one-by-one review import
- Added pause/resume for catalog import review
- Added duplicate warning and update-vs-create choice during catalog import
- Added edit-before-confirm inside catalog review
- Added instant confirm to stock so imported parts can be searched immediately

### Search improvements
- Expanded stock search to include:
  - SKU
  - part name
  - supplier part no.
  - fitment models
  - typo / nearby spelling matches

### Catalog work
- Reconciled PDF, pasted text, and workbook catalog sources
- Built cleaned catalog outputs
- Built seed catalog outputs with fitment interpretation
- Produced final staged catalog files in `catalog/`

## Earlier foundation

### Base system
- Created static PWA garage management app
- Added jobs, invoices, stock, customers, expenses, reports, logs, and mechanics
- Added Supabase shared sync and login
- Added admin email-based access control
- Added stock receive, scanner-based part lookup, and QR label printing
