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
