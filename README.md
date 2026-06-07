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
- Sync layer: Supabase-authenticated cloud sync for shared multi-device state
- Storage layer: structured records for operations plus photo references
- Tooling layer: lightweight scripts for catalog preparation, imports, and backup support

## 60-Second Walkthrough

1. Open app and go to `Quick Invoice` to start a live workflow.
2. Select customer/vehicle using recent chips and shortcuts.
3. Add service and parts, assign mechanic, set payment method.
4. Save as invoice or switch to job-card flow based on service status.
5. Open `Stock` to verify part movement and duplicate-safe handling.
6. Open `Admin > Reports` and view revenue, expenses, net, and closing summary.
7. Sign in to cloud to validate local-first plus shared-state behavior.

## Quick Demo Flow

1. Open the app and create a new entry from `Quick Invoice`.
2. Select or create a customer, then pick a vehicle using recent chips.
3. Add service and parts, assign mechanic, and set payment method.
4. Save as invoice or convert to job card depending on workflow.
5. Open `Stock` to update quantities and verify duplicate-safe part handling.
6. Open `Admin > Reports` to check revenue, expenses, and closing summary.

## Highlights

- Fast-entry daily operations via `Quick Invoice` and `Job Card`
- Invoice and dues handling with discount support
- Stock control with catalog-assisted intake and duplicate warnings
- Customer lifecycle tracking with follow-up reminders
- Admin reporting for revenue, expenses, and net summaries
- PWA-ready static frontend with local resilience
- Supabase-backed multi-device sync and photo storage

## Tech Stack

- Vanilla HTML/CSS/JS
- Static deployment (no framework build pipeline)
- Supabase Auth + Postgres + Storage
- Google Apps Script helpers for backup/sync operations

## Documentation Map

- Complete architecture and function reference: [docs/ARCHITECTURE_AND_FUNCTION_REFERENCE.md](docs/ARCHITECTURE_AND_FUNCTION_REFERENCE.md)
- Product journey: [PROJECT_HISTORY.md](PROJECT_HISTORY.md)
- Release changes: [CHANGELOG.md](CHANGELOG.md)
- Deployment setup: [DEPLOYMENT.md](DEPLOYMENT.md)
- Build and operations: [OPERATIONS.md](OPERATIONS.md)
- Implementation details: [IMPLEMENTATION.md](IMPLEMENTATION.md)
- Improvements and evolution: [IMPROVEMENTS.md](IMPROVEMENTS.md)
- Security policy: [SECURITY.md](SECURITY.md)

## Social Preview Asset

Designed social preview image for repository branding:

- [assets/social-preview.svg](assets/social-preview.svg)

## Public Repository Safety

- No production API secrets are committed
- `js/cloud-config.js` is placeholder-only in git
- Sensitive/local artifacts are covered by `.gitignore`
- License is `All rights reserved` to prevent unauthorized reuse

## Local Setup (Owner Private)

1. Clone the repository.
2. Open project root in VS Code.
3. Configure private Supabase values in `js/cloud-config.js` only on your machine.
4. Run `supabase/schema.sql`.
5. Serve as static files using any static host/local server.

If any key was previously exposed, rotate it at provider level before publishing.
