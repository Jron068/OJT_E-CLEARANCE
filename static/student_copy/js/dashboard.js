document.addEventListener("DOMContentLoaded", async () => {
  const escape = App.escapeHtml;
  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  try {
    const [documentResult, profileResult, infoResult, notificationResult] = await Promise.all([
      App.request("/api/documents"),
      App.request("/api/profile"),
      App.request("/api/ojt-info"),
      App.request("/api/notifications")
    ]);
    const documents = documentResult.documents;
    const count = (status) => documents.filter((item) => item.status === status).length;
    setText("statTotal", documents.length);
    setText("statVerified", count("Verified"));
    setText("statPending", count("Pending"));
    setText("statRevision", count("Rejected") + count("For Revision"));

    const profile = profileResult.profile;
    const info = infoResult.info;
    const subtitle = document.getElementById("pageSub");
    if (subtitle) subtitle.textContent = `Welcome back${profile.full_name ? `, ${profile.full_name}` : ""}. Here is your OJT progress.`;
    const fields = [
      ["Company", info.company_name],
      ["Program", info.program || profile.program],
      ["Required Hours", info.required_hours],
      ["OJT Period", info.ojt_period],
      ["Contacts", info.contacts]
    ];
    const infoGrid = document.getElementById("ojtInfoGrid");
    infoGrid.innerHTML = fields.map(([label, value]) =>
      `<div class="ojt-info-item"><strong>${escape(label)}</strong><p>${escape(value || "Not provided")}</p></div>`
    ).join("");

    const announcementBody = document.getElementById("annoBody");
    const notifications = notificationResult.notifications.slice(0, 5);
    announcementBody.innerHTML = notifications.length ? notifications.map((notification) =>
      `<p class="announcement-item"><strong>${escape(new Date(notification.sent_date).toLocaleString())}</strong><br>${escape(notification.title)}: ${escape(notification.message)}</p>`
    ).join("") : `<div class="empty-state"><p class="empty-state__text">No announcements or notifications yet.</p></div>`;

    const tbody = document.getElementById("docsTbody");
    const recent = documents.slice(0, 5);
    tbody.innerHTML = recent.length ? recent.map((document) =>
      `<tr><td>${escape(document.title)}</td><td>${escape(new Date(document.date_uploaded).toLocaleDateString())}</td><td>${escape(document.status)}</td><td><a href="/api/documents/${document.id}/file">Download</a></td></tr>`
    ).join("") : `<tr><td colspan="4">No documents submitted yet.</td></tr>`;
  } catch (error) {
    App.notify(error.message);
  }
});
