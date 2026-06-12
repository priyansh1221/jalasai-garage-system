# Implementation Overview

Last updated: 2026-04-06

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

### Operational Extensions

- Shared shell runtime for both UIs in `js/shell.js`
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
- save-and-next flow for high daily throughput

### 2. Invoice Integrity

Invoice logic includes:

- next-number suggestion from highest real invoice
- duplicate invoice warning
- editable invoice date
- discount support
- due reduction through payment, discount, or both

### 3. Stock and Catalog Intake

Stock handling evolved toward safer intake:

- searchable stock by part/SKU/fitment with typo tolerance
- QR sticker print (offline QRGen encoder) and scan in/out loop
- batch scan mode for rapid counter scanning
- Set Count shelf reconciliation with audited recount movements
- duplicate SKU warnings on add/edit

### 4. Customer Lifecycle Tracking

Customer flow includes:

- balance-aware customer cards
- follow-up reminders that start only from current tracking period
- feedback reminders (7 days)
- service reminders (75 days)

### 5. Reporting and Finance

Admin reporting provides:

- revenue, expenses, net
- mechanic and part performance
- stock value and reorder cues
- closing summary share payload with payment breakdown

## Why This Implementation Works

- Optimized for workshop reality, not demo-only behavior
- Maintains usability on mobile where staff actually operate
- Keeps cloud optional and recoverable through local cache paths
- Enables iterative improvements without framework lock-in
