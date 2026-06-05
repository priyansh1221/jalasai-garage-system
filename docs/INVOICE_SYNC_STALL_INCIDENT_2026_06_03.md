# Invoice Sync Stall Incident - 2026-06-03

## Summary

On 2026-06-03, the live invoice list showed invoices only up to `10523`, while Supabase audit logs and payments showed later invoices up to `10562`.

This was not a new cloud data-loss event. Authenticated Supabase checks confirmed that `public.garage_jobs` contained live `done` invoice rows from `10525` through `10562`, with `deleted_at = null`.

## Impact

- The website invoice page did not show the newest cloud invoices on at least one device.
- Staff could see evidence of later invoices in logs, creating a mismatch between operational history and the invoice screen.
- Sync Now did not visibly fix the device because local metadata could make the stale local cache look newer than cloud.

## Confirmed Cloud State

Authenticated reads of `public.garage_jobs` confirmed:

- `10525` through `10562` existed as live invoice rows.
- `job_status = 'done'`
- `deleted_at = null`
- The invoice list problem was therefore client-side sync/display state, not missing rows in Supabase.

Rows `10520` through `10524` were not present as active `garage_jobs.invoice_no` values in the checked range; `10525` was the first confirmed active invoice after that local stale tail.

## Root Cause

The app compared local and cloud timestamps before applying a cloud pull:

```js
if (!options.force && localStamp && remoteStamp && localStamp > remoteStamp) {
  updateGSStatus('Local data is newer than cloud. A push is ready.');
  return 'local-newer';
}
```

After failed sync attempts or local saves, a browser's local `syncMeta.updatedAt` could become newer than the newest cloud row timestamp, even though the local `jobs` cache was missing later invoices.

That made the app keep stale local invoice data instead of applying the cloud pull.

## Why It Looked Like It Stopped At 10523

The invoice screen renders from the local `jobs` array:

- live job
- `status === 'done'`
- invoice sorted/displayed from `invoiceNo`

The stale local `jobs` cache still contained invoices only up to the older tail. Cloud had later rows, but the timestamp guard prevented the browser from accepting them during normal pull.

## Fixes Applied

### 1. Cloud Newer Invoice Override

Files:

- `js/sync.js`
- `deploy/js/sync.js`

Added `maxInvoiceNumberFromJobs()` and changed pull acceptance logic:

- If cloud has a higher invoice number than local, accept the cloud pull even if local metadata timestamp appears newer.
- This prevents a stale device from refusing real newer cloud invoice rows.

### 2. Pull Priority And Partial Pull Resilience

Files:

- `js/sync.js`
- `deploy/js/sync.js`

Changed table pull behavior:

- Pull `jobs` first.
- Treat `jobs` as required.
- If a non-critical table fails, keep that table's local data instead of blocking the whole invoice refresh.

### 3. Service Worker Cache Bumps

Files:

- `sw.js`
- `deploy/sw.js`
- `index.html`
- `deploy/index.html`

Cache versions were bumped so devices install the newest app shell.

### 4. Long List Pagination

Files:

- `js/utils.js`
- `js/jobs.js`
- `js/stock.js`
- `js/customers.js`
- `js/expenses.js`
- `js/reports.js`
- `index.html`
- matching `deploy/` copies

Long views now render 100 rows/cards per page:

- Jobs
- Invoices
- Stock
- Customers
- Expenses
- Income
- Activity logs

Search and filters run against the full dataset first. Pagination is applied after filtering and sorting, so searching for an older invoice/customer/part still works even when it is not on page 1.

## Prevention

- Do not rely only on local timestamp comparisons for sync conflict decisions.
- For critical business lists, compare domain-specific freshness signals such as highest invoice number.
- Keep long views paginated so rendering does not load thousands of records/photos at once.
- Always bump the service worker cache when changing app JavaScript.

## Verification Checklist

After deploy:

1. Open the site in a fresh/private browser.
2. Confirm `sw.js` shows the newest cache version.
3. Sign in and press Sync Now.
4. Confirm invoice list shows invoice `10562`.
5. Search invoice `10562`.
6. Search an older invoice not on page 1.
7. Confirm stock/customer/log searches return matching records across all pages.
