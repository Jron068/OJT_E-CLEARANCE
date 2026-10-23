/**
 * dashboard.js – Dashboard page logic
 * City College of Calamba – OJT Admin System
 *
 * ISO 25010 Quality Characteristics:
 *  - Functional Suitability : displays correct aggregated counts & recent users
 *  - Performance Efficiency : renders only the 10 most recent users (preview)
 *  - Usability              : live search filtering, animated stat counters
 *  - Reliability            : graceful empty state when no users exist
 */

'use strict';

/* ================================================================
   WAIT FOR DOM
   ================================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const { getAllUsers, formatDate, buildRoleBadge, createElement, setText } = window.CCC;

  /* ----------------------------------------------------------------
     STAT CARDS – animated counter (ISO 25010 – Usability / UX)
     ---------------------------------------------------------------- */

  function animateCount(el, target, duration = 600) {
    let start = null;
    const from = 0;

    function step(ts) {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      // Ease-out quad
      const eased = 1 - Math.pow(1 - progress, 2);
      setText(el, String(Math.round(from + (target - from) * eased)));
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  function updateStats() {
    const users = getAllUsers();
    const students    = users.filter(u => u.role === 'OJT Student').length;
    const facilitators= users.filter(u => u.role === 'Facilitator').length;
    const total       = users.length;

    const elTotal = document.getElementById('statTotalUsers');
    const elStu   = document.getElementById('statStudents');
    const elFac   = document.getElementById('statFacilitators');

    if (elTotal) animateCount(elTotal, total);
    if (elStu)   animateCount(elStu,   students);
    if (elFac)   animateCount(elFac,   facilitators);
  }

  /* ----------------------------------------------------------------
     TABLE RENDERING
     ---------------------------------------------------------------- */

  /**
   * Render a subset of users into the dashboard preview table.
   * @param {Array} users
   */
  function renderTable(users) {
    const tbody = document.getElementById('dashTableBody');
    if (!tbody) return;

    // Clear safely (no innerHTML)
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

    if (users.length === 0) {
      const tr = createElement('tr');
      const td = createElement('td', { colspan: '5', className: 'empty-state' });
      td.setAttribute('colspan', '5');

      const icon = createElement('div', { className: 'empty-icon' }, '👤');
      const msg  = createElement('p', {}, 'No users found. Create one to get started.');
      td.appendChild(icon);
      td.appendChild(msg);
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    // Show only the 10 most recent (by dateCreated desc)
    const preview = [...users]
      .sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated))
      .slice(0, 10);

    preview.forEach(user => {
      const tr = createElement('tr');

      // Full Name
      const tdName = createElement('td');
      tdName.textContent = user.fullName;

      // Role
      const tdRole = createElement('td');
      tdRole.appendChild(buildRoleBadge(user.role));

      // Email
      const tdEmail = createElement('td');
      tdEmail.textContent = user.email;

      // Date Created
      const tdDate = createElement('td');
      tdDate.textContent = formatDate(user.dateCreated);

      // Action
      const tdAction = createElement('td');
      const viewLink = createElement('a', {
        href: 'user-management.html',
        className: 'btn btn-outline btn-sm',
        'aria-label': `View user ${user.fullName}`
      }, 'View');
      tdAction.appendChild(viewLink);

      tr.appendChild(tdName);
      tr.appendChild(tdRole);
      tr.appendChild(tdEmail);
      tr.appendChild(tdDate);
      tr.appendChild(tdAction);
      tbody.appendChild(tr);
    });
  }

  /* ----------------------------------------------------------------
     LIVE SEARCH
     ---------------------------------------------------------------- */

  let allUsers = [];

  function applySearch(query) {
    const q = query.trim().toLowerCase();
    if (!q) return renderTable(allUsers);

    const filtered = allUsers.filter(u =>
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)    ||
      u.role.toLowerCase().includes(q)
    );
    renderTable(filtered);
  }

  const searchInput = document.getElementById('dashSearch');
  if (searchInput) {
    // Debounce for performance (ISO 25010 – Performance Efficiency)
    let debounceTimer;
    searchInput.addEventListener('input', e => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => applySearch(e.target.value), 250);
    });
    // Clear on Escape
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        applySearch('');
      }
    });
  }

  /* ----------------------------------------------------------------
     INIT
     ---------------------------------------------------------------- */

  window.CCC.apiRequest('/api/users')
    .then(result => {
      allUsers = result.users;
      window.CCC.saveUsers(allUsers);
      updateStats();
      applySearch(searchInput ? searchInput.value : '');
    })
    .catch(error => window.CCC.showToast(error.message, 'error'));

  document.getElementById('adminAnnouncementForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    try {
      const result = await window.CCC.apiRequest('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: document.getElementById('adminAnnouncementSubject').value.trim(),
          message: document.getElementById('adminAnnouncementMessage').value.trim(),
          targetRole: document.getElementById('adminAnnouncementAudience').value
        })
      });
      window.CCC.showToast(result.message, 'success');
      form.reset();
    } catch (error) {
      window.CCC.showToast(error.message, 'error');
    }
  });
});
