# JalaSai Garage System

Production-focused garage operations platform for two-wheeler workshops, built for fast daily usage on mobile and desktop.

Vanilla JS | Local-first architecture | Supabase cloud sync | PWA-ready | Real workflow validation.

![Release](https://img.shields.io/github/v/release/priyansh1221/jalasai-garage-system?label=release)
![Last Commit](https://img.shields.io/github/last-commit/priyansh1221/jalasai-garage-system)
![Stack](https://img.shields.io/badge/stack-Vanilla%20JS%20%7C%20HTML%20%7C%20CSS-0f766e)
![Architecture](https://img.shields.io/badge/architecture-Local--first%20%2B%20Cloud%20Sync-1d4ed8)
![Platform](https://img.shields.io/badge/platform-Mobile--first%20PWA-f97316)
![License](https://img.shields.io/badge/license-All%20Rights%20Reserved-7f1d1d)

![Repository Banner](assets/repo-banner.svg)

## Architecture Snapshot

- UI layer: single-page interface with workflow-first forms for Jobs, Invoices, Stock, Customers, and Reports
- Data layer: browser local state for offline resilience and fast interaction
- Sync layer: Supabase-authenticated table-wise cloud sync (shadow tables are the only cloud source of truth)
- Storage layer: structured records for operations plus photo references
- Tooling layer: lightweight scripts for catalog preparation, imports, and backup support

## 60-Second Walkthrough

1. Open app and go to `Quick Invoice` to start a live workflow.
2. Select customer/vehicle using recent chips and shortcuts.
3. Add service and parts, assign mechanic, set payment method.
4. Save as invoice or switch to job-card flow based on service status.
5. Open `Stock` to verify part movement and duplicate-safe handling.
6. Open `Admin > Reports`, enter password `1122`, and view revenue, expenses, net, and closing summary.
7. Sign in to cloud to validate local-first plus shared-state behavior and the shadow table mirror.

## Quick Demo Flow

1. Open the app and create a new entry from `Quick Invoice`.
2. Select or create a customer, then pick a vehicle using recent chips.
3. Add service and parts, assign mechanic, and set payment method.
4. Save as invoice or convert to job card depending on workflow.
5. Open `Stock` to update quantities and verify duplicate-safe part handling.
6. Open `Admin > Reports`, enter password `1122`, and check revenue, expenses, and closing summary.

## Highlights

- Fast-entry daily operations via `Quick Invoice` and `Job Card`
- Active job statuses include `Waiting`, `In Progress`, `Parts Needed`, `Ready`, and `Returned`
- Invoice and dues handling with discount support
- Default invoice list sort is `Invoice No.` high to low
- Default customer list sort is `Due: High to Low`
- Customer list rendering is batched so large imported datasets open quickly while search still covers all customers
- Invoice number sort is numeric, so `9999` / `10000` order behaves like real invoice numbers
- Click-through daily finance breakdown from `Today's Revenue`
- Mechanic-linked regular income that feeds mechanic totals and reports
- Mechanics screen supports `Month`, `Date`, and `Year` revenue filters for per-mechanic totals
- Explicit `Open Camera` and `Upload Photos` actions for all photo fields
- Back navigation for nested page and modal flows
- Quick `Sync Now` action beside cloud status for pull-first recovery and upload of pending local changes
- Stock control with catalog-assisted intake, duplicate warnings, and stock photos for visual identification
- Part add / part scan supports saved selling price and manual override price
- Customer lifecycle tracking with follow-up reminders
- Dedicated `Reminders` tab with Feedback Due, Service Due, and Payment Due lists; per-row Send WhatsApp, Mark as Sent, and Remove actions, with auto-resurfacing on new service or growing due balance
- Khatabook opening-balance imports are isolated from unrelated customers unless phone/name evidence matches
- Sync-safe tombstone deletes for customers, stock items, and mechanics across multi-device merges
- Admin reporting for revenue, expenses, and net summaries with Reports password gate
- Mobile-friendly reports with analysis split into smaller cards instead of wide overflow-heavy blocks
- PWA-ready static frontend with local resilience
- Supabase-backed multi-device sync, photo storage, and shadow table dataset validation
- Old and new UI modes in one deploy package, sharing the same local cache and Supabase backend

## Current Runtime Sync Model

Current app behavior:

- shadow-table sync is the live cloud path
- 15 shadow tables are mirrored on push; 14 tables are pulled back into app state
- devices subscribe to `garage_sync_heartbeat` for realtime multi-device updates
- background sync keeps local backup fresh and falls back to heartbeat checks every 5 minutes when realtime misses an event
- normal saves upload only rows changed around the pending local edit, so invoice/job updates do not rescan every cloud table
- `Sync Now` pulls latest cloud data first, then pushes only if this device still has pending local changes
- devices that have not pulled for more than 7 days refresh from cloud before upload; startup renders local data first when available and only blocks empty devices for first cloud hydration
- if there are no pending local edits, a pull replaces the local business cache so stale records are removed automatically
- backups: Admin exposes a one-tap full JSON download; an optional GitHub Action dumps all Supabase tables nightly to a private repository
- sync table reads avoid tombstoned rows where possible, and empty-local-device safety pulls before pushing
- old/new UI switching keeps local data backed up first, then lets cloud sync continue in the background

## Tech Stack

- Vanilla HTML/CSS/JS
- Static deployment (no framework build pipeline)
- Supabase Auth + Postgres + Storage

## Documentation Map

- Product journey: [PROJECT_HISTORY.md](/Users/priyansh/Projects/JalaSai/docs/PROJECT_HISTORY.md)
- Release changes: [CHANGELOG.md](/Users/priyansh/Projects/JalaSai/docs/CHANGELOG.md)
- System data reference: [SYSTEM_DATA_MAP.md](/Users/priyansh/Projects/JalaSai/docs/SYSTEM_DATA_MAP.md)
- Performance/data cleanup note: [PERFORMANCE_AND_DATA_CLEANUP_2026_05_01.md](/Users/priyansh/Projects/JalaSai/docs/PERFORMANCE_AND_DATA_CLEANUP_2026_05_01.md)
- Incident log: [INCIDENTS.md](/Users/priyansh/Projects/JalaSai/docs/INCIDENTS.md)
- Latest cloud incident: [SUPABASE_PROJECT_UNHEALTHY_INCIDENT_2026_06_07.md](/Users/priyansh/Projects/JalaSai/docs/SUPABASE_PROJECT_UNHEALTHY_INCIDENT_2026_06_07.md)
- AI operating model: [AI_OPERATING_MODEL.md](/Users/priyansh/Projects/JalaSai/docs/AI_OPERATING_MODEL.md)
- Deployment setup: [DEPLOYMENT.md](/Users/priyansh/Projects/JalaSai/docs/DEPLOYMENT.md)
- Build and operations: [OPERATIONS.md](/Users/priyansh/Projects/JalaSai/docs/OPERATIONS.md)
- Implementation details: [IMPLEMENTATION.md](/Users/priyansh/Projects/JalaSai/docs/IMPLEMENTATION.md)
- Improvements and evolution: [IMPROVEMENTS.md](/Users/priyansh/Projects/JalaSai/docs/IMPROVEMENTS.md)
- Security policy: [SECURITY.md](/Users/priyansh/Projects/JalaSai/docs/SECURITY.md)

## Social Preview Asset

Designed social preview image for repository branding:

- [assets/social-preview.svg](assets/social-preview.svg)

## Deployment Notes

- Deploy [deploy](/Users/priyansh/Projects/JalaSai/deploy), not the full project workspace
- This deployment can run with built-in Supabase connection details in `js/cloud-config.js`
- Staff sign in with email/password; the project URL/key fields are hidden when built-in config is present
- Sensitive/local artifacts should still stay out of shared exports and backups
- License remains `All rights reserved`

## Local Setup (Owner Private)

1. Clone the repository.
2. Open project root in VS Code.
3. Review `js/cloud-config.js` for the target deployment model.
   The current deployment supports built-in project config, but a fresh deploy can still be pointed at a different Supabase project.
4. Run `supabase/schema.sql`.
   This sets up the live shadow-table sync path plus the optional legacy backup row/table path.
5. Serve as static files using any static host/local server.

If any key was previously exposed, rotate it at provider level before publishing.
