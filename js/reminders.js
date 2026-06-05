// ═══════════════════════════════════════════════════════
//  REMINDERS PAGE
//  Three lists — Feedback Due, Service Due, Payment Due.
//  Each row: Send WhatsApp, Mark Sent, Remove.
//  Missing-phone rows swap Send/Sent for Edit Customer.
// ═══════════════════════════════════════════════════════

let reminderActiveTab = 'feedback';

function setReminderTab(tab) {
  reminderActiveTab = tab;
  renderReminders();
}

function buildReminderRows() {
  const stateCustomers = window.appState?.customers || customers;
  const stateJobs = window.appState?.jobs || jobs;
  const summaryIndex = typeof buildCustomerJobSummaryIndex === 'function'
    ? buildCustomerJobSummaryIndex(stateCustomers, stateJobs, { allowNameFallback: true })
    : null;
  return stateCustomers.filter(isLiveCustomer).map(customer => {
    const cJobs = summaryIndex?.summaries?.get(customer.id)?.jobs || customerJobsForBalance(customer.id);
    return {
      customer,
      followup: typeof customerFollowupStatusFromJobs === 'function'
        ? customerFollowupStatusFromJobs(customer, cJobs)
        : customerFollowupStatus(customer.id),
      payment: typeof customerPaymentReminderStatusFromJobs === 'function'
        ? customerPaymentReminderStatusFromJobs(customer, cJobs)
        : customerPaymentReminderStatus(customer.id),
    };
  });
}

function collectFeedbackReminders(rows = buildReminderRows()) {
  return rows
    .filter(x => x.followup.lastServiceJob && x.followup.feedbackActive)
    .sort((a, b) => (a.followup.feedbackDueDate || '').localeCompare(b.followup.feedbackDueDate || ''));
}

function collectServiceReminders(rows = buildReminderRows()) {
  return rows
    .filter(x => x.followup.lastServiceJob && x.followup.serviceActive)
    .sort((a, b) => (a.followup.serviceReminderDate || '').localeCompare(b.followup.serviceReminderDate || ''));
}

function collectPaymentReminders(rows = buildReminderRows()) {
  return rows
    .filter(x => x.payment.active && x.payment.dueTotal > 0)
    .sort((a, b) => b.payment.dueTotal - a.payment.dueTotal);
}

function renderReminders() {
  const container = document.getElementById('page-reminders');
  if (!container) return;

  const reminderRows = buildReminderRows();
  const fb = collectFeedbackReminders(reminderRows);
  const sv = collectServiceReminders(reminderRows);
  const pm = collectPaymentReminders(reminderRows);

  const countEl = document.getElementById('rem-total-count');
  if (countEl) countEl.textContent = (fb.length + sv.length + pm.length) + ' active';

  const tabs = [
    { id: 'feedback', label: 'Feedback Due',  count: fb.length },
    { id: 'service',  label: 'Service Due',   count: sv.length },
    { id: 'payment',  label: 'Payment Due',   count: pm.length },
  ];
  const tabsBar = document.getElementById('rem-tabs');
  if (tabsBar) {
    tabsBar.innerHTML = tabs.map(t => `
      <button class="btn ${reminderActiveTab === t.id ? 'btn-p' : 'btn-g'} btn-sm"
              onclick="setReminderTab('${t.id}')">
        ${t.label} <span style="opacity:.75;margin-left:4px;">(${t.count})</span>
      </button>
    `).join('');
  }

  const list = document.getElementById('rem-list');
  if (!list) return;

  if (reminderActiveTab === 'feedback') {
    list.innerHTML = fb.length
      ? fb.map(x => reminderRow('feedback', x.customer, x.followup)).join('')
      : emptyState('All feedback reminders cleared.');
  } else if (reminderActiveTab === 'service') {
    list.innerHTML = sv.length
      ? sv.map(x => reminderRow('service', x.customer, x.followup)).join('')
      : emptyState('All service reminders cleared.');
  } else {
    list.innerHTML = pm.length
      ? pm.map(x => reminderRow('payment', x.customer, x.payment)).join('')
      : emptyState('No payment reminders pending.');
  }
}

function emptyState(text) {
  return `<div style="text-align:center;padding:40px;color:var(--mut);">${text}</div>`;
}

function reminderRow(type, c, info) {
  const hasPhone = !!c.phone;
  const vehicles = (c.vehicles || []).join(', ') || 'No vehicle';

  let metaLine = '';
  let previewLine = '';
  let actionAttr = '';

  if (type === 'feedback') {
    const job = info.lastServiceJob;
    const daysSince = Math.max(0, daysSinceDate(info.feedbackDueDate));
    metaLine = `Service: ${fmtDate(info.lastServiceDate)} · Invoice ${job.invoiceNo || job.id} · ${daysSince} day${daysSince === 1 ? '' : 's'} since due`;
    previewLine = `1-week feedback reminder for ${job.veh || 'vehicle'}.`;
    actionAttr = `data-job-id="${job.id}"`;
  } else if (type === 'service') {
    const job = info.lastServiceJob;
    const daysSince = Math.max(0, daysSinceDate(info.serviceReminderDate));
    metaLine = `Last service: ${fmtDate(info.lastServiceDate)} · Invoice ${job.invoiceNo || job.id} · ${daysSince} day${daysSince === 1 ? '' : 's'} since due`;
    previewLine = `75-day service reminder for ${job.veh || 'vehicle'}.`;
    actionAttr = `data-job-id="${job.id}"`;
  } else {
    const invoices = info.dueJobs.length;
    metaLine = `Outstanding: <b style="color:var(--dan);">${fmtMoney(info.dueTotal)}</b> across ${invoices} invoice${invoices === 1 ? '' : 's'}`;
    previewLine = `Payment reminder. Hides 7 days after action, or instantly if balance grows.`;
    actionAttr = `data-total="${info.dueTotal}"`;
  }

  const actions = hasPhone
    ? `
      <button class="btn btn-p btn-sm" onclick="reminderSend('${type}','${c.id}')">Send WhatsApp</button>
      <button class="btn btn-g btn-sm" onclick="reminderMarkSent('${type}','${c.id}')">Mark as Sent</button>
      <button class="btn btn-g btn-sm" onclick="reminderDismiss('${type}','${c.id}')">Remove</button>`
    : `
      <button class="btn btn-p btn-sm" onclick="reminderOpenEdit('${c.id}')">Edit Customer · Add Phone</button>
      <button class="btn btn-g btn-sm" onclick="reminderDismiss('${type}','${c.id}')">Remove</button>`;

  return `
    <div class="ccard" ${actionAttr} style="margin-bottom:10px;cursor:default;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
        <div>
          <div style="font-family:var(--fh);font-size:16px;font-weight:700;">${c.name}</div>
          <div style="font-size:12px;color:${hasPhone ? 'var(--acc)' : 'var(--dan)'};">${c.phone || 'No phone added'}</div>
          <div style="font-size:12px;color:var(--mut);">${vehicles}</div>
        </div>
      </div>
      <div style="font-size:12px;color:var(--mut);margin-bottom:6px;">${metaLine}</div>
      <div style="font-size:12px;color:var(--txt);margin-bottom:10px;">${previewLine}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">${actions}</div>
    </div>`;
}

function reminderSend(type, custId) {
  const c = customers.find(x => x.id === custId && isLiveCustomer(x));
  if (!c) return;
  if (!c.phone) { toast('Customer phone not available'); return; }

  if (type === 'feedback') {
    const followup = customerFollowupStatus(custId);
    if (!followup.lastServiceJob) return;
    openCustomerWhatsApp(c, buildFeedbackReminderMessage(c, followup.lastServiceJob, followup));
    logAction('remind', 'customer', c.id, { type: 'feedback', jobId: followup.lastServiceJob.id, via: 'reminders-tab' });
  } else if (type === 'service') {
    const followup = customerFollowupStatus(custId);
    if (!followup.lastServiceJob) return;
    openCustomerWhatsApp(c, buildServiceReminderMessage(c, followup.lastServiceJob, followup));
    logAction('remind', 'customer', c.id, { type: 'service', jobId: followup.lastServiceJob.id, via: 'reminders-tab' });
  } else if (type === 'payment') {
    const payment = customerPaymentReminderStatus(custId);
    if (!payment.dueJobs.length) { toast('No due amount for this customer'); return; }
    openCustomerWhatsApp(c, buildDueReminderMessage(c, payment.dueJobs));
    logAction('remind', 'customer', c.id, { type: 'payment', due: payment.dueTotal, jobs: payment.dueJobs.length, via: 'reminders-tab' });
  }
}

function reminderMarkSent(type, custId) {
  const c = customers.find(x => x.id === custId && isLiveCustomer(x));
  if (!c) return;
  if (type === 'feedback' || type === 'service') {
    const followup = customerFollowupStatus(custId);
    if (!followup.lastServiceJob) return;
    markCustomerReminder(custId, type, 'sent', { jobId: followup.lastServiceJob.id });
  } else if (type === 'payment') {
    const payment = customerPaymentReminderStatus(custId);
    markCustomerReminder(custId, 'payment', 'sent', { snapshotTotal: payment.dueTotal, snoozeDays: 7 });
  }
  saveAll({ domain: 'reminder' });
  renderReminders();
  toast('Marked as sent');
}

function reminderDismiss(type, custId) {
  const c = customers.find(x => x.id === custId && isLiveCustomer(x));
  if (!c) return;
  if (type === 'feedback' || type === 'service') {
    const followup = customerFollowupStatus(custId);
    if (!followup.lastServiceJob) return;
    markCustomerReminder(custId, type, 'dismissed', { jobId: followup.lastServiceJob.id });
  } else if (type === 'payment') {
    const payment = customerPaymentReminderStatus(custId);
    markCustomerReminder(custId, 'payment', 'dismissed', { snapshotTotal: payment.dueTotal, snoozeDays: 7 });
  }
  saveAll({ domain: 'reminder' });
  renderReminders();
  toast('Removed from list');
}

function reminderOpenEdit(custId) {
  if (typeof openEditCust === 'function') openEditCust(custId);
}
