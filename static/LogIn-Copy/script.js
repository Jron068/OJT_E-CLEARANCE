const form = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const toggleBtn = document.getElementById('togglePassword');
const eyeIcon = document.getElementById('eye-icon');
const btnLogin = document.getElementById('btnLogin');
const btnText = btnLogin.querySelector('.btn-text');
const btnLoader = btnLogin.querySelector('.btn-loader');
const loginAlert = document.getElementById('loginAlert');

const EYE_OPEN = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
const EYE_CLOSED = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>`;

toggleBtn.addEventListener('click', () => {
  const hidden = passwordInput.type === 'password';
  passwordInput.type = hidden ? 'text' : 'password';
  eyeIcon.innerHTML = hidden ? EYE_CLOSED : EYE_OPEN;
  toggleBtn.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
});

function setError(field, message) {
  document.getElementById(`group-${field}`).classList.add('invalid');
  document.getElementById(`error-${field}`).textContent = message;
}

function clearError(field) {
  document.getElementById(`group-${field}`).classList.remove('invalid');
  document.getElementById(`error-${field}`).textContent = '';
}

function validate() {
  let valid = true;
  if (!usernameInput.value.trim()) {
    setError('username', 'Username is required.');
    valid = false;
  } else clearError('username');

  if (!passwordInput.value) {
    setError('password', 'Password is required.');
    valid = false;
  } else if (passwordInput.value.length < 6) {
    setError('password', 'Password must be at least 6 characters.');
    valid = false;
  } else clearError('password');
  return valid;
}

function showAlert(message, type = 'error') {
  loginAlert.textContent = message;
  loginAlert.className = `alert ${type}`;
  loginAlert.hidden = false;
}

function hideAlert() {
  loginAlert.hidden = true;
  loginAlert.className = 'alert';
}

usernameInput.addEventListener('input', () => clearError('username'));
passwordInput.addEventListener('input', () => clearError('password'));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideAlert();
  if (!validate()) return;

  btnText.textContent = 'Signing inâ€¦';
  btnLoader.hidden = false;
  btnLogin.disabled = true;
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: usernameInput.value.trim(), password: passwordInput.value })
    });
    const user = await response.json();
    if (!response.ok) throw new Error(user.error || 'Unable to sign in.');

    showAlert(`Welcome, ${user.email}! Logged in as ${user.role}.`, 'success');
    form.reset();
    setTimeout(() => { window.location.href = user.redirect; }, 800);
  } catch (error) {
    showAlert(error.message || 'Unable to sign in.');
  } finally {
    btnText.textContent = 'Sign In';
    btnLoader.hidden = true;
    btnLogin.disabled = false;
  }
});
