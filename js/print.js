// ═══════════════════════════════════════════════════════
//  Print / QR Stickers + Invoice
// ═══════════════════════════════════════════════════════

let printSelectionQty = {};
let recentPrintPartIds = [];
const BRAND_LOGO_SRC = new URL('assets/jalasai-logo-premium.jpg', window.location.href).href;

function filterPrintSearch(v) {
  printFilter.q = v || '';
  if (typeof debouncePerf === 'function') {
    debouncePerf('print-search', renderPrintManager, 220);
  } else {
    renderPrintManager();
  }
}
function filterPrintCat(v)    { printFilter.cat = v || ''; renderPrintManager(); }
function filterPrintBike(v)   { printFilter.bike = v || ''; renderPrintManager(); }
function filterPrintStatus(v) { printFilter.status = v || ''; renderPrintManager(); }

function qrImageUrl(text, size) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&ecc=M&data=${encodeURIComponent(text)}`;
}

// Phase 4 (2026-06-12): sticker QR codes are now drawn with the bundled,
// offline `QRGen` encoder as the PRIMARY renderer. The shop prints labels at
// the counter on mobile data that often drops, and the old primary path hit
// api.qrserver.com — which broke printing offline and leaked every SKU to a
// third party. The network image is kept only as an optional enhancement.
function drawStickerQR(canvas, payload, size) {
  if (!canvas) return false;
  canvas.width = size;
  canvas.height = size;
  try {
    QRGen.draw(canvas, payload);
    return stickerCanvasHasQRData(canvas);
  } catch (_) {
    return false;
  }
}

function stickerCanvasHasQRData(canvas) {
  try {
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let dark = 0;
    const sampleEvery = 4;
    for (let i = 0; i < data.length; i += sampleEvery * 4) {
      if (data[i] < 80 && data[i + 1] < 80 && data[i + 2] < 80) dark++;
    }
    const samples = Math.ceil((width * height) / sampleEvery);
    return dark / samples > 0.12;
  } catch (_) {
    return true;
  }
}

function fallbackStickerQR(canvasId, payload, size) {
  const canvas = document.getElementById(canvasId);
  drawStickerQR(canvas, payload, size);
}

function stickerNameClass(name, sizeKey) {
  const len = String(name || '').trim().length;
  if (sizeKey === 'a4-40') {
    if (len > 44) return 'name-xxs';
    if (len > 32) return 'name-xs';
  }
  if (len > 38) return 'name-xs';
  return '';
}

function stickerMetaHtml(item, sizeKey) {
  return `
    <div class="stk-qty">Qty:${item.qty} Min:${item.min}</div>
    ${item.location ? `<div class="stk-location">📦 ${item.location}</div>` : ''}
  `;
}

function markPartForRecentPrint(id) {
  recentPrintPartIds = [id, ...recentPrintPartIds.filter(x => x !== id)].slice(0, 50);
}

function getPrintFilteredStock() {
  const q = String(printFilter.q || '').trim().toLowerCase();
  return stock.filter(s => {
    const printed = !!s.labelPrintedAt;
    return (!q || s.name.toLowerCase().includes(q) || s.sku.toLowerCase().includes(q) || (s.location || '').toLowerCase().includes(q))
      && (!printFilter.cat || s.cat === printFilter.cat)
      && (!printFilter.bike || s.bike === printFilter.bike)
      && (!printFilter.status || (printFilter.status === 'printed' ? printed : !printed));
  });
}

function syncPrintSelection() {
  const existing = new Set(stock.map(s => s.id));
  printSelectionQty = Object.fromEntries(
    Object.entries(printSelectionQty)
      .filter(([id]) => existing.has(id))
      .map(([id, qty]) => [id, Math.max(1, parseInt(qty, 10) || 1)])
  );
}

function selectedPrintPartIds() {
  syncPrintSelection();
  return Object.keys(printSelectionQty);
}

function selectedPrintLabelCount() {
  return Object.values(printSelectionQty).reduce((sum, qty) => sum + (parseInt(qty, 10) || 0), 0);
}

function expandedPrintItems() {
  syncPrintSelection();
  return stock.flatMap(item => {
    const qty = parseInt(printSelectionQty[item.id] || 0, 10) || 0;
    return Array.from({ length: qty }, (_, idx) => ({
      ...item,
      __printKey: `${item.id}-${idx + 1}`,
    }));
  });
}

function togglePrintSelect(id, checked) {
  syncPrintSelection();
  if (checked) {
    if (!printSelectionQty[id]) printSelectionQty[id] = 1;
  } else {
    delete printSelectionQty[id];
  }
  renderPrintManager();
}

function togglePrintSelectAll(checked) {
  const filtered = getPrintFilteredStock().map(s => s.id);
  if (checked) {
    filtered.forEach(id => {
      if (!printSelectionQty[id]) printSelectionQty[id] = 1;
    });
  } else {
    filtered.forEach(id => { delete printSelectionQty[id]; });
  }
  renderPrintManager();
}

function setPrintQty(id, value) {
  syncPrintSelection();
  const raw = String(value ?? '').trim();
  const qty = parseInt(raw, 10) || 0;
  if (qty <= 0) {
    delete printSelectionQty[id];
  } else {
    printSelectionQty[id] = qty;
  }
  renderPrintManager();
}

function selectAllPrintFiltered() {
  const filtered = getPrintFilteredStock().map(s => s.id);
  filtered.forEach(id => {
    if (!printSelectionQty[id]) printSelectionQty[id] = 1;
  });
  renderPrintManager();
}

function clearPrintSelected() {
  printSelectionQty = {};
  renderPrintManager();
}

function selectPrintLastAdded() {
  const ids = recentPrintPartIds.filter(id => stock.some(s => s.id === id));
  if (!ids.length) {
    toast('No recent parts available for quick print');
    return;
  }
  printSelectionQty = Object.fromEntries(ids.map(id => [id, 1]));
  renderPrintManager();
}

function renderPrintPreview(items) {
  const wrap = document.getElementById('print-sheet-wrap');
  if (!wrap) return;
  if (!items.length) {
    wrap.innerHTML = '<div style="text-align:center;color:#888;padding:48px 20px;">Select labels from the left to preview them here.</div>';
    return;
  }
  const perPage = 40;
  const pages = Math.ceil(items.length / perPage);
  wrap.innerHTML = '';
  for (let page = 0; page < pages; page++) {
    const chunk = items.slice(page * perPage, (page + 1) * perPage);
    const sheet = document.createElement('div');
    sheet.className = 'a4-sheet';
    const cells = [];
    for (let i = 0; i < perPage; i++) {
      const s = chunk[i];
      if (!s) {
        cells.push('<div class="label-empty"></div>');
        continue;
      }
      const payload = buildPartQRPayload(s.sku);
      const qrId = `qr-${s.__printKey || s.id}`;
      cells.push(`
        <div class="sticker sheet-sticker">
          <div class="stk-qr-col">
            <canvas id="${qrId}" class="a4-qr-canvas" data-payload="${payload}" width="200" height="200"></canvas>
          </div>
          <div class="stk-text-col">
            <div class="stk-bike">${s.bike}</div>
            <div class="stk-name ${stickerNameClass(s.name, 'a4-40')}">${s.name}</div>
            <div class="stk-sku">${s.sku}</div>
            ${stickerMetaHtml(s, 'a4-40')}
          </div>
        </div>`);
    }
    sheet.innerHTML = cells.join('');
    wrap.appendChild(sheet);
  }
  requestAnimationFrame(() => {
    items.forEach(s => {
      drawLabelQRCodeFromAppSource(document.getElementById(`qr-${s.__printKey || s.id}`), buildPartQRPayload(s.sku));
    });
  });
}

async function ensurePrintQRCodesReady() {
  const canvases = [...document.querySelectorAll('#print-sheet-wrap canvas.a4-qr-canvas')];
  if (!canvases.length) return;
  await Promise.all(canvases.map(canvas =>
    drawLabelQRCodeFromAppSource(canvas, canvas.dataset.payload || '')
  ));
}

function drawLabelQRCodeFromAppSource(canvas, payload) {
  if (!canvas) return Promise.resolve();
  const px = canvas.width || 200;
  // Local-first: draw with the offline encoder. This always works without a
  // network round-trip, so label sheets print instantly and offline.
  if (drawStickerQR(canvas, payload, px)) return Promise.resolve();
  // Only if the local encoder somehow failed, try the network QR image.
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, px, px);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, px, px);
        ctx.drawImage(img, 0, 0, px, px);
      } catch (_) {}
      resolve();
    };
    img.onerror = () => resolve();
    img.src = qrImageUrl(payload, px);
  });
}

function renderPrintManager() {
  syncPrintSelection();
  const filtered = getPrintFilteredStock();
  const selectedIds = selectedPrintPartIds();
  const selectedLabelCount = selectedPrintLabelCount();
  const selectedPartCount = selectedIds.length;

  const bikeSel = document.getElementById('print-bike-filter');
  if (bikeSel) {
    const cur = bikeSel.value;
    const bikes = [...new Set(stock.map(s => s.bike))].sort();
    bikeSel.innerHTML = '<option value="">All bikes</option>' + bikes.map(b => `<option value="${b}"${b===cur?' selected':''}>${b}</option>`).join('');
    bikeSel.value = cur;
  }

  const tbody = document.getElementById('print-stock-tbody');
  if (tbody) {
    tbody.innerHTML = filtered.length ? filtered.map(s => `
      <tr>
        <td style="text-align:center;"><input type="checkbox" ${selectedIds.includes(s.id) ? 'checked' : ''} onchange="togglePrintSelect('${s.id}', this.checked)"></td>
        <td><span class="sku-tag">${s.sku}</span></td>
        <td style="font-weight:500;">${s.name}${s.location ? `<div style="font-size:11px;color:var(--mut);margin-top:3px;">📦 ${s.location}</div>` : ''}</td>
        <td><input class="finp" type="number" min="1" value="${selectedIds.includes(s.id) ? (printSelectionQty[s.id] || 1) : ''}" oninput="setPrintQty('${s.id}', this.value)" placeholder="0" style="width:78px;padding:6px 8px;font-size:12px;"></td>
        <td>${s.bike}<div style="font-size:11px;color:var(--mut);margin-top:3px;">${s.labelPrintedAt ? 'Printed' : 'New'}</div></td>
      </tr>`).join('') : '<tr><td colspan="5" style="padding:22px;text-align:center;color:var(--mut);">No matching parts found.</td></tr>';
  }

  const selectAll = document.getElementById('print-select-all');
  if (selectAll) {
    selectAll.checked = !!filtered.length && filtered.every(s => selectedIds.includes(s.id));
    selectAll.indeterminate = filtered.some(s => selectedIds.includes(s.id)) && !selectAll.checked;
  }

  const summary = document.getElementById('print-preview-summary');
  if (summary) summary.textContent = `${filtered.length} filtered · ${selectedPartCount} parts selected · ${selectedLabelCount} labels`;
  const count = document.getElementById('sticker-count');
  if (count) count.textContent = `${selectedLabelCount} labels`;
  renderPrintPreview(expandedPrintItems());
}

async function printStickerSheet() {
  const selectedItems = stock.filter(s => selectedPrintPartIds().includes(s.id));
  if (!selectedItems.length) {
    toast('Select at least one label to print');
    return;
  }
  const stamp = nowISO();
  selectedItems.forEach(s => { s.labelPrintedAt = stamp; markPartForRecentPrint(s.id); });
  saveAll({ domain: 'stock' });
  renderPrintManager();
  await ensurePrintQRCodesReady();
  // Inject landscape @page for sticker printing; removed after print
  const styleTag = document.createElement('style');
  styleTag.id = 'sticker-page-style';
  styleTag.textContent = '@page { size: A4 landscape; margin: 0; }';
  document.head.appendChild(styleTag);

  document.body.classList.add('print-stickers');
  const cleanup = () => {
    document.body.classList.remove('print-stickers');
    const s = document.getElementById('sticker-page-style');
    if (s) s.remove();
    window.removeEventListener('afterprint', cleanup);
    window.removeEventListener('focus', cleanup);
    document.removeEventListener('visibilitychange', cleanupOnVisible);
  };
  const cleanupOnVisible = () => {
    if (!document.hidden) cleanup();
  };
  window.addEventListener('afterprint', cleanup);
  window.addEventListener('focus', cleanup);
  document.addEventListener('visibilitychange', cleanupOnVisible);
  window.print();
  setTimeout(cleanup, 2000);
}

// ─── Invoice preview + print ──────────────────────────────
let _currentInvoiceJobId = null;

function invoicePartSnapshot(part) {
  const stockItem = stock.find(item => item.id === part.id);
  const manufacturer = part.manufacturer || stockItem?.manufacturer || stockItem?.companyBrand || '';
  const supplierPartNo = part.supplierPartNo || stockItem?.supplierPartNo || '';
  const buyPrice = parseFloat(part.buyPrice ?? stockItem?.cost ?? 0) || 0;
  const sellPrice = parseFloat(part.cost ?? stockItem?.sellPrice ?? stockItem?.cost ?? 0) || 0;
  return { manufacturer, supplierPartNo, buyPrice, sellPrice };
}

function shareInvoiceWA() {
  if (_currentInvoiceJobId) sendBill(_currentInvoiceJobId);
}

function openInvoice(id, options = {}) {
  const { backTo = null, skipHistory = false } = options;
  _currentInvoiceJobId = id;
  const j = jobs.find(x => x.id === id);
  if (!j) return;
  if (!skipHistory && typeof backTo === 'function') pushModalHistory('m-invoice', backTo);
  const subtotal = jobSubtotal(j);
  const discount = jobDiscountAmount(j);
  const total = jobTotal(j);
  const paid  = jobPaid(j);
  const due   = jobDue(j);
  const advance = jobAdvance(j);
  const stamp = j.doneAt || `${j.date}T${j.time || '00:00'}`;

  document.getElementById('invoice-content').innerHTML = `
    <div class="inv-header">
      <div class="inv-brandwrap">
        <img class="inv-logo" src="${BRAND_LOGO_SRC}" alt="${getGarageProfile().name}">
        <div>
          <div class="inv-brand">${getGarageProfile().name}</div>
          <div class="inv-addr">${getGarageProfile().addressLine}</div>
          <div class="inv-addr">Mo. ${getGarageProfile().phone}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div class="inv-num">Invoice #${j.invoiceNo || j.id}</div>
        <div class="inv-date">Date: ${fmtDate(stamp)} · ${new Date(stamp).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })}</div>
        ${j.delivery ? `<div class="inv-date">Delivery: ${fmtDate(j.delivery)}</div>` : ''}
      </div>
    </div>

    <div class="inv-divider"></div>
    <div class="inv-grid2" style="margin-bottom:12px;">
      <div>
        <div class="inv-lbl">BILL TO</div>
        <div class="inv-val">${j.cust}</div>
        <div class="inv-sub">${j.phone}</div>
      </div>
      <div>
        <div class="inv-lbl">VEHICLE</div>
        <div class="inv-val">${j.veh}</div>
        <div class="inv-sub">Reg: ${j.vno||'—'}</div>
        ${j.odo ? `<div class="inv-sub">Odometer: ${parseInt(j.odo).toLocaleString('en-IN')} km</div>` : ''}
        <div class="inv-sub">Mechanic: ${mechanicLabel(jobMechanicIds(j))}</div>
      </div>
    </div>
    <div class="inv-divider"></div>

    <div class="inv-lbl" style="margin-bottom:6px;">WORK DONE</div>
    <div class="inv-desc">${j.prob}</div>

    ${j.partsUsed && j.partsUsed.length ? `
    <table class="inv-table">
      <thead><tr><th>#</th><th>Part Name</th><th>SKU</th><th>Qty</th><th>Rate ₹</th><th>Amount ₹</th></tr></thead>
      <tbody>
        ${j.partsUsed.map((p,i)=>{
          const meta = invoicePartSnapshot(p);
          return `<tr>
            <td>${i+1}</td>
            <td>
              <div>${p.displayName || p.name}</div>
            </td>
            <td style="font-family:monospace;font-size:10px;">${p.sku}</td>
            <td>${p.qty}</td>
            <td>${meta.sellPrice}</td>
            <td>${meta.sellPrice * p.qty}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : ''}

    <div class="inv-divider"></div>
    <div class="inv-totals">
      <div class="inv-tot-row"><span>Labour Charges</span><span>${fmtMoney(j.lab||0)}</span></div>
      <div class="inv-tot-row"><span>Parts & Materials</span><span>${fmtMoney(j.prt||0)}</span></div>
      ${discount > 0 ? `<div class="inv-tot-row"><span>Discount</span><span style="color:#c0392b;">- ${fmtMoney(discount)}</span></div>` : ''}
      ${discount > 0 ? `<div class="inv-tot-row"><span>Subtotal</span><span>${fmtMoney(subtotal)}</span></div>` : ''}
      <div class="inv-tot-row inv-grand"><span>TOTAL</span><span>${fmtMoney(total)}</span></div>
      ${paid > 0 ? `<div class="inv-tot-row" style="color:#00a86b;"><span>Paid (${j.payMethod||'—'})</span><span>${fmtMoney(paid)}</span></div>` : ''}
      ${due > 0
        ? `<div class="inv-tot-row" style="color:#c0392b;font-weight:700;border-top:2px solid #c0392b;padding-top:6px;"><span>BALANCE DUE</span><span>${fmtMoney(due)}</span></div>`
        : advance > 0
          ? `<div class="inv-tot-row" style="color:#00a86b;font-weight:700;border-top:2px solid #00a86b;padding-top:6px;"><span>ADVANCE ON ACCOUNT</span><span>${fmtMoney(advance)}</span></div>`
          : `<div class="inv-tot-row" style="color:#00a86b;"><span>PAID IN FULL ✓</span><span></span></div>`}
    </div>
    <div class="inv-divider"></div>
    <div style="font-size:10px;color:var(--mut);text-align:center;margin-top:8px;line-height:1.6;">
      Thank you for choosing ${getGarageProfile().name}<br>
      No warranty on used/third-party parts · Disputes accepted within 7 days
    </div>`;

  const ref = document.getElementById('invoice-reference-photo');
  if (ref) {
    const refPhotos = normalizePhotoArray(j.invoicePhotos || j.invoicePhoto || j.photos || j.photo || '');
    ref.innerHTML = refPhotos.length
      ? `<div style="background:var(--sur2);border:1px solid var(--bor);border-radius:10px;padding:12px;">
          <div style="font-family:var(--fh);font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Photo Reference</div>
          <div style="font-size:11px;color:var(--mut);margin-bottom:8px;">Saved for system reference and WhatsApp only. Not included in print/PDF.</div>
          ${typeof photoGalleryMarkup === 'function' ? photoGalleryMarkup('', refPhotos, 'Invoice Photo Reference', '') : (typeof photoPreviewMarkup === 'function' ? photoPreviewMarkup(refPhotos[0], 'Invoice Photo Reference') : `<img src="${refPhotos[0]}" class="clickable-photo" style="max-width:100%;max-height:200px;border-radius:8px;" onclick="openImageViewer('${refPhotos[0]}','Invoice Photo Reference')">`)}
        </div>`
      : '';
  }

  const adminActions = document.getElementById('invoice-admin-actions');
  if (adminActions) {
    adminActions.innerHTML = isAdminUser()
      ? `<button class="btn btn-g btn-sm" onclick="openInvoiceEdit(_currentInvoiceJobId)">Edit</button> <button class="btn btn-r btn-sm" onclick="removeInvoice(_currentInvoiceJobId)">Remove</button>`
      : '';
  }

  openM('m-invoice');
}

function printInvoice() {
  const content = document.getElementById('invoice-content').innerHTML;
  const win = window.open('', '_blank', 'width=800,height=700');
  if (!win) { toast('Popup blocked — allow popups for this site'); return; }
  win.document.write(`<!DOCTYPE html><html><head>
<meta charset="UTF-8"><title>Invoice — JalaSai</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Helvetica Neue',Arial,sans-serif;padding:24px;color:#222;font-size:13px;max-width:720px;margin:0 auto;background:#fff;}
  .inv-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:8px;}
  .inv-brandwrap{display:flex;align-items:flex-start;gap:12px;}
  .inv-logo{width:140px;height:64px;object-fit:cover;object-position:center;border-radius:10px;border:1px solid #ddd;}
  .inv-brand{font-size:22px;font-weight:800;color:#d86f18;letter-spacing:1px;}
  .inv-addr{font-size:11px;color:#666;margin-top:2px;}
  .inv-num{font-size:16px;font-weight:700;}
  .inv-date{font-size:12px;color:#666;}
  .inv-divider{border-top:1.5px solid #f0b070;margin:12px 0;}
  .inv-grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px;}
  .inv-lbl{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:3px;}
  .inv-val{font-size:14px;font-weight:700;}
  .inv-sub{font-size:11px;color:#666;}
  .inv-desc{background:#f8f8f8;padding:10px 12px;border-radius:6px;font-size:13px;margin-bottom:12px;}
  .inv-photo{width:100%;max-height:200px;object-fit:cover;border-radius:8px;margin:10px 0;}
  .inv-table{width:100%;border-collapse:collapse;margin:10px 0;font-size:11px;}
  .inv-table th{background:#f0f0f0;padding:6px 8px;text-align:left;font-size:10px;}
  .inv-table td{padding:5px 8px;border-bottom:1px solid #eee;}
  .inv-totals{max-width:300px;margin-left:auto;}
  .inv-tot-row{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;border-bottom:1px solid #eee;}
  .inv-grand{font-size:18px;font-weight:800;border-top:2px solid #222!important;margin-top:4px;padding-top:8px!important;}
  @media print{body{padding:6px;}@page{margin:10mm;}.inv-logo{width:128px;height:58px;}}
</style></head><body>${content}</body></html>`);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 500);
}
