# Improvements and Evolution

Last updated: 2026-05-08

This document summarizes major improvements made to move JalaSai from a basic tracker to an operationally reliable garage workflow system.

## UX and Workflow Improvements

- Built `Quick Invoice` as the primary fast-entry billing surface
- Added `Job Card` save variants (`save`, `save & next`, `save as invoice`)
- Added `Returned` as a first-class active job status alongside `Waiting`, `In Progress`, `Parts Needed`, and `Ready`
- Introduced chip-driven selections for mechanics, payments, and income type
- Added recent customer and bike chips to reduce repeated typing
- Improved mobile touch targets, stacking, and chip wrapping
- Added explicit `Open Camera` and `Upload Photos` controls so photo capture is clearer on phones
- Added back navigation for nested flows while keeping Jobs home clean
- Added job created date/time visibility on cards
- Fixed auto-select fields so users can still move the cursor and edit in place
- Updated default list priorities:
  - invoices open as `Invoice No.` high to low
  - customers open as `Due: High to Low`
- Removed the extra text brand label from the top navigation and kept the logo/tabs focused on daily actions
- Added batched customer-card rendering so large imported customer lists do not freeze tab switching

## Data Quality and Billing Reliability

- Added duplicate invoice number detection before save
- Added invoice number auto-suggestion from real saved records
- Added discount support across invoice/job/payment flows
- Kept invoice editing inside the main invoice system for consistency
- Tightened duplicate invoice detection to live completed invoices with strict reference matching
- Fixed numeric invoice sorting so `9999` / `10000` order is correct

## Financial and Reporting Improvements

- Added manual income capture in daily workflow
- Added mechanic-linked regular income to mechanic totals and reports
- Added mechanic screen period filters for `Month`, `Date`, and `Year` instead of fixed current-month revenue only
- Added clickable same-day revenue breakdown from Jobs dashboard
- Added `Yesterday` filter to reports and expenses
- Expanded closing summary to include bikes, invoices, done jobs, cash, UPI, expenses, and net
- Improved finance visibility and role-gated sensitive data
- Split dense report analysis into smaller cards for easier in-app phone reading
- Reworked wide service profit and demand heatmap views into mobile-friendlier card layouts

## Stock and Catalog Improvements

- Shifted from unsafe direct SKU assumptions to review-first import
- Added duplicate warnings during catalog review
- Added edit-before-confirm and pause/resume import workflow
- Improved search with fitment and typo-aware matching
- Added stock photo attach / replace / remove for visual identification
- Added saved-price and manual-price part add flow for job and scan usage
- Manual entered part price now becomes the new saved selling price

## Customer Tracking Improvements

- Fixed customer balance rendering to show true current state
- Added reminder timings based on active tracking windows
- Added in-context customer access from invoice list
- Repaired Khatabook opening-balance ownership after shadow-table separation so unique balances no longer attach to random customers
- Added duplicate customer ID repair and exact duplicate customer merging
- Rebuilt customer vehicle lists from currently owned jobs to remove stale imported-balance vehicles

## Platform and Resilience Improvements

- Added Supabase shared sync with local cache fallback
- Added role-sensitive admin controls and workflow restrictions
- Preserved PWA-ready static deployment model
- Added quick manual sync action beside cloud status
- Fixed customer, stock item, and mechanic deletion to stay safe across sync merges by using tombstones
- Fixed mechanic name hydration so assigned mechanic labels still show after reload and sync
- Added realtime heartbeat sync plus 30-second stale-check fallback for faster multi-device updates
- Standardized business-date defaults to `Asia/Kolkata` so date-sensitive views stay aligned across the app
- Locked `Print QR` back to the Admin-only path so non-admin users cannot route around access controls
- Reduced tab-switch lag by reusing customer/job summary indexes in Customers and Reminders
- Reduced invoice render work by indexing linked income once per render
- Bumped the PWA service-worker cache to `jalasai-v20`

## Continuous Improvement Pattern Used

The project improvements followed this loop repeatedly:

1. Observe real workshop friction
2. Simplify the highest-frequency action path
3. Preserve backward compatibility for current users
4. Validate with live usage and iterate

This pattern is the main reason the system improved quickly without heavy rewrites.
