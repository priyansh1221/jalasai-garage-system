// Premium New UI helpers: route sync, sidebar toggle, and live Home dashboard.

const NEW_UI_ROUTE_ALIASES = Object.freeze({
  '': 'home',
  '/': 'home',
  home: 'home',
  jobs: 'jobs',
  job: 'jobs',
  billing: 'invoices',
  invoice: 'invoices',
  invoices: 'invoices',
  stock: 'stock',
  inventory: 'stock',
  customers: 'customers',
  customer: 'customers',
  reminders: 'reminders',
  followup: 'reminders',
  scan: 'scan',
  admin: 'admin',
  reports: 'reports',
  expenses: 'expenses',
  income: 'income',
  logs: 'logs',
  mechanics: 'mechanics',
  print: 'print',
  qr: 'print',
  'print-qr': 'print',
});

const NEW_UI_PAGE_ROUTES = Object.freeze({
  home: 'home',
  jobs: 'jobs',
  invoices: 'invoices',
  stock: 'stock',
  customers: 'customers',
  reminders: 'reminders',
  scan: 'scan',
  admin: 'admin',
  reports: 'admin/reports',
  expenses: 'admin/expenses',
  income: 'admin/income',
  logs: 'admin/logs',
  mechanics: 'admin/mechanics',
  print: 'admin/print',
});

let newUiRouteLock = false;
let newUiShellInitialised = false;
const newUiHomeStats = {
  version: -1,
  data: null,
};

function newUiCleanRoute(raw = '') {
  return String(raw || '')
    .replace(/^#/, '')
    .replace(/^\/+/, '')
    .replace(/^jalasai\/?/i, '')
    .trim()
    .toLowerCase();
}

function newUiPageFromRoute(raw = '') {
  const cleaned = newUiCleanRoute(raw);
  if (NEW_UI_ROUTE_ALIASES[cleaned]) return NEW_UI_ROUTE_ALIASES[cleaned];
  const parts = cleaned.split('/').filter(Boolean);
  if (parts[0] === 'admin' && parts[1]) return NEW_UI_ROUTE_ALIASES[parts[1]] || 'admin';
  return NEW_UI_ROUTE_ALIASES[parts[0] || 'home'] || 'home';
}

function updateNewUiRoute(page, options = {}) {
  const route = NEW_UI_PAGE_ROUTES[page] || page || 'home';
  const nextHash = '#' + route;
  if (window.location.hash === nextHash) return;
  newUiRouteLock = true;
  if (options.replace) history.replaceState(null, '', nextHash);
  else history.pushState(null, '', nextHash);
  newUiRouteLock = false;
}

function initNewUiShell() {
  if (newUiShellInitialised) return;
  newUiShellInitialised = true;
  const routePage = newUiPageFromRoute(window.location.hash);
  currentPage = routePage || currentPage || 'home';
  if (currentPage === 'jobs' && !window.location.hash && !localStorage.getItem(LAST_PAGE_STORAGE_KEY)) currentPage = 'home';
  updateNewUiRoute(currentPage, { replace: true });
  window.addEventListener('hashchange', handleNewUiHashChange);
}

function handleNewUiHashChange() {
  if (newUiRouteLock) return;
  const page = newUiPageFromRoute(window.location.hash);
  if (page && page !== currentPage) showPage(page, { skipHistory: true, skipRoute: true });
}

function toggleNewUiSidebar(force) {
  const desktop = window.matchMedia?.('(min-width: 901px)').matches;
  if (desktop) {
    const collapsed = typeof force === 'boolean'
      ? !force
      : !document.body.classList.contains('sidebar-collapsed');
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    document.body.classList.remove('sidebar-open');
    return;
  }
  const open = typeof force === 'boolean' ? force : !document.body.classList.contains('sidebar-open');
  document.body.classList.toggle('sidebar-open', open);
  document.body.classList.remove('sidebar-collapsed');
}

function closeNewUiSidebarOnNavigate() {
  if (window.matchMedia?.('(max-width: 900px)').matches) toggleNewUiSidebar(false);
}

function newUiMoney(value) {
  return typeof fmtMoney === 'function' ? fmtMoney(value || 0) : '₹' + (value || 0).toLocaleString('en-IN');
}

function newUiEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function newUiSetText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function calculateNewUiHomeStats() {
  const state = window.appState || {};
  const stateJobs = state.jobs || jobs || [];
  const stateCustomers = state.customers || customers || [];
  const stateStock = state.stock || stock || [];
  const liveJobs = stateJobs.filter(j => typeof isLiveJob === 'function' ? isLiveJob(j) : !j.deletedAt);
  const openJobs = liveJobs.filter(j => typeof isActiveWorkshopJob === 'function' ? isActiveWorkshopJob(j) : j.status !== 'done');
  const readyJobs = openJobs.filter(j => j.status === 'ready');
  const doneToday = liveJobs.filter(j => j.status === 'done' && (((j.doneAt || '').slice(0, 10) || j.date || '') === today()));
  const revenueToday = doneToday.reduce((sum, j) => sum + (typeof jobTotal === 'function' ? jobTotal(j) : (parseFloat(j.paid || j.total || 0) || 0)), 0);
  const customerSummaryIndex = typeof buildCustomerJobSummaryIndex === 'function'
    ? buildCustomerJobSummaryIndex(stateCustomers, liveJobs, { allowNameFallback: true })
    : null;
  const activeCustomerSummaries = customerSummaryIndex
    ? [...customerSummaryIndex.summaries.values()].filter(summary => (summary.jobs || []).length > 0)
    : [];
  const dues = customerSummaryIndex
    ? activeCustomerSummaries.reduce((sum, summary) => sum + (summary.due || 0), 0)
    : openJobs.reduce((sum, j) => sum + (typeof jobDue === 'function' ? jobDue(j) : (parseFloat(j.due || 0) || 0)), 0);
  const liveStock = stateStock.filter(s => typeof isLiveStockItem === 'function' ? isLiveStockItem(s) : !s.deletedAt);
  const riskyStock = liveStock.filter(s => typeof stSt === 'function' ? stSt(s) !== 'ok' : (s.qty || 0) <= (s.min || s.minStock || 0));
  const liveCustomers = customerSummaryIndex
    ? activeCustomerSummaries
    : stateCustomers.filter(c => !c.deletedAt && !c._deleted);

  return {
    revenueToday,
    doneTodayCount: doneToday.length,
    openJobsCount: openJobs.length,
    readyJobsCount: readyJobs.length,
    liveCustomersCount: liveCustomers.length,
    dues,
    riskyStockCount: riskyStock.length,
    openJobsPreview: openJobs.slice(0, 5),
    riskyStockPreview: riskyStock.slice(0, 5),
    syncHealthy: syncMeta && !syncMeta.pendingSync && !syncMeta.lastSyncError,
    pendingSync: !!syncMeta?.pendingSync,
    syncError: !!syncMeta?.lastSyncError,
    cloudConnected: !!(typeof cloudSessionActive !== 'undefined' && cloudSessionActive),
    lastPushedAt: syncMeta?.lastPushedAt || '',
  };
}

function getNewUiHomeStats() {
  const version = window.__JALASAI_DATA_VERSION || 0;
  if (newUiHomeStats.data && newUiHomeStats.version === version) return newUiHomeStats.data;
  newUiHomeStats.version = version;
  newUiHomeStats.data = calculateNewUiHomeStats();
  return newUiHomeStats.data;
}

function renderHomeDashboard() {
  const stats = getNewUiHomeStats();

  newUiSetText('home-revenue', newUiMoney(stats.revenueToday));
  newUiSetText('home-invoices', `${stats.doneTodayCount} invoices today`);
  newUiSetText('home-active-jobs', String(stats.openJobsCount));
  newUiSetText('home-ready-jobs', `${stats.readyJobsCount} ready`);
  newUiSetText('home-customers', String(stats.liveCustomersCount));
  newUiSetText('home-dues', `${newUiMoney(stats.dues)} pending dues`);
  newUiSetText('home-stock-risk', String(stats.riskyStockCount));

  const jobsEl = document.getElementById('home-jobs-list');
  if (jobsEl) {
    const rows = stats.openJobsPreview.map(j => {
      const status = j.status || 'waiting';
      const statusClass = status === 'ready' ? 'good' : status === 'parts-needed' ? 'warn' : status === 'returned' ? 'danger' : '';
      return `<div class="new-row">
        <div>
          <b>${newUiEscape(j.cust || j.customer || j.customerName || 'Customer')}</b>
          <span>${newUiEscape(j.veh || j.bike || j.bikeName || 'Vehicle')} · ${newUiEscape(j.vno || j.reg || j.registerNumber || 'No reg')} · ${newUiEscape(j.prob || j.problem || j.workDescription || 'Work')}</span>
        </div>
        <em class="${statusClass}">${newUiEscape(status.replace(/-/g, ' '))}</em>
      </div>`;
    }).join('');
    jobsEl.innerHTML = rows || '<div class="new-empty">No active jobs. Use New Job to start the day.</div>';
  }

  const stockEl = document.getElementById('home-stock-list');
  if (stockEl) {
    stockEl.innerHTML = stats.riskyStockPreview.map(s => {
      const status = typeof stSt === 'function' ? stSt(s) : 'low';
      return `<div class="new-row">
        <div>
          <b>${newUiEscape(s.name || 'Part')}</b>
          <span>${newUiEscape(s.sku || '')} · Qty ${Number(s.qty || 0)} · Min ${Number(s.min || s.minStock || 0)}</span>
        </div>
        <em class="${status === 'out' ? 'danger' : 'warn'}">${status === 'out' ? 'out' : 'low'}</em>
      </div>`;
    }).join('') || '<div class="new-empty">Stock levels look okay.</div>';
  }

  // Sync box must reflect real cloud state: never claim "healthy" while cloud
  // is disconnected (the top badge says Offline at the same time).
  const syncState = !stats.cloudConnected
    ? 'offline'
    : stats.syncError ? 'issue' : stats.pendingSync ? 'pending' : 'healthy';
  newUiSetText('home-sync-title',
    syncState === 'offline' ? 'Working offline — saved on this device'
    : syncState === 'issue' ? 'Sync issue — open Cloud settings'
    : syncState === 'pending' ? 'Changes waiting to sync'
    : 'Cloud sync healthy');
  newUiSetText('home-sync-copy',
    syncState === 'offline'
      ? 'Everything keeps working without internet. Connect cloud from the top badge to back up.'
      : stats.lastPushedAt
        ? `Last push: ${typeof fmtDateTime === 'function' ? fmtDateTime(stats.lastPushedAt) : stats.lastPushedAt}`
        : 'Business data stays available offline and syncs when cloud is connected.');
  const syncDot = document.querySelector('.new-sync-box .new-sync-dot');
  if (syncDot) syncDot.dataset.state = syncState;
}
