document.addEventListener("DOMContentLoaded", async () => {
  const personal = document.getElementById("personalForm");
  const academic = document.getElementById("academicForm");
  const fields = ["studentId", "fullName", "email", "address", "contact", "emergency", "program", "yearLevel"];
  const avatar = document.getElementById("avatarPreview");
  const name = document.getElementById("avatarName");

  const paint = (fullName) => {
    name.textContent = fullName || "Student";
    avatar.textContent = (fullName || "S").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  };

  try {
    const { profile } = await App.request("/api/profile");
    const values = {
      studentId: profile.student_number,
      fullName: profile.full_name,
      email: profile.email,
      address: profile.address,
      contact: profile.contact_number,
      emergency: profile.emergency_number,
      program: profile.program,
      yearLevel: profile.year_level
    };
    fields.forEach((id) => {
      const input = document.getElementById(id);
      if (input && values[id]) input.value = values[id];
    });
    document.getElementById("email").readOnly = true;
    paint(profile.full_name);
    if (profile.photo_url) {
      avatar.style.backgroundImage = `url("/api/profile/photo?${Date.now()}")`;
      avatar.textContent = "";
    }
  } catch (error) {
    App.notify(error.message);
  }

  const saveProfile = async () => {
    const values = Object.fromEntries(fields.map((id) => [
      id,
      document.getElementById(id)?.value.trim() || ""
    ]));
    try {
      const result = await App.request("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: values.fullName,
          studentNumber: values.studentId,
          program: values.program,
          yearLevel: values.yearLevel,
          contactNumber: values.contact,
          emergencyNumber: values.emergency,
          address: values.address
        })
      });
      paint(values.fullName);
      App.notify(result.message);
    } catch (error) {
      App.notify(error.message);
    }
  };

  personal.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (personal.reportValidity()) await saveProfile();
  });
  academic.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveProfile();
  });

  document.getElementById("photoInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      App.notify("Choose a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      App.notify("Choose an image under 2 MB.");
      return;
    }
    const data = new FormData();
    data.append("photo", file);
    try {
      await App.request("/api/profile/photo", { method: "POST", body: data });
      avatar.style.backgroundImage = `url("${URL.createObjectURL(file)}")`;
      avatar.textContent = "";
      App.notify("Profile photo saved.");
    } catch (error) {
      App.notify(error.message);
    }
  });
});
