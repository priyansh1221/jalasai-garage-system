// ═══════════════════════════════════════════════════════
//  Mechanics module
// ═══════════════════════════════════════════════════════

let mechanicPeriodMode = 'month';

function mechanicPeriodDefaults() {
  const current = today();
  return {
    date: current,
    month: current.slice(0, 7),
    year: current.slice(0, 4),
  };
}

function ensureMechanicPeriodInputs() {
  const defaults = mechanicPeriodDefaults();
  const modeEl = document.getElementById('mech-period-mode');
  const dateEl = document.getElementById('mech-period-date');
  const monthEl = document.getElementById('mech-period-month');
  const yearEl = document.getElementById('mech-period-year');
  if (modeEl) {
    mechanicPeriodMode = modeEl.value || mechanicPeriodMode || 'month';
    modeEl.value = mechanicPeriodMode;
  }
  if (dateEl && !dateEl.value) dateEl.value = defaults.date;
  if (monthEl && !monthEl.value) monthEl.value = defaults.month;
  if (yearEl && !yearEl.value) yearEl.value = defaults.year;
  [dateEl, monthEl, yearEl].forEach(el => {
    if (el) el.style.display = 'none';
  });
  const activeEl = mechanicPeriodMode === 'date' ? dateEl : mechanicPeriodMode === 'year' ? yearEl : monthEl;
  if (activeEl) activeEl.style.display = '';
}

function mechanicPeriodFilter() {
  ensureMechanicPeriodInputs();
  const defaults = mechanicPeriodDefaults();
  const dateValue = document.getElementById('mech-period-date')?.value || defaults.date;
  const monthValue = document.getElementById('mech-period-month')?.value || defaults.month;
  const yearValue = document.getElementById('mech-period-year')?.value || defaults.year;
  if (mechanicPeriodMode === 'date') {
    return { label: 'Selected Date', includes: value => String(value || '') === dateValue };
  }
  if (mechanicPeriodMode === 'year') {
    return { label: 'Selected Year', includes: value => String(value || '').slice(0, 4) === String(yearValue || defaults.year) };
  }
  return { label: 'Selected Month', includes: value => String(value || '').slice(0, 7) === monthValue };
}

function setMechanicPeriodMode(mode) {
  mechanicPeriodMode = ['date', 'month', 'year'].includes(mode) ? mode : 'month';
  ensureMechanicPeriodInputs();
  renderMechanics();
}

function renderMechanics() {
  if (!requireAdminAccess('access mechanics')) { showPage('jobs'); return; }
  const grid = document.getElementById('mech-grid');
  if (!grid) return;
  const mechanicJobDate = (job) => (job?.doneAt || '').slice(0, 10) || job?.date || '';
  const period = mechanicPeriodFilter();
  const liveMechanics = mechanics.filter(isLiveMechanic);
  if (!liveMechanics.length) {
    grid.innerHTML = '<div class="report-empty" style="grid-column:1/-1;">No mechanics saved yet. Add a mechanic to manage assignments and daily totals.</div>';
    return;
  }
  grid.innerHTML = liveMechanics.map(m => {
    const myJobs    = jobs.filter(j => isLiveJob(j) && jobMechanicIds(j).includes(m.id));
    const active    = myJobs.filter(j => j.status !== 'done');
    const doneToday = myJobs.filter(j => j.status === 'done' && mechanicJobDate(j) === today());
    const donePeriod = myJobs.filter(j => j.status === 'done' && period.includes(mechanicJobDate(j)));
    const quickIncomeToday = incomeEntries
      .map(normalizeIncomeEntry)
      .filter(entry => entry.kind === 'regular_income' && entry.date === today() && entry.mechId === m.id);
    const quickIncomePeriod = incomeEntries
      .map(normalizeIncomeEntry)
      .filter(entry => entry.kind === 'regular_income' && period.includes(entry.date) && entry.mechId === m.id);
    const jobRevenue = doneToday.reduce((a, j) => a + (jobTotal(j) / Math.max(1, jobMechanicIds(j).length)), 0);
    const quickIncomeRevenue = quickIncomeToday.reduce((sum, entry) => sum + (entry.amount || 0), 0);
    const rev = jobRevenue + quickIncomeRevenue;
    const periodJobRevenue = donePeriod.reduce((a, j) => a + (jobTotal(j) / Math.max(1, jobMechanicIds(j).length)), 0);
    const periodIncomeRevenue = quickIncomePeriod.reduce((sum, entry) => sum + (entry.amount || 0), 0);
    const periodRev = periodJobRevenue + periodIncomeRevenue;
    const workCount = doneToday.length + quickIncomeToday.length;
    const periodWorkCount = donePeriod.length + quickIncomePeriod.length;
    return `
    <div class="mech-card ${m.active ? '' : 'inactive'}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="mech-avatar" style="background:${m.color};">${m.name.charAt(0)}</div>
          <div>
            <div style="font-family:var(--fh);font-size:16px;font-weight:700;">${m.name}</div>
            <div style="font-size:11px;color:var(--mut);">${m.specialty || 'General'}</div>
          </div>
        </div>
        <span class="sst ${m.active ? 'ok' : 'out'}">${m.active ? 'Active' : 'Off'}</span>
      </div>
      <div style="font-size:12px;color:var(--mut);margin-bottom:10px;">📞 ${m.phone || 'No phone saved'}</div>
      <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
        <div class="sc" style="flex:1;padding:8px 12px;">
          <div class="sc-lbl">Active</div>
          <div class="sc-val y">${active.length}</div>
        </div>
        <div class="sc" style="flex:1;padding:8px 12px;">
          <div class="sc-lbl">Done Today</div>
          <div class="sc-val g">${workCount}</div>
        </div>
        <div class="sc" style="flex:1;padding:8px 12px;">
          <div class="sc-lbl">Today Revenue</div>
          <div class="sc-val o" style="font-size:14px;">${fmtMoney(rev)}</div>
        </div>
        <div class="sc" style="flex:1;padding:8px 12px;min-width:130px;">
          <div class="sc-lbl">${period.label} Revenue</div>
          <div class="sc-val g" style="font-size:14px;">${fmtMoney(periodRev)}</div>
          <div style="font-size:10px;color:var(--mut);">${periodWorkCount} entries</div>
        </div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-g btn-sm" onclick="openEditMech('${m.id}')">Edit</button>
        <button class="btn btn-g btn-sm" onclick="toggleMechActive('${m.id}')">${m.active?'Mark Off':'Mark Active'}</button>
        <button class="btn btn-r btn-sm" onclick="delMech('${m.id}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function toggleMechActive(id) {
  if (!requireCloudWriteAccess('update mechanics')) return;
  const m = mechanics.find(x => x.id === id && isLiveMechanic(x));
  if (!m) return;
  m.active = !m.active;
  logAction('update', 'mechanic', id, { active: m.active });
  saveAll({ domain: 'mechanic' }); renderMechanics();
  toast(m.name + ' marked ' + (m.active ? 'active' : 'off'));
}

function delMech(id) {
  if (!requireCloudWriteAccess('delete mechanics')) return;
  if (jobs.some(j => isLiveJob(j) && jobMechanicIds(j).includes(id) && j.status !== 'done')) {
    toast('Cannot delete — mechanic has active jobs'); return;
  }
  if (!confirm('Delete this mechanic?')) return;
  const mechanic = mechanics.find(x => x.id === id && isLiveMechanic(x));
  if (!mechanic) return;
  mechanic.deletedAt = nowISO();
  mechanic.updatedAt = mechanic.deletedAt;
  logAction('delete', 'mechanic', id);
  saveAll({ domain: 'mechanic' }); renderMechanics(); toast('Mechanic removed');
}

// ─── Add / Edit Mechanic Modal ────────────────────────────
let editMechId = null;

function openAddMech() {
  editMechId = null;
  document.getElementById('mech-modal-title').textContent = 'Add Mechanic';
  ['mm-name','mm-phone','mm-specialty'].forEach(i => {
    const el = document.getElementById(i);
    if (el) el.value = '';
  });
  document.getElementById('mm-color').value  = '#00c896';
  document.getElementById('mm-active').checked = true;
  openM('m-mech');
}

function openEditMech(id) {
  const m = mechanics.find(x => x.id === id && isLiveMechanic(x));
  if (!m) return;
  editMechId = id;
  document.getElementById('mech-modal-title').textContent = 'Edit Mechanic';
  document.getElementById('mm-name').value      = m.name;
  document.getElementById('mm-phone').value     = m.phone;
  document.getElementById('mm-specialty').value = m.specialty || '';
  document.getElementById('mm-color').value     = m.color || '#00c896';
  document.getElementById('mm-active').checked  = m.active !== false;
  openM('m-mech');
}

function saveMech() {
  if (!requireCloudWriteAccess(editMechId ? 'update mechanics' : 'create mechanics')) return;
  const name  = document.getElementById('mm-name').value.trim();
  const phone = document.getElementById('mm-phone').value.trim();
  if (!name)  { toast('Enter mechanic name');  return; }
  if (!phone) { toast('Enter phone number');   return; }

  const obj = {
    name, phone,
    specialty: document.getElementById('mm-specialty').value.trim(),
    color:     document.getElementById('mm-color').value,
    active:    document.getElementById('mm-active').checked,
  };

  if (editMechId) {
    Object.assign(mechanics.find(x => x.id === editMechId && isLiveMechanic(x)), obj, { updatedAt: nowISO() });
    logAction('update', 'mechanic', editMechId, { name });
    toast('Mechanic updated');
  } else {
    const newMech = normalizeMechanic({ id: nextId('m'), createdAt: nowISO(), updatedAt: nowISO(), ...obj });
    mechanics.push(newMech);
    logAction('create', 'mechanic', newMech.id, { name });
    toast('Mechanic added: ' + name);
  }
  closeM('m-mech'); saveAll({ domain: 'mechanic' }); renderMechanics();
}
