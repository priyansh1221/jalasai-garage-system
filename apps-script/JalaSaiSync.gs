var SPREADSHEET_ID = '17xK63TlX7SNOa0HFUdAhoJTTYnloOujWX6WHpmMO7NA';

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'pull';
  if (action !== 'pull') return jsonOut_({ ok: false, error: 'Unsupported GET action' });
  return jsonOut_({ ok: true, data: readSnapshot_(), updatedAt: new Date().toISOString() });
}

function doPost(e) {
  var action = (e && e.parameter && e.parameter.action) || 'push';
  if (action !== 'push') return jsonOut_({ ok: false, error: 'Unsupported POST action' });
  var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  writeSnapshot_(body && body.data ? body.data : body);
  return jsonOut_({ ok: true, updatedAt: new Date().toISOString() });
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function readSnapshot_() {
  var ss = getSS_();
  return {
    stock: readSheet_(ss, 'Stock', ['id','sku','name','bike','cat','qty','min','cost','sellPrice','sup','location'], function(r) {
      return { id:r[0]||'', sku:r[1]||'', name:r[2]||'', bike:r[3]||'', cat:r[4]||'', qty:num_(r[5]), min:num_(r[6]), cost:num_(r[7]), sellPrice:num_(r[8]), sup:r[9]||'', location:r[10]||'' };
    }),
    jobs: readSheet_(ss, 'Jobs', ['id','date','time','custId','cust','phone','veh','vno','odo','prob','mechId','mech','pri','status','lab','prt','payment','payMethod','partsUsed','notes','delivery','photo','collectedBy','invoiceNo'], function(r) {
      return { id:r[0]||'', date:r[1]||'', time:r[2]||'', custId:r[3]||'', cust:r[4]||'', phone:r[5]||'', veh:r[6]||'', vno:r[7]||'', odo:r[8]||'', prob:r[9]||'', mechId:r[10]||'', mech:r[11]||'', pri:r[12]||'normal', status:r[13]||'waiting', lab:num_(r[14]), prt:num_(r[15]), payment:num_(r[16]), payMethod:r[17]||'', partsUsed:json_(r[18], []), notes:r[19]||'', delivery:r[20]||'', photo:r[21]||'', collectedBy:r[22]||'', invoiceNo:r[23]||'' };
    }),
    customers: readSheet_(ss, 'Customers', ['id','name','phone','email','address','vehicles','notes','createdAt'], function(r) {
      return { id:r[0]||'', name:r[1]||'', phone:r[2]||'', email:r[3]||'', address:r[4]||'', vehicles:json_(r[5], []), notes:r[6]||'', createdAt:r[7]||'' };
    }),
    mechanics: readSheet_(ss, 'Mechanics', ['id','name','phone','specialty','color','active'], function(r) {
      return { id:r[0]||'', name:r[1]||'', phone:r[2]||'', specialty:r[3]||'', color:r[4]||'#00c896', active:bool_(r[5]) };
    }),
    expenses: readSheet_(ss, 'Expenses', ['id','date','cat','desc','amount','paidTo','receipt'], function(r) {
      return { id:r[0]||'', date:r[1]||'', cat:r[2]||'', desc:r[3]||'', amount:num_(r[4]), paidTo:r[5]||'', receipt:r[6]||'' };
    }),
    partsLog: readSheet_(ss, 'PartsLog', ['part','sku','time','date'], function(r) {
      return { part:r[0]||'', sku:r[1]||'', time:r[2]||'', date:r[3]||'' };
    }),
    meta: readMeta_(ss)
  };
}

function writeSnapshot_(data) {
  data = data || {};
  var ss = getSS_();
  writeSheet_(ss, 'Stock', ['id','sku','name','bike','cat','qty','min','cost','sellPrice','sup','location'], (data.stock || []).map(function(x) {
    return [x.id||'', x.sku||'', x.name||'', x.bike||'', x.cat||'', num_(x.qty), num_(x.min), num_(x.cost), num_(x.sellPrice), x.sup||'', x.location||''];
  }));
  writeSheet_(ss, 'Jobs', ['id','date','time','custId','cust','phone','veh','vno','odo','prob','mechId','mech','pri','status','lab','prt','payment','payMethod','partsUsed','notes','delivery','photo','collectedBy','invoiceNo'], (data.jobs || []).map(function(x) {
    return [x.id||'', x.date||'', x.time||'', x.custId||'', x.cust||'', x.phone||'', x.veh||'', x.vno||'', x.odo||'', x.prob||'', x.mechId||'', x.mech||'', x.pri||'', x.status||'', num_(x.lab), num_(x.prt), num_(x.payment), x.payMethod||'', JSON.stringify(x.partsUsed || []), x.notes||'', x.delivery||'', x.photo||'', x.collectedBy||'', x.invoiceNo||''];
  }));
  writeSheet_(ss, 'Customers', ['id','name','phone','email','address','vehicles','notes','createdAt'], (data.customers || []).map(function(x) {
    return [x.id||'', x.name||'', x.phone||'', x.email||'', x.address||'', JSON.stringify(x.vehicles || []), x.notes||'', x.createdAt||''];
  }));
  writeSheet_(ss, 'Mechanics', ['id','name','phone','specialty','color','active'], (data.mechanics || []).map(function(x) {
    return [x.id||'', x.name||'', x.phone||'', x.specialty||'', x.color||'#00c896', x.active === false ? 'FALSE' : 'TRUE'];
  }));
  writeSheet_(ss, 'Expenses', ['id','date','cat','desc','amount','paidTo','receipt'], (data.expenses || []).map(function(x) {
    return [x.id||'', x.date||'', x.cat||'', x.desc||'', num_(x.amount), x.paidTo||'', x.receipt||''];
  }));
  writeSheet_(ss, 'PartsLog', ['part','sku','time','date'], (data.partsLog || []).map(function(x) {
    return [x.part||'', x.sku||'', x.time||'', x.date||''];
  }));
  writeMeta_(ss, data.meta || {});
}

function readSheet_(ss, name, headers, mapFn) {
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var lastRow = sh.getLastRow();
  var lastCol = headers.length;
  if (lastRow < 2) return [];
  var rows = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  return rows.filter(function(r) { return r.join('') !== ''; }).map(mapFn);
}

function writeSheet_(ss, name, headers, rows) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sh.setFrozenRows(1);
}

function readMeta_(ss) {
  var sh = ss.getSheetByName('Meta');
  var meta = {};
  if (!sh || sh.getLastRow() < 2) return meta;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function(row) { meta[row[0]] = row[1]; });
  meta.jobCtr = num_(meta.jobCtr);
  meta.invoiceCtr = num_(meta.invoiceCtr);
  return meta;
}

function writeMeta_(ss, meta) {
  var sh = ss.getSheetByName('Meta') || ss.insertSheet('Meta');
  var rows = [
    ['jobCtr', num_(meta.jobCtr)],
    ['invoiceCtr', num_(meta.invoiceCtr)],
    ['updatedAt', meta.updatedAt || new Date().toISOString()],
    ['deviceId', meta.deviceId || ''],
    ['exportedAt', meta.exportedAt || new Date().toISOString()]
  ];
  sh.clearContents();
  sh.getRange(1, 1, 1, 2).setValues([['key', 'value']]);
  sh.getRange(2, 1, rows.length, 2).setValues(rows);
  sh.setFrozenRows(1);
}

function json_(value, fallback) {
  if (value === '' || value == null) return fallback;
  try { return JSON.parse(value); } catch (err) { return fallback; }
}

function num_(value) {
  var n = Number(value);
  return isNaN(n) ? 0 : n;
}

function bool_(value) {
  return String(value).toLowerCase() !== 'false';
}

function getSS_() {
  if (SPREADSHEET_ID && SPREADSHEET_ID !== 'PASTE_YOUR_SHEET_ID_HERE') {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Spreadsheet not found. Set SPREADSHEET_ID in the script.');
  return ss;
}
