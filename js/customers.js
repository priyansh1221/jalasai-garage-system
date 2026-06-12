// ═══════════════════════════════════════════════════════
//  Customers module
// ═══════════════════════════════════════════════════════

let custSearch = '';
let custSort = 'due-desc';

// Debounced wrapper used by the customers search input.
// Keeps custSearch up-to-date synchronously so any
// concurrent reader sees the latest query, but defers
// the card-grid rebuild until the user pauses typing.
function filterCustomers(value) {
  custSearch = value || '';
  if (typeof resetLongListPage === 'function') resetLongListPage('customers');
  if (typeof debouncePerf === 'function') {
    debouncePerf('cust-search', renderCustomers, 150);
  } else {
    renderCustomers();
  }
}

function customerOwnsJob(customer, job) {
  if (typeof customerMatchesJob === 'function') {
    return customerMatchesJob(customer, job, { allowNameFallback: true });
  }
  return false;
}

function linkJobsToCustomer(target, options = {}) {
  if (!target?.id) return 0;
  const sourceJobId = String(options.sourceJobId || '').trim();
  let linked = 0;
  jobs.forEach(j => {
    if (!isLiveJob(j)) return;
    const sameSource = sourceJobId && j.id === sourceJobId && !customerJobIdentityConflict(target, j);
    const strictMatch = customerOwnsJob(target, j);
    if (!sameSource && !strictMatch) return;
    if (String(j.custId || '').trim() === target.id) return;
    j.custId = target.id;
    j.updatedAt = nowISO();
    linked += 1;
  });
  return linked;
}

function openCustomerHistory(customerId = '', customerName = '', phone = '', sourceJobId = '') {
  const trimmedName = String(customerName || '').trim();
  const trimmedPhone = String(phone || '').trim();
  const trimmedSourceJobId = String(sourceJobId || '').trim();
  const sourceJob = trimmedSourceJobId ? jobs.find(j => j.id === trimmedSourceJobId && isLiveJob(j)) : null;
  let targetId = customerId || '';
  let target = targetId ? customers.find(c => c.id === targetId && isLiveCustomer(c)) : null;
  if (target && sourceJob && !customerOwnsJob(target, sourceJob)) {
    target = null;
    targetId = '';
  }
  if (!target) {
    const probe = {
      cust: String(sourceJob?.cust || trimmedName || '').trim(),
      phone: String(sourceJob?.phone || trimmedPhone || '').trim(),
      custId: '',
      deletedAt: '',
    };
    const sourceProbe = sourceJob ? { ...sourceJob, custId: '' } : probe;
    target = customers.find(c => isLiveCustomer(c) && (
      (sourceJob && customerMatchesJob(c, sourceProbe, { allowNameFallback: true })) ||
      (!sourceJob && customerMatchesJob(c, probe, { allowNameFallback: true }))
    )) || null;
    targetId = target?.id || '';
  }
  if (!target && (trimmedName || trimmedPhone || trimmedSourceJobId)) {
    if (!requireCloudWriteAccess('heal customer record')) {
      toast('Customer history not found', 2600);
      return;
    }
    const matchingJob = sourceJob || jobs.find(j => isLiveJob(j) && (
      (trimmedPhone && customerPhoneKey(j.phone || '') === customerPhoneKey(trimmedPhone)) ||
      (trimmedName && strongCustomerNameKey(j.cust || '') === strongCustomerNameKey(trimmedName))
    ));
    const vehicle = String(matchingJob?.veh || '').trim();
    target = normalizeCustomer({
      id: nextId('c'),
      name: trimmedName || String(matchingJob?.cust || '').trim(),
      phone: trimmedPhone || String(matchingJob?.phone || '').trim(),
      email: '', address: '',
      vehicles: vehicle ? [vehicle] : [],
      lastVehicle: vehicle || '',
      notes: '',
      createdAt: today(),
      updatedAt: nowISO(),
    });
    customers.push(target);
    targetId = target.id;
    linkJobsToCustomer(target, { sourceJobId: trimmedSourceJobId });
    logAction('create', 'customer', target.id, { name: target.name, source: 'self-heal' });
    saveAll({ domain: 'jobs' });
    toast('Customer record restored');
    if (typeof renderCustomers === 'function') renderCustomers();
  }
  if (target && linkJobsToCustomer(target, { sourceJobId: trimmedSourceJobId })) {
    saveAll({ domain: 'jobs' });
  }
  if (!targetId) {
    toast('Customer history not found', 2600);
    return;
  }
  viewCustomer(targetId);
}

function customerDueJobs(custId) {
  const customer = customers.find(c => c.id === custId && isLiveCustomer(c));
  if (!customer) return [];
  return jobs.filter(j => customerOwnsJob(customer, j) && jobDue(j) > 0);
}

function openCustomerHistoryJob(jobId) {
  const job = jobs.find(j => j.id === jobId && isLiveJob(j));
  if (!job) {
    toast('Job not found', 2200);
    return;
  }
  const backToCustomer = () => viewCustomer(job.custId);
  if (job.status === 'done') {
    openInvoice(job.id, { backTo: backToCustomer });
    return;
  }
  viewJob(job.id, { backTo: backToCustomer });
}

function customerBalanceBadge(meta, compact = false) {
  if (meta.state === 'clear') {
    return `<div style="font-size:${compact ? '11px' : '12px'};font-weight:700;color:var(--mut);">Clear</div>`;
  }
  return `<div style="font-size:${compact ? '11px' : '12px'};font-weight:700;color:${meta.color};">${compact ? meta.shortLabel : meta.label}</div>`;
}

function buildDueReminderMessage(c, dueJobs) {
  const totalDue = dueJobs.reduce((a, j) => a + jobDue(j), 0);
  const lines = dueJobs.slice(0, 5).map(j =>
    `• ${j.id} · ${j.veh} · Due ${fmtMoney(jobDue(j))}`
  );
  return `Namaskar ${c.name} ji 🙏\n\n${getGarageProfile().shortName} se friendly reminder.\nAapke account me ${fmtMoney(totalDue)} due baki hai.\n\n${lines.join('\n')}${dueJobs.length > 5 ? `\n• +${dueJobs.length - 5} more jobs` : ''}\n\nPayment ho jane par kindly confirm kar dena.\nMo. ${getGarageProfile().phone}\n${getGarageProfile().shortName}`;
}

function buildFeedbackReminderMessage(c, job, followup) {
  return `Namaskar ${c.name} ji 🙏\n\nAapki ${job.veh || 'vehicle'} service ko 1 week ho gaya.\n${getGarageProfile().shortName} ki service kaisi lagi, please batayiye.\n\nAapka feedback hamare liye important hai.\n${job.prob ? `Kaam: ${job.prob}\n` : ''}\nInvoice: ${job.invoiceNo || job.id}\nService Date: ${fmtDate(followup.lastServiceDate)}\n\nDhanyavaad 🙏\n${getGarageProfile().shortName}`;
}

function buildServiceReminderMessage(c, job, followup) {
  return `Namaskar ${c.name} ji 🙏\n\nAapki ${job.veh || 'vehicle'} ki last service ko 75 din ho gaye hain.\nAgar vehicle ko checkup, service, oil change, brake, ya general inspection chahiye ho to ${getGarageProfile().shortName} par aa jaiye.\n\nLast Service: ${fmtDate(followup.lastServiceDate)}\nInvoice: ${job.invoiceNo || job.id}\n${job.veh ? `Vehicle: ${job.veh}\n` : ''}\nAppointment ke liye message kar sakte hain.\n\n${getGarageProfile().shortName}`;
}

function openCustomerWhatsApp(c, msg) {
  window.open('https://wa.me/91' + c.phone + '?text=' + encodeURIComponent(msg), '_blank');
}

function remindCustomerDue(id) {
  const c = customers.find(x => x.id === id);
  if (!c) return;
  const dueJobs = customerDueJobs(id);
  if (!dueJobs.length) { toast('No due amount for this customer'); return; }
  if (!c.phone) { toast('Customer phone not available'); return; }
  const msg = buildDueReminderMessage(c, dueJobs);
  window.open('https://wa.me/91' + c.phone + '?text=' + encodeURIComponent(msg), '_blank');
  logAction('remind', 'customer', c.id, { due: customerDueAmount(id), jobs: dueJobs.length });
  saveAll({ preserveUpdatedAt: true, domain: 'reminder' });
}

function remindCustomerFeedback(id) {
  const c = customers.find(x => x.id === id);
  if (!c) return;
  const followup = customerFollowupStatus(id);
  if (!followup.lastServiceJob) { toast('No completed invoice found for this customer'); return; }
  if (!followup.feedbackDue) { toast(`Feedback reminder due on ${fmtDate(followup.feedbackDueDate)}`); return; }
  if (!c.phone) { toast('Customer phone not available'); return; }
  openCustomerWhatsApp(c, buildFeedbackReminderMessage(c, followup.lastServiceJob, followup));
  logAction('remind', 'customer', c.id, { type: 'feedback', jobId: followup.lastServiceJob.id, dueDate: followup.feedbackDueDate });
  saveAll({ preserveUpdatedAt: true, domain: 'reminder' });
}

function remindCustomerService(id) {
  const c = customers.find(x => x.id === id);
  if (!c) return;
  const followup = customerFollowupStatus(id);
  if (!followup.lastServiceJob) { toast('No completed invoice found for this customer'); return; }
  if (!followup.serviceReminderDue) { toast(`Service reminder due on ${fmtDate(followup.serviceReminderDate)}`); return; }
  if (!c.phone) { toast('Customer phone not available'); return; }
  openCustomerWhatsApp(c, buildServiceReminderMessage(c, followup.lastServiceJob, followup));
  logAction('remind', 'customer', c.id, { type: 'service', jobId: followup.lastServiceJob.id, dueDate: followup.serviceReminderDate });
  saveAll({ preserveUpdatedAt: true, domain: 'reminder' });
}

function renderCustomers() {
  const summaryIndex = typeof buildCustomerJobSummaryIndex === 'function'
    ? buildCustomerJobSummaryIndex(customers, jobs, { allowNameFallback: true })
    : null;
  const summaryFor = (id) => summaryIndex?.summaries?.get(id) || {
    jobs: jobs.filter(j => customerOwnsJob(customers.find(c => c.id === id), j)),
    visits: 0,
    spent: 0,
    net: 0,
    due: 0,
    advance: 0,
    active: 0,
    lastJob: null,
  };
  const stateCustomers = window.appState?.customers || customers;
  const fil = stateCustomers.filter(c => {
    if (!isLiveCustomer(c)) return false;
    const q = custSearch.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q);
  });
  fil.sort((a, b) => {
    if (custSort === 'name') return a.name.localeCompare(b.name);
    if (custSort === 'advance-desc') return summaryFor(b.id).advance - summaryFor(a.id).advance || a.name.localeCompare(b.name);
    if (custSort === 'advance-asc') return summaryFor(a.id).advance - summaryFor(b.id).advance || a.name.localeCompare(b.name);
    if (custSort === 'due-asc') return summaryFor(a.id).due - summaryFor(b.id).due || a.name.localeCompare(b.name);
    if (custSort === 'due-desc') return summaryFor(b.id).due - summaryFor(a.id).due || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });

  const sortSel = document.getElementById('cust-sort');
  if (sortSel) sortSel.value = custSort;

  const grid = document.getElementById('cust-grid');
  if (!grid) return;

  if (!fil.length) {
    grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--mut);">No customers found.</div>';
    return;
  }

  const pageInfo = typeof paginatedLongList === 'function'
    ? paginatedLongList('customers', fil)
    : { items: fil, total: fil.length, page: 1, pages: 1, pageSize: fil.length || 1, start: 0, end: fil.length };
  const visibleCustomers = pageInfo.items;
  const pager = typeof longListPagerHtml === 'function' ? longListPagerHtml('customers', pageInfo, 'customers') : '';
  grid.innerHTML = visibleCustomers.map(c => {
    const summary = summaryFor(c.id);
    const cJobs   = summary.jobs || [];
    const balance = { net: summary.net || 0, state: resolveBalanceState(summary.net || 0), amount: Math.abs(summary.net || 0) };
    const meta    = balanceStateMeta(balance);
    const lastJob = summary.lastJob && summary.lastJob.status === 'done'
      ? summary.lastJob
      : cJobs.filter(j => j.status === 'done').sort((a, b) => jobDateTimeValue(b) - jobDateTimeValue(a))[0];
    const followup = typeof customerFollowupStatusFromJobs === 'function'
      ? customerFollowupStatusFromJobs(c, cJobs)
      : customerFollowupStatus(c.id);
    const followupTags = [
      followup.feedbackActive ? `<span class="mtag" style="border-color:#38bdf8;color:#38bdf8;">Feedback Due</span>` : '',
      followup.serviceActive ? `<span class="mtag" style="border-color:#f5c518;color:#f5c518;">Service Due</span>` : '',
    ].filter(Boolean).join('');
    return `
    <div class="ccard" onclick="viewCustomer('${c.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <div>
          <div style="font-family:var(--fh);font-size:17px;font-weight:700;">${c.name}</div>
          <div style="font-size:12px;color:var(--acc);">${c.phone || 'No phone added'}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:var(--fh);font-size:20px;font-weight:700;color:${meta.color}">${fmtMoney(meta.amount || 0)}</div>
          ${customerBalanceBadge(meta, true)}
        </div>
      </div>
      <div style="font-size:12px;color:var(--mut);margin-bottom:8px;">${(c.vehicles||[]).join(', ')||'No vehicle'}</div>
      ${followupTags ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">${followupTags}</div>` : ''}
      <div style="display:flex;justify-content:space-between;font-size:12px;">
        <span>${cJobs.length} visits</span>
        <span style="color:var(--mut)">Last: ${lastJob ? fmtDate((lastJob.doneAt || '').slice(0, 10) || lastJob.date) : 'Never'}</span>
      </div>
    </div>`;
  }).join('') + pager;

  document.getElementById('cust-count').textContent = visibleCustomers.length === fil.length
    ? fil.length + ' customers'
    : `${visibleCustomers.length}/${fil.length} customers`;
}

function setCustomerSort(value) {
  custSort = value || 'due-desc';
  if (typeof resetLongListPage === 'function') resetLongListPage('customers');
  renderCustomers();
}

function viewCustomer(id) {
  const c = customers.find(x => x.id === id && isLiveCustomer(x));
  if (!c) return;
  const cJobs  = jobs.filter(j => customerOwnsJob(c, j)).sort((a, b) => jobDateTimeValue(b) - jobDateTimeValue(a));
  const spent  = cJobs.filter(j=>j.status==='done').reduce((a,j)=>a+jobTotal(j),0);
  const balance = customerBalance(id);
  const balanceMeta = balanceStateMeta(balance);
  const active = cJobs.filter(j=>j.status!=='done').length;
  const followup = customerFollowupStatus(id);
  const lastService = followup.lastServiceJob;

  document.getElementById('cust-detail-body').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
      <div>
        <div class="modal-ttl" style="margin-bottom:4px;">${c.name}</div>
        <div style="font-size:13px;color:var(--acc);">${c.phone || 'No phone added'}</div>
        ${c.email ? `<div style="font-size:12px;color:var(--mut);">${c.email}</div>` : ''}
        ${c.address ? `<div style="font-size:12px;color:var(--mut);">${c.address}</div>` : ''}
      </div>
      <div style="text-align:right;">
        <div style="font-family:var(--fh);font-size:28px;font-weight:700;color:var(--acc)">${fmtMoney(spent)}</div>
        <div style="font-size:11px;color:var(--mut);">total spent</div>
        ${balanceMeta.state === 'owe'
          ? `<div style="font-family:var(--fh);font-size:16px;font-weight:700;color:${balanceMeta.color};margin-top:4px;">${fmtMoney(balanceMeta.amount)}</div><div style="font-size:11px;color:${balanceMeta.color};">customer owes</div>`
          : balanceMeta.state === 'advance'
            ? `<div style="font-family:var(--fh);font-size:16px;font-weight:700;color:${balanceMeta.color};margin-top:4px;">${fmtMoney(balanceMeta.amount)}</div><div style="font-size:11px;color:${balanceMeta.color};">advance available</div>`
            : `<div style="font-size:11px;color:var(--mut);margin-top:4px;">Clear</div>`}
      </div>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:14px;font-size:13px;">
      <div class="sc" style="flex:1;padding:10px 14px;">
        <div class="sc-lbl">Total Visits</div>
        <div class="sc-val g">${cJobs.length}</div>
      </div>
      <div class="sc" style="flex:1;padding:10px 14px;">
        <div class="sc-lbl">Active Jobs</div>
        <div class="sc-val y">${active}</div>
      </div>
      <div class="sc" style="flex:1;padding:10px 14px;">
        <div class="sc-lbl">Member Since</div>
        <div class="sc-val" style="font-size:14px;">${fmtDate(c.createdAt)}</div>
      </div>
    </div>
    <div style="background:var(--sur2);border-radius:10px;padding:12px 14px;margin-bottom:14px;">
      <div style="font-family:var(--fh);font-size:13px;color:var(--mut);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Follow-ups</div>
      ${lastService ? `
        <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:12px;">
          <span>Last Service: <b style="color:var(--txt);">${fmtDate(followup.lastServiceDate)}</b></span>
          <span>Feedback: <b style="color:${followup.feedbackDue ? '#38bdf8' : 'var(--mut)'};">${followup.feedbackDue ? `Due since ${fmtDate(followup.feedbackDueDate)}` : `Due on ${fmtDate(followup.feedbackDueDate)}`}</b></span>
          <span>Service Reminder: <b style="color:${followup.serviceReminderDue ? '#f5c518' : 'var(--mut)'};">${followup.serviceReminderDue ? `Due since ${fmtDate(followup.serviceReminderDate)}` : `Due on ${fmtDate(followup.serviceReminderDate)}`}</b></span>
        </div>
        <div style="font-size:11px;color:var(--mut);margin-top:6px;">These dates use the latest completed invoice from ${fmtDate(followup.followupStartDate)}, so imported older history is ignored and each new service resets the 7-day and 75-day timer.</div>
      ` : `<div style="font-size:12px;color:var(--mut);">No completed invoice yet in follow-up tracking period (starting ${fmtDate(followup.followupStartDate)}).</div>`}
    </div>
    <div style="font-family:var(--fh);font-size:13px;color:var(--mut);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Vehicles</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
      ${(c.vehicles||[]).map(v=>`<span class="mtag">${v}</span>`).join('') || '<span style="color:var(--mut);font-size:12px;">None on file</span>'}
    </div>
    <div style="font-family:var(--fh);font-size:13px;color:var(--mut);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Job History</div>
    ${cJobs.length ? cJobs.map(j=>`
      <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--bor);font-size:12px;">
        <div>
          <button class="btn btn-g btn-sm" style="padding:0;border:none;background:none;color:var(--txt);font-family:var(--fh);font-weight:600;text-align:left;" onclick="openCustomerHistoryJob('${j.id}')">${j.invoiceNo || j.id}</button>
          <span style="color:var(--mut);margin-left:6px;">${fmtDate(j.date)}</span>
          <div style="color:var(--mut);margin-top:2px;">${j.veh} · ${j.prob}</div>
          ${jobDue(j) > 0 ? `<div style="color:var(--dan);margin-top:3px;">Owe ${fmtMoney(jobDue(j))}</div>` : jobAdvance(j) > 0 ? `<div style="color:#00c896;margin-top:3px;">Advance ${fmtMoney(jobAdvance(j))}</div>` : `<div style="color:var(--mut);margin-top:3px;">Clear</div>`}
        </div>
        <div style="text-align:right;">
          <div style="font-family:var(--fh);font-weight:700;">${fmtMoney(jobTotal(j))}</div>
          <span class="sbadge ${SCls[j.status]}">${SLbl[j.status]}</span>
          <div style="margin-top:6px;">
            <button class="btn btn-g btn-sm" onclick="openCustomerHistoryJob('${j.id}')">${j.status === 'done' ? 'Open Invoice' : 'Open Job'}</button>
          </div>
          ${jobDue(j) > 0 ? `<div style="margin-top:6px;"><button class="btn btn-p btn-sm" onclick="openPaymentModal('${j.id}');closeM('m-cust-detail')">Collect</button></div>` : ''}
        </div>
      </div>`).join('') : '<div style="color:var(--mut);font-size:13px;">No job history</div>'}
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
      <button class="btn btn-p btn-sm" onclick="newJobForCust('${c.id}')">+ New Job</button>
      ${balanceMeta.state === 'owe' ? `<button class="btn btn-g btn-sm" onclick="remindCustomerDue('${c.id}')">Remind Due</button>` : ''}
      ${followup.feedbackActive ? `<button class="btn btn-g btn-sm" onclick="remindCustomerFeedback('${c.id}')">Feedback Msg</button>` : ''}
      ${followup.feedbackActive ? `<button class="btn btn-g btn-sm" onclick="aiDraftCustomerFeedback('${c.id}')">AI Feedback Draft</button>` : ''}
      ${followup.serviceActive ? `<button class="btn btn-g btn-sm" onclick="remindCustomerService('${c.id}')">Service Msg</button>` : ''}
      ${followup.serviceActive ? `<button class="btn btn-g btn-sm" onclick="aiDraftCustomerService('${c.id}')">AI Service Draft</button>` : ''}
      <button class="btn btn-g btn-sm" onclick="openEditCust('${c.id}')">Edit Customer</button>
      <button class="btn btn-r btn-sm" onclick="delCust('${c.id}')">Delete</button>
    </div>`;
  openM('m-cust-detail');
}

function newJobForCust(custId) {
  closeM('m-cust-detail');
  openNewJob({ skipDraftRestore: true, startFresh: true });
  // Pre-fill customer
  setTimeout(() => {
    if (typeof selectJobCustomer === 'function') selectJobCustomer(custId);
  }, 50);
}

// ─── Add / Edit Customer Modal ────────────────────────────
let editCustId = null;

function openAddCust() {
  editCustId = null;
  document.getElementById('cust-modal-title').textContent = 'New Customer';
  ['cm-name','cm-phone','cm-email','cm-address','cm-vehicles','cm-notes'].forEach(i => {
    const el = document.getElementById(i);
    if (el) el.value = '';
  });
  openM('m-cust');
}

function openEditCust(id) {
  const c = customers.find(x => x.id === id && isLiveCustomer(x));
  if (!c) return;
  editCustId = id;
  document.getElementById('cust-modal-title').textContent = 'Edit Customer';
  document.getElementById('cm-name').value     = c.name;
  document.getElementById('cm-phone').value    = c.phone;
  document.getElementById('cm-email').value    = c.email || '';
  document.getElementById('cm-address').value  = c.address || '';
  document.getElementById('cm-vehicles').value = (c.vehicles||[]).join(', ');
  document.getElementById('cm-notes').value    = c.notes || '';
  closeM('m-cust-detail');
  openM('m-cust');
}

function saveCust() {
  if (!requireCloudWriteAccess(editCustId ? 'update customers' : 'create customers')) return;
  const name  = document.getElementById('cm-name').value.trim();
  const phone = document.getElementById('cm-phone').value.trim();
  if (!name)  { toast('Enter customer name');  return; }

  const vehs = document.getElementById('cm-vehicles').value.split(',').map(v=>v.trim()).filter(Boolean);

  const obj = normalizeCustomer({
    name, phone,
    email:    document.getElementById('cm-email').value.trim(),
    address:  document.getElementById('cm-address').value.trim(),
    vehicles: vehs,
    lastVehicle: vehs[0] || '',
    notes:    document.getElementById('cm-notes').value.trim(),
  });

  if (editCustId) {
    Object.assign(customers.find(x => x.id === editCustId && isLiveCustomer(x)), obj, { updatedAt: nowISO() });
    logAction('update', 'customer', editCustId, { name });
    toast('Customer updated');
  } else {
    if (phone && customers.find(c => isLiveCustomer(c) && c.phone === phone)) { toast('Customer with this phone already exists'); return; }
    const newCust = normalizeCustomer({ id: nextId('c'), createdAt: today(), updatedAt: nowISO(), ...obj });
    customers.push(newCust);
    logAction('create', 'customer', newCust.id, { name });
    toast('Customer added: ' + name);
  }
  closeM('m-cust'); saveAll({ domain: 'customer' }); renderCustomers();
}

function delCust(id) {
  if (!requireCloudWriteAccess('delete customers')) return;
  if (!confirm('Delete this customer? Their job history will remain.')) return;
  const customer = customers.find(x => x.id === id && isLiveCustomer(x));
  if (!customer) return;
  customer.deletedAt = nowISO();
  customer.updatedAt = customer.deletedAt;
  logAction('delete', 'customer', id);
  closeM('m-cust-detail');
  saveAll({ domain: 'customer' }); renderCustomers(); toast('Customer removed');
}

function aiDraftCustomerFeedback(id) {
  const c = customers.find(x => x.id === id);
  if (!c) return;
  const cJobs = jobs
    .filter(j => customerOwnsJob(c, j))
    .sort((a, b) => jobDateTimeValue(b) - jobDateTimeValue(a));
  const lastService = cJobs.find(j => j.status === 'done');
  const followup = customerFollowupStatus(id);
  if (!lastService || !followup.lastServiceJob) { toast('No completed invoice found for this customer'); return; }
  const base = buildFeedbackReminderMessage(c, lastService, followup);
  if (typeof openAiAssistModal !== 'function') return;
  openAiAssistModal('AI Feedback Draft', [
    'Rewrite this customer feedback reminder into a warm short WhatsApp message.',
    '',
    'Rules:',
    '- Keep it polite and simple.',
    '- Keep the workshop name as JalaSai.',
    '- Do not add fake offers or promises.',
    '- Return plain text only.',
    '',
    `Customer: ${c.name}`,
    `Phone: ${c.phone || ''}`,
    `Last service date: ${followup.lastServiceDate || ''}`,
    `Base message: ${base}`,
  ].join('\n'));
}

function aiDraftCustomerService(id) {
  const c = customers.find(x => x.id === id);
  if (!c) return;
  const cJobs = jobs
    .filter(j => customerOwnsJob(c, j))
    .sort((a, b) => jobDateTimeValue(b) - jobDateTimeValue(a));
  const lastService = cJobs.find(j => j.status === 'done');
  const followup = customerFollowupStatus(id);
  if (!lastService || !followup.lastServiceJob) { toast('No completed invoice found for this customer'); return; }
  const base = buildServiceReminderMessage(c, lastService, followup);
  if (typeof openAiAssistModal !== 'function') return;
  openAiAssistModal('AI Service Reminder Draft', [
    'Rewrite this service reminder into a warm short WhatsApp message.',
    '',
    'Rules:',
    '- Keep it polite and practical.',
    '- Keep the workshop name as JalaSai.',
    '- Do not invent service history or offers.',
    '- Return plain text only.',
    '',
    `Customer: ${c.name}`,
    `Phone: ${c.phone || ''}`,
    `Last service date: ${followup.lastServiceDate || ''}`,
    `Base message: ${base}`,
  ].join('\n'));
}
