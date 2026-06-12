// Nightly Supabase table backup for JalaSai Garage System.
//
// Dumps every live shadow table as JSON into ./backup-out/.
// Requires environment variables (set as GitHub Actions secrets):
//   SUPABASE_URL          — project URL (https://xxxx.supabase.co)
//   SUPABASE_SERVICE_ROLE — service-role key (NEVER ship this to the browser;
//                           it exists only inside the GitHub Actions runner)
//
// Exits 0 with a notice when secrets are missing, so the scheduled workflow
// stays green until the owner configures it.

import { mkdir, writeFile } from 'node:fs/promises';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const SERVICE_ROLE = (process.env.SUPABASE_SERVICE_ROLE || '').trim();
const OUT_DIR = process.env.BACKUP_OUT_DIR || 'backup-out';
const PAGE = 1000;

const TABLES = [
  'garage_customers',
  'garage_mechanics',
  'garage_jobs',
  'garage_job_payments',
  'garage_stock_items',
  'garage_expenses',
  'garage_income_entries',
  'garage_parts_log',
  'garage_audit_log',
  'garage_stock_movements',
  'garage_sync_heartbeat',
];

const ORDER_COLUMNS = {
  garage_sync_heartbeat: 'device_id',
};

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.log('::notice::SUPABASE_URL / SUPABASE_SERVICE_ROLE secrets not set — backup skipped.');
  process.exit(0);
}

async function fetchTable(table) {
  const rows = [];
  const orderColumn = ORDER_COLUMNS[table] || 'id';
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=${orderColumn}.asc`, {
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        Range: `${from}-${from + PAGE - 1}`,
        Prefer: 'count=exact',
      },
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    const chunk = await res.json();
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return rows;
}

const stamp = new Date().toISOString().slice(0, 10);
await mkdir(OUT_DIR, { recursive: true });
const summary = {};
for (const table of TABLES) {
  try {
    const rows = await fetchTable(table);
    summary[table] = rows.length;
    await writeFile(`${OUT_DIR}/${table}.json`, JSON.stringify(rows));
    console.log(`${table}: ${rows.length} rows`);
  } catch (err) {
    // A missing table (e.g. schema not fully applied) should not kill the
    // whole backup — record the failure and keep dumping the rest.
    summary[table] = `ERROR: ${err.message}`;
    console.error(`::warning::${table} backup failed: ${err.message}`);
  }
}
await writeFile(`${OUT_DIR}/manifest.json`, JSON.stringify({ backedUpAt: new Date().toISOString(), date: stamp, tables: summary }, null, 2));
console.log('Backup complete:', JSON.stringify(summary));
