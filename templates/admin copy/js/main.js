/**
 * main.js – Shared application logic
 * City College of Calamba – OJT Admin System
 *
 * ISO 25010 Quality Characteristics addressed:
 *  - Functional Suitability : shared helpers used across all pages
 *  - Usability              : toast feedback, confirm dialogs, keyboard nav
 *  - Reliability            : safe LocalStorage wrapper, error boundaries
 *  - Security               : input sanitisation, XSS-safe DOM helpers
 *  - Maintainability        : modular, documented, single-responsibility fns
 *  - Portability            : no external runtime dependencies
 */

'use strict';

/* ================================================================
   CONSTANTS
   ================================================================ */

const APP_KEY  = 'ccc_ojt_admin';          // LocalStorage namespace
const USERS_KEY = `${APP_KEY}_users`;       // User data store key
const NOTIF_KEY = `${APP_KEY}_notifs`;      // Notifications store key

/* ================================================================
   SAFE DOM HELPER  (ISO 25010 – Security: prevents raw innerHTML XSS)
   ================================================================ */

/**
 * Safely set text content – never use innerHTML with user data.
 * @param {HTMLElement} el
 * @param {string} text
 */
function setText(el, text) {
  if (el) el.textContent = String(text);
}

/**
 * Create an element with optional attributes and text content.
 * @param {string} tag
 * @param {Object} attrs
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function createElement(tag, attrs = {}, text = '') {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'className') el.className = v;
    else if (k === 'style')  el.style.cssText = v;
    else el.setAttribute(k, v);
  });
  if (text) el.textContent = text;
  return el;
}

/* ================================================================
   LOCAL STORAGE WRAPPER  (ISO 25010 – Reliability)
   ================================================================ */

const Store = {
  /**
   * @param {string} key
   * @param {*} fallback
   * @returns {*}
   */
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },

  /**
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('[Store] Failed to save:', e);
    }
  },

  /**
   * @param {string} key
   */
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* noop */ }
  }
};

/* ================================================================
   USER DATA HELPERS
   ================================================================ */

let usersCache = [];

/**
 * Return all users from store.
 * @returns {Array}
 */
function getAllUsers() {
  return usersCache;
}

/**
 * Persist updated user list.
 * @param {Array} users
 */
function saveUsers(users) {
  usersCache = users;
}

/**
 * Find a user by id.
 * @param {string} id
 * @returns {Object|null}
 */
function getUserById(id) {
  return getAllUsers().find(u => String(u.id) === String(id)) || null;
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}

/**
 * Generate a unique id.
 * @returns {string}
 */
function generateId() {
  return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Format a date string for display.
 * @param {string} dateStr  ISO date string
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const d = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(dateStr);
  return Number.isNaN(d.getTime())
    ? dateStr
    : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' });
}

/* ================================================================
   TOAST NOTIFICATIONS  (ISO 25010 – Usability: user feedback)
   ================================================================ */

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {number} duration  ms before auto-dismiss
 */
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const iconMap = {
    success: '✅',
    error:   '❌',
    info:    'ℹ️',
    warning: '⚠️'
  };

  const toast = createElement('div', { className: `toast ${type}`, role: 'status' });
  const icon  = createElement('span', {}, iconMap[type] || 'ℹ️');
  const text  = createElement('span', {}, message);

  toast.appendChild(icon);
  toast.appendChild(text);
  container.appendChild(toast);

  // Auto dismiss
  const timer = setTimeout(() => dismissToast(toast), duration);
  toast.addEventListener('click', () => { clearTimeout(timer); dismissToast(toast); });
}

function dismissToast(toast) {
  toast.classList.add('removing');
  toast.addEventListener('animationend', () => toast.remove(), { once: true });
  // Fallback remove if animation doesn't fire
  setTimeout(() => toast.remove(), 400);
}

// Expose globally so inline scripts on forms.html etc. can call it
window.showToast = showToast;

/* ================================================================
   CONFIRM DIALOG  (ISO 25010 – Usability: destructive action guard)
   ================================================================ */

/**
 * Show a confirm dialog and resolve with true/false.
 * @param {string} overlayId  id of the .confirm-overlay element
 * @param {string} confirmBtnId
 * @param {string} cancelBtnId
 * @returns {Promise<boolean>}
 */
function openConfirm(overlayId, confirmBtnId, cancelBtnId) {
  return new Promise(resolve => {
    const overlay    = document.getElementById(overlayId);
    const confirmBtn = document.getElementById(confirmBtnId);
    const cancelBtn  = document.getElementById(cancelBtnId);
    if (!overlay || !confirmBtn || !cancelBtn) { resolve(false); return; }

    overlay.classList.add('open');
    // Focus the cancel button by default (safe default – ISO 25010 Usability)
    cancelBtn.focus();

    function cleanup(result) {
      overlay.classList.remove('open');
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('keydown', onKeydown);
      resolve(result);
    }

    const onConfirm  = () => cleanup(true);
    const onCancel   = () => cleanup(false);
    const onKeydown  = e => { if (e.key === 'Escape') cleanup(false); };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click',  onCancel);
    overlay.addEventListener('keydown',  onKeydown);
  });
}

/* ================================================================
   MODAL HELPERS
   ================================================================ */

/**
 * Open a modal overlay.
 * @param {string} overlayId
 */
function openModal(overlayId) {
  const el = document.getElementById(overlayId);
  if (!el) return;
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
  // Trap focus on first focusable child
  const focusable = el.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusable.length) focusable[0].focus();
}

/**
 * Close a modal overlay.
 * @param {string} overlayId
 */
function closeModal(overlayId) {
  const el = document.getElementById(overlayId);
  if (!el) return;
  el.classList.remove('open');
  el.setAttribute('aria-hidden', 'true');
}

/* ================================================================
   ROLE BADGE HTML  (returns safe DOM element)
   ================================================================ */

/**
 * Build a role badge element.
 * @param {string} role
 * @returns {HTMLElement}
 */
function buildRoleBadge(role) {
  const classMap = {
    'OJT Student': 'student',
    'Facilitator': 'facilitator',
    'Admin':       'admin'
  };
  const cls = classMap[role] || 'student';
  return createElement('span', { className: `badge-role ${cls}` }, role);
}

/**
 * Build a status badge element.
 * @param {string} status
 * @returns {HTMLElement}
 */
function buildStatusBadge(status) {
  const classMap = {
    'Active':   'active',
    'Inactive': 'inactive',
    'Pending':  'pending'
  };
  const cls = classMap[status] || 'pending';
  return createElement('span', { className: `badge-status ${cls}` }, status || '—');
}

/* ================================================================
   INPUT VALIDATION HELPERS  (ISO 25010 – Functional Suitability)
   ================================================================ */

/**
 * Validate email format.
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Show or hide a form error element.
 * @param {string} errId    id of the error <span>
 * @param {boolean} show
 * @param {HTMLElement} [field]
 */
function setFieldError(errId, show, field) {
  const el = document.getElementById(errId);
  if (!el) return;
  if (show) {
    el.classList.add('show');
    if (field) { field.classList.add('error'); field.focus(); }
  } else {
    el.classList.remove('show');
    if (field) field.classList.remove('error');
  }
}

/**
 * Clear all field errors in a form.
 * @param {HTMLFormElement} form
 */
function clearFormErrors(form) {
  form.querySelectorAll('.form-error').forEach(e => e.classList.remove('show'));
  form.querySelectorAll('.form-control').forEach(e => e.classList.remove('error'));
}

/* ================================================================
   AUTO-GENERATE PASSWORD  (ISO 25010 – Security)
   ================================================================ */

/**
 * Generate a cryptographically random password.
 * @param {number} length
 * @returns {string}
 */
function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let result = '';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  arr.forEach(n => { result += chars[n % chars.length]; });
  return result;
}

/* ================================================================
   SIDEBAR – MOBILE TOGGLE  (ISO 25010 – Usability / Portability)
   ================================================================ */

(function initMobileMenu() {
  const btn     = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('sidebar');
  if (!btn || !sidebar) return;

  btn.addEventListener('click', () => {
    const isOpen = sidebar.classList.toggle('mobile-open');
    btn.setAttribute('aria-expanded', String(isOpen));
  });

  // Close sidebar when clicking outside on mobile
  document.addEventListener('click', e => {
    if (
      sidebar.classList.contains('mobile-open') &&
      !sidebar.contains(e.target) &&
      e.target !== btn
    ) {
      sidebar.classList.remove('mobile-open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
})();

/* ================================================================
   NOTIFICATION DROPDOWN
   ================================================================ */

(function initNotifications() {
  const btn      = document.getElementById('notifBtn');
  const dropdown = document.getElementById('notifDropdown');
  if (!btn || !dropdown) return;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = dropdown.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(isOpen));
  });

  document.addEventListener('click', e => {
    if (!dropdown.contains(e.target) && e.target !== btn) {
      dropdown.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && dropdown.classList.contains('open')) {
      dropdown.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      btn.focus();
    }
  });

  const markAll = document.getElementById('markAllRead');
  if (markAll) {
    markAll.addEventListener('click', async () => {
      try {
        await apiRequest('/api/notifications/read', { method: 'PATCH' });
        showToast('All notifications marked as read.', 'success');
        loadNotifications();
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  }

  async function loadNotifications() {
    try {
      const result = await apiRequest('/api/notifications');
      const badge = btn.querySelector('.badge');
      if (badge) badge.textContent = result.unread ? String(result.unread) : '';
      const notifications = result.notifications.slice(0, 5);
      dropdown.querySelector('.notif-empty').hidden = notifications.length > 0;
      let list = dropdown.querySelector('.notif-list');
      if (!list) {
        list = createElement('div', { className: 'notif-list' });
        dropdown.appendChild(list);
      }
      list.replaceChildren(...notifications.map((notification) => {
        const item = createElement('div', { className: 'notif-item' });
        const title = createElement('strong', {}, notification.title);
        const text = createElement('p', {}, notification.message);
        item.append(title, text);
        return item;
      }));
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
  loadNotifications();
})();

(async function loadCurrentAccount() {
  const accountLabel = document.querySelector('.topbar-user > span');
  if (!accountLabel) return;
  try {
    const result = await apiRequest('/api/me');
    accountLabel.textContent = result.user.full_name;
  } catch (error) {
    showToast(error.message, 'error');
  }
})();

/* ================================================================
   LOGOUT HANDLER  (shared across all pages)
   ================================================================ */

(function initLogout() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (!logoutBtn) return;

  logoutBtn.addEventListener('click', async () => {
    const confirmed = await openConfirm('confirmLogout', 'confirmLogoutBtn', 'cancelLogout');
    if (confirmed) {
      showToast('Logging out…', 'info', 1200);
      try {
        const response = await fetch('/logout', { method: 'POST', headers: { 'Accept': 'application/json' } });
        const result = await response.json();
        window.location.assign(result.redirect || '/');
      } catch {
        showToast('Unable to log out. Please try again.', 'error');
      }
    }
  });
})();

/* ================================================================
   KEYBOARD ACCESSIBILITY – close modals on Escape
   ================================================================ */

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.modal-overlay.open').forEach(m => {
    m.classList.remove('open');
  });
});

/* ================================================================
   EXPORTS  (namespace, so page scripts can call shared fns)
   ================================================================ */

window.CCC = {
  Store,
  USERS_KEY,
  getAllUsers,
  saveUsers,
  getUserById,
  generateId,
  formatDate,
  showToast,
  openConfirm,
  openModal,
  closeModal,
  buildRoleBadge,
  buildStatusBadge,
  isValidEmail,
  setFieldError,
  clearFormErrors,
  generatePassword,
  createElement,
  setText,
  apiRequest
};
