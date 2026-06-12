# JalaSai Garage System — Operations Guide

Last updated: 2026-06-07

Project history and implementation journey:
- [PROJECT_HISTORY.md](/Users/priyansh/Projects/JalaSai/PROJECT_HISTORY.md)
- [CHANGELOG.md](/Users/priyansh/Projects/JalaSai/CHANGELOG.md)

## Daily Screens

Main staff screens:
- `Jobs`
- `Invoices`
- `Stock`
- `Customers`
- `Scan`

Admin screens:
- `Admin`
  - `Reports`
  - `Expenses`
  - `Logs`
  - `Mechanics`
  - `Print QR`

Current admin emails:
- `1.priyannsh@gmail.com`
- `jalasaiautogarage@gmail.com`

## Fast Entry Flow

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
  - `N/A`
  - active mechanic names
- optional invoice number is available
- discount is available
- notes show on the Jobs dashboard card
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

## Customer Flow

### Customer cards
Customer cards now show:
- current balance
- status:
  - `Clear`
  - `Owe`
  - `Advance`

They do not show misleading lifetime amount in the balance badge anymore.

### Customer history from invoice list
On `Invoices`, clicking the customer name opens customer history in a popup on the same screen.
It does not switch tabs anymore.

### Follow-ups
Customer follow-up reminders now use only the new tracking period, not old imported history.

Rules:
- feedback due after 7 days from latest completed invoice
- service reminder due after 75 days
- new service resets the timer

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
Matching accepts flexible forms like:
- `4448`
- `004448`
- `INV-4448`
- `Invoice 4448`

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

### Stock in / out (2026-06-12 workflow)
Stock is reference data; the physical invoice book stays the billing source of truth.

- `Stock -> Receive Stock`: scan a bin sticker, then `+1` / `+5` / `Custom Qty`
- `Scan` page: scan a sticker to deduct stock (with optional job link and price override)
- **Batch scan** checkbox (next to Start Camera): camera stays running — each known sticker adds +1 in Receive Stock, or deducts −1 on the Scan page; the same sticker is ignored for 2.5 s so one label is not counted twice
- **Set Count** (Receive Stock card): type the actual shelf count for a scanned part; quantity is reset and an audited `recount` movement is logged — run a shelf walk monthly to manage drift
- The catalog CSV / agent JSON import pipeline was removed on 2026-06-12 (`docs/CLEANUP_AND_HARDENING_2026_06_12.md`); parts are added via `+ Add Part` or scan-to-create

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

## Cloud Sync Incident Response

If `Connect & Sync` shows:

```text
Supabase project URL or anon/publishable key may be wrong, or Supabase is not responding.
```

Check Supabase Project Status before rotating Cloudflare keys.

Project-side signs:
- Database, Auth, PostgREST, or Storage show `Unhealthy`
- Realtime logs mention `UnableToConnectToProject`, `UnableToConnectToTenantDatabase`, `DBConnection.ConnectionError`, or `connection not available`
- missing/bogus API keys return fast `401` responses, but the real anon key hangs or times out

Fast recovery:
1. Restart the Supabase database from the dashboard.
2. Wait 2-5 minutes.
3. Confirm Database, Auth, PostgREST, and Storage are healthy.
4. Retry `Connect & Sync`.

Incident reference:
- [docs/SUPABASE_PROJECT_UNHEALTHY_INCIDENT_2026_06_07.md](docs/SUPABASE_PROJECT_UNHEALTHY_INCIDENT_2026_06_07.md)

## Current Change History

Major implemented work up to now:
- added Supabase multi-device sync with admin email support
- removed demo trial stock and migration-cleaned old demo records
- added supplier invoice AI import direction and later simplified it to direct `Import Agent JSON` (entire import pipeline removed 2026-06-12)
- simplified Add Part form and moved invoice-only fields under `More details`
- improved stock search to include fitment, supplier part no., and typo matching
- added catalog import review flow with confirm/decline, pause/resume, previous, instant stock load, duplicate warning, and row editing (removed 2026-06-12)
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
