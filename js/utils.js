// ═══════════════════════════════════════════════════════
//  Utils — toast, modal, nav, clock, vehicle hierarchy
// ═══════════════════════════════════════════════════════

// ─── Perf helpers ────────────────────────────────────────
// Debounce any function by a string key. Subsequent calls
// with the same key cancel the pending one. Used for search
// inputs so renders fire after the user pauses typing.
const __perfDebounceTimers = Object.create(null);
function debouncePerf(key, fn, ms = 220) {
  if (__perfDebounceTimers[key]) clearTimeout(__perfDebounceTimers[key]);
  __perfDebounceTimers[key] = setTimeout(() => {
    __perfDebounceTimers[key] = null;
    try { fn(); } catch (err) { console.warn('debouncePerf:' + key, err); }
  }, ms);
}
function flushDebouncePerf(key) {
  if (__perfDebounceTimers[key]) {
    clearTimeout(__perfDebounceTimers[key]);
    __perfDebounceTimers[key] = null;
  }
}

let __lastPagePersistTimer = null;
function persistLastPageSoon(page) {
  clearTimeout(__lastPagePersistTimer);
  __lastPagePersistTimer = setTimeout(() => {
    try { localStorage.setItem(LAST_PAGE_STORAGE_KEY, page); } catch (_) {}
  }, 180);
}

// Register a document/window event listener at most once
// per (target, event, key). Safe to call on every init —
// the second call is a no-op. Prevents listener pile-up
// when init runs again after a dataset/profile switch.
const __perfOnceRegistry = Object.create(null);
function addOnceListener(target, event, key, handler, options) {
  const regKey = `${key}::${event}`;
  if (__perfOnceRegistry[regKey]) return;
  target.addEventListener(event, handler, options);
  __perfOnceRegistry[regKey] = { target, event, handler, options };
}

// ─── Toast ───────────────────────────────────────────────
let _toastTimer = null;
function toast(msg, dur = 2800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), dur);
}

// ─── Modal ───────────────────────────────────────────────
let pageHistory = [];
let modalHistory = [];

function hasModalBack(modalId) {
  return modalHistory.some(entry => entry.modalId === modalId);
}

function updateBackButtons() {
  const navBackBtn = document.getElementById('nav-back-btn');
  if (navBackBtn) navBackBtn.style.display = currentPage !== 'jobs' && pageHistory.length ? '' : 'none';

  const detailBackBtn = document.getElementById('detail-back-btn');
  if (detailBackBtn) detailBackBtn.style.display = hasModalBack('m-detail') ? '' : 'none';

  const custDetailBackBtn = document.getElementById('cust-detail-back-btn');
  if (custDetailBackBtn) custDetailBackBtn.style.display = hasModalBack('m-cust-detail') ? '' : 'none';

  const invoiceBackBtn = document.getElementById('invoice-back-btn');
  if (invoiceBackBtn) invoiceBackBtn.style.display = hasModalBack('m-invoice') ? '' : 'none';
}

function pushModalHistory(modalId, restore) {
  if (!modalId || typeof restore !== 'function') return;
  modalHistory.push({ modalId, restore });
  updateBackButtons();
}

function clearModalHistory(modalId) {
  const before = modalHistory.length;
  modalHistory = modalHistory.filter(entry => entry.modalId !== modalId);
  if (modalHistory.length !== before) updateBackButtons();
}

function modalBack(modalId) {
  for (let i = modalHistory.length - 1; i >= 0; i -= 1) {
    if (modalHistory[i].modalId !== modalId) continue;
    const [entry] = modalHistory.splice(i, 1);
    document.getElementById(modalId)?.classList.remove('open');
    entry.restore();
    updateBackButtons();
    return true;
  }
  return false;
}

function goBack() {
  if (modalHistory.length) {
    const entry = modalHistory.pop();
    document.querySelectorAll('.ovl.open').forEach(el => el.classList.remove('open'));
    entry.restore();
    updateBackButtons();
    return;
  }
  if (pageHistory.length) {
    const previousPage = pageHistory.pop();
    showPage(previousPage, { skipHistory: true });
    updateBackButtons();
    return;
  }
  toast('No previous screen', 1800);
}

function openM(id)  {
  document.getElementById(id).classList.add('open');
  updateBackButtons();
}
function closeM(id) {
  document.getElementById(id).classList.remove('open');
  clearModalHistory(id);
  updateBackButtons();
}
const STICKY_FORM_MODALS = new Set([
  'm-job',
  'm-quick-invoice',
  'm-payment',
  'm-done',
  'm-part',
  'm-cust',
  'm-mech',
  'm-expense',
  'm-income',
]);

// Close modal on backdrop click
document.addEventListener('click', e => {
  if (!e.target.classList.contains('ovl')) return;
  if (e.target.id === 'm-stock-scan' && typeof closeStockReceiveModal === 'function') {
    closeStockReceiveModal();
    return;
  }
  if (e.target.id === 'm-job-parts' && typeof closeJobPartsDrawer === 'function') {
    closeJobPartsDrawer();
    return;
  }
  if (STICKY_FORM_MODALS.has(e.target.id)) {
    toast('Use Save or Cancel so your form details do not get lost', 2400);
    return;
  }
  closeM(e.target.id);
});

// ─── Navigation ──────────────────────────────────────────
const LAST_PAGE_STORAGE_KEY = 'jala_last_page_v1';
const REPORTS_ACCESS_STORAGE_KEY = 'jala_reports_access_v1';
const REPORTS_ACCESS_PASSWORD = '1122';
let currentPage = localStorage.getItem(LAST_PAGE_STORAGE_KEY) || 'jobs';
const ADMIN_ONLY_PAGES = ['admin', 'expenses', 'income', 'reports', 'logs', 'mechanics', 'print'];

function refreshAccessControls() {
  const admin = isAdminUser();
  document.querySelectorAll('[data-admin-only="true"]').forEach(el => {
    el.style.display = admin ? '' : 'none';
  });
  const invoiceActions = document.getElementById('invoice-admin-actions');
  if (invoiceActions && !admin) invoiceActions.innerHTML = '';
  if (!admin && ADMIN_ONLY_PAGES.includes(currentPage)) {
    currentPage = 'jobs';
    localStorage.setItem(LAST_PAGE_STORAGE_KEY, currentPage);
  }
}

function requireAdminAccess(actionLabel = 'access this section') {
  if (isAdminUser()) return true;
  toast(`Only admin can ${actionLabel}`, 3200);
  return false;
}

function hasReportsAccess() {
  return sessionStorage.getItem(REPORTS_ACCESS_STORAGE_KEY) === 'ok';
}

function ensureReportsAccess() {
  if (hasReportsAccess()) return true;
  const entered = prompt('Enter Reports password');
  if (entered === null) return false;
  if (String(entered).trim() !== REPORTS_ACCESS_PASSWORD) {
    toast('Wrong Reports password', 2600);
    return false;
  }
  sessionStorage.setItem(REPORTS_ACCESS_STORAGE_KEY, 'ok');
  return true;
}

function skeletonLine(width = '100%') {
  return `<span class="skeleton-line" style="width:${width};"></span>`;
}

function invoiceSkeletonTable(count = 7) {
  const rows = Array.from({ length: count }, () => `<tr class="skeleton-row">
    <td>${skeletonLine('72px')}</td>
    <td>${skeletonLine('104px')}</td>
    <td>${skeletonLine('148px')}</td>
    <td>${skeletonLine('120px')}</td>
    <td>${skeletonLine('46px')}</td>
    <td>${skeletonLine('78px')}</td>
    <td>${skeletonLine('66px')}</td>
    <td>${skeletonLine('84px')}</td>
    <td>${skeletonLine('82px')}</td>
    <td>${skeletonLine('110px')}</td>
  </tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;min-width:640px;">
    <thead>
      <tr>
        <th>Invoice #</th>
        <th>Date / Time</th>
        <th>Customer</th>
        <th>Vehicle</th>
        <th>Photo</th>
        <th>Amount</th>
        <th>Paid</th>
        <th>Linked Income</th>
        <th>Due</th>
        <th></th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function stockSkeletonRows(count = 8) {
  return Array.from({ length: count }, () => `<tr class="skeleton-row">
    <td>${skeletonLine('88px')}</td>
    <td>${skeletonLine('46px')}</td>
    <td>${skeletonLine('168px')}</td>
    <td>${skeletonLine('100px')}</td>
    <td>${skeletonLine('154px')}</td>
    <td>${skeletonLine('84px')}</td>
    <td>${skeletonLine('74px')}</td>
    <td>${skeletonLine('44px')}</td>
    <td>${skeletonLine('92px')}</td>
    <td>${skeletonLine('74px')}</td>
    <td>${skeletonLine('66px')}</td>
    <td>${skeletonLine('126px')}</td>
  </tr>`).join('');
}

function renderPageSkeleton(page) {
  if (page === 'invoices') {
    const container = document.getElementById('inv-list');
    if (container) container.innerHTML = invoiceSkeletonTable();
    return;
  }
  if (page === 'stock') {
    const tbody = document.getElementById('st-tbody');
    if (tbody) tbody.innerHTML = stockSkeletonRows();
    const stockValue = document.getElementById('stock-value');
    if (stockValue) stockValue.textContent = 'Loading stock value...';
    const stockPager = document.getElementById('stock-pager');
    if (stockPager) stockPager.textContent = 'Preparing list...';
  }
}

function showPage(p, options = {}) {
  const { skipHistory = false, skipRoute = false } = options;
  const previousPage = currentPage;
  if (ADMIN_ONLY_PAGES.includes(p) && !isAdminUser()) {
    toast('Only admin can access this section', 3200);
    p = 'jobs';
  }
  if (p === 'reports' && !ensureReportsAccess()) return;
  if (!skipHistory && currentPage && currentPage !== p) {
    pageHistory.push(currentPage);
    if (pageHistory.length > 30) pageHistory.splice(0, pageHistory.length - 30);
  }
  currentPage = p;
  persistLastPageSoon(currentPage);
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active', 'page-fade-in'));
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  const pageEl = document.getElementById('page-' + p);
  pageEl.classList.add('active', 'page-fade-in');
  const tab = document.querySelector(`.tab[data-page="${p}"]`);
  if (tab) tab.classList.add('active');
  if (!skipRoute && typeof updateNewUiRoute === 'function') updateNewUiRoute(p);
  if (typeof closeNewUiSidebarOnNavigate === 'function') closeNewUiSidebarOnNavigate();

  if (p !== 'scan' && typeof scannerRunning !== 'undefined' && scannerRunning) stopScanner();

  const renders = {
    home:      () => { if (typeof renderHomeDashboard === 'function') renderHomeDashboard(); },
    admin:     () => { if (typeof renderCloudBackupStatus === 'function') renderCloudBackupStatus(); },
    jobs:      renderJobs,
    stock:     renderStock,
    customers: renderCustomers,
    reminders: () => { if (typeof renderReminders === 'function') renderReminders(); },
    mechanics: renderMechanics,
    expenses:  renderExpenses,
    income:    renderIncomePage,
    reports:   renderReports,
    logs:      renderLogs,
    invoices:  renderInvoices,
    scan:      populateScanJobs,
    print:     renderPrintManager,
  };
  // Yield one frame so the tab-active class paints before
  // the heavy table re-render kicks in. The tap feels
  // responsive even when the target page is big (stock /
  // jobs / customers). Each page has its own key so a
  // rapid double-tap collapses to a single render.
  const renderFn = renders[p];
  if (renderFn) {
    const dataVersion = window.__JALASAI_DATA_VERSION || 0;
    window.__pageRenderedVersions = window.__pageRenderedVersions || {};
    const stale = typeof isAppTabStale === 'function' && isAppTabStale(p);
    const alreadyFresh = !stale && window.__pageRenderedVersions[p] === dataVersion;
    if (!options.forceRender && alreadyFresh) {
      updateBackButtons();
      return;
    }
    const largeEnough =
      p === 'invoices'
        ? (window.appState?.invoices || []).length > 50
        : p === 'stock'
        ? (window.appState?.stock || []).filter(s => !s.deleted_at).length > 50
        : false;
    if (stale && largeEnough) renderPageSkeleton(p);
    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb) => setTimeout(cb, 0);
    if (window.__pageRenderRaf) {
      (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout)(window.__pageRenderRaf);
    }
    window.__pageRenderRaf = raf(() => {
      window.__pageRenderRaf = null;
      try {
        renderFn();
        window.__pageRenderedVersions[p] = window.__JALASAI_DATA_VERSION || dataVersion;
        if (typeof markAppTabFresh === 'function') markAppTabFresh(p);
      } catch (err) { console.warn('showPage render failed:' + p, err); }
    });
  }
  updateBackButtons();
}

const LONG_LIST_PAGE_SIZE = 100;
const longListPageState = {};
const VIRTUAL_TABLE_ROW_COUNT = 25;
const virtualTableState = {};

function resetLongListPage(key) {
  longListPageState[key] = 1;
  resetVirtualTable(key);
}

function paginatedLongList(key, list = [], pageSize = LONG_LIST_PAGE_SIZE) {
  const total = Array.isArray(list) ? list.length : 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const requested = parseInt(longListPageState[key] || 1, 10) || 1;
  const page = Math.min(Math.max(1, requested), pages);
  longListPageState[key] = page;
  const start = (page - 1) * pageSize;
  return {
    items: (Array.isArray(list) ? list : []).slice(start, start + pageSize),
    total,
    page,
    pages,
    pageSize,
    start,
    end: Math.min(total, start + pageSize),
  };
}

function longListPagerHtml(key, pageInfo, label = 'records') {
  if (!pageInfo || pageInfo.total <= pageInfo.pageSize) return '';
  const prevDisabled = pageInfo.page <= 1 ? ' disabled' : '';
  const nextDisabled = pageInfo.page >= pageInfo.pages ? ' disabled' : '';
  return `
    <div class="list-pager">
      <button class="btn btn-g btn-sm" onclick="setLongListPage('${key}', ${pageInfo.page - 1})"${prevDisabled}>Prev</button>
      <span>${pageInfo.start + 1}-${pageInfo.end} of ${pageInfo.total} ${label} · Page ${pageInfo.page}/${pageInfo.pages}</span>
      <button class="btn btn-g btn-sm" onclick="setLongListPage('${key}', ${pageInfo.page + 1})"${nextDisabled}>Next</button>
    </div>`;
}

function setLongListPage(key, page) {
  longListPageState[key] = Math.max(1, parseInt(page || 1, 10) || 1);
  renderCurrentPage();
}

function renderCurrentPage(options = {}) { showPage(currentPage, options); }

function resetVirtualTable(key) {
  const state = virtualTableState[key];
  if (!state) return;
  if (state.raf) {
    const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
    cancel(state.raf);
    state.raf = 0;
  }
  state.scrollTop = 0;
  state.start = -1;
  if (state.scroller) state.scroller.scrollTop = 0;
}

function virtualTableHtml(key, columnsHtml, minWidth = '640px') {
  return `
    <div class="virtual-table-wrap" id="${key}-virtual-wrap">
      <table style="width:100%;border-collapse:collapse;min-width:${minWidth};">
        <thead>${columnsHtml}</thead>
        <tbody id="${key}-virtual-body"></tbody>
      </table>
    </div>
    <div class="virtual-table-meta" id="${key}-virtual-meta"></div>`;
}

function updateVirtualTable(key) {
  const state = virtualTableState[key];
  if (!state || !state.body) return;
  const total = state.items.length;
  const rowHeight = state.rowHeight;
  const visibleCount = Math.min(state.visibleCount, Math.max(total, 0));
  const maxStart = Math.max(0, total - visibleCount);
  const rawStart = Math.floor((state.scroller?.scrollTop || 0) / rowHeight);
  const start = Math.min(maxStart, Math.max(0, rawStart));
  if (start === state.start && state.renderedTotal === total && state.renderedVersion === state.version) return;
  state.start = start;
  state.renderedTotal = total;
  state.renderedVersion = state.version;
  const end = Math.min(total, start + visibleCount);
  const topHeight = start * rowHeight;
  const bottomHeight = Math.max(0, (total - end) * rowHeight);
  const rows = state.items.slice(start, end).map((item, offset) => state.rowHtml(item, start + offset)).join('');
  state.body.innerHTML = `
    ${topHeight ? `<tr class="virtual-spacer"><td colspan="${state.colspan}" style="height:${topHeight}px;padding:0;border:0;"></td></tr>` : ''}
    ${rows}
    ${bottomHeight ? `<tr class="virtual-spacer"><td colspan="${state.colspan}" style="height:${bottomHeight}px;padding:0;border:0;"></td></tr>` : ''}`;
  if (state.meta) {
    state.meta.textContent = total
      ? `${start + 1}-${end} of ${total} ${state.label}`
      : `0 ${state.label}`;
  }
}

function scheduleVirtualTableUpdate(key, state) {
  if (!state || state.raf) return;
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb) => setTimeout(cb, 16);
  state.raf = raf(() => {
    state.raf = 0;
    updateVirtualTable(key);
  });
}

function renderVirtualTable(options = {}) {
  const key = options.key;
  const container = typeof options.container === 'string' ? document.getElementById(options.container) : options.container;
  const items = Array.isArray(options.items) ? options.items : [];
  if (!key || !container) return;
  if (!items.length) {
    container.innerHTML = options.emptyHtml || '<div style="text-align:center;padding:48px;color:var(--mut);">No records found.</div>';
    delete virtualTableState[key];
    return;
  }
  const structureKey = [
    key,
    options.colspan || 1,
    options.minWidth || '640px',
    String(options.columnsHtml || ''),
  ].join('|');
  let state = virtualTableState[key];
  if (!state || state.structureKey !== structureKey || !container.querySelector(`#${key}-virtual-wrap`)) {
    container.innerHTML = virtualTableHtml(key, options.columnsHtml || '', options.minWidth || '640px');
    state = virtualTableState[key] || {};
    state.structureKey = structureKey;
    state.scroller = container.querySelector(`#${key}-virtual-wrap`);
    state.body = container.querySelector(`#${key}-virtual-body`);
    state.meta = container.querySelector(`#${key}-virtual-meta`);
    state.start = -1;
    state.scrollTop = state.scrollTop || 0;
    state.scroller.addEventListener('scroll', () => {
      state.scrollTop = state.scroller.scrollTop;
      scheduleVirtualTableUpdate(key, state);
    }, { passive: true });
    virtualTableState[key] = state;
    if (state.scrollTop) state.scroller.scrollTop = state.scrollTop;
  }
  state.items = items;
  state.rowHtml = typeof options.rowHtml === 'function' ? options.rowHtml : () => '';
  state.rowHeight = Math.max(32, parseInt(options.rowHeight || 72, 10) || 72);
  state.visibleCount = Math.max(1, parseInt(options.visibleCount || VIRTUAL_TABLE_ROW_COUNT, 10) || VIRTUAL_TABLE_ROW_COUNT);
  state.colspan = Math.max(1, parseInt(options.colspan || 1, 10) || 1);
  state.label = options.label || 'records';
  state.version = [
    items.length,
    options.version || '',
    items[0]?.id || '',
    items[items.length - 1]?.id || '',
  ].join('|');
  updateVirtualTable(key);
}

function buildPartQRPayload(sku) {
  return `JALASAI|SKU|${String(sku || '').trim().toUpperCase()}`;
}

function extractScannedSku(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  const upper = text.toUpperCase();
  if (upper.startsWith('JALASAI|SKU|')) return upper.split('|')[2] || '';
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.sku) return String(parsed.sku).trim().toUpperCase();
  } catch (_) {}
  return upper.replace(/\s+/g, '');
}

// ─── Clock ───────────────────────────────────────────────
(function initClock() {
  const el = document.createElement('div');
  el.style.cssText = 'font-family:var(--fh);font-size:13px;color:var(--mut);margin-left:auto;padding-right:4px;white-space:nowrap;flex-shrink:0;';
  el.id = 'clk';
  document.querySelector('nav').appendChild(el);
  const tick = () => {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      + '  ' + now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };
  tick();
  setInterval(tick, 30000);
})();

// ─── Vehicle suggestions ──────────────────────────────────
const VEHICLE_BRANDS = {
  'Ola':           ['S1 Pro', 'S1 Air', 'S1 X 2kWh', 'S1 X 3kWh', 'S1 X 4kWh', 'Roadster', 'Roadster X', 'Roadster Pro'],
  'Ather':         ['450X', '450S', '450 Apex', 'Rizta S', 'Rizta Z'],
  'TVS':           ['iQube S', 'iQube ST', 'Jupiter 125', 'Apache RTR 160', 'Apache RTR 200', 'Ntorq 125', 'XL 100'],
  'Honda':         ['Activa 3G', 'Activa 4G', 'Activa 5G', 'Activa 6G', 'Activa 125', 'Shine', 'Shine 100', 'Shine 125', 'Shine BS6', 'SP 125', 'Unicorn', 'Dio', 'CB Hornet 2.0'],
  'Hero':          ['Splendor Plus', 'Splendor Pro', 'Passion Pro', 'HF Deluxe', 'Glamour', 'Xpulse 200', 'Electric'],
  'Royal Enfield': ['Bullet 350', 'Classic 350', 'Meteor 350', 'Himalayan 450', 'Hunter 350', 'Shotgun 650'],
  'Bajaj':         ['Pulsar 150', 'Pulsar 180', 'Pulsar 220F', 'Pulsar NS200', 'Avenger 220', 'Chetak (EV)', 'CT100', 'Platina 110'],
  'Yamaha':        ['FZ-S V3', 'FZX', 'R15 V4', 'MT-15 V2', 'Fascino 125', 'Ray ZR 125', 'Aerox 155'],
  'Suzuki':        ['Access 125', 'Burgman Street', 'Gixxer 150', 'Gixxer SF'],
  'KTM':           ['Duke 125', 'Duke 200', 'Duke 390', 'RC 390', 'Adventure 250'],
  'Jawa':          ['42 Bobber', 'Perak', 'Yezdi Roadster', 'Yezdi Scrambler'],
  'Revolt':        ['RV400 BRZ', 'RV1+'],
  'Okinawa':       ['Praise Pro', 'iPraise+', 'Okhi-90', 'Ridge+'],
  'Ampere':        ['Magnus EX', 'Primus', 'Nexus'],
  'Other EV':      ['Other Electric Scooter', 'Other Electric Bike'],
  'Other':         ['Other Bike / Scooter'],
};

function initVehicleBrands() {
  suggestVehicleName('');
}

function vehicleSuggestionValues() {
  return Object.entries(VEHICLE_BRANDS)
    .flatMap(([brand, models]) => models.map(model => `${brand} ${model}`))
    .filter(Boolean);
}

function normalizeVehicleQuery(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function suggestVehicleName(value) {
  const dl = document.getElementById('jm-vehicle-suggestions');
  if (!dl) return;
  const q = normalizeVehicleQuery(value);
  const list = vehicleSuggestionValues()
    .filter(name => !q || normalizeVehicleQuery(name).includes(q))
    .slice(0, 12);
  dl.innerHTML = list.map(name => `<option value="${name}"></option>`).join('');
}

function setVehicleValue(fullVeh) {
  const input = document.getElementById('jm-veh');
  if (!input) return;
  input.value = String(fullVeh || '').trim();
  suggestVehicleName(input.value);
}

// ─── Status labels & classes ─────────────────────────────
const SLbl = { waiting: 'Waiting', 'in-progress': 'In Progress', ready: 'Ready', 'parts-needed': 'Parts Needed', returned: 'Returned', done: 'Done' };
const SCls = { waiting: 'waiting', 'in-progress': 'in-progress', ready: 'ready', 'parts-needed': 'parts', returned: 'returned', done: 'ready' };

// ─── Dues badge (called from jobs.js updateStats) ────────
function updateDuesBadge() {
  const due  = jobs.filter(j => isLiveJob(j) && j.status !== 'done' && jobDue(j) > 0);
  const el   = document.getElementById('pending-dues');
  if (!el) return;
  if (due.length) {
    const total = due.reduce((a, j) => a + jobDue(j), 0);
    el.style.display = 'inline';
    el.textContent   = `⚠ ${due.length} unpaid · ${fmtMoney(total)} due`;
  } else {
    el.style.display = 'none';
  }
}

// ─── Code maps ────────────────────────────────────────────
const BIKE_CODES = {
  OLA:'Ola', ATH:'Ather', TVS:'TVS iQube', JUP:'TVS Jupiter', APH:'TVS Apache', NTQ:'TVS Ntorq',
  ACT:'Honda Activa', SHN:'Honda Shine', UNI:'Honda Unicorn', DIO:'Honda Dio', HRN:'Honda Hornet', SP:'Honda SP125',
  SPL:'Hero Splendor', PAS:'Hero Passion', HFD:'Hero HF Deluxe', GLM:'Hero Glamour', XPL:'Hero Xpulse', HER:'Hero Electric',
  BLT:'RE Bullet', CLS:'RE Classic', MET:'RE Meteor', HIM:'RE Himalayan',
  PLS:'Bajaj Pulsar', AVN:'Bajaj Avenger', CHT:'Bajaj Chetak', CT1:'Bajaj CT100', PLT:'Bajaj Platina',
  FZ:'Yamaha FZ', R15:'Yamaha R15', FSN:'Yamaha Fascino', RAY:'Yamaha Ray',
  ACC:'Suzuki Access', GIX:'Suzuki Gixxer', BRG:'Suzuki Burgman',
  KTM:'KTM', JAW:'Jawa', GEN:'Generic'
};
const CAT_CODES = {
  ELE:'Electrical', BRA:'Brakes', FLT:'Filters/Fluids', CBL:'Cables/Controls',
  BDY:'Body/Frame', ENG:'Engine/Drive', LGT:'Lights', TIR:'Tyres/Belts', LCK:'Locks'
};
