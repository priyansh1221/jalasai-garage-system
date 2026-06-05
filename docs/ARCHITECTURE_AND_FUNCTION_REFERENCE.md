# JalaSai Project Architecture and Function Reference

Last updated: 2026-06-05

This document explains how the JalaSai Garage System is structured, how it works at runtime, and what every named project-owned function does.

Scope notes:

- Primary maintained runtime files are the root `index.html`, `style.css`, `sw.js`, `js/`, `NEW UI/index.html`, `NEW UI/style.css`, `supabase/schema.sql`, and `apps-script/` files.
- Both UI shells load the same root `js/` files. `deploy/` is generated output only and should not contain hand-maintained JS copies.
- `js/new-ui.js` is New UI-specific shell code and is documented separately.
- `js/vendor/supabase.js` and `js/vendor/lz-string.min.js` are third-party/minified dependencies, not JalaSai-owned functions.
- Anonymous callbacks inside event listeners, `map`, `filter`, promises, and inline HTML handlers are covered through the parent module/function.

## 1. Project Purpose

JalaSai is a static, mobile-first garage operations system for daily workshop work. It supports job cards, fast invoices, stock and catalog intake, customers, reminders, expenses, income, reports, QR/scan workflows, photo attachments, local offline storage, and Supabase-backed multi-device sync.

The app is intentionally framework-free:

- HTML defines screens, modals, controls, and inline bootstrap/photo/invoice helpers.
- CSS defines the responsive workshop UI.
- Plain JavaScript modules own business logic.
- Browser `localStorage` is the first write path.
- Supabase is the cloud sync and photo storage backend.
- A service worker makes the shell PWA/offline-friendly.
- Google Apps Script files provide optional spreadsheet/Drive backup integrations.

## 2. Runtime Architecture

### UI Layer

`index.html` is the main application shell. It contains page containers for Jobs, Invoices, Stock, Customers, Reminders, Scan, Admin, Reports, Expenses, Income, Mechanics, Logs, and Print QR. Navigation is handled by `showPage()` from `js/utils.js`.

The root page loads scripts in a global-script style. Modules share global arrays such as `jobs`, `stock`, `customers`, `mechanics`, `expenses`, `incomeEntries`, `partsLog`, and `auditLog`.

### Domain Modules

- `js/data.js`: shared state, normalization, persistence, counters, finance calculations, customer matching, reminders, admin helpers, and audit logging.
- `js/jobs.js`: job-card, quick-invoice, mechanic chips, invoice draft, payments, job board, and parts-on-job workflows.
- `js/stock.js`: stock table, search, QR labels support, catalog CSV review, agent JSON import, duplicate detection, and restocking.
- `js/customers.js`: customer list, customer history, customer edit, due/service/feedback WhatsApp reminders.
- `js/reminders.js`: consolidated reminder screen for feedback, service, and payment reminders.
- `js/mechanics.js`: mechanic CRUD and period revenue/workload summaries.
- `js/expenses.js`: expense and manual-income CRUD and date filtering.
- `js/reports.js`: analytics, KPIs, finance mix, logs, closing summary, and AI prompt helper.
- `js/scanner.js`: camera scanner and QR/SKU result handling.
- `js/print.js`: stock QR sticker printing and invoice printing/sharing.
- `js/sync.js`: Supabase auth, table sync, realtime heartbeat, merge logic, photo upload, backup, restore, and diagnostics.
- `js/utils.js`: navigation, modal history, access controls, toasts, pagination, QR payload parsing, and vehicle suggestions.

### Local-First Data Layer

The app writes business changes to browser memory first, then to `localStorage` through `saveAll()`. The local data remains usable offline. `saveAll()` supports scoped domain saves for hot paths, updates counters/metadata, marks UI tabs stale, stores compressed local snapshots for full saves, and queues cloud sync.

Main local storage keys are declared in `SK` inside `js/data.js`.

### Cloud Sync Layer

Supabase shadow tables are the active cloud source of truth. The frontend pushes table-wise rows such as customers, jobs, stock items, expenses, income entries, and audit logs. Each row keeps:

- extracted searchable columns,
- original `record_data` JSON,
- `source_hash`,
- `source_updated_at`,
- device/user metadata,
- optional `deleted_at` tombstone.

Pulls read live rows from shadow tables and rebuild local arrays. The legacy `garage_state` JSON blob remains as a manual backup path.

Realtime sync is driven by `garage_sync_heartbeat`. After a successful push, the device updates its heartbeat row; other devices receive realtime events and pull recent changes.

### Database Layer

`supabase/schema.sql` creates:

- legacy blob table: `garage_state`,
- shadow tables: `garage_customers`, `garage_mechanics`, `garage_jobs`, `garage_job_payments`, `garage_stock_items`, `garage_expenses`, `garage_income_entries`, `garage_parts_log`, `garage_audit_log`, `garage_review_items`, `garage_import_batches`, `garage_purchase_entries`, `garage_stock_movements`, `garage_supplier_catalog_map`, `garage_invoice_import_reviews`,
- sync support tables: `garage_sync_heartbeat`, `garage_sync_validation_runs`,
- performance indexes for common pull/search paths,
- RLS policies for authenticated access,
- storage bucket/policies for `job-photos`.

### PWA Layer

`sw.js` caches the app shell, root assets, root JS modules, vendor libraries, and New UI assets. It serves cached shell files during offline/navigation failures and refreshes cached same-origin assets when online.

### New UI Layer

`NEW UI/` is a visual shell around the same business modules. Its HTML loads the shared root `js/` files via `../js/...`. The New UI-specific `js/new-ui.js` adds hash routing, sidebar behavior, and a home dashboard.

## 3. Main Working Flow

1. Browser opens `index.html`.
2. The page starts an initial loading overlay.
3. Scripts load shared globals and modules.
4. Bootstrap calls `loadAll()`, applies date limits, initializes vehicle brands, binds sticky drafts/search UX, renders the current page, and starts Supabase sync.
5. Users create/edit jobs, invoices, stock items, customers, expenses, income, mechanics, reminders, or reports.
6. Each save path normalizes data and calls `saveAll()`.
7. `saveAll()` persists local data, records sync metadata, refreshes visible UI, and queues `pushGS()`.
8. `pushGS()` builds a payload, mirrors changed rows to Supabase shadow tables, updates heartbeat, and clears pending sync state.
9. Other signed-in devices receive realtime heartbeat/table changes and pull updates.
10. Reports, customer summaries, reminders, invoices, and stock screens derive their data from normalized local arrays.

## 4. Important Data Domains

- Jobs and invoices: one `jobs` array stores open work and completed invoices. Completed invoices are jobs with `status === 'done'`.
- Customers: `customers` stores master customer records plus reminder metadata.
- Stock: `stock` stores live inventory and catalog metadata.
- Mechanics: `mechanics` stores active/inactive mechanics.
- Expenses: `expenses` stores outgoing money.
- Income entries: `incomeEntries` stores manual income outside invoice payments.
- Parts log and movements: `partsLog` and `stockMovements` support stock audit/history.
- Audit log: `auditLog` records create/update/delete/reminder/payment/import actions.
- Review/import arrays: `reviewItems`, `importBatches`, `purchaseEntries`, `supplierCatalogMap`, and `invoiceImportReviews` support catalog and supplier import review.

## 5. File-Level Architecture

| File | Role |
| --- | --- |
| `index.html` | App shell, pages/modals, script bootstrap, invoice completion helpers, invoice list helpers, photo helpers. |
| `style.css` | Primary responsive styling. |
| `sw.js` | Service worker and app-shell cache. |
| `js/cloud-config.js` | Built-in Supabase project URL, anon key, and admin emails for this deployment. |
| `js/data.js` | Shared state, local persistence, normalization, calculations, matching, reminders, admin helpers. |
| `js/utils.js` | UI utilities, navigation, modal/back handling, admin access, pagination, QR payload helpers, vehicle suggestions. |
| `js/jobs.js` | Job board, quick invoice, job form, draft storage, mechanics/payment chips, part use, payments. |
| `js/stock.js` | Inventory UI, fuzzy-ish search helpers, catalog review/import, stock receiving, supplier import mapping. |
| `js/customers.js` | Customer search/list/detail/edit and customer WhatsApp reminder actions. |
| `js/reminders.js` | Unified reminders tab. |
| `js/mechanics.js` | Mechanics CRUD and period metrics. |
| `js/expenses.js` | Expenses and manual income pages. |
| `js/reports.js` | Business analytics, logs, closing summary, AI prompt drafting. |
| `js/scanner.js` | QR/SKU scanner via BarcodeDetector, ZXing, or jsQR fallback. |
| `js/print.js` | QR sticker sheet and invoice print/share. |
| `js/qrgen.js` | QR library loaded by printing/scanning flows; no project-owned named functions. |
| `supabase/schema.sql` | Database tables, indexes, RLS, storage bucket, helper SQL function. |
| `apps-script/JalaSaiSync.gs` | Optional Google Sheet JSON snapshot sync. |
| `apps-script/JalaSaiDriveBackup.gs` | Optional Supabase shadow-table backup to Google Drive/blob. |
| `js/new-ui.js` | New UI shell routing, sidebar, home dashboard. |

## 6. Function Reference

### `sw.js`

| Function | Details |
| --- | --- |
| `isSameOrigin(url)` | Returns whether a request URL belongs to the same origin as the app; used to decide cache/network behavior. |
| `normalizePathname(url)` | Converts request paths into the relative asset keys stored in `APP_ASSETS`. |
| `isAppShellRequest(request)` | Detects navigation and known app-shell asset requests that should use the shell caching strategy. |

### `index.html` inline runtime helpers

| Function | Details |
| --- | --- |
| `markDone(id)` | Opens the invoice completion modal for a job by preparing the done modal and showing `m-done`. |
| `escapeAttr(value)` | HTML-escapes text for safe insertion inside attributes/markup. |
| `escapeJsAttr(value)` | Escapes text for JavaScript string contexts used inside inline handlers. |
| `photoPreviewMarkup(url, title)` | Builds clickable image preview HTML for a single photo URL. |
| `normalizePhotoArray(value)` | Converts arrays, JSON-stringified arrays, single strings, or empty values into a clean photo URL array. |
| `photoMetaForPreview(previewId)` | Maps photo preview element IDs to display title and draft persistence kind. |
| `getPhotoPreviewList(previewId)` | Reads the current photo list from a preview element dataset. It is defined twice identically; the second browser definition wins. |
| `photoGalleryMarkup(previewId, urls, title, persistKind)` | Builds the multi-photo gallery with optional remove buttons. It is defined twice identically; the second browser definition wins. |
| `photoPlaceholderMarkup(previewId)` | Returns placeholder text for job, invoice, expense, quick invoice, or stock photo pickers. |
| `setPhotoPreview(previewId, url, title)` | Convenience wrapper that sets a single-photo preview through `setPhotoPreviewList()`. |
| `setPhotoPreviewList(previewId, urls, title)` | Updates preview element datasets and renders the gallery/placeholder. |
| `triggerPhotoPicker(inputId, persistKind, event, mode)` | Opens a hidden file input in camera or library mode while preserving sticky drafts. |
| `setPhotoInputCapture(inputId, mode)` | Adds/removes mobile camera capture behavior on a file input. |
| `openPhotoCamera(inputId, persistKind, event)` | Opens the photo picker configured for rear camera capture. |
| `openPhotoLibrary(inputId, persistKind, event)` | Opens the photo picker configured for normal gallery/library selection. |
| `removePhotoFromPreview(previewId, index, persistKind)` | Removes one photo from a preview and updates the related draft. |
| `clearPhotoUpload(previewId, inputId, persistKind)` | Clears a preview/input pair and marks the photo as removed. |
| `persistPhotoDraftForPreview(previewId)` | Persists the correct sticky draft after photo changes. |
| `selectInputText(input)` | Selects all text in an input on the next animation frame. |
| `bindSearchAutoSelect()` | Binds focus auto-select behavior to search boxes. |
| `bindEditableAutoSelect()` | Binds focus auto-select behavior to editable inputs/textareas, skipping file/date/checkbox/radio. |
| `openAiAssistModal(title, prompt, options)` | Opens the AI-assist prompt-copy modal with optional result-apply target. |
| `copyAiAssistPrompt()` | Copies the generated AI prompt to clipboard or selects it for manual copy. |
| `applyAiAssistResult()` | Applies pasted AI output to the target input/textarea and closes the modal. |
| `openImageViewer(src, title)` | Opens the image viewer modal for a selected photo. |
| `prepareDoneModal(id, mode)` | Hydrates invoice completion/edit fields from a job and restores invoice drafts. |
| `refreshDoneBalanceSummary()` | Recalculates invoice total, discount, payment, due, and available customer advance in the done modal. |
| `applyCustomerAdvanceToDone()` | Applies available customer advance toward the invoice amount in the done modal. |
| `confirmDone(nextAction)` | Completes or edits an invoice, validates duplicate invoice numbers, handles payments/advance/discounts/photos, logs the action, saves, and optionally opens the next workflow. |
| `normalizeInvoiceRef(value)` | Produces a normalized invoice reference string for matching/sorting. |
| `invoiceRefMatches(left, right)` | Returns whether two invoice references loosely match by normalized text or digit suffixes. |
| `invoiceRefExactMatch(left, right)` | Returns whether two invoice references exactly match by normalized text or exact digits. |
| `invoicePendingDot(jobId)` | Returns the tiny pending-sync dot markup for optimistic invoice rows while background sync is still in flight. |
| `invoiceSortParts(job)` | Extracts numeric and text sort keys from a job/invoice reference. |
| `compareInvoiceNumbers(leftJob, rightJob)` | Compares invoice references numerically first, then by text. |
| `invoiceDefaultSortDir(col)` | Returns the default descending sort direction for invoice columns. |
| `invoiceRecentSortValue(job)` | Returns a timestamp used for recent invoice sorting. |
| `linkedRegularIncomeForInvoice(invoiceNo)` | Finds manual income entries linked to a given invoice number. |
| `buildLinkedIncomeInvoiceIndex()` | Pre-indexes income entries by normalized invoice key and digits for faster invoice rendering. |
| `linkedRegularIncomeForInvoiceFromIndex(invoiceNo, index)` | Looks up linked income entries using the prebuilt invoice index. |
| `invoiceTableColumnsHtml(arw)` | Builds invoice table header markup for the virtual invoice table. |
| `invoiceTableRowHtml(j, linkedIncomeIndex)` | Builds one invoice row for the virtual invoice table. |
| `renderInvoices()` | Renders invoice stats, filtering, sorting, linked income, invoice actions, and a 25-row virtual table. |
| `sortInvoices(col)` | Toggles invoice sort column/direction and rerenders invoices. |
| `setInvoiceSort(col)` | Sets invoice sort from a selector and rerenders. |
| `filterInvoices(q)` | Updates invoice search text and debounced rerendering. |
| `openInvoiceEdit(id)` | Opens the done modal in invoice-edit mode after admin access checks. |
| `removeInvoice(id)` | Admin-only action that reopens a completed invoice as a ready job and clears invoice fields. |
| `toggleDoneJobs()` | Shows or hides today’s completed jobs section. |
| `renderDoneJobs()` | Renders today’s completed jobs cards below the job board. |
| `handlePhotoUpload(input, previewId)` | Compresses selected images, uploads to cloud when signed in or stores data URLs locally, then updates previews and drafts. |
| `blobToDataUrl(blob)` | Converts a Blob into a base64 data URL. |
| `compressImageFile(file, maxW, maxH, quality)` | Resizes/compresses an image file into a JPEG Blob for storage/upload. |

### `js/data.js`

| Function | Details |
| --- | --- |
| `businessDate(offsetDays)` | Returns the current business date in `Asia/Kolkata`, optionally shifted by days. |
| `today()` | Returns today’s business date. |
| `yesterday()` | Returns yesterday’s business date. |
| `textLooksLikeSample(value)` | Detects demo/sample/dummy/test text. |
| `recordLooksLikeSample(record, fields)` | Detects sample records by flags, import source, or sample-looking field text. |
| `installAppStateView()` | Installs `window.appState` getters over the live global arrays and stale-tab state. |
| `markTabStale(page)` | Marks a page as needing rerender after data changes. |
| `markAppTabsStale(pages)` | Marks multiple app tabs stale. |
| `isAppTabStale(page)` | Returns whether a page is stale. |
| `markAppTabFresh(page)` | Clears stale state for one page. |
| `markDataChanged(reason)` | Installs app state, marks tabs stale, and increments the shared data version. |
| `optimisticInvoiceSet()` | Returns the shared in-memory `Set` used to track invoices shown optimistically before sync confirmation arrives. |
| `isOptimisticInvoice(id)` | Returns whether an invoice/job ID is currently flagged as optimistic/pending sync. |
| `markOptimisticInvoice(id)` | Flags an invoice as optimistic, marks the invoices page stale, and rerenders it when that page is visible. |
| `clearOptimisticInvoices(ids)` | Clears one, many, or all optimistic invoice flags after successful sync and refreshes the invoices page when needed. |
| `nowISO()` | Returns the current timestamp as ISO. |
| `deviceShortId()` | Returns a short readable suffix of the device ID. |
| `encodeLocalStorageJson(value)` | JSON-serializes data and compresses large payloads with LZString when available. |
| `parseLocalStorageJson(raw)` | Parses normal or compressed localStorage JSON. |
| `isLocalStorageQuotaError(err)` | Detects browser storage quota errors. |
| `clearLargeLocalBackupKeys()` | Removes large backup keys to recover localStorage space. |
| `setLocalStorageSafe(key, value)` | Safely writes to localStorage with quota recovery fallback. |
| `persistLocalBackupPayload(payload)` | Stores a compact latest local backup snapshot. |
| `persistBeforePullBackup(payload)` | Stores a backup immediately before cloud pull/merge operations. |
| `saveDomainKeySet(domain)` | Converts a save domain or domain list into the localStorage key set that must be written. |
| `saveAll(options)` | Updates sync metadata, persists either a scoped domain or all local data, records pending cloud state, refreshes sync UI, and queues sync. |
| `loadAll()` | Loads local data from storage, normalizes it, purges sample/demo records, repairs customer data, and prepares runtime arrays. |
| `dataMaintenanceCleanupDone()` | Checks whether the current boot-time data maintenance cleanup version has already run. |
| `markDataMaintenanceCleanupDone()` | Stores the current cleanup version so routine maintenance is not repeated unnecessarily. |
| `runDataMaintenanceCleanup(options)` | Runs background data maintenance: mechanic recovery, seeded/demo cleanup, temporary job purge, customer tidying, optional save/render, and timing logs. |
| `scheduleDataMaintenanceCleanup(options)` | Schedules data maintenance after startup using delay/idle timing. |
| `nextInvoiceNo()` | Returns and increments the legacy invoice counter. |
| `simpleInvoiceNumber(value)` | Extracts a clean numeric invoice number string. |
| `suggestedNextInvoiceNo()` | Suggests the next invoice number based on the highest existing invoice/counter. |
| `stSt(s)` | Computes stock status: out, low, or ok. |
| `stLbl(st)` | Converts stock status into a display label. |
| `fmtMoney(value)` | Formats a number as Indian rupee currency text. |
| `fmtDate(value)` | Formats a date/timestamp for display. |
| `fmtDateTime(value)` | Formats a timestamp with date and time. |
| `isMechanicPlaceholderValue(value)` | Detects invalid placeholder mechanic values. |
| `findMechanicByIdOrName(value)` | Finds a live mechanic by ID or normalized name. |
| `canonicalMechanicIds(values)` | Converts mechanic names/IDs into canonical live mechanic IDs. |
| `mechanicReferenceNames(value)` | Resolves stored mechanic references into readable names. |
| `normalizeJob(j)` | Normalizes job/invoice shape, dates, mechanic IDs, parts, payments, photos, compatibility fields, and the cached `_searchText` used by invoice/job search. |
| `isLiveJob(j)` | Returns whether a job is not deleted/tombstoned. |
| `hasJobFieldValue(job)` | Checks whether a job contains meaningful business field values. |
| `isNonWorkshopJobRecord(job)` | Detects imported/non-workshop records that should not behave like active jobs. |
| `isTemporaryVerificationJob(job)` | Detects short-lived verification/test jobs. |
| `purgeTemporaryVerificationJobs()` | Removes temporary verification jobs from local state. |
| `isPlaceholderOpenJob(job)` | Detects placeholder open jobs without real work data. |
| `jobDateMillis(job)` | Converts a job date/stamp into milliseconds for aging logic. |
| `isStaleOpenJob(job)` | Detects old open jobs that should not count as active workshop work. |
| `isActiveWorkshopJob(job)` | Returns whether a job is live, open, and operationally active. |
| `isFutureBusinessDate(value)` | Detects dates after today’s business date. |
| `requireNotFutureBusinessDate(value, label)` | Blocks future-dated entries and shows a toast. |
| `applyDataEntryDateLimits()` | Applies maximum date limits to date inputs. |
| `ensureSharedSyncOverlay()` | Creates/fetches the initial loading/sync overlay element. |
| `hasLocalBusinessDataSnapshot()` | Returns whether local storage has usable business data. |
| `startInitialDataLoadOverlay(message, options)` | Displays the startup loading overlay. |
| `finishInitialDataLoadOverlay()` | Hides the startup loading overlay. |
| `finishInitialDataLoadAndRender()` | Completes initial load and renders the current page. |
| `isWarmUiSwitchNavigation()` | Detects whether navigation came from old/new UI switching. |
| `consumeWarmUiSwitchNavigation()` | Clears and returns UI-switch navigation state. |
| `updateSharedSyncOverlay(message)` | Updates loading/sync overlay text. |
| `switchUiMode(path)` | Saves local data then navigates between old and new UI paths. |
| `warmUiMode(path)` | Prefetches/warms the alternate UI path before switching. |
| `normalizeExpense(e)` | Normalizes expense records and photo/date compatibility fields. |
| `isLiveExpense(e)` | Returns whether an expense is not deleted. |
| `normalizeCustomer(c)` | Normalizes customer shape, names, phone, vehicle list, reminders, timestamps, and compatibility fields. |
| `normalizeCustomerReminders(reminders)` | Normalizes customer reminder metadata for feedback/service/payment flows. |
| `isLiveCustomer(c)` | Returns whether a customer is not deleted. |
| `isKnownNonCustomerId(id)` | Detects placeholder or non-customer IDs. |
| `normalizeIncomeEntry(entry)` | Normalizes manual income fields, dates, mechanic references, invoice links, and deletion state. |
| `isLiveIncomeEntry(entry)` | Returns whether an income entry is not deleted. |
| `uniqStrings(values)` | Deduplicates string arrays while keeping order. |
| `normalizeStringList(value)` | Converts strings/arrays into clean unique string lists. |
| `normalizedAdminEmailList(value)` | Normalizes configured admin emails. |
| `stockSearchIndexText(item)` | Builds searchable stock text from name, SKU, supplier number, fitment, aliases, and notes. |
| `normalizeSupplierMapEntry(entry)` | Normalizes supplier catalog mapping records. |
| `normalizeStockItem(s)` | Normalizes stock item fields, prices, quantities, photos, aliases, fitment, and search index text. |
| `isLiveStockItem(s)` | Returns whether a stock item is not deleted. |
| `normalizeMechanic(m)` | Normalizes mechanic records, active state, color, and timestamps. |
| `isLiveMechanic(m)` | Returns whether a mechanic is not deleted. |
| `mechanicColorFromName(name)` | Generates a stable color from a mechanic name. |
| `legacyMechanicId(value)` | Creates a deterministic legacy mechanic ID from old mechanic labels. |
| `recoverMechanicsFromReferences()` | Rebuilds missing mechanic records from job/income references. |
| `normalizePurchaseEntry(entry)` | Normalizes supplier purchase/import line records. |
| `normalizeStockMovement(entry)` | Normalizes stock movement audit rows. |
| `normalizeSupplierCatalogMap(entry)` | Normalizes supplier-to-stock mapping records. |
| `normalizeInvoiceImportReview(entry)` | Normalizes invoice import review records. |
| `isDemoStockItem(item)` | Detects demo stock SKUs/items. |
| `purgeDemoStockData()` | Removes demo stock data and related demo artifacts. |
| `purgeSeededSampleData()` | Removes sample/demo data across records. |
| `tidyCustomerRecords()` | Repairs duplicate/customer identity issues, rebuilds customer vehicle lists, and safely merges exact duplicates. |
| `jobSubtotal(j)` | Computes job subtotal before discount/override. |
| `jobDiscountAmount(j)` | Computes stored discount amount. |
| `jobTotal(j)` | Computes final invoice/job total after discount/override. |
| `jobPaid(j)` | Computes total paid amount from payments or legacy fields. |
| `jobNetBalance(j)` | Computes total minus paid. |
| `jobDue(j)` | Returns positive due amount. |
| `jobAdvance(j)` | Returns positive advance amount. |
| `resolveBalanceState(amount)` | Converts a signed balance into due/advance/clear state. |
| `balanceStateMeta(amountOrState)` | Returns display label/color metadata for due/advance/clear balances. |
| `customerPhoneKey(value)` | Normalizes customer phone digits for matching. |
| `isUsableCustomerPhone(value)` | Checks whether a phone is strong enough for identity matching. |
| `customerNameKey(value)` | Normalizes customer names for matching. |
| `isWeakCustomerName(value)` | Detects generic/weak customer names. |
| `strongCustomerNameKey(value)` | Returns a strong normalized customer name or empty if weak. |
| `customerNameTokens(value)` | Splits customer names into useful matching tokens. |
| `jobLooksLikeOpeningBalance(job)` | Detects imported opening-balance/Khatabook-style records. |
| `jobIdentityName(job)` | Returns the best identity name for a job. |
| `customerHasOpeningBalanceEvidence(customer, job)` | Checks if an opening-balance job has enough evidence to belong to a customer. |
| `customerNamesConflict(left, right)` | Detects conflicting customer names. |
| `buildCustomerMatchIndex(customerList)` | Builds indexes by ID, phone, strong name, and name tokens for fast customer matching. |
| `addCustomerToMatchIndex(index, customer)` | Adds one customer to a match index. |
| `bestCustomerByNameTokens(name, index)` | Finds the best customer using token overlap. |
| `customerJobIdentityConflict(customer, job)` | Detects whether a job conflicts with a customer’s phone/name identity. |
| `customerMatchesJob(customer, job, options)` | Determines whether a job belongs to a customer using safe ID/phone/name rules. |
| `bestCustomerForJob(job, index, options)` | Finds the best owning customer for a job. |
| `jobSummaryStamp(job)` | Builds a stable stamp used for customer summary cache/identity. |
| `buildCustomerJobSummaryIndex(customerList, jobList, options)` | Builds per-customer job summaries, totals, dues, advances, visits, and active counts. |
| `customerJobsForBalance(custId, options)` | Returns jobs used to calculate a customer balance. |
| `addDaysToDate(dateValue, days)` | Adds days to a date string. |
| `daysSinceDate(dateValue)` | Returns elapsed days since a date. |
| `customerCompletedJobs(custId)` | Returns completed jobs/invoices for a customer. |
| `latestCustomerServiceJob(custId)` | Returns the latest completed service job for a customer. |
| `customerFollowupStatusFromJobs(customer, customerJobs)` | Computes feedback/service reminder due state from a customer’s jobs. |
| `customerFollowupStatus(custId)` | Computes follow-up state for a customer ID. |
| `customerPaymentReminderStatusFromJobs(customer, customerJobs)` | Computes payment reminder due/hidden state from balance and reminder metadata. |
| `customerPaymentReminderStatus(custId)` | Computes payment reminder state for a customer ID. |
| `markCustomerReminder(custId, type, action, extra)` | Records reminder sent/dismissed metadata on a customer. |
| `clearCustomerReminder(custId, type)` | Clears reminder metadata for a customer/type. |
| `customerBalance(custId, options)` | Returns signed customer balance. |
| `customerDueAmount(custId, options)` | Returns positive due balance for a customer. |
| `customerAdvanceAmount(custId, options)` | Returns positive advance balance for a customer. |
| `jobPaymentEntries(j)` | Converts job payments/paid fields into normalized revenue entries. |
| `allRevenueEntries()` | Builds all revenue entries from invoices, payments, and manual income. |
| `actorEmail()` | Returns the current cloud email or local actor label. |
| `adminEmails()` | Returns normalized admin email configuration. |
| `isAdminUser(email)` | Checks whether an email/current user is admin. |
| `ensureCurrentUserIsAdmin()` | Enforces admin-only state after auth changes. |
| `logAction(action, entity, entityId, details)` | Adds an audit log entry. |
| `nextJobId()` | Returns the next formatted job ID. |
| `nextId(prefix)` | Returns a unique local ID with prefix, timestamp, sequence, and device suffix. |

### `js/utils.js`

| Function | Details |
| --- | --- |
| `debouncePerf(key, fn, ms)` | Debounces expensive UI work by string key. |
| `flushDebouncePerf(key)` | Cancels a pending keyed debounce. |
| `persistLastPageSoon(page)` | Persists the current page after a short delay. |
| `addOnceListener(target, event, key, handler, options)` | Registers an event listener once per key/event pair. |
| `toast(msg, dur)` | Shows the global toast message. |
| `hasModalBack(modalId)` | Checks whether a modal has a back-history restore entry. |
| `updateBackButtons()` | Updates nav/detail/invoice/customer back button visibility. |
| `pushModalHistory(modalId, restore)` | Adds a modal back-history restore function. |
| `clearModalHistory(modalId)` | Clears back-history entries for a modal. |
| `modalBack(modalId)` | Closes a modal and restores the previous modal/detail state. |
| `goBack()` | Handles global back behavior across modals and pages. |
| `openM(id)` | Opens a modal overlay. |
| `closeM(id)` | Closes a modal overlay and clears its modal history. |
| `refreshAccessControls()` | Shows/hides admin-only controls based on the signed-in admin state. |
| `requireAdminAccess(actionLabel)` | Enforces admin-only action permission. |
| `hasReportsAccess()` | Checks the session Reports password gate. |
| `ensureReportsAccess()` | Prompts for the Reports password and stores session access. |
| `skeletonLine(width)` | Returns one shimmering skeleton bar used inside table placeholder rows. |
| `invoiceSkeletonTable(count)` | Builds invoice-table skeleton markup shown for one frame during page switches before real invoice rows paint. |
| `stockSkeletonRows(count)` | Builds stock-table skeleton rows shown during warm page transitions. |
| `renderPageSkeleton(page)` | Injects the appropriate skeleton placeholder for invoice or stock pages during stale-page navigation. |
| `showPage(p, options)` | Main page router: access checks, history, active classes, page-fade transition setup, one-frame skeleton rendering for stale pages, route updates, scanner stop, and page render dispatch. |
| `resetLongListPage(key)` | Resets a paginated list to page 1. |
| `paginatedLongList(key, items)` | Returns current page slice and pagination metadata for large lists. |
| `longListPagerHtml(key, info, pageName)` | Builds pagination controls. |
| `setLongListPage(key, page, pageName)` | Changes a paginated list page and rerenders. |
| `renderCurrentPage()` | Rerenders the current active page. |
| `resetVirtualTable(key)` | Resets stored scroll/start state for a virtual table. |
| `virtualTableHtml(key, columnsHtml, minWidth)` | Builds the shell markup for a virtualized table. |
| `updateVirtualTable(key)` | Calculates the visible 25-row window and renders spacer rows plus visible rows. |
| `renderVirtualTable(options)` | Shared vanilla virtual table renderer used by large tables such as invoices and stock, keeping only the visible 25-row window in the DOM. |
| `buildPartQRPayload(part)` | Builds encoded QR payload data for a stock part. |
| `extractScannedSku(raw)` | Extracts a SKU from QR JSON or raw scanned text. |
| `initVehicleBrands()` | Initializes vehicle brand/model suggestion data. |
| `vehicleSuggestionValues()` | Returns unique known vehicle suggestions. |
| `normalizeVehicleQuery(value)` | Normalizes vehicle text for suggestion matching. |
| `suggestVehicleName(value)` | Returns the best suggested vehicle name for a query. |
| `setVehicleValue(inputId, value)` | Sets a vehicle input and dispatches change/input events. |
| `updateDuesBadge()` | Updates the pending-dues status badge. |

### `js/jobs.js`

| Function | Details |
| --- | --- |
| `runAfterFastEntryPaint(fn)` | Runs hydration after one/two animation frames so form UI paints first. |
| `fastEntryDataSignature(scope)` | Builds cache signatures for fast-entry suggestion data. |
| `fastEntryPhoneKey(value)` | Normalizes phone digits for fast-entry matching. |
| `fastEntryNameKey(value)` | Normalizes names for fast-entry matching. |
| `customerSuggestionSignature()` | Builds cache signature for customer suggestions. |
| `customerSuggestionIndex()` | Builds/caches searchable customer suggestion entries. |
| `previewPhotoList(previewId)` | Reads photo list from preview UI. |
| `jobPhotoList(job, kind)` | Returns job or invoice photos from modern/legacy fields. |
| `jobPhotoGalleryMarkup(job, kind, title)` | Builds photo gallery markup for job/invoice details. |
| `photoThumbWithCount(urls, title)` | Builds a compact photo thumbnail with extra-count badge. |
| `invoiceDateTime(invoiceDate, fallbackTime)` | Combines invoice date and time into an ISO-like timestamp. |
| `getStoredPaymentMethod()` | Reads last-used payment method. |
| `rememberPaymentMethod(method)` | Persists last-used payment method. |
| `invoiceRefKey(value)` | Normalizes invoice references for strict duplicate checks. |
| `simpleInvoiceNumber(value)` | Extracts a simple numeric invoice number. |
| `invoiceRefsStrictMatch(left, right)` | Strictly compares invoice references by normalized key/simple number. |
| `findDuplicateInvoiceNumber(rawValue, excludeJobId)` | Finds an existing completed invoice with the same number. |
| `invoiceNumberExists(rawValue, excludeJobId)` | Boolean wrapper around duplicate invoice search. |
| `mechanicChoices()` | Builds active mechanic option list. |
| `parseMechanicIds(value)` | Parses comma-separated mechanic references into canonical IDs. |
| `setInvoiceDateShortcut(inputId, mode)` | Sets invoice date to today/yesterday or opens date picker. |
| `mechanicNamesFromIds(ids)` | Resolves mechanic IDs into display names. |
| `mechanicValueString(ids)` | Serializes mechanic IDs for form fields. |
| `jobMechanicIds(job)` | Extracts canonical mechanic IDs from a job. |
| `mechanicLabel(value)` | Returns display label for mechanic reference. |
| `toggleMechanicChipValue(inputId, id, multi)` | Toggles mechanic chip selections in hidden input fields. |
| `recentCustomerList()` | Builds/caches recent customer suggestions. |
| `recentBikeList(customerId)` | Builds/caches recent vehicle suggestions. |
| `renderChoiceChips(containerId, options, current, onClick, optionsObj)` | Generic chip renderer for choices. |
| `setChoiceChipValue(inputId, value, renderFn)` | Sets a chip-backed input and rerenders chips. |
| `renderJobMechanicChips()` | Renders mechanic chips on the job form. |
| `renderQuickInvoiceMechanicChips()` | Renders mechanic chips on quick invoice. |
| `renderMechanicChoiceChips(containerId, inputId, multi)` | Shared mechanic chip renderer. |
| `renderQuickInvoicePaymentChips()` | Renders quick-invoice payment method chips. |
| `renderDonePaymentChips()` | Renders invoice-completion payment chips. |
| `renderPaymentMethodChips(containerId, inputId, current)` | Shared payment chip renderer. |
| `renderIncomeTypeChips()` | Renders manual income type chips. |
| `renderIncomeMethodChips()` | Renders manual income payment method chips. |
| `renderIncomeMechanicChips()` | Renders income mechanic chips. |
| `syncIncomeEntryFields()` | Keeps income form fields/chips synchronized. |
| `renderRecentCustomerChips()` | Renders recent customer shortcut chips. |
| `renderRecentBikeChips()` | Renders recent bike shortcut chips. |
| `applyRecentBike(value)` | Applies a recent bike to the active form. |
| `renderServiceShortcutChips()` | Renders service shortcut chips. |
| `applyServiceShortcut(value)` | Applies a service shortcut to the active work field. |
| `appendShortcutValue(inputId, value)` | Appends shortcut text to an input/textarea. |
| `aiPromptValue(value)` | Cleans text for AI prompt construction. |
| `openAiPrompt(title, prompt, options)` | Opens the shared AI-assist modal with a prompt. |
| `aiCleanJobProblem()` | Builds an AI prompt to clean job problem text. |
| `aiCleanJobNotes()` | Builds an AI prompt to clean job notes. |
| `aiCleanQuickInvoiceWork()` | Builds an AI prompt for quick-invoice work text. |
| `aiCleanQuickInvoiceNotes()` | Builds an AI prompt for quick-invoice notes. |
| `aiCleanInvoiceCompletionNotes()` | Builds an AI prompt for invoice completion notes. |
| `renderIncomeServiceChips()` | Renders income service shortcut chips. |
| `applyIncomeShortcut(value)` | Applies a shortcut to manual income notes/category. |
| `prefillCustomerFromSearch(customer, prefix)` | Fills customer/vehicle fields from a selected customer. |
| `customerSearchMatches(query, limit)` | Searches customers for form suggestions. |
| `cheapCustomerSearchMatches(query, limit)` | Faster lightweight customer search path. |
| `quickInvoiceSuggestionQueryReady(query)` | Checks whether quick-invoice query is long enough to search. |
| `matchingCustomers(query, limit)` | Returns matching customer suggestions. |
| `customerSearchHint(query)` | Builds helper text for customer search status. |
| `jobDraftStorageKey()` | Returns the sticky job draft storage key. |
| `invoiceDraftStorageKey(jobId, mode)` | Returns the sticky invoice draft storage key. |
| `captureJobDraft()` | Reads current job form values into a draft object. |
| `persistJobDraft()` | Persists current job draft. |
| `clearJobDraft()` | Clears job draft storage. |
| `restoreJobDraft()` | Restores job form draft values. |
| `bindStickyJobDrafts()` | Binds job form fields to draft persistence. |
| `captureInvoiceDraft()` | Reads invoice completion fields into a draft. |
| `persistInvoiceDraft()` | Persists invoice completion/edit draft. |
| `restoreInvoiceDraft(jobId, mode)` | Restores invoice draft for a job/mode. |
| `clearInvoiceDraft(jobId, mode)` | Clears invoice draft. |
| `bindStickyInvoiceDrafts()` | Binds invoice form fields to draft persistence. |
| `nextInvoiceCandidate(excludeJobId)` | Finds the next ready job candidate for invoicing. |
| `refreshQuickInvoiceCustomerSuggestions()` | Refreshes quick-invoice customer suggestions. |
| `renderQuickInvoiceCustomerResults(matches, query)` | Renders quick-invoice customer match list. |
| `clearQuickInvoiceCustomer()` | Clears selected quick-invoice customer. |
| `selectQuickInvoiceCustomer(id)` | Selects a customer for quick invoice. |
| `prefillQuickInvoiceManualCustomer()` | Applies manually typed quick-invoice customer details. |
| `filterQuickInvoiceCustomer(query)` | Searches customer suggestions for quick invoice. |
| `onQuickInvoiceCustomerNameInput()` | Handles quick-invoice customer-name typing. |
| `captureQuickInvoiceDraft()` | Reads quick-invoice form into a draft object. |
| `persistQuickInvoiceDraft()` | Persists quick-invoice draft. |
| `scheduleQuickInvoiceDraftSave()` | Debounces quick-invoice draft saving. |
| `clearQuickInvoiceDraft()` | Clears quick-invoice draft. |
| `restoreQuickInvoiceDraft()` | Restores quick-invoice draft values. |
| `bindStickyQuickInvoiceDrafts()` | Binds quick-invoice inputs to draft persistence. |
| `resetQuickInvoiceForm()` | Resets quick-invoice modal fields. |
| `openQuickInvoice()` | Opens and hydrates quick-invoice modal. |
| `saveQuickInvoice()` | Creates a completed invoice/job directly from the quick-invoice form, updates customer/stock/payments, logs, saves, and syncs. |
| `jobDateTimeValue(job)` | Returns a timestamp value used for job sorting. |
| `jobCreatedLabel(job)` | Returns a readable created/date label. |
| `invoiceSortValue(job)` | Returns timestamp value for invoice/job sorting. |
| `refreshCustomerSuggestions()` | Refreshes job-form customer suggestions. |
| `renderJobCustomerSearchResults(matches, query)` | Renders customer search results in the job form. |
| `filterJobCustomerSearch(query)` | Searches customers from the job form. |
| `clearJobCustomerSelection()` | Clears selected job-form customer. |
| `selectJobCustomer(id)` | Applies a selected customer to the job form. |
| `onCustomerNameInput()` | Handles typing in the job customer name field. |
| `matchesJobSearch(job, query)` | Checks whether a job matches job board search. |
| `selectedJobStatuses()` | Returns selected status filters. |
| `updateJobStatusFilterButton()` | Updates status filter button label/check state. |
| `toggleJobStatusFilterMenu()` | Opens/closes job status filter menu. |
| `toggleAllJobStatuses(checked)` | Selects/deselects all job statuses. |
| `toggleJobStatusOption(status, checked)` | Toggles one job status filter. |
| `renderJobs()` | Renders job board, filters, done section counters, stats, mechanics filter, and active cards. |
| `jobCard(j)` | Builds one job-card HTML block. |
| `updateStats()` | Updates job board counts and today revenue stats. |
| `todayRevenueBreakdownData()` | Builds revenue breakdown data for today. |
| `openTodayRevenueBreakdown()` | Opens the revenue breakdown modal. |
| `viewJobFromTodayRevenue(jobId)` | Opens a job/invoice from the revenue breakdown. |
| `openInvoiceFromJobDetail(jobId)` | Opens invoice from a job detail modal. |
| `filterJobs(mech, status, search)` | Updates job filters and rerenders. |
| `cycleStatus(id)` | Cycles a job through allowed statuses. |
| `setJobStatus(id, status)` | Sets a job status and saves/logs. |
| `removeJob(id)` | Deletes/tombstones a job after checks. |
| `viewJob(id, options)` | Opens job detail modal. |
| `sendBill(id)` | Opens WhatsApp billing/invoice message. |
| `updateJobModalActions(job)` | Updates detail modal action buttons based on job state. |
| `partDisplayName(part)` | Returns a display name for a job part. |
| `setJobPartUseAs(partId, value)` | Sets how a selected part should be used/priced on a job. |
| `customJobPartUseAs(partId)` | Allows manual custom part-use label. |
| `stockSellPriceValue(part)` | Reads numeric selling price from stock part. |
| `setStockSellPrice(partId, value)` | Updates stock selling price from job-part workflow. |
| `selectedJobPartPrice(part)` | Resolves selected price for a part being added to a job. |
| `afterJobPartAdded(part, qty)` | Handles UI/state after adding a part to the current job. |
| `promptJobPartQuantity(part)` | Prompts for quantity before adding a part. |
| `openNewJob(options)` | Opens a fresh job form. |
| `openEditJob(id)` | Opens job form in edit mode. |
| `saveJob()` | Creates/updates a job, customer, photos, mechanics, stock parts, logs, local save, and sync. |
| `saveJobAndCreateInvoice()` | Saves job and immediately opens invoice completion. |
| `saveJobAndNext()` | Saves job and reopens a fresh job form. |
| `addPartToJob(partId)` | Adds a stock part to the active job/quick-invoice context. |
| `renderJobPartsCurrent()` | Renders current parts selected for a job. |
| `renderJobPartFound(part, scannedRaw)` | Renders found/scanned part result for adding to job. |
| `openJobPartsDrawer()` | Opens the part-search drawer. |
| `closeJobPartsDrawer()` | Closes the part-search drawer. |
| `openPaymentModal(jobId)` | Opens modal for adding payment to a job/invoice. |
| `savePayment()` | Records a payment entry, updates job paid state, logs, saves, and syncs. |

### `js/stock.js`

| Function | Details |
| --- | --- |
| `normalizeStockSearchText(value)` | Normalizes stock search text to lowercase alphanumeric tokens. |
| `stockSearchTokens(value)` | Splits normalized stock search text into tokens. |
| `stockFitmentText(item)` | Joins fitment fields into searchable text. |
| `levenshteinDistance(left, right)` | Computes edit distance for typo-tolerant matching. |
| `bestStockTokenScore(queryToken, candidateTokens)` | Scores a query token against candidate tokens. |
| `scoreStockSearch(item, query)` | Scores/matches stock rows for search. |
| `renderStock()` | Renders stock alerts, table, and catalog resume state. |
| `renderStockAlerts()` | Renders low/out-of-stock alert summaries. |
| `openOrderStockModal()` | Opens order-stock modal after refreshing alerts. |
| `stockRowSignature(s)` | Builds a stable signature for row DOM cache invalidation. |
| `stockRowHtml(s)` | Builds the table cells for one stock row. |
| `stockCachedRow(s)` | Reuses or updates a cached stock table row. |
| `syncStockRows(tbody, liveStock)` | Synchronizes cached rows with current filtered stock order. |
| `resetStockVirtualRows()` | Resets stock virtual-scroll state to the top of the list. |
| `filteredStockRows(stateStock, indexedQuery)` | Filters and sorts live stock by query/category/status/bike. |
| `renderStockTable()` | Renders stock filters, stock value, bike/category controls, and a 25-row virtual table. |
| `renderVirtualStockRows(items)` | Renders only the 25 visible stock rows plus top/bottom spacer rows. |
| `filterStock(v)` | Updates stock search and rerenders. |
| `filterStockCat(v)` | Updates stock category filter. |
| `filterStockSt(v)` | Updates stock status filter. |
| `filterStockBike(v)` | Updates bike filter. |
| `adj(id, d)` | Adjusts stock quantity and logs stock movement. |
| `orderPart(id)` | Opens/starts order workflow for one part. |
| `delPart(id)` | Deletes/tombstones a stock item. |
| `openAddPart()` | Opens blank stock item modal. |
| `prefillPartFromScannedSku(sku)` | Prefills add-part form from a scanned SKU. |
| `editPart(id)` | Opens stock item modal in edit mode. |
| `autoSKU()` | Generates an automatic SKU. |
| `receivePartQty(id, qty)` | Adds received stock quantity and movement history. |
| `renderStockReceiveFound(s, scannedRaw)` | Renders a found part in the receive-stock scan modal. |
| `openStockReceiveScan()` | Opens receive-stock scan workflow. |
| `closeStockReceiveModal()` | Closes receive-stock modal. |
| `savePart()` | Creates/updates stock item details, photos, prices, and sync state. |
| `openAgentJsonPicker()` | Opens file picker for agent JSON import. |
| `openCatalogCsvPicker()` | Opens file picker for catalog CSV import. |
| `importCatalogCsvFile(input)` | Reads CSV file and starts catalog review. |
| `parseCatalogCsv(text)` | Parses catalog CSV text into rows/header map. |
| `normalizeCatalogRowForReview(row, headerMap, rowNumber)` | Converts a CSV row into a review item. |
| `findStockByCatalogRow(row)` | Finds an existing stock item matching a catalog row. |
| `findCatalogDuplicateCandidate(row, ignoreId)` | Finds likely duplicates during catalog review. |
| `startCatalogReviewSession(rows, sourceFile)` | Creates catalog review session state. |
| `renderCatalogReviewStep()` | Renders current catalog-review item and duplicate info. |
| `aiNormalizeCatalogReviewRow()` | Opens AI prompt to normalize a catalog row. |
| `renderCatalogReviewSummary()` | Renders catalog review completion summary. |
| `confirmCatalogReviewRow()` | Confirms current catalog row for import/update. |
| `declineCatalogReviewRow()` | Marks current catalog row declined. |
| `reviewLaterCatalogReviewRow()` | Marks current catalog row for later review. |
| `goToPreviousCatalogReviewRow()` | Moves review cursor backward. |
| `pauseCatalogReview()` | Saves current review session and closes/pauses. |
| `cancelCatalogReview()` | Cancels current catalog review session. |
| `closeCatalogReview()` | Closes catalog review modal. |
| `applyCatalogReviewImport()` | Applies confirmed catalog rows to stock. |
| `upsertCatalogReviewItem(item)` | Adds or updates stock from one reviewed catalog item. |
| `rollbackCatalogReviewItem(item)` | Reverts one applied catalog item. |
| `rollbackCatalogReviewSession()` | Rolls back a catalog import session. |
| `setCatalogImportMode(mode)` | Sets review/import mode. |
| `saveCatalogReviewSession()` | Persists current catalog review session. |
| `loadSavedCatalogReviewSession()` | Loads saved catalog review session. |
| `clearSavedCatalogReviewSession()` | Clears saved catalog review session. |
| `hasSavedCatalogReviewSession()` | Checks if a saved catalog review exists. |
| `resumeCatalogReview()` | Resumes saved catalog review. |
| `updateCatalogReviewResumeButton()` | Shows/hides resume button. |
| `buildCatalogStockName(item)` | Builds stock item name from catalog fields. |
| `applyCatalogReviewEdits(options)` | Applies edited modal fields back to current review item. |
| `inferCatalogSide(variantRaw, fallback)` | Infers left/right/front/rear side from catalog variant text. |
| `catalogBikeLabel(item)` | Builds bike/fitment label for catalog item. |
| `catalogCategoryLabel(partName)` | Infers category from part name. |
| `catalogCategoryOptions(selected)` | Builds category select option HTML. |
| `escapeAttr(value)` | Escapes HTML attribute text inside stock module. |
| `importAgentJsonFile(input)` | Reads imported agent JSON file. |
| `ingestAgentStockJson(raw, options)` | Converts agent/supplier JSON into stock/purchase/import records. |
| `parseDelimitedCsv(text)` | Parses general delimited CSV text. |
| `parseSupplierNumber(value)` | Normalizes supplier part numbers. |
| `normalizeSupplierDescription(value)` | Normalizes supplier description text. |
| `normalizeAlphaNum(value)` | Keeps alphanumeric normalized text. |
| `tokenizeSupplierText(value)` | Tokenizes supplier item text. |
| `tokenOverlap(left, right)` | Computes token overlap for supplier matching. |
| `normalizeAgentImportItem(item, invoiceMeta, lineNo)` | Normalizes one agent import line. |
| `normalizeBikeLabelFromAgent(item)` | Infers bike label from agent import item. |
| `normalizeCategoryLabelFromAgent(item)` | Infers category from agent import item. |
| `findStockMatchForAgentImport(item)` | Finds likely stock match for imported supplier item. |
| `restockFromAgentImport(existing, incoming, context)` | Restocks an existing item from supplier import data. |

### `js/customers.js`

| Function | Details |
| --- | --- |
| `filterCustomers(value)` | Updates customer search and debounced rerenders. |
| `customerOwnsJob(customer, job)` | Uses safe matching helpers to decide if a job belongs to a customer. |
| `linkJobsToCustomer(target, options)` | Assigns matching jobs to a customer and returns count linked. |
| `openCustomerHistory(customerId, customerName, phone, sourceJobId)` | Resolves or self-heals a customer record, links jobs, then opens customer detail. |
| `customerDueJobs(custId)` | Returns due jobs belonging to a customer. |
| `openCustomerHistoryJob(jobId)` | Opens the invoice/job related to a customer history row. |
| `customerBalanceBadge(meta, compact)` | Builds balance badge markup. |
| `buildDueReminderMessage(c, dueJobs)` | Builds WhatsApp due-payment reminder text. |
| `buildFeedbackReminderMessage(c, job, followup)` | Builds WhatsApp feedback reminder text. |
| `buildServiceReminderMessage(c, job, followup)` | Builds WhatsApp service reminder text. |
| `openCustomerWhatsApp(c, msg)` | Opens WhatsApp with a customer phone/message. |
| `remindCustomerDue(id)` | Sends/logs due reminder for a customer. |
| `remindCustomerFeedback(id)` | Sends/logs feedback reminder for a customer. |
| `remindCustomerService(id)` | Sends/logs service reminder for a customer. |
| `renderCustomers()` | Renders customer cards with search, sort, balances, reminders, and pagination. |
| `setCustomerSort(value)` | Updates customer sort mode and rerenders. |
| `viewCustomer(id)` | Opens detailed customer modal/history. |
| `newJobForCust(custId)` | Opens a new job prefilled for a customer. |
| `openAddCust()` | Opens blank customer form. |
| `openEditCust(id)` | Opens customer form in edit mode. |
| `saveCust()` | Creates/updates customer record, links jobs, logs, saves, and syncs. |
| `delCust(id)` | Deletes/tombstones a customer after checks. |
| `aiDraftCustomerFeedback(id)` | Opens AI prompt for customer feedback message. |
| `aiDraftCustomerService(id)` | Opens AI prompt for customer service reminder message. |

### `js/reminders.js`

| Function | Details |
| --- | --- |
| `setReminderTab(tab)` | Changes active reminder tab and rerenders. |
| `buildReminderRows()` | Builds consolidated reminder rows from customer/job summary data. |
| `collectFeedbackReminders(rows)` | Filters rows with due feedback reminders. |
| `collectServiceReminders(rows)` | Filters rows with due service reminders. |
| `collectPaymentReminders(rows)` | Filters rows with due payment reminders. |
| `renderReminders()` | Renders reminder tabs, counts, empty state, and reminder rows. |
| `emptyState(text)` | Builds reminder empty-state markup. |
| `reminderRow(type, c, info)` | Builds one reminder row with send/mark/remove actions. |
| `reminderSend(type, custId)` | Sends the selected reminder type and records reminder state. |
| `reminderMarkSent(type, custId)` | Marks a reminder sent without opening WhatsApp. |
| `reminderDismiss(type, custId)` | Removes/dismisses reminder state. |
| `reminderOpenEdit(custId)` | Opens customer edit/detail from reminder row. |

### `js/mechanics.js`

| Function | Details |
| --- | --- |
| `mechanicPeriodDefaults()` | Returns default date/month/year values for mechanic filters. |
| `ensureMechanicPeriodInputs()` | Ensures mechanic period filter inputs are initialized. |
| `mechanicPeriodFilter()` | Builds the current mechanic date/month/year filter. |
| `setMechanicPeriodMode(mode)` | Changes mechanic report period mode and rerenders. |
| `renderMechanics()` | Renders mechanic cards, active state, job/revenue totals, and edit/delete controls. |
| `toggleMechActive(id)` | Toggles a mechanic active/inactive. |
| `delMech(id)` | Deletes/tombstones a mechanic. |
| `openAddMech()` | Opens blank mechanic form. |
| `openEditMech(id)` | Opens mechanic form in edit mode. |
| `saveMech()` | Creates/updates mechanic record, logs, saves, and syncs. |

### `js/expenses.js`

| Function | Details |
| --- | --- |
| `incomeTypeLabel(kind)` | Converts income type key into display label. |
| `expenseDateSpan(range)` | Returns date span for expense/income filter range. |
| `availableExpenseYears()` | Lists years found in expense/income data. |
| `syncExpenseInputs()` | Synchronizes expense/income filter controls with current state. |
| `inExpenseWindow(dateValue, span)` | Checks whether a date falls inside expense filter span. |
| `expenseCategories()` | Returns known/default expense categories. |
| `refreshExpenseCategoryControls()` | Updates category dropdowns/options. |
| `renderExpenses()` | Renders expense list, totals, categories, filters, and pagination. |
| `renderIncomePage()` | Renders manual income list, totals, type breakdown, and filters. |
| `renderExpenseRelatedPage()` | Renders whichever expense/income page is currently active. |
| `filterExpCat(v)` | Updates expense category filter. |
| `setExpenseRange(value)` | Updates expense/income date range filter. |
| `setExpenseCustomDates()` | Updates custom date filter from input fields. |
| `setExpenseYear(value)` | Sets yearly expense/income filter. |
| `delExp(id)` | Deletes/tombstones an expense. |
| `openAddExp()` | Opens blank expense form. |
| `openEditExp(id)` | Opens expense form in edit mode. |
| `saveExp()` | Creates/updates expense, logs, saves, and syncs. |
| `openAddIncome()` | Opens blank manual income form. |
| `openEditIncome(id)` | Opens manual income form in edit mode. |
| `saveIncome()` | Creates/updates manual income, mechanic reference, invoice link, logs, saves, and syncs. |
| `delIncome(id)` | Deletes/tombstones a manual income entry. |

### `js/reports.js`

| Function | Details |
| --- | --- |
| `reportTodayIST()` | Returns today in `Asia/Kolkata` for reports. |
| `reportDateAdd(value, days)` | Adds days to a report date. |
| `fmtReportMoney(value)` | Rounds and formats report money. |
| `availableYears()` | Lists years represented in jobs, expenses, and income. |
| `reportDateSpan(range)` | Resolves report filter range into start/end dates. |
| `syncReportInputs()` | Synchronizes report filter controls. |
| `setReportRange(value)` | Updates report range and rerenders. |
| `setReportYear(value)` | Updates report year and rerenders. |
| `setReportCustomDates()` | Updates report custom/date range from inputs. |
| `setReportSearch(value)` | Updates report search and debounced rerendering. |
| `reportWindow()` | Returns the active report date window. |
| `reportLabel(windowRange, start, end)` | Builds a human-readable label for a report span. |
| `reportJobDate(j)` | Returns the report date for a job/invoice. |
| `reportJobStamp(j)` | Returns timestamp for a job/invoice. |
| `matchesReportSearch(j, q)` | Checks whether a job matches report search. |
| `matchesRevenueSearch(entry, q)` | Checks whether a revenue entry matches report search. |
| `inReportWindow(dateValue, span)` | Checks whether a date is inside report span. |
| `shiftDateValue(value, days)` | Shifts a report date. |
| `spanDayCount(span)` | Returns inclusive day count for a span. |
| `previousSpanFor(currentSpan)` | Builds previous comparison span of equal length. |
| `jobsInSpan(span, options)` | Returns completed jobs/invoices in a span. |
| `revenueEntriesInSpan(span, options)` | Returns revenue entries in a span. |
| `expensesInSpan(span)` | Returns expenses in a span. |
| `partsLogInSpan(span)` | Returns parts log rows in a span. |
| `metricDelta(current, previous)` | Calculates absolute/percent delta. |
| `metricDeltaText(delta)` | Formats delta text. |
| `metricDeltaClass(delta)` | Returns CSS class for delta direction. |
| `methodBucket(entry)` | Buckets revenue/payment method values. |
| `reportCreatedStamp(record)` | Returns created timestamp for report records. |
| `hoursBetween(left, right)` | Calculates hours between timestamps. |
| `customerKeyFromJob(job)` | Builds stable customer key for analytics. |
| `serviceBucket(job)` | Categorizes job service type. |
| `isPlaceholderMechanicLabel(value)` | Detects placeholder mechanic labels in reports. |
| `mechanicReportNameKey(value)` | Normalizes mechanic names for report grouping. |
| `reportMechanicRows(span)` | Builds mechanic performance rows. |
| `sumKnownPartsCost(job)` | Totals known cost for job parts. |
| `usageCountBySku()` | Counts part usage by SKU. |
| `latestMovementDateForItem(item)` | Returns latest stock movement date for a stock item. |
| `daysSince(dateValue)` | Returns days elapsed since a date. |
| `retentionSummary(span)` | Builds retention/repeat-customer metrics. |
| `followupConversionProxy(span)` | Estimates follow-up conversion/return behavior. |
| `vehicleInsights(span)` | Builds vehicle/service insights. |
| `revenueHeatmapData(span)` | Builds day/hour revenue heatmap data. |
| `ltvLeaderboard(span)` | Builds customer lifetime-value leaderboard. |
| `serviceProfitStats(span)` | Builds service profitability metrics. |
| `reportBundle()` | Builds the full current/previous report data bundle. |
| `renderReports()` | Renders all report KPIs, cards, tables, logs hooks, and chart-like summaries. |
| `refreshLogsFromCloud()` | Pulls latest audit logs from cloud when possible. |
| `renderLogs()` | Renders audit log page with filters. |
| `filterLogsSearch(value)` | Updates log text search. |
| `filterLogsAction(value)` | Updates log action filter. |
| `filterLogsEntity(value)` | Updates log entity filter. |
| `sendClosingSummary()` | Builds and opens WhatsApp closing summary. |
| `aiDraftClosingSummary()` | Opens AI prompt for a closing summary draft. |

### `js/scanner.js`

| Function | Details |
| --- | --- |
| `getScannerContext()` | Returns active scanner context. |
| `scannerEl(key)` | Finds scanner DOM elements by key/context. |
| `setScannerContext(name)` | Switches scanner context and refreshes recent scans. |
| `rememberRecentScan(id)` | Stores recently scanned part IDs. |
| `renderRecentScans(mode)` | Renders recent scan shortcuts. |
| `handleContextPartPick(id)` | Routes picked/scanned part to current context. |
| `toggleScanner()` | Starts or stops scanner. |
| `startScanner()` | Opens camera stream and chooses decoding strategy. |
| `startDecoding(video)` | Starts BarcodeDetector/ZXing/jsQR decoding fallback chain. |
| `loadZXingBrowser()` | Dynamically loads ZXing browser decoder library. |
| `startZXingDecoding(video)` | Starts ZXing decoding loop. |
| `startJsQRDecoding(video)` | Initializes jsQR fallback decoding. |
| `runJsQRLoop(video)` | Runs canvas-based jsQR decode loop. |
| `handleScanDecode(decoded)` | Parses decoded QR/SKU text and routes result. |
| `stopScanner()` | Stops camera stream/decoder and clears scanner state. |
| `resumeScanner()` | Restarts scanner. |
| `populateScanJobs()` | Populates job selector/options for scanner page. |
| `showScanResult(s)` | Renders stock/job result for a scan/manual lookup. |
| `confirmUse(sid)` | Confirms using a scanned stock item in the active workflow. |
| `manualSearch(v)` | Manually searches stock by typed text/SKU. |

### `js/print.js`

| Function | Details |
| --- | --- |
| `filterPrintSearch(v)` | Updates print manager search. |
| `filterPrintCat(v)` | Updates print category filter. |
| `filterPrintBike(v)` | Updates print bike filter. |
| `filterPrintStatus(v)` | Updates print status filter. |
| `qrImageUrl(text, size)` | Builds QR image URL using external QR service. |
| `fallbackStickerQR(canvasId, payload, size)` | Draws fallback QR to canvas when image QR fails. |
| `stickerNameClass(name, sizeKey)` | Chooses sticker text size class based on name length/label size. |
| `stickerMetaHtml(item, sizeKey)` | Builds sticker metadata HTML. |
| `markPartForRecentPrint(id)` | Marks a part as recently added/selected for printing. |
| `getPrintFilteredStock()` | Returns stock filtered for print manager. |
| `syncPrintSelection()` | Syncs selected print IDs/quantities with filtered stock. |
| `selectedPrintPartIds()` | Returns selected part IDs for printing. |
| `selectedPrintLabelCount()` | Counts labels to print after quantities. |
| `expandedPrintItems()` | Expands selected parts into repeated label items. |
| `togglePrintSelect(id, checked)` | Selects/deselects one stock part for printing. |
| `togglePrintSelectAll(checked)` | Selects/deselects current page/all visible print items. |
| `setPrintQty(id, value)` | Sets label quantity for a part. |
| `selectAllPrintFiltered()` | Selects all filtered stock items for printing. |
| `clearPrintSelected()` | Clears all print selections. |
| `selectPrintLastAdded()` | Selects the most recently added part. |
| `renderPrintPreview(items)` | Renders sticker preview HTML. |
| `ensurePrintQRCodesReady()` | Waits for QR images/canvases to finish before printing. |
| `drawLabelQRCodeFromAppSource(canvas, payload)` | Draws a QR code to canvas from app QR generation source. |
| `renderPrintManager()` | Renders print filters, stock selection, counts, preview, and controls. |
| `printStickerSheet()` | Opens/prints the selected QR sticker sheet. |
| `invoicePartSnapshot(part)` | Builds invoice-safe snapshot for a part line. |
| `shareInvoiceWA()` | Shares current invoice via WhatsApp. |
| `openInvoice(id, options)` | Opens invoice modal, builds invoice view, totals, parts, customer, and print/share actions. |
| `printInvoice()` | Prints the currently opened invoice. |

### `js/sync.js`

| Function | Details |
| --- | --- |
| `showOptimisticSyncFailureToast(msg)` | Warns that local save succeeded but cloud sync failed. |
| `realtimeOnline()` | Marks realtime sync healthy and resets reconnect attempts. |
| `realtimePaused(reason)` | Updates status while realtime is paused. |
| `scheduleRealtimeReconnect(client)` | Schedules exponential-ish realtime reconnect. |
| `updateQuickSyncButton()` | Shows/hides and labels the quick sync button. |
| `quickSyncNow()` | Runs manual pull-first sync. |
| `openGS()` | Opens cloud settings/status modal. |
| `updateGSBadge()` | Updates Cloud ON/OFF/SETUP/DISABLED badge. |
| `updateGSStatus(msg)` | Updates sync status text, diagnostics, quick button, and startup overlay. |
| `renderSyncDiagnostics()` | Renders detailed sync metadata/status table. |
| `renderCloudBackupStatus()` | Renders legacy blob backup status. |
| `syncErrMsg(err, fallback)` | Converts sync errors into readable messages. |
| `canUseCloudConfig()` | Checks whether project URL/key are available. |
| `hasAnyRecords(data)` | Checks if a payload contains any business records. |
| `maxInvoiceNumberFromJobs(list)` | Returns max numeric invoice number in jobs. |
| `hasRemoteInvoicesMissingLocally(remoteJobs, localJobs)` | Detects if remote has invoices absent locally. |
| `normaliseArray(arr)` | Normalizes a value to an array. |
| `buildSyncPayload()` | Builds the full cloud sync payload from local arrays/settings. |
| `persistLocalBackupSnapshot()` | Stores current payload as local backup. |
| `snapshotStamp(payload)` | Returns payload updated timestamp. |
| `syncAgeMs(value)` | Returns age in milliseconds for a timestamp. |
| `shouldThrottleAutomaticPull(options)` | Checks automatic pull cooldown rules. |
| `embeddedMillisStamp(value)` | Extracts timestamp milliseconds from IDs/stamps. |
| `shadowRowStamp(row)` | Returns a comparable timestamp for a shadow row. |
| `ioSaverRowsForPush(rows, options)` | Limits push rows to changed rows under IO-saver mode. |
| `shouldPullBeforePush(options)` | Detects stale devices that must pull before pushing. |
| `syncLatestThenPush(options)` | Pulls latest cloud data first, then pushes pending local changes. |
| `recordStamp(record)` | Returns best updated/deleted/created timestamp for merge comparisons. |
| `mergeByKey(remoteList, localList, keyFn, normalizeFn, options)` | Merges remote/local lists by key with tombstone and timestamp rules. |
| `mergeEventLists(remoteList, localList, keyFn)` | Merges append-style event/audit lists. |
| `mergedSyncPayload(remoteData, localData, options)` | Merges complete remote/local payloads. |
| `shadowValidationWindowActive(nowStamp)` | Checks whether shadow validation window is active. |
| `ensureShadowValidationWindow()` | Starts validation window metadata if needed. |
| `shadowStableValue(value)` | Produces stable values for hashing. |
| `shadowStableStringify(value)` | Stable-stringifies row payloads. |
| `shadowHashString(value)` | Hashes stable payload strings. |
| `shadowSyntheticId(prefix, ...parts)` | Creates stable synthetic IDs for derived shadow rows. |
| `shadowExtractText(record, keys)` | Extracts first non-empty text field from a record. |
| `shadowNumber(value)` | Converts a value to finite number. |
| `shadowTimestamp(value)` | Converts a value to timestamp/ISO-compatible value. |
| `shadowDate(value)` | Extracts date from timestamp/value. |
| `shadowRecordUpdatedAt(record)` | Returns best updated timestamp for a shadow record. |
| `shadowBaseRow(id, record, session)` | Builds common shadow-row metadata. |
| `shadowDeleteRow(id, session)` | Builds tombstone/delete shadow row. |
| `shadowMechanicLookup(list)` | Builds mechanic ID/name lookup for shadow rows. |
| `shadowJobMechanicIds(job)` | Extracts mechanic IDs for a job shadow row. |
| `shadowJobMechanicNames(job, mechanicLookup)` | Extracts mechanic names for a job shadow row. |
| `shadowNormalizedJobs(payload)` | Normalizes payload jobs for shadow sync. |
| `shadowNormalizedIncomeEntries(payload)` | Normalizes payload income entries for shadow sync. |
| `shadowCustomerBalance(customer, jobsList)` | Computes customer balance for shadow customer row. |
| `isCustomerShapedRaw(raw)` | Detects customer-shaped raw records. |
| `buildCustomerShadowRows(payload, session)` | Builds rows for `garage_customers`. |
| `buildMechanicShadowRows(payload, session)` | Builds rows for `garage_mechanics`. |
| `buildJobShadowRows(payload, session)` | Builds rows for `garage_jobs`. |
| `buildJobPaymentShadowRows(payload, session)` | Builds derived rows for `garage_job_payments`. |
| `buildStockItemShadowRows(payload, session)` | Builds rows for `garage_stock_items`. |
| `buildExpenseShadowRows(payload, session)` | Builds rows for `garage_expenses`. |
| `buildIncomeEntryShadowRows(payload, session)` | Builds rows for `garage_income_entries`. |
| `buildPartsLogShadowRows(payload, session)` | Builds rows for `garage_parts_log`. |
| `buildAuditLogShadowRows(payload, session)` | Builds rows for `garage_audit_log`. |
| `buildReviewItemShadowRows(payload, session)` | Builds rows for `garage_review_items`. |
| `buildImportBatchShadowRows(payload, session)` | Builds rows for `garage_import_batches`. |
| `buildPurchaseEntryShadowRows(payload, session)` | Builds rows for `garage_purchase_entries`. |
| `buildStockMovementShadowRows(payload, session)` | Builds rows for `garage_stock_movements`. |
| `buildSupplierCatalogMapShadowRows(payload, session)` | Builds rows for `garage_supplier_catalog_map`. |
| `buildInvoiceImportReviewShadowRows(payload, session)` | Builds rows for `garage_invoice_import_reviews`. |
| `fetchShadowRemoteMeta(client, table)` | Reads remote shadow table metadata for validation/delete comparisons. |
| `upsertShadowRows(client, table, rows)` | Batch-upserts shadow rows to Supabase. |
| `dedupeShadowRows(rows)` | Deduplicates shadow rows by ID. |
| `validateShadowTableRows(expectedRows, actualMeta)` | Compares expected local rows to remote metadata. |
| `summarizeShadowValidation(results)` | Builds human-readable validation summary. |
| `logShadowValidationRun(client, payload, session, validation)` | Writes validation run details to Supabase. |
| `shadowMirrorErrorMessage(err)` | Converts shadow mirror errors into readable text. |
| `mirrorPayloadToShadowTables(client, payload, session, options)` | Pushes payload rows to all shadow tables, validates, heartbeat-updates, and records sync metadata. |
| `buildMergeSummary(remoteData, localData, merged)` | Summarizes merge result counts. |
| `applyRemoteSnapshot(data, remoteUpdatedAt, options)` | Applies remote payload into local arrays, persists backup, renders, and updates metadata. |
| `persistCloudSettings()` | Saves cloud URL/key/email/admin config locally. |
| `clearCloudSettings()` | Clears cloud connection settings and session state. |
| `requireCloudWriteAccess(actionLabel)` | Blocks writes when cloud permissions/session are not usable. |
| `ensureCloudClient()` | Creates/reuses Supabase client from config. |
| `uploadPhotoToCloud(file, options)` | Uploads a photo file to Supabase Storage and returns public URL. |
| `bindAuthListener()` | Binds Supabase auth-state listener. |
| `getCloudSession()` | Reads current Supabase session. |
| `signInCloud(password)` | Signs in with configured email/password. |
| `ensureCloudSession()` | Ensures an active Supabase session exists. |
| `queueAutoSync()` | Debounces automatic cloud push. |
| `startBackgroundSyncLoop()` | Starts periodic push/stale-pull background sync. |
| `upsertRealtimeItem(list, item, options)` | Upserts a realtime record into a local list. |
| `tombstoneRealtimeItem(list, id, deletedAt)` | Applies a realtime tombstone to a local list. |
| `applyRealtimeShadowRecord(key, rawRecord, eventType)` | Applies a changed shadow table row directly to local state. |
| `applyRealtimeShadowDelete(key, id, deletedAt)` | Applies a realtime delete/tombstone. |
| `refreshRealtimePages(key, pages)` | Marks/render affected pages after realtime changes. |
| `handleRealtimeShadowChange(config, payload)` | Handles realtime table-change payloads. |
| `refreshRecentCloudChanges(windowMs, options)` | Pulls recent changes after visibility/reconnect gaps. |
| `startRealtimeSync(client)` | Subscribes to Supabase realtime heartbeat/table changes. |
| `checkAndPullIfStale(client)` | Checks heartbeat and pulls if another device has newer cloud data. |
| `saveGS()` | Saves cloud settings and signs in/syncs. |
| `disconnectGS()` | Signs out and clears local cloud session state. |
| `syncGS()` | Runs a manual sync action from cloud modal. |
| `shouldWriteWeeklyBlob()` | Checks whether legacy weekly blob backup should be written. |
| `pullFromShadowTables(client, options)` | Reads all live shadow tables and rebuilds app payload. |
| `writeGarageStateBlob(client, payload, session)` | Writes legacy `garage_state` blob backup. |
| `copyTableSyncToGarageStateBackup()` | Manually copies table-wise sync data into legacy blob row. |
| `pullGS(options)` | Pulls from cloud shadow tables/blob and applies/merges. |
| `pushGS(options)` | Pushes local pending state to shadow tables and optional blob backup. |
| `initGSSync()` | Initializes cloud config, auth/session, startup pull, realtime, and background sync. |
| `copyCloudSQL()` | Copies setup SQL to clipboard for cloud configuration. |
| `downloadBackup()` | Downloads local data backup JSON. |
| `restoreBackup(input)` | Restores backup JSON from file input. |
| `importLegacyBundle(input)` | Imports legacy exported bundle format. |

### `js/qrgen.js`

No project-owned named functions are declared in this file. It provides QR generation capability consumed by `js/print.js`.

### `js/cloud-config.js`

No functions are declared. It assigns `window.JALASAI_CLOUD_CONFIG` with Supabase connection defaults and admin emails.

### `js/new-ui.js`

| Function | Details |
| --- | --- |
| `newUiCleanRoute(raw)` | Cleans hash/path text into a normalized route key. |
| `newUiPageFromRoute(raw)` | Maps a hash/path route to an app page key. |
| `updateNewUiRoute(page, options)` | Updates browser hash for New UI routing. |
| `initNewUiShell()` | Initializes New UI route state and hashchange listener. |
| `toggleNewUiSidebar(force)` | Toggles desktop collapsed sidebar or mobile open sidebar. |
| `closeNewUiSidebarOnNavigate()` | Closes mobile sidebar after navigation. |
| `newUiMoney(value)` | Formats money for New UI dashboard, using `fmtMoney` when available. |
| `newUiEscape(value)` | HTML-escapes dashboard text. |
| `newUiSetText(id, value)` | Sets text content for a dashboard element. |
| `renderHomeDashboard()` | Renders New UI home dashboard metrics, active jobs, risky stock, and sync status. |

### `apps-script/JalaSaiSync.gs`

| Function | Details |
| --- | --- |
| `doGet(e)` | HTTP GET endpoint that returns the current spreadsheet snapshot. |
| `doPost(e)` | HTTP POST endpoint that writes posted snapshot data. |
| `jsonOut_(obj)` | Returns a JSON `ContentService` response. |
| `readSnapshot_()` | Reads all configured sheets/meta into one snapshot object. |
| `writeSnapshot_(data)` | Writes snapshot arrays/meta into Google Sheets. |
| `readSheet_(ss, name, headers, mapFn)` | Reads a sheet by headers and maps rows into objects. |
| `writeSheet_(ss, name, headers, rows)` | Writes rows to a sheet with headers. |
| `readMeta_(ss)` | Reads metadata sheet key/value pairs. |
| `writeMeta_(ss, meta)` | Writes metadata key/value pairs. |
| `json_(value, fallback)` | Parses JSON text with fallback. |
| `num_(value)` | Converts values to numbers safely. |
| `bool_(value)` | Converts values to booleans safely. |
| `getSS_()` | Opens the configured spreadsheet. |

### `apps-script/JalaSaiDriveBackup.gs`

| Function | Details |
| --- | --- |
| `readAllShadowTables_()` | Reads all Supabase shadow tables into a backup payload. |
| `backupShadowTablesToDrive()` | Writes a timestamped shadow-table backup JSON file to Drive. |
| `writeSundayBlobFromTables()` | Writes table-derived data into legacy blob backup on Sunday schedule. |
| `setupDailyBackupTrigger()` | Creates daily backup trigger. |
| `setupSundayBlobTrigger()` | Creates Sunday legacy blob trigger. |
| `deleteTriggers_(handlerName)` | Deletes existing Apps Script triggers for a handler. |
| `testBackupNow()` | Manually runs Drive backup for testing. |
| `testBlobWriteNow()` | Manually runs blob write for testing. |
| `listRecentBackups()` | Lists recent backup files in Drive. |
| `getBackupFolder_()` | Gets or creates the Drive backup folder. |
| `cleanupOldBackups_(folder)` | Deletes old backups beyond retention policy. |

### `supabase/schema.sql`

| Function | Details |
| --- | --- |
| `public.jalasai_apply_authenticated_full_access(target_table regclass)` | Temporary PL/pgSQL helper that enables RLS on a table and recreates an authenticated full-access policy. The schema calls it for each JalaSai table and then drops it. |

## 7. High-Risk Areas for Future Changes

- Customer matching: change carefully. `customerMatchesJob()`, `bestCustomerForJob()`, and `tidyCustomerRecords()` prevent imported/opening-balance records from attaching to the wrong customer.
- Sync/tombstones: `SHADOW_INFER_DELETES` is disabled to avoid stale-device accidental deletes. Do not infer remote deletes from missing local rows without a fresh pull strategy.
- Invoice numbers: duplicate checks are split between `jobs.js` strict matching and `index.html` invoice display matching.
- Payments: payment history, legacy `payment` fields, due/advance calculations, and manual income are related but intentionally separate.
- Stock imports: catalog review and agent JSON import can update live inventory, purchase records, supplier maps, and stock movements.
- Inline helper duplication: `index.html` duplicates `getPhotoPreviewList()` and `photoGalleryMarkup()` identically; browser hoisting leaves the later definition active.
- Shared JS source: edit root `js/` only. Do not recreate `NEW UI/js/` or hand-maintained `deploy/js/` mirrors.

## 8. Quick Maintenance Checklist

When changing a workflow:

1. Update the relevant domain module.
2. Normalize new fields in `js/data.js`.
3. Persist with `saveAll()` and log important business actions with `logAction()`.
4. Add shadow-table extraction in `js/sync.js` if the field must be searchable/reportable in Supabase.
5. Add or adjust schema columns/indexes only when table-level querying needs them; otherwise `record_data` still carries the full object.
6. Check both UI shells still reference the shared root `js/` files in the correct order.
7. Verify local save, refresh/load, cloud push, cloud pull, and the affected report/customer/reminder summaries.
