# Security and Public Release Notes

Last updated: 2026-04-06

## Publishing Policy

This public repository is intended for portfolio review and architecture demonstration.

Security posture applied:

- No production API keys committed
- Cloud defaults in `js/cloud-config.js` kept empty
- Backup automation secrets live only in GitHub Actions secrets (never in the repo)
- Local/sensitive artifacts excluded through `.gitignore`

## Required Private Handling

Keep the following private and never commit real values:

- Supabase anon keys
- Supabase service role keys
- Production project URLs you do not want publicly associated
- Staff/admin identity lists if privacy is required
- Business exports and worksheets

## Before Publishing Checklist

1. Search the repository for secrets.
2. Verify `js/cloud-config.js` contains placeholders only.
3. Verify no backup dumps or service-role keys are staged (backups go to the private backup repo via Actions secrets).
4. Confirm no private spreadsheets or exports are staged.
5. Rotate any key that was previously exposed.

## Important Reality

A public repository cannot technically prevent viewing of committed source code.

What you can enforce:

- Keep credentials out of git
- Use restrictive licensing terms
- Keep operational values private
- Avoid shipping direct, ready-to-run production config

## If a Key Was Leaked Earlier

Immediately:

1. Revoke or rotate the key at provider level.
2. Replace with new key in your private environment only.
3. Purge leaked key from git history before public release.
4. Push the cleaned history to a new public repository.
