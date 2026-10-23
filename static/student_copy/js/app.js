/* Shared UI helpers and authenticated API access for the student portal. */
(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const icons = {
    dashboard: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="5" rx="1"/><rect x="13" y="10" width="8" height="11" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/></svg>',
    documents: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></svg>',
    forms: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="m16 3 5 5L11 18l-4 1 1-4L18 4a2.1 2.1 0 0 1 3 3"/></svg>',
    notifications: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>',
    information: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    profile: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>',
    settings: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/></svg>',
    privacy: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></svg>',
    logout: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></svg>'
  };
  const links = [
    ["Dashboard", "/student", "dashboard"],
    ["Documents", "/student/documents", "documents"],
    ["OJT Forms", "/student/forms", "forms"],
    ["Notifications", "/student/notifications", "notifications"],
    ["OJT Information", "/student/ojt-info", "information"],
    ["My Profile", "/student/profile", "profile"],
    ["Settings", "/student/settings", "settings"],
    ["Privacy Policy", "/student/privacy-policy", "privacy"]
  ];
  const current = location.pathname;
  const sidebar = $("#sidebarContainer");
  if (sidebar) {
    sidebar.innerHTML = `<aside class="sidebar" aria-label="Student navigation">
      <div class="sidebar__brand"><strong>OJT Student Portal</strong><small>City College of Calamba</small></div>
      <nav class="sidebar__nav">${links.map(([label,url,icon])=>`<a class="sidebar__link ${current===url?'active':''}" href="${url}"><span class="sidebar__icon" aria-hidden="true">${icons[icon]}</span> ${label}</a>`).join("")}
      <button class="sidebar__link" id="logoutBtn" type="button"><span class="sidebar__icon" aria-hidden="true">${icons.logout}</span> Log out</button></nav></aside>`;
  }
  const topbar = $("#topbarContainer");
  if (topbar) {
    topbar.innerHTML = `<header class="topbar"><div><strong>OJT Student</strong></div><a href="/student/profile">My Profile</a></header>`;
    fetch("/api/me")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load account.");
        topbar.querySelector("strong").textContent = result.user.full_name;
      })
      .catch((error) => console.error(error));
  }
  $("#logoutBtn")?.addEventListener("click", async () => {
    try {
      const response = await fetch("/logout", {method:"POST", headers:{Accept:"application/json"}});
      const result = await response.json();
      location.assign(result.redirect || "/");
    } catch {
      location.assign("/");
    }
  });
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: "same-origin", ...options });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "The request could not be completed.");
    return result;
  }
  window.App = {
    escapeHtml, request,
    closeModal(id) { const el=document.getElementById(id); if(el){el.classList.remove("open");el.setAttribute("aria-hidden","true");} },
    openModal(id) { const el=document.getElementById(id); if(el){el.classList.add("open");el.setAttribute("aria-hidden","false");} },
    notify(message) { let el=$("#portalToast"); if(!el){el=document.createElement("div");el.id="portalToast";el.setAttribute("role","status");el.style.cssText="position:fixed;right:20px;bottom:20px;z-index:99999;padding:12px 18px;background:#173b4f;color:white;border-radius:8px;box-shadow:0 4px 18px #0002";document.body.appendChild(el);} el.textContent=message; }
  };
})();
