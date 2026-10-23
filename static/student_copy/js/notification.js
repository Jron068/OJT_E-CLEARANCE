document.addEventListener("DOMContentLoaded", async () => {
  const tbody = document.getElementById("notifTbody");
  const escape = App.escapeHtml;

  const load = async () => {
    const { notifications } = await App.request("/api/notifications");
    tbody.innerHTML = notifications.length ? notifications.map((notification) => `
      <tr>
        <td>${escape(new Date(notification.sent_date).toLocaleString())}</td>
        <td><strong>${escape(notification.title)}</strong><br>${escape(notification.message)}</td>
        <td>${escape(notification.sender)}</td>
      </tr>`).join("") : `<tr><td colspan="3">No notifications.</td></tr>`;
  };

  document.getElementById("clearAllBtn").addEventListener("click", async () => {
    try {
      const result = await App.request("/api/notifications/read", { method: "PATCH" });
      App.notify(result.message);
      await load();
    } catch (error) {
      App.notify(error.message);
    }
  });

  try {
    await load();
  } catch (error) {
    App.notify(error.message);
  }
});
