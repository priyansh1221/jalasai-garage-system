# Security and Public Release Notes

Last updated: 2026-04-23

## Publishing Policy

This deployment note covers the current JalaSai build and the files that control cloud access.

Current posture to review before sharing a build:

- browser-side deployment uses an anon-key client configuration in `js/cloud-config.js`
- the nightly backup workflow uses the Supabase service-role key ONLY inside GitHub Actions secrets; dumps are pushed to a private repo and must never land in this public repo
- local/sensitive artifacts should still be excluded through `.gitignore`

## Required Private Handling

Keep the following private and never commit real values:

- Supabase anon keys
- Supabase service role keys
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
