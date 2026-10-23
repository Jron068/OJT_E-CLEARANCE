document.addEventListener("DOMContentLoaded", async () => {
  const list = document.getElementById("studentFormsList");
  try {
    const { forms } = await App.request("/api/forms");
    list.innerHTML = forms.length ? forms.map((form) => `
      <div class="form-item" role="listitem">
        <div><strong>${App.escapeHtml(form.title)}</strong></div>
        <a class="btn btn-outline btn--sm" href="/api/forms/${form.id}/file" target="_blank" rel="noopener">Open PDF</a>
        <a class="btn btn-teal btn--sm" href="/api/forms/${form.id}/file" download>Download</a>
      </div>`).join("") : `<p class="form-hint">No OJT forms are available right now.</p>`;
  } catch (error) {
    App.notify(error.message);
  }
});
