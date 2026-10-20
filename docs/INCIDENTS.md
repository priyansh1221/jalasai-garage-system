# JalaSai Incident Log

This file keeps operational incidents easy to find without mixing them into normal feature documentation.

## 2026

- Old phone stuck at an old invoice - 2026-10-20
  - A phone that hadn't synced for weeks stayed at invoice 12076, even after refreshing, while the cloud had 12747.
  - The short reconnect sweep only asks for recent changes and caps them, but it still moved the phone's "last synced" time forward. After that the phone believed it was up to date, and changes-only sync never started because it had no cursors yet.
  - Fixed (c145aa8, deployed as build `jalasai-1792477571`): a phone without changes-only cursors, or more than 7 days behind, does one full catch-up pull on opening, and the sweep never moves "last synced" forward when it stopped early.
  - Immediate workaround on an affected phone: Cloud Sync → Sync diagnostics → "Repair: re-download everything".
  - See `docs/CHANGELOG.md` (2026-10-20) and `docs/ROLLOUT_2026_10.md`.
- Invoices vanishing on iPhones - 2026-10-19
  - Safari caps localStorage at 5 MB and counts compressed text double.
  - Once the jobs list outgrew that, saves failed silently. After a reload the phone had no invoices, and because customers and stock still loaded, it never downloaded them again.
  - Fixed by storing business tables in IndexedDB, forcing a full jobs download when a signed-in phone has none, and showing a red banner whenever a device save fails.
  - See `docs/CHANGELOG.md` (2026-10-19).
- [Supabase Project Unhealthy Incident - 2026-06-07](SUPABASE_PROJECT_UNHEALTHY_INCIDENT_2026_06_07.md)
  - Cloud login/sync failed because the Supabase project database connection path was unhealthy. Restarting the Supabase database restored Auth, PostgREST, Storage, and app sync.
- [Cloud Off Local Cache Reference - 2026-06-07](CLOUD_OFF_LOCAL_CACHE_REFERENCE_2026_06_07.md)
  - Screenshot reference note for the New UI Home state showing `Cloud: OFF` and local cache only after the incident recovery flow.
- [Performance, Sync UI, And Startup Incident - 2026-06-04](PERFORMANCE_SYNC_UI_INCIDENT_2026_06_04.md)
  - Quick Invoice/New Job modal lag, startup refresh delay, and sync UI cleanup.
- [Invoice Sync Stall Incident - 2026-06-03](INVOICE_SYNC_STALL_INCIDENT_2026_06_03.md)
  - Stale local metadata prevented newer cloud invoice rows from applying to the invoice list.
- [Invoice Recovery Incident - 2026-05-05](INVOICE_RECOVERY_INCIDENT_2026_05_05.md)
  - Stale-device sync inferred deletes from missing local rows and tombstoned invoice data.
- [Customer Data Cleanup - 2026-04-23](CUSTOMER_DATA_CLEANUP_2026_04_23.md)
  - Customer ownership, imported balance isolation, and data cleanup notes.

## Incident Template

Use this structure for future incidents:

```text
# Incident Name - YYYY-MM-DD

## Summary
## Impact
## Symptoms
## Investigation
## Root Cause
## Resolution
## Recovery Runbook
## Prevention
```
