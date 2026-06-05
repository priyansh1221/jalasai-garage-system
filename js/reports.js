// ═══════════════════════════════════════════════════════
//  Reports / Analytics module
// ═══════════════════════════════════════════════════════

const REPORT_TIMEZONE = 'Asia/Kolkata';

let reportFilters = {
  range: 'today',
  start: reportTodayIST(),
  end: reportTodayIST(),
  year: new Date().getFullYear(),
  search: '',
};

function reportTodayIST() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function reportDateAdd(value, days) {
  const base = new Date(`${String(value || reportTodayIST()).slice(0, 10)}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function fmtReportMoney(value) {
  return fmtMoney(Math.round(value || 0));
}

function availableYears() {
  const years = new Set([new Date().getFullYear()]);
  jobs.forEach(j => {
    const d = reportJobDate(j);
    if (d) years.add(parseInt(d.slice(0, 4), 10));
  });
  expenses.forEach(e => {
    if (e.date) years.add(parseInt(String(e.date).slice(0, 4), 10));
  });
  (incomeEntries || []).forEach(entry => {
    if (entry.date) years.add(parseInt(String(entry.date).slice(0, 4), 10));
  });
  return [...years].filter(Boolean).sort((a, b) => b - a);
}

function reportDateSpan(range) {
  const end = reportTodayIST();
  if (range === 'yesterday') {
    const y = reportDateAdd(end, -1);
    return { start: y, end: y };
  }

  if (range === 'year') {
    const nowYear = parseInt(end.slice(0, 4), 10);
    const yr = parseInt(reportFilters.year || nowYear, 10) || nowYear;
    return { start: `${yr}-01-01`, end: `${yr}-12-31` };
  }
  const start = range === 'week'
    ? reportDateAdd(end, -6)
    : range === 'month'
      ? `${end.slice(0, 7)}-01`
      : end;
  if (range === 'date' || range === 'today') return { start: reportFilters.start || end, end: reportFilters.start || end };
  if (range === 'custom') {
    const customStart = reportFilters.start || reportFilters.end || end;
    const customEnd = reportFilters.end || reportFilters.start || customStart;
    return customStart <= customEnd ? { start: customStart, end: customEnd } : { start: customEnd, end: customStart };
  }
  return { start, end };
}

function syncReportInputs() {
  const rangeSel = document.getElementById('rpt-range');
  const yearSel = document.getElementById('rpt-year');
  const startEl = document.getElementById('rpt-start');
  const endEl = document.getElementById('rpt-end');
  const searchEl = document.getElementById('rpt-search');
  if (rangeSel) rangeSel.value = reportFilters.range;
  if (yearSel) {
    const years = availableYears();
    yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    yearSel.value = String(reportFilters.year || years[0] || new Date().getFullYear());
    yearSel.style.display = reportFilters.range === 'year' ? '' : 'none';
  }
  const span = reportDateSpan(reportFilters.range);
  if (startEl) startEl.value = span.start;
  if (endEl) endEl.value = span.end;
  if (searchEl && searchEl.value !== reportFilters.search) searchEl.value = reportFilters.search;
  if (endEl) endEl.disabled = ['today', 'yesterday', 'week', 'month', 'year', 'date'].includes(reportFilters.range);
}

function setReportRange(value) {
  reportFilters.range = value || 'today';
  if (reportFilters.range === 'today') {
    reportFilters.start = reportTodayIST();
    reportFilters.end = reportTodayIST();
  } else if (reportFilters.range === 'yesterday') {
    reportFilters.start = reportDateAdd(reportTodayIST(), -1);
    reportFilters.end = reportDateAdd(reportTodayIST(), -1);
  } else if (reportFilters.range === 'week' || reportFilters.range === 'month' || reportFilters.range === 'year') {
    const span = reportDateSpan(reportFilters.range);
    reportFilters.start = span.start;
    reportFilters.end = span.end;
  } else if (reportFilters.range === 'date') {
    reportFilters.start = reportFilters.start || reportTodayIST();
    reportFilters.end = reportFilters.start;
  } else {
    reportFilters.start = reportFilters.start || reportTodayIST();
    reportFilters.end = reportFilters.end || reportFilters.start;
  }
  renderReports();
}

function setReportYear(value) {
  reportFilters.year = parseInt(value, 10) || new Date().getFullYear();
  if (reportFilters.range !== 'year') reportFilters.range = 'year';
  const span = reportDateSpan('year');
  reportFilters.start = span.start;
  reportFilters.end = span.end;
  renderReports();
}

function setReportCustomDates() {
  const startEl = document.getElementById('rpt-start');
  const endEl = document.getElementById('rpt-end');
  const start = startEl?.value || reportTodayIST();
  const end = endEl?.value || start;
  reportFilters.start = start;
  reportFilters.end = reportFilters.range === 'date' ? start : end;
  if (reportFilters.range !== 'custom' && reportFilters.range !== 'date') {
    reportFilters.range = 'custom';
  }
  renderReports();
}

function setReportSearch(value) {
  reportFilters.search = value || '';
  if (typeof debouncePerf === 'function') {
    debouncePerf('reports-search', renderReports, 220);
  } else {
    renderReports();
  }
}

function reportWindow() {
  return reportDateSpan(reportFilters.range);
}

function reportLabel(windowRange = reportFilters.range, start = reportWindow().start, end = reportWindow().end) {
  if (windowRange === 'today') return 'Today';
  if (windowRange === 'yesterday') return 'Yesterday';
  if (windowRange === 'week') return 'Last 7 Days';
  if (windowRange === 'month') return 'This Month';
  if (windowRange === 'year') return String(start).slice(0, 4);
  if (windowRange === 'date') return fmtDate(start);
  return `${fmtDate(start)} → ${fmtDate(end)}`;
}

function reportJobDate(j) {
  return (j.doneAt || '').slice(0, 10) || j.date || '';
}

function reportJobStamp(j) {
  return j.doneAt || `${j.date || today()}T${j.time || '00:00'}`;
}

function matchesReportSearch(j, q) {
  if (!q) return true;
  const hay = [
    j.cust || '',
    j.phone || '',
    j.invoiceNo || '',
    j.id || '',
    j.vno || '',
    j.veh || '',
  ].join(' ').toLowerCase();
  return hay.includes(q);
}

function matchesRevenueSearch(entry, q) {
  if (!q) return true;
  const hay = [
    entry.customer || '',
    entry.phone || '',
    entry.invoiceNo || '',
    entry.note || '',
    entry.category || '',
    entry.mechName || '',
    entry.sourceId || '',
  ].join(' ').toLowerCase();
  return hay.includes(q);
}

function inReportWindow(dateValue, span) {
  const value = String(dateValue || '');
  if (!value) return false;
  return value >= span.start && value <= span.end;
}

function shiftDateValue(value, days) {
  return reportDateAdd(value, days);
}

function spanDayCount(span) {
  const start = new Date(`${span.start}T00:00:00Z`);
  const end = new Date(`${span.end}T00:00:00Z`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

function previousSpanFor(currentSpan) {
  const days = spanDayCount(currentSpan);
  const prevEnd = shiftDateValue(currentSpan.start, -1);
  const prevStart = shiftDateValue(prevEnd, -(days - 1));
  return { start: prevStart, end: prevEnd };
}

function jobsInSpan(span, options = {}) {
  const q = String(options.search || '').trim().toLowerCase();
  return jobs
    .filter(j => isLiveJob(j))
    .filter(j => options.doneOnly ? j.status === 'done' : true)
    .filter(j => inReportWindow(options.doneOnly ? reportJobDate(j) : (j.date || reportJobDate(j)), span))
    .filter(j => matchesReportSearch(j, q));
}

function revenueEntriesInSpan(span, search = '') {
  const q = String(search || '').trim().toLowerCase();
  return allRevenueEntries()
    .filter(entry => inReportWindow(entry.date, span))
    .filter(entry => matchesRevenueSearch(entry, q));
}

function expensesInSpan(span) {
  return expenses.filter(e => isLiveExpense(e) && inReportWindow(e.date, span));
}

function partsLogInSpan(span) {
  return partsLog.filter(p => inReportWindow(p.date, span));
}

function metricDelta(current, previous) {
  const curr = parseFloat(current || 0) || 0;
  const prev = parseFloat(previous || 0) || 0;
  const diff = curr - prev;
  if (!prev && !curr) return { diff, pct: 0, text: 'No change', tone: 'neutral' };
  if (!prev) return { diff, pct: 100, text: 'New', tone: curr >= 0 ? 'up' : 'down' };
  const pct = (diff / prev) * 100;
  const tone = diff > 0.009 ? 'up' : diff < -0.009 ? 'down' : 'neutral';
  const prefix = diff > 0.009 ? '+' : '';
  return { diff, pct, text: `${prefix}${pct.toFixed(Math.abs(pct) >= 100 ? 0 : 1)}%`, tone };
}

function metricDeltaText(current, previous, formatter = value => value) {
  const delta = metricDelta(current, previous);
  if (delta.text === 'New' || delta.text === 'No change') return delta;
  const diffText = formatter(Math.abs(delta.diff));
  delta.text = `${delta.diff >= 0 ? '+' : '-'}${diffText} · ${delta.text}`;
  return delta;
}

function metricDeltaClass(delta, invert = false) {
  if (delta.tone === 'neutral') return 'neutral';
  if (invert) return delta.tone === 'up' ? 'down' : 'up';
  return delta.tone;
}

function methodBucket(method) {
  const value = String(method || '').trim().toLowerCase();
  if (!value) return 'other';
  if (value.includes('upi')) return 'upi';
  if (value.includes('cash')) return 'cash';
  return 'other';
}

function reportCreatedStamp(job) {
  return job.createdAt || `${job.date || today()}T${job.time || '00:00'}`;
}

function hoursBetween(left, right) {
  const a = new Date(left);
  const b = new Date(right);
  const diff = (b.getTime() - a.getTime()) / 3600000;
  return Number.isFinite(diff) ? Math.max(0, diff) : 0;
}

function customerKeyFromJob(job) {
  return String(job.custId || job.phone || job.cust || '').trim().toLowerCase();
}

function serviceBucket(text) {
  const value = String(text || '').toLowerCase();
  if (!value) return 'General';
  if (/puncture|tube|tyre|tire/.test(value)) return 'Puncture / Tyre';
  if (/brake|disc pad|shoe/.test(value)) return 'Brake Work';
  if (/oil|service/.test(value)) return 'Oil / Service';
  if (/wire|wiring|switch|horn|light|headlight|rr unit|battery|cdi|plug/.test(value)) return 'Electrical';
  if (/shock|suspension|fork/.test(value)) return 'Suspension';
  if (/engine|clutch|variator|belt|roller/.test(value)) return 'Engine / Drive';
  return 'General Repair';
}

function isPlaceholderMechanicLabel(value) {
  const text = String(value || '').trim().toLowerCase();
  return !text || ['no mechanic', 'quick invoice', 'n/a', 'na', 'unknown mechanic'].includes(text);
}

function mechanicReportNameKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function reportMechanicRows(doneJobs = [], revenueEntries = []) {
  const map = new Map();
  const ensure = (id, name = '', color = '#00c896') => {
    const cleanId = String(id || '').trim();
    const cleanName = String(name || '').trim();
    const master = findMechanicByIdOrName(cleanId) || findMechanicByIdOrName(cleanName);
    const resolvedId = String(master?.id || cleanId).trim();
    const resolvedName = String(master?.name || cleanName).trim();
    const resolvedColor = String(master?.color || color || '#00c896').trim() || '#00c896';
    if (!resolvedId && isPlaceholderMechanicLabel(resolvedName)) return null;
    const nameKey = mechanicReportNameKey(resolvedName);
    const key = nameKey && !isPlaceholderMechanicLabel(nameKey) ? `name:${nameKey}` : `id:${resolvedId}`;
    if (!key) return null;
    if (!map.has(key)) {
      map.set(key, {
        id: resolvedId,
        ids: uniqStrings(resolvedId ? [resolvedId] : []),
        name: resolvedName || 'Unknown Mechanic',
        color: resolvedColor,
      });
    } else {
      const current = map.get(key);
      if (!current.id && resolvedId) current.id = resolvedId;
      current.ids = uniqStrings([...(current.ids || []), resolvedId].filter(Boolean));
      if ((!current.name || current.name === 'Unknown Mechanic') && resolvedName) current.name = resolvedName;
      if ((!current.color || current.color === '#00c896') && resolvedColor) current.color = resolvedColor;
    }
    return map.get(key);
  };

  mechanics.filter(isLiveMechanic).forEach(m => ensure(m.id, m.name, m.color));
  doneJobs.forEach(job => {
    const ids = jobMechanicIds(job);
    const fallbackNames = mechanicReferenceNames(job);
    if (!ids.length && fallbackNames.length) {
      fallbackNames.forEach(name => ensure('', name, '#00c896'));
      return;
    }
    ids.forEach((id, index) => {
      const master = mechanics.find(m => String(m.id || '').trim() === String(id || '').trim());
      const resolvedName = master?.name || fallbackNames[index] || fallbackNames[0] || '';
      ensure(id, resolvedName, master?.color || '#00c896');
    });
  });
  revenueEntries
    .filter(entry => entry.source === 'income' && entry.kind === 'regular_income')
    .forEach(entry => {
      const id = String(entry.mechId || '').trim();
      const name = String(entry.mechName || '').trim();
      const master = mechanics.find(m => String(m.id || '').trim() === id);
      ensure(id, master?.name || name, master?.color || '#00c896');
    });

  const liveMechanicOrder = mechanics
    .filter(isLiveMechanic)
    .map(m => mechanicReportNameKey(m.name) || String(m.id || '').trim());

  return [...map.values()]
    .filter(item => item.name && !isPlaceholderMechanicLabel(item.name))
    .sort((a, b) => {
      const aKey = mechanicReportNameKey(a.name) || String(a.id || '').trim();
      const bKey = mechanicReportNameKey(b.name) || String(b.id || '').trim();
      const aIndex = liveMechanicOrder.indexOf(aKey);
      const bIndex = liveMechanicOrder.indexOf(bKey);
      if (aIndex !== -1 || bIndex !== -1) {
        return (aIndex === -1 ? 9999 : aIndex) - (bIndex === -1 ? 9999 : bIndex);
      }
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

function sumKnownPartsCost(job) {
  return (Array.isArray(job.partsUsed) ? job.partsUsed : []).reduce((sum, part) => {
    const qty = parseFloat(part.qty || 0) || 0;
    const buyPrice = parseFloat(part.buyPrice || 0) || 0;
    return sum + (qty * buyPrice);
  }, 0);
}

function usageCountBySku(days = 30) {
  const span = { start: shiftDateValue(today(), -(days - 1)), end: today() };
  const counts = {};
  partsLogInSpan(span).forEach(entry => {
    const key = String(entry.sku || '').trim();
    if (!key) return;
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function latestMovementDateForItem(item) {
  const sku = String(item.sku || '').trim();
  const dates = [];
  if (item.updatedAt) dates.push(String(item.updatedAt).slice(0, 10));
  if (item.createdAt) dates.push(String(item.createdAt).slice(0, 10));
  stockMovements.forEach(entry => {
    if ((entry.stockId && entry.stockId === item.id) || (sku && entry.sku === sku)) {
      const date = String(entry.createdAt || entry.date || '').slice(0, 10);
      if (date) dates.push(date);
    }
  });
  partsLog.forEach(entry => {
    if (sku && entry.sku === sku && entry.date) dates.push(String(entry.date).slice(0, 10));
  });
  purchaseEntries.forEach(entry => {
    if ((entry.mappedStockId && entry.mappedStockId === item.id) || (sku && entry.mappedSku === sku)) {
      const date = String(entry.createdAt || entry.date || '').slice(0, 10);
      if (date) dates.push(date);
    }
  });
  return dates.sort().pop() || '';
}

function daysSince(value) {
  if (!value) return 9999;
  const now = new Date(`${today()}T00:00:00`);
  const then = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Math.floor((now.getTime() - then.getTime()) / 86400000);
}

function retentionSummary(span) {
  const jobsInRange = jobs.filter(j => isLiveJob(j) && (inReportWindow(j.date || reportJobDate(j), span) || inReportWindow(reportJobDate(j), span)));
  const seen = new Map();
  jobsInRange.forEach(job => {
    const key = customerKeyFromJob(job);
    if (!key) return;
    seen.set(key, job);
  });
  const served = [...seen.values()];
  const repeat = served.filter(job => jobs.filter(other => isLiveJob(other) && customerKeyFromJob(other) === customerKeyFromJob(job)).length > 1);
  return {
    served: served.length,
    repeat: repeat.length,
    rate: served.length ? (repeat.length / served.length) * 100 : 0,
  };
}

function followupConversionProxy(span) {
  const done = jobs
    .filter(j => isLiveJob(j) && j.status === 'done')
    .sort((a, b) => jobDateTimeValue(a) - jobDateTimeValue(b));
  const byCustomer = new Map();
  done.forEach(job => {
    const key = customerKeyFromJob(job);
    if (!key) return;
    const list = byCustomer.get(key) || [];
    list.push(job);
    byCustomer.set(key, list);
  });
  let eligible = 0;
  let returned = 0;
  byCustomer.forEach(list => {
    list.forEach((job, index) => {
      const serviceDate = reportJobDate(job);
      const reminderDate = addDaysToDate(serviceDate, 75);
      if (!reminderDate || !inReportWindow(reminderDate, span)) return;
      eligible += 1;
      const next = list.slice(index + 1).find(nextJob => {
        const nextDate = reportJobDate(nextJob);
        return !!nextDate && nextDate >= reminderDate;
      });
      if (next) returned += 1;
    });
  });
  return {
    eligible,
    returned,
    rate: eligible ? (returned / eligible) * 100 : 0,
  };
}

function vehicleInsights(doneJobs) {
  const byVehicle = new Map();
  doneJobs
    .slice()
    .sort((a, b) => jobDateTimeValue(a) - jobDateTimeValue(b))
    .forEach(job => {
      const key = String(job.veh || '').trim();
      if (!key) return;
      const entry = byVehicle.get(key) || { name: key, visits: 0, gaps: [], lastDate: '' };
      entry.visits += 1;
      const date = reportJobDate(job);
      if (entry.lastDate && date) entry.gaps.push(daysSinceDate(entry.lastDate) - daysSinceDate(date));
      entry.lastDate = date;
      byVehicle.set(key, entry);
    });
  return [...byVehicle.values()]
    .map(entry => ({
      ...entry,
      avgGap: entry.gaps.length ? Math.abs(entry.gaps.reduce((sum, gap) => sum + gap, 0) / entry.gaps.length) : 0,
    }))
    .sort((a, b) => (b.visits - a.visits) || a.name.localeCompare(b.name))
    .slice(0, 6);
}

function revenueHeatmapData(doneJobs) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const slots = [
    { label: '08-10', start: 8, end: 10 },
    { label: '10-12', start: 10, end: 12 },
    { label: '12-14', start: 12, end: 14 },
    { label: '14-16', start: 14, end: 16 },
    { label: '16-18', start: 16, end: 18 },
    { label: '18-20', start: 18, end: 20 },
  ];
  const matrix = days.map(day => ({ day, values: slots.map(slot => ({ ...slot, amount: 0, jobs: 0 })) }));
  doneJobs.forEach(job => {
    const stamp = new Date(reportJobStamp(job));
    if (Number.isNaN(stamp.getTime())) return;
    const dayIndex = (stamp.getDay() + 6) % 7;
    const hour = stamp.getHours();
    const slotIndex = slots.findIndex(slot => hour >= slot.start && hour < slot.end);
    if (slotIndex < 0) return;
    matrix[dayIndex].values[slotIndex].amount += jobTotal(job);
    matrix[dayIndex].values[slotIndex].jobs += 1;
  });
  const max = Math.max(0, ...matrix.flatMap(row => row.values.map(cell => cell.amount)));
  return { days, slots, matrix, max };
}

function ltvLeaderboard() {
  const map = new Map();
  jobs
    .filter(job => isLiveJob(job) && job.status === 'done')
    .forEach(job => {
    const key = customerKeyFromJob(job);
    if (!key) return;
    const entry = map.get(key) || {
      key,
      name: job.cust || 'Unknown',
      phone: job.phone || '',
      visits: 0,
      spend: 0,
    };
    entry.visits += 1;
    entry.spend += jobTotal(job);
    map.set(key, entry);
  });
  return [...map.values()]
    .sort((a, b) => (b.spend - a.spend) || (b.visits - a.visits))
    .slice(0, 20);
}

function serviceProfitStats(doneJobs) {
  const groups = new Map();
  doneJobs.forEach(job => {
    const bucket = serviceBucket(job.prob);
    const entry = groups.get(bucket) || { name: bucket, jobs: 0, revenue: 0, partsCost: 0, discounts: 0 };
    entry.jobs += 1;
    entry.revenue += jobTotal(job);
    entry.partsCost += sumKnownPartsCost(job);
    entry.discounts += jobDiscountAmount(job);
    groups.set(bucket, entry);
  });
  return [...groups.values()]
    .map(entry => ({
      ...entry,
      grossProfit: entry.revenue - entry.partsCost,
      avgTicket: entry.jobs ? entry.revenue / entry.jobs : 0,
      marginPct: entry.revenue ? ((entry.revenue - entry.partsCost) / entry.revenue) * 100 : 0,
    }))
    .sort((a, b) => b.grossProfit - a.grossProfit);
}

function reportBundle(span, search = '') {
  const doneJobs = jobsInSpan(span, { doneOnly: true, search });
  const allJobs = jobs.filter(j =>
    isLiveJob(j)
    && 
    (inReportWindow(j.date || reportJobDate(j), span) || inReportWindow(reportJobDate(j), span))
    && matchesReportSearch(j, String(search || '').trim().toLowerCase())
  );
  const revenueEntries = revenueEntriesInSpan(span, search);
  const expenseRows = expensesInSpan(span);
  const revenue = revenueEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
  const expense = expenseRows.reduce((sum, entry) => sum + (entry.amount || 0), 0);
  const billed = doneJobs.reduce((sum, job) => sum + jobTotal(job), 0);
  const discounts = doneJobs.reduce((sum, job) => sum + jobDiscountAmount(job), 0);
  const paymentMix = revenueEntries.reduce((acc, entry) => {
    const bucket = methodBucket(entry.method);
    acc[bucket] += entry.amount || 0;
    return acc;
  }, { cash: 0, upi: 0, other: 0 });
  return {
    span,
    doneJobs,
    allJobs,
    revenueEntries,
    expenseRows,
    partsRows: partsLogInSpan(span),
    revenue,
    expense,
    net: revenue - expense,
    billed,
    discounts,
    invoices: doneJobs.length,
    avgInvoice: doneJobs.length ? billed / doneJobs.length : 0,
    paymentMix,
    invoiceRevenue: revenueEntries
      .filter(entry => entry.kind === 'invoice_payment' || entry.kind === 'advance')
      .reduce((sum, entry) => sum + (entry.amount || 0), 0),
    manualIncome: revenueEntries
      .filter(entry => entry.kind === 'regular_income' || entry.kind === 'other_income')
      .reduce((sum, entry) => sum + (entry.amount || 0), 0),
  };
}

function renderReports() {
  if (!requireAdminAccess('view reports')) { showPage('jobs'); return; }
  syncReportInputs();
  const span = reportWindow();
  const prevSpan = previousSpanFor(span);
  const q = reportFilters.search.trim().toLowerCase();
  const current = reportBundle(span, q);
  const previous = reportBundle(prevSpan, q);
  const todayInvoices = jobs.filter(j => isLiveJob(j) && j.status === 'done' && ((j.doneAt || '').slice(0, 10) || j.date || '') === today()).length;
  const yesterdayInvoices = jobs.filter(j => isLiveJob(j) && j.status === 'done' && ((j.doneAt || '').slice(0, 10) || j.date || '') === yesterday()).length;
  const filteredDone = current.doneJobs.slice().sort((a, b) => invoiceSortValue(b) - invoiceSortValue(a));
  const label = reportLabel(reportFilters.range, span.start, span.end);

  const revenueDelta = metricDeltaText(current.revenue, previous.revenue, fmtMoney);
  const expenseDelta = metricDeltaText(current.expense, previous.expense, fmtMoney);
  const netDelta = metricDeltaText(current.net, previous.net, fmtMoney);
  const invoiceDelta = metricDeltaText(current.invoices, previous.invoices, value => String(Math.round(value)));
  const avgInvoiceDelta = metricDeltaText(current.avgInvoice, previous.avgInvoice, fmtReportMoney);

  document.getElementById('rpt-period-current').textContent = label;
  document.getElementById('rpt-period-previous').textContent = reportLabel('custom', prevSpan.start, prevSpan.end);
  document.getElementById('rpt-period-sub').textContent = `Comparing ${label.toLowerCase()} with ${reportLabel('custom', prevSpan.start, prevSpan.end).toLowerCase()}.`;
  const rptTodayInvoices = document.getElementById('rpt-today-invoices');
  const rptYesterdayInvoices = document.getElementById('rpt-yesterday-invoices');
  if (rptTodayInvoices) rptTodayInvoices.textContent = String(todayInvoices);
  if (rptYesterdayInvoices) rptYesterdayInvoices.textContent = String(yesterdayInvoices);

  document.getElementById('rpt-rev').textContent = fmtMoney(current.revenue);
  document.getElementById('rpt-exp').textContent = fmtMoney(current.expense);
  document.getElementById('rpt-profit').textContent = fmtMoney(current.net);
  document.getElementById('rpt-profit').style.color = current.net >= 0 ? 'var(--acc)' : 'var(--dan)';
  document.getElementById('rpt-jobs').textContent = String(current.invoices);
  document.getElementById('rpt-avg-invoice').textContent = fmtReportMoney(current.avgInvoice);
  document.getElementById('rpt-rev-delta').innerHTML = `<span class="delta-pill ${metricDeltaClass(revenueDelta)}">${revenueDelta.text}</span>`;
  document.getElementById('rpt-exp-delta').innerHTML = `<span class="delta-pill ${metricDeltaClass(expenseDelta, true)}">${expenseDelta.text}</span>`;
  document.getElementById('rpt-profit-delta').innerHTML = `<span class="delta-pill ${metricDeltaClass(netDelta)}">${netDelta.text}</span>`;
  document.getElementById('rpt-jobs-delta').innerHTML = `<span class="delta-pill ${metricDeltaClass(invoiceDelta)}">${invoiceDelta.text}</span>`;
  document.getElementById('rpt-avg-invoice-delta').innerHTML = `<span class="delta-pill ${metricDeltaClass(avgInvoiceDelta)}">${avgInvoiceDelta.text}</span>`;

  const mechTitle = document.getElementById('rpt-mech-title');
  if (mechTitle) mechTitle.textContent = `Mechanic Performance — ${label}`;
  const partsTitle = document.getElementById('rpt-parts-title');
  if (partsTitle) partsTitle.textContent = `Top Parts Used — ${label}`;

  const compareRows = [
    { label: 'Total Revenue', current: current.revenue, previous: previous.revenue, fmt: fmtMoney },
    { label: 'Total Expenses', current: current.expense, previous: previous.expense, fmt: fmtMoney, inverse: true },
    { label: 'Net Profit', current: current.net, previous: previous.net, fmt: fmtMoney },
    { label: 'Invoices Issued', current: current.invoices, previous: previous.invoices, fmt: value => String(Math.round(value || 0)) },
    { label: 'Avg. Invoice Value', current: current.avgInvoice, previous: previous.avgInvoice, fmt: fmtReportMoney },
    { label: 'Total Discounts', current: current.discounts, previous: previous.discounts, fmt: fmtMoney, inverse: true },
  ];
  document.getElementById('rpt-exec-table').innerHTML = compareRows.map(row => {
    const delta = metricDelta(row.current, row.previous);
    return `<tr>
      <td>${row.label}</td>
      <td>${row.fmt(row.current)}</td>
      <td>${row.fmt(row.previous)}</td>
      <td><span class="delta-pill ${metricDeltaClass(delta, !!row.inverse)}">${delta.text}</span></td>
    </tr>`;
  }).join('');

  const paymentTotal = current.paymentMix.cash + current.paymentMix.upi + current.paymentMix.other;
  const paymentMix = document.getElementById('rpt-payment-mix');
  if (paymentMix) {
    const mixRow = (labelText, value, cls, hint) => {
      const pct = paymentTotal ? (value / paymentTotal) * 100 : 0;
      return `
        <div class="report-bar-row">
          <div>
            <div class="report-bar-label">${labelText}</div>
            <div class="report-bar-hint">${hint}</div>
          </div>
          <div class="report-bar-metric">${fmtMoney(value)} · ${pct.toFixed(0)}%</div>
          <div class="report-bar-track"><div class="report-bar-fill ${cls}" style="width:${value ? Math.max(6, pct) : 0}%"></div></div>
        </div>`;
    };
    paymentMix.innerHTML = `
      ${mixRow('Cash', current.paymentMix.cash, 'cash', 'Manual handling / drawer load')}
      ${mixRow('UPI', current.paymentMix.upi, 'upi', 'Digital collection / reconciliation')}
      ${mixRow('Other', current.paymentMix.other, 'other', 'Advance / mixed / uncategorized')}
    `;
  }

  const discountImpact = document.getElementById('rpt-discount-impact');
  if (discountImpact) {
    const grossBeforeDiscount = current.doneJobs.reduce((sum, job) => sum + jobSubtotal(job), 0);
    const discountRate = grossBeforeDiscount ? (current.discounts / grossBeforeDiscount) * 100 : 0;
    discountImpact.innerHTML = `
      <div class="report-callout">
        <div class="report-callout-label">Discount Impact</div>
        <div class="report-callout-value">${fmtMoney(current.discounts)}</div>
        <div class="report-callout-copy">${discountRate.toFixed(1)}% of billed value in this period. Use this to watch margin leakage.</div>
      </div>`;
  }

  const financeBreakdown = document.getElementById('rpt-finance-breakdown');
  if (financeBreakdown) {
    financeBreakdown.innerHTML = `
      <div class="mrow"><span>Invoice collections</span><span style="font-family:var(--fh);font-weight:700;color:var(--acc);">${fmtMoney(current.invoiceRevenue)}</span></div>
      <div class="mrow"><span>Manual income</span><span style="font-family:var(--fh);font-weight:700;color:var(--acc2);">${fmtMoney(current.manualIncome)}</span></div>
      <div class="mrow"><span>Expenses</span><span style="font-family:var(--fh);font-weight:700;color:var(--dan);">${fmtMoney(current.expense)}</span></div>
      <div class="mrow"><span>Net</span><span style="font-family:var(--fh);font-weight:700;color:${current.net >= 0 ? 'var(--acc)' : 'var(--dan)'};">${fmtMoney(current.net)}</span></div>`;
  }

  // ─ Mechanic performance
  const mechanicRows = reportMechanicRows(filteredDone, current.revenueEntries);
  const mechanicCards = mechanicRows.map(m => {
    const mechanicIds = uniqStrings([m.id].concat(m.ids || []).map(id => String(id || '').trim()).filter(Boolean));
    const mechanicName = mechanicReportNameKey(m.name);
    const mJobs = filteredDone.filter(j => {
      const ids = jobMechanicIds(j).map(id => String(id || '').trim());
      if (mechanicIds.some(id => ids.includes(id))) return true;
      const names = mechanicReferenceNames(j).map(mechanicReportNameKey);
      return !!mechanicName && names.includes(mechanicName);
    });
    const quickIncomeRows = current.revenueEntries.filter(entry => {
      if (!(entry.source === 'income' && entry.kind === 'regular_income')) return false;
      const entryId = String(entry.mechId || '').trim();
      const entryName = mechanicReportNameKey(entry.mechName);
      if (entryId && mechanicIds.includes(entryId)) return true;
      return !!mechanicName && entryName === mechanicName;
    });
    const jobRevenue = mJobs.reduce((sum, j) => sum + (jobTotal(j) / Math.max(1, jobMechanicIds(j).length)), 0);
    const quickIncomeRevenue = quickIncomeRows.reduce((sum, entry) => sum + (entry.amount || 0), 0);
    const revenue = jobRevenue + quickIncomeRevenue;
    const hours = mJobs.map(j => hoursBetween(reportCreatedStamp(j), reportJobStamp(j))).filter(Boolean);
    const avgHours = hours.length ? hours.reduce((sum, value) => sum + value, 0) / hours.length : 0;
    const topServiceCounts = {};
    mJobs.forEach(job => {
      const bucket = serviceBucket(job.prob);
      topServiceCounts[bucket] = (topServiceCounts[bucket] || 0) + 1;
    });
    if (quickIncomeRows.length) {
      topServiceCounts['Quick Income'] = (topServiceCounts['Quick Income'] || 0) + quickIncomeRows.length;
    }
    const topService = Object.entries(topServiceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'No completed jobs';
    const workCount = mJobs.length + quickIncomeRows.length;
    return `
      <div class="report-person-row">
        <div class="report-person-main">
          <div class="mech-avatar sm" style="background:${m.color};">${m.name.charAt(0)}</div>
          <div>
            <div class="report-person-name">${m.name}</div>
            <div class="report-person-meta">${topService}</div>
          </div>
        </div>
        <div class="report-person-stats">
        <div class="report-person-strong">${fmtMoney(revenue)}</div>
        <div class="report-person-meta">${workCount} entries · ${avgHours ? `${avgHours.toFixed(1)}h avg` : 'No cycle data'}</div>
      </div>
      </div>`;
  });

  const unassignedJobs = filteredDone.filter(j => {
    const ids = jobMechanicIds(j).map(id => String(id || '').trim()).filter(Boolean);
    if (ids.length) return false;
    const labels = mechanicReferenceNames(j);
    return !labels.length || labels.every(isPlaceholderMechanicLabel);
  });
  const unassignedIncomeRows = current.revenueEntries.filter(entry => {
    if (!(entry.source === 'income' && entry.kind === 'regular_income')) return false;
    const entryId = String(entry.mechId || '').trim();
    const entryName = String(entry.mechName || '').trim();
    return !entryId && isPlaceholderMechanicLabel(entryName);
  });
  const unassignedRevenue = unassignedJobs.reduce((sum, j) => sum + jobTotal(j), 0)
    + unassignedIncomeRows.reduce((sum, entry) => sum + (entry.amount || 0), 0);
  const unassignedCount = unassignedJobs.length + unassignedIncomeRows.length;
  if (unassignedCount > 0) {
    mechanicCards.push(`
      <div class="report-person-row">
        <div class="report-person-main">
          <div class="mech-avatar sm" style="background:#8a8f9e;">N</div>
          <div>
            <div class="report-person-name">No mechanic revenue</div>
            <div class="report-person-meta">Unassigned jobs / income</div>
          </div>
        </div>
        <div class="report-person-stats">
          <div class="report-person-strong">${fmtMoney(unassignedRevenue)}</div>
          <div class="report-person-meta">${unassignedCount} entries</div>
        </div>
      </div>`);
  }

  document.getElementById('rpt-mechs').innerHTML = mechanicCards.join('') || '<div class="report-empty">No mechanic records yet.</div>';

  // ─ Top parts used
  const partCounts = {};
  current.partsRows.forEach(p=>{
    partCounts[p.part] = (partCounts[p.part]||0)+1;
  });
  const topParts = Object.entries(partCounts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  document.getElementById('rpt-parts').innerHTML = topParts.length ?
    topParts.map(([name,qty])=>`
      <div class="mrow">
        <span style="font-size:12px;">${name}</span>
        <span style="font-family:var(--fh);font-size:15px;font-weight:700;color:var(--acc2)">${qty}×</span>
      </div>`).join('') :
    '<div style="color:var(--mut);font-size:12px;padding:8px 0;">No parts logged in this period</div>';

  // ─ Reorder list
  const liveStock = stock.filter(isLiveStockItem);
  const low = liveStock.filter(s => stSt(s) !== 'ok');
  document.getElementById('rpt-reorder').innerHTML = low.length ?
    low.map(s=>`
      <div class="mrow">
        <span style="font-size:12px;">${s.name}</span>
        <span class="sst ${stSt(s)}">${s.qty} left</span>
      </div>`).join('') :
    '<div style="color:var(--acc);font-size:13px;padding:8px 0;">All stock OK ✓</div>';

  // ─ Stock value
  const stockVal = liveStock.reduce((a,s)=>a+s.qty*(s.cost||0),0);
  const sellVal  = liveStock.reduce((a,s)=>a+s.qty*(s.sellPrice||s.cost||0),0);
  document.getElementById('rpt-stock-cost').textContent = fmtMoney(stockVal);
  document.getElementById('rpt-stock-sell').textContent = fmtMoney(sellVal);

  const openJobs = jobs.filter(j => isLiveJob(j) && j.status !== 'done').filter(j => matchesReportSearch(j, q));
  const nowStamp = nowISO();
  const statusOrder = [
    { key: 'waiting', label: 'Waiting' },
    { key: 'in-progress', label: 'In Progress' },
    { key: 'parts-needed', label: 'Parts Needed' },
    { key: 'ready', label: 'Ready' },
    { key: 'returned', label: 'Returned' },
  ];
  document.getElementById('rpt-bottlenecks').innerHTML = statusOrder.map(status => {
    const items = openJobs.filter(job => job.status === status.key);
    const ages = items.map(job => hoursBetween(reportCreatedStamp(job), nowStamp));
    const avgAge = ages.length ? ages.reduce((sum, value) => sum + value, 0) / ages.length : 0;
    const oldest = ages.length ? Math.max(...ages) : 0;
    return `
      <div class="report-status-card">
        <div class="report-status-head">
          <span>${status.label}</span>
          <span class="sst ${status.key === 'parts-needed' || status.key === 'returned' ? 'out' : status.key === 'ready' ? 'ok' : 'low'}">${items.length}</span>
        </div>
        <div class="report-status-metrics">
          <div><span>Avg age</span><strong>${avgAge ? `${avgAge.toFixed(avgAge >= 24 ? 0 : 1)}${avgAge >= 24 ? 'h+' : 'h'}` : '—'}</strong></div>
          <div><span>Oldest</span><strong>${oldest ? `${oldest.toFixed(oldest >= 24 ? 0 : 1)}${oldest >= 24 ? 'h+' : 'h'}` : '—'}</strong></div>
        </div>
      </div>`;
  }).join('');

  const usage30 = usageCountBySku(30);
  const fastMovers = Object.entries(usage30).sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([sku, count]) => ({ item: liveStock.find(entry => entry.sku === sku), count }))
    .filter(entry => entry.item);
  const deadStock = liveStock.filter(item => item.qty > 0 && daysSince(latestMovementDateForItem(item)) >= 60);
  const multiFitmentCount = liveStock.filter(item => uniqStrings([...(item.fitmentModels || []), ...(item.fits || [])]).length > 1).length;
  const aliasCoverage = liveStock.filter(item => Array.isArray(item.aliases) && item.aliases.length).length;
  document.getElementById('rpt-turnover').innerHTML = `
    <div class="report-mini-stats">
      <div class="report-mini-stat"><span>Fast movers (30d)</span><strong>${fastMovers.length}</strong></div>
      <div class="report-mini-stat"><span>Dead stock (60d)</span><strong>${deadStock.length}</strong></div>
      <div class="report-mini-stat"><span>Multi-fitment parts</span><strong>${multiFitmentCount}</strong></div>
      <div class="report-mini-stat"><span>Alias mapped</span><strong>${aliasCoverage}</strong></div>
    </div>
    <div class="report-sublist">
      ${(fastMovers.length ? fastMovers : []).map(({ item, count }) => `
        <div class="mrow">
          <span>${item.name}</span>
          <span style="color:var(--acc2);font-family:var(--fh);font-weight:700;">${count} moves</span>
        </div>`).join('') || '<div class="report-empty">Not enough movement history yet.</div>'}
    </div>`;

  const forecastItems = liveStock
    .map(item => {
      const usage = usage30[item.sku] || 0;
      const daily = usage / 30;
      const daysLeft = daily > 0 ? item.qty / daily : Infinity;
      const ratio = item.min > 0 ? Math.max(0, Math.min(1.2, item.qty / item.min)) : 1;
      const urgent = item.qty <= item.min || daysLeft <= 14;
      return { item, usage, daily, daysLeft, ratio, urgent };
    })
    .filter(entry => entry.urgent)
    .sort((a, b) => {
      const left = Number.isFinite(a.daysLeft) ? a.daysLeft : 9999;
      const right = Number.isFinite(b.daysLeft) ? b.daysLeft : 9999;
      return left - right;
    })
    .slice(0, 6);
  document.getElementById('rpt-forecast').innerHTML = forecastItems.length ? forecastItems.map(({ item, usage, daysLeft, ratio }) => `
    <div class="report-forecast-item">
      <div class="report-forecast-head">
        <span>${item.name}</span>
        <span class="report-forecast-value">${item.qty} / min ${item.min}</span>
      </div>
      <div class="report-bar-track compact"><div class="report-bar-fill warn" style="width:${item.qty > 0 ? Math.max(8, Math.min(100, ratio * 100)) : 0}%"></div></div>
      <div class="report-forecast-meta">${usage} moves in 30d · ${Number.isFinite(daysLeft) ? `${daysLeft.toFixed(daysLeft >= 10 ? 0 : 1)} days left` : 'low movement history'}</div>
    </div>`).join('') : '<div class="report-empty">No immediate stock-out pressure right now.</div>';

  const retention = retentionSummary(span);
  document.getElementById('rpt-retention').innerHTML = `
    <div class="report-callout">
      <div class="report-callout-label">Repeat Customer Rate</div>
      <div class="report-callout-value">${retention.rate.toFixed(0)}%</div>
      <div class="report-callout-copy">${retention.repeat} of ${retention.served} customers served in this period were repeat visitors.</div>
    </div>`;

  const followup = followupConversionProxy(span);
  document.getElementById('rpt-followup').innerHTML = `
    <div class="report-callout subtle">
      <div class="report-callout-label">Service Reminder Return Proxy</div>
      <div class="report-callout-value">${followup.rate.toFixed(0)}%</div>
      <div class="report-callout-copy">${followup.returned} returned from ${followup.eligible} reminder-eligible histories in this period. This is a conversion proxy based on revisit timing.</div>
    </div>`;

  const vehicles = vehicleInsights(filteredDone);
  document.getElementById('rpt-vehicle-insights').innerHTML = vehicles.length ? vehicles.map(item => `
    <div class="mrow">
      <span>${item.name}</span>
      <span style="text-align:right;">
        <b style="color:var(--acc);font-family:var(--fh);">${item.visits} visits</b>
        <span style="display:block;font-size:10px;color:var(--mut);">${item.avgGap ? `${item.avgGap.toFixed(0)}d avg revisit` : 'single visit'}</span>
      </span>
    </div>`).join('') : '<div class="report-empty">No completed vehicle history for this period.</div>';

  const ltv = ltvLeaderboard();
  document.getElementById('rpt-ltv').innerHTML = ltv.length ? ltv.slice(0, 10).map((item, index) => `
    <div class="report-person-row">
      <div class="report-person-main">
        <div class="report-rank">${index + 1}</div>
        <div>
          <div class="report-person-name">${item.name}</div>
          <div class="report-person-meta">${item.phone || 'No phone'} · ${item.visits} visits</div>
        </div>
      </div>
      <div class="report-person-strong">${fmtMoney(item.spend)}</div>
    </div>`).join('') : '<div class="report-empty">No customer spend history yet.</div>';

  const serviceStats = serviceProfitStats(filteredDone);
  const bestProfit = Math.max(0, ...serviceStats.map(item => item.grossProfit));
  document.getElementById('rpt-service-profit').innerHTML = serviceStats.length ? `
    <div class="report-analysis-grid">
      ${serviceStats.map(item => `
        <div class="report-analysis-card">
          <div class="report-analysis-head">
            <div>
              <div class="report-analysis-title">${item.name}</div>
              <div class="report-analysis-sub">${item.jobs} jobs</div>
            </div>
            <div class="report-analysis-strong">${fmtMoney(item.grossProfit)}</div>
          </div>
          <div class="report-inline-bar"><span style="width:${bestProfit ? (item.grossProfit / bestProfit) * 100 : 0}%"></span></div>
          <div class="report-analysis-metrics">
            <div class="report-analysis-metric"><span>Revenue</span><strong>${fmtMoney(item.revenue)}</strong></div>
            <div class="report-analysis-metric"><span>Parts Cost</span><strong>${fmtMoney(item.partsCost)}</strong></div>
            <div class="report-analysis-metric"><span>Avg Ticket</span><strong>${fmtReportMoney(item.avgTicket)}</strong></div>
            <div class="report-analysis-metric"><span>Margin</span><strong>${item.marginPct.toFixed(0)}%</strong></div>
          </div>
        </div>`).join('')}
    </div>` : '<div class="report-empty">No service-type profitability data yet.</div>';

  const systemHealth = document.getElementById('rpt-system-health');
  if (systemHealth) {
    const healthy = !syncMeta.pendingSync && !syncMeta.lastSyncError;
    systemHealth.innerHTML = `
      <div class="report-mini-stats">
        <div class="report-mini-stat"><span>Sync state</span><strong style="color:${healthy ? 'var(--acc)' : 'var(--warn)'};">${healthy ? 'Stable' : syncMeta.pendingSync ? 'Pending Sync' : 'Attention'}</strong></div>
        <div class="report-mini-stat"><span>Last push</span><strong>${syncMeta.lastPushedAt ? fmtDateTime(syncMeta.lastPushedAt) : '—'}</strong></div>
        <div class="report-mini-stat"><span>Last cloud upload</span><strong>${syncMeta.lastRemoteUpdatedAt ? fmtDateTime(syncMeta.lastRemoteUpdatedAt) : '—'}</strong></div>
        <div class="report-mini-stat"><span>Pending local changes</span><strong>${syncMeta.pendingSync ? 'Yes' : 'No'}</strong></div>
      </div>
      <div class="report-sublist" style="margin-top:12px;">
        <div class="mrow"><span>Last pull</span><span>${syncMeta.lastPulledAt ? fmtDateTime(syncMeta.lastPulledAt) : '—'}</span></div>
        <div class="mrow"><span>Last merge</span><span>${syncMeta.lastMergeSummary || 'None'}</span></div>
        <div class="mrow"><span>Local backup</span><span>${syncMeta.localBackupAt ? fmtDateTime(syncMeta.localBackupAt) : '—'}</span></div>
        <div class="mrow"><span>Last error</span><span>${syncMeta.lastSyncError || 'None'}</span></div>
      </div>`;
  }

  const body = document.getElementById('rpt-tbody');
  if (!body) return;
  if (!filteredDone.length) {
    body.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--mut);">No invoices found for ${label.toLowerCase()}.</td></tr>`;
    return;
  }
  body.innerHTML = filteredDone.map(j => {
    const stamp = reportJobStamp(j);
    const total = jobTotal(j);
    const paid = jobPaid(j);
    const due = jobDue(j);
    const advance = jobAdvance(j);
    const invoiceRef = escapeAttr(j.invoiceNo || j.id || '');
    const custName = escapeAttr(j.cust || '');
    const phone = escapeAttr(j.phone || '—');
    const vehicle = escapeAttr(j.veh || '');
    const regNo = escapeAttr(j.vno || '');
    return `<tr>
      <td style="font-size:12px;">${fmtDate(stamp)}<br><span style="color:var(--mut)">${new Date(stamp).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })}</span></td>
      <td style="font-family:var(--fh);font-weight:700;color:var(--acc);">${invoiceRef}</td>
      <td>${custName}<br><span style="font-size:11px;color:var(--mut)">${phone}</span></td>
      <td style="font-size:12px;">${vehicle}<br><span style="color:var(--mut)">${regNo}</span></td>
      <td style="font-family:var(--fh);font-weight:700;">${fmtMoney(total)}</td>
      <td style="color:#00c896;">${paid > 0 ? fmtMoney(paid) : '—'}</td>
      <td style="${due > 0 ? 'color:var(--dan);font-weight:700' : advance > 0 ? 'color:#00c896;font-weight:700' : 'color:var(--mut)'};">${due > 0 ? `Owe ${fmtMoney(due)}` : advance > 0 ? `Advance ${fmtMoney(advance)}` : 'Clear'}</td>
      <td>${typeof photoThumbWithCount === 'function' ? photoThumbWithCount(j.invoicePhotos || j.invoicePhoto || j.photos || j.photo || '', 'Invoice Photo Reference') : ((j.invoicePhoto || j.photo) ? `<img src="${j.invoicePhoto || j.photo}" alt="Invoice vehicle photo" class="clickable-photo" style="width:54px;height:54px;object-fit:cover;border-radius:8px;border:1px solid var(--bor);" onclick="openImageViewer('${escapeAttr(j.invoicePhoto || j.photo)}','Invoice Photo Reference')">` : '<span style="color:var(--mut);font-size:12px;">—</span>')}</td>
    </tr>`;
  }).join('');
}

let logFilters = { q: '', action: '', entity: '' };
let logsCloudRefreshBusy = false;

async function refreshLogsFromCloud() {
  if (logsCloudRefreshBusy || typeof canUseCloudConfig !== 'function' || !canUseCloudConfig()) return false;
  if (typeof ensureCloudClient !== 'function' || typeof getCloudSession !== 'function') return false;
  logsCloudRefreshBusy = true;
  const body = document.getElementById('logs-list');
  if (body) body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--mut);">Loading logs from cloud...</div>';
  try {
    const client = ensureCloudClient();
    const session = await getCloudSession();
    if (!client || !session) return false;
    const { data, error } = await client
      .from('garage_audit_log')
      .select('record_data,source_updated_at,mirrored_at')
      .is('deleted_at', null)
      .order('source_updated_at', { ascending: false })
      .range(0, 999);
    if (error) throw error;
    const rows = (data || [])
      .map(row => row?.record_data || null)
      .filter(Boolean);
    if (!rows.length) return false;
    auditLog = rows;
    if (typeof saveAll === 'function') saveAll({ preserveUpdatedAt: true, skipSync: true, domain: 'audit' });
    return true;
  } catch (err) {
    console.warn('Cloud log refresh failed', err);
    if (body) body.innerHTML = `<div style="text-align:center;padding:40px;color:var(--mut);">Could not load logs from cloud. ${err?.message || ''}</div>`;
    return false;
  } finally {
    logsCloudRefreshBusy = false;
  }
}

function renderLogs() {
  if (!requireAdminAccess('view logs')) { showPage('jobs'); return; }
  const q = (logFilters.q || '').trim().toLowerCase();
  let list = auditLog.slice();
  if (q) {
    list = list.filter(log =>
      (log.by || '').toLowerCase().includes(q) ||
      (log.entity || '').toLowerCase().includes(q) ||
      (log.action || '').toLowerCase().includes(q) ||
      (log.entityId || '').toLowerCase().includes(q) ||
      JSON.stringify(log.details || {}).toLowerCase().includes(q)
    );
  }
  if (logFilters.action) list = list.filter(log => log.action === logFilters.action);
  if (logFilters.entity) list = list.filter(log => log.entity === logFilters.entity);

  const actions = [...new Set(auditLog.map(log => log.action).filter(Boolean))].sort();
  const entities = [...new Set(auditLog.map(log => log.entity).filter(Boolean))].sort();
  const actionSel = document.getElementById('logs-action');
  const entitySel = document.getElementById('logs-entity');
  if (actionSel) {
    actionSel.innerHTML = '<option value="">All actions</option>' + actions.map(v => `<option value="${v}">${v}</option>`).join('');
    actionSel.value = logFilters.action;
  }
  if (entitySel) {
    entitySel.innerHTML = '<option value="">All modules</option>' + entities.map(v => `<option value="${v}">${v}</option>`).join('');
    entitySel.value = logFilters.entity;
  }

  const body = document.getElementById('logs-list');
  if (!body) return;
  if (!list.length) {
    body.innerHTML = auditLog.length
      ? '<div style="text-align:center;padding:40px;color:var(--mut);">No logs match the current search/filter.</div>'
      : '<div style="text-align:center;padding:40px;color:var(--mut);">No log entries found.</div>';
    return;
  }
  const pageInfo = typeof paginatedLongList === 'function'
    ? paginatedLongList('logs', list)
    : { items: list, total: list.length, page: 1, pages: 1, pageSize: list.length || 1, start: 0, end: list.length };
  const pager = typeof longListPagerHtml === 'function' ? longListPagerHtml('logs', pageInfo, 'logs') : '';
  body.innerHTML = `${pager}<table style="width:100%;border-collapse:collapse;min-width:760px;">
    <thead>
      <tr>
        <th>Time</th>
        <th>User</th>
        <th>Action</th>
        <th>Module</th>
        <th>Record</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody>
      ${pageInfo.items.map(log => `
        <tr>
          <td style="font-size:12px;color:var(--mut);">${fmtDateTime(log.at)}</td>
          <td style="font-size:12px;">${log.by || 'local-device'}</td>
          <td style="text-transform:capitalize;font-weight:700;">${log.action || 'update'}</td>
          <td style="text-transform:capitalize;">${log.entity || 'record'}</td>
          <td style="font-family:var(--fh);font-size:12px;">${log.entityId || '—'}</td>
          <td style="font-size:11px;color:var(--mut);">${Object.keys(log.details || {}).length ? JSON.stringify(log.details) : '—'}</td>
        </tr>`).join('')}
    </tbody>
  </table>${pager}`;
}

function filterLogsSearch(v) {
  logFilters.q = v || '';
  if (typeof resetLongListPage === 'function') resetLongListPage('logs');
  if (typeof debouncePerf === 'function') {
    debouncePerf('logs-search', renderLogs, 220);
  } else {
    renderLogs();
  }
}

function filterLogsAction(v) {
  logFilters.action = v || '';
  if (typeof resetLongListPage === 'function') resetLongListPage('logs');
  renderLogs();
}

function filterLogsEntity(v) {
  logFilters.entity = v || '';
  if (typeof resetLongListPage === 'function') resetLongListPage('logs');
  renderLogs();
}

function sendClosingSummary() {
  const span = reportWindow();
  const singleDay = span.start === span.end;
  const label = reportLabel(reportFilters.range, span.start, span.end);
  const jobsAdded = jobs.filter(j => isLiveJob(j) && inReportWindow(j.date, span));
  const invoices = jobs.filter(j => isLiveJob(j) && j.status === 'done' && inReportWindow(reportJobDate(j), span));
  const revenueEntries = allRevenueEntries().filter(entry => inReportWindow(entry.date, span));
  const expensesInRange = expenses.filter(e => isLiveExpense(e) && inReportWindow(e.date, span));
  const totalRevenue = revenueEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
  const cashRevenue = revenueEntries
    .filter(entry => String(entry.method || '').toLowerCase() === 'cash')
    .reduce((sum, entry) => sum + (entry.amount || 0), 0);
  const upiRevenue = revenueEntries
    .filter(entry => String(entry.method || '').toLowerCase() === 'upi')
    .reduce((sum, entry) => sum + (entry.amount || 0), 0);
  const totalExpense = expensesInRange.reduce((sum, e) => sum + (e.amount || 0), 0);
  const doneCount = invoices.length;
  const low = stock.filter(s => stSt(s) !== 'ok').map(s => s.name).join(', ');
  const header = singleDay ? fmtDate(span.start) : label;
  const msg = `🔧 JALASAI CLOSING SUMMARY — ${header}\n\nBikes Added: ${jobsAdded.length}\nInvoices: ${invoices.length}\nDone Jobs: ${doneCount}\nRevenue: ${fmtMoney(totalRevenue)}\nCash: ${fmtMoney(cashRevenue)}\nUPI: ${fmtMoney(upiRevenue)}\nExpenses: ${fmtMoney(totalExpense)}\nNet: ${fmtMoney(totalRevenue - totalExpense)}${low ? `\n\n⚠ Reorder:\n${low}` : '\n\n✓ Stock OK'}`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg));
}

function aiDraftClosingSummary() {
  if (typeof openAiAssistModal !== 'function') {
    toast('AI assist modal is not ready');
    return;
  }
  const span = reportWindow();
  const singleDay = span.start === span.end;
  const label = reportLabel(reportFilters.range, span.start, span.end);
  const jobsAdded = jobs.filter(j => isLiveJob(j) && inReportWindow(j.date, span));
  const invoices = jobs.filter(j => isLiveJob(j) && j.status === 'done' && inReportWindow(reportJobDate(j), span));
  const revenueEntries = allRevenueEntries().filter(entry => inReportWindow(entry.date, span));
  const expensesInRange = expenses.filter(e => isLiveExpense(e) && inReportWindow(e.date, span));
  const totalRevenue = revenueEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
  const cashRevenue = revenueEntries
    .filter(entry => String(entry.method || '').toLowerCase() === 'cash')
    .reduce((sum, entry) => sum + (entry.amount || 0), 0);
  const upiRevenue = revenueEntries
    .filter(entry => String(entry.method || '').toLowerCase() === 'upi')
    .reduce((sum, entry) => sum + (entry.amount || 0), 0);
  const totalExpense = expensesInRange.reduce((sum, e) => sum + (e.amount || 0), 0);
  const low = stock.filter(s => stSt(s) !== 'ok').map(s => s.name).slice(0, 15);
  const prompt = [
    'Write a short WhatsApp-ready closing summary for the garage owner.',
    '',
    'Rules:',
    '- Keep it practical and short.',
    '- Mention only the business facts provided below.',
    '- Do not invent extra revenue, expenses, or stock items.',
    '- Return plain text only.',
    '',
    `Period: ${singleDay ? fmtDate(span.start) : label}`,
    `Bikes Added: ${jobsAdded.length}`,
    `Invoices: ${invoices.length}`,
    `Done Jobs: ${invoices.length}`,
    `Revenue: ${fmtMoney(totalRevenue)}`,
    `Cash: ${fmtMoney(cashRevenue)}`,
    `UPI: ${fmtMoney(upiRevenue)}`,
    `Expenses: ${fmtMoney(totalExpense)}`,
    `Net: ${fmtMoney(totalRevenue - totalExpense)}`,
    `Low Stock / Reorder: ${low.length ? low.join(', ') : 'None'}`,
    '',
    'Write it in a clean owner-friendly format with 3 short sections:',
    '1. Today / Period summary',
    '2. Money summary',
    '3. Attention needed tomorrow',
  ].join('\n');
  openAiAssistModal('AI Draft Closing Summary', prompt);
}
