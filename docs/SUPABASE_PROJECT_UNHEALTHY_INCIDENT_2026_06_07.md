# Supabase Project Unhealthy Incident - 2026-06-07

## Summary

On 2026-06-07, staff could not complete Cloud Sync login from the JalaSai app. The app showed:

```text
Supabase project URL or anon/publishable key may be wrong, or Supabase is not responding.
```

Cloudflare Pages was serving the expected runtime `/config.js`, and the configured Supabase public key decoded as an `anon` key for project `glzqipidalvpozkscwoy`. The incident was resolved after restarting the Supabase database from the Supabase dashboard.

## Impact

- Cloud Sync login failed for devices using this Supabase project.
- Auth, PostgREST, Database, and Storage showed unhealthy in the Supabase dashboard.
- Realtime logs showed database connection failures.
- Local-first app data remained available on devices that already had local cached data, but cloud sign-in/sync could not complete while Supabase was unhealthy.

Because all JalaSai staff devices use the same Supabase project, the cloud failure affected all users of this app. It was project-scoped, not caused by the Cloudflare deployment or browser UI code.

## Symptoms

The app showed a cloud setup warning while pressing `Connect & Sync`.

Supabase Project Status showed:

- Database: Unhealthy
- PostgREST: Unhealthy
- Auth: Unhealthy
- Storage: Unhealthy
- Realtime: Healthy
- Edge Functions: Healthy

Realtime logs included messages similar to:

```text
Realtime was unable to connect to the project database
UnableToConnectToTenantDatabase
DBConnection.ConnectionError
connection not available
Tenant glzqipidalvpozkscwoy has been terminated: :shutdown
```

## Investigation

Cloudflare runtime config was checked first:

- production `/config.js` returned the expected Supabase URL
- production `/config.js` returned a public `anon` JWT, not a `service_role` key
- the JWT payload matched the Supabase project ref `glzqipidalvpozkscwoy`

Direct Supabase checks showed:

- requests with no API key returned a fast `401` missing-key response
- requests with a bogus key returned a fast `401` invalid-key response
- requests with the real anon key hung/timed out while project services were unhealthy

That pattern showed the key was being sent, but Supabase project services could not complete the request because the project database connection path was unhealthy.

## Root Cause

The practical root cause was a Supabase project database connection failure. The database/pooler layer stopped accepting or providing connections to dependent services.

When the database is unhealthy, these services can fail together:

- Auth, because login checks need the database
- PostgREST, because table reads/writes need the database
- Storage metadata, because object metadata relies on the database
- Realtime, because it must connect to the project database

Most likely triggers:

- transient Supabase project service/pooler fault
- recently restored/woken project still becoming operational
- too many database connections
- project compute/resource pressure
- database connection limit misconfiguration

No code change in JalaSai was identified as the cause.

## Resolution

The Supabase database was restarted from the Supabase dashboard.

After restart:

- Supabase services recovered
- the app connected correctly again
- no Cloudflare secret or app deployment change was required

## Recovery Runbook

If this happens again:

1. Open Supabase dashboard for project `glzqipidalvpozkscwoy`.
2. Check Project Status.
3. If Database, Auth, PostgREST, or Storage are unhealthy, restart the database.
4. Wait 2-5 minutes.
5. Refresh Project Status until services are healthy.
6. Retry `Connect & Sync` in JalaSai.

If it repeats after restart, inspect database resource and connection pressure:

```sql
select count(*) from pg_stat_activity;
select datconnlimit from pg_database where datname = 'postgres';
```

`datconnlimit` should normally be `-1`. If it is changed to another value, reset it:

```sql
ALTER DATABASE postgres CONNECTION LIMIT DEFAULT;
```

Also review Supabase metrics for CPU, RAM, disk, and active connections.

## Prevention

- Keep Supabase project health visible during cloud-sync incidents.
- Treat simultaneous Auth/PostgREST/Storage unhealthy status as a backend-project issue first.
- Do not rotate Cloudflare keys unless key validation clearly fails with `401 Invalid API key`.
- If this repeats, upgrade Supabase compute or tune database queries/connections.
- Keep JalaSai local-first behavior intact so staff can continue viewing cached local data when cloud is temporarily unavailable.

## Operator Note

The app-side warning added on 2026-06-07 is intentionally broad. It covers wrong keys, network failures, and an unhealthy Supabase backend. During this incident the warning was correct because Supabase was not responding normally, even though the configured key itself was valid.
