# Implementation Overview

Last updated: 2026-05-01

Related references:

- [SYSTEM_DATA_MAP.md](/Users/priyansh/Projects/JalaSai/docs/SYSTEM_DATA_MAP.md)
- [OPERATIONS.md](/Users/priyansh/Projects/JalaSai/docs/OPERATIONS.md)
- [PERFORMANCE_AND_DATA_CLEANUP_2026_05_01.md](/Users/priyansh/Projects/JalaSai/docs/PERFORMANCE_AND_DATA_CLEANUP_2026_05_01.md)

## Product Context

JalaSai was implemented for real workshop conditions where speed, clarity, and mobile usability matter more than abstract feature completeness.

Core design decisions:

- local-first data behavior for resilience
- static app architecture for low operational overhead
- workflow-driven UI over generic admin forms
- gradual cloud enablement with role-based controls

## Architecture

### Frontend

- Single-page static interface in `index.html`
- Styling and mobile polish in `style.css`
- Domain modules under `js/` (`jobs`, `customers`, `stock`, `expenses`, `reports`, etc.)

### Data and Sync

- Local cache/state management in `js/data.js`
- Cloud auth and sync logic in `js/sync.js`
- Supabase schema and table setup in `supabase/schema.sql`

Current sync safety model:
- shadow tables (`garage_customers`, `garage_jobs`, etc.) are the live source of truth
- push writes only changed rows to shadow tables (hash-based incremental upsert)
- pull reads all active `record_data` rows from shadow tables; shadow tables are the ONLY cloud path (the `garage_state` blob was removed 2026-06-12)
- removed rows are soft-deleted in shadow tables, never hard-deleted
- explicit user deletes push tombstone rows so other devices apply the delete instead of resurrecting the record (2026-06-12)
- the delta-pull cursor advances from the real `source_updated_at` seen during a pull; delta/critical-only/partially-failed pulls always merge and never replace the local cache (2026-06-12 guards)
- payments arrays are unioned across both copies of a job during merge so concurrent payments are never lost
- backups: Admin one-tap JSON download plus the optional nightly GitHub Action (`.github/workflows/nightly-backup.yml`)
- `SHADOW_PULL_TABLES` in sync.js lists the 9 pullable tables (excludes derived `jobPayments`)

Background sync behavior:
- background loop interval is 5 minutes
- auto-push delay is 8000 ms and realtime pull debounce is 12000 ms
- background loop pushes when `pendingSync` is true; otherwise runs `checkAndPullIfStale` as a realtime fallback
- manual `Sync Now` performs a pull-first sync, then pushes only if local pending changes remain
- devices whose `lastPulledAt` is older than 7 days force-pull before any push
- pull applies as a local-cache replacement when `pendingSync` is false, while pending devices still merge before upload
- `local-newer` pull result auto-queues a push even when `pendingSync` is false
- IO-saver mode avoids remote metadata scans during normal saves and uploads only rows changed around `pendingSince`

Realtime multi-device sync:
- `garage_sync_heartbeat` table (one row per device) is updated after every successful push
- Supabase Realtime subscription (`startRealtimeSync`) fires within ~1 second when another device pushes, triggering an automatic pull
- `checkAndPullIfStale` queries heartbeat as fallback for missed events (phone sleep, network blip)
- realtime channel starts on sign-in, removed on sign-out
- effective sync latency between devices: ~5 seconds end-to-end
- shared business-date helpers now use `Asia/Kolkata`, keeping Jobs, Expenses, Reports, and reminders aligned

Customer data integrity after the shadow-table split:
- customer/job ownership is resolved through `customerMatchesJob`, `bestCustomerForJob`, and summary indexes in `js/data.js`
- matching prefers exact `custId` only when it does not conflict with normalized phone/name evidence
- Khatabook/opening-balance rows are guarded so old bad `custId` values do not attach unique balances to random customers
- duplicate live customer IDs are repaired, and exact duplicate customer records are merged only when name and phone match
- customer vehicle lists are rebuilt from currently owned jobs during cleanup so stale labels disappear

Render performance model:
- `showPage` yields one animation frame before heavy page render work so tab active state paints immediately
- Customers builds a customer/job summary once per render, then renders only the first 240 cards with a `Load more customers` control
- Reminders builds one shared customer/job summary and derives feedback, service, and payment lists from that single pass
- Invoices builds a linked-income lookup once per render instead of scanning income rows once per invoice row
- the current service worker app-shell cache is `jalasai-v19`

### Operational Extensions

- Shared shell runtime for both UIs in `js/shell.js` (extracted 2026-06-12)
- Nightly Supabase backup workflow in `.github/workflows/nightly-backup.yml` + `scripts/supabase-backup.mjs`
- Catalog preparation scripts in `tools/` (offline tooling only)

## Key Implemented Workflows

### 1. Fast Billing and Job Intake

Implemented two optimized entry surfaces:

- `Quick Invoice` for direct billing
- `Job Card` for open work and conversion to invoice

Both include:

- customer and bike suggestions
- shortcut chips for common operations
- mechanic assignment chips
- payment method chips
- photo attach/change/remove
- explicit `Open Camera` and `Upload Photos` actions for every photo picker
- draft-safe phone photo picking
- save-and-next flow for high daily throughput
- mechanic name recovery after reload/sync through normalized mechanic-first hydration

### 2. Invoice Integrity

Invoice logic includes:

- next-number suggestion from highest real invoice
- duplicate invoice warning
- editable invoice date
- discount support
- due reduction through payment, discount, or both

### 3. Stock Intake and Scan Loop

Stock handling is a scan-first reference system (the in-app import pipeline was removed 2026-06-12):

- searchable stock by part/SKU/fitment with typo tolerance
- stock photo reference for visual identification
- QR sticker printing with the bundled offline `QRGen` encoder (network QR API is fallback only)
- scan-in via Receive Stock (+1/+5/custom), scan-out via the Scan page
- batch scan mode keeps the camera running for rapid +1/−1 counting
- Set Count shelf reconciliation resets a bin to the real count with an audited `recount` movement
- saved-price or manual-price choice while adding/scanning parts into jobs
- manual entered price updates the stock selling price immediately

### 4. Customer Lifecycle Tracking

Customer flow includes:

- balance-aware customer cards
- follow-up reminders that start only from current tracking period
- feedback reminders (7 days)
- service reminders (75 days)
- dedicated `Reminders` tab listing every customer with an active feedback / service / payment reminder, with per-row `Send WhatsApp`, `Mark as Sent`, and `Remove` actions
- reminders survive past the 7/75 day window — they stay listed until the user marks them sent or removes them, never silently disappearing
- service-sent auto-dismisses the matching feedback entry for the same job; new completed invoice auto-resets feedback and service timers
- payment reminders hide for 7 days after action, but reappear immediately when the due balance grows
- per-customer reminder state (`customer.reminders`) is stored on the customer object so it rides existing cloud sync — no new tables

### 5. Reporting and Finance

Admin reporting provides:

- revenue, expenses, net
- mechanic and part performance
- stock value and reorder cues
- closing summary share payload with payment breakdown
- mechanic-linked regular income inside mechanic totals and reports
- revenue breakdown drilldown from Jobs dashboard for confirmation
- mobile-first analysis cards for retention, follow-up, top parts, service profitability, and heatmap-style demand review
- password-gated Reports access (`1122`)

## AI Rollout Direction

The preferred AI direction for JalaSai is low-cost and human-reviewed.

Recommended implementation order:

- note cleanup assistance
- reminder message drafting
- closing summary drafting
- supplier part normalization support
- service-type profit grouping
- stock prediction later, after cleaner history exists

Design rule:

- trigger AI on button click
- avoid background AI processing by default
- keep money, stock, and customer messaging human-approved

Current implementation status:

- implemented as prompt-copy helpers inside the frontend
- no AI API calls are made by the app yet
- active in job notes, quick invoice notes, invoice completion notes, customer follow-up drafting, closing summary drafting, and catalog normalization review

## Why This Implementation Works

- Optimized for workshop reality, not demo-only behavior
- Maintains usability on mobile where staff actually operate
- Keeps cloud optional and recoverable through local cache paths
- Enables iterative improvements without framework lock-in
