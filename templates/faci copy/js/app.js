/**
 * ============================================================
 * OJT FACILITATOR DASHBOARD — app.js
 * City College of Calamba | Department of Computing & Informatics
 *
 * ISO/IEC 25010 Quality Characteristics:
 *  - Functional Suitability : All features match the mockup spec
 *  - Usability              : ARIA live regions, focus trapping,
 *                             keyboard navigation, toast feedback
 *  - Reliability            : Input validation, graceful fallbacks
 *  - Security               : Input sanitisation helpers, no eval()
 *  - Maintainability        : Modular section structure, JSDoc
 *  - Portability            : Vanilla JS, no external dependencies
 * ============================================================
 */

'use strict';

/* ─────────────────────────────────────────────────────────────
   SECTION 1 – UTILITY HELPERS
───────────────────────────────────────────────────────────── */

/**
 * Shorthand getElementById.
 * @param {string} id
 * @returns {HTMLElement|null}
 */
const $ = (id) => document.getElementById(id);

/**
 * Shorthand querySelector.
 * @param {string} selector
 * @param {Element} [root=document]
 * @returns {Element|null}
 */
const qs = (selector, root = document) => root.querySelector(selector);

/**
 * Shorthand querySelectorAll.
 * @param {string} selector
 * @param {Element} [root=document]
 * @returns {NodeList}
 */
const qsa = (selector, root = document) => root.querySelectorAll(selector);

/**
 * Sanitise a string to prevent XSS when inserting into innerHTML.
 * @param {string} str
 * @returns {string}
 */
function sanitise(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

/**
 * Format a JS Date object as "MM/DD/YYYY".
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  if (!(date instanceof Date) || isNaN(date)) return '—';
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/**
 * Read a file as a Data URL (returns a Promise).
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsDataURL(file);
  });
}

/* ─────────────────────────────────────────────────────────────
   SECTION 2 – LOCAL-STORAGE DATA LAYER
   (Simulates a backend; production would use fetch/API calls)
───────────────────────────────────────────────────────────── */

const DB_KEYS = {
  students      : 'ojt_students',
  documents     : 'ojt_documents',
  forms         : 'ojt_forms',
  notifications : 'ojt_notifications',
  profile       : 'ojt_profile',
  settings      : 'ojt_settings',
  signature     : 'ojt_signature',
};

const DB = {
  get(key)       { try { return JSON.parse(localStorage.getItem(key)) ?? []; } catch { return []; } },
  set(key, val)  { localStorage.setItem(key, JSON.stringify(val)); },
  getObj(key)    { try { return JSON.parse(localStorage.getItem(key)) ?? {}; } catch { return {}; } },
  setObj(key, v) { localStorage.setItem(key, JSON.stringify(v)); },
};

/* ─────────────────────────────────────────────────────────────
   SECTION 3 – TOAST NOTIFICATIONS
   ISO 25010 Usability: non-blocking, auto-dismiss feedback
───────────────────────────────────────────────────────────── */

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} [type='success']
 * @param {number} [duration=3500]
 */
function showToast(message, type = 'success', duration = 3500) {
  const container = $('toastContainer');
  if (!container) return;

  const icons = {
    success : '<svg viewBox="0 0 24 24" fill="currentColor" class="toast-icon"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
    error   : '<svg viewBox="0 0 24 24" fill="currentColor" class="toast-icon"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>',
    info    : '<svg viewBox="0 0 24 24" fill="currentColor" class="toast-icon"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
    warning : '<svg viewBox="0 0 24 24" fill="currentColor" class="toast-icon"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'status');
  toast.innerHTML = `${icons[type] ?? icons.info}<span class="toast-message">${sanitise(message)}</span>`;
  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  // Auto-dismiss
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

/* ─────────────────────────────────────────────────────────────
   SECTION 4 – MODAL MANAGER
   ISO 25010 Usability: focus trapping, ESC to close,
   ARIA state management
───────────────────────────────────────────────────────────── */

const Modal = {
  _previousFocus: null,

  /**
   * Open a modal overlay.
   * @param {string} overlayId
   */
  open(overlayId) {
    const overlay = $(overlayId);
    if (!overlay) return;
    this._previousFocus = document.activeElement;
    overlay.classList.add('active');
    overlay.removeAttribute('aria-hidden');
    // Focus first focusable element inside modal
    const focusable = overlay.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable) setTimeout(() => focusable.focus(), 50);
    document.body.style.overflow = 'hidden';
  },

  /**
   * Close a modal overlay.
   * @param {string} overlayId
   */
  close(overlayId) {
    const overlay = $(overlayId);
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (this._previousFocus) {
      this._previousFocus.focus();
      this._previousFocus = null;
    }
  },
};

// Global ESC key closes any open modal
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  qsa('.modal-overlay.active').forEach(overlay => {
    Modal.close(overlay.id);
  });
});

// Click outside modal content closes it
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    Modal.close(e.target.id);
  }
});

/* ─────────────────────────────────────────────────────────────
   SECTION 5 – LOGOUT
───────────────────────────────────────────────────────────── */
function initLogout() {
  const btn = $('logoutBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to log out?')) {
      try {
        const response = await fetch('/logout', { method: 'POST', headers: { 'Accept': 'application/json' } });
        const result = await response.json();
        window.location.assign(result.redirect || '/');
      } catch {
        alert('Unable to log out. Please try again.');
      }
    }
  });
}

/* ─────────────────────────────────────────────────────────────
   SECTION 6 – DASHBOARD PAGE
───────────────────────────────────────────────────────────── */
function initDashboard() {

  if (!$('totalStudents')) return; // Not on dashboard

  const students  = DB.get(DB_KEYS.students);
  const documents = DB.get(DB_KEYS.documents);

  const verified = documents.filter(d => d.status === 'verified').length;
  const pending  = documents.filter(d => d.status === 'pending').length;
  const rejected = documents.filter(d => d.status === 'rejected').length;

  $('totalStudents').textContent = students.length;
  $('verifiedDocs').textContent  = verified;
  $('pendingDocs').textContent   = pending;
  $('rejectedDocs').textContent  = rejected;

  // Recent submissions (last 8)
  const tbody = $('recentDocsBody');
  if (!tbody) return;
  const recent = [...documents].reverse().slice(0, 8);

  if (recent.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="data-table-empty">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
          <p>No document submissions yet.</p>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = recent.map(doc => `
    <tr>
      <td>${sanitise(doc.studentId)}</td>
      <td>${sanitise(doc.documentName)}</td>
      <td>${sanitise(doc.dateUploaded)}</td>
      <td><span class="badge badge-${sanitise(doc.status)}">${sanitise(doc.status)}</span></td>
    </tr>
  `).join('');
}

/* ─────────────────────────────────────────────────────────────
   SECTION 7 – OJT STUDENTS PAGE
───────────────────────────────────────────────────────────── */
function initStudentsPage() {
  const tbody = $('studentsBody');
  if (!tbody) return;

  const searchInput = $('studentSearch');
  const downloadBtn = $('downloadExcelBtn');

  function renderStudents(list) {
    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="data-table-empty">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
            <p>No students found.</p>
          </td>
        </tr>`;
      return;
    }
    tbody.innerHTML = list.map(s => `
      <tr>
        <td>${sanitise(s.studentId)}</td>
        <td>${sanitise(s.fullName)}</td>
        <td>${sanitise(s.program)}</td>
        <td>${sanitise(s.company)}</td>
      </tr>
    `).join('');
  }

  renderStudents(DB.get(DB_KEYS.students));

  // Live search
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      const all = DB.get(DB_KEYS.students);
      const filtered = q
        ? all.filter(s =>
            s.fullName.toLowerCase().includes(q) ||
            s.studentId.toLowerCase().includes(q)
          )
        : all;
      renderStudents(filtered);
    });
  }

  // Download Excel (simulated — creates a CSV download)
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const students = DB.get(DB_KEYS.students);
      if (students.length === 0) {
        showToast('No student data to export.', 'warning');
        return;
      }
      const header = 'Student ID,Full Name,Program,Company\n';
      const rows   = students.map(s =>
        `"${s.studentId}","${s.fullName}","${s.program}","${s.company}"`
      ).join('\n');
      const blob = new Blob([header + rows], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'ojt_students.csv';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Student list downloaded as CSV.', 'success');
    });
  }
}

/* ─────────────────────────────────────────────────────────────
   SECTION 8 – DOCUMENTS PAGE
───────────────────────────────────────────────────────────── */
function initDocumentsPage() {
  const tbody = $('docsBody');
  if (!tbody) return;

  let activeTab      = 'all';
  let currentDocId   = null;

  // ── Tab switching ──────────────────────────────────────────
  const tabBtns = qsa('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      activeTab = btn.dataset.tab;
      renderDocs();
    });
  });

  // ── Search ─────────────────────────────────────────────────
  const searchInput = $('docSearch');
  if (searchInput) {
    searchInput.addEventListener('input', renderDocs);
  }

  function renderDocs() {
    let docs = DB.get(DB_KEYS.documents);
    const q  = searchInput ? searchInput.value.trim().toLowerCase() : '';

    if (activeTab !== 'all') {
      docs = docs.filter(d =>
        activeTab === 'rejected'
          ? d.status === 'rejected' || d.status === 'revision'
          : d.status === activeTab
      );
    }
    if (q) {
      docs = docs.filter(d =>
        d.studentId.toLowerCase().includes(q) ||
        (d.studentName || '').toLowerCase().includes(q)
      );
    }

    if (docs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="data-table-empty">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
            <p>No documents found.</p>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = docs.map(doc => `
      <tr>
        <td>${sanitise(doc.studentId)}</td>
        <td>${sanitise(doc.documentName)}</td>
        <td>${sanitise(doc.dateUploaded)}</td>
        <td><span class="badge badge-${sanitise(doc.status)}">${sanitise(doc.status)}</span></td>
        <td>
          <button
            class="btn btn-secondary btn-sm"
            data-docid="${sanitise(doc.id)}"
            aria-label="View document for ${sanitise(doc.studentId)}"
          >View</button>
        </td>
      </tr>
    `).join('');

    // Attach view button listeners
    tbody.querySelectorAll('[data-docid]').forEach(btn => {
      btn.addEventListener('click', () => openEsigModal(btn.dataset.docid));
    });
  }

  renderDocs();

  // ── E-Signature Modal ──────────────────────────────────────
  function openEsigModal(docId) {
    currentDocId = docId;
    const docs = DB.get(DB_KEYS.documents);
    const doc  = docs.find(d => String(d.id) === String(docId));
    if (!doc) return;

    // Populate modal fields
    $('modalStudentName').textContent = doc.studentName || '—';
    $('modalStudentId').textContent   = doc.studentId   || '—';
    $('modalDocTitle').textContent    = `View PDF: ${doc.documentName || 'Document'}`;

    // Load saved signature
    const savedSig = localStorage.getItem(DB_KEYS.signature);
    const sigBox   = $('sigPreviewBox');
    if (sigBox) {
      sigBox.innerHTML = savedSig
        ? `<img src="${savedSig}" alt="Facilitator e-signature" style="max-height:70px;max-width:100%;object-fit:contain;" />`
        : '<span style="font-size:0.75rem;color:var(--color-text-muted);">No signature saved</span>';
    }

    // Reset status radios + sub-sections
    const radios = qsa('input[name="docStatus"]');
    radios.forEach(r => { r.checked = false; });
    $('verifiedSubSection').classList.add('hidden');
    $('rejectSubSection').classList.add('hidden');
    $('signedSuccessBox').classList.add('hidden');
    if ($('confirmCheckbox')) $('confirmCheckbox').checked = false;
    if ($('verifySignBtn'))  $('verifySignBtn').disabled = true;
    if ($('rejectRemarks'))  $('rejectRemarks').value = '';

    // Pre-select current status
    if (doc.status === 'verified') {
      const v = $('statusVerified');
      if (v) { v.checked = true; $('verifiedSubSection').classList.remove('hidden'); }
    } else if (doc.status === 'rejected') {
      const r = $('statusRejected');
      if (r) { r.checked = true; $('rejectSubSection').classList.remove('hidden'); }
    }

    Modal.open('esigModal');
  }

  // Radio change handlers
  const statusVerified = $('statusVerified');
  const statusRejected = $('statusRejected');

  if (statusVerified) {
    statusVerified.addEventListener('change', () => {
      if (statusVerified.checked) {
        $('verifiedSubSection').classList.remove('hidden');
        $('rejectSubSection').classList.add('hidden');
        $('signedSuccessBox').classList.add('hidden');
      }
    });
  }

  if (statusRejected) {
    statusRejected.addEventListener('change', () => {
      if (statusRejected.checked) {
        $('rejectSubSection').classList.remove('hidden');
        $('verifiedSubSection').classList.add('hidden');
        $('signedSuccessBox').classList.add('hidden');
      }
    });
  }

  // Confirm checkbox enables verify & sign button
  const confirmCb    = $('confirmCheckbox');
  const verifySignBtn = $('verifySignBtn');
  if (confirmCb && verifySignBtn) {
    confirmCb.addEventListener('change', () => {
      verifySignBtn.disabled = !confirmCb.checked;
    });
  }

  // Verify & Sign
  if (verifySignBtn) {
    verifySignBtn.addEventListener('click', async () => {
      if (!currentDocId) return;
      const savedSig = localStorage.getItem(DB_KEYS.signature);
      if (!savedSig) {
        showToast('Please upload your e-signature in your Profile first.', 'warning');
        return;
      }
      try {
        await updateDocStatus(currentDocId, 'verified');
      } catch (error) {
        showToast(error.message, 'error');
        return;
      }
      $('signedSuccessBox').classList.remove('hidden');
      verifySignBtn.disabled = true;
      showToast('Document marked verified. The original file was not modified.', 'success');
      renderDocs();
    });
  }

  // Reject submit
  const rejectSubmitBtn = $('rejectSubmitBtn');
  if (rejectSubmitBtn) {
    rejectSubmitBtn.addEventListener('click', async () => {
      const remarks = $('rejectRemarks');
      if (!remarks || remarks.value.trim() === '') {
        showToast('Please enter rejection remarks.', 'warning');
        remarks && remarks.focus();
        return;
      }
      if (!currentDocId) return;
      try {
        await updateDocStatus(currentDocId, 'rejected', remarks.value.trim());
      } catch (error) {
        showToast(error.message, 'error');
        return;
      }
      Modal.close('esigModal');
      showToast('Document has been rejected.', 'error');
      renderDocs();
    });
  }

  // Open the uploaded document.
  const viewPdfBtn = $('viewPdfBtn');
  if (viewPdfBtn) {
    viewPdfBtn.addEventListener('click', () => {
      if (!currentDocId) return;
      window.open(`/api/documents/${encodeURIComponent(currentDocId)}/file`, '_blank', 'noopener');
    });
  }

  // The portal stores the review signature separately and does not alter the uploaded file.
  const viewSignedPdfBtn = $('viewSignedPdfBtn');
  if (viewSignedPdfBtn) {
    viewSignedPdfBtn.addEventListener('click', () => {
      if (!currentDocId) return;
      window.open(`/api/documents/${encodeURIComponent(currentDocId)}/file`, '_blank', 'noopener');
    });
  }

  // Done button
  const esigDoneBtn = $('esigDoneBtn');
  if (esigDoneBtn) {
    esigDoneBtn.addEventListener('click', () => {
      Modal.close('esigModal');
      renderDocs();
    });
  }

  // Close button
  const closeEsig = $('closeEsigModal');
  if (closeEsig) {
    closeEsig.addEventListener('click', () => Modal.close('esigModal'));
  }
}

/**
 * Save a document status and its review notes through the portal API.
 * @param {string|number} docId
 * @param {'verified'|'pending'|'rejected'} status
 * @param {string} [remarks]
 */
async function updateDocStatus(docId, status, remarks = '') {
  const docs = DB.get(DB_KEYS.documents);
  const idx  = docs.findIndex(d => String(d.id) === String(docId));
  if (idx === -1) throw new Error('Document is no longer available. Refresh the page and try again.');
  const savedStatus = status === 'verified' ? 'Verified' : status === 'rejected' ? 'Rejected' : 'Pending';
  const response = await fetch(`/api/documents/${encodeURIComponent(docId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: savedStatus, remarks })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to update document status.');
  docs[idx].status  = status;
  docs[idx].remarks = remarks;
  DB.set(DB_KEYS.documents, docs);
}

/* ─────────────────────────────────────────────────────────────
   SECTION 9 – FORMS PAGE
───────────────────────────────────────────────────────────── */
function initFormsPage() {
  const addFormBtn       = $('addFormBtn');
  const closeAddFormModal = $('closeAddFormModal');
  const cancelAddForm    = $('cancelAddForm');
  const submitAddForm    = $('submitAddForm');
  const formFileDropzone = $('formFileDropzone');
  const newFormFile      = $('newFormFile');
  const selectedFileName = $('selectedFileName');

  if (!addFormBtn) return;

  // Open modal
  addFormBtn.addEventListener('click', () => Modal.open('addFormModal'));

  // Close modal
  [closeAddFormModal, cancelAddForm].forEach(btn => {
    if (btn) btn.addEventListener('click', () => {
      resetAddFormModal();
      Modal.close('addFormModal');
    });
  });

  // File dropzone click
  if (formFileDropzone && newFormFile) {
    formFileDropzone.addEventListener('click', () => newFormFile.click());
    formFileDropzone.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); newFormFile.click(); }
    });

    // Drag and drop
    formFileDropzone.addEventListener('dragover', e => {
      e.preventDefault();
      formFileDropzone.style.borderColor = 'var(--color-accent)';
      formFileDropzone.style.backgroundColor = '#f0f7ff';
    });
    formFileDropzone.addEventListener('dragleave', () => {
      formFileDropzone.style.borderColor = '';
      formFileDropzone.style.backgroundColor = '';
    });
    formFileDropzone.addEventListener('drop', e => {
      e.preventDefault();
      formFileDropzone.style.borderColor = '';
      formFileDropzone.style.backgroundColor = '';
      const file = e.dataTransfer.files[0];
      if (file) handleFormFileSelect(file);
    });

    newFormFile.addEventListener('change', () => {
      if (newFormFile.files[0]) handleFormFileSelect(newFormFile.files[0]);
    });
  }

  function handleFormFileSelect(file) {
    const allowed = ['application/pdf', 'application/msword',
                     'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|doc|docx)$/i)) {
      showToast('Only PDF and Word documents are allowed.', 'warning');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('File size must be under 10MB.', 'warning');
      return;
    }
    if (selectedFileName) {
      selectedFileName.textContent = `Selected: ${file.name}`;
    }
    if (formFileDropzone) {
      formFileDropzone.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" style="color:var(--color-success)"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
        <p class="upload-area-text" style="color:var(--color-success);font-weight:600;">${sanitise(file.name)}</p>`;
    }
  }

  // Submit
  if (submitAddForm) {
    submitAddForm.addEventListener('click', async () => {
      const title   = $('newFormTitle');
      const fileErr = $('formFileError');
      const titleErr = $('formTitleError');
      let valid = true;

      if (!title || title.value.trim() === '') {
        if (titleErr) titleErr.style.display = 'block';
        title && title.focus();
        valid = false;
      } else {
        if (titleErr) titleErr.style.display = 'none';
      }

      if (!newFormFile || newFormFile.files.length === 0) {
        if (fileErr) fileErr.style.display = 'block';
        valid = false;
      } else {
        if (fileErr) fileErr.style.display = 'none';
      }

      if (!valid) return;
      const body = new FormData();
      body.append('title', title.value.trim());
      body.append('audience', 'All');
      body.append('file', newFormFile.files[0]);
      try {
        const response = await fetch('/api/forms', { method: 'POST', body });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to upload form.');
        await loadForms();
      } catch (error) {
        showToast(error.message, 'error');
        return;
      }
      resetAddFormModal();
      Modal.close('addFormModal');
      showToast('Form uploaded successfully.', 'success');
    });
  }

  async function loadForms() {
    const response = await fetch('/api/forms');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to load forms.');
    const formsList = $('formsList');
    if (!formsList) return;
    formsList.replaceChildren();
    if (!result.forms.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No forms are currently available.';
      formsList.appendChild(empty);
      return;
    }
    result.forms.forEach(form => {
      const item = document.createElement('div');
      item.className = 'form-list-item';
      item.setAttribute('role', 'listitem');
      const label = document.createElement('span');
      label.className = 'form-list-item-title';
      label.textContent = form.title;
      const link = document.createElement('a');
      link.className = 'form-download-btn';
      link.href = `/api/forms/${form.id}/file`;
      link.setAttribute('aria-label', `Download ${form.title}`);
      link.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
      item.append(label, link);
      formsList.appendChild(item);
    });
  }

  loadForms().catch(error => showToast(error.message, 'error'));

  function resetAddFormModal() {
    const titleInput = $('newFormTitle');
    const descInput  = $('newFormDesc');
    if (titleInput) titleInput.value = '';
    if (descInput)  descInput.value  = '';
    if (newFormFile) newFormFile.value = '';
    if (selectedFileName) selectedFileName.textContent = '';
    if ($('formTitleError')) $('formTitleError').style.display = 'none';
    if ($('formFileError'))  $('formFileError').style.display  = 'none';
    if (formFileDropzone) {
      formFileDropzone.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/></svg>
        <p class="upload-area-text"><span>Click to upload</span> or drag and drop</p>
        <p class="upload-area-text" style="font-size:0.72rem;">PDF, DOC, DOCX (max 10MB)</p>`;
    }
  }
}

/* ─────────────────────────────────────────────────────────────
   SECTION 10 – NOTIFICATION PAGE
───────────────────────────────────────────────────────────── */
function initNotificationPage() {
  const createBtn = $('createNotifBtn');
  if (!createBtn) return;

  const closeBtn      = $('closeAnnouncementModal');
  const cancelBtn     = $('cancelAnnouncement');
  const submitBtn     = $('submitAnnouncement');
  const fileDropzone  = $('notifFileDropzone');
  const fileInput     = $('announcementFile');
  const attachedName  = $('attachedFileName');

  createBtn.addEventListener('click', () => {
    // Set today's date as default
    const dateField = $('announcementDate');
    if (dateField && !dateField.value) {
      dateField.value = new Date().toISOString().split('T')[0];
    }
    Modal.open('postAnnouncementModal');
  });

  [closeBtn, cancelBtn].forEach(btn => {
    if (btn) btn.addEventListener('click', () => {
      resetAnnouncementModal();
      Modal.close('postAnnouncementModal');
    });
  });

  // File attach
  if (fileDropzone && fileInput) {
    fileDropzone.addEventListener('click', () => fileInput.click());
    fileDropzone.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0] && attachedName) {
        attachedName.textContent = `Attached: ${fileInput.files[0].name}`;
      }
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const title   = $('announcementTitle');
      const message = $('announcementMessage');
      const date    = $('announcementDate');
      let valid = true;

      // Validate
      const validate = (field, errId) => {
        const err = $(errId);
        if (!field || field.value.trim() === '') {
          if (err) err.style.display = 'block';
          if (!valid) return; // don't re-focus
          valid = false;
          if (field) field.focus();
        } else {
          if (err) err.style.display = 'none';
        }
      };

      validate(title,   'titleError');
      validate(message, 'messageError');
      validate(date,    'dateError');
      if (!valid) return;
      const attachment = fileInput?.files[0];
      if (attachment && (
        attachment.size > 10 * 1024 * 1024 ||
        !/\.(pdf|doc|docx|jpg|jpeg|png)$/i.test(attachment.name)
      )) {
        showToast('Attachment must be PDF, DOC, DOCX, JPG, or PNG and no larger than 10 MB.', 'warning');
        return;
      }

      try {
        const response = await fetch('/api/notifications', {
          method: 'POST',
          body: (() => {
            const body = new FormData();
            body.append('title', title.value.trim());
            body.append('message', message.value.trim());
            body.append('targetRole', $('announcementAudience')?.value || 'OJT Student');
            if (fileInput?.files[0]) body.append('file', fileInput.files[0]);
            return body;
          })()
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to post announcement.');
        const inbox = await fetch('/api/notifications').then(response => response.json());
        DB.set(DB_KEYS.notifications, inbox.notifications.map(notification => ({
          id: notification.id,
          date: new Date(notification.sent_date).toLocaleString(),
          title: notification.title,
          message: notification.message,
          doneBy: notification.sender,
          fileUrl: notification.file_url ? `/api/notifications/${notification.id}/file` : ''
        })));
        renderNotifications();
      } catch (error) {
        showToast(error.message, 'error');
        return;
      }
      resetAnnouncementModal();
      Modal.close('postAnnouncementModal');
      showToast('Announcement posted successfully.', 'success');
    });
  }

  renderNotifications();

  function renderNotifications() {
    const tbody = $('notifBody');
    if (!tbody) return;
    const list = DB.get(DB_KEYS.notifications);
    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" style="text-align:center;padding:var(--space-12);">
            <svg viewBox="0 0 24 24" fill="currentColor" style="width:48px;height:48px;margin:0 auto var(--space-3);opacity:.25;display:block;"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
            <p style="color:var(--color-text-muted);font-size:var(--font-size-sm);">No announcements posted yet.</p>
          </td>
        </tr>`;
      return;
    }
    tbody.innerHTML = list.map(n => `
      <tr>
        <td>${sanitise(n.date)}</td>
        <td>
          <strong>${sanitise(n.title)}</strong>
          <p style="margin-top:4px;font-size:var(--font-size-xs);color:var(--color-text-secondary);">${sanitise(n.message)}</p>
          ${n.fileUrl ? `<a href="${sanitise(n.fileUrl)}" download>Download attachment</a>` : ''}
        </td>
        <td>${sanitise(n.doneBy)}</td>
      </tr>
    `).join('');
  }

  function resetAnnouncementModal() {
    ['announcementTitle', 'announcementMessage', 'announcementDate'].forEach(id => {
      const el = $(id); if (el) el.value = '';
    });
    if (fileInput) fileInput.value = '';
    if (attachedName) attachedName.textContent = '';
    ['titleError', 'messageError', 'dateError'].forEach(id => {
      const el = $(id); if (el) el.style.display = 'none';
    });
  }
}

/* ─────────────────────────────────────────────────────────────
   SECTION 11 – PROFILE PAGE
───────────────────────────────────────────────────────────── */
function initProfilePage() {
  const form = $('profileForm');
  if (!form) return;

  // Load saved profile
  const profile = DB.getObj(DB_KEYS.profile);
  if (profile.fullName)       { $('fullName').value       = profile.fullName;       updateDisplayName(profile.fullName); }
  if (profile.facilitatorId)  { $('facilitatorId').value  = profile.facilitatorId;  }
  if (profile.emailAddress)   { $('emailAddress').value   = profile.emailAddress;   }
  if (profile.contactNumber)  { $('contactNumber').value  = profile.contactNumber;  }
  if (profile.department)     { $('department').value     = profile.department;     }
  if (profile.roleField)      { $('roleField').value      = profile.roleField;      }
  if (profile.address)        { $('address').value        = profile.address;        }
  if (profile.emergencyNumber){ $('emergencyNumber').value= profile.emergencyNumber;}

  // Load saved avatar
  const savedAvatar = localStorage.getItem('ojt_avatar');
  if (savedAvatar) {
    const container = $('profileAvatarContainer');
    if (container) {
      container.innerHTML = `<img src="${savedAvatar}" alt="Profile photo" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
    }
  }

  // Load saved signature
  const savedSig = localStorage.getItem(DB_KEYS.signature);
  if (savedSig) {
    const preview = $('sigPreview');
    const img     = $('sigPreviewImg');
    if (preview && img) { img.src = savedSig; preview.classList.remove('hidden'); }
  }

  // Change photo
  const changePhotoBtn = $('changePhotoBtn');
  const photoInput     = $('photoInput');
  if (changePhotoBtn && photoInput) {
    changePhotoBtn.addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', async () => {
      const file = photoInput.files[0];
      if (!file) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
        showToast('Choose a JPG, PNG, or WEBP image up to 2 MB.', 'warning');
        return;
      }
      const body = new FormData();
      body.append('photo', file);
      try {
        const response = await fetch('/api/profile/photo', { method: 'POST', body });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to save profile photo.');
        localStorage.setItem('ojt_avatar', `${result.photoUrl}?${Date.now()}`);
        const container = $('profileAvatarContainer');
        if (container) {
          container.innerHTML = `<img src="${localStorage.getItem('ojt_avatar')}" alt="Profile photo" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
        }
        showToast(result.message, 'success');
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  }

  // Full name → display name live update
  const fullNameInput = $('fullName');
  if (fullNameInput) {
    fullNameInput.addEventListener('input', () => updateDisplayName(fullNameInput.value));
  }

  function updateDisplayName(name) {
    const el = $('profileDisplayName');
    if (el) el.textContent = name ? ` ${name}` : '';
  }
  

  const facilitatorIdInput = $('facilitatorId');
  if (facilitatorIdInput) {
    facilitatorIdInput.addEventListener('input', () => updateFacilitatorIdDisplay(facilitatorIdInput.value));
  }
   function updateFacilitatorIdDisplay(id) {
    const el = $('facilitatorIdDisplay');
    if (el) el.textContent = id ? ` ${id}` : '';
  }

  // Signature upload
  const sigDropzone  = $('sigDropzone');
  const sigInput     = $('signatureInput');
  const sigPreview   = $('sigPreview');
  const sigPreviewImg = $('sigPreviewImg');
  let pendingSignatureFile = null;

  if (sigDropzone && sigInput) {
    sigDropzone.addEventListener('click', () => sigInput.click());
    sigDropzone.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sigInput.click(); }
    });
    sigInput.addEventListener('change', () => {
      const file = sigInput.files[0];
      if (!file) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
        showToast('Choose a JPG, PNG, or WEBP signature image up to 2 MB.', 'warning');
        return;
      }
      pendingSignatureFile = file;
      if (sigPreviewImg) sigPreviewImg.src = URL.createObjectURL(file);
      if (sigPreview)    sigPreview.classList.remove('hidden');
    });
  }

  const saveSignatureBtn = $('saveSignatureBtn');
  if (saveSignatureBtn) {
    saveSignatureBtn.addEventListener('click', async () => {
      if (!pendingSignatureFile) { showToast('Please upload a signature image first.', 'warning'); return; }
      const body = new FormData();
      body.append('signature', pendingSignatureFile);
      try {
        const response = await fetch('/api/profile/signature', { method: 'POST', body });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to save signature.');
        localStorage.setItem(DB_KEYS.signature, `/api/profile/signature?${Date.now()}`);
        showToast(result.message, 'success');
        pendingSignatureFile = null;
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  }

  // Save profile form
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      facilitatorId  : $('facilitatorId').value.trim(),
      fullName       : $('fullName').value.trim(),
      emailAddress   : $('emailAddress').value.trim(),
      contactNumber  : $('contactNumber').value.trim(),
      department     : $('department').value,
      roleField      : $('roleField').value.trim(),
      address        : $('address').value.trim(),
      emergencyNumber: $('emergencyNumber').value.trim(),
    };
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facilitatorId: data.facilitatorId,
          fullName: data.fullName,
          department: data.department,
          contactNumber: data.contactNumber,
          position: data.roleField,
          address: data.address,
          emergencyNumber: data.emergencyNumber
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save profile.');
      DB.setObj(DB_KEYS.profile, data);
      showToast(result.message, 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  const saveProfileBtn = $('saveProfileBtn');
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', () => form.requestSubmit());
  }
}

/* ─────────────────────────────────────────────────────────────
   SECTION 12 – SETTINGS PAGE
───────────────────────────────────────────────────────────── */
function initSettingsPage() {
  const accountForm  = $('accountInfoForm');
  const passwordForm = $('changePasswordForm');
  if (!accountForm && !passwordForm) return;

  // Load saved settings
  const saved = DB.getObj(DB_KEYS.settings);
  if ($('username') && saved.username)      $('username').value      = saved.username;
  if ($('recoveryEmail') && saved.recovEmail) $('recoveryEmail').value = saved.recovEmail;

  // Account info save
  if (accountForm) {
    accountForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username      = $('username');
      const recovEmail    = $('recoveryEmail');
      const confirmEmail  = $('confirmEmail');
      const usernameErr   = $('usernameError');
      const emailMatchErr = $('emailMatchError');

      let valid = true;

      if (!username || username.value.trim() === '') {
        if (usernameErr) usernameErr.style.display = 'block';
        username && username.focus();
        valid = false;
      } else {
        if (usernameErr) usernameErr.style.display = 'none';
      }

      if (recovEmail && confirmEmail &&
          recovEmail.value.trim() !== '' &&
          recovEmail.value.trim() !== confirmEmail.value.trim()) {
        if (emailMatchErr) emailMatchErr.style.display = 'block';
        valid = false;
      } else {
        if (emailMatchErr) emailMatchErr.style.display = 'none';
      }

      if (!valid) return;

      try {
        const response = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: username.value.trim(),
            recoveryEmail: recovEmail ? recovEmail.value.trim() : ''
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to save account settings.');
        DB.setObj(DB_KEYS.settings, {
          username: username.value.trim(),
          recovEmail: recovEmail ? recovEmail.value.trim() : ''
        });
        showToast(result.message, 'success');
      } catch (error) {
        showToast(error.message, 'error');
      }
    });

    const saveAccountBtn = $('saveAccountInfoBtn');
    if (saveAccountBtn) {
      saveAccountBtn.addEventListener('click', () => accountForm.requestSubmit());
    }
  }

  // Password strength indicator
  const newPwInput = $('newPassword');
  const strengthEl = $('passwordStrength');
  if (newPwInput && strengthEl) {
    newPwInput.addEventListener('input', () => {
      const pw = newPwInput.value;
      if (pw.length === 0) { strengthEl.textContent = ''; return; }
      let score = 0;
      if (pw.length >= 9)          score++;
      if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
      if (/[^A-Za-z0-9]/.test(pw)) score++;
      const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
      const colors = ['', 'var(--color-danger)', 'var(--color-warning)', '#2196f3', 'var(--color-success)'];
      strengthEl.textContent = `Password strength: ${labels[score]}`;
      strengthEl.style.color = colors[score];
    });
  }

  // Change password save
  if (passwordForm) {
    passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const current  = $('currentPassword');
      const newPw    = $('newPassword');
      const confirm  = $('confirmPassword');
      const matchErr = $('passwordMatchError');

      if (!current.value || !newPw.value || !confirm.value) {
        showToast('Please fill in all password fields.', 'warning');
        return;
      }
      if (newPw.value.length < 9 || !/[A-Z]/.test(newPw.value) ||
          !/[a-z]/.test(newPw.value) || !/[^A-Za-z0-9]/.test(newPw.value)) {
        showToast('Use at least 9 characters, including uppercase, lowercase, and a special character.', 'warning');
        return;
      }
      if (newPw.value !== confirm.value) {
        if (matchErr) matchErr.style.display = 'block';
        return;
      }
      if (matchErr) matchErr.style.display = 'none';

      try {
        const response = await fetch('/api/password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentPassword: current.value,
            newPassword: newPw.value,
            confirmPassword: confirm.value
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to change password.');
        current.value = '';
        newPw.value = '';
        confirm.value = '';
        if (strengthEl) strengthEl.textContent = '';
        showToast(result.message, 'success');
      } catch (error) {
        showToast(error.message, 'error');
      }
    });

    const savePwBtn = $('savePasswordBtn');
    if (savePwBtn) {
      savePwBtn.addEventListener('click', () => passwordForm.requestSubmit());
    }
  }
}

async function loadRemoteData() {
  DB.set(DB_KEYS.students, []);
  DB.set(DB_KEYS.documents, []);
  DB.set(DB_KEYS.notifications, []);
  DB.setObj(DB_KEYS.profile, {});
  DB.setObj(DB_KEYS.settings, {});
  localStorage.removeItem('ojt_avatar');
  localStorage.removeItem(DB_KEYS.signature);
  const [studentResult, documentResult, notificationResult, profileResult, settingsResult] = await Promise.all([
    fetch('/api/students').then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load students.');
      return result;
    }),
    fetch('/api/documents').then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load documents.');
      return result;
    }),
    fetch('/api/notifications').then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load notifications.');
      return result;
    }),
    fetch('/api/profile').then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load your profile.');
      return result;
    }),
    fetch('/api/settings').then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load settings.');
      return result;
    })
  ]);

  DB.set(DB_KEYS.students, studentResult.students.map(student => ({
    studentId: student.studentId || '',
    fullName: student.fullName,
    program: student.program || '',
    company: student.company || ''
  })));
  DB.set(DB_KEYS.documents, documentResult.documents.map(document => ({
    id: document.id,
    studentId: document.student_number || '',
    studentName: document.student_name,
    documentName: document.title,
    dateUploaded: new Date(document.date_uploaded).toLocaleDateString(),
    status: document.status.toLowerCase() === 'for revision' ? 'revision' : document.status.toLowerCase(),
    fileUrl: `/api/documents/${document.id}/file`
  })));
  DB.set(DB_KEYS.notifications, notificationResult.notifications.map(notification => ({
    id: notification.id,
    date: new Date(notification.sent_date).toLocaleString(),
    title: notification.title,
    message: notification.message,
    doneBy: notification.sender,
    fileUrl: notification.file_url ? `/api/notifications/${notification.id}/file` : ''
  })));
  const profile = profileResult.profile;
  DB.setObj(DB_KEYS.profile, {
    fullName: profile.full_name || '',
    facilitatorId: profile.facilitator_id || '',
    emailAddress: profile.email || '',
    contactNumber: profile.contact_number || '',
    department: profile.department || '',
    roleField: profile.position || '',
    address: profile.address || '',
    emergencyNumber: profile.emergency_number || ''
  });
  DB.setObj(DB_KEYS.settings, {
    username: settingsResult.settings.username || profile.full_name || '',
    recovEmail: settingsResult.settings.recovery_email || ''
  });
  if (profile.photo_url) localStorage.setItem('ojt_avatar', '/api/profile/photo');
  if (profile.signature_url) localStorage.setItem(DB_KEYS.signature, '/api/profile/signature');
}

/* ─────────────────────────────────────────────────────────────
   SECTION 14 – GLOBAL TOPBAR NOTIFICATION BUTTON
───────────────────────────────────────────────────────────── */
function initTopbarNotif() {
  const btn = qs('.topbar-icon-btn');
  if (!btn) return;
  fetch('/api/notifications')
    .then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load notifications.');
      const badge = btn.querySelector('.notification-badge');
      if (badge) badge.textContent = result.unread ? String(result.unread) : '';
    })
    .catch(error => showToast(error.message, 'error'));
  btn.addEventListener('click', () => {
    window.location.href = 'notification.html';
  });
}

/* ─────────────────────────────────────────────────────────────
   SECTION 15 – INIT ROUTER
   Detects current page and calls the correct init function
───────────────────────────────────────────────────────────── */
async function init() {
  // Always init logout button
  initLogout();
  initTopbarNotif();

  try {
    await loadRemoteData();
  } catch (error) {
    showToast(error.message || 'Unable to load portal data.', 'error');
  }

  // Page-specific init based on body or URL
  const path = window.location.pathname.toLowerCase();

  if (path.includes('dashboard') || path.endsWith('/') || path.endsWith('index.html')) {
    initDashboard();
  }
  if (path.includes('ojt-students')) {
    initStudentsPage();
  }
  if (path.includes('documents')) {
    initDocumentsPage();
  }
  if (path.includes('forms')) {
    initFormsPage();
  }
  if (path.includes('notification')) {
    initNotificationPage();
  }
  if (path.includes('profile')) {
    initProfilePage();
  }
  if (path.includes('settings')) {
    initSettingsPage();
  }
  // privacy-policy.html — no JS logic needed beyond logout
}

/* ─────────────────────────────────────────────────────────────
   SECTION 16 – BOOT
───────────────────────────────────────────────────────────── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
