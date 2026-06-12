// ═══════════════════════════════════════════════════════
//  Scanner — shared across scan page, stock receive, job parts
// ═══════════════════════════════════════════════════════

let scannerRunning = false;
let videoStream = null;
let scanInterval = null;
let jsQRLoaded = false;
let zxingLoaded = false;
let zxingReader = null;
let zxingControls = null;
let scanFallbackTimer = null;
let recentScannedPartIds = [];
let activeScannerContext = 'page';

const SCANNER_CONTEXTS = {
  page: {
    btn: 'scan-btn',
    reader: 'reader',
    status: 'scan-status',
    manualInput: 'manual-search',
    manualResults: 'manual-results',
    emptyMessage: 'Camera stopped. Press Start Camera to scan.',
    onMatch: s => showScanResult(s),
    onMissing: raw => {
      const ms = document.getElementById('manual-search');
      if (ms) {
        ms.value = raw || '';
        manualSearch(raw || '');
      }
      toast('QR: ' + (raw || 'Unknown') + ' — not found in stock');
    },
  },
  stock: {
    btn: 'stock-scan-btn',
    reader: 'stock-scan-reader',
    status: 'stock-scan-status',
    manualInput: 'stock-manual-search',
    manualResults: 'stock-manual-results',
    emptyMessage: 'Camera stopped. Press Start Camera to scan.',
    onMatch: s => renderStockReceiveFound(s),
    onMissing: raw => renderStockReceiveFound(null, raw),
  },
  job: {
    btn: 'job-parts-scan-btn',
    reader: 'job-parts-reader',
    status: 'job-parts-status',
    manualInput: 'job-parts-search',
    manualResults: 'job-parts-results',
    emptyMessage: 'Camera stopped. Press Start Camera to scan.',
    onMatch: s => renderJobPartFound(s),
    onMissing: raw => {
      const box = document.getElementById('job-parts-found');
      if (box) {
        box.innerHTML = `<div class="quick-card"><div style="font-family:var(--fh);font-size:15px;font-weight:700;">Part not found</div><div style="font-size:12px;color:var(--mut);margin-top:4px;">Scanned: ${extractScannedSku(raw) || raw || '—'}</div></div>`;
      }
    },
  },
};

function getScannerContext() {
  return SCANNER_CONTEXTS[activeScannerContext] || SCANNER_CONTEXTS.page;
}

function scannerEl(key) {
  const id = getScannerContext()[key];
  return id ? document.getElementById(id) : null;
}

function setScannerContext(name = 'page') {
  activeScannerContext = SCANNER_CONTEXTS[name] ? name : 'page';
}

function rememberRecentScan(id) {
  recentScannedPartIds = [id, ...recentScannedPartIds.filter(x => x !== id)].slice(0, 12);
}

function renderRecentScans(mode = activeScannerContext) {
  const targetId = mode === 'stock' ? 'stock-recent-scans' : mode === 'job' ? 'job-recent-scans' : '';
  const el = targetId ? document.getElementById(targetId) : null;
  if (!el) return;
  const items = recentScannedPartIds.map(id => stock.find(s => s.id === id)).filter(Boolean);
  el.innerHTML = items.length
    ? `<div class="recent-chip-row">${items.map(s => `<button class="recent-chip" type="button" onclick="handleContextPartPick('${s.id}')">${s.sku}</button>`).join('')}</div>`
    : '<div style="font-size:12px;color:var(--mut);">No recent scans yet.</div>';
}

function handleContextPartPick(id) {
  const s = stock.find(x => x.id === id);
  if (!s) return;
  getScannerContext().onMatch?.(s);
}

function toggleScanner() {
  if (scannerRunning) stopScanner();
  else startScanner();
}

function startScanner() {
  const btn = scannerEl('btn');
  const status = scannerEl('status');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (status) status.innerHTML = '<div style="color:var(--dan);font-size:13px;">Camera not supported on this device/browser.<br>Use manual search below.</div>';
    return;
  }
  if (btn) {
    btn.textContent = 'Stop Camera';
    btn.className = 'btn btn-r';
  }
  if (status) status.innerHTML = '<div style="color:var(--warn);font-size:13px;">Requesting camera permission…</div>';

  navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
  }).then(stream => {
    videoStream = stream;
    scannerRunning = true;
    const reader = scannerEl('reader');
    if (reader) {
      reader.innerHTML = `<video id="${activeScannerContext}-scan-video" autoplay playsinline muted style="width:100%;border-radius:12px;display:block;max-height:360px;"></video><canvas id="${activeScannerContext}-scan-canvas" style="display:none;"></canvas>`;
    }
    const video = document.getElementById(`${activeScannerContext}-scan-video`);
    if (!video) return;
    video.srcObject = stream;
    video.play().catch(() => {});
    if (status) status.innerHTML = '<div style="color:var(--acc);font-size:13px;">📷 Camera on — point at QR sticker on bin</div>';
    video.addEventListener('loadedmetadata', () => startDecoding(video));
    video.addEventListener('error', () => {
      if (status) status.innerHTML = '<div style="color:var(--dan);font-size:13px;">Video error. Refresh and try again.</div>';
    });
  }).catch(err => {
    stopScanner();
    const msg = err.name === 'NotAllowedError'
      ? 'Camera permission denied. Allow in browser settings.'
      : err.name === 'NotFoundError'
        ? 'No camera found on this device.'
        : 'Camera error: ' + err.message;
    if (status) status.innerHTML = `<div style="color:var(--dan);font-size:13px;">${msg}<br><br>Use manual search below.</div>`;
  });
}

async function startDecoding(video) {
  if ('BarcodeDetector' in window) {
    let detector;
    let formats = ['qr_code', 'code_39', 'code_128'];
    try {
      if (typeof BarcodeDetector.getSupportedFormats === 'function') {
        const supported = await BarcodeDetector.getSupportedFormats();
        formats = formats.filter(f => supported.includes(f));
      }
      if (!formats.length) throw new Error('No supported scan formats');
      detector = new BarcodeDetector({ formats });
    } catch (_) {
      startJsQRDecoding(video);
      return;
    }

    const statusEl = scannerEl('status');
    if (statusEl) statusEl.innerHTML = `<div style="color:var(--acc);font-size:12px;">📷 Auto-detecting ${formats.join(', ')}…</div>`;

    clearTimeout(scanFallbackTimer);
    scanFallbackTimer = setTimeout(() => {
      if (scannerRunning) {
        if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
        startZXingDecoding(video);
      }
    }, 4000);

    scanInterval = setInterval(async () => {
      if (!scannerRunning || video.readyState < 2) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length > 0) handleScanDecode(codes[0].rawValue);
      } catch (_) {}
    }, 400);
  } else {
    startZXingDecoding(video);
  }
}

function loadZXingBrowser() {
  if (window.ZXingBrowser) {
    zxingLoaded = true;
    return Promise.resolve(window.ZXingBrowser);
  }
  if (zxingLoaded) return Promise.resolve(window.ZXingBrowser);
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('zxing-browser-lib');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.ZXingBrowser), { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const s = document.createElement('script');
    s.id = 'zxing-browser-lib';
    s.src = 'https://unpkg.com/@zxing/browser@0.1.5/umd/zxing-browser.min.js';
    s.onload = () => {
      zxingLoaded = true;
      resolve(window.ZXingBrowser);
    };
    s.onerror = () => reject(new Error('ZXing scanner failed to load'));
    document.head.appendChild(s);
  });
}

async function startZXingDecoding(video) {
  const statusEl = scannerEl('status');
  if (statusEl) statusEl.innerHTML = '<div style="color:var(--warn);font-size:12px;">Loading advanced scanner…</div>';
  try {
    const ZXingBrowser = await loadZXingBrowser();
    if (!scannerRunning) return;
    if (!ZXingBrowser || !ZXingBrowser.BrowserMultiFormatReader) {
      startJsQRDecoding(video);
      return;
    }
    zxingReader = new ZXingBrowser.BrowserMultiFormatReader();
    if (statusEl) statusEl.innerHTML = '<div style="color:var(--acc);font-size:12px;">📷 Scanning with advanced barcode/QR reader…</div>';
    if (typeof zxingReader.decodeFromVideoElement === 'function') {
      Promise.resolve(zxingReader.decodeFromVideoElement(video, result => {
        if (!scannerRunning) return;
        if (result && (result.getText || result.text)) {
          handleScanDecode(result.getText ? result.getText() : result.text);
        }
      })).then(ctrl => { zxingControls = ctrl || null; }).catch(() => startJsQRDecoding(video));
      return;
    }
    startJsQRDecoding(video);
  } catch (_) {
    startJsQRDecoding(video);
  }
}

function startJsQRDecoding(video) {
  const statusEl = scannerEl('status');
  if (!jsQRLoaded) {
    if (statusEl) statusEl.innerHTML = '<div style="color:var(--warn);font-size:12px;">Loading QR decoder…</div>';
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
    s.onload = () => { jsQRLoaded = true; runJsQRLoop(video); };
    s.onerror = () => {
      if (statusEl) statusEl.innerHTML = '<div style="color:var(--warn);font-size:12px;">Camera on. QR decoder unavailable offline.<br>Use manual search below.</div>';
    };
    document.head.appendChild(s);
  } else {
    runJsQRLoop(video);
  }
}

function runJsQRLoop(video) {
  const statusEl = scannerEl('status');
  if (statusEl) statusEl.innerHTML = '<div style="color:var(--acc);font-size:12px;">📷 Scanning with jsQR… point camera at QR code</div>';
  const canvas = document.getElementById(`${activeScannerContext}-scan-canvas`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  scanInterval = setInterval(() => {
    if (!scannerRunning || video.readyState < 2) return;
    const w = video.videoWidth || 320;
    const h = video.videoHeight || 240;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const code = window.jsQR && jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
    if (code && code.data) handleScanDecode(code.data);
  }, 350);
}

// ─── Batch scan mode (Phase 4, 2026-06-12) ──────────────
// The shop's daily stock workflow is scan-in / scan-out only. Without batch
// mode every successful scan stops the camera, so counting 10 parts means 10
// restarts. With batch mode ON the camera keeps running: in the Receive Stock
// modal each known sticker adds +1; on the Scan page each known sticker uses
// −1 (no job/price dialog). A repeat-guard ignores the same sticker for a few
// seconds so one label held in view doesn't count multiple times.
let batchScanMode = false;
let lastBatchScanSku = '';
let lastBatchScanAt = 0;
const BATCH_SCAN_SAME_SKU_COOLDOWN_MS = 2500;
const BATCH_SCAN_ANY_COOLDOWN_MS = 700;

function setBatchScanMode(checked) {
  batchScanMode = !!checked;
  document.querySelectorAll('.batch-scan-toggle').forEach(el => { el.checked = batchScanMode; });
  toast(batchScanMode ? 'Batch scan ON — camera stays running' : 'Batch scan OFF', 1600);
}

function batchScanFeedback() {
  try { navigator.vibrate?.(60); } catch (_) {}
}

function batchScanStockOut(s) {
  s.qty = Math.max(0, s.qty - 1);
  s.updatedAt = nowISO();
  partsLog.push({ part: s.name, sku: s.sku, time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), date: today() });
  logAction('update', 'stock', s.id, { qty: s.qty, delta: -1, source: 'batch-scan-out' });
  saveAll({ domain: 'stock' });
  toast(`−1 ${s.name} → ${s.qty}`, 1400);
}

function handleBatchScanMatch(s) {
  // Batch mode writes stock directly; without a cloud session fall back to
  // the normal interactive flow (which shows the sign-in prompt once).
  if (typeof cloudSessionActive !== 'undefined' && !cloudSessionActive) return false;
  const now = Date.now();
  const sameSku = s.sku === lastBatchScanSku;
  if (now - lastBatchScanAt < (sameSku ? BATCH_SCAN_SAME_SKU_COOLDOWN_MS : BATCH_SCAN_ANY_COOLDOWN_MS)) return true;
  lastBatchScanSku = s.sku;
  lastBatchScanAt = now;
  batchScanFeedback();
  rememberRecentScan(s.id);
  renderRecentScans(activeScannerContext);
  if (activeScannerContext === 'stock') {
    receivePartQty(s.id, 1);
    if (typeof renderStockReceiveFound === 'function') renderStockReceiveFound(s);
    return true;
  }
  if (activeScannerContext === 'page') {
    batchScanStockOut(s);
    return true;
  }
  return false; // job context keeps the interactive flow
}

function handleScanDecode(decoded) {
  if (!scannerRunning) return;
  const sku = extractScannedSku(decoded);
  const s = stock.find(x => x.sku.toUpperCase() === sku) ||
    stock.find(x => sku.includes(x.sku.toUpperCase()) || x.sku.toUpperCase().includes(sku));
  if (s && batchScanMode && handleBatchScanMatch(s)) return; // camera keeps running
  clearTimeout(scanFallbackTimer);
  stopScanner();
  if (!s) {
    getScannerContext().onMissing?.(sku || decoded);
    return;
  }
  rememberRecentScan(s.id);
  renderRecentScans(activeScannerContext);
  getScannerContext().onMatch?.(s);
}

function stopScanner() {
  scannerRunning = false;
  clearTimeout(scanFallbackTimer);
  scanFallbackTimer = null;
  if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
  if (zxingControls && typeof zxingControls.stop === 'function') {
    try { zxingControls.stop(); } catch (_) {}
  }
  zxingControls = null;
  if (zxingReader && typeof zxingReader.reset === 'function') {
    try { zxingReader.reset(); } catch (_) {}
  }
  zxingReader = null;
  if (videoStream) {
    videoStream.getTracks().forEach(t => t.stop());
    videoStream = null;
  }
  const btn = scannerEl('btn');
  if (btn) { btn.textContent = 'Start Camera'; btn.className = 'btn btn-p'; }
  const reader = scannerEl('reader');
  if (reader) reader.innerHTML = '';
  const status = scannerEl('status');
  if (status) status.innerHTML = `<div style="color:var(--mut);font-size:13px;">${getScannerContext().emptyMessage}</div>`;
}

function resumeScanner() { startScanner(); }

function populateScanJobs() {
  const sel = document.getElementById('scan-job');
  if (!sel) return;
  sel.innerHTML = '<option value="">Link to job (optional)</option>' +
    jobs.filter(j => isLiveJob(j) && j.status !== 'done')
      .map(j => `<option value="${j.id}">${j.id} — ${j.cust} (${j.veh})</option>`).join('');
  setScannerContext('page');
}

function showScanResult(s) {
  const jobSel = document.getElementById('scan-job')?.value || '';
  const st = stSt(s);
  const savedPrice = typeof stockSellPriceValue === 'function' ? stockSellPriceValue(s) : (parseFloat(s.sellPrice || s.cost || 0) || 0);
  document.getElementById('scan-result-body').innerHTML = `
    <div class="modal-ttl">Part Found</div>
    <div style="background:var(--sur2);border-radius:8px;padding:14px;margin-bottom:12px;">
      <div style="font-family:var(--fh);font-size:18px;font-weight:700;margin-bottom:4px;">${s.name}</div>
      <code class="sku-tag" style="display:inline-block;margin-bottom:8px;">${s.sku}</code>
      ${normalizePhotoArray(s.photos || s.photo || '').length ? `<div style="margin-bottom:8px;">${photoThumbWithCount(s.photos || s.photo || '', 'Stock Photo Reference')}</div>` : ''}
      ${s.location ? `<div style="font-size:12px;color:var(--mut);margin-bottom:6px;">📦 ${s.location}</div>` : ''}
      <div style="display:flex;gap:16px;font-size:13px;flex-wrap:wrap;">
        <span>Stock: <b style="color:${st==='ok'?'var(--acc)':'var(--dan)'};">${s.qty}</b></span>
        <span style="color:var(--mut)">Min: ${s.min}</span>
        <span style="color:var(--mut)">Buy: ${fmtMoney(s.cost)}</span>
        <span style="color:var(--acc2)">Sell: ${fmtMoney(savedPrice)}</span>
      </div>
    </div>
    ${s.qty > 0 ? `
      <div class="frow"><label class="flbl">Link to job</label>
        <select class="fsel" id="sr-job">
          <option value="">No job</option>
          ${jobs.filter(j=>isLiveJob(j) && j.status!=='done').map(j=>`<option value="${j.id}"${j.id===jobSel?' selected':''}>${j.id} — ${j.cust}</option>`).join('')}
        </select>
      </div>
      <div class="frow"><label class="flbl">Saved price</label>
        <button class="btn btn-p btn-sm" type="button" onclick="const input=document.getElementById('sr-manual-price'); if(input){ input.value=''; input.focus(); }">${fmtMoney(savedPrice)}</button>
      </div>
      <div class="frow"><label class="flbl">Manual price</label>
        <input class="finp" id="sr-manual-price" type="number" inputmode="decimal" min="0" step="0.01" placeholder="Add manually">
      </div>
      <div class="frow"><label class="flbl">Qty to use</label>
        <input class="finp" id="sr-qty" type="number" value="1" min="1" max="${s.qty}" style="width:100px;">
      </div>
      <div class="mftr">
        <button class="btn btn-p" style="flex:1" onclick="confirmUse('${s.id}')">Use Part (Stock −)</button>
      </div>` :
      `<div style="background:rgba(255,71,87,.12);border:1px solid rgba(255,71,87,.3);border-radius:8px;padding:12px;text-align:center;color:var(--dan);font-weight:700;">OUT OF STOCK</div>
      <div style="font-size:12px;color:var(--mut);text-align:center;margin-top:6px;">Supplier: ${s.sup}</div>
      <button class="btn btn-g" style="margin-top:10px;width:100%;" onclick="orderPart('${s.id}');closeM('m-scan-result')">📱 Order on WhatsApp</button>`}`;
  openM('m-scan-result');
}

function confirmUse(sid) {
  const qty = parseInt(document.getElementById('sr-qty')?.value, 10) || 1;
  const jid = document.getElementById('sr-job')?.value || '';
  const manualPrice = parseFloat(document.getElementById('sr-manual-price')?.value || 0) || 0;
  if (jid) {
    if (addPartToJob(jid, sid, qty, '', manualPrice || null)) toast(`${qty}× part added to ${jid}`);
  } else {
    const s = stock.find(x => x.id === sid);
    if (!s) return;
    s.qty = Math.max(0, s.qty - qty);
    s.updatedAt = nowISO();
    for (let i = 0; i < qty; i++) {
      partsLog.push({ part: s.name, sku: s.sku, time: new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }), date: today() });
    }
    logAction('update', 'stock', sid, { qty: s.qty, delta: -qty, source: 'scan-page' });
    saveAll({ domain: 'stock' });
    renderStock?.();
    renderPrintManager?.();
    toast(`${qty}× ${s.name} used — stock: ${s.qty}`);
  }
  closeM('m-scan-result');
}

function manualSearch(v) {
  const res = scannerEl('manualResults');
  if (!res) return;
  if (!String(v || '').trim()) {
    res.innerHTML = '';
    return;
  }
  const query = String(v || '').trim();
  const matches = stock
    .map(s => {
      const stockScore = typeof scoreStockSearch === 'function' ? scoreStockSearch(s, query) : 0;
      const locationText = String(s.location || '').toLowerCase();
      const locationScore = locationText.includes(query.toLowerCase()) ? 0.82 : 0;
      return { item: s, score: Math.max(stockScore, locationScore) };
    })
    .filter(entry => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return String(left.item.name || '').localeCompare(String(right.item.name || ''));
    })
    .slice(0, 20)
    .map(entry => entry.item);
  res.innerHTML = matches.length
    ? matches.map(s => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--bor);">
        <div>
          <div style="font-size:13px;font-weight:500;">${s.name}</div>
          <div style="font-size:11px;color:var(--mut);">${s.sku} | Qty: <b style="color:${stSt(s)==='ok'?'var(--acc)':'var(--dan)'}">${s.qty}</b>${s.location ? ` | 📦 ${s.location}` : ''}${s.fitmentModels?.length ? ` | Fits ${s.fitmentModels.slice(0, 2).join(', ')}` : ''}</div>
        </div>
        <button class="btn btn-p btn-sm" onclick="handleContextPartPick('${s.id}')">Use</button>
      </div>`).join('')
    : '<div style="color:var(--mut);font-size:12px;padding:8px 0;">No matches</div>';
}
