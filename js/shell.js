// ═══════════════════════════════════════════════════════
//  Shared shell runtime — loaded by BOTH the root UI and the
//  New UI shell. Phase 3 (2026-06-12): the invoice / photo /
//  AI-assist / done-modal helpers were forked across the two
//  index.html shells; they now live here once. Only the two
//  genuinely shell-specific functions (invoiceSortParts,
//  renderInvoices) and each shell's bootstrap stay inline.
// ═══════════════════════════════════════════════════════

// Invoice list view state (shared across classic scripts).
let invoiceSort    = 'invoice';
let invoiceSortDir = -1;
let invoiceSearch  = '';

function markDone(id) {
  prepareDoneModal(id, 'create');
  openM('m-done');
}

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeJsAttr(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '\\x3C');
}

function photoPreviewMarkup(url, title = 'Photo reference') {
  const safeUrl = escapeAttr(url);
  const safeTitle = escapeAttr(title);
  return `<img src="${safeUrl}" class="clickable-photo" style="max-width:100%;max-height:200px;border-radius:6px;" onclick="event.stopPropagation();openImageViewer('${safeUrl}','${safeTitle}')">`;
}

function normalizePhotoArray(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed.map(item => String(item || '').trim()).filter(Boolean);
      } catch (_) {}
    }
    return [text];
  }
  return [];
}

function photoMetaForPreview(previewId) {
  return {
    'jm-photo-preview': { title: 'Vehicle Photo Reference', persistKind: 'job' },
    'qi-photo-preview': { title: 'Quick Invoice Photo Reference', persistKind: 'quick' },
    'done-photo-preview': { title: 'Invoice Photo Reference', persistKind: 'invoice' },
    'em-photo-preview': { title: 'Expense Photo Reference', persistKind: 'expense' },
    'p-photo-preview': { title: 'Stock Photo Reference', persistKind: 'stock' },
  }[previewId] || { title: 'Photo Reference', persistKind: '' };
}

function getPhotoPreviewList(previewId) {
  const prev = document.getElementById(previewId);
  if (!prev) return [];
  return normalizePhotoArray(prev.dataset.photoList || prev.dataset.dataUrl || '');
}

function photoGalleryMarkup(previewId, urls = [], title = 'Photo Reference', persistKind = '') {
  const list = normalizePhotoArray(urls);
  if (!list.length) return photoPlaceholderMarkup(previewId);
  return `<div class="photo-grid">${list.map((url, index) => {
    const safeUrl = escapeAttr(url);
    const safeTitle = escapeAttr(`${title} ${index + 1}`);
    const removeBtn = persistKind ? `<button type="button" class="photo-remove-btn" onclick="event.stopPropagation();removePhotoFromPreview('${previewId}',${index},'${persistKind}')">×</button>` : '';
    return `<div class="photo-card">${removeBtn}<img src="${safeUrl}" class="clickable-photo" onclick="event.stopPropagation();openImageViewer('${safeUrl}','${safeTitle}')"></div>`;
  }).join('')}</div>`;
}

function getPhotoPreviewList(previewId) {
  const prev = document.getElementById(previewId);
  if (!prev) return [];
  return normalizePhotoArray(prev.dataset.photoList || prev.dataset.dataUrl || '');
}

function photoGalleryMarkup(previewId, urls = [], title = 'Photo Reference', persistKind = '') {
  const list = normalizePhotoArray(urls);
  if (!list.length) return photoPlaceholderMarkup(previewId);
  return `<div class="photo-grid">${list.map((url, index) => {
    const safeUrl = escapeAttr(url);
    const safeTitle = escapeAttr(`${title} ${index + 1}`);
    const removeBtn = persistKind ? `<button type="button" class="photo-remove-btn" onclick="event.stopPropagation();removePhotoFromPreview('${previewId}',${index},'${persistKind}')">×</button>` : '';
    return `<div class="photo-card">${removeBtn}<img src="${safeUrl}" class="clickable-photo" onclick="event.stopPropagation();openImageViewer('${safeUrl}','${safeTitle}')"></div>`;
  }).join('')}</div>`;
}

function photoPlaceholderMarkup(previewId) {
  const label = {
    'jm-photo-preview': '📷 Tap to take / upload photo',
    'qi-photo-preview': '📷 Tap to take / upload photo',
    'done-photo-preview': '📷 Tap to take / upload final invoice photo',
    'em-photo-preview': '📷 Tap to take / upload expense photo',
    'p-photo-preview': '📷 Tap to take / upload stock photo',
  }[previewId] || '📷 Tap to take / upload photo';
  return `<span style="color:var(--mut);font-size:12px;">${label}</span>`;
}

function setPhotoPreview(previewId, url = '', title = 'Photo Reference') {
  setPhotoPreviewList(previewId, url ? [url] : [], title);
}

function setPhotoPreviewList(previewId, urls = [], title = '') {
  const prev = document.getElementById(previewId);
  if (!prev) return;
  const list = normalizePhotoArray(urls);
  const meta = photoMetaForPreview(previewId);
  const finalTitle = title || meta.title;
  prev.dataset.photoList = JSON.stringify(list);
  prev.dataset.dataUrl = list[0] || '';
  prev.dataset.photoReady = 'true';
  prev.dataset.removed = list.length ? 'false' : 'true';
  prev.innerHTML = photoGalleryMarkup(previewId, list, finalTitle, meta.persistKind);
}

function triggerPhotoPicker(inputId, persistKind = '', event = null, mode = 'camera') {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (persistKind === 'invoice' && typeof persistInvoiceDraft === 'function') persistInvoiceDraft();
  if (persistKind === 'job' && typeof persistJobDraft === 'function') persistJobDraft();
  if (persistKind === 'quick' && typeof persistQuickInvoiceDraft === 'function') persistQuickInvoiceDraft();
  const input = setPhotoInputCapture(inputId, mode);
  if (!input) {
    toast('Photo input not found');
    return;
  }
  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
  } catch (_) {}

  const prevDisplay = input.style.display;
  const prevPosition = input.style.position;
  const prevOpacity = input.style.opacity;
  const prevPointerEvents = input.style.pointerEvents;
  const prevWidth = input.style.width;
  const prevHeight = input.style.height;
  const prevZIndex = input.style.zIndex;

  input.style.display = 'block';
  input.style.position = 'fixed';
  input.style.opacity = '0';
  input.style.pointerEvents = 'none';
  input.style.width = '1px';
  input.style.height = '1px';
  input.style.zIndex = '-1';
  input.click();
  setTimeout(() => {
    input.style.display = prevDisplay;
    input.style.position = prevPosition;
    input.style.opacity = prevOpacity;
    input.style.pointerEvents = prevPointerEvents;
    input.style.width = prevWidth;
    input.style.height = prevHeight;
    input.style.zIndex = prevZIndex;
  }, 0);
}

function setPhotoInputCapture(inputId, mode = 'library') {
  const input = document.getElementById(inputId);
  if (!input) return null;
  if (mode === 'camera') input.setAttribute('capture', 'environment');
  else input.removeAttribute('capture');
  return input;
}

function openPhotoCamera(inputId, persistKind = '', event = null) {
  const input = setPhotoInputCapture(inputId, 'camera');
  if (!input) {
    toast('Photo input not found');
    return;
  }
  triggerPhotoPicker(inputId, persistKind, event, 'camera');
}

function openPhotoLibrary(inputId, persistKind = '', event = null) {
  const input = setPhotoInputCapture(inputId, 'library');
  if (!input) {
    toast('Photo input not found');
    return;
  }
  triggerPhotoPicker(inputId, persistKind, event, 'library');
}

function removePhotoFromPreview(previewId, index, persistKind = '') {
  const list = getPhotoPreviewList(previewId);
  if (index < 0 || index >= list.length) return;
  list.splice(index, 1);
  const meta = photoMetaForPreview(previewId);
  setPhotoPreviewList(previewId, list, meta.title);
  if (persistKind === 'invoice' && typeof persistInvoiceDraft === 'function') persistInvoiceDraft();
  if (persistKind === 'job' && typeof persistJobDraft === 'function') persistJobDraft();
  if (persistKind === 'quick' && typeof persistQuickInvoiceDraft === 'function') persistQuickInvoiceDraft();
}

function clearPhotoUpload(previewId, inputId, persistKind = '') {
  const prev = document.getElementById(previewId);
  const input = document.getElementById(inputId);
  if (input) input.value = '';
  if (prev) {
    prev.dataset.photoList = '[]';
    prev.dataset.dataUrl = '';
    prev.dataset.photoReady = 'true';
    prev.dataset.removed = 'true';
    prev.innerHTML = photoPlaceholderMarkup(previewId);
  }
  window._photoUploadBusy = false;
  if (persistKind === 'invoice' && typeof persistInvoiceDraft === 'function') persistInvoiceDraft();
  if (persistKind === 'job' && typeof persistJobDraft === 'function') persistJobDraft();
  if (persistKind === 'quick' && typeof persistQuickInvoiceDraft === 'function') persistQuickInvoiceDraft();
}

function persistPhotoDraftForPreview(previewId) {
  const meta = photoMetaForPreview(previewId);
  if (meta.persistKind === 'invoice' && typeof persistInvoiceDraft === 'function') persistInvoiceDraft();
  if (meta.persistKind === 'job' && typeof persistJobDraft === 'function') persistJobDraft();
  if (meta.persistKind === 'quick' && typeof persistQuickInvoiceDraft === 'function') persistQuickInvoiceDraft();
}

function selectInputText(input) {
  if (!input || typeof input.select !== 'function') return;
  requestAnimationFrame(() => {
    try {
      input.select();
    } catch (_) {}
  });
}

function bindSearchAutoSelect() {
  document.querySelectorAll('input.sbox').forEach(input => {
    if (input.dataset.autoselectBound === 'true') return;
    input.dataset.autoselectBound = 'true';
    input.addEventListener('focus', () => selectInputText(input));
  });
}

function bindEditableAutoSelect() {
  document.querySelectorAll('input.finp, textarea.finp').forEach(input => {
    const type = String(input.type || '').toLowerCase();
    if (['date', 'file', 'hidden', 'checkbox', 'radio'].includes(type)) return;
    if (input.dataset.autoselectBound === 'true') return;
    input.dataset.autoselectBound = 'true';
    input.addEventListener('focus', () => selectInputText(input));
  });
}

function openAiAssistModal(title, prompt, options = {}) {
  const ttl = document.getElementById('ai-assist-title');
  const box = document.getElementById('ai-assist-text');
  const resultWrap = document.getElementById('ai-assist-result-wrap');
  const resultBox = document.getElementById('ai-assist-result');
  const applyBtn = document.getElementById('ai-assist-apply-btn');
  window._aiAssistState = {
    applyTargetId: options.applyTargetId || '',
    applyLabel: options.applyLabel || 'Apply to Field',
  };
  if (ttl) ttl.textContent = title || 'AI Assist';
  if (box) {
    box.value = prompt || '';
    requestAnimationFrame(() => {
      box.focus();
      box.select();
    });
  }
  if (resultBox) resultBox.value = '';
  if (resultWrap) resultWrap.style.display = options.applyTargetId ? '' : 'none';
  if (applyBtn) {
    applyBtn.style.display = options.applyTargetId ? '' : 'none';
    applyBtn.textContent = options.applyLabel || 'Apply to Field';
  }
  openM('m-ai-assist');
}

async function copyAiAssistPrompt() {
  const box = document.getElementById('ai-assist-text');
  const text = box?.value || '';
  if (!text) { toast('No AI prompt to copy'); return; }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      box.focus();
      box.select();
      document.execCommand('copy');
    }
    toast('AI prompt copied');
  } catch (_) {
    box.focus();
    box.select();
    toast('Copy failed. Prompt selected for manual copy.');
  }
}

function applyAiAssistResult() {
  const state = window._aiAssistState || {};
  const targetId = state.applyTargetId || '';
  const result = document.getElementById('ai-assist-result')?.value?.trim() || '';
  if (!targetId) { toast('No target field selected'); return; }
  if (!result) { toast('Paste AI result first'); return; }
  const target = document.getElementById(targetId);
  if (!target) { toast('Target field not found'); return; }
  target.value = result;
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  closeM('m-ai-assist');
  toast('AI result applied');
}

function openImageViewer(src, title = 'Photo Reference') {
  const img = document.getElementById('image-viewer-img');
  const ttl = document.getElementById('image-viewer-title');
  if (!img || !src) return;
  img.src = src;
  if (ttl) ttl.textContent = title || 'Photo Reference';
  openM('m-image-viewer');
}

function prepareDoneModal(id, mode = 'create') {
  const j = jobs.find(x => x.id === id);
  if (!j) return;
  const doneModal = document.querySelector('#m-done');
  const doneTitle = document.querySelector('#m-done .modal-ttl');
  const due   = jobDue(j);
  if (doneTitle) doneTitle.textContent = mode === 'edit' ? 'Edit Invoice' : 'Mark Job Complete';
  document.getElementById('done-job-info').innerHTML =
    `<b>${j.id}</b> — ${j.cust}<br>` +
    `<span style="color:var(--mut);font-size:12px;">${j.veh} · ${j.vno||''}</span>` +
    (mode === 'edit'
      ? `<br><span style="color:var(--acc2)">Editing invoice ${j.invoiceNo || j.id}</span>`
      : due > 0 ? `<br><span style="color:var(--dan)">Owe: ${fmtMoney(due)}</span>` : jobAdvance(j) > 0 ? `<br><span style="color:#00c896">Advance: ${fmtMoney(jobAdvance(j))}</span>` : `<br><span style="color:var(--mut)">Clear</span>`);
  document.getElementById('done-invoice-date').value = (j.doneAt || '').slice(0, 10) || j.date || today();
  const editDisplayTotal = Math.max(0, jobTotal(j) + jobDiscountAmount(j));
  document.getElementById('done-total').value        = editDisplayTotal || '';
  document.getElementById('done-payment').value      = mode === 'edit' ? (jobPaid(j) || '') : (due > 0 ? due : '');
  document.getElementById('done-discount').value     = jobDiscountAmount(j) || '';
  document.getElementById('done-notes').value        = j.notes || '';
  document.getElementById('done-invoice-no').value   = j.invoiceNo || (mode === 'edit' ? '' : suggestedNextInvoiceNo());
  document.getElementById('done-pay-method').value   = j.payMethod || getStoredPaymentMethod();
  if (typeof renderDonePaymentChips === 'function') renderDonePaymentChips(j.payMethod || getStoredPaymentMethod());
  const doneMechInput = document.getElementById('done-mech');
  if (doneMechInput) {
    doneMechInput.value = j.mech || '';
    if (typeof renderMechanicChoiceChips === 'function') renderMechanicChoiceChips('done-mech-chips', 'done-mech', j.mech || '');
  }
  const paymentInput = document.getElementById('done-payment');
  const paymentHelp = document.getElementById('done-payment-help');
  const paymentChips = document.getElementById('done-pay-chips');
  const hasPaymentHistory = mode === 'edit' && Array.isArray(j.payments) && j.payments.length > 0;
  if (paymentInput) paymentInput.disabled = false;
  if (paymentHelp) {
    paymentHelp.style.display = hasPaymentHistory ? '' : 'none';
    paymentHelp.textContent = hasPaymentHistory ? 'This invoice has payment history. Editing this total will add an adjustment entry to keep the history accurate.' : '';
  }
  if (paymentChips) {
    paymentChips.style.pointerEvents = hasPaymentHistory ? 'none' : '';
    paymentChips.style.opacity = hasPaymentHistory ? '0.6' : '';
  }
  document.getElementById('done-applied-advance').value = '0';
  // Scope to the footer: active choice chips also carry .btn-p and would
  // otherwise be renamed to the footer button label.
  const doneBtn = document.querySelector('#m-done .mftr .btn.btn-p');
  if (doneBtn) doneBtn.textContent = mode === 'edit' ? 'Save Invoice Changes' : 'Mark Done & Close Job';
  const nextBtn = document.getElementById('done-next-btn');
  const newCustomerBtn = document.getElementById('done-new-customer-btn');
  if (nextBtn) nextBtn.style.display = mode === 'edit' ? 'none' : '';
  if (newCustomerBtn) newCustomerBtn.style.display = mode === 'edit' ? 'none' : '';
  const donePrev = document.getElementById('done-photo-preview');
  if (donePrev) {
    setPhotoPreviewList('done-photo-preview', j.invoicePhotos || j.invoicePhoto || [], 'Invoice Photo Reference');
  }
  if (doneModal) {
    doneModal._jobId = id;
    doneModal.dataset.mode = mode;
  }
  restoreInvoiceDraft(id, mode);
  refreshDoneBalanceSummary();
}

function refreshDoneBalanceSummary() {
  const id = document.querySelector('#m-done')?._jobId;
  const j = jobs.find(x => x.id === id);
  const box = document.getElementById('done-balance-summary');
  const btn = document.getElementById('done-apply-advance-btn');
  const appliedInput = document.getElementById('done-applied-advance');
  const mode = document.querySelector('#m-done')?.dataset?.mode || 'create';
  if (!box || !j) return;
  if (mode === 'edit') {
    const editedTotal = parseFloat(document.getElementById('done-total')?.value) || 0;
    const discount = parseFloat(document.getElementById('done-discount')?.value) || 0;
    const netTotal = Math.max(0, editedTotal - discount);
    const totalPaid = parseFloat(document.getElementById('done-payment')?.value) || 0;
    const remaining = Math.max(0, netTotal - totalPaid);
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <span>Invoice Total: <b style="color:var(--acc);">${fmtMoney(editedTotal)}</b></span>
        <span>Net After Discount: <b style="color:${netTotal > 0 ? 'var(--acc2)' : 'var(--mut)'}">${fmtMoney(netTotal)}</b></span>
        <span>Total Paid: <b style="color:${totalPaid > 0 ? '#00c896' : 'var(--mut)'}">${fmtMoney(totalPaid)}</b></span>
        <span>${remaining > 0 ? `Remaining Owe: <b style="color:var(--dan)">${fmtMoney(remaining)}</b>` : '<b style="color:#00c896;">Clear</b>'}</span>
      </div>`;
    if (btn) btn.style.display = 'none';
    return;
  }
  const enteredTotal = parseFloat(document.getElementById('done-total')?.value);
  const invoiceTotal = Number.isFinite(enteredTotal) ? enteredTotal : jobSubtotal(j);
  const currentDue = Math.max(0, (invoiceTotal - (parseFloat(document.getElementById('done-discount')?.value) || 0)) - jobPaid(j));
  const availableAdvance = j.custId ? customerAdvanceAmount(j.custId, { excludeJobId: j.id }) : 0;
  let appliedAdvance = parseFloat(appliedInput?.value || '0') || 0;
  const maxAdvanceUse = Math.min(currentDue, availableAdvance);
  if (appliedAdvance > maxAdvanceUse) {
    appliedAdvance = maxAdvanceUse;
    if (appliedInput) appliedInput.value = String(appliedAdvance);
  }
  const remainingAfterAdvance = Math.max(0, currentDue - appliedAdvance);
  const customerMeta = j.custId ? balanceStateMeta(customerBalance(j.custId)) : balanceStateMeta('clear');
  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
      <span>Customer Account: <b style="color:${customerMeta.color};">${customerMeta.label}</b></span>
      <span>Available Advance: <b style="color:${availableAdvance > 0 ? '#00c896' : 'var(--mut)'}">${fmtMoney(availableAdvance)}</b></span>
      <span>Applied Here: <b style="color:${appliedAdvance > 0 ? '#00c896' : 'var(--mut)'}">${fmtMoney(appliedAdvance)}</b></span>
      <span>${remainingAfterAdvance > 0 ? `Remaining Owe: <b style="color:var(--dan)">${fmtMoney(remainingAfterAdvance)}</b>` : '<b style="color:#00c896;">Clear after advance</b>'}</span>
    </div>`;
  if (btn) btn.style.display = availableAdvance > 0 && currentDue > 0 ? '' : 'none';
}

function applyCustomerAdvanceToDone() {
  const id = document.querySelector('#m-done')?._jobId;
  const j = jobs.find(x => x.id === id);
  if (!j || !j.custId) return;
  const enteredTotal = parseFloat(document.getElementById('done-total')?.value);
  const invoiceTotal = Number.isFinite(enteredTotal) ? enteredTotal : jobSubtotal(j);
  const currentDue = Math.max(0, (invoiceTotal - (parseFloat(document.getElementById('done-discount')?.value) || 0)) - jobPaid(j));
  const availableAdvance = customerAdvanceAmount(j.custId, { excludeJobId: j.id });
  const useAdvance = Math.min(currentDue, availableAdvance);
  if (useAdvance <= 0) { toast('No customer advance available'); return; }
  document.getElementById('done-applied-advance').value = String(useAdvance);
  const payInput = document.getElementById('done-payment');
  if (payInput) {
    const currentPayment = parseFloat(payInput.value || '0') || 0;
    if (currentPayment >= currentDue - 0.009 || currentPayment === 0) {
      payInput.value = Math.max(0, currentDue - useAdvance);
    }
  }
  refreshDoneBalanceSummary();
  persistInvoiceDraft();
  toast(`Applied ${fmtMoney(useAdvance)} from customer advance`);
}

function confirmDone(nextAction = 'close') {
  const doneModal = document.querySelector('#m-done');
  const mode = doneModal?.dataset?.mode || 'create';
  if (!requireCloudWriteAccess(mode === 'edit' ? 'edit invoices' : 'complete jobs and create invoices')) return;
  const id     = doneModal?._jobId;
  const j      = jobs.find(x => x.id === id);
  if (!j) return;
  const isEditMode = mode === 'edit';
  j.payments = Array.isArray(j.payments) ? j.payments : [];
  j.discount = parseFloat(document.getElementById('done-discount').value) || 0;
  const invoiceTotalInput = document.getElementById('done-total');
  const invoiceTotalRaw = String(invoiceTotalInput?.value ?? '').trim();
  const invoiceGrossTotal = invoiceTotalRaw === ''
    ? Math.max(0, isEditMode ? jobTotal(j) + jobDiscountAmount(j) : jobSubtotal(j))
    : (parseFloat(invoiceTotalRaw) || 0);
  const netInvoiceTotal = Math.max(0, invoiceGrossTotal - j.discount);
  const pay    = parseFloat(document.getElementById('done-payment').value) || 0;
  const method = document.getElementById('done-pay-method').value;
  const doneMechValue = document.getElementById('done-mech')?.value;
  const notes  = document.getElementById('done-notes').value.trim();
  const invoiceDate = document.getElementById('done-invoice-date').value || j.date || today();
  const typedInvoiceNo = document.getElementById('done-invoice-no').value.trim();
  if (!requireNotFutureBusinessDate(invoiceDate, 'Invoice date')) return;
  const duplicateInvoice = typedInvoiceNo ? findDuplicateInvoiceNumber(typedInvoiceNo, j.id) : null;
  if (duplicateInvoice) {
    toast(`Invoice number already exists: ${duplicateInvoice.invoiceNo || duplicateInvoice.id}`);
    return;
  }
  if (invoiceGrossTotal < 0) { toast('Enter valid invoice total'); return; }
  if (pay < 0) { toast('Enter valid payment'); return; }
  const invNo  = isEditMode
    ? (typedInvoiceNo || j.invoiceNo || nextInvoiceNo(''))
    : nextInvoiceNo(typedInvoiceNo);
  const currentDueBeforeApply = Math.max(0, (isEditMode ? jobTotal(j) : netInvoiceTotal) - jobPaid(j));
  const appliedAdvance = Math.min(
    parseFloat(document.getElementById('done-applied-advance')?.value || '0') || 0,
    currentDueBeforeApply,
    j.custId ? customerAdvanceAmount(j.custId, { excludeJobId: j.id }) : 0
  );
  const donePhotoPreview = document.getElementById('done-photo-preview');
  const invoicePhotos = donePhotoPreview?.dataset?.removed === 'true'
    ? []
    : (typeof getPhotoPreviewList === 'function' ? getPhotoPreviewList('done-photo-preview') : normalizePhotoArray(donePhotoPreview?.dataset?.dataUrl || j.invoicePhoto || ''));
  const invoicePhoto = invoicePhotos[0] || '';
  if (isEditMode) {
    const hasPaymentHistory = Array.isArray(j.payments) && j.payments.length > 0;
    j.totalOverride = netInvoiceTotal;
    if (hasPaymentHistory) {
      const historySum = j.payments.reduce((sum, entry) => sum + (parseFloat(entry.amount || 0) || 0), 0);
      const delta = pay - historySum;
      if (Math.abs(delta) > 0.009) {
        j.payments.push({
          id: nextId('pay'),
          amount: delta,
          method,
          notes: 'Manual adjustment from edit invoice',
          at: nowISO(),
          by: actorEmail(),
          source: 'edit-invoice-adjust',
        });
        j.payMethod = method;
      }
      j.payment = pay;
    } else {
      j.payment = pay;
      j.payMethod = method;
      j.payments = [];
    }
    j.status = 'done';
    j.invoiceNo = invNo;
    j.date = invoiceDate;
    j.doneAt = invoiceDateTime(invoiceDate, j.time || '');
    j.notes = notes;
    j.invoicePhotos = invoicePhotos;
    j.invoicePhoto = invoicePhoto;
    if (typeof doneMechValue === 'string') j.mech = doneMechValue;
    j.updatedAt = nowISO();
    markOptimisticInvoice(j.id);
    rememberPaymentMethod(method);
    clearInvoiceDraft(j.id, mode);
    logAction('update', 'invoice', j.id, { invoiceNo: j.invoiceNo, discount: j.discount, paid: j.payment });
    closeM('m-done');
    if (typeof saveInvoiceAfterPaint === 'function') saveInvoiceAfterPaint('invoice', { renderInvoiceId: j.id });
    else {
      saveAll({ domain: 'invoice' });
      if (typeof scheduleInvoiceSaveUiRefresh === 'function') scheduleInvoiceSaveUiRefresh({ renderInvoiceId: j.id });
    }
    toast('Invoice updated');
    return;
  }
  j.totalOverride = netInvoiceTotal;
  if (appliedAdvance > 0) {
    j.payment = (j.payment || 0) + appliedAdvance;
    j.payments.push({
      id: nextId('pay'),
      amount: appliedAdvance,
      method: 'advance-adjustment',
      notes: 'Applied customer advance on invoice completion',
      at: nowISO(),
      by: actorEmail(),
      source: 'customer-advance-apply',
    });
    if (!pay) j.payMethod = 'advance-adjustment';
  }
  if (pay > 0) {
    j.payment = (j.payment||0) + pay;
    j.payMethod = method;
    j.payments.push({
      id: nextId('pay'),
      amount: pay,
      method,
      notes: notes || 'Final payment on completion',
      at: nowISO(),
      by: actorEmail(),
      source: 'mark-done',
    });
  }
  j.status      = 'done';
  j.invoiceNo   = invNo;
  j.date        = invoiceDate;
  j.doneAt      = invoiceDateTime(invoiceDate, j.time || '');
  if (typeof doneMechValue === 'string') j.mech = doneMechValue;
  j.invoicePhotos = invoicePhotos;
  j.invoicePhoto = invoicePhoto;
  if (notes) j.notes = (j.notes ? j.notes + ' | ' : '') + notes;
  j.updatedAt = nowISO();
  markOptimisticInvoice(j.id);
  rememberPaymentMethod(method);
  clearInvoiceDraft(j.id, mode);
  document.getElementById('done-invoice-no').value = '';
  document.getElementById('done-invoice-date').value = today();
  document.getElementById('done-applied-advance').value = '0';
  const donePrev = document.getElementById('done-photo-preview');
  if (donePrev) {
    setPhotoPreviewList('done-photo-preview', [], 'Invoice Photo Reference');
  }
  closeM('m-done');
  logAction('complete', 'invoice', j.id, { invoiceNo: invNo, discount: j.discount, total: jobTotal(j), paid: j.payment || 0, appliedAdvance });
  if (typeof saveInvoiceAfterPaint === 'function') saveInvoiceAfterPaint('invoice');
  else {
    saveAll({ domain: 'invoice' });
    if (typeof scheduleInvoiceSaveUiRefresh === 'function') scheduleInvoiceSaveUiRefresh();
  }
  if (nextAction === 'next') {
    const nextJob = nextInvoiceCandidate(j.id);
    if (nextJob) {
      markDone(nextJob.id);
      toast(`Saved ${invNo}. Opened ${nextJob.id} for next invoice.`);
    } else {
      toast(`Saved ${invNo}. No next invoice waiting.`);
    }
  } else if (nextAction === 'new-customer') {
    openNewJob({ skipDraftRestore: true, startFresh: true, focusCustomer: true });
    toast(`Saved ${invNo}. Ready for the next customer.`);
  } else {
    toast(`Job done! ${j.cust} · ${invNo}`);
  }
}

function normalizeInvoiceRef(value = '') {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\bINVOICE\b/g, '')
    .replace(/\bINV\b/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

function invoiceRefMatches(left = '', right = '') {
  const a = normalizeInvoiceRef(left);
  const b = normalizeInvoiceRef(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.endsWith(b) || b.endsWith(a)) return true;
  const aDigits = a.replace(/\D/g, '');
  const bDigits = b.replace(/\D/g, '');
  if (aDigits && bDigits && (aDigits === bDigits || aDigits.endsWith(bDigits) || bDigits.endsWith(aDigits))) {
    return true;
  }
  return false;
}

function invoiceRefExactMatch(left = '', right = '') {
  const a = normalizeInvoiceRef(left);
  const b = normalizeInvoiceRef(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const aDigits = a.replace(/\D/g, '');
  const bDigits = b.replace(/\D/g, '');
  return !!(aDigits && bDigits && aDigits === bDigits);
}

function compareInvoiceNumbers(leftJob, rightJob) {
  const left = invoiceSortParts(leftJob);
  const right = invoiceSortParts(rightJob);
  if (left.number !== right.number) return left.number - right.number;
  return left.text.localeCompare(right.text);
}

function invoiceDefaultSortDir(col) {
  return -1;
}

function invoiceRecentSortValue(job) {
  return Date.parse(
    job?.doneAt
    || job?.createdAt
    || job?.updatedAt
    || job?.timestamp
    || (job?.date ? `${job.date}T${job.time || '00:00:00'}` : 0)
    || 0
  ) || 0;
}

function linkedRegularIncomeForInvoice(invoiceNo = '') {
  const target = String(invoiceNo || '').trim();
  if (!target) return [];
  return (incomeEntries || [])
    .map(normalizeIncomeEntry)
    .filter(entry => String(entry.invoiceNo || '').trim() && invoiceRefExactMatch(entry.invoiceNo || '', target));
}

function buildLinkedIncomeInvoiceIndex() {
  const byKey = new Map();
  const byDigits = new Map();
  (incomeEntries || []).map(normalizeIncomeEntry).forEach(entry => {
    if (!isLiveIncomeEntry(entry) || !String(entry.invoiceNo || '').trim()) return;
    const key = normalizeInvoiceRef(entry.invoiceNo || '');
    const digits = key.replace(/\D/g, '');
    if (key) {
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(entry);
    }
    if (digits) {
      if (!byDigits.has(digits)) byDigits.set(digits, []);
      byDigits.get(digits).push(entry);
    }
  });
  return { byKey, byDigits };
}

function linkedRegularIncomeForInvoiceFromIndex(invoiceNo = '', index = buildLinkedIncomeInvoiceIndex()) {
  const target = normalizeInvoiceRef(invoiceNo || '');
  if (!target) return [];
  const digits = target.replace(/\D/g, '');
  const seen = new Set();
  return []
    .concat(index.byKey.get(target) || [])
    .concat(digits ? (index.byDigits.get(digits) || []) : [])
    .filter(entry => {
      if (!invoiceRefExactMatch(entry.invoiceNo || '', target)) return false;
      const key = entry.id || `${entry.invoiceNo}:${entry.amount}:${entry.timestamp}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function invoiceTableColumnsHtml(arw) {
  return `<tr>
    <th style="cursor:pointer;" onclick="sortInvoices('invoice')">Invoice #${arw('invoice')}</th>
    <th style="cursor:pointer;" onclick="sortInvoices('date')">Date / Time${arw('date')}</th>
    <th>Customer</th>
    <th>Vehicle</th>
    <th>Photo</th>
    <th style="cursor:pointer;" onclick="sortInvoices('amount')">Amount${arw('amount')}</th>
    <th>Paid</th>
    <th>Linked Income</th>
    <th>Due</th>
    <th></th>
  </tr>`;
}

function invoicePendingDot(jobId = '') {
  return typeof isOptimisticInvoice === 'function' && isOptimisticInvoice(jobId)
    ? `<span class="invoice-pending-dot" title="Syncing in background"></span>`
    : '';
}

function invoiceTableRowHtml(j, linkedIncomeIndex) {
  const total = jobTotal(j);
  const paid  = jobPaid(j);
  const due   = jobDue(j);
  const advance = jobAdvance(j);
  const stamp = j.doneAt || `${j.date}T${j.time || '00:00'}`;
  const linkedIncome = linkedRegularIncomeForInvoiceFromIndex(j.invoiceNo || j.id, linkedIncomeIndex);
  const linkedIncomeTotal = linkedIncome.reduce((sum, entry) => sum + (entry.amount || 0), 0);
  const linkedIncomeLabel = linkedIncome.length
    ? linkedIncome.map(entry => `${fmtMoney(entry.amount)}${entry.note ? ` · ${entry.note}` : ''}`).join('<br>')
    : '';
  return `<tr>
    <td style="font-family:var(--fh);font-weight:700;color:var(--acc);display:flex;align-items:center;gap:8px;">${j.invoiceNo||j.id}${invoicePendingDot(j.id)}</td>
    <td style="font-size:12px;">${fmtDate(stamp)}<br><span style="color:var(--mut)">${new Date(stamp).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })}</span></td>
    <td>
      <button class="btn btn-g btn-sm" style="padding:0;border:none;background:none;color:var(--txt);font-weight:600;text-align:left;" onclick="openCustomerHistory('${escapeJsAttr(j.custId || '')}','${escapeJsAttr(j.cust || '')}','${escapeJsAttr(j.phone || '')}','${escapeJsAttr(j.id || '')}')">${j.cust}</button>
      <br><span style="font-size:11px;color:var(--mut)">${j.phone||''}</span>
    </td>
    <td style="font-size:12px;">${j.veh}<br><span style="color:var(--mut)">${j.vno||''}</span></td>
    <td>${typeof photoThumbWithCount === 'function' ? photoThumbWithCount(j.invoicePhotos || j.invoicePhoto || j.photos || j.photo || '', 'Invoice Photo Reference') : ((j.invoicePhoto || j.photo) ? `<img src="${j.invoicePhoto || j.photo}" alt="Vehicle photo" class="clickable-photo" style="width:46px;height:46px;object-fit:cover;border-radius:8px;border:1px solid var(--bor);" onclick="openImageViewer('${escapeAttr(j.invoicePhoto || j.photo)}','Invoice Photo Reference')">` : '<span style="color:var(--mut);font-size:12px;">—</span>')}</td>
    <td style="font-family:var(--fh);font-weight:700;">${fmtMoney(total)}</td>
    <td style="color:#00c896;">${paid>0?fmtMoney(paid):'—'}</td>
    <td style="font-size:11px;color:${linkedIncomeTotal > 0 ? 'var(--acc2)' : 'var(--mut)'};">${linkedIncomeTotal > 0 ? `<div style="font-weight:700;">${fmtMoney(linkedIncomeTotal)}</div><div style="margin-top:3px;">${linkedIncomeLabel}</div>` : '—'}</td>
    <td style="${due>0?'color:var(--dan);font-weight:700':advance>0?'color:#00c896;font-weight:700':'color:var(--mut)'};">${due>0?`Owe ${fmtMoney(due)}`:advance>0?`Advance ${fmtMoney(advance)}`:'Clear'}</td>
    <td style="white-space:nowrap;">
      <button class="btn btn-g btn-sm" onclick="openInvoice('${j.id}')">🖨</button>
      ${isAdminUser() ? `<button class="btn btn-g btn-sm" onclick="openInvoiceEdit('${j.id}')">Edit</button>
      <button class="btn btn-r btn-sm" onclick="removeInvoice('${j.id}')">Del</button>` : ''}
      <button class="btn btn-g btn-sm" onclick="sendBill('${j.id}')">📱</button>
    </td>
  </tr>`;
}

function sortInvoices(col) {
  if (invoiceSort === col) { invoiceSortDir *= -1; }
  else { invoiceSort = col; invoiceSortDir = invoiceDefaultSortDir(col); }
  if (typeof resetLongListPage === 'function') resetLongListPage('invoices');
  const sel = document.getElementById('inv-sort-sel');
  if (sel) sel.value = col;
  renderInvoices();
}

function setInvoiceSort(col) {
  invoiceSort = col || 'invoice';
  invoiceSortDir = invoiceDefaultSortDir(invoiceSort);
  if (typeof resetLongListPage === 'function') resetLongListPage('invoices');
  renderInvoices();
}

function filterInvoices(q) {
  invoiceSearch = q;
  if (typeof resetLongListPage === 'function') resetLongListPage('invoices');
  if (typeof debouncePerf === 'function') {
    debouncePerf('invoice-search', renderInvoices, 150);
  } else {
    renderInvoices();
  }
}

function openInvoiceEdit(id) {
  if (!requireAdminAccess('edit invoices')) return;
  prepareDoneModal(id, 'edit');
  openM('m-done');
}

function removeInvoice(id) {
  if (!requireAdminAccess('delete invoice')) return;
  if (!confirm('Delete this invoice permanently? This cannot be undone.')) return;

  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return;

  const job = jobs[idx];
  job.deleted_at = nowISO();
  job.deletedAt = job.deleted_at;
  job.deleted_by = actorEmail();
  job.deletedBy = job.deleted_by;

  logAction('delete', 'invoice', id, {
    invoice_no: job.invoice_no || job.invoiceNo,
    customer: job.customer || job.cust
  });

  saveAll({ domain: 'jobs' });
  renderInvoices();
  toast('Invoice deleted.');
}

function toggleDoneJobs() {
  const grid   = document.getElementById('done-grid');
  const toggle = document.getElementById('done-toggle');
  const hidden = grid.style.display === 'none';
  grid.style.display  = hidden ? '' : 'none';
  toggle.textContent  = hidden ? '▲ Hide' : '▼ Show';
  if (hidden) renderDoneJobs();
}

function renderDoneJobs() {
  const done = jobs.filter(j => isLiveJob(j) && j.status === 'done' && j.date === today())
    .sort((a, b) => invoiceSortValue(b) - invoiceSortValue(a));
  document.getElementById('done-grid').innerHTML = done.map(j => `
    <div class="jcard done">
      <div class="jtop"><span class="jnum">${j.id} · ${j.time}</span><span class="jnum">${j.vno||''}</span></div>
      <div class="jcust">${j.cust}</div>
      <div class="jveh">${j.veh}</div>
      <div class="jprob">${j.prob}</div>
      <div class="jftr">
        <span style="font-size:11px;color:var(--acc)">${fmtMoney(jobTotal(j))}</span>
        <span class="sbadge ready">Done ✓</span>
      </div>
      ${j.invoiceNo ? `<div style="font-size:11px;color:var(--mut);margin-top:4px;">🧾 ${j.invoiceNo}</div>` : ''}
      <div class="jacts">
        <button class="btn btn-g btn-sm" onclick="viewJob('${j.id}')">Details</button>
        <button class="btn btn-g btn-sm" onclick="openInvoice('${j.id}')">Invoice</button>
      </div>
    </div>`).join('');
}

function handlePhotoUpload(input, previewId) {
  const files = Array.from(input.files || []);
  if (!files.length) return;
  if (files.some(file => !file.type.startsWith('image/'))) { toast('Please choose image files'); return; }
  window._photoUploadBusy = true;
  const prev = document.getElementById(previewId);
  prev.dataset.photoReady = 'false';
  prev.dataset.removed = 'false';
  prev.innerHTML = `<span style="color:var(--mut);font-size:12px;">Uploading ${files.length} photo${files.length > 1 ? 's' : ''}...</span>`;
  const existingPhotos = getPhotoPreviewList(previewId);
  Promise.all(files.map(async (file, index) => {
    const blob = await compressImageFile(file, 1280, 960, 0.72);
    let url = '';
    const uploadKind = previewId === 'done-photo-preview'
      ? 'invoice'
      : previewId === 'em-photo-preview'
        ? 'expense'
        : previewId === 'p-photo-preview'
          ? 'stock'
          : 'job';
    const recordId = editJobId || document.querySelector('#m-done')?._jobId || `draft-${Date.now()}`;
    try {
      if (cloudSessionActive && typeof uploadPhotoToCloud === 'function') {
        url = await uploadPhotoToCloud(new File([blob], `${uploadKind}-${Date.now()}-${index}.jpg`, { type: 'image/jpeg' }), { kind: uploadKind, recordId });
      } else {
        url = await blobToDataUrl(blob);
      }
    } catch (_) {
      url = await blobToDataUrl(blob);
    }
    return url;
  }))
    .then(urls => {
      const meta = photoMetaForPreview(previewId);
      setPhotoPreviewList(previewId, existingPhotos.concat(urls), meta.title);
      window._photoUploadBusy = false;
      if (input) input.value = '';
      persistPhotoDraftForPreview(previewId);
    })
    .catch(() => {
      window._photoUploadBusy = false;
      prev.dataset.photoReady = 'false';
      prev.dataset.removed = 'false';
      prev.innerHTML = '<span style="color:var(--dan);font-size:12px;">Photo failed. Try again.</span>';
      toast('Photo upload failed');
    });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function compressImageFile(file, maxW = 1280, maxH = 960, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const ratio = Math.min(maxW / width, maxH / height, 1);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Compression failed')), 'image/jpeg', quality);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
