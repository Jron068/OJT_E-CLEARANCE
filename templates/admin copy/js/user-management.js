/**
 * user-management.js – User Management page logic
 * City College of Calamba – OJT Admin System
 *
 * ISO 25010 Quality Characteristics:
 *  - Functional Suitability : full CRUD on user records (create via other page,
 *                             edit & delete here), role/search filter
 *  - Usability              : modal form with inline validation, confirm on delete
 *  - Reliability            : safe DOM updates, error handling
 *  - Security               : input sanitisation, password auto-gen via crypto API
 *  - Maintainability        : separated concerns, named functions
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const {
    getAllUsers, saveUsers, getUserById,
    formatDate, buildRoleBadge, buildStatusBadge,
    createElement, setText,
    showToast, openConfirm, openModal, closeModal,
    isValidEmail, setFieldError, clearFormErrors,
    generatePassword, generateId
  } = window.CCC;

  /* ----------------------------------------------------------------
     STATE
     ---------------------------------------------------------------- */

  const PAGE_SIZE    = 8;
  let currentPage    = 1;
  let filteredUsers  = [];
  let pendingDeleteId = null;
  let assignmentFacilitatorId = null;
  let assignmentStudents = [];
  let assignedStudentIds = new Set();

  /* ----------------------------------------------------------------
     DOM REFERENCES
     ---------------------------------------------------------------- */

  const tbody         = document.getElementById('umTableBody');
  const searchInput   = document.getElementById('umSearch');
  const roleFilter    = document.getElementById('roleFilter');
  const umCount       = document.getElementById('umCount');
  const pagination    = document.getElementById('paginationControls');

  // Edit modal fields
  const editModal       = document.getElementById('editModal');
  const closeEditBtn    = document.getElementById('closeEditModal');
  const cancelEditBtn   = document.getElementById('cancelEditBtn');
  const saveAccountBtn  = document.getElementById('saveAccountBtn');
  const autoGenBtn      = document.getElementById('autoGenPassword');

  const fUserId    = document.getElementById('editUserId');
  const fRole      = document.getElementById('editRole');
  const fStatus    = document.getElementById('editStatus');
  const fFullName  = document.getElementById('editFullName');
  const fDept      = document.getElementById('editDept');
  const fEmail     = document.getElementById('editEmail');
  const fPassword  = document.getElementById('editPassword');
  const assignStudentsModal = document.getElementById('assignStudentsModal');
  const assignmentStudentList = document.getElementById('assignmentStudentList');
  const assignmentDepartmentFilter = document.getElementById('assignmentDepartmentFilter');
  const assignmentStudentSearch = document.getElementById('assignmentStudentSearch');
  const studentDepartments = [
    'Computing and Informatics',
    'Business Administration',
    'Education',
    'Engineering',
    'Nursing'
  ];
  const facilitatorDepartments = [
    'Information Technology',
    'Computer Science',
    'Accounting',
    'Education',
    'Psychology'
  ];

  function updateDepartmentOptions(role, selectedDepartment = '') {
    const departments = role === 'Facilitator' ? facilitatorDepartments : studentDepartments;
    fDept.replaceChildren(new Option('Select Department..', ''));
    departments.forEach(department => fDept.add(new Option(department, department)));
    if (selectedDepartment && !departments.includes(selectedDepartment)) {
      fDept.add(new Option(selectedDepartment, selectedDepartment));
    }
    fDept.value = selectedDepartment;
  }

  fRole?.addEventListener('change', () => updateDepartmentOptions(fRole.value));

  /* ----------------------------------------------------------------
     FILTER & SEARCH
     ---------------------------------------------------------------- */

  function applyFilters() {
    const q    = (searchInput?.value || '').trim().toLowerCase();
    const role = (roleFilter?.value  || '').trim();
    const all  = getAllUsers();

    filteredUsers = all.filter(u => {
      const matchQ = !q || (
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)    ||
        (u.userId || '').toLowerCase().includes(q)
      );
      const matchRole = !role || u.role === role;
      return matchQ && matchRole;
    });

    currentPage = 1;
    renderTable();
    renderPagination();
  }

  // Debounce helper (ISO 25010 – Performance Efficiency)
  let searchTimer;
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, 250);
  });
  searchInput?.addEventListener('keydown', e => {
    if (e.key === 'Escape') { searchInput.value = ''; applyFilters(); }
  });
  roleFilter?.addEventListener('change', applyFilters);

  /* ----------------------------------------------------------------
     RENDER TABLE
     ---------------------------------------------------------------- */

  function renderTable() {
    if (!tbody) return;

    // Clear table safely
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

    // Paginate
    const start = (currentPage - 1) * PAGE_SIZE;
    const slice = filteredUsers.slice(start, start + PAGE_SIZE);

    // Update count label
    if (umCount) {
      umCount.textContent = `Showing ${filteredUsers.length} user${filteredUsers.length !== 1 ? 's' : ''}`;
    }

    if (slice.length === 0) {
      const tr = createElement('tr');
      const td = document.createElement('td');
      td.setAttribute('colspan', '6');
      td.className = 'empty-state';

      const icon = createElement('div', { className: 'empty-icon' }, '👤');
      const msg  = createElement('p', {}, 'No users match your search. Try a different filter.');
      td.appendChild(icon);
      td.appendChild(msg);
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    slice.forEach(user => {
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

      // Status
      const tdStatus = createElement('td');
      tdStatus.appendChild(buildStatusBadge(user.status));

      // Date
      const tdDate = createElement('td');
      tdDate.textContent = formatDate(user.dateCreated);

      // Actions
      const tdAction = createElement('td');
      tdAction.className = 'action-cell';

      const editBtn = createElement('button', {
        className: 'btn-icon edit',
        type: 'button',
        'data-id': user.id,
        'aria-label': `Edit ${user.fullName}`
      });
      editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>';
      editBtn.addEventListener('click', () => openEditModal(user.id));

      const delBtn = createElement('button', {
        className: 'btn-icon del',
        type: 'button',
        'data-id': user.id,
        'aria-label': `Delete ${user.fullName}`
      });
      delBtn.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
      delBtn.addEventListener('click', () => triggerDelete(user.id, user.fullName));

      tdAction.appendChild(editBtn);
      if (user.role === 'Facilitator') {
        const assignBtn = createElement('button', {
          className: 'btn-icon assign',
          type: 'button',
          'aria-label': `Assign students to ${user.fullName}`
        });
        assignBtn.innerHTML = '<i class="fa-solid fa-user-group" aria-hidden="true"></i>';
        assignBtn.addEventListener('click', () => openAssignments(user));
        tdAction.appendChild(assignBtn);
      }
      tdAction.appendChild(delBtn);

      tr.appendChild(tdName);
      tr.appendChild(tdRole);
      tr.appendChild(tdEmail);
      tr.appendChild(tdStatus);
      tr.appendChild(tdDate);
      tr.appendChild(tdAction);
      tbody.appendChild(tr);
    });
  }

  /* ----------------------------------------------------------------
     PAGINATION  (ISO 25010 – Usability)
     ---------------------------------------------------------------- */

  function renderPagination() {
    if (!pagination) return;
    while (pagination.firstChild) pagination.removeChild(pagination.firstChild);

    const totalPages = Math.ceil(filteredUsers.length / PAGE_SIZE);
    if (totalPages <= 1) return;

    // Prev
    const prevBtn = createElement('button', {
      className: 'btn btn-outline btn-sm',
      'aria-label': 'Previous page'
    }, '‹');
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', () => { currentPage--; renderTable(); renderPagination(); });
    pagination.appendChild(prevBtn);

    // Page numbers (show at most 5 around current)
    const range = buildPageRange(currentPage, totalPages);
    range.forEach(page => {
      if (page === '…') {
        const el = createElement('span', { style: 'padding:0 .25rem; line-height:2;' }, '…');
        pagination.appendChild(el);
        return;
      }
      const btn = createElement('button', {
        className: `btn btn-sm ${page === currentPage ? 'btn-primary' : 'btn-outline'}`,
        'aria-label': `Page ${page}`,
        'aria-current': page === currentPage ? 'page' : undefined
      }, String(page));
      if (page === currentPage) btn.setAttribute('aria-current', 'page');
      btn.addEventListener('click', () => {
        currentPage = page;
        renderTable();
        renderPagination();
      });
      pagination.appendChild(btn);
    });

    // Next
    const nextBtn = createElement('button', {
      className: 'btn btn-outline btn-sm',
      'aria-label': 'Next page'
    }, '›');
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.addEventListener('click', () => { currentPage++; renderTable(); renderPagination(); });
    pagination.appendChild(nextBtn);
  }

  function buildPageRange(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = [1];
    if (current > 3) pages.push('…');
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
      pages.push(i);
    }
    if (current < total - 2) pages.push('…');
    pages.push(total);
    return pages;
  }

  async function openAssignments(facilitator) {
    try {
      const result = await window.CCC.apiRequest(
        `/api/users/${encodeURIComponent(facilitator.id)}/students`
      );
      assignmentFacilitatorId = facilitator.id;
      assignmentStudents = result.students;
      assignedStudentIds = new Set(
        result.students.filter(student => student.assigned).map(student => Number(student.id))
      );
      document.getElementById('assignStudentsFacilitator').textContent =
        `Select the student accounts handled by ${facilitator.fullName}. Student ID and department are shown for identification.`;
      assignmentDepartmentFilter.replaceChildren(new Option('All departments', ''));
      [...new Set(assignmentStudents.map(student => student.department).filter(Boolean))]
        .sort()
        .forEach(department => assignmentDepartmentFilter.add(new Option(department, department)));
      assignmentDepartmentFilter.value = '';
      assignmentStudentSearch.value = '';
      renderAssignmentStudents();
      assignStudentsModal.classList.add('open');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  function renderAssignmentStudents() {
    assignmentStudentList.replaceChildren();
    const department = assignmentDepartmentFilter.value;
    const search = assignmentStudentSearch.value.trim().toLowerCase();
    const visibleStudents = assignmentStudents.filter(student =>
      (!department || student.department === department) &&
      (!search || `${student.fullName} ${student.studentId || ''}`.toLowerCase().includes(search))
    );
    if (!visibleStudents.length) {
      assignmentStudentList.appendChild(
        createElement('p', { className: 'form-hint' }, 'No active student accounts are available for this department.')
      );
      return;
    }
    visibleStudents.forEach(student => {
      const label = createElement('label', { className: 'assignment-student-option' });
      const checkbox = createElement('input', {
        type: 'checkbox',
        value: String(student.id),
        'aria-label': `Assign ${student.fullName}`
      });
      checkbox.checked = assignedStudentIds.has(Number(student.id));
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) assignedStudentIds.add(Number(student.id));
        else assignedStudentIds.delete(Number(student.id));
      });
      const details = createElement('span');
      details.appendChild(createElement('strong', {}, student.fullName));
      details.appendChild(createElement(
        'small',
        {},
        `Student ID: ${student.studentId || 'Not set'} · Department: ${student.department || 'Not set'}`
      ));
      label.append(checkbox, details);
      assignmentStudentList.appendChild(label);
    });
  }

  function closeAssignments() {
    assignStudentsModal.classList.remove('open');
    assignmentFacilitatorId = null;
    assignmentStudents = [];
    assignedStudentIds.clear();
  }

  document.getElementById('closeAssignStudentsModal')?.addEventListener('click', closeAssignments);
  document.getElementById('cancelAssignStudentsBtn')?.addEventListener('click', closeAssignments);
  assignmentDepartmentFilter?.addEventListener('change', renderAssignmentStudents);
  assignmentStudentSearch?.addEventListener('input', renderAssignmentStudents);
  assignStudentsModal?.addEventListener('click', event => {
    if (event.target === assignStudentsModal) closeAssignments();
  });
  document.getElementById('saveAssignStudentsBtn')?.addEventListener('click', async () => {
    if (assignmentFacilitatorId === null) return;
    try {
      const result = await window.CCC.apiRequest(
        `/api/users/${encodeURIComponent(assignmentFacilitatorId)}/students`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentIds: [...assignedStudentIds] })
        }
      );
      closeAssignments();
      showToast(result.message, 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  /* ----------------------------------------------------------------
     EDIT MODAL – OPEN
     ---------------------------------------------------------------- */

  function openEditModal(userId) {
    const user = getUserById(userId);
    if (!user) { showToast('User not found.', 'error'); return; }

    // Populate fields
    fUserId.value   = user.id;
    fRole.value     = user.role    || '';
    fStatus.value   = user.status  || '';
    fFullName.value = user.fullName|| '';
    updateDepartmentOptions(user.role, user.department || '');
    fEmail.value    = user.email   || '';
    fPassword.value = '';  // never pre-fill password

    if (editModal) {
      clearFormErrors(document.getElementById('editUserForm'));
      editModal.classList.add('open');
      // Focus first interactive element
      setTimeout(() => fRole?.focus(), 50);
    }
  }

  /* ----------------------------------------------------------------
     EDIT MODAL – CLOSE
     ---------------------------------------------------------------- */

  function closeEditModal() {
    if (editModal) editModal.classList.remove('open');
  }

  closeEditBtn?.addEventListener('click',  closeEditModal);
  cancelEditBtn?.addEventListener('click', closeEditModal);

  // Close on overlay backdrop click
  editModal?.addEventListener('click', e => {
    if (e.target === editModal) closeEditModal();
  });

  /* ----------------------------------------------------------------
     AUTO-GENERATE PASSWORD
     ---------------------------------------------------------------- */

  autoGenBtn?.addEventListener('click', () => {
    const pwd = generatePassword(14);
    if (fPassword) {
      fPassword.value = pwd;
      fPassword.type  = 'text'; // Reveal generated value briefly
      showToast('Password auto-generated. Copy it before saving.', 'info', 4000);
      setTimeout(() => { if (fPassword) fPassword.type = 'password'; }, 4000);
    }
  });

  /* ----------------------------------------------------------------
     SAVE EDITED ACCOUNT  (ISO 25010 – Functional Suitability)
     ---------------------------------------------------------------- */

  saveAccountBtn?.addEventListener('click', async () => {
    const form = document.getElementById('editUserForm');
    clearFormErrors(form);

    let valid = true;

    if (!fRole.value) {
      setFieldError('editRoleErr', true, fRole);
      valid = false;
    }
    if (!fFullName.value.trim()) {
      setFieldError('editNameErr', true, fFullName);
      valid = false;
    }
    if (!fDept.value) {
      setFieldError('editDeptErr', true, fDept);
      valid = false;
    }
    if (!fEmail.value.trim() || !isValidEmail(fEmail.value)) {
      setFieldError('editEmailErr', true, fEmail);
      valid = false;
    }

    if (!valid) return;

    const users = getAllUsers();
    const idx   = users.findIndex(u => String(u.id) === String(fUserId.value));
    if (idx === -1) { showToast('User not found.', 'error'); return; }

    // Check email uniqueness (exclude self)
    const emailConflict = users.some(u => u.email === fEmail.value.trim() && u.id !== fUserId.value);
    if (emailConflict) {
      setFieldError('editEmailErr', true, fEmail);
      showToast('That email is already in use.', 'error');
      return;
    }

    // Apply updates
    users[idx] = {
      ...users[idx],
      role:       fRole.value,
      status:     fStatus.value || users[idx].status,
      fullName:   fFullName.value.trim(),
      department: fDept.value,
      email:      fEmail.value.trim()
    };

    // Only update password if something was entered
    if (fPassword.value.trim()) {
      // In a real app this would be hashed server-side.
      // Here we just acknowledge that it was set.
      users[idx].passwordUpdated = new Date().toISOString();
    }

    try {
      await window.CCC.apiRequest(`/api/users/${encodeURIComponent(fUserId.value)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: users[idx].fullName,
          email: users[idx].email,
          role: users[idx].role,
          status: users[idx].status,
          department: users[idx].department,
          password: fPassword.value || undefined
        })
      });
      if (fPassword.value) delete users[idx].password;
      saveUsers(users);
    } catch (error) {
      showToast(error.message, 'error');
      return;
    }
    closeEditModal();
    applyFilters();
    showToast(`${users[idx].fullName} updated successfully.`, 'success');
  });

  /* ----------------------------------------------------------------
     DELETE  (ISO 25010 – Usability: confirmation before destructive op)
     ---------------------------------------------------------------- */

  async function triggerDelete(userId, name) {
    pendingDeleteId = userId;

    const msg = document.getElementById('confirmDeleteMsg');
    if (msg) msg.textContent = `Are you sure you want to delete "${name}"? This cannot be undone.`;

    const confirmed = await openConfirm('confirmDelete', 'confirmDeleteBtn', 'cancelDeleteBtn');
    if (!confirmed) { pendingDeleteId = null; return; }

    try {
      await window.CCC.apiRequest(`/api/users/${encodeURIComponent(pendingDeleteId)}`, { method: 'DELETE' });
      const users = getAllUsers().filter(u => String(u.id) !== String(pendingDeleteId));
      saveUsers(users);
      pendingDeleteId = null;
      applyFilters();
      showToast(`"${name}" has been deleted.`, 'success');
    } catch (error) {
      pendingDeleteId = null;
      showToast(error.message, 'error');
    }
  }

  /* ----------------------------------------------------------------
     CROSS-TAB SYNC  (ISO 25010 – Reliability)
     ---------------------------------------------------------------- */

  /* ----------------------------------------------------------------
     INIT
     ---------------------------------------------------------------- */
  window.CCC.apiRequest('/api/users')
    .then(result => {
      saveUsers(result.users);
      applyFilters();
    })
    .catch(error => showToast(error.message, 'error'));
});
