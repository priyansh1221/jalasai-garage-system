# JalaSai Incident Log

This file keeps operational incidents easy to find without mixing them into normal feature documentation.

## 2026

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
