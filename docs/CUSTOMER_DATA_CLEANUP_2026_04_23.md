# Customer Data Cleanup — 2026-04-23

## 2026-05-01 Addendum

The first cleanup removed non-customer ghost rows from `garage_customers`. Later live validation showed a separate but related problem: some Khatabook opening-balance jobs still carried stale `custId` values or shared duplicate customer IDs after the shadow-table split.

Additional runtime repairs were added:

- Khatabook/opening-balance jobs now require strong phone/name evidence before attaching to an existing customer.
- If no safe match exists, the imported balance is treated as its own unique customer/balance record.
- Duplicate live customer IDs are repaired.
- Exact duplicate customers are merged only when both name and phone match.
- Customer vehicle chips rebuild from jobs still owned by that customer.
- Customer, reminder, and invoice render paths now use one-pass summary/index builds to avoid repeated full-list scans.
- The Customers tab renders the first 240 cards and loads more on demand.
- The service worker cache was later bumped to `jalasai-v13`.

See [PERFORMANCE_AND_DATA_CLEANUP_2026_05_01.md](/Users/priyansh/Projects/JalaSai/docs/PERFORMANCE_AND_DATA_CLEANUP_2026_05_01.md) for the detailed follow-up.

## TL;DR

`garage_customers` had grown to **10,649 rows**, of which only **2,812 were real
customers**. The other **6,950 rows were ghosts** — payments, jobs, stock items,
audit entries, income, purchase, supplier, import, expense, and a single legacy
`money` row that had been written into the customer table by earlier deploys.
Old deploys had also been re-mirroring those ghosts on every sync via a
feedback loop, so the count kept climbing.

The fix is a single write-side filter in `js/sync.js` that rejects any record
whose ID prefix identifies it as a non-customer type. The existing orphan-delete
pass in `syncShadowTables` then tombstones the ghosts automatically on the next
sync, without any manual DB surgery.

No schema changes. No migration. Deploy the folder and the next sync cleans up.

---

## 1. The problem

### Symptom

- `garage_customers` in Supabase had 10,649 live rows (`deleted_at IS NULL`).
- Most had empty or gibberish `name` fields. Many had IDs that clearly belonged
  to other record types (`mm-…`, `s17…`, `KBJ…`, `log…`, `inc…`, `pe1…`,
  `sir1…`, `imp1…`, `e17…`, `money`).
- Corresponding orphan/ghost entries were appearing in `garage_jobs` and
  `garage_job_payments` as well.
- The client was pulling all of this down on every sync, inflating the local
  state, which in turn was getting pushed back up.

### Root cause (feedback loop)

1. **Historical pollution.** An older version of the app funneled several
   record types through the `customers` payload key — payments, jobs, stock
   items, audit log entries, income/expense/purchase entries, etc. Each of
   those writes landed in `garage_customers` instead of its own shadow table.
2. **Unfiltered pull.** `pullFromShadowTables` in `js/sync.js` reads every row
   from `garage_customers` where `deleted_at IS NULL` and merges it into local
   state. There is no shape filter on the pull side.
3. **Blind merge.** `mergedSyncPayload` merges customers by `id` with a
   fall-through path — so ghost rows with non-customer IDs survive the merge.
4. **Polluted push.** On the next push, `buildCustomerShadowRows` iterated the
   (now polluted) local `customers` list and wrote shadow rows back for the
   ghosts. That regenerated their `source_hash` and `mirrored_at`, so the
   existing orphan-delete pass in `syncShadowTables` treated them as live
   records — nothing to delete.

The loop closed on itself. Every sync round-tripped ~7k ghosts through the
database, and any new pollution on any device snowballed.

---

## 2. What was audited

All audit work was read-only against the live deployment
(`https://long-dust-7034.1-priyannsh.workers.dev/`) and the Supabase dashboard.
Nothing was written to the database during the audit phase.

### 2.1 Row counts and classification

SQL on `garage_customers` (paraphrased):

- Total live rows: **10,649**
- Rows whose `id` matched a non-customer prefix:
  - `mm-…` (job_payment): large bucket
  - `KBJ…` (job): 102
  - `J…` but not `JAL…` (job): 95
  - `s17…` (stock_item): 150
  - `log…` (audit_log)
  - `inc…` (income_entry)
  - `pe1…` (purchase_entry)
  - `sir1…` (supplier_invoice_review)
  - `imp1…` (import_batch)
  - `e17…` (expense)
  - `money` (legacy single row)
- Sum of non-customer buckets: **6,950**
- Remaining legitimate customer rows: **2,812** (prefixes `boo`, `kb-`, `c17`,
  `m-leg`, `c3-c5`, `JAL…`, plus unprefixed IDs)

### 2.2 Cross-table verification

For each suspected ghost prefix we confirmed that the corresponding "real"
table existed and held the canonical data:

- `mm-…` rows in `garage_customers` had matching rows in `garage_job_payments`
- `KBJ…` / `J…` rows had matching rows in `garage_jobs`
- `s17…` rows had matching rows in `garage_stock_items`
- `log…` rows had matching rows in `garage_audit_log`
- …and so on for income, purchase, supplier, import, expense.

So the ghosts in `garage_customers` are *purely* duplicated pollution. Deleting
them does not lose any data.

### 2.3 Code read of the live `sync.js`

The deployed `sync.js` (74,659 bytes, 1,879 lines) was inspected structurally:

- Line ~12–28: `SHADOW_SYNC_TABLES` — 15 entries mapping payload keys to
  shadow tables and builders. Correctly separated per type.
- Line ~441: `shadowBaseRow(id, record, session)` — correct conditional
  `deleted_at` handling (not hardcoded).
- Line ~538: `buildCustomerShadowRows` — **the write gate**. Reads only
  `payload?.customers` and had no shape filter.
- Line ~600: `buildJobPaymentShadowRows` — correctly uses `mm-…` prefix.
- Line ~818: `upsertShadowRows` — fine.
- Line ~930–961: `syncShadowTables` dispatcher — has a correct orphan-delete
  pass at ~943–945 that tombstones any row in the remote set that is not in
  the expected local set.
- Line ~1388: `pullFromShadowTables` — no shape filter, so pollution comes
  back on every pull.
- Line ~311: `mergedSyncPayload` — merges customers by id at line ~319 with
  no shape check.

The dispatcher's orphan-delete pass was **correct**. It was just being
defeated because the ghosts were being rebuilt on the push side by
`buildCustomerShadowRows`, which put them back into the expected set.

Fixing the write gate is therefore sufficient: the orphan pass already handles
deletion.

### 2.4 Deployment state

- Cloudflare Workers: 119 versions in history.
- Current live version (before patch): `fbac4c18`.
- Rollback target if needed: any prior version via the Cloudflare dashboard
  Deployments tab → Rollback.

---

## 3. What changed

Two files touched: **`js/sync.js`** (the fix) and **`sw.js`** (cache bump so
users actually pick up the new sync.js).

Two additions to `js/sync.js`, both just above `buildCustomerShadowRows`
(~line 538):

### 3.1 New helper: `isCustomerShapedRaw`

Rejects any record whose `id` prefix identifies it as a non-customer type.
Real customer prefixes (`boo`, `kb-`, `c17`, `m-leg`, `c3-c5`, `JAL…`) plus
any unrecognized prefix pass through untouched, so brand-new customer IDs
keep working.

```js
// --- PATCH (2026-04-23): filter historical pollution out of garage_customers ---
// Old deploys funneled payments/jobs/stock/audit/income through garage_customers,
// leaving ~7k ghost rows. This helper rejects any record whose ID prefix
// identifies it as a non-customer type, so the existing orphan-delete pass in
// the dispatcher tombstones them on the next sync. Real customer prefixes
// (boo, kb-, c17, m-leg, c3-c5, plus anything we don't recognise) pass
// through untouched.
function isCustomerShapedRaw(raw) {
  if (!raw) return false;
  const id = String(raw && raw.id || '').trim();
  if (!id) return true; // freshly-created records without an id yet
  if (/^mm-/i.test(id)) return false;    // job_payment
  if (/^log/i.test(id)) return false;    // audit_log
  if (/^s17/i.test(id)) return false;    // stock_item
  if (/^KBJ/.test(id)) return false;     // job
  if (/^J/.test(id) && !/^JAL/i.test(id)) return false; // job (preserve JAL... customer prefix)
  if (/^inc/i.test(id)) return false;    // income_entry
  if (/^pe1/i.test(id)) return false;    // purchase_entry
  if (/^sir1/i.test(id)) return false;   // supplier_invoice_review
  if (/^imp1/i.test(id)) return false;   // import_batch
  if (/^e17/i.test(id)) return false;    // expense
  if (/^money/i.test(id)) return false;  // legacy single 'money' row
  return true;
}
// --- END PATCH ---
```

### 3.2 Filter integration in `buildCustomerShadowRows`

The existing filter already dropped records with no name or with `deletedAt`.
One more condition added at the end:

```js
function buildCustomerShadowRows(payload, session) {
  const jobsList = shadowNormalizedJobs(payload);
  return normaliseArray(payload?.customers)
    .filter(raw => raw && !String(raw.deletedAt || '').trim() && String(raw.name || '').trim() && isCustomerShapedRaw(raw))
    .map(raw => {
      // ... unchanged ...
    });
}
```

That's the entire code change in `sync.js`. No new dependencies, no schema
change, no migration script.

### 3.3 Service worker cache bump (`sw.js`)

`sw.js` caches `./js/sync.js` by plain filename in the `jalasai-v6` cache.
The fetch handler is network-first for app-shell requests, so online users
pick up the new file on the next reload regardless. But offline users, and
anyone whose network-first fetch fails, would fall back to the stale cached
copy.

To guarantee a clean install everywhere, the cache name was bumped:

```js
// sw.js
const CACHE = 'jalasai-v7';   // was 'jalasai-v6'
```

On next load the service worker `install` handler re-downloads the full
app shell into the new cache, and the `activate` handler deletes the old
`jalasai-v6` cache. After that, every subsequent request serves the new
`sync.js`.

---

## 4. How the cleanup happens at runtime

1. After deploy, any client opens the app.
2. On sync push, `buildCustomerShadowRows` now produces ~2,812 expected rows
   (real customers only). Ghost IDs never enter the expected set.
3. The dispatcher in `syncShadowTables` (~line 943) runs its existing
   orphan-delete pass: any `garage_customers` row whose id is in the remote
   set but not in the expected set gets tombstoned (`deleted_at` set,
   `source_hash` cleared).
4. The 6,950 ghost rows are tombstoned.
5. On the next pull, `pullFromShadowTables` filters `deleted_at IS NULL`, so
   tombstoned ghosts stop coming back.
6. Local state converges to the clean set on every device on the next sync
   round.

No user action required beyond deploying the folder.

---

## 5. Deployment

- Per the user's request, only the code in `/Users/priyansh/Projects/Jalasai`
  was edited (single file: `js/sync.js`). Deploy the packaged [deploy](/Users/priyansh/Projects/JalaSai/deploy) folder, not the whole workspace.
- Before deploy, note the current Cloudflare version ID so rollback is
  one click: **`fbac4c18`** was live at audit time.
- No environment variables, no Supabase schema change, no secrets touched.

### Rollback

If anything looks wrong post-deploy, the live effect can be reverted two ways:

1. **Cloudflare rollback** — Deployments tab → select version `fbac4c18`
   (or whatever was live before this deploy) → Rollback. This restores the
   previous `sync.js` and the filter is gone.
2. **Code revert** — delete the `isCustomerShapedRaw` function and remove
   `&& isCustomerShapedRaw(raw)` from the `buildCustomerShadowRows` filter,
   redeploy.

The tombstones left behind are harmless if the filter is reverted: they are
legitimate deletions of records that should never have been in
`garage_customers` in the first place.

---

## 6. What was NOT changed

- `pullFromShadowTables` — intentionally left alone. Adding a pull-side
  filter would hide pollution rather than delete it. Fixing the write gate
  plus letting the existing orphan pass do its job is cleaner.
- `mergedSyncPayload` — also left alone, same reason.
- Other builders (`buildJobShadowRows`, `buildJobPaymentShadowRows`, etc.)
  already scope their inputs to the correct payload keys and don't need the
  shape filter.
- No SQL was run against production. All cleanup happens via the existing
  sync path.

---

## 7. Prefix reference

For future reference, the ID prefixes currently in use across the system:

| Prefix | Type | Table |
| --- | --- | --- |
| `boo`, `kb-`, `c17`, `m-leg`, `c3-c5`, `JAL…` | customer | `garage_customers` |
| `KBJ…`, `J…` (not `JAL…`) | job | `garage_jobs` |
| `mm-…` | job_payment | `garage_job_payments` |
| `s17…` | stock_item | `garage_stock_items` |
| `log…` | audit_log | `garage_audit_log` |
| `inc…` | income_entry | `garage_income_entries` |
| `pe1…` | purchase_entry | `garage_purchase_entries` |
| `sir1…` | supplier_invoice_review | `garage_supplier_invoice_reviews` |
| `imp1…` | import_batch | `garage_import_batches` |
| `e17…` | expense | `garage_expenses` |
| `money` | legacy singleton | (was in `garage_customers`) |

If new record types get added, extend `isCustomerShapedRaw` with the new
prefix. Unknown prefixes default to "treat as customer," which is the
permissive direction — pollution gets caught next time we audit.
