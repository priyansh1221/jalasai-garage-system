// Restore / check a JalaSai nightly backup against a Supabase project.
//
// Usage (service-role key from the TARGET project's dashboard; never put it in
// the app or commit it):
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE=... \
//     node scripts/supabase-restore.mjs <backup-folder> [mode] [--tables=a,b]
//
// <backup-folder> holds <table>.json or <table>.json.gz files (a daily/ or
// monthly/ folder downloaded from R2, or a folder from the backup repo).
//
// Modes:
//   --check            (default) read-only: rows in backup vs rows in target.
//   --insert-missing   adds only rows whose id the target doesn't have. Safe
//                      on the live project: it never changes an existing row,
//                      so newer edits are kept. Use it to bring back rows that
//                      vanished. (Undoing an edit or a soft delete: use
//                      garage_row_history instead.)
//   --overwrite        writes every backup row over the target's copy. ONLY
//                      for an empty scratch project (e.g. to inspect an old
//                      day). Refuses unless --confirm=<project-ref> matches
//                      SUPABASE_URL, because on live it would undo every edit
//                      made since the backup.
import { readdir, readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const SERVICE_ROLE = (process.env.SUPABASE_SERVICE_ROLE || '').trim();
const args = process.argv.slice(2);
const folder = args.find(a => !a.startsWith('--'));
const mode = args.includes('--overwrite') ? 'overwrite' : args.includes('--insert-missing') ? 'insert-missing' : 'check';
const onlyTables = (args.find(a => a.startsWith('--tables=')) || '').slice('--tables='.length).split(',').filter(Boolean);
const confirm = (args.find(a => a.startsWith('--confirm=')) || '').slice('--confirm='.length);
const BATCH = 500;

// Tables written by the app. garage_daily_totals is rebuilt on the server
// (jalasai_rebuild_daily_totals) and garage_row_history is append-only, so
// neither is restored by default.
const RESTORABLE = [
  'garage_customers', 'garage_mechanics', 'garage_jobs', 'garage_job_payments',
  'garage_stock_items', 'garage_expenses', 'garage_income_entries',
  'garage_parts_log', 'garage_audit_log', 'garage_stock_movements',
];
const KEY_COLUMN = { garage_sync_heartbeat: 'device_id', garage_row_history: 'history_id' };

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!folder) fail('give the backup folder: node scripts/supabase-restore.mjs <folder> [--check|--insert-missing|--overwrite]');
if (!SUPABASE_URL || !SERVICE_ROLE) fail('set SUPABASE_URL and SUPABASE_SERVICE_ROLE for the TARGET project');
const projectRef = (SUPABASE_URL.match(/^https?:\/\/([^.]+)\./) || [])[1] || SUPABASE_URL;
if (mode === 'overwrite' && confirm !== projectRef) {
  fail(`--overwrite replaces newer data. It is meant for an empty scratch project only. Re-run with --confirm=${projectRef} if this target really is a scratch project.`);
}

const headers = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json' };

async function readDump(file) {
  const raw = await readFile(file);
  const text = file.endsWith('.gz') ? gunzipSync(raw).toString('utf8') : raw.toString('utf8');
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) throw new Error(`${path.basename(file)} is not a table dump`);
  return rows;
}

async function targetCount(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${KEY_COLUMN[table] || 'id'}`, {
    method: 'HEAD',
    headers: { ...headers, Prefer: 'count=exact', Range: '0-0' },
  });
  if (!res.ok && res.status !== 206) throw new Error(`${table}: HTTP ${res.status}`);
  const range = res.headers.get('content-range') || '';
  return Number(range.split('/')[1] || 0);
}

async function existingIds(table, ids) {
  const key = KEY_COLUMN[table] || 'id';
  const found = new Set();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const list = chunk.map(id => `"${String(id).replace(/"/g, '\\"')}"`).join(',');
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${key}&${key}=in.(${encodeURIComponent(list)})`, { headers });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    (await res.json()).forEach(row => found.add(String(row[key])));
  }
  return found;
}

async function writeRows(table, rows, resolution) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${KEY_COLUMN[table] || 'id'}`, {
      method: 'POST',
      headers: { ...headers, Prefer: `resolution=${resolution},return=minimal` },
      body: JSON.stringify(rows.slice(i, i + BATCH)),
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
  }
}

const files = (await readdir(folder)).filter(f => /\.json(\.gz)?$/.test(f) && !f.startsWith('manifest'));
const summary = [];
for (const file of files.sort()) {
  const table = file.replace(/\.json(\.gz)?$/, '');
  if (onlyTables.length && !onlyTables.includes(table)) continue;
  const rows = await readDump(path.join(folder, file));
  const line = { table, backup: rows.length };
  try {
    line.target = await targetCount(table);
    if (mode !== 'check') {
      if (!RESTORABLE.includes(table) && !onlyTables.includes(table)) {
        line.action = 'skipped (not restored by default)';
      } else if (mode === 'insert-missing') {
        const key = KEY_COLUMN[table] || 'id';
        const have = await existingIds(table, rows.map(r => r[key]));
        const missing = rows.filter(r => !have.has(String(r[key])));
        if (missing.length) await writeRows(table, missing, 'ignore-duplicates');
        line.action = `inserted ${missing.length} missing`;
      } else {
        await writeRows(table, rows, 'merge-duplicates');
        line.action = `wrote ${rows.length}`;
      }
    }
  } catch (err) {
    line.error = err.message;
  }
  summary.push(line);
  console.log(JSON.stringify(line));
}
if (mode !== 'check' && summary.some(l => l.table === 'garage_jobs' && !l.error)) {
  console.log('Jobs changed: in the SQL editor run  select public.jalasai_rebuild_daily_totals();  so report totals match.');
}
process.exit(summary.some(l => l.error) ? 1 : 0);
