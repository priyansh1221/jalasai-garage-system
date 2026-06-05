# Performance, Sync UI, And Startup Incident - 2026-06-04

## Summary

On 2026-06-04, the app was reviewed and patched for slow quick-invoice typing, slow refresh/startup, tab-switching responsiveness, realtime sync UI cleanup, and local-first startup behavior. On 2026-06-05, follow-up fixes restored Quick Invoice manual entry behavior after the first recommendation-speed fix still left the browser's native datalist attached to the customer search field, removed the remaining New Job/Quick Invoice modal-open delay, and moved legacy data cleanup off the refresh critical path.

The issue was most visible in Brave while writing a Quick Invoice customer name/search value. The form felt stuck because the customer recommendation layer was doing too much browser-side work, and the native datalist could still interfere with simple manual entry.

## Impact

- Quick Invoice customer search could lag badly with a large customer database.
- Opening New Job or Quick Invoice could take 7-10 seconds because recommendation and shortcut work ran before the modal opened.
- Startup/refresh could feel slower than necessary because local data rendered, cloud init could force a second page render, and legacy customer/job cleanup ran inside `loadAll()` every time.
- The new UI showed an always-visible `Sync Now` button even though realtime/background sync is now the normal path.
- Tab switching needed verification after the recent appState/render-cache changes.

## Root Causes

### Quick Invoice Recommendations

The quick invoice customer search input used a native `<datalist>` fed by `refreshQuickInvoiceCustomerSuggestions()`.

Before the fix, opening Quick Invoice populated the datalist with every customer:

- thousands of native `<option>` nodes could be attached to the input
- Brave became slow while typing into the customer search field
- customer recommendation work started before the user had typed enough useful characters

The quick invoice draft also saved synchronously on every `input` event. That was not the largest measured cost, but it was unnecessary work during typing.

### New Job And Quick Invoice Modal Open

The fast-entry forms did too much setup before calling `openM(...)`.

Before the follow-up fix, New Job and Quick Invoice could block the visible modal while the app:

- rebuilt recent customer chips
- rebuilt recent bike chips
- rendered service shortcut chips
- sorted/scanned jobs and customers to infer recent records
- scanned completed jobs to suggest the next invoice number
- populated the New Job customer datalist

On a large live dataset this made the click feel dead for several seconds even though the final form was usable after the work completed.

### Startup And Refresh

Startup rendered the current page from localStorage, then `initGSSync()` could force another render after cloud initialization even when local data had not changed.

The startup overlay also appeared while local business data was already available, making a ready local app feel blocked by cloud checks.

The larger refresh regression was the legacy data-maintenance path inside `loadAll()`. Each refresh ran mechanic recovery, demo/sample purges, temporary verification-job cleanup, and `tidyCustomerRecords()`. On large datasets, `tidyCustomerRecords()` repeatedly crossed customers with jobs while repairing customer links and vehicles, so refresh repeated the same multi-second repair scan even when the saved data had not changed.

### Sync Button UI

Realtime sync and background auto-push are the normal daily path. A permanent top-level `Sync Now` button made the app feel more manual than it is.

Manual sync is still needed as a fallback when:

- a device is offline
- cloud sign-in is missing
- a push fails
- `syncMeta.pendingSync` or `syncMeta.lastSyncError` needs attention

## Fixes Applied

### 1. Quick Invoice Recommendation Threshold

Files:

- `js/jobs.js`
- `NEW UI/js/jobs.js`
- `deploy/js/jobs.js`
- `deploy/newui/js/jobs.js`

Changes:

- added `QUICK_INVOICE_SUGGEST_MIN_CHARS = 3`
- quick invoice customer suggestions now appear only after at least 3 letters/digits
- empty and 1-2 character input clears recommendations instead of searching
- number input is normalized to digits for phone/reg-style matching

### 2. Quick Invoice Manual Entry Follow-Up

Files:

- `index.html`
- `NEW UI/index.html`
- `deploy/index.html`
- `deploy/newui/index.html`
- `js/jobs.js`
- `NEW UI/js/jobs.js`
- `deploy/js/jobs.js`
- `deploy/newui/js/jobs.js`

Changes:

- removed the `list="qi-customer-suggestions"` attachment from the Quick Invoice customer search input in both UIs
- kept recommendations in the custom `#qi-cust-results` buttons only
- suggestions still appear only after at least 3 letters/digits
- typing in the search field now pre-fills the manual Customer Name and Phone fields, so staff can write a new customer without choosing a recommendation
- the old `<datalist>` element is left inert for compatibility, but no longer drives typing behavior

### 3. Bounded Quick Invoice Suggestions

Files:

- `js/jobs.js`
- `NEW UI/js/jobs.js`
- `deploy/js/jobs.js`
- `deploy/newui/js/jobs.js`

Changes:

- added `QUICK_INVOICE_DATALIST_LIMIT = 80` during the first pass
- Quick Invoice no longer loads the whole customer database into suggestion UI on modal open
- `matchingCustomers(query, { limit })` now supports a bounded fast path for quick-entry UI

### 4. Debounced Quick Invoice Draft Saves

Files:

- `js/jobs.js`
- `NEW UI/js/jobs.js`
- `deploy/js/jobs.js`
- `deploy/newui/js/jobs.js`

Changes:

- added `scheduleQuickInvoiceDraftSave()`
- quick invoice `input` events now debounce draft persistence
- `change` events still persist immediately
- clearing the draft cancels any pending draft timer

### 5. Realtime Sync UI Cleanup

Files:

- `js/sync.js`
- `NEW UI/js/sync.js`
- `deploy/js/sync.js`
- `deploy/newui/js/sync.js`
- `NEW UI/index.html`
- `deploy/newui/index.html`

Changes:

- removed the always-visible New UI header `Sync Now` action
- removed the remaining visible `Sync Now` button from both old and new UI HTML
- realtime/background sync stays the normal daily path
- healthy realtime/background sync stays visually quiet

### 6. Local-First Startup And Refresh

Files:

- `js/data.js`
- `NEW UI/js/data.js`
- `deploy/js/data.js`
- `deploy/newui/js/data.js`
- `js/sync.js`
- `NEW UI/js/sync.js`
- `deploy/js/sync.js`
- `deploy/newui/js/sync.js`
- `index.html`
- `deploy/index.html`
- `NEW UI/index.html`
- `deploy/newui/index.html`

Changes:

- startup overlay is skipped when local business data already exists
- cloud checks continue in the background after local render
- `finishInitialDataLoadAndRender(...)` no longer forces a duplicate heavy render when the current page is already rendered and fresh
- old UI startup now renders the remembered valid page instead of always rendering Jobs
- service worker registration is deferred with `requestIdleCallback` or a short timeout

### 7. Service Worker Cache Refresh

Files:

- `sw.js`
- `deploy/sw.js`
- `index.html`
- `NEW UI/index.html`
- `deploy/index.html`
- `deploy/newui/index.html`

Changes:

- bumped service worker cache through `jalasai-v48`
- bumped registration URLs through `sw.js?v=48`
- ensures Brave/PWA clients update from the old cached Quick Invoice/New Job runtime

### 8. Fast-Entry Modal Open Follow-Up

Files:

- `js/jobs.js`
- `NEW UI/js/jobs.js`
- `deploy/js/jobs.js`
- `deploy/newui/js/jobs.js`
- `js/data.js`
- `NEW UI/js/data.js`
- `deploy/js/data.js`
- `deploy/newui/js/data.js`

Changes:

- New Job and Quick Invoice now call `openM(...)` before nonessential shortcut/recommendation hydration
- recent customer chips, recent bike chips, service shortcut chips, and the New Job customer datalist hydrate after the first paint
- the New Job native customer-name datalist is left inert; New Job customer search now uses the capped custom recommendation list after 3 letters/digits
- customer suggestion settings are now explicit: 3-character threshold, 12-result cap, and 90 ms debounce
- customer suggestions use a cached customer-only search index instead of scanning jobs during typing
- customer result hint rendering no longer scans related jobs for every visible suggestion
- recent customer/bike shortcut lists are cached against the app data version
- the suggested next invoice number is cached against the app data version, job count, and invoice counter
- Quick Invoice focus is restored after the modal is visible so typing starts in the correct field without waiting for shortcuts
- refresh/startup now paints the app shell first and opens local saved data on the next browser tick
- cached devices finish the startup overlay before cloud session/realtime checks complete
- cloud gap-fill runs in the background after realtime attaches, so refresh behaves local-first and still catches missed changes

### 9. Refresh Critical Path Follow-Up

Files:

- `js/data.js`
- `NEW UI/js/data.js`
- `deploy/js/data.js`
- `deploy/newui/js/data.js`
- `js/sync.js`
- `NEW UI/js/sync.js`
- `deploy/js/sync.js`
- `deploy/newui/js/sync.js`
- `sw.js`
- `deploy/sw.js`
- `index.html`
- `deploy/index.html`
- `NEW UI/index.html`
- `deploy/newui/index.html`

Changes:

- removed mechanic recovery, demo/sample purges, temporary verification-job purge, and customer ownership tidy from the blocking `loadAll()` path
- added `DATA_BOOT_CLEANUP_VERSION = '2026-06-05-v49'` and `js_boot_cleanup_version` so old repair work runs as versioned maintenance instead of every refresh
- scheduled data maintenance after the app has had time to become usable, using idle time when available
- cloud pulls now apply/render first and queue the same maintenance path instead of running customer/job repair scans before the UI updates
- startup keeps showing saved local data first while realtime/cloud checks continue in the background
- service worker cache bumped to `jalasai-v49` and registration URLs bumped to `sw.js?v=49`

### 10. Both UI Copies Updated

The changes were applied to:

- root old UI files
- `NEW UI/`
- `deploy/`
- `deploy/newui/`

No schema, auth, or layout-level redesign changes were made.

## 2026-06-05 v49 Verification Note

After the v49 refresh-critical-path patch, local browser testing was stopped at operator request. Completed checks were limited to JavaScript parse checks and source/deploy mirror parity. Live-site verification still requires a successful Cloudflare deploy; the current local environment previously returned Cloudflare authentication error code `10000`.

## Brave Verification

Local test target:

- `http://127.0.0.1:8765/deploy/newui/index.html`
- Brave executable: `/Applications/Brave Browser.app/Contents/MacOS/Brave Browser`

Measured results:

- Quick Invoice customer search with 5000 seeded customers:
  - before: about `826ms` to type `Customer 4123`
  - after: about `39ms`
- Quick Invoice `Customer Name` typing:
  - about `31ms`
  - full typed value preserved
- New UI startup with 1600 jobs and 1000 customers:
  - Jobs visible in about `569ms`
  - startup overlay not shown
  - top-level Sync Now not present
- Old UI startup with remembered Stock page and 900 stock rows:
  - Stock visible in about `383ms`
  - startup overlay not shown
- Main new UI tab switching with 1800 jobs, 1200 stock rows, and 1200 customers:
  - Home about `76ms`
  - Jobs about `222ms` cold
  - Invoices about `160ms`
  - Stock about `115ms`
  - Customers about `67ms`
  - Admin about `101ms`
- Admin subtabs with reports access pre-set:
  - Reports about `223ms`
  - other admin tabs about `49-89ms`

No page errors were observed during these Brave checks.

## Follow-Up Brave Verification - 2026-06-05

Local test target:

- `http://127.0.0.1:8765/deploy/newui/index.html`
- Brave executable: `/Applications/Brave Browser.app/Contents/MacOS/Brave Browser`

Measured results after the manual-entry follow-up:

- Quick Invoice customer-name typing with 1200 seeded customers:
  - typed value preserved as `Customer 0412`
  - Customer Name field prefilled as `Customer 0412`
  - exact custom result shown: `Customer 0412 · 9000000412`
  - typing took about `89ms`
  - `#qi-cust-search` no longer had a native `list` attribute
- Quick Invoice phone-number typing with 1200 seeded customers:
  - typed value preserved as `9000000412`
  - Phone field prefilled as `9000000412`
  - exact custom result shown: `Customer 0412 · 9000000412`
  - typing took about `67ms`
  - no page errors were observed
- New UI tab switching with 900 seeded jobs, 600 stock rows, and 600 customers:
  - Home about `62ms`
  - Jobs about `104ms`
  - Invoices about `100ms`
  - Stock about `95ms`
  - Customers about `100ms`
  - Admin about `101ms`
  - back to Jobs about `100ms`
  - no page errors were observed
- Served HTML and service worker were verified from the local server with `sw.js?v=44` / `jalasai-v44`.

Follow-up cache package for the modal-open fix:

- served HTML now registers `sw.js?v=48`
- root service worker cache is now `jalasai-v48`

## Operational Notes

- Realtime sync is the normal path, but manual sync should not be fully deleted because it is still a recovery path for pending/failed/offline states.
- Avoid native datalists on high-traffic entry fields backed by large datasets. For large operational datasets, suggestions should be query-scoped, capped, and rendered in controlled custom UI.
- Keep fast-entry modal opening separate from recommendation hydration; the empty form must paint before derived shortcuts scan the dataset.
- Avoid forced startup re-renders after local data is already visible.
- Keep both root and New UI copies mirrored when changing shared runtime files.
