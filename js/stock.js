// ═══════════════════════════════════════════════════════
//  Stock module
// ═══════════════════════════════════════════════════════

let stF = { q: '', cat: '', st: '', bike: '', sort: 'name' };
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
  const msg = `Namaskar,\n\nMujhe yeh part chahiye:\nSKU: ${s.sku}\nName: ${s.name}\nQty: ${s.min * 2} pcs\n\n${getGarageProfile().shortName}, ${getGarageProfile().city}\nPlease confirm availability & price.`;
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

// Shelf reconciliation (Phase 4, 2026-06-12): negative/drifted stock is
// tolerated by design (scan in/out is reference data, not invoice-linked).
// "Set Count" lets staff walk the shelves, scan a bin, type the real count,
// and reset qty with an audited 'recount' movement — turning tolerated drift
// into managed drift.
function setStockActualCount(id, rawValue) {
  if (!requireCloudWriteAccess('correct stock count')) return;
  const s = stock.find(x => x.id === id && isLiveStockItem(x));
  if (!s) return;
  const value = rawValue === null || rawValue === undefined || String(rawValue).trim() === ''
    ? prompt(`Actual shelf count for ${s.name} (current: ${s.qty})`, String(Math.max(0, s.qty)))
    : rawValue;
  if (value === null) return;
  const counted = parseInt(value, 10);
  if (!Number.isFinite(counted) || counted < 0) { toast('Enter a valid count'); return; }
  const delta = counted - s.qty;
  if (!delta) { toast(`${s.name} already at ${counted}`); return; }
  const stamp = nowISO();
  s.qty = counted;
  s.updatedAt = stamp;
  stockMovements.push(normalizeStockMovement({
    id: nextId('mv'),
    stockId: s.id,
    sku: s.sku,
    type: 'recount',
    qty: delta,
    source: 'shelf-recount',
    createdAt: stamp,
    updatedAt: stamp,
  }));
  logAction('update', 'stock', id, { qty: counted, delta, source: 'shelf-recount' });
  saveAll({ domain: 'stock' });
  renderStock();
  toast(`${s.name} corrected → ${counted} (${delta > 0 ? '+' : ''}${delta})`);
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
        <button class="btn btn-g btn-sm" onclick="setStockActualCount('${s.id}'); renderStockReceiveFound(stock.find(x=>x.id==='${s.id}'))">Set Count</button>
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

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
