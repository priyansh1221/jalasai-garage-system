# JalaSai Deployment

Last updated: 2026-06-05

For the full product/build history, see:
- [PROJECT_HISTORY.md](/Users/priyansh/Projects/JalaSai/docs/PROJECT_HISTORY.md)
- [CHANGELOG.md](/Users/priyansh/Projects/JalaSai/docs/CHANGELOG.md)
- [PERFORMANCE_AND_DATA_CLEANUP_2026_05_01.md](/Users/priyansh/Projects/JalaSai/docs/PERFORMANCE_AND_DATA_CLEANUP_2026_05_01.md)
- [AI_OPERATING_MODEL.md](/Users/priyansh/Projects/JalaSai/docs/AI_OPERATING_MODEL.md)
- [NEW_UI_MERGE_2026_06_03.md](/Users/priyansh/Projects/JalaSai/docs/NEW_UI_MERGE_2026_06_03.md)

## Hosting Model

This app is deployed as static files plus Supabase.

Required pieces:
- static host for the frontend
- Supabase project for auth, shared JSON state, shadow dataset tables, and photo storage

## Supabase Setup

1. Create a Supabase project.
2. Run [supabase/schema.sql](/Users/priyansh/Projects/JalaSai/supabase/schema.sql).
   This creates the live shadow dataset tables, indexes, RLS policies, storage bucket,
   report views, and the additive `tenant_id` columns (2026-06-12 model — the legacy
   `garage_state` blob and import-pipeline tables are no longer created).
3. Create owner/staff users in Supabase Auth.
4. Configure Cloudflare Pages runtime variables for the deployment you are shipping.
   Production reads `/config.js` from a Pages Worker, which injects values from Cloudflare without committing them to git.
5. If you are moving to a different Supabase project, update the Cloudflare Pages variables before deploy.

Cloudflare Pages variables:

```bash
npx wrangler pages secret put SUPABASE_URL --project-name jalasai-garage
npx wrangler pages secret put SUPABASE_ANON_KEY --project-name jalasai-garage
npx wrangler pages secret put JALASAI_ADMIN_EMAILS --project-name jalasai-garage
```

Use a comma-separated value for `JALASAI_ADMIN_EMAILS`, for example:

```text
1.priyannsh@gmail.com,jalasaiautogarage@gmail.com
```

The Supabase anon key is still delivered to the browser because Supabase browser clients require it. Keep Supabase Row Level Security and Auth policies correct, and never use the service-role key here.

## Static Hosting

Good choices:
- Cloudflare Pages
- Netlify
- Vercel

Deploy generated Wrangler output only. The repository does not keep a hand-maintained [deploy](/Users/priyansh/Projects/JalaSai/deploy) runtime copy.

Do not deploy these support folders with the website:
- [docs](/Users/priyansh/Projects/JalaSai/docs)
- [workspace-data](/Users/priyansh/Projects/JalaSai/workspace-data)
- [tools](/Users/priyansh/Projects/JalaSai/tools)
- [catalog](/Users/priyansh/Projects/JalaSai/catalog)
- [supabase](/Users/priyansh/Projects/JalaSai/supabase)
- [important-files](/Users/priyansh/Projects/JalaSai/important-files)

Maintained runtime files:
- [index.html](/Users/priyansh/Projects/JalaSai/index.html)
- [style.css](/Users/priyansh/Projects/JalaSai/style.css)
- [sw.js](/Users/priyansh/Projects/JalaSai/sw.js)
- [js](/Users/priyansh/Projects/JalaSai/js)
- [cloudflare/pages-worker.js](/Users/priyansh/Projects/JalaSai/cloudflare/pages-worker.js)
- [NEW UI/index.html](/Users/priyansh/Projects/JalaSai/NEW%20UI/index.html)
- [NEW UI/style.css](/Users/priyansh/Projects/JalaSai/NEW%20UI/style.css)

Current deploy package notes:
- `/deploy/` is generated output only; do not edit or mirror files there by hand
- `/deploy/_worker.js` serves `/config.js` from Cloudflare Pages environment values
- the service worker cache is currently `jalasai-v49`
- the root service worker caches both the old UI and `newui/`, so old/new UI switching stays warm
- New UI loads shared runtime scripts from root `js/`
- root and New UI use the same updated favicon/app icon assets
- app-shell files are cache-first with background refresh
- startup loading fallback is capped at 12 seconds
- old/new UI switching writes a local backup before navigation, while cloud sync continues in the background
- root `js/` is the single source for both UIs
- Supabase IO saver is active: normal saves upload only changed shadow rows, automatic pulls are throttled, and fallback heartbeat polling runs every 5 minutes
- startup renders local business data first when available; empty devices keep the loading blur while the first cloud pull hydrates data
- refresh paints the app shell before parsing local saved data, and cached devices let cloud/realtime refresh continue in the background
- legacy data cleanup runs later as versioned idle maintenance instead of blocking every refresh
- New UI mobile sidebar closes immediately after selecting any menu destination
- focus/visibility refresh uses the heartbeat stale check instead of an unconditional table pull
- last-page storage writes are debounced during fast tab/page switching
- New Job and Quick Invoice paint the modal before hydrating recent customer/bike shortcuts and large customer suggestions
- New Job customer recommendations use cached, capped custom results after 3 letters/digits; no large native datalist is attached to manual name entry

## After Deploy Checklist

Check these flows:
- cloud sign-in
- startup data-load overlay closes after the first usable dataset is rendered
- old UI `New UI` button opens `/newui/`
- new UI `Old UI` button returns to `/`
- tab switching inside each UI is smooth after first render
- sync diagnostics show `Table Sync` status and `Legacy Blob Backup` status
- sync diagnostics update after sign-in, push, pull, and reconnect
- after making one invoice/job edit, the app should stay usable while the background upload completes
- Jobs opens on last used tab after refresh
- Quick Invoice suggests next invoice number
- Quick Invoice can save as invoice and as job card
- Job Card can save as job and as invoice
- Job status menus and filters include `Returned`
- income can be added from Jobs dashboard
- regular income can be linked to a mechanic
- Mechanics screen period controls switch correctly between `Month`, `Date`, and `Year`
- Reports and Expenses both show `Yesterday` filter
- Reports `Closing Summary` includes cash / UPI / expenses / net
- invoice edit works from invoice list
- invoice number sort puts `9999` before `10000`
- invoice rows after `10523` are visible after sync
- temporary verification job `J009-FEFV` / `ZZ UI TEST 20260603` does not appear in active jobs
- future invoice, income, and expense dates are rejected
- customer name click in invoice list opens customer popup in-place
- customer search still covers all records, while the Customers page initially renders a smaller batch with `Load more customers`
- known Khatabook opening balances do not appear under unrelated customers after first post-deploy cleanup sync
- stock search matches fitment and typo
- stock photo can be attached, replaced, and removed
- stock QR print does not include stock photos
- part add / scan part supports saved price and manual price override
- Print QR works from Admin and stays hidden from non-admin users
- Reports, Expenses, and other date-driven screens stay on IST/Asia-Kolkata business dates

## Photos

Photos are stored for reference in Supabase Storage.

Behavior:
- job photo and invoice photo can be added/changed/removed
- stock photo can be added/changed/removed for identification
- photo opens full-screen in app
- photo is not included in printed invoice / PDF
- stock photo is not included in stock QR print

## Current Operational Notes

- manual income is part of revenue reporting
- invoice-linked income is reference-only in invoice list
- linked income now matches exact invoice references only
- business-date defaults are standardized to `Asia/Kolkata` across shared date helpers
- follow-up reminders start only from the new tracking period
- duplicate invoice numbers are blocked before save
- duplicate checks ignore soft-deleted/non-completed jobs and use strict invoice reference matching
- active job status flow includes `Returned` across job forms, board filters, and reports
- fast-entry UI now uses chip selectors for mechanics, payment methods, and income type
- mechanic totals can be reviewed by selected month, exact date, or full year
- mobile spacing and touch targets were polished for daily phone use
- phone photo flow persists draft state before opening camera/file picker
- preferred AI direction is on-demand and human-reviewed, not background auto-processing
- current AI assist is prompt-based and frontend-only, so there is no AI backend or extra deployment requirement yet
- old and new UI modes share the same localStorage data and Supabase sync runtime
- background cloud sync should not show a blocking full-screen blur after initial load
- New UI Home customer and due metrics are based on real workshop activity, not imported customer-master-only rows

## Kept Project Files

Still intentionally kept:
- [tools/import_legacy_data.py](/Users/priyansh/Projects/JalaSai/tools/import_legacy_data.py)
- [tools/build_final_catalog.py](/Users/priyansh/Projects/JalaSai/tools/build_final_catalog.py)
- [tools/build_parts_seed_v2.py](/Users/priyansh/Projects/JalaSai/tools/build_parts_seed_v2.py)

Removed during cleanup:
- temp thumbnail files
- stray `.DS_Store`
- unreachable old invoice edit modal code
