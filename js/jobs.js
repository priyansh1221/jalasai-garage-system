// ═══════════════════════════════════════════════════════
//  Jobs module — with photo, brand/model, advance pay
// ═══════════════════════════════════════════════════════

let jobMechFilter   = '';
const JOB_STATUS_OPTIONS = ['waiting', 'in-progress', 'parts-needed', 'ready', 'returned'];
let jobStatusFilter = new Set(JOB_STATUS_OPTIONS);
let jobSearchFilter = '';
const JOB_DRAFT_STORAGE_KEY = 'jala_job_draft_v1';
const LAST_PAYMENT_METHOD_KEY = 'jala_last_payment_method_v1';
const QUICK_INVOICE_DRAFT_STORAGE_KEY = 'jala_quick_invoice_draft_v1';
const QUICK_INVOICE_DATALIST_LIMIT = 12;
const QUICK_INVOICE_DRAFT_SAVE_DELAY_MS = 180;
const QUICK_INVOICE_SUGGEST_MIN_CHARS = 3;
const CUSTOMER_SUGGEST_DEBOUNCE_MS = 90;
let quickInvoiceDraftTimer = null;
let recentCustomerCache = { signature: '', list: [] };
let recentBikeCache = { signature: '', list: [] };
let customerSuggestionIndexCache = { signature: '', entries: [] };
const FAST_ENTRY_UI = Object.freeze({
  chipMechanics: true,
  chipPayments: true,
  recentCustomers: true,
  recentBikes: true,
  serviceShortcuts: true,
  dashboardRemarks: true,
});
const FAST_SERVICE_SHORTCUTS = [
  'General Service',
  'Engine Oil Change',
  'Brake Work',
  'Puncture',
  'Chain Set',
  'Clutch Work',
  'Wiring',
  'Battery Check',
  'Tyre Change',
  'Wheel Alignment',
  'Wash',
  'Pickup'
];
const FAST_PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
];
const INCOME_TYPE_OPTIONS = [
  { value: 'regular_income', label: 'Regular' },
  { value: 'other_income', label: 'Other' },
];

function runAfterFastEntryPaint(fn) {
  const run = () => {
    try { fn(); } catch (err) { console.warn('Fast entry hydration failed', err); }
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(run));
  } else {
    setTimeout(run, 0);
  }
}

function fastEntryDataSignature(scope = '') {
  const lastJob = Array.isArray(jobs) && jobs.length ? jobs[jobs.length - 1] : {};
  const lastCustomer = Array.isArray(customers) && customers.length ? customers[customers.length - 1] : {};
  return [
    scope,
    window.__JALASAI_DATA_VERSION || 0,
    Array.isArray(jobs) ? jobs.length : 0,
    Array.isArray(customers) ? customers.length : 0,
    lastJob?.id || '',
    lastJob?.updatedAt || lastJob?.doneAt || lastJob?.createdAt || '',
    lastCustomer?.id || '',
    lastCustomer?.updatedAt || lastCustomer?.createdAt || '',
  ].join('|');
}

function fastEntryPhoneKey(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function fastEntryNameKey(value = '') {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function customerSuggestionSignature() {
  const lastCustomer = Array.isArray(customers) && customers.length ? customers[customers.length - 1] : {};
  return [
    window.__JALASAI_DATA_VERSION || 0,
    Array.isArray(customers) ? customers.length : 0,
    lastCustomer?.id || '',
    lastCustomer?.updatedAt || lastCustomer?.createdAt || '',
  ].join('|');
}

function customerSuggestionIndex() {
  const signature = customerSuggestionSignature();
  if (customerSuggestionIndexCache.signature === signature) return customerSuggestionIndexCache.entries;
  const entries = customers
    .filter(isLiveCustomer)
    .map(customer => {
      const phoneDigits = fastEntryPhoneKey(customer.phone || '');
      const name = fastEntryNameKey(customer.name || '');
      const vehicles = [customer.lastVehicle].concat(customer.vehicles || []).filter(Boolean).join(' ');
      const searchText = fastEntryNameKey(`${customer.name || ''} ${phoneDigits} ${customer.phone || ''} ${vehicles}`);
      return { customer, name, phoneDigits, searchText };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  customerSuggestionIndexCache = { signature, entries };
  return entries;
}

function previewPhotoList(previewId) {
  if (typeof getPhotoPreviewList === 'function') return getPhotoPreviewList(previewId);
  const prev = document.getElementById(previewId);
  return normalizePhotoArray(prev?.dataset?.photoList || prev?.dataset?.dataUrl || '');
}

function jobPhotoList(job, kind = 'job') {
  if (kind === 'invoice') return normalizePhotoArray(job?.invoicePhotos || job?.invoicePhoto || '');
  return normalizePhotoArray(job?.photos || job?.photo || '');
}

function jobPhotoGalleryMarkup(job, kind = 'job', title = 'Photo Reference') {
  const list = jobPhotoList(job, kind);
  if (!list.length || typeof photoGalleryMarkup !== 'function') return '';
  return photoGalleryMarkup('', list, title, '');
}

function photoThumbWithCount(urls, title = 'Photo Reference') {
  const list = normalizePhotoArray(urls);
  if (!list.length) return '<span style="color:var(--mut);font-size:12px;">—</span>';
  const first = escapeAttr(list[0]);
  const count = list.length > 1 ? `<div class="photo-count-chip" style="position:absolute;bottom:6px;right:6px;">+${list.length - 1}</div>` : '';
  return `<div style="position:relative;width:54px;height:54px;"><img src="${first}" loading="lazy" decoding="async" fetchpriority="low" class="clickable-photo" style="width:54px;height:54px;object-fit:cover;border-radius:8px;border:1px solid var(--bor);" onclick="openImageViewer('${first}','${escapeAttr(title)} 1')">${count}</div>`;
}

function invoiceDateTime(invoiceDate = today(), fallbackTime = '') {
  const safeDate = invoiceDate || today();
  const timePart = String(fallbackTime || '').trim() || new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const parsed = timePart.match(/(\d{1,2}):(\d{2})(?:\s*([AP]M))?/i);
  let hours = 0;
  let mins = 0;
  if (parsed) {
    hours = parseInt(parsed[1], 10) || 0;
    mins = parseInt(parsed[2], 10) || 0;
    const mer = String(parsed[3] || '').toUpperCase();
    if (mer === 'PM' && hours < 12) hours += 12;
    if (mer === 'AM' && hours === 12) hours = 0;
  }
  return `${safeDate}T${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`;
}

function getStoredPaymentMethod() {
  return localStorage.getItem(LAST_PAYMENT_METHOD_KEY) || 'cash';
}

function rememberPaymentMethod(method) {
  localStorage.setItem(LAST_PAYMENT_METHOD_KEY, method || 'cash');
}

function invoiceRefKey(value = '') {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\bINVOICE\b/g, '')
    .replace(/\bINV\b/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

function simpleInvoiceNumber(value = '') {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return '';
  const cleaned = text
    .replace(/\bINVOICE\b/g, '')
    .replace(/\bINV\b/g, '')
    .replace(/[\s#:/-]/g, '');
  if (!/^\d+$/.test(cleaned)) return '';
  return cleaned.replace(/^0+(?=\d)/, '');
}

function invoiceRefsStrictMatch(left = '', right = '') {
  const a = invoiceRefKey(left);
  const b = invoiceRefKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const aSimple = simpleInvoiceNumber(left);
  const bSimple = simpleInvoiceNumber(right);
  return !!(aSimple && bSimple && aSimple === bSimple);
}

function findDuplicateInvoiceNumber(rawValue = '', excludeJobId = '') {
  const normalized = invoiceRefKey(rawValue);
  if (!normalized) return null;
  return jobs.find(j => (
    isLiveJob(j)
    && j.id !== excludeJobId
    && j.status === 'done'
    && (
      invoiceRefsStrictMatch(j.invoiceNo || '', normalized)
      || (!String(j.invoiceNo || '').trim() && invoiceRefKey(j.id || '') === normalized)
    )
  )) || null;
}

function invoiceNumberExists(rawValue = '', excludeJobId = '') {
  return !!findDuplicateInvoiceNumber(rawValue, excludeJobId);
}

function mechanicChoices() {
  const options = [{ value: '', label: 'N/A' }];
  const seen = new Set(['']);
  const seenLabels = new Set();
  const addOption = (value, label) => {
    const matched = findMechanicByIdOrName(value) || findMechanicByIdOrName(label);
    const cleanValue = String(matched?.id || '').trim();
    const cleanLabel = String(matched?.name || '').trim();
    const labelKey = cleanLabel.toLowerCase().replace(/\s+/g, ' ');
    if (!cleanValue || !cleanLabel || seen.has(cleanValue)) return;
    if (isMechanicPlaceholderValue(cleanValue) || isMechanicPlaceholderValue(cleanLabel)) return;
    if (seenLabels.has(labelKey)) return;
    seen.add(cleanValue);
    seenLabels.add(labelKey);
    options.push({ value: cleanValue, label: cleanLabel });
  };

  mechanics
    .filter(isLiveMechanic)
    .filter(m => m.active !== false)
    .forEach(m => addOption(m.id, m.name));

  return options;
}

function parseMechanicIds(value) {
  return canonicalMechanicIds(String(value || '').split(',').map(part => part.trim()));
}

function setInvoiceDateShortcut(inputId, mode = 'today') {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (mode === 'today') {
    input.value = today();
  } else if (mode === 'yesterday') {
    input.value = yesterday();
  } else {
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
      } catch (_) {
        input.focus();
        input.click();
      }
    } else {
      input.focus();
      input.click();
    }
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function mechanicNamesFromIds(ids = []) {
  return uniqStrings(
    canonicalMechanicIds(ids)
      .map(id => mechanics.find(m => String(m.id || '').trim() === id)?.name || '')
  );
}

function mechanicValueString(ids = []) {
  return uniqStrings(ids).join(',');
}

function jobMechanicIds(job) {
  return canonicalMechanicIds(
    []
      .concat(job?.mechIds || [])
      .concat(job?.mechanicIds || [])
      .concat(job?.mechanic_ids || [])
      .concat(job?.mechId ? [job.mechId] : [])
      .concat(job?.mechanicId ? [job.mechanicId] : [])
      .concat(mechanicReferenceNames(job))
  );
}

function mechanicLabel(ids = [], fallback = '') {
  const names = mechanicNamesFromIds(ids);
  const backup = String(fallback || '').trim();
  return names.length ? names.join(', ') : (backup || 'No mechanic');
}

function toggleMechanicChipValue(inputId, containerId, value) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const current = parseMechanicIds(input.value);
  let next = current.slice();
  if (!value) {
    next = [];
  } else if (next.includes(value)) {
    next = next.filter(id => id !== value);
  } else {
    next.push(value);
  }
  input.value = mechanicValueString(next);
  if (inputId === 'jm-mech') renderJobMechanicChips(input.value);
  if (inputId === 'qi-mech') renderQuickInvoiceMechanicChips(input.value);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function recentCustomerList(limit = 5) {
  const safeLimit = Math.max(1, limit || 5);
  const signature = fastEntryDataSignature(`recent-customers:${safeLimit}`);
  if (recentCustomerCache.signature === signature) return recentCustomerCache.list.slice(0, safeLimit);

  const liveCustomers = customers.filter(isLiveCustomer);
  const byId = new Map();
  const byPhone = new Map();
  const byName = new Map();
  liveCustomers.forEach(c => {
    const id = String(c.id || '').trim();
    const phone = fastEntryPhoneKey(c.phone || '');
    const name = fastEntryNameKey(c.name || '');
    if (id) byId.set(id, c);
    if (phone && !byPhone.has(phone)) byPhone.set(phone, c);
    if (name && !byName.has(name)) byName.set(name, c);
  });

  const out = [];
  const seen = new Set();
  const add = customer => {
    if (!customer || !isLiveCustomer(customer)) return false;
    const id = String(customer.id || '').trim() || `${customer.name}|${customer.phone}`;
    if (seen.has(id)) return false;
    seen.add(id);
    out.push(customer);
    return out.length >= safeLimit;
  };

  jobs
    .filter(isLiveJob)
    .sort((a, b) => jobDateTimeValue(b) - jobDateTimeValue(a))
    .some(j => {
      if (add(byId.get(String(j.custId || '').trim()))) return true;
      if (add(byPhone.get(fastEntryPhoneKey(j.phone || '')))) return true;
      return add(byName.get(fastEntryNameKey(j.cust || j.customer || j.customerName || '')));
    });

  if (out.length < safeLimit) {
    liveCustomers
      .slice()
      .sort((a, b) => (Date.parse(b.updatedAt || b.createdAt || 0) || 0) - (Date.parse(a.updatedAt || a.createdAt || 0) || 0) || a.name.localeCompare(b.name))
      .some(add);
  }

  recentCustomerCache = { signature, list: out.slice(0, safeLimit) };
  return recentCustomerCache.list.slice(0, safeLimit);
}

function recentBikeList(limit = 6) {
  const safeLimit = Math.max(1, limit || 6);
  const signature = fastEntryDataSignature(`recent-bikes:${safeLimit}`);
  if (recentBikeCache.signature === signature) return recentBikeCache.list.slice(0, safeLimit);
  const bikes = [];
  jobs
    .filter(isLiveJob)
    .slice()
    .sort((a, b) => jobDateTimeValue(b) - jobDateTimeValue(a))
    .forEach(j => {
      if (j.veh) bikes.push(j.veh);
    });
  customers.forEach(c => {
    if (c.lastVehicle) bikes.push(c.lastVehicle);
    (c.vehicles || []).forEach(v => bikes.push(v));
  });
  recentBikeCache = { signature, list: uniqStrings(bikes).slice(0, safeLimit) };
  return recentBikeCache.list.slice(0, safeLimit);
}

function renderChoiceChips(containerId, hiddenInputId, options, selectedValue = '', persistFn = null) {
  const box = document.getElementById(containerId);
  const input = document.getElementById(hiddenInputId);
  if (!box || !input) return;
  const current = String(selectedValue ?? input.value ?? '');
  input.value = current;
  box.innerHTML = options.map(opt => {
    const active = String(opt.value) === current;
    return `<button type="button" class="btn btn-sm ${active ? 'btn-p' : 'btn-g'}" onclick="setChoiceChipValue('${hiddenInputId}','${containerId}','${escapeAttr(String(opt.value))}')">${opt.label}</button>`;
  }).join('');
  if (persistFn) persistFn();
}

function setChoiceChipValue(inputId, containerId, value) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = value;
  if (inputId === 'jm-mech') renderJobMechanicChips();
  if (inputId === 'qi-mech') renderQuickInvoiceMechanicChips();
  if (inputId === 'qi-pay-method') renderQuickInvoicePaymentChips();
  if (inputId === 'done-pay-method') renderDonePaymentChips();
  if (inputId === 'pay-method') renderPaymentMethodChips();
  if (inputId === 'im-type') renderIncomeTypeChips();
  if (inputId === 'im-mech') renderIncomeMechanicChips();
  if (inputId === 'im-method') renderIncomeMethodChips();
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function renderJobMechanicChips(selectedId = document.getElementById('jm-mech')?.value || '') {
  if (!FAST_ENTRY_UI.chipMechanics) return;
  renderMechanicChoiceChips('jm-mech-chips', 'jm-mech', selectedId);
}

function renderQuickInvoiceMechanicChips(selectedId = document.getElementById('qi-mech')?.value || '') {
  if (!FAST_ENTRY_UI.chipMechanics) return;
  renderMechanicChoiceChips('qi-mech-chips', 'qi-mech', selectedId);
}

function renderMechanicChoiceChips(containerId, hiddenInputId, selectedValue = '') {
  const box = document.getElementById(containerId);
  const input = document.getElementById(hiddenInputId);
  if (!box || !input) return;
  const selectedIds = parseMechanicIds(selectedValue ?? input.value ?? '');
  input.value = mechanicValueString(selectedIds);
  const options = mechanicChoices();
  const addMechanicChip = options.length <= 1 && typeof openAddMech === 'function'
    ? `<button type="button" class="btn btn-sm btn-g" onclick="openAddMech()">+ Add Mechanic</button>`
    : '';
  box.innerHTML = options.map(opt => {
    const active = opt.value ? selectedIds.includes(String(opt.value)) : !selectedIds.length;
    const handler = opt.value
      ? `toggleMechanicChipValue('${hiddenInputId}','${containerId}','${escapeAttr(String(opt.value))}')`
      : `toggleMechanicChipValue('${hiddenInputId}','${containerId}','')`;
    return `<button type="button" class="btn btn-sm ${active ? 'btn-p' : 'btn-g'}" onclick="${handler}">${opt.label}</button>`;
  }).join('') + addMechanicChip;
}

function renderQuickInvoicePaymentChips(selected = document.getElementById('qi-pay-method')?.value || getStoredPaymentMethod()) {
  if (!FAST_ENTRY_UI.chipPayments) return;
  renderChoiceChips('qi-pay-chips', 'qi-pay-method', FAST_PAYMENT_METHODS, selected);
}

function renderDonePaymentChips(selected = document.getElementById('done-pay-method')?.value || getStoredPaymentMethod()) {
  if (!FAST_ENTRY_UI.chipPayments) return;
  renderChoiceChips('done-pay-chips', 'done-pay-method', FAST_PAYMENT_METHODS, selected);
}

function renderPaymentMethodChips(selected = document.getElementById('pay-method')?.value || getStoredPaymentMethod()) {
  if (!FAST_ENTRY_UI.chipPayments) return;
  renderChoiceChips('pay-method-chips', 'pay-method', FAST_PAYMENT_METHODS, selected);
}

function renderIncomeTypeChips(selected = document.getElementById('im-type')?.value || 'regular_income') {
  renderChoiceChips('im-type-chips', 'im-type', INCOME_TYPE_OPTIONS, selected);
  syncIncomeEntryFields(selected);
}

function renderIncomeMethodChips(selected = document.getElementById('im-method')?.value || 'cash') {
  renderChoiceChips('im-method-chips', 'im-method', FAST_PAYMENT_METHODS, selected);
}

function renderIncomeMechanicChips(selected = document.getElementById('im-mech')?.value || '') {
  renderChoiceChips('im-mech-chips', 'im-mech', mechanicChoices(), selected);
}

function syncIncomeEntryFields(kind = document.getElementById('im-type')?.value || 'regular_income') {
  const showRegularFields = kind === 'regular_income';
  const mechRow = document.getElementById('im-mech-row');
  const invoiceRow = document.getElementById('im-invoice-row');
  const mechInput = document.getElementById('im-mech');
  const invoiceInput = document.getElementById('im-invoice-no');
  if (mechRow) mechRow.style.display = showRegularFields ? '' : 'none';
  if (invoiceRow) invoiceRow.style.display = showRegularFields ? '' : 'none';
  if (!showRegularFields) {
    if (mechInput) mechInput.value = '';
    if (invoiceInput) invoiceInput.value = '';
  }
  renderIncomeMechanicChips(showRegularFields ? (mechInput?.value || '') : '');
}

function renderRecentCustomerChips(containerId, pickerFnName) {
  const box = document.getElementById(containerId);
  if (!box || !FAST_ENTRY_UI.recentCustomers) return;
  const list = recentCustomerList(5);
  box.innerHTML = list.length
    ? list.map(c => `<button type="button" class="btn btn-g btn-sm" onclick="${pickerFnName}('${c.id}')">${c.name}</button>`).join('')
    : '';
}

function renderRecentBikeChips(containerId, inputId) {
  const box = document.getElementById(containerId);
  if (!box || !FAST_ENTRY_UI.recentBikes) return;
  const list = recentBikeList(6);
  box.innerHTML = list.length
    ? list.map(name => `<button type="button" class="btn btn-g btn-sm" onclick="applyRecentBike('${inputId}','${escapeAttr(name)}')">${name}</button>`).join('')
    : '';
}

function applyRecentBike(inputId, value) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = value;
  if (typeof suggestVehicleName === 'function') suggestVehicleName(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderServiceShortcutChips() {
  if (!FAST_ENTRY_UI.serviceShortcuts) return;
  const markup = FAST_SERVICE_SHORTCUTS
    .map(label => `<button type="button" class="btn btn-g btn-sm" onclick="applyServiceShortcut('qi-prob','${escapeAttr(label)}')">${label}</button>`)
    .join('');
  const quickBox = document.getElementById('qi-service-chips');
  if (quickBox) quickBox.innerHTML = markup;
  const jobBox = document.getElementById('jm-service-chips');
  if (jobBox) {
    jobBox.innerHTML = FAST_SERVICE_SHORTCUTS
      .map(label => `<button type="button" class="btn btn-g btn-sm" onclick="applyServiceShortcut('jm-prob','${escapeAttr(label)}')">${label}</button>`)
      .join('');
  }
}

function applyServiceShortcut(inputId, value) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const nextValue = appendShortcutValue(input.value, value);
  input.value = nextValue;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function appendShortcutValue(currentValue, nextValue) {
  const current = String(currentValue || '').trim();
  const next = String(nextValue || '').trim();
  if (!next) return current;
  if (!current) return next;
  const parts = uniqStrings(current.split(',').map(part => part.trim()).filter(Boolean));
  if (parts.some(part => part.toLowerCase() === next.toLowerCase())) return current;
  return `${current}, ${next}`;
}

function aiPromptValue(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

function openAiPrompt(title, instructions, details = {}, options = {}) {
  if (typeof openAiAssistModal !== 'function') {
    toast('AI assist modal is not ready');
    return;
  }
  const detailLines = Object.entries(details)
    .map(([label, value]) => [label, String(value || '').trim()])
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`);
  const prompt = [
    instructions.trim(),
    '',
    'Rules:',
    '- Keep it factual and short.',
    '- Do not invent parts, prices, or customer details.',
    '- If the text is unclear, keep it simple instead of guessing.',
    '- Return only the cleaned result, no explanation.',
    '',
    'Input:',
    ...detailLines,
  ].join('\n');
  openAiAssistModal(title, prompt, options);
}

function aiCleanJobProblem() {
  const text = aiPromptValue('jm-prob');
  if (!text) { toast('Enter work description first'); return; }
  openAiPrompt('AI Clean Work', 'Rewrite this garage job-card work description into clean workshop English.', {
    'Customer': aiPromptValue('jm-cust-name'),
    'Bike': aiPromptValue('jm-veh'),
    'Reg No': aiPromptValue('jm-vno'),
    'Raw work description': text,
  }, { applyTargetId: 'jm-prob', applyLabel: 'Apply to Work' });
}

function aiCleanJobNotes() {
  const text = aiPromptValue('jm-notes');
  if (!text) { toast('Enter notes first'); return; }
  openAiPrompt('AI Clean Note', 'Rewrite this garage note into a clean short internal workshop note.', {
    'Customer': aiPromptValue('jm-cust-name'),
    'Bike': aiPromptValue('jm-veh'),
    'Related work': aiPromptValue('jm-prob'),
    'Raw note': text,
  }, { applyTargetId: 'jm-notes', applyLabel: 'Apply to Note' });
}

function aiCleanQuickInvoiceWork() {
  const text = aiPromptValue('qi-prob');
  if (!text) { toast('Enter work/service first'); return; }
  openAiPrompt('AI Clean Work', 'Rewrite this quick invoice work description into clean workshop English suitable for billing or notes.', {
    'Customer': aiPromptValue('qi-cust-name'),
    'Bike': aiPromptValue('qi-veh'),
    'Reg No': aiPromptValue('qi-vno'),
    'Raw work description': text,
  }, { applyTargetId: 'qi-prob', applyLabel: 'Apply to Work' });
}

function aiCleanQuickInvoiceNotes() {
  const text = aiPromptValue('qi-notes');
  if (!text) { toast('Enter notes first'); return; }
  openAiPrompt('AI Clean Note', 'Rewrite this quick invoice note into a short clear garage note.', {
    'Customer': aiPromptValue('qi-cust-name'),
    'Bike': aiPromptValue('qi-veh'),
    'Related work': aiPromptValue('qi-prob'),
    'Raw note': text,
  }, { applyTargetId: 'qi-notes', applyLabel: 'Apply to Note' });
}

function aiCleanInvoiceCompletionNotes() {
  const text = aiPromptValue('done-notes');
  if (!text) { toast('Enter completion note first'); return; }
  openAiPrompt('AI Clean Completion Note', 'Rewrite this completion note into a short clear finished-work summary for garage records.', {
    'Invoice No': aiPromptValue('done-invoice-no'),
    'Raw completion note': text,
  }, { applyTargetId: 'done-notes', applyLabel: 'Apply to Completion Note' });
}

function renderIncomeServiceChips() {
  const box = document.getElementById('im-service-chips');
  if (!box || !FAST_ENTRY_UI.serviceShortcuts) return;
  box.innerHTML = FAST_SERVICE_SHORTCUTS.map(label => `<button type="button" class="btn btn-g btn-sm" onclick="applyIncomeShortcut('${label}')">${label}</button>`).join('');
}

function applyIncomeShortcut(value) {
  const input = document.getElementById('im-note');
  if (!input) return;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function prefillCustomerFromSearch(raw = '') {
  const text = String(raw || '').trim();
  const phoneMatch = text.match(/(\d{7,15})/);
  const phone = phoneMatch ? phoneMatch[1] : '';
  const name = text.replace(/\d{7,15}/g, '').replace(/[·|-]/g, ' ').replace(/\s+/g, ' ').trim();
  return { name, phone };
}

function customerSearchMatches(customer, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q || !customer) return false;
  if (String(customer.name || '').toLowerCase().includes(q)) return true;
  if (String(customer.phone || '').includes(query)) return true;

  const relatedJobs = jobs.filter(job => {
    if (!isLiveJob(job)) return false;
    if (typeof customerOwnsJob === 'function') return customerOwnsJob(customer, job);
    if (customer.id && job.custId === customer.id) return true;
    if (customer.phone && job.phone && customer.phone === job.phone) return true;
    return String(job.cust || '').trim().toLowerCase() === String(customer.name || '').trim().toLowerCase();
  });

  return relatedJobs.some(job => {
    const regNo = String(job.vno || '').trim().toLowerCase();
    const vehicle = String(job.veh || '').trim().toLowerCase();
    return regNo.includes(q) || vehicle.includes(q);
  });
}

function cheapCustomerSearchMatches(customer, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q || !customer) return false;
  const digits = String(query || '').replace(/\D/g, '');
  if (String(customer.name || '').toLowerCase().includes(q)) return true;
  if (digits && String(customer.phone || '').replace(/\D/g, '').includes(digits)) return true;
  if (String(customer.lastVehicle || '').toLowerCase().includes(q)) return true;
  return (customer.vehicles || []).some(vehicle => String(vehicle || '').toLowerCase().includes(q));
}

function quickInvoiceSuggestionQueryReady(query) {
  const alnum = String(query || '').replace(/[^a-zA-Z0-9]/g, '');
  return alnum.length >= QUICK_INVOICE_SUGGEST_MIN_CHARS;
}

function matchingCustomers(query, options = {}) {
  const raw = String(query || '').trim();
  if (!raw) return [];
  const limit = parseInt(options.limit, 10) || 0;
  if (limit > 0) {
    const q = fastEntryNameKey(raw);
    const digits = fastEntryPhoneKey(raw);
    return customerSuggestionIndex()
      .map(entry => {
        let rank = 99;
        if (digits && entry.phoneDigits === digits) rank = 0;
        else if (digits && entry.phoneDigits.startsWith(digits)) rank = 1;
        else if (entry.name === q) rank = 2;
        else if (entry.name.startsWith(q)) rank = 3;
        else if (entry.searchText.includes(q) || (digits && entry.phoneDigits.includes(digits))) rank = 4;
        return { ...entry, rank };
      })
      .filter(entry => entry.rank < 99)
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
      .slice(0, limit)
      .map(entry => entry.customer);
  }
  return customers
    .filter(isLiveCustomer)
    .filter(customer => customerSearchMatches(customer, raw))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function customerSearchHint(customer, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q || !customer) return '';
  const digits = fastEntryPhoneKey(query);
  if (digits && fastEntryPhoneKey(customer.phone || '').includes(digits)) return 'Phone';
  const matchedVehicle = [customer.lastVehicle].concat(customer.vehicles || [])
    .filter(Boolean)
    .find(vehicle => String(vehicle || '').trim().toLowerCase().includes(q));
  return matchedVehicle ? `Bike ${matchedVehicle}` : '';
}

function jobDraftStorageKey() {
  return editJobId ? `${JOB_DRAFT_STORAGE_KEY}:edit:${editJobId}` : `${JOB_DRAFT_STORAGE_KEY}:new`;
}

function invoiceDraftStorageKey(jobId, mode = 'create') {
  return `jala_invoice_draft_v1:${mode}:${jobId}`;
}

function captureJobDraft() {
  return {
    custId: document.getElementById('jm-cust-sel')?.value || '',
    custSearch: document.getElementById('jm-cust-search')?.value || '',
    custName: document.getElementById('jm-cust-name')?.value || '',
    phone: document.getElementById('jm-phone')?.value || '',
    vehicle: document.getElementById('jm-veh')?.value || '',
    vno: document.getElementById('jm-vno')?.value || '',
    odo: document.getElementById('jm-odo')?.value || '',
    prob: document.getElementById('jm-prob')?.value || '',
    mechId: document.getElementById('jm-mech')?.value || '',
    pri: document.getElementById('jm-pri')?.value || 'normal',
    status: document.getElementById('jm-status')?.value || 'waiting',
    delivery: document.getElementById('jm-delivery')?.value || '',
    lab: document.getElementById('jm-lab')?.value || '',
    prt: document.getElementById('jm-prt')?.value || '',
    advance: document.getElementById('jm-advance')?.value || '',
    invoiceNo: document.getElementById('jm-invoice-no')?.value || '',
    discount: document.getElementById('jm-discount')?.value || '',
    notes: document.getElementById('jm-notes')?.value || '',
    photos: previewPhotoList('jm-photo-preview'),
    photoRemoved: document.getElementById('jm-photo-preview')?.dataset?.removed === 'true',
  };
}

function persistJobDraft() {
  try {
    localStorage.setItem(jobDraftStorageKey(), JSON.stringify(captureJobDraft()));
  } catch (_) {}
}

function clearJobDraft(key = jobDraftStorageKey()) {
  localStorage.removeItem(key);
}

function restoreJobDraft() {
  try {
    const raw = localStorage.getItem(jobDraftStorageKey());
    if (!raw) return false;
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== 'object') return false;
    document.getElementById('jm-cust-sel').value = draft.custId || '';
    document.getElementById('jm-cust-search').value = draft.custSearch || '';
    document.getElementById('jm-cust-name').value = draft.custName || '';
    document.getElementById('jm-phone').value = draft.phone || '';
    setVehicleValue(draft.vehicle || '');
    document.getElementById('jm-vno').value = draft.vno || '';
    document.getElementById('jm-odo').value = draft.odo || '';
    document.getElementById('jm-prob').value = draft.prob || '';
    document.getElementById('jm-mech').value = draft.mechId || '';
    renderJobMechanicChips(draft.mechId || '');
    document.getElementById('jm-pri').value = draft.pri || 'normal';
    document.getElementById('jm-status').value = draft.status || 'waiting';
    document.getElementById('jm-delivery').value = draft.delivery || '';
    document.getElementById('jm-lab').value = draft.lab || '';
    document.getElementById('jm-prt').value = draft.prt || '';
    document.getElementById('jm-advance').value = draft.advance || '';
    document.getElementById('jm-invoice-no').value = draft.invoiceNo || '';
    document.getElementById('jm-discount').value = draft.discount || '';
    document.getElementById('jm-notes').value = draft.notes || '';
    document.getElementById('jm-cust-new').style.display = draft.custId ? 'none' : 'grid';
    const prev = document.getElementById('jm-photo-preview');
    if (prev) {
      setPhotoPreviewList('jm-photo-preview', draft.photoRemoved ? [] : (draft.photos || draft.photo || []), 'Vehicle Photo Reference');
    }
    renderJobCustomerSearchResults([], '');
    return true;
  } catch (_) {
    return false;
  }
}

function bindStickyJobDrafts() {
  if (window._jobDraftBindingsReady) return;
  const ids = ['jm-cust-search','jm-cust-name','jm-phone','jm-veh','jm-vno','jm-odo','jm-prob','jm-mech','jm-pri','jm-status','jm-delivery','jm-lab','jm-prt','jm-advance','jm-invoice-no','jm-discount','jm-notes','jm-cust-sel'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    ['input', 'change'].forEach(evt => el.addEventListener(evt, () => persistJobDraft()));
  });
  window._jobDraftBindingsReady = true;
}

function captureInvoiceDraft() {
  return {
    invoiceNo: document.getElementById('done-invoice-no')?.value || '',
    invoiceDate: document.getElementById('done-invoice-date')?.value || today(),
    payment: document.getElementById('done-payment')?.value || '',
    discount: document.getElementById('done-discount')?.value || '',
    appliedAdvance: document.getElementById('done-applied-advance')?.value || '0',
    payMethod: document.getElementById('done-pay-method')?.value || getStoredPaymentMethod(),
    notes: document.getElementById('done-notes')?.value || '',
    photos: previewPhotoList('done-photo-preview'),
    photoRemoved: document.getElementById('done-photo-preview')?.dataset?.removed === 'true',
  };
}

function persistInvoiceDraft() {
  const modal = document.getElementById('m-done');
  const jobId = modal?._jobId;
  const mode = modal?.dataset?.mode || 'create';
  if (!jobId) return;
  try {
    localStorage.setItem(invoiceDraftStorageKey(jobId, mode), JSON.stringify(captureInvoiceDraft()));
  } catch (_) {}
}

function restoreInvoiceDraft(jobId, mode = 'create') {
  try {
    const raw = localStorage.getItem(invoiceDraftStorageKey(jobId, mode));
    if (!raw) return false;
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== 'object') return false;
    document.getElementById('done-invoice-no').value = draft.invoiceNo || '';
    document.getElementById('done-invoice-date').value = draft.invoiceDate || today();
    document.getElementById('done-payment').value = draft.payment || '';
    document.getElementById('done-discount').value = draft.discount || '';
    document.getElementById('done-applied-advance').value = draft.appliedAdvance || '0';
    document.getElementById('done-pay-method').value = draft.payMethod || getStoredPaymentMethod();
    renderDonePaymentChips(draft.payMethod || getStoredPaymentMethod());
    document.getElementById('done-notes').value = draft.notes || '';
    const prev = document.getElementById('done-photo-preview');
    if (prev) {
      setPhotoPreviewList('done-photo-preview', draft.photoRemoved ? [] : (draft.photos || draft.photo || []), 'Invoice Photo Reference');
    }
    return true;
  } catch (_) {
    return false;
  }
}

function clearInvoiceDraft(jobId, mode = 'create') {
  localStorage.removeItem(invoiceDraftStorageKey(jobId, mode));
}

function bindStickyInvoiceDrafts() {
  if (window._invoiceDraftBindingsReady) return;
  const ids = ['done-invoice-no','done-invoice-date','done-payment','done-discount','done-pay-method','done-notes','done-applied-advance'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    ['input', 'change'].forEach(evt => el.addEventListener(evt, () => persistInvoiceDraft()));
  });
  window._invoiceDraftBindingsReady = true;
}

function nextInvoiceCandidate(excludeId = '') {
  const order = { ready: 0, 'in-progress': 1, 'parts-needed': 2, returned: 3, waiting: 4 };
  return jobs
    .filter(j => isLiveJob(j) && j.status !== 'done' && j.id !== excludeId)
    .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || jobDateTimeValue(a) - jobDateTimeValue(b))[0] || null;
}

function refreshQuickInvoiceCustomerSuggestions(query = '') {
  const dl = document.getElementById('qi-customer-suggestions');
  if (!dl) return;
  dl.innerHTML = '';
}

function renderQuickInvoiceCustomerResults(list = [], query = '') {
  const box = document.getElementById('qi-cust-results');
  if (!box) return;
  const q = String(query || '').trim().toLowerCase();
  if (!q) {
    box.innerHTML = '';
    return;
  }
  if (!list.length) {
    box.innerHTML = '<div style="font-size:12px;color:var(--mut);padding:8px 0;">No matching customer found.</div>';
    return;
  }
  box.innerHTML = list.slice(0, 6).map(c => {
    const hint = customerSearchHint(c, query);
    return `<button type="button" class="btn btn-g btn-sm" style="margin:0 6px 6px 0;" onclick="selectQuickInvoiceCustomer('${c.id}')">
      ${c.name}${c.phone ? ` · ${c.phone}` : ''}${hint ? ` · ${hint}` : ''}
    </button>`;
  }).join('');
}

function clearQuickInvoiceCustomer(focusName = false) {
  const prefills = prefillCustomerFromSearch(document.getElementById('qi-cust-search')?.value || '');
  const ids = ['qi-cust-sel', 'qi-cust-search', 'qi-cust-name', 'qi-phone'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  if (focusName) {
    document.getElementById('qi-cust-name').value = prefills.name || '';
    document.getElementById('qi-phone').value = prefills.phone || '';
  }
  renderQuickInvoiceCustomerResults([], '');
  if (focusName) document.getElementById('qi-cust-name')?.focus();
  persistQuickInvoiceDraft();
}

function selectQuickInvoiceCustomer(id) {
  const c = customers.find(x => x.id === id);
  if (!c) return;
  document.getElementById('qi-cust-sel').value = c.id;
  document.getElementById('qi-cust-search').value = c.phone ? `${c.name} · ${c.phone}` : c.name;
  document.getElementById('qi-cust-name').value = c.name;
  document.getElementById('qi-phone').value = c.phone || '';
  document.getElementById('qi-veh').value = c.lastVehicle || (c.vehicles && c.vehicles[0]) || '';
  renderQuickInvoiceCustomerResults([], '');
  renderRecentCustomerChips('qi-recent-customers', 'selectQuickInvoiceCustomer');
  renderRecentBikeChips('qi-recent-bikes', 'qi-veh');
  persistQuickInvoiceDraft();
}

function prefillQuickInvoiceManualCustomer(query) {
  const selected = document.getElementById('qi-cust-sel')?.value || '';
  if (selected) return;
  const prefills = prefillCustomerFromSearch(query);
  const nameEl = document.getElementById('qi-cust-name');
  const phoneEl = document.getElementById('qi-phone');
  if (nameEl) nameEl.value = prefills.name || '';
  if (phoneEl && prefills.phone) phoneEl.value = prefills.phone;
}

function filterQuickInvoiceCustomer(value) {
  const query = String(value || '').trim();
  document.getElementById('qi-cust-sel').value = '';
  prefillQuickInvoiceManualCustomer(query);
  if (!quickInvoiceSuggestionQueryReady(query)) {
    if (typeof flushDebouncePerf === 'function') flushDebouncePerf('qi-cust-search');
    refreshQuickInvoiceCustomerSuggestions('');
    renderQuickInvoiceCustomerResults([], '');
    scheduleQuickInvoiceDraftSave();
    return;
  }
  refreshQuickInvoiceCustomerSuggestions(query);
  const run = () => {
    const matches = matchingCustomers(query, { limit: QUICK_INVOICE_DATALIST_LIMIT });
    renderQuickInvoiceCustomerResults(matches, query);
    persistQuickInvoiceDraft();
  };
  if (typeof debouncePerf === 'function') {
    debouncePerf('qi-cust-search', run, CUSTOMER_SUGGEST_DEBOUNCE_MS);
  } else {
    run();
  }
}

function onQuickInvoiceCustomerNameInput(value) {
  document.getElementById('qi-cust-sel').value = '';
  scheduleQuickInvoiceDraftSave();
}

function captureQuickInvoiceDraft() {
  return {
    custId: document.getElementById('qi-cust-sel')?.value || '',
    custSearch: document.getElementById('qi-cust-search')?.value || '',
    custName: document.getElementById('qi-cust-name')?.value || '',
    phone: document.getElementById('qi-phone')?.value || '',
    vehicle: document.getElementById('qi-veh')?.value || '',
    vno: document.getElementById('qi-vno')?.value || '',
    mechId: document.getElementById('qi-mech')?.value || '',
    prob: document.getElementById('qi-prob')?.value || '',
    total: document.getElementById('qi-total')?.value || '',
    paid: document.getElementById('qi-paid')?.value || '',
    discount: document.getElementById('qi-discount')?.value || '',
    payMethod: document.getElementById('qi-pay-method')?.value || getStoredPaymentMethod(),
    invoiceNo: document.getElementById('qi-invoice-no')?.value || '',
    invoiceDate: document.getElementById('qi-invoice-date')?.value || today(),
    notes: document.getElementById('qi-notes')?.value || '',
    photos: previewPhotoList('qi-photo-preview'),
    photoRemoved: document.getElementById('qi-photo-preview')?.dataset?.removed === 'true',
  };
}

function persistQuickInvoiceDraft() {
  try {
    localStorage.setItem(QUICK_INVOICE_DRAFT_STORAGE_KEY, JSON.stringify(captureQuickInvoiceDraft()));
  } catch (_) {}
}

function scheduleQuickInvoiceDraftSave() {
  clearTimeout(quickInvoiceDraftTimer);
  quickInvoiceDraftTimer = setTimeout(() => {
    quickInvoiceDraftTimer = null;
    persistQuickInvoiceDraft();
  }, QUICK_INVOICE_DRAFT_SAVE_DELAY_MS);
}

function clearQuickInvoiceDraft() {
  clearTimeout(quickInvoiceDraftTimer);
  quickInvoiceDraftTimer = null;
  localStorage.removeItem(QUICK_INVOICE_DRAFT_STORAGE_KEY);
}

function restoreQuickInvoiceDraft() {
  try {
    const raw = localStorage.getItem(QUICK_INVOICE_DRAFT_STORAGE_KEY);
    if (!raw) return false;
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== 'object') return false;
    document.getElementById('qi-cust-sel').value = draft.custId || '';
    document.getElementById('qi-cust-search').value = draft.custSearch || '';
    document.getElementById('qi-cust-name').value = draft.custName || '';
    document.getElementById('qi-phone').value = draft.phone || '';
    document.getElementById('qi-veh').value = draft.vehicle || '';
    document.getElementById('qi-vno').value = draft.vno || '';
    document.getElementById('qi-mech').value = draft.mechId || '';
    renderQuickInvoiceMechanicChips(draft.mechId || '');
    document.getElementById('qi-prob').value = draft.prob || '';
    document.getElementById('qi-total').value = draft.total || '';
    document.getElementById('qi-paid').value = draft.paid || '';
    document.getElementById('qi-discount').value = draft.discount || '';
    document.getElementById('qi-pay-method').value = draft.payMethod || getStoredPaymentMethod();
    renderQuickInvoicePaymentChips(draft.payMethod || getStoredPaymentMethod());
    document.getElementById('qi-invoice-no').value = draft.invoiceNo || suggestedNextInvoiceNo();
    document.getElementById('qi-invoice-date').value = draft.invoiceDate || today();
    document.getElementById('qi-notes').value = draft.notes || '';
    const prev = document.getElementById('qi-photo-preview');
    if (prev) {
      setPhotoPreviewList('qi-photo-preview', draft.photoRemoved ? [] : (draft.photos || draft.photo || []), 'Quick Invoice Photo Reference');
    }
    renderQuickInvoiceCustomerResults([], '');
    return true;
  } catch (_) {
    return false;
  }
}

function bindStickyQuickInvoiceDrafts() {
  if (window._quickInvoiceDraftBindingsReady) return;
  const ids = ['qi-cust-sel','qi-cust-search','qi-cust-name','qi-phone','qi-veh','qi-vno','qi-mech','qi-prob','qi-total','qi-paid','qi-discount','qi-pay-method','qi-invoice-no','qi-invoice-date','qi-notes'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => scheduleQuickInvoiceDraftSave());
    el.addEventListener('change', () => persistQuickInvoiceDraft());
  });
  window._quickInvoiceDraftBindingsReady = true;
}

function resetQuickInvoiceForm(options = {}) {
  const { focusCustomer = false, preserveMethod = true } = options;
  ['qi-cust-sel','qi-cust-search','qi-cust-name','qi-phone','qi-veh','qi-vno','qi-mech','qi-prob','qi-total','qi-paid','qi-discount','qi-invoice-no','qi-invoice-date','qi-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const methodEl = document.getElementById('qi-pay-method');
  if (methodEl) methodEl.value = preserveMethod ? getStoredPaymentMethod() : 'cash';
  renderQuickInvoicePaymentChips(methodEl?.value || 'cash');
  const invoiceDateEl = document.getElementById('qi-invoice-date');
  if (invoiceDateEl) invoiceDateEl.value = today();
  const invoiceNoEl = document.getElementById('qi-invoice-no');
  if (invoiceNoEl) invoiceNoEl.value = suggestedNextInvoiceNo();
  const mechEl = document.getElementById('qi-mech');
  if (mechEl) mechEl.value = '';
  renderQuickInvoiceMechanicChips('');
  const prev = document.getElementById('qi-photo-preview');
  if (prev) {
    setPhotoPreviewList('qi-photo-preview', [], 'Quick Invoice Photo Reference');
  }
  renderQuickInvoiceCustomerResults([], '');
  if (focusCustomer) document.getElementById('qi-cust-search')?.focus();
}

function openQuickInvoice(options = {}) {
  const { skipDraftRestore = false, startFresh = false, focusCustomer = false } = options;
  bindStickyQuickInvoiceDrafts();
  refreshQuickInvoiceCustomerSuggestions();
  if (startFresh) {
    clearQuickInvoiceDraft();
    resetQuickInvoiceForm({ focusCustomer: false, preserveMethod: true });
  } else if (!skipDraftRestore && restoreQuickInvoiceDraft()) {
    toast('Restored your quick invoice draft', 2200);
  } else {
    resetQuickInvoiceForm({ focusCustomer: false, preserveMethod: true });
  }
  openM('m-quick-invoice');
  runAfterFastEntryPaint(() => {
    renderQuickInvoiceMechanicChips(document.getElementById('qi-mech')?.value || '');
    renderQuickInvoicePaymentChips(document.getElementById('qi-pay-method')?.value || getStoredPaymentMethod());
    renderRecentCustomerChips('qi-recent-customers', 'selectQuickInvoiceCustomer');
    renderRecentBikeChips('qi-recent-bikes', 'qi-veh');
    renderServiceShortcutChips();
    customerSuggestionIndex();
    suggestVehicleName(document.getElementById('qi-veh')?.value || '');
    if (focusCustomer) document.getElementById('qi-cust-search')?.focus();
  });
}

function scheduleInvoiceSaveUiRefresh(options = {}) {
  const pages = ['jobs', 'invoices', 'customers', 'reminders', 'reports', 'home'];
  if (typeof markAppTabsStale === 'function') markAppTabsStale(pages);
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb) => setTimeout(cb, 0);
  raf(() => {
    const page = typeof currentPage !== 'undefined' ? currentPage : '';
    if (page === 'jobs' && typeof renderJobs === 'function') renderJobs();
    else if (page === 'invoices' && typeof renderInvoices === 'function') renderInvoices();
    else if (page === 'home' && typeof renderCurrentPage === 'function') renderCurrentPage({ forceRender: true });
    else {
      if (typeof updateStats === 'function') updateStats();
      if (typeof updateDuesBadge === 'function') updateDuesBadge();
    }
    if (options.renderInvoiceId && typeof _currentInvoiceJobId !== 'undefined' && _currentInvoiceJobId === options.renderInvoiceId && typeof openInvoice === 'function') {
      openInvoice(options.renderInvoiceId);
    }
  });
}

function runAfterInvoiceSavePaint(callback) {
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb) => setTimeout(cb, 0);
  raf(() => setTimeout(callback, 0));
}

function saveInvoiceAfterPaint(domain = 'invoice', refreshOptions = {}) {
  const pages = ['jobs', 'invoices', 'customers', 'reminders', 'reports', 'home'];
  if (typeof markAppTabsStale === 'function') markAppTabsStale(pages);
  runAfterInvoiceSavePaint(() => {
    if (typeof saveAll === 'function') saveAll({ domain });
    scheduleInvoiceSaveUiRefresh(refreshOptions);
  });
}

function saveQuickInvoice(nextAction = 'close') {
  if (!requireCloudWriteAccess(nextAction === 'job-card' ? 'create jobs from quick invoice' : 'create quick invoices')) return;
  if (window._photoUploadBusy) { toast('Please wait for photo upload to finish'); return; }
  const custId = document.getElementById('qi-cust-sel').value;
  const custName = document.getElementById('qi-cust-name').value.trim();
  const phone = document.getElementById('qi-phone').value.trim();
  const vehicle = document.getElementById('qi-veh').value.trim();
  const vno = document.getElementById('qi-vno').value.trim().toUpperCase();
  const mechId = document.getElementById('qi-mech').value;
  const mechIds = parseMechanicIds(mechId);
  const mech = mechanics.find(m => m.id === mechIds[0]);
  const mechName = mechanicLabel(mechIds);
  const prob = document.getElementById('qi-prob').value.trim();
  const total = parseFloat(document.getElementById('qi-total').value) || 0;
  const discount = parseFloat(document.getElementById('qi-discount').value) || 0;
  const netTotal = Math.max(0, total - discount);
  const paidRaw = document.getElementById('qi-paid').value;
  const paid = paidRaw === '' ? 0 : (parseFloat(paidRaw) || 0);
  const payMethod = document.getElementById('qi-pay-method').value || getStoredPaymentMethod();
  const notes = document.getElementById('qi-notes').value.trim();
  const manualInvoiceNo = document.getElementById('qi-invoice-no').value.trim();
  const invoiceDate = document.getElementById('qi-invoice-date').value || today();
  const photos = previewPhotoList('qi-photo-preview');
  const photo = photos[0] || '';
  const saveAsJobCard = nextAction === 'job-card';

  if (!custName) { toast('Enter customer name'); return; }
  if (!prob) { toast('Enter work / service'); return; }
  if (total <= 0) { toast('Enter total amount'); return; }
  if (paid < 0) { toast('Enter valid paid amount'); return; }
  if (discount < 0) { toast('Enter valid discount'); return; }
  if (!requireNotFutureBusinessDate(invoiceDate, saveAsJobCard ? 'Job card date' : 'Invoice date')) return;
  const duplicateInvoice = !saveAsJobCard && manualInvoiceNo ? findDuplicateInvoiceNumber(manualInvoiceNo) : null;
  if (duplicateInvoice) {
    toast(`Invoice number already exists: ${duplicateInvoice.invoiceNo || duplicateInvoice.id}`);
    return;
  }

  let finalCustId = custId;
  if (!finalCustId) {
    const existing = phone ? customers.find(c => c.phone === phone) : customers.find(c => c.name.toLowerCase() === custName.toLowerCase());
    if (existing) {
      finalCustId = existing.id;
    } else {
      const newCustomer = normalizeCustomer({
        id: nextId('c'),
        name: custName,
        phone,
        email: '',
        address: '',
        vehicles: vehicle ? [vehicle] : [],
        lastVehicle: vehicle || '',
        notes: '',
        createdAt: today(),
      });
      customers.push(newCustomer);
      finalCustId = newCustomer.id;
    }
  }

  const customer = customers.find(c => c.id === finalCustId);
  if (customer) {
    customer.name = custName || customer.name;
    customer.phone = phone || customer.phone;
    if (vehicle) {
      customer.lastVehicle = vehicle;
      customer.vehicles = uniqStrings([vehicle].concat(customer.vehicles || []));
    }
  }

  const now = new Date();
  if (saveAsJobCard) {
    const newJob = normalizeJob({
      id: nextJobId(),
      date: invoiceDate,
      time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      createdAt: nowISO(),
      updatedAt: nowISO(),
      custId: finalCustId,
      cust: custName,
      phone,
      veh: vehicle || 'Walk-in Vehicle',
      vno,
      odo: '',
      prob,
      mechIds,
      mechId: mechIds[0] || '',
      mech: mechName,
      pri: 'normal',
      status: 'waiting',
      lab: total,
      prt: 0,
      payment: paid,
      payMethod: paid > 0 ? payMethod : '',
      payments: paid > 0 ? [{
        id: nextId('pay'),
        amount: paid,
        method: payMethod,
        notes: notes || 'Advance from quick job card',
        at: nowISO(),
        by: actorEmail(),
        source: 'quick-job-card',
      }] : [],
      partsUsed: [],
      notes,
      delivery: '',
      photos,
      photo,
      invoicePhoto: '',
      invoicePhotos: [],
      collectedBy: '',
      invoiceNo: manualInvoiceNo,
      discount,
    });
    jobs.unshift(newJob);
    markOptimisticInvoice(newJob.id);
    if (paid > 0) rememberPaymentMethod(payMethod);
    clearQuickInvoiceDraft();
    logAction('create', 'job', newJob.id, { customer: custName, quick: true, paid, source: 'quick-job-card' });
    closeM('m-quick-invoice');
    saveInvoiceAfterPaint('jobs');
    if (typeof showPage === 'function') showPage('jobs', { forceRender: true });
    toast(`Saved ${newJob.id} as job card`);
    return;
  }

  const invoiceNo = nextInvoiceNo(manualInvoiceNo);
  const invoiceStamp = invoiceDateTime(invoiceDate, now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
  const newJob = normalizeJob({
    id: nextJobId(),
    date: invoiceDate,
    time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    createdAt: nowISO(),
    updatedAt: nowISO(),
    custId: finalCustId,
    cust: custName,
    phone,
    veh: vehicle || 'Walk-in Vehicle',
    vno,
    odo: '',
    prob,
    mechIds,
    mechId: mechIds[0] || '',
    mech: mechIds.length ? mechName : 'Quick Invoice',
    pri: 'normal',
    status: 'done',
    lab: total,
    prt: 0,
    payment: paid,
    payMethod,
    payments: paid > 0 ? [{
      id: nextId('pay'),
      amount: paid,
      method: payMethod,
      notes: notes || 'Quick invoice payment',
      at: nowISO(),
      by: actorEmail(),
      source: 'quick-invoice',
    }] : [],
    partsUsed: [],
    notes,
    delivery: '',
    photos,
    photo,
    invoicePhotos: photos,
    invoicePhoto: photo,
    collectedBy: '',
    invoiceNo,
    doneAt: invoiceStamp,
    discount,
  });

  jobs.unshift(newJob);
  markOptimisticInvoice(newJob.id);
  rememberPaymentMethod(payMethod);
  clearQuickInvoiceDraft();
  logAction('create', 'invoice', newJob.id, { invoiceNo, customer: custName, quick: true, paid });
  saveInvoiceAfterPaint('invoice');

  if (nextAction === 'next') {
    resetQuickInvoiceForm({ focusCustomer: true, preserveMethod: true });
    persistQuickInvoiceDraft();
    toast(`Saved ${invoiceNo}. Ready for next invoice.`);
  } else {
    closeM('m-quick-invoice');
    toast(`Quick invoice saved: ${invoiceNo}`);
  }
}

function jobDateTimeValue(j) {
  if (j.createdAt) return new Date(j.createdAt).getTime() || 0;
  if (j.doneAt) return new Date(j.doneAt).getTime() || 0;
  const date = j.date || '1970-01-01';
  const rawTime = (j.time || '00:00').toString().trim().toUpperCase();
  let hours = 0;
  let mins = 0;
  const m = rawTime.match(/(\d{1,2}):(\d{2})(?:\s*([AP]M))?/i);
  if (m) {
    hours = parseInt(m[1], 10) || 0;
    mins = parseInt(m[2], 10) || 0;
    const mer = m[3];
    if (mer === 'PM' && hours < 12) hours += 12;
    if (mer === 'AM' && hours === 12) hours = 0;
  }
  return new Date(`${date}T${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`).getTime() || 0;
}

function jobCreatedLabel(j) {
  const stamp = j?.createdAt || (j?.date ? `${j.date}T${String(j.time || '00:00')}` : '');
  const parsed = stamp ? new Date(stamp) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) {
    const dateText = parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    const timeText = parsed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    return `${dateText} · ${timeText}`;
  }
  return [j?.date ? fmtDate(j.date) : '', j?.time || '']
    .filter(Boolean)
    .join(' · ') || '—';
}

function invoiceSortValue(j) {
  if (j.doneAt) return new Date(j.doneAt).getTime() || 0;
  return jobDateTimeValue(j);
}

function refreshCustomerSuggestions() {
  const dl = document.getElementById('jm-customer-suggestions');
  if (!dl) return;
  dl.innerHTML = '';
}

function renderJobCustomerSearchResults(list = [], query = '') {
  const box = document.getElementById('jm-cust-results');
  if (!box) return;
  const q = String(query || '').trim().toLowerCase();
  if (!q) {
    box.innerHTML = '';
    return;
  }
  if (!list.length) {
    box.innerHTML = '<div style="font-size:12px;color:var(--mut);padding:8px 0;">No matching customer found.</div>';
    return;
  }
  box.innerHTML = list.slice(0, 6).map(c => {
    const hint = customerSearchHint(c, query);
    return `<button type="button" class="btn btn-g btn-sm" style="margin:0 6px 6px 0;" onclick="selectJobCustomer('${c.id}')">
      ${c.name}${c.phone ? ` · ${c.phone}` : ''}${hint ? ` · ${hint}` : ''}
    </button>`;
  }).join('');
}

function filterJobCustomerSearch(value) {
  const query = String(value || '').trim();
  const hidden = document.getElementById('jm-cust-sel');
  if (hidden && (!query || query !== document.getElementById('jm-cust-name')?.value)) hidden.value = '';
  if (!query) {
    // Clearing should feel instant, no debounce.
    if (typeof flushDebouncePerf === 'function') flushDebouncePerf('jm-cust-search');
    renderJobCustomerSearchResults([], '');
    return;
  }
  if (!quickInvoiceSuggestionQueryReady(query)) {
    if (typeof flushDebouncePerf === 'function') flushDebouncePerf('jm-cust-search');
    renderJobCustomerSearchResults([], '');
    return;
  }
  const run = () => {
    const matches = matchingCustomers(query, { limit: QUICK_INVOICE_DATALIST_LIMIT });
    renderJobCustomerSearchResults(matches, query);
  };
  if (typeof debouncePerf === 'function') {
    debouncePerf('jm-cust-search', run, CUSTOMER_SUGGEST_DEBOUNCE_MS);
  } else {
    run();
  }
}

function clearJobCustomerSelection(focusName = false) {
  const prefills = prefillCustomerFromSearch(document.getElementById('jm-cust-search')?.value || '');
  const sel = document.getElementById('jm-cust-sel');
  const search = document.getElementById('jm-cust-search');
  const newRow = document.getElementById('jm-cust-new');
  if (sel) sel.value = '';
  if (search) search.value = '';
  renderJobCustomerSearchResults([], '');
  if (newRow) newRow.style.display = 'grid';
  if (focusName) {
    document.getElementById('jm-cust-name').value = prefills.name || '';
    document.getElementById('jm-phone').value = prefills.phone || '';
  }
  if (focusName) {
    const nameEl = document.getElementById('jm-cust-name');
    if (nameEl) {
      nameEl.focus();
      nameEl.select?.();
    }
  }
}

function selectJobCustomer(id) {
  const c = customers.find(x => x.id === id);
  if (!c) return;
  const sel = document.getElementById('jm-cust-sel');
  const search = document.getElementById('jm-cust-search');
  const newRow = document.getElementById('jm-cust-new');
  if (sel) sel.value = c.id;
  if (search) search.value = c.phone ? `${c.name} · ${c.phone}` : c.name;
  if (newRow) newRow.style.display = 'none';
  document.getElementById('jm-cust-name').value = c.name;
  document.getElementById('jm-phone').value = c.phone || '';
  setVehicleValue(c.lastVehicle || (c.vehicles && c.vehicles[0]) || '');
  renderJobCustomerSearchResults([], '');
  renderRecentCustomerChips('jm-recent-customers', 'selectJobCustomer');
  renderRecentBikeChips('jm-recent-bikes', 'jm-veh');
  persistJobDraft();
}

function onCustomerNameInput(value) {
  const sel = document.getElementById('jm-cust-sel');
  const newRow = document.getElementById('jm-cust-new');
  if (sel) sel.value = '';
  if (newRow) newRow.style.display = 'grid';
}

function matchesJobSearch(job, query) {
  if (!query) return true;
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return String(job?._searchText || '').includes(q);
}

function selectedJobStatuses() {
  return [...jobStatusFilter];
}

function updateJobStatusFilterButton() {
  const btn = document.getElementById('job-status-filter-btn');
  const allBox = document.getElementById('job-status-all');
  if (!btn) return;
  const selected = selectedJobStatuses();
  if (!selected.length || selected.length === JOB_STATUS_OPTIONS.length) {
    btn.textContent = 'Status: All';
    if (allBox) allBox.checked = true;
  } else {
    btn.textContent = `Status: ${selected.map(s => SLbl[s]).join(', ')}`;
    if (allBox) allBox.checked = false;
  }
  document.querySelectorAll('.job-status-option').forEach(input => {
    input.checked = jobStatusFilter.has(input.value);
  });
}

function toggleJobStatusFilterMenu() {
  const menu = document.getElementById('job-status-filter-menu');
  if (!menu) return;
  const open = menu.style.display !== 'none';
  menu.style.display = open ? 'none' : 'block';
  if (!open) updateJobStatusFilterButton();
}

function toggleAllJobStatuses(checked) {
  jobStatusFilter = checked ? new Set(JOB_STATUS_OPTIONS) : new Set();
  if (typeof resetLongListPage === 'function') resetLongListPage('jobs');
  updateJobStatusFilterButton();
  renderJobs();
}

function toggleJobStatusOption(status, checked) {
  if (!JOB_STATUS_OPTIONS.includes(status)) return;
  if (checked) jobStatusFilter.add(status);
  else jobStatusFilter.delete(status);
  if (typeof resetLongListPage === 'function') resetLongListPage('jobs');
  updateJobStatusFilterButton();
  renderJobs();
}

function renderJobs() {
  const stateJobs = window.appState?.jobs || jobs;
  let list = stateJobs.filter(isActiveWorkshopJob);
  if (jobMechFilter)   list = list.filter(j => jobMechanicIds(j).includes(jobMechFilter));
  if (jobStatusFilter.size && jobStatusFilter.size !== JOB_STATUS_OPTIONS.length) {
    list = list.filter(j => jobStatusFilter.has(j.status));
  }
  if (jobSearchFilter) list = list.filter(j => matchesJobSearch(j, jobSearchFilter));
  const pageInfo = typeof paginatedLongList === 'function'
    ? paginatedLongList('jobs', list)
    : { items: list, total: list.length, page: 1, pages: 1, pageSize: list.length || 1, start: 0, end: list.length };
  const visibleJobs = pageInfo.items;

  // Repopulate mechanic filter dropdown
  const mf = document.getElementById('job-mech-filter');
  if (mf) {
    const cur = mf.value;
    mf.innerHTML = '<option value="">All mechanics</option>' +
      mechanics.map(m => `<option value="${m.id}"${m.id === cur ? ' selected' : ''}>${m.name}</option>`).join('');
    mf.value = cur;
  }
  const searchInput = document.getElementById('job-search');
  if (searchInput && searchInput.value !== jobSearchFilter) searchInput.value = jobSearchFilter;
  updateJobStatusFilterButton();

  const grid = document.getElementById('jgrid');
  if (!grid) return;

  if (!list.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:48px 20px;color:var(--mut);">No active jobs. Press <b style=\'color:var(--acc)\'>+ New Job</b> to add one.</div>';
  } else {
    const pager = typeof longListPagerHtml === 'function' ? longListPagerHtml('jobs', pageInfo, 'jobs') : '';
    grid.innerHTML = visibleJobs.map(j => jobCard(j)).join('') + pager;
  }
  updateStats();
}

function jobCard(j) {
  const total    = jobTotal(j);
  const paid     = jobPaid(j);
  const due      = jobDue(j);
  const advance  = jobAdvance(j);
  const mechIds   = jobMechanicIds(j);
  const mech     = mechanics.find(m => m.id === mechIds[0]);
  const clr      = mech ? mech.color : '#8a8f9e';
  const createdLabel = jobCreatedLabel(j);
  const cardPhoto = jobPhotoList(j, 'invoice')[0] || jobPhotoList(j, 'job')[0] || '';
  const hasPhoto = cardPhoto ? `<div style="width:44px;height:44px;border-radius:8px;overflow:hidden;flex-shrink:0;"><img src="${cardPhoto}" style="width:100%;height:100%;object-fit:cover;"></div>` : '';
  const customerLabel = j.cust || j.customerName || j.customer || 'Customer';
  const vehicleLabel = j.veh || j.vehicle || j.bike || j.bikeName || 'Vehicle';
  const workLabel = j.prob || j.problem || j.workDescription || 'Work';
  const status = JOB_STATUS_OPTIONS.includes(j.status) ? j.status : 'waiting';
  const statusSelect = `
    <select class="fsel" style="width:145px;font-size:11px;padding:6px 8px;" onchange="setJobStatus('${j.id}', this.value)">
      ${JOB_STATUS_OPTIONS.map(st => `<option value="${st}"${st===status?' selected':''}>${SLbl[st]}</option>`).join('')}
    </select>`;

  return `
  <div class="jcard ${j.pri || 'normal'}">
    <div class="jtop">
      <span class="jnum">${j.id} · ${createdLabel}</span>
      <span class="jnum" style="color:var(--acc2)">${j.vno || '—'}</span>
    </div>
    <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
      ${hasPhoto}
      <div style="flex:1;min-width:0;">
        <div class="jcust">${customerLabel}</div>
        <div class="jveh">${vehicleLabel}</div>
      </div>
    </div>
    <div class="jprob">${workLabel}</div>
    ${FAST_ENTRY_UI.dashboardRemarks && j.notes ? `<div style="font-size:11px;color:var(--mut);margin:6px 0 2px;">Note: ${j.notes}</div>` : ''}
    ${j.delivery ? `<div style="font-size:11px;color:var(--mut);margin-bottom:4px;">📅 Delivery: ${fmtDate(j.delivery)}</div>` : ''}
    <div class="jftr">
      <span class="mtag" style="border-color:${clr};color:${clr}">${mechanicLabel(mechIds, j.mech || '')}</span>
      <span class="sbadge ${SCls[status] || ''}">${SLbl[status]}</span>
    </div>
    <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      ${statusSelect}
      <button class="btn btn-g btn-sm" onclick="openEditJob('${j.id}')">Edit</button>
      <button class="btn btn-p btn-sm" onclick="openJobPartsDrawer('${j.id}')">Parts</button>
    </div>
    ${due > 0 ? `<div style="margin-top:6px;"><span class="due-badge">Owe ${fmtMoney(due)}</span></div>` : advance > 0 ? `<div style="margin-top:6px;"><span class="due-badge" style="background:rgba(0,200,150,.12);color:#00c896;border-color:rgba(0,200,150,.3);">Advance ${fmtMoney(advance)}</span></div>` : `<div style="margin-top:6px;"><span class="due-badge" style="background:rgba(138,143,158,.12);color:var(--mut);border-color:rgba(138,143,158,.28);">Clear</span></div>`}
    <div class="jacts">
      <button class="btn btn-g btn-sm"  onclick="viewJob('${j.id}')">Details</button>
      <button class="btn btn-g btn-sm"  onclick="markDone('${j.id}')">Invoice</button>
      <button class="btn btn-p btn-sm"  onclick="markDone('${j.id}')">Done ✓</button>
      <button class="btn btn-r btn-sm"  onclick="removeJob('${j.id}')">✕</button>
    </div>
  </div>`;
}

function updateStats() {
  const liveJobs = (window.appState?.jobs || jobs).filter(isLiveJob);
  const active    = liveJobs.filter(isActiveWorkshopJob);
  const inProg    = active.filter(j => j.status === 'in-progress');
  const ready     = active.filter(j => j.status === 'ready');
  const todayDone = liveJobs.filter(j => j.status === 'done' && j.date === today());
  const todayInvoices = liveJobs.filter(j => j.status === 'done' && ((j.doneAt || '').slice(0, 10) || j.date || '') === today());
  const rev       = allRevenueEntries()
    .filter(entry => entry.date === today())
    .reduce((a, entry) => a + (entry.amount || 0), 0);
  document.getElementById('st-tot').textContent = active.length;
  document.getElementById('st-prg').textContent = inProg.length;
  document.getElementById('st-rdy').textContent = ready.length;
  document.getElementById('st-rev').textContent = fmtMoney(rev);
  // Update done count badge
  const dc = document.getElementById('done-count');
  if (dc) dc.textContent = `(${todayDone.length})`;
  const todayInvoiceEl = document.getElementById('jobs-today-invoice-count');
  if (todayInvoiceEl) todayInvoiceEl.textContent = String(todayInvoices.length);
  // Update dues badge
  if (typeof updateDuesBadge === 'function') updateDuesBadge();
}

function todayRevenueBreakdownData() {
  const day = today();
  const incomeEntriesToday = allRevenueEntries()
    .filter(entry => entry.date === day)
    .sort((a, b) => new Date(b.timestamp || b.date).getTime() - new Date(a.timestamp || a.date).getTime());
  const expenseEntriesToday = expenses
    .map(normalizeExpense)
    .filter(entry => entry.date === day)
    .sort((a, b) => new Date(b.timestamp || b.date).getTime() - new Date(a.timestamp || a.date).getTime());
  const incomeTotal = incomeEntriesToday.reduce((sum, entry) => sum + (entry.amount || 0), 0);
  const expenseTotal = expenseEntriesToday.reduce((sum, entry) => sum + (entry.amount || 0), 0);
  const invoiceTotal = incomeEntriesToday
    .filter(entry => entry.source === 'job')
    .reduce((sum, entry) => sum + (entry.amount || 0), 0);
  const manualIncomeTotal = incomeEntriesToday
    .filter(entry => entry.source === 'income')
    .reduce((sum, entry) => sum + (entry.amount || 0), 0);
  return {
    day,
    incomeEntriesToday,
    expenseEntriesToday,
    incomeTotal,
    expenseTotal,
    invoiceTotal,
    manualIncomeTotal,
    netTotal: incomeTotal - expenseTotal,
  };
}

function openTodayRevenueBreakdown(options = {}) {
  const { backTo = null, skipHistory = false } = options;
  if (!requireAdminAccess('view today revenue breakdown')) return;
  if (!skipHistory && typeof backTo === 'function') pushModalHistory('m-detail', backTo);
  const {
    day,
    incomeEntriesToday,
    expenseEntriesToday,
    incomeTotal,
    expenseTotal,
    invoiceTotal,
    manualIncomeTotal,
    netTotal,
  } = todayRevenueBreakdownData();

  const incomeRows = incomeEntriesToday.map(entry => {
    const typeLabel = entry.source === 'job'
      ? (entry.kind === 'advance' ? 'Advance' : 'Invoice Payment')
      : incomeTypeLabel(entry.kind);
    const meta = [
      entry.method ? entry.method.toUpperCase() : '',
      entry.invoiceNo ? `Invoice ${entry.invoiceNo}` : '',
      entry.mechName ? `Mechanic ${entry.mechName}` : '',
      entry.customer || '',
      entry.phone || '',
    ].filter(Boolean).join(' · ');
    const note = entry.note || 'Saved income entry';
    const action = entry.source === 'job'
      ? `<button class="btn btn-g btn-sm" onclick="viewJobFromTodayRevenue('${entry.sourceId}')">Open Job</button>`
      : '';
    return `
      <div style="background:var(--sur2);border:1px solid var(--bor);border-radius:10px;padding:12px;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div style="min-width:0;">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <span class="sst ok" style="background:rgba(0,200,150,.08);color:var(--acc);">${typeLabel}</span>
              <span style="font-size:12px;color:var(--mut);">${fmtDateTime(entry.timestamp || `${entry.date}T00:00:00`)}</span>
            </div>
            <div style="margin-top:6px;font-weight:600;">${note}</div>
            <div style="margin-top:4px;font-size:12px;color:var(--mut);">${meta || 'Confirmed saved entry'}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-family:var(--fh);font-size:18px;font-weight:700;color:var(--acc);">${fmtMoney(entry.amount || 0)}</div>
            ${action}
          </div>
        </div>
      </div>`;
  }).join('') || '<div style="color:var(--mut);font-size:13px;">No confirmed income entries for today.</div>';

  const expenseRows = expenseEntriesToday.map(entry => {
    const receipts = normalizePhotoArray(entry.receipts || entry.receipt || '');
    const receiptPreview = receipts.length
      ? `<div style="margin-top:8px;">${photoThumbWithCount(receipts, 'Expense Photo Reference')}</div>`
      : '';
    const meta = [
      entry.cat || '',
      entry.paidTo || '',
      fmtDateTime(entry.timestamp || `${entry.date}T00:00:00`),
    ].filter(Boolean).join(' · ');
    return `
      <div style="background:var(--sur2);border:1px solid var(--bor);border-radius:10px;padding:12px;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div style="min-width:0;">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <span class="sst ok" style="background:rgba(231,76,60,.10);color:var(--dan);">${entry.cat || 'Expense'}</span>
              <span style="font-size:12px;color:var(--mut);">${meta}</span>
            </div>
            <div style="margin-top:6px;font-weight:600;">${entry.desc || 'Saved expense entry'}</div>
            ${receiptPreview}
          </div>
          <div style="text-align:right;flex-shrink:0;font-family:var(--fh);font-size:18px;font-weight:700;color:var(--dan);">${fmtMoney(entry.amount || 0)}</div>
        </div>
      </div>`;
  }).join('') || '<div style="color:var(--mut);font-size:13px;">No confirmed expense entries for today.</div>';

  document.getElementById('detail-body').innerHTML = `
    <div class="modal-ttl">Today Revenue Breakdown</div>
    <div style="font-size:12px;color:var(--mut);margin-top:-2px;margin-bottom:12px;">${fmtDate(day)} · Only saved payments, manual income, and expenses dated today are shown here for confirmation.</div>

    <div class="f2" style="margin-bottom:14px;">
      <div class="sc"><div class="sc-lbl">Total Income</div><div class="sc-val g" style="font-size:18px;">${fmtMoney(incomeTotal)}</div></div>
      <div class="sc"><div class="sc-lbl">Total Expense</div><div class="sc-val" style="font-size:18px;color:var(--dan);">${fmtMoney(expenseTotal)}</div></div>
      <div class="sc"><div class="sc-lbl">Net</div><div class="sc-val" style="font-size:18px;color:${netTotal >= 0 ? 'var(--acc)' : 'var(--dan)'};">${fmtMoney(netTotal)}</div></div>
      <div class="sc"><div class="sc-lbl">Invoice + Advance</div><div class="sc-val o" style="font-size:18px;">${fmtMoney(invoiceTotal)}</div></div>
      <div class="sc"><div class="sc-lbl">Manual Income</div><div class="sc-val y" style="font-size:18px;">${fmtMoney(manualIncomeTotal)}</div></div>
      <div class="sc"><div class="sc-lbl">Confirmed Entries</div><div class="sc-val" style="font-size:18px;">${incomeEntriesToday.length + expenseEntriesToday.length}</div></div>
    </div>

    <div style="display:grid;gap:14px;">
      <div>
        <div style="font-family:var(--fh);font-size:16px;font-weight:700;margin-bottom:8px;">Income Entries</div>
        <div style="display:grid;gap:10px;">${incomeRows}</div>
      </div>
      <div>
        <div style="font-family:var(--fh);font-size:16px;font-weight:700;margin-bottom:8px;">Expense Entries</div>
        <div style="display:grid;gap:10px;">${expenseRows}</div>
      </div>
    </div>`;
  openM('m-detail');
}

function viewJobFromTodayRevenue(id) {
  viewJob(id, { backTo: () => openTodayRevenueBreakdown({ skipHistory: true }) });
}

function openInvoiceFromJobDetail(id) {
  openInvoice(id, { backTo: () => viewJob(id, { skipHistory: true }) });
}

function filterJobs(mf, sf, q) {
  if (mf !== undefined) jobMechFilter   = mf || '';
  if (sf !== undefined) jobStatusFilter = sf ? new Set([sf]) : new Set(JOB_STATUS_OPTIONS);
  if (q !== undefined) jobSearchFilter = q || '';
  if (typeof resetLongListPage === 'function') resetLongListPage('jobs');
  // Debounce only when driven by keystrokes (q provided);
  // dropdown/button callers expect an immediate re-render.
  if (q !== undefined && typeof debouncePerf === 'function') {
    debouncePerf('jobs-search', renderJobs, 150);
  } else {
    renderJobs();
  }
}

function cycleStatus(id) {
  if (!requireCloudWriteAccess('change job status')) return;
  const j = jobs.find(x => x.id === id);
  if (!j) return;
  j.status = JOB_STATUS_OPTIONS[(JOB_STATUS_OPTIONS.indexOf(j.status) + 1) % JOB_STATUS_OPTIONS.length];
  logAction('update', 'job', j.id, { status: j.status });
  saveAll({ domain: 'jobs' }); renderJobs(); toast('Status → ' + SLbl[j.status]);
}

function setJobStatus(id, status) {
  if (!requireCloudWriteAccess('change job status')) return;
  const j = jobs.find(x => x.id === id);
  if (!j || !JOB_STATUS_OPTIONS.includes(status)) return;
  j.status = status;
  j.updatedAt = nowISO();
  logAction('update', 'job', j.id, { status: j.status });
  saveAll({ domain: 'jobs' });
  renderJobs();
  toast('Status → ' + SLbl[j.status]);
}

function removeJob(id) {
  if (!requireCloudWriteAccess('delete jobs')) return;
  if (!confirm('Remove this job card?')) return;
  const j = jobs.find(x => x.id === id);
  if (!j) return;
  j.deletedAt = nowISO();
  j.updatedAt = j.deletedAt;
  logAction('delete', 'job', id);
  saveAll({ domain: 'jobs' }); renderJobs(); toast('Job removed');
}

function viewJob(id, options = {}) {
  const { backTo = null, skipHistory = false } = options;
  const j = jobs.find(x => x.id === id && isLiveJob(x));
  if (!j) return;
  if (!skipHistory && typeof backTo === 'function') pushModalHistory('m-detail', backTo);
  const total = jobTotal(j);
  const paid  = jobPaid(j);
  const due   = jobDue(j);
  const advance = jobAdvance(j);

  document.getElementById('detail-body').innerHTML = `
    <div class="modal-ttl">${j.id} — ${j.cust}</div>
    ${jobPhotoList(j, 'invoice').length || jobPhotoList(j, 'job').length ? `<div style="margin-bottom:12px;">${jobPhotoGalleryMarkup(jobPhotoList(j, 'invoice').length ? j : j, jobPhotoList(j, 'invoice').length ? 'invoice' : 'job', 'Job Photo Reference')}</div>` : ''}
    <div class="f2" style="margin-bottom:12px;font-size:13px;">
      <div><div class="flbl">Vehicle</div><div>${j.veh}</div></div>
      <div><div class="flbl">Reg. No.</div><div>${j.vno||'—'}</div></div>
      <div><div class="flbl">Phone</div><div><a href="tel:${j.phone}" style="color:var(--acc)">${j.phone}</a></div></div>
      <div><div class="flbl">Mechanic</div><div>${mechanicLabel(jobMechanicIds(j), j.mech || '')}</div></div>
      <div><div class="flbl">Status</div><div><span class="sbadge ${SCls[j.status]}">${SLbl[j.status]}</span></div></div>
      <div><div class="flbl">Date / Time</div><div>${fmtDate(j.date)} ${j.time}</div></div>
      ${j.odo ? `<div><div class="flbl">Odometer</div><div>${parseInt(j.odo).toLocaleString('en-IN')} km</div></div>` : ''}
      ${j.delivery ? `<div><div class="flbl">Expected Delivery</div><div>${fmtDate(j.delivery)}</div></div>` : ''}
    </div>
    <div class="frow"><div class="flbl">Problem / Work</div>
      <div style="font-size:13px;background:var(--sur2);padding:10px 12px;border-radius:6px;">${j.prob}</div>
    </div>
    ${j.notes ? `<div class="frow"><div class="flbl">Notes</div><div style="font-size:12px;color:var(--mut);">${j.notes}</div></div>` : ''}
    ${j.partsUsed && j.partsUsed.length ? `
    <div class="frow"><div class="flbl">Parts Used</div>
      <div>${j.partsUsed.map(p=>`<div style="font-size:12px;padding:3px 0;">${p.displayName || p.name} × ${p.qty} — ${fmtMoney(p.cost*p.qty)}</div>`).join('')}</div>
    </div>` : ''}
    <div style="background:var(--sur2);border-radius:8px;padding:14px;margin:12px 0;">
      <div class="det-row"><span style="color:var(--mut)">Labour</span><span>${fmtMoney(j.lab)}</span></div>
      <div class="det-row"><span style="color:var(--mut)">Parts</span><span>${fmtMoney(j.prt)}</span></div>
      ${jobDiscountAmount(j) > 0 ? `<div class="det-row"><span style="color:var(--mut)">Discount</span><span style="color:var(--dan)">- ${fmtMoney(jobDiscountAmount(j))}</span></div>` : ''}
      <div class="det-row" style="font-family:var(--fh);font-size:18px;font-weight:700;">
        <span>Total</span><span style="color:var(--acc)">${fmtMoney(jobTotal(j))}</span>
      </div>
      ${paid > 0 ? `<div class="det-row"><span style="color:var(--acc)">Paid (${j.payMethod||'—'})</span><span style="color:var(--acc)">${fmtMoney(paid)}</span></div>` : ''}
      ${due > 0  ? `<div class="det-row"><span style="color:var(--dan);font-weight:700">Owe</span><span style="color:var(--dan);font-weight:700">${fmtMoney(jobDue(j))}</span></div>` : advance > 0 ? `<div class="det-row"><span style="color:#00c896;font-weight:700">Advance</span><span style="color:#00c896;font-weight:700">${fmtMoney(advance)}</span></div>` : `<div class="det-row"><span style="color:var(--mut);font-weight:700">Status</span><span style="color:var(--mut);font-weight:700">Clear</span></div>`}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-p btn-sm"  onclick="openInvoiceFromJobDetail('${j.id}')">🖨 Invoice</button>
      <button class="btn btn-g btn-sm"  onclick="sendBill('${j.id}')">📱 WhatsApp</button>
      <button class="btn btn-g btn-sm"  onclick="cycleStatus('${j.id}');closeM('m-detail')">Status ↺</button>
      <button class="btn btn-g btn-sm"  onclick="openEditJob('${j.id}')">Edit</button>
      <button class="btn btn-p btn-sm"  onclick="closeM('m-detail');openJobPartsDrawer('${j.id}')">Add Parts</button>
      ${due > 0 ? `<button class="btn btn-p btn-sm" onclick="openPaymentModal('${j.id}');closeM('m-detail')">💰 Collect</button>` : ''}
    </div>`;
  openM('m-detail');
}

function sendBill(id) {
  const j   = jobs.find(x => x.id === id);
  if (!j) return;
  const tot = jobTotal(j);
  const due = jobDue(j);
  const advance = jobAdvance(j);
  const discount = jobDiscountAmount(j);
  const msg = `Namaskar ${j.cust} ji 🙏\n\nAapki ${j.veh} (${j.vno||''}) ki service complete ho gayi!\n\nKaam: ${j.prob}\nLabour: ${fmtMoney(j.lab||0)}\nParts: ${fmtMoney(j.prt||0)}${discount > 0 ? `\nDiscount: -${fmtMoney(discount)}` : ''}\n─────────────\nKul: ${fmtMoney(tot)}${due > 0 ? `\nBaaki: ${fmtMoney(due)}` : advance > 0 ? `\nAdvance Balance: ${fmtMoney(advance)}` : '\nPaid: Full ✓'}\n\n${getGarageProfile().shortName}, ${getGarageProfile().city}\nThank you! 🙏`;
  if (!j.phone) { toast('Customer phone not available'); return; }
  window.open('https://wa.me/91' + j.phone + '?text=' + encodeURIComponent(msg));
  closeM('m-detail');
}

// ─── New / Edit Job ────────────────────────────────────────
let editJobId = null;
let activeJobPartsId = null;
let activeJobPartStockId = null;
let activeJobPartUseAs = '';
const JOB_PART_MANUAL_PRICE_INPUT_ID = 'job-part-manual-price';

function updateJobModalActions() {
  const invoiceBtn = document.getElementById('save-job-invoice-btn');
  if (invoiceBtn) invoiceBtn.style.display = editJobId ? 'none' : '';
}

function partDisplayName(baseName, useAs = '') {
  return useAs ? `${baseName} - ${useAs}` : baseName;
}

function setJobPartUseAs(value) {
  activeJobPartUseAs = String(value || '').trim();
  if (activeJobPartStockId) renderJobPartFound(stock.find(x => x.id === activeJobPartStockId));
}

function customJobPartUseAs() {
  const value = prompt('Use as', activeJobPartUseAs || '');
  if (value === null) return;
  setJobPartUseAs(value.trim());
}

function stockSellPriceValue(stockItem) {
  if (!stockItem) return 0;
  return parseFloat(stockItem.sellPrice || stockItem.lastSellPrice || stockItem.cost || 0) || 0;
}

function setStockSellPrice(stockId, newPrice) {
  const item = stock.find(x => x.id === stockId);
  const nextPrice = parseFloat(newPrice);
  if (!item || !(nextPrice > 0)) return null;
  const prevSell = stockSellPriceValue(item);
  if (prevSell && prevSell !== nextPrice) item.previousSellPrice = prevSell;
  item.sellPrice = nextPrice;
  item.lastSellPrice = nextPrice;
  return item;
}

function selectedJobPartPrice(stockId, inputId = JOB_PART_MANUAL_PRICE_INPUT_ID) {
  const item = stock.find(x => x.id === stockId);
  if (!item) return 0;
  const manualInput = document.getElementById(inputId);
  const manualPrice = parseFloat(String(manualInput?.value || '').trim());
  if (manualPrice > 0) return manualPrice;
  return stockSellPriceValue(item);
}

function afterJobPartAdded(stockId, inputId = JOB_PART_MANUAL_PRICE_INPUT_ID) {
  const manualInput = document.getElementById(inputId);
  if (manualInput) manualInput.value = '';
  renderJobPartFound(stock.find(x => x.id === stockId));
  renderJobPartsCurrent(activeJobPartsId);
}

function promptJobPartQuantity(stockId, inputId = JOB_PART_MANUAL_PRICE_INPUT_ID) {
  const q = prompt('Add quantity', '1');
  if (!q) return;
  const price = selectedJobPartPrice(stockId, inputId);
  if (addPartToJob(activeJobPartsId, stockId, q, activeJobPartUseAs, price)) afterJobPartAdded(stockId, inputId);
}

function openNewJob(options = {}) {
  const { skipDraftRestore = false, startFresh = false, focusCustomer = false } = options;
  editJobId = null;
  document.getElementById('job-modal-title').textContent = 'New Job Card';
  const advLabel = document.getElementById('jm-advance-label');
  if (advLabel) advLabel.textContent = 'Advance Paid ₹';
  updateJobModalActions();
  bindStickyJobDrafts();
  if (startFresh) clearJobDraft(`${JOB_DRAFT_STORAGE_KEY}:new`);
  document.getElementById('jm-mech').value = '';
  renderJobMechanicChips('');
  setVehicleValue('');
  ['jm-cust-name','jm-phone','jm-vno','jm-odo','jm-prob','jm-lab','jm-prt','jm-advance','jm-discount','jm-notes','jm-cust-search'].forEach(i => {
    const el = document.getElementById(i);
    if (el) el.value = '';
  });
  document.getElementById('jm-invoice-no').value = suggestedNextInvoiceNo();
  document.getElementById('jm-cust-sel').value     = '';
  document.getElementById('jm-pri').value      = 'normal';
  document.getElementById('jm-status').value   = 'waiting';
  document.getElementById('jm-delivery').value = '';
  document.getElementById('jm-cust-new').style.display = 'grid';
  renderJobCustomerSearchResults([], '');
  const prev = document.getElementById('jm-photo-preview');
  if (prev) {
    setPhotoPreviewList('jm-photo-preview', [], 'Vehicle Photo Reference');
  }
  window._photoUploadBusy = false;
  const donePrev = document.getElementById('done-photo-preview');
  if (donePrev) {
    setPhotoPreviewList('done-photo-preview', [], 'Invoice Photo Reference');
  }
  if (!skipDraftRestore && restoreJobDraft()) toast('Restored your last job draft', 2200);
  openM('m-job');
  runAfterFastEntryPaint(() => {
    refreshCustomerSuggestions();
    renderRecentCustomerChips('jm-recent-customers', 'selectJobCustomer');
    renderRecentBikeChips('jm-recent-bikes', 'jm-veh');
    renderServiceShortcutChips();
    customerSuggestionIndex();
    if (focusCustomer) document.getElementById('jm-cust-search')?.focus();
  });
}

function openEditJob(id) {
  const j = jobs.find(x => x.id === id);
  if (!j) return;
  editJobId = id;
  closeM('m-detail');
  document.getElementById('job-modal-title').textContent = 'Edit Job — ' + j.id;
  updateJobModalActions();
  refreshCustomerSuggestions();
  document.getElementById('jm-mech').value         = mechanicValueString(jobMechanicIds(j));
  renderJobMechanicChips(mechanicValueString(jobMechanicIds(j)));
  renderRecentCustomerChips('jm-recent-customers', 'selectJobCustomer');
  renderRecentBikeChips('jm-recent-bikes', 'jm-veh');
  document.getElementById('jm-cust-sel').value     = j.custId || '';
  document.getElementById('jm-cust-search').value  = j.phone ? `${j.cust} · ${j.phone}` : j.cust;
  document.getElementById('jm-cust-name').value    = j.cust;
  document.getElementById('jm-phone').value        = j.phone;
  document.getElementById('jm-vno').value          = j.vno || '';
  document.getElementById('jm-odo').value          = j.odo || '';
  document.getElementById('jm-prob').value         = j.prob;
  document.getElementById('jm-lab').value          = j.lab || 0;
  document.getElementById('jm-prt').value          = j.prt || 0;
  document.getElementById('jm-advance').value      = j.payment || 0;
  const advLabel = document.getElementById('jm-advance-label');
  if (advLabel) advLabel.textContent = j.status === 'done' ? 'Payment Received ₹' : 'Advance Paid ₹';
  document.getElementById('jm-invoice-no').value   = j.invoiceNo || '';
  document.getElementById('jm-discount').value     = jobDiscountAmount(j) || '';
  document.getElementById('jm-notes').value        = j.notes || '';
  document.getElementById('jm-pri').value          = j.pri;
  document.getElementById('jm-status').value       = j.status;
  document.getElementById('jm-delivery').value     = j.delivery || '';
  document.getElementById('jm-cust-new').style.display = j.custId ? 'none' : 'grid';
  renderJobCustomerSearchResults([], '');
  bindStickyJobDrafts();
  setVehicleValue(j.veh);
  const prev = document.getElementById('jm-photo-preview');
  if (prev) {
    setPhotoPreviewList('jm-photo-preview', j.photos || j.photo || [], 'Vehicle Photo Reference');
  }
  window._photoUploadBusy = false;
  const donePrev = document.getElementById('done-photo-preview');
  if (donePrev) {
    setPhotoPreviewList('done-photo-preview', j.invoicePhotos || j.invoicePhoto || [], 'Invoice Photo Reference');
  }
  restoreJobDraft();
  openM('m-job');
}

function saveJob(options = {}) {
  if (!requireCloudWriteAccess(editJobId ? 'update jobs' : 'create jobs')) return;
  if (window._photoUploadBusy) { toast('Please wait for photo upload to finish'); return; }
  const shouldCreateInvoice = !!options.createInvoiceAfterSave;
  const custId   = document.getElementById('jm-cust-sel').value;
  const custName = document.getElementById('jm-cust-name').value.trim();
  const phone    = document.getElementById('jm-phone').value.trim();
  const mechId   = document.getElementById('jm-mech').value;
  const mechIds  = parseMechanicIds(mechId);
  const vehicle  = document.getElementById('jm-veh').value.trim();
  const mech     = mechanics.find(m => m.id === mechIds[0]);
  const prob     = document.getElementById('jm-prob').value.trim();
  const manualInvoiceNo = document.getElementById('jm-invoice-no').value.trim();
  const discount = parseFloat(document.getElementById('jm-discount').value) || 0;
  const photos   = previewPhotoList('jm-photo-preview');
  const photo    = photos[0] || '';

  if (!custName) { toast('Enter customer name'); return; }
  if (!prob)     { toast('Describe the problem/work'); return; }
  if (discount < 0) { toast('Enter valid discount'); return; }
  const duplicateInvoice = manualInvoiceNo ? findDuplicateInvoiceNumber(manualInvoiceNo, editJobId || '') : null;
  if (duplicateInvoice) {
    toast(`Invoice number already exists: ${duplicateInvoice.invoiceNo || duplicateInvoice.id}`);
    return;
  }

  // Auto-create / match customer
  let finalCustId = custId;
  if (!custId) {
    // Only match by phone if phone was provided
    const existing = phone ? customers.find(c => c.phone === phone) : null;
    if (existing) {
      finalCustId = existing.id;
    } else if (custName) {
      const newC = normalizeCustomer({ id: nextId('c'), name: custName, phone, email: '', address: '', vehicles: vehicle ? [vehicle] : [], lastVehicle: vehicle || '', notes: '', createdAt: today() });
      customers.push(newC);
      finalCustId = newC.id;
    }
  }

  const customer = customers.find(c => c.id === finalCustId);
  if (customer) {
    customer.name = custName || customer.name;
    customer.phone = phone || customer.phone;
    if (vehicle) {
      customer.lastVehicle = vehicle;
      customer.vehicles = uniqStrings([vehicle].concat(customer.vehicles || []));
    }
  }

  const advance = parseFloat(document.getElementById('jm-advance').value) || 0;

  const jobData = {
    custId:    finalCustId,
    cust:      custName,
    phone,
    veh:       vehicle || 'Unknown',
    vno:       document.getElementById('jm-vno').value.trim().toUpperCase(),
    odo:       document.getElementById('jm-odo').value,
    prob,
    mechIds,
    mechId:    mechIds[0] || '',
    mech:      mechanicLabel(mechIds),
    pri:       document.getElementById('jm-pri').value,
    status:    document.getElementById('jm-status').value,
    lab:       parseFloat(document.getElementById('jm-lab').value) || 0,
    prt:       parseFloat(document.getElementById('jm-prt').value) || 0,
    notes:     document.getElementById('jm-notes').value.trim(),
    delivery:  document.getElementById('jm-delivery').value,
    photos,
    photo:     photo || '',
    invoiceNo: manualInvoiceNo,
    discount,
  };

  let savedJob = null;

  if (editJobId) {
    const j = jobs.find(x => x.id === editJobId);
    // Keep existing payment unless advance field was changed
    if (advance !== (j.payment||0)) j.payment = advance;
    Object.assign(j, jobData);
    j.discount = parseFloat(j.discount || 0) || 0;
    j.payments = Array.isArray(j.payments) ? j.payments : [];
    j.updatedAt = nowISO();
    logAction('update', 'job', j.id, { customer: j.cust, status: j.status });
    savedJob = j;
    toast('Job updated');
  } else {
    const now = new Date();
    const newJob = normalizeJob({
      id: nextJobId(),
      date: today(),
      time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      payment: shouldCreateInvoice ? 0 : advance,
      payMethod: !shouldCreateInvoice && advance > 0 ? 'advance' : '',
      partsUsed: [],
      collectedBy: '',
      createdAt: nowISO(),
      updatedAt: nowISO(),
      ...jobData
    });
    if (!shouldCreateInvoice && advance > 0) {
      newJob.payments.push({
        id: nextId('pay'),
        amount: advance,
        method: 'advance',
        notes: 'Advance at job create',
        at: nowISO(),
        by: actorEmail(),
        source: 'job-create',
      });
    }
    jobs.unshift(newJob);
    savedJob = newJob;
    logAction('create', 'job', newJob.id, { customer: newJob.cust, status: newJob.status });
    if (shouldCreateInvoice) toast('Job created. Opening invoice.');
    else if (advance > 0) toast(`Job created! Advance ${fmtMoney(advance)} recorded.`);
    else toast('Job created!');
  }

  clearJobDraft();
  closeM('m-job');
  saveAll({ domain: 'jobs' }); renderJobs();
  if (shouldCreateInvoice && savedJob && !editJobId && typeof markDone === 'function') {
    markDone(savedJob.id);
    if (advance > 0) {
      const paymentInput = document.getElementById('done-payment');
      if (paymentInput) paymentInput.value = String(advance);
      if (typeof refreshDoneBalanceSummary === 'function') refreshDoneBalanceSummary();
      if (typeof persistInvoiceDraft === 'function') persistInvoiceDraft();
    }
  }
  return savedJob;
}

function saveJobAndCreateInvoice() {
  return saveJob({ createInvoiceAfterSave: true });
}

function saveJobAndNext() {
  const saved = saveJob();
  if (!saved) return;
  openNewJob({ skipDraftRestore: true, startFresh: true, focusCustomer: true });
  toast('Job saved. Ready for next entry.');
}

function addPartToJob(jobId, stockId, qty, useAs = '', unitPrice = null) {
  if (!requireCloudWriteAccess('add parts to job')) return false;
  const j = jobs.find(x => x.id === jobId);
  const s = stock.find(x => x.id === stockId);
  const useQty = Math.max(1, parseInt(qty, 10) || 0);
  const useAsLabel = String(useAs || '').trim();
  const chosenPrice = parseFloat(unitPrice);
  if (!j || !s) return false;
  const finalSellPrice = chosenPrice > 0 ? chosenPrice : stockSellPriceValue(s);
  if (chosenPrice > 0) setStockSellPrice(stockId, chosenPrice);
  const stamp = nowISO();
  s.qty -= useQty;
  s.updatedAt = stamp;
  j.updatedAt = stamp;
  j.prt = (j.prt || 0) + finalSellPrice * useQty;
  j.partsUsed = Array.isArray(j.partsUsed) ? j.partsUsed : [];
  const existing = j.partsUsed.find(p =>
    p.id === stockId
    && String(p.useAs || '').trim() === useAsLabel
    && (parseFloat(p.cost || 0) || 0) === finalSellPrice
  );
  if (existing) existing.qty += useQty;
  else j.partsUsed.push({
    id: stockId,
    name: s.name,
    displayName: partDisplayName(s.name, useAsLabel),
    useAs: useAsLabel,
    sku: s.sku,
    qty: useQty,
    cost: finalSellPrice,
    buyPrice: s.cost || 0,
    manufacturer: s.manufacturer || s.companyBrand || '',
    supplierPartNo: s.supplierPartNo || '',
    supplier: s.sup || '',
  });
  for (let i = 0; i < useQty; i++) {
    partsLog.push({ part: s.name, sku: s.sku, time: new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }), date: today() });
  }
  logAction('update', 'job', j.id, { part: s.sku, qty: useQty, useAs: useAsLabel, unitPrice: finalSellPrice, source: 'job-parts' });
  saveAll({ domain: ['jobs', 'stock'] });
  renderJobs();
  renderStock?.();
  renderPrintManager?.();
  if (s.qty < 0) {
    setTimeout(() => toast(`⚠ NEGATIVE STOCK: ${s.name} is now ${s.qty}`), 800);
  } else if (s.qty <= s.min) {
    setTimeout(() => toast('⚠ LOW STOCK: ' + s.name), 800);
  }
  return true;
}

function renderJobPartsCurrent(jobId) {
  const box = document.getElementById('job-parts-current');
  const j = jobs.find(x => x.id === jobId);
  if (!box || !j) return;
  const list = Array.isArray(j.partsUsed) ? j.partsUsed : [];
  box.innerHTML = `
    <div class="quick-card">
      <div style="font-family:var(--fh);font-size:14px;font-weight:700;margin-bottom:8px;">Current Parts</div>
      ${list.length ? list.map(p => `<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--bor);font-size:12px;"><span>${p.displayName || p.name} × ${p.qty}</span><span>${fmtMoney((p.cost || 0) * p.qty)}</span></div>`).join('') : '<div style="font-size:12px;color:var(--mut);">No parts added yet.</div>'}
      <div style="margin-top:8px;font-size:12px;color:var(--mut);">Parts total: <b style="color:var(--acc2)">${fmtMoney(j.prt || 0)}</b></div>
    </div>`;
}

function renderJobPartFound(s) {
  const box = document.getElementById('job-parts-found');
  if (!box) return;
  if (!s) {
    activeJobPartStockId = null;
    activeJobPartUseAs = '';
    box.innerHTML = '';
    return;
  }
  activeJobPartStockId = s.id;
  const useChip = (label, value, isOther = false) => {
    const active = isOther
      ? !!activeJobPartUseAs && !['Front', 'Back'].includes(activeJobPartUseAs)
      : activeJobPartUseAs === value;
    return `<button class="btn btn-sm ${active ? 'btn-p' : 'btn-g'}" onclick="${isOther ? 'customJobPartUseAs()' : `setJobPartUseAs('${value}')`}">${label}</button>`;
  };
  const savedPrice = stockSellPriceValue(s);
  box.innerHTML = `
    <div class="quick-card">
      <div style="font-family:var(--fh);font-size:16px;font-weight:700;">${s.name}</div>
      <div style="font-size:12px;color:var(--mut);margin:4px 0 8px;">${s.sku}${s.location ? ` · 📦 ${s.location}` : ''}</div>
      ${normalizePhotoArray(s.photos || s.photo || '').length ? `<div style="margin-bottom:8px;">${photoThumbWithCount(s.photos || s.photo || '', 'Stock Photo Reference')}</div>` : ''}
      <div style="font-size:12px;color:var(--mut);">Stock: <b style="color:${s.qty > s.min ? 'var(--acc)' : 'var(--dan)'}">${s.qty}</b> · Sell ${fmtMoney(savedPrice)}</div>
      ${s.qty <= 0 ? `<div style="font-size:11px;color:var(--dan);margin-top:6px;">This part is at zero or below stock, but you can still add it to the job.</div>` : ''}
      <div style="margin-top:10px;font-size:12px;color:var(--mut);">Price</div>
      <div class="quick-actions" style="margin-top:6px;align-items:center;">
        <button class="btn btn-p btn-sm" onclick="document.getElementById('${JOB_PART_MANUAL_PRICE_INPUT_ID}') && (document.getElementById('${JOB_PART_MANUAL_PRICE_INPUT_ID}').value='');">${fmtMoney(savedPrice)}</button>
        <input class="finp" id="${JOB_PART_MANUAL_PRICE_INPUT_ID}" type="number" inputmode="decimal" min="0" step="0.01" placeholder="Add manually" style="max-width:140px;">
      </div>
      <div style="margin-top:10px;font-size:12px;color:var(--mut);">Use As</div>
      <div class="quick-actions" style="margin-top:6px;">
        ${useChip('Front', 'Front')}
        ${useChip('Back', 'Back')}
        ${useChip('Other', '', true)}
        <button class="btn btn-sm ${!activeJobPartUseAs ? 'btn-p' : 'btn-g'}" onclick="setJobPartUseAs('')">Same</button>
      </div>
      <div style="font-size:12px;color:var(--mut);margin-top:8px;">Invoice line: <b style="color:var(--txt)">${partDisplayName(s.name, activeJobPartUseAs)}</b></div>
      <div class="quick-actions">
        <button class="btn btn-g btn-sm" onclick="if(addPartToJob('${activeJobPartsId}', '${s.id}', 1, activeJobPartUseAs, selectedJobPartPrice('${s.id}'))) afterJobPartAdded('${s.id}');">+1</button>
        <button class="btn btn-g btn-sm" onclick="if(addPartToJob('${activeJobPartsId}', '${s.id}', 2, activeJobPartUseAs, selectedJobPartPrice('${s.id}'))) afterJobPartAdded('${s.id}');">+2</button>
        <button class="btn btn-g btn-sm" onclick="promptJobPartQuantity('${s.id}')">Custom Qty</button>
      </div>
    </div>`;
}

function openJobPartsDrawer(jobId) {
  const j = jobs.find(x => x.id === jobId);
  if (!j) return;
  activeJobPartsId = jobId;
  const info = document.getElementById('job-parts-info');
  if (info) info.innerHTML = `<b>${j.id}</b> — ${j.cust} · ${j.veh}${j.vno ? ` · ${j.vno}` : ''}`;
  const search = document.getElementById('job-parts-search');
  const results = document.getElementById('job-parts-results');
  const found = document.getElementById('job-parts-found');
  if (search) search.value = '';
  if (results) results.innerHTML = '';
  if (found) found.innerHTML = '';
  activeJobPartStockId = null;
  activeJobPartUseAs = '';
  renderJobPartsCurrent(jobId);
  setScannerContext?.('job');
  renderRecentScans?.('job');
  openM('m-job-parts');
}

function closeJobPartsDrawer() {
  if (typeof scannerRunning !== 'undefined' && scannerRunning) stopScanner();
  activeJobPartsId = null;
  activeJobPartStockId = null;
  activeJobPartUseAs = '';
  closeM('m-job-parts');
  setScannerContext?.('page');
}

// ─── Payment Modal ────────────────────────────────────────
let payJobId = null;

function openPaymentModal(id) {
  const j = jobs.find(x => x.id === id);
  if (!j) return;
  j.payments = Array.isArray(j.payments) ? j.payments : [];
  payJobId = id;
  const total = jobTotal(j);
  const paid  = jobPaid(j);
  const due   = jobDue(j);
  const advance = jobAdvance(j);
  document.getElementById('pay-job-info').innerHTML =
    `<b>${j.id}</b> — ${j.cust}<br><span style="color:var(--mut);font-size:12px;">${j.veh} · ${j.vno||''}</span><br>` +
    `Total: <b style="color:var(--acc)">${fmtMoney(total)}</b> | Paid: <b>${fmtMoney(paid)}</b> | ${due > 0 ? `Owe: <b style="color:var(--dan)">${fmtMoney(due)}</b>` : advance > 0 ? `Advance: <b style="color:#00c896">${fmtMoney(advance)}</b>` : 'Status: <b style="color:var(--mut)">Clear</b>'}`;
  document.getElementById('pay-amount').value  = due > 0 ? due : '';
  document.getElementById('pay-method').value  = j.payMethod || getStoredPaymentMethod();
  renderPaymentMethodChips(j.payMethod || getStoredPaymentMethod());
  document.getElementById('pay-notes').value   = '';
  document.getElementById('pay-discount').value = '';
  // Show payment history
  const hist = document.getElementById('pay-history');
  if (hist) {
    hist.innerHTML = j.payments.length ? j.payments
      .slice()
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .map(p => `
      <div style="background:rgba(0,200,150,.08);border:1px solid rgba(0,200,150,.2);border-radius:8px;padding:10px 12px;font-size:12px;margin-bottom:6px;">
        <div style="display:flex;justify-content:space-between;gap:8px;">
          <span>${p.method || 'payment'} · ${p.by || 'user'}</span>
          <span style="color:var(--acc);font-weight:700;">${fmtMoney(p.amount)}</span>
        </div>
        <div style="color:var(--mut);margin-top:3px;">${fmtDateTime(p.at)}${p.notes ? ' · ' + p.notes : ''}</div>
      </div>`).join('') : '';
  }
  openM('m-payment');
}

function savePayment() {
  if (!requireCloudWriteAccess('record payments')) return;
  const j      = jobs.find(x => x.id === payJobId);
  if (!j) return;
  const amount = parseFloat(document.getElementById('pay-amount').value) || 0;
  const discount = parseFloat(document.getElementById('pay-discount').value) || 0;
  const method = document.getElementById('pay-method').value;
  const notes  = document.getElementById('pay-notes').value.trim();
  if (amount <= 0 && discount <= 0) { toast('Enter payment or discount'); return; }
  if (discount < 0) { toast('Enter valid discount'); return; }
  j.payments = Array.isArray(j.payments) ? j.payments : [];
  if (discount > 0) {
    j.discount = jobDiscountAmount(j) + discount;
  }
  if (amount > 0) {
    j.payment   = (j.payment||0) + amount;
    j.payMethod = method;
    j.payments.push({
      id: nextId('pay'),
      amount,
      method,
      notes,
      at: nowISO(),
      by: actorEmail(),
      source: 'payment-modal',
    });
    rememberPaymentMethod(method);
  }
  if (notes) j.notes = (j.notes ? j.notes + ' | ' : '') + notes;
  j.updatedAt = nowISO();
  const total = jobTotal(j);
  const dueAfter = jobDue(j);
  const advanceAfter = jobAdvance(j);
  closeM('m-payment');
  if (jobPaid(j) >= total) {
    const closeMsg = [];
    if (amount > 0) closeMsg.push(`${fmtMoney(amount)} received`);
    if (discount > 0) closeMsg.push(`${fmtMoney(discount)} discount`);
    toast(advanceAfter > 0 ? `${closeMsg.join(' + ')}. Advance ${fmtMoney(advanceAfter)} available.` : `${closeMsg.join(' + ')}. Job ${j.id} clear.`);
    j.status = 'done';
    j.doneAt = j.doneAt || nowISO();
  } else {
    const progressMsg = [];
    if (amount > 0) progressMsg.push(`${fmtMoney(amount)} recorded`);
    if (discount > 0) progressMsg.push(`${fmtMoney(discount)} discount`);
    toast(`${progressMsg.join(' + ')}. Owe: ${fmtMoney(dueAfter)}`);
  }
  logAction('payment', 'job', j.id, { amount, discount, method, due: dueAfter, advance: advanceAfter });
  if (j.status === 'done') markOptimisticInvoice(j.id);
  saveInvoiceAfterPaint('payment');
  if (typeof updateDuesBadge === 'function') updateDuesBadge();
}
