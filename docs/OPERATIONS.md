# JalaSai Garage System — Operations Guide

Last updated: 2026-05-08

Project history and implementation journey:
- [PROJECT_HISTORY.md](/Users/priyansh/Projects/JalaSai/docs/PROJECT_HISTORY.md)
- [CHANGELOG.md](/Users/priyansh/Projects/JalaSai/docs/CHANGELOG.md)
- [SYSTEM_DATA_MAP.md](/Users/priyansh/Projects/JalaSai/docs/SYSTEM_DATA_MAP.md)
- [AI_OPERATING_MODEL.md](/Users/priyansh/Projects/JalaSai/docs/AI_OPERATING_MODEL.md)

## AI Operating Rule

Use AI as workshop assistance, not as the business owner.

Rule:
- human enters or approves business truth
- AI cleans, drafts, summarizes, and suggests
- AI should not auto-send customer messages
- AI should not auto-finalize money, stock, or supplier mapping

Lowest-cost rollout order:
1. note cleanup
2. customer follow-up message drafts
3. closing summary drafting
4. supplier part normalization
5. profit grouping by service type
6. stock prediction

Current live AI assist:
- Job Card: `AI Clean Work`, `AI Clean Note`
- Quick Invoice: `AI Clean Work`, `AI Clean Note`
- Mark Done / Edit Invoice: `AI Clean Note`
- Reports: `AI Draft Summary`
- Customer popup: `AI Feedback Draft`, `AI Service Draft`
- Catalog Import Review: `AI Normalize Prompt`

Important:
- these are prompt-copy helpers only
- they do not call a paid AI API inside the app
- staff reviews the prompt and the AI result manually

## Daily Screens

Main staff screens:
- `Jobs`
- `Invoices`
- `Stock`
- `Customers`
- `Scan`

Admin screens:
- `Admin`
  - `Reports` (password protected: `1122`)
  - `Expenses`
  - `Logs`
  - `Mechanics`
  - `Print QR`

Admin access is configured in deployment and should be managed there, not in this operations guide.

## Fast Entry Flow

## Navigation

### Back flow
- top-left `Back` now appears beside `Cloud`
- `Sync Now` can appear beside cloud status for pull-first recovery and upload of pending local changes
- it is hidden on the Jobs home screen
- it is used for page-to-page return only

Nested popups now have their own `Back` where needed:
- revenue breakdown -> job detail
- job detail -> invoice
- customer detail nested flows

### Quick Invoice
Use `Jobs -> Quick Invoice` for fast daily billing.

Current behavior:
- customer search is suggestion-only
- `+ New` prefills the typed name/phone
- recent customer chips are shown
- recent bike chips are shown
- service chips are shown:
  - `Puncture`
  - `Brake`
  - `Oil`
  - `Wiring`
  - `Service`
- mechanic uses square chip selection
- payment method uses square chip selection:
  - `Cash`
  - `UPI`
- invoice number suggests the next value from the latest saved invoice
- duplicate invoice numbers warn before save
- photo can be added, changed, removed, and opened full-screen
- phone photo flow persists draft state before camera/file picker opens

Buttons:
- `Save Invoice`
- `Save as Job Card`
- `Save & Next`

Mobile polish now applied:
- bigger touch targets
- better chip wrapping
- cleaner modal spacing
- better small-screen card layout
- safer table scrolling on phone
- better toast placement on mobile

### New Job Card
Use `Jobs -> + New Job` for work that should stay open.

Current behavior:
- customer search is suggestion-only
- `+ New Customer` prefills from typed search text
- recent customer chips are shown
- recent bike chips are shown
- mechanic uses square chip selection:
 - active statuses include `Waiting`, `In Progress`, `Parts Needed`, `Ready`, and `Returned`
  - `N/A`
  - active mechanic names
- optional invoice number is available
- discount is available
- notes show on the Jobs dashboard card
- job cards show created date and time
- `Collected By` is removed

Buttons:
- `Save Job Card`
- `Save & Next`
- `Save as Invoice`

## Billing Rules

### Invoice numbers
- Quick Invoice suggests the next invoice number
- Mark Done / Edit Invoice suggests the next invoice number for new invoices
- manual override is allowed
- duplicate numbers warn before save

### Payment methods
Across fast-entry billing and income, the active payment options are:
- `Cash`
- `UPI`

### Discount
Discount can now be applied in:
- Quick Invoice
- Mark Done / Edit Invoice
- Collect Payment
- Job Card staging

### Collect Payment
From a job or customer due flow, `Collect Payment` now supports:
- amount
- payment method
- notes
- discount

So a job can become clear by:
- payment only
- discount only
- payment + discount

## Closing Summary

Use `Reports -> Closing Summary`.

It now shares:
- bikes added
- invoices
- done jobs
- revenue
- cash
- UPI
- expenses
- net
- reorder warning if stock is low

`Bikes Added` means jobs created/received in that selected date window.

## Jobs Dashboard Finance

### Today's Revenue
`Today's Revenue` on Jobs dashboard is now clickable.

It opens a same-day confirmation breakdown showing:
- saved job payments
- manual income
- expenses
- net amount
- entry count

From a job-linked revenue row, `Open Job` opens the source job so staff can verify the exact saved entry.

### Manual income and expense
- `Jobs` home now shows `+ Income` followed by `+ Expense`
- `Regular` manual income can be linked to a mechanic
- mechanic-linked regular income is counted inside mechanic totals and mechanic reports
- `Other` income stays manual income without mechanic linkage

### Linked income
Invoices can show linked income by invoice number.

Current rule:
- it is a reference-only display
- it is not the main invoice payment itself
- matching now uses exact invoice reference matching

## Parts Pricing Flow

When adding or scanning a stock part into a job:
- the saved selling price is shown as the fast option
- a manual numeric price box is also shown
- manual entered price is used immediately
- the manual price becomes the new saved selling price for that stock item

## Cloud Sync Safety

Current cloud design uses shadow tables as the primary live source:

- primary runtime sync: 15 mirrored shadow tables (`garage_customers`, `garage_jobs`, etc.), with 14 tables pulled back into app state
- legacy backup path: `garage_state` JSON blob, kept as an optional manual or Apps Script backup target

How sync works:
- normal push writes only rows changed around the pending local edit to shadow tables
- manual/full mirror paths remain available for intentional backup or recovery operations
- automatic pull refreshes operational tables first; manual `Sync Now` can still perform a full pull
- removed records are soft-deleted, never hard-deleted

Background sync behavior:
- background loop runs every 5 minutes
- background loop pushes pending changes; otherwise checks if another device pushed since the last pull
- normal online two-device sync is local-first: save immediately, batch upload briefly, send a heartbeat, then let the other device pull the operational tables
- manual `Sync Now` downloads latest cloud data first, then pushes only if local pending changes remain
- any device that has not pulled for more than 7 days performs pull-first recovery before uploading
- when a device has no pending local edits, cloud pull replaces the local business cache instead of merging stale rows back in

Realtime sync between devices:
- all devices subscribe to `garage_sync_heartbeat` via Supabase Realtime on sign-in
- when any device pushes successfully, all other signed-in devices receive the event and pull automatically after the realtime debounce/cooldown
- no manual refresh or tab switch needed for multi-device updates
- fallback: 30-second poll catches events missed due to phone sleep or network blip
- effective end-to-end sync latency between devices: ~5 seconds
- requires one-time SQL run to add `garage_sync_heartbeat` table and enable realtime publication

### Weekly blob backup
- the current app runtime does not auto-write the legacy blob
- Admin exposes a manual `Copy Data to garage_state` action when a legacy snapshot is needed
- Apps Script can still run `writeSundayBlobFromTables()` at 6 PM IST as an external fallback if that path is kept active
- sync diagnostics show `Legacy Blob Backup`

### Daily Drive backup
- Apps Script runs `backupShadowTablesToDrive()` every day at 10 PM IST
- reads from all 14 shadow tables and saves a timestamped JSON to Google Drive
- keeps the last 30 daily backups; older files are trashed automatically

### Apps Script setup (one-time)
In `apps-script/JalaSaiDriveBackup.gs`:
1. Set `BACKUP_CONFIG.SUPABASE_SERVICE_ROLE_KEY` (from Supabase project settings → API)
2. Set `BACKUP_CONFIG.DRIVE_FOLDER_ID` (Google Drive folder ID for backups)
3. Run `setupDailyBackupTrigger()` — sets daily Drive backup at 10 PM IST
4. Run `setupSundayBlobTrigger()` — sets Sunday 6 PM IST blob backup
5. Run `testBackupNow()` to verify Drive access works
6. Run `testBlobWriteNow()` to verify blob write works

If diagnostics show a Table Sync Error:
- blob remains readable as fallback for pull
- rerun the latest [supabase/schema.sql](/Users/priyansh/Projects/JalaSai/supabase/schema.sql)

## Customer Flow

### Customer cards
Customer cards now show:
- current balance
- status:
  - `Clear`
  - `Owe`
  - `Advance`

Customer sort order now shows:
- `Sort: Name`
- `Due: Low to High`
- `Due: High to Low`
- `Advance: High to Low`
- `Advance: Low to High`

They do not show misleading lifetime amount in the balance badge anymore.

Large customer lists:
- the Customers screen initially renders a smaller visible batch for speed
- use `Load more customers` to reveal more cards
- search still searches the full customer dataset, not only the visible batch

Imported Khatabook balances:
- opening-balance rows are unique imported balance records
- they should not be manually merged into another customer unless phone/name evidence clearly matches
- after cleanup, a customer should only show balance rows that still belong to that customer

### Customer history from invoice list
On `Invoices`, clicking the customer name opens customer history in a popup on the same screen.
It does not switch tabs anymore.

### Follow-ups
Customer follow-up reminders now use only the new tracking period, not old imported history.

Rules:
- feedback due after 7 days from latest completed invoice
- service reminder due after 75 days
- new service resets the timer

### Reminders tab
A dedicated `Reminders` tab between Customers and Scan lists every customer who currently needs follow-up.

Three sub-lists:
- **Feedback Due** — customers with a completed invoice 7+ days old and no feedback action yet
- **Service Due** — customers with a completed invoice 75+ days old and no service-reminder action yet
- **Payment Due** — customers with any unpaid invoice balance and no recent dismissal

Per-row actions:
- `Send WhatsApp` — opens the existing reminder message in WhatsApp (no state change)
- `Mark as Sent` — records that the message was sent and removes the row from the list
- `Remove` — dismisses without sending

Customers with no phone show `Edit Customer · Add Phone` instead of Send / Mark, plus the Remove button.

Re-appearance rules:
- Feedback / Service: hidden until a newer completed invoice exists (a new service auto-resets the 7/75-day timers and re-surfaces the customer)
- Payment: hidden 7 days after action, or reappears immediately if the customer's due balance grows during that window
- Sending a Service reminder also auto-dismisses the matching Feedback entry for the same invoice

Reminder state is stored on each customer object (`customer.reminders`) and rides existing cloud sync — no extra tables.

The old bulk `Feedback Due`, `Service Due`, and `Remind Customer Due` buttons were removed from the Customers page header; this tab replaces them.

## Date Filters

`Yesterday` is now available in:
- `Reports`
- `Expenses`

So filter options now include:
- `Daily`
- `Yesterday`
- `Weekly`
- `Monthly`
- `Yearly`
- `By Date`
- `Selected Range`

## Invoice Flow

### Mark Done / Create Invoice
From a job card:
1. click `Done`
2. set:
   - invoice number
   - invoice date
   - final payment
   - discount
   - payment method
   - notes
   - final invoice photo
3. save

Buttons:
- `Mark Done & Close Job`
- `Save & Next Invoice`

### Edit Invoice
Invoice edit now uses the same full invoice form, not the old small edit popup.

Admin can edit:
- invoice number
- invoice date
- total paid
- discount
- payment method
- notes
- final invoice photo

### Invoice photos
- invoice photos are for reference and WhatsApp workflow
- they open full-screen on click
- they are not included in printed invoice / PDF

### Linked income
Invoices can show linked income by invoice number.
Current rule:
- linked income is reference-only
- matching is exact after invoice reference normalization

## Stock Flow

### Add Part
The add-part form is simplified.

Main fields:
- part name
- fits models
- bike / brand
- category
- variant / subtype
- qty / min stock
- buy price / sell price
- supplier
- bin / location

Invoice-only fields live under `More details`:
- manufacturer
- supplier part no.
- previous buy/sell price
- notes

### Search
Stock search now matches:
- part name
- SKU
- supplier part no.
- fitment models
- near-spelling / typo search

Examples:
- `brake pad activa 5g`
- `activa 5g`
- `lamp`
- `ASKBS0212`

### Catalog import
Use `Stock -> Import Catalog CSV`.

Flow:
1. load catalog CSV
2. review one by one
3. edit row if needed
4. enter sell price
5. confirm or decline
6. pause with `Stop & Continue Later`
7. resume with `Continue Catalog Review`

Important behavior:
- confirmed parts load into stock immediately
- you can search them right away
- duplicate warning appears when likely
- you can choose update existing vs create new
- `Previous` lets you go back

### Stock from AI invoice JSON
Use `Stock -> Import Agent JSON` for supplier invoice parsing workflow.

## QR Labels

`Print QR` is now inside `Admin`.

Behavior:
- label count field controls duplicates
- enter `5` to print 5 labels for one part
- left table is wider so SKU / part / labels are visible

## Income

`+ Income` is available from the Jobs dashboard for normal users too.

Fields:
- date
- type:
  - `Regular`
  - `Other`
- amount
- method:
  - `Cash`
  - `UPI`
- note
- invoice no. optional

Shortcut chips:
- `Puncture`
- `Brake`
- `Oil`
- `Wiring`
- `Service`

Income is included in:
- Jobs today revenue
- Reports revenue totals
- daily summary calculations

## Current Change History

Major implemented work up to now (most recent first):
- optimized menu switching by batching customer-card rendering and replacing repeated per-customer/per-invoice scans with one-pass summary indexes
- repaired shadow-table customer ownership issues after the split from `garage_state`, including Khatabook opening-balance isolation, duplicate customer id repair, strict duplicate-customer merge, and stale vehicle cleanup
- fixed numeric invoice sorting so `9999` and `10000` sort correctly
- removed the remaining text brand label from the top navigation, leaving the logo and functional tabs
- added Supabase Realtime heartbeat sync (`garage_sync_heartbeat`) — all devices now update within ~5 seconds of any push without manual refresh; background loop reduced to 30 seconds as fallback; `Syncing...` button stuck state fixed
- standardized shared business dates to `Asia/Kolkata` so Jobs, Expenses, Reports, and reminders stay aligned
- re-locked `Print QR` to the Admin-only path
- cleaned up Sync Diagnostics panel — removed 6 redundant rows, merged Table Sync + Table Sync Error into one row, network errors now show human-readable message even from old localStorage values
- fixed Reports module crash caused by `REPORT_TIMEZONE` being declared after `reportFilters` initialization — moved constant above the initializer block to resolve temporal dead zone ReferenceError
- background sync loop now runs every 30 seconds; when there are no pending local changes it checks whether another device pushed more recently
- migrated cloud storage from blob-primary to shadow-table-primary; `garage_state` remains an optional legacy backup target, not the live sync source
- rewrote `JalaSaiDriveBackup.gs` to read shadow tables directly (not the blob) for daily Drive backups and for Sunday blob reconstruction
- added Supabase multi-device sync with admin email support
- removed demo trial stock and migration-cleaned old demo records
- added supplier invoice AI import direction and later simplified it to direct `Import Agent JSON`
- simplified Add Part form and moved invoice-only fields under `More details`
- improved stock search to include fitment, supplier part no., and typo matching
- added catalog import review flow with confirm/decline, pause/resume, previous, instant stock load, duplicate warning, and row editing
- restored simpler navigation with `Invoices` after `Jobs` and moved `Print QR` under `Admin`
- added quick invoice fast-entry flow with photo support
- added `Save as Job Card` inside Quick Invoice
- added full invoice edit using the same main invoice form
- removed buying rate and manufacturer / supplier part detail from customer invoice print
- made invoice/customer photos open in a full-screen viewer and excluded them from print PDF
- moved manual income entry to the daily workflow and linked optional invoice references into invoice list
- changed customer cards to show true balance instead of misleading spent total
- made invoice customer names open customer history popup in place
- added customer feedback and service reminder timers from the new tracking period only
- added invoice date editing and previous-date support
- added last-tab restore after refresh
- added invoice number suggestions, duplicate warnings, and fast-entry shortcuts
- replaced dropdown-heavy quick-entry controls with square chip selection for mechanics, payment methods, and income type
- added closing summary with cash / UPI / expenses / net split
- added `Yesterday` date filter to reports and expenses
- polished mobile layout for touch targets, spacing, cards, chips, tables, and modals

## Cleaned Project Files

Removed during cleanup:
- temporary PDF thumbnail artifacts
- stray `.DS_Store` files
- unreachable old invoice edit modal code
- unused helper functions left from older customer/invoice flow
