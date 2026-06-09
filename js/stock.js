// ═══════════════════════════════════════════════════════
//  Stock module
// ═══════════════════════════════════════════════════════

let stF = { q: '', cat: '', st: '', bike: '', sort: 'name' };
let catalogImportSession = null;
const CATALOG_IMPORT_SESSION_KEY = 'js_catalog_import_session';
const stockRowCache = new Map();
let stockRowOrderKey = '';
const STOCK_VIRTUAL_ROW_HEIGHT = 74;
const STOCK_VIRTUAL_ROW_COUNT = 25;
let stockVirtualState = { start: -1, total: 0, version: '', raf: 0 };
let stockListCache = { version: '', live: [], sorted: [], bikes: [], totalValue: 0 };

function resetStockVirtualRows() {
  if (stockVirtualState.raf) {
    const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
    cancel(stockVirtualState.raf);
    stockVirtualState.raf = 0;
  }
  stockVirtualState.start = -1;
  stockVirtualState.version = '';
  const scroller = document.querySelector('#page-stock .stbl');
  if (scroller) scroller.scrollTop = 0;
}

function scheduleStockVirtualRows() {
  if (stockVirtualState.raf) return;
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb) => setTimeout(cb, 16);
  stockVirtualState.raf = raf(() => {
    stockVirtualState.raf = 0;
    renderVirtualStockRows(stockVirtualState.items || []);
  });
}

function normalizeStockSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stockSearchTokens(value) {
  return normalizeStockSearchText(value).split(/\s+/).filter(Boolean);
}

function stockFitmentText(item) {
  return uniqStrings([...(item.fitmentModels || []), ...(item.fits || [])]).join(' ');
}

function levenshteinDistance(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a) return b.length;
  if (!b) return a.length;
  const prev = Array(b.length + 1).fill(0);
  const curr = Array(b.length + 1).fill(0);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

function bestStockTokenScore(queryToken, candidateTokens) {
  let best = 0;
  candidateTokens.forEach(token => {
    if (!token) return;
    if (token === queryToken) {
      best = Math.max(best, 1);
      return;
    }
    if (token.includes(queryToken) || queryToken.includes(token)) {
      best = Math.max(best, 0.92);
      return;
    }
    const maxLen = Math.max(token.length, queryToken.length);
    if (!maxLen) return;
    const distance = levenshteinDistance(queryToken, token);
    const ratio = distance / maxLen;
    if (ratio <= 0.2) best = Math.max(best, 0.84);
    else if (ratio <= 0.34) best = Math.max(best, 0.72);
  });
  return best;
}

function scoreStockSearch(item, query) {
  if (!query) return 1;
  const queryText = normalizeStockSearchText(query);
  if (!queryText) return 1;
  const indexedText = item?._searchText || [
    item?.name,
    item?.sku,
    item?.supplierPartNo,
    stockFitmentText(item || {}),
    item?.bike,
  ].join(' ').toLowerCase();
  return indexedText.includes(queryText) ? 1 : 0;
}

function renderStock() {
  renderStockAlerts();
  renderStockTable();
  updateCatalogReviewResumeButton();
}

function renderStockAlerts() {
  const stateStock = window.appState?.stock || stock;
  const crit = stateStock.filter(s => isLiveStockItem(s) && stSt(s) !== 'ok');
  const alertBox = document.getElementById('st-alerts');
  const countBox = document.getElementById('st-alert-count');
  const orderBtn = document.getElementById('st-order-btn');
  if (countBox) countBox.textContent = crit.length ? `${crit.length} part${crit.length > 1 ? 's' : ''} need order` : 'All parts look okay';
  if (orderBtn) orderBtn.textContent = crit.length ? `Order Stock (${crit.length})` : 'Order Stock';
  if (!alertBox) return;
  alertBox.innerHTML = crit.map(s => `
    <div class="alert ${stSt(s) === 'low' ? 'warn' : ''}">
      <div>
        <div style="font-weight:500;font-size:13px;">${s.name}</div>
        <div style="font-size:11px;color:var(--mut);">SKU: ${s.sku} | Qty: ${s.qty} | Min: ${s.min} | ${s.sup}</div>
      </div>
      <button class="btn btn-g btn-sm" onclick="orderPart('${s.id}')">Order</button>
    </div>`).join('') || '<div style="font-size:12px;color:var(--mut);padding:8px 0;">No low-stock or out-of-stock parts right now.</div>';
}

function openOrderStockModal() {
  renderStockAlerts();
  openM('m-order-stock');
}

function stockRowSignature(s) {
  return JSON.stringify({
    id: s.id,
    sku: s.sku,
    photos: normalizePhotoArray(s.photos || s.photo || ''),
    name: s.name,
    bike: s.bike,
    fitmentModels: s.fitmentModels || [],
    fits: s.fits || [],
    cat: s.cat,
    qty: s.qty,
    min: s.min,
    cost: s.cost,
    sellPrice: s.sellPrice || 0,
    location: s.location || '',
    status: stSt(s),
    deletedAt: s.deletedAt || '',
  });
}

function stockRowHtml(s) {
  const st = stSt(s);
  const fitments = uniqStrings([...(s.fitmentModels || []), ...(s.fits || [])]);
  const fitmentText = fitments.length
    ? `<div style="font-size:12px;color:var(--mut);line-height:1.4;">${fitments.join(', ')}</div>`
    : '<span style="color:var(--mut);font-size:12px;">—</span>';
  const photoCell = normalizePhotoArray(s.photos || s.photo || '').length
    ? photoThumbWithCount(s.photos || s.photo || '', 'Stock Photo Reference')
    : '<span style="color:var(--mut);font-size:12px;">—</span>';
  return `
    <td><span class="sku-tag">${s.sku}</span></td>
    <td>${photoCell}</td>
    <td style="font-weight:500">${s.name}</td>
    <td style="color:var(--mut);font-size:12px">${s.bike}</td>
    <td>${fitmentText}</td>
    <td style="color:var(--mut);font-size:12px">${s.cat}</td>
    <td><div class="qctrl">
      <button class="qbtn" onclick="adj('${s.id}',-1)">−</button>
      <span class="qtyc ${st}">${s.qty}</span>
      <button class="qbtn" onclick="adj('${s.id}',1)">+</button>
    </div></td>
    <td style="color:var(--mut)">${s.min}</td>
    <td style="color:var(--mut);font-size:12px">${fmtMoney(s.cost)} / ${fmtMoney(s.sellPrice||0)}</td>
    <td>${s.location||'—'}</td>
    <td><span class="sst ${st}">${stLbl(st)}</span></td>
    <td>
      <div style="display:flex;gap:4px;">
        <button class="btn btn-g btn-sm" onclick="editPart('${s.id}')">Edit</button>
        <button class="btn btn-r btn-sm" onclick="delPart('${s.id}')">Del</button>
        <button class="btn btn-g btn-sm" onclick="orderPart('${s.id}')">Order</button>
      </div>
    </td>`;
}

function stockCachedRow(s) {
  const signature = stockRowSignature(s);
  let row = stockRowCache.get(s.id);
  if (!row) {
    row = document.createElement('tr');
    row.dataset.stockId = s.id;
    stockRowCache.set(s.id, row);
  }
  if (row.dataset.stockSignature !== signature) {
    row.innerHTML = stockRowHtml(s);
    row.dataset.stockSignature = signature;
  }
  return row;
}

function syncStockRows(tbody, liveStock) {
  const liveIds = new Set(liveStock.map(s => s.id));
  stockRowCache.forEach((row, id) => {
    if (!liveIds.has(id)) {
      row.remove();
      stockRowCache.delete(id);
    }
  });

  const orderKey = liveStock.map(s => s.id).join('|');
  const orderChanged = orderKey !== stockRowOrderKey || tbody.children.length !== liveStock.length;
  const fragment = orderChanged ? document.createDocumentFragment() : null;
  liveStock.forEach(s => {
    const row = stockCachedRow(s);
    if (fragment) fragment.appendChild(row);
  });
  if (fragment) {
    tbody.appendChild(fragment);
    stockRowOrderKey = orderKey;
  }
}

function stockListData(stateStock) {
  const version = [
    window.__JALASAI_DATA_VERSION || 0,
    Array.isArray(stateStock) ? stateStock.length : 0,
  ].join('|');
  if (stockListCache.version === version) return stockListCache;
  const live = (Array.isArray(stateStock) ? stateStock : []).filter(isLiveStockItem);
  stockListCache = {
    version,
    live,
    sorted: live.slice().sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''))),
    bikes: [...new Set(live.map(s => s.bike).filter(Boolean))].sort(),
    totalValue: live.reduce((a, s) => a + s.qty * (s.cost || 0), 0),
  };
  return stockListCache;
}

function stockSortTime(item) {
  return Date.parse(item?.updatedAt || item?.createdAt || 0) || 0;
}

function sortFilteredStockRows(rows) {
  const sortMode = stF.sort || 'name';
  return rows.slice().sort((left, right) => {
    if (sortMode === 'latest' || sortMode === 'oldest') {
      const diff = stockSortTime(left) - stockSortTime(right);
      if (diff) return sortMode === 'latest' ? -diff : diff;
    }
    const nameDiff = String(left.name || '').localeCompare(String(right.name || ''));
    if (nameDiff) return nameDiff;
    return String(left.sku || '').localeCompare(String(right.sku || ''));
  });
}

function filteredStockRows(stockData, indexedQuery) {
  return sortFilteredStockRows(stockData.live
    .filter(item =>
      (!indexedQuery || String(item._searchText || '').includes(indexedQuery))
      && (!stF.cat  || item.cat  === stF.cat)
      && (!stF.st   || stSt(item) === stF.st)
      && (!stF.bike || item.bike === stF.bike)));
}

function renderStockTable() {
  const q = String(stF.q || '').trim();
  const indexedQuery = normalizeStockSearchText(q);
  const stateStock = window.appState?.stock || stock;
  const stockData = stockListData(stateStock);
  const fil = filteredStockRows(stockData, indexedQuery);

  // Update bike filter options
  const bikeSel = document.getElementById('st-bike');
  if (bikeSel) {
    const cur = bikeSel.value;
    bikeSel.innerHTML = '<option value="">All bikes</option>' + stockData.bikes.map(b => `<option value="${b}"${b===cur?' selected':''}>${b}</option>`).join('');
    bikeSel.value = cur;
  }

  const tbody = document.getElementById('st-tbody');
  if (!tbody) return;
  renderVirtualStockRows(fil);

  // Stock value summary
  const el = document.getElementById('stock-value');
  if (el) el.textContent = 'Stock Value: ' + fmtMoney(stockData.totalValue);
  const pagerEl = document.getElementById('stock-pager');
  if (pagerEl) pagerEl.textContent = fil.length ? `1-${Math.min(STOCK_VIRTUAL_ROW_COUNT, fil.length)} of ${fil.length} parts` : '0 parts';
}

function renderVirtualStockRows(items = []) {
  const tbody = document.getElementById('st-tbody');
  const scroller = document.querySelector('#page-stock .stbl');
  if (!tbody || !scroller) return;
  scroller.classList.add('virtual-table-wrap');
  if (!scroller.dataset.stockVirtualBound) {
    scroller.dataset.stockVirtualBound = 'true';
    scroller.addEventListener('scroll', scheduleStockVirtualRows, { passive: true });
  }
  stockVirtualState.items = items;
  stockVirtualState.total = items.length;
  const version = [
    items.length,
    window.__JALASAI_DATA_VERSION || 0,
    items[0]?.id || '',
    items[items.length - 1]?.id || '',
    stF.q || '',
    stF.cat || '',
    stF.st || '',
    stF.bike || '',
    stF.sort || '',
  ].join('|');
  const visibleCount = Math.min(STOCK_VIRTUAL_ROW_COUNT, items.length);
  const maxStart = Math.max(0, items.length - visibleCount);
  const start = Math.min(maxStart, Math.max(0, Math.floor((scroller.scrollTop || 0) / STOCK_VIRTUAL_ROW_HEIGHT)));
  if (start === stockVirtualState.start && version === stockVirtualState.version) return;
  stockVirtualState.start = start;
  stockVirtualState.version = version;
  const end = Math.min(items.length, start + visibleCount);
  const topHeight = start * STOCK_VIRTUAL_ROW_HEIGHT;
  const bottomHeight = Math.max(0, (items.length - end) * STOCK_VIRTUAL_ROW_HEIGHT);
  tbody.innerHTML = `
    ${topHeight ? `<tr class="virtual-spacer"><td colspan="12" style="height:${topHeight}px;padding:0;border:0;"></td></tr>` : ''}
    ${items.slice(start, end).map(s => `<tr data-stock-id="${escapeAttr(s.id)}">${stockRowHtml(s)}</tr>`).join('')}
    ${bottomHeight ? `<tr class="virtual-spacer"><td colspan="12" style="height:${bottomHeight}px;padding:0;border:0;"></td></tr>` : ''}`;
  const pagerEl = document.getElementById('stock-pager');
  if (pagerEl) pagerEl.textContent = items.length ? `${start + 1}-${end} of ${items.length} parts` : '0 parts';
}

// Debounce the table re-render while keeping filter state
// synchronous for programmatic consumers.
function filterStock(v) {
  stF.q = v;
  if (typeof resetLongListPage === 'function') resetLongListPage('stock');
  resetStockVirtualRows();
  if (typeof debouncePerf === 'function') {
    debouncePerf('stock-search', renderStockTable, 150);
  } else {
    renderStockTable();
  }
}
// Category / status / bike come from <select>s — one
// change per click, no need to debounce.
function filterStockCat(v) { stF.cat = v; if (typeof resetLongListPage === 'function') resetLongListPage('stock'); resetStockVirtualRows(); renderStockTable(); }
function filterStockSt(v)  { stF.st  = v; if (typeof resetLongListPage === 'function') resetLongListPage('stock'); resetStockVirtualRows(); renderStockTable(); }
function filterStockBike(v){ stF.bike = v; if (typeof resetLongListPage === 'function') resetLongListPage('stock'); resetStockVirtualRows(); renderStockTable(); }
function sortStockBy(v) { stF.sort = v || 'name'; if (typeof resetLongListPage === 'function') resetLongListPage('stock'); resetStockVirtualRows(); renderStockTable(); }

function adj(id, d) {
  if (!requireCloudWriteAccess('update stock')) return;
  const s = stock.find(x => x.id === id && isLiveStockItem(x));
  if (!s) return;
  const stamp = nowISO();
  s.qty = Math.max(0, s.qty + d);
  s.updatedAt = stamp;
  logAction('update', 'stock', id, { qty: s.qty, delta: d });
  if (d < 0) {
    partsLog.push({ part: s.name, sku: s.sku, time: new Date().toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'}), date: today() });
    toast(s.name + ' used — qty: ' + s.qty);
    if (s.qty <= s.min) setTimeout(() => toast('⚠ LOW: ' + s.name + ' only ' + s.qty + ' left!'), 1000);
  } else {
    toast(s.name + ' restocked → ' + s.qty);
  }
  saveAll({ domain: 'stock' }); renderStockTable();
}

function orderPart(id) {
  const s = stock.find(x => x.id === id && isLiveStockItem(x));
  if (!s) return;
  const msg = `Namaskar,\n\nMujhe yeh part chahiye:\nSKU: ${s.sku}\nName: ${s.name}\nQty: ${s.min * 2} pcs\n\nJalasai Autoparts, Surat\nPlease confirm availability & price.`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg));
}

function delPart(id) {
  if (!requireCloudWriteAccess('delete stock items')) return;
  if (!confirm('Delete this part from stock?')) return;
  const item = stock.find(x => x.id === id && isLiveStockItem(x));
  if (!item) return;
  item.deletedAt = nowISO();
  item.updatedAt = item.deletedAt;
  logAction('delete', 'stock', id);
  saveAll({ domain: 'stock' }); renderStock(); toast('Part removed');
}

// ─── Add / Edit Part Modal ────────────────────────────────
let editPartId = null;

function openAddPart() {
  editPartId = null;
  document.getElementById('part-modal-title').textContent = 'Add New Part';
  ['p-name','p-maker','p-supplier-part','p-fit','p-sku','p-sub','p-qty','p-min','p-cost','p-sell','p-prev-buy','p-prev-sell','p-sup','p-loc','p-notes'].forEach(i => {
    const el = document.getElementById(i);
    if (el) el.value = '';
  });
  document.getElementById('p-bike').value = 'OLA';
  document.getElementById('p-cat').value  = 'ELE';
  setPhotoPreviewList?.('p-photo-preview', [], 'Stock Photo Reference');
  const photoInput = document.getElementById('p-photo');
  if (photoInput) photoInput.value = '';
  const more = document.getElementById('p-more-details');
  if (more) more.open = false;
  autoSKU();
  openM('m-part');
}

function prefillPartFromScannedSku(sku = '') {
  if (sku) {
    document.getElementById('p-sku').value = String(sku || '').trim().toUpperCase();
    document.getElementById('p-sub').value = '';
  }
  const foundBox = document.getElementById('stock-scan-found');
  if (foundBox) foundBox.innerHTML = '';
}

function editPart(id) {
  const s = stock.find(x => x.id === id);
  if (!s) return;
  editPartId = id;
  document.getElementById('part-modal-title').textContent = 'Edit Part';
  document.getElementById('p-name').value = s.name;
  document.getElementById('p-sku').value  = s.sku;
  document.getElementById('p-qty').value  = s.qty;
  document.getElementById('p-min').value  = s.min;
  document.getElementById('p-cost').value = s.cost;
  document.getElementById('p-sell').value = s.sellPrice || 0;
  document.getElementById('p-maker').value = s.manufacturer || s.companyBrand || '';
  document.getElementById('p-supplier-part').value = s.supplierPartNo || '';
  document.getElementById('p-fit').value = (s.fitmentModels || s.fits || []).join(', ');
  document.getElementById('p-prev-buy').value = s.previousBuyPrice || 0;
  document.getElementById('p-prev-sell').value = s.previousSellPrice || 0;
  document.getElementById('p-sup').value  = s.sup || '';
  document.getElementById('p-loc').value  = s.location || '';
  document.getElementById('p-notes').value = s.notes || '';
  setPhotoPreviewList?.('p-photo-preview', s.photos || s.photo || [], 'Stock Photo Reference');
  const photoInput = document.getElementById('p-photo');
  if (photoInput) photoInput.value = '';
  const more = document.getElementById('p-more-details');
  if (more) {
    more.open = !!(
      (s.manufacturer || s.companyBrand || '').trim()
      || (s.supplierPartNo || '').trim()
      || (s.notes || '').trim()
      || s.previousBuyPrice
      || s.previousSellPrice
    );
  }
  openM('m-part');
}

function autoSKU() {
  const bike = document.getElementById('p-bike').value;
  const cat  = document.getElementById('p-cat').value;
  const sub  = (document.getElementById('p-sub').value || '').trim().toUpperCase().replace(/\s+/g, '-') || 'STD';
  document.getElementById('p-sku').value = `${bike}-${cat}-${sub}`;
}

function receivePartQty(id, qty) {
  if (!requireCloudWriteAccess('receive stock')) return;
  const s = stock.find(x => x.id === id);
  if (!s) return;
  const add = Math.max(1, parseInt(qty, 10) || 0);
  s.updatedAt = nowISO();
  s.qty += add;
  logAction('update', 'stock', id, { qty: s.qty, delta: add, source: 'receive-stock' });
  markPartForRecentPrint?.(id);
  toast(`${s.name} restocked → ${s.qty}`);
  saveAll({ domain: 'stock' });
  renderStock();
  renderPrintManager?.();
}

function renderStockReceiveFound(s, scannedRaw = '') {
  const box = document.getElementById('stock-scan-found');
  if (!box) return;
  if (!s) {
    const sku = extractScannedSku(scannedRaw);
    const skuLiteral = JSON.stringify(sku);
    box.innerHTML = `
      <div class="quick-card">
        <div style="font-family:var(--fh);font-size:16px;font-weight:700;margin-bottom:4px;">Part not found</div>
        <div style="font-size:12px;color:var(--mut);">Scanned SKU: <span class="sku-tag">${sku || scannedRaw || '—'}</span></div>
        <div class="quick-actions">
          <button class="btn btn-p btn-sm" onclick='closeStockReceiveModal();openAddPart();prefillPartFromScannedSku(${skuLiteral})'>Create New Part</button>
        </div>
      </div>`;
    return;
  }
  box.innerHTML = `
    <div class="quick-card">
      <div style="font-family:var(--fh);font-size:16px;font-weight:700;">${s.name}</div>
      <div style="font-size:12px;color:var(--mut);margin:4px 0 8px;">${s.sku}${s.location ? ` · 📦 ${s.location}` : ''}</div>
      ${normalizePhotoArray(s.photos || s.photo || '').length ? `<div style="margin-bottom:8px;">${photoThumbWithCount(s.photos || s.photo || '', 'Stock Photo Reference')}</div>` : ''}
      <div style="font-size:12px;color:var(--mut);">Current stock: <b style="color:var(--acc)">${s.qty}</b> · Min ${s.min}</div>
      <div class="quick-actions">
        <button class="btn btn-g btn-sm" onclick="receivePartQty('${s.id}',1);renderStockReceiveFound(stock.find(x=>x.id==='${s.id}'))">+1</button>
        <button class="btn btn-g btn-sm" onclick="receivePartQty('${s.id}',5);renderStockReceiveFound(stock.find(x=>x.id==='${s.id}'))">+5</button>
        <button class="btn btn-g btn-sm" onclick="const q=prompt('Add quantity', '10'); if(q) { receivePartQty('${s.id}', q); renderStockReceiveFound(stock.find(x=>x.id==='${s.id}')); }">Custom Qty</button>
        <button class="btn btn-p btn-sm" onclick="editPart('${s.id}')">Edit Full Part</button>
      </div>
    </div>`;
}

function openStockReceiveScan() {
  if (!requireCloudWriteAccess('receive stock')) return;
  const box = document.getElementById('stock-scan-found');
  if (box) box.innerHTML = '';
  const search = document.getElementById('stock-manual-search');
  if (search) search.value = '';
  const results = document.getElementById('stock-manual-results');
  if (results) results.innerHTML = '';
  setScannerContext?.('stock');
  renderRecentScans?.('stock');
  openM('m-stock-scan');
}

function closeStockReceiveModal() {
  if (typeof scannerRunning !== 'undefined' && scannerRunning) stopScanner();
  closeM('m-stock-scan');
  setScannerContext?.('page');
}

function savePart() {
  if (!requireCloudWriteAccess(editPartId ? 'update stock items' : 'create stock items')) return;
  const name = document.getElementById('p-name').value.trim();
  if (!name) { toast('Enter part name'); return; }

  const bikeEl = document.getElementById('p-bike');
  const catEl  = document.getElementById('p-cat');
  const bikeTxt = BIKE_CODES[bikeEl.value] || bikeEl.options[bikeEl.selectedIndex]?.text || bikeEl.value;
  const catTxt  = CAT_CODES[catEl.value]   || catEl.options[catEl.selectedIndex]?.text  || catEl.value;

  const fitmentModels = String(document.getElementById('p-fit').value || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
  const manufacturer = document.getElementById('p-maker').value.trim();
  const supplierPartNo = document.getElementById('p-supplier-part').value.trim();
  const buyPrice = parseFloat(document.getElementById('p-cost').value) || 0;
  const sellPrice = parseFloat(document.getElementById('p-sell').value) || 0;
  const photos = typeof getPhotoPreviewList === 'function' ? getPhotoPreviewList('p-photo-preview') : [];

  const obj = normalizeStockItem({
    name,
    sku:       document.getElementById('p-sku').value.trim(),
    bike:      bikeTxt,
    cat:       catTxt,
    qty:       parseInt(document.getElementById('p-qty').value) || 0,
    min:       parseInt(document.getElementById('p-min').value) || 2,
    cost:      buyPrice,
    sellPrice,
    sup:       document.getElementById('p-sup').value.trim(),
    location:  document.getElementById('p-loc').value.trim(),
    manufacturer,
    companyBrand: manufacturer,
    supplierPartNo,
    fitmentModels,
    fits: fitmentModels,
    notes: document.getElementById('p-notes').value.trim(),
    photos,
    photo: photos[0] || '',
    lastPurchaseRate: buyPrice,
    lastSellPrice: sellPrice,
    updatedAt: nowISO(),
  });

  if (editPartId) {
    const existing = stock.find(x => x.id === editPartId);
    if (!existing) return;
    const prevBuy = parseFloat(existing.cost || 0) || 0;
    const prevSell = parseFloat(existing.sellPrice || 0) || 0;
    obj.previousBuyPrice = buyPrice !== prevBuy ? prevBuy : (existing.previousBuyPrice || 0);
    obj.previousSellPrice = sellPrice !== prevSell ? prevSell : (existing.previousSellPrice || 0);
    obj.lastPurchaseRate = buyPrice || existing.lastPurchaseRate || prevBuy;
    obj.lastSellPrice = sellPrice || existing.lastSellPrice || prevSell;
    Object.assign(existing, obj);
    logAction('update', 'stock', editPartId, { name });
    markPartForRecentPrint?.(editPartId);
    toast('Part updated');
  } else {
    const part = {
      id: nextId('s'),
      previousBuyPrice: 0,
      previousSellPrice: 0,
      ...obj,
    };
    stock.push(part);
    logAction('create', 'stock', part.id, { name });
    markPartForRecentPrint?.(part.id);
    toast('Part added: ' + name);
  }
  closeM('m-part'); saveAll({ domain: 'stock' }); renderStock(); renderPrintManager?.();
}

const SUPPLIER_IMPORT_REPLACEMENTS = [
  [/\bSUP SPL\b/g, 'SUPER SPLENDOR'],
  [/\bSU SPL\b/g, 'SUPER SPLENDOR'],
  [/\bSPL\b/g, 'SPLENDOR'],
  [/\bN\s*\/\s*M\b/g, 'NEW MODEL'],
  [/\bO\s*\/\s*M\b/g, 'OLD MODEL'],
  [/\bACT\b/g, 'ACTIVA'],
  [/\bACC\b/g, 'ACCESS'],
  [/\bJUPTOR\b/g, 'JUPITER'],
  [/\bACESS\b/g, 'ACCESS'],
  [/\bSYZUKI\b/g, 'SUZUKI'],
  [/\bBS\s*6\b/g, 'BS6'],
  [/\bBS\s*4\b/g, 'BS4'],
  [/\bASM\b/g, 'ASSEMBLY'],
  [/\bASSY\b/g, 'ASSEMBLY'],
];

const SUPPLIER_STOP_WORDS = new Set([
  'ALL', 'MODEL', 'MODELS', 'KIT', 'SET', 'BOX', 'PCS', 'PC', 'EA', 'NOS', 'NO',
  'WITH', 'WITHOUT', 'ASSEMBLY', 'ASSEMBLIES', 'STD', 'FRONT', 'REAR'
]);

function openAgentJsonPicker() {
  if (!requireCloudWriteAccess('import agent JSON')) return;
  const input = document.getElementById('agent-json-file');
  if (!input) return;
  input.value = '';
  input.click();
}

function openCatalogCsvPicker() {
  if (!requireCloudWriteAccess('import catalog CSV')) return;
  if (hasSavedCatalogReviewSession()) {
    const replace = confirm('A saved catalog review already exists. Start a new import and replace it?');
    if (!replace) return;
    clearSavedCatalogReviewSession();
    catalogImportSession = null;
    updateCatalogReviewResumeButton();
  }
  const input = document.getElementById('catalog-csv-file');
  if (!input) return;
  input.value = '';
  input.click();
}

function importCatalogCsvFile(input) {
  const file = input?.files?.[0];
  if (!file) return;
  if (!requireCloudWriteAccess('import catalog CSV')) {
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = parseCatalogCsv(String(reader.result || ''));
      startCatalogReviewSession(rows, file.name);
    } catch (err) {
      toast((err && err.message) ? err.message : 'Catalog CSV import failed', 4200);
    } finally {
      input.value = '';
    }
  };
  reader.readAsText(file);
}

function parseCatalogCsv(text) {
  const rows = parseDelimitedCsv(text).filter(row => row.some(cell => String(cell || '').trim()));
  if (rows.length < 2) throw new Error('Catalog CSV is empty');
  const header = rows[0].map(cell => String(cell || '').trim());
  const headerMap = {};
  header.forEach((name, idx) => { headerMap[name] = idx; });

  if (headerMap.internal_sku == null && headerMap.sku_seed == null) {
    throw new Error('Catalog CSV needs internal_sku or sku_seed column');
  }

  return rows.slice(1).map((row, index) => normalizeCatalogRowForReview(row, headerMap, index + 2)).filter(Boolean);
}

function normalizeCatalogRowForReview(row, headerMap, rowNumber) {
  const get = key => {
    const idx = headerMap[key];
    return idx == null ? '' : String(row[idx] || '').trim();
  };
  const internalSku = get('internal_sku') || get('sku_seed');
  const supplierPartNo = get('supplier_part_number') || get('supplierPartNo');
  const rawDescription = get('raw_description') || get('description');
  const normalizedName = get('normalized_part_name') || get('part_name') || rawDescription;
  if (!internalSku && !normalizedName) return null;

  const fitmentModels = String(get('fitment_models') || '')
    .split('|')
    .map(x => x.trim())
    .filter(Boolean);

  const buyPrice = parseSupplierNumber(get('net_rate_rs') || get('buy_price') || get('cost'));
  const existing = findStockByCatalogRow({ internalSku, supplierPartNo });
  const duplicate = findCatalogDuplicateCandidate({
    internalSku,
    supplierPartNo,
    normalizedPartName: normalizedName,
    rawDescription,
    fitmentModels,
  }, existing?.id || '');
  const defaultSell = existing
    ? (parseFloat(existing.sellPrice || existing.lastSellPrice || 0) || 0)
    : (parseSupplierNumber(get('sell_price_rs') || get('sell_price') || get('sellPrice')) || 0);

  return {
    rowNumber,
    internalSku: internalSku.trim().toUpperCase(),
    supplierPartNo: supplierPartNo.trim(),
    supplierCodeFamily: get('supplier_code_family'),
    rawDescription,
    normalizedPartName: normalizedName,
    brandBike: get('brand_bike'),
    primaryFamily: get('primary_family'),
    fitmentModels,
    variantTokens: get('variant_tokens'),
    side: get('side'),
    buyPrice,
    sellPrice: defaultSell,
    catalogStatus: get('catalog_status') || '',
    reviewReason: get('review_reason') || '',
    existingStockId: existing?.id || '',
    duplicateStockId: duplicate?.id || '',
    duplicateConfidence: duplicate?.confidence || 0,
    importBike: '',
    importCategory: '',
  };
}

function findStockByCatalogRow(row) {
  const partNo = normalizeAlphaNum(row.supplierPartNo);
  if (partNo) {
    const byPartNo = stock.find(item => normalizeAlphaNum(item.supplierPartNo) === partNo);
    if (byPartNo) return byPartNo;
  }
  const sku = String(row.internalSku || '').trim().toUpperCase();
  if (!sku) return null;
  return stock.find(item => String(item.sku || '').trim().toUpperCase() === sku) || null;
}

function findCatalogDuplicateCandidate(row, ignoreId = '') {
  const rowTokens = tokenizeSupplierText(`${row.normalizedPartName || ''} ${row.rawDescription || ''}`);
  const rowFits = new Set((row.fitmentModels || []).map(item => String(item || '').trim().toUpperCase()).filter(Boolean));
  let best = null;

  stock.forEach(item => {
    if (ignoreId && item.id === ignoreId) return;
    const itemTokens = tokenizeSupplierText(`${item.name || ''} ${(item.aliases || []).join(' ')}`);
    if (!itemTokens.length || !rowTokens.length) return;
    const overlap = tokenOverlap(rowTokens, itemTokens);
    let score = overlap;

    const itemFits = new Set((item.fitmentModels || item.fits || []).map(value => String(value || '').trim().toUpperCase()).filter(Boolean));
    if (rowFits.size && itemFits.size) {
      const fitHits = [...rowFits].filter(value => itemFits.has(value)).length;
      if (fitHits) score += 0.18 * (fitHits / Math.max(rowFits.size, itemFits.size, 1));
    }

    if (String(item.sku || '').trim().toUpperCase() === String(row.internalSku || '').trim().toUpperCase()) score += 0.22;
    if (score < 0.62) return;

    if (!best || score > best.confidence) {
      best = { id: item.id, confidence: Math.min(0.98, Math.round(score * 100) / 100) };
    }
  });

  return best;
}

function startCatalogReviewSession(rows, sourceFile) {
  if (!rows.length) throw new Error('No valid rows found in catalog CSV');
  catalogImportSession = {
    sourceFile,
    rows,
    index: 0,
    confirmed: [],
    declined: [],
    reviewLater: [],
    startedAt: nowISO(),
  };
  saveCatalogReviewSession();
  renderCatalogReviewStep();
  openM('m-catalog-review');
}

function renderCatalogReviewStep() {
  const body = document.getElementById('catalog-review-body');
  const footer = document.getElementById('catalog-review-footer');
  if (!body || !footer || !catalogImportSession) return;

  const { rows, index, confirmed, declined, reviewLater, sourceFile } = catalogImportSession;
  const current = rows[index];
  if (!current) {
    renderCatalogReviewSummary();
    return;
  }

  const progress = index + 1;
  const fitments = current.fitmentModels.length ? current.fitmentModels.join(', ') : '';
  const existing = current.existingStockId ? stock.find(item => item.id === current.existingStockId) : null;
  const duplicate = current.duplicateStockId ? stock.find(item => item.id === current.duplicateStockId) : null;
  const importMode = current.importMode || (existing ? 'update-existing' : 'create-new');
  const bikeLabel = current.importBike || catalogBikeLabel(current);
  const categoryLabel = current.importCategory || catalogCategoryLabel(current.normalizedPartName);

  body.innerHTML = `
    <div class="quick-card" style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
        <div>
          <div style="font-family:var(--fh);font-size:12px;color:var(--mut);">File: ${sourceFile} · Part ${progress} of ${rows.length}</div>
          <div style="font-size:18px;font-weight:700;margin-top:4px;">Review Part Import</div>
          <div style="font-size:12px;color:var(--mut);margin-top:6px;">Edit the row before you confirm it.</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <span class="sku-tag">${current.primaryFamily || current.brandBike || 'Generic'}</span>
          ${current.catalogStatus ? `<span class="sku-tag">${current.catalogStatus}</span>` : ''}
        </div>
      </div>
      <div style="font-size:13px;color:var(--mut);margin-top:10px;">${current.rawDescription || '—'}</div>
    </div>
    <div class="f2">
      <div class="frow"><label class="flbl">Part Name *</label><input class="finp" id="catalog-review-name" value="${escapeAttr(current.normalizedPartName)}"></div>
      <div class="frow"><label class="flbl">SKU *</label><input class="finp" id="catalog-review-sku" value="${escapeAttr(current.internalSku)}" style="font-family:monospace;"></div>
    </div>
    <div class="f2">
      <div class="frow"><label class="flbl">Supplier Part No.</label><input class="finp" id="catalog-review-partno" value="${escapeAttr(current.supplierPartNo)}"></div>
      <div class="frow"><label class="flbl">Supplier Code Family</label><input class="finp" value="${escapeAttr(current.supplierCodeFamily || '—')}" disabled></div>
    </div>
    <div class="f2">
      <div class="frow"><label class="flbl">Fitment Models</label><input class="finp" id="catalog-review-fitments" value="${escapeAttr(fitments)}" placeholder="Comma separated fitments"></div>
      <div class="frow"><label class="flbl">Variant / Side</label><input class="finp" id="catalog-review-variant" value="${escapeAttr([current.variantTokens, current.side].filter(Boolean).join(' · ') || '')}" placeholder="e.g. BS6 · LHS"></div>
    </div>
    <div class="f2">
      <div class="frow"><label class="flbl">Buy Price ₹</label><input class="finp" id="catalog-review-buy" type="number" min="0" step="0.01" value="${current.buyPrice || 0}"></div>
      <div class="frow"><label class="flbl">Sell Price ₹ *</label><input class="finp" id="catalog-review-sell" type="number" min="0" step="0.01" value="${current.sellPrice || ''}" placeholder="Enter selling price"></div>
    </div>
    <div class="f2">
      <div class="frow"><label class="flbl">Bike / Brand</label><input class="finp" id="catalog-review-bike" value="${escapeAttr(bikeLabel)}" placeholder="e.g. Honda Activa"></div>
      <div class="frow"><label class="flbl">Category</label>
        <select class="fsel" id="catalog-review-cat">
          ${catalogCategoryOptions(categoryLabel)}
        </select>
      </div>
    </div>
    <div class="quick-card" style="margin-top:12px;">
      <div style="font-family:var(--fh);font-size:12px;color:var(--mut);margin-bottom:6px;">Existing stock match</div>
      <div style="font-size:13px;">${existing ? `${existing.name} · <span class="sku-tag">${existing.sku}</span> · Current sell ${fmtMoney(existing.sellPrice || 0)}` : 'No existing stock match. A new part will be created.'}</div>
    </div>
    ${duplicate && !existing ? `<div class="quick-card" style="margin-top:12px;border-color:#ff8a3d;">
      <div style="font-family:var(--fh);font-size:12px;color:#ff8a3d;margin-bottom:6px;">Possible duplicate found</div>
      <div style="font-size:13px;margin-bottom:8px;">${duplicate.name} · <span class="sku-tag">${duplicate.sku}</span> · Confidence ${Math.round((current.duplicateConfidence || 0) * 100)}%</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
          <input type="radio" name="catalog-import-mode" value="create-new" ${importMode === 'create-new' ? 'checked' : ''} onchange="setCatalogImportMode('create-new')">
          Create as new part
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
          <input type="radio" name="catalog-import-mode" value="update-duplicate" ${importMode === 'update-duplicate' ? 'checked' : ''} onchange="setCatalogImportMode('update-duplicate')">
          Update this existing part
        </label>
      </div>
    </div>` : ''}
    ${existing ? `<div class="quick-card" style="margin-top:12px;">
      <div style="font-family:var(--fh);font-size:12px;color:var(--mut);margin-bottom:6px;">Import action</div>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
        <input type="radio" name="catalog-import-mode" value="update-existing" checked onchange="setCatalogImportMode('update-existing')">
        Update matched existing part
      </label>
    </div>` : ''}
    ${current.reviewReason ? `<div class="quick-card" style="margin-top:12px;border-color:#ff8a3d;">
      <div style="font-family:var(--fh);font-size:12px;color:#ff8a3d;margin-bottom:6px;">Catalog note</div>
      <div style="font-size:13px;">${current.reviewReason}</div>
    </div>` : ''}
    <div style="font-size:12px;color:var(--mut);margin-top:12px;">Confirmed so far: ${confirmed.length} · Review later: ${reviewLater.length} · Declined: ${declined.length}</div>
  `;

  footer.innerHTML = `
    <button class="btn btn-g" onclick="applyCatalogReviewEdits()">Update Preview</button>
    <button class="btn btn-g" onclick="aiNormalizeCatalogReviewRow()">AI Normalize Prompt</button>
    <button class="btn btn-g" onclick="goToPreviousCatalogReviewRow()" ${index === 0 ? 'disabled' : ''}>Previous</button>
    <button class="btn btn-p" style="flex:1" onclick="confirmCatalogReviewRow()">Confirm & Next</button>
    <button class="btn btn-g" onclick="reviewLaterCatalogReviewRow()">Review Later</button>
    <button class="btn btn-g" onclick="declineCatalogReviewRow()">Decline</button>
    <button class="btn btn-g" onclick="pauseCatalogReview()">Stop & Continue Later</button>
    <button class="btn btn-g" onclick="cancelCatalogReview()">Cancel Import</button>
  `;
}

function aiNormalizeCatalogReviewRow() {
  if (!catalogImportSession) return;
  const current = catalogImportSession.rows[catalogImportSession.index];
  if (!current || typeof openAiAssistModal !== 'function') return;
  const name = String(document.getElementById('catalog-review-name')?.value || current.normalizedPartName || '').trim();
  const sku = String(document.getElementById('catalog-review-sku')?.value || current.internalSku || '').trim();
  const partNo = String(document.getElementById('catalog-review-partno')?.value || current.supplierPartNo || '').trim();
  const fitments = String(document.getElementById('catalog-review-fitments')?.value || current.fitmentModels?.join(', ') || '').trim();
  const variant = String(document.getElementById('catalog-review-variant')?.value || '').trim();
  const bike = String(document.getElementById('catalog-review-bike')?.value || current.importBike || '').trim();
  const category = String(document.getElementById('catalog-review-cat')?.value || current.importCategory || '').trim();
  const prompt = [
    'Normalize this supplier part row for a garage stock catalog.',
    '',
    'Rules:',
    '- Keep supplier part number exactly as given.',
    '- Improve the part name, fitment models, and variant only if clearly supported by the text.',
    '- Suggest a better internal SKU if the current one is weak.',
    '- Do not invent fitments or categories.',
    '- Return plain text in this exact format:',
    'Part Name:',
    'SKU Suggestion:',
    'Fitment Models:',
    'Variant / Side:',
    'Bike / Brand:',
    'Category:',
    'Notes:',
    '',
    `Supplier raw description: ${current.rawDescription || ''}`,
    `Supplier part no: ${partNo}`,
    `Supplier code family: ${current.supplierCodeFamily || ''}`,
    `Current part name: ${name}`,
    `Current SKU: ${sku}`,
    `Current fitments: ${fitments}`,
    `Current variant: ${variant}`,
    `Current bike / brand: ${bike}`,
    `Current category: ${category}`,
  ].join('\n');
  openAiAssistModal('AI Normalize Supplier Part', prompt);
}

function renderCatalogReviewSummary() {
  const body = document.getElementById('catalog-review-body');
  const footer = document.getElementById('catalog-review-footer');
  if (!body || !footer || !catalogImportSession) return;
  const declinedItems = catalogImportSession.declined.map(item =>
    `<div style="font-size:13px;padding:6px 0;border-bottom:1px solid var(--bor);">${item.internalSku} · ${item.normalizedPartName}</div>`
  ).join('');
  const reviewLaterItems = catalogImportSession.reviewLater.map(item =>
    `<div style="font-size:13px;padding:6px 0;border-bottom:1px solid var(--bor);">${item.internalSku} · ${item.normalizedPartName}</div>`
  ).join('');
  body.innerHTML = `
    <div class="quick-card">
      <div style="font-size:18px;font-weight:700;">Review complete</div>
      <div style="font-size:13px;color:var(--mut);margin-top:6px;">
        Confirmed: <b>${catalogImportSession.confirmed.length}</b> · Review later: <b>${catalogImportSession.reviewLater.length}</b> · Declined: <b>${catalogImportSession.declined.length}</b>
      </div>
    </div>
    <div class="quick-card" style="margin-top:12px;">
      <div style="font-family:var(--fh);font-size:12px;color:var(--mut);margin-bottom:8px;">Review later parts</div>
      <div style="max-height:200px;overflow:auto;">
        ${reviewLaterItems || '<div style="font-size:13px;color:var(--mut);">No parts marked for review later.</div>'}
      </div>
    </div>
    <div class="quick-card" style="margin-top:12px;">
      <div style="font-family:var(--fh);font-size:12px;color:var(--mut);margin-bottom:8px;">Declined parts</div>
      <div style="max-height:240px;overflow:auto;">
        ${declinedItems || '<div style="font-size:13px;color:var(--mut);">No declined parts.</div>'}
      </div>
    </div>
  `;
  footer.innerHTML = `
    <button class="btn btn-p" style="flex:1" onclick="applyCatalogReviewImport()">Finish Import Review</button>
    <button class="btn btn-g" onclick="pauseCatalogReview()">Stop & Continue Later</button>
    <button class="btn btn-g" onclick="closeCatalogReview()">Close</button>
  `;
}

function confirmCatalogReviewRow() {
  if (!catalogImportSession) return;
  const current = catalogImportSession.rows[catalogImportSession.index];
  if (!current) return;
  if (!applyCatalogReviewEdits({ rerender: false })) return;
  const sellInput = document.getElementById('catalog-review-sell');
  const sellPrice = Math.max(0, parseFloat(sellInput?.value || 0) || 0);
  if (!sellPrice) {
    toast('Enter selling price before confirming', 3200);
    sellInput?.focus();
    return;
  }
  current.sellPrice = sellPrice;
  const importResult = upsertCatalogReviewItem(current);
  current.importedStockId = importResult.stockId;
  current.importedAction = importResult.action;
  current.importedAt = nowISO();
  const existingIndex = catalogImportSession.confirmed.findIndex(item => item.rowNumber === current.rowNumber);
  if (existingIndex >= 0) {
    catalogImportSession.confirmed[existingIndex] = { ...current, sellPrice };
  } else {
    catalogImportSession.confirmed.push({ ...current, sellPrice });
  }
  catalogImportSession.index += 1;
  saveCatalogReviewSession();
  saveAll({ domain: 'catalog' });
  renderStock();
  renderPrintManager?.();
  toast(importResult.action === 'created' ? 'Part added to stock and ready in search' : 'Part updated in stock and ready in search', 2600);
  renderCatalogReviewStep();
}

function declineCatalogReviewRow() {
  if (!catalogImportSession) return;
  applyCatalogReviewEdits({ rerender: false });
  const current = catalogImportSession.rows[catalogImportSession.index];
  if (!current) return;
  rollbackCatalogReviewItem(current);
  catalogImportSession.declined.push(current);
  catalogImportSession.index += 1;
  saveCatalogReviewSession();
  saveAll({ domain: 'catalog' });
  renderStock();
  renderCatalogReviewStep();
}

function reviewLaterCatalogReviewRow() {
  if (!catalogImportSession) return;
  applyCatalogReviewEdits({ rerender: false });
  const current = catalogImportSession.rows[catalogImportSession.index];
  if (!current) return;
  rollbackCatalogReviewItem(current);
  current.reviewLaterAt = nowISO();
  current.reviewLaterReason = current.reviewReason || '';
  catalogImportSession.reviewLater.push(current);
  catalogImportSession.index += 1;
  saveCatalogReviewSession();
  saveAll({ domain: 'catalog' });
  renderStock();
  toast('Part saved to review later list', 2400);
  renderCatalogReviewStep();
}

function goToPreviousCatalogReviewRow() {
  if (!catalogImportSession) return;
  if (catalogImportSession.index <= 0) return;
  applyCatalogReviewEdits({ rerender: false });

  const prevIndex = catalogImportSession.index - 1;
  const currentRow = catalogImportSession.rows[prevIndex];
  const lastConfirmed = catalogImportSession.confirmed[catalogImportSession.confirmed.length - 1];
  const lastDeclined = catalogImportSession.declined[catalogImportSession.declined.length - 1];
  const lastReviewLater = catalogImportSession.reviewLater[catalogImportSession.reviewLater.length - 1];

  if (lastConfirmed && lastConfirmed.rowNumber === currentRow.rowNumber) {
    catalogImportSession.confirmed.pop();
  } else if (lastDeclined && lastDeclined.rowNumber === currentRow.rowNumber) {
    catalogImportSession.declined.pop();
  } else if (lastReviewLater && lastReviewLater.rowNumber === currentRow.rowNumber) {
    catalogImportSession.reviewLater.pop();
  }

  catalogImportSession.index = prevIndex;
  saveCatalogReviewSession();
  renderCatalogReviewStep();
}

function pauseCatalogReview() {
  if (!catalogImportSession) return;
  applyCatalogReviewEdits({ rerender: false });
  saveCatalogReviewSession();
  closeM('m-catalog-review');
  updateCatalogReviewResumeButton();
  toast(`Review paused at part ${Math.min((catalogImportSession.index || 0) + 1, catalogImportSession.rows.length)}.`, 3200);
}

function cancelCatalogReview() {
  if (!catalogImportSession) {
    closeM('m-catalog-review');
    return;
  }
  if (catalogImportSession.confirmed.length || catalogImportSession.declined.length || catalogImportSession.reviewLater.length) {
    if (!confirm('Cancel this catalog review? Confirmed parts will not be imported.')) return;
  }
  rollbackCatalogReviewSession();
  closeCatalogReview();
}

function closeCatalogReview() {
  catalogImportSession = null;
  closeM('m-catalog-review');
  updateCatalogReviewResumeButton();
}

function applyCatalogReviewImport() {
  if (!catalogImportSession) return;
  const confirmed = catalogImportSession.confirmed.slice();
  let created = 0;
  let updated = 0;
  confirmed.forEach(item => {
    if (item.importedStockId) {
      if (item.importedAction === 'created') created += 1;
      else updated += 1;
      return;
    }
    const result = upsertCatalogReviewItem(item);
    item.importedStockId = result.stockId;
    item.importedAction = result.action;
    if (result.action === 'created') created += 1;
    else updated += 1;
  });
  saveAll({ domain: 'catalog' });
  renderStock();
  renderPrintManager?.();
  const declined = catalogImportSession.declined.length;
  const reviewLater = catalogImportSession.reviewLater.length;
  clearSavedCatalogReviewSession();
  closeCatalogReview();
  toast(`Imported ${created} new, updated ${updated}, review later ${reviewLater}, declined ${declined}.`, 4200);
}

function upsertCatalogReviewItem(item) {
  const stamp = nowISO();
  let existing = null;
  if (item.importedStockId) {
    existing = stock.find(entry => entry.id === item.importedStockId) || null;
  }
  if (!existing && (item.importMode === 'update-existing' || item.importMode === 'update-duplicate')) {
    const targetId = item.importMode === 'update-duplicate' ? item.duplicateStockId : item.existingStockId;
    existing = stock.find(entry => entry.id === targetId) || null;
  }
  if (!existing) existing = findStockByCatalogRow(item);

  const payload = normalizeStockItem({
    name: buildCatalogStockName(item),
    sku: item.internalSku,
    bike: item.importBike || catalogBikeLabel(item),
    cat: item.importCategory || catalogCategoryLabel(item.normalizedPartName),
    qty: existing ? existing.qty : 0,
    min: existing ? existing.min : 2,
    cost: item.buyPrice || 0,
    sellPrice: item.sellPrice || 0,
    manufacturer: item.supplierCodeFamily || '',
    companyBrand: item.supplierCodeFamily || '',
    supplierPartNo: item.supplierPartNo || '',
    fitmentModels: item.fitmentModels || [],
    fits: item.fitmentModels || [],
    aliases: uniqStrings([...(existing?.aliases || []), item.rawDescription, item.normalizedPartName]),
    notes: uniqStrings([
      existing?.notes || '',
      item.reviewReason ? `Catalog note: ${item.reviewReason}` : '',
      item.rawDescription ? `Source: ${item.rawDescription}` : '',
    ]).join(' | '),
    lastPurchaseRate: item.buyPrice || 0,
    lastSellPrice: item.sellPrice || 0,
    previousBuyPrice: existing ? (parseFloat(existing.cost || 0) || 0) : 0,
    previousSellPrice: existing ? (parseFloat(existing.sellPrice || 0) || 0) : 0,
    location: existing?.location || '',
    sup: existing?.sup || '',
    updatedAt: stamp,
  });

  if (existing) {
    if (!item.previousStockSnapshot) item.previousStockSnapshot = JSON.parse(JSON.stringify(existing));
    Object.assign(existing, payload);
    logAction('update', 'stock', existing.id, { source: 'catalog-review-import', sku: existing.sku });
    return { stockId: existing.id, action: 'updated' };
  }

  const part = {
    id: nextId('s'),
    ...payload,
  };
  stock.push(part);
  logAction('create', 'stock', part.id, { source: 'catalog-review-import', sku: part.sku });
  return { stockId: part.id, action: 'created' };
}

function rollbackCatalogReviewItem(item) {
  if (!item?.importedStockId || !item?.importedAction) return;
  const existing = stock.find(entry => entry.id === item.importedStockId);
  if (!existing) {
    item.importedStockId = '';
    item.importedAction = '';
    item.previousStockSnapshot = null;
    return;
  }

  if (item.importedAction === 'created') {
    stock = stock.filter(entry => entry.id !== item.importedStockId);
  } else if (item.importedAction === 'updated' && item.previousStockSnapshot) {
    Object.assign(existing, JSON.parse(JSON.stringify(item.previousStockSnapshot)));
  }

  item.importedStockId = '';
  item.importedAction = '';
  item.importedAt = '';
  item.previousStockSnapshot = null;
}

function rollbackCatalogReviewSession() {
  if (!catalogImportSession) return;
  catalogImportSession.rows.forEach(rollbackCatalogReviewItem);
  catalogImportSession.confirmed.forEach(rollbackCatalogReviewItem);
  saveAll({ domain: 'catalog' });
  renderStock();
  renderPrintManager?.();
}

function setCatalogImportMode(mode) {
  if (!catalogImportSession) return;
  const current = catalogImportSession.rows[catalogImportSession.index];
  if (!current) return;
  current.importMode = mode;
  saveCatalogReviewSession();
}

function saveCatalogReviewSession() {
  try {
    if (!catalogImportSession) return;
    localStorage.setItem(CATALOG_IMPORT_SESSION_KEY, JSON.stringify(catalogImportSession));
    updateCatalogReviewResumeButton();
  } catch (err) {
    console.warn('catalog review session save failed', err);
  }
}

function loadSavedCatalogReviewSession() {
  try {
    const raw = localStorage.getItem(CATALOG_IMPORT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    parsed.confirmed = Array.isArray(parsed.confirmed) ? parsed.confirmed : [];
    parsed.declined = Array.isArray(parsed.declined) ? parsed.declined : [];
    parsed.reviewLater = Array.isArray(parsed.reviewLater) ? parsed.reviewLater : [];
    parsed.index = Math.max(0, parseInt(parsed.index || 0, 10) || 0);
    return parsed;
  } catch (err) {
    console.warn('catalog review session load failed', err);
    return null;
  }
}

function clearSavedCatalogReviewSession() {
  try {
    localStorage.removeItem(CATALOG_IMPORT_SESSION_KEY);
  } catch (err) {
    console.warn('catalog review session clear failed', err);
  }
  updateCatalogReviewResumeButton();
}

function hasSavedCatalogReviewSession() {
  return !!loadSavedCatalogReviewSession();
}

function resumeCatalogReview() {
  if (!requireCloudWriteAccess('resume catalog review')) return;
  const saved = loadSavedCatalogReviewSession();
  if (!saved) {
    toast('No saved catalog review found', 2800);
    updateCatalogReviewResumeButton();
    return;
  }
  catalogImportSession = saved;
  renderCatalogReviewStep();
  openM('m-catalog-review');
}

function updateCatalogReviewResumeButton() {
  const btn = document.getElementById('catalog-review-resume-btn');
  if (!btn) return;
  const saved = loadSavedCatalogReviewSession();
  if (!saved) {
    btn.style.display = 'none';
    return;
  }
  const nextIndex = Math.min((parseInt(saved.index || 0, 10) || 0) + 1, (saved.rows || []).length || 1);
  const reviewLaterCount = Array.isArray(saved.reviewLater) ? saved.reviewLater.length : 0;
  btn.textContent = reviewLaterCount
    ? `Continue Catalog Review (${nextIndex}/${saved.rows.length}) · Review Later ${reviewLaterCount}`
    : `Continue Catalog Review (${nextIndex}/${saved.rows.length})`;
  btn.style.display = '';
}

function buildCatalogStockName(item) {
  const bits = [item.normalizedPartName];
  if (item.side) bits.push(item.side);
  return bits.filter(Boolean).join(' ');
}

function applyCatalogReviewEdits(options = {}) {
  if (!catalogImportSession) return false;
  const current = catalogImportSession.rows[catalogImportSession.index];
  if (!current) return false;

  const name = String(document.getElementById('catalog-review-name')?.value || '').trim();
  const sku = String(document.getElementById('catalog-review-sku')?.value || '').trim().toUpperCase();
  const supplierPartNo = String(document.getElementById('catalog-review-partno')?.value || '').trim();
  const fitments = String(document.getElementById('catalog-review-fitments')?.value || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
  const variantRaw = String(document.getElementById('catalog-review-variant')?.value || '').trim();
  const buyPrice = Math.max(0, parseFloat(document.getElementById('catalog-review-buy')?.value || current.buyPrice || 0) || 0);
  const sellPrice = Math.max(0, parseFloat(document.getElementById('catalog-review-sell')?.value || current.sellPrice || 0) || 0);
  const importBike = String(document.getElementById('catalog-review-bike')?.value || '').trim();
  const importCategory = String(document.getElementById('catalog-review-cat')?.value || '').trim();

  if (!name || !sku) {
    toast('Part name and SKU are required', 3200);
    return false;
  }

  current.normalizedPartName = name;
  current.internalSku = sku;
  current.supplierPartNo = supplierPartNo;
  current.fitmentModels = fitments;
  current.fits = fitments;
  current.variantTokens = variantRaw.replace(/\s*·\s*/g, '|');
  current.side = inferCatalogSide(variantRaw, current.side);
  current.buyPrice = buyPrice;
  current.sellPrice = sellPrice;
  current.importBike = importBike;
  current.importCategory = importCategory;

  const exact = findStockByCatalogRow(current);
  current.existingStockId = exact?.id || '';
  const duplicate = findCatalogDuplicateCandidate(current, current.existingStockId || '');
  current.duplicateStockId = duplicate?.id || '';
  current.duplicateConfidence = duplicate?.confidence || 0;
  if (!current.existingStockId && current.importMode === 'update-existing') current.importMode = 'create-new';
  if (!current.duplicateStockId && current.importMode === 'update-duplicate') current.importMode = 'create-new';

  saveCatalogReviewSession();
  if (options.rerender !== false) renderCatalogReviewStep();
  return true;
}

function inferCatalogSide(variantRaw, fallback = '') {
  const text = String(variantRaw || '').toUpperCase();
  if (text.includes('LHS')) return 'LHS';
  if (text.includes('RHS')) return 'RHS';
  if (text.includes('FRONT')) return 'FRONT';
  if (text.includes('REAR')) return 'REAR';
  if (text.includes('SET')) return 'SET';
  return fallback || '';
}

function catalogBikeLabel(item) {
  const family = String(item.primaryFamily || '').trim().toUpperCase();
  return ({
    ACTIVA: 'Honda Activa',
    ACCESS: 'Suzuki Access',
    AVIATOR: 'Honda Aviator',
    BURGMAN: 'Suzuki Burgman',
    DIO: 'Honda Dio',
    JUPITER: 'TVS Jupiter',
    PASSION: 'Hero Passion',
    PLEASURE: 'Hero Pleasure',
    PULSAR: 'Bajaj Pulsar',
    SHINE: 'Honda Shine',
    SPLENDOR: 'Hero Splendor',
    TVS: 'TVS',
    HERO: 'Hero',
    HONDA: 'Honda',
    OLA: 'Ola',
    ATHER: 'Ather',
    UNIVERSAL: 'Generic / Universal',
  })[family] || item.brandBike || family || 'Generic / Universal';
}

function catalogCategoryLabel(partName) {
  return normalizeCategoryLabelFromAgent({ variantSubtype: partName, partName });
}

function catalogCategoryOptions(selected) {
  const options = ['Electrical', 'Brakes', 'Filters/Fluids', 'Cables/Controls', 'Body/Frame', 'Engine/Drive', 'Lights', 'Tyres/Belts', 'Locks'];
  const current = selected || 'Electrical';
  return options.map(option => `<option value="${option}"${option === current ? ' selected' : ''}>${option}</option>`).join('');
}

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function importAgentJsonFile(input) {
  const file = input?.files?.[0];
  if (!file) return;
  if (!requireCloudWriteAccess('import agent JSON')) {
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const summary = ingestAgentStockJson(String(reader.result || ''), { fileName: file.name });
      toast(`Imported ${summary.created} new and updated ${summary.updated} existing parts.`);
      renderStock();
      renderPrintManager?.();
    } catch (err) {
      toast((err && err.message) ? err.message : 'Agent JSON import failed', 4200);
    } finally {
      input.value = '';
    }
  };
  reader.readAsText(file);
}

function ingestAgentStockJson(raw, options = {}) {
  const parsed = JSON.parse(raw);
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  if (!items.length) throw new Error('No items found in agent JSON');

  const invoiceMeta = parsed.invoiceMeta || {};
  const sourceLabel = options.fileName || `agent-import-${today()}.json`;
  const invoiceLabel = invoiceMeta.invoiceNumber || sourceLabel;
  let created = 0;
  let updated = 0;
  let skipped = 0;

  items.forEach((item, idx) => {
    const normalized = normalizeAgentImportItem(item, invoiceMeta, idx + 1);
    if (!normalized.name || !normalized.sku || normalized.qty <= 0) {
      skipped += 1;
      return;
    }

    const existing = findStockMatchForAgentImport(normalized);
    if (existing) {
      restockFromAgentImport(existing, normalized, { invoiceLabel, sourceLabel });
      updated += 1;
      return;
    }

    const part = {
      id: nextId('s'),
      ...normalized,
      previousBuyPrice: 0,
      previousSellPrice: 0,
      updatedAt: nowISO(),
    };
    stock.push(part);
    stockMovements.unshift({
      id: nextId('sm'),
      type: 'purchase',
      stockId: part.id,
      sku: part.sku,
      qty: part.qty,
      rate: part.cost || 0,
      amount: (part.cost || 0) * part.qty,
      source: 'agent-json-import',
      sourceId: invoiceLabel,
      supplier: String(invoiceMeta.supplierName || '').trim(),
      createdAt: nowISO(),
    });
    logAction('create', 'stock', part.id, {
      source: 'agent-json-import',
      sku: part.sku,
      supplierPartNo: part.supplierPartNo || '',
    });
    created += 1;
  });

  saveAll({ domain: 'catalog' });
  return { created, updated, skipped, total: items.length };
}

function parseDelimitedCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const input = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (ch === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (ch === ',' && !quoted) {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n' && !quoted) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function parseSupplierNumber(value) {
  const cleaned = String(value || '').replace(/[^0-9.\-]/g, '');
  return parseFloat(cleaned || '0') || 0;
}

function normalizeSupplierDescription(value) {
  let text = String(value || '').toUpperCase();
  SUPPLIER_IMPORT_REPLACEMENTS.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });
  text = text
    .replace(/&/g, ' AND ')
    .replace(/[.,()[\]/\\+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function normalizeAlphaNum(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function tokenizeSupplierText(value) {
  return normalizeSupplierDescription(value)
    .split(' ')
    .map(token => token.trim())
    .filter(token => token && !SUPPLIER_STOP_WORDS.has(token));
}

function tokenOverlap(left, right) {
  const rightSet = new Set(right);
  let hits = 0;
  left.forEach(token => {
    if (rightSet.has(token)) hits += 1;
  });
  return hits / Math.max(left.length, right.length, 1);
}

function normalizeAgentImportItem(item, invoiceMeta = {}, lineNo = 0) {
  const rawSku = String(item?.internalSkuSuggestion || '').trim().toUpperCase();
  const sku = rawSku.replace(/\s+/g, '');
  const [bikeCode = 'GEN', catCode = 'ELE'] = sku.split('-');
  const bike = BIKE_CODES[bikeCode] || normalizeBikeLabelFromAgent(item);
  const cat = CAT_CODES[catCode] || normalizeCategoryLabelFromAgent(item);
  const qty = Math.max(0, parseFloat(item?.qty || 0) || 0);
  const buyPrice = Math.max(0, parseFloat(item?.buyPrice || 0) || 0);
  const sellPrice = Math.max(0, parseFloat(item?.sellPriceSuggestion || item?.mrp || 0) || 0);
  const fits = Array.isArray(item?.fitmentModels)
    ? item.fitmentModels.map(x => String(x || '').trim()).filter(Boolean)
    : [];
  const notes = [
    String(item?.reviewNotes || '').trim(),
    invoiceMeta?.invoiceNumber ? `Imported from ${invoiceMeta.invoiceNumber}` : '',
    invoiceMeta?.invoiceDate ? `Date ${invoiceMeta.invoiceDate}` : '',
  ].filter(Boolean).join(' | ');

  return normalizeStockItem({
    name: String(item?.partName || item?.normalizedPartName || item?.rawDescription || '').trim(),
    sku,
    bike,
    cat,
    qty,
    min: 2,
    cost: buyPrice,
    sellPrice,
    location: String(item?.binLocationSuggestion || '').trim(),
    manufacturer: String(item?.manufacturer || '').trim(),
    companyBrand: String(item?.companyBrand || item?.manufacturer || '').trim(),
    supplierPartNo: String(item?.supplierPartNo || '').trim(),
    fitmentModels: fits,
    fits,
    notes,
    lastPurchaseRate: buyPrice,
    lastSellPrice: sellPrice,
    aliases: uniqStrings([item?.rawDescription, item?.partName, item?.normalizedPartName]),
    lineNo,
  });
}

function normalizeBikeLabelFromAgent(item) {
  const bikeBrand = String(item?.bikeBrand || '').trim();
  if (bikeBrand) return bikeBrand;
  const firstFit = Array.isArray(item?.fitmentModels) ? item.fitmentModels.find(Boolean) : '';
  return String(firstFit || 'Generic').trim();
}

function normalizeCategoryLabelFromAgent(item) {
  const variant = String(item?.variantSubtype || item?.partName || '').toLowerCase();
  if (variant.includes('brake')) return 'Brakes';
  if (variant.includes('filter') || variant.includes('oil')) return 'Filters/Fluids';
  if (variant.includes('shock') || variant.includes('belt') || variant.includes('tyre')) return 'Tyres/Belts';
  if (variant.includes('switch') || variant.includes('meter') || variant.includes('cdi')) return 'Electrical';
  if (variant.includes('light') || variant.includes('lamp')) return 'Lights';
  return 'Electrical';
}

function findStockMatchForAgentImport(item) {
  const supplierPartNo = normalizeAlphaNum(item.supplierPartNo);
  if (supplierPartNo) {
    const exactPart = stock.find(stockItem => normalizeAlphaNum(stockItem.supplierPartNo) === supplierPartNo);
    if (exactPart) return exactPart;
  }
  const exactSku = stock.find(stockItem => String(stockItem.sku || '').trim().toUpperCase() === item.sku);
  if (exactSku) return exactSku;
  return null;
}

function restockFromAgentImport(existing, incoming, context = {}) {
  const stamp = nowISO();
  const prevBuy = parseFloat(existing.cost || 0) || 0;
  const prevSell = parseFloat(existing.sellPrice || 0) || 0;
  existing.qty = Math.max(0, parseFloat(existing.qty || 0) || 0) + incoming.qty;
  existing.updatedAt = stamp;
  existing.previousBuyPrice = incoming.cost && incoming.cost !== prevBuy ? prevBuy : (existing.previousBuyPrice || 0);
  existing.previousSellPrice = incoming.sellPrice && incoming.sellPrice !== prevSell ? prevSell : (existing.previousSellPrice || 0);
  if (incoming.cost) existing.cost = incoming.cost;
  if (incoming.sellPrice) existing.sellPrice = incoming.sellPrice;
  existing.lastPurchaseRate = incoming.cost || existing.lastPurchaseRate || existing.cost || 0;
  existing.lastSellPrice = incoming.sellPrice || existing.lastSellPrice || existing.sellPrice || 0;
  existing.manufacturer = incoming.manufacturer || existing.manufacturer || existing.companyBrand || '';
  existing.companyBrand = incoming.companyBrand || existing.companyBrand || existing.manufacturer || '';
  existing.supplierPartNo = incoming.supplierPartNo || existing.supplierPartNo || '';
  existing.location = existing.location || incoming.location || '';
  existing.fitmentModels = uniqStrings([...(existing.fitmentModels || existing.fits || []), ...(incoming.fitmentModels || incoming.fits || [])]);
  existing.fits = uniqStrings([...(existing.fits || []), ...(incoming.fitmentModels || incoming.fits || [])]);
  existing.aliases = uniqStrings([...(existing.aliases || []), incoming.name, ...(incoming.aliases || [])]);
  existing.notes = uniqStrings([existing.notes, incoming.notes]).join(' | ');

  stockMovements.unshift({
    id: nextId('sm'),
    type: 'purchase',
    stockId: existing.id,
    sku: existing.sku,
    qty: incoming.qty,
    rate: incoming.cost || 0,
    amount: (incoming.cost || 0) * incoming.qty,
    source: 'agent-json-import',
    sourceId: context.invoiceLabel || '',
    supplier: '',
    createdAt: stamp,
  });
  logAction('update', 'stock', existing.id, {
    source: 'agent-json-import',
    qty: existing.qty,
    addedQty: incoming.qty,
    supplierPartNo: existing.supplierPartNo || '',
  });
}
