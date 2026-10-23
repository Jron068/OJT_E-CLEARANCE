/**
 * create-account.js – Create Account page (2-step wizard)
 * City College of Calamba – OJT Admin System
 *
 * ISO 25010 Quality Characteristics:
 *  - Functional Suitability : 2-step role selection → form fill → persist to store
 *  - Usability              : step progress bar, role card selection, inline validation
 *  - Reliability            : guards against double submission, clears state on reset
 *  - Security               : password confirmation check, auto-gen via crypto API
 *  - Maintainability        : finite-state step machine, named event handlers
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const {
    getAllUsers, saveUsers,
    generateId, generatePassword,
    showToast, openModal, closeModal,
    isValidEmail, setFieldError, clearFormErrors,
    createElement
  } = window.CCC;

  /* ----------------------------------------------------------------
     STEP MACHINE STATE
     ---------------------------------------------------------------- */

  const STEPS = { ROLE: 1, INFO: 2 };
  let currentStep   = STEPS.ROLE;
  let selectedRole  = null;      // 'OJT Student' | 'Facilitator'
  let submitting    = false;     // guard against double-click

  /* ----------------------------------------------------------------
     DOM REFERENCES
     ---------------------------------------------------------------- */

  const stepBadge       = document.getElementById('stepBadge');
  const progressBar     = document.getElementById('stepProgressBar');
  const step1El         = document.getElementById('step1');
  const step2El         = document.getElementById('step2');
  const creatingForLbl  = document.getElementById('creatingForLabel');
  const roleSelErr      = document.getElementById('roleSelectionErr');

  const roleStudentBtn      = document.getElementById('roleStudent');
  const roleFacilitatorBtn  = document.getElementById('roleFacilitator');
  const stepNextBtn         = document.getElementById('stepNextBtn');
  const cancelStepBtn       = document.getElementById('cancelStepBtn');
  const changeRoleBtn       = document.getElementById('changeRoleBtn');

  // Step 2 form fields
  const fFullName   = document.getElementById('caFullName');
  const fDept       = document.getElementById('caDept');
  const fStatus     = document.getElementById('caStatus');
  const fUserId     = document.getElementById('caUserId');
  const fPassword   = document.getElementById('caPassword');
  const fPassConf   = document.getElementById('caPasswordConfirm');
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

  function updateDepartmentOptions(role) {
    if (!fDept) return;
    const departments = role === 'Facilitator' ? facilitatorDepartments : studentDepartments;
    fDept.replaceChildren(new Option('Select Department..', ''));
    departments.forEach(department => fDept.add(new Option(department, department)));
    fDept.value = '';
  }

  /* ----------------------------------------------------------------
     STEP NAVIGATION HELPERS
     ---------------------------------------------------------------- */

  function goToStep(step) {
    currentStep = step;
    const isStep2 = step === STEPS.INFO;

    // Update badge text
    if (stepBadge) stepBadge.textContent = `Step ${step} of 2`;

    // Update progress bar (50% step1, 100% step2)
    if (progressBar) {
      progressBar.style.width = isStep2 ? '100%' : '50%';
      progressBar.parentElement?.setAttribute('aria-valuenow', isStep2 ? '100' : '50');
    }

    // Show/hide step panels
    if (step1El) step1El.style.display = isStep2 ? 'none' : '';
    if (step2El) step2El.style.display = isStep2 ? ''     : 'none';

    // Update next/finish button label
    if (stepNextBtn) {
      if (isStep2) {
        stepNextBtn.innerHTML =
          '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Complete Account Creation';
      } else {
        stepNextBtn.innerHTML =
          'Continue to Information <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';
      }
    }

    // Focus management (ISO 25010 – Usability / Accessibility)
    if (isStep2) {
      setTimeout(() => fFullName?.focus(), 50);
    } else {
      setTimeout(() => roleStudentBtn?.focus(), 50);
    }
  }

  /* ----------------------------------------------------------------
     ROLE CARD SELECTION
     ---------------------------------------------------------------- */

  function selectRole(role) {
    selectedRole = role;
    updateDepartmentOptions(role);
    if (roleSelErr) roleSelErr.style.display = 'none';

    // Update ARIA and visual state for both cards
    [roleStudentBtn, roleFacilitatorBtn].forEach(btn => {
      if (!btn) return;
      const isSelected = btn.dataset.role === role;
      btn.classList.toggle('selected', isSelected);
      btn.setAttribute('aria-checked', String(isSelected));
    });

    if (creatingForLbl) creatingForLbl.textContent = role;
  }

  roleStudentBtn?.addEventListener('click', () => selectRole('OJT Student'));
  roleFacilitatorBtn?.addEventListener('click', () => selectRole('Facilitator'));

  // Keyboard: space/enter toggles selection on role cards
  [roleStudentBtn, roleFacilitatorBtn].forEach(btn => {
    btn?.addEventListener('keydown', e => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        btn.click();
      }
    });
  });

  /* ----------------------------------------------------------------
     STEP NEXT / COMPLETE
     ---------------------------------------------------------------- */

  stepNextBtn?.addEventListener('click', () => {
    if (currentStep === STEPS.ROLE) {
      handleStep1Next();
    } else {
      handleStep2Submit();
    }
  });

  function handleStep1Next() {
    if (!selectedRole) {
      if (roleSelErr) roleSelErr.style.display = 'block';
      roleStudentBtn?.focus();
      return;
    }
    goToStep(STEPS.INFO);
  }

  /* ----------------------------------------------------------------
     STEP 2 VALIDATION & SUBMISSION
     ---------------------------------------------------------------- */

  async function handleStep2Submit() {
    if (submitting) return;

    const form = document.getElementById('createAccountForm');
    clearFormErrors(form);

    let valid = true;

    if (!fFullName?.value.trim()) {
      setFieldError('caNameErr', true, fFullName);
      valid = false;
    }
    if (!fDept?.value) {
      setFieldError('caDeptErr', true, fDept);
      valid = false;
    }
    if (!fStatus?.value) {
      setFieldError('caStatusErr', true, fStatus);
      valid = false;
    }
    if (!fUserId?.value.trim()) {
      setFieldError('caUserIdErr', true, fUserId);
      valid = false;
    }
    if (!fPassword?.value || fPassword.value.length < 9 || !/[a-z]/.test(fPassword.value) ||
        !/[A-Z]/.test(fPassword.value) || !/[^A-Za-z0-9]/.test(fPassword.value)) {
      setFieldError('caPasswordErr', true, fPassword);
      const errEl = document.getElementById('caPasswordErr');
      if (errEl) errEl.textContent = 'Use at least 9 characters, including uppercase, lowercase, and a special character.';
      valid = false;
    } else if (fPassword.value !== fPassConf?.value) {
      setFieldError('caPasswordErr', true, fPassConf);
      const errEl = document.getElementById('caPasswordErr');
      if (errEl) errEl.textContent = 'Passwords do not match.';
      valid = false;
    }

    if (!valid) return;

    // Build new user record
    const newUser = {
      fullName:    fFullName.value.trim(),
      role:        selectedRole,
      email:       `${fUserId.value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')}@ccc.edu.ph`,
      department:  fDept.value,
      userId:      fUserId.value.trim(),
      status:      fStatus.value
    };

    submitting = true;
    try {
      const result = await window.CCC.apiRequest('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newUser,
          userId: fUserId.value.trim(),
          department: fDept.value,
          password: fPassword.value
        })
      });
      newUser.id = result.id;
      const users = getAllUsers();
      users.push(newUser);
      saveUsers(users);
    } catch (error) {
      submitting = false;
      showToast(error.message, 'error');
      return;
    }
    submitting = false;

    // Show success modal
    const successMsg = document.getElementById('successMessage');
    if (successMsg) {
      successMsg.textContent =
        `${selectedRole} account for "${newUser.fullName}" created successfully!`;
    }
    openModal('successModal');
  }

  /* ----------------------------------------------------------------
     CANCEL / CHANGE ROLE
     ---------------------------------------------------------------- */

  cancelStepBtn?.addEventListener('click', () => {
    resetWizard();
    window.location.href = 'user-management.html';
  });

  changeRoleBtn?.addEventListener('click', () => {
    const form = document.getElementById('createAccountForm');
    if (form) clearFormErrors(form);
    goToStep(STEPS.ROLE);
  });

  /* ----------------------------------------------------------------
     SUCCESS MODAL – CLOSE & CREATE ANOTHER
     ---------------------------------------------------------------- */

  document.getElementById('closeSuccessModal')?.addEventListener('click', () => {
    closeModal('successModal');
    resetWizard();
  });

  document.getElementById('createAnotherBtn')?.addEventListener('click', () => {
    closeModal('successModal');
    resetWizard();
  });

  /* ----------------------------------------------------------------
     RESET WIZARD STATE
     ---------------------------------------------------------------- */

  function resetWizard() {
    selectedRole = null;
    submitting   = false;

    // Deselect role cards
    [roleStudentBtn, roleFacilitatorBtn].forEach(btn => {
      btn?.classList.remove('selected');
      btn?.setAttribute('aria-checked', 'false');
    });

    // Clear form
    const form = document.getElementById('createAccountForm');
    if (form) {
      form.reset();
      clearFormErrors(form);
    }

    if (creatingForLbl) creatingForLbl.textContent = '—';
    if (roleSelErr) roleSelErr.style.display = 'none';

    goToStep(STEPS.ROLE);
  }

  /* ----------------------------------------------------------------
     PASSWORD STRENGTH INDICATOR  (ISO 25010 – Security / Usability)
     ---------------------------------------------------------------- */

  fPassword?.addEventListener('input', () => {
    const val = fPassword.value;
    let strength = 0;
    if (val.length >= 8)              strength++;
    if (/[A-Z]/.test(val))            strength++;
    if (/[0-9]/.test(val))            strength++;
    if (/[^A-Za-z0-9]/.test(val))     strength++;

    // Reflect strength via border color
    const colors = ['', '#e53935', '#ff7043', '#fdd835', '#2e7d32'];
    fPassword.style.borderColor = colors[strength] || '';
  });

  // Reset border on blur
  fPassword?.addEventListener('blur', () => {
    fPassword.style.borderColor = '';
  });

  /* ----------------------------------------------------------------
     KEYBOARD: Confirm password on Enter
     ---------------------------------------------------------------- */

  fPassConf?.addEventListener('keydown', e => {
    if (e.key === 'Enter') stepNextBtn?.click();
  });

  /* ----------------------------------------------------------------
     INIT
     ---------------------------------------------------------------- */

  goToStep(STEPS.ROLE);
});
