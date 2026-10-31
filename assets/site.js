import { mountSunrise } from "./sunrise.mjs";

for (const mark of document.querySelectorAll("[data-sunrise-spin]")) {
  mountSunrise(mark);
}

const launchForm = document.querySelector("#launch-form");
if (launchForm) {
  const status = document.querySelector("#launch-status");
  const email = launchForm.querySelector("#launch-email");
  const state = launchForm.querySelector("#launch-state");
  const button = launchForm.querySelector("button");

  const showStatus = (message, isError) => {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
    status.hidden = false;
  };

  launchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const address = email.value.trim();
    if (address.length > 50 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(address)) {
      showStatus("Enter an email address like name@example.com, up to 50 characters.", true);
      email.focus();
      return;
    }
    if (!state.value) {
      showStatus("Choose a state.", true);
      state.focus();
      return;
    }
    button.disabled = true;
    try {
      const res = await fetch("https://api.oneplusone.dating/launch-signups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.value.trim(), state: state.value }),
      });
      if (res.ok) {
        showStatus("You're on the list. We'll email you when OnePlusOne is coming near you soon.", false);
        return;
      }
      let code = "";
      try {
        const body = await res.json();
        code = body?.error?.code || "";
      } catch {
        code = "";
      }
      if (code === "invalid_email") showStatus("Enter an email address like name@example.com, up to 50 characters.", true);
      else if (code === "invalid_state") showStatus("Choose a state.", true);
      else if (res.status === 429 || code === "rate_limited") showStatus("Too many attempts. Try again in a minute.", true);
      else showStatus("We couldn't save that. Try again.", true);
    } catch {
      showStatus("We couldn't save that. Try again.", true);
    } finally {
      button.disabled = false;
    }
  });
}

const input = document.querySelector("#help-q");
if (input) {
  const sections = [...document.querySelectorAll("[data-help-section]")];
  const empty = document.querySelector("#help-empty");

  const apply = () => {
    const query = input.value.trim().toLowerCase();
    let shown = 0;
    for (const section of sections) {
      const hit = query === "" || section.textContent.toLowerCase().includes(query);
      section.hidden = !hit;
      if (hit) shown += 1;
    }
    if (empty) empty.hidden = query === "" || shown > 0;
  };

  input.addEventListener("input", apply);
  input.form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const url = new URL(location.href);
    const query = input.value.trim();
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    history.replaceState(null, "", url);
    apply();
  });

  const initial = new URL(location.href).searchParams.get("q");
  if (initial) {
    input.value = initial;
    apply();
  }
}
