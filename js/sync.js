// ═══════════════════════════════════════════════════════
//  Cloud backend sync — Supabase + local cache fallback
// ═══════════════════════════════════════════════════════

const CLOUD_PHOTO_BUCKET = 'job-photos';
const CLOUD_SYNC_DISABLED = false;
const SHADOW_SYNC_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
const SHADOW_BATCH_SIZE = 1000;
const STALE_DEVICE_PULL_MS = 7 * 24 * 60 * 60 * 1000;
const STARTUP_PULL_COOLDOWN_MS = 30 * 60 * 1000;
const AUTOMATIC_PULL_COOLDOWN_MS = 5 * 60 * 1000;
const AUTO_PUSH_DELAY_MS = 8000;
const AUTO_PUSH_BUSY_RETRY_MS = 60000;
const REALTIME_PULL_DEBOUNCE_MS = 12000;
const REALTIME_EVENT_BATCH_MS = 400;
const BACKGROUND_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const RECENT_REFRESH_CHUNK_SIZE = 10;
const OPTIMISTIC_SYNC_FAILURE_TOAST_COOLDOWN_MS = 60 * 1000;
const REALTIME_RECONNECT_DELAYS_MS = Object.freeze([2000, 4000, 8000, 30000]);
const RECENT_CLOUD_REFRESH_WINDOW_MS = 2 * 60 * 1000;
const VISIBILITY_GAP_FILL_MS = RECENT_CLOUD_REFRESH_WINDOW_MS;
const RECONNECT_GAP_FILL_MS = RECENT_CLOUD_REFRESH_WINDOW_MS;
// Cap how far back a reconnect sweep reaches. A device that was offline for a
// while must fetch every change since it last pulled — including tombstones,
// which a normal live pull (deleted_at is null) can never see — so deletes made
// elsewhere are not resurrected. Bounded so a long-idle device stays cheap.
const MAX_GAP_FILL_MS = 7 * 24 * 60 * 60 * 1000;

// Window for the recent-changes sweep: long enough to cover the gap since this
// device last pulled, but never below the steady-state window and never above
// the cap. This is what lets the delete-aware sweep close offline delete gaps.
function gapFillWindowMs(minWindowMs = RECENT_CLOUD_REFRESH_WINDOW_MS) {
  const sinceLastPull = syncAgeMs(syncMeta.lastPulledAt);
  if (!Number.isFinite(sinceLastPull)) return MAX_GAP_FILL_MS;
  return Math.min(MAX_GAP_FILL_MS, Math.max(minWindowMs, sinceLastPull + 30 * 1000));
}
const IO_SAVER_SYNC = true;
// IO-saver pushes only rows changed in the recent sync window, so records
// created before the shadow tables existed (old mechanics, customers, stock)
// never reached the cloud and fresh browsers pulled an incomplete dataset.
// A hash-diffed full mirror on the first sync per device (refreshed weekly)
// heals those gaps without giving up the delta-push savings.
const FULL_MIRROR_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const IO_SAVER_CHANGED_SLOP_MS = 5 * 60 * 1000;
// Emergency guard: a stale device can have an older local payload that is
// missing valid cloud rows. Do not infer cloud deletes from absence.
const SHADOW_INFER_DELETES = false;
// Multi-tenant groundwork (Phase 5, 2026-06-12). Leave FALSE until the
// tenant_id ALTER TABLE block in supabase/schema.sql has been run once on
// the live project — pushing the column before it exists would fail every
// sync. After running the SQL, flip to true so rows carry tenant_id.
const JALASAI_SEND_TENANT_ID = false;
const JALASAI_TENANT_ID = 'jalasai';
// `primary` names the payload array a table's rows are built from, so
// IO-saver pushes can drop out-of-window records BEFORE the expensive
// row build/hash instead of after (jobPayments derives from jobs).
const SHADOW_SYNC_TABLES = Object.freeze([
  { key: 'customers', table: 'garage_customers', buildRows: buildCustomerShadowRows, primary: 'customers' },
  { key: 'mechanics', table: 'garage_mechanics', buildRows: buildMechanicShadowRows, primary: 'mechanics' },
  { key: 'jobs', table: 'garage_jobs', buildRows: buildJobShadowRows, primary: 'jobs' },
  { key: 'jobPayments', table: 'garage_job_payments', buildRows: buildJobPaymentShadowRows, primary: 'jobs' },
  { key: 'stock', table: 'garage_stock_items', buildRows: buildStockItemShadowRows, primary: 'stock' },
  { key: 'expenses', table: 'garage_expenses', buildRows: buildExpenseShadowRows, primary: 'expenses' },
  { key: 'incomeEntries', table: 'garage_income_entries', buildRows: buildIncomeEntryShadowRows, primary: 'incomeEntries' },
  { key: 'partsLog', table: 'garage_parts_log', buildRows: buildPartsLogShadowRows, primary: 'partsLog' },
  { key: 'auditLog', table: 'garage_audit_log', buildRows: buildAuditLogShadowRows, primary: 'auditLog' },
  { key: 'stockMovements', table: 'garage_stock_movements', buildRows: buildStockMovementShadowRows, primary: 'stockMovements' },
]);

// Pull business-critical tables first so invoices are not blocked by slower
// supporting tables such as audit/import history.
const SHADOW_PULL_PRIORITY = Object.freeze([
  'jobs',
  'incomeEntries',
  'expenses',
  'customers',
  'mechanics',
  'stock',
]);
const SHADOW_PULL_REQUIRED = Object.freeze(['jobs']);
const REALTIME_SHADOW_TABLES = Object.freeze([
  { key: 'jobs', table: 'garage_jobs', pages: ['jobs', 'invoices', 'customers', 'reminders', 'reports'] },
  { key: 'stock', table: 'garage_stock_items', pages: ['stock', 'print'] },
  { key: 'customers', table: 'garage_customers', pages: ['customers', 'jobs', 'invoices', 'reminders'] },
  { key: 'expenses', table: 'garage_expenses', pages: ['expenses', 'reports'] },
  { key: 'incomeEntries', table: 'garage_income_entries', pages: ['income', 'invoices', 'jobs', 'reports'] },
  { key: 'mechanics', table: 'garage_mechanics', pages: ['mechanics', 'jobs', 'reports'] },
  { key: 'auditLog', table: 'garage_audit_log', pages: ['logs'] },
]);

const SYNC_DOMAIN_TABLE_KEYS = Object.freeze({
  jobs: ['jobs', 'jobPayments', 'customers', 'partsLog', 'auditLog'],
  job: ['jobs', 'jobPayments', 'customers', 'partsLog', 'auditLog'],
  invoices: ['jobs', 'jobPayments', 'customers', 'auditLog'],
  invoice: ['jobs', 'jobPayments', 'customers', 'auditLog'],
  payments: ['jobs', 'jobPayments', 'customers', 'auditLog'],
  payment: ['jobs', 'jobPayments', 'customers', 'auditLog'],
  stock: ['stock', 'partsLog', 'stockMovements', 'auditLog'],
  customers: ['customers', 'auditLog'],
  customer: ['customers', 'auditLog'],
  reminders: ['customers', 'auditLog'],
  reminder: ['customers', 'auditLog'],
  expenses: ['expenses', 'auditLog'],
  expense: ['expenses', 'auditLog'],
  income: ['incomeEntries', 'auditLog'],
  mechanics: ['mechanics', 'auditLog'],
  mechanic: ['mechanics', 'auditLog'],
  logs: ['auditLog'],
  audit: ['auditLog'],
});

// Pull tables — same as SHADOW_SYNC_TABLES but excludes derived jobPayments table
const SHADOW_PULL_TABLES = Object.freeze(
  SHADOW_SYNC_TABLES.filter(c => c.key !== 'jobPayments')
    .sort((a, b) => {
      const ai = SHADOW_PULL_PRIORITY.indexOf(a.key);
      const bi = SHADOW_PULL_PRIORITY.indexOf(b.key);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    })
);

let cloudClient = null;
let cloudSyncTimer = null;
let cloudBackgroundTimer = null;
let cloudSyncBusy = false;
let cloudSessionActive = false;
let cloudAuthBound = false;
let realtimeChannel = null;
let lastAutomaticPullAt = 0;
let lastOptimisticSyncFailureToastAt = 0;
let realtimeReconnectTimer = null;
let realtimeReconnectAttempt = 0;
let recentRefreshBusy = false;
let recentSyncBusy = false;
let pendingAutoSyncTableKeys = new Set();
let pendingAutoSyncFullScope = false;

function beginRecentSyncWork() {
  if (recentSyncBusy) return false;
  recentSyncBusy = true;
  return true;
}

function endRecentSyncWork() {
  recentSyncBusy = false;
}

function yieldRecentRefreshChunk() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function syncTableKeysForDomains(domainInput) {
  if (!domainInput) return null;
  const requested = Array.isArray(domainInput) ? domainInput : String(domainInput).split(/[,\s]+/);
  const keys = new Set();
  for (const raw of requested) {
    const domain = String(raw || '').trim();
    if (!domain) continue;
    const mapped = SYNC_DOMAIN_TABLE_KEYS[domain];
    if (!mapped) return null;
    mapped.forEach(key => keys.add(key));
  }
  return keys.size ? keys : null;
}

function rememberAutoSyncScope(options = {}) {
  const domainInput = options.domains || options.domain;
  if (!domainInput) {
    if (!pendingAutoSyncFullScope && !pendingAutoSyncTableKeys.size) pendingAutoSyncFullScope = true;
    return;
  }
  const keys = syncTableKeysForDomains(domainInput);
  if (!keys) {
    pendingAutoSyncFullScope = true;
    pendingAutoSyncTableKeys.clear();
    return;
  }
  if (pendingAutoSyncFullScope) return;
  keys.forEach(key => pendingAutoSyncTableKeys.add(key));
}

function consumeAutoSyncScope() {
  const tableKeys = pendingAutoSyncFullScope ? null : [...pendingAutoSyncTableKeys];
  pendingAutoSyncFullScope = false;
  pendingAutoSyncTableKeys.clear();
  return tableKeys && tableKeys.length ? tableKeys : null;
}

function restoreAutoSyncScope(tableKeys) {
  if (!Array.isArray(tableKeys) || !tableKeys.length) {
    pendingAutoSyncFullScope = true;
    pendingAutoSyncTableKeys.clear();
    return;
  }
  if (pendingAutoSyncFullScope) return;
  tableKeys.forEach(key => pendingAutoSyncTableKeys.add(key));
}

function showOptimisticSyncFailureToast(msg = '') {
  const now = Date.now();
  if (now - lastOptimisticSyncFailureToastAt < OPTIMISTIC_SYNC_FAILURE_TOAST_COOLDOWN_MS) return;
  lastOptimisticSyncFailureToastAt = now;
  toast(`Saved on this device. Cloud sync failed — tap Sync Now to retry.${msg ? ' ' + msg : ''}`, 5200);
}

function realtimeOnline() {
  realtimeReconnectAttempt = 0;
  clearTimeout(realtimeReconnectTimer);
  realtimeReconnectTimer = null;
  if (cloudSessionActive) updateGSStatus('Cloud connected. Realtime sync active.');
}

function realtimePaused(reason = 'Sync paused') {
  updateGSStatus(reason);
}

function scheduleRealtimeReconnect(client) {
  if (!client || realtimeReconnectTimer) return;
  const delay = REALTIME_RECONNECT_DELAYS_MS[Math.min(realtimeReconnectAttempt, REALTIME_RECONNECT_DELAYS_MS.length - 1)];
  realtimeReconnectAttempt += 1;
  realtimePaused(`Sync paused. Reconnecting in ${Math.round(delay / 1000)}s...`);
  realtimeReconnectTimer = setTimeout(() => {
    realtimeReconnectTimer = null;
    if (!cloudSessionActive || cloudSyncBusy || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    startRealtimeSync(client);
  }, delay);
}

function updateQuickSyncButton() {
  const btn = document.getElementById('quick-sync-btn');
  if (!btn) return;
  if (CLOUD_SYNC_DISABLED) {
    btn.style.display = 'none';
    return;
  }
  const ready = canUseCloudConfig() && cloudSessionActive;
  const needsAttention = cloudSyncBusy || syncMeta.pendingSync || syncMeta.lastSyncError;
  btn.style.display = ready && needsAttention ? '' : 'none';
  btn.disabled = cloudSyncBusy;
  btn.textContent = cloudSyncBusy
    ? 'Syncing...'
    : syncMeta.pendingSync && syncMeta.lastSyncError
      ? 'Retry Sync'
      : 'Sync Now';
  btn.className = cloudSyncBusy
    ? 'gs-badge'
    : ready && syncMeta.pendingSync && syncMeta.lastSyncError
      ? 'gs-badge off'
      : ready
        ? 'gs-badge'
        : 'gs-badge off';
}

async function quickSyncNow() {
  if (CLOUD_SYNC_DISABLED) {
    toast('Cloud sync is disabled for this build', 2600);
    return;
  }
  if (cloudSyncBusy) {
    toast('Cloud sync already running', 2200);
    return;
  }
  if (!canUseCloudConfig() || !cloudSessionActive) {
    toast('Sign in to cloud first', 2600);
    return;
  }
  await syncLatestThenPush({ quiet: false, reason: 'manual' });
}

function openGS() {
  openM('m-gs');
  setCloudConnectLoading(false);
  setCloudLoginFeedback('');
  document.getElementById('gs-url').value = gsUrl;
  document.getElementById('cloud-key').value = cloudKey || '';
  document.getElementById('cloud-email').value = cloudEmail || '';
  document.getElementById('cloud-password').value = '';
  const hasBuiltInConfig = !!(CLOUD_DEFAULTS.projectUrl && CLOUD_DEFAULTS.anonKey);
  const urlRow = document.getElementById('cloud-url-row');
  const keyRow = document.getElementById('cloud-key-row');
  const prefillNote = document.getElementById('cloud-prefill-note');
  if (urlRow) urlRow.style.display = hasBuiltInConfig ? 'none' : '';
  if (keyRow) keyRow.style.display = hasBuiltInConfig ? 'none' : '';
  // Developer setup card (old UI only) is irrelevant once the project
  // connection ships inside the build — staff only sign in.
  const setupCard = document.getElementById('gs-setup-instructions');
  if (setupCard) setupCard.style.display = hasBuiltInConfig ? 'none' : '';
  if (prefillNote) {
    prefillNote.textContent = hasBuiltInConfig
      ? 'Project connection is already built into this app. Staff only need email and password on each device.'
      : 'This build does not include the Supabase project connection yet. Enter project URL, anon key, email, and password here.';
  }
  updateGSStatus(CLOUD_SYNC_DISABLED
    ? 'Cloud pull/push is disabled. Keep using local data and do weekly backups outside this system.'
    : canUseCloudConfig()
      ? (cloudSessionActive ? 'Cloud connected. Local cache stays available offline.' : 'Project saved. Enter your password to sign in.')
      : 'Enter Supabase Project URL, anon key, email, and password to connect cloud sync.'
  );
  renderSyncDiagnostics();
}

function updateGSBadge() {
  const b = document.getElementById('gs-badge');
  if (!b) return;
  if (CLOUD_SYNC_DISABLED) {
    b.textContent = '☁ Cloud: DISABLED';
    b.className = 'gs-badge off';
    updateQuickSyncButton();
    return;
  }
  if (cloudSessionActive) {
    b.textContent = '☁ Cloud: ON';
    b.className = 'gs-badge';
  } else if (canUseCloudConfig()) {
    b.textContent = '☁ Cloud: sign in to sync';
    b.className = 'gs-badge';
  } else {
    b.textContent = '☁ Offline · saved on device';
    b.className = 'gs-badge off';
  }
  updateQuickSyncButton();
}

function updateGSStatus(msg) {
  const el = document.getElementById('gs-status');
  const base = msg || '';
  const merge = String(syncMeta?.lastMergeSummary || '').trim();
  const inProgress = /pulling|sending|syncing|preparing|copying|refreshing|downloading|uploading/i.test(base);
  const failure = /failed|error|timeout|timed out|canceling statement/i.test(base);
  if (el) el.textContent = merge && !inProgress && !failure ? `${base} · ${merge}` : base;
  updateQuickSyncButton();
  renderSyncDiagnostics();
  if (typeof updateSharedSyncOverlay === 'function' && window.__JALASAI_INITIAL_LOAD_OVERLAY) updateSharedSyncOverlay(base);
}

function renderSyncDiagnostics() {
  const box = document.getElementById('sync-diagnostics');
  if (!box) return;
  if (CLOUD_SYNC_DISABLED) {
    box.innerHTML = `
      <div style="color:var(--mut);font-size:12px;line-height:1.5;">
        Cloud sync is disabled for this build.
        Data stays local on this device, and weekly copies should be handled outside the app.
      </div>`;
    return;
  }
  const rows = [
    ['Device ID', syncMeta.deviceId || '—'],
    ['Local Updated', syncMeta.updatedAt ? fmtDateTime(syncMeta.updatedAt) : '—'],
    ['Last Pull', syncMeta.lastPulledAt ? fmtDateTime(syncMeta.lastPulledAt) : '—'],
    ['Last Push', syncMeta.lastPushedAt ? fmtDateTime(syncMeta.lastPushedAt) : '—'],
    ['Pending Local Changes', syncMeta.pendingSync ? `Yes${syncMeta.pendingSince ? ' · since ' + fmtDateTime(syncMeta.pendingSince) : ''}` : 'No'],
    ['Local Backup', syncMeta.localBackupAt ? fmtDateTime(syncMeta.localBackupAt) : '—'],
    syncMeta.lastSyncError ? ['Last Sync Error', syncMeta.lastSyncError] : null,
    syncMeta.lastMergeSummary ? ['Last Merge', syncMeta.lastMergeSummary] : null,
    ['Table Sync', syncMeta.shadowLastMirrorError
      ? `Failed · ${fmtDateTime(syncMeta.shadowLastMirrorAt)} — ${shadowMirrorErrorMessage(syncMeta.shadowLastMirrorError)}`
      : syncMeta.shadowLastMirrorSummary
        ? `${syncMeta.shadowLastMirrorSummary}${syncMeta.shadowLastMirrorAt ? ' · ' + fmtDateTime(syncMeta.shadowLastMirrorAt) : ''}`
        : 'Not synced yet'],
    ['Cloud Session', cloudSessionActive ? (cloudEmail || 'Signed in') : 'Not signed in'],
  ].filter(Boolean);
  box.innerHTML = rows.map(([label, value]) => `
    <div class="mrow">
      <span style="color:var(--mut);">${label}</span>
      <span style="text-align:right;max-width:60%;word-break:break-word;">${value}</span>
    </div>
  `).join('');
  const junkCount = findImportReviewJunkJobs().length;
  if (junkCount) {
    box.innerHTML += `
      <div class="mrow" style="align-items:center;">
        <span style="color:var(--warn);">Imported review rows on Job Board</span>
        <span style="text-align:right;">
          <button class="btn btn-g btn-sm" onclick="cleanImportReviewJunkJobs()">Remove ${junkCount} rows</button>
        </span>
      </div>`;
  }
}

// The Khatabook legacy import flagged unclear rows as "kb-review-NNNN"
// review items; some ended up inside the jobs store, where they render as
// placeholder "Customer / Vehicle / Work" cards on the Job Board. They were
// never real jobs. Cleanup soft-deletes them through the normal tombstone
// path so the removal syncs to cloud and every device.
function findImportReviewJunkJobs() {
  return (typeof jobs !== 'undefined' ? jobs : []).filter(j =>
    /^kb-review-/.test(String(j?.id || '')) && !j.deletedAt);
}

function cleanImportReviewJunkJobs() {
  if (!requireCloudWriteAccess('remove imported review rows')) return;
  const junk = findImportReviewJunkJobs();
  if (!junk.length) { toast('No imported review rows found', 2200); return; }
  if (!confirm(`Remove ${junk.length} imported Khatabook review rows (kb-review-*)? They are not real jobs. They will disappear from the Job Board on every synced device.`)) return;
  const ts = nowISO();
  junk.forEach(j => { j.deletedAt = ts; j.updatedAt = ts; });
  logAction('delete', 'job', 'kb-review-cleanup', { count: junk.length, reason: 'khatabook import review rows' });
  saveAll({ domain: 'jobs' });
  if (typeof renderJobs === 'function') renderJobs();
  renderSyncDiagnostics();
  toast(`Removed ${junk.length} imported review rows`, 3200);
}

function syncErrMsg(err, fallback) {
  const msg = err && (err.message || err.error_description || err.details || err.hint)
    ? (err.message || err.error_description || err.details || err.hint)
    : fallback;
  return `${fallback}${msg && msg !== fallback ? ' (' + msg + ')' : ''}`;
}

function isAuthCredentialError(err) {
  const raw = String(err?.message || err?.error_description || err?.details || err || '').toLowerCase();
  return /invalid login|invalid credentials|email.*password|password.*invalid|invalid email|user not found|login credentials/i.test(raw);
}

function isCloudConfigFetchError(err) {
  const raw = String(err?.message || err?.error_description || err?.details || err?.hint || err || '').toLowerCase();
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|timed out|aborted/i.test(raw);
}

function cloudSetupFriendlyMessage(err, fallback = 'Cloud setup failed') {
  if (isAuthCredentialError(err)) {
    return 'Email or password is wrong. Please check and try again.';
  }
  if (isCloudConfigFetchError(err)) {
    return 'Supabase project URL or anon/publishable key may be wrong, or Supabase is not responding.';
  }
  return syncErrMsg(err, fallback);
}

function setCloudLoginFeedback(message = '', options = {}) {
  const el = document.getElementById('cloud-login-feedback');
  if (!el) return;
  const text = String(message || '').trim();
  el.className = 'cloud-login-feedback';
  if (!text) {
    el.innerHTML = '';
    return;
  }
  if (options.error) el.classList.add('error');
  else if (options.warn) el.classList.add('warn');
  el.classList.add('show');
  el.innerHTML = `${options.loading ? '<span class="cloud-login-spinner" aria-hidden="true"></span>' : ''}<span>${text}</span>`;
}

function setCloudConnectLoading(loading, message = '') {
  const btn = document.getElementById('cloud-connect-btn');
  if (btn) {
    btn.disabled = !!loading;
    btn.classList.toggle('cloud-loading', !!loading);
    btn.innerHTML = loading
      ? '<span class="cloud-login-spinner" aria-hidden="true"></span><span>Connecting...</span>'
      : 'Connect & Sync';
  }
  if (loading) setCloudLoginFeedback(message || 'Connecting to cloud...', { loading: true });
}

function canUseCloudConfig() {
  return !!(window.supabase && gsUrl && cloudKey);
}

function hasAnyRecords(data) {
  if (!data || typeof data !== 'object') return false;
  return ['jobs', 'stock', 'customers', 'mechanics', 'expenses', 'incomeEntries', 'partsLog']
    .concat(['auditLog', 'stockMovements'])
    .some(key => Array.isArray(data[key]) && data[key].length);
}

function maxInvoiceNumberFromJobs(list = []) {
  return normaliseArray(list).reduce((max, job) => {
    if (!job || String(job.deletedAt || '').trim()) return max;
    const raw = String(job.invoiceNo || '').trim();
    if (!raw) return max;
    const match = raw.match(/\d+/);
    const value = match ? (parseInt(match[0], 10) || 0) : 0;
    return Math.max(max, value);
  }, 0);
}

function hasRemoteInvoicesMissingLocally(remoteJobs = [], localJobs = []) {
  const localInvoiceJobIds = new Set(
    normaliseArray(localJobs)
      .filter(job => job && !String(job.deletedAt || '').trim() && String(job.status || '').trim() === 'done' && String(job.invoiceNo || '').trim())
      .map(job => String(job.id || '').trim())
      .filter(Boolean)
  );
  return normaliseArray(remoteJobs).some(job =>
    job
    && !String(job.deletedAt || '').trim()
    && String(job.status || '').trim() === 'done'
    && String(job.invoiceNo || '').trim()
    && String(job.id || '').trim()
    && !localInvoiceJobIds.has(String(job.id || '').trim())
  );
}

function normaliseArray(arr) {
  return Array.isArray(arr) ? arr : [];
}

function buildSyncPayload() {
  return {
    jobs,
    stock,
    customers,
    mechanics,
    expenses,
    incomeEntries,
    partsLog,
    auditLog,
    stockMovements,
    meta: {
      jobCtr,
      invoiceCtr,
      updatedAt: syncMeta.updatedAt || nowISO(),
      deviceId: syncMeta.deviceId || '',
      adminEmails: adminEmails(),
      exportedAt: nowISO(),
    },
  };
}

function persistLocalBackupSnapshot() {
  try {
    const stamp = nowISO();
    persistLocalBackupPayload(buildSyncPayload(), stamp);
    setLocalStorageSafe(SK.syncMeta, JSON.stringify(syncMeta));
    renderSyncDiagnostics();
  } catch (err) {
    console.warn('periodic local backup failed', err);
  }
}

function snapshotStamp(payload) {
  return Date.parse(payload?.meta?.updatedAt || 0) || 0;
}

function syncAgeMs(value = '') {
  const stamp = Date.parse(value || 0) || 0;
  return stamp ? Date.now() - stamp : Number.POSITIVE_INFINITY;
}

function shouldThrottleAutomaticPull(options = {}) {
  if (!options.automatic || options.force) return false;
  const now = Date.now();
  if (lastAutomaticPullAt && now - lastAutomaticPullAt < AUTOMATIC_PULL_COOLDOWN_MS) return true;
  lastAutomaticPullAt = now;
  return false;
}

function embeddedMillisStamp(value = '') {
  const match = String(value || '').match(/\d{13}/);
  if (!match) return 0;
  const stamp = parseInt(match[0], 10) || 0;
  return stamp > 946684800000 && stamp < 4102444800000 ? stamp : 0;
}

function shadowRowStamp(row) {
  if (!row || typeof row !== 'object') return 0;
  const record = row.record_data || {};
  return Date.parse(
    row.source_updated_at
    || row.mirrored_at
    || record.updatedAt
    || record.doneAt
    || record.timestamp
    || record.createdAt
    || record.at
    || (record.date ? `${record.date}T${record.time || '00:00:00'}` : 0)
    || 0
  ) || embeddedMillisStamp(row.id || record.id || '');
}

function ioSaverRowsForPush(rows = [], options = {}) {
  if (!IO_SAVER_SYNC || options.fullMirror) return rows;
  const since = Date.parse(syncMeta.pendingSince || 0) || Date.parse(syncMeta.updatedAt || 0) || 0;
  if (!since) return rows;
  const cutoff = since - IO_SAVER_CHANGED_SLOP_MS;
  return rows.filter(row => shadowRowStamp(row) >= cutoff);
}

function ioSaverPushCutoffMs(options = {}) {
  if (!IO_SAVER_SYNC || options.fullMirror) return 0;
  const since = Date.parse(syncMeta.pendingSince || 0) || Date.parse(syncMeta.updatedAt || 0) || 0;
  return since ? since - IO_SAVER_CHANGED_SLOP_MS : 0;
}

// Record-level twin of the shadowRowStamp() filter in ioSaverRowsForPush,
// applied to source records BEFORE the expensive shadow-row build/hash.
// Must stay in lockstep with shadowTombstoneRow/shadowRecordUpdatedAt:
// tombstones stamp with deletedAt, live records with the recordStamp chain,
// and a record with no parseable stamp mirrors the nowISO() fallback (kept).
function ioSaverRecordIsRecent(record, cutoff) {
  if (!record || typeof record !== 'object') return true;
  const deletedRaw = String(record.deletedAt || record.deleted_at || '').trim();
  if (deletedRaw) {
    const deletedStamp = Date.parse(shadowTimestamp(deletedRaw) || '') || 0;
    return !deletedStamp || deletedStamp >= cutoff;
  }
  // shadowRecordUpdatedAt is what stamps the built row (nowISO() fallback for
  // records without any date field), so a record it would stamp "now" is kept.
  const stamp = Date.parse(shadowRecordUpdatedAt(record)) || 0;
  if (!stamp || stamp >= cutoff) return true;
  // Payment entries become their own garage_job_payments rows stamped with
  // the entry time — keep the parent job when any entry is inside the window.
  if (Array.isArray(record.payments) && record.payments.length) {
    return record.payments.some(entry => {
      const entryStamp = Date.parse(shadowRecordUpdatedAt(entry)) || 0;
      return !entryStamp || entryStamp >= cutoff;
    });
  }
  return false;
}

function shouldPullBeforePush(options = {}) {
  if (options.skipPreflightPull) return false;
  if (options.forcePullFirst) return true;
  return syncAgeMs(syncMeta.lastPulledAt) > STALE_DEVICE_PULL_MS;
}

async function syncLatestThenPush(options = {}) {
  if (CLOUD_SYNC_DISABLED) return false;
  if (!canUseCloudConfig()) return false;
  if (cloudSyncBusy) return 'busy';
  const quiet = !!options.quiet;
  const client = ensureCloudClient();
  const session = await getCloudSession();
  if (!client || !session) {
    syncMeta.pendingSync = true;
    syncMeta.pendingSince = syncMeta.pendingSince || syncMeta.updatedAt || nowISO();
    syncMeta.lastSyncError = 'Cloud sign-in required on this device.';
    localStorage.setItem(SK.syncMeta, JSON.stringify(syncMeta));
    updateGSStatus('Cloud configured. Sign in to sync this device.');
    if (!quiet) toast('Sign in to sync this device', 3600);
    return false;
  }

  const hadPendingLocal = !!syncMeta.pendingSync;
  updateGSStatus(options.reason === 'manual'
    ? 'Sync Now: downloading latest cloud data first...'
    : 'Refreshing this device from cloud before upload...');
  const pulled = await pullGS({
    quiet,
    allowEmpty: true,
    force: true,
    manual: options.reason === 'manual',
    replaceLocal: !hadPendingLocal,
    criticalOnly: options.criticalOnly ?? options.reason !== 'manual',
  });
  if (pulled === false || pulled === 'busy') {
    syncMeta.pendingSync = true;
    syncMeta.pendingSince = syncMeta.pendingSince || syncMeta.updatedAt || nowISO();
    syncMeta.lastSyncError = 'Cloud refresh failed before upload. Local changes are still safe on this device.';
    localStorage.setItem(SK.syncMeta, JSON.stringify(syncMeta));
    updateGSStatus(syncMeta.lastSyncError);
    if (!quiet) toast(syncMeta.lastSyncError, 4200);
    return false;
  }

  if (pulled === 'empty' || hadPendingLocal || syncMeta.pendingSync || options.alwaysPush) {
    return pushGS({ ...options, quiet, skipPreflightPull: true });
  }

  updateGSStatus('Synced latest data from cloud.');
  if (!quiet) toast('Synced latest data from cloud');
  return true;
}

function recordStamp(record) {
  if (!record || typeof record !== 'object') return 0;
  return Date.parse(
    record.updatedAt
    || record.doneAt
    || record.timestamp
    || record.createdAt
    || record.at
    || (record.date ? `${record.date}T${record.time || '00:00:00'}` : 0)
    || 0
  ) || 0;
}

function mergeByKey(remoteList, localList, keyFn, normalizeFn, options = {}) {
  const preferLocal = !!options.preferLocal;
  const localNewerSnapshot = !!options.localNewerSnapshot;
  const map = new Map();
  const upsert = (item, source) => {
    if (!item) return;
    const key = keyFn(item);
    if (!key) return;
    const normalized = normalizeFn ? normalizeFn(item) : item;
    if (!map.has(key)) {
      map.set(key, normalized);
      return;
    }
    const existing = map.get(key);
    const existingDeleted = !!String(existing?.deletedAt || '').trim();
    const incomingDeleted = !!String(normalized?.deletedAt || '').trim();
    if (existingDeleted || incomingDeleted) {
      if (incomingDeleted && !existingDeleted) {
        map.set(key, normalized);
        return;
      }
      if (existingDeleted && !incomingDeleted) {
        return;
      }
    }
    const existingStamp = recordStamp(existing);
    const incomingStamp = recordStamp(normalized);
    if (incomingStamp && existingStamp) {
      if (incomingStamp > existingStamp) map.set(key, normalized);
      else if (incomingStamp === existingStamp && source === 'local' && preferLocal) map.set(key, normalized);
      return;
    }
    if (source === 'local' && (preferLocal || localNewerSnapshot)) map.set(key, normalized);
  };
  (remoteList || []).forEach(item => upsert(item, 'remote'));
  (localList || []).forEach(item => upsert(item, 'local'));
  return [...map.values()];
}

function mergeEventLists(remoteList, localList, keyFn) {
  const map = new Map();
  [...(remoteList || []), ...(localList || [])].forEach(item => {
    if (!item) return;
    map.set(keyFn(item), item);
  });
  return [...map.values()].sort((a, b) => recordStamp(b) - recordStamp(a));
}

// Phase 2 fix: two devices can each record a different payment on the same
// job while offline. Whole-record last-write-wins would keep only one device's
// payments[] array and silently drop the other payment. This unions every
// payment entry seen for a job (keyed by payment id, then by amount+timestamp
// for legacy entries without ids) across both remote and local copies.
function buildJobPaymentUnionIndex(...lists) {
  const index = new Map();
  lists.forEach(list => {
    (list || []).forEach(job => {
      const jobId = String(job?.id || '').trim();
      if (!jobId || !Array.isArray(job.payments) || !job.payments.length) return;
      let bucket = index.get(jobId);
      if (!bucket) { bucket = new Map(); index.set(jobId, bucket); }
      job.payments.forEach(entry => {
        if (!entry) return;
        const key = String(entry.id || '').trim()
          || `${entry.amount || 0}|${entry.method || ''}|${entry.at || entry.timestamp || ''}|${entry.source || ''}`;
        if (!bucket.has(key)) bucket.set(key, entry);
      });
    });
  });
  return index;
}

function applyJobPaymentUnion(jobsList, paymentIndex) {
  return (jobsList || []).map(job => {
    const jobId = String(job?.id || '').trim();
    const bucket = jobId ? paymentIndex.get(jobId) : null;
    if (!bucket || !bucket.size) return job;
    const merged = [...bucket.values()].sort(
      (a, b) => Date.parse(a.at || a.timestamp || 0) - Date.parse(b.at || b.timestamp || 0)
    );
    // Only widen, never shrink — if the winning record already had every
    // entry, leave it untouched so we don't disturb its other fields.
    if (merged.length <= (Array.isArray(job.payments) ? job.payments.length : 0)) return job;
    const next = { ...job, payments: merged };
    // Keep the legacy single `payment` total consistent with the union.
    next.payment = merged.reduce((sum, entry) => sum + (parseFloat(entry.amount || 0) || 0), 0);
    return next;
  });
}

function mergedSyncPayload(remoteData, localData, options = {}) {
  const localStamp = snapshotStamp(localData);
  const remoteStamp = snapshotStamp(remoteData);
  const localNewerSnapshot = localStamp >= remoteStamp;
  const preferLocal = options.preferLocal ?? localNewerSnapshot;
  const jobPaymentIndex = buildJobPaymentUnionIndex(remoteData.jobs, localData.jobs);
  const payload = {
    jobs: applyJobPaymentUnion(
      mergeByKey(remoteData.jobs, localData.jobs, item => item.id, normalizeJob, { preferLocal, localNewerSnapshot }),
      jobPaymentIndex
    ).map(normalizeJob),
    stock: mergeByKey(remoteData.stock, localData.stock, item => item.id || item.sku, normalizeStockItem, { preferLocal, localNewerSnapshot }),
    customers: mergeByKey(remoteData.customers, localData.customers, item => item.id || item.phone || item.name, normalizeCustomer, { preferLocal, localNewerSnapshot }),
    mechanics: mergeByKey(remoteData.mechanics, localData.mechanics, item => item.id || item.phone || item.name, normalizeMechanic, { preferLocal, localNewerSnapshot }),
    expenses: mergeByKey(remoteData.expenses, localData.expenses, item => item.id, normalizeExpense, { preferLocal, localNewerSnapshot }),
    incomeEntries: mergeByKey(remoteData.incomeEntries, localData.incomeEntries, item => item.id, normalizeIncomeEntry, { preferLocal, localNewerSnapshot }),
    partsLog: mergeEventLists(remoteData.partsLog, localData.partsLog, item => `${item.date || ''}|${item.time || ''}|${item.sku || ''}|${item.part || ''}`),
    auditLog: mergeEventLists(remoteData.auditLog, localData.auditLog, item => item.id || `${item.at || ''}|${item.entity || ''}|${item.entityId || ''}|${item.action || ''}`),
    stockMovements: mergeByKey(remoteData.stockMovements, localData.stockMovements, item => item.id || `${item.stockId || ''}|${item.createdAt || ''}|${item.type || ''}|${item.qty || ''}`, normalizeStockMovement, { preferLocal, localNewerSnapshot }),
    meta: {
      jobCtr: Math.max(parseInt(remoteData?.meta?.jobCtr || 1, 10) || 1, parseInt(localData?.meta?.jobCtr || 1, 10) || 1),
      invoiceCtr: Math.max(parseInt(remoteData?.meta?.invoiceCtr || 1, 10) || 1, parseInt(localData?.meta?.invoiceCtr || 1, 10) || 1),
      updatedAt: localNewerSnapshot ? (localData?.meta?.updatedAt || nowISO()) : (remoteData?.meta?.updatedAt || nowISO()),
      deviceId: syncMeta.deviceId || localData?.meta?.deviceId || remoteData?.meta?.deviceId || '',
      adminEmails: normalizedAdminEmailList(remoteData?.meta?.adminEmails, localData?.meta?.adminEmails),
      exportedAt: nowISO(),
    },
  };
  return payload;
}

function shadowStableValue(value) {
  if (Array.isArray(value)) return value.map(shadowStableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      const next = value[key];
      if (typeof next === 'undefined') return acc;
      // '_'-prefixed keys are derived runtime data (e.g. _searchText),
      // recomputed by the normalize* functions on every load — keep them
      // out of record_data and the change hash.
      if (key.charCodeAt(0) === 95) return acc;
      acc[key] = shadowStableValue(next);
      return acc;
    }, {});
  }
  return value;
}

function shadowStableStringify(value) {
  return JSON.stringify(shadowStableValue(value));
}

function shadowHashString(value) {
  const text = String(value || '');
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
  }
  return `h${(hash >>> 0).toString(16)}`;
}

function shadowSyntheticId(prefix, ...parts) {
  const raw = parts
    .map(part => {
      if (part === null || typeof part === 'undefined') return '';
      if (typeof part === 'object') return shadowStableStringify(part);
      return String(part);
    })
    .join('|');
  return `${prefix}_${shadowHashString(raw || nowISO())}`;
}

function shadowExtractText(record, keys = []) {
  for (const key of keys) {
    const value = record?.[key];
    if (value === null || typeof value === 'undefined') continue;
    const text = Array.isArray(value) ? value.join(', ') : String(value).trim();
    if (text) return text;
  }
  return '';
}

function shadowNumber(value) {
  return parseFloat(value || 0) || 0;
}

function shadowTimestamp(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00:00.000Z`;
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return '';
  return new Date(parsed).toISOString();
}

function shadowDate(value) {
  const stamp = shadowTimestamp(value);
  return stamp ? stamp.slice(0, 10) : null;
}

function shadowRecordUpdatedAt(record) {
  if (!record || typeof record !== 'object') return nowISO();
  return shadowTimestamp(
    record.updatedAt
    || record.doneAt
    || record.timestamp
    || record.createdAt
    || record.at
    || (record.date ? `${record.date}T${record.time || '00:00:00'}` : '')
  ) || nowISO();
}

function shadowBaseRow(id, record, session) {
  // One stable pass serves both the stored record_data and the change hash,
  // so derived '_' keys never reach the cloud and aren't hashed.
  const stableRecord = shadowStableValue(record || {});
  return {
    id,
    ...(JALASAI_SEND_TENANT_ID ? { tenant_id: JALASAI_TENANT_ID } : {}),
    record_data: stableRecord,
    source_hash: shadowHashString(JSON.stringify(stableRecord)),
    source_updated_at: shadowRecordUpdatedAt(record),
    mirrored_at: nowISO(),
    mirrored_by: session?.user?.id || null,
    mirrored_by_email: session?.user?.email || cloudEmail || '',
    device_id: syncMeta.deviceId || '',
    deleted_at: null,
  };
}

function shadowDeleteRow(id, session) {
  return {
    id,
    source_hash: '',
    source_updated_at: null,
    mirrored_at: nowISO(),
    mirrored_by: session?.user?.id || null,
    mirrored_by_email: session?.user?.email || cloudEmail || '',
    device_id: syncMeta.deviceId || '',
    deleted_at: nowISO(),
  };
}

// Phase 2 fix: explicit user deletes used to be dropped silently — the row
// builders skip tombstoned records, and SHADOW_INFER_DELETES is off, so a
// delete never reached the cloud and resurrected on the next pull. This emits
// a real tombstone row for each locally-deleted record so the delete syncs.
// The deletion time is kept as source_updated_at so the IO-saver delta window
// pushes only recent tombstones, not the entire delete history every sync.
function shadowTombstoneRow(id, record, session) {
  const deletedAt = shadowTimestamp(record?.deletedAt || record?.deleted_at) || nowISO();
  return {
    id,
    ...(JALASAI_SEND_TENANT_ID ? { tenant_id: JALASAI_TENANT_ID } : {}),
    source_hash: '',
    source_updated_at: deletedAt,
    mirrored_at: nowISO(),
    mirrored_by: session?.user?.id || null,
    mirrored_by_email: session?.user?.email || cloudEmail || '',
    device_id: syncMeta.deviceId || '',
    deleted_at: deletedAt,
  };
}

function appendShadowTombstones(rows, rawList, idFn, session) {
  normaliseArray(rawList).forEach(raw => {
    if (!raw || !String(raw.deletedAt || raw.deleted_at || '').trim()) return;
    const id = String(idFn(raw) || '').trim();
    if (!id) return;
    rows.push(shadowTombstoneRow(id, raw, session));
  });
  return rows;
}

function shadowMechanicLookup(list = []) {
  const map = new Map();
  normaliseArray(list).forEach(item => {
    const id = String(item?.id || '').trim();
    if (id) map.set(id, item);
  });
  return map;
}

function shadowJobMechanicIds(job) {
  if (typeof jobMechanicIds === 'function') return jobMechanicIds(job);
  return canonicalMechanicIds(job?.mechIds || [], job?.mechId ? [job.mechId] : [], mechanicReferenceNames(job));
}

function shadowJobMechanicNames(job, mechanicLookup) {
  const names = shadowJobMechanicIds(job)
    .map(id => mechanicLookup.get(id)?.name || '')
    .filter(Boolean);
  if (!names.length) return mechanicReferenceNames(job);
  return uniqStrings(names);
}

// Memoized per payload object: the jobs, jobPayments, and customers builders
// all normalize the same jobs array during one mirror pass — do it once.
const shadowNormalizedJobsCache = new WeakMap();

function shadowNormalizedJobs(payload) {
  const cacheable = payload && typeof payload === 'object';
  if (cacheable && shadowNormalizedJobsCache.has(payload)) {
    return shadowNormalizedJobsCache.get(payload);
  }
  const mechanicLookup = shadowMechanicLookup(payload?.mechanics);
  const normalized = normaliseArray(payload?.jobs).map(job => {
    const item = normalizeJob(job);
    if (!isLiveJob(item)) return null;
    const mechIds = shadowJobMechanicIds(item);
    const mechNames = shadowJobMechanicNames(item, mechanicLookup);
    item.mechIds = mechIds;
    item.mechId = mechIds[0] || item.mechId || '';
    item.mech = mechNames.join(', ');
    return item;
  }).filter(Boolean);
  if (cacheable) shadowNormalizedJobsCache.set(payload, normalized);
  return normalized;
}

function shadowNormalizedIncomeEntries(payload) {
  const mechanicLookup = shadowMechanicLookup(payload?.mechanics);
  return normaliseArray(payload?.incomeEntries).map(entry => {
    const item = normalizeIncomeEntry(entry);
    if (!isLiveIncomeEntry(item)) return null;
    item.mechId = String(item.mechId || item.mechanicId || item.mechanic_id || '').trim();
    item.mechName = String(
      item.mechName
      || item.mechanicName
      || item.mechanic_name
      || (item.mechId ? (mechanicLookup.get(item.mechId)?.name || '') : '')
      || ''
    ).trim();
    item.mechanicId = item.mechId;
    item.mechanic_id = item.mechId;
    item.mechanicName = item.mechName;
    item.mechanic_name = item.mechName;
    return item;
  }).filter(Boolean);
}

// Decomposition of customerMatchesJob(customer, job, {allowNameFallback:true})
// into per-job buckets so the full-mirror balance pass is O(customers + jobs)
// instead of a pairwise customers × jobs scan:
//   - a job WITH custId only ever matches the customer with that id;
//   - a job WITHOUT custId matches by equal phone key, else by strong name key
//     (a job matching both is counted once — same as the pairwise filter);
//   - customerJobIdentityConflict is still checked per candidate pair.
function buildShadowBalanceJobIndex(jobsList) {
  if (typeof customerMatchesJob !== 'function'
    || typeof customerPhoneKey !== 'function'
    || typeof strongCustomerNameKey !== 'function'
    || typeof jobIdentityName !== 'function'
    || typeof customerJobIdentityConflict !== 'function') return null;
  const byCustId = new Map();
  const noCustIdByPhone = new Map();
  const noCustIdByName = new Map();
  const add = (map, key, job) => {
    if (!key) return;
    const bucket = map.get(key);
    if (bucket) bucket.push(job);
    else map.set(key, [job]);
  };
  (jobsList || []).forEach(job => {
    if (!isLiveJob(job)) return;
    const custId = String(job.custId || '').trim();
    if (custId) { add(byCustId, custId, job); return; }
    add(noCustIdByPhone, customerPhoneKey(job.phone || ''), job);
    add(noCustIdByName, strongCustomerNameKey(jobIdentityName(job)), job);
  });
  return { byCustId, noCustIdByPhone, noCustIdByName };
}

function shadowCustomerBalance(customer, jobsList, jobIndex = null) {
  if (!jobIndex) {
    const net = (jobsList || [])
      .filter(job => typeof customerMatchesJob === 'function'
        ? customerMatchesJob(customer, job, { allowNameFallback: true })
        : String(job?.custId || '').trim() === String(customer?.id || '').trim())
      .reduce((sum, job) => sum + jobNetBalance(job), 0);
    return { state: resolveBalanceState(net), amount: Math.abs(net) };
  }
  let net = 0;
  if (isLiveCustomer(customer)) {
    const candidates = [];
    const custId = String(customer?.id || '').trim();
    if (custId && jobIndex.byCustId.has(custId)) candidates.push(...jobIndex.byCustId.get(custId));
    const phoneKey = customerPhoneKey(customer?.phone || '');
    if (phoneKey && jobIndex.noCustIdByPhone.has(phoneKey)) candidates.push(...jobIndex.noCustIdByPhone.get(phoneKey));
    const nameKey = strongCustomerNameKey(customer?.name || '');
    if (nameKey && jobIndex.noCustIdByName.has(nameKey)) candidates.push(...jobIndex.noCustIdByName.get(nameKey));
    const seen = new Set();
    candidates.forEach(job => {
      if (seen.has(job)) return;
      seen.add(job);
      if (customerJobIdentityConflict(customer, job)) return;
      net += jobNetBalance(job);
    });
  }
  return { state: resolveBalanceState(net), amount: Math.abs(net) };
}

// --- PATCH (2026-04-23): filter historical pollution out of garage_customers ---
// Old deploys funneled payments/jobs/stock/audit/income through garage_customers,
// leaving ~7k ghost rows. This helper rejects any record whose ID prefix identifies
// it as a non-customer type, so the existing orphan-delete pass in the dispatcher
// tombstones them on the next sync. Real customer prefixes (boo, kb-, c17, m-leg,
// c3-c5, plus anything we don't recognise) pass through untouched.
function isCustomerShapedRaw(raw) {
  if (!raw) return false;
  const id = String(raw && raw.id || '').trim();
  if (!id) return true; // freshly-created records without an id yet — let normalizeCustomer handle them
  if (/^mm-/i.test(id)) return false;    // job_payment
  if (/^log/i.test(id)) return false;    // audit_log
  if (/^s17/i.test(id)) return false;    // stock_item
  if (/^KBJ/.test(id)) return false;     // job
  if (/^J/.test(id) && !/^JAL/i.test(id)) return false; // job (preserve JAL... customer prefix)
  if (/^inc/i.test(id)) return false;    // income_entry
  if (/^pe1/i.test(id)) return false;    // purchase_entry
  if (/^sir1/i.test(id)) return false;   // supplier_invoice_review
  if (/^imp1/i.test(id)) return false;   // import_batch
  if (/^e17/i.test(id)) return false;    // expense
  if (/^money/i.test(id)) return false;  // legacy single 'money' row
  return true;
}
// --- END PATCH ---

function buildCustomerShadowRows(payload, session, options = {}) {
  const skipDerivedBalances = !!options.skipDerivedBalances;
  const jobsList = skipDerivedBalances ? [] : shadowNormalizedJobs(payload);
  const balanceJobIndex = skipDerivedBalances ? null : buildShadowBalanceJobIndex(jobsList);
  const rows = normaliseArray(payload?.customers)
    .filter(raw => raw && !String(raw.deletedAt || '').trim() && String(raw.name || '').trim() && isCustomerShapedRaw(raw))
    .map(raw => {
      const item = normalizeCustomer(raw);
      const balance = skipDerivedBalances
        ? { state: 'clear', amount: 0 }
        : shadowCustomerBalance(item, jobsList, balanceJobIndex);
      const id = String(item.id || item.phone || item.name || shadowSyntheticId('cust', item)).trim();
      return {
        ...shadowBaseRow(id, item, session),
        name: item.name || '',
        phone: item.phone || '',
        email: item.email || '',
        last_vehicle: item.lastVehicle || '',
        vehicle_list: uniqStrings(item.vehicles),
        balance_state: balance.state,
        balance_amount: balance.amount,
      };
    });
  return appendShadowTombstones(
    rows,
    normaliseArray(payload?.customers).filter(isCustomerShapedRaw),
    raw => raw.id || raw.phone || raw.name,
    session
  );
}

function buildMechanicShadowRows(payload, session) {
  const rows = normaliseArray(payload?.mechanics)
    .filter(raw => !String(raw?.deletedAt || raw?.deleted_at || '').trim())
    .map(raw => {
      const item = { ...(raw || {}) };
      const id = String(item.id || item.phone || item.name || shadowSyntheticId('mech', item)).trim();
      return {
        ...shadowBaseRow(id, item, session),
        name: String(item.name || '').trim(),
        phone: String(item.phone || '').trim(),
        specialty: String(item.specialty || '').trim(),
        color: String(item.color || '').trim(),
        active: item.active !== false,
      };
    });
  return appendShadowTombstones(rows, payload?.mechanics, raw => raw.id || raw.phone || raw.name, session);
}

function buildJobShadowRows(payload, session) {
  const mechanicLookup = shadowMechanicLookup(payload?.mechanics);
  const rows = shadowNormalizedJobs(payload).map(item => {
    const mechIds = shadowJobMechanicIds(item);
    const mechNames = shadowJobMechanicNames(item, mechanicLookup);
    return {
      ...shadowBaseRow(String(item.id || shadowSyntheticId('job', item)), item, session),
      customer_id: String(item.custId || '').trim(),
      customer_name: String(item.cust || '').trim(),
      phone: String(item.phone || '').trim(),
      vehicle: String(item.veh || '').trim(),
      registration_no: String(item.vno || '').trim(),
      job_status: String(item.status || '').trim(),
      job_date: shadowDate(item.date || item.doneAt || item.createdAt),
      invoice_no: String(item.invoiceNo || '').trim().toUpperCase(),
      mechanic_ids: mechIds,
      mechanic_names: mechNames,
      total_amount: jobTotal(item),
      paid_amount: jobPaid(item),
      due_amount: jobDue(item),
      advance_amount: jobAdvance(item),
      service_note: String(item.prob || '').trim(),
      remarks: String(item.notes || '').trim(),
    };
  });
  return appendShadowTombstones(rows, payload?.jobs, raw => raw.id, session);
}

function buildJobPaymentShadowRows(payload, session) {
  const mechanicLookup = shadowMechanicLookup(payload?.mechanics);
  return shadowNormalizedJobs(payload).flatMap(job => {
    const mechIds = shadowJobMechanicIds(job);
    const mechNames = shadowJobMechanicNames(job, mechanicLookup);
    return jobPaymentEntries(job).map(entry => ({
      ...shadowBaseRow(shadowSyntheticId('pay', job.id, entry.id, entry.timestamp, entry.amount), { ...entry, jobId: job.id }, session),
      job_id: String(job.id || '').trim(),
      payment_kind: String(entry.kind || '').trim(),
      payment_date: shadowDate(entry.date || entry.timestamp),
      amount: shadowNumber(entry.amount),
      method: String(entry.method || '').trim(),
      invoice_no: String(entry.invoiceNo || '').trim().toUpperCase(),
      customer_name: String(entry.customer || '').trim(),
      phone: String(entry.phone || '').trim(),
      note: String(entry.note || '').trim(),
      mechanic_ids: mechIds,
      mechanic_names: mechNames,
    }));
  });
}

function buildStockItemShadowRows(payload, session) {
  const rows = normaliseArray(payload?.stock)
    .filter(raw => !String(raw?.deletedAt || raw?.deleted_at || '').trim())
    .map(raw => {
    const item = normalizeStockItem(raw);
    return {
      ...shadowBaseRow(String(item.id || item.sku || shadowSyntheticId('stock', item)), item, session),
      sku: String(item.sku || '').trim().toUpperCase(),
      name: String(item.name || '').trim(),
      category: String(item.cat || '').trim(),
      bike: String(item.bike || '').trim(),
      manufacturer: String(item.manufacturer || '').trim(),
      company_brand: String(item.companyBrand || '').trim(),
      supplier_part_no: String(item.supplierPartNo || '').trim(),
      qty: shadowNumber(item.qty),
      min_qty: shadowNumber(item.min),
      buy_price: shadowNumber(item.cost),
      sell_price: shadowNumber(item.sellPrice),
      last_supplier: String(item.lastSupplier || item.sup || '').trim(),
      fitment_models: uniqStrings([...(item.fitmentModels || []), ...(item.fits || [])]),
      aliases: uniqStrings(item.aliases),
      notes: String(item.notes || '').trim(),
    };
  });
  return appendShadowTombstones(rows, payload?.stock, raw => raw.id || raw.sku, session);
}

function buildExpenseShadowRows(payload, session) {
  const rows = normaliseArray(payload?.expenses).map(raw => {
    const item = normalizeExpense(raw);
    if (!isLiveExpense(item)) return null;
    return {
      ...shadowBaseRow(String(item.id || shadowSyntheticId('exp', item)), item, session),
      expense_date: shadowDate(item.date || item.timestamp),
      category: String(item.cat || '').trim(),
      description: String(item.desc || '').trim(),
      paid_to: String(item.paidTo || '').trim(),
      amount: shadowNumber(item.amount),
    };
  }).filter(Boolean);
  return appendShadowTombstones(rows, payload?.expenses, raw => raw.id, session);
}

function buildIncomeEntryShadowRows(payload, session) {
  const rows = shadowNormalizedIncomeEntries(payload).map(item => ({
    ...shadowBaseRow(String(item.id || shadowSyntheticId('inc', item)), item, session),
    entry_date: shadowDate(item.date || item.timestamp),
    income_kind: String(item.kind || '').trim(),
    category: String(item.category || '').trim(),
    amount: shadowNumber(item.amount),
    method: String(item.method || '').trim(),
    invoice_no: String(item.invoiceNo || '').trim().toUpperCase(),
    note: String(item.note || item.description || '').trim(),
    mechanic_id: String(item.mechId || '').trim(),
    mechanic_name: String(item.mechName || '').trim(),
  }));
  return appendShadowTombstones(rows, payload?.incomeEntries, raw => raw.id, session);
}

function buildPartsLogShadowRows(payload, session) {
  return normaliseArray(payload?.partsLog).map(item => ({
    ...shadowBaseRow(
      shadowSyntheticId('partlog', item.date, item.time, item.sku, item.part),
      item,
      session
    ),
    entry_date: shadowDate(item.date),
    entry_time: String(item.time || '').trim(),
    sku: String(item.sku || '').trim().toUpperCase(),
    part_name: String(item.part || '').trim(),
  }));
}

function buildAuditLogShadowRows(payload, session) {
  return normaliseArray(payload?.auditLog).map(item => ({
    ...shadowBaseRow(String(item.id || shadowSyntheticId('audit', item)), item, session),
    happened_at: shadowTimestamp(item.at) || null,
    actor_email: String(item.by || '').trim(),
    action: String(item.action || '').trim(),
    entity: String(item.entity || '').trim(),
    entity_id: String(item.entityId || '').trim(),
    summary: shadowExtractText(item, ['note', 'message']) || shadowExtractText(item.details || {}, ['name', 'status', 'source', 'cat', 'amount']),
  }));
}

function buildStockMovementShadowRows(payload, session) {
  return normaliseArray(payload?.stockMovements).map(raw => {
    const item = normalizeStockMovement(raw);
    return {
      ...shadowBaseRow(String(item.id || shadowSyntheticId('move', item)), item, session),
      stock_id: String(item.stockId || '').trim(),
      sku: String(item.sku || '').trim().toUpperCase(),
      movement_type: String(item.type || '').trim(),
      qty: shadowNumber(item.qty),
      rate: shadowNumber(item.rate),
      amount: shadowNumber(item.amount),
      source: String(item.source || '').trim(),
      source_id: String(item.sourceId || '').trim(),
      supplier: String(item.supplier || '').trim(),
      movement_at: shadowTimestamp(item.createdAt || item.date) || null,
    };
  });
}


async function fetchShadowRemoteMeta(client, table) {
  const rows = new Map();
  let from = 0;
  while (true) {
    const to = from + SHADOW_BATCH_SIZE - 1;
    const { data, error } = await client
      .from(table)
      .select('id,source_hash,deleted_at')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw error;
    (data || []).forEach(item => {
      rows.set(String(item.id), {
        sourceHash: String(item.source_hash || ''),
        deletedAt: item.deleted_at || '',
      });
    });
    if (!data || data.length < SHADOW_BATCH_SIZE) break;
    from += SHADOW_BATCH_SIZE;
  }
  return rows;
}

async function upsertShadowRows(client, table, rows) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += SHADOW_BATCH_SIZE) {
    const batch = rows.slice(i, i + SHADOW_BATCH_SIZE);
    // defaultToNull:false — tombstone/delete rows omit table-specific columns
    // (e.g. garage_jobs.customer_id NOT NULL); without it, a batch mixing live
    // and tombstone rows sends NULL for the missing keys and the push fails.
    const { error } = await client.from(table).upsert(batch, { onConflict: 'id', defaultToNull: false });
    if (error) throw error;
  }
}

function dedupeShadowRows(rows = []) {
  const map = new Map();
  let duplicates = 0;
  rows.forEach(row => {
    const id = String(row?.id || '').trim();
    if (!id) return;
    if (!map.has(id)) {
      map.set(id, row);
      return;
    }
    duplicates += 1;
    const existing = map.get(id);
    const existingStamp = Date.parse(existing?.source_updated_at || 0) || 0;
    const incomingStamp = Date.parse(row?.source_updated_at || 0) || 0;
    if (incomingStamp >= existingStamp) map.set(id, row);
  });
  return { rows: [...map.values()], duplicates };
}

function shadowMirrorErrorMessage(err) {
  const raw = String(err?.message || err?.details || err?.hint || err || '').trim();
  if (/does not exist|relation .* does not exist|column .* does not exist/i.test(raw)) {
    return 'Run the latest Supabase SQL once to enable the new table dataset mirror.';
  }
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(raw)) {
    return 'Network error — check connection and try again.';
  }
  return raw || 'Table dataset mirror failed.';
}

async function mirrorPayloadToShadowTables(client, payload, session, options = {}) {
  const tableKeyFilter = Array.isArray(options.tableKeys) && options.tableKeys.length && !options.fullMirror
    ? new Set(options.tableKeys)
    : null;
  const tablesToMirror = tableKeyFilter
    ? SHADOW_SYNC_TABLES.filter(config => tableKeyFilter.has(config.key))
    : SHADOW_SYNC_TABLES;
  const results = [];

  // IO-saver: narrow each table's source array to the recent window before
  // building rows, so a routine save no longer normalizes + hashes the whole
  // dataset. ioSaverRowsForPush stays as the exact row-level filter; scoped
  // payloads are shared per primary array so jobs/jobPayments reuse one
  // normalize pass. The remote-diff full mirror always sees the full payload.
  const ioSaverCutoff = ioSaverPushCutoffMs(options);
  const scopedPayloads = new Map();
  const payloadForConfig = (config) => {
    if (!ioSaverCutoff || !config.primary) return payload;
    if (!scopedPayloads.has(config.primary)) {
      const rows = normaliseArray(payload?.[config.primary]);
      const recent = rows.filter(record => ioSaverRecordIsRecent(record, ioSaverCutoff));
      scopedPayloads.set(config.primary, recent.length === rows.length
        ? payload
        : { ...payload, [config.primary]: recent });
    }
    return scopedPayloads.get(config.primary);
  };

  for (const config of tablesToMirror) {
    await yieldRecentRefreshChunk();
    const builtRows = config.buildRows(payloadForConfig(config), session, {
      skipDerivedBalances: !!tableKeyFilter && IO_SAVER_SYNC,
    });
    const deduped = dedupeShadowRows(builtRows);
    const expectedRows = deduped.rows;
    let remoteMeta = null;
    let upserts = ioSaverRowsForPush(expectedRows, options);
    let deletes = [];
    await yieldRecentRefreshChunk();

    if (!IO_SAVER_SYNC || options.fullMirror) {
      remoteMeta = await fetchShadowRemoteMeta(client, config.table);
      const expectedMap = new Map(expectedRows.map(row => [String(row.id), row]));
      upserts = expectedRows.filter(row => {
        const remote = remoteMeta.get(String(row.id));
        return !remote || remote.deletedAt || String(remote.sourceHash || '') !== String(row.source_hash || '');
      });
      deletes = SHADOW_INFER_DELETES
        ? [...remoteMeta.entries()]
          .filter(([id, remote]) => !expectedMap.has(id) && !remote.deletedAt)
          .map(([id]) => shadowDeleteRow(id, session))
        : [];
    }

    await upsertShadowRows(client, config.table, upserts);
    await upsertShadowRows(client, config.table, deletes);

    const result = {
      table: config.table,
      expectedActive: expectedRows.length,
      changed: upserts.length,
      deleted: deletes.length,
      deduped: deduped.duplicates,
    };
    results.push(result);
  }

  const totalChanged = results.reduce((sum, item) => sum + (item.changed || 0), 0);
  const totalDeleted = results.reduce((sum, item) => sum + (item.deleted || 0), 0);
  const totalDeduped = results.reduce((sum, item) => sum + (item.deduped || 0), 0);
  const dedupedTables = results
    .filter(item => item.deduped)
    .map(item => `${item.table}:${item.deduped}`)
    .join(', ');
  const summary = totalChanged || totalDeleted
    ? `${results.length} tables mirrored · ${totalChanged} changed · ${totalDeleted} removed${totalDeduped ? ` · ${totalDeduped} duplicate rows collapsed${dedupedTables ? ` (${dedupedTables})` : ''}` : ''}`
    : `${results.length} tables already up to date${totalDeduped ? ` · ${totalDeduped} duplicate rows collapsed${dedupedTables ? ` (${dedupedTables})` : ''}` : ''}`;

  syncMeta.shadowLastMirrorAt = nowISO();
  syncMeta.shadowLastMirrorSummary = summary;
  syncMeta.shadowLastMirrorError = '';

  return { ok: true, summary, results };
}

function buildMergeSummary(remoteData, localData, merged) {
  const keys = ['jobs', 'stock', 'customers', 'expenses', 'incomeEntries'];
  const changed = keys
    .map(key => {
      const remoteCount = Array.isArray(remoteData?.[key]) ? remoteData[key].length : 0;
      const localCount = Array.isArray(localData?.[key]) ? localData[key].length : 0;
      const mergedCount = Array.isArray(merged?.[key]) ? merged[key].length : 0;
      return mergedCount > Math.max(remoteCount, localCount) ? `${key}:${mergedCount}` : '';
    })
    .filter(Boolean);
  return changed.length ? `Merged ${changed.join(', ')}` : '';
}

function applyRemoteSnapshot(data, remoteUpdatedAt = '', options = {}) {
  const localPayload = buildSyncPayload();
  const localMergePayload = options.replaceLocal
    ? { meta: { deviceId: syncMeta.deviceId || localPayload?.meta?.deviceId || '' } }
    : localPayload;
  const merged = mergedSyncPayload(data || {}, localMergePayload, { preferLocal: false });
  const mergeSummary = options.replaceLocal
    ? 'Local cache refreshed from cloud'
    : buildMergeSummary(data || {}, localPayload, merged);
  try { persistBeforePullBackup(localPayload); } catch (_) {}
  mechanics = normaliseArray(merged.mechanics).map(normalizeMechanic);
  jobs      = normaliseArray(merged.jobs).map(normalizeJob);
  stock     = normaliseArray(merged.stock).map(normalizeStockItem);
  customers = normaliseArray(merged.customers).map(normalizeCustomer);
  expenses  = normaliseArray(merged.expenses).map(normalizeExpense);
  incomeEntries = normaliseArray(merged.incomeEntries).map(normalizeIncomeEntry);
  partsLog  = normaliseArray(merged.partsLog);
  auditLog  = normaliseArray(merged.auditLog);
  stockMovements = normaliseArray(merged.stockMovements).map(normalizeStockMovement);

  let purgedAnySampleData = false;
  let repairedMechanicRefs = false;
  let repairedCustomerLinks = false;
  if (options.deferMaintenance !== false && typeof scheduleDataMaintenanceCleanup === 'function') {
    scheduleDataMaintenanceCleanup({ delayMs: 20000, reason: 'cloud-pull' });
  } else {
    const recoveredMechanics = typeof recoverMechanicsFromReferences === 'function' ? recoverMechanicsFromReferences() : [];
    if (recoveredMechanics.length) {
      jobs = jobs.map(normalizeJob);
      incomeEntries = incomeEntries.map(normalizeIncomeEntry);
    }
    const tidiedCustomers = typeof tidyCustomerRecords === 'function'
      ? tidyCustomerRecords()
      : { tombstoned: 0, healed: 0 };
    repairedMechanicRefs = recoveredMechanics.length > 0;
    repairedCustomerLinks = !!(tidiedCustomers && (tidiedCustomers.tombstoned || tidiedCustomers.healed));
  }

  const meta = merged.meta || {};
  jobCtr     = parseInt(meta.jobCtr || jobCtr || '1', 10) || 1;
  invoiceCtr = parseInt(meta.invoiceCtr || invoiceCtr || '1', 10) || 1;

  syncMeta.updatedAt    = meta.updatedAt || syncMeta.updatedAt || nowISO();
  syncMeta.lastPulledAt = nowISO();
  syncMeta.lastRemoteUpdatedAt = remoteUpdatedAt || syncMeta.lastRemoteUpdatedAt || '';
  syncMeta.lastMergeSummary = mergeSummary || '';
  syncMeta.lastSyncError = '';
  syncMeta.adminEmails  = Array.isArray(meta.adminEmails)
      ? meta.adminEmails.map(x => String(x || '').trim().toLowerCase()).filter(Boolean)
    : adminEmails();

  saveAll({ preserveUpdatedAt: true, skipSync: !(purgedAnySampleData || repairedMechanicRefs || repairedCustomerLinks) });
  if (purgedAnySampleData || repairedMechanicRefs || repairedCustomerLinks) {
    syncMeta.lastMergeSummary = mergeSummary
      ? `${mergeSummary}${purgedAnySampleData ? ' · Sample data removed' : ''}${repairedMechanicRefs ? ' · Mechanic links repaired' : ''}${repairedCustomerLinks ? ' · Customer links repaired' : ''}`
      : [
          purgedAnySampleData ? 'Sample data removed' : '',
          repairedMechanicRefs ? 'Mechanic links repaired' : '',
          repairedCustomerLinks ? 'Customer links repaired' : '',
        ].filter(Boolean).join(' · ');
    localStorage.setItem(SK.syncMeta, JSON.stringify(syncMeta));
  }
  renderCurrentPage();
}

function persistCloudSettings() {
  const hideProjectFields = !!(CLOUD_DEFAULTS.projectUrl && CLOUD_DEFAULTS.anonKey);
  const urlInput = document.getElementById('gs-url');
  const keyInput = document.getElementById('cloud-key');
  const existingGsUrl = String(localStorage.getItem(SK.gsUrl) || gsUrl || '').trim();
  const existingCloudKey = String(localStorage.getItem(SK.cloudKey) || cloudKey || '').trim();
  const enteredGsUrl = String(urlInput?.value || '').trim();
  const enteredCloudKey = String(keyInput?.value || '').trim();

  gsUrl = hideProjectFields
    ? String(CLOUD_DEFAULTS.projectUrl || '').trim()
    : (enteredGsUrl || existingGsUrl || String(CLOUD_DEFAULTS.projectUrl || '').trim());
  cloudKey = hideProjectFields
    ? String(CLOUD_DEFAULTS.anonKey || '').trim()
    : (enteredCloudKey || existingCloudKey || String(CLOUD_DEFAULTS.anonKey || '').trim());
  cloudEmail = document.getElementById('cloud-email').value.trim();
  if (gsUrl) localStorage.setItem(SK.gsUrl, gsUrl);
  if (cloudKey) localStorage.setItem(SK.cloudKey, cloudKey);
  localStorage.setItem(SK.cloudEmail, cloudEmail);
  updateGSBadge();
}

function clearCloudSettings() {
  const hasProjectDefaults = !!(CLOUD_DEFAULTS.projectUrl && CLOUD_DEFAULTS.anonKey);
  gsUrl = hasProjectDefaults
    ? String(CLOUD_DEFAULTS.projectUrl || '').trim()
    : String(localStorage.getItem(SK.gsUrl) || gsUrl || '').trim();
  cloudKey = hasProjectDefaults
    ? String(CLOUD_DEFAULTS.anonKey || '').trim()
    : String(localStorage.getItem(SK.cloudKey) || cloudKey || '').trim();
  cloudEmail = '';
  cloudClient = null;
  cloudSessionActive = false;
  cloudAuthBound = false;
  localStorage.removeItem(SK.gsUrl);
  localStorage.removeItem(SK.cloudKey);
  localStorage.removeItem(SK.cloudEmail);
  clearLastPullAt();
  updateGSBadge();
}

function requireCloudWriteAccess(actionLabel = 'edit data') {
  if (cloudSessionActive) return true;
  openGS();
  updateGSStatus(`Sign in with email and password to ${actionLabel}.`);
  toast(`Sign in with email and password to ${actionLabel}`, 3600);
  return false;
}

function ensureCloudClient() {
  if (!canUseCloudConfig()) return null;
  const sig = `${gsUrl}|${cloudKey}`;
  if (cloudClient && cloudClient.__jalaSig === sig) return cloudClient;
  cloudAuthBound = false;
  cloudClient = window.supabase.createClient(gsUrl, cloudKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  cloudClient.__jalaSig = sig;
  bindAuthListener();
  return cloudClient;
}

async function uploadPhotoToCloud(file, options = {}) {
  const client = ensureCloudClient();
  if (!client) throw new Error('Cloud is not configured');
  const session = await ensureCloudSession();
  if (!session) throw new Error('Sign in to upload photos');

  const maxW = options.maxW || 1280;
  const maxH = options.maxH || 960;
  const quality = options.quality || 0.72;
  const kind = options.kind || 'job';
  const compressed = await compressImageFile(file, maxW, maxH, quality);
  const ext = 'jpg';
  const userPart = (session.user?.id || 'staff').replace(/[^a-zA-Z0-9_-]/g, '');
  const namePart = (options.recordId || `photo-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '');
  const path = `${userPart}/${kind}/${namePart}-${Date.now()}.${ext}`;
  const { error } = await client.storage.from(CLOUD_PHOTO_BUCKET).upload(path, compressed, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  const { data } = client.storage.from(CLOUD_PHOTO_BUCKET).getPublicUrl(path);
  return data?.publicUrl || '';
}

function bindAuthListener() {
  if (!cloudClient || cloudAuthBound) return;
  cloudClient.auth.onAuthStateChange((_event, session) => {
    cloudSessionActive = !!session;
    if (session?.user?.email) {
      cloudEmail = session.user.email;
      if (!adminEmails().length) ensureCurrentUserIsAdmin();
    }
    updateGSBadge();
    if (typeof refreshAccessControls === 'function') refreshAccessControls();
    if (session) {
      updateGSStatus(`Signed in as ${session.user.email || 'staff user'}.`);
      startRealtimeSync(cloudClient); // connect realtime on sign-in
    } else {
      if (canUseCloudConfig()) updateGSStatus('Cloud configured. Sign in to sync.');
      if (realtimeChannel) {
        try { cloudClient.removeChannel(realtimeChannel); } catch (_) {}
        realtimeChannel = null;
      }
    }
  });
  cloudAuthBound = true;
}

async function getCloudSession() {
  const client = ensureCloudClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  cloudSessionActive = !!data.session;
  updateGSBadge();
  return data.session;
}

async function signInCloud(password) {
  persistCloudSettings();
  const client = ensureCloudClient();
  if (!client) throw new Error('Enter Supabase Project URL and anon key first');
  if (!cloudEmail) throw new Error('Enter your staff email');
  if (!password) throw new Error('Enter your password');
  setCloudLoginFeedback('Checking email and password...', { loading: true });

  const { data, error } = await client.auth.signInWithPassword({
    email: cloudEmail,
    password,
  });
  if (error) {
    if (isAuthCredentialError(error)) {
      const friendly = new Error('Email or password is wrong. Please check and try again.');
      friendly.code = 'INVALID_LOGIN_CREDENTIALS';
      throw friendly;
    }
    throw error;
  }
  cloudSessionActive = !!data.session;
  if (data.session?.user?.email) {
    cloudEmail = data.session.user.email;
    ensureCurrentUserIsAdmin();
  }
  updateGSBadge();
  if (typeof refreshAccessControls === 'function') refreshAccessControls();
  updateGSStatus(`Signed in as ${cloudEmail}.`);
  setCloudLoginFeedback('Signed in. Syncing latest cloud data...', { loading: true });
  return data.session;
}

async function ensureCloudSession() {
  const existing = await getCloudSession();
  if (existing) return existing;
  const pw = document.getElementById('cloud-password')?.value?.trim() || '';
  if (!pw) return null;
  return signInCloud(pw);
}

function queueAutoSync(options = {}) {
  if (!canUseCloudConfig()) return;
  rememberAutoSyncScope(options);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    syncMeta.lastSyncError = 'Offline: local changes are safe on this device and will sync later.';
    localStorage.setItem(SK.syncMeta, JSON.stringify(syncMeta));
    renderSyncDiagnostics();
    updateQuickSyncButton();
    return;
  }
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(async () => {
    const tableKeys = consumeAutoSyncScope();
    const result = await pushGS({ quiet: true, tableKeys });
    if (result === 'busy') {
      restoreAutoSyncScope(tableKeys);
      clearTimeout(cloudSyncTimer);
      cloudSyncTimer = setTimeout(() => {
        const retryTableKeys = consumeAutoSyncScope();
        pushGS({ quiet: true, tableKeys: retryTableKeys });
      }, AUTO_PUSH_BUSY_RETRY_MS);
    } else if (result === false && syncMeta.lastSyncError) {
      restoreAutoSyncScope(tableKeys);
      showOptimisticSyncFailureToast(syncMeta.lastSyncError);
      updateQuickSyncButton();
    }
  }, AUTO_PUSH_DELAY_MS);
}

// One-shot background run of the healing full mirror, deferred out of the
// save-triggered push window. Failures are not retried in a loop here — the
// next push that finds the mirror still due reschedules it.
let deferredFullMirrorTimer = null;
const DEFERRED_FULL_MIRROR_DELAY_MS = 25000;

function scheduleDeferredFullMirror(delayMs = DEFERRED_FULL_MIRROR_DELAY_MS) {
  if (deferredFullMirrorTimer) return;
  deferredFullMirrorTimer = setTimeout(async () => {
    deferredFullMirrorTimer = null;
    if (CLOUD_SYNC_DISABLED || !canUseCloudConfig() || !cloudSessionActive) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (syncAgeMs(syncMeta.shadowLastFullMirrorAt) <= FULL_MIRROR_REFRESH_MS) return;
    const result = await pushGS({ quiet: true, fullMirror: true });
    if (result === 'busy') scheduleDeferredFullMirror(AUTO_PUSH_BUSY_RETRY_MS);
  }, delayMs);
}

function startBackgroundSyncLoop() {
  clearInterval(cloudBackgroundTimer);
  // Background tick: keep local backup fresh and use the lightweight
  // heartbeat poll as a fallback when realtime misses an event.
  cloudBackgroundTimer = setInterval(async () => {
    persistLocalBackupSnapshot();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (!canUseCloudConfig() || !cloudSessionActive || cloudSyncBusy) return;
    if (syncMeta.pendingSync) {
      queueAutoSync();
    } else {
      await checkAndPullIfStale(cloudClient);
    }
  }, BACKGROUND_SYNC_INTERVAL_MS);
}

function upsertRealtimeItem(list, item, options = {}) {
  const id = String(item?.id || '').trim();
  if (!id) return list;
  const idx = list.findIndex(existing => String(existing?.id || '').trim() === id);
  if (idx === -1) return options.prepend ? [item, ...list] : [...list, item];
  const next = list.slice();
  next[idx] = item;
  return next;
}

function tombstoneRealtimeItem(list, id, deletedAt = nowISO()) {
  const cleanId = String(id || '').trim();
  if (!cleanId) return list;
  return list.map(item => String(item?.id || '').trim() === cleanId
    ? { ...item, deletedAt, updatedAt: deletedAt }
    : item);
}

function applyRealtimeShadowRecord(key, rawRecord, eventType = 'UPDATE', options = {}) {
  const record = { ...(rawRecord || {}) };
  if (!record.id && rawRecord?.sku && key === 'stock') record.id = rawRecord.sku;
  if (!record.id) return false;
  if (key === 'jobs') {
    jobs = upsertRealtimeItem(jobs, normalizeJob(record), { prepend: eventType === 'INSERT' });
  } else if (key === 'stock') {
    stock = upsertRealtimeItem(stock, normalizeStockItem(record));
  } else if (key === 'customers') {
    if (typeof isCustomerShapedRaw === 'function' && !isCustomerShapedRaw(record)) return true;
    customers = upsertRealtimeItem(customers, normalizeCustomer(record));
  } else if (key === 'expenses') {
    expenses = upsertRealtimeItem(expenses, normalizeExpense(record));
  } else if (key === 'incomeEntries') {
    incomeEntries = upsertRealtimeItem(incomeEntries, normalizeIncomeEntry(record));
  } else if (key === 'mechanics') {
    mechanics = upsertRealtimeItem(mechanics, normalizeMechanic(record));
  } else {
    return false;
  }
  if (!options.deferDataChanged) markDataChanged(`realtime:${key}`);
  return true;
}

function applyRealtimeShadowDelete(key, id, deletedAt = nowISO(), options = {}) {
  if (key === 'jobs') jobs = tombstoneRealtimeItem(jobs, id, deletedAt).map(normalizeJob);
  else if (key === 'stock') stock = tombstoneRealtimeItem(stock, id, deletedAt).map(normalizeStockItem);
  else if (key === 'customers') customers = tombstoneRealtimeItem(customers, id, deletedAt).map(normalizeCustomer);
  else if (key === 'expenses') expenses = tombstoneRealtimeItem(expenses, id, deletedAt).map(normalizeExpense);
  else if (key === 'incomeEntries') incomeEntries = tombstoneRealtimeItem(incomeEntries, id, deletedAt).map(normalizeIncomeEntry);
  else if (key === 'mechanics') mechanics = tombstoneRealtimeItem(mechanics, id, deletedAt).map(normalizeMechanic);
  else return false;
  if (!options.deferDataChanged) markDataChanged(`realtime-delete:${key}`);
  return true;
}

function refreshRealtimePages(key, pages = []) {
  if (typeof markAppTabsStale === 'function') markAppTabsStale(pages);
  const activePage = typeof currentPage !== 'undefined' ? currentPage : '';
  if (activePage && pages.includes(activePage) && typeof renderCurrentPage === 'function') {
    renderCurrentPage({ forceRender: true });
  }
  if (key === 'jobs' && typeof updateStats === 'function') updateStats();
}

function refreshRealtimePagesBatch(keys = [], pages = []) {
  const keyList = [...new Set(keys)];
  const pageList = [...new Set(pages)];
  if (typeof markAppTabsStale === 'function') markAppTabsStale(pageList);
  const activePage = typeof currentPage !== 'undefined' ? currentPage : '';
  if (activePage && pageList.includes(activePage) && typeof renderCurrentPage === 'function') {
    renderCurrentPage({ forceRender: true });
  }
  if (keyList.includes('jobs') && typeof updateStats === 'function') updateStats();
}

function handleRealtimeShadowChange(config, payload, options = {}) {
  if (!config || !payload) return false;
  const row = payload.new || payload.old || {};
  if (row.device_id && row.device_id === syncMeta.deviceId) return true;
  if (syncMeta.pendingSync) return false;
  const deletedAt = payload.new?.deleted_at || (payload.eventType === 'DELETE' ? nowISO() : '');
  const id = payload.new?.id || payload.old?.id || payload.new?.record_data?.id || payload.old?.record_data?.id || '';
  const applyOptions = { deferDataChanged: !!options.deferSideEffects };
  const applied = deletedAt
    ? applyRealtimeShadowDelete(config.key, id, deletedAt, applyOptions)
    : applyRealtimeShadowRecord(config.key, payload.new?.record_data || payload.old?.record_data, payload.eventType, applyOptions);
  if (!applied) return false;
  const remoteStamp = shadowTimestamp(row.source_updated_at || row.mirrored_at || '');
  if (remoteStamp) {
    syncMeta.lastPulledAt = nowISO();
    syncMeta.lastRemoteUpdatedAt = remoteStamp;
  }
  if (options.deferSideEffects) return true;
  saveAll({ preserveUpdatedAt: true, skipSync: true, domain: config.key });
  refreshRealtimePages(config.key, config.pages || []);
  return true;
}

async function refreshRecentCloudChanges(windowMs = VISIBILITY_GAP_FILL_MS, options = {}) {
  if (recentRefreshBusy || !cloudSessionActive || cloudSyncBusy || !cloudClient) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (!beginRecentSyncWork()) return false;
  const since = new Date(Date.now() - (parseInt(windowMs, 10) || VISIBILITY_GAP_FILL_MS)).toISOString();
  recentRefreshBusy = true;
  let changed = false;
  const changedKeys = new Set();
  const changedPages = new Set();
  try {
    for (const config of REALTIME_SHADOW_TABLES) {
      const { data, error } = await cloudClient
        .from(config.table)
        .select('id,record_data,source_updated_at,mirrored_at,device_id,deleted_at')
        .gte('source_updated_at', since)
        .order('source_updated_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      const rows = (data || []).filter(row => !(row.device_id && row.device_id === syncMeta.deviceId));
      for (let i = 0; i < rows.length; i += RECENT_REFRESH_CHUNK_SIZE) {
        const chunk = rows.slice(i, i + RECENT_REFRESH_CHUNK_SIZE);
        chunk.forEach(row => {
          if (handleRealtimeShadowChange(config, { eventType: row.deleted_at ? 'DELETE' : 'UPDATE', new: row }, { deferSideEffects: true })) {
            changed = true;
            changedKeys.add(config.key);
            (config.pages || []).forEach(page => changedPages.add(page));
          }
        });
        if (i + RECENT_REFRESH_CHUNK_SIZE < rows.length) await yieldRecentRefreshChunk();
      }
    }
    if (changed) {
      saveAll({ preserveUpdatedAt: true, skipSync: true, domains: [...changedKeys] });
      refreshRealtimePagesBatch(changedKeys, changedPages);
    }
    if (changed && !options.quiet) updateGSStatus('Pulled recent cloud changes.');
    return changed;
  } catch (err) {
    console.warn('[realtime] recent cloud refresh failed', err);
    if (!options.quiet) updateGSStatus(syncErrMsg(err, 'Recent cloud refresh failed'));
    return false;
  } finally {
    recentRefreshBusy = false;
    endRecentSyncWork();
  }
}

// Realtime: patch appState from shadow-table changes and keep the
// heartbeat pull fallback for missed/incomplete events.
function startRealtimeSync(client) {
  if (!client) return;
  if (realtimeChannel) {
    try { client.removeChannel(realtimeChannel); } catch (_) {}
    realtimeChannel = null;
  }
  let pullDebounce = null;
  const scheduleRealtimePull = () => {
    clearTimeout(pullDebounce);
    pullDebounce = setTimeout(() => {
      if (cloudSessionActive && !cloudSyncBusy && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
        pullGS({ quiet: true, allowEmpty: true, automatic: true, criticalOnly: true });
      }
    }, REALTIME_PULL_DEBOUNCE_MS);
  };
  const channel = client.channel('app-sync');
  channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'garage_sync_heartbeat',
    }, (payload) => {
      const fromDevice = payload.new?.device_id;
      if (!fromDevice || fromDevice === syncMeta.deviceId) return; // ignore own push
      scheduleRealtimePull();
    });
  // Another device's push arrives as one realtime event per row. Applying
  // them one-by-one meant a localStorage write + forced page render per row
  // while staff were typing. Batch the burst: apply all rows, then do one
  // save and one render.
  let pendingRealtimeEvents = [];
  let realtimeFlushTimer = null;
  const flushRealtimeEvents = () => {
    realtimeFlushTimer = null;
    const batch = pendingRealtimeEvents;
    pendingRealtimeEvents = [];
    if (!batch.length) return;
    let needsPull = false;
    const changedKeys = new Set();
    const changedPages = new Set();
    batch.forEach(({ config, payload }) => {
      if (!handleRealtimeShadowChange(config, payload, { deferSideEffects: true })) {
        needsPull = true;
        return;
      }
      const row = payload.new || payload.old || {};
      if (row.device_id && row.device_id === syncMeta.deviceId) return; // own echo: applied nothing
      changedKeys.add(config.key);
      (config.pages || []).forEach(page => changedPages.add(page));
    });
    if (changedKeys.size) {
      saveAll({ preserveUpdatedAt: true, skipSync: true, domains: [...changedKeys] });
      refreshRealtimePagesBatch([...changedKeys], [...changedPages]);
    }
    if (needsPull) scheduleRealtimePull();
  };
  REALTIME_SHADOW_TABLES.forEach(config => {
    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: config.table,
    }, (payload) => {
      pendingRealtimeEvents.push({ config, payload });
      if (!realtimeFlushTimer) realtimeFlushTimer = setTimeout(flushRealtimeEvents, REALTIME_EVENT_BATCH_MS);
    });
  });
  realtimeChannel = channel.subscribe((status) => {
      if (realtimeChannel !== channel) return;
      if (status === 'SUBSCRIBED') {
        console.log('[realtime] connected — instant multi-device sync active');
        realtimeOnline();
        refreshRecentCloudChanges(gapFillWindowMs(), { quiet: true });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[realtime] channel lost, fallback polling active (5m)');
        realtimePaused('Sync paused');
        scheduleRealtimeReconnect(client);
      } else if (status === 'CLOSED') {
        realtimePaused('Sync paused');
        scheduleRealtimeReconnect(client);
      }
    });
}

// Fallback for when realtime misses an event.
// Checks if any other device pushed after our last pull.
async function checkAndPullIfStale(client) {
  if (!client) return;
  if (!beginRecentSyncWork()) return;
  try {
    const { data } = await client
      .from('garage_sync_heartbeat')
      .select('pushed_at')
      .neq('device_id', syncMeta.deviceId)
      .order('pushed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return;
    const remoteTs = Date.parse(data.pushed_at);
    const localTs  = Date.parse(syncMeta.lastPulledAt || 0);
    if (remoteTs > localTs) pullGS({ quiet: true, allowEmpty: true, automatic: true, criticalOnly: true });
  } catch (err) {
    console.warn('[realtime] stale check failed', err);
  } finally {
    endRecentSyncWork();
  }
}

async function saveGS() {
  if (CLOUD_SYNC_DISABLED) {
    updateGSStatus('Cloud pull/push is disabled for this build.');
    toast('Cloud sync is disabled', 2600);
    return;
  }
  setCloudConnectLoading(true, 'Connecting to cloud...');
  try {
    persistCloudSettings();
    if (!canUseCloudConfig()) throw new Error('Enter Supabase Project URL and anon key');

    updateGSStatus('Checking cloud session...');
    setCloudLoginFeedback('Checking cloud session...', { loading: true });
    const session = await ensureCloudSession();
    if (!session) {
      updateGSStatus('Project saved. Enter your password to sign in.');
      setCloudLoginFeedback('Enter your email and password, then press Connect & Sync again.', { warn: true });
      toast('Project saved. Enter password to sign in.', 3600);
      return;
    }

    setCloudLoginFeedback('Downloading latest cloud data...', { loading: true });
    const pulled = await pullGS({ quiet: false, allowEmpty: true });
    if (pulled === 'empty' || pulled === 'local-newer') {
      setCloudLoginFeedback('Uploading local changes to cloud...', { loading: true });
      await pushGS({ quiet: false });
    }
    document.getElementById('cloud-password').value = '';
    setCloudLoginFeedback('Cloud connected and synced.');
    closeM('m-gs');
  } catch (err) {
    const msg = cloudSetupFriendlyMessage(err, 'Cloud setup failed');
    updateGSStatus(msg);
    setCloudLoginFeedback(msg, { error: isAuthCredentialError(err), warn: !isAuthCredentialError(err) });
    toast(msg, 4200);
  } finally {
    setCloudConnectLoading(false);
  }
}

async function disconnectGS() {
  if (CLOUD_SYNC_DISABLED) {
    closeM('m-gs');
    return;
  }
  try {
    const client = ensureCloudClient();
    if (client) await client.auth.signOut();
  } catch (err) {
    console.warn('Cloud sign out failed', err);
  } finally {
    clearCloudSettings();
    if (typeof clearLocalDeviceDataAfterSignOut === 'function') clearLocalDeviceDataAfterSignOut();
    if (typeof refreshAccessControls === 'function') refreshAccessControls();
    updateGSStatus('Signed out. Local data was removed from this device.');
    closeM('m-gs');
    toast('Signed out and cleared local data');
  }
}

async function syncGS() {
  if (CLOUD_SYNC_DISABLED) {
    openGS();
    return;
  }
  if (!canUseCloudConfig()) {
    openGS();
    return;
  }
  const session = await ensureCloudSession();
  if (!session) {
    openGS();
    updateGSStatus('Sign in to sync this device.');
    return;
  }
  await syncLatestThenPush({ quiet: false, reason: 'manual' });
}

// Read all 14 shadow tables and reconstruct a payload compatible with applyRemoteSnapshot
async function pullFromShadowTables(client, options = {}) {
  const payload = {};
  const localFallback = buildSyncPayload();
  const pullFailures = [];
  let newestRemoteUpdatedAt = '';
  const pullTables = options.criticalOnly
    ? SHADOW_PULL_TABLES.filter(config => SHADOW_PULL_PRIORITY.includes(config.key))
    : SHADOW_PULL_TABLES;
  for (const config of pullTables) {
    const rows = [];
    let from = 0;
    const selectColumns = config.key === 'jobs'
      ? 'record_data,source_updated_at,mirrored_at,customer_id,customer_name,phone,vehicle,registration_no,job_status,job_date,invoice_no,mechanic_ids,mechanic_names,service_note,remarks'
      : config.key === 'incomeEntries'
        ? 'record_data,source_updated_at,mirrored_at,entry_date,income_kind,category,amount,method,invoice_no,note,mechanic_id,mechanic_name'
        : 'record_data,source_updated_at,mirrored_at';
    try {
      while (true) {
        const to = from + SHADOW_BATCH_SIZE - 1;
        let tableQuery = client
          .from(config.table)
          .select(selectColumns)
          .is('deleted_at', null)
          .order('source_updated_at', { ascending: false });
        if (options?.since) tableQuery = tableQuery.gt('source_updated_at', options.since);
        const { data, error } = await tableQuery.range(from, to);
        if (error) throw error;
        (data || []).forEach(row => {
          const rowUpdatedAt = shadowTimestamp(row?.source_updated_at || row?.mirrored_at || '');
          if (rowUpdatedAt && (!newestRemoteUpdatedAt || Date.parse(rowUpdatedAt) > Date.parse(newestRemoteUpdatedAt))) {
            newestRemoteUpdatedAt = rowUpdatedAt;
          }
          const base = { ...(row?.record_data || {}) };
          if (!row?.record_data) return;
          if (config.key === 'customers' && typeof isCustomerShapedRaw === 'function' && !isCustomerShapedRaw(base)) return;
          if (config.key === 'jobs') {
            const mechIds = uniqStrings([].concat(row.mechanic_ids || []).map(value => String(value || '').trim()).filter(Boolean));
            const mechNames = uniqStrings([].concat(row.mechanic_names || []).map(value => String(value || '').trim()).filter(Boolean));
            if (String(row.customer_id || '').trim()) base.custId = String(row.customer_id || '').trim();
            if (String(row.customer_name || '').trim()) base.cust = String(row.customer_name || '').trim();
            if (String(row.phone || '').trim()) base.phone = String(row.phone || '').trim();
            if (String(row.vehicle || '').trim()) base.veh = String(row.vehicle || '').trim();
            if (String(row.registration_no || '').trim()) base.vno = String(row.registration_no || '').trim();
            if (String(row.job_status || '').trim()) base.status = String(row.job_status || '').trim();
            if (String(row.job_date || '').trim()) base.date = String(row.job_date || '').trim();
            if (String(row.invoice_no || '').trim()) base.invoiceNo = String(row.invoice_no || '').trim().toUpperCase();
            if (String(row.service_note || '').trim()) base.prob = String(row.service_note || '').trim();
            if (String(row.remarks || '').trim()) base.notes = String(row.remarks || '').trim();
            if (mechIds.length) {
              base.mechIds = mechIds;
              base.mechId = mechIds[0];
              base.mechanicIds = mechIds;
              base.mechanicId = mechIds[0];
            }
            if (mechNames.length) {
              const label = mechNames.join(', ');
              base.mech = label;
              base.mechName = label;
              base.mechanicName = label;
              base.mechanic_names = mechNames;
              base.mechanicNames = mechNames;
            }
          } else if (config.key === 'incomeEntries') {
            if (String(row.entry_date || '').trim()) base.date = String(row.entry_date || '').trim();
            if (String(row.income_kind || '').trim()) base.kind = String(row.income_kind || '').trim();
            if (String(row.category || '').trim()) base.category = String(row.category || '').trim();
            if (typeof row.amount !== 'undefined' && row.amount !== null && row.amount !== '') base.amount = row.amount;
            if (String(row.method || '').trim()) base.method = String(row.method || '').trim();
            if (String(row.invoice_no || '').trim()) base.invoiceNo = String(row.invoice_no || '').trim().toUpperCase();
            if (String(row.note || '').trim()) {
              base.note = String(row.note || '').trim();
              base.description = base.description || base.note;
            }
            if (String(row.mechanic_id || '').trim()) {
              base.mechId = String(row.mechanic_id || '').trim();
              base.mechanicId = base.mechId;
              base.mechanic_id = base.mechId;
            }
            if (String(row.mechanic_name || '').trim()) {
              base.mechName = String(row.mechanic_name || '').trim();
              base.mechanicName = base.mechName;
              base.mechanic_name = base.mechName;
            }
          }
          rows.push(base);
        });
        if (!data || data.length < SHADOW_BATCH_SIZE) break;
        from += SHADOW_BATCH_SIZE;
      }
      payload[config.key] = rows;
    } catch (err) {
      if (SHADOW_PULL_REQUIRED.includes(config.key)) throw err;
      console.warn(`Cloud pull skipped ${config.table}; keeping local ${config.key}`, err);
      pullFailures.push(config.key);
      payload[config.key] = normaliseArray(localFallback?.[config.key]);
    }
  }
  // Reconstruct meta from local counters + last mirror timestamp
  payload.meta = {
    jobCtr,
    invoiceCtr,
    updatedAt: newestRemoteUpdatedAt || syncMeta.shadowLastMirrorAt || syncMeta.updatedAt || nowISO(),
    deviceId: syncMeta.deviceId || '',
    adminEmails: adminEmails(),
    exportedAt: nowISO(),
    partialPullFailures: pullFailures,
  };
  const allPulledRows = [
    ...(payload.jobs || []),
    ...(payload.customers || []),
    ...(payload.stock || []),
    ...(payload.expenses || []),
    ...(payload.incomeEntries || []),
    ...(payload.mechanics || []),
    ...(payload.auditLog || []),
    ...(payload.partsLog || []),
    ...(payload.stockMovements || []),
  ];
  // Phase 2 fix: the cursor must advance by the newest server-side
  // source_updated_at actually observed during this pull, not by a value
  // dug out of reconstructed record_data (which dropped that column and
  // left the delta cursor permanently stuck → every pull was a full pull).
  if (newestRemoteUpdatedAt) setLastPullAt(newestRemoteUpdatedAt);
  else {
    const newCursor = extractMaxUpdatedAt(allPulledRows);
    if (newCursor) setLastPullAt(newCursor);
  }
  return payload;
}

async function pullGS(options = {}) {
  if (CLOUD_SYNC_DISABLED) return false;
  if (!canUseCloudConfig() || cloudSyncBusy) return false;
  if (shouldThrottleAutomaticPull(options)) {
    updateGSStatus('Local data ready. Cloud refresh will continue in background.');
    return 'throttled';
  }
  const client = ensureCloudClient();
  const session = await getCloudSession();
  if (!session) {
    updateGSStatus('Cloud configured. Sign in to sync this device.');
    if (!options.quiet) toast('Sign in to sync this device', 3600);
    return false;
  }

  cloudSyncBusy = true;
  updateGSStatus('Pulling latest data from cloud tables...');

  try {
    // Primary: read from shadow tables
    let remoteData = null;
    let remoteStamp = 0;
    let tablePullError = null;
    const lastPullAt = getLastPullAt();
    const isFullPull =
      options?.full === true ||
      options?.manual === true ||
      !lastPullAt;
    const pullOptions = isFullPull
      ? { criticalOnly: !!options.criticalOnly }
      : { criticalOnly: !!options.criticalOnly, since: lastPullAt };
    try {
      if (isFullPull) clearLastPullAt();
      remoteData = await pullFromShadowTables(client, pullOptions);
      remoteStamp = Date.parse(remoteData?.meta?.updatedAt || 0) || 0;
    } catch (tableErr) {
      tablePullError = tableErr;
      console.warn('Table-wise pull failed', tableErr);
    }

    // The table-wise dataset is the only cloud source of truth.
    if (tablePullError) {
      throw tablePullError;
    }

    if (!remoteData || !hasAnyRecords(remoteData)) {
      updateGSStatus('Cloud table sync is connected, but no table data is stored yet.');
      if (!options.quiet) toast('Cloud tables are empty right now');
      return 'empty';
    }

    const localStamp = Date.parse(syncMeta.updatedAt || 0) || 0;
    const remoteMaxInvoice = maxInvoiceNumberFromJobs(remoteData?.jobs);
    const localMaxInvoice = maxInvoiceNumberFromJobs(jobs);
    const cloudHasNewerInvoices = remoteMaxInvoice > localMaxInvoice;
    const cloudHasMissingInvoices = hasRemoteInvoicesMissingLocally(remoteData?.jobs, jobs);
    if (!options.force && localStamp && remoteStamp && localStamp > remoteStamp && !cloudHasNewerInvoices && !cloudHasMissingInvoices) {
      updateGSStatus('Local data is newer than cloud. A push is ready.');
      return 'local-newer';
    }

    // Phase 2 guard: `replaceLocal` throws away the local payload and trusts
    // remote as the complete dataset. That is only safe on a FULL pull of ALL
    // tables that returned with no per-table fallbacks. A delta pull (`since`),
    // a criticalOnly pull (subset of tables), or any partial table failure
    // returns an incomplete view — replacing local with it would delete data.
    const partialPull = Array.isArray(remoteData?.meta?.partialPullFailures)
      && remoteData.meta.partialPullFailures.length > 0;
    const safeToReplaceLocal = isFullPull && !options.criticalOnly && !partialPull;
    const requestedReplaceLocal = options.replaceLocal ?? !syncMeta.pendingSync;
    applyRemoteSnapshot(remoteData, remoteData?.meta?.updatedAt || nowISO(), {
      replaceLocal: requestedReplaceLocal && safeToReplaceLocal,
    });
    updateGSStatus('Pulled latest data from cloud.');
    if (!options.quiet) {
      toast(syncMeta.lastMergeSummary
        ? `Pulled latest data from cloud. ${syncMeta.lastMergeSummary}`
        : 'Pulled latest data from cloud');
    }
    return true;
  } catch (err) {
    console.warn('Cloud pull failed', err);
    const msg = syncErrMsg(err, 'Cloud pull failed');
    updateGSStatus(msg);
    if (!options.quiet) toast(msg, 4200);
    return false;
  } finally {
    cloudSyncBusy = false;
    updateQuickSyncButton();
  }
}

async function pushGS(options = {}) {
  if (CLOUD_SYNC_DISABLED) return false;
  if (!canUseCloudConfig()) return false;
  if (cloudSyncBusy) return 'busy';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    syncMeta.pendingSync = true;
    syncMeta.pendingSince = syncMeta.pendingSince || syncMeta.updatedAt || nowISO();
    syncMeta.lastSyncError = 'Offline: local changes are safe on this device and will sync when internet returns.';
    localStorage.setItem(SK.syncMeta, JSON.stringify(syncMeta));
    renderSyncDiagnostics();
    updateQuickSyncButton();
    return false;
  }
  clearTimeout(cloudSyncTimer);
  const client = ensureCloudClient();
  const session = await getCloudSession();
  if (!session) {
    syncMeta.pendingSync = true;
    syncMeta.pendingSince = syncMeta.pendingSince || syncMeta.updatedAt || nowISO();
    syncMeta.lastSyncError = 'Cloud sign-in required on this device.';
    localStorage.setItem(SK.syncMeta, JSON.stringify(syncMeta));
    renderSyncDiagnostics();
    updateGSStatus('Cloud configured. Sign in to sync this device.');
    if (!options.quiet) toast('Sign in to sync this device', 3600);
    return false;
  }

  if (shouldPullBeforePush(options)) {
    return syncLatestThenPush({
      ...options,
      quiet: options.quiet !== false,
      forcePullFirst: true,
      reason: 'preflight',
    });
  }

  cloudSyncBusy = true;
  updateGSStatus('Sending latest data to cloud tables...');

  try {
    await yieldRecentRefreshChunk();
    // Primary write path: shadow tables
    const localPayload = buildSyncPayload();
    localPayload.meta.updatedAt = nowISO();
    await yieldRecentRefreshChunk();
    const syncedJobIds = new Set(
      (localPayload.jobs || []).map(j => j.id).filter(Boolean)
    );

    // Safety guard: never push empty data to cloud.
    // If local has no records, the device likely just cleared its cache.
    // Pushing would soft-delete all cloud rows. Pull first to restore local state.
    if (!hasAnyRecords(localPayload)) {
      syncMeta.lastSyncError = '';
      localStorage.setItem(SK.syncMeta, JSON.stringify(syncMeta));
      updateGSStatus('No local data — pulling from cloud first…');
      cloudSyncBusy = false;
      updateQuickSyncButton();
      const pulled = await pullGS({ quiet: true, allowEmpty: false, force: true, criticalOnly: true });
      if (pulled === true) {
        updateGSStatus('Pulled from cloud. Tap Sync Now again to push.');
      }
      return false;
    }

    // The healing full mirror is heavy (remote hash sweep of every table).
    // Never run it inside the scoped auto-push that follows a data entry —
    // do the quick scoped push now and schedule the full mirror for a quiet
    // moment instead, so logging entries stays smooth.
    const fullMirrorDue = !!options.fullMirror
      || syncAgeMs(syncMeta.shadowLastFullMirrorAt) > FULL_MIRROR_REFRESH_MS;
    const scopedAutoPush = !options.fullMirror
      && Array.isArray(options.tableKeys) && options.tableKeys.length > 0;
    const runFullMirror = fullMirrorDue && !scopedAutoPush;
    let shadowResult = null;
    try {
      shadowResult = await mirrorPayloadToShadowTables(client, localPayload, session, {
        fullMirror: runFullMirror,
        tableKeys: options.tableKeys,
      });
      // Beat the heartbeat: tell all other devices data changed.
      // Non-fatal — realtime is a best-effort notification layer.
      try {
        await client.from('garage_sync_heartbeat').upsert({
          device_id: syncMeta.deviceId,
          pushed_at: localPayload.meta.updatedAt,
          device_label: (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 100),
        }, { onConflict: 'device_id' });
      } catch (hbErr) {
        console.warn('[realtime] heartbeat write failed (non-fatal)', hbErr);
      }
    } catch (shadowErr) {
      console.warn('Shadow table mirror failed', shadowErr);
      syncMeta.shadowLastMirrorError = shadowMirrorErrorMessage(shadowErr);
      syncMeta.shadowLastMirrorSummary = syncMeta.shadowLastMirrorSummary || 'Table sync failed. Will retry on next sync.';
      syncMeta.shadowLastMirrorAt = nowISO();
      throw shadowErr;
    }

    const pushedAt = nowISO();
    const newerLocalChange = (Date.parse(syncMeta.updatedAt || 0) || 0) > (Date.parse(localPayload.meta.updatedAt || 0) || 0);
    if (runFullMirror) syncMeta.shadowLastFullMirrorAt = pushedAt;
    else if (fullMirrorDue) scheduleDeferredFullMirror();
    syncMeta.lastPushedAt = pushedAt;
    syncMeta.lastCloudUploadAt = pushedAt;
    syncMeta.lastRemoteUpdatedAt = pushedAt;
    syncMeta.lastMergeSummary = '';
    if (!newerLocalChange) {
      syncMeta.updatedAt = localPayload.meta.updatedAt;
      syncMeta.pendingSync = false;
      syncMeta.pendingSince = '';
      syncMeta.lastSyncError = '';
    } else {
      syncMeta.pendingSync = true;
      syncMeta.pendingSince = syncMeta.pendingSince || syncMeta.updatedAt || nowISO();
      syncMeta.lastSyncError = '';
      queueAutoSync({ domain: options.domain, domains: options.domains });
    }
    localStorage.setItem(SK.syncMeta, JSON.stringify(syncMeta));
    let clearedOptimisticInvoice = false;
    syncedJobIds.forEach(id => {
      if (window.__JALASAI_OPTIMISTIC_INVOICES instanceof Set) {
        clearedOptimisticInvoice = window.__JALASAI_OPTIMISTIC_INVOICES.delete(id) || clearedOptimisticInvoice;
      }
    });
    if (clearedOptimisticInvoice) {
      if (typeof markTabStale === 'function') markTabStale('invoices');
      if (typeof currentPage !== 'undefined' && currentPage === 'invoices' && typeof renderInvoices === 'function') {
        try { renderInvoices(); } catch (err) { console.warn('optimistic invoice clear render failed', err); }
      }
    }

    const syncStatus = shadowResult?.summary
      ? `Synced to cloud tables. ${shadowResult.summary}.`
      : syncMeta.shadowLastMirrorError
        ? `Table sync error: ${syncMeta.shadowLastMirrorError}`
        : 'Synced to cloud tables.';
    updateGSStatus(syncStatus);

    if (!options.quiet) toast('Synced to cloud');
    return true;
  } catch (err) {
    console.warn('Cloud push failed', err);
    const msg = syncErrMsg(err, 'Cloud push failed');
    syncMeta.pendingSync = true;
    syncMeta.pendingSince = syncMeta.pendingSince || syncMeta.updatedAt || nowISO();
    syncMeta.lastSyncError = msg;
    localStorage.setItem(SK.syncMeta, JSON.stringify(syncMeta));
    renderSyncDiagnostics();
    updateGSStatus(msg);
    if (!options.quiet) toast(msg, 4200);
    else showOptimisticSyncFailureToast(msg);
    return false;
  } finally {
    cloudSyncBusy = false;
    updateQuickSyncButton();
  }
}

async function initGSSync() {
  const warmUiSwitch = typeof consumeWarmUiSwitchNavigation === 'function' && consumeWarmUiSwitchNavigation();
  const localDataReady = typeof buildSyncPayload === 'function' && hasAnyRecords(buildSyncPayload());
  if (!warmUiSwitch && localDataReady && typeof finishInitialDataLoadAndRender === 'function') {
    finishInitialDataLoadAndRender({ localDataReady: true });
  }
  if (!warmUiSwitch && !localDataReady && typeof startInitialDataLoadOverlay === 'function') {
    startInitialDataLoadOverlay('Checking local backup and cloud data...', { delayMs: 0 });
  }
  updateGSBadge();
  try {
    if (CLOUD_SYNC_DISABLED) {
      updateGSStatus('Cloud sync disabled. This device is running local-only.');
      renderSyncDiagnostics();
      return;
    }
    if (!adminEmails().length && cloudEmail) ensureCurrentUserIsAdmin();
    if (typeof refreshAccessControls === 'function') refreshAccessControls();
    if (!window.supabase) {
      updateGSStatus('Cloud library failed to load. App is running local-only.');
      startBackgroundSyncLoop();
      return;
    }
    if (!canUseCloudConfig()) {
      updateGSStatus('Working offline. Data is saved on this device — connect cloud any time to back up.');
      startBackgroundSyncLoop();
      return;
    }

    try {
      ensureCloudClient();
      const session = await getCloudSession();
      if (!session) {
        updateGSStatus('Cloud configured. Sign in to sync this device.');
        return;
      }
      if (warmUiSwitch) {
        updateGSStatus(syncMeta.pendingSync ? 'Local data ready. Cloud sync continues in background.' : 'Local data ready.');
        if (syncMeta.pendingSync) queueAutoSync();
      } else {
        if (localDataReady && !syncMeta.pendingSync) {
          updateGSStatus('Local data ready. Cloud refresh continues in background.');
        } else {
          const pullResult = await pullGS({
            quiet: true,
            allowEmpty: true,
            force: !localDataReady || syncAgeMs(syncMeta.lastPulledAt) > STALE_DEVICE_PULL_MS,
            automatic: true,
            criticalOnly: true,
          });
          if (pullResult === 'local-newer' || syncMeta.pendingSync) queueAutoSync();
        }
      }
      startRealtimeSync(cloudClient);
      if (localDataReady && !syncMeta.pendingSync) {
        setTimeout(() => {
          refreshRecentCloudChanges(gapFillWindowMs(), { quiet: true });
          checkAndPullIfStale(cloudClient);
        }, 350);
      }
    } catch (err) {
      console.warn('Cloud init failed', err);
      updateGSStatus(syncErrMsg(err, 'Cloud init failed'));
    }
  } catch (err) {
    console.warn('Cloud setup failed', err);
    updateGSStatus(syncErrMsg(err, 'Cloud setup failed'));
  } finally {
    if (!warmUiSwitch && !localDataReady) {
      if (typeof finishInitialDataLoadAndRender === 'function') finishInitialDataLoadAndRender({ localDataReady });
      else if (typeof finishInitialDataLoadOverlay === 'function') finishInitialDataLoadOverlay();
    }
  }

  // Register these once per page load. initGSSync can be
  // called again after a dataset/profile switch — without
  // this guard each call would stack another copy of the
  // handler, causing cumulative slowdown on every tab
  // focus and network flap.
  if (typeof addOnceListener === 'function') {
    addOnceListener(document, 'visibilitychange', 'syncVisibility', async () => {
      if (!document.hidden && cloudSessionActive && !cloudSyncBusy) {
        await refreshRecentCloudChanges(gapFillWindowMs(), { quiet: true });
        checkAndPullIfStale(cloudClient);
      }
    });
    addOnceListener(window, 'online', 'syncOnline', () => {
      updateGSStatus(syncMeta.pendingSync
        ? 'Internet restored. Syncing local changes...'
        : 'Internet restored.');
      if (cloudClient && cloudSessionActive) startRealtimeSync(cloudClient);
      if (syncMeta.pendingSync) queueAutoSync();
    });
    addOnceListener(window, 'offline', 'syncOffline', () => {
      realtimePaused('Sync paused');
    });
  } else {
    // Fallback path (utils.js not loaded for some reason).
    if (!window.__syncListenersBound) {
      window.__syncListenersBound = true;
      document.addEventListener('visibilitychange', async () => {
        if (!document.hidden && cloudSessionActive && !cloudSyncBusy) {
          await refreshRecentCloudChanges(gapFillWindowMs(), { quiet: true });
          checkAndPullIfStale(cloudClient);
        }
      });
      window.addEventListener('online', () => {
        updateGSStatus(syncMeta.pendingSync
          ? 'Internet restored. Syncing local changes...'
          : 'Internet restored.');
        if (cloudClient && cloudSessionActive) startRealtimeSync(cloudClient);
        if (syncMeta.pendingSync) queueAutoSync();
      });
      window.addEventListener('offline', () => {
        realtimePaused('Sync paused');
      });
    }
  }
  startBackgroundSyncLoop();
  renderSyncDiagnostics();
}

async function copyCloudSQL() {
  try {
    const res = await fetch('supabase/schema.sql', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Schema file could not be loaded (${res.status})`);
    const sql = await res.text();
    await navigator.clipboard.writeText(sql);
    updateGSStatus('SQL copied. Run it once in Supabase SQL Editor for table-wise sync.');
    toast('Supabase SQL copied');
  } catch (err) {
    const msg = syncErrMsg(err, 'SQL copy failed');
    updateGSStatus(`${msg}. Open supabase/schema.sql manually if needed.`);
    toast(msg, 3600);
  }
}

function downloadBackup() {
  const payload = buildSyncPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jalasai-backup-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('Backup downloaded');
}

function restoreBackup(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid backup file');
      applyRemoteSnapshot(parsed);
      clearLastPullAt();
      saveAll({ preserveUpdatedAt: true });
      toast('Backup restored');
    } catch (err) {
      toast(syncErrMsg(err, 'Backup restore failed'), 4200);
    } finally {
      input.value = '';
    }
  };
  reader.readAsText(file);
}
