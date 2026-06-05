# System Data Map

Last updated: 2026-04-23

This file documents the practical business data currently handled by JalaSai, how that data is used, and how it behaves in local-first and cloud-sync mode.

## Current Runtime Sync State

Current app/runtime behavior (2026-04-23):

- shadow tables are the live source of truth
- 15 shadow tables are mirrored on push; 14 tables are pulled into app state
- `garage_sync_heartbeat` drives realtime multi-device updates
- background sync interval is 30 seconds and falls back to stale-check pulls when realtime misses an event
- `garage_state` is a legacy backup target, not the live sync source
- legacy blob backup is not auto-written by the app runtime; Admin and Apps Script can still maintain it as a backup path
- date-sensitive defaults now follow `Asia/Kolkata`

## Purpose

Use this file when you want to understand:

- what data the app stores
- which data is business-critical
- what is local-only vs cloud-synced
- what is operational truth vs helper metadata
- what should be protected carefully during future changes

## System Rule

JalaSai is designed as:

- human-run
- local-first
- cloud-synced
- mobile-first

Business truth is entered by staff. The system stores it locally first, then syncs it to cloud when available.

## Current Cloud Model

JalaSai now uses shadow tables as the primary cloud storage:

- primary live sync: shadow-table mirror writes across 15 tables (`garage_customers`, `garage_jobs`, etc.)
- primary pull path: 14 active tables are read back into app state (`jobPayments` stays derived)
- legacy backup blob: `garage_state` JSON blob, maintained only when operators explicitly keep that path active

Safety rules:

- shadow tables are the active source of truth for all read and write operations
- push writes only changed rows to shadow tables (hash-based incremental upsert)
- pull reads all active rows from shadow tables; falls back to blob if tables are empty or unreachable
- missing rows are soft-deleted in shadow tables, not hard-deleted
- the app runtime does not auto-write `garage_state`
- Admin can manually copy the current table-synced dataset into `garage_state`
- Apps Script can still write `garage_state` as an external fallback when configured
- daily Drive backup reads from shadow tables at 10 PM IST; keeps last 30 days

## Data Domains

### 1. Jobs / Job Cards

Stored for open workshop work that is not yet fully completed or billed.

Typical fields:

- `id`
- `createdAt`
- `updatedAt`
- `customerId`
- `customerName`
- `phone`
- `bikeName`
- `registerNumber`
- `workDescription`
- `remarks`
- `status`
- `mechanic`
- `invoiceNumber` (optional while still a job card)
- `discount`
- `advancePaid`
- `paymentMethod`
- `parts[]`
- `photos[]`
- legacy `photo` compatibility field

Used in:

- Jobs dashboard
- open work tracking
- pending payment flow
- conversion into invoice
- mechanic allocation

### 2. Invoices

Stored for completed billing records.

Typical fields:

- `id`
- `jobId` (if converted from a job card)
- `invoiceNumber`
- `invoiceDate`
- `createdAt`
- `updatedAt`
- `customerId`
- `customerName`
- `phone`
- `bikeName`
- `registerNumber`
- `services / workDescription`
- `parts[]`
- `subtotal`
- `discount`
- `paid`
- `due`
- `paymentMethod`
- `notes`
- `photos[]`
- legacy `photo` compatibility field

Used in:

- Invoices page
- customer history
- revenue reporting
- due tracking
- reminder timing
- print/PDF generation

Important note:

- invoice photos are kept for internal reference and WhatsApp workflow
- invoice photos are not printed in the customer invoice PDF
- linked manual income shown on invoices is reference-only and uses exact invoice reference matching

### 3. Customers

Stored as the workshop’s customer master record.

Typical fields:

- `id`
- `createdAt`
- `updatedAt`
- `name`
- `phone`
- `email`
- `address`
- `notes`
- `lastBikeName`
- `visitCount`
- `balance`
- `vehicleHistory[]`
- follow-up helper metadata

Used in:

- customer suggestions
- customer history popup
- due / advance status
- recent customer chips
- service reminder logic
- feedback reminder logic

Data integrity notes:

- customer/job ownership is no longer inferred from loose name/phone/id matches alone
- live jobs are assigned through strict ownership helpers that reject phone/name conflicts
- Khatabook/opening-balance jobs are treated as imported balance records and stay separate unless they have strong matching evidence
- duplicate live customer IDs are repaired locally and synced back to shadow tables
- exact duplicate customer records are merged only when name and phone match, avoiding unsafe merges for shared family/workshop phone numbers
- customer vehicle lists are derived from jobs that still belong to the customer, so moved imported balances do not leave stale vehicles behind

### 4. Parts / Stock Master

Stored as the internal parts inventory catalog.

Typical fields:

- `id`
- `createdAt`
- `updatedAt`
- `name`
- `sku`
- `supplierPartNo`
- `manufacturer`
- `companyBrand`
- `bikeBrand`
- `fitmentModels[]`
- `fits` (compatibility mirror field)
- `variantSubtype`
- `category`
- `qty`
- `minStock`
- `buyPrice`
- `sellPrice`
- `lastBuyPrice`
- `lastSellPrice`
- `binLocation`
- `aliases[]`
- `notes`
- `photos[]`
- legacy `photo`

Used in:

- stock table
- job part search
- stock receive/import
- stock visual identification
- QR labels
- reorder list
- duplicate detection during catalog import

Important note:

- fitment search is now a first-class lookup path
- users should be able to find parts by name, SKU, supplier part number, or fitment model
- stock photos are internal reference only and are not printed on stock QR labels

### 5. Stock Movement Data

Stored to track how stock changes over time.

Typical fields:

- movement `id`
- `partId`
- `type`
- `qtyDelta`
- `beforeQty`
- `afterQty`
- `reason`
- `createdAt`
- `updatedAt`
- related `jobId` or invoice/import reference when available

Used in:

- auditability
- stock receive flow
- part usage from jobs
- negative stock visibility

### 6. Catalog Import Review Data

Stored during the CSV catalog review workflow before parts are fully accepted.

Typical fields:

- import session metadata
- source file name
- current review index
- confirmed rows
- declined rows
- review-later rows
- per-row edited values
- duplicate match decision
- selling price entered during review

Used in:

- `Import Catalog CSV`
- pause/resume flow
- one-by-one confirmation
- review-later list

Important note:

- confirmed parts can be added instantly during review
- the review session itself still remains resumable

### 7. Expenses

Stored for outgoing money records.

Typical fields:

- `id`
- `date`
- `createdAt`
- `updatedAt`
- `category`
- `amount`
- `method`
- `note`
- `photos[]`
- legacy `photo` compatibility field

Used in:

- Expenses screen
- daily / monthly expense totals
- net calculations
- receipt/photo reference

### 8. Manual Income

Stored for non-standard or side income that still affects daily collections.

Typical fields:

- `id`
- `mechanicId` (for `Regular` quick income)
- `mechanicName`
- `date`
- `createdAt`
- `updatedAt`
- `type`
- `amount`
- `method`
- `note`
- `invoiceNumber` reference (optional)

Current types:

- `regular_income`
- `other_income`

Used in:

- dashboard income shortcut
- revenue totals
- daily closing summary
- invoice-linked income reference

Important note:

- linked income is currently a reference link in invoice view
- it does not automatically rewrite invoice paid/due math

### 9. Mechanics

Stored as a simple master list for assignment.

Typical fields:

- `id`
- `name`
- `active`
- `createdAt`
- `updatedAt`

Used in:

- job card mechanic chips
- quick invoice mechanic chips
- reporting by mechanic
- mechanics screen period totals filtered by month, date, or year

### 10. Reports / Derived Analytics

These are mostly computed from primary records, not standalone business truth.

Derived values include:

- jobs added
- jobs done
- invoices count
- revenue
- cash
- UPI
- expenses
- net
- due totals
- reorder warnings
- stock value
- customer follow-up due counts

Used in:

- Reports
- Closing Summary
- dashboard cards
- WhatsApp summary sharing

## Shared Data Across Screens

### Photos

Multiple photos are now supported in:

- job cards
- invoices
- expenses
- stock items

Behavior:

- old single-photo records still remain compatible
- new records prefer `photos[]`
- first photo may still be mirrored into old fields for backward compatibility
- clicking a thumbnail opens the shared image viewer popup

### Notes / Remarks

Notes can exist in multiple domains:

- job remarks
- invoice notes
- customer notes
- expense notes
- income notes

These are operational notes, not accounting truth, but they are still important in real workshop work.

## Local-First Protection

Every save should behave like this:

1. data saved locally first
2. sync metadata updated locally
3. local recovery backup snapshot stored
4. cloud sync attempted later if session and internet are available

Current protection metadata includes:

- `pendingSync`
- `pendingSince`
- `lastSyncError`
- `localBackupAt`
- `lastPullAt`
- `lastPushAt`
- `lastRemoteUpdatedAt`
- `lastMergeSummary`
- `lastBlobBackupAt`
- `deviceId`

Purpose:

- avoid losing same-device work during internet failure
- keep a recoverable local snapshot
- retry syncing later without blocking staff workflow

## Cloud Sync Model

The system now favors preservation over overwrite.

Current practical rules:

- records are merged by `id`
- `updatedAt` helps choose newer record state
- local edits are not supposed to be replaced by a full stale snapshot from another device
- background sync retries quietly
- offline usage should continue locally

Important caution:

- delete behavior is still more sensitive than create/update behavior
- cloud sync is safer now, but future changes must continue protecting merge behavior carefully

## Business-Critical Data

These areas should be treated as highest risk during future code changes:

- jobs
- invoices
- stock quantities
- payments
- discounts
- invoice dates
- customer balances
- manual income
- expenses
- sync metadata

If these break, daily operations break.

## Helper / Secondary Data

These are useful but less critical than business truth:

- recent chips
- search history style helpers
- QR label state
- catalog review progress
- AI prompt helper state
- UI-only drafts

These can be rebuilt or cleared more safely than core billing/stock/customer data.

## Searchable Data Paths

Current practical search coverage includes:

- jobs by name, phone, vehicle, work, notes, register number, mechanic, invoice number, job id
- invoices by customer and invoice details
- customers by name and phone
- stock by part name, SKU, supplier part number, fitment, and typo-tolerant matching

This matters because search is a real operational data access path, not just a convenience feature.

Performance note:

- Customers search checks the full customer list, but the visible grid renders in batches to avoid creating thousands of cards during a tab switch
- Reminders and Customers use shared customer/job summary indexes to avoid repeated full job scans
- Invoices builds linked-income indexes once per render

## Follow-Up Data Rules

Customer reminders currently work from the new tracking period only.

Rules:

- feedback due: 7 days after latest completed invoice
- service due: 75 days after latest completed invoice
- new service resets the counter
- old imported customer history should not trigger fresh reminders automatically

### Reminders Tab Storage

The dedicated `Reminders` tab adds a per-customer state object that lives on the customer record itself, so it rides existing cloud sync without new tables.

Shape (`customer.reminders`):

- `feedback`: `{ jobId, sentAt, dismissedAt }` — anchored to the completed-invoice id; a newer completed job invalidates it automatically
- `service`: `{ jobId, sentAt, dismissedAt }` — same job-anchored model; sending a service reminder also writes `dismissedAt` on the matching `feedback` entry to suppress double-prompts
- `payment`: `{ sentAt, dismissedAt, snoozeUntil, snapshotTotal }` — 7-day snooze with a balance snapshot; the row reappears once `today >= snoozeUntil` or the current due total grows past `snapshotTotal`

A row counts as "active" only when its due-date condition is met *and* no matching `sentAt` / `dismissedAt` is recorded for the current cycle. Customers without `customer.reminders` behave identically to before — no migration is required.

## Current Reality

JalaSai is not just storing data for records. It is storing data to support daily workshop decisions:

- who is waiting
- what is due
- which part fits which bike
- what money came in
- what stock is low
- what happened on which date
- what still needs to be followed up

That is the right way to judge future changes: not by whether a field exists, but by whether workshop decisions remain clear and safe.
