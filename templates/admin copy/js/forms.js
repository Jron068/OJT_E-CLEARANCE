'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const list = document.getElementById('adminFormsList');
  const form = document.getElementById('adminFormUpload');
  const title = document.getElementById('formTitle');
  const audience = document.getElementById('formAudience');
  const file = document.getElementById('formFile');

  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
    return result;
  }

  async function loadForms() {
    const result = await request('/api/forms');
    list.replaceChildren();
    if (!result.forms.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No active forms are available.';
      list.appendChild(empty);
      return;
    }
    result.forms.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'form-item';
      row.setAttribute('role', 'listitem');
      const icon = document.createElement('i');
      icon.className = 'fa-regular fa-file-pdf';
      icon.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = `${item.title} — ${item.audience}`;
      const link = document.createElement('a');
      link.className = 'download-btn';
      link.href = `/api/forms/${item.id}/file`;
      link.setAttribute('aria-label', `Download ${item.title}`);
      link.innerHTML = '<i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i>';
      const remove = document.createElement('button');
      remove.className = 'download-btn';
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${item.title}`);
      remove.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
      remove.addEventListener('click', async () => {
        if (!window.confirm(`Remove "${item.title}" from the portal?`)) return;
        try {
          const response = await request(`/api/forms/${item.id}`, { method: 'DELETE' });
          window.showToast(response.message, 'success');
          await loadForms();
        } catch (error) {
          window.showToast(error.message, 'error');
        }
      });
      row.append(icon, label, link, remove);
      list.appendChild(row);
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const body = new FormData();
    body.append('title', title.value.trim());
    body.append('audience', audience.value);
    body.append('file', file.files[0]);
    try {
      const result = await request('/api/forms', { method: 'POST', body });
      window.showToast(result.message, 'success');
      form.reset();
      await loadForms();
    } catch (error) {
      window.showToast(error.message, 'error');
    }
  });

  loadForms().catch((error) => window.showToast(error.message, 'error'));
});
