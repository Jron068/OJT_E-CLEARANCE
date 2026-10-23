document.addEventListener("DOMContentLoaded", async () => {
  const $ = (selector) => document.querySelector(selector);
  const tbody = $("#documentsTbody");
  const form = $("#uploadForm");
  const fileInput = $("#docFile");
  const titleInput = $("#docTitle");
  let documents = [];

  const render = (filter = "all") => {
    const filtered = documents.filter((document) =>
      filter === "all" ||
      (filter === "revision"
        ? ["Rejected", "For Revision"].includes(document.status)
        : document.status.toLowerCase() === filter)
    );
    tbody.innerHTML = filtered.length ? filtered.map((document) => `
      <tr>
        <td>${App.escapeHtml(document.title)}</td>
        <td>${App.escapeHtml(new Date(document.date_uploaded).toLocaleDateString())}</td>
        <td><span class="status-badge">${App.escapeHtml(document.status)}</span></td>
        <td><a href="/api/documents/${document.id}/file">Download</a></td>
      </tr>`).join("") : `<tr><td colspan="4">No documents in this category.</td></tr>`;
  };

  const loadDocuments = async () => {
    const result = await App.request("/api/documents");
    documents = result.documents;
    render(document.querySelector("[data-tab].active")?.dataset.tab || "all");
  };

  try {
    const { forms } = await App.request("/api/forms");
    titleInput.replaceChildren(new Option("Select a form", ""));
    forms.forEach((form) => titleInput.add(new Option(form.title, form.title)));
  } catch (error) {
    App.notify(error.message);
  }

  $("#openUploadBtn").addEventListener("click", () => App.openModal("uploadModal"));
  $("#closeUploadBtn").addEventListener("click", () => App.closeModal("uploadModal"));
  $("#cancelUploadBtn").addEventListener("click", () => App.closeModal("uploadModal"));
  $("#docTabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (!button) return;
    document.querySelectorAll("[data-tab]").forEach((item) => {
      item.classList.toggle("active", item === button);
      item.setAttribute("aria-selected", String(item === button));
    });
    render(button.dataset.tab);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    $("#titleError").textContent = "";
    $("#fileError").textContent = "";
    const file = fileInput.files[0];
    if (!titleInput.value) {
      $("#titleError").textContent = "Please select a form.";
      return;
    }
    if (!file) {
      $("#fileError").textContent = "Please choose a file.";
      return;
    }
    if (!/\.(pdf|doc|docx|jpg|jpeg|png)$/i.test(file.name) || file.size > 10 * 1024 * 1024) {
      $("#fileError").textContent = "Choose a PDF, DOC, DOCX, JPG, or PNG file up to 10 MB.";
      return;
    }
    const body = new FormData();
    body.append("title", titleInput.value);
    body.append("file", file);
    try {
      const result = await App.request("/api/documents", { method: "POST", body });
      App.notify(result.message);
      form.reset();
      App.closeModal("uploadModal");
      await loadDocuments();
    } catch (error) {
      App.notify(error.message);
    }
  });

  try {
    await loadDocuments();
  } catch (error) {
    App.notify(error.message);
  }
});
