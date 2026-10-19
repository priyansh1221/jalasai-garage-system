// ═══════════════════════════════════════════════════════
//  Data layer — default seeds + localStorage persistence
// ═══════════════════════════════════════════════════════

// ─── Business date helpers must be defined first (used in seeds below) ─
const BUSINESS_TIMEZONE = 'Asia/Kolkata';

// Creating an Intl.DateTimeFormat costs ~25 µs. Screens call today() once
// per invoice (isLiveJob, stats, reports), so at 1 lakh invoices building a
// formatter on every call alone took 2.5 s per Invoices render. Reuse one
// formatter and the date string for the current second; the second-level
// bucket keeps the midnight rollover exact to within a second.
let businessDateFormatter = null;
let businessDateCache = { bucket: -1, value: '' };

function businessDate(offsetDays = 0) {
  const nowMs = Date.now();
  const bucket = Math.floor(nowMs / 1000);
  let istDate = businessDateCache.bucket === bucket ? businessDateCache.value : '';
  if (!istDate) {
    if (!businessDateFormatter) {
      businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: BUSINESS_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    }
    const parts = businessDateFormatter.formatToParts(new Date(nowMs));
    const lookup = Object.fromEntries(parts.map(part => [part.type, part.value]));
    istDate = `${lookup.year}-${lookup.month}-${lookup.day}`;
    businessDateCache = { bucket, value: istDate };
  }
  if (!offsetDays) return istDate;
  const shifted = new Date(`${istDate}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + (parseInt(offsetDays, 10) || 0));
  return shifted.toISOString().slice(0, 10);
}

function today() {
  return businessDate(0);
}

function yesterday() {
  return businessDate(-1);
}

// ─── Runtime state ───────────────────────────────────────
const CLOUD_DEFAULTS = window.JALASAI_CLOUD_CONFIG || {};

let jobs       = [];
let stock      = [];
let customers  = [];
let mechanics  = [];
let expenses   = [];
let incomeEntries = [];
let partsLog   = [];
let auditLog   = [];
let stockMovements = [];
let jobCtr     = 1;
let invoiceCtr = 1;   // auto-increments when a job is marked done
let gsUrl      = '';
let cloudKey   = '';
let cloudEmail = '';

// ─── Garage profile (Phase 5, 2026-06-12) ───────────────
// Shop identity used on printed invoices, WhatsApp messages, and the closing
// summary. Defaults match the previously hardcoded strings, so behavior is
// unchanged until the owner edits the profile on the Admin page.
const GARAGE_PROFILE_DEFAULTS = Object.freeze({
  name: 'Jalasai Auto Parts',
  shortName: 'Jalasai Autoparts',
  addressLine: 'Bhimrad, Surat, Gujarat - 395007',
  city: 'Surat',
  phone: '9687272157',
});
let garageProfile = { ...GARAGE_PROFILE_DEFAULTS };

function getGarageProfile() {
  return garageProfile;
}

function normalizeGarageProfile(raw) {
  const item = raw && typeof raw === 'object' ? raw : {};
  return {
    name: String(item.name || '').trim() || GARAGE_PROFILE_DEFAULTS.name,
    shortName: String(item.shortName || '').trim() || GARAGE_PROFILE_DEFAULTS.shortName,
    addressLine: String(item.addressLine || '').trim() || GARAGE_PROFILE_DEFAULTS.addressLine,
    city: String(item.city || '').trim() || GARAGE_PROFILE_DEFAULTS.city,
    phone: String(item.phone || '').trim() || GARAGE_PROFILE_DEFAULTS.phone,
  };
}

function hydrateGarageProfileForm() {
  const fields = { 'gp-name': 'name', 'gp-short': 'shortName', 'gp-address': 'addressLine', 'gp-city': 'city', 'gp-phone': 'phone' };
  Object.entries(fields).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.value = garageProfile[key] || '';
  });
}

function saveGarageProfileForm() {
  if (typeof requireAdminAccess === 'function' && !requireAdminAccess('edit garage profile')) return;
  garageProfile = normalizeGarageProfile({
    name: document.getElementById('gp-name')?.value,
    shortName: document.getElementById('gp-short')?.value,
    addressLine: document.getElementById('gp-address')?.value,
    city: document.getElementById('gp-city')?.value,
    phone: document.getElementById('gp-phone')?.value,
  });
  saveAll({ domain: 'settings', skipSync: true });
  toast('Garage profile saved on this device');
}
const DEFAULT_SYNC_META = {
  updatedAt: '',
  lastPulledAt: '',
  lastPushedAt: '',
  lastCloudUploadAt: '',
  lastRemoteUpdatedAt: '',
  lastMergeSummary: '',
  deviceId: '',
  adminEmails: [],
  pendingSync: false,
  pendingSince: '',
  lastSyncError: '',
  localBackupAt: '',
  shadowLastMirrorAt: '',
  shadowLastMirrorSummary: '',
  shadowLastMirrorError: '',
  shadowLastFullMirrorAt: '',
};
let syncMeta   = { ...DEFAULT_SYNC_META };
let printFilter = { q: '', cat: '', bike: '', status: '' };
let followupStartDate = '';
let localIdSeq = 0;
const APP_STATE_TAB_PAGES = [
  'home',
  'jobs',
  'invoices',
  'stock',
  'customers',
  'reminders',
  'scan',
  'mechanics',
  'expenses',
  'income',
  'reports',
  'print',
];

function installAppStateView() {
  const target = window.appState || {};
  const keys = {
    jobs: () => jobs,
    invoices: () => jobs.filter(j => isLiveJob(j) && j.status === 'done'),
    stock: () => stock,
    customers: () => customers,
    mechanics: () => mechanics,
    expenses: () => expenses,
    incomeEntries: () => incomeEntries,
    partsLog: () => partsLog,
    auditLog: () => auditLog,
    reminders: () => typeof reminderRows === 'function' ? reminderRows() : [],
    stale: () => window.__JALASAI_STALE_TABS || {},
  };
  Object.entries(keys).forEach(([key, getter]) => {
    const current = Object.getOwnPropertyDescriptor(target, key);
    if (current && current.get) return;
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      get: getter,
    });
  });
  window.appState = target;
}

function markTabStale(page) {
  if (!page) return;
  window.__JALASAI_STALE_TABS = window.__JALASAI_STALE_TABS || {};
  window.__JALASAI_STALE_TABS[page] = true;
}

function markAppTabsStale(pages = APP_STATE_TAB_PAGES) {
  (Array.isArray(pages) ? pages : APP_STATE_TAB_PAGES).forEach(markTabStale);
}

function isAppTabStale(page) {
  return !!(page && window.__JALASAI_STALE_TABS && window.__JALASAI_STALE_TABS[page]);
}

function markAppTabFresh(page) {
  if (!page || !window.__JALASAI_STALE_TABS) return;
  delete window.__JALASAI_STALE_TABS[page];
}

function markDataChanged(reason = 'data') {
  installAppStateView();
  markAppTabsStale();
  window.__JALASAI_DATA_VERSION = (window.__JALASAI_DATA_VERSION || 0) + 1;
  window.__JALASAI_DATA_VERSION_REASON = reason;
}

function optimisticInvoiceSet() {
  if (!(window.__JALASAI_OPTIMISTIC_INVOICES instanceof Set)) {
    window.__JALASAI_OPTIMISTIC_INVOICES = new Set();
  }
  return window.__JALASAI_OPTIMISTIC_INVOICES;
}

function isOptimisticInvoice(id = '') {
  return !!id && optimisticInvoiceSet().has(String(id || '').trim());
}

function markOptimisticInvoice(id = '') {
  const key = String(id || '').trim();
  if (!key) return false;
  const set = optimisticInvoiceSet();
  const sizeBefore = set.size;
  set.add(key);
  if (set.size !== sizeBefore) {
    markTabStale('invoices');
    if (typeof currentPage !== 'undefined' && currentPage === 'invoices' && typeof renderInvoices === 'function') {
      try { renderInvoices(); } catch (err) { console.warn('optimistic invoice render failed', err); }
    }
    return true;
  }
  return false;
}

function clearOptimisticInvoices(ids = null) {
  const set = optimisticInvoiceSet();
  const sizeBefore = set.size;
  if (Array.isArray(ids)) {
    ids.forEach(id => set.delete(String(id || '').trim()));
  } else {
    set.clear();
  }
  if (set.size !== sizeBefore) {
    markTabStale('invoices');
    if (typeof currentPage !== 'undefined' && currentPage === 'invoices' && typeof renderInvoices === 'function') {
      try { renderInvoices(); } catch (err) { console.warn('optimistic invoice clear render failed', err); }
    }
  }
}

installAppStateView();

// ─── Storage keys ─────────────────────────────────────────
const SK = {
  jobs:       'js_jobs',
  stock:      'js_stock',
  customers:  'js_customers',
  mechanics:  'js_mechanics',
  expenses:   'js_expenses',
  incomeEntries: 'js_incomeentries',
  partsLog:   'js_partslog',
  auditLog:   'js_auditlog',
  stockMovements: 'js_stockmovements',
  jobCtr:     'js_jobctr',
  invoiceCtr: 'js_invoicectr',
  gsUrl:      'js_gsurl',
  cloudKey:   'js_cloudkey',
  cloudEmail: 'js_cloudemail',
  syncMeta:   'js_syncmeta',
  lastPullAt: 'jalasai_last_pull_at',
  followupStartDate: 'js_followup_start_date',
  garageProfile: 'js_garageprofile',
  localBackupLatest: 'js_local_backup_latest',
  bootCleanupVersion: 'js_boot_cleanup_version',
};

const LOCAL_SIGN_OUT_STORAGE_KEYS = Object.freeze([
  SK.jobs,
  SK.stock,
  SK.customers,
  SK.mechanics,
  SK.expenses,
  SK.incomeEntries,
  SK.partsLog,
  SK.auditLog,
  'js_reviewitems',
  'js_importbatches',
  'js_purchaseentries',
  SK.stockMovements,
  'js_suppliercatalogmap',
  'js_invoiceimportreviews',
  SK.jobCtr,
  SK.invoiceCtr,
  SK.cloudEmail,
  SK.syncMeta,
  SK.lastPullAt,
  SK.followupStartDate,
  SK.localBackupLatest,
  SK.bootCleanupVersion,
  'js_data_in_idb',
  'js_sync_backup_before_pull',
  'js_catalog_import_session',
  'jala_job_draft_v1:new',
  'jala_quick_invoice_draft_v1',
  'jala_last_payment_method_v1',
  'jala_last_page_v1',
  'jala_reports_access_v1',
]);

const LOCAL_SIGN_OUT_STORAGE_PREFIXES = Object.freeze([
  'jala_job_draft_v1:',
  'jala_invoice_draft_v1:',
  'sb-',
  'supabase.',
]);

const SAVE_DOMAIN_KEYS = Object.freeze({
  jobs: ['jobs', 'customers', 'partsLog', 'auditLog', 'jobCtr', 'invoiceCtr'],
  job: ['jobs', 'customers', 'partsLog', 'auditLog', 'jobCtr', 'invoiceCtr'],
  invoices: ['jobs', 'customers', 'auditLog', 'jobCtr', 'invoiceCtr'],
  invoice: ['jobs', 'customers', 'auditLog', 'jobCtr', 'invoiceCtr'],
  payments: ['jobs', 'customers', 'auditLog'],
  payment: ['jobs', 'customers', 'auditLog'],
  stock: ['stock', 'partsLog', 'stockMovements', 'auditLog'],
  customers: ['customers', 'auditLog', 'followupStartDate'],
  customer: ['customers', 'auditLog', 'followupStartDate'],
  reminders: ['customers', 'auditLog'],
  reminder: ['customers', 'auditLog'],
  expenses: ['expenses', 'auditLog'],
  expense: ['expenses', 'auditLog'],
  income: ['incomeEntries', 'auditLog'],
  mechanics: ['mechanics', 'auditLog'],
  mechanic: ['mechanics', 'auditLog'],
  logs: ['auditLog'],
  audit: ['auditLog'],
  sync: ['syncMeta'],
  settings: ['gsUrl', 'cloudKey', 'cloudEmail', 'syncMeta', 'followupStartDate', 'garageProfile'],
});

// localStorage writers for the business tables. Since 2026-10 these are only
// the fallback when IndexedDB can't be used (see "Business tables live in
// IndexedDB" below); SAVE_KEY_WRITERS routes the tables through
// queueTableSave().
const LOCAL_STORAGE_TABLE_WRITERS = {
  jobs: () => setLocalStorageSafe(SK.jobs, encodeLocalStorageJson(jobs)),
  stock: () => setLocalStorageSafe(SK.stock, encodeLocalStorageJson(stock)),
  customers: () => setLocalStorageSafe(SK.customers, encodeLocalStorageJson(customers)),
  mechanics: () => setLocalStorageSafe(SK.mechanics, encodeLocalStorageJson(mechanics)),
  expenses: () => setLocalStorageSafe(SK.expenses, encodeLocalStorageJson(expenses)),
  incomeEntries: () => setLocalStorageSafe(SK.incomeEntries, encodeLocalStorageJson(incomeEntries)),
  partsLog: () => setLocalStorageSafe(SK.partsLog, encodeLocalStorageJson(partsLog)),
  auditLog: () => setLocalStorageSafe(SK.auditLog, encodeLocalStorageJson(auditLog)),
  stockMovements: () => setLocalStorageSafe(SK.stockMovements, encodeLocalStorageJson(stockMovements)),
};

// options.changed = { jobs: [id, ...] } lets a save rewrite only those
// records' groups (see "Grouped storage"); without it the table is rewritten.
const SAVE_KEY_WRITERS = {
  jobs: (options) => queueTableSave('jobs', options?.changed?.jobs),
  stock: (options) => queueTableSave('stock', options?.changed?.stock),
  customers: (options) => queueTableSave('customers', options?.changed?.customers),
  mechanics: (options) => queueTableSave('mechanics', options?.changed?.mechanics),
  expenses: (options) => queueTableSave('expenses', options?.changed?.expenses),
  incomeEntries: (options) => queueTableSave('incomeEntries', options?.changed?.incomeEntries),
  partsLog: () => queueTableSave('partsLog'),
  auditLog: () => queueTableSave('auditLog'),
  stockMovements: (options) => queueTableSave('stockMovements', options?.changed?.stockMovements),
  jobCtr: () => setLocalStorageSafe(SK.jobCtr, jobCtr),
  invoiceCtr: () => setLocalStorageSafe(SK.invoiceCtr, invoiceCtr),
  gsUrl: () => setLocalStorageSafe(SK.gsUrl, gsUrl),
  cloudKey: () => setLocalStorageSafe(SK.cloudKey, cloudKey),
  cloudEmail: () => setLocalStorageSafe(SK.cloudEmail, cloudEmail),
  syncMeta: () => setLocalStorageSafe(SK.syncMeta, JSON.stringify(syncMeta)),
  followupStartDate: () => setLocalStorageSafe(SK.followupStartDate, followupStartDate || today()),
  garageProfile: () => setLocalStorageSafe(SK.garageProfile, JSON.stringify(garageProfile)),
};

// exactTables: the names are storage keys, not UI domains — used by cloud
// pulls that know exactly which tables changed ("jobs" as a domain would also
// rewrite customers and the logs).
function saveDomainKeySet(domain, exactTables = false) {
  if (!domain) return null;
  const requested = Array.isArray(domain) ? domain : String(domain).split(/[,\s]+/);
  const keys = new Set(['syncMeta']);
  requested.map(item => String(item || '').trim()).filter(Boolean).forEach(item => {
    const mapped = exactTables && SAVE_KEY_WRITERS[item]
      ? [item]
      : (SAVE_DOMAIN_KEYS[item] || (SAVE_KEY_WRITERS[item] ? [item] : []));
    mapped.forEach(key => keys.add(key));
  });
  return keys;
}

// ─── Persist ──────────────────────────────────────────────
function nowISO() {
  return new Date().toISOString();
}

const DATA_BOOT_CLEANUP_VERSION = '2026-06-05-v49';

function deviceShortId() {
  const raw = String(syncMeta?.deviceId || 'device').replace(/[^a-zA-Z0-9]/g, '');
  return (raw.slice(-4) || 'dev1').toUpperCase();
}

const LOCAL_BACKUP_MAX_CHARS = 900000;
const BEFORE_PULL_BACKUP_KEY = 'js_sync_backup_before_pull';
const COMPRESSED_STORAGE_PREFIX = 'lz:';

function encodeLocalStorageJson(value) {
  const json = JSON.stringify(value);
  if (json.length < 160000 || typeof LZString === 'undefined') return json;
  const compressed = LZString.compressToUTF16(json);
  return compressed && compressed.length + COMPRESSED_STORAGE_PREFIX.length < json.length
    ? COMPRESSED_STORAGE_PREFIX + compressed
    : json;
}

function parseLocalStorageJson(raw) {
  if (String(raw || '').startsWith(COMPRESSED_STORAGE_PREFIX) && typeof LZString !== 'undefined') {
    const json = LZString.decompressFromUTF16(String(raw).slice(COMPRESSED_STORAGE_PREFIX.length));
    return JSON.parse(json || 'null');
  }
  return JSON.parse(raw);
}

function isLocalStorageQuotaError(err) {
  return err?.name === 'QuotaExceededError'
    || err?.code === 22
    || err?.code === 1014;
}

function clearLargeLocalBackupKeys() {
  try { localStorage.removeItem(SK.localBackupLatest); } catch (_) {}
  try { localStorage.removeItem(BEFORE_PULL_BACKUP_KEY); } catch (_) {}
}

// Storage keys whose latest in-memory value could not be written to this
// device (e.g. phone storage full). While any remain, the red save-failure
// banner stays up; each key clears once a later save of it succeeds.
const localSaveFailures = new Map();
const LOCAL_SAVE_FAILED_MSG = 'This phone could not save. Don\'t close the app — tap to download a backup.';

function localSaveFailureSummary() {
  if (!localSaveFailures.size) return '';
  const first = localSaveFailures.values().next().value;
  return `Device save failed (${first.reason}) for ${localSaveFailures.size} item${localSaveFailures.size === 1 ? '' : 's'} since ${fmtDateTime(first.at)}. Download a backup now.`;
}

function renderLocalSaveFailureBanner() {
  const banner = document.getElementById('save-fail-banner');
  if (!banner) return;
  const failing = localSaveFailures.size > 0;
  banner.hidden = !failing;
  document.body.classList.toggle('has-save-fail-banner', failing);
}

function noteLocalSaveResult(key, ok, err) {
  const wasFailing = localSaveFailures.size > 0;
  if (ok) {
    if (!localSaveFailures.delete(key)) return;
  } else {
    if (!localSaveFailures.has(key)) {
      localSaveFailures.set(key, { at: nowISO(), reason: err?.name || err?.message || 'unknown error' });
    }
  }
  const failing = localSaveFailures.size > 0;
  if (failing) {
    syncMeta.lastSyncError = localSaveFailureSummary();
  } else if (wasFailing && String(syncMeta.lastSyncError || '').startsWith('Device save failed')) {
    syncMeta.lastSyncError = '';
  }
  if (failing !== wasFailing || failing) {
    renderLocalSaveFailureBanner();
    if (typeof renderSyncDiagnostics === 'function') renderSyncDiagnostics();
    if (typeof updateQuickSyncButton === 'function') updateQuickSyncButton();
  }
}

window.addEventListener('beforeunload', event => {
  if (!localSaveFailures.size) return;
  event.preventDefault();
  event.returnValue = LOCAL_SAVE_FAILED_MSG;
});

function setLocalStorageSafe(key, value, options = {}) {
  // Backup copies are optional; only the real data keys drive the banner.
  if (options.trackFailure === false) return writeLocalStorageSafe(key, value, options).ok;
  const result = writeLocalStorageSafe(key, value, options);
  noteLocalSaveResult(key, result.ok, result.error);
  return result.ok;
}

function writeLocalStorageSafe(key, value, options = {}) {
  let previousValue = null;
  try { previousValue = localStorage.getItem(key); } catch (_) {}
  try {
    localStorage.setItem(key, value);
    return { ok: true };
  } catch (err) {
    if (options.retryAfterBackupCleanup !== false && isLocalStorageQuotaError(err)) {
      clearLargeLocalBackupKeys();
      const replacingWithSmallerValue = previousValue !== null && String(value).length < previousValue.length;
      if (replacingWithSmallerValue) {
        try { localStorage.removeItem(key); } catch (_) {}
      }
      try {
        localStorage.setItem(key, value);
        return { ok: true };
      } catch (retryErr) {
        if (replacingWithSmallerValue) {
          try { localStorage.setItem(key, previousValue); } catch (_) {}
        }
        console.warn(`localStorage save failed for ${key}`, retryErr);
        return { ok: false, error: retryErr };
      }
    }
    console.warn(`localStorage save failed for ${key}`, err);
    return { ok: false, error: err };
  }
}

function getLastPullAt() {
  try {
    return localStorage.getItem(SK.lastPullAt) || null;
  } catch (e) {
    return null;
  }
}

function setLastPullAt(isoString) {
  try {
    if (isoString) localStorage.setItem(SK.lastPullAt, isoString);
  } catch (e) {
    // quota errors are non-fatal here
  }
}

function clearLastPullAt() {
  try {
    localStorage.removeItem(SK.lastPullAt);
  } catch (e) {}
}

// ─── Business tables live in IndexedDB ────────────────────
// iPhone/iPad Safari caps localStorage at 5 MB per site and counts every
// LZ-compressed character as 2 bytes. Once a garage had ~10k+ invoices the
// jobs write hit that cap and failed silently; the next reload (which iOS
// does on its own when a tab sits in the background) opened with no
// invoices, and because customers/stock still loaded, the app treated the
// device as "data ready" and never downloaded them again. IndexedDB quotas
// are hundreds of MB on every browser, so the business tables are stored
// there. localStorage keeps settings/counters and stays the fallback when
// IndexedDB can't be opened (some private modes).
const DATA_IDB_NAME = 'jalasai-data';
const DATA_IDB_STORE = 'tables';
const DATA_IDB_OPEN_TIMEOUT_MS = 5000;
const DATA_IDB_MARKER_KEY = 'js_data_in_idb';
const DATA_TABLE_KEYS = Object.freeze([
  'mechanics', 'jobs', 'stock', 'customers', 'expenses',
  'incomeEntries', 'partsLog', 'auditLog', 'stockMovements',
]);
const DATA_TABLE_ACCESS = {
  jobs: { get: () => jobs, set: v => { jobs = v; }, normalize: x => normalizeJob(x), key: x => x?.id },
  stock: { get: () => stock, set: v => { stock = v; }, normalize: x => normalizeStockItem(x), key: x => x?.id || x?.sku },
  customers: { get: () => customers, set: v => { customers = v; }, normalize: x => normalizeCustomer(x), key: x => x?.id || x?.phone || x?.name },
  mechanics: { get: () => mechanics, set: v => { mechanics = v; }, normalize: x => normalizeMechanic(x), key: x => x?.id || x?.phone || x?.name },
  expenses: { get: () => expenses, set: v => { expenses = v; }, normalize: x => normalizeExpense(x), key: x => x?.id },
  incomeEntries: { get: () => incomeEntries, set: v => { incomeEntries = v; }, normalize: x => normalizeIncomeEntry(x), key: x => x?.id },
  partsLog: { get: () => partsLog, set: v => { partsLog = v; }, events: true, key: x => `${x?.date || ''}|${x?.time || ''}|${x?.sku || ''}|${x?.part || ''}` },
  auditLog: { get: () => auditLog, set: v => { auditLog = v; }, events: true, key: x => x?.id || `${x?.at || ''}|${x?.entity || ''}|${x?.entityId || ''}|${x?.action || ''}` },
  stockMovements: { get: () => stockMovements, set: v => { stockMovements = v; }, normalize: x => normalizeStockMovement(x), key: x => x?.id || `${x?.stockId || ''}|${x?.createdAt || ''}|${x?.type || ''}|${x?.qty || ''}` },
};

let dataIdbPromise = null;
let dataIdbUsable = false;
let tableSaveFlushQueued = false;
// table -> 'full' | Set(changed record keys)
const pendingTableSaves = new Map();
let lastTableSaveFailureToastAt = 0;

function openDataIdb() {
  if (dataIdbPromise) return dataIdbPromise;
  dataIdbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    // Some iOS versions never fire success/error on the first open; don't
    // let that hang app start — fall back to localStorage instead.
    const timer = setTimeout(() => reject(new Error('IndexedDB open timed out')), DATA_IDB_OPEN_TIMEOUT_MS);
    let request;
    try {
      request = indexedDB.open(DATA_IDB_NAME, 1);
    } catch (err) {
      clearTimeout(timer);
      reject(err);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DATA_IDB_STORE)) db.createObjectStore(DATA_IDB_STORE);
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dataIdbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error || new Error('IndexedDB open failed'));
    };
  });
  dataIdbPromise.catch(() => { dataIdbPromise = null; });
  return dataIdbPromise;
}

// ─── Grouped storage (fast-load plan Phase 3) ─────────────
// Rewriting a whole table on every save cost ~220 ms at 1 lakh invoices.
// Id-keyed tables are split into DATA_IDB_BUCKETS groups by a hash of the
// record key ("jobs#17"), so a save that knows which records changed only
// rewrites their groups. Array order is kept in "jobs@order" and rewritten
// only when records were added, removed or reordered.
// Safety: a save that doesn't say which records changed rewrites the whole
// table, and every table with grouped-only saves gets a full rewrite at least
// once a minute and whenever the app is hidden, so an in-place edit that a
// caller forgot to report can't stay unsaved.
const DATA_IDB_BUCKETS = 64;
const DATA_FULL_RESAVE_MS = 60 * 1000;
const bucketedTableKeys = new Set();
const lastSavedTableOrder = new Map();
const partialSavedTablesAt = new Map();
// Hash per record key (keys are short ids; the cache only skips rehashing).
const recordBucketCache = new Map();

function tableIsBucketable(key) {
  const access = DATA_TABLE_ACCESS[key];
  return !!access && !access.events;
}

function dataBucketKey(key, bucket) {
  return `${key}#${String(bucket).padStart(2, '0')}`;
}

function dataBucketOf(recordKey) {
  const text = String(recordKey || '');
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
  return (hash >>> 0) % DATA_IDB_BUCKETS;
}

// The key is read fresh every time (a customer's key can change when an id
// or phone is added), so a record always lands in the group its key says.
function recordBucket(access, record) {
  const key = String(access.key(record) || '');
  let bucket = recordBucketCache.get(key);
  if (bucket === undefined) {
    bucket = dataBucketOf(key);
    recordBucketCache.set(key, bucket);
  }
  return { key, bucket };
}

// Rebuilds the table in its saved order. Rows are matched to the order list
// by key (a queue per key, so duplicates survive); any row the order list
// doesn't mention is appended, never dropped.
function assembleBucketedRows(buckets, order) {
  const queues = new Map();
  buckets.forEach(rows => normaliseStoredArray(rows).forEach(row => {
    const key = String(row?.__k ?? '');
    const queue = queues.get(key);
    if (queue) queue.push(row.r);
    else queues.set(key, [row.r]);
  }));
  const out = [];
  normaliseStoredArray(order).forEach(key => {
    const queue = queues.get(String(key));
    if (queue && queue.length) out.push(queue.shift());
  });
  queues.forEach(queue => queue.forEach(row => out.push(row)));
  return out;
}

async function readDataTablesFromIdb() {
  const db = await openDataIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_IDB_STORE, 'readonly');
    const store = tx.objectStore(DATA_IDB_STORE);
    const legacy = {};
    const orders = {};
    const buckets = {};
    DATA_TABLE_KEYS.forEach(key => {
      const request = store.get(key);
      request.onsuccess = () => { legacy[key] = request.result; };
      if (!tableIsBucketable(key)) return;
      const orderRequest = store.get(`${key}@order`);
      orderRequest.onsuccess = () => { orders[key] = orderRequest.result; };
      buckets[key] = new Array(DATA_IDB_BUCKETS);
      for (let b = 0; b < DATA_IDB_BUCKETS; b += 1) {
        const bucketRequest = store.get(dataBucketKey(key, b));
        bucketRequest.onsuccess = () => { buckets[key][b] = bucketRequest.result?.rows || []; };
      }
    });
    tx.oncomplete = () => {
      const result = {};
      DATA_TABLE_KEYS.forEach(key => {
        if (orders[key] && Array.isArray(orders[key].keys)) {
          const rows = assembleBucketedRows(buckets[key], orders[key].keys);
          result[key] = { rows, savedAt: orders[key].savedAt, bucketed: true };
          lastSavedTableOrder.set(key, orders[key].keys.slice());
          bucketedTableKeys.add(key);
        } else {
          result[key] = legacy[key];
        }
      });
      resolve(result);
    };
    tx.onerror = () => reject(tx.error || new Error('IndexedDB read failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB read aborted'));
  });
}

// plan: Map table -> 'full' | Set(changed record keys). A table gets a
// grouped write only when it is already stored grouped and the caller listed
// the records it changed; otherwise the whole table is written (grouped).
async function writeDataTablesToIdb(plan) {
  const db = await openDataIdb();
  const savedAt = nowISO();
  const orderUpdates = new Map();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_IDB_STORE, 'readwrite');
    const store = tx.objectStore(DATA_IDB_STORE);
    try {
      plan.forEach((changedKeys, key) => {
        const access = DATA_TABLE_ACCESS[key];
        const rows = normaliseStoredArray(access.get());
        // put() snapshots (structured-clones) the data right now, so later
        // in-memory edits can't leak into this write half-done.
        if (!tableIsBucketable(key)) {
          store.put({ rows, savedAt }, key);
          return;
        }
        const partial = changedKeys instanceof Set && bucketedTableKeys.has(key);
        const wanted = new Set();
        if (partial) changedKeys.forEach(recordKey => wanted.add(dataBucketOf(recordKey)));
        const grouped = new Map();
        const order = new Array(rows.length);
        rows.forEach((row, i) => {
          const { key: recordKey, bucket } = recordBucket(access, row);
          order[i] = recordKey;
          if (partial && !wanted.has(bucket)) return;
          const list = grouped.get(bucket);
          if (list) list.push({ __k: recordKey, r: row });
          else grouped.set(bucket, [{ __k: recordKey, r: row }]);
        });
        const targets = partial ? [...wanted] : Array.from({ length: DATA_IDB_BUCKETS }, (_, b) => b);
        targets.forEach(b => store.put({ rows: grouped.get(b) || [], savedAt }, dataBucketKey(key, b)));
        const previous = lastSavedTableOrder.get(key);
        const orderChanged = !partial || !previous || previous.length !== order.length
          || order.some((recordKey, i) => recordKey !== previous[i]);
        if (orderChanged) {
          store.put({ keys: order, savedAt }, `${key}@order`);
          orderUpdates.set(key, order);
        }
        if (!partial) store.delete(key);
      });
    } catch (err) {
      try { tx.abort(); } catch (_) {}
      reject(err);
      return;
    }
    tx.oncomplete = () => {
      orderUpdates.forEach((order, key) => lastSavedTableOrder.set(key, order));
      plan.forEach((changedKeys, key) => {
        if (!tableIsBucketable(key)) return;
        const partial = changedKeys instanceof Set && bucketedTableKeys.has(key);
        bucketedTableKeys.add(key);
        if (partial) {
          if (!partialSavedTablesAt.has(key)) partialSavedTablesAt.set(key, Date.now());
        } else {
          partialSavedTablesAt.delete(key);
        }
      });
      resolve();
    };
    tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB write aborted'));
  });
}

function noteTableSaveResult(key, ok, err) {
  if (typeof noteLocalSaveResult === 'function') {
    noteLocalSaveResult(`table:${key}`, ok, err);
    return;
  }
  if (ok) return;
  syncMeta.lastSyncError = `Device save failed for ${key} (${err?.name || err?.message || 'unknown error'}). Download a backup before closing the app.`;
  const now = Date.now();
  if (typeof toast === 'function' && now - lastTableSaveFailureToastAt > 60000) {
    lastTableSaveFailureToastAt = now;
    toast('This phone could not save. Do not close the app — download a backup from Cloud Sync.', 6000);
  }
  if (typeof renderSyncDiagnostics === 'function') renderSyncDiagnostics();
}

// saveAll() calls this per table; writes from one burst of saves are
// coalesced into a single IndexedDB transaction at the end of the task.
// IndexedDB runs readwrite transactions on a store in creation order, so the
// latest snapshot always lands last.
function queueTableSave(key, changedRecordKeys) {
  if (!DATA_TABLE_ACCESS[key]) return;
  if (!dataIdbUsable) {
    LOCAL_STORAGE_TABLE_WRITERS[key]();
    return;
  }
  const listed = Array.isArray(changedRecordKeys) || changedRecordKeys instanceof Set
    ? [...changedRecordKeys].map(id => String(id || '')).filter(Boolean)
    : null;
  const current = pendingTableSaves.get(key);
  if (!listed || !listed.length || current === 'full') {
    pendingTableSaves.set(key, 'full');
  } else if (current instanceof Set) {
    listed.forEach(id => current.add(id));
  } else {
    pendingTableSaves.set(key, new Set(listed));
  }
  if (tableSaveFlushQueued) return;
  tableSaveFlushQueued = true;
  Promise.resolve().then(flushTableSaves);
}

// Safety net for grouped saves: rewrite in full any table that has had only
// grouped writes for a minute, and everything grouped when the app is hidden.
function queueFullResaveOfPartialTables(force = false) {
  if (!dataIdbUsable) return;
  const now = Date.now();
  let queued = false;
  partialSavedTablesAt.forEach((since, key) => {
    if (!force && now - since < DATA_FULL_RESAVE_MS) return;
    pendingTableSaves.set(key, 'full');
    queued = true;
  });
  if (queued && !tableSaveFlushQueued) {
    tableSaveFlushQueued = true;
    Promise.resolve().then(flushTableSaves);
  }
}

if (typeof window !== 'undefined' && !window.__jalasaiFullResaveBound) {
  window.__jalasaiFullResaveBound = true;
  setInterval(() => queueFullResaveOfPartialTables(false), DATA_FULL_RESAVE_MS / 2);
  const resaveOnHide = () => { if (document.visibilityState === 'hidden') queueFullResaveOfPartialTables(true); };
  document.addEventListener('visibilitychange', resaveOnHide);
  window.addEventListener('pagehide', () => queueFullResaveOfPartialTables(true));
}

// The newest flush, so callers can wait until a save has really landed on
// the device (the background history download records its progress only
// after the records it fetched are saved).
let lastTableSaveFlush = Promise.resolve();

function whenTableSavesSettled() {
  return Promise.resolve().then(() => lastTableSaveFlush);
}

function flushTableSaves() {
  tableSaveFlushQueued = false;
  const plan = new Map(pendingTableSaves);
  pendingTableSaves.clear();
  const keys = [...plan.keys()];
  if (!keys.length) return lastTableSaveFlush;
  lastTableSaveFlush = writeDataTablesToIdb(plan).then(() => {
    keys.forEach(key => {
      // The localStorage copy is now stale and only eats Safari's 5 MB.
      try { localStorage.removeItem(SK[key]); } catch (_) {}
      noteTableSaveResult(key, true);
      // An earlier failed localStorage write of this table no longer
      // matters once the table is safely in IndexedDB.
      if (typeof noteLocalSaveResult === 'function') noteLocalSaveResult(SK[key], true);
    });
    try { localStorage.setItem(DATA_IDB_MARKER_KEY, '1'); } catch (_) {}
  }).catch(err => {
    console.warn('IndexedDB save failed; trying localStorage', err);
    keys.forEach(key => {
      const ok = LOCAL_STORAGE_TABLE_WRITERS[key]();
      noteTableSaveResult(key, !!ok, ok ? null : err);
    });
  });
  return lastTableSaveFlush;
}

// Union of two copies of a table without losing any record: newer record
// stamp wins, tombstones are kept (same rules as a cloud merge).
function mergeStoredTableCopies(key, primary, secondary) {
  const access = DATA_TABLE_ACCESS[key];
  if (!secondary.length) return primary;
  if (!primary.length) return secondary;
  if (access.events && typeof mergeEventLists === 'function') return mergeEventLists(primary, secondary, access.key);
  if (!access.events && typeof mergeByKey === 'function') return mergeByKey(primary, secondary, access.key, null, { preferLocal: true });
  const seen = new Map();
  [...primary, ...secondary].forEach(item => {
    const id = access.key(item);
    if (id && !seen.has(id)) seen.set(id, item);
  });
  return [...seen.values()];
}

// Boot loader: settings + any localStorage tables first (loadAll), then the
// IndexedDB tables. A table present in both (old copy from before the move,
// or a fallback write after an IndexedDB failure) is merged, never dropped.
async function loadAllFromStorage() {
  loadAll();
  let stored;
  try {
    stored = await readDataTablesFromIdb();
    dataIdbUsable = true;
  } catch (err) {
    console.warn('IndexedDB unavailable; using localStorage for data', err);
    dataIdbUsable = false;
    return { backend: 'localStorage' };
  }
  const toMigrate = [];
  DATA_TABLE_KEYS.forEach(key => {
    const access = DATA_TABLE_ACCESS[key];
    const idbRows = Array.isArray(stored[key]?.rows) ? stored[key].rows : null;
    const localRows = normaliseStoredArray(access.get());
    let hasLocalCopy = false;
    try { hasLocalCopy = localStorage.getItem(SK[key]) !== null; } catch (_) {}
    if (!idbRows) {
      if (hasLocalCopy) toMigrate.push(key);
      return;
    }
    const rows = hasLocalCopy ? mergeStoredTableCopies(key, idbRows, localRows) : idbRows;
    access.set(access.normalize ? rows.map(access.normalize) : rows);
    if (hasLocalCopy) toMigrate.push(key);
  });
  // normalizeJob() reads mechanic names, so jobs are normalized after
  // mechanics (DATA_TABLE_KEYS lists mechanics first).
  markDataChanged('load-idb');
  // Tables still stored as one record are rewritten grouped once.
  DATA_TABLE_KEYS.forEach(key => {
    if (tableIsBucketable(key) && stored[key] && !stored[key].bucketed && !toMigrate.includes(key)) toMigrate.push(key);
  });
  if (toMigrate.length) {
    toMigrate.forEach(key => pendingTableSaves.set(key, 'full'));
    await flushTableSaves();
  }
  return { backend: 'indexedDB', migrated: toMigrate };
}

function normaliseStoredArray(value) {
  return Array.isArray(value) ? value : [];
}

function clearDataTablesInIdb() {
  pendingTableSaves.clear();
  bucketedTableKeys.clear();
  lastSavedTableOrder.clear();
  partialSavedTablesAt.clear();
  return openDataIdb().then(db => new Promise(resolve => {
    const tx = db.transaction(DATA_IDB_STORE, 'readwrite');
    tx.objectStore(DATA_IDB_STORE).clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = tx.onabort = () => resolve(false);
  })).catch(() => false);
}

function extractMaxUpdatedAt(rows) {
  // Returns the latest source_updated_at value from an array of
  // shadow table rows, as an ISO string. Returns null if rows is
  // empty or no valid timestamps are found.
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let max = null;
  for (const row of rows) {
    const v = row.source_updated_at;
    if (v && (!max || v > max)) max = v;
  }
  return max;
}

function persistLocalBackupPayload(payload, stamp = nowISO()) {
  const encoded = JSON.stringify({
    at: stamp,
    deviceId: syncMeta.deviceId || '',
    updatedAt: syncMeta.updatedAt || stamp,
    payload,
  });
  if (encoded.length > LOCAL_BACKUP_MAX_CHARS) {
    try { localStorage.removeItem(SK.localBackupLatest); } catch (_) {}
    return false;
  }
  const saved = setLocalStorageSafe(SK.localBackupLatest, encoded, { retryAfterBackupCleanup: false, trackFailure: false });
  if (saved) syncMeta.localBackupAt = stamp;
  return saved;
}

function persistBeforePullBackup(payload) {
  const encoded = JSON.stringify(payload);
  if (encoded.length > LOCAL_BACKUP_MAX_CHARS) {
    try { localStorage.removeItem(BEFORE_PULL_BACKUP_KEY); } catch (_) {}
    return false;
  }
  return setLocalStorageSafe(BEFORE_PULL_BACKUP_KEY, encoded, { retryAfterBackupCleanup: false, trackFailure: false });
}

function saveAll(options = {}) {
  try {
    const scopedKeys = saveDomainKeySet(options.domain || options.domains, !!options.exactTables);
    markDataChanged(options.skipSync ? 'local-cache' : 'save');
    if (!syncMeta.deviceId) syncMeta.deviceId = 'dev-' + Math.random().toString(36).slice(2, 10);
    const saveStamp = nowISO();
    if (!options.preserveUpdatedAt) syncMeta.updatedAt = saveStamp;
    if (!options.skipSync) {
      syncMeta.pendingSync = true;
      syncMeta.pendingSince = syncMeta.pendingSince || syncMeta.updatedAt || saveStamp;
    }
    if (!scopedKeys) clearLargeLocalBackupKeys();
    const keysToWrite = scopedKeys || new Set(Object.keys(SAVE_KEY_WRITERS));
    keysToWrite.forEach(key => {
      const write = SAVE_KEY_WRITERS[key];
      if (write) write(options);
    });
    if (!scopedKeys && !options.skipSync && typeof buildSyncPayload === 'function') {
      try {
        persistLocalBackupPayload(buildSyncPayload(), saveStamp);
        setLocalStorageSafe(SK.syncMeta, JSON.stringify(syncMeta));
      } catch (backupErr) {
        console.warn('local backup save failed', backupErr);
      }
    }
    if (typeof renderSyncDiagnostics === 'function') renderSyncDiagnostics();
    // Queue changed records for upload (js/sync-outbox.js) shortly after
    // this burst of saves.
    if (!options.skipSync && typeof scheduleSyncV2Capture === 'function') scheduleSyncV2Capture();
    if (!options.skipSync && typeof queueAutoSync === 'function') {
      queueAutoSync({ domain: options.domain, domains: options.domains });
    }
    if (!scopedKeys) noteLocalSaveResult('saveAll', true);
  } catch(e) {
    console.warn('localStorage save failed', e);
    noteLocalSaveResult('saveAll', false, e);
  }
}

function loadAll() {
  if (window.__JALASAI_OPTIMISTIC_INVOICES instanceof Set) {
    window.__JALASAI_OPTIMISTIC_INVOICES.clear();
  }
  const load = (key, seed, fallback) => {
    const empty = seed || fallback || [];
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return empty;
      // A truncated LZ value decompresses to null; never let that crash boot.
      const parsed = parseLocalStorageJson(raw);
      if (Array.isArray(empty)) return Array.isArray(parsed) ? parsed : empty;
      return parsed && typeof parsed === 'object' ? parsed : empty;
    } catch { return empty; }
  };
  jobs       = load(SK.jobs,      []).map(normalizeJob);
  stock      = load(SK.stock,     []).map(normalizeStockItem);
  customers  = load(SK.customers, []).map(normalizeCustomer);
  mechanics  = load(SK.mechanics, []).map(normalizeMechanic);
  jobs       = jobs.map(normalizeJob);
  expenses   = load(SK.expenses,  []).map(normalizeExpense);
  incomeEntries = load(SK.incomeEntries, []).map(normalizeIncomeEntry);
  incomeEntries = incomeEntries.map(normalizeIncomeEntry);
  partsLog   = load(SK.partsLog,  []);
  auditLog   = load(SK.auditLog,  []);
  stockMovements = load(SK.stockMovements, []).map(normalizeStockMovement);
  syncMeta   = { ...DEFAULT_SYNC_META, ...load(SK.syncMeta, DEFAULT_SYNC_META) };
  followupStartDate = localStorage.getItem(SK.followupStartDate) || today();
  try {
    garageProfile = normalizeGarageProfile(JSON.parse(localStorage.getItem(SK.garageProfile) || 'null'));
  } catch (_) { garageProfile = { ...GARAGE_PROFILE_DEFAULTS }; }
  jobCtr     = parseInt(localStorage.getItem(SK.jobCtr)     || '9');
  invoiceCtr = parseInt(localStorage.getItem(SK.invoiceCtr) || '1');
  const projectGsUrl = String(CLOUD_DEFAULTS.projectUrl || '').trim();
  const projectCloudKey = String(CLOUD_DEFAULTS.anonKey || '').trim();
  const hasProjectCloudDefaults = !!(projectGsUrl && projectCloudKey);
  gsUrl      = hasProjectCloudDefaults
    ? projectGsUrl
    : (String(localStorage.getItem(SK.gsUrl) || '').trim() || projectGsUrl);
  cloudKey   = hasProjectCloudDefaults
    ? projectCloudKey
    : (String(localStorage.getItem(SK.cloudKey) || '').trim() || projectCloudKey);
  cloudEmail = localStorage.getItem(SK.cloudEmail) || '';
  syncMeta.adminEmails = normalizedAdminEmailList(syncMeta.adminEmails, CLOUD_DEFAULTS.adminEmails);
  if (!syncMeta.deviceId) {
    syncMeta.deviceId = 'dev-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(SK.syncMeta, JSON.stringify(syncMeta));
  }
  if (!localStorage.getItem(SK.followupStartDate)) localStorage.setItem(SK.followupStartDate, followupStartDate);
  markDataChanged('load');
  scheduleDataMaintenanceCleanup({ delayMs: 20000 });
}

function clearLocalDeviceDataAfterSignOut() {
  LOCAL_SIGN_OUT_STORAGE_KEYS.forEach(key => {
    try { localStorage.removeItem(key); } catch (_) {}
  });
  try {
    Object.keys(localStorage).forEach(key => {
      if (LOCAL_SIGN_OUT_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix))) {
        localStorage.removeItem(key);
      }
    });
  } catch (_) {}

  if (typeof clearDataTablesInIdb === 'function') clearDataTablesInIdb();
  // Disconnect only gets here once the upload queue is empty (disconnectGS).
  if (typeof clearSyncV2Store === 'function') clearSyncV2Store();

  jobs = [];
  stock = [];
  customers = [];
  mechanics = [];
  expenses = [];
  incomeEntries = [];
  partsLog = [];
  auditLog = [];
  stockMovements = [];
  jobCtr = 9;
  invoiceCtr = 1;
  followupStartDate = today();
  syncMeta = {
    ...DEFAULT_SYNC_META,
    deviceId: 'dev-' + Math.random().toString(36).slice(2, 10),
    adminEmails: normalizedAdminEmailList([], CLOUD_DEFAULTS.adminEmails),
  };

  markDataChanged('sign-out-clear');
  if (window.__JALASAI_OPTIMISTIC_INVOICES instanceof Set) {
    window.__JALASAI_OPTIMISTIC_INVOICES.clear();
  }
  if (typeof clearAllPaginationState === 'function') clearAllPaginationState();
  if (typeof renderCurrentPage === 'function') {
    try { renderCurrentPage({ forceRender: true }); } catch (err) { console.warn('sign-out clear render failed', err); }
  }
  if (typeof renderSyncDiagnostics === 'function') renderSyncDiagnostics();
}

function dataMaintenanceCleanupDone() {
  try {
    return localStorage.getItem(SK.bootCleanupVersion) === DATA_BOOT_CLEANUP_VERSION;
  } catch (_) {
    return false;
  }
}

function markDataMaintenanceCleanupDone() {
  try {
    localStorage.setItem(SK.bootCleanupVersion, DATA_BOOT_CLEANUP_VERSION);
  } catch (_) {}
}

function runDataMaintenanceCleanup(options = {}) {
  const force = !!options.force;
  const markDone = options.markDone !== false;
  if (!force && dataMaintenanceCleanupDone()) return { skipped: true };
  if (window.__JALASAI_DATA_MAINTENANCE_RUNNING) return { skipped: true };
  // The repair passes link and merge customers across ALL jobs. While older
  // invoices are still downloading they would work from part of the history,
  // so they wait; the history download schedules them when it finishes.
  if (typeof historyIncomplete === 'function' && historyIncomplete()) return { skipped: true, waiting: 'history' };
  window.__JALASAI_DATA_MAINTENANCE_RUNNING = true;
  const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const started = nowMs();
  try {
    const recoveredMechanics = recoverMechanicsFromReferences();
    if (recoveredMechanics.length) {
      jobs = jobs.map(normalizeJob);
      incomeEntries = incomeEntries.map(normalizeIncomeEntry);
    }
    const purgedVerificationJobs = purgeTemporaryVerificationJobs();
    // A phone without all history (rolling window) can't merge duplicate
    // customers: older invoices it doesn't hold would stay on the duplicate.
    const partialHistory = typeof localHistoryPartial === 'function' && localHistoryPartial();
    const tidied = tidyCustomerRecords({ skipMerge: partialHistory });
    const tidiedCustomers = !!(tidied && (tidied.tombstoned || tidied.healed));
    const changed = !!(
      purgedVerificationJobs
      || recoveredMechanics.length
      || tidiedCustomers
    );
    if (changed) {
      saveAll({ preserveUpdatedAt: true, skipSync: !(tidiedCustomers || purgedVerificationJobs) });
      if (typeof renderCurrentPage === 'function') {
        try { renderCurrentPage({ forceRender: true }); } catch (err) { console.warn('maintenance render failed', err); }
      }
    }
    if (markDone) markDataMaintenanceCleanupDone();
    const elapsed = Math.round(nowMs() - started);
    try {
      console.info(`[dataMaintenanceCleanup] changed=${changed} elapsed=${elapsed}ms reason=${options.reason || 'idle'}`);
    } catch (_) {}
    return { changed, elapsed, tidiedCustomers, purgedVerificationJobs, recoveredMechanics: recoveredMechanics.length };
  } catch (err) {
    console.warn('background data maintenance failed', err);
    return { error: err };
  } finally {
    window.__JALASAI_DATA_MAINTENANCE_RUNNING = false;
  }
}

function scheduleDataMaintenanceCleanup(options = {}) {
  const force = !!options.force;
  if (!force && dataMaintenanceCleanupDone()) return;
  if (window.__JALASAI_DATA_MAINTENANCE_SCHEDULED) return;
  window.__JALASAI_DATA_MAINTENANCE_SCHEDULED = true;
  const delayMs = Math.max(0, parseInt(options.delayMs ?? 20000, 10) || 0);
  const run = () => {
    window.__JALASAI_DATA_MAINTENANCE_SCHEDULED = false;
    runDataMaintenanceCleanup(options);
  };
  const scheduleIdle = () => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 30000 });
    else setTimeout(run, 0);
  };
  if (delayMs) setTimeout(scheduleIdle, delayMs);
  else scheduleIdle();
}

// ─── Invoice numbers (roadmap Stage 4) ────────────────────
// With supabase/2026-10-invoice-numbers-stage4.sql installed the server hands
// out numbers (jalasai_claim_invoice_no), so two phones never issue the same
// one. A new invoice first gets a draft number unique to this phone
// (D-AB12-3); claimPendingInvoiceNumbers() in js/sync.js swaps it for the
// real number as soon as the phone is online — any phone can do that, so a
// draft never gets stuck. A number typed by hand is used as typed.
const DRAFT_INVOICE_RE = /^D-[A-Z0-9]{2,8}-\d+$/;
const DRAFT_INVOICE_SEQ_KEY = 'js_draft_invoice_seq';

function isDraftInvoiceNo(value) {
  return DRAFT_INVOICE_RE.test(String(value || '').trim().toUpperCase());
}

function serverIssuesInvoiceNumbers() {
  return !!syncMeta && syncMeta.invoiceSeriesReady === true;
}

function nextDraftInvoiceNo() {
  let seq = 0;
  try { seq = parseInt(localStorage.getItem(DRAFT_INVOICE_SEQ_KEY) || '0', 10) || 0; } catch (_) {}
  seq += 1;
  try { localStorage.setItem(DRAFT_INVOICE_SEQ_KEY, String(seq)); } catch (_) {}
  return `D-${deviceShortId()}-${seq}`;
}

// What the invoice-number box starts with: empty ("Auto") when the server
// issues numbers, otherwise the old suggestion.
function invoiceNoPrefill() {
  return serverIssuesInvoiceNumbers() ? '' : suggestedNextInvoiceNo();
}

function applyInvoiceNoField(el, value) {
  if (!el) return;
  el.value = value !== undefined && value !== null && value !== '' ? value : invoiceNoPrefill();
  if (serverIssuesInvoiceNumbers()) el.placeholder = 'Auto — next number from cloud';
}

function nextInvoiceNo(manual) {
  if (manual && manual.trim()) return manual.trim();
  if (serverIssuesInvoiceNumbers()) return nextDraftInvoiceNo();
  const no = 'INV-' + String(invoiceCtr).padStart(4, '0');
  invoiceCtr++;
  localStorage.setItem(SK.invoiceCtr, invoiceCtr);
  return no;
}

function simpleInvoiceNumber(value = '') {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return '';
  const cleaned = text
    .replace(/\bINVOICE\b/g, '')
    .replace(/\bINV\b/g, '')
    .replace(/[\s#:/-]/g, '');
  if (!/^\d+$/.test(cleaned)) return '';
  return cleaned.replace(/^0+(?=\d)/, '');
}

let suggestedNextInvoiceNoCache = { signature: '', value: '' };

function suggestedNextInvoiceNo() {
  const signature = [
    window.__JALASAI_DATA_VERSION || 0,
    Array.isArray(jobs) ? jobs.length : 0,
    invoiceCtr || 1,
    syncMeta?.serverTotals?.maxInvoiceNo || 0,
  ].join('|');
  if (suggestedNextInvoiceNoCache.signature === signature) {
    return suggestedNextInvoiceNoCache.value;
  }
  const sources = jobs
    .filter(j => isLiveJob(j) && j.status === 'done' && String(j.invoiceNo || '').trim())
    .map(j => String(j.invoiceNo || '').trim());
  let bestNum = 0;
  let bestWidth = 4;
  sources.forEach(value => {
    const invoiceNo = simpleInvoiceNumber(value);
    if (!invoiceNo) return;
    const num = parseInt(invoiceNo, 10) || 0;
    if (num >= bestNum) {
      bestNum = num;
      bestWidth = invoiceNo.length || bestWidth;
    }
  });
  // While older invoices are still downloading, the server's highest number
  // guards the suggestion too (newest invoices load first, so this rarely
  // differs).
  const serverMax = typeof localHistoryPartial === 'function' && localHistoryPartial()
    ? parseInt(syncMeta?.serverTotals?.maxInvoiceNo || 0, 10) || 0
    : 0;
  if (serverMax > bestNum) {
    bestNum = serverMax;
    bestWidth = Math.max(bestWidth, String(serverMax).length);
  }
  const value = bestNum > 0
    ? String(bestNum + 1).padStart(bestWidth, '0')
    : String(Math.max(1, parseInt(invoiceCtr || 1, 10) || 1)).padStart(4, '0');
  suggestedNextInvoiceNoCache = { signature, value };
  return value;
}

// ─── Utility helpers ─────────────────────────────────────
function stSt(s)   { return s.qty === 0 ? 'out' : s.qty <= s.min ? 'low' : 'ok'; }
function stLbl(st) { return { out: 'Out of Stock', low: 'Low Stock', ok: 'In Stock' }[st]; }
function fmtMoney(n) { return '₹' + (n || 0).toLocaleString('en-IN'); }
function fmtDate(d)  { return d ? new Date(d).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'2-digit'}) : '—'; }
function fmtDateTime(d) {
  return d ? new Date(d).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
}

function isMechanicPlaceholderValue(value) {
  const text = String(value || '').trim().toLowerCase();
  return !text || ['no mechanic', 'quick invoice', 'n/a', 'na', 'unknown mechanic'].includes(text);
}

function findMechanicByIdOrName(value) {
  const text = String(value || '').trim();
  if (!text || !Array.isArray(mechanics)) return null;
  return mechanics.find(m => String(m.id || '').trim() === text)
    || mechanics.find(m => String(m.name || '').trim().toLowerCase() === text.toLowerCase())
    || null;
}

function canonicalMechanicIds(...sources) {
  const rawValues = sources.flatMap(source => Array.isArray(source) ? source : [source]);
  const hasMechanicDirectory = Array.isArray(mechanics) && mechanics.length > 0;
  return uniqStrings(rawValues
    .map(value => String(value || '').trim())
    .filter(value => !isMechanicPlaceholderValue(value))
    .map(value => {
      if (!hasMechanicDirectory) return value;
      const match = findMechanicByIdOrName(value);
      return match?.id || '';
    })
    .filter(Boolean));
}

function mechanicReferenceNames(record = {}) {
  return uniqStrings(
    []
      .concat(record?.mechanicNames || [])
      .concat(record?.mechanic_names || [])
      .concat(record?.mech ? [record.mech] : [])
      .concat(record?.mechName ? [record.mechName] : [])
      .concat(record?.mechanicName ? [record.mechanicName] : [])
      .concat(record?.mechanic_name ? [record.mechanic_name] : [])
      .concat(record?.mechanic ? [record.mechanic] : [])
      .join(',')
      .split(',')
      .map(name => String(name || '').trim())
      .filter(name => !isMechanicPlaceholderValue(name))
  );
}

// Workshop lanes. The lane is how the floor batches work: one mechanic, one set of
// tools, one lane, worked oldest-first. '' means Unsorted and shows as its own lane.
const JOB_LANES = [
  { value: 'mcu-lv', label: 'MCU / LV' },
  { value: 'bandh', label: 'Bandh' },
  { value: 'ev-service', label: 'EV Service' },
  { value: 'petrol', label: 'Petrol' },
];
const JOB_LANE_VALUES = JOB_LANES.map(l => l.value);
const JOB_UNSORTED_LANE_LABEL = 'Unsorted';

function jobLaneLabel(value) {
  const key = String(value || '').trim();
  return JOB_LANES.find(l => l.value === key)?.label || JOB_UNSORTED_LANE_LABEL;
}

// The board used to carry five open statuses plus a separate priority dropdown. Only
// three facts change what anyone does today: it is here, it is stuck waiting for a part,
// or it is finished and can go home. Older records are folded on read.
const JOB_LEGACY_STATUS_MAP = {
  waiting: 'in-shop',
  'in-progress': 'in-shop',
  returned: 'in-shop',
  'parts-needed': 'parts-needed',
  ready: 'ready',
  'in-shop': 'in-shop',
  done: 'done',
};

function normalizeJobStatus(value) {
  const key = String(value || '').trim();
  if (key === 'done') return 'done';
  return JOB_LEGACY_STATUS_MAP[key] || 'in-shop';
}

function normalizeJob(j) {
  const job = { ...j };
  // 'returned' meant the bike came back for rework. Collapsing it loses that, so keep
  // the one bit worth keeping before the original value is gone for good.
  if (String(job.status || '').trim() === 'returned') job.wasReturned = true;
  job.status = normalizeJobStatus(job.status);
  job.lane = JOB_LANE_VALUES.includes(String(job.lane || '').trim()) ? String(job.lane).trim() : '';
  job.partsUsed = Array.isArray(job.partsUsed) ? job.partsUsed : [];
  job.payments = Array.isArray(job.payments) ? job.payments : [];
  job.discount = parseFloat(job.discount || 0) || 0;
  const rawMechIds = []
    .concat(job.mechIds || [])
    .concat(job.mechanicIds || [])
    .concat(job.mechanic_ids || [])
    .concat(job.mechId ? [job.mechId] : [])
    .concat(job.mechanicId ? [job.mechanicId] : []);
  const storedMechNames = mechanicReferenceNames(job);
  job.mechIds = canonicalMechanicIds(rawMechIds, storedMechNames);
  job.mechId = job.mechIds[0] || '';
  if ((!job.mech || isMechanicPlaceholderValue(job.mech)) && job.mechIds.length && Array.isArray(mechanics)) {
    const names = job.mechIds
      .map(id => mechanics.find(m => String(m.id || '').trim() === id)?.name || '')
      .filter(Boolean);
    job.mech = names.join(', ');
  }
  if (!job.mech && storedMechNames.length) job.mech = storedMechNames.join(', ');
  job.doneAt = job.doneAt || '';
  job.deletedAt = job.deletedAt || '';
  job.totalOverride = job.totalOverride === '' || typeof job.totalOverride === 'undefined' || job.totalOverride === null
    ? ''
    : (parseFloat(job.totalOverride) || 0);
  job.createdAt = job.createdAt || job.doneAt || (job.date ? `${job.date}T${String(job.time || '00:00')}` : nowISO());
  job.updatedAt = job.updatedAt || job.doneAt || job.createdAt;
  job.photos = normalizePhotoArray(job.photos || job.photo || '');
  job.photo = job.photo || job.photos[0] || '';
  job.invoicePhotos = normalizePhotoArray(job.invoicePhotos || job.invoicePhoto || '');
  job.invoicePhoto = job.invoicePhoto || job.invoicePhotos[0] || '';
  job._searchText = stockSearchIndexText([
    job.id,
    job.cust,
    job.customer,
    job.customerName,
    job.phone,
    job.veh,
    job.vehicle,
    job.bikeName,
    job.vno,
    job.registerNumber,
    job.prob,
    job.problem,
    job.workDescription,
    job.notes,
    job.remarks,
    job.mech,
    ...(job.mechIds || []),
    job.invoiceNo,
    job.lane ? jobLaneLabel(job.lane) : '',
  ]);
  // Derived like _searchText ('_' keys never sync): screens call isLiveJob
  // several times per invoice per render, and the pollution check below is
  // regex-heavy (~1 s per render at 1 lakh invoices).
  job._nonWorkshop = isNonWorkshopJobRecord(job);
  return job;
}

function isLiveJob(job) {
  if (!job || String(job.deletedAt || '').trim()) return false;
  return typeof job._nonWorkshop === 'boolean' ? !job._nonWorkshop : !isNonWorkshopJobRecord(job);
}

function hasJobFieldValue(job, fields = []) {
  return fields.some(field => {
    const value = String(job?.[field] ?? '').trim().toLowerCase();
    return !!value && !['undefined', 'null', '—', '-'].includes(value);
  });
}

function isKnownNonJobRecordId(id = '') {
  const value = String(id || '').trim();
  return /^(log|inc|pay|sm|pe|sir|imp|money)/i.test(value)
    || /^e\d/i.test(value)
    || /^s\d{8,}/i.test(value);
}

function isCustomerShapedJobPollution(job, hasWorkshopCore) {
  if (hasWorkshopCore) return false;
  const id = String(job?.id || '').trim();
  const hasCustomerOnlyFields = hasJobFieldValue(job, ['name', 'email', 'address', 'lastVehicle', 'notes'])
    || Array.isArray(job?.vehicles);
  return /^(c|cust|customer|book2-customer|kb-customer)/i.test(id) && hasCustomerOnlyFields;
}

function isAuditShapedJobPollution(job, hasWorkshopCore) {
  if (hasWorkshopCore) return false;
  return hasJobFieldValue(job, ['action', 'entity', 'entityId', 'at'])
    || (job?.details && typeof job.details === 'object');
}

function isNonWorkshopJobRecord(job) {
  if (!job || typeof job !== 'object') return false;
  const id = String(job.id || '').trim();
  const notes = String(job.notes || job.remarks || job.importSource || '').toLowerCase();
  if (isTemporaryVerificationJob(job)) return true;
  const hasWorkshopCore = hasJobFieldValue(job, [
    'cust', 'customerName', 'veh', 'vehicle', 'vno', 'prob', 'problem', 'invoiceNo'
  ]);
  if (isKnownNonJobRecordId(id) && !hasWorkshopCore) return true;
  if (isCustomerShapedJobPollution(job, hasWorkshopCore)) return true;
  if (isAuditShapedJobPollution(job, hasWorkshopCore)) return true;
  if (/^(book2-customer|kb-customer)-/i.test(id)) return true;
  if (/^c\d{8,}/i.test(id) && !hasWorkshopCore) return true;
  if (
    /imported from full customer master|imported opening due from khatabook|full customer master/.test(notes)
    && !hasWorkshopCore
  ) return true;
  return false;
}

function isTemporaryVerificationJob(job) {
  if (!job || typeof job !== 'object') return false;
  const id = String(job.id || '').trim().toUpperCase();
  const customer = String(job.cust || job.customer || job.customerName || '').trim().toUpperCase();
  const vehicle = String(job.veh || job.vehicle || '').trim().toUpperCase();
  const phone = String(job.phone || '').replace(/\D/g, '');
  const text = [
    job.prob,
    job.problem,
    job.workDescription,
    job.notes,
    job.remarks,
    job.invoiceNo,
  ].map(value => String(value || '').toLowerCase()).join(' ');
  return (
    id === 'J009-FEFV'
    || customer === 'ZZ UI TEST 20260603'
    || phone === '9999906030'
    || (vehicle === 'TEST SCOOTER' && text.includes('verification'))
    || text.includes('temporary record for new ui verification')
    || text.includes('ui verification service and billing test')
  );
}

function purgeTemporaryVerificationJobs() {
  const stamp = nowISO();
  let purged = 0;
  jobs.forEach(job => {
    if (!job || !isTemporaryVerificationJob(job) || String(job.deletedAt || '').trim()) return;
    job.deletedAt = stamp;
    job.updatedAt = stamp;
    purged += 1;
  });
  if (purged) {
    try { console.info(`[purgeTemporaryVerificationJobs] tombstoned=${purged}`); } catch (e) {}
  }
  return purged;
}

function isPlaceholderOpenJob(job) {
  if (!isLiveJob(job) || String(job.status || '').trim() === 'done') return false;
  const cust = String(job.cust || job.customer || job.customerName || '').trim().toLowerCase();
  const veh = String(job.veh || job.vehicle || job.vehicleName || '').trim().toLowerCase();
  const prob = String(job.prob || job.problem || job.workDescription || '').trim().toLowerCase();
  const hasIdentity = !!String(job.phone || job.vno || job.reg || job.registerNumber || '').trim();
  const hasMoney = ['lab', 'prt', 'advance', 'totalOverride'].some(key => (parseFloat(job[key] || 0) || 0) > 0);
  const hasPhotos = normalizePhotoArray(job.photos || job.photo || job.invoicePhotos || job.invoicePhoto || '').length > 0;
  return cust === 'customer' && veh === 'vehicle' && prob === 'work' && !hasIdentity && !hasMoney && !hasPhotos;
}

const ACTIVE_JOB_STALE_DAYS = 30;

function jobDateMillis(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const date = raw.includes('T') ? raw.slice(0, 10) : raw;
  const millis = Date.parse(`${date}T00:00:00`);
  return Number.isFinite(millis) ? millis : 0;
}

function isStaleOpenJob(job) {
  const todayMillis = jobDateMillis(today());
  if (!todayMillis) return false;
  const deliveryMillis = jobDateMillis(job.delivery || job.expectedDelivery || job.deliveryDate);
  if (deliveryMillis && deliveryMillis >= todayMillis) return false;
  const latestMillis = Math.max(
    jobDateMillis(job.updatedAt),
    jobDateMillis(job.createdAt),
    jobDateMillis(job.date)
  );
  if (!latestMillis) return false;
  return latestMillis < todayMillis - (ACTIVE_JOB_STALE_DAYS * 24 * 60 * 60 * 1000);
}

function isActiveWorkshopJob(job) {
  return (
    isLiveJob(job)
    && String(job.status || '').trim() !== 'done'
    && !isPlaceholderOpenJob(job)
    && !isStaleOpenJob(job)
  );
}

function isFutureBusinessDate(dateValue) {
  const date = String(dateValue || '').slice(0, 10);
  return !!date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date > today();
}

function requireNotFutureBusinessDate(dateValue, label = 'Date') {
  if (!isFutureBusinessDate(dateValue)) return true;
  if (typeof toast === 'function') toast(`${label} cannot be in the future`);
  return false;
}

function applyDataEntryDateLimits() {
  const max = today();
  ['qi-invoice-date', 'done-invoice-date', 'em-date', 'im-date'].forEach(id => {
    const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (el) el.max = max;
  });
}

function ensureSharedSyncOverlay() {
  if (typeof document === 'undefined' || !document.body) return null;
  let overlay = document.getElementById('shared-sync-overlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'shared-sync-overlay';
  overlay.className = 'shared-sync-overlay';
  overlay.innerHTML = `
    <div class="shared-sync-box" role="status" aria-live="polite">
      <div class="shared-sync-spinner"></div>
      <div>
        <strong id="shared-sync-title">Saving locally</strong>
        <span id="shared-sync-copy">Updating cloud data...</span>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

function hasLocalBusinessDataSnapshot() {
  if (typeof localStorage === 'undefined') return false;
  try {
    if (localStorage.getItem('js_data_in_idb') === '1') return true;
  } catch (_) {}
  const keys = [SK.jobs, SK.stock, SK.customers, SK.mechanics, SK.expenses, SK.incomeEntries];
  return keys.some(key => {
    try {
      const raw = localStorage.getItem(key);
      return !!raw && raw !== '[]' && raw !== 'null' && raw !== 'undefined';
    } catch (_) {
      return false;
    }
  });
}

function startInitialDataLoadOverlay(message = 'Loading latest data...', options = {}) {
  const delayMs = Math.max(0, parseInt(options.delayMs ?? 180, 10) || 0);
  window.__JALASAI_INITIAL_LOAD_PENDING = true;
  window.__JALASAI_INITIAL_LOAD_STARTED_AT = Date.now();
  clearTimeout(window.__JALASAI_INITIAL_LOAD_SHOW_TIMER);
  const show = () => {
    if (!window.__JALASAI_INITIAL_LOAD_PENDING) return;
    window.__JALASAI_INITIAL_LOAD_OVERLAY = true;
    updateSharedSyncOverlay(message);
  };
  if (delayMs) window.__JALASAI_INITIAL_LOAD_SHOW_TIMER = setTimeout(show, delayMs);
  else show();
  clearTimeout(window.__JALASAI_INITIAL_LOAD_TIMER);
  window.__JALASAI_INITIAL_LOAD_TIMER = setTimeout(() => {
    finishInitialDataLoadOverlay();
  }, 12000);
}

function finishInitialDataLoadOverlay() {
  const started = window.__JALASAI_INITIAL_LOAD_STARTED_AT || 0;
  const elapsed = started ? Date.now() - started : 0;
  const close = () => {
    window.__JALASAI_INITIAL_LOAD_PENDING = false;
    window.__JALASAI_INITIAL_LOAD_OVERLAY = false;
    clearTimeout(window.__JALASAI_INITIAL_LOAD_SHOW_TIMER);
    clearTimeout(window.__JALASAI_INITIAL_LOAD_TIMER);
    updateSharedSyncOverlay('');
  };
  if (elapsed && elapsed < 220) setTimeout(close, 220 - elapsed);
  else close();
}

function finishInitialDataLoadAndRender(options = {}) {
  try {
    const renderedVersions = window.__pageRenderedVersions || {};
    const alreadyRendered = currentPage && renderedVersions[currentPage] !== undefined;
    const stale = typeof isAppTabStale === 'function' && isAppTabStale(currentPage);
    if (!options.localDataReady || !alreadyRendered || stale) {
      if (typeof renderCurrentPage === 'function') renderCurrentPage({ forceRender: stale });
    }
  } catch (err) {
    console.warn('initial render after data load failed', err);
  }
  finishInitialDataLoadOverlay();
}

function isWarmUiSwitchNavigation() {
  try {
    return sessionStorage.getItem('jalasai_ui_switch_warm') === '1';
  } catch (_) {
    return false;
  }
}

function consumeWarmUiSwitchNavigation() {
  const warm = isWarmUiSwitchNavigation();
  try { sessionStorage.removeItem('jalasai_ui_switch_warm'); } catch (_) {}
  return warm;
}

function updateSharedSyncOverlay(message = '') {
  const overlay = ensureSharedSyncOverlay();
  if (!overlay) return;
  const show = !!window.__JALASAI_INITIAL_LOAD_OVERLAY;
  const title = document.getElementById('shared-sync-title');
  const copy = document.getElementById('shared-sync-copy');
  if (title) title.textContent = 'Opening JalaSai';
  if (copy) copy.textContent = message || 'Showing saved work first. Cloud sync continues in the background.';
  overlay.classList.toggle('show', show);
  document.body.classList.toggle('shared-sync-busy', show);
}

function switchUiMode(path) {
  const targetLabel = path === 'newui/' || path.endsWith('/newui/') ? 'New UI' : 'Old UI';
  if (!confirm(`Switch to the ${targetLabel}?`)) return;
  try {
    if (typeof persistLocalBackupSnapshot === 'function') persistLocalBackupSnapshot();
    else if (typeof saveAll === 'function') saveAll({ preserveUpdatedAt: true, skipSync: true });
    sessionStorage.setItem('jalasai_ui_switch_warm', '1');
  } catch (err) {
    console.warn('UI switch local backup failed', err);
  }
  window.location.href = path;
}

function warmUiMode(path) {
  const targets = [path];
  if (path === 'newui/' || path === './newui/' || path.endsWith('/newui/')) {
    targets.push('newui/style.css', '/js/data.js', '/js/jobs.js', '/js/new-ui.js', '/js/sync.js');
  } else {
    targets.push('../style.css', '/js/data.js', '/js/jobs.js', '/js/sync.js');
  }
  targets.forEach(target => {
    try {
      fetch(target, { cache: 'force-cache' }).catch(() => {});
    } catch (_) {}
  });
}

function normalizeExpense(expense) {
  const item = { ...(expense || {}) };
  item.receipts = normalizePhotoArray(item.receipts || item.receipt || '');
  item.receipt = item.receipt || item.receipts[0] || '';
  item.deletedAt = item.deletedAt || '';
  item.createdAt = item.createdAt || item.timestamp || nowISO();
  item.updatedAt = item.updatedAt || item.timestamp || item.createdAt;
  return item;
}

function isLiveExpense(expense) {
  return !!expense && !String(expense.deletedAt || '').trim();
}

function normalizeCustomer(customer) {
  const item = { ...(customer || {}) };
  item.name = String(item.name || '').trim();
  item.phone = String(item.phone || '').trim();
  item.email = String(item.email || '').trim();
  item.address = String(item.address || '').trim();
  item.notes = String(item.notes || '').trim();
  item.deletedAt = item.deletedAt || '';
  item.createdAt = item.createdAt || today();
  item.updatedAt = item.updatedAt || item.createdAt || nowISO();
  item.vehicles = uniqStrings(item.vehicles);
  item.lastVehicle = String(item.lastVehicle || item.vehicles[0] || '').trim();
  if (item.lastVehicle) item.vehicles = uniqStrings([item.lastVehicle].concat(item.vehicles));
  item.reminders = normalizeCustomerReminders(item.reminders);
  return item;
}

function normalizeCustomerReminders(reminders) {
  const src = reminders && typeof reminders === 'object' ? reminders : {};
  const fb = src.feedback && typeof src.feedback === 'object' ? src.feedback : {};
  const sv = src.service && typeof src.service === 'object' ? src.service : {};
  const pm = src.payment && typeof src.payment === 'object' ? src.payment : {};
  return {
    feedback: {
      jobId: String(fb.jobId || ''),
      sentAt: String(fb.sentAt || ''),
      dismissedAt: String(fb.dismissedAt || ''),
    },
    service: {
      jobId: String(sv.jobId || ''),
      sentAt: String(sv.sentAt || ''),
      dismissedAt: String(sv.dismissedAt || ''),
    },
    payment: {
      sentAt: String(pm.sentAt || ''),
      dismissedAt: String(pm.dismissedAt || ''),
      snoozeUntil: String(pm.snoozeUntil || ''),
      snapshotTotal: parseFloat(pm.snapshotTotal || 0) || 0,
    },
  };
}

function isLiveCustomer(customer) {
  return !!customer && !String(customer.deletedAt || '').trim();
}

function isKnownNonCustomerId(value = '') {
  const id = String(value || '').trim();
  if (!id) return false;
  if (/^mm-/i.test(id)) return true;
  if (/^log/i.test(id)) return true;
  if (/^s17/i.test(id)) return true;
  if (/^KBJ/.test(id)) return true;
  if (/^J/.test(id) && !/^JAL/i.test(id)) return true;
  if (/^inc/i.test(id)) return true;
  if (/^pe1/i.test(id)) return true;
  if (/^sir1/i.test(id)) return true;
  if (/^imp1/i.test(id)) return true;
  if (/^e17/i.test(id)) return true;
  if (/^money/i.test(id)) return true;
  return false;
}

function normalizeIncomeEntry(entry) {
  const item = { ...entry };
  item.amount = parseFloat(item.amount || 0) || 0;
  item.date = item.date || ((item.timestamp || '').slice(0, 10)) || today();
  item.timestamp = item.timestamp || (item.date ? `${item.date}T00:00:00.000Z` : nowISO());
  item.kind = item.kind || 'misc_income';
  item.category = item.category || (item.kind === 'regular_income' ? 'Regular' : item.kind === 'other_income' ? 'Other' : 'Misc Income');
  item.note = item.note || '';
  item.description = item.description || item.note || '';
  item.invoiceNo = String(item.invoiceNo || '').trim().toUpperCase();
  item.mechId = String(item.mechId || item.mechanicId || item.mechanic_id || '').trim();
  const storedMechNames = uniqStrings(
    []
      .concat(item.mechName ? [item.mechName] : [])
      .concat(item.mechanicName ? [item.mechanicName] : [])
      .concat(item.mechanic_name ? [item.mechanic_name] : [])
      .concat(item.mechanicNames || [])
      .concat(item.mechanic_names || [])
      .join(',')
      .split(',')
      .map(name => String(name || '').trim())
      .filter(name => !isMechanicPlaceholderValue(name))
  );
  const normalizedMechIds = canonicalMechanicIds(item.mechId, storedMechNames);
  item.mechId = normalizedMechIds[0] || '';
  item.mechName = String(
    storedMechNames.join(', ')
    || (item.mechId ? (mechanics.find(m => String(m.id || '').trim() === item.mechId)?.name || '') : '')
    || ''
  ).trim();
  item.mechanicId = item.mechId;
  item.mechanic_id = item.mechId;
  item.mechanicName = item.mechName;
  item.mechanic_name = item.mechName;
  item.importSource = item.importSource || '';
  item.deletedAt = item.deletedAt || '';
  item.createdAt = item.createdAt || item.timestamp || nowISO();
  item.updatedAt = item.updatedAt || item.timestamp || item.createdAt;
  return item;
}

function isLiveIncomeEntry(entry) {
  return !!entry && !String(entry.deletedAt || '').trim();
}

function uniqStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || '').trim())
    .filter(Boolean))];
}

function normalizeStringList(values) {
  if (Array.isArray(values)) return uniqStrings(values);
  return uniqStrings(String(values || '').split(/[|,]/g));
}

function normalizedAdminEmailList(...lists) {
  return [...new Set(lists.flatMap(list =>
    (Array.isArray(list) ? list : [])
      .map(value => String(value || '').trim().toLowerCase())
      .filter(Boolean)
  ))];
}

function stockSearchIndexText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeSupplierMapEntry(entry) {
  const item = { ...(entry || {}) };
  item.supplier = String(item.supplier || '').trim();
  item.partNo = String(item.partNo || item.supplierPartNo || '').trim();
  item.description = String(item.description || item.rawDescription || '').trim();
  item.normalizedDescription = String(item.normalizedDescription || '').trim();
  item.catalogMapId = String(item.catalogMapId || '').trim();
  item.acceptedAt = item.acceptedAt || '';
  item.confidence = Math.max(0, Math.min(1, parseFloat(item.confidence || 0) || 0));
  return item;
}

function normalizeStockItem(item) {
  const stockItem = { ...(item || {}) };
  stockItem.aliases = uniqStrings(stockItem.aliases);
  stockItem.fits = normalizeStringList(stockItem.fits || stockItem.fitmentModels);
  stockItem.fitmentModels = normalizeStringList(stockItem.fitmentModels || stockItem.fits);
  if (!stockItem.fits.length && stockItem.fitmentModels.length) stockItem.fits = [...stockItem.fitmentModels];
  if (!stockItem.fitmentModels.length && stockItem.fits.length) stockItem.fitmentModels = [...stockItem.fits];
  stockItem.supplierMap = (Array.isArray(stockItem.supplierMap) ? stockItem.supplierMap : [])
    .map(normalizeSupplierMapEntry);
  stockItem.manufacturer = String(stockItem.manufacturer || stockItem.companyBrand || '').trim();
  stockItem.companyBrand = String(stockItem.companyBrand || stockItem.manufacturer || '').trim();
  stockItem.supplierPartNo = String(stockItem.supplierPartNo || '').trim();
  stockItem.notes = String(stockItem.notes || '').trim();
  stockItem.photos = normalizePhotoArray(stockItem.photos || stockItem.photo || '');
  stockItem.photo = stockItem.photo || stockItem.photos[0] || '';
  stockItem.lastPurchaseRate = parseFloat(stockItem.lastPurchaseRate ?? stockItem.cost ?? 0) || 0;
  stockItem.lastSellPrice = parseFloat(stockItem.lastSellPrice ?? stockItem.sellPrice ?? stockItem.cost ?? 0) || 0;
  stockItem.previousBuyPrice = parseFloat(stockItem.previousBuyPrice ?? 0) || 0;
  stockItem.previousSellPrice = parseFloat(stockItem.previousSellPrice ?? 0) || 0;
  stockItem.lastSupplier = String(stockItem.lastSupplier || stockItem.sup || '').trim();
  stockItem.deletedAt = stockItem.deletedAt || '';
  stockItem.createdAt = stockItem.createdAt || nowISO();
  stockItem.updatedAt = stockItem.updatedAt || stockItem.createdAt;
  stockItem._searchText = stockSearchIndexText([
    stockItem.name,
    stockItem.sku,
    stockItem.supplierPartNo,
    stockItem.fitment,
    ...(stockItem.fitmentModels || []),
    ...(stockItem.fits || []),
    stockItem.bike,
  ].join(' '));
  return stockItem;
}

function isLiveStockItem(item) {
  return !!item && !String(item.deletedAt || '').trim();
}

function normalizeMechanic(mechanic) {
  const item = { ...(mechanic || {}) };
  item.id = String(item.id || item.phone || item.name || '').trim();
  item.name = String(item.name || '').trim();
  item.phone = String(item.phone || '').trim();
  item.specialty = String(item.specialty || '').trim();
  item.color = String(item.color || '#00c896').trim() || '#00c896';
  item.active = item.active !== false;
  item.deletedAt = item.deletedAt || '';
  item.createdAt = item.createdAt || nowISO();
  item.updatedAt = item.updatedAt || item.createdAt;
  return item;
}

function isLiveMechanic(mechanic) {
  return !!mechanic && !String(mechanic.deletedAt || '').trim();
}

function mechanicColorFromName(name = '') {
  const palette = ['#00c896', '#ff6b35', '#f5c518', '#38bdf8', '#ef476f', '#7c3aed'];
  const text = String(name || '').trim().toLowerCase();
  if (!text) return palette[0];
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = ((hash * 31) + text.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

function legacyMechanicId(name = '') {
  const slug = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `m-legacy-${slug || 'mechanic'}`;
}

function recoverMechanicsFromReferences() {
  if (!Array.isArray(mechanics)) mechanics = [];
  const recovered = [];
  const addRecovered = (name) => {
    const cleanName = String(name || '').trim();
    if (isMechanicPlaceholderValue(cleanName)) return;
    if (findMechanicByIdOrName(cleanName)) return;
    const item = normalizeMechanic({
      id: legacyMechanicId(cleanName),
      name: cleanName,
      phone: '',
      specialty: 'Recovered from history',
      color: mechanicColorFromName(cleanName),
      active: true,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      importSource: 'legacy-recovery',
    });
    if (findMechanicByIdOrName(item.id) || findMechanicByIdOrName(item.name)) return;
    mechanics.push(item);
    recovered.push(item);
  };

  jobs.forEach(job => {
    mechanicReferenceNames(job).forEach(addRecovered);
  });

  (incomeEntries || []).forEach(entry => {
    uniqStrings(
      []
        .concat(entry?.mechName ? [entry.mechName] : [])
        .concat(entry?.mechanicName ? [entry.mechanicName] : [])
        .concat(entry?.mechanic_name ? [entry.mechanic_name] : [])
        .concat(entry?.mechanicNames || [])
        .concat(entry?.mechanic_names || [])
        .join(',')
        .split(',')
        .map(name => String(name || '').trim())
        .filter(Boolean)
    ).forEach(addRecovered);
  });

  return recovered;
}

function normalizeStockMovement(entry) {
  const item = { ...(entry || {}) };
  item.qty = parseFloat(item.qty || 0) || 0;
  item.rate = parseFloat(item.rate || 0) || 0;
  item.amount = parseFloat(item.amount || 0) || 0;
  item.type = item.type || 'purchase';
  item.createdAt = item.createdAt || nowISO();
  item.updatedAt = item.updatedAt || item.createdAt;
  return item;
}

function tidyCustomerRecords(options = {}) {
  const stamp = nowISO();
  let tombstoned = 0;
  let healed = 0;

  customers.forEach(c => {
    if (!c) return;
    if (!isLiveCustomer(c)) return;
    const name = String(c.name || '').trim();
    const wrongType = isKnownNonCustomerId(c.id);
    if (name && !wrongType) return;
    c.name = '';
    c.deletedAt = c.deletedAt || stamp;
    c.updatedAt = stamp;
    tombstoned += 1;
  });

  const seenCustomerIds = new Set();
  customers.forEach(c => {
    if (!c || !isLiveCustomer(c)) return;
    const id = String(c.id || '').trim();
    if (!id || seenCustomerIds.has(id)) {
      c.id = nextId('c');
      c.updatedAt = stamp;
      healed += 1;
    }
    seenCustomerIds.add(String(c.id || '').trim());
  });

  const mergeKeyForCustomer = (customer) => {
    const phoneKey = customerPhoneKey(customer?.phone || '');
    const nameKey = strongCustomerNameKey(customer?.name || '');
    if (phoneKey && nameKey) return `phone-name:${phoneKey}:${nameKey}`;
    if (!phoneKey && nameKey) return `name:${nameKey}`;
    return '';
  };
  const directCustomerJobCount = (customer) => jobs.filter(job =>
    isLiveJob(job) && String(job.custId || '').trim() === String(customer?.id || '').trim()
  ).length;
  const identityBuckets = new Map();
  customers.forEach(customer => {
    if (!isLiveCustomer(customer)) return;
    const key = mergeKeyForCustomer(customer);
    if (!key) return;
    if (!identityBuckets.has(key)) identityBuckets.set(key, []);
    identityBuckets.get(key).push(customer);
  });
  identityBuckets.forEach(bucket => {
    if (bucket.length < 2 || options.skipMerge) return;
    bucket.sort((a, b) =>
      directCustomerJobCount(b) - directCustomerJobCount(a)
      || (b.vehicles || []).length - (a.vehicles || []).length
      || (Date.parse(b.updatedAt || b.createdAt || 0) || 0) - (Date.parse(a.updatedAt || a.createdAt || 0) || 0)
    );
    const keeper = bucket[0];
    bucket.slice(1).forEach(duplicate => {
      const duplicateId = String(duplicate.id || '').trim();
      if (!duplicateId || duplicateId === keeper.id) return;
      jobs.forEach(job => {
        if (!isLiveJob(job) || String(job.custId || '').trim() !== duplicateId) return;
        job.custId = keeper.id;
        job.updatedAt = stamp;
        healed += 1;
      });
      keeper.phone = keeper.phone || duplicate.phone || '';
      keeper.email = keeper.email || duplicate.email || '';
      keeper.address = keeper.address || duplicate.address || '';
      keeper.notes = keeper.notes || duplicate.notes || '';
      keeper.lastVehicle = keeper.lastVehicle || duplicate.lastVehicle || '';
      keeper.vehicles = uniqStrings([keeper.lastVehicle].concat(keeper.vehicles || [], duplicate.vehicles || []));
      keeper.updatedAt = stamp;
      duplicate.deletedAt = duplicate.deletedAt || stamp;
      duplicate.updatedAt = stamp;
      tombstoned += 1;
    });
  });

  const index = buildCustomerMatchIndex(customers);
  const attachJobVehicle = (customer, job) => {
    if (!customer || !job) return false;
    let changed = false;
    const phone = String(job.phone || '').trim();
    const vehicle = String(job.veh || '').trim();
    if (phone && !String(customer.phone || '').trim()) {
      customer.phone = phone;
      changed = true;
    }
    if (vehicle && !(customer.vehicles || []).includes(vehicle)) {
      customer.lastVehicle = customer.lastVehicle || vehicle;
      customer.vehicles = uniqStrings([vehicle].concat(customer.vehicles || []));
      changed = true;
    }
    if (changed) customer.updatedAt = stamp;
    return changed;
  };

  jobs.forEach(j => {
    if (!j || (j.deletedAt && String(j.deletedAt).trim())) return;
    const custName = String(jobIdentityName(j) || j.cust || '').trim();
    const custId = String(j.custId || '').trim();
    const phone = String(j.phone || '').trim();
    const vehicle = String(j.veh || '').trim();

    let match = bestCustomerForJob(j, index, { allowNameFallback: true });
    const current = custId ? index.byId.get(custId) : null;
    const wrongCurrent = current && !customerMatchesJob(current, j, { allowNameFallback: true });

    if (!match && custName && !isWeakCustomerName(custName)) {
      const created = normalizeCustomer({
        id: nextId('c'),
        name: custName,
        phone,
        email: '',
        address: '',
        vehicles: vehicle ? [vehicle] : [],
        lastVehicle: vehicle || '',
        notes: '',
        createdAt: j.date || today(),
        updatedAt: stamp,
      });
      customers.push(created);
      addCustomerToMatchIndex(index, created);
      match = created;
      healed += 1;
    }

    if (match && match.id && j.custId !== match.id) {
      j.custId = match.id;
      j.updatedAt = stamp;
      healed += 1;
    } else if (!match && wrongCurrent) {
      j.custId = '';
      j.updatedAt = stamp;
      healed += 1;
    }

    if (match && attachJobVehicle(match, j)) {
      healed += 1;
    }
  });

  customers.forEach(customer => {
    if (!isLiveCustomer(customer)) return;
    const ownedJobs = jobs.filter(job => customerMatchesJob(customer, job, { allowNameFallback: true }));
    if (!ownedJobs.length) return;
    const vehicles = uniqStrings(ownedJobs
      .map(job => String(job.veh || '').trim())
      .filter(vehicle => vehicle && !isWeakCustomerName(vehicle)));
    const currentVehicles = uniqStrings(customer.vehicles || []);
    const sameVehicles = vehicles.length === currentVehicles.length
      && vehicles.every((vehicle, index) => vehicle === currentVehicles[index]);
    const nextLastVehicle = vehicles[0] || '';
    if (sameVehicles && String(customer.lastVehicle || '') === nextLastVehicle) return;
    customer.vehicles = vehicles;
    customer.lastVehicle = nextLastVehicle;
    customer.updatedAt = stamp;
    healed += 1;
  });

  if (tombstoned || healed) {
    try { console.info(`[tidyCustomerRecords] tombstoned=${tombstoned} healed=${healed}`); } catch (e) {}
  }
  return { tombstoned, healed };
}

function jobSubtotal(j) {
  return (j.lab || 0) + (j.prt || 0);
}

function jobDiscountAmount(j) {
  return Math.max(0, parseFloat(j.discount || 0) || 0);
}

function jobTotal(j) {
  const override = j?.totalOverride;
  if (override !== '' && override !== null && typeof override !== 'undefined' && Number.isFinite(parseFloat(override))) {
    return Math.max(0, parseFloat(override) || 0);
  }
  return Math.max(0, jobSubtotal(j) - jobDiscountAmount(j));
}

function jobPaid(j) {
  return parseFloat(j.payment || 0) || 0;
}

function jobNetBalance(j) {
  return (jobTotal(j) - jobPaid(j));
}

function jobDue(j) {
  return Math.max(0, jobNetBalance(j));
}

function jobAdvance(j) {
  return Math.max(0, -jobNetBalance(j));
}

function resolveBalanceState(netAmount) {
  const value = parseFloat(netAmount || 0) || 0;
  if (value > 0.009) return 'owe';
  if (value < -0.009) return 'advance';
  return 'clear';
}

function balanceStateMeta(balance) {
  const value = typeof balance === 'number' ? balance : (balance?.net ?? 0);
  const state = typeof balance === 'string' ? balance : (balance?.state || resolveBalanceState(value));
  const amount = Math.abs(parseFloat(typeof balance === 'number' ? value : (balance?.amount ?? value)) || 0);
  if (state === 'owe') return { state, amount, label: `Owe ${fmtMoney(amount)}`, shortLabel: `Owe ${fmtMoney(amount)}`, color: 'var(--dan)' };
  if (state === 'advance') return { state, amount, label: `Advance ${fmtMoney(amount)}`, shortLabel: `Advance ${fmtMoney(amount)}`, color: '#00c896' };
  return { state: 'clear', amount: 0, label: 'Clear', shortLabel: 'Clear', color: 'var(--mut)' };
}

function customerPhoneKey(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function isUsableCustomerPhone(value = '') {
  return customerPhoneKey(value).length >= 7;
}

function customerNameKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isWeakCustomerName(value = '') {
  const key = customerNameKey(value);
  if (!key || key.length < 3) return true;
  if (/^\d+$/.test(key)) return true;
  if (key.includes('opening balance') || key.includes('open balance')) return true;
  return [
    'opening balance',
    'open balance',
    'balance',
    'cash',
    'walk in',
    'walk-in',
    'unknown',
    'unknown customer',
    'customer',
    'no name',
    'na',
    'n/a',
  ].includes(key);
}

function strongCustomerNameKey(value = '') {
  const key = customerNameKey(value);
  return isWeakCustomerName(key) ? '' : key;
}

function customerNameTokens(value = '') {
  const ignored = new Set([
    'bhai', 'bai', 'ben', 'ji', 'kaka', 'kaki',
    'ola', 's1', 'pro', 'activa', 'access', 'spl', 'splendor',
    'hero', 'honda', 'tvs', 'dio', 'bike', 'scooter',
    'khatabook', 'balance', 'imported',
  ]);
  return strongCustomerNameKey(value)
    .split(/[^a-z0-9]+/i)
    .map(token => token.trim())
    .filter(token => token.length >= 3 && !ignored.has(token) && !/^\d+$/.test(token));
}

function jobLooksLikeOpeningBalance(job) {
  const text = [
    job?.id,
    job?.invoiceNo,
    job?.cust,
    job?.customerName,
    job?.prob,
    job?.notes,
    job?.remarks,
  ].map(value => String(value || '').toLowerCase()).join(' ');
  return text.includes('opening balance')
    || text.includes('open balance')
    || text.includes('khatabook')
    || /-kb\b/i.test(String(job?.id || job?.invoiceNo || ''));
}

function jobIdentityName(job) {
  const primary = String(job?.cust || job?.customerName || '').trim();
  const vehicle = String(job?.veh || '').trim();
  if (jobLooksLikeOpeningBalance(job)) {
    if (!isWeakCustomerName(primary)) return primary;
    if (!isWeakCustomerName(vehicle)) return vehicle;
    const ref = String(job?.invoiceNo || job?.id || '').trim();
    return ref ? `Khatabook Balance ${ref}` : 'Khatabook Balance';
  }
  if (!isWeakCustomerName(primary)) return primary;
  return primary;
}

function customerHasOpeningBalanceEvidence(customer, job) {
  if (!jobLooksLikeOpeningBalance(job)) return true;
  const customerPhone = customerPhoneKey(customer?.phone || '');
  const jobPhone = customerPhoneKey(job?.phone || '');
  if (customerPhone && jobPhone && customerPhone === jobPhone) return true;

  const customerName = strongCustomerNameKey(customer?.name || '');
  const identityName = strongCustomerNameKey(jobIdentityName(job));
  if (customerName && identityName && customerName === identityName) return true;

  const customerTokens = new Set(customerNameTokens(customer?.name || ''));
  const identityTokens = customerNameTokens(jobIdentityName(job));
  return !!identityTokens.length && identityTokens.some(token => customerTokens.has(token));
}

function customerNamesConflict(left = '', right = '') {
  const leftKey = strongCustomerNameKey(left);
  const rightKey = strongCustomerNameKey(right);
  if (!leftKey || !rightKey || leftKey === rightKey) return false;
  const leftTokens = new Set(customerNameTokens(leftKey));
  const rightTokens = customerNameTokens(rightKey);
  if (!leftTokens.size || !rightTokens.length) return false;
  return !rightTokens.some(token => leftTokens.has(token));
}

function buildCustomerMatchIndex(customerList = customers) {
  const live = (Array.isArray(customerList) ? customerList : []).filter(isLiveCustomer);
  const byId = new Map();
  const phoneBuckets = new Map();
  const nameBuckets = new Map();
  const nameTokenBuckets = new Map();

  live.forEach(customer => {
    const id = String(customer?.id || '').trim();
    if (id) byId.set(id, customer);

    const phoneKey = customerPhoneKey(customer?.phone || '');
    if (phoneKey && phoneKey.length >= 7) {
      if (!phoneBuckets.has(phoneKey)) phoneBuckets.set(phoneKey, []);
      phoneBuckets.get(phoneKey).push(customer);
    }

    const nameKey = strongCustomerNameKey(customer?.name || '');
    if (nameKey) {
      if (!nameBuckets.has(nameKey)) nameBuckets.set(nameKey, []);
      nameBuckets.get(nameKey).push(customer);
    }

    customerNameTokens(customer?.name || '').forEach(token => {
      if (!nameTokenBuckets.has(token)) nameTokenBuckets.set(token, []);
      nameTokenBuckets.get(token).push(customer);
    });
  });

  const byPhone = new Map();
  const duplicatePhones = new Set();
  phoneBuckets.forEach((bucket, key) => {
    if (bucket.length === 1) byPhone.set(key, bucket[0]);
    else duplicatePhones.add(key);
  });

  const byName = new Map();
  const duplicateNames = new Set();
  nameBuckets.forEach((bucket, key) => {
    if (bucket.length === 1) byName.set(key, bucket[0]);
    else duplicateNames.add(key);
  });

  const byNameToken = new Map();
  const duplicateNameTokens = new Set();
  nameTokenBuckets.forEach((bucket, key) => {
    const uniqueCustomers = [...new Set(bucket)];
    if (uniqueCustomers.length === 1) byNameToken.set(key, uniqueCustomers[0]);
    else duplicateNameTokens.add(key);
  });

  return { live, byId, byPhone, byName, byNameToken, duplicatePhones, duplicateNames, duplicateNameTokens };
}

function addCustomerToMatchIndex(index, customer) {
  if (!index || !customer || !isLiveCustomer(customer)) return;
  const id = String(customer.id || '').trim();
  if (id) index.byId.set(id, customer);

  const phoneKey = customerPhoneKey(customer.phone || '');
  if (phoneKey && phoneKey.length >= 7 && !index.duplicatePhones.has(phoneKey)) {
    if (index.byPhone.has(phoneKey) && index.byPhone.get(phoneKey) !== customer) {
      index.byPhone.delete(phoneKey);
      index.duplicatePhones.add(phoneKey);
    } else {
      index.byPhone.set(phoneKey, customer);
    }
  }

  const nameKey = strongCustomerNameKey(customer.name || '');
  if (nameKey && !index.duplicateNames.has(nameKey)) {
    if (index.byName.has(nameKey) && index.byName.get(nameKey) !== customer) {
      index.byName.delete(nameKey);
      index.duplicateNames.add(nameKey);
    } else {
      index.byName.set(nameKey, customer);
    }
  }

  customerNameTokens(customer.name || '').forEach(token => {
    if (!index.byNameToken || !index.duplicateNameTokens || index.duplicateNameTokens.has(token)) return;
    if (index.byNameToken.has(token) && index.byNameToken.get(token) !== customer) {
      index.byNameToken.delete(token);
      index.duplicateNameTokens.add(token);
    } else {
      index.byNameToken.set(token, customer);
    }
  });
}

function bestCustomerByNameTokens(name, index) {
  if (!index?.byNameToken) return null;
  const matches = new Set();
  customerNameTokens(name).forEach(token => {
    if (index.duplicateNameTokens?.has(token)) return;
    const matched = index.byNameToken.get(token);
    if (matched) matches.add(matched);
  });
  return matches.size === 1 ? [...matches][0] : null;
}

function customerJobIdentityConflict(customer, job) {
  if (!customer || !job) return false;
  if (jobLooksLikeOpeningBalance(job) && !customerHasOpeningBalanceEvidence(customer, job)) return true;
  const customerPhone = customerPhoneKey(customer.phone || '');
  const jobPhone = customerPhoneKey(job.phone || '');
  if (customerPhone && jobPhone && customerPhone !== jobPhone) return true;

  if (customerNamesConflict(customer.name || '', jobIdentityName(job))) return true;

  return false;
}

function customerMatchesJob(customer, job, options = {}) {
  if (!customer || !job || !isLiveCustomer(customer) || !isLiveJob(job)) return false;
  const customerId = String(customer.id || '').trim();
  const jobCustId = String(job.custId || '').trim();

  if (jobCustId) {
    return !!(customerId && jobCustId === customerId && !customerJobIdentityConflict(customer, job));
  }

  const customerPhone = customerPhoneKey(customer.phone || '');
  const jobPhone = customerPhoneKey(job.phone || '');
  if (customerPhone && jobPhone && customerPhone === jobPhone && !customerJobIdentityConflict(customer, job)) {
    return true;
  }

  if (options.allowNameFallback !== false) {
    const customerName = strongCustomerNameKey(customer.name || '');
    const jobName = strongCustomerNameKey(jobIdentityName(job));
    if (customerName && jobName && customerName === jobName && !customerJobIdentityConflict(customer, job)) {
      return true;
    }
  }

  return false;
}

function bestCustomerForJob(job, index = buildCustomerMatchIndex(customers), options = {}) {
  if (!job || !isLiveJob(job)) return null;
  const jobCustId = String(job.custId || '').trim();
  const byIdCustomer = jobCustId ? index.byId.get(jobCustId) : null;
  if (byIdCustomer && customerMatchesJob(byIdCustomer, job, options)) return byIdCustomer;

  const phoneKey = customerPhoneKey(job.phone || '');
  if (phoneKey && !index.duplicatePhones.has(phoneKey)) {
    const byPhoneCustomer = index.byPhone.get(phoneKey);
    if (byPhoneCustomer && !customerJobIdentityConflict(byPhoneCustomer, job)) return byPhoneCustomer;
  }

  if (options.allowNameFallback !== false) {
    const identityName = jobIdentityName(job);
    const nameKey = strongCustomerNameKey(identityName);
    if (nameKey && !index.duplicateNames.has(nameKey)) {
      const byNameCustomer = index.byName.get(nameKey);
      if (byNameCustomer && !customerJobIdentityConflict(byNameCustomer, job)) return byNameCustomer;
    }
    const byTokenCustomer = bestCustomerByNameTokens(identityName, index);
    if (byTokenCustomer && !customerJobIdentityConflict(byTokenCustomer, job)) return byTokenCustomer;
  }

  return null;
}

function jobSummaryStamp(job) {
  if (!job) return 0;
  if (typeof jobDateTimeValue === 'function') return jobDateTimeValue(job);
  return Date.parse(job.updatedAt || job.doneAt || job.createdAt || (job.date ? `${job.date}T${job.time || '00:00'}` : '')) || 0;
}

function buildCustomerJobSummaryIndex(customerList = customers, jobList = jobs, options = {}) {
  const index = buildCustomerMatchIndex(customerList);
  const summaries = new Map();

  index.live.forEach(customer => {
    summaries.set(customer.id, {
      customer,
      jobs: [],
      visits: 0,
      doneVisits: 0,
      spent: 0,
      net: 0,
      due: 0,
      advance: 0,
      active: 0,
      lastJob: null,
      lastStamp: 0,
    });
  });

  (Array.isArray(jobList) ? jobList : []).forEach(job => {
    if (!isLiveJob(job)) return;
    const owner = bestCustomerForJob(job, index, { allowNameFallback: options.allowNameFallback !== false });
    if (!owner || !owner.id) return;
    const summary = summaries.get(owner.id);
    if (!summary) return;
    summary.jobs.push(job);
    summary.visits += 1;
    if (job.status === 'done') {
      summary.doneVisits += 1;
      summary.spent += jobTotal(job);
    } else {
      summary.active += 1;
    }
    summary.net += jobNetBalance(job);
    const stamp = jobSummaryStamp(job);
    if (stamp >= summary.lastStamp) {
      summary.lastStamp = stamp;
      summary.lastJob = job;
    }
  });

  summaries.forEach(summary => {
    summary.due = Math.max(0, summary.net);
    summary.advance = Math.max(0, -summary.net);
  });

  return { index, summaries };
}

function customerJobsForBalance(custId, options = {}) {
  const excludeJobId = options.excludeJobId || '';
  const customer = customers.find(c => c.id === custId && isLiveCustomer(c));
  if (!customer) return [];
  return jobs.filter(j => customerMatchesJob(customer, j, { allowNameFallback: true }) && j.id !== excludeJobId);
}

function addDaysToDate(dateValue, days) {
  const base = String(dateValue || '').slice(0, 10);
  if (!base) return '';
  const dt = new Date(`${base}T00:00:00`);
  dt.setDate(dt.getDate() + (parseInt(days, 10) || 0));
  return dt.toISOString().slice(0, 10);
}

function daysSinceDate(dateValue) {
  const base = String(dateValue || '').slice(0, 10);
  if (!base) return 0;
  const now = new Date(`${today()}T00:00:00`);
  const dt = new Date(`${base}T00:00:00`);
  return Math.floor((now.getTime() - dt.getTime()) / 86400000);
}

function customerCompletedJobs(custId) {
  const customer = customers.find(c => c.id === custId && isLiveCustomer(c));
  if (!customer) return [];
  return jobs
    .filter(j => {
      if (!customerMatchesJob(customer, j, { allowNameFallback: true }) || j.status !== 'done') return false;
      const serviceDate = (j.doneAt || '').slice(0, 10) || j.date || '';
      return !!serviceDate && serviceDate >= (followupStartDate || today());
    })
    .sort((a, b) => jobDateTimeValue(b) - jobDateTimeValue(a));
}

function latestCustomerServiceJob(custId) {
  return customerCompletedJobs(custId)[0] || null;
}

function customerFollowupStatusFromJobs(customer, customerJobs = []) {
  const reminders = customer ? normalizeCustomerReminders(customer.reminders) : normalizeCustomerReminders();
  const job = (Array.isArray(customerJobs) ? customerJobs : [])
    .filter(j => {
      if (!j || j.status !== 'done') return false;
      const serviceDate = (j.doneAt || '').slice(0, 10) || j.date || '';
      return !!serviceDate && serviceDate >= (followupStartDate || today());
    })
    .sort((a, b) => jobDateTimeValue(b) - jobDateTimeValue(a))[0] || null;
  if (!job) {
    return {
      lastServiceJob: null,
      lastServiceDate: '',
      followupStartDate: followupStartDate || today(),
      feedbackDueDate: '',
      serviceReminderDate: '',
      feedbackDue: false,
      serviceReminderDue: false,
      feedbackDaysLeft: 0,
      serviceDaysLeft: 0,
      feedbackHandled: false,
      serviceHandled: false,
      feedbackActive: false,
      serviceActive: false,
    };
  }
  const serviceDate = (job.doneAt || '').slice(0, 10) || job.date || '';
  const feedbackDueDate = addDaysToDate(serviceDate, 7);
  const serviceReminderDate = addDaysToDate(serviceDate, 75);
  const feedbackDaysLeft = daysSinceDate(feedbackDueDate) * -1;
  const serviceDaysLeft = daysSinceDate(serviceReminderDate) * -1;
  const feedbackDue = !!feedbackDueDate && today() >= feedbackDueDate;
  const serviceReminderDue = !!serviceReminderDate && today() >= serviceReminderDate;
  const feedbackHandled = reminders.feedback.jobId === job.id
    && (!!reminders.feedback.sentAt || !!reminders.feedback.dismissedAt);
  const serviceHandled = reminders.service.jobId === job.id
    && (!!reminders.service.sentAt || !!reminders.service.dismissedAt);
  return {
    lastServiceJob: job,
    lastServiceDate: serviceDate,
    followupStartDate: followupStartDate || today(),
    feedbackDueDate,
    serviceReminderDate,
    feedbackDue,
    serviceReminderDue,
    feedbackDaysLeft,
    serviceDaysLeft,
    feedbackHandled,
    serviceHandled,
    feedbackActive: feedbackDue && !feedbackHandled,
    serviceActive: serviceReminderDue && !serviceHandled,
  };
}

function customerFollowupStatus(custId) {
  const customer = customers.find(c => c.id === custId && isLiveCustomer(c));
  if (!customer) return customerFollowupStatusFromJobs(null, []);
  return customerFollowupStatusFromJobs(customer, customerJobsForBalance(custId));
}

function customerPaymentReminderStatusFromJobs(customer, customerJobs = []) {
  if (!customer) {
    return { dueTotal: 0, dueJobs: [], handled: false, active: false, snoozeUntil: '' };
  }
  const dueJobs = (Array.isArray(customerJobs) ? customerJobs : []).filter(j => jobDue(j) > 0);
  const dueTotal = dueJobs.reduce((sum, j) => sum + jobDue(j), 0);
  const reminders = normalizeCustomerReminders(customer.reminders).payment;
  if (dueTotal <= 0) {
    return { dueTotal: 0, dueJobs: [], handled: false, active: false, snoozeUntil: '' };
  }
  const snoozeUntil = reminders.snoozeUntil || '';
  const snoozeActive = !!snoozeUntil && today() < snoozeUntil;
  const balanceGrew = !!(reminders.sentAt || reminders.dismissedAt)
    && dueTotal > (reminders.snapshotTotal || 0);
  const handled = snoozeActive && !balanceGrew;
  return {
    dueTotal,
    dueJobs,
    handled,
    active: !handled,
    snoozeUntil,
  };
}

function customerPaymentReminderStatus(custId) {
  const customer = customers.find(c => c.id === custId && isLiveCustomer(c));
  if (!customer) return customerPaymentReminderStatusFromJobs(null, []);
  return customerPaymentReminderStatusFromJobs(customer, customerJobsForBalance(custId));
}

function markCustomerReminder(custId, type, action, extra = {}) {
  const customer = customers.find(c => c.id === custId && isLiveCustomer(c));
  if (!customer) return null;
  customer.reminders = normalizeCustomerReminders(customer.reminders);
  const stamp = nowISO();
  if (type === 'feedback' || type === 'service') {
    const jobId = String(extra.jobId || '');
    if (!jobId) return null;
    customer.reminders[type] = {
      jobId,
      sentAt: action === 'sent' ? stamp : '',
      dismissedAt: action === 'dismissed' ? stamp : '',
    };
    if (type === 'service' && action === 'sent') {
      customer.reminders.feedback = {
        jobId,
        sentAt: customer.reminders.feedback.sentAt || '',
        dismissedAt: customer.reminders.feedback.dismissedAt || stamp,
      };
    }
  } else if (type === 'payment') {
    const snapshotTotal = parseFloat(extra.snapshotTotal || 0) || 0;
    const snoozeDays = parseInt(extra.snoozeDays || 7, 10) || 7;
    customer.reminders.payment = {
      sentAt: action === 'sent' ? stamp : '',
      dismissedAt: action === 'dismissed' ? stamp : '',
      snoozeUntil: addDaysToDate(today(), snoozeDays),
      snapshotTotal,
    };
  } else {
    return null;
  }
  customer.updatedAt = stamp;
  return customer;
}

function clearCustomerReminder(custId, type) {
  const customer = customers.find(c => c.id === custId && isLiveCustomer(c));
  if (!customer) return null;
  customer.reminders = normalizeCustomerReminders(customer.reminders);
  if (type === 'feedback' || type === 'service') {
    customer.reminders[type] = { jobId: '', sentAt: '', dismissedAt: '' };
  } else if (type === 'payment') {
    customer.reminders.payment = { sentAt: '', dismissedAt: '', snoozeUntil: '', snapshotTotal: 0 };
  } else {
    return null;
  }
  customer.updatedAt = nowISO();
  return customer;
}

function customerBalance(custId, options = {}) {
  const net = customerJobsForBalance(custId, options).reduce((sum, job) => sum + jobNetBalance(job), 0);
  const state = resolveBalanceState(net);
  return { net, state, amount: Math.abs(net) };
}

function customerDueAmount(custId, options = {}) {
  const info = customerBalance(custId, options);
  return info.state === 'owe' ? info.amount : 0;
}

function customerAdvanceAmount(custId, options = {}) {
  const info = customerBalance(custId, options);
  return info.state === 'advance' ? info.amount : 0;
}

function jobPaymentEntries(j) {
  if (!j || !isLiveJob(j) || j.status !== 'done') return [];
  const payments = Array.isArray(j.payments) ? j.payments.filter(p => (parseFloat(p.amount || 0) || 0) > 0) : [];
  // Resolved once per job, not twice per payment entry.
  const mechIds = jobMechanicIds(j);
  const mechId = mechIds[0] || '';
  const mechName = mechanicLabel(mechIds);
  if (payments.length) {
    return payments.map(p => ({
      id: p.id || `${j.id}-pay`,
      amount: parseFloat(p.amount || 0) || 0,
      date: ((p.at || '').slice(0, 10)) || (j.doneAt || '').slice(0, 10) || j.date || today(),
      timestamp: p.at || j.doneAt || `${j.date || today()}T${j.time || '00:00'}`,
      method: p.method || j.payMethod || '',
      category: p.source === 'job-create' ? 'Advance' : 'Invoice Payment',
      kind: p.source === 'job-create' ? 'advance' : 'invoice_payment',
      note: p.notes || '',
      source: 'job',
      sourceId: j.id,
      customer: j.cust || '',
      phone: j.phone || '',
      invoiceNo: j.invoiceNo || '',
      mechId,
      mechName,
    }));
  }
  if (jobPaid(j) > 0) {
    return [{
      id: `legacy-pay-${j.id}`,
      amount: jobPaid(j),
      date: (j.doneAt || '').slice(0, 10) || j.date || today(),
      timestamp: j.doneAt || `${j.date || today()}T${j.time || '00:00'}`,
      method: j.payMethod || '',
      category: j.payMethod === 'advance' ? 'Advance' : 'Invoice Payment',
      kind: j.payMethod === 'advance' ? 'advance' : 'invoice_payment',
      note: j.notes || '',
      source: 'job',
      sourceId: j.id,
      customer: j.cust || '',
      phone: j.phone || '',
      invoiceNo: j.invoiceNo || '',
      mechId,
      mechName,
    }];
  }
  return [];
}

// Every payment and income entry ever recorded. Built once per data version
// (any save bumps it; adding or removing records changes the lengths, which
// covers the instant-invoice path that renders before its save runs).
let allRevenueEntriesCache = { key: '', value: [] };

function revenueCacheKey() {
  return [window.__JALASAI_DATA_VERSION || 0, jobs.length, (incomeEntries || []).length].join('|');
}

function allRevenueEntries() {
  const key = revenueCacheKey();
  if (allRevenueEntriesCache.key === key && allRevenueEntriesCache.jobs === jobs && allRevenueEntriesCache.income === incomeEntries) {
    return allRevenueEntriesCache.value;
  }
  const value = buildRevenueEntries(jobs, incomeEntries);
  allRevenueEntriesCache = { key, jobs, income: incomeEntries, value };
  return value;
}

// Revenue for one business date without building the whole history: only
// jobs that can have a payment on that date are expanded. Same entries, same
// order as allRevenueEntries().filter(e => e.date === date).
function revenueEntriesForDate(date = today()) {
  const day = String(date || '');
  const candidates = jobs.filter(j => {
    if (!j || j.status !== 'done') return false;
    const doneDay = String(j.doneAt || '').slice(0, 10);
    // jobPaymentEntries falls back to today() when a job has no dates.
    if (!doneDay && !j.date) return true;
    if (doneDay === day || j.date === day) return true;
    return Array.isArray(j.payments) && j.payments.some(p => String(p?.at || '').slice(0, 10) === day);
  });
  return buildRevenueEntries(candidates, (incomeEntries || []).filter(entry => {
    const entryDay = String(entry?.date || entry?.timestamp || '').slice(0, 10);
    return !entryDay || entryDay === day;
  })).filter(entry => entry.date === day);
}

function buildRevenueEntries(jobList, incomeList) {
  return jobList.flatMap(jobPaymentEntries).concat(
    (incomeList || []).map(entry => {
      const item = normalizeIncomeEntry(entry);
      if (!isLiveIncomeEntry(item)) return null;
      return {
        id: item.id,
        amount: item.amount,
        date: item.date,
        timestamp: item.timestamp,
        method: item.method || '',
        category: item.category,
        kind: item.kind,
        note: item.note,
        source: 'income',
        sourceId: item.id,
        customer: item.customer || '',
        phone: item.phone || '',
        invoiceNo: item.invoiceNo || '',
        mechId: item.mechId || '',
        mechName: item.mechName || '',
      };
    }).filter(Boolean)
  );
}

function actorEmail() {
  return cloudEmail || 'local-device';
}

function adminEmails() {
  return normalizedAdminEmailList(CLOUD_DEFAULTS.adminEmails, syncMeta.adminEmails);
}

function isAdminUser(email = cloudEmail) {
  // Admin access is open to everyone. The Reports page is the only gated
  // area and it is protected by its own password prompt (see
  // ensureReportsAccess in utils.js). Keep the function and its callers so
  // we can re-tighten later by restoring the email-list check below.
  //   const value = String(email || '').trim().toLowerCase();
  //   return !!value && adminEmails().includes(value);
  return true;
}

function ensureCurrentUserIsAdmin() {
  const value = String(cloudEmail || '').trim().toLowerCase();
  if (!value) return false;
  if (!Array.isArray(syncMeta.adminEmails)) syncMeta.adminEmails = [];
  if (!syncMeta.adminEmails.length) {
    syncMeta.adminEmails = [value];
    saveAll({ preserveUpdatedAt: true, domain: 'settings' });
    return true;
  }
  return isAdminUser(value);
}

function logAction(action, entity, entityId, details = {}) {
  auditLog.unshift({
    id: nextId('log'),
    at: nowISO(),
    by: actorEmail(),
    action,
    entity,
    entityId,
    details,
  });
  auditLog = auditLog.slice(0, 1000);
  if (typeof saveAll === 'function') {
    saveAll({ domain: 'audit' });
  }
}

function nextJobId() {
  const id = 'J' + String(jobCtr++).padStart(3, '0') + '-' + deviceShortId();
  localStorage.setItem(SK.jobCtr, jobCtr);
  return id;
}

function nextId(prefix) {
  localIdSeq = (localIdSeq + 1) % 100000;
  return `${prefix}${Date.now()}${String(localIdSeq).padStart(5, '0')}${deviceShortId()}`;
}
