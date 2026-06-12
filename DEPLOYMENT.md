# JalaSai Deployment

Last updated: 2026-04-03

For the full product/build history, see:
- [PROJECT_HISTORY.md](/Users/priyansh/Projects/JalaSai/PROJECT_HISTORY.md)
- [CHANGELOG.md](/Users/priyansh/Projects/JalaSai/CHANGELOG.md)

## Hosting Model

This app is deployed as static files plus Supabase.

Required pieces:
- static host for the frontend
- Supabase project for auth, shared JSON state, and photo storage

## Supabase Setup

1. Create a Supabase project.
2. Run [supabase/schema.sql](/Users/priyansh/Projects/JalaSai/supabase/schema.sql).
3. Create owner/staff users in Supabase Auth.
4. Put project URL and anon key into [js/cloud-config.js](/Users/priyansh/Projects/JalaSai/js/cloud-config.js) only on your private machine.
5. Keep real admin emails private; do not commit them.

Public-safe default:
- [js/cloud-config.js](/Users/priyansh/Projects/JalaSai/js/cloud-config.js) should stay as placeholder values in Git.

## Static Hosting

Good choices:
- Cloudflare Pages
- Netlify
- Vercel

Upload the whole project folder as static files.

Main files:
- [index.html](/Users/priyansh/Projects/JalaSai/index.html)
- [style.css](/Users/priyansh/Projects/JalaSai/style.css)
- [js/](/Users/priyansh/Projects/JalaSai/js)
- [manifest.webmanifest](/Users/priyansh/Projects/JalaSai/manifest.webmanifest)
- [sw.js](/Users/priyansh/Projects/JalaSai/sw.js)
- [icons/icon.svg](/Users/priyansh/Projects/JalaSai/icons/icon.svg)

## After Deploy Checklist

Check these flows:
- cloud sign-in
- Jobs opens on last used tab after refresh
- Quick Invoice suggests next invoice number
- Quick Invoice can save as invoice and as job card
- Job Card can save as job and as invoice
- income can be added from Jobs dashboard
- Reports and Expenses both show `Yesterday` filter
- Reports `Closing Summary` includes cash / UPI / expenses / net
- invoice edit works from invoice list
- customer name click in invoice list opens customer popup in-place
- stock search matches fitment and typo
- Print QR works from Admin

## Photos

Photos are stored for reference in Supabase Storage.

Behavior:
- job photo and invoice photo can be added/changed/removed
- photo opens full-screen in app
- photo is not included in printed invoice / PDF

## Current Operational Notes

- manual income is part of revenue reporting
- invoice-linked income is reference-only in invoice list
- follow-up reminders start only from the new tracking period
- duplicate invoice numbers are blocked before save
- fast-entry UI now uses chip selectors for mechanics, payment methods, and income type
- mobile spacing and touch targets were polished for daily phone use

## Kept Project Files

Still intentionally kept:
- [tools/import_legacy_data.py](/Users/priyansh/Projects/JalaSai/tools/import_legacy_data.py)
- [tools/build_final_catalog.py](/Users/priyansh/Projects/JalaSai/tools/build_final_catalog.py)
- [tools/build_parts_seed_v2.py](/Users/priyansh/Projects/JalaSai/tools/build_parts_seed_v2.py)

Removed during cleanup:
- temp thumbnail files
- stray `.DS_Store`
- unreachable old invoice edit modal code
