# Performance and Data Cleanup - 2026-05-01

This note records the fixes made after the shadow-table split exposed slow tab switching and incorrect customer balances.

## Problems Found

- Customers and Reminders were scanning jobs repeatedly per customer.
- The Customers page rendered thousands of customer cards during every tab switch.
- Invoices rebuilt linked-income matches once per invoice row.
- Khatabook opening-balance rows sometimes kept stale `custId` values and appeared under unrelated customers.
- Some customer records had duplicate live IDs, causing one balance summary to appear across multiple cards.
- Invoice sorting used text order, so `10000` could be separated from `9999`.

## Fixes

- Customers now build one customer/job summary index and render the first 240 cards, with `Load more customers` for the rest.
- Reminders builds one shared summary index, then derives Feedback, Service, and Payment lists from it.
- Invoices builds a linked-income invoice index once per render.
- Khatabook/opening-balance rows require strong phone/name evidence before they attach to an existing customer.
- Duplicate live customer IDs are repaired.
- Exact duplicate customers merge only when name and phone match.
- Customer vehicle chips rebuild from jobs that still belong to that customer.
- Invoice sorting uses numeric invoice comparison.
- Service-worker cache was bumped to `jalasai-v13`.

## Browser Verification

Observed on the local app after reload:

- Customers initially rendered `240/2679 customers` instead of all cards.
- `9999` sorted immediately before `10000`.
- A previously bad customer example no longer showed the random large Khatabook balance pile.
- Cleanup changes synced back through cloud tables.

## Future Rule

When changing customer, invoice, or sync code, avoid per-row full-list scans inside render loops. Build an index once, then render from that index.
