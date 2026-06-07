# Cloud Off Local Cache Reference - 2026-06-07

## Context

This reference records the screenshot shared after the Supabase project unhealthy incident was resolved.

The screenshot showed the New UI Home screen with cloud disconnected/offline state after the backend restart recovery. It is kept as an operational reference so future troubleshooting can distinguish app-side local-cache state from Supabase backend health.

## Screenshot Contents

Visible UI state:

- New UI Home route selected.
- Top cloud badge showed `Cloud: OFF`.
- Top-right status text showed `Local cache only. Connect cloud when you are ready.`
- Dashboard cards showed empty local state:
  - Today Revenue: `₹0`
  - Active Jobs: `0`
  - Customers: `0`
  - Stock Risk: `0`
- Live Jobs Snapshot showed no active jobs.
- System Health card showed `Cloud sync healthy` with the local-first/cloud-sync explanation.

## Operational Meaning

This screen means the app shell loaded and local-first UI was responsive, but the current browser/device was not connected to cloud sync at that moment.

It does not by itself prove Supabase is down. During the 2026-06-07 incident, Supabase Project Status and Realtime logs were the deciding evidence:

- Database/Auth/PostgREST/Storage unhealthy in Supabase dashboard
- Realtime database connection errors
- direct Supabase requests with the configured anon key timing out

## Follow-Up Rule

If this screen appears after a Supabase incident:

1. Open Cloud Sync and sign in again.
2. If `Connect & Sync` works, the app is recovered.
3. If the warning returns, check Supabase Project Status before changing Cloudflare keys.

Related incident:

- [SUPABASE_PROJECT_UNHEALTHY_INCIDENT_2026_06_07.md](SUPABASE_PROJECT_UNHEALTHY_INCIDENT_2026_06_07.md)
