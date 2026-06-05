# JalaSai Changelog

Last updated: 2026-04-03

## 2026-04-03

### Reporting and filters
- Added `Closing Summary` sharing from Reports
- Closing summary now includes:
  - bikes added
  - invoices
  - done jobs
  - revenue
  - cash
  - UPI
  - expenses
  - net
- Added `Yesterday` filter to Reports
- Added `Yesterday` filter to Expenses

### Fast entry and billing
- Added chip-based mechanic selection across fast-entry flows
- Added chip-based payment method selection using `Cash` and `UPI`
- Added chip-based income type selection using `Regular` and `Other`
- Added service shortcut chips to Quick Invoice:
  - `Puncture`
  - `Brake`
  - `Oil`
  - `Wiring`
  - `Service`
- Added the same shortcut chips to manual income
- Added recent customer chips in Quick Invoice and Job Card
- Added recent bike chips in Quick Invoice and Job Card
- Added `Save & Next` in Job Card
- Added `Save as Job Card` inside Quick Invoice
- Added duplicate invoice number warning before save
- Added invoice number auto-suggestion from latest saved invoice number
- Removed `Collected By` from active invoice/job entry flows
- Added select-all-on-focus behavior for normal editable fields

### Billing and invoice behavior
- Added invoice date support in Quick Invoice
- Added invoice date editing in the full invoice flow
- Added discount support in Quick Invoice
- Added discount support in Job Card staging
- Added discount support in `Collect Payment`
- Expanded `Collect Payment` to allow clearing by discount, payment, or both
- Kept full invoice edit inside the main invoice form
- Removed old unreachable invoice edit modal code

### Jobs and dashboard
- Added optional invoice number on Job Card
- Added notes/remarks display on job dashboard cards
- Added one-tap `Invoice` shortcut on pending job cards

### Income and linking
- Exposed `+ Income` to normal users from Jobs dashboard
- Added optional invoice number to manual income
- Added linked-income visibility in invoice list
- Improved invoice reference matching for values like:
  - `0000`
  - `INV-0000`
  - `Invoice 0000`

### Cleanup and docs
- Removed stale helper code from older invoice/customer flow
- Removed temporary thumbnail files and stray `.DS_Store`
- Updated:
  - `OPERATIONS.md`
  - `PROJECT_REFERENCE.md`
  - `DEPLOYMENT.md`
  - `catalog/README.md`
- Added:
  - `PROJECT_HISTORY.md`
  - `CHANGELOG.md`

### Mobile polish
- Increased mobile touch target sizes
- Improved modal padding and stacking on small screens
- Improved chip wrapping on mobile
- Improved job/customer/mechanic card layout on phone
- Improved mobile table scrolling
- Improved toast placement on mobile

## 2026-04-02

### Navigation and visibility
- Restored `Invoices` near the front of navigation
- Moved `Print QR` under `Admin`
- Simplified report visibility for non-admin users
- Hid finance summaries from normal users where needed

### Quick Invoice and invoice workflow
- Added `Quick Invoice`
- Added sticky drafts for job and invoice forms
- Stopped accidental modal-close data loss on outside click
- Changed invoice edit to use the same main invoice form as invoice creation
- Added photo support to Quick Invoice
- Added full-screen image viewer for job/invoice photos
- Removed invoice photo from customer print/PDF
- Removed buying rate from printed invoice
- Removed manufacturer / supplier part no. line from printed invoice

### Customer and reminders
- Fixed customer card balance display to show real current balance
- Made invoice customer name open customer history popup in-place
- Added follow-up reminders:
  - feedback after 7 days
  - service reminder after 75 days
- Changed follow-up logic to ignore old imported history and start from new invoices only

### Income and reports
- Moved manual income into daily workflow from Jobs dashboard
- Included manual income in Jobs revenue and reports
- Simplified reports by removing extra trend display

### QR and printing
- Added multi-label support for same part in Print QR
- Improved Print QR layout so label count is visible and easier to use

## 2026-04-01

### Stock and part master
- Removed demo trial stock and cleanup-migrated saved data
- Simplified Add Part form
- Moved invoice-only part metadata under `More details`
- Added fitment models, manufacturer, supplier part no., and price history support
- Added photo reference support in jobs and invoices

### Supplier / catalog import direction
- Removed old supplier intake mediator UI from stock page
- Switched to `Import Agent JSON` for supplier invoice intake
- Added catalog CSV one-by-one review import
- Added pause/resume for catalog import review
- Added duplicate warning and update-vs-create choice during catalog import
- Added edit-before-confirm inside catalog review
- Added instant confirm to stock so imported parts can be searched immediately

### Search improvements
- Expanded stock search to include:
  - SKU
  - part name
  - supplier part no.
  - fitment models
  - typo / nearby spelling matches

### Catalog work
- Reconciled PDF, pasted text, and workbook catalog sources
- Built cleaned catalog outputs
- Built seed catalog outputs with fitment interpretation
- Produced final staged catalog files in `catalog/`

## Earlier foundation

### Base system
- Created static PWA garage management app
- Added jobs, invoices, stock, customers, expenses, reports, logs, and mechanics
- Added Supabase shared sync and login
- Added admin email-based access control
- Added stock receive, scanner-based part lookup, and QR label printing
