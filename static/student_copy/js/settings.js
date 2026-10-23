document.addEventListener("DOMContentLoaded", async () => {
  const account = document.getElementById("accountForm");
  const passwordForm = document.getElementById("passwordForm");
  const newPassword = document.getElementById("newPwd");
  const strengthLabel = document.getElementById("pwdStrengthLabel");
  const message = (text) => App.notify(text);

  try {
    const { settings } = await App.request("/api/settings");
    document.getElementById("username").value = settings.username || "";
    document.getElementById("recoveryEmail").value = settings.recovery_email || "";
    document.getElementById("confirmEmail").value = settings.recovery_email || "";
  } catch (error) {
    message(error.message);
  }

  account.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!account.reportValidity()) return;
    const email = document.getElementById("recoveryEmail").value.trim();
    const confirmation = document.getElementById("confirmEmail").value.trim();
    if (email !== confirmation) {
      message("Recovery email and confirmation do not match.");
      return;
    }
    try {
      const result = await App.request("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: document.getElementById("username").value.trim(),
          recoveryEmail: email
        })
      });
      message(result.message);
    } catch (error) {
      message(error.message);
    }
  });

  newPassword.addEventListener("input", () => {
    const value = newPassword.value;
    const score = [
      value.length >= 9,
      /[A-Z]/.test(value) && /[a-z]/.test(value),
      /[^A-Za-z0-9]/.test(value)
    ].filter(Boolean).length;
    strengthLabel.textContent = value ? ["Weak", "Fair", "Strong"][Math.max(0, score - 1)] : "";
  });

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!passwordForm.reportValidity()) return;
    try {
      const result = await App.request("/api/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: document.getElementById("currentPwd").value,
          newPassword: newPassword.value,
          confirmPassword: document.getElementById("confirmPwd").value
        })
      });
      message(result.message);
      passwordForm.reset();
      strengthLabel.textContent = "";
    } catch (error) {
      message(error.message);
    }
  });
});
