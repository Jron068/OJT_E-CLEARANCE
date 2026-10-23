document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("ojtForm");
  const keys = ["companyName", "contacts", "ojtProgram", "requiredHours", "ojtPeriod"];
  let saved = {};

  const fill = (info) => {
    saved = {
      companyName: info.company_name || "",
      contacts: info.contacts || "",
      ojtProgram: info.program || "",
      requiredHours: info.required_hours || "",
      ojtPeriod: info.ojt_period || ""
    };
    keys.forEach((key) => {
      const input = document.getElementById(key);
      if (input) input.value = saved[key];
    });
  };

  try {
    const result = await App.request("/api/ojt-info");
    fill(result.info);
  } catch (error) {
    App.notify(error.message);
  }

  document.getElementById("resetBtn").addEventListener("click", () => fill(saved));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    try {
      const result = await App.request("/api/ojt-info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: document.getElementById("companyName").value.trim(),
          contacts: document.getElementById("contacts").value.trim(),
          program: document.getElementById("ojtProgram").value,
          requiredHours: document.getElementById("requiredHours").value,
          ojtPeriod: document.getElementById("ojtPeriod").value.trim()
        })
      });
      App.notify(result.message);
    } catch (error) {
      App.notify(error.message);
    }
  });
});
