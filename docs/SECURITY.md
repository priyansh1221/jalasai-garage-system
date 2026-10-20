# Security and Public Release Notes

Last updated: 2026-10-20

## Publishing Policy

This deployment note covers the current JalaSai build and the files that control cloud access.

Current posture to review before sharing a build:

- browser-side deployment uses an anon-key client configuration in `js/cloud-config.js`
- the nightly backup workflow uses the Supabase service-role key ONLY inside GitHub Actions secrets; dumps are pushed to a private repo and must never land in this public repo
- local/sensitive artifacts should still be excluded through `.gitignore`
- the fast-sync SQL functions (`jalasai_changes_since`, `jalasai_recent_jobs`, `jalasai_jobs_before`, `jalasai_invoice_totals`, `jalasai_max_invoice_no`) are `security invoker`: they run with the caller's own Row Level Security, so they expose nothing beyond what a signed-in user can already read
- `garage_row_history` (old versions of every overwritten or deleted row) is readable by signed-in users and written only by its trigger
- the later 2026-10 functions (report totals, record hashes, search, upload queue, ledger, invoice-number claims, roles) are granted to signed-in users. Read functions run with the caller's own Row Level Security; the few that run with raised rights (invoice-number claims, roles, statement links, the totals and ledger triggers) do one narrow job and check the caller's role where it matters. The only function meant for visitors who aren't signed in is `jalasai_statement_by_token`
- the ledger (`garage_ledger_entries`) and `garage_row_history` are written only by their triggers; signed-in users can read them but can't insert, edit or delete rows
- **staff roles** (after `supabase/2026-10-customer-features-stage6.sql`): until an owner is claimed, every signed-in user keeps full access, as before. After that, mechanics can't read the ledger, report totals or statement links, and only the owner can change roles. These are Row Level Security rules on the server, not just hidden buttons. The Reports `1122` gate is still a device-only check
- **customer statement links** (`/statement?t=…`): the token is 64 random hex characters (256 bits), valid 30 days, revocable. Anyone holding the link can see that one customer's balance and entries of the last year, plus the garage name, phone, address and UPI ID; nothing else. The page sends `noindex` and `no-referrer`. The anon key can call only `jalasai_statement_by_token`; it can't list links or read any table
- R2 backup secrets (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) live only in GitHub Actions secrets; the R2 token should have Object Read & Write on the backup bucket only, and the bucket stays private
- `scripts/supabase-restore.mjs` takes the service-role key from the environment only; `--overwrite` refuses without `--confirm=<project ref>`

## Required Private Handling

Keep the following private and never commit real values:

- Supabase anon keys
- Supabase service role keys
- Cloudflare R2 access keys
- customer statement links (each one opens that customer's account)
- Production project URLs you do not want publicly associated
- Staff/admin identity lists if privacy is required
- Business exports and worksheets
- real device IDs, sync traces, and business diagnostic screenshots if privacy is required

## Before Publishing Checklist

1. Search the repository for secrets.
2. Verify `js/cloud-config.js` points to the intended Supabase project for that deployment.
3. Verify no backup dumps or service-role keys are staged.
4. Confirm no private spreadsheets or exports are staged.
5. Rotate any key that was previously exposed.

## Important Reality

A shared repository cannot technically prevent viewing of committed source code.

What you can enforce:

- Avoid exposing service-role credentials or operational Drive IDs beyond the operator environment
- Use restrictive licensing terms
- Keep operator-only values private where possible
- Treat built-in deployment config as controlled distribution material

## If a Key Was Leaked Earlier

Immediately:

1. Revoke or rotate the key at provider level.
2. Replace with new key in your private environment only.
3. Purge leaked key from git history before public release.
4. Push the cleaned history to a new public repository.
