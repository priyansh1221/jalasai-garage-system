# New UI Merge And Deploy Readiness - 2026-06-03

## Summary

The new interface is packaged inside [deploy/newui](/Users/priyansh/Projects/JalaSai/deploy/newui) while the existing interface remains at the deploy root.

Both interfaces use the same backend, same Supabase project, same localStorage business cache, and same cloud sync runtime. They are not separate systems.

## Entry Points

- Old UI: [deploy/index.html](/Users/priyansh/Projects/JalaSai/deploy/index.html)
- New UI: [deploy/newui/index.html](/Users/priyansh/Projects/JalaSai/deploy/newui/index.html)
- Old UI button to new UI: `New UI`
- New UI button back to old UI: `Old UI`

The old/new buttons call `switchUiMode(...)`, which writes a local backup before navigating.

## Cache And Performance

- Root service worker cache is `jalasai-v43`.
- New UI now registers the root service worker through `../sw.js?v=43`.
- Root UI and New UI now use the same updated New UI favicon and app icons.
- App-shell files are served cache-first with background refresh, so cached static files do not wait on network during startup.
- Startup loading fallback is 12 seconds instead of 120 seconds.
- The root service worker pre-caches both root UI files and `newui/` runtime files.
- New UI unregisters any legacy nested `/newui/sw.js` service worker if a browser already installed it.
- UI switching warms target files with `warmUiMode(...)`.
- Same-UI tab switching reuses already-rendered pages until data changes, reducing repeated heavy list rendering.
- Mobile New UI drawer closes immediately after a menu destination is tapped, so navigation feels direct instead of leaving the content hidden behind the drawer.
- Multi-device focus refresh now checks the heartbeat first instead of pulling cloud tables on every visibility change.
- Last-page persistence is debounced and page back-history is capped to reduce repeated navigation jank.
- Emergency Supabase IO saver is enabled: normal saves upload only rows changed around the pending local edit, automatic pulls are throttled, and background heartbeat checks run every 5 minutes instead of every 15 seconds.
- Startup is local-first when business data already exists on the device: the blur appears briefly, renders the local cache, and cloud refresh continues in the background. Empty devices keep the blur while the first cloud pull hydrates data.

The nested [deploy/newui/sw.js](/Users/priyansh/Projects/JalaSai/deploy/newui/sw.js) remains only as a legacy cleanup worker. If an old browser still checks that worker, it clears old `jalasai-new-ui-*` caches, unregisters itself, and lets the root worker take over.

## Data And Sync

- Both UIs share the same local data keys.
- Local edits save immediately and queue normal background cloud sync.
- Cloud pushes are batched briefly so several edits become one upload instead of many separate database writes.
- Automatic cross-device refresh pulls only operational tables; manual `Sync Now` can still perform an intentional full refresh.
- Startup shows a data-load overlay until the first usable dataset is rendered.
- Background cloud sync no longer blocks daily work with a full-screen blur.
- If cloud has newer invoice rows, pull logic still accepts remote invoice data even when local metadata looks newer.
- The earlier invoice sync fix for invoices after `10523` remains present in both UIs:
  - `maxInvoiceNumberFromJobs(...)`
  - `hasRemoteInvoicesMissingLocally(...)`
  - jobs-first shadow-table pull behavior

## Data Cleanup Guards

The following are excluded from active workshop jobs:

- imported customer-master rows accidentally present in jobs
- Khatabook/customer import rows accidentally present in jobs
- stale open jobs older than the active operational window
- the temporary verification job created during local testing:
  - `J009-FEFV`
  - `ZZ UI TEST 20260603`
  - phone `9999906030`
  - `Temporary record for new UI verification`

The verification job guard returns:

```json
{"temporary":true,"nonWorkshop":true,"live":false,"active":false}
```

## Date Guards

Future business dates are blocked for:

- Quick Invoice invoice date
- Job completion invoice date
- Expense date
- Income date

Expected delivery dates remain allowed to be future dates.

## New UI Home Metrics

New UI home metrics now use operational data:

- customer count is based on customers with real workshop job activity
- pending dues are computed from the shared customer/job summary index
- imported customer-master-only rows do not inflate home cards

## Deploy Package Validation

Final local checks completed before deploy:

- all JavaScript files under `deploy/` passed `node --check`
- root/source files match their `deploy/` mirrors
- service worker asset list has 49 entries and no missing files
- no `.DS_Store` files remain under `deploy/`
- local deploy preview returned `200 OK` for:
  - `/`
  - `/newui/`

## Manual Post-Deploy Checks

After deploying [deploy](/Users/priyansh/Projects/JalaSai/deploy):

1. Hard refresh once so `jalasai-v43` activates.
2. Sign in to Supabase.
3. Wait for the short initial load only; background sync should not block work.
4. Check old UI `New UI` button.
5. Check new UI `Old UI` button.
6. Switch tabs inside each UI; already-rendered tabs should feel immediate.
7. Confirm invoices after `10523` are visible.
8. Confirm `J009-FEFV` / `ZZ UI TEST 20260603` is not shown in active jobs.
9. Try a future invoice, income, and expense date; each should be rejected.
