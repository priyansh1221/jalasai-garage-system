// ═══════════════════════════════════════════════════════
//  Sync engine v2 — outbox + server versions
//  docs/LONG_TERM_DATA_ROADMAP_2026_10.md "Stage 2"
//  Server side: supabase/2026-10-sync-v2-stage2.sql
// ═══════════════════════════════════════════════════════
//
// What this adds on top of js/sync.js:
//   * Change capture: after a save, every business record is fingerprinted
//     and any record that differs from its last fingerprint goes into an
//     outbox kept in IndexedDB. No timestamps are involved, so an edit to an
//     old record can't fall outside an upload window (L7).
//   * The outbox survives restarts. An entry is removed only after the server
//     has confirmed that exact content.
//   * When the server has the Stage 2 SQL, uploads go through
//     jalasai_apply_changes(): the server refuses a change based on an old
//     version (L3), merges field by field (L6) and never looks at device
//     clocks (L4). Downloads let the server copy win, except for records
//     that still have changes waiting here.
//   * Until that SQL is run, uploads use the old table upsert, plus the
//     exact outbox records, so nothing waits for the weekly full mirror.

const SYNC_V2_ENABLED = true;
const SYNC_V2_IDB_NAME = 'jalasai-sync';
const SYNC_V2_KV_STORE = 'kv';
const SYNC_V2_OUTBOX_STORE = 'outbox';
const SYNC_V2_SERVER_CHECK_MS = 6 * 60 * 60 * 1000;
const SYNC_V2_RPC_BATCH = 200;
const SYNC_V2_MAX_ROUNDS = 3;
const SYNC_V2_CAPTURE_CHUNK = 400;
const SYNC_V2_CAPTURE_DELAY_MS = 1200;
const SYNC_V2_META_SAVE_DELAY_MS = 2000;
const SYNC_V2_CONFLICT_BADGE_MS = 7 * 24 * 60 * 60 * 1000;

// `idOf` must give the same id the shadow-row builders in js/sync.js use.
// `cas` tables go through the version check; the others are append-only
// logs (or derived), written with force.
const SYNC_V2_TABLES = Object.freeze({
  customers: { table: 'garage_customers', cas: true, idOf: r => String(r?.id || r?.phone || r?.name || '').trim() },
  mechanics: { table: 'garage_mechanics', cas: true, idOf: r => String(r?.id || r?.phone || r?.name || '').trim() },
  jobs: { table: 'garage_jobs', cas: true, idOf: r => String(r?.id || '').trim() },
  stock: { table: 'garage_stock_items', cas: true, idOf: r => String(r?.id || r?.sku || '').trim() },
  expenses: { table: 'garage_expenses', cas: true, idOf: r => String(r?.id || '').trim() },
  incomeEntries: { table: 'garage_income_entries', cas: true, idOf: r => String(r?.id || '').trim() },
  partsLog: { table: 'garage_parts_log', cas: false, idOf: r => shadowSyntheticId('partlog', r?.date, r?.time, r?.sku, r?.part) },
  auditLog: { table: 'garage_audit_log', cas: false, idOf: r => String(r?.id || shadowSyntheticId('audit', r)).trim() },
  stockMovements: { table: 'garage_stock_movements', cas: false, idOf: r => String(r?.id || shadowSyntheticId('move', normalizeStockMovement(r))).trim() },
});
const SYNC_V2_TABLE_KEYS = Object.freeze(Object.keys(SYNC_V2_TABLES));

const syncV2 = {
  loaded: false,
  loadPromise: null,
  hashes: {},        // tableKey -> Map(id -> fingerprint of the last captured copy)
  versions: {},      // tableKey -> Map(id -> server version last seen)
  outbox: new Map(), // `${tableKey}|${id}` -> entry
  serverReady: null, // null = not checked yet
  serverCheckedAt: 0,
  dirtyKv: new Set(),
  kvTimer: null,
  captureTimer: null,
  capturePromise: null,
  captureAgain: false,
  lastError: '',
};

function syncV2Active() {
  return SYNC_V2_ENABLED && syncV2.loaded;
}

function syncV2ServerMode() {
  return syncV2Active() && syncV2.serverReady === true;
}

function syncV2Key(tableKey, id) {
  return `${tableKey}|${id}`;
}

function syncV2TableArray(tableKey) {
  return typeof DATA_TABLE_ACCESS !== 'undefined' && DATA_TABLE_ACCESS[tableKey]
    ? normaliseArray(DATA_TABLE_ACCESS[tableKey].get())
    : [];
}

function syncV2Fingerprint(record) {
  let text = '';
  try { text = JSON.stringify(record); } catch (_) { text = String(Math.random()); }
  return `${text.length}:${shadowHashString(text)}`;
}

function syncV2IsDeleted(record) {
  return !!String(record?.deletedAt || record?.deleted_at || '').trim();
}

// ─── IndexedDB store (separate database: the data DB stays untouched) ───
let syncV2DbPromise = null;

function openSyncV2Db() {
  if (syncV2DbPromise) return syncV2DbPromise;
  syncV2DbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const timer = setTimeout(() => reject(new Error('Sync store open timed out')), 5000);
    let request;
    try {
      request = indexedDB.open(SYNC_V2_IDB_NAME, 1);
    } catch (err) {
      clearTimeout(timer);
      reject(err);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SYNC_V2_KV_STORE)) db.createObjectStore(SYNC_V2_KV_STORE);
      if (!db.objectStoreNames.contains(SYNC_V2_OUTBOX_STORE)) db.createObjectStore(SYNC_V2_OUTBOX_STORE);
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        syncV2DbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error || new Error('Sync store open failed'));
    };
  });
  syncV2DbPromise.catch(() => { syncV2DbPromise = null; });
  return syncV2DbPromise;
}

function syncV2Tx(storeNames, mode, work) {
  return openSyncV2Db().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    try {
      result = work(tx);
    } catch (err) {
      try { tx.abort(); } catch (_) {}
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('Sync store write failed'));
    tx.onabort = () => reject(tx.error || new Error('Sync store write aborted'));
  }));
}

function syncV2MapToObject(map) {
  const out = {};
  map.forEach((value, key) => { out[key] = value; });
  return out;
}

function syncV2ObjectToMap(obj) {
  const map = new Map();
  if (obj && typeof obj === 'object') Object.keys(obj).forEach(key => map.set(key, obj[key]));
  return map;
}

// Loads hashes, versions and the outbox. Tables without stored hashes are
// fingerprinted as they are now (nothing queued) — except when the old
// engine still had unsynced changes, in which case the records it would have
// uploaded are queued so the switch-over can't drop them.
async function loadSyncV2State() {
  if (!SYNC_V2_ENABLED) return false;
  if (syncV2.loadPromise) return syncV2.loadPromise;
  syncV2.loadPromise = (async () => {
    const kv = {};
    let entries = [];
    try {
      const reqs = await syncV2Tx([SYNC_V2_KV_STORE, SYNC_V2_OUTBOX_STORE], 'readonly', tx => {
        const kvStore = tx.objectStore(SYNC_V2_KV_STORE);
        return {
          keys: kvStore.getAllKeys(),
          values: kvStore.getAll(),
          outbox: tx.objectStore(SYNC_V2_OUTBOX_STORE).getAll(),
        };
      });
      // getAllKeys/getAll on one store return the same order.
      (reqs.keys.result || []).forEach((key, i) => { kv[key] = reqs.values.result[i]; });
      entries = reqs.outbox.result || [];
    } catch (err) {
      console.warn('[sync v2] store unavailable; using the old sync only', err);
      syncV2.lastError = 'Sync store unavailable on this device';
      return false;
    }
    entries.forEach(entry => {
      if (entry && entry.key) syncV2.outbox.set(entry.key, entry);
    });
    const legacyPending = !!syncMeta.pendingSync;
    const legacyCutoff = legacyPending && typeof ioSaverPushCutoffMs === 'function' ? ioSaverPushCutoffMs({}) : 0;
    const bootstrapQueued = [];
    SYNC_V2_TABLE_KEYS.forEach(tableKey => {
      syncV2.versions[tableKey] = syncV2ObjectToMap(kv[`versions:${tableKey}`]);
      if (kv[`hashes:${tableKey}`]) {
        syncV2.hashes[tableKey] = syncV2ObjectToMap(kv[`hashes:${tableKey}`]);
        return;
      }
      const map = new Map();
      const config = SYNC_V2_TABLES[tableKey];
      syncV2TableArray(tableKey).forEach(record => {
        const id = config.idOf(record);
        if (!id) return;
        map.set(id, syncV2Fingerprint(record));
        if (legacyPending && (!legacyCutoff || ioSaverRecordIsRecent(record, legacyCutoff))) {
          bootstrapQueued.push(syncV2NewEntry(tableKey, id, record));
        }
      });
      syncV2.hashes[tableKey] = map;
      syncV2.dirtyKv.add(`hashes:${tableKey}`);
    });
    syncV2.loaded = true;
    if (bootstrapQueued.length) await syncV2PutEntries(bootstrapQueued);
    syncV2ScheduleKvSave(0);
    syncV2RefreshPendingFlag();
    return true;
  })();
  return syncV2.loadPromise;
}

function syncV2ScheduleKvSave(delayMs = SYNC_V2_META_SAVE_DELAY_MS) {
  clearTimeout(syncV2.kvTimer);
  syncV2.kvTimer = setTimeout(syncV2FlushKv, delayMs);
}

function syncV2FlushKv() {
  syncV2.kvTimer = null;
  const keys = [...syncV2.dirtyKv];
  syncV2.dirtyKv.clear();
  if (!keys.length) return Promise.resolve();
  return syncV2Tx([SYNC_V2_KV_STORE], 'readwrite', tx => {
    const store = tx.objectStore(SYNC_V2_KV_STORE);
    keys.forEach(key => {
      const [kind, tableKey] = key.split(':');
      const source = kind === 'hashes' ? syncV2.hashes[tableKey] : syncV2.versions[tableKey];
      if (source) store.put(syncV2MapToObject(source), key);
    });
  }).catch(err => {
    keys.forEach(key => syncV2.dirtyKv.add(key));
    console.warn('[sync v2] could not save sync bookkeeping', err);
  });
}

function syncV2PutEntries(entries) {
  entries.forEach(entry => syncV2.outbox.set(entry.key, entry));
  if (!entries.length) return Promise.resolve();
  return syncV2Tx([SYNC_V2_OUTBOX_STORE], 'readwrite', tx => {
    const store = tx.objectStore(SYNC_V2_OUTBOX_STORE);
    entries.forEach(entry => store.put(entry, entry.key));
  }).catch(err => {
    // The entries stay in memory and the data itself is saved; the next
    // capture writes them again.
    syncV2.lastError = `Could not save the upload queue (${err?.name || err?.message || 'error'})`;
    console.warn('[sync v2] outbox write failed', err);
  });
}

function syncV2DeleteEntries(keys) {
  keys.forEach(key => syncV2.outbox.delete(key));
  if (!keys.length) return Promise.resolve();
  return syncV2Tx([SYNC_V2_OUTBOX_STORE], 'readwrite', tx => {
    const store = tx.objectStore(SYNC_V2_OUTBOX_STORE);
    keys.forEach(key => store.delete(key));
  }).catch(err => console.warn('[sync v2] outbox delete failed', err));
}

function syncV2NewEntry(tableKey, id, record) {
  const key = syncV2Key(tableKey, id);
  const existing = syncV2.outbox.get(key);
  const at = nowISO();
  return {
    key,
    tableKey,
    id,
    // The version this phone's edits are based on: the one it had when the
    // first unsent edit was made. Later edits keep it.
    baseVersion: existing ? existing.baseVersion : (syncV2.versions[tableKey]?.get(id) ?? null),
    deleted: syncV2IsDeleted(record),
    firstAt: existing?.firstAt || at,
    lastAt: at,
    attempts: existing?.attempts || 0,
    lastError: existing?.lastError || '',
  };
}

function syncV2RefreshPendingFlag() {
  if (!syncV2Active()) return;
  if (syncV2.outbox.size && !syncMeta.pendingSync) {
    syncMeta.pendingSync = true;
    syncMeta.pendingSince = syncMeta.pendingSince || nowISO();
    try { localStorage.setItem(SK.syncMeta, JSON.stringify(syncMeta)); } catch (_) {}
  }
}

// Sign-out wipe. The engine stays on with empty bookkeeping, so the next
// sign-in on this phone starts clean.
function clearSyncV2Store() {
  syncV2.outbox.clear();
  syncV2.hashes = {};
  syncV2.versions = {};
  SYNC_V2_TABLE_KEYS.forEach(tableKey => {
    syncV2.hashes[tableKey] = new Map();
    syncV2.versions[tableKey] = new Map();
  });
  syncV2.dirtyKv.clear();
  syncV2.loaded = SYNC_V2_ENABLED && syncV2.loaded;
  syncV2.loadPromise = syncV2.loaded ? Promise.resolve(true) : null;
  syncV2.serverReady = null;
  syncV2.serverCheckedAt = 0;
  clearTimeout(syncV2.kvTimer);
  clearTimeout(syncV2.captureTimer);
  return openSyncV2Db().then(db => new Promise(resolve => {
    const tx = db.transaction([SYNC_V2_KV_STORE, SYNC_V2_OUTBOX_STORE], 'readwrite');
    tx.objectStore(SYNC_V2_KV_STORE).clear();
    tx.objectStore(SYNC_V2_OUTBOX_STORE).clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = tx.onabort = () => resolve(false);
  })).catch(() => false);
}

// ─── Change capture ───────────────────────────────────────

// Compares every record of the given tables with its last fingerprint and
// queues the ones that changed. `sync: true` runs in one go (used right
// before a cloud download is applied, so no edit can slip between the two);
// otherwise it yields to the page every few hundred records.
function captureSyncV2Tables(tableKeys, queued, options = {}) {
  const work = [];
  (tableKeys || SYNC_V2_TABLE_KEYS).forEach(tableKey => {
    const config = SYNC_V2_TABLES[tableKey];
    if (!config) return;
    const hashes = syncV2.hashes[tableKey] || (syncV2.hashes[tableKey] = new Map());
    const list = syncV2TableArray(tableKey);
    work.push({ tableKey, config, hashes, list });
  });
  const step = ({ tableKey, config, hashes, list }, start, end) => {
    let changed = false;
    for (let i = start; i < end; i += 1) {
      const record = list[i];
      if (!record || typeof record !== 'object') continue;
      const id = config.idOf(record);
      if (!id) continue;
      const print = syncV2Fingerprint(record);
      if (hashes.get(id) === print) continue;
      hashes.set(id, print);
      changed = true;
      queued.push(syncV2NewEntry(tableKey, id, record));
    }
    if (changed) syncV2.dirtyKv.add(`hashes:${tableKey}`);
  };
  if (options.sync) {
    work.forEach(item => step(item, 0, item.list.length));
    return null;
  }
  return (async () => {
    for (const item of work) {
      for (let i = 0; i < item.list.length; i += SYNC_V2_CAPTURE_CHUNK) {
        step(item, i, Math.min(item.list.length, i + SYNC_V2_CAPTURE_CHUNK));
        if (i + SYNC_V2_CAPTURE_CHUNK < item.list.length) {
          await yieldRecentRefreshChunk();
          // A cloud download replaced the table while we waited: start this
          // table again on the current records, never compare stale copies.
          const current = syncV2TableArray(item.tableKey);
          if (current !== item.list) {
            item.list = current;
            item.restarts = (item.restarts || 0) + 1;
            // After a few restarts carry on over the new array; the next
            // capture (one runs after every save and before every upload)
            // picks up anything this pass missed.
            if (item.restarts <= 3) i = -SYNC_V2_CAPTURE_CHUNK;
          }
        }
      }
    }
  })();
}

async function captureSyncV2Changes() {
  if (!syncV2Active()) return 0;
  if (syncV2.capturePromise) {
    syncV2.captureAgain = true;
    return syncV2.capturePromise;
  }
  syncV2.capturePromise = (async () => {
    let total = 0;
    do {
      syncV2.captureAgain = false;
      const queued = [];
      await captureSyncV2Tables(null, queued);
      if (queued.length) {
        await syncV2PutEntries(queued);
        total += queued.length;
      }
    } while (syncV2.captureAgain);
    if (total) {
      syncV2ScheduleKvSave();
      syncV2RefreshPendingFlag();
      syncV2MarkStatusPagesStale();
    }
    return total;
  })();
  try {
    return await syncV2.capturePromise;
  } finally {
    syncV2.capturePromise = null;
  }
}

// Called from saveAll(); the capture runs shortly after the burst of saves.
function scheduleSyncV2Capture() {
  if (!SYNC_V2_ENABLED) return;
  clearTimeout(syncV2.captureTimer);
  syncV2.captureTimer = setTimeout(() => {
    syncV2.captureTimer = null;
    if (!syncV2Active()) return;
    captureSyncV2Changes().catch(err => console.warn('[sync v2] capture failed', err));
  }, SYNC_V2_CAPTURE_DELAY_MS);
}

function syncV2RecordIndex(tableKey) {
  const config = SYNC_V2_TABLES[tableKey];
  const index = new Map();
  if (!config) return index;
  syncV2TableArray(tableKey).forEach(record => {
    const id = config.idOf(record);
    if (id) index.set(id, record);
  });
  return index;
}

// Synchronous capture of just the records a cloud download is about to
// touch ({ tableKey: [ids] }). Called in the same task as the apply that
// follows, so an edit made a moment ago is queued (and so kept) instead of
// being replaced by the cloud copy. Cost grows with the download, not with
// the size of the tables.
function captureSyncV2Ids(idsByTable) {
  if (!syncV2Active() || !idsByTable) return;
  const queued = [];
  Object.keys(idsByTable).forEach(tableKey => {
    const config = SYNC_V2_TABLES[tableKey];
    const ids = idsByTable[tableKey];
    if (!config || !ids) return;
    const hashes = syncV2.hashes[tableKey] || (syncV2.hashes[tableKey] = new Map());
    const index = syncV2RecordIndex(tableKey);
    let changed = false;
    ids.forEach(rawId => {
      const id = String(rawId || '');
      const record = id ? index.get(id) : null;
      if (!record) return;
      const print = syncV2Fingerprint(record);
      if (hashes.get(id) === print) return;
      hashes.set(id, print);
      changed = true;
      queued.push(syncV2NewEntry(tableKey, id, record));
    });
    if (changed) syncV2.dirtyKv.add(`hashes:${tableKey}`);
  });
  if (queued.length) {
    syncV2PutEntries(queued);
    syncV2ScheduleKvSave();
    syncV2RefreshPendingFlag();
  }
}

// Ids per table in a pulled payload, keyed the way the outbox keys them.
function syncV2PayloadIds(payload, tableKeys) {
  const out = {};
  (tableKeys || []).forEach(tableKey => {
    const config = SYNC_V2_TABLES[tableKey];
    if (!config) return;
    out[tableKey] = new Set(normaliseArray(payload?.[tableKey]).map(record => config.idOf(record)).filter(Boolean));
  });
  return out;
}

// Synchronous capture of whole tables (null = every table). Only for rare
// moments that must see every edit at once, such as Disconnect.
function captureSyncV2Now(tableKeys) {
  if (!syncV2Active()) return;
  clearTimeout(syncV2.captureTimer);
  const queued = [];
  captureSyncV2Tables(tableKeys, queued, { sync: true });
  if (queued.length) {
    syncV2PutEntries(queued);
    syncV2ScheduleKvSave();
    syncV2RefreshPendingFlag();
  }
}

function syncV2PendingIds(tableKey) {
  const ids = new Set();
  syncV2.outbox.forEach(entry => {
    if (entry.tableKey === tableKey) ids.add(entry.id);
  });
  return ids;
}

// After cloud data was applied: those records now match the cloud, so they
// are not local changes. Records with queued changes are left alone.
function syncV2AdoptRemote(tableKeys, idsByTable = null) {
  if (!syncV2Active()) return;
  (tableKeys || SYNC_V2_TABLE_KEYS).forEach(tableKey => {
    const config = SYNC_V2_TABLES[tableKey];
    if (!config) return;
    const hashes = syncV2.hashes[tableKey] || (syncV2.hashes[tableKey] = new Map());
    const only = idsByTable && idsByTable[tableKey] ? idsByTable[tableKey] : null;
    const pending = syncV2PendingIds(tableKey);
    syncV2TableArray(tableKey).forEach(record => {
      const id = config.idOf(record);
      if (!id || pending.has(id) || (only && !only.has(id))) return;
      hashes.set(id, syncV2Fingerprint(record));
    });
    syncV2.dirtyKv.add(`hashes:${tableKey}`);
  });
  syncV2ScheduleKvSave();
}

function syncV2NoteVersion(tableKey, id, version) {
  const value = parseInt(version, 10);
  if (!tableKey || !id || !Number.isFinite(value) || !syncV2.versions) return;
  const map = syncV2.versions[tableKey] || (syncV2.versions[tableKey] = new Map());
  if (map.get(id) === value) return;
  map.set(id, value);
  syncV2.dirtyKv.add(`versions:${tableKey}`);
}

function syncV2NoteRowVersions(tableKey, rows) {
  if (!syncV2Active()) return;
  (rows || []).forEach(row => {
    if (row && row.id && row.version !== undefined && row.version !== null) syncV2NoteVersion(tableKey, String(row.id), row.version);
  });
  syncV2ScheduleKvSave();
}

// ─── Server capability check ──────────────────────────────

async function checkSyncV2Server(client, options = {}) {
  if (!syncV2Active() || !client) return false;
  if (!options.force && syncV2.serverReady !== null && Date.now() - syncV2.serverCheckedAt < SYNC_V2_SERVER_CHECK_MS) {
    return syncV2.serverReady;
  }
  try {
    const { data, error } = await client.rpc('jalasai_sync_v2_info');
    if (error) throw error;
    syncV2.serverReady = Number(data?.engine) >= 2;
  } catch (err) {
    const raw = String(err?.message || err?.code || err || '');
    // Only "function doesn't exist" means the SQL isn't there. A network
    // error says nothing, so keep the previous answer.
    if (/PGRST202|could not find the function|does not exist|404/i.test(raw) || err?.code === 'PGRST202') {
      syncV2.serverReady = false;
    } else if (syncV2.serverReady === null) {
      return false;
    }
  }
  syncV2.serverCheckedAt = Date.now();
  return syncV2.serverReady;
}

// ─── Upload ───────────────────────────────────────────────

const SYNC_V2_BUILDERS = {
  customers: (refs, records, session) => {
    refs.customers = records;
    return buildCustomerShadowRows(refs, session);
  },
  mechanics: (refs, records, session) => buildMechanicShadowRows({ mechanics: records }, session),
  jobs: (refs, records, session) => buildJobShadowRows({ mechanics: refs.mechanics, jobs: records }, session),
  stock: (refs, records, session) => buildStockItemShadowRows({ stock: records }, session),
  expenses: (refs, records, session) => buildExpenseShadowRows({ expenses: records }, session),
  incomeEntries: (refs, records, session) => buildIncomeEntryShadowRows({ mechanics: refs.mechanics, incomeEntries: records }, session),
  partsLog: (refs, records, session) => buildPartsLogShadowRows({ partsLog: records }, session),
  auditLog: (refs, records, session) => buildAuditLogShadowRows({ auditLog: records }, session),
  stockMovements: (refs, records, session) => buildStockMovementShadowRows({ stockMovements: records }, session),
};

// Builds one shadow row per queued record (none when the record is no longer
// something the cloud stores, e.g. a nameless customer).
function syncV2BuildRows(entries, session) {
  const live = buildSyncPayload();
  // Customer balance columns need every job; the jobs list is normalised
  // once for this object and reused for each customer.
  const refs = { jobs: live.jobs, mechanics: live.mechanics, customers: [] };
  const recordIndex = {};
  const built = [];
  entries.forEach(entry => {
    const config = SYNC_V2_TABLES[entry.tableKey];
    if (!recordIndex[entry.tableKey]) {
      const index = new Map();
      syncV2TableArray(entry.tableKey).forEach(record => {
        const id = config.idOf(record);
        if (id) index.set(id, record);
      });
      recordIndex[entry.tableKey] = index;
    }
    const record = recordIndex[entry.tableKey].get(entry.id);
    if (!record) {
      built.push({ entry, row: null, record: null });
      return;
    }
    let rows = [];
    try {
      rows = SYNC_V2_BUILDERS[entry.tableKey](refs, [record], session) || [];
    } catch (err) {
      console.warn('[sync v2] could not build row', entry.key, err);
    }
    const row = rows.find(item => String(item.id) === entry.id) || (rows.length === 1 ? rows[0] : null);
    built.push({ entry, row, record, print: syncV2Fingerprint(record) });
  });
  return built;
}

function syncV2ChangeId(entry, row) {
  const content = `${row?.source_hash || ''}|${row?.deleted_at ? 'del' : 'live'}`;
  return `${syncMeta.deviceId || 'dev'}:${entry.tableKey}:${entry.id}:${entry.baseVersion ?? 'new'}:${shadowHashString(content)}`;
}

function syncV2DerivedPaymentChanges(jobRecords, session) {
  if (!jobRecords.length) return [];
  const live = buildSyncPayload();
  return buildJobPaymentShadowRows({ mechanics: live.mechanics, jobs: jobRecords }, session).map(row => ({
    change_id: `${syncMeta.deviceId || 'dev'}:jobPayments:${row.id}:${row.source_hash}`,
    table: 'garage_job_payments',
    id: String(row.id),
    op: 'upsert',
    force: true,
    row,
    device_id: syncMeta.deviceId || '',
  }));
}

// Puts the server's merged copy (or its delete) into the local tables.
function syncV2ApplyServerResult(entry, result, changedTables) {
  const access = DATA_TABLE_ACCESS[entry.tableKey];
  const config = SYNC_V2_TABLES[entry.tableKey];
  if (!access || !config) return false;
  const list = normaliseArray(access.get());
  const idx = list.findIndex(item => config.idOf(item) === entry.id);
  if (idx === -1) return false;
  const current = list[idx];
  let next = null;
  if (result.deleted_at && !syncV2IsDeleted(current)) {
    // Deleted on another phone. The delete wins; this phone's edit is kept
    // in garage_sync_conflicts on the server.
    next = { ...current, deletedAt: shadowTimestamp(result.deleted_at) || nowISO() };
  } else if (result.merged && typeof result.merged === 'object') {
    next = { ...result.merged };
    const fields = Array.isArray(result.conflict_fields) ? result.conflict_fields : [];
    if (fields.length) {
      next.syncConflict = { at: nowISO(), fields, device: syncMeta.deviceId || '' };
    }
    if (entry.tableKey === 'jobs' && fields.includes('payment') && Array.isArray(next.payments) && next.payments.length) {
      // Both phones changed the paid total: the payments list was merged item
      // by item, so the total is the sum of that list.
      next.payment = next.payments.reduce((sum, p) => sum + (parseFloat(p?.amount || 0) || 0), 0);
    }
  }
  if (!next) return false;
  const normalized = access.normalize ? access.normalize(next) : next;
  const updated = list.slice();
  updated[idx] = normalized;
  access.set(updated);
  changedTables.add(entry.tableKey);
  // This copy came from the server, so it is not a local edit: fingerprint
  // it now or the next capture would queue it again.
  const hashes = syncV2.hashes[entry.tableKey] || (syncV2.hashes[entry.tableKey] = new Map());
  hashes.set(entry.id, syncV2Fingerprint(normalized));
  syncV2.dirtyKv.add(`hashes:${entry.tableKey}`);
  return true;
}

async function syncV2CallApply(client, changes) {
  const results = [];
  for (let i = 0; i < changes.length; i += SYNC_V2_RPC_BATCH) {
    const batch = changes.slice(i, i + SYNC_V2_RPC_BATCH);
    const { data, error } = await client.rpc('jalasai_apply_changes', { changes: batch });
    if (error) throw error;
    (Array.isArray(data) ? data : []).forEach(item => results.push(item));
  }
  return results;
}

// Uploads the outbox through jalasai_apply_changes(). Returns a summary;
// throws only when the server can't be reached at all.
async function pushSyncV2Outbox(client, session) {
  // Background pass (yields to the page). An edit made during the upload is
  // queued by the capture its save schedules and goes in the next upload.
  await captureSyncV2Changes();
  const summary = { sent: 0, applied: 0, merged: 0, conflicts: 0, errors: 0, dropped: 0, rounds: 0 };
  const changedTables = new Set();
  for (let round = 0; round < SYNC_V2_MAX_ROUNDS && syncV2.outbox.size; round += 1) {
    summary.rounds += 1;
    const entries = [...syncV2.outbox.values()];
    const built = syncV2BuildRows(entries, session);
    const dropKeys = [];
    const changes = [];
    const byChangeId = new Map();
    const jobRecords = [];
    built.forEach(item => {
      if (!item.row) {
        dropKeys.push(item.entry.key);
        return;
      }
      const config = SYNC_V2_TABLES[item.entry.tableKey];
      const isDelete = !!item.row.deleted_at;
      const change = {
        change_id: syncV2ChangeId(item.entry, item.row),
        table: config.table,
        id: String(item.row.id),
        op: isDelete ? 'delete' : 'upsert',
        base_version: config.cas ? item.entry.baseVersion : null,
        force: !config.cas,
        row: item.row,
        device_id: syncMeta.deviceId || '',
      };
      changes.push(change);
      byChangeId.set(change.change_id, item);
      if (item.entry.tableKey === 'jobs' && !isDelete) jobRecords.push(item.record);
    });
    if (dropKeys.length) {
      summary.dropped += dropKeys.length;
      await syncV2DeleteEntries(dropKeys);
    }
    if (!changes.length) break;
    const paymentChanges = syncV2DerivedPaymentChanges(jobRecords, session);
    summary.sent += changes.length;
    const results = await syncV2CallApply(client, [...changes, ...paymentChanges]);

    const doneKeys = [];
    const keepEntries = [];
    let needAnotherRound = false;
    results.forEach(result => {
      const item = byChangeId.get(result?.change_id);
      if (!item) return; // derived payment rows
      const entry = item.entry;
      const status = result.status;
      if (status === 'applied' || status === 'duplicate') {
        summary.applied += 1;
        syncV2NoteVersion(entry.tableKey, entry.id, result.version);
        const current = syncV2TableArray(entry.tableKey).find(r => SYNC_V2_TABLES[entry.tableKey].idOf(r) === entry.id);
        if (current && syncV2Fingerprint(current) === item.print) {
          doneKeys.push(entry.key);
        } else {
          // Edited again while uploading: send the newer copy next time,
          // based on the version just written.
          keepEntries.push({ ...entry, baseVersion: parseInt(result.version, 10) || entry.baseVersion, lastError: '' });
        }
      } else if (status === 'conflict') {
        syncV2NoteVersion(entry.tableKey, entry.id, result.version);
        const serverDeleted = !!result.deleted_at;
        if (serverDeleted && item.row.deleted_at) {
          // Both phones deleted it: nothing left to send.
          summary.applied += 1;
          doneKeys.push(entry.key);
          return;
        }
        if (serverDeleted) {
          syncV2ApplyServerResult(entry, result, changedTables);
          summary.conflicts += 1;
          doneKeys.push(entry.key);
          return;
        }
        if (result.merged) {
          syncV2ApplyServerResult(entry, result, changedTables);
          summary.merged += 1;
          if (Array.isArray(result.conflict_fields) && result.conflict_fields.length) summary.conflicts += 1;
        }
        // Resend (merged copy, or this phone's delete) on top of the
        // version the server has now.
        keepEntries.push({ ...entry, baseVersion: parseInt(result.version, 10) || null, lastError: '' });
        needAnotherRound = true;
      } else {
        summary.errors += 1;
        keepEntries.push({
          ...entry,
          attempts: (entry.attempts || 0) + 1,
          lastError: String(result?.message || 'Upload refused by server').slice(0, 300),
        });
      }
    });
    await syncV2DeleteEntries(doneKeys);
    await syncV2PutEntries(keepEntries);
    if (!needAnotherRound) break;
  }
  if (changedTables.size) {
    saveAll({ preserveUpdatedAt: true, skipSync: true, domains: [...changedTables] });
    if (typeof refreshRealtimePagesBatch === 'function') {
      const pages = [];
      REALTIME_SHADOW_TABLES.forEach(config => { if (changedTables.has(config.key)) pages.push(...(config.pages || [])); });
      refreshRealtimePagesBatch([...changedTables], pages);
    }
  }
  syncV2ScheduleKvSave(0);
  syncV2.lastError = summary.errors ? `${summary.errors} change(s) refused by the server; they stay queued.` : '';
  syncV2MarkStatusPagesStale();
  return summary;
}

// Old-server mode: after the regular table upsert, also send exactly the
// queued records (any age), then clear the ones that went up unchanged.
async function pushSyncV2OutboxLegacy(client, session) {
  await captureSyncV2Changes();
  if (!syncV2.outbox.size) return { sent: 0 };
  const built = syncV2BuildRows([...syncV2.outbox.values()], session);
  const byTable = new Map();
  const jobRecords = [];
  const dropKeys = [];
  built.forEach(item => {
    if (!item.row) {
      dropKeys.push(item.entry.key);
      return;
    }
    const table = SYNC_V2_TABLES[item.entry.tableKey].table;
    if (!byTable.has(table)) byTable.set(table, []);
    byTable.get(table).push(item.row);
    if (item.entry.tableKey === 'jobs' && !item.row.deleted_at) jobRecords.push(item.record);
  });
  for (const [table, rows] of byTable.entries()) {
    await upsertShadowRows(client, table, dedupeShadowRows(rows).rows);
  }
  const paymentRows = syncV2DerivedPaymentChanges(jobRecords, session).map(change => change.row);
  if (paymentRows.length) await upsertShadowRows(client, 'garage_job_payments', dedupeShadowRows(paymentRows).rows);
  const doneKeys = [...dropKeys];
  built.forEach(item => {
    if (!item.row) return;
    const current = syncV2TableArray(item.entry.tableKey).find(r => SYNC_V2_TABLES[item.entry.tableKey].idOf(r) === item.entry.id);
    if (current && syncV2Fingerprint(current) === item.print) doneKeys.push(item.entry.key);
  });
  await syncV2DeleteEntries(doneKeys);
  syncV2MarkStatusPagesStale();
  return { sent: built.length - dropKeys.length };
}

// ─── Status for the UI ────────────────────────────────────

function syncV2RecordStatus(tableKey, record) {
  // A phone that never syncs has nothing to wait for.
  if (!syncV2Active() || !record || typeof canUseCloudConfig !== 'function' || !canUseCloudConfig()) return '';
  const config = SYNC_V2_TABLES[tableKey];
  if (!config) return '';
  const conflictAt = Date.parse(record.syncConflict?.at || 0) || 0;
  if (conflictAt && Date.now() - conflictAt < SYNC_V2_CONFLICT_BADGE_MS) return 'conflict';
  const entry = syncV2.outbox.get(syncV2Key(tableKey, config.idOf(record)));
  if (!entry) return '';
  return entry.lastError ? 'error' : 'pending';
}

// Small badge for cards and invoice rows. Nothing is shown once a record is
// safely in the cloud, so screens stay calm.
function syncStatusBadgeHtml(tableKey, record) {
  const status = syncV2RecordStatus(tableKey, record);
  if (!status) return '';
  if (status === 'conflict') {
    const fields = (record.syncConflict?.fields || []).join(', ');
    return `<span class="sync-rec-badge sync-rec-conflict" title="Changed on two phones${fields ? ` (${escapeSyncBadgeText(fields)})` : ''}. The newest change was kept; the other is saved in cloud history.">⚠ Changed on 2 phones</span>`;
  }
  if (status === 'error') {
    return '<span class="sync-rec-badge sync-rec-error" title="The cloud refused this change. It is still saved on this phone and will be retried.">⚠ Not uploaded</span>';
  }
  return '<span class="sync-rec-badge sync-rec-pending" title="Saved on this phone, waiting to upload to the cloud.">⏳ Waiting</span>';
}

function escapeSyncBadgeText(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

let syncV2StatusStaleQueued = false;
function syncV2MarkStatusPagesStale() {
  if (syncV2StatusStaleQueued) return;
  syncV2StatusStaleQueued = true;
  setTimeout(() => {
    syncV2StatusStaleQueued = false;
    if (typeof markAppTabsStale === 'function') markAppTabsStale(['jobs', 'invoices']);
    const page = typeof currentPage !== 'undefined' ? currentPage : '';
    if ((page === 'jobs' || page === 'invoices' || page === 'home') && typeof renderCurrentPage === 'function') {
      try { renderCurrentPage({ forceRender: true }); } catch (err) { console.warn('[sync v2] status render failed', err); }
    }
  }, 300);
}

function syncV2DiagnosticsRows() {
  if (!SYNC_V2_ENABLED) return [];
  if (!syncV2.loaded) return [['Sync Engine', syncV2.lastError || 'Starting…']];
  const waiting = syncV2.outbox.size;
  const refused = [...syncV2.outbox.values()].filter(entry => entry.lastError).length;
  const mode = syncV2.serverReady === true
    ? 'v2 (server checks versions)'
    : syncV2.serverReady === false
      ? 'v2 queue · server SQL not installed yet (uploads use the old table sync)'
      : 'v2 queue · server not checked yet';
  const rows = [
    ['Sync Engine', mode],
    ['Waiting To Upload', waiting ? syncCountLabel(waiting, 'record') : 'None'],
  ];
  if (refused) rows.push(['Refused By Cloud', `<span style="color:#e5484d;font-weight:600;">${syncCountLabel(refused, 'record')} · ${escapeSyncBadgeText([...syncV2.outbox.values()].find(e => e.lastError)?.lastError || '')}</span>`]);
  if (syncV2.lastError && !refused) rows.push(['Upload Queue', escapeSyncBadgeText(syncV2.lastError)]);
  return rows;
}
