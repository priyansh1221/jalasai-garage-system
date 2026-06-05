// ═══════════════════════════════════════════════════════════════
//  JalaSai Garage — Drive Backup + Weekly Blob Backup
//  Updated: 2026-04-15
//
//  Two jobs run on schedule:
//    1. Daily ~10 PM IST  — backupShadowTablesToDrive()
//       Reads all 14 shadow tables from Supabase and saves a
//       timestamped JSON file to Google Drive. Keeps last 30 days.
//
//    2. Every Sunday 6 PM IST  — writeSundayBlobFromTables()
//       Reads the same shadow tables and writes the reconstructed
//       payload into garage_state (the backup blob). This keeps
//       the blob current as a weekly safety net.
//
//  Setup steps:
//    1. Set Apps Script Properties:
//       SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DRIVE_FOLDER_ID.
//    2. Run setupDailyBackupTrigger()   — one time.
//    3. Run setupSundayBlobTrigger()    — one time.
//    4. Run testBackupNow() to verify Drive access.
//    5. Run testBlobWriteNow() to verify blob write.
// ═══════════════════════════════════════════════════════════════

var BACKUP_CONFIG = {
  SUPABASE_URL:              backupConfigValue_('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: backupConfigValue_('SUPABASE_SERVICE_ROLE_KEY'),
  DRIVE_FOLDER_ID:           backupConfigValue_('DRIVE_FOLDER_ID'),
  PROJECT_NAME:              'JalaSai Garage System',
  STATE_ROW_ID:              'main',
  TIMEZONE:                  'Asia/Kolkata',
  KEEP_DAILY_BACKUPS:        30,
};

function backupConfigValue_(key) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new Error('Missing Apps Script property: ' + key);
  return value;
}

// Shadow tables to read — mirrors SHADOW_PULL_TABLES in sync.js
var SHADOW_TABLES = [
  { key: 'customers',            table: 'garage_customers' },
  { key: 'mechanics',            table: 'garage_mechanics' },
  { key: 'jobs',                 table: 'garage_jobs' },
  { key: 'stock',                table: 'garage_stock_items' },
  { key: 'expenses',             table: 'garage_expenses' },
  { key: 'incomeEntries',        table: 'garage_income_entries' },
  { key: 'partsLog',             table: 'garage_parts_log' },
  { key: 'auditLog',             table: 'garage_audit_log' },
  { key: 'reviewItems',          table: 'garage_review_items' },
  { key: 'importBatches',        table: 'garage_import_batches' },
  { key: 'purchaseEntries',      table: 'garage_purchase_entries' },
  { key: 'stockMovements',       table: 'garage_stock_movements' },
  { key: 'supplierCatalogMap',   table: 'garage_supplier_catalog_map' },
  { key: 'invoiceImportReviews', table: 'garage_invoice_import_reviews' },
];

// ─── Core: read all shadow tables ─────────────────────────────

function readAllShadowTables_() {
  var payload   = {};
  var takenAt   = new Date().toISOString();
  var batchSize = 1000;

  for (var i = 0; i < SHADOW_TABLES.length; i++) {
    var config = SHADOW_TABLES[i];
    var rows   = [];
    var from   = 0;

    while (true) {
      var url = BACKUP_CONFIG.SUPABASE_URL
        + '/rest/v1/' + config.table
        + '?select=record_data'
        + '&deleted_at=is.null'
        + '&order=source_updated_at.desc'
        + '&offset=' + from
        + '&limit='  + batchSize;

      var response = UrlFetchApp.fetch(url, {
        method: 'get',
        muteHttpExceptions: true,
        headers: {
          apikey:        BACKUP_CONFIG.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: 'Bearer ' + BACKUP_CONFIG.SUPABASE_SERVICE_ROLE_KEY,
        },
      });

      var code = response.getResponseCode();
      var text = response.getContentText();
      if (code < 200 || code >= 300) {
        throw new Error('Supabase fetch failed for ' + config.table + ' (' + code + '): ' + text);
      }

      var batch = JSON.parse(text);
      batch.forEach(function(row) {
        if (row.record_data) rows.push(row.record_data);
      });
      if (batch.length < batchSize) break;
      from += batchSize;
    }

    payload[config.key] = rows;
    Logger.log(config.table + ': ' + rows.length + ' rows');
  }

  payload.meta = {
    source:     'supabase.shadow_tables',
    takenAt:    takenAt,
    updatedAt:  takenAt,
    tableCount: SHADOW_TABLES.length,
  };

  return payload;
}

// ─── Job 1: Daily Drive backup (10 PM IST) ────────────────────

function backupShadowTablesToDrive() {
  var payload  = readAllShadowTables_();
  var now      = new Date();
  var stamp    = Utilities.formatDate(now, BACKUP_CONFIG.TIMEZONE, 'yyyy-MM-dd-HHmm');
  var fileName = 'jalasai-backup-' + stamp + '.json';

  var fileContent = JSON.stringify({
    project:       BACKUP_CONFIG.PROJECT_NAME,
    backupTakenAt: now.toISOString(),
    timezone:      BACKUP_CONFIG.TIMEZONE,
    source:        'supabase.shadow_tables',
    tableCount:    SHADOW_TABLES.length,
    state:         payload,
  }, null, 2);

  var folder = getBackupFolder_();
  var file   = folder.createFile(fileName, fileContent, MimeType.PLAIN_TEXT);
  cleanupOldBackups_(folder);

  Logger.log('Drive backup created: ' + file.getName());
  return { ok: true, fileName: file.getName(), fileId: file.getId() };
}

// ─── Job 2: Sunday 6 PM IST — write blob from shadow tables ──

function writeSundayBlobFromTables() {
  var payload = readAllShadowTables_();
  var savedAt = new Date().toISOString();

  var url  = BACKUP_CONFIG.SUPABASE_URL + '/rest/v1/garage_state';
  var body = JSON.stringify({
    id:               BACKUP_CONFIG.STATE_ROW_ID,
    payload:          payload,
    updated_at:       savedAt,
    updated_by_email: 'apps-script-weekly-backup',
  });

  var response = UrlFetchApp.fetch(url, {
    method:             'post',
    muteHttpExceptions: true,
    contentType:        'application/json',
    payload:            body,
    headers: {
      apikey:        BACKUP_CONFIG.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + BACKUP_CONFIG.SUPABASE_SERVICE_ROLE_KEY,
      'Prefer':      'resolution=merge-duplicates,return=minimal',
    },
  });

  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Blob write failed (' + code + '): ' + response.getContentText());
  }

  Logger.log('Sunday blob backup written to garage_state at ' + savedAt);
  return { ok: true, writtenAt: savedAt };
}

// ─── Trigger setup ─────────────────────────────────────────────

function setupDailyBackupTrigger() {
  deleteTriggers_('backupShadowTablesToDrive');
  ScriptApp.newTrigger('backupShadowTablesToDrive')
    .timeBased()
    .everyDays(1)
    .atHour(22)
    .nearMinute(0)
    .inTimezone(BACKUP_CONFIG.TIMEZONE)
    .create();
  Logger.log('Daily Drive backup trigger set: 10 PM ' + BACKUP_CONFIG.TIMEZONE);
}

function setupSundayBlobTrigger() {
  deleteTriggers_('writeSundayBlobFromTables');
  ScriptApp.newTrigger('writeSundayBlobFromTables')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(18)
    .nearMinute(0)
    .inTimezone(BACKUP_CONFIG.TIMEZONE)
    .create();
  Logger.log('Sunday blob backup trigger set: 6 PM ' + BACKUP_CONFIG.TIMEZONE);
}

function deleteTriggers_(handlerName) {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

// ─── Test helpers ──────────────────────────────────────────────

function testBackupNow() {
  return backupShadowTablesToDrive();
}

function testBlobWriteNow() {
  return writeSundayBlobFromTables();
}

function listRecentBackups() {
  var folder = getBackupFolder_();
  var files  = [];
  var it     = folder.getFiles();
  while (it.hasNext()) {
    var file = it.next();
    files.push({
      name:      file.getName(),
      id:        file.getId(),
      createdAt: file.getDateCreated().toISOString(),
    });
  }
  files.sort(function(a, b) {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  Logger.log(JSON.stringify(files.slice(0, 20), null, 2));
  return files.slice(0, 20);
}

// ─── Private helpers ───────────────────────────────────────────

function getBackupFolder_() {
  if (!BACKUP_CONFIG.DRIVE_FOLDER_ID || BACKUP_CONFIG.DRIVE_FOLDER_ID.indexOf('PASTE_') === 0) {
    throw new Error('Set BACKUP_CONFIG.DRIVE_FOLDER_ID first');
  }
  return DriveApp.getFolderById(BACKUP_CONFIG.DRIVE_FOLDER_ID);
}

function cleanupOldBackups_(folder) {
  var keep = parseInt(BACKUP_CONFIG.KEEP_DAILY_BACKUPS, 10) || 0;
  if (keep <= 0) return;
  var files = [];
  var it    = folder.getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort(function(a, b) {
    return b.getDateCreated().getTime() - a.getDateCreated().getTime();
  });
  for (var i = keep; i < files.length; i++) {
    files[i].setTrashed(true);
  }
}
