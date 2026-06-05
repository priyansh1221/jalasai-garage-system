// ═══════════════════════════════════════════════════════
//  Expenses module
// ═══════════════════════════════════════════════════════

let expFilter = {
  range: 'today',
  start: today(),
  end: today(),
  year: new Date().getFullYear(),
  cat: '',
};
const DEFAULT_EXPENSE_CATEGORIES = ['Parts', 'Miscellaneous', 'Colour Work', 'Tyre', 'Welding', 'Jumper Repair', 'Fuel', 'Salary', 'Supplier Purchase', 'Rent', 'Tools', 'Utilities', 'Marketing'];
let editIncomeId = null;

function incomeTypeLabel(kind) {
  return kind === 'regular_income' ? 'Regular' : kind === 'other_income' ? 'Other' : 'Income';
}

function expenseDateSpan(range) {
  const todayStr = today();
  if (range === 'yesterday') {
    return { start: yesterday(), end: yesterday() };
  }
  if (range === 'year') {
    const currentYear = parseInt(todayStr.slice(0, 4), 10) || new Date().getFullYear();
    const yr = parseInt(expFilter.year || currentYear, 10) || currentYear;
    return { start: `${yr}-01-01`, end: `${yr}-12-31` };
  }
  const start = range === 'week'
    ? addDaysToDate(todayStr, -6)
    : range === 'month'
      ? `${todayStr.slice(0, 7)}-01`
      : todayStr;
  if (range === 'date' || range === 'today') return { start: expFilter.start || todayStr, end: expFilter.start || todayStr };
  if (range === 'custom') {
    const customStart = expFilter.start || expFilter.end || todayStr;
    const customEnd = expFilter.end || expFilter.start || customStart;
    return customStart <= customEnd ? { start: customStart, end: customEnd } : { start: customEnd, end: customStart };
  }
  return { start, end: todayStr };
}

function availableExpenseYears() {
  const years = new Set([new Date().getFullYear()]);
  (window.appState?.expenses || expenses).filter(isLiveExpense).forEach(e => {
    if (e.date) years.add(parseInt(String(e.date).slice(0, 4), 10));
  });
  return [...years].filter(Boolean).sort((a, b) => b - a);
}

function syncExpenseInputs() {
  const rangeSelectors = ['exp-range', 'income-range'].map(id => document.getElementById(id)).filter(Boolean);
  const yearSelectors = ['exp-year-filter', 'income-year-filter'].map(id => document.getElementById(id)).filter(Boolean);
  const startInputs = ['exp-start', 'income-start'].map(id => document.getElementById(id)).filter(Boolean);
  const endInputs = ['exp-end', 'income-end'].map(id => document.getElementById(id)).filter(Boolean);
  rangeSelectors.forEach(sel => { sel.value = expFilter.range; });
  yearSelectors.forEach(yearSel => {
    const years = availableExpenseYears();
    yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    yearSel.value = String(expFilter.year || years[0] || new Date().getFullYear());
    yearSel.style.display = expFilter.range === 'year' ? '' : 'none';
  });
  const span = expenseDateSpan(expFilter.range);
  startInputs.forEach(startEl => { startEl.value = span.start; });
  endInputs.forEach(endEl => {
    endEl.value = span.end;
    endEl.disabled = ['today', 'yesterday', 'week', 'month', 'year', 'date'].includes(expFilter.range);
  });
}

function inExpenseWindow(dateValue, span) {
  const value = String(dateValue || '');
  if (!value) return false;
  return value >= span.start && value <= span.end;
}

function expenseCategories() {
  return [...new Set(DEFAULT_EXPENSE_CATEGORIES.concat((window.appState?.expenses || expenses).map(e => e.cat).filter(Boolean)))].sort();
}

function refreshExpenseCategoryControls() {
  const filterSel = document.getElementById('exp-cat-filter');
  if (filterSel) {
    const cur = expFilter.cat || '';
    filterSel.innerHTML = '<option value="">All categories</option>' + expenseCategories().map(cat => `<option value="${cat}">${cat}</option>`).join('');
    filterSel.value = cur;
  }
  const editSel = document.getElementById('em-cat');
  if (editSel) {
    const cur = editSel.value || 'Parts';
    editSel.innerHTML = expenseCategories().map(cat => `<option value="${cat}">${cat}</option>`).join('');
    editSel.value = expenseCategories().includes(cur) ? cur : 'Parts';
  }
}

function renderExpenses() {
  if (!requireAdminAccess('view expenses')) { showPage('jobs'); return; }
  syncExpenseInputs();
  refreshExpenseCategoryControls();
  const span = expenseDateSpan(expFilter.range);
  const fil = (window.appState?.expenses || expenses).filter(e =>
    isLiveExpense(e) &&
    inExpenseWindow(e.date, span) &&
    (!expFilter.cat  || e.cat  === expFilter.cat)
  );

  // Summary bar
  const total   = fil.reduce((a, e) => a + (e.amount || 0), 0);
  const totalEl = document.getElementById('exp-total');
  if (totalEl) totalEl.textContent  = fmtMoney(total);

  // Category breakdown
  const bycat = {};
  fil.forEach(e => { bycat[e.cat] = (bycat[e.cat]||0) + e.amount; });
  document.getElementById('exp-bycat').innerHTML = Object.entries(bycat)
    .sort((a,b)=>b[1]-a[1])
    .map(([cat, amt]) => `
      <div class="mrow">
        <span>${cat}</span>
        <span style="font-family:var(--fh);font-weight:700;">${fmtMoney(amt)}</span>
      </div>`).join('') || '<div style="color:var(--mut);font-size:12px;">No expenses</div>';

  // Expense list
  const tbody = document.getElementById('exp-tbody');
  if (!tbody) return;
  const sortedExpenses = fil.sort((a, b) => new Date(b.timestamp || b.date).getTime() - new Date(a.timestamp || a.date).getTime());
  const pageInfo = typeof paginatedLongList === 'function'
    ? paginatedLongList('expenses', sortedExpenses)
    : { items: sortedExpenses, total: sortedExpenses.length, page: 1, pages: 1, pageSize: sortedExpenses.length || 1, start: 0, end: sortedExpenses.length };
  const pager = typeof longListPagerHtml === 'function' ? longListPagerHtml('expenses', pageInfo, 'expenses') : '';
  tbody.innerHTML = pageInfo.items.map(e=>`
    <tr>
      <td style="color:var(--mut);font-size:12px;">${fmtDate(e.date)}<br><span style="color:var(--mut);font-size:11px;">${e.timestamp ? new Date(e.timestamp).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }) : '—'}</span></td>
      <td><span class="sst ok" style="background:rgba(0,200,150,.08)">${e.cat}</span></td>
      <td style="font-weight:500;">${e.desc}</td>
      <td style="color:var(--mut);font-size:12px;">${e.paidTo||'—'}</td>
      <td>${(() => {
        const receipts = normalizePhotoArray(e.receipts || e.receipt || '');
        if (!receipts.length) return '<span style="color:var(--mut);font-size:12px;">—</span>';
        const first = escapeAttr(receipts[0]);
        const count = receipts.length > 1 ? `<div class="photo-count-chip" style="position:absolute;bottom:6px;right:6px;">+${receipts.length - 1}</div>` : '';
        return `<div style="position:relative;width:46px;height:46px;"><img src="${first}" alt="Expense photo" class="clickable-photo" style="width:46px;height:46px;object-fit:cover;border-radius:8px;border:1px solid var(--bor);" onclick="openImageViewer('${first}','Expense Photo Reference 1')">${count}</div>`;
      })()}</td>
      <td style="font-family:var(--fh);font-weight:700;color:var(--acc2)">${fmtMoney(e.amount)}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-g btn-sm" onclick="openEditExp('${e.id}')">Edit</button>
          <button class="btn btn-r btn-sm" onclick="delExp('${e.id}')">Del</button>
        </div>
      </td>
    </tr>`).join('') + (pager ? `<tr><td colspan="7">${pager}</td></tr>` : '') || '<tr><td colspan="7" style="text-align:center;color:var(--mut);padding:20px;">No expenses for this period</td></tr>';
}

function renderIncomePage() {
  if (!requireAdminAccess('view income')) { showPage('jobs'); return; }
  syncExpenseInputs();
  const span = expenseDateSpan(expFilter.range);
  const manualIncome = incomeEntries
    .map(normalizeIncomeEntry)
    .filter(isLiveIncomeEntry)
    .filter(entry => inExpenseWindow(entry.date, span));
  const otherIncomeTotal = manualIncome.reduce((a, entry) => a + (entry.amount || 0), 0);
  const incomeEl = document.getElementById('income-total');
  if (incomeEl) incomeEl.textContent = fmtMoney(otherIncomeTotal);
  const incomeByType = {};
  manualIncome.forEach(entry => {
    const label = incomeTypeLabel(entry.kind);
    incomeByType[label] = (incomeByType[label] || 0) + (entry.amount || 0);
  });
  const incomeByTypeEl = document.getElementById('income-bytype');
  if (incomeByTypeEl) {
    incomeByTypeEl.innerHTML = Object.entries(incomeByType)
      .sort((a, b) => b[1] - a[1])
      .map(([label, amt]) => `
        <div class="mrow">
          <span>${label}</span>
          <span style="font-family:var(--fh);font-weight:700;">${fmtMoney(amt)}</span>
        </div>`)
      .join('') || '<div style="color:var(--mut);font-size:12px;">No manual income</div>';
  }

  const incomeTbody = document.getElementById('income-tbody');
  if (incomeTbody) {
    const sortedIncome = manualIncome
      .sort((a, b) => new Date(b.timestamp || b.date).getTime() - new Date(a.timestamp || a.date).getTime());
    const pageInfo = typeof paginatedLongList === 'function'
      ? paginatedLongList('income', sortedIncome)
      : { items: sortedIncome, total: sortedIncome.length, page: 1, pages: 1, pageSize: sortedIncome.length || 1, start: 0, end: sortedIncome.length };
    const pager = typeof longListPagerHtml === 'function' ? longListPagerHtml('income', pageInfo, 'income entries') : '';
    incomeTbody.innerHTML = pageInfo.items.map(entry => `
        <tr>
          <td style="color:var(--mut);font-size:12px;">${fmtDate(entry.date)}<br><span style="color:var(--mut);font-size:11px;">${entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }) : '—'}</span></td>
          <td><span class="sst ok" style="background:rgba(245,197,24,.12);color:var(--acc2);">${incomeTypeLabel(entry.kind)}</span></td>
          <td style="font-weight:500;">${entry.note || entry.description || '—'}<br><span style="color:var(--mut);font-size:11px;">${entry.method ? entry.method.toUpperCase() : '—'}${entry.invoiceNo ? ` · Invoice ${entry.invoiceNo}` : ''}${entry.mechName ? ` · ${entry.mechName}` : ''}</span></td>
          <td style="font-family:var(--fh);font-weight:700;color:var(--acc)">${fmtMoney(entry.amount)}</td>
          <td>
            <div style="display:flex;gap:4px;">
              <button class="btn btn-g btn-sm" onclick="openEditIncome('${entry.id}')">Edit</button>
              <button class="btn btn-r btn-sm" onclick="delIncome('${entry.id}')">Del</button>
            </div>
          </td>
        </tr>`)
      .join('') + (pager ? `<tr><td colspan="5">${pager}</td></tr>` : '') || '<tr><td colspan="5" style="text-align:center;color:var(--mut);padding:20px;">No manual income for this period</td></tr>';
  }
}

function renderExpenseRelatedPage() {
  if (currentPage === 'income') renderIncomePage();
  else renderExpenses();
}

function filterExpCat(v)  { expFilter.cat  = v; if (typeof resetLongListPage === 'function') resetLongListPage('expenses'); renderExpenses(); }
function setExpenseRange(value) {
  expFilter.range = value || 'today';
  if (typeof resetLongListPage === 'function') {
    resetLongListPage('expenses');
    resetLongListPage('income');
  }
  if (expFilter.range === 'today') {
    expFilter.start = today();
    expFilter.end = today();
  } else if (expFilter.range === 'yesterday') {
    expFilter.start = yesterday();
    expFilter.end = yesterday();
  } else if (['week', 'month', 'year'].includes(expFilter.range)) {
    const span = expenseDateSpan(expFilter.range);
    expFilter.start = span.start;
    expFilter.end = span.end;
  } else if (expFilter.range === 'date') {
    expFilter.start = expFilter.start || today();
    expFilter.end = expFilter.start;
  } else {
    expFilter.start = expFilter.start || today();
    expFilter.end = expFilter.end || expFilter.start;
  }
  renderExpenseRelatedPage();
}

function setExpenseCustomDates() {
  const startEl = document.getElementById(currentPage === 'income' ? 'income-start' : 'exp-start');
  const endEl = document.getElementById(currentPage === 'income' ? 'income-end' : 'exp-end');
  const start = startEl?.value || today();
  const end = endEl?.value || start;
  expFilter.start = start;
  expFilter.end = expFilter.range === 'date' ? start : end;
  if (expFilter.range !== 'custom' && expFilter.range !== 'date') expFilter.range = 'custom';
  if (typeof resetLongListPage === 'function') {
    resetLongListPage('expenses');
    resetLongListPage('income');
  }
  renderExpenseRelatedPage();
}

function setExpenseYear(value) {
  expFilter.year = parseInt(value, 10) || new Date().getFullYear();
  if (expFilter.range !== 'year') expFilter.range = 'year';
  const span = expenseDateSpan('year');
  expFilter.start = span.start;
  expFilter.end = span.end;
  if (typeof resetLongListPage === 'function') {
    resetLongListPage('expenses');
    resetLongListPage('income');
  }
  renderExpenseRelatedPage();
}

function delExp(id) {
  if (!requireCloudWriteAccess('delete expenses')) return;
  if (!confirm('Delete this expense?')) return;
  const entry = expenses.find(x => x.id === id);
  if (!entry) return;
  entry.deletedAt = nowISO();
  entry.updatedAt = entry.deletedAt;
  logAction('delete', 'expense', id);
  saveAll({ domain: 'expense' }); renderExpenses(); toast('Expense removed');
}

// ─── Add / Edit Expense Modal ─────────────────────────────
let editExpId = null;

function openAddExp() {
  editExpId = null;
  document.getElementById('exp-modal-title').textContent = 'Add Expense';
  document.getElementById('em-date').value   = today();
  document.getElementById('em-cat').value    = 'Parts';
  document.getElementById('em-desc').value   = '';
  document.getElementById('em-amount').value = '';
  document.getElementById('em-paidto').value = '';
  setPhotoPreviewList?.('em-photo-preview', [], 'Expense Photo Reference');
  const photoInput = document.getElementById('em-photo');
  if (photoInput) photoInput.value = '';
  openM('m-expense');
}

function openEditExp(id) {
  const e = expenses.find(x => x.id === id);
  if (!e) return;
  editExpId = id;
  document.getElementById('exp-modal-title').textContent = 'Edit Expense';
  document.getElementById('em-date').value   = e.date;
  document.getElementById('em-cat').value    = e.cat;
  document.getElementById('em-desc').value   = e.desc;
  document.getElementById('em-amount').value = e.amount;
  document.getElementById('em-paidto').value = e.paidTo || '';
  setPhotoPreviewList?.('em-photo-preview', e.receipts || e.receipt || [], 'Expense Photo Reference');
  const photoInput = document.getElementById('em-photo');
  if (photoInput) photoInput.value = '';
  openM('m-expense');
}

function saveExp() {
  if (!requireCloudWriteAccess(editExpId ? 'update expenses' : 'create expenses')) return;
  const desc   = document.getElementById('em-desc').value.trim();
  const amount = parseFloat(document.getElementById('em-amount').value);
  if (!desc)      { toast('Enter description'); return; }
  if (!amount)    { toast('Enter amount');       return; }
  const expenseDate = document.getElementById('em-date').value || today();
  if (!requireNotFutureBusinessDate(expenseDate, 'Expense date')) return;

  const obj = {
    date:   expenseDate,
    cat:    document.getElementById('em-cat').value,
    desc, amount,
    paidTo: document.getElementById('em-paidto').value.trim(),
    receipts: typeof getPhotoPreviewList === 'function' ? getPhotoPreviewList('em-photo-preview') : [],
    receipt: document.getElementById('em-photo-preview')?.dataset?.dataUrl || '',
    timestamp: nowISO(),
  };

  if (editExpId) {
    Object.assign(expenses.find(x => x.id === editExpId), obj, { updatedAt: nowISO() });
    logAction('update', 'expense', editExpId, { amount, cat: obj.cat });
    toast('Expense updated');
  } else {
    const exp = { id: nextId('e'), createdAt: nowISO(), updatedAt: nowISO(), ...obj };
    expenses.push(exp);
    logAction('create', 'expense', exp.id, { amount, cat: obj.cat });
    toast('Expense added');
  }
  closeM('m-expense'); saveAll({ domain: 'expense' }); renderExpenses();
}

function openAddIncome() {
  editIncomeId = null;
  document.getElementById('income-modal-title').textContent = 'Add Income';
  document.getElementById('im-date').value = today();
  document.getElementById('im-type').value = 'regular_income';
  renderIncomeTypeChips?.('regular_income');
  document.getElementById('im-amount').value = '';
  document.getElementById('im-method').value = 'cash';
  renderIncomeMethodChips?.('cash');
  document.getElementById('im-mech').value = '';
  renderIncomeMechanicChips?.('');
  document.getElementById('im-note').value = '';
  document.getElementById('im-invoice-no').value = '';
  renderIncomeServiceChips?.();
  openM('m-income');
}

function openEditIncome(id) {
  if (!requireAdminAccess('edit income')) return;
  const entry = incomeEntries.map(normalizeIncomeEntry).find(x => x.id === id);
  if (!entry) return;
  editIncomeId = id;
  document.getElementById('income-modal-title').textContent = 'Edit Income';
  document.getElementById('im-date').value = entry.date || today();
  document.getElementById('im-type').value = entry.kind || 'other_income';
  renderIncomeTypeChips?.(entry.kind || 'other_income');
  document.getElementById('im-amount').value = entry.amount || '';
  document.getElementById('im-method').value = entry.method || 'cash';
  renderIncomeMethodChips?.(entry.method || 'cash');
  document.getElementById('im-mech').value = entry.mechId || '';
  renderIncomeMechanicChips?.(entry.mechId || '');
  document.getElementById('im-note').value = entry.note || entry.description || '';
  document.getElementById('im-invoice-no').value = entry.invoiceNo || '';
  renderIncomeServiceChips?.();
  openM('m-income');
}

function saveIncome() {
  if (!requireCloudWriteAccess(editIncomeId ? 'update income' : 'create income')) return;
  const amount = parseFloat(document.getElementById('im-amount').value) || 0;
  const kind = document.getElementById('im-type').value || 'other_income';
  const note = document.getElementById('im-note').value.trim();
  const invoiceNo = String(document.getElementById('im-invoice-no').value || '').trim().toUpperCase();
  const mechId = kind === 'regular_income' ? String(document.getElementById('im-mech').value || '').trim() : '';
  const mechName = mechId ? (mechanics.find(m => String(m.id || '').trim() === mechId)?.name || '') : '';
  if (!amount) { toast('Enter amount'); return; }
  if (!note) { toast('Enter note'); return; }
  const incomeDate = document.getElementById('im-date').value || today();
  if (!requireNotFutureBusinessDate(incomeDate, 'Income date')) return;

  const item = normalizeIncomeEntry({
    date: incomeDate,
    amount,
    method: document.getElementById('im-method').value || 'cash',
    kind,
    category: incomeTypeLabel(kind),
    note,
    description: note,
    invoiceNo: kind === 'regular_income' ? invoiceNo : '',
    mechId,
    mechName,
    timestamp: nowISO(),
    createdAt: nowISO(),
    updatedAt: nowISO(),
  });

  if (editIncomeId) {
    const idx = incomeEntries.findIndex(x => x.id === editIncomeId);
    if (idx === -1) return;
    incomeEntries[idx] = { ...incomeEntries[idx], ...item, id: editIncomeId, updatedAt: nowISO() };
    logAction('update', 'income', editIncomeId, { amount, kind });
    toast('Income updated');
  } else {
    const entry = { id: nextId('inc'), ...item };
    incomeEntries.push(entry);
    logAction('create', 'income', entry.id, { amount, kind });
    toast('Income added');
  }
  closeM('m-income');
  saveAll({ domain: 'income' });
  renderJobs?.();
  if (typeof renderInvoices === 'function') renderInvoices();
  if (typeof renderExpenses === 'function' && currentPage === 'expenses') renderExpenses();
  if (typeof renderIncomePage === 'function' && currentPage === 'income') renderIncomePage();
  if (typeof renderReports === 'function' && currentPage === 'reports') renderReports();
}

function delIncome(id) {
  if (!requireAdminAccess('delete income')) return;
  if (!requireCloudWriteAccess('delete income')) return;
  if (!confirm('Delete this income entry?')) return;
  const entry = incomeEntries.find(x => x.id === id);
  if (!entry) return;
  entry.deletedAt = nowISO();
  entry.updatedAt = entry.deletedAt;
  logAction('delete', 'income', id);
  saveAll({ domain: 'income' });
  renderJobs?.();
  if (typeof renderInvoices === 'function') renderInvoices();
  if (typeof renderExpenses === 'function' && currentPage === 'expenses') renderExpenses();
  if (typeof renderIncomePage === 'function' && currentPage === 'income') renderIncomePage();
  if (typeof renderReports === 'function' && currentPage === 'reports') renderReports();
  toast('Income removed');
}
